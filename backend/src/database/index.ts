/**
 * 数据库连接模块
 * 使用mysql2进行MySQL连接管理
 * 遵循SOLID原则：单一职责 - 仅负责数据库连接初始化
 */

import mysql from 'mysql2/promise';
import { logger } from '../utils/logger';

// 数据库连接配置
const dbConfig = {
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT || '3306', 10),
  database: process.env.DB_NAME || 'sipp_manager',
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  waitForConnections: true,
  connectionLimit: parseInt(process.env.DB_POOL_SIZE || '10', 10),
  queueLimit: 0,
  connectTimeout: 10000, // 10秒连接超时
  enableKeepAlive: true,
  keepAliveInitialDelay: 0,
};

// 创建连接池
const pool = mysql.createPool(dbConfig);

/**
 * 测试数据库连接
 */
export async function testConnection(): Promise<boolean> {
  try {
    const connection = await pool.getConnection();
    await connection.ping();
    connection.release();
    logger.info('Database connection successful', {
      host: dbConfig.host,
      database: dbConfig.database
    });
    return true;
  } catch (error: any) {
    logger.error('Database connection failed', {
      error: error.message,
      host: dbConfig.host,
      database: dbConfig.database,
    });
    return false;
  }
}

/**
 * 初始化数据库（检查表是否存在）
 */
export async function initializeDatabase(): Promise<void> {
  try {
    const [rows] = await pool.query(
      "SELECT COUNT(*) as count FROM information_schema.tables WHERE table_schema = ? AND table_name = 'scenarios'",
      [dbConfig.database]
    );

    const count = (rows as any)[0].count;

    if (count > 0) {
      logger.info('Database schema已存在');
    } else {
      logger.warn('Database schema不存在，请手动执行schema.mysql.sql');
    }
  } catch (error: any) {
    logger.error('Failed to check database schema', { error: error.message });
    // 不抛出错误，允许应用继续启动
  }
}

/**
 * 执行查询
 */
export async function query<T = any>(sql: string, params?: any[]): Promise<T[]> {
  try {
    const [rows] = await pool.execute(sql, params);
    return rows as T[];
  } catch (error: any) {
    logger.error('Query execution failed', {
      sql,
      params,
      error: error.message
    });
    throw error;
  }
}

/**
 * 执行单个查询（返回第一行）
 */
export async function queryOne<T = any>(sql: string, params?: any[]): Promise<T | null> {
  const rows = await query<T>(sql, params);
  return rows.length > 0 ? rows[0] : null;
}

/**
 * 执行更新/插入/删除
 */
export async function execute(sql: string, params?: any[]): Promise<any> {
  try {
    const [result] = await pool.execute(sql, params);
    return result;
  } catch (error: any) {
    logger.error('Execute failed', {
      sql,
      params,
      error: error.message
    });
    throw error;
  }
}

/**
 * 开始事务
 */
export async function beginTransaction() {
  const connection = await pool.getConnection();
  await connection.beginTransaction();
  return connection;
}

export { pool };
export default pool;
