# SubOne

多节点与多订阅聚合服务，支持维护策略组与自定义分流规则、渲染模版生成各客户端配置并下发。目标格式目前支持 Sing-box、Mihomo、Loon、Quantumult X、Egern 与 Shadowrocket。


## 主要特性

- **多 Profile **：
  - 在 subone 中管理多个 Profile，如手机、笔记本、台机、旁路由，可能使用不同的客户端，相应使用不同的配置，每个 Profile 各自使用一个 Token 链接；
  - 每个 Profile 可按需勾选不同源节点、自选策略组、分流规则及各自的模版；
- **节点与订阅聚合**：
  - 支持导入各类机场订阅，提取节点并按地区或关键字筛选分组；
  - 支持添加自建独立节点，支持单条/批量 URI、Clash YAML、Sing-box JSON 格式录入与智能解析；
- **协议与传输支持**：
  - **支持导入解析**：VLESS (Reality/Vision/gRPC/WS)、VMess、Shadowsocks (SS 2022/AEAD)、Trojan、Hysteria 2、TUIC v5、AnyTLS、WireGuard、Snell (v1~v4)、SOCKS5、HTTP、v2rayn 等协议；
  - **支持输入格式**：URI 链接列表、Base64 订阅、Clash/Mihomo YAML、Sing-box JSON；
- **策略组与分流规则**：
  - 策略组支持 select、url-test、fallback 等类型，支持节点按正则过滤与多级嵌套；
  - 本地规则：CIDR、DOMAIN、DOMAIN-SUFFIX、DOMAIN-KEYWORD 等；
  - 远程规则集：GeoSite / GeoIP / SRS / MRS 统一管理与去向分流；
- **模版与客户端分发**：
  - 支持 **Sing-box**、**Mihomo (Clash)**、**Loon**、**Quantumult X**、**Egern**、**Shadowrocket** 等客户端；
  - 默认提供各客户端规范模版，支持自定义模版扩展；
  - 根据客户端 User-Agent 智能识别分发，亦可通过路径或参数显式获取对应格式或 Base64 纯节点列表。


## 环境要求

- **Node.js**: `>= 20.0.0` (可通过 `node -v` 查看)
- **npm**: `>= 9.0.0`

## 配置

服务启动依赖根目录 `config.json` 或环境变量，示例文件见 [config.example.json](config.example.json)。

### 配置文件 `config.json`

```json
{
  "port": 3456,
  "adminPassword": "YOUR_ADMIN_PASSWORD"
}
```

- `port`: 服务监听端口，默认 `3456`。
- `adminPassword`: Web 控制台管理密码。若留空或未设置，则不启用登录鉴权。


### 环境变量（可选）

也可直接通过环境变量配置：
- `PORT`
- `ADMIN_PASSWORD`

## 部署

### 1. 源码编译

```bash
# 确认 Node 版本 >= 20
node -v

# 安装后端依赖
npm install

# 编译后端与前端
npm run build
```

### 2. 后台常驻运行 (Systemd 服务)

创建服务文件 `/etc/systemd/system/subone.service`：

```ini
[Unit]
Description=SubOne Subscription Service
After=network.target

[Service]
Type=simple
User=root
WorkingDirectory=/root/subone
ExecStart=/usr/bin/npm start
Restart=always
RestartSec=5
Environment=NODE_ENV=production

[Install]
WantedBy=multi-user.target
```

> 注：若 `npm` 路径不在 `/usr/bin/npm`，可通过 `which npm` 查询并替换 `ExecStart` 路径；`WorkingDirectory` 请替换为实际项目所在目录。

管理服务命令：

```bash
# 重载并启动服务，设置开机自启
systemctl daemon-reload
systemctl enable --now subone

# 查看运行状态
systemctl status subone

# 查看实时日志
journalctl -u subone -e -f

# 重启 / 停止服务
systemctl restart subone
systemctl stop subone
```

### 3. 反向代理 (Caddy)

公网部署建议使用 Caddy 反向代理并自动申请 HTTPS 证书：

```caddy
sub.yourdomain.com {
    reverse_proxy 127.0.0.1:3456
    encode gzip zstd
}
```

```bash
caddy reload
```

## 订阅端点与格式分发

每个订阅配置（Profile）拥有独立的访问 Token，可通过下列路径或请求头获取对应格式：

| 客户端 / 场景 | 专用订阅路径 | 输出格式与说明 |
| :--- | :--- | :--- |
| **智能分发** | `/s/:token` | 根据请求头 `User-Agent` 自动识别客户端并分发匹配格式 |
| **Sing-box** | `/s/:token/singbox` | JSON 配置 (包含 DNS、Tun、入站、出站及路由分流) |
| **Mihomo (Clash)** | `/s/:token/mihomo` | YAML 配置 (包含 proxies、proxy-groups、rules) |
| **Loon** | `/s/:token/loon` | CONF 配置 (包含 [Proxy]、[Proxy Group]、[Rule]) |
| **Quantumult X** | `/s/:token/qx` 或 `/s/:token/quantumultx` | CONF 配置 (包含 [server_local]、[policy]、[filter_local]) |
| **Egern** | `/s/:token/egern` | YAML 配置 (包含 proxies、proxy-groups、rules) |
| **Shadowrocket** | `/s/:token/shadowrocket` 或 `/s/:token/rocket` | CONF 配置 (包含 [Proxy]、[Proxy Group]、[Rule]) |
| **纯节点列表** | `/s/:token/shadowrocket?format=base64` | Base64 编码的节点 URI 列表 |

> 提示：亦可在任意订阅路径后附加 `?target=xxx` 显式覆盖客户端类型（例如 `?target=mihomo`、`?target=qx`、`?target=egern`）。


## 模版示例与参考

Subone 支持为各个客户端自定义基础模版。所有模版文件统一维护在根目录 `templates/` 下，系统启动与新建模版时直接从该目录读取对应文件，支持开箱即用与热修改：

| 模版文件 | 目标客户端 | 适用场景与特征 |
| :--- | :--- | :--- |
| [templates/singbox-client.json](templates/singbox-client.json) | Sing-box | macOS/iOS 终端设备，配置 Tun 排除私网/Tailscale防回环、防IPv6泄漏 |
| [templates/singbox-gateway.json](templates/singbox-gateway.json) | Sing-box | 软路由/Linux 旁路由透明网关，`auto_redirect` 自动流量与 DNS 接管 |
| [templates/mihomo.yaml](templates/mihomo.yaml) | Mihomo / Clash | 标准 YAML 基础模版，Fake-IP DNS 设置与出站占位 |
| [templates/loon.conf](templates/loon.conf) | Loon | 标准 CONF 基础模版，包含 [Proxy]、[Proxy Group]、[Rule] 占位 |
| [templates/quantumultx.conf](templates/quantumultx.conf) | Quantumult X | 标准 CONF 基础模版，包含 [server_local]、[policy]、[filter_local] 占位 |
| [templates/egern.yaml](templates/egern.yaml) | Egern | 标准 YAML 基础模版，支持 Hysteria 2、VLESS Reality 等协议 |
| [templates/shadowrocket.conf](templates/shadowrocket.conf) | Shadowrocket | 标准 CONF 基础模版，支持全协议单行定义与规则集注入 |

---

### Sing-box 场景调优要点

#### 1. 终端客户端（macOS / iOS 等）
- **排除局域网与虚拟内网 (`route_exclude_address`)**：
  - 显式排除 RFC 1918 私网网段（`192.168.0.0/16`, `10.0.0.0/8`, `172.16.0.0/12`）以及运营商 CGNAT / Tailscale 网段（`100.64.0.0/10`, `100.100.100.100/32`, `fd7a:115c:a1e0::/48`）。
  - 确保 AirDrop、随航（Sidecar）、群晖 NAS 以及 Tailscale 内网穿透流量不会误入 TUN，避免客户端路由回环与连接挂死。

#### 2. 旁路由（透明网关）
- **启用 `auto_redirect: true`**：
  - Sing-box TUN 模式旁路由转发的核心参数。开启后，Sing-box 会自动在底层（iptables/nftables PREROUTING 链）注入规则，接管局域网其他设备转发过来的流量进入 TUN。
- **DNS 劫持与接入 (`dns-in: 1053` + `hijack-dns`)**：
  - 配置 `dns-in` 直连入站（监听在 `127.0.0.1:1053`），并在路由规则中通过 `action: "hijack-dns"` 劫持 53 与 1053 端口。
  - 若系统搭配使用 AdGuard Home、MosDNS 或 dnsmasq，可将它们的上游 DNS 指向 `127.0.0.1:1053`，以使用 Sing-box 的 FakeIP 与分流能力。
- **阻断 QUIC、IPv6 (AAAA) 与 STUN**：
  - **QUIC / HTTP3 拦截**：由于 UDP 443 协议常导致节点限速或连接不稳定，模版中配置 Reject QUIC，强制降级至 TCP/TLS。
  - **AAAA 拦截 (`query_type: AAAA -> reject`)**：防止双栈环境下客户端通过未受控的 IPv6 出口直连导致分流失效。
  - **STUN 拦截 (853/STUN -> reject)**：防止部分 WebRTC / 穿透协议探测导致真实公网 IP 泄漏。
- **局域网私网段与 NAS 直连**：
  - 明确将私网网段（`10.0.0.0/8`, `172.16.0.0/12`, `192.168.0.0/16`, `fd00::/8` 等）以及局域网常用域名（如 Synology、QNAP 等私有 NAS DDNS 域名）匹配至直连策略，保障内网设备互访不受代理干扰。


