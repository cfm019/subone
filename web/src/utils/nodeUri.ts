import { ProxyNode } from '../types';

/**
 * Format server address (brackets IPv6 if not already bracketed)
 */
function formatServer(server: string): string {
  if (!server) return '';
  if (server.includes(':') && !server.startsWith('[') && !server.endsWith(']')) {
    return `[${server}]`;
  }
  return server;
}

/**
 * Convert any ProxyNode object into a standard, usable proxy client URL link
 * (vless://, hysteria2://, anytls://, trojan://, ss://, vmess://, wireguard://, snell://, tuic://, etc.)
 */
export function nodeToUri(node: any): string {
  // 1. If original raw URI link was preserved, prioritize it
  if (typeof node.raw === 'string' && node.raw.includes('://')) {
    return node.raw.trim();
  }

  const name = (node.name || 'node').replace(/[\r\n#]+/g, ' ').trim();
  const type = (node.type || '').toLowerCase();
  const server = formatServer(node.server || '');
  const port = node.port || 443;

  // 2. Shadowsocks (ss://)
  if (type === 'ss') {
    const method = node.method || 'aes-128-gcm';
    const password = node.password || '';
    let cred = '';
    try {
      cred = btoa(unescape(encodeURIComponent(`${method}:${password}`)));
    } catch {
      cred = btoa(`${method}:${password}`);
    }
    let uri = `ss://${cred}@${server}:${port}`;
    if (node.plugin) {
      let pluginParam = node.plugin;
      if (node.pluginOpts && typeof node.pluginOpts === 'object') {
        const optsStr = Object.entries(node.pluginOpts)
          .map(([k, v]) => `${k}=${v}`)
          .join(';');
        if (optsStr) pluginParam += `;${optsStr}`;
      }
      uri += `/?plugin=${encodeURIComponent(pluginParam)}`;
    }
    return `${uri}#${name}`;
  }

  // 3. Trojan (trojan://)
  if (type === 'trojan') {
    const params = new URLSearchParams();
    if (node.sni) params.set('sni', node.sni);
    if (node.skipCertVerify) params.set('allowInsecure', '1');
    const net = (node.network || 'tcp').toLowerCase();
    if (net === 'ws') {
      params.set('type', 'ws');
      params.set('path', node.wsPath || '/');
      const host = node.wsHeaders?.Host || node.wsHeaders?.host || node.sni;
      if (host) params.set('host', host);
    } else if (net === 'grpc') {
      params.set('type', 'grpc');
      if (node.grpcServiceName) params.set('serviceName', node.grpcServiceName);
    }
    const qs = params.toString();
    return `trojan://${encodeURIComponent(node.password || '')}@${server}:${port}${qs ? '?' + qs : ''}#${name}`;
  }

  // 4. VLESS (vless://)
  if (type === 'vless') {
    const params = new URLSearchParams();
    if (node.reality?.enabled || (node.reality && node.reality.publicKey)) {
      params.set('security', 'reality');
      params.set('pbk', node.reality.publicKey);
      if (node.reality.shortId) params.set('sid', node.reality.shortId);
    } else if (node.tls) {
      params.set('security', 'tls');
    }
    if (node.sni) params.set('sni', node.sni);
    if (node.fingerprint) params.set('fp', node.fingerprint);
    if (node.flow) params.set('flow', node.flow);

    const net = (node.network || 'tcp').toLowerCase();
    if (net === 'ws') {
      params.set('type', 'ws');
      params.set('path', node.wsPath || '/');
      const host = node.wsHeaders?.Host || node.wsHeaders?.host || node.sni;
      if (host) params.set('host', host);
    } else if (net === 'grpc') {
      params.set('type', 'grpc');
      if (node.grpcServiceName) params.set('serviceName', node.grpcServiceName);
    } else if (net !== 'tcp') {
      params.set('type', net);
    }
    const qs = params.toString();
    return `vless://${node.uuid || ''}@${server}:${port}${qs ? '?' + qs : ''}#${name}`;
  }

  // 5. Hysteria2 (hysteria2://)
  if (type === 'hysteria2' || type === 'hy2') {
    const params = new URLSearchParams();
    if (node.sni) params.set('sni', node.sni);
    if (node.skipCertVerify) params.set('insecure', '1');
    const obfsPwd = node.obfsPassword || (node.obfs && node.obfs !== 'salamander' ? node.obfs : undefined);
    if (obfsPwd) {
      params.set('obfs', 'salamander');
      params.set('obfs-password', obfsPwd);
    }
    if (node.serverPorts && node.serverPorts.length > 0) {
      params.set('mport', node.serverPorts.join(','));
    }
    const qs = params.toString();
    return `hysteria2://${encodeURIComponent(node.password || '')}@${server}:${port}${qs ? '?' + qs : ''}#${name}`;
  }

  // 6. AnyTLS (anytls://)
  if (type === 'anytls') {
    const params = new URLSearchParams();
    if (node.sni) params.set('sni', node.sni);
    if (node.skipCertVerify) params.set('insecure', '1');
    if (node.fingerprint) params.set('fp', node.fingerprint);
    const qs = params.toString();
    return `anytls://${encodeURIComponent(node.password || '')}@${server}:${port}${qs ? '?' + qs : ''}#${name}`;
  }

  // 7. VMess (vmess://)
  if (type === 'vmess') {
    const vmessObj = {
      v: '2',
      ps: node.name,
      add: node.server,
      port: node.port,
      id: node.uuid || '',
      aid: node.alterId || 0,
      scy: node.cipher || 'auto',
      net: node.network || 'tcp',
      type: 'none',
      host: node.wsHeaders?.Host || node.wsHeaders?.host || node.sni || '',
      path: node.wsPath || '/',
      tls: node.tls ? 'tls' : '',
      sni: node.sni || '',
    };
    try {
      const b64 = btoa(unescape(encodeURIComponent(JSON.stringify(vmessObj))));
      return `vmess://${b64}`;
    } catch {
      return `vmess://${btoa(JSON.stringify(vmessObj))}`;
    }
  }

  // 8. WireGuard (wireguard://)
  if (type === 'wireguard' || type === 'wg') {
    const params = new URLSearchParams();
    if (node.publicKey) params.set('publickey', node.publicKey);
    if (node.ip) params.set('ip', node.ip);
    if (node.presharedKey) params.set('presharedkey', node.presharedKey);
    if (node.reserved && node.reserved.length > 0) params.set('reserved', node.reserved.join(','));
    const qs = params.toString();
    return `wireguard://${encodeURIComponent(node.privateKey || '')}@${server}:${port}${qs ? '?' + qs : ''}#${name}`;
  }

  // 9. Snell (snell://)
  if (type === 'snell') {
    const params = new URLSearchParams();
    if (node.snellVersion) params.set('version', String(node.snellVersion));
    if (node.obfs) params.set('obfs', node.obfs);
    if (node.obfsHost) params.set('obfs-host', node.obfsHost);
    const qs = params.toString();
    return `snell://${encodeURIComponent(node.psk || node.password || '')}@${server}:${port}${qs ? '?' + qs : ''}#${name}`;
  }

  // 10. TUIC (tuic://)
  if (type === 'tuic') {
    const params = new URLSearchParams();
    if (node.sni) params.set('sni', node.sni);
    if (node.alpn && node.alpn.length > 0) params.set('alpn', node.alpn.join(','));
    if (node.congestionControl) params.set('congestion_control', node.congestionControl);
    const qs = params.toString();
    const user = node.uuid ? `${encodeURIComponent(node.uuid)}:${encodeURIComponent(node.password || '')}` : encodeURIComponent(node.password || '');
    return `tuic://${user}@${server}:${port}${qs ? '?' + qs : ''}#${name}`;
  }

  // 11. SOCKS5 (socks5://)
  if (type === 'socks5') {
    const auth = node.username ? `${encodeURIComponent(node.username)}:${encodeURIComponent(node.password || '')}@` : '';
    return `socks5://${auth}${server}:${port}#${name}`;
  }

  // 12. HTTP (http://)
  if (type === 'http') {
    const auth = node.username ? `${encodeURIComponent(node.username)}:${encodeURIComponent(node.password || '')}@` : '';
    return `http://${auth}${server}:${port}#${name}`;
  }

  // Generic fallback URI
  return `${type}://${server}:${port}#${name}`;
}
