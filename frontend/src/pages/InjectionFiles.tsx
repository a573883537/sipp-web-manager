import React, { useEffect, useState } from 'react';
import {
  Card,
  Table,
  Button,
  Modal,
  Form,
  Input,
  message,
  Space,
  Tag,
  Popconfirm,
  Typography,
  Alert,
  Upload,
  Tabs,
} from 'antd';
import {
  PlusOutlined,
  EditOutlined,
  DeleteOutlined,
  FileTextOutlined,
  UploadOutlined,
} from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import { apiService } from '@/services/api';
import type { UploadFile } from 'antd/es/upload/interface';

const { TextArea } = Input;
const { Text } = Typography;

interface InjectionFile {
  id: number;
  filename: string;
  description?: string;
  content: string;
  field_count: number;
  row_count: number;
  read_mode: 'SEQUENTIAL' | 'RANDOM' | 'USER';
  created_at: string;
  updated_at: string;
}

/**
 * 注入文件管理页面
 */
const InjectionFiles: React.FC = () => {
  const [files, setFiles] = useState<InjectionFile[]>([]);
  const [loading, setLoading] = useState(false);
  const [modalVisible, setModalVisible] = useState(false);
  const [modalMode, setModalMode] = useState<'create' | 'edit'>('create');
  const [form] = Form.useForm();
  const [fileList, setFileList] = useState<UploadFile[]>([]);

  // 加载注入文件列表
  const loadFiles = async () => {
    setLoading(true);
    try {
      const response: any = await apiService.listInjectionFiles();
      if (response.success && response.files) {
        setFiles(response.files);
      }
    } catch (error: any) {
      message.error(`${"失败"}: ${error.message}`);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadFiles();
  }, []);

  // 打开创建/编辑对话框
  const handleOpenModal = (mode: 'create' | 'edit', file?: InjectionFile) => {
    setModalMode(mode);
    setFileList([]); // 重置文件列表
    if (file) {
      form.setFieldsValue({
        filename: file.filename,
        description: file.description,
        content: file.content,
      });
    } else {
      form.resetFields();
    }
    setModalVisible(true);
  };

  // 处理文件上传
  const handleFileUpload = (file: File) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const content = e.target?.result as string;
      const filename = file.name;

      // 自动填充表单
      form.setFieldsValue({
        filename: filename,
        content: content,
      });

      message.success(`文件 ${filename} 已加载`);
    };
    reader.readAsText(file);

    // 阻止自动上传
    return false;
  };

  // 保存注入文件
  const handleSave = async () => {
    try {
      const values = await form.validateFields();
      const response = await apiService.saveInjectionFile(values);
      if (response.success) {
        message.success("保存成功");
        setModalVisible(false);
        form.resetFields();
        loadFiles();
      } else {
        message.error(response.error || "保存失败");
      }
    } catch (error: any) {
      if (error.errorFields) {
        message.error("请检查表单输入");
      } else {
        message.error(`${"保存失败"}: ${error.message}`);
      }
    }
  };

  // 删除注入文件
  const handleDelete = async (filename: string) => {
    try {
      const response = await apiService.deleteInjectionFile(filename);
      if (response.success) {
        message.success("删除成功");
        loadFiles();
      } else {
        message.error(response.error || "删除失败");
      }
    } catch (error: any) {
      message.error(`${"删除失败"}: ${error.message}`);
    }
  };

  // 表格列定义
  const columns: ColumnsType<InjectionFile> = [
    {
      title: "文件名",
      dataIndex: 'filename',
      key: 'filename',
      width: 200,
      render: (text) => (
        <Space>
          <FileTextOutlined />
          <Text strong>{text}</Text>
        </Space>
      ),
    },
    {
      title: "描述",
      dataIndex: 'description',
      key: 'description',
      ellipsis: true,
    },
    {
      title: "读取模式",
      dataIndex: 'read_mode',
      key: 'read_mode',
      width: 120,
      render: (mode: string) => {
        const colorMap: Record<string, string> = {
          SEQUENTIAL: 'blue',
          RANDOM: 'green',
          USER: 'orange',
        };
        return <Tag color={colorMap[mode] || 'default'}>{mode}</Tag>;
      },
    },
    {
      title: "字段数",
      dataIndex: 'field_count',
      key: 'field_count',
      width: 80,
      align: 'center',
    },
    {
      title: "数据行数",
      dataIndex: 'row_count',
      key: 'row_count',
      width: 100,
      align: 'center',
    },
    {
      title: "创建时间",
      dataIndex: 'created_at',
      key: 'created_at',
      width: 180,
      render: (text) => new Date(text).toLocaleString(),
    },
    {
      title: "操作",
      key: 'action',
      width: 150,
      render: (_, record) => (
        <Space>
          <Button
            type="link"
            size="small"
            icon={<EditOutlined />}
            onClick={() => handleOpenModal('edit', record)}
          >
            {"编辑"}
          </Button>
          <Popconfirm
            title={"确认删除"}
            description={"删除文件"}
            onConfirm={() => handleDelete(record.filename)}
            okText={"确认"}
            cancelText={"取消"}
          >
            <Button type="link" size="small" danger icon={<DeleteOutlined />}>
              {"删除"}
            </Button>
          </Popconfirm>
        </Space>
      ),
    },
  ];

  return (
    <div style={{ padding: 24 }}>
      <Card
        title={
          <Space>
            <FileTextOutlined />
            <span>{"注入文件"}</span>
          </Space>
        }
        extra={
          <Button
            type="primary"
            icon={<PlusOutlined />}
            onClick={() => handleOpenModal('create')}
          >
            {"新建注入文件"}
          </Button>
        }
      >
        <Alert
          message="CSV 格式与字段说明"
          description={
            <div style={{ lineHeight: '1.8' }}>
              <p style={{ marginBottom: 12, fontWeight: 'bold' }}>📝 格式规范：</p>
              <ul style={{ marginLeft: 20, marginBottom: 16 }}>
                <li><strong>第一行</strong>：读取模式（SEQUENTIAL顺序 / RANDOM随机 / USER用户模式）</li>
                <li><strong>后续行</strong>：数据行，使用分号 <code>;</code> 分隔字段</li>
                <li><strong>注释</strong>：以 <code>#</code> 开头的行会被忽略</li>
              </ul>

              <p style={{ marginBottom: 12, fontWeight: 'bold' }}>🔖 字段用途说明（INVITE场景标准映射）：</p>
              <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: 8 }}>
                <thead>
                  <tr style={{ background: '#f5f5f5' }}>
                    <th style={{ padding: '8px', border: '1px solid #d9d9d9', textAlign: 'left' }}>字段</th>
                    <th style={{ padding: '8px', border: '1px solid #d9d9d9', textAlign: 'left' }}>场景引用</th>
                    <th style={{ padding: '8px', border: '1px solid #d9d9d9', textAlign: 'left' }}>用途说明</th>
                    <th style={{ padding: '8px', border: '1px solid #d9d9d9', textAlign: 'left' }}>示例值</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td style={{ padding: '8px', border: '1px solid #d9d9d9' }}>第1列</td>
                    <td style={{ padding: '8px', border: '1px solid #d9d9d9' }}><code>[field0]</code></td>
                    <td style={{ padding: '8px', border: '1px solid #d9d9d9' }}>主叫号码/用户名</td>
                    <td style={{ padding: '8px', border: '1px solid #d9d9d9' }}>1001, 2001</td>
                  </tr>
                  <tr style={{ background: '#fafafa' }}>
                    <td style={{ padding: '8px', border: '1px solid #d9d9d9' }}>第2列</td>
                    <td style={{ padding: '8px', border: '1px solid #d9d9d9' }}><code>[field1]</code></td>
                    <td style={{ padding: '8px', border: '1px solid #d9d9d9' }}>认证密码（需要认证时填写）</td>
                    <td style={{ padding: '8px', border: '1px solid #d9d9d9' }}>pass123, secret</td>
                  </tr>
                  <tr>
                    <td style={{ padding: '8px', border: '1px solid #d9d9d9' }}>第3列</td>
                    <td style={{ padding: '8px', border: '1px solid #d9d9d9' }}><code>[field2]</code></td>
                    <td style={{ padding: '8px', border: '1px solid #d9d9d9' }}>被叫号码</td>
                    <td style={{ padding: '8px', border: '1px solid #d9d9d9' }}>9000, 8888</td>
                  </tr>
                  <tr style={{ background: '#fafafa' }}>
                    <td style={{ padding: '8px', border: '1px solid #d9d9d9' }}>第N列</td>
                    <td style={{ padding: '8px', border: '1px solid #d9d9d9' }}><code>[fieldN-1]</code></td>
                    <td style={{ padding: '8px', border: '1px solid #d9d9d9' }}>自定义扩展字段</td>
                    <td style={{ padding: '8px', border: '1px solid #d9d9d9' }}>任意值</td>
                  </tr>
                </tbody>
              </table>

              <p style={{ marginTop: 12, marginBottom: 8, fontWeight: 'bold' }}>💡 完整示例：</p>
              <div style={{ display: 'flex', gap: 16 }}>
                <div style={{ flex: 1 }}>
                  <p style={{ marginBottom: 4, fontWeight: 'bold', fontSize: 12 }}>CSV文件内容：</p>
                  <pre style={{
                    background: '#f5f5f5',
                    padding: 12,
                    borderRadius: 4,
                    fontSize: 12,
                    overflow: 'auto',
                    margin: 0
                  }}>
{`SEQUENTIAL
# 主叫号码;密码;被叫号码
1001;pass123;9000
1002;pass456;9000
1003;pass789;9000`}
                  </pre>
                </div>
                <div style={{ flex: 1 }}>
                  <p style={{ marginBottom: 4, fontWeight: 'bold', fontSize: 12 }}>场景引用示例：</p>
                  <pre style={{
                    background: '#f5f5f5',
                    padding: 12,
                    borderRadius: 4,
                    fontSize: 12,
                    overflow: 'auto',
                    margin: 0
                  }}>
{`<send><![CDATA[
INVITE sip:[field2]@[remote_ip] SIP/2.0
From: <sip:[field0]@[remote_ip]>
To: <sip:[field2]@[remote_ip]>
[authentication username=[field0]
                password=[field1]]
]]></send>`}
                  </pre>
                </div>
              </div>
              <p style={{ marginTop: 8, fontSize: 12, color: '#666' }}>
                <strong>说明：</strong>不需要认证时密码列可为空但需保留分号（如：<code>1001;;9000</code>）
              </p>
            </div>
          }
          type="info"
          showIcon
          style={{ marginBottom: 16 }}
        />
        <Table
          columns={columns}
          dataSource={files}
          loading={loading}
          rowKey="id"
          pagination={{
            pageSize: 10,
            showTotal: (total) => `${total} ${"注入文件".toLowerCase()}`,
          }}
        />
      </Card>

      <Modal
        title={modalMode === 'create' ? "新建注入文件" : "编辑注入文件"}
        open={modalVisible}
        onOk={handleSave}
        onCancel={() => {
          setModalVisible(false);
          form.resetFields();
          setFileList([]);
        }}
        width={800}
        okText={"保存"}
        cancelText={"取消"}
      >
        <Form form={form} layout="vertical">
          <Form.Item
            label={"文件名"}
            name="filename"
            rules={[
              { required: true, message: "请输入文件名" },
              { pattern: /^[\w-]+\.csv$/, message: 'Filename must end with .csv' },
            ]}
          >
            <Input placeholder="users_4000-4010.csv" disabled={modalMode === 'edit'} />
          </Form.Item>
          <Form.Item label={"描述"} name="description">
            <Input placeholder={"描述"} />
          </Form.Item>

          <Tabs
            defaultActiveKey="manual"
            items={[
              {
                key: 'upload',
                label: (
                  <span>
                    <UploadOutlined />
                    上传文件
                  </span>
                ),
                children: (
                  <div>
                    <Upload
                      accept=".csv"
                      fileList={fileList}
                      beforeUpload={handleFileUpload}
                      onRemove={() => {
                        setFileList([]);
                        form.setFieldsValue({ content: '' });
                      }}
                      maxCount={1}
                    >
                      <Button icon={<UploadOutlined />}>选择 CSV 文件</Button>
                    </Upload>
                    <Alert
                      message="文件上传后将自动填充到下方内容框"
                      type="info"
                      showIcon
                      style={{ marginTop: 16 }}
                    />
                  </div>
                ),
              },
              {
                key: 'manual',
                label: (
                  <span>
                    <FileTextOutlined />
                    手动输入
                  </span>
                ),
                children: (
                  <Form.Item
                    label="CSV Content"
                    name="content"
                    rules={[{ required: true, message: 'Please input CSV content' }]}
                  >
                    <TextArea
                      rows={12}
                      placeholder={`SEQUENTIAL
# caller;password;callee
1001;pass123;9000
1002;pass456;9000
1003;pass789;9000`}
                      style={{ fontFamily: 'monospace' }}
                    />
                  </Form.Item>
                ),
              },
            ]}
          />
        </Form>
      </Modal>
    </div>
  );
};

export default InjectionFiles;
