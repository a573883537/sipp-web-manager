	import fs from 'fs/promises';
import xml2js from 'xml2js';
import { logger } from '../utils/logger';

/**
 * 场景消息类型
 */
export type MessageType = 'send' | 'recv' | 'pause' | 'nop' | 'sendcmd' | 'recvcmd' | 'action' | 'label';

/**
 * Exec子类型（用于action:exec的具体功能）
 */
export type ExecSubType = 'command' | 'int_cmd' | 'play_pcap_audio' | 'play_pcap_video' |
  'play_pcap_image' | 'play_dtmf' | 'rtp_stream' | 'rtp_echo';

/**
 * Action操作类型
 */
export type ActionType = 'log' | 'warning' | 'error' | 'exec' | 'assign' | 'assignstr' |
  'strcmp' | 'test' | 'verifyauth' | 'lookup' | 'jump' | 'play_pcap_audio' | 'play_pcap_video';

/**
 * 场景消息接口
 */
export interface ScenarioMessage {
  type: MessageType;
  request?: string;
  response?: string;
  optional?: boolean;
  rtd?: boolean;
  auth?: boolean;  // 启用认证（用于接收401/407时触发dialog_authentication）
  timeout?: number;
  milliseconds?: number;
  cdata?: string;
  // SDP媒体编码配置（用于包含SDP的send/recv消息，如INVITE、UPDATE、200 OK等）
  codecs?: number[];  // RTP payload types数组，如 [0, 8, 18] 表示 PCMU, PCMA, G729
  // action相关字段（当type为'action'时使用）
  actionType?: ActionType;
  // exec相关字段（当actionType为'exec'时使用）
  exec_subtype?: ExecSubType;
  int_cmd_value?: 'stop_now' | 'stop_gracefully' | 'stop_call';
  dtmf_digits?: string;
  dtmf_duration?: number;
  rtp_stream_file?: string;
  rtp_stream_loop?: number;
  rtp_stream_payload?: number;
  rtp_stream_rate?: number;
  rtp_stream_command?: 'pause' | 'resume';
  rtp_echo_value?: 0 | 1;
  // 通用字段
  command?: string;
  message?: string;
  assign_to?: string;
  value?: string;
  variable?: string;
  variable2?: string;
  compare_value?: string;
  test_variable?: string;
  test_value?: string;
  test_op?: 'equal' | 'not_equal' | 'greater' | 'less' | 'greater_equal' | 'less_equal';
  username?: string;
  password?: string;
  file?: string;
  key?: string;
  label?: string;
  pcap_file?: string;
  // 条件跳转相关字段（SIPp label/next/ontimeout特性）
  next?: string;        // 跳转目标的label ID（当optional=true且消息未收到时跳转）
  ontimeout?: string;   // 超时跳转目标的label ID（当消息超时时跳转）
  label_id?: string;    // 标签ID（用于定义跳转目标，配合<label id="xxx"/>使用）
  crlf?: boolean;       // 是否在消息后添加CRLF（用于某些协议兼容性）
}

/**
 * 场景接口
 */
export interface Scenario {
  name: string;
  description?: string;
  messages: ScenarioMessage[];
  variables?: any[];
  init?: any[];
  injection_file?: string;
}

/**
 * XML场景文件解析器
 * 职责：解析和生成SIPp XML场景文件
 * 遵循单一职责原则
 */
export class XmlParser {
  private parser: xml2js.Parser;

  constructor() {
    this.parser = new xml2js.Parser({
      explicitArray: false,
      mergeAttrs: true,
      trim: true,
      normalize: true,
      normalizeTags: true,
      explicitRoot: false,
    });
  }

  /**
   * 解析XML场景文件
   */
  async parseFile(filePath: string): Promise<Scenario> {
    try {
      const content = await fs.readFile(filePath, 'utf-8');
      return await this.parseString(content);
    } catch (error) {
      logger.error(`Error parsing XML file: ${filePath}`, error);
      throw error;
    }
  }

  /**
   * 解析XML字符串
   */
  async parseString(xml: string): Promise<Scenario> {
    try {
      const result = await this.parser.parseStringPromise(xml);
      return this.normalizeScenario(result, xml);
    } catch (error) {
      logger.error('Error parsing XML string:', error);
      throw error;
    }
  }

  /**
   * 从XML字符串中提取消息元素的原始顺序
   * 通过正则扫描XML标签，构建顺序映射
   */
  private extractMessageOrder(xml: string): Array<{ type: string; index: number }> {
    const order: Array<{ type: string; index: number }> = [];
    const messageTypes = ['send', 'recv', 'pause', 'nop', 'sendcmd', 'recvcmd', 'action', 'label'];

    // 构建正则：匹配开始标签（自闭合或非自闭合）
    // 例如：<send>, <send >, <send/>, <send >
    const tagPattern = new RegExp(`<(${messageTypes.join('|')})(\\s|>|/)`, 'g');

    let match;
    const typeCounters: Record<string, number> = {};

    // 初始化计数器
    messageTypes.forEach(type => {
      typeCounters[type] = 0;
    });

    // 按XML出现顺序记录每个元素类型及其索引
    while ((match = tagPattern.exec(xml)) !== null) {
      const type = match[1];
      order.push({
        type,
        index: typeCounters[type],
      });
      typeCounters[type]++;
    }

    return order;
  }

  /**
   * 标准化场景对象（保留XML原始顺序）
   */
  private normalizeScenario(raw: any, originalXml?: string): Scenario {
    const scenario: Scenario = {
      name: raw.name || 'Unnamed Scenario',
      messages: [],
      variables: raw.variable ? this.ensureArray(raw.variable) : [],
      init: raw.init ? this.ensureArray(raw.init) : [],
    };

    // 按类型解析所有消息到临时map
    const messagesByType: Record<string, ScenarioMessage[]> = {};
    const messageKeys = ['send', 'recv', 'pause', 'nop', 'sendcmd', 'recvcmd', 'action', 'label'];

    for (const key of messageKeys) {
      if (raw[key]) {
        const messages = this.ensureArray(raw[key]);
        messagesByType[key] = messages.map((msg: any) =>
          this.normalizeMessage(key as MessageType, msg)
        );
      }
    }

    // 如果提供了原始XML，按原始顺序重组消息
    if (originalXml) {
      const order = this.extractMessageOrder(originalXml);

      for (const { type, index } of order) {
        if (messagesByType[type] && messagesByType[type][index]) {
          scenario.messages.push(messagesByType[type][index]);
        }
      }
    } else {
      // 兼容旧逻辑：如果没有原始XML，按类型顺序添加
      for (const key of messageKeys) {
        if (messagesByType[key]) {
          scenario.messages.push(...messagesByType[key]);
        }
      }
    }

    return scenario;
  }

  /**
   * 标准化单个消息
   */
  private normalizeMessage(type: MessageType, raw: any): ScenarioMessage {
    const message: ScenarioMessage = { type };

    // 根据消息类型解析属性
    switch (type) {
      case 'send':
        message.cdata = raw._ || raw;
        message.timeout = raw.timeout ? parseInt(raw.timeout, 10) : undefined;
        message.next = raw.next;
        message.ontimeout = raw.ontimeout;
        message.crlf = raw.crlf === 'true' || raw.crlf === true;
        break;

      case 'recv':
        message.request = raw.request;
        message.response = raw.response;
        message.optional = raw.optional === 'true' || raw.optional === true;
        message.rtd = raw.rtd === 'true' || raw.rtd === true;
        message.auth = raw.auth === 'true' || raw.auth === true;
        message.timeout = raw.timeout ? parseInt(raw.timeout, 10) : undefined;
        message.next = raw.next;
        message.ontimeout = raw.ontimeout;
        message.crlf = raw.crlf === 'true' || raw.crlf === true;
        break;

      case 'pause':
        message.milliseconds = raw.milliseconds
          ? parseInt(raw.milliseconds, 10)
          : undefined;
        break;

      case 'action':
        message.actionType = raw.type as ActionType;
        // 根据不同的action类型解析相应字段
        message.command = raw.command;
        message.message = raw.message;
        message.assign_to = raw.assign_to;
        message.value = raw.value;
        message.variable = raw.variable;
        message.variable2 = raw.variable2;
        message.compare_value = raw.value; // strcmp的value字段
        message.test_variable = raw.variable;
        message.test_value = raw.value;
        message.test_op = raw.op;
        message.username = raw.username;
        message.password = raw.password;
        message.file = raw.file;
        message.key = raw.key;
        message.label = raw.label;
        message.pcap_file = raw.pcap_file;
        break;

      case 'label':
        message.label_id = raw.id || raw.label_id;
        break;
    }

    return message;
  }

  /**
   * 生成XML场景文件
   */
  async generateFile(scenario: Scenario, filePath: string): Promise<void> {
    try {
      const xml = await this.generateString(scenario);
      await fs.writeFile(filePath, xml, 'utf-8');
      logger.info(`Scenario saved to: ${filePath}`);
    } catch (error) {
      logger.error(`Error generating XML file: ${filePath}`, error);
      throw error;
    }
  }

  /**
   * 生成XML字符串
   * 手动构建以保持消息的精确顺序（xml2js.Builder会按类型分组，破坏顺序）
   */
  async generateString(scenario: Scenario): Promise<string> {
    let xml = '<?xml version="1.0" encoding="UTF-8"?>\n';
    xml += `<scenario name="${this.escapeXml(scenario.name)}">\n`;

    // 添加变量定义
    if (scenario.variables && scenario.variables.length > 0) {
      for (const variable of scenario.variables) {
        xml += this.buildVariableXml(variable);
      }
    }

    // 添加初始化
    if (scenario.init && scenario.init.length > 0) {
      for (const init of scenario.init) {
        xml += this.buildInitXml(init);
      }
    }

    // 按原始顺序添加消息序列（关键：保持send/recv的交替顺序）
    for (const msg of scenario.messages) {
      xml += this.buildMessageXml(msg);
    }

    xml += '</scenario>\n';
    return xml;
  }


  /**
   * 确保返回数组
   */
  private ensureArray(value: any): any[] {
    if (Array.isArray(value)) return value;
    return value ? [value] : [];
  }

  /**
   * XML转义
   */
  private escapeXml(text: string): string {
    if (!text) return '';
    return text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&apos;');
  }

  /**
   * 构建exec元素XML（支持8种子类型）
   * @param message 消息对象
   * @param indent 缩进空格数（默认4）
   */
  private buildExecXml(message: ScenarioMessage, indent: number = 4): string {
    const spaces = ' '.repeat(indent);

    if (!message.exec_subtype) {
      // 兼容旧格式：如果没有指定子类型，默认使用command
      return `${spaces}<exec command="${this.escapeXml(message.command || '')}"/>\n`;
    }

    switch (message.exec_subtype) {
      case 'command':
        return `${spaces}<exec command="${this.escapeXml(message.command || '')}"/>\n`;

      case 'int_cmd':
        return `${spaces}<exec int_cmd="${message.int_cmd_value || 'stop_call'}"/>\n`;

      case 'play_pcap_audio':
        return `${spaces}<exec play_pcap_audio="${this.escapeXml(message.pcap_file || '')}"/>\n`;

      case 'play_pcap_video':
        return `${spaces}<exec play_pcap_video="${this.escapeXml(message.pcap_file || '')}"/>\n`;

      case 'play_pcap_image':
        return `${spaces}<exec play_pcap_image="${this.escapeXml(message.pcap_file || '')}"/>\n`;

      case 'play_dtmf':
        {
          const digits = message.dtmf_digits || '';
          const duration = message.dtmf_duration || 200;
          return `${spaces}<exec play_dtmf="${this.escapeXml(digits)},${duration}"/>\n`;
        }

      case 'rtp_stream':
        {
          if (message.rtp_stream_command) {
            // pause/resume 命令
            return `${spaces}<exec rtp_stream="${message.rtp_stream_command}"/>\n`;
          } else {
            // 播放文件：file,loop,payload,rate
            const file = message.rtp_stream_file || '';
            const loop = message.rtp_stream_loop || 1;
            const payload = message.rtp_stream_payload || 0;
            const rate = message.rtp_stream_rate || 8000;
            return `${spaces}<exec rtp_stream="${this.escapeXml(file)},${loop},${payload},${rate}"/>\n`;
          }
        }

      case 'rtp_echo':
        return `${spaces}<exec rtp_echo="${message.rtp_echo_value || 0}"/>\n`;

      default:
        logger.warn(`Unknown exec subtype: ${message.exec_subtype}`);
        return `${spaces}<exec command="${this.escapeXml(message.command || '')}"/>\n`;
    }
  }

  /**
   * 构建variable元素XML
   */
  private buildVariableXml(variable: any): string {
    // 简化处理，实际使用时可能需要更复杂的逻辑
    return `  <variable name="${variable.name}" type="${variable.type}" />\n`;
  }

  /**
   * 构建init元素XML
   */
  private buildInitXml(_init: any): string {
    // 简化处理，实际使用时可能需要更复杂的逻辑
    return `  <init />\n`;
  }

  /**
   * 构建消息元素XML（保持原始顺序的关键）
   */
  private buildMessageXml(message: ScenarioMessage): string {
    let xml = '';

    switch (message.type) {
      case 'send':
        xml += '  <send';
        if (message.timeout) {
          xml += ` timeout="${message.timeout}"`;
        }
        if (message.next) {
          xml += ` next="${this.escapeXml(message.next)}"`;
        }
        if (message.ontimeout) {
          xml += ` ontimeout="${this.escapeXml(message.ontimeout)}"`;
        }
        if (message.crlf !== undefined && message.crlf) {
          xml += ` crlf="true"`;
        }
        xml += '>';
        if (message.cdata) {
          xml += `<![CDATA[${message.cdata}]]>`;
        }
        xml += '</send>\n';
        break;

      case 'recv':
        // 互斥验证：request和response不能同时存在
        if (message.request && message.response) {
          throw new Error(
            'recv element cannot have both request and response attributes. ' +
            'Use request for UAS (server) mode or response for UAC (client) mode.'
          );
        }

        xml += '  <recv';
        // UAC客户端模式：接收响应
        if (message.response) {
          xml += ` response="${this.escapeXml(message.response)}"`;
          // auth属性只在UAC客户端模式下有效
          if (message.auth !== undefined && message.auth) {
            xml += ` auth="${message.auth}"`;
          }
        }
        // UAS服务器模式：接收请求
        if (message.request) {
          xml += ` request="${this.escapeXml(message.request)}"`;
        }
        // 通用属性
        if (message.optional !== undefined) {
          xml += ` optional="${message.optional}"`;
        }
        if (message.rtd !== undefined) {
          xml += ` rtd="${message.rtd}"`;
        }
        if (message.timeout) {
          xml += ` timeout="${message.timeout}"`;
        }
        if (message.next) {
          xml += ` next="${this.escapeXml(message.next)}"`;
        }
        if (message.ontimeout) {
          xml += ` ontimeout="${this.escapeXml(message.ontimeout)}"`;
        }
        if (message.crlf !== undefined && message.crlf) {
          xml += ` crlf="true"`;
        }
        xml += '/>\n';
        break;

      case 'pause':
        xml += '  <pause';
        if (message.milliseconds) {
          xml += ` milliseconds="${message.milliseconds}"`;
        }
        xml += '/>\n';
        break;

      case 'nop':
        xml += '  <nop/>\n';
        break;

      case 'sendcmd':
      case 'recvcmd':
        xml += `  <${message.type}/>\n`;
        break;

      case 'action':
        if (!message.actionType) {
          throw new Error('action message must have actionType');
        }

        // SIPp 不支持独立的 <action> 元素，必须包裹在 nop/recv/send 等元素内
        // 因此我们将独立的 action 包裹在 <nop> 中
        xml += '  <nop>\n';
        xml += '    <action>\n';

        // 根据action类型生成对应的子元素
        switch (message.actionType) {
          case 'exec':
            xml += this.buildExecXml(message, 6); // 6空格缩进
            break;

          case 'log':
            xml += `      <log message="${this.escapeXml(message.message || '')}"/>\n`;
            break;

          case 'warning':
            xml += `      <warning message="${this.escapeXml(message.message || '')}"/>\n`;
            break;

          case 'error':
            xml += `      <error message="${this.escapeXml(message.message || '')}"/>\n`;
            break;

          case 'assign':
            xml += `      <assign assign_to="${this.escapeXml(message.assign_to || '')}" value="${this.escapeXml(message.value || '')}"/>\n`;
            break;

          case 'assignstr':
            xml += `      <assignstr assign_to="${this.escapeXml(message.assign_to || '')}" value="${this.escapeXml(message.value || '')}"/>\n`;
            break;

          case 'strcmp':
            xml += `      <strcmp variable="${this.escapeXml(message.variable || '')}"`;
            if (message.variable2) {
              xml += ` variable2="${this.escapeXml(message.variable2)}"`;
            } else if (message.compare_value) {
              xml += ` value="${this.escapeXml(message.compare_value)}"`;
            }
            xml += '/>\n';
            break;

          case 'test':
            xml += `      <test variable="${this.escapeXml(message.test_variable || '')}"`;
            if (message.test_op) {
              xml += ` op="${message.test_op}"`;
            }
            xml += ` value="${this.escapeXml(message.test_value || '')}"/>\n`;
            break;

          case 'verifyauth':
            xml += '      <verifyauth';
            if (message.username) {
              xml += ` username="${this.escapeXml(message.username)}"`;
            }
            if (message.password) {
              xml += ` password="${this.escapeXml(message.password)}"`;
            }
            xml += '/>\n';
            break;

          case 'lookup':
            xml += '      <lookup';
            if (message.file) {
              xml += ` file="${this.escapeXml(message.file)}"`;
            }
            if (message.key) {
              xml += ` key="${this.escapeXml(message.key)}"`;
            }
            xml += '/>\n';
            break;

          case 'jump':
            xml += `      <jump label="${this.escapeXml(message.label || '')}"/>\n`;
            break;

          case 'play_pcap_audio':
            xml += `      <exec play_pcap_audio="${this.escapeXml(message.pcap_file || '')}"/>\n`;
            break;

          case 'play_pcap_video':
            xml += `      <exec play_pcap_video="${this.escapeXml(message.pcap_file || '')}"/>\n`;
            break;

          default:
            logger.warn(`Unknown action type: ${message.actionType}`);
            return '';
        }

        xml += '    </action>\n';
        xml += '  </nop>\n';
        break;

      case 'label':
        if (!message.label_id) {
          throw new Error('label message must have label_id');
        }
        xml += `  <label id="${this.escapeXml(message.label_id)}"/>\n`;
        break;
    }

    return xml;
  }

  /**
   * 验证场景文件
   */
  async validate(scenario: Scenario): Promise<{ valid: boolean; errors: string[] }> {
    const errors: string[] = [];

    // 基础验证
    if (!scenario.name) {
      errors.push('Scenario name is required');
    }

    if (!scenario.messages || scenario.messages.length === 0) {
      errors.push('Scenario must contain at least one message');
    }

    // 验证消息序列
    scenario.messages.forEach((msg, index) => {
      if (!msg.type) {
        errors.push(`Message ${index}: type is required`);
      }

      if (msg.type === 'recv' && !msg.request && !msg.response) {
        errors.push(`Message ${index}: recv must have request or response`);
      }

      if (msg.type === 'pause' && !msg.milliseconds) {
        errors.push(`Message ${index}: pause must have milliseconds`);
      }
    });

    return {
      valid: errors.length === 0,
      errors,
    };
  }
}

export const xmlParser = new XmlParser();
