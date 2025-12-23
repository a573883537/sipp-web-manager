import { pool } from './index';
import { logger } from '../utils/logger';
import { randomUUID } from 'crypto';

/**
 * TLS 证书数据库模型
 */
export interface TlsCertificate {
  id: string;
  name: string;
  description?: string;
  cert_content: string;
  key_content: string;
  created_at: string;
  updated_at: string;
}

/**
 * TLS 证书创建数据
 */
export interface TlsCertificateCreate {
  name: string;
  description?: string;
  cert_content: string;
  key_content: string;
}

/**
 * TLS 证书 Repository（数据访问层）
 * 遵循单一职责原则：仅负责数据库操作
 */
class TlsCertificateRepository {
  /**
   * 创建证书
   */
  async create(data: TlsCertificateCreate): Promise<TlsCertificate> {
    const id = randomUUID();
    const query = `
      INSERT INTO tls_certificates (id, name, description, cert_content, key_content)
      VALUES (?, ?, ?, ?, ?)
    `;

    try {
      await pool.execute(query, [
        id,
        data.name,
        data.description || null,
        data.cert_content,
        data.key_content,
      ]);

      logger.info('TLS certificate created', { id, name: data.name });
      return this.findById(id);
    } catch (error: any) {
      logger.error('Failed to create TLS certificate', { error: error.message });
      throw error;
    }
  }

  /**
   * 根据 ID 查询证书
   */
  async findById(id: string): Promise<TlsCertificate> {
    const query = 'SELECT * FROM tls_certificates WHERE id = ?';

    try {
      const [rows]: any = await pool.execute(query, [id]);
      if (rows.length === 0) {
        throw new Error(`TLS certificate not found: ${id}`);
      }
      return rows[0] as TlsCertificate;
    } catch (error: any) {
      logger.error('Failed to find TLS certificate', { id, error: error.message });
      throw error;
    }
  }

  /**
   * 查询所有证书（不含内容，仅列表）
   */
  async findAll(): Promise<Omit<TlsCertificate, 'cert_content' | 'key_content'>[]> {
    const query = `
      SELECT id, name, description, created_at, updated_at
      FROM tls_certificates
      ORDER BY created_at DESC
    `;

    try {
      const [rows]: any = await pool.execute(query);
      return rows;
    } catch (error: any) {
      logger.error('Failed to list TLS certificates', { error: error.message });
      throw error;
    }
  }

  /**
   * 更新证书
   */
  async update(id: string, data: Partial<TlsCertificateCreate>): Promise<void> {
    const updates: string[] = [];
    const values: any[] = [];

    if (data.name !== undefined) {
      updates.push('name = ?');
      values.push(data.name);
    }
    if (data.description !== undefined) {
      updates.push('description = ?');
      values.push(data.description);
    }
    if (data.cert_content !== undefined) {
      updates.push('cert_content = ?');
      values.push(data.cert_content);
    }
    if (data.key_content !== undefined) {
      updates.push('key_content = ?');
      values.push(data.key_content);
    }

    if (updates.length === 0) {
      return;
    }

    const query = `UPDATE tls_certificates SET ${updates.join(', ')} WHERE id = ?`;
    values.push(id);

    try {
      await pool.execute(query, values);
      logger.info('TLS certificate updated', { id });
    } catch (error: any) {
      logger.error('Failed to update TLS certificate', { id, error: error.message });
      throw error;
    }
  }

  /**
   * 删除证书
   */
  async delete(id: string): Promise<void> {
    const query = 'DELETE FROM tls_certificates WHERE id = ?';

    try {
      await pool.execute(query, [id]);
      logger.info('TLS certificate deleted', { id });
    } catch (error: any) {
      logger.error('Failed to delete TLS certificate', { id, error: error.message });
      throw error;
    }
  }

  /**
   * 根据名称查询证书（用于重名检查）
   */
  async findByName(name: string): Promise<TlsCertificate | null> {
    const query = 'SELECT * FROM tls_certificates WHERE name = ?';

    try {
      const [rows]: any = await pool.execute(query, [name]);
      return rows.length > 0 ? (rows[0] as TlsCertificate) : null;
    } catch (error: any) {
      logger.error('Failed to find TLS certificate by name', { name, error: error.message });
      throw error;
    }
  }
}

export const tlsCertificateRepository = new TlsCertificateRepository();
