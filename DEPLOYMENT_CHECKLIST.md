# SIPp Web Manager - 集群部署检查清单

使用此清单确保主从集群部署顺利完成。

## 🎯 部署概览

- **主机节点（Master）**: 唯一管理节点，提供 Web UI 和任务调度
- **从机节点（Slave）**: 多个执行节点，仅提供 API 服务
- **共享数据库**: 所有节点连接到主机的 MySQL 数据库

---

## ✅ 主机节点部署清单

### 1. 部署前检查

**系统要求：**
- [ ] Node.js >= 18.x (`node -v`)
- [ ] npm >= 9.x (`npm -v`)
- [ ] MySQL >= 8.0 (`mysql --version`)
- [ ] SIPp 已安装（可选，主机也可执行测试）

**网络和端口：**
- [ ] 端口 3000 未被占用 (`lsof -i :3000`)
- [ ] MySQL 端口 3306 可被从机访问
- [ ] 防火墙已开放 3000 和 3306 端口

**数据库准备：**
- [ ] MySQL 服务运行中 (`systemctl status mysql`)
- [ ] MySQL 允许远程连接（修改 bind-address）
- [ ] 数据库用户 'sipp'@'%' 已创建并授权

### 2. 配置环境变量

- [ ] `.env` 文件已创建（从 `.env.master.example` 复制）
- [ ] `NODE_ROLE=master` 已设置
- [ ] `MACHINE_ID=master` 已设置
- [ ] 数据库连接信息正确配置
- [ ] 目录路径配置正确

### 3. 执行部署脚本

```bash
./deploy-master.sh
```

- [ ] 依赖检查通过（Node.js、npm）
- [ ] 后端依赖安装成功
- [ ] 后端构建成功（`backend/dist/` 生成）
- [ ] 前端依赖安装成功
- [ ] 前端构建成功（`frontend/dist/` 生成）
- [ ] 数据库初始化成功（表结构创建）
- [ ] systemd 服务创建成功（如果选择）

### 4. 启动服务

```bash
# 使用 systemd
sudo systemctl start sipp-web-manager
sudo systemctl status sipp-web-manager

# 或手动启动
cd backend && npm start
```

- [ ] 服务启动成功
- [ ] 端口 3000 正在监听
- [ ] 健康检查通过 (`curl localhost:3000/api/health`)

### 5. 功能验证

```bash
# API 测试
curl http://localhost:3000/api/scenarios
curl http://localhost:3000/api/machines
```

- [ ] API 响应正常
- [ ] Web UI 可访问（`http://<主机IP>:3000`）
- [ ] 日志正常（`sudo journalctl -u sipp-web-manager -f`）

---

## ✅ 从机节点部署清单

### 1. 部署前检查

**系统要求：**
- [ ] Node.js >= 18.x (`node -v`)
- [ ] npm >= 9.x (`npm -v`)
- [ ] SIPp >= 3.6 (`sipp -v`)

**网络连通性：**
- [ ] 可以 ping 通主机 IP
- [ ] 可以连接主机数据库（`mysql -h <主机IP> -u sipp -p`）
- [ ] 可以访问主机 API（`curl http://<主机IP>:3000/api/health`）

### 2. 配置环境变量

- [ ] `.env` 文件已创建（从 `.env.slave.example` 复制）
- [ ] `NODE_ROLE=slave` 已设置
- [ ] `MACHINE_ID` 设置为唯一标识（如 `slave-01`）
- [ ] `MACHINE_NAME` 设置为显示名称
- [ ] `MASTER_HOST` 设置为主机 IP 地址
- [ ] `DB_HOST` 设置为主机数据库 IP
- [ ] 数据库连接信息正确配置

### 3. 执行部署脚本

```bash
./deploy-slave.sh
```

- [ ] 依赖检查通过（Node.js、npm、SIPp）
- [ ] 数据库连接测试通过
- [ ] 主机 API 连接测试通过
- [ ] 后端依赖安装成功
- [ ] 后端构建成功（`backend/dist/` 生成）
- [ ] systemd 服务创建成功（如果选择）

### 4. 启动服务

```bash
# 使用 systemd
sudo systemctl start sipp-web-manager-slave
sudo systemctl status sipp-web-manager-slave

# 或手动启动
cd backend && npm start
```

- [ ] 服务启动成功
- [ ] 心跳日志显示正常（每 10 秒一次）
- [ ] 日志无错误（`sudo journalctl -u sipp-web-manager-slave -f`）

### 5. 功能验证

**在主机 Web UI 中检查：**
- [ ] "从机管理" 页面显示该从机
- [ ] 从机状态显示为 "在线"
- [ ] CPU、内存使用率正常显示
- [ ] SIPp 版本显示正确
- [ ] 健康检查按钮可以正常工作

---

## 🔒 安全检查清单

### 主机节点
- [ ] 数据库密码已修改（不使用默认密码）
- [ ] 数据库用户权限最小化（只授权必要的表）
- [ ] 防火墙规则配置正确：
  - [ ] 3000 端口仅允许可信 IP 访问
  - [ ] 3306 端口仅允许从机 IP 访问
- [ ] `.env` 文件权限设置为 600 或 640
- [ ] 生产环境设置 `NODE_ENV=production`

### 从机节点
- [ ] 数据库密码与主机一致
- [ ] `.env` 文件权限设置为 600 或 640
- [ ] 生产环境设置 `NODE_ENV=production`

---

## 🧪 集成测试清单

### 1. 从机注册测试
- [ ] 从机启动后 30 秒内在主机 "从机管理" 页面显示
- [ ] 从机状态为 "在线"，显示绿色标识
- [ ] 从机 IP 地址、端口、SIPp 版本显示正确

### 2. 心跳机制测试
```bash
# 在从机上停止服务
sudo systemctl stop sipp-web-manager-slave

# 等待 30 秒后检查主机 Web UI
```
- [ ] 从机状态变为 "离线"，显示灰色标识
- [ ] 最后心跳时间不再更新

### 3. 任务执行测试
- [ ] 创建一个简单的测试场景
- [ ] 启动测试时选择 "自动选择从机"
- [ ] 任务成功分配到负载最低的从机
- [ ] 实时统计数据正常显示
- [ ] 任务完成后历史记录正确保存

### 4. 文件同步测试
- [ ] 在主机上创建新场景文件
- [ ] 启动测试时选择该场景和某个从机
- [ ] 从机日志显示场景文件已同步
- [ ] 测试可以正常执行

### 5. 负载均衡测试
- [ ] 部署至少 2 台从机
- [ ] 连续启动多个测试任务，不指定从机
- [ ] 任务自动分配到不同从机（负载均衡）
- [ ] 每台从机的 "运行任务数" 正确更新

---

## 📊 监控和日志

### 主机日志
```bash
# systemd 日志
sudo journalctl -u sipp-web-manager -f

# 应用日志
tail -f /opt/sipp-web-manager/logs/app.log

# 任务日志
ls -lh /opt/sipp-web-manager/logs/
```

### 从机日志
```bash
# systemd 日志
sudo journalctl -u sipp-web-manager-slave -f

# 应用日志
tail -f /opt/sipp-web-manager/logs/app.log

# SIPp 任务日志
ls -lh /opt/sipp-web-manager/logs/
```

---

## 🔧 故障排查

### 从机无法连接主机数据库
```bash
# 测试网络连通性
ping <主机IP>
telnet <主机IP> 3306

# 测试数据库连接
mysql -h <主机IP> -P 3306 -u sipp -p

# 检查主机 MySQL 配置
# 主机上执行：
sudo cat /etc/mysql/mysql.conf.d/mysqld.cnf | grep bind-address
# 应该是: bind-address = 0.0.0.0

# 检查防火墙
sudo ufw status
```

### 从机状态显示离线
```bash
# 从机上检查服务状态
sudo systemctl status sipp-web-manager-slave

# 检查心跳日志
sudo journalctl -u sipp-web-manager-slave | grep -i heartbeat

# 测试主机 API 连接
curl http://<主机IP>:3000/api/health

# 检查环境变量配置
cat /opt/sipp-web-manager/.env | grep MASTER_HOST
```

### 场景文件未找到
- [ ] 检查主机 `scenarios/` 目录下是否有对应文件
- [ ] 检查从机日志，查看文件同步是否成功
- [ ] 重新启动测试，文件会自动重新推送

---

## 📝 部署记录

**部署日期**: ___________________

**部署人员**: ___________________

**节点信息**:
- 主机 IP: ___________________
- 从机数量: ___________________
- 从机列表:
  1. ___________________
  2. ___________________
  3. ___________________

**验证结果**:
- [ ] 所有检查项通过
- [ ] 主机部署成功
- [ ] 从机部署成功
- [ ] 集成测试通过

**备注**:
```
_________________________________
_________________________________
_________________________________
```

---

## 📚 参考文档

- **[集群部署指南](CLUSTER_DEPLOYMENT.md)** - 完整的主从集群部署文档
- **[MySQL 快速搭建](docs/MYSQL_SETUP_GUIDE.md)** - 数据库快速安装
- **[README](README.md)** - 项目概述和架构说明
