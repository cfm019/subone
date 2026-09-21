import React, { useState } from 'react';
import {
  Check,
  Code,
  Globe,
  Layers,
  Plus,
  Radio,
  Sliders,
  Trash2,
  X,
  Zap,
  Tag,
  ArrowRight,
  ChevronDown,
  ChevronUp,
  Server,
  Eye,
} from 'lucide-react';
import * as yaml from 'js-yaml';
import { ProxyGroupItem, SubscriptionSource, ProxyNode, SourceIconsConfig } from '../types';

interface GroupsManagerProps {
  groups: ProxyGroupItem[];
  sources?: SubscriptionSource[];
  nodes?: ProxyNode[];
  sourceIcons?: SourceIconsConfig;
  onAddGroup: (group: Partial<ProxyGroupItem>) => Promise<void>;
  onUpdateGroup: (id: string, group: Partial<ProxyGroupItem>) => Promise<void>;
  onDeleteGroup: (id: string) => Promise<void>;
  onBatchImportGroups: (text: string, replaceAll?: boolean) => Promise<void>;
}

export const cleanName = (name: string, icons?: SourceIconsConfig) => {
  if (!name) return '';
  let cleaned = name;
  if (icons) {
    for (const icon of [icons.custom, icons.filter, icons.remote]) {
      if (icon && cleaned.startsWith(icon)) {
        cleaned = cleaned.slice(icon.length).trim();
      }
    }
  }
  return cleaned.replace(/^[\p{Extended_Pictographic}\uFE0F\u200D\s]+/u, '').trim();
};

export const getSourcePrefix = (
  s: { id?: string; type?: string },
  icons?: SourceIconsConfig
) => {
  const customIcon = icons?.custom || '🖥️';
  const filterIcon = icons?.filter || '✨';
  const remoteIcon = icons?.remote || '⚡️';
  if (s.id === 'custom' || s.type === 'custom') return customIcon;
  if (s.type === 'filter') return filterIcon;
  return remoteIcon;
};

export const getSourceTag = (s: SubscriptionSource, icons?: SourceIconsConfig) => {
  const isCustom = s.id === 'custom' || s.type === 'custom';
  const label = cleanName(s.name, icons) || (isCustom ? '独立节点组' : s.name);
  const prefix = getSourcePrefix(s, icons);
  return `${prefix} ${label}`;
};

export function resolveNodesForGroup(
  group: ProxyGroupItem,
  allNodes: ProxyNode[] = [],
  sources: SubscriptionSource[] = [],
  icons?: SourceIconsConfig
): ProxyNode[] {
  if (!allNodes || allNodes.length === 0) return [];

  // 1. If filter is defined
  if (group.filter) {
    const cleanRegex = group.filter.replace(/^\(\?i\)/, '');
    try {
      const reg = new RegExp(cleanRegex, 'i');
      return allNodes.filter(n => reg.test(n.name));
    } catch {
      return [];
    }
  }

  // 2. If use is defined (e.g. use: ['自建'] or use: ['🖥️ 独立节点组'] or use: ['HK优选'])
  if (group.use && group.use.length > 0) {
    const matchedNodes: ProxyNode[] = [];
    const matchedNodeIds = new Set<string>();

    for (const u of group.use) {
      const uClean = cleanName(u, icons).toLowerCase();
      const matchedSrc = sources.find(
        s => cleanName(s.name, icons).toLowerCase() === uClean ||
             s.id.toLowerCase() === uClean ||
             (s.id === 'custom' && (uClean === '自建节点' || uClean === '独立节点组' || uClean === '手工自建' || uClean === 'custom'))
      );
      if (matchedSrc && Array.isArray(matchedSrc.nodes) && matchedSrc.nodes.length > 0) {
        matchedSrc.nodes.forEach(n => {
          if (!matchedNodeIds.has(n.id)) {
            matchedNodes.push(n);
            matchedNodeIds.add(n.id);
          }
        });
      }
    }

    if (matchedNodes.length > 0) {
      return matchedNodes;
    }

    const useNormalized = new Set(
      group.use.map(u => cleanName(u, icons).toLowerCase())
    );
    return allNodes.filter(n => {
      const srcName = cleanName(n.sourceName || '', icons).toLowerCase();
      const srcId = (n.sourceId || '').trim().toLowerCase();
      return useNormalized.has(srcName) || useNormalized.has(srcId) || (srcId === 'custom' && (useNormalized.has('自建节点') || useNormalized.has('独立节点组') || useNormalized.has('手工自建')));
    });
  }

  // 3. Match group name to source name (e.g. group named "✨ HK优选" or "🖥️ 独立节点组")
  const cleanGroupName = cleanName(group.name, icons).toLowerCase();
  const matchedSource = sources.find(
    s => cleanName(s.name, icons).toLowerCase() === cleanGroupName ||
      (s.id === 'custom' && (cleanGroupName === '自建节点' || cleanGroupName === '独立节点组' || cleanGroupName === '手工自建' || cleanGroupName === 'custom' || cleanName(s.name, icons).toLowerCase() === cleanGroupName))
  );
  if (matchedSource) {
    if (Array.isArray(matchedSource.nodes) && matchedSource.nodes.length > 0) {
      return matchedSource.nodes;
    }
    return allNodes.filter(n => n.sourceId === matchedSource.id || n.sourceName === matchedSource.name);
  }

  // 4. Global aggregated groups
  if (group.name === '♻️ 自动选择' || group.name === '👉 手动选择') {
    return allNodes;
  }

  // 5. If proxies are explicitly listed, check if they refer directly to specific node names
  if (group.proxies && group.proxies.length > 0) {
    const proxySet = new Set(group.proxies.map(p => p.trim().toLowerCase()));
    const directMatches = allNodes.filter(n => proxySet.has(n.name.trim().toLowerCase()));
    if (directMatches.length > 0) return directMatches;
  }

  return [];
}

export const GroupsManager: React.FC<GroupsManagerProps> = ({
  groups,
  sources = [],
  nodes = [],
  sourceIcons,
  onAddGroup,
  onUpdateGroup,
  onDeleteGroup,
  onBatchImportGroups,
}) => {
  const [editingGroup, setEditingGroup] = useState<ProxyGroupItem | null>(null);
  const [isAdding, setIsAdding] = useState(false);
  const [showYamlModal, setShowYamlModal] = useState(false);
  const [yamlText, setYamlText] = useState('');
  const [customProxyInput, setCustomProxyInput] = useState('');
  const [expandedGroupId, setExpandedGroupId] = useState<string | null>(null);

  const [formData, setFormData] = useState<Partial<ProxyGroupItem>>({
    name: '',
    type: 'select',
    proxies: ['🚀 节点选择', '🎯 本地直连'],
    use: [],
    filter: '',
    tolerance: 50,
    url: 'https://www.google.com/generate_204',
    interval: 300,
  });

  const customNodes = nodes.filter(n => n.sourceId === 'custom' || !n.sourceId);
  const customSrc = sources.find(s => s.id === 'custom' || s.type === 'custom');
  const customSourceName = cleanName(customSrc?.name || '独立节点组', sourceIcons);
  const customSourceTag = `${sourceIcons?.custom || '🖥️'} ${customSourceName}`;

  const standardOutbounds = ['🚀 节点选择', '🎯 本地直连', '♻️ 自动选择', '👉 手动选择'];
  const groupOutbounds = groups.map(g => g.name);
  const sourceOutbounds = sources.filter(s => s.enabled).map(s => getSourceTag(s, sourceIcons));

  const allCandidateOutbounds = Array.from(new Set([
    ...standardOutbounds,
    ...sourceOutbounds,
    ...groupOutbounds,
    ...(customNodes.length > 0 ? [customSourceTag] : []),
  ]));

  const hasCustomGroup = groups.some(g => {
    const clean = cleanName(g.name, sourceIcons).toLowerCase();
    return clean === customSourceName.toLowerCase() || clean === '自建节点' || clean === '独立节点组' || clean === '手工自建' || clean === 'custom' || g.id === 'grp-src-custom';
  });

  const handleAddCustomGroup = async () => {
    await onAddGroup({
      name: customSourceTag,
      type: 'select',
      use: [customSourceName],
    });
  };

  const handleOpenAdd = () => {
    setFormData({
      name: '',
      type: 'select',
      proxies: ['🚀 节点选择', '🎯 本地直连'],
      use: [],
      filter: '',
      tolerance: 50,
      url: 'https://www.google.com/generate_204',
      interval: 300,
    });
    setCustomProxyInput('');
    setIsAdding(true);
  };

  const handleOpenEdit = (group: ProxyGroupItem) => {
    setEditingGroup(group);
    setFormData({
      ...group,
      proxies: group.proxies ? [...group.proxies] : [],
      use: group.use ? [...group.use] : [],
    });
    setCustomProxyInput('');
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.name?.trim()) return;

    const payload = {
      ...formData,
      name: formData.name.trim(),
      proxies: formData.proxies || [],
      use: formData.use || [],
      filter: formData.filter?.trim() || '',
    };

    if (editingGroup) {
      const gid = editingGroup.id;
      setEditingGroup(null);
      await onUpdateGroup(gid, payload);
    } else {
      setIsAdding(false);
      await onAddGroup(payload);
    }
  };

  const isProxyValid = (proxyName: string): boolean => {
    if (allCandidateOutbounds.includes(proxyName)) return true;
    const clean = proxyName.trim().toLowerCase();
    if (['direct', 'reject', 'pass', 'compatible', 'global', '🎯 本地直连'].includes(clean)) return true;
    return nodes.some(n => n.name.trim().toLowerCase() === clean);
  };

  const handleCleanInvalidProxies = () => {
    const current = formData.proxies || [];
    setFormData({
      ...formData,
      proxies: current.filter(isProxyValid),
    });
  };

  const handleToggleProxy = (proxyName: string) => {
    const current = formData.proxies || [];
    if (current.includes(proxyName)) {
      setFormData({ ...formData, proxies: current.filter(p => p !== proxyName) });
    } else {
      setFormData({ ...formData, proxies: [...current, proxyName] });
    }
  };

  const handleAddCustomProxy = (e?: React.KeyboardEvent) => {
    if (e && e.key !== 'Enter') return;
    if (e) e.preventDefault();
    const val = customProxyInput.trim();
    if (!val) return;
    const current = formData.proxies || [];
    if (!current.includes(val)) {
      setFormData({ ...formData, proxies: [...current, val] });
    }
    setCustomProxyInput('');
  };

  const handleRemoveProxy = (proxyName: string) => {
    const current = formData.proxies || [];
    setFormData({ ...formData, proxies: current.filter(p => p !== proxyName) });
  };

  const handleToggleUse = (sourceName: string) => {
    const current = formData.use || [];
    if (current.includes(sourceName)) {
      setFormData({ ...formData, use: current.filter(u => u !== sourceName) });
    } else {
      setFormData({ ...formData, use: [...current, sourceName] });
    }
  };

  const handleOpenYaml = () => {
    const simplified = groups.map(g => {
      const obj: any = {
        name: g.name,
        type: g.type,
      };
      if (g.filter) obj.filter = g.filter;
      if (g.proxies && g.proxies.length > 0) obj.proxies = g.proxies;
      if (g.use && g.use.length > 0) obj.use = g.use;
      if (g.type === 'urltest' || g.type === 'fallback') {
        if (g.tolerance) obj.tolerance = g.tolerance;
        if (g.url) obj.url = g.url;
        if (g.interval) obj.interval = g.interval;
      }
      return obj;
    });

    try {
      const dump = yaml.dump({ 'proxy-groups': simplified }, { indent: 2, lineWidth: -1 });
      setYamlText(dump);
    } catch {
      setYamlText('');
    }
    setShowYamlModal(true);
  };

  const handleSaveYaml = async () => {
    if (!yamlText.trim()) return;
    const text = yamlText;
    setShowYamlModal(false);
    await onBatchImportGroups(text, true);
  };

  // Helper to get node count for any outbound name (group, source, or standard)
  const getNodeCountForOutbound = (outboundName: string): number | null => {
    if (outboundName === '🎯 本地直连') return null;
    const targetGroup = groups.find(g => g.name === outboundName);
    if (targetGroup) {
      const gNodes = resolveNodesForGroup(targetGroup, nodes, sources, sourceIcons);
      return gNodes.length;
    }
    const cleanOutbound = cleanName(outboundName, sourceIcons).toLowerCase();
    const targetSource = sources.find(s => {
      const sName = cleanName(s.name || (s.id === 'custom' ? '独立节点组' : ''), sourceIcons).toLowerCase();
      return sName === cleanOutbound || (s.id === 'custom' && (cleanOutbound === '自建节点' || cleanOutbound === '独立节点组' || cleanOutbound === '手工自建'));
    });
    if (targetSource) {
      return targetSource.nodeCount || targetSource.nodes?.length || 0;
    }
    return null;
  };

  return (
    <div className="max-w-6xl mx-auto space-y-6 pb-16">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white p-4 rounded-2xl border border-[#E3DDD2] shadow-2xs">
        <div>
          <div className="flex items-center gap-2">
            <Radio className="w-5 h-5 text-[#CC785C]" />
            <h2 className="text-base font-bold text-[#1F1E1D]">策略组管理</h2>
            <span className="px-2.5 py-0.5 bg-[#FAF0EC] text-[#B85D3F] rounded-md font-mono text-xs font-bold border border-[#F3DDD3]">
              {groups.length} 个策略
            </span>
          </div>
          <p className="text-xs text-[#78746D] mt-0.5">
            可视化配置出站代理分组、子策略引用、订阅源
          </p>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          {customNodes.length > 0 && !hasCustomGroup && (
            <button
              onClick={handleAddCustomGroup}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-xl bg-[#EAF2EE] text-[#2D6A5A] border border-[#D5E5DE] hover:bg-[#D5E5DE] transition-all cursor-pointer"
              title={`为当前${customSourceName}创建策略组`}
            >
              <Zap className="w-3.5 h-3.5" />
              <span>新建{customSourceName} ({customNodes.length})</span>
            </button>
          )}

          <button
            onClick={handleOpenYaml}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium btn-claude-secondary rounded-xl cursor-pointer"
            title="查看或批量编辑所有策略组 YAML"
          >
            <Code className="w-3.5 h-3.5 text-[#7A6757]" />
            <span>YAML 编辑</span>
          </button>

          <button
            onClick={handleOpenAdd}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold btn-claude-primary rounded-xl shadow-2xs cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            <span>新建策略组</span>
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
        {groups.map(group => {
          const hasProxies = group.proxies && group.proxies.length > 0;
          const hasUse = group.use && group.use.length > 0;
          const isFilter = Boolean(group.filter);
          const directNodes = resolveNodesForGroup(group, nodes, sources, sourceIcons);
          const isExpanded = expandedGroupId === group.id;

          return (
            <div
              key={group.id}
              className={`p-4 rounded-2xl bg-white border transition-all flex flex-col justify-between space-y-3 shadow-2xs group ${isExpanded ? 'border-[#CC785C] ring-1 ring-[#CC785C]/20' : 'border-[#E3DDD2] hover:border-[#CC785C]/40'
                }`}
            >
              <div className="space-y-2.5">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="text-sm font-bold text-[#1F1E1D] truncate" title={group.name}>
                      {group.name}
                    </span>
                    {directNodes.length > 0 && (
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-[#EAF2EE] text-[#2D6A5A] border border-[#D5E5DE]">
                        {directNodes.length} 节点
                      </span>
                    )}
                  </div>

                  <span
                    className={`px-2 py-0.5 rounded text-[10px] font-mono font-bold shrink-0 ${group.type === 'select'
                      ? 'bg-[#F0ECE4] text-[#59554E]'
                      : group.type === 'urltest'
                        ? 'bg-[#EAF2EE] text-[#2D6A5A]'
                        : 'bg-[#FAF0EC] text-[#B85D3F]'
                      }`}
                  >
                    {group.type === 'urltest' ? 'url-test' : group.type}
                  </span>
                </div>

                <div className="space-y-1.5">
                  {hasProxies && (
                    <div className="space-y-1">
                      <span className="text-[10px] font-medium text-[#9E9A91]">包含子项:</span>
                      <div className="flex items-center gap-1.5 flex-wrap">
                        {group.proxies!.map((p, idx) => {
                          const count = getNodeCountForOutbound(p);
                          return (
                            <span
                              key={idx}
                              className="inline-flex items-center gap-1 px-2 py-0.5 bg-[#FAF8F5] border border-[#E8E4DC] text-[#4A4742] rounded-md text-[11px] font-medium"
                            >
                              <span>{p}</span>
                              {count !== null && count > 0 && (
                                <span className="text-[9px] font-bold text-[#2D6A5A] bg-[#EAF2EE] px-1 rounded">
                                  {count}
                                </span>
                              )}
                            </span>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {hasUse && (
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span className="text-[10px] font-medium text-[#9E9A91]">挂载订阅:</span>
                      {group.use!.map((u, idx) => {
                        const cleanLabel = cleanName(u, sourceIcons);
                        const count = getNodeCountForOutbound(u);
                        const matchedSrc = sources.find(
                          s => cleanName(s.name, sourceIcons).toLowerCase() === cleanLabel.toLowerCase() || s.id === u
                        );
                        const isFilterSrc = matchedSrc?.type === 'filter';
                        const isCustomSrc = matchedSrc?.type === 'custom' || matchedSrc?.id === 'custom';
                        const icon = isFilterSrc ? (sourceIcons?.filter || '✨') : isCustomSrc ? (sourceIcons?.custom || '🖥️') : (sourceIcons?.remote || '⚡️');
                        return (
                          <span
                            key={idx}
                            className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-medium border ${
                              isFilterSrc
                                ? 'bg-[#F4F1FA] border-[#E8E1F5] text-[#6A4C9C]'
                                : isCustomSrc
                                ? 'bg-[#F0ECE4] border-[#E2DDD5] text-[#59554E]'
                                : 'bg-[#FAF0EC] border-[#F3DDD3] text-[#B85D3F]'
                            }`}
                          >
                            <span className="text-xs">{icon}</span>
                            <span>{cleanLabel}</span>
                            {count !== null && (
                              <span className="text-[9px] font-bold opacity-80">({count}节点)</span>
                            )}
                          </span>
                        );
                      })}
                    </div>
                  )}

                  {isFilter && (
                    <div className="flex items-center gap-1.5 text-xs text-[#78746D]">
                      <span className="text-[10px] text-[#9E9A91] shrink-0 font-medium">节点正则:</span>
                      <code className="px-1.5 py-0.5 bg-[#FAF8F5] border border-[#E8E4DC] rounded text-[11px] font-mono text-[#CC785C] truncate">
                        {group.filter}
                      </code>
                    </div>
                  )}

                  {!hasProxies && !hasUse && !isFilter && (
                    <div className="text-[11px] text-[#8C877D] italic">
                      {group.name === '👉 手动选择' || group.name === '♻️ 自动选择'
                        ? '自动汇总所有订阅与独立节点'
                        : '根据策略组名称自动归集同名订阅源'}
                    </div>
                  )}
                </div>
              </div>

              {/* 展开节点抽屉 */}
              {isExpanded && (
                <div className="pt-2 border-t border-[#F0ECE4] space-y-2 animate-in fade-in duration-150">
                  <div className="flex items-center justify-between text-[11px]">
                    <span className="font-bold text-[#1F1E1D]">
                      {directNodes.length > 0
                        ? `组内节点清单 (共 ${directNodes.length} 项)`
                        : `包含的子策略项 (${group.proxies?.length || 0} 个)`}
                    </span>
                    <button
                      onClick={() => setExpandedGroupId(null)}
                      className="text-[10px] text-[#9E9A91] hover:text-[#1F1E1D] cursor-pointer"
                    >
                      收起 ▲
                    </button>
                  </div>

                  {directNodes.length > 0 ? (
                    <div className="max-h-48 overflow-y-auto space-y-1 p-2 bg-[#FAF8F5] rounded-xl border border-[#E8E4DC]">
                      {directNodes.map(n => (
                        <div
                          key={n.id}
                          className="flex items-center justify-between gap-2 px-2 py-1 bg-white rounded-md border border-[#EBE7DF] text-[11px]"
                        >
                          <div className="flex items-center gap-1.5 min-w-0">
                            <span className="text-xs shrink-0">{n.countryEmoji || '🌐'}</span>
                            <span className="font-medium text-[#1F1E1D] truncate">{n.name}</span>
                          </div>
                          <div className="flex items-center gap-1.5 shrink-0">
                            <span className="px-1.5 py-0.2 bg-[#F0ECE4] text-[#59554E] rounded text-[9px] font-mono font-bold">
                              {(n.type || 'vless').toUpperCase()}
                            </span>
                            <span className="text-[10px] text-[#9E9A91] font-mono">
                              {n.server}:{n.port}
                            </span>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : hasProxies ? (
                    <div className="p-2.5 bg-[#FAF8F5] rounded-xl border border-[#E8E4DC] text-xs text-[#59554E]">
                      <div className="flex flex-wrap gap-1.5">
                        {group.proxies!.map((p, idx) => {
                          const count = getNodeCountForOutbound(p);
                          return (
                            <span
                              key={idx}
                              className="px-2 py-1 bg-white rounded-lg border border-[#E3DDD2] text-xs font-medium text-[#1F1E1D] flex items-center gap-1.5 shadow-2xs"
                            >
                              <span>{p}</span>
                              {count !== null && (
                                <span className="text-[10px] px-1.5 py-0.2 rounded-full font-bold bg-[#EAF2EE] text-[#2D6A5A]">
                                  {count} 节点
                                </span>
                              )}
                            </span>
                          );
                        })}
                      </div>
                    </div>
                  ) : (
                    <div className="p-3 bg-[#FAF8F5] rounded-xl text-center text-xs text-[#9E9A91]">
                      暂无直接匹配的节点
                    </div>
                  )}
                </div>
              )}

              <div className="pt-2 border-t border-[#F0ECE4] flex items-center justify-between text-xs">
                <button
                  type="button"
                  onClick={() => setExpandedGroupId(isExpanded ? null : group.id)}
                  className="flex items-center gap-1 text-[11px] font-medium text-[#CC785C] hover:text-[#B85D3F] transition-colors cursor-pointer"
                >
                  <Eye className="w-3.5 h-3.5" />
                  <span>
                    {isExpanded
                      ? '收起节点清单'
                      : directNodes.length > 0
                        ? `展开查看节点 (${directNodes.length})`
                        : '展开查看结构'}
                  </span>
                  {isExpanded ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                </button>

                <div className="flex items-center gap-1">
                  <button
                    onClick={() => handleOpenEdit(group)}
                    className="px-2.5 py-1 text-[11px] font-medium text-[#59554E] hover:text-[#1F1E1D] hover:bg-[#FAF8F5] rounded-lg transition-colors cursor-pointer"
                  >
                    编辑
                  </button>
                  <button
                    onClick={() => onDeleteGroup(group.id)}
                    className="p-1 text-[#9E9A91] hover:text-[#B85D3F] hover:bg-[#FAF0EC] rounded-lg transition-colors cursor-pointer"
                    title="删除策略组"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {groups.length === 0 && (
        <div className="claude-panel p-12 rounded-2xl bg-white border border-[#E3DDD2] text-center space-y-3">
          <Radio className="w-8 h-8 text-[#9E9A91] mx-auto opacity-50" />
          <p className="text-xs font-semibold text-[#59554E]">暂无策略组</p>
          <div className="flex items-center justify-center gap-2">
            <button
              onClick={handleOpenAdd}
              className="flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-semibold btn-claude-primary rounded-xl shadow-2xs cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              <span>新建策略组</span>
            </button>
          </div>
        </div>
      )}

      {(isAdding || editingGroup) && (
        <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white rounded-2xl border border-[#E3DDD2] shadow-2xl w-full max-w-2xl p-6 space-y-5 animate-in fade-in zoom-in-95 duration-150 my-8">
            <div className="flex items-center justify-between pb-3 border-b border-[#F0ECE4]">
              <div>
                <h3 className="text-base font-bold text-[#1F1E1D]">
                  {editingGroup ? `编辑策略组: ${formData.name || ''}` : '新建策略组'}
                </h3>
                <p className="text-xs text-[#78746D]">
                  配置策略组类型、包含的子策略组/节点、订阅源引用与过滤规则
                </p>
              </div>
              <button
                onClick={() => {
                  setIsAdding(false);
                  setEditingGroup(null);
                }}
                className="text-sm text-[#9E9A91] hover:text-[#1F1E1D] p-1 cursor-pointer"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleSave} className="space-y-4 text-xs">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                <div className="space-y-1">
                  <label className="font-semibold text-[#1F1E1D]">策略组名称</label>
                  <input
                    type="text"
                    required
                    placeholder="例如: 🌎 国外域名 / 🤖 AI 服务"
                    value={formData.name || ''}
                    onChange={e => setFormData({ ...formData, name: e.target.value })}
                    className="w-full px-3 py-2 bg-[#FAF8F5] border border-[#E8E4DC] rounded-xl text-[#1F1E1D] focus:outline-none focus:border-[#CC785C]"
                  />
                </div>

                <div className="space-y-1">
                  <label className="font-semibold text-[#1F1E1D]">策略类型</label>
                  <select
                    value={formData.type || 'select'}
                    onChange={e => setFormData({ ...formData, type: e.target.value as any })}
                    className="w-full px-3 py-2 bg-[#FAF8F5] border border-[#E8E4DC] rounded-xl text-[#1F1E1D] focus:outline-none focus:border-[#CC785C]"
                  >
                    <option value="select">select (手动选择 / 选项列表)</option>
                    <option value="urltest">url-test (自动测速优选)</option>
                    <option value="fallback">fallback (故障自动切换)</option>
                    <option value="load-balance">load-balance (负载均衡)</option>
                    <option value="direct">direct (直接直连)</option>
                  </select>
                </div>
              </div>

              <div className="space-y-2 bg-[#FAF8F5] p-3.5 rounded-xl border border-[#E8E4DC]">
                <div className="flex items-center justify-between">
                  <label className="font-bold text-[#1F1E1D] flex items-center gap-1.5">
                    <Layers className="w-3.5 h-3.5 text-[#CC785C]" />
                    <span>包含的出站策略组 / 选项 (Proxies)</span>
                  </label>
                  <div className="flex items-center gap-2">
                    {(() => {
                      const invalidCount = (formData.proxies || []).filter(p => !isProxyValid(p)).length;
                      if (invalidCount === 0) return null;
                      return (
                        <button
                          type="button"
                          onClick={handleCleanInvalidProxies}
                          className="flex items-center gap-1 px-2 py-0.5 text-[10px] font-bold bg-[#FDF2F2] text-[#E02424] border border-[#FBD5D5] rounded-md hover:bg-[#FDE8E8] transition-all cursor-pointer shadow-2xs"
                          title="一键移除所有在当前节点与策略组中已不存在的残留项"
                        >
                          <Trash2 className="w-3 h-3" />
                          <span>一键清理 {invalidCount} 个失效项</span>
                        </button>
                      );
                    })()}
                    <span className="text-[10px] text-[#78746D]">
                      已选 {(formData.proxies || []).length} 项
                    </span>
                  </div>
                </div>

                <div className="flex flex-wrap gap-1.5 min-h-[32px] p-2 bg-white rounded-lg border border-[#E3DDD2]">
                  {(formData.proxies || []).map((p, idx) => {
                    const valid = isProxyValid(p);
                    return (
                      <span
                        key={idx}
                        className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md font-medium text-xs border ${valid
                            ? 'bg-[#FAF0EC] text-[#B85D3F] border-[#F3DDD3]'
                            : 'bg-[#FDF2F2] text-[#E02424] border-[#FBD5D5] ring-1 ring-[#E02424]/20'
                          }`}
                        title={valid ? undefined : '该节点在订阅与自建源中已不存在，保存或点击清理即可移除'}
                      >
                        <span>{p}</span>
                        {!valid && (
                          <span className="text-[9px] px-1 bg-[#FDE8E8] text-[#9B1C1C] rounded font-bold">
                            已失效
                          </span>
                        )}
                        <button
                          type="button"
                          onClick={() => handleRemoveProxy(p)}
                          className={`${valid ? 'text-[#B85D3F] hover:text-[#94381C]' : 'text-[#E02424] hover:text-[#9B1C1C]'} p-0.5 cursor-pointer`}
                        >
                          <X className="w-3 h-3" />
                        </button>
                      </span>
                    );
                  })}
                  {(!formData.proxies || formData.proxies.length === 0) && (
                    <span className="text-xs text-[#9E9A91] italic py-0.5">暂无单独配置出站项，可点击下方候选快速添加</span>
                  )}
                </div>

                <div className="space-y-1.5 pt-1">
                  <div className="text-[11px] text-[#78746D] font-medium">快捷点击添加 / 移除候选策略：</div>
                  <div className="flex flex-wrap gap-1.5">
                    {allCandidateOutbounds
                      .filter(cand => cand !== formData.name)
                      .map((cand, idx) => {
                        const isSelected = (formData.proxies || []).includes(cand);
                        const count = getNodeCountForOutbound(cand);
                        return (
                          <button
                            key={idx}
                            type="button"
                            onClick={() => handleToggleProxy(cand)}
                            className={`px-2 py-1 rounded-md text-[11px] font-medium transition-all cursor-pointer border flex items-center gap-1 ${isSelected
                              ? 'bg-[#CC785C] text-white border-[#CC785C]'
                              : 'bg-white text-[#59554E] border-[#E3DDD2] hover:border-[#CC785C]/60'
                              }`}
                          >
                            <span>{isSelected ? `✓ ${cand}` : `+ ${cand}`}</span>
                            {count !== null && count > 0 && (
                              <span className={`text-[9px] px-1 rounded font-bold ${isSelected ? 'bg-white/20 text-white' : 'bg-[#EAF2EE] text-[#2D6A5A]'
                                }`}>
                                {count}
                              </span>
                            )}
                          </button>
                        );
                      })}
                  </div>
                </div>

                <div className="flex items-center gap-2 pt-1">
                  <input
                    type="text"
                    placeholder="输入自定义组名或节点名按回车添加..."
                    value={customProxyInput}
                    onChange={e => setCustomProxyInput(e.target.value)}
                    onKeyDown={handleAddCustomProxy}
                    className="flex-1 px-2.5 py-1.5 bg-white border border-[#E3DDD2] rounded-lg text-xs focus:outline-none focus:border-[#CC785C]"
                  />
                  <button
                    type="button"
                    onClick={() => handleAddCustomProxy()}
                    className="px-3 py-1.5 text-xs font-medium btn-claude-secondary rounded-lg cursor-pointer"
                  >
                    添加
                  </button>
                </div>
              </div>

              {(() => {
                // Deduplicate sources by normalized key
                const sourceMap = new Map<string, { tag: string; label: string; icon: string; nodeCount?: number; id: string }>();
                sources.forEach(src => {
                  const isInternalCustom = src.id === 'custom' || src.type === 'custom';
                  const label = cleanName(src.name, sourceIcons) || (isInternalCustom ? '独立节点组' : src.name);
                  const tag = getSourceTag(src, sourceIcons);
                  const icon = getSourcePrefix(src, sourceIcons);
                  const key = isInternalCustom ? 'custom' : label.toLowerCase();
                  const count = isInternalCustom ? customNodes.length : (src.nodeCount || src.nodes?.length || 0);

                  if (!sourceMap.has(key) || (count || 0) > (sourceMap.get(key)!.nodeCount || 0)) {
                    sourceMap.set(key, {
                      id: src.id,
                      tag,
                      label,
                      icon,
                      nodeCount: count,
                    });
                  }
                });

                if (customNodes.length > 0 && !sourceMap.has('custom')) {
                  sourceMap.set('custom', {
                    id: 'custom',
                    tag: customSourceTag,
                    label: customSourceName,
                    icon: sourceIcons?.custom || '🖥️',
                    nodeCount: customNodes.length,
                  });
                }

                const uniqueSourceList = Array.from(sourceMap.values());
                if (uniqueSourceList.length === 0) return null;

                return (
                  <div className="space-y-2 bg-[#FAF8F5] p-3.5 rounded-xl border border-[#E8E4DC]">
                    <div className="flex items-center justify-between">
                      <label className="font-bold text-[#1F1E1D] flex items-center gap-1.5">
                        <Zap className="w-3.5 h-3.5 text-[#CC785C]" />
                        <span>挂载订阅源 (Use - 展开该源所有节点)</span>
                      </label>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {uniqueSourceList.map(src => {
                        const isSelected = (formData.use || []).some(
                          u => cleanName(u, sourceIcons).toLowerCase() === src.label.toLowerCase() ||
                            u.toLowerCase() === src.label.toLowerCase() ||
                            (src.id === 'custom' && (cleanName(u, sourceIcons) === '自建节点' || cleanName(u, sourceIcons) === '独立节点组' || cleanName(u, sourceIcons) === '手工自建' || u === 'custom'))
                        );
                        return (
                          <button
                            key={src.id}
                            type="button"
                            onClick={() => handleToggleUse(src.label)}
                            className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium border transition-all cursor-pointer ${isSelected
                              ? 'bg-[#CC785C] text-white border-[#CC785C]'
                              : 'bg-white text-[#59554E] border-[#E3DDD2] hover:border-[#CC785C]/60'
                              }`}
                          >
                            <span className="text-xs">{src.icon}</span>
                            <span>{src.label}</span>
                            {src.nodeCount !== undefined && (
                              <span className="opacity-80 text-[10px]">({src.nodeCount}节点)</span>
                            )}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                );
              })()}

              <div className="space-y-1">
                <div className="flex items-center justify-between">
                  <label className="font-semibold text-[#1F1E1D]">节点过滤正则 (可选)</label>
                </div>
                <input
                  type="text"
                  placeholder="例如: (🇭🇰|香港|hk|hongkong)"
                  value={formData.filter || ''}
                  onChange={e => setFormData({ ...formData, filter: e.target.value })}
                  className="w-full px-3 py-2 bg-[#FAF8F5] border border-[#E8E4DC] rounded-xl font-mono text-[#1F1E1D] focus:outline-none focus:border-[#CC785C]"
                />
              </div>

              {(formData.type === 'urltest' || formData.type === 'fallback') && (
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <label className="font-semibold text-[#1F1E1D]">测速容差 (ms)</label>
                    <input
                      type="number"
                      value={formData.tolerance || 50}
                      onChange={e => setFormData({ ...formData, tolerance: Number(e.target.value) })}
                      className="w-full px-3 py-2 bg-[#FAF8F5] border border-[#E8E4DC] rounded-xl font-mono text-[#1F1E1D] focus:outline-none focus:border-[#CC785C]"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="font-semibold text-[#1F1E1D]">测速间隔 (秒)</label>
                    <input
                      type="number"
                      value={formData.interval || 300}
                      onChange={e => setFormData({ ...formData, interval: Number(e.target.value) })}
                      className="w-full px-3 py-2 bg-[#FAF8F5] border border-[#E8E4DC] rounded-xl font-mono text-[#1F1E1D] focus:outline-none focus:border-[#CC785C]"
                    />
                  </div>
                </div>
              )}

              {/* 生效结构预览 */}
              <div className="p-3 bg-[#FAF8F5] rounded-xl border border-[#E8E4DC] space-y-1.5">
                <div className="text-[11px] font-bold text-[#1F1E1D] flex items-center gap-1">
                  <ArrowRight className="w-3 h-3 text-[#CC785C]" />
                  <span>生效结构预览：</span>
                </div>
                <div className="text-[11px] text-[#59554E] leading-relaxed">
                  策略组 <strong>{formData.name || '未命名'}</strong> ({formData.type}) 包含：
                  {formData.proxies && formData.proxies.length > 0 ? (
                    <span className="text-[#B85D3F] font-semibold"> [{formData.proxies.join(', ')}]</span>
                  ) : (
                    <span className="text-[#8C877D]"> [自动引用符合条件的节点/来源]</span>
                  )}
                  {formData.use && formData.use.length > 0 && (
                    <span>，并挂载订阅源: <strong className="text-[#CC785C]">{formData.use.join(', ')}</strong></span>
                  )}
                  {formData.filter && (
                    <span>，且应用名称过滤正则: <code className="text-[#CC785C]">{formData.filter}</code></span>
                  )}
                </div>
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-[#F0ECE4]">
                <button
                  type="button"
                  onClick={() => {
                    setIsAdding(false);
                    setEditingGroup(null);
                  }}
                  className="px-4 py-2 text-xs font-medium btn-claude-secondary rounded-xl cursor-pointer"
                >
                  取消
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 text-xs font-semibold btn-claude-primary rounded-xl cursor-pointer shadow-2xs"
                >
                  保存策略组
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {showYamlModal && (
        <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl border border-[#E3DDD2] shadow-2xl w-full max-w-5xl h-[85vh] p-6 flex flex-col space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-[#F0ECE4] shrink-0">
              <div>
                <h3 className="text-base font-bold text-[#1F1E1D]">批量编辑策略组 (YAML / 手工定制)</h3>
                <p className="text-xs text-[#78746D]">以 Clash / Mihomo 格式描述 proxy-groups，按需自由配置</p>
              </div>
              <button
                onClick={() => setShowYamlModal(false)}
                className="text-sm text-[#9E9A91] hover:text-[#1F1E1D] p-1.5 cursor-pointer"
              >
                ✕
              </button>
            </div>

            <div className="flex-1 min-h-0">
              <textarea
                value={yamlText}
                onChange={e => setYamlText(e.target.value)}
                placeholder="proxy-groups:&#10;  - name: 🚀 节点选择&#10;    type: select&#10;    proxies:&#10;      - 🎯 本地直连"
                className="w-full h-full p-4 bg-[#FAF8F5] border border-[#E8E4DC] rounded-xl font-mono text-xs text-[#1F1E1D] focus:outline-none focus:border-[#CC785C] resize-none leading-relaxed"
                spellCheck={false}
              />
            </div>

            <div className="flex items-center justify-end gap-2 pt-3 border-t border-[#F0ECE4] shrink-0">
              <button
                onClick={() => setShowYamlModal(false)}
                className="px-4 py-2 text-xs font-medium btn-claude-secondary rounded-xl cursor-pointer"
              >
                取消
              </button>
              <button
                onClick={handleSaveYaml}
                className="px-6 py-2 text-xs font-semibold btn-claude-primary rounded-xl"
              >
                应用并替换全部策略组
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
