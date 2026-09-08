import React, { useState } from 'react';
import {
  CheckCircle2,
  Copy,
  Edit2,
  Layers,
  ListFilter,
  Plus,
  RefreshCw,
  Server,
  Sparkles,
  Trash2,
  X,
  XCircle,
} from 'lucide-react';
import { SubscriptionSource, ProxyNode } from '../types';

interface SourcesManagerProps {
  sources: SubscriptionSource[];
  onAddSource: (source: { name: string; url: string; type: string }) => Promise<void>;
  onUpdateSource: (id: string, updates: Partial<SubscriptionSource>) => Promise<void>;
  onDeleteSource: (id: string) => Promise<void>;
  onRefreshSource: (id: string) => Promise<void>;
  onImportCustomNodes: (text: string, replaceAll?: boolean) => Promise<void>;
  onDeleteCustomNode: (id: string) => Promise<void>;
}

export const SourcesManager: React.FC<SourcesManagerProps> = ({
  sources,
  onAddSource,
  onUpdateSource,
  onDeleteSource,
  onRefreshSource,
  onImportCustomNodes,
  onDeleteCustomNode,
}) => {
  const [subTab, setSubTab] = useState<'network' | 'custom'>('network');
  const [showAddModal, setShowAddModal] = useState(false);
  const [showCustomModal, setShowCustomModal] = useState(false);
  const [customText, setCustomText] = useState('');
  const [customReplaceAll, setCustomReplaceAll] = useState(false);

  const [newName, setNewName] = useState('');
  const [newUrl, setNewUrl] = useState('');
  const [newType, setNewType] = useState('auto');
  const [refreshingId, setRefreshingId] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const customSource = sources.find(s => s.id === 'custom');
  const customNodes = customSource?.nodes || [];
  const networkSources = sources.filter(s => s.id !== 'custom');

  const handleAddSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newName.trim() || !newUrl.trim()) return;
    setIsSubmitting(true);
    try {
      await onAddSource({ name: newName.trim(), url: newUrl.trim(), type: newType });
      setNewName('');
      setNewUrl('');
      setShowAddModal(false);
    } catch (err: any) {
      console.error('Failed to add source:', err);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleCustomSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!customText.trim()) return;
    await onImportCustomNodes(customText, customReplaceAll);
    setCustomText('');
    setShowCustomModal(false);
  };

  const handleSingleRefresh = async (id: string) => {
    setRefreshingId(id);
    try {
      await onRefreshSource(id);
    } finally {
      setRefreshingId(null);
    }
  };

  return (
    <div className="max-w-5xl mx-auto space-y-5 pb-16">
      {/* Sub-tab Navigation (机场在前, 自建在后) */}
      <div className="flex items-center justify-between border-b border-[#E8E4DC] pb-3">
        <div className="flex items-center gap-1.5 p-1 bg-[#F0ECE4] rounded-xl border border-[#E3DDD2]">
          <button
            onClick={() => setSubTab('network')}
            className={`flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-semibold rounded-lg transition-all ${
              subTab === 'network'
                ? 'bg-white text-[#1F1E1D] shadow-2xs border border-[#DFD9CF]'
                : 'text-[#69655E] hover:text-[#1F1E1D]'
            }`}
          >
            <Layers className="w-3.5 h-3.5 text-[#7A6757]" />
            <span>机场订阅 ({networkSources.length})</span>
          </button>

          <button
            onClick={() => setSubTab('custom')}
            className={`flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-semibold rounded-lg transition-all ${
              subTab === 'custom'
                ? 'bg-white text-[#1F1E1D] shadow-2xs border border-[#DFD9CF]'
                : 'text-[#69655E] hover:text-[#1F1E1D]'
            }`}
          >
            <span>⭐ 独立节点组 ({customNodes.length})</span>
          </button>
        </div>

        {/* Primary Action Button */}
        {subTab === 'network' ? (
          <button
            onClick={() => setShowAddModal(true)}
            className="flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-semibold btn-claude-primary rounded-xl shadow-2xs"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>添加机场订阅</span>
          </button>
        ) : (
          <button
            onClick={() => setShowCustomModal(true)}
            className="flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-semibold btn-claude-primary rounded-xl shadow-2xs"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>批量贴入 / 添加独立节点</span>
          </button>
        )}
      </div>

      {/* Tab 1: 🌐 机场网络订阅 (Proxy Providers) */}
      {subTab === 'network' && (
        <div className="space-y-3">
          <div className="grid grid-cols-1 gap-3">
            {networkSources.map(source => {
              const isThisRefreshing = refreshingId === source.id;
              return (
                <div
                  key={source.id}
                  className={`claude-panel p-4 rounded-2xl bg-white border border-[#E3DDD2] transition-all flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-2xs ${
                    source.enabled ? 'hover:border-[#CC785C]/40' : 'opacity-60 bg-[#FAF8F5]'
                  }`}
                >
                  <div className="flex items-start gap-3 flex-1 min-w-0">
                    <button
                      onClick={() => onUpdateSource(source.id, { enabled: !source.enabled })}
                      className="mt-0.5 shrink-0"
                      title={source.enabled ? '点击禁用' : '点击启用'}
                    >
                      {source.enabled ? (
                        <CheckCircle2 className="w-4 h-4 text-[#367A68]" />
                      ) : (
                        <XCircle className="w-4 h-4 text-[#9E9A91]" />
                      )}
                    </button>

                    <div className="min-w-0 flex-1 space-y-1">
                      <div className="flex items-center gap-2">
                        <h3 className="text-xs font-bold text-[#1F1E1D] truncate">{source.name}</h3>
                        {source.nodeCount !== undefined && (
                          <span className="px-2 py-0.5 text-[10px] font-semibold bg-[#EAF2EE] text-[#2D6A5A] rounded border border-[#D5E5DE]">
                            {source.nodeCount} 节点
                          </span>
                        )}
                      </div>
                      <div className="text-[11px] font-mono text-[#78746D] truncate max-w-xl select-all">
                        {source.url}
                      </div>
                      {source.lastUpdated && (
                        <div className="text-[10px] text-[#9E9A91]">
                          最后同步: {new Date(source.lastUpdated).toLocaleString()}
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Single source action */}
                  <div className="flex items-center gap-2 self-end sm:self-center shrink-0">
                    <button
                      onClick={() => handleSingleRefresh(source.id)}
                      disabled={isThisRefreshing}
                      className="flex items-center gap-1 px-3 py-1.5 text-xs font-medium btn-claude-secondary rounded-xl disabled:opacity-50"
                      title="单独刷新此订阅"
                    >
                      <RefreshCw className={`w-3.5 h-3.5 text-[#CC785C] ${isThisRefreshing ? 'animate-spin' : ''}`} />
                      <span>{isThisRefreshing ? '同步中' : '刷新'}</span>
                    </button>

                    <button
                      onClick={() => onDeleteSource(source.id)}
                      className="p-1.5 text-[#9E9A91] hover:text-[#B85D3F] hover:bg-[#FAF0EC] rounded-xl transition-colors"
                      title="删除订阅源"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>

          {networkSources.length === 0 && (
            <div className="p-8 rounded-2xl bg-white border border-dashed border-[#DFD9CF] text-center space-y-2">
              <Layers className="w-6 h-6 text-[#9E9A91] mx-auto opacity-50" />
              <p className="text-xs font-medium text-[#78746D]">暂无机场订阅</p>
              <button
                onClick={() => setShowAddModal(true)}
                className="text-xs text-[#CC785C] font-semibold hover:underline"
              >
                点击添加机场订阅链接
              </button>
            </div>
          )}
        </div>
      )}

      {/* Tab 2: ⭐ 独立节点组 */}
      {subTab === 'custom' && (
        <div className="space-y-3">
          {customNodes.length > 0 ? (
            <div className="claude-panel rounded-2xl bg-white border border-[#E3DDD2] divide-y divide-[#F0ECE4] overflow-hidden shadow-2xs">
              {customNodes.map(node => (
                <div
                  key={node.id}
                  className="p-3.5 hover:bg-[#FAF8F5] transition-colors flex items-center justify-between gap-3 text-xs"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <span className="text-base">{node.countryEmoji || '🌐'}</span>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-[#1F1E1D] truncate">{node.name}</span>
                        <span className="px-1.5 py-0.2 bg-[#F0ECE4] text-[#59554E] rounded text-[10px] font-mono font-bold">
                          {(node.type || 'vless').toUpperCase()}
                        </span>
                      </div>
                      <div className="text-[11px] font-mono text-[#78746D] truncate">
                        {node.server}:{node.port}
                      </div>
                    </div>
                  </div>

                  <button
                    onClick={() => onDeleteCustomNode(node.id)}
                    className="p-1.5 text-[#9E9A91] hover:text-[#B85D3F] hover:bg-[#FAF0EC] rounded-lg transition-colors"
                    title="删除此节点"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))}
            </div>
          ) : (
            <div className="p-8 rounded-2xl bg-white border border-dashed border-[#DFD9CF] text-center space-y-2">
              <p className="text-xs font-medium text-[#78746D]">暂无独立节点</p>
              <button
                onClick={() => setShowCustomModal(true)}
                className="text-xs text-[#CC785C] font-semibold hover:underline"
              >
                点击粘贴个人 VPS 链接 (vless://, v2rayn://, anytls://, wireguard://, snell://, hysteria2://, Clash YAML, Singbox JSON)
              </button>
            </div>
          )}
        </div>
      )}

      {/* 批量贴入独立节点弹窗 */}
      {showCustomModal && (
        <div className="fixed inset-0 z-50 bg-black/30 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl border border-[#E3DDD2] shadow-xl w-full max-w-xl p-5 space-y-4 animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between pb-3 border-b border-[#F0ECE4]">
              <div>
                <h3 className="text-sm font-bold text-[#1F1E1D]">批量贴入独立节点</h3>
                <p className="text-[11px] text-[#78746D]">
                  支持每行一个节点链接 (vless://, v2rayn://, anytls://, wireguard://, snell://, hy2://, ss://, trojan://)，或 Clash YAML / Singbox JSON 片段
                </p>
              </div>
              <button onClick={() => setShowCustomModal(false)} className="text-xs text-[#9E9A91] hover:text-[#1F1E1D]">
                ✕
              </button>
            </div>

            <form onSubmit={handleCustomSubmit} className="space-y-3.5">
              <textarea
                required
                rows={10}
                placeholder={`vless://11111111-2222-3333-4444-555555555555@example.com:8881?encryption=none&security=reality&type=tcp&sni=swdist.apple.com#我的香港VPS\nanytls://password@example.com:443?sni=example.com&alpn=h2,http/1.1#我的AnyTLS节点\nwireguard://private_key@example.com:51820?public_key=peer_pub_key&ip=10.0.0.2/32#我的WG节点\nsnell://my_psk@example.com:443?version=4&obfs=http&obfs-host=bing.com#我的Snell节点`}
                value={customText}
                onChange={e => setCustomText(e.target.value)}
                className="w-full p-3 bg-[#FAF8F5] border border-[#E8E4DC] rounded-xl font-mono text-xs text-[#1F1E1D] focus:outline-none focus:border-[#CC785C]"
              />

              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id="replaceAllCustom"
                  checked={customReplaceAll}
                  onChange={e => setCustomReplaceAll(e.target.checked)}
                  className="rounded border-[#E8E4DC] text-[#CC785C] focus:ring-0"
                />
                <label htmlFor="replaceAllCustom" className="text-xs text-[#59554E] cursor-pointer">
                  替换全部现有独立节点（若不勾选则为增量追加）
                </label>
              </div>

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-[#F0ECE4]">
                <button
                  type="button"
                  onClick={() => setShowCustomModal(false)}
                  className="px-4 py-2 text-xs font-medium btn-claude-secondary rounded-xl"
                >
                  取消
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 text-xs font-semibold btn-claude-primary rounded-xl"
                >
                  解析并导入
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 添加网络订阅源弹窗 */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 bg-black/30 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl border border-[#E3DDD2] shadow-xl w-full max-w-md p-5 space-y-4 animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between pb-3 border-b border-[#F0ECE4]">
              <h3 className="text-sm font-bold text-[#1F1E1D]">添加机场订阅</h3>
              <button onClick={() => setShowAddModal(false)} className="text-xs text-[#9E9A91] hover:text-[#1F1E1D]">
                ✕
              </button>
            </div>

            <form onSubmit={handleAddSubmit} className="space-y-3.5 text-xs">
              <div className="space-y-1">
                <label className="font-semibold text-[#1F1E1D]">订阅源名称</label>
                <input
                  type="text"
                  required
                  placeholder="例如: 主力订阅 / 机场A"
                  value={newName}
                  onChange={e => setNewName(e.target.value)}
                  className="w-full px-3 py-2 bg-[#FAF8F5] border border-[#E8E4DC] rounded-xl text-[#1F1E1D] focus:outline-none focus:border-[#CC785C]"
                />
              </div>

              <div className="space-y-1">
                <label className="font-semibold text-[#1F1E1D]">订阅链接 URL</label>
                <input
                  type="url"
                  required
                  placeholder="https://..."
                  value={newUrl}
                  onChange={e => setNewUrl(e.target.value)}
                  className="w-full px-3 py-2 bg-[#FAF8F5] border border-[#E8E4DC] rounded-xl text-[#1F1E1D] focus:outline-none focus:border-[#CC785C]"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-[#F0ECE4]">
                <button
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  className="px-4 py-2 text-xs font-medium btn-claude-secondary rounded-xl"
                >
                  取消
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="px-5 py-2 text-xs font-semibold btn-claude-primary rounded-xl disabled:opacity-50 cursor-pointer shadow-2xs"
                >
                  {isSubmitting ? '正在拉取并添加...' : '添加'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
