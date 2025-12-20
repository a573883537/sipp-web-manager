# MySQL数据库集成指南

## ✅ 已完成的迁移

PostgreSQL已成功迁移到MySQL！

### 主要变更
- ✅ 数据库从PostgreSQL换为MySQL 8.0
- ✅ 使用mysql2库代替pg-promise
- ✅ 更新所有数据库连接代码
- ✅ 更新Docker配置
- ✅ 更新环境变量配置

---

## 🚀 快速启动（3步）

### 方式一：Docker + 本地开发服务器（推荐）

#### 第1步：启动MySQL容器

```bash
# 启动MySQL容器
docker run -d \
  --name sipp-mysql \
  -e MYSQL_ROOT_PASSWORD=sipp123456 \
  -e MYSQL_DATABASE=sipp_manager \
  -p 3306:3306 \
  mysql:8.0 \
  --default-authentication-plugin=mysql_native_password

# 等待MySQL启动
sleep 10

# 初始化数据库表
docker exec -i sipp-mysql mysql -uroot -psipp123456 sipp_manager < /home/wangjf/sipp-web-manager/backend/database/schema.mysql.sql
```

#### 第2步：启动后端（新终端）

```bash
cd /home/wangjf/sipp-web-manager/backend
npm run dev
```

✅ 后端运行在 `http://localhost:3000`

#### 第3步：启动前端（新终端）

```bash
cd /home/wangjf/sipp-web-manager/frontend
npm run dev
```

✅ 前端运行在 `http://localhost:5173`

---

### 方式二：系统MySQL + 本地开发服务器

如果您系统已安装MySQL：

```bash
# 1. 创建数据库
mysql -uroot -p -e "CREATE DATABASE IF NOT EXISTS sipp_manager CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;"

# 2. 初始化表结构
mysql -uroot -p sipp_manager < /home/wangjf/sipp-web-manager/backend/database/schema.mysql.sql

# 3. 启动后端
cd /home/wangjf/sipp-web-manager/backend
npm run dev

# 4. 启动前端（新终端）
cd /home/wangjf/sipp-web-manager/frontend
npm run dev
```

---

### 方式三：Docker Compose（完整部署）

```bash
cd /home/wangjf/sipp-web-manager

# 启动所有服务（MySQL + 后端 + 前端）
docker-compose up -d

# 查看日志
docker-compose logs -f

# 访问应用
# 前端: http://localhost
# 后端: http://localhost:3000
```

---

## 📊 验证安装

### 1. 测试后端健康检查

```bash
curl http://localhost:3000/health
```

预期响应：
```json
{
  "status": "ok",
  "timestamp": 1765726534416,
  ...
}
```

### 2. 测试数据库连接

```bash
# Docker MySQL
docker exec sipp-mysql mysql -uroot -psipp123456 -e "USE sipp_manager; SHOW TABLES;"

# 系统MySQL
mysql -uroot -p -e "USE sipp_manager; SHOW TABLES;"
```

预期输出：
```
+------------------------+
| Tables_in_sipp_manager |
+------------------------+
| scenarios              |
+------------------------+
```

### 3. 测试API

```bash
# 查询场景列表
curl http://localhost:3000/api/scenarios

# 创建测试场景
curl -X POST http://localhost:3000/api/scenarios \
  -H "Content-Type: application/json" \
  -d '{
    "filename": "test.xml",
    "scenario": {
      "name": "Test Scenario",
      "description": "测试场景",
      "messages": [
        {"type": "send", "cdata": "INVITE sip:test@example.com SIP/2.0"},
        {"type": "recv", "response": "200"}
      ]
    }
  }'
```

### 4. 验证数据库中的数据

```bash
# Docker MySQL
docker exec sipp-mysql mysql -uroot -psipp123456 sipp_manager -e "SELECT filename, name, created_at FROM scenarios;"

# 系统MySQL
mysql -uroot -p sipp_manager -e "SELECT filename, name, created_at FROM scenarios;"
```

---

## 🔧 数据库管理

### 连接到MySQL

```bash
# Docker MySQL
docker exec -it sipp-mysql mysql -uroot -psipp123456 sipp_manager

# 系统MySQL
mysql -uroot -p sipp_manager
```

### 常用SQL命令

```sql
-- 查看所有场景
SELECT * FROM scenarios;

-- 查看表结构
DESCRIBE scenarios;

-- 查询场景数量
SELECT COUNT(*) as total FROM scenarios;

-- 查看JSON字段
SELECT
  filename,
  name,
  JSON_PRETTY(messages) as messages
FROM scenarios
LIMIT 1;

-- 删除所有场景（慎用！）
TRUNCATE TABLE scenarios;

-- 退出
EXIT;
```

### 重置数据库

```bash
# Docker MySQL
docker exec -i sipp-mysql mysql -uroot -psipp123456 << EOF
DROP DATABASE IF EXISTS sipp_manager;
CREATE DATABASE sipp_manager CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE sipp_manager;
$(cat /home/wangjf/sipp-web-manager/backend/database/schema.mysql.sql)
EOF

# 系统MySQL
mysql -uroot -p << EOF
DROP DATABASE IF EXISTS sipp_manager;
CREATE DATABASE sipp_manager CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
EOF
mysql -uroot -p sipp_manager < /home/wangjf/sipp-web-manager/backend/database/schema.mysql.sql
```

---

## 🐛 故障排除

### 问题1: 无法连接MySQL

**症状**: `ECONNREFUSED 127.0.0.1:3306`

**解决方案**:
```bash
# 检查MySQL是否运行
docker ps | grep mysql
# 或
systemctl status mysql

# 重启MySQL
docker restart sipp-mysql
# 或
systemctl restart mysql

# 测试连接
mysql -uroot -p -e "SELECT 1;"
```

### 问题2: 认证失败

**症状**: `ER_NOT_SUPPORTED_AUTH_MODE`

**解决方案**:
```bash
# 使用mysql_native_password认证（Docker会自动配置）
# 如果是系统MySQL，执行：
mysql -uroot -p -e "ALTER USER 'root'@'localhost' IDENTIFIED WITH mysql_native_password BY 'sipp123456'; FLUSH PRIVILEGES;"
```

### 问题3: 表不存在

**症状**: `Table 'sipp_manager.scenarios' doesn't exist`

**解决方案**:
```bash
# 重新执行schema脚本
docker exec -i sipp-mysql mysql -uroot -psipp123456 sipp_manager < /home/wangjf/sipp-web-manager/backend/database/schema.mysql.sql
```

### 问题4: 端口被占用

**症状**: `port 3306 already in use`

**解决方案**:
```bash
# 查看占用端口的进程
lsof -i :3306

# 停止现有MySQL
docker stop sipp-mysql
# 或
systemctl stop mysql
```

---

## 🔄 后端代码调试

### 查看SQL查询日志

编辑 `backend/src/database/index.ts`，已包含查询日志：

```typescript
// 查询会自动记录到日志
logger.debug('SQL Query:', { query: e.query, params: e.params });
```

### 查看实时日志

```bash
# 后端日志
tail -f /home/wangjf/sipp-web-manager/backend/logs/app.log

# 只看数据库相关
tail -f /home/wangjf/sipp-web-manager/backend/logs/app.log | grep -i "database\|sql"

# 只看错误
tail -f /home/wangjf/sipp-web-manager/backend/logs/app.log | grep error
```

### 测试数据库查询

在后端代码中添加调试：

```typescript
// backend/src/api/routes.ts
apiRouter.get('/scenarios', async (_req: Request, res: Response): Promise<void> => {
  try {
    console.log('🔍 查询场景列表...');
    const records = await scenarioRepository.findAll();
    console.log('✅ 查询到', records.length, '个场景');
    // ...
  }
});
```

---

## 📁 关键文件位置

```
MySQL相关文件：
├── backend/database/
│   └── schema.mysql.sql              # MySQL表结构
├── backend/src/database/
│   ├── index.ts                      # MySQL连接（mysql2）
│   └── scenario-repository.ts        # CRUD操作
├── backend/.env                      # 环境配置
├── docker-compose.yml                # Docker配置（MySQL）
└── docs/MYSQL_SETUP.md              # 本文档
```

---

## 🆚 PostgreSQL vs MySQL

### 主要差异

| 特性 | PostgreSQL | MySQL |
|------|-----------|-------|
| 端口 | 5432 | 3306 |
| JSON类型 | JSONB | JSON |
| 自增ID | SERIAL | AUTO_INCREMENT |
| 更新触发器 | 需要手动创建 | ON UPDATE CURRENT_TIMESTAMP |
| 参数占位符 | `$1, $2` | `?, ?` |

### 代码变更

**PostgreSQL版本**:
```typescript
import pgPromise from 'pg-promise';
const db = pgp(config);
await db.manyOrNone('SELECT * FROM scenarios');
```

**MySQL版本**:
```typescript
import mysql from 'mysql2/promise';
const pool = mysql.createPool(config);
const [rows] = await pool.execute('SELECT * FROM scenarios');
```

---

## 📚 参考资源

### MySQL文档
- [MySQL 8.0 Documentation](https://dev.mysql.com/doc/refman/8.0/en/)
- [mysql2 npm包](https://www.npmjs.com/package/mysql2)

### SIPp Web Manager文档
- [完整文档](../README.md)
- [开发指南](./DEVELOPMENT_GUIDE.md)
- [快速开始](./QUICK_START.md)

---

## ✅ 迁移完成清单

- [x] 清理PostgreSQL Docker服务
- [x] 更新package.json依赖（pg-promise → mysql2）
- [x] 创建MySQL schema文件
- [x] 更新数据库连接代码
- [x] 更新API路由和仓库类
- [x] 更新Docker配置
- [x] 更新环境变量配置
- [x] 测试构建成功
- [x] 创建文档

---

**迁移完成！** 🎉

现在可以使用MySQL作为持久化存储，所有场景数据都会保存到MySQL数据库中。

有任何问题请参考故障排除部分或查看日志。
