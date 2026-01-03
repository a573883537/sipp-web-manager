#!/bin/bash
# ============================================
# 本地升级脚本 - 从机自动拉取更新
# ============================================
# 用途：在从机上执行，自动从 Git 拉取最新代码并升级
# 使用：./local-upgrade.sh
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

# ============================================
# 函数：检查前置条件
# ============================================
check_prerequisites() {
    print_step "检查前置条件..."
    
    # 检查是否在项目根目录
    if [ ! -f "package.json" ] || [ ! -d "backend" ] || [ ! -d "frontend" ]; then
        print_error "请在项目根目录执行此脚本"
        exit 1
    fi
    
    # 检查 Git
    if ! command -v git &> /dev/null; then
        print_error "Git 未安装"
        exit 1
    fi
    
    # 检查是否是 Git 仓库
    if [ ! -d ".git" ]; then
        print_error "当前目录不是 Git 仓库"
        exit 1
    fi
    
    print_success "前置条件检查通过"
}

# ============================================
# 函数：备份配置文件
# ============================================
backup_config() {
    print_step "备份配置文件..."
    
    if [ -f "backend/.env" ]; then
        cp backend/.env backend/.env.backup
        print_success "配置文件已备份: backend/.env.backup"
    else
        print_warning "未找到配置文件: backend/.env"
    fi
}

# ============================================
# 函数：拉取最新代码
# ============================================
pull_latest_code() {
    print_step "拉取最新代码..."
    
    # 检查是否有未提交的更改
    if ! git diff-index --quiet HEAD --; then
        print_warning "检测到未提交的更改"
        echo ""
        git status -s
        echo ""
        read -p "是否暂存这些更改并继续？(y/N) " -n 1 -r
        echo
        if [[ $REPLY =~ ^[Yy]$ ]]; then
            git stash
            print_success "更改已暂存"
        else
            print_error "取消升级"
            exit 1
        fi
    fi
    
    # 拉取最新代码
    git pull
    
    if [ $? -eq 0 ]; then
        print_success "代码拉取完成"
    else
        print_error "代码拉取失败"
        exit 1
    fi
}

# ============================================
# 函数：更新依赖
# ============================================
update_dependencies() {
    print_step "更新依赖..."
    
    # 后端依赖
    echo ""
    print_step "更新后端依赖..."
    cd backend
    npm install --production
    print_success "后端依赖更新完成"
    
    # 前端依赖
    echo ""
    print_step "更新前端依赖..."
    cd ../frontend
    npm install
    print_success "前端依赖更新完成"
    
    cd ..
}

# ============================================
# 函数：编译代码
# ============================================
build_code() {
    print_step "编译代码..."
    
    # 编译后端
    echo ""
    print_step "编译后端..."
    cd backend
    npm run build
    print_success "后端编译完成"
    
    # 编译前端
    echo ""
    print_step "编译前端..."
    cd ../frontend
    npm run build
    print_success "前端编译完成"
    
    cd ..
}

# ============================================
# 函数：重启服务
# ============================================
restart_service() {
    print_step "重启服务..."
    
    if [ -f "service.sh" ]; then
        ./service.sh restart
        print_success "服务重启完成"
    else
        print_warning "service.sh 未找到，请手动重启服务"
    fi
}

# ============================================
# 函数：显示版本信息
# ============================================
show_version() {
    print_step "当前版本信息:"
    echo ""
    echo "Git 提交: $(git rev-parse --short HEAD)"
    echo "Git 分支: $(git branch --show-current)"
    echo "最新提交: $(git log -1 --pretty=format:'%s' --abbrev-commit)"
    echo "提交时间: $(git log -1 --pretty=format:'%cd' --date=format:'%Y-%m-%d %H:%M:%S')"
    echo ""
}

# ============================================
# 主函数
# ============================================
main() {
    echo "========================================"
    echo "SIPp Web Manager - 本地升级"
    echo "========================================"
    echo ""
    
    # 检查前置条件
    check_prerequisites
    
    # 显示当前版本
    show_version
    
    # 确认升级
    read -p "确认开始升级？(y/N) " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        print_warning "取消升级"
        exit 0
    fi
    
    echo ""
    echo "========================================"
    echo "开始升级流程"
    echo "========================================"
    
    # 1. 备份配置
    backup_config
    
    # 2. 拉取代码
    echo ""
    pull_latest_code
    
    # 3. 更新依赖
    echo ""
    update_dependencies
    
    # 4. 编译代码
    echo ""
    build_code
    
    # 5. 重启服务
    echo ""
    restart_service
    
    # 显示新版本信息
    echo ""
    echo "========================================"
    print_success "升级完成！"
    echo "========================================"
    show_version
}

# 执行主函数
main "$@"

