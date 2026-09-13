import { ProxyNode, ProxyGroupItem, UnifiedRuleItem } from '../../types/index.js';
import { injectUnifiedToLoon } from './rule-injector.js';

export function nodeToLoonProxy(node: ProxyNode): string {
  const name = node.name.replace(/[=,]/g, '_');

  if (node.type === 'ss') {
    const cipher = node.method || 'aes-128-gcm';
    const pwd = `"${node.password || ''}"`;
    let line = `${name} = Shadowsocks,${node.server},${node.port},${cipher},${pwd}`;
    if (node.plugin === 'obfs') {
      line += `,obfs=${node.pluginOpts?.mode || 'http'},obfs-host=${node.pluginOpts?.host || ''}`;
    } else if (node.plugin === 'v2ray-plugin') {
      line += `,plugin=v2ray-plugin,plugin-opts="mode=${node.pluginOpts?.mode || 'websocket'};host=${node.pluginOpts?.host || ''};path=${node.pluginOpts?.path || '/'}"`;
    }
    line += `,fast-open=false,udp=true,block-quic=false`;
    return line;
  }

  if (node.type === 'anytls') {
    let line = `${name} = AnyTLS,${node.server},${node.port},"${node.password || ''}"`;
    if (node.sni) line += `,sni=${node.sni}`;
    if (node.skipCertVerify) line += `,skip-cert-verify=true`;
    if (node.fingerprint) line += `,client-fingerprint=${node.fingerprint}`;
    line += `,udp=true,block-quic=false`;
    return line;
  }

  if (node.type === 'hysteria2') {
    let line = `${name} = Hysteria2,${node.server},${node.port},"${node.password || ''}"`;
    if (node.sni) line += `,sni=${node.sni}`;
    if (node.skipCertVerify) line += `,skip-cert-verify=true`;
    const obfsPwd = node.obfsPassword || (node.obfs && node.obfs !== 'salamander' ? node.obfs : undefined);
    if (obfsPwd) line += `,salamander-password="${obfsPwd}"`;
    if (node.downMbps) line += `,download-bandwidth=${node.downMbps}`;
    if (node.upMbps) line += `,upload-bandwidth=${node.upMbps}`;
    line += `,udp=true,block-quic=false`;
    return line;
  }

  if (node.type === 'vless') {
    let line = `${name} = vless,${node.server},${node.port},"${node.uuid || ''}"`;
    const net = (node.network || 'tcp').toLowerCase();

    if (net === 'ws') {
      line += `,transport=ws`;
      if (node.wsPath) line += `,path=${node.wsPath}`;
      const host = node.wsHeaders?.Host || node.wsHeaders?.host || node.sni;
      if (host) line += `,host=${host}`;
      if (node.earlyDataHeaderName) line += `,ws-early-data-header-name=${node.earlyDataHeaderName}`;
    } else if (net === 'grpc') {
      line += `,transport=grpc`;
      if (node.grpcServiceName) line += `,grpc-service-name=${node.grpcServiceName}`;
    } else if (net === 'http' || net === 'h2') {
      line += `,transport=http`;
      if (node.h2Path) line += `,path=${node.h2Path}`;
      const host = node.h2Host || node.sni;
      if (host) line += `,host=${host}`;
    } else if (net !== 'tcp') {
      line += `,transport=${net}`;
    }

    if (node.tls) line += `,over-tls=true`;
    if (node.sni) line += `,tls-name=${node.sni}`;
    if (node.skipCertVerify) line += `,skip-cert-verify=true`;
    if (node.fingerprint) line += `,client-fingerprint=${node.fingerprint}`;

    if (node.reality && node.reality.enabled) {
      line += `,reality=true,public-key=${node.reality.publicKey}`;
      if (node.reality.shortId) line += `,short-id=${node.reality.shortId}`;
    }
    line += `,udp=true,block-quic=false`;
    return line;
  }

  if (node.type === 'trojan') {
    let line = `${name} = trojan,${node.server},${node.port},"${node.password || ''}"`;
    const net = (node.network || 'tcp').toLowerCase();

    if (net === 'ws') {
      line += `,transport=ws`;
      if (node.wsPath) line += `,path=${node.wsPath}`;
      const host = node.wsHeaders?.Host || node.wsHeaders?.host || node.sni;
      if (host) line += `,host=${host}`;
      if (node.earlyDataHeaderName) line += `,ws-early-data-header-name=${node.earlyDataHeaderName}`;
    } else if (net === 'grpc') {
      line += `,transport=grpc`;
      if (node.grpcServiceName) line += `,grpc-service-name=${node.grpcServiceName}`;
    }

    if (node.tls !== false) line += `,over-tls=true`;
    if (node.sni) line += `,tls-name=${node.sni}`;
    if (node.skipCertVerify) line += `,skip-cert-verify=true`;
    if (node.fingerprint) line += `,client-fingerprint=${node.fingerprint}`;
    line += `,udp=true,block-quic=false`;
    return line;
  }

  if (node.type === 'vmess') {
    const cipher = node.cipher || 'auto';
    let line = `${name} = vmess,${node.server},${node.port},${cipher},"${node.uuid || ''}"`;
    const net = (node.network || 'tcp').toLowerCase();

    if (net === 'ws') {
      line += `,transport=ws`;
      if (node.wsPath) line += `,path=${node.wsPath}`;
      const host = node.wsHeaders?.Host || node.wsHeaders?.host || node.sni;
      if (host) line += `,host=${host}`;
      if (node.earlyDataHeaderName) line += `,ws-early-data-header-name=${node.earlyDataHeaderName}`;
    } else if (net === 'grpc') {
      line += `,transport=grpc`;
      if (node.grpcServiceName) line += `,grpc-service-name=${node.grpcServiceName}`;
    }

    if (node.tls) line += `,over-tls=true`;
    if (node.sni) line += `,tls-name=${node.sni}`;
    if (node.skipCertVerify) line += `,skip-cert-verify=true`;
    if (node.fingerprint) line += `,client-fingerprint=${node.fingerprint}`;
    line += `,udp=true,block-quic=false`;
    return line;
  }

  if (node.type === 'tuic') {
    let line = `${name} = TUIC,${node.server},${node.port},"${node.uuid || ''}","${node.password || ''}"`;
    if (node.sni) line += `,sni=${node.sni}`;
    if (node.skipCertVerify) line += `,skip-cert-verify=true`;
    if (node.congestionControl) line += `,congestion-controller=${node.congestionControl}`;
    line += `,udp=true,block-quic=false`;
    return line;
  }

  if (node.type === 'wireguard') {
    const selfIp = node.ip || (node.localAddress && node.localAddress[0] ? node.localAddress[0].split('/')[0] : '10.0.0.2');
    let line = `${name} = WireGuard,${node.server},${node.port},private-key="${node.privateKey || ''}",peer-public-key="${node.publicKey || ''}",self-ip="${selfIp}"`;
    if (node.presharedKey) line += `,preshared-key="${node.presharedKey}"`;
    if (node.mtu) line += `,mtu=${node.mtu}`;
    return line;
  }

  if (node.type === 'snell') {
    const psk = node.psk || node.password || '';
    const ver = node.snellVersion || 4;
    let line = `${name} = snell,${node.server},${node.port},"${psk}",version=${ver}`;
    if (node.obfs) line += `,obfs=${node.obfs}`;
    if (node.obfsHost) line += `,obfs-host=${node.obfsHost}`;
    line += `,fast-open=false,udp=true`;
    return line;
  }

  if (node.type === 'socks5') {
    let line = `${name} = SOCKS5,${node.server},${node.port}`;
    if (node.username || node.password) {
      line += `,"${node.username || ''}","${node.password || ''}"`;
    }
    line += `,fast-open=false,udp=true`;
    return line;
  }

  if (node.type === 'naive') {
    return `# Unsupported on Loon (NaiveProxy requires Chromium network stack): ${name}`;
  }

  return `# Unsupported node: ${name}`;
}

export function generateLoonConfig(
  templateMcf: string,
  nodes: ProxyNode[],
  proxyGroups: ProxyGroupItem[] = [],
  rulesList: UnifiedRuleItem[] = [],
  sources: any[] = [],
  options?: { expandNodes?: boolean }
): string {
  const expandNodes = Boolean(options?.expandNodes);
  const lines = templateMcf.split('\n');
  const resultLines: string[] = [];

  // In expandNodes mode, write all nodes into [Proxy]; otherwise only custom/manual nodes
  const nodesToWrite = expandNodes ? nodes : nodes.filter(n => n.sourceId === 'custom' || n.sourceId?.startsWith('custom') || !n.sourceId);
  const generatedProxyLines = nodesToWrite.map(nodeToLoonProxy);

  let inProxySection = false;
  let hasHandledProxy = false;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();

    if (trimmed === '[Proxy]') {
      inProxySection = true;
      hasHandledProxy = true;
      resultLines.push(line);
      resultLines.push(...generatedProxyLines);
      continue;
    }

    if (inProxySection && trimmed.startsWith('[')) {
      inProxySection = false;
    }

    if (inProxySection) continue;
    resultLines.push(line);
  }

  if (!hasHandledProxy) {
    resultLines.push('\n[Proxy]');
    resultLines.push(...generatedProxyLines);
  }

  const baseConfig = resultLines.join('\n');
  return injectUnifiedToLoon(baseConfig, nodes, proxyGroups, rulesList, sources, options);
}

