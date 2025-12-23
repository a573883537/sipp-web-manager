-- ============================================
-- SIPp Web Manager - Complete Database Schema
-- ============================================
-- Version: 2.0.0
-- Date: 2025-01-23
-- Description: 完整的数据库初始化脚本（主机/从机通用）
--
-- 功能清单：
-- 1. 场景管理（scenarios）
-- 2. 注入文件（injection_files）
-- 3. 任务历史（task_history）
-- 4. 配置模板（config_templates）
-- 5. 集群节点管理（machines）
-- 6. TLS 证书管理（tls_certificates）
-- ============================================

-- 创建数据库
CREATE DATABASE IF NOT EXISTS sipp_manager
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;

USE sipp_manager;

-- ============================================
-- 1. 场景表 (scenarios)
-- ============================================
CREATE TABLE IF NOT EXISTS scenarios (
    id INT AUTO_INCREMENT PRIMARY KEY COMMENT '自增主键',
    filename VARCHAR(255) UNIQUE NOT NULL COMMENT '场景文件名（唯一标识）',
    name VARCHAR(255) NOT NULL COMMENT '场景名称',
    description TEXT COMMENT '场景描述',
    messages JSON NOT NULL COMMENT '消息序列（SIP消息流程）',
    variables JSON DEFAULT NULL COMMENT '变量定义',
    init JSON DEFAULT NULL COMMENT '初始化脚本',
    injection_file VARCHAR(255) DEFAULT NULL COMMENT '关联的注入文件名',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',

    INDEX idx_filename (filename),
    INDEX idx_name (name),
    INDEX idx_created_at (created_at DESC),
    INDEX idx_injection (injection_file)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  COMMENT='SIPp测试场景';

-- ============================================
-- 2. 注入文件表 (injection_files)
-- ============================================
CREATE TABLE IF NOT EXISTS injection_files (
    id INT AUTO_INCREMENT PRIMARY KEY COMMENT '自增主键',
    filename VARCHAR(255) UNIQUE NOT NULL COMMENT 'CSV文件名（唯一标识）',
    description TEXT COMMENT '文件描述',
    content TEXT NOT NULL COMMENT 'CSV文件内容（完整文本）',
    field_count INT NOT NULL COMMENT '字段数量（用于验证）',
    row_count INT NOT NULL COMMENT '数据行数（不含表头）',
    read_mode ENUM('SEQUENTIAL', 'RANDOM', 'USER') DEFAULT 'SEQUENTIAL' COMMENT '读取模式：顺序/随机/用户',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',

    INDEX idx_filename (filename),
    INDEX idx_created (created_at DESC)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  COMMENT='SIPp注入文件（CSV格式）';

-- ============================================
-- 3. 任务历史表 (task_history)
-- ============================================
CREATE TABLE IF NOT EXISTS task_history (
    id VARCHAR(36) PRIMARY KEY COMMENT '任务ID（UUID格式）',
    scenario_name VARCHAR(255) NOT NULL COMMENT '场景名称',
    scenario_file VARCHAR(255) NOT NULL COMMENT '场景文件名',
    status ENUM('RUNNING', 'COMPLETED', 'FAILED', 'STOPPED') NOT NULL COMMENT '任务状态',
    config JSON NOT NULL COMMENT '测试配置（rate/users/limit/remoteHost等）',
    stats JSON DEFAULT NULL COMMENT '统计数据（totalCalls/successCalls/failedCalls/successRate）',
    pid INT DEFAULT NULL COMMENT '进程PID（用于服务重启后恢复）',
    control_port INT DEFAULT NULL COMMENT '控制端口（用于服务重启后恢复）',
    backend_pid INT DEFAULT NULL COMMENT '后端进程PID（用于孤儿进程检测）',
    machine_id VARCHAR(50) NOT NULL DEFAULT 'master' COMMENT '执行机器ID',
    start_time BIGINT NOT NULL COMMENT '开始时间（毫秒时间戳）',
    end_time BIGINT DEFAULT NULL COMMENT '结束时间（毫秒时间戳）',
    error TEXT DEFAULT NULL COMMENT '错误信息（仅失败任务）',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',

    INDEX idx_status (status),
    INDEX idx_scenario (scenario_file),
    INDEX idx_machine_id (machine_id),
    INDEX idx_machine_status (machine_id, status),
    INDEX idx_start_time (start_time DESC),
    INDEX idx_created (created_at DESC),
    INDEX idx_backend_pid (backend_pid)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  COMMENT='SIPp测试任务历史记录';

-- ============================================
-- 4. 配置模板表 (config_templates)
-- ============================================
CREATE TABLE IF NOT EXISTS config_templates (
    id INT AUTO_INCREMENT PRIMARY KEY COMMENT '自增主键',
    name VARCHAR(255) UNIQUE NOT NULL COMMENT '模板名称',
    description TEXT COMMENT '模板描述',
    config JSON NOT NULL COMMENT '配置内容（启动参数）',
    is_default TINYINT(1) DEFAULT 0 COMMENT '是否为默认模板',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',

    INDEX idx_name (name),
    INDEX idx_default (is_default)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  COMMENT='启动配置模板';

-- ============================================
-- 5. 集群节点管理表 (machines)
-- ============================================
CREATE TABLE IF NOT EXISTS machines (
    id VARCHAR(50) PRIMARY KEY COMMENT '机器唯一标识（如：master, slave-01）',
    name VARCHAR(100) NOT NULL COMMENT '机器显示名称',
    ip_address VARCHAR(50) NOT NULL COMMENT 'IP地址',
    api_port INT DEFAULT 3000 COMMENT 'API端口',
    role ENUM('master', 'slave') DEFAULT 'slave' COMMENT '节点角色',
    status ENUM('online', 'offline', 'busy') DEFAULT 'offline' COMMENT '在线状态',
    cpu_usage DECIMAL(5,2) COMMENT 'CPU使用率（%）',
    memory_usage DECIMAL(5,2) COMMENT '内存使用率（%）',
    running_tasks INT DEFAULT 0 COMMENT '运行中的任务数',
    total_tasks INT DEFAULT 0 COMMENT '历史任务总数',
    last_heartbeat BIGINT COMMENT '最后心跳时间（毫秒时间戳）',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',

    INDEX idx_status (status),
    INDEX idx_role (role),
    INDEX idx_last_heartbeat (last_heartbeat),
    INDEX idx_status_role (status, role)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  COMMENT='集群节点注册表';

-- ============================================
-- 6. TLS 证书管理表 (tls_certificates)
-- ============================================
CREATE TABLE IF NOT EXISTS tls_certificates (
    id VARCHAR(36) PRIMARY KEY COMMENT '证书ID（UUID格式）',
    name VARCHAR(255) NOT NULL COMMENT '证书名称（用户自定义）',
    description TEXT COMMENT '证书描述',
    cert_content TEXT NOT NULL COMMENT '证书内容（PEM格式，完整文本）',
    key_content TEXT NOT NULL COMMENT '私钥内容（PEM格式，完整文本）',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',

    INDEX idx_name (name),
    INDEX idx_created (created_at DESC)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  COMMENT='TLS证书配置（主机存储，从机按需拉取）';

-- ============================================
-- 初始化数据
-- ============================================

-- 插入默认配置模板
INSERT IGNORE INTO config_templates (name, description, config, is_default)
VALUES (
    'Default Config',
    '标准测试配置模板',
    JSON_OBJECT(
        'remoteHost', '127.0.0.1',
        'remotePort', 5060,
        'localPort', 5061,
        'rate', 1,
        'users', 10,
        'limit', 100,
        'transport', 'udp',
        'minRtpPort', 6000,
        'maxRtpPort', 6100,
        'enableRtpEcho', false,
        'timeout', 120000,
        'traceMsg', false,
        'traceErr', false,
        'traceCalldebug', false,
        'traceShortmsg', false,
        'traceLogs', false,
        'traceRtt', false,
        'bindLocal', false,
        'autoAnswer', false
    ),
    1
);

-- ============================================
-- 验证
-- ============================================
SELECT 'Database initialized successfully!' AS status;
SELECT CONCAT('✓ ', COUNT(*), ' tables created') AS result
FROM information_schema.tables
WHERE table_schema = 'sipp_manager';
