import axios, { AxiosInstance, AxiosError } from 'axios';
import type { ApiResponse, Scenario, ScenarioFile, SippConfig } from '@/types';

/**
 * API服务类
 * 职责：处理所有HTTP API请求
 * 遵循单一职责原则和DRY原则
 */
class ApiService {
  private client: AxiosInstance;

  constructor(baseURL: string = '/api') {
    this.client = axios.create({
      baseURL,
      timeout: 30000,
      headers: {
        'Content-Type': 'application/json',
      },
    });

    this.setupInterceptors();
  }

  /**
   * 设置拦截器
   */
  private setupInterceptors(): void {
    // 请求拦截器
    this.client.interceptors.request.use(
      (config) => {
        console.log(`[API] ${config.method?.toUpperCase()} ${config.url}`);
        return config;
      },
      (error) => {
        console.error('[API] Request error:', error);
        return Promise.reject(error);
      }
    );

    // 响应拦截器
    this.client.interceptors.response.use(
      (response) => {
        return response.data;
      },
      (error: AxiosError) => {
        const message = this.handleError(error);
        return Promise.reject(new Error(message));
      }
    );
  }

  /**
   * 错误处理
   */
  private handleError(error: AxiosError): string {
    if (error.response) {
      const data = error.response.data as any;
      return data?.error || data?.message || `HTTP ${error.response.status}`;
    } else if (error.request) {
      return '网络请求失败，请检查网络连接';
    } else {
      return error.message || '未知错误';
    }
  }

  /**
   * 健康检查
   */
  async health(): Promise<any> {
    return this.client.get('/health');
  }

  /**
   * 获取SIPp状态
   */
  async getSippStatus(): Promise<ApiResponse<{ connected: boolean; host: string; port: number }>> {
    return this.client.get('/sipp/status');
  }

  /**
   * 连接到SIPp
   */
  async connectSipp(): Promise<ApiResponse> {
    return this.client.post('/sipp/connect');
  }

  /**
   * 断开SIPp连接
   */
  async disconnectSipp(): Promise<ApiResponse> {
    return this.client.post('/sipp/disconnect');
  }

  /**
   * 列出所有场景
   */
  async listScenarios(): Promise<ApiResponse<{ scenarios: ScenarioFile[] }>> {
    return this.client.get('/scenarios');
  }

  /**
   * 获取场景详情
   */
  async getScenario(filename: string): Promise<ApiResponse<{ scenario: Scenario }>> {
    return this.client.get(`/scenarios/${filename}`);
  }

  /**
   * 获取场景的原始XML内容
   */
  async getScenarioXml(filename: string): Promise<ApiResponse<{ xml: string }>> {
    return this.client.get(`/scenarios/${filename}/xml`);
  }

  /**
   * 创建/更新场景
   */
  async saveScenario(filename: string, scenario: Scenario): Promise<ApiResponse> {
    return this.client.post('/scenarios', { filename, scenario });
  }

  /**
   * 保存场景的 XML 内容（上传或编辑后保存）
   */
  async saveScenarioXml(filename: string, xml: string): Promise<ApiResponse> {
    return this.client.post('/scenarios/xml', { filename, xml });
  }

  /**
   * 删除场景
   */
  async deleteScenario(filename: string): Promise<ApiResponse> {
    return this.client.delete(`/scenarios/${filename}`);
  }

  /**
   * 验证场景
   */
  async validateScenario(
    scenario: Scenario
  ): Promise<ApiResponse<{ valid: boolean; errors: string[] }>> {
    return this.client.post('/scenarios/validate', { scenario });
  }

  /**
   * 获取内置场景列表
   */
  async getBuiltinScenarios(): Promise<ApiResponse<{ scenarios: string[] }>> {
    return this.client.get('/scenarios/builtin/list');
  }

  /**
   * 获取配置
   */
  async getConfig(): Promise<ApiResponse<{ config: { sipp: SippConfig; server: any } }>> {
    return this.client.get('/config');
  }

  /**
   * 获取CSV统计文件路径
   */
  async getCsvPath(): Promise<ApiResponse<{ path: string }>> {
    return this.client.get('/stats/csv-path');
  }

  /**
   * 启动SIPp测试
   */
  async startSippTest(params: {
    taskId?: string; // 任务ID（用于状态跟踪）
    scenarioFile: string;
    machineId?: string; // 指定执行机器ID（不指定则自动选择）
    rate?: number;
    users?: number;
    limit?: number;
    remoteHost?: string;
    remotePort?: number;
    localPort?: number;
    transport?: string;
    timeout?: number;
    injectionFile?: string; // 注入文件支持
    minRtpPort?: number; // RTP端口范围起始
    maxRtpPort?: number; // RTP端口范围结束
    enableRtpEcho?: boolean; // 启用RTP回音
    mediaIp?: string; // 媒体IP地址
    mediaIpType?: string; // 媒体IP类型（仅前端参考，不传给后端）
    oocsf?: string; // 会话外场景文件
    traceMsg?: boolean;
    traceErr?: boolean;
    traceCalldebug?: boolean;
    traceShortmsg?: boolean;
    traceLogs?: boolean;
    traceRtt?: boolean;
    traceScreen?: boolean;
    autoAnswer?: boolean; // 自动应答会话外消息
  }): Promise<ApiResponse> {
    // 移除仅用于前端参考的字段
    const { mediaIpType, ...backendParams } = params;
    return this.client.post('/sipp/start', backendParams);
  }

  /**
   * 停止SIPp测试
   */
  async stopSippTest(taskId: string, force?: boolean): Promise<ApiResponse> {
    return this.client.post('/sipp/stop', { taskId, force });
  }

  /**
   * 发送控制命令到运行中的任务
   */
  async sendTaskCommand(taskId: string, command: string, args?: any): Promise<ApiResponse> {
    return this.client.post('/sipp/command', { taskId, command, args });
  }

  /**
   * 获取任务屏幕截图
   */
  async getTaskScreen(taskId: string): Promise<ApiResponse<{ content: string }>> {
    return this.client.get(`/sipp/screen/${taskId}`);
  }

  /**
   * 获取任务实时统计数据
   */
  async getTaskStats(taskId: string): Promise<ApiResponse<{ stats: any }>> {
    return this.client.get(`/sipp/stats/${taskId}`);
  }

  /**
   * 重启SIPp测试
   */
  async restartSippTest(params: {
    scenarioFile: string;
    rate?: number;
    users?: number;
    limit?: number;
  }): Promise<ApiResponse> {
    return this.client.post('/sipp/restart', params);
  }

  /**
   * 获取SIPp进程状态
   */
  async getSippProcessStatus(): Promise<ApiResponse<{
    status: {
      isRunning: boolean;
      pid: number | null;
      hasProcess: boolean;
    }
  }>> {
    return this.client.get('/sipp/process-status');
  }

  /**
   * 列出所有注入文件
   */
  async listInjectionFiles(): Promise<ApiResponse<{ files: any[] }>> {
    return this.client.get('/injection-files');
  }

  /**
   * 获取注入文件详情
   */
  async getInjectionFile(filename: string): Promise<ApiResponse<{ file: any }>> {
    return this.client.get(`/injection-files/${filename}`);
  }

  /**
   * 创建或更新注入文件
   */
  async saveInjectionFile(params: {
    filename: string;
    description?: string;
    content: string;
  }): Promise<ApiResponse> {
    return this.client.post('/injection-files', params);
  }

  /**
   * 删除注入文件
   */
  async deleteInjectionFile(filename: string): Promise<ApiResponse> {
    return this.client.delete(`/injection-files/${filename}`);
  }

  /**
   * 验证注入文件内容
   */
  async validateInjectionFile(content: string): Promise<ApiResponse<{ validation: any }>> {
    return this.client.post('/injection-files/validate', { content });
  }

  /**
   * 获取所有任务历史（仅已完成）
   */
  async getTaskHistory(): Promise<ApiResponse<{ tasks: any[] }>> {
    return this.client.get('/task-history');
  }

  /**
   * 获取正在运行的任务（按机器分组）
   */
  async getRunningTasksByMachine(): Promise<ApiResponse<{ tasksByMachine: Record<string, any[]> }>> {
    return this.client.get('/tasks/running-by-machine');
  }

  /**
   * 远程控制SIPp任务（主机统一控制接口）
   */
  async remoteControlTask(taskId: string, command: string, args?: any): Promise<ApiResponse> {
    return this.client.post('/machines/sipp/control', { taskId, command, args });
  }

  /**
   * 远程停止SIPp任务（主机统一停止接口）
   */
  async remoteStopTask(taskId: string, force = false): Promise<ApiResponse> {
    return this.client.post('/machines/sipp/stop', { taskId, force });
  }

  /**
   * 根据状态获取任务历史
   */
  async getTaskHistoryByStatus(status: string): Promise<ApiResponse<{ tasks: any[] }>> {
    return this.client.get(`/task-history/status/${status}`);
  }

  /**
   * 创建任务历史记录
   */
  async createTaskHistory(task: {
    id: string;
    scenario_name: string;
    scenario_file: string;
    status: 'RUNNING' | 'COMPLETED' | 'FAILED' | 'STOPPED';
    config: Record<string, any>;
    stats?: Record<string, any>;
    start_time: number;
    end_time?: number;
    error?: string;
  }): Promise<ApiResponse> {
    return this.client.post('/task-history', task);
  }

  /**
   * 更新任务历史记录
   */
  async updateTaskHistory(
    id: string,
    updates: {
      status?: 'RUNNING' | 'COMPLETED' | 'FAILED' | 'STOPPED';
      stats?: Record<string, any>;
      end_time?: number;
      error?: string;
    }
  ): Promise<ApiResponse> {
    return this.client.put(`/task-history/${id}`, updates);
  }

  /**
   * 删除任务历史记录
   */
  async deleteTaskHistory(id: string): Promise<ApiResponse> {
    return this.client.delete(`/task-history/${id}`);
  }

  /**
   * ==================== 配置模板 API ====================
   */

  /**
   * 获取所有配置模板
   */
  async getConfigTemplates(): Promise<ApiResponse<{ templates: any[] }>> {
    return this.client.get('/config-templates');
  }

  /**
   * 获取默认配置模板
   */
  async getDefaultConfigTemplate(): Promise<ApiResponse<{ template: any }>> {
    return this.client.get('/config-templates/default');
  }

  /**
   * 创建配置模板
   */
  async createConfigTemplate(template: {
    name: string;
    description?: string;
    config: Record<string, any>;
    is_default?: boolean;
  }): Promise<ApiResponse> {
    return this.client.post('/config-templates', template);
  }

  /**
   * 更新配置模板
   */
  async updateConfigTemplate(id: number, template: {
    name?: string;
    description?: string;
    config?: Record<string, any>;
    is_default?: boolean;
  }): Promise<ApiResponse> {
    return this.client.put(`/config-templates/${id}`, template);
  }

  /**
   * 设置默认配置模板
   */
  async setDefaultConfigTemplate(id: number): Promise<ApiResponse> {
    return this.client.post(`/config-templates/${id}/set-default`);
  }

  /**
   * 删除配置模板
   */
  async deleteConfigTemplate(id: number): Promise<ApiResponse> {
    return this.client.delete(`/config-templates/${id}`);
  }

  /**
   * ==================== 日志下载 API ====================
   */

  /**
   * 获取任务的可用日志文件列表
   */
  async getTaskLogFiles(taskId: string): Promise<ApiResponse<{ files: any[] }>> {
    return this.client.get(`/logs/task/${taskId}/files`);
  }

  /**
   * 下载任务所有日志（ZIP）
   * 使用 download-remote 接口自动路由到正确的节点
   */
  downloadTaskLogs(taskId: string): void {
    const url = `${this.client.defaults.baseURL}/logs/task/${taskId}/download-remote`;
    window.open(url, '_blank');
  }

  /**
   * 下载单个任务日志文件
   */
  downloadTaskLogFile(taskId: string, type: string): void {
    const url = `${this.client.defaults.baseURL}/logs/task/${taskId}/${type}`;
    window.open(url, '_blank');
  }

  /**
   * 获取应用日志文件信息
   */
  async getApplicationLogInfo(): Promise<ApiResponse<{ files: any[] }>> {
    return this.client.get('/logs/application/info');
  }

  /**
   * 下载应用日志
   * @param type - 'app' | 'error' | 'all'
   */
  downloadApplicationLogs(type?: string): void {
    const url = `${this.client.defaults.baseURL}/logs/application/download${type ? `?type=${type}` : ''}`;
    window.open(url, '_blank');
  }

  /**
   * ==================== 从机管理 API ====================
   */

  /**
   * 获取所有从机列表
   */
  async getMachines(): Promise<ApiResponse<{ machines: any[] }>> {
    return this.client.get('/machines');
  }

  /**
   * 获取可用从机列表（仅在线）
   */
  async getAvailableMachines(): Promise<ApiResponse<{ machines: any[] }>> {
    return this.client.get('/machines/available');
  }

  /**
   * 健康检查指定从机
   */
  async checkMachineHealth(machineId: string): Promise<ApiResponse<{ healthy: boolean; machineId: string }>> {
    return this.client.post(`/machines/${machineId}/health-check`);
  }

  /**
   * 删除从机记录（仅允许删除离线从机）
   */
  async deleteMachine(machineId: string): Promise<ApiResponse> {
    return this.client.delete(`/machines/${machineId}`);
  }
}

// 单例导出
export const apiService = new ApiService();
export default apiService;
