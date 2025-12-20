# 开发调试指南

## 🚀 快速启动

### 完整启动流程

```bash
# 终端1：启动PostgreSQL
docker run -d --name sipp-postgres \
  -e POSTGRES_DB=sipp_manager \
  -e POSTGRES_PASSWORD=postgres \
  -p 5432:5432 \
  postgres:16-alpine

# 初始化数据库
cd /home/wangjf/sipp-web-manager
docker exec -i sipp-postgres psql -U postgres -d sipp_manager < backend/database/schema.sql

# 终端2：启动后端
cd /home/wangjf/sipp-web-manager/backend
npm run dev

# 终端3：启动前端
cd /home/wangjf/sipp-web-manager/frontend
npm run dev
```

### 访问地址

- **前端界面**: http://localhost:5173
- **后端API**: http://localhost:3000
- **健康检查**: http://localhost:3000/health
- **场景API**: http://localhost:3000/api/scenarios

---

## 🔧 后端代码调试

### 1. 开发模式（自动重载）

后端使用 `nodemon` + `ts-node`，代码修改后自动重启：

```bash
cd /home/wangjf/sipp-web-manager/backend
npm run dev
```

**特点**:
- ✅ 保存文件后自动重启
- ✅ 实时查看日志输出
- ✅ 无需手动构建

**日志输出位置**:
- 控制台: 实时输出
- 文件: `backend/logs/app.log`

### 2. 查看实时日志

```bash
# 查看所有日志
tail -f backend/logs/app.log

# 只看错误日志
tail -f backend/logs/app.log | grep "level\":\"error"

# 查看数据库相关日志
tail -f backend/logs/app.log | grep -i database
```

### 3. 调试PostgreSQL查询

#### 在代码中添加调试日志

编辑 `backend/src/database/index.ts`:

```typescript
const pgp = pgPromise({
  // 查询日志记录
  query(e) {
    logger.debug('SQL Query:', { query: e.query, params: e.params });
    console.log('🔍 SQL:', e.query); // 添加控制台输出
  },
  // 错误处理
  error(err, e) {
    logger.error('Database Error:', { error: err.message, context: e.query });
    console.error('❌ DB Error:', err.message); // 添加控制台输出
  },
});
```

修改后保存，服务自动重启。

#### 直接测试SQL查询

```bash
# 进入PostgreSQL容器
docker exec -it sipp-postgres psql -U postgres -d sipp_manager

# 查询所有场景
SELECT * FROM scenarios;

# 查看表结构
\d scenarios

# 退出
\q
```

### 4. 调试API路由

#### 添加调试日志

编辑 `backend/src/api/routes.ts`，在需要调试的地方添加：

```typescript
apiRouter.get('/scenarios', async (_req: Request, res: Response): Promise<void> => {
  try {
    console.log('🔍 开始查询场景列表...');

    const records = await scenarioRepository.findAll();
    console.log('✅ 查询到场景数量:', records.length);
    console.log('📊 场景数据:', JSON.stringify(records, null, 2));

    const scenarios = records.map((record) => ({
      id: record.id,
      name: record.name,
      filename: record.filename,
      description: record.description,
      created_at: record.created_at,
      updated_at: record.updated_at,
    }));

    res.json({ success: true, scenarios });
  } catch (error: any) {
    console.error('❌ 查询场景失败:', error);
    logger.error('Failed to list scenarios:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});
```

保存后自动重启，然后测试API：

```bash
curl http://localhost:3000/api/scenarios
```

### 5. 使用VS Code调试

创建 `.vscode/launch.json`:

```json
{
  "version": "0.2.0",
  "configurations": [
    {
      "type": "node",
      "request": "launch",
      "name": "Debug Backend",
      "runtimeExecutable": "npm",
      "runtimeArgs": ["run", "dev"],
      "cwd": "${workspaceFolder}/backend",
      "console": "integratedTerminal",
      "internalConsoleOptions": "neverOpen",
      "skipFiles": ["<node_internals>/**"]
    }
  ]
}
```

然后在VS Code中：
1. 打开 `backend/src` 中的文件
2. 设置断点（点击行号左侧）
3. 按 F5 或点击"运行和调试"
4. 发送API请求触发断点

---

## 📝 常见修改场景

### 场景1：修改数据库查询逻辑

**文件**: `backend/src/database/scenario-repository.ts`

```typescript
// 例如：添加按名称搜索功能
async findByName(name: string): Promise<ScenarioRecord[]> {
  try {
    return await db.manyOrNone<ScenarioRecord>(
      'SELECT * FROM scenarios WHERE name ILIKE $1',
      [`%${name}%`]
    );
  } catch (error: any) {
    logger.error('Failed to find scenarios by name', { name, error: error.message });
    throw error;
  }
}
```

**测试**:
```bash
# 保存文件后自动重启
# 在另一个文件中使用新方法
```

### 场景2：添加新的API端点

**文件**: `backend/src/api/routes.ts`

```typescript
// 添加搜索API
apiRouter.get('/scenarios/search', async (req: Request, res: Response): Promise<void> => {
  try {
    const { q } = req.query;
    console.log('🔍 搜索场景:', q);

    if (!q || typeof q !== 'string') {
      res.status(400).json({ success: false, error: 'Missing search query' });
      return;
    }

    const results = await scenarioRepository.findByName(q);
    console.log('✅ 找到结果数:', results.length);

    res.json({ success: true, scenarios: results });
  } catch (error: any) {
    logger.error('Search failed:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});
```

**测试**:
```bash
curl "http://localhost:3000/api/scenarios/search?q=test"
```

### 场景3：修改数据库表结构

```bash
# 1. 编辑 schema.sql
nano backend/database/schema.sql

# 2. 删除并重建数据库
docker exec sipp-postgres psql -U postgres -c "DROP DATABASE sipp_manager;"
docker exec sipp-postgres psql -U postgres -c "CREATE DATABASE sipp_manager;"
docker exec -i sipp-postgres psql -U postgres -d sipp_manager < backend/database/schema.sql

# 3. 后端会自动重启并连接新数据库
```

---

## 🧪 测试工具

### 1. curl测试

```bash
# 健康检查
curl http://localhost:3000/health

# 获取场景列表
curl http://localhost:3000/api/scenarios

# 创建场景
curl -X POST http://localhost:3000/api/scenarios \
  -H "Content-Type: application/json" \
  -d '{
    "filename": "test.xml",
    "scenario": {
      "name": "Test",
      "messages": [
        {"type": "send", "cdata": "INVITE sip:test@example.com SIP/2.0"},
        {"type": "recv", "response": "200"}
      ]
    }
  }'

# 获取场景详情
curl http://localhost:3000/api/scenarios/test.xml

# 删除场景
curl -X DELETE http://localhost:3000/api/scenarios/test.xml
```

### 2. 使用Postman/Insomnia

导入API端点：
- Base URL: `http://localhost:3000`
- 所有端点见 `README.md` 中的API文档部分

### 3. 数据库查询测试

```bash
# 交互式查询
docker exec -it sipp-postgres psql -U postgres -d sipp_manager

# 单次查询
docker exec sipp-postgres psql -U postgres -d sipp_manager -c "SELECT COUNT(*) FROM scenarios;"

# 查看场景内容（格式化JSONB）
docker exec sipp-postgres psql -U postgres -d sipp_manager -c "
SELECT
  filename,
  name,
  jsonb_pretty(messages) as messages
FROM scenarios
LIMIT 1;
"
```

---

## 🐛 常见问题调试

### 问题1: 端口被占用

```bash
# 查看端口占用
lsof -i :3000  # 后端
lsof -i :5173  # 前端
lsof -i :5432  # PostgreSQL

# 终止进程
kill -9 <PID>
```

### 问题2: 数据库连接失败

```bash
# 检查PostgreSQL是否运行
docker ps | grep postgres

# 查看PostgreSQL日志
docker logs sipp-postgres

# 测试连接
docker exec sipp-postgres psql -U postgres -d sipp_manager -c "SELECT 1;"

# 重启PostgreSQL
docker restart sipp-postgres
```

### 问题3: npm依赖问题

```bash
cd backend

# 清理并重新安装
rm -rf node_modules package-lock.json
npm install

# 重新构建
npm run build
```

### 问题4: TypeScript编译错误

```bash
cd backend

# 查看详细错误
npm run build

# 清理dist目录
rm -rf dist
npm run build
```

---

## 📊 性能监控

### 查看数据库性能

```bash
# 查看活跃连接
docker exec sipp-postgres psql -U postgres -d sipp_manager -c "
SELECT count(*) as connections FROM pg_stat_activity;
"

# 查看表大小
docker exec sipp-postgres psql -U postgres -d sipp_manager -c "
SELECT
  pg_size_pretty(pg_total_relation_size('scenarios')) as total_size;
"

# 查看慢查询（如果启用）
docker exec sipp-postgres psql -U postgres -d sipp_manager -c "
SELECT query, calls, total_time, mean_time
FROM pg_stat_statements
ORDER BY mean_time DESC
LIMIT 10;
"
```

### 监控后端日志

```bash
# 实时监控所有请求
tail -f backend/logs/app.log | grep "GET\|POST\|PUT\|DELETE"

# 监控错误
tail -f backend/logs/app.log | grep "\"level\":\"error\""

# 监控数据库操作
tail -f backend/logs/app.log | grep -i "database\|sql"
```

---

## 🔄 热重载工作流程

### 典型的开发流程

1. **启动所有服务** (只需启动一次)
```bash
# 终端1: PostgreSQL
docker start sipp-postgres || docker run -d --name sipp-postgres -e POSTGRES_DB=sipp_manager -e POSTGRES_PASSWORD=postgres -p 5432:5432 postgres:16-alpine

# 终端2: 后端
cd /home/wangjf/sipp-web-manager/backend && npm run dev

# 终端3: 前端
cd /home/wangjf/sipp-web-manager/frontend && npm run dev
```

2. **修改后端代码**
- 编辑 `backend/src` 中的任何文件
- 保存文件
- 后端自动重启（几秒钟）
- 无需手动操作

3. **修改前端代码**
- 编辑 `frontend/src` 中的任何文件
- 保存文件
- 浏览器自动刷新
- 立即看到效果

4. **测试API**
```bash
# 使用curl或浏览器测试
curl http://localhost:3000/api/scenarios
```

5. **查看日志**
```bash
# 后端日志在终端2中实时显示
# 或查看日志文件
tail -f backend/logs/app.log
```

---

## 💡 开发技巧

### 1. 使用环境变量控制日志级别

编辑 `backend/.env`:
```env
LOG_LEVEL=debug  # 显示所有日志（开发时）
# LOG_LEVEL=info  # 只显示重要信息（生产时）
```

### 2. 快速重置数据库

创建脚本 `backend/scripts/reset-db.sh`:
```bash
#!/bin/bash
docker exec sipp-postgres psql -U postgres -c "DROP DATABASE IF EXISTS sipp_manager;"
docker exec sipp-postgres psql -U postgres -c "CREATE DATABASE sipp_manager;"
docker exec -i sipp-postgres psql -U postgres -d sipp_manager < backend/database/schema.sql
echo "✅ 数据库已重置"
```

使用：
```bash
chmod +x backend/scripts/reset-db.sh
./backend/scripts/reset-db.sh
```

### 3. 添加测试数据

创建 `backend/database/seed.sql`:
```sql
-- 插入测试场景
INSERT INTO scenarios (filename, name, description, messages)
VALUES
  ('test1.xml', 'Test Scenario 1', '测试场景1', '[{"type":"send","cdata":"INVITE"}]'::jsonb),
  ('test2.xml', 'Test Scenario 2', '测试场景2', '[{"type":"send","cdata":"REGISTER"}]'::jsonb),
  ('test3.xml', 'Test Scenario 3', '测试场景3', '[{"type":"recv","response":"200"}]'::jsonb);
```

导入：
```bash
docker exec -i sipp-postgres psql -U postgres -d sipp_manager < backend/database/seed.sql
```

### 4. 使用别名简化命令

添加到 `~/.bashrc` 或 `~/.zshrc`:
```bash
# SIPp Web Manager 开发别名
alias sipp-backend='cd /home/wangjf/sipp-web-manager/backend && npm run dev'
alias sipp-frontend='cd /home/wangjf/sipp-web-manager/frontend && npm run dev'
alias sipp-logs='tail -f /home/wangjf/sipp-web-manager/backend/logs/app.log'
alias sipp-db='docker exec -it sipp-postgres psql -U postgres -d sipp_manager'
alias sipp-reset-db='/home/wangjf/sipp-web-manager/backend/scripts/reset-db.sh'
```

重新加载配置：
```bash
source ~/.bashrc  # 或 source ~/.zshrc
```

使用：
```bash
sipp-backend    # 启动后端
sipp-frontend   # 启动前端
sipp-logs       # 查看日志
sipp-db         # 进入数据库
```

---

## 🎯 快速参考

### 启动命令

```bash
# PostgreSQL
docker start sipp-postgres

# 后端（开发模式）
cd /home/wangjf/sipp-web-manager/backend && npm run dev

# 前端（开发模式）
cd /home/wangjf/sipp-web-manager/frontend && npm run dev
```

### 停止命令

```bash
# PostgreSQL
docker stop sipp-postgres

# 后端/前端: Ctrl+C
```

### 关键文件位置

```
后端代码:
  - API路由: backend/src/api/routes.ts
  - 数据库: backend/src/database/
  - 配置: backend/src/config/index.ts
  - 主入口: backend/src/index.ts

数据库:
  - 表结构: backend/database/schema.sql
  - 环境配置: backend/.env

日志:
  - 应用日志: backend/logs/app.log
```

---

**开发愉快！** 🚀

有任何问题请查看日志或调试输出。
