import yaml from 'js-yaml';
import { ProxyGroupItem, UnifiedRuleItem, RuleType } from '../../types/index.js';

export function parseProxyGroupsText(text: string): ProxyGroupItem[] {
  const content = text.trim();
  if (!content) return [];

  const groups: ProxyGroupItem[] = [];
  const groupNames = new Set<string>();

  const addGroup = (name: string, type: 'select' | 'urltest' | 'fallback' | 'direct' = 'select', extra: Partial<ProxyGroupItem> = {}) => {
    const cleanName = name.trim();
    if (!cleanName || groupNames.has(cleanName)) return;
    groupNames.add(cleanName);
    groups.push({
      id: `group-${Date.now()}-${groups.length}`,
      name: cleanName,
      type,
      ...extra,
    });
  };

  // 1. Try JSON
  if (content.startsWith('{') || content.startsWith('[')) {
    try {
      const parsed = JSON.parse(content);
      const list = Array.isArray(parsed) ? parsed : (parsed.outbounds || parsed['proxy-groups'] || []);
      if (Array.isArray(list)) {
        list.forEach(item => {
          const name = item.tag || item.name;
          let type: any = 'select';
          if (item.type === 'urltest' || item.type === 'url-test') type = 'urltest';
          if (item.type === 'fallback') type = 'fallback';
          if (item.type === 'direct') type = 'direct';
          if (name) {
            const rawProxies = item.outbounds || item.proxies;
            const rawUse = item.use;
            addGroup(name, type, {
              proxies: Array.isArray(rawProxies) ? rawProxies : undefined,
              use: Array.isArray(rawUse) ? rawUse : (typeof rawUse === 'string' ? [rawUse] : undefined),
              filter: item.filter,
              url: item.url,
              tolerance: item.tolerance,
              interval: item.interval,
            });
          }
        });
        if (groups.length > 0) return groups;
      }
    } catch (e) {}
  }

  // 2. Try YAML
  if (content.includes('proxy-groups:') || content.includes('name:') || content.includes('type:')) {
    try {
      const doc = yaml.load(content) as any;
      const list = Array.isArray(doc) ? doc : (doc['proxy-groups'] || doc.outbounds || []);
      if (Array.isArray(list)) {
        list.forEach(item => {
          const name = item.name || item.tag;
          let type: any = 'select';
          if (item.type === 'url-test' || item.type === 'urltest') type = 'urltest';
          if (item.type === 'fallback') type = 'fallback';
          if (item.type === 'direct') type = 'direct';
          if (name) {
            const rawProxies = item.proxies || item.outbounds;
            const rawUse = item.use;
            addGroup(name, type, {
              proxies: Array.isArray(rawProxies) ? rawProxies : undefined,
              use: Array.isArray(rawUse) ? rawUse : (typeof rawUse === 'string' ? [rawUse] : undefined),
              filter: item.filter,
              url: item.url,
              tolerance: item.tolerance,
              interval: item.interval,
            });
          }
        });
        if (groups.length > 0) return groups;
      }
    } catch (e) {}
  }

  // 3. Line by line parsing (Loon format or simple comma list)
  const lines = content.split(/[\r\n]+/).map(l => l.trim()).filter(Boolean);
  lines.forEach(line => {
    if (line.startsWith('#') || line.startsWith('//') || line.startsWith('[')) return;

    if (line.includes('=')) {
      // Loon format: Name = select,option1,option2...
      const [name, rest] = line.split('=');
      const parts = rest.split(',').map(s => s.trim());
      const typeStr = parts[0] || 'select';
      const type = typeStr.includes('url-test') || typeStr.includes('urltest') ? 'urltest' : 'select';
      addGroup(name.trim(), type, {
        proxies: parts.slice(1),
      });
    } else {
      // Plain name or comma list
      const parts = line.split(/[,;]/).map(s => s.trim()).filter(Boolean);
      if (parts.length > 0) {
        addGroup(parts[0], 'select');
      }
    }
  });

  return groups;
}

export function parseLocalRulesText(
  text: string,
  defaultOutbound: string = '🎯 本地直连'
): UnifiedRuleItem[] {
  return parseUnifiedRulesText(text, defaultOutbound).filter(r => r.kind === 'local');
}

export function parseRemoteRulesText(
  text: string,
  defaultOutbound: string = '🚀 节点选择'
): UnifiedRuleItem[] {
  return parseUnifiedRulesText(text, defaultOutbound).filter(r => r.kind === 'remote');
}

export function parseUnifiedRulesText(
  text: string,
  defaultOutbound: string = '🎯 本地直连'
): UnifiedRuleItem[] {
  const content = text.trim();
  if (!content) return [];

  const rules: UnifiedRuleItem[] = [];

  // 1. Try JSON (Sing-box rules format)
  if (content.startsWith('{') || content.startsWith('[')) {
    try {
      const parsed = JSON.parse(content);
      const list = Array.isArray(parsed) ? parsed : (parsed.rules || parsed.route?.rules || []);
      if (Array.isArray(list)) {
        list.forEach((item, idx) => {
          const outbound = item.outbound || defaultOutbound;
          if (item.domain_suffix) {
            const payload = Array.isArray(item.domain_suffix) ? item.domain_suffix.join(', ') : String(item.domain_suffix);
            rules.push({
              id: `r-json-${Date.now()}-${idx}`,
              name: `域名后缀: ${payload.slice(0, 30)}`,
              kind: 'local',
              type: 'DOMAIN-SUFFIX',
              payload,
              outbound,
              enabled: true,
            });
          }
          if (item.domain_keyword) {
            const payload = Array.isArray(item.domain_keyword) ? item.domain_keyword.join(', ') : String(item.domain_keyword);
            rules.push({
              id: `r-json-kw-${Date.now()}-${idx}`,
              name: `关键字: ${payload.slice(0, 30)}`,
              kind: 'local',
              type: 'DOMAIN-KEYWORD',
              payload,
              outbound,
              enabled: true,
            });
          }
          if (item.ip_cidr) {
            const payload = Array.isArray(item.ip_cidr) ? item.ip_cidr.join(', ') : String(item.ip_cidr);
            rules.push({
              id: `r-json-ip-${Date.now()}-${idx}`,
              name: `IP网段: ${payload.slice(0, 30)}`,
              kind: 'local',
              type: 'IP-CIDR',
              payload,
              outbound,
              enabled: true,
            });
          }
          if (item.geoip) {
            const payload = Array.isArray(item.geoip) ? item.geoip.join(', ') : String(item.geoip);
            rules.push({
              id: `r-json-geo-${Date.now()}-${idx}`,
              name: `GeoIP: ${payload}`,
              kind: 'local',
              type: 'GEOIP',
              payload,
              outbound,
              enabled: true,
            });
          }
          if (item.rule_set) {
            const urls = Array.isArray(item.rule_set) ? item.rule_set : [item.rule_set];
            urls.forEach((url: string, uIdx: number) => {
              rules.push({
                id: `r-json-rs-${Date.now()}-${idx}-${uIdx}`,
                name: url.split('/').pop() || `规则集 ${idx + 1}`,
                kind: 'remote',
                type: 'RULE-SET',
                payload: url,
                outbound,
                enabled: true,
              });
            });
          }
        });
        if (rules.length > 0) return rules;
      }
    } catch (e) {}
  }

  // 2. Line-by-line parsing with section & inline comment support (Clash / Loon / Surge / Sing-box format)
  const lines = content.split(/[\r\n]+/);
  let currentSection = '';

  lines.forEach((rawLine, idx) => {
    let line = rawLine.trim();
    if (!line) return;

    // Track section headers like: # 远程运维 SSH 地址
    if (line.startsWith('#') || line.startsWith('//')) {
      const sectionText = line.replace(/^[#\/]+/, '').trim();
      if (sectionText && !sectionText.includes('=====')) {
        currentSection = sectionText;
      }
      return;
    }

    if (line.startsWith('[')) return; // INI section header like [Rule]

    // Extract inline comment if any: only match comments with leading space/delimiter to avoid cutting URLs like https://...
    let inlineComment = '';
    const commentMatch = line.match(/\s+(?:#|\/\/)\s*(.*)$/);
    if (commentMatch && commentMatch.index !== undefined) {
      inlineComment = commentMatch[1].trim();
      line = line.slice(0, commentMatch.index).trim();
    } else {
      const hashIdx = line.indexOf('#');
      if (hashIdx !== -1 && !line.slice(0, hashIdx).includes('://')) {
        inlineComment = line.slice(hashIdx + 1).trim();
        line = line.slice(0, hashIdx).trim();
      }
    }

    // Strip leading dash or bullet
    if (line.startsWith('-')) line = line.slice(1).trim();
    if (!line) return;

    // Parse comma separated rule
    const parts = line.split(',').map(s => s.trim().replace(/^["']|["']$/g, ''));
    if (parts.length < 1) return;

    const firstToken = parts[0].toUpperCase();

    // Check if it's a standalone URL (Remote Rule)
    if (firstToken.startsWith('HTTP://') || firstToken.startsWith('HTTPS://')) {
      let url = parts[0];
      let policy = defaultOutbound;
      let tag = inlineComment;

      parts.slice(1).forEach(p => {
        if (p.startsWith('policy=')) policy = p.replace('policy=', '').trim();
        if (p.startsWith('tag=')) tag = p.replace('tag=', '').trim();
      });

      if (!tag) {
        const match = url.match(/(geosite|geoip)\/([^/?#]+)\.(srs|yaml|mrs|list)/i);
        if (match) {
          tag = `${match[1].toLowerCase()}-${match[2].toLowerCase()}`;
        } else {
          const fileMatch = url.match(/\/([^/?#]+)\.(srs|yaml|mrs|list)/i);
          tag = fileMatch ? fileMatch[1].toLowerCase() : `ruleset_${idx + 1}`;
        }
      }

      let format: any = 'binary';
      if (url.endsWith('.mrs')) format = 'mrs';
      else if (url.endsWith('.yaml') || url.endsWith('.yml')) format = 'yaml';
      else if (url.endsWith('.list') || url.endsWith('.txt')) format = 'text';

      rules.push({
        id: `r-line-${Date.now()}-${idx}`,
        name: tag,
        kind: 'remote',
        type: 'RULE-SET',
        payload: url,
        format,
        outbound: policy,
        enabled: true,
      });
      return;
    }

    if (parts.length >= 2) {
      let type: RuleType = 'OTHER';
      let isRemote = false;

      if (firstToken.includes('DOMAIN-SUFFIX') || firstToken === 'DOMAIN-SUFFIX') type = 'DOMAIN-SUFFIX';
      else if (firstToken.includes('DOMAIN-KEYWORD') || firstToken === 'DOMAIN-KEYWORD') type = 'DOMAIN-KEYWORD';
      else if (firstToken === 'DOMAIN' || firstToken === 'HOST') type = 'DOMAIN';
      else if (firstToken.includes('IP-CIDR') || firstToken === 'IP-CIDR' || firstToken === 'IP-CIDR6') type = 'IP-CIDR';
      else if (firstToken === 'GEOIP') type = 'GEOIP';
      else if (firstToken === 'FINAL' || firstToken === 'MATCH') type = 'FINAL';
      else if (firstToken === 'RULE-SET') {
        type = 'RULE-SET';
        isRemote = true;
      }

      if (type === 'FINAL') {
        rules.push({
          id: `r-line-${Date.now()}-${idx}`,
          name: inlineComment || 'FINAL (漏网之鱼)',
          kind: 'local',
          type: 'FINAL',
          payload: 'ALL',
          outbound: parts[1] || defaultOutbound,
          enabled: true,
        });
        return;
      }

      // Parse payload(s) and outbound
      const rawTokens = parts.slice(1);
      // Filter out trailing 'no-resolve' if present
      if (rawTokens.length > 1 && rawTokens[rawTokens.length - 1].toLowerCase() === 'no-resolve') {
        rawTokens.pop();
      }

      let outbound = defaultOutbound;
      let payloadTokens: string[] = [];

      if (rawTokens.length === 1) {
        payloadTokens = [rawTokens[0]];
        outbound = defaultOutbound;
      } else {
        outbound = rawTokens[rawTokens.length - 1];
        payloadTokens = rawTokens.slice(0, rawTokens.length - 1);
      }

      const combinedPayload = payloadTokens.join(', ');
      if (combinedPayload.startsWith('http://') || combinedPayload.startsWith('https://')) {
        isRemote = true;
        type = 'RULE-SET';
      }

      let ruleName = inlineComment;
      if (!ruleName) {
        if (isRemote) {
          const match = combinedPayload.match(/(geosite|geoip)\/([^/?#]+)\.(srs|yaml|mrs|list)/i);
          if (match) {
            ruleName = `${match[1].toLowerCase()}-${match[2].toLowerCase()}`;
          } else {
            const fileMatch = combinedPayload.match(/\/([^/?#]+)\.(srs|yaml|mrs|list)/i);
            ruleName = fileMatch ? fileMatch[1].toLowerCase() : `ruleset_${idx + 1}`;
          }
        } else {
          ruleName = currentSection ? `${currentSection}` : `${type}: ${combinedPayload.slice(0, 30)}`;
        }
      }

      let format: any = undefined;
      if (isRemote) {
        if (combinedPayload.endsWith('.mrs')) format = 'mrs';
        else if (combinedPayload.endsWith('.yaml') || combinedPayload.endsWith('.yml')) format = 'yaml';
        else if (combinedPayload.endsWith('.list') || combinedPayload.endsWith('.txt')) format = 'text';
        else format = 'binary';
      }

      rules.push({
        id: `r-line-${Date.now()}-${idx}`,
        name: ruleName,
        kind: isRemote ? 'remote' : 'local',
        type,
        payload: combinedPayload,
        format,
        outbound,
        enabled: true,
      });
    }
  });

  return aggregateRules(rules);
}

export function aggregateRules(rules: UnifiedRuleItem[]): UnifiedRuleItem[] {
  const result: UnifiedRuleItem[] = [];
  const map = new Map<string, UnifiedRuleItem>();

  for (const rule of rules) {
    if (!rule || !rule.payload) continue;

    // Aggregate local rules by (kind, remark/name, type, outbound, enabled)
    if (rule.kind === 'local' && rule.type !== 'FINAL') {
      const trimmedName = (rule.name || '').trim();
      const isAutoName = !trimmedName || trimmedName.startsWith(rule.type + ':') || trimmedName.startsWith(rule.type + ' :');
      
      const groupKey = !isAutoName
        ? `local::${rule.type}::${rule.outbound}::${rule.enabled}::${trimmedName}`
        : `local::${rule.type}::${rule.outbound}::${rule.enabled}::AUTONAME`;

      const existing = map.get(groupKey);
      if (existing) {
        const existingItems = existing.payload.split(/[,;\n]+/).map(s => s.trim()).filter(Boolean);
        const newItems = rule.payload.split(/[,;\n]+/).map(s => s.trim()).filter(Boolean);
        const set = new Set(existingItems);
        for (const item of newItems) {
          if (!set.has(item)) {
            existingItems.push(item);
            set.add(item);
          }
        }
        existing.payload = existingItems.join(', ');
        if (isAutoName && existing.name.startsWith(existing.type + ':')) {
          existing.name = `${existing.type}: ${existing.payload.slice(0, 30)}${existing.payload.length > 30 ? '...' : ''}`;
        }
        continue;
      } else {
        const cloned = { ...rule };
        map.set(groupKey, cloned);
        result.push(cloned);
      }
    } else if (rule.kind === 'remote') {
      // Deduplicate remote rules with identical URL, outbound, and enabled status
      const groupKey = `remote::${rule.payload.trim()}::${rule.outbound}::${rule.enabled}`;
      const existing = map.get(groupKey);
      if (existing) {
        continue;
      } else {
        const cloned = { ...rule };
        map.set(groupKey, cloned);
        result.push(cloned);
      }
    } else {
      result.push({ ...rule });
    }
  }

  return result;
}

export function exportRulesToText(rules: UnifiedRuleItem[]): string {
  const localRules = rules.filter(r => r.kind === 'local');
  const remoteRules = rules.filter(r => r.kind === 'remote');

  const lines: string[] = [];

  if (localRules.length > 0) {
    lines.push('# ================= 本地分流规则 (Local Rules) =================');
    localRules.forEach(r => {
      const comment = r.name && !r.name.startsWith(r.type) ? `  # ${r.name}` : '';
      if (r.type === 'FINAL') {
        lines.push(`- FINAL,${r.outbound}${comment}`);
      } else {
        const payloads = r.payload.split(/[,;\n]+/).map(p => p.trim()).filter(Boolean);
        if (payloads.length > 1) {
          payloads.forEach(p => {
            lines.push(`- ${r.type},${p},${r.outbound},no-resolve${comment}`);
          });
        } else {
          lines.push(`- ${r.type},${r.payload.trim()},${r.outbound},no-resolve${comment}`);
        }
      }
    });
    lines.push('');
  }

  if (remoteRules.length > 0) {
    lines.push('# ================= 远程规则集 (Remote Rule-Sets) =================');
    remoteRules.forEach(r => {
      const comment = r.name && !r.name.startsWith(r.type) ? `  # ${r.name}` : '';
      lines.push(`- RULE-SET,${r.payload},${r.outbound}${comment}`);
    });
    lines.push('');
  }

  return lines.join('\n');
}

