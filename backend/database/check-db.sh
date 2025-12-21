#!/bin/bash

# ============================================
# SIPp Web Manager Database Check Script
# ============================================

set -e

# Color definitions
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Logging functions
log_info() {
    echo -e "${GREEN}[INFO]${NC} $1"
}

log_warn() {
    echo -e "${YELLOW}[WARN]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Default database configuration
DB_HOST="${DB_HOST:-localhost}"
DB_PORT="${DB_PORT:-3306}"
DB_NAME="${DB_NAME:-sipp_manager}"
DB_USER="${DB_USER:-root}"
DB_PASSWORD="${DB_PASSWORD:-}"

check_failed=0

log_info "========================================"
log_info "SIPp Web Manager Database Check"
log_info "========================================"
echo ""

# 1. Check MySQL connection
log_info "[1/5] Checking MySQL connection..."
if mysql -h"$DB_HOST" -P"$DB_PORT" -u"$DB_USER" -p"$DB_PASSWORD" -e "SELECT 1" > /dev/null 2>&1; then
    log_info "✓ MySQL connection OK"
else
    log_error "✗ MySQL connection failed"
    log_error "  Please check: 1) MySQL service is running 2) Username/password is correct"
    check_failed=1
fi
echo ""

# 2. Check if database exists
log_info "[2/5] Checking database..."
if mysql -h"$DB_HOST" -P"$DB_PORT" -u"$DB_USER" -p"$DB_PASSWORD" -e "USE $DB_NAME" > /dev/null 2>&1; then
    log_info "✓ Database '$DB_NAME' exists"
else
    log_error "✗ Database '$DB_NAME' does not exist"
    log_warn "  Run the following command to create database:"
    log_warn "  cd backend/database && ./init-db.sh"
    check_failed=1
fi
echo ""

# 3. Check required tables
log_info "[3/5] Checking database tables..."
REQUIRED_TABLES=("scenarios" "injection_files" "task_history" "config_templates")
MISSING_TABLES=()

for table in "${REQUIRED_TABLES[@]}"; do
    if mysql -h"$DB_HOST" -P"$DB_PORT" -u"$DB_USER" -p"$DB_PASSWORD" -D"$DB_NAME" -e "SHOW TABLES LIKE '$table'" 2>/dev/null | grep -q "$table"; then
        log_info "✓ Table '$table' exists"
    else
        log_error "✗ Table '$table' does not exist"
        MISSING_TABLES+=("$table")
        check_failed=1
    fi
done

if [ ${#MISSING_TABLES[@]} -gt 0 ]; then
    log_warn "  Run the following command to create missing tables:"
    log_warn "  cd backend/database && ./init-db.sh"
fi
echo ""

# 4. Check key fields
log_info "[4/5] Checking key fields..."
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
                log_info "✓ Table '$table' contains field '$field'"
            else
                log_error "✗ Table '$table' missing field '$field'"
                check_failed=1
            fi
        done
    fi
done
echo ""

# 5. Check data statistics
log_info "[5/5] Checking data statistics..."
for table in "${REQUIRED_TABLES[@]}"; do
    if mysql -h"$DB_HOST" -P"$DB_PORT" -u"$DB_USER" -p"$DB_PASSWORD" -D"$DB_NAME" -e "SHOW TABLES LIKE '$table'" 2>/dev/null | grep -q "$table"; then
        count=$(mysql -h"$DB_HOST" -P"$DB_PORT" -u"$DB_USER" -p"$DB_PASSWORD" -D"$DB_NAME" -sN -e "SELECT COUNT(*) FROM $table" 2>/dev/null)
        log_info "  Table '$table': $count records"
    fi
done
echo ""

# Summary
log_info "========================================"
if [ $check_failed -eq 0 ]; then
    log_info "Database check completed - All OK ✓"
else
    log_error "Database check completed - Issues found ✗"
    log_warn "Please run initialization script to fix issues:"
    log_warn "  cd backend/database && ./init-db.sh"
    exit 1
fi
log_info "========================================"
