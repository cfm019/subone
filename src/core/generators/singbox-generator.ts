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
    return base;
  }

  if (node.type === 'vless') {
    base.uuid = node.uuid || '';
    if (node.flow) base.flow = node.flow;
    base.packet_encoding = node.packetEncoding || 'xudp';

    if (node.tls) {
      base.tls = {
        enabled: true,
        insecure: Boolean(node.skipCertVerify),
        server_name: node.sni || node.server,
        utls: {
          enabled: true,
          fingerprint: node.fingerprint || 'chrome',
        },
      };

      if (node.reality && node.reality.enabled) {
        base.tls.reality = {
          enabled: true,
          public_key: node.reality.publicKey,
        };
        if (node.reality.shortId) {
          base.tls.reality.short_id = node.reality.shortId;
        }
      }
    }

    if (node.network === 'ws') {
      base.transport = {
        type: 'ws',
        path: node.wsPath || '/',
        headers: node.wsHeaders || {},
      };
    } else if (node.network === 'grpc') {
      base.transport = {
        type: 'grpc',
        service_name: node.grpcServiceName || '',
      };
    }

    return base;
  }

  if (node.type === 'vmess') {
    base.uuid = node.uuid || '';
    base.alter_id = node.alterId || 0;
    base.security = node.cipher || 'auto';
    if (node.tls) {
      base.tls = {
        enabled: true,
        insecure: Boolean(node.skipCertVerify),
        server_name: node.sni,
      };
    }
    if (node.network === 'ws') {
      base.transport = {
        type: 'ws',
        path: node.wsPath || '/',
        headers: node.wsHeaders || {},
      };
    }
    return base;
  }

  if (node.type === 'trojan') {
    base.password = node.password || '';
    base.tls = {
      enabled: true,
      insecure: Boolean(node.skipCertVerify),
      server_name: node.sni,
      utls: {
        enabled: true,
        fingerprint: node.fingerprint || 'chrome',
      },
    };
    if (node.network === 'ws') {
      base.transport = {
        type: 'ws',
        path: node.wsPath || '/',
        headers: node.wsHeaders || {},
      };
    }
    return base;
  }

  if (node.type === 'hysteria2') {
    base.password = node.password || '';
    base.tls = {
      enabled: true,
      insecure: Boolean(node.skipCertVerify),
      server_name: node.sni,
    };
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
    base.tls = {
      enabled: true,
      insecure: Boolean(node.skipCertVerify),
      server_name: node.sni || node.server,
      alpn: node.alpn || ['h2', 'http/1.1'],
      utls: {
        enabled: true,
        fingerprint: node.fingerprint || 'chrome',
      },
    };
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

