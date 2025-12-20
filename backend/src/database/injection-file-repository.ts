/**
 * 注入文件数据仓库
 * 职责：处理注入文件数据的CRUD操作
 * 遵循SOLID原则：单一职责 - 仅负责注入文件数据访问
 */

import { query, queryOne, execute } from './index';
import { logger } from '../utils/logger';

export interface InjectionFileRecord {
  id: number;
  filename: string;
  description?: string;
  content: string;
  field_count: number;
  row_count: number;
  read_mode: 'SEQUENTIAL' | 'RANDOM' | 'USER';
  created_at: Date;
  updated_at: Date;
}

export interface CreateInjectionFileInput {
  filename: string;
  description?: string;
  content: string;
  field_count: number;
  row_count: number;
  read_mode?: 'SEQUENTIAL' | 'RANDOM' | 'USER';
}

export interface UpdateInjectionFileInput {
  description?: string;
  content?: string;
  field_count?: number;
  row_count?: number;
  read_mode?: 'SEQUENTIAL' | 'RANDOM' | 'USER';
}

/**
 * 注入文件仓库类
 */
export class InjectionFileRepository {
  /**
   * 查询所有注入文件
   */
  async findAll(): Promise<InjectionFileRecord[]> {
    try {
      const rows = await query<InjectionFileRecord>(
        'SELECT * FROM injection_files ORDER BY created_at DESC'
      );
      return rows;
    } catch (error: any) {
      logger.error('Failed to find all injection files', { error: error.message });
      throw error;
    }
  }

  /**
   * 根据文件名查询注入文件
   */
  async findByFilename(filename: string): Promise<InjectionFileRecord | null> {
    try {
      const row = await queryOne<InjectionFileRecord>(
        'SELECT * FROM injection_files WHERE filename = ?',
        [filename]
      );
      return row;
    } catch (error: any) {
      logger.error('Failed to find injection file by filename', {
        filename,
        error: error.message
      });
      throw error;
    }
  }

  /**
   * 创建注入文件
   */
  async create(input: CreateInjectionFileInput): Promise<number> {
    try {
      const result = await execute(
        `INSERT INTO injection_files
         (filename, description, content, field_count, row_count, read_mode)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [
          input.filename,
          input.description || null,
          input.content,
          input.field_count,
          input.row_count,
          input.read_mode || 'SEQUENTIAL'
        ]
      );

      logger.info('Injection file created', {
        filename: input.filename,
        id: result.insertId
      });

      return result.insertId;
    } catch (error: any) {
      logger.error('Failed to create injection file', {
        filename: input.filename,
        error: error.message
      });
      throw error;
    }
  }

  /**
   * 更新注入文件
   */
  async update(filename: string, input: UpdateInjectionFileInput): Promise<boolean> {
    try {
      // 构建动态更新SQL
      const updates: string[] = [];
      const params: any[] = [];

      if (input.description !== undefined) {
        updates.push('description = ?');
        params.push(input.description);
      }
      if (input.content !== undefined) {
        updates.push('content = ?');
        params.push(input.content);
      }
      if (input.field_count !== undefined) {
        updates.push('field_count = ?');
        params.push(input.field_count);
      }
      if (input.row_count !== undefined) {
        updates.push('row_count = ?');
        params.push(input.row_count);
      }
      if (input.read_mode !== undefined) {
        updates.push('read_mode = ?');
        params.push(input.read_mode);
      }

      if (updates.length === 0) {
        return false;
      }

      params.push(filename);

      const result = await execute(
        `UPDATE injection_files SET ${updates.join(', ')} WHERE filename = ?`,
        params
      );

      logger.info('Injection file updated', {
        filename,
        affectedRows: result.affectedRows
      });

      return result.affectedRows > 0;
    } catch (error: any) {
      logger.error('Failed to update injection file', {
        filename,
        error: error.message
      });
      throw error;
    }
  }

  /**
   * 删除注入文件
   */
  async delete(filename: string): Promise<boolean> {
    try {
      const result = await execute(
        'DELETE FROM injection_files WHERE filename = ?',
        [filename]
      );

      logger.info('Injection file deleted', {
        filename,
        affectedRows: result.affectedRows
      });

      return result.affectedRows > 0;
    } catch (error: any) {
      logger.error('Failed to delete injection file', {
        filename,
        error: error.message
      });
      throw error;
    }
  }

  /**
   * 检查注入文件是否存在
   */
  async exists(filename: string): Promise<boolean> {
    try {
      const result = await queryOne<{ count: number }>(
        'SELECT COUNT(*) as count FROM injection_files WHERE filename = ?',
        [filename]
      );
      return result ? result.count > 0 : false;
    } catch (error: any) {
      logger.error('Failed to check injection file existence', {
        filename,
        error: error.message
      });
      throw error;
    }
  }

  /**
   * 创建或更新注入文件（Upsert）
   */
  async upsert(input: CreateInjectionFileInput): Promise<number> {
    try {
      const exists = await this.exists(input.filename);

      if (exists) {
        await this.update(input.filename, {
          description: input.description,
          content: input.content,
          field_count: input.field_count,
          row_count: input.row_count,
          read_mode: input.read_mode
        });

        const record = await this.findByFilename(input.filename);
        return record ? record.id : 0;
      } else {
        return await this.create(input);
      }
    } catch (error: any) {
      logger.error('Failed to upsert injection file', {
        filename: input.filename,
        error: error.message
      });
      throw error;
    }
  }
}

// 单例导出
export const injectionFileRepository = new InjectionFileRepository();
