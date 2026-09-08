import { CountryPatternRule, ProxyNode, SubscriptionSource } from '../../types/index.js';
import { parseNodeUri } from './uri-parser.js';
import { parseClashYaml } from './clash-parser.js';
import { parseSingboxJson } from './singbox-parser.js';

function decodeBase64Safe(str: string): string {
  try {
    let base = str.trim().replace(/-/g, '+').replace(/_/g, '/');
    while (base.length % 4) {
      base += '=';
    }
    return Buffer.from(base, 'base64').toString('utf-8');
  } catch (e) {
    return str;
  }
}

export async function fetchAndParseSource(
  source: SubscriptionSource,
  countryPatterns?: CountryPatternRule[]
): Promise<ProxyNode[]> {
  const url = source.url.trim();
  if (!url) return [];

  // If local direct text content / node URIs (not starting with http/https)
  if (!url.startsWith('http://') && !url.startsWith('https://')) {
    return parseRawContent(url, source.id, source.name, source.type, countryPatterns);
  }

  try {
    const userAgent = source.customUserAgent || 'ClashMeta/v1.18.0 (subone-engine; +https://github.com/subone)';
    const response = await fetch(url, {
      headers: {
        'User-Agent': userAgent,
        'Accept': '*/*',
      },
      signal: AbortSignal.timeout(15000),
    });

    if (!response.ok) {
      throw new Error(`HTTP error ${response.status}: ${response.statusText}`);
    }

    const text = await response.text();
    return parseRawContent(text, source.id, source.name, source.type, countryPatterns);
  } catch (err: any) {
    console.error(`Failed to fetch source [${source.name}] (${url}):`, err.message || err);
    throw err;
  }
}

export function parseRawContent(
  raw: string,
  sourceId?: string,
  sourceName?: string,
  hintType?: string,
  countryPatterns?: CountryPatternRule[]
): ProxyNode[] {
  const content = raw.trim();
  if (!content) return [];

  // 1. If explicit or looks like Sing-box JSON
  if (hintType === 'singbox' || (content.startsWith('{') && content.endsWith('}') && content.includes('"outbounds"'))) {
    const nodes = parseSingboxJson(content, sourceId, sourceName, countryPatterns);
    if (nodes.length > 0) return nodes;
  }

  // 2. If explicit or looks like Clash YAML
  if (hintType === 'clash' || content.includes('proxies:') || content.includes('proxy-groups:') || content.startsWith('port:')) {
    const nodes = parseClashYaml(content, sourceId, sourceName, countryPatterns);
    if (nodes.length > 0) return nodes;
  }

  // 3. Try Base64 decode
  let decoded = content;
  if (!content.includes('://') && !content.includes('\n')) {
    decoded = decodeBase64Safe(content);
  } else if (!content.startsWith('{') && !content.startsWith('proxies:')) {
    // Might be multiline base64 or mixed
    try {
      const b64 = decodeBase64Safe(content);
      if (b64.includes('://')) {
        decoded = b64;
      }
    } catch (e) {}
  }

  // 4. Parse line-by-line URI list
  const lines = decoded.split(/[\r\n]+/).map(l => l.trim()).filter(Boolean);
  const uriNodes: ProxyNode[] = [];
  lines.forEach((line, idx) => {
    if (line.includes('://')) {
      const node = parseNodeUri(line, idx, countryPatterns);
      if (node) {
        node.sourceId = sourceId;
        node.sourceName = sourceName;
        uriNodes.push(node);
      }
    }
  });

  if (uriNodes.length > 0) {
    return uriNodes;
  }

  // Fallback try YAML / JSON on decoded string
  if (decoded.includes('proxies:')) {
    return parseClashYaml(decoded, sourceId, sourceName, countryPatterns);
  }
  if (decoded.startsWith('{') && decoded.includes('"outbounds"')) {
    return parseSingboxJson(decoded, sourceId, sourceName, countryPatterns);
  }

  return [];
}
