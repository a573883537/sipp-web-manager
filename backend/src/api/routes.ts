import { Router, Request, Response } from 'express';
import { sippClient } from '../services/sipp-client';
import { sippProcessManager } from '../services/sipp-process';
import { xmlParser } from '../parsers/xml-parser';
import { logger } from '../utils/logger';
import { config } from '../config';
import { query } from '../database';
import { scenarioRepository } from '../database/scenario-repository';
import { injectionFileService } from '../services/injection-file-service';
import { taskHistoryRepository } from '../database/task-history-repository';
import { configTemplateRepository } from '../database/config-template-repository';
import { slaveManager } from '../services/slave-manager';
import fs from 'fs/promises';
import * as fsSync from 'fs';
import path from 'path';
import axios from 'axios';
import multer from 'multer';

/**
 * REST API路由
 * 职责：定义所有HTTP API端点
 * 遵循单一职责原则和RESTful设计规范
 */
export const apiRouter = Router();

/**
 * 配置 multer 用于日志文件上传
 * 存储策略：按 {machineId}/{taskId}/ 目录结构组织
 */
const upload = multer({
  storage: multer.diskStorage({
    destination: async (req, _file, cb) => {
      try {
        const { machineId, taskId } = req.body;
        if (!machineId || !taskId) {
          return cb(new Error('Missing machineId or taskId'), '');
        }

        // 创建目标目录：logs/{machineId}/{taskId}/
        const uploadDir = path.join(config.sipp.logDir, machineId, taskId);
        await fs.mkdir(uploadDir, { recursive: true });

        cb(null, uploadDir);
      } catch (error: any) {
        cb(error, '');
      }
    },
    filename: (_req, file, cb) => {
      // 保持原始文件名
      cb(null, file.originalname);
    },
  }),
  limits: {
    fileSize: 100 * 1024 * 1024, // 100MB 单文件限制
  },
});

/**
 * 健康检查
 */
apiRouter.get('/health', (_req: Request, res: Response) => {
  res.json({
    success: true,
    status: 'ok',
    timestamp: Date.now(),
    sippConnected: sippClient.isActive(),
  });
});

/**
 * 获取SIPp状态
 */
apiRouter.get('/sipp/status', (_req: Request, res: Response) => {
  res.json({
    connected: sippClient.isActive(),
    host: config.sipp.host,
    port: config.sipp.controlPort,
  });
});

/**
 * 连接到SIPp
 */
apiRouter.post('/sipp/connect', (_req: Request, res: Response) => {
  try {
    sippClient.connect();
    res.json({ success: true, message: 'Connected to SIPp' });
  } catch (error: any) {
    logger.error('Failed to connect to SIPp:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * 断开SIPp连接
 */
apiRouter.post('/sipp/disconnect', (_req: Request, res: Response) => {
  try {
    sippClient.disconnect();
    res.json({ success: true, message: 'Disconnected from SIPp' });
  } catch (error: any) {
    logger.error('Failed to disconnect from SIPp:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * 启动SIPp测试（支持分布式调度）
 */
apiRouter.post('/sipp/start', async (req: Request, res: Response): Promise<void> => {
  try {
    const {
      taskId,
      scenarioFile,
      scenarioContent, // 新增：场景文件内容（从主机推送）
      injectionContent, // 新增：注入文件内容（从主机推送）
      oocsfContent, // 新增：oocsf文件内容（从主机推送）
      machineId, // 新增：指定从机ID，不指定则自动选择
      rate = 10,
      users = 100,
      limit = 0,
      remoteHost = '127.0.0.1',
      remotePort = 5060,
      localPort = 5061,
      transport = 'udp',
      timeout = 60000,
      injectionFile,
      minRtpPort,
      maxRtpPort,
      enableRtpEcho,
      mediaIp,
      oocsf,
      // 日志追踪选项
      traceMsg,
      traceErr,
      traceCalldebug,
      traceShortmsg,
      traceLogs,
      traceRtt,
      traceScreen,
      // 其他高级选项
      localIp,
      bindLocal,
      rsa,
      autoAnswer,
    } = req.body;

    if (!scenarioFile) {
      res.status(400).json({
        success: false,
        error: 'Missing required field: scenarioFile',
      });
      return;
    }

    if (!taskId) {
      res.status(400).json({
        success: false,
        error: 'Missing required field: taskId',
      });
      return;
    }

    // 从机模式：保存主机推送的文件内容到本地
    if (config.node.role === 'slave') {
      if (scenarioContent) {
        const scenarioPath = path.join(config.sipp.scenarioDir, scenarioFile);
        await fs.mkdir(path.dirname(scenarioPath), { recursive: true });
        await fs.writeFile(scenarioPath, scenarioContent, 'utf-8');
        logger.info(`Scenario file saved from master: ${scenarioPath}`);
      }

      if (injectionContent && injectionFile) {
        const injectionPath = path.join(config.sipp.injectionDir, injectionFile);
        await fs.mkdir(path.dirname(injectionPath), { recursive: true });
        await fs.writeFile(injectionPath, injectionContent, 'utf-8');
        logger.info(`Injection file saved from master: ${injectionPath}`);
      }

      if (oocsfContent && oocsf) {
        const oocsfPath = path.join(config.sipp.scenarioDir, oocsf);
        await fs.mkdir(path.dirname(oocsfPath), { recursive: true });
        await fs.writeFile(oocsfPath, oocsfContent, 'utf-8');
        logger.info(`OOCSF file saved from master: ${oocsfPath}`);
      }
    }

    const options = {
      rate,
      users,
      limit,
      remoteHost,
      remotePort,
      localPort,
      transport,
      timeout,
      injectionFile,
      minRtpPort,
      maxRtpPort,
      enableRtpEcho,
      mediaIp,
      oocsf,
      traceMsg,
      traceErr,
      traceCalldebug,
      traceShortmsg,
      traceLogs,
      traceRtt,
      traceScreen,
      localIp,
      bindLocal,
      rsa,
      autoAnswer,
    };

    // 根据节点角色和 machineId 参数决定执行方式
    let finalMachineId = config.node.role === 'master' ? 'master' : config.node.machineId;

    if (config.node.role === 'master' && machineId) {
      // 主机模式 + 指定从机：转发到指定从机
      if (machineId !== 'master') {
        await slaveManager.startTestOnSlave(machineId, taskId, scenarioFile, options);
        finalMachineId = machineId;
        logger.info(`Test dispatched to slave: ${machineId}`);
      } else {
        // 在主机本地执行
        await sippProcessManager.start(taskId, scenarioFile, options);
        const status = sippProcessManager.getStatus(taskId);
        if (status) {
          await taskHistoryRepository.update(taskId, {
            pid: status.pid || undefined,
            control_port: status.controlPort,
            backend_pid: process.pid,
          });
        }
      }
    } else if (config.node.role === 'master' && !machineId) {
      // 主机模式 + 未指定从机：自动选择最佳从机
      const selectedSlave = await slaveManager.selectSlave();
      if (selectedSlave) {
        await slaveManager.startTestOnSlave(selectedSlave.id, taskId, scenarioFile, options);
        finalMachineId = selectedSlave.id;
        logger.info(`Test auto-dispatched to slave: ${selectedSlave.id}`);
      } else {
        // 无可用从机，主机本地执行（降级策略）
        await sippProcessManager.start(taskId, scenarioFile, options);
        const status = sippProcessManager.getStatus(taskId);
        if (status) {
          await taskHistoryRepository.update(taskId, {
            pid: status.pid || undefined,
            control_port: status.controlPort,
            backend_pid: process.pid,
          });
        }
        logger.warn('No available slaves, test running on master');
      }
    } else {
      // 从机模式：直接本地执行
      await sippProcessManager.start(taskId, scenarioFile, options);
      const status = sippProcessManager.getStatus(taskId);
      if (status) {
        await taskHistoryRepository.update(taskId, {
          pid: status.pid || undefined,
          control_port: status.controlPort,
          backend_pid: process.pid,
        });
      }
    }

    // 更新任务的 machine_id
    await taskHistoryRepository.update(taskId, {
      machine_id: finalMachineId,
    });

    res.json({
      success: true,
      message: 'SIPp test started successfully',
      machineId: finalMachineId,
      taskId,
    });
  } catch (error: any) {
    logger.error('Failed to start SIPp test:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * 停止SIPp测试
 */
apiRouter.post('/sipp/stop', async (req: Request, res: Response): Promise<void> => {
  try {
    const { taskId, force = false } = req.body;

    if (!taskId) {
      res.status(400).json({
        success: false,
        error: 'Missing required field: taskId',
      });
      return;
    }

    await sippProcessManager.stop(taskId, force);

    res.json({
      success: true,
      message: 'SIPp test stopped successfully',
    });
  } catch (error: any) {
    logger.error('Failed to stop SIPp test:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * 获取SIPp进程状态
 */
apiRouter.get('/sipp/process-status', (_req: Request, res: Response) => {
  const allStatus = sippProcessManager.getAllStatus();
  const statusArray = Array.from(allStatus.values());
  res.json({
    success: true,
    status: statusArray,
    runningCount: sippProcessManager.getRunningCount(),
  });
});

/**
 * 发送控制命令到运行中的任务
 */
apiRouter.post('/sipp/command', async (req: Request, res: Response): Promise<void> => {
  try {
    const { taskId, command, args } = req.body;

    if (!taskId || !command) {
      res.status(400).json({
        success: false,
        error: 'Missing required fields: taskId, command',
      });
      return;
    }

    await sippProcessManager.sendCommand(taskId, command, args);

    res.json({
      success: true,
      message: `Command ${command} sent successfully`,
    });
  } catch (error: any) {
    logger.error('Failed to send command:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * 获取任务的实时统计数据
 */
apiRouter.get('/sipp/stats/:taskId', async (req: Request, res: Response): Promise<void> => {
  try {
    const { taskId } = req.params;
    const csvPath = path.join(config.sipp.logDir, `${taskId}_stats.csv`);

    if (!fsSync.existsSync(csvPath)) {
      res.status(404).json({ success: false, error: 'Stats file not found' });
      return;
    }

    const { CsvParser } = await import('../parsers/csv-parser');
    const parser = new CsvParser({ filePath: csvPath, watchMode: false });
    const stats = await parser.getLatest();

    if (!stats) {
      res.json({ success: true, stats: null });
      return;
    }

    const successRate = stats.totalCalls > 0
      ? Math.round((stats.successCalls / stats.totalCalls) * 10000) / 100
      : 0;

    res.json({
      success: true,
      stats: {
        totalCalls: stats.totalCalls,
        successCalls: stats.successCalls,
        failedCalls: stats.failedCalls,
        successRate,
        currentCalls: stats.currentCalls,
        callRate: stats.callRate,
      },
    });
  } catch (error: any) {
    logger.error('Failed to get stats:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * 获取任务的屏幕截图/日志文件
 */
apiRouter.get('/sipp/screen/:taskId', async (req: Request, res: Response): Promise<void> => {
  try {
    const { taskId } = req.params;
    const logDir = config.sipp.logDir;

    // 查找以 taskId 开头的 screen.log 文件
    const files = fsSync.readdirSync(logDir);
    const screenFile = files.find(f => f.includes(taskId) && f.endsWith('_screen.log'));

    if (!screenFile) {
      res.status(404).json({ success: false, error: 'Screen file not found' });
      return;
    }

    const filePath = path.join(logDir, screenFile);
    const content = fsSync.readFileSync(filePath, 'utf-8');

    res.json({ success: true, content });
  } catch (error: any) {
    logger.error('Failed to get screen:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * 场景管理 - 列出所有场景（从数据库）
 */
apiRouter.get('/scenarios', async (_req: Request, res: Response): Promise<void> => {
  try {
    const records = await scenarioRepository.findAll();

    const scenarios = records.map((record) => ({
      id: record.id,
      name: record.name,
      filename: record.filename,
      description: record.description,
      created_at: record.created_at,
      updated_at: record.updated_at,
    }));

    res.json({ success: true, scenarios });
  } catch (error: any) {
    logger.error('Failed to list scenarios:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * 场景管理 - 获取场景详情（从数据库）
 */
apiRouter.get('/scenarios/:filename', async (req: Request, res: Response): Promise<void> => {
  try {
    const { filename } = req.params;
    const record = await scenarioRepository.findByFilename(filename);

    if (!record) {
      res.status(404).json({ success: false, error: 'Scenario not found' });
      return;
    }

    const scenario = {
      name: record.name,
      description: record.description,
      messages: record.messages,
      variables: record.variables,
      init: record.init,
    };

    res.json({ success: true, scenario });
  } catch (error: any) {
    logger.error('Failed to get scenario:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * 场景管理 - 获取场景的原始XML内容（格式化）
 */
apiRouter.get('/scenarios/:filename/xml', async (req: Request, res: Response): Promise<void> => {
  try {
    const { filename } = req.params;
    const filePath = path.join(config.sipp.scenarioDir, filename);

    // 检查文件是否存在
    if (!fsSync.existsSync(filePath)) {
      res.status(404).json({ success: false, error: 'Scenario file not found' });
      return;
    }

    // 读取XML文件内容
    const xmlContent = fsSync.readFileSync(filePath, 'utf-8');

    res.json({ success: true, xml: xmlContent });
  } catch (error: any) {
    logger.error('Failed to get scenario XML:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * 场景管理 - 创建/更新场景（保存到数据库并生成XML）
 */
apiRouter.post('/scenarios', async (req: Request, res: Response): Promise<void> => {
  try {
    const { filename, scenario } = req.body;

    if (!filename || !scenario) {
      res.status(400).json({
        success: false,
        error: 'Missing required fields: filename, scenario',
      });
      return;
    }

    // 验证场景
    const validation = await xmlParser.validate(scenario);
    if (!validation.valid) {
      res.status(400).json({
        success: false,
        error: 'Invalid scenario',
        errors: validation.errors,
      });
      return;
    }

    // 保存到数据库（upsert）
    const record = await scenarioRepository.upsert(filename, scenario);

    // 生成XML文件供SIPp使用
    const filePath = path.join(config.sipp.scenarioDir, filename);

    // 安全检查
    if (!filePath.startsWith(config.sipp.scenarioDir)) {
      res.status(403).json({ success: false, error: 'Access denied' });
      return;
    }

    await xmlParser.generateFile(scenario, filePath);

    res.json({
      success: true,
      message: 'Scenario saved successfully',
      scenario: {
        id: record.id,
        filename: record.filename,
        name: record.name,
        created_at: record.created_at,
        updated_at: record.updated_at,
      },
      path: filePath,
    });
  } catch (error: any) {
    logger.error('Failed to save scenario:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * 场景管理 - 删除场景（从数据库和文件系统）
 */
apiRouter.delete('/scenarios/:filename', async (req: Request, res: Response): Promise<void> => {
  try {
    const { filename } = req.params;

    // 从数据库删除
    const deleted = await scenarioRepository.delete(filename);

    if (!deleted) {
      res.status(404).json({ success: false, error: 'Scenario not found' });
      return;
    }

    // 删除XML文件
    const filePath = path.join(config.sipp.scenarioDir, filename);

    // 安全检查
    if (!filePath.startsWith(config.sipp.scenarioDir)) {
      res.status(403).json({ success: false, error: 'Access denied' });
      return;
    }

    // 尝试删除XML文件（如果存在）
    try {
      await fs.unlink(filePath);
    } catch (error: any) {
      // XML文件可能不存在，记录但不中断
      logger.warn('XML file not found or already deleted', { filePath });
    }

    res.json({
      success: true,
      message: 'Scenario deleted successfully',
    });
  } catch (error: any) {
    logger.error('Failed to delete scenario:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * 场景管理 - 验证场景
 */
apiRouter.post('/scenarios/validate', async (req: Request, res: Response): Promise<void> => {
  try {
    const { scenario } = req.body;

    if (!scenario) {
      res.status(400).json({
        success: false,
        error: 'Missing required field: scenario',
      });
      return;
    }

    const validation = await xmlParser.validate(scenario);

    res.json({
      success: true,
      valid: validation.valid,
      errors: validation.errors,
    });
  } catch (error: any) {
    logger.error('Failed to validate scenario:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * 配置管理 - 获取配置
 */
apiRouter.get('/config', (_req: Request, res: Response) => {
  res.json({
    success: true,
    config: {
      sipp: {
        host: config.sipp.host,
        controlPort: config.sipp.controlPort,
        scenarioDir: config.sipp.scenarioDir,
      },
      server: {
        port: config.server.port,
        env: config.server.env,
      },
    },
  });
});

/**
 * 统计数据 - 获取CSV统计文件路径
 */
apiRouter.get('/stats/csv-path', (_req: Request, res: Response) => {
  res.json({
    success: true,
    path: config.sipp.csvPath,
  });
});

/**
 * 内置场景模板
 */
const BUILTIN_SCENARIOS = ['uac', 'uas', 'regexp', 'branchc', 'branchs', '3pcc-C-A', '3pcc-C-B', '3pcc-A', '3pcc-B'];

apiRouter.get('/scenarios/builtin/list', (_req: Request, res: Response) => {
  res.json({
    success: true,
    scenarios: BUILTIN_SCENARIOS,
  });
});

/**
 * ==================== 注入文件管理 API ====================
 */

/**
 * 列出所有注入文件
 */
apiRouter.get('/injection-files', async (_req: Request, res: Response): Promise<void> => {
  try {
    const files = await injectionFileService.listFiles();
    res.json({
      success: true,
      files,
    });
  } catch (error: any) {
    logger.error('Failed to list injection files:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * 获取注入文件详情
 */
apiRouter.get('/injection-files/:filename', async (req: Request, res: Response): Promise<void> => {
  try {
    const { filename } = req.params;
    const file = await injectionFileService.getFile(filename);

    if (!file) {
      res.status(404).json({
        success: false,
        error: 'Injection file not found',
      });
      return;
    }

    res.json({
      success: true,
      file,
    });
  } catch (error: any) {
    logger.error('Failed to get injection file:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * 创建或更新注入文件
 */
apiRouter.post('/injection-files', async (req: Request, res: Response): Promise<void> => {
  try {
    const { filename, description, content } = req.body;

    if (!filename || !content) {
      res.status(400).json({
        success: false,
        error: 'Missing required fields: filename, content',
      });
      return;
    }

    const id = await injectionFileService.saveFile({
      filename,
      description,
      content,
      field_count: 0, // 会在服务层自动计算
      row_count: 0,   // 会在服务层自动计算
    });

    res.json({
      success: true,
      message: 'Injection file saved successfully',
      id,
    });
  } catch (error: any) {
    logger.error('Failed to save injection file:', error);
    res.status(400).json({ success: false, error: error.message });
  }
});

/**
 * 删除注入文件
 */
apiRouter.delete('/injection-files/:filename', async (req: Request, res: Response): Promise<void> => {
  try {
    const { filename } = req.params;
    await injectionFileService.deleteFile(filename);

    res.json({
      success: true,
      message: 'Injection file deleted successfully',
    });
  } catch (error: any) {
    logger.error('Failed to delete injection file:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * 验证注入文件内容
 */
apiRouter.post('/injection-files/validate', (req: Request, res: Response) => {
  try {
    const { content } = req.body;

    if (!content) {
      res.status(400).json({
        success: false,
        error: 'Missing required field: content',
      });
      return;
    }

    const validation = injectionFileService.validateCsvContent(content);

    res.json({
      success: true,
      validation,
    });
  } catch (error: any) {
    logger.error('Failed to validate injection file:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * ==================== 任务历史管理 API ====================
 */

/**
 * 获取所有任务历史（仅已完成的任务）
 */
apiRouter.get('/task-history', async (_req: Request, res: Response): Promise<void> => {
  try {
    const tasks = await taskHistoryRepository.findAll();
    res.json({
      success: true,
      tasks,
    });
  } catch (error: any) {
    logger.error('Failed to get task history:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * 获取正在运行的任务（按机器分组）
 */
apiRouter.get('/tasks/running-by-machine', async (_req: Request, res: Response): Promise<void> => {
  try {
    const tasksByMachine = await taskHistoryRepository.findRunningByMachine();
    res.json({
      success: true,
      tasksByMachine,
    });
  } catch (error: any) {
    logger.error('Failed to get running tasks by machine:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * 根据状态获取任务历史
 */
apiRouter.get('/task-history/status/:status', async (req: Request, res: Response): Promise<void> => {
  try {
    const { status } = req.params;
    const tasks = await taskHistoryRepository.findByStatus(status);
    res.json({
      success: true,
      tasks,
    });
  } catch (error: any) {
    logger.error('Failed to get task history by status:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * 获取单个任务详情
 */
apiRouter.get('/task-history/:id', async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const task = await taskHistoryRepository.findById(id);

    if (!task) {
      res.status(404).json({
        success: false,
        error: 'Task not found',
      });
      return;
    }

    res.json({
      success: true,
      task,
    });
  } catch (error: any) {
    logger.error('Failed to get task detail:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * 创建任务历史记录
 */
apiRouter.post('/task-history', async (req: Request, res: Response): Promise<void> => {
  try {
    const { id, scenario_name, scenario_file, status, config, stats, start_time, end_time, error } = req.body;

    if (!id || !scenario_name || !scenario_file || !status || !config || !start_time) {
      res.status(400).json({
        success: false,
        error: 'Missing required fields: id, scenario_name, scenario_file, status, config, start_time',
      });
      return;
    }

    await taskHistoryRepository.create({
      id,
      scenario_name,
      scenario_file,
      status,
      config,
      stats,
      start_time,
      end_time,
      error,
    });

    res.json({
      success: true,
      message: 'Task history created successfully',
    });
  } catch (error: any) {
    logger.error('Failed to create task history:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * 更新任务历史记录
 */
apiRouter.put('/task-history/:id', async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const { status, stats, end_time, error } = req.body;

    const updated = await taskHistoryRepository.update(id, {
      status,
      stats,
      end_time,
      error,
    });

    if (!updated) {
      res.status(404).json({
        success: false,
        error: 'Task not found or no changes made',
      });
      return;
    }

    res.json({
      success: true,
      message: 'Task history updated successfully',
    });
  } catch (error: any) {
    logger.error('Failed to update task history:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * 删除任务历史记录（同时删除相关日志文件）
 * 如果任务在从机上，会同步删除从机的日志
 */
apiRouter.delete('/task-history/:id', async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;

    // 获取任务信息以确定所属机器
    const task = await taskHistoryRepository.findById(id);
    if (!task) {
      res.status(404).json({
        success: false,
        error: 'Task not found',
      });
      return;
    }

    // 如果任务在从机上，尝试删除从机的日志
    if (config.node.role === 'master' &&
        task.machine_id !== 'master' &&
        task.machine_id !== config.node.machineId) {
      try {
        const machines = await query('SELECT * FROM machines WHERE id = ?', [task.machine_id]);
        if (machines.length > 0) {
          const machine = machines[0] as any;
          const slaveUrl = `http://${machine.ip_address}:${machine.api_port}/api/logs/task/${id}/delete`;

          logger.info(`Requesting log deletion from slave ${task.machine_id} at ${slaveUrl}`);

          await axios.delete(slaveUrl, { timeout: 5000 });
          logger.info(`Slave logs deleted successfully for task ${id}`);
        }
      } catch (remoteError: any) {
        // 从机删除失败不应阻止主机删除任务记录
        logger.warn(`Failed to delete remote logs for task ${id}:`, remoteError.message);
      }
    }

    // 删除数据库记录
    const deleted = await taskHistoryRepository.delete(id);

    if (!deleted) {
      res.status(404).json({
        success: false,
        error: 'Task not found',
      });
      return;
    }

    // 删除本地日志文件
    const logDir = config.sipp.logDir;
    let deletedCount = 0;

    try {
      // 1. 删除根目录下的日志文件（旧格式：{taskId}_*.log）
      const files = fsSync.readdirSync(logDir);
      const taskFiles = files.filter(f => f.includes(id) && fsSync.statSync(path.join(logDir, f)).isFile());
      for (const file of taskFiles) {
        const filePath = path.join(logDir, file);
        fsSync.unlinkSync(filePath);
        deletedCount++;
        logger.info(`Deleted log file: ${file}`);
      }

      // 2. 删除从机上传的日志目录（新格式：{machineId}/{taskId}/）
      const machineId = task.machine_id;
      const uploadedLogDir = path.join(logDir, machineId, id);
      if (fsSync.existsSync(uploadedLogDir)) {
        fsSync.rmSync(uploadedLogDir, { recursive: true, force: true });
        deletedCount++;
        logger.info(`Deleted uploaded log directory: ${machineId}/${id}`);
      }
    } catch (err) {
      logger.warn('Failed to delete some log files', { taskId: id, error: err });
    }

    logger.info(`Task ${id} deleted: ${deletedCount} log files/directories removed`);

    res.json({
      success: true,
      message: 'Task history deleted successfully',
    });
  } catch (error: any) {
    logger.error('Failed to delete task history:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * 删除任务日志文件（供从机调用）
 * 仅删除日志文件，不删除数据库记录
 */
apiRouter.delete('/logs/task/:taskId/delete', async (req: Request, res: Response): Promise<void> => {
  try {
    const { taskId } = req.params;
    const logDir = config.sipp.logDir;

    const files = fsSync.readdirSync(logDir);
    const taskFiles = files.filter(f => f.includes(taskId));

    if (taskFiles.length === 0) {
      res.status(404).json({ success: false, error: 'No log files found for this task' });
      return;
    }

    let deletedCount = 0;
    for (const file of taskFiles) {
      try {
        const filePath = path.join(logDir, file);
        fsSync.unlinkSync(filePath);
        deletedCount++;
        logger.info(`Deleted log file: ${file}`);
      } catch (err) {
        logger.warn(`Failed to delete log file: ${file}`, err);
      }
    }

    res.json({
      success: true,
      message: `Deleted ${deletedCount} log files for task ${taskId}`,
      deletedCount,
    });
  } catch (error: any) {
    logger.error('Failed to delete task logs:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * ==================== 配置模板管理 API ====================
 */

/**
 * 获取所有配置模板
 */
apiRouter.get('/config-templates', async (_req: Request, res: Response): Promise<void> => {
  try {
    const templates = await configTemplateRepository.findAll();
    // 确保 config 字段被解析为对象
	const parsedTemplates = templates.map(t => ({
		...t,
		config: typeof t.config === 'string' ? JSON.parse(t.config) : t.config
	}));
	res.json({ success: true, templates: parsedTemplates });
  } catch (error: any) {
    logger.error('Failed to get config templates:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * 获取默认配置模板
 */
apiRouter.get('/config-templates/default', async (_req: Request, res: Response): Promise<void> => {
  try {
    const template = await configTemplateRepository.findDefault();
	if (template) {
		// 确保 config 字段被解析为对象
		template.config = typeof template.config === 'string' ? JSON.parse(template.config) : template.config;
	}
    res.json({ success: true, template });
  } catch (error: any) {
    logger.error('Failed to get default config template:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * 获取单个配置模板
 */
apiRouter.get('/config-templates/:id', async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const template = await configTemplateRepository.findById(parseInt(id, 10));
    if (!template) {
      res.status(404).json({ success: false, error: 'Template not found' });
      return;
    }
	// 确保 config 字段被解析为对象
	template.config = typeof template.config === 'string' ? JSON.parse(template.config) : template.config;
    res.json({ success: true, template });
  } catch (error: any) {
    logger.error('Failed to get config template:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * 创建配置模板
 */
apiRouter.post('/config-templates', async (req: Request, res: Response): Promise<void> => {
  try {
    const { name, description, config: templateConfig, is_default } = req.body;
    if (!name || !templateConfig) {
      res.status(400).json({ success: false, error: 'Missing required fields: name, config' });
      return;
    }
    const id = await configTemplateRepository.create({ name, description, config: templateConfig, is_default });
    res.json({ success: true, id, message: 'Template created successfully' });
  } catch (error: any) {
    logger.error('Failed to create config template:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * 更新配置模板
 */
apiRouter.put('/config-templates/:id', async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const { name, description, config: templateConfig, is_default } = req.body;
    const updated = await configTemplateRepository.update(parseInt(id, 10), { name, description, config: templateConfig, is_default });
    if (!updated) {
      res.status(404).json({ success: false, error: 'Template not found' });
      return;
    }
    res.json({ success: true, message: 'Template updated successfully' });
  } catch (error: any) {
    logger.error('Failed to update config template:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * 设置默认配置模板
 */
apiRouter.post('/config-templates/:id/set-default', async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const success = await configTemplateRepository.setDefault(parseInt(id, 10));
    if (!success) {
      res.status(404).json({ success: false, error: 'Template not found' });
      return;
    }
    res.json({ success: true, message: 'Default template set successfully' });
  } catch (error: any) {
    logger.error('Failed to set default config template:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * 删除配置模板
 */
apiRouter.delete('/config-templates/:id', async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const deleted = await configTemplateRepository.delete(parseInt(id, 10));
    if (!deleted) {
      res.status(404).json({ success: false, error: 'Template not found' });
      return;
    }
    res.json({ success: true, message: 'Template deleted successfully' });
  } catch (error: any) {
    logger.error('Failed to delete config template:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * ==================== 日志下载 API ====================
 */

/**
 * 获取任务的可用日志文件列表
 */
apiRouter.get('/logs/task/:taskId/files', async (req: Request, res: Response): Promise<void> => {
  try {
    const { taskId } = req.params;
    const logDir = config.sipp.logDir;
    
    const files = fsSync.readdirSync(logDir);
    const taskLogFiles = files
      .filter(f => f.includes(taskId))
      .map(f => {
        const filePath = path.join(logDir, f);
        const stats = fsSync.statSync(filePath);
        return {
          filename: f,
          size: stats.size,
          mtime: stats.mtime,
        };
      });
    
    res.json({ success: true, files: taskLogFiles });
  } catch (error: any) {
    logger.error('Failed to get task log files:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * 下载任务关联的日志文件（打包为 ZIP）
 */
apiRouter.get('/logs/task/:taskId/download', async (req: Request, res: Response): Promise<void> => {
  try {
    const { taskId } = req.params;
    const logDir = config.sipp.logDir;

    // 查找所有与该任务相关的日志文件
    const files = fsSync.readdirSync(logDir);
    const taskLogFiles = files.filter(f => f.includes(taskId));

    if (taskLogFiles.length === 0) {
      res.status(404).json({ success: false, error: 'No log files found for this task' });
      return;
    }

    // 获取任务记录以确定机器ID
    const task = await taskHistoryRepository.findById(taskId);
    const machineId = task?.machine_id || config.node.machineId;
    const machineName = machineId === 'master' ? '主机' : `从机_${machineId}`;

    // 使用 archiver 打包为 ZIP
    const archiver = require('archiver');
    const archive = archiver('zip', { zlib: { level: 9 } });

    res.attachment(`task_${taskId}_${machineName}_logs.zip`);
    archive.pipe(res);

    // 添加所有相关日志文件到压缩包
    for (const file of taskLogFiles) {
      const filePath = path.join(logDir, file);
      if (fsSync.statSync(filePath).isFile()) {
        archive.file(filePath, { name: file });
      }
    }

    archive.finalize();

    logger.info('Task logs downloaded', { taskId, machineId, files: taskLogFiles.length });
  } catch (error: any) {
    logger.error('Failed to download task logs:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * 远程下载任务日志（主机转发到从机）
 * 用于从主机下载从机上的任务日志
 * 新逻辑：优先从本地 {machineId}/{taskId}/ 目录读取（从机已上传）
 */
apiRouter.get('/logs/task/:taskId/download-remote', async (req: Request, res: Response): Promise<void> => {
  try {
    if (config.node.role !== 'master') {
      res.status(403).json({
        success: false,
        error: 'This API is only available on master node',
      });
      return;
    }

    const { taskId } = req.params;

    // 从数据库查找任务所属的机器
    const task = await taskHistoryRepository.findById(taskId);
    if (!task) {
      res.status(404).json({
        success: false,
        error: `Task not found: ${taskId}`,
      });
      return;
    }

    const machineId = task.machine_id;
    const machineName = machineId === 'master' ? '主机' : `从机_${machineId}`;

    // 检查本地是否存在日志（从机已上传的情况）
    const localLogDir = path.join(config.sipp.logDir, machineId, taskId);
    const localLogExists = fsSync.existsSync(localLogDir);

    if (localLogExists) {
      // 本地存在日志，直接打包返回
      logger.info(`Serving logs from local storage for task ${taskId} (machine: ${machineId})`);

      const files = fsSync.readdirSync(localLogDir);
      if (files.length === 0) {
        res.status(404).json({ success: false, error: 'No log files found' });
        return;
      }

      const archiver = require('archiver');
      const archive = archiver('zip', { zlib: { level: 9 } });

      res.attachment(`task_${taskId}_${machineName}_logs.zip`);
      archive.pipe(res);

      // 添加所有日志文件
      for (const file of files) {
        const filePath = path.join(localLogDir, file);
        if (fsSync.statSync(filePath).isFile()) {
          archive.file(filePath, { name: file });
        }
      }

      archive.finalize();
      logger.info(`Local logs downloaded for task ${taskId}`, { files: files.length });
      return;
    }

    // 本地不存在，尝试从从机下载（兼容旧逻辑）
    logger.info(`Local logs not found, attempting to fetch from slave ${machineId} for task ${taskId}`);

    // 如果是主机任务，直接本地下载
    if (machineId === 'master' || machineId === config.node.machineId) {
      res.redirect(`/api/logs/task/${taskId}/download`);
      return;
    }

    // 从机任务：转发到从机
    const machines = await query('SELECT * FROM machines WHERE id = ?', [machineId]);
    if (machines.length === 0) {
      res.status(404).json({
        success: false,
        error: `Machine not found: ${machineId}`,
      });
      return;
    }

    const machine = machines[0] as any;
    const slaveUrl = `http://${machine.ip_address}:${machine.api_port}/api/logs/task/${taskId}/download`;

    logger.info(`Forwarding log download to slave ${machineId} at ${slaveUrl}`);

    // 使用流式传输转发日志文件
    const response = await axios.get(slaveUrl, {
      responseType: 'stream',
      timeout: 30000,
    });

    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Content-Disposition', `attachment; filename="task_${taskId}_${machineName}_logs.zip"`);

    // 将从机的响应流管道到客户端
    response.data.pipe(res);

    logger.info(`Log download forwarded from ${machineId}`, { taskId });
  } catch (error: any) {
    logger.error('Failed to download remote task logs:', error);
    const errorMsg = error.response?.data?.error || error.message;
    res.status(error.response?.status || 500).json({
      success: false,
      error: errorMsg,
    });
  }
});

/**
 * 下载单个任务日志文件
 */
apiRouter.get('/logs/task/:taskId/:type', async (req: Request, res: Response): Promise<void> => {
  try {
    const { taskId, type } = req.params;
    const logDir = config.sipp.logDir;
    
    // 支持的日志类型映射
    const typeMap: Record<string, string> = {
      'screen': '_screen.log',
      'stats': '_stats.csv',
      'messages': '_messages.log',
      'errors': '_errors.log',
      'calldebug': '_calldebug.log',
      'shortmsg': '_shortmsg.log',
      'logs': '_logs.log',
    };
    
    const suffix = typeMap[type];
    if (!suffix) {
      res.status(400).json({ success: false, error: 'Invalid log type' });
      return;
    }
    
    const filename = `${taskId}${suffix}`;
    const filePath = path.join(logDir, filename);
    
    if (!fsSync.existsSync(filePath)) {
      res.status(404).json({ success: false, error: 'Log file not found' });
      return;
    }
    
    res.download(filePath, filename, (err) => {
      if (err) {
        logger.error('Failed to download log file:', err);
      } else {
        logger.info('Log file downloaded', { taskId, type, filename });
      }
    });
  } catch (error: any) {
    logger.error('Failed to download log file:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * 下载应用日志（后端日志）
 */
apiRouter.get('/logs/application/download', async (req: Request, res: Response): Promise<void> => {
  try {
    const { type } = req.query; // 'app' or 'error' or 'all'
    const logDir = path.dirname(config.logging.file);
    
    const archiver = require('archiver');
    const archive = archiver('zip', { zlib: { level: 9 } });
    
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').substring(0, 19);
    res.attachment(`application_logs_${timestamp}.zip`);
    archive.pipe(res);
    
    // 添加应用日志
    if (!type || type === 'app' || type === 'all') {
      const appLogPath = config.logging.file;
      if (fsSync.existsSync(appLogPath)) {
        archive.file(appLogPath, { name: path.basename(appLogPath) });
      }
    }
    
    // 添加错误日志
    if (!type || type === 'error' || type === 'all') {
      const errorLogPath = path.join(logDir, 'error.log');
      if (fsSync.existsSync(errorLogPath)) {
        archive.file(errorLogPath, { name: 'error.log' });
      }
    }
    
    archive.finalize();
    
    logger.info('Application logs downloaded', { type: type || 'all' });
  } catch (error: any) {
    logger.error('Failed to download application logs:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * 获取应用日志文件信息
 */
apiRouter.get('/logs/application/info', async (_req: Request, res: Response): Promise<void> => {
  try {
    const logDir = path.dirname(config.logging.file);
    const appLogPath = config.logging.file;
    const errorLogPath = path.join(logDir, 'error.log');

    const files = [];

    if (fsSync.existsSync(appLogPath)) {
      const stats = fsSync.statSync(appLogPath);
      files.push({
        name: 'app.log',
        path: appLogPath,
        size: stats.size,
        mtime: stats.mtime,
      });
    }

    if (fsSync.existsSync(errorLogPath)) {
      const stats = fsSync.statSync(errorLogPath);
      files.push({
        name: 'error.log',
        path: errorLogPath,
        size: stats.size,
        mtime: stats.mtime,
      });
    }

    res.json({ success: true, files });
  } catch (error: any) {
    logger.error('Failed to get application log info:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * 从机上传任务日志到主机
 * POST /api/logs/upload
 * Body (multipart/form-data):
 *   - machineId: 从机ID
 *   - taskId: 任务ID
 *   - files: 日志文件数组
 */
apiRouter.post('/logs/upload', upload.array('files', 20), async (req: Request, res: Response): Promise<void> => {
  try {
    if (config.node.role !== 'master') {
      res.status(403).json({
        success: false,
        error: 'This API is only available on master node',
      });
      return;
    }

    const { machineId, taskId } = req.body;
    const files = req.files as Express.Multer.File[];

    if (!machineId || !taskId) {
      res.status(400).json({
        success: false,
        error: 'Missing required fields: machineId, taskId',
      });
      return;
    }

    if (!files || files.length === 0) {
      res.status(400).json({
        success: false,
        error: 'No files uploaded',
      });
      return;
    }

    logger.info(`Received ${files.length} log files from slave ${machineId} for task ${taskId}`);

    res.json({
      success: true,
      message: `Uploaded ${files.length} files successfully`,
      files: files.map(f => ({
        filename: f.filename,
        size: f.size,
        path: path.join(machineId, taskId, f.filename),
      })),
    });
  } catch (error: any) {
    logger.error('Failed to upload logs:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * 错误处理中间件
 */
apiRouter.use((error: Error, _req: Request, res: Response, _next: any) => {
  logger.error('API error:', error);
  res.status(500).json({
    success: false,
    error: error.message,
  });
});

/**
 * ==================== 从机管理 API（仅主机模式）====================
 */

/**
 * 从机心跳上报
 * POST /api/machines/heartbeat
 * 接收从机发送的心跳数据并更新数据库
 */
apiRouter.post('/machines/heartbeat', async (req: Request, res: Response): Promise<void> => {
  try {
    if (config.node.role !== 'master') {
      res.status(403).json({
        success: false,
        error: 'This API is only available on master node',
      });
      return;
    }

    const {
      id,
      name,
      ipAddress,
      apiPort,
      role,
      sippVersion,
      status,
      cpuUsage,
      memoryUsage,
      runningTasks,
      lastHeartbeat,
    } = req.body;

    // 参数校验
    if (!id || !status) {
      res.status(400).json({
        success: false,
        error: 'Missing required fields: id, status',
      });
      return;
    }

    // 首次注册或更新状态
    if (name && ipAddress !== undefined) {
      // 完整注册（包含机器信息）
      await query(`
        INSERT INTO machines (
          id, name, ip_address, api_port, role, sipp_version,
          status, cpu_usage, memory_usage, running_tasks, last_heartbeat
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON DUPLICATE KEY UPDATE
          name = VALUES(name),
          ip_address = VALUES(ip_address),
          api_port = VALUES(api_port),
          sipp_version = VALUES(sipp_version),
          status = VALUES(status),
          cpu_usage = VALUES(cpu_usage),
          memory_usage = VALUES(memory_usage),
          running_tasks = VALUES(running_tasks),
          last_heartbeat = VALUES(last_heartbeat)
      `, [
        id,
        name || id,
        ipAddress || '0.0.0.0',
        apiPort || 3000,
        role || 'slave',
        sippVersion || 'unknown',
        status,
        cpuUsage || null,
        memoryUsage || null,
        runningTasks || 0,
        lastHeartbeat || Date.now(),
      ]);
    } else {
      // 心跳更新（仅更新状态，如果带了 sippVersion 也更新）
      const updateFields: string[] = [];
      const updateValues: any[] = [];

      updateFields.push('status = ?');
      updateValues.push(status);

      updateFields.push('cpu_usage = ?');
      updateValues.push(cpuUsage || null);

      updateFields.push('memory_usage = ?');
      updateValues.push(memoryUsage || null);

      updateFields.push('running_tasks = ?');
      updateValues.push(runningTasks || 0);

      if (sippVersion) {
        updateFields.push('sipp_version = ?');
        updateValues.push(sippVersion);
      }

      updateFields.push('last_heartbeat = ?');
      updateValues.push(lastHeartbeat || Date.now());

      updateValues.push(id);

      await query(`
        UPDATE machines
        SET ${updateFields.join(', ')}
        WHERE id = ?
      `, updateValues);
    }

    // 同步更新 machines 表的 total_tasks（从 task_history 统计）
    // 使用 COLLATE 解决字符集排序规则冲突
    await query(`
      UPDATE machines m
      SET total_tasks = (
        SELECT COUNT(*) FROM task_history
        WHERE machine_id COLLATE utf8mb4_unicode_ci = m.id COLLATE utf8mb4_unicode_ci
      )
      WHERE m.id = ?
    `, [id]);

    res.json({
      success: true,
      message: 'Heartbeat received',
      machineId: id,
    });

    logger.debug(`Heartbeat received from ${id}: ${status}`);
  } catch (error: any) {
    logger.error('Failed to process heartbeat:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * 获取所有节点列表（包括主机和从机）
 */
apiRouter.get('/machines', async (_req: Request, res: Response): Promise<void> => {
  try {
    if (config.node.role !== 'master') {
      res.status(403).json({
        success: false,
        error: 'This API is only available on master node',
      });
      return;
    }

    // 查询所有机器（包括主机和从机）
    const rows = await query(`
      SELECT
        id, name, ip_address, api_port, role, status,
        cpu_usage, memory_usage, running_tasks, total_tasks,
        sipp_version, last_heartbeat
      FROM machines
      ORDER BY
        CASE role WHEN 'master' THEN 0 ELSE 1 END,
        running_tasks ASC
    `);

    const machines = (rows as any[]).map(row => ({
      id: row.id,
      name: row.name,
      ipAddress: row.ip_address,
      apiPort: row.api_port,
      role: row.role,
      status: row.status,
      cpuUsage: row.cpu_usage,
      memoryUsage: row.memory_usage,
      runningTasks: row.running_tasks,
      totalTasks: row.total_tasks,
      sippVersion: row.sipp_version,
      lastHeartbeat: row.last_heartbeat,
    }));

    res.json({
      success: true,
      machines,
    });
  } catch (error: any) {
    logger.error('Failed to get machines:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * 获取可用从机列表（仅在线）
 */
apiRouter.get('/machines/available', async (_req: Request, res: Response): Promise<void> => {
  try {
    if (config.node.role !== 'master') {
      res.status(403).json({
        success: false,
        error: 'This API is only available on master node',
      });
      return;
    }

    const slaves = await slaveManager.getAvailableSlaves();
    res.json({
      success: true,
      machines: slaves,
    });
  } catch (error: any) {
    logger.error('Failed to get available machines:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * 健康检查指定从机
 */
apiRouter.post('/machines/:id/health-check', async (req: Request, res: Response): Promise<void> => {
  try {
    if (config.node.role !== 'master') {
      res.status(403).json({
        success: false,
        error: 'This API is only available on master node',
      });
      return;
    }

    const { id } = req.params;
    const healthy = await slaveManager.checkSlaveHealth(id);

    // 根据健康检查结果更新从机状态
    const newStatus = healthy ? 'online' : 'offline';
    await query('UPDATE machines SET status = ? WHERE id = ?', [newStatus, id]);

    logger.info(`Slave ${id} health check: ${healthy ? 'passed' : 'failed'}, status updated to ${newStatus}`);

    res.json({
      success: true,
      healthy,
      machineId: id,
    });
  } catch (error: any) {
    logger.error('Failed to check slave health:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * 删除从机记录（仅允许删除离线从机）
 */
apiRouter.delete('/machines/:id', async (req: Request, res: Response): Promise<void> => {
  try {
    if (config.node.role !== 'master') {
      res.status(403).json({
        success: false,
        error: 'This API is only available on master node',
      });
      return;
    }

    const { id } = req.params;

    // 查询从机状态
    const machines = await query('SELECT status FROM machines WHERE id = ?', [id]);
    if (machines.length === 0) {
      res.status(404).json({
        success: false,
        error: `Machine not found: ${id}`,
      });
      return;
    }

    const machine = machines[0] as any;
    if (machine.status !== 'offline') {
      res.status(400).json({
        success: false,
        error: `Cannot delete online machine. Please ensure the machine is offline before deletion.`,
      });
      return;
    }

    // 删除从机记录
    await query('DELETE FROM machines WHERE id = ?', [id]);

    logger.info(`Slave ${id} deleted from database`);

    res.json({
      success: true,
      message: `Machine ${id} deleted successfully`,
    });
  } catch (error: any) {
    logger.error('Failed to delete machine:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * 远程控制SIPp任务（主机统一控制接口）
 * 职责：根据任务所在机器转发控制命令
 */
apiRouter.post('/machines/sipp/control', async (req: Request, res: Response): Promise<void> => {
  try {
    if (config.node.role !== 'master') {
      res.status(403).json({
        success: false,
        error: 'This API is only available on master node',
      });
      return;
    }

    const { taskId, command, args } = req.body;

    if (!taskId || !command) {
      res.status(400).json({
        success: false,
        error: 'Missing required fields: taskId, command',
      });
      return;
    }

    // 从数据库查找任务所属的机器
    const task = await taskHistoryRepository.findById(taskId);
    if (!task) {
      res.status(404).json({
        success: false,
        error: `Task not found: ${taskId}`,
      });
      return;
    }

    const machineId = task.machine_id;
    logger.info(`Forwarding control command to ${machineId}: ${command} for task ${taskId}`);

    // 如果是主机任务，直接本地执行
    if (machineId === 'master' || machineId === config.node.machineId) {
      await sippProcessManager.sendCommand(taskId, command, args);
      res.json({
        success: true,
        message: `Command ${command} executed on master`,
        machineId,
      });
      return;
    }

    // 如果是从机任务，转发到从机
    const machines = await query('SELECT * FROM machines WHERE id = ?', [machineId]);
    if (machines.length === 0) {
      res.status(404).json({
        success: false,
        error: `Machine not found: ${machineId}`,
      });
      return;
    }

    const machine = machines[0] as any;
    const slaveUrl = `http://${machine.ip_address}:${machine.api_port}/api/sipp/command`;

    logger.info(`Forwarding to slave ${machineId} at ${slaveUrl}`);

    const response = await axios.post(slaveUrl, {
      taskId,
      command,
      args,
    }, {
      timeout: 10000,
      headers: { 'Content-Type': 'application/json' },
    });

    res.json({
      success: true,
      message: `Command ${command} forwarded to ${machineId}`,
      machineId,
      slaveResponse: response.data,
    });
  } catch (error: any) {
    logger.error('Failed to control SIPp task:', error);
    const errorMsg = error.response?.data?.error || error.message;
    res.status(error.response?.status || 500).json({
      success: false,
      error: errorMsg,
    });
  }
});

/**
 * 远程停止SIPp任务（主机统一停止接口）
 */
apiRouter.post('/machines/sipp/stop', async (req: Request, res: Response): Promise<void> => {
  try {
    if (config.node.role !== 'master') {
      res.status(403).json({
        success: false,
        error: 'This API is only available on master node',
      });
      return;
    }

    const { taskId, force = false } = req.body;

    if (!taskId) {
      res.status(400).json({
        success: false,
        error: 'Missing required field: taskId',
      });
      return;
    }

    // 从数据库查找任务所属的机器
    const task = await taskHistoryRepository.findById(taskId);
    if (!task) {
      res.status(404).json({
        success: false,
        error: `Task not found: ${taskId}`,
      });
      return;
    }

    const machineId = task.machine_id;
    logger.info(`Stopping task ${taskId} on ${machineId}`);

    // 如果是主机任务，直接本地停止
    if (machineId === 'master' || machineId === config.node.machineId) {
      await sippProcessManager.stop(taskId, force);
      res.json({
        success: true,
        message: 'Task stopped on master',
        machineId,
      });
      return;
    }

    // 如果是从机任务，转发到从机
    const machines = await query('SELECT * FROM machines WHERE id = ?', [machineId]);
    if (machines.length === 0) {
      res.status(404).json({
        success: false,
        error: `Machine not found: ${machineId}`,
      });
      return;
    }

    const machine = machines[0] as any;
    const slaveUrl = `http://${machine.ip_address}:${machine.api_port}/api/sipp/stop`;

    logger.info(`Forwarding stop to slave ${machineId} at ${slaveUrl}`);

    const response = await axios.post(slaveUrl, {
      taskId,
      force,
    }, {
      timeout: 10000,
      headers: { 'Content-Type': 'application/json' },
    });

    res.json({
      success: true,
      message: `Task stop forwarded to ${machineId}`,
      machineId,
      slaveResponse: response.data,
    });
  } catch (error: any) {
    logger.error('Failed to stop SIPp task:', error);
    const errorMsg = error.response?.data?.error || error.message;
    res.status(error.response?.status || 500).json({
      success: false,
      error: errorMsg,
    });
  }
});

export default apiRouter;
