import React, { useState, useMemo } from 'react';
import {
  Filter,
  Globe,
  Layers,
  RefreshCw,
  Search,
  Server,
  Shield,
  Zap,
} from 'lucide-react';
import { ProxyNode, SubscriptionSource } from '../types';

interface NodesViewerProps {
  nodes: ProxyNode[];
  sources: SubscriptionSource[];
}

export const NodesViewer: React.FC<NodesViewerProps> = ({
  nodes,
  sources,
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCountry, setSelectedCountry] = useState<string>('ALL');
  const [selectedProtocol, setSelectedProtocol] = useState<string>('ALL');
  const [selectedSource, setSelectedSource] = useState<string>('ALL');

  // Country counts
  const countryCounts = useMemo(() => {
    const map: Record<string, { count: number; emoji: string; name: string }> = {};
    nodes.forEach(n => {
      const code = n.countryCode || 'OTHER';
      if (!map[code]) {
        map[code] = {
          count: 0,
          emoji: n.countryEmoji || '🌐',
          name: code === 'OTHER' ? '其他' : code,
        };
      }
      map[code].count++;
    });
    return map;
  }, [nodes]);

  // Protocol counts
  const protocolCounts = useMemo(() => {
    const map: Record<string, number> = {};
    nodes.forEach(n => {
      const type = (n.type || 'unknown').toUpperCase();
      map[type] = (map[type] || 0) + 1;
    });
    return map;
  }, [nodes]);

  // Filtered nodes
  const filteredNodes = useMemo(() => {
    return nodes.filter(node => {
      // Search
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matchName = node.name.toLowerCase().includes(q);
        const matchServer = node.server.toLowerCase().includes(q);
        const matchPort = String(node.port).includes(q);
        if (!matchName && !matchServer && !matchPort) return false;
      }

      // Country
      if (selectedCountry !== 'ALL') {
        const code = node.countryCode || 'OTHER';
        if (code !== selectedCountry) return false;
      }

      // Protocol
      if (selectedProtocol !== 'ALL') {
        if ((node.type || '').toUpperCase() !== selectedProtocol) return false;
      }

      // Source
      if (selectedSource !== 'ALL') {
        if (selectedSource === 'custom') {
          if (node.sourceId !== 'custom' && node.sourceName !== '独立节点组' && node.sourceName !== '手工自建') return false;
        } else {
          if (node.sourceId !== selectedSource && node.sourceName !== selectedSource) return false;
        }
      }

      return true;
    });
  }, [nodes, searchQuery, selectedCountry, selectedProtocol, selectedSource]);

  return (
    <div className="max-w-6xl mx-auto space-y-4 pb-16">
      {/* Filter & Search Bar */}
      <div className="claude-panel p-4 rounded-2xl bg-white border border-[#E3DDD2] space-y-3.5 shadow-2xs">

        {/* Search & Source filter row */}
        <div className="flex flex-col sm:flex-row items-center gap-2.5">
          <div className="relative flex-1 w-full">
            <Search className="w-4 h-4 text-[#8C877D] absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="text"
              placeholder="搜索节点名称、服务器 IP 或端口..."
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-3.5 py-2 bg-[#FAF8F5] border border-[#E8E4DC] rounded-xl text-xs text-[#1F1E1D] placeholder-[#9E9A91] focus:outline-none focus:border-[#CC785C] focus:bg-white transition-colors"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-[#9E9A91] hover:text-[#1F1E1D]"
              >
                ✕
              </button>
            )}
          </div>

          {/* Source dropdown */}
          <div className="flex items-center gap-1.5 w-full sm:w-auto shrink-0">
            <span className="text-xs text-[#78746D] shrink-0 font-medium">来源:</span>
            <select
              value={selectedSource}
              onChange={e => setSelectedSource(e.target.value)}
              className="flex-1 sm:flex-none px-3 py-2 bg-[#FAF8F5] border border-[#E8E4DC] rounded-xl text-xs font-medium text-[#1F1E1D] focus:outline-none focus:border-[#CC785C]"
            >
              <option value="ALL">全部来源</option>
              <option value="custom">⭐ 独立节点组</option>
              {sources.filter(s => s.type !== 'custom').map(s => (
                <option key={s.id} value={s.id}>
                  {s.name} ({s.nodeCount || 0})
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Country Pills */}
        <div className="space-y-1.5 pt-1 border-t border-[#F0ECE4]">
          <div className="flex items-center gap-1.5 flex-wrap">
            <button
              onClick={() => setSelectedCountry('ALL')}
              className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-colors ${
                selectedCountry === 'ALL'
                  ? 'bg-[#1F1E1D] text-white'
                  : 'bg-[#FAF8F5] text-[#59554E] hover:bg-[#EFEAE2] border border-[#E8E4DC]'
              }`}
            >
              全部地区 ({nodes.length})
            </button>
            {Object.entries(countryCounts).map(([code, data]) => (
              <button
                key={code}
                onClick={() => setSelectedCountry(selectedCountry === code ? 'ALL' : code)}
                className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-medium transition-colors ${
                  selectedCountry === code
                    ? 'bg-[#CC785C] text-white'
                    : 'bg-[#FAF8F5] text-[#4A4742] hover:bg-[#EFEAE2] border border-[#E8E4DC]'
                }`}
              >
                <span>{data.emoji}</span>
                <span>{data.name}</span>
                <span className="font-mono text-[10px] opacity-75">({data.count})</span>
              </button>
            ))}
          </div>
        </div>

        {/* Protocol Pills */}
        <div className="flex items-center gap-1.5 flex-wrap pt-1 border-t border-[#F0ECE4]">
          <span className="text-[11px] text-[#78746D] font-medium mr-1">协议:</span>
          <button
            onClick={() => setSelectedProtocol('ALL')}
            className={`px-2 py-0.5 rounded text-[11px] font-mono font-semibold transition-colors ${
              selectedProtocol === 'ALL'
                ? 'bg-[#59554E] text-white'
                : 'bg-[#F0ECE4] text-[#69655E] hover:bg-[#E8E4DC]'
            }`}
          >
            ALL
          </button>
          {Object.entries(protocolCounts).map(([proto, count]) => (
            <button
              key={proto}
              onClick={() => setSelectedProtocol(selectedProtocol === proto ? 'ALL' : proto)}
              className={`px-2 py-0.5 rounded text-[11px] font-mono font-semibold transition-colors ${
                selectedProtocol === proto
                  ? 'bg-[#CC785C] text-white'
                  : 'bg-[#F0ECE4] text-[#69655E] hover:bg-[#E8E4DC]'
              }`}
            >
              {proto} ({count})
            </button>
          ))}
        </div>
      </div>

      {/* Nodes Grid */}
      <div className="space-y-2">
        <div className="flex items-center justify-between px-1 text-xs text-[#78746D]">
          <span>展示 <b>{filteredNodes.length}</b> 个节点</span>
          {(selectedCountry !== 'ALL' || selectedProtocol !== 'ALL' || selectedSource !== 'ALL' || searchQuery) && (
            <button
              onClick={() => {
                setSelectedCountry('ALL');
                setSelectedProtocol('ALL');
                setSelectedSource('ALL');
                setSearchQuery('');
              }}
              className="text-[#CC785C] hover:underline"
            >
              清除所有筛选条件
            </button>
          )}
        </div>

        {filteredNodes.length > 0 ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {filteredNodes.map(node => {
              const isCustom = node.sourceId === 'custom' || node.sourceName === '独立节点组' || node.sourceName === '手工自建';
              return (
                <div
                  key={node.id}
                  className={`p-3.5 rounded-xl bg-white border transition-all hover:shadow-2xs ${
                    isCustom ? 'border-[#E8D4C8] bg-[#FAF8F5]' : 'border-[#E3DDD2]'
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-1.5 min-w-0">
                      <span className="text-base">{node.countryEmoji || '🌐'}</span>
                      <span className="text-xs font-bold text-[#1F1E1D] truncate" title={node.name}>
                        {node.name}
                      </span>
                    </div>
                    <span className="px-1.5 py-0.5 bg-[#F0ECE4] text-[#59554E] rounded text-[10px] font-mono font-bold shrink-0">
                      {(node.type || 'vless').toUpperCase()}
                    </span>
                  </div>

                  <div className="mt-2 text-[11px] font-mono text-[#78746D] truncate">
                    {node.server}:{node.port}
                  </div>

                  <div className="mt-2 pt-2 border-t border-[#F0ECE4] flex items-center justify-between text-[10px] text-[#9E9A91]">
                    <span className="truncate max-w-[150px]">
                      {isCustom ? '⭐ 独立节点组' : node.sourceName || '网络订阅'}
                    </span>
                    <div className="flex items-center gap-1">
                      {node.tls && <span className="text-[#367A68]">TLS</span>}
                      {node.network && <span>{node.network.toUpperCase()}</span>}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="claude-panel p-12 rounded-2xl bg-white border border-[#E3DDD2] text-center space-y-2">
            <Server className="w-8 h-8 text-[#9E9A91] mx-auto opacity-50" />
            <p className="text-xs font-semibold text-[#59554E]">未找到符合条件的节点</p>
            <p className="text-[11px] text-[#9E9A91]">尝试调整搜索关键字或筛选条件</p>
          </div>
        )}
      </div>
    </div>
  );
};
