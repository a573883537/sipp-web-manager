import React, { useState, useEffect } from 'react';
import { Card, Tabs, Table, Tag, Space, Typography, Tooltip, Progress, Button, Modal, message, Spin, Popconfirm, InputNumber, Dropdown, Statistic, Row, Col } from 'antd';
import {
  PlayCircleOutlined,
  CheckCircleOutlined,
  CloseCircleOutlined,
  StopOutlined,
  ClockCircleOutlined,
  ReloadOutlined,
  DeleteOutlined,
  PauseCircleOutlined,
  PlusOutlined,
  MinusOutlined,
  ControlOutlined,
  CameraOutlined,
  BarChartOutlined,
} from '@ant-design/icons';
import ReactECharts from 'echarts-for-react';
import { useTranslation } from 'react-i18next';
import { useAppStore } from '@/stores/useAppStore';
import { TestTaskStatus, type TestTask } from '@/types';
import { apiService } from '@/services/api';
import type { ColumnsType } from 'antd/es/table';
import type { MenuProps } from 'antd';

const { Text } = Typography;

/**
 * 任务历史页面
 * 显示测试任务的历史记录，区分正在进行和已完成的任务
 */
const TaskHistoryPage: React.FC = () => {
  const { t } = useTranslation();
  const { tasks, updateTask, setTasks } = useAppStore();
  const [stopLoading, setStopLoading] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [deleteLoading, setDeleteLoading] = useState<string | null>(null);
  const [selectedRowKeys, setSelectedRowKeys] = useState<React.Key[]>([]);
  const [batchDeleteLoading, setBatchDeleteLoading] = useState(false);
  const [commandLoading, setCommandLoading] = useState<string | null>(null);
  const [rateModalVisible, setRateModalVisible] = useState(false);
  const [rateModalTask, setRateModalTask] = useState<TestTask | null>(null);
  const [newRate, setNewRate] = useState<number>(10);
  const [processStatus, setProcessStatus] = useState<Record<string, any>>({});
  const [screenModalVisible, setScreenModalVisible] = useState(false);
  const [screenContent, setScreenContent] = useState<string>('');
  const [screenTime, setScreenTime] = useState<string>('');
  const [statsModalVisible, setStatsModalVisible] = useState(false);
  const [statsTask, setStatsTask] = useState<TestTask | null>(null);

  /**
   * 获取进程状态
   */
  const fetchProcessStatus = async () => {
    try {
      const response = await apiService.getSippProcessStatus();
      if (response.success && response.status) {
        const statusMap: Record<string, any> = {};
        (response.status as any[]).forEach((s: any) => {
          statusMap[s.taskId] = s;
        });
        setProcessStatus(statusMap);
      }
    } catch (error) {
      console.error('Failed to fetch process status:', error);
    }
  };

  /**
   * 发送控制命令
   */
  const sendCommand = async (taskId: string, command: string, args?: any) => {
    try {
      setCommandLoading(taskId);
      await apiService.sendTaskCommand(taskId, command, args);
      message.success(t('taskHistory.commandSent', { command }));
      // 刷新进程状态
      await fetchProcessStatus();
    } catch (error: any) {
      message.error(`${t('taskHistory.commandFailed')}: ${error.message}`);
    } finally {
      setCommandLoading(null);
    }
  };

  /**
   * 获取控制菜单项
   */
  const getControlMenuItems = (task: TestTask): MenuProps['items'] => {
    const status = processStatus[task.id];
    const isPaused = status?.isPaused || false;
    const currentRate = status?.currentRate || task.config.rate || 10;

    return [
      {
        key: 'pause',
        icon: <PauseCircleOutlined />,
        label: isPaused ? t('taskHistory.resume') : t('taskHistory.pause'),
        onClick: () => sendCommand(task.id, 'pause'),
      },
      {
        key: 'increaseRate',
        icon: <PlusOutlined />,
        label: `${t('taskHistory.increaseRate')} (${t('taskHistory.currentRate')}: ${currentRate})`,
        onClick: () => sendCommand(task.id, 'increaseRate'),
      },
      {
        key: 'decreaseRate',
        icon: <MinusOutlined />,
        label: `${t('taskHistory.decreaseRate')} (${t('taskHistory.currentRate')}: ${currentRate})`,
        onClick: () => sendCommand(task.id, 'decreaseRate'),
      },
      {
        key: 'setRate',
        icon: <ControlOutlined />,
        label: `${t('taskHistory.setRate')}...`,
        onClick: () => {
          setRateModalTask(task);
          setNewRate(currentRate);
          setRateModalVisible(true);
        },
      },
      { type: 'divider' },
      {
        key: 'quit',
        icon: <StopOutlined />,
        label: t('taskHistory.gracefulStop'),
        onClick: () => sendCommand(task.id, 'quit'),
      },
      { type: 'divider' },
      {
        key: 'dumpScreen',
        icon: <CameraOutlined />,
        label: t('taskHistory.dumpScreen'),
        onClick: async () => {
          await sendCommand(task.id, 'dumpScreen');
          message.success(t('taskHistory.screenshotGenerated'));
        },
      },
      {
        key: 'viewScreen',
        icon: <CameraOutlined />,
        label: t('taskHistory.viewScreen'),
        onClick: () => viewScreen(task.id),
      },
    ];
  };

  /**
   * 查看屏幕截图
   */
  const viewScreen = async (taskId: string) => {
    try {
      const response = await apiService.getTaskScreen(taskId);
      if (response.success && response.content) {
        setScreenContent(response.content);
        setScreenTime(new Date().toLocaleString());
        setScreenModalVisible(true);
      } else {
        message.warning(t('taskHistory.noScreenshot'));
      }
    } catch (error: any) {
      message.error(`${t('taskHistory.getScreenFailed')}: ${error.message}`);
    }
  };

  /**
   * 查看统计数据
   */
  const viewStats = (task: TestTask) => {
    setStatsTask(task);
    setStatsModalVisible(true);
  };

  /**
   * 生成统计图表配置
   */
  const getStatsChartOption = () => {
    if (!statsTask?.stats) return {};
    const { successCalls = 0, failedCalls = 0 } = statsTask.stats;
    return {
      tooltip: { trigger: 'item', formatter: '{b}: {c} ({d}%)' },
      legend: { bottom: 0 },
      series: [{
        type: 'pie',
        radius: ['40%', '70%'],
        label: { show: true, formatter: '{b}: {c}' },
        data: [
          { value: successCalls, name: t('taskHistory.successCalls'), itemStyle: { color: '#52c41a' } },
          { value: failedCalls, name: t('taskHistory.failedCalls'), itemStyle: { color: '#ff4d4f' } },
        ],
      }],
    };
  };

  /**
   * 从数据库加载任务历史，并同步实际进程状态
   */
  const loadTaskHistory = async (showMessage = false) => {
    setLoading(true);
    try {
      // 同时获取数据库任务和实际进程状态
      const [historyResponse, processResponse] = await Promise.all([
        apiService.getTaskHistory(),
        apiService.getSippProcessStatus(),
      ]);

      if (historyResponse.success && historyResponse.tasks) {
        // 获取实际运行中的任务ID集合和状态
        const runningTaskIds = new Set<string>();
        const statusMap: Record<string, any> = {};
        if (processResponse.success && processResponse.status) {
          (processResponse.status as any[]).forEach((s: any) => {
            statusMap[s.taskId] = s;
            if (s.isRunning) {
              runningTaskIds.add(s.taskId);
            }
          });
        }
        // 更新进程状态
        setProcessStatus(statusMap);

        // 将数据库任务转换为前端 TestTask 格式，并同步状态
        const dbTasks: TestTask[] = historyResponse.tasks.map((task: any) => {
          // 数据库存储大写，前端枚举小写，需要转换
          let status = (task.status?.toLowerCase() || 'failed') as TestTaskStatus;

          // 如果数据库显示运行中，但实际进程管理器中不存在
          // 注意：服务重启后，进程管理器内存会被清空，但 sipp 进程可能仍在系统中运行
          // 因此这里不立即标记为 FAILED，而是信任数据库状态
          // 后端的 recoverRunningTasks 会在启动时检查进程是否真的存活
          // if (status === TestTaskStatus.RUNNING && !runningTaskIds.has(task.id)) {
          //   status = TestTaskStatus.FAILED;
          //   // 异步更新数据库
          //   apiService.updateTaskHistory(task.id, {
          //     status: 'FAILED',
          //     end_time: Date.now(),
          //     error: 'Process terminated unexpectedly',
          //   }).catch(console.error);
          // }

          return {
            id: task.id,
            scenarioName: task.scenario_name,
            scenarioFile: task.scenario_file,
            status,
            config: task.config,
            stats: task.stats,
            startTime: task.start_time,
            endTime: task.end_time || (status !== TestTaskStatus.RUNNING ? Date.now() : undefined),
            error: task.error || (status === TestTaskStatus.FAILED && !task.error ? 'Process terminated unexpectedly' : undefined),
          };
        });

        // 完全替换 store 中的任务列表
        setTasks(dbTasks);

        // 立即获取运行中任务的最新统计数据
        const runningTasks = dbTasks.filter(t => t.status === TestTaskStatus.RUNNING);
        if (runningTasks.length > 0) {
          // 并行获取所有运行中任务的统计数据
          Promise.all(
            runningTasks.map(async (task) => {
              try {
                const response = await apiService.getTaskStats(task.id);
                if (response.success && response.stats) {
                  updateTask(task.id, { stats: response.stats });
                }
              } catch (error) {
                // 忽略错误
              }
            })
          );
        }

        if (showMessage) {
          message.success(t('taskHistory.loadSuccess', { count: dbTasks.length }));
        }
      }
    } catch (error: any) {
      message.error(`${t('taskHistory.loadFailed')}: ${error.message}`);
    } finally {
      setLoading(false);
    }
  };

  /**
   * 组件挂载时加载任务历史
   */
  useEffect(() => {
    loadTaskHistory();
    fetchProcessStatus();
  }, []);

  /**
   * 定时更新运行中任务的统计数据
   */
  useEffect(() => {
    const updateStats = async () => {
      const runningTasks = tasks.filter(t => t.status === TestTaskStatus.RUNNING);
      if (runningTasks.length === 0) return;

      // 并行请求所有任务的统计数据
      await Promise.all(
        runningTasks.map(async (task) => {
          try {
            const response = await apiService.getTaskStats(task.id);
            if (response.success && response.stats) {
              updateTask(task.id, { stats: response.stats });
            }
          } catch (error) {
            // 忽略错误
          }
        })
      );
    };

    // 立即执行一次
    updateStats();

    // 然后每3秒更新一次
    const statsInterval = setInterval(updateStats, 3000);
    return () => clearInterval(statsInterval);
  }, [tasks, updateTask]);

  /**
   * 格式化持续时间
   */
  const formatDuration = (startTime: number, endTime?: number): string => {
    const duration = (endTime || Date.now()) - startTime;
    const seconds = Math.floor(duration / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);

    if (hours > 0) {
      return `${hours}h ${minutes % 60}m`;
    } else if (minutes > 0) {
      return `${minutes}m ${seconds % 60}s`;
    } else {
      return `${seconds}s`;
    }
  };

  /**
   * 获取状态标签
   */
  const getStatusTag = (status: TestTaskStatus) => {
    const statusConfig = {
      [TestTaskStatus.RUNNING]: {
        color: 'processing',
        icon: <PlayCircleOutlined />,
        text: t('status.running'),
      },
      [TestTaskStatus.COMPLETED]: {
        color: 'success',
        icon: <CheckCircleOutlined />,
        text: t('status.completed'),
      },
      [TestTaskStatus.FAILED]: {
        color: 'error',
        icon: <CloseCircleOutlined />,
        text: t('status.failed'),
      },
      [TestTaskStatus.STOPPED]: {
        color: 'default',
        icon: <StopOutlined />,
        text: t('status.stopped'),
      },
    };

    const config = statusConfig[status];
    if (!config) {
      return (
        <Tag color="default">
          {status || '未知'}
        </Tag>
      );
    }
    return (
      <Tag color={config.color} icon={config.icon}>
        {config.text}
      </Tag>
    );
  };

  /**
   * 停止任务
   */
  const handleStopTask = async (task: TestTask) => {
    Modal.confirm({
      title: t('taskHistory.confirmStop'),
      content: t('taskHistory.confirmStopTask', { name: task.scenarioName }),
      okText: t('taskHistory.stop'),
      okType: 'danger',
      cancelText: t('common.cancel'),
      onOk: async () => {
        try {
          setStopLoading(task.id);
          await apiService.stopSippTest(task.id, false);
          message.success(t('taskHistory.taskStopped'));
          updateTask(task.id, {
            status: TestTaskStatus.STOPPED,
            endTime: Date.now(),
          });
        } catch (error: any) {
          message.error(`${t('taskHistory.stopFailed')}: ${error.message}`);
        } finally {
          setStopLoading(null);
        }
      },
    });
  };

  /**
   * 删除任务
   */
  const handleDeleteTask = async (taskId: string) => {
    try {
      setDeleteLoading(taskId);
      await apiService.deleteTaskHistory(taskId);
      message.success(t('taskHistory.taskDeleted'));
      await loadTaskHistory();
    } catch (error: any) {
      message.error(`${t('taskHistory.deleteFailed')}: ${error.message}`);
    } finally {
      setDeleteLoading(null);
    }
  };

  /**
   * 批量删除任务
   */
  const handleBatchDelete = async () => {
    if (selectedRowKeys.length === 0) return;

    Modal.confirm({
      title: t('common.confirmBatchDelete'),
      content: t('taskHistory.confirmBatchDeleteTasks', { count: selectedRowKeys.length }),
      okText: t('common.delete'),
      okType: 'danger',
      cancelText: t('common.cancel'),
      onOk: async () => {
        try {
          setBatchDeleteLoading(true);
          let successCount = 0;
          let failCount = 0;

          for (const taskId of selectedRowKeys) {
            try {
              await apiService.deleteTaskHistory(taskId as string);
              successCount++;
            } catch (error) {
              failCount++;
            }
          }

          if (failCount === 0) {
            message.success(t('taskHistory.batchDeleteSuccess', { success: successCount }));
          } else {
            message.warning(t('taskHistory.batchDeletePartial', { success: successCount, fail: failCount }));
          }

          setSelectedRowKeys([]);
          await loadTaskHistory();
        } catch (error: any) {
          message.error(`${t('taskHistory.batchDeleteFailed')}: ${error.message}`);
        } finally {
          setBatchDeleteLoading(false);
        }
      },
    });
  };

  /**
   * 表格列配置（正在进行）
   */
  const runningColumns: ColumnsType<TestTask> = [
    {
      title: t('taskHistory.scenarioName'),
      dataIndex: 'scenarioName',
      key: 'scenarioName',
      width: 200,
      render: (name: string, record: TestTask) => (
        <Space direction="vertical" size={0}>
          <Text strong>{name}</Text>
          <Text type="secondary" style={{ fontSize: '12px' }}>
            {record.scenarioFile}
          </Text>
        </Space>
      ),
    },
    {
      title: t('taskHistory.testConfig'),
      key: 'config',
      width: 250,
      render: (_: any, record: TestTask) => (
        <Space direction="vertical" size={0}>
          <Text style={{ fontSize: '12px' }}>
            <ClockCircleOutlined /> {t('taskHistory.callRate')}: {record.config.rate} calls/s
          </Text>
          <Text style={{ fontSize: '12px' }}>
            {t('startTest.users')}: {record.config.users} | {t('startTest.limit')}: {record.config.limit || '∞'}
          </Text>
          <Text style={{ fontSize: '12px' }}>
            {record.config.remoteHost}:{record.config.remotePort}
          </Text>
          <Text style={{ fontSize: '12px' }}>
            {record.config.transport.toUpperCase()}
          </Text>
        </Space>
      ),
    },
    {
      title: t('taskHistory.statistics'),
      key: 'stats',
      width: 180,
      render: (_: any, record: TestTask) => {
        if (!record.stats) {
          return <Text type="secondary">-</Text>;
        }

        const { totalCalls, successCalls, failedCalls, successRate } = record.stats;
        return (
          <Tooltip title={t('taskHistory.clickToViewDetail')}>
            <div onClick={() => viewStats(record)} style={{ cursor: 'pointer' }}>
              <Space direction="vertical" size={4} style={{ width: '100%' }}>
                <div>
                  <Text style={{ fontSize: '12px' }}>
                    {t('taskHistory.totalCalls')}: {totalCalls}
                  </Text>
                </div>
                <div>
                  <Text style={{ fontSize: '12px', color: '#52c41a' }}>
                    {t('taskHistory.successCalls')}: {successCalls}
                  </Text>
                  <Text style={{ fontSize: '12px', color: '#ff4d4f', marginLeft: 8 }}>
                    {t('taskHistory.failedCalls')}: {failedCalls}
                  </Text>
                </div>
                <Progress
                  percent={successRate}
                  size="small"
                  strokeColor="#52c41a"
                  format={(percent) => `${percent?.toFixed(1)}%`}
                />
              </Space>
            </div>
          </Tooltip>
        );
      },
    },
    {
      title: t('taskHistory.startTime'),
      key: 'startTime',
      width: 150,
      render: (_: any, record: TestTask) => (
        <Tooltip title={new Date(record.startTime).toLocaleString()}>
          <Text style={{ fontSize: '12px' }}>
            {new Date(record.startTime).toLocaleTimeString()}
          </Text>
        </Tooltip>
      ),
    },
    {
      title: t('taskHistory.duration'),
      key: 'duration',
      width: 120,
      render: (_: any, record: TestTask) => (
        <Text style={{ fontSize: '12px' }}>
          {formatDuration(record.startTime)}
        </Text>
      ),
    },
    {
      title: t('common.actions'),
      key: 'action',
      width: 200,
      render: (_: any, record: TestTask) => {
        // 检查是否为孤儿进程（数据库显示运行中但进程管理器中不存在）
        const isOrphanProcess = !processStatus[record.id];
        
        return (
          <Space direction="vertical" size={4}>
            {isOrphanProcess && (
              <Tooltip title="服务重启后无法控制此进程，但它仍在运行并生成统计数据">
                <Tag color="warning" style={{ fontSize: '11px', margin: 0 }}>
                  无法控制
                </Tag>
              </Tooltip>
            )}
            <Space>
              <Dropdown
                menu={{ items: getControlMenuItems(record) }}
                trigger={['click']}
                disabled={isOrphanProcess}
              >
                <Button
                  size="small"
                  icon={<ControlOutlined />}
                  loading={commandLoading === record.id}
                  disabled={isOrphanProcess}
                >
                  {t('taskHistory.control')}
                </Button>
              </Dropdown>
              <Tooltip title={isOrphanProcess ? "无法停止孤儿进程，请手动结束" : ""}>
                <Button
                  danger
                  size="small"
                  icon={<StopOutlined />}
                  loading={stopLoading === record.id}
                  onClick={() => handleStopTask(record)}
                  disabled={isOrphanProcess}
                >
                  {t('taskHistory.stop')}
                </Button>
              </Tooltip>
            </Space>
          </Space>
        );
      },
    },
  ];

  /**
   * 表格列配置（已完成）
   */
  const completedColumns: ColumnsType<TestTask> = [
    {
      title: t('taskHistory.scenarioName'),
      dataIndex: 'scenarioName',
      key: 'scenarioName',
      width: 200,
      render: (name: string, record: TestTask) => (
        <Space direction="vertical" size={0}>
          <Text strong>{name}</Text>
          <Text type="secondary" style={{ fontSize: '12px' }}>
            {record.scenarioFile}
          </Text>
        </Space>
      ),
    },
    {
      title: t('common.status'),
      dataIndex: 'status',
      key: 'status',
      width: 100,
      render: (status: TestTaskStatus) => getStatusTag(status),
    },
    {
      title: t('taskHistory.testConfig'),
      key: 'config',
      width: 250,
      render: (_: any, record: TestTask) => (
        <Space direction="vertical" size={0}>
          <Text style={{ fontSize: '12px' }}>
            <ClockCircleOutlined /> {t('taskHistory.callRate')}: {record.config.rate} calls/s
          </Text>
          <Text style={{ fontSize: '12px' }}>
            {t('startTest.users')}: {record.config.users} | {t('startTest.limit')}: {record.config.limit || '∞'}
          </Text>
          <Text style={{ fontSize: '12px' }}>
            {record.config.remoteHost}:{record.config.remotePort}
          </Text>
          <Text style={{ fontSize: '12px' }}>
            {record.config.transport.toUpperCase()}
          </Text>
        </Space>
      ),
    },
    {
      title: t('taskHistory.statistics'),
      key: 'stats',
      width: 180,
      render: (_: any, record: TestTask) => {
        if (!record.stats) {
          return <Text type="secondary">-</Text>;
        }

        const { totalCalls, successCalls, failedCalls, successRate } = record.stats;
        return (
          <Tooltip title={t('taskHistory.clickToViewDetail')}>
            <div onClick={() => viewStats(record)} style={{ cursor: 'pointer' }}>
              <Space direction="vertical" size={4} style={{ width: '100%' }}>
                <div>
                  <Text style={{ fontSize: '12px' }}>
                    {t('taskHistory.totalCalls')}: {totalCalls}
                  </Text>
                </div>
                <div>
                  <Text style={{ fontSize: '12px', color: '#52c41a' }}>
                    {t('taskHistory.successCalls')}: {successCalls}
                  </Text>
                  <Text style={{ fontSize: '12px', color: '#ff4d4f', marginLeft: 8 }}>
                    {t('taskHistory.failedCalls')}: {failedCalls}
                  </Text>
                </div>
                <Progress
                  percent={successRate}
                  size="small"
                  strokeColor="#52c41a"
                  format={(percent) => `${percent?.toFixed(1)}%`}
                />
              </Space>
            </div>
          </Tooltip>
        );
      },
    },
    {
      title: t('common.time'),
      key: 'time',
      width: 180,
      render: (_: any, record: TestTask) => (
        <Space direction="vertical" size={0}>
          <Tooltip title={new Date(record.startTime).toLocaleString()}>
            <Text style={{ fontSize: '12px' }}>
              {new Date(record.startTime).toLocaleTimeString()}
            </Text>
          </Tooltip>
          {record.endTime && (
            <Tooltip title={new Date(record.endTime).toLocaleString()}>
              <Text style={{ fontSize: '12px' }}>
                → {new Date(record.endTime).toLocaleTimeString()}
              </Text>
            </Tooltip>
          )}
          <Text style={{ fontSize: '12px' }}>
            {formatDuration(record.startTime, record.endTime)}
          </Text>
        </Space>
      ),
    },
    {
      title: t('taskHistory.remarks'),
      key: 'error',
      width: 150,
      render: (_: any, record: TestTask) => {
        if (record.error) {
          return (
            <Tooltip title={record.error}>
              <Text type="danger" style={{ fontSize: '12px' }} ellipsis>
                {record.error}
              </Text>
            </Tooltip>
          );
        }
        if (record.config.injectionFile) {
          return (
            <Text type="secondary" style={{ fontSize: '12px' }}>
              {record.config.injectionFile}
            </Text>
          );
        }
        return <Text type="secondary">-</Text>;
      },
    },
    {
      title: t('common.actions'),
      key: 'action',
      width: 100,
      render: (_: any, record: TestTask) => (
        <Popconfirm
          title={t('common.confirmDelete')}
          description={t('taskHistory.confirmDeleteTask', { name: record.scenarioName })}
          onConfirm={() => handleDeleteTask(record.id)}
          okText={t('common.delete')}
          cancelText={t('common.cancel')}
          okButtonProps={{ danger: true }}
        >
          <Button
            danger
            size="small"
            icon={<DeleteOutlined />}
            loading={deleteLoading === record.id}
          >
            {t('common.delete')}
          </Button>
        </Popconfirm>
      ),
    },
  ];

  // 筛选任务
  const runningTasks = tasks.filter(task => task.status === TestTaskStatus.RUNNING);
  const completedTasks = tasks.filter(task =>
    task.status !== TestTaskStatus.RUNNING
  );

  return (
    <div style={{ padding: '24px' }}>
      <Card
        title={
          <Space>
            <ClockCircleOutlined />
            <span>{t('taskHistory.title')}</span>
          </Space>
        }
        extra={
          <Space>
            {selectedRowKeys.length > 0 && (
              <Button
                danger
                icon={<DeleteOutlined />}
                onClick={handleBatchDelete}
                loading={batchDeleteLoading}
              >
                {t('scenarios.batchDelete')} ({selectedRowKeys.length})
              </Button>
            )}
            <Button
              icon={<ReloadOutlined />}
              onClick={() => loadTaskHistory(true)}
              loading={loading}
            >
              {t('common.refresh')}
            </Button>
          </Space>
        }
      >
        <Spin spinning={loading} tip={t('common.loading')}>
          <Tabs
            defaultActiveKey="running"
            items={[
              {
                key: 'running',
                label: (
                  <span>
                    <PlayCircleOutlined />
                    {t('taskHistory.running')} ({runningTasks.length})
                  </span>
                ),
                children: (
                  <Table
                    columns={runningColumns}
                    dataSource={runningTasks}
                    rowKey="id"
                    size="small"
                    pagination={{
                      pageSize: 10,
                      showSizeChanger: true,
                      showTotal: (total) => t('taskHistory.totalRunningTasks', { total }),
                    }}
                    locale={{
                      emptyText: t('taskHistory.noRunningTasks'),
                    }}
                  />
                ),
              },
              {
                key: 'completed',
                label: (
                  <span>
                    <CheckCircleOutlined />
                    {t('taskHistory.completed')} ({completedTasks.length})
                  </span>
                ),
                children: (
                  <Table
                    columns={completedColumns}
                    dataSource={completedTasks}
                    rowKey="id"
                    size="small"
                    rowSelection={{
                      selectedRowKeys,
                      onChange: setSelectedRowKeys,
                    }}
                    pagination={{
                      pageSize: 10,
                      showSizeChanger: true,
                      showTotal: (total) => t('taskHistory.totalHistoryRecords', { total }),
                    }}
                    locale={{
                      emptyText: t('taskHistory.noHistory'),
                    }}
                  />
                ),
              },
            ]}
          />
        </Spin>
      </Card>

      {/* 设置速率弹窗 */}
      <Modal
        title={t('taskHistory.setRateTitle')}
        open={rateModalVisible}
        onOk={async () => {
          if (rateModalTask) {
            await sendCommand(rateModalTask.id, 'setRate', { rate: newRate });
            setRateModalVisible(false);
          }
        }}
        onCancel={() => setRateModalVisible(false)}
        okText={t('common.confirm')}
        cancelText={t('common.cancel')}
      >
        <Space>
          <Text>{t('taskHistory.newRate')} (calls/s):</Text>
          <InputNumber
            min={1}
            max={10000}
            value={newRate}
            onChange={(v) => setNewRate(v || 10)}
          />
        </Space>
      </Modal>

      {/* 屏幕截图弹窗 */}
      <Modal
        title={<><CameraOutlined /> {t('taskHistory.screenshotTitle')} <Text type="secondary" style={{ fontSize: 12 }}>({screenTime})</Text></>}
        open={screenModalVisible}
        onCancel={() => setScreenModalVisible(false)}
        footer={null}
        width={900}
      >
        <pre style={{
          maxHeight: '500px',
          overflow: 'auto',
          backgroundColor: '#1e1e1e',
          color: '#d4d4d4',
          padding: '16px',
          borderRadius: '4px',
          fontSize: '12px',
          fontFamily: 'Consolas, Monaco, monospace',
          lineHeight: '1.4',
        }}>
          {screenContent || t('taskHistory.noContent')}
        </pre>
      </Modal>

      {/* 统计数据弹窗 */}
      <Modal
        title={<><BarChartOutlined /> {t('taskHistory.statsDetail')} - {statsTask?.scenarioName}</>}
        open={statsModalVisible}
        onCancel={() => setStatsModalVisible(false)}
        footer={null}
        width={600}
      >
        {statsTask?.stats ? (
          <>
            <Row gutter={16} style={{ marginBottom: 24 }}>
              <Col span={8}>
                <Statistic title={t('taskHistory.totalCalls')} value={statsTask.stats.totalCalls} />
              </Col>
              <Col span={8}>
                <Statistic title={t('taskHistory.successCalls')} value={statsTask.stats.successCalls} valueStyle={{ color: '#52c41a' }} />
              </Col>
              <Col span={8}>
                <Statistic title={t('taskHistory.failedCalls')} value={statsTask.stats.failedCalls} valueStyle={{ color: '#ff4d4f' }} />
              </Col>
            </Row>
            <Row gutter={16} style={{ marginBottom: 24 }}>
              <Col span={8}>
                <Statistic title={t('taskHistory.successRate')} value={statsTask.stats.successRate} suffix="%" precision={2} />
              </Col>
              <Col span={8}>
                <Statistic title={t('taskHistory.duration')} value={formatDuration(statsTask.startTime, statsTask.endTime)} />
              </Col>
              <Col span={8}>
                <Statistic title={t('taskHistory.callRate')} value={statsTask.config.rate} suffix="calls/s" />
              </Col>
            </Row>
            <ReactECharts option={getStatsChartOption()} style={{ height: 300 }} />
          </>
        ) : (
          <Text type="secondary">{t('taskHistory.noStats')}</Text>
        )}
      </Modal>
    </div>
  );
};

export default TaskHistoryPage;
