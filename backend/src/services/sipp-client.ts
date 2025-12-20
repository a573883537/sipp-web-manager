import dgram from 'dgram';
import { EventEmitter } from 'events';
import { config } from '../config';
import { logger } from '../utils/logger';

/**
 * SIPp统计数据接口
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
 * SIPp客户端
 * 职责：通过UDP与SIPp控制接口通信，发送命令和接收响应
 * 遵循单一职责原则
 */
export class SippClient extends EventEmitter {
  private client: dgram.Socket;
  private host: string;
  private port: number;
  private isConnected: boolean = false;

  constructor() {
    super();
    this.host = config.sipp.host;
    this.port = config.sipp.controlPort;
    this.client = dgram.createSocket('udp4');

    this.setupListeners();
  }

  /**
   * 设置UDP套接字监听器
   */
  private setupListeners(): void {
    this.client.on('message', (msg, _rinfo) => {
      logger.debug(`Received from SIPp: ${msg.toString()}`);
      this.handleResponse(msg.toString());
    });

    this.client.on('error', (err) => {
      logger.error('SIPp client error:', err);
      this.emit('error', err);
    });

    this.client.on('close', () => {
      logger.info('SIPp client closed');
      this.isConnected = false;
    });
  }

  /**
   * 发送命令到SIPp
   */
  private sendCommand(command: string): Promise<void> {
    return new Promise((resolve, reject) => {
      const buffer = Buffer.from(`c${command}`);

      this.client.send(buffer, 0, buffer.length, this.port, this.host, (err) => {
        if (err) {
          logger.error(`Failed to send command: ${command}`, err);
          reject(err);
        } else {
          logger.debug(`Sent command: ${command}`);
          resolve();
        }
      });
    });
  }

  /**
   * 处理SIPp响应
   */
  private handleResponse(response: string): void {
    try {
      // 尝试解析JSON响应
      const data = JSON.parse(response);
      this.emit('stats', data);
    } catch {
      // 非JSON响应，作为普通消息处理
      this.emit('message', response);
    }
  }

  /**
   * 连接到SIPp
   */
  connect(): void {
    if (!this.isConnected) {
      this.isConnected = true;
      logger.info(`Connected to SIPp at ${this.host}:${this.port}`);
      this.emit('connected');
    }
  }

  /**
   * 断开连接
   */
  disconnect(): void {
    if (this.isConnected) {
      this.client.close();
      this.isConnected = false;
      logger.info('Disconnected from SIPp');
    }
  }

  /**
   * 设置呼叫速率
   */
  async setRate(rate: number): Promise<void> {
    await this.sendCommand(`set rate ${rate}`);
  }

  /**
   * 设置并发用户数
   */
  async setUsers(users: number): Promise<void> {
    await this.sendCommand(`set users ${users}`);
  }

  /**
   * 设置呼叫限制
   */
  async setLimit(limit: number): Promise<void> {
    await this.sendCommand(`set limit ${limit}`);
  }

  /**
   * 切换显示场景
   */
  async setDisplay(scene: 'main' | 'ooc' | 'rx'): Promise<void> {
    await this.sendCommand(`set display ${scene}`);
  }

  /**
   * 启用/禁用错误日志
   */
  async setTraceError(enable: boolean): Promise<void> {
    await this.sendCommand(`trace error ${enable ? 'on' : 'off'}`);
  }

  /**
   * 启用/禁用消息日志
   */
  async setTraceMessages(enable: boolean): Promise<void> {
    await this.sendCommand(`trace messages ${enable ? 'on' : 'off'}`);
  }

  /**
   * 暂停/恢复测试
   */
  async pause(): Promise<void> {
    await this.sendCommand('p');
  }

  /**
   * 停止测试
   */
  async quit(): Promise<void> {
    await this.sendCommand('q');
  }

  /**
   * 强制停止测试
   */
  async forceQuit(): Promise<void> {
    await this.sendCommand('Q');
  }

  /**
   * 获取统计数据（需要扩展SIPp支持）
   * 注意：这需要在SIPp中添加"get stats json"命令
   */
  async getStats(): Promise<void> {
    await this.sendCommand('get stats json');
  }

  /**
   * 重置统计数据
   */
  async resetStats(type: string = 'all'): Promise<void> {
    await this.sendCommand(`reset ${type}`);
  }

  /**
   * 输出任务队列信息
   */
  async dumpTasks(): Promise<void> {
    await this.sendCommand('dump tasks');
  }

  /**
   * 输出变量表信息
   */
  async dumpVariables(): Promise<void> {
    await this.sendCommand('dump variables');
  }

  /**
   * 发送快捷键命令
   */
  async sendKey(key: string): Promise<void> {
    const buffer = Buffer.from(key);
    return new Promise((resolve, reject) => {
      this.client.send(buffer, 0, buffer.length, this.port, this.host, (err) => {
        if (err) {
          logger.error(`Failed to send key: ${key}`, err);
          reject(err);
        } else {
          resolve();
        }
      });
    });
  }

  /**
   * 增加速率
   */
  async increaseRate(): Promise<void> {
    await this.sendKey('+');
  }

  /**
   * 减少速率
   */
  async decreaseRate(): Promise<void> {
    await this.sendKey('-');
  }

  /**
   * 检查连接状态
   */
  isActive(): boolean {
    return this.isConnected;
  }
}

// 单例模式
export const sippClient = new SippClient();
