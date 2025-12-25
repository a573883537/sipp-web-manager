import { config } from '../config';
import { logger } from '../utils/logger';
import { sippProcessManager } from './sipp-process';
import os from 'os';
import { io, Socket } from 'socket.io-client';
import { SlaveCommandHandler } from './slave-command-handler';

/**
 * 从机连接管理服务（WebSocket客户端）
 * 职责：维护与主机的 WebSocket 长连接，按需上报状态
 *
 * Kernel 风格设计：
 * - 连接保活：依赖 Socket.IO 内置 ping/pong（25秒间隔）
 * - 状态上报：按需发送（任务变化时）或响应主机请求
 * - 命令处理：接收并执行主机指令（预留）
 * - 断线恢复：自动重连并同步状态
 *
 * 设计原则：
 * - 无周期性轮询：Socket.IO 的 ping/pong 足以保持连接活性
 * - 事件驱动上报：仅在状态变化或被请求时上报
 * - 最小网络开销：消除不必要的应用层心跳包
 */
export class SlaveConnectionService {
  private socket: Socket | null = null;
  private readonly machineId = config.node.machineId;
  private readonly machineName = config.node.machineName;
  private readonly masterWsUrl: string;
  private lastCpuTimes: { idle: number; total: number } | null = null;
  private commandHandler: SlaveCommandHandler | null = null;

  // 重连退避策略相关字段
  private consecutiveFailures = 0;

  constructor() {
    // 构建主机WebSocket地址
    this.masterWsUrl = `http://${config.node.masterHost}:${config.node.masterPort}`;
  }

  /**
   * 启动连接服务
   */
  start(): void {
    if (config.node.role !== 'slave') {
      logger.info('Slave connection service skipped: not a slave node');
      return;
    }

    // 创建WebSocket连接（单一长连接）
    this.socket = io(this.masterWsUrl, {
      reconnection: true,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
      reconnectionAttempts: Infinity,
      transports: ['websocket'],
      // Socket.IO 默认 pingInterval: 25000, pingTimeout: 20000
      // 无需应用层心跳，依赖 Socket.IO 内置 ping/pong
    });

    // 监听连接成功事件
    this.socket.on('connect', () => {
      logger.info(`WebSocket connected to master: ${this.masterWsUrl}`);

      // 连接成功后立即注册
      this.register();

      // 初始化命令处理器（处理主机命令）
      if (!this.commandHandler && this.socket) {
        this.commandHandler = new SlaveCommandHandler(this.socket);
      }

      // 重置失败计数器
      this.onConnectionRecovered();
    });

    // 监听断开事件
    this.socket.on('disconnect', (reason: string) => {
      logger.warn(`WebSocket disconnected: ${reason}`);
      this.onConnectionLost();
    });

    // 监听连接错误
    this.socket.on('connect_error', (error: Error) => {
      logger.error('WebSocket connection error:', { error: error.message });
      this.onConnectionLost();
    });

    // 监听主机请求状态上报
    this.socket.on('status:request', () => {
      this.reportStatus();
    });

    logger.info(`Slave connection service started: ${this.machineId}`);
    logger.info(`Master WebSocket URL: ${this.masterWsUrl}`);
    logger.info('Status reporting mode: on-demand (event-driven)');
  }

  /**
   * 停止连接服务
   */
  stop(): void {
    // 发送离线通知
    this.setOffline();

    // 关闭WebSocket连接
    if (this.socket) {
      this.socket.disconnect();
      this.socket = null;
    }

    logger.info('Slave connection service stopped');
  }

  /**
   * 注册从机（首次连接或重连）
   */
  private register(): void {
    if (!this.socket || !this.socket.connected) {
      logger.warn('Cannot register: WebSocket not connected');
      return;
    }

    try {
      const ip = this.getLocalIP();

      const payload = {
        id: this.machineId,
        name: this.machineName,
        ipAddress: ip,
        apiPort: config.server.port,
        role: 'slave' as const,
        status: 'online' as const,
      };

      this.socket.emit('slave:register', payload);

      logger.info(`Machine registering via WebSocket: ${this.machineId} (${ip}:${config.server.port})`);
    } catch (error: any) {
      logger.error('Failed to register machine:', { error: error.message, machineId: this.machineId });
    }
  }

  /**
   * 按需上报状态（公开方法，供外部调用）
   * 使用场景：
   * - 任务启动/停止/完成时主动上报
   * - 响应主机的 status:request 事件
   * - 系统资源发生显著变化时
   */
  public reportStatus(): void {
    if (!this.socket || !this.socket.connected) {
      logger.debug('Cannot report status: WebSocket not connected');
      return;
    }

    try {
      const stats = this.getSystemStats();

      // 从本地 sippProcessManager 获取运行任务数
      const runningTasks = sippProcessManager.getRunningCount();

      const payload = {
        id: this.machineId,
        status: 'online' as const,
        cpuUsage: stats.cpu,
        memoryUsage: stats.memory,
        runningTasks,
      };

      this.socket.emit('slave:heartbeat', payload);

      logger.debug(`Status reported: ${this.machineId} (CPU: ${stats.cpu}%, MEM: ${stats.memory}%, Tasks: ${runningTasks})`);
    } catch (error: any) {
      logger.error('Failed to report status:', { error: error.message, machineId: this.machineId });
    }
  }

  /**
   * 标记离线
   */
  private setOffline(): void {
    if (!this.socket) {
      return;
    }

    try {
      const payload = {
        id: this.machineId,
        status: 'offline' as const,
      };

      this.socket.emit('slave:offline', payload);

      logger.info(`Machine marked as offline via WebSocket: ${this.machineId}`);
    } catch (error: any) {
      logger.error('Failed to set offline:', { error: error.message, machineId: this.machineId });
    }
  }

  /**
   * 连接恢复处理（重置退避计数）
   */
  private onConnectionRecovered(): void {
    if (this.consecutiveFailures > 0) {
      logger.info(`Connection recovered after ${this.consecutiveFailures} failures`);
      this.consecutiveFailures = 0;
    }
  }

  /**
   * 连接丢失处理（记录失败次数，供调试）
   */
  private onConnectionLost(): void {
    this.consecutiveFailures++;
    logger.debug(`Connection failure count: ${this.consecutiveFailures}`);
  }

  /**
   * 获取系统统计信息
   */
  private getSystemStats(): { cpu: number; memory: number } {
    const cpus = os.cpus();
    const totalMem = os.totalmem();
    const freeMem = os.freemem();

    // CPU 使用率计算（需要两次采样的差值）
    let cpuUsage = 0;

    const currentIdle = cpus.reduce((acc, cpu) => acc + cpu.times.idle, 0);
    const currentTotal = cpus.reduce((acc, cpu) => {
      return acc + Object.values(cpu.times).reduce((a, b) => a + b, 0);
    }, 0);

    if (this.lastCpuTimes) {
      const idleDiff = currentIdle - this.lastCpuTimes.idle;
      const totalDiff = currentTotal - this.lastCpuTimes.total;

      if (totalDiff > 0) {
        cpuUsage = ((totalDiff - idleDiff) / totalDiff) * 100;
      }
    } else {
      // 首次采样：等待100ms后再次采样
      const sleepMs = 100;
      const start = Date.now();
      while (Date.now() - start < sleepMs) {
        // 短暂等待
      }

      const cpus2 = os.cpus();
      const idle2 = cpus2.reduce((acc, cpu) => acc + cpu.times.idle, 0);
      const total2 = cpus2.reduce((acc, cpu) => {
        return acc + Object.values(cpu.times).reduce((a, b) => a + b, 0);
      }, 0);

      const idleDiff = idle2 - currentIdle;
      const totalDiff = total2 - currentTotal;

      if (totalDiff > 0) {
        cpuUsage = ((totalDiff - idleDiff) / totalDiff) * 100;
      }
    }

    // 保存当前采样供下次使用
    this.lastCpuTimes = { idle: currentIdle, total: currentTotal };

    // 内存使用率
    const memoryUsage = ((totalMem - freeMem) / totalMem) * 100;

    return {
      cpu: Math.max(0, Math.min(100, Math.round(cpuUsage * 100) / 100)),
      memory: Math.max(0, Math.min(100, Math.round(memoryUsage * 100) / 100)),
    };
  }

  /**
   * 获取本地IP（优先内网地址）
   */
  private getLocalIP(): string {
    const interfaces = os.networkInterfaces();

    // 优先查找内网 IP（192.168.x.x 或 10.x.x.x）
    for (const name of Object.keys(interfaces)) {
      for (const iface of interfaces[name] || []) {
        if (iface.family === 'IPv4' && !iface.internal) {
          return iface.address;
        }
      }
    }

    return '127.0.0.1';
  }
}

export const slaveConnectionService = new SlaveConnectionService();
