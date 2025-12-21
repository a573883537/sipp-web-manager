#!/bin/bash

# SIPp Web Manager 快速启动脚本
# 遵循KISS原则：简单、清晰、易用

set -e

# 颜色定义
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# 打印带颜色的消息
print_info() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

print_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

print_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# 打印Logo
print_logo() {
    cat << "EOF"
╔═══════════════════════════════════════════════════════════╗
║                                                           ║
║              SIPp Web Manager                             ║
║         可视化SIPp管理和监控平台                          ║
║                                                           ║
╚═══════════════════════════════════════════════════════════╝
EOF
}

# 检查依赖
check_dependencies() {
    print_info "检查依赖..."

    # 检查Node.js
    if ! command -v node &> /dev/null; then
        print_error "Node.js未安装，请先安装Node.js 18或更高版本"
        exit 1
    fi

    node_version=$(node --version | cut -d'v' -f2 | cut -d'.' -f1)
    if [ "$node_version" -lt 18 ]; then
        print_error "Node.js版本过低，需要18或更高版本"
        exit 1
    fi

    print_success "Node.js $(node --version) ✓"

    # 检查npm
    if ! command -v npm &> /dev/null; then
        print_error "npm未安装"
        exit 1
    fi

    print_success "npm $(npm --version) ✓"
}

# 安装依赖
install_dependencies() {
    print_info "安装后端依赖..."
    cd backend
    npm install
    cd ..

    print_info "安装前端依赖..."
    cd frontend
    npm install
    cd ..

    print_success "依赖安装完成"
}

# 配置环境变量
setup_env() {
    if [ ! -f "backend/.env" ]; then
        print_warning "后端环境配置文件不存在"
        print_warning "请创建 backend/.env 文件并配置数据库连接"
        print_warning "参考 README.md 中的配置说明"
        print_error "无法启动：需要配置文件"
        exit 1
    else
        print_info "后端环境配置已存在 ✓"
    fi
}

# 创建必要的目录
create_directories() {
    print_info "创建必要的目录..."
    mkdir -p scenarios data
    print_success "目录创建完成"
}

# 启动后端服务
start_backend() {
    print_info "启动后端服务..."
    cd backend
    npm run dev &
    BACKEND_PID=$!
    cd ..
    print_success "后端服务已启动 (PID: $BACKEND_PID)"
}

# 启动前端服务
start_frontend() {
    print_info "启动前端服务..."
    cd frontend
    npm run dev &
    FRONTEND_PID=$!
    cd ..
    print_success "前端服务已启动 (PID: $FRONTEND_PID)"
}

# 等待服务启动
wait_for_services() {
    print_info "等待服务启动..."
    sleep 3

    # 检查后端
    if curl -s http://localhost:3000/health > /dev/null; then
        print_success "后端服务就绪: http://localhost:3000"
    else
        print_warning "后端服务可能还在启动中..."
    fi

    # 前端通常需要更长时间
    sleep 2
    print_success "前端服务就绪: http://localhost:5173"
}

# 显示访问信息
show_info() {
    echo ""
    echo "╔═══════════════════════════════════════════════════════════╗"
    echo "║                     服务已启动                             ║"
    echo "╠═══════════════════════════════════════════════════════════╣"
    echo "║                                                           ║"
    echo "║  前端界面:  http://localhost:5173                         ║"
    echo "║  后端API:   http://localhost:3000/api                     ║"
    echo "║  健康检查:  http://localhost:3000/health                  ║"
    echo "║                                                           ║"
    echo "║  按 Ctrl+C 停止所有服务                                    ║"
    echo "║                                                           ║"
    echo "╚═══════════════════════════════════════════════════════════╝"
    echo ""
}

# 清理函数
cleanup() {
    echo ""
    print_info "正在停止服务..."

    if [ ! -z "$BACKEND_PID" ]; then
        kill $BACKEND_PID 2>/dev/null || true
        print_success "后端服务已停止"
    fi

    if [ ! -z "$FRONTEND_PID" ]; then
        kill $FRONTEND_PID 2>/dev/null || true
        print_success "前端服务已停止"
    fi

    print_success "所有服务已关闭"
    exit 0
}

# 注册清理函数
trap cleanup SIGINT SIGTERM

# 主函数
main() {
    print_logo

    # 检查是否是首次运行
    FIRST_RUN=false
    if [ ! -d "backend/node_modules" ] || [ ! -d "frontend/node_modules" ]; then
        FIRST_RUN=true
    fi

    # 首次运行：完整设置
    if [ "$FIRST_RUN" = true ]; then
        print_info "检测到首次运行，执行完整设置..."
        check_dependencies
        install_dependencies
        setup_env
        create_directories
    else
        print_info "快速启动模式..."
        check_dependencies
        setup_env
    fi

    # 启动服务
    start_backend
    start_frontend

    # 等待服务就绪
    wait_for_services

    # 显示访问信息
    show_info

    # 保持脚本运行
    wait
}

# 执行主函数
main
