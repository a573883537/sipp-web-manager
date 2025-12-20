# 快速开始 - 场景创建功能

## 🎯 功能概览

SIPp Web Manager提供了可视化的场景创建和编辑功能，无需手动编写XML文件。

### 主要特性

- ✅ **可视化编辑** - 拖拽式消息管理
- ✅ **消息模板** - 内置INVITE、ACK、BYE、REGISTER模板
- ✅ **实时验证** - 表单验证和错误提示
- ✅ **支持编辑** - 修改现有场景
- ✅ **消息排序** - 上移/下移调整顺序
- ✅ **快速复制** - 复制相似消息

---

## 📋 创建第一个场景

### Step 1: 打开场景管理

访问前端界面，导航到"场景管理"页面：

```
http://localhost:5173  →  点击左侧"场景管理"菜单
```

### Step 2: 点击"创建场景"

点击页面右上角的"创建场景"按钮，打开场景编辑器。

### Step 3: 填写基本信息

```
场景名称: Basic UAC Example
文件名:   basic-uac
```

### Step 4: 添加消息

#### 4.1 发送INVITE
1. 点击"Send消息"下拉菜单
2. 选择"INVITE (带SDP)"
3. 默认模板已包含完整的SIP INVITE消息

#### 4.2 接收响应
```
添加3个Recv消息：

Recv #1:
  Response: 100
  可选: 是

Recv #2:
  Response: 180
  可选: 是

Recv #3:
  Response: 200
  可选: 否
  记录RTD: 是
```

#### 4.3 发送ACK
1. 点击"Send消息" → 选择"ACK"

#### 4.4 添加通话保持
1. 点击"Pause暂停"
2. 输入时长：3000 ms（3秒）

#### 4.5 发送BYE
1. 点击"Send消息" → 选择"BYE"

#### 4.6 接收最终响应
```
Recv #4:
  Response: 200
```

### Step 5: 保存场景

点击"创建场景"按钮，场景将保存为 `basic-uac.xml`

---

## 🎨 消息类型说明

### Send消息 (发送SIP消息)

**用途**: 发送SIP请求或响应

**配置项**:
- 消息内容(CDATA): SIP消息的完整内容
- 超时(可选): 等待响应的超时时间(毫秒)

**模板**:
- INVITE: 包含SDP的呼叫邀请
- ACK: 确认200 OK响应
- BYE: 结束呼叫
- REGISTER: 注册请求
- 空消息: 自定义内容

**示例**:
```
INVITE sip:[service]@[remote_ip]:[remote_port] SIP/2.0
Via: SIP/2.0/[transport] [local_ip]:[local_port];branch=[branch]
From: sipp <sip:sipp@[local_ip]:[local_port]>;tag=[pid]SIPpTag00[call_number]
...
```

### Recv消息 (接收SIP消息)

**用途**: 期望接收的SIP消息

**配置项**:
- Request: 请求方法（如INVITE、BYE）
- Response: 响应码（如100、200、404）
- 可选: 是否为可选消息（如果未收到也不会失败）
- 记录RTD: 是否记录响应时间分布
- 超时: 等待消息的超时时间

**常用响应码**:
```
100 - Trying
180 - Ringing
200 - OK
401 - Unauthorized
404 - Not Found
486 - Busy Here
```

### Pause消息 (暂停)

**用途**: 在消息间插入延迟

**配置项**:
- 暂停时长: 毫秒数

**使用场景**:
- 模拟通话时长（如3000ms = 3秒通话）
- 等待后台处理
- 控制呼叫速率

### NOP消息 (无操作)

**用途**: 流程控制，不发送也不接收消息

**使用场景**:
- 条件分支
- 场景同步点
- 调试占位符

---

## 🔧 高级技巧

### 1. 消息变量

SIPp支持以下变量（在Send消息中使用）:

```
[service]       - 被叫号码
[remote_ip]     - 远程IP地址
[remote_port]   - 远程端口
[local_ip]      - 本地IP地址
[local_port]    - 本地端口
[call_id]       - Call-ID
[call_number]   - 呼叫编号
[branch]        - Via分支ID
[pid]           - 进程ID
[timestamp]     - 时间戳
[len]           - Content-Length（自动计算）
[media_port]    - RTP媒体端口
[peer_tag_param] - 对端Tag参数
```

### 2. 消息排序

使用上移/下移按钮调整消息顺序：

```
正确的呼叫流程：
1. INVITE
2. 100 Trying (可选)
3. 180 Ringing (可选)
4. 200 OK
5. ACK
6. Pause (通话时长)
7. BYE
8. 200 OK
```

### 3. 复制消息

快速创建相似消息：
1. 点击消息的"复制"按钮
2. 修改复制后的消息内容
3. 例如：复制Recv消息，修改响应码

### 4. 可选消息

将Recv消息标记为"可选"：
- 如果收到该消息，继续执行
- 如果未收到，也不会失败，继续下一步

**使用场景**:
```
INVITE → 100 (可选) → 180 (可选) → 200 (必需) → ACK
         ↑                ↑             ↑
      可能收到        可能收到      必须收到
```

### 5. RTD记录

在关键响应上启用RTD（Response Time Distribution）：

```
INVITE → ... → 200 OK (记录RTD) → ACK
                 ↑
         记录从INVITE到200的时间
```

这会在SIPp统计中记录响应时间分布。

---

## 📊 实战案例

### 案例1: 基础UAC（用户代理客户端）

**场景描述**: 发起呼叫，等待应答，通话3秒后挂断

**消息序列**:
```
1. Send: INVITE (带SDP)
2. Recv: 100 (可选)
3. Recv: 180 (可选)
4. Recv: 200 (记录RTD)
5. Send: ACK
6. Pause: 3000ms
7. Send: BYE
8. Recv: 200
```

### 案例2: 注册场景

**场景描述**: 向服务器注册账号

**消息序列**:
```
1. Send: REGISTER
2. Recv: 401 (认证挑战)
3. Send: REGISTER (带认证)
4. Recv: 200
```

### 案例3: 呼叫被拒绝

**场景描述**: 呼叫被对方拒绝（忙）

**消息序列**:
```
1. Send: INVITE
2. Recv: 100 (可选)
3. Recv: 486 (Busy Here)
4. Send: ACK
```

### 案例4: 长时通话

**场景描述**: 模拟60秒通话

**消息序列**:
```
1. Send: INVITE (带SDP)
2. Recv: 200
3. Send: ACK
4. Pause: 60000ms  ← 60秒通话
5. Send: BYE
6. Recv: 200
```

---

## 🐛 常见问题

### Q1: 场景保存失败

**可能原因**:
- 文件名包含非法字符（只能用字母、数字、下划线、连字符）
- 场景名称为空
- 消息序列为空

**解决方法**:
- 检查文件名格式
- 至少添加一条消息

### Q2: 编辑后无法保存

**可能原因**:
- 表单验证失败
- 网络连接问题

**解决方法**:
- 查看红色错误提示
- 检查控制台错误信息
- 确认后端服务运行正常

### Q3: 消息模板不符合需求

**解决方法**:
1. 选择"空消息"
2. 手动输入自定义SIP消息内容
3. 或选择最接近的模板后修改

### Q4: 如何添加SDP

**方法**:
- 使用"INVITE (带SDP)"模板
- 模板中已包含标准SDP内容
- 根据需要修改媒体类型和端口

---

## 📚 相关资源

### SIPp官方文档
- [SIPp场景语法](http://sipp.sourceforge.net/doc/reference.html)
- [SIPp变量参考](http://sipp.sourceforge.net/doc/reference.html#Keyword+reference)

### SIP协议
- [RFC 3261 - SIP协议](https://tools.ietf.org/html/rfc3261)
- [SIP响应码列表](https://en.wikipedia.org/wiki/List_of_SIP_response_codes)

### 本项目文档
- [完整文档](../README.md)
- [网络访问配置](./NETWORK_ACCESS.md)
- [后端API文档](../backend/README.md)

---

## 🎓 进阶学习

### 下一步

1. **添加Action** - 为消息添加动作（未来功能）
   - 播放音频
   - 提取变量
   - 执行命令

2. **添加变量** - 使用场景变量（未来功能）
   - 定义自定义变量
   - 条件判断
   - 循环控制

3. **场景模板库** - 使用预定义模板（未来功能）
   - UAC/UAS标准流程
   - 认证场景
   - 错误处理场景

4. **导入/导出** - 分享场景（未来功能）
   - 导出为JSON
   - 从XML导入
   - 场景克隆

---

## 💡 最佳实践

### 1. 场景命名

使用描述性的名称：

```
✅ 好的命名:
  - basic-uac-with-auth
  - register-with-digest
  - call-transfer-scenario

❌ 不好的命名:
  - test1
  - scenario
  - aaa
```

### 2. 消息顺序

遵循SIP协议标准流程：

```
标准UAC流程:
INVITE → 100/180/183 → 200 → ACK → [通话] → BYE → 200

标准UAS流程:
收到INVITE → 100 → 180 → 200 → 收到ACK → [通话] → 收到BYE → 200
```

### 3. 超时设置

合理设置超时时间：

```
INVITE响应: 30000ms (30秒)
其他请求:   5000ms  (5秒)
BYE响应:    2000ms  (2秒)
```

### 4. 可选消息使用

合理使用可选标记：

```
可选: 100 Trying, 180 Ringing, 183 Session Progress
必需: 200 OK, ACK, BYE
```

### 5. 场景测试

创建后立即测试：

```bash
# 测试场景
sipp -sf scenarios/your-scenario.xml 192.168.1.100:5060 -m 1

# 参数说明:
# -sf: 指定场景文件
# -m 1: 只执行1次呼叫
```

---

## 🚀 快速参考

### 常用操作快捷键

- 无快捷键（使用鼠标点击）

### 常用命令

```bash
# 查看生成的场景文件
cat scenarios/basic-uac.xml

# 使用场景测试
sipp -sf scenarios/basic-uac.xml target_host:5060

# 查看场景统计
sipp -sf scenarios/basic-uac.xml target_host:5060 -trace_stat
```

---

**祝您使用愉快！** 🎉

如有问题，请参考[完整文档](../README.md)或提交Issue。
