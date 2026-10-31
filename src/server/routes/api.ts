import express from 'express';
import crypto from 'crypto';
import yaml from 'js-yaml';
import { appConfig, getBaseUrl, setGlobalNodesCache, getGlobalNodesCache } from '../context.js';
import { saveConfig, saveServerConfig } from '../../storage/db.js';
import { fetchAndParseSource, parseRawContent } from '../../core/parser/fetcher.js';
import {
  parseProxyGroupsText,
  parseLocalRulesText,
  parseRemoteRulesText,
  parseUnifiedRulesText,
  exportRulesToText,
} from '../../core/parser/rules-parser.js';
import {
  formatSourceGroupTag,
  cleanSourceOrGroupName,
  getSourceGroupPrefix,
} from '../../core/generators/common.js';
import {
  AppConfig,
  ProxyNode,
  ConfigTemplate,
  ProxyGroupItem,
  UnifiedRuleItem,
  CountryPatternRule,
  SubscriptionSource,
  SubscriptionProfile,
} from '../../types/index.js';
import {
  INITIAL_COUNTRY_RULES,
  INITIAL_TEMPLATES,
  loadDefaultTemplate,
  loadSingboxGatewayTemplate,
  loadDefaultRules,
} from '../../storage/default-templates.js';
import { generateMihomoConfig, nodeToMihomoProxy } from '../../core/generators/mihomo-generator.js';
import { generateSingboxConfig } from '../../core/generators/singbox-generator.js';
import { generateLoonConfig, nodeToLoonProxy } from '../../core/generators/loon-generator.js';
import { generateQuantumultXConfig, nodeToQuantumultXProxy } from '../../core/generators/quantumultx-generator.js';
import { generateEgernConfig, nodeToEgernProxy } from '../../core/generators/egern-generator.js';
import { generateShadowrocketConfig, generateShadowrocketBase64 } from '../../core/generators/shadowrocket-generator.js';
import { detectClientType, ClientType } from '../../core/parser/ua-detector.js';
import { applyExtractionRules } from '../../core/filter/extractor.js';
import {
  ensureCustomSource,
  ensureCustomProxyGroup,
  ensureAllSourceProxyGroups,
  collectNodesFromSources,
  refreshAllSources,
  getEffectiveNodes,
  getEffectiveNodesForProfile,
  getEffectiveGroupsForProfile,
  getEffectiveSourcesForProfile,
  getEffectiveRulesForProfile,
  getEffectiveTemplateForProfile,
  computeFilterSourceNodes,
} from '../services/profile-service.js';

export const apiRouter = express.Router();

// 1. Config & Settings
apiRouter.get('/api/config', (req, res) => {
  ensureCustomSource(appConfig);
  res.json({ success: true, data: appConfig });
});


apiRouter.post('/api/config/settings', (req, res) => {
  const { settings } = req.body;
  if (settings) {
    appConfig.settings = { ...appConfig.settings, ...settings };
    ensureCustomSource(appConfig);
    ensureCustomProxyGroup(appConfig);
    ensureAllSourceProxyGroups(appConfig);
    saveConfig(appConfig);
  }
  res.json({ success: true, data: appConfig.settings, proxyGroups: appConfig.proxyGroups });
});

// 2. Custom Nodes Management (独立节点组专区)
apiRouter.get('/api/custom-nodes', (req, res) => {
  const sourceId = req.query.sourceId as string | undefined;
  if (sourceId) {
    const target = appConfig.sources.find(s => s.id === sourceId && (s.type === 'custom' || s.type === 'manual' || s.id === 'custom' || !s.url));
    return res.json({ success: true, count: target?.nodes?.length || 0, data: target?.nodes || [] });
  }
  const customSrc = ensureCustomSource(appConfig);
  res.json({ success: true, count: customSrc.nodes?.length || 0, data: customSrc.nodes || [] });
});

apiRouter.post('/api/custom-nodes/import', (req, res) => {
  const { text, replaceAll, sourceId } = req.body;
  if (text === undefined || typeof text !== 'string') {
    return res.status(400).json({ success: false, message: 'Text content required' });
  }

  // Find target custom source
  let targetSrc = sourceId
    ? appConfig.sources.find(s => s.id === sourceId && (s.type === 'custom' || s.type === 'manual' || s.id === 'custom' || !s.url))
    : null;
  if (!targetSrc) {
    targetSrc = ensureCustomSource(appConfig);
  }

  if (replaceAll && !text.trim()) {
    targetSrc.nodes = [];
    targetSrc.nodeCount = 0;
    targetSrc.lastUpdated = new Date().toISOString();
    ensureCustomProxyGroup(appConfig);
    saveConfig(appConfig);
    setGlobalNodesCache(collectNodesFromSources(appConfig));

    return res.json({
      success: true,
      count: 0,
      added: 0,
      data: [],
      sourceId: targetSrc.id,
      proxyGroups: appConfig.proxyGroups,
    });
  }

  const parsedNodes: ProxyNode[] = parseRawContent(text, targetSrc.id, targetSrc.name, undefined, appConfig.countryRules);

  if (parsedNodes.length === 0) {
    return res.status(400).json({ success: false, message: '未能从粘贴文本中识别到有效节点 (支持 URI 链接, Clash YAML, Singbox JSON, Base64)' });
  }

  if (replaceAll) {
    targetSrc.nodes = parsedNodes;
  } else {
    const existingIds = new Set((targetSrc.nodes || []).map(n => `${n.server}:${n.port}:${n.name}`));
    const newOnes = parsedNodes.filter(n => !existingIds.has(`${n.server}:${n.port}:${n.name}`));
    targetSrc.nodes = [...(targetSrc.nodes || []), ...newOnes];
  }

  targetSrc.nodeCount = targetSrc.nodes.length;
  targetSrc.lastUpdated = new Date().toISOString();
  ensureCustomProxyGroup(appConfig);
  saveConfig(appConfig);
  setGlobalNodesCache(collectNodesFromSources(appConfig));

  res.json({
    success: true,
    count: targetSrc.nodes.length,
    added: parsedNodes.length,
    data: targetSrc.nodes,
    sourceId: targetSrc.id,
    proxyGroups: appConfig.proxyGroups,
  });
});

apiRouter.post('/api/custom-nodes', (req, res) => {
  let targetSrc = req.body.sourceId
    ? appConfig.sources.find(s => s.id === req.body.sourceId && (s.type === 'custom' || s.type === 'manual' || s.id === 'custom' || !s.url))
    : null;
  if (!targetSrc) {
    targetSrc = ensureCustomSource(appConfig);
  }

  const newNode: ProxyNode = {
    id: `custom-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    sourceId: targetSrc.id,
    sourceName: targetSrc.name,
    name: req.body.name || '独立节点',
    type: req.body.type || 'vless',
    server: req.body.server || '',
    port: Number(req.body.port) || 443,
    countryCode: req.body.countryCode || 'OTHER',
    countryEmoji: req.body.countryEmoji || '🌐',
    ...req.body,
  };

  targetSrc.nodes = [...(targetSrc.nodes || []), newNode];
  targetSrc.nodeCount = targetSrc.nodes.length;
  ensureCustomProxyGroup(appConfig);
  saveConfig(appConfig);
  setGlobalNodesCache(collectNodesFromSources(appConfig));

  res.json({
    success: true,
    data: newNode,
    count: targetSrc.nodes.length,
    sourceId: targetSrc.id,
    proxyGroups: appConfig.proxyGroups,
  });
});

const updateNodeHandler = (req: any, res: any) => {
  const { name, text, rawContent, raw, ...directFields } = req.body || {};
  const configText = (typeof text === 'string' ? text : typeof rawContent === 'string' ? rawContent : typeof raw === 'string' ? raw : '').trim();

  for (const s of appConfig.sources) {
    if (s.nodes) {
      const idx = s.nodes.findIndex(n => n.id === req.params.id);
      if (idx !== -1) {
        let updatedNode: ProxyNode = { ...s.nodes[idx], ...directFields };

        // If configText is provided, parse it to extract protocol, server, port, security, etc.
        if (configText) {
          try {
            const parsed = parseRawContent(configText, s.id, s.name, undefined, appConfig.countryRules);
            if (parsed.length > 0) {
              const newParsed = parsed[0];
              updatedNode = {
                ...s.nodes[idx],
                ...newParsed,
                id: req.params.id, // Preserve original unique node ID
                sourceId: s.id,
                sourceName: s.name,
                raw: configText,
                ...directFields,
              };
            } else {
              updatedNode.raw = configText;
            }
          } catch (err: any) {
            console.warn(`[NodeUpdate] Failed to parse config text for node ${req.params.id}:`, err.message);
            updatedNode.raw = configText;
          }
        }

        // If a new name is explicitly provided
        if (name && typeof name === 'string' && name.trim()) {
          updatedNode.name = name.trim();
        }

        s.nodes[idx] = updatedNode;
        saveConfig(appConfig);
        setGlobalNodesCache(collectNodesFromSources(appConfig));
        return res.json({ success: true, data: s.nodes[idx] });
      }
    }
  }
  return res.status(404).json({ success: false, message: 'Node not found' });
};

apiRouter.put('/api/custom-nodes/:id', updateNodeHandler);
apiRouter.put('/api/nodes/:id', updateNodeHandler);

const deleteNodeHandler = (req: any, res: any) => {
  const nodeId = req.params.id;
  let deleted = false;
  let remainingCount = 0;
  let affectedNodes: ProxyNode[] = [];

  for (const s of appConfig.sources) {
    if (s.nodes && s.nodes.length > 0) {
      const idx = s.nodes.findIndex(n => n.id === nodeId);
      if (idx !== -1) {
        s.nodes.splice(idx, 1);
        s.nodeCount = s.nodes.length;
        deleted = true;
        remainingCount = s.nodeCount;
        affectedNodes = s.nodes;
        break;
      }
    }
  }

  if (deleted) {
    saveConfig(appConfig);
    setGlobalNodesCache(collectNodesFromSources(appConfig));
    return res.json({ success: true, count: remainingCount, data: affectedNodes, message: 'Node deleted' });
  }

  return res.status(404).json({ success: false, message: 'Node not found' });
};

apiRouter.delete('/api/custom-nodes/:id', deleteNodeHandler);
apiRouter.delete('/api/nodes/:id', deleteNodeHandler);

apiRouter.post('/api/sources/:id/clear-nodes', (req, res) => {
  const source = appConfig.sources.find(s => s.id === req.params.id);
  if (!source) {
    return res.status(404).json({ success: false, message: 'Source not found' });
  }
  source.nodes = [];
  source.nodeCount = 0;
  source.lastUpdated = new Date().toISOString();
  saveConfig(appConfig);
  setGlobalNodesCache(collectNodesFromSources(appConfig));
  res.json({ success: true, message: 'Nodes cleared' });
});

// 3. Network Sources Management (网络订阅源与自建节点组)
apiRouter.get('/api/sources', (req, res) => {
  ensureCustomSource(appConfig);
  res.json({ success: true, data: appConfig.sources });
});

// Add source: remote network subscription or manual node group
apiRouter.post('/api/sources', async (req, res) => {
  try {
    const sourceName = (req.body.name || '新节点组').trim();
    const isManual = req.body.type === 'manual' || req.body.type === 'custom';

    // 1. Create manual node group
    if (isManual) {
      const newSource: SubscriptionSource = {
        id: `manual-${Date.now()}`,
        name: sourceName,
        url: '',
        enabled: req.body.enabled !== false,
        type: 'manual',
        nodeCount: 0,
        nodes: [],
        lastUpdated: new Date().toISOString(),
      };
      appConfig.sources.push(newSource);

      if (req.body.createGroup) {
        appConfig.proxyGroups.push({
          id: `grp-${newSource.id}`,
          name: newSource.name,
          type: 'select',
          sources: [newSource.name],
        });
      }

      saveConfig(appConfig);
      setGlobalNodesCache(collectNodesFromSources(appConfig));
      return res.json({ success: true, count: 0, data: newSource });
    }

    // 2. Create remote network subscription
    const sourceUrl = (req.body.url || '').trim();
    if (!sourceUrl) {
      return res.status(400).json({ success: false, message: '订阅链接不能为空' });
    }

    const newSource: SubscriptionSource = {
      id: `src-${Date.now()}`,
      name: sourceName,
      url: sourceUrl,
      enabled: req.body.enabled !== false,
      type: 'remote',
      nodeCount: 0,
      nodes: [],
    };

    if (newSource.url.startsWith('http://') || newSource.url.startsWith('https://')) {
      try {
        console.log(`[Fetcher] Fetching nodes for [${sourceName}]: ${sourceUrl}`);
        const nodes = await fetchAndParseSource(newSource, appConfig.countryRules);
        newSource.nodes = nodes;
        newSource.nodeCount = nodes.length;
        newSource.lastUpdated = new Date().toISOString();
        console.log(`[Fetcher] Successfully fetched ${nodes.length} nodes from [${sourceName}]`);
      } catch (err: any) {
        console.error(`[Fetcher] Failed initial fetch for [${sourceName}]:`, err.message || err);
      }
    }

    appConfig.sources.push(newSource);

    if (req.body.createGroup) {
      appConfig.proxyGroups.push({
        id: `grp-${newSource.id}`,
        name: newSource.name,
        type: 'urltest',
        sources: [newSource.name],
        tolerance: 50,
        interval: 300,
        url: 'https://www.google.com/generate_204',
      });
    }

    saveConfig(appConfig);
    setGlobalNodesCache(collectNodesFromSources(appConfig));

    res.json({ success: true, count: newSource.nodeCount, data: newSource });
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message || 'Failed to add subscription source' });
  }
});

apiRouter.put('/api/sources/:id', async (req, res) => {
  const index = appConfig.sources.findIndex(s => s.id === req.params.id);
  if (index === -1) {
    return res.status(404).json({ success: false, message: 'Source not found' });
  }
  const oldSource = appConfig.sources[index];
  const oldName = cleanSourceOrGroupName(oldSource.name || '');
  const newName = req.body.name ? cleanSourceOrGroupName(req.body.name) : oldName;

  // If source name changed, update nodes and references in proxyGroups
  if (newName && newName !== oldName) {
    if (oldSource.nodes) {
      oldSource.nodes.forEach(n => {
        n.sourceName = newName;
      });
    }

    if (appConfig.proxyGroups) {
      appConfig.proxyGroups.forEach(grp => {
        if (grp.sources) {
          grp.sources = grp.sources.map(s => cleanSourceOrGroupName(s).toLowerCase() === oldName.toLowerCase() ? newName : s);
        }
        if (grp.use) {
          grp.use = grp.use.map(u => cleanSourceOrGroupName(u).toLowerCase() === oldName.toLowerCase() ? newName : u);
        }
      });
    }
  }

  // Re-fetch if remote subscription URL changed
  const urlChanged = req.body.url && req.body.url.trim() !== oldSource.url;
  if (urlChanged && oldSource.type !== 'manual' && oldSource.type !== 'custom') {
    const updatedUrl = (req.body.url ? req.body.url.trim() : oldSource.url) || '';
    if (updatedUrl.startsWith('http://') || updatedUrl.startsWith('https://')) {
      try {
        console.log(`[Fetcher] Fetching nodes for updated source [${newName || oldSource.name}]: ${updatedUrl}`);
        const tempSource = { ...oldSource, ...req.body, name: newName || oldSource.name, url: updatedUrl };
        const nodes = await fetchAndParseSource(tempSource, appConfig.countryRules);
        req.body.nodes = nodes;
        req.body.nodeCount = nodes.length;
        req.body.lastUpdated = new Date().toISOString();
      } catch (err: any) {
        console.error(`[Fetcher] Failed to fetch updated source URL:`, err.message || err);
      }
    }
  }

  appConfig.sources[index] = { ...appConfig.sources[index], ...req.body };
  saveConfig(appConfig);
  setGlobalNodesCache(collectNodesFromSources(appConfig));
  res.json({ success: true, data: appConfig.sources[index], proxyGroups: appConfig.proxyGroups });
});

apiRouter.delete('/api/sources/:id', (req, res) => {
  if (req.params.id === 'custom') {
    return res.status(400).json({ success: false, message: '默认独立节点组不能删除，可清空组内节点' });
  }
  const deletedSource = appConfig.sources.find(s => s.id === req.params.id);
  appConfig.sources = appConfig.sources.filter(s => s.id !== req.params.id);

  if (deletedSource) {
    const sClean = cleanSourceOrGroupName(deletedSource.name).toLowerCase();
    const sId = (deletedSource.id || '').trim().toLowerCase();
    const sRaw = (deletedSource.name || '').trim().toLowerCase();

    const matchesSource = (target: string) => {
      if (!target) return false;
      const t = target.trim().toLowerCase();
      const tClean = cleanSourceOrGroupName(target).toLowerCase();
      return t === sId || t === sRaw || tClean === sClean || tClean === sId;
    };

    appConfig.proxyGroups = (appConfig.proxyGroups || []).filter(g => 
      g.id !== `grp-src-${deletedSource.id}` && !matchesSource(g.name)
    );
    appConfig.proxyGroups.forEach(grp => {
      if (grp.use) grp.use = grp.use.filter(u => !matchesSource(u));
      if (grp.sources) grp.sources = grp.sources.filter(s => !matchesSource(s));
      if (grp.proxies) grp.proxies = grp.proxies.filter(p => !matchesSource(p));
    });

    // Clean up parentSourceIds references in filter sources
    appConfig.sources.forEach(s => {
      if (s.type === 'filter' && s.filterConfig?.parentSourceIds) {
        s.filterConfig.parentSourceIds = s.filterConfig.parentSourceIds.filter(id => id !== req.params.id);
      }
    });

    // Clean up sourceIds references in profiles
    (appConfig.profiles || []).forEach(p => {
      if (p.nodeFilter?.sourceIds) {
        p.nodeFilter.sourceIds = p.nodeFilter.sourceIds.filter(id => id !== req.params.id && !matchesSource(id));
      }
    });
  }

  saveConfig(appConfig);
  setGlobalNodesCache(collectNodesFromSources(appConfig));
  res.json({ success: true, message: 'Source deleted' });
});

apiRouter.post('/api/sources/:id/refresh', async (req, res) => {
  const source = appConfig.sources.find(s => s.id === req.params.id);
  if (!source) {
    return res.status(404).json({ success: false, message: 'Source not found' });
  }
  const url = (source.url || '').trim();
  if (source.type === 'manual' || source.type === 'custom' || !url || !url.startsWith('http')) {
    setGlobalNodesCache(collectNodesFromSources(appConfig));
    saveConfig(appConfig);
    return res.json({ success: true, nodeCount: source.nodes?.length || 0, data: source.nodes || [] });
  }
  try {
    const nodes = await fetchAndParseSource(source, appConfig.countryRules);
    source.nodes = nodes;
    source.nodeCount = nodes.length;
    source.lastUpdated = new Date().toISOString();
    saveConfig(appConfig);
    setGlobalNodesCache(collectNodesFromSources(appConfig));
    res.json({ success: true, nodeCount: nodes.length, data: nodes });
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message || 'Fetch failed' });
  }
});

apiRouter.post('/api/sources/refresh-all', async (req, res) => {
  try {
    const all = await refreshAllSources(appConfig);
    const effective = applyExtractionRules(all, appConfig.rules);
    res.json({ success: true, totalNodes: all.length, effectiveNodes: effective.length });
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message || 'Refresh all failed' });
  }
});


// 3. Country Matching & Grouping Rules (国家/地区识别规则)
apiRouter.get('/api/country-rules', (req, res) => {
  res.json({ success: true, data: appConfig.countryRules || INITIAL_COUNTRY_RULES });
});

apiRouter.post('/api/country-rules', (req, res) => {
  const newRule: CountryPatternRule = {
    id: `c-${Date.now()}`,
    code: (req.body.code || 'OTHER').toUpperCase(),
    name: req.body.name || '自定义地区',
    emoji: req.body.emoji || '🌐',
    pattern: req.body.pattern || '',
    groupName: req.body.groupName,
  };
  if (!appConfig.countryRules) appConfig.countryRules = [...INITIAL_COUNTRY_RULES];
  appConfig.countryRules.push(newRule);
  saveConfig(appConfig);
  res.json({ success: true, data: newRule });
});

apiRouter.put('/api/country-rules/:id', (req, res) => {
  if (!appConfig.countryRules) appConfig.countryRules = [...INITIAL_COUNTRY_RULES];
  const idx = appConfig.countryRules.findIndex(r => r.id === req.params.id);
  if (idx === -1) return res.status(404).json({ success: false, message: 'Country rule not found' });
  appConfig.countryRules[idx] = { ...appConfig.countryRules[idx], ...req.body };
  saveConfig(appConfig);
  res.json({ success: true, data: appConfig.countryRules[idx] });
});

apiRouter.delete('/api/country-rules/:id', (req, res) => {
  if (!appConfig.countryRules) appConfig.countryRules = [...INITIAL_COUNTRY_RULES];
  appConfig.countryRules = appConfig.countryRules.filter(r => r.id !== req.params.id);
  saveConfig(appConfig);
  res.json({ success: true, message: 'Country rule deleted' });
});

apiRouter.post('/api/country-rules/reset', (req, res) => {
  appConfig.countryRules = [...INITIAL_COUNTRY_RULES];
  saveConfig(appConfig);
  res.json({ success: true, data: appConfig.countryRules });
});

// 4. Extraction & Rename Rules (节点抽取与清洗流水线)
apiRouter.get('/api/rules', (req, res) => {
  res.json({ success: true, data: appConfig.rules });
});

apiRouter.post('/api/rules', (req, res) => {
  const newRule = {
    id: `rule-${Date.now()}`,
    name: req.body.name || '新抽取规则',
    enabled: req.body.enabled !== false,
    ...req.body,
  };
  appConfig.rules.push(newRule);
  saveConfig(appConfig);
  res.json({ success: true, data: newRule });
});

apiRouter.put('/api/rules/:id', (req, res) => {
  const index = appConfig.rules.findIndex(r => r.id === req.params.id);
  if (index === -1) {
    return res.status(404).json({ success: false, message: 'Rule not found' });
  }
  appConfig.rules[index] = { ...appConfig.rules[index], ...req.body };
  saveConfig(appConfig);
  res.json({ success: true, data: appConfig.rules[index] });
});

apiRouter.delete('/api/rules/:id', (req, res) => {
  appConfig.rules = appConfig.rules.filter(r => r.id !== req.params.id);
  saveConfig(appConfig);
  res.json({ success: true, message: 'Rule deleted' });
});

// 4. Effective Nodes
apiRouter.get('/api/nodes', async (req, res) => {
  try {
    const effective = await getEffectiveNodes();
    res.json({ success: true, totalCount: effective.length, data: effective });
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message });
  }
});

export function sanitizeProxyGroups(appConfig: AppConfig): boolean {
  let changed = false;
  const validSourceSet = new Set<string>();
  (appConfig.sources || []).forEach(s => {
    if (s.id) validSourceSet.add(s.id.trim().toLowerCase());
    if (s.name) {
      validSourceSet.add(s.name.trim().toLowerCase());
      validSourceSet.add(cleanSourceOrGroupName(s.name).toLowerCase());
    }
  });

  (appConfig.proxyGroups || []).forEach(g => {
    if (Array.isArray(g.sources) && g.sources.length > 0) {
      const filtered = g.sources.filter(s => {
        const raw = (s || '').trim().toLowerCase();
        const clean = cleanSourceOrGroupName(s).toLowerCase();
        return validSourceSet.has(raw) || validSourceSet.has(clean);
      });
      if (filtered.length !== g.sources.length) {
        g.sources = filtered;
        changed = true;
      }
    }
    if (Array.isArray(g.use) && g.use.length > 0) {
      const filtered = g.use.filter(u => {
        const raw = (u || '').trim().toLowerCase();
        const clean = cleanSourceOrGroupName(u).toLowerCase();
        return validSourceSet.has(raw) || validSourceSet.has(clean);
      });
      if (filtered.length !== g.use.length) {
        g.use = filtered;
        changed = true;
      }
    }
  });

  return changed;
}

// 5. Proxy Groups Management (出口策略分组)
apiRouter.get('/api/groups', (req, res) => {
  let needSave = ensureCustomProxyGroup(appConfig);
  if (sanitizeProxyGroups(appConfig)) {
    needSave = true;
  }
  if (needSave) {
    saveConfig(appConfig);
  }
  res.json({ success: true, data: appConfig.proxyGroups });
});

apiRouter.post('/api/groups', (req, res) => {
  const newGroup: ProxyGroupItem = {
    id: `grp-${Date.now()}`,
    name: req.body.name || '新分组',
    type: req.body.type || 'select',
    proxies: req.body.proxies || [],
    use: req.body.use,
    filter: req.body.filter,
    tolerance: req.body.tolerance,
    interval: req.body.interval,
    url: req.body.url,
  };
  appConfig.proxyGroups.push(newGroup);
  saveConfig(appConfig);
  res.json({ success: true, data: newGroup });
});

apiRouter.post('/api/groups/batch-import', (req, res) => {
  const { text, replaceAll } = req.body;
  if (!text || typeof text !== 'string') {
    return res.status(400).json({ success: false, message: 'Text required' });
  }
  const parsed = parseProxyGroupsText(text);
  if (parsed.length === 0) {
    return res.status(400).json({ success: false, message: '未能从粘贴内容中识别到策略组' });
  }

  if (replaceAll) {
    appConfig.proxyGroups = parsed;
  } else {
    // Merge by unique name
    const existingNames = new Set(appConfig.proxyGroups.map(g => g.name));
    parsed.forEach(p => {
      if (!existingNames.has(p.name)) {
        appConfig.proxyGroups.push(p);
      }
    });
  }

  saveConfig(appConfig);
  res.json({ success: true, count: parsed.length, data: appConfig.proxyGroups });
});

apiRouter.post('/api/groups/generate-country-presets', (req, res) => {
  const countryRules = appConfig.countryRules || INITIAL_COUNTRY_RULES;
  const existingNames = new Set(appConfig.proxyGroups.map(g => g.name));
  const newGroups: ProxyGroupItem[] = [];

  // 1. Generate dedicated group for each active subscription source (including custom nodes if non-empty)
  appConfig.sources.forEach(src => {
    const srcName = (src.name || '').trim();
    if (!srcName) return;
    if ((src.id === 'custom' || src.type === 'custom') && (!src.nodes || src.nodes.length === 0)) return;
    const groupTag = `⚡️ ${srcName}`;
    if (!existingNames.has(groupTag) && !existingNames.has(srcName)) {
      const srcGroup: ProxyGroupItem = {
        id: `grp-src-${Date.now()}-${src.id}`,
        name: groupTag,
        type: (src.id === 'custom' || src.type === 'custom' || src.type === 'manual') ? 'select' : 'urltest',
        sources: [src.id],
        use: [srcName],
        tolerance: 50,
        interval: 300,
        url: 'https://www.google.com/generate_204',
      };
      appConfig.proxyGroups.push(srcGroup);
      existingNames.add(groupTag);
      newGroups.push(srcGroup);
    }
  });

  // 2. Generate country preset groups
  countryRules.forEach(cr => {
    const groupName = cr.groupName || `${cr.emoji} ${cr.name}节点`;
    if (!existingNames.has(groupName)) {
      const newGrp: ProxyGroupItem = {
        id: `grp-${cr.code.toLowerCase()}-${Date.now()}`,
        name: groupName,
        type: 'urltest',
        filter: cr.pattern,
        tolerance: 50,
        isCountryGroup: true,
      };
      appConfig.proxyGroups.push(newGrp);
      existingNames.add(groupName);
      newGroups.push(newGrp);
    }
  });

  saveConfig(appConfig);
  res.json({ success: true, count: newGroups.length, data: appConfig.proxyGroups });
});

apiRouter.put('/api/groups/:id', (req, res) => {
  const idx = appConfig.proxyGroups.findIndex(g => g.id === req.params.id);
  if (idx === -1) return res.status(404).json({ success: false, message: 'Group not found' });
  
  const current = appConfig.proxyGroups[idx];
  const updated = { ...current, ...req.body };

  // Explicitly handle clearing fields if provided
  if ('proxies' in req.body) {
    if (Array.isArray(req.body.proxies) && req.body.proxies.length > 0) {
      updated.proxies = req.body.proxies;
    } else {
      delete updated.proxies;
    }
  }

  if ('use' in req.body) {
    if (Array.isArray(req.body.use) && req.body.use.length > 0) {
      updated.use = req.body.use;
    } else {
      delete updated.use;
    }
  }

  if ('filter' in req.body) {
    if (typeof req.body.filter === 'string' && req.body.filter.trim()) {
      updated.filter = req.body.filter.trim();
    } else {
      delete updated.filter;
    }
  }

  appConfig.proxyGroups[idx] = updated;
  saveConfig(appConfig);
  res.json({ success: true, data: appConfig.proxyGroups[idx] });
});

apiRouter.delete('/api/groups/:id', (req, res) => {
  appConfig.proxyGroups = appConfig.proxyGroups.filter(g => g.id !== req.params.id);
  saveConfig(appConfig);
  res.json({ success: true, message: 'Group deleted' });
});


// 6. Unified Rules Matrix Management (表格化规则与去向管理)
apiRouter.get('/api/rules/unified', (req, res) => {
  res.json({ success: true, data: appConfig.rulesList });
});

apiRouter.post('/api/rules/unified', (req, res) => {
  const newRule: UnifiedRuleItem = {
    id: `r-${Date.now()}`,
    name: req.body.name || '新规则',
    kind: req.body.kind || 'local',
    type: req.body.type || 'DOMAIN-SUFFIX',
    payload: req.body.payload || '',
    format: req.body.format,
    outbound: req.body.outbound || (appConfig.proxyGroups[0]?.name || '🎯 本地直连'),
    enabled: req.body.enabled !== false,
  };
  appConfig.rulesList.push(newRule);
  saveConfig(appConfig);
  res.json({ success: true, data: newRule });
});

apiRouter.post('/api/rules/import-local', (req, res) => {
  const { text, defaultOutbound } = req.body;
  if (!text || typeof text !== 'string') {
    return res.status(400).json({ success: false, message: 'Text required' });
  }
  const outbound = defaultOutbound || appConfig.proxyGroups[0]?.name || '🎯 本地直连';
  const parsed = parseLocalRulesText(text, outbound);
  if (parsed.length === 0) {
    return res.status(400).json({ success: false, message: '未能从粘贴内容中识别到本地规则' });
  }

  appConfig.rulesList.push(...parsed);
  saveConfig(appConfig);
  res.json({ success: true, count: parsed.length, data: appConfig.rulesList });
});

apiRouter.post('/api/rules/import-remote', (req, res) => {
  const { text, defaultOutbound } = req.body;
  if (!text || typeof text !== 'string') {
    return res.status(400).json({ success: false, message: 'Text required' });
  }
  const outbound = defaultOutbound || appConfig.proxyGroups[0]?.name || '🚀 节点选择';
  const parsed = parseRemoteRulesText(text, outbound);
  if (parsed.length === 0) {
    return res.status(400).json({ success: false, message: '未能从粘贴内容中识别到远程规则集' });
  }

  appConfig.rulesList.push(...parsed);
  saveConfig(appConfig);
  res.json({ success: true, count: parsed.length, data: appConfig.rulesList });
});

apiRouter.put('/api/rules/unified/:id', (req, res) => {
  const idx = appConfig.rulesList.findIndex(r => r.id === req.params.id);
  if (idx === -1) return res.status(404).json({ success: false, message: 'Rule not found' });
  appConfig.rulesList[idx] = { ...appConfig.rulesList[idx], ...req.body };
  saveConfig(appConfig);
  res.json({ success: true, data: appConfig.rulesList[idx] });
});

apiRouter.delete('/api/rules/unified/:id', (req, res) => {
  appConfig.rulesList = appConfig.rulesList.filter(r => r.id !== req.params.id);
  saveConfig(appConfig);
  res.json({ success: true, message: 'Rule deleted' });
});

apiRouter.post('/api/rules/unified/clear-all', (req, res) => {
  appConfig.rulesList = [];
  saveConfig(appConfig);
  res.json({ success: true, message: 'All rules cleared' });
});

apiRouter.post('/api/rules/unified/reset', (req, res) => {
  const defaultRules = loadDefaultRules();
  appConfig.rulesList = defaultRules;
  saveConfig(appConfig);
  res.json({ success: true, count: defaultRules.length, data: appConfig.rulesList });
});

apiRouter.get('/api/rules/unified/defaults', (req, res) => {
  const defaultRules = loadDefaultRules();
  res.json({ success: true, count: defaultRules.length, data: defaultRules });
});

apiRouter.get('/api/rules/unified/export-text', (req, res) => {
  const text = exportRulesToText(appConfig.rulesList);
  res.json({ success: true, text });
});

apiRouter.post('/api/rules/unified/batch-replace', (req, res) => {
  const { text, defaultOutbound } = req.body;
  if (typeof text !== 'string') {
    return res.status(400).json({ success: false, message: 'Text required' });
  }
  const outbound = defaultOutbound || appConfig.proxyGroups[0]?.name || '🎯 本地直连';
  const parsed = parseUnifiedRulesText(text, outbound);

  // Built-in core actions that should never be auto-registered as proxy groups
  const BUILTIN_OUTBOUNDS = new Set([
    'reject', 'direct', 'global', 'pass', 'block', 'drop',
    'reject-drop', 'no-resolve', 'match', 'final',
  ]);

  // Automatically register any newly referenced custom outbound groups
  const existingGroupNames = new Set(appConfig.proxyGroups.map(g => g.name.toLowerCase()));
  parsed.forEach(r => {
    const ob = (r.outbound || '').trim();
    if (ob && !BUILTIN_OUTBOUNDS.has(ob.toLowerCase()) && !existingGroupNames.has(ob.toLowerCase())) {
      existingGroupNames.add(ob.toLowerCase());
      appConfig.proxyGroups.push({
        id: `grp-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        name: r.outbound,
        type: 'select',
        proxies: ['🚀 节点选择', '🎯 本地直连'],
      });
    }
  });

  appConfig.rulesList = parsed;
  saveConfig(appConfig);
  res.json({ success: true, count: parsed.length, data: appConfig.rulesList, groups: appConfig.proxyGroups });
});

// 7. Multi-Templates Management
apiRouter.get('/api/templates', (req, res) => {
  res.json({ success: true, data: appConfig.templates });
});

apiRouter.get('/api/templates/defaults', (req, res) => {
  const defaults: Record<string, string> = {
    singbox: loadDefaultTemplate('singbox'),
    'singbox-gateway': loadSingboxGatewayTemplate(),
    mihomo: loadDefaultTemplate('mihomo'),
    loon: loadDefaultTemplate('loon'),
    quantumultx: loadDefaultTemplate('quantumultx'),
    egern: loadDefaultTemplate('egern'),
    shadowrocket: loadDefaultTemplate('shadowrocket'),
  };
  res.json({ success: true, data: defaults });
});

apiRouter.get('/api/templates/default/:type', (req, res) => {
  const type = req.params.type;
  if (type === 'singbox-gateway') {
    const content = loadSingboxGatewayTemplate();
    return res.json({ success: true, type, content });
  }
  const content = loadDefaultTemplate(type as ClientType);
  res.json({ success: true, type, content });
});

apiRouter.post('/api/templates', (req, res) => {
  const type: ClientType = req.body.type || 'singbox';
  let content = req.body.content;
  if (!content || !content.trim() || content.trim() === '# 模版内容') {
    content = loadDefaultTemplate(type);
  }
  const newTemplate: ConfigTemplate = {
    id: `tpl-${Date.now()}`,
    name: req.body.name || `新建${type}配置模版`,
    type,
    content,
    description: req.body.description || '',
    isDefault: Boolean(req.body.isDefault),
  };
  if (newTemplate.isDefault) {
    appConfig.templates.forEach(t => {
      if (t.type === newTemplate.type) t.isDefault = false;
    });
  }
  appConfig.templates.push(newTemplate);
  saveConfig(appConfig);
  res.json({ success: true, data: newTemplate });
});

apiRouter.put('/api/templates/:id', (req, res) => {
  const index = appConfig.templates.findIndex(t => t.id === req.params.id);
  if (index === -1) {
    return res.status(404).json({ success: false, message: 'Template not found' });
  }
  const updated = { ...appConfig.templates[index], ...req.body };
  if (updated.isDefault) {
    appConfig.templates.forEach(t => {
      if (t.type === updated.type && t.id !== updated.id) t.isDefault = false;
    });
  }
  appConfig.templates[index] = updated;
  saveConfig(appConfig);
  res.json({ success: true, data: updated });
});

apiRouter.post('/api/templates/:id/reset', (req, res) => {
  const index = appConfig.templates.findIndex(t => t.id === req.params.id);
  if (index === -1) {
    return res.status(404).json({ success: false, message: '模版未找到' });
  }
  const tpl = appConfig.templates[index];
  if (tpl.id === 'tpl-singbox-gateway' || tpl.name.includes('旁路由') || tpl.name.includes('网关')) {
    tpl.content = loadSingboxGatewayTemplate();
  } else {
    tpl.content = loadDefaultTemplate(tpl.type);
  }
  appConfig.templates[index] = tpl;
  saveConfig(appConfig);
  return res.json({ success: true, data: tpl });
});

apiRouter.delete('/api/templates/:id', (req, res) => {
  if (appConfig.templates.length <= 1) {
    return res.status(400).json({ success: false, message: '至少保留一个模版' });
  }
  appConfig.templates = appConfig.templates.filter(t => t.id !== req.params.id);
  saveConfig(appConfig);
  res.json({ success: true, message: 'Template deleted' });
});

// 7. Profiles Management (多订阅中心)
apiRouter.get('/api/profiles', (req, res) => {
  res.json({ success: true, data: appConfig.profiles || [] });
});


apiRouter.post('/api/profiles', (req, res) => {
  const { name, description, nodeFilter, selectedGroupIds, selectedRuleIds, templates, token } = req.body;
  if (!name || typeof name !== 'string' || !name.trim()) {
    return res.status(400).json({ success: false, message: '订阅名称不能为空' });
  }

  const newProfile: SubscriptionProfile = {
    id: `prof_${Date.now()}_${crypto.randomBytes(3).toString('hex')}`,
    name: name.trim(),
    token: typeof token === 'string' && token.trim() ? token.trim() : generateRandomSubToken(),
    enabled: true,
    description: description?.trim(),
    nodeFilter: nodeFilter || { mode: 'all', selectedNodeIds: [] },
    selectedGroupIds: Array.isArray(selectedGroupIds) ? selectedGroupIds : [],
    selectedRuleIds: Array.isArray(selectedRuleIds) ? selectedRuleIds : [],
    templates: templates || {},
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  appConfig.profiles = appConfig.profiles || [];
  appConfig.profiles.push(newProfile);
  saveConfig(appConfig);
  res.json({ success: true, data: newProfile });
});

apiRouter.put('/api/profiles/:id', (req, res) => {
  const { id } = req.params;
  const index = (appConfig.profiles || []).findIndex(p => p.id === id);
  if (index === -1) {
    return res.status(404).json({ success: false, message: 'Profile not found' });
  }

  const existing = appConfig.profiles[index];
  const { name, description, enabled, nodeFilter, selectedGroupIds, selectedRuleIds, templates, token } = req.body;

  appConfig.profiles[index] = {
    ...existing,
    name: typeof name === 'string' && name.trim() ? name.trim() : existing.name,
    description: description !== undefined ? description : existing.description,
    enabled: enabled !== undefined ? Boolean(enabled) : existing.enabled,
    nodeFilter: nodeFilter !== undefined ? nodeFilter : existing.nodeFilter,
    selectedGroupIds: Array.isArray(selectedGroupIds) ? selectedGroupIds : existing.selectedGroupIds,
    selectedRuleIds: Array.isArray(selectedRuleIds) ? selectedRuleIds : existing.selectedRuleIds,
    templates: templates !== undefined ? templates : existing.templates,
    token: typeof token === 'string' && token.trim() ? token.trim() : existing.token,
    updatedAt: new Date().toISOString(),
  };

  saveConfig(appConfig);
  res.json({ success: true, data: appConfig.profiles[index] });
});

apiRouter.delete('/api/profiles/:id', (req, res) => {
  const { id } = req.params;
  if (!appConfig.profiles || appConfig.profiles.length <= 1) {
    return res.status(400).json({ success: false, message: '请至少保留一个订阅配置' });
  }
  appConfig.profiles = appConfig.profiles.filter(p => p.id !== id);
  saveConfig(appConfig);
  res.json({ success: true, message: '订阅已删除' });
});

apiRouter.post('/api/profiles/:id/refresh-token', (req, res) => {
  const { id } = req.params;
  const profile = (appConfig.profiles || []).find(p => p.id === id);
  if (!profile) {
    return res.status(404).json({ success: false, message: 'Profile not found' });
  }
  profile.token = generateRandomSubToken();
  profile.updatedAt = new Date().toISOString();
  saveConfig(appConfig);
  res.json({ success: true, data: profile });
});

function getBaseUrl(req: express.Request): string {
  const proto = (req.headers['x-forwarded-proto'] as string) || req.protocol || 'http';
  const host = (req.headers['x-forwarded-host'] as string) || req.get('host') || `localhost:${PORT}`;
  return `${proto}://${host}`;
}

// 8. Live Preview
apiRouter.post('/api/generate/preview', async (req, res) => {
  try {
    const { templateId, customTemplate, customType, profileId, profile: previewProfile } = req.body;

    let targetProfile: SubscriptionProfile | undefined;
    if (profileId) {
      targetProfile = (appConfig.profiles || []).find(p => p.id === profileId);
    } else if (previewProfile) {
      targetProfile = previewProfile;
    }

    const nodes = targetProfile
      ? await getEffectiveNodesForProfile(targetProfile)
      : await getEffectiveNodes();

    const groups = targetProfile
      ? getEffectiveGroupsForProfile(targetProfile, nodes)
      : appConfig.proxyGroups;

    const rules = targetProfile
      ? getEffectiveRulesForProfile(targetProfile)
      : appConfig.rulesList;

    let targetType: ClientType = customType || 'singbox';
    let templateContent = customTemplate;

    if (templateId) {
      const found = appConfig.templates.find(t => t.id === templateId);
      if (found) {
        targetType = found.type;
        if (!templateContent) templateContent = found.content;
      }
    } else if (targetProfile) {
      const tpl = getEffectiveTemplateForProfile(targetProfile, targetType);
      if (tpl && !templateContent) templateContent = tpl.content;
    }

    if (!templateContent) {
      const defaultTpl = appConfig.templates.find(t => t.type === targetType && t.isDefault) || appConfig.templates.find(t => t.type === targetType);
      templateContent = defaultTpl?.content || '';
    }

    const effectiveSources = targetProfile
      ? getEffectiveSourcesForProfile(targetProfile, nodes)
      : appConfig.sources;

    let output = '';
    const baseUrl = getBaseUrl(req);
    const subToken = targetProfile?.token || 'preview-token';
    const expand = Boolean(req.body?.expandNodes || req.query?.expand === 'true' || req.query?.expand === '1');

    if (targetType === 'mihomo') {
      output = generateMihomoConfig(templateContent, nodes, groups, rules, effectiveSources, {
        expandNodes: expand,
        baseUrl,
        subToken
      });
    } else if (targetType === 'singbox') {
      output = generateSingboxConfig(templateContent, nodes, groups, rules, effectiveSources);
    } else if (targetType === 'loon') {
      output = generateLoonConfig(templateContent, nodes, groups, rules, effectiveSources, {
        expandNodes: expand,
        baseUrl,
        subToken
      });
    } else if (targetType === 'quantumultx') {
      output = generateQuantumultXConfig(templateContent, nodes, groups, rules, effectiveSources, {
        expandNodes: expand,
        baseUrl,
        subToken
      });
    } else if (targetType === 'egern') {
      output = generateEgernConfig(templateContent, nodes, groups, rules, effectiveSources, {
        expandNodes: expand,
        baseUrl,
        subToken
      });
    } else if (targetType === 'shadowrocket') {
      const isBase64 = req.body?.format === 'base64' || req.query?.format === 'base64';
      if (isBase64) {
        output = generateShadowrocketBase64(nodes);
      } else {
        const expandRocket = req.body?.expandNodes !== false;
        output = generateShadowrocketConfig(templateContent, nodes, groups, rules, effectiveSources, { expandNodes: expandRocket });
      }
    }

    res.json({ success: true, nodeCount: nodes.length, data: output });
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message || 'Generation failed' });
  }
});
