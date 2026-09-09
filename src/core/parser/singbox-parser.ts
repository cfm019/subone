import { CountryPatternRule, ProxyNode } from '../../types/index.js';
import { detectCountry } from './country.js';

export function parseSingboxJson(
  content: string,
  sourceId?: string,
  sourceName?: string,
  countryPatterns?: CountryPatternRule[]
): ProxyNode[] {
  const nodes: ProxyNode[] = [];
  try {
    const doc = JSON.parse(content);
    if (!doc || typeof doc !== 'object') return [];

    const outbounds = doc.outbounds || [];
    if (!Array.isArray(outbounds)) return [];

    const ignoreTypes = new Set(['selector', 'urltest', 'direct', 'block', 'dns']);

    outbounds.forEach((ob, idx) => {
      if (!ob || !ob.tag || !ob.server || !ob.server_port) return;
      const type = String(ob.type || '').toLowerCase();
      if (ignoreTypes.has(type)) return;

      const name = String(ob.tag);
      const country = detectCountry(name, countryPatterns);

      let nodeType: any = type;
      if (type === 'shadowsocks') nodeType = 'ss';
      if (type === 'socks') nodeType = 'socks5';

      const tlsObj = ob.tls;
      const realityObj = tlsObj?.reality;

      // Wireguard local address handling
      let localAddress: string[] | undefined;
      let ip: string | undefined;
      let ipv6: string | undefined;
      if (ob.local_address) {
        const rawAddrs = Array.isArray(ob.local_address) ? ob.local_address : [ob.local_address];
        localAddress = rawAddrs.map((a: any) => String(a).trim()).filter(Boolean);
        if (localAddress) {
          localAddress.forEach(addr => {
            const pure = addr.split('/')[0];
            if (pure.includes(':') && !ipv6) {
              ipv6 = pure;
            } else if (!ip) {
              ip = pure;
            }
          });
        }
      }


      const node: ProxyNode = {
        id: `singbox-${sourceId || 'src'}-${idx}-${ob.server}-${ob.server_port}`,
        name,
        type: nodeType,
        server: String(ob.server),
        port: Number(ob.server_port),
        sourceId,
        sourceName,
        countryCode: country?.code,
        countryEmoji: country?.emoji,

        username: ob.username,
        uuid: ob.uuid,
        password: ob.password,
        method: ob.method,
        alterId: ob.alter_id,

        tls: Boolean(tlsObj?.enabled || nodeType === 'anytls' || nodeType === 'trojan' || nodeType === 'hysteria2'),
        sni: tlsObj?.server_name,
        alpn: tlsObj?.alpn,
        skipCertVerify: Boolean(tlsObj?.insecure),
        fingerprint: tlsObj?.utls?.fingerprint,

        reality: realityObj?.enabled ? {
          enabled: true,
          publicKey: realityObj.public_key || '',
          shortId: realityObj.short_id || undefined,
        } : undefined,

        // WireGuard
        privateKey: ob.private_key,
        publicKey: ob.peer_public_key,
        presharedKey: ob.pre_shared_key,
        localAddress,
        ip,
        ipv6,
        reserved: Array.isArray(ob.reserved) ? ob.reserved : undefined,
        mtu: ob.mtu ? Number(ob.mtu) : undefined,
        udp: true,

        flow: ob.flow,
        packetEncoding: ob.packet_encoding,
        network: ob.transport?.type,
        wsPath: ob.transport?.path,
        wsHeaders: ob.transport?.headers,
        grpcServiceName: ob.transport?.service_name,
        maxEarlyData: ob.transport?.max_early_data,
        earlyDataHeaderName: ob.transport?.early_data_header_name,

        serverPorts: ob.server_ports,
        hopInterval: ob.hop_interval,
        hopIntervalMax: ob.hop_interval_max,
        upMbps: ob.up_mbps,
        downMbps: ob.down_mbps,
        certificatePublicKeySha256: tlsObj?.certificate_public_key_sha256,
        certificate: tlsObj?.certificate,

        idleSessionCheckInterval: ob.idle_session_check_interval,
        idleSessionTimeout: ob.idle_session_timeout,
        minIdleSession: ob.min_idle_session,

        quic: ob.quic,
        quicCongestionControl: ob.quic_congestion_control || ob.congestion_control,
        udpOverTcp: ob.udp_over_tcp,
        zeroRttHandshake: ob.zero_rtt_handshake,
        heartbeat: ob.heartbeat,
        udpRelayMode: ob.udp_relay_mode,
        detour: ob.detour,
        shadowtlsVersion: ob.version,

        obfs: ob.obfs?.type || ob.obfs,
        obfsPassword: ob.obfs?.password || ob.obfs_password,

        raw: ob,
      };

      nodes.push(node);
    });
  } catch (err) {
    console.error('Failed to parse Sing-box JSON:', err);
  }
  return nodes;
}
