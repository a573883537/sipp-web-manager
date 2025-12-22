# SIPp Web Manager - 服务管理快速参考

## 📋 服务管理命令

### 基本操作

```bash
./service.sh start      # 启动服务
./service.sh stop       # 停止服务
./service.sh restart    # 重启服务
./service.sh status     # 查看详细状态
./service.sh logs       # 实时查看日志（Ctrl+C 退出）
```

---

## 🎯 使用场景

### 场景 1：首次部署后启动服务

```bash
# 部署完成后
./deploy.sh master

# 启动服务
./service.sh start

# 验证服务状态
./service.sh status
```

### 场景 2：修改代码后重启服务

```bash
# 编译后端
cd backend && npm run build

# 重启服务
cd .. && ./service.sh restart

# 检查日志
./service.sh logs
```

### 场景 3：排查服务问题

```bash
# 查看服务状态
./service.sh status

# 查看实时日志
./service.sh logs

# 重启服务
./service.sh restart
```

### 场景 4：停止服务（维护）

```bash
# 优雅停止服务
./service.sh stop

# 验证服务已停止
./service.sh status
```

---

## 🔍 状态信息解读

### PM2 管理模式（推荐）

服务脚本检测到 PM2 时自动使用，提供：
- ✅ 自动重启（崩溃恢复）
- ✅ 日志轮转
- ✅ 集群模式支持
- ✅ 监控面板

```bash
# 查看 PM2 监控
pm2 monit

# 查看所有 PM2 进程
pm2 list

# 查看特定服务日志
pm2 logs sipp-manager-master
```

### 直接运行模式

未安装 PM2 时使用 nohup 后台运行：
- 进程 PID 保存在 `backend/.service.pid`
- 日志输出到 `backend/logs/app.log`
- 需要手动监控进程状态

---

## 🛠️ 进程管理

### 使用 PM2（生产环境推荐）

```bash
# 安装 PM2
npm install -g pm2

# 启动服务（自动使用 PM2）
./service.sh start

# PM2 管理命令
pm2 list                           # 查看所有进程
pm2 logs sipp-manager-master       # 查看日志
pm2 restart sipp-manager-master    # 重启服务
pm2 stop sipp-manager-master       # 停止服务
pm2 delete sipp-manager-master     # 删除服务

# 开机自启
pm2 startup                        # 生成启动脚本
pm2 save                           # 保存进程列表
```

### 不使用 PM2

```bash
# 启动服务
./service.sh start

# 查看进程
ps aux | grep node

# 查看日志
tail -f backend/logs/app.log

# 停止服务
./service.sh stop
```

---

## 📊 日志管理

### 查看实时日志

```bash
# 使用服务脚本
./service.sh logs

# 或直接查看日志文件
tail -f backend/logs/app.log
```

### 日志文件位置

```
backend/logs/
├── app.log          # 应用日志（info 级别）
├── error.log        # 错误日志
├── pm2.log          # PM2 输出日志（如果使用 PM2）
└── pm2-error.log    # PM2 错误日志（如果使用 PM2）
```

### 日志轮转（PM2 自动）

PM2 自动管理日志轮转，手动清理旧日志：

```bash
pm2 flush              # 清空所有日志
pm2 reloadLogs         # 重新加载日志
```

---

## 🚨 故障排查

### 问题 1：服务启动失败

```bash
# 查看详细错误信息
./service.sh status
cat backend/logs/app.log

# 常见原因：
# 1. 端口 3000 被占用
sudo lsof -i :3000
# 2. 数据库连接失败
mysql -h localhost -u root -p -e "SELECT 1;"
# 3. 后端未编译
cd backend && npm run build
```

### 问题 2：服务无响应

```bash
# 检查进程是否存活
./service.sh status

# 强制重启
./service.sh stop
./service.sh start

# 检查系统资源
top
df -h
```

### 问题 3：PM2 进程混乱

```bash
# 查看所有 PM2 进程
pm2 list

# 删除所有进程
pm2 delete all

# 重新启动
./service.sh start
```

---

## 🔧 高级配置

### 自定义服务名称

编辑 `service.sh`，修改第 35 行：

```bash
SERVICE_NAME="sipp-manager-custom"
```

### 自定义日志路径

编辑 `service.sh`，修改第 39 行：

```bash
LOG_FILE="$BACKEND_DIR/logs/custom.log"
```

### 开机自启（systemd）

创建 systemd 服务文件：

```bash
sudo tee /etc/systemd/system/sipp-manager.service > /dev/null <<EOF
[Unit]
Description=SIPp Web Manager
After=network.target mysql.service

[Service]
Type=forking
User=root
WorkingDirectory=/opt/sipp-web-manager
ExecStart=/opt/sipp-web-manager/service.sh start
ExecStop=/opt/sipp-web-manager/service.sh stop
Restart=on-failure
RestartSec=5s

[Install]
WantedBy=multi-user.target
EOF

# 启用开机自启
sudo systemctl daemon-reload
sudo systemctl enable sipp-manager
sudo systemctl start sipp-manager
```

---

## 📞 技术支持

- **GitHub Issues**: 报告问题和功能请求
- **日志收集**: 遇到问题时请附上 `backend/logs/` 目录内容
- **版本信息**: 运行 `./service.sh status` 获取环境信息

---

**版本**: v2.0.0
**更新日期**: 2025-01-23
