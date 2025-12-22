import { config } from '../config';
import { logger } from '../utils/logger';
import { query } from '../database';
import { sippProcessManager } from './sipp-process';
import os from 'os';
import { execSync } from 'child_process';

/**
 * 主机自注册服务
 * 职责：主机节点定期更新自己的状态到 machines 表
 *
 * Kernel 风格设计：
 * - 数据结构驱动：直接操作数据库，复用 machines 表结构
 * - 简化策略：无需网络调用，本地写入即可
 * - 最小复杂度：仅 3 个方法（start/stop/update）
 */
export class MasterRegistryService {
  private timer: NodeJS.Timeout | null = null;
  private readonly machineId = config.node.machineId;
  private readonly interval = 10000; // 10秒更新一次
  private sippVersionCache: string | null = null; // 缓存SIPp版本

  /**
   * 启动主机注册服务
   */
  start(): void {
    if (config.node.role !== 'master') {
      logger.info('Master registry service skipped: not a master node');
      return;
    }

    // 首次注册
    this.register().catch(err => {
      logger.error('Failed to register master machine:', err);
    });

    // 定期更新状态
    this.timer = setInterval(() => {
      this.updateStatus().catch(err => {
        logger.error('Master status update failed:', err);
      });
    }, this.interval);

    logger.info(`Master registry service started: ${this.machineId} (interval: ${this.interval}ms)`);
  }

  /**
   * 停止主机注册服务
   */
  stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }

    // 标记离线
    this.setOffline().catch(err => {
      logger.error('Failed to set master offline:', err);
    });

    logger.info('Master registry service stopped');
  }

  /**
   * 注册主机（首次或重启）
   */
  private async register(): Promise<void> {
    try {
      const ip = this.getLocalIP();

      // 使用缓存的 SIPp 版本（首次获取后缓存）
      if (this.sippVersionCache === null) {
        this.sippVersionCache = this.getSippVersion();
      }

      const stats = this.getSystemStats();
      const runningTasks = sippProcessManager.getRunningCount();

      await query(`
        INSERT INTO machines (
          id, name, ip_address, api_port, role, sipp_version,
          status, cpu_usage, memory_usage, running_tasks, last_heartbeat
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON DUPLICATE KEY UPDATE
          name = VALUES(name),
          ip_address = VALUES(ip_address),
          api_port = VALUES(api_port),
          sipp_version = VALUES(sipp_version),
          status = VALUES(status),
          cpu_usage = VALUES(cpu_usage),
          memory_usage = VALUES(memory_usage),
          running_tasks = VALUES(running_tasks),
          last_heartbeat = VALUES(last_heartbeat)
      `, [
        this.machineId,
        config.node.machineName || this.machineId,
        ip,
        config.server.port,
        'master',
        this.sippVersionCache,
        'online',
        stats.cpu,
        stats.memory,
        runningTasks,
        Date.now(),
      ]);

      // 同步更新 total_tasks（从 task_history 统计）
      await query(`
        UPDATE machines m
        SET total_tasks = (
          SELECT COUNT(*) FROM task_history
          WHERE machine_id COLLATE utf8mb4_unicode_ci = m.id COLLATE utf8mb4_unicode_ci
        )
        WHERE m.id = ?
      `, [this.machineId]);

      logger.info(`Master machine registered: ${this.machineId} (${ip}:${config.server.port})`);
    } catch (error: any) {
      logger.error('Failed to register master machine:', { error: error.message, machineId: this.machineId });
      throw error;
    }
  }

  /**
   * 更新主机状态
   */
  private async updateStatus(): Promise<void> {
    try {
      const stats = this.getSystemStats();
      const runningTasks = sippProcessManager.getRunningCount();

      await query(`
        UPDATE machines
        SET
          status = ?,
          cpu_usage = ?,
          memory_usage = ?,
          running_tasks = ?,
          last_heartbeat = ?
        WHERE id = ?
      `, [
        'online',
        stats.cpu,
        stats.memory,
        runningTasks,
        Date.now(),
        this.machineId,
      ]);

      // 同步更新 total_tasks
      await query(`
        UPDATE machines m
        SET total_tasks = (
          SELECT COUNT(*) FROM task_history
          WHERE machine_id COLLATE utf8mb4_unicode_ci = m.id COLLATE utf8mb4_unicode_ci
        )
        WHERE m.id = ?
      `, [this.machineId]);

      logger.debug(`Master status updated: ${this.machineId} (CPU: ${stats.cpu}%, MEM: ${stats.memory}%, Tasks: ${runningTasks})`);
    } catch (error: any) {
      logger.error('Failed to update master status:', { error: error.message, machineId: this.machineId });
      // 不抛出异常，允许下次重试
    }
  }

  /**
   * 标记主机离线
   */
  private async setOffline(): Promise<void> {
    try {
      await query(`
        UPDATE machines
        SET status = ?, last_heartbeat = ?
        WHERE id = ?
      `, ['offline', Date.now(), this.machineId]);

      logger.info(`Master machine marked as offline: ${this.machineId}`);
    } catch (error: any) {
      logger.error('Failed to set master offline:', { error: error.message, machineId: this.machineId });
    }
  }

  /**
   * 获取系统统计信息
   */
  private getSystemStats(): { cpu: number; memory: number } {
    const cpus = os.cpus();
    const totalMem = os.totalmem();
    const freeMem = os.freemem();

    // CPU 使用率（简化计算：1 - idle/total）
    const cpuUsage = cpus.reduce((acc, cpu) => {
      const total = Object.values(cpu.times).reduce((a, b) => a + b, 0);
      const idle = cpu.times.idle;
      return acc + (1 - idle / total) * 100;
    }, 0) / cpus.length;

    // 内存使用率
    const memoryUsage = ((totalMem - freeMem) / totalMem) * 100;

    return {
      cpu: Math.round(cpuUsage * 100) / 100,
      memory: Math.round(memoryUsage * 100) / 100,
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
    } catch {
      return 'unknown';
    }
  }
}

export const masterRegistryService = new MasterRegistryService();
