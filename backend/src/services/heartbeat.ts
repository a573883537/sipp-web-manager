import { config } from '../config';
import { logger } from '../utils/logger';
import { sippProcessManager } from './sipp-process';
import os from 'os';
import { execSync } from 'child_process';
import axios from 'axios';

/**
 * 从机心跳服务
 * 职责：定期通过HTTP API向主机上报本机状态
 *
 * Kernel 风格设计：
 * - 数据结构驱动：状态信息统一格式
 * - API通信：去除数据库依赖，仅通过主机API交互
 * - 自动恢复：网络故障自动重试
 * - 最小复杂度：仅 3 个方法（start/stop/report）
 */
export class HeartbeatService {
  private timer: NodeJS.Timeout | null = null;
  private readonly machineId = config.node.machineId;
  private readonly machineName = config.node.machineName;
  private readonly interval = config.node.heartbeatInterval;
  private readonly masterApiUrl: string;
  private sippVersionCache: string | null = null; // 缓存SIPp版本
  private lastCpuTimes: { idle: number; total: number } | null = null; // 上次CPU时间采样

  constructor() {
    // 构建主机API地址
    this.masterApiUrl = `http://${config.node.masterHost}:${config.node.masterPort}/api`;
  }

  /**
   * 启动心跳服务
   */
  start(): void {
    if (config.node.role !== 'slave') {
      logger.info('Heartbeat service skipped: not a slave node');
      return;
    }

    // 首次注册
    this.register().catch(err => {
      logger.error('Failed to register machine:', err);
    });

    // 定期心跳
    this.timer = setInterval(() => {
      this.sendHeartbeat().catch(err => {
        logger.error('Heartbeat failed:', err);
      });
    }, this.interval);

    logger.info(`Heartbeat service started: ${this.machineId} (interval: ${this.interval}ms)`);
    logger.info(`Master API: ${this.masterApiUrl}`);
  }

  /**
   * 停止心跳服务
   */
  stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }

    // 标记离线
    this.setOffline().catch(err => {
      logger.error('Failed to set offline:', err);
    });

    logger.info('Heartbeat service stopped');
  }

  /**
   * 注册从机（首次或重启）
   */
  private async register(): Promise<void> {
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
        lastHeartbeat: Date.now(),
      };

      await axios.post(`${this.masterApiUrl}/machines/heartbeat`, payload, {
        timeout: 5000,
        headers: { 'Content-Type': 'application/json' },
      });

      logger.info(`Machine registered: ${this.machineId} (${ip}:${config.server.port})`);
    } catch (error: any) {
      const errorMsg = error.response?.data?.error || error.message || String(error);
      logger.error('Failed to register machine:', { error: errorMsg, machineId: this.machineId });
      throw error;
    }
  }

  /**
   * 发送心跳（更新状态）
   */
  private async sendHeartbeat(): Promise<void> {
    try {
      const stats = this.getSystemStats();

      // 使用缓存的 SIPp 版本（首次获取后缓存）
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
        lastHeartbeat: Date.now(),
      };

      await axios.post(`${this.masterApiUrl}/machines/heartbeat`, payload, {
        timeout: 5000,
        headers: { 'Content-Type': 'application/json' },
      });

      logger.debug(`Heartbeat sent: ${this.machineId} (CPU: ${stats.cpu}%, MEM: ${stats.memory}%, Tasks: ${runningTasks}, SIPp: ${this.sippVersionCache})`);
    } catch (error: any) {
      const errorMsg = error.response?.data?.error || error.message || String(error);
      logger.error('Failed to send heartbeat:', { error: errorMsg, machineId: this.machineId, url: this.masterApiUrl });
      // 不抛出异常，允许下次重试
    }
  }

  /**
   * 标记离线
   */
  private async setOffline(): Promise<void> {
    try {
      const payload = {
        id: this.machineId,
        status: 'offline' as const,
        lastHeartbeat: Date.now(),
      };

      await axios.post(`${this.masterApiUrl}/machines/heartbeat`, payload, {
        timeout: 3000,
        headers: { 'Content-Type': 'application/json' },
      });

      logger.info(`Machine marked as offline: ${this.machineId}`);
    } catch (error: any) {
      const errorMsg = error.response?.data?.error || error.message || String(error);
      logger.error('Failed to set offline:', { error: errorMsg, machineId: this.machineId });
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
    
    // 计算当前 CPU 时间
    const currentIdle = cpus.reduce((acc, cpu) => acc + cpu.times.idle, 0);
    const currentTotal = cpus.reduce((acc, cpu) => {
      return acc + Object.values(cpu.times).reduce((a, b) => a + b, 0);
    }, 0);

    if (this.lastCpuTimes) {
      // 有上次采样数据，计算使用率
      const idleDiff = currentIdle - this.lastCpuTimes.idle;
      const totalDiff = currentTotal - this.lastCpuTimes.total;
      
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

      // 匹配格式: "SIPp v3.7.5-20-g66074c1-TLS-PCAP-SHA256"
      const match = output.match(/SIPp\s+v(\S+)/i);
      if (match) {
        // 移除末尾的点号（如果有）
        return match[1].replace(/\.$/, '');
      }
      return 'unknown';
    } catch (error: any) {
      return 'unknown';
    }
  }
}

export const heartbeatService = new HeartbeatService();
