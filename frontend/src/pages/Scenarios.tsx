import React, { useEffect, useState } from 'react';
import { Card, Table, Button, Space, message, Modal, Form, InputNumber, Input, Select, Tag, Switch, Collapse, Popconfirm, List, Tooltip } from 'antd';
import { PlusOutlined, EditOutlined, DeleteOutlined, EyeOutlined, PlayCircleOutlined, SettingOutlined, SaveOutlined, StarOutlined, StarFilled, AppstoreOutlined, AudioOutlined, ClockCircleOutlined, BugOutlined, ToolOutlined, CopyOutlined, FileTextOutlined } from '@ant-design/icons';
import { useTranslation } from 'react-i18next';
import { apiService } from '@/services/api';
import { useAppStore } from '@/stores/useAppStore';
import type { ScenarioFile, Scenario, TestTask, MachineInfo } from '@/types';
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
  const { t } = useTranslation();
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

  // 机器列表
  const [machines, setMachines] = useState<MachineInfo[]>([]);
  const [machinesLoading, setMachinesLoading] = useState(false);

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
      // 保留当前的 scenarioFile，避免被模板配置覆盖
      const currentScenarioFile = startTestForm.getFieldValue('scenarioFile');
      startTestForm.setFieldsValue({
        ...template.config,
        scenarioFile: currentScenarioFile,
      });
      setCurrentTemplateId(templateId);
      message.success(`${t('common.apply')}: ${template.name}`);
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
      const allValues = startTestForm.getFieldsValue();
      // 排除 scenarioFile 字段，因为模板是通用配置，不应包含特定场景文件
      const { scenarioFile, ...config } = allValues;
      await apiService.updateConfigTemplate(currentTemplateId, { config });
      message.success(t('template.templateUpdated'));
      loadTemplates();
    } catch (error: any) {
      message.error(`${t('common.failed')}: ${error.message}`);
    }
  };

  /**
   * 保存当前配置为模板
   */
  const saveAsTemplate = async () => {
    if (!templateName.trim()) {
      message.error(t('template.pleaseInputTemplateName'));
      return;
    }
    try {
      const allValues = startTestForm.getFieldsValue();
      // 排除 scenarioFile 字段，因为模板是通用配置，不应包含特定场景文件
      const { scenarioFile, ...config } = allValues;
      
      if (editingTemplate) {
        // 更新模板
        await apiService.updateConfigTemplate(editingTemplate.id, {
          name: templateName,
          description: templateDesc || undefined,
          config,
        });
        message.success(t('template.templateUpdateSuccess'));
      } else {
        // 创建新模板
        await apiService.createConfigTemplate({
          name: templateName,
          description: templateDesc || undefined,
          config,
        });
        message.success(t('template.templateSaveSuccess'));
      }
      setSaveTemplateVisible(false);
      setTemplateName('');
      setTemplateDesc('');
      setEditingTemplate(null);
      loadTemplates();
    } catch (error: any) {
      message.error(`${t('common.saveFailed')}: ${error.message}`);
    }
  };

  /**
   * 编辑模板
   */
  const editTemplate = (template: ConfigTemplate) => {
    setEditingTemplate(template);
    setTemplateName(template.name);
    setTemplateDesc(template.description || '');
    // 保留当前的 scenarioFile，避免被模板配置覆盖
    const currentScenarioFile = startTestForm.getFieldValue('scenarioFile');
    startTestForm.setFieldsValue({
      ...template.config,
      scenarioFile: currentScenarioFile,
    });
    setSaveTemplateVisible(true);
  };

  /**
   * 设置默认模板
   */
  const setDefaultTemplate = async (id: number) => {
    try {
      await apiService.setDefaultConfigTemplate(id);
      message.success(t('template.setAsDefault'));
      loadTemplates();
    } catch (error: any) {
      message.error(`${t('common.failed')}: ${error.message}`);
    }
  };

  /**
   * 删除模板
   */
  const deleteTemplate = async (id: number) => {
    try {
      await apiService.deleteConfigTemplate(id);
      message.success(t('template.templateDeleted'));
      loadTemplates();
    } catch (error: any) {
      message.error(`${t('common.deleteFailed')}: ${error.message}`);
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
      message.error(`${t('common.failed')}: ${error.message}`);
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
      title: t('common.confirmDelete'),
      content: t('scenarios.confirmDeleteScenario', { name: filename }),
      okText: t('common.delete'),
      okType: 'danger',
      cancelText: t('common.cancel'),
      onOk: async () => {
        try {
          await apiService.deleteScenario(filename);
          message.success(t('common.deleteSuccess'));
          loadScenarios();
        } catch (error: any) {
          message.error(`${t('common.deleteFailed')}: ${error.message}`);
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
          name: response.scenario.name + ' (copy)',
        });
        message.success(t('scenarios.duplicateSuccess'));
        loadScenarios();
      }
    } catch (error: any) {
      message.error(`${t('common.failed')}: ${error.message}`);
    }
  };

  /**
   * 批量删除场景
   */
  const handleBatchDelete = () => {
    if (selectedRowKeys.length === 0) return;
    Modal.confirm({
      title: t('common.confirmBatchDelete'),
      content: t('scenarios.confirmBatchDeleteScenarios', { count: selectedRowKeys.length }),
      okText: t('common.delete'),
      okType: 'danger',
      cancelText: t('common.cancel'),
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
        message.success(t('taskHistory.batchDeletePartial', { success, fail }));
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
          title: `${t('menu.scenarios')}: ${filename}`,
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
      message.error(`${t('common.failed')}: ${error.message}`);
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
      message.error(`${t('common.failed')}: ${error.message}`);
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
      message.success(editingData ? t('scenarios.scenarioUpdateSuccess') : t('scenarios.scenarioCreateSuccess'));
      setFormVisible(false);
      setEditingData(undefined);
      await loadScenarios();
    } catch (error: any) {
      message.error(`${t('common.saveFailed')}: ${error.message}`);
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
   * 加载可用机器列表
   */
  const loadMachines = async () => {
    setMachinesLoading(true);
    try {
      const response = await apiService.getAvailableMachines();
      if (response.success && response.machines) {
        // 添加主机选项
        const allMachines = [
          {
            id: 'master',
            name: '主控节点（本地）',
            ipAddress: 'localhost',
            apiPort: 3000,
            role: 'master' as const,
            status: 'online' as const,
            runningTasks: 0,
            totalTasks: 0,
            lastHeartbeat: Date.now(),
          },
          ...response.machines,
        ];
        setMachines(allMachines);
      }
    } catch (error: any) {
      console.error('Failed to load machines:', error);
      // 加载失败时至少提供主机选项
      setMachines([{
        id: 'master',
        name: '主控节点（本地）',
        ipAddress: 'localhost',
        apiPort: 3000,
        role: 'master' as const,
        status: 'online' as const,
        runningTasks: 0,
        totalTasks: 0,
        lastHeartbeat: Date.now(),
      }]);
    } finally {
      setMachinesLoading(false);
    }
  };

  /**
   * 打开启动测试弹窗
   */
  const handleStartTest = async (scenario: ScenarioFile) => {
    setSelectedScenario(scenario);

    // 加载可用机器列表
    await loadMachines();

    // 默认配置
    const defaultConfig = {
      scenarioFile: scenario.filename,
      machineId: undefined, // 默认不指定，由系统自动选择
      remoteHost: import.meta.env.VITE_DEFAULT_REMOTE_HOST || '127.0.0.1',
      remotePort: parseInt(import.meta.env.VITE_DEFAULT_REMOTE_PORT || '5060'),
      localPort: parseInt(import.meta.env.VITE_DEFAULT_LOCAL_PORT || '5061'),
      rate: 1,
      users: 10,
      limit: 10,
      transport: 'udp',
      minRtpPort: 6000,
      maxRtpPort: 6100,
      enableRtpEcho: false,
      timeout: 120000,
      traceMsg: false,
      traceErr: false,
      traceCalldebug: false,
      traceShortmsg: false,
      traceLogs: false,
      traceRtt: false,
      bindLocal: false,
    };

    // 尝试加载默认模板
    const defaultTemplate = templates.find(t => t.is_default);
    if (defaultTemplate) {
      startTestForm.setFieldsValue({
        ...defaultConfig,              // 先用默认配置打底（包含所有新字段）
        ...defaultTemplate.config,     // 再用模板覆盖（保留用户自定义）
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
        scenarioName: selectedScenario?.name || t('scenarios.unknownScenario'),
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
          autoAnswer: values.autoAnswer,
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
      message.success(t('scenarios.testStarted'));
      setStartTestVisible(false);
      startTestForm.resetFields();
    } catch (error: any) {
      message.error(`${t('scenarios.testStartFailed')}: ${error.message || t('scenarios.unknownError')}`);
      // 更新任务状态为失败
      if (taskId) {
        updateTask(taskId, {
          status: TestTaskStatus.FAILED,
          error: error.message || t('scenarios.unknownError'),
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
      title: t('scenarios.scenarioName'),
      dataIndex: 'name',
      key: 'name',
    },
    {
      title: t('scenarios.filename'),
      dataIndex: 'filename',
      key: 'filename',
    },
    {
      title: t('common.actions'),
      key: 'action',
      render: (_: any, record: ScenarioFile) => (
        <Space size="small">
          <Button
            type="primary"
            size="small"
            icon={<PlayCircleOutlined />}
            onClick={() => handleStartTest(record)}
          >
            {t('scenarios.startTest')}
          </Button>
          <Button size="small" icon={<EyeOutlined />} onClick={() => handleView(record.filename)}>
            {t('common.view')}
          </Button>
          <Button size="small" icon={<EditOutlined />} onClick={() => handleEdit(record.filename)}>
            {t('common.edit')}
          </Button>
          <Button size="small" icon={<CopyOutlined />} onClick={() => handleDuplicate(record.filename)}>
            {t('scenarios.duplicate')}
          </Button>
          <Button size="small" icon={<DeleteOutlined />} danger onClick={() => handleDelete(record.filename)}>
            {t('common.delete')}
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
            <span>{t('scenarios.title')}</span>
          </Space>
        }
        extra={
          <Space>
            {selectedRowKeys.length > 0 && (
              <Button danger icon={<DeleteOutlined />} onClick={handleBatchDelete}>
                {t('scenarios.batchDelete')} ({selectedRowKeys.length})
              </Button>
            )}
            <Button type="primary" icon={<PlusOutlined />} onClick={handleCreate}>
              {t('scenarios.newScenario')}
            </Button>
            <Button onClick={loadScenarios}>{t('common.refresh')}</Button>
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
            showTotal: (total) => `${total} ${t('menu.scenarios').toLowerCase()}`,
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
            <span>{t('startTest.title')}：{selectedScenario?.name}</span>
          </Space>
        }
        open={startTestVisible}
        onCancel={handleStartTestCancel}
        onOk={handleStartTestSubmit}
        confirmLoading={startTestLoading}
        width={700}
        okText={t('scenarios.startTest')}
        cancelText={t('common.cancel')}
      >
        {/* 模板选择区域 */}
        <div style={{ marginBottom: 16, padding: 12, background: '#fafafa', borderRadius: 4 }}>
          <Space style={{ width: '100%' }}>
            <span style={{ fontWeight: 'bold' }}>{t('template.title')}:</span>
            <Select
              style={{ width: 200 }}
              placeholder={t('startTest.selectInjectionFile')}
              value={currentTemplateId}
              onChange={applyTemplate}
              allowClear
              onClear={() => setCurrentTemplateId(undefined)}
            >
              {templates.map(tpl => (
                <Select.Option key={tpl.id} value={tpl.id}>
                  {tpl.is_default ? `${tpl.name} (${t('common.currentDefault')})` : tpl.name}
                </Select.Option>
              ))}
            </Select>
            {currentTemplateId && (
              <Button size="small" icon={<SaveOutlined />} onClick={updateCurrentTemplate}>
                {t('template.updateCurrentTemplate')}
              </Button>
            )}
            <Button size="small" icon={<PlusOutlined />} onClick={() => { setEditingTemplate(null); setTemplateName(''); setTemplateDesc(''); setSaveTemplateVisible(true); }}>
              {t('template.saveAsTemplate')}
            </Button>
            <Button size="small" icon={<SettingOutlined />} onClick={() => setManageTemplateVisible(true)}>
              {t('common.manage')}
            </Button>
          </Space>
        </div>

        <Form
          form={startTestForm}
          layout="vertical"
          initialValues={{
            remoteHost: import.meta.env.VITE_DEFAULT_REMOTE_HOST || '127.0.0.1',
            remotePort: parseInt(import.meta.env.VITE_DEFAULT_REMOTE_PORT || '5060'),
            localPort: parseInt(import.meta.env.VITE_DEFAULT_LOCAL_PORT || '5061'),
            rate: 1,
            users: 10,
            limit: 10,
            transport: 'udp',
            minRtpPort: 6000,
            maxRtpPort: 6100,
            enableRtpEcho: false,
            timeout: 120000,
            traceMsg: false,
            traceErr: false,
            traceCalldebug: false,
            traceShortmsg: false,
            traceLogs: false,
            traceRtt: false,
            bindLocal: false,
            autoAnswer: false,
          }}
        >
          <Form.Item name="scenarioFile" hidden>
            <Input />
          </Form.Item>

          <Collapse
            defaultActiveKey={['basic', 'call']}
            style={{ marginBottom: 16 }}
            destroyInactivePanel={false}
            items={[
              {
                key: 'basic',
                label: <><AppstoreOutlined /> {t('startTest.basicConfig')}</>,
                forceRender: true,
                children: (
                  <>
                    <Form.Item
                      name="machineId"
                      label="执行机器"
                      tooltip="选择执行测试的机器节点，不选择则由系统自动选择最佳节点"
                    >
                      <Select
                        placeholder="自动选择（推荐）"
                        loading={machinesLoading}
                        allowClear
                      >
                        {machines.map(machine => (
                          <Select.Option key={machine.id} value={machine.id}>
                            <Space>
                              <span>{machine.name}</span>
                              {machine.role === 'master' && <Tag color="blue">主机</Tag>}
                              <Tag color={machine.status === 'online' ? 'success' : 'default'}>
                                {machine.status === 'online' ? '在线' : '离线'}
                              </Tag>
                              {machine.status === 'online' && (
                                <span style={{ color: '#999', fontSize: '12px' }}>
                                  运行中: {machine.runningTasks}
                                </span>
                              )}
                            </Space>
                          </Select.Option>
                        ))}
                      </Select>
                    </Form.Item>

                    <Form.Item
                      name="remoteHost"
                      label={t('startTest.remoteHost')}
                      rules={[{ required: true, message: t('startTest.pleaseInputRemoteHost') }]}
                    >
                      <Input placeholder="192.168.21.88" />
                    </Form.Item>

                    <Space style={{ width: '100%' }} size="large">
                      <Form.Item
                        name="remotePort"
                        label={t('startTest.remotePort')}
                        rules={[{ required: true, message: t('startTest.pleaseInputRemotePort') }]}
                        style={{ flex: 1 }}
                      >
                        <InputNumber min={1} max={65535} placeholder="5060" style={{ width: '100%' }} />
                      </Form.Item>

                      <Form.Item
                        name="localPort"
                        label={t('startTest.localPort')}
                        rules={[{ required: true, message: t('startTest.pleaseInputLocalPort') }]}
                        style={{ flex: 1 }}
                      >
                        <InputNumber min={1} max={65535} placeholder="5070" style={{ width: '100%' }} />
                      </Form.Item>

                      <Form.Item
                        name="transport"
                        label={t('startTest.transport')}
                        rules={[{ required: true, message: t('startTest.pleaseSelectTransport') }]}
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
                      label={t('startTest.injectionFile')}
                    >
                      <Select placeholder={t('startTest.selectInjectionFile')} allowClear showSearch optionFilterProp="children">
                        {injectionFiles.map((f: any) => (
                          <Select.Option key={f.filename} value={f.filename}>
                            {f.filename} ({f.row_count} rows)
                          </Select.Option>
                        ))}
                      </Select>
                    </Form.Item>
                  </>
                ),
              },
              {
                key: 'call',
                label: <><ClockCircleOutlined /> {t('startTest.rateConfig')}</>,
                forceRender: true,
                children: (
                  <>
                    <Space style={{ width: '100%' }} size="large">
                      <Form.Item
                        name="rate"
                        label={t('startTest.rate')}
                        rules={[{ required: true, message: t('startTest.pleaseInputRate') }]}
                        style={{ flex: 1 }}
                      >
                        <InputNumber min={0} max={10000} placeholder="1" style={{ width: '100%' }} />
                      </Form.Item>

                      <Form.Item
                        name="users"
                        label={t('startTest.users')}
                        rules={[{ required: true, message: t('startTest.pleaseInputUsers') }]}
                        style={{ flex: 1 }}
                      >
                        <InputNumber min={1} max={100000} placeholder="10" style={{ width: '100%' }} />
                      </Form.Item>

                      <Form.Item
                        name="limit"
                        label={t('startTest.limit')}
                        rules={[{ required: true, message: t('startTest.pleaseInputLimit') }]}
                        style={{ flex: 1 }}
                      >
                        <InputNumber min={0} max={1000000} placeholder="10" style={{ width: '100%' }} />
                      </Form.Item>
                    </Space>

                    <Form.Item
                      name="timeout"
                      label={t('startTest.timeout')}
                    >
                      <InputNumber min={0} step={1000} placeholder="120000" style={{ width: '100%' }} />
                    </Form.Item>
                  </>
                ),
              },
              {
                key: 'media',
                label: <><AudioOutlined /> {t('startTest.rtpConfig')}</>,
                forceRender: true,
                children: (
                  <>
                    <Space style={{ width: '100%' }} size="large">
                      <Form.Item name="minRtpPort" label="RTP Min Port" style={{ flex: 1 }}>
                        <InputNumber min={1024} max={65535} placeholder="6000" style={{ width: '100%' }} />
                      </Form.Item>
                      <Form.Item name="maxRtpPort" label="RTP Max Port" style={{ flex: 1 }}>
                        <InputNumber min={1024} max={65535} placeholder="6100" style={{ width: '100%' }} />
                      </Form.Item>
                    </Space>

                    <Space style={{ width: '100%' }} size="large">
                      <Form.Item name="mediaIpType" label="Media IP Type" style={{ flex: 1 }}>
                        <Select placeholder="Auto" allowClear>
                          <Select.Option value="4">IPv4</Select.Option>
                          <Select.Option value="6">IPv6</Select.Option>
                        </Select>
                      </Form.Item>
                      <Form.Item name="mediaIp" label="Media IP" style={{ flex: 1 }}>
                        <Input placeholder="Auto" />
                      </Form.Item>
                    </Space>

                    <Form.Item name="enableRtpEcho" label="RTP Echo">
                      <Select>
                        <Select.Option value={false}>Off</Select.Option>
                        <Select.Option value={true}>On</Select.Option>
                      </Select>
                    </Form.Item>
                  </>
                ),
              },
              {
                key: 'scenario',
                label: <><ToolOutlined /> {t('startTest.advancedConfig')}</>,
                forceRender: true,
                children: (
                  <Form.Item
                    name="oocsf"
                    label={t('startTest.oocsf')}
                  >
                    <Select placeholder={t('startTest.selectOocsf')} allowClear showSearch optionFilterProp="children">
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
                label: <><BugOutlined /> {t('startTest.traceConfig')}</>,
                forceRender: true,
                children: (
                  <Space wrap style={{ width: '100%' }}>
                    <Form.Item name="traceMsg" label={t('startTest.traceMsg')} valuePropName="checked" style={{ marginBottom: 8 }}>
                      <Switch />
                    </Form.Item>
                    <Form.Item name="traceErr" label={t('startTest.traceErr')} valuePropName="checked" style={{ marginBottom: 8 }}>
                      <Switch />
                    </Form.Item>
                    <Form.Item name="traceCalldebug" label={t('startTest.traceCalldebug')} valuePropName="checked" style={{ marginBottom: 8 }}>
                      <Switch />
                    </Form.Item>
                    <Form.Item name="traceShortmsg" label={t('startTest.traceShortmsg')} valuePropName="checked" style={{ marginBottom: 8 }}>
                      <Switch />
                    </Form.Item>
                    <Form.Item name="traceLogs" label={t('startTest.traceLogs')} valuePropName="checked" style={{ marginBottom: 8 }}>
                      <Switch />
                    </Form.Item>
                    <Form.Item name="traceRtt" label={t('startTest.traceRtt')} valuePropName="checked" style={{ marginBottom: 8 }}>
                      <Switch />
                    </Form.Item>
                  </Space>
                ),
              },
              {
                key: 'advanced',
                label: <><SettingOutlined /> {t('startTest.advancedConfig')}</>,
                forceRender: true,
                children: (
                  <Space direction="vertical" style={{ width: '100%' }}>
                    <Form.Item name="localIp" label="Local IP">
                      <Input placeholder="Auto" />
                    </Form.Item>
                    <Form.Item name="bindLocal" label="Bind Local" valuePropName="checked">
                      <Switch />
                    </Form.Item>
                    <Form.Item name="rsa" label="Remote Send Address">
                      <Input placeholder="host:port" />
                    </Form.Item>
                    <Form.Item
                      name="autoAnswer"
                      label="Auto Answer (会话外消息自动应答)"
                      valuePropName="checked"
                      tooltip="自动对 INFO/NOTIFY/OPTIONS/UPDATE 等会话外消息回复 200 OK (-aa)"
                    >
                      <Switch />
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
        title={editingTemplate ? t('template.editTemplate') : t('template.saveAsTemplate')}
        open={saveTemplateVisible}
        onOk={saveAsTemplate}
        onCancel={() => { setSaveTemplateVisible(false); setTemplateName(''); setTemplateDesc(''); setEditingTemplate(null); }}
        okText={t('common.save')}
        cancelText={t('common.cancel')}
      >
        <Form layout="vertical">
          <Form.Item label={t('template.templateName')} required>
            <Input
              value={templateName}
              onChange={e => setTemplateName(e.target.value)}
              placeholder={t('template.pleaseInputTemplateName')}
            />
          </Form.Item>
          <Form.Item label={t('template.templateDescription')}>
            <Input.TextArea
              value={templateDesc}
              onChange={e => setTemplateDesc(e.target.value)}
              placeholder={t('template.templateDescription')}
              rows={2}
            />
          </Form.Item>
        </Form>
      </Modal>

      {/* 模板管理弹窗 */}
      <Modal
        title={t('template.title')}
        open={manageTemplateVisible}
        onCancel={() => setManageTemplateVisible(false)}
        footer={null}
        width={600}
      >
        <List
          dataSource={templates}
          locale={{ emptyText: t('template.noTemplate') }}
          renderItem={(item) => (
            <List.Item
              actions={[
                <Tooltip title={item.is_default ? t('common.currentDefault') : t('common.setDefault')} key="default">
                  <Button
                    type="text"
                    icon={item.is_default ? <StarFilled style={{ color: '#faad14' }} /> : <StarOutlined />}
                    onClick={() => setDefaultTemplate(item.id)}
                  />
                </Tooltip>,
                <Tooltip title={t('common.edit')} key="edit">
                  <Button
                    type="text"
                    icon={<EditOutlined />}
                    onClick={() => { editTemplate(item); setManageTemplateVisible(false); }}
                  />
                </Tooltip>,
                <Popconfirm
                  key="delete"
                  title={t('common.confirmDelete')}
                  onConfirm={() => deleteTemplate(item.id)}
                  okText={t('common.delete')}
                  cancelText={t('common.cancel')}
                >
                  <Button type="text" danger icon={<DeleteOutlined />} />
                </Popconfirm>,
              ]}
            >
              <List.Item.Meta
                title={
                  <Space>
                    {item.name}
                    {item.is_default && <Tag color="blue">{t('common.currentDefault')}</Tag>}
                  </Space>
                }
                description={item.description || t('common.noDescription')}
              />
            </List.Item>
          )}
        />
      </Modal>
    </div>
  );
};

export default Scenarios;
