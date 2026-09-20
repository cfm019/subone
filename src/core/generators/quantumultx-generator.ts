import { ProxyNode, ProxyGroupItem, UnifiedRuleItem, SubscriptionSource } from '../../types/index.js';
import { injectUnifiedToQuantumultX, isSupportedByQuantumultX } from './rule-injector.js';
export { isSupportedByQuantumultX };

export function nodeToQuantumultXProxy(node: ProxyNode): string {
  const tag = node.name.replace(/[=,]/g, '_');
  const cleanServer = (node.server || '').trim().replace(/^\[(.*)\]$/, '$1');
  const serverWithPort = cleanServer.includes(':') && !cleanServer.startsWith('[')
    ? `[${cleanServer}]:${node.port}`
    : `${cleanServer}:${node.port}`;

  if (node.network === 'grpc') {
    return `# Unsupported on Quantumult X (gRPC transport is not supported by QX): ${tag}`;
  }

  if (node.type === 'anytls') {
    let line = `anytls=${serverWithPort}, password=${node.password || ''}, over-tls=true`;
    if (node.sni) line += `, tls-host=${node.sni}`;
    if (node.reality?.enabled && node.reality.publicKey) {
      line += `, reality-base64-pubkey=${node.reality.publicKey}`;
      if (node.reality.shortId) {
        line += `, reality-hex-shortid=${node.reality.shortId}`;
      }
    }
    line += `, udp-relay=true, tag=${tag}`;
    return line;
  }

  if (node.type === 'vless') {
    const method = 'none';
    let line = `vless=${serverWithPort}, method=${method}, password=${node.uuid || ''}`;
    if (node.network === 'ws') {
      const host = node.wsHeaders?.Host || node.wsHeaders?.host || node.sni || cleanServer;
      const obfsType = (node.tls || node.reality?.enabled) ? 'wss' : 'ws';
      line += `, obfs=${obfsType}, obfs-host=${host}, obfs-uri=${node.wsPath || '/'}`;
    } else {
      if (node.tls || node.reality?.enabled) {
        line += `, obfs=over-tls, obfs-host=${node.sni || cleanServer}`;
      }
    }

    if (node.reality?.enabled && node.reality.publicKey) {
      line += `, reality-base64-pubkey=${node.reality.publicKey}`;
      if (node.reality.shortId) {
        line += `, reality-hex-shortid=${node.reality.shortId}`;
      }
    }

    if (node.flow?.includes('vision')) {
      line += `, vless-flow=xtls-rprx-vision`;
    }

    line += `, fast-open=false, udp-relay=true, tag=${tag}`;
    return line;
  }

  if (node.type === 'ss') {
    const method = node.method || 'aes-128-gcm';
    let line = `shadowsocks=${serverWithPort}, method=${method}, password=${node.password || ''}`;
    if (node.reality?.enabled && node.reality.publicKey) {
      line += `, obfs=over-tls, obfs-host=${node.sni || cleanServer}, reality-base64-pubkey=${node.reality.publicKey}`;
      if (node.reality.shortId) {
        line += `, reality-hex-shortid=${node.reality.shortId}`;
      }
    } else if (node.plugin === 'obfs') {
      line += `, obfs=${node.pluginOpts?.mode || 'http'}, obfs-host=${node.pluginOpts?.host || ''}`;
    } else if (node.plugin === 'v2ray-plugin') {
      line += `, obfs=ws, obfs-uri=${node.pluginOpts?.path || '/'}, obfs-host=${node.pluginOpts?.host || ''}`;
    }
    line += `, fast-open=false, udp-relay=true, tag=${tag}`;
    return line;
  }

  if (node.type === 'trojan') {
    let line = `trojan=${serverWithPort}, password=${node.password || ''}`;
    if (node.network === 'ws') {
      const host = node.wsHeaders?.Host || node.wsHeaders?.host || node.sni;
      const obfsType = (node.tls || node.reality?.enabled) ? 'wss' : 'ws';
      if (host) line += `, obfs=${obfsType}, obfs-host=${host}, obfs-uri=${node.wsPath || '/'}`;
      else line += `, obfs=${obfsType}, obfs-uri=${node.wsPath || '/'}`;
    } else {
      line += `, over-tls=true`;
      if (node.sni) line += `, tls-host=${node.sni}`;
      const verify = node.skipCertVerify ? 'false' : 'true';
      line += `, tls-verification=${verify}`;
    }

    if (node.reality?.enabled && node.reality.publicKey) {
      line += `, reality-base64-pubkey=${node.reality.publicKey}`;
      if (node.reality.shortId) {
        line += `, reality-hex-shortid=${node.reality.shortId}`;
      }
    }

    line += `, fast-open=false, udp-relay=true, tag=${tag}`;
    return line;
  }

  if (node.type === 'vmess') {
    const method = (node.cipher === 'auto' || !node.cipher) ? 'none' : node.cipher;
    let line = `vmess=${serverWithPort}, method=${method}, password=${node.uuid || ''}`;
    if (node.reality?.enabled && node.reality.publicKey) {
      line += `, obfs=over-tls, obfs-host=${node.sni || cleanServer}, reality-base64-pubkey=${node.reality.publicKey}`;
      if (node.reality.shortId) {
        line += `, reality-hex-shortid=${node.reality.shortId}`;
      }
    } else if (node.network === 'ws') {
      const host = node.wsHeaders?.Host || node.wsHeaders?.host || node.sni;
      const obfsType = node.tls ? 'wss' : 'ws';
      if (host) line += `, obfs=${obfsType}, obfs-host=${host}, obfs-uri=${node.wsPath || '/'}`;
      else line += `, obfs=${obfsType}, obfs-uri=${node.wsPath || '/'}`;
    } else if (node.tls) {
      line += `, tls=true`;
      if (node.sni) line += `, tls-host=${node.sni}`;
      const verify = node.skipCertVerify ? 'false' : 'true';
      line += `, tls-verification=${verify}`;
    }
    line += `, fast-open=false, udp-relay=true, tag=${tag}`;
    return line;
  }

  if (node.type === 'socks5') {
    let line = `socks5=${serverWithPort}`;
    if (node.username) line += `, username=${node.username}`;
    if (node.password) line += `, password=${node.password}`;
    if (node.tls) {
      line += `, over-tls=true`;
      if (node.sni) line += `, tls-host=${node.sni}`;
    }
    line += `, fast-open=false, udp-relay=true, tag=${tag}`;
    return line;
  }

  if (node.type === 'http') {
    let line = `http=${serverWithPort}`;
    if (node.username) line += `, username=${node.username}`;
    if (node.password) line += `, password=${node.password}`;
    if (node.tls) {
      line += `, over-tls=true`;
      if (node.sni) line += `, tls-host=${node.sni}`;
    }
    line += `, fast-open=false, tag=${tag}`;
    return line;
  }

  return `# Unsupported on Quantumult X (${node.type.toUpperCase()}): ${tag}`;
}

export interface QuantumultXGeneratorOptions {
  expandNodes?: boolean;
  baseUrl?: string;
  subToken?: string;
}

export function generateQuantumultXConfig(
  templateConf: string,
  nodes: ProxyNode[],
  proxyGroups: ProxyGroupItem[] = [],
  rulesList: UnifiedRuleItem[] = [],
  sources: SubscriptionSource[] = [],
  options?: QuantumultXGeneratorOptions
): string {
  const expandNodes = Boolean(options?.expandNodes);
  const hasSuboneRemoteSubscription = Boolean(options?.baseUrl && options?.subToken && !expandNodes);
  const lines = templateConf.split('\n');
  const resultLines: string[] = [];

  const allNodesMap = new Map<string, ProxyNode>();
  nodes.forEach(n => allNodesMap.set(n.name, n));
  sources.forEach(s => {
    if ((s.type === 'filter' || s.type === 'custom' || !s.url || !s.url.startsWith('http')) && Array.isArray(s.nodes)) {
      s.nodes.forEach(n => {
        if (!allNodesMap.has(n.name)) allNodesMap.set(n.name, n);
      });
    }
  });
  const allCandidateNodes = Array.from(allNodesMap.values());

  const networkSourceIds = new Set(
    sources.filter(s => s.enabled && s.type !== 'custom' && s.type !== 'filter' && s.url && s.url.startsWith('http')).map(s => s.id)
  );

  let nodesToWrite: ProxyNode[] = [];
  if (expandNodes) {
    nodesToWrite = allCandidateNodes;
  } else if (!hasSuboneRemoteSubscription) {
    nodesToWrite = allCandidateNodes.filter(n => !n.sourceId || n.sourceId === 'custom' || n.sourceId.startsWith('custom') || !networkSourceIds.has(n.sourceId));
  } else {
    // 订阅化模式：由 server_remote 接管自建源
    nodesToWrite = [];
  }

  const generatedProxyLines = nodesToWrite.map(nodeToQuantumultXProxy);

  let inServerLocal = false;
  let serverLocalWritten = false;

  for (let i = 0; i < lines.length; i++) {
    const rawLine = lines[i];
    const trimmed = rawLine.trim().toLowerCase();

    if (trimmed.startsWith('[server_local]')) {
      inServerLocal = true;
      resultLines.push(rawLine);
      if (generatedProxyLines.length > 0) {
        resultLines.push(...generatedProxyLines);
        serverLocalWritten = true;
      }
      continue;
    }

    if (trimmed.startsWith('[') && inServerLocal) {
      inServerLocal = false;
    }

    if (!inServerLocal) {
      resultLines.push(rawLine);
    }
  }

  if (!serverLocalWritten && generatedProxyLines.length > 0) {
    resultLines.push('\n[server_local]');
    resultLines.push(...generatedProxyLines);
  }

  const baseConfig = resultLines.join('\n');
  return injectUnifiedToQuantumultX(baseConfig, nodes, proxyGroups, rulesList, sources, options);
}
