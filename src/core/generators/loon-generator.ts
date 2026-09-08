import { ProxyNode, ProxyGroupItem, UnifiedRuleItem } from '../../types/index.js';
import { injectUnifiedToLoon } from './rule-injector.js';

export function nodeToLoonProxy(node: ProxyNode): string {
  const name = node.name.replace(/[=,]/g, '_');

  if (node.type === 'ss') {
    const cipher = node.method || 'aes-128-gcm';
    const pwd = `"${node.password || ''}"`;
    return `${name} = Shadowsocks,${node.server},${node.port},${cipher},${pwd},fast-open=false,udp=true,block-quic=false`;
  }

  if (node.type === 'vless') {
    let line = `${name} = vless,${node.server},${node.port},"${node.uuid || ''}"`;
    if (node.network) line += `,transport=${node.network}`;
    if (node.network === 'ws' && node.wsPath) line += `,path=${node.wsPath}`;
    if (node.tls) line += `,over-tls=true`;
    if (node.sni) line += `,tls-name=${node.sni}`;
    if (node.skipCertVerify) line += `,skip-cert-verify=true`;
    if (node.reality && node.reality.enabled) {
      line += `,reality=true,public-key=${node.reality.publicKey}`;
      if (node.reality.shortId) line += `,short-id=${node.reality.shortId}`;
    }
    line += `,udp=true,block-quic=false`;
    return line;
  }

  if (node.type === 'trojan') {
    let line = `${name} = trojan,${node.server},${node.port},"${node.password || ''}"`;
    if (node.tls) line += `,over-tls=true`;
    if (node.sni) line += `,tls-name=${node.sni}`;
    if (node.network === 'ws' && node.wsPath) line += `,transport=ws,path=${node.wsPath}`;
    line += `,udp=true,block-quic=false`;
    return line;
  }

  if (node.type === 'vmess') {
    const cipher = node.cipher || 'auto';
    let line = `${name} = vmess,${node.server},${node.port},${cipher},"${node.uuid || ''}"`;
    if (node.tls) line += `,over-tls=true`;
    if (node.sni) line += `,tls-name=${node.sni}`;
    if (node.network === 'ws' && node.wsPath) line += `,transport=ws,path=${node.wsPath}`;
    line += `,udp=true,block-quic=false`;
    return line;
  }

  if (node.type === 'hysteria2') {
    let line = `${name} = hysteria2,${node.server},${node.port},"${node.password || ''}"`;
    if (node.sni) line += `,sni=${node.sni}`;
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
  const nodesToWrite = expandNodes ? nodes : nodes.filter(n => n.sourceId === 'custom' || !n.sourceId);
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

