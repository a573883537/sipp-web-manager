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
      message.success(`命令 ${command} 已发送`);
      // 刷新进程状态
      await fetchProcessStatus();
    } catch (error: any) {
      message.error(`发送命令失败: ${error.message}`);
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
        label: isPaused ? '恢复测试' : '暂停测试',
        onClick: () => sendCommand(task.id, 'pause'),
      },
      {
        key: 'increaseRate',
        icon: <PlusOutlined />,
        label: `增加速率 (当前: ${currentRate})`,
        onClick: () => sendCommand(task.id, 'increaseRate'),
      },
      {
        key: 'decreaseRate',
        icon: <MinusOutlined />,
        label: `减少速率 (当前: ${currentRate})`,
        onClick: () => sendCommand(task.id, 'decreaseRate'),
      },
      {
        key: 'setRate',
        icon: <ControlOutlined />,
        label: '设置速率...',
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
        label: '优雅停止 (等待完成)',
        onClick: () => sendCommand(task.id, 'quit'),
      },
      { type: 'divider' },
      {
        key: 'dumpScreen',
        icon: <CameraOutlined />,
        label: '截取屏幕',
        onClick: async () => {
          await sendCommand(task.id, 'dumpScreen');
          message.success('截图已生成，点击"查看截图"查看');
        },
      },
      {
        key: 'viewScreen',
        icon: <CameraOutlined />,
        label: '查看截图',
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
      console.log('Screen response:', response);
      if (response.success && response.content) {
        setScreenContent(response.content);
        setScreenTime(new Date().toLocaleString());
        setScreenModalVisible(true);
      } else {
        message.warning('暂无屏幕截图');
      }
    } catch (error: any) {
      message.error(`获取截图失败: ${error.message}`);
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
          { value: successCalls, name: '成功', itemStyle: { color: '#52c41a' } },
          { value: failedCalls, name: '失败', itemStyle: { color: '#ff4d4f' } },
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

          // 如果数据库显示运行中，但实际进程不存在，则标记为失败
          if (status === TestTaskStatus.RUNNING && !runningTaskIds.has(task.id)) {
            status = TestTaskStatus.FAILED;
            // 异步更新数据库
            apiService.updateTaskHistory(task.id, {
              status: 'FAILED',
              end_time: Date.now(),
              error: '进程异常终止',
            }).catch(console.error);
          }

          return {
            id: task.id,
            scenarioName: task.scenario_name,
            scenarioFile: task.scenario_file,
            status,
            config: task.config,
            stats: task.stats,
            startTime: task.start_time,
            endTime: task.end_time || (status !== TestTaskStatus.RUNNING ? Date.now() : undefined),
            error: task.error || (status === TestTaskStatus.FAILED && !task.error ? '进程异常终止' : undefined),
          };
        });

        // 完全替换 store 中的任务列表
        setTasks(dbTasks);
        if (showMessage) {
          message.success(`已加载 ${dbTasks.length} 条任务历史`);
        }
      }
    } catch (error: any) {
      message.error(`加载任务历史失败: ${error.message}`);
    } finally {
      setLoading(false);
    }
  };

  /**
   * 更新运行中任务的实时统计
   */
  const updateRunningTasksStats = async () => {
    const runningTasks = tasks.filter(t => t.status === TestTaskStatus.RUNNING);
    for (const task of runningTasks) {
      try {
        const response = await apiService.getTaskStats(task.id);
        if (response.success && response.stats) {
          updateTask(task.id, { stats: response.stats });
        }
      } catch (error) {
        // 忽略错误
      }
    }
  };

  /**
   * 组件挂载时加载任务历史
   */
  useEffect(() => {
    loadTaskHistory();
    fetchProcessStatus();

    // 定时更新运行中任务的统计数据
    const statsInterval = setInterval(updateRunningTasksStats, 3000);
    return () => clearInterval(statsInterval);
  }, []);

  /**
   * 格式化持续时间
   */
  const formatDuration = (startTime: number, endTime?: number): string => {
    const duration = (endTime || Date.now()) - startTime;
    const seconds = Math.floor(duration / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);

    if (hours > 0) {
      return `${hours}小时${minutes % 60}分钟`;
    } else if (minutes > 0) {
      return `${minutes}分钟${seconds % 60}秒`;
    } else {
      return `${seconds}秒`;
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
        text: '运行中',
      },
      [TestTaskStatus.COMPLETED]: {
        color: 'success',
        icon: <CheckCircleOutlined />,
        text: '已完成',
      },
      [TestTaskStatus.FAILED]: {
        color: 'error',
        icon: <CloseCircleOutlined />,
        text: '失败',
      },
      [TestTaskStatus.STOPPED]: {
        color: 'default',
        icon: <StopOutlined />,
        text: '已停止',
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
      title: '确认停止',
      content: `确定要停止任务 "${task.scenarioName}" 吗？`,
      okText: '停止',
      okType: 'danger',
      cancelText: '取消',
      onOk: async () => {
        try {
          setStopLoading(task.id);
          await apiService.stopSippTest(task.id, false);
          message.success('任务已停止');
          updateTask(task.id, {
            status: TestTaskStatus.STOPPED,
            endTime: Date.now(),
          });
        } catch (error: any) {
          message.error(`停止任务失败: ${error.message}`);
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
      message.success('任务已删除');
      await loadTaskHistory();
    } catch (error: any) {
      message.error(`删除任务失败: ${error.message}`);
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
      title: '确认批量删除',
      content: `确定要删除选中的 ${selectedRowKeys.length} 个任务吗？`,
      okText: '删除',
      okType: 'danger',
      cancelText: '取消',
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
            message.success(`成功删除 ${successCount} 个任务`);
          } else {
            message.warning(`删除完成：成功 ${successCount} 个，失败 ${failCount} 个`);
          }

          setSelectedRowKeys([]);
          await loadTaskHistory();
        } catch (error: any) {
          message.error(`批量删除失败: ${error.message}`);
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
      title: '场景名称',
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
      title: '测试配置',
      key: 'config',
      width: 250,
      render: (_: any, record: TestTask) => (
        <Space direction="vertical" size={0}>
          <Text style={{ fontSize: '12px' }}>
            <ClockCircleOutlined /> 速率: {record.config.rate} calls/s
          </Text>
          <Text style={{ fontSize: '12px' }}>
            并发: {record.config.users} | 限制: {record.config.limit || '无限'}
          </Text>
          <Text style={{ fontSize: '12px' }}>
            目标: {record.config.remoteHost}:{record.config.remotePort}
          </Text>
          <Text style={{ fontSize: '12px' }}>
            协议: {record.config.transport.toUpperCase()}
          </Text>
        </Space>
      ),
    },
    {
      title: '统计数据',
      key: 'stats',
      width: 180,
      render: (_: any, record: TestTask) => {
        if (!record.stats) {
          return <Text type="secondary">-</Text>;
        }

        const { totalCalls, successCalls, failedCalls, successRate } = record.stats;
        return (
          <Tooltip title="点击查看详情">
            <div onClick={() => viewStats(record)} style={{ cursor: 'pointer' }}>
              <Space direction="vertical" size={4} style={{ width: '100%' }}>
                <div>
                  <Text style={{ fontSize: '12px' }}>
                    总呼叫: {totalCalls}
                  </Text>
                </div>
                <div>
                  <Text style={{ fontSize: '12px', color: '#52c41a' }}>
                    成功: {successCalls}
                  </Text>
                  <Text style={{ fontSize: '12px', color: '#ff4d4f', marginLeft: 8 }}>
                    失败: {failedCalls}
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
      title: '开始时间',
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
      title: '运行时长',
      key: 'duration',
      width: 120,
      render: (_: any, record: TestTask) => (
        <Text style={{ fontSize: '12px' }}>
          {formatDuration(record.startTime)}
        </Text>
      ),
    },
    {
      title: '操作',
      key: 'action',
      width: 180,
      render: (_: any, record: TestTask) => (
        <Space>
          <Dropdown
            menu={{ items: getControlMenuItems(record) }}
            trigger={['click']}
          >
            <Button
              size="small"
              icon={<ControlOutlined />}
              loading={commandLoading === record.id}
            >
              控制
            </Button>
          </Dropdown>
          <Button
            danger
            size="small"
            icon={<StopOutlined />}
            loading={stopLoading === record.id}
            onClick={() => handleStopTask(record)}
          >
            停止
          </Button>
        </Space>
      ),
    },
  ];

  /**
   * 表格列配置（已完成）
   */
  const completedColumns: ColumnsType<TestTask> = [
    {
      title: '场景名称',
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
      title: '状态',
      dataIndex: 'status',
      key: 'status',
      width: 100,
      render: (status: TestTaskStatus) => getStatusTag(status),
    },
    {
      title: '测试配置',
      key: 'config',
      width: 250,
      render: (_: any, record: TestTask) => (
        <Space direction="vertical" size={0}>
          <Text style={{ fontSize: '12px' }}>
            <ClockCircleOutlined /> 速率: {record.config.rate} calls/s
          </Text>
          <Text style={{ fontSize: '12px' }}>
            并发: {record.config.users} | 限制: {record.config.limit || '无限'}
          </Text>
          <Text style={{ fontSize: '12px' }}>
            目标: {record.config.remoteHost}:{record.config.remotePort}
          </Text>
          <Text style={{ fontSize: '12px' }}>
            协议: {record.config.transport.toUpperCase()}
          </Text>
        </Space>
      ),
    },
    {
      title: '统计数据',
      key: 'stats',
      width: 180,
      render: (_: any, record: TestTask) => {
        if (!record.stats) {
          return <Text type="secondary">-</Text>;
        }

        const { totalCalls, successCalls, failedCalls, successRate } = record.stats;
        return (
          <Tooltip title="点击查看详情">
            <div onClick={() => viewStats(record)} style={{ cursor: 'pointer' }}>
              <Space direction="vertical" size={4} style={{ width: '100%' }}>
                <div>
                  <Text style={{ fontSize: '12px' }}>
                    总呼叫: {totalCalls}
                  </Text>
                </div>
                <div>
                  <Text style={{ fontSize: '12px', color: '#52c41a' }}>
                    成功: {successCalls}
                  </Text>
                  <Text style={{ fontSize: '12px', color: '#ff4d4f', marginLeft: 8 }}>
                    失败: {failedCalls}
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
      title: '时间',
      key: 'time',
      width: 180,
      render: (_: any, record: TestTask) => (
        <Space direction="vertical" size={0}>
          <Tooltip title={new Date(record.startTime).toLocaleString()}>
            <Text style={{ fontSize: '12px' }}>
              开始: {new Date(record.startTime).toLocaleTimeString()}
            </Text>
          </Tooltip>
          {record.endTime && (
            <Tooltip title={new Date(record.endTime).toLocaleString()}>
              <Text style={{ fontSize: '12px' }}>
                结束: {new Date(record.endTime).toLocaleTimeString()}
              </Text>
            </Tooltip>
          )}
          <Text style={{ fontSize: '12px' }}>
            持续: {formatDuration(record.startTime, record.endTime)}
          </Text>
        </Space>
      ),
    },
    {
      title: '备注',
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
              注入: {record.config.injectionFile}
            </Text>
          );
        }
        return <Text type="secondary">-</Text>;
      },
    },
    {
      title: '操作',
      key: 'action',
      width: 100,
      render: (_: any, record: TestTask) => (
        <Popconfirm
          title="确认删除"
          description={`确定要删除任务 "${record.scenarioName}" 吗？`}
          onConfirm={() => handleDeleteTask(record.id)}
          okText="删除"
          cancelText="取消"
          okButtonProps={{ danger: true }}
        >
          <Button
            danger
            size="small"
            icon={<DeleteOutlined />}
            loading={deleteLoading === record.id}
          >
            删除
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
            <span>任务历史</span>
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
                批量删除 ({selectedRowKeys.length})
              </Button>
            )}
            <Button
              icon={<ReloadOutlined />}
              onClick={() => loadTaskHistory(true)}
              loading={loading}
            >
              刷新
            </Button>
          </Space>
        }
      >
        <Spin spinning={loading} tip="加载任务历史...">
          <Tabs
            defaultActiveKey="running"
            items={[
              {
                key: 'running',
                label: (
                  <span>
                    <PlayCircleOutlined />
                    正在进行 ({runningTasks.length})
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
                      showTotal: (total) => `共 ${total} 个正在运行的任务`,
                    }}
                    locale={{
                      emptyText: '暂无正在运行的任务',
                    }}
                  />
                ),
              },
              {
                key: 'completed',
                label: (
                  <span>
                    <CheckCircleOutlined />
                    已完成 ({completedTasks.length})
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
                      showTotal: (total) => `共 ${total} 条历史记录`,
                    }}
                    locale={{
                      emptyText: '暂无历史记录',
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
        title="设置呼叫速率"
        open={rateModalVisible}
        onOk={async () => {
          if (rateModalTask) {
            await sendCommand(rateModalTask.id, 'setRate', { rate: newRate });
            setRateModalVisible(false);
          }
        }}
        onCancel={() => setRateModalVisible(false)}
        okText="确定"
        cancelText="取消"
      >
        <Space>
          <Text>新速率 (calls/s):</Text>
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
        title={<><CameraOutlined /> SIPp 屏幕截图 <Text type="secondary" style={{ fontSize: 12 }}>({screenTime})</Text></>}
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
          {screenContent || '暂无内容'}
        </pre>
      </Modal>

      {/* 统计数据弹窗 */}
      <Modal
        title={<><BarChartOutlined /> 统计数据详情 - {statsTask?.scenarioName}</>}
        open={statsModalVisible}
        onCancel={() => setStatsModalVisible(false)}
        footer={null}
        width={600}
      >
        {statsTask?.stats ? (
          <>
            <Row gutter={16} style={{ marginBottom: 24 }}>
              <Col span={8}>
                <Statistic title="总呼叫数" value={statsTask.stats.totalCalls} />
              </Col>
              <Col span={8}>
                <Statistic title="成功" value={statsTask.stats.successCalls} valueStyle={{ color: '#52c41a' }} />
              </Col>
              <Col span={8}>
                <Statistic title="失败" value={statsTask.stats.failedCalls} valueStyle={{ color: '#ff4d4f' }} />
              </Col>
            </Row>
            <Row gutter={16} style={{ marginBottom: 24 }}>
              <Col span={8}>
                <Statistic title="成功率" value={statsTask.stats.successRate} suffix="%" precision={2} />
              </Col>
              <Col span={8}>
                <Statistic title="运行时长" value={formatDuration(statsTask.startTime, statsTask.endTime)} />
              </Col>
              <Col span={8}>
                <Statistic title="呼叫速率" value={statsTask.config.rate} suffix="calls/s" />
              </Col>
            </Row>
            <ReactECharts option={getStatsChartOption()} style={{ height: 300 }} />
          </>
        ) : (
          <Text type="secondary">暂无统计数据</Text>
        )}
      </Modal>
    </div>
  );
};

export default TaskHistoryPage;
