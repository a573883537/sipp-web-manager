#!/bin/bash
# SIPp Web Manager - 本地开发启动脚本
# 用途：本地开发时快速启动后端（热重载）

set -e

echo "=== SIPp Web Manager 后端开发模式 ==="

# 检查 Node.js
if ! command -v node &> /dev/null; then
    echo "❌ 错误：未找到 Node.js，请先安装 Node.js 18+"
    exit 1
fi

echo "✅ Node.js 版本: $(node -v)"

# 进入后端目录
cd "$(dirname "$0")"

# 检查并加载 .env 文件
ENV_FILE=".env"
if [ -f "$ENV_FILE" ]; then
    echo "📝 加载配置文件: $ENV_FILE"
    set -a
    source "$ENV_FILE"
    set +a
else
    echo "⚠️  警告: 未找到 $ENV_FILE 文件，使用默认配置"
fi

# 设置开发环境变量（如果未设置）
export NODE_ENV="${NODE_ENV:-development}"
export PORT="${PORT:-3000}"
export SIPP_HOST="${SIPP_HOST:-localhost}"
export SIPP_CONTROL_PORT="${SIPP_CONTROL_PORT:-8888}"
export SIPP_CSV_PATH="${SIPP_CSV_PATH:-../data/sipp_stats.csv}"
export SIPP_SCENARIO_DIR="${SIPP_SCENARIO_DIR:-../scenarios}"
export SIPP_INJECTION_DIR="${SIPP_INJECTION_DIR:-../injections}"
export WS_CORS_ORIGIN="${WS_CORS_ORIGIN:-http://localhost:5173}"
export DB_HOST="${DB_HOST:-localhost}"
export DB_PORT="${DB_PORT:-3306}"
export DB_NAME="${DB_NAME:-sipp_manager}"
export DB_USER="${DB_USER:-root}"
export DB_PASSWORD="${DB_PASSWORD:-}"
export DB_POOL_SIZE="${DB_POOL_SIZE:-10}"
export LOG_LEVEL="${LOG_LEVEL:-debug}"

# 安装依赖（首次或 package.json 变更时需要）
if [ ! -d "node_modules" ]; then
    echo "📦 首次运行，正在安装依赖..."
    npm install
fi

echo ""
echo "=== 环境变量 ==="
echo "NODE_ENV: $NODE_ENV"
echo "PORT: $PORT"
echo "DB_HOST: $DB_HOST"
echo "SIPP_INJECTION_DIR: $SIPP_INJECTION_DIR"
echo ""

# 启动开发服务器（热重载）
echo "🚀 启动开发服务器（热重载模式）..."
echo "💡 提示: 修改代码后自动重启"
echo "🔗 API地址: http://localhost:3000"
echo "⏹️  停止服务: Ctrl+C"
echo ""

npm run dev
