import express from 'express';
import yaml from 'js-yaml';
import { getAppConfig, getBaseUrl } from '../context.js';
import { detectClientType, ClientType } from '../../core/parser/ua-detector.js';
import { ProxyNode, ConfigTemplate } from '../../types/index.js';
import { applyExtractionRules } from '../../core/filter/extractor.js';
import { generateMihomoConfig, nodeToMihomoProxy } from '../../core/generators/mihomo-generator.js';
import { generateSingboxConfig } from '../../core/generators/singbox-generator.js';
import { generateLoonConfig, nodeToLoonProxy } from '../../core/generators/loon-generator.js';
import { generateQuantumultXConfig, nodeToQuantumultXProxy } from '../../core/generators/quantumultx-generator.js';
import { generateEgernConfig, nodeToEgernProxy } from '../../core/generators/egern-generator.js';
import { generateShadowrocketConfig, generateShadowrocketBase64 } from '../../core/generators/shadowrocket-generator.js';
import {
  getEffectiveNodes,
  getEffectiveNodesForProfile,
  getEffectiveGroupsForProfile,
  getEffectiveRulesForProfile,
  getEffectiveSourcesForProfile,
  getEffectiveTemplateForProfile,
  computeFilterSourceNodes,
} from '../services/profile-service.js';

export const subRouter = express.Router();

async function handlePrivateSubRequest(req: express.Request, res: express.Response, forcedType?: ClientType) {
  const tokenParam = req.params.subToken;
  const appConfig = getAppConfig();

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
    const groups = getEffectiveGroupsForProfile(profile, nodes);
    const rules = getEffectiveRulesForProfile(profile);
    const sources = getEffectiveSourcesForProfile(profile, nodes);
    const baseUrl = getBaseUrl(req);

    if (detectedType === 'mihomo') {
      const expand = req.query.expand === 'true' || req.query.expand === '1' || req.query.node_list === 'true';
      const output = generateMihomoConfig(templateContent, nodes, groups, rules, sources, {
        expandNodes: expand,
        baseUrl,
        subToken: tokenParam
      });
      res.setHeader('Content-Type', 'text/yaml; charset=utf-8');
      res.setHeader('subscription-userinfo', 'upload=0; download=0; total=1073741824000; expire=0');
      return res.send(output);
    }

    if (detectedType === 'singbox') {
      const output = generateSingboxConfig(templateContent, nodes, groups, rules, sources);
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
      return res.send(output);
    }

    if (detectedType === 'loon') {
      const expand = req.query.expand === 'true' || req.query.expand === '1' || req.query.node_list === 'true';
      const output = generateLoonConfig(templateContent, nodes, groups, rules, sources, {
        expandNodes: expand,
        baseUrl,
        subToken: tokenParam
      });
      res.setHeader('Content-Type', 'text/plain; charset=utf-8');
      return res.send(output);
    }

    if (detectedType === 'quantumultx') {
      const expand = req.query.expand === 'true' || req.query.expand === '1' || req.query.node_list === 'true';
      const output = generateQuantumultXConfig(templateContent, nodes, groups, rules, sources, {
        expandNodes: expand,
        baseUrl,
        subToken: tokenParam
      });
      res.setHeader('Content-Type', 'text/plain; charset=utf-8');
      res.setHeader('subscription-userinfo', 'upload=0; download=0; total=1073741824000; expire=0');
      return res.send(output);
    }

    if (detectedType === 'egern') {
      const expand = req.query.expand === 'true' || req.query.expand === '1' || req.query.node_list === 'true';
      const output = generateEgernConfig(templateContent, nodes, groups, rules, sources, {
        expandNodes: expand,
        baseUrl,
        subToken: tokenParam
      });
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

async function handleSourceSubRequest(req: express.Request, res: express.Response, forcedTarget?: ClientType) {
  const tokenParam = req.params.subToken;
  const sourceIdParam = req.params.sourceId;
  const appConfig = getAppConfig();

  if (!tokenParam || !sourceIdParam) {
    res.removeHeader('X-Powered-By');
    return res.status(404).type('text/plain').send('404 Not Found');
  }

  const profile = (appConfig.profiles || []).find(p => p.token === tokenParam && p.enabled !== false);
  if (!profile) {
    res.removeHeader('X-Powered-By');
    return res.status(404).type('text/plain').send('404 Not Found');
  }

  const cleanId = sourceIdParam.trim().toLowerCase();
  const matchedSource = (appConfig.sources || []).find(s =>
    s.enabled && (
      s.id.toLowerCase() === cleanId ||
      s.name.trim().toLowerCase() === cleanId ||
      (cleanId === 'custom' && (s.type === 'custom' || s.id === 'custom'))
    )
  );

  if (!matchedSource) {
    res.removeHeader('X-Powered-By');
    return res.status(404).type('text/plain').send('404 Not Found');
  }

  try {
    let sourceNodes: ProxyNode[] = [];
    if (matchedSource.type === 'filter') {
      const allPhysicalNodes = await getEffectiveNodes();
      sourceNodes = computeFilterSourceNodes(matchedSource, allPhysicalNodes);
    } else {
      sourceNodes = matchedSource.nodes || [];
    }

    // 应用提取规则
    sourceNodes = applyExtractionRules(sourceNodes, appConfig.rules);

    const queryTarget = (req.query.target as string) || (req.query.type as string) || (req.params.target as string);
    const userAgent = req.headers['user-agent'];
    const detectedType = forcedTarget || detectClientType(userAgent, queryTarget, 'loon');

    if (detectedType === 'loon') {
      const proxyLines = sourceNodes.map(nodeToLoonProxy);
      const output = ['[Proxy]', ...proxyLines].join('\n');
      res.setHeader('Content-Type', 'text/plain; charset=utf-8');
      res.setHeader('subscription-userinfo', 'upload=0; download=0; total=1073741824000; expire=0');
      return res.send(output);
    }

    if (detectedType === 'mihomo') {
      const proxies = sourceNodes.map(nodeToMihomoProxy);
      const output = yaml.dump({ proxies }, { indent: 2, lineWidth: -1, noRefs: true });
      res.setHeader('Content-Type', 'text/yaml; charset=utf-8');
      res.setHeader('subscription-userinfo', 'upload=0; download=0; total=1073741824000; expire=0');
      return res.send(output);
    }

    if (detectedType === 'quantumultx') {
      const proxyLines = sourceNodes.map(nodeToQuantumultXProxy);
      const output = proxyLines.join('\n');
      res.setHeader('Content-Type', 'text/plain; charset=utf-8');
      res.setHeader('subscription-userinfo', 'upload=0; download=0; total=1073741824000; expire=0');
      return res.send(output);
    }

    if (detectedType === 'egern') {
      const proxies = sourceNodes.map(nodeToEgernProxy);
      const output = yaml.dump({ proxies }, { indent: 2, lineWidth: -1 });
      res.setHeader('Content-Type', 'text/yaml; charset=utf-8');
      res.setHeader('subscription-userinfo', 'upload=0; download=0; total=1073741824000; expire=0');
      return res.send(output);
    }

    const output = generateShadowrocketBase64(sourceNodes);
    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    res.setHeader('subscription-userinfo', 'upload=0; download=0; total=1073741824000; expire=0');
    return res.send(output);
  } catch (err: any) {
    console.error('Source subscription generation error:', err);
    res.status(500).send(`Generation error: ${err.message || err}`);
  }
}

// Secret Token Routes
subRouter.get('/s/:subToken/source/:sourceId/loon', (req, res) => handleSourceSubRequest(req, res, 'loon'));
subRouter.get('/s/:subToken/source/:sourceId/:target', (req, res) => {
  const target = req.params.target;
  const mapped = target === 'qx' ? 'quantumultx' : (target === 'rocket' ? 'shadowrocket' : target);
  return handleSourceSubRequest(req, res, mapped as ClientType);
});
subRouter.get('/s/:subToken/source/:sourceId', (req, res) => handleSourceSubRequest(req, res));

subRouter.get('/s/:subToken', (req, res) => handlePrivateSubRequest(req, res));
subRouter.get('/s/:subToken/mihomo', (req, res) => handlePrivateSubRequest(req, res, 'mihomo'));
subRouter.get('/s/:subToken/singbox', (req, res) => handlePrivateSubRequest(req, res, 'singbox'));
subRouter.get('/s/:subToken/loon', (req, res) => handlePrivateSubRequest(req, res, 'loon'));
subRouter.get('/s/:subToken/qx', (req, res) => handlePrivateSubRequest(req, res, 'quantumultx'));
subRouter.get('/s/:subToken/quantumultx', (req, res) => handlePrivateSubRequest(req, res, 'quantumultx'));
subRouter.get('/s/:subToken/egern', (req, res) => handlePrivateSubRequest(req, res, 'egern'));
subRouter.get('/s/:subToken/shadowrocket', (req, res) => handlePrivateSubRequest(req, res, 'shadowrocket'));
subRouter.get('/s/:subToken/rocket', (req, res) => handlePrivateSubRequest(req, res, 'shadowrocket'));
subRouter.get('/s/:subToken/:target', (req, res) => {
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
