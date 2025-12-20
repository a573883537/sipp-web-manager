# 场景文件与注入文件配合使用指南

## 📋 核心概念

### 什么是注入文件（Injection File）？
注入文件是 **CSV 格式的数据源**，用于为每次呼叫提供不同的动态参数（如用户名、密码、服务器地址等）。

### 什么是场景文件（Scenario File）？
场景文件是 **XML 格式的 SIP 消息流程定义**，描述了完整的 SIP 会话流程（如 REGISTER、INVITE、BYE）。

### 两者如何协同？
场景文件通过 `[field0]`, `[field1]`, `[field2]` 等占位符引用注入文件的列数据，实现**批量、多用户测试**。

---

## 🔧 完整示例：多分机注册测试

### 1. 注入文件示例（reg2188.csv）

```csv
SEQUENTIAL
# [field0];[field1];[field2]
4020;Yeastar202;192.168.21.88
4021;Yeastar202;192.168.21.88
```

**字段说明：**
- 第一行：`SEQUENTIAL` = 顺序读取模式（还支持 RANDOM、USER）
- 第二行：注释行（可选）
- 后续行：数据行，分号分隔
  - `[field0]` = 分机号（4020、4021）
  - `[field1]` = 密码（Yeastar202）
  - `[field2]` = SIP 服务器 IP（192.168.21.88）

### 2. 场景文件示例（register_with_auth.xml）

```xml
<scenario name="REGISTER with Authentication">
  <!-- 第一次 REGISTER：发起注册请求 -->
  <send retrans="500">
    <![CDATA[
      REGISTER sip:[field2]:5060 SIP/2.0
      From: <sip:[field0]@[field2]>;tag=[pid]SIPpTag[call_number]
      To: <sip:[field0]@[field2]>
      Contact: <sip:[field0]@[local_ip]:[local_port]>
      Expires: 3600
    ]]>
  </send>

  <!-- 接收 401 Unauthorized（包含认证挑战） -->
  <recv response="401" auth="true" optional="true" timeout="5000"/>

  <!-- 第二次 REGISTER：发送带认证信息的请求 -->
  <send retrans="500">
    <![CDATA[
      REGISTER sip:[field2]:5060 SIP/2.0
      From: <sip:[field0]@[field2]>;tag=[pid]SIPpTag[call_number]
      [authentication username=[field0] password=[field1]]
      Expires: 3600
    ]]>
  </send>

  <!-- 接收 200 OK（注册成功） -->
  <recv response="200" timeout="5000"/>

  <!-- 保持注册 60 秒 -->
  <pause milliseconds="60000"/>

  <!-- 注销（Expires=0） -->
  <send retrans="500">
    <![CDATA[
      REGISTER sip:[field2]:5060 SIP/2.0
      From: <sip:[field0]@[field2]>;tag=[pid]SIPpTag[call_number]
      Expires: 0
    ]]>
  </send>

  <recv response="200" timeout="5000"/>
</scenario>
```

**关键字段引用：**
- `[field0]` → 分机号（4020、4021）
- `[field1]` → 密码（Yeastar202）
- `[field2]` → 服务器 IP（192.168.21.88）
- `[authentication username=[field0] password=[field1]]` → SIPp 自动生成 Authorization 头

### 3. 执行流程解析

当执行以下命令时：
```bash
./test-register-with-injection.sh
```

**SIPp 会按以下方式运行：**

| 时间点 | 并发呼叫1（field0=4020） | 并发呼叫2（field0=4021） |
|--------|--------------------------|--------------------------|
| T+0s   | REGISTER sip:192.168.21.88:5060<br/>From: 4020@192.168.21.88 | - |
| T+0s   | ← 401 Unauthorized | - |
| T+0s   | REGISTER with Auth (username=4020, password=Yeastar202) | - |
| T+0s   | ← 200 OK | - |
| T+1s   | - | REGISTER sip:192.168.21.88:5060<br/>From: 4021@192.168.21.88 |
| T+1s   | - | ← 401 Unauthorized |
| T+1s   | - | REGISTER with Auth (username=4021, password=Yeastar202) |
| T+1s   | - | ← 200 OK |
| T+60s  | REGISTER with Expires=0 (注销) | - |
| T+61s  | - | REGISTER with Expires=0 (注销) |

**关键参数：**
- `rate: 1` = 每秒发起 1 个新呼叫
- `users: 2` = 最大并发 2 个呼叫
- `limit: 2` = 总共执行 2 次呼叫流程
- `injectionFile: reg2188.csv` = 从 CSV 文件顺序读取数据

---

## 🖥️ 前端界面操作指南

### 步骤 1：上传/管理注入文件

1. 访问 **注入文件** 页面（http://localhost:5173/injection-files）
2. 点击 **新建注入文件** 按钮
3. 填写表单：
   - 文件名：`my_users.csv`
   - 描述：`我的测试分机列表`
   - 读取模式：`SEQUENTIAL`（顺序读取）
   - 内容：
     ```csv
     SEQUENTIAL
     4000;password123;192.168.1.100
     4001;password456;192.168.1.100
     4002;password789;192.168.1.100
     ```
4. 点击 **保存**

### 步骤 2：上传/选择场景文件

1. 访问 **场景管理** 页面（http://localhost:5173/scenarios）
2. 确认 `register_with_auth.xml` 已存在
3. 如果不存在，点击 **上传场景** 按钮上传

### 步骤 3：启动测试

1. 访问 **监控面板** 或 **配置中心** 页面
2. 在 **启动测试** 表单中填写：
   - **场景文件**：选择 `register_with_auth.xml`
   - **注入文件**：选择 `my_users.csv`
   - **远程主机**：`192.168.1.100`
   - **远程端口**：`5060`
   - **本地端口**：`5070`
   - **呼叫速率**：`1`（每秒 1 个呼叫）
   - **并发用户数**：`3`（对应 3 行数据）
   - **呼叫限制**：`3`（总共 3 次注册）
   - **RTP 端口范围**：`6000` - `6100`
   - **启用 RTP Echo**：勾选（用于测试）
3. 点击 **启动测试**

### 步骤 4：监控结果

在 **监控面板** 查看实时数据：
- **当前呼叫数**：应显示 0-3 之间动态变化
- **成功呼叫数**：应增长到 3
- **失败呼叫数**：应保持为 0（如果服务器配置正确）
- **消息统计**：发送/接收的 SIP 消息数量

---

## 🔍 常见问题排查

### 问题 1：注册失败（401 错误）
**原因**：密码错误或服务器不支持认证算法
**解决**：
1. 检查注入文件中的密码是否正确
2. 检查服务器日志，确认认证失败原因
3. 尝试在场景文件中显式指定认证算法：
   ```xml
   <recv response="401" auth="digest" optional="true"/>
   ```

### 问题 2：字段映射错误
**症状**：服务器返回 "Invalid User" 或 "Unknown Domain"
**原因**：CSV 列顺序与场景文件引用不匹配
**解决**：
1. 确认 CSV 文件列顺序：分机号;密码;服务器IP
2. 确认场景文件引用正确：
   ```xml
   [field0] = 分机号（第1列）
   [field1] = 密码（第2列）
   [field2] = 服务器IP（第3列）
   ```

### 问题 3：并发数与数据行不匹配
**症状**：只注册了部分分机
**原因**：`users` 参数小于 CSV 行数
**解决**：
- `users` 应 >= CSV 数据行数
- `limit` 应 >= CSV 数据行数（如果想每个分机都测试一次）
- 例如：CSV 有 10 行数据，应设置 `users: 10, limit: 10`

### 问题 4：RTP 端口不足
**症状**：部分呼叫建立失败
**原因**：RTP 端口范围太小
**解决**：
- 每个并发呼叫需要 2 个端口（RTP + RTCP）
- 公式：`maxRtpPort - minRtpPort + 1 >= users × 2`
- 例如：10 并发需要 20 个端口，设置 `minRtpPort: 6000, maxRtpPort: 6020`

---

## 📊 高级用法

### 1. 随机读取模式（RANDOM）

```csv
RANDOM
4000;password123;192.168.1.100
4001;password456;192.168.1.100
4002;password789;192.168.1.100
```

每次呼叫随机选择一行数据，适合压力测试。

### 2. 用户模式（USER）

```csv
USER
4000;password123;192.168.1.100
4001;password456;192.168.1.100
```

每个并发呼叫绑定一行数据，适合长连接测试（如 REGISTER 保活）。

### 3. 多场景切换

可以在同一个注入文件中使用不同的场景文件：
- `register_with_auth.xml` → 用于注册测试
- `example-uac.xml` → 用于呼叫测试
- 两者可以共用同一个注入文件（如果字段定义相同）

---

## 🚀 性能优化建议

1. **预分配端口范围**：根据最大并发数预留足够的 RTP 端口
2. **调整呼叫速率**：避免瞬间大量并发导致服务器过载
3. **监控资源使用**：观察 CPU、内存、网络带宽
4. **分批测试**：大规模测试建议分批执行，每批完成后分析结果

---

## 📝 快速参考

### API 请求示例

```bash
curl -X POST http://localhost:3000/api/sipp/start \
  -H "Content-Type: application/json" \
  -d '{
    "scenarioFile": "register_with_auth.xml",
    "injectionFile": "reg2188.csv",
    "rate": 1,
    "users": 2,
    "limit": 2,
    "remoteHost": "192.168.21.88",
    "remotePort": 5060,
    "localPort": 5070,
    "minRtpPort": 6000,
    "maxRtpPort": 6100,
    "enableRtpEcho": true
  }'
```

### 参数对照表

| 参数 | 说明 | 默认值 | 建议值 |
|------|------|--------|--------|
| `scenarioFile` | 场景文件名 | 无 | register_with_auth.xml |
| `injectionFile` | 注入文件名 | 无 | reg2188.csv |
| `rate` | 呼叫速率（calls/sec） | 10 | 1-10 |
| `users` | 最大并发呼叫数 | 100 | = CSV 行数 |
| `limit` | 总呼叫次数限制 | 0（无限） | = CSV 行数 |
| `remoteHost` | SIP 服务器 IP | 127.0.0.1 | 实际服务器 IP |
| `remotePort` | SIP 服务器端口 | 5060 | 5060 |
| `localPort` | 本地 SIP 端口 | 5061 | 5070 |
| `minRtpPort` | RTP 起始端口 | 无 | 6000 |
| `maxRtpPort` | RTP 结束端口 | 无 | 6100 |
| `enableRtpEcho` | 启用 RTP 回声 | false | true（测试用） |

---

## ✅ 验证清单

测试完成后，在 PBX 服务器上验证：

- [ ] 分机已成功注册（查看 PBX 注册状态）
- [ ] Contact 地址正确（应显示测试机 IP）
- [ ] 注册保持 60 秒后自动注销
- [ ] 无认证失败或异常日志
- [ ] SIPp 统计显示 100% 成功率

---

**文档版本**：v1.0
**最后更新**：2025-12-19
