import { ProxyNode, ProxyGroupItem, UnifiedRuleItem, SubscriptionSource } from '../../types/index.js';
import { adaptRulesetForSingbox, formatRuleTag } from './ruleset-adapter.js';
import { resolveSafeOutbound, formatCidr, cleanSourceOrGroupName, formatSourceGroupTag } from './common.js';

export function nodeToSingboxOutbound(node: ProxyNode): any {
  if (node.raw && node.raw.type && node.raw.tag) {
    const rawCopy = {
      ...node.raw,
      tag: node.name,
      _sourceName: node.sourceName,
      _sourceId: node.sourceId,
    };
    if (rawCopy.server && typeof rawCopy.server === 'string') {
      rawCopy.server = rawCopy.server.trim().replace(/^\[(.*)\]$/, '$1');
    }
    return rawCopy;
  }

  const cleanServer = typeof node.server === 'string'
    ? node.server.trim().replace(/^\[(.*)\]$/, '$1')
    : node.server;

  const base: any = {
    tag: node.name,
    type: node.type === 'ss' ? 'shadowsocks' : node.type,
    server: cleanServer,
    server_port: node.port,
    _sourceName: node.sourceName,
    _sourceId: node.sourceId,
  };

  if (node.type === 'ss') {
    base.method = node.method || '2022-blake3-aes-128-gcm';
    base.password = node.password || '';
    if (node.detour) base.detour = node.detour;
    if (node.udpOverTcp !== undefined) base.udp_over_tcp = node.udpOverTcp;
    if (node.multiplex) base.multiplex = node.multiplex;
    return base;
  }

  if (node.type === 'shadowtls') {
    base.version = node.shadowtlsVersion || 3;
    base.password = node.password || '';
    base.tls = {
      enabled: true,
      server_name: node.sni || node.server,
      utls: {
        enabled: true,
        fingerprint: node.fingerprint || 'chrome',
      },
    };
    return base;
  }

  if (node.type === 'vless') {
    base.uuid = node.uuid || '';
    if (node.flow) base.flow = node.flow;
    base.packet_encoding = node.packetEncoding || 'xudp';

    if (node.tls) {
      base.tls = {
        enabled: true,
        server_name: node.sni || node.server,
      };
      if (node.skipCertVerify !== undefined) {
        base.tls.insecure = Boolean(node.skipCertVerify);
      }
      if (node.fingerprint) {
        base.tls.utls = {
          enabled: true,
          fingerprint: node.fingerprint,
        };
      }

      if (node.reality && node.reality.enabled) {
        base.tls.reality = {
          enabled: true,
          public_key: node.reality.publicKey,
          short_id: node.reality.shortId ?? '',
        };
      }

      if (node.certificatePublicKeySha256 && node.certificatePublicKeySha256.length > 0) {
        base.tls.certificate_public_key_sha256 = node.certificatePublicKeySha256;
      } else if (node.certificate) {
        base.tls.certificate = Array.isArray(node.certificate) ? node.certificate : [node.certificate];
      }
    }

    if (node.network === 'ws') {
      base.transport = {
        type: 'ws',
        path: node.wsPath || '/',
        headers: node.wsHeaders || {},
      };
      if (node.maxEarlyData) {
        base.transport.max_early_data = node.maxEarlyData;
        base.transport.early_data_header_name = node.earlyDataHeaderName || 'Sec-WebSocket-Protocol';
      }
    } else if (node.network === 'grpc') {
      base.transport = {
        type: 'grpc',
        service_name: node.grpcServiceName || 'grpc',
      };
    } else if (node.network === 'http' || node.network === 'h2') {
      base.transport = {
        type: 'http',
      };
    }

    if (node.multiplex) {
      base.multiplex = node.multiplex;
    }

    return base;
  }

  if (node.type === 'vmess') {
    base.uuid = node.uuid || '';
    base.security = node.cipher || 'auto';
    if (node.alterId !== undefined) base.alter_id = node.alterId;
    if (node.tls) {
      base.tls = {
        enabled: true,
        server_name: node.sni || node.server,
      };
      if (node.skipCertVerify !== undefined) {
        base.tls.insecure = Boolean(node.skipCertVerify);
      }
      if (node.fingerprint) {
        base.tls.utls = {
          enabled: true,
          fingerprint: node.fingerprint,
        };
      }
      if (node.certificatePublicKeySha256) {
        base.tls.certificate_public_key_sha256 = node.certificatePublicKeySha256;
      }
    }
    if (node.network === 'ws') {
      base.transport = {
        type: 'ws',
        path: node.wsPath || '/',
        headers: node.wsHeaders || {},
      };
      if (node.maxEarlyData) {
        base.transport.max_early_data = node.maxEarlyData;
        base.transport.early_data_header_name = node.earlyDataHeaderName || 'Sec-WebSocket-Protocol';
      }
    }
    if (node.multiplex) {
      base.multiplex = node.multiplex;
    }
    return base;
  }

  if (node.type === 'trojan') {
    base.password = node.password || '';
    base.tls = {
      enabled: true,
      server_name: node.sni || node.server,
    };
    if (node.skipCertVerify !== undefined) {
      base.tls.insecure = Boolean(node.skipCertVerify);
    }
    if (node.fingerprint) {
      base.tls.utls = {
        enabled: true,
        fingerprint: node.fingerprint,
      };
    }
    if (node.certificatePublicKeySha256 && node.certificatePublicKeySha256.length > 0) {
      base.tls.certificate_public_key_sha256 = node.certificatePublicKeySha256;
    } else if (node.certificate) {
      base.tls.certificate = Array.isArray(node.certificate) ? node.certificate : [node.certificate];
    }
    if (node.network === 'ws') {
      base.transport = {
        type: 'ws',
        path: node.wsPath || '/',
        headers: node.wsHeaders || {},
      };
      if (node.maxEarlyData) {
        base.transport.max_early_data = node.maxEarlyData;
        base.transport.early_data_header_name = node.earlyDataHeaderName || 'Sec-WebSocket-Protocol';
      }
    }
    if (node.multiplex) {
      base.multiplex = node.multiplex;
    }
    return base;
  }

  if (node.type === 'hysteria2') {
    if (node.serverPorts && node.serverPorts.length > 0) {
      const portsList = Array.isArray(node.serverPorts)
        ? node.serverPorts
        : String(node.serverPorts).split(',');
      const formattedPorts = portsList
        .map((s: any) => String(s).trim().replace(':', '-'))
        .filter(Boolean);
      if (formattedPorts.length > 0) {
        base.server_ports = formattedPorts;
        delete base.server_port;
      }
    }
    if (node.hopInterval) {
      base.hop_interval = node.hopInterval;
    }
    if (node.hopIntervalMax) {
      base.hop_interval_max = node.hopIntervalMax;
    }
    if (node.upMbps !== undefined) {
      base.up_mbps = node.upMbps;
    }
    if (node.downMbps !== undefined) {
      base.down_mbps = node.downMbps;
    }
    base.password = node.password || '';
    base.tls = {
      enabled: true,
      server_name: node.sni || node.server,
      alpn: node.alpn || ['h3'],
    };
    if (node.skipCertVerify !== undefined) {
      base.tls.insecure = Boolean(node.skipCertVerify);
    }
    if (node.certificatePublicKeySha256 && node.certificatePublicKeySha256.length > 0) {
      base.tls.certificate_public_key_sha256 = node.certificatePublicKeySha256;
    } else if (node.certificate) {
      base.tls.certificate = Array.isArray(node.certificate) ? node.certificate : [node.certificate];
    }
    const obfsType = node.obfs || node.raw?.obfs;
    const obfsPassword = node.obfsPassword || node.raw?.['obfs-password'] || node.raw?.['obfs-opts']?.password;
    if (obfsType && obfsPassword) {
      base.obfs = {
        type: obfsType,
        password: obfsPassword,
      };
    }
    return base;
  }

  if (node.type === 'tuic') {
    base.uuid = node.uuid || '';
    base.password = node.password || '';
    base.congestion_control = node.congestionControl || 'bbr';
    base.udp_relay_mode = node.udpRelayMode || 'native';
    base.zero_rtt_handshake = Boolean(node.zeroRttHandshake);
    if (node.heartbeat) base.heartbeat = node.heartbeat;
    base.tls = {
      enabled: true,
      server_name: node.sni || node.server,
      alpn: node.alpn || ['h3'],
    };
    if (node.skipCertVerify !== undefined) {
      base.tls.insecure = Boolean(node.skipCertVerify);
    }
    if (node.certificatePublicKeySha256 && node.certificatePublicKeySha256.length > 0) {
      base.tls.certificate_public_key_sha256 = node.certificatePublicKeySha256;
    } else if (node.certificate) {
      base.tls.certificate = Array.isArray(node.certificate) ? node.certificate : [node.certificate];
    }
    return base;
  }

  if (node.type === 'wireguard') {
    let localAddrs: string[] = [];
    if (node.localAddress && node.localAddress.length > 0) {
      localAddrs = node.localAddress;
    } else {
      if (node.ip) localAddrs.push(node.ip.includes('/') ? node.ip : `${node.ip}/32`);
      if (node.ipv6) localAddrs.push(node.ipv6.includes('/') ? node.ipv6 : `${node.ipv6}/128`);
    }
    if (localAddrs.length === 0) {
      localAddrs = ['10.0.0.2/32'];
    }

    base.local_address = localAddrs;
    base.private_key = node.privateKey || '';
    base.peer_public_key = node.publicKey || '';
    if (node.presharedKey) base.pre_shared_key = node.presharedKey;
    if (node.reserved) base.reserved = node.reserved;
    if (node.mtu) base.mtu = node.mtu;
    return base;
  }

  if (node.type === 'anytls') {
    base.password = node.password || '';
    if (node.idleSessionCheckInterval) {
      base.idle_session_check_interval = node.idleSessionCheckInterval;
    }
    if (node.idleSessionTimeout) {
      base.idle_session_timeout = node.idleSessionTimeout;
    }
    if (node.minIdleSession !== undefined) {
      base.min_idle_session = node.minIdleSession;
    }
    base.tls = {
      enabled: true,
      server_name: node.sni || node.server,
      alpn: node.alpn || ['h2', 'http/1.1'],
      utls: {
        enabled: true,
        fingerprint: node.fingerprint || 'chrome',
      },
    };
    if (node.skipCertVerify !== undefined) {
      base.tls.insecure = Boolean(node.skipCertVerify);
    }
    if (node.certificatePublicKeySha256 && node.certificatePublicKeySha256.length > 0) {
      base.tls.certificate_public_key_sha256 = node.certificatePublicKeySha256;
    } else if (node.certificate) {
      base.tls.certificate = Array.isArray(node.certificate) ? node.certificate : [node.certificate];
    }
    return base;
  }

  if (node.type === 'naive') {
    base.username = node.username || node.password || '';
    base.password = node.password || '';
    if (node.quic) {
      base.udp_over_tcp = false;
      base.quic = true;
      base.quic_congestion_control = node.quicCongestionControl || 'bbr';
    } else {
      base.udp_over_tcp = node.udpOverTcp !== undefined ? node.udpOverTcp : true;
      base.quic = false;
    }
    base.tls = {
      enabled: true,
      server_name: node.sni || node.server,
    };
    if (node.skipCertVerify !== undefined) {
      base.tls.insecure = Boolean(node.skipCertVerify);
    }
    if (node.certificate) {
      base.tls.certificate = Array.isArray(node.certificate) ? node.certificate : [node.certificate];
    }
    return base;
  }

  if (node.type === 'socks5') {
    base.type = 'socks';
    base.version = '5';
    if (node.username) base.username = node.username;
    if (node.password) base.password = node.password;
    return base;
  }

  return base;
}

export function generateSingboxConfig(
  templateJson: string,
  nodes: ProxyNode[],
  proxyGroups: ProxyGroupItem[] = [],
  rulesList: UnifiedRuleItem[] = [],
  sources: any[] = []
): string {
  let doc: any;
  try {
    doc = JSON.parse(templateJson);
  } catch (e) {
    doc = {};
  }
  if (!doc || typeof doc !== 'object') {
    doc = {};
  }

  // Deduplicate candidate nodes strictly by connection signature or ID
  const allNodesMap = new Map<string, ProxyNode>();
  nodes.forEach(n => {
    const key = n.id || `${n.server}:${n.port}:${n.name}`;
    if (!allNodesMap.has(key)) {
      allNodesMap.set(key, n);
    }
  });

  // 建立 nodeId -> source 映射
  const nodeSourceMap = new Map<string, { id: string; name: string }>();
  sources.forEach(s => {
    if (Array.isArray(s.nodes)) {
      s.nodes.forEach((n: any) => {
        const key = n.id || `${n.server}:${n.port}:${n.name}`;
        nodeSourceMap.set(key, { id: s.id, name: s.name });
        nodeSourceMap.set(n.name, { id: s.id, name: s.name });
      });
    }
  });

  const allCandidateNodes = Array.from(allNodesMap.values());
  const proxyOutbounds = allCandidateNodes.map(n => {
    const ob: any = nodeToSingboxOutbound(n);
    if (ob) {
      const src = nodeSourceMap.get(n.id) || nodeSourceMap.get(n.name);
      ob._sourceName = n.sourceName || src?.name || '';
      ob._sourceId = n.sourceId || src?.id || '';
    }
    return ob;
  }).filter(Boolean);

  doc = injectUnifiedToSingbox(doc, proxyOutbounds, proxyGroups, rulesList, sources);

  return JSON.stringify(doc, null, 2);
}

export function injectUnifiedToSingbox(
  doc: any,
  proxyOutbounds: any[],
  proxyGroups: ProxyGroupItem[],
  rulesList: UnifiedRuleItem[],
  sources: any[] = []
): any {
  if (!doc.route) doc.route = {};
  if (!doc.outbounds) doc.outbounds = [];

  // 1. Build Custom Proxy Groups (Selectors / URLTest)
  const allNodeTags = proxyOutbounds.map(p => p.tag);
  const effectiveGroups = proxyGroups;
  const validGroupTags = new Set(effectiveGroups.map(g => g.name));
  const validNodeTags = new Set(allNodeTags);

  const isBuiltinSingboxOutbound = (t: string) => {
    const upper = (t || '').trim().toUpperCase();
    return (
      upper === 'DIRECT' ||
      upper === 'REJECT' ||
      upper === 'BLOCK' ||
      upper === 'GLOBAL' ||
      upper === 'DNS-OUT' ||
      (t || '').trim() === '🎯 本地直连'
    );
  };

  const groupOutbounds: any[] = [];
  effectiveGroups.forEach(grp => {
    if (grp.type === 'direct') {
      groupOutbounds.push({
        tag: grp.name,
        type: 'direct',
      });
      return;
    }
    if (grp.type === 'reject') {
      groupOutbounds.push({
        tag: grp.name,
        type: 'block',
      });
      return;
    }

    if (grp.type === 'relay') {
      const hops = (grp.proxies || []).filter(Boolean);
      if (hops.length === 0) {
        groupOutbounds.push({
          tag: grp.name,
          type: 'selector',
          outbounds: ['🎯 本地直连'],
        });
        return;
      }
      if (hops.length === 1) {
        groupOutbounds.push({
          tag: grp.name,
          type: 'selector',
          outbounds: [hops[0]],
        });
        return;
      }

      // Multi-hop relay: hop 0 (entry) -> hop 1 -> ... -> hop N-1 (exit)
      let prevHopTag = hops[0];
      for (let i = 1; i < hops.length; i++) {
        const currentHop = hops[i];
        const isFinalHop = i === hops.length - 1;
        const matchingOutbound = proxyOutbounds.find(p => p.tag === currentHop);

        if (matchingOutbound) {
          const hopTag = isFinalHop ? grp.name : `${grp.name}-hop-${i + 1}`;
          const chained = {
            ...matchingOutbound,
            tag: hopTag,
            detour: prevHopTag,
          };
          if (isFinalHop) {
            groupOutbounds.push(chained);
          } else {
            proxyOutbounds.push(chained);
          }
          prevHopTag = hopTag;
        } else {
          if (isFinalHop) {
            groupOutbounds.push({
              tag: grp.name,
              type: 'selector',
              outbounds: [currentHop],
              detour: prevHopTag,
            });
          }
          prevHopTag = currentHop;
        }
      }
      return;
    }

    const targetSources = (grp.sources && grp.sources.length > 0)
      ? grp.sources
      : (grp.use && grp.use.length > 0 ? grp.use : []);

    let matchedNodes: any[] = [];
    if (targetSources.length > 0) {
      const targetNormalized = new Set(targetSources.map(s => cleanSourceOrGroupName(s).toLowerCase()));
      matchedNodes = proxyOutbounds.filter(p => {
        const sName = cleanSourceOrGroupName(p._sourceName || '').toLowerCase();
        const sId = (p._sourceId || '').trim().toLowerCase();
        return targetNormalized.has(sName) || targetNormalized.has(sId);
      });
    } else {
      matchedNodes = [...proxyOutbounds];
    }

    if (grp.filter && grp.filter.trim()) {
      try {
        const cleanFilter = grp.filter.trim().replace(/^\(\?i\)/i, '').replace(/\(\?i\)/gi, '');
        const reg = new RegExp(cleanFilter, 'i');
        matchedNodes = matchedNodes.filter(p => reg.test(p.tag));
      } catch (e) {
        console.warn(`[Singbox] Invalid filter regex in group ${grp.name}:`, grp.filter);
      }
    }

    let outboundsList: string[] = [];
    if (targetSources.length === 0 && !grp.filter && grp.proxies && grp.proxies.length > 0) {
      outboundsList = [...grp.proxies];
    } else {
      outboundsList = matchedNodes.map(p => p.tag);
      if (grp.proxies && grp.proxies.length > 0) {
        outboundsList = [...grp.proxies, ...outboundsList];
      }
    }

    // Filter out invalid/dangling tags (e.g. unselected source groups like ⚡️ MESL, ⚡️ XMRth, deleted nodes, or self-reference)
    outboundsList = outboundsList.filter(target => {
      if (!target || target.trim() === grp.name) return false;
      const t = target.trim();
      return validGroupTags.has(t) || validNodeTags.has(t) || isBuiltinSingboxOutbound(t);
    });

    // Deduplicate while preserving order
    outboundsList = Array.from(new Set(outboundsList));

    // ALWAYS ensure outboundsList is not empty to prevent "missing tags" error in Sing-box
    if (outboundsList.length === 0) {
      outboundsList = ['🎯 本地直连'];
    }

    if (grp.type === 'urltest' || grp.type === 'fallback') {
      const urltestOutbound: any = {
        tag: grp.name,
        type: 'urltest',
        outbounds: outboundsList,
        url: grp.url || 'https://www.google.com/generate_204',
      };
      if (grp.interval) urltestOutbound.interval = typeof grp.interval === 'number' ? `${grp.interval}s` : grp.interval;
      if (typeof grp.tolerance === 'number') urltestOutbound.tolerance = grp.tolerance;
      groupOutbounds.push(urltestOutbound);
    } else {
      groupOutbounds.push({
        tag: grp.name,
        type: 'selector',
        outbounds: outboundsList,
      });
    }
  });

  // Clean temporary _sourceName and _sourceId properties from proxy outbounds
  proxyOutbounds.forEach(p => {
    delete p._sourceName;
    delete p._sourceId;
  });

  // Preserve custom outbounds defined in template (avoid duplicating generated group or proxy tags)
  const templateOutbounds = Array.isArray(doc.outbounds) ? doc.outbounds : [];
  const customTemplateOutbounds = templateOutbounds.filter((o: any) => {
    const tag = (o?.tag || '').trim();
    return tag && !validGroupTags.has(tag) && !validNodeTags.has(tag) && tag !== '🎯 本地直连' && tag !== 'REJECT';
  });

  // Ensure 🎯 本地直连 always exists
  const hasDirect = groupOutbounds.some((g: any) => g.tag === '🎯 本地直连' || g.type === 'direct') ||
    customTemplateOutbounds.some((g: any) => g.tag === '🎯 本地直连' || g.type === 'direct');
  if (!hasDirect) {
    groupOutbounds.push({
      tag: '🎯 本地直连',
      type: 'direct',
    });
  }

  // Ensure REJECT always exists
  const hasReject = groupOutbounds.some((g: any) => g.tag === 'REJECT' || g.type === 'block') ||
    customTemplateOutbounds.some((g: any) => g.tag === 'REJECT' || g.type === 'block');
  if (!hasReject) {
    groupOutbounds.push({
      tag: 'REJECT',
      type: 'block',
    });
  }

  // Ensure GLOBAL selector exists for Clash API Global mode
  const hasGlobal = groupOutbounds.some((g: any) => g.tag === 'GLOBAL') ||
    customTemplateOutbounds.some((g: any) => g.tag === 'GLOBAL');
  if (!hasGlobal) {
    const mainSelectorTag = effectiveGroups.find(g => g.name === '🚀 节点选择')?.name ||
      effectiveGroups[0]?.name ||
      '🎯 本地直连';
    const globalOutbounds = Array.from(new Set([mainSelectorTag, ...allNodeTags]));
    groupOutbounds.unshift({
      tag: 'GLOBAL',
      type: 'selector',
      outbounds: globalOutbounds.length > 0 ? globalOutbounds : ['🎯 本地直连'],
    });
  }

  // Break circular dependencies between group outbounds (prevents Sing-box fatal crashes)
  const groupOutboundMap = new Map<string, any>();
  groupOutbounds.forEach(g => {
    if (Array.isArray(g.outbounds)) {
      groupOutboundMap.set(g.tag, g);
    }
  });

  const visitedNodes = new Set<string>();
  const activeStack = new Set<string>();

  const sanitizeDependencies = (u: string) => {
    visitedNodes.add(u);
    activeStack.add(u);

    const grp = groupOutboundMap.get(u);
    if (grp && Array.isArray(grp.outbounds)) {
      const safeOutbounds: string[] = [];
      for (const v of grp.outbounds) {
        if (groupOutboundMap.has(v)) {
          if (activeStack.has(v)) {
            // Circular dependency detected! Drop the back-edge to break the cycle.
            console.warn(`[Singbox] Dropped circular outbound dependency: ${u} -> ${v}`);
            continue;
          }
          if (!visitedNodes.has(v)) {
            sanitizeDependencies(v);
          }
        }
        safeOutbounds.push(v);
      }
      grp.outbounds = safeOutbounds.length > 0 ? safeOutbounds : ['🎯 本地直连'];
    }

    activeStack.delete(u);
  };

  for (const tag of groupOutboundMap.keys()) {
    if (!visitedNodes.has(tag)) {
      sanitizeDependencies(tag);
    }
  }

  doc.outbounds = [...groupOutbounds, ...customTemplateOutbounds, ...proxyOutbounds];

  // 2. Build Remote Rule Sets
  const activeRules = rulesList.filter(r => r.enabled);
  const remoteRules = activeRules.filter(r => r.kind === 'remote');
  const localRules = activeRules.filter(r => r.kind === 'local');

  const ruleSets: any[] = [];
  remoteRules.forEach((r, idx) => {
    const adapted = adaptRulesetForSingbox(r, idx);
    const rsObj: any = {
      type: 'remote',
      tag: adapted.tag,
      format: adapted.format,
      url: adapted.url,
    };
    if (doc.route.default_http_client) {
      rsObj.http_client = doc.route.default_http_client;
    }
    ruleSets.push(rsObj);
  });

  // Preserve any custom rule_sets from template that don't conflict
  if (Array.isArray(doc.route.rule_set)) {
    const generatedTags = new Set(ruleSets.map(rs => rs.tag));
    doc.route.rule_set.forEach((rs: any) => {
      if (rs && rs.tag && !generatedTags.has(rs.tag)) {
        ruleSets.push(rs);
        generatedTags.add(rs.tag);
      }
    });
  }
  doc.route.rule_set = ruleSets;

  if (!doc.http_clients || !Array.isArray(doc.http_clients) || doc.http_clients.length === 0) {
    doc.http_clients = [
      {
        tag: 'default',
      },
    ];
  }

  if (!doc.route.default_http_client) {
    doc.route.default_http_client = doc.http_clients[0]?.tag || 'default';
  }

  if (!doc.route.default_domain_resolver) {
    const localDnsTag = doc.dns?.servers?.find((s: any) => s.tag === 'alidns' || s.tag === 'local' || s.type === 'udp')?.tag || 'local';
    doc.route.default_domain_resolver = {
      server: localDnsTag,
    };
  }

  // Sanitize and dynamically build doc.dns.rules to ensure full IPv6 support for direct domains & custom user DNS rules
  if (doc.dns) {
    if (!doc.dns.strategy) doc.dns.strategy = 'prefer_ipv4';

    const validRuleSetTags = new Set(ruleSets.map(rs => rs.tag));

    // 1. Gather all direct domain suffixes from local rules (e.g. DDNS, private IPv6, university, NAS, PT trackers)
    const directDomainSuffixes: string[] = [];
    localRules.forEach(r => {
      if (r.outbound === '🎯 本地直连' || r.outbound === 'direct') {
        if (r.type === 'DOMAIN-SUFFIX' || r.type === 'DOMAIN') {
          const items = r.payload.split(/[,;\n]+/).map(s => s.trim()).filter(Boolean);
          directDomainSuffixes.push(...items);
        }
      }
    });

    // 2. Gather domestic geosite rule_sets (must be domain-based geosite, NOT ip-based geoip)
    const domesticRuleSets = remoteRules
      .map((r, idx) => adaptRulesetForSingbox(r, idx))
      .filter(ad => {
        const isDomestic = ad.tag.includes('cn') || ad.tag.includes('direct') || ad.url.includes('cn');
        return isDomestic && ad.behavior === 'domain';
      })
      .map(ad => ad.tag)
      .filter(tag => validRuleSetTags.has(tag));

    // 3. Gather overseas proxy geosite rule_sets (must be domain-based geosite, NOT ip-based geoip)
    const proxyRuleSets = remoteRules
      .map((r, idx) => adaptRulesetForSingbox(r, idx))
      .filter(ad => {
        const isDomestic = ad.tag.includes('cn') || ad.tag.includes('direct') || ad.url.includes('cn');
        return !isDomestic && ad.behavior === 'domain';
      })
      .map(ad => ad.tag)
      .filter(tag => validRuleSetTags.has(tag));

    // If template already defines dns.rules, respect user template and avoid overriding
    if (doc.dns && Array.isArray(doc.dns.rules) && doc.dns.rules.length > 0) {
      // Keep template rules intact
    } else {
      const dnsRules: any[] = [];


      // Step A: Direct local domains -> alidns (resolves both IPv4 and full IPv6 without being rejected)
      const uniqueDirectSuffixes = Array.from(new Set([
        'local',
        'arpa',
        'in-addr.arpa',
        'ip6.arpa',
        ...directDomainSuffixes,
      ]));
      dnsRules.push({
        domain_suffix: uniqueDirectSuffixes,
        server: 'alidns',
      });

      // Step B: Domestic GeoSite rule-sets -> alidns (allows full dual-stack IPv4/IPv6 for domestic services)
      if (domesticRuleSets.length > 0) {
        dnsRules.push({
          rule_set: domesticRuleSets,
          server: 'alidns',
        });
      }

      // Step C: Reject AAAA for overseas / proxy traffic (prevents proxy IPv6 leaks & broken overseas IPv6 routes)
      dnsRules.push({
        query_type: 'AAAA',
        action: 'reject',
      });

      // Step D: Proxy GeoSite rule-sets -> fakeip
      if (proxyRuleSets.length > 0) {
        dnsRules.push({
          rule_set: proxyRuleSets,
          server: 'fakeip',
        });
      }

      // Step E: Clash API controls
      dnsRules.push({ clash_mode: 'Direct', server: 'alidns' });
      dnsRules.push({ clash_mode: 'Global', server: 'remote' });

      doc.dns.rules = dnsRules;
    }
  }

  // 3. Build Route Rules
  // Preserve template-defined infrastructure/base rules (sniff, hijack-dns, quic reject, stun reject, etc.)
  const templateRules = Array.isArray(doc.route.rules) ? [...doc.route.rules] : [];
  const baseRules = templateRules.length > 0 ? templateRules : [
    { action: 'sniff' },
    { ip_is_private: true, outbound: '🎯 本地直连' },
  ];

  // Ensure route.rules has clash_mode control rules
  const hasClashMode = baseRules.some((r: any) => r.clash_mode);
  if (!hasClashMode) {
    baseRules.push(
      { clash_mode: 'Direct', outbound: '🎯 本地直连' },
      { clash_mode: 'Global', outbound: 'GLOBAL' }
    );
  }

  const availableGroupNames = new Set(effectiveGroups.map(g => g.name));
  const fallbackGroup = effectiveGroups.find(g => g.name === '🚀 节点选择')?.name || effectiveGroups[0]?.name || '🎯 本地直连';

  const generatedRouteRules: any[] = [];
  localRules.forEach(r => {
    const payloads = r.payload.split(/[,;\n]+/).map(s => s.trim()).filter(Boolean);
    const safeOutbound = resolveSafeOutbound(r.outbound, availableGroupNames, fallbackGroup);
    const isReject = safeOutbound.toUpperCase() === 'REJECT';
    if (r.type === 'DOMAIN-SUFFIX') {
      generatedRouteRules.push(isReject ? { domain_suffix: payloads, action: 'reject' } : { domain_suffix: payloads, outbound: safeOutbound });
    } else if (r.type === 'DOMAIN-KEYWORD') {
      generatedRouteRules.push(isReject ? { domain_keyword: payloads, action: 'reject' } : { domain_keyword: payloads, outbound: safeOutbound });
    } else if (r.type === 'DOMAIN') {
      generatedRouteRules.push(isReject ? { domain: payloads, action: 'reject' } : { domain: payloads, outbound: safeOutbound });
    } else if (r.type === 'IP-CIDR') {
      generatedRouteRules.push(isReject ? { ip_cidr: payloads, action: 'reject' } : { ip_cidr: payloads, outbound: safeOutbound });
    } else if (r.type === 'SRC-IP-CIDR') {
      const formattedPayloads = payloads.map(formatCidr).filter(Boolean);
      generatedRouteRules.push(isReject ? { source_ip_cidr: formattedPayloads, action: 'reject' } : { source_ip_cidr: formattedPayloads, outbound: safeOutbound });
    } else if (r.type === 'GEOIP') {
      generatedRouteRules.push(isReject ? { geoip: payloads, action: 'reject' } : { geoip: payloads, outbound: safeOutbound });
    }
  });

  remoteRules.forEach((r, idx) => {
    const tag = formatRuleTag(r, idx);
    const safeOutbound = resolveSafeOutbound(r.outbound, availableGroupNames, fallbackGroup);
    const isReject = safeOutbound.toUpperCase() === 'REJECT';
    if (isReject) {
      generatedRouteRules.push({
        rule_set: tag,
        action: 'reject',
      });
    } else {
      generatedRouteRules.push({
        rule_set: tag,
        outbound: safeOutbound,
      });
    }
  });

  const postRules = Array.isArray(doc.route.post_rules)
    ? [...doc.route.post_rules]
    : Array.isArray(doc.route.postRules)
    ? [...doc.route.postRules]
    : [];
  delete doc.route.post_rules;
  delete doc.route.postRules;

  doc.route.rules = [...baseRules, ...generatedRouteRules, ...postRules];

  if (!doc.route.final) {
    doc.route.final = fallbackGroup || '🐟 漏网之鱼';
  }

  return doc;
}
