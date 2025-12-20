import { Server as SocketIOServer, Socket } from 'socket.io';
import { Server as HttpServer } from 'http';
import { config } from '../config';
import { logger } from '../utils/logger';
import { sippClient } from '../services/sipp-client';
import { sippProcessManager } from '../services/sipp-process';
import { CsvParser } from '../parsers/csv-parser';

/**
 * WebSocket服务
 * 职责：管理WebSocket连接，实时推送SIPp数据到前端
 * 遵循单一职责原则和依赖倒置原则
 */
export class WebSocketService {
  private io: SocketIOServer;
  private csvParser: CsvParser | null = null;
  private statsInterval: NodeJS.Timeout | null = null;

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
      const taskId = (sippProcessManager as any).currentTaskId;
      if (taskId) {
        this.broadcast('task:started', {
          taskId,
          timestamp: Date.now(),
          pid: data.pid,
        });
        logger.info('Task started', { taskId, pid: data.pid });
      }
    });

    // 进程退出
    sippProcessManager.on('exit', (data) => {
      const taskId = (sippProcessManager as any).currentTaskId;
      if (taskId) {
        // 根据退出码判断是成功还是失败
        const isSuccess = data.code === 0;
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
        // 清除任务 ID
        (sippProcessManager as any).currentTaskId = null;
      }
    });

    // 进程错误
    sippProcessManager.on('error', (error) => {
      const taskId = (sippProcessManager as any).currentTaskId;
      if (taskId) {
        this.broadcast('task:failed', {
          taskId,
          timestamp: Date.now(),
          error: error.message,
        });
        logger.error('Task failed', { taskId, error: error.message });
        // 清除任务 ID
        (sippProcessManager as any).currentTaskId = null;
      }
    });

    // 主动停止
    sippProcessManager.on('stopped', () => {
      const taskId = (sippProcessManager as any).currentTaskId;
      if (taskId) {
        this.broadcast('task:stopped', {
          taskId,
          timestamp: Date.now(),
        });
        logger.info('Task stopped', { taskId });
        // 清除任务 ID
        (sippProcessManager as any).currentTaskId = null;
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
    this.io.close();
    logger.info('WebSocket service closed');
  }
}
