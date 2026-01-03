#!/bin/bash
# ============================================
# SIPp Web Manager - 部署脚本
# ============================================
# 用途：主机(Master)和从机(Slave)通用部署脚本
# 版本：2.0.0
# 日期：2025-01-23
#
# 使用方法：
#   主机部署：./deploy.sh master
#   从机部署：./deploy.sh slave <MASTER_IP>
# ============================================

set -e  # 遇到错误立即退出

# 颜色定义
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# 打印函数
print_step() { echo -e "${BLUE}==>${NC} $1"; }
print_success() { echo -e "${GREEN}✓${NC} $1"; }
print_error() { echo -e "${RED}✗${NC} $1"; }
print_warning() { echo -e "${YELLOW}⚠${NC} $1"; }

# ============================================
# 1. 参数解析
# ============================================
NODE_ROLE=${1:-}
MASTER_IP=${2:-}

if [[ -z "$NODE_ROLE" ]]; then
    print_error "缺少参数！"
    echo ""
    echo "用法："
    echo "  主机部署: $0 master"
    echo "  从机部署: $0 slave <MASTER_IP>"
    echo ""
    echo "示例："
    echo "  $0 master                  # 部署主控节点"
    echo "  $0 slave 192.168.1.100     # 部署从机，连接到 192.168.1.100"
    exit 1
fi

if [[ "$NODE_ROLE" != "master" && "$NODE_ROLE" != "slave" ]]; then
    print_error "节点角色必须是 master 或 slave"
    exit 1
fi

if [[ "$NODE_ROLE" == "slave" && -z "$MASTER_IP" ]]; then
    print_error "从机部署必须指定主机IP地址"
    echo "用法: $0 slave <MASTER_IP>"
    exit 1
fi

print_step "开始部署 SIPp Web Manager ($NODE_ROLE 节点)"
echo ""

# ============================================
# 2. 环境检查
# ============================================
print_step "检查系统环境..."

# 检查 Node.js 和 npm
for cmd in node npm sipp; do
    if ! command -v $cmd &> /dev/null; then
        print_error "缺少必备命令: $cmd"
        exit 1
    fi
done

# 检查 MySQL（主机和从机检查逻辑不同）
MYSQL_CMD=""

if [[ "$NODE_ROLE" == "master" ]]; then
    # 主机：检查本地 MySQL 或 Docker 容器
    if command -v mysql &> /dev/null; then
        MYSQL_CMD="mysql"
        print_success "检测到本地 MySQL"
    elif command -v docker &> /dev/null; then
        # 尝试检测常见的 MySQL Docker 容器
        for container in mysql mysql-server sipp-mysql db; do
            if docker ps --format '{{.Names}}' 2>/dev/null | grep -qw "$container"; then
                if docker exec "$container" mysql --version &>/dev/null; then
                    MYSQL_CMD="docker exec -i $container mysql"
                    print_success "检测到 Docker MySQL 容器: $container"
                    break
                fi
            fi
        done

        if [[ -z "$MYSQL_CMD" ]]; then
            print_warning "未检测到 MySQL（本地或 Docker）"
            print_warning "如果使用 Docker，请确保容器名为: mysql, mysql-server, sipp-mysql 或 db"
            read -p "是否继续部署？(y/N) " -n 1 -r
            echo
            if [[ ! $REPLY =~ ^[Yy]$ ]]; then
                exit 1
            fi
        fi
    else
        print_error "未检测到 MySQL（需要本地安装或 Docker）"
        exit 1
    fi
else
    # 从机：仅检查 mysql 客户端是否存在（用于连接主机 MySQL）
    if command -v mysql &> /dev/null; then
        print_success "检测到 MySQL 客户端（用于连接主机数据库）"
    else
        print_error "缺少 MySQL 客户端，从机需要 mysql 命令连接主机数据库"
        print_warning "安装方法："
        echo "  Ubuntu/Debian: sudo apt-get install mysql-client"
        echo "  CentOS/RHEL:   sudo yum install mysql"
        exit 1
    fi
fi

print_success "系统环境检查通过"

# ============================================
# 3. 安装依赖
# ============================================
print_step "安装后端依赖..."
cd backend
npm install
print_success "后端依赖安装完成"

if [[ "$NODE_ROLE" == "master" ]]; then
    print_step "安装前端依赖..."
    cd ../frontend
    npm install
    print_success "前端依赖安装完成"
    cd ..
else
    print_warning "从机模式，跳过前端依赖安装"
    cd ..
fi

# ============================================
# 4. 数据库初始化（仅主机）
# ============================================
if [[ "$NODE_ROLE" == "master" ]]; then
    print_step "初始化数据库..."

    # 读取数据库配置（优先环境变量，否则使用默认值）
    DB_HOST=${DB_HOST:-localhost}
    DB_PORT=${DB_PORT:-3306}
    DB_USER=${DB_USER:-root}
    DB_PASSWORD=${DB_PASSWORD:-}
    DB_NAME=${DB_NAME:-sipp_manager}

    # 检查 MySQL 连接
    if [[ -n "$MYSQL_CMD" ]]; then
        if [[ "$MYSQL_CMD" =~ ^docker ]]; then
            # Docker 模式：直接使用容器内连接
            if ! $MYSQL_CMD -e "SELECT 1;" &>/dev/null; then
                print_error "无法连接到 Docker MySQL 容器"
                print_warning "请检查容器是否正常运行"
                exit 1
            fi
            # 执行初始化 SQL
            $MYSQL_CMD < backend/database/init.sql
        else
            # 本地模式：使用完整连接参数
            if ! mysql -h"$DB_HOST" -P"$DB_PORT" -u"$DB_USER" -p"$DB_PASSWORD" -e "SELECT 1;" &>/dev/null; then
                print_error "无法连接到MySQL数据库 ($DB_HOST:$DB_PORT)"
                print_warning "请检查：1) MySQL是否运行  2) 用户名密码是否正确"
                exit 1
            fi
            # 执行初始化 SQL
            mysql -h"$DB_HOST" -P"$DB_PORT" -u"$DB_USER" -p"$DB_PASSWORD" < backend/database/init.sql
        fi
        print_success "数据库初始化完成"
    else
        print_warning "跳过数据库初始化（未检测到 MySQL）"
    fi
else
    print_warning "从机模式，跳过数据库初始化"
fi

# ============================================
# 5. 创建配置文件
# ============================================
print_step "生成配置文件..."

if [[ "$NODE_ROLE" == "master" ]]; then
    # 检查后端配置文件是否已存在
    if [[ -f "backend/.env" ]]; then
        print_warning "后端配置文件已存在，跳过生成"
        print_warning "如需重新生成，请先删除: backend/.env"
    else
        # 如果存在 .env.example，提示用户可以手动复制
        if [[ -f "backend/.env.example" ]]; then
            print_warning "检测到后端配置模板: backend/.env.example"
            print_warning "您可以基于模板手动配置，或使用自动生成的默认配置"
        fi
        
        cat > backend/.env << EOF
# SIPp Web Manager - 主机配置
# 生成时间: $(date '+%Y-%m-%d %H:%M:%S')

# 节点信息
NODE_ROLE=master
MACHINE_ID=master
MACHINE_NAME=主控节点

# 服务端口
PORT=3000

# 数据库配置
DB_HOST=${DB_HOST:-localhost}
DB_PORT=${DB_PORT:-3306}
DB_NAME=${DB_NAME:-sipp_manager}
DB_USER=${DB_USER:-root}
DB_PASSWORD=${DB_PASSWORD:-}
DB_POOL_SIZE=10

# 日志级别
LOG_FILE=../logs/app.log
LOG_LEVEL=info

# 文件目录（项目根目录）
SIPP_SCENARIO_DIR=../scenarios
SIPP_INJECTION_DIR=../injections
SIPP_LOG_DIR=../logs
SIPP_CERT_DIR=../certs
EOF
        print_success "主机配置文件已创建: backend/.env"
    fi

else
    # 从机配置
    print_step "配置从机数据库连接..."

    # 读取数据库配置（优先环境变量，否则使用默认值 = 主机地址）
    DB_HOST=${DB_HOST:-$MASTER_IP}
    DB_PORT=${DB_PORT:-3306}
    DB_USER=${DB_USER:-root}
    DB_PASSWORD=${DB_PASSWORD:-}
    DB_NAME=${DB_NAME:-sipp_manager}

    # 测试主机数据库连接
    print_step "测试主机数据库连接: $DB_HOST:$DB_PORT"
    if mysql -h"$DB_HOST" -P"$DB_PORT" -u"$DB_USER" -p"$DB_PASSWORD" -e "SELECT 1;" &>/dev/null; then
        print_success "主机数据库连接成功"
    else
        print_error "无法连接到主机数据库 ($DB_HOST:$DB_PORT)"
        print_warning "请确保："
        echo "  1. 主机 MySQL 服务已启动"
        echo "  2. MySQL 已开启远程访问（bind-address = 0.0.0.0）"
        echo "  3. 防火墙已开放 3306 端口"
        echo "  4. 数据库用户有远程访问权限"
        echo ""
        echo "创建远程用户的命令（在主机上执行）："
        echo "  mysql -e \"CREATE USER '$DB_USER'@'%' IDENTIFIED BY '$DB_PASSWORD';\""
        echo "  mysql -e \"GRANT ALL PRIVILEGES ON $DB_NAME.* TO '$DB_USER'@'%';\""
        echo "  mysql -e \"FLUSH PRIVILEGES;\""
        echo ""
        read -p "是否继续部署？(y/N) " -n 1 -r
        echo
        if [[ ! $REPLY =~ ^[Yy]$ ]]; then
            exit 1
        fi
    fi

    # 检查后端配置文件是否已存在
    if [[ -f "backend/.env" ]]; then
        print_warning "后端配置文件已存在，跳过生成"
        print_warning "如需重新生成，请先删除: backend/.env"
    else
        cat > backend/.env << EOF
# SIPp Web Manager - 从机配置
# 生成时间: $(date '+%Y-%m-%d %H:%M:%S')

# 节点信息
NODE_ROLE=slave
MACHINE_ID=slave-$(hostname | cut -d. -f1)
MACHINE_NAME=从机-$(hostname)

# 服务端口
PORT=3000

# 主机信息
MASTER_HOST=${MASTER_IP}
MASTER_PORT=3000

# 数据库配置（连接主机数据库）
DB_HOST=${DB_HOST}
DB_PORT=${DB_PORT}
DB_NAME=${DB_NAME}
DB_USER=${DB_USER}
DB_PASSWORD=${DB_PASSWORD}
DB_POOL_SIZE=5

# 日志级别
LOG_FILE=../logs/app.log
LOG_LEVEL=info

# 文件目录（项目根目录）
SIPP_SCENARIO_DIR=../scenarios
SIPP_INJECTION_DIR=../injections
SIPP_LOG_DIR=../logs
SIPP_CERT_DIR=../certs
EOF
        print_success "从机配置文件已创建: backend/.env"
    fi
fi

# ============================================
# 6. 创建必要目录
# ============================================
print_step "创建工作目录..."
mkdir -p scenarios
mkdir -p injections
mkdir -p logs
mkdir -p certs
print_success "工作目录创建完成"

# ============================================
# 7. 构建前端（仅主机）
# ============================================
if [[ "$NODE_ROLE" == "master" ]]; then
    print_step "准备前端配置..."

    # 检查前端 .env 文件，如果不存在则从模板复制
    if [[ ! -f "frontend/.env" ]]; then
        if [[ -f "frontend/.env.example" ]]; then
            cp frontend/.env.example frontend/.env
            print_success "已从 .env.example 创建前端配置文件"
        else
            print_warning "前端 .env.example 模板不存在，使用默认配置"
            cat > frontend/.env << EOF
# 前端配置
VITE_API_BASE_URL=/api
VITE_WS_PORT=3000
VITE_DEFAULT_REMOTE_HOST=127.0.0.1
VITE_DEFAULT_REMOTE_PORT=5060
VITE_DEFAULT_LOCAL_PORT=5061
EOF
            print_success "已创建前端配置文件"
        fi
    else
        print_success "前端配置文件已存在"
    fi

    print_step "构建前端..."
    cd frontend
    npm run build
    print_success "前端构建完成"
    cd ..
fi

# ============================================
# 8. 编译后端
# ============================================
print_step "编译后端..."
cd backend
npm run build
print_success "后端编译完成"
cd ..

# ============================================
# 9. 完成提示
# ============================================
echo ""
echo "============================================"
print_success "部署完成！"
echo "============================================"
echo ""

if [[ "$NODE_ROLE" == "master" ]]; then
    echo "主机节点部署成功！"
    echo ""
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    echo "🚀 启动服务："
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    echo "  ./service.sh start        # 启动服务"
    echo "  ./service.sh status       # 查看状态"
    echo "  ./service.sh logs         # 查看日志"
    echo ""
    echo "  或手动启动: cd backend && npm start"
    echo ""
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    echo "🌐 访问地址："
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    echo "  http://$(hostname -I | awk '{print $1}'):3000"
    echo ""
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    echo "📋 管理从机："
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    echo "  1. 确保主机服务已启动: ./service.sh status"
    echo "  2. 在从机上运行: ./deploy.sh slave $(hostname -I | awk '{print $1}')"
    echo ""
else
    echo "从机节点部署成功！"
    echo ""
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    echo "🚀 启动服务："
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    echo "  ./service.sh start        # 启动服务"
    echo "  ./service.sh status       # 查看状态"
    echo "  ./service.sh logs         # 查看日志"
    echo ""
    echo "  或手动启动: cd backend && npm start"
    echo ""
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    echo "📡 连接信息："
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    echo "  主机地址: ${MASTER_IP}:3000"
    echo "  数据库:   ${DB_HOST}:${DB_PORT}"
    echo ""
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    echo "⚠️  注意事项："
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    echo "  1. 从机启动后会自动向主机注册"
    echo "  2. 请确保主机服务已运行"
    echo "  3. 确保网络可达（端口 3000 和 3306）"
    echo "  4. 确保主机 MySQL 允许远程连接"
    echo ""
fi

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "📂 文件位置："
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  配置文件: backend/.env"
echo "  日志目录: logs/"
echo "  场景目录: scenarios/"
echo "  注入目录: injections/"
echo "  证书目录: certs/"
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "🔧 服务管理命令："
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  ./service.sh start        # 启动服务"
echo "  ./service.sh stop         # 停止服务"
echo "  ./service.sh restart      # 重启服务"
echo "  ./service.sh status       # 查看状态"
echo "  ./service.sh logs         # 查看日志"
echo ""

