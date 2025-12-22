import axios, { AxiosError } from 'axios';
import { config } from '../config';
import { query } from '../database';
import { logger } from '../utils/logger';
import * as fs from 'fs';
import * as path from 'path';

/**
 * 从机信息
 */
interface SlaveInfo {
  id: string;
  name: string;
  ipAddress: string;
  apiPort: number;
  status: 'online' | 'offline' | 'busy';
  cpuUsage?: number;
  memoryUsage?: number;
  runningTasks: number;
  totalTasks: number;
  lastHeartbeat: number;
}

/**
 * 从机管理服务
 * 职责：主机端管理和调度从机资源
 *
 * Kernel 风格设计：
 * - 数据驱动：基于 machines 表状态做决策
 * - 简单直接：HTTP + 超时 + 重试
 * - 容错性：从机离线自动降级
 */
export class SlaveManager {
  private readonly requestTimeout = 30000; // 30s

  /**
   * 查询所有可用从机（在线且非繁忙）
   */
  async getAvailableSlaves(): Promise<SlaveInfo[]> {
    if (config.node.role !== 'master') {
      throw new Error('SlaveManager can only run on master node');
    }

    try {
      const rows = await query(`
        SELECT
          id, name, ip_address, api_port, status,
          cpu_usage, memory_usage, running_tasks, total_tasks, last_heartbeat
        FROM machines
        WHERE role = 'slave' AND status = 'online'
        ORDER BY running_tasks ASC, cpu_usage ASC
      `);

      return (rows as any[]).map(row => ({
        id: row.id,
        name: row.name,
        ipAddress: row.ip_address,
        apiPort: row.api_port,
        status: row.status,
        cpuUsage: row.cpu_usage,
        memoryUsage: row.memory_usage,
        runningTasks: row.running_tasks,
        totalTasks: row.total_tasks,
        lastHeartbeat: row.last_heartbeat,
      }));
    } catch (error: any) {
      logger.error('Failed to query available slaves:', error);
      throw error;
    }
  }

  /**
   * 选择最佳从机（负载均衡）
   * 策略：优先选择运行任务数最少且 CPU 使用率最低的从机
   */
  async selectSlave(excludeIds: string[] = []): Promise<SlaveInfo | null> {
    const slaves = await this.getAvailableSlaves();

    // 过滤排除列表
    const candidates = slaves.filter(s => !excludeIds.includes(s.id));

    if (candidates.length === 0) {
      logger.warn('No available slaves for task assignment');
      return null;
    }

    // 已按 running_tasks ASC, cpu_usage ASC 排序，直接取第一个
    return candidates[0];
  }

  /**
   * 在指定从机上启动测试
   * 主动推送场景文件和注入文件内容到从机
   */
  async startTestOnSlave(
    machineId: string,
    taskId: string,
    scenarioFile: string,
    options: any
  ): Promise<void> {
    const slave = await this.getSlaveInfo(machineId);
    if (!slave) {
      throw new Error(`Slave not found: ${machineId}`);
    }

    const url = `http://${slave.ipAddress}:${slave.apiPort}/api/sipp/start`;

    try {
      logger.info(`Starting test on slave ${machineId}: ${taskId}`);

      // 读取场景文件内容
      const scenarioPath = path.join(config.sipp.scenarioDir, scenarioFile);
      const scenarioContent = await this.readFileIfExists(scenarioPath);

      // 读取注入文件内容（如果有）
      let injectionContent: string | undefined;
      if (options.injectionFile) {
        const injectionPath = path.join(config.sipp.injectionDir, options.injectionFile);
        injectionContent = await this.readFileIfExists(injectionPath);
      }

      // 读取 oocsf 文件内容（如果有）
      let oocsfContent: string | undefined;
      if (options.oocsf) {
        const oocsfPath = path.join(config.sipp.scenarioDir, options.oocsf);
        oocsfContent = await this.readFileIfExists(oocsfPath);
      }

      const response = await axios.post(
        url,
        {
          taskId,
          scenarioFile,
          scenarioContent, // 传递场景文件内容
          injectionContent, // 传递注入文件内容
          oocsfContent, // 传递 oocsf 文件内容
          ...options,
        },
        {
          timeout: this.requestTimeout,
          headers: { 'Content-Type': 'application/json' },
        }
      );

      if (!response.data?.success) {
        throw new Error(response.data?.error || 'Unknown error from slave');
      }

      logger.info(`Test started on slave ${machineId}: ${taskId}`);
    } catch (error: any) {
      this.handleSlaveError(machineId, error);
      throw new Error(`Failed to start test on slave ${machineId}: ${error.message}`);
    }
  }

  /**
   * 读取文件内容（如果存在）
   */
  private async readFileIfExists(filePath: string): Promise<string | undefined> {
    try {
      if (fs.existsSync(filePath)) {
        return fs.readFileSync(filePath, 'utf-8');
      } else {
        logger.warn(`File not found: ${filePath}`);
        return undefined;
      }
    } catch (error: any) {
      logger.error(`Failed to read file ${filePath}:`, error.message);
      return undefined;
    }
  }

  /**
   * 停止从机上的测试
   */
  async stopTestOnSlave(
    machineId: string,
    taskId: string,
    force: boolean = false
  ): Promise<void> {
    const slave = await this.getSlaveInfo(machineId);
    if (!slave) {
      throw new Error(`Slave not found: ${machineId}`);
    }

    const url = `http://${slave.ipAddress}:${slave.apiPort}/api/sipp/stop`;

    try {
      logger.info(`Stopping test on slave ${machineId}: ${taskId} (force: ${force})`);

      const response = await axios.post(
        url,
        { taskId, force },
        {
          timeout: this.requestTimeout,
          headers: { 'Content-Type': 'application/json' },
        }
      );

      if (!response.data?.success) {
        throw new Error(response.data?.error || 'Unknown error from slave');
      }

      logger.info(`Test stopped on slave ${machineId}: ${taskId}`);
    } catch (error: any) {
      this.handleSlaveError(machineId, error);
      throw new Error(`Failed to stop test on slave ${machineId}: ${error.message}`);
    }
  }

  /**
   * 获取从机上的任务状态
   */
  async getTaskStatusFromSlave(machineId: string, taskId: string): Promise<any> {
    const slave = await this.getSlaveInfo(machineId);
    if (!slave) {
      throw new Error(`Slave not found: ${machineId}`);
    }

    const url = `http://${slave.ipAddress}:${slave.apiPort}/api/sipp/status/${taskId}`;

    try {
      const response = await axios.get(url, {
        timeout: this.requestTimeout,
      });

      if (!response.data?.success) {
        throw new Error(response.data?.error || 'Unknown error from slave');
      }

      return response.data.data;
    } catch (error: any) {
      this.handleSlaveError(machineId, error);
      throw new Error(`Failed to get task status from slave ${machineId}: ${error.message}`);
    }
  }

  /**
   * 健康检查
   * 支持主机和从机的健康检查
   */
  async checkSlaveHealth(machineId: string): Promise<boolean> {
    // 如果检查的是主机自己，直接返回 true（无需 HTTP 请求）
    if (machineId === 'master' || machineId === config.node.machineId) {
      logger.info(`Health check for master node: always healthy (local check)`);
      return true;
    }

    // 从机健康检查：通过 HTTP 请求
    const slave = await this.getSlaveInfo(machineId);
    if (!slave) {
      logger.warn(`Slave not found in database: ${machineId}`);
      return false;
    }

    const url = `http://${slave.ipAddress}:${slave.apiPort}/api/health`;

    try {
      const response = await axios.get(url, {
        timeout: 5000, // 健康检查用短超时
      });

      return response.status === 200 && response.data?.success;
    } catch (error: any) {
      logger.warn(`Health check failed for slave ${machineId}: ${error.message}`);
      return false;
    }
  }

  /**
   * 获取从机信息（内部方法）
   */
  private async getSlaveInfo(machineId: string): Promise<SlaveInfo | null> {
    try {
      const rows = await query(
        `SELECT
          id, name, ip_address, api_port, status,
          cpu_usage, memory_usage, running_tasks, total_tasks, last_heartbeat
        FROM machines
        WHERE id = ? AND role = 'slave'`,
        [machineId]
      );

      if ((rows as any[]).length === 0) {
        return null;
      }

      const row = (rows as any[])[0];
      return {
        id: row.id,
        name: row.name,
        ipAddress: row.ip_address,
        apiPort: row.api_port,
        status: row.status,
        cpuUsage: row.cpu_usage,
        memoryUsage: row.memory_usage,
        runningTasks: row.running_tasks,
        totalTasks: row.total_tasks,
        lastHeartbeat: row.last_heartbeat,
      };
    } catch (error: any) {
      logger.error(`Failed to get slave info: ${machineId}`, error);
      return null;
    }
  }

  /**
   * 统一错误处理
   */
  private handleSlaveError(machineId: string, error: any): void {
    if (axios.isAxiosError(error)) {
      const axiosError = error as AxiosError;

      if (axiosError.code === 'ECONNREFUSED') {
        logger.error(`Slave ${machineId} is unreachable (connection refused)`);
      } else if (axiosError.code === 'ETIMEDOUT') {
        logger.error(`Slave ${machineId} request timeout`);
      } else {
        logger.error(`Slave ${machineId} HTTP error: ${axiosError.message}`);
      }
    } else {
      logger.error(`Slave ${machineId} unexpected error:`, error);
    }
  }
}

export const slaveManager = new SlaveManager();
