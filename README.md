# SubOne

多节点多源聚合与配置生成。支持汇聚多个上游机场订阅与自建独立节点，分 Profile 定制策略组、分流规则及模版，生成组合后的聚合订阅配置。

目标格式支持 Sing-box、Mihomo、Loon、Quantumult X、Egern 与 Shadowrocket。


## 快速开始

```bash
bash <(curl -fsSL https://raw.githubusercontent.com/cfm019/subone/main/install.sh)
```

- **控制台访问**：`http://<你的VPS_IP>:3456`
- **安装目录**：`/opt/subone`
- **配置文件**：`/opt/subone/config.json`（默认免密直接登录，修改 `adminPassword` 后重启可启用密码）
- **常用命令**：
  ```bash
  # 一键更新到最新版本并重新编译重启
  bash /opt/subone/install.sh update

  # 服务管理
  systemctl status subone     # 查看状态
  journalctl -u subone -f     # 查看实时日志
  systemctl restart subone    # 重启服务
  systemctl stop subone       # 停止服务
  ```

---

## 主要特性

- **多 Profile**：
  - 在 subone 中管理多个 Profile，如手机、笔记本、台机、旁路由，可能使用不同的客户端，相应使用不同的配置，每个 Profile 各自使用一个 Token 链接；
  - 每个 Profile 可按需勾选不同源节点、自选策略组、分流规则及各自的模版；
- **独立节点与上游机场订阅源聚合**：
  - 支持导入各类上游机场订阅，提取节点并按地区或关键字筛选分组；
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




## 源码编译部署
## 1. 环境要求

- **Node.js**: `>= 20.0.0` (可通过 `node -v` 查看)
- **npm**: `>= 9.0.0`

## 2. 配置与编译

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


```bash
# 确认 Node 版本 >= 20
node -v

# 安装依赖
npm install

# 编译后端与前端
npm run build
```

### 3. 后台常驻运行 (Systemd 服务)

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

### 4. 反向代理 (Caddy)

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

| 模版文件 | 目标客户端 / 模块 | 适用场景与特征 |
| :--- | :--- | :--- |
| [templates/singbox-client.json](templates/singbox-client.json) | Sing-box | macOS/iOS 终端设备，配置 Tun 排除私网/Tailscale防回环、防IPv6泄漏 |
| [templates/singbox-gateway.json](templates/singbox-gateway.json) | Sing-box | 软路由/Linux 旁路由透明网关，`auto_redirect` 自动流量与 DNS 接管 |
| [templates/mihomo.yaml](templates/mihomo.yaml) | Mihomo / Clash | 标准 YAML 基础模版，Fake-IP DNS 设置与出站占位 |
| [templates/loon.conf](templates/loon.conf) | Loon | 标准 CONF 基础模版，包含 [Proxy]、[Proxy Group]、[Rule] 占位 |
| [templates/quantumultx.conf](templates/quantumultx.conf) | Quantumult X | 标准 CONF 基础模版，包含 [server_local]、[policy]、[filter_local] 占位 |
| [templates/egern.yaml](templates/egern.yaml) | Egern | 标准 YAML 基础模版，支持 Hysteria 2、VLESS Reality 等协议 |
| [templates/shadowrocket.conf](templates/shadowrocket.conf) | Shadowrocket | 标准 CONF 基础模版，支持全协议单行定义与规则集注入 |
| [templates/rules.json](templates/rules.json) | 分流规则 (JSON) | 默认统一分流规则定义（结构化字段，包含广告拦截、AI、YouTube、Telegram 等本地/远程规则） |
| [templates/rules.yaml](templates/rules.yaml) | 分流规则 (YAML) | 默认统一分流规则定义（YAML 列表文本格式，带清晰注释分类，方便文本直接修改） |
| [templates/proxy-groups.json](templates/proxy-groups.json) | 策略组模版 | 默认内置策略组（节点选择、AI 服务、国外域名、国内服务、自动测速等） |
| [templates/country-rules.json](templates/country-rules.json) | 地区识别规则 | 默认国家/地区正则匹配与策略组映射规则（香港、台湾、日本、美国等） |



