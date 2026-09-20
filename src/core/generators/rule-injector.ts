import yaml from 'js-yaml';
import { ProxyGroupItem, UnifiedRuleItem, ProxyNode, SubscriptionSource } from '../../types/index.js';
import {
  adaptRulesetForSingbox,
  adaptRulesetForMihomo,
  adaptRulesetForLoon,
  adaptRulesetForQuantumultX,
  adaptRulesetForEgern,
  adaptRulesetForShadowrocket,
  formatRuleTag,
} from './ruleset-adapter.js';

export function resolveSafeOutbound(target: string, availableGroups: Set<string>, fallback: string): string {
  const t = (target || '').trim();
  if (!t) return fallback;
  const upper = t.toUpperCase();
  if (upper === 'DIRECT' || upper === 'REJECT' || upper === 'GLOBAL' || upper === 'PASS' || t === '🎯 本地直连' || t === 'dns-out') {
    return upper === 'REJECT' ? 'REJECT' : (upper === 'DIRECT' ? 'DIRECT' : t);
  }
  if (t === '🛑 REJECT' || t === '🛑 广告拦截' || t === '🛑 全局拦截') {
    if (availableGroups.has(t)) return t;
    return 'REJECT';
  }
  if (availableGroups.has(t)) {
    return t;
  }
  for (const g of availableGroups) {
    if (g.toLowerCase() === t.toLowerCase()) return g;
  }
  return fallback;
}

export function formatCidr(ip: string): string {
  const trimmed = (ip || '').trim();
  if (!trimmed) return '';
  if (trimmed.includes('/')) return trimmed;
  return trimmed.includes(':') ? `${trimmed}/128` : `${trimmed}/32`;
}

export function getSourceGroupPrefix(source: { type?: string; id?: string }): string {
  if (source.type === 'custom' || source.id === 'custom') return '🖥️';
  if (source.type === 'filter') return '✨';
  return '⚡️';
}

export function cleanSourceOrGroupName(name: string): string {
  if (!name) return '';
  return name.replace(/^[🖥️✨⚡️\s]+/, '').trim();
}

export function formatSourceGroupTag(source: { name: string; type?: string; id?: string }): string {
  const prefix = getSourceGroupPrefix(source);
  const clean = cleanSourceOrGroupName(source.name);
  return `${prefix} ${clean}`;
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

  const effectiveGroups: ProxyGroupItem[] = proxyGroups.map(g => ({
    ...g,
    proxies: g.proxies ? [...g.proxies] : undefined,
    use: g.use ? [...g.use] : undefined,
  }));
  const existingGroupNames = new Set(effectiveGroups.map(g => g.name.toLowerCase()));
  const existingCleanNames = new Set(effectiveGroups.map(g => cleanSourceOrGroupName(g.name).toLowerCase()));

  // Discover unique subscription sources from proxyOutbounds
  const discoveredSources = new Map<string, { groupTag: string; sourceName: string; isCustom: boolean }>();
  proxyOutbounds.forEach(p => {
    const sName = (p._sourceName || '').trim();
    const sId = (p._sourceId || '').trim();
    const isCustom = sId === 'custom' || sId.startsWith('custom');
    const key = isCustom ? (sId || 'custom') : sName.toLowerCase();

    if (!discoveredSources.has(key)) {
      const matchedSource = sources.find((s: any) => s.id === sId || cleanSourceOrGroupName(s.name).toLowerCase() === cleanSourceOrGroupName(sName).toLowerCase());
      const isCustomSrc = isCustom || matchedSource?.type === 'custom' || matchedSource?.id === 'custom';
      const isFilterSrc = matchedSource?.type === 'filter';
      const sourceName = cleanSourceOrGroupName(sName || (isCustomSrc ? '独立节点组' : sName));
      const groupTag = formatSourceGroupTag({ name: sourceName, type: isCustomSrc ? 'custom' : (isFilterSrc ? 'filter' : 'remote'), id: sId });
      discoveredSources.set(key, {
        groupTag,
        sourceName,
        isCustom: isCustomSrc,
      });
    }
  });

  // Protected groups that should never be overwritten or matched as a source group
  const isProtectedGroup = (g: ProxyGroupItem) => {
    const id = (g.id || '').trim();
    const name = (g.name || '').trim();
    return (
      id === 'grp-select' ||
      id === 'grp-auto' ||
      id === 'grp-manual' ||
      name === '🚀 节点选择' ||
      name === '👉 手动选择' ||
      name === '♻️ 自动选择' ||
      name === '🎯 本地直连'
    );
  };

  // Prune any dedicated source groups from effectiveGroups that have NO active nodes in discoveredSources
  const activeDiscoveredTags = new Set(Array.from(discoveredSources.values()).map(s => s.groupTag.toLowerCase()));
  const activeDiscoveredNames = new Set(Array.from(discoveredSources.values()).map(s => s.sourceName.toLowerCase()));
  sources.forEach(s => {
    if (s.name) {
      activeDiscoveredNames.add(s.name.toLowerCase());
      activeDiscoveredNames.add(cleanSourceOrGroupName(s.name).toLowerCase());
    }
  });
  const hasDiscoveredCustom = Array.from(discoveredSources.values()).some(s => s.isCustom);

  const deadGroupTags = new Set<string>();
  for (let i = effectiveGroups.length - 1; i >= 0; i--) {
    const g = effectiveGroups[i];
    if (isProtectedGroup(g)) continue;
    const gClean = cleanSourceOrGroupName(g.name).toLowerCase();
    const isCustomGrp = g.id === 'grp-src-custom' || gClean === '自建节点' || gClean === '独立节点组';
    const isDedicatedSourceGroup = g.id.startsWith('grp-src-') || isCustomGrp;
    if (isDedicatedSourceGroup) {
      if (isCustomGrp) {
        if (!hasDiscoveredCustom) {
          deadGroupTags.add(g.name);
          effectiveGroups.splice(i, 1);
        }
      } else {
        const useSrc = (g.use && g.use.length === 1) ? cleanSourceOrGroupName(g.use[0]).toLowerCase() : gClean;
        const isActive = activeDiscoveredTags.has(g.name.toLowerCase()) ||
          activeDiscoveredNames.has(gClean) ||
          activeDiscoveredNames.has(useSrc);
        if (!isActive) {
          deadGroupTags.add(g.name);
          effectiveGroups.splice(i, 1);
        }
      }
    }
  }

  // Clean up references to deadGroupTags across all remaining groups
  if (deadGroupTags.size > 0) {
    effectiveGroups.forEach(grp => {
      if (grp.proxies) {
        grp.proxies = grp.proxies.filter(p => !deadGroupTags.has(p));
      }
      if (grp.use) {
        grp.use = grp.use.filter(u => {
          const cleanU = cleanSourceOrGroupName(u).toLowerCase();
          if (deadGroupTags.has(u)) return false;
          if (cleanU === '自建节点' || cleanU === '独立节点组') return hasDiscoveredCustom;
          return activeDiscoveredNames.has(cleanU) || cleanU === 'all' || cleanU === 'proxy';
        });
      }
    });
  }

  // Automatically add dedicated URLTest / select group for any discovered source that does not yet have a group
  discoveredSources.forEach(info => {
    const cleanName = info.sourceName.toLowerCase();
    const existingGrp = effectiveGroups.find(g => {
      if (isProtectedGroup(g)) return false;
      const gClean = cleanSourceOrGroupName(g.name).toLowerCase();
      if (info.isCustom) {
        return (
          g.id === 'grp-src-custom' ||
          g.id === `grp-src-${info.sourceName}` ||
          gClean === '自建节点' ||
          gClean === '独立节点组' ||
          gClean === cleanName ||
          g.name.toLowerCase() === info.groupTag.toLowerCase()
        );
      }
      return (
        g.id === `grp-src-${info.sourceName}` ||
        gClean === cleanName ||
        g.name.toLowerCase() === info.groupTag.toLowerCase()
      );
    });

    if (existingGrp) {
      if (info.isCustom) {
        existingGrp.name = info.groupTag;
        existingGrp.use = [info.sourceName];
        // Clean out any other stale custom duplicate groups from effectiveGroups
        const idx = effectiveGroups.indexOf(existingGrp);
        for (let i = effectiveGroups.length - 1; i >= 0; i--) {
          if (i !== idx) {
            const g = effectiveGroups[i];
            const gClean = cleanSourceOrGroupName(g.name);
            if (!isProtectedGroup(g) && (g.id === 'grp-src-custom' || gClean === '独立节点组' || gClean === '自建节点')) {
              effectiveGroups.splice(i, 1);
            }
          }
        }
      }
      return;
    }

    if (info.isCustom) {
      const srcGroup: ProxyGroupItem = {
        id: `grp-src-${info.sourceName}`,
        name: info.groupTag,
        type: 'select',
        use: [info.sourceName],
        tolerance: 50,
        interval: 300,
        url: 'https://www.google.com/generate_204',
      };
      effectiveGroups.push(srcGroup);
      existingGroupNames.add(info.groupTag.toLowerCase());
      existingCleanNames.add(cleanName);
    }
  });

  // Ensure '🚀 节点选择' references all active source groups (only if that source group exists in effectiveGroups)
  const mainSelector = effectiveGroups.find(g => g.name === '🚀 节点选择');
  if (mainSelector && mainSelector.proxies) {
    mainSelector.proxies = mainSelector.proxies.filter(p => {
      if (deadGroupTags.has(p)) return false;
      if (p === '⚡️ 独立节点组' || p === '独立节点组') {
        return effectiveGroups.some(g => g.name === p);
      }
      return true;
    });
    discoveredSources.forEach(info => {
      if (effectiveGroups.some(g => g.name === info.groupTag) && !mainSelector.proxies!.includes(info.groupTag)) {
        mainSelector.proxies!.unshift(info.groupTag);
      }
    });
  }

  const validGroupTags = new Set(effectiveGroups.map(g => g.name));
  const validNodeTags = new Set(allNodeTags);
  sources.forEach(s => {
    if (Array.isArray(s.nodes)) {
      s.nodes.forEach((n: any) => validNodeTags.add(n.name));
    }
  });
  const isBuiltinSingboxOutbound = (t: string) => {
    const upper = t.trim().toUpperCase();
    return (
      upper === 'DIRECT' ||
      upper === 'REJECT' ||
      upper === 'BLOCK' ||
      upper === 'GLOBAL' ||
      upper === 'DNS-OUT' ||
      t.trim() === '🎯 本地直连'
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

    let outboundsList = grp.proxies ? [...grp.proxies] : [];

    // Support use: [ "MESL" ] or [ "自建节点" ] or [ "HK优选" ]
    if (grp.use && grp.use.length > 0) {
      const useNormalized = new Set(
        grp.use.map(u => cleanSourceOrGroupName(u).toLowerCase())
      );

      // Match node tags directly from matching sources (especially filter/derived sources)
      const matchedNodeTagsFromSources = new Set<string>();
      sources.forEach(s => {
        const sClean = cleanSourceOrGroupName(s.name).toLowerCase();
        if (useNormalized.has(sClean) || useNormalized.has(s.id.trim().toLowerCase())) {
          if (Array.isArray(s.nodes)) {
            s.nodes.forEach((n: any) => matchedNodeTagsFromSources.add(n.name));
          }
        }
      });

      const matchedNodeTags = proxyOutbounds
        .filter(p => {
          if (matchedNodeTagsFromSources.has(p.tag)) return true;
          const sName = cleanSourceOrGroupName(p._sourceName || '').toLowerCase();
          const sId = (p._sourceId || '').trim().toLowerCase();
          const isCustom = sId === 'custom' || sId.startsWith('custom');
          return useNormalized.has(sName) || useNormalized.has(sId) ||
            (isCustom && (useNormalized.has('自建节点') || useNormalized.has('独立节点组') || useNormalized.has('手工自建') || useNormalized.has('custom')));
        })
        .map(p => p.tag);
      outboundsList = Array.from(new Set([...outboundsList, ...matchedNodeTags]));
    } else if (grp.filter) {
      try {
        const cleanFilter = grp.filter.trim().replace(/^\(\?i\)/i, '').replace(/\(\?i\)/gi, '');
        const reg = new RegExp(cleanFilter, 'i');
        const matched = allNodeTags.filter(tag => reg.test(tag));
        outboundsList = matched.length > 0 ? matched : ['🎯 本地直连'];
      } catch (e) {
        outboundsList = ['🎯 本地直连'];
      }
    } else {
      // Auto-match if group name matches a subscription source name
      const cleanGrpName = cleanSourceOrGroupName(grp.name).toLowerCase();
      const isCustomGrp = grp.id === 'grp-src-custom' || cleanGrpName === '自建节点' || cleanGrpName === '独立节点组' || cleanGrpName === '手工自建' || cleanGrpName === 'custom' || Array.from(grp.use || []).some(u => u.includes('自建') || u.includes('独立'));
      const matchedNodeTags = proxyOutbounds
        .filter(p => {
          const sName = cleanSourceOrGroupName(p._sourceName || '').toLowerCase();
          const sId = (p._sourceId || '').trim().toLowerCase();
          if (isCustomGrp) return sId === 'custom' || sId.startsWith('custom') || sName === '自建节点' || sName === '独立节点组' || sName === '手工自建' || sName === cleanGrpName;
          return sName === cleanGrpName;
        })
        .map(p => p.tag);

      if (matchedNodeTags.length > 0) {
        outboundsList = Array.from(new Set([...outboundsList, ...matchedNodeTags]));
      } else if (grp.name === '👉 手动选择' || grp.name === '♻️ 自动选择') {
        outboundsList = allNodeTags.length > 0 ? allNodeTags : ['🎯 本地直连'];
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

    // Normalize proxies: if a proxy matches any effective group by clean name (e.g. ⚡️ AI优选 -> ✨ AI优选), map to actual group name
    proxies = proxies.map(p => {
      const pClean = cleanSourceOrGroupName(p).toLowerCase();
      const matchedGrp = effectiveGroups.find(g => cleanSourceOrGroupName(g.name).toLowerCase() === pClean);
      if (matchedGrp) return matchedGrp.name;
      return p;
    });

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

export function injectUnifiedToEgern(
  doc: any,
  egernProxies: any[],
  nodes: ProxyNode[],
  proxyGroups: ProxyGroupItem[],
  rulesList: UnifiedRuleItem[],
  sources: SubscriptionSource[] = [],
  options?: { expandNodes?: boolean; baseUrl?: string; subToken?: string }
): any {
  if (!doc || typeof doc !== 'object') doc = {};

  doc.proxies = egernProxies;

  const networkSources = sources.filter(s => s.enabled && s.type !== 'custom' && s.type !== 'filter' && s.url && s.url.startsWith('http'));
  const internalSources = sources.filter(s => s.enabled && !networkSources.some(ns => ns.id === s.id));
  const hasSuboneRemoteSubscription = Boolean(options?.baseUrl && options?.subToken && !options?.expandNodes);

  const customNodes = nodes.filter(n => n.sourceId === 'custom' || !n.sourceId);
  const customNodeNames = customNodes.map(n => n.name);
  const allNodeNames = nodes.map(n => n.name);

  // 1. Build sources
  const allActiveRemoteSources: SubscriptionSource[] = [];
  if (!options?.expandNodes) {
    if (!Array.isArray(doc.sources)) {
      doc.sources = [];
    }

    networkSources.forEach(s => {
      doc.sources.push({
        name: s.name.trim(),
        type: 'http',
        url: s.url,
      });
      allActiveRemoteSources.push(s);
    });

    if (hasSuboneRemoteSubscription && options?.baseUrl && options?.subToken) {
      const cleanBaseUrl = options.baseUrl.replace(/\/+$/, '');
      const token = encodeURIComponent(options.subToken);
      internalSources.forEach(s => {
        doc.sources.push({
          name: s.name.trim(),
          type: 'http',
          url: `${cleanBaseUrl}/s/${token}/source/${encodeURIComponent(s.id)}?target=egern`,
        });
        allActiveRemoteSources.push(s);
      });
    }
  }

  const allSourceNames = allActiveRemoteSources.map(s => s.name.trim());

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

  const activeSources = options?.expandNodes ? sources.filter(s => s.enabled) : allActiveRemoteSources;
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

  const validGroupNames = new Set(effectiveGroups.map(g => g.name));
  const validNodeNames = new Set(allNodeNames);
  sources.forEach(s => {
    if (Array.isArray(s.nodes)) {
      s.nodes.forEach(n => validNodeNames.add(n.name.replace(/[=,]/g, '_')));
    }
  });

  const generatedGroups: any[] = [];
  effectiveGroups.forEach(grp => {
    if (grp.type === 'direct') {
      generatedGroups.push({ name: grp.name, type: 'select', proxies: ['DIRECT'] });
      return;
    }
    if (grp.type === 'reject') {
      generatedGroups.push({ name: grp.name, type: 'select', proxies: ['REJECT'] });
      return;
    }

    const groupType = grp.type === 'urltest' ? 'url-test' : (grp.type === 'load-balance' ? 'load-balance' : (grp.type || 'select'));

    if (grp.filter) {
      const cleanFilter = grp.filter.trim().replace(/^\(\?i\)/i, '').replace(/\(\?i\)/gi, '');
      const grpObj: any = {
        name: grp.name,
        type: groupType,
        url: grp.url || 'https://www.google.com/generate_204',
        interval: grp.interval || 300,
        tolerance: grp.tolerance || 50,
      };

      if (allSourceNames.length > 0) {
        grpObj['filter-sources'] = allSourceNames;
        grpObj.filter = cleanFilter;
      }
      if (!hasSuboneRemoteSubscription && customNodeNames.length > 0) {
        grpObj.proxies = customNodeNames;
      } else if (!grpObj['filter-sources']) {
        grpObj.proxies = ['DIRECT'];
      }
      generatedGroups.push(grpObj);
      return;
    }

    if (grp.name === '♻️ 自动选择') {
      const grpObj: any = {
        name: grp.name,
        type: 'url-test',
        url: grp.url || 'https://www.google.com/generate_204',
        interval: 300,
        tolerance: 50,
      };
      if (allSourceNames.length > 0) {
        grpObj['filter-sources'] = allSourceNames;
      } else {
        grpObj.proxies = allNodeNames.length > 0 ? allNodeNames : ['DIRECT'];
      }
      generatedGroups.push(grpObj);
      return;
    }

    if (grp.name === '👉 手动选择') {
      const grpObj: any = {
        name: grp.name,
        type: 'select',
      };
      if (allSourceNames.length > 0) {
        grpObj['filter-sources'] = allSourceNames;
      } else {
        grpObj.proxies = allNodeNames.length > 0 ? allNodeNames : ['DIRECT'];
      }
      generatedGroups.push(grpObj);
      return;
    }

    const cleanName = cleanSourceOrGroupName(grp.name).toLowerCase();
    const matchedSource = allActiveRemoteSources.find(s => {
      const sClean = cleanSourceOrGroupName(s.name).toLowerCase();
      return sClean === cleanName || s.id.toLowerCase() === cleanName;
    });

    if (matchedSource && !options?.expandNodes) {
      generatedGroups.push({
        name: grp.name,
        type: groupType,
        'filter-sources': [matchedSource.name.trim()],
      });
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
        generatedGroups.push({
          name: grp.name,
          type: 'select',
          proxies: customNodeNames.length > 0 ? customNodeNames : ['DIRECT'],
        });
        return;
      }
    }

    let proxies = grp.proxies ? [...grp.proxies] : [];
    if (!hasSuboneRemoteSubscription && grp.name === '🚀 节点选择' && customNodes.length > 0 && !proxies.includes(customTagName)) {
      proxies.unshift(customTagName);
    }

    let filterSourcesForGroup: string[] = [];

    if (grp.use && grp.use.length > 0) {
      grp.use.forEach(u => {
        const cleanU = cleanSourceOrGroupName(u).toLowerCase();
        const matchedSource = allActiveRemoteSources.find(s => {
          const sClean = cleanSourceOrGroupName(s.name).toLowerCase();
          return sClean === cleanU || s.id.trim().toLowerCase() === cleanU;
        });

        if (!options?.expandNodes && matchedSource && allSourceNames.includes(matchedSource.name.trim())) {
          filterSourcesForGroup.push(matchedSource.name.trim());
        } else {
          const isCustomU = cleanU === '自建节点' || cleanU === '独立节点组' || cleanU === 'custom' || cleanU === '手工自建' || customSources.some(cs => cleanSourceOrGroupName(cs.name).toLowerCase() === cleanU);
          if (!hasSuboneRemoteSubscription && isCustomU) {
            if (validGroupNames.has(customTagName) && !proxies.includes(customTagName)) {
              proxies.unshift(customTagName);
            }
            customNodeNames.forEach(m => {
              if (!proxies.includes(m)) proxies.push(m);
            });
          } else if (matchedSource) {
            let srcNodeList: string[] = [];
            if (Array.isArray(matchedSource.nodes) && matchedSource.nodes.length > 0) {
              srcNodeList = matchedSource.nodes.map(n => n.name.replace(/[=,]/g, '_'));
            } else {
              srcNodeList = nodes.filter(n => {
                const sName = cleanSourceOrGroupName(n.sourceName || '').toLowerCase();
                const sId = (n.sourceId || '').trim().toLowerCase();
                return sName === cleanU || sId === cleanU;
              }).map(n => n.name.replace(/[=,]/g, '_'));
            }
            srcNodeList.forEach(m => {
              if (!proxies.includes(m)) proxies.push(m);
            });
            const grpTag = formatSourceGroupTag(matchedSource);
            if (validGroupNames.has(grpTag) && !proxies.includes(grpTag)) {
              proxies.push(grpTag);
            } else if (validGroupNames.has(u) && !proxies.includes(u)) {
              proxies.push(u);
            }
          }
        }
      });
    }

    proxies = proxies.map(p => p.trim() === '🎯 本地直连' ? 'DIRECT' : p.trim()).filter(p => {
      if (!p || p === grp.name) return false;
      return validGroupNames.has(p) || validNodeNames.has(p) || p === 'DIRECT' || p === 'REJECT';
    });

    const grpObj: any = {
      name: grp.name,
      type: groupType,
    };
    if (groupType === 'url-test' || groupType === 'fallback') {
      if (grp.url) grpObj.url = grp.url;
      if (grp.interval) grpObj.interval = grp.interval;
      if (groupType === 'url-test' && grp.tolerance) grpObj.tolerance = grp.tolerance;
    }
    if (filterSourcesForGroup.length > 0) {
      grpObj['filter-sources'] = filterSourcesForGroup;
    }
    if (proxies.length > 0) {
      grpObj.proxies = proxies;
    } else if (filterSourcesForGroup.length === 0) {
      grpObj.proxies = ['DIRECT'];
    }
    generatedGroups.push(grpObj);
  });

  doc['proxy-groups'] = generatedGroups;

  // Rules
  const activeRules = rulesList.filter(r => r.enabled);
  const outRules: string[] = [];
  activeRules.forEach(r => {
    const target = resolveSafeOutbound(r.outbound, new Set(effectiveGroups.map(g => g.name)), '🚀 节点选择');
    if (r.type === 'FINAL') {
      outRules.push(`FINAL,${target}`);
    } else if (r.kind === 'remote') {
      const adapted = adaptRulesetForEgern(r);
      outRules.push(`RULE-SET,${adapted.url},${target}`);
    } else if (r.type === 'SRC-IP-CIDR') {
      const payloads = r.payload.split(/[,;\n]+/).map(p => p.trim()).filter(Boolean);
      payloads.forEach(p => {
        outRules.push(`SRC-IP-CIDR,${formatCidr(p)},${target}`);
      });
    } else {
      outRules.push(`${r.type},${r.payload.trim()},${target}`);
    }
  });

  if (!outRules.some(r => r.startsWith('FINAL,') || r.startsWith('MATCH,'))) {
    outRules.push('FINAL,DIRECT');
  }

  doc.rules = outRules;
  return doc;
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


