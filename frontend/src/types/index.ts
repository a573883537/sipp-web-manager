/**
 * 类型定义
 * 遵循单一职责原则：集中管理所有类型定义
 */

/**
 * SIPp统计数据
 */
export interface SippStats {
  timestamp: number;
  calls: {
    total: number;
    current: number;
    success: number;
    failed: number;
  };
  rate: {
    current: number;
    target: number;
  };
  messages: {
    sent: number;
    received: number;
    timeout: number;
  };
}

/**
 * CSV统计行
 */
export interface CsvStatsRow {
  timestamp: number;
  elapsed: number;
  callRate: number;
  currentCalls: number;
  totalCalls: number;
  successCalls: number;
  failedCalls: number;
}

/**
 * 场景消息类型
 */
export type MessageType = 'send' | 'recv' | 'pause' | 'nop' | 'sendcmd' | 'recvcmd' | 'action' | 'label';

/**
 * Exec子类型（用于action:exec的具体功能）
 */
export type ExecSubType =
  | 'command'           // 执行Shell命令
  | 'int_cmd'           // 内部控制命令（stop_now, stop_gracefully, stop_call）
  | 'play_pcap_audio'   // 播放音频PCAP
  | 'play_pcap_video'   // 播放视频PCAP
  | 'play_pcap_image'   // 播放图像PCAP
  | 'play_dtmf'         // 发送DTMF按键音
  | 'rtp_stream'        // 流式播放音频文件（WAV）
  | 'rtp_echo';         // RTP回声测试（0/1）

/**
 * Action类型
 */
export type ActionType =
  | 'exec'          // 执行外部命令（需配合exec_subtype）
  | 'log'           // 记录日志
  | 'warning'       // 记录警告
  | 'error'         // 记录错误并退出
  | 'assign'        // 变量赋值
  | 'assignstr'     // 字符串赋值
  | 'strcmp'        // 字符串比较
  | 'test'          // 条件测试
  | 'verifyauth'    // 验证认证
  | 'lookup'        // 查找表查询
  | 'jump'          // 跳转到标签
  | 'play_pcap_audio'  // 播放PCAP音频
  | 'play_pcap_video'; // 播放PCAP视频

/**
 * Action定义
 */
export interface ScenarioAction {
  type: ActionType;
  // exec 命令执行
  command?: string;
  // log/warning/error 日志消息
  message?: string;
  // assign/assignstr 变量赋值
  assign_to?: string;
  value?: string;
  // strcmp 字符串比较
  variable?: string;
  variable2?: string;
  compare_value?: string;
  // test 条件测试
  test_variable?: string;
  test_value?: string;
  test_op?: 'equal' | 'not_equal' | 'greater' | 'less' | 'greater_equal' | 'less_equal';
  // verifyauth 认证验证
  username?: string;
  password?: string;
  // lookup 查找
  file?: string;
  key?: string;
  // jump 跳转
  label?: string;
  // play_pcap 播放
  pcap_file?: string;
}

/**
 * 场景消息
 */
export interface ScenarioMessage {
  type: MessageType;
  request?: string;
  response?: string;
  optional?: boolean;
  rtd?: boolean;
  auth?: boolean;  // 启用认证（用于接收401/407时触发dialog_authentication）
  timeout?: number;
  milliseconds?: number;
  cdata?: string;
  // SDP媒体编码配置（用于包含SDP的send/recv消息，如INVITE、UPDATE、200 OK等）
  codecs?: number[];  // RTP payload types数组，如 [0, 8, 18] 表示 PCMU, PCMA, G729
  // action相关字段（当type为'action'时使用）
  actionType?: ActionType;
  // exec相关字段（当actionType为'exec'时使用）
  exec_subtype?: ExecSubType;
  int_cmd_value?: 'stop_now' | 'stop_gracefully' | 'stop_call';  // int_cmd的值
  dtmf_digits?: string;      // play_dtmf的按键序列
  dtmf_duration?: number;    // play_dtmf的按键时长（毫秒）
  rtp_stream_file?: string;  // rtp_stream的文件路径
  rtp_stream_loop?: number;  // rtp_stream的循环次数
  rtp_stream_payload?: number;  // rtp_stream的payload类型
  rtp_stream_rate?: number;  // rtp_stream的采样率
  rtp_stream_command?: 'pause' | 'resume';  // rtp_stream的控制命令
  rtp_echo_value?: 0 | 1;    // rtp_echo的值（0=停止, 1=启动）
  // 通用字段
  command?: string;
  message?: string;
  assign_to?: string;
  value?: string;
  variable?: string;
  variable2?: string;
  compare_value?: string;
  test_variable?: string;
  test_value?: string;
  test_op?: 'equal' | 'not_equal' | 'greater' | 'less' | 'greater_equal' | 'less_equal';
  username?: string;
  password?: string;
  file?: string;
  key?: string;
  label?: string;
  pcap_file?: string;
  // 条件跳转相关字段（SIPp label/next/ontimeout特性）
  next?: string;        // 跳转目标的label ID（当optional=true且消息收到时跳转）
  ontimeout?: string;   // 超时跳转目标的label ID（当消息超时时跳转）
  label_id?: string;    // 标签ID（用于定义跳转目标，配合<label id="xxx"/>使用）
  crlf?: boolean;       // 是否在消息后添加CRLF（用于某些协议兼容性）
}

/**
 * 场景定义
 */
export interface Scenario {
  name: string;
  messages: ScenarioMessage[];
  variables?: any[];
  init?: any[];
  injection_file?: string;  // 关联的注入文件名
}

/**
 * 场景文件信息
 */
export interface ScenarioFile {
  name: string;
  filename: string;
  path: string;
  injection_file?: string;  // 关联的注入文件名
}

/**
 * API响应基础接口
 * 由于axios拦截器已经解包response.data，
 * 所以这里的ApiResponse直接包含所有字段
 */
export interface ApiResponse<T = any> extends Record<string, any> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
  // 允许添加任意其他字段（如scenarios, scenario等）
}

/**
 * WebSocket消息类型
 */
export interface WebSocketMessage<T = any> {
  type: string;
  data: T;
  timestamp: number;
}

/**
 * SIPp配置
 */
export interface SippConfig {
  host: string;
  controlPort: number;
  scenarioDir: string;
  csvPath?: string;
}

/**
 * 测试配置
 */
export interface TestConfig {
  rate: number;
  users: number;
  limit: number;
  duration?: number;
  scenario?: string;
  injectionFile?: string; // 注入文件名（可选）
  regScenarioFile?: string; // 注册场景文件（TLS连接复用）
  regMaxCalls?: number; // 注册呼叫最大数量
}

/**
 * 连接状态
 */
export enum ConnectionStatus {
  CONNECTED = 'connected',
  DISCONNECTED = 'disconnected',
  CONNECTING = 'connecting',
  ERROR = 'error',
}

/**
 * 图表数据点
 */
export interface ChartDataPoint {
  timestamp: number;
  value: number;
  label?: string;
}

/**
 * 统计概览
 */
export interface StatsOverview {
  totalCalls: number;
  successRate: number;
  failedCalls: number;
  currentCalls: number;
  callRate: number;
  avgResponseTime?: number;
  peakResponseTime?: number;
}

/**
 * 注入文件
 */
export interface InjectionFile {
  id: number;
  filename: string;
  description?: string;
  content: string;
  field_count: number;
  row_count: number;
  read_mode: 'SEQUENTIAL' | 'RANDOM' | 'USER';
  created_at: string;
  updated_at: string;
}

/**
 * 注入文件验证结果
 */
export interface InjectionFileValidation {
  valid: boolean;
  errors: string[];
  warnings: string[];
  metadata?: {
    fieldCount: number;
    rowCount: number;
    readMode: 'SEQUENTIAL' | 'RANDOM' | 'USER';
  };
}

/**
 * 测试任务状态
 */
export enum TestTaskStatus {
  RUNNING = 'running',
  COMPLETED = 'completed',
  FAILED = 'failed',
  STOPPED = 'stopped',
}

/**
 * 测试任务记录
 */
export interface TestTask {
  id: string;
  scenarioFile: string;
  scenarioName: string;
  status: TestTaskStatus;
  machineId?: string;
  startTime: number;
  endTime?: number;
  duration?: number;
  config: {
    rate: number;
    users: number;
    limit: number;
    remoteHost: string;
    remotePort: number;
    localPort: number;
    transport: string;
    injectionFile?: string;
    minRtpPort?: number;
    maxRtpPort?: number;
    oocsf?: string;
    autoAnswer?: boolean;
    regScenarioFile?: string; // 注册场景文件
    regMaxCalls?: number; // 注册呼叫最大数量
    certId?: string; // TLS 证书ID
  };
  stats?: {
    totalCalls: number;
    successCalls: number;
    failedCalls: number;
    successRate: number;
  };
  error?: string;
}

/**
 * 从机信息
 */
export interface MachineInfo {
  id: string;
  name: string;
  ipAddress: string;
  apiPort: number;
  role: 'master' | 'slave';
  status: 'online' | 'offline' | 'busy';
  cpuUsage?: number;
  memoryUsage?: number;
  runningTasks: number;
  totalTasks: number;
  createdAt?: string;
  updatedAt?: string;
}

/**
 * TLS 证书信息
 */
export interface TlsCertificate {
  id: string;
  name: string;
  description?: string;
  cert_content?: string;  // 仅在详情接口返回
  key_content?: string;   // 仅在详情接口返回
  created_at: string;
  updated_at: string;
}

/**
 * TLS 证书创建/更新数据
 */
export interface TlsCertificateForm {
  name: string;
  description?: string;
  cert_content: string;
  key_content: string;
}
