import { ProxyNode, ProxyGroupItem, UnifiedRuleItem, SubscriptionSource } from '../../types/index.js';
import { adaptRulesetForShadowrocket, formatRuleTag } from './ruleset-adapter.js';
import { resolveSafeOutbound, formatCidr, cleanSourceOrGroupName, formatSourceGroupTag } from './common.js';

export function nodeToShadowrocketProxy(node: ProxyNode): string {
  const name = node.name.replace(/[=,]/g, '_');
  const cleanServer = (node.server || '').trim().replace(/^\[(.*)\]$/, '$1');

  if (node.type === 'ss') {
    const cipher = node.method || 'aes-128-gcm';
    const pwd = node.password || '';
    let line = `${name} = ss, ${cleanServer}, ${node.port}, ${cipher}, "${pwd}"`;
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
    let line = `${name} = vmess, ${cleanServer}, ${node.port}, username=${node.uuid || ''}, alterId=${node.alterId || 0}, cipher=${cipher}`;
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
    let line = `${name} = vless, ${cleanServer}, ${node.port}, username=${node.uuid || ''}`;
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
    let line = `${name} = trojan, ${cleanServer}, ${node.port}, password="${node.password || ''}", tls=true`;
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
    let line = `${name} = hysteria2, ${cleanServer}, ${node.port}, password="${node.password || ''}"`;
    if (node.sni) line += `, sni=${node.sni}`;
    if (node.skipCertVerify) line += `, skip-cert-verify=true`;
    const obfsPwd = node.obfsPassword || (node.obfs && node.obfs !== 'salamander' ? node.obfs : undefined);
    if (obfsPwd) line += `, obfs=salamander, obfs-password="${obfsPwd}"`;
    if (node.downMbps) line += `, download-bandwidth=${node.downMbps}`;
    if (node.upMbps) line += `, upload-bandwidth=${node.upMbps}`;
    if (node.serverPorts && node.serverPorts.length > 0) {
      const ports = (Array.isArray(node.serverPorts) ? node.serverPorts : String(node.serverPorts).split(','))
        .map((s: any) => String(s).trim().replace(':', '-'))
        .filter(Boolean)
        .join(',');
      if (ports) line += `, mport=${ports}`;
    }
    line += `, udp=true`;
    return line;
  }

  if (node.type === 'anytls') {
    let line = `${name} = anytls, ${cleanServer}, ${node.port}, password="${node.password || ''}", tls=true`;
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
    let line = `${name} = socks5, ${cleanServer}, ${node.port}`;
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
    let line = `${name} = http, ${cleanServer}, ${node.port}`;
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

  if (node.type === 'wireguard') {
    let line = `${name} = wireguard, ${cleanServer}, ${node.port}, ip=${node.ip || '10.0.0.2'}, private-key="${node.privateKey || ''}", public-key="${node.publicKey || ''}"`;
    if (node.presharedKey) line += `, preshared-key="${node.presharedKey}"`;
    if (node.reserved && node.reserved.length > 0) line += `, reserved=${node.reserved.join(',')}`;
    return line;
  }

  return `# Unsupported on Shadowrocket (${node.type.toUpperCase()}): ${name}`;
}

export function nodeToUri(node: ProxyNode): string | null {
  const name = encodeURIComponent(node.name);
  const cleanServer = (node.server || '').trim().replace(/^\[(.*)\]$/, '$1');
  const uriHost = cleanServer.includes(':') && !cleanServer.startsWith('[') ? `[${cleanServer}]` : cleanServer;

  if (node.type === 'ss') {
    const cred = Buffer.from(`${node.method || 'aes-128-gcm'}:${node.password || ''}`).toString('base64');
    return `ss://${cred}@${uriHost}:${node.port}#${name}`;
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
    return `trojan://${encodeURIComponent(node.password || '')}@${uriHost}:${node.port}${qs ? '?' + qs : ''}#${name}`;
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
    return `vless://${node.uuid || ''}@${uriHost}:${node.port}${qs ? '?' + qs : ''}#${name}`;
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
      const ports = (Array.isArray(node.serverPorts) ? node.serverPorts : String(node.serverPorts).split(','))
        .map((s: any) => String(s).trim().replace(':', '-'))
        .filter(Boolean)
        .join(',');
      if (ports) params.set('mport', ports);
    }
    const qs = params.toString();
    return `hysteria2://${encodeURIComponent(node.password || '')}@${uriHost}:${node.port}${qs ? '?' + qs : ''}#${name}`;
  }

  if (node.type === 'anytls') {
    const params = new URLSearchParams();
    if (node.sni) params.set('sni', node.sni);
    if (node.skipCertVerify) params.set('insecure', '1');
    if (node.fingerprint) params.set('fp', node.fingerprint);
    const qs = params.toString();
    return `anytls://${encodeURIComponent(node.password || '')}@${uriHost}:${node.port}${qs ? '?' + qs : ''}#${name}`;
  }

  if (node.type === 'vmess') {
    const vmessObj: Record<string, any> = {
      v: '2',
      ps: node.name,
      add: cleanServer,
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
  const nodesToWrite = expandNodes
    ? allCandidateNodes
    : allCandidateNodes.filter(n => !n.sourceId || n.sourceId === 'custom' || n.sourceId.startsWith('custom') || !networkSourceIds.has(n.sourceId));
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

export function injectUnifiedToShadowrocket(
  templateConf: string,
  nodes: ProxyNode[],
  proxyGroups: ProxyGroupItem[],
  rulesList: UnifiedRuleItem[],
  sources: SubscriptionSource[] = [],
  options?: { expandNodes?: boolean }
): string {
  const expandNodes = Boolean(options?.expandNodes);
  const lines = templateConf.split('\n');
  const activeRules = rulesList.filter(r => r.enabled);
  const remoteRules = activeRules.filter(r => r.kind === 'remote');
  const localRules = activeRules.filter(r => r.kind === 'local');

  const customSources = sources.filter(s => s.type === 'custom' || s.id === 'custom');
  const customTagName = customSources[0]?.name
    ? (customSources[0].name.startsWith('⚡️') ? customSources[0].name : `⚡️ ${customSources[0].name}`)
    : '⚡️ 自建节点';

  const effectiveGroups: ProxyGroupItem[] = proxyGroups.map(g => ({
    ...g,
    proxies: g.proxies ? [...g.proxies] : undefined,
    use: g.use ? [...g.use] : undefined,
  }));

  // Sanitize effectiveGroups: if there is a custom group, sync its name to customTagName and remove any stale '⚡️ 独立节点组'
  const customGrp = effectiveGroups.find(g =>
    g.id === 'grp-src-custom' ||
    g.name === customTagName ||
    g.name === '⚡️ 独立节点组' ||
    g.name === '独立节点组'
  );
  if (customGrp) {
    customGrp.name = customTagName;
    customGrp.use = [customSources[0]?.name || '自建节点'];
    const idx = effectiveGroups.indexOf(customGrp);
    for (let i = effectiveGroups.length - 1; i >= 0; i--) {
      if (i !== idx) {
        const g = effectiveGroups[i];
        if (g.id === 'grp-src-custom' || g.name === '⚡️ 独立节点组' || g.name === '独立节点组') {
          effectiveGroups.splice(i, 1);
        }
      }
    }
    effectiveGroups.forEach(grp => {
      if (grp !== customGrp) {
        if (grp.use) {
          grp.use = grp.use.map(u => (u === '独立节点组' || u === '⚡️ 独立节点组' ? (customSources[0]?.name || '自建节点') : u));
        }
        if (grp.proxies) {
          grp.proxies = grp.proxies.map(p => (p === '⚡️ 独立节点组' || p === '独立节点组' ? customTagName : p));
        }
      }
    });
  }

  const networkSources = sources.filter(s => s.enabled && s.type !== 'custom' && s.url && s.url.startsWith('http'));
  const customNodes = nodes.filter(n => n.sourceId === 'custom' || n.sourceId?.startsWith('custom') || !n.sourceId);
  const customNodeNames = customNodes.map(n => n.name.replace(/[=,]/g, '_'));
  const allNodeNames = nodes.map(n => n.name.replace(/[=,]/g, '_'));

  // 1. Build [Proxy Group]
  const groupLines: string[] = [];
  const existingGroupNames = new Set<string>();

  effectiveGroups.forEach(grp => {
    existingGroupNames.add(grp.name.toLowerCase());
    let members: string[] = [];

    if (grp.use && grp.use.length > 0) {
      grp.use.forEach(u => {
        const customSrc = sources.find(s => (s.type === 'custom' || s.id === 'custom') && (s.name === u || s.id === u));
        const isCustomU = u === '自建节点' || u === '独立节点组' || u === 'custom' || u === '手工自建' || customSources.some(cs => cs.name === u);
        if (customSrc || isCustomU) {
          const groupNodes = nodes
            .filter(n => n.sourceId === (customSrc?.id || 'custom') || n.sourceName === (customSrc?.name || u) || (!n.sourceId && isCustomU))
            .map(n => n.name.replace(/[=,]/g, '_'));
          members.push(...(groupNodes.length > 0 ? groupNodes : customNodeNames));
        } else {
          const cleanU = u.replace(/^[⚡️\s]+/, '').trim().toLowerCase();
          const matchedSrc = sources.find(s => {
            const sClean = s.name.replace(/^[⚡️\s]+/, '').trim().toLowerCase();
            return sClean === cleanU || s.id.trim().toLowerCase() === cleanU;
          });
          if (matchedSrc) {
            const isRemoteNetwork = matchedSrc.enabled && matchedSrc.type !== 'custom' && matchedSrc.type !== 'filter' && matchedSrc.url && matchedSrc.url.startsWith('http');
            if (!isRemoteNetwork || expandNodes) {
              let srcNodes: string[] = [];
              if (Array.isArray(matchedSrc.nodes) && matchedSrc.nodes.length > 0) {
                srcNodes = matchedSrc.nodes.map(n => n.name.replace(/[=,]/g, '_'));
              } else {
                srcNodes = nodes
                  .filter(n => {
                    const sName = (n.sourceName || '').trim().toLowerCase().replace(/^[⚡️\s]+/, '');
                    const sId = (n.sourceId || '').trim().toLowerCase();
                    return sName === cleanU || sId === cleanU;
                  })
                  .map(n => n.name.replace(/[=,]/g, '_'));
              }
              members.push(...srcNodes);
            } else {
              const sTag = matchedSrc.name.replace(/[=,]/g, '_').trim();
              members.push(sTag.startsWith('⚡️') ? sTag : `⚡️ ${sTag}`);
            }
          }
        }
      });
    }

    if (grp.proxies && grp.proxies.length > 0) {
      grp.proxies.forEach(p => {
        if (p === 'DIRECT' || p === '🎯 本地直连') {
          members.push('DIRECT');
        } else if (p === 'REJECT' || p === '🛑 广告拦截' || p === '🛑 全局拦截') {
          members.push('REJECT');
        } else {
          const cleanP = (p === '⚡️ 独立节点组' || p === '独立节点组') ? customTagName : p;
          members.push(cleanP.replace(/[=,]/g, '_'));
        }
      });
    }

    if (grp.filter) {
      try {
        const reg = new RegExp(grp.filter, 'i');
        const matched = nodes
          .filter(n => reg.test(n.name))
          .map(n => n.name.replace(/[=,]/g, '_'));
        members.push(...matched);
      } catch (e) {
        // ignore regex error
      }
    }

    members = Array.from(new Set(members)).filter(Boolean);

    if (members.length === 0) {
      if (allNodeNames.length > 0) {
        members.push(allNodeNames[0]);
      } else {
        members.push('DIRECT');
      }
    }

    const grpType = grp.type === 'urltest' ? 'url-test' : (grp.type === 'fallback' ? 'fallback' : 'select');
    if (grpType === 'url-test') {
      groupLines.push(`${grp.name} = url-test, ${members.join(', ')}, url=${grp.url || 'http://cp.cloudflare.com/generate_204'}, interval=${grp.interval || 300}, tolerance=${grp.tolerance || 50}`);
    } else if (grpType === 'fallback') {
      groupLines.push(`${grp.name} = fallback, ${members.join(', ')}, url=${grp.url || 'http://cp.cloudflare.com/generate_204'}, interval=${grp.interval || 300}`);
    } else {
      groupLines.push(`${grp.name} = select, ${members.join(', ')}`);
    }
  });

  if (customNodes.length > 0 && !effectiveGroups.some(g => g.id === 'grp-src-custom' || g.name.includes('自建') || g.name.includes('独立') || customSources.some(cs => g.name.includes(cs.name)))) {
    groupLines.push(`${customTagName} = select, ${customNodeNames.join(', ')}`);
  }

  // 2. Build [Rule]
  const availableGroupNames = new Set(proxyGroups.map(g => g.name));
  const fallbackGroup = proxyGroups.find(g => g.name === '🚀 节点选择')?.name || proxyGroups[0]?.name || 'DIRECT';

  const ruleLines: string[] = [];

  remoteRules.forEach((r, idx) => {
    const adapted = adaptRulesetForShadowrocket(r, idx);
    const safeOutbound = resolveSafeOutbound(r.outbound, availableGroupNames, fallbackGroup);
    ruleLines.push(`RULE-SET,${adapted.url},${safeOutbound}`);
  });

  localRules.forEach(r => {
    if (r.type === 'FINAL') {
      return;
    }
    const safeOutbound = resolveSafeOutbound(r.outbound, availableGroupNames, fallbackGroup);
    const payloads = r.payload.split(/[,;\n]+/).map(p => p.trim()).filter(Boolean);
    payloads.forEach(p => {
      if (r.type === 'IP-CIDR') {
        ruleLines.push(`IP-CIDR,${p},${safeOutbound},no-resolve`);
      } else if (r.type === 'SRC-IP-CIDR') {
        ruleLines.push(`SRC-IP-CIDR,${formatCidr(p)},${safeOutbound},no-resolve`);
      } else {
        ruleLines.push(`${r.type},${p},${safeOutbound}`);
      }
    });
  });

  const finalRule = activeRules.find(r => r.type === 'FINAL');
  const finalOutbound = finalRule
    ? resolveSafeOutbound(finalRule.outbound, availableGroupNames, fallbackGroup)
    : (availableGroupNames.has('🐟 漏网之鱼') ? '🐟 漏网之鱼' : fallbackGroup);
  ruleLines.push(`FINAL,${finalOutbound}`);

  const result: string[] = [];
  let inRuleSection = false;
  let hasHandledRule = false;
  let inGroupSection = false;
  let hasHandledGroup = false;

  for (const line of lines) {
    const trimmed = line.trim();

    if (trimmed === '[Rule]') {
      inRuleSection = true;
      hasHandledRule = true;
      result.push(line);
      result.push(...ruleLines);
      continue;
    }

    if (trimmed === '[Proxy Group]') {
      inGroupSection = true;
      hasHandledGroup = true;
      result.push(line);
      result.push(...groupLines);
      continue;
    }

    if (inRuleSection && trimmed.startsWith('[')) {
      inRuleSection = false;
    }
    if (inGroupSection && trimmed.startsWith('[')) {
      inGroupSection = false;
    }

    if (inRuleSection || inGroupSection) {
      continue;
    }

    result.push(line);
  }

  if (!hasHandledGroup && groupLines.length > 0) {
    result.push('\n[Proxy Group]');
    result.push(...groupLines);
  }

  if (!hasHandledRule && ruleLines.length > 0) {
    result.push('\n[Rule]');
    result.push(...ruleLines);
  }

  return result.join('\n');
}
