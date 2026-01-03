import React, { useEffect, useState } from 'react';
import { Card, Table, Button, Space, message, Modal, Form, InputNumber, Input, Select, Tag, Switch, Collapse, Popconfirm, List, Tooltip, Upload } from 'antd';
import { PlusOutlined, EditOutlined, DeleteOutlined, EyeOutlined, PlayCircleOutlined, SettingOutlined, SaveOutlined, StarOutlined, StarFilled, AppstoreOutlined, AudioOutlined, ClockCircleOutlined, BugOutlined, CopyOutlined, FileTextOutlined, UploadOutlined, CodeOutlined } from '@ant-design/icons';
import { apiService } from '@/services/api';
import { useAppStore } from '@/stores/useAppStore';
import type { ScenarioFile, Scenario, TestTask, MachineInfo } from '@/types';
import { TestTaskStatus } from '@/types';
import ScenarioForm from '@/components/ScenarioForm';
import type { UploadFile } from 'antd/es/upload/interface';

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

  // TLS 证书列表
  const [certificates, setCertificates] = useState<any[]>([]);

  // 机器列表
  const [machines, setMachines] = useState<MachineInfo[]>([]);
  const [machinesLoading, setMachinesLoading] = useState(false);

  // 批量选择
  const [selectedRowKeys, setSelectedRowKeys] = useState<React.Key[]>([]);

  // XML 编辑器相关
  const [xmlEditorVisible, setXmlEditorVisible] = useState(false);
  const [xmlEditorContent, setXmlEditorContent] = useState('');
  const [xmlEditorFilename, setXmlEditorFilename] = useState('');
  const [xmlEditorSaving, setXmlEditorSaving] = useState(false);

  // XML 文件上传
  const [uploadFileList, setUploadFileList] = useState<UploadFile[]>([]);

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
      message.success(`${"应用"}: ${template.name}`);
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
      message.success("模板已更新");
      loadTemplates();
    } catch (error: any) {
      message.error(`${"失败"}: ${error.message}`);
    }
  };

  /**
   * 保存当前配置为模板
   */
  const saveAsTemplate = async () => {
    if (!templateName.trim()) {
      message.error("请输入模板名称");
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
        message.success("模板更新成功");
      } else {
        // 创建新模板
        await apiService.createConfigTemplate({
          name: templateName,
          description: templateDesc || undefined,
          config,
        });
        message.success("模板保存成功");
      }
      setSaveTemplateVisible(false);
      setTemplateName('');
      setTemplateDesc('');
      setEditingTemplate(null);
      loadTemplates();
    } catch (error: any) {
      message.error(`${"保存失败"}: ${error.message}`);
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
      message.success("已设为默认模板");
      loadTemplates();
    } catch (error: any) {
      message.error(`${"失败"}: ${error.message}`);
    }
  };

  /**
   * 删除模板
   */
  const deleteTemplate = async (id: number) => {
    try {
      await apiService.deleteConfigTemplate(id);
      message.success("模板已删除");
      loadTemplates();
    } catch (error: any) {
      message.error(`${"删除失败"}: ${error.message}`);
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
      message.error(`${"失败"}: ${error.message}`);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadScenarios();
    loadTemplates();
    loadInjectionFiles();
    loadCertificates();
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
   * 加载 TLS 证书列表
   */
  const loadCertificates = async () => {
    try {
      const response = await apiService.getTLSCertificates();
      if (response.success && response.certificates) {
        setCertificates(response.certificates);
      }
    } catch (error) {
      console.error('Failed to load TLS certificates:', error);
    }
  };

  /**
   * 删除场景
   */
  const handleDelete = async (filename: string) => {
    Modal.confirm({
      title: "确认删除",
      content: `确定要删除场景 "${filename}" 吗？`,
      okText: "删除",
      okType: 'danger',
      cancelText: "取消",
      onOk: async () => {
        try {
          await apiService.deleteScenario(filename);
          message.success("删除成功");
          loadScenarios();
        } catch (error: any) {
          message.error(`${"删除失败"}: ${error.message}`);
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
        message.success("副本创建成功");
        loadScenarios();
      }
    } catch (error: any) {
      message.error(`${"失败"}: ${error.message}`);
    }
  };

  /**
   * 批量删除场景
   */
  const handleBatchDelete = () => {
    if (selectedRowKeys.length === 0) return;
    Modal.confirm({
      title: "确认批量删除",
      content: `确定要删除选中的 ${selectedRowKeys.length} 个场景吗？`,
      okText: "删除",
      okType: 'danger',
      cancelText: "取消",
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
        message.success(`删除完成：成功 ${success} 个，失败 ${fail} 个`);
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
          title: `${"场景管理"}: ${filename}`,
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
      message.error(`${"失败"}: ${error.message}`);
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
      message.error(`${"失败"}: ${error.message}`);
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
      message.success(editingData ? "场景更新成功" : "场景创建成功");
      setFormVisible(false);
      setEditingData(undefined);
      await loadScenarios();
    } catch (error: any) {
      message.error(`${"保存失败"}: ${error.message}`);
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
   * 处理 XML 文件上传
   */
  const handleXmlFileUpload = (file: File) => {
    const reader = new FileReader();
    reader.onload = async (e) => {
      const xmlContent = e.target?.result as string;
      const filename = file.name;

      try {
        // 直接保存 XML 到后端
        // 后端采用宽松策略：即使格式有问题也会保存
        const response = await apiService.saveScenarioXml(filename, xmlContent);
        if (response.success) {
          // 显示成功消息和警告（如果有）
          if (response.warning) {
            message.warning(`场景文件 ${filename} 已上传，但存在警告：${response.warning}`);
          } else {
            message.success(`场景文件 ${filename} 已上传`);
          }
          setUploadFileList([]);
          await loadScenarios();
        } else {
          message.error(response.error || '上传失败');
        }
      } catch (error: any) {
        message.error(`上传失败: ${error.message}`);
      }
    };
    reader.readAsText(file);

    // 阻止自动上传
    return false;
  };

  /**
   * 打开 XML 编辑器
   */
  const handleEditXml = async (filename: string) => {
    try {
      const response = await apiService.getScenarioXml(filename);
      if (response.success && response.xml) {
        setXmlEditorFilename(filename);
        setXmlEditorContent(response.xml);
        setXmlEditorVisible(true);
      }
    } catch (error: any) {
      message.error(`${"失败"}: ${error.message}`);
    }
  };

  /**
   * 保存编辑的 XML
   */
  const handleSaveXml = async () => {
    try {
      setXmlEditorSaving(true);
      const response = await apiService.saveScenarioXml(xmlEditorFilename, xmlEditorContent);
      if (response.success) {
        // 显示成功消息和警告（如果有）
        if (response.warning) {
          message.warning(`${"保存成功"}，但存在警告：${response.warning}`);
        } else {
          message.success("保存成功");
        }
        setXmlEditorVisible(false);
        await loadScenarios();
      } else {
        message.error(response.error || "保存失败");
      }
    } catch (error: any) {
      message.error(`${"保存失败"}: ${error.message}`);
    } finally {
      setXmlEditorSaving(false);
    }
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
      minRtpPort: undefined, // 可选配置
      maxRtpPort: undefined, // 可选配置
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
        scenarioName: selectedScenario?.name || "未知场景",
        status: TestTaskStatus.RUNNING,
        startTime: Date.now(),
        config: {
          rate: values.rate,
          ratePeriod: values.ratePeriod, // 速率周期（毫秒），可选
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
          regScenarioFile: values.regScenarioFile,
          regMaxCalls: values.regMaxCalls,
          certId: values.certId,
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
      // 规范化 RTP 端口值：将 null/undefined/0 转换为 undefined（不传递）
      const normalizedValues = {
        ...values,
        taskId,
        minRtpPort: values.minRtpPort && values.minRtpPort > 0 ? values.minRtpPort : undefined,
        maxRtpPort: values.maxRtpPort && values.maxRtpPort > 0 ? values.maxRtpPort : undefined,
      };

      await apiService.startSippTest(normalizedValues);
      message.success("测试已启动");
      setStartTestVisible(false);
      startTestForm.resetFields();
    } catch (error: any) {
      message.error(`${"启动测试失败"}: ${error.message || "未知错误"}`);
      // 更新任务状态为失败
      if (taskId) {
        updateTask(taskId, {
          status: TestTaskStatus.FAILED,
          error: error.message || "未知错误",
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
      title: "场景名称",
      dataIndex: 'name',
      key: 'name',
    },
    {
      title: "文件名",
      dataIndex: 'filename',
      key: 'filename',
    },
    {
      title: "操作",
      key: 'action',
      render: (_: any, record: ScenarioFile) => (
        <Space size="small" wrap>
          <Button
            type="primary"
            size="small"
            icon={<PlayCircleOutlined />}
            onClick={() => handleStartTest(record)}
          >
            {"启动测试"}
          </Button>
          <Button size="small" icon={<EyeOutlined />} onClick={() => handleView(record.filename)}>
            {"查看"}
          </Button>
          <Button size="small" icon={<EditOutlined />} onClick={() => handleEdit(record.filename)}>
            {"编辑"}
          </Button>
          <Button size="small" icon={<CodeOutlined />} onClick={() => handleEditXml(record.filename)}>
            编辑XML
          </Button>
          <Button size="small" icon={<CopyOutlined />} onClick={() => handleDuplicate(record.filename)}>
            {"创建副本"}
          </Button>
          <Button size="small" icon={<DeleteOutlined />} danger onClick={() => handleDelete(record.filename)}>
            {"删除"}
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
            <span>{"场景管理"}</span>
          </Space>
        }
        extra={
          <Space>
            {selectedRowKeys.length > 0 && (
              <Button danger icon={<DeleteOutlined />} onClick={handleBatchDelete}>
                {"批量删除"} ({selectedRowKeys.length})
              </Button>
            )}
            <Upload
              accept=".xml"
              fileList={uploadFileList}
              beforeUpload={handleXmlFileUpload}
              onRemove={() => setUploadFileList([])}
              maxCount={1}
            >
              <Button icon={<UploadOutlined />}>
                上传场景文件
              </Button>
            </Upload>
            <Button type="primary" icon={<PlusOutlined />} onClick={handleCreate}>
              {"新建场景"}
            </Button>
            <Button onClick={loadScenarios}>{"刷新"}</Button>
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
            showTotal: (total) => `${total} ${"场景管理".toLowerCase()}`,
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
            <span>{"启动测试"}：{selectedScenario?.name}</span>
          </Space>
        }
        open={startTestVisible}
        onCancel={handleStartTestCancel}
        onOk={handleStartTestSubmit}
        confirmLoading={startTestLoading}
        width={700}
        okText={"启动测试"}
        cancelText={"取消"}
      >
        {/* 模板选择区域 */}
        <div style={{ marginBottom: 16, padding: 12, background: '#fafafa', borderRadius: 4 }}>
          <Space style={{ width: '100%' }}>
            <span style={{ fontWeight: 'bold' }}>{"配置模板"}:</span>
            <Select
              style={{ width: 200 }}
              placeholder={"选择配置模板"}
              value={currentTemplateId}
              onChange={applyTemplate}
              allowClear
              onClear={() => setCurrentTemplateId(undefined)}
            >
              {templates.map(tpl => (
                <Select.Option key={tpl.id} value={tpl.id}>
                  {tpl.is_default ? `${tpl.name} (${"当前默认"})` : tpl.name}
                </Select.Option>
              ))}
            </Select>
            {currentTemplateId && (
              <Button size="small" icon={<SaveOutlined />} onClick={updateCurrentTemplate}>
                {"更新当前模板"}
              </Button>
            )}
            <Button size="small" icon={<PlusOutlined />} onClick={() => { setEditingTemplate(null); setTemplateName(''); setTemplateDesc(''); setSaveTemplateVisible(true); }}>
              {"保存为配置模板"}
            </Button>
            <Button size="small" icon={<SettingOutlined />} onClick={() => setManageTemplateVisible(true)}>
              {"管理"}
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
            controlPort: 8888, // SIPp控制端口默认值
            rate: 1,
            ratePeriod: undefined,  // 速率周期（毫秒），可选
            users: 10,
            limit: 10,
            transport: 'udp',
            minRtpPort: undefined, // 可选配置
            maxRtpPort: undefined, // 可选配置
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
                label: <><AppstoreOutlined /> {"基础配置"}</>,
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
                      label={"远程主机"}
                      rules={[{ required: true, message: "请输入远程服务器地址" }]}
                    >
                      <Input placeholder="192.168.21.88" />
                    </Form.Item>

                    <Space style={{ width: '100%' }} size="large">
                      <Form.Item
                        name="remotePort"
                        label={"远程端口"}
                        rules={[{ required: true, message: "请输入远程端口" }]}
                        style={{ flex: 1 }}
                      >
                        <InputNumber min={1} max={65535} placeholder="5060" style={{ width: '100%' }} />
                      </Form.Item>

                      <Form.Item
                        name="localPort"
                        label={"本地端口"}
                        rules={[{ required: true, message: "请输入本地端口" }]}
                        style={{ flex: 1 }}
                      >
                        <InputNumber min={1} max={65535} placeholder="5070" style={{ width: '100%' }} />
                      </Form.Item>

                      <Form.Item
                        name="controlPort"
                        label={"控制端口"}
                        tooltip="SIPp UDP控制端口，用于动态控制测试参数"
                        rules={[{ required: true, message: "请输入控制端口" }]}
                        style={{ flex: 1 }}
                      >
                        <InputNumber min={1} max={65535} placeholder="8888" style={{ width: '100%' }} />
                      </Form.Item>
                    </Space>

                    <Space style={{ width: '100%' }} size="large">
                      <Form.Item
                        name="transport"
                        label={"传输协议"}
                        rules={[{ required: true, message: "请选择传输协议" }]}
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
                      noStyle
                      shouldUpdate={(prevValues, currentValues) => prevValues.transport !== currentValues.transport}
                    >
                      {({ getFieldValue }) => {
                        const transport = getFieldValue('transport');
                        return transport === 'tls' ? (
                          <Form.Item
                            name="certId"
                            label="TLS 证书"
                            tooltip="选择用于 TLS 连接的证书，如未选择则使用默认证书"
                          >
                            <Select placeholder="选择证书（可选）" allowClear showSearch optionFilterProp="children">
                              {certificates.map((cert: any) => (
                                <Select.Option key={cert.id} value={cert.id}>
                                  {cert.name}
                                  {cert.description && (
                                    <span style={{ color: '#999', marginLeft: 8, fontSize: '12px' }}>
                                      {cert.description}
                                    </span>
                                  )}
                                </Select.Option>
                              ))}
                            </Select>
                          </Form.Item>
                        ) : null;
                      }}
                    </Form.Item>

                    <Form.Item
                      name="injectionFile"
                      label={"注入文件"}
                    >
                      <Select placeholder={"选择注入文件"} allowClear showSearch optionFilterProp="children">
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
                label: <><ClockCircleOutlined /> {"速率配置"}</>,
                forceRender: true,
                children: (
                  <>
                    <Space style={{ width: '100%' }} size="large">
                      <Form.Item
                        name="rate"
                        label={"呼叫速率"}
                        rules={[{ required: true, message: "请输入呼叫速率" }]}
                        style={{ flex: 1 }}
                      >
                        <InputNumber min={0} max={10000} placeholder="1" style={{ width: '100%' }} />
                      </Form.Item>

                      <Form.Item
                        name="ratePeriod"
                        label={"速率周期 (可选)"}
                        style={{ flex: 1 }}
                        tooltip="在指定周期（毫秒）内发起 rate 个呼叫。例如：rate=10, ratePeriod=5000 表示每5秒发起10个呼叫（间隔500ms）"
                      >
                        <InputNumber
                          min={0}
                          max={3600000}
                          placeholder="留空使用默认"
                          addonAfter="ms"
                          style={{ width: '100%' }}
                        />
                      </Form.Item>

                      <Form.Item
                        name="users"
                        label={"最大并发"}
                        rules={[{ required: true, message: "请输入并发用户数" }]}
                        style={{ flex: 1 }}
                      >
                        <InputNumber min={1} max={100000} placeholder="10" style={{ width: '100%' }} />
                      </Form.Item>

                      <Form.Item
                        name="limit"
                        label={"呼叫限制"}
                        rules={[{ required: true, message: "请输入呼叫限制" }]}
                        style={{ flex: 1 }}
                      >
                        <InputNumber min={0} max={1000000} placeholder="10" style={{ width: '100%' }} />
                      </Form.Item>
                    </Space>

                    <Form.Item
                      name="timeout"
                      label={"超时时间"}
                    >
                      <InputNumber min={0} step={1000} placeholder="120000" style={{ width: '100%' }} />
                    </Form.Item>
                  </>
                ),
              },
              {
                key: 'media',
                label: <><AudioOutlined /> {"RTP配置"}</>,
                forceRender: true,
                children: (
                  <>
                    <Space style={{ width: '100%' }} size="large">
                      <Form.Item
                        name="minRtpPort"
                        label="RTP Min Port (可选)"
                        style={{ flex: 1 }}
                        dependencies={['maxRtpPort']}
                        rules={[
                          ({ getFieldValue }) => ({
                            validator(_, value) {
                              const maxRtpPort = getFieldValue('maxRtpPort');

                              // 两者都为空或0，允许
                              if ((!value || value === 0) && (!maxRtpPort || maxRtpPort === 0)) {
                                return Promise.resolve();
                              }

                              // 只有一个有值，不允许
                              if ((value && value > 0) && (!maxRtpPort || maxRtpPort === 0)) {
                                return Promise.reject(new Error('设置最小端口时，必须同时设置最大端口'));
                              }

                              // 两者都有值，检查大小关系
                              if (value && maxRtpPort && value >= maxRtpPort) {
                                return Promise.reject(new Error('最小端口必须小于最大端口'));
                              }

                              return Promise.resolve();
                            },
                          }),
                        ]}
                      >
                        <InputNumber min={1024} max={65535} placeholder="留空表示不限制" style={{ width: '100%' }} />
                      </Form.Item>
                      <Form.Item
                        name="maxRtpPort"
                        label="RTP Max Port (可选)"
                        style={{ flex: 1 }}
                        dependencies={['minRtpPort']}
                        rules={[
                          ({ getFieldValue }) => ({
                            validator(_, value) {
                              const minRtpPort = getFieldValue('minRtpPort');

                              // 两者都为空或0，允许
                              if ((!minRtpPort || minRtpPort === 0) && (!value || value === 0)) {
                                return Promise.resolve();
                              }

                              // 只有一个有值，不允许
                              if ((!minRtpPort || minRtpPort === 0) && (value && value > 0)) {
                                return Promise.reject(new Error('设置最大端口时，必须同时设置最小端口'));
                              }

                              // 两者都有值，检查大小关系
                              if (minRtpPort && value && minRtpPort >= value) {
                                return Promise.reject(new Error('最大端口必须大于最小端口'));
                              }

                              return Promise.resolve();
                            },
                          }),
                        ]}
                      >
                        <InputNumber min={1024} max={65535} placeholder="留空表示不限制" style={{ width: '100%' }} />
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
                key: 'trace',
                label: <><BugOutlined /> {"日志追踪"}</>,
                forceRender: true,
                children: (
                  <Space wrap style={{ width: '100%' }}>
                    <Form.Item name="traceMsg" label={"消息追踪"} valuePropName="checked" style={{ marginBottom: 8 }}>
                      <Switch />
                    </Form.Item>
                    <Form.Item name="traceErr" label={"错误追踪"} valuePropName="checked" style={{ marginBottom: 8 }}>
                      <Switch />
                    </Form.Item>
                    <Form.Item name="traceCalldebug" label={"呼叫调试"} valuePropName="checked" style={{ marginBottom: 8 }}>
                      <Switch />
                    </Form.Item>
                    <Form.Item name="traceShortmsg" label={"短消息"} valuePropName="checked" style={{ marginBottom: 8 }}>
                      <Switch />
                    </Form.Item>
                    <Form.Item name="traceLogs" label={"日志"} valuePropName="checked" style={{ marginBottom: 8 }}>
                      <Switch />
                    </Form.Item>
                    <Form.Item name="traceRtt" label={"往返时间"} valuePropName="checked" style={{ marginBottom: 8 }}>
                      <Switch />
                    </Form.Item>
                  </Space>
                ),
              },
              {
                key: 'advanced',
                label: <><SettingOutlined /> {"高级选项"}</>,
                forceRender: true,
                children: (
                  <Space direction="vertical" style={{ width: '100%' }}>
                    {/* 场景相关高级选项 */}
                    <Form.Item
                      name="oocsf"
                      label={"会话外场景文件"}
                    >
                      <Select placeholder={"选择会话外场景文件"} allowClear showSearch optionFilterProp="children">
                        {scenarios.filter(s => s.filename !== selectedScenario?.filename).map(s => (
                          <Select.Option key={s.filename} value={s.filename}>
                            {s.name} ({s.filename})
                          </Select.Option>
                        ))}
                      </Select>
                    </Form.Item>

                    <Form.Item
                      name="regScenarioFile"
                      label="注册场景文件 (TLS连接复用)"
                      tooltip="TLS传输时先执行注册场景，主场景复用TLS连接。适用于需要先注册再发起呼叫的场景。"
                    >
                      <Select placeholder="选择注册场景文件（可选）" allowClear showSearch optionFilterProp="children">
                        {scenarios.filter(s => s.filename !== selectedScenario?.filename).map(s => (
                          <Select.Option key={s.filename} value={s.filename}>
                            {s.name} ({s.filename})
                          </Select.Option>
                        ))}
                      </Select>
                    </Form.Item>

                    <Form.Item
                      name="regMaxCalls"
                      label="注册呼叫最大数量"
                      tooltip="限制注册呼叫的次数，0或不填表示无限制"
                    >
                      <InputNumber min={0} max={1000000} placeholder="无限制" style={{ width: '100%' }} />
                    </Form.Item>

                    {/* 网络相关高级选项 */}
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
        title={editingTemplate ? "编辑配置模板" : "保存为配置模板"}
        open={saveTemplateVisible}
        onOk={saveAsTemplate}
        onCancel={() => { setSaveTemplateVisible(false); setTemplateName(''); setTemplateDesc(''); setEditingTemplate(null); }}
        okText={"保存"}
        cancelText={"取消"}
      >
        <Form layout="vertical">
          <Form.Item label={"模板名称"} required>
            <Input
              value={templateName}
              onChange={e => setTemplateName(e.target.value)}
              placeholder={"请输入模板名称"}
            />
          </Form.Item>
          <Form.Item label={"模板描述"}>
            <Input.TextArea
              value={templateDesc}
              onChange={e => setTemplateDesc(e.target.value)}
              placeholder={"模板描述"}
              rows={2}
            />
          </Form.Item>
        </Form>
      </Modal>

      {/* 模板管理弹窗 */}
      <Modal
        title={"配置模板"}
        open={manageTemplateVisible}
        onCancel={() => setManageTemplateVisible(false)}
        footer={null}
        width={600}
      >
        <List
          dataSource={templates}
          locale={{ emptyText: "暂无模板" }}
          renderItem={(item) => (
            <List.Item
              actions={[
                <Tooltip title={item.is_default ? "当前默认" : "设为默认"} key="default">
                  <Button
                    type="text"
                    icon={item.is_default ? <StarFilled style={{ color: '#faad14' }} /> : <StarOutlined />}
                    onClick={() => setDefaultTemplate(item.id)}
                  />
                </Tooltip>,
                <Tooltip title={"编辑"} key="edit">
                  <Button
                    type="text"
                    icon={<EditOutlined />}
                    onClick={() => { editTemplate(item); setManageTemplateVisible(false); }}
                  />
                </Tooltip>,
                <Popconfirm
                  key="delete"
                  title={"确认删除"}
                  onConfirm={() => deleteTemplate(item.id)}
                  okText={"删除"}
                  cancelText={"取消"}
                >
                  <Button type="text" danger icon={<DeleteOutlined />} />
                </Popconfirm>,
              ]}
            >
              <List.Item.Meta
                title={
                  <Space>
                    {item.name}
                    {item.is_default && <Tag color="blue">{"当前默认"}</Tag>}
                  </Space>
                }
                description={item.description || "无描述"}
              />
            </List.Item>
          )}
        />
      </Modal>

      {/* XML 编辑器弹窗 */}
      <Modal
        title={
          <Space>
            <CodeOutlined />
            <span>编辑 XML：{xmlEditorFilename}</span>
          </Space>
        }
        open={xmlEditorVisible}
        onCancel={() => {
          setXmlEditorVisible(false);
          setXmlEditorContent('');
          setXmlEditorFilename('');
        }}
        onOk={handleSaveXml}
        confirmLoading={xmlEditorSaving}
        width={1000}
        okText={"保存"}
        cancelText={"取消"}
      >
        <Input.TextArea
          value={xmlEditorContent}
          onChange={(e) => setXmlEditorContent(e.target.value)}
          rows={25}
          style={{
            fontFamily: 'Consolas, Monaco, monospace',
            fontSize: '12px',
            lineHeight: '1.5',
          }}
          placeholder="在此编辑 XML 内容..."
        />
        <div style={{ marginTop: 12, padding: 12, background: '#f5f5f5', borderRadius: 4 }}>
          <Space direction="vertical" size={4}>
            <div style={{ fontWeight: 'bold', color: '#1890ff' }}>💡 提示：</div>
            <div style={{ fontSize: '12px', color: '#666' }}>
              • 支持直接编辑 SIPp XML 场景文件
            </div>
            <div style={{ fontSize: '12px', color: '#666' }}>
              • 保存时不进行严格的 XML 格式检验
            </div>
            <div style={{ fontSize: '12px', color: '#666' }}>
              • 即使格式有误也会保存文件，系统会尝试解析或使用默认值
            </div>
            <div style={{ fontSize: '12px', color: '#666' }}>
              • 不支持的参数将被自动忽略
            </div>
          </Space>
        </div>
      </Modal>
    </div>
  );
};

export default Scenarios;
