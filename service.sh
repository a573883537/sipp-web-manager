#!/bin/bash

# ============================================
# SIPp Web Manager 服务管理脚本
# ============================================

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

# 服务名称
SERVICE_NAME="sipp-backend"

# 显示使用帮助
show_help() {
    cat << EOF
╔═══════════════════════════════════════════════════════════╗
║         SIPp Web Manager - 服务管理工具                   ║
╚═══════════════════════════════════════════════════════════╝

用法: $0 [命令]

命令:
  start       启动后端服务
  stop        停止后端服务
  restart     重启后端服务
  status      查看服务状态
  logs        查看服务日志
  help        显示此帮助信息

示例:
  $0 start          # 启动服务
  $0 stop           # 停止服务
  $0 status         # 查看状态
  $0 logs           # 查看日志

EOF
}

# 检查 PM2 是否安装
check_pm2() {
    if command -v pm2 &> /dev/null; then
        return 0
    else
        return 1
    fi
}

# 启动服务
start_service() {
    print_info "启动 SIPp Web Manager 后端服务..."
    
    # 检查是否已经在运行
    if check_pm2; then
        if pm2 describe "$SERVICE_NAME" &> /dev/null; then
            print_warning "服务已在运行中"
            pm2 describe "$SERVICE_NAME" --no-color
            return 0
        fi
    else
        # 检查是否有进程在运行
        if lsof -i :3000 &> /dev/null; then
            print_warning "端口 3000 已被占用，服务可能正在运行"
            lsof -i :3000
            return 0
        fi
    fi
    
    cd backend
    
    # 检查是否已构建
    if [ ! -d "dist" ] || [ ! -f "dist/index.js" ]; then
        print_error "未找到构建文件，请先运行: ./deploy.sh"
        exit 1
    fi
    
    # 使用 PM2 或直接启动
    if check_pm2; then
        pm2 start dist/index.js --name "$SERVICE_NAME"
        print_success "服务已通过 PM2 启动"
        echo ""
        pm2 describe "$SERVICE_NAME" --no-color
    else
        print_warning "未安装 PM2，使用 nohup 启动服务"
        nohup node dist/index.js > ../logs/backend.log 2>&1 &
        echo $! > ../logs/backend.pid
        print_success "服务已启动 (PID: $!)"
        print_info "日志文件: logs/backend.log"
    fi
    
    cd ..
}

# 停止服务
stop_service() {
    print_info "停止 SIPp Web Manager 后端服务..."
    
    if check_pm2; then
        if pm2 describe "$SERVICE_NAME" &> /dev/null; then
            pm2 stop "$SERVICE_NAME"
            pm2 delete "$SERVICE_NAME"
            print_success "服务已停止并从 PM2 移除"
        else
            print_warning "PM2 中未找到运行的服务"
        fi
    else
        # 尝试从 PID 文件停止
        if [ -f "logs/backend.pid" ]; then
            PID=$(cat logs/backend.pid)
            if kill -0 "$PID" 2>/dev/null; then
                kill "$PID"
                print_success "服务已停止 (PID: $PID)"
                rm logs/backend.pid
            else
                print_warning "PID 文件中的进程不存在"
                rm logs/backend.pid
            fi
        fi
        
        # 查找并停止端口 3000 上的进程
        PID=$(lsof -ti :3000 2>/dev/null)
        if [ -n "$PID" ]; then
            kill "$PID"
            print_success "已停止端口 3000 上的进程 (PID: $PID)"
        else
            print_warning "未找到运行在端口 3000 的服务"
        fi
    fi
}

# 重启服务
restart_service() {
    print_info "重启 SIPp Web Manager 后端服务..."
    stop_service
    sleep 2
    start_service
}

# 查看服务状态
show_status() {
    echo ""
    echo "╔═══════════════════════════════════════════════════════════╗"
    echo "║            SIPp Web Manager 服务状态                       ║"
    echo "╚═══════════════════════════════════════════════════════════╝"
    echo ""
    
    # PM2 状态
    if check_pm2; then
        print_info "PM2 服务状态:"
        pm2 describe "$SERVICE_NAME" --no-color 2>/dev/null || print_warning "未在 PM2 中找到服务"
        echo ""
        print_info "PM2 进程列表:"
        pm2 list
    else
        print_warning "未安装 PM2"
    fi
    
    echo ""
    
    # 端口监听状态
    print_info "端口监听状态:"
    if lsof -i :3000 &> /dev/null; then
        lsof -i :3000 | grep LISTEN
        print_success "服务正在监听端口 3000"
    else
        print_warning "端口 3000 未被监听"
    fi
    
    echo ""
    
    # 进程状态
    print_info "Node.js 后端进程:"
    ps aux | grep -E "node.*dist/index.js|sipp-backend" | grep -v grep || print_warning "未找到后端进程"
    
    echo ""
    
    # 健康检查
    print_info "服务健康检查:"
    if curl -s http://localhost:3000/health > /dev/null 2>&1; then
        print_success "服务健康检查通过"
        curl -s http://localhost:3000/health | jq . 2>/dev/null || curl -s http://localhost:3000/health
    else
        print_error "服务健康检查失败"
    fi
    
    echo ""
}

# 查看日志
show_logs() {
    if check_pm2 && pm2 describe "$SERVICE_NAME" &> /dev/null; then
        print_info "显示 PM2 日志..."
        pm2 logs "$SERVICE_NAME" --lines 50
    elif [ -f "logs/backend.log" ]; then
        print_info "显示后端日志 (logs/backend.log)..."
        tail -50 logs/backend.log
    elif [ -f "backend/logs/app.log" ]; then
        print_info "显示应用日志 (backend/logs/app.log)..."
        tail -50 backend/logs/app.log
    else
        print_warning "未找到日志文件"
    fi
}

# 主函数
main() {
    case "${1:-help}" in
        start)
            start_service
            ;;
        stop)
            stop_service
            ;;
        restart)
            restart_service
            ;;
        status)
            show_status
            ;;
        logs)
            show_logs
            ;;
        help|--help|-h)
            show_help
            ;;
        *)
            print_error "未知命令: $1"
            echo ""
            show_help
            exit 1
            ;;
    esac
}

# 执行
main "$@"

