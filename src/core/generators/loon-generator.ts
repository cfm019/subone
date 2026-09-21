import { ProxyNode, ProxyGroupItem, UnifiedRuleItem, SubscriptionSource } from '../../types/index.js';
import { adaptRulesetForLoon, formatRuleTag } from './ruleset-adapter.js';
import { resolveSafeOutbound, formatCidr, cleanSourceOrGroupName, formatSourceGroupTag } from './common.js';

function formatServer(server: string): string {
  const trimmed = (server || '').trim();
  if (trimmed.includes(':') && !trimmed.startsWith('[')) {
    return `[${trimmed}]`;
  }
  return trimmed;
}

export function nodeToLoonProxy(node: ProxyNode): string {
  const name = node.name.replace(/[=,]/g, '_');
  const server = formatServer(node.server);

  if (node.type === 'ss') {
    const cipher = node.method || 'aes-128-gcm';
    const pwd = `"${node.password || ''}"`;
    let line = `${name} = Shadowsocks,${server},${node.port},${cipher},${pwd}`;
    if (node.plugin === 'obfs') {
      line += `,obfs=${node.pluginOpts?.mode || 'http'},obfs-host=${node.pluginOpts?.host || ''}`;
    } else if (node.plugin === 'v2ray-plugin') {
      line += `,plugin=v2ray-plugin,plugin-opts="mode=${node.pluginOpts?.mode || 'websocket'};host=${node.pluginOpts?.host || ''};path=${node.pluginOpts?.path || '/'}"`;
    }
    line += `,fast-open=false,udp=true,block-quic=false`;
    return line;
  }

  if (node.type === 'anytls') {
    let line = `${name} = AnyTLS,${server},${node.port},"${node.password || ''}"`;
    if (node.sni) line += `,sni=${node.sni}`;
    if (node.skipCertVerify) line += `,skip-cert-verify=true`;
    if (node.fingerprint) line += `,client-fingerprint=${node.fingerprint}`;
    line += `,udp=true,block-quic=false`;
    return line;
  }

  if (node.type === 'hysteria2') {
    let line = `${name} = Hysteria2,${server},${node.port},"${node.password || ''}"`;
    if (node.sni) line += `,sni=${node.sni}`;
    if (node.skipCertVerify) line += `,skip-cert-verify=true`;
    const obfsPwd = node.obfsPassword || (node.obfs && node.obfs !== 'salamander' ? node.obfs : undefined);
    if (obfsPwd) line += `,salamander-password="${obfsPwd}"`;
    if (node.downMbps) line += `,download-bandwidth=${node.downMbps}`;
    if (node.upMbps) line += `,upload-bandwidth=${node.upMbps}`;
    line += `,udp=true,block-quic=false`;
    return line;
  }

  if (node.type === 'vless') {
    let line = `${name} = vless,${server},${node.port},"${node.uuid || ''}"`;
    const net = (node.network || 'tcp').toLowerCase();

    if (net === 'ws') {
      line += `,transport=ws`;
      if (node.wsPath) line += `,path=${node.wsPath}`;
      const host = node.wsHeaders?.Host || node.wsHeaders?.host || node.sni;
      if (host) line += `,host=${host}`;
      if (node.earlyDataHeaderName) line += `,ws-early-data-header-name=${node.earlyDataHeaderName}`;
    } else if (net === 'grpc') {
      line += `,transport=grpc`;
      if (node.grpcServiceName) line += `,grpc-service-name=${node.grpcServiceName}`;
    } else if (net === 'http' || net === 'h2') {
      line += `,transport=http`;
      if (node.h2Path) line += `,path=${node.h2Path}`;
      const host = node.h2Host || node.sni;
      if (host) line += `,host=${host}`;
    } else {
      line += `,transport=tcp`;
    }

    if (node.tls || (node.reality && node.reality.enabled)) {
      line += `,over-tls=true`;
    }
    if (node.sni) line += `,tls-name=${node.sni}`;
    if (node.skipCertVerify) line += `,skip-cert-verify=true`;
    if (node.fingerprint) line += `,client-fingerprint=${node.fingerprint}`;

    if (node.reality && node.reality.enabled) {
      line += `,public-key="${node.reality.publicKey}"`;
      if (node.reality.shortId) line += `,short-id=${node.reality.shortId}`;
    }

    if (node.flow?.includes('vision')) {
      line += `,flow=xtls-rprx-vision`;
    } else if (node.flow) {
      line += `,flow=${node.flow}`;
    }

    line += `,udp=true,block-quic=false`;
    return line;
  }

  if (node.type === 'trojan') {
    let line = `${name} = trojan,${server},${node.port},"${node.password || ''}"`;
    const net = (node.network || 'tcp').toLowerCase();

    if (net === 'ws') {
      line += `,transport=ws`;
      if (node.wsPath) line += `,path=${node.wsPath}`;
      const host = node.wsHeaders?.Host || node.wsHeaders?.host || node.sni;
      if (host) line += `,host=${host}`;
      if (node.earlyDataHeaderName) line += `,ws-early-data-header-name=${node.earlyDataHeaderName}`;
    } else if (net === 'grpc') {
      line += `,transport=grpc`;
      if (node.grpcServiceName) line += `,grpc-service-name=${node.grpcServiceName}`;
    }

    if (node.tls !== false) line += `,over-tls=true`;
    if (node.sni) line += `,tls-name=${node.sni}`;
    if (node.skipCertVerify) line += `,skip-cert-verify=true`;
    if (node.fingerprint) line += `,client-fingerprint=${node.fingerprint}`;
    line += `,udp=true,block-quic=false`;
    return line;
  }

  if (node.type === 'vmess') {
    const cipher = node.cipher || 'auto';
    let line = `${name} = vmess,${server},${node.port},${cipher},"${node.uuid || ''}"`;
    const net = (node.network || 'tcp').toLowerCase();

    if (net === 'ws') {
      line += `,transport=ws`;
      if (node.wsPath) line += `,path=${node.wsPath}`;
      const host = node.wsHeaders?.Host || node.wsHeaders?.host || node.sni;
      if (host) line += `,host=${host}`;
      if (node.earlyDataHeaderName) line += `,ws-early-data-header-name=${node.earlyDataHeaderName}`;
    } else if (net === 'grpc') {
      line += `,transport=grpc`;
      if (node.grpcServiceName) line += `,grpc-service-name=${node.grpcServiceName}`;
    }

    if (node.tls) line += `,over-tls=true`;
    if (node.sni) line += `,tls-name=${node.sni}`;
    if (node.skipCertVerify) line += `,skip-cert-verify=true`;
    if (node.fingerprint) line += `,client-fingerprint=${node.fingerprint}`;
    line += `,udp=true,block-quic=false`;
    return line;
  }

  if (node.type === 'tuic') {
    let line = `${name} = TUIC,${server},${node.port},"${node.uuid || ''}","${node.password || ''}"`;
    if (node.sni) line += `,sni=${node.sni}`;
    if (node.skipCertVerify) line += `,skip-cert-verify=true`;
    if (node.congestionControl) line += `,congestion-controller=${node.congestionControl}`;
    line += `,udp=true,block-quic=false`;
    return line;
  }

  if (node.type === 'wireguard') {
    const selfIp = node.ip || (node.localAddress && node.localAddress[0] ? node.localAddress[0].split('/')[0] : '10.0.0.2');
    let line = `${name} = WireGuard,${server},${node.port},private-key="${node.privateKey || ''}",peer-public-key="${node.publicKey || ''}",self-ip="${selfIp}"`;
    if (node.presharedKey) line += `,preshared-key="${node.presharedKey}"`;
    if (node.mtu) line += `,mtu=${node.mtu}`;
    return line;
  }

  if (node.type === 'snell') {
    const psk = node.psk || node.password || '';
    const ver = node.snellVersion || 4;
    let line = `${name} = snell,${server},${node.port},"${psk}",version=${ver}`;
    if (node.obfs) line += `,obfs=${node.obfs}`;
    if (node.obfsHost) line += `,obfs-host=${node.obfsHost}`;
    line += `,fast-open=false,udp=true`;
    return line;
  }

  if (node.type === 'socks5') {
    let line = `${name} = SOCKS5,${server},${node.port}`;
    if (node.username || node.password) {
      line += `,"${node.username || ''}","${node.password || ''}"`;
    }
    line += `,fast-open=false,udp=true`;
    return line;
  }

  if (node.type === 'naive') {
    return `# Unsupported on Loon (NaiveProxy requires Chromium network stack): ${name}`;
  }

  return `# Unsupported node: ${name}`;
}

export interface LoonGeneratorOptions {
  expandNodes?: boolean;
  baseUrl?: string;
  subToken?: string;
}

export function generateLoonConfig(
  templateMcf: string,
  nodes: ProxyNode[],
  proxyGroups: ProxyGroupItem[] = [],
  rulesList: UnifiedRuleItem[] = [],
  sources: any[] = [],
  options?: LoonGeneratorOptions
): string {
  const expandNodes = Boolean(options?.expandNodes);
  const lines = templateMcf.split('\n');
  const resultLines: string[] = [];

  // In expandNodes mode, write all nodes into [Proxy]
  const allNodesMap = new Map<string, ProxyNode>();
  nodes.forEach(n => allNodesMap.set(n.name, n));
  sources.forEach(s => {
    if ((s.type === 'filter' || s.type === 'custom' || !s.url || !s.url.startsWith('http')) && Array.isArray(s.nodes)) {
      s.nodes.forEach(n => {
        if (!allNodesMap.has(n.name)) {
          allNodesMap.set(n.name, n);
        }
      });
    }
  });
  const allCandidateNodes = Array.from(allNodesMap.values());

  const networkSourceIds = new Set(
    sources.filter(s => s.enabled && s.type !== 'custom' && s.type !== 'filter' && s.url && s.url.startsWith('http')).map(s => s.id)
  );

  const hasSuboneRemoteSubscription = Boolean(options?.baseUrl && options?.subToken);

  let nodesToWrite: ProxyNode[] = [];
  if (expandNodes) {
    nodesToWrite = allCandidateNodes;
  } else if (!hasSuboneRemoteSubscription) {
    // 降级兼容：如果未提供 baseUrl/subToken，自建节点依旧写入静态 [Proxy]
    nodesToWrite = allCandidateNodes.filter(n => !n.sourceId || n.sourceId === 'custom' || n.sourceId.startsWith('custom') || !networkSourceIds.has(n.sourceId));
  } else {
    // 订阅化模式：自建节点已挂载到 [Remote Proxy]，无需写入静态 [Proxy]
    nodesToWrite = [];
  }

  const generatedProxyLines = nodesToWrite.map(nodeToLoonProxy);

  let inProxySection = false;
  let hasHandledProxy = false;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();

    if (trimmed === '[Proxy]') {
      inProxySection = true;
      hasHandledProxy = true;
      resultLines.push(line);
      if (generatedProxyLines.length > 0) {
        resultLines.push(...generatedProxyLines);
      }
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
    if (generatedProxyLines.length > 0) {
      resultLines.push(...generatedProxyLines);
    }
  }

  const baseConfig = resultLines.join('\n');
  return injectUnifiedToLoon(baseConfig, nodes, proxyGroups, rulesList, sources, options);
}

export function injectUnifiedToLoon(
  templateMcf: string,
  nodes: ProxyNode[],
  proxyGroups: ProxyGroupItem[],
  rulesList: UnifiedRuleItem[],
  sources: SubscriptionSource[] = [],
  options?: { expandNodes?: boolean; baseUrl?: string; subToken?: string }
): string {
  const expandNodes = Boolean(options?.expandNodes);
  const lines = templateMcf.split('\n');
  const activeRules = rulesList.filter(r => r.enabled);
  const remoteRules = activeRules.filter(r => r.kind === 'remote');
  const localRules = activeRules.filter(r => r.kind === 'local');

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

  const networkSources = sources.filter(s => s.enabled && s.type !== 'custom' && s.type !== 'filter' && s.url && s.url.startsWith('http'));
  const internalSources = sources.filter(s => s.enabled && !networkSources.some(ns => ns.id === s.id));
  const hasSuboneRemoteSubscription = Boolean(options?.baseUrl && options?.subToken && !expandNodes);

  const customNodes = nodes.filter(n => n.sourceId === 'custom' || n.sourceId?.startsWith('custom') || !n.sourceId);
  const customNodeNames = customNodes.map(n => n.name.replace(/[=,]/g, '_'));
  const allNodeNames = nodes.map(n => n.name.replace(/[=,]/g, '_'));

  // Helper to generate a clean filter tag that never collides with proxy group name
  function getLoonFilterTag(grp: ProxyGroupItem): string {
    const cleanTag = grp.name
      .replace(/^[\p{Extended_Pictographic}\s⚡️🚀👉♻️🌐📹✈️🤖🇨🇳🇭🇰🇯🇵🇺🇸🏮🇸🇬]+/u, '')
      .replace(/[=,]/g, '_')
      .trim();

    if (!cleanTag || cleanTag === grp.name.trim()) {
      return `${cleanTag || 'Filter'}_Filter`;
    }
    return cleanTag;
  }

  // 1. Build [Remote Proxy] (Loon native remote subscriptions)
  const remoteProxyLines: string[] = [];
  const allActiveRemoteSources: SubscriptionSource[] = [];

  if (!expandNodes) {
    // 外部机场订阅：保持原样直连链接
    networkSources.forEach(s => {
      const tag = s.name.replace(/[=,]/g, '_').trim();
      remoteProxyLines.push(`${tag} = ${s.url}, udp=true, fast-open=default, skip-cert-verify=true, enabled=true`);
      allActiveRemoteSources.push(s);
    });

    // 内部自建/过滤/独立源：若有 baseUrl 与 subToken，生成指向 Subone 自身的独立订阅
    if (hasSuboneRemoteSubscription && options?.baseUrl && options?.subToken) {
      const cleanBaseUrl = options.baseUrl.replace(/\/+$/, '');
      const token = encodeURIComponent(options.subToken);
      internalSources.forEach(s => {
        const tag = s.name.replace(/[=,]/g, '_').trim();
        const subUrl = `${cleanBaseUrl}/s/${token}/source/${encodeURIComponent(s.id)}?target=loon`;
        remoteProxyLines.push(`${tag} = ${subUrl}, udp=true, fast-open=default, skip-cert-verify=true, enabled=true`);
        allActiveRemoteSources.push(s);
      });
    }
  }

  // 2. Build [Remote Filter] (Regex / region filters for subscription nodes)
  const filterMap = new Map<string, string>();
  if (!expandNodes && allActiveRemoteSources.length > 0) {
    effectiveGroups.forEach(grp => {
      if (grp.filter) {
        const filterTag = getLoonFilterTag(grp);
        filterMap.set(filterTag, grp.filter);
      }
    });
    filterMap.set('全部节点', '.*');
  }

  const remoteFilterLines: string[] = [];
  filterMap.forEach((filterKey, tag) => {
    remoteFilterLines.push(`${tag} = NameRegex, FilterKey = "${filterKey}"`);
  });

  // 3. Build [Proxy Group]
  const sourceGroupTags: string[] = [];
  allActiveRemoteSources.forEach(s => {
    sourceGroupTags.push(formatSourceGroupTag(s));
  });
  if (!hasSuboneRemoteSubscription) {
    if (customSources.length > 0) {
      customSources.forEach(cs => {
        sourceGroupTags.push(formatSourceGroupTag(cs));
      });
    } else if (customNodes.length > 0) {
      sourceGroupTags.push('🖥️ 独立节点组');
    }
  }

  const activeSources = expandNodes ? sources.filter(s => s.enabled) : allActiveRemoteSources;
  activeSources.forEach(s => {
    const sClean = cleanSourceOrGroupName(s.name);
    const groupTag = formatSourceGroupTag(s);
    const cleanLower = sClean.toLowerCase();

    const exists = effectiveGroups.some(g => {
      const gClean = cleanSourceOrGroupName(g.name).toLowerCase();
      return g.name === groupTag || gClean === cleanLower;
    });

    if (!exists) {
      effectiveGroups.push({
        id: s.id === 'custom' ? 'grp-src-custom' : `grp-src-${s.id}`,
        name: groupTag,
        type: s.type === 'custom' ? 'select' : 'urltest',
        use: [sClean],
        tolerance: 50,
        interval: 300,
        url: 'https://www.google.com/generate_204',
      });
    }
  });

  const existingGroupNames = new Set(effectiveGroups.map(g => g.name.toLowerCase()));
  const groupLines: string[] = [];

  effectiveGroups.forEach(grp => {
    if (grp.type === 'direct') {
      groupLines.push(`${grp.name} = select, DIRECT`);
      return;
    }
    if (grp.type === 'reject') {
      groupLines.push(`${grp.name} = select, REJECT`);
      return;
    }

    const groupType = grp.type === 'urltest' ? 'url-test' : (grp.type === 'load-balance' ? 'load-balance' : (grp.type || 'select'));

    // If group has filter (e.g. 🇭🇰 香港节点)
    if (grp.filter) {
      const cleanFilter = grp.filter.trim().replace(/^\(\?i\)/i, '').replace(/\(\?i\)/gi, '');
      let matched: string[] = [];
      try {
        const reg = new RegExp(cleanFilter, 'i');
        matched = (expandNodes ? nodes : customNodes).filter(n => reg.test(n.name)).map(n => n.name.replace(/[=,]/g, '_'));
      } catch {
        matched = [];
      }

      if (expandNodes) {
        const members = matched.length > 0 ? matched : ['DIRECT'];
        groupLines.push(`${grp.name} = ${groupType}, ${members.join(', ')}, url=${grp.url || 'https://www.google.com/generate_204'}, interval=300, tolerance=${grp.tolerance || 50}`);
      } else {
        const filterTag = getLoonFilterTag(grp);
        const members: string[] = [];
        if (allActiveRemoteSources.length > 0) {
          members.push(filterTag);
        }
        // 仅在自建节点未订阅化时，将匹配的静态节点补充入列表
        if (!hasSuboneRemoteSubscription && matched.length > 0) {
          members.push(...matched);
        }
        if (members.length === 0) {
          members.push('DIRECT');
        }
        groupLines.push(`${grp.name} = ${groupType}, ${members.join(', ')}, url=${grp.url || 'https://www.google.com/generate_204'}, interval=300, tolerance=${grp.tolerance || 50}`);
      }
      return;
    }

    if (grp.name === '♻️ 自动选择') {
      const members = expandNodes
        ? (allNodeNames.length > 0 ? allNodeNames : ['DIRECT'])
        : (allActiveRemoteSources.length > 0 ? ['全部节点'] : (customNodeNames.length > 0 ? customNodeNames : ['DIRECT']));
      groupLines.push(`${grp.name} = url-test, ${members.join(', ')}, url=${grp.url || 'https://www.google.com/generate_204'}, interval=300, tolerance=${grp.tolerance || 50}`);
      return;
    }

    if (grp.name === '👉 手动选择') {
      const members = expandNodes
        ? (allNodeNames.length > 0 ? allNodeNames : ['DIRECT'])
        : (allActiveRemoteSources.length > 0 ? ['全部节点'] : (customNodeNames.length > 0 ? customNodeNames : ['DIRECT']));
      groupLines.push(`${grp.name} = select, ${members.join(', ')}`);
      return;
    }

    // Match dedicated source group (e.g. ⚡️ MESL, ✨ HK优选, 🖥️ 独立节点组)
    const cleanName = cleanSourceOrGroupName(grp.name).toLowerCase();
    const matchedSource = activeSources.find(s => {
      const sClean = cleanSourceOrGroupName(s.name).toLowerCase();
      return sClean === cleanName || s.id.toLowerCase() === cleanName;
    });

    if (matchedSource) {
      if (expandNodes) {
        const srcNodes = nodes
          .filter(n => n.sourceName === matchedSource.name || n.sourceId === matchedSource.id)
          .map(n => n.name.replace(/[=,]/g, '_'));
        const members = srcNodes.length > 0 ? srcNodes : ['DIRECT'];
        if (groupType === 'url-test') {
          groupLines.push(`${grp.name} = url-test, ${members.join(', ')}, url=${grp.url || 'https://www.google.com/generate_204'}, interval=300, tolerance=${grp.tolerance || 50}`);
        } else {
          groupLines.push(`${grp.name} = select, ${members.join(', ')}`);
        }
      } else {
        const sTag = matchedSource.name.replace(/[=,]/g, '_').trim();
        if (groupType === 'url-test') {
          groupLines.push(`${grp.name} = url-test, ${sTag}, url=${grp.url || 'https://www.google.com/generate_204'}, interval=300, tolerance=${grp.tolerance || 50}`);
        } else {
          groupLines.push(`${grp.name} = select, ${sTag}`);
        }
      }

      return;
    }

    if (!hasSuboneRemoteSubscription) {
      const isCustomGrp = grp.id === 'grp-src-custom' || cleanName === '自建节点' || cleanName === '独立节点组' || cleanName === 'custom' || cleanName === '手工自建' || customSources.some(cs => cleanSourceOrGroupName(cs.name).toLowerCase() === cleanName);
      if (isCustomGrp) {
        const members = customNodeNames.length > 0 ? customNodeNames : ['DIRECT'];
        groupLines.push(`${grp.name} = select, ${members.join(', ')}`);
        return;
      }
    }

    // Standard selector group with proxies list (e.g. 🚀 节点选择, 🤖 AI 服务, 📹 YouTube, 🌐 Google, etc.)
    let proxies = grp.proxies ? [...grp.proxies] : [];

    // If main selector (🚀 节点选择), ensure source groups are prepended
    if (grp.name === '🚀 节点选择') {
      sourceGroupTags.forEach(st => {
        if (effectiveGroups.some(g => g.name === st) && !proxies.includes(st)) {
          proxies.unshift(st);
        }
      });
    }

    // Support grp.use: ['自建'] or ['🖥️ 独立节点组'] or ['MESL'] or ['✨ HK优选']
    if (grp.use && grp.use.length > 0) {
      grp.use.forEach(u => {
        const cleanU = cleanSourceOrGroupName(u).toLowerCase();
        const isCustom = cleanU === '自建节点' || cleanU === '独立节点组' || cleanU === '手工自建' || cleanU === 'custom' || customSources.some(cs => cleanSourceOrGroupName(cs.name).toLowerCase() === cleanU);

        const matchedSource = sources.find(s => {
          const sClean = cleanSourceOrGroupName(s.name).toLowerCase();
          return sClean === cleanU || s.id.trim().toLowerCase() === cleanU;
        });

        const isRemoteActive = Boolean(
          matchedSource &&
          allActiveRemoteSources.some(as => as.id === matchedSource.id)
        );

        if (!expandNodes && isRemoteActive && matchedSource) {
          // 远程订阅源（含机场源及订阅化自建源）：直接引用对应 Tag
          const sTag = matchedSource.name.replace(/[=,]/g, '_').trim();
          if (!proxies.includes(sTag)) {
            proxies.push(sTag);
          }
        } else if (expandNodes || !isRemoteActive) {
          // 节点直接展开模式或未订阅化的自建节点
          let srcNodeList: string[] = [];
          if (matchedSource && Array.isArray(matchedSource.nodes) && matchedSource.nodes.length > 0) {
            srcNodeList = matchedSource.nodes.map(n => n.name.replace(/[=,]/g, '_'));
          } else {
            srcNodeList = nodes.filter(n => {
              const sName = cleanSourceOrGroupName(n.sourceName || '').toLowerCase();
              const sId = (n.sourceId || '').trim().toLowerCase();
              const nIsCustom = sId === 'custom' || sId.startsWith('custom');
              return sName === cleanU || sId === cleanU || (nIsCustom && isCustom);
            }).map(n => n.name.replace(/[=,]/g, '_'));
          }

          srcNodeList.forEach(m => {
            if (!proxies.includes(m)) proxies.push(m);
          });

          if (isCustom && customNodeNames.length > 0 && !hasSuboneRemoteSubscription) {
            customNodeNames.forEach(m => {
              if (!proxies.includes(m)) proxies.push(m);
            });
          }
        }

        // Check if there is an existing proxy group with this name (e.g. ⚡️ MESL, ✨ AI优选, 🖥️ 独立节点组)
        const matched = sourceGroupTags.find(st => cleanSourceOrGroupName(st).toLowerCase() === cleanU);
        const tagToAdd = matched || (matchedSource ? formatSourceGroupTag(matchedSource) : u);
        if (effectiveGroups.some(g => g.name === tagToAdd) && !proxies.includes(tagToAdd)) {
          proxies.unshift(tagToAdd);
        } else if (effectiveGroups.some(g => g.name === u) && !proxies.includes(u)) {
          proxies.unshift(u);
        }
      });
    }

    // Prune dangling references in Loon
    const validGroupNames = new Set(effectiveGroups.map(g => g.name));
    const validNodeNames = new Set(nodes.map(n => n.name.replace(/[=,]/g, '_')));
    sources.forEach(s => {
      if (Array.isArray(s.nodes)) {
        s.nodes.forEach(n => validNodeNames.add(n.name.replace(/[=,]/g, '_')));
      }
    });
    const validSubTags = new Set([
      ...allActiveRemoteSources.map(s => s.name.replace(/[=,]/g, '_').trim()),
      ...allActiveRemoteSources.map(s => cleanSourceOrGroupName(s.name.replace(/[=,]/g, '_')).trim())
    ]);
    const isBuiltinLoonProxy = (t: string) => {
      const upper = t.trim().toUpperCase();
      return upper === 'DIRECT' || upper === 'REJECT' || upper === '全部节点' || t.trim() === '🎯 本地直连';
    };

    // Normalize proxies: if a proxy matches any effective group by clean name (e.g. ⚡️ AI优选 -> ✨ AI优选), map to actual group name,
    // but preserve exact Remote Proxy subscription tags (e.g. AI优选, HK优选, 独立节点组)
    proxies = proxies.map(p => {
      const trimmed = p.trim();
      if (validSubTags.has(trimmed)) {
        return trimmed;
      }
      if (validGroupNames.has(trimmed)) {
        return trimmed;
      }
      const pClean = cleanSourceOrGroupName(trimmed).toLowerCase();
      const matchedGrp = effectiveGroups.find(g => cleanSourceOrGroupName(g.name).toLowerCase() === pClean);
      if (matchedGrp) return matchedGrp.name;
      return p;
    });

    proxies = Array.from(new Set(proxies)).filter(p => {
      if (!p || p.trim() === grp.name) return false;
      const t = p.trim();
      return validGroupNames.has(t) || validNodeNames.has(t) || validSubTags.has(t) || isBuiltinLoonProxy(t);
    });

    if (proxies.length === 0) {
      proxies = ['DIRECT'];
    }

    if (groupType === 'url-test') {
      groupLines.push(`${grp.name} = url-test, ${proxies.join(', ')}, url=${grp.url || 'https://www.google.com/generate_204'}, interval=${grp.interval || 300}, tolerance=${grp.tolerance || 50}`);
    } else if (groupType === 'fallback') {
      groupLines.push(`${grp.name} = fallback, ${proxies.join(', ')}, url=${grp.url || 'https://www.google.com/generate_204'}, interval=${grp.interval || 300}`);
    } else {
      groupLines.push(`${grp.name} = ${groupType}, ${proxies.join(', ')}`);
    }
  });

  if (!hasSuboneRemoteSubscription && customNodes.length > 0 && !effectiveGroups.some(g => g.id === 'grp-src-custom' || cleanSourceOrGroupName(g.name) === '自建节点' || cleanSourceOrGroupName(g.name) === '独立节点组')) {
    const customTagName = customSources[0]?.name ? formatSourceGroupTag(customSources[0]) : '🖥️ 独立节点组';
    groupLines.push(`${customTagName} = select, ${customNodeNames.join(', ')}`);
  }

  // 4. Build [Rule]
  const availableGroupNames = new Set(proxyGroups.map(g => g.name));
  const fallbackGroup = proxyGroups.find(g => g.name === '🚀 节点选择')?.name || proxyGroups[0]?.name || 'DIRECT';

  const localRuleLines = localRules.flatMap(r => {
    const payloads = r.payload.split(/[,;\n]+/).map(p => p.trim()).filter(Boolean);
    const safeOutbound = resolveSafeOutbound(r.outbound, availableGroupNames, fallbackGroup);
    return payloads.map(p => {
      if (r.type === 'SRC-IP-CIDR') {
        return `SRC-IP-CIDR,${formatCidr(p)},${safeOutbound}`;
      }
      return `${r.type},${p},${safeOutbound}`;
    });
  });

  // 5. Build [Remote Rule]
  const remoteRuleLines = remoteRules.map((r, idx) => {
    const adapted = adaptRulesetForLoon(r, idx);
    const tag = r.name.replace(/[=,]/g, '_');
    const safeOutbound = resolveSafeOutbound(r.outbound, availableGroupNames, fallbackGroup);
    return `${adapted.url}, policy=${safeOutbound}, tag=${tag}, enabled=true`;
  });


  const result: string[] = [];
  let hasHandledRemoteProxy = false;
  let hasHandledRemoteFilter = false;
  let hasHandledGroup = false;

  let inSkippedSection = false;

  for (const line of lines) {
    const trimmed = line.trim();

    // Ignore legacy or incorrect [Proxy Provider] header
    if (trimmed === '[Proxy Provider]') {
      continue;
    }

    // If expandNodes is true, do not retain existing lines in [Remote Proxy] or [Remote Filter]
    if (expandNodes && (trimmed === '[Remote Proxy]' || trimmed === '[Remote Filter]')) {
      inSkippedSection = true;
      continue;
    }
    if (inSkippedSection && trimmed.startsWith('[')) {
      inSkippedSection = false;
    }
    if (inSkippedSection) {
      continue;
    }

    if (trimmed === '[Remote Proxy]') {
      hasHandledRemoteProxy = true;
      result.push(line);
      result.push(...remoteProxyLines);
      continue;
    }

    if (trimmed === '[Remote Filter]') {
      hasHandledRemoteFilter = true;
      result.push(line);
      result.push(...remoteFilterLines);
      continue;
    }

    if (trimmed === '[Proxy Group]') {
      hasHandledGroup = true;
      if (!expandNodes) {
        // If template missed [Remote Proxy], insert it before [Proxy Group]
        if (!hasHandledRemoteProxy && remoteProxyLines.length > 0) {
          result.push('[Remote Proxy]');
          result.push(...remoteProxyLines);
          result.push('');
          hasHandledRemoteProxy = true;
        }
        // If template missed [Remote Filter], insert it before [Proxy Group]
        if (!hasHandledRemoteFilter && remoteFilterLines.length > 0) {
          result.push('[Remote Filter]');
          result.push(...remoteFilterLines);
          result.push('');
          hasHandledRemoteFilter = true;
        }
      }
      result.push(line);
      result.push(...groupLines);
      continue;
    }

    if (trimmed === '[Rule]') {
      result.push(line);
      result.push(...localRuleLines);
      continue;
    }

    if (trimmed === '[Remote Rule]') {
      result.push(line);
      result.push(...remoteRuleLines);
      continue;
    }

    result.push(line);
  }

  if (!expandNodes) {
    if (!hasHandledRemoteProxy && remoteProxyLines.length > 0) {
      result.push('\n[Remote Proxy]');
      result.push(...remoteProxyLines);
    }
    if (!hasHandledRemoteFilter && remoteFilterLines.length > 0) {
      result.push('\n[Remote Filter]');
      result.push(...remoteFilterLines);
    }
  }
  if (!hasHandledGroup && groupLines.length > 0) {
    result.push('\n[Proxy Group]');
    result.push(...groupLines);
  }

  return result.join('\n');
}
