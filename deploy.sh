#!/bin/bash

# SIPp Web Manager 部署脚本
# 用于生产环境部署

set -e

# 颜色定义
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

print_info() { echo -e "${BLUE}[INFO]${NC} $1"; }
print_success() { echo -e "${GREEN}[SUCCESS]${NC} $1"; }
print_warning() { echo -e "${YELLOW}[WARNING]${NC} $1"; }
print_error() { echo -e "${RED}[ERROR]${NC} $1"; }

# 获取脚本所在目录
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

# 检查 Node.js
check_node() {
    if ! command -v node &> /dev/null; then
        print_error "Node.js not found. Please install Node.js 18+"
        exit 1
    fi
    node_version=$(node --version | cut -d'v' -f2 | cut -d'.' -f1)
    if [ "$node_version" -lt 18 ]; then
        print_error "Node.js version too low. Required: 18+"
        exit 1
    fi
    print_success "Node.js $(node --version)"
}

# 检查数据库
check_database() {
    print_info "Checking database..."
    
    # 检查MySQL是否安装
    if ! command -v mysql &> /dev/null; then
        print_warning "MySQL client not found, skipping database check"
        print_warning "Please ensure MySQL server is running and database is initialized"
        return 0
    fi
    
    # 尝试连接数据库
    DB_HOST="${DB_HOST:-localhost}"
    DB_PORT="${DB_PORT:-3306}"
    DB_USER="${DB_USER:-root}"
    DB_PASSWORD="${DB_PASSWORD:-}"
    DB_NAME="${DB_NAME:-sipp_manager}"
    
    if mysql -h"$DB_HOST" -P"$DB_PORT" -u"$DB_USER" -p"$DB_PASSWORD" -e "SELECT 1" > /dev/null 2>&1; then
        print_success "MySQL connection OK"
        
        # 检查数据库是否存在
        if mysql -h"$DB_HOST" -P"$DB_PORT" -u"$DB_USER" -p"$DB_PASSWORD" -e "USE $DB_NAME" > /dev/null 2>&1; then
            print_success "Database '$DB_NAME' exists"
            
            # 检查关键表
            TABLES=("scenarios" "injection_files" "task_history" "config_templates")
            ALL_EXISTS=true
            for table in "${TABLES[@]}"; do
                if ! mysql -h"$DB_HOST" -P"$DB_PORT" -u"$DB_USER" -p"$DB_PASSWORD" -D"$DB_NAME" -e "SHOW TABLES LIKE '$table'" 2>/dev/null | grep -q "$table"; then
                    print_warning "Table '$table' not found"
                    ALL_EXISTS=false
                fi
            done
            
            if [ "$ALL_EXISTS" = false ]; then
                print_warning "Some database tables are missing"
                print_warning "Run: cd backend/database && ./init-db.sh"
            else
                print_success "All database tables exist"
            fi
        else
            print_warning "Database '$DB_NAME' not found"
            print_warning "Run: cd backend/database && ./init-db.sh"
        fi
    else
        print_warning "Cannot connect to MySQL"
        print_warning "Please ensure MySQL is running and credentials are correct"
        print_warning "Set environment variables: DB_HOST, DB_PORT, DB_USER, DB_PASSWORD"
    fi
}

# 构建后端
build_backend() {
    print_info "Building backend..."
    cd backend
    npm install --production=false
    npm run build
    cd ..
    print_success "Backend built"
}

# 构建前端
build_frontend() {
    print_info "Building frontend..."
    cd frontend
    npm install
    npm run build
    cd ..
    print_success "Frontend built"
}

# 创建目录
create_dirs() {
    print_info "Creating directories..."
    mkdir -p scenarios injections logs data
    chmod 755 scenarios injections logs data
    print_success "Directories created"
}

# 配置环境
setup_env() {
    if [ ! -f "backend/.env" ]; then
        print_info "Creating backend/.env..."
        cat > backend/.env << 'EOF'
# Server
PORT=3000
NODE_ENV=production

# SIPp
SIPP_PATH=sipp
SIPP_HOST=localhost
SIPP_CONTROL_PORT=8888
SIPP_SCENARIO_DIR=../scenarios
SIPP_INJECTION_DIR=../injections
SIPP_LOG_DIR=../logs

# WebSocket
WS_CORS_ORIGIN=*

# Logging
LOG_LEVEL=info
LOG_FILE=./logs/app.log
EOF
        print_warning "Please edit backend/.env for your environment"
    fi

    if [ ! -f "frontend/.env" ]; then
        print_info "Creating frontend/.env..."
        cat > frontend/.env << 'EOF'
VITE_API_BASE_URL=/api
VITE_WS_PORT=3000
VITE_DEFAULT_REMOTE_HOST=127.0.0.1
VITE_DEFAULT_REMOTE_PORT=5060
VITE_DEFAULT_LOCAL_PORT=5061
EOF
    fi
}

# 启动服务
start_service() {
    print_info "Starting backend service..."
    cd backend

    if command -v pm2 &> /dev/null; then
        pm2 delete sipp-backend 2>/dev/null || true
        pm2 start dist/index.js --name sipp-backend
        print_success "Backend started with PM2"
    else
        print_warning "PM2 not found. Starting with node..."
        node dist/index.js &
        print_success "Backend started (PID: $!)"
    fi

    cd ..
}

# 显示信息
show_info() {
    echo ""
    echo "╔═══════════════════════════════════════════════════════════╗"
    echo "║              SIPp Web Manager Deployed                    ║"
    echo "╠═══════════════════════════════════════════════════════════╣"
    echo "║                                                           ║"
    echo "║  Backend API:  http://localhost:3000/api                  ║"
    echo "║  Frontend:     ./frontend/dist (serve with nginx)         ║"
    echo "║                                                           ║"
    echo "║  See DEPLOY.md for nginx configuration                    ║"
    echo "║                                                           ║"
    echo "╚═══════════════════════════════════════════════════════════╝"
    echo ""
}

# 主函数
main() {
    echo "╔═══════════════════════════════════════════════════════════╗"
    echo "║           SIPp Web Manager - Deploy Script                ║"
    echo "╚═══════════════════════════════════════════════════════════╝"
    echo ""

    check_node
    check_database
    create_dirs
    setup_env
    build_backend
    build_frontend

    echo ""
    read -p "Start backend service now? [y/N] " -n 1 -r
    echo ""
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        start_service
    fi

    show_info
}

# 执行
main "$@"
