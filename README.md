# SubOne

多节点聚合和多订阅聚合，维护分组策略和自定义分流规则、生成统一配置下发，支持 Sing-box、Mihomo 与 Loon。


## ✨ 主要特性

- **多订阅分流配置（多 Profile）**：
  - 支持创建多个独立订阅，每个订阅拥有独立的 Token 链接；
  - 每个订阅可包含源自多个机场的节点、启用的策略组、分流规则以及配置模版；
- **多机场与多节点聚合**：
  - 支持导入机场订阅，提取其中的节点，根据地区或者关键字进行筛选分组；
  - 支持添加零散的节点，支持单条/批量 URI、Clash YAML、Sing-box JSON 格式录入与智能解析；
- **协议与支持**：
  - **支持导入解析**：VLESS (Reality/Vision/gRPC/WS)、VMess、Shadowsocks (SS 2022/AEAD)、Trojan、Hysteria 2、TUIC v5、AnyTLS、WireGuard、Snell (v1~v4)、SOCKS5、HTTP、v2rayn 等协议。
  - **支持输入格式**：URI 链接列表、Base64 订阅、Clash/Mihomo YAML、Sing-box JSON。
- **策略组**：
  - 所见即所得的策略组配置，支持节点筛选、多级嵌套；
- **分流规则**：
  - 本地规则：CIDR、DOMAIN、DOMAIN-SUFFIX、DOMAIN-KEYWORD 等；
  - 远程规则集：GeoSite / GeoIP / SRS / MRS 规则集统一管理与去向分流；
- **模板与智能下发**：
  - 默认提供 Sing-box、Mihomo 与 Loon 的标准模版
  - 可以自定义模版，加入自己需要的策略
  - 根据客户端 User-Agent 智能下发对应格式，无 UA 时默认下发 Sing-box 格式，亦可通过 URL 显式指定。


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

## 💡 自定义模版

Subone 支持自定义模版。在 `docs/` 目录下提供了两份实际应用的 **"保持ipv6可用（nas直连）又能防止ipv6泄露"** 的 Sing-box 模版供参考。

| 模版 | 适用环境 | 模版文件 | 特征 |
| :--- | :--- | :--- | :--- |
| **客户端模版** | macOS、iOS、Windows、Android 终端设备 | [docs/singbox-client-template.json](docs/singbox-client-template.json) | 排除私网/Tailscale网段防回环、监听回环端口、防漏 |
| **旁路由模版** | 软路由、Linux 透明网关 | [docs/singbox-gateway-template.json](docs/singbox-gateway-template.json) | `auto_redirect` 自动劫持转发、DNS 入站接管 |

---

### 1. 终端客户端（macOS / iOS 等）要点

- **排除局域网与虚拟内网 (`route_exclude_address`)**：
  - 显式排除了 RFC 1918 私网网段（`192.168.0.0/16`, `10.0.0.0/8`, `172.16.0.0/12`）以及运营商 CGNAT / Tailscale 网段（`100.64.0.0/10`, `100.100.100.100/32`, `fd7a:115c:a1e0::/48`）。
  - 确保 AirDrop、随航（Sidecar）、群晖 NAS 以及 Tailscale 内网穿透流量不会误入 TUN，避免客户端路由回环与连接挂死。

---

### 2. 旁路由（透明网关）要点

- **启用 `auto_redirect: true`**：
  - Sing-box TUN 模式旁路由转发的核心参数。开启后，Sing-box 会自动在底层（iptables/nftables PREROUTING 链）注入规则，接管局域网其他设备转发过来的流量进入 TUN。
- **DNS 劫持与接入 (`dns-in: 1053` + `hijack-dns`)**：
  - 配置 `dns-in` 直连入站（监听在 `127.0.0.1:1053`），并在路由规则中通过 `action: "hijack-dns"` 劫持 53 与 1053 端口。
  - 若系统搭配使用 AdGuard Home、MosDNS 或 dnsmasq，可将它们的上游 DNS 指向 `127.0.0.1:1053`，以使用 Sing-box 的 FakeIP 与分流能力。
- **阻断 QUIC、IPv6 (AAAA) 与 STUN**：
  - **QUIC / HTTP3 拦截**：由于 UDP 443 协议常导致梯子限速或连接不稳定，这里配置全局 Reject QUIC，强制降级至 TCP/TLS 代理。
  - **AAAA 拦截 (`query_type: AAAA -> reject`)**：防止双栈环境下客户端通过未受控的 IPv6 出口直连导致分流失效。
  - **STUN 拦截 (853/STUN -> reject)**：防止部分 WebRTC / 穿透协议探测导致真实公网 IP 泄漏。
- **局域网私网段与 NAS 直连**：
  - 明确将私网网段（`10.0.0.0/8`, `172.16.0.0/12`, `192.168.0.0/16`, `fd00::/8` 等）以及局域网常用域名（如 Synology、QNAP 等私有 NAS DDNS 域名）匹配至 `🎯 本地直连`，保障内网设备互访不受代理干扰。


