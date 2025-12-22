# SIPp Web Manager 部署指南

SIPp Web Manager 是一个基于 Web 的 SIPp 测试管理平台，提供场景管理、实时监控、任务历史等功能。

## 📚 文档导航

- **[MySQL 快速搭建指南 (docs/MYSQL_SETUP_GUIDE.md)](docs/MYSQL_SETUP_GUIDE.md)** - 数据库快速安装部署
- **[快速开始 (QUICKSTART.md)](QUICKSTART.md)** - 5 分钟快速部署指南
- **[部署检查清单 (DEPLOYMENT_CHECKLIST.md)](DEPLOYMENT_CHECKLIST.md)** - 完整的部署验证清单
- **本文档** - 详细的部署和配置说明

## 系统要求

- Node.js >= 18.x
- npm >= 9.x
- MySQL >= 5.7 或 MariaDB >= 10.3
- SIPp (需要预先安装)
- 操作系统: Linux / macOS

## 快速部署

### 准备工作：安装数据库

如果您的系统还没有安装 MySQL，可以使用我们提供的快速搭建脚本：

```bash
# 运行数据库快速搭建脚本
./setup-mysql.sh

# 脚本支持两种方式：
# 1. Docker 容器部署（推荐）- 快速、隔离、易管理
# 2. 本地安装 MySQL - 传统方式、性能更好

# 脚本会自动：
# - 检测操作系统
# - 安装 Docker（如果选择容器部署且未安装）
# - 部署 MySQL 容器或安装本地 MySQL
# - 可选：自动初始化 SIPp Web Manager 数据库
# - 生成配置文件供后续使用
```

**容器部署优势：**
- ✅ 5 分钟快速部署
- ✅ 数据持久化（使用 Docker Volume）
- ✅ 隔离性好，不影响系统
- ✅ 易于管理和迁移
- ✅ 自动重启（--restart unless-stopped）

### 方式一：一键部署（推荐）

使用自动化部署脚本，快速完成部署：

```bash
# 1. 克隆或下载项目
cd /path/to/sipp-web-manager

# 2. 初始化数据库（MySQL）
cd backend/database
# 配置数据库连接
export DB_HOST=localhost
export DB_PORT=3306
export DB_USER=root
export DB_PASSWORD=your_password
export DB_NAME=sipp_manager

# 如果使用 Docker 容器部署 MySQL，设置容器名称
# export DB_CONTAINER=mysql-container

# 执行初始化脚本
./init-db.sh
cd ../..

# 3. 执行自动化部署脚本
./deploy.sh

# 部署脚本会自动：
# - 检查 Node.js 版本
# - 检查数据库连接和表结构
# - 配置环境变量
# - 安装依赖并构建前后端
# - 提示是否启动服务（PM2 或 nohup）
```

**部署脚本特性：**
- ✅ 自动环境检查（Node.js、数据库）
- ✅ 强制数据库验证（确保表结构完整）
- ✅ 支持本地和容器化数据库
- ✅ 自动创建必要目录
- ✅ 一键启动服务

### 方式二：开发模式快速启动

```bash
# 适用于开发和测试
./start.sh

# 会自动启动前后端开发服务器
# 前端: http://localhost:5173
# 后端: http://localhost:3000
```

### 方式三：手动部署

```bash
# 1. 初始化数据库
cd backend/database
export DB_USER=root DB_PASSWORD=your_password
./init-db.sh
cd ../..

# 2. 配置环境变量
cat > backend/.env << 'EOF'
PORT=3000
NODE_ENV=production
DB_HOST=localhost
DB_PORT=3306
DB_NAME=sipp_manager
DB_USER=root
DB_PASSWORD=your_password
EOF

# 3. 构建后端
cd backend
npm install
npm run build
cd ..

# 4. 构建前端
cd frontend
npm install
npm run build
cd ..

# 5. 启动服务
./service.sh start
```

## 配置说明

### 后端配置 (backend/.env)

```bash
# 服务器配置
PORT=3000                          # 后端服务端口
NODE_ENV=production                # 环境模式

# 数据库配置 (MySQL)
DB_HOST=localhost                  # MySQL 主机地址
DB_PORT=3306                       # MySQL 端口
DB_NAME=sipp_manager               # 数据库名称
DB_USER=root                       # 数据库用户名
DB_PASSWORD=                       # 数据库密码
DB_POOL_SIZE=10                    # 连接池大小

# 数据库容器配置 (可选，如果使用 Docker 容器部署 MySQL)
DB_CONTAINER=                      # 数据库容器名称，留空表示使用本地 MySQL
                                   # 例如: DB_CONTAINER=mysql-container

# SIPp 配置
SIPP_PATH=sipp                     # SIPp 可执行文件路径
SIPP_HOST=localhost                # SIPp 主机地址
SIPP_CONTROL_PORT=8888             # SIPp 控制端口起始值
SIPP_SCENARIO_DIR=../scenarios     # 场景文件目录
SIPP_INJECTION_DIR=../injections   # 注入文件目录
SIPP_LOG_DIR=../logs               # 日志文件目录

# WebSocket 配置
WS_CORS_ORIGIN=*                   # CORS 允许的来源

# 日志配置
LOG_LEVEL=info                     # 日志级别 (debug/info/warn/error)
LOG_FILE=./logs/app.log            # 日志文件路径
```

### 前端配置 (frontend/.env)

```bash
# API 配置
VITE_API_BASE_URL=/api             # API 基础路径
VITE_WS_PORT=3000                  # WebSocket 端口

# 默认测试配置
VITE_DEFAULT_REMOTE_HOST=127.0.0.1 # 默认远程主机
VITE_DEFAULT_REMOTE_PORT=5060      # 默认远程端口
VITE_DEFAULT_LOCAL_PORT=5061       # 默认本地端口
```

## 生产环境部署

### 部署流程总览

```
数据库初始化 → 执行部署脚本 → 启动服务 → 配置反向代理（可选）
```

### 1. 数据库初始化

#### 本地 MySQL 部署

```bash
cd backend/database

# 设置数据库连接参数
export DB_HOST=localhost
export DB_PORT=3306
export DB_USER=root
export DB_PASSWORD=your_password
export DB_NAME=sipp_manager

# 执行初始化
./init-db.sh
```

#### Docker 容器部署 MySQL

```bash
# 1. 启动 MySQL 容器
docker run -d \
  --name mysql-container \
  -e MYSQL_ROOT_PASSWORD=your_password \
  -e MYSQL_DATABASE=sipp_manager \
  -p 3306:3306 \
  mysql:8.0

# 2. 初始化数据库（指定容器名称）
cd backend/database
export DB_CONTAINER=mysql-container
export DB_USER=root
export DB_PASSWORD=your_password
./init-db.sh

# 3. 在 backend/.env 中配置
# DB_CONTAINER=mysql-container
```

### 2. 自动化部署（推荐）

```bash
# 执行部署脚本
./deploy.sh

# 脚本会自动完成：
# ✓ 检查 Node.js 版本 (>= 18.x)
# ✓ 强制验证数据库连接和表结构
# ✓ 自动创建或检查 backend/.env 配置
# ✓ 安装依赖并构建前后端
# ✓ 创建必要的目录（scenarios、injections、logs）
# ✓ 提示是否启动服务

# 部署后会提示：
# "是否立即启动服务？(y/n)"
# 选择 y 自动使用 PM2 或 nohup 启动
```

**部署脚本优势：**
- 🔍 强制检查：数据库连接失败则停止部署
- 🐳 智能识别：自动支持本地和容器化数据库
- ⚡ 一键完成：无需手动执行多个命令
- 🛡️ 错误处理：任何步骤失败都会中止并提示

### 3. 服务管理

项目提供了便捷的服务管理脚本 `service.sh`，支持启动、停止、重启和监控服务。

#### 基本命令

```bash
# 启动服务
./service.sh start

# 停止服务
./service.sh stop

# 重启服务
./service.sh restart

# 查看服务状态（含健康检查）
./service.sh status

# 查看服务日志
./service.sh logs

# 查看帮助
./service.sh help
```

#### service.sh 特性

- ✅ **自动检测**：自动识别 PM2 是否安装
- ✅ **智能启动**：优先使用 PM2，否则使用 nohup
- ✅ **状态监控**：显示端口、进程、健康检查状态
- ✅ **日志聚合**：统一查看 PM2 和应用日志
- ✅ **智能清理**：停止时自动清理进程和 PID 文件

#### status 命令输出示例

```bash
$ ./service.sh status

╔═══════════════════════════════════════════════════════════╗
║            SIPp Web Manager 服务状态                       ║
╚═══════════════════════════════════════════════════════════╝

[INFO] PM2 服务状态:
[INFO] PM2 进程列表:
┌────┬────────────────┬─────────┬─────────┬──────────┬────────┬──────┐
│ id │ name           │ status  │ restart │ uptime   │ cpu    │ mem  │
├────┼────────────────┼─────────┼─────────┼──────────┼────────┼──────┤
│ 0  │ sipp-backend   │ online  │ 0       │ 2h       │ 0.1%   │ 52M  │
└────┴────────────────┴─────────┴─────────┴──────────┴────────┴──────┘

[INFO] 端口监听状态:
node    12345 user   21u  IPv4 0x1234  0t0  TCP *:3000 (LISTEN)
[SUCCESS] 服务正在监听端口 3000

[INFO] 服务健康检查:
[SUCCESS] 服务健康检查通过
{
  "status": "ok",
  "timestamp": "2024-01-01T12:00:00.000Z"
}
```

### 4. 使用 PM2 管理（推荐生产环境）

PM2 是专业的 Node.js 进程管理器，提供进程守护、自动重启、负载均衡等功能。

#### 安装 PM2

```bash
npm install -g pm2
```

#### 基本操作

```bash
# 启动服务
cd backend
pm2 start dist/index.js --name sipp-backend

# 查看所有进程
pm2 list

# 查看详细信息
pm2 describe sipp-backend

# 实时日志
pm2 logs sipp-backend
pm2 logs sipp-backend --lines 100

# 停止服务
pm2 stop sipp-backend

# 重启服务
pm2 restart sipp-backend

# 删除服务
pm2 delete sipp-backend

# 重载服务（零停机）
pm2 reload sipp-backend
```

#### 开机自启

```bash
# 生成启动脚本
pm2 startup

# 保存当前进程列表
pm2 save

# 现在重启服务器后，PM2 会自动启动保存的进程
```

#### 进程监控

```bash
# 实时监控仪表盘
pm2 monit

# Web 监控（需要注册账号）
pm2 plus
```

#### 高级配置

创建 `ecosystem.config.js`：

```javascript
module.exports = {
  apps: [{
    name: 'sipp-backend',
    script: './dist/index.js',
    cwd: './backend',
    instances: 1,
    autorestart: true,
    watch: false,
    max_memory_restart: '1G',
    env: {
      NODE_ENV: 'production',
      PORT: 3000
    },
    error_file: '../logs/pm2-error.log',
    out_file: '../logs/pm2-out.log',
    log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
    merge_logs: true
  }]
};
```

使用配置文件启动：
```bash
pm2 start ecosystem.config.js
pm2 reload ecosystem.config.js
```

### 5. 手动启动（不使用 PM2）

适用于简单的生产环境或测试环境。

#### 前台运行（调试）

```bash
cd backend
node dist/index.js
```

#### 后台运行

```bash
# 使用 nohup
cd backend
nohup node dist/index.js > ../logs/backend.log 2>&1 &
echo $! > ../logs/backend.pid

# 查看进程
cat ../logs/backend.pid

# 停止服务
kill $(cat ../logs/backend.pid)

# 强制停止
kill -9 $(cat ../logs/backend.pid)

# 查看日志
tail -f ../logs/backend.log
```

#### 使用 screen 或 tmux

```bash
# 使用 screen
screen -S sipp-backend
cd backend && node dist/index.js
# 按 Ctrl+A 然后按 D 分离会话
# 重新连接: screen -r sipp-backend

# 使用 tmux
tmux new -s sipp-backend
cd backend && node dist/index.js
# 按 Ctrl+B 然后按 D 分离会话
# 重新连接: tmux attach -t sipp-backend
```

### 6. 服务状态检查

#### 使用 service.sh（推荐）

```bash
./service.sh status
```

#### 手动检查

**检查端口监听：**
```bash
# 使用 lsof
lsof -i :3000

# 使用 netstat
netstat -tulpn | grep :3000

# 使用 ss
ss -tulpn | grep :3000
```

**检查进程：**
```bash
# 查找后端进程
ps aux | grep "node.*dist/index.js" | grep -v grep

# 查看进程树
pstree -p | grep node

# 查看 PM2 管理的进程
pm2 list
pm2 describe sipp-backend
```

**健康检查：**
```bash
# 基本健康检查
curl http://localhost:3000/health

# 美化输出（需要 jq）
curl -s http://localhost:3000/health | jq .

# 检查 API 响应
curl http://localhost:3000/api/scenarios

# 检查 WebSocket
curl -I http://localhost:3000/socket.io/
```

**资源使用情况：**
```bash
# 查看进程资源占用
top -p $(pgrep -f "node.*dist/index.js")

# 或使用 htop
htop -p $(pgrep -f "node.*dist/index.js")

# PM2 监控
pm2 monit
```

### 7. 使用 Nginx 反向代理

生产环境推荐使用 Nginx 作为反向代理，提供静态文件服务和负载均衡。

#### 安装 Nginx

```bash
# Ubuntu/Debian
sudo apt update
sudo apt install nginx

# CentOS/RHEL
sudo yum install nginx
```

#### 配置示例

创建 `/etc/nginx/sites-available/sipp-web-manager`：

```nginx
server {
    listen 80;
    server_name your-domain.com;

    # 访问日志
    access_log /var/log/nginx/sipp-access.log;
    error_log /var/log/nginx/sipp-error.log;

    # 前端静态文件
    location / {
        root /path/to/sipp-web-manager/frontend/dist;
        try_files $uri $uri/ /index.html;
        
        # 缓存配置
        location ~* \.(js|css|png|jpg|jpeg|gif|ico|svg)$ {
            expires 1y;
            add_header Cache-Control "public, immutable";
        }
    }

    # API 代理
    location /api {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
        
        # 超时设置
        proxy_connect_timeout 60s;
        proxy_send_timeout 60s;
        proxy_read_timeout 60s;
    }

    # WebSocket 代理
    location /socket.io {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_cache_bypass $http_upgrade;
        
        # WebSocket 超时设置
        proxy_connect_timeout 7d;
        proxy_send_timeout 7d;
        proxy_read_timeout 7d;
    }
}
```

#### HTTPS 配置（使用 Let's Encrypt）

```bash
# 安装 certbot
sudo apt install certbot python3-certbot-nginx

# 获取证书并自动配置
sudo certbot --nginx -d your-domain.com

# 证书会自动续期
```

HTTPS 配置示例：

```nginx
server {
    listen 443 ssl http2;
    server_name your-domain.com;

    ssl_certificate /etc/letsencrypt/live/your-domain.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/your-domain.com/privkey.pem;
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers HIGH:!aNULL:!MD5;

    # ... 其他配置同上 ...
}

# HTTP 重定向到 HTTPS
server {
    listen 80;
    server_name your-domain.com;
    return 301 https://$server_name$request_uri;
}
```

#### 启用配置

```bash
# 创建符号链接
sudo ln -s /etc/nginx/sites-available/sipp-web-manager /etc/nginx/sites-enabled/

# 测试配置
sudo nginx -t

# 重载配置
sudo systemctl reload nginx

# 或重启
sudo systemctl restart nginx
```

### 8. 日志管理

#### 日志文件位置

**任务日志文件：**
- `logs/{taskId}_screen.log` - SIPp 屏幕输出日志
- `logs/{taskId}_stats.csv` - 统计数据 CSV
- `logs/{taskId}_messages.log` - SIP 消息日志（需启用追踪）
- `logs/{taskId}_errors.log` - 错误日志（需启用追踪）
- `logs/{taskId}_calldebug.log` - 呼叫调试日志（需启用追踪）
- `logs/{taskId}_shortmsg.log` - 短消息日志（需启用追踪）
- `logs/{taskId}_logs.log` - 其他日志（需启用追踪）

**应用日志文件：**
- `backend/logs/app.log` - 后端应用日志（所有级别）
- `backend/logs/error.log` - 后端错误日志（仅错误）

#### Web 界面下载日志（推荐）

**下载任务日志：**
1. 进入"任务历史"页面
2. 在"已完成"标签页中找到目标任务
3. 点击任务操作列中的"日志"按钮
4. 系统会自动下载该任务的所有日志文件（打包为 ZIP）

**下载系统日志：**
1. 在任务历史页面顶部
2. 点击"系统日志"下拉按钮
3. 选择要下载的日志类型：
   - 应用日志（app.log）
   - 错误日志（error.log）
   - 所有日志（两者都包含）
4. 系统会自动下载打包的 ZIP 文件

#### 使用 service.sh 查看日志

```bash
# 查看最近日志（自动检测 PM2 或 nohup）
./service.sh logs
```

#### 手动查看日志

**应用日志：**
```bash
# 实时查看应用日志
tail -f backend/logs/app.log

# 查看最近 100 行
tail -100 backend/logs/app.log

# 查看错误日志
tail -f backend/logs/error.log

# 搜索特定内容
grep "error" backend/logs/app.log
grep "SIPp" backend/logs/app.log | tail -50
```

**任务日志：**
```bash
# 查看特定任务的屏幕日志
tail -f logs/task_1234567890_screen.log

# 查看统计数据
cat logs/task_1234567890_stats.csv

# 查看所有任务日志
ls -lh logs/
```

#### PM2 日志

```bash
# 实时查看
pm2 logs sipp-backend

# 查看最近 100 行
pm2 logs sipp-backend --lines 100

# 只看错误日志
pm2 logs sipp-backend --err

# 清空日志
pm2 flush sipp-backend
```

#### 后台运行日志（nohup）

```bash
# 查看 nohup 日志
tail -f logs/backend.log

# 搜索错误
grep -i error logs/backend.log
```

#### 日志轮转（logrotate）

创建 `/etc/logrotate.d/sipp-web-manager`：

```
/path/to/sipp-web-manager/backend/logs/*.log {
    daily
    rotate 30
    compress
    delaycompress
    notifempty
    create 0640 user group
    sharedscripts
    postrotate
        pm2 reloadLogs
    endscript
}
```

测试配置：
```bash
sudo logrotate -d /etc/logrotate.d/sipp-web-manager
```

### 9. 配置模板使用

#### 创建配置模板

1. 在"场景管理"页面点击"启动测试"
2. 配置好所有参数（远程主机、端口、速率等）
3. 点击"保存为配置模板"按钮
4. 输入模板名称和描述
5. 点击保存

#### 使用配置模板

1. 在"启动测试"对话框中
2. 从"配置模板"下拉框选择已保存的模板
3. 模板配置会自动填充到表单中
4. 可以根据需要微调参数
5. 点击"启动测试"

#### 管理配置模板

1. 在"启动测试"对话框中点击"管理"按钮
2. 查看所有配置模板
3. 可以编辑、删除或设为默认模板
4. 默认模板会在每次打开"启动测试"时自动加载

#### 配置模板特点

- ✅ 只保存通用配置，不包含场景文件信息
- ✅ 支持设置默认模板（自动加载）
- ✅ 支持更新当前使用的模板
- ✅ 快速复用常用测试配置

## 启动服务

### 方式对比

| 方式 | 适用场景 | 优点 | 缺点 |
|------|---------|------|------|
| `./service.sh start` | 快速启停 | 简单易用，自动选择启动方式 | 功能相对简单 |
| PM2 | 生产环境 | 进程守护、自动重启、监控 | 需要额外安装 |
| nohup | 简单部署 | 无需额外依赖 | 缺少监控和管理功能 |
| `./start.sh` | 开发环境 | 自动启动前后端，热重载 | 仅适用于开发 |

### 快速启动

```bash
# 推荐：使用 service.sh
./service.sh start

# 或使用 PM2（如果已安装）
cd backend
pm2 start dist/index.js --name sipp-backend

# 或手动启动
cd backend
node dist/index.js
```

### 验证服务

```bash
# 检查服务状态
./service.sh status

# 或手动检查
curl http://localhost:3000/health
lsof -i :3000
```

## 目录结构

```
sipp-web-manager/
├── backend/                    # 后端服务
│   ├── src/                    # 源代码
│   │   ├── config/             # 配置管理
│   │   ├── controllers/        # 控制器
│   │   ├── services/           # 业务逻辑
│   │   ├── database/           # 数据库操作
│   │   ├── websocket/          # WebSocket 服务
│   │   └── index.ts            # 入口文件
│   ├── database/               # 数据库脚本
│   │   ├── init-db.sh          # 数据库初始化
│   │   ├── check-db.sh         # 数据库检查
│   │   └── schema.mysql.sql    # MySQL 表结构
│   ├── dist/                   # 编译输出
│   ├── logs/                   # 应用日志
│   ├── .env                    # 环境配置（需手动创建）
│   ├── tsconfig.json           # TypeScript 配置
│   └── package.json
├── frontend/                   # 前端应用
│   ├── src/                    # 源代码
│   │   ├── components/         # React 组件
│   │   ├── pages/              # 页面组件
│   │   ├── services/           # API 和 WebSocket 服务
│   │   └── App.tsx             # 应用入口
│   ├── dist/                   # 构建输出
│   ├── .env                    # 环境配置（可选）
│   └── package.json
├── scenarios/                  # SIPp 场景文件目录
├── injections/                 # CSV 注入文件目录
├── logs/                       # 运行日志目录
│   ├── backend.log             # 后台运行日志（nohup）
│   └── backend.pid             # 进程 PID 文件
├── deploy.sh                   # 生产部署脚本
├── service.sh                  # 服务管理脚本
├── start.sh                    # 开发环境启动脚本
└── README.md                   # 本文档
```

## 功能特性

### 核心功能

- 🎯 **场景管理**：创建、编辑、删除 SIPp XML 场景文件，支持语法高亮
- 📊 **注入文件管理**：管理 CSV 格式的数据注入文件，支持在线编辑
- ▶️ **测试执行**：启动、停止、暂停/恢复 SIPp 测试任务
- 📈 **实时监控**：WebSocket 实时推送测试统计数据和进度
- 📝 **任务历史**：记录所有测试任务的历史，包含详细统计
- 💾 **配置模板**：保存和管理测试配置模板，快速复用常用配置
- 📥 **日志下载**：一键下载任务日志和应用日志（ZIP 打包）
- 🔄 **进程恢复**：服务重启后自动恢复对运行中 SIPp 进程的控制
- 🌐 **多语言**：支持中文/英文界面切换

### 技术亮点

- ✅ **强制验证**：部署时强制检查数据库连接和表结构
- ✅ **智能部署**：支持本地和容器化数据库，自动识别
- ✅ **进程管理**：支持 PM2 专业进程管理和简单后台运行
- ✅ **实时通信**：WebSocket 替代轮询，减少服务器负载
- ✅ **孤儿进程控制**：通过 UDP 控制端口恢复孤儿 SIPp 进程
- ✅ **日志管理**：支持任务日志和应用日志的在线下载
- ✅ **配置复用**：配置模板系统，避免重复配置
- ✅ **TypeScript**：全栈 TypeScript，类型安全
- ✅ **现代化 UI**：React 18 + Ant Design 5，响应式设计

### 最新更新 (v1.1.0)

#### 🆕 新功能
- **日志下载功能**：
  - 支持下载任务相关的所有日志文件（自动打包为 ZIP）
  - 支持下载单个日志文件（screen.log、stats.csv、messages.log 等）
  - 支持下载应用日志（app.log、error.log）
  - 在任务历史页面添加"日志"下载按钮
  - 在页面顶部添加"系统日志"下载入口

- **配置模板优化**：
  - 修复了使用模板时场景文件信息丢失的问题
  - 模板现在正确地只保存通用配置，不包含场景文件信息
  - 改善了模板应用和编辑的用户体验

#### 🔧 改进
- **数据库初始化**：移除了示例场景和注入文件，适合全新部署
- **路由优化**：修复了日志下载 API 的路由匹配顺序问题
- **代码质量**：优化了前后端代码结构，提升了可维护性

## 常见问题

### 1. 数据库连接失败

#### 问题表现
```
Error: Database connection failed
Error: Database schema does not exist
```

#### 本地 MySQL 部署

**检查 MySQL 服务：**
```bash
# Ubuntu/Debian
sudo systemctl status mysql
sudo systemctl start mysql

# CentOS/RHEL
sudo systemctl status mariadb
sudo systemctl start mariadb

# 验证连接
mysql -u root -p -e "SELECT 1"
```

**初始化数据库：**
```bash
cd backend/database

# 设置环境变量
export DB_HOST=localhost
export DB_PORT=3306
export DB_USER=root
export DB_PASSWORD=your_password
export DB_NAME=sipp_manager

# 执行初始化
./init-db.sh

# 检查表结构
./check-db.sh
```

#### Docker 容器部署

**启动 MySQL 容器：**
```bash
# 启动容器
docker run -d \
  --name mysql-container \
  -e MYSQL_ROOT_PASSWORD=your_password \
  -e MYSQL_DATABASE=sipp_manager \
  -p 3306:3306 \
  mysql:8.0

# 等待容器启动
sleep 10

# 验证容器状态
docker ps | grep mysql-container
```

**初始化数据库：**
```bash
cd backend/database

# 设置容器名称
export DB_CONTAINER=mysql-container
export DB_USER=root
export DB_PASSWORD=your_password

# 执行初始化
./init-db.sh
```

**配置 backend/.env：**
```bash
DB_HOST=localhost
DB_PORT=3306
DB_NAME=sipp_manager
DB_USER=root
DB_PASSWORD=your_password
DB_CONTAINER=mysql-container  # 重要：指定容器名称
```

### 2. SIPp 未找到

#### 问题表现
```
Error: SIPp executable not found
spawn sipp ENOENT
```

#### 解决方案

**检查 SIPp 安装：**
```bash
which sipp
sipp -v
```

**安装 SIPp：**
```bash
# Ubuntu/Debian
sudo apt install sipp

# 从源码编译
git clone https://github.com/SIPp/sipp.git
cd sipp
./build.sh
sudo cp sipp /usr/local/bin/
```

**指定完整路径：**
在 `backend/.env` 中：
```bash
SIPP_PATH=/usr/local/bin/sipp
```

### 3. 端口被占用

#### 问题表现
```
Error: listen EADDRINUSE: address already in use :::3000
```

#### 解决方案

**查找占用进程：**
```bash
lsof -i :3000
netstat -tulpn | grep :3000
```

**停止占用进程：**
```bash
# 停止指定 PID
kill <PID>

# 或强制停止
kill -9 <PID>

# 停止所有占用端口 3000 的进程
kill $(lsof -ti :3000)
```

**修改端口：**
在 `backend/.env` 中：
```bash
PORT=3001
```

### 4. WebSocket 连接失败

#### 问题表现
```
WebSocket connection failed
ECONNREFUSED 127.0.0.1:3000
```

#### 解决方案

**检查后端服务：**
```bash
# 查看服务状态
./service.sh status

# 检查端口
lsof -i :3000

# 查看日志
tail -f backend/logs/app.log
```

**检查防火墙：**
```bash
# Ubuntu/Debian
sudo ufw status
sudo ufw allow 3000/tcp

# CentOS/RHEL
sudo firewall-cmd --list-ports
sudo firewall-cmd --add-port=3000/tcp --permanent
sudo firewall-cmd --reload
```

**检查前端配置：**
确保 `frontend/.env` 中：
```bash
VITE_WS_PORT=3000
```

### 5. 权限问题

#### 问题表现
```
EACCES: permission denied, mkdir 'scenarios'
EACCES: permission denied, open 'logs/app.log'
```

#### 解决方案

```bash
# 赋予目录写入权限
chmod -R 755 scenarios injections logs

# 或使用当前用户所有权
sudo chown -R $USER:$USER scenarios injections logs

# 检查目录权限
ls -la | grep -E "scenarios|injections|logs"
```

### 6. 编译错误

#### 问题表现
```
TSError: ⨯ Unable to compile TypeScript
```

#### 解决方案

```bash
# 清理并重新构建
cd backend
rm -rf dist node_modules
npm install
npm run build

# 检查 TypeScript 版本
npx tsc --version
```

### 7. PM2 进程异常

#### 问题表现
```
PM2 process disappeared
Process 0 not found
```

#### 解决方案

```bash
# 删除并重新启动
pm2 delete sipp-backend
pm2 start backend/dist/index.js --name sipp-backend

# 或重置 PM2
pm2 kill
pm2 start backend/dist/index.js --name sipp-backend

# 保存进程列表
pm2 save
```

### 8. 部署脚本失败

#### 问题表现
```
Database check failed
Node.js version check failed
```

#### 解决方案

**检查 Node.js 版本：**
```bash
node -v  # 需要 >= 18.x
npm -v   # 需要 >= 9.x

# 升级 Node.js（使用 nvm）
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.0/install.sh | bash
nvm install 18
nvm use 18
```

**手动执行各步骤：**
```bash
# 1. 检查数据库
cd backend/database && ./check-db.sh

# 2. 构建后端
cd backend && npm install && npm run build

# 3. 构建前端
cd frontend && npm install && npm run build

# 4. 启动服务
./service.sh start
```

## 技术栈

### 前端
- **框架**: React 18
- **语言**: TypeScript
- **UI 库**: Ant Design 5
- **构建工具**: Vite
- **实时通信**: Socket.IO Client
- **HTTP 客户端**: Axios
- **代码编辑器**: Monaco Editor (用于场景文件编辑)

### 后端
- **运行时**: Node.js 18+
- **框架**: Express.js
- **语言**: TypeScript
- **数据库**: MySQL 5.7+ / MariaDB 10.3+
- **实时通信**: Socket.IO
- **进程管理**: child_process + UDP 控制
- **日志**: Winston

### 测试工具
- **SIP 测试**: SIPp

### 部署和运维
- **进程管理**: PM2（推荐）/ nohup
- **反向代理**: Nginx
- **容器化**: Docker（数据库）
- **自动化脚本**: Bash

## 性能优化

### 后端优化
- ✅ 数据库连接池（默认 10 个连接）
- ✅ WebSocket 推送替代轮询
- ✅ SIPp 进程 UDP 控制（低延迟）
- ✅ 定期清理过期日志

### 前端优化
- ✅ Vite 构建优化
- ✅ 代码分割和懒加载
- ✅ WebSocket 事件订阅机制
- ✅ Ant Design 按需加载

## 安全建议

1. **修改默认密码**：更改 MySQL root 密码
2. **限制数据库访问**：只允许本地连接或白名单 IP
3. **使用 HTTPS**：生产环境配置 SSL 证书
4. **防火墙配置**：只开放必要端口（80、443、3000）
5. **定期更新**：及时更新依赖包和 Node.js 版本
6. **日志监控**：定期检查错误日志
7. **备份数据库**：定期备份 MySQL 数据

## 维护和监控

### 日常维护

```bash
# 查看服务状态
./service.sh status

# 查看最新日志
./service.sh logs

# 重启服务
./service.sh restart

# 检查磁盘空间
df -h

# 清理旧日志
find logs -name "*.log" -mtime +30 -delete
```

### 数据库维护

```bash
# 备份数据库
mysqldump -u root -p sipp_manager > backup_$(date +%Y%m%d).sql

# 或使用容器
docker exec mysql-container mysqldump -u root -p sipp_manager > backup.sql

# 恢复数据库
mysql -u root -p sipp_manager < backup.sql

# 优化数据库
mysql -u root -p -e "OPTIMIZE TABLE sipp_manager.tasks, sipp_manager.scenarios;"
```

### 监控指标

**关键指标：**
- 服务响应时间
- WebSocket 连接数
- SIPp 进程数量
- 数据库连接池使用率
- 磁盘使用率
- 内存使用率

**监控命令：**
```bash
# 系统资源
htop
free -h
df -h

# 服务状态
./service.sh status

# PM2 监控
pm2 monit

# 数据库连接
mysql -u root -p -e "SHOW PROCESSLIST;"
```

## 贡献

欢迎提交 Issue 和 Pull Request！

## 许可证

[根据项目实际情况填写]

## 联系方式

[根据项目实际情况填写]
