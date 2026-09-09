import yaml from 'js-yaml';
import { ProxyGroupItem, UnifiedRuleItem, ProxyNode, SubscriptionSource } from '../../types/index.js';
import {
  adaptRulesetForSingbox,
  adaptRulesetForMihomo,
  adaptRulesetForLoon,
  adaptRulesetForQuantumultX,
  adaptRulesetForEgern,
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

export function injectUnifiedToMihomo(
  doc: any,
  nodes: ProxyNode[],
  proxyGroups: ProxyGroupItem[],
  rulesList: UnifiedRuleItem[],
  sources: SubscriptionSource[] = []
): any {

  if (!doc || typeof doc !== 'object') doc = {};

  const networkSources = sources.filter(s => s.enabled && s.type !== 'custom' && s.url && s.url.startsWith('http'));

  const customNodes = nodes.filter(n => n.sourceId === 'custom' || !n.sourceId);
  const customNodeNames = customNodes.map(n => n.name);
  const allNodeNames = nodes.map(n => n.name);

  // 1. Inject Proxy Providers for network subscriptions
  if (networkSources.length > 0) {
    if (!doc['proxy-providers'] || typeof doc['proxy-providers'] !== 'object') {
      doc['proxy-providers'] = {};
    }
    networkSources.forEach(s => {
      const providerKey = s.name.trim();
      // Only sanitize characters truly illegal in cross-platform file paths (\ / : * ? " < > | \r \n \t)
      // Preserves Chinese, Unicode, alphanumeric characters, hyphens, and underscores safely.
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
          url: 'https://www.gstatic.com/generate_204',
          interval: 300,
        },
      };
    });
  }

  const allProviderNames = networkSources.map(s => s.name.trim());

  // 2. Build Proxy Groups
  const effectiveGroups: ProxyGroupItem[] = proxyGroups.map(g => ({
    ...g,
    proxies: g.proxies ? [...g.proxies] : undefined,
    use: g.use ? [...g.use] : undefined,
  }));

  const validGroupNames = new Set(effectiveGroups.map(g => g.name));
  const validNodeNames = new Set(allNodeNames);
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
      grpObj.url = grp.url || 'https://www.gstatic.com/generate_204';
      grpObj.interval = grp.interval || 300;
      grpObj.tolerance = grp.tolerance || 50;
    }

    // If using filter regex (e.g. for country groups)
    if (grp.filter) {
      grpObj.filter = grp.filter;
      if (allProviderNames.length > 0) {
        grpObj.use = grp.use && grp.use.length > 0 ? grp.use : allProviderNames;
      }
      if (customNodeNames.length > 0) {
        // Also include any custom nodes that might match or direct proxies
        grpObj.proxies = customNodeNames;
      } else if (!grpObj.use || grpObj.use.length === 0) {
        grpObj.proxies = ['DIRECT'];
      }
      generatedGroups.push(grpObj);
      return;
    }

    // Selector / General groups
    const explicitProxies = grp.proxies || [];
    const combinedProxies = new Set<string>(explicitProxies);

    // If user explicitly specified `use` or this is a top-level aggregator group
    if (grp.use && grp.use.length > 0) {
      const mappedUse = grp.use.map(u => {
        const direct = allProviderNames.find(p => p.toLowerCase() === u.toLowerCase());
        if (direct) return direct;
        const cleanU = u.replace(/^[⚡️\s]+/, '').trim().toLowerCase();
        const canonical = allProviderNames.find(p => {
          const cleanP = p.replace(/^[⚡️\s]+/, '').trim().toLowerCase();
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
    if (grp.name === '👉 手动选择' || (combinedProxies.size === 0 && !grpObj.use)) {
      customNodeNames.forEach(name => combinedProxies.add(name));
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
  const availableGroupNames = new Set((doc['proxy-groups'] || []).map((g: any) => g.name));
  const fallbackGroup = (doc['proxy-groups'] || []).find((g: any) => g.name === '🚀 节点选择')?.name || doc['proxy-groups']?.[0]?.name || 'DIRECT';

  const generatedRules: string[] = [];
  localRules.forEach(r => {
    const safeOutbound = resolveSafeOutbound(r.outbound, availableGroupNames, fallbackGroup);
    if (r.type === 'FINAL') {
      // final rule at the end
    } else if (r.payload.includes(',')) {
      r.payload.split(',').forEach(p => {
        const item = p.trim();
        if (item) generatedRules.push(`${r.type},${item},${safeOutbound}`);
      });
    } else {
      generatedRules.push(`${r.type},${r.payload},${safeOutbound}`);
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

  doc.rules = [...existingPreRules, ...generatedRules, finalMatch];

  return doc;
}


export function injectUnifiedToSingbox(
  doc: any,
  proxyOutbounds: any[],
  proxyGroups: ProxyGroupItem[],
  rulesList: UnifiedRuleItem[]
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
  const existingCleanNames = new Set(effectiveGroups.map(g => g.name.toLowerCase().replace(/^[⚡️🚀👉♻️🌐📹✈️🤖🇨🇳🇭🇰🇯🇵🇺🇸\s]+/, '').trim()));

  // Discover unique subscription sources from proxyOutbounds
  const discoveredSources = new Map<string, { groupTag: string; sourceName: string; isCustom: boolean }>();
  proxyOutbounds.forEach(p => {
    const sName = (p._sourceName || '').trim();
    const sId = (p._sourceId || '').trim();
    const isCustom = sId === 'custom';
    const key = isCustom ? 'custom' : sName.toLowerCase();

    if (!discoveredSources.has(key)) {
      const sourceName = isCustom ? '独立节点组' : sName;
      const groupTag = sourceName.startsWith('⚡️') ? sourceName : `⚡️ ${sourceName}`;
      discoveredSources.set(key, {
        groupTag,
        sourceName,
        isCustom,
      });
    }
  });

  // Automatically add dedicated URLTest group for any subscription source that does not yet have a group
  discoveredSources.forEach(info => {
    const cleanName = info.sourceName.toLowerCase();
    const hasExisting = effectiveGroups.some(g => {
      const gClean = g.name.toLowerCase().replace(/^[⚡️\s]+/, '').trim();
      return gClean === cleanName || g.name.toLowerCase() === info.groupTag.toLowerCase();
    });

    if (!hasExisting) {
      const srcGroup: ProxyGroupItem = {
        id: `grp-src-${info.sourceName}`,
        name: info.groupTag,
        type: 'urltest',
        use: [info.sourceName],
        tolerance: 50,
        interval: 300,
        url: 'https://www.gstatic.com/generate_204',
      };
      effectiveGroups.push(srcGroup);
      existingGroupNames.add(info.groupTag.toLowerCase());
      existingCleanNames.add(cleanName);
    }
  });

  // Ensure '🚀 节点选择' references all active source groups (only if that source group exists in effectiveGroups)
  const mainSelector = effectiveGroups.find(g => g.name === '🚀 节点选择');
  if (mainSelector && mainSelector.proxies) {
    discoveredSources.forEach(info => {
      if (effectiveGroups.some(g => g.name === info.groupTag) && !mainSelector.proxies!.includes(info.groupTag)) {
        mainSelector.proxies!.unshift(info.groupTag);
      }
    });
  }

  const validGroupTags = new Set(effectiveGroups.map(g => g.name));
  const validNodeTags = new Set(allNodeTags);
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

    // Support use: [ "MESL" ] or [ "独立节点组" ] by matching exact source names
    if (grp.use && grp.use.length > 0) {
      const useNormalized = new Set(
        grp.use.map(u => u.trim().toLowerCase().replace(/^[⚡️\s]+/, ''))
      );
      const matchedNodeTags = proxyOutbounds
        .filter(p => {
          const sName = (p._sourceName || '').trim().toLowerCase().replace(/^[⚡️\s]+/, '');
          const sId = (p._sourceId || '').trim().toLowerCase();
          return useNormalized.has(sName) || useNormalized.has(sId) || (sId === 'custom' && (useNormalized.has('独立节点组') || useNormalized.has('手工自建') || useNormalized.has('custom')));
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
      const cleanGrpName = grp.name.trim().toLowerCase().replace(/^[⚡️\s]+/, '');
      const isCustomGrp = cleanGrpName === '独立节点组' || cleanGrpName === '手工自建' || cleanGrpName === 'custom';
      const matchedNodeTags = proxyOutbounds
        .filter(p => {
          const sName = (p._sourceName || '').trim().toLowerCase().replace(/^[⚡️\s]+/, '');
          const sId = (p._sourceId || '').trim().toLowerCase();
          if (isCustomGrp) return sId === 'custom' || sName === '独立节点组' || sName === '手工自建';
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
      };
      if (grp.url) urltestOutbound.url = grp.url;
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
  const hasDirect = groupOutbounds.some(g => g.tag === '🎯 本地直连' || g.type === 'direct') ||
                    customTemplateOutbounds.some(g => g.tag === '🎯 本地直连' || g.type === 'direct');
  if (!hasDirect) {
    groupOutbounds.push({
      tag: '🎯 本地直连',
      type: 'direct',
    });
  }

  // Ensure REJECT always exists
  const hasReject = groupOutbounds.some(g => g.tag === 'REJECT' || g.type === 'block') ||
                    customTemplateOutbounds.some(g => g.tag === 'REJECT' || g.type === 'block');
  if (!hasReject) {
    groupOutbounds.push({
      tag: 'REJECT',
      type: 'block',
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
        'gstatic.com',
        'gvt1.com',
        'cp.cloudflare.com',
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

  doc.route.rules = [...baseRules, ...generatedRouteRules];

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
  options?: { expandNodes?: boolean }
): string {
  const expandNodes = Boolean(options?.expandNodes);
  const lines = templateMcf.split('\n');
  const activeRules = rulesList.filter(r => r.enabled);
  const remoteRules = activeRules.filter(r => r.kind === 'remote');
  const localRules = activeRules.filter(r => r.kind === 'local');

  const effectiveGroups: ProxyGroupItem[] = proxyGroups.map(g => ({
    ...g,
    proxies: g.proxies ? [...g.proxies] : undefined,
    use: g.use ? [...g.use] : undefined,
  }));

  const networkSources = sources.filter(s => s.enabled && s.type !== 'custom' && s.url && s.url.startsWith('http'));
  const customNodes = nodes.filter(n => n.sourceId === 'custom' || !n.sourceId);
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
  if (!expandNodes) {
    networkSources.forEach(s => {
      const tag = s.name.replace(/[=,]/g, '_').trim();
      remoteProxyLines.push(`${tag} = ${s.url}, udp=true, fast-open=default, skip-cert-verify=true, enabled=true`);
    });
  }

  // 2. Build [Remote Filter] (Regex / region filters for subscription nodes)
  const filterMap = new Map<string, string>();
  if (!expandNodes) {
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
  networkSources.forEach(s => {
    const tag = s.name.replace(/[=,]/g, '_').trim();
    sourceGroupTags.push(tag.startsWith('⚡️') ? tag : `⚡️ ${tag}`);
  });
  if (customNodes.length > 0) {
    sourceGroupTags.push('⚡️ 独立节点组');
  }

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
      if (expandNodes) {
        const cleanFilter = grp.filter.trim().replace(/^\(\?i\)/i, '').replace(/\(\?i\)/gi, '');
        let matched: string[] = [];
        try {
          const reg = new RegExp(cleanFilter, 'i');
          matched = nodes.filter(n => reg.test(n.name)).map(n => n.name.replace(/[=,]/g, '_'));
        } catch {
          matched = [];
        }
        const members = matched.length > 0 ? matched : ['DIRECT'];
        groupLines.push(`${grp.name} = ${groupType}, ${members.join(', ')}, url=https://www.gstatic.com/generate_204, interval=300, tolerance=${grp.tolerance || 50}`);
      } else {
        const filterTag = getLoonFilterTag(grp);
        groupLines.push(`${grp.name} = ${groupType}, ${filterTag}, url=https://www.gstatic.com/generate_204, interval=300, tolerance=${grp.tolerance || 50}`);
      }
      return;
    }

    if (grp.name === '♻️ 自动选择') {
      const members = expandNodes
        ? (allNodeNames.length > 0 ? allNodeNames : ['DIRECT'])
        : ['全部节点', ...customNodeNames];
      groupLines.push(`${grp.name} = url-test, ${members.join(', ')}, url=https://www.gstatic.com/generate_204, interval=300, tolerance=${grp.tolerance || 50}`);
      return;
    }

    if (grp.name === '👉 手动选择') {
      const members = expandNodes
        ? (allNodeNames.length > 0 ? allNodeNames : ['DIRECT'])
        : ['全部节点', ...customNodeNames];
      groupLines.push(`${grp.name} = select, ${members.join(', ')}`);
      return;
    }

    // Match dedicated source group (e.g. ⚡️ MESL)
    const cleanName = grp.name.replace(/^[⚡️\s]+/, '').trim().toLowerCase();
    const matchedSource = networkSources.find(s => s.name.replace(/^[⚡️\s]+/, '').trim().toLowerCase() === cleanName);
    if (matchedSource) {
      if (expandNodes) {
        const srcNodes = nodes
          .filter(n => n.sourceName === matchedSource.name || n.sourceId === matchedSource.id)
          .map(n => n.name.replace(/[=,]/g, '_'));
        const members = srcNodes.length > 0 ? srcNodes : ['DIRECT'];
        if (groupType === 'url-test') {
          groupLines.push(`${grp.name} = url-test, ${members.join(', ')}, url=https://www.gstatic.com/generate_204, interval=300, tolerance=${grp.tolerance || 50}`);
        } else {
          groupLines.push(`${grp.name} = select, ${members.join(', ')}`);
        }
      } else {
        const sTag = matchedSource.name.replace(/[=,]/g, '_').trim();
        if (groupType === 'url-test') {
          groupLines.push(`${grp.name} = url-test, ${sTag}, url=https://www.gstatic.com/generate_204, interval=300, tolerance=${grp.tolerance || 50}`);
        } else {
          groupLines.push(`${grp.name} = select, ${sTag}`);
        }
      }

      return;
    }

    if (cleanName === '独立节点组' || cleanName === 'custom' || cleanName === '手工自建') {
      const members = customNodeNames.length > 0 ? customNodeNames : ['DIRECT'];
      groupLines.push(`${grp.name} = select, ${members.join(', ')}`);
      return;
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

    // Support grp.use: ['自建'] or ['⚡️ 自建'] or ['MESL']
    if (grp.use && grp.use.length > 0) {
      grp.use.forEach(u => {
        const cleanU = u.replace(/^[⚡️\s]+/, '').trim().toLowerCase();
        if (expandNodes) {
          const matchedNodes = nodes.filter(n => {
            const sName = (n.sourceName || '').trim().toLowerCase().replace(/^[⚡️\s]+/, '');
            const sId = (n.sourceId || '').trim().toLowerCase();
            return sName === cleanU || sId === cleanU || (sId === 'custom' && (cleanU === '独立节点组' || cleanU === '手工自建'));
          }).map(n => n.name.replace(/[=,]/g, '_'));
          matchedNodes.forEach(m => {
            if (!proxies.includes(m)) proxies.unshift(m);
          });
        } else {
          const matched = sourceGroupTags.find(st => st.replace(/^[⚡️\s]+/, '').trim().toLowerCase() === cleanU);
          const tagToAdd = matched || (u.startsWith('⚡️') ? u : `⚡️ ${u}`);
          if (effectiveGroups.some(g => g.name === tagToAdd) && !proxies.includes(tagToAdd)) {
            proxies.unshift(tagToAdd);
          }
        }
      });
    }

    // Prune dangling references in Loon
    const validGroupNames = new Set(effectiveGroups.map(g => g.name));
    const validNodeNames = new Set(nodes.map(n => n.name.replace(/[=,]/g, '_')));
    const validSubTags = new Set(sourceGroupTags.concat(networkSources.map(s => s.name.replace(/[=,]/g, '_'))));
    const isBuiltinLoonProxy = (t: string) => {
      const upper = t.trim().toUpperCase();
      return upper === 'DIRECT' || upper === 'REJECT' || upper === '全部节点' || t.trim() === '🎯 本地直连';
    };

    proxies = proxies.filter(p => {
      if (!p || p.trim() === grp.name) return false;
      const t = p.trim();
      return validGroupNames.has(t) || validNodeNames.has(t) || validSubTags.has(t) || isBuiltinLoonProxy(t);
    });

    if (proxies.length === 0) {
      proxies = ['DIRECT'];
    }

    groupLines.push(`${grp.name} = ${groupType}, ${proxies.join(', ')}`);
  });

  // Ensure dedicated source groups exist if not yet added
  networkSources.forEach(s => {
    const sTag = s.name.replace(/[=,]/g, '_').trim();
    const grpTag = sTag.startsWith('⚡️') ? sTag : `⚡️ ${sTag}`;
    if (!existingGroupNames.has(grpTag.toLowerCase()) && !existingGroupNames.has(sTag.toLowerCase())) {
      if (expandNodes) {
        const srcNodes = nodes
          .filter(n => n.sourceName === s.name || n.sourceId === s.id)
          .map(n => n.name.replace(/[=,]/g, '_'));
        const members = srcNodes.length > 0 ? srcNodes : ['DIRECT'];
        groupLines.push(`${grpTag} = url-test, ${members.join(', ')}, url=https://www.gstatic.com/generate_204, interval=300, tolerance=50`);
      } else {
        groupLines.push(`${grpTag} = url-test, ${sTag}, url=https://www.gstatic.com/generate_204, interval=300, tolerance=50`);
      }
    }
  });

  if (customNodes.length > 0 && !existingGroupNames.has('⚡️ 独立节点组') && !existingGroupNames.has('独立节点组')) {
    groupLines.push(`⚡️ 独立节点组 = select, ${customNodeNames.join(', ')}`);
  }

  // 4. Build [Rule]
  const availableGroupNames = new Set(proxyGroups.map(g => g.name));
  const fallbackGroup = proxyGroups.find(g => g.name === '🚀 节点选择')?.name || proxyGroups[0]?.name || 'DIRECT';

  const localRuleLines = localRules.flatMap(r => {
    const payloads = r.payload.split(/[,;\n]+/).map(p => p.trim()).filter(Boolean);
    const safeOutbound = resolveSafeOutbound(r.outbound, availableGroupNames, fallbackGroup);
    return payloads.map(p => `${r.type},${p},${safeOutbound}`);
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
  options?: { expandNodes?: boolean }
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

  const networkSources = sources.filter(s => s.enabled && s.type !== 'custom' && s.url && s.url.startsWith('http'));
  const customNodes = nodes.filter(n => n.sourceId === 'custom' || !n.sourceId);
  const qxSupportedNodes = nodes.filter(isSupportedByQuantumultX);
  const qxSupportedCustomNodes = customNodes.filter(isSupportedByQuantumultX);
  const customNodeNames = qxSupportedCustomNodes.map(n => n.name.replace(/[=,]/g, '_'));
  const allNodeNames = qxSupportedNodes.map(n => n.name.replace(/[=,]/g, '_'));

  // 1. Build [server_remote]
  const serverRemoteLines: string[] = [];
  if (!expandNodes) {
    networkSources.forEach(s => {
      const tag = s.name.replace(/[=,]/g, '_').trim();
      serverRemoteLines.push(`${s.url}, tag=${tag}, update-interval=24, opt-parser=true`);
    });
  }

  // 2. Build [policy]
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
        : ['direct', ...customNodeNames];
      groupLines.push(`static=${grp.name}, ${members.join(', ')}`);
      return;
    }

    // Dedicated custom node group
    const cleanName = grp.name.replace(/^[⚡️\s]+/, '').trim().toLowerCase();
    if (cleanName === '独立节点组' || cleanName === 'custom' || cleanName === '手工自建') {
      const members = customNodeNames.length > 0 ? customNodeNames : ['direct'];
      groupLines.push(`static=${grp.name}, ${members.join(', ')}`);
      return;
    }

    // Standard selector group
    let proxies = grp.proxies ? [...grp.proxies] : [];

    if (grp.name === '🚀 节点选择' && customNodes.length > 0 && !proxies.includes('⚡️ 独立节点组')) {
      proxies.unshift('⚡️ 独立节点组');
    }

    if (grp.use && grp.use.length > 0) {
      grp.use.forEach(u => {
        const cleanU = u.replace(/^[⚡️\s]+/, '').trim().toLowerCase();
        if (cleanU === '独立节点组' || cleanU === 'custom' || cleanU === '手工自建') {
          if (expandNodes) {
            customNodeNames.forEach(m => {
              if (!proxies.includes(m)) proxies.push(m);
            });
          } else {
            if (!proxies.includes('⚡️ 独立节点组')) proxies.unshift('⚡️ 独立节点组');
          }
        }
      });
    }

    const validGroupNames = new Set(effectiveGroups.map(g => g.name));
    const validNodeNames = new Set(allNodeNames);
    proxies = proxies.map(p => {
      const u = p.trim().toUpperCase();
      if (u === 'DIRECT' || p.trim() === '🎯 本地直连') return 'direct';
      if (u === 'REJECT') return 'reject';
      return p.trim();
    }).filter(p => {
      if (!p || p === grp.name) return false;
      return validGroupNames.has(p) || validNodeNames.has(p) || p === 'direct' || p === 'reject';
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
  options?: { expandNodes?: boolean }
): any {
  if (!doc || typeof doc !== 'object') doc = {};

  doc.proxies = egernProxies;

  const customNodes = nodes.filter(n => n.sourceId === 'custom' || !n.sourceId);
  const customNodeNames = customNodes.map(n => n.name);
  const allNodeNames = nodes.map(n => n.name);

  const effectiveGroups: ProxyGroupItem[] = proxyGroups.map(g => ({
    ...g,
    proxies: g.proxies ? [...g.proxies] : undefined,
    use: g.use ? [...g.use] : undefined,
  }));

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
      let matched: string[] = [];
      try {
        const reg = new RegExp(cleanFilter, 'i');
        matched = allNodeNames.filter(n => reg.test(n));
      } catch {
        matched = [];
      }
      const proxies = matched.length > 0 ? matched : ['DIRECT'];
      generatedGroups.push({
        name: grp.name,
        type: groupType,
        url: grp.url || 'https://www.gstatic.com/generate_204',
        interval: grp.interval || 300,
        tolerance: grp.tolerance || 50,
        proxies,
      });
      return;
    }

    if (grp.name === '♻️ 自动选择') {
      generatedGroups.push({
        name: grp.name,
        type: 'url-test',
        url: grp.url || 'https://www.gstatic.com/generate_204',
        interval: 300,
        tolerance: 50,
        proxies: allNodeNames.length > 0 ? allNodeNames : ['DIRECT'],
      });
      return;
    }

    if (grp.name === '👉 手动选择') {
      generatedGroups.push({
        name: grp.name,
        type: 'select',
        proxies: allNodeNames.length > 0 ? allNodeNames : ['DIRECT'],
      });
      return;
    }

    const cleanName = grp.name.replace(/^[⚡️\s]+/, '').trim().toLowerCase();
    if (cleanName === '独立节点组' || cleanName === 'custom' || cleanName === '手工自建') {
      generatedGroups.push({
        name: grp.name,
        type: 'select',
        proxies: customNodeNames.length > 0 ? customNodeNames : ['DIRECT'],
      });
      return;
    }

    let proxies = grp.proxies ? [...grp.proxies] : [];
    if (grp.name === '🚀 节点选择' && customNodes.length > 0 && !proxies.includes('⚡️ 独立节点组')) {
      proxies.unshift('⚡️ 独立节点组');
    }

    if (grp.use && grp.use.length > 0) {
      grp.use.forEach(u => {
        const cleanU = u.replace(/^[⚡️\s]+/, '').trim().toLowerCase();
        if (cleanU === '独立节点组' || cleanU === 'custom' || cleanU === '手工自建') {
          if (options?.expandNodes) {
            customNodeNames.forEach(m => {
              if (!proxies.includes(m)) proxies.push(m);
            });
          } else {
            if (!proxies.includes('⚡️ 独立节点组')) proxies.unshift('⚡️ 独立节点组');
          }
        }
      });
    }

    const validGroupNames = new Set(effectiveGroups.map(g => g.name));
    const validNodeNames = new Set(allNodeNames);
    proxies = proxies.map(p => p.trim() === '🎯 本地直连' ? 'DIRECT' : p.trim()).filter(p => {
      if (!p || p === grp.name) return false;
      return validGroupNames.has(p) || validNodeNames.has(p) || p === 'DIRECT' || p === 'REJECT';
    });

    if (proxies.length === 0) proxies = ['DIRECT'];

    generatedGroups.push({
      name: grp.name,
      type: groupType,
      proxies,
    });
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

