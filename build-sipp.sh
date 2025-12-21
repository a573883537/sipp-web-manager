#!/bin/bash
#
# SIPp 一键编译脚本
# 功能：
#   1. 安装编译依赖
#   2. 应用自定义修改（禁用 DTMF no-op 填充包）
#   3. 配置并编译 SIPp（启用 TLS + PCAP 支持）
#   4. 安装到系统路径
#
# 使用方法：
#   sudo ./build-sipp.sh
#
# 作者：自动生成
# 日期：2025-12-20
#

set -e  # 遇到错误立即退出

# 颜色定义
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
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

log_step() {
    echo -e "${BLUE}[STEP]${NC} $1"
}

# 检查是否以 root 权限运行
check_root() {
    if [[ $EUID -ne 0 ]]; then
        log_error "此脚本需要 root 权限运行"
        log_info "请使用: sudo $0"
        exit 1
    fi
}

# 获取脚本所在目录（SIPp 源码根目录）
SIPP_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
log_info "SIPp 源码目录: ${SIPP_DIR}"

# 检查是否在正确的目录
check_directory() {
    if [[ ! -f "${SIPP_DIR}/CMakeLists.txt" ]]; then
        log_error "未找到 CMakeLists.txt，请确保在 SIPp 源码根目录运行此脚本"
        exit 1
    fi

    if [[ ! -f "${SIPP_DIR}/src/prepare_pcap.c" ]]; then
        log_error "未找到 src/prepare_pcap.c 文件"
        exit 1
    fi

    log_info "目录检查通过"
}

# 安装编译依赖
install_dependencies() {
    log_step "步骤 1/6: 安装编译依赖"

    # 更新包列表
    log_info "更新包列表..."
    apt-get update -qq

    # 安装依赖包
    log_info "安装依赖包..."
    apt-get install -y \
        build-essential \
        cmake \
        libssl-dev \
        libpcap-dev \
        libncurses5-dev \
        libsctp-dev \
        git \
        > /dev/null 2>&1

    log_info "依赖安装完成"
}

# 应用源码修改（禁用 no-op 填充包）
apply_source_patch() {
    log_step "步骤 2/6: 应用源码修改（禁用 DTMF no-op 填充包）"

    local pcap_file="${SIPP_DIR}/src/prepare_pcap.c"

    # 检查是否已经修改过
    if grep -q "needs_filler = 0; /\* 禁用 no-op 填充包 \*/" "${pcap_file}"; then
        log_warn "源码已经修改过，跳过"
        return 0
    fi

    # 备份原文件
    if [[ ! -f "${pcap_file}.orig" ]]; then
        log_info "备份原文件到 ${pcap_file}.orig"
        cp "${pcap_file}" "${pcap_file}.orig"
    fi

    # 应用修改：将 line 571 的 needs_filler = 1 改为 needs_filler = 0
    log_info "修改 ${pcap_file}..."
    sed -i '571s/needs_filler = 1;/needs_filler = 0; \/* 禁用 no-op 填充包 *\//' "${pcap_file}"

    # 验证修改
    if grep -q "needs_filler = 0; /\* 禁用 no-op 填充包 \*/" "${pcap_file}"; then
        log_info "源码修改成功"
    else
        log_error "源码修改失败"
        # 恢复原文件
        if [[ -f "${pcap_file}.orig" ]]; then
            cp "${pcap_file}.orig" "${pcap_file}"
        fi
        exit 1
    fi
}

# 清理旧的编译文件
clean_build() {
    log_step "步骤 3/6: 清理旧的编译文件"

    cd "${SIPP_DIR}"

    # 清理 CMake 缓存和编译产物
    log_info "清理 CMake 缓存..."
    rm -rf CMakeCache.txt CMakeFiles cmake_install.cmake Makefile

    # 清理旧的可执行文件
    log_info "清理旧的可执行文件..."
    rm -f sipp

    log_info "清理完成"
}

# 配置 CMake
configure_cmake() {
    log_step "步骤 4/6: 配置 CMake"

    cd "${SIPP_DIR}"

    log_info "配置选项:"
    log_info "  - USE_PCAP=ON    (启用 PCAP 支持，用于 DTMF)"
    log_info "  - USE_SSL=ON     (启用 TLS 支持)"
    log_info "  - USE_SCTP=OFF   (禁用 SCTP 支持)"

    cmake . \
        -DUSE_PCAP=ON \
        -DUSE_SSL=ON \
        -DUSE_SCTP=OFF \
        > /dev/null 2>&1

    if [[ $? -eq 0 ]]; then
        log_info "CMake 配置成功"
    else
        log_error "CMake 配置失败"
        exit 1
    fi
}

# 编译 SIPp
compile_sipp() {
    log_step "步骤 5/6: 编译 SIPp"

    cd "${SIPP_DIR}"

    # 获取 CPU 核心数
    local cpu_cores=$(nproc)
    log_info "使用 ${cpu_cores} 个 CPU 核心并行编译"

    # 开始编译
    log_info "开始编译（这可能需要几分钟）..."
    if make -j${cpu_cores}; then
        log_info "编译成功"
    else
        log_error "编译失败"
        exit 1
    fi

    # 验证可执行文件
    if [[ -f "${SIPP_DIR}/sipp" ]]; then
        log_info "生成的可执行文件: ${SIPP_DIR}/sipp"
    else
        log_error "未找到编译后的可执行文件"
        exit 1
    fi
}

# 安装 SIPp
install_sipp() {
    log_step "步骤 6/6: 安装 SIPp 到系统路径"

    cd "${SIPP_DIR}"

    # 安装到 /usr/local/bin
    log_info "安装到 /usr/local/bin/sipp..."
    make install > /dev/null 2>&1

    if [[ $? -eq 0 ]]; then
        log_info "安装成功"
    else
        log_error "安装失败"
        exit 1
    fi
}

# 验证安装
verify_installation() {
    log_step "验证安装"

    # 检查可执行文件
    if [[ ! -f "/usr/local/bin/sipp" ]]; then
        log_error "未找到 /usr/local/bin/sipp"
        exit 1
    fi

    # 检查版本信息
    log_info "SIPp 版本信息:"
    /usr/local/bin/sipp -v 2>&1 | head -n 1

    # 检查支持的功能
    local version_info=$(/usr/local/bin/sipp -v 2>&1 | head -n 1)

    echo ""
    log_info "功能检查:"

    if echo "${version_info}" | grep -q "TLS"; then
        echo -e "  ${GREEN}✓${NC} TLS 支持已启用"
    else
        echo -e "  ${RED}✗${NC} TLS 支持未启用"
    fi

    if echo "${version_info}" | grep -q "PCAP"; then
        echo -e "  ${GREEN}✓${NC} PCAP 支持已启用（可使用 DTMF）"
    else
        echo -e "  ${RED}✗${NC} PCAP 支持未启用"
    fi

    if grep -q "needs_filler = 0" "${SIPP_DIR}/src/prepare_pcap.c"; then
        echo -e "  ${GREEN}✓${NC} no-op 填充包已禁用"
    else
        echo -e "  ${YELLOW}!${NC} no-op 填充包未禁用"
    fi

    echo ""
    log_info "安装路径: $(which sipp)"
}

# 显示使用提示
show_usage_tips() {
    echo ""
    echo -e "${BLUE}========================================${NC}"
    echo -e "${GREEN}SIPp 编译安装完成！${NC}"
    echo -e "${BLUE}========================================${NC}"
    echo ""
    echo "使用示例:"
    echo "  1. 查看帮助:"
    echo "     sipp -h"
    echo ""
    echo "  2. UAC 模式发起呼叫:"
    echo "     sipp -sf scenario.xml -inf users.csv 192.168.1.100"
    echo ""
    echo "  3. UAS 模式接收呼叫:"
    echo "     sipp -sn uas -p 5070"
    echo ""
    echo "  4. 使用 DTMF:"
    echo "     在 XML 中使用: <exec play_dtmf=\"123#,160\"/>"
    echo ""
    echo "配置文件路径:"
    echo "  - 场景文件: /home/wangjf/sipp-web-manager/scenarios/"
    echo "  - 注入文件: /home/wangjf/sipp-web-manager/injections/"
    echo ""
    echo "特殊修改:"
    echo "  - 已禁用 DTMF 前的 no-op 填充包（payload 97）"
    echo "  - 备份文件: ${SIPP_DIR}/src/prepare_pcap.c.orig"
    echo ""
}

# 主函数
main() {
    echo ""
    echo -e "${BLUE}========================================${NC}"
    echo -e "${GREEN}SIPp 一键编译安装脚本${NC}"
    echo -e "${BLUE}========================================${NC}"
    echo ""

    # 检查权限
    check_root

    # 检查目录
    check_directory

    # 执行编译流程
    install_dependencies
    apply_source_patch
    clean_build
    configure_cmake
    compile_sipp
    install_sipp
    verify_installation
    show_usage_tips

    echo -e "${GREEN}全部完成！${NC}"
    echo ""
}

# 执行主函数
main "$@"
