/**
 * 注入文件服务
 * 职责：注入文件的业务逻辑处理、验证、文件系统同步
 * 遵循SOLID原则：单一职责 - 处理注入文件相关业务逻辑
 */

import fs from 'fs/promises';
import path from 'path';
import { config } from '../config';
import {
  injectionFileRepository,
  type InjectionFileRecord,
  type CreateInjectionFileInput
} from '../database/injection-file-repository';
import { logger } from '../utils/logger';

export interface ValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
  metadata?: {
    fieldCount: number;
    rowCount: number;
    readMode: 'SEQUENTIAL' | 'RANDOM' | 'USER';
  };
}

/**
 * 注入文件服务类
 */
export class InjectionFileService {
  private injectionDir: string;

  constructor() {
    this.injectionDir = config.sipp.injectionDir;
    this.ensureDirectoryExists();
  }

  /**
   * 确保注入文件目录存在
   */
  private async ensureDirectoryExists(): Promise<void> {
    try {
      await fs.mkdir(this.injectionDir, { recursive: true });
      logger.info('Injection directory ensured', { path: this.injectionDir });
    } catch (error: any) {
      logger.error('Failed to create injection directory', {
        path: this.injectionDir,
        error: error.message
      });
    }
  }

  /**
   * 验证CSV内容格式
   */
  validateCsvContent(content: string): ValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];

    const lines = content.split('\n').filter(line => line.trim());

    if (lines.length < 2) {
      errors.push('CSV文件至少需要包含读取模式行和一行数据');
      return { valid: false, errors, warnings };
    }

    // 验证第一行读取模式
    const readModeMatch = lines[0].match(/^(SEQUENTIAL|RANDOM|USER)$/i);
    if (!readModeMatch) {
      errors.push('第一行必须是读取模式：SEQUENTIAL、RANDOM 或 USER');
      return { valid: false, errors, warnings };
    }

    const readMode = readModeMatch[1].toUpperCase() as 'SEQUENTIAL' | 'RANDOM' | 'USER';

    // 跳过注释行（以#开头）
    const dataLines = lines.slice(1).filter(line => !line.startsWith('#'));

    if (dataLines.length === 0) {
      errors.push('CSV文件没有有效数据行');
      return { valid: false, errors, warnings };
    }

    // 验证字段数量一致性
    const firstLineFields = dataLines[0].split(';');
    const fieldCount = firstLineFields.length;

    if (fieldCount === 0) {
      errors.push('数据行为空或分隔符错误（应使用分号;分隔）');
      return { valid: false, errors, warnings };
    }

    // 检查所有行字段数量是否一致
    for (let i = 1; i < dataLines.length; i++) {
      const fields = dataLines[i].split(';');
      if (fields.length !== fieldCount) {
        errors.push(`第 ${i + 2} 行字段数量不一致（期望 ${fieldCount}，实际 ${fields.length}）`);
      }
    }

    // 检查空字段
    for (let i = 0; i < dataLines.length; i++) {
      const fields = dataLines[i].split(';');
      if (fields.some(field => field.trim() === '')) {
        warnings.push(`第 ${i + 2} 行包含空字段，可能导致场景执行失败`);
      }
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings,
      metadata: {
        fieldCount,
        rowCount: dataLines.length,
        readMode
      }
    };
  }

  /**
   * 列出所有注入文件
   */
  async listFiles(): Promise<InjectionFileRecord[]> {
    try {
      return await injectionFileRepository.findAll();
    } catch (error: any) {
      logger.error('Failed to list injection files', { error: error.message });
      throw new Error(`获取注入文件列表失败: ${error.message}`);
    }
  }

  /**
   * 获取注入文件详情
   */
  async getFile(filename: string): Promise<InjectionFileRecord | null> {
    try {
      return await injectionFileRepository.findByFilename(filename);
    } catch (error: any) {
      logger.error('Failed to get injection file', { filename, error: error.message });
      throw new Error(`获取注入文件失败: ${error.message}`);
    }
  }

  /**
   * 创建或更新注入文件
   */
  async saveFile(input: CreateInjectionFileInput): Promise<number> {
    try {
      // 验证文件名安全性（防止路径遍历）
      if (input.filename.includes('..') || input.filename.includes('/')) {
        throw new Error('文件名不能包含路径分隔符');
      }

      if (!input.filename.endsWith('.csv')) {
        throw new Error('文件名必须以 .csv 结尾');
      }

      // 验证CSV内容
      const validation = this.validateCsvContent(input.content);
      if (!validation.valid) {
        throw new Error(`CSV格式验证失败:\n${validation.errors.join('\n')}`);
      }

      // 使用验证结果的元数据
      const saveInput = {
        ...input,
        field_count: validation.metadata!.fieldCount,
        row_count: validation.metadata!.rowCount,
        read_mode: validation.metadata!.readMode
      };

      // 保存到数据库
      const id = await injectionFileRepository.upsert(saveInput);

      // 同步到文件系统
      await this.syncToFileSystem(input.filename, input.content);

      logger.info('Injection file saved', {
        filename: input.filename,
        id,
        warnings: validation.warnings
      });

      return id;
    } catch (error: any) {
      logger.error('Failed to save injection file', {
        filename: input.filename,
        error: error.message
      });
      throw error;
    }
  }

  /**
   * 删除注入文件
   */
  async deleteFile(filename: string): Promise<void> {
    try {
      // 从数据库删除
      const deleted = await injectionFileRepository.delete(filename);

      if (!deleted) {
        throw new Error('文件不存在');
      }

      // 从文件系统删除
      await this.deleteFromFileSystem(filename);

      logger.info('Injection file deleted', { filename });
    } catch (error: any) {
      logger.error('Failed to delete injection file', {
        filename,
        error: error.message
      });
      throw error;
    }
  }

  /**
   * 同步到文件系统
   */
  private async syncToFileSystem(filename: string, content: string): Promise<void> {
    try {
      const filePath = path.join(this.injectionDir, filename);
      await fs.writeFile(filePath, content, 'utf-8');
      logger.debug('Synced to filesystem', { path: filePath });
    } catch (error: any) {
      logger.error('Failed to sync to filesystem', {
        filename,
        error: error.message
      });
      throw new Error(`文件系统同步失败: ${error.message}`);
    }
  }

  /**
   * 从文件系统删除
   */
  private async deleteFromFileSystem(filename: string): Promise<void> {
    try {
      const filePath = path.join(this.injectionDir, filename);
      await fs.unlink(filePath);
      logger.debug('Deleted from filesystem', { path: filePath });
    } catch (error: any) {
      // 文件不存在时忽略错误
      if (error.code !== 'ENOENT') {
        logger.warn('Failed to delete from filesystem', {
          filename,
          error: error.message
        });
      }
    }
  }

  /**
   * 获取注入文件绝对路径（用于SIPp进程）
   */
  getFilePath(filename: string): string {
    return path.join(this.injectionDir, filename);
  }

  /**
   * 检查注入文件是否存在
   */
  async exists(filename: string): Promise<boolean> {
    try {
      return await injectionFileRepository.exists(filename);
    } catch (error: any) {
      logger.error('Failed to check injection file existence', {
        filename,
        error: error.message
      });
      return false;
    }
  }
}

// 单例导出
export const injectionFileService = new InjectionFileService();
