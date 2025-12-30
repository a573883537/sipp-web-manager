#!/bin/bash
# ============================================
# SIPp Web Manager - 服务管理脚本
# ============================================
# 用途：统一管理主机和从机服务的启动、停止、重启、状态查看
# 版本：2.0.0
# 日期：2025-01-23
#
# 使用方法：
#   ./service.sh start     - 启动服务
#   ./service.sh stop      - 停止服务
#   ./service.sh restart   - 重启服务
#   ./service.sh status    - 查看状态
#   ./service.sh logs      - 查看日志
# ============================================

set -e  # 遇到错误立即退出

# 颜色定义
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

# 打印函数
print_info() { echo -e "${BLUE}[INFO]${NC} $1"; }
print_success() { echo -e "${GREEN}[SUCCESS]${NC} $1"; }
print_error() { echo -e "${RED}[ERROR]${NC} $1"; }
print_warning() { echo -e "${YELLOW}[WARNING]${NC} $1"; }

# ============================================
# 配置变量
# ============================================
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BACKEND_DIR="$SCRIPT_DIR/backend"
LOGS_DIR="$SCRIPT_DIR/logs"
PID_FILE="$BACKEND_DIR/.service.pid"
LOG_FILE="$LOGS_DIR/app.log"
ENV_FILE="$BACKEND_DIR/.env"

# 服务名称（自动从 .env 读取角色）
SERVICE_NAME="sipp-manager"
NODE_ROLE=""

# ============================================
# 辅助函数
# ============================================

# 读取节点角色
get_node_role() {
    if [[ -f "$ENV_FILE" ]]; then
        NODE_ROLE=$(grep "^NODE_ROLE=" "$ENV_FILE" | cut -d'=' -f2)
        if [[ "$NODE_ROLE" == "master" ]]; then
            SERVICE_NAME="sipp-manager-master"
        elif [[ "$NODE_ROLE" == "slave" ]]; then
            MACHINE_ID=$(grep "^MACHINE_ID=" "$ENV_FILE" | cut -d'=' -f2)
            SERVICE_NAME="sipp-manager-slave-${MACHINE_ID}"
        fi
    else
        print_warning "配置文件不存在: $ENV_FILE"
        NODE_ROLE="unknown"
    fi
}

# 检查服务是否运行（通过 PID 文件）
is_running() {
    if [[ -f "$PID_FILE" ]]; then
        local pid=$(cat "$PID_FILE")
        if ps -p "$pid" > /dev/null 2>&1; then
            return 0  # 运行中
        else
            # PID 文件存在但进程不存在，清理
            rm -f "$PID_FILE"
            return 1  # 未运行
        fi
    fi
    return 1  # 未运行
}

# 获取服务 PID
get_pid() {
    if [[ -f "$PID_FILE" ]]; then
        cat "$PID_FILE"
    else
        echo ""
    fi
}

# 检查 PM2 是否可用
has_pm2() {
    command -v pm2 &> /dev/null
}

# ============================================
# 服务操作函数
# ============================================

# 启动服务
start_service() {
    get_node_role

    if is_running; then
        print_warning "服务已在运行中 (PID: $(get_pid))"
        return 0
    fi

    print_info "正在启动服务: $SERVICE_NAME ($NODE_ROLE 节点)..."

    # 检查后端是否已编译
    if [[ ! -d "$BACKEND_DIR/dist" ]]; then
        print_error "后端未编译，请先运行: ./deploy.sh $NODE_ROLE"
        exit 1
    fi

    # 确保日志目录存在
    if [[ ! -d "$LOGS_DIR" ]]; then
        print_info "创建日志目录: $LOGS_DIR"
        mkdir -p "$LOGS_DIR"
    fi

    cd "$BACKEND_DIR"

    # 优先使用 PM2（生产环境推荐）
    if has_pm2; then
        print_info "使用 PM2 启动服务..."

        # 删除旧的 PM2 应用
        pm2 delete "$SERVICE_NAME" 2>/dev/null || true

        # 启动服务
        pm2 start dist/index.js \
            --name "$SERVICE_NAME" \
            --log "$LOGS_DIR/pm2.log" \
            --error "$LOGS_DIR/pm2-error.log" \
            --time

        # 保存 PM2 配置（用于开机自启）
        pm2 save > /dev/null 2>&1

        print_success "服务已启动 (PM2 管理)"
        print_info "查看日志: pm2 logs $SERVICE_NAME"
        print_info "停止服务: ./service.sh stop 或 pm2 stop $SERVICE_NAME"
    else
        # 使用 nohup 后台启动
        print_info "使用 nohup 启动服务..."

        nohup node dist/index.js > "$LOG_FILE" 2>&1 &
        local pid=$!

        # 保存 PID
        echo "$pid" > "$PID_FILE"

        # 等待服务启动
        sleep 2

        if is_running; then
            print_success "服务已启动 (PID: $pid)"
            print_info "查看日志: ./service.sh logs 或 tail -f $LOG_FILE"
            print_info "停止服务: ./service.sh stop"
        else
            print_error "服务启动失败，请查看日志: $LOG_FILE"
            rm -f "$PID_FILE"
            exit 1
        fi
    fi

    cd - > /dev/null
}

# 停止服务
stop_service() {
    get_node_role

    print_info "正在停止服务: $SERVICE_NAME..."

    local stopped=false

    # 尝试使用 PM2 停止
    if has_pm2; then
        if pm2 describe "$SERVICE_NAME" &> /dev/null; then
            pm2 delete "$SERVICE_NAME"
            print_success "服务已停止 (PM2 管理)"
            stopped=true
        fi
    fi

    # 尝试使用 PID 文件停止
    if [[ "$stopped" == false ]] && is_running; then
        local pid=$(get_pid)
        print_info "发送 SIGTERM 信号到进程: $pid"

        kill -TERM "$pid" 2>/dev/null || true

        # 等待进程退出（最多 10 秒）
        local count=0
        while ps -p "$pid" > /dev/null 2>&1 && [[ $count -lt 10 ]]; do
            sleep 1
            count=$((count + 1))
        done

        # 如果还在运行，强制杀掉
        if ps -p "$pid" > /dev/null 2>&1; then
            print_warning "进程未响应 SIGTERM，发送 SIGKILL..."
            kill -9 "$pid" 2>/dev/null || true
        fi

        rm -f "$PID_FILE"
        print_success "服务已停止 (PID: $pid)"
        stopped=true
    fi

    if [[ "$stopped" == false ]]; then
        print_warning "服务未运行"
    fi
}

# 重启服务
restart_service() {
    print_info "正在重启服务..."
    stop_service
    sleep 2
    start_service
}

# 查看服务状态
status_service() {
    get_node_role

    echo ""
    echo "╔══════════════════════════════════════════════════════════╗"
    echo "║          SIPp Web Manager - 服务状态                     ║"
    echo "╚══════════════════════════════════════════════════════════╝"
    echo ""

    print_info "服务名称: $SERVICE_NAME"
    print_info "节点角色: $NODE_ROLE"
    echo ""

    local is_pm2=false
    local is_pid=false

    # 检查 PM2 状态
    if has_pm2 && pm2 describe "$SERVICE_NAME" &> /dev/null; then
        is_pm2=true
        echo -e "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
        echo -e "${CYAN}PM2 进程状态:${NC}"
        echo -e "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
        pm2 describe "$SERVICE_NAME"
        echo ""

        print_info "管理命令:"
        echo "  - 查看日志: pm2 logs $SERVICE_NAME"
        echo "  - 重启服务: pm2 restart $SERVICE_NAME"
        echo "  - 停止服务: pm2 stop $SERVICE_NAME"
        echo "  - 查看监控: pm2 monit"
    fi

    # 检查 PID 文件状态
    if is_running; then
        is_pid=true
        local pid=$(get_pid)

        if [[ "$is_pm2" == false ]]; then
            echo -e "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
            echo -e "${CYAN}进程状态:${NC}"
            echo -e "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
            print_success "服务运行中"
            echo "  PID: $pid"
            echo "  日志: $LOG_FILE"
            echo ""

            # 显示进程详情
            if command -v ps &> /dev/null; then
                echo -e "${CYAN}进程详情:${NC}"
                ps -p "$pid" -o pid,ppid,cmd,%mem,%cpu,etime
                echo ""
            fi

            print_info "管理命令:"
            echo "  - 查看日志: ./service.sh logs"
            echo "  - 停止服务: ./service.sh stop"
        fi
    fi

    if [[ "$is_pm2" == false ]] && [[ "$is_pid" == false ]]; then
        echo -e "${RED}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
        print_error "服务未运行"
        echo -e "${RED}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
        echo ""
        print_info "启动服务: ./service.sh start"
    fi

    echo ""

    # 显示网络端口信息
    if command -v netstat &> /dev/null || command -v ss &> /dev/null; then
        echo -e "${CYAN}端口监听状态:${NC}"
        if command -v ss &> /dev/null; then
            ss -tuln | grep ":3000" || echo "  端口 3000 未监听"
        elif command -v netstat &> /dev/null; then
            netstat -tuln | grep ":3000" || echo "  端口 3000 未监听"
        fi
        echo ""
    fi
}

# 查看日志
logs_service() {
    get_node_role

    if has_pm2 && pm2 describe "$SERVICE_NAME" &> /dev/null; then
        print_info "显示 PM2 日志 (Ctrl+C 退出)..."
        pm2 logs "$SERVICE_NAME" --lines 50
    elif [[ -f "$LOG_FILE" ]]; then
        print_info "显示应用日志 (Ctrl+C 退出)..."
        tail -f "$LOG_FILE"
    else
        print_error "日志文件不存在: $LOG_FILE"
        exit 1
    fi
}

# ============================================
# 主函数
# ============================================

main() {
    local command=${1:-}

    if [[ -z "$command" ]]; then
        print_error "缺少命令参数！"
        echo ""
        echo "用法: $0 <command>"
        echo ""
        echo "命令列表："
        echo "  start    - 启动服务"
        echo "  stop     - 停止服务"
        echo "  restart  - 重启服务"
        echo "  status   - 查看状态"
        echo "  logs     - 查看日志（实时）"
        echo ""
        echo "示例："
        echo "  $0 start     # 启动服务"
        echo "  $0 status    # 查看状态"
        echo "  $0 logs      # 实时查看日志"
        exit 1
    fi

    case "$command" in
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
            status_service
            ;;
        logs)
            logs_service
            ;;
        *)
            print_error "未知命令: $command"
            echo ""
            echo "支持的命令: start, stop, restart, status, logs"
            exit 1
            ;;
    esac
}

# 执行主函数
main "$@"
