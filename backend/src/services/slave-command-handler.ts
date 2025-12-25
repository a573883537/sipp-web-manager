import { Socket } from 'socket.io-client';
import { logger } from '../utils/logger';
import { sippProcessManager } from './sipp-process';
import { config } from '../config';
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

    // 3. 请求任务统计
    this.socket.on('task:stats:request', async (data) => {
      await this.handleTaskStatsRequest(data);
    });

    // 4. 同步文件
    this.socket.on('file:sync', async (data) => {
      await this.handleFileSync(data);
    });

    // 5. 请求上传日志
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
      const { scenarioFile, ...options } = taskConfig;

      // 启动 SIPp 进程
      await sippProcessManager.start(taskId, scenarioFile, options);

      // 获取进程状态（包含pid）
      const status = sippProcessManager.getStatus(taskId);
      const pid = status?.pid || null;

      // 发送成功响应
      this.socket.emit('task:start:ack', {
        requestId,
        success: true,
        taskId,
        pid,
      });

      logger.info(`Task started successfully: ${taskId} (PID: ${pid})`);
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
   * 处理任务统计请求
   */
  private async handleTaskStatsRequest(data: any): Promise<void> {
    const { requestId, taskId } = data;

    try {
      logger.debug(`Received task:stats:request: ${taskId}`, { requestId });

      // 获取任务统计（从 CSV 文件读取）
      const csvPath = path.join(config.sipp.logDir, `${taskId}_stats.csv`);

      if (!fs.existsSync(csvPath)) {
        throw new Error(`Stats file not found: ${csvPath}`);
      }

      // 简单实现：读取 CSV 文件最后一行
      const content = fs.readFileSync(csvPath, 'utf-8');
      const lines = content.trim().split('\n');
      const lastLine = lines[lines.length - 1];
      const values = lastLine.split(';');

      // CSV 格式：StartTime;LastResetTime;CurrentTime;ElapsedTime;CallRate;IncomingCall;OutgoingCall;...
      const stats = {
        totalCalls: parseInt(values[6] || '0', 10) + parseInt(values[7] || '0', 10),
        successCalls: parseInt(values[10] || '0', 10),
        failedCalls: parseInt(values[11] || '0', 10),
        callRate: parseFloat(values[4] || '0'),
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
