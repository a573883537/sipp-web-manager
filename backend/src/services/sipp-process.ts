import { spawn, ChildProcess } from 'child_process';
import { EventEmitter } from 'events';
import dgram from 'dgram';
import path from 'path';
import fs from 'fs';
import { logger } from '../utils/logger';
import { config } from '../config';
import { injectionFileService } from './injection-file-service';

/**
 * 单个 SIPp 进程实例
 */
class SippProcessInstance extends EventEmitter {
  private process: ChildProcess | null = null;
  private isRunning: boolean = false;
  private controlPort: number = 0;
  private isPaused: boolean = false;
  private currentRate: number = 10;
  public readonly taskId: string;
  public readonly sippPath: string;

  constructor(taskId: string, sippPath: string, controlPort: number) {
    super();
    this.taskId = taskId;
    this.sippPath = sippPath;
    this.controlPort = controlPort;
  }

  /**
   * 发送控制命令到 SIPp
   */
  sendCommand(command: string): Promise<void> {
    return new Promise((resolve, reject) => {
      if (!this.isRunning || this.controlPort === 0) {
        reject(new Error('Process not running or no control port'));
        return;
      }

      const client = dgram.createSocket('udp4');
      const buffer = Buffer.from(command);

      client.send(buffer, 0, buffer.length, this.controlPort, '127.0.0.1', (err) => {
        client.close();
        if (err) {
          logger.error(`Failed to send command to task ${this.taskId}:`, err);
          reject(err);
        } else {
          logger.debug(`Sent command to task ${this.taskId}: ${command}`);
          resolve();
        }
      });
    });
  }

  /**
   * 设置呼叫速率
   */
  async setRate(rate: number): Promise<void> {
    await this.sendCommand(`cset rate ${rate}`);
    this.currentRate = rate;
  }

  /**
   * 设置并发用户数
   */
  async setUsers(users: number): Promise<void> {
    await this.sendCommand(`cset users ${users}`);
  }

  /**
   * 设置呼叫限制
   */
  async setLimit(limit: number): Promise<void> {
    await this.sendCommand(`cset limit ${limit}`);
  }

  /**
   * 暂停/恢复测试
   */
  async pause(): Promise<void> {
    await this.sendCommand('p');
    this.isPaused = !this.isPaused;
  }

  /**
   * 优雅停止（等待当前呼叫完成）
   */
  async quit(): Promise<void> {
    await this.sendCommand('q');
  }

  /**
   * 强制停止
   */
  async forceQuit(): Promise<void> {
    await this.sendCommand('Q');
  }

  /**
   * 增加速率
   */
  async increaseRate(): Promise<void> {
    await this.sendCommand('+');
    this.currentRate += 1;
  }

  /**
   * 减少速率
   */
  async decreaseRate(): Promise<void> {
    await this.sendCommand('-');
    if (this.currentRate > 1) this.currentRate -= 1;
  }

  /**
   * 截取屏幕 - 通过 SIGUSR2 信号触发
   */
  async dumpScreen(): Promise<void> {
    if (!this.process || !this.process.pid) {
      throw new Error('Process not running');
    }
    this.process.kill('SIGUSR2');
  }

  /**
   * 获取屏幕截图文件路径
   */
  getScreenFilePath(): string {
    return path.join(config.sipp.logDir, `${this.taskId}_screen.log`);
  }

  /**
   * 获取日志文件目录
   */
  getLogDir(): string {
    return config.sipp.logDir;
  }

  async start(scenarioFile: string, options: SippStartOptions = {}): Promise<void> {
    if (this.isRunning) {
      throw new Error(`Task ${this.taskId} is already running`);
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
      oocsf,
    } = options;

    // 初始化状态
    this.currentRate = rate;
    this.isPaused = false;

    // 构建场景文件完整路径
    const scenarioPath = path.join(config.sipp.scenarioDir, scenarioFile);

    // 转换传输协议格式
    const transportMap: Record<string, string> = {
      'udp': 'u1',
      'tcp': 't1',
      'tls': 'l1'
    };
    const sippTransport = transportMap[transport] || 'u1';

    // 为每个任务创建独立的 CSV 文件（放在日志目录下便于管理）
    const csvPath = path.join(config.sipp.logDir, `${this.taskId}_stats.csv`);

    // 构建SIPp命令参数
    const args = [
      '-sf', scenarioPath,
      remoteHost + ':' + remotePort,
      '-p', localPort.toString(),
      '-r', rate.toString(),
      '-l', users.toString(),
      '-t', sippTransport,
      '-trace_stat',
      '-stf', csvPath,
      '-fd', statsInterval.toString(),
      '-nostdin',
      '-cp', this.controlPort.toString(),  // 控制端口
      '-trace_screen',  // 启用屏幕追踪
      '-screen_file', path.join(config.sipp.logDir, `${this.taskId}_screen.log`),  // 自定义屏幕文件名
    ];

    // 添加呼叫限制
    if (limit > 0) {
      args.push('-m', limit.toString());
    }

    // 添加超时
    if (timeout > 0) {
      args.push('-timeout', (timeout / 1000).toString() + 's');
    }

    // 添加注入文件
    if (options.injectionFile) {
      const injectionPath = injectionFileService.getFilePath(options.injectionFile);
      if (!fs.existsSync(injectionPath)) {
        throw new Error(`Injection file not found: ${options.injectionFile}`);
      }
      args.push('-inf', injectionPath);
    }

    // 添加RTP端口范围
    if (minRtpPort !== undefined && maxRtpPort !== undefined) {
      if (minRtpPort < 1024 || minRtpPort > 65535 || maxRtpPort < 1024 || maxRtpPort > 65535) {
        throw new Error('RTP ports must be between 1024 and 65535');
      }
      if (minRtpPort >= maxRtpPort) {
        throw new Error('minRtpPort must be less than maxRtpPort');
      }
      args.push('-min_rtp_port', minRtpPort.toString());
      args.push('-max_rtp_port', maxRtpPort.toString());
    }

    // 启用RTP回音
    if (enableRtpEcho) {
      args.push('-rtp_echo');
    }

    // 设置媒体IP
    if (mediaIp) {
      args.push('-mi', mediaIp);
    }

    // 添加会话外场景文件（用于处理 NOTIFY/OPTIONS 等）
    if (oocsf) {
      const oocsfPath = path.join(config.sipp.scenarioDir, oocsf);
      if (!fs.existsSync(oocsfPath)) {
        throw new Error(`Out of call scenario file not found: ${oocsf}`);
      }
      args.push('-oocsf', oocsfPath);
    }

    // 日志追踪选项（统一使用 taskId 前缀便于管理）
    const logPrefix = path.join(config.sipp.logDir, this.taskId);
    if (options.traceMsg) {
      args.push('-trace_msg', '-message_file', `${logPrefix}_messages.log`);
    }
    if (options.traceErr) {
      args.push('-trace_err', '-error_file', `${logPrefix}_errors.log`);
    }
    if (options.traceCalldebug) {
      args.push('-trace_calldebug', '-calldebug_file', `${logPrefix}_calldebug.log`);
    }
    if (options.traceShortmsg) {
      args.push('-trace_shortmsg', '-shortmessage_file', `${logPrefix}_shortmsg.log`);
    }
    if (options.traceLogs) {
      args.push('-trace_logs', '-log_file', `${logPrefix}_logs.log`);
    }
    if (options.traceRtt) args.push('-trace_rtt');
    if (options.traceScreen) args.push('-trace_screen');

    // 其他高级选项
    if (options.localIp) args.push('-i', options.localIp);
    if (options.bindLocal) args.push('-bind_local');
    if (options.rsa) args.push('-rsa', options.rsa);

    logger.info('Starting SIPp process', {
      taskId: this.taskId,
      sippPath: this.sippPath,
      args: args.join(' '),
      scenarioFile,
    });

    try {
      this.process = spawn(this.sippPath, args, {
        cwd: config.sipp.scenarioDir,
        env: {
          ...process.env,
          LD_LIBRARY_PATH: path.dirname(this.sippPath),
        },
      });

      this.isRunning = true;

      // 处理标准输出
      this.process.stdout?.on('data', (data) => {
        const output = data.toString();
        logger.debug('SIPp stdout', { taskId: this.taskId, output });
        this.emit('stdout', output);
      });

      // 处理标准错误
      this.process.stderr?.on('data', (data) => {
        const output = data.toString();
        logger.warn('SIPp stderr', { taskId: this.taskId, output });
        this.emit('stderr', output);
      });

      // 处理进程退出
      this.process.on('exit', (code, signal) => {
        logger.info('SIPp process exited', { taskId: this.taskId, code, signal });
        this.isRunning = false;
        this.process = null;
        this.emit('exit', { code, signal, taskId: this.taskId });
      });

      // 处理进程错误
      this.process.on('error', (error) => {
        logger.error('SIPp process error:', { taskId: this.taskId, error });
        this.isRunning = false;
        this.process = null;
        this.emit('error', { error, taskId: this.taskId });
      });

      // 等待进程启动
      await this.sleep(1000);

      if (!this.process || this.process.killed) {
        throw new Error('SIPp process failed to start');
      }

      logger.info('SIPp process started successfully', { taskId: this.taskId, pid: this.process.pid });
      this.emit('started', { pid: this.process.pid, taskId: this.taskId });

    } catch (error: any) {
      this.isRunning = false;
      this.process = null;
      logger.error('Failed to start SIPp process:', { taskId: this.taskId, error });
      throw new Error(`Failed to start SIPp: ${error.message}`);
    }
  }

  async stop(force: boolean = false): Promise<void> {
    if (!this.process || !this.isRunning) {
      logger.warn('No SIPp process to stop', { taskId: this.taskId });
      return;
    }

    logger.info('Stopping SIPp process', {
      taskId: this.taskId,
      pid: this.process.pid,
      force
    });

    try {
      if (force) {
        this.process.kill('SIGKILL');
      } else {
        this.process.kill('SIGTERM');
      }

      await this.waitForExit(5000);

      logger.info('SIPp process stopped successfully', { taskId: this.taskId });
      this.emit('stopped', { taskId: this.taskId });

    } catch (error: any) {
      logger.error('Failed to stop SIPp process:', { taskId: this.taskId, error });

      if (!force && this.process) {
        logger.warn('Forcing SIPp process termination', { taskId: this.taskId });
        this.process.kill('SIGKILL');
      }

      throw new Error(`Failed to stop SIPp: ${error.message}`);
    }
  }

  getStatus(): SippProcessStatus {
    return {
      isRunning: this.isRunning,
      pid: this.process?.pid || null,
      hasProcess: this.process !== null,
      taskId: this.taskId,
      controlPort: this.controlPort,
      isPaused: this.isPaused,
      currentRate: this.currentRate,
    };
  }

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

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

/**
 * SIPp进程管理器（支持多任务并发）
 */
export class SippProcessManager extends EventEmitter {
  private processes: Map<string, SippProcessInstance> = new Map();
  private sippPath: string;
  private nextControlPort: number = 8888;  // 控制端口起始值

  constructor(sippPath: string = process.env.SIPP_PATH || 'sipp') {
    super();
    this.sippPath = sippPath;
  }

  /**
   * 分配控制端口
   */
  private allocateControlPort(): number {
    const port = this.nextControlPort;
    this.nextControlPort++;
    if (this.nextControlPort > 9999) {
      this.nextControlPort = 8888;  // 循环使用
    }
    return port;
  }

  /**
   * 启动SIPp测试
   */
  async start(taskId: string, scenarioFile: string, options: SippStartOptions = {}): Promise<void> {
    // 检查任务是否已存在
    if (this.processes.has(taskId)) {
      const existingProcess = this.processes.get(taskId)!;
      if (existingProcess.getStatus().isRunning) {
        throw new Error(`Task ${taskId} is already running`);
      }
      // 清理已完成的任务
      this.processes.delete(taskId);
    }

    // 分配控制端口
    const controlPort = this.allocateControlPort();

    // 创建新的进程实例
    const processInstance = new SippProcessInstance(taskId, this.sippPath, controlPort);

    // 转发事件
    processInstance.on('stdout', (output) => this.emit('stdout', { taskId, output }));
    processInstance.on('stderr', (output) => this.emit('stderr', { taskId, output }));
    processInstance.on('exit', (data) => this.emit('exit', data));
    processInstance.on('error', (data) => this.emit('error', data));
    processInstance.on('started', (data) => this.emit('started', data));
    processInstance.on('stopped', (data) => this.emit('stopped', data));

    // 保存进程实例
    this.processes.set(taskId, processInstance);

    // 启动进程
    await processInstance.start(scenarioFile, options);
  }

  /**
   * 停止指定任务
   */
  async stop(taskId: string, force: boolean = false): Promise<void> {
    const processInstance = this.processes.get(taskId);
    if (!processInstance) {
      throw new Error(`Task ${taskId} not found`);
    }

    await processInstance.stop(force);
    this.processes.delete(taskId);
  }

  /**
   * 停止所有任务
   */
  async stopAll(force: boolean = false): Promise<void> {
    const stopPromises = Array.from(this.processes.keys()).map(taskId =>
      this.stop(taskId, force).catch(err => {
        logger.error('Failed to stop task', { taskId, error: err });
      })
    );
    await Promise.all(stopPromises);
  }

  /**
   * 获取指定任务状态
   */
  getStatus(taskId: string): SippProcessStatus | null {
    const processInstance = this.processes.get(taskId);
    return processInstance ? processInstance.getStatus() : null;
  }

  /**
   * 获取所有任务状态
   */
  getAllStatus(): Map<string, SippProcessStatus> {
    const statusMap = new Map<string, SippProcessStatus>();
    this.processes.forEach((instance, taskId) => {
      statusMap.set(taskId, instance.getStatus());
    });
    return statusMap;
  }

  /**
   * 获取运行中的任务数量
   */
  getRunningCount(): number {
    let count = 0;
    this.processes.forEach(instance => {
      if (instance.getStatus().isRunning) {
        count++;
      }
    });
    return count;
  }

  /**
   * 清理已完成的任务
   */
  cleanup(): void {
    const toDelete: string[] = [];
    this.processes.forEach((instance, taskId) => {
      if (!instance.getStatus().isRunning) {
        toDelete.push(taskId);
      }
    });
    toDelete.forEach(taskId => this.processes.delete(taskId));
  }

  /**
   * 发送控制命令到指定任务
   */
  async sendCommand(taskId: string, command: string, args?: any): Promise<void> {
    const processInstance = this.processes.get(taskId);
    if (!processInstance) {
      throw new Error(`Task ${taskId} not found`);
    }

    switch (command) {
      case 'setRate':
        await processInstance.setRate(args.rate);
        break;
      case 'setUsers':
        await processInstance.setUsers(args.users);
        break;
      case 'setLimit':
        await processInstance.setLimit(args.limit);
        break;
      case 'pause':
        await processInstance.pause();
        break;
      case 'quit':
        await processInstance.quit();
        break;
      case 'forceQuit':
        await processInstance.forceQuit();
        break;
      case 'increaseRate':
        await processInstance.increaseRate();
        break;
      case 'decreaseRate':
        await processInstance.decreaseRate();
        break;
      case 'dumpScreen':
        await processInstance.dumpScreen();
        break;
      default:
        throw new Error(`Unknown command: ${command}`);
    }
  }

  /**
   * 获取任务的日志目录
   */
  getLogDir(taskId: string): string | null {
    const processInstance = this.processes.get(taskId);
    return processInstance ? processInstance.getLogDir() : null;
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
  oocsf?: string;          // 会话外场景文件（Out Of Call Scenario File），用于处理 NOTIFY/OPTIONS 等
  // 日志追踪选项
  traceMsg?: boolean;      // 追踪SIP消息 (-trace_msg)
  traceErr?: boolean;      // 追踪错误 (-trace_err)
  traceCalldebug?: boolean; // 追踪呼叫调试 (-trace_calldebug)
  traceShortmsg?: boolean; // 追踪短消息 (-trace_shortmsg)
  traceLogs?: boolean;     // 追踪日志 (-trace_logs)
  traceRtt?: boolean;      // 追踪往返时间 (-trace_rtt)
  traceScreen?: boolean;   // 追踪屏幕输出 (-trace_screen)
  // 其他高级选项
  localIp?: string;        // 本地IP地址 (-i)
  bindLocal?: boolean;     // 绑定本地端口 (-bind_local)
  rsa?: string;            // 远程发送地址 (-rsa)
}

/**
 * SIPp进程状态
 */
export interface SippProcessStatus {
  isRunning: boolean;
  pid: number | null;
  hasProcess: boolean;
  taskId: string;
  controlPort: number;
  isPaused: boolean;
  currentRate: number;
}

// 单例导出
export const sippProcessManager = new SippProcessManager();
