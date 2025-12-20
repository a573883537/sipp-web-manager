import React, { useState, useEffect } from 'react';
import { Card, Tabs, Table, Tag, Space, Typography, Tooltip, Progress, Button, Modal, message, Spin } from 'antd';
import {
  PlayCircleOutlined,
  CheckCircleOutlined,
  CloseCircleOutlined,
  StopOutlined,
  ClockCircleOutlined,
  ReloadOutlined,
} from '@ant-design/icons';
import { useAppStore } from '@/stores/useAppStore';
import { TestTaskStatus, type TestTask } from '@/types';
import { apiService } from '@/services/api';
import type { ColumnsType } from 'antd/es/table';

const { Text } = Typography;

/**
 * 任务历史页面
 * 显示测试任务的历史记录，区分正在进行和已完成的任务
 */
const TaskHistoryPage: React.FC = () => {
  const { tasks, updateTask, addTask } = useAppStore();
  const [stopLoading, setStopLoading] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  /**
   * 从数据库加载任务历史
   */
  const loadTaskHistory = async () => {
    setLoading(true);
    try {
      const response = await apiService.getTaskHistory();
      if (response.success && response.tasks) {
        // 将数据库任务转换为前端 TestTask 格式
        const dbTasks: TestTask[] = response.tasks.map((task: any) => ({
          id: task.id,
          scenarioName: task.scenario_name,
          scenarioFile: task.scenario_file,
          status: task.status as TestTaskStatus,
          config: task.config,
          stats: task.stats,
          startTime: task.start_time,
          endTime: task.end_time,
          error: task.error,
        }));

        // 合并到 store（避免重复）
        const existingIds = new Set(tasks.map(t => t.id));
        dbTasks.forEach(task => {
          if (!existingIds.has(task.id)) {
            addTask(task);
          }
        });

        message.success(`已加载 ${dbTasks.length} 条任务历史`);
      }
    } catch (error: any) {
      message.error(`加载任务历史失败: ${error.message}`);
    } finally {
      setLoading(false);
    }
  };

  /**
   * 组件挂载时加载任务历史
   */
  useEffect(() => {
    loadTaskHistory();
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
          await apiService.stopSippTest(false);
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
      width: 100,
      render: (_: any, record: TestTask) => (
        <Button
          danger
          size="small"
          icon={<StopOutlined />}
          loading={stopLoading === record.id}
          onClick={() => handleStopTask(record)}
        >
          停止
        </Button>
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
  ];

  // 筛选任务
  const runningTasks = tasks.filter(task => task.status === TestTaskStatus.RUNNING);
  const completedTasks = tasks.filter(task =>
    task.status !== TestTaskStatus.RUNNING
  );

  return (
    <div style={{ padding: '24px' }}>
      <Card
        extra={
          <Button
            icon={<ReloadOutlined />}
            onClick={loadTaskHistory}
            loading={loading}
          >
            刷新
          </Button>
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
    </div>
  );
};

export default TaskHistoryPage;
