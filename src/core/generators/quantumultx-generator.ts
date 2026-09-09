import { ProxyNode, ProxyGroupItem, UnifiedRuleItem, SubscriptionSource } from '../../types/index.js';
import { injectUnifiedToQuantumultX, isSupportedByQuantumultX } from './rule-injector.js';
export { isSupportedByQuantumultX };

export function nodeToQuantumultXProxy(node: ProxyNode): string {
  const tag = node.name.replace(/[=,]/g, '_');

  if (node.network === 'grpc') {
    return `# Unsupported on Quantumult X (gRPC transport is not supported by QX): ${tag}`;
  }

  if (node.type === 'anytls') {
    let line = `anytls=${node.server}:${node.port}, password=${node.password || ''}, over-tls=true`;
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
    let line = `vless=${node.server}:${node.port}, method=${method}, password=${node.uuid || ''}`;
    if (node.network === 'ws') {
      const host = node.wsHeaders?.Host || node.wsHeaders?.host || node.sni || node.server;
      const obfsType = (node.tls || node.reality?.enabled) ? 'wss' : 'ws';
      line += `, obfs=${obfsType}, obfs-host=${host}, obfs-uri=${node.wsPath || '/'}`;
    } else {
      if (node.tls || node.reality?.enabled) {
        line += `, obfs=over-tls, obfs-host=${node.sni || node.server}`;
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
    let line = `shadowsocks=${node.server}:${node.port}, method=${method}, password=${node.password || ''}`;
    if (node.reality?.enabled && node.reality.publicKey) {
      line += `, obfs=over-tls, obfs-host=${node.sni || node.server}, reality-base64-pubkey=${node.reality.publicKey}`;
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
    let line = `trojan=${node.server}:${node.port}, password=${node.password || ''}`;
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
    let line = `vmess=${node.server}:${node.port}, method=${method}, password=${node.uuid || ''}`;
    if (node.reality?.enabled && node.reality.publicKey) {
      line += `, obfs=over-tls, obfs-host=${node.sni || node.server}, reality-base64-pubkey=${node.reality.publicKey}`;
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
    let line = `socks5=${node.server}:${node.port}`;
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
    let line = `http=${node.server}:${node.port}`;
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

export function generateQuantumultXConfig(
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

  const nodesToWrite = expandNodes ? nodes : nodes.filter(n => n.sourceId === 'custom' || !n.sourceId);
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
