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

export function formatCidr(ip: string): string {
  const trimmed = (ip || '').trim();
  if (!trimmed) return '';
  if (trimmed.includes('/')) return trimmed;
  return trimmed.includes(':') ? `${trimmed}/128` : `${trimmed}/32`;
}

export function getSourceGroupPrefix(source: { type?: string; id?: string }): string {
  if (source.type === 'custom' || source.id === 'custom') return '🖥️';
  if (source.type === 'filter') return '✨';
  return '⚡️';
}

export function cleanSourceOrGroupName(name: string): string {
  if (!name) return '';
  return name.replace(/^[🖥️✨⚡️\s]+/, '').trim();
}

export function formatSourceGroupTag(source: { name: string; type?: string; id?: string }): string {
  const prefix = getSourceGroupPrefix(source);
  const clean = cleanSourceOrGroupName(source.name);
  return `${prefix} ${clean}`;
}
