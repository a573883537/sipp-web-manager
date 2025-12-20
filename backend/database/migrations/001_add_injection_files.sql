-- Migration: Add injection files support
-- Purpose: Enable user authentication injection for SIPp scenarios
-- Author: System
-- Date: 2025-12-19

USE sipp_manager;

-- 创建注入文件表
CREATE TABLE IF NOT EXISTS injection_files (
    id INT AUTO_INCREMENT PRIMARY KEY,
    filename VARCHAR(255) UNIQUE NOT NULL COMMENT 'CSV文件名（唯一标识）',
    description TEXT COMMENT '文件描述',
    content TEXT NOT NULL COMMENT 'CSV文件内容（完整文本）',
    field_count INT NOT NULL COMMENT '字段数量（用于校验）',
    row_count INT NOT NULL COMMENT '数据行数（不含标题）',
    read_mode ENUM('SEQUENTIAL', 'RANDOM', 'USER') DEFAULT 'SEQUENTIAL' COMMENT '读取模式',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

    INDEX idx_injection_filename (filename),
    INDEX idx_injection_created (created_at DESC)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='SIPp注入文件（CSV格式）';

-- 扩展场景表：添加注入文件关联字段
ALTER TABLE scenarios
ADD COLUMN injection_file VARCHAR(255) DEFAULT NULL COMMENT '关联的注入文件名（可选）' AFTER init,
ADD INDEX idx_scenarios_injection (injection_file);

-- 插入示例注入文件
INSERT IGNORE INTO injection_files (filename, description, content, field_count, row_count, read_mode)
VALUES (
    'users_4000-4010.csv',
    '分机4000-4010认证信息示例',
    'SEQUENTIAL
# [field0];[field1];[field2]
4000;password4000;192.168.1.100
4001;password4001;192.168.1.100
4002;password4002;192.168.1.100
4003;password4003;192.168.1.100
4004;password4004;192.168.1.100
4005;password4005;192.168.1.100
4006;password4006;192.168.1.100
4007;password4007;192.168.1.100
4008;password4008;192.168.1.100
4009;password4009;192.168.1.100
4010;password4010;192.168.1.100',
    3,
    11,
    'SEQUENTIAL'
);
