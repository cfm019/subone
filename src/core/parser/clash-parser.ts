import yaml from 'js-yaml';
import { CountryPatternRule, ProxyNode } from '../../types/index.js';
import { detectCountry } from './country.js';

export function parseClashYaml(
  content: string,
  sourceId?: string,
  sourceName?: string,
  countryPatterns?: CountryPatternRule[]
): ProxyNode[] {
  const nodes: ProxyNode[] = [];
  try {
    const doc = yaml.load(content) as any;
    if (!doc || typeof doc !== 'object') return [];

    const rawProxies = doc.proxies || [];
    if (!Array.isArray(rawProxies)) return [];

    rawProxies.forEach((p, idx) => {
      if (!p || !p.name || !p.server || !p.port) return;

      const name = String(p.name);
      const type = String(p.type || '').toLowerCase();
      const country = detectCountry(name, countryPatterns);

      let nodeType: any = type;
      if (type === 'shadowsocks') nodeType = 'ss';
      if (type === 'hysteria2' || type === 'hy2') nodeType = 'hysteria2';
      if (type === 'socks') nodeType = 'socks5';

      const node: ProxyNode = {
        id: `clash-${sourceId || 'src'}-${idx}-${p.server || p.ip}-${p.port}`,
        name,
        type: nodeType,
        server: String(p.server || ''),
        port: Number(p.port || 0),
        sourceId,
        sourceName,
        countryCode: country?.code,
        countryEmoji: country?.emoji,

        username: p.username,
        uuid: p.uuid,
        password: p.password || p.psk,
        method: p.cipher || p.method,
        alterId: p.alterId,

        tls: Boolean(p.tls || p.reality || nodeType === 'anytls' || nodeType === 'trojan' || nodeType === 'hysteria2'),
        sni: p.servername || p.sni,
        alpn: p.alpn,
        skipCertVerify: Boolean(p['skip-cert-verify']),
        fingerprint: p['client-fingerprint'] || p.fingerprint,

        reality: p.reality ? {
          enabled: true,
          publicKey: p.reality['public-key'] || p['public-key'] || '',
          shortId: p.reality['short-id'] || p['short-id'] || undefined,
        } : (p['reality-opts'] ? {
          enabled: true,
          publicKey: p['reality-opts']['public-key'] || '',
          shortId: p['reality-opts']['short-id'] || undefined,
        } : undefined),

        // WireGuard
        privateKey: p['private-key'],
        publicKey: p['public-key'],
        presharedKey: p['preshared-key'],
        ip: p.ip,
        ipv6: p.ipv6,
        reserved: Array.isArray(p.reserved) ? p.reserved : undefined,
        mtu: p.mtu ? Number(p.mtu) : undefined,
        udp: p.udp !== undefined ? Boolean(p.udp) : true,
        remoteDnsResolve: p['remote-dns-resolve'] !== undefined ? Boolean(p['remote-dns-resolve']) : undefined,

        // Snell & Hysteria2
        psk: p.psk || p.password,
        snellVersion: p.version ? Number(p.version) : undefined,
        obfs: p['obfs-opts']?.mode || p.obfs,
        obfsHost: p['obfs-opts']?.host || p['obfs-host'],
        obfsPassword: p['obfs-password'] || p['obfs-opts']?.password || p.obfsPassword,

        flow: p.flow,
        packetEncoding: p['packet-encoding'],
        network: p.network,
        wsPath: p['ws-opts']?.path || p['ws-path'],
        wsHeaders: p['ws-opts']?.headers || p['ws-headers'],
        grpcServiceName: p['grpc-opts']?.['grpc-service-name'],
        
        raw: p,
      };

      nodes.push(node);
    });
  } catch (err) {
    console.error('Failed to parse Clash YAML:', err);
  }
  return nodes;
}
