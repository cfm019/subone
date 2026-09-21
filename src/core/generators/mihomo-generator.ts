import yaml from 'js-yaml';
import { ProxyNode, ProxyGroupItem, UnifiedRuleItem, SubscriptionSource } from '../../types/index.js';

import { adaptRulesetForMihomo, formatRuleTag } from './ruleset-adapter.js';
import { resolveSafeOutbound, formatCidr, cleanSourceOrGroupName, formatSourceGroupTag } from './common.js';

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

export interface MihomoGeneratorOptions {
  expandNodes?: boolean;
  baseUrl?: string;
  subToken?: string;
}

export function generateMihomoConfig(
  templateYaml: string,
  nodes: ProxyNode[],
  proxyGroups: ProxyGroupItem[] = [],
  rulesList: UnifiedRuleItem[] = [],
  sources: SubscriptionSource[] = [],
  options?: MihomoGeneratorOptions
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

  const expandNodes = Boolean(options?.expandNodes);
  const hasSuboneRemoteSubscription = Boolean(options?.baseUrl && options?.subToken && !expandNodes);

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

  let nodesToWrite: ProxyNode[] = [];
  if (expandNodes) {
    nodesToWrite = allCandidateNodes;
  } else if (!hasSuboneRemoteSubscription) {
    nodesToWrite = networkSources.length > 0
      ? allCandidateNodes.filter(n => !n.sourceId || n.sourceId === 'custom' || n.sourceId.startsWith('custom') || !networkSourceIds.has(n.sourceId))
      : allCandidateNodes;
  } else {
    // 订阅化模式：由 proxy-providers 接管自建源
    nodesToWrite = [];
  }

  doc.proxies = nodesToWrite.map(nodeToMihomoProxy);

  // 2. Inject Proxy Groups & Unified Rules & Proxy Providers & DNS
  doc = injectUnifiedToMihomo(doc, nodes, proxyGroups, rulesList, sources, options);

  return yaml.dump(doc, {
    indent: 2,
    lineWidth: -1,
    noRefs: true,
  });
}

export function injectUnifiedToMihomo(
  doc: any,
  nodes: ProxyNode[],
  proxyGroups: ProxyGroupItem[],
  rulesList: UnifiedRuleItem[],
  sources: SubscriptionSource[] = [],
  options?: { expandNodes?: boolean; baseUrl?: string; subToken?: string }
): any {

  if (!doc || typeof doc !== 'object') doc = {};

  const networkSources = sources.filter(s => s.enabled && s.type !== 'custom' && s.type !== 'filter' && s.url && s.url.startsWith('http'));
  const internalSources = sources.filter(s => s.enabled && !networkSources.some(ns => ns.id === s.id));
  const hasSuboneRemoteSubscription = Boolean(options?.baseUrl && options?.subToken && !options?.expandNodes);

  const customNodes = nodes.filter(n => n.sourceId === 'custom' || n.sourceId?.startsWith('custom') || !n.sourceId);
  const customNodeNames = customNodes.map(n => n.name);
  const allNodeNames = nodes.map(n => n.name);

  // 1. Inject Proxy Providers for network subscriptions and internal sources
  const allActiveRemoteSources: SubscriptionSource[] = [];

  if (!options?.expandNodes) {
    if (!doc['proxy-providers'] || typeof doc['proxy-providers'] !== 'object') {
      doc['proxy-providers'] = {};
    }

    // 外部机场源
    networkSources.forEach(s => {
      const providerKey = s.name.trim();
      const safePathName = providerKey
        .replace(/^[⚡️🚀👉♻️🌐📹✈️🤖🇨🇳🇭🇰🇯🇵🇺🇸🏮🇸🇬\s]+/u, '')
        .replace(/[\\/:*?"<>|\r\n\t]/g, '_')
        .replace(/\.{2,}/g, '_')
        .trim() || s.id || 'provider';

      doc['proxy-providers'][providerKey] = {
        type: 'http',
        url: s.url,
        interval: 86400,
        path: `./proxy_providers/${safePathName}.yaml`,
        'health-check': {
          enable: true,
          url: 'https://www.google.com/generate_204',
          interval: 300,
        },
      };
      allActiveRemoteSources.push(s);
    });

    // 内部自建/过滤/独立源转为 proxy-provider
    if (hasSuboneRemoteSubscription && options?.baseUrl && options?.subToken) {
      const cleanBaseUrl = options.baseUrl.replace(/\/+$/, '');
      const token = encodeURIComponent(options.subToken);
      internalSources.forEach(s => {
        const providerKey = s.name.trim();
        const safePathName = providerKey
          .replace(/^[⚡️🚀👉♻️🌐📹✈️🤖🇨🇳🇭🇰🇯🇵🇺🇸🏮🇸🇬\s]+/u, '')
          .replace(/[\\/:*?"<>|\r\n\t]/g, '_')
          .replace(/\.{2,}/g, '_')
          .trim() || s.id || 'provider';

        doc['proxy-providers'][providerKey] = {
          type: 'http',
          url: `${cleanBaseUrl}/s/${token}/source/${encodeURIComponent(s.id)}?target=mihomo`,
          interval: 86400,
          path: `./proxy_providers/${safePathName}.yaml`,
          'health-check': {
            enable: true,
            url: 'https://www.google.com/generate_204',
            interval: 300,
          },
        };
        allActiveRemoteSources.push(s);
      });
    }
  }

  const allProviderNames = allActiveRemoteSources.map(s => s.name.trim());

  // 2. Build Proxy Groups
  const customSources = sources.filter(s => s.type === 'custom' || s.id === 'custom');
  const customTagName = customSources[0]?.name
    ? formatSourceGroupTag(customSources[0])
    : '🖥️ 独立节点组';

  const effectiveGroups: ProxyGroupItem[] = proxyGroups.map(g => ({
    ...g,
    proxies: g.proxies ? [...g.proxies] : undefined,
    use: g.use ? [...g.use] : undefined,
  }));

  // Sanitize effectiveGroups: if there is a custom group, sync its name to customTagName and remove any stale custom group aliases
  const customGrp = effectiveGroups.find(g =>
    g.id === 'grp-src-custom' ||
    g.name === customTagName ||
    cleanSourceOrGroupName(g.name) === '独立节点组' ||
    cleanSourceOrGroupName(g.name) === '自建节点'
  );
  if (customGrp) {
    customGrp.name = customTagName;
    customGrp.use = [cleanSourceOrGroupName(customSources[0]?.name || '独立节点组')];
    const idx = effectiveGroups.indexOf(customGrp);
    for (let i = effectiveGroups.length - 1; i >= 0; i--) {
      if (i !== idx) {
        const g = effectiveGroups[i];
        if (g.id === 'grp-src-custom' || cleanSourceOrGroupName(g.name) === '独立节点组' || cleanSourceOrGroupName(g.name) === '自建节点') {
          effectiveGroups.splice(i, 1);
        }
      }
    }
    effectiveGroups.forEach(grp => {
      if (grp !== customGrp) {
        if (grp.use) {
          grp.use = grp.use.map(u => (cleanSourceOrGroupName(u) === '独立节点组' || cleanSourceOrGroupName(u) === '自建节点' ? cleanSourceOrGroupName(customSources[0]?.name || '独立节点组') : u));
        }
        if (grp.proxies) {
          grp.proxies = grp.proxies.map(p => (cleanSourceOrGroupName(p) === '独立节点组' || cleanSourceOrGroupName(p) === '自建节点' ? customTagName : p));
        }
      }
    });
  }

  const validGroupNames = new Set(effectiveGroups.map(g => g.name));
  const validNodeNames = new Set(allNodeNames);
  sources.forEach(s => {
    if (Array.isArray(s.nodes)) {
      s.nodes.forEach(n => validNodeNames.add(n.name));
    }
  });
  const isBuiltinClashProxy = (t: string) => {
    const upper = t.trim().toUpperCase();
    return (
      upper === 'DIRECT' ||
      upper === 'REJECT' ||
      upper === 'PASS' ||
      upper === 'COMPATIBLE' ||
      upper === 'GLOBAL' ||
      t.trim() === '🎯 本地直连'
    );
  };

  const generatedGroups: any[] = [];
  effectiveGroups.forEach(grp => {
    if (grp.type === 'direct') {
      generatedGroups.push({
        name: grp.name,
        type: 'select',
        proxies: ['DIRECT'],
      });
      return;
    }
    if (grp.type === 'reject') {
      generatedGroups.push({
        name: grp.name,
        type: 'select',
        proxies: ['REJECT'],
      });
      return;
    }

    const groupType = grp.type === 'urltest' ? 'url-test' : (grp.type === 'load-balance' ? 'load-balance' : grp.type);
    const grpObj: any = {
      name: grp.name,
      type: groupType,
    };

    if (groupType === 'url-test' || groupType === 'fallback') {
      grpObj.url = grp.url || 'https://www.google.com/generate_204';
      grpObj.interval = grp.interval || 300;
      grpObj.tolerance = grp.tolerance || 50;
    }

    // If using filter regex (e.g. for country groups)
    if (grp.filter) {
      grpObj.filter = grp.filter;
      if (allProviderNames.length > 0) {
        grpObj.use = grp.use && grp.use.length > 0 ? grp.use : allProviderNames;
      }
      if (!hasSuboneRemoteSubscription && customNodeNames.length > 0) {
        grpObj.proxies = customNodeNames;
      } else if (!grpObj.use || grpObj.use.length === 0) {
        grpObj.proxies = ['DIRECT'];
      }
      generatedGroups.push(grpObj);
      return;
    }

    // Custom dedicated node group or dedicated source group
    const cleanName = cleanSourceOrGroupName(grp.name).toLowerCase();
    const matchedProvider = allProviderNames.find(p => {
      const cleanP = cleanSourceOrGroupName(p).toLowerCase();
      return cleanP === cleanName || p.toLowerCase() === cleanName;
    });

    if (matchedProvider) {
      grpObj.use = [matchedProvider];
      delete grpObj.proxies;
      generatedGroups.push(grpObj);
      return;
    }

    if (!hasSuboneRemoteSubscription) {
      const isCustomGrp = grp.id === 'grp-src-custom' ||
        cleanName === '自建节点' ||
        cleanName === '独立节点组' ||
        cleanName === 'custom' ||
        cleanName === '手工自建' ||
        customSources.some(cs => cleanSourceOrGroupName(cs.name).toLowerCase() === cleanName);

      if (isCustomGrp) {
        grpObj.proxies = customNodeNames.length > 0 ? customNodeNames : ['DIRECT'];
        delete grpObj.use;
        generatedGroups.push(grpObj);
        return;
      }
    }

    // Selector / General groups
    const explicitProxies = grp.proxies || [];
    const combinedProxies = new Set<string>(explicitProxies);

    // If user explicitly specified `use` or this is a top-level aggregator group
    if (grp.use && grp.use.length > 0) {
      grp.use.forEach(u => {
        const cleanU = cleanSourceOrGroupName(u).toLowerCase();
        const isCustomU = cleanU === '自建节点' || cleanU === '独立节点组' || cleanU === 'custom' || cleanU === '手工自建' || customSources.some(cs => cleanSourceOrGroupName(cs.name).toLowerCase() === cleanU);
        if (!hasSuboneRemoteSubscription && isCustomU) {
          if (validGroupNames.has(customTagName)) {
            combinedProxies.add(customTagName);
          }
          customNodeNames.forEach(name => combinedProxies.add(name));
        }

        // Check if matching source (especially filter/derived sources without proxy-provider)
        const matchedSource = sources.find(s => {
          const sClean = cleanSourceOrGroupName(s.name).toLowerCase();
          return sClean === cleanU || s.id.trim().toLowerCase() === cleanU;
        });
        if (matchedSource && !allProviderNames.includes(matchedSource.name.trim())) {
          if (Array.isArray(matchedSource.nodes)) {
            matchedSource.nodes.forEach(n => combinedProxies.add(n.name));
          }
        }
      });

      const mappedUse = grp.use.map(u => {
        const direct = allProviderNames.find(p => p.toLowerCase() === u.toLowerCase());
        if (direct) return direct;
        const cleanU = cleanSourceOrGroupName(u).toLowerCase();
        const canonical = allProviderNames.find(p => {
          const cleanP = cleanSourceOrGroupName(p).toLowerCase();
          return cleanP === cleanU || p.toLowerCase() === cleanU;
        });
        return canonical || u;
      }).filter(u => allProviderNames.includes(u));

      if (mappedUse.length > 0) {
        grpObj.use = mappedUse;
      }
    } else if (allProviderNames.length > 0 && (grp.name === '🚀 节点选择' || grp.name === '👉 手动选择' || grp.name === '♻️ 自动选择')) {
      grpObj.use = allProviderNames;
    }

    // Add custom nodes or fallback
    if (!hasSuboneRemoteSubscription && (grp.name === '👉 手动选择' || (combinedProxies.size === 0 && !grpObj.use))) {
      customNodeNames.forEach(name => combinedProxies.add(name));
    }

    if (!hasSuboneRemoteSubscription && grp.name === '🚀 节点选择' && customNodes.length > 0 && validGroupNames.has(customTagName)) {
      combinedProxies.add(customTagName);
    }

    // Filter combinedProxies to only keep valid groups, nodes, or builtins
    const filteredProxies = Array.from(combinedProxies).filter(p => {
      if (!p || p.trim() === grp.name) return false;
      const t = p.trim();
      return validGroupNames.has(t) || validNodeNames.has(t) || isBuiltinClashProxy(t);
    });

    if (filteredProxies.length > 0) {
      grpObj.proxies = filteredProxies;
    }

    if ((!grpObj.proxies || grpObj.proxies.length === 0) && (!grpObj.use || grpObj.use.length === 0)) {
      grpObj.proxies = ['DIRECT'];
    }

    generatedGroups.push(grpObj);
  });

  doc['proxy-groups'] = generatedGroups.length > 0 ? generatedGroups : doc['proxy-groups'];

  // 2. Build Remote Rule Providers
  const activeRules = rulesList.filter(r => r.enabled);
  const remoteRules = activeRules.filter(r => r.kind === 'remote');
  const localRules = activeRules.filter(r => r.kind === 'local');

  if (remoteRules.length > 0) {
    if (!doc['rule-providers'] || typeof doc['rule-providers'] !== 'object') {
      doc['rule-providers'] = {};
    }
    remoteRules.forEach((r, idx) => {
      const provider = adaptRulesetForMihomo(r, idx);
      doc['rule-providers'][provider.tag] = {
        type: 'http',
        behavior: provider.behavior,
        format: provider.format,
        path: provider.path,
        url: provider.url,
        interval: 86400,
      };
    });
  }

  // 3. Build Rules
  const availableGroupNames = new Set<string>((doc['proxy-groups'] || []).map((g: any) => String(g.name)));
  const fallbackGroup = (doc['proxy-groups'] || []).find((g: any) => g.name === '🚀 节点选择')?.name || doc['proxy-groups']?.[0]?.name || 'DIRECT';

  const generatedRules: string[] = [];
  localRules.forEach(r => {
    const safeOutbound = resolveSafeOutbound(r.outbound, availableGroupNames, fallbackGroup);
    if (r.type === 'FINAL') {
      // final rule at the end
    } else if (r.payload.includes(',')) {
      r.payload.split(',').forEach(p => {
        const item = p.trim();
        if (item) {
          if (r.type === 'SRC-IP-CIDR') {
            generatedRules.push(`SRC-IP-CIDR,${formatCidr(item)},${safeOutbound}`);
          } else {
            generatedRules.push(`${r.type},${item},${safeOutbound}`);
          }
        }
      });
    } else {
      const item = r.payload.trim();
      if (r.type === 'SRC-IP-CIDR') {
        generatedRules.push(`SRC-IP-CIDR,${formatCidr(item)},${safeOutbound}`);
      } else {
        generatedRules.push(`${r.type},${item},${safeOutbound}`);
      }
    }
  });

  remoteRules.forEach((r, idx) => {
    const tag = formatRuleTag(r, idx);
    const safeOutbound = resolveSafeOutbound(r.outbound, availableGroupNames, fallbackGroup);
    generatedRules.push(`RULE-SET,${tag},${safeOutbound}`);
  });

  const existingRules = Array.isArray(doc.rules) ? doc.rules : [];
  const existingPreRules = existingRules.filter((r: any) => typeof r === 'string' && !r.trim().toUpperCase().startsWith('MATCH,'));
  const existingMatch = existingRules.find((r: any) => typeof r === 'string' && r.trim().toUpperCase().startsWith('MATCH,'));

  const finalMatch = existingMatch || (availableGroupNames.has('🐟 漏网之鱼') ? 'MATCH,🐟 漏网之鱼' : `MATCH,${fallbackGroup}`);

  const postRules = Array.isArray(doc.post_rules)
    ? doc.post_rules
    : Array.isArray(doc['post-rules'])
    ? doc['post-rules']
    : [];
  delete doc.post_rules;
  delete doc['post-rules'];

  doc.rules = [...existingPreRules, ...generatedRules, ...postRules, finalMatch];

  return doc;
}
