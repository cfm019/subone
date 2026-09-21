import yaml from 'js-yaml';
import { ProxyNode, ProxyGroupItem, UnifiedRuleItem, SubscriptionSource } from '../../types/index.js';
import { adaptRulesetForEgern, formatRuleTag } from './ruleset-adapter.js';
import { resolveSafeOutbound, formatCidr, cleanSourceOrGroupName, formatSourceGroupTag } from './common.js';
import { nodeToMihomoProxy } from './mihomo-generator.js';

export function nodeToEgernProxy(node: ProxyNode): any {
  // Egern uses the modern proxy specification compatible with Mihomo's proxy object schema
  return nodeToMihomoProxy(node);
}

export interface EgernGeneratorOptions {
  expandNodes?: boolean;
  baseUrl?: string;
  subToken?: string;
}

export function generateEgernConfig(
  templateYaml: string,
  nodes: ProxyNode[],
  proxyGroups: ProxyGroupItem[] = [],
  rulesList: UnifiedRuleItem[] = [],
  sources: SubscriptionSource[] = [],
  options?: EgernGeneratorOptions
): string {
  const expandNodes = Boolean(options?.expandNodes);
  const hasSuboneRemoteSubscription = Boolean(options?.baseUrl && options?.subToken && !expandNodes);
  let doc: any;
  try {
    doc = yaml.load(templateYaml);
  } catch (e) {
    doc = {};
  }

  if (!doc || typeof doc !== 'object') {
    doc = {};
  }

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
    // 订阅化模式：由 sources 接管自建源
    nodesToWrite = [];
  }

  const egernProxies = nodesToWrite.map(nodeToEgernProxy);

  doc = injectUnifiedToEgern(doc, egernProxies, nodes, proxyGroups, rulesList, sources, options);

  return yaml.dump(doc, { indent: 2, lineWidth: -1 });
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
