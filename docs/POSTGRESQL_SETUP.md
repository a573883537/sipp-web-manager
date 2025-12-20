# PostgreSQL持久化存储配置指南

## 概述

SIPp Web Manager现已支持PostgreSQL数据库进行场景数据的持久化存储。所有创建的场景都会保存到数据库中，同时生成XML文件供SIPp使用。

## 架构变更

### 数据流

```
前端创建场景 → 后端API → PostgreSQL数据库
                        ↓
                   生成XML文件 → SIPp使用
```

### 数据库表结构

**scenarios表**:
- `id` - 主键（自增）
- `filename` - 场景文件名（唯一索引）
- `name` - 场景显示名称
- `description` - 场景描述（可选）
- `messages` - 消息序列（JSONB格式）
- `variables` - 场景变量（JSONB格式）
- `init` - 初始化配置（JSONB格式）
- `created_at` - 创建时间
- `updated_at` - 更新时间（自动触发器）

## 部署方式

### 方式一：Docker Compose部署（推荐）

这是最简单的部署方式，会自动启动PostgreSQL容器和应用。

#### 1. 配置环境变量

创建 `.env` 文件（或使用默认值）：

```bash
# 创建.env文件
cat > .env << EOF
# PostgreSQL配置
DB_NAME=sipp_manager
DB_USER=postgres
DB_PASSWORD=postgres

# SIPp配置
SIPP_HOST=host.docker.internal
SIPP_CONTROL_PORT=8888
EOF
```

#### 2. 启动所有服务

```bash
# 构建并启动（包括PostgreSQL、后端、前端）
docker-compose up -d

# 查看日志
docker-compose logs -f

# 查看服务状态
docker-compose ps
```

#### 3. 验证部署

```bash
# 检查PostgreSQL是否就绪
docker-compose exec postgres pg_isready -U postgres

# 查看数据库表
docker-compose exec postgres psql -U postgres -d sipp_manager -c "\dt"

# 查看场景数据
docker-compose exec postgres psql -U postgres -d sipp_manager -c "SELECT filename, name FROM scenarios;"
```

#### 4. 访问应用

- 前端界面: http://localhost
- 后端API: http://localhost:3000
- 健康检查: http://localhost:3000/health

### 方式二：本地开发部署

适用于开发环境，需要单独安装PostgreSQL。

#### 1. 安装PostgreSQL

**Ubuntu/Debian:**
```bash
sudo apt update
sudo apt install postgresql postgresql-contrib
```

**CentOS/RHEL:**
```bash
sudo yum install postgresql-server postgresql-contrib
sudo postgresql-setup initdb
sudo systemctl start postgresql
```

**macOS:**
```bash
brew install postgresql@16
brew services start postgresql@16
```

#### 2. 创建数据库

```bash
# 切换到postgres用户
sudo -u postgres psql

-- 创建数据库
CREATE DATABASE sipp_manager;

-- 创建用户（如果需要）
CREATE USER sipp_user WITH PASSWORD 'your_password';
GRANT ALL PRIVILEGES ON DATABASE sipp_manager TO sipp_user;

-- 退出
\q
```

#### 3. 初始化数据库表结构

```bash
# 方式1：使用初始化脚本
cd backend/database
export DB_HOST=localhost
export DB_NAME=sipp_manager
export DB_USER=postgres
export DB_PASSWORD=postgres
./init.sh

# 方式2：直接执行SQL
psql -U postgres -d sipp_manager -f backend/database/schema.sql
```

#### 4. 配置后端环境变量

```bash
cd backend

# 复制环境变量模板
cp .env.example .env

# 编辑.env文件
nano .env
```

修改数据库配置：

```env
# PostgreSQL数据库配置
DB_HOST=localhost
DB_PORT=5432
DB_NAME=sipp_manager
DB_USER=postgres
DB_PASSWORD=postgres
DB_POOL_SIZE=10
```

#### 5. 启动后端服务

```bash
cd backend

# 安装依赖
npm install

# 开发模式
npm run dev

# 或构建后启动
npm run build
npm start
```

#### 6. 启动前端应用

```bash
cd frontend

# 安装依赖
npm install

# 开发模式
npm run dev
```

## 数据库操作

### 查询所有场景

```bash
# Docker环境
docker-compose exec postgres psql -U postgres -d sipp_manager -c "SELECT * FROM scenarios;"

# 本地环境
psql -U postgres -d sipp_manager -c "SELECT * FROM scenarios;"
```

### 查看场景详情（包含消息）

```sql
SELECT
  id,
  filename,
  name,
  description,
  jsonb_array_length(messages) as message_count,
  created_at,
  updated_at
FROM scenarios;
```

### 导出场景数据

```bash
# 导出为JSON
docker-compose exec postgres psql -U postgres -d sipp_manager -t -c "SELECT row_to_json(t) FROM scenarios t;" > scenarios_backup.json

# 导出为SQL
docker-compose exec postgres pg_dump -U postgres -d sipp_manager -t scenarios > scenarios_backup.sql
```

### 备份数据库

```bash
# Docker环境
docker-compose exec postgres pg_dump -U postgres sipp_manager > sipp_manager_backup.sql

# 本地环境
pg_dump -U postgres sipp_manager > sipp_manager_backup.sql
```

### 恢复数据库

```bash
# Docker环境
cat sipp_manager_backup.sql | docker-compose exec -T postgres psql -U postgres -d sipp_manager

# 本地环境
psql -U postgres -d sipp_manager < sipp_manager_backup.sql
```

## API变更

### 列出场景 - GET /api/scenarios

**响应格式变更**:

```json
{
  "success": true,
  "scenarios": [
    {
      "id": 1,
      "name": "Basic UAC Example",
      "filename": "basic-uac.xml",
      "description": "基础UAC呼叫流程",
      "created_at": "2025-12-14T10:00:00Z",
      "updated_at": "2025-12-14T10:00:00Z"
    }
  ]
}
```

### 获取场景详情 - GET /api/scenarios/:filename

**响应格式**:

```json
{
  "success": true,
  "scenario": {
    "name": "Basic UAC Example",
    "description": "基础UAC呼叫流程",
    "messages": [...],
    "variables": [],
    "init": []
  }
}
```

### 创建/更新场景 - POST /api/scenarios

**请求格式不变**，响应增加数据库记录信息：

```json
{
  "success": true,
  "message": "Scenario saved successfully",
  "scenario": {
    "id": 1,
    "filename": "basic-uac.xml",
    "name": "Basic UAC Example",
    "created_at": "2025-12-14T10:00:00Z",
    "updated_at": "2025-12-14T10:00:00Z"
  },
  "path": "/app/scenarios/basic-uac.xml"
}
```

## 故障排除

### 1. 数据库连接失败

**错误**: `Failed to connect to database`

**解决方法**:

```bash
# 检查PostgreSQL是否运行
docker-compose ps postgres

# 查看PostgreSQL日志
docker-compose logs postgres

# 重启PostgreSQL
docker-compose restart postgres

# 检查网络连接
docker-compose exec backend ping postgres
```

### 2. 表不存在错误

**错误**: `relation "scenarios" does not exist`

**解决方法**:

```bash
# 重新初始化数据库
docker-compose exec postgres psql -U postgres -d sipp_manager -f /docker-entrypoint-initdb.d/01-schema.sql

# 或重新创建容器（会清除数据）
docker-compose down -v
docker-compose up -d
```

### 3. 场景保存失败

**检查步骤**:

1. 查看后端日志：
```bash
docker-compose logs backend | grep -i error
```

2. 检查数据库连接：
```bash
docker-compose exec backend npm run test-db-connection
```

3. 验证场景数据：
```bash
# 查看最近创建的场景
docker-compose exec postgres psql -U postgres -d sipp_manager -c "SELECT * FROM scenarios ORDER BY created_at DESC LIMIT 5;"
```

### 4. XML文件未生成

场景会先保存到数据库，然后生成XML文件。如果XML文件未生成但数据库有记录：

```bash
# 检查scenarios目录权限
ls -la scenarios/

# 查看后端日志
docker-compose logs backend | grep -i xml

# 手动从数据库生成XML（需要后端API支持）
curl -X POST http://localhost:3000/api/scenarios/regenerate-xml
```

## 性能优化

### 1. 连接池配置

在 `.env` 文件中调整连接池大小：

```env
DB_POOL_SIZE=20  # 根据并发需求调整
```

### 2. 索引优化

数据库已创建以下索引：
- `idx_scenarios_filename` - 文件名索引
- `idx_scenarios_name` - 场景名称索引
- `idx_scenarios_created_at` - 创建时间索引

如需查询优化，可添加额外索引：

```sql
-- 为description添加全文搜索索引
CREATE INDEX idx_scenarios_description_trgm ON scenarios USING gin(description gin_trgm_ops);
```

### 3. JSONB查询优化

```sql
-- 为messages JSONB添加GIN索引
CREATE INDEX idx_scenarios_messages ON scenarios USING gin(messages);

-- 查询包含特定消息类型的场景
SELECT * FROM scenarios WHERE messages @> '[{"type": "send"}]';
```

## 迁移现有XML文件到数据库

如果已有XML场景文件，可以使用以下脚本导入到数据库：

```bash
# 创建导入脚本
cat > import-scenarios.sh << 'EOF'
#!/bin/bash
for file in scenarios/*.xml; do
  filename=$(basename "$file")
  echo "Importing $filename..."
  curl -X POST http://localhost:3000/api/scenarios/import \
    -H "Content-Type: application/json" \
    -d @"$file"
done
EOF

chmod +x import-scenarios.sh
./import-scenarios.sh
```

## 监控与日志

### 查看数据库统计

```sql
-- 场景数量统计
SELECT COUNT(*) as total_scenarios FROM scenarios;

-- 每日创建场景数
SELECT
  DATE(created_at) as date,
  COUNT(*) as count
FROM scenarios
GROUP BY DATE(created_at)
ORDER BY date DESC;

-- 最活跃的场景（更新最频繁）
SELECT
  filename,
  name,
  updated_at
FROM scenarios
ORDER BY updated_at DESC
LIMIT 10;
```

### 数据库日志

```bash
# Docker环境查看PostgreSQL日志
docker-compose logs postgres -f

# 查看慢查询（如果启用）
docker-compose exec postgres cat /var/lib/postgresql/data/log/postgresql.log
```

## 安全建议

### 1. 修改默认密码

```bash
# 在生产环境修改PostgreSQL密码
docker-compose exec postgres psql -U postgres -c "ALTER USER postgres WITH PASSWORD 'new_secure_password';"

# 同步更新.env文件
nano .env  # 修改DB_PASSWORD
```

### 2. 限制网络访问

在 `docker-compose.yml` 中移除PostgreSQL端口映射（仅允许后端容器访问）：

```yaml
postgres:
  # 注释掉端口映射
  # ports:
  #   - "5432:5432"
```

### 3. 启用SSL连接

```bash
# 生成SSL证书
docker-compose exec postgres openssl req -new -x509 -days 365 -nodes -text -out server.crt -keyout server.key

# 配置PostgreSQL使用SSL
# 修改postgresql.conf
ssl = on
ssl_cert_file = '/var/lib/postgresql/server.crt'
ssl_key_file = '/var/lib/postgresql/server.key'
```

## 总结

PostgreSQL集成完成后，SIPp Web Manager具备以下特性：

✅ 场景数据持久化存储
✅ 自动生成XML文件供SIPp使用
✅ 支持场景版本追踪（通过created_at/updated_at）
✅ 高性能JSONB存储
✅ 完整的CRUD操作
✅ Docker一键部署
✅ 数据备份与恢复

如有问题，请查看 [完整文档](../README.md) 或提交Issue。
