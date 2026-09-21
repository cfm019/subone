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

export interface SourceIconsConfig {
  custom?: string;
  filter?: string;
  remote?: string;
}

export function getSourceGroupPrefix(
  source: { type?: string; id?: string },
  icons?: SourceIconsConfig
): string {
  const customIcon = icons?.custom || '🖥️';
  const filterIcon = icons?.filter || '✨';
  const remoteIcon = icons?.remote || '⚡️';

  if (source.type === 'custom' || source.id === 'custom') return customIcon;
  if (source.type === 'filter') return filterIcon;
  return remoteIcon;
}

export function cleanSourceOrGroupName(name: string, icons?: SourceIconsConfig): string {
  if (!name) return '';
  let cleaned = name;
  if (icons) {
    for (const icon of [icons.custom, icons.filter, icons.remote]) {
      if (icon && cleaned.startsWith(icon)) {
        cleaned = cleaned.slice(icon.length).trim();
      }
    }
  }
  return cleaned.replace(/^[\p{Extended_Pictographic}\uFE0F\u200D\s]+/u, '').trim();
}

export function formatSourceGroupTag(
  source: { name: string; type?: string; id?: string },
  icons?: SourceIconsConfig
): string {
  const prefix = getSourceGroupPrefix(source, icons);
  const clean = cleanSourceOrGroupName(source.name, icons);
  return `${prefix} ${clean}`;
}

