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

# 默认数据库配置
DB_HOST="${DB_HOST:-localhost}"
DB_PORT="${DB_PORT:-3306}"
DB_NAME="${DB_NAME:-sipp_manager}"
DB_USER="${DB_USER:-root}"
DB_PASSWORD="${DB_PASSWORD:-}"

# 显示配置
log_info "数据库配置:"
echo "  Host: $DB_HOST"
echo "  Port: $DB_PORT"
echo "  Database: $DB_NAME"
echo "  User: $DB_USER"
echo ""

# 检查MySQL是否可用
log_info "检查MySQL连接..."
if ! mysql -h"$DB_HOST" -P"$DB_PORT" -u"$DB_USER" -p"$DB_PASSWORD" -e "SELECT 1" > /dev/null 2>&1; then
    log_error "无法连接到MySQL服务器"
    log_error "请检查: 1) MySQL服务是否运行 2) 用户名密码是否正确 3) 主机和端口是否正确"
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
if mysql -h"$DB_HOST" -P"$DB_PORT" -u"$DB_USER" -p"$DB_PASSWORD" < "$SCHEMA_FILE" 2>&1; then
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
    if ! mysql -h"$DB_HOST" -P"$DB_PORT" -u"$DB_USER" -p"$DB_PASSWORD" -D"$DB_NAME" -e "SHOW TABLES LIKE '$table'" 2>/dev/null | grep -q "$table"; then
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
    count=$(mysql -h"$DB_HOST" -P"$DB_PORT" -u"$DB_USER" -p"$DB_PASSWORD" -D"$DB_NAME" -sN -e "SELECT COUNT(*) FROM $table" 2>/dev/null)
    echo "  $table: $count 条记录"
done

echo ""
log_info "数据库初始化完成！"
log_info "您可以现在启动SIPp Web Manager服务"

