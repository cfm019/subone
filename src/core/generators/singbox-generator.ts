import { ProxyNode, ProxyGroupItem, UnifiedRuleItem } from '../../types/index.js';
import { injectUnifiedToSingbox } from './rule-injector.js';

export function nodeToSingboxOutbound(node: ProxyNode): any {
  if (node.raw && node.raw.type && node.raw.tag) {
    return {
      ...node.raw,
      tag: node.name,
      _sourceName: node.sourceName,
      _sourceId: node.sourceId,
    };
  }

  const base: any = {
    tag: node.name,
    type: node.type === 'ss' ? 'shadowsocks' : node.type,
    server: node.server,
    server_port: node.port,
    _sourceName: node.sourceName,
    _sourceId: node.sourceId,
  };

  if (node.type === 'ss') {
    base.method = node.method || '2022-blake3-aes-128-gcm';
    base.password = node.password || '';
    if (node.detour) base.detour = node.detour;
    if (node.udpOverTcp !== undefined) base.udp_over_tcp = node.udpOverTcp;
    if (node.multiplex) base.multiplex = node.multiplex;
    return base;
  }

  if (node.type === 'shadowtls') {
    base.version = node.shadowtlsVersion || 3;
    base.password = node.password || '';
    base.tls = {
      enabled: true,
      server_name: node.sni || node.server,
      utls: {
        enabled: true,
        fingerprint: node.fingerprint || 'chrome',
      },
    };
    return base;
  }

  if (node.type === 'vless') {
    base.uuid = node.uuid || '';
    if (node.flow) base.flow = node.flow;
    base.packet_encoding = node.packetEncoding || 'xudp';

    if (node.tls) {
      base.tls = {
        enabled: true,
        server_name: node.sni || node.server,
      };
      if (node.skipCertVerify !== undefined) {
        base.tls.insecure = Boolean(node.skipCertVerify);
      }
      if (node.fingerprint) {
        base.tls.utls = {
          enabled: true,
          fingerprint: node.fingerprint,
        };
      }

      if (node.reality && node.reality.enabled) {
        base.tls.reality = {
          enabled: true,
          public_key: node.reality.publicKey,
          short_id: node.reality.shortId ?? '',
        };
      }

      if (node.certificatePublicKeySha256 && node.certificatePublicKeySha256.length > 0) {
        base.tls.certificate_public_key_sha256 = node.certificatePublicKeySha256;
      } else if (node.certificate) {
        base.tls.certificate = Array.isArray(node.certificate) ? node.certificate : [node.certificate];
      }
    }

    if (node.network === 'ws') {
      base.transport = {
        type: 'ws',
        path: node.wsPath || '/',
        headers: node.wsHeaders || {},
      };
      if (node.maxEarlyData) {
        base.transport.max_early_data = node.maxEarlyData;
        base.transport.early_data_header_name = node.earlyDataHeaderName || 'Sec-WebSocket-Protocol';
      }
    } else if (node.network === 'grpc') {
      base.transport = {
        type: 'grpc',
        service_name: node.grpcServiceName || 'grpc',
      };
    } else if (node.network === 'http' || node.network === 'h2') {
      base.transport = {
        type: 'http',
      };
    }

    if (node.multiplex) {
      base.multiplex = node.multiplex;
    }

    return base;
  }

  if (node.type === 'vmess') {
    base.uuid = node.uuid || '';
    base.security = node.cipher || 'auto';
    if (node.alterId !== undefined) base.alter_id = node.alterId;
    if (node.tls) {
      base.tls = {
        enabled: true,
        server_name: node.sni || node.server,
      };
      if (node.skipCertVerify !== undefined) {
        base.tls.insecure = Boolean(node.skipCertVerify);
      }
      if (node.fingerprint) {
        base.tls.utls = {
          enabled: true,
          fingerprint: node.fingerprint,
        };
      }
      if (node.certificatePublicKeySha256) {
        base.tls.certificate_public_key_sha256 = node.certificatePublicKeySha256;
      }
    }
    if (node.network === 'ws') {
      base.transport = {
        type: 'ws',
        path: node.wsPath || '/',
        headers: node.wsHeaders || {},
      };
      if (node.maxEarlyData) {
        base.transport.max_early_data = node.maxEarlyData;
        base.transport.early_data_header_name = node.earlyDataHeaderName || 'Sec-WebSocket-Protocol';
      }
    }
    if (node.multiplex) {
      base.multiplex = node.multiplex;
    }
    return base;
  }

  if (node.type === 'trojan') {
    base.password = node.password || '';
    base.tls = {
      enabled: true,
      server_name: node.sni || node.server,
    };
    if (node.skipCertVerify !== undefined) {
      base.tls.insecure = Boolean(node.skipCertVerify);
    }
    if (node.fingerprint) {
      base.tls.utls = {
        enabled: true,
        fingerprint: node.fingerprint,
      };
    }
    if (node.certificatePublicKeySha256 && node.certificatePublicKeySha256.length > 0) {
      base.tls.certificate_public_key_sha256 = node.certificatePublicKeySha256;
    } else if (node.certificate) {
      base.tls.certificate = Array.isArray(node.certificate) ? node.certificate : [node.certificate];
    }
    if (node.network === 'ws') {
      base.transport = {
        type: 'ws',
        path: node.wsPath || '/',
        headers: node.wsHeaders || {},
      };
      if (node.maxEarlyData) {
        base.transport.max_early_data = node.maxEarlyData;
        base.transport.early_data_header_name = node.earlyDataHeaderName || 'Sec-WebSocket-Protocol';
      }
    }
    if (node.multiplex) {
      base.multiplex = node.multiplex;
    }
    return base;
  }

  if (node.type === 'hysteria2') {
    if (node.serverPorts && node.serverPorts.length > 0) {
      base.server_ports = node.serverPorts;
    }
    if (node.hopInterval) {
      base.hop_interval = node.hopInterval;
    }
    if (node.hopIntervalMax) {
      base.hop_interval_max = node.hopIntervalMax;
    }
    if (node.upMbps !== undefined) {
      base.up_mbps = node.upMbps;
    }
    if (node.downMbps !== undefined) {
      base.down_mbps = node.downMbps;
    }
    base.password = node.password || '';
    base.tls = {
      enabled: true,
      server_name: node.sni || node.server,
      alpn: node.alpn || ['h3'],
    };
    if (node.skipCertVerify !== undefined) {
      base.tls.insecure = Boolean(node.skipCertVerify);
    }
    if (node.certificatePublicKeySha256 && node.certificatePublicKeySha256.length > 0) {
      base.tls.certificate_public_key_sha256 = node.certificatePublicKeySha256;
    } else if (node.certificate) {
      base.tls.certificate = Array.isArray(node.certificate) ? node.certificate : [node.certificate];
    }
    const obfsType = node.obfs || node.raw?.obfs;
    const obfsPassword = node.obfsPassword || node.raw?.['obfs-password'] || node.raw?.['obfs-opts']?.password;
    if (obfsType && obfsPassword) {
      base.obfs = {
        type: obfsType,
        password: obfsPassword,
      };
    }
    return base;
  }

  if (node.type === 'tuic') {
    base.uuid = node.uuid || '';
    base.password = node.password || '';
    base.congestion_control = node.congestionControl || 'bbr';
    base.udp_relay_mode = node.udpRelayMode || 'native';
    base.zero_rtt_handshake = Boolean(node.zeroRttHandshake);
    if (node.heartbeat) base.heartbeat = node.heartbeat;
    base.tls = {
      enabled: true,
      server_name: node.sni || node.server,
      alpn: node.alpn || ['h3'],
    };
    if (node.skipCertVerify !== undefined) {
      base.tls.insecure = Boolean(node.skipCertVerify);
    }
    if (node.certificatePublicKeySha256 && node.certificatePublicKeySha256.length > 0) {
      base.tls.certificate_public_key_sha256 = node.certificatePublicKeySha256;
    } else if (node.certificate) {
      base.tls.certificate = Array.isArray(node.certificate) ? node.certificate : [node.certificate];
    }
    return base;
  }

  if (node.type === 'wireguard') {
    let localAddrs: string[] = [];
    if (node.localAddress && node.localAddress.length > 0) {
      localAddrs = node.localAddress;
    } else {
      if (node.ip) localAddrs.push(node.ip.includes('/') ? node.ip : `${node.ip}/32`);
      if (node.ipv6) localAddrs.push(node.ipv6.includes('/') ? node.ipv6 : `${node.ipv6}/128`);
    }
    if (localAddrs.length === 0) {
      localAddrs = ['10.0.0.2/32'];
    }

    base.local_address = localAddrs;
    base.private_key = node.privateKey || '';
    base.peer_public_key = node.publicKey || '';
    if (node.presharedKey) base.pre_shared_key = node.presharedKey;
    if (node.reserved) base.reserved = node.reserved;
    if (node.mtu) base.mtu = node.mtu;
    return base;
  }

  if (node.type === 'anytls') {
    base.password = node.password || '';
    if (node.idleSessionCheckInterval) {
      base.idle_session_check_interval = node.idleSessionCheckInterval;
    }
    if (node.idleSessionTimeout) {
      base.idle_session_timeout = node.idleSessionTimeout;
    }
    if (node.minIdleSession !== undefined) {
      base.min_idle_session = node.minIdleSession;
    }
    base.tls = {
      enabled: true,
      server_name: node.sni || node.server,
      alpn: node.alpn || ['h2', 'http/1.1'],
      utls: {
        enabled: true,
        fingerprint: node.fingerprint || 'chrome',
      },
    };
    if (node.skipCertVerify !== undefined) {
      base.tls.insecure = Boolean(node.skipCertVerify);
    }
    if (node.certificatePublicKeySha256 && node.certificatePublicKeySha256.length > 0) {
      base.tls.certificate_public_key_sha256 = node.certificatePublicKeySha256;
    } else if (node.certificate) {
      base.tls.certificate = Array.isArray(node.certificate) ? node.certificate : [node.certificate];
    }
    return base;
  }

  if (node.type === 'naive') {
    base.username = node.username || node.password || '';
    base.password = node.password || '';
    if (node.quic) {
      base.udp_over_tcp = false;
      base.quic = true;
      base.quic_congestion_control = node.quicCongestionControl || 'bbr';
    } else {
      base.udp_over_tcp = node.udpOverTcp !== undefined ? node.udpOverTcp : true;
      base.quic = false;
    }
    base.tls = {
      enabled: true,
      server_name: node.sni || node.server,
    };
    if (node.skipCertVerify !== undefined) {
      base.tls.insecure = Boolean(node.skipCertVerify);
    }
    if (node.certificate) {
      base.tls.certificate = Array.isArray(node.certificate) ? node.certificate : [node.certificate];
    }
    return base;
  }

  if (node.type === 'socks5') {
    base.type = 'socks';
    base.version = '5';
    if (node.username) base.username = node.username;
    if (node.password) base.password = node.password;
    return base;
  }

  return base;
}

export function generateSingboxConfig(
  templateJson: string,
  nodes: ProxyNode[],
  proxyGroups: ProxyGroupItem[] = [],
  rulesList: UnifiedRuleItem[] = []
): string {
  let doc: any;
  try {
    doc = JSON.parse(templateJson);
  } catch (e) {
    doc = {};
  }
  if (!doc || typeof doc !== 'object') {
    doc = {};
  }

  const proxyOutbounds = nodes.map(nodeToSingboxOutbound);

  doc = injectUnifiedToSingbox(doc, proxyOutbounds, proxyGroups, rulesList);

  return JSON.stringify(doc, null, 2);
}

