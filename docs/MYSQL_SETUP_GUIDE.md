# setup-mysql.sh 使用指南

MySQL 数据库快速搭建工具，支持 Docker 容器部署和本地安装两种方式。

## 🚀 快速开始

```bash
# 运行脚本
./setup-mysql.sh

# 按照交互式提示操作即可
```

## 📋 功能特性

### 自动化功能
- ✅ 自动检测操作系统（Ubuntu/Debian/CentOS/RHEL/Fedora）
- ✅ 自动检测 Docker 安装状态
- ✅ 自动安装 Docker（如果需要）
- ✅ 交互式配置（容器名、密码、端口等）
- ✅ 自动检查端口占用
- ✅ 自动等待 MySQL 就绪
- ✅ 可选：自动初始化 SIPp Web Manager 数据库
- ✅ 生成配置文件供后续使用

### 支持的部署方式

#### 1. Docker 容器部署（推荐）

**优势：**
- 🚀 5 分钟快速部署
- 🔒 隔离性好，不影响系统环境
- 💾 数据持久化（使用 Docker Volume）
- 🔄 自动重启（--restart unless-stopped）
- 📦 易于管理和迁移
- 🗑️ 易于清理（删除容器不影响数据）

**适用场景：**
- 开发和测试环境
- 不想在系统中直接安装 MySQL
- 需要快速部署和清理
- 希望数据库与系统隔离

#### 2. 本地安装 MySQL

**优势：**
- ⚡ 性能更好（无容器开销）
- 🔧 完全控制配置
- 🌐 系统级服务

**适用场景：**
- 生产环境
- 已有 MySQL 管理经验
- 需要与其他系统服务集成
- 对性能要求极高

## 📝 使用示例

### Docker 容器部署示例

```bash
$ ./setup-mysql.sh

╔════════════════════════════════════════════════════════════╗
║         MySQL 数据库快速搭建工具                           ║
║         for SIPp Web Manager                               ║
╚════════════════════════════════════════════════════════════╝

[INFO] 检测到操作系统: ubuntu 20.04
[SUCCESS] Docker 已安装且运行中

请选择部署方式:

  1) Docker 容器部署 (推荐)
     - 快速部署，隔离性好
     - 易于管理和迁移
     - 需要安装 Docker

  2) 本地安装 MySQL
     - 传统部署方式
     - 性能更好
     - 直接安装到系统

  3) 退出

请选择 [1-3]: 1

[INFO] 使用 Docker 部署 MySQL...

容器名称 [sipp-mysql]: sipp-mysql
MySQL root 密码 [留空表示无密码]: mypassword
数据库名称 [sipp_manager]: sipp_manager
映射端口 [3306]: 3306

[INFO] 配置信息：
  容器名称: sipp-mysql
  Root 密码: mypassword
  数据库名: sipp_manager
  映射端口: 3306

确认部署？(y/n) y

[INFO] 正在启动 MySQL 容器...
[SUCCESS] MySQL 容器已启动
[INFO] 等待 MySQL 初始化...
..........
[SUCCESS] MySQL 已就绪

╔════════════════════════════════════════════════════════════╗
║              MySQL 部署成功                                 ║
╠════════════════════════════════════════════════════════════╣
║                                                            ║
║  容器名称:   sipp-mysql                                     ║
║  数据库名:   sipp_manager                                   ║
║  端口:       3306                                          ║
║  Root密码:   mypassword                                     ║
║                                                            ║
║  连接命令:                                                 ║
║  mysql -h 127.0.0.1 -P 3306 -u root -p                     ║
║                                                            ║
║  环境变量配置 (backend/.env):                              ║
║  DB_HOST=localhost                                         ║
║  DB_PORT=3306                                              ║
║  DB_NAME=sipp_manager                                      ║
║  DB_USER=root                                              ║
║  DB_PASSWORD=mypassword                                    ║
║  DB_CONTAINER=sipp-mysql                                   ║
║                                                            ║
╚════════════════════════════════════════════════════════════╝

[SUCCESS] 配置信息已保存到: mysql-docker-config.txt

是否立即初始化 SIPp Web Manager 数据库？(y/n) y
[INFO] 执行数据库初始化...
[SUCCESS] 数据库初始化完成
```

### 本地安装示例

```bash
$ ./setup-mysql.sh

请选择 [1-3]: 2

[INFO] 本地安装 MySQL...
[INFO] 更新软件包列表...
[INFO] 安装 MySQL Server...
[SUCCESS] MySQL 安装完成

╔════════════════════════════════════════════════════════════╗
║              MySQL 安装成功                                 ║
╠════════════════════════════════════════════════════════════╣
║                                                            ║
║  下一步：配置 MySQL 安全设置                                ║
║                                                            ║
║  执行命令:                                                 ║
║  sudo mysql_secure_installation                            ║
║                                                            ║
║  建议配置:                                                 ║
║  - 设置 root 密码                                          ║
║  - 删除匿名用户: Yes                                       ║
║  - 禁止 root 远程登录: Yes                                 ║
║  - 删除测试数据库: Yes                                     ║
║  - 重载权限表: Yes                                         ║
║                                                            ║
╚════════════════════════════════════════════════════════════╝

是否立即执行安全配置？(y/n) y
```

## 🔧 配置说明

### Docker 部署配置参数

| 参数 | 默认值 | 说明 |
|------|--------|------|
| 容器名称 | sipp-mysql | Docker 容器名称 |
| Root 密码 | 无密码 | MySQL root 用户密码（可留空） |
| 数据库名 | sipp_manager | 创建的数据库名称 |
| 映射端口 | 3306 | 主机映射端口 |

### 生成的配置文件

部署完成后会生成 `mysql-docker-config.txt` 文件，包含：
- 数据库连接信息
- backend/.env 配置示例
- 常用 Docker 管理命令

## 📂 数据持久化

Docker 部署使用 **Docker Volume** 进行数据持久化：

```bash
# 查看数据卷
docker volume ls | grep sipp-mysql-data

# 查看数据卷详情
docker volume inspect sipp-mysql-data

# 备份数据
docker run --rm \
  -v sipp-mysql-data:/data \
  -v $(pwd):/backup \
  busybox tar czf /backup/mysql-backup.tar.gz /data

# 恢复数据
docker run --rm \
  -v sipp-mysql-data:/data \
  -v $(pwd):/backup \
  busybox tar xzf /backup/mysql-backup.tar.gz -C /
```

## 🔍 常用操作

### Docker 容器管理

```bash
# 查看容器状态
docker ps | grep sipp-mysql

# 查看容器日志
docker logs sipp-mysql
docker logs -f sipp-mysql  # 实时跟踪

# 进入容器
docker exec -it sipp-mysql bash

# 连接 MySQL
docker exec -it sipp-mysql mysql -u root -p

# 停止容器
docker stop sipp-mysql

# 启动容器
docker start sipp-mysql

# 重启容器
docker restart sipp-mysql

# 删除容器（数据保留）
docker stop sipp-mysql
docker rm sipp-mysql

# 删除容器和数据
docker stop sipp-mysql
docker rm sipp-mysql
docker volume rm sipp-mysql-data
```

### 数据库操作

```bash
# 连接数据库（容器方式）
docker exec -it sipp-mysql mysql -u root -p

# 连接数据库（客户端方式）
mysql -h 127.0.0.1 -P 3306 -u root -p

# 备份数据库
docker exec sipp-mysql mysqldump -u root -p sipp_manager > backup.sql

# 恢复数据库
docker exec -i sipp-mysql mysql -u root -p sipp_manager < backup.sql
```

## ❓ 常见问题

### 1. Docker 未安装

**问题：** 选择 Docker 部署但系统未安装 Docker

**解决：** 脚本会提示安装，选择 y 自动安装 Docker

### 2. 端口被占用

**问题：** 端口 3306 已被占用

**解决方案：**
```bash
# 查找占用进程
lsof -i :3306

# 停止占用进程或选择其他端口
# 脚本会自动检测并提示
```

### 3. 容器已存在

**问题：** 容器名称已被占用

**解决：** 脚本会提示是否删除并重新创建

### 4. 权限问题

**问题：** Got permission denied while trying to connect to the Docker daemon

**解决方案：**
```bash
# 将用户添加到 docker 组
sudo usermod -aG docker $USER

# 注销并重新登录，或执行
newgrp docker

# 或使用 sudo
sudo ./setup-mysql.sh
```

### 5. 数据库初始化失败

**问题：** 自动初始化数据库时失败

**解决：** 手动执行初始化
```bash
cd backend/database
export DB_CONTAINER=sipp-mysql  # 如果是容器部署
export DB_USER=root
export DB_PASSWORD=your_password
./init-db.sh
```

## 🔒 安全建议

1. **设置强密码**：不要使用空密码或简单密码
2. **修改默认端口**：生产环境建议修改默认 3306 端口
3. **限制访问**：使用防火墙限制 MySQL 端口访问
4. **定期备份**：定期备份数据库和 Docker Volume
5. **更新镜像**：定期更新 MySQL 镜像版本

## 📞 技术支持

遇到问题？
1. 查看脚本输出的错误信息
2. 检查 `mysql-docker-config.txt` 配置文件
3. 查看容器日志：`docker logs sipp-mysql`
4. 参考 [README.md](README.md) 常见问题部分

