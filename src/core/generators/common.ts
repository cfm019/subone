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

export const DEFAULT_QX_ICON_BASE = 'https://raw.githubusercontent.com/Koolson/Qure/master/IconSet/Color';

export function resolveGroupIcon(groupName: string, customIcon?: string): string | undefined {
  if (customIcon && customIcon.trim()) {
    const trimmed = customIcon.trim();
    if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) {
      return trimmed;
    }
    const cleanIcon = trimmed.replace(/\.png$/i, '');
    return `${DEFAULT_QX_ICON_BASE}/${cleanIcon}.png`;
  }

  const rawLower = (groupName || '').toLowerCase().trim();
  const clean = groupName ? groupName.replace(/^[\p{Extended_Pictographic}\uFE0F\u200D\s]+/u, '').trim() : '';
  const lower = clean.toLowerCase();

  // 1. Specific popular services & applications
  if (lower.includes('tiktok') || lower.includes('抖音')) {
    return `${DEFAULT_QX_ICON_BASE}/TikTok.png`;
  }
  if (lower.includes('youtube music') || lower.includes('yt music') || lower.includes('ytmusic')) {
    return `${DEFAULT_QX_ICON_BASE}/YouTube_Music.png`;
  }
  if (lower.includes('youtube') || lower.includes('油管') || rawLower.includes('📹')) {
    return `${DEFAULT_QX_ICON_BASE}/YouTube_Letter.png`;
  }
  if (lower.includes('netflix') || lower.includes('网飞') || lower.includes('奈飞')) {
    return `${DEFAULT_QX_ICON_BASE}/Netflix.png`;
  }
  if (lower.includes('instagram') || lower.includes('ins')) {
    return `${DEFAULT_QX_ICON_BASE}/Instagram.png`;
  }
  if (lower.includes('telegram') || lower.includes('电报') || lower.includes('tg') || rawLower.includes('📲')) {
    return `${DEFAULT_QX_ICON_BASE}/Telegram.png`;
  }
  if (lower.includes('google') || lower.includes('谷歌') || rawLower.includes('🌐')) {
    return `${DEFAULT_QX_ICON_BASE}/Google.png`;
  }
  if (
    lower.includes('chatgpt') ||
    lower.includes('openai') ||
    lower.includes('claude') ||
    lower.includes('ai 服务') ||
    lower.includes('ai选择') ||
    lower.includes('ai') ||
    lower.includes('copilot') ||
    lower.includes('gemini') ||
    lower.includes('grok') ||
    rawLower.includes('🤖')
  ) {
    return `${DEFAULT_QX_ICON_BASE}/ChatGPT.png`;
  }
  if (lower.includes('twitter') || lower === 'x' || lower.includes('推特')) {
    return `${DEFAULT_QX_ICON_BASE}/Twitter.png`;
  }
  if (lower.includes('spotify') || lower.includes('声田')) {
    return `${DEFAULT_QX_ICON_BASE}/Spotify.png`;
  }
  if (lower.includes('github')) {
    return `${DEFAULT_QX_ICON_BASE}/GitHub.png`;
  }
  if (lower.includes('apple') || lower.includes('苹果') || lower.includes('icloud')) {
    return `${DEFAULT_QX_ICON_BASE}/Apple.png`;
  }
  if (lower.includes('microsoft') || lower.includes('微软') || lower.includes('onedrive')) {
    return `${DEFAULT_QX_ICON_BASE}/Microsoft.png`;
  }
  if (lower.includes('bilibili') || lower.includes('哔哩') || lower.includes('b站')) {
    return `${DEFAULT_QX_ICON_BASE}/bilibili.png`;
  }
  if (lower.includes('disney') || lower.includes('迪士尼')) {
    return `${DEFAULT_QX_ICON_BASE}/Disney.png`;
  }
  if (lower.includes('steam') || lower.includes('游戏') || lower.includes('game')) {
    return `${DEFAULT_QX_ICON_BASE}/Steam.png`;
  }
  if (
    lower.includes('运维') ||
    lower.includes('远程') ||
    lower.includes('devops') ||
    lower.includes('server') ||
    lower.includes('linux') ||
    lower.includes('独立节点') ||
    lower.includes('自建') ||
    rawLower.includes('💻') ||
    rawLower.includes('🖥️')
  ) {
    return `${DEFAULT_QX_ICON_BASE}/Server.png`;
  }
  if (lower.includes('测速') || lower.includes('speedtest')) {
    return `${DEFAULT_QX_ICON_BASE}/Speedtest.png`;
  }

  // 2. Country & Region groups
  if (rawLower.includes('🇭🇰') || lower.includes('hongkong') || lower.includes('香港') || lower.includes('港') || lower === 'hk') {
    return `${DEFAULT_QX_ICON_BASE}/Hong_Kong.png`;
  }
  if (rawLower.includes('🇯🇵') || lower.includes('japan') || lower.includes('日本') || lower.includes('日') || lower === 'jp') {
    return `${DEFAULT_QX_ICON_BASE}/Japan.png`;
  }
  if (
    rawLower.includes('🇺🇸') ||
    lower.includes('united states') ||
    lower.includes('america') ||
    lower.includes('美国') ||
    lower.includes('美') ||
    lower === 'us' ||
    lower.includes('lax')
  ) {
    return `${DEFAULT_QX_ICON_BASE}/United_States.png`;
  }
  if (rawLower.includes('🇹🇼') || lower.includes('taiwan') || lower.includes('台湾') || lower.includes('台') || lower === 'tw') {
    return `${DEFAULT_QX_ICON_BASE}/Taiwan.png`;
  }
  if (rawLower.includes('🇸🇬') || lower.includes('singapore') || lower.includes('新加坡') || lower.includes('狮城') || lower === 'sg') {
    return `${DEFAULT_QX_ICON_BASE}/Singapore.png`;
  }
  if (rawLower.includes('🇰🇷') || lower.includes('korea') || lower.includes('韩国') || lower.includes('韩') || lower === 'kr') {
    return `${DEFAULT_QX_ICON_BASE}/Korea.png`;
  }
  if (rawLower.includes('🇬🇧') || lower.includes('united kingdom') || lower.includes('britain') || lower.includes('英国') || lower.includes('英') || lower === 'uk') {
    return `${DEFAULT_QX_ICON_BASE}/United_Kingdom.png`;
  }
  if (rawLower.includes('🇩🇪') || lower.includes('germany') || lower.includes('德国') || lower.includes('德') || lower === 'de') {
    return `${DEFAULT_QX_ICON_BASE}/Germany.png`;
  }
  if (rawLower.includes('🇨🇦') || lower.includes('canada') || lower.includes('加拿大') || lower === 'ca') {
    return `${DEFAULT_QX_ICON_BASE}/Canada.png`;
  }
  if (rawLower.includes('🇦🇺') || lower.includes('australia') || lower.includes('澳大利亚') || lower.includes('澳洲') || lower === 'au') {
    return `${DEFAULT_QX_ICON_BASE}/Australia.png`;
  }
  if (rawLower.includes('🇫🇷') || lower.includes('france') || lower.includes('法国') || lower === 'fr') {
    return `${DEFAULT_QX_ICON_BASE}/France.png`;
  }
  if (rawLower.includes('🇷🇺') || lower.includes('russia') || lower.includes('俄罗斯') || lower === 'ru') {
    return `${DEFAULT_QX_ICON_BASE}/Russia.png`;
  }

  // 3. Functional and rule groups
  if (
    rawLower.includes('🇨🇳') ||
    lower.includes('国内') ||
    lower.includes('domestic') ||
    lower.includes('china')
  ) {
    return `${DEFAULT_QX_ICON_BASE}/China.png`;
  }
  if (
    rawLower.includes('🎯') ||
    lower.includes('直连') ||
    lower.includes('direct') ||
    lower.includes('本地')
  ) {
    return `${DEFAULT_QX_ICON_BASE}/Direct.png`;
  }
  if (
    rawLower.includes('🌎') ||
    lower.includes('国外') ||
    lower.includes('global') ||
    lower.includes('海外')
  ) {
    return `${DEFAULT_QX_ICON_BASE}/Global.png`;
  }
  if (
    rawLower.includes('🐟') ||
    lower.includes('漏网之鱼') ||
    lower.includes('final') ||
    lower.includes('兜底') ||
    lower.includes('剩余')
  ) {
    return `${DEFAULT_QX_ICON_BASE}/Final.png`;
  }
  if (
    rawLower.includes('🛑') ||
    lower.includes('广告') ||
    lower.includes('reject') ||
    lower.includes('拦截')
  ) {
    return `${DEFAULT_QX_ICON_BASE}/Advertising.png`;
  }
  if (
    rawLower.includes('♻️') ||
    lower.includes('自动') ||
    lower.includes('auto') ||
    lower.includes('urltest')
  ) {
    return `${DEFAULT_QX_ICON_BASE}/Auto.png`;
  }
  if (
    rawLower.includes('👉') ||
    lower.includes('手动') ||
    lower.includes('manual') ||
    lower.includes('static')
  ) {
    return `${DEFAULT_QX_ICON_BASE}/Static.png`;
  }
  if (
    rawLower.includes('🚀') ||
    lower.includes('节点选择') ||
    lower.includes('proxy') ||
    lower.includes('select')
  ) {
    return `${DEFAULT_QX_ICON_BASE}/Rocket.png`;
  }

  return `${DEFAULT_QX_ICON_BASE}/Proxy.png`;
}

