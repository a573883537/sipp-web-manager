#!/bin/bash
# ============================================
# 远程升级脚本 - 从主机推送更新到从机
# ============================================
# 用途：在主机上执行，自动将代码分发到从机并升级
# 使用：./remote-upgrade.sh [slave-host1] [slave-host2] ...
# ============================================

set -e

# 颜色定义
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

# 打印函数
print_step() { echo -e "${BLUE}==>${NC} $1"; }
print_success() { echo -e "${GREEN}✓${NC} $1"; }
print_error() { echo -e "${RED}✗${NC} $1"; }
print_warning() { echo -e "${YELLOW}⚠${NC} $1"; }

# 配置变量
PROJECT_NAME="sipp-web-manager"
REMOTE_PATH="/opt/sipp-web-manager"
REMOTE_USER="${REMOTE_USER:-root}"
SSH_PORT="${SSH_PORT:-22}"

# 要排除的目录和文件
EXCLUDE_PATTERNS=(
    "node_modules/"
    ".git/"
    "dist/"
    ".env"
    "logs/"
    "*.log"
    ".DS_Store"
)

# ============================================
# 函数：显示帮助信息
# ============================================
show_help() {
    cat << EOF
========================================
远程升级脚本 - 从主机推送更新到从机
========================================

用法: $0 [选项] <从机地址1> [从机地址2] ...

选项:
  -u, --user USER       SSH 登录用户名（默认: root）
  -p, --port PORT       SSH 端口（默认: 22）
  -d, --dir PATH        从机项目目录（默认: /opt/sipp-web-manager）
  -h, --help            显示帮助信息

示例:
  # 升级单个从机
  $0 192.168.1.101

  # 升级多个从机
  $0 192.168.1.101 192.168.1.102 192.168.1.103

  # 指定用户和端口
  $0 -u deploy -p 2222 192.168.1.101

  # 使用环境变量
  REMOTE_USER=deploy SSH_PORT=2222 $0 192.168.1.101

配置文件:
  可以创建 .upgrade.conf 文件列出所有从机地址：
    192.168.1.101
    192.168.1.102
    192.168.1.103
  
  然后使用: $0 --from-config

环境变量:
  REMOTE_USER       SSH 登录用户名
  SSH_PORT          SSH 端口
  EXCLUDE_BACKEND   设置为 1 则不更新后端（仅前端）
  EXCLUDE_FRONTEND  设置为 1 则不更新前端（仅后端）

========================================
EOF
}

# ============================================
# 函数：检查前置条件
# ============================================
check_prerequisites() {
    print_step "检查前置条件..."
    
    # 检查 rsync
    if ! command -v rsync &> /dev/null; then
        print_error "rsync 未安装，请先安装: sudo apt install rsync"
        exit 1
    fi
    
    # 检查 SSH
    if ! command -v ssh &> /dev/null; then
        print_error "ssh 未安装"
        exit 1
    fi
    
    # 检查是否在项目根目录
    if [ ! -f "package.json" ] || [ ! -d "backend" ] || [ ! -d "frontend" ]; then
        print_error "请在项目根目录执行此脚本"
        exit 1
    fi
    
    print_success "前置条件检查通过"
}

# ============================================
# 函数：测试 SSH 连接
# ============================================
test_ssh_connection() {
    local host=$1
    
    if ssh -p "$SSH_PORT" -o ConnectTimeout=5 -o BatchMode=yes "$REMOTE_USER@$host" "echo ok" &>/dev/null; then
        return 0
    else
        return 1
    fi
}

# ============================================
# 函数：同步代码到从机
# ============================================
sync_code() {
    local host=$1
    
    print_step "同步代码到 $host ..."
    
    # 构建 rsync 排除参数
    local exclude_args=""
    for pattern in "${EXCLUDE_PATTERNS[@]}"; do
        exclude_args="$exclude_args --exclude='$pattern'"
    done
    
    # 同步代码
    eval rsync -avz --delete \
        -e "'ssh -p $SSH_PORT'" \
        $exclude_args \
        ./ "$REMOTE_USER@$host:$REMOTE_PATH/"
    
    if [ $? -eq 0 ]; then
        print_success "代码同步完成: $host"
        return 0
    else
        print_error "代码同步失败: $host"
        return 1
    fi
}

# ============================================
# 函数：在从机上执行升级
# ============================================
execute_upgrade() {
    local host=$1
    
    print_step "在 $host 上执行升级..."
    
    # 远程执行升级命令
    ssh -p "$SSH_PORT" "$REMOTE_USER@$host" bash << 'ENDSSH'
set -e

cd /opt/sipp-web-manager

echo "========================================="
echo "开始升级..."
echo "========================================="

# 1. 备份 .env 文件
if [ -f "backend/.env" ]; then
    echo "备份配置文件..."
    cp backend/.env backend/.env.backup
fi

# 2. 安装/更新依赖
echo ""
echo "更新后端依赖..."
cd backend
npm install --production
echo "✓ 后端依赖更新完成"

echo ""
echo "更新前端依赖..."
cd ../frontend
npm install
echo "✓ 前端依赖更新完成"

# 3. 编译代码
echo ""
echo "编译后端代码..."
cd ../backend
npm run build
echo "✓ 后端编译完成"

echo ""
echo "编译前端代码..."
cd ../frontend
npm run build
echo "✓ 前端编译完成"

# 4. 重启服务
echo ""
echo "重启服务..."
cd ..

if [ -f "service.sh" ]; then
    ./service.sh restart
    echo "✓ 服务重启完成"
else
    echo "⚠ service.sh 未找到，请手动重启服务"
fi

echo ""
echo "========================================="
echo "✓ 升级完成！"
echo "========================================="
ENDSSH
    
    if [ $? -eq 0 ]; then
        print_success "升级完成: $host"
        return 0
    else
        print_error "升级失败: $host"
        return 1
    fi
}

# ============================================
# 函数：升级单个从机
# ============================================
upgrade_slave() {
    local host=$1
    
    echo ""
    echo "========================================"
    echo "升级从机: $host"
    echo "========================================"
    
    # 1. 测试连接
    print_step "测试 SSH 连接..."
    if ! test_ssh_connection "$host"; then
        print_error "无法连接到 $host"
        return 1
    fi
    print_success "SSH 连接成功"
    
    # 2. 同步代码
    if ! sync_code "$host"; then
        return 1
    fi
    
    # 3. 执行升级
    if ! execute_upgrade "$host"; then
        return 1
    fi
    
    print_success "从机 $host 升级完成！"
    return 0
}

# ============================================
# 函数：从配置文件读取从机列表
# ============================================
read_slaves_from_config() {
    local config_file=".upgrade.conf"
    
    if [ ! -f "$config_file" ]; then
        print_error "配置文件 $config_file 不存在"
        exit 1
    fi
    
    # 读取非空行和非注释行
    grep -v '^#' "$config_file" | grep -v '^[[:space:]]*$'
}

# ============================================
# 主函数
# ============================================
main() {
    local slaves=()
    local use_config=0
    
    # 解析参数
    while [[ $# -gt 0 ]]; do
        case $1 in
            -u|--user)
                REMOTE_USER="$2"
                shift 2
                ;;
            -p|--port)
                SSH_PORT="$2"
                shift 2
                ;;
            -d|--dir)
                REMOTE_PATH="$2"
                shift 2
                ;;
            --from-config)
                use_config=1
                shift
                ;;
            -h|--help)
                show_help
                exit 0
                ;;
            -*)
                print_error "未知选项: $1"
                show_help
                exit 1
                ;;
            *)
                slaves+=("$1")
                shift
                ;;
        esac
    done
    
    # 从配置文件读取从机列表
    if [ $use_config -eq 1 ]; then
        mapfile -t slaves < <(read_slaves_from_config)
    fi
    
    # 检查是否指定了从机
    if [ ${#slaves[@]} -eq 0 ]; then
        print_error "请指定至少一个从机地址"
        echo ""
        show_help
        exit 1
    fi
    
    # 显示配置信息
    echo "========================================"
    echo "远程升级配置"
    echo "========================================"
    echo "SSH 用户: $REMOTE_USER"
    echo "SSH 端口: $SSH_PORT"
    echo "远程路径: $REMOTE_PATH"
    echo "从机数量: ${#slaves[@]}"
    echo "从机列表:"
    for slave in "${slaves[@]}"; do
        echo "  - $slave"
    done
    echo "========================================"
    echo ""
    
    # 确认
    read -p "确认开始升级？(y/N) " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        print_warning "取消升级"
        exit 0
    fi
    
    # 检查前置条件
    check_prerequisites
    
    # 升级统计
    local success_count=0
    local fail_count=0
    local failed_hosts=()
    
    # 逐个升级从机
    for slave in "${slaves[@]}"; do
        if upgrade_slave "$slave"; then
            ((success_count++))
        else
            ((fail_count++))
            failed_hosts+=("$slave")
        fi
    done
    
    # 显示总结
    echo ""
    echo "========================================"
    echo "升级完成统计"
    echo "========================================"
    echo "总计从机: ${#slaves[@]}"
    echo -e "${GREEN}成功: $success_count${NC}"
    
    if [ $fail_count -gt 0 ]; then
        echo -e "${RED}失败: $fail_count${NC}"
        echo ""
        echo "失败的从机:"
        for host in "${failed_hosts[@]}"; do
            echo "  - $host"
        done
    fi
    echo "========================================"
    
    if [ $fail_count -gt 0 ]; then
        exit 1
    fi
}

# 执行主函数
main "$@"

