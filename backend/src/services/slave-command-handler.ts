import { Socket } from 'socket.io-client';
import { logger } from '../utils/logger';
import { sippProcessManager } from './sipp-process';
import { config } from '../config';
import { CsvParser } from '../parsers/csv-parser';
import fs from 'fs';
import path from 'path';

/**
 * 从机命令处理器（WebSocket）
 * 职责：接收并执行来自主机的命令
 *
 * Kernel 风格设计：
 * - 命令-响应模式：每个命令都有唯一 requestId
 * - 事件驱动：基于 Socket.IO 事件机制
 * - 最小复杂度：纯函数式命令处理
 */
export class SlaveCommandHandler {
  private socket: Socket;

  constructor(socket: Socket) {
    this.socket = socket;
    this.setupCommandListeners();
  }

  /**
   * 设置命令监听器
   */
  private setupCommandListeners(): void {
    // 1. 启动任务
    this.socket.on('task:start', async (data) => {
      await this.handleTaskStart(data);
    });

    // 2. 停止任务
    this.socket.on('task:stop', async (data) => {
      await this.handleTaskStop(data);
    });

    // 3. 控制命令（设置速率、暂停/恢复等）
    this.socket.on('task:command', async (data) => {
      await this.handleTaskCommand(data);
    });

    // 4. 请求任务统计
    this.socket.on('task:stats:request', async (data) => {
      await this.handleTaskStatsRequest(data);
    });

    // 5. 同步文件
    this.socket.on('file:sync', async (data) => {
      await this.handleFileSync(data);
    });

    // 6. 请求上传日志
    this.socket.on('logs:upload:request', async (data) => {
      await this.handleLogUploadRequest(data);
    });

    logger.info('Slave command handlers registered');
  }

  /**
   * 处理启动任务命令
   */
  private async handleTaskStart(data: any): Promise<void> {
    const { requestId, taskId, config: taskConfig } = data;

    try {
      logger.info(`Received task:start command: ${taskId}`, { requestId });

      // 从config中提取scenarioFile和其他选项
      const {
        scenarioFile,
        injectionFile,
        oocsf,
        regScenarioFile,
        certId,
        ...options
      } = taskConfig;

      // 按需从数据库恢复场景文件（如果本地不存在）
      await this.ensureFileExists(scenarioFile, 'scenario');

      // 按需恢复注入文件
      if (injectionFile) {
        await this.ensureFileExists(injectionFile, 'injection');
      }

      // 按需恢复 OOCSF 文件
      if (oocsf) {
        await this.ensureFileExists(oocsf, 'scenario');
      }

      // 按需恢复注册场景文件
      if (regScenarioFile) {
        await this.ensureFileExists(regScenarioFile, 'scenario');
      }

      // 按需恢复 TLS 证书
      if (certId) {
        await this.ensureCertificateExists(certId);
      }

      // 重新构建完整选项
      const fullOptions = {
        ...options,
        injectionFile,
        oocsf,
        regScenarioFile,
        certId,
      };

      // 启动 SIPp 进程
      await sippProcessManager.start(taskId, scenarioFile, fullOptions);

      // 获取进程状态（包含pid和controlPort）
      const status = sippProcessManager.getStatus(taskId);
      const pid = status?.pid || null;
      const controlPort = status?.controlPort || null;

      // 发送成功响应
      this.socket.emit('task:start:ack', {
        requestId,
        success: true,
        taskId,
        pid,
        controlPort,  // ✅ 新增：返回控制端口
      });

      logger.info(`Task started successfully: ${taskId} (PID: ${pid}, Control Port: ${controlPort})`);
    } catch (error: any) {
      logger.error(`Failed to start task ${taskId}:`, error);

      // 发送失败响应
      this.socket.emit('task:start:ack', {
        requestId,
        success: false,
        taskId,
        error: error.message || String(error),
      });
    }
  }

  /**
   * 确保文件存在（按需从数据库恢复）
   */
  private async ensureFileExists(filename: string, fileType: 'scenario' | 'injection'): Promise<void> {
    const targetDir = fileType === 'scenario' ? config.sipp.scenarioDir : config.sipp.injectionDir;
    const filePath = path.join(targetDir, filename);

    // 检查文件是否已存在
    if (fs.existsSync(filePath)) {
      logger.debug(`File already exists: ${filePath}`);
      return;
    }

    // 文件不存在，从数据库恢复
    logger.info(`File not found locally, restoring from database: ${filename}`);

    try {
      const { fileRestoreService } = await import('./file-restore-service');
      
      let success: boolean;
      if (fileType === 'scenario') {
        success = await fileRestoreService.restoreScenarioFile(filename);
      } else {
        success = await fileRestoreService.restoreInjectionFile(filename);
      }

      if (!success) {
        throw new Error(`Failed to restore ${fileType} file from database: ${filename}`);
      }

      logger.info(`Successfully restored ${fileType} file from database: ${filename}`);
    } catch (error: any) {
      logger.error(`Failed to restore ${fileType} file ${filename}:`, error);
      throw new Error(`Cannot restore ${fileType} file ${filename}: ${error.message}`);
    }
  }

  /**
   * 确保 TLS 证书存在（按需从数据库恢复）
   */
  private async ensureCertificateExists(certId: string): Promise<void> {
    try {
      const { fileRestoreService } = await import('./file-restore-service');
      
      // 先尝试恢复证书（如果已存在会跳过）
      const success = await fileRestoreService.restoreTlsCertificate(certId);
      
      if (!success) {
        logger.warn(`Failed to restore TLS certificate ${certId}, will try to use it anyway`);
      } else {
        logger.info(`Successfully ensured TLS certificate exists: ${certId}`);
      }
    } catch (error: any) {
      logger.error(`Failed to ensure TLS certificate ${certId}:`, error);
      throw new Error(`Cannot restore TLS certificate ${certId}: ${error.message}`);
    }
  }

  /**
   * 处理停止任务命令
   */
  private async handleTaskStop(data: any): Promise<void> {
    const { requestId, taskId, force } = data;

    try {
      logger.info(`Received task:stop command: ${taskId} (force: ${force})`, { requestId });

      // 停止 SIPp 进程
      await sippProcessManager.stop(taskId, force);

      // 发送成功响应
      this.socket.emit('task:stop:ack', {
        requestId,
        success: true,
        taskId,
      });

      logger.info(`Task stopped successfully: ${taskId}`);
    } catch (error: any) {
      logger.error(`Failed to stop task ${taskId}:`, error);

      // 发送失败响应
      this.socket.emit('task:stop:ack', {
        requestId,
        success: false,
        taskId,
        error: error.message || String(error),
      });
    }
  }

  /**
   * 处理控制命令（设置速率、暂停/恢复等）
   */
  private async handleTaskCommand(data: any): Promise<void> {
    const { requestId, taskId, command, args } = data;

    try {
      logger.info(`Received task:command: ${command} for task ${taskId}`, { requestId, args });

      // 发送命令到 SIPp 进程
      await sippProcessManager.sendCommand(taskId, command, args);

      // 发送成功响应
      this.socket.emit('task:command:ack', {
        requestId,
        success: true,
        taskId,
        command,
      });

      logger.info(`Control command ${command} executed successfully on task ${taskId}`);
    } catch (error: any) {
      logger.error(`Failed to execute command ${command} on task ${taskId}:`, error);

      // 发送失败响应
      this.socket.emit('task:command:ack', {
        requestId,
        success: false,
        taskId,
        command,
        error: error.message || String(error),
      });
    }
  }

  /**
   * 处理任务统计请求
   */
  private async handleTaskStatsRequest(data: any): Promise<void> {
    const { requestId, taskId } = data;

    try {
      logger.debug(`Received task:stats:request: ${taskId}`, { requestId });

      // 使用 CsvParser 读取任务统计（正确的字段映射）
      const csvPath = path.join(config.sipp.logDir, `${taskId}_stats.csv`);

      if (!fs.existsSync(csvPath)) {
        throw new Error(`Stats file not found: ${csvPath}`);
      }

      // 使用 CsvParser 解析（自动处理列名映射）
      const parser = new CsvParser({ filePath: csvPath, watchMode: false });
      const latestStats = await parser.getLatest();

      if (!latestStats) {
        throw new Error(`No stats available in CSV: ${csvPath}`);
      }

      // 直接使用 CsvParser 返回的正确字段
      const stats = {
        totalCalls: latestStats.totalCalls,
        successCalls: latestStats.successCalls,
        failedCalls: latestStats.failedCalls,
        callRate: latestStats.callRate,
      };

      // 发送统计响应
      this.socket.emit('task:stats:request:ack', {
        requestId,
        success: true,
        taskId,
        stats,
      });

      logger.debug(`Task stats sent: ${taskId}`, stats);
    } catch (error: any) {
      logger.error(`Failed to get task stats ${taskId}:`, error);

      // 发送错误响应
      this.socket.emit('task:stats:request:ack', {
        requestId,
        success: false,
        taskId,
        error: error.message || String(error),
      });
    }
  }

  /**
   * 处理文件同步命令
   */
  private async handleFileSync(data: any): Promise<void> {
    const { requestId, fileName, fileType, content } = data;

    try {
      logger.info(`Received file:sync command: ${fileName} (${fileType})`, { requestId });

      // 确定目标目录
      let targetDir: string;
      switch (fileType) {
        case 'scenario':
          targetDir = config.sipp.scenarioDir;
          break;
        case 'injection':
          targetDir = config.sipp.injectionDir;
          break;
        case 'certificate':
          targetDir = path.join(config.sipp.scenarioDir, '../certificates');
          break;
        default:
          throw new Error(`Unknown file type: ${fileType}`);
      }

      // 创建目录（如果不存在）
      if (!fs.existsSync(targetDir)) {
        fs.mkdirSync(targetDir, { recursive: true });
      }

      // 解码并写入文件
      const filePath = path.join(targetDir, fileName);
      const buffer = Buffer.from(content, 'base64');
      fs.writeFileSync(filePath, buffer);

      // 发送成功响应
      this.socket.emit('file:sync:ack', {
        requestId,
        success: true,
        fileName,
        fileType,
      });

      logger.info(`File synced successfully: ${filePath}`);
    } catch (error: any) {
      logger.error(`Failed to sync file ${fileName}:`, error);

      // 发送失败响应
      this.socket.emit('file:sync:ack', {
        requestId,
        success: false,
        fileName,
        error: error.message || String(error),
      });
    }
  }

  /**
   * 处理日志上传请求
   */
  private async handleLogUploadRequest(data: any): Promise<void> {
    const { requestId, taskId } = data;

    try {
      logger.info(`Received logs:upload:request: ${taskId}`, { requestId });

      const logDir = config.sipp.logDir;
      const files = fs.readdirSync(logDir);

      // 查找任务相关日志文件
      const taskLogFiles = files.filter(f => f.includes(taskId) && fs.statSync(path.join(logDir, f)).isFile());

      if (taskLogFiles.length === 0) {
        logger.warn(`No log files found for task ${taskId}`);

        // 发送空响应
        this.socket.emit('logs:upload:complete', {
          requestId,
          taskId,
          files: [],
        });
        return;
      }

      logger.info(`Uploading ${taskLogFiles.length} log files for task ${taskId}`);

      // 分片上传每个文件
      for (const fileName of taskLogFiles) {
        await this.uploadLogFile(requestId, taskId, fileName);
      }

      // 发送上传完成
      this.socket.emit('logs:upload:complete', {
        requestId,
        taskId,
        files: taskLogFiles,
      });

      logger.info(`Log upload completed for task ${taskId}`);

      // 上传成功后删除本地日志
      for (const fileName of taskLogFiles) {
        try {
          const filePath = path.join(logDir, fileName);
          fs.unlinkSync(filePath);
          logger.debug(`Deleted local log file: ${fileName}`);
        } catch (err: any) {
          logger.warn(`Failed to delete log file ${fileName}: ${err.message}`);
        }
      }

    } catch (error: any) {
      logger.error(`Failed to upload logs for task ${taskId}:`, error);

      // 发送错误响应
      this.socket.emit('logs:upload:error', {
        requestId,
        taskId,
        error: error.message || String(error),
      });
    }
  }

  /**
   * 上传单个日志文件（分片）
   */
  private async uploadLogFile(requestId: string, taskId: string, fileName: string): Promise<void> {
    const filePath = path.join(config.sipp.logDir, fileName);
    const content = fs.readFileSync(filePath);

    const CHUNK_SIZE = 1024 * 1024; // 1MB per chunk
    const totalChunks = Math.ceil(content.length / CHUNK_SIZE);

    for (let i = 0; i < totalChunks; i++) {
      const start = i * CHUNK_SIZE;
      const end = Math.min(start + CHUNK_SIZE, content.length);
      const chunk = content.slice(start, end);

      // 发送分片
      this.socket.emit('logs:upload', {
        requestId,
        taskId,
        fileName,
        chunkIndex: i,
        totalChunks,
        content: chunk.toString('base64'),
      });

      logger.debug(`Uploaded chunk ${i + 1}/${totalChunks} of ${fileName}`);

      // 避免阻塞事件循环
      await new Promise(resolve => setImmediate(resolve));
    }
  }
}
