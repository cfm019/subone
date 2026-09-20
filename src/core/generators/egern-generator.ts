import yaml from 'js-yaml';
import { ProxyNode, ProxyGroupItem, UnifiedRuleItem, SubscriptionSource } from '../../types/index.js';
import { injectUnifiedToEgern } from './rule-injector.js';
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
