# SIPp Web Manager 部署指南

## 系统要求

- Node.js >= 18.x
- npm >= 9.x
- MySQL >= 5.7 或 MariaDB >= 10.3
- SIPp (需要预先安装)
- 操作系统: Linux / macOS

## 快速部署

### 方式一：直接部署（推荐）

```bash
# 1. 克隆或下载项目
cd /path/to/sipp-web-manager

# 2. 初始化数据库（MySQL）
cd backend/database
# 配置数据库连接（可选，默认为 root@localhost:3306）
export DB_HOST=localhost
export DB_PORT=3306
export DB_USER=root
export DB_PASSWORD=your_password
export DB_NAME=sipp_manager
# 执行初始化脚本
./init-db.sh
cd ../..

# 3. 安装后端依赖
cd backend
npm install
npm run build

# 4. 安装前端依赖并构建
cd ../frontend
npm install
npm run build

# 5. 配置环境变量
cd ..
# 创建 backend/.env 文件并配置数据库连接
cat > backend/.env << 'EOF'
# Server
PORT=3000
NODE_ENV=production

# Database (MySQL)
DB_HOST=localhost
DB_PORT=3306
DB_NAME=sipp_manager
DB_USER=root
DB_PASSWORD=your_password_here
DB_POOL_SIZE=10

# SIPp
SIPP_PATH=sipp
SIPP_HOST=localhost
SIPP_CONTROL_PORT=8888
SIPP_SCENARIO_DIR=../scenarios
SIPP_INJECTION_DIR=../injections
SIPP_LOG_DIR=../logs

# WebSocket
WS_CORS_ORIGIN=*

# Logging
LOG_LEVEL=info
LOG_FILE=./logs/app.log
EOF

# 编辑 backend/.env 配置文件，设置正确的数据库密码
```

### 方式二：使用启动脚本

```bash
# 开发模式启动
./start.sh
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

### 1. 使用 PM2 管理后端进程

```bash
# 安装 PM2
npm install -g pm2

# 启动后端服务
cd backend
pm2 start dist/index.js --name sipp-backend

# 设置开机自启
pm2 startup
pm2 save
```

### 2. 使用 Nginx 反向代理

```nginx
server {
    listen 80;
    server_name your-domain.com;

    # 前端静态文件
    location / {
        root /path/to/sipp-web-manager/frontend/dist;
        try_files $uri $uri/ /index.html;
    }

    # API 代理
    location /api {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
    }

    # WebSocket 代理
    location /socket.io {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
    }
}
```

### 3. 启动服务

```bash
# 启动后端
cd backend
npm run start

# 或使用 PM2
pm2 start dist/index.js --name sipp-backend
```

## 目录结构

```
sipp-web-manager/
├── backend/              # 后端服务
│   ├── src/              # 源代码
│   ├── dist/             # 编译输出
│   ├── .env              # 环境配置
│   └── package.json
├── frontend/             # 前端应用
│   ├── src/              # 源代码
│   ├── dist/             # 构建输出
│   ├── .env              # 环境配置
│   └── package.json
├── scenarios/            # SIPp 场景文件
├── injections/           # CSV 注入文件
├── logs/                 # 运行日志
└── data/                 # 数据库文件
```

## 功能特性

- **场景管理**: 创建、编辑、删除 SIPp XML 场景文件
- **注入文件**: 管理 CSV 格式的数据注入文件
- **测试执行**: 启动、停止、暂停 SIPp 测试
- **实时监控**: 查看测试统计数据和进度
- **任务历史**: 记录所有测试任务的历史
- **多语言**: 支持中文/英文界面切换

## 常见问题

### 1. 数据库连接失败

确保 MySQL 服务正在运行：
```bash
# Ubuntu/Debian
sudo systemctl status mysql
sudo systemctl start mysql

# CentOS/RHEL
sudo systemctl status mariadb
sudo systemctl start mariadb
```

检查数据库配置并初始化：
```bash
cd backend/database
export DB_HOST=localhost
export DB_USER=root
export DB_PASSWORD=your_password
./init-db.sh
```

### 2. SIPp 未找到

确保 SIPp 已安装并在 PATH 中：
```bash
which sipp
# 或指定完整路径
SIPP_PATH=/usr/local/bin/sipp
```

### 3. 端口被占用

修改 backend/.env 中的 PORT 配置：
```bash
PORT=3001
```

### 4. WebSocket 连接失败

检查防火墙设置，确保 WebSocket 端口可访问。

### 5. 权限问题

确保 scenarios、injections、logs 目录有写入权限：
```bash
chmod -R 755 scenarios injections logs data
```

## 技术栈

- **前端**: React 18 + TypeScript + Ant Design + Vite
- **后端**: Node.js + Express + TypeScript + Socket.IO
- **数据库**: SQLite (better-sqlite3)
- **测试工具**: SIPp
