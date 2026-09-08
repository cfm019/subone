import { ExtractionRule, ProxyNode } from '../../types/index.js';

export function applyExtractionRules(
  allNodes: ProxyNode[],
  rules: ExtractionRule[]
): ProxyNode[] {
  const activeRules = rules.filter(r => r.enabled);

  // If no active rules, return all nodes with deduplication and name sanitization
  if (activeRules.length === 0) {
    return deduplicateNodes(allNodes);
  }

  const selectedNodes: ProxyNode[] = [];
  const matchedNodeIds = new Set<string>();

  for (const rule of activeRules) {
    // 1. Source filter
    const sourceMatchedNodes = allNodes.filter(node => {
      if (!rule.sourceIds || rule.sourceIds.length === 0) return true;
      return node.sourceId && rule.sourceIds.includes(node.sourceId);
    });

    for (const node of sourceMatchedNodes) {
      // 2. Country filter
      if (rule.targetCountries && rule.targetCountries.length > 0) {
        if (!node.countryCode || !rule.targetCountries.includes(node.countryCode)) {
          continue;
        }
      }

      // 3. Keyword include filter
      if (rule.includeKeywords && rule.includeKeywords.length > 0) {
        const matchesAnyInclude = rule.includeKeywords.some(kw =>
          node.name.toLowerCase().includes(kw.toLowerCase())
        );
        if (!matchesAnyInclude) continue;
      }

      // 4. Keyword exclude filter
      if (rule.excludeKeywords && rule.excludeKeywords.length > 0) {
        const matchesAnyExclude = rule.excludeKeywords.some(kw =>
          node.name.toLowerCase().includes(kw.toLowerCase())
        );
        if (matchesAnyExclude) continue;
      }

      // 5. Regex include filter
      if (rule.includeRegex) {
        try {
          const clean = rule.includeRegex.trim().replace(/^\(\?i\)/i, '').replace(/\(\?i\)/gi, '');
          const reg = new RegExp(clean, 'i');
          if (!reg.test(node.name)) continue;
        } catch (e) {
          console.error(`Invalid includeRegex: ${rule.includeRegex}`);
        }
      }

      // 6. Regex exclude filter
      if (rule.excludeRegex) {
        try {
          const clean = rule.excludeRegex.trim().replace(/^\(\?i\)/i, '').replace(/\(\?i\)/gi, '');
          const reg = new RegExp(clean, 'i');
          if (reg.test(node.name)) continue;
        } catch (e) {
          console.error(`Invalid excludeRegex: ${rule.excludeRegex}`);
        }
      }

      // Clone node and apply rename patterns
      const nodeCopy: ProxyNode = { ...node };
      if (rule.renamePattern) {
        let newName = nodeCopy.name;
        if (rule.renamePattern.replaceFrom) {
          try {
            const reg = new RegExp(rule.renamePattern.replaceFrom, 'g');
            newName = newName.replace(reg, rule.renamePattern.replaceTo || '');
          } catch (e) {
            newName = newName.split(rule.renamePattern.replaceFrom).join(rule.renamePattern.replaceTo || '');
          }
        }
        if (rule.renamePattern.prefix) {
          newName = `${rule.renamePattern.prefix}${newName}`;
        }
        if (rule.renamePattern.suffix) {
          newName = `${newName}${rule.renamePattern.suffix}`;
        }
        nodeCopy.name = newName.trim();
      }

      selectedNodes.push(nodeCopy);
      matchedNodeIds.add(node.id);
    }
  }

  return deduplicateNodes(selectedNodes);
}

export function deduplicateNodes(nodes: ProxyNode[]): ProxyNode[] {
  const nameCounts = new Map<string, number>();
  const result: ProxyNode[] = [];

  for (const node of nodes) {
    let name = node.name.trim() || `${node.type.toUpperCase()}-${node.server}`;
    
    // Ensure unique name
    if (nameCounts.has(name)) {
      const count = nameCounts.get(name)! + 1;
      nameCounts.set(name, count);
      name = `${name} (${count})`;
    } else {
      nameCounts.set(name, 1);
    }

    result.push({
      ...node,
      name,
    });
  }

  return result;
}
