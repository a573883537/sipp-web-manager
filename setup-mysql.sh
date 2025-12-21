#!/bin/bash

# ============================================
# MySQL 数据库快速搭建脚本
# 支持：Docker 容器部署、本地安装
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

# 显示横幅
show_banner() {
    cat << "EOF"
╔════════════════════════════════════════════════════════════╗
║         MySQL 数据库快速搭建工具                           ║
║         for SIPp Web Manager                               ║
╚════════════════════════════════════════════════════════════╝
EOF
}

# 检测系统类型
detect_os() {
    if [ -f /etc/os-release ]; then
        . /etc/os-release
        OS=$ID
        VERSION=$VERSION_ID
    elif command -v lsb_release &> /dev/null; then
        OS=$(lsb_release -si | tr '[:upper:]' '[:lower:]')
        VERSION=$(lsb_release -sr)
    else
        OS=$(uname -s)
        VERSION=$(uname -r)
    fi
    
    print_info "检测到操作系统: $OS $VERSION"
}

# 检查 Docker 是否安装
check_docker() {
    if command -v docker &> /dev/null; then
        if docker ps &> /dev/null; then
            return 0
        else
            print_warning "Docker 已安装但未运行，尝试启动..."
            sudo systemctl start docker 2>/dev/null || sudo service docker start 2>/dev/null
            sleep 2
            if docker ps &> /dev/null; then
                return 0
            else
                return 1
            fi
        fi
    else
        return 1
    fi
}

# 安装 Docker
install_docker() {
    print_info "开始安装 Docker..."
    
    case "$OS" in
        ubuntu|debian)
            # 卸载旧版本
            sudo apt-get remove -y docker docker-engine docker.io containerd runc 2>/dev/null
            
            # 更新软件包索引
            sudo apt-get update
            
            # 安装依赖
            sudo apt-get install -y \
                ca-certificates \
                curl \
                gnupg \
                lsb-release
            
            # 添加 Docker 官方 GPG key
            sudo mkdir -p /etc/apt/keyrings
            curl -fsSL https://download.docker.com/linux/$OS/gpg | sudo gpg --dearmor -o /etc/apt/keyrings/docker.gpg
            
            # 设置仓库
            echo \
              "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/$OS \
              $(lsb_release -cs) stable" | sudo tee /etc/apt/sources.list.d/docker.list > /dev/null
            
            # 安装 Docker Engine
            sudo apt-get update
            sudo apt-get install -y docker-ce docker-ce-cli containerd.io docker-compose-plugin
            ;;
            
        centos|rhel|fedora)
            # 卸载旧版本
            sudo yum remove -y docker docker-client docker-client-latest docker-common docker-latest docker-latest-logrotate docker-logrotate docker-engine 2>/dev/null
            
            # 安装依赖
            sudo yum install -y yum-utils
            
            # 添加 Docker 仓库
            sudo yum-config-manager --add-repo https://download.docker.com/linux/centos/docker-ce.repo
            
            # 安装 Docker Engine
            sudo yum install -y docker-ce docker-ce-cli containerd.io docker-compose-plugin
            ;;
            
        *)
            print_error "不支持的操作系统: $OS"
            return 1
            ;;
    esac
    
    # 启动 Docker
    sudo systemctl start docker
    sudo systemctl enable docker
    
    # 添加当前用户到 docker 组（可选）
    sudo usermod -aG docker $USER
    
    print_success "Docker 安装完成"
    print_warning "注意：您可能需要注销并重新登录以使 docker 组权限生效"
    
    return 0
}

# 使用 Docker 部署 MySQL
deploy_mysql_docker() {
    print_info "使用 Docker 部署 MySQL..."
    
    # 默认配置
    CONTAINER_NAME="sipp-mysql"
    MYSQL_ROOT_PASSWORD=""
    MYSQL_DATABASE="sipp_manager"
    MYSQL_PORT="3306"
    
    # 交互式配置
    echo ""
    read -p "容器名称 [sipp-mysql]: " input
    [ -n "$input" ] && CONTAINER_NAME="$input"
    
    read -p "MySQL root 密码 [留空表示无密码]: " MYSQL_ROOT_PASSWORD
    
    read -p "数据库名称 [sipp_manager]: " input
    [ -n "$input" ] && MYSQL_DATABASE="$input"
    
    read -p "映射端口 [3306]: " input
    [ -n "$input" ] && MYSQL_PORT="$input"
    
    echo ""
    print_info "配置信息："
    echo "  容器名称: $CONTAINER_NAME"
    echo "  Root 密码: ${MYSQL_ROOT_PASSWORD:-<无密码>}"
    echo "  数据库名: $MYSQL_DATABASE"
    echo "  映射端口: $MYSQL_PORT"
    echo ""
    
    read -p "确认部署？(y/n) " -r
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        print_warning "已取消部署"
        return 1
    fi
    
    # 检查容器是否已存在
    if docker ps -a --format '{{.Names}}' | grep -q "^${CONTAINER_NAME}$"; then
        print_warning "容器 $CONTAINER_NAME 已存在"
        read -p "是否删除并重新创建？(y/n) " -r
        if [[ $REPLY =~ ^[Yy]$ ]]; then
            docker stop "$CONTAINER_NAME" 2>/dev/null
            docker rm "$CONTAINER_NAME" 2>/dev/null
        else
            print_warning "已取消部署"
            return 1
        fi
    fi
    
    # 检查端口是否被占用
    if lsof -i :$MYSQL_PORT &> /dev/null; then
        print_error "端口 $MYSQL_PORT 已被占用"
        lsof -i :$MYSQL_PORT
        return 1
    fi
    
    # 启动 MySQL 容器
    print_info "正在启动 MySQL 容器..."
    
    DOCKER_CMD="docker run -d \
      --name $CONTAINER_NAME \
      -e MYSQL_DATABASE=$MYSQL_DATABASE \
      -p $MYSQL_PORT:3306 \
      --restart unless-stopped"
    
    # 处理密码
    if [ -n "$MYSQL_ROOT_PASSWORD" ]; then
        DOCKER_CMD="$DOCKER_CMD -e MYSQL_ROOT_PASSWORD='$MYSQL_ROOT_PASSWORD'"
    else
        DOCKER_CMD="$DOCKER_CMD -e MYSQL_ALLOW_EMPTY_PASSWORD=yes"
    fi
    
    # 添加数据卷（持久化数据）
    DOCKER_CMD="$DOCKER_CMD -v sipp-mysql-data:/var/lib/mysql"
    
    # 指定 MySQL 镜像
    DOCKER_CMD="$DOCKER_CMD mysql:8.0"
    
    # 执行部署
    eval $DOCKER_CMD
    
    if [ $? -ne 0 ]; then
        print_error "容器启动失败"
        return 1
    fi
    
    print_success "MySQL 容器已启动"
    print_info "等待 MySQL 初始化..."
    
    # 等待 MySQL 就绪
    for i in {1..30}; do
        if docker exec $CONTAINER_NAME mysqladmin ping -h localhost --silent &> /dev/null; then
            print_success "MySQL 已就绪"
            break
        fi
        echo -n "."
        sleep 2
    done
    echo ""
    
    # 显示连接信息
    echo ""
    echo "╔════════════════════════════════════════════════════════════╗"
    echo "║              MySQL 部署成功                                 ║"
    echo "╠════════════════════════════════════════════════════════════╣"
    echo "║                                                            ║"
    echo "║  容器名称:   $CONTAINER_NAME"
    echo "║  数据库名:   $MYSQL_DATABASE"
    echo "║  端口:       $MYSQL_PORT"
    echo "║  Root密码:   ${MYSQL_ROOT_PASSWORD:-<无密码>}"
    echo "║                                                            ║"
    echo "║  连接命令:                                                 ║"
    if [ -n "$MYSQL_ROOT_PASSWORD" ]; then
        echo "║  mysql -h 127.0.0.1 -P $MYSQL_PORT -u root -p"
    else
        echo "║  mysql -h 127.0.0.1 -P $MYSQL_PORT -u root"
    fi
    echo "║                                                            ║"
    echo "║  环境变量配置 (backend/.env):                              ║"
    echo "║  DB_HOST=localhost"
    echo "║  DB_PORT=$MYSQL_PORT"
    echo "║  DB_NAME=$MYSQL_DATABASE"
    echo "║  DB_USER=root"
    echo "║  DB_PASSWORD=$MYSQL_ROOT_PASSWORD"
    echo "║  DB_CONTAINER=$CONTAINER_NAME"
    echo "║                                                            ║"
    echo "╚════════════════════════════════════════════════════════════╝"
    echo ""
    
    # 保存配置到文件
    cat > mysql-docker-config.txt << EOF
# MySQL Docker 配置信息
容器名称: $CONTAINER_NAME
数据库名: $MYSQL_DATABASE
端口: $MYSQL_PORT
Root密码: ${MYSQL_ROOT_PASSWORD:-<无密码>}

# backend/.env 配置
DB_HOST=localhost
DB_PORT=$MYSQL_PORT
DB_NAME=$MYSQL_DATABASE
DB_USER=root
DB_PASSWORD=$MYSQL_ROOT_PASSWORD
DB_CONTAINER=$CONTAINER_NAME

# 常用命令
# 查看容器状态
docker ps | grep $CONTAINER_NAME

# 查看容器日志
docker logs $CONTAINER_NAME

# 进入容器
docker exec -it $CONTAINER_NAME bash

# 连接 MySQL
docker exec -it $CONTAINER_NAME mysql -u root ${MYSQL_ROOT_PASSWORD:+-p}

# 停止容器
docker stop $CONTAINER_NAME

# 启动容器
docker start $CONTAINER_NAME

# 删除容器（数据会保留在 volume 中）
docker stop $CONTAINER_NAME
docker rm $CONTAINER_NAME

# 删除容器和数据
docker stop $CONTAINER_NAME
docker rm $CONTAINER_NAME
docker volume rm sipp-mysql-data
EOF
    
    print_success "配置信息已保存到: mysql-docker-config.txt"
    
    # 询问是否立即初始化数据库
    echo ""
    read -p "是否立即初始化 SIPp Web Manager 数据库？(y/n) " -r
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        cd backend/database 2>/dev/null || {
            print_warning "未找到 backend/database 目录，请手动执行初始化"
            return 0
        }
        
        export DB_CONTAINER=$CONTAINER_NAME
        export DB_USER=root
        export DB_PASSWORD=$MYSQL_ROOT_PASSWORD
        export DB_NAME=$MYSQL_DATABASE
        
        print_info "执行数据库初始化..."
        ./init-db.sh
        
        if [ $? -eq 0 ]; then
            print_success "数据库初始化完成"
        else
            print_error "数据库初始化失败，请检查日志"
        fi
    fi
    
    return 0
}

# 本地安装 MySQL
install_mysql_local() {
    print_info "本地安装 MySQL..."
    
    case "$OS" in
        ubuntu|debian)
            print_info "更新软件包列表..."
            sudo apt-get update
            
            print_info "安装 MySQL Server..."
            sudo apt-get install -y mysql-server mysql-client
            
            # 启动服务
            sudo systemctl start mysql
            sudo systemctl enable mysql
            ;;
            
        centos|rhel)
            if [ "${VERSION%%.*}" -ge 8 ]; then
                # CentOS/RHEL 8+
                print_info "安装 MySQL Server..."
                sudo yum install -y mysql-server
            else
                # CentOS/RHEL 7
                print_info "安装 MariaDB..."
                sudo yum install -y mariadb-server mariadb
            fi
            
            # 启动服务
            if [ "${VERSION%%.*}" -ge 8 ]; then
                sudo systemctl start mysqld
                sudo systemctl enable mysqld
            else
                sudo systemctl start mariadb
                sudo systemctl enable mariadb
            fi
            ;;
            
        fedora)
            print_info "安装 MySQL Server..."
            sudo dnf install -y mysql-server
            
            # 启动服务
            sudo systemctl start mysqld
            sudo systemctl enable mysqld
            ;;
            
        *)
            print_error "不支持的操作系统: $OS"
            return 1
            ;;
    esac
    
    if [ $? -ne 0 ]; then
        print_error "MySQL 安装失败"
        return 1
    fi
    
    print_success "MySQL 安装完成"
    
    # 显示安全配置提示
    echo ""
    echo "╔════════════════════════════════════════════════════════════╗"
    echo "║              MySQL 安装成功                                 ║"
    echo "╠════════════════════════════════════════════════════════════╣"
    echo "║                                                            ║"
    echo "║  下一步：配置 MySQL 安全设置                                ║"
    echo "║                                                            ║"
    echo "║  执行命令:                                                 ║"
    echo "║  sudo mysql_secure_installation                            ║"
    echo "║                                                            ║"
    echo "║  建议配置:                                                 ║"
    echo "║  - 设置 root 密码                                          ║"
    echo "║  - 删除匿名用户: Yes                                       ║"
    echo "║  - 禁止 root 远程登录: Yes                                 ║"
    echo "║  - 删除测试数据库: Yes                                     ║"
    echo "║  - 重载权限表: Yes                                         ║"
    echo "║                                                            ║"
    echo "╚════════════════════════════════════════════════════════════╝"
    echo ""
    
    read -p "是否立即执行安全配置？(y/n) " -r
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        sudo mysql_secure_installation
    fi
    
    # 询问是否创建数据库
    echo ""
    read -p "是否立即创建 SIPp Web Manager 数据库？(y/n) " -r
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        cd backend/database 2>/dev/null || {
            print_warning "未找到 backend/database 目录，请手动执行初始化"
            return 0
        }
        
        read -p "MySQL root 密码: " -s MYSQL_ROOT_PASSWORD
        echo ""
        
        export DB_HOST=localhost
        export DB_PORT=3306
        export DB_USER=root
        export DB_PASSWORD=$MYSQL_ROOT_PASSWORD
        export DB_NAME=sipp_manager
        
        print_info "执行数据库初始化..."
        ./init-db.sh
        
        if [ $? -eq 0 ]; then
            print_success "数据库初始化完成"
            
            # 显示配置信息
            echo ""
            echo "请在 backend/.env 中配置:"
            echo "DB_HOST=localhost"
            echo "DB_PORT=3306"
            echo "DB_NAME=sipp_manager"
            echo "DB_USER=root"
            echo "DB_PASSWORD=$MYSQL_ROOT_PASSWORD"
        else
            print_error "数据库初始化失败，请检查日志"
        fi
    fi
    
    return 0
}

# 主菜单
show_menu() {
    echo ""
    echo "请选择部署方式:"
    echo ""
    echo "  1) Docker 容器部署 (推荐)"
    echo "     - 快速部署，隔离性好"
    echo "     - 易于管理和迁移"
    echo "     - 需要安装 Docker"
    echo ""
    echo "  2) 本地安装 MySQL"
    echo "     - 传统部署方式"
    echo "     - 性能更好"
    echo "     - 直接安装到系统"
    echo ""
    echo "  3) 退出"
    echo ""
    read -p "请选择 [1-3]: " choice
    
    case $choice in
        1)
            if check_docker; then
                print_success "Docker 已安装且运行中"
                deploy_mysql_docker
            else
                print_warning "Docker 未安装或未运行"
                read -p "是否安装 Docker？(y/n) " -r
                if [[ $REPLY =~ ^[Yy]$ ]]; then
                    if install_docker; then
                        print_info "Docker 安装完成，请重新运行此脚本"
                        print_warning "您可能需要注销并重新登录"
                        exit 0
                    else
                        print_error "Docker 安装失败"
                        exit 1
                    fi
                fi
            fi
            ;;
        2)
            install_mysql_local
            ;;
        3)
            print_info "已退出"
            exit 0
            ;;
        *)
            print_error "无效的选择"
            show_menu
            ;;
    esac
}

# 主函数
main() {
    show_banner
    detect_os
    show_menu
}

# 执行
main

