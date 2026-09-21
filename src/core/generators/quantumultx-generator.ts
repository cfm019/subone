import { ProxyNode, ProxyGroupItem, UnifiedRuleItem, SubscriptionSource } from '../../types/index.js';
import { adaptRulesetForQuantumultX, formatRuleTag } from './ruleset-adapter.js';
import { resolveSafeOutbound, formatCidr, cleanSourceOrGroupName, formatSourceGroupTag } from './common.js';

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

export function isSupportedByQuantumultX(node: ProxyNode): boolean {
  if (node.network === 'grpc') return false;
  if (node.type === 'anytls') return true;
  if (node.type === 'vless') return true;
  if (node.type === 'trojan') return true;
  if (node.type === 'ss') return true;
  if (node.type === 'vmess') return true;
  if (node.type === 'socks5') return true;
  if (node.type === 'http') return true;
  return false;
}

export function injectUnifiedToQuantumultX(
  templateConf: string,
  nodes: ProxyNode[],
  proxyGroups: ProxyGroupItem[],
  rulesList: UnifiedRuleItem[],
  sources: SubscriptionSource[] = [],
  options?: { expandNodes?: boolean; baseUrl?: string; subToken?: string }
): string {
  const expandNodes = Boolean(options?.expandNodes);
  const lines = templateConf.split('\n');
  const activeRules = rulesList.filter(r => r.enabled);
  const remoteRules = activeRules.filter(r => r.kind === 'remote');
  const localRules = activeRules.filter(r => r.kind === 'local');

  const effectiveGroups: ProxyGroupItem[] = proxyGroups.map(g => ({
    ...g,
    proxies: g.proxies ? [...g.proxies] : undefined,
    use: g.use ? [...g.use] : undefined,
  }));

  const networkSources = sources.filter(s => s.enabled && s.type !== 'custom' && s.type !== 'filter' && s.url && s.url.startsWith('http'));
  const internalSources = sources.filter(s => s.enabled && !networkSources.some(ns => ns.id === s.id));
  const hasSuboneRemoteSubscription = Boolean(options?.baseUrl && options?.subToken && !expandNodes);

  const customNodes = nodes.filter(n => n.sourceId === 'custom' || n.sourceId?.startsWith('custom') || !n.sourceId);
  const qxSupportedNodes = nodes.filter(isSupportedByQuantumultX);
  const qxSupportedCustomNodes = customNodes.filter(isSupportedByQuantumultX);
  const customNodeNames = qxSupportedCustomNodes.map(n => n.name.replace(/[=,]/g, '_'));
  const allNodeNames = qxSupportedNodes.map(n => n.name.replace(/[=,]/g, '_'));

  const customSources = sources.filter(s => s.type === 'custom' || s.id === 'custom');
  const customTagName = customSources[0]?.name
    ? formatSourceGroupTag(customSources[0])
    : '🖥️ 独立节点组';

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

  // 1. Build [server_remote]
  const serverRemoteLines: string[] = [];
  const allActiveRemoteSources: SubscriptionSource[] = [];

  if (!expandNodes) {
    networkSources.forEach(s => {
      const tag = s.name.replace(/[=,]/g, '_').trim();
      serverRemoteLines.push(`${s.url}, tag=${tag}, update-interval=24, opt-parser=true`);
      allActiveRemoteSources.push(s);
    });

    if (hasSuboneRemoteSubscription && options?.baseUrl && options?.subToken) {
      const cleanBaseUrl = options.baseUrl.replace(/\/+$/, '');
      const token = encodeURIComponent(options.subToken);
      internalSources.forEach(s => {
        const tag = s.name.replace(/[=,]/g, '_').trim();
        serverRemoteLines.push(`${cleanBaseUrl}/s/${token}/source/${encodeURIComponent(s.id)}?target=quantumultx, tag=${tag}, update-interval=24, opt-parser=true`);
        allActiveRemoteSources.push(s);
      });
    }
  }

  const allRemoteTags = new Set(allActiveRemoteSources.map(s => s.name.replace(/[=,]/g, '_').trim()));

  const activeSources = expandNodes ? sources.filter(s => s.enabled) : allActiveRemoteSources;
  activeSources.forEach(s => {
    const sTag = s.name.replace(/[=,]/g, '_').trim();
    const groupTag = sTag.startsWith('⚡️') ? sTag : `⚡️ ${sTag}`;
    const cleanTag = sTag.replace(/^[⚡️\s]+/, '').trim().toLowerCase();

    const exists = effectiveGroups.some(g => {
      const gClean = g.name.replace(/^[⚡️\s]+/, '').trim().toLowerCase();
      return g.name === groupTag || g.name === sTag || gClean === cleanTag;
    });

    if (!exists) {
      effectiveGroups.push({
        id: `grp-src-${s.id}`,
        name: groupTag,
        type: s.type === 'custom' ? 'select' : 'urltest',
        use: [s.name],
        tolerance: 50,
        interval: 300,
        url: 'https://www.google.com/generate_204',
      });
    }
  });

  // 2. Build [policy]
  const validGroupNames = new Set(effectiveGroups.map(g => g.name));
  const validNodeNames = new Set(allNodeNames);
  sources.forEach(s => {
    if (Array.isArray(s.nodes)) {
      s.nodes.forEach(n => validNodeNames.add(n.name.replace(/[=,]/g, '_')));
    }
  });

  const groupLines: string[] = [];
  effectiveGroups.forEach(grp => {
    if (grp.type === 'direct') {
      groupLines.push(`static=${grp.name}, direct`);
      return;
    }
    if (grp.type === 'reject') {
      groupLines.push(`static=${grp.name}, reject`);
      return;
    }

    if (grp.filter) {
      const cleanFilter = grp.filter.trim().replace(/^\(\?i\)/i, '').replace(/\(\?i\)/gi, '');
      if (expandNodes) {
        let matched: string[] = [];
        try {
          const reg = new RegExp(cleanFilter, 'i');
          matched = qxSupportedNodes.filter(n => reg.test(n.name)).map(n => n.name.replace(/[=,]/g, '_'));
        } catch {
          matched = [];
        }
        const members = matched.length > 0 ? matched : ['direct'];
        groupLines.push(`url-latency-benchmark=${grp.name}, ${members.join(', ')}, check-interval=300, tolerance=${grp.tolerance || 50}`);
      } else {
        groupLines.push(`url-latency-benchmark=${grp.name}, server-tag-regex=${cleanFilter}, check-interval=300, tolerance=${grp.tolerance || 50}`);
      }
      return;
    }

    if (grp.name === '♻️ 自动选择') {
      if (expandNodes) {
        const members = allNodeNames.length > 0 ? allNodeNames : ['direct'];
        groupLines.push(`url-latency-benchmark=${grp.name}, ${members.join(', ')}, check-interval=300, tolerance=${grp.tolerance || 50}`);
      } else {
        groupLines.push(`url-latency-benchmark=${grp.name}, server-tag-regex=.*, check-interval=300, tolerance=${grp.tolerance || 50}`);
      }
      return;
    }

    if (grp.name === '👉 手动选择') {
      const members = expandNodes
        ? (allNodeNames.length > 0 ? allNodeNames : ['direct'])
        : (hasSuboneRemoteSubscription ? Array.from(allRemoteTags) : ['direct', ...customNodeNames]);
      groupLines.push(`static=${grp.name}, ${members.join(', ')}`);
      return;
    }

    // Match dedicated remote source group
    const cleanName = cleanSourceOrGroupName(grp.name).toLowerCase();
    const matchedRemote = allActiveRemoteSources.find(s => {
      const sClean = cleanSourceOrGroupName(s.name).toLowerCase();
      return sClean === cleanName || s.id.toLowerCase() === cleanName;
    });

    if (matchedRemote && !expandNodes) {
      const sTag = matchedRemote.name.replace(/[=,]/g, '_').trim();
      const groupType = grp.type === 'urltest' ? 'url-latency-benchmark' : 'static';
      if (groupType === 'url-latency-benchmark') {
        groupLines.push(`url-latency-benchmark=${grp.name}, server-tag-regex=.*, check-interval=300, tolerance=${grp.tolerance || 50}`);
      } else {
        groupLines.push(`static=${grp.name}, ${sTag}, direct`);
      }
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
        const members = customNodeNames.length > 0 ? customNodeNames : ['direct'];
        groupLines.push(`static=${grp.name}, ${members.join(', ')}`);
        return;
      }
    }

    // Standard selector group
    let proxies = grp.proxies ? [...grp.proxies] : [];

    if (!hasSuboneRemoteSubscription && grp.name === '🚀 节点选择' && customNodes.length > 0 && !proxies.includes(customTagName)) {
      proxies.unshift(customTagName);
    }

    if (grp.use && grp.use.length > 0) {
      grp.use.forEach(u => {
        const cleanU = cleanSourceOrGroupName(u).toLowerCase();
        const isCustomU = cleanU === '自建节点' || cleanU === '独立节点组' || cleanU === 'custom' || cleanU === '手工自建' || customSources.some(cs => cleanSourceOrGroupName(cs.name).toLowerCase() === cleanU);
        const matchedSource = sources.find(s => {
          const sClean = cleanSourceOrGroupName(s.name).toLowerCase();
          return sClean === cleanU || s.id.trim().toLowerCase() === cleanU;
        });

        if (!expandNodes && matchedSource && allRemoteTags.has(matchedSource.name.replace(/[=,]/g, '_').trim())) {
          const sTag = matchedSource.name.replace(/[=,]/g, '_').trim();
          if (!proxies.includes(sTag)) {
            proxies.push(sTag);
          }
        } else if (isCustomU) {
          if (!hasSuboneRemoteSubscription) {
            if (validGroupNames.has(customTagName) && !proxies.includes(customTagName)) {
              proxies.unshift(customTagName);
            }
            customNodeNames.forEach(m => {
              if (!proxies.includes(m)) proxies.push(m);
            });
          }
        } else if (matchedSource) {
          let srcNodeList: string[] = [];
          if (Array.isArray(matchedSource.nodes) && matchedSource.nodes.length > 0) {
            srcNodeList = matchedSource.nodes.map(n => n.name.replace(/[=,]/g, '_'));
          } else {
            srcNodeList = nodes.filter(n => {
              const sName = (n.sourceName || '').trim().toLowerCase().replace(/^[⚡️\s]+/, '');
              const sId = (n.sourceId || '').trim().toLowerCase();
              return sName === cleanU || sId === cleanU;
            }).map(n => n.name.replace(/[=,]/g, '_'));
          }
          srcNodeList.forEach(m => {
            if (!proxies.includes(m)) proxies.push(m);
          });
          const grpTag = u.startsWith('⚡️') ? u : `⚡️ ${u}`;
          if (validGroupNames.has(grpTag) && !proxies.includes(grpTag)) {
            proxies.push(grpTag);
          } else if (validGroupNames.has(u) && !proxies.includes(u)) {
            proxies.push(u);
          }
        }
      });
    }

    proxies = proxies.map(p => {
      const u = p.trim().toUpperCase();
      if (u === 'DIRECT' || p.trim() === '🎯 本地直连') return 'direct';
      if (u === 'REJECT') return 'reject';
      return p.trim();
    }).filter(p => {
      if (!p || p === grp.name) return false;
      return validGroupNames.has(p) || validNodeNames.has(p) || allRemoteTags.has(p) || p === 'direct' || p === 'reject';
    });

    if (proxies.length === 0) proxies = ['direct'];

    const groupType = grp.type === 'fallback' ? 'available' : (grp.type === 'load-balance' ? 'round-robin' : (grp.type === 'urltest' ? 'url-latency-benchmark' : 'static'));
    groupLines.push(`${groupType}=${grp.name}, ${proxies.join(', ')}`);
  });

  // 3. Build [filter_remote]
  const remoteRuleLines: string[] = [];
  remoteRules.forEach((r, idx) => {
    const adapted = adaptRulesetForQuantumultX(r, idx);
    const targetGroup = resolveSafeOutbound(r.outbound, new Set(effectiveGroups.map(g => g.name)), '🚀 节点选择');
    remoteRuleLines.push(`${adapted.url}, tag=${adapted.tag}, force-remote-group=${targetGroup}, update-interval=86400, opt-parser=false, enabled=true`);
  });

  // 4. Build [filter_local]
  const localRuleLines: string[] = [];
  localRules.forEach(r => {
    const targetGroup = resolveSafeOutbound(r.outbound, new Set(effectiveGroups.map(g => g.name)), '🚀 节点选择');
    const out = targetGroup === '🎯 本地直连' || targetGroup.toUpperCase() === 'DIRECT' ? 'direct' : (targetGroup.toUpperCase() === 'REJECT' ? 'reject' : targetGroup);

    if (r.type === 'FINAL') {
      localRuleLines.push(`final, ${out}`);
      return;
    }
    let qxRuleType = 'host-suffix';
    if (r.type === 'DOMAIN') qxRuleType = 'host';
    else if (r.type === 'DOMAIN-SUFFIX') qxRuleType = 'host-suffix';
    else if (r.type === 'DOMAIN-KEYWORD') qxRuleType = 'host-keyword';
    else if (r.type === 'IP-CIDR') qxRuleType = 'ip-cidr';
    else if (r.type === 'SRC-IP-CIDR') qxRuleType = 'ip-cidr';
    else if (r.type === 'GEOIP') qxRuleType = 'geoip';

    localRuleLines.push(`${qxRuleType}, ${r.payload.trim()}, ${out}`);
  });

  // 5. Assemble config
  const result: string[] = [];
  let hasHandledServerRemote = false;
  let hasHandledPolicy = false;
  let hasHandledFilterRemote = false;
  let hasHandledFilterLocal = false;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim().toLowerCase();

    if (trimmed === '[server_remote]') {
      hasHandledServerRemote = true;
      result.push(line);
      result.push(...serverRemoteLines);
      continue;
    }

    if (trimmed === '[policy]') {
      hasHandledPolicy = true;
      result.push(line);
      result.push(...groupLines);
      continue;
    }

    if (trimmed === '[filter_remote]') {
      hasHandledFilterRemote = true;
      result.push(line);
      result.push(...remoteRuleLines);
      continue;
    }

    if (trimmed === '[filter_local]') {
      hasHandledFilterLocal = true;
      result.push(line);
      result.push(...localRuleLines);
      continue;
    }

    result.push(line);
  }

  if (!hasHandledServerRemote && serverRemoteLines.length > 0) {
    result.push('\n[server_remote]');
    result.push(...serverRemoteLines);
  }
  if (!hasHandledPolicy && groupLines.length > 0) {
    result.push('\n[policy]');
    result.push(...groupLines);
  }
  if (!hasHandledFilterRemote && remoteRuleLines.length > 0) {
    result.push('\n[filter_remote]');
    result.push(...remoteRuleLines);
  }
  if (!hasHandledFilterLocal && localRuleLines.length > 0) {
    result.push('\n[filter_local]');
    result.push(...localRuleLines);
  }

  return result.join('\n');
}
