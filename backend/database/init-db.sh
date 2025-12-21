#!/bin/bash

# ============================================
# SIPp Web Manager 数据库初始化脚本
# ============================================

set -e

# 颜色定义
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# 日志函数
log_info() {
    echo -e "${GREEN}[INFO]${NC} $1"
}

log_warn() {
    echo -e "${YELLOW}[WARN]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# 获取脚本目录
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SCHEMA_FILE="$SCRIPT_DIR/schema.mysql.sql"
ENV_FILE="$SCRIPT_DIR/../.env"

# 自动加载 backend/.env 文件
if [ -f "$ENV_FILE" ]; then
    log_info "加载配置文件: $ENV_FILE"
    # 使用 export 和 source 加载环境变量
    set -a
    source "$ENV_FILE"
    set +a
else
    log_warn "未找到配置文件: $ENV_FILE"
    log_warn "将使用环境变量或默认值"
fi

# 默认数据库配置（如果环境变量未设置）
DB_HOST="${DB_HOST:-localhost}"
DB_PORT="${DB_PORT:-3306}"
DB_NAME="${DB_NAME:-sipp_manager}"
DB_USER="${DB_USER:-root}"
DB_PASSWORD="${DB_PASSWORD:-}"
DB_CONTAINER="${DB_CONTAINER:-}"

# 显示配置
log_info "数据库配置:"
echo "  Host: $DB_HOST"
echo "  Port: $DB_PORT"
echo "  Database: $DB_NAME"
echo "  User: $DB_USER"
if [ -n "$DB_CONTAINER" ]; then
    echo "  Container: $DB_CONTAINER (使用 Docker)"
fi
echo ""

# 构建 MySQL 命令
MYSQL_CMD=""

# 1. 如果指定了容器名称，使用 docker exec
if [ -n "$DB_CONTAINER" ]; then
    log_info "检测到数据库容器: $DB_CONTAINER"
    
    if ! command -v docker &> /dev/null; then
        log_error "未找到 Docker 命令"
        log_error "请安装 Docker 或将 DB_CONTAINER 设置为空"
        exit 1
    fi
    
    # 检查容器是否运行
    if ! docker ps --format '{{.Names}}' | grep -q "^${DB_CONTAINER}$"; then
        log_error "数据库容器 '$DB_CONTAINER' 未运行"
        log_error "请启动容器: docker start $DB_CONTAINER"
        exit 1
    fi
    
    MYSQL_CMD="docker exec -i $DB_CONTAINER mysql -u$DB_USER ${DB_PASSWORD:+-p$DB_PASSWORD}"
    log_info "数据库容器运行中"
    
# 2. 否则使用本地 MySQL 客户端
else
    if ! command -v mysql &> /dev/null; then
        log_error "未找到 MySQL 客户端"
        log_error "选项:"
        log_error "  1. 安装 MySQL 客户端: sudo apt-get install mysql-client-core-8.0"
        log_error "  2. 或设置 DB_CONTAINER=<容器名> 来使用 Docker"
        exit 1
    fi
    
    MYSQL_CMD="mysql -h$DB_HOST -P$DB_PORT -u$DB_USER ${DB_PASSWORD:+-p$DB_PASSWORD}"
fi

# 检查MySQL是否可用
log_info "检查MySQL连接..."
if ! $MYSQL_CMD -e "SELECT 1" > /dev/null 2>&1; then
    log_error "无法连接到MySQL服务器"
    log_error "请检查:"
    log_error "  1) MySQL服务是否运行"
    if [ -n "$DB_CONTAINER" ]; then
        log_error "     Docker: docker ps | grep $DB_CONTAINER"
    else
        log_error "     Host: sudo systemctl status mysql"
    fi
    log_error "  2) 用户名密码是否正确"
    log_error "  3) 主机和端口是否正确"
    exit 1
fi
log_info "MySQL连接成功"

# 检查schema文件是否存在
if [ ! -f "$SCHEMA_FILE" ]; then
    log_error "Schema文件不存在: $SCHEMA_FILE"
    exit 1
fi

# 执行schema文件
log_info "执行数据库初始化..."
if cat "$SCHEMA_FILE" | $MYSQL_CMD 2>&1; then
    log_info "数据库初始化成功"
else
    log_error "数据库初始化失败"
    exit 1
fi

# 验证表是否创建成功
log_info "验证数据库表..."
TABLES=("scenarios" "injection_files" "task_history" "config_templates")
MISSING_TABLES=()

for table in "${TABLES[@]}"; do
    if ! $MYSQL_CMD -D"$DB_NAME" -e "SHOW TABLES LIKE '$table'" 2>/dev/null | grep -q "$table"; then
        MISSING_TABLES+=("$table")
    fi
done

if [ ${#MISSING_TABLES[@]} -gt 0 ]; then
    log_error "以下表创建失败: ${MISSING_TABLES[*]}"
    exit 1
fi

log_info "所有表创建成功: ${TABLES[*]}"

# 显示表结构统计
log_info "数据库表统计:"
for table in "${TABLES[@]}"; do
    count=$($MYSQL_CMD -D"$DB_NAME" -sN -e "SELECT COUNT(*) FROM $table" 2>/dev/null || echo "0")
    echo "  $table: $count 条记录"
done

echo ""
log_info "数据库初始化完成！"
log_info "您可以现在启动SIPp Web Manager服务"

