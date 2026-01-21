import React, { useEffect, useState } from 'react';
import {  Card, Table, Button, Space, message, Modal, Form, Input, Upload, Tag, Popconfirm } from 'antd';
import {
  UploadOutlined,
  DeleteOutlined,
  DownloadOutlined,
  AudioOutlined,
  FileOutlined,
} from '@ant-design/icons';
import { apiService } from '@/services/api';
import type { UploadFile } from 'antd/es/upload/interface';

interface AudioFile {
  filename: string;
  description?: string;
  file_type: 'PCAP' | 'WAV' | 'OTHER';
  file_size: number;
  duration?: number;
  created_at: Date;
}

/**
 * 音频文件管理页面
 * 职责：管理 SIPp RTP 音频文件（PCAP/WAV格式）
 */
const AudioFiles: React.FC = () => {
  const [audioFiles, setAudioFiles] = useState<AudioFile[]>([]);
  const [loading, setLoading] = useState(false);
  const [uploadModalVisible, setUploadModalVisible] = useState(false);
  const [uploadForm] = Form.useForm();
  const [fileList, setFileList] = useState<UploadFile[]>([]);
  const [uploading, setUploading] = useState(false);

  /**
   * 加载音频文件列表
   */
  const loadAudioFiles = async () => {
    setLoading(true);
    try {
      const response = await apiService.listAudioFiles();
      if (response.success && response.files) {
        setAudioFiles(response.files);
      }
    } catch (error: any) {
      message.error(`加载音频文件失败: ${error.message}`);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadAudioFiles();
  }, []);

  /**
   * 打开上传对话框
   */
  const handleOpenUpload = () => {
    uploadForm.resetFields();
    setFileList([]);
    setUploadModalVisible(true);
  };

  /**
   * 上传音频文件
   */
  const handleUpload = async () => {
    try {
      if (fileList.length === 0) {
        message.error('请选择要上传的文件');
        return;
      }

      const values = await uploadForm.validateFields();
      setUploading(true);

      // 获取文件对象：优先使用 originFileObj，如果不存在则直接使用文件对象
      const file = (fileList[0].originFileObj || fileList[0]) as File;

      console.log('上传文件信息:', {
        fileListLength: fileList.length,
        hasOriginFileObj: !!fileList[0]?.originFileObj,
        file: file,
        fileName: file?.name,
        fileSize: file?.size,
        fileType: file?.type,
      });

      if (!file || !file.name) {
        message.error('文件对象无效，请重新选择');
        setUploading(false);
        return;
      }

      await apiService.uploadAudioFile(file, values.description);

      message.success('音频文件上传成功');
      setUploadModalVisible(false);
      uploadForm.resetFields();
      setFileList([]);
      await loadAudioFiles();
    } catch (error: any) {
      console.error('上传失败:', error);
      message.error(`上传失败: ${error.message}`);
    } finally {
      setUploading(false);
    }
  };

  /**
   * 下载音频文件
   */
  const handleDownload = (filename: string) => {
    try {
      apiService.downloadAudioFile(filename);
      message.success('开始下载...');
    } catch (error: any) {
      message.error(`下载失败: ${error.message}`);
    }
  };

  /**
   * 删除音频文件
   */
  const handleDelete = async (filename: string) => {
    try {
      await apiService.deleteAudioFile(filename);
      message.success('音频文件删除成功');
      await loadAudioFiles();
    } catch (error: any) {
      message.error(`删除失败: ${error.message}`);
    }
  };

  /**
   * 格式化文件大小
   */
  const formatFileSize = (bytes: number): string => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  /**
   * 格式化日期
   */
  const formatDate = (date: Date): string => {
    return new Date(date).toLocaleString('zh-CN');
  };

  const columns = [
    {
      title: '文件名',
      dataIndex: 'filename',
      key: 'filename',
      render: (text: string, record: AudioFile) => (
        <Space>
          {record.file_type === 'WAV' ? <AudioOutlined /> : <FileOutlined />}
          <span>{text}</span>
        </Space>
      ),
    },
    {
      title: '类型',
      dataIndex: 'file_type',
      key: 'file_type',
      render: (type: string) => {
        const colorMap: Record<string, string> = {
          PCAP: 'blue',
          WAV: 'green',
          OTHER: 'default',
        };
        return <Tag color={colorMap[type] || 'default'}>{type}</Tag>;
      },
    },
    {
      title: '文件大小',
      dataIndex: 'file_size',
      key: 'file_size',
      render: (size: number) => formatFileSize(size),
    },
    {
      title: '时长',
      dataIndex: 'duration',
      key: 'duration',
      render: (duration?: number) => (duration ? `${duration} 秒` : '-'),
    },
    {
      title: '描述',
      dataIndex: 'description',
      key: 'description',
      render: (text?: string) => text || '-',
    },
    {
      title: '创建时间',
      dataIndex: 'created_at',
      key: 'created_at',
      render: (date: Date) => formatDate(date),
    },
    {
      title: '操作',
      key: 'action',
      render: (_: any, record: AudioFile) => (
        <Space size="small">
          <Button
            size="small"
            icon={<DownloadOutlined />}
            onClick={() => handleDownload(record.filename)}
          >
            下载
          </Button>
          <Popconfirm
            title="确认删除"
            description={`确定要删除音频文件 "${record.filename}" 吗？`}
            onConfirm={() => handleDelete(record.filename)}
            okText="删除"
            cancelText="取消"
          >
            <Button size="small" danger icon={<DeleteOutlined />}>
              删除
            </Button>
          </Popconfirm>
        </Space>
      ),
    },
  ];

  return (
    <div style={{ padding: '24px' }}>
      <Card
        title={
          <Space>
            <AudioOutlined />
            <span>音频文件管理</span>
          </Space>
        }
        extra={
          <Space>
            <Button type="primary" icon={<UploadOutlined />} onClick={handleOpenUpload}>
              上传音频文件
            </Button>
            <Button onClick={loadAudioFiles}>刷新</Button>
          </Space>
        }
      >
        <div style={{ marginBottom: 16, padding: 12, background: '#f0f8ff', borderRadius: 4 }}>
          <Space direction="vertical" size={4}>
            <div style={{ fontWeight: 'bold', color: '#1890ff' }}>💡 使用说明：</div>
            <div style={{ fontSize: '12px', color: '#666' }}>
              • 支持上传 PCAP 和 WAV 格式的音频文件，用于 SIPp exec 命令播放 RTP 音频
            </div>
            <div style={{ fontSize: '12px', color: '#666' }}>
              • 上传后，在场景 XML 中使用 <code>&lt;exec play_pcap_audio="filename.pcap"/&gt;</code> 或 <code>&lt;exec rtp_stream="filename.wav"/&gt;</code> 引用
            </div>
            <div style={{ fontSize: '12px', color: '#666' }}>
              • 音频文件存储在服务器的 <code>audio/</code> 目录下，场景 XML 中直接使用文件名即可
            </div>
          </Space>
        </div>

        <Table
          columns={columns}
          dataSource={audioFiles}
          rowKey="filename"
          loading={loading}
          pagination={{
            pageSize: 10,
            showSizeChanger: true,
            showTotal: (total) => `共 ${total} 个音频文件`,
          }}
        />
      </Card>

      {/* 上传对话框 */}
      <Modal
        title="上传音频文件"
        open={uploadModalVisible}
        onOk={handleUpload}
        onCancel={() => {
          setUploadModalVisible(false);
          uploadForm.resetFields();
          setFileList([]);
        }}
        confirmLoading={uploading}
        okText="上传"
        cancelText="取消"
      >
        <Form form={uploadForm} layout="vertical">
          <Form.Item
            name="file"
            label="音频文件"
            rules={[{ required: true, message: '请选择音频文件' }]}
          >
            <Upload
              accept=".pcap,.wav"
              fileList={fileList}
              beforeUpload={(file) => {
                // 构造正确的 UploadFile 对象
                const uploadFile: UploadFile = {
                  uid: file.name + Date.now(),
                  name: file.name,
                  status: 'done',
                  originFileObj: file,
                };
                setFileList([uploadFile]);
                // 手动更新表单字段值
                uploadForm.setFieldValue('file', file);
                return false; // 阻止自动上传
              }}
              onRemove={() => {
                setFileList([]);
                uploadForm.setFieldValue('file', undefined);
              }}
              maxCount={1}
            >
              <Button icon={<UploadOutlined />}>选择文件（.pcap 或 .wav）</Button>
            </Upload>
          </Form.Item>

          <Form.Item name="description" label="描述（可选）">
            <Input.TextArea rows={3} placeholder="音频文件的描述信息" />
          </Form.Item>
        </Form>

        <div style={{ marginTop: 16, padding: 12, background: '#fffbe6', borderRadius: 4 }}>
          <Space direction="vertical" size={4}>
            <div style={{ fontWeight: 'bold', color: '#faad14' }}>📌 注意：</div>
            <div style={{ fontSize: '12px', color: '#666' }}>
              • PCAP 文件：包含 RTP 数据包的抓包文件
            </div>
            <div style={{ fontSize: '12px', color: '#666' }}>
              • WAV 文件：标准音频文件，SIPp 会自动转换为 RTP 流
            </div>
            <div style={{ fontSize: '12px', color: '#666' }}>
              • 文件大小限制：50MB
            </div>
          </Space>
        </div>
      </Modal>
    </div>
  );
};

export default AudioFiles;
