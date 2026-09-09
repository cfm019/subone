export type ProxyType =
  | 'ss'
  | 'ssr'
  | 'vmess'
  | 'vless'
  | 'trojan'
  | 'hysteria'
  | 'hysteria2'
  | 'tuic'
  | 'wireguard'
  | 'snell'
  | 'anytls'
  | 'naive'
  | 'shadowtls'
  | 'http'
  | 'socks5';

export interface ProxyNode {
  id: string;
  name: string;
  type: ProxyType;
  server: string;
  port: number;
  sourceId?: string;
  sourceName?: string;
  countryCode?: string;
  countryEmoji?: string;

  // Auth / Encryption
  username?: string;
  uuid?: string;
  password?: string;
  method?: string;
  alterId?: number;
  cipher?: string;

  // TLS / Security
  tls?: boolean;
  sni?: string;
  alpn?: string[];
  skipCertVerify?: boolean;
  fingerprint?: string;
  certificate?: string | string[];
  certificatePublicKeySha256?: string[];
  reality?: {
    enabled: boolean;
    publicKey: string;
    shortId?: string;
  };

  // WireGuard specific
  privateKey?: string;
  publicKey?: string;
  presharedKey?: string;
  ip?: string;
  ipv6?: string;
  localAddress?: string[];
  reserved?: number[];
  mtu?: number;
  remoteDnsResolve?: boolean;
  udp?: boolean;

  // Snell & ShadowTLS specific
  psk?: string;
  snellVersion?: number;
  obfsHost?: string;
  shadowtlsVersion?: number;
  detour?: string;

  // Hysteria & Hysteria2 specific
  serverPorts?: string[];
  hopInterval?: string;
  hopIntervalMax?: string;
  upMbps?: number;
  downMbps?: number;

  // AnyTLS specific
  idleSessionCheckInterval?: string;
  idleSessionTimeout?: string;
  minIdleSession?: number;

  // Naive specific
  quic?: boolean;
  quicCongestionControl?: string;
  udpOverTcp?: boolean;

  // TUIC specific
  zeroRttHandshake?: boolean;
  heartbeat?: string;
  udpRelayMode?: string;

  // Transport & Flow
  network?: 'tcp' | 'ws' | 'grpc' | 'http' | 'h2';
  flow?: string;
  packetEncoding?: string;
  wsPath?: string;
  wsHeaders?: Record<string, string>;
  grpcServiceName?: string;
  maxEarlyData?: number;
  earlyDataHeaderName?: string;

  congestionControl?: string;
  obfs?: string;
  obfsPassword?: string;

  multiplex?: any;

  raw?: any;
}

export interface SubscriptionSource {
  id: string;
  name: string;
  url: string;
  enabled: boolean;
  type?: 'auto' | 'base64' | 'clash' | 'singbox' | 'custom';
  customUserAgent?: string;
  lastUpdated?: string;
  nodeCount?: number;
  nodes?: ProxyNode[];
}

export interface ExtractionRule {
  id: string;
  name: string;
  enabled: boolean;
  sourceIds?: string[];
  includeRegex?: string;
  excludeRegex?: string;
  includeKeywords?: string[];
  excludeKeywords?: string[];
  targetCountries?: string[];
  renamePattern?: {
    prefix?: string;
    suffix?: string;
    replaceFrom?: string;
    replaceTo?: string;
  };
}

export interface ConfigTemplate {
  id: string;
  name: string;
  type: 'singbox' | 'mihomo' | 'loon' | 'quantumultx' | 'egern';
  content: string;
  isDefault?: boolean;
  description?: string;
}

export interface ProxyGroupItem {
  id: string;
  name: string;
  type: 'select' | 'urltest' | 'fallback' | 'load-balance' | 'direct' | 'reject';
  proxies?: string[];
  use?: string[];
  filter?: string;
  tolerance?: number;
  url?: string;
  interval?: number;
  isCountryGroup?: boolean;
}


export type RuleType =
  | 'DOMAIN-SUFFIX'
  | 'DOMAIN-KEYWORD'
  | 'DOMAIN'
  | 'IP-CIDR'
  | 'GEOIP'
  | 'RULE-SET'
  | 'FINAL'
  | 'OTHER';

export interface UnifiedRuleItem {
  id: string;
  name: string;
  kind: 'local' | 'remote';
  type: RuleType;
  payload: string; // domain list, ip-cidr, or remote ruleset URL
  format?: 'binary' | 'mrs' | 'yaml' | 'text'; // for remote ruleset
  outbound: string; // target proxy group
  enabled: boolean;
  clientUrls?: {
    singbox?: string;
    mihomo?: string;
    loon?: string;
    quantumultx?: string;
    egern?: string;
  };
}

export interface CountryPatternRule {
  id: string;
  code: string;
  name: string;
  emoji: string;
  pattern: string; // regex pattern string
  groupName?: string; // e.g. "🇭🇰 香港节点"
}

export interface ProfileNodeFilter {
  mode?: 'all' | 'filter' | 'manual';
  sourceIds?: string[];
  countryCodes?: string[];
  includeKeywords?: string[];
  excludeKeywords?: string[];
  includeRegex?: string;
  excludeRegex?: string;
  selectedNodeIds?: string[]; // Specifically chosen node IDs
}

export interface SubscriptionProfile {
  id: string;
  name: string;
  token: string;
  enabled: boolean;
  description?: string;
  nodeFilter: ProfileNodeFilter;
  selectedGroupIds?: string[];
  selectedRuleIds?: string[];
  templates?: {
    mihomo?: string;
    singbox?: string;
    loon?: string;
    quantumultx?: string;
    egern?: string;
  };
  createdAt?: string;
  updatedAt?: string;
}

export interface AppConfig {
  sources: SubscriptionSource[];
  rules: ExtractionRule[];
  countryRules?: CountryPatternRule[];
  templates: ConfigTemplate[];
  proxyGroups: ProxyGroupItem[];
  rulesList: UnifiedRuleItem[];
  profiles: SubscriptionProfile[];
  settings: {
    token?: string; // legacy token support if any
    subToken?: string; // secret random token in url e.g. /s/:subToken
    adminPassword?: string; // admin dashboard password
    port?: number;
  };
}

