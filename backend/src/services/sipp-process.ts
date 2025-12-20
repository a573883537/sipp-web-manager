import { spawn, ChildProcess } from 'child_process';
import { EventEmitter } from 'events';
import path from 'path';
import fs from 'fs';
import { logger } from '../utils/logger';
import { config } from '../config';
import { injectionFileService } from './injection-file-service';

/**
 * SIPp进程管理器
 * 职责：启动、停止和管理SIPp进程
 * 遵循单一职责原则
 */
export class SippProcessManager extends EventEmitter {
  private process: ChildProcess | null = null;
  private isRunning: boolean = false;
  private sippPath: string;

  constructor(sippPath: string = process.env.SIPP_PATH || 'sipp') {
    super();
    this.sippPath = sippPath;
  }

  /**
   * 启动SIPp测试
   * @param scenarioFile 场景文件名
   * @param options 测试选项
   */
  async start(scenarioFile: string, options: SippStartOptions = {}): Promise<void> {
    if (this.isRunning) {
      throw new Error('SIPp is already running');
    }

    const {
      rate = 10,
      users = 100,
      limit = 0,
      remoteHost = '127.0.0.1',
      remotePort = 5060,
      localPort = 5061,
      transport = 'udp',
      statsInterval = 1,
      timeout = 60000,
      minRtpPort,
      maxRtpPort,
      enableRtpEcho = false,
      mediaIp,
    } = options;

    // 构建场景文件完整路径
    const scenarioPath = path.join(config.sipp.scenarioDir, scenarioFile);

    // 转换传输协议格式（SIPp 期望 u1/t1/l1 格式）
    const transportMap: Record<string, string> = {
      'udp': 'u1',
      'tcp': 't1',
      'tls': 'l1'
    };
    const sippTransport = transportMap[transport] || 'u1';

    // 构建SIPp命令参数
    const args = [
      '-sf', scenarioPath,                    // 场景文件
      remoteHost + ':' + remotePort,          // 远程SIP服务器
      '-p', localPort.toString(),             // 本地端口
      '-r', rate.toString(),                  // 呼叫速率
      '-l', users.toString(),                 // 最大并发用户数
      '-t', sippTransport,                    // 传输协议（u1=UDP, t1=TCP, l1=TLS）
      '-trace_stat',                          // 启用统计跟踪
      '-stf', config.sipp.csvPath,            // CSV统计文件
      '-fd', statsInterval.toString(),        // 统计采样间隔（秒）
      '-ci', config.sipp.host,                // 控制接口主机
      '-cp', config.sipp.controlPort.toString(), // 控制接口端口
      '-nostdin',                             // 禁用标准输入
      // 注意：不使用 -bg 参数，因为它会导致 SIPp fork 并退出主进程，
      // 这会让 Node.js spawn 认为进程失败。我们通过 spawn 本身管理后台运行。
    ];

    // 添加呼叫限制（如果设置）
    if (limit > 0) {
      args.push('-m', limit.toString());
    }

    // 添加超时（毫秒转秒）
    if (timeout > 0) {
      args.push('-timeout', (timeout / 1000).toString() + 's');
    }

    // 添加注入文件支持（用于携带用户认证信息）
    if (options.injectionFile) {
      const injectionPath = injectionFileService.getFilePath(options.injectionFile);

      // 验证注入文件存在
      if (!fs.existsSync(injectionPath)) {
        throw new Error(`Injection file not found: ${options.injectionFile}`);
      }

      args.push('-inf', injectionPath);

      logger.info('Using injection file', {
        filename: options.injectionFile,
        path: injectionPath
      });
    }

    // 添加RTP端口范围配置
    if (minRtpPort !== undefined && maxRtpPort !== undefined) {
      // 验证端口范围合法性
      if (minRtpPort < 1024 || minRtpPort > 65535 || maxRtpPort < 1024 || maxRtpPort > 65535) {
        throw new Error('RTP ports must be between 1024 and 65535');
      }
      if (minRtpPort >= maxRtpPort) {
        throw new Error('minRtpPort must be less than maxRtpPort');
      }
      // 确保端口范围足够容纳并发呼叫（每个呼叫需2个端口：RTP+RTCP）
      const requiredPorts = users * 2;
      const availablePorts = maxRtpPort - minRtpPort + 1;
      if (availablePorts < requiredPorts) {
        logger.warn('RTP port range may be insufficient', {
          users,
          requiredPorts,
          availablePorts,
          minRtpPort,
          maxRtpPort
        });
      }

      args.push('-min_rtp_port', minRtpPort.toString());
      args.push('-max_rtp_port', maxRtpPort.toString());

      logger.info('Using custom RTP port range', {
        minRtpPort,
        maxRtpPort,
        availablePorts,
        requiredPorts
      });
    }

    // 启用RTP回音（用于测试，将收到的RTP包原样返回）
    if (enableRtpEcho) {
      args.push('-rtp_echo');
      logger.info('RTP echo enabled');
    }

    // 设置媒体IP地址
    if (mediaIp) {
      args.push('-mi', mediaIp);
      logger.info('Using custom media IP', { mediaIp });
    }

    logger.info('Starting SIPp process', {
      sippPath: this.sippPath,
      args: args.join(' '),
      scenarioFile,
    });

    try {
      // 启动SIPp进程
      this.process = spawn(this.sippPath, args, {
        cwd: config.sipp.scenarioDir,
        env: {
          ...process.env,
          LD_LIBRARY_PATH: path.dirname(this.sippPath), // 添加库路径
        },
      });

      this.isRunning = true;

      // 处理标准输出
      this.process.stdout?.on('data', (data) => {
        const output = data.toString();
        logger.debug('SIPp stdout', { output });
        this.emit('stdout', output);
      });

      // 处理标准错误
      this.process.stderr?.on('data', (data) => {
        const output = data.toString();
        logger.warn('SIPp stderr', { output });
        this.emit('stderr', output);
      });

      // 处理进程退出
      this.process.on('exit', (code, signal) => {
        logger.info('SIPp process exited', { code, signal });
        this.isRunning = false;
        this.process = null;
        this.emit('exit', { code, signal });
      });

      // 处理进程错误
      this.process.on('error', (error) => {
        logger.error('SIPp process error:', error);
        this.isRunning = false;
        this.process = null;
        this.emit('error', error);
      });

      // 等待一小段时间确保进程启动
      await this.sleep(1000);

      // 检查进程是否还在运行
      if (!this.process || this.process.killed) {
        throw new Error('SIPp process failed to start');
      }

      logger.info('SIPp process started successfully', { pid: this.process.pid });
      this.emit('started', { pid: this.process.pid });

    } catch (error: any) {
      this.isRunning = false;
      this.process = null;
      logger.error('Failed to start SIPp process:', error);
      throw new Error(`Failed to start SIPp: ${error.message}`);
    }
  }

  /**
   * 停止SIPp进程
   * @param force 是否强制停止
   */
  async stop(force: boolean = false): Promise<void> {
    if (!this.process || !this.isRunning) {
      logger.warn('No SIPp process to stop');
      return;
    }

    logger.info('Stopping SIPp process', {
      pid: this.process.pid,
      force
    });

    try {
      if (force) {
        // 强制终止
        this.process.kill('SIGKILL');
      } else {
        // 优雅终止
        this.process.kill('SIGTERM');
      }

      // 等待进程退出
      await this.waitForExit(5000);

      logger.info('SIPp process stopped successfully');
      this.emit('stopped');

    } catch (error: any) {
      logger.error('Failed to stop SIPp process:', error);

      // 如果优雅终止失败，强制终止
      if (!force && this.process) {
        logger.warn('Forcing SIPp process termination');
        this.process.kill('SIGKILL');
      }

      throw new Error(`Failed to stop SIPp: ${error.message}`);
    }
  }

  /**
   * 重启SIPp进程
   */
  async restart(scenarioFile: string, options: SippStartOptions = {}): Promise<void> {
    logger.info('Restarting SIPp process');

    if (this.isRunning) {
      await this.stop();
    }

    await this.start(scenarioFile, options);
  }

  /**
   * 获取进程状态
   */
  getStatus(): SippProcessStatus {
    return {
      isRunning: this.isRunning,
      pid: this.process?.pid || null,
      hasProcess: this.process !== null,
    };
  }

  /**
   * 等待进程退出
   */
  private waitForExit(timeout: number): Promise<void> {
    return new Promise((resolve, reject) => {
      if (!this.process) {
        resolve();
        return;
      }

      const timer = setTimeout(() => {
        reject(new Error('Process exit timeout'));
      }, timeout);

      this.process.once('exit', () => {
        clearTimeout(timer);
        resolve();
      });
    });
  }

  /**
   * 睡眠辅助函数
   */
  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

/**
 * SIPp启动选项
 */
export interface SippStartOptions {
  rate?: number;           // 呼叫速率 (calls/sec)
  users?: number;          // 最大并发用户数
  limit?: number;          // 呼叫总数限制 (0=无限制)
  remoteHost?: string;     // 远程SIP服务器地址
  remotePort?: number;     // 远程SIP服务器端口
  localPort?: number;      // 本地SIP信令端口
  transport?: 'udp' | 'tcp' | 'tls'; // 传输协议
  statsInterval?: number;  // 统计采样间隔（秒）
  timeout?: number;        // 测试超时（毫秒）
  injectionFile?: string;  // 注入文件名（CSV格式，用于携带用户认证信息）
  minRtpPort?: number;     // RTP端口范围起始（默认：系统动态分配）
  maxRtpPort?: number;     // RTP端口范围结束（默认：系统动态分配）
  enableRtpEcho?: boolean; // 启用RTP回音（测试用，将收到的RTP包原样返回）
  mediaIp?: string;        // 媒体IP地址（默认：本地IP）
}

/**
 * SIPp进程状态
 */
export interface SippProcessStatus {
  isRunning: boolean;
  pid: number | null;
  hasProcess: boolean;
}

// 单例导出
export const sippProcessManager = new SippProcessManager();
