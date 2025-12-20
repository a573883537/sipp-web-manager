import { Router, Request, Response } from 'express';
import { sippClient } from '../services/sipp-client';
import { sippProcessManager } from '../services/sipp-process';
import { xmlParser } from '../parsers/xml-parser';
import { logger } from '../utils/logger';
import { config } from '../config';
import { scenarioRepository } from '../database/scenario-repository';
import { injectionFileService } from '../services/injection-file-service';
import { taskHistoryRepository } from '../database/task-history-repository';
import fs from 'fs/promises';
import path from 'path';

/**
 * REST API路由
 * 职责：定义所有HTTP API端点
 * 遵循单一职责原则和RESTful设计规范
 */
export const apiRouter = Router();

/**
 * 健康检查
 */
apiRouter.get('/health', (_req: Request, res: Response) => {
  res.json({
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
 * 启动SIPp测试
 */
apiRouter.post('/sipp/start', async (req: Request, res: Response): Promise<void> => {
  try {
    const {
      taskId,
      scenarioFile,
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
    } = req.body;

    if (!scenarioFile) {
      res.status(400).json({
        success: false,
        error: 'Missing required field: scenarioFile',
      });
      return;
    }

    // 存储任务 ID 到进程管理器（用于后续状态广播）
    if (taskId) {
      (sippProcessManager as any).currentTaskId = taskId;
    }

    await sippProcessManager.start(scenarioFile, {
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
    });

    res.json({
      success: true,
      message: 'SIPp test started successfully',
      status: sippProcessManager.getStatus(),
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
    const { force = false } = req.body;

    await sippProcessManager.stop(force);

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
 * 重启SIPp测试
 */
apiRouter.post('/sipp/restart', async (req: Request, res: Response): Promise<void> => {
  try {
    const {
      scenarioFile,
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
    } = req.body;

    if (!scenarioFile) {
      res.status(400).json({
        success: false,
        error: 'Missing required field: scenarioFile',
      });
      return;
    }

    await sippProcessManager.restart(scenarioFile, {
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
    });

    res.json({
      success: true,
      message: 'SIPp test restarted successfully',
      status: sippProcessManager.getStatus(),
    });
  } catch (error: any) {
    logger.error('Failed to restart SIPp test:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * 获取SIPp进程状态
 */
apiRouter.get('/sipp/process-status', (_req: Request, res: Response) => {
  const status = sippProcessManager.getStatus();
  res.json({
    success: true,
    status,
  });
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
      injection_file: record.injection_file,  // 添加注入文件字段
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
      injection_file: record.injection_file,  // 添加注入文件字段
    };

    res.json({ success: true, scenario });
  } catch (error: any) {
    logger.error('Failed to get scenario:', error);
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
 * 获取所有任务历史
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
 * 删除任务历史记录
 */
apiRouter.delete('/task-history/:id', async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const deleted = await taskHistoryRepository.delete(id);

    if (!deleted) {
      res.status(404).json({
        success: false,
        error: 'Task not found',
      });
      return;
    }

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
 * 错误处理中间件
 */
apiRouter.use((error: Error, _req: Request, res: Response, _next: any) => {
  logger.error('API error:', error);
  res.status(500).json({
    success: false,
    error: error.message,
  });
});

export default apiRouter;
