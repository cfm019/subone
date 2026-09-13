#!/usr/bin/env bash
# ==============================================================================
# SubOne 一键安装与服务部署脚本 (All-in-One VPS Installer)
# 支持环境: Debian / Ubuntu / CentOS / RHEL / Rocky / AlmaLinux / Alpine
# 项目仓库: https://github.com/cfm019/subone
# ==============================================================================

set -e

# 颜色与样式
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
BOLD='\033[1m'
RESET='\033[0m'

REPO_URL="https://github.com/cfm019/subone.git"
REPO_PROXY_URL="https://ghproxy.net/https://github.com/cfm019/subone.git"
DEFAULT_PORT=3456
DEFAULT_INSTALL_DIR="/opt/subone"
SERVICE_NAME="subone"
INSTALL_DIR=""
ACTIVE_PORT="${DEFAULT_PORT}"

# 1. 检查操作系统与包管理器
detect_os() {
    if [ "$(uname -s)" = "Darwin" ]; then
        echo -e "${YELLOW}检测到当前系统为 macOS。此脚本专为 Linux VPS (Systemd) 一键部署设计。${RESET}"
        echo -e "本地开发请直接执行: npm install && npm run build && npm start"
        exit 1
    fi

    if [ -f /etc/os-release ]; then
        . /etc/os-release
        OS=$ID
    elif [ -f /etc/redhat-release ]; then
        OS="centos"
    else
        OS=$(uname -s | tr '[:upper:]' '[:lower:]')
    fi

    case "$OS" in
        ubuntu|debian|kali|armbian)
            PM="apt"
            ;;
        centos|rhel|rocky|almalinux|fedora|amzn)
            if command -v dnf >/dev/null 2>&1; then
                PM="dnf"
            else
                PM="yum"
            fi
            ;;
        alpine)
            PM="apk"
            ;;
        arch|manjaro)
            PM="pacman"
            ;;
        *)
            PM="unknown"
            ;;
    esac
}

# 2. 检查 root 权限
check_root() {
    if [ "$EUID" -ne 0 ]; then
        echo -e "${RED}[错误] 请以 root 权限运行此脚本！${RESET}"
        echo -e "可使用命令: ${BOLD}sudo bash $0${RESET} 或切换至 root 用户再运行。"
        exit 1
    fi
}

# 3. 小内存 VPS 自动配置 Swap (防止 npm 依赖安装或 vite 编译时内存溢出被 Kill)
setup_swap() {
    if command -v free >/dev/null 2>&1; then
        local mem_mb
        local swap_mb
        mem_mb=$(free -m | awk '/^Mem:/{print $2}')
        swap_mb=$(free -m | awk '/^Swap:/{print $2}')
        local total_mem=$((mem_mb + swap_mb))
        if [ "$total_mem" -lt 1500 ]; then
            echo -e "${YELLOW}ℹ️ 检测到系统内存较小 (${mem_mb}MB)，为保障前端编译稳定，正在配置 2GB Swap 虚拟内存...${RESET}"
            if [ ! -f /swapfile_subone ]; then
                fallocate -l 2G /swapfile_subone 2>/dev/null || dd if=/dev/zero of=/swapfile_subone bs=1M count=2048 2>/dev/null
                chmod 600 /swapfile_subone
                mkswap /swapfile_subone >/dev/null 2>&1
                swapon /swapfile_subone >/dev/null 2>&1
                if ! grep -q "/swapfile_subone" /etc/fstab 2>/dev/null; then
                    echo "/swapfile_subone none swap sw 0 0" >> /etc/fstab
                fi
                echo -e "${GREEN}✓ Swap 虚拟内存配置完成${RESET}"
            fi
        fi
    fi
}

# 4. 安装基础依赖工具
install_dependencies() {
    echo -e "${CYAN}==> [1/5] 安装必要系统组件 (curl, git, tar)...${RESET}"
    case "$PM" in
        apt)
            apt-get update -y -q >/dev/null 2>&1 || true
            apt-get install -y -q curl wget git tar xz-utils >/dev/null 2>&1
            ;;
        dnf|yum)
            $PM update -y -q >/dev/null 2>&1 || true
            $PM install -y -q curl wget git tar xz >/dev/null 2>&1
            ;;
        apk)
            apk update >/dev/null 2>&1 || true
            apk add --no-cache curl wget git tar xz bash >/dev/null 2>&1
            ;;
        pacman)
            pacman -Sy --noconfirm curl wget git tar xz >/dev/null 2>&1
            ;;
        *)
            echo -e "${YELLOW}未识别的包管理器，请确认系统中已存在 curl, git, tar 命令${RESET}"
            ;;
    esac
}

# 5. 检查与安装 Node.js (>= 20.0.0)
install_nodejs() {
    echo -e "${CYAN}==> [2/5] 检查与安装 Node.js 环境 (要求 >= 20.0.0)...${RESET}"
    if command -v node >/dev/null 2>&1; then
        local node_ver
        local node_major
        node_ver=$(node -v 2>/dev/null | tr -d 'v')
        node_major=$(echo "$node_ver" | cut -d'.' -f1)
        if [ "$node_major" -ge 20 ]; then
            echo -e "${GREEN}✓ 检测到已安装 Node.js v${node_ver} (>= 20)${RESET}"
            return 0
        else
            echo -e "${YELLOW}当前 Node.js 版本为 v${node_ver}，低于要求的 v20.0.0，正在升级至 Node.js 22 LTS...${RESET}"
        fi
    else
        echo -e "${YELLOW}未检测到 Node.js，正在安装 Node.js 22 LTS...${RESET}"
    fi

    local installed=0
    if [ "$PM" = "apt" ]; then
        echo -e "${CYAN}配置 NodeSource 22.x 源...${RESET}"
        curl -fsSL https://deb.nodesource.com/setup_22.x | bash - >/dev/null 2>&1 || true
        apt-get install -y nodejs >/dev/null 2>&1 || true
        if command -v node >/dev/null 2>&1 && [ "$(node -v | tr -d 'v' | cut -d'.' -f1)" -ge 20 ]; then
            installed=1
        fi
    elif [ "$PM" = "dnf" ] || [ "$PM" = "yum" ]; then
        echo -e "${CYAN}配置 NodeSource 22.x 源...${RESET}"
        curl -fsSL https://rpm.nodesource.com/setup_22.x | bash - >/dev/null 2>&1 || true
        $PM install -y nodejs >/dev/null 2>&1 || true
        if command -v node >/dev/null 2>&1 && [ "$(node -v | tr -d 'v' | cut -d'.' -f1)" -ge 20 ]; then
            installed=1
        fi
    fi

    # 官方二进制预编译包兜底安装 (适用于非标准系统或源失效场景)
    if [ "$installed" -ne 1 ]; then
        local arch
        arch=$(uname -m)
        local node_arch=""
        case "$arch" in
            x86_64|amd64) node_arch="x64" ;;
            aarch64|arm64) node_arch="arm64" ;;
            *) node_arch="" ;;
        esac

        if [ -n "$node_arch" ]; then
            echo -e "${YELLOW}通过 Node.js 官方预编译包进行安装 (v22.14.0 - ${node_arch})...${RESET}"
            local node_pkg="node-v22.14.0-linux-${node_arch}.tar.xz"
            local tmp_tar="/tmp/${node_pkg}"
            if curl -fsSL --connect-timeout 15 "https://nodejs.org/dist/v22.14.0/${node_pkg}" -o "$tmp_tar"; then
                tar -xJf "$tmp_tar" -C /usr/local --strip-components=1
                rm -f "$tmp_tar"
            else
                echo -e "${RED}[错误] 无法下载 Node.js 安装包，请检查网络连接！${RESET}"
                exit 1
            fi
        else
            echo -e "${RED}[错误] 暂不支持的 CPU 架构: ${arch}${RESET}"
            exit 1
        fi
    fi

    if ! command -v node >/dev/null 2>&1 || ! command -v npm >/dev/null 2>&1; then
        echo -e "${RED}[错误] Node.js 或 npm 安装失败，请检查系统环境${RESET}"
        exit 1
    fi
    echo -e "${GREEN}✓ Node.js $(node -v) 与 npm $(npm -v) 安装就绪${RESET}"
}

# 6. 获取或更新 SubOne 源码
setup_codebase() {
    echo -e "${CYAN}==> [3/5] 准备 SubOne 源码...${RESET}"
    local script_dir
    script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" 2>/dev/null && pwd || echo "")"

    # 如果在已有 subone 仓库目录中运行，直接使用该目录
    if [ -f "./package.json" ] && grep -q '"name": "subone"' "./package.json" 2>/dev/null; then
        INSTALL_DIR="$(pwd)"
        echo -e "${GREEN}✓ 检测到当前目录即为 SubOne 项目目录: ${INSTALL_DIR}${RESET}"
    elif [ -n "$script_dir" ] && [ -f "${script_dir}/package.json" ] && grep -q '"name": "subone"' "${script_dir}/package.json" 2>/dev/null; then
        INSTALL_DIR="${script_dir}"
        echo -e "${GREEN}✓ 检测到脚本所在目录为 SubOne 项目目录: ${INSTALL_DIR}${RESET}"
    else
        INSTALL_DIR="${DEFAULT_INSTALL_DIR}"
        if [ -d "${INSTALL_DIR}/.git" ]; then
            echo -e "${CYAN}检测到已存在安装目录 ${INSTALL_DIR}，正在拉取最新代码...${RESET}"
            cd "${INSTALL_DIR}"
            git fetch --all >/dev/null 2>&1 || true
            git reset --hard origin/main >/dev/null 2>&1 || true
        elif [ -d "${INSTALL_DIR}" ]; then
            echo -e "${CYAN}目录 ${INSTALL_DIR} 已存在，使用现有目录...${RESET}"
            cd "${INSTALL_DIR}"
        else
            echo -e "${CYAN}克隆 SubOne 仓库至 ${INSTALL_DIR}...${RESET}"
            mkdir -p "${INSTALL_DIR}"
            if ! git clone -b main "${REPO_URL}" "${INSTALL_DIR}" 2>/dev/null; then
                echo -e "${YELLOW}直接连接 GitHub 较慢或受限，尝试国内镜像加速克隆...${RESET}"
                git clone -b main "${REPO_PROXY_URL}" "${INSTALL_DIR}"
            fi
        fi
    fi
}

# 7. 安装项目依赖并编译
build_subone() {
    echo -e "${CYAN}==> [4/5] 安装 npm 依赖并编译前后端...${RESET}"
    cd "${INSTALL_DIR}"

    echo -e "  - 正在安装主依赖..."
    npm install --no-audit --no-fund

    if [ ! -d "web/node_modules" ]; then
        echo -e "  - 正在安装前端界面依赖..."
        (cd web && npm install --no-audit --no-fund)
    fi

    echo -e "  - 正在编译服务端与前端静态资源..."
    npm run build

    if [ ! -f "dist/server/index.js" ] || [ ! -f "web/dist/index.html" ]; then
        echo -e "${RED}[错误] 编译生成物不完整，未找到 dist/server/index.js 或 web/dist/index.html！${RESET}"
        exit 1
    fi
    echo -e "${GREEN}✓ 依赖安装与代码编译成功！${RESET}"
}

# 8. 配置文件处理
setup_config() {
    cd "${INSTALL_DIR}"
    local port="${DEFAULT_PORT}"

    if [ -f "config.json" ]; then
        local exist_port
        exist_port=$(grep -o '"port"[[:space:]]*:[[:space:]]*[0-9]*' config.json 2>/dev/null | grep -o '[0-9]*' || true)
        if [ -n "$exist_port" ]; then
            port="$exist_port"
        fi
        echo -e "${GREEN}✓ 保留已有配置文件 config.json (监听端口: ${port})${RESET}"
    else
        # 仅在交互式终端且有输入能力时等待输入端口，否则默认 3456
        if [ -t 0 ] && [ "$NON_INTERACTIVE" != "1" ]; then
            echo ""
            read -t 30 -p "请输入 Web 服务运行端口 [回车默认 ${DEFAULT_PORT}]: " user_port || true
            if [ -n "$user_port" ] && [[ "$user_port" =~ ^[0-9]+$ ]]; then
                port="$user_port"
            fi
        fi

        cat <<EOF > config.json
{
  "port": ${port},
  "adminPassword": ""
}
EOF
        echo -e "${GREEN}✓ 已创建配置文件 config.json (默认端口: ${port}，免密直接访问)${RESET}"
    fi

    ACTIVE_PORT="$port"
}

# 9. 配置 Systemd 服务并启动
setup_systemd() {
    echo -e "${CYAN}==> [5/5] 配置 Systemd 服务常驻运行...${RESET}"

    if ! command -v systemctl >/dev/null 2>&1; then
        echo -e "${YELLOW}系统未检测到 systemd，改用后台常驻方式启动...${RESET}"
        pkill -f "dist/server/index.js" 2>/dev/null || true
        local node_bin
        node_bin=$(command -v node)
        nohup "$node_bin" "${INSTALL_DIR}/dist/server/index.js" > "${INSTALL_DIR}/subone.log" 2>&1 &
        sleep 2
        return 0
    fi

    local node_bin
    node_bin=$(command -v node)

    cat <<EOF > /etc/systemd/system/${SERVICE_NAME}.service
[Unit]
Description=SubOne Subscription Service
After=network.target

[Service]
Type=simple
User=root
WorkingDirectory=${INSTALL_DIR}
ExecStart=${node_bin} ${INSTALL_DIR}/dist/server/index.js
Restart=always
RestartSec=5
Environment=NODE_ENV=production
LimitNOFILE=65535

[Install]
WantedBy=multi-user.target
EOF

    systemctl daemon-reload
    systemctl enable ${SERVICE_NAME} >/dev/null 2>&1
    systemctl restart ${SERVICE_NAME}

    # 自动开放防火墙端口
    if command -v ufw >/dev/null 2>&1 && ufw status 2>/dev/null | grep -qw "active"; then
        echo -e "${CYAN}放行 UFW 防火墙端口 ${ACTIVE_PORT}/tcp...${RESET}"
        ufw allow ${ACTIVE_PORT}/tcp >/dev/null 2>&1 || true
    fi
    if command -v firewall-cmd >/dev/null 2>&1 && systemctl is-active --quiet firewalld 2>/dev/null; then
        echo -e "${CYAN}放行 Firewalld 防火墙端口 ${ACTIVE_PORT}/tcp...${RESET}"
        firewall-cmd --zone=public --add-port=${ACTIVE_PORT}/tcp --permanent >/dev/null 2>&1 || true
        firewall-cmd --reload >/dev/null 2>&1 || true
    fi

    sleep 2
    if systemctl is-active --quiet ${SERVICE_NAME}; then
        echo -e "${GREEN}✓ ${SERVICE_NAME} 服务启动成功并已设置开机自启！${RESET}"
    else
        echo -e "${RED}⚠️ 服务启动可能有异常，请执行 journalctl -u ${SERVICE_NAME} -n 20 查看错误日志${RESET}"
    fi
}

# 10. 获取服务器外网 IP
get_public_ip() {
    local ip=""
    ip=$(curl -s4 --connect-timeout 3 https://api.ipify.org 2>/dev/null || true)
    [ -z "$ip" ] && ip=$(curl -s4 --connect-timeout 3 https://icanhazip.com 2>/dev/null || true)
    [ -z "$ip" ] && ip=$(curl -s4 --connect-timeout 3 https://ifconfig.me 2>/dev/null || true)
    [ -z "$ip" ] && ip=$(hostname -I 2>/dev/null | awk '{print $1}' || true)
    [ -z "$ip" ] && ip="YOUR_SERVER_IP"
    echo "$ip"
}

# 11. 显示完成界面
show_success() {
    local ip
    ip=$(get_public_ip)
    echo ""
    echo -e "${GREEN}================================================================${RESET}"
    echo -e "${BOLD}${GREEN}               🎉 SubOne 一键部署完成！${RESET}"
    echo -e "${GREEN}================================================================${RESET}"
    echo -e " 🌐 访问地址 (Web URL) : ${BOLD}${CYAN}http://${ip}:${ACTIVE_PORT}${RESET}"
    echo -e " 📁 安装目录 (WorkDir)  : ${CYAN}${INSTALL_DIR}${RESET}"
    echo -e " ⚙️ 配置文件 (Config)   : ${CYAN}${INSTALL_DIR}/config.json${RESET}"
    echo -e " 🔑 管理密码 (Password) : ${YELLOW}默认未启用密码（打开浏览器直接进入）${RESET}"
    echo -e "${GREEN}----------------------------------------------------------------${RESET}"
    echo -e " 🛠️ 常用管理命令:"
    echo -e "   • 查看运行状态 : ${BOLD}systemctl status ${SERVICE_NAME}${RESET}"
    echo -e "   • 查看实时日志 : ${BOLD}journalctl -u ${SERVICE_NAME} -f${RESET}"
    echo -e "   • 重启服务     : ${BOLD}systemctl restart ${SERVICE_NAME}${RESET}"
    echo -e "   • 停止服务     : ${BOLD}systemctl stop ${SERVICE_NAME}${RESET}"
    echo -e "   • 一键更新代码 : ${BOLD}bash ${INSTALL_DIR}/install.sh update${RESET}"
    echo -e "   • 脚本指令帮助 : ${BOLD}bash ${INSTALL_DIR}/install.sh help${RESET}"
    echo -e "${GREEN}================================================================${RESET}"
    echo -e " 💡 如需开启管理密码，可修改 ${CYAN}${INSTALL_DIR}/config.json${RESET} 中的 adminPassword 后重启服务。"
    echo -e " 👉 现在打开浏览器访问上述地址即可立即使用 SubOne！"
    echo ""
}

# 命令分发处理
main() {
    case "$1" in
        update)
            detect_os
            check_root
            setup_codebase
            build_subone
            if command -v systemctl >/dev/null 2>&1; then
                systemctl restart ${SERVICE_NAME}
            else
                pkill -f "dist/server/index.js" 2>/dev/null || true
                nohup node "${INSTALL_DIR}/dist/server/index.js" > "${INSTALL_DIR}/subone.log" 2>&1 &
            fi
            echo -e "${GREEN}✓ SubOne 更新完成并已重启服务！${RESET}"
            ;;
        restart)
            if command -v systemctl >/dev/null 2>&1; then
                systemctl restart ${SERVICE_NAME}
                echo -e "${GREEN}✓ ${SERVICE_NAME} 服务已重启${RESET}"
            else
                echo -e "${YELLOW}请手动重启服务${RESET}"
            fi
            ;;
        stop)
            if command -v systemctl >/dev/null 2>&1; then
                systemctl stop ${SERVICE_NAME}
                echo -e "${YELLOW}✓ ${SERVICE_NAME} 服务已停止${RESET}"
            fi
            ;;
        status)
            if command -v systemctl >/dev/null 2>&1; then
                systemctl status ${SERVICE_NAME}
            fi
            ;;
        log)
            if command -v journalctl >/dev/null 2>&1; then
                journalctl -u ${SERVICE_NAME} -f -n 50
            else
                tail -f /opt/subone/subone.log 2>/dev/null || true
            fi
            ;;
        uninstall)
            detect_os
            check_root
            echo -e "${RED}正在卸载 SubOne 服务...${RESET}"
            if command -v systemctl >/dev/null 2>&1; then
                systemctl stop ${SERVICE_NAME} 2>/dev/null || true
                systemctl disable ${SERVICE_NAME} 2>/dev/null || true
                rm -f /etc/systemd/system/${SERVICE_NAME}.service
                systemctl daemon-reload
            fi
            read -p "是否删除程序目录 ${DEFAULT_INSTALL_DIR} 及所有配置和数据？[y/N]: " confirm
            if [[ "$confirm" =~ ^[yY]$ ]]; then
                rm -rf "${DEFAULT_INSTALL_DIR}"
                echo -e "${GREEN}✓ 已删除程序文件与数据${RESET}"
            fi
            echo -e "${GREEN}✓ SubOne 卸载完成${RESET}"
            ;;
        help|--help|-h)
            echo "SubOne 管理脚本用法:"
            echo "  bash install.sh          - 全新安装 / 部署"
            echo "  bash install.sh update   - 拉取最新代码并重新编译重启"
            echo "  bash install.sh restart  - 重启 SubOne 服务"
            echo "  bash install.sh stop     - 停止 SubOne 服务"
            echo "  bash install.sh status   - 查看服务运行状态"
            echo "  bash install.sh log      - 查看实时运行日志"
            echo "  bash install.sh uninstall- 卸载 SubOne 服务"
            ;;
        *)
            detect_os
            check_root
            setup_swap
            install_dependencies
            install_nodejs
            setup_codebase
            build_subone
            setup_config
            setup_systemd
            show_success
            ;;
    esac
}

main "$@"
