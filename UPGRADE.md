# SIPp Web Manager 升级指南

## 升级原则

- **零停机升级**：先升级从机，最后升级主机
- **数据库优先**：如有数据库变更，先执行迁移脚本
- **可回滚**：保留旧版本文件以便快速回滚

---

## 升级流程

### 1. 备份（必做）

```bash
# 备份数据库
mysqldump -u root -p sipp_manager > backup_$(date +%Y%m%d_%H%M%S).sql

# 备份后端代码
tar -czf backend_backup_$(date +%Y%m%d_%H%M%S).tar.gz backend/

# 备份前端代码（仅主机）
tar -czf frontend_backup_$(date +%Y%m%d_%H%M%S).tar.gz frontend/
```

### 2. 数据库升级（如有变更，仅主机执行）

```bash
# 检查是否有数据库迁移脚本
# 新版本如提供 upgrade-vX.X.X.sql，执行：
mysql -u root -p sipp_manager < upgrade-vX.X.X.sql
```

### 3. 升级从机节点（逐台升级）

```bash
# 在从机上执行：

# 1. 停止从机服务
cd /path/to/sipp-web-manager/backend
npm stop  # 或使用 pm2 stop/systemctl stop

# 2. 拉取新代码
cd /path/to/sipp-web-manager
git pull origin master

# 3. 安装依赖（如有变更）
cd backend
npm install --production

# 4. 编译后端
npm run build

# 5. 启动服务
npm start  # 或使用 pm2 restart/systemctl restart

# 6. 验证升级
# 检查日志确认从机已成功连接到主机
tail -f logs/app.log
```

### 4. 升级主机节点（最后执行）

```bash
# 在主机上执行：

# 1. 停止主机服务
cd /path/to/sipp-web-manager/backend
npm stop  # 或使用 pm2 stop/systemctl stop

# 2. 拉取新代码
cd /path/to/sipp-web-manager
git pull origin master

# 3. 安装依赖（如有变更）
# 后端依赖
cd backend
npm install --production

# 前端依赖
cd ../frontend
npm install

# 4. 构建前端
npm run build

# 5. 编译后端
cd ../backend
npm run build

# 6. 启动服务
npm start  # 或使用 pm2 restart/systemctl restart

# 7. 验证升级
# 访问 Web 界面确认功能正常
# 检查集群节点状态是否全部 online
```

---

## 回滚流程

### 快速回滚（代码层面）

```bash
# 1. 停止服务
npm stop

# 2. 回退代码版本
git reset --hard <上一个稳定版本的commit>

# 3. 恢复依赖和编译
cd backend
npm install --production
npm run build

cd ../frontend  # 仅主机需要
npm install
npm run build

# 4. 重启服务
cd ../backend
npm start
```

### 数据库回滚（如有变更）

```bash
# 恢复之前备份的数据库
mysql -u root -p sipp_manager < backup_20250123_120000.sql
```

---

## 版本兼容性

### v2.0.0 → v2.1.0+

- ✅ 主机与从机可独立升级
- ✅ 向后兼容旧版本从机（数据库字段保留但不使用）
- ⚠️ 建议保持主从版本一致以获得最佳体验

---

## 常见问题

### Q: 升级后从机无法连接到主机？

**A:** 检查以下项：
1. 从机 `.env` 文件中的 `MASTER_HOST` 和 `MASTER_PORT` 是否正确
2. 主机防火墙是否开放 3000 端口
3. 网络连通性：`curl http://<主机IP>:3000/health`

### Q: 升级后前端页面显示异常？

**A:** 清除浏览器缓存并强制刷新（Ctrl+Shift+R / Cmd+Shift+R）

### Q: 数据库迁移失败如何处理？

**A:**
```bash
# 1. 立即停止所有服务
# 2. 恢复备份的数据库
mysql -u root -p sipp_manager < backup_20250123_120000.sql
# 3. 联系技术支持分析失败原因
```

---

## 生产环境建议

1. **使用进程管理器**
   ```bash
   # 推荐使用 PM2 管理服务
   npm install -g pm2

   # 启动主机
   cd backend
   pm2 start dist/index.js --name sipp-manager-master

   # 启动从机
   cd backend
   pm2 start dist/index.js --name sipp-manager-slave

   # 开机自启
   pm2 startup
   pm2 save
   ```

2. **监控服务状态**
   ```bash
   # 查看进程状态
   pm2 status

   # 查看实时日志
   pm2 logs sipp-manager-master
   ```

3. **自动化升级脚本**（可选）
   ```bash
   # 创建 upgrade.sh 自动化升级流程
   # 包含：备份 → 拉代码 → 安装依赖 → 编译 → 重启
   ```

---

## 技术支持

- **问题反馈**：GitHub Issues
- **紧急联系**：维护团队邮箱/电话
