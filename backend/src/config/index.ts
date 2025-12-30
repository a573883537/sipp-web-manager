import dotenv from 'dotenv';
import path from 'path';
import os from 'os';

// 加载环境变量
dotenv.config();

/**
 * 应用配置
 * 遵循单一职责原则：集中管理所有配置项
 */
export const config = {
  // 服务器配置
  server: {
    port: parseInt(process.env.PORT || '3000', 10),
    env: process.env.NODE_ENV || 'development',
    isDevelopment: process.env.NODE_ENV === 'development',
    isProduction: process.env.NODE_ENV === 'production',
  },

  // 节点配置（主从架构）
  node: {
    role: (process.env.NODE_ROLE || 'slave') as 'master' | 'slave',
    machineId: process.env.MACHINE_ID || (process.env.NODE_ROLE === 'master' ? 'master' : `slave-${os.hostname()}`),
    machineName: process.env.MACHINE_NAME || os.hostname(),
    masterHost: process.env.MASTER_HOST || '127.0.0.1',
    masterPort: parseInt(process.env.MASTER_PORT || '3000', 10),
    heartbeatInterval: parseInt(process.env.HEARTBEAT_INTERVAL || '10000', 10),
    heartbeatTimeout: parseInt(process.env.HEARTBEAT_TIMEOUT || '5000', 10),
    heartbeatMaxRetryInterval: parseInt(process.env.HEARTBEAT_MAX_RETRY_INTERVAL || '120000', 10),
    heartbeatBackoffEnabled: process.env.HEARTBEAT_BACKOFF_ENABLED !== 'false',
  },

  // SIPp配置
  sipp: {
    host: process.env.SIPP_HOST || 'localhost',
    controlPort: parseInt(process.env.SIPP_CONTROL_PORT || '8888', 10),
    csvPath: process.env.SIPP_CSV_PATH || '/tmp/sipp_stats.csv',
    scenarioDir: process.env.SIPP_SCENARIO_DIR || path.join(__dirname, '../../../scenarios'),
    injectionDir: process.env.SIPP_INJECTION_DIR || path.join(__dirname, '../../../injections'),
    logDir: process.env.SIPP_LOG_DIR || path.join(__dirname, '../../../logs'),
  },

  // WebSocket配置
  websocket: {
    port: parseInt(process.env.WS_PORT || '3001', 10),
    corsOrigin: process.env.WS_CORS_ORIGIN || 'http://localhost:5173',
  },

  // 日志配置
  logging: {
    level: process.env.LOG_LEVEL || 'info',
    file: process.env.LOG_FILE || './logs/app.log',
  },

  // 数据库配置 (MySQL)
  database: {
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT || '3306', 10),
    name: process.env.DB_NAME || 'sipp_manager',
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    poolSize: parseInt(process.env.DB_POOL_SIZE || '10', 10),
  },
} as const;

/**
 * 验证必需的配置项
 */
export function validateConfig(): void {
  const required = [
    { key: 'SIPP_HOST', value: config.sipp.host },
    { key: 'SIPP_CONTROL_PORT', value: config.sipp.controlPort },
  ];

  const missing = required.filter(({ value }) => !value);

  if (missing.length > 0) {
    throw new Error(
      `Missing required configuration: ${missing.map(({ key }) => key).join(', ')}`
    );
  }
}
