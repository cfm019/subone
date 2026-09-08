import { CountryPatternRule, ProxyNode, ProxyType } from '../../types/index.js';

import { detectCountry } from './country.js';

function decodeBase64Safe(str: string): string {
  try {
    let base = str.replace(/-/g, '+').replace(/_/g, '/');
    while (base.length % 4) {
      base += '=';
    }
    return Buffer.from(base, 'base64').toString('utf-8');
  } catch (e) {
    return str;
  }
}

export function parseNodeUri(uri: string, index: number = 0, countryPatterns?: CountryPatternRule[]): ProxyNode | null {
  uri = uri.trim();
  if (!uri) return null;

  try {
    const lower = uri.toLowerCase();
    if (lower.startsWith('vless://')) {
      return parseVless(uri, index, countryPatterns);
    } else if (lower.startsWith('vmess://')) {
      return parseVmess(uri, index, countryPatterns);
    } else if (lower.startsWith('ss://')) {
      return parseShadowsocks(uri, index, countryPatterns);
    } else if (lower.startsWith('trojan://')) {
      return parseTrojan(uri, index, countryPatterns);
    } else if (lower.startsWith('hy2://') || lower.startsWith('hysteria2://')) {
      return parseHysteria2(uri, index, countryPatterns);
    } else if (lower.startsWith('tuic://')) {
      return parseTuic(uri, index, countryPatterns);
    } else if (lower.startsWith('wireguard://') || lower.startsWith('wg://')) {
      return parseWireguard(uri, index, countryPatterns);
    } else if (lower.startsWith('snell://')) {
      return parseSnell(uri, index, countryPatterns);
    } else if (lower.startsWith('anytls://')) {
      return parseAnytls(uri, index, countryPatterns);
    } else if (lower.startsWith('socks5://') || lower.startsWith('socks5h://') || lower.startsWith('socks://')) {
      return parseSocks5(uri, index, countryPatterns);
    } else if (lower.startsWith('v2rayn://')) {
      return parseV2rayN(uri, index, countryPatterns);
    }
  } catch (err) {
    console.error('Failed to parse node uri:', uri, err);
  }
  return null;
}

function parseVless(uri: string, index: number, countryPatterns?: CountryPatternRule[]): ProxyNode {
  const url = new URL(uri);
  const uuid = decodeURIComponent(url.username);
  const server = url.hostname;
  const port = parseInt(url.port || '443', 10);
  const name = decodeURIComponent(url.hash.slice(1)) || `VLESS-${server}-${port}`;
  const params = url.searchParams;

  const security = params.get('security') || 'none';
  const type = params.get('type') || 'tcp';
  const flow = params.get('flow') || undefined;
  const sni = params.get('sni') || undefined;
  const fp = params.get('fp') || 'chrome';
  const pbk = params.get('pbk') || undefined;
  const sid = params.get('sid') || undefined;
  const path = params.get('path') || undefined;
  const host = params.get('host') || undefined;
  const serviceName = params.get('serviceName') || undefined;

  const country = detectCountry(name, countryPatterns);

  return {
    id: `node-${index}-${server}-${port}`,
    name,
    type: 'vless',
    server,
    port,
    uuid,
    countryCode: country?.code,
    countryEmoji: country?.emoji,
    tls: security === 'tls' || security === 'reality',
    flow,
    sni,
    fingerprint: fp,
    reality: security === 'reality' && pbk ? {
      enabled: true,
      publicKey: pbk,
      shortId: sid || undefined,
    } : undefined,
    network: type as any,
    wsPath: path,
    wsHeaders: host ? { Host: host } : undefined,
    grpcServiceName: serviceName,
  };
}

function parseVmess(uri: string, index: number, countryPatterns?: CountryPatternRule[]): ProxyNode {
  const rawData = uri.slice(8);
  const decoded = decodeBase64Safe(rawData);
  const json = JSON.parse(decoded);

  const name = json.ps || `VMess-${json.add}-${json.port}`;
  const country = detectCountry(name, countryPatterns);

  return {
    id: `node-${index}-${json.add}-${json.port}`,
    name,
    type: 'vmess',
    server: json.add,
    port: parseInt(json.port, 10),
    uuid: json.id,
    alterId: json.aid ? parseInt(json.aid, 10) : 0,
    cipher: json.scy || 'auto',
    countryCode: country?.code,
    countryEmoji: country?.emoji,
    tls: json.tls === 'tls',
    sni: json.sni || json.host || undefined,
    network: (json.net || 'tcp') as any,
    wsPath: json.path || undefined,
    wsHeaders: json.host ? { Host: json.host } : undefined,
  };
}

function parseShadowsocks(uri: string, index: number, countryPatterns?: CountryPatternRule[]): ProxyNode {
  let urlPart = uri.slice(5);
  let name = `Shadowsocks-${index}`;
  if (urlPart.includes('#')) {
    const parts = urlPart.split('#');
    urlPart = parts[0];
    name = decodeURIComponent(parts[1]);
  }

  let method = '';
  let password = '';
  let server = '';
  let port = 0;

  if (urlPart.includes('@')) {
    const [userinfo, serverinfo] = urlPart.split('@');
    const [s, p] = serverinfo.split(':');
    server = s;
    port = parseInt(p, 10);

    const decodedUserinfo = decodeBase64Safe(userinfo);
    if (decodedUserinfo.includes(':')) {
      const [m, pwd] = decodedUserinfo.split(':');
      method = m;
      password = pwd;
    } else {
      const [m, pwd] = userinfo.split(':');
      method = m;
      password = pwd;
    }
  } else {
    const decoded = decodeBase64Safe(urlPart);
    const atIndex = decoded.lastIndexOf('@');
    if (atIndex !== -1) {
      const userinfo = decoded.slice(0, atIndex);
      const serverinfo = decoded.slice(atIndex + 1);
      const [m, pwd] = userinfo.split(':');
      method = m;
      password = pwd;
      const [s, p] = serverinfo.split(':');
      server = s;
      port = parseInt(p, 10);
    }
  }

  const country = detectCountry(name, countryPatterns);
  return {
    id: `node-${index}-${server}-${port}`,
    name,
    type: 'ss',
    server,
    port,
    method,
    password,
    countryCode: country?.code,
    countryEmoji: country?.emoji,
  };
}

function parseTrojan(uri: string, index: number, countryPatterns?: CountryPatternRule[]): ProxyNode {
  const url = new URL(uri);
  const password = decodeURIComponent(url.username);
  const server = url.hostname;
  const port = parseInt(url.port || '443', 10);
  const name = decodeURIComponent(url.hash.slice(1)) || `Trojan-${server}-${port}`;
  const params = url.searchParams;

  const sni = params.get('sni') || params.get('peer') || undefined;
  const type = params.get('type') || 'tcp';
  const path = params.get('path') || undefined;
  const host = params.get('host') || undefined;
  const fp = params.get('fp') || 'chrome';

  const country = detectCountry(name, countryPatterns);
  return {
    id: `node-${index}-${server}-${port}`,
    name,
    type: 'trojan',
    server,
    port,
    password,
    countryCode: country?.code,
    countryEmoji: country?.emoji,
    tls: true,
    sni,
    fingerprint: fp,
    network: type as any,
    wsPath: path,
    wsHeaders: host ? { Host: host } : undefined,
  };
}

function parseHysteria2(uri: string, index: number, countryPatterns?: CountryPatternRule[]): ProxyNode {
  const url = new URL(uri);
  const password = decodeURIComponent(url.username);
  const server = url.hostname;
  const port = parseInt(url.port || '443', 10);
  const name = decodeURIComponent(url.hash.slice(1)) || `Hy2-${server}-${port}`;
  const params = url.searchParams;

  const sni = params.get('sni') || undefined;
  const obfs = params.get('obfs') || undefined;
  const obfsPassword = params.get('obfs-password') || undefined;
  const insecure = params.get('insecure') === '1' || params.get('allowInsecure') === '1' || params.get('skipCertVerify') === 'true';

  const country = detectCountry(name, countryPatterns);
  return {
    id: `node-${index}-${server}-${port}`,
    name,
    type: 'hysteria2',
    server,
    port,
    password,
    countryCode: country?.code,
    countryEmoji: country?.emoji,
    tls: true,
    sni,
    skipCertVerify: insecure || undefined,
    obfs,
    obfsPassword,
  };
}

function parseTuic(uri: string, index: number, countryPatterns?: CountryPatternRule[]): ProxyNode {
  const url = new URL(uri);
  const uuid = decodeURIComponent(url.username);
  const password = decodeURIComponent(url.password);
  const server = url.hostname;
  const port = parseInt(url.port || '443', 10);
  const name = decodeURIComponent(url.hash.slice(1)) || `TUIC-${server}-${port}`;
  const params = url.searchParams;

  const sni = params.get('sni') || undefined;
  const country = detectCountry(name, countryPatterns);

  return {
    id: `node-${index}-${server}-${port}`,
    name,
    type: 'tuic',
    server,
    port,
    uuid,
    password,
    countryCode: country?.code,
    countryEmoji: country?.emoji,
    tls: true,
    sni,
  };
}

function parseWireguard(uri: string, index: number, countryPatterns?: CountryPatternRule[]): ProxyNode {
  // Normalize wg:// to wireguard://
  const normUri = uri.startsWith('wg://') ? 'wireguard://' + uri.slice(5) : uri;
  const url = new URL(normUri);
  const privateKey = decodeURIComponent(url.username);
  const server = url.hostname;
  const port = parseInt(url.port || '51820', 10);
  const name = decodeURIComponent(url.hash.slice(1)) || `WireGuard-${server}-${port}`;
  const params = url.searchParams;

  const publicKey = params.get('publickey') || params.get('public_key') || params.get('peer_public_key') || '';
  const presharedKey = params.get('preshared_key') || params.get('presharedkey') || params.get('psk') || undefined;
  const ipStr = params.get('ip') || params.get('self_ip') || params.get('address') || params.get('local_address') || '';
  
  let ip: string | undefined;
  let ipv6: string | undefined;
  let localAddress: string[] = [];

  if (ipStr) {
    const rawList = ipStr.split(',').map(s => s.trim()).filter(Boolean);
    localAddress = rawList;
    rawList.forEach(addr => {
      const pure = addr.split('/')[0];
      if (pure.includes(':') && !ipv6) {
        ipv6 = pure;
      } else if (!ip) {
        ip = pure;
      }
    });
  }

  let reserved: number[] | undefined;
  const resStr = params.get('reserved');
  if (resStr) {
    try {
      if (resStr.startsWith('[') && resStr.endsWith(']')) {
        reserved = JSON.parse(resStr);
      } else {
        reserved = resStr.split(',').map(s => parseInt(s.trim(), 10)).filter(n => !isNaN(n));
      }
    } catch (e) {}
  }

  const mtuStr = params.get('mtu');
  const mtu = mtuStr ? parseInt(mtuStr, 10) : undefined;
  const remoteDnsResolve = params.get('remote_dns_resolve') === 'true' || params.get('remote_dns_resolve') === '1';

  const country = detectCountry(name, countryPatterns);

  return {
    id: `node-${index}-${server}-${port}`,
    name,
    type: 'wireguard',
    server,
    port,
    privateKey,
    publicKey,
    presharedKey,
    ip,
    ipv6,
    localAddress: localAddress.length > 0 ? localAddress : undefined,
    reserved,
    mtu,
    remoteDnsResolve,
    udp: true,
    countryCode: country?.code,
    countryEmoji: country?.emoji,
  };
}

function parseSnell(uri: string, index: number, countryPatterns?: CountryPatternRule[]): ProxyNode {
  const url = new URL(uri);
  const server = url.hostname;
  const port = parseInt(url.port || '443', 10);
  const name = decodeURIComponent(url.hash.slice(1)) || `Snell-${server}-${port}`;
  const params = url.searchParams;

  const psk = decodeURIComponent(url.username) || params.get('psk') || params.get('password') || '';
  const version = params.get('version') ? parseInt(params.get('version')!, 10) : 4;
  const obfs = params.get('obfs') || params.get('obfs_mode') || undefined;
  const obfsHost = params.get('obfs-host') || params.get('obfs_host') || params.get('host') || undefined;

  const country = detectCountry(name, countryPatterns);

  return {
    id: `node-${index}-${server}-${port}`,
    name,
    type: 'snell',
    server,
    port,
    psk,
    password: psk,
    snellVersion: version,
    obfs,
    obfsHost,
    countryCode: country?.code,
    countryEmoji: country?.emoji,
  };
}

function parseAnytls(uri: string, index: number, countryPatterns?: CountryPatternRule[]): ProxyNode {
  const url = new URL(uri);
  const password = decodeURIComponent(url.username);
  const server = url.hostname;
  const port = parseInt(url.port || '443', 10);
  const name = decodeURIComponent(url.hash.slice(1)) || `AnyTLS-${server}-${port}`;
  const params = url.searchParams;

  const sni = params.get('sni') || params.get('serverName') || params.get('peer') || undefined;
  const alpnStr = params.get('alpn');
  const alpn = alpnStr ? alpnStr.split(',').map(s => s.trim()).filter(Boolean) : undefined;
  const fp = params.get('fp') || params.get('fingerprint') || 'chrome';
  const insecure = params.get('insecure') === '1' || params.get('allowInsecure') === '1' || params.get('skipCertVerify') === 'true';

  const country = detectCountry(name, countryPatterns);

  return {
    id: `node-${index}-${server}-${port}`,
    name,
    type: 'anytls',
    server,
    port,
    password,
    countryCode: country?.code,
    countryEmoji: country?.emoji,
    tls: true,
    sni,
    alpn,
    fingerprint: fp,
    skipCertVerify: insecure,
  };
}

function parseSocks5(uri: string, index: number, countryPatterns?: CountryPatternRule[]): ProxyNode {
  let urlPart = uri.replace(/^socks5h?:\/\//i, '').replace(/^socks:\/\//i, '');
  let name = `Socks5-${index}`;
  if (urlPart.includes('#')) {
    const parts = urlPart.split('#');
    urlPart = parts[0];
    name = decodeURIComponent(parts[1]);
  }

  let username = '';
  let password = '';
  let server = '';
  let port = 1080;
  let tls = false;
  let sni: string | undefined;
  let skipCertVerify = false;

  let queryStr = '';
  if (urlPart.includes('?')) {
    const parts = urlPart.split('?');
    urlPart = parts[0];
    queryStr = parts[1];
  }

  if (queryStr) {
    const params = new URLSearchParams(queryStr);
    tls = params.get('tls') === 'true' || params.get('tls') === '1';
    sni = params.get('sni') || params.get('peer') || undefined;
    skipCertVerify = params.get('insecure') === '1' || params.get('skipCertVerify') === 'true';
  }

  if (urlPart.includes('@')) {
    const atIdx = urlPart.lastIndexOf('@');
    const userinfo = urlPart.slice(0, atIdx);
    const serverinfo = urlPart.slice(atIdx + 1);

    const [s, p] = serverinfo.split(':');
    server = s;
    port = parseInt(p || '1080', 10);

    const decodedUserinfo = decodeBase64Safe(userinfo);
    if (decodedUserinfo.includes(':')) {
      const [u, pwd] = decodedUserinfo.split(':');
      username = decodeURIComponent(u);
      password = decodeURIComponent(pwd);
    } else if (userinfo.includes(':')) {
      const [u, pwd] = userinfo.split(':');
      username = decodeURIComponent(u);
      password = decodeURIComponent(pwd);
    } else {
      username = decodeURIComponent(userinfo);
    }
  } else {
    const decoded = decodeBase64Safe(urlPart);
    if (decoded.includes('@')) {
      const atIdx = decoded.lastIndexOf('@');
      const userinfo = decoded.slice(0, atIdx);
      const serverinfo = decoded.slice(atIdx + 1);
      const [s, p] = serverinfo.split(':');
      server = s;
      port = parseInt(p || '1080', 10);
      if (userinfo.includes(':')) {
        const [u, pwd] = userinfo.split(':');
        username = decodeURIComponent(u);
        password = decodeURIComponent(pwd);
      } else {
        username = decodeURIComponent(userinfo);
      }
    } else {
      const [s, p] = urlPart.split(':');
      server = s;
      port = parseInt(p || '1080', 10);
    }
  }

  const country = detectCountry(name, countryPatterns);

  return {
    id: `node-${index}-${server}-${port}`,
    name,
    type: 'socks5',
    server,
    port,
    username: username || undefined,
    password: password || undefined,
    countryCode: country?.code,
    countryEmoji: country?.emoji,
    tls,
    sni,
    skipCertVerify,
  };
}

function parseV2rayN(uri: string, index: number, countryPatterns?: CountryPatternRule[]): ProxyNode | null {
  const raw = uri.replace(/^v2rayn:\/\//i, '').trim();
  let protoHint = '';
  let b64Part = '';
  let hashName = '';

  let contentPart = raw;
  if (contentPart.includes('#')) {
    const hashIdx = contentPart.indexOf('#');
    hashName = decodeURIComponent(contentPart.slice(hashIdx + 1));
    contentPart = contentPart.slice(0, hashIdx);
  }

  const slashIdx = contentPart.indexOf('/');
  if (slashIdx !== -1) {
    protoHint = contentPart.slice(0, slashIdx).trim().toLowerCase();
    b64Part = contentPart.slice(slashIdx + 1).trim();
  } else {
    b64Part = contentPart.trim();
  }

  const decoded = decodeBase64Safe(b64Part);
  let json: any;
  try {
    json = JSON.parse(decoded);
  } catch (e) {
    return null;
  }

  if (!json || typeof json !== 'object') {
    return null;
  }

  // Determine protocol type
  let type: ProxyType = 'vless';
  if (protoHint === 'hysteria2' || protoHint === 'hy2') {
    type = 'hysteria2';
  } else if (protoHint === 'hysteria' || protoHint === 'hy') {
    type = 'hysteria';
  } else if (protoHint === 'tuic') {
    type = 'tuic';
  } else if (protoHint === 'wireguard' || protoHint === 'wg') {
    type = 'wireguard';
  } else if (protoHint === 'vless') {
    type = 'vless';
  } else if (protoHint === 'vmess') {
    type = 'vmess';
  } else if (protoHint === 'trojan') {
    type = 'trojan';
  } else if (protoHint === 'shadowsocks' || protoHint === 'ss') {
    type = 'ss';
  } else if (protoHint === 'socks' || protoHint === 'socks5') {
    type = 'socks5';
  } else if (protoHint === 'anytls') {
    type = 'anytls';
  } else if (protoHint === 'snell') {
    type = 'snell';
  } else if (json.ConfigType !== undefined) {
    const cfgType = Number(json.ConfigType);
    switch (cfgType) {
      case 1: type = 'vmess'; break;
      case 2: type = 'ss'; break;
      case 3: type = 'socks5'; break;
      case 4: type = 'vless'; break;
      case 5: type = 'trojan'; break;
      case 6: type = 'hysteria'; break;
      case 7: type = 'hysteria2'; break;
      case 8: type = 'tuic'; break;
      case 9: type = 'wireguard'; break;
      default:
        if (json.ProtoExtraObj?.PrivateKey || json.PublicKey) type = 'wireguard';
        else if (json.Flow || json.StreamSecurity === 'reality') type = 'vless';
        else if (json.AlterId !== undefined) type = 'vmess';
        break;
    }
  }

  const server = String(json.Address || json.Server || json.Host || '').trim();
  if (!server) return null;

  const port = parseInt(String(json.Port || '443'), 10);
  const name = json.Remarks || json.remarks || hashName || `${type.toUpperCase()}-${server}-${port}`;
  const country = detectCountry(name, countryPatterns);

  const insecure = json.AllowInsecure === true || json.AllowInsecure === 'true' || json.AllowInsecure === '1' || json.AllowInsecure === 1;
  const sni = json.Sni || json.sni || json.ServerName || json.RequestHost || undefined;
  const fp = json.Fingerprint || json.fingerprint || undefined;
  const alpn = json.Alpn ? (Array.isArray(json.Alpn) ? json.Alpn : String(json.Alpn).split(',').map((s: string) => s.trim()).filter(Boolean)) : undefined;
  const network = (json.Network || json.network || 'tcp').toLowerCase();
  const path = json.Path || json.path || undefined;
  const host = json.RequestHost || json.requestHost || undefined;

  const node: ProxyNode = {
    id: `node-${index}-${server}-${port}`,
    name,
    type,
    server,
    port,
    countryCode: country?.code,
    countryEmoji: country?.emoji,
    skipCertVerify: insecure || undefined,
    sni,
    alpn,
    fingerprint: fp,
    network: network as any,
    wsPath: path,
    wsHeaders: host ? { Host: host } : undefined,
    grpcServiceName: path,
  };

  const extra = json.ProtoExtraObj || {};

  if (type === 'hysteria2') {
    node.password = json.Password || json.password || json.Id || json.id || '';
    node.tls = true;
    node.obfs = extra.Obfs || extra.obfs || undefined;
    node.obfsPassword = extra.ObfsPassword || extra.obfsPassword || undefined;
  } else if (type === 'vless') {
    node.uuid = json.Id || json.id || json.Password || '';
    node.tls = json.StreamSecurity === 'tls' || json.StreamSecurity === 'reality' || Boolean(json.PublicKey);
    node.flow = json.Flow || json.flow || undefined;
    if (json.StreamSecurity === 'reality' || json.PublicKey) {
      node.reality = {
        enabled: true,
        publicKey: json.PublicKey || '',
        shortId: json.ShortId || json.shortId || undefined,
      };
    }
  } else if (type === 'vmess') {
    node.uuid = json.Id || json.id || '';
    node.alterId = json.AlterId !== undefined ? parseInt(String(json.AlterId), 10) : 0;
    node.cipher = json.Security || json.security || 'auto';
    node.tls = json.StreamSecurity === 'tls';
  } else if (type === 'trojan') {
    node.password = json.Password || json.password || json.Id || '';
    node.tls = true;
  } else if (type === 'ss') {
    node.method = json.Security || json.security || 'aes-128-gcm';
    node.password = json.Password || json.password || json.Id || '';
  } else if (type === 'tuic') {
    node.uuid = json.Id || json.id || '';
    node.password = json.Password || json.password || '';
    node.tls = true;
    node.congestionControl = extra.CongestionController || extra.congestionController || undefined;
  } else if (type === 'wireguard') {
    node.privateKey = extra.PrivateKey || json.Password || '';
    node.publicKey = extra.PublicKey || json.PublicKey || '';
    node.presharedKey = extra.PresharedKey || undefined;
    if (extra.LocalAddress) {
      node.localAddress = Array.isArray(extra.LocalAddress) ? extra.LocalAddress : [extra.LocalAddress];
      if (node.localAddress && node.localAddress.length > 0) {
        const pure = String(node.localAddress[0]).split('/')[0];
        if (pure.includes(':')) node.ipv6 = pure;
        else node.ip = pure;
      }
    }

    node.mtu = extra.Mtu ? parseInt(String(extra.Mtu), 10) : undefined;
    node.reserved = extra.Reserved || undefined;
    node.udp = true;
  } else if (type === 'socks5') {
    node.username = json.Id || undefined;
    node.password = json.Password || undefined;
    node.tls = json.StreamSecurity === 'tls';
  } else if (type === 'anytls') {
    node.password = json.Password || json.password || '';
    node.tls = true;
  }

  return node;
}



