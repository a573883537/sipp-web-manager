#!/bin/bash

# ============================================
# SIPp Web Manager 数据库检查脚本
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

# 默认数据库配置
DB_HOST="${DB_HOST:-localhost}"
DB_PORT="${DB_PORT:-3306}"
DB_NAME="${DB_NAME:-sipp_manager}"
DB_USER="${DB_USER:-root}"
DB_PASSWORD="${DB_PASSWORD:-}"

check_failed=0

log_info "========================================"
log_info "SIPp Web Manager 数据库检查"
log_info "========================================"
echo ""

# 1. 检查MySQL连接
log_info "[1/5] 检查MySQL连接..."
if mysql -h"$DB_HOST" -P"$DB_PORT" -u"$DB_USER" -p"$DB_PASSWORD" -e "SELECT 1" > /dev/null 2>&1; then
    log_info "✓ MySQL连接正常"
else
    log_error "✗ MySQL连接失败"
    log_error "  请检查: 1) MySQL服务是否运行 2) 用户名密码是否正确"
    check_failed=1
fi
echo ""

# 2. 检查数据库是否存在
log_info "[2/5] 检查数据库..."
if mysql -h"$DB_HOST" -P"$DB_PORT" -u"$DB_USER" -p"$DB_PASSWORD" -e "USE $DB_NAME" > /dev/null 2>&1; then
    log_info "✓ 数据库 '$DB_NAME' 存在"
else
    log_error "✗ 数据库 '$DB_NAME' 不存在"
    log_warn "  运行以下命令创建数据库:"
    log_warn "  cd backend/database && ./init-db.sh"
    check_failed=1
fi
echo ""

# 3. 检查必需的表
log_info "[3/5] 检查数据库表..."
REQUIRED_TABLES=("scenarios" "injection_files" "task_history" "config_templates")
MISSING_TABLES=()

for table in "${REQUIRED_TABLES[@]}"; do
    if mysql -h"$DB_HOST" -P"$DB_PORT" -u"$DB_USER" -p"$DB_PASSWORD" -D"$DB_NAME" -e "SHOW TABLES LIKE '$table'" 2>/dev/null | grep -q "$table"; then
        log_info "✓ 表 '$table' 存在"
    else
        log_error "✗ 表 '$table' 不存在"
        MISSING_TABLES+=("$table")
        check_failed=1
    fi
done

if [ ${#MISSING_TABLES[@]} -gt 0 ]; then
    log_warn "  运行以下命令创建缺失的表:"
    log_warn "  cd backend/database && ./init-db.sh"
fi
echo ""

# 4. 检查关键字段
log_info "[4/5] 检查关键字段..."
declare -A TABLE_FIELDS=(
    ["scenarios"]="id,filename,name,messages,injection_file"
    ["injection_files"]="id,filename,content,field_count,row_count,read_mode"
    ["task_history"]="id,scenario_name,scenario_file,status,config,stats"
    ["config_templates"]="id,name,config,is_default"
)

for table in "${!TABLE_FIELDS[@]}"; do
    if mysql -h"$DB_HOST" -P"$DB_PORT" -u"$DB_USER" -p"$DB_PASSWORD" -D"$DB_NAME" -e "SHOW TABLES LIKE '$table'" 2>/dev/null | grep -q "$table"; then
        IFS=',' read -ra fields <<< "${TABLE_FIELDS[$table]}"
        for field in "${fields[@]}"; do
            if mysql -h"$DB_HOST" -P"$DB_PORT" -u"$DB_USER" -p"$DB_PASSWORD" -D"$DB_NAME" -e "DESCRIBE $table" 2>/dev/null | grep -q "^$field"; then
                log_info "✓ 表 '$table' 包含字段 '$field'"
            else
                log_error "✗ 表 '$table' 缺少字段 '$field'"
                check_failed=1
            fi
        done
    fi
done
echo ""

# 5. 检查示例数据
log_info "[5/5] 检查数据统计..."
for table in "${REQUIRED_TABLES[@]}"; do
    if mysql -h"$DB_HOST" -P"$DB_PORT" -u"$DB_USER" -p"$DB_PASSWORD" -D"$DB_NAME" -e "SHOW TABLES LIKE '$table'" 2>/dev/null | grep -q "$table"; then
        count=$(mysql -h"$DB_HOST" -P"$DB_PORT" -u"$DB_USER" -p"$DB_PASSWORD" -D"$DB_NAME" -sN -e "SELECT COUNT(*) FROM $table" 2>/dev/null)
        log_info "  表 '$table': $count 条记录"
    fi
done
echo ""

# 总结
log_info "========================================"
if [ $check_failed -eq 0 ]; then
    log_info "数据库检查完成 - 一切正常 ✓"
else
    log_error "数据库检查完成 - 发现问题 ✗"
    log_warn "请运行初始化脚本修复问题:"
    log_warn "  cd backend/database && ./init-db.sh"
    exit 1
fi
log_info "========================================"

