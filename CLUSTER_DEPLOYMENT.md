# SIPp Web Manager - 集群部署指南

## 架构概述

SIPp Web Manager 支持主从集群架构，可以管理多台从机进行分布式 SIPp 测试。

### 架构特点

- **主机（Master）**: 唯一管理节点，提供 Web UI 和任务调度
- **从机（Slave）**: 多个执行节点，仅提供 API 服务，无 UI
- **共享数据库**: 所有节点连接到主机的 MySQL 数据库（用于任务历史）
- **API心跳机制**: 从机每 10 秒通过HTTP API向主机报告状态
- **负载均衡**: 自动选择负载最低的从机执行任务

### 数据流设计

**心跳与注册** (API驱动):
- 从机 → HTTP API → 主机 → 写入 `machines` 表
- 好处：降低数据库负载，便于后续扩展为消息队列

**任务历史** (数据库驱动):
- 从机 → 直接写入 `task_history` 表
- 主机 → 查询所有节点的任务历史
- 好处：简单可靠，便于数据一致性

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

---

## 环境要求

### 主机节点
- **操作系统**: Linux (Ubuntu 20.04+ / CentOS 8+ 推荐)
- **Node.js**: 18.x 或更高版本
- **MySQL**: 8.0+
- **SIPp**: 3.6+ (可选，主机也可执行测试)
- **磁盘空间**: 至少 10GB
- **内存**: 至少 2GB

### 从机节点
- **操作系统**: Linux
- **Node.js**: 18.x 或更高版本
- **SIPp**: 3.6+ (必需)
- **磁盘空间**: 至少 5GB
- **内存**: 至少 1GB

### 网络要求
- 从机必须能访问主机的以下端口：
  - `3000`: 主机 HTTP API 端口
  - `3306`: 主机 MySQL 端口
- 主机必须能访问从机的以下端口：
  - `3000`: 从机 HTTP API 端口（用于任务转发）

---

## 部署步骤

### 1. 主机部署

#### 1.1 安装依赖

```bash
# Ubuntu/Debian
sudo apt update
sudo apt install -y nodejs npm mysql-server sipp

# CentOS/RHEL
sudo yum install -y nodejs npm mysql-server
# SIPp 需要手动编译安装
```

#### 1.2 配置 MySQL

```bash
# 启动 MySQL
sudo systemctl start mysql
sudo systemctl enable mysql

# 创建数据库用户（允许远程连接）
sudo mysql -e "CREATE USER 'sipp'@'%' IDENTIFIED BY 'sipp123456';"
sudo mysql -e "GRANT ALL PRIVILEGES ON sipp_manager.* TO 'sipp'@'%';"
sudo mysql -e "FLUSH PRIVILEGES;"

# 配置 MySQL 允许远程连接
sudo sed -i 's/bind-address.*/bind-address = 0.0.0.0/' /etc/mysql/mysql.conf.d/mysqld.cnf
sudo systemctl restart mysql
```

#### 1.3 配置防火墙

```bash
# Ubuntu (ufw)
sudo ufw allow 3000/tcp   # HTTP API
sudo ufw allow 3306/tcp   # MySQL

# CentOS (firewalld)
sudo firewall-cmd --permanent --add-port=3000/tcp
sudo firewall-cmd --permanent --add-port=3306/tcp
sudo firewall-cmd --reload
```

#### 1.4 下载代码并部署

```bash
# 克隆仓库
cd /opt
git clone <repository-url> sipp-web-manager
cd sipp-web-manager

# 运行部署脚本
./deploy-master.sh

# 根据提示：
# 1. 首次运行会生成 .env 文件，需要编辑后重新运行
# 2. 配置数据库密码等信息
# 3. 选择是否创建 systemd 服务
```

#### 1.5 启动服务

```bash
# 如果使用 systemd
sudo systemctl start sipp-web-manager
sudo systemctl status sipp-web-manager

# 或手动启动
cd /opt/sipp-web-manager/backend
npm start
```

#### 1.6 验证部署

```bash
# 访问 Web UI
curl http://localhost:3000/health

# 或在浏览器打开
# http://<主机IP>:3000
```

---

### 2. 从机部署

#### 2.1 安装依赖

```bash
# Ubuntu/Debian
sudo apt update
sudo apt install -y nodejs npm sipp mysql-client

# CentOS/RHEL
sudo yum install -y nodejs npm mysql
```

#### 2.2 下载代码并部署

```bash
# 克隆仓库
cd /opt
git clone <repository-url> sipp-web-manager
cd sipp-web-manager

# 运行部署脚本
./deploy-slave.sh

# 根据提示：
# 1. 首次运行会生成 .env 文件
# 2. 编辑 .env 配置以下关键信息：
#    - MACHINE_ID: slave-01 (每台从机唯一)
#    - MACHINE_NAME: 测试节点01 (显示名称)
#    - MASTER_HOST: 192.168.1.100 (主机 IP)
#    - DB_HOST: 192.168.1.100 (主机数据库 IP)
#    - DB_PASSWORD: sipp123456 (数据库密码)
# 3. 重新运行脚本完成部署
```

#### 2.3 启动服务

```bash
# 如果使用 systemd
sudo systemctl start sipp-web-manager-slave
sudo systemctl status sipp-web-manager-slave

# 或手动启动
cd /opt/sipp-web-manager/backend
npm start
```

#### 2.4 验证注册

```bash
# 从机启动后会自动注册到主机
# 在主机 Web UI 查看从机列表
# http://<主机IP>:3000/machines

# 或通过 API 查询
curl http://<主机IP>:3000/api/machines
```

---

## 配置详解

### 主机配置（.env）

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

# SIPp 配置
SIPP_HOST=localhost
SIPP_CONTROL_PORT=8888
```

### 从机配置（.env）

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

# 心跳间隔（毫秒）
HEARTBEAT_INTERVAL=10000
```

---

## 使用指南

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

### 健康检查

在从机管理页面，点击 "检查" 按钮可以立即测试从机连通性。

---

## 故障排查

### 从机无法连接主机数据库

**现象**: 从机启动失败，日志显示数据库连接错误

**原因**:
1. 主机 MySQL 未允许远程连接
2. 防火墙阻止 3306 端口
3. 数据库用户权限不足

**解决方案**:
```bash
# 主机上执行
# 1. 检查 MySQL 配置
sudo grep bind-address /etc/mysql/mysql.conf.d/mysqld.cnf
# 应该是: bind-address = 0.0.0.0

# 2. 检查用户权限
sudo mysql -e "SELECT host, user FROM mysql.user WHERE user='sipp';"
# 应该有 '%' 或从机 IP

# 3. 检查防火墙
sudo netstat -tlnp | grep 3306
sudo ufw status | grep 3306

# 4. 测试连接（从从机执行）
mysql -h<主机IP> -usipp -psipp123456 -e "SELECT 1"
```

### 从机状态显示离线

**现象**: 从机启动正常，但主机管理页面显示离线

**原因**:
1. 心跳服务未启动
2. 数据库写入失败
3. `machines` 表未创建

**解决方案**:
```bash
# 从机上检查日志
sudo journalctl -u sipp-web-manager-slave -f

# 主机上检查数据库
mysql -usipp -psipp123456 sipp_manager
SELECT * FROM machines;

# 手动触发注册（从机上执行）
# 重启从机服务会自动重新注册
sudo systemctl restart sipp-web-manager-slave
```

### 任务无法转发到从机

**现象**: 启动测试时选择从机，但任务未执行

**原因**:
1. 主机无法访问从机 API
2. 从机防火墙阻止 3000 端口
3. 场景文件未同步

**解决方案**:
```bash
# 主机上测试从机 API（从主机执行）
curl http://<从机IP>:3000/api/health

# 从机上开放端口
sudo ufw allow 3000/tcp

# 场景文件同步（需手动）
# 方法1: 使用共享存储（NFS/CIFS）
# 方法2: 使用 rsync 同步
rsync -avz /opt/sipp-web-manager/scenarios/ <从机IP>:/opt/sipp-web-manager/scenarios/
```

---

## 性能调优

### 数据库连接池

主机建议连接池大小: 10
从机建议连接池大小: 5

```bash
# .env
DB_POOL_SIZE=10  # 主机
DB_POOL_SIZE=5   # 从机
```

### 心跳间隔

默认 10 秒，可根据需要调整：
- 更短间隔：实时性更好，但数据库写入频繁
- 更长间隔：减少数据库负载，但状态延迟更高

```bash
# 从机 .env
HEARTBEAT_INTERVAL=10000  # 毫秒
```

### 并发任务数

每台从机建议不超过 5 个并发测试任务，具体根据：
- 服务器配置（CPU/内存）
- 测试强度（呼叫速率）
- SIPp 资源消耗

---

## 安全建议

### 数据库安全

1. **修改默认密码**
   ```bash
   # 不要使用 sipp123456
   DB_PASSWORD=<strong-password>
   ```

2. **限制访问 IP**
   ```sql
   -- 仅允许特定从机访问
   CREATE USER 'sipp'@'192.168.1.%' IDENTIFIED BY 'password';
   ```

3. **使用 SSL 连接**
   ```bash
   # MySQL 配置
   require_secure_transport = ON
   ```

### 网络安全

1. **使用内网 IP**
   - 不要将服务暴露到公网

2. **配置防火墙规则**
   ```bash
   # 仅允许从机 IP 访问主机
   sudo ufw allow from 192.168.1.0/24 to any port 3306
   sudo ufw allow from 192.168.1.0/24 to any port 3000
   ```

3. **启用 HTTPS**（生产环境推荐）
   ```bash
   # 使用 Nginx 反向代理
   # 配置 SSL 证书
   ```

---

## 监控与维护

### 日志查看

```bash
# 主机日志
sudo journalctl -u sipp-web-manager -f

# 从机日志
sudo journalctl -u sipp-web-manager-slave -f

# 应用日志
tail -f /opt/sipp-web-manager/logs/app.log
```

### 数据库维护

```bash
# 定期清理旧任务记录（保留最近 30 天）
mysql -usipp -p sipp_manager <<EOF
DELETE FROM task_history
WHERE start_time < UNIX_TIMESTAMP(DATE_SUB(NOW(), INTERVAL 30 DAY)) * 1000;
EOF

# 优化表
mysql -usipp -p sipp_manager -e "OPTIMIZE TABLE task_history, machines;"
```

### 从机管理

```bash
# 下线从机（停止服务即可）
sudo systemctl stop sipp-web-manager-slave

# 从机会自动标记为离线
# 主机不会再分配任务到该节点

# 重新上线
sudo systemctl start sipp-web-manager-slave
```

---

## 升级指南

### 主机升级

```bash
cd /opt/sipp-web-manager
git pull
./deploy-master.sh
sudo systemctl restart sipp-web-manager
```

### 从机升级

```bash
cd /opt/sipp-web-manager
git pull
./deploy-slave.sh
sudo systemctl restart sipp-web-manager-slave
```

### 数据库迁移

如有新的数据库迁移脚本：
```bash
mysql -usipp -p sipp_manager < backend/database/migrations/<new-migration>.sql
```

---

## 附录

### systemd 服务管理

```bash
# 启动
sudo systemctl start sipp-web-manager
sudo systemctl start sipp-web-manager-slave

# 停止
sudo systemctl stop sipp-web-manager
sudo systemctl stop sipp-web-manager-slave

# 重启
sudo systemctl restart sipp-web-manager
sudo systemctl restart sipp-web-manager-slave

# 查看状态
sudo systemctl status sipp-web-manager
sudo systemctl status sipp-web-manager-slave

# 开机自启
sudo systemctl enable sipp-web-manager
sudo systemctl enable sipp-web-manager-slave
```

### 快速测试命令

```bash
# 主机健康检查
curl http://localhost:3000/api/health

# 查询从机列表
curl http://localhost:3000/api/machines

# 从机健康检查
curl http://<从机IP>:3000/api/health
```

---

## 联系与支持

如遇到问题，请检查：
1. 系统日志
2. 应用日志
3. 数据库连接
4. 网络连通性

更多信息请参考项目文档或提交 Issue。
