/**
 * 场景数据仓库
 * 职责：处理场景数据的CRUD操作
 * 遵循SOLID原则：单一职责 - 仅负责场景数据访问
 */

import { query, queryOne, execute } from './index';
import type { Scenario } from '../parsers/xml-parser';
import { logger } from '../utils/logger';

export interface ScenarioRecord {
  id: number;
  filename: string;
  name: string;
  description?: string;
  messages: any;
  variables?: any;
  init?: any;
  created_at: Date;
  updated_at: Date;
}

/**
 * 场景仓库类
 */
export class ScenarioRepository {
  /**
   * 查询所有场景
   */
  async findAll(): Promise<ScenarioRecord[]> {
    try {
      const rows = await query<ScenarioRecord>(
        'SELECT * FROM scenarios ORDER BY created_at DESC'
      );

      // 解析JSON字段
      return rows.map(row => ({
        ...row,
        messages: typeof row.messages === 'string' ? JSON.parse(row.messages) : row.messages,
        variables: row.variables ? (typeof row.variables === 'string' ? JSON.parse(row.variables) : row.variables) : undefined,
        init: row.init ? (typeof row.init === 'string' ? JSON.parse(row.init) : row.init) : undefined,
      }));
    } catch (error: any) {
      logger.error('Failed to find all scenarios', { error: error.message });
      throw error;
    }
  }

  /**
   * 根据文件名查询场景
   */
  async findByFilename(filename: string): Promise<ScenarioRecord | null> {
    try {
      const row = await queryOne<ScenarioRecord>(
        'SELECT * FROM scenarios WHERE filename = ?',
        [filename]
      );

      if (!row) return null;

      // 解析JSON字段
      return {
        ...row,
        messages: typeof row.messages === 'string' ? JSON.parse(row.messages) : row.messages,
        variables: row.variables ? (typeof row.variables === 'string' ? JSON.parse(row.variables) : row.variables) : undefined,
        init: row.init ? (typeof row.init === 'string' ? JSON.parse(row.init) : row.init) : undefined,
      };
    } catch (error: any) {
      logger.error('Failed to find scenario by filename', { filename, error: error.message });
      throw error;
    }
  }

  /**
   * 创建场景
   */
  async create(filename: string, scenario: Scenario): Promise<ScenarioRecord> {
    try {
      await execute(
        `INSERT INTO scenarios (filename, name, description, messages, variables, init)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [
          filename,
          scenario.name,
          scenario.description || null,
          JSON.stringify(scenario.messages || []),
          scenario.variables ? JSON.stringify(scenario.variables) : null,
          scenario.init ? JSON.stringify(scenario.init) : null,
        ]
      );

      const created = await this.findByFilename(filename);

      if (!created) {
        throw new Error('Failed to retrieve created scenario');
      }

      return created;
    } catch (error: any) {
      logger.error('Failed to create scenario', { filename, error: error.message });
      throw error;
    }
  }

  /**
   * 更新场景
   */
  async update(filename: string, scenario: Scenario): Promise<ScenarioRecord> {
    try {
      await execute(
        `UPDATE scenarios
         SET name = ?, description = ?, messages = ?, variables = ?, init = ?
         WHERE filename = ?`,
        [
          scenario.name,
          scenario.description || null,
          JSON.stringify(scenario.messages || []),
          scenario.variables ? JSON.stringify(scenario.variables) : null,
          scenario.init ? JSON.stringify(scenario.init) : null,
          filename,
        ]
      );

      const updated = await this.findByFilename(filename);

      if (!updated) {
        throw new Error('Failed to retrieve updated scenario');
      }

      return updated;
    } catch (error: any) {
      logger.error('Failed to update scenario', { filename, error: error.message });
      throw error;
    }
  }

  /**
   * 创建或更新场景（Upsert）
   */
  async upsert(filename: string, scenario: Scenario): Promise<ScenarioRecord> {
    try {
      const exists = await this.exists(filename);

      if (exists) {
        return await this.update(filename, scenario);
      } else {
        return await this.create(filename, scenario);
      }
    } catch (error: any) {
      logger.error('Failed to upsert scenario', { filename, error: error.message });
      throw error;
    }
  }

  /**
   * 删除场景
   */
  async delete(filename: string): Promise<boolean> {
    try {
      const result = await execute(
        'DELETE FROM scenarios WHERE filename = ?',
        [filename]
      );

      return (result as any).affectedRows > 0;
    } catch (error: any) {
      logger.error('Failed to delete scenario', { filename, error: error.message });
      throw error;
    }
  }

  /**
   * 检查场景是否存在
   */
  async exists(filename: string): Promise<boolean> {
    try {
      const result = await queryOne<{ count: number }>(
        'SELECT COUNT(*) as count FROM scenarios WHERE filename = ?',
        [filename]
      );

      return result ? result.count > 0 : false;
    } catch (error: any) {
      logger.error('Failed to check scenario existence', { filename, error: error.message });
      throw error;
    }
  }
}

// 导出单例实例
export const scenarioRepository = new ScenarioRepository();
