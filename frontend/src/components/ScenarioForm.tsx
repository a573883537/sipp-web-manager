import React, { useState, useEffect } from 'react';
import {
  Modal,
  Form,
  Input,
  Button,
  Space,
  Select,
  InputNumber,
  Collapse,
  Tag,
  message,
  Divider,
  Tooltip,
  Dropdown,
} from 'antd';
import type { MenuProps } from 'antd';
import {
  PlusOutlined,
  DeleteOutlined,
  CopyOutlined,
  ArrowUpOutlined,
  ArrowDownOutlined,
  SendOutlined,
  CheckCircleOutlined,
  ClockCircleOutlined,
  CodeOutlined,
  ThunderboltOutlined,
  AimOutlined,
} from '@ant-design/icons';
import type { Scenario, ScenarioMessage, MessageType } from '@/types';

const { TextArea } = Input;
const { Panel } = Collapse;

/**
 * RTP 编码映射表（Payload Type → 编码名称/采样率）
 *
 * 注意：SIPp 在实际发送 DTMF 时，会使用硬编码的 payload type 96 作为 telephone-event，
 * 而不是 SDP 协商的值。这是 SIPp 的内部实现行为，与 SDP 配置无关。
 * 建议在 SDP 中同时配置 PT=96 和 PT=101，以兼容不同的服务器实现。
 */
const CODEC_MAP: Record<number, { name: string; rate: number; description: string }> = {
  0: { name: 'PCMU', rate: 8000, description: 'G.711 μ-law' },
  8: { name: 'PCMA', rate: 8000, description: 'G.711 A-law' },
  18: { name: 'G729', rate: 8000, description: 'G.729' },
  4: { name: 'G723', rate: 8000, description: 'G.723.1' },
  9: { name: 'G722', rate: 8000, description: 'G.722' },
  96: { name: 'telephone-event', rate: 8000, description: 'DTMF (RFC 2833) - SIPp 实际使用' },
  101: { name: 'telephone-event', rate: 8000, description: 'DTMF (RFC 2833) - 标准协商' },
};

interface ScenarioFormProps {
  visible: boolean;
  onCancel: () => void;
  onSubmit: (filename: string, scenario: Scenario) => Promise<void>;
  initialData?: { filename: string; scenario: Scenario };
}

/**
 * SIP消息模板库
 *
 * 注入文件字段映射：
 *
 * INVITE场景（3字段CSV格式）：
 * - [field0] = 主叫号码/用户名 (caller_number，鉴权时作为 authentication username)
 * - [field1] = 认证密码 (password，仅 INVITE_AUTH 使用，普通INVITE可留空但需保留列)
 * - [field2] = 被叫号码 (callee_number)
 *
 * CSV示例（INVITE通用格式，同时适用于普通和鉴权场景）：
 * SEQUENTIAL
 * 1001;pass123;2188
 * 1002;pass456;2189
 *
 * 或者普通INVITE场景（密码列可为空）：
 * SEQUENTIAL
 * 1001;;2188
 * 1002;;2189
 *
 * REGISTER场景（2字段）：
 * - [field0] = 注册账号 (account)
 * - [field1] = 注册密码 (password)
 *
 * SIPp常用占位符（自动替换）：
 * - [local_ip] = 本地IP地址
 * - [local_port] = 本地端口（SIP信令）
 * - [remote_ip] = 远程IP地址（目标服务器）
 * - [remote_port] = 远程端口（目标服务器）
 * - [transport] = 传输协议（UDP/TCP/TLS）
 * - [local_ip_type] = 本地IP类型（4=IPv4, 6=IPv6）
 * - [media_ip_type] = 媒体IP类型（4=IPv4, 6=IPv6）
 * - [media_ip] = 媒体IP地址（RTP）
 * - [media_port] = 媒体端口（RTP，自动分配）
 * - [branch] = Via分支参数
 * - [call_id] = Call-ID唯一标识
 * - [call_number] = 当前呼叫序号
 * - [pid] = SIPp进程ID
 * - [timestamp] = 当前时间戳
 * - [len] = Content-Length（自动计算）
 * - [authentication] = 认证头（需auth="true"触发）
 * - [peer_tag_param] = 对端To tag参数
 * - [last_Via:] = 复制上一个请求的Via头
 * - [last_From:] = 复制上一个请求的From头
 * - [last_To:] = 复制上一个请求的To头
 * - [last_Call-ID:] = 复制上一个请求的Call-ID
 * - [last_CSeq:] = 复制上一个请求的CSeq
 *
 * 注意：
 * - RTP端口范围可在"启动测试"时配置（minRtpPort/maxRtpPort）
 * - 媒体IP可在"启动测试"时配置（mediaIp参数）
 */
const SIP_MESSAGE_TEMPLATES = {
  INVITE: `INVITE sip:[field2]@[remote_ip]:[remote_port] SIP/2.0
Via: SIP/2.0/[transport] [local_ip]:[local_port];branch=[branch]
From: <sip:[field0]@[remote_ip]>;tag=[pid]SIPpTag00[call_number]
To: <sip:[field2]@[remote_ip]>
Call-ID: [call_id]
CSeq: 1 INVITE
Contact: <sip:[field0]@[local_ip]:[local_port]>
Max-Forwards: 70
Content-Type: application/sdp
Content-Length: [len]

v=0
o=[field0] 53655765 2353687637 IN IP[local_ip_type] [local_ip]
s=-
c=IN IP[media_ip_type] [media_ip]
t=0 0
m=audio [auto_media_port] RTP/AVP 0
a=rtpmap:0 PCMU/8000`,

  INVITE_AUTH: `INVITE sip:[field2]@[remote_ip]:[remote_port] SIP/2.0
Via: SIP/2.0/[transport] [local_ip]:[local_port];branch=[branch]
From: <sip:[field0]@[remote_ip]>;tag=[pid]SIPpTag00[call_number]
To: <sip:[field2]@[remote_ip]>
Call-ID: [call_id]
CSeq: 2 INVITE
Contact: <sip:[field0]@[local_ip]:[local_port]>
Max-Forwards: 70
[authentication username="[field0]" password="[field1]"]
Content-Type: application/sdp
Content-Length: [len]

v=0
o=[field0] 53655765 2353687637 IN IP[local_ip_type] [local_ip]
s=-
c=IN IP[media_ip_type] [media_ip]
t=0 0
m=audio [auto_media_port] RTP/AVP 0 8 18
a=rtpmap:0 PCMU/8000
a=rtpmap:8 PCMA/8000
a=rtpmap:18 G729/8000`,

  ACK: `ACK sip:[field2]@[remote_ip]:[remote_port] SIP/2.0
Via: SIP/2.0/[transport] [local_ip]:[local_port];branch=[branch]
From: <sip:[field0]@[remote_ip]>;tag=[pid]SIPpTag00[call_number]
To: <sip:[field2]@[remote_ip]>[peer_tag_param]
Call-ID: [call_id]
CSeq: 2 ACK
Contact: <sip:[field0]@[local_ip]:[local_port]>
Max-Forwards: 70
Content-Length: 0`,

  BYE: `BYE sip:[field2]@[remote_ip]:[remote_port] SIP/2.0
Via: SIP/2.0/[transport] [local_ip]:[local_port];branch=[branch]
From: <sip:[field0]@[remote_ip]>;tag=[pid]SIPpTag00[call_number]
To: <sip:[field2]@[remote_ip]>[peer_tag_param]
Call-ID: [call_id]
CSeq: 3 BYE
Contact: <sip:[field0]@[local_ip]:[local_port]>
Max-Forwards: 70
Content-Length: 0`,

  REGISTER: `REGISTER sip:[remote_ip]:[remote_port] SIP/2.0
Via: SIP/2.0/[transport] [local_ip]:[local_port];branch=[branch]
From: <sip:[field0]@[remote_ip]>;tag=[pid]SIPpTag00[call_number]
To: <sip:[field0]@[remote_ip]>
Call-ID: [call_id]
CSeq: 1 REGISTER
Contact: <sip:[field0]@[local_ip]:[local_port]>
Max-Forwards: 70
Expires: 3600
Content-Length: 0`,

  REGISTER_AUTH: `REGISTER sip:[remote_ip]:[remote_port] SIP/2.0
Via: SIP/2.0/[transport] [local_ip]:[local_port];branch=[branch]
From: <sip:[field0]@[remote_ip]>;tag=[pid]SIPpTag00[call_number]
To: <sip:[field0]@[remote_ip]>
Call-ID: [call_id]
CSeq: 2 REGISTER
Contact: <sip:[field0]@[local_ip]:[local_port]>
Max-Forwards: 70
[authentication username="[field0]" password="[field1]"]
Expires: 3600
Content-Length: 0`,

  SUBSCRIBE: `SUBSCRIBE sip:[field2]@[remote_ip]:[remote_port] SIP/2.0
Via: SIP/2.0/[transport] [local_ip]:[local_port];branch=[branch]
From: <sip:[field0]@[remote_ip]>;tag=[pid]SIPpTag00[call_number]
To: <sip:[service]@[remote_ip]>
Call-ID: [call_id]
CSeq: 1 SUBSCRIBE
Contact: <sip:[field0]@[local_ip]:[local_port]>
Max-Forwards: 70
Event: presence
Accept: application/dialog-info+xml
Expires: 3600
Content-Length: 0`,

  SUBSCRIBE_AUTH: `SUBSCRIBE sip:[field2]@[remote_ip]:[remote_port] SIP/2.0
Via: SIP/2.0/[transport] [local_ip]:[local_port];branch=[branch]
From: <sip:[field0]@[remote_ip]>;tag=[pid]SIPpTag00[call_number]
To: <sip:[field2]@[remote_ip]>
Call-ID: [call_id]
CSeq: 2 SUBSCRIBE
Contact: <sip:[field0]@[local_ip]:[local_port]>
Max-Forwards: 70
[authentication username="[field0]" password="[field1]"]
Event: presence
Accept: application/dialog-info+xml
Expires: 3600
Content-Length: 0`,

  NOTIFY: `NOTIFY sip:[service]@[remote_ip]:[remote_port] SIP/2.0
Via: SIP/2.0/[transport] [local_ip]:[local_port];branch=[branch]
From: <sip:[field0]@[remote_ip]>;tag=[pid]SIPpTag00[call_number]
To: <sip:[service]@[remote_ip]>[peer_tag_param]
Call-ID: [call_id]
CSeq: 1 NOTIFY
Contact: <sip:[field0]@[local_ip]:[local_port]>
Max-Forwards: 70
Event: presence
Subscription-State: active
Content-Type: application/pidf+xml
Content-Length: [len]

<?xml version="1.0" encoding="UTF-8"?>
<presence xmlns="urn:ietf:params:xml:ns:pidf" entity="sip:[field0]@[remote_ip]">
  <tuple id="sg89ae">
    <status><basic>open</basic></status>
  </tuple>
</presence>`,

  OPTIONS: `OPTIONS sip:[service]@[remote_ip]:[remote_port] SIP/2.0
Via: SIP/2.0/[transport] [local_ip]:[local_port];branch=[branch]
From: <sip:[field0]@[local_ip]:[local_port]>;tag=[pid]SIPpTag00[call_number]
To: [service] <sip:[service]@[remote_ip]:[remote_port]>
Call-ID: [call_id]
CSeq: 1 OPTIONS
Contact: <sip:[field0]@[local_ip]:[local_port]>
Max-Forwards: 70
Accept: application/sdp
Content-Length: 0`,

  MESSAGE: `MESSAGE sip:[service]@[remote_ip]:[remote_port] SIP/2.0
Via: SIP/2.0/[transport] [local_ip]:[local_port];branch=[branch]
From: <sip:[field0]@[remote_ip]>;tag=[pid]SIPpTag00[call_number]
To: <sip:[service]@[remote_ip]>
Call-ID: [call_id]
CSeq: 1 MESSAGE
Contact: <sip:[field0]@[local_ip]:[local_port]>
Max-Forwards: 70
Content-Type: text/plain
Content-Length: [len]

Hello from SIPp test!`,

  INFO: `INFO sip:[service]@[remote_ip]:[remote_port] SIP/2.0
Via: SIP/2.0/[transport] [local_ip]:[local_port];branch=[branch]
From: <sip:[field0]@[local_ip]:[local_port]>;tag=[pid]SIPpTag00[call_number]
To: [service] <sip:[service]@[remote_ip]:[remote_port]>[peer_tag_param]
Call-ID: [call_id]
CSeq: 2 INFO
Contact: <sip:[field0]@[local_ip]:[local_port]>
Max-Forwards: 70
Content-Type: application/dtmf-relay
Content-Length: [len]

Signal=1
Duration=160`,

  UPDATE: `UPDATE sip:[service]@[remote_ip]:[remote_port] SIP/2.0
Via: SIP/2.0/[transport] [local_ip]:[local_port];branch=[branch]
From: <sip:[field0]@[local_ip]:[local_port]>;tag=[pid]SIPpTag00[call_number]
To: [service] <sip:[service]@[remote_ip]:[remote_port]>[peer_tag_param]
Call-ID: [call_id]
CSeq: 2 UPDATE
Contact: <sip:[field0]@[local_ip]:[local_port]>
Max-Forwards: 70
Content-Type: application/sdp
Content-Length: [len]

v=0
o=[field0] 53655765 2353687638 IN IP[local_ip_type] [local_ip]
s=-
c=IN IP[media_ip_type] [media_ip]
t=0 0
m=audio [auto_media_port] RTP/AVP 0
a=rtpmap:0 PCMU/8000
a=sendonly`,

  REFER: `REFER sip:[service]@[remote_ip]:[remote_port] SIP/2.0
Via: SIP/2.0/[transport] [local_ip]:[local_port];branch=[branch]
From: <sip:[field0]@[local_ip]:[local_port]>;tag=[pid]SIPpTag00[call_number]
To: [service] <sip:[service]@[remote_ip]:[remote_port]>[peer_tag_param]
Call-ID: [call_id]
CSeq: 2 REFER
Contact: <sip:[field0]@[local_ip]:[local_port]>
Max-Forwards: 70
Refer-To: <sip:transfer-target@[remote_ip]:[remote_port]>
Referred-By: <sip:[field0]@[local_ip]:[local_port]>
Content-Length: 0`,

  PUBLISH: `PUBLISH sip:[service]@[remote_ip]:[remote_port] SIP/2.0
Via: SIP/2.0/[transport] [local_ip]:[local_port];branch=[branch]
From: <sip:[field0]@[remote_ip]>;tag=[pid]SIPpTag00[call_number]
To: <sip:[field0]@[remote_ip]>
Call-ID: [call_id]
CSeq: 1 PUBLISH
Contact: <sip:[field0]@[local_ip]:[local_port]>
Max-Forwards: 70
Event: presence
Expires: 3600
Content-Type: application/pidf+xml
Content-Length: [len]

<?xml version="1.0" encoding="UTF-8"?>
<presence xmlns="urn:ietf:params:xml:ns:pidf" entity="sip:[field0]@[remote_ip]">
  <tuple id="sg89ae">
    <status><basic>open</basic></status>
    <contact>sip:[field0]@[local_ip]:[local_port]</contact>
  </tuple>
</presence>`,

  // ========== UAS服务器响应模板 ==========
  RESPONSE_200_OK: `SIP/2.0 200 OK
[last_Via:]
[last_From:]
[last_To:];tag=[pid]SIPpTag[call_number]
[last_Call-ID:]
[last_CSeq:]
[last_Contact:]
Content-Type: application/sdp
Content-Length: [len]

v=0
o=[field0] 53655765 2353687637 IN IP[local_ip_type] [local_ip]
s=-
c=IN IP[media_ip_type] [media_ip]
t=0 0
m=audio [auto_media_port] RTP/AVP 0 8
a=rtpmap:0 PCMU/8000
a=rtpmap:8 PCMA/8000
a=sendrecv`,

  RESPONSE_180_RINGING: `SIP/2.0 180 Ringing
[last_Via:]
[last_From:]
[last_To:];tag=[pid]SIPpTag[call_number]
[last_Call-ID:]
[last_CSeq:]
[last_Contact:]
Content-Length: 0`,

  RESPONSE_183_SESSION_PROGRESS: `SIP/2.0 183 Session Progress
[last_Via:]
[last_From:]
[last_To:];tag=[pid]SIPpTag[call_number]
[last_Call-ID:]
[last_CSeq:]
[last_Contact:]
Content-Type: application/sdp
Content-Length: [len]

v=0
o=[field0] 53655765 2353687637 IN IP[local_ip_type] [local_ip]
s=-
c=IN IP[media_ip_type] [media_ip]
t=0 0
m=audio [auto_media_port] RTP/AVP 0
a=rtpmap:0 PCMU/8000
a=sendrecv`,

  RESPONSE_401_UNAUTHORIZED: `SIP/2.0 401 Unauthorized
[last_Via:]
[last_From:]
[last_To:];tag=[pid]SIPpTag[call_number]
[last_Call-ID:]
[last_CSeq:]
[last_Contact:]
WWW-Authenticate: Digest realm="[remote_ip]",nonce="[timestamp]",algorithm=MD5,qop="auth"
Server: SIPp
Content-Length: 0`,

  RESPONSE_407_PROXY_AUTH: `SIP/2.0 407 Proxy Authentication Required
[last_Via:]
[last_From:]
[last_To:];tag=[pid]SIPpTag[call_number]
[last_Call-ID:]
[last_CSeq:]
[last_Contact:]
Proxy-Authenticate: Digest realm="[remote_ip]",nonce="[timestamp]",algorithm=MD5,qop="auth"
Server: SIPp
Content-Length: 0`,

  RESPONSE_486_BUSY: `SIP/2.0 486 Busy Here
[last_Via:]
[last_From:]
[last_To:];tag=[pid]SIPpTag[call_number]
[last_Call-ID:]
[last_CSeq:]
[last_Contact:]
Server: SIPp
Content-Length: 0`,

  RESPONSE_603_DECLINE: `SIP/2.0 603 Decline
[last_Via:]
[last_From:]
[last_To:];tag=[pid]SIPpTag[call_number]
[last_Call-ID:]
[last_CSeq:]
[last_Contact:]
Server: SIPp
Content-Length: 0`,
};

/**
 * 场景创建/编辑表单组件
 * 职责：提供场景的可视化创建和编辑界面
 * 遵循SOLID原则，单一职责，功能清晰
 */
const ScenarioForm: React.FC<ScenarioFormProps> = ({
  visible,
  onCancel,
  onSubmit,
  initialData,
}) => {
  const [form] = Form.useForm();
  const [messages, setMessages] = useState<ScenarioMessage[]>([]);
  const [loading, setLoading] = useState(false);

  // 监听visible和initialData变化，正确初始化表单
  useEffect(() => {
    if (visible) {
      if (initialData) {
        // 编辑模式
        form.setFieldsValue({
          name: initialData.scenario.name,
          filename: initialData.filename.replace('.xml', ''),
        });
        setMessages(initialData.scenario.messages || []);
      } else {
        // 创建模式
        form.resetFields();
        setMessages([]);
      }
    }
  }, [visible, initialData, form]);

  /**
   * 获取消息类型图标
   */
  const getMessageIcon = (type: MessageType) => {
    switch (type) {
      case 'send':
        return <SendOutlined style={{ color: '#1890ff' }} />;
      case 'recv':
        return <CheckCircleOutlined style={{ color: '#52c41a' }} />;
      case 'pause':
        return <ClockCircleOutlined style={{ color: '#faad14' }} />;
      case 'action':
        return <ThunderboltOutlined style={{ color: '#722ed1' }} />;
      case 'label':
        return <AimOutlined style={{ color: '#eb2f96' }} />;
      default:
        return <CodeOutlined />;
    }
  };

  /**
   * 获取消息类型颜色
   */
  const getMessageTypeColor = (type: MessageType): string => {
    const colors: Record<MessageType, string> = {
      send: 'blue',
      recv: 'green',
      pause: 'orange',
      nop: 'default',
      sendcmd: 'purple',
      recvcmd: 'cyan',
      action: 'purple',
      label: 'magenta',
    };
    return colors[type];
  };

  /**
   * 添加消息（支持模板）
   */
  const addMessage = (type: MessageType, template?: string) => {
    const newMessage: ScenarioMessage = { type };

    // 根据类型设置默认值
    switch (type) {
      case 'send':
        newMessage.cdata = template || SIP_MESSAGE_TEMPLATES.INVITE;
        break;
      case 'recv':
        newMessage.response = '200';
        newMessage.optional = false;
        newMessage.auth = false;
        break;
      case 'pause':
        newMessage.milliseconds = 1000;
        break;
      case 'action':
        newMessage.actionType = 'log';
        newMessage.message = '';
        break;
      case 'label':
        newMessage.label_id = '';
        break;
    }

    setMessages([...messages, newMessage]);
    message.success(`已添加 ${type.toUpperCase()} 消息`);
  };

  /**
   * 删除消息
   */
  const deleteMessage = (index: number) => {
    const newMessages = messages.filter((_, i) => i !== index);
    setMessages(newMessages);
    message.success('已删除消息');
  };

  /**
   * 复制消息
   */
  const duplicateMessage = (index: number) => {
    const newMessages = [...messages];
    newMessages.splice(index + 1, 0, { ...messages[index] });
    setMessages(newMessages);
    message.success('已复制消息');
  };

  /**
   * 更新消息
   */
  const updateMessage = (index: number, updates: Partial<ScenarioMessage>) => {
    const newMessages = [...messages];
    newMessages[index] = { ...newMessages[index], ...updates };
    setMessages(newMessages);
  };

  /**
   * 上移消息
   */
  const moveMessageUp = (index: number) => {
    if (index === 0) return;
    const newMessages = [...messages];
    [newMessages[index - 1], newMessages[index]] = [newMessages[index], newMessages[index - 1]];
    setMessages(newMessages);
  };

  /**
   * 下移消息
   */
  const moveMessageDown = (index: number) => {
    if (index === messages.length - 1) return;
    const newMessages = [...messages];
    [newMessages[index], newMessages[index + 1]] = [newMessages[index + 1], newMessages[index]];
    setMessages(newMessages);
  };

  /**
   * 提交表单
   */
  const handleSubmit = async () => {
    try {
      const values = await form.validateFields();

      if (messages.length === 0) {
        message.warning('请至少添加一条消息');
        return;
      }

      const scenario: Scenario = {
        name: values.name,
        messages,
        variables: [],
        init: [],
        injection_file: undefined,  // 注入文件已移至启动测试
      };

      const filename = values.filename.endsWith('.xml')
        ? values.filename
        : `${values.filename}.xml`;

      setLoading(true);
      await onSubmit(filename, scenario);
      setLoading(false);
    } catch (error: any) {
      setLoading(false);
      if (error.errorFields) {
        // 表单验证错误
        message.error('请检查表单填写是否完整');
      }
    }
  };

  /**
   * Send消息模板下拉菜单
   */
  const sendTemplateMenu: MenuProps = {
    items: [
      {
        type: 'group' as const,
        label: '基础呼叫',
        children: [
          {
            key: 'INVITE',
            label: 'INVITE（第一次请求）',
            onClick: () => addMessage('send', SIP_MESSAGE_TEMPLATES.INVITE),
          },
          {
            key: 'INVITE_AUTH',
            label: 'INVITE（鉴权重试）',
            onClick: () => addMessage('send', SIP_MESSAGE_TEMPLATES.INVITE_AUTH),
          },
          {
            key: 'ACK',
            label: 'ACK',
            onClick: () => addMessage('send', SIP_MESSAGE_TEMPLATES.ACK),
          },
          {
            key: 'BYE',
            label: 'BYE',
            onClick: () => addMessage('send', SIP_MESSAGE_TEMPLATES.BYE),
          },
        ],
      },
      {
        type: 'group' as const,
        label: '注册鉴权',
        children: [
          {
            key: 'REGISTER',
            label: 'REGISTER（第一次请求）',
            onClick: () => addMessage('send', SIP_MESSAGE_TEMPLATES.REGISTER),
          },
          {
            key: 'REGISTER_AUTH',
            label: 'REGISTER（鉴权重试）',
            onClick: () => addMessage('send', SIP_MESSAGE_TEMPLATES.REGISTER_AUTH),
          },
        ],
      },
      {
        type: 'group' as const,
        label: '状态订阅',
        children: [
          {
            key: 'SUBSCRIBE',
            label: 'SUBSCRIBE（第一次请求）',
            onClick: () => addMessage('send', SIP_MESSAGE_TEMPLATES.SUBSCRIBE),
          },
          {
            key: 'SUBSCRIBE_AUTH',
            label: 'SUBSCRIBE（鉴权重试）',
            onClick: () => addMessage('send', SIP_MESSAGE_TEMPLATES.SUBSCRIBE_AUTH),
          },
          {
            key: 'NOTIFY',
            label: 'NOTIFY（通知）',
            onClick: () => addMessage('send', SIP_MESSAGE_TEMPLATES.NOTIFY),
          },
          {
            key: 'PUBLISH',
            label: 'PUBLISH（发布）',
            onClick: () => addMessage('send', SIP_MESSAGE_TEMPLATES.PUBLISH),
          },
        ],
      },
      {
        type: 'group' as const,
        label: '呼叫控制',
        children: [
          {
            key: 'UPDATE',
            label: 'UPDATE（会话更新）',
            onClick: () => addMessage('send', SIP_MESSAGE_TEMPLATES.UPDATE),
          },
          {
            key: 'REFER',
            label: 'REFER（呼叫转移）',
            onClick: () => addMessage('send', SIP_MESSAGE_TEMPLATES.REFER),
          },
          {
            key: 'INFO',
            label: 'INFO（会话内信息）',
            onClick: () => addMessage('send', SIP_MESSAGE_TEMPLATES.INFO),
          },
        ],
      },
      {
        type: 'group' as const,
        label: '其他',
        children: [
          {
            key: 'OPTIONS',
            label: 'OPTIONS（心跳/能力查询）',
            onClick: () => addMessage('send', SIP_MESSAGE_TEMPLATES.OPTIONS),
          },
          {
            key: 'MESSAGE',
            label: 'MESSAGE（即时消息）',
            onClick: () => addMessage('send', SIP_MESSAGE_TEMPLATES.MESSAGE),
          },
        ],
      },
      {
        type: 'group' as const,
        label: 'UAS服务器响应',
        children: [
          {
            key: 'RESPONSE_200_OK',
            label: '200 OK（成功响应）',
            onClick: () => addMessage('send', SIP_MESSAGE_TEMPLATES.RESPONSE_200_OK),
          },
          {
            key: 'RESPONSE_180_RINGING',
            label: '180 Ringing（振铃）',
            onClick: () => addMessage('send', SIP_MESSAGE_TEMPLATES.RESPONSE_180_RINGING),
          },
          {
            key: 'RESPONSE_183_SESSION_PROGRESS',
            label: '183 Session Progress（会话进行中）',
            onClick: () => addMessage('send', SIP_MESSAGE_TEMPLATES.RESPONSE_183_SESSION_PROGRESS),
          },
          {
            key: 'RESPONSE_401_UNAUTHORIZED',
            label: '401 Unauthorized（需要鉴权）',
            onClick: () => addMessage('send', SIP_MESSAGE_TEMPLATES.RESPONSE_401_UNAUTHORIZED),
          },
          {
            key: 'RESPONSE_407_PROXY_AUTH',
            label: '407 Proxy Auth Required（代理鉴权）',
            onClick: () => addMessage('send', SIP_MESSAGE_TEMPLATES.RESPONSE_407_PROXY_AUTH),
          },
          {
            key: 'RESPONSE_486_BUSY',
            label: '486 Busy Here（用户忙）',
            onClick: () => addMessage('send', SIP_MESSAGE_TEMPLATES.RESPONSE_486_BUSY),
          },
          {
            key: 'RESPONSE_603_DECLINE',
            label: '603 Decline（拒绝呼叫）',
            onClick: () => addMessage('send', SIP_MESSAGE_TEMPLATES.RESPONSE_603_DECLINE),
          },
        ],
      },
      {
        type: 'group' as const,
        label: '自定义',
        children: [
          {
            key: 'empty',
            label: '空消息（自定义）',
            onClick: () => addMessage('send', ''),
          },
        ],
      },
    ],
  };

  /**
   * 从 CDATA 中提取 SIP 请求方法
   */
  const extractRequestMethod = (cdata?: string): string | undefined => {
    if (!cdata) return undefined;
    // 提取第一行的第一个单词（SIP 方法名）
    const firstLine = cdata.trim().split('\n')[0];
    const method = firstLine.split(' ')[0];
    // 验证是否为有效的 SIP 方法
    const validMethods = ['INVITE', 'ACK', 'BYE', 'CANCEL', 'REGISTER', 'OPTIONS', 'INFO', 'PRACK', 'SUBSCRIBE', 'NOTIFY', 'PUBLISH', 'MESSAGE', 'REFER', 'UPDATE'];
    return validMethods.includes(method) ? method : undefined;
  };

  /**
   * 从 CDATA 中提取 CSeq 序列号
   */
  const extractCSeq = (cdata?: string): number | undefined => {
    if (!cdata) return undefined;
    const match = cdata.match(/CSeq:\s*(\d+)/i);
    return match ? parseInt(match[1], 10) : undefined;
  };

  /**
   * 更新 CDATA 中的 CSeq 序列号
   */
  const updateCSeqInCdata = (cdata: string, cseq: number, method?: string): string => {
    const cseqMatch = cdata.match(/CSeq:\s*(\d+)\s+(\w+)/i);
    if (cseqMatch) {
      const currentMethod = cseqMatch[2];
      const newCSeqLine = `CSeq: ${cseq} ${method || currentMethod}`;
      return cdata.replace(/CSeq:\s*\d+\s+\w+/i, newCSeqLine);
    }
    return cdata;
  };

  /**
   * 检测消息是否包含 SDP
   */
  const hasSDPContent = (cdata?: string): boolean => {
    if (!cdata) return false;
    return cdata.includes('Content-Type: application/sdp') && cdata.includes('m=audio');
  };

  /**
   * 从 CDATA 中提取当前的编码列表
   */
  const extractCodecs = (cdata?: string): number[] => {
    if (!cdata) return [];
    const match = cdata.match(/m=audio\s+\[auto_media_port\]\s+RTP\/AVP\s+([\d\s]+)/);
    if (match) {
      return match[1].trim().split(/\s+/).map(Number);
    }
    return [];
  };

  /**
   * 根据选中的编码更新 CDATA 中的 SDP 部分
   */
  const updateCodecsInCdata = (cdata: string, codecs: number[]): string => {
    if (codecs.length === 0) return cdata;

    // 生成新的 payload types 列表和 rtpmap 行
    const mLinePayloads = codecs.join(' ');
    const rtpmapLines = codecs
      .filter(codec => CODEC_MAP[codec])
      .map(codec => {
        const info = CODEC_MAP[codec];
        return `a=rtpmap:${codec} ${info.name}/${info.rate}`;
      })
      .join('\n');

    // 正则说明：
    // - m=audio ... RTP/AVP 匹配 m= 行头部
    // - (?:\s+\d+)+ 匹配 payload type 列表（一个或多个 "空格+数字"，不能匹配换行符）
    // - (?:\r?\na=rtpmap:[^\r\n]+)* 匹配其后所有 a=rtpmap 行
    //   注意：a=rtpmap 前面必须有换行符，但后面不要求（因为可能直接接 ]]>）
    const sdpBlockRegex = /m=audio\s+\[auto_media_port\]\s+RTP\/AVP(?:\s+\d+)+(?:\r?\na=rtpmap:[^\r\n]+)*/g;

    const updated = cdata.replace(sdpBlockRegex, () => {
      // 重建完整的 SDP 媒体块（末尾必须有换行符）
      return `m=audio [auto_media_port] RTP/AVP ${mLinePayloads}\n${rtpmapLines}\n`;
    });

    return updated;
  };

  /**
   * 渲染消息编辑器
   */
  const renderMessageEditor = (msg: ScenarioMessage, index: number) => {
    return (
      <Panel
        key={index}
        header={
          <Space>
            {getMessageIcon(msg.type)}
            <Tag color={getMessageTypeColor(msg.type)}>
              {msg.type.toUpperCase()}
            </Tag>
            <span>消息 #{index + 1}</span>
            {msg.type === 'recv' && (msg.response || msg.request) && (
              <Tag>{msg.response || msg.request}</Tag>
            )}
            {msg.type === 'send' && (msg.request || extractRequestMethod(msg.cdata)) && (
              <Tag color="blue">{msg.request || extractRequestMethod(msg.cdata)}</Tag>
            )}
            {msg.type === 'send' && extractCSeq(msg.cdata) && (
              <Tag color="cyan">CSeq: {extractCSeq(msg.cdata)}</Tag>
            )}
            {msg.type === 'pause' && msg.milliseconds && (
              <Tag color="orange">{msg.milliseconds}ms</Tag>
            )}
            {msg.type === 'action' && msg.actionType && (
              <Tag color="purple">{msg.actionType.toUpperCase()}</Tag>
            )}
            {msg.type === 'recv' && msg.optional && (
              <Tag color="default">可选</Tag>
            )}
            {msg.type === 'label' && msg.label_id && (
              <Tag color="magenta">ID: {msg.label_id}</Tag>
            )}
            {(msg.type === 'recv' || msg.type === 'send') && msg.next && (
              <Tag color="volcano">→ {msg.next}</Tag>
            )}
            {(msg.type === 'recv' || msg.type === 'send') && msg.ontimeout && (
              <Tag color="orange">⏱ {msg.ontimeout}</Tag>
            )}
          </Space>
        }
        extra={
          <Space onClick={(e) => e.stopPropagation()}>
            <Tooltip title="复制">
              <Button
                size="small"
                icon={<CopyOutlined />}
                onClick={() => duplicateMessage(index)}
              />
            </Tooltip>
            <Tooltip title="上移">
              <Button
                size="small"
                icon={<ArrowUpOutlined />}
                disabled={index === 0}
                onClick={() => moveMessageUp(index)}
              />
            </Tooltip>
            <Tooltip title="下移">
              <Button
                size="small"
                icon={<ArrowDownOutlined />}
                disabled={index === messages.length - 1}
                onClick={() => moveMessageDown(index)}
              />
            </Tooltip>
            <Tooltip title="删除">
              <Button
                size="small"
                danger
                icon={<DeleteOutlined />}
                onClick={() => deleteMessage(index)}
              />
            </Tooltip>
          </Space>
        }
      >
        {/* Send消息编辑器 */}
        {msg.type === 'send' && (
          <Space direction="vertical" style={{ width: '100%' }}>
            <TextArea
              rows={10}
              placeholder="输入SIP消息内容..."
              value={msg.cdata}
              onChange={(e) => updateMessage(index, { cdata: e.target.value })}
              style={{ fontFamily: 'Consolas, Monaco, monospace', fontSize: '12px' }}
            />
            <Space wrap>
              <Space>
                <span>CSeq 序列号:</span>
                <InputNumber
                  min={1}
                  placeholder="自动提取"
                  value={extractCSeq(msg.cdata)}
                  onChange={(value) => {
                    if (value && msg.cdata) {
                      const method = extractRequestMethod(msg.cdata);
                      updateMessage(index, { cdata: updateCSeqInCdata(msg.cdata, value, method) });
                    }
                  }}
                  style={{ width: 120 }}
                />
                <Tooltip title="修改 CSeq 序列号，便于调试和测试">
                  <span style={{ color: '#999', cursor: 'help' }}>ℹ️</span>
                </Tooltip>
              </Space>
              <Space>
                <span>超时 (ms):</span>
                <InputNumber
                  min={0}
                  placeholder="可选，留空使用默认值"
                  value={msg.timeout}
                  onChange={(value) => updateMessage(index, { timeout: value || undefined })}
                  style={{ width: 200 }}
                />
              </Space>
            </Space>

            {/* RTD 计时器配置 */}
            <Space wrap style={{ marginTop: 8 }}>
              {/* RTD 计时器名称输入 */}
              <Input
                addonBefore="RTD计时器"
                placeholder="不填则不记录（如: invite, bye, register）"
                value={msg.rtd || ''}
                onChange={(e) => updateMessage(index, { rtd: e.target.value || undefined })}
                style={{ width: 360 }}
              />

              {/* 启动RTD计时器 */}
              <Input
                addonBefore="启动计时器"
                placeholder="start_rtd (可选)"
                value={msg.start_rtd}
                onChange={(e) => updateMessage(index, { start_rtd: e.target.value || undefined })}
                style={{ width: 220 }}
              />

              {/* 允许重复测量 */}
              <Select
                placeholder="重复测量"
                style={{ width: 140 }}
                value={msg.repeat_rtd || false}
                onChange={(value) => updateMessage(index, { repeat_rtd: value })}
              >
                <Select.Option value={false}>不重复</Select.Option>
                <Select.Option value={true}>允许重复</Select.Option>
              </Select>
            </Space>

            {/* SDP 编码配置（仅包含 SDP 的消息显示） */}
            {hasSDPContent(msg.cdata) && (
              <Space direction="vertical" style={{ width: '100%', marginTop: 8 }}>
                <Divider style={{ margin: '8px 0' }}>SDP 媒体编码配置</Divider>
                <Select
                  mode="multiple"
                  placeholder="选择 RTP 编码（Payload Types）"
                  value={extractCodecs(msg.cdata)}
                  onChange={(codecs) => {
                    if (msg.cdata && codecs.length > 0) {
                      updateMessage(index, { cdata: updateCodecsInCdata(msg.cdata, codecs) });
                    }
                  }}
                  style={{ width: '100%' }}
                >
                  {Object.entries(CODEC_MAP).map(([pt, info]) => (
                    <Select.Option key={pt} value={Number(pt)}>
                      {pt} - {info.name} ({info.description})
                    </Select.Option>
                  ))}
                </Select>
                <div style={{ color: '#999', fontSize: '12px' }}>
                  当前编码：{extractCodecs(msg.cdata).map(c => CODEC_MAP[c]?.name || c).join(', ') || '未配置'}
                </div>
              </Space>
            )}

            {/* 条件跳转配置 */}
            <Space wrap>
              <Input
                addonBefore="跳转目标 (next)"
                placeholder="跳转到指定标签（如: send_bye）"
                value={msg.next}
                onChange={(e) => updateMessage(index, { next: e.target.value || undefined })}
                style={{ width: 300 }}
              />
              <Input
                addonBefore="超时跳转 (ontimeout)"
                placeholder="当消息超时时跳转（如: timeout_label）"
                value={msg.ontimeout}
                onChange={(e) => updateMessage(index, { ontimeout: e.target.value || undefined })}
                style={{ width: 320 }}
              />
              <Select
                placeholder="添加 CRLF"
                style={{ width: 140 }}
                value={msg.crlf}
                onChange={(value) => updateMessage(index, { crlf: value })}
              >
                <Select.Option value={false}>不添加</Select.Option>
                <Select.Option value={true}>添加 CRLF</Select.Option>
              </Select>
            </Space>
          </Space>
        )}

        {/* Recv消息编辑器 */}
        {msg.type === 'recv' && (
          <Space direction="vertical" style={{ width: '100%' }}>
            <Space wrap>
              {/* 模式选择：UAC客户端 或 UAS服务器 */}
              <Select
                placeholder="选择模式"
                style={{ width: 200 }}
                value={msg.request ? 'uas' : 'uac'}
                onChange={(mode) => {
                  if (mode === 'uac') {
                    // UAC客户端模式：接收响应，清空request
                    updateMessage(index, { request: undefined, response: msg.response || '200' });
                  } else {
                    // UAS服务器模式：接收请求，清空response
                    updateMessage(index, { response: undefined, request: msg.request || 'INVITE' });
                  }
                }}
              >
                <Select.Option value="uac">UAC客户端（接收响应）</Select.Option>
                <Select.Option value="uas">UAS服务器（接收请求）</Select.Option>
              </Select>

              {/* 根据模式显示对应的输入框 */}
              {msg.request ? (
                // UAS服务器模式：接收请求
                <Input
                  addonBefore="接收请求"
                  placeholder="例如: INVITE, REGISTER"
                  value={msg.request}
                  onChange={(e) => updateMessage(index, { request: e.target.value })}
                  style={{ width: 250 }}
                />
              ) : (
                // UAC客户端模式：接收响应
                <Input
                  addonBefore="接收响应"
                  placeholder="例如: 200, 401, 407"
                  value={msg.response}
                  onChange={(e) => updateMessage(index, { response: e.target.value })}
                  style={{ width: 250 }}
                />
              )}
            </Space>
            <Space wrap>
              <Select
                placeholder="消息类型"
                style={{ width: 120 }}
                value={msg.optional}
                onChange={(value) => updateMessage(index, { optional: value })}
              >
                <Select.Option value={false}>必需</Select.Option>
                <Select.Option value={true}>可选</Select.Option>
              </Select>

              {/* RTD 计时器配置 */}
              <Input
                addonBefore="RTD计时器"
                placeholder="不填则不记录（如: invite, bye）"
                value={msg.rtd || ''}
                onChange={(e) => updateMessage(index, { rtd: e.target.value || undefined })}
                style={{ width: 320 }}
              />

              {/* 启动RTD计时器 */}
              <Input
                addonBefore="启动计时器"
                placeholder="start_rtd (可选)"
                value={msg.start_rtd}
                onChange={(e) => updateMessage(index, { start_rtd: e.target.value || undefined })}
                style={{ width: 220 }}
              />

              {/* 允许重复测量 */}
              <Select
                placeholder="重复测量"
                style={{ width: 140 }}
                value={msg.repeat_rtd || false}
                onChange={(value) => updateMessage(index, { repeat_rtd: value })}
              >
                <Select.Option value={false}>不重复</Select.Option>
                <Select.Option value={true}>允许重复</Select.Option>
              </Select>

              {/* 只在UAC客户端模式下显示认证选项 */}
              {!msg.request && (
                <Select
                  placeholder="启用认证"
                  style={{ width: 180 }}
                  value={msg.auth}
                  onChange={(value) => updateMessage(index, { auth: value })}
                >
                  <Select.Option value={false}>不启用认证</Select.Option>
                  <Select.Option value={true}>启用认证</Select.Option>
                </Select>
              )}
              <InputNumber
                addonBefore="超时(ms)"
                placeholder="可选"
                value={msg.timeout}
                onChange={(value) => updateMessage(index, { timeout: value || undefined })}
                style={{ width: 180 }}
                min={0}
              />
            </Space>
            <Space wrap>
              <Input
                addonBefore="跳转目标 (next)"
                placeholder="当 optional=true 且收到时跳转（如: send_bye）"
                value={msg.next}
                onChange={(e) => updateMessage(index, { next: e.target.value || undefined })}
                style={{ width: 380 }}
              />
              <Input
                addonBefore="超时跳转 (ontimeout)"
                placeholder="当消息超时时跳转（如: timeout_label）"
                value={msg.ontimeout}
                onChange={(e) => updateMessage(index, { ontimeout: e.target.value || undefined })}
                style={{ width: 380 }}
              />
            </Space>
            <Space wrap>
              <Select
                placeholder="添加 CRLF"
                style={{ width: 140 }}
                value={msg.crlf}
                onChange={(value) => updateMessage(index, { crlf: value })}
              >
                <Select.Option value={false}>不添加</Select.Option>
                <Select.Option value={true}>添加 CRLF</Select.Option>
              </Select>
            </Space>
          </Space>
        )}

        {/* Pause消息编辑器 */}
        {msg.type === 'pause' && (
          <Space>
            <span>暂停时长:</span>
            <InputNumber
              placeholder="毫秒"
              value={msg.milliseconds}
              onChange={(value) => updateMessage(index, { milliseconds: value || 1000 })}
              style={{ width: 150 }}
              min={0}
              addonAfter="ms"
            />
          </Space>
        )}

        {/* NOP消息编辑器 */}
        {msg.type === 'nop' && (
          <div style={{ color: '#999', padding: '10px 0' }}>
            无操作消息（NOP） - 用于场景流程控制
          </div>
        )}

        {/* Action消息编辑器 */}
        {msg.type === 'action' && (
          <Space direction="vertical" style={{ width: '100%' }}>
            {/* Action类型选择 */}
            <Select
              placeholder="选择Action类型"
              value={msg.actionType}
              onChange={(type) => updateMessage(index, { actionType: type })}
              style={{ width: '100%' }}
            >
              <Select.OptGroup label="日志与调试">
                <Select.Option value="log">log - 记录日志</Select.Option>
                <Select.Option value="warning">warning - 记录警告</Select.Option>
                <Select.Option value="error">error - 记录错误并退出</Select.Option>
              </Select.OptGroup>
              <Select.OptGroup label="变量操作">
                <Select.Option value="assign">assign - 变量赋值（数字）</Select.Option>
                <Select.Option value="assignstr">assignstr - 字符串赋值</Select.Option>
              </Select.OptGroup>
              <Select.OptGroup label="条件判断">
                <Select.Option value="strcmp">strcmp - 字符串比较</Select.Option>
                <Select.Option value="test">test - 条件测试</Select.Option>
              </Select.OptGroup>
              <Select.OptGroup label="高级功能">
                <Select.Option value="exec">exec - 执行外部命令</Select.Option>
                <Select.Option value="verifyauth">verifyauth - 验证认证</Select.Option>
                <Select.Option value="lookup">lookup - 查找表查询</Select.Option>
                <Select.Option value="jump">jump - 跳转到标签</Select.Option>
                <Select.Option value="play_pcap_audio">play_pcap_audio - 播放音频</Select.Option>
                <Select.Option value="play_pcap_video">play_pcap_video - 播放视频</Select.Option>
              </Select.OptGroup>
            </Select>

            {/* exec - 执行命令（支持8种子类型） */}
            {msg.actionType === 'exec' && (
              <Space direction="vertical" style={{ width: '100%' }}>
                <Select
                  placeholder="选择 Exec 功能类型"
                  value={msg.exec_subtype || 'command'}
                  onChange={(type) => updateMessage(index, { exec_subtype: type })}
                  style={{ width: '100%' }}
                >
                  <Select.Option value="command">Shell 命令 - 执行外部命令</Select.Option>
                  <Select.Option value="int_cmd">内部控制 - 停止测试（stop_now/stop_gracefully/stop_call）</Select.Option>
                  <Select.Option value="play_pcap_audio">PCAP 音频 - 播放预录 RTP 音频流</Select.Option>
                  <Select.Option value="play_pcap_video">PCAP 视频 - 播放预录 RTP 视频流</Select.Option>
                  <Select.Option value="play_pcap_image">PCAP 图像 - 播放图像媒体流</Select.Option>
                  <Select.Option value="play_dtmf">DTMF 按键 - 发送按键音（IVR 模拟）</Select.Option>
                  <Select.Option value="rtp_stream">RTP 流 - 实时播放音频文件（WAV）</Select.Option>
                  <Select.Option value="rtp_echo">RTP 回声 - 启动/停止回声测试</Select.Option>
                </Select>

                {/* command - Shell 命令 */}
                {(!msg.exec_subtype || msg.exec_subtype === 'command') && (
                  <Input
                    placeholder="执行的命令，例如: echo 'Test' >> /tmp/sipp.log"
                    value={msg.command}
                    onChange={(e) => updateMessage(index, { command: e.target.value })}
                  />
                )}

                {/* int_cmd - 内部控制命令 */}
                {msg.exec_subtype === 'int_cmd' && (
                  <Select
                    placeholder="选择停止类型"
                    value={msg.int_cmd_value || 'stop_call'}
                    onChange={(value) => updateMessage(index, { int_cmd_value: value })}
                    style={{ width: '100%' }}
                  >
                    <Select.Option value="stop_now">stop_now - 立即停止所有测试</Select.Option>
                    <Select.Option value="stop_gracefully">stop_gracefully - 优雅停止（完成当前呼叫）</Select.Option>
                    <Select.Option value="stop_call">stop_call - 仅停止当前呼叫（默认）</Select.Option>
                  </Select>
                )}

                {/* play_pcap_audio/video/image - PCAP 播放 */}
                {(msg.exec_subtype === 'play_pcap_audio' ||
                  msg.exec_subtype === 'play_pcap_video' ||
                  msg.exec_subtype === 'play_pcap_image') && (
                  <Input
                    placeholder="PCAP 文件路径，例如: pcap/g711a.pcap"
                    value={msg.pcap_file}
                    onChange={(e) => updateMessage(index, { pcap_file: e.target.value })}
                    addonBefore="文件路径"
                  />
                )}

                {/* play_dtmf - DTMF 按键音 */}
                {msg.exec_subtype === 'play_dtmf' && (
                  <Space.Compact style={{ width: '100%' }}>
                    <Input
                      style={{ width: '70%' }}
                      placeholder="按键序列，例如: 1234*# 或 [field0]"
                      value={msg.dtmf_digits}
                      onChange={(e) => updateMessage(index, { dtmf_digits: e.target.value })}
                      addonBefore="按键"
                    />
                    <InputNumber
                      style={{ width: '30%' }}
                      placeholder="时长(ms)"
                      value={msg.dtmf_duration || 200}
                      onChange={(value) => updateMessage(index, { dtmf_duration: value || 200 })}
                      min={50}
                      max={2000}
                      addonAfter="ms"
                    />
                  </Space.Compact>
                )}

                {/* rtp_stream - RTP 流播放 */}
                {msg.exec_subtype === 'rtp_stream' && (
                  <Space direction="vertical" style={{ width: '100%' }}>
                    <Select
                      placeholder="选择操作类型"
                      value={msg.rtp_stream_command ? 'control' : 'play'}
                      onChange={(type) => {
                        if (type === 'control') {
                          updateMessage(index, { rtp_stream_command: 'pause', rtp_stream_file: undefined });
                        } else {
                          updateMessage(index, { rtp_stream_command: undefined, rtp_stream_file: '' });
                        }
                      }}
                      style={{ width: '100%' }}
                    >
                      <Select.Option value="play">播放音频文件</Select.Option>
                      <Select.Option value="control">控制播放（pause/resume）</Select.Option>
                    </Select>

                    {msg.rtp_stream_command ? (
                      // 控制命令模式
                      <Select
                        value={msg.rtp_stream_command}
                        onChange={(value) => updateMessage(index, { rtp_stream_command: value })}
                        style={{ width: '100%' }}
                      >
                        <Select.Option value="pause">暂停播放</Select.Option>
                        <Select.Option value="resume">恢复播放</Select.Option>
                      </Select>
                    ) : (
                      // 文件播放模式
                      <>
                        <Input
                          placeholder="音频文件路径，例如: audio.wav"
                          value={msg.rtp_stream_file}
                          onChange={(e) => updateMessage(index, { rtp_stream_file: e.target.value })}
                          addonBefore="文件"
                        />
                        <Space wrap style={{ width: '100%' }}>
                          <InputNumber
                            placeholder="循环次数"
                            value={msg.rtp_stream_loop || 1}
                            onChange={(value) => updateMessage(index, { rtp_stream_loop: value || 1 })}
                            min={1}
                            style={{ width: 120 }}
                            addonBefore="循环"
                          />
                          <InputNumber
                            placeholder="Payload"
                            value={msg.rtp_stream_payload || 0}
                            onChange={(value) => updateMessage(index, { rtp_stream_payload: value || 0 })}
                            min={0}
                            max={127}
                            style={{ width: 120 }}
                            addonBefore="Payload"
                          />
                          <InputNumber
                            placeholder="采样率"
                            value={msg.rtp_stream_rate || 8000}
                            onChange={(value) => updateMessage(index, { rtp_stream_rate: value || 8000 })}
                            min={8000}
                            step={1000}
                            style={{ width: 140 }}
                            addonBefore="采样率"
                          />
                        </Space>
                      </>
                    )}
                  </Space>
                )}

                {/* rtp_echo - RTP 回声 */}
                {msg.exec_subtype === 'rtp_echo' && (
                  <Select
                    value={msg.rtp_echo_value !== undefined ? msg.rtp_echo_value : 1}
                    onChange={(value) => updateMessage(index, { rtp_echo_value: value })}
                    style={{ width: '100%' }}
                  >
                    <Select.Option value={1}>启动 RTP 回声（接收包原样发回）</Select.Option>
                    <Select.Option value={0}>停止 RTP 回声</Select.Option>
                  </Select>
                )}
              </Space>
            )}

            {/* log/warning/error - 日志消息 */}
            {(msg.actionType === 'log' || msg.actionType === 'warning' || msg.actionType === 'error') && (
              <Input
                placeholder="日志消息内容"
                value={msg.message}
                onChange={(e) => updateMessage(index, { message: e.target.value })}
              />
            )}

            {/* assign/assignstr - 变量赋值 */}
            {(msg.actionType === 'assign' || msg.actionType === 'assignstr') && (
              <Space.Compact style={{ width: '100%' }}>
                <Input
                  style={{ width: '40%' }}
                  placeholder="变量名（赋值到）"
                  value={msg.assign_to}
                  onChange={(e) => updateMessage(index, { assign_to: e.target.value })}
                />
                <Input
                  style={{ width: '60%' }}
                  placeholder="赋值内容"
                  value={msg.value}
                  onChange={(e) => updateMessage(index, { value: e.target.value })}
                />
              </Space.Compact>
            )}

            {/* strcmp - 字符串比较 */}
            {msg.actionType === 'strcmp' && (
              <Space.Compact style={{ width: '100%' }}>
                <Input
                  style={{ width: '50%' }}
                  placeholder="变量1"
                  value={msg.variable}
                  onChange={(e) => updateMessage(index, { variable: e.target.value })}
                />
                <Input
                  style={{ width: '50%' }}
                  placeholder="变量2 或 固定值"
                  value={msg.variable2 || msg.compare_value}
                  onChange={(e) => updateMessage(index, { variable2: e.target.value, compare_value: e.target.value })}
                />
              </Space.Compact>
            )}

            {/* test - 条件测试 */}
            {msg.actionType === 'test' && (
              <Space.Compact style={{ width: '100%' }}>
                <Input
                  style={{ width: '35%' }}
                  placeholder="测试变量"
                  value={msg.test_variable}
                  onChange={(e) => updateMessage(index, { test_variable: e.target.value })}
                />
                <Select
                  style={{ width: '30%' }}
                  placeholder="操作符"
                  value={msg.test_op || 'equal'}
                  onChange={(op) => updateMessage(index, { test_op: op })}
                >
                  <Select.Option value="equal">等于</Select.Option>
                  <Select.Option value="not_equal">不等于</Select.Option>
                  <Select.Option value="greater">大于</Select.Option>
                  <Select.Option value="less">小于</Select.Option>
                  <Select.Option value="greater_equal">大于等于</Select.Option>
                  <Select.Option value="less_equal">小于等于</Select.Option>
                </Select>
                <Input
                  style={{ width: '35%' }}
                  placeholder="比较值"
                  value={msg.test_value}
                  onChange={(e) => updateMessage(index, { test_value: e.target.value })}
                />
              </Space.Compact>
            )}

            {/* verifyauth - 验证认证 */}
            {msg.actionType === 'verifyauth' && (
              <Space.Compact style={{ width: '100%' }}>
                <Input
                  style={{ width: '50%' }}
                  placeholder="用户名"
                  value={msg.username}
                  onChange={(e) => updateMessage(index, { username: e.target.value })}
                />
                <Input.Password
                  style={{ width: '50%' }}
                  placeholder="密码"
                  value={msg.password}
                  onChange={(e) => updateMessage(index, { password: e.target.value })}
                />
              </Space.Compact>
            )}

            {/* lookup - 查找表 */}
            {msg.actionType === 'lookup' && (
              <Space.Compact style={{ width: '100%' }}>
                <Input
                  style={{ width: '60%' }}
                  placeholder="查找文件路径"
                  value={msg.file}
                  onChange={(e) => updateMessage(index, { file: e.target.value })}
                />
                <Input
                  style={{ width: '40%' }}
                  placeholder="查找键"
                  value={msg.key}
                  onChange={(e) => updateMessage(index, { key: e.target.value })}
                />
              </Space.Compact>
            )}

            {/* jump - 跳转 */}
            {msg.actionType === 'jump' && (
              <Input
                placeholder="标签名（跳转目标）"
                value={msg.label}
                onChange={(e) => updateMessage(index, { label: e.target.value })}
              />
            )}

            {/* play_pcap - 播放PCAP */}
            {(msg.actionType === 'play_pcap_audio' || msg.actionType === 'play_pcap_video') && (
              <Input
                placeholder="PCAP文件路径"
                value={msg.pcap_file}
                onChange={(e) => updateMessage(index, { pcap_file: e.target.value })}
              />
            )}
          </Space>
        )}

        {/* Label消息编辑器 */}
        {msg.type === 'label' && (
          <Space direction="vertical" style={{ width: '100%' }}>
            <Input
              addonBefore="标签 ID"
              placeholder="输入唯一的标签 ID，用于 next 跳转（如: send_bye, main_loop）"
              value={msg.label_id}
              onChange={(e) => updateMessage(index, { label_id: e.target.value })}
            />
            <div style={{ color: '#999', fontSize: '12px' }}>
              定义跳转目标标签，配合 recv/send 消息的 next 属性使用。
            </div>
          </Space>
        )}
      </Panel>
    );
  };

  return (
    <Modal
      title={
        <Space>
          <CodeOutlined />
          <span>{initialData ? '编辑场景' : '创建场景'}</span>
        </Space>
      }
      open={visible}
      onCancel={onCancel}
      width={1000}
      footer={[
        <Button key="cancel" onClick={onCancel}>
          取消
        </Button>,
        <Button key="submit" type="primary" onClick={handleSubmit} loading={loading}>
          {initialData ? '保存更改' : '创建场景'}
        </Button>,
      ]}
      destroyOnClose
    >
      <Form
        form={form}
        layout="vertical"
        initialValues={{
          name: initialData?.scenario.name || '',
          filename: initialData?.filename.replace('.xml', '') || '',
        }}
      >
        <Form.Item
          name="name"
          label="场景名称"
          rules={[{ required: true, message: '请输入场景名称' }]}
        >
          <Input placeholder="例如: Basic UAC Call Flow" />
        </Form.Item>

        <Form.Item
          name="filename"
          label="文件名"
          rules={[
            { required: true, message: '请输入文件名' },
            {
              pattern: /^[a-zA-Z0-9_-]+$/,
              message: '文件名只能包含字母、数字、下划线和连字符',
            },
          ]}
        >
          <Input placeholder="例如: basic-uac-flow" addonAfter=".xml" />
        </Form.Item>
      </Form>

      <Divider>消息序列</Divider>

      <div style={{ marginBottom: 16 }}>
        <Space wrap>
          <Dropdown
            menu={{
              ...sendTemplateMenu,
              style: { maxHeight: '500px', overflowY: 'auto' },
            }}
            placement="bottomLeft"
            trigger={['click']}
          >
            <Button
              type="primary"
              icon={<PlusOutlined />}
            >
              Send 消息
            </Button>
          </Dropdown>
          <Button
            type="primary"
            icon={<PlusOutlined />}
            onClick={() => addMessage('recv')}
          >
            Recv 消息
          </Button>
          <Button
            icon={<PlusOutlined />}
            onClick={() => addMessage('pause')}
          >
            Pause 暂停
          </Button>
          <Button
            icon={<PlusOutlined />}
            onClick={() => addMessage('nop')}
          >
            NOP 空操作
          </Button>
          <Button
            icon={<PlusOutlined />}
            onClick={() => addMessage('action')}
          >
            Action 操作
          </Button>
          <Button
            icon={<PlusOutlined />}
            onClick={() => addMessage('label')}
          >
            Label 标签
          </Button>
        </Space>
      </div>

      {messages.length > 0 ? (
        <Collapse accordion>{messages.map(renderMessageEditor)}</Collapse>
      ) : (
        <div
          style={{
            padding: 60,
            textAlign: 'center',
            border: '2px dashed #d9d9d9',
            borderRadius: 8,
            color: '#999',
            background: '#fafafa',
          }}
        >
          <CodeOutlined style={{ fontSize: 32, marginBottom: 16, color: '#d9d9d9' }} />
          <div>暂无消息</div>
          <div style={{ fontSize: 12, marginTop: 8 }}>
            点击上方按钮添加 Send、Recv、Pause 或 NOP 消息
          </div>
        </div>
      )}

      {messages.length > 0 && (
        <div style={{ marginTop: 16, padding: 12, background: '#f0f2f5', borderRadius: 4 }}>
          <Space>
            <Tag color="blue">总消息数: {messages.length}</Tag>
            <Tag color="blue">Send: {messages.filter((m) => m.type === 'send').length}</Tag>
            <Tag color="green">Recv: {messages.filter((m) => m.type === 'recv').length}</Tag>
            <Tag color="orange">Pause: {messages.filter((m) => m.type === 'pause').length}</Tag>
          </Space>
        </div>
      )}
    </Modal>
  );
};

export default ScenarioForm;
