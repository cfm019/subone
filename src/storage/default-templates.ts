import { ConfigTemplate, CountryPatternRule, ProxyGroupItem, UnifiedRuleItem } from '../types/index.js';
import { DEFAULT_COUNTRY_PATTERNS } from '../core/parser/country.js';

export const INITIAL_COUNTRY_RULES: CountryPatternRule[] = DEFAULT_COUNTRY_PATTERNS;

export const DEFAULT_SINGBOX_TEMPLATE = JSON.stringify({
  "log": {
    "disabled": false,
    "level": "info",
    "timestamp": true
  },
  "dns": {
    "servers": [
      {
        "tag": "alidns",
        "type": "udp",
        "server": "223.5.5.5"
      },
      {
        "tag": "remote",
        "type": "https",
        "server": "1.1.1.1",
        "path": "/dns-query",
        "detour": "🚀 节点选择"
      },
      {
        "tag": "fakeip",
        "type": "fakeip",
        "inet4_range": "198.18.0.0/15"
      },
      {
        "tag": "system",
        "type": "local"
      }
    ],
    "rules": [
      {
        "rule_set": "geosite-category-ads-all",
        "action": "reject"
      },
      {
        "domain_suffix": [
          "local",
          "arpa",
          "in-addr.arpa",
          "ip6.arpa",
          "gstatic.com",
          "gvt1.com",
          "cp.cloudflare.com"
        ],
        "server": "alidns"
      },
      {
        "rule_set": [
          "geosite-geolocation-cn",
          "geosite-cn",
          "geosite-apple",
          "geosite-steam@cn"
        ],
        "server": "alidns"
      },
      {
        "query_type": "AAAA",
        "action": "reject"
      },
      {
        "rule_set": [
          "geosite-geolocation-!cn",
          "geosite-category-ai-!cn",
          "geosite-google",
          "geosite-github",
          "geosite-youtube",
          "geosite-telegram",
          "geosite-steam"
        ],
        "server": "fakeip"
      },
      {
        "clash_mode": "Direct",
        "server": "alidns"
      },
      {
        "clash_mode": "Global",
        "server": "remote"
      }
    ],
    "final": "remote",
    "strategy": "prefer_ipv4"
  },
  "inbounds": [
    {
      "type": "tun",
      "address": [
        "172.19.0.1/30",
        "fdfe:dcba:9876::1/126"
      ],
      "mtu": 1400,
      "route_exclude_address": [
        "192.168.0.0/16",
        "10.0.0.0/8",
        "172.16.0.0/12",
        "100.64.0.0/10",
        "100.100.100.100/32",
        "fd7a:115c:a1e0::/48",
        "fe80::/10",
        "fc00::/7"
      ],
      "auto_route": true,
      "strict_route": true
    },
    {
      "type": "mixed",
      "listen": "127.0.0.1",
      "listen_port": 7890
    }
  ],
  "outbounds": [],
  "route": {
    "auto_detect_interface": true,
    "default_domain_resolver": {
      "server": "alidns"
    },
    "default_http_client": "default",
    "rules": [
      {
        "action": "sniff"
      },
      {
        "protocol": "quic",
        "action": "reject"
      },
      {
        "type": "logical",
        "mode": "or",
        "rules": [
          {
            "protocol": "dns"
          },
          {
            "port": 53
          }
        ],
        "action": "hijack-dns"
      },
      {
        "type": "logical",
        "mode": "or",
        "rules": [
          {
            "port": 853
          },
          {
            "protocol": "stun"
          }
        ],
        "action": "reject"
      }
    ],
    "rule_set": [],
    "final": "🐟 漏网之鱼"
  },
  "experimental": {
    "cache_file": {
      "enabled": true
    },
    "clash_api": {
      "default_mode": "Rule"
    }
  },
  "http_clients": [
    {
      "tag": "default"
    }
  ]
}, null, 2);

export const DEFAULT_MIHOMO_TEMPLATE = `port: 7890
socks-port: 7891
allow-lan: true
mode: rule
log-level: info
ipv6: false

proxy-groups: []

rules:
  - MATCH,🐟 漏网之鱼
`;

export const DEFAULT_LOON_TEMPLATE = `[General]
ipv6-vif = auto
ip-mode = dual
allow-udp-proxy = true
skip-proxy = 192.168.0.0/16,10.0.0.0/8,172.16.0.0/12,localhost,*.local
dns-server = 223.5.5.5,119.29.29.29

[Proxy]

[Remote Proxy]

[Remote Filter]

[Proxy Group]

[Rule]

[Remote Rule]

FINAL,🐟 漏网之鱼
`;

export const INITIAL_TEMPLATES: ConfigTemplate[] = [
  {
    id: 'tpl-singbox-default',
    name: 'Sing-box 标准模版',
    type: 'singbox',
    content: DEFAULT_SINGBOX_TEMPLATE,
    isDefault: true,
    description: '适用于 Singbox 客户端 Tun 模式配置',
  },
  {
    id: 'tpl-mihomo-default',
    name: 'Mihomo 模版',
    type: 'mihomo',
    content: DEFAULT_MIHOMO_TEMPLATE,
    isDefault: true,
    description: '适用于 Mihomo 配置',
  },
  {
    id: 'tpl-loon-default',
    name: 'Loon 标准模版',
    type: 'loon',
    content: DEFAULT_LOON_TEMPLATE,
    isDefault: true,
    description: '适用于 Loon (iOS / macOS) 的标准配置',
  },
];

export const INITIAL_PROFILES: import('../types/index.js').SubscriptionProfile[] = [
  {
    id: 'prof_default',
    name: '默认全量订阅',
    token: '',
    enabled: true,
    description: '包含所有可用节点、标准策略组与分流规则的完整配置',
    nodeFilter: {
      mode: 'all',
      selectedNodeIds: [],
    },
    selectedGroupIds: [],
    selectedRuleIds: [],
  },
];


export const INITIAL_PROXY_GROUPS: ProxyGroupItem[] = [
  {
    id: 'grp-select',
    name: '🚀 节点选择',
    type: 'select',
    proxies: ['♻️ 自动选择', '👉 手动选择', '🇭🇰 香港节点', '🇯🇵 日本节点', '🇺🇸 美国节点', '🎯 本地直连'],
  },
  {
    id: 'grp-ai',
    name: '🤖 AI 服务',
    type: 'select',
    proxies: ['🚀 节点选择', '🇺🇸 美国节点', '🇯🇵 日本节点', '🎯 本地直连'],
  },
  {
    id: 'grp-youtube',
    name: '📹 YouTube',
    type: 'select',
    proxies: ['🚀 节点选择', '♻️ 自动选择', '🇭🇰 香港节点', '🇯🇵 日本节点', '🇺🇸 美国节点'],
  },
  {
    id: 'grp-google',
    name: '🌐 Google',
    type: 'select',
    proxies: ['🚀 节点选择', '♻️ 自动选择', '🇭🇰 香港节点', '🇯🇵 日本节点', '🇺🇸 美国节点'],
  },
  {
    id: 'grp-telegram',
    name: '📲 电报消息',
    type: 'select',
    proxies: ['🚀 节点选择', '♻️ 自动选择', '🇭🇰 香港节点', '🇯🇵 日本节点', '🇺🇸 美国节点'],
  },
  {
    id: 'grp-devops',
    name: '💻 远程运维',
    type: 'select',
    proxies: ['🎯 本地直连', '🚀 节点选择', '♻️ 自动选择'],
  },
  {
    id: 'grp-cn',
    name: '🇨🇳 国内服务',
    type: 'select',
    proxies: ['🎯 本地直连', '🚀 节点选择'],
  },
  {
    id: 'grp-global',
    name: '🌎 国外域名',
    type: 'select',
    proxies: ['🚀 节点选择', '🎯 本地直连'],
  },
  {
    id: 'grp-fallback',
    name: '🐟 漏网之鱼',
    type: 'select',
    proxies: ['🚀 节点选择', '🎯 本地直连'],
  },
  {
    id: 'grp-direct',
    name: '🎯 本地直连',
    type: 'direct',
  },
  {
    id: 'grp-auto',
    name: '♻️ 自动选择',
    type: 'urltest',
    tolerance: 50,
  },
  {
    id: 'grp-manual',
    name: '👉 手动选择',
    type: 'select',
  },
  {
    id: 'grp-hk',
    name: '🇭🇰 香港节点',
    type: 'urltest',
    filter: '(?i)(🇭🇰|港|hk|hongkong)',
    tolerance: 50,
  },
  {
    id: 'grp-jp',
    name: '🇯🇵 日本节点',
    type: 'urltest',
    filter: '(?i)(🇯🇵|日|jp|japan)',
    tolerance: 50,
  },
  {
    id: 'grp-us',
    name: '🇺🇸 美国节点',
    type: 'urltest',
    filter: '(?i)(🇺🇸|美|us|unitedstates)',
    tolerance: 50,
  },
];

export const INITIAL_RULES_LIST: UnifiedRuleItem[] = [
  {
    id: 'r-ads-all-remote',
    name: '广告拦截 (Category-Ads-All)',
    kind: 'remote',
    type: 'RULE-SET',
    payload: 'https://gh-proxy.com/https://raw.githubusercontent.com/MetaCubeX/meta-rules-dat/sing/geo/geosite/category-ads-all.srs',
    format: 'binary',
    outbound: 'REJECT',
    enabled: true,
  },
  {
    id: 'r-private-ip',
    name: '局域网与内网 IP',
    kind: 'local',
    type: 'IP-CIDR',
    payload: '10.0.0.0/8, 172.16.0.0/12, 192.168.0.0/16, 127.0.0.0/8',
    outbound: '🎯 本地直连',
    enabled: true,
  },
  {
    id: 'r-pt-tracker',
    name: 'PT / BT 流量直连',
    kind: 'local',
    type: 'DOMAIN-KEYWORD',
    payload: 'torrent, bittorrent, tracker, announce',
    outbound: '🎯 本地直连',
    enabled: true,
  },
  {
    id: 'r-ai-local',
    name: 'AI 域名后缀',
    kind: 'local',
    type: 'DOMAIN-SUFFIX',
    payload: 'chatgpt.com, openai.com, oaistatic.com, oaiusercontent.com, claude.ai, anthropic.com, claudeusercontent.com, perplexity.ai, grok.com, x.ai, cursor.sh, cursor.com, poe.com, mistral.ai, cohere.com, copilot.microsoft.com, sydney.bing.com, generativelanguage.googleapis.com, aistudio.google.com, bard.google.com, makersuite.google.com',
    outbound: '🤖 AI 服务',
    enabled: true,
  },
  {
    id: 'r-ai-keyword',
    name: 'AI 域名关键字',
    kind: 'local',
    type: 'DOMAIN-KEYWORD',
    payload: 'openai, chatgpt, claude, anthropic, perplexity',
    outbound: '🤖 AI 服务',
    enabled: true,
  },
  {
    id: 'r-ai-remote',
    name: 'AI 规则集 (Category-AI-!CN)',
    kind: 'remote',
    type: 'RULE-SET',
    payload: 'https://gh-proxy.com/https://raw.githubusercontent.com/MetaCubeX/meta-rules-dat/sing/geo/geosite/category-ai-!cn.srs',
    format: 'binary',
    outbound: '🤖 AI 服务',
    enabled: true,
  },
  {
    id: 'r-youtube-remote',
    name: 'YouTube 规则集',
    kind: 'remote',
    type: 'RULE-SET',
    payload: 'https://gh-proxy.com/https://raw.githubusercontent.com/MetaCubeX/meta-rules-dat/sing/geo/geosite/youtube.srs',
    format: 'binary',
    outbound: '📹 YouTube',
    enabled: true,
  },
  {
    id: 'r-google-remote',
    name: 'Google 规则集',
    kind: 'remote',
    type: 'RULE-SET',
    payload: 'https://gh-proxy.com/https://raw.githubusercontent.com/MetaCubeX/meta-rules-dat/sing/geo/geosite/google.srs',
    format: 'binary',
    outbound: '🌐 Google',
    enabled: true,
  },
  {
    id: 'r-google-ip',
    name: 'Google IP 规则集',
    kind: 'remote',
    type: 'RULE-SET',
    payload: 'https://gh-proxy.com/https://raw.githubusercontent.com/MetaCubeX/meta-rules-dat/sing/geo/geoip/google.srs',
    format: 'binary',
    outbound: '🌐 Google',
    enabled: true,
  },
  {
    id: 'r-telegram-remote',
    name: 'Telegram 域名规则集',
    kind: 'remote',
    type: 'RULE-SET',
    payload: 'https://gh-proxy.com/https://raw.githubusercontent.com/MetaCubeX/meta-rules-dat/sing/geo/geosite/telegram.srs',
    format: 'binary',
    outbound: '📲 电报消息',
    enabled: true,
  },
  {
    id: 'r-telegram-ip',
    name: 'Telegram IP 规则集',
    kind: 'remote',
    type: 'RULE-SET',
    payload: 'https://gh-proxy.com/https://raw.githubusercontent.com/MetaCubeX/meta-rules-dat/sing/geo/geoip/telegram.srs',
    format: 'binary',
    outbound: '📲 电报消息',
    enabled: true,
  },
  {
    id: 'r-github-remote',
    name: 'GitHub 规则集',
    kind: 'remote',
    type: 'RULE-SET',
    payload: 'https://gh-proxy.com/https://raw.githubusercontent.com/MetaCubeX/meta-rules-dat/sing/geo/geosite/github.srs',
    format: 'binary',
    outbound: '🌎 国外域名',
    enabled: true,
  },
  {
    id: 'r-steam-cn',
    name: 'Steam 国区下载 CDN',
    kind: 'remote',
    type: 'RULE-SET',
    payload: 'https://gh-proxy.com/https://raw.githubusercontent.com/MetaCubeX/meta-rules-dat/sing/geo/geosite/steam@cn.srs',
    format: 'binary',
    outbound: '🎯 本地直连',
    enabled: true,
  },
  {
    id: 'r-steam-global',
    name: 'Steam 商店与社区',
    kind: 'remote',
    type: 'RULE-SET',
    payload: 'https://gh-proxy.com/https://raw.githubusercontent.com/MetaCubeX/meta-rules-dat/sing/geo/geosite/steam.srs',
    format: 'binary',
    outbound: '🌎 国外域名',
    enabled: true,
  },
  {
    id: 'r-apple-remote',
    name: 'Apple 服务',
    kind: 'remote',
    type: 'RULE-SET',
    payload: 'https://gh-proxy.com/https://raw.githubusercontent.com/MetaCubeX/meta-rules-dat/sing/geo/geosite/apple.srs',
    format: 'binary',
    outbound: '🎯 本地直连',
    enabled: true,
  },
  {
    id: 'r-direct-apple',
    name: 'Apple 常见服务直连',
    kind: 'local',
    type: 'DOMAIN-SUFFIX',
    payload: 'apple.com, icloud.com, mzstatic.com',
    outbound: '🎯 本地直连',
    enabled: true,
  },
  {
    id: 'r-proxy-domain-remote',
    name: '国外常见域名代理 (Geolocation-!CN)',
    kind: 'remote',
    type: 'RULE-SET',
    payload: 'https://gh-proxy.com/https://raw.githubusercontent.com/MetaCubeX/meta-rules-dat/sing/geo/geosite/geolocation-!cn.srs',
    format: 'binary',
    outbound: '🌎 国外域名',
    enabled: true,
  },
  {
    id: 'r-geolocation-cn',
    name: '国内直连扩展 (Geolocation-CN)',
    kind: 'remote',
    type: 'RULE-SET',
    payload: 'https://gh-proxy.com/https://raw.githubusercontent.com/MetaCubeX/meta-rules-dat/sing/geo/geosite/geolocation-cn.srs',
    format: 'binary',
    outbound: '🇨🇳 国内服务',
    enabled: true,
  },
  {
    id: 'r-cn-domain-remote',
    name: '国内直连域名 (GeoSite CN)',
    kind: 'remote',
    type: 'RULE-SET',
    payload: 'https://gh-proxy.com/https://raw.githubusercontent.com/SagerNet/sing-geosite/rule-set/geosite-cn.srs',
    format: 'binary',
    outbound: '🇨🇳 国内服务',
    enabled: true,
  },
  {
    id: 'r-cn-ip-remote',
    name: '国内直连 IP (GeoIP CN)',
    kind: 'remote',
    type: 'RULE-SET',
    payload: 'https://gh-proxy.com/https://raw.githubusercontent.com/SagerNet/sing-geoip/rule-set/geoip-cn.srs',
    format: 'binary',
    outbound: '🇨🇳 国内服务',
    enabled: true,
  },
];
