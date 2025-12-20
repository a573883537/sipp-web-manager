import React from 'react';
import { Card, Table, Tag, Space, Typography, Tooltip, Progress } from 'antd';
import {
  PlayCircleOutlined,
  CheckCircleOutlined,
  CloseCircleOutlined,
  StopOutlined,
  ClockCircleOutlined,
} from '@ant-design/icons';
import { useAppStore } from '@/stores/useAppStore';
import { TestTaskStatus, type TestTask } from '@/types';
import type { ColumnsType } from 'antd/es/table';

const { Text } = Typography;

/**
 * 任务历史组件
 * 显示测试任务的历史记录
 */
const TaskHistory: React.FC = () => {
  const { tasks, currentTask } = useAppStore();

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
   * 表格列配置
   */
  const columns: ColumnsType<TestTask> = [
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

  return (
    <Card
      title="测试任务历史"
      extra={
        currentTask && (
          <Space>
            <Tag color="processing">当前运行: {currentTask.scenarioName}</Tag>
          </Space>
        )
      }
    >
      <Table
        columns={columns}
        dataSource={tasks}
        rowKey="id"
        size="small"
        pagination={{
          pageSize: 10,
          showSizeChanger: true,
          showTotal: (total) => `共 ${total} 条记录`,
        }}
        locale={{
          emptyText: '暂无测试任务记录',
        }}
      />
    </Card>
  );
};

export default TaskHistory;
