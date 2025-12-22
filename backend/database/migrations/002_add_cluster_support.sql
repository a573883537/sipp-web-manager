-- Migration: Add cluster support (master-slave architecture)
-- Version: 1.1.0
-- Date: 2025-01-XX
-- Description: 添加从机管理和集群支持

-- ============================================
-- Step 1: 创建从机注册表
-- ============================================
CREATE TABLE IF NOT EXISTS machines (
    id VARCHAR(50) PRIMARY KEY COMMENT '机器唯一标识（如：master, slave-01）',
    name VARCHAR(100) NOT NULL COMMENT '机器显示名称',
    ip_address VARCHAR(50) NOT NULL COMMENT 'IP地址',
    api_port INT DEFAULT 3000 COMMENT 'API端口',
    role ENUM('master', 'slave') DEFAULT 'slave' COMMENT '节点角色',
    sipp_version VARCHAR(50) COMMENT 'SIPp版本',
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
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='从机注册表';

-- ============================================
-- Step 2: task_history 表添加 machine_id 字段
-- ============================================
-- 检查字段是否已存在
SET @columnExists = (
    SELECT COUNT(*)
    FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = 'task_history'
      AND COLUMN_NAME = 'machine_id'
);

-- 如果不存在则添加
SET @addColumnSQL = IF(
    @columnExists = 0,
    'ALTER TABLE task_history ADD COLUMN machine_id VARCHAR(50) NOT NULL DEFAULT ''master'' COMMENT ''执行机器ID'' AFTER backend_pid',
    'SELECT ''Column machine_id already exists'' AS status'
);

PREPARE stmt FROM @addColumnSQL;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- ============================================
-- Step 3: 添加索引
-- ============================================
-- 检查索引是否已存在
SET @indexExists = (
    SELECT COUNT(*)
    FROM INFORMATION_SCHEMA.STATISTICS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = 'task_history'
      AND INDEX_NAME = 'idx_machine_id'
);

-- 如果不存在则创建
SET @addIndexSQL = IF(
    @indexExists = 0,
    'ALTER TABLE task_history ADD INDEX idx_machine_id (machine_id)',
    'SELECT ''Index idx_machine_id already exists'' AS status'
);

PREPARE stmt FROM @addIndexSQL;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- 复合索引（机器 + 状态）
SET @compositeIndexExists = (
    SELECT COUNT(*)
    FROM INFORMATION_SCHEMA.STATISTICS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = 'task_history'
      AND INDEX_NAME = 'idx_machine_status'
);

SET @addCompositeIndexSQL = IF(
    @compositeIndexExists = 0,
    'ALTER TABLE task_history ADD INDEX idx_machine_status (machine_id, status)',
    'SELECT ''Index idx_machine_status already exists'' AS status'
);

PREPARE stmt FROM @addCompositeIndexSQL;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- ============================================
-- Step 4: 插入主机默认记录
-- ============================================
INSERT INTO machines (id, name, ip_address, role, status, last_heartbeat)
VALUES ('master', '主控节点', '127.0.0.1', 'master', 'online', UNIX_TIMESTAMP() * 1000)
ON DUPLICATE KEY UPDATE
    name = VALUES(name),
    status = 'online',
    last_heartbeat = VALUES(last_heartbeat);

-- ============================================
-- Step 5: 更新现有任务记录（如果需要）
-- ============================================
-- 将现有没有 machine_id 的任务标记为 master
UPDATE task_history
SET machine_id = 'master'
WHERE machine_id = '' OR machine_id IS NULL;

-- ============================================
-- 验证
-- ============================================
SELECT 'Migration 002 completed successfully' AS status;
SELECT '✓ machines table created' AS step_1;
SELECT '✓ task_history.machine_id column added' AS step_2;
SELECT '✓ Indexes created' AS step_3;
SELECT '✓ Master node registered' AS step_4;
SELECT CONCAT('✓ ', COUNT(*), ' existing tasks updated') AS step_5
FROM task_history WHERE machine_id = 'master';
