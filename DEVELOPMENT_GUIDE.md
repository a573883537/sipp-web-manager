# 开发指南 - 修改后端代码

## 🎯 选择开发模式

### 场景 1：快速开发/调试（推荐）

**使用本地开发模式 + Docker MySQL**

#### 前置条件
```bash
# 1. 停止 Docker 后端容器（保留 MySQL）
docker-compose stop backend

# 2. 验证 MySQL 仍在运行
docker-compose ps
# 应显示 sipp-manager-mysql 为 Up 状态
```

#### 启动本地开发服务器
```bash
cd /home/wangjf/sipp-web-manager/backend
./start.sh
```

**优点：**
- ✅ **热重载**：修改代码后自动重启（1-2秒）
- ✅ **快速迭代**：无需重新构建 Docker 镜像
- ✅ **详细日志**：直接在终端查看 debug 级别日志
- ✅ **便于调试**：可以使用 `console.log`、断点等

**修改代码流程：**
```bash
# 1. 启动开发服务器（在一个终端）
cd /home/wangjf/sipp-web-manager/backend
./start.sh

# 2. 修改代码（在另一个终端或编辑器）
vim src/services/injection-file-service.ts

# 3. 保存后自动重启（查看第一个终端输出）
# 显示: [nodemon] restarting due to changes...
# 显示: [nodemon] starting `node dist/index.js`

# 4. 测试 API
curl http://localhost:3000/api/injection-files
```

#### 常见问题

**Q: 提示端口 3000 被占用**
```bash
# 确保停止了 Docker 后端容器
docker-compose stop backend

# 或者杀死占用进程
lsof -ti:3000 | xargs -r kill -9
```

**Q: 数据库连接失败**
```bash
# 确保 MySQL 容器运行中
docker-compose ps mysql

# 启动 MySQL
docker-compose up -d mysql

# 测试连接
docker exec sipp-manager-mysql mysql -u sipp -psipp123456 sipp_manager -e "SHOW TABLES;"
```

**Q: TypeScript 编译错误**
```bash
# 重新安装依赖
cd /home/wangjf/sipp-web-manager/backend
rm -rf node_modules package-lock.json
npm install

# 手动构建一次
npm run build
```

---

### 场景 2：生产部署/完整测试

**使用 Docker Compose 完整部署**

#### 修改代码后重新部署
```bash
# 方式 A：仅重新构建后端
cd /home/wangjf/sipp-web-manager
docker-compose up -d --build backend

# 方式 B：完全重新构建（包括清理缓存）
docker-compose build --no-cache backend
docker-compose up -d backend

# 查看构建和启动日志
docker logs -f sipp-manager-backend
```

#### 快速验证
```bash
# 等待健康检查通过
docker-compose ps

# 测试 API
curl http://localhost:3000/api/health
curl http://localhost:3000/api/injection-files
```

---

## 📝 常见修改场景

### 1. 添加新的注入文件验证规则

**文件：** `backend/src/services/injection-file-service.ts`

```typescript
// 在 validateCsvContent 方法中添加新规则
validateCsvContent(content: string): ValidationResult {
  // ... 现有代码

  // 新增：检查字段长度
  for (let i = 0; i < dataLines.length; i++) {
    const fields = dataLines[i].split(';');
    if (fields[0].length > 20) {
      warnings.push(`第 ${i + 2} 行 field0 长度超过 20 字符`);
    }
  }

  return { valid, errors, warnings, metadata };
}
```

**测试：**
```bash
# 本地开发模式：保存即生效
# Docker 模式：docker-compose up -d --build backend

curl -X POST http://localhost:3000/api/injection-files/validate \
  -H "Content-Type: application/json" \
  -d '{"content":"SEQUENTIAL\nverylongusername1234567890;pass;ip"}'
```

---

### 2. 修改 SIPp 启动参数

**文件：** `backend/src/services/sipp-process.ts`

```typescript
// 在 start() 方法中修改参数构造
const args = [
  '-sf', scenarioPath,
  remoteHost + ':' + remotePort,
  '-r', rate.toString(),
  '-l', users.toString(),
  // 新增：添加自定义参数
  '-trace_err',           // 启用错误追踪
  '-trace_screen',        // 屏幕输出
  '-max_socket', '1000',  // 最大 socket 数
];
```

---

### 3. 添加新的 API 端点

**文件：** `backend/src/api/routes.ts`

```typescript
/**
 * 批量导入注入文件
 */
apiRouter.post('/injection-files/bulk-import', async (req: Request, res: Response): Promise<void> => {
  try {
    const { files } = req.body; // Array<{filename, content}>

    const results = [];
    for (const file of files) {
      const id = await injectionFileService.saveFile(file);
      results.push({ filename: file.filename, id });
    }

    res.json({ success: true, results });
  } catch (error: any) {
    logger.error('Bulk import failed:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});
```

**测试：**
```bash
curl -X POST http://localhost:3000/api/injection-files/bulk-import \
  -H "Content-Type: application/json" \
  -d '{
    "files": [
      {"filename": "batch1.csv", "content": "SEQUENTIAL\n..."},
      {"filename": "batch2.csv", "content": "SEQUENTIAL\n..."}
    ]
  }'
```

---

## 🔧 开发工具与技巧

### 使用 TypeScript 类型检查

```bash
cd /home/wangjf/sipp-web-manager/backend

# 仅检查类型（不构建）
npm run type-check

# 构建（编译 TypeScript）
npm run build
```

### 查看实时日志

```bash
# 本地开发模式：直接在终端查看

# Docker 模式：
docker logs -f sipp-manager-backend

# 过滤特定日志
docker logs sipp-manager-backend 2>&1 | grep "injection"
```

### 数据库操作

```bash
# 连接到 MySQL
docker exec -it sipp-manager-mysql mysql -u sipp -psipp123456 sipp_manager

# 执行 SQL 查询
docker exec sipp-manager-mysql mysql -u sipp -psipp123456 sipp_manager \
  -e "SELECT * FROM injection_files;"

# 备份数据库
docker exec sipp-manager-mysql mysqldump -u sipp -psipp123456 sipp_manager \
  > backup_$(date +%Y%m%d).sql

# 恢复数据库
docker exec -i sipp-manager-mysql mysql -u sipp -psipp123456 sipp_manager \
  < backup_20251219.sql
```

---

## 🚀 推荐开发工作流

### 日常开发流程

```bash
# 1. 启动 MySQL（如果未运行）
docker-compose up -d mysql

# 2. 启动本地开发服务器
cd /home/wangjf/sipp-web-manager/backend
./start.sh

# 3. 在另一个终端修改代码
# ... 编辑文件 ...

# 4. 自动重载生效，测试 API
curl http://localhost:3000/api/your-new-endpoint

# 5. 提交前测试 Docker 构建
docker-compose build backend

# 6. 完整测试
docker-compose up -d
curl http://localhost:3000/api/health
```

### 部署到生产

```bash
# 1. 停止开发服务器（Ctrl+C）

# 2. 完整 Docker 部署
cd /home/wangjf/sipp-web-manager
docker-compose down
docker-compose up -d --build

# 3. 验证健康状态
docker-compose ps
curl http://localhost:3000/api/health

# 4. 查看日志确认无错误
docker logs sipp-manager-backend --tail 100
```

---

## 🐛 调试技巧

### 1. 添加调试日志

```typescript
// backend/src/services/injection-file-service.ts
import { logger } from '../utils/logger';

validateCsvContent(content: string): ValidationResult {
  logger.debug('Validating CSV content', {
    length: content.length,
    lines: content.split('\n').length
  });

  // ... 验证逻辑

  logger.info('Validation completed', { valid, errorCount: errors.length });
  return { valid, errors, warnings, metadata };
}
```

### 2. 临时禁用功能

```typescript
// 快速禁用某个功能测试
if (options.injectionFile) {
  logger.warn('Injection file temporarily disabled for testing');
  // 注释掉相关逻辑
  // const injectionPath = ...
}
```

### 3. 使用断点（VS Code）

创建 `.vscode/launch.json`：
```json
{
  "version": "0.2.0",
  "configurations": [
    {
      "type": "node",
      "request": "launch",
      "name": "Debug Backend",
      "skipFiles": ["<node_internals>/**"],
      "program": "${workspaceFolder}/backend/src/index.ts",
      "preLaunchTask": "tsc: build",
      "outFiles": ["${workspaceFolder}/backend/dist/**/*.js"],
      "env": {
        "NODE_ENV": "development",
        "DB_HOST": "localhost"
      }
    }
  ]
}
```

---

## 📦 依赖管理

### 添加新依赖

```bash
cd /home/wangjf/sipp-web-manager/backend

# 生产依赖
npm install <package-name>

# 开发依赖
npm install -D <package-name>

# 示例：添加 CSV 解析库
npm install csv-parse
```

### 更新依赖

```bash
# 查看过期包
npm outdated

# 更新所有补丁版本
npm update

# 更新特定包
npm install <package-name>@latest
```

---

## ⚠️ 注意事项

1. **环境变量**：本地开发时使用 `start.sh` 中的配置，Docker 部署时使用 `docker-compose.yml` 中的环境变量

2. **数据库连接**：
   - 本地开发：`DB_HOST=localhost`
   - Docker 部署：`DB_HOST=mysql`（容器名）

3. **文件路径**：
   - 本地开发：相对路径 `../injections`
   - Docker 部署：绝对路径 `/app/injections`

4. **端口冲突**：确保本地开发时 Docker 后端容器已停止

5. **TypeScript 编译**：修改 `.ts` 文件后需要编译为 `.js`（开发模式自动）

---

## 📞 获取帮助

如遇到问题，按优先级检查：

1. **查看日志**：`./start.sh` 输出或 `docker logs sipp-manager-backend`
2. **验证数据库**：`docker exec sipp-manager-mysql mysql ...`
3. **检查端口**：`lsof -i:3000`
4. **重新安装**：`rm -rf node_modules && npm install`
5. **清理 Docker**：`docker-compose down -v && docker-compose up -d --build`
