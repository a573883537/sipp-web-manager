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
    
    # 从环境变量或.env文件读取数据库配置
    if [ -f "backend/.env" ]; then
        source <(grep -E '^(DB_HOST|DB_PORT|DB_USER|DB_PASSWORD|DB_NAME|DB_CONTAINER)=' backend/.env)
    fi
    
    DB_HOST="${DB_HOST:-localhost}"
    DB_PORT="${DB_PORT:-3306}"
    DB_USER="${DB_USER:-root}"
    DB_PASSWORD="${DB_PASSWORD:-}"
    DB_NAME="${DB_NAME:-sipp_manager}"
    DB_CONTAINER="${DB_CONTAINER:-}"
    
    print_info "Database config: ${DB_USER}@${DB_HOST}:${DB_PORT}/${DB_NAME}"
    
    # 检测使用哪种方式连接数据库
    MYSQL_CMD=""
    
    # 1. 如果指定了容器名称，使用 docker exec
    if [ -n "$DB_CONTAINER" ]; then
        print_info "Detected database container: $DB_CONTAINER"
        if ! command -v docker &> /dev/null; then
            print_error "Docker command not found"
            print_error "Please install Docker or set DB_CONTAINER to empty if not using Docker"
            exit 1
        fi
        
        # 检查容器是否运行
        if ! docker ps --format '{{.Names}}' | grep -q "^${DB_CONTAINER}$"; then
            print_error "Database container '$DB_CONTAINER' is not running"
            print_error "Please start the container: docker start $DB_CONTAINER"
            exit 1
        fi
        
        MYSQL_CMD="docker exec -i $DB_CONTAINER mysql -u$DB_USER ${DB_PASSWORD:+-p$DB_PASSWORD}"
        print_success "Database container is running"
        
    # 2. 否则使用本地 MySQL 客户端
    else
        if ! command -v mysql &> /dev/null; then
            print_error "MySQL client not found"
            print_error "Options:"
            print_error "  1. Install MySQL client: sudo apt-get install mysql-client-core-8.0"
            print_error "  2. Or set DB_CONTAINER=<container_name> in backend/.env to use Docker"
            exit 1
        fi
        
        MYSQL_CMD="mysql -h$DB_HOST -P$DB_PORT -u$DB_USER ${DB_PASSWORD:+-p$DB_PASSWORD}"
    fi
    
    # 尝试连接数据库 - 强制要求成功
    if ! $MYSQL_CMD -e "SELECT 1" > /dev/null 2>&1; then
        print_error "Cannot connect to MySQL server"
        print_error "Please check:"
        print_error "  1. Database service is running"
        if [ -n "$DB_CONTAINER" ]; then
            print_error "     Docker: docker ps | grep $DB_CONTAINER"
        else
            print_error "     Host: sudo systemctl status mysql"
        fi
        print_error "  2. Database credentials are correct (DB_USER, DB_PASSWORD)"
        print_error "  3. Host and port are correct (DB_HOST, DB_PORT)"
        exit 1
    fi
    print_success "MySQL connection OK"
    
    # 检查数据库是否存在 - 强制要求存在
    if ! $MYSQL_CMD -e "USE $DB_NAME" > /dev/null 2>&1; then
        print_error "Database '$DB_NAME' does not exist"
        print_error "Please initialize the database first:"
        if [ -n "$DB_CONTAINER" ]; then
            print_error "  Docker: export DB_CONTAINER=$DB_CONTAINER"
        fi
        print_error "  cd backend/database && ./init-db.sh"
        exit 1
    fi
    print_success "Database '$DB_NAME' exists"
    
    # 检查关键表 - 强制要求全部存在
    TABLES=("scenarios" "injection_files" "task_history" "config_templates")
    MISSING_TABLES=()
    
    for table in "${TABLES[@]}"; do
        if ! $MYSQL_CMD -D"$DB_NAME" -e "SHOW TABLES LIKE '$table'" 2>/dev/null | grep -q "$table"; then
            MISSING_TABLES+=("$table")
        fi
    done
    
    if [ ${#MISSING_TABLES[@]} -gt 0 ]; then
        print_error "Missing database tables: ${MISSING_TABLES[*]}"
        print_error "Please initialize the database:"
        if [ -n "$DB_CONTAINER" ]; then
            print_error "  export DB_CONTAINER=$DB_CONTAINER"
        fi
        print_error "  cd backend/database && ./init-db.sh"
        exit 1
    fi
    
    print_success "All required tables exist: ${TABLES[*]}"
    
    # 显示表统计信息
    print_info "Database statistics:"
    for table in "${TABLES[@]}"; do
        count=$($MYSQL_CMD -D"$DB_NAME" -sN -e "SELECT COUNT(*) FROM $table" 2>/dev/null || echo "0")
        echo "  $table: $count records"
    done
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
    npm install --include=dev
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

# Database (MySQL)
DB_HOST=localhost
DB_PORT=3306
DB_NAME=sipp_manager
DB_USER=root
DB_PASSWORD=
DB_POOL_SIZE=10

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
        print_warning "Please edit backend/.env for your environment (especially database credentials)"
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

    print_info "Step 1: Checking Node.js..."
    check_node
    
    print_info "Step 2: Creating directories..."
    create_dirs
    
    print_info "Step 3: Setting up environment..."
    setup_env
    
    print_info "Step 4: Checking database (REQUIRED)..."
    check_database
    
    print_info "Step 5: Building backend..."
    build_backend
    
    print_info "Step 6: Building frontend..."
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
