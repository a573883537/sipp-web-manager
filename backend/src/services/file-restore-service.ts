/**
 * 文件恢复服务
 * 职责：在服务启动时从数据库恢复场景文件和注入文件到文件系统
 * 遵循SOLID原则：单一职责 - 仅负责文件恢复逻辑
 */

import fs from 'fs/promises';
import fsSync from 'fs';
import path from 'path';
import { logger } from '../utils/logger';
import { config } from '../config';
import { scenarioRepository } from '../database/scenario-repository';
import { injectionFileRepository } from '../database/injection-file-repository';
import { tlsCertificateRepository } from '../database/tls-certificate-repository';
import { xmlParser } from '../parsers/xml-parser';
import type { Scenario } from '../parsers/xml-parser';

/**
 * 文件恢复服务类
 */
export class FileRestoreService {
  /**
   * 从数据库恢复所有场景文件到文件系统
   */
  async restoreScenarioFiles(): Promise<{ success: number; failed: number; skipped: number }> {
    const stats = { success: 0, failed: 0, skipped: 0 };

    try {
      logger.info('Starting scenario files restoration from database...');

      // 从数据库读取所有场景
      const scenarios = await scenarioRepository.findAll();

      if (scenarios.length === 0) {
        logger.info('No scenario records found in database');
        return stats;
      }

      logger.info(`Found ${scenarios.length} scenario(s) in database`);

      for (const record of scenarios) {
        try {
          const filePath = path.join(config.sipp.scenarioDir, record.filename);

          // 检查文件是否已存在
          if (fsSync.existsSync(filePath)) {
            // 读取现有文件的修改时间
            const fileStat = await fs.stat(filePath);
            const fileModTime = fileStat.mtime;
            const dbModTime = new Date(record.updated_at);

            // 如果文件比数据库记录更新，跳过（避免覆盖手动修改）
            if (fileModTime > dbModTime) {
              logger.debug(`Scenario file already exists and is newer: ${record.filename}`, {
                fileModTime: fileModTime.toISOString(),
                dbModTime: dbModTime.toISOString(),
              });
              stats.skipped++;
              continue;
            }
          }

          // 从数据库记录构建场景对象
          const scenario: Scenario = {
            name: record.name,
            description: record.description,
            messages: record.messages,
            variables: record.variables,
            init: record.init,
            injection_file: record.injection_file,
          };

          // 生成 XML 文件
          await xmlParser.generateFile(scenario, filePath);

          logger.info(`Restored scenario file: ${record.filename}`);
          stats.success++;

        } catch (error: any) {
          logger.error(`Failed to restore scenario file: ${record.filename}`, {
            error: error.message || String(error),
          });
          stats.failed++;
        }
      }

      logger.info('Scenario files restoration completed', {
        total: scenarios.length,
        success: stats.success,
        failed: stats.failed,
        skipped: stats.skipped,
      });

      return stats;

    } catch (error: any) {
      logger.error('Failed to restore scenario files from database:', {
        error: error.message || String(error),
      });
      throw error;
    }
  }

  /**
   * 从数据库恢复所有注入文件到文件系统
   */
  async restoreInjectionFiles(): Promise<{ success: number; failed: number; skipped: number }> {
    const stats = { success: 0, failed: 0, skipped: 0 };

    try {
      logger.info('Starting injection files restoration from database...');

      // 从数据库读取所有注入文件
      const injectionFiles = await injectionFileRepository.findAll();

      if (injectionFiles.length === 0) {
        logger.info('No injection file records found in database');
        return stats;
      }

      logger.info(`Found ${injectionFiles.length} injection file(s) in database`);

      for (const record of injectionFiles) {
        try {
          const filePath = path.join(config.sipp.injectionDir, record.filename);

          // 检查文件是否已存在
          if (fsSync.existsSync(filePath)) {
            // 读取现有文件的修改时间
            const fileStat = await fs.stat(filePath);
            const fileModTime = fileStat.mtime;
            const dbModTime = new Date(record.updated_at);

            // 如果文件比数据库记录更新，跳过（避免覆盖手动修改）
            if (fileModTime > dbModTime) {
              logger.debug(`Injection file already exists and is newer: ${record.filename}`, {
                fileModTime: fileModTime.toISOString(),
                dbModTime: dbModTime.toISOString(),
              });
              stats.skipped++;
              continue;
            }
          }

          // 写入文件内容
          await fs.writeFile(filePath, record.content, 'utf-8');

          logger.info(`Restored injection file: ${record.filename}`, {
            size: record.content.length,
            rows: record.row_count,
            fields: record.field_count,
          });
          stats.success++;

        } catch (error: any) {
          logger.error(`Failed to restore injection file: ${record.filename}`, {
            error: error.message || String(error),
          });
          stats.failed++;
        }
      }

      logger.info('Injection files restoration completed', {
        total: injectionFiles.length,
        success: stats.success,
        failed: stats.failed,
        skipped: stats.skipped,
      });

      return stats;

    } catch (error: any) {
      logger.error('Failed to restore injection files from database:', {
        error: error.message || String(error),
      });
      throw error;
    }
  }

  /**
   * 从数据库恢复所有 TLS 证书到文件系统
   */
  async restoreTlsCertificates(): Promise<{ success: number; failed: number; skipped: number }> {
    const stats = { success: 0, failed: 0, skipped: 0 };

    try {
      logger.info('Starting TLS certificates restoration from database...');

      // 确定证书存储目录（从配置读取）
      const certsDir = config.sipp.certDir;
      if (!fsSync.existsSync(certsDir)) {
        await fs.mkdir(certsDir, { recursive: true });
        logger.info(`Created TLS certificates directory: ${certsDir}`);
      }

      // 从数据库读取所有证书（需要完整内容）
      const certificates = await tlsCertificateRepository.findAll();

      if (certificates.length === 0) {
        logger.info('No TLS certificate records found in database');
        return stats;
      }

      logger.info(`Found ${certificates.length} TLS certificate(s) in database`);

      for (const certInfo of certificates) {
        try {
          // 获取完整证书内容
          const cert = await tlsCertificateRepository.findById(certInfo.id);

          // 使用证书 ID 或名称作为文件名（清理非法字符）
          const safeName = cert.name.replace(/[^a-zA-Z0-9_-]/g, '_');
          const certPath = path.join(certsDir, `${safeName}.crt`);
          const keyPath = path.join(certsDir, `${safeName}.key`);

          // 检查文件是否已存在
          let shouldRestore = true;

          if (fsSync.existsSync(certPath) && fsSync.existsSync(keyPath)) {
            // 读取现有文件的修改时间
            const certStat = await fs.stat(certPath);
            const fileModTime = certStat.mtime;
            const dbModTime = new Date(cert.updated_at);

            // 如果文件比数据库记录更新，跳过
            if (fileModTime > dbModTime) {
              logger.debug(`TLS certificate files already exist and are newer: ${safeName}`, {
                fileModTime: fileModTime.toISOString(),
                dbModTime: dbModTime.toISOString(),
              });
              shouldRestore = false;
              stats.skipped++;
            }
          }

          if (shouldRestore) {
            // 写入证书和私钥文件
            await fs.writeFile(certPath, cert.cert_content, { mode: 0o644 });
            await fs.writeFile(keyPath, cert.key_content, { mode: 0o600 }); // 私钥设置为仅所有者可读

            logger.info(`Restored TLS certificate: ${safeName}`, {
              certId: cert.id,
              certPath,
              keyPath,
            });
            stats.success++;
          }

        } catch (error: any) {
          logger.error(`Failed to restore TLS certificate: ${certInfo.name}`, {
            certId: certInfo.id,
            error: error.message || String(error),
          });
          stats.failed++;
        }
      }

      logger.info('TLS certificates restoration completed', {
        total: certificates.length,
        success: stats.success,
        failed: stats.failed,
        skipped: stats.skipped,
      });

      return stats;

    } catch (error: any) {
      logger.error('Failed to restore TLS certificates from database:', {
        error: error.message || String(error),
      });
      throw error;
    }
  }

  /**
   * 恢复所有文件（场景 + 注入 + TLS证书）
   */
  async restoreAllFiles(): Promise<void> {
    try {
      logger.info('=== Starting file restoration from database ===');

      // 确保目录存在
      if (!fsSync.existsSync(config.sipp.scenarioDir)) {
        await fs.mkdir(config.sipp.scenarioDir, { recursive: true });
        logger.info(`Created scenario directory: ${config.sipp.scenarioDir}`);
      }

      if (!fsSync.existsSync(config.sipp.injectionDir)) {
        await fs.mkdir(config.sipp.injectionDir, { recursive: true });
        logger.info(`Created injection directory: ${config.sipp.injectionDir}`);
      }

      // 并行恢复场景文件、注入文件和 TLS 证书
      const [scenarioStats, injectionStats, tlsStats] = await Promise.all([
        this.restoreScenarioFiles(),
        this.restoreInjectionFiles(),
        this.restoreTlsCertificates(),
      ]);

      // 汇总统计
      const totalSuccess = scenarioStats.success + injectionStats.success + tlsStats.success;
      const totalFailed = scenarioStats.failed + injectionStats.failed + tlsStats.failed;
      const totalSkipped = scenarioStats.skipped + injectionStats.skipped + tlsStats.skipped;
      const totalFiles = totalSuccess + totalFailed + totalSkipped;

      logger.info('=== File restoration summary ===', {
        scenarios: scenarioStats,
        injections: injectionStats,
        tls_certificates: tlsStats,
        total: {
          files: totalFiles,
          success: totalSuccess,
          failed: totalFailed,
          skipped: totalSkipped,
        },
      });

      if (totalFailed > 0) {
        logger.warn(`${totalFailed} file(s) failed to restore, check logs for details`);
      }

    } catch (error: any) {
      logger.error('File restoration failed:', {
        error: error.message || String(error),
      });
      // 不抛出错误，允许服务继续启动
    }
  }

  /**
   * 恢复单个场景文件
   */
  async restoreScenarioFile(filename: string): Promise<boolean> {
    try {
      const record = await scenarioRepository.findByFilename(filename);

      if (!record) {
        logger.warn(`Scenario not found in database: ${filename}`);
        return false;
      }

      const scenario: Scenario = {
        name: record.name,
        description: record.description,
        messages: record.messages,
        variables: record.variables,
        init: record.init,
        injection_file: record.injection_file,
      };

      const filePath = path.join(config.sipp.scenarioDir, filename);
      await xmlParser.generateFile(scenario, filePath);

      logger.info(`Restored scenario file: ${filename}`);
      return true;

    } catch (error: any) {
      logger.error(`Failed to restore scenario file: ${filename}`, {
        error: error.message || String(error),
      });
      return false;
    }
  }

  /**
   * 恢复单个注入文件
   */
  async restoreInjectionFile(filename: string): Promise<boolean> {
    try {
      const record = await injectionFileRepository.findByFilename(filename);

      if (!record) {
        logger.warn(`Injection file not found in database: ${filename}`);
        return false;
      }

      const filePath = path.join(config.sipp.injectionDir, filename);
      await fs.writeFile(filePath, record.content, 'utf-8');

      logger.info(`Restored injection file: ${filename}`);
      return true;

    } catch (error: any) {
      logger.error(`Failed to restore injection file: ${filename}`, {
        error: error.message || String(error),
      });
      return false;
    }
  }

  /**
   * 恢复单个 TLS 证书
   */
  async restoreTlsCertificate(certId: string): Promise<boolean> {
    try {
      const cert = await tlsCertificateRepository.findById(certId);

      // 证书目录（从配置读取）
      const certsDir = config.sipp.certDir;
      if (!fsSync.existsSync(certsDir)) {
        await fs.mkdir(certsDir, { recursive: true });
      }

      const safeName = cert.name.replace(/[^a-zA-Z0-9_-]/g, '_');
      const certPath = path.join(certsDir, `${safeName}.crt`);
      const keyPath = path.join(certsDir, `${safeName}.key`);

      await fs.writeFile(certPath, cert.cert_content, { mode: 0o644 });
      await fs.writeFile(keyPath, cert.key_content, { mode: 0o600 });

      logger.info(`Restored TLS certificate: ${safeName}`, { certId });
      return true;

    } catch (error: any) {
      logger.error(`Failed to restore TLS certificate: ${certId}`, {
        error: error.message || String(error),
      });
      return false;
    }
  }
}

// 单例导出
export const fileRestoreService = new FileRestoreService();

