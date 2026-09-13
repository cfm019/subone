import { ProxyNode, ProxyGroupItem, UnifiedRuleItem, SubscriptionSource } from '../../types/index.js';
import { injectUnifiedToShadowrocket } from './rule-injector.js';

export function nodeToShadowrocketProxy(node: ProxyNode): string {
  const name = node.name.replace(/[=,]/g, '_');

  if (node.type === 'ss') {
    const cipher = node.method || 'aes-128-gcm';
    const pwd = node.password || '';
    let line = `${name} = ss, ${node.server}, ${node.port}, ${cipher}, "${pwd}"`;
    if (node.reality?.enabled && node.reality.publicKey) {
      line += `, reality=true, public-key=${node.reality.publicKey}`;
      if (node.reality.shortId) line += `, short-id=${node.reality.shortId}`;
      if (node.sni) line += `, sni=${node.sni}`;
    } else if (node.plugin === 'obfs') {
      line += `, obfs=${node.pluginOpts?.mode || 'http'}, obfs-host=${node.pluginOpts?.host || ''}`;
    } else if (node.plugin === 'v2ray-plugin') {
      line += `, v2ray-plugin=true, plugin-opts="mode=${node.pluginOpts?.mode || 'websocket'};host=${node.pluginOpts?.host || ''};path=${node.pluginOpts?.path || '/'}"`;
    }
    line += `, udp=true, fast-open=false`;
    return line;
  }

  if (node.type === 'vmess') {
    const cipher = node.cipher || 'auto';
    let line = `${name} = vmess, ${node.server}, ${node.port}, username=${node.uuid || ''}, alterId=${node.alterId || 0}, cipher=${cipher}`;
    if (node.network === 'ws') {
      line += `, ws=true, ws-path=${node.wsPath || '/'}`;
      const host = node.wsHeaders?.Host || node.wsHeaders?.host || node.sni;
      if (host) line += `, ws-headers=Host:${host}`;
    }
    if (node.tls) {
      line += `, tls=true`;
      if (node.sni) line += `, sni=${node.sni}`;
      if (node.skipCertVerify) line += `, skip-cert-verify=true`;
    }
    if (node.reality?.enabled && node.reality.publicKey) {
      line += `, reality=true, public-key=${node.reality.publicKey}`;
      if (node.reality.shortId) line += `, short-id=${node.reality.shortId}`;
    }
    line += `, udp=true, fast-open=false`;
    return line;
  }

  if (node.type === 'vless') {
    let line = `${name} = vless, ${node.server}, ${node.port}, username=${node.uuid || ''}`;
    const net = (node.network || 'tcp').toLowerCase();

    if (net === 'ws') {
      line += `, ws=true, ws-path=${node.wsPath || '/'}`;
      const host = node.wsHeaders?.Host || node.wsHeaders?.host || node.sni;
      if (host) line += `, ws-headers=Host:${host}`;
    } else if (net === 'grpc') {
      line += `, grpc=true`;
      if (node.grpcServiceName) line += `, grpc-service-name=${node.grpcServiceName}`;
    } else if (net === 'http' || net === 'h2') {
      line += `, http=true, path=${node.h2Path || '/'}`;
      const host = node.h2Host || node.sni;
      if (host) line += `, host=${host}`;
    }

    if (node.tls || node.reality?.enabled) {
      line += `, tls=true`;
      if (node.sni) line += `, sni=${node.sni}`;
      if (node.skipCertVerify) line += `, skip-cert-verify=true`;
      if (node.fingerprint) line += `, client-fingerprint=${node.fingerprint}`;
    }

    if (node.reality?.enabled && node.reality.publicKey) {
      line += `, reality=true, public-key=${node.reality.publicKey}`;
      if (node.reality.shortId) line += `, short-id=${node.reality.shortId}`;
    }

    if (node.flow?.includes('vision')) {
      line += `, flow=xtls-rprx-vision`;
    }

    line += `, udp=true, fast-open=false`;
    return line;
  }

  if (node.type === 'trojan') {
    let line = `${name} = trojan, ${node.server}, ${node.port}, password="${node.password || ''}", tls=true`;
    if (node.sni) line += `, sni=${node.sni}`;
    if (node.skipCertVerify) line += `, skip-cert-verify=true`;
    if (node.fingerprint) line += `, client-fingerprint=${node.fingerprint}`;

    if (node.network === 'ws') {
      line += `, ws=true, ws-path=${node.wsPath || '/'}`;
      const host = node.wsHeaders?.Host || node.wsHeaders?.host || node.sni;
      if (host) line += `, ws-headers=Host:${host}`;
    } else if (node.network === 'grpc') {
      line += `, grpc=true`;
      if (node.grpcServiceName) line += `, grpc-service-name=${node.grpcServiceName}`;
    }

    if (node.reality?.enabled && node.reality.publicKey) {
      line += `, reality=true, public-key=${node.reality.publicKey}`;
      if (node.reality.shortId) line += `, short-id=${node.reality.shortId}`;
    }

    line += `, udp=true, fast-open=false`;
    return line;
  }

  if (node.type === 'hysteria2') {
    let line = `${name} = hysteria2, ${node.server}, ${node.port}, password="${node.password || ''}"`;
    if (node.sni) line += `, sni=${node.sni}`;
    if (node.skipCertVerify) line += `, skip-cert-verify=true`;
    const obfsPwd = node.obfsPassword || (node.obfs && node.obfs !== 'salamander' ? node.obfs : undefined);
    if (obfsPwd) line += `, obfs=salamander, obfs-password="${obfsPwd}"`;
    if (node.downMbps) line += `, download-bandwidth=${node.downMbps}`;
    if (node.upMbps) line += `, upload-bandwidth=${node.upMbps}`;
    if (node.serverPorts && node.serverPorts.length > 0) line += `, mport=${node.serverPorts.join(',')}`;
    line += `, udp=true`;
    return line;
  }

  if (node.type === 'anytls') {
    let line = `${name} = anytls, ${node.server}, ${node.port}, password="${node.password || ''}", tls=true`;
    if (node.sni) line += `, sni=${node.sni}`;
    if (node.skipCertVerify) line += `, skip-cert-verify=true`;
    if (node.fingerprint) line += `, client-fingerprint=${node.fingerprint}`;
    if (node.reality?.enabled && node.reality.publicKey) {
      line += `, reality=true, public-key=${node.reality.publicKey}`;
      if (node.reality.shortId) line += `, short-id=${node.reality.shortId}`;
    }
    line += `, udp=true`;
    return line;
  }

  if (node.type === 'socks5') {
    let line = `${name} = socks5, ${node.server}, ${node.port}`;
    if (node.username || node.password) {
      line += `, auth=${node.username || ''}:${node.password || ''}`;
    }
    if (node.tls) {
      line += `, tls=true`;
      if (node.sni) line += `, sni=${node.sni}`;
    }
    line += `, udp=true`;
    return line;
  }

  if (node.type === 'http') {
    let line = `${name} = http, ${node.server}, ${node.port}`;
    if (node.username || node.password) {
      line += `, auth=${node.username || ''}:${node.password || ''}`;
    }
    if (node.tls) {
      line += `, tls=true`;
      if (node.sni) line += `, sni=${node.sni}`;
    }
    return line;
  }

  if (node.type === 'wireguard') {
    let line = `${name} = wireguard, ${node.server}, ${node.port}, ip=${node.ip || '10.0.0.2'}, private-key="${node.privateKey || ''}", public-key="${node.publicKey || ''}"`;
    if (node.presharedKey) line += `, preshared-key="${node.presharedKey}"`;
    if (node.reserved && node.reserved.length > 0) line += `, reserved=${node.reserved.join(',')}`;
    return line;
  }

  return `# Unsupported on Shadowrocket (${node.type.toUpperCase()}): ${name}`;
}

export function nodeToUri(node: ProxyNode): string | null {
  const name = encodeURIComponent(node.name);
  if (node.type === 'ss') {
    const cred = Buffer.from(`${node.method || 'aes-128-gcm'}:${node.password || ''}`).toString('base64');
    return `ss://${cred}@${node.server}:${node.port}#${name}`;
  }

  if (node.type === 'trojan') {
    const params = new URLSearchParams();
    if (node.sni) params.set('sni', node.sni);
    if (node.skipCertVerify) params.set('allowInsecure', '1');
    if (node.network === 'ws') {
      params.set('type', 'ws');
      params.set('path', node.wsPath || '/');
      const host = node.wsHeaders?.Host || node.wsHeaders?.host || node.sni;
      if (host) params.set('host', host);
    } else if (node.network === 'grpc') {
      params.set('type', 'grpc');
      if (node.grpcServiceName) params.set('serviceName', node.grpcServiceName);
    }
    const qs = params.toString();
    return `trojan://${encodeURIComponent(node.password || '')}@${node.server}:${node.port}${qs ? '?' + qs : ''}#${name}`;
  }

  if (node.type === 'vless') {
    const params = new URLSearchParams();
    if (node.reality?.enabled) {
      params.set('security', 'reality');
      params.set('pbk', node.reality.publicKey);
      if (node.reality.shortId) params.set('sid', node.reality.shortId);
    } else if (node.tls) {
      params.set('security', 'tls');
    }
    if (node.sni) params.set('sni', node.sni);
    if (node.fingerprint) params.set('fp', node.fingerprint);
    if (node.flow) params.set('flow', node.flow);

    const net = (node.network || 'tcp').toLowerCase();
    if (net === 'ws') {
      params.set('type', 'ws');
      params.set('path', node.wsPath || '/');
      const host = node.wsHeaders?.Host || node.wsHeaders?.host || node.sni;
      if (host) params.set('host', host);
    } else if (net === 'grpc') {
      params.set('type', 'grpc');
      if (node.grpcServiceName) params.set('serviceName', node.grpcServiceName);
    } else if (net !== 'tcp') {
      params.set('type', net);
    }
    const qs = params.toString();
    return `vless://${node.uuid || ''}@${node.server}:${node.port}${qs ? '?' + qs : ''}#${name}`;
  }

  if (node.type === 'hysteria2') {
    const params = new URLSearchParams();
    if (node.sni) params.set('sni', node.sni);
    if (node.skipCertVerify) params.set('insecure', '1');
    const obfsPwd = node.obfsPassword || (node.obfs && node.obfs !== 'salamander' ? node.obfs : undefined);
    if (obfsPwd) {
      params.set('obfs', 'salamander');
      params.set('obfs-password', obfsPwd);
    }
    if (node.serverPorts && node.serverPorts.length > 0) {
      params.set('mport', node.serverPorts.join(','));
    }
    const qs = params.toString();
    return `hysteria2://${encodeURIComponent(node.password || '')}@${node.server}:${node.port}${qs ? '?' + qs : ''}#${name}`;
  }

  if (node.type === 'anytls') {
    const params = new URLSearchParams();
    if (node.sni) params.set('sni', node.sni);
    if (node.skipCertVerify) params.set('insecure', '1');
    if (node.fingerprint) params.set('fp', node.fingerprint);
    const qs = params.toString();
    return `anytls://${encodeURIComponent(node.password || '')}@${node.server}:${node.port}${qs ? '?' + qs : ''}#${name}`;
  }

  if (node.type === 'vmess') {
    const vmessObj: Record<string, any> = {
      v: '2',
      ps: node.name,
      add: node.server,
      port: node.port,
      id: node.uuid || '',
      aid: node.alterId || 0,
      scy: node.cipher || 'auto',
      net: node.network || 'tcp',
      type: 'none',
      host: node.wsHeaders?.Host || node.wsHeaders?.host || node.sni || '',
      path: node.wsPath || '/',
      tls: node.tls ? 'tls' : '',
      sni: node.sni || '',
    };
    const b64 = Buffer.from(JSON.stringify(vmessObj)).toString('base64');
    return `vmess://${b64}`;
  }

  return null;
}

export function generateShadowrocketBase64(nodes: ProxyNode[]): string {
  const uris = nodes
    .map(nodeToUri)
    .filter((u): u is string => Boolean(u));
  return Buffer.from(uris.join('\n'), 'utf-8').toString('base64');
}

export function generateShadowrocketConfig(
  templateConf: string,
  nodes: ProxyNode[],
  proxyGroups: ProxyGroupItem[] = [],
  rulesList: UnifiedRuleItem[] = [],
  sources: SubscriptionSource[] = [],
  options?: { expandNodes?: boolean }
): string {
  const expandNodes = Boolean(options?.expandNodes);
  const lines = templateConf.split('\n');
  const resultLines: string[] = [];

  const nodesToWrite = expandNodes ? nodes : nodes.filter(n => n.sourceId === 'custom' || n.sourceId?.startsWith('custom') || !n.sourceId);
  const generatedProxyLines = nodesToWrite.map(nodeToShadowrocketProxy);

  let inProxySection = false;
  let hasHandledProxy = false;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();

    if (trimmed === '[Proxy]') {
      inProxySection = true;
      hasHandledProxy = true;
      resultLines.push(line);
      resultLines.push(...generatedProxyLines);
      continue;
    }

    if (inProxySection && trimmed.startsWith('[')) {
      inProxySection = false;
    }

    if (inProxySection) continue;
    resultLines.push(line);
  }

  if (!hasHandledProxy) {
    resultLines.push('\n[Proxy]');
    resultLines.push(...generatedProxyLines);
  }

  const baseConfig = resultLines.join('\n');
  return injectUnifiedToShadowrocket(baseConfig, nodes, proxyGroups, rulesList, sources, options);
}
