#!/bin/bash
# ========================================
# SIPp Web Manager - 从机节点部署脚本
# ========================================

set -e  # 遇到错误立即退出

# 颜色输出
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

# 打印函数
print_info() {
    echo -e "${GREEN}[INFO]${NC} $1"
}

print_warn() {
    echo -e "${YELLOW}[WARN]${NC} $1"
}

print_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

print_info "========================================"
print_info "SIPp Web Manager - 从机节点部署"
print_info "========================================"

# 1. 检查依赖
print_info "检查系统依赖..."

if ! command -v node &> /dev/null; then
    print_error "Node.js 未安装，请先安装 Node.js 18+"
    exit 1
fi

if ! command -v npm &> /dev/null; then
    print_error "npm 未安装，请先安装 npm"
    exit 1
fi

if ! command -v sipp &> /dev/null; then
    print_error "SIPp 未安装，请先安装 SIPp 工具"
    exit 1
fi

NODE_VERSION=$(node -v | cut -d'v' -f2 | cut -d'.' -f1)
if [ "$NODE_VERSION" -lt 18 ]; then
    print_error "Node.js 版本过低（当前: $NODE_VERSION, 需要: 18+）"
    exit 1
fi

print_info "✓ Node.js $(node -v)"
print_info "✓ npm $(npm -v)"
print_info "✓ SIPp $(sipp -v 2>&1 | head -n1)"

# 2. 检查配置文件
print_info "检查配置文件..."

if [ ! -f ".env" ]; then
    print_warn ".env 文件不存在"
    if [ -f ".env.slave.example" ]; then
        print_info "复制 .env.slave.example 到 .env"
        cp .env.slave.example .env
        print_warn "请编辑 .env 文件并配置以下信息："
        print_warn "  - MACHINE_ID: 从机唯一标识（如: slave-01）"
        print_warn "  - MACHINE_NAME: 从机显示名称（如: 测试节点01）"
        print_warn "  - MASTER_HOST: 主机 IP 地址"
        print_warn "  - DB_HOST: 主机数据库 IP 地址（通常与 MASTER_HOST 相同）"
        print_warn "  - DB_PASSWORD: 数据库密码"
        print_warn ""
        print_warn "配置完成后重新运行此脚本"
        exit 0
    else
        print_error ".env.slave.example 文件不存在"
        exit 1
    fi
fi

# 加载环境变量
export $(cat .env | grep -v '^#' | grep -v '^$' | xargs)

# 验证关键配置
if [ "$NODE_ROLE" != "slave" ]; then
    print_error "NODE_ROLE 必须设置为 'slave'"
    exit 1
fi

if [ -z "$MACHINE_ID" ] || [ "$MACHINE_ID" = "slave-hostname" ]; then
    print_error "请设置唯一的 MACHINE_ID（如: slave-01）"
    exit 1
fi

if [ -z "$MASTER_HOST" ] || [ "$MASTER_HOST" = "192.168.1.100" ]; then
    print_error "请配置正确的 MASTER_HOST（主机 IP 地址）"
    exit 1
fi

if [ -z "$DB_HOST" ] || [ "$DB_HOST" = "192.168.1.100" ]; then
    print_error "请配置正确的 DB_HOST（主机数据库 IP）"
    exit 1
fi

# 3. 测试数据库连接
print_info "测试数据库连接..."
if command -v mysql &> /dev/null; then
    if mysql -h"${DB_HOST}" -P"${DB_PORT:-3306}" -u"${DB_USER:-sipp}" -p"${DB_PASSWORD}" -e "SELECT 1" &> /dev/null; then
        print_info "✓ 数据库连接成功"
    else
        print_error "数据库连接失败，请检查："
        print_error "  - 主机数据库是否运行"
        print_error "  - 网络连接是否正常"
        print_error "  - 数据库用户权限（需要允许远程连接）"
        print_error "  - 防火墙规则（需要开放 3306 端口）"
        exit 1
    fi
else
    print_warn "MySQL 客户端未安装，跳过数据库连接测试"
fi

# 4. 测试主机 API 连接
print_info "测试主机 API 连接..."
if command -v curl &> /dev/null; then
    if curl -s -f "http://${MASTER_HOST}:${MASTER_PORT:-3000}/api/health" > /dev/null 2>&1; then
        print_info "✓ 主机 API 连接成功"
    else
        print_warn "无法连接到主机 API，请确保："
        print_warn "  - 主机服务已启动"
        print_warn "  - 网络连接正常"
        print_warn "  - 防火墙规则正确"
    fi
else
    print_warn "curl 未安装，跳过主机 API 连接测试"
fi

# 5. 安装后端依赖（从机不需要前端）
print_info "安装后端依赖..."
cd backend
rm -rf node_modules package-lock.json
npm install --include=dev
if [ $? -ne 0 ]; then
    print_error "后端依赖安装失败"
    exit 1
fi
cd ..

# 6. 构建后端
print_info "构建后端应用..."
cd backend
npm run build
if [ $? -ne 0 ]; then
    print_error "后端构建失败"
    exit 1
fi
cd ..

# 7. 创建必要的目录
print_info "创建必要的目录..."
mkdir -p scenarios
mkdir -p injections
mkdir -p logs

# 8. 创建 systemd 服务（可选）
if [ -z "$CREATE_SERVICE" ]; then
    print_info "是否创建 systemd 服务？(y/n)"
    read -r CREATE_SERVICE
fi

if [ "$CREATE_SERVICE" = "y" ] || [ "$CREATE_SERVICE" = "Y" ]; then
    INSTALL_DIR=$(pwd)
    SERVICE_FILE="/etc/systemd/system/sipp-web-manager-slave.service"

    print_info "创建 systemd 服务: $SERVICE_FILE"

    sudo tee "$SERVICE_FILE" > /dev/null <<EOF
[Unit]
Description=SIPp Web Manager (Slave Node - ${MACHINE_ID})
After=network.target

[Service]
Type=simple
User=$USER
WorkingDirectory=$INSTALL_DIR
Environment=NODE_ENV=production
ExecStart=/usr/bin/node $INSTALL_DIR/backend/dist/index.js
Restart=always
RestartSec=10
StandardOutput=journal
StandardError=journal

[Install]
WantedBy=multi-user.target
EOF

    sudo systemctl daemon-reload
    sudo systemctl enable sipp-web-manager-slave

    print_info "✓ systemd 服务创建完成"
    print_info "启动服务: sudo systemctl start sipp-web-manager-slave"
    print_info "查看状态: sudo systemctl status sipp-web-manager-slave"
    print_info "查看日志: sudo journalctl -u sipp-web-manager-slave -f"
fi

# 9. 完成
print_info ""
print_info "========================================"
print_info "部署完成！"
print_info "========================================"
print_info ""
print_info "从机配置信息："
print_info "  机器ID: ${MACHINE_ID}"
print_info "  机器名: ${MACHINE_NAME:-未设置}"
print_info "  主机地址: ${MASTER_HOST}:${MASTER_PORT:-3000}"
print_info ""
print_info "手动启动方式："
print_info "  cd backend && npm start"
print_info ""
print_info "启动后："
print_info "  - 从机将自动向主机注册"
print_info "  - 每 10 秒发送一次心跳"
print_info "  - 在主机管理页面可查看从机状态"
print_info ""
print_info "主机管理页面："
print_info "  http://${MASTER_HOST}:${MASTER_PORT:-3000}/machines"
print_info ""
