import React, { useState, useMemo } from 'react';
import {
  Check,
  CheckCircle2,
  ChevronDown,
  Copy,
  Edit2,
  ExternalLink,
  Layers,
  Plus,
  RefreshCw,
  Search,
  Server,
  Sparkles,
  Trash2,
  X,
  XCircle,
} from 'lucide-react';
import { SubscriptionSource, ProxyNode } from '../types';
import { nodeToUri } from '../utils/nodeUri';

interface SourcesManagerProps {
  sources: SubscriptionSource[];
  onAddSource: (source: { name: string; url: string; type: string }) => Promise<void>;
  onAddCustomGroup?: (name: string) => Promise<void>;
  onUpdateSource: (id: string, updates: Partial<SubscriptionSource>) => Promise<void>;
  onDeleteSource: (id: string) => Promise<void>;
  onRefreshSource: (id: string) => Promise<void>;
  onRefreshAllSources?: () => Promise<void>;
  onImportCustomNodes: (text: string, replaceAll?: boolean, targetSourceId?: string) => Promise<void>;
  onUpdateCustomNode?: (id: string, updates: Partial<ProxyNode>) => Promise<void>;
  onDeleteCustomNode: (id: string) => Promise<void>;
}

export const SourcesManager: React.FC<SourcesManagerProps> = ({
  sources,
  onAddSource,
  onAddCustomGroup,
  onUpdateSource,
  onDeleteSource,
  onRefreshSource,
  onRefreshAllSources,
  onImportCustomNodes,
  onUpdateCustomNode,
  onDeleteCustomNode,
}) => {
  // Modal states
  const [showAddNetworkModal, setShowAddNetworkModal] = useState(false);
  const [showImportNodesModal, setShowImportNodesModal] = useState(false);
  const [showCreateGroupModal, setShowCreateGroupModal] = useState(false);
  const [renamingSource, setRenamingSource] = useState<SubscriptionSource | null>(null);
  const [newGroupNameInput, setNewGroupNameInput] = useState('');

  // Node rename state
  const [renamingNode, setRenamingNode] = useState<{ id: string; name: string } | null>(null);
  const [newNodeNameInput, setNewNodeNameInput] = useState('');

  // Target group for importing nodes
  const [targetGroupId, setTargetGroupId] = useState<string>('custom');
  const [customText, setCustomText] = useState('');
  const [customReplaceAll, setCustomReplaceAll] = useState(false);

  // Network source form states
  const [newNetworkName, setNewNetworkName] = useState('');
  const [newNetworkUrl, setNewNetworkUrl] = useState('');
  const [newNetworkType, setNewNetworkType] = useState('auto');

  // Loading & Action states
  const [refreshingId, setRefreshingId] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [copiedNodeId, setCopiedNodeId] = useState<string | null>(null);

  // Accordion expanded source IDs
  const [expandedSourceIds, setExpandedSourceIds] = useState<Set<string>>(new Set(['custom']));

  // Internal search term for each source accordion: sourceId -> searchTerm
  const [sourceSearchTerms, setSourceSearchTerms] = useState<Record<string, string>>({});

  // Partition sources: Custom Groups first, then Network Sources
  const customSources = useMemo(() => {
    return sources.filter(s => s.type === 'custom' || s.id === 'custom').sort((a, b) => {
      if (a.id === 'custom') return -1;
      if (b.id === 'custom') return 1;
      return a.name.localeCompare(b.name);
    });
  }, [sources]);

  const networkSources = useMemo(() => {
    return sources.filter(s => s.type !== 'custom' && s.id !== 'custom');
  }, [sources]);

  // Unified list of all sources for single-flow presentation
  const unifiedSources = useMemo(() => {
    return [...customSources, ...networkSources];
  }, [customSources, networkSources]);

  // Total nodes count across all sources
  const totalNodesCount = useMemo(() => {
    return sources.reduce((acc, s) => acc + (s.nodes?.length || s.nodeCount || 0), 0);
  }, [sources]);

  // Toggle accordion expand
  const toggleExpand = (sourceId: string) => {
    setExpandedSourceIds(prev => {
      const next = new Set(prev);
      if (next.has(sourceId)) {
        next.delete(sourceId);
      } else {
        next.add(sourceId);
      }
      return next;
    });
  };

  // Open import modal targeting a specific group
  const handleOpenImportModal = (groupId?: string) => {
    const defaultGroup = groupId || customSources[0]?.id || 'custom';
    setTargetGroupId(defaultGroup);
    setCustomText('');
    setCustomReplaceAll(false);
    setShowImportNodesModal(true);
  };

  // Submit network source
  const handleAddNetworkSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newNetworkName.trim() || !newNetworkUrl.trim()) return;
    setIsSubmitting(true);
    try {
      await onAddSource({
        name: newNetworkName.trim(),
        url: newNetworkUrl.trim(),
        type: newNetworkType,
      });
      setNewNetworkName('');
      setNewNetworkUrl('');
      setShowAddNetworkModal(false);
    } catch (err: any) {
      console.error('Failed to add network source:', err);
    } finally {
      setIsSubmitting(false);
    }
  };

  // Submit new custom group
  const handleCreateGroupSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const name = newGroupNameInput.trim();
    if (!name) return;
    setIsSubmitting(true);
    try {
      if (onAddCustomGroup) {
        await onAddCustomGroup(name);
      } else {
        await onAddSource({ name, url: '', type: 'custom' });
      }
      setNewGroupNameInput('');
      setShowCreateGroupModal(false);
    } catch (err: any) {
      alert(err.message || '创建节点组失败');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Submit rename source
  const handleRenameSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!renamingSource || !newGroupNameInput.trim()) return;
    setIsSubmitting(true);
    try {
      await onUpdateSource(renamingSource.id, { name: newGroupNameInput.trim() });
      setRenamingSource(null);
      setNewGroupNameInput('');
    } catch (err: any) {
      alert(err.message || '重命名失败');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Submit rename node
  const handleRenameNodeSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!renamingNode || !newNodeNameInput.trim() || isSubmitting) return;
    setIsSubmitting(true);
    try {
      if (onUpdateCustomNode) {
        await onUpdateCustomNode(renamingNode.id, { name: newNodeNameInput.trim() });
      }
      setRenamingNode(null);
      setNewNodeNameInput('');
    } catch (err: any) {
      alert(err.message || '重命名节点失败');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Submit import nodes
  const handleImportSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!customText.trim() || isSubmitting) return;
    setIsSubmitting(true);
    try {
      await onImportCustomNodes(customText, customReplaceAll, targetGroupId);
      setCustomText('');
      setShowImportNodesModal(false);
      // Auto-expand the target group
      setExpandedSourceIds(prev => new Set([...prev, targetGroupId]));
    } catch (err: any) {
      alert(err.message || '导入节点失败');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Single refresh
  const handleSingleRefresh = async (id: string) => {
    setRefreshingId(id);
    try {
      await onRefreshSource(id);
    } finally {
      setRefreshingId(null);
    }
  };

  // Copy node URI or info
  const handleCopyNode = (node: ProxyNode) => {
    const textToCopy = nodeToUri(node);
    navigator.clipboard.writeText(textToCopy);
    setCopiedNodeId(node.id);
    setTimeout(() => setCopiedNodeId(null), 1500);
  };

  return (
    <div className="max-w-5xl mx-auto space-y-5 pb-16">
      {/* 1. 顶部操作栏与统计指标 */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-[#E8E4DC] pb-4">
        <div>
          <div className="flex items-center gap-2.5">
            <h1 className="text-base font-bold text-[#1F1E1D]">订阅与节点</h1>
            <div className="flex items-center gap-1.5">
              <span className="text-[11px] px-2 py-0.5 rounded-full bg-[#FBF2EA] text-[#C45E38] font-semibold border border-[#F2D8C9]">
                {customSources.length} 个自建组
              </span>
              <span className="text-[11px] px-2 py-0.5 rounded-full bg-[#EAF2EE] text-[#2D6A5A] font-semibold border border-[#D5E5DE]">
                {networkSources.length} 个网络订阅
              </span>
              <span className="text-[11px] px-2 py-0.5 rounded-full bg-[#EFEAE2] text-[#69655E] font-mono font-semibold">
                共 {totalNodesCount} 节点
              </span>
            </div>
          </div>
          <p className="text-xs text-[#8C877D] mt-1">
            统一管理网络订阅与自建散装节点，点击卡片就地展开查看、复制与管理节点
          </p>
        </div>

        {/* 顶部操作按钮组 */}
        <div className="flex items-center gap-2 shrink-0">
          <button
            onClick={() => handleOpenImportModal()}
            className="flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-semibold btn-claude-primary rounded-xl shadow-2xs cursor-pointer"
          >
            <Plus className="w-3.5 h-3.5 stroke-[2.5]" />
            <span>添加节点</span>
          </button>

          <button
            onClick={() => setShowAddNetworkModal(true)}
            className="flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-semibold btn-claude-secondary rounded-xl shadow-2xs cursor-pointer"
          >
            <Plus className="w-3.5 h-3.5 stroke-[2.5]" />
            <span>添加订阅</span>
          </button>

          <button
            onClick={() => {
              setNewGroupNameInput('');
              setShowCreateGroupModal(true);
            }}
            className="flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-semibold btn-claude-secondary rounded-xl shadow-2xs cursor-pointer"
            title="新建独立的自建节点分组"
          >
            <Plus className="w-3.5 h-3.5 stroke-[2.5]" />
            <span>新建组</span>
          </button>
        </div>
      </div>

      {/* 2. 统一卡片流（自建组自然置顶，网络订阅紧随其后） */}
      <div className="space-y-3">
        {unifiedSources.map(source => {
          const isCustom = source.type === 'custom' || source.id === 'custom';
          const isExpanded = expandedSourceIds.has(source.id);
          const isThisRefreshing = refreshingId === source.id;
          const nodesList = source.nodes || [];
          const currentSearch = (sourceSearchTerms[source.id] || '').toLowerCase().trim();

          const filteredNodes = currentSearch
            ? nodesList.filter(n =>
                n.name.toLowerCase().includes(currentSearch) ||
                n.server.toLowerCase().includes(currentSearch) ||
                (n.type || '').toLowerCase().includes(currentSearch) ||
                String(n.port).includes(currentSearch)
              )
            : nodesList;

          return (
            <div
              key={source.id}
              className={`rounded-2xl border transition-all duration-200 bg-white overflow-hidden shadow-2xs ${
                source.enabled !== false
                  ? isExpanded
                    ? 'border-[#CC785C]/60 shadow-sm'
                    : 'border-[#E3DDD2] hover:border-[#CC785C]/40'
                  : 'border-[#E8E4DC] opacity-65 bg-[#FAF8F5]'
              }`}
            >
              {/* 卡片主横条 (Header) */}
              <div
                className={`p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 cursor-pointer select-none transition-colors ${
                  isExpanded ? 'bg-[#FCFAF7]' : 'hover:bg-[#FCFBF9]'
                }`}
                onClick={() => toggleExpand(source.id)}
              >
                {/* 左侧：类型徽章、名称、节点数、副标题 */}
                <div className="flex items-start gap-3 flex-1 min-w-0">
                  {/* 折叠展开箭头指示器 */}
                  <div className="mt-0.5 shrink-0 text-[#8C877D] hover:text-[#1F1E1D] transition-transform duration-200">
                    <ChevronDown
                      className={`w-4 h-4 transition-transform duration-200 ${
                        isExpanded ? 'rotate-180 text-[#CC785C]' : ''
                      }`}
                    />
                  </div>

                  <div className="min-w-0 flex-1 space-y-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      {/* 类型徽章 */}
                      {isCustom ? (
                        <span className="px-2 py-0.5 text-[10px] font-bold rounded-md bg-[#FBF2EA] text-[#C45E38] border border-[#F2D8C9] shrink-0">
                          ⭐ 自建组
                        </span>
                      ) : (
                        <span className="px-2 py-0.5 text-[10px] font-bold rounded-md bg-[#EAF2EE] text-[#2D6A5A] border border-[#D5E5DE] shrink-0">
                          ✈️ 网络订阅
                        </span>
                      )}

                      {/* 标题 */}
                      <h3 className="text-xs font-bold text-[#1F1E1D] truncate max-w-xs sm:max-w-md">
                        {source.name}
                      </h3>

                      {/* 节点数徽章 */}
                      <span className="px-2 py-0.5 text-[10px] font-mono font-semibold rounded bg-[#F0ECE4] text-[#59554E] shrink-0">
                        {nodesList.length} 节点
                      </span>
                    </div>

                    {/* 卡片副信息 */}
                    <div className="text-[11px] text-[#78746D] truncate">
                      {isCustom ? (
                        <span>包含 {nodesList.length} 个自建节点 · 支持 VLESS, Hysteria2, SS, WireGuard 等</span>
                      ) : (
                        <span className="font-mono select-all text-[#8C877D]">{source.url}</span>
                      )}
                    </div>

                    {/* 更新时间提示 */}
                    {source.lastUpdated && (
                      <div className="text-[10px] text-[#9E9A91]">
                        最后同步: {new Date(source.lastUpdated).toLocaleString()}
                      </div>
                    )}
                  </div>
                </div>

                {/* 右侧快捷操作按钮（点击阻止事件冒泡） */}
                <div
                  className="flex items-center gap-1.5 self-end sm:self-center shrink-0"
                  onClick={e => e.stopPropagation()}
                >
                  {/* 自建组专属操作 */}
                  {isCustom && (
                    <>
                      <button
                        onClick={() => handleOpenImportModal(source.id)}
                        className="flex items-center gap-1 px-2.5 py-1 text-xs font-semibold text-[#CC785C] bg-[#CC785C]/10 hover:bg-[#CC785C]/20 rounded-lg transition-colors cursor-pointer"
                        title="添加节点到此组"
                      >
                        <Plus className="w-3.5 h-3.5" />
                        <span>添加节点</span>
                      </button>

                      <button
                        onClick={() => {
                          setRenamingSource(source);
                          setNewGroupNameInput(source.name);
                        }}
                        className="p-1.5 text-[#9E9A91] hover:text-[#1F1E1D] hover:bg-[#EFEAE2]/60 rounded-lg transition-colors cursor-pointer"
                        title="重命名此节点组"
                      >
                        <Edit2 className="w-3.5 h-3.5" />
                      </button>

                      {source.id !== 'custom' && (
                        <button
                          onClick={() => {
                            if (confirm(`确定要删除自建节点组【${source.name}】及其包含的所有节点吗？`)) {
                              onDeleteSource(source.id);
                            }
                          }}
                          className="p-1.5 text-[#9E9A91] hover:text-[#B85D3F] hover:bg-[#FAF0EC] rounded-lg transition-colors cursor-pointer"
                          title="删除此节点组"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </>
                  )}

                  {/* 网络订阅专属操作 */}
                  {!isCustom && (
                    <>
                      <button
                        onClick={() => handleSingleRefresh(source.id)}
                        disabled={isThisRefreshing}
                        className="flex items-center gap-1 px-2.5 py-1 text-xs font-medium btn-claude-secondary rounded-lg disabled:opacity-50 cursor-pointer"
                        title="单独刷新此订阅"
                      >
                        <RefreshCw className={`w-3.5 h-3.5 text-[#CC785C] ${isThisRefreshing ? 'animate-spin' : ''}`} />
                        <span>{isThisRefreshing ? '同步中' : '刷新'}</span>
                      </button>

                      <button
                        onClick={() => onUpdateSource(source.id, { enabled: !source.enabled })}
                        className="p-1.5 text-[#8C877D] hover:text-[#1F1E1D] hover:bg-[#EFEAE2]/60 rounded-lg transition-colors cursor-pointer"
                        title={source.enabled !== false ? '点击停用' : '点击启用'}
                      >
                        {source.enabled !== false ? (
                          <CheckCircle2 className="w-4 h-4 text-[#367A68]" />
                        ) : (
                          <XCircle className="w-4 h-4 text-[#9E9A91]" />
                        )}
                      </button>

                      <button
                        onClick={() => {
                          if (confirm(`确定要删除订阅源【${source.name}】吗？`)) {
                            onDeleteSource(source.id);
                          }
                        }}
                        className="p-1.5 text-[#9E9A91] hover:text-[#B85D3F] hover:bg-[#FAF0EC] rounded-lg transition-colors cursor-pointer"
                        title="删除订阅源"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </>
                  )}
                </div>
              </div>

              {/* 3. 展开区域：就地查看节点详情 (Accordion) */}
              {isExpanded && (
                <div className="border-t border-[#F0ECE4] bg-white p-4 space-y-3 animate-in fade-in duration-150">
                  {/* 组内快速搜索过滤栏 */}
                  <div className="flex items-center justify-between gap-3">
                    <div className="relative flex-1 max-w-sm">
                      <Search className="w-3.5 h-3.5 text-[#8C877D] absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                      <input
                        type="text"
                        placeholder={`在【${source.name}】中搜索节点名、协议或服务器...`}
                        value={sourceSearchTerms[source.id] || ''}
                        onChange={e =>
                          setSourceSearchTerms(prev => ({ ...prev, [source.id]: e.target.value }))
                        }
                        className="w-full pl-8 pr-7 py-1 text-xs bg-[#FAF8F5] border border-[#E3DDD2] rounded-lg text-[#1F1E1D] focus:outline-none focus:border-[#CC785C]"
                      />
                      {sourceSearchTerms[source.id] && (
                        <button
                          onClick={() =>
                            setSourceSearchTerms(prev => ({ ...prev, [source.id]: '' }))
                          }
                          className="absolute right-2 top-1/2 -translate-y-1/2 text-[#8C877D] hover:text-[#1F1E1D] text-xs"
                        >
                          ✕
                        </button>
                      )}
                    </div>

                    <div className="text-[11px] text-[#8C877D] shrink-0 font-medium">
                      显示 {filteredNodes.length} / {nodesList.length} 节点
                    </div>
                  </div>

                  {/* 节点列表渲染 */}
                  {filteredNodes.length > 0 ? (
                    <div className="rounded-xl border border-[#EBE6DC] divide-y divide-[#F0ECE4] overflow-hidden">
                      {filteredNodes.map(node => (
                        <div
                          key={node.id}
                          className="px-3.5 py-2 hover:bg-[#FAF8F5] transition-colors flex items-center justify-between gap-3 text-xs group/item"
                        >
                          {/* 左侧：Emoji、节点名、协议类型、服务器端口 */}
                          <div className="flex items-center gap-2.5 min-w-0 flex-1">
                            <span className="text-sm shrink-0">{node.countryEmoji || '🌐'}</span>
                            <div className="min-w-0 flex-1 flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-2">
                              <span className="font-bold text-[#1F1E1D] truncate max-w-md">
                                {node.name}
                              </span>
                              <div className="flex items-center gap-1.5 shrink-0">
                                <span className="px-1.5 py-0.2 bg-[#F0ECE4] text-[#59554E] rounded text-[10px] font-mono font-bold">
                                  {(node.type || 'vless').toUpperCase()}
                                </span>
                                <span className="text-[11px] font-mono text-[#8C877D] truncate">
                                  {node.server}:{node.port}
                                </span>
                              </div>
                            </div>
                          </div>

                          {/* 右侧微操作：复制链接、改名、删除自建节点 */}
                          <div className="flex items-center gap-1.5 shrink-0">
                            <button
                              onClick={() => handleCopyNode(node)}
                              className="p-1 text-[#9E9A91] hover:text-[#1F1E1D] hover:bg-[#EFEAE2] rounded transition-colors cursor-pointer"
                              title="复制节点链接"
                            >
                              {copiedNodeId === node.id ? (
                                <Check className="w-3.5 h-3.5 text-[#367A68]" />
                              ) : (
                                <Copy className="w-3.5 h-3.5" />
                              )}
                            </button>

                            <button
                              onClick={() => {
                                setRenamingNode({ id: node.id, name: node.name });
                                setNewNodeNameInput(node.name);
                              }}
                              className="p-1 text-[#9E9A91] hover:text-[#1F1E1D] hover:bg-[#EFEAE2] rounded transition-colors cursor-pointer"
                              title="重命名此节点"
                            >
                              <Edit2 className="w-3.5 h-3.5" />
                            </button>

                            {isCustom && (
                              <button
                                onClick={() => {
                                  if (confirm(`确定要删除自建节点【${node.name}】吗？`)) {
                                    onDeleteCustomNode(node.id);
                                  }
                                }}
                                className="p-1 text-[#9E9A91] hover:text-[#B85D3F] hover:bg-[#FAF0EC] rounded transition-colors cursor-pointer"
                                title="删除此节点"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="p-6 rounded-xl border border-dashed border-[#DFD9CF] text-center space-y-2">
                      <p className="text-xs font-medium text-[#8C877D]">
                        {nodesList.length === 0 ? '该组暂无节点' : '没有匹配搜索条件的节点'}
                      </p>
                      {isCustom && nodesList.length === 0 && (
                        <button
                          onClick={() => handleOpenImportModal(source.id)}
                          className="text-xs text-[#CC785C] font-semibold hover:underline"
                        >
                          点击批量贴入节点链接 (vless://, hysteria2://, ss://, Clash YAML, Singbox JSON)
                        </button>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}

        {unifiedSources.length === 0 && (
          <div className="p-12 rounded-2xl bg-white border border-dashed border-[#DFD9CF] text-center space-y-3">
            <Layers className="w-8 h-8 text-[#9E9A91] mx-auto opacity-50" />
            <p className="text-xs font-medium text-[#78746D]">暂无任何订阅或自建节点组</p>
            <div className="flex items-center justify-center gap-2">
              <button
                onClick={() => handleOpenImportModal()}
                className="px-3 py-1.5 text-xs font-semibold btn-claude-primary rounded-xl"
              >
                贴入自建节点
              </button>
              <button
                onClick={() => setShowAddNetworkModal(true)}
                className="px-3 py-1.5 text-xs font-semibold btn-claude-secondary rounded-xl"
              >
                添加网络订阅链接
              </button>
            </div>
          </div>
        )}
      </div>

      {/* 弹窗 1：添加网络机场订阅弹窗 */}
      {showAddNetworkModal && (
        <div className="fixed inset-0 z-50 bg-black/30 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl border border-[#E3DDD2] shadow-xl w-full max-w-md p-5 space-y-4 animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between pb-3 border-b border-[#F0ECE4]">
              <div>
                <h3 className="text-sm font-bold text-[#1F1E1D]">添加网络订阅源</h3>
                <p className="text-[11px] text-[#78746D]">支持 HTTP/HTTPS 机场订阅链接，添加后自动解析</p>
              </div>
              <button
                onClick={() => setShowAddNetworkModal(false)}
                className="text-xs text-[#9E9A91] hover:text-[#1F1E1D] p-1"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleAddNetworkSubmit} className="space-y-3.5">
              <div>
                <label className="block text-xs font-semibold text-[#1F1E1D] mb-1">订阅源名称</label>
                <input
                  type="text"
                  required
                  placeholder="例如：极速机场 主力源"
                  value={newNetworkName}
                  onChange={e => setNewNetworkName(e.target.value)}
                  className="w-full px-3 py-2 text-xs bg-white border border-[#E3DDD2] rounded-xl text-[#1F1E1D] focus:outline-none focus:border-[#CC785C]"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-[#1F1E1D] mb-1">订阅 URL</label>
                <input
                  type="url"
                  required
                  placeholder="https://airport.com/api/v1/client/subscribe?token=..."
                  value={newNetworkUrl}
                  onChange={e => setNewNetworkUrl(e.target.value)}
                  className="w-full px-3 py-2 text-xs bg-white border border-[#E3DDD2] rounded-xl text-[#1F1E1D] focus:outline-none focus:border-[#CC785C] font-mono text-[11px]"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-[#1F1E1D] mb-1">格式解析模式</label>
                <select
                  value={newNetworkType}
                  onChange={e => setNewNetworkType(e.target.value)}
                  className="w-full px-3 py-2 text-xs bg-white border border-[#E3DDD2] rounded-xl text-[#1F1E1D] focus:outline-none focus:border-[#CC785C]"
                >
                  <option value="auto">自动识别 (Auto)</option>
                  <option value="clash">Clash YAML</option>
                  <option value="singbox">Singbox JSON</option>
                  <option value="base64">Base64 编码节点串</option>
                </select>
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowAddNetworkModal(false)}
                  className="px-3.5 py-1.5 text-xs font-medium btn-claude-secondary rounded-xl"
                >
                  取消
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="px-4 py-1.5 text-xs font-semibold btn-claude-primary rounded-xl disabled:opacity-50"
                >
                  {isSubmitting ? '正在拉取...' : '添加并拉取'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 弹窗 2：批量贴入 / 添加自建独立节点弹窗 */}
      {showImportNodesModal && (
        <div className="fixed inset-0 z-50 bg-black/30 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl border border-[#E3DDD2] shadow-xl w-full max-w-xl p-5 space-y-4 animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between pb-3 border-b border-[#F0ECE4]">
              <div>
                <h3 className="text-sm font-bold text-[#1F1E1D]">批量贴入自建节点</h3>
                <p className="text-[11px] text-[#78746D]">
                  支持每行一个节点链接 (vless://, ss://, hy2://, trojan://, anytls://, wireguard://, snell://)，或 Clash YAML / Singbox JSON
                </p>
              </div>
              <button
                onClick={() => setShowImportNodesModal(false)}
                className="text-xs text-[#9E9A91] hover:text-[#1F1E1D] p-1"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleImportSubmit} className="space-y-3.5">
              {/* 目标节点组选择 */}
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="text-xs font-semibold text-[#1F1E1D]">存入自建节点组</label>
                  <button
                    type="button"
                    onClick={() => {
                      setNewGroupNameInput('');
                      setShowCreateGroupModal(true);
                    }}
                    className="text-[11px] text-[#CC785C] hover:underline font-medium"
                  >
                    + 新建自建组
                  </button>
                </div>
                <select
                  value={targetGroupId}
                  onChange={e => setTargetGroupId(e.target.value)}
                  className="w-full px-3 py-2 text-xs bg-white border border-[#E3DDD2] rounded-xl text-[#1F1E1D] focus:outline-none focus:border-[#CC785C]"
                >
                  {customSources.map(cs => (
                    <option key={cs.id} value={cs.id}>
                      {cs.name} ({cs.nodes?.length || 0} 个节点)
                    </option>
                  ))}
                </select>
              </div>

              {/* 链接文本输入域 */}
              <div>
                <label className="block text-xs font-semibold text-[#1F1E1D] mb-1">节点链接 / 片段</label>
                <textarea
                  required
                  rows={9}
                  placeholder={`vless://11111111-2222-3333-4444-555555555555@example.com:8881?encryption=none&security=reality&type=tcp&sni=swdist.apple.com#我的香港VPS\nhysteria2://my_password@example.com:8443?sni=example.com#我的Hy2节点\nwireguard://private_key@example.com:51820?public_key=peer_pub_key&ip=10.0.0.2/32#家庭WG\nanytls://password@example.com:443?sni=example.com#我的AnyTLS`}
                  value={customText}
                  onChange={e => setCustomText(e.target.value)}
                  className="w-full px-3 py-2 text-[11px] font-mono bg-[#FAF8F5] border border-[#E3DDD2] rounded-xl text-[#1F1E1D] focus:outline-none focus:border-[#CC785C]"
                />
              </div>

              <div className="flex items-center justify-between pt-1">
                <label className="flex items-center gap-2 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={customReplaceAll}
                    onChange={e => setCustomReplaceAll(e.target.checked)}
                    className="rounded border-[#DFD9CF] text-[#CC785C] focus:ring-[#CC785C]"
                  />
                  <span className="text-xs text-[#78746D]">覆盖模式 (清空该组并完全替换)</span>
                </label>

                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => setShowImportNodesModal(false)}
                    className="px-3.5 py-1.5 text-xs font-medium btn-claude-secondary rounded-xl"
                  >
                    取消
                  </button>
                  <button
                    type="submit"
                    disabled={isSubmitting}
                    className="px-4 py-1.5 text-xs font-semibold btn-claude-primary rounded-xl disabled:opacity-50"
                  >
                    {isSubmitting ? '解析导入中...' : '解析并存入'}
                  </button>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 弹窗 3：新建自建组弹窗 */}
      {showCreateGroupModal && (
        <div className="fixed inset-0 z-50 bg-black/30 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl border border-[#E3DDD2] shadow-xl w-full max-w-sm p-5 space-y-4 animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between pb-3 border-b border-[#F0ECE4]">
              <h3 className="text-sm font-bold text-[#1F1E1D]">新建自建节点组</h3>
              <button
                onClick={() => setShowCreateGroupModal(false)}
                className="text-xs text-[#9E9A91] hover:text-[#1F1E1D]"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleCreateGroupSubmit} className="space-y-3.5">
              <div>
                <label className="block text-xs font-semibold text-[#1F1E1D] mb-1">节点组名称</label>
                <input
                  type="text"
                  required
                  autoFocus
                  placeholder="例如：家庭内网 WireGuard、甲骨文VPS"
                  value={newGroupNameInput}
                  onChange={e => setNewGroupNameInput(e.target.value)}
                  className="w-full px-3 py-2 text-xs bg-white border border-[#E3DDD2] rounded-xl text-[#1F1E1D] focus:outline-none focus:border-[#CC785C]"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowCreateGroupModal(false)}
                  className="px-3.5 py-1.5 text-xs font-medium btn-claude-secondary rounded-xl"
                >
                  取消
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="px-4 py-1.5 text-xs font-semibold btn-claude-primary rounded-xl disabled:opacity-50"
                >
                  {isSubmitting ? '创建中...' : '立即创建'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 弹窗 4：重命名节点组弹窗 */}
      {renamingSource && (
        <div className="fixed inset-0 z-50 bg-black/30 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl border border-[#E3DDD2] shadow-xl w-full max-w-sm p-5 space-y-4 animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between pb-3 border-b border-[#F0ECE4]">
              <h3 className="text-sm font-bold text-[#1F1E1D]">重命名节点组</h3>
              <button
                onClick={() => setRenamingSource(null)}
                className="text-xs text-[#9E9A91] hover:text-[#1F1E1D]"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleRenameSubmit} className="space-y-3.5">
              <div>
                <label className="block text-xs font-semibold text-[#1F1E1D] mb-1">新组名</label>
                <input
                  type="text"
                  required
                  autoFocus
                  value={newGroupNameInput}
                  onChange={e => setNewGroupNameInput(e.target.value)}
                  className="w-full px-3 py-2 text-xs bg-white border border-[#E3DDD2] rounded-xl text-[#1F1E1D] focus:outline-none focus:border-[#CC785C]"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setRenamingSource(null)}
                  className="px-3.5 py-1.5 text-xs font-medium btn-claude-secondary rounded-xl"
                >
                  取消
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="px-4 py-1.5 text-xs font-semibold btn-claude-primary rounded-xl disabled:opacity-50"
                >
                  {isSubmitting ? '保存中...' : '保存'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
      {/* 重命名节点弹窗 */}
      {renamingNode && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-[#FAF8F5] border border-[#E3DDD2] rounded-2xl p-5 max-w-sm w-full shadow-2xl space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-[#E8E2D8]">
              <h3 className="text-sm font-bold text-[#1F1E1D]">修改节点名称</h3>
              <button
                onClick={() => setRenamingNode(null)}
                className="text-xs text-[#9E9A91] hover:text-[#1F1E1D]"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleRenameNodeSubmit} className="space-y-3.5">
              <div>
                <label className="block text-xs font-semibold text-[#1F1E1D] mb-1">节点名称</label>
                <input
                  type="text"
                  required
                  autoFocus
                  value={newNodeNameInput}
                  onChange={e => setNewNodeNameInput(e.target.value)}
                  className="w-full px-3 py-2 text-xs bg-white border border-[#E3DDD2] rounded-xl text-[#1F1E1D] focus:outline-none focus:border-[#CC785C]"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setRenamingNode(null)}
                  className="px-3.5 py-1.5 text-xs font-medium btn-claude-secondary rounded-xl"
                >
                  取消
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="px-4 py-1.5 text-xs font-semibold btn-claude-primary rounded-xl disabled:opacity-50"
                >
                  {isSubmitting ? '保存中...' : '保存'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
