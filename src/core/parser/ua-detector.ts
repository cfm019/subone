export type ClientType = 'singbox' | 'mihomo' | 'loon';

export function detectClientType(
  userAgent: string | undefined,
  queryTarget: string | undefined,
  defaultType: ClientType = 'singbox'
): ClientType {
  // 1. Explicit query parameter has highest priority
  if (queryTarget) {
    const q = queryTarget.toLowerCase();
    if (q === 'singbox' || q === 'sing-box' || q === 'sfm' || q === 'sfi') {
      return 'singbox';
    }
    if (q === 'mihomo' || q === 'clash' || q === 'meta' || q === 'clashmeta' || q === 'stash') {
      return 'mihomo';
    }
    if (q === 'loon') {
      return 'loon';
    }
  }

  // 2. User-Agent detection
  if (!userAgent) return defaultType;
  const ua = userAgent.toLowerCase();

  // Sing-box families
  if (ua.includes('sing-box') || ua.includes('singbox') || ua.includes('sfm') || ua.includes('sfi') || ua.includes('karing')) {
    return 'singbox';
  }

  // Loon
  if (ua.includes('loon')) {
    return 'loon';
  }

  // Clash / Mihomo / Meta / Stash / ShellCrash families
  if (
    ua.includes('clash') ||
    ua.includes('mihomo') ||
    ua.includes('meta') ||
    ua.includes('stash') ||
    ua.includes('shellcrash') ||
    ua.includes('verge') ||
    ua.includes('flclash')
  ) {
    return 'mihomo';
  }

  // 3. Fallback
  return defaultType;
}
