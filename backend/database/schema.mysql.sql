-- SIPp Web Manager Database Schema
-- MySQL Schema
-- Version: 1.0
-- Last Updated: 2025-01-01

-- Create database if not exists
CREATE DATABASE IF NOT EXISTS sipp_manager CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE sipp_manager;

-- ============================================
-- Scenarios Table
-- ============================================
CREATE TABLE IF NOT EXISTS scenarios (
    id INT AUTO_INCREMENT PRIMARY KEY COMMENT 'Auto-increment primary key',
    filename VARCHAR(255) UNIQUE NOT NULL COMMENT 'Scenario filename (unique identifier)',
    name VARCHAR(255) NOT NULL COMMENT 'Scenario name',
    description TEXT COMMENT 'Scenario description',
    messages JSON NOT NULL COMMENT 'Message sequence (SIP message flow)',
    variables JSON DEFAULT NULL COMMENT 'Variable definitions',
    init JSON DEFAULT NULL COMMENT 'Initialization script',
    injection_file VARCHAR(255) DEFAULT NULL COMMENT 'Associated injection file name',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP COMMENT 'Creation time',
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT 'Update time',
    
    INDEX idx_scenarios_filename (filename),
    INDEX idx_scenarios_name (name),
    INDEX idx_scenarios_created_at (created_at DESC),
    INDEX idx_scenarios_injection (injection_file)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='SIPp test scenarios';

-- ============================================
-- Injection Files Table
-- ============================================
CREATE TABLE IF NOT EXISTS injection_files (
    id INT AUTO_INCREMENT PRIMARY KEY COMMENT 'Auto-increment primary key',
    filename VARCHAR(255) UNIQUE NOT NULL COMMENT 'CSV filename (unique identifier)',
    description TEXT COMMENT 'File description',
    content TEXT NOT NULL COMMENT 'CSV file content (full text)',
    field_count INT NOT NULL COMMENT 'Number of fields (for validation)',
    row_count INT NOT NULL COMMENT 'Number of data rows (excluding header)',
    read_mode ENUM('SEQUENTIAL', 'RANDOM', 'USER') DEFAULT 'SEQUENTIAL' COMMENT 'Read mode: sequential/random/user',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP COMMENT 'Creation time',
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT 'Update time',
    
    INDEX idx_injection_filename (filename),
    INDEX idx_injection_created (created_at DESC)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='SIPp injection files (CSV format)';

-- ============================================
-- Task History Table
-- ============================================
CREATE TABLE IF NOT EXISTS task_history (
    id VARCHAR(36) PRIMARY KEY COMMENT 'Task ID (UUID format)',
    scenario_name VARCHAR(255) NOT NULL COMMENT 'Scenario name',
    scenario_file VARCHAR(255) NOT NULL COMMENT 'Scenario filename',
    status ENUM('RUNNING', 'COMPLETED', 'FAILED', 'STOPPED') NOT NULL COMMENT 'Task status',
    config JSON NOT NULL COMMENT 'Test configuration (rate, users, limit, remoteHost, etc.)',
    stats JSON DEFAULT NULL COMMENT 'Statistics data (totalCalls, successCalls, failedCalls, successRate)',
    pid INT DEFAULT NULL COMMENT 'Process PID (for recovery after service restart)',
    control_port INT DEFAULT NULL COMMENT 'Control port (for recovery after service restart)',
    start_time BIGINT NOT NULL COMMENT 'Start time (milliseconds timestamp)',
    end_time BIGINT DEFAULT NULL COMMENT 'End time (milliseconds timestamp)',
    error TEXT DEFAULT NULL COMMENT 'Error message (failed tasks only)',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP COMMENT 'Creation time',
    
    INDEX idx_task_status (status),
    INDEX idx_task_scenario (scenario_file),
    INDEX idx_task_start_time (start_time DESC),
    INDEX idx_task_created (created_at DESC)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='SIPp test task history records';

-- ============================================
-- Config Templates Table
-- ============================================
CREATE TABLE IF NOT EXISTS config_templates (
    id INT AUTO_INCREMENT PRIMARY KEY COMMENT 'Auto-increment primary key',
    name VARCHAR(255) UNIQUE NOT NULL COMMENT 'Template name',
    description TEXT COMMENT 'Template description',
    config JSON NOT NULL COMMENT 'Configuration content (startup parameters)',
    is_default TINYINT(1) DEFAULT 0 COMMENT 'Whether this is the default template',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP COMMENT 'Creation time',
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT 'Update time',
    
    INDEX idx_template_name (name),
    INDEX idx_template_default (is_default)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='Startup configuration templates';

-- ============================================
-- Insert Sample Data
-- ============================================

-- Default Config Template
INSERT IGNORE INTO config_templates (name, description, config, is_default)
VALUES (
    'Default Config',
    'Standard test configuration template',
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
        'timeout', 120000
    ),
    1
);
