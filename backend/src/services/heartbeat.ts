import { config } from '../config';
import { logger } from '../utils/logger';
import { sippProcessManager } from './sipp-process';
import os from 'os';
import { execSync } from 'child_process';
import { io, Socket } from 'socket.io-client';

/**
 * 从机心跳服务（WebSocket客户端）
 * 职责：通过WebSocket长连接向主机上报本机状态
 *
 * Kernel 风格设计：
 * - 数据结构驱动：心跳包统一JSON格式
 * - WebSocket长连接：单一连接复用，消除TCP短连接问题
 * - 自动恢复：网络故障自动重连，带指数退避（exponential backoff）
 * - 最小复杂度：仅 3 个方法（start/stop/send）
 */
export class HeartbeatService {
  private timer: NodeJS.Timeout | null = null;
  private readonly machineId = config.node.machineId;
  private readonly machineName = config.node.machineName;
  private readonly baseInterval = config.node.heartbeatInterval;
  private readonly masterWsUrl: string;
  private socket: Socket | null = null;
  private sippVersionCache: string | null = null;
  private lastCpuTimes: { idle: number; total: number } | null = null;

  // 退避策略相关字段
  private consecutiveFailures = 0;
  private currentInterval = config.node.heartbeatInterval;

  constructor() {
    // 构建主机WebSocket地址
    this.masterWsUrl = `http://${config.node.masterHost}:${config.node.masterPort}`;
  }

  /**
   * 启动心跳服务
   */
  start(): void {
    if (config.node.role !== 'slave') {
      logger.info('Heartbeat service skipped: not a slave node');
      return;
    }

    // 创建WebSocket连接（单一长连接）
    this.socket = io(this.masterWsUrl, {
      reconnection: true,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
      reconnectionAttempts: Infinity,
      transports: ['websocket'],
    });

    // 监听连接成功事件
    this.socket.on('connect', () => {
      logger.info(`WebSocket connected to master: ${this.masterWsUrl}`);

      // 连接成功后立即注册
      this.register();

      // 重置失败计数器
      this.onHeartbeatSuccess();
    });

    // 监听断开事件
    this.socket.on('disconnect', (reason: string) => {
      logger.warn(`WebSocket disconnected: ${reason}`);
      this.onHeartbeatFailure();
    });

    // 监听连接错误
    this.socket.on('connect_error', (error: Error) => {
      logger.error('WebSocket connection error:', { error: error.message });
      this.onHeartbeatFailure();
    });

    // 定期心跳（使用动态间隔）
    this.scheduleNextHeartbeat();

    logger.info(`Heartbeat service started: ${this.machineId} (base interval: ${this.baseInterval}ms)`);
    logger.info(`Master WebSocket URL: ${this.masterWsUrl}`);
    if (config.node.heartbeatBackoffEnabled) {
      logger.info(`Exponential backoff enabled (max interval: ${config.node.heartbeatMaxRetryInterval}ms)`);
    }
  }

  /**
   * 调度下次心跳
   */
  private scheduleNextHeartbeat(): void {
    if (this.timer) {
      clearTimeout(this.timer);
    }

    this.timer = setTimeout(() => {
      this.sendHeartbeat();
      // 继续调度下次心跳
      this.scheduleNextHeartbeat();
    }, this.currentInterval);
  }

  /**
   * 停止心跳服务
   */
  stop(): void {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }

    // 发送离线通知
    this.setOffline();

    // 关闭WebSocket连接
    if (this.socket) {
      this.socket.disconnect();
      this.socket = null;
    }

    logger.info('Heartbeat service stopped');
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

      // 使用缓存的 SIPp 版本（首次获取后缓存）
      if (this.sippVersionCache === null) {
        this.sippVersionCache = this.getSippVersion();
      }

      const payload = {
        id: this.machineId,
        name: this.machineName,
        ipAddress: ip,
        apiPort: config.server.port,
        role: 'slave' as const,
        sippVersion: this.sippVersionCache,
        status: 'online' as const,
      };

      this.socket.emit('slave:register', payload);

      logger.info(`Machine registering via WebSocket: ${this.machineId} (${ip}:${config.server.port})`);
    } catch (error: any) {
      logger.error('Failed to register machine:', { error: error.message, machineId: this.machineId });
    }
  }

  /**
   * 发送心跳（更新状态）
   */
  private sendHeartbeat(): void {
    if (!this.socket || !this.socket.connected) {
      logger.debug('Skipping heartbeat: WebSocket not connected');
      return;
    }

    try {
      const stats = this.getSystemStats();

      // 使用缓存的 SIPp 版本
      if (this.sippVersionCache === null) {
        this.sippVersionCache = this.getSippVersion();
      }

      // 从本地 sippProcessManager 获取运行任务数
      const runningTasks = sippProcessManager.getRunningCount();

      const payload = {
        id: this.machineId,
        status: 'online' as const,
        sippVersion: this.sippVersionCache,
        cpuUsage: stats.cpu,
        memoryUsage: stats.memory,
        runningTasks,
      };

      this.socket.emit('slave:heartbeat', payload);

      logger.debug(`Heartbeat sent via WebSocket: ${this.machineId} (CPU: ${stats.cpu}%, MEM: ${stats.memory}%, Tasks: ${runningTasks})`);
    } catch (error: any) {
      logger.error('Failed to send heartbeat:', { error: error.message, machineId: this.machineId });
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
   * 心跳成功处理（重置退避）
   */
  private onHeartbeatSuccess(): void {
    if (this.consecutiveFailures > 0) {
      logger.info(`Heartbeat recovered after ${this.consecutiveFailures} failures, reset interval to ${this.baseInterval}ms`);
      this.consecutiveFailures = 0;
      this.currentInterval = this.baseInterval;
    }
  }

  /**
   * 心跳失败处理（应用指数退避）
   */
  private onHeartbeatFailure(): void {
    if (!config.node.heartbeatBackoffEnabled) {
      return;
    }

    this.consecutiveFailures++;

    // 指数退避公式：interval = baseInterval * 2^failures
    const backoffInterval = Math.min(
      this.baseInterval * Math.pow(2, this.consecutiveFailures),
      config.node.heartbeatMaxRetryInterval
    );

    if (backoffInterval !== this.currentInterval) {
      this.currentInterval = backoffInterval;
      logger.warn(
        `Heartbeat failure #${this.consecutiveFailures}, increasing interval to ${this.currentInterval}ms` +
        ` (max: ${config.node.heartbeatMaxRetryInterval}ms)`
      );
    }
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

  /**
   * 获取 SIPp 版本
   */
  private getSippVersion(): string {
    try {
      const output = execSync('sipp -v', {
        encoding: 'utf-8',
        timeout: 3000,
      });

      const match = output.match(/SIPp\s+v(\S+)/i);
      if (match) {
        return match[1].replace(/\.$/, '');
      }
      return 'unknown';
    } catch (error: any) {
      return 'unknown';
    }
  }
}

export const heartbeatService = new HeartbeatService();
