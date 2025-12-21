import React, { useEffect, useState } from 'react';
import { Card, Table, Button, Space, message, Modal, Form, InputNumber, Input, Select, Tag, Switch, Collapse, Popconfirm, List, Tooltip } from 'antd';
import { PlusOutlined, EditOutlined, DeleteOutlined, EyeOutlined, PlayCircleOutlined, SettingOutlined, SaveOutlined, StarOutlined, StarFilled, AppstoreOutlined, AudioOutlined, ClockCircleOutlined, BugOutlined, ToolOutlined, CopyOutlined, FileTextOutlined } from '@ant-design/icons';
import { apiService } from '@/services/api';
import { useAppStore } from '@/stores/useAppStore';
import type { ScenarioFile, Scenario, TestTask } from '@/types';
import { TestTaskStatus } from '@/types';
import ScenarioForm from '@/components/ScenarioForm';

interface ConfigTemplate {
  id: number;
  name: string;
  description?: string;
  config: Record<string, any>;
  is_default: boolean;
}

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

  // 配置模板相关
  const [templates, setTemplates] = useState<ConfigTemplate[]>([]);
  const [saveTemplateVisible, setSaveTemplateVisible] = useState(false);
  const [templateName, setTemplateName] = useState('');
  const [templateDesc, setTemplateDesc] = useState('');
  const [manageTemplateVisible, setManageTemplateVisible] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState<ConfigTemplate | null>(null);
  const [currentTemplateId, setCurrentTemplateId] = useState<number | undefined>(undefined);

  // 注入文件列表
  const [injectionFiles, setInjectionFiles] = useState<any[]>([]);

  // 批量选择
  const [selectedRowKeys, setSelectedRowKeys] = useState<React.Key[]>([]);

  /**
   * 加载配置模板
   */
  const loadTemplates = async () => {
    try {
      const response = await apiService.getConfigTemplates();
      if (response.success && response.templates) {
        setTemplates(response.templates);
      }
    } catch (error) {
      console.error('Failed to load templates:', error);
    }
  };

  /**
   * 应用模板
   */
  const applyTemplate = (templateId: number) => {
    const template = templates.find(t => t.id === templateId);
    if (template) {
      startTestForm.setFieldsValue(template.config);
      setCurrentTemplateId(templateId);
      message.success(`已应用模板: ${template.name}`);
    }
  };

  /**
   * 更新当前模板
   */
  const updateCurrentTemplate = async () => {
    if (!currentTemplateId) return;
    const template = templates.find(t => t.id === currentTemplateId);
    if (!template) return;
    try {
      const config = startTestForm.getFieldsValue();
      await apiService.updateConfigTemplate(currentTemplateId, { config });
      message.success('模板已更新');
      loadTemplates();
    } catch (error: any) {
      message.error(`更新失败: ${error.message}`);
    }
  };

  /**
   * 保存当前配置为模板
   */
  const saveAsTemplate = async () => {
    if (!templateName.trim()) {
      message.error('请输入模板名称');
      return;
    }
    try {
      const config = startTestForm.getFieldsValue();
      if (editingTemplate) {
        // 更新模板
        await apiService.updateConfigTemplate(editingTemplate.id, {
          name: templateName,
          description: templateDesc || undefined,
          config,
        });
        message.success('模板更新成功');
      } else {
        // 创建新模板
        await apiService.createConfigTemplate({
          name: templateName,
          description: templateDesc || undefined,
          config,
        });
        message.success('模板保存成功');
      }
      setSaveTemplateVisible(false);
      setTemplateName('');
      setTemplateDesc('');
      setEditingTemplate(null);
      loadTemplates();
    } catch (error: any) {
      message.error(`保存失败: ${error.message}`);
    }
  };

  /**
   * 编辑模板
   */
  const editTemplate = (template: ConfigTemplate) => {
    setEditingTemplate(template);
    setTemplateName(template.name);
    setTemplateDesc(template.description || '');
    startTestForm.setFieldsValue(template.config);
    setSaveTemplateVisible(true);
  };

  /**
   * 设置默认模板
   */
  const setDefaultTemplate = async (id: number) => {
    try {
      await apiService.setDefaultConfigTemplate(id);
      message.success('已设为默认模板');
      loadTemplates();
    } catch (error: any) {
      message.error(`设置失败: ${error.message}`);
    }
  };

  /**
   * 删除模板
   */
  const deleteTemplate = async (id: number) => {
    try {
      await apiService.deleteConfigTemplate(id);
      message.success('模板已删除');
      loadTemplates();
    } catch (error: any) {
      message.error(`删除失败: ${error.message}`);
    }
  };

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
    loadTemplates();
    loadInjectionFiles();
  }, []);

  /**
   * 加载注入文件列表
   */
  const loadInjectionFiles = async () => {
    try {
      const response = await apiService.listInjectionFiles();
      if (response.success && response.files) {
        setInjectionFiles(response.files);
      }
    } catch (error) {
      console.error('Failed to load injection files:', error);
    }
  };

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
   * 创建场景副本
   */
  const handleDuplicate = async (filename: string) => {
    try {
      const response = await apiService.getScenario(filename);
      if (response.success && response.scenario) {
        const newFilename = filename.replace('.xml', '') + '-copy.xml';
        await apiService.saveScenario(newFilename, {
          ...response.scenario,
          name: response.scenario.name + ' (副本)',
        });
        message.success('副本创建成功');
        loadScenarios();
      }
    } catch (error: any) {
      message.error(`创建副本失败: ${error.message}`);
    }
  };

  /**
   * 批量删除场景
   */
  const handleBatchDelete = () => {
    if (selectedRowKeys.length === 0) return;
    Modal.confirm({
      title: '确认批量删除',
      content: `确定要删除选中的 ${selectedRowKeys.length} 个场景吗？`,
      okText: '删除',
      okType: 'danger',
      cancelText: '取消',
      onOk: async () => {
        let success = 0, fail = 0;
        for (const key of selectedRowKeys) {
          try {
            await apiService.deleteScenario(key as string);
            success++;
          } catch {
            fail++;
          }
        }
        message.success(`删除完成：成功 ${success} 个${fail > 0 ? `，失败 ${fail} 个` : ''}`);
        setSelectedRowKeys([]);
        loadScenarios();
      },
    });
  };

  /**
   * 查看场景详情
   */
  const handleView = async (filename: string) => {
    try {
      const response = await apiService.getScenarioXml(filename);
      if (response.success && response.xml) {
        Modal.info({
          title: `场景: ${filename}`,
          content: (
            <div>
              <pre style={{ 
                maxHeight: '500px', 
                overflow: 'auto',
                backgroundColor: '#f5f5f5',
                padding: '12px',
                borderRadius: '4px',
                fontSize: '12px',
                fontFamily: 'Consolas, Monaco, monospace',
                lineHeight: '1.5',
              }}>
                {response.xml}
              </pre>
            </div>
          ),
          width: 900,
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
      // 如果是编辑模式且文件名改变，先删除旧的
      if (editingData && `${editingData.filename}.xml` !== filename) {
        await apiService.deleteScenario(`${editingData.filename}.xml`);
      }
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
  const handleStartTest = async (scenario: ScenarioFile) => {
    setSelectedScenario(scenario);

    // 默认配置
    const defaultConfig = {
      scenarioFile: scenario.filename,
      remoteHost: '127.0.0.1',
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
    };

    // 尝试加载默认模板
    const defaultTemplate = templates.find(t => t.is_default);
    if (defaultTemplate) {
      startTestForm.setFieldsValue({
        ...defaultTemplate.config,
        scenarioFile: scenario.filename,
      });
      setCurrentTemplateId(defaultTemplate.id);
    } else {
      startTestForm.setFieldsValue(defaultConfig);
      setCurrentTemplateId(undefined);
    }

    setStartTestVisible(true);
  };

  /**
   * 提交启动测试
   */
  const handleStartTestSubmit = async () => {
    let taskId: string | null = null;
    try {
      const values = await startTestForm.validateFields();
      setStartTestLoading(true);

      // 创建任务记录
      taskId = `task_${Date.now()}`;
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
          oocsf: values.oocsf,
        },
      };

      // 添加到任务列表
      addTask(task);

      // 保存到数据库
      await apiService.createTaskHistory({
        id: task.id,
        scenario_name: task.scenarioName,
        scenario_file: task.scenarioFile,
        status: 'RUNNING',
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
      if (taskId) {
        updateTask(taskId, {
          status: TestTaskStatus.FAILED,
          error: error.message || '未知错误',
          endTime: Date.now(),
        });
      }
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
      title: '操作',
      key: 'action',
      render: (_: any, record: ScenarioFile) => (
        <Space size="small">
          <Button
            type="primary"
            size="small"
            icon={<PlayCircleOutlined />}
            onClick={() => handleStartTest(record)}
          >
            启动
          </Button>
          <Button size="small" icon={<EyeOutlined />} onClick={() => handleView(record.filename)}>
            查看
          </Button>
          <Button size="small" icon={<EditOutlined />} onClick={() => handleEdit(record.filename)}>
            编辑
          </Button>
          <Button size="small" icon={<CopyOutlined />} onClick={() => handleDuplicate(record.filename)}>
            副本
          </Button>
          <Button size="small" icon={<DeleteOutlined />} danger onClick={() => handleDelete(record.filename)}>
            删除
          </Button>
        </Space>
      ),
    },
  ];

  return (
    <div style={{ padding: '24px' }}>
      <Card
        title={
          <Space>
            <FileTextOutlined />
            <span>场景管理</span>
          </Space>
        }
        extra={
          <Space>
            {selectedRowKeys.length > 0 && (
              <Button danger icon={<DeleteOutlined />} onClick={handleBatchDelete}>
                批量删除 ({selectedRowKeys.length})
              </Button>
            )}
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
          rowSelection={{
            selectedRowKeys,
            onChange: setSelectedRowKeys,
          }}
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
        {/* 模板选择区域 */}
        <div style={{ marginBottom: 16, padding: 12, background: '#fafafa', borderRadius: 4 }}>
          <Space style={{ width: '100%' }}>
            <span style={{ fontWeight: 'bold' }}>配置模板:</span>
            <Select
              style={{ width: 200 }}
              placeholder="选择模板"
              value={currentTemplateId}
              onChange={applyTemplate}
              allowClear
              onClear={() => setCurrentTemplateId(undefined)}
            >
              {templates.map(t => (
                <Select.Option key={t.id} value={t.id}>
                  {t.is_default ? `${t.name} (默认)` : t.name}
                </Select.Option>
              ))}
            </Select>
            {currentTemplateId && (
              <Button size="small" icon={<SaveOutlined />} onClick={updateCurrentTemplate}>
                更新模板
              </Button>
            )}
            <Button size="small" icon={<PlusOutlined />} onClick={() => { setEditingTemplate(null); setTemplateName(''); setTemplateDesc(''); setSaveTemplateVisible(true); }}>
              另存为
            </Button>
            <Button size="small" icon={<SettingOutlined />} onClick={() => setManageTemplateVisible(true)}>
              管理
            </Button>
          </Space>
        </div>

        <Form
          form={startTestForm}
          layout="vertical"
          initialValues={{
            remoteHost: '127.0.0.1',
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

          <Collapse
            defaultActiveKey={['basic', 'call']}
            style={{ marginBottom: 16 }}
            items={[
              {
                key: 'basic',
                label: <><AppstoreOutlined /> 基础配置</>,
                children: (
                  <>
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
                        <InputNumber min={1} max={65535} placeholder="5060" style={{ width: '100%' }} />
                      </Form.Item>

                      <Form.Item
                        name="localPort"
                        label="本地端口"
                        rules={[{ required: true, message: '请输入本地端口' }]}
                        style={{ flex: 1 }}
                      >
                        <InputNumber min={1} max={65535} placeholder="5070" style={{ width: '100%' }} />
                      </Form.Item>

                      <Form.Item
                        name="transport"
                        label="传输协议"
                        rules={[{ required: true, message: '请选择传输协议' }]}
                        style={{ flex: 1 }}
                      >
                        <Select>
                          <Select.Option value="udp">UDP</Select.Option>
                          <Select.Option value="tcp">TCP</Select.Option>
                          <Select.Option value="tls">TLS</Select.Option>
                        </Select>
                      </Form.Item>
                    </Space>

                    <Form.Item
                      name="injectionFile"
                      label="注入文件"
                      tooltip="选择CSV注入文件，用于动态数据（如用户名密码）"
                    >
                      <Select placeholder="选择注入文件（可选）" allowClear showSearch optionFilterProp="children">
                        {injectionFiles.map((f: any) => (
                          <Select.Option key={f.filename} value={f.filename}>
                            {f.filename} ({f.row_count} 行)
                          </Select.Option>
                        ))}
                      </Select>
                    </Form.Item>
                  </>
                ),
              },
              {
                key: 'call',
                label: <><ClockCircleOutlined /> 呼叫控制</>,
                children: (
                  <>
                    <Space style={{ width: '100%' }} size="large">
                      <Form.Item
                        name="rate"
                        label="呼叫速率 (calls/sec)"
                        rules={[{ required: true, message: '请输入呼叫速率' }]}
                        style={{ flex: 1 }}
                      >
                        <InputNumber min={0} max={10000} placeholder="1" style={{ width: '100%' }} />
                      </Form.Item>

                      <Form.Item
                        name="users"
                        label="并发用户数"
                        rules={[{ required: true, message: '请输入并发用户数' }]}
                        style={{ flex: 1 }}
                      >
                        <InputNumber min={1} max={100000} placeholder="10" style={{ width: '100%' }} />
                      </Form.Item>

                      <Form.Item
                        name="limit"
                        label="呼叫总数限制"
                        tooltip="设置最大呼叫次数，达到后自动停止"
                        rules={[{ required: true, message: '请输入呼叫限制' }]}
                        style={{ flex: 1 }}
                      >
                        <InputNumber min={0} max={1000000} placeholder="10" style={{ width: '100%' }} />
                      </Form.Item>
                    </Space>

                    <Form.Item
                      name="timeout"
                      label="超时时间 (毫秒)"
                      tooltip="测试运行的最长时间，超时后自动停止。设为0表示不限制"
                    >
                      <InputNumber min={0} step={1000} placeholder="120000" style={{ width: '100%' }} />
                    </Form.Item>
                  </>
                ),
              },
              {
                key: 'media',
                label: <><AudioOutlined /> 媒体配置</>,
                children: (
                  <>
                    <Space style={{ width: '100%' }} size="large">
                      <Form.Item name="minRtpPort" label="RTP 起始端口" style={{ flex: 1 }}>
                        <InputNumber min={1024} max={65535} placeholder="6000" style={{ width: '100%' }} />
                      </Form.Item>
                      <Form.Item name="maxRtpPort" label="RTP 结束端口" style={{ flex: 1 }}>
                        <InputNumber min={1024} max={65535} placeholder="6100" style={{ width: '100%' }} />
                      </Form.Item>
                    </Space>

                    <Space style={{ width: '100%' }} size="large">
                      <Form.Item name="mediaIpType" label="媒体 IP 类型" style={{ flex: 1 }}>
                        <Select placeholder="自动检测" allowClear>
                          <Select.Option value="4">IPv4</Select.Option>
                          <Select.Option value="6">IPv6</Select.Option>
                        </Select>
                      </Form.Item>
                      <Form.Item name="mediaIp" label="媒体 IP 地址" tooltip="留空使用本地IP" style={{ flex: 1 }}>
                        <Input placeholder="留空使用本地IP" />
                      </Form.Item>
                    </Space>

                    <Form.Item name="enableRtpEcho" label="RTP Echo">
                      <Select>
                        <Select.Option value={false}>禁用</Select.Option>
                        <Select.Option value={true}>启用</Select.Option>
                      </Select>
                    </Form.Item>
                  </>
                ),
              },
              {
                key: 'scenario',
                label: <><ToolOutlined /> 场景选项</>,
                children: (
                  <Form.Item
                    name="oocsf"
                    label="会话外场景文件 (oocsf)"
                    tooltip="用于处理会话外的 NOTIFY/OPTIONS 等消息"
                  >
                    <Select placeholder="选择会话外场景文件（可选）" allowClear showSearch optionFilterProp="children">
                      {scenarios.filter(s => s.filename !== selectedScenario?.filename).map(s => (
                        <Select.Option key={s.filename} value={s.filename}>
                          {s.name} ({s.filename})
                        </Select.Option>
                      ))}
                    </Select>
                  </Form.Item>
                ),
              },
              {
                key: 'trace',
                label: <><BugOutlined /> 日志追踪</>,
                children: (
                  <Space wrap style={{ width: '100%' }}>
                    <Form.Item name="traceMsg" label="消息追踪" valuePropName="checked" style={{ marginBottom: 8 }}>
                      <Switch checkedChildren="开" unCheckedChildren="关" />
                    </Form.Item>
                    <Form.Item name="traceErr" label="错误追踪" valuePropName="checked" style={{ marginBottom: 8 }}>
                      <Switch checkedChildren="开" unCheckedChildren="关" />
                    </Form.Item>
                    <Form.Item name="traceCalldebug" label="呼叫调试" valuePropName="checked" style={{ marginBottom: 8 }}>
                      <Switch checkedChildren="开" unCheckedChildren="关" />
                    </Form.Item>
                    <Form.Item name="traceShortmsg" label="短消息" valuePropName="checked" style={{ marginBottom: 8 }}>
                      <Switch checkedChildren="开" unCheckedChildren="关" />
                    </Form.Item>
                    <Form.Item name="traceLogs" label="日志" valuePropName="checked" style={{ marginBottom: 8 }}>
                      <Switch checkedChildren="开" unCheckedChildren="关" />
                    </Form.Item>
                    <Form.Item name="traceRtt" label="往返时间" valuePropName="checked" style={{ marginBottom: 8 }}>
                      <Switch checkedChildren="开" unCheckedChildren="关" />
                    </Form.Item>
                  </Space>
                ),
              },
              {
                key: 'advanced',
                label: <><SettingOutlined /> 高级选项</>,
                children: (
                  <Space direction="vertical" style={{ width: '100%' }}>
                    <Form.Item name="localIp" label="本地IP地址" tooltip="绑定的本地IP地址 (-i)">
                      <Input placeholder="留空使用默认" />
                    </Form.Item>
                    <Form.Item name="bindLocal" label="绑定本地端口" valuePropName="checked" tooltip="强制绑定本地端口 (-bind_local)">
                      <Switch checkedChildren="开" unCheckedChildren="关" />
                    </Form.Item>
                    <Form.Item name="rsa" label="远程发送地址" tooltip="指定远程发送地址 (-rsa)">
                      <Input placeholder="host:port 格式" />
                    </Form.Item>
                  </Space>
                ),
              },
            ]}
          />
        </Form>
      </Modal>

      {/* 保存模板弹窗 */}
      <Modal
        title={editingTemplate ? '编辑配置模板' : '保存为配置模板'}
        open={saveTemplateVisible}
        onOk={saveAsTemplate}
        onCancel={() => { setSaveTemplateVisible(false); setTemplateName(''); setTemplateDesc(''); setEditingTemplate(null); }}
        okText="保存"
        cancelText="取消"
      >
        <Form layout="vertical">
          <Form.Item label="模板名称" required>
            <Input
              value={templateName}
              onChange={e => setTemplateName(e.target.value)}
              placeholder="输入模板名称"
            />
          </Form.Item>
          <Form.Item label="模板描述">
            <Input.TextArea
              value={templateDesc}
              onChange={e => setTemplateDesc(e.target.value)}
              placeholder="输入模板描述（可选）"
              rows={2}
            />
          </Form.Item>
        </Form>
      </Modal>

      {/* 模板管理弹窗 */}
      <Modal
        title="管理配置模板"
        open={manageTemplateVisible}
        onCancel={() => setManageTemplateVisible(false)}
        footer={null}
        width={600}
      >
        <List
          dataSource={templates}
          locale={{ emptyText: '暂无模板' }}
          renderItem={(item) => (
            <List.Item
              actions={[
                <Tooltip title={item.is_default ? '当前默认' : '设为默认'} key="default">
                  <Button
                    type="text"
                    icon={item.is_default ? <StarFilled style={{ color: '#faad14' }} /> : <StarOutlined />}
                    onClick={() => setDefaultTemplate(item.id)}
                  />
                </Tooltip>,
                <Tooltip title="编辑" key="edit">
                  <Button
                    type="text"
                    icon={<EditOutlined />}
                    onClick={() => { editTemplate(item); setManageTemplateVisible(false); }}
                  />
                </Tooltip>,
                <Popconfirm
                  key="delete"
                  title="确认删除此模板？"
                  onConfirm={() => deleteTemplate(item.id)}
                  okText="删除"
                  cancelText="取消"
                >
                  <Button type="text" danger icon={<DeleteOutlined />} />
                </Popconfirm>,
              ]}
            >
              <List.Item.Meta
                title={
                  <Space>
                    {item.name}
                    {item.is_default && <Tag color="blue">默认</Tag>}
                  </Space>
                }
                description={item.description || '无描述'}
              />
            </List.Item>
          )}
        />
      </Modal>
    </div>
  );
};

export default Scenarios;
