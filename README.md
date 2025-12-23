# SIPp Web Manager - 分布式SIPp测试管理平台

SIPp Web Manager 是一个基于主从集群架构的 Web SIPp 测试管理平台，支持分布式测试执行、实时监控和统一管理。

## ✨ 核心特性

- 🏗️ **主从集群架构**: 一个主机管理多个从机，支持大规模分布式测试
- 📊 **智能负载均衡**: 自动选择负载最低的从机执行任务
- 🔄 **API心跳机制**: 从机每10秒通过HTTP API向主机报告状态
- 📁 **自动文件同步**: 测试场景和注入文件自动从主机推送到从机
- 📈 **实时监控**: WebSocket实时推送测试统计数据和进度
- 💾 **配置模板**: 保存和管理测试配置，快速复用常用配置
- 📥 **日志下载**: 一键下载任务日志和应用日志（ZIP打包）
- 🔐 **TLS证书管理**: 集中管理TLS/DTLS证书，支持加密SIP测试
- 🎛️ **独立任务统计**: 主从机任务历史独立统计，数据隔离清晰

## 🏛️ 架构说明

### 主从架构设计

```
┌─────────────────────────────────────────────────────────┐
│                     主机节点（Master）                    │
│  ┌──────────┐  ┌──────────┐  ┌────────────────────┐    │
│  │ Frontend │  │ Backend  │  │  MySQL Database    │    │
│  │  (UI)    │──│  (API)   │──│  - machines        │    │
│  └──────────┘  │  + API:  │  │  - task_history    │    │
│                │  /heartbeat│  └────────────────────┘    │
│                └──────────┘            │                 │
└───────┼──────────────┼─────────────────┼─────────────────┘
        │              │                 │
        │   HTTP API   │   Heartbeat     │  DB Query/Write
        │   (Task)     │   (10s POST)    │  (Task History)
        ▼              ▼                 ▼
┌─────────────────────────────────────────────────────────┐
│  从机节点01 (Slave-01)    从机节点02 (Slave-02)  ...    │
│  ┌──────────┐             ┌──────────┐                  │
│  │ Backend  │             │ Backend  │                  │
│  │ (API)    │─────────────│ (API)    │──┐               │
│  └──────────┘      ▲      └──────────┘  │  共享访问DB   │
│       │            │           │         ▼  (任务历史)  │
│  ┌────▼────┐  Heartbeat   ┌────▼────┐ ┌──────────────┐ │
│  │  SIPp   │   via API    │  SIPp   │ │MySQL Client  │ │
│  └─────────┘              └─────────┘ └──────────────┘ │
└─────────────────────────────────────────────────────────┘
```

**核心组件：**
- **主机（Master）**: 唯一管理节点，提供 Web UI 和任务调度
- **从机（Slave）**: 多个执行节点，仅提供 API 服务，无前端
- **共享数据库**: 所有节点连接到主机的 MySQL 数据库
- **文件同步**: 主机自动将场景文件和注入文件推送到从机

### 数据库表结构

主机 MySQL 数据库包含以下核心表：

| 表名 | 说明 | 主要字段 |
|------|------|----------|
| `scenarios` | 测试场景 | filename, name, messages, variables |
| `injection_files` | 注入文件 | filename, content, field_count, row_count |
| `task_history` | 任务历史 | id, scenario_file, status, machine_id, stats |
| `config_templates` | 配置模板 | name, config, is_default |
| `machines` | 集群节点 | id, name, ip_address, role, status |
| `tls_certificates` | TLS证书 | id, name, cert_content, key_content |

**关键字段说明：**
- `task_history.machine_id`: 任务执行节点标识（'master' 或具体从机ID）
- `machines.role`: 节点角色（'master' / 'slave'）
- `machines.status`: 节点状态（'online' / 'offline' / 'busy'）
- `tls_certificates.cert_content`: 证书内容（PEM格式）
- `tls_certificates.key_content`: 私钥内容（PEM格式）

## 📚 文档导航

- **[集群部署指南 (CLUSTER_DEPLOYMENT.md)](CLUSTER_DEPLOYMENT.md)** - 完整的主从集群部署文档
- **[MySQL 快速搭建 (docs/MYSQL_SETUP_GUIDE.md)](docs/MYSQL_SETUP_GUIDE.md)** - 数据库快速安装
- **[快速开始 (QUICKSTART.md)](QUICKSTART.md)** - 5分钟快速部署
- **[部署检查清单 (DEPLOYMENT_CHECKLIST.md)](DEPLOYMENT_CHECKLIST.md)** - 部署验证清单

## 🚀 快速部署

### 环境要求

**主机节点：**
- Node.js >= 18.x
- MySQL >= 8.0
- SIPp >= 3.6 (可选，主机也可执行测试)

**从机节点：**
- Node.js >= 18.x
- SIPp >= 3.6 (必需)

### 主机部署

```bash
# 1. 克隆项目
git clone <repository-url> /opt/sipp-web-manager
cd /opt/sipp-web-manager

# 2. 配置数据库连接（根据实际情况修改）
export DB_HOST=localhost
export DB_PORT=3306
export DB_USER=root
export DB_PASSWORD=your_password
export DB_NAME=sipp_manager

# 3. 运行部署脚本
./deploy.sh master

# 4. 启动服务
./service.sh start

# 或手动启动: cd backend && npm start
# 生产环境建议使用 PM2: pm2 start dist/index.js --name sipp-manager-master
```

### 从机部署

```bash
# 1. 克隆项目
git clone <repository-url> /opt/sipp-web-manager
cd /opt/sipp-web-manager

# 2. 运行部署脚本（指定主机IP）
./deploy.sh slave <主机IP地址>
# 例如: ./deploy.sh slave 192.168.1.100

# 3. 启动服务
./service.sh start

# 或手动启动: cd backend && npm start
# 生产环境建议使用 PM2: pm2 start dist/index.js --name sipp-manager-slave-01
```

### 服务管理

部署完成后，使用服务管理脚本控制服务：

```bash
./service.sh start      # 启动服务
./service.sh stop       # 停止服务
./service.sh restart    # 重启服务
./service.sh status     # 查看状态
./service.sh logs       # 查看实时日志
```

**自动进程管理：**
- 脚本自动检测 PM2，如果可用则使用 PM2 管理（推荐生产环境）
- 未安装 PM2 时使用 nohup 后台运行
- PID 文件: `backend/.service.pid`
- 日志文件: `backend/logs/app.log`

### 升级部署

详细升级流程请参阅 [UPGRADE.md](UPGRADE.md)

## 🎯 核心功能

### 场景管理
- 创建、编辑、删除 SIPp XML 场景文件
- 在线代码编辑器，支持语法高亮
- 场景文件自动同步到从机

### 注入文件管理
- 管理 CSV 格式数据注入文件
- 在线编辑和预览
- 自动推送到执行从机

### TLS证书管理
- 上传和管理 TLS/DTLS 证书和私钥
- 支持加密 SIP 测试（TLS/DTLS）
- 证书存储在主机数据库，从机按需拉取
- 支持自定义注册场景和最大呼叫数配置

### 任务执行
- 智能调度：自动选择负载最低的从机
- 手动指定：可选择特定从机执行
- 实时监控：WebSocket推送测试进度
- RTP端口范围可选配置（可留空使用系统默认）

### 从机管理
- 实时查看从机状态（在线/离线）
- 监控CPU、内存使用率
- 查看从机运行任务数
- 健康检查

### 任务历史
- 记录所有完成的测试任务
- 详细统计数据和日志
- 支持按机器筛选
- **主从机任务独立统计**（主机仅显示本机任务，从机仅显示自己的任务）

## 🔧 配置说明

### 主机配置 (.env)

```bash
# 节点角色（必须为 master）
NODE_ROLE=master
MACHINE_ID=master
MACHINE_NAME=主控节点

# 数据库配置
DB_HOST=localhost
DB_PORT=3306
DB_NAME=sipp_manager
DB_USER=sipp
DB_PASSWORD=sipp123456

# 服务配置
PORT=3000
LOG_LEVEL=info
```

### 从机配置 (.env)

```bash
# 节点角色（必须为 slave）
NODE_ROLE=slave
MACHINE_ID=slave-01  # 每台从机必须唯一
MACHINE_NAME=测试节点01

# 主机连接
MASTER_HOST=192.168.1.100
MASTER_PORT=3000

# 数据库配置（连接主机数据库）
DB_HOST=192.168.1.100
DB_PORT=3306
DB_NAME=sipp_manager
DB_USER=sipp
DB_PASSWORD=sipp123456

# 心跳间隔
HEARTBEAT_INTERVAL=10000  # 10秒
```

## 📋 使用指南

### 查看从机状态

1. 访问主机 Web UI: `http://<主机IP>:3000`
2. 点击左侧菜单 "从机管理"
3. 查看所有从机的状态、负载、运行任务数

### TLS证书管理

1. 进入 "证书管理" 页面
2. 点击 "上传证书"
3. 填写证书信息：
   - 证书名称：自定义名称（如 "测试环境TLS证书"）
   - 证书文件：上传 PEM 格式证书文件
   - 私钥文件：上传 PEM 格式私钥文件
   - 描述：可选说明
4. 上传后证书存储在主机数据库，从机执行 TLS 测试时自动拉取

### 启动测试

1. 进入 "场景管理" 页面
2. 点击 "启动测试"
3. 配置基本参数：
   - 呼叫速率、最大并发、呼叫限制
   - 目标 SIP 服务器地址和端口
   - 传输协议（UDP/TCP/TLS/DTLS）
4. 高级选项（可选）：
   - **RTP端口范围**：可留空使用系统默认，或设置最小/最大端口
   - **TLS证书**：选择已上传的证书（仅 TLS/DTLS 协议需要）
   - **注册场景**：可选自定义注册场景文件
   - 其他调试选项（消息跟踪、日志级别等）
5. 选择执行机器：
   - **不选择（推荐）**: 系统自动选择负载最低的从机
   - **选择具体从机**: 指定在某台从机上执行
   - **选择主控节点**: 在主机本地执行

## 🛠️ 技术栈

**前端：**
- React 18 + TypeScript
- Ant Design 5
- Vite
- Socket.IO Client

**后端：**
- Node.js 18+ + TypeScript
- Express.js
- MySQL 8.0
- Socket.IO
- Winston (日志)

**测试工具：**
- SIPp

## 📖 详细文档

完整的部署、配置和故障排查指南，请参阅：

- [集群部署指南](CLUSTER_DEPLOYMENT.md) - 主从集群完整部署文档

## 🔍 常见问题

### 从机无法连接主机数据库

**原因：** MySQL未允许远程连接

**解决：**
```bash
# 主机上执行
sudo mysql -e "CREATE USER 'sipp'@'%' IDENTIFIED BY 'sipp123456';"
sudo mysql -e "GRANT ALL PRIVILEGES ON sipp_manager.* TO 'sipp'@'%';"
sudo mysql -e "FLUSH PRIVILEGES;"

# 配置MySQL允许远程连接
sudo sed -i 's/bind-address.*/bind-address = 0.0.0.0/' /etc/mysql/mysql.conf.d/mysqld.cnf
sudo systemctl restart mysql

# 开放防火墙
sudo ufw allow 3306/tcp
```

### 从机状态显示离线

**原因：** 心跳服务未启动或网络不通

**解决：**
```bash
# 从机上检查日志
sudo journalctl -u sipp-web-manager-slave -f

# 检查网络连通性
curl http://<主机IP>:3000/api/health

# 重启从机服务
sudo systemctl restart sipp-web-manager-slave
```

### 场景文件未找到

场景文件会自动从主机同步到从机，无需手动复制。如果仍然找不到：

1. 确保主机 `scenarios/` 目录下有对应文件
2. 检查从机日志，查看文件同步是否成功
3. 重新启动测试，文件会自动重新推送

### 主机任务统计显示了从机任务

**已修复（v2.1.0）**：现在主机和从机的任务历史独立统计
- 主机仅显示 machine_id='master' 的任务
- 从机仅显示自己 machine_id 的任务

### TLS测试失败或证书错误

**原因：** 证书格式错误或未正确上传

**解决：**
1. 确保证书和私钥为 PEM 格式（BASE64编码）
2. 证书文件应以 `-----BEGIN CERTIFICATE-----` 开头
3. 私钥文件应以 `-----BEGIN PRIVATE KEY-----` 或 `-----BEGIN RSA PRIVATE KEY-----` 开头
4. 重新上传证书并在测试配置中选择对应证书

### RTP端口范围设置后仍然使用默认端口

**原因：** 设置不完整或值为0

**解决：**
- RTP 端口范围必须**同时设置最小和最大端口**，或者**都留空**
- 如果只设置一个，会提示错误
- 设置为 0 等同于留空，使用系统默认端口
- 建议范围：1024-65535 之间，最小端口必须小于最大端口

## 🤝 贡献

欢迎提交 Issue 和 Pull Request！

## 📄 许可证

MIT License

---

**版本：** v2.1.0 - TLS证书管理与任务统计优化
**更新日期：** 2025-12-23

## 📝 更新日志

### v2.1.0 (2025-12-23)
- ✨ 新增 TLS/DTLS 证书管理功能
- 🔧 RTP 端口范围改为可选配置
- 🐛 修复主从机任务统计混淆问题（现在主从机任务历史独立统计）
- 🗑️ 移除多语言支持，统一使用中文界面
- 📦 优化文件上传和注入文件同步机制
- 🚀 任务启动失败时自动标记为 FAILED 状态

### v2.0.0 (2025-12-22)
- 🏗️ 主从集群架构重构
- 📊 智能负载均衡与任务调度
- 🔄 API 心跳机制优化
- 📁 自动文件同步实现
