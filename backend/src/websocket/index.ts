import { Server as SocketIOServer, Socket } from 'socket.io';
import { Server as HttpServer } from 'http';
import { config } from '../config';
import { logger } from '../utils/logger';
import { sippClient } from '../services/sipp-client';
import { sippProcessManager } from '../services/sipp-process';
import { CsvParser } from '../parsers/csv-parser';
import { taskHistoryRepository } from '../database/task-history-repository';
import { query } from '../database';
import path from 'path';
import axios from 'axios';
import * as fs from 'fs';
import FormData from 'form-data';

/**
 * WebSocket服务
 * 职责：管理WebSocket连接，实时推送SIPp数据到前端
 * 遵循单一职责原则和依赖倒置原则
 */
export class WebSocketService {
  private io: SocketIOServer;
  private csvParser: CsvParser | null = null;
  private statsInterval: NodeJS.Timeout | null = null;
  private taskStatsInterval: NodeJS.Timeout | null = null;

  constructor(httpServer: HttpServer) {
    this.io = new SocketIOServer(httpServer, {
      cors: {
        origin: config.websocket.corsOrigin,
        methods: ['GET', 'POST'],
        credentials: true,
      },
      transports: ['websocket', 'polling'],
    });

    this.setupSocketHandlers();
    this.setupSippClientListeners();
    this.setupSippProcessListeners();
  }

  /**
   * 设置Socket.IO事件处理器
   */
  private setupSocketHandlers(): void {
    this.io.on('connection', (socket: Socket) => {
      logger.info(`Client connected: ${socket.id}`);

      // 发送连接成功消息
      socket.emit('connected', {
        timestamp: Date.now(),
        message: 'Connected to SIPp Web Manager',
      });

      // 监听客户端命令
      socket.on('sipp:command', async (data) => {
        await this.handleSippCommand(socket, data);
      });

      // 监听统计数据请求
      socket.on('stats:request', async () => {
        await this.sendCurrentStats(socket);
      });

      // 断开连接
      socket.on('disconnect', () => {
        logger.info(`Client disconnected: ${socket.id}`);
      });

      // 错误处理
      socket.on('error', (error) => {
        logger.error('Socket error:', error);
      });
    });
  }

  /**
   * 设置SIPp客户端监听器
   */
  private setupSippClientListeners(): void {
    // 监听SIPp统计数据
    sippClient.on('stats', (stats) => {
      this.broadcast('stats:update', stats);
    });

    // 监听SIPp消息
    sippClient.on('message', (message) => {
      this.broadcast('sipp:message', { message, timestamp: Date.now() });
    });

    // 监听SIPp错误
    sippClient.on('error', (error) => {
      this.broadcast('sipp:error', {
        error: error.message,
        timestamp: Date.now(),
      });
    });

    // 连接成功
    sippClient.on('connected', () => {
      this.broadcast('sipp:connected', { timestamp: Date.now() });
    });
  }

  /**
   * 设置SIPp进程监听器（任务状态跟踪）
   */
  private setupSippProcessListeners(): void {
    // 进程启动成功
    sippProcessManager.on('started', (data) => {
      const taskId = data.taskId;
      if (taskId) {
        this.broadcast('task:started', {
          taskId,
          timestamp: Date.now(),
          pid: data.pid,
        });
        logger.info('Task started', { taskId, pid: data.pid });
      }
    });

    // 暂停/恢复
    sippProcessManager.on('paused', (data) => {
      const taskId = data.taskId;
      if (taskId) {
        this.broadcast('task:paused', {
          taskId,
          isPaused: data.isPaused,
          timestamp: Date.now(),
        });
        logger.info('Task paused state changed', { taskId, isPaused: data.isPaused });
      }
    });

    // 进程退出
    sippProcessManager.on('exit', async (data) => {
      const taskId = data.taskId;
      if (taskId) {
        // 根据退出码判断是成功还是失败
        const isSuccess = data.code === 0;

        // 读取CSV统计数据并更新数据库
        try {
          const csvPath = path.join(config.sipp.logDir, `${taskId}_stats.csv`);
          const parser = new CsvParser({ filePath: csvPath, watchMode: false });
          const stats = await parser.getLatest();
          if (stats) {
            const successRate = stats.totalCalls > 0
              ? Math.round((stats.successCalls / stats.totalCalls) * 10000) / 100
              : 0;
            await taskHistoryRepository.update(taskId, {
              status: isSuccess ? 'COMPLETED' : 'FAILED',
              stats: {
                totalCalls: stats.totalCalls,
                successCalls: stats.successCalls,
                failedCalls: stats.failedCalls,
                successRate,
              },
              end_time: Date.now(),
              error: isSuccess ? undefined : `进程退出码: ${data.code}`,
            });
          }
        } catch (err: any) {
          logger.error('Failed to update task stats:', err);
        }

        // 从机模式：上传日志到主机并删除本地日志
        if (config.node.role === 'slave') {
          try {
            await this.uploadLogsToMaster(taskId);
          } catch (err: any) {
            logger.error(`Failed to upload logs for task ${taskId}: ${err.message || String(err)}`);
          }
        }

        this.broadcast('task:completed', {
          taskId,
          timestamp: Date.now(),
          success: isSuccess,
          exitCode: data.code,
          signal: data.signal,
        });
        logger.info('Task completed', {
          taskId,
          code: data.code,
          signal: data.signal,
          success: isSuccess,
        });
      }
    });

    // 进程错误
    sippProcessManager.on('error', (data) => {
      const taskId = data.taskId;
      if (taskId) {
        this.broadcast('task:failed', {
          taskId,
          timestamp: Date.now(),
          error: data.error?.message || 'Unknown error',
        });
        logger.error('Task failed', { taskId, error: data.error?.message });
      }
    });

    // 主动停止
    sippProcessManager.on('stopped', (data) => {
      const taskId = data.taskId;
      if (taskId) {
        this.broadcast('task:stopped', {
          taskId,
          timestamp: Date.now(),
        });
        logger.info('Task stopped', { taskId });
      }
    });
  }

  /**
   * 处理SIPp命令
   */
  private async handleSippCommand(socket: Socket, data: any): Promise<void> {
    try {
      const { command, args } = data;

      logger.info(`Executing SIPp command: ${command}`, args);

      switch (command) {
        case 'setRate':
          await sippClient.setRate(args.rate);
          break;
        case 'setUsers':
          await sippClient.setUsers(args.users);
          break;
        case 'setLimit':
          await sippClient.setLimit(args.limit);
          break;
        case 'pause':
          await sippClient.pause();
          break;
        case 'quit':
          await sippClient.quit();
          break;
        case 'forceQuit':
          await sippClient.forceQuit();
          break;
        case 'increaseRate':
          await sippClient.increaseRate();
          break;
        case 'decreaseRate':
          await sippClient.decreaseRate();
          break;
        case 'setTraceError':
          await sippClient.setTraceError(args.enable);
          break;
        case 'setTraceMessages':
          await sippClient.setTraceMessages(args.enable);
          break;
        case 'resetStats':
          await sippClient.resetStats(args.type);
          break;
        case 'getStats':
          await sippClient.getStats();
          break;
        default:
          socket.emit('error', { message: `Unknown command: ${command}` });
          return;
      }

      socket.emit('command:success', { command, timestamp: Date.now() });
    } catch (error: any) {
      logger.error('Error handling SIPp command:', error);
      socket.emit('command:error', {
        command: data.command,
        error: error.message,
        timestamp: Date.now(),
      });
    }
  }

  /**
   * 发送当前统计数据
   */
  private async sendCurrentStats(socket: Socket): Promise<void> {
    try {
      if (this.csvParser) {
        const latest = await this.csvParser.getLatest();
        if (latest) {
          socket.emit('stats:current', latest);
        }
      }
    } catch (error) {
      logger.error('Error sending current stats:', error);
    }
  }

  /**
   * 广播消息到所有连接的客户端
   */
  broadcast(event: string, data: any): void {
    this.io.emit(event, data);
    logger.debug(`Broadcast: ${event}`, data);
  }

  /**
   * 启动CSV监听
   */
  startCsvMonitoring(filePath: string): void {
    if (this.csvParser) {
      logger.warn('CSV parser already running');
      return;
    }

    this.csvParser = new CsvParser({
      filePath,
      watchMode: true,
      pollInterval: 1000,
    });

    // 监听CSV数据更新
    this.csvParser.on('data', (row) => {
      this.broadcast('stats:csv', row);
    });

    this.csvParser.on('error', (error) => {
      logger.error('CSV parser error:', error);
    });

    this.csvParser.start();
    logger.info(`Started CSV monitoring: ${filePath}`);
  }

  /**
   * 停止CSV监听
   */
  stopCsvMonitoring(): void {
    if (this.csvParser) {
      this.csvParser.stop();
      this.csvParser = null;
      logger.info('Stopped CSV monitoring');
    }
  }

  /**
   * 启动定时统计数据推送
   */
  startStatsPolling(interval: number = 2000): void {
    if (this.statsInterval) {
      logger.warn('Stats polling already running');
      return;
    }

    this.statsInterval = setInterval(async () => {
      try {
        // 请求SIPp统计数据
        await sippClient.getStats();
      } catch (error) {
        logger.error('Error polling stats:', error);
      }
    }, interval);

    logger.info(`Started stats polling with interval: ${interval}ms`);
  }

  /**
   * 停止定时统计数据推送
   */
  stopStatsPolling(): void {
    if (this.statsInterval) {
      clearInterval(this.statsInterval);
      this.statsInterval = null;
      logger.info('Stopped stats polling');
    }
  }

  /**
   * 启动任务统计数据推送
   * 定期推送所有运行中任务的统计数据（支持从机）
   */
  startTaskStatsPolling(interval: number = 3000): void {
    if (this.taskStatsInterval) {
      logger.warn('Task stats polling already running');
      return;
    }

    this.taskStatsInterval = setInterval(async () => {
      try {
        // 获取所有运行中的任务
        const runningTasks = await taskHistoryRepository.findByStatus('RUNNING');

        if (runningTasks.length === 0) {
          return;
        }

        // 并行获取所有任务的统计数据
        const tasksWithStats = await Promise.all(
          runningTasks.map(async (task) => {
            try {
              // 判断任务所在机器
              const isLocal = task.machine_id === 'master' || task.machine_id === config.node.machineId;

              let stats = null;

              if (isLocal) {
                // 本地任务：直接读取 CSV 文件
                const csvPath = path.join(config.sipp.logDir, `${task.id}_stats.csv`);
                const parser = new CsvParser({ filePath: csvPath, watchMode: false });
                stats = await parser.getLatest();
              } else {
                // 远程任务：通过 HTTP API 获取
                try {
                  // 从数据库查找机器信息
                  const machines = await query('SELECT * FROM machines WHERE id = ?', [task.machine_id]);
                  if (machines.length > 0) {
                    const machine = machines[0] as any;
                    const slaveUrl = `http://${machine.ip_address}:${machine.api_port}/api/sipp/stats/${task.id}`;

                    const response = await axios.get(slaveUrl, { timeout: 3000 });
                    if (response.data.success && response.data.stats) {
                      stats = response.data.stats;
                    }
                  }
                } catch (remoteError: any) {
                  logger.debug(`Failed to get remote stats for task ${task.id} on ${task.machine_id}:`, remoteError.message);
                }
              }

              if (stats) {
                const successRate = stats.totalCalls > 0
                  ? Math.round((stats.successCalls / stats.totalCalls) * 10000) / 100
                  : 0;

                return {
                  taskId: task.id,
                  stats: {
                    totalCalls: stats.totalCalls,
                    successCalls: stats.successCalls,
                    failedCalls: stats.failedCalls,
                    successRate,
                    currentCallRate: stats.callRate || 0,
                  },
                  timestamp: Date.now(),
                };
              }
            } catch (error) {
              // 忽略单个任务的错误
              logger.debug(`Failed to get stats for task ${task.id}:`, error);
            }
            return null;
          })
        );

        // 过滤掉失败的任务，并推送统计数据
        const validStats = tasksWithStats.filter(s => s !== null);
        if (validStats.length > 0) {
          this.broadcast('tasks:stats', {
            tasks: validStats,
            timestamp: Date.now(),
          });
        }
      } catch (error) {
        logger.error('Error polling task stats:', error);
      }
    }, interval);

    logger.info(`Started task stats polling with interval: ${interval}ms`);
  }

  /**
   * 停止任务统计数据推送
   */
  stopTaskStatsPolling(): void {
    if (this.taskStatsInterval) {
      clearInterval(this.taskStatsInterval);
      this.taskStatsInterval = null;
      logger.info('Stopped task stats polling');
    }
  }

  /**
   * 上传日志到主机（从机调用）
   * 任务结束后自动上传所有日志文件，上传成功后删除本地日志
   */
  private async uploadLogsToMaster(taskId: string): Promise<void> {
    if (config.node.role !== 'slave') {
      throw new Error('uploadLogsToMaster can only be called on slave node');
    }

    const logDir = config.sipp.logDir;
    const machineId = config.node.machineId;

    // 查找所有与该任务相关的日志文件
    const files = fs.readdirSync(logDir);
    const taskLogFiles = files.filter(f => f.includes(taskId));

    if (taskLogFiles.length === 0) {
      logger.warn(`No log files found for task ${taskId}, skipping upload`);
      return;
    }

    logger.info(`Uploading ${taskLogFiles.length} log files for task ${taskId} to master`);

    try {
      // 获取主机信息
      const masters = await query('SELECT * FROM machines WHERE role = ?', ['master']);
      if (masters.length === 0) {
        throw new Error('Master node not found in database');
      }

      const master = masters[0] as any;
      const masterUrl = `http://${master.ip_address}:${master.api_port}/api/logs/upload`;

      // 构建 form-data
      const formData = new FormData();
      formData.append('machineId', machineId);
      formData.append('taskId', taskId);

      // 添加所有日志文件
      for (const file of taskLogFiles) {
        const filePath = path.join(logDir, file);
        formData.append('files', fs.createReadStream(filePath), file);
      }

      // 上传到主机
      const response = await axios.post(masterUrl, formData, {
        headers: formData.getHeaders(),
        timeout: 60000, // 60秒超时
        maxBodyLength: Infinity,
        maxContentLength: Infinity,
      });

      if (!response.data?.success) {
        throw new Error(response.data?.error || 'Upload failed');
      }

      logger.info(`Successfully uploaded ${taskLogFiles.length} log files for task ${taskId}`);

      // 上传成功后删除本地日志文件
      for (const file of taskLogFiles) {
        try {
          const filePath = path.join(logDir, file);
          fs.unlinkSync(filePath);
          logger.debug(`Deleted local log file: ${file}`);
        } catch (err: any) {
          logger.warn(`Failed to delete local log file ${file}: ${err.message || String(err)}`);
        }
      }

      logger.info(`Cleaned up ${taskLogFiles.length} local log files for task ${taskId}`);

    } catch (error: any) {
      logger.error(`Failed to upload logs for task ${taskId}: ${error.message || String(error)}`);
      throw error;
    }
  }

  /**
   * 获取连接的客户端数量
   */
  getClientCount(): number {
    return this.io.sockets.sockets.size;
  }

  /**
   * 关闭WebSocket服务
   */
  close(): void {
    this.stopCsvMonitoring();
    this.stopStatsPolling();
    this.stopTaskStatsPolling();
    this.io.close();
    logger.info('WebSocket service closed');
  }
}
