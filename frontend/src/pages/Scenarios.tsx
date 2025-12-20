import React, { useEffect, useState } from 'react';
import { Card, Table, Button, Space, message, Modal, Form, InputNumber, Input, Select, Tag, Divider, Alert } from 'antd';
import { PlusOutlined, EditOutlined, DeleteOutlined, EyeOutlined, PlayCircleOutlined } from '@ant-design/icons';
import { apiService } from '@/services/api';
import { useAppStore } from '@/stores/useAppStore';
import type { ScenarioFile, Scenario, TestTask } from '@/types';
import { TestTaskStatus } from '@/types';
import ScenarioForm from '@/components/ScenarioForm';

/**
 * 场景管理页面
 * 职责：管理SIPp XML场景文件
 */
const Scenarios: React.FC = () => {
  const { scenarios, setScenarios, addTask, updateTask } = useAppStore();
  const [loading, setLoading] = useState(false);
  const [formVisible, setFormVisible] = useState(false);
  const [editingData, setEditingData] = useState<{ filename: string; scenario: Scenario } | undefined>();

  // 启动测试相关
  const [startTestVisible, setStartTestVisible] = useState(false);
  const [startTestLoading, setStartTestLoading] = useState(false);
  const [selectedScenario, setSelectedScenario] = useState<ScenarioFile | null>(null);
  const [startTestForm] = Form.useForm();

  /**
   * 加载场景列表
   */
  const loadScenarios = async () => {
    setLoading(true);
    try {
      const response = await apiService.listScenarios();
      if (response.success && response.scenarios) {
        setScenarios(response.scenarios);
      }
    } catch (error: any) {
      message.error(`加载场景失败: ${error.message}`);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadScenarios();
  }, []);

  /**
   * 删除场景
   */
  const handleDelete = async (filename: string) => {
    Modal.confirm({
      title: '确认删除',
      content: `确定要删除场景 "${filename}" 吗？`,
      okText: '删除',
      okType: 'danger',
      cancelText: '取消',
      onOk: async () => {
        try {
          await apiService.deleteScenario(filename);
          message.success('删除成功');
          loadScenarios();
        } catch (error: any) {
          message.error(`删除失败: ${error.message}`);
        }
      },
    });
  };

  /**
   * 查看场景详情
   */
  const handleView = async (filename: string) => {
    try {
      const response = await apiService.getScenario(filename);
      if (response.success && response.scenario) {
        Modal.info({
          title: `场景: ${response.scenario.name}`,
          content: (
            <div>
              <p>消息数量: {response.scenario.messages.length}</p>
              <p>变量数量: {response.scenario.variables?.length || 0}</p>
              <pre style={{ maxHeight: '400px', overflow: 'auto' }}>
                {JSON.stringify(response.scenario, null, 2)}
              </pre>
            </div>
          ),
          width: 800,
        });
      }
    } catch (error: any) {
      message.error(`加载场景失败: ${error.message}`);
    }
  };

  /**
   * 打开创建场景对话框
   */
  const handleCreate = () => {
    setEditingData(undefined);
    setFormVisible(true);
  };

  /**
   * 打开编辑场景对话框
   */
  const handleEdit = async (filename: string) => {
    try {
      const response = await apiService.getScenario(filename);
      if (response.success && response.scenario) {
        setEditingData({
          filename: filename.replace('.xml', ''),
          scenario: response.scenario,
        });
        setFormVisible(true);
      }
    } catch (error: any) {
      message.error(`加载场景失败: ${error.message}`);
    }
  };

  /**
   * 提交场景表单
   */
  const handleFormSubmit = async (filename: string, scenario: Scenario) => {
    try {
      await apiService.saveScenario(filename, scenario);
      message.success(editingData ? '场景更新成功' : '场景创建成功');
      setFormVisible(false);
      setEditingData(undefined);
      await loadScenarios();
    } catch (error: any) {
      message.error(`保存场景失败: ${error.message}`);
      throw error;
    }
  };

  /**
   * 取消表单
   */
  const handleFormCancel = () => {
    setFormVisible(false);
    setEditingData(undefined);
  };

  /**
   * 打开启动测试弹窗
   */
  const handleStartTest = (scenario: ScenarioFile) => {
    setSelectedScenario(scenario);
    startTestForm.setFieldsValue({
      scenarioFile: scenario.filename,
      injectionFile: scenario.injection_file || undefined,
      remoteHost: '192.168.21.88',
      remotePort: 5060,
      localPort: 5070,
      rate: 1,
      users: 10,
      limit: 10,
      transport: 'udp',
      minRtpPort: 6000,
      maxRtpPort: 6100,
      enableRtpEcho: true,
      timeout: 120000,
    });
    setStartTestVisible(true);
  };

  /**
   * 提交启动测试
   */
  const handleStartTestSubmit = async () => {
    try {
      const values = await startTestForm.validateFields();
      setStartTestLoading(true);

      // 创建任务记录
      const taskId = `task_${Date.now()}`;
      const task: TestTask = {
        id: taskId,
        scenarioFile: values.scenarioFile,
        scenarioName: selectedScenario?.name || '未知场景',
        status: TestTaskStatus.RUNNING,
        startTime: Date.now(),
        config: {
          rate: values.rate,
          users: values.users,
          limit: values.limit,
          remoteHost: values.remoteHost,
          remotePort: values.remotePort,
          localPort: values.localPort,
          transport: values.transport,
          injectionFile: values.injectionFile,
          minRtpPort: values.minRtpPort,
          maxRtpPort: values.maxRtpPort,
        },
      };

      // 添加到任务列表
      addTask(task);

      // 保存到数据库
      await apiService.createTaskHistory({
        id: task.id,
        scenario_name: task.scenarioName,
        scenario_file: task.scenarioFile,
        status: task.status,
        config: task.config,
        start_time: task.startTime,
      }).catch(err => {
        console.error('Failed to save task to database:', err);
        // 数据库保存失败不影响任务启动
      });

      // 启动测试，传递任务ID
      await apiService.startSippTest({
        ...values,
        taskId,
      });
      message.success('测试已启动');
      setStartTestVisible(false);
      startTestForm.resetFields();
    } catch (error: any) {
      message.error(`启动测试失败: ${error.message || '未知错误'}`);
      // 更新任务状态为失败
      const taskId = `task_${Date.now()}`;
      updateTask(taskId, {
        status: TestTaskStatus.FAILED,
        error: error.message || '未知错误',
        endTime: Date.now(),
      });
    } finally {
      setStartTestLoading(false);
    }
  };

  /**
   * 取消启动测试
   */
  const handleStartTestCancel = () => {
    setStartTestVisible(false);
    startTestForm.resetFields();
  };

  const columns = [
    {
      title: '场景名称',
      dataIndex: 'name',
      key: 'name',
    },
    {
      title: '文件名',
      dataIndex: 'filename',
      key: 'filename',
    },
    {
      title: '关联注入文件',
      dataIndex: 'injection_file',
      key: 'injection_file',
      render: (injectionFile: string | undefined) =>
        injectionFile ? (
          <Tag color="blue">{injectionFile}</Tag>
        ) : (
          <Tag color="default">无</Tag>
        ),
    },
    {
      title: '操作',
      key: 'action',
      render: (_: any, record: ScenarioFile) => (
        <Space size="middle">
          <Button
            type="primary"
            icon={<PlayCircleOutlined />}
            onClick={() => handleStartTest(record)}
          >
            启动
          </Button>
          <Button icon={<EyeOutlined />} onClick={() => handleView(record.filename)}>
            查看
          </Button>
          <Button icon={<EditOutlined />} onClick={() => handleEdit(record.filename)}>
            编辑
          </Button>
          <Button icon={<DeleteOutlined />} danger onClick={() => handleDelete(record.filename)}>
            删除
          </Button>
        </Space>
      ),
    },
  ];

  return (
    <div style={{ padding: '24px' }}>
      <Card
        title="场景管理"
        extra={
          <Space>
            <Button type="primary" icon={<PlusOutlined />} onClick={handleCreate}>
              创建场景
            </Button>
            <Button onClick={loadScenarios}>刷新</Button>
          </Space>
        }
      >
        <Table
          columns={columns}
          dataSource={scenarios}
          rowKey="filename"
          loading={loading}
          pagination={{
            pageSize: 10,
            showSizeChanger: true,
            showTotal: (total) => `共 ${total} 个场景`,
          }}
        />
      </Card>

      <ScenarioForm
        visible={formVisible}
        onCancel={handleFormCancel}
        onSubmit={handleFormSubmit}
        initialData={editingData}
      />

      {/* 启动测试弹窗 */}
      <Modal
        title={
          <Space>
            <PlayCircleOutlined />
            <span>启动测试：{selectedScenario?.name}</span>
          </Space>
        }
        open={startTestVisible}
        onCancel={handleStartTestCancel}
        onOk={handleStartTestSubmit}
        confirmLoading={startTestLoading}
        width={700}
        okText="启动测试"
        cancelText="取消"
      >
        <Form
          form={startTestForm}
          layout="vertical"
          initialValues={{
            remoteHost: '192.168.21.88',
            remotePort: 5060,
            localPort: 5070,
            rate: 1,
            users: 10,
            limit: 10,
            transport: 'udp',
            minRtpPort: 6000,
            maxRtpPort: 6100,
            enableRtpEcho: false,
            timeout: 120000,
          }}
        >
          <Form.Item name="scenarioFile" hidden>
            <Input />
          </Form.Item>

          <Form.Item name="injectionFile" hidden>
            <Input />
          </Form.Item>

          {selectedScenario?.injection_file && (
            <div style={{ marginBottom: 16, padding: 12, background: '#f0f2f5', borderRadius: 4 }}>
              <Space>
                <Tag color="blue">注入文件</Tag>
                <span>{selectedScenario.injection_file}</span>
              </Space>
            </div>
          )}

          <Form.Item
            name="remoteHost"
            label="远程服务器地址"
            rules={[{ required: true, message: '请输入远程服务器地址' }]}
          >
            <Input placeholder="例如: 192.168.21.88" />
          </Form.Item>

          <Space style={{ width: '100%' }} size="large">
            <Form.Item
              name="remotePort"
              label="远程端口"
              rules={[{ required: true, message: '请输入远程端口' }]}
              style={{ flex: 1 }}
            >
              <InputNumber
                min={1}
                max={65535}
                placeholder="5060"
                style={{ width: '100%' }}
              />
            </Form.Item>

            <Form.Item
              name="localPort"
              label="本地端口"
              rules={[{ required: true, message: '请输入本地端口' }]}
              style={{ flex: 1 }}
            >
              <InputNumber
                min={1}
                max={65535}
                placeholder="5070"
                style={{ width: '100%' }}
              />
            </Form.Item>
          </Space>

          <Space style={{ width: '100%' }} size="large">
            <Form.Item
              name="rate"
              label="呼叫速率 (calls/sec)"
              rules={[{ required: true, message: '请输入呼叫速率' }]}
              style={{ flex: 1 }}
            >
              <InputNumber
                min={0}
                max={10000}
                placeholder="1"
                style={{ width: '100%' }}
              />
            </Form.Item>

            <Form.Item
              name="users"
              label="并发用户数"
              rules={[{ required: true, message: '请输入并发用户数' }]}
              style={{ flex: 1 }}
            >
              <InputNumber
                min={1}
                max={100000}
                placeholder="10"
                style={{ width: '100%' }}
              />
            </Form.Item>

            <Form.Item
              name="limit"
              label="呼叫总数限制"
              tooltip="设置最大呼叫次数，达到后自动停止。设为 0 表示无限制（不推荐）"
              rules={[
                { required: true, message: '请输入呼叫限制' },
                {
                  validator: (_, value) => {
                    if (value === 0) {
                      return Promise.reject(new Error('建议设置具体的呼叫限制，避免测试无限运行'));
                    }
                    return Promise.resolve();
                  },
                  warningOnly: true,
                },
              ]}
              style={{ flex: 1 }}
            >
              <InputNumber
                min={0}
                max={1000000}
                placeholder="10"
                style={{ width: '100%' }}
                addonAfter="次"
              />
            </Form.Item>
          </Space>

          <Form.Item
            name="transport"
            label="传输协议"
            rules={[{ required: true, message: '请选择传输协议' }]}
          >
            <Select>
              <Select.Option value="udp">UDP</Select.Option>
              <Select.Option value="tcp">TCP</Select.Option>
              <Select.Option value="tls">TLS</Select.Option>
            </Select>
          </Form.Item>

          <Alert
            message="测试停止条件"
            description={
              <Space direction="vertical" size={0}>
                <span style={{ fontSize: '12px' }}>
                  • <strong>呼叫总数达到限制</strong>：完成指定次数的呼叫后自动停止
                </span>
                <span style={{ fontSize: '12px' }}>
                  • <strong>超时时间到达</strong>：测试运行超过设定时间后自动停止
                </span>
                <span style={{ fontSize: '12px', color: '#ff4d4f' }}>
                  • <strong>推荐</strong>：始终设置具体的呼叫限制，避免资源浪费
                </span>
              </Space>
            }
            type="info"
            showIcon
            style={{ marginBottom: 16 }}
          />


          <Space style={{ width: '100%' }} size="large">
            <Form.Item
              name="minRtpPort"
              label="RTP 起始端口"
              style={{ flex: 1 }}
            >
              <InputNumber
                min={1024}
                max={65535}
                placeholder="6000"
                style={{ width: '100%' }}
              />
            </Form.Item>

            <Form.Item
              name="maxRtpPort"
              label="RTP 结束端口"
              style={{ flex: 1 }}
            >
              <InputNumber
                min={1024}
                max={65535}
                placeholder="6100"
                style={{ width: '100%' }}
              />
            </Form.Item>
          </Space>

          <Divider orientation="left" style={{ margin: '16px 0' }}>媒体配置</Divider>

          <Space style={{ width: '100%' }} size="large">
            <Form.Item
              name="mediaIpType"
              label="媒体 IP 类型"
              tooltip="用于 SDP 中的 media_ip_type 占位符"
              style={{ flex: 1 }}
            >
              <Select placeholder="自动检测" allowClear>
                <Select.Option value="4">IPv4</Select.Option>
                <Select.Option value="6">IPv6</Select.Option>
              </Select>
            </Form.Item>

            <Form.Item
              name="mediaIp"
              label="媒体 IP 地址"
              tooltip="可选，用于指定RTP媒体流的IP地址。留空使用本地IP"
              style={{ flex: 1 }}
            >
              <Input placeholder="留空使用本地IP" />
            </Form.Item>
          </Space>

          <div style={{ marginBottom: 16, padding: 12, background: '#e6f7ff', borderRadius: 4, border: '1px solid #91d5ff' }}>
            <Space direction="vertical" size={0}>
              <span style={{ fontSize: '12px', color: '#0050b3' }}>
                <strong>说明：</strong>
              </span>
              <span style={{ fontSize: '12px', color: '#595959' }}>
                • media_port（媒体端口）将从上面配置的 RTP 端口范围（{'{minRtpPort}-{maxRtpPort}'}）中自动分配
              </span>
              <span style={{ fontSize: '12px', color: '#595959' }}>
                • 每个并发呼叫需要 2 个端口（RTP + RTCP），请确保端口范围足够
              </span>
            </Space>
          </div>

          <Form.Item
            name="enableRtpEcho"
            label="启用 RTP Echo"
            valuePropName="checked"
          >
            <Select>
              <Select.Option value={false}>禁用</Select.Option>
              <Select.Option value={true}>启用</Select.Option>
            </Select>
          </Form.Item>

          <Form.Item
            name="timeout"
            label="超时时间"
            tooltip="测试运行的最长时间，超时后自动停止。默认2分钟"
          >
            <InputNumber
              min={1000}
              max={600000}
              step={1000}
              placeholder="120000"
              style={{ width: '100%' }}
              addonAfter="毫秒"
              formatter={(value) => {
                if (!value) return '';
                const seconds = Math.floor(Number(value) / 1000);
                return `${value} (${seconds}秒)`;
              }}
              parser={(value) => {
                if (!value) return 0 as any;
                return Number(value.toString().replace(/[^\d]/g, '')) as any;
              }}
            />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
};

export default Scenarios;
