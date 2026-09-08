import yaml from 'js-yaml';
import { ProxyNode, ProxyGroupItem, UnifiedRuleItem, SubscriptionSource } from '../../types/index.js';

import { injectUnifiedToMihomo } from './rule-injector.js';

export function nodeToMihomoProxy(node: ProxyNode): any {
  if (node.raw && node.raw.type) {
    return {
      ...node.raw,
      name: node.name,
    };
  }

  const base: any = {
    name: node.name,
    type: node.type === 'ss' ? 'ss' : node.type,
    server: node.server,
    port: node.port,
  };

  if (node.type === 'ss') {
    base.cipher = node.method || 'aes-128-gcm';
    base.password = node.password;
    if (node.packetEncoding) base['packet-encoding'] = node.packetEncoding;
    return base;
  }

  if (node.type === 'vless') {
    base.uuid = node.uuid;
    if (node.flow) base.flow = node.flow;
    if (node.packetEncoding) base['packet-encoding'] = node.packetEncoding;
    if (node.tls) {
      base.tls = true;
      if (node.sni) base.servername = node.sni;
      if (node.fingerprint) base['client-fingerprint'] = node.fingerprint;
      if (node.reality && node.reality.enabled) {
        base.reality = {
          'public-key': node.reality.publicKey,
          'short-id': node.reality.shortId || '',
        };
      }
    }
    if (node.network) {
      base.network = node.network;
      if (node.network === 'ws' && node.wsPath) {
        base['ws-opts'] = {
          path: node.wsPath,
          headers: node.wsHeaders || {},
        };
      }
      if (node.network === 'grpc' && node.grpcServiceName) {
        base['grpc-opts'] = {
          'grpc-service-name': node.grpcServiceName,
        };
      }
    }
    return base;
  }

  if (node.type === 'vmess') {
    base.uuid = node.uuid;
    base.alterId = node.alterId || 0;
    base.cipher = node.cipher || 'auto';
    if (node.tls) {
      base.tls = true;
      if (node.sni) base.servername = node.sni;
    }
    if (node.network) {
      base.network = node.network;
      if (node.network === 'ws' && node.wsPath) {
        base['ws-opts'] = {
          path: node.wsPath,
          headers: node.wsHeaders || {},
        };
      }
    }
    return base;
  }

  if (node.type === 'trojan') {
    base.password = node.password;
    base.tls = true;
    if (node.sni) base.servername = node.sni;
    if (node.fingerprint) base['client-fingerprint'] = node.fingerprint;
    if (node.network) {
      base.network = node.network;
      if (node.network === 'ws' && node.wsPath) {
        base['ws-opts'] = {
          path: node.wsPath,
          headers: node.wsHeaders || {},
        };
      }
    }
    return base;
  }

  if (node.type === 'hysteria2') {
    base.password = node.password;
    base.tls = true;
    if (node.sni) base.sni = node.sni;
    if (node.obfs) {
      base.obfs = node.obfs;
      base['obfs-password'] = node.obfsPassword;
    }
    return base;
  }

  if (node.type === 'wireguard') {
    base.ip = node.ip || '10.0.0.2';
    if (node.ipv6) base.ipv6 = node.ipv6;
    base['private-key'] = node.privateKey || '';
    base['public-key'] = node.publicKey || '';
    if (node.presharedKey) base['preshared-key'] = node.presharedKey;
    if (node.reserved) base.reserved = node.reserved;
    if (node.mtu) base.mtu = node.mtu;
    base.udp = node.udp !== undefined ? node.udp : true;
    base['remote-dns-resolve'] = node.remoteDnsResolve !== undefined ? node.remoteDnsResolve : true;
    return base;
  }

  if (node.type === 'snell') {
    base.psk = node.psk || node.password || '';
    base.version = node.snellVersion || 4;
    if (node.obfs) {
      base['obfs-opts'] = {
        mode: node.obfs,
        host: node.obfsHost || '',
      };
    }
    return base;
  }

  if (node.type === 'anytls') {
    base.password = node.password || '';
    if (node.sni) base.sni = node.sni;
    if (node.alpn) base.alpn = node.alpn;
    if (node.skipCertVerify) base['skip-cert-verify'] = true;
    if (node.fingerprint) base['client-fingerprint'] = node.fingerprint;
    return base;
  }

  if (node.type === 'socks5') {
    base.type = 'socks5';
    if (node.username) base.username = node.username;
    if (node.password) base.password = node.password;
    if (node.tls) {
      base.tls = true;
      if (node.sni) base.sni = node.sni;
      if (node.skipCertVerify) base['skip-cert-verify'] = true;
      if (node.fingerprint) base['client-fingerprint'] = node.fingerprint;
    }
    base.udp = node.udp !== undefined ? node.udp : true;
    return base;
  }

  return base;
}

export function generateMihomoConfig(
  templateYaml: string,
  nodes: ProxyNode[],
  proxyGroups: ProxyGroupItem[] = [],
  rulesList: UnifiedRuleItem[] = [],
  sources: SubscriptionSource[] = []
): string {
  let doc: any;
  try {
    doc = yaml.load(templateYaml) as any;
  } catch (e) {
    doc = {};
  }
  if (!doc || typeof doc !== 'object') {
    doc = {};
  }

  // 1. Inject Custom / Manual Proxies directly (if any)
  const customNodes = nodes.filter(n => n.sourceId === 'custom' || !n.sourceId);
  const networkSources = sources.filter(s => s.enabled && s.type !== 'custom' && s.url && s.url.startsWith('http'));

  // If no network providers configured, fallback to writing all nodes
  const nodesToWrite = networkSources.length > 0 ? customNodes : nodes;
  doc.proxies = nodesToWrite.map(nodeToMihomoProxy);

  // 2. Inject Proxy Groups & Unified Rules & Proxy Providers & DNS
  doc = injectUnifiedToMihomo(doc, nodes, proxyGroups, rulesList, sources);

  return yaml.dump(doc, {
    indent: 2,
    lineWidth: -1,
    noRefs: true,
  });
}


