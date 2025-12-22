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
- 🌐 **多语言支持**: 中文/英文界面切换

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

### 任务执行
- 智能调度：自动选择负载最低的从机
- 手动指定：可选择特定从机执行
- 实时监控：WebSocket推送测试进度

### 从机管理
- 实时查看从机状态（在线/离线）
- 监控CPU、内存使用率
- 查看从机运行任务数
- 健康检查

### 任务历史
- 记录所有完成的测试任务
- 详细统计数据和日志
- 支持按机器筛选

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

### 启动测试

1. 进入 "场景管理" 页面
2. 点击 "启动测试"
3. 在 "执行机器" 下拉框中：
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

## 🤝 贡献

欢迎提交 Issue 和 Pull Request！

## 📄 许可证

MIT License

---

**版本：** v2.0.0 - 主从集群架构
**更新日期：** 2025-12-22
