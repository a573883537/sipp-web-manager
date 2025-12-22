#!/bin/bash
# ========================================
# SIPp Web Manager - 主机节点部署脚本
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
print_info "SIPp Web Manager - 主机节点部署"
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

NODE_VERSION=$(node -v | cut -d'v' -f2 | cut -d'.' -f1)
if [ "$NODE_VERSION" -lt 18 ]; then
    print_error "Node.js 版本过低（当前: $NODE_VERSION, 需要: 18+）"
    exit 1
fi

if command -v mysql &> /dev/null; then
    print_info "✓ MySQL 客户端可用"
else
    print_warn "MySQL 客户端未安装，跳过数据库初始化（请手动执行）"
fi

print_info "✓ Node.js $(node -v)"
print_info "✓ npm $(npm -v)"

# 2. 检查配置文件
print_info "检查配置文件..."

if [ ! -f ".env" ]; then
    print_warn ".env 文件不存在"
    if [ -f ".env.example" ]; then
        print_info "复制 .env.example 到 .env"
        cp .env.example .env
        print_warn "请编辑 .env 文件并配置数据库等信息"
        print_warn "配置完成后重新运行此脚本"
        exit 0
    else
        print_error ".env.example 文件不存在"
        exit 1
    fi
fi

# 加载环境变量
export $(cat .env | grep -v '^#' | grep -v '^$' | xargs)

# 验证关键配置
if [ "$NODE_ROLE" != "master" ]; then
    print_error "NODE_ROLE 必须设置为 'master'"
    exit 1
fi

# 3. 安装后端依赖
print_info "安装后端依赖..."
cd backend
npm install --include=dev
if [ $? -ne 0 ]; then
    print_error "后端依赖安装失败"
    exit 1
fi
print_info "构建后端应用..."
npm run build
if [ $? -ne 0 ]; then
    print_error "后端构建失败"
    exit 1
fi
cd ..

# 4. 安装前端依赖
print_info "安装前端依赖..."
cd frontend
npm install --include=dev
if [ $? -ne 0 ]; then
    print_error "前端依赖安装失败"
    exit 1
fi
print_info "构建前端应用..."
npm run build
if [ $? -ne 0 ]; then
    print_error "前端构建失败"
    exit 1
fi
cd ..

# 7. 创建必要的目录
print_info "创建必要的目录..."
mkdir -p scenarios
mkdir -p injections
mkdir -p logs

# 8. 数据库初始化
if [ "$SKIP_DB" != "true" ] && command -v mysql &> /dev/null; then
    print_info "测试数据库连接..."

    if mysql -h"${DB_HOST:-localhost}" -P"${DB_PORT:-3306}" -u"${DB_USER:-root}" -p"${DB_PASSWORD}" -e "SELECT 1" &> /dev/null; then
        print_info "✓ 数据库连接成功"

        # 检查数据库是否存在
        DB_EXISTS=$(mysql -h"${DB_HOST:-localhost}" -P"${DB_PORT:-3306}" -u"${DB_USER:-root}" -p"${DB_PASSWORD}" -e "SHOW DATABASES LIKE '${DB_NAME:-sipp_manager}';" 2>/dev/null | wc -l)

        if [ "$DB_EXISTS" -eq 0 ]; then
            print_info "创建数据库: ${DB_NAME:-sipp_manager}"
            mysql -h"${DB_HOST:-localhost}" -P"${DB_PORT:-3306}" -u"${DB_USER:-root}" -p"${DB_PASSWORD}" -e "CREATE DATABASE IF NOT EXISTS ${DB_NAME:-sipp_manager} CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;"
        fi

        # 初始化表结构
        print_info "初始化数据库表结构..."
        mysql -h"${DB_HOST:-localhost}" -P"${DB_PORT:-3306}" -u"${DB_USER:-root}" -p"${DB_PASSWORD}" "${DB_NAME:-sipp_manager}" < backend/database/schema.mysql.sql 2>/dev/null || true
        mysql -h"${DB_HOST:-localhost}" -P"${DB_PORT:-3306}" -u"${DB_USER:-root}" -p"${DB_PASSWORD}" "${DB_NAME:-sipp_manager}" < backend/database/migrations/002_add_cluster_support.sql 2>/dev/null || true

        print_info "✓ 数据库初始化完成"
    else
        print_warn "无法连接到数据库，请手动执行："
        print_warn "  mysql -u root -p ${DB_NAME:-sipp_manager} < backend/database/schema.mysql.sql"
        print_warn "  mysql -u root -p ${DB_NAME:-sipp_manager} < backend/database/migrations/002_add_cluster_support.sql"
    fi
fi

# 9. 创建 systemd 服务（可选）
if [ -z "$CREATE_SERVICE" ]; then
    print_info "是否创建 systemd 服务？(y/n)"
    read -r CREATE_SERVICE
fi

if [ "$CREATE_SERVICE" = "y" ] || [ "$CREATE_SERVICE" = "Y" ]; then
    INSTALL_DIR=$(pwd)
    SERVICE_FILE="/etc/systemd/system/sipp-web-manager.service"

    print_info "创建 systemd 服务: $SERVICE_FILE"

    sudo tee "$SERVICE_FILE" > /dev/null <<EOF
[Unit]
Description=SIPp Web Manager (Master Node)
After=network.target mysql.service

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
    sudo systemctl enable sipp-web-manager

    print_info "✓ systemd 服务创建完成"
    print_info "启动服务: sudo systemctl start sipp-web-manager"
    print_info "查看状态: sudo systemctl status sipp-web-manager"
    print_info "查看日志: sudo journalctl -u sipp-web-manager -f"
fi

# 10. 完成
print_info ""
print_info "========================================"
print_info "部署完成！"
print_info "========================================"
print_info ""
print_info "主机配置信息："
print_info "  机器ID: ${MACHINE_ID:-master}"
print_info "  机器名: ${MACHINE_NAME:-主控节点}"
print_info "  服务端口: ${PORT:-3000}"
print_info ""
print_info "手动启动方式："
print_info "  cd backend && npm start"
print_info ""
print_info "访问地址："
print_info "  http://localhost:${PORT:-3000}"
print_info ""
print_info "注意事项："
print_info "  - 确保 MySQL 数据库已启动"
print_info "  - 确保防火墙已开放 ${PORT:-3000} 端口"
print_info "  - 从机需配置 MASTER_HOST 指向本机 IP"
print_info ""
