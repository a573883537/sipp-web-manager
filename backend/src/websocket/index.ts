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
 * 职责：管理WebSocket连接，实时推送SIPp数据到前端，管理主从通信
 * 遵循单一职责原则和依赖倒置原则
 */
export class WebSocketService {
  private io: SocketIOServer;
  private csvParser: CsvParser | null = null;
  private statsInterval: NodeJS.Timeout | null = null;
  private taskStatsInterval: NodeJS.Timeout | null = null;

  // 从机 WebSocket 连接映射（machineId -> socket）
  private slaveSockets: Map<string, Socket> = new Map();

  // 请求-响应追踪（requestId -> resolve函数）
  private pendingRequests: Map<string, { resolve: Function; reject: Function; timeout: any }> = new Map();

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

      // === 从机连接处理（WebSocket长连接） ===

      // 从机注册（首次连接）
      socket.on('slave:register', async (data) => {
        await this.handleSlaveRegister(socket, data);
      });

      // 从机心跳（定期发送）
      socket.on('slave:heartbeat', async (data) => {
        await this.handleSlaveHeartbeat(socket, data);
      });

      // 从机离线（主动断开）
      socket.on('slave:offline', async (data) => {
        await this.handleSlaveOffline(socket, data);
      });

      // === 前端连接处理 ===

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

        // 如果是从机连接，从映射中移除
        if (socket.data?.machineId && socket.data?.role === 'slave') {
          const machineId = socket.data.machineId;
          const currentSocket = this.slaveSockets.get(machineId);

          // 只在是当前连接时才移除（避免移除已重连的新连接）
          if (currentSocket && currentSocket.id === socket.id) {
            this.slaveSockets.delete(machineId);
            logger.info(`Slave socket removed from registry: ${machineId}`);
          }
        }
      });

      // 错误处理
      socket.on('error', (error) => {
        logger.error('Socket error:', error);
      });
    });
  }

  /**
   * 处理从机注册
   */
  private async handleSlaveRegister(socket: Socket, data: any): Promise<void> {
    try {
      const { id, name, ipAddress, apiPort, role, status } = data;

      logger.info(`Slave registering via WebSocket: ${id} (${ipAddress}:${apiPort})`);

      // 检查从机是否已存在
      const existing = await query<any>('SELECT id FROM machines WHERE id = ?', [id]);

      if (existing.length > 0) {
        // 已存在：更新信息
        await query(
          `UPDATE machines SET
            name = ?,
            ip_address = ?,
            api_port = ?,
            role = ?,
            status = ?,
            last_heartbeat = ?
          WHERE id = ?`,
          [name, ipAddress, apiPort, role, status, Date.now(), id]
        );
        logger.info(`Slave re-registered: ${id}`);
      } else {
        // 不存在：插入新记录
        await query(
          `INSERT INTO machines (id, name, ip_address, api_port, role, status, last_heartbeat, total_tasks)
           VALUES (?, ?, ?, ?, ?, ?, ?, 0)`,
          [id, name, ipAddress, apiPort, role, status, Date.now()]
        );
        logger.info(`Slave registered: ${id}`);
      }

      // 同步更新 total_tasks
      await query(
        `UPDATE machines m
         SET total_tasks = (
           SELECT COUNT(*) FROM task_history
           WHERE machine_id COLLATE utf8mb4_unicode_ci = m.id COLLATE utf8mb4_unicode_ci
         )
         WHERE m.id = ?`,
        [id]
      );

      // 保存从机 socket 到映射表（主机模式）
      if (config.node.role === 'master') {
        // 移除旧连接（如果存在）
        const oldSocket = this.slaveSockets.get(id);
        if (oldSocket && oldSocket.id !== socket.id) {
          oldSocket.disconnect();
        }

        // 保存新连接
        this.slaveSockets.set(id, socket);
        socket.data = { machineId: id, role: 'slave' }; // 标记 socket 身份
        logger.info(`Slave socket saved to registry: ${id} (socket: ${socket.id})`);

        // 注册 ACK 响应监听器
        this.registerSlaveAckHandlers(socket);
      }

      // 确认注册成功
      socket.emit('slave:register:ack', { success: true, machineId: id });
    } catch (error: any) {
      logger.error('Failed to handle slave register:', error);
      socket.emit('slave:register:ack', { success: false, error: error.message });
    }
  }

  /**
   * 处理从机心跳
   */
  private async handleSlaveHeartbeat(socket: Socket, data: any): Promise<void> {
    try {
      const { id, status, cpuUsage, memoryUsage, runningTasks } = data;

      await query(
        `UPDATE machines SET
          status = ?,
          cpu_usage = ?,
          memory_usage = ?,
          running_tasks = ?,
          last_heartbeat = ?
        WHERE id = ?`,
        [status, cpuUsage, memoryUsage, runningTasks, Date.now(), id]
      );

      logger.debug(`Heartbeat received from slave: ${id} (CPU: ${cpuUsage}%, MEM: ${memoryUsage}%, Tasks: ${runningTasks})`);

      // 确认心跳接收（可选）
      socket.emit('slave:heartbeat:ack', { success: true });
    } catch (error: any) {
      logger.error('Failed to handle slave heartbeat:', error);
    }
  }

  /**
   * 处理从机离线
   */
  private async handleSlaveOffline(socket: Socket, data: any): Promise<void> {
    try {
      const { id, status } = data;

      await query(
        `UPDATE machines SET
          status = ?,
          running_tasks = 0,
          last_heartbeat = ?
        WHERE id = ?`,
        [status, Date.now(), id]
      );

      logger.info(`Slave marked as offline: ${id}`);

      // 确认离线通知
      socket.emit('slave:offline:ack', { success: true });
    } catch (error: any) {
      logger.error('Failed to handle slave offline:', error);
    }
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
    sippProcessManager.on('stopped', async (data) => {
      const taskId = data.taskId;
      if (taskId) {
        // 更新任务状态为 STOPPED 并归档到任务历史
        try {
          // 尝试读取CSV统计数据
          let stats: any = undefined;
          try {
            const csvPath = path.join(config.sipp.logDir, `${taskId}_stats.csv`);
            if (fs.existsSync(csvPath)) {
              const parser = new CsvParser({ filePath: csvPath, watchMode: false });
              const csvStats = await parser.getLatest();
              if (csvStats) {
                const successRate = csvStats.totalCalls > 0
                  ? Math.round((csvStats.successCalls / csvStats.totalCalls) * 10000) / 100
                  : 0;
                stats = {
                  totalCalls: csvStats.totalCalls,
                  successCalls: csvStats.successCalls,
                  failedCalls: csvStats.failedCalls,
                  successRate,
                };
              }
            }
          } catch (csvErr: any) {
            logger.warn('Failed to read CSV stats for stopped task', {
              taskId,
              error: csvErr.message,
            });
          }

          // 更新数据库状态
          await taskHistoryRepository.update(taskId, {
            status: 'STOPPED',
            stats,
            end_time: Date.now(),
          });

          logger.info('Task status updated to STOPPED in database', { taskId, hasStats: !!stats });

          // 从机模式：上传日志到主机并删除本地日志
          if (config.node.role === 'slave') {
            try {
              await this.uploadLogsToMaster(taskId);
            } catch (uploadErr: any) {
              logger.error(`Failed to upload logs for stopped task ${taskId}: ${uploadErr.message || String(uploadErr)}`);
            }
          }
        } catch (dbErr: any) {
          logger.error('Failed to update stopped task status in database', {
            taskId,
            error: dbErr.message,
          });
        }

        // 广播 WebSocket 消息
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

    // 查找所有与该任务相关的日志文件（只包含文件，不包含目录）
    const files = fs.readdirSync(logDir);
    const taskLogFiles = files.filter(f => {
      const filePath = path.join(logDir, f);
      try {
        return f.includes(taskId) && fs.statSync(filePath).isFile();
      } catch (error) {
        return false;
      }
    });

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

      // 上传成功后删除本地日志文件（只删除文件，不删除目录）
      for (const file of taskLogFiles) {
        try {
          const filePath = path.join(logDir, file);
          if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
            fs.unlinkSync(filePath);
            logger.debug(`Deleted local log file: ${file}`);
          }
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
   * 通过 WebSocket 向从机发送命令（主机专用）
   * 使用请求-响应模式，返回 Promise
   *
   * @param machineId 从机ID
   * @param event 事件名称
   * @param data 数据载荷
   * @param timeoutMs 超时时间（毫秒，默认30秒）
   * @returns Promise<响应数据>
   */
  async sendCommandToSlave(
    machineId: string,
    event: string,
    data: any,
    timeoutMs: number = 30000
  ): Promise<any> {
    if (config.node.role !== 'master') {
      throw new Error('sendCommandToSlave can only be called on master node');
    }

    const socket = this.slaveSockets.get(machineId);
    if (!socket || !socket.connected) {
      throw new Error(`Slave ${machineId} is not connected`);
    }

    // 生成唯一请求ID
    const requestId = `${Date.now()}-${Math.random().toString(36).substring(2, 11)}`;

    return new Promise((resolve, reject) => {
      // 设置超时
      const timeout: any = setTimeout(() => {
        this.pendingRequests.delete(requestId);
        reject(new Error(`Command timeout: ${event} to slave ${machineId}`));
      }, timeoutMs);

      // 保存到待处理请求
      this.pendingRequests.set(requestId, { resolve, reject, timeout });

      // 发送命令
      socket.emit(event, { requestId, ...data });

      logger.debug(`Command sent to slave ${machineId}: ${event} (requestId: ${requestId})`);
    });
  }

  /**
   * 为从机 socket 注册 ACK 响应监听器
   * 当从机完成命令执行后发送 ACK 事件，通过此监听器 resolve 对应的 Promise
   */
  private registerSlaveAckHandlers(socket: Socket): void {
    // 任务启动 ACK
    socket.on('task:start:ack', (data: any) => {
      this.handleSlaveResponse('task:start:ack', data);
    });

    // 任务停止 ACK
    socket.on('task:stop:ack', (data: any) => {
      this.handleSlaveResponse('task:stop:ack', data);
    });

    // 任务状态请求 ACK
    socket.on('task:stats:request:ack', (data: any) => {
      this.handleSlaveResponse('task:stats:request:ack', data);
    });

    logger.debug(`Registered ACK handlers for slave socket: ${socket.id}`);
  }

  /**
   * 处理从机响应（通用ACK处理器）
   * 从机的所有 ACK 事件应调用此方法
   */
  private handleSlaveResponse(ackEvent: string, data: any): void {
    const { requestId, success, error, ...rest } = data;

    if (!requestId) {
      logger.warn(`Received ${ackEvent} without requestId`);
      return;
    }

    const pending = this.pendingRequests.get(requestId);
    if (!pending) {
      logger.debug(`Received ${ackEvent} for unknown requestId: ${requestId}`);
      return;
    }

    // 清除超时
    clearTimeout(pending.timeout);
    this.pendingRequests.delete(requestId);

    // 解决 Promise
    if (success) {
      pending.resolve(rest);
      logger.debug(`Command succeeded: ${ackEvent} (requestId: ${requestId})`);
    } else {
      pending.reject(new Error(error || `Command failed: ${ackEvent}`));
      logger.warn(`Command failed: ${ackEvent} (requestId: ${requestId}), error: ${error}`);
    }
  }

  /**
   * 获取连接的从机列表
   */
  getConnectedSlaves(): string[] {
    return Array.from(this.slaveSockets.keys());
  }

  /**
   * 检查从机是否已连接
   */
  isSlaveConnected(machineId: string): boolean {
    const socket = this.slaveSockets.get(machineId);
    return socket !== undefined && socket.connected;
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
