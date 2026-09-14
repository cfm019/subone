#!/bin/sh
# ==============================================================================
# update-singbox.sh
#
# sing-box 订阅更新与状态检测脚本
# ==============================================================================

set -e

# ==================== 用户配置区 ====================
# 远程订阅 URL (默认占位值)
# 
# 💡 配置方式（任选其一）：
#   1. 直接修改下方引号内的 URL
#   2. 命令行执行时直接传参: ./update-singbox.sh "https://你的域名/s/Token"
#   3. 环境变量传入: export SUB_URL="https://你的域名/s/Token"
SUB_URL="${1:-${SUB_URL:-https://your-domain.com/s/YOUR_SUB_TOKEN}}"

# sing-box 配置文件目标路径
TARGET_CONF="${TARGET_CONF:-/etc/sing-box/config.json}"

# 临时下载与校验文件路径
TMP_CONF="/tmp/singbox-sub-latest.json"

# sing-box 二进制路径
SINGBOX_BIN="${SINGBOX_BIN:-/usr/bin/sing-box}"

# 服务重启命令
RELOAD_CMD="${RELOAD_CMD:-/etc/init.d/sing-box restart}"
# ===================================================

log() {
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] $*"
}

# 检查是否使用了默认占位值或为空
DEFAULT_PLACEHOLDER="https://your-domain.com/s/YOUR_SUB_TOKEN"
if [ -z "$SUB_URL" ] || [ "$SUB_URL" = "$DEFAULT_PLACEHOLDER" ] || [ "$SUB_URL" = "https://your.domain/s/your-token" ]; then
    echo "================================================================"
    log "❌ 请先配置您的真实订阅链接 (SUB_URL)！"
    echo ""
    echo "  当前使用的是默认占位地址，脚本已安全终止，未做任何更改。"
    echo "  请选择以下任一方式配置订阅链接："
    echo ""
    echo "  👉 方式 1: 直接编辑本脚本顶部修改 SUB_URL 变量"
    echo "  👉 方式 2: 命令行直接带参数执行:"
    echo "             $0 \"https://你的域名/s/你的Token\""
    echo "  👉 方式 3: 传入环境变量执行:"
    echo "             SUB_URL=\"https://你的域名/s/你的Token\" $0"
    echo "================================================================"
    exit 1
fi

# 1. 检查基础依赖 (最小依赖兼容)
if ! command -v "$SINGBOX_BIN" >/dev/null 2>&1; then
    log "❌ 缺少必要核心程序: $SINGBOX_BIN"
    exit 1
fi

DOWNLOAD_TOOL=""
if command -v curl >/dev/null 2>&1; then
    DOWNLOAD_TOOL="curl"
elif command -v wget >/dev/null 2>&1; then
    DOWNLOAD_TOOL="wget"
elif command -v uclient-fetch >/dev/null 2>&1; then
    DOWNLOAD_TOOL="uclient-fetch"
else
    log "❌ 缺少下载工具，请安装 curl 或 wget (opkg install curl)"
    exit 1
fi

# 进程检测函数
is_singbox_running() {
    bin_name="$(basename "$SINGBOX_BIN")"
    pidof "$bin_name" >/dev/null 2>&1 || pgrep -x "$bin_name" >/dev/null 2>&1 || pidof sing-box >/dev/null 2>&1
}

# 重载 / 重启服务 (优先通过 SIGHUP 实现热重载，避免 TUN 虚拟网卡被系统销毁造成断网)
reload_singbox() {
    if is_singbox_running; then
        bin_name="$(basename "$SINGBOX_BIN")"
        sb_pids="$(pidof "$bin_name" 2>/dev/null || pgrep -x "$bin_name" 2>/dev/null || pidof sing-box 2>/dev/null || true)"
        if [ -n "$sb_pids" ]; then
            log "ℹ️ 检测到 sing-box 正在运行 (PID: $sb_pids)，发送 SIGHUP 触发热重载..."
            kill -HUP $sb_pids 2>/dev/null || true
            sleep 1
            if is_singbox_running; then
                log "✅ 热重载完成 (保持原有进程与 TUN 虚拟网卡，避免整机断网)"
                return 0
            fi
            log "⚠️ SIGHUP 重载后进程退出，尝试执行服务命令冷启动..."
        fi
    fi

    log "ℹ️ 执行服务命令启动/重启: $RELOAD_CMD"
    eval "$RELOAD_CMD" || true
    sleep 2
}

# 订阅拉取函数 (最小依赖 + 智能直连 + 多重 DNS/网络容灾)
fetch_subscription() {
    url="$1"
    out="$2"
    rm -f "$out"

    # A. 优先使用 curl
    if [ "$DOWNLOAD_TOOL" = "curl" ]; then
        # 步骤 1: 强制 IPv4 (-4) 直连拉取
        # 提示：OpenWrt 的 musl libc 在同时发起 AAAA 查询时，易被 sing-box 规则或未就绪的 IPv6 拒绝 (REFUSED) 导致解析失败，-4 可彻底避开
        if curl -sSL -4 --connect-timeout 10 -m 30 "$url" -o "$out" 2>/dev/null && [ -s "$out" ]; then
            return 0
        fi

        # 步骤 2: 若系统默认 DNS 解析失败，尝试向公共 DNS (223.5.5.5) 解析 IP 并直连
        domain=$(echo "$url" | sed -e 's|^[^/]*//||' -e 's|/.*$||' -e 's|:.*$||')
        if [ -n "$domain" ] && command -v nslookup >/dev/null 2>&1; then
            ip=$(nslookup "$domain" 223.5.5.5 2>/dev/null | awk '/^Address[ :]+[0-9]+\./ {print $NF}' | tail -n 1)
            if [ -n "$ip" ]; then
                log "ℹ️ 默认 DNS 无法解析，已通过公共 DNS 获取到 IP ($ip)，尝试直连..."
                if curl -sSL -4 --resolve "${domain}:443:${ip}" --connect-timeout 10 -m 30 "$url" -o "$out" 2>/dev/null && [ -s "$out" ]; then
                    return 0
                fi
            fi
        fi

        # 步骤 3: 兜底降级 (若直连均不通且本机代理端口 7890 存活，尝试通过代理拉取)
        if curl -sSL -x http://127.0.0.1:7890 --connect-timeout 8 -m 30 "$url" -o "$out" 2>/dev/null && [ -s "$out" ]; then
            log "ℹ️ 直连受阻，已通过本机代理成功获取订阅"
            return 0
        fi

    # B. 备用工具 (wget / uclient-fetch)
    elif [ "$DOWNLOAD_TOOL" = "wget" ]; then
        if wget -4 -q --timeout=15 -O "$out" "$url" && [ -s "$out" ]; then
            return 0
        fi
    elif [ "$DOWNLOAD_TOOL" = "uclient-fetch" ]; then
        if uclient-fetch -4 -q --timeout=15 -O "$out" "$url" && [ -s "$out" ]; then
            return 0
        fi
    fi

    return 1
}

# 2. 拉取最新订阅
log "1. 正在拉取远程配置 (直连优先)..."
if ! fetch_subscription "$SUB_URL" "$TMP_CONF"; then
    log "❌ 下载订阅失败或配置为空，请检查网络或订阅 URL！"
    rm -f "$TMP_CONF"
    exit 1
fi

# 3. 校验配置文件有效性
log "2. 校验配置文件完整性 (sing-box check)..."
if ! "$SINGBOX_BIN" check -c "$TMP_CONF"; then
    log "❌ 配置语法校验失败，放弃更新并保留当前配置！"
    rm -f "$TMP_CONF"
    exit 1
fi

# 4. 备份并替换配置
mkdir -p "$(dirname "$TARGET_CONF")"
[ -f "$TARGET_CONF" ] && cp -f "$TARGET_CONF" "${TARGET_CONF}.bak"
mv -f "$TMP_CONF" "$TARGET_CONF"

# 5. 重载/重启 sing-box
log "3. 正在应用最新配置并重载 sing-box 服务..."
reload_singbox

# 6. 检测 sing-box 运行状态
log "4. 检测 sing-box 运行状态..."
if ! is_singbox_running; then
    log "❌ 检测失败：sing-box 未能正常运行！"
    if [ -f "${TARGET_CONF}.bak" ]; then
        log "⚠️ 尝试回滚到上次的备份配置..."
        cp -f "${TARGET_CONF}.bak" "$TARGET_CONF"
        reload_singbox
        if is_singbox_running; then
            log "ℹ️ 已回滚并恢复运行旧配置。"
        else
            log "❌ 回滚后仍无法启动，请检查系统日志！"
        fi
    fi
    exit 1
fi

log "✅ sing-box 订阅更新成功并正常运行！"