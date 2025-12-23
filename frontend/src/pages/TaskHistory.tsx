import React, { useState, useEffect } from 'react';
import {
  Card,
  Table,
  Tag,
  Space,
  Typography,
  Tooltip,
  Progress,
  Button,
  Modal,
  message,
  Spin,
  Popconfirm,
  Statistic,
  Row,
  Col,
  Dropdown,
} from 'antd';
import {
  CheckCircleOutlined,
  CloseCircleOutlined,
  StopOutlined,
  ClockCircleOutlined,
  ReloadOutlined,
  DeleteOutlined,
  BarChartOutlined,
  DownloadOutlined,
} from '@ant-design/icons';
import ReactECharts from 'echarts-for-react';
import { useAppStore } from '@/stores/useAppStore';
import { TestTaskStatus, type TestTask } from '@/types';
import { apiService } from '@/services/api';
import type { ColumnsType } from 'antd/es/table';

const { Text } = Typography;

/**
 * 任务历史页面
 * 显示已完成的测试任务记录（正在运行的任务已移至从机管理页面）
 */
const TaskHistoryPage: React.FC = () => {
  const { tasks, setTasks } = useAppStore();
  const [loading, setLoading] = useState(false);
  const [deleteLoading, setDeleteLoading] = useState<string | null>(null);
  const [selectedRowKeys, setSelectedRowKeys] = useState<React.Key[]>([]);
  const [batchDeleteLoading, setBatchDeleteLoading] = useState(false);
  const [statsModalVisible, setStatsModalVisible] = useState(false);
  const [statsTask, setStatsTask] = useState<TestTask | null>(null);

  /**
   * 加载任务历史（仅已完成的任务）
   */
  const loadTaskHistory = async (showMessage = false) => {
    setLoading(true);
    try {
      const response = await apiService.getTaskHistory();

      if (response.success && response.tasks) {
        const dbTasks: TestTask[] = response.tasks.map((task: any) => {
          const status = (task.status?.toLowerCase() || 'failed') as TestTaskStatus;

          return {
            id: task.id,
            scenarioName: task.scenario_name,
            scenarioFile: task.scenario_file,
            status,
            config: task.config,
            stats: task.stats,
            machineId: task.machine_id || 'unknown',
            startTime: task.start_time,
            endTime: task.end_time || Date.now(),
            error: task.error,
          };
        });

        setTasks(dbTasks);

        if (showMessage) {
          message.success(`已加载 ${dbTasks.length} 条任务历史`);
        }
      }
    } catch (error: any) {
      message.error(`${"加载任务历史失败"}: ${error.message}`);
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
      [TestTaskStatus.COMPLETED]: {
        color: 'success',
        icon: <CheckCircleOutlined />,
        text: "已完成",
      },
      [TestTaskStatus.FAILED]: {
        color: 'error',
        icon: <CloseCircleOutlined />,
        text: "失败",
      },
      [TestTaskStatus.STOPPED]: {
        color: 'default',
        icon: <StopOutlined />,
        text: "已停止",
      },
    };

    const config = statusConfig[status as keyof typeof statusConfig];
    if (!config) {
      return <Tag color="default">{status || '未知'}</Tag>;
    }
    return (
      <Tag color={config.color} icon={config.icon}>
        {config.text}
      </Tag>
    );
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
      series: [
        {
          type: 'pie',
          radius: ['40%', '70%'],
          label: { show: true, formatter: '{b}: {c}' },
          data: [
            {
              value: successCalls,
              name: "成功",
              itemStyle: { color: '#52c41a' },
            },
            {
              value: failedCalls,
              name: "失败",
              itemStyle: { color: '#ff4d4f' },
            },
          ],
        },
      ],
    };
  };

  /**
   * 删除任务
   */
  const handleDeleteTask = async (taskId: string) => {
    try {
      setDeleteLoading(taskId);
      await apiService.deleteTaskHistory(taskId);
      message.success("任务已删除");
      await loadTaskHistory();
    } catch (error: any) {
      message.error(`${"删除任务失败"}: ${error.message}`);
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
      title: "确认批量删除",
      content: `确定要删除选中的 ${selectedRowKeys.length} 个任务吗？`,
      okText: "删除",
      okType: 'danger',
      cancelText: "取消",
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
            message.warning(
              `删除完成：成功 ${successCount} 个，失败 ${failCount} 个`
            );
          }

          setSelectedRowKeys([]);
          await loadTaskHistory();
        } catch (error: any) {
          message.error(`${"批量删除失败"}: ${error.message}`);
        } finally {
          setBatchDeleteLoading(false);
        }
      },
    });
  };

  /**
   * 下载任务日志
   * 直接触发下载，由后端 download-remote 接口自动路由到正确节点
   */
  const handleDownloadTaskLogs = async (taskId: string) => {
    try {
      // 直接触发下载，不再预先检查文件（download-remote 会自动处理）
      apiService.downloadTaskLogs(taskId);
      message.success("开始下载");
    } catch (error: any) {
      message.error(`${"失败"}: ${error.message}`);
    }
  };

  /**
   * 表格列配置
   */
  const columns: ColumnsType<TestTask> = [
    {
      title: "场景名称",
      dataIndex: 'scenarioName',
      key: 'scenarioName',
      width: 180,
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
      title: '执行机器',
      dataIndex: 'machineId',
      key: 'machineId',
      width: 120,
      render: (machineId: string) => (
        <Tag color={machineId === 'master' ? 'blue' : 'default'}>{machineId}</Tag>
      ),
      filters: [
        { text: '主机', value: 'master' },
        { text: '从机', value: 'slave' },
      ],
      onFilter: (value, record) =>
        value === 'master' ? record.machineId === 'master' : (record.machineId?.startsWith('slave') ?? false),
    },
    {
      title: "状态",
      dataIndex: 'status',
      key: 'status',
      width: 100,
      render: (status: TestTaskStatus) => getStatusTag(status),
      filters: [
        { text: "已完成", value: TestTaskStatus.COMPLETED },
        { text: "失败", value: TestTaskStatus.FAILED },
        { text: "已停止", value: TestTaskStatus.STOPPED },
      ],
      onFilter: (value, record) => record.status === value,
    },
    {
      title: "测试配置",
      key: 'config',
      width: 220,
      render: (_: any, record: TestTask) => (
        <Space direction="vertical" size={0}>
          <Text style={{ fontSize: '12px' }}>
            <ClockCircleOutlined /> {"呼叫速率"}: {record.config.rate} calls/s
          </Text>
          <Text style={{ fontSize: '12px' }}>
            {"最大并发"}: {record.config.users} | {"呼叫限制"}:{' '}
            {record.config.limit || '∞'}
          </Text>
          <Text style={{ fontSize: '12px' }}>
            {record.config.remoteHost}:{record.config.remotePort} (
            {record.config.transport.toUpperCase()})
          </Text>
        </Space>
      ),
    },
    {
      title: "统计数据",
      key: 'stats',
      width: 180,
      render: (_: any, record: TestTask) => {
        if (!record.stats) {
          return <Text type="secondary">-</Text>;
        }

        const { totalCalls, successCalls, failedCalls, successRate } = record.stats;
        return (
          <Tooltip title={"点击查看详情"}>
            <div onClick={() => viewStats(record)} style={{ cursor: 'pointer' }}>
              <Space direction="vertical" size={4} style={{ width: '100%' }}>
                <div>
                  <Text style={{ fontSize: '12px' }}>
                    {"总呼叫"}: {totalCalls}
                  </Text>
                </div>
                <div>
                  <Text style={{ fontSize: '12px', color: '#52c41a' }}>
                    {"成功"}: {successCalls}
                  </Text>
                  <Text style={{ fontSize: '12px', color: '#ff4d4f', marginLeft: 8 }}>
                    {"失败"}: {failedCalls}
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
      title: "时间",
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
          <Text style={{ fontSize: '12px' }} type="secondary">
            持续: {formatDuration(record.startTime, record.endTime)}
          </Text>
        </Space>
      ),
      sorter: (a, b) => b.startTime - a.startTime,
    },
    {
      title: "备注",
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
      title: "操作",
      key: 'action',
      width: 150,
      fixed: 'right',
      render: (_: any, record: TestTask) => (
        <Space>
          <Tooltip title={"下载日志"}>
            <Button
              size="small"
              icon={<DownloadOutlined />}
              onClick={() => handleDownloadTaskLogs(record.id)}
            >
              {"日志"}
            </Button>
          </Tooltip>
          <Popconfirm
            title={"确认删除"}
            description={`确定要删除任务 "${record.scenarioName}" 吗？`}
            onConfirm={() => handleDeleteTask(record.id)}
            okText={"删除"}
            cancelText={"取消"}
            okButtonProps={{ danger: true }}
          >
            <Button
              danger
              size="small"
              icon={<DeleteOutlined />}
              loading={deleteLoading === record.id}
            >
              {"删除"}
            </Button>
          </Popconfirm>
        </Space>
      ),
    },
  ];

  // 只显示已完成的任务
  const completedTasks = tasks.filter((task) => task.status !== TestTaskStatus.RUNNING);

  return (
    <div style={{ padding: '24px' }}>
      <Card
        title={
          <Space>
            <ClockCircleOutlined />
            <span>{"任务历史"}</span>
            <Text type="secondary" style={{ fontSize: '14px', fontWeight: 'normal' }}>
              (正在运行的任务请查看"从机管理"页面)
            </Text>
          </Space>
        }
        extra={
          <Space>
            <Dropdown
              menu={{
                items: [
                  {
                    key: 'app',
                    label: "下载应用日志",
                    icon: <DownloadOutlined />,
                    onClick: () => {
                      apiService.downloadApplicationLogs('app');
                      message.success("开始下载");
                    },
                  },
                  {
                    key: 'error',
                    label: "下载错误日志",
                    icon: <DownloadOutlined />,
                    onClick: () => {
                      apiService.downloadApplicationLogs('error');
                      message.success("开始下载");
                    },
                  },
                  {
                    key: 'all',
                    label: "下载所有日志",
                    icon: <DownloadOutlined />,
                    onClick: () => {
                      apiService.downloadApplicationLogs('all');
                      message.success("开始下载");
                    },
                  },
                ],
              }}
            >
              <Button icon={<DownloadOutlined />}>{"系统日志"}</Button>
            </Dropdown>
            {selectedRowKeys.length > 0 && (
              <Button
                danger
                icon={<DeleteOutlined />}
                onClick={handleBatchDelete}
                loading={batchDeleteLoading}
              >
                {"批量删除"} ({selectedRowKeys.length})
              </Button>
            )}
            <Button icon={<ReloadOutlined />} onClick={() => loadTaskHistory(true)} loading={loading}>
              {"刷新"}
            </Button>
          </Space>
        }
      >
        <Spin spinning={loading} tip={"加载中..."}>
          <Table
            columns={columns}
            dataSource={completedTasks}
            rowKey="id"
            size="small"
            scroll={{ x: 1400 }}
            rowSelection={{
              selectedRowKeys,
              onChange: setSelectedRowKeys,
            }}
            pagination={{
              pageSize: 10,
              showSizeChanger: true,
              showTotal: (total) => `共 ${total} 条任务记录`,
            }}
            locale={{
              emptyText: "暂无历史记录",
            }}
          />
        </Spin>
      </Card>

      {/* 统计数据弹窗 */}
      <Modal
        title={
          <>
            <BarChartOutlined /> {"统计数据详情"} - {statsTask?.scenarioName}
          </>
        }
        open={statsModalVisible}
        onCancel={() => setStatsModalVisible(false)}
        footer={null}
        width={600}
      >
        {statsTask?.stats ? (
          <>
            <Row gutter={16} style={{ marginBottom: 24 }}>
              <Col span={8}>
                <Statistic
                  title={"总呼叫"}
                  value={statsTask.stats.totalCalls}
                />
              </Col>
              <Col span={8}>
                <Statistic
                  title={"成功"}
                  value={statsTask.stats.successCalls}
                  valueStyle={{ color: '#52c41a' }}
                />
              </Col>
              <Col span={8}>
                <Statistic
                  title={"失败"}
                  value={statsTask.stats.failedCalls}
                  valueStyle={{ color: '#ff4d4f' }}
                />
              </Col>
            </Row>
            <Row gutter={16} style={{ marginBottom: 24 }}>
              <Col span={8}>
                <Statistic
                  title={"成功率"}
                  value={statsTask.stats.successRate}
                  suffix="%"
                  precision={2}
                />
              </Col>
              <Col span={8}>
                <Statistic
                  title={"运行时长"}
                  value={formatDuration(statsTask.startTime, statsTask.endTime)}
                />
              </Col>
              <Col span={8}>
                <Statistic
                  title={"呼叫速率"}
                  value={statsTask.config.rate}
                  suffix="calls/s"
                />
              </Col>
            </Row>
            <ReactECharts option={getStatsChartOption()} style={{ height: 300 }} />
          </>
        ) : (
          <Text type="secondary">{"暂无统计数据"}</Text>
        )}
      </Modal>
    </div>
  );
};

export default TaskHistoryPage;
