/**
 * 配置模板仓库
 * 用于保存和管理启动参数模板
 */

import { query, queryOne, execute } from './index';

export interface ConfigTemplate {
  id?: number;
  name: string;
  description?: string;
  config: Record<string, any>;
  is_default?: boolean;
  created_at?: string;
  updated_at?: string;
}

class ConfigTemplateRepository {
  /**
   * 获取所有模板
   */
  async findAll(): Promise<ConfigTemplate[]> {
    const sql = 'SELECT * FROM config_templates ORDER BY is_default DESC, updated_at DESC';
    return query<ConfigTemplate>(sql);
  }

  /**
   * 根据ID获取模板
   */
  async findById(id: number): Promise<ConfigTemplate | null> {
    const sql = 'SELECT * FROM config_templates WHERE id = ?';
    return queryOne<ConfigTemplate>(sql, [id]);
  }

  /**
   * 根据名称获取模板
   */
  async findByName(name: string): Promise<ConfigTemplate | null> {
    const sql = 'SELECT * FROM config_templates WHERE name = ?';
    return queryOne<ConfigTemplate>(sql, [name]);
  }

  /**
   * 获取默认模板
   */
  async findDefault(): Promise<ConfigTemplate | null> {
    const sql = 'SELECT * FROM config_templates WHERE is_default = 1 LIMIT 1';
    return queryOne<ConfigTemplate>(sql);
  }

  /**
   * 创建模板
   */
  async create(template: ConfigTemplate): Promise<number> {
    const sql = `
      INSERT INTO config_templates (name, description, config, is_default)
      VALUES (?, ?, ?, ?)
    `;
    const result = await execute(sql, [
      template.name,
      template.description || null,
      JSON.stringify(template.config),
      template.is_default ? 1 : 0,
    ]);
    return result.insertId;
  }

  /**
   * 更新模板
   */
  async update(id: number, template: Partial<ConfigTemplate>): Promise<boolean> {
    const fields: string[] = [];
    const values: any[] = [];

    if (template.name !== undefined) {
      fields.push('name = ?');
      values.push(template.name);
    }
    if (template.description !== undefined) {
      fields.push('description = ?');
      values.push(template.description);
    }
    if (template.config !== undefined) {
      fields.push('config = ?');
      values.push(JSON.stringify(template.config));
    }
    if (template.is_default !== undefined) {
      fields.push('is_default = ?');
      values.push(template.is_default ? 1 : 0);
    }

    if (fields.length === 0) return false;

    values.push(id);
    const sql = `UPDATE config_templates SET ${fields.join(', ')} WHERE id = ?`;
    const result = await execute(sql, values);
    return result.affectedRows > 0;
  }

  /**
   * 设置默认模板（取消其他默认）
   */
  async setDefault(id: number): Promise<boolean> {
    await execute('UPDATE config_templates SET is_default = 0');
    const result = await execute('UPDATE config_templates SET is_default = 1 WHERE id = ?', [id]);
    return result.affectedRows > 0;
  }

  /**
   * 删除模板
   */
  async delete(id: number): Promise<boolean> {
    const sql = 'DELETE FROM config_templates WHERE id = ?';
    const result = await execute(sql, [id]);
    return result.affectedRows > 0;
  }
}

export const configTemplateRepository = new ConfigTemplateRepository();
