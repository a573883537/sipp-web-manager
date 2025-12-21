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

# Get script directory
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ENV_FILE="$SCRIPT_DIR/../.env"

# Auto-load backend/.env file
if [ -f "$ENV_FILE" ]; then
    log_info "Loading configuration from: $ENV_FILE"
    # Use export and source to load environment variables
    set -a
    source "$ENV_FILE"
    set +a
else
    log_warn "Configuration file not found: $ENV_FILE"
    log_warn "Using environment variables or default values"
fi

# Default database configuration (if environment variables are not set)
DB_HOST="${DB_HOST:-localhost}"
DB_PORT="${DB_PORT:-3306}"
DB_NAME="${DB_NAME:-sipp_manager}"
DB_USER="${DB_USER:-root}"
DB_PASSWORD="${DB_PASSWORD:-}"
DB_CONTAINER="${DB_CONTAINER:-}"

check_failed=0

log_info "========================================"
log_info "SIPp Web Manager Database Check"
log_info "========================================"
echo ""

log_info "Database Configuration:"
echo "  Host: $DB_HOST"
echo "  Port: $DB_PORT"
echo "  Database: $DB_NAME"
echo "  User: $DB_USER"
if [ -n "$DB_CONTAINER" ]; then
    echo "  Container: $DB_CONTAINER (Using Docker)"
fi
echo ""

# Build MySQL command
MYSQL_CMD=""

# 1. If container name is specified, use docker exec
if [ -n "$DB_CONTAINER" ]; then
    log_info "Detected database container: $DB_CONTAINER"
    
    if ! command -v docker &> /dev/null; then
        log_error "Docker command not found"
        log_error "Please install Docker or set DB_CONTAINER to empty"
        exit 1
    fi
    
    if ! docker ps | grep -q "$DB_CONTAINER"; then
        log_error "Container $DB_CONTAINER is not running"
        log_error "Please start the container first: docker start $DB_CONTAINER"
        exit 1
    fi
    
    # Build docker exec mysql command
    if [ -n "$DB_PASSWORD" ]; then
        MYSQL_CMD="docker exec -i $DB_CONTAINER mysql -u$DB_USER -p$DB_PASSWORD"
    else
        MYSQL_CMD="docker exec -i $DB_CONTAINER mysql -u$DB_USER"
    fi
else
    # 2. Use local mysql client
    if ! command -v mysql &> /dev/null; then
        log_error "MySQL client not found"
        log_error "Please install MySQL client or specify DB_CONTAINER for Docker mode"
        exit 1
    fi
    
    # Build local mysql command
    if [ -n "$DB_PASSWORD" ]; then
        MYSQL_CMD="mysql -h$DB_HOST -P$DB_PORT -u$DB_USER -p$DB_PASSWORD"
    else
        MYSQL_CMD="mysql -h$DB_HOST -P$DB_PORT -u$DB_USER"
    fi
fi

# 1. Check MySQL connection
log_info "[1/5] Checking MySQL connection..."
if $MYSQL_CMD -e "SELECT 1" > /dev/null 2>&1; then
    log_info "✓ MySQL connection OK"
else
    log_error "✗ MySQL connection failed"
    log_error "  Please check: 1) MySQL service is running 2) Username/password is correct"
    check_failed=1
fi
echo ""

# 2. Check if database exists
log_info "[2/5] Checking database..."
if $MYSQL_CMD -e "USE $DB_NAME" > /dev/null 2>&1; then
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
    if $MYSQL_CMD -D"$DB_NAME" -e "SHOW TABLES LIKE '$table'" 2>/dev/null | grep -q "$table"; then
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
    if $MYSQL_CMD -D"$DB_NAME" -e "SHOW TABLES LIKE '$table'" 2>/dev/null | grep -q "$table"; then
        IFS=',' read -ra fields <<< "${TABLE_FIELDS[$table]}"
        for field in "${fields[@]}"; do
            if $MYSQL_CMD -D"$DB_NAME" -e "DESCRIBE $table" 2>/dev/null | grep -q "^$field"; then
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
    if $MYSQL_CMD -D"$DB_NAME" -e "SHOW TABLES LIKE '$table'" 2>/dev/null | grep -q "$table"; then
        count=$($MYSQL_CMD -D"$DB_NAME" -sN -e "SELECT COUNT(*) FROM $table" 2>/dev/null)
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
