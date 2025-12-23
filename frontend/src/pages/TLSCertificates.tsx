import React, { useState, useEffect } from 'react';
import {
  Card,
  Table,
  Button,
  Space,
  Modal,
  Form,
  Input,
  message,
  Popconfirm,
  Typography,
  Upload,
} from 'antd';
import {
  PlusOutlined,
  EditOutlined,
  DeleteOutlined,
  ReloadOutlined,
  SafetyCertificateOutlined,
  UploadOutlined,
} from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import { apiService } from '@/services/api';
import type { TlsCertificate, TlsCertificateForm } from '@/types';
import dayjs from 'dayjs';

const { TextArea } = Input;
const { Text } = Typography;

/**
 * TLS 证书管理页面
 * 支持上传、编辑、删除证书
 */
const TLSCertificates: React.FC = () => {
  const [certificates, setCertificates] = useState<TlsCertificate[]>([]);
  const [loading, setLoading] = useState(false);
  const [modalVisible, setModalVisible] = useState(false);
  const [editingCert, setEditingCert] = useState<TlsCertificate | null>(null);
  const [form] = Form.useForm<TlsCertificateForm>();

  /**
   * 加载证书列表
   */
  const loadCertificates = async () => {
    setLoading(true);
    try {
      const response = await apiService.getTLSCertificates();
      if (response.success && response.certificates) {
        setCertificates(response.certificates);
      }
    } catch (error: any) {
      message.error(`加载证书列表失败: ${error.message}`);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadCertificates();
  }, []);

  /**
   * 打开创建/编辑模态框
   */
  const openModal = async (cert?: TlsCertificate) => {
    if (cert) {
      // 编辑模式：加载完整证书内容
      setLoading(true);
      try {
        const response = await apiService.getTLSCertificate(cert.id);
        if (response.success && response.certificate) {
          setEditingCert(response.certificate);
          form.setFieldsValue({
            name: response.certificate.name,
            description: response.certificate.description || '',
            cert_content: response.certificate.cert_content || '',
            key_content: response.certificate.key_content || '',
          });
        }
      } catch (error: any) {
        message.error(`加载证书详情失败: ${error.message}`);
        return;
      } finally {
        setLoading(false);
      }
    } else {
      // 创建模式
      setEditingCert(null);
      form.resetFields();
    }
    setModalVisible(true);
  };

  /**
   * 关闭模态框
   */
  const closeModal = () => {
    setModalVisible(false);
    setEditingCert(null);
    form.resetFields();
  };

  /**
   * 保存证书
   */
  const handleSave = async () => {
    try {
      const values = await form.validateFields();

      if (editingCert) {
        // 更新
        await apiService.updateTLSCertificate(editingCert.id, values);
        message.success('证书更新成功');
      } else {
        // 创建
        await apiService.createTLSCertificate(values);
        message.success('证书创建成功');
      }

      closeModal();
      loadCertificates();
    } catch (error: any) {
      if (error.errorFields) {
        // 表单验证错误
        return;
      }
      message.error(`保存失败: ${error.message}`);
    }
  };

  /**
   * 删除证书
   */
  const handleDelete = async (id: string) => {
    try {
      await apiService.deleteTLSCertificate(id);
      message.success('证书删除成功');
      loadCertificates();
    } catch (error: any) {
      message.error(`删除失败: ${error.message}`);
    }
  };

  /**
   * 上传证书文件
   */
  const handleUploadCert = (info: any) => {
    const file = info.file;
    const reader = new FileReader();
    reader.onload = (e) => {
      const content = e.target?.result as string;
      form.setFieldValue('cert_content', content);
      message.success('证书文件已加载');
    };
    reader.readAsText(file);
    return false; // 阻止自动上传
  };

  /**
   * 上传私钥文件
   */
  const handleUploadKey = (info: any) => {
    const file = info.file;
    const reader = new FileReader();
    reader.onload = (e) => {
      const content = e.target?.result as string;
      form.setFieldValue('key_content', content);
      message.success('私钥文件已加载');
    };
    reader.readAsText(file);
    return false; // 阻止自动上传
  };

  /**
   * 表格列定义
   */
  const columns: ColumnsType<TlsCertificate> = [
    {
      title: '证书名称',
      dataIndex: 'name',
      key: 'name',
      render: (name: string) => (
        <Space>
          <SafetyCertificateOutlined style={{ color: '#52c41a' }} />
          <Text strong>{name}</Text>
        </Space>
      ),
    },
    {
      title: '描述',
      dataIndex: 'description',
      key: 'description',
      ellipsis: true,
      render: (desc?: string) => desc || <Text type="secondary">无描述</Text>,
    },
    {
      title: '创建时间',
      dataIndex: 'created_at',
      key: 'created_at',
      width: 180,
      render: (time: string) => dayjs(time).format('YYYY-MM-DD HH:mm:ss'),
    },
    {
      title: '更新时间',
      dataIndex: 'updated_at',
      key: 'updated_at',
      width: 180,
      render: (time: string) => dayjs(time).format('YYYY-MM-DD HH:mm:ss'),
    },
    {
      title: '操作',
      key: 'action',
      width: 150,
      render: (_: any, record: TlsCertificate) => (
        <Space>
          <Button
            type="link"
            size="small"
            icon={<EditOutlined />}
            onClick={() => openModal(record)}
          >
            编辑
          </Button>
          <Popconfirm
            title="确认删除"
            description="删除证书后，使用该证书的任务将无法启动。确定要删除吗？"
            onConfirm={() => handleDelete(record.id)}
            okText="删除"
            cancelText="取消"
            okButtonProps={{ danger: true }}
          >
            <Button
              type="link"
              size="small"
              danger
              icon={<DeleteOutlined />}
            >
              删除
            </Button>
          </Popconfirm>
        </Space>
      ),
    },
  ];

  return (
    <div>
      <Card
        title={
          <Space>
            <SafetyCertificateOutlined />
            TLS 证书管理
          </Space>
        }
        extra={
          <Space>
            <Button
              icon={<ReloadOutlined />}
              onClick={loadCertificates}
              loading={loading}
            >
              刷新
            </Button>
            <Button
              type="primary"
              icon={<PlusOutlined />}
              onClick={() => openModal()}
            >
              添加证书
            </Button>
          </Space>
        }
      >
        <Table
          columns={columns}
          dataSource={certificates}
          rowKey="id"
          loading={loading}
          pagination={{
            pageSize: 10,
            showSizeChanger: true,
            showTotal: (total) => `共 ${total} 个证书`,
          }}
        />
      </Card>

      {/* 创建/编辑模态框 */}
      <Modal
        title={editingCert ? '编辑 TLS 证书' : '添加 TLS 证书'}
        open={modalVisible}
        onOk={handleSave}
        onCancel={closeModal}
        width={800}
        okText="保存"
        cancelText="取消"
        confirmLoading={loading}
      >
        <Form
          form={form}
          layout="vertical"
          autoComplete="off"
        >
          <Form.Item
            name="name"
            label="证书名称"
            rules={[
              { required: true, message: '请输入证书名称' },
              { max: 255, message: '证书名称不能超过255个字符' },
            ]}
          >
            <Input placeholder="例如：Production TLS Certificate" />
          </Form.Item>

          <Form.Item
            name="description"
            label="描述"
          >
            <TextArea
              rows={2}
              placeholder="证书用途说明（可选）"
              maxLength={500}
            />
          </Form.Item>

          <Form.Item
            name="cert_content"
            label={
              <Space>
                证书内容 (PEM 格式)
                <Upload
                  accept=".crt,.pem"
                  beforeUpload={handleUploadCert}
                  showUploadList={false}
                >
                  <Button size="small" icon={<UploadOutlined />}>
                    上传文件
                  </Button>
                </Upload>
              </Space>
            }
            rules={[{ required: true, message: '请输入或上传证书内容' }]}
          >
            <TextArea
              rows={8}
              placeholder="-----BEGIN CERTIFICATE-----&#10;...&#10;-----END CERTIFICATE-----"
              style={{ fontFamily: 'monospace', fontSize: '12px' }}
            />
          </Form.Item>

          <Form.Item
            name="key_content"
            label={
              <Space>
                私钥内容 (PEM 格式)
                <Upload
                  accept=".key,.pem"
                  beforeUpload={handleUploadKey}
                  showUploadList={false}
                >
                  <Button size="small" icon={<UploadOutlined />}>
                    上传文件
                  </Button>
                </Upload>
              </Space>
            }
            rules={[{ required: true, message: '请输入或上传私钥内容' }]}
          >
            <TextArea
              rows={8}
              placeholder="-----BEGIN PRIVATE KEY-----&#10;...&#10;-----END PRIVATE KEY-----"
              style={{ fontFamily: 'monospace', fontSize: '12px' }}
            />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
};

export default TLSCertificates;
