/**
 * 音频文件服务
 * 职责：音频文件业务逻辑（上传/下载/删除）
 * 遵循SOLID原则：单一职责 - 仅负责音频文件管理
 */

import path from 'path';
import fs from 'fs/promises';
import fsSync from 'fs';
import { audioFileRepository, CreateAudioFileInput } from '../database/audio-file-repository';
import { logger } from '../utils/logger';
import { config } from '../config';

export interface AudioFileInfo {
  filename: string;
  description?: string;
  file_type: 'PCAP' | 'WAV' | 'OTHER';
  file_size: number;
  duration?: number;
  created_at: Date;
}

/**
 * 音频文件服务类
 */
export class AudioFileService {
  private audioDir: string;

  constructor(audioDir: string) {
    this.audioDir = audioDir;
    this.ensureDirectoryExists();
  }

  /**
   * 确保音频文件目录存在
   */
  private ensureDirectoryExists(): void {
    if (!fsSync.existsSync(this.audioDir)) {
      fsSync.mkdirSync(this.audioDir, { recursive: true });
      logger.info('Audio directory created', { path: this.audioDir });
    }
  }

  /**
   * 获取文件类型
   */
  private getFileType(filename: string): 'PCAP' | 'WAV' | 'OTHER' {
    const ext = path.extname(filename).toLowerCase();
    if (ext === '.pcap') return 'PCAP';
    if (ext === '.wav') return 'WAV';
    return 'OTHER';
  }

  /**
   * 获取文件完整路径
   */
  getFilePath(filename: string): string {
    return path.join(this.audioDir, filename);
  }

  /**
   * 列出所有音频文件
   */
  async listFiles(): Promise<AudioFileInfo[]> {
    try {
      const records = await audioFileRepository.findAll();
      return records.map(r => ({
        filename: r.filename,
        description: r.description,
        file_type: r.file_type,
        file_size: r.file_size,
        duration: r.duration,
        created_at: r.created_at,
      }));
    } catch (error: any) {
      logger.error('Failed to list audio files', { error: error.message });
      throw error;
    }
  }

  /**
   * 获取音频文件详情
   */
  async getFile(filename: string): Promise<AudioFileInfo | null> {
    try {
      const record = await audioFileRepository.findByFilename(filename);
      if (!record) return null;

      return {
        filename: record.filename,
        description: record.description,
        file_type: record.file_type,
        file_size: record.file_size,
        duration: record.duration,
        created_at: record.created_at,
      };
    } catch (error: any) {
      logger.error('Failed to get audio file', { filename, error: error.message });
      throw error;
    }
  }

  /**
   * 保存音频文件
   */
  async saveFile(input: {
    filename: string;
    description?: string;
    buffer: Buffer;
    duration?: number;
  }): Promise<number> {
    try {
      // 检查文件名是否已存在
      const exists = await audioFileRepository.exists(input.filename);
      if (exists) {
        throw new Error(`Audio file already exists: ${input.filename}`);
      }

      // 保存文件到磁盘
      const filePath = this.getFilePath(input.filename);
      await fs.writeFile(filePath, input.buffer);

      // 获取文件大小
      const stats = await fs.stat(filePath);

      // 创建数据库记录
      const fileData: CreateAudioFileInput = {
        filename: input.filename,
        description: input.description,
        file_type: this.getFileType(input.filename),
        file_size: stats.size,
        duration: input.duration,
      };

      const id = await audioFileRepository.create(fileData);

      logger.info('Audio file saved', {
        filename: input.filename,
        size: stats.size,
        type: fileData.file_type,
      });

      return id;
    } catch (error: any) {
      // 如果数据库操作失败，删除已保存的文件
      try {
        const filePath = this.getFilePath(input.filename);
        if (fsSync.existsSync(filePath)) {
          await fs.unlink(filePath);
        }
      } catch (cleanupError) {
        logger.warn('Failed to cleanup file after error', {
          filename: input.filename,
          error: cleanupError,
        });
      }

      logger.error('Failed to save audio file', {
        filename: input.filename,
        error: error.message,
      });
      throw error;
    }
  }

  /**
   * 删除音频文件
   */
  async deleteFile(filename: string): Promise<void> {
    try {
      // 先删除数据库记录
      const deleted = await audioFileRepository.delete(filename);
      if (!deleted) {
        throw new Error(`Audio file not found: ${filename}`);
      }

      // 再删除文件
      const filePath = this.getFilePath(filename);
      if (fsSync.existsSync(filePath)) {
        await fs.unlink(filePath);
        logger.info('Audio file deleted from disk', { filename });
      }

      logger.info('Audio file deleted', { filename });
    } catch (error: any) {
      logger.error('Failed to delete audio file', {
        filename,
        error: error.message,
      });
      throw error;
    }
  }

  /**
   * 检查文件是否存在（文件系统）
   */
  fileExists(filename: string): boolean {
    const filePath = this.getFilePath(filename);
    return fsSync.existsSync(filePath);
  }

  /**
   * 获取音频文件内容
   */
  async readFile(filename: string): Promise<Buffer> {
    try {
      const filePath = this.getFilePath(filename);
      if (!fsSync.existsSync(filePath)) {
        throw new Error(`Audio file not found on disk: ${filename}`);
      }
      return await fs.readFile(filePath);
    } catch (error: any) {
      logger.error('Failed to read audio file', {
        filename,
        error: error.message,
      });
      throw error;
    }
  }
}

// 单例导出
export const audioFileService = new AudioFileService(
  config.sipp.audioDir || path.join(__dirname, '../../../audio')
);
