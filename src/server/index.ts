import express from 'express';
import cors from 'cors';
import path from 'path';
import fs from 'fs';
import crypto from 'crypto';
import { loadConfig, saveConfig, generateRandomSubToken, saveServerConfig } from '../storage/db.js';
import { fetchAndParseSource, parseRawContent } from '../core/parser/fetcher.js';
import { applyExtractionRules } from '../core/filter/extractor.js';
import { generateMihomoConfig } from '../core/generators/mihomo-generator.js';
import { generateSingboxConfig } from '../core/generators/singbox-generator.js';
import { generateLoonConfig } from '../core/generators/loon-generator.js';
import { generateQuantumultXConfig } from '../core/generators/quantumultx-generator.js';
import { generateEgernConfig } from '../core/generators/egern-generator.js';
import { generateShadowrocketConfig, generateShadowrocketBase64 } from '../core/generators/shadowrocket-generator.js';
import { detectClientType, ClientType } from '../core/parser/ua-detector.js';
import {
  parseProxyGroupsText,
  parseLocalRulesText,
  parseRemoteRulesText,
  parseUnifiedRulesText,
  exportRulesToText,
} from '../core/parser/rules-parser.js';
import {
  AppConfig,
  ProxyNode,
  ConfigTemplate,
  ProxyGroupItem,
  UnifiedRuleItem,
  CountryPatternRule,
  SubscriptionSource,
  SubscriptionProfile,
} from '../types/index.js';

import { INITIAL_COUNTRY_RULES, INITIAL_TEMPLATES, loadDefaultTemplate } from '../storage/default-templates.js';


const app = express();
let appConfig: AppConfig = loadConfig();
const PORT = process.env.PORT || appConfig.settings.port || 3456;

app.use(cors());
app.use(express.json({ limit: '20mb' }));
app.use(express.urlencoded({ extended: true, limit: '20mb' }));

// ================= AUTHENTICATION & SESSION MANAGEMENT ================= //
const activeSessions = new Map<string, { createdAt: number }>();
const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

function isValidSession(token?: string): boolean {
  if (!token) return false;
  const session = activeSessions.get(token);
  if (!session) return false;
  if (Date.now() - session.createdAt > SESSION_TTL_MS) {
    activeSessions.delete(token);
    return false;
  }
  return true;
}

function extractBearerToken(req: express.Request): string | undefined {
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    return authHeader.substring(7).trim();
  }
  if (req.headers['x-auth-token'] && typeof req.headers['x-auth-token'] === 'string') {
    return req.headers['x-auth-token'];
  }
  return undefined;
}

function requireAuth(req: express.Request, res: express.Response, next: express.NextFunction) {
  if (!appConfig.settings.adminPassword) {
    return next();
  }
  const token = extractBearerToken(req);
  if (isValidSession(token)) {
    return next();
  }
  return res.status(401).json({ success: false, message: '请先登录管理控制台' });
}

// Public Auth Endpoints
app.get('/api/auth/status', (req, res) => {
  const hasPassword = Boolean(appConfig.settings.adminPassword);
  const token = extractBearerToken(req);
  const authenticated = !hasPassword || isValidSession(token);
  res.json({ success: true, authRequired: hasPassword, authenticated });
});

app.post('/api/auth/login', (req, res) => {
  const { password } = req.body;
  const adminPassword = appConfig.settings.adminPassword;
  if (!adminPassword) {
    const sessionToken = `sess_${crypto.randomBytes(24).toString('hex')}`;
    activeSessions.set(sessionToken, { createdAt: Date.now() });
    return res.json({ success: true, token: sessionToken });
  }

  if (!password || typeof password !== 'string') {
    return res.status(401).json({ success: false, message: '请输入密码' });
  }

  const a = Buffer.from(password);
  const b = Buffer.from(adminPassword);
  if (a.length === b.length && crypto.timingSafeEqual(a, b)) {
    const sessionToken = `sess_${crypto.randomBytes(24).toString('hex')}`;
    activeSessions.set(sessionToken, { createdAt: Date.now() });
    return res.json({ success: true, token: sessionToken });
  }

  return res.status(401).json({ success: false, message: '密码错误，请重新输入' });
});

app.post('/api/auth/logout', (req, res) => {
  const token = extractBearerToken(req);
  if (token) activeSessions.delete(token);
  res.json({ success: true, message: '已退出登录' });
});

app.post('/api/auth/change-password', requireAuth, (req, res) => {
  const { oldPassword, newPassword } = req.body;
  if (!newPassword || typeof newPassword !== 'string' || newPassword.trim().length === 0) {
    return res.status(400).json({ success: false, message: '新密码不能为空' });
  }

  if (appConfig.settings.adminPassword) {
    if (!oldPassword || oldPassword !== appConfig.settings.adminPassword) {
      return res.status(400).json({ success: false, message: '旧密码验证失败' });
    }
  }

  appConfig.settings.adminPassword = newPassword.trim();
  saveServerConfig({ adminPassword: newPassword.trim() });
  res.json({ success: true, message: '密码修改成功' });
});

app.post('/api/settings/regenerate-sub-token', requireAuth, (req, res) => {
  const newToken = generateRandomSubToken();
  appConfig.settings.subToken = newToken;
  saveServerConfig({ subToken: newToken });
  res.json({ success: true, subToken: newToken });
});

// Protect all other /api routes
app.use('/api', (req, res, next) => {
  if (req.path.startsWith('/auth/status') || req.path.startsWith('/auth/login')) {
    return next();
  }
  return requireAuth(req, res, next);
});

function ensureCustomSource(config: AppConfig): SubscriptionSource {
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

function collectNodesFromSources(config: AppConfig): ProxyNode[] {
  ensureCustomSource(config);
  const allNodes: ProxyNode[] = [];
  config.sources.forEach(s => {
    if (s.enabled && s.nodes && s.nodes.length > 0) {
      s.nodes.forEach(n => {
        n.sourceName = s.name;
        n.sourceId = s.id;
      });
      allNodes.push(...s.nodes);
    }
  });
  return allNodes;
}

function ensureCustomProxyGroup(config: AppConfig): boolean {
  const customSrc = config.sources?.find(s => s.id === 'custom' || s.type === 'custom');
  if (!customSrc || !customSrc.nodes || customSrc.nodes.length === 0) return false;

  if (!config.proxyGroups) config.proxyGroups = [];
  const existingNames = new Set(config.proxyGroups.map(g => g.name.toLowerCase()));
  const targetTag = '⚡️ 独立节点组';

  if (!existingNames.has(targetTag.toLowerCase()) && !existingNames.has('独立节点组')) {
    const customGroup: ProxyGroupItem = {
      id: 'grp-src-custom',
      name: targetTag,
      type: 'select',
      use: ['独立节点组'],
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
  return false;
}

ensureCustomSource(appConfig);
ensureCustomProxyGroup(appConfig);
saveConfig(appConfig);

// Initialize in-memory cache directly from persisted source nodes
let globalNodesCache: ProxyNode[] = collectNodesFromSources(appConfig);

// Helper: refresh all enabled sources (triggered ONLY by explicit user action)
async function refreshAllSources(config: AppConfig): Promise<ProxyNode[]> {
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
  globalNodesCache = allNodes;
  return allNodes;
}

// Get extracted and processed nodes (pure local extraction, zero network blocking)
async function getEffectiveNodes(): Promise<ProxyNode[]> {
  if (globalNodesCache.length === 0) {
    globalNodesCache = collectNodesFromSources(appConfig);
  }
  return applyExtractionRules(globalNodesCache, appConfig.rules);
}

// Compute effective nodes for a specific profile (combining rules and manual selection)
async function getEffectiveNodesForProfile(profile: SubscriptionProfile): Promise<ProxyNode[]> {
  const allNodes = await getEffectiveNodes();
  const filter = profile.nodeFilter || { mode: 'all' };

  let filtered = allNodes;

  // 1. Source filter
  if (Array.isArray(filter.sourceIds) && filter.sourceIds.length > 0) {
    const srcSet = new Set(filter.sourceIds);
    filtered = filtered.filter(n => srcSet.has(n.sourceId || 'custom'));
  }

  // 2. Country filter
  if (Array.isArray(filter.countryCodes) && filter.countryCodes.length > 0) {
    const countrySet = new Set(filter.countryCodes.map(c => c.toUpperCase()));
    filtered = filtered.filter(n => n.countryCode && countrySet.has(n.countryCode.toUpperCase()));
  }

  // 3. Keywords filter
  if (Array.isArray(filter.includeKeywords) && filter.includeKeywords.length > 0) {
    filtered = filtered.filter(n => filter.includeKeywords!.some(kw => n.name.toLowerCase().includes(kw.toLowerCase())));
  }
  if (Array.isArray(filter.excludeKeywords) && filter.excludeKeywords.length > 0) {
    filtered = filtered.filter(n => !filter.excludeKeywords!.some(kw => n.name.toLowerCase().includes(kw.toLowerCase())));
  }

  // 4. Regex filter
  if (filter.includeRegex) {
    try {
      const reg = new RegExp(filter.includeRegex, 'i');
      filtered = filtered.filter(n => reg.test(n.name));
    } catch {}
  }
  if (filter.excludeRegex) {
    try {
      const reg = new RegExp(filter.excludeRegex, 'i');
      filtered = filtered.filter(n => !reg.test(n.name));
    } catch {}
  }

  // 5. Manual / selectedNodeIds filter:
  // If user selected explicit nodes, only keep those
  if (Array.isArray(filter.selectedNodeIds) && filter.selectedNodeIds.length > 0) {
    const selSet = new Set(filter.selectedNodeIds);
    filtered = filtered.filter(n => selSet.has(n.id));
  }

  return filtered;
}

function getEffectiveGroupsForProfile(profile: SubscriptionProfile): ProxyGroupItem[] {
  let groups: ProxyGroupItem[];
  if (Array.isArray(profile.selectedGroupIds) && profile.selectedGroupIds.length > 0) {
    const set = new Set(profile.selectedGroupIds);
    groups = appConfig.proxyGroups.filter(g => set.has(g.id));
  } else {
    groups = appConfig.proxyGroups;
  }
  return groups.map(g => ({
    ...g,
    proxies: g.proxies ? [...g.proxies] : undefined,
    use: g.use ? [...g.use] : undefined,
  }));
}

function getEffectiveSourcesForProfile(profile?: SubscriptionProfile, effectiveNodes?: ProxyNode[]): SubscriptionSource[] {
  if (!profile) return appConfig.sources;
  const usedSourceIds = new Set<string>();
  if (Array.isArray(effectiveNodes)) {
    effectiveNodes.forEach(n => {
      if (n.sourceId) usedSourceIds.add(n.sourceId);
    });
  }
  if (Array.isArray(profile.nodeFilter?.sourceIds) && profile.nodeFilter.sourceIds.length > 0) {
    profile.nodeFilter.sourceIds.forEach(id => usedSourceIds.add(id));
  }
  if (usedSourceIds.size > 0) {
    return appConfig.sources.filter(s => usedSourceIds.has(s.id) || (s.id === 'custom' && usedSourceIds.has('custom')));
  }
  return appConfig.sources;
}

function getEffectiveRulesForProfile(profile: SubscriptionProfile): UnifiedRuleItem[] {
  if (Array.isArray(profile.selectedRuleIds) && profile.selectedRuleIds.length > 0) {
    const set = new Set(profile.selectedRuleIds);
    return appConfig.rulesList.filter(r => set.has(r.id));
  }
  return appConfig.rulesList;
}

function getEffectiveTemplateForProfile(profile: SubscriptionProfile, clientType: ClientType): ConfigTemplate | undefined {
  const customTplId = profile.templates?.[clientType];
  if (customTplId) {
    const found = appConfig.templates.find(t => t.id === customTplId);
    if (found) return found;
  }
  return appConfig.templates.find(t => t.type === clientType && t.isDefault) || appConfig.templates.find(t => t.type === clientType);
}

// ================= API ROUTES ================= //

// 1. Config & Settings
app.get('/api/config', (req, res) => {
  ensureCustomSource(appConfig);
  res.json({ success: true, data: appConfig });
});


app.post('/api/config/settings', (req, res) => {
  const { settings } = req.body;
  if (settings) {
    appConfig.settings = { ...appConfig.settings, ...settings };
    saveConfig(appConfig);
  }
  res.json({ success: true, data: appConfig.settings });
});

// 2. Custom Nodes Management (独立节点组专区)
app.get('/api/custom-nodes', (req, res) => {
  const sourceId = req.query.sourceId as string | undefined;
  if (sourceId) {
    const target = appConfig.sources.find(s => s.id === sourceId && (s.type === 'custom' || s.id === 'custom'));
    return res.json({ success: true, count: target?.nodes?.length || 0, data: target?.nodes || [] });
  }
  const customSrc = ensureCustomSource(appConfig);
  res.json({ success: true, count: customSrc.nodes?.length || 0, data: customSrc.nodes || [] });
});

app.post('/api/custom-nodes/import', (req, res) => {
  const { text, replaceAll, sourceId } = req.body;
  if (!text || typeof text !== 'string') {
    return res.status(400).json({ success: false, message: 'Text content required' });
  }

  // Find target custom source
  let targetSrc = sourceId
    ? appConfig.sources.find(s => s.id === sourceId && (s.type === 'custom' || s.id === 'custom'))
    : null;
  if (!targetSrc) {
    targetSrc = ensureCustomSource(appConfig);
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
  globalNodesCache = collectNodesFromSources(appConfig);

  res.json({
    success: true,
    count: targetSrc.nodes.length,
    added: parsedNodes.length,
    data: targetSrc.nodes,
    sourceId: targetSrc.id,
    proxyGroups: appConfig.proxyGroups,
  });
});

app.post('/api/custom-nodes', (req, res) => {
  let targetSrc = req.body.sourceId
    ? appConfig.sources.find(s => s.id === req.body.sourceId && (s.type === 'custom' || s.id === 'custom'))
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
  globalNodesCache = collectNodesFromSources(appConfig);

  res.json({
    success: true,
    data: newNode,
    count: targetSrc.nodes.length,
    sourceId: targetSrc.id,
    proxyGroups: appConfig.proxyGroups,
  });
});

const updateNodeHandler = (req: any, res: any) => {
  for (const s of appConfig.sources) {
    if (s.nodes) {
      const idx = s.nodes.findIndex(n => n.id === req.params.id);
      if (idx !== -1) {
        s.nodes[idx] = { ...s.nodes[idx], ...req.body };
        saveConfig(appConfig);
        globalNodesCache = collectNodesFromSources(appConfig);
        return res.json({ success: true, data: s.nodes[idx] });
      }
    }
  }
  return res.status(404).json({ success: false, message: 'Node not found' });
};

app.put('/api/custom-nodes/:id', updateNodeHandler);
app.put('/api/nodes/:id', updateNodeHandler);

app.delete('/api/custom-nodes/:id', (req, res) => {
  let deleted = false;
  let remainingCount = 0;
  let affectedNodes: ProxyNode[] = [];

  for (const s of appConfig.sources) {
    if ((s.type === 'custom' || s.id === 'custom') && s.nodes) {
      const prevLen = s.nodes.length;
      s.nodes = s.nodes.filter(n => n.id !== req.params.id);
      if (s.nodes.length !== prevLen) {
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
    globalNodesCache = collectNodesFromSources(appConfig);
    return res.json({ success: true, count: remainingCount, data: affectedNodes, message: 'Node deleted' });
  }

  return res.status(404).json({ success: false, message: 'Node not found' });
});

// 3. Network Sources Management (网络订阅源与自建节点组)
app.get('/api/sources', (req, res) => {
  ensureCustomSource(appConfig);
  res.json({ success: true, data: appConfig.sources });
});

// Add source: support both network subscription (url) and new custom node group (type: 'custom')
app.post('/api/sources', async (req, res) => {
  try {
    const sourceName = (req.body.name || '新节点组').trim();

    // 1. Create custom group if type is 'custom'
    if (req.body.type === 'custom') {
      const newCustomSource: SubscriptionSource = {
        id: `custom-${Date.now()}`,
        name: sourceName,
        url: '',
        enabled: req.body.enabled !== false,
        type: 'custom',
        nodeCount: 0,
        nodes: [],
        lastUpdated: new Date().toISOString(),
      };
      appConfig.sources.push(newCustomSource);
      saveConfig(appConfig);
      globalNodesCache = collectNodesFromSources(appConfig);
      return res.json({ success: true, count: 0, data: newCustomSource });
    }

    // 2. Create network subscription
    const sourceUrl = (req.body.url || '').trim();
    if (!sourceUrl) {
      return res.status(400).json({ success: false, message: '订阅链接不能为空' });
    }

    const newSource: SubscriptionSource = {
      id: `src-${Date.now()}`,
      name: sourceName,
      url: sourceUrl,
      enabled: req.body.enabled !== false,
      type: req.body.type || 'auto',
      nodeCount: 0,
      nodes: [],
    };

    // Auto-fetch nodes immediately if HTTP/HTTPS URL
    if (newSource.url.startsWith('http://') || newSource.url.startsWith('https://')) {
      try {
        console.log(`[Fetcher] Fetching nodes for newly added source [${sourceName}]: ${sourceUrl}`);
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

    // Automatically create a dedicated proxy group for this subscription source if not exists
    const existingGroupNames = new Set(appConfig.proxyGroups.map(g => g.name.toLowerCase()));
    const groupTag = `⚡️ ${sourceName}`;
    if (!existingGroupNames.has(groupTag.toLowerCase()) && !existingGroupNames.has(sourceName.toLowerCase())) {
      const newGroup: ProxyGroupItem = {
        id: `grp-src-${Date.now()}`,
        name: groupTag,
        type: 'urltest',
        use: [sourceName],
        tolerance: 50,
        interval: 300,
        url: 'https://www.google.com/generate_204',
      };
      appConfig.proxyGroups.push(newGroup);

      // Also add to '🚀 节点选择' if present
      const mainSelector = appConfig.proxyGroups.find(g => g.name === '🚀 节点选择');
      if (mainSelector) {
        if (!mainSelector.proxies) mainSelector.proxies = [];
        if (!mainSelector.proxies.includes(groupTag)) {
          mainSelector.proxies.unshift(groupTag);
        }
      }
    }

    saveConfig(appConfig);
    globalNodesCache = collectNodesFromSources(appConfig);

    res.json({ success: true, count: newSource.nodeCount, data: newSource });
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message || 'Failed to add subscription source' });
  }
});

app.put('/api/sources/:id', (req, res) => {
  const index = appConfig.sources.findIndex(s => s.id === req.params.id);
  if (index === -1) {
    return res.status(404).json({ success: false, message: 'Source not found' });
  }
  appConfig.sources[index] = { ...appConfig.sources[index], ...req.body };
  saveConfig(appConfig);
  globalNodesCache = collectNodesFromSources(appConfig);
  res.json({ success: true, data: appConfig.sources[index] });
});

app.delete('/api/sources/:id', (req, res) => {
  if (req.params.id === 'custom') {
    return res.status(400).json({ success: false, message: '默认独立节点组不能删除，可清空组内节点' });
  }
  appConfig.sources = appConfig.sources.filter(s => s.id !== req.params.id);
  saveConfig(appConfig);
  globalNodesCache = collectNodesFromSources(appConfig);
  res.json({ success: true, message: 'Source deleted' });
});

app.post('/api/sources/:id/refresh', async (req, res) => {
  const source = appConfig.sources.find(s => s.id === req.params.id);
  if (!source) {
    return res.status(404).json({ success: false, message: 'Source not found' });
  }
  try {
    const nodes = await fetchAndParseSource(source, appConfig.countryRules);
    source.nodes = nodes;
    source.nodeCount = nodes.length;
    source.lastUpdated = new Date().toISOString();
    saveConfig(appConfig);
    globalNodesCache = collectNodesFromSources(appConfig);
    res.json({ success: true, nodeCount: nodes.length, data: nodes });
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message || 'Fetch failed' });
  }
});

app.post('/api/sources/refresh-all', async (req, res) => {
  try {
    const all = await refreshAllSources(appConfig);
    const effective = applyExtractionRules(all, appConfig.rules);
    res.json({ success: true, totalNodes: all.length, effectiveNodes: effective.length });
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message || 'Refresh all failed' });
  }
});


// 3. Country Matching & Grouping Rules (国家/地区识别规则)
app.get('/api/country-rules', (req, res) => {
  res.json({ success: true, data: appConfig.countryRules || INITIAL_COUNTRY_RULES });
});

app.post('/api/country-rules', (req, res) => {
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

app.put('/api/country-rules/:id', (req, res) => {
  if (!appConfig.countryRules) appConfig.countryRules = [...INITIAL_COUNTRY_RULES];
  const idx = appConfig.countryRules.findIndex(r => r.id === req.params.id);
  if (idx === -1) return res.status(404).json({ success: false, message: 'Country rule not found' });
  appConfig.countryRules[idx] = { ...appConfig.countryRules[idx], ...req.body };
  saveConfig(appConfig);
  res.json({ success: true, data: appConfig.countryRules[idx] });
});

app.delete('/api/country-rules/:id', (req, res) => {
  if (!appConfig.countryRules) appConfig.countryRules = [...INITIAL_COUNTRY_RULES];
  appConfig.countryRules = appConfig.countryRules.filter(r => r.id !== req.params.id);
  saveConfig(appConfig);
  res.json({ success: true, message: 'Country rule deleted' });
});

app.post('/api/country-rules/reset', (req, res) => {
  appConfig.countryRules = [...INITIAL_COUNTRY_RULES];
  saveConfig(appConfig);
  res.json({ success: true, data: appConfig.countryRules });
});

// 4. Extraction & Rename Rules (节点抽取与清洗流水线)
app.get('/api/rules', (req, res) => {
  res.json({ success: true, data: appConfig.rules });
});

app.post('/api/rules', (req, res) => {
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

app.put('/api/rules/:id', (req, res) => {
  const index = appConfig.rules.findIndex(r => r.id === req.params.id);
  if (index === -1) {
    return res.status(404).json({ success: false, message: 'Rule not found' });
  }
  appConfig.rules[index] = { ...appConfig.rules[index], ...req.body };
  saveConfig(appConfig);
  res.json({ success: true, data: appConfig.rules[index] });
});

app.delete('/api/rules/:id', (req, res) => {
  appConfig.rules = appConfig.rules.filter(r => r.id !== req.params.id);
  saveConfig(appConfig);
  res.json({ success: true, message: 'Rule deleted' });
});

// 4. Effective Nodes
app.get('/api/nodes', async (req, res) => {
  try {
    const effective = await getEffectiveNodes();
    res.json({ success: true, totalCount: effective.length, data: effective });
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// 5. Proxy Groups Management (出口策略分组)
app.get('/api/groups', (req, res) => {
  res.json({ success: true, data: appConfig.proxyGroups });
});

app.post('/api/groups', (req, res) => {
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

app.post('/api/groups/batch-import', (req, res) => {
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

app.post('/api/groups/generate-country-presets', (req, res) => {
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
        type: src.id === 'custom' ? 'select' : 'urltest',
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

app.put('/api/groups/:id', (req, res) => {
  const idx = appConfig.proxyGroups.findIndex(g => g.id === req.params.id);
  if (idx === -1) return res.status(404).json({ success: false, message: 'Group not found' });
  appConfig.proxyGroups[idx] = { ...appConfig.proxyGroups[idx], ...req.body };
  saveConfig(appConfig);
  res.json({ success: true, data: appConfig.proxyGroups[idx] });
});

app.delete('/api/groups/:id', (req, res) => {
  appConfig.proxyGroups = appConfig.proxyGroups.filter(g => g.id !== req.params.id);
  saveConfig(appConfig);
  res.json({ success: true, message: 'Group deleted' });
});


// 6. Unified Rules Matrix Management (表格化规则与去向管理)
app.get('/api/rules/unified', (req, res) => {
  res.json({ success: true, data: appConfig.rulesList });
});

app.post('/api/rules/unified', (req, res) => {
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

app.post('/api/rules/import-local', (req, res) => {
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

app.post('/api/rules/import-remote', (req, res) => {
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

app.put('/api/rules/unified/:id', (req, res) => {
  const idx = appConfig.rulesList.findIndex(r => r.id === req.params.id);
  if (idx === -1) return res.status(404).json({ success: false, message: 'Rule not found' });
  appConfig.rulesList[idx] = { ...appConfig.rulesList[idx], ...req.body };
  saveConfig(appConfig);
  res.json({ success: true, data: appConfig.rulesList[idx] });
});

app.delete('/api/rules/unified/:id', (req, res) => {
  appConfig.rulesList = appConfig.rulesList.filter(r => r.id !== req.params.id);
  saveConfig(appConfig);
  res.json({ success: true, message: 'Rule deleted' });
});

app.post('/api/rules/unified/clear-all', (req, res) => {
  appConfig.rulesList = [];
  saveConfig(appConfig);
  res.json({ success: true, message: 'All rules cleared' });
});

app.get('/api/rules/unified/export-text', (req, res) => {
  const text = exportRulesToText(appConfig.rulesList);
  res.json({ success: true, text });
});

app.post('/api/rules/unified/batch-replace', (req, res) => {
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
app.get('/api/templates', (req, res) => {
  res.json({ success: true, data: appConfig.templates });
});

app.get('/api/templates/defaults', (req, res) => {
  const defaults: Record<string, string> = {
    singbox: loadDefaultTemplate('singbox'),
    mihomo: loadDefaultTemplate('mihomo'),
    loon: loadDefaultTemplate('loon'),
    quantumultx: loadDefaultTemplate('quantumultx'),
    egern: loadDefaultTemplate('egern'),
    shadowrocket: loadDefaultTemplate('shadowrocket'),
  };
  res.json({ success: true, data: defaults });
});

app.get('/api/templates/default/:type', (req, res) => {
  const type = req.params.type as ClientType;
  const content = loadDefaultTemplate(type);
  res.json({ success: true, type, content });
});

app.post('/api/templates', (req, res) => {
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

app.put('/api/templates/:id', (req, res) => {
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

app.post('/api/templates/:id/reset', (req, res) => {
  const index = appConfig.templates.findIndex(t => t.id === req.params.id);
  if (index === -1) {
    return res.status(404).json({ success: false, message: '模版未找到' });
  }
  const tpl = appConfig.templates[index];
  tpl.content = loadDefaultTemplate(tpl.type);
  appConfig.templates[index] = tpl;
  saveConfig(appConfig);
  return res.json({ success: true, data: tpl });
});

app.delete('/api/templates/:id', (req, res) => {
  if (appConfig.templates.length <= 1) {
    return res.status(400).json({ success: false, message: '至少保留一个模版' });
  }
  appConfig.templates = appConfig.templates.filter(t => t.id !== req.params.id);
  saveConfig(appConfig);
  res.json({ success: true, message: 'Template deleted' });
});

// 7. Profiles Management (多订阅中心)
app.get('/api/profiles', (req, res) => {
  res.json({ success: true, data: appConfig.profiles || [] });
});


app.post('/api/profiles', (req, res) => {
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

app.put('/api/profiles/:id', (req, res) => {
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

app.delete('/api/profiles/:id', (req, res) => {
  const { id } = req.params;
  if (!appConfig.profiles || appConfig.profiles.length <= 1) {
    return res.status(400).json({ success: false, message: '请至少保留一个订阅配置' });
  }
  appConfig.profiles = appConfig.profiles.filter(p => p.id !== id);
  saveConfig(appConfig);
  res.json({ success: true, message: '订阅已删除' });
});

app.post('/api/profiles/:id/refresh-token', (req, res) => {
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

// 8. Live Preview
app.post('/api/generate/preview', async (req, res) => {
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
      ? getEffectiveGroupsForProfile(targetProfile)
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
    if (targetType === 'mihomo') {
      output = generateMihomoConfig(templateContent, nodes, groups, rules, effectiveSources);
    } else if (targetType === 'singbox') {
      output = generateSingboxConfig(templateContent, nodes, groups, rules);
    } else if (targetType === 'loon') {
      const expand = Boolean(req.body?.expandNodes || req.query?.expand === 'true' || req.query?.expand === '1');
      output = generateLoonConfig(templateContent, nodes, groups, rules, effectiveSources, { expandNodes: expand });
    } else if (targetType === 'quantumultx') {
      const expand = Boolean(req.body?.expandNodes || req.query?.expand === 'true' || req.query?.expand === '1');
      output = generateQuantumultXConfig(templateContent, nodes, groups, rules, effectiveSources, { expandNodes: expand });
    } else if (targetType === 'egern') {
      const expand = Boolean(req.body?.expandNodes || req.query?.expand === 'true' || req.query?.expand === '1');
      output = generateEgernConfig(templateContent, nodes, groups, rules, effectiveSources, { expandNodes: expand });
    } else if (targetType === 'shadowrocket') {
      const isBase64 = req.body?.format === 'base64' || req.query?.format === 'base64';
      if (isBase64) {
        output = generateShadowrocketBase64(nodes);
      } else {
        const expand = req.body?.expandNodes !== false;
        output = generateShadowrocketConfig(templateContent, nodes, groups, rules, effectiveSources, { expandNodes: expand });
      }
    }

    res.json({ success: true, nodeCount: nodes.length, data: output });
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message || 'Generation failed' });
  }
});

// ================= CLIENT SUBSCRIPTION ENDPOINTS ================= //

async function handlePrivateSubRequest(req: express.Request, res: express.Response, forcedType?: ClientType) {
  const tokenParam = req.params.subToken;

  if (!tokenParam) {
    res.removeHeader('X-Powered-By');
    return res.status(404).type('text/plain').send('404 Not Found');
  }

  // Find profile by token
  const profile = (appConfig.profiles || []).find(p => p.token === tokenParam && p.enabled !== false);
  if (!profile) {
    res.removeHeader('X-Powered-By');
    return res.status(404).type('text/plain').send('404 Not Found');
  }

  try {
    const queryTarget = (req.query.target as string) || (req.query.type as string) || (req.params.target as string);
    const userAgent = req.headers['user-agent'];
    const detectedType = forcedType || detectClientType(userAgent, queryTarget, 'singbox');

    let tpl: ConfigTemplate | undefined;
    const tplId = req.query.template as string;
    if (tplId) {
      tpl = appConfig.templates.find(t => t.id === tplId || t.name === tplId);
    }
    if (!tpl) {
      tpl = getEffectiveTemplateForProfile(profile, detectedType);
    }

    const templateContent = tpl?.content || '';
    const nodes = await getEffectiveNodesForProfile(profile);
    const groups = getEffectiveGroupsForProfile(profile);
    const rules = getEffectiveRulesForProfile(profile);
    const sources = getEffectiveSourcesForProfile(profile, nodes);

    if (detectedType === 'mihomo') {
      const output = generateMihomoConfig(templateContent, nodes, groups, rules, sources);
      res.setHeader('Content-Type', 'text/yaml; charset=utf-8');
      res.setHeader('subscription-userinfo', 'upload=0; download=0; total=1073741824000; expire=0');
      return res.send(output);
    }

    if (detectedType === 'singbox') {
      const output = generateSingboxConfig(templateContent, nodes, groups, rules);
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
      return res.send(output);
    }

    if (detectedType === 'loon') {
      const expand = req.query.expand === 'true' || req.query.expand === '1' || req.query.node_list === 'true';
      const output = generateLoonConfig(templateContent, nodes, groups, rules, sources, { expandNodes: expand });
      res.setHeader('Content-Type', 'text/plain; charset=utf-8');
      return res.send(output);
    }

    if (detectedType === 'quantumultx') {
      const expand = req.query.expand === 'true' || req.query.expand === '1' || req.query.node_list === 'true';
      const output = generateQuantumultXConfig(templateContent, nodes, groups, rules, sources, { expandNodes: expand });
      res.setHeader('Content-Type', 'text/plain; charset=utf-8');
      res.setHeader('subscription-userinfo', 'upload=0; download=0; total=1073741824000; expire=0');
      return res.send(output);
    }

    if (detectedType === 'egern') {
      const expand = req.query.expand === 'true' || req.query.expand === '1' || req.query.node_list === 'true';
      const output = generateEgernConfig(templateContent, nodes, groups, rules, sources, { expandNodes: expand });
      res.setHeader('Content-Type', 'text/yaml; charset=utf-8');
      res.setHeader('subscription-userinfo', 'upload=0; download=0; total=1073741824000; expire=0');
      return res.send(output);
    }

    if (detectedType === 'shadowrocket') {
      const isBase64 = req.query.format === 'base64' || req.query.format === 'b64';
      if (isBase64) {
        const output = generateShadowrocketBase64(nodes);
        res.setHeader('Content-Type', 'text/plain; charset=utf-8');
        res.setHeader('subscription-userinfo', 'upload=0; download=0; total=1073741824000; expire=0');
        return res.send(output);
      }
      const expand = req.query.expand !== 'false' && req.query.expand !== '0';
      const output = generateShadowrocketConfig(templateContent, nodes, groups, rules, sources, { expandNodes: expand });
      res.setHeader('Content-Type', 'text/plain; charset=utf-8');
      res.setHeader('subscription-userinfo', 'upload=0; download=0; total=1073741824000; expire=0');
      return res.send(output);
    }

  } catch (err: any) {
    console.error('Subscription generation error:', err);
    res.status(500).send(`Generation error: ${err.message || err}`);
  }
}

// Secret Token Routes
app.get('/s/:subToken', (req, res) => handlePrivateSubRequest(req, res));
app.get('/s/:subToken/mihomo', (req, res) => handlePrivateSubRequest(req, res, 'mihomo'));
app.get('/s/:subToken/singbox', (req, res) => handlePrivateSubRequest(req, res, 'singbox'));
app.get('/s/:subToken/loon', (req, res) => handlePrivateSubRequest(req, res, 'loon'));
app.get('/s/:subToken/qx', (req, res) => handlePrivateSubRequest(req, res, 'quantumultx'));
app.get('/s/:subToken/quantumultx', (req, res) => handlePrivateSubRequest(req, res, 'quantumultx'));
app.get('/s/:subToken/egern', (req, res) => handlePrivateSubRequest(req, res, 'egern'));
app.get('/s/:subToken/shadowrocket', (req, res) => handlePrivateSubRequest(req, res, 'shadowrocket'));
app.get('/s/:subToken/rocket', (req, res) => handlePrivateSubRequest(req, res, 'shadowrocket'));
app.get('/s/:subToken/:target', (req, res) => {
  const target = req.params.target;
  if (
    target === 'mihomo' ||
    target === 'singbox' ||
    target === 'loon' ||
    target === 'quantumultx' ||
    target === 'qx' ||
    target === 'egern' ||
    target === 'shadowrocket' ||
    target === 'rocket'
  ) {
    const mapped = target === 'qx' ? 'quantumultx' : (target === 'rocket' ? 'shadowrocket' : target);
    return handlePrivateSubRequest(req, res, mapped as ClientType);
  }
  return handlePrivateSubRequest(req, res);
});


// Legacy /sub routes return silent 404
app.all('/sub', (req, res) => {
  res.removeHeader('X-Powered-By');
  res.status(404).type('text/plain').send('404 Not Found');
});
app.all('/sub/*', (req, res) => {
  res.removeHeader('X-Powered-By');
  res.status(404).type('text/plain').send('404 Not Found');
});

const webDistPath = path.resolve(process.cwd(), 'web/dist');
if (fs.existsSync(webDistPath)) {
  app.use(express.static(webDistPath));
  app.get('*', (req, res) => {
    if (!req.path.startsWith('/api') && !req.path.startsWith('/s/')) {
      res.sendFile(path.join(webDistPath, 'index.html'));
    }
  });
}

app.listen(PORT, () => {
  console.log('-------------------------------------------------------');
  console.log(`SubOne listening on http://localhost:${PORT}`);
  console.log(`Authentication: ${appConfig.settings.adminPassword ? 'Enabled' : 'Disabled (No password set)'}`);
  if (appConfig.profiles && appConfig.profiles.length > 0) {
    console.log(`Default subscription: http://localhost:${PORT}/s/${appConfig.profiles[0].token}`);
  }
  console.log('-------------------------------------------------------');
});
