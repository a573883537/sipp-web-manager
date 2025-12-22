import React, { useState, useEffect } from 'react';
import {
  Card,
  Table,
  Tag,
  Button,
  Space,
  Tooltip,
  message,
  Progress,
  Typography,
  Statistic,
  Row,
  Col,
} from 'antd';
import {
  ReloadOutlined,
  CheckCircleOutlined,
  CloseCircleOutlined,
  ClockCircleOutlined,
  ApiOutlined,
  PlayCircleOutlined,
} from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import { apiService } from '@/services/api';
import type { MachineInfo } from '@/types';
import dayjs from 'dayjs';
import relativeTime from 'dayjs/plugin/relativeTime';
import 'dayjs/locale/zh-cn';

dayjs.extend(relativeTime);
dayjs.locale('zh-cn');

const { Text } = Typography;

/**
 * 从机管理页面
 * 显示所有节点（包括主机）及其正在运行的任务
 */
const Machines: React.FC = () => {
  const [machines, setMachines] = useState<MachineInfo[]>([]);
  const [runningTasksByMachine, setRunningTasksByMachine] = useState<Record<string, any[]>>({});
  const [loading, setLoading] = useState(false);
  const [healthChecking, setHealthChecking] = useState<Record<string, boolean>>({});

  /**
   * 加载机器列表和正在运行的任务
   */
  const loadMachines = async () => {
    setLoading(true);
    try {
      const [machinesResponse, tasksResponse] = await Promise.all([
        apiService.getMachines(),
        apiService.getRunningTasksByMachine(),
      ]);

      if (machinesResponse.success && machinesResponse.machines) {
        setMachines(machinesResponse.machines);
      }

      if (tasksResponse.success && tasksResponse.tasksByMachine) {
        setRunningTasksByMachine(tasksResponse.tasksByMachine);
      }
    } catch (error: any) {
      message.error(`加载数据失败: ${error.message}`);
    } finally {
      setLoading(false);
    }
  };

  /**
   * 健康检查
   */
  const handleHealthCheck = async (machineId: string) => {
    setHealthChecking((prev) => ({ ...prev, [machineId]: true }));
    try {
      const response = await apiService.checkMachineHealth(machineId);
      if (response.success) {
        message.success(
          response.healthy
            ? `机器 ${machineId} 健康检查通过`
            : `机器 ${machineId} 健康检查失败`
        );
        await loadMachines();
      }
    } catch (error: any) {
      message.error(`健康检查失败: ${error.message}`);
    } finally {
      setHealthChecking((prev) => ({ ...prev, [machineId]: false }));
    }
  };

  /**
   * 获取状态标签
   */
  const getStatusTag = (status: string) => {
    const config = {
      online: { color: 'success', icon: <CheckCircleOutlined />, text: '在线' },
      offline: { color: 'default', icon: <CloseCircleOutlined />, text: '离线' },
      busy: { color: 'warning', icon: <ClockCircleOutlined />, text: '繁忙' },
    };
    const { color, icon, text } = config[status as keyof typeof config] || config.offline;
    return (
      <Tag color={color} icon={icon}>
        {text}
      </Tag>
    );
  };

  /**
   * 格式化心跳时间
   */
  const formatHeartbeat = (timestamp: number) => {
    const now = Date.now();
    const diff = now - timestamp;

    if (diff < 30000) {
      return <Text type="success">刚刚</Text>;
    } else if (diff < 60000) {
      return <Text type="warning">{dayjs(timestamp).fromNow()}</Text>;
    } else {
      return <Text type="danger">{dayjs(timestamp).fromNow()}</Text>;
    }
  };

  /**
   * 格式化持续时间
   */
  const formatDuration = (startTime: number): string => {
    const duration = Date.now() - startTime;
    const seconds = Math.floor(duration / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);

    if (hours > 0) {
      return `${hours}h ${minutes % 60}m`;
    } else if (minutes > 0) {
      return `${minutes}m`;
    } else {
      return `${seconds}s`;
    }
  };

  /**
   * 正在运行的任务列配置（展开行）
   */
  const runningTaskColumns: ColumnsType<any> = [
    {
      title: '场景名称',
      dataIndex: 'scenario_name',
      key: 'scenario_name',
      width: 200,
      render: (name: string, record) => (
        <Space direction="vertical" size={0}>
          <Text strong>{name}</Text>
          <Text type="secondary" style={{ fontSize: '12px' }}>
            {record.scenario_file}
          </Text>
        </Space>
      ),
    },
    {
      title: '测试配置',
      key: 'config',
      width: 220,
      render: (_: any, record) => {
        const config = record.config;
        return (
          <Space direction="vertical" size={0}>
            <Text style={{ fontSize: '12px' }}>
              <ClockCircleOutlined /> 速率: {config.rate} calls/s
            </Text>
            <Text style={{ fontSize: '12px' }}>
              用户数: {config.users} | 限制: {config.limit || '∞'}
            </Text>
            <Text style={{ fontSize: '12px' }}>
              目标: {config.remoteHost}:{config.remotePort}
            </Text>
          </Space>
        );
      },
    },
    {
      title: '统计数据',
      key: 'stats',
      width: 180,
      render: (_: any, record) => {
        if (!record.stats) {
          return <Text type="secondary">等待数据...</Text>;
        }
        const { totalCalls, successCalls, failedCalls, successRate } = record.stats;
        return (
          <Space direction="vertical" size={0}>
            <Text style={{ fontSize: '12px' }}>总呼叫: {totalCalls}</Text>
            <Text style={{ fontSize: '12px', color: '#52c41a' }}>成功: {successCalls}</Text>
            <Text style={{ fontSize: '12px', color: '#ff4d4f' }}>失败: {failedCalls}</Text>
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
      dataIndex: 'start_time',
      key: 'start_time',
      width: 150,
      render: (timestamp: number) => (
        <Space direction="vertical" size={0}>
          <Text style={{ fontSize: '12px' }}>
            {new Date(timestamp).toLocaleTimeString()}
          </Text>
          <Text type="secondary" style={{ fontSize: '12px' }}>
            已运行: {formatDuration(timestamp)}
          </Text>
        </Space>
      ),
    },
  ];

  /**
   * 展开行渲染函数
   */
  const expandedRowRender = (record: MachineInfo) => {
    const tasks = runningTasksByMachine[record.id] || [];

    if (tasks.length === 0) {
      return (
        <div style={{ padding: '16px', textAlign: 'center' }}>
          <Text type="secondary">当前没有正在运行的任务</Text>
        </div>
      );
    }

    return (
      <Table
        columns={runningTaskColumns}
        dataSource={tasks}
        rowKey="id"
        size="small"
        pagination={false}
        style={{ marginLeft: '48px' }}
      />
    );
  };

  /**
   * 主表格列配置
   */
  const columns: ColumnsType<MachineInfo> = [
    {
      title: '机器ID',
      dataIndex: 'id',
      key: 'id',
      width: 150,
      fixed: 'left',
      render: (id: string, record) => (
        <Space>
          <Text strong>{id}</Text>
          {record.role === 'master' && <Tag color="blue">主机</Tag>}
        </Space>
      ),
    },
    {
      title: '名称',
      dataIndex: 'name',
      key: 'name',
      width: 150,
    },
    {
      title: '地址',
      key: 'address',
      width: 180,
      render: (_: any, record) => <Text code>{`${record.ipAddress}:${record.apiPort}`}</Text>,
    },
    {
      title: '状态',
      dataIndex: 'status',
      key: 'status',
      width: 100,
      render: (status: string) => getStatusTag(status),
      filters: [
        { text: '在线', value: 'online' },
        { text: '离线', value: 'offline' },
        { text: '繁忙', value: 'busy' },
      ],
      onFilter: (value, record) => record.status === value,
    },
    {
      title: 'CPU',
      dataIndex: 'cpuUsage',
      key: 'cpuUsage',
      width: 120,
      render: (usage?: number) => {
        if (usage === undefined || usage === null) return <Text type="secondary">-</Text>;
        const percent = Math.round(usage * 100) / 100;
        const status = percent > 80 ? 'exception' : percent > 60 ? 'normal' : 'success';
        return <Progress percent={percent} size="small" status={status} />;
      },
      sorter: (a, b) => (a.cpuUsage || 0) - (b.cpuUsage || 0),
    },
    {
      title: '内存',
      dataIndex: 'memoryUsage',
      key: 'memoryUsage',
      width: 120,
      render: (usage?: number) => {
        if (usage === undefined || usage === null) return <Text type="secondary">-</Text>;
        const percent = Math.round(usage * 100) / 100;
        const status = percent > 80 ? 'exception' : percent > 60 ? 'normal' : 'success';
        return <Progress percent={percent} size="small" status={status} />;
      },
      sorter: (a, b) => (a.memoryUsage || 0) - (b.memoryUsage || 0),
    },
    {
      title: '运行任务',
      key: 'runningTasks',
      width: 100,
      render: (_: any, record: MachineInfo) => {
        const actualCount = (runningTasksByMachine[record.id] || []).length;
        return (
          <Space>
            <PlayCircleOutlined style={{ color: actualCount > 0 ? '#1890ff' : undefined }} />
            <Text strong style={{ color: actualCount > 0 ? '#1890ff' : undefined }}>
              {actualCount}
            </Text>
          </Space>
        );
      },
      sorter: (a, b) => {
        const countA = (runningTasksByMachine[a.id] || []).length;
        const countB = (runningTasksByMachine[b.id] || []).length;
        return countA - countB;
      },
    },
    {
      title: '总任务数',
      dataIndex: 'totalTasks',
      key: 'totalTasks',
      width: 100,
      render: (count: number) => <Text>{count}</Text>,
      sorter: (a, b) => a.totalTasks - b.totalTasks,
    },
    {
      title: 'SIPp版本',
      dataIndex: 'sippVersion',
      key: 'sippVersion',
      width: 120,
      render: (version?: string) => <Text type="secondary">{version || '-'}</Text>,
    },
    {
      title: '最后心跳',
      dataIndex: 'lastHeartbeat',
      key: 'lastHeartbeat',
      width: 120,
      render: (timestamp: number) => formatHeartbeat(timestamp),
      sorter: (a, b) => b.lastHeartbeat - a.lastHeartbeat,
    },
    {
      title: '操作',
      key: 'actions',
      width: 120,
      fixed: 'right',
      render: (_: any, record) => (
        <Space>
          <Tooltip title="健康检查">
            <Button
              type="link"
              icon={<ApiOutlined />}
              size="small"
              loading={healthChecking[record.id]}
              onClick={() => handleHealthCheck(record.id)}
            >
              检查
            </Button>
          </Tooltip>
        </Space>
      ),
    },
  ];

  /**
   * 统计数据
   */
  const statistics = React.useMemo(() => {
    const online = machines.filter((m) => m.status === 'online').length;
    const offline = machines.filter((m) => m.status === 'offline').length;
    const totalRunningTasks = Object.values(runningTasksByMachine).reduce(
      (sum, tasks) => sum + tasks.length,
      0
    );
    const avgCpu =
      machines.length > 0
        ? machines.reduce((sum, m) => sum + (m.cpuUsage || 0), 0) / machines.length
        : 0;
    const avgMemory =
      machines.length > 0
        ? machines.reduce((sum, m) => sum + (m.memoryUsage || 0), 0) / machines.length
        : 0;

    return { online, offline, totalRunningTasks, avgCpu, avgMemory };
  }, [machines, runningTasksByMachine]);

  /**
   * 初始化加载
   */
  useEffect(() => {
    loadMachines();

    // 自动刷新（每10秒）
    const interval = setInterval(() => {
      loadMachines();
    }, 10000);

    return () => clearInterval(interval);
  }, []);

  return (
    <div style={{ padding: '24px' }}>
      {/* 统计卡片 */}
      <Row gutter={16} style={{ marginBottom: '16px' }}>
        <Col span={6}>
          <Card>
            <Statistic title="总节点数" value={machines.length} prefix={<ApiOutlined />} />
          </Card>
        </Col>
        <Col span={6}>
          <Card>
            <Statistic
              title="在线节点"
              value={statistics.online}
              valueStyle={{ color: '#3f8600' }}
              prefix={<CheckCircleOutlined />}
            />
          </Card>
        </Col>
        <Col span={6}>
          <Card>
            <Statistic
              title="运行任务"
              value={statistics.totalRunningTasks}
              valueStyle={{ color: '#1890ff' }}
              prefix={<PlayCircleOutlined />}
            />
          </Card>
        </Col>
        <Col span={6}>
          <Card>
            <Statistic
              title="平均负载"
              value={`${statistics.avgCpu.toFixed(1)}% / ${statistics.avgMemory.toFixed(1)}%`}
              prefix="CPU/MEM"
            />
          </Card>
        </Col>
      </Row>

      {/* 机器列表（包括主机和从机） */}
      <Card
        title={
          <Space>
            <ApiOutlined />
            <span>节点列表（主机 + 从机）</span>
          </Space>
        }
        extra={
          <Button type="primary" icon={<ReloadOutlined />} onClick={loadMachines} loading={loading}>
            刷新
          </Button>
        }
      >
        <Table
          columns={columns}
          dataSource={machines}
          rowKey="id"
          loading={loading}
          scroll={{ x: 1400 }}
          expandable={{
            expandedRowRender,
            rowExpandable: (record) => (runningTasksByMachine[record.id] || []).length > 0,
          }}
          pagination={{
            showSizeChanger: true,
            showTotal: (total) => `共 ${total} 台机器`,
            defaultPageSize: 20,
          }}
        />
      </Card>
    </div>
  );
};

export default Machines;
