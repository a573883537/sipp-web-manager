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
   * 创建/更新场景
   */
  async saveScenario(filename: string, scenario: Scenario): Promise<ApiResponse> {
    return this.client.post('/scenarios', { filename, scenario });
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
  }): Promise<ApiResponse> {
    // 移除仅用于前端参考的字段
    const { mediaIpType, ...backendParams } = params;
    return this.client.post('/sipp/start', backendParams);
  }

  /**
   * 停止SIPp测试
   */
  async stopSippTest(force?: boolean): Promise<ApiResponse> {
    return this.client.post('/sipp/stop', { force });
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
   * 获取所有任务历史
   */
  async getTaskHistory(): Promise<ApiResponse<{ tasks: any[] }>> {
    return this.client.get('/task-history');
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
}

// 单例导出
export const apiService = new ApiService();
export default apiService;
