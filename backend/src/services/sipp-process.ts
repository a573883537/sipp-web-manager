import { spawn, ChildProcess } from 'child_process';
import { EventEmitter } from 'events';
import dgram from 'dgram';
import path from 'path';
import fs from 'fs';
import { logger } from '../utils/logger';
import { config } from '../config';
import { injectionFileService } from './injection-file-service';
import { tlsCertificateRepository } from '../database/tls-certificate-repository';

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
    this.emit('paused', { taskId: this.taskId, isPaused: this.isPaused });
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
      ratePeriod,  // 可选：速率周期（毫秒）
      users = 100,
      limit = 0,
      remoteHost = '127.0.0.1',
      remotePort = 5060,
      localPort = 5061,
      controlPort,  // 从前端传入，不再自动分配
      transport = 'udp',
      statsInterval = 5,
      timeout = 60000,
      minRtpPort,
      maxRtpPort,
      enableRtpEcho = false,
      mediaIp,
      oocsf,
      autoAnswer = false,
    } = options;

    // 如果前端传入了 controlPort，使用它；否则使用实例的 controlPort
    if (controlPort) {
      this.controlPort = controlPort;
    }

    // 初始化状态
    this.currentRate = rate;
    this.isPaused = false;

    // 构建场景文件完整路径用于验证
    const scenarioPath = path.resolve(config.sipp.scenarioDir, scenarioFile);
    
    // 验证场景文件是否存在
    if (!fs.existsSync(scenarioPath)) {
      throw new Error(`Scenario file not found: ${scenarioPath}`);
    }

    // 转换传输协议格式
    const transportMap: Record<string, string> = {
      'udp': 'u1',
      'tcp': 't1',
      'tls': 'l1'
    };
    const sippTransport = transportMap[transport] || 'u1';

    // 为每个任务创建独立的 CSV 文件（放在日志目录下便于管理）
	// 使用绝对路径确保 SIPp 可以正确写入
	const csvPath = path.resolve(config.sipp.logDir, `${this.taskId}_stats.csv`);

    // 构建SIPp命令参数
	// 注意：使用文件名而不是完整路径，因为 cwd 已经设置为场景目录
    const args = [
      '-sf', scenarioFile,  // 仅使用文件名，相对于工作目录
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
      '-screen_file', path.resolve(config.sipp.logDir, `${this.taskId}_screen.log`),  // 自定义屏幕文件名（绝对路径）
    ];

    // 添加速率周期参数（-rp）
    if (ratePeriod && ratePeriod > 0) {
      args.push('-rp', ratePeriod.toString());
    }

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

    // 添加RTP端口范围（可选配置）
    // 规范化端口值：将 null/undefined/0 都视为未设置
    const normalizedMinRtpPort = minRtpPort && minRtpPort > 0 ? minRtpPort : null;
    const normalizedMaxRtpPort = maxRtpPort && maxRtpPort > 0 ? maxRtpPort : null;

    if (normalizedMinRtpPort && normalizedMaxRtpPort) {
      // 两个端口都有值，验证并添加参数
      if (normalizedMinRtpPort < 1024 || normalizedMinRtpPort > 65535 ||
          normalizedMaxRtpPort < 1024 || normalizedMaxRtpPort > 65535) {
        throw new Error('RTP ports must be between 1024 and 65535');
      }
      if (normalizedMinRtpPort >= normalizedMaxRtpPort) {
        throw new Error('minRtpPort must be less than maxRtpPort');
      }
      args.push('-min_rtp_port', normalizedMinRtpPort.toString());
      args.push('-max_rtp_port', normalizedMaxRtpPort.toString());
      logger.info('Using RTP port range', {
        taskId: this.taskId,
        minRtpPort: normalizedMinRtpPort,
        maxRtpPort: normalizedMaxRtpPort,
      });
    } else if (normalizedMinRtpPort || normalizedMaxRtpPort) {
      // 只有一个端口有值，抛出错误
      throw new Error('Both minRtpPort and maxRtpPort must be set together, or both left empty');
    }
    // 如果两个都为 null，不添加任何参数，使用系统默认端口

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
		const oocsfPath = path.resolve(config.sipp.scenarioDir, oocsf);
      if (!fs.existsSync(oocsfPath)) {
        throw new Error(`Out of call scenario file not found: ${oocsf}`);
      }
      // 仅使用文件名，相对于工作目录
      args.push('-oocsf', oocsf);
    }

    // 添加注册场景文件（TLS连接复用）
    if (options.regScenarioFile) {
      const regScenarioPath = path.resolve(config.sipp.scenarioDir, options.regScenarioFile);
      if (!fs.existsSync(regScenarioPath)) {
        throw new Error(`Registration scenario file not found: ${options.regScenarioFile}`);
      }
      // 仅使用文件名，相对于工作目录
      args.push('-regsf', options.regScenarioFile);
      logger.info('Using registration scenario for TLS connection sharing', {
        taskId: this.taskId,
        regScenarioFile: options.regScenarioFile,
      });
    }

    // 添加注册呼叫最大数量限制
    if (options.regMaxCalls !== undefined && options.regMaxCalls > 0) {
      args.push('-regm', options.regMaxCalls.toString());
      logger.info('Registration calls limited', {
        taskId: this.taskId,
        regMaxCalls: options.regMaxCalls,
      });
    }

    // 添加 TLS 证书配置
    if (sippTransport === 'l1') {
      let tlsCertPath: string;
      let tlsKeyPath: string;

      // 优先级：certId（数据库） > tlsCert/tlsKey（直接路径） > 默认路径
      if (options.certId) {
        // 从数据库读取证书并写入临时文件
        try {
          const cert = await tlsCertificateRepository.findById(options.certId);
          const tempCertDir = path.resolve(config.sipp.logDir, this.taskId);

          // 确保临时目录存在
          if (!fs.existsSync(tempCertDir)) {
            fs.mkdirSync(tempCertDir, { recursive: true });
          }

          // 写入临时证书文件
          tlsCertPath = path.join(tempCertDir, 'tls.crt');
          tlsKeyPath = path.join(tempCertDir, 'tls.key');

          fs.writeFileSync(tlsCertPath, cert.cert_content, { mode: 0o644 });
          fs.writeFileSync(tlsKeyPath, cert.key_content, { mode: 0o600 });

          logger.info('Using TLS certificate from database', {
            taskId: this.taskId,
            certId: options.certId,
            certName: cert.name,
          });
        } catch (error: any) {
          logger.error('Failed to load TLS certificate from database', {
            taskId: this.taskId,
            certId: options.certId,
            error: error.message,
          });
          throw new Error(`Failed to load certificate: ${error.message}`);
        }
      } else if (options.tlsCert && options.tlsKey) {
        // 使用直接指定的证书路径
        tlsCertPath = options.tlsCert;
        tlsKeyPath = options.tlsKey;
      } else {
        // 使用默认路径（从配置读取证书目录）
        tlsCertPath = path.join(config.sipp.certDir, 'sipp.crt');
        tlsKeyPath = path.join(config.sipp.certDir, 'sipp.key');
      }

      // 验证证书文件存在
      if (fs.existsSync(tlsCertPath)) {
        args.push('-tls_cert', tlsCertPath);
        logger.info('Using TLS certificate', { taskId: this.taskId, cert: tlsCertPath });
      } else {
        logger.warn('TLS certificate not found, SIPp may fail to start', {
          taskId: this.taskId,
          expectedPath: tlsCertPath,
        });
      }

      if (fs.existsSync(tlsKeyPath)) {
        args.push('-tls_key', tlsKeyPath);
        logger.info('Using TLS private key', { taskId: this.taskId, key: tlsKeyPath });
      } else {
        logger.warn('TLS private key not found, SIPp may fail to start', {
          taskId: this.taskId,
          expectedPath: tlsKeyPath,
        });
      }
    }

    // 日志追踪选项（统一使用 taskId 前缀便于管理）
	// 使用绝对路径确保 SIPp 可以正确写入日志
    const logPrefix = path.resolve(config.sipp.logDir, this.taskId);
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
    if (autoAnswer) args.push('-aa');

    logger.info('Starting SIPp process', {
      taskId: this.taskId,
      sippPath: this.sippPath,
      args: args.join(' '),
      scenarioFile,
    });

    try {
      // 使用绝对路径作为工作目录
      const workingDir = path.resolve(config.sipp.scenarioDir);
      this.process = spawn(this.sippPath, args, {
        cwd: workingDir,
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

        // 清理临时证书目录
        this.cleanupTempCertificates();

        this.emit('exit', { code, signal, taskId: this.taskId });
      });

      // 处理进程错误
      this.process.on('error', (error) => {
        logger.error('SIPp process error:', { taskId: this.taskId, error });
        this.isRunning = false;
        this.process = null;

        // 清理临时证书目录
        this.cleanupTempCertificates();

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
      force,
      method: 'control-port'  // 使用控制端口而非 kill 信号
    });

    try {
      // ✅ 优先使用控制端口命令停止
      if (this.controlPort > 0) {
        try {
          if (force) {
            // 强制停止：Q 命令（立即退出）
            await this.forceQuit();
            logger.info('Sent force quit command via control port', { taskId: this.taskId });
          } else {
            // 优雅停止：q 命令（等待当前呼叫完成）
            await this.quit();
            logger.info('Sent graceful quit command via control port', { taskId: this.taskId });
          }
          
          // 等待进程退出（控制端口命令通常很快生效）
          await this.waitForExit(5000);
          
          logger.info('SIPp process stopped successfully via control port', { taskId: this.taskId });
          this.emit('stopped', { taskId: this.taskId });
          return;
          
        } catch (controlError: any) {
          logger.warn('Failed to stop via control port, falling back to signal', {
            taskId: this.taskId,
            error: controlError.message
          });
        }
      }
      
      // ⚠️ 备用方案：控制端口失败时使用信号（向后兼容）
      logger.info('Using signal fallback to stop process', { taskId: this.taskId });
      if (force) {
        this.process.kill('SIGKILL');
      } else {
        this.process.kill('SIGTERM');
      }

      await this.waitForExit(5000);

      logger.info('SIPp process stopped successfully via signal', { taskId: this.taskId });
      this.emit('stopped', { taskId: this.taskId });

    } catch (error: any) {
      logger.error('Failed to stop SIPp process:', { taskId: this.taskId, error });

      if (!force && this.process) {
        logger.warn('Forcing SIPp process termination with SIGKILL', { taskId: this.taskId });
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

  /**
   * 清理任务的临时证书目录
   */
  private cleanupTempCertificates(): void {
    try {
      const tempCertDir = path.resolve(config.sipp.logDir, this.taskId);
      if (fs.existsSync(tempCertDir) && fs.statSync(tempCertDir).isDirectory()) {
        fs.rmSync(tempCertDir, { recursive: true, force: true });
        logger.info('Cleaned up temporary certificate directory', {
          taskId: this.taskId,
          dir: tempCertDir,
        });
      }
    } catch (error: any) {
      logger.warn('Failed to cleanup temporary certificate directory', {
        taskId: this.taskId,
        error: error.message || String(error),
      });
    }
  }
}

/**
 * SIPp进程管理器（支持多任务并发）
 */
export class SippProcessManager extends EventEmitter {
  private processes: Map<string, SippProcessInstance> = new Map();
  private sippPath: string;
  private cleanupTimer: NodeJS.Timeout | null = null;  // 定期清理定时器

  constructor(sippPath: string = process.env.SIPP_PATH || 'sipp') {
    super();
    this.sippPath = sippPath;
    logger.info('SippProcessManager initialized', { sippPath });
    
    // 启动定期清理（每5分钟清理一次已完成的任务）
    this.startPeriodicCleanup();
  }
  
  /**
   * 启动定期清理任务
   */
  private startPeriodicCleanup(): void {
    const intervalMs = 5 * 60 * 1000; // 5分钟
    this.cleanupTimer = setInterval(() => {
      try {
        this.cleanup();
      } catch (error: any) {
        logger.error('Periodic cleanup failed:', error);
      }
    }, intervalMs);
    
    logger.info('Periodic cleanup started', { intervalMs });
  }
  
  /**
   * 停止定期清理任务
   */
  stopPeriodicCleanup(): void {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
      this.cleanupTimer = null;
      logger.info('Periodic cleanup stopped');
    }
  }

  /**
   * 从数据库恢复运行中的进程（仅用于极端场景）
   * 新设计：backend_pid 确保孤儿进程在启动时被清理
   * 此方法仅在 backend_pid 匹配时调用（理论上不应发生）
   */
  async recoverProcess(taskId: string, pid: number, controlPort: number): Promise<void> {
    try {
      // 检查进程是否仍在运行
      try {
        process.kill(pid, 0); // 信号 0 不会真正杀死进程，只是检查是否存在
      } catch (error) {
        logger.warn(`Process ${pid} for task ${taskId} not found, cannot recover`);
        return;
      }

      // 创建一个 "虚拟" 的进程实例，只保留 UDP 控制功能
      const processInstance = new SippProcessInstance(taskId, this.sippPath, controlPort);

      // 设置为运行状态（即使没有 ChildProcess 对象）
      (processInstance as any).isRunning = true;
      (processInstance as any).recoveredPid = pid;

      // 转发事件
      processInstance.on('stdout', (output) => this.emit('stdout', { taskId, output }));
      processInstance.on('stderr', (output) => this.emit('stderr', { taskId, output }));
      processInstance.on('exit', (data) => this.emit('exit', data));
      processInstance.on('error', (data) => this.emit('error', data));
      processInstance.on('started', (data) => this.emit('started', data));
      processInstance.on('stopped', (data) => this.emit('stopped', data));
      processInstance.on('paused', (data) => this.emit('paused', data));

      // 保存到进程列表
      this.processes.set(taskId, processInstance);

      logger.info(`Recovered process control for task ${taskId}`, { pid, controlPort });

    } catch (error: any) {
      logger.error(`Failed to recover process for task ${taskId}:`, error);
    }
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

    // 从 options 获取 controlPort，如果没有提供则使用默认值 8888
    const controlPort = options.controlPort || 8888;

    // 创建新的进程实例
    const processInstance = new SippProcessInstance(taskId, this.sippPath, controlPort);

    // 转发事件
    processInstance.on('stdout', (output) => this.emit('stdout', { taskId, output }));
    processInstance.on('stderr', (output) => this.emit('stderr', { taskId, output }));
    processInstance.on('exit', (data) => this.emit('exit', data));
    processInstance.on('error', (data) => this.emit('error', data));
    processInstance.on('started', (data) => this.emit('started', data));
    processInstance.on('stopped', (data) => this.emit('stopped', data));
    processInstance.on('paused', (data) => this.emit('paused', data));

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
    
    // 移除所有事件监听器，防止内存泄漏
    processInstance.removeAllListeners();
    
    // 从进程列表中删除
    this.processes.delete(taskId);
    
    logger.debug(`Cleaned up task ${taskId} from process manager`);
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
    
    // 清理每个已完成的任务
    toDelete.forEach(taskId => {
      const instance = this.processes.get(taskId);
      if (instance) {
        // 移除所有事件监听器
        instance.removeAllListeners();
        logger.debug(`Cleaned up completed task ${taskId}`);
      }
      this.processes.delete(taskId);
    });
    
    if (toDelete.length > 0) {
      logger.info(`Cleaned up ${toDelete.length} completed task(s)`, {
        tasks: toDelete,
        remainingTasks: this.processes.size,
      });
    }
  }

  /**
   * 发送控制命令到指定任务
   */
  async sendCommand(taskId: string, command: string, args?: any): Promise<void> {
    const processInstance = this.processes.get(taskId);
    if (!processInstance) {
      throw new Error(`Task ${taskId} not found`);
    }

    // 单字符命令映射（SIPp 原生控制命令）
    const commandMap: Record<string, string> = {
      'p': 'pause',          // 暂停/恢复
      'q': 'quit',           // 优雅退出
      'Q': 'forceQuit',      // 强制退出
      '+': 'increaseRate',   // 增加速率
      '-': 'decreaseRate',   // 减少速率
      's': 'dumpScreen',     // 屏幕截图
      'a': 'increaseRate',   // 调整速率（映射为增速）
    };

    // 标准化命令：单字符 → 完整命令名
    const normalizedCommand = commandMap[command] || command;

    switch (normalizedCommand) {
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
  ratePeriod?: number;     // 速率周期 (毫秒)，在此周期内发起rate个呼叫
  users?: number;          // 最大并发用户数
  limit?: number;          // 呼叫总数限制 (0=无限制)
  remoteHost?: string;     // 远程SIP服务器地址
  remotePort?: number;     // 远程SIP服务器端口
  localPort?: number;      // 本地SIP信令端口
  controlPort?: number;    // SIPp控制端口（UDP，用于动态控制速率等，默认：8888）
  transport?: 'udp' | 'tcp' | 'tls'; // 传输协议
  statsInterval?: number;  // 统计采样间隔（秒）
  timeout?: number;        // 测试超时（毫秒）
  injectionFile?: string;  // 注入文件名（CSV格式，用于携带用户认证信息）
  minRtpPort?: number;     // RTP端口范围起始（默认：系统动态分配）
  maxRtpPort?: number;     // RTP端口范围结束（默认：系统动态分配）
  enableRtpEcho?: boolean; // 启用RTP回音（测试用，将收到的RTP包原样返回）
  mediaIp?: string;        // 媒体IP地址（默认：本地IP）
  oocsf?: string;          // 会话外场景文件（Out Of Call Scenario File），用于处理 NOTIFY/OPTIONS 等
  autoAnswer?: boolean;    // 自动应答会话外消息 (-aa)，自动对 INFO/NOTIFY/OPTIONS/UPDATE 回复 200 OK
  // 注册场景支持（TLS连接复用）
  regScenarioFile?: string; // 注册场景文件（-regsf），TLS传输时先执行注册，主场景复用TLS连接
  regMaxCalls?: number;     // 注册呼叫最大数量（-regm），限制注册次数（默认无限制）
  // TLS 证书配置
  certId?: string;          // 证书ID（从数据库读取并写入临时文件）
  tlsCert?: string;         // TLS 证书文件路径（-tls_cert），PEM格式
  tlsKey?: string;          // TLS 私钥文件路径（-tls_key），PEM格式
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
