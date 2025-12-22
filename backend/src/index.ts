import express, { Application } from 'express';
import cors from 'cors';
import http from 'http';
import { config, validateConfig } from './config';
import { logger } from './utils/logger';
import { sippClient } from './services/sipp-client';
import { sippProcessManager } from './services/sipp-process';
import { heartbeatService } from './services/heartbeat';
import { masterRegistryService } from './services/master-registry';
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
   * - 简化策略：服务重启时不尝试恢复进程，统一清理所有残留
   * - 数据结构驱动：status='RUNNING' → 残留任务，直接清理
   * - 最小复杂度：消除"恢复"、"接管"、"孤儿"等特殊情况
   */
  private async cleanupResidualTasks(): Promise<void> {
    try {
      const runningTasks = await taskHistoryRepository.findByStatus('RUNNING');

      if (runningTasks.length === 0) {
        logger.info('No residual running tasks to clean up');
        return;
      }

      logger.info(`Found ${runningTasks.length} residual running tasks, cleaning up...`);

      for (const task of runningTasks) {
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
          error: 'Service restarted, residual task cleaned up',
        });

        logger.info(`Task ${task.id} marked as FAILED (residual cleanup)`);
      }

      logger.info(`Cleaned up ${runningTasks.length} residual tasks`);
    } catch (error: any) {
      logger.error('Failed to clean up residual tasks:', { error: error.message });
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

    // 静态文件（用于前端构建产物）
    const frontendBuildPath = path.join(__dirname, '../../frontend/dist');
    if (fs.existsSync(frontendBuildPath)) {
      this.app.use(express.static(frontendBuildPath));
      logger.info(`Serving frontend from: ${frontendBuildPath}`);
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

    // SPA路由回退（开发环境）
    if (config.server.isDevelopment) {
      this.app.get('*', (_req, res) => {
        res.json({
          message: 'SIPp Web Manager API',
          version: '1.0.0',
          endpoints: {
            health: '/health',
            api: '/api',
            websocket: `ws://localhost:${config.server.port}`,
          },
        });
      });
    } else {
      // 生产环境：所有其他请求返回前端index.html
      const frontendIndexPath = path.join(__dirname, '../../frontend/dist/index.html');
      if (fs.existsSync(frontendIndexPath)) {
        this.app.get('*', (_req, res) => {
          res.sendFile(frontendIndexPath);
        });
      }
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
      this.server.listen(config.server.port, '0.0.0.0', () => {
        logger.info(`
╔═══════════════════════════════════════════════════════════╗
║                                                           ║
║         SIPp Web Manager Backend Service                 ║
║                                                           ║
║  Environment:  ${config.server.env.padEnd(42)} ║
║  Node Role:    ${config.node.role.padEnd(42)} ║
║  HTTP Server:  http://localhost:${config.server.port.toString().padEnd(29)} ║
║  WebSocket:    ws://localhost:${config.server.port.toString().padEnd(31)} ║
║  SIPp Host:    ${config.sipp.host}:${config.sipp.controlPort.toString().padEnd(35)} ║
║                                                           ║
║  API Docs:     http://localhost:${config.server.port}/api${' '.repeat(19)} ║
║  Health:       http://localhost:${config.server.port}/health${' '.repeat(16)} ║
║                                                           ║
╚═══════════════════════════════════════════════════════════╝
        `);

        // 启动心跳服务（仅从机模式）
        heartbeatService.start();

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

    // 1. 停止心跳服务（从机）
    heartbeatService.stop();

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
  app.shutdown();
});

process.on('unhandledRejection', (reason, promise) => {
  logger.error('Unhandled rejection at:', promise, 'reason:', reason);
  app.shutdown();
});

export default app;
