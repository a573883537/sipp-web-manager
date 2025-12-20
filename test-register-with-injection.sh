#!/bin/bash
# 测试场景文件与注入文件配合使用的完整示例

echo "========================================="
echo "测试：使用 register_with_auth.xml + reg2188.csv"
echo "========================================="

curl -X POST http://localhost:3000/api/sipp/start \
  -H "Content-Type: application/json" \
  -d '{
    "scenarioFile": "register_with_auth.xml",
    "injectionFile": "reg2188.csv",
    "rate": 1,
    "users": 2,
    "limit": 2,
    "remoteHost": "192.168.21.88",
    "remotePort": 5060,
    "localPort": 5070,
    "transport": "udp",
    "minRtpPort": 6000,
    "maxRtpPort": 6100,
    "enableRtpEcho": true,
    "timeout": 120000
  }'

echo ""
echo ""
echo "========================================="
echo "执行说明："
echo "1. 场景文件: register_with_auth.xml"
echo "2. 注入文件: reg2188.csv (包含 4020, 4021 两个分机)"
echo "3. 执行流程:"
echo "   - 分机 4020 → REGISTER → 401 → 认证 REGISTER → 200 OK"
echo "   - 分机 4021 → REGISTER → 401 → 认证 REGISTER → 200 OK"
echo "   - 保持注册 60 秒"
echo "   - 注销 (Expires=0)"
echo "4. 并发用户数: 2 (对应 CSV 的 2 行数据)"
echo "5. 呼叫速率: 1 calls/sec"
echo "6. 呼叫限制: 2 (总共执行 2 次注册流程)"
echo "========================================="
