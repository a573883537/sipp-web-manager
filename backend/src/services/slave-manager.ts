import { config } from '../config';
import { query } from '../database';
import { logger } from '../utils/logger';
import type { WebSocketService } from '../websocket';

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
 * - WebSocket 单一通道：所有主机→从机通信都通过 WebSocket
 * - 无 HTTP 降级：完全依赖 WebSocket 连接，连接断开时直接报错
 */
export class SlaveManager {
  private readonly requestTimeout = 30000; // 30s
  private wsService: WebSocketService | null = null;

  /**
   * 设置 WebSocket 服务（依赖注入）
   */
  setWebSocketService(wsService: WebSocketService): void {
    this.wsService = wsService;
    logger.info('WebSocketService injected into SlaveManager');
  }

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
   * 仅通过 WebSocket 通信，无 HTTP 降级
   * @returns Promise<{pid: number | null, controlPort: number | null}>
   */
  async startTestOnSlave(
    machineId: string,
    taskId: string,
    scenarioFile: string,
    options: any
  ): Promise<{ pid: number | null; controlPort: number | null }> {
    const slave = await this.getSlaveInfo(machineId);
    if (!slave) {
      throw new Error(`Slave not found: ${machineId}`);
    }

    logger.info(`Starting test on slave ${machineId}: ${taskId}`);

    // 检查 WebSocket 连接
    if (!this.wsService) {
      throw new Error(`WebSocketService not available`);
    }

    if (!this.wsService.isSlaveConnected(machineId)) {
      const connectedSlaves = this.wsService.getConnectedSlaves();
      throw new Error(
        `Slave ${machineId} not connected via WebSocket. ` +
        `Connected slaves: ${connectedSlaves.length > 0 ? connectedSlaves.join(', ') : 'none'}`
      );
    }

    // 不推送文件内容，让从机按需从数据库拉取
    const payload = {
      taskId,
      config: {
        scenarioFile,
        ...options,
      },
    };

    // 通过 WebSocket 发送命令
    try {
      const response = await this.wsService.sendCommandToSlave(machineId, 'task:start', payload, this.requestTimeout);
      logger.info(`Test started on slave ${machineId} via WebSocket: ${taskId}`);
      
      // 返回从机响应中的 pid 和 controlPort
      return {
        pid: response.pid || null,
        controlPort: response.controlPort || null,
      };
    } catch (error: any) {
      logger.error(`Failed to start test on slave ${machineId} via WebSocket: ${error.message}`);
      throw error;
    }
  }

  /**
   * 停止从机上的测试
   * 仅通过 WebSocket 通信，无 HTTP 降级
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

    logger.info(`Stopping test on slave ${machineId}: ${taskId} (force: ${force})`);

    // 检查 WebSocket 连接
    if (!this.wsService) {
      throw new Error(`WebSocketService not available`);
    }

    if (!this.wsService.isSlaveConnected(machineId)) {
      throw new Error(`Slave ${machineId} not connected via WebSocket`);
    }

    const payload = { taskId, force };

    // 通过 WebSocket 发送命令
    try {
      await this.wsService.sendCommandToSlave(machineId, 'task:stop', payload, this.requestTimeout);
      logger.info(`Test stopped on slave ${machineId} via WebSocket: ${taskId}`);
    } catch (error: any) {
      logger.error(`Failed to stop test on slave ${machineId} via WebSocket: ${error.message}`);
      throw error;
    }
  }

  /**
   * 发送控制命令到从机（如设置速率、暂停/恢复等）
   * 仅通过 WebSocket 通信，无 HTTP 降级
   */
  async sendControlCommandToSlave(
    machineId: string,
    taskId: string,
    command: string,
    args?: any
  ): Promise<void> {
    const slave = await this.getSlaveInfo(machineId);
    if (!slave) {
      throw new Error(`Slave not found: ${machineId}`);
    }

    logger.info(`Sending control command to slave ${machineId}: ${command} for task ${taskId}`);

    // 检查 WebSocket 连接
    if (!this.wsService) {
      throw new Error(`WebSocketService not available`);
    }

    if (!this.wsService.isSlaveConnected(machineId)) {
      throw new Error(`Slave ${machineId} not connected via WebSocket`);
    }

    const payload = { taskId, command, args };

    // 通过 WebSocket 发送命令
    try {
      await this.wsService.sendCommandToSlave(machineId, 'task:command', payload, this.requestTimeout);
      logger.info(`Control command ${command} sent to slave ${machineId} via WebSocket: ${taskId}`);
    } catch (error: any) {
      logger.error(`Failed to send control command to slave ${machineId} via WebSocket: ${error.message}`);
      throw error;
    }
  }

  /**
   * 获取从机上的任务状态
   * 仅通过 WebSocket 通信，无 HTTP 降级
   */
  async getTaskStatusFromSlave(machineId: string, taskId: string): Promise<any> {
    const slave = await this.getSlaveInfo(machineId);
    if (!slave) {
      throw new Error(`Slave not found: ${machineId}`);
    }

    // 检查 WebSocket 连接
    if (!this.wsService) {
      throw new Error(`WebSocketService not available`);
    }

    if (!this.wsService.isSlaveConnected(machineId)) {
      throw new Error(`Slave ${machineId} not connected via WebSocket`);
    }

    // 通过 WebSocket 获取状态
    try {
      const result = await this.wsService.sendCommandToSlave(
        machineId,
        'task:stats:request',
        { taskId },
        this.requestTimeout
      );
      logger.debug(`Task status retrieved from slave ${machineId} via WebSocket: ${taskId}`);
      return result;
    } catch (error: any) {
      logger.error(`Failed to get task status from slave ${machineId} via WebSocket: ${error.message}`);
      throw error;
    }
  }

  /**
   * 健康检查
   * 基于 WebSocket 连接状态
   */
  async checkSlaveHealth(machineId: string): Promise<boolean> {
    // 如果检查的是主机自己，直接返回 true
    if (machineId === 'master' || machineId === config.node.machineId) {
      logger.info(`Health check for master node: always healthy (local check)`);
      return true;
    }

    // 从机健康检查：基于 WebSocket 连接状态
    if (!this.wsService) {
      logger.warn(`WebSocketService not available for health check: ${machineId}`);
      return false;
    }

    const isConnected = this.wsService.isSlaveConnected(machineId);
    logger.info(`Health check for slave ${machineId}: ${isConnected ? 'healthy (connected)' : 'unhealthy (disconnected)'}`);
    return isConnected;
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

}

export const slaveManager = new SlaveManager();
