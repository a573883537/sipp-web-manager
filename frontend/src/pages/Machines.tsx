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
 * 职责：显示和管理所有从机节点
 */
const Machines: React.FC = () => {
  const [machines, setMachines] = useState<MachineInfo[]>([]);
  const [loading, setLoading] = useState(false);
  const [healthChecking, setHealthChecking] = useState<Record<string, boolean>>({});

  /**
   * 加载从机列表
   */
  const loadMachines = async () => {
    setLoading(true);
    try {
      const response = await apiService.getMachines();
      if (response.success && response.machines) {
        setMachines(response.machines);
      }
    } catch (error: any) {
      message.error(`加载从机列表失败: ${error.message}`);
    } finally {
      setLoading(false);
    }
  };

  /**
   * 健康检查
   */
  const handleHealthCheck = async (machineId: string) => {
    setHealthChecking(prev => ({ ...prev, [machineId]: true }));
    try {
      const response = await apiService.checkMachineHealth(machineId);
      if (response.success) {
        message.success(
          response.healthy
            ? `从机 ${machineId} 健康检查通过`
            : `从机 ${machineId} 健康检查失败`
        );
        // 重新加载列表以获取最新状态
        await loadMachines();
      }
    } catch (error: any) {
      message.error(`健康检查失败: ${error.message}`);
    } finally {
      setHealthChecking(prev => ({ ...prev, [machineId]: false }));
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
    return <Tag color={color} icon={icon}>{text}</Tag>;
  };

  /**
   * 格式化心跳时间
   */
  const formatHeartbeat = (timestamp: number) => {
    const now = Date.now();
    const diff = now - timestamp;

    if (diff < 30000) {
      // 30秒内
      return <Text type="success">刚刚</Text>;
    } else if (diff < 60000) {
      // 1分钟内
      return <Text type="warning">{dayjs(timestamp).fromNow()}</Text>;
    } else {
      // 超过1分钟
      return <Text type="danger">{dayjs(timestamp).fromNow()}</Text>;
    }
  };

  /**
   * 表格列配置
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
      render: (_: any, record) => (
        <Text code>{`${record.ipAddress}:${record.apiPort}`}</Text>
      ),
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
      dataIndex: 'runningTasks',
      key: 'runningTasks',
      width: 100,
      render: (count: number) => (
        <Text strong style={{ color: count > 0 ? '#1890ff' : undefined }}>
          {count}
        </Text>
      ),
      sorter: (a, b) => a.runningTasks - b.runningTasks,
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
      render: (version?: string) => (
        <Text type="secondary">{version || '-'}</Text>
      ),
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
    const online = machines.filter(m => m.status === 'online').length;
    const offline = machines.filter(m => m.status === 'offline').length;
    const totalRunningTasks = machines.reduce((sum, m) => sum + m.runningTasks, 0);
    const avgCpu = machines.length > 0
      ? machines.reduce((sum, m) => sum + (m.cpuUsage || 0), 0) / machines.length
      : 0;
    const avgMemory = machines.length > 0
      ? machines.reduce((sum, m) => sum + (m.memoryUsage || 0), 0) / machines.length
      : 0;

    return { online, offline, totalRunningTasks, avgCpu, avgMemory };
  }, [machines]);

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
            <Statistic
              title="总节点数"
              value={machines.length}
              prefix={<ApiOutlined />}
            />
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

      {/* 从机列表 */}
      <Card
        title="从机列表"
        extra={
          <Button
            type="primary"
            icon={<ReloadOutlined />}
            onClick={loadMachines}
            loading={loading}
          >
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
