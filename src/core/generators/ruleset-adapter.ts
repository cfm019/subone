import { UnifiedRuleItem } from '../../types/index.js';

export interface AdaptedRuleProvider {
  tag: string;
  url: string;
  format: 'binary' | 'mrs' | 'yaml' | 'text' | 'source';
  behavior: 'domain' | 'ipcidr' | 'classical';
  path: string;
}

export function formatRuleTag(r: UnifiedRuleItem, idx?: number): string {
  if (r.payload) {
    const match = r.payload.match(/(geosite|geoip)\/([^/?#]+)\.(srs|yaml|mrs|list)/i);
    if (match) {
      const type = match[1].toLowerCase();
      const name = match[2].toLowerCase().replace(/[^a-z0-9_@!-]/g, '_');
      return `${type}-${name}`;
    }
    const fileMatch = r.payload.match(/\/([^/?#]+)\.(srs|yaml|mrs|list)/i);
    if (fileMatch) {
      return fileMatch[1].toLowerCase().replace(/[^a-z0-9_@!-]/g, '_');
    }
  }

  const cleanName = r.name
    .replace(/[（(].*?[)）]/g, '')
    .replace(/[^a-zA-Z0-9_@!-]/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_|_$/g, '')
    .toLowerCase();

  if (cleanName && cleanName.length >= 2) {
    return cleanName;
  }

  if (r.id && r.id.startsWith('r-')) {
    return r.id.replace(/^r-/, '').replace(/-remote$/, '');
  }

  return `ruleset_${idx !== undefined ? idx : 'item'}`;
}

export function adaptRulesetForSingbox(r: UnifiedRuleItem, idx?: number): AdaptedRuleProvider {
  const tag = formatRuleTag(r, idx);
  let url = (r.clientUrls?.singbox || r.payload || '').trim();
  const lowerUrl = url.toLowerCase();

  // If user provided a Mihomo .mrs URL, convert to Sing-box .srs
  if (lowerUrl.includes('meta-rules-dat/meta/geo/geosite/')) {
    url = url.replace('meta-rules-dat/meta/geo/geosite/', 'meta-rules-dat/sing/geo/geosite/').replace(/\.mrs$/i, '.srs');
  } else if (lowerUrl.includes('meta-rules-dat/meta/geo/geoip/')) {
    url = url.replace('meta-rules-dat/meta/geo/geoip/', 'meta-rules-dat/sing/geo/geoip/').replace(/\.mrs$/i, '.srs');
  }

  const isSource = url.endsWith('.json');
  const format: 'binary' | 'source' = isSource ? 'source' : 'binary';
  const isGeoIP = url.includes('geoip') || r.name.toLowerCase().includes('geoip') || r.name.includes('直连 IP');

  return {
    tag,
    url,
    format,
    behavior: isGeoIP ? 'ipcidr' : 'domain',
    path: `./rule_set/${tag}.${format === 'source' ? 'json' : 'srs'}`,
  };
}

export function adaptRulesetForMihomo(r: UnifiedRuleItem, idx?: number): AdaptedRuleProvider {
  const tag = formatRuleTag(r, idx);
  let url = (r.clientUrls?.mihomo || r.payload || '').trim();
  const lowerUrl = url.toLowerCase();
  const isGeoIP = lowerUrl.includes('geoip') || r.name.toLowerCase().includes('geoip') || r.name.includes('直连 IP');

  let behavior: 'domain' | 'ipcidr' | 'classical' = isGeoIP ? 'ipcidr' : 'domain';
  let format: 'mrs' | 'yaml' | 'text' = 'yaml';

  if (r.format === 'mrs' || lowerUrl.endsWith('.mrs')) {
    format = 'mrs';
    behavior = isGeoIP ? 'ipcidr' : 'domain';
  } else if (r.format === 'binary' || lowerUrl.endsWith('.srs')) {
    // Sing-box .srs binary -> Mihomo .mrs binary
    format = 'mrs';
    behavior = isGeoIP ? 'ipcidr' : 'domain';

    if (url.includes('meta-rules-dat/sing/geo/geosite/')) {
      url = url.replace('meta-rules-dat/sing/geo/geosite/', 'meta-rules-dat/meta/geo/geosite/').replace(/\.srs$/i, '.mrs');
    } else if (url.includes('meta-rules-dat/sing/geo/geoip/')) {
      url = url.replace('meta-rules-dat/sing/geo/geoip/', 'meta-rules-dat/meta/geo/geoip/').replace(/\.srs$/i, '.mrs');
    } else if (url.includes('SagerNet/sing-geosite/rule-set/geosite-')) {
      url = url.replace('SagerNet/sing-geosite/rule-set/geosite-', 'MetaCubeX/meta-rules-dat/meta/geo/geosite/').replace(/\.srs$/i, '.mrs');
    } else if (url.includes('SagerNet/sing-geoip/rule-set/geoip-')) {
      url = url.replace('SagerNet/sing-geoip/rule-set/geoip-', 'MetaCubeX/meta-rules-dat/meta/geo/geoip/').replace(/\.srs$/i, '.mrs');
    } else {
      url = url.replace(/\.srs$/i, '.mrs');
    }
  } else if (lowerUrl.endsWith('.yaml') || lowerUrl.endsWith('.yml') || r.format === 'yaml') {
    format = 'yaml';
    behavior = isGeoIP ? 'ipcidr' : (lowerUrl.includes('geosite') ? 'domain' : 'classical');
  } else if (lowerUrl.endsWith('.list') || lowerUrl.endsWith('.text') || lowerUrl.endsWith('.txt') || r.format === 'text') {
    format = 'text';
    behavior = isGeoIP ? 'ipcidr' : 'domain';
  }

  const ext = format === 'mrs' ? 'mrs' : (format === 'text' ? 'text' : 'yaml');
  return {
    tag,
    url,
    format,
    behavior,
    path: `./ruleset/${tag}.${ext}`,
  };
}

export function adaptRulesetForLoon(r: UnifiedRuleItem, idx?: number): { tag: string; url: string } {
  const tag = formatRuleTag(r, idx);
  let url = (r.clientUrls?.loon || '').trim();
  if (url) {
    return { tag, url };
  }

  const raw = (r.payload || '').toLowerCase();
  const cleanUrl = raw.replace(/https?:\/\/gh-proxy\.com\//g, '');

  if (cleanUrl.includes('category-ads') || cleanUrl.includes('ads') || cleanUrl.includes('advertising')) {
    url = 'https://raw.githubusercontent.com/blackmatrix7/ios_rule_script/master/rule/Loon/Advertising/Advertising.list';
  } else if (cleanUrl.includes('category-ai') || cleanUrl.includes('openai') || cleanUrl.includes('claude') || cleanUrl.includes('gemini')) {
    url = 'https://raw.githubusercontent.com/Loon0x00/LoonLiteRules/main/proxy/Gemini.list';
  } else if (cleanUrl.includes('youtube')) {
    url = 'https://raw.githubusercontent.com/Loon0x00/LoonLiteRules/main/proxy/YouTube.list';
  } else if (cleanUrl.includes('google')) {
    url = 'https://raw.githubusercontent.com/Loon0x00/LoonLiteRules/main/proxy/Google.list';
  } else if (cleanUrl.includes('telegram')) {
    url = 'https://raw.githubusercontent.com/Loon0x00/LoonLiteRules/main/proxy/Telegram.list';
  } else if (cleanUrl.includes('geolocation-!cn') || cleanUrl.includes('gfw')) {
    url = 'https://github.com/ACL4SSR/ACL4SSR/raw/refs/heads/master/Clash/ProxyGFWlist.list';
  } else if (cleanUrl.includes('cn') || cleanUrl.includes('direct')) {
    url = 'https://raw.githubusercontent.com/Loon0x00/LoonLiteRules/main/direct/cn.list';
  } else {
    if (r.payload.endsWith('.list') || r.payload.endsWith('.conf')) {
      url = r.payload;
    } else {
      url = 'https://github.com/ACL4SSR/ACL4SSR/raw/refs/heads/master/Clash/ProxyGFWlist.list';
    }
  }

  return {
    tag,
    url,
  };
}

export function adaptRulesetForQuantumultX(r: UnifiedRuleItem, idx?: number): { tag: string; url: string } {
  const tag = formatRuleTag(r, idx);
  const url = (r.clientUrls?.quantumultx || '').trim();
  if (url) return { tag, url };
  const loonInfo = adaptRulesetForLoon(r, idx);
  return { tag, url: loonInfo.url };
}

export function adaptRulesetForEgern(r: UnifiedRuleItem, idx?: number): { tag: string; url: string } {
  const tag = formatRuleTag(r, idx);
  const url = (r.clientUrls?.egern || '').trim();
  if (url) return { tag, url };
  const loonInfo = adaptRulesetForLoon(r, idx);
  return { tag, url: loonInfo.url };
}

export function adaptRulesetForShadowrocket(r: UnifiedRuleItem, idx?: number): { tag: string; url: string } {
  const tag = formatRuleTag(r, idx);
  const url = (r.clientUrls?.shadowrocket || '').trim();
  if (url) return { tag, url };
  const loonInfo = adaptRulesetForLoon(r, idx);
  return { tag, url: loonInfo.url };
}

