import yaml from 'js-yaml';
import { ProxyNode, ProxyGroupItem, UnifiedRuleItem, SubscriptionSource } from '../../types/index.js';
import { injectUnifiedToEgern } from './rule-injector.js';
import { nodeToMihomoProxy } from './mihomo-generator.js';

export function nodeToEgernProxy(node: ProxyNode): any {
  // Egern uses the modern proxy specification compatible with Mihomo's proxy object schema
  return nodeToMihomoProxy(node);
}

export function generateEgernConfig(
  templateYaml: string,
  nodes: ProxyNode[],
  proxyGroups: ProxyGroupItem[] = [],
  rulesList: UnifiedRuleItem[] = [],
  sources: SubscriptionSource[] = [],
  options?: { expandNodes?: boolean }
): string {
  let doc: any;
  try {
    doc = yaml.load(templateYaml);
  } catch (e) {
    doc = {};
  }

  if (!doc || typeof doc !== 'object') {
    doc = {};
  }

  const expandNodes = Boolean(options?.expandNodes);
  const nodesToWrite = expandNodes ? nodes : nodes.filter(n => n.sourceId === 'custom' || !n.sourceId);
  const egernProxies = nodesToWrite.map(nodeToEgernProxy);

  doc = injectUnifiedToEgern(doc, egernProxies, nodes, proxyGroups, rulesList, sources, options);

  return yaml.dump(doc, { indent: 2, lineWidth: -1 });
}
