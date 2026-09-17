import yaml from 'js-yaml';
import { ProxyNode, ProxyGroupItem, UnifiedRuleItem, SubscriptionSource } from '../../types/index.js';

import { injectUnifiedToMihomo } from './rule-injector.js';

export function nodeToMihomoProxy(node: ProxyNode): any {
  // Only reuse raw if it is legitimately a Clash/Mihomo proxy object (not sing-box outbound, etc.)
  if (
    node.raw &&
    typeof node.raw === 'object' &&
    node.raw.type &&
    node.raw.server &&
    (node.raw.port || node.raw.ports) &&
    !node.raw.server_port &&
    !node.raw.tag
  ) {
    const rawCopy: any = {
      ...node.raw,
      name: node.name,
    };
    if (typeof rawCopy.server === 'string') {
      rawCopy.server = rawCopy.server.trim().replace(/^\[(.*)\]$/, '$1');
    }
    // Fix legacy or misconfigured reality field in raw if present
    if (rawCopy.reality && !rawCopy['reality-opts']) {
      rawCopy['reality-opts'] = {
        'public-key': rawCopy.reality['public-key'] || rawCopy.reality.publicKey,
        'short-id': rawCopy.reality['short-id'] || rawCopy.reality.shortId || '',
      };
      delete rawCopy.reality;
    }
    if (rawCopy.udp === undefined) {
      rawCopy.udp = true;
    }
    return rawCopy;
  }

  const cleanServer = (node.server || '').trim().replace(/^\[(.*)\]$/, '$1');

  const base: any = {
    name: node.name,
    type: node.type === 'ss' ? 'ss' : node.type,
    server: cleanServer,
    port: node.port,
    udp: node.udp !== undefined ? Boolean(node.udp) : true,
  };

  if (node.type === 'ss') {
    base.cipher = node.method || 'aes-128-gcm';
    base.password = node.password;
    if (node.packetEncoding) base['packet-encoding'] = node.packetEncoding;
    if (node.plugin) {
      base.plugin = node.plugin;
      base['plugin-opts'] = node.pluginOpts;
    }
    return base;
  }

  if (node.type === 'vless') {
    base.uuid = node.uuid;
    if (node.flow) base.flow = node.flow;
    base['packet-encoding'] = node.packetEncoding || 'xudp';
    if (node.tls || (node.reality && node.reality.enabled)) {
      base.tls = true;
      if (node.sni) base.servername = node.sni;
      if (node.fingerprint) base['client-fingerprint'] = node.fingerprint;
      if (node.skipCertVerify) base['skip-cert-verify'] = true;
      if (node.alpn) base.alpn = node.alpn;
      if (node.reality && node.reality.enabled) {
        base['reality-opts'] = {
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
        if (node.maxEarlyData) base['ws-opts']['max-early-data'] = node.maxEarlyData;
        if (node.earlyDataHeaderName) base['ws-opts']['early-data-header-name'] = node.earlyDataHeaderName;
      }
      if (node.network === 'grpc' && node.grpcServiceName) {
        base['grpc-opts'] = {
          'grpc-service-name': node.grpcServiceName,
        };
      }
      if (node.network === 'http' || node.network === 'h2') {
        base['h2-opts'] = {
          host: node.sni ? [node.sni] : [],
          path: node.wsPath || '/',
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
      if (node.skipCertVerify) base['skip-cert-verify'] = true;
      if (node.fingerprint) base['client-fingerprint'] = node.fingerprint;
    }
    if (node.network) {
      base.network = node.network;
      if (node.network === 'ws' && node.wsPath) {
        base['ws-opts'] = {
          path: node.wsPath,
          headers: node.wsHeaders || {},
        };
        if (node.maxEarlyData) base['ws-opts']['max-early-data'] = node.maxEarlyData;
        if (node.earlyDataHeaderName) base['ws-opts']['early-data-header-name'] = node.earlyDataHeaderName;
      }
      if (node.network === 'grpc' && node.grpcServiceName) {
        base['grpc-opts'] = {
          'grpc-service-name': node.grpcServiceName,
        };
      }
      if (node.network === 'http' || node.network === 'h2') {
        base['h2-opts'] = {
          host: node.sni ? [node.sni] : [],
          path: node.wsPath || '/',
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
    if (node.alpn) base.alpn = node.alpn;
    if (node.skipCertVerify) base['skip-cert-verify'] = true;
    if (node.network) {
      base.network = node.network;
      if (node.network === 'ws' && node.wsPath) {
        base['ws-opts'] = {
          path: node.wsPath,
          headers: node.wsHeaders || {},
        };
        if (node.maxEarlyData) base['ws-opts']['max-early-data'] = node.maxEarlyData;
        if (node.earlyDataHeaderName) base['ws-opts']['early-data-header-name'] = node.earlyDataHeaderName;
      }
      if (node.network === 'grpc' && node.grpcServiceName) {
        base['grpc-opts'] = {
          'grpc-service-name': node.grpcServiceName,
        };
      }
      if (node.network === 'http' || node.network === 'h2') {
        base['h2-opts'] = {
          host: node.sni ? [node.sni] : [],
          path: node.wsPath || '/',
        };
      }
    }
    return base;
  }

  if (node.type === 'hysteria2') {
    base.password = node.password;
    base.tls = true;
    if (node.sni) base.sni = node.sni;
    if (node.serverPorts && node.serverPorts.length > 0) {
      const portsList = Array.isArray(node.serverPorts)
        ? node.serverPorts
        : String(node.serverPorts).split(',');
      const formattedPorts = portsList
        .map((s: any) => String(s).trim().replace(':', '-'))
        .filter(Boolean);
      if (formattedPorts.length > 0) {
        base.ports = formattedPorts.join(',');
      }
    }
    if (node.hopInterval) base['hop-interval'] = node.hopInterval;
    if (node.upMbps) base.up = `${node.upMbps} Mbps`;
    if (node.downMbps) base.down = `${node.downMbps} Mbps`;
    if (node.alpn) base.alpn = node.alpn;
    if (node.skipCertVerify) base['skip-cert-verify'] = true;
    if (node.fingerprint) base['client-fingerprint'] = node.fingerprint;
    if (node.obfsPassword || node.obfs) {
      base.obfs = node.obfs || 'salamander';
      base['obfs-password'] = node.obfsPassword || node.obfs;
    }
    return base;
  }

  if (node.type === 'tuic') {
    base.uuid = node.uuid || node.password;
    base.password = node.password;
    base.tls = true;
    if (node.sni) base.sni = node.sni;
    if (node.alpn) base.alpn = node.alpn;
    if (node.quicCongestionControl) base['congestion-controller'] = node.quicCongestionControl;
    if (node.udpRelayMode) base['udp-relay-mode'] = node.udpRelayMode;
    if (node.heartbeat) base['heartbeat-interval'] = node.heartbeat;
    if (node.zeroRttHandshake !== undefined) base['reduce-rtt'] = node.zeroRttHandshake;
    if (node.skipCertVerify) base['skip-cert-verify'] = true;
    return base;
  }

  if (node.type === 'naive') {
    base.username = node.username;
    base.password = node.password;
    base.sni = node.sni;
    if (node.quic) {
      base.quic = true;
    }
    if (node.skipCertVerify) base['skip-cert-verify'] = true;
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
    if (node.idleSessionTimeout) base['idle-session-timeout'] = node.idleSessionTimeout;
    if (node.idleSessionCheckInterval) base['idle-session-check-interval'] = node.idleSessionCheckInterval;
    if (node.minIdleSession) base['min-idle-session'] = node.minIdleSession;
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

  // 1. Inject Custom / Manual / Filter Proxies directly (if any)
  const networkSources = sources.filter(s => s.enabled && s.type !== 'custom' && s.type !== 'filter' && s.url && s.url.startsWith('http'));
  const networkSourceIds = new Set(networkSources.map(s => s.id));

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
  const nodesToWrite = networkSources.length > 0
    ? allCandidateNodes.filter(n => !n.sourceId || n.sourceId === 'custom' || n.sourceId.startsWith('custom') || !networkSourceIds.has(n.sourceId))
    : allCandidateNodes;
  doc.proxies = nodesToWrite.map(nodeToMihomoProxy);

  // 2. Inject Proxy Groups & Unified Rules & Proxy Providers & DNS
  doc = injectUnifiedToMihomo(doc, nodes, proxyGroups, rulesList, sources);

  return yaml.dump(doc, {
    indent: 2,
    lineWidth: -1,
    noRefs: true,
  });
}


