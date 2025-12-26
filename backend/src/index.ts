import express, { Application } from 'express';
import cors from 'cors';
import http from 'http';
import { config, validateConfig } from './config';
import { logger } from './utils/logger';
import { sippClient } from './services/sipp-client';
import { sippProcessManager } from './services/sipp-process';
import { slaveConnectionService } from './services/heartbeat';
import { masterRegistryService } from './services/master-registry';
import { slaveManager } from './services/slave-manager';
import { WebSocketService } from './websocket';
import { testConnection, initializeDatabase } from './database';
import { taskHistoryRepository } from './database/task-history-repository';
import apiRouter from './api/routes';
import path from 'path';
import fs from 'fs';
import { execSync } from 'child_process';

/**
 * SIPp Web Manager 后端服务
 * 遵循SOLID原则的主应用入口
 */
class SippWebManagerApp {
  private app: Application;
  private server: http.Server;
  private wsService: WebSocketService;

  constructor() {
    this.app = express();
    this.server = http.createServer(this.app);
    this.wsService = new WebSocketService(this.server);

    this.initialize();
  }

  /**
   * 初始化应用
   */
  private async initialize(): Promise<void> {
    try {
      // 验证配置
      validateConfig();

      // 创建必要的目录
      this.createDirectories();

      // 初始化数据库连接
      await this.initializeDatabase();

      // 配置中间件
      this.setupMiddlewares();

      // 配置路由
      this.setupRoutes();

      // 依赖注入：注入 WebSocketService 到 SlaveManager（主机模式）
      if (config.node.role === 'master') {
        slaveManager.setWebSocketService(this.wsService);
        logger.info('WebSocketService injected into SlaveManager');
      }

      // 连接SIPp
      this.connectToSipp();

      // 启动服务
      await this.start();
    } catch (error) {
      logger.error('Failed to initialize application:', error);
      process.exit(1);
    }
  }

  /**
   * 初始化数据库
   */
  private async initializeDatabase(): Promise<void> {
    logger.info('Initializing database connection...');

    try {
      const connected = await testConnection();
      if (!connected) {
        const errorMsg = 'Failed to connect to database';
        logger.error(errorMsg);
        
        // 生产环境下数据库连接失败则退出
        if (config.server.isProduction) {
          logger.error('Database connection is required in production mode');
          throw new Error(errorMsg);
        } else {
          logger.warn('Continuing without database in development mode');
          return;
        }
      }

      logger.info('Checking database schema...');
      await initializeDatabase();
      logger.info('Database initialized successfully');

      // 清理启动前残留的运行中任务
      await this.cleanupResidualTasks();
    } catch (error: any) {
      logger.error('Database initialization error:', { error: error.message });
      
      // 生产环境下数据库错误必须停止应用
      if (config.server.isProduction) {
        logger.error('Cannot start application without database in production mode');
        throw error;
      } else {
        logger.warn('Continuing without database in development mode');
      }
    }
  }

  /**
   * 清理启动前残留的运行中任务
   *
   * Kernel 风格设计：
   * - 简化策略：服务重启时不尝试恢复进程，统一清理本节点残留
   * - 数据结构驱动：status='RUNNING' && machine_id=当前节点 → 残留任务
   * - 最小复杂度：消除"恢复"、"接管"、"孤儿"等特殊情况
   * - 不影响其他节点：仅清理本节点任务，不影响在其他节点运行的任务
   */
  private async cleanupResidualTasks(): Promise<void> {
    try {
      const currentMachineId = config.node.machineId;
      const allRunningTasks = await taskHistoryRepository.findByStatus('RUNNING');

      // 过滤出当前节点的任务
      const residualTasks = allRunningTasks.filter(
        task => task.machine_id === currentMachineId
      );

      if (residualTasks.length === 0) {
        logger.info(`No residual running tasks to clean up for ${currentMachineId}`);
        if (allRunningTasks.length > 0) {
          logger.info(`${allRunningTasks.length} tasks running on other nodes (not cleaned)`);
        }
      } else {
        logger.info(`Found ${residualTasks.length} residual running tasks on ${currentMachineId}, cleaning up...`);

        for (const task of residualTasks) {
          // 如果进程还在运行，杀掉它
          if (task.pid && this.isProcessAlive(task.pid)) {
            logger.info(`Killing residual SIPp process ${task.pid} for task ${task.id}`);
            try {
              process.kill(task.pid, 'SIGTERM');
              await this.waitForProcessExit(task.pid, 5000);
              logger.info(`Successfully killed process ${task.pid}`);
            } catch (error: any) {
              logger.warn(`Failed to gracefully kill process ${task.pid}, forcing SIGKILL`);
              try {
                process.kill(task.pid, 'SIGKILL');
              } catch (killError) {
                logger.error(`Failed to kill process ${task.pid}:`, killError);
              }
            }
          }

          // 标记任务为失败
          await taskHistoryRepository.update(task.id, {
            status: 'FAILED',
            end_time: Date.now(),
            error: `Service restarted on ${currentMachineId}, residual task cleaned up`,
          });

          logger.info(`Task ${task.id} marked as FAILED (residual cleanup on ${currentMachineId})`);
        }

        logger.info(`Cleaned up ${residualTasks.length} residual tasks on ${currentMachineId}`);
      }

      // 从机模式：清理所有残留日志文件
      if (config.node.role === 'slave') {
        await this.cleanupResidualLogs();
      }
    } catch (error: any) {
      logger.error('Failed to clean up residual tasks:', { error: error.message });
    }
  }

  /**
   * 清理残留日志文件（仅从机）
   * 从机重启后删除所有任务日志，因为日志应该已上传到主机
   */
  private async cleanupResidualLogs(): Promise<void> {
    try {
      const logDir = config.sipp.logDir;

      if (!fs.existsSync(logDir)) {
        logger.info('Log directory does not exist, skipping log cleanup');
        return;
      }

      const files = fs.readdirSync(logDir);

      // 过滤出任务日志文件（排除应用日志 app.log / error.log）
      const taskLogFiles = files.filter(f => {
        const isAppLog = f === 'app.log' || f === 'error.log';
        const isTaskLog = f.includes('task_') || f.endsWith('.csv') || f.endsWith('.log');
        return !isAppLog && isTaskLog;
      });

      if (taskLogFiles.length === 0) {
        logger.info('No residual task log files to clean up');
        return;
      }

      logger.info(`Found ${taskLogFiles.length} residual task log files, deleting...`);

      let deletedCount = 0;
      for (const file of taskLogFiles) {
        try {
          const filePath = path.join(logDir, file);
          fs.unlinkSync(filePath);
          deletedCount++;
          logger.debug(`Deleted residual log file: ${file}`);
        } catch (err: any) {
          logger.warn(`Failed to delete log file ${file}: ${err.message || String(err)}`);
        }
      }

      logger.info(`Cleaned up ${deletedCount}/${taskLogFiles.length} residual log files`);
    } catch (error: any) {
      logger.error('Failed to clean up residual logs:', { error: error.message || String(error) });
    }
  }

  /**
   * 等待进程退出
   */
  private async waitForProcessExit(pid: number, timeoutMs: number): Promise<void> {
    const startTime = Date.now();
    while (Date.now() - startTime < timeoutMs) {
      if (!this.isProcessAlive(pid)) {
        return;
      }
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    throw new Error(`Process ${pid} did not exit within ${timeoutMs}ms`);
  }

  /**
   * 检查进程是否存活
   */
  private isProcessAlive(pid: number): boolean {
    try {
      // 发送信号 0 检查进程是否存在
      execSync(`kill -0 ${pid} 2>/dev/null`);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * 创建必要的目录
   */
  private createDirectories(): void {
    const dirs = [
      config.sipp.scenarioDir,
      config.sipp.injectionDir,
      config.sipp.logDir,
      path.dirname(config.logging.file),
    ];

    dirs.forEach((dir) => {
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
        logger.info(`Created directory: ${dir}`);
      }
    });
  }

  /**
   * 配置中间件
   */
  private setupMiddlewares(): void {
    // CORS
    this.app.use(
      cors({
        origin: config.websocket.corsOrigin,
        credentials: true,
      })
    );

    // Body解析
    this.app.use(express.json({ limit: '10mb' }));
    this.app.use(express.urlencoded({ extended: true, limit: '10mb' }));

    // 请求日志
    this.app.use((req, _res, next) => {
      logger.info(`${req.method} ${req.path}`);
      next();
    });

    // 静态文件（用于前端构建产物）- 仅主机模式
    if (config.node.role === 'master') {
      const frontendBuildPath = path.join(__dirname, '../../frontend/dist');
      if (fs.existsSync(frontendBuildPath)) {
        this.app.use(express.static(frontendBuildPath));
        logger.info(`Serving frontend from: ${frontendBuildPath}`);
      }
    } else {
      logger.info('Frontend serving skipped: slave mode (API only)');
    }
  }

  /**
   * 配置路由
   */
  private setupRoutes(): void {
    // API路由
    this.app.use('/api', apiRouter);

    // 健康检查（根路径）
    this.app.get('/health', (_req, res) => {
      res.json({
        status: 'ok',
        timestamp: Date.now(),
        version: '1.0.0',
        sipp: {
          connected: sippClient.isActive(),
          host: config.sipp.host,
          port: config.sipp.controlPort,
        },
        websocket: {
          clients: this.wsService.getClientCount(),
        },
      });
    });

    // SPA 路由回退：所有非 API 路径返回 index.html（开发/生产环境通用）
    const frontendIndexPath = path.join(__dirname, '../../frontend/dist/index.html');
    if (fs.existsSync(frontendIndexPath)) {
      this.app.get('*', (_req, res) => {
        res.sendFile(frontendIndexPath);
      });
      logger.info('SPA fallback route configured');
    } else {
      logger.warn('Frontend build not found, SPA fallback disabled');
    }
  }

  /**
   * 连接到SIPp
   */
  private connectToSipp(): void {
    try {
      sippClient.connect();
      logger.info('Connected to SIPp');

      // 如果CSV文件存在，启动CSV监听
      if (fs.existsSync(config.sipp.csvPath)) {
        this.wsService.startCsvMonitoring(config.sipp.csvPath);
      }

      // 启动任务统计数据推送（每3秒推送一次运行中任务的统计数据）
      this.wsService.startTaskStatsPolling(3000);

      // 启动从机状态轮询（每10秒请求从机上报状态）
      this.wsService.startSlaveStatusPolling(10000);

      // 启动定时统计查询（需要SIPp支持get stats json命令）
      // this.wsService.startStatsPolling(2000);
    } catch (error) {
      logger.warn('Failed to connect to SIPp (will retry):', error);
      // 可以实现重连逻辑
    }
  }

  /**
   * 启动服务器
   */
  private async start(): Promise<void> {
    return new Promise((resolve) => {
      // 主机监听 0.0.0.0（允许外部访问），从机监听 127.0.0.1（仅本地访问）
      const listenHost = config.node.role === 'master' ? '0.0.0.0' : '127.0.0.1';

      // 优化 HTTP Keep-Alive（连接复用）
      // keepAliveTimeout: 65秒（比浏览器默认60秒略长，确保服务端不会提前关闭）
      // headersTimeout: 必须 > keepAliveTimeout，避免请求头超时导致连接异常
      this.server.keepAliveTimeout = 65000;
      this.server.headersTimeout = 66000;

      this.server.listen(config.server.port, listenHost, () => {
        logger.info(`
╔═══════════════════════════════════════════════════════════╗
║                                                           ║
║         SIPp Web Manager Backend Service                 ║
║                                                           ║
║  Environment:  ${config.server.env.padEnd(42)} ║
║  Node Role:    ${config.node.role.padEnd(42)} ║
║  HTTP Server:  http://${listenHost}:${config.server.port.toString().padEnd(23)} ║
║  WebSocket:    ws://${listenHost}:${config.server.port.toString().padEnd(25)} ║
║  SIPp Host:    ${config.sipp.host}:${config.sipp.controlPort.toString().padEnd(35)} ║
║                                                           ║
║  API Docs:     http://${listenHost}:${config.server.port}/api${' '.repeat(13)} ║
║  Health:       http://${listenHost}:${config.server.port}/health${' '.repeat(10)} ║
║                                                           ║
╚═══════════════════════════════════════════════════════════╝
        `);

        // 启动从机连接服务（仅从机模式）
        slaveConnectionService.start();

        // 启动主机注册服务（仅主机模式）
        masterRegistryService.start();

        resolve();
      });
    });
  }

  /**
   * 优雅关闭
   * Kernel 风格：确保所有子进程被正确终止，避免孤儿进程
   */
  async shutdown(): Promise<void> {
    logger.info('Shutting down gracefully...');

    // 1. 停止从机连接服务（从机）
    slaveConnectionService.stop();

    // 2. 停止主机注册服务（主机）
    masterRegistryService.stop();

    // 3. 停止所有运行中的 SIPp 进程
    try {
      logger.info('Stopping all SIPp processes...');
      await sippProcessManager.stopAll(false); // 优雅停止
      logger.info('All SIPp processes stopped');
    } catch (error: any) {
      logger.error('Error stopping SIPp processes:', error);
      // 强制停止
      try {
        await sippProcessManager.stopAll(true);
      } catch {}
    }

    // 3. 关闭WebSocket服务
    this.wsService.close();

    // 4. 断开SIPp连接
    sippClient.disconnect();

    // 5. 关闭HTTP服务器
    await new Promise<void>((resolve) => {
      this.server.close(() => {
        logger.info('HTTP server closed');
        resolve();
      });
    });

    logger.info('Shutdown complete');
    process.exit(0);
  }
}

// 创建应用实例
const app = new SippWebManagerApp();

// 处理进程信号
process.on('SIGTERM', () => app.shutdown());
process.on('SIGINT', () => app.shutdown());

// 处理未捕获的异常
process.on('uncaughtException', (error) => {
  logger.error('Uncaught exception:', error);
  // 仅在严重错误时关闭服务
  if (error.message?.includes('EADDRINUSE') || error.message?.includes('Cannot find module')) {
    logger.error('Fatal error detected, shutting down...');
    app.shutdown();
  } else {
    logger.warn('Non-fatal uncaught exception, continuing service...');
  }
});

process.on('unhandledRejection', (reason, promise) => {
  // 记录详细的拒绝信息
  const errorMsg = reason instanceof Error ? reason.message : String(reason);
  const errorStack = reason instanceof Error ? reason.stack : undefined;

  logger.error('Unhandled rejection detected:', {
    reason: errorMsg,
    stack: errorStack,
    promise: promise?.toString(),
  });

  // 不要因为远程调用失败等非致命错误而关闭服务
  // 仅在数据库连接失败等致命错误时关闭
  if (errorMsg?.includes('ECONNREFUSED') ||
      errorMsg?.includes('ECONNRESET') ||
      errorMsg?.includes('ETIMEDOUT') ||
      errorMsg?.includes('AxiosError')) {
    logger.warn('Non-fatal network error in unhandled rejection, service continues...');
  } else if (errorMsg?.includes('database') || errorMsg?.includes('ENOTFOUND')) {
    logger.error('Fatal error detected, shutting down...');
    app.shutdown();
  } else {
    logger.warn('Non-fatal unhandled rejection, service continues...');
  }
});

export default app;
