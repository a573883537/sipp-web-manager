import { io, Socket } from 'socket.io-client';
import type { SippStats, CsvStatsRow } from '@/types';

/**
 * WebSocket服务类
 * 职责：管理与后端的WebSocket连接和消息通信
 * 遵循单一职责原则
 */
class WebSocketService {
  private socket: Socket | null = null;
  private listeners: Map<string, Set<Function>> = new Map();

  /**
   * 连接到后端WebSocket
   */
  connect(url?: string): void {
    // 如果已经连接，先断开旧连接
    if (this.socket) {
      if (this.socket.connected) {
        console.warn('WebSocket already connected, reusing existing connection');
        return;
      }
      // 清理未连接的 socket 实例
      this.socket.disconnect();
      this.socket = null;
    }

    const wsPort = import.meta.env.VITE_WS_PORT || '3000';
    const defaultUrl = `http://localhost:${wsPort}`;
    const connectUrl = url || defaultUrl;

    this.socket = io(connectUrl, {
      transports: ['websocket'], // 仅使用 WebSocket，禁用 polling 降级
      reconnection: true,
      reconnectionDelay: 1000,
      reconnectionAttempts: Infinity, // 无限重连
      reconnectionDelayMax: 5000,
      timeout: 20000,
    });

    this.setupEventHandlers();
    console.log('WebSocket connecting to:', connectUrl);
  }

  /**
   * 断开连接
   */
  disconnect(): void {
    if (this.socket) {
      this.socket.disconnect();
      this.socket = null;
      console.log('WebSocket disconnected');
    }
  }

  /**
   * 设置事件处理器
   */
  private setupEventHandlers(): void {
    if (!this.socket) return;

    this.socket.on('connect', () => {
      console.log('WebSocket connected');
      this.emit('connection', { status: 'connected' });
    });

    this.socket.on('disconnect', () => {
      console.log('WebSocket disconnected');
      this.emit('connection', { status: 'disconnected' });
    });

    this.socket.on('connect_error', (error) => {
      console.error('WebSocket connection error:', error);
      this.emit('connection', { status: 'error', error });
    });

    // SIPp事件
    this.socket.on('connected', (data) => {
      this.emit('connected', data);
    });

    this.socket.on('stats:update', (stats: SippStats) => {
      this.emit('stats:update', stats);
    });

    this.socket.on('stats:csv', (row: CsvStatsRow) => {
      this.emit('stats:csv', row);
    });

    this.socket.on('stats:current', (data) => {
      this.emit('stats:current', data);
    });

    this.socket.on('sipp:message', (data) => {
      this.emit('sipp:message', data);
    });

    this.socket.on('sipp:error', (data) => {
      this.emit('sipp:error', data);
    });

    this.socket.on('sipp:connected', (data) => {
      this.emit('sipp:connected', data);
    });

    this.socket.on('command:success', (data) => {
      this.emit('command:success', data);
    });

    this.socket.on('command:error', (data) => {
      this.emit('command:error', data);
    });

    // 任务状态事件
    this.socket.on('task:started', (data) => {
      this.emit('task:started', data);
    });

    this.socket.on('task:completed', (data) => {
      this.emit('task:completed', data);
    });

    this.socket.on('task:failed', (data) => {
      this.emit('task:failed', data);
    });

    this.socket.on('task:stopped', (data) => {
      this.emit('task:stopped', data);
    });

    // 任务统计数据更新
    this.socket.on('tasks:stats', (data) => {
      this.emit('tasks:stats', data);
    });
  }

  /**
   * 发送SIPp命令
   */
  sendCommand(command: string, args?: any): void {
    if (!this.socket?.connected) {
      console.error('WebSocket not connected');
      return;
    }

    this.socket.emit('sipp:command', { command, args });
  }

  /**
   * 请求统计数据
   */
  requestStats(): void {
    if (!this.socket?.connected) {
      console.error('WebSocket not connected');
      return;
    }

    this.socket.emit('stats:request');
  }

  /**
   * 订阅事件
   */
  on(event: string, callback: Function): void {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, new Set());
    }
    this.listeners.get(event)!.add(callback);
  }

  /**
   * 取消订阅
   */
  off(event: string, callback: Function): void {
    const listeners = this.listeners.get(event);
    if (listeners) {
      listeners.delete(callback);
    }
  }

  /**
   * 触发事件
   */
  private emit(event: string, data: any): void {
    const listeners = this.listeners.get(event);
    if (listeners) {
      listeners.forEach((callback) => callback(data));
    }
  }

  /**
   * 检查连接状态
   */
  isConnected(): boolean {
    return this.socket?.connected ?? false;
  }

  /**
   * SIPp控制命令包装方法
   */
  setRate(rate: number): void {
    this.sendCommand('setRate', { rate });
  }

  setUsers(users: number): void {
    this.sendCommand('setUsers', { users });
  }

  setLimit(limit: number): void {
    this.sendCommand('setLimit', { limit });
  }

  pause(): void {
    this.sendCommand('pause');
  }

  quit(): void {
    this.sendCommand('quit');
  }

  forceQuit(): void {
    this.sendCommand('forceQuit');
  }

  increaseRate(): void {
    this.sendCommand('increaseRate');
  }

  decreaseRate(): void {
    this.sendCommand('decreaseRate');
  }

  setTraceError(enable: boolean): void {
    this.sendCommand('setTraceError', { enable });
  }

  setTraceMessages(enable: boolean): void {
    this.sendCommand('setTraceMessages', { enable });
  }

  resetStats(type: string = 'all'): void {
    this.sendCommand('resetStats', { type });
  }

  getStats(): void {
    this.sendCommand('getStats');
  }
}

// 单例导出
export const wsService = new WebSocketService();
export default wsService;
