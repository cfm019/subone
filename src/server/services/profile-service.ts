import {
  AppConfig,
  ProxyNode,
  ConfigTemplate,
  ProxyGroupItem,
  UnifiedRuleItem,
  SubscriptionSource,
  SubscriptionProfile,
} from '../../types/index.js';
import { ClientType } from '../../core/parser/ua-detector.js';
import { formatSourceGroupTag, cleanSourceOrGroupName } from '../../core/generators/common.js';
import { applyExtractionRules } from '../../core/filter/extractor.js';
import { fetchAndParseSource } from '../../core/parser/fetcher.js';
import { saveConfig } from '../../storage/db.js';
import {
  getAppConfig,
  saveAppConfig,
  getGlobalNodesCache,
  setGlobalNodesCache,
} from '../context.js';

export function ensureCustomSource(config: AppConfig): SubscriptionSource {
  // Remove demo sources if any
  config.sources = (config.sources || []).filter(s => s.id !== 'src-demo-1' && !s.name.includes('示例订阅源'));

  let customSrc = config.sources.find(s => s.id === 'custom' || s.type === 'custom');
  if (!customSrc) {
    customSrc = {
      id: 'custom',
      name: '独立节点组',
      url: '',
      enabled: true,
      type: 'custom',
      nodeCount: 0,
      nodes: [],
    };
    config.sources.unshift(customSrc);
  } else {
    if (!customSrc.name) customSrc.name = '独立节点组';
    customSrc.type = 'custom';
    if (!customSrc.nodes) customSrc.nodes = [];
    customSrc.nodeCount = customSrc.nodes.length;
  }
  return customSrc;
}

export function computeFilterSourceNodes(
  filterSource: SubscriptionSource,
  availablePhysicalNodes: ProxyNode[]
): ProxyNode[] {
  const cfg = filterSource.filterConfig || {};
  let candidates = availablePhysicalNodes;

  // 1. Filter by parentSourceIds if specified
  if (Array.isArray(cfg.parentSourceIds) && cfg.parentSourceIds.length > 0 && !cfg.parentSourceIds.includes('ALL')) {
    const parentSet = new Set(cfg.parentSourceIds);
    candidates = candidates.filter(n => parentSet.has(n.sourceId || 'custom'));
  }

  // 2. Include regex / keyword
  if (cfg.includeRegex && cfg.includeRegex.trim()) {
    try {
      const reg = new RegExp(cfg.includeRegex.trim(), 'i');
      candidates = candidates.filter(n => reg.test(n.name));
    } catch (e: any) {
      console.warn(`[FilterSource] Invalid includeRegex in source ${filterSource.name}:`, e.message);
    }
  }

  // 3. Exclude regex / keyword
  if (cfg.excludeRegex && cfg.excludeRegex.trim()) {
    try {
      const reg = new RegExp(cfg.excludeRegex.trim(), 'i');
      candidates = candidates.filter(n => !reg.test(n.name));
    } catch (e: any) {
      console.warn(`[FilterSource] Invalid excludeRegex in source ${filterSource.name}:`, e.message);
    }
  }

  return candidates;
}

export function collectNodesFromSources(config: AppConfig): ProxyNode[] {
  ensureCustomSource(config);
  const physicalNodes: ProxyNode[] = [];

  // Pass 1: Collect all raw nodes from non-filter physical sources
  config.sources.forEach(s => {
    if (s.type !== 'filter' && s.enabled && s.nodes && s.nodes.length > 0) {
      s.nodes.forEach(n => {
        n.sourceName = s.name;
        n.sourceId = s.id;
      });
      physicalNodes.push(...s.nodes);
    }
  });

  // Pass 2: Recompute nodes for all filter sources
  config.sources.forEach(s => {
    if (s.type === 'filter') {
      if (s.enabled) {
        const derived = computeFilterSourceNodes(s, physicalNodes);
        s.nodes = derived;
        s.nodeCount = derived.length;
        s.lastUpdated = new Date().toISOString();
      } else {
        s.nodes = [];
        s.nodeCount = 0;
      }
    }
  });

  return physicalNodes;
}

export function ensureCustomProxyGroup(config: AppConfig): boolean {
  const customSrc = config.sources?.find(s => s.id === 'custom' || s.type === 'custom');
  if (!customSrc) return false;

  if (customSrc.name === '自建节点' || customSrc.name === '独立节点') {
    customSrc.name = '独立节点组';
  }
  const srcName = cleanSourceOrGroupName(customSrc.name || '独立节点组');
  const targetTag = formatSourceGroupTag(customSrc);

  // Find any existing group associated with this custom source
  const existingGroup = config.proxyGroups.find(g => 
    g.id === 'grp-src-custom' ||
    g.id === `grp-src-${customSrc.id}` ||
    cleanSourceOrGroupName(g.name).toLowerCase() === srcName.toLowerCase() ||
    cleanSourceOrGroupName(g.name).toLowerCase() === '自建节点' ||
    cleanSourceOrGroupName(g.name).toLowerCase() === '独立节点' ||
    cleanSourceOrGroupName(g.name).toLowerCase() === '独立节点组'
  );

  if (existingGroup) {
    let changed = false;
    const oldName = existingGroup.name;
    if (existingGroup.name !== targetTag || !existingGroup.use || existingGroup.use[0] !== srcName || existingGroup.id !== 'grp-src-custom') {
      existingGroup.id = 'grp-src-custom';
      existingGroup.name = targetTag;
      existingGroup.use = [srcName];
      existingGroup.type = 'select';
      changed = true;
    }

    // Remove any stale legacy duplicate groups (e.g. old "⚡️ 自建节点", "⚡️ 独立节点组")
    const prevLen = config.proxyGroups.length;
    config.proxyGroups = config.proxyGroups.filter(g => {
      if (g === existingGroup) return true;
      const c = cleanSourceOrGroupName(g.name).toLowerCase();
      if (c === '自建节点' || c === '独立节点' || c === '独立节点组') return false;
      return true;
    });
    if (config.proxyGroups.length !== prevLen) changed = true;

    // Update references in other groups (e.g. 🚀 节点选择, 🤖 AI 服务, etc.)
    config.proxyGroups.forEach(grp => {
      if (grp !== existingGroup) {
        if (grp.use) {
          const newUse = grp.use.map(u => {
            const c = cleanSourceOrGroupName(u).toLowerCase();
            return c === '自建节点' || c === '独立节点' || c === '独立节点组' || u === oldName ? srcName : u;
          });
          if (JSON.stringify(newUse) !== JSON.stringify(grp.use)) {
            grp.use = newUse;
            changed = true;
          }
        }
        if (grp.proxies) {
          const newProxies = grp.proxies.map(p => {
            const c = cleanSourceOrGroupName(p).toLowerCase();
            return c === '自建节点' || c === '独立节点' || c === '独立节点组' || p === oldName ? targetTag : p;
          });
          if (JSON.stringify(newProxies) !== JSON.stringify(grp.proxies)) {
            grp.proxies = newProxies;
            changed = true;
          }
        }
      }
    });

    return changed;
  }

  // If no existing group, only create one if there are nodes
  if (!customSrc.nodes || customSrc.nodes.length === 0) return false;

  const customGroup: ProxyGroupItem = {
    id: 'grp-src-custom',
    name: targetTag,
    type: 'select',
    use: [srcName],
  };
  config.proxyGroups.push(customGroup);

  const mainSelector = config.proxyGroups.find(g => g.name === '🚀 节点选择');
  if (mainSelector) {
    if (!mainSelector.proxies) mainSelector.proxies = [];
    if (!mainSelector.proxies.includes(targetTag)) {
      mainSelector.proxies.unshift(targetTag);
    }
  }
  return true;
}

export function ensureAllSourceProxyGroups(config: AppConfig): boolean {
  let changed = false;
  const enabledSources = (config.sources || []).filter(s => s.enabled);
  const nameMigrationMap = new Map<string, string>();

  enabledSources.forEach(s => {
    const sClean = cleanSourceOrGroupName(s.name || '');
    if (!sClean) return;
    const targetGroupTag = formatSourceGroupTag(s);
    const targetGroupId = s.id === 'custom' ? 'grp-src-custom' : `grp-src-${s.id}`;

    const existingGroup = config.proxyGroups.find(g => {
      if (g.id === targetGroupId) return true;
      if (s.id === 'custom' && g.id === 'grp-src-custom') return true;
      const gClean = cleanSourceOrGroupName(g.name).toLowerCase();
      return gClean === sClean.toLowerCase();
    });

    if (existingGroup) {
      if (existingGroup.name !== targetGroupTag) {
        nameMigrationMap.set(existingGroup.name, targetGroupTag);
        existingGroup.name = targetGroupTag;
        changed = true;
      }
      if (existingGroup.id !== targetGroupId) {
        existingGroup.id = targetGroupId;
        changed = true;
      }
      if (!existingGroup.use || existingGroup.use[0] !== sClean) {
        existingGroup.use = [sClean];
        changed = true;
      }
    } else {
      const newGroup: ProxyGroupItem = {
        id: targetGroupId,
        name: targetGroupTag,
        type: s.type === 'custom' ? 'select' : 'urltest',
        use: [sClean],
        tolerance: 50,
        interval: 300,
        url: 'https://www.google.com/generate_204',
      };
      config.proxyGroups.push(newGroup);
      changed = true;
    }
  });

  // Migrate references in all proxyGroups
  enabledSources.forEach(s => {
    const targetTag = formatSourceGroupTag(s);
    nameMigrationMap.set(`⚡️ ${s.name}`, targetTag);
    nameMigrationMap.set(`✨ ${s.name}`, targetTag);
    nameMigrationMap.set(`🖥️ ${s.name}`, targetTag);
    nameMigrationMap.set(s.name, targetTag);
  });

  config.proxyGroups.forEach(grp => {
    if (grp.proxies) {
      let pChanged = false;
      const newProxies = grp.proxies.map(p => {
        const matchedSource = enabledSources.find(s => {
          const sClean = cleanSourceOrGroupName(s.name).toLowerCase();
          return cleanSourceOrGroupName(p).toLowerCase() === sClean;
        });
        if (matchedSource) {
          const canonicalTag = formatSourceGroupTag(matchedSource);
          if (p !== canonicalTag) {
            pChanged = true;
            return canonicalTag;
          }
        }
        return p;
      });
      if (pChanged) {
        grp.proxies = newProxies;
        changed = true;
      }
    }
  });

  return changed;
}

export async function refreshAllSources(config: AppConfig): Promise<ProxyNode[]> {
  const allNodes: ProxyNode[] = [];
  const enabledSources = config.sources.filter(s => s.enabled);

  for (const source of enabledSources) {
    if (source.type === 'custom' || !source.url || !source.url.startsWith('http')) {
      if (source.nodes && source.nodes.length > 0) {
        allNodes.push(...source.nodes);
      }
      continue;
    }

    try {
      console.log(`[Fetcher] Refreshing source: ${source.name} (${source.url})`);
      const nodes = await fetchAndParseSource(source, config.countryRules);
      source.lastUpdated = new Date().toISOString();
      source.nodeCount = nodes.length;
      source.nodes = nodes;
      allNodes.push(...nodes);
      console.log(`[Fetcher] Successfully fetched ${nodes.length} nodes from ${source.name}`);
    } catch (err: any) {
      console.error(`[Fetcher] Error fetching source ${source.name}:`, err.message || err);
      if (source.nodes && source.nodes.length > 0) {
        allNodes.push(...source.nodes);
      }
    }
  }

  saveConfig(config);
  setGlobalNodesCache(allNodes);
  return allNodes;
}

export async function getEffectiveNodes(): Promise<ProxyNode[]> {
  const appConfig = getAppConfig();
  let cache = getGlobalNodesCache();
  if (cache.length === 0) {
    cache = collectNodesFromSources(appConfig);
    setGlobalNodesCache(cache);
  }
  return applyExtractionRules(cache, appConfig.rules);
}

export async function getEffectiveNodesForProfile(profile: SubscriptionProfile): Promise<ProxyNode[]> {
  const appConfig = getAppConfig();
  const allNodes = await getEffectiveNodes();
  const filter = profile.nodeFilter || { mode: 'all' };

  let filtered: ProxyNode[] = [];

  // 1. Group / Source selection (Primary mode)
  if (Array.isArray(filter.sourceIds) && filter.sourceIds.length > 0) {
    const selectedSourceIds = new Set(filter.sourceIds);
    const collectedMap = new Map<string, ProxyNode>();
    appConfig.sources.forEach(s => {
      if (selectedSourceIds.has(s.id) && s.enabled && s.nodes) {
        s.nodes.forEach(n => {
          collectedMap.set(n.id, n);
        });
      }
    });
    filtered = Array.from(collectedMap.values());
  } else {
    // If no sourceIds specified, default to all available nodes
    filtered = allNodes;
  }

  // 2. Global extraction rules apply
  filtered = applyExtractionRules(filtered, appConfig.rules);

  // 3. Optional Country filter (if specified in profile)
  if (Array.isArray(filter.countryCodes) && filter.countryCodes.length > 0) {
    const countrySet = new Set(filter.countryCodes.map(c => c.toUpperCase()));
    filtered = filtered.filter(n => n.countryCode && countrySet.has(n.countryCode.toUpperCase()));
  }

  // 4. Optional Keywords filter
  if (Array.isArray(filter.includeKeywords) && filter.includeKeywords.length > 0) {
    filtered = filtered.filter(n => filter.includeKeywords!.some(kw => n.name.toLowerCase().includes(kw.toLowerCase())));
  }
  if (Array.isArray(filter.excludeKeywords) && filter.excludeKeywords.length > 0) {
    filtered = filtered.filter(n => !filter.excludeKeywords!.some(kw => n.name.toLowerCase().includes(kw.toLowerCase())));
  }

  // 5. Optional Regex filter
  if (filter.includeRegex && filter.includeRegex.trim()) {
    try {
      const reg = new RegExp(filter.includeRegex.trim(), 'i');
      filtered = filtered.filter(n => reg.test(n.name));
    } catch {}
  }
  if (filter.excludeRegex && filter.excludeRegex.trim()) {
    try {
      const reg = new RegExp(filter.excludeRegex.trim(), 'i');
      filtered = filtered.filter(n => !reg.test(n.name));
    } catch {}
  }

  // 6. Backward compatibility: if legacy selectedNodeIds is explicitly configured and sourceIds was not specified
  if (
    (!filter.sourceIds || filter.sourceIds.length === 0) &&
    Array.isArray(filter.selectedNodeIds) &&
    filter.selectedNodeIds.length > 0
  ) {
    const selSet = new Set(filter.selectedNodeIds);
    filtered = filtered.filter(n => selSet.has(n.id));
  }

  return filtered;
}

export function getEffectiveGroupsForProfile(profile: SubscriptionProfile, effectiveNodes?: ProxyNode[]): ProxyGroupItem[] {
  const appConfig = getAppConfig();
  let configChanged = false;
  if (ensureCustomProxyGroup(appConfig)) configChanged = true;
  if (ensureAllSourceProxyGroups(appConfig)) configChanged = true;
  if (configChanged) {
    saveAppConfig();
  }

  let groups: ProxyGroupItem[];
  if (Array.isArray(profile.selectedGroupIds) && profile.selectedGroupIds.length > 0) {
    const set = new Set(profile.selectedGroupIds);
    groups = appConfig.proxyGroups.filter(g => set.has(g.id));

    // Recursively ensure any groups referenced by selected groups in proxies list are also included
    const includedGroupNames = new Set(groups.map(g => g.name));
    let added = true;
    while (added) {
      added = false;
      const referencedGroupNames = new Set<string>();
      groups.forEach(g => {
        if (g.proxies) {
          g.proxies.forEach(p => {
            if (!includedGroupNames.has(p)) {
              referencedGroupNames.add(p);
            }
          });
        }
      });

      if (referencedGroupNames.size > 0) {
        const additionalGroups = appConfig.proxyGroups.filter(g =>
          referencedGroupNames.has(g.name) ||
          Array.from(referencedGroupNames).some(r => cleanSourceOrGroupName(r).toLowerCase() === cleanSourceOrGroupName(g.name).toLowerCase())
        );
        additionalGroups.forEach(ag => {
          if (!includedGroupNames.has(ag.name)) {
            includedGroupNames.add(ag.name);
            groups.push(ag);
            added = true;
          }
        });
      }
    }
  } else {
    groups = appConfig.proxyGroups;
  }
  let mappedGroups = groups.map(g => ({
    ...g,
    proxies: g.proxies ? [...g.proxies] : undefined,
    use: g.use ? [...g.use] : undefined,
  }));

  if (Array.isArray(effectiveNodes) && effectiveNodes.length > 0) {
    const activeSourceIds = new Set<string>();
    const activeSourceNames = new Set<string>();
    let hasCustomNodes = false;

    effectiveNodes.forEach(n => {
      const sId = (n.sourceId || '').trim();
      const sName = (n.sourceName || '').trim();
      if (sId) activeSourceIds.add(sId.toLowerCase());
      if (sName) {
        activeSourceNames.add(sName.toLowerCase());
        activeSourceNames.add(cleanSourceOrGroupName(sName).toLowerCase());
      }
      if (sId === 'custom' || sId.startsWith('custom') || sName === '自建节点' || sName === '独立节点组') {
        hasCustomNodes = true;
      }
    });

    // Also include filter sources that have nodes
    appConfig.sources.forEach(s => {
      if (s.type === 'filter' && s.enabled && Array.isArray(s.nodes) && s.nodes.length > 0) {
        activeSourceIds.add(s.id.toLowerCase());
        activeSourceNames.add(s.name.toLowerCase());
        activeSourceNames.add(cleanSourceOrGroupName(s.name).toLowerCase());
      }
    });

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

    const deadGroupNames = new Set<string>();
    mappedGroups = mappedGroups.filter(g => {
      if (isProtectedGroup(g)) return true;
      const gClean = cleanSourceOrGroupName(g.name).toLowerCase();
      const isCustomGrp = g.id === 'grp-src-custom' || gClean === '自建节点' || gClean === '独立节点组';
      const isDedicatedSourceGroup = g.id.startsWith('grp-src-') || isCustomGrp;
      if (!isDedicatedSourceGroup) return true;

      if (isCustomGrp) {
        if (!hasCustomNodes) {
          deadGroupNames.add(g.name);
          return false;
        }
        return true;
      }

      // Dedicated subscription source group
      const useSrc = (g.use && g.use.length === 1) ? cleanSourceOrGroupName(g.use[0]).toLowerCase() : gClean;
      const isActive =
        activeSourceNames.has(gClean) ||
        activeSourceNames.has(useSrc) ||
        (g.id.startsWith('grp-src-') && activeSourceIds.has(g.id.replace('grp-src-', '').toLowerCase()));
      if (!isActive) {
        deadGroupNames.add(g.name);
        return false;
      }
      return true;
    });

    if (deadGroupNames.size > 0) {
      mappedGroups.forEach(g => {
        if (g.proxies) {
          g.proxies = g.proxies.filter(p => !deadGroupNames.has(p));
        }
        if (g.use) {
          g.use = g.use.filter(u => !deadGroupNames.has(u));
        }
      });
    }
  }

  return mappedGroups;
}

export function getEffectiveSourcesForProfile(profile?: SubscriptionProfile, effectiveNodes?: ProxyNode[]): SubscriptionSource[] {
  const appConfig = getAppConfig();
  if (!profile) return appConfig.sources;
  if (Array.isArray(profile.nodeFilter?.sourceIds) && profile.nodeFilter.sourceIds.length > 0) {
    const selectedSourceIds = new Set(profile.nodeFilter.sourceIds);
    return appConfig.sources.filter(s => selectedSourceIds.has(s.id) || (s.id === 'custom' && selectedSourceIds.has('custom')));
  }
  const usedSourceIds = new Set<string>();
  if (Array.isArray(effectiveNodes)) {
    effectiveNodes.forEach(n => {
      if (n.sourceId) usedSourceIds.add(n.sourceId);
    });
  }
  if (usedSourceIds.size > 0) {
    return appConfig.sources.filter(s => usedSourceIds.has(s.id) || (s.id === 'custom' && usedSourceIds.has('custom')));
  }
  return appConfig.sources;
}

export function getEffectiveRulesForProfile(profile: SubscriptionProfile): UnifiedRuleItem[] {
  const appConfig = getAppConfig();
  if (Array.isArray(profile.selectedRuleIds) && profile.selectedRuleIds.length > 0) {
    const set = new Set(profile.selectedRuleIds);
    return appConfig.rulesList.filter(r => set.has(r.id));
  }
  return appConfig.rulesList;
}

export function getEffectiveTemplateForProfile(profile: SubscriptionProfile, clientType: ClientType): ConfigTemplate | undefined {
  const appConfig = getAppConfig();
  const customTplId = profile.templates?.[clientType];
  if (customTplId) {
    const found = appConfig.templates.find(t => t.id === customTplId);
    if (found) return found;
  }
  return appConfig.templates.find(t => t.type === clientType && t.isDefault) || appConfig.templates.find(t => t.type === clientType);
}
