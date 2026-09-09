import fs from 'fs';
import path from 'path';
import { ConfigTemplate, CountryPatternRule, ProxyGroupItem, UnifiedRuleItem, ClientType } from '../types/index.js';
import { DEFAULT_COUNTRY_PATTERNS } from '../core/parser/country.js';

export const INITIAL_COUNTRY_RULES: CountryPatternRule[] = DEFAULT_COUNTRY_PATTERNS;

const TEMPLATE_FILE_MAP: Record<ClientType, string[]> = {
  singbox: [
    'singbox-client-template.json',
    'singbox-client.json',
    'singbox.json',
    'singbox-template.json',
  ],
  mihomo: [
    'mihomo-template.yaml',
    'mihomo.yaml',
    'clash-template.yaml',
    'clash.yaml',
  ],
  loon: [
    'loon-template.conf',
    'loon.conf',
  ],
  quantumultx: [
    'quantumultx-template.conf',
    'quantumultx.conf',
    'qx-template.conf',
    'qx.conf',
  ],
  egern: [
    'egern-template.yaml',
    'egern.yaml',
  ],
  shadowrocket: [
    'shadowrocket-template.conf',
    'shadowrocket.conf',
    'rocket-template.conf',
    'rocket.conf',
  ],
};

function readTemplateFile(type: ClientType): string | null {
  const searchDirs = [
    path.resolve(process.cwd(), 'templates'),
    path.resolve(process.cwd(), 'docs'),
    path.resolve(__dirname, '../../templates'),
    path.resolve(__dirname, '../../docs'),
    path.resolve(__dirname, '../templates'),
    path.resolve(__dirname, '../docs'),
  ];

  const candidateNames = TEMPLATE_FILE_MAP[type] || [];

  for (const dir of searchDirs) {
    if (!fs.existsSync(dir)) continue;
    for (const name of candidateNames) {
      const filePath = path.join(dir, name);
      if (fs.existsSync(filePath)) {
        try {
          const content = fs.readFileSync(filePath, 'utf-8');
          if (content && content.trim().length > 0) {
            return content;
          }
        } catch {
          // ignore error and continue search
        }
      }
    }
  }

  return null;
}

function getFallbackTemplate(type: ClientType): string {
  switch (type) {
    case 'singbox':
      return JSON.stringify({
        log: { level: 'info' },
        dns: { servers: [{ tag: 'remote', type: 'https', server: '1.1.1.1' }] },
        inbounds: [{ type: 'tun', auto_route: true }],
        outbounds: [],
        route: { rules: [], final: '🐟 漏网之鱼' },
      }, null, 2);
    case 'mihomo':
      return `port: 7890\nmode: rule\nproxies: []\nproxy-groups: []\nrules:\n  - MATCH,🐟 漏网之鱼\n`;
    case 'loon':
      return `[General]\nipv6 = false\n\n[Proxy]\n\n[Proxy Group]\n\n[Rule]\nFINAL,🐟 漏网之鱼\n`;
    case 'quantumultx':
      return `[general]\nserver_check_url = http://cp.cloudflare.com/generate_204\n\n[policy]\n\n[server_local]\n\n[filter_local]\nfinal=🐟 漏网之鱼\n`;
    case 'egern':
      return `general:\n  log-level: notify\n\nproxies: []\nproxy-groups: []\nrules:\n  - MATCH,🐟 漏网之鱼\n`;
    case 'shadowrocket':
      return `[General]\nbypass-system = true\n\n[Proxy]\n\n[Proxy Group]\n\n[Rule]\nFINAL,🐟 漏网之鱼\n`;
    default:
      return '';
  }
}

export function loadDefaultTemplate(type: ClientType): string {
  const fileContent = readTemplateFile(type);
  if (fileContent) return fileContent;
  return getFallbackTemplate(type);
}

export const DEFAULT_SINGBOX_TEMPLATE = loadDefaultTemplate('singbox');
export const DEFAULT_MIHOMO_TEMPLATE = loadDefaultTemplate('mihomo');
export const DEFAULT_LOON_TEMPLATE = loadDefaultTemplate('loon');
export const DEFAULT_QUANTUMULTX_TEMPLATE = loadDefaultTemplate('quantumultx');
export const DEFAULT_EGERN_TEMPLATE = loadDefaultTemplate('egern');
export const DEFAULT_SHADOWROCKET_TEMPLATE = loadDefaultTemplate('shadowrocket');

export const INITIAL_TEMPLATES: ConfigTemplate[] = [
  {
    id: 'tpl-singbox-default',
    name: 'Sing-box 标准模版',
    type: 'singbox',
    content: loadDefaultTemplate('singbox'),
    isDefault: true,
    description: '适用于 Singbox 客户端 Tun 模式配置',
  },
  {
    id: 'tpl-mihomo-default',
    name: 'Mihomo 模版',
    type: 'mihomo',
    content: loadDefaultTemplate('mihomo'),
    isDefault: true,
    description: '适用于 Mihomo 配置',
  },
  {
    id: 'tpl-loon-default',
    name: 'Loon 标准模版',
    type: 'loon',
    content: loadDefaultTemplate('loon'),
    isDefault: true,
    description: '适用于 Loon (iOS / macOS) 的标准配置',
  },
  {
    id: 'tpl-qx-default',
    name: 'Quantumult X 标准模版',
    type: 'quantumultx',
    content: loadDefaultTemplate('quantumultx'),
    isDefault: true,
    description: '适用于 Quantumult X 客户端配置',
  },
  {
    id: 'tpl-egern-default',
    name: 'Egern 标准模版',
    type: 'egern',
    content: loadDefaultTemplate('egern'),
    isDefault: true,
    description: '适用于 Egern 客户端 YAML 配置',
  },
  {
    id: 'tpl-shadowrocket-default',
    name: 'Shadowrocket 标准模版',
    type: 'shadowrocket',
    content: loadDefaultTemplate('shadowrocket'),
    isDefault: true,
    description: '适用于 Shadowrocket (小火箭) 客户端配置',
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
