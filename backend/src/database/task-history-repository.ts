/**
 * 任务历史数据仓库
 * 职责：处理任务历史数据的CRUD操作
 * 遵循SOLID原则：单一职责 - 仅负责任务历史数据访问
 */

import { query, queryOne, execute } from './index';
import { logger } from '../utils/logger';

export interface TaskHistoryRecord {
  id: string;
  scenario_name: string;
  scenario_file: string;
  status: 'RUNNING' | 'COMPLETED' | 'FAILED' | 'STOPPED';
  machine_id: string;
  config: {
    rate: number;
    users: number;
    limit: number;
    remoteHost: string;
    remotePort: number;
    localPort: number;
    transport: string;
    injectionFile?: string;
    minRtpPort?: number;
    maxRtpPort?: number;
    enableRtpEcho?: boolean;
    mediaIp?: string;
  };
  stats?: {
    totalCalls: number;
    successCalls: number;
    failedCalls: number;
    successRate: number;
  };
  pid?: number;
  control_port?: number;
  backend_pid?: number;
  start_time: number;
  end_time?: number;
  error?: string;
  created_at: Date;
}

export interface CreateTaskHistoryInput {
  id: string;
  scenario_name: string;
  scenario_file: string;
  status: 'RUNNING' | 'COMPLETED' | 'FAILED' | 'STOPPED';
  config: Record<string, any>;
  stats?: Record<string, any>;
  start_time: number;
  end_time?: number;
  error?: string;
}

export interface UpdateTaskHistoryInput {
  status?: 'RUNNING' | 'COMPLETED' | 'FAILED' | 'STOPPED';
  stats?: Record<string, any>;
  pid?: number;
  control_port?: number;
  backend_pid?: number;
  machine_id?: string;
  end_time?: number;
  error?: string;
}

/**
 * 任务历史仓库类
 */
export class TaskHistoryRepository {
  /**
   * 查询所有已完成的任务历史（不包括正在运行的）
   * @param machineId 可选：按机器ID过滤（主机='master'，从机=具体机器ID）
   */
  async findAll(machineId?: string): Promise<TaskHistoryRecord[]> {
    try {
      let sql = `SELECT * FROM task_history WHERE status != 'RUNNING'`;
      const params: any[] = [];

      if (machineId) {
        sql += ` AND machine_id = ?`;
        params.push(machineId);
      }

      sql += ` ORDER BY start_time DESC`;

      const rows = await query<TaskHistoryRecord>(sql, params);
      return rows.map(this.parseJsonFields);
    } catch (error: any) {
      logger.error('Failed to find all task history', { error: error.message, machineId });
      throw error;
    }
  }

  /**
   * 查询所有正在运行的任务（按机器分组）
   */
  async findRunningByMachine(): Promise<Record<string, TaskHistoryRecord[]>> {
    try {
      const rows = await query<TaskHistoryRecord>(
        `SELECT * FROM task_history
         WHERE status = 'RUNNING'
         ORDER BY machine_id, start_time DESC`
      );

      const parsed = rows.map(this.parseJsonFields);

      // 按 machine_id 分组
      const grouped: Record<string, TaskHistoryRecord[]> = {};
      for (const task of parsed) {
        if (!grouped[task.machine_id]) {
          grouped[task.machine_id] = [];
        }
        grouped[task.machine_id].push(task);
      }

      return grouped;
    } catch (error: any) {
      logger.error('Failed to find running tasks by machine', { error: error.message });
      throw error;
    }
  }

  /**
   * 根据状态查询任务
   */
  async findByStatus(status: string): Promise<TaskHistoryRecord[]> {
    try {
      const rows = await query<TaskHistoryRecord>(
        'SELECT * FROM task_history WHERE status = ? ORDER BY start_time DESC',
        [status]
      );
      return rows.map(this.parseJsonFields);
    } catch (error: any) {
      logger.error('Failed to find task history by status', {
        status,
        error: error.message
      });
      throw error;
    }
  }

  /**
   * 根据ID查询任务
   */
  async findById(id: string): Promise<TaskHistoryRecord | null> {
    try {
      const row = await queryOne<TaskHistoryRecord>(
        'SELECT * FROM task_history WHERE id = ?',
        [id]
      );
      return row ? this.parseJsonFields(row) : null;
    } catch (error: any) {
      logger.error('Failed to find task history by id', {
        id,
        error: error.message
      });
      throw error;
    }
  }

  /**
   * 创建任务历史记录
   */
  async create(input: CreateTaskHistoryInput): Promise<void> {
    try {
      await execute(
        `INSERT INTO task_history
         (id, scenario_name, scenario_file, status, config, stats, start_time, end_time, error)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          input.id,
          input.scenario_name,
          input.scenario_file,
          input.status,
          JSON.stringify(input.config),
          input.stats ? JSON.stringify(input.stats) : null,
          input.start_time,
          input.end_time || null,
          input.error || null
        ]
      );

      logger.info('Task history created', {
        id: input.id,
        scenario: input.scenario_name
      });
    } catch (error: any) {
      logger.error('Failed to create task history', {
        id: input.id,
        error: error.message
      });
      throw error;
    }
  }

  /**
   * 更新任务历史记录
   */
  async update(id: string, input: UpdateTaskHistoryInput): Promise<boolean> {
    try {
      const updates: string[] = [];
      const params: any[] = [];

      if (input.status !== undefined) {
        updates.push('status = ?');
        params.push(input.status);
      }
      if (input.stats !== undefined) {
        updates.push('stats = ?');
        params.push(JSON.stringify(input.stats));
      }
      if (input.pid !== undefined) {
        updates.push('pid = ?');
        params.push(input.pid);
      }
      if (input.control_port !== undefined) {
        updates.push('control_port = ?');
        params.push(input.control_port);
      }
      if (input.backend_pid !== undefined) {
        updates.push('backend_pid = ?');
        params.push(input.backend_pid);
      }
      if (input.machine_id !== undefined) {
        updates.push('machine_id = ?');
        params.push(input.machine_id);
      }
      if (input.end_time !== undefined) {
        updates.push('end_time = ?');
        params.push(input.end_time);
      }
      if (input.error !== undefined) {
        updates.push('error = ?');
        params.push(input.error);
      }

      if (updates.length === 0) {
        return false;
      }

      params.push(id);

      const result = await execute(
        `UPDATE task_history SET ${updates.join(', ')} WHERE id = ?`,
        params
      );

      logger.info('Task history updated', {
        id,
        affectedRows: result.affectedRows
      });

      return result.affectedRows > 0;
    } catch (error: any) {
      logger.error('Failed to update task history', {
        id,
        error: error.message
      });
      throw error;
    }
  }

  /**
   * 删除任务历史记录
   */
  async delete(id: string): Promise<boolean> {
    try {
      const result = await execute(
        'DELETE FROM task_history WHERE id = ?',
        [id]
      );

      logger.info('Task history deleted', {
        id,
        affectedRows: result.affectedRows
      });

      return result.affectedRows > 0;
    } catch (error: any) {
      logger.error('Failed to delete task history', {
        id,
        error: error.message
      });
      throw error;
    }
  }

  /**
   * 检查任务是否存在
   */
  async exists(id: string): Promise<boolean> {
    try {
      const result = await queryOne<{ count: number }>(
        'SELECT COUNT(*) as count FROM task_history WHERE id = ?',
        [id]
      );
      return result ? result.count > 0 : false;
    } catch (error: any) {
      logger.error('Failed to check task history existence', {
        id,
        error: error.message
      });
      throw error;
    }
  }

  /**
   * 解析JSON字段
   */
  private parseJsonFields(row: any): TaskHistoryRecord {
    return {
      ...row,
      config: typeof row.config === 'string' ? JSON.parse(row.config) : row.config,
      stats: row.stats ? (typeof row.stats === 'string' ? JSON.parse(row.stats) : row.stats) : undefined
    };
  }
}

// 单例导出
export const taskHistoryRepository = new TaskHistoryRepository();
