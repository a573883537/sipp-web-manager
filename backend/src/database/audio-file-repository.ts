/**
 * 音频文件数据仓库
 * 职责：处理音频文件数据的CRUD操作
 * 遵循SOLID原则：单一职责 - 仅负责音频文件数据访问
 */

import { query, queryOne, execute } from './index';
import { logger } from '../utils/logger';

export interface AudioFileRecord {
  id: number;
  filename: string;
  description?: string;
  file_type: 'PCAP' | 'WAV' | 'OTHER';
  file_size: number;
  duration?: number;
  created_at: Date;
  updated_at: Date;
}

export interface CreateAudioFileInput {
  filename: string;
  description?: string;
  file_type: 'PCAP' | 'WAV' | 'OTHER';
  file_size: number;
  duration?: number;
}

export interface UpdateAudioFileInput {
  description?: string;
  file_type?: 'PCAP' | 'WAV' | 'OTHER';
  file_size?: number;
  duration?: number;
}

/**
 * 音频文件仓库类
 */
export class AudioFileRepository {
  /**
   * 查询所有音频文件
   */
  async findAll(): Promise<AudioFileRecord[]> {
    try {
      const rows = await query<AudioFileRecord>(
        'SELECT * FROM audio_files ORDER BY created_at DESC'
      );
      return rows;
    } catch (error: any) {
      logger.error('Failed to find all audio files', { error: error.message });
      throw error;
    }
  }

  /**
   * 根据文件名查询音频文件
   */
  async findByFilename(filename: string): Promise<AudioFileRecord | null> {
    try {
      const row = await queryOne<AudioFileRecord>(
        'SELECT * FROM audio_files WHERE filename = ?',
        [filename]
      );
      return row;
    } catch (error: any) {
      logger.error('Failed to find audio file by filename', {
        filename,
        error: error.message
      });
      throw error;
    }
  }

  /**
   * 创建音频文件记录
   */
  async create(input: CreateAudioFileInput): Promise<number> {
    try {
      const result = await execute(
        `INSERT INTO audio_files
         (filename, description, file_type, file_size, duration)
         VALUES (?, ?, ?, ?, ?)`,
        [
          input.filename,
          input.description || null,
          input.file_type,
          input.file_size,
          input.duration || null
        ]
      );

      logger.info('Audio file record created', {
        filename: input.filename,
        id: result.insertId
      });

      return result.insertId;
    } catch (error: any) {
      logger.error('Failed to create audio file record', {
        filename: input.filename,
        error: error.message
      });
      throw error;
    }
  }

  /**
   * 更新音频文件记录
   */
  async update(filename: string, input: UpdateAudioFileInput): Promise<boolean> {
    try {
      // 构建动态更新SQL
      const updates: string[] = [];
      const params: any[] = [];

      if (input.description !== undefined) {
        updates.push('description = ?');
        params.push(input.description);
      }
      if (input.file_type !== undefined) {
        updates.push('file_type = ?');
        params.push(input.file_type);
      }
      if (input.file_size !== undefined) {
        updates.push('file_size = ?');
        params.push(input.file_size);
      }
      if (input.duration !== undefined) {
        updates.push('duration = ?');
        params.push(input.duration);
      }

      if (updates.length === 0) {
        return false;
      }

      params.push(filename);

      const result = await execute(
        `UPDATE audio_files SET ${updates.join(', ')} WHERE filename = ?`,
        params
      );

      logger.info('Audio file record updated', {
        filename,
        affectedRows: result.affectedRows
      });

      return result.affectedRows > 0;
    } catch (error: any) {
      logger.error('Failed to update audio file record', {
        filename,
        error: error.message
      });
      throw error;
    }
  }

  /**
   * 删除音频文件记录
   */
  async delete(filename: string): Promise<boolean> {
    try {
      const result = await execute(
        'DELETE FROM audio_files WHERE filename = ?',
        [filename]
      );

      logger.info('Audio file record deleted', {
        filename,
        affectedRows: result.affectedRows
      });

      return result.affectedRows > 0;
    } catch (error: any) {
      logger.error('Failed to delete audio file record', {
        filename,
        error: error.message
      });
      throw error;
    }
  }

  /**
   * 检查音频文件是否存在
   */
  async exists(filename: string): Promise<boolean> {
    try {
      const result = await queryOne<{ count: number }>(
        'SELECT COUNT(*) as count FROM audio_files WHERE filename = ?',
        [filename]
      );
      return result ? result.count > 0 : false;
    } catch (error: any) {
      logger.error('Failed to check audio file existence', {
        filename,
        error: error.message
      });
      throw error;
    }
  }
}

// 单例导出
export const audioFileRepository = new AudioFileRepository();
