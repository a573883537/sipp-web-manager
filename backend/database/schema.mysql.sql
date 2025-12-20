-- SIPp Web Manager 数据库表结构
-- MySQL Schema

-- 创建数据库（如果不存在）
CREATE DATABASE IF NOT EXISTS sipp_manager CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE sipp_manager;

-- 场景表
CREATE TABLE IF NOT EXISTS scenarios (
    id INT AUTO_INCREMENT PRIMARY KEY,
    filename VARCHAR(255) UNIQUE NOT NULL,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    messages JSON NOT NULL,
    variables JSON DEFAULT NULL,
    init JSON DEFAULT NULL,
    injection_file VARCHAR(255) DEFAULT NULL COMMENT '关联的注入文件名（可选）',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_scenarios_filename (filename),
    INDEX idx_scenarios_name (name),
    INDEX idx_scenarios_created_at (created_at DESC),
    INDEX idx_scenarios_injection (injection_file)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 注入文件表
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

-- 插入示例场景（可选）
INSERT IGNORE INTO scenarios (filename, name, description, messages)
VALUES (
    'example-uac.xml',
    'Basic UAC Example',
    '基础UAC呼叫流程示例',
    JSON_ARRAY(
        JSON_OBJECT('type', 'send', 'cdata', 'INVITE sip:[service]@[remote_ip]:[remote_port] SIP/2.0\\nVia: SIP/2.0/[transport] [local_ip]:[local_port];branch=[branch]\\nFrom: sipp <sip:sipp@[local_ip]:[local_port]>;tag=[pid]SIPpTag00[call_number]\\nTo: [service] <sip:[service]@[remote_ip]:[remote_port]>\\nCall-ID: [call_id]\\nCSeq: 1 INVITE\\nContact: sip:sipp@[local_ip]:[local_port]\\nMax-Forwards: 70\\nContent-Type: application/sdp\\nContent-Length: [len]\\n\\nv=0\\no=user1 53655765 2353687637 IN IP[local_ip_type] [local_ip]\\ns=-\\nc=IN IP[media_ip_type] [media_ip]\\nt=0 0\\nm=audio [media_port] RTP/AVP 0\\na=rtpmap:0 PCMU/8000'),
        JSON_OBJECT('type', 'recv', 'response', '100', 'optional', true),
        JSON_OBJECT('type', 'recv', 'response', '180', 'optional', true),
        JSON_OBJECT('type', 'recv', 'response', '200', 'rtd', true),
        JSON_OBJECT('type', 'send', 'cdata', 'ACK sip:[service]@[remote_ip]:[remote_port] SIP/2.0\\nVia: SIP/2.0/[transport] [local_ip]:[local_port];branch=[branch]\\nFrom: sipp <sip:sipp@[local_ip]:[local_port]>;tag=[pid]SIPpTag00[call_number]\\nTo: [service] <sip:[service]@[remote_ip]:[remote_port]>[peer_tag_param]\\nCall-ID: [call_id]\\nCSeq: 1 ACK\\nContact: sip:sipp@[local_ip]:[local_port]\\nMax-Forwards: 70\\nContent-Length: 0'),
        JSON_OBJECT('type', 'pause', 'milliseconds', 3000),
        JSON_OBJECT('type', 'send', 'cdata', 'BYE sip:[service]@[remote_ip]:[remote_port] SIP/2.0\\nVia: SIP/2.0/[transport] [local_ip]:[local_port];branch=[branch]\\nFrom: sipp <sip:sipp@[local_ip]:[local_port]>;tag=[pid]SIPpTag00[call_number]\\nTo: [service] <sip:[service]@[remote_ip]:[remote_port]>[peer_tag_param]\\nCall-ID: [call_id]\\nCSeq: 2 BYE\\nContact: sip:sipp@[local_ip]:[local_port]\\nMax-Forwards: 70\\nContent-Length: 0'),
        JSON_OBJECT('type', 'recv', 'response', '200')
    )
);

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

-- 任务历史表
CREATE TABLE IF NOT EXISTS task_history (
    id VARCHAR(36) PRIMARY KEY COMMENT '任务ID（UUID）',
    scenario_name VARCHAR(255) NOT NULL COMMENT '场景名称',
    scenario_file VARCHAR(255) NOT NULL COMMENT '场景文件名',
    status ENUM('RUNNING', 'COMPLETED', 'FAILED', 'STOPPED') NOT NULL COMMENT '任务状态',
    config JSON NOT NULL COMMENT '测试配置（rate、users、limit、remoteHost等）',
    stats JSON DEFAULT NULL COMMENT '统计数据（totalCalls、successCalls、failedCalls、successRate）',
    start_time BIGINT NOT NULL COMMENT '开始时间（毫秒时间戳）',
    end_time BIGINT DEFAULT NULL COMMENT '结束时间（毫秒时间戳）',
    error TEXT DEFAULT NULL COMMENT '错误信息（仅失败任务）',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_task_status (status),
    INDEX idx_task_scenario (scenario_file),
    INDEX idx_task_start_time (start_time DESC),
    INDEX idx_task_created (created_at DESC)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='SIPp测试任务历史记录';
