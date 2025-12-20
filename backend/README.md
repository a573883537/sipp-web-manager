# SIPp Web Manager - Backend

基于Node.js + Express + Socket.IO的SIPp Web管理后端服务。

## 功能特性

- ✅ **SIPp控制接口** - 通过UDP与SIPp通信，支持所有控制命令
- ✅ **实时数据推送** - WebSocket实时推送统计数据和状态更新
- ✅ **场景管理** - XML场景文件的解析、验证、创建和编辑
- ✅ **CSV监听** - 实时监听SIPp生成的CSV统计文件
- ✅ **RESTful API** - 完整的REST API接口
- ✅ **日志记录** - 基于Winston的分级日志系统

## 技术栈

- **运行时**: Node.js 18+
- **框架**: Express 4.x
- **WebSocket**: Socket.IO 4.x
- **语言**: TypeScript 5.x
- **日志**: Winston 3.x
- **解析**: csv-parse, xml2js

## 快速开始

### 1. 安装依赖

```bash
npm install
```

### 2. 配置环境变量

复制 `.env.example` 为 `.env` 并根据需要修改：

```bash
cp .env.example .env
```

关键配置项：
- `SIPP_HOST`: SIPp运行的主机地址（默认: localhost）
- `SIPP_CONTROL_PORT`: SIPp控制端口（默认: 8888）
- `SIPP_SCENARIO_DIR`: 场景文件目录
- `PORT`: HTTP服务器端口（默认: 3000）

### 3. 启动开发服务器

```bash
npm run dev
```

### 4. 构建生产版本

```bash
npm run build
npm start
```

## 项目结构

```
backend/
├── src/
│   ├── api/              # REST API路由
│   │   └── routes.ts
│   ├── config/           # 配置管理
│   │   └── index.ts
│   ├── parsers/          # 解析器
│   │   ├── csv-parser.ts
│   │   └── xml-parser.ts
│   ├── services/         # 核心服务
│   │   └── sipp-client.ts
│   ├── utils/            # 工具函数
│   │   └── logger.ts
│   ├── websocket/        # WebSocket服务
│   │   └── index.ts
│   └── index.ts          # 应用入口
├── dist/                 # 构建产物
├── logs/                 # 日志文件
├── data/                 # 数据库文件（如需要）
├── package.json
├── tsconfig.json
└── .env                  # 环境变量配置
```

## API文档

### 健康检查

```http
GET /health
```

响应示例：
```json
{
  "status": "ok",
  "timestamp": 1702345678901,
  "sipp": {
    "connected": true,
    "host": "localhost",
    "port": 8888
  },
  "websocket": {
    "clients": 2
  }
}
```

### 场景管理

#### 列出所有场景
```http
GET /api/scenarios
```

#### 获取场景详情
```http
GET /api/scenarios/:filename
```

#### 创建/更新场景
```http
POST /api/scenarios
Content-Type: application/json

{
  "filename": "my-scenario.xml",
  "scenario": {
    "name": "My Scenario",
    "messages": [...]
  }
}
```

#### 删除场景
```http
DELETE /api/scenarios/:filename
```

#### 验证场景
```http
POST /api/scenarios/validate
Content-Type: application/json

{
  "scenario": {...}
}
```

### SIPp控制

所有SIPp控制命令通过WebSocket发送（见WebSocket Events）。

## WebSocket Events

### 客户端 -> 服务器

#### 发送SIPp命令
```javascript
socket.emit('sipp:command', {
  command: 'setRate',
  args: { rate: 10 }
});
```

支持的命令：
- `setRate` - 设置呼叫速率
- `setUsers` - 设置并发用户数
- `setLimit` - 设置呼叫限制
- `pause` - 暂停/恢复
- `quit` - 停止测试
- `increaseRate` - 增加速率
- `decreaseRate` - 减少速率
- `setTraceError` - 启用/禁用错误日志
- `setTraceMessages` - 启用/禁用消息日志
- `resetStats` - 重置统计
- `getStats` - 获取统计数据

#### 请求统计数据
```javascript
socket.emit('stats:request');
```

### 服务器 -> 客户端

#### 连接成功
```javascript
socket.on('connected', (data) => {
  console.log('Connected:', data);
});
```

#### 统计数据更新
```javascript
socket.on('stats:update', (stats) => {
  console.log('Stats:', stats);
});
```

#### CSV数据更新
```javascript
socket.on('stats:csv', (row) => {
  console.log('CSV Row:', row);
});
```

#### SIPp消息
```javascript
socket.on('sipp:message', (data) => {
  console.log('SIPp Message:', data.message);
});
```

#### 命令执行结果
```javascript
socket.on('command:success', (data) => {
  console.log('Command succeeded:', data);
});

socket.on('command:error', (data) => {
  console.error('Command failed:', data);
});
```

## 开发指南

### 代码规范

项目遵循以下编程原则：

- **SOLID原则** - 单一职责、开闭、里氏替换、接口隔离、依赖倒置
- **KISS原则** - 保持简单直接
- **DRY原则** - 避免代码重复
- **YAGNI原则** - 只实现需要的功能

### 添加新的API端点

在 `src/api/routes.ts` 中添加：

```typescript
apiRouter.get('/my-endpoint', async (req: Request, res: Response) => {
  try {
    // 业务逻辑
    res.json({ success: true, data: result });
  } catch (error: any) {
    logger.error('Error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});
```

### 添加新的WebSocket事件

在 `src/websocket/index.ts` 的 `setupSocketHandlers` 方法中添加：

```typescript
socket.on('my:event', async (data) => {
  // 处理逻辑
  socket.emit('my:response', result);
});
```

## 扩展SIPp支持JSON统计

为了获取实时统计数据，需要在SIPp中添加支持：

在 `sipp/src/socket.cpp` 的 `handle_ctrl_socket()` 函数中添加：

```cpp
if (strstr(command, "get stats json") == command) {
    char response[8192];
    snprintf(response, sizeof(response),
        "{"
        "\"timestamp\":%ld,"
        "\"calls\":{\"total\":%lu,\"current\":%d,\"success\":%lu,\"failed\":%lu},"
        "\"rate\":{\"current\":%.2f,\"target\":%.2f}"
        "}",
        time(NULL),
        nb_sent_calls, open_calls_user + open_calls_auto,
        nb_recv_calls, nb_failed_calls,
        rate, open_calls_allowed
    );

    sendto(ctrl_socket->ss_fd, response, strlen(response), 0,
           (struct sockaddr*)&client_addr, client_addr_len);
    return;
}
```

## 故障排除

### SIPp连接失败

1. 确认SIPp正在运行
2. 检查控制端口是否正确（默认8888）
3. 查看日志文件 `logs/app.log`

### CSV监听不工作

1. 确认SIPp使用 `-trace_stat` 参数
2. 检查CSV文件路径配置
3. 确认文件权限

### WebSocket断开

1. 检查CORS配置
2. 查看浏览器控制台错误
3. 检查服务器日志

## 许可证

MIT
