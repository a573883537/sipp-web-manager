# SIPp 注入文件功能 - 快速开始

## ✅ 部署完成确认

### 服务状态
```bash
docker-compose ps
# 应显示:
# - sipp-manager-mysql (Up)
# - sipp-manager-backend (Up)
```

### API 测试
```bash
# 健康检查
curl http://localhost:3000/api/health | jq

# 列出注入文件
curl http://localhost:3000/api/injection-files | jq
```

---

## 📋 示例场景：10个分机注册测试

### 步骤 1：创建 REGISTER 场景

```bash
cat > /home/wangjf/sipp-web-manager/scenarios/register.xml << 'EOF'
<?xml version="1.0" encoding="ISO-8859-1" ?>
<scenario name="Basic REGISTER with Authentication">
  <!-- 发送初始 REGISTER -->
  <send retrans="500">
    <![CDATA[
      REGISTER sip:[field2]:5060 SIP/2.0
      Via: SIP/2.0/[transport] [local_ip]:[local_port];branch=[branch]
      From: <sip:[field0]@[field2]>;tag=[pid]SIPpTag[call_number]
      To: <sip:[field0]@[field2]>
      Call-ID: [call_id]
      CSeq: 1 REGISTER
      Contact: <sip:[field0]@[local_ip]:[local_port]>
      Expires: 3600
      Content-Length: 0
    ]]>
  </send>

  <!-- 接收 401 Unauthorized -->
  <recv response="401" auth="true" optional="true"/>

  <!-- 发送带认证的 REGISTER -->
  <send retrans="500">
    <![CDATA[
      REGISTER sip:[field2]:5060 SIP/2.0
      Via: SIP/2.0/[transport] [local_ip]:[local_port];branch=[branch]
      From: <sip:[field0]@[field2]>;tag=[pid]SIPpTag[call_number]
      To: <sip:[field0]@[field2]>
      Call-ID: [call_id]
      CSeq: 2 REGISTER
      Contact: <sip:[field0]@[local_ip]:[local_port]>
      Expires: 3600
      [authentication username=[field0] password=[field1]]
      Content-Length: 0
    ]]>
  </send>

  <!-- 接收 200 OK -->
  <recv response="200" />

  <!-- 保持注册 5 分钟 -->
  <pause milliseconds="300000" />
</scenario>
EOF
```

### 步骤 2：修改注入文件（根据你的环境）

编辑 `/home/wangjf/sipp-web-manager/injections/users_4000-4010.csv`：

```csv
SEQUENTIAL
# [field0];[field1];[field2]
4000;your_password;YOUR_PBX_IP
4001;your_password;YOUR_PBX_IP
4002;your_password;YOUR_PBX_IP
4003;your_password;YOUR_PBX_IP
4004;your_password;YOUR_PBX_IP
4005;your_password;YOUR_PBX_IP
4006;your_password;YOUR_PBX_IP
4007;your_password;YOUR_PBX_IP
4008;your_password;YOUR_PBX_IP
4009;your_password;YOUR_PBX_IP
4010;your_password;YOUR_PBX_IP
```

### 步骤 3：通过 API 更新注入文件

```bash
curl -X POST http://localhost:3000/api/injection-files \
  -H "Content-Type: application/json" \
  -d '{
    "filename": "users_4000-4010.csv",
    "description": "我的10个测试分机",
    "content": "SEQUENTIAL\n# [field0];[field1];[field2]\n4000;mypass;192.168.1.100\n4001;mypass;192.168.1.100\n4002;mypass;192.168.1.100\n4003;mypass;192.168.1.100\n4004;mypass;192.168.1.100\n4005;mypass;192.168.1.100\n4006;mypass;192.168.1.100\n4007;mypass;192.168.1.100\n4008;mypass;192.168.1.100\n4009;mypass;192.168.1.100\n4010;mypass;192.168.1.100"
  }'
```

### 步骤 4：启动测试

```bash
curl -X POST http://localhost:3000/api/sipp/start \
  -H "Content-Type: application/json" \
  -d '{
    "scenarioFile": "register.xml",
    "injectionFile": "users_4000-4010.csv",
    "rate": 1,
    "users": 10,
    "limit": 10,
    "remoteHost": "YOUR_PBX_IP",
    "remotePort": 5060,
    "localPort": 5061,
    "transport": "udp"
  }'
```

### 步骤 5：监控日志

```bash
# 查看后端日志
docker logs -f sipp-manager-backend

# 查看 SIPp 统计
tail -f /home/wangjf/sipp-web-manager/data/sipp_stats.csv

# 在 PBX 上验证注册
# Asterisk: asterisk -rx "sip show peers"
# FreeSWITCH: fs_cli -x "sofia status profile internal reg"
```

---

## 🔧 常用 API 命令

### 管理注入文件

```bash
# 列出所有注入文件
curl http://localhost:3000/api/injection-files | jq

# 获取文件详情
curl http://localhost:3000/api/injection-files/users_4000-4010.csv | jq

# 删除注入文件
curl -X DELETE http://localhost:3000/api/injection-files/old_file.csv

# 验证 CSV 格式
curl -X POST http://localhost:3000/api/injection-files/validate \
  -H "Content-Type: application/json" \
  -d '{"content":"SEQUENTIAL\n1001;pass;10.0.0.1"}' | jq
```

### 控制 SIPp 测试

```bash
# 停止测试
curl -X POST http://localhost:3000/api/sipp/stop \
  -H "Content-Type: application/json" \
  -d '{"force": false}'

# 强制停止
curl -X POST http://localhost:3000/api/sipp/stop \
  -H "Content-Type: application/json" \
  -d '{"force": true}'

# 查看进程状态
curl http://localhost:3000/api/sipp/process-status | jq
```

---

## 📊 字段映射说明

在场景文件中使用注入文件字段：

| CSV 字段 | 场景引用 | 示例值 |
|---------|---------|-------|
| 第1列 | `[field0]` | 4000 (分机号) |
| 第2列 | `[field1]` | password4000 (密码) |
| 第3列 | `[field2]` | 192.168.1.100 (服务器IP) |
| 第N列 | `[fieldN-1]` | ... |

---

## 🐛 故障排查

### 问题1：注入文件未找到
```bash
# 检查文件是否存在
ls -la /home/wangjf/sipp-web-manager/injections/

# 检查数据库记录
docker exec sipp-manager-mysql mysql -u root -psipp123456 sipp_manager \
  -e "SELECT filename FROM injection_files;"

# 同步文件系统到数据库
curl -X POST http://localhost:3000/api/injection-files \
  -H "Content-Type: application/json" \
  -d @- <<EOF
{
  "filename": "users_4000-4010.csv",
  "content": "$(cat /home/wangjf/sipp-web-manager/injections/users_4000-4010.csv)"
}
EOF
```

### 问题2：SIPp 启动失败
```bash
# 查看后端日志
docker logs sipp-manager-backend --tail 50

# 验证 SIPp 二进制
ls -lh /home/wangjf/sipp/sipp

# 检查容器卷映射
docker inspect sipp-manager-backend | grep -A 5 Mounts
```

### 问题3：CSV 格式错误
```bash
# 在线验证
curl -X POST http://localhost:3000/api/injection-files/validate \
  -H "Content-Type: application/json" \
  -d '{"content":"YOUR_CSV_CONTENT_HERE"}' | jq '.validation'

# 常见错误:
# - 第一行不是 SEQUENTIAL/RANDOM/USER
# - 字段数量不一致（检查分号数量）
# - 包含空行
```

---

## 📚 下一步

1. **前端界面**：参考 [INJECTION_FILES_GUIDE.md](INJECTION_FILES_GUIDE.md) 创建前端管理页面
2. **自定义场景**：修改 `scenarios/` 下的 XML 文件
3. **批量导入**：使用脚本批量创建注入文件
4. **监控告警**：集成实时统计和告警功能

---

## 📞 支持

- 完整文档：[INJECTION_FILES_GUIDE.md](INJECTION_FILES_GUIDE.md)
- SIPp 官方文档：http://sipp.sourceforge.net/doc/reference.html
- 问题反馈：检查 `/home/wangjf/sipp-web-manager/backend/logs/`
