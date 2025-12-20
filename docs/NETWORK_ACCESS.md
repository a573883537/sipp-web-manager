# 局域网访问配置指南

## 🌐 已完成的配置

✅ 前端Vite监听 `0.0.0.0:5173`
✅ 后端Express监听 `0.0.0.0:3000`
✅ WebSocket动态连接（根据访问IP自动选择）
✅ CORS配置允许所有来源（开发环境）

## 📱 使用方法

### 1. 查看服务器IP地址

在服务器（运行SIPp Web Manager的机器）上执行：

```bash
# 方式1：查看所有IP
ip addr show | grep "inet " | grep -v 127.0.0.1

# 方式2：快速查看
hostname -I

# 方式3：查看特定网卡（例如eth0或wlan0）
ip addr show eth0 | grep "inet "
```

假设输出为：`192.168.1.100`

### 2. 访问地址

从局域网内其他设备（手机、平板、其他电脑）访问：

- **前端界面**: `http://192.168.1.100:5173`
- **后端API**: `http://192.168.1.100:3000/api`
- **健康检查**: `http://192.168.1.100:3000/health`

### 3. 验证连接

在其他设备的浏览器中：

1. 打开 `http://192.168.1.100:5173`
2. 查看右上角连接状态
3. 如果显示"已连接"且有绿色WiFi图标，说明配置成功

## 🔥 防火墙配置

如果无法访问，可能需要配置防火墙：

### Ubuntu/Debian (UFW)

```bash
# 允许前端端口
sudo ufw allow 5173/tcp

# 允许后端端口
sudo ufw allow 3000/tcp

# 查看防火墙状态
sudo ufw status
```

### CentOS/RHEL (firewalld)

```bash
# 允许前端端口
sudo firewall-cmd --permanent --add-port=5173/tcp

# 允许后端端口
sudo firewall-cmd --permanent --add-port=3000/tcp

# 重载防火墙
sudo firewall-cmd --reload

# 查看开放的端口
sudo firewall-cmd --list-ports
```

### iptables（直接配置）

```bash
# 允许前端端口
sudo iptables -A INPUT -p tcp --dport 5173 -j ACCEPT

# 允许后端端口
sudo iptables -A INPUT -p tcp --dport 3000 -j ACCEPT

# 保存规则
sudo iptables-save | sudo tee /etc/iptables/rules.v4
```

## 🐛 故障排查

### 问题1：页面打不开

**检查服务是否运行：**
```bash
# 检查前端
curl http://localhost:5173

# 检查后端
curl http://localhost:3000/health
```

**检查端口监听：**
```bash
# 查看端口是否在0.0.0.0上监听
netstat -tlnp | grep 5173
netstat -tlnp | grep 3000

# 或使用ss命令
ss -tlnp | grep 5173
```

应该看到类似：
```
tcp   0   0 0.0.0.0:5173   0.0.0.0:*   LISTEN   12345/node
tcp   0   0 0.0.0.0:3000   0.0.0.0:*   LISTEN   12346/node
```

### 问题2：WebSocket连接失败

**在浏览器控制台检查：**
1. 按F12打开开发者工具
2. 切换到Network标签
3. 筛选WS（WebSocket）
4. 查看WebSocket连接状态

**常见原因：**
- 防火墙阻止了3000端口
- CORS配置不正确
- 后端服务未启动

### 问题3：API请求失败

**检查CORS配置：**
```bash
# 查看当前CORS配置
cat /home/wangjf/sipp-web-manager/backend/.env | grep CORS
```

应该看到：
```
WS_CORS_ORIGIN=*
```

**测试API访问：**
```bash
# 从其他设备测试（替换为实际IP）
curl http://192.168.1.100:3000/health
```

### 问题4：防火墙测试

**从其他设备测试端口连通性：**
```bash
# 测试前端端口
telnet 192.168.1.100 5173

# 测试后端端口
telnet 192.168.1.100 3000

# 或使用nc命令
nc -zv 192.168.1.100 5173
nc -zv 192.168.1.100 3000
```

## 🔒 安全建议

### 开发环境

当前配置适用于开发环境，允许所有来源访问。

### 生产环境

在生产环境部署时，建议：

1. **配置特定的CORS来源**
   ```env
   # backend/.env
   WS_CORS_ORIGIN=http://your-domain.com,http://192.168.1.100:5173
   ```

2. **使用Nginx反向代理**
   ```nginx
   server {
       listen 80;
       server_name your-domain.com;

       location / {
           proxy_pass http://localhost:5173;
       }

       location /api {
           proxy_pass http://localhost:3000;
       }

       location /socket.io {
           proxy_pass http://localhost:3000;
           proxy_http_version 1.1;
           proxy_set_header Upgrade $http_upgrade;
           proxy_set_header Connection "upgrade";
       }
   }
   ```

3. **启用HTTPS**
   ```bash
   # 使用Let's Encrypt
   sudo certbot --nginx -d your-domain.com
   ```

4. **配置防火墙只允许必要端口**
   ```bash
   # 只允许HTTP/HTTPS
   sudo ufw allow 80/tcp
   sudo ufw allow 443/tcp

   # 拒绝直接访问内部端口
   sudo ufw deny 3000/tcp
   sudo ufw deny 5173/tcp
   ```

## 📱 移动设备访问建议

### 方式1：直接IP访问
- 适用于开发测试
- 需要确保设备在同一局域网

### 方式2：使用内网域名
```bash
# 在服务器上安装dnsmasq
sudo apt install dnsmasq

# 配置本地域名
echo "address=/sipp-manager.local/192.168.1.100" | sudo tee -a /etc/dnsmasq.conf
sudo systemctl restart dnsmasq

# 在移动设备上设置DNS为服务器IP
# 然后就可以访问: http://sipp-manager.local:5173
```

### 方式3：使用ngrok（外网访问）
```bash
# 安装ngrok
npm install -g ngrok

# 暴露前端端口
ngrok http 5173

# 会得到一个公网URL，例如：
# https://abc123.ngrok.io
```

## 🌟 快速测试脚本

创建测试脚本：

```bash
#!/bin/bash
# network-test.sh

echo "=== SIPp Web Manager 网络测试 ==="
echo ""

# 获取本机IP
IP=$(hostname -I | awk '{print $1}')
echo "服务器IP: $IP"
echo ""

# 测试端口
echo "测试端口监听状态..."
if netstat -tln | grep -q ":5173"; then
    echo "✅ 前端端口 5173 正在监听"
else
    echo "❌ 前端端口 5173 未监听"
fi

if netstat -tln | grep -q ":3000"; then
    echo "✅ 后端端口 3000 正在监听"
else
    echo "❌ 后端端口 3000 未监听"
fi

echo ""
echo "访问地址："
echo "  前端: http://$IP:5173"
echo "  后端: http://$IP:3000/api"
echo ""
echo "从其他设备测试："
echo "  curl http://$IP:3000/health"
```

使用方法：
```bash
chmod +x network-test.sh
./network-test.sh
```

## 📞 获取帮助

如果遇到问题：
1. 检查上述故障排查步骤
2. 查看服务日志：`docker-compose logs -f` 或直接查看终端输出
3. 提交Issue到GitHub仓库
