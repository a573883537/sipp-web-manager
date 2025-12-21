# 部署检查清单

使用此清单确保部署过程顺利完成。

## ✅ 部署前检查

### 系统要求
- [ ] Node.js >= 18.x (`node -v`)
- [ ] npm >= 9.x (`npm -v`)
- [ ] MySQL >= 5.7 或 MariaDB >= 10.3 (`mysql --version`) 
  - **如果未安装，运行**: `./setup-mysql.sh`
- [ ] SIPp 已安装 (`which sipp`)
- [ ] 操作系统: Linux / macOS

### 数据库安装（如果需要）
- [ ] 运行 `./setup-mysql.sh`
- [ ] 选择部署方式（Docker 推荐）
- [ ] 记录数据库连接信息（会保存到 mysql-docker-config.txt）

### 网络和端口
- [ ] 端口 3000 未被占用 (`lsof -i :3000`)
- [ ] MySQL 端口 3306 可访问（如果使用远程数据库）
- [ ] 防火墙允许必要端口

### 数据库准备
- [ ] MySQL 服务运行中 (`systemctl status mysql`)
- [ ] 数据库用户名和密码准备好
- [ ] 数据库已创建或有创建权限

## ✅ 部署步骤检查

### 1. 数据库初始化
```bash
cd backend/database
export DB_USER=root
export DB_PASSWORD=your_password
export DB_NAME=sipp_manager
# 如果使用容器：export DB_CONTAINER=mysql-container
./init-db.sh
cd ../..
```
- [ ] 数据库初始化脚本执行成功
- [ ] 所有表创建成功（7 张表）
- [ ] 可以通过 `./check-db.sh` 验证

### 2. 环境配置
```bash
# 检查 backend/.env 是否存在
ls -la backend/.env
```
- [ ] `backend/.env` 文件已创建
- [ ] 数据库连接信息正确
- [ ] SIPp 路径配置正确
- [ ] 端口配置无冲突

### 3. 执行部署
```bash
./deploy.sh
```
- [ ] Node.js 版本检查通过
- [ ] 数据库连接检查通过
- [ ] 后端依赖安装成功
- [ ] 后端构建成功（生成 `backend/dist/`）
- [ ] 前端依赖安装成功
- [ ] 前端构建成功（生成 `frontend/dist/`）
- [ ] 必要目录创建成功

### 4. 启动服务
```bash
./service.sh start
# 或在部署脚本提示时选择 y
```
- [ ] 服务启动成功
- [ ] PM2 显示服务在线（如果使用 PM2）
- [ ] 端口 3000 正在监听 (`lsof -i :3000`)

## ✅ 部署后验证

### 服务状态检查
```bash
./service.sh status
```
- [ ] 端口 3000 正在监听
- [ ] 进程正常运行
- [ ] 健康检查通过 (`curl localhost:3000/health`)

### 功能验证
```bash
# API 测试
curl http://localhost:3000/api/scenarios
curl http://localhost:3000/api/injection-files
curl http://localhost:3000/api/tasks
```
- [ ] API 响应正常（返回 JSON 数据）
- [ ] 无 500 错误
- [ ] 日志无严重错误 (`tail -50 backend/logs/app.log`)

### 前端验证
如果配置了 Nginx：
- [ ] 静态文件可访问
- [ ] API 代理正常工作
- [ ] WebSocket 连接成功
- [ ] 界面正常显示

### 数据库验证
```bash
cd backend/database
./check-db.sh
```
- [ ] 所有表存在
- [ ] 表结构正确
- [ ] 可以正常读写数据

## ✅ 生产环境额外检查

### PM2 配置
- [ ] PM2 已安装 (`pm2 -v`)
- [ ] 服务在 PM2 中运行 (`pm2 list`)
- [ ] 已配置开机自启 (`pm2 startup` + `pm2 save`)

### Nginx 配置
- [ ] Nginx 已安装并运行
- [ ] 静态文件路径配置正确
- [ ] API 代理配置正确 (`/api` → `http://localhost:3000`)
- [ ] WebSocket 代理配置正确 (`/socket.io`)
- [ ] Nginx 配置测试通过 (`nginx -t`)

### HTTPS 配置（如果需要）
- [ ] SSL 证书已获取
- [ ] HTTPS 监听配置正确
- [ ] HTTP 到 HTTPS 重定向正常
- [ ] 证书自动续期配置

### 安全检查
- [ ] 数据库密码已修改（不使用默认密码）
- [ ] 数据库只允许本地或白名单 IP 访问
- [ ] 防火墙已配置
- [ ] 敏感文件权限正确（`.env` 应为 600 或 640）
- [ ] 日志文件可以正常写入

### 监控和日志
- [ ] 可以查看应用日志 (`./service.sh logs`)
- [ ] 日志轮转配置（可选）
- [ ] 监控告警配置（可选）

### 备份
- [ ] 数据库备份脚本配置
- [ ] 定期备份任务配置（cron）

## 🔧 故障恢复测试

建议在部署完成后进行以下测试：

### 服务重启测试
```bash
./service.sh restart
sleep 5
./service.sh status
```
- [ ] 服务可以正常重启
- [ ] 重启后状态正常

### 进程恢复测试
```bash
# 启动一个测试任务（通过前端或 API）
# 重启服务
./service.sh restart
# 检查任务是否还在运行
```
- [ ] 运行中的 SIPp 任务被正确恢复
- [ ] 可以继续控制已有任务

### 数据库连接测试
```bash
# 重启 MySQL
sudo systemctl restart mysql
# 检查应用是否自动重连
./service.sh status
```
- [ ] 应用可以重新连接数据库
- [ ] 无需手动重启应用

## 📝 部署记录

**部署日期**: ___________________

**部署人员**: ___________________

**部署版本**: ___________________

**部署环境**: 
- [ ] 开发环境
- [ ] 测试环境
- [ ] 生产环境

**特殊配置**: 
```
_________________________________
_________________________________
_________________________________
```

**遇到的问题及解决方案**:
```
_________________________________
_________________________________
_________________________________
```

**验证结果**: 
- [ ] 所有检查项通过
- [ ] 部署成功

**备注**:
```
_________________________________
_________________________________
_________________________________
```

---

## 📞 紧急联系

如果部署过程中遇到问题：

1. 查看日志: `./service.sh logs`
2. 检查状态: `./service.sh status`
3. 查看常见问题: [README.md - 常见问题](README.md#常见问题)
4. 查看快速开始: [QUICKSTART.md](QUICKSTART.md)

