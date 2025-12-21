# SIPp Web Manager 快速开始

## 📦 前置条件

### 如果没有安装 MySQL

运行数据库快速搭建脚本：

```bash
./setup-mysql.sh

# 推荐选择 Docker 容器部署（选项 1）
# - 5 分钟快速部署
# - 无需复杂配置
# - 数据自动持久化
# - 脚本会自动初始化数据库
```

## 📦 一键部署（推荐）

```bash
# 1. 初始化数据库
cd backend/database
export DB_USER=root DB_PASSWORD=your_password
./init-db.sh
cd ../..

# 2. 执行部署
./deploy.sh

# 3. 访问应用
# 前端: 使用 Nginx 提供 frontend/dist
# 后端 API: http://localhost:3000/api
```

## 🚀 常用命令

### 服务管理
```bash
./service.sh start    # 启动服务
./service.sh stop     # 停止服务
./service.sh restart  # 重启服务
./service.sh status   # 查看状态
./service.sh logs     # 查看日志
```

### PM2 管理（如果使用）
```bash
pm2 list              # 列出所有进程
pm2 logs sipp-backend # 查看日志
pm2 restart sipp-backend  # 重启
pm2 stop sipp-backend     # 停止
```

### 数据库操作
```bash
cd backend/database
./init-db.sh          # 初始化数据库
./check-db.sh         # 检查数据库状态
```

## 🔧 配置要点

### backend/.env（必须手动创建）
```bash
PORT=3000
NODE_ENV=production

DB_HOST=localhost
DB_PORT=3306
DB_NAME=sipp_manager
DB_USER=root
DB_PASSWORD=your_password

# 如果使用 Docker 容器部署 MySQL
DB_CONTAINER=mysql-container

SIPP_PATH=sipp
```

### 容器化数据库配置
```bash
# 启动 MySQL 容器
docker run -d --name mysql-container \
  -e MYSQL_ROOT_PASSWORD=your_password \
  -e MYSQL_DATABASE=sipp_manager \
  -p 3306:3306 mysql:8.0

# 在 .env 中添加
DB_CONTAINER=mysql-container
```

## 🔍 故障排查

### 检查服务状态
```bash
./service.sh status   # 综合状态检查
lsof -i :3000         # 检查端口
ps aux | grep node    # 检查进程
curl localhost:3000/health  # 健康检查
```

### 查看日志
```bash
./service.sh logs                # 使用脚本
tail -f backend/logs/app.log     # 应用日志
tail -f backend/logs/error.log   # 错误日志
pm2 logs sipp-backend            # PM2 日志
```

### 常见问题

**1. 数据库连接失败**
```bash
# 检查 MySQL
systemctl status mysql
# 检查配置
cat backend/.env | grep DB_
# 重新初始化
cd backend/database && ./init-db.sh
```

**2. 端口被占用**
```bash
# 查找占用进程
lsof -i :3000
# 停止进程
kill $(lsof -ti :3000)
```

**3. 服务未启动**
```bash
# 查看详细日志
tail -50 backend/logs/app.log
# 重新启动
./service.sh restart
```

## 📁 关键文件

| 文件 | 说明 |
|------|------|
| `deploy.sh` | 自动化部署脚本 |
| `service.sh` | 服务管理脚本 |
| `start.sh` | 开发环境启动 |
| `backend/.env` | 后端配置（需手动创建）|
| `backend/database/init-db.sh` | 数据库初始化 |
| `backend/logs/app.log` | 应用日志 |

## 🌐 访问地址

- **后端 API**: http://localhost:3000/api
- **健康检查**: http://localhost:3000/health
- **WebSocket**: ws://localhost:3000/socket.io
- **前端**: 需要通过 Nginx 提供 frontend/dist 静态文件

## 📚 更多信息

详细文档请参考：[README.md](README.md)

