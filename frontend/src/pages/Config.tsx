import React, { useState, useEffect } from 'react';
import { Card, Form, InputNumber, Button, Space, message, Row, Col, Select, Alert, Tag } from 'antd';
import { CheckCircleOutlined } from '@ant-design/icons';
import { useAppStore } from '@/stores/useAppStore';
import { wsService } from '@/services/websocket';
import { apiService } from '@/services/api';
import type { ScenarioFile } from '@/types';

/**
 * 配置页面
 * 职责：管理测试配置参数和场景选择
 */
const Config: React.FC = () => {
  const { testConfig, setTestConfig, currentScenario, setCurrentScenario } = useAppStore();
  const [form] = Form.useForm();
  const [loading, setLoading] = useState(false);
  const [scenarios, setScenarios] = useState<ScenarioFile[]>([]);
  const [scenariosLoading, setScenariosLoading] = useState(false);
  const [configSaved, setConfigSaved] = useState(true);

  /**
   * 加载场景列表
   */
  const loadScenarios = async () => {
    setScenariosLoading(true);
    try {
      const response = await apiService.listScenarios();
      if (response.success && response.scenarios) {
        setScenarios(response.scenarios);
      }
    } catch (error: any) {
      message.error(`加载场景列表失败: ${error.message}`);
    } finally {
      setScenariosLoading(false);
    }
  };

  useEffect(() => {
    loadScenarios();
  }, []);

  /**
   * 监听表单值变化
   */
  useEffect(() => {
    const subscription = form.getFieldsValue();
    setConfigSaved(false);
  }, [form]);

  /**
   * 场景选择变更
   */
  const handleScenarioChange = (filename: string) => {
    setCurrentScenario(filename);
    message.success(`已选择场景: ${scenarios.find(s => s.filename === filename)?.name || filename}`);
  };

  /**
   * 应用配置
   */
  const handleApply = async (values: any) => {
    setLoading(true);
    try {
      // 更新本地状态（自动持久化到 localStorage）
      setTestConfig(values);

      // 发送命令到SIPp
      if (values.rate !== testConfig.rate) {
        wsService.setRate(values.rate);
      }
      if (values.users !== testConfig.users) {
        wsService.setUsers(values.users);
      }
      if (values.limit !== testConfig.limit) {
        wsService.setLimit(values.limit);
      }

      setConfigSaved(true);
      message.success('配置已保存并应用（已持久化到本地存储）');
    } catch (error: any) {
      message.error(`应用配置失败: ${error.message}`);
    } finally {
      setLoading(false);
    }
  };

  /**
   * 重置配置
   */
  const handleReset = () => {
    form.setFieldsValue(testConfig);
  };

  return (
    <div style={{ padding: '24px' }}>
      {/* 配置状态提示 */}
      <Alert
        message={
          <Space>
            <CheckCircleOutlined />
            <span>配置已持久化到本地存储</span>
            {configSaved ? (
              <Tag color="success">已保存</Tag>
            ) : (
              <Tag color="warning">有未保存的更改</Tag>
            )}
          </Space>
        }
        description="您的测试配置会自动保存到浏览器本地存储，刷新页面后配置不会丢失。"
        type="info"
        showIcon={false}
        style={{ marginBottom: '16px' }}
      />

      <Card title="测试配置">
        <Form
          form={form}
          layout="vertical"
          initialValues={testConfig}
          onFinish={handleApply}
          onValuesChange={() => setConfigSaved(false)}
        >
          {/* 场景选择 */}
          <Row gutter={[16, 16]}>
            <Col span={24}>
              <Form.Item
                label="测试场景"
                tooltip="选择要执行的SIPp测试场景"
              >
                <Select
                  value={currentScenario}
                  onChange={handleScenarioChange}
                  placeholder="请选择测试场景"
                  loading={scenariosLoading}
                  showSearch
                  optionFilterProp="children"
                  filterOption={(input, option) =>
                    (option?.label ?? '').toLowerCase().includes(input.toLowerCase())
                  }
                  options={scenarios.map(scenario => ({
                    value: scenario.filename,
                    label: `${scenario.name} (${scenario.filename})`,
                  }))}
                  style={{ width: '100%' }}
                />
              </Form.Item>
            </Col>
          </Row>

          <Row gutter={[16, 16]}>
            <Col xs={24} md={12} lg={8}>
              <Form.Item
                label="呼叫速率 (calls/sec)"
                name="rate"
                rules={[
                  { required: true, message: '请输入呼叫速率' },
                  { type: 'number', min: 0, max: 10000, message: '速率范围: 0-10000' },
                ]}
              >
                <InputNumber
                  style={{ width: '100%' }}
                  min={0}
                  max={10000}
                  step={1}
                  placeholder="例如: 10"
                />
              </Form.Item>
            </Col>

            <Col xs={24} md={12} lg={8}>
              <Form.Item
                label="并发用户数"
                name="users"
                rules={[
                  { required: true, message: '请输入并发用户数' },
                  { type: 'number', min: 1, max: 100000, message: '用户数范围: 1-100000' },
                ]}
              >
                <InputNumber
                  style={{ width: '100%' }}
                  min={1}
                  max={100000}
                  step={10}
                  placeholder="例如: 100"
                />
              </Form.Item>
            </Col>

            <Col xs={24} md={12} lg={8}>
              <Form.Item
                label="呼叫限制"
                name="limit"
                tooltip="0 表示无限制"
                rules={[
                  { required: true, message: '请输入呼叫限制' },
                  { type: 'number', min: 0, message: '限制必须大于等于0' },
                ]}
              >
                <InputNumber
                  style={{ width: '100%' }}
                  min={0}
                  step={100}
                  placeholder="例如: 1000 (0表示无限制)"
                />
              </Form.Item>
            </Col>
          </Row>

          <Form.Item>
            <Space>
              <Button type="primary" htmlType="submit" loading={loading}>
                应用配置
              </Button>
              <Button onClick={handleReset}>重置</Button>
            </Space>
          </Form.Item>
        </Form>
      </Card>

      <Card title="日志配置" style={{ marginTop: '24px' }}>
        <Space>
          <Button onClick={() => wsService.setTraceError(true)}>启用错误日志</Button>
          <Button onClick={() => wsService.setTraceError(false)}>禁用错误日志</Button>
          <Button onClick={() => wsService.setTraceMessages(true)}>启用消息日志</Button>
          <Button onClick={() => wsService.setTraceMessages(false)}>禁用消息日志</Button>
        </Space>
      </Card>

      <Card title="统计控制" style={{ marginTop: '24px' }}>
        <Space>
          <Button onClick={() => wsService.resetStats('all')}>重置所有统计</Button>
          <Button onClick={() => wsService.getStats()}>获取统计数据</Button>
        </Space>
      </Card>
    </div>
  );
};

export default Config;
