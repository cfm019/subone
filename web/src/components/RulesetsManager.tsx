import React, { useState, useMemo } from 'react';
import {
  Check,
  CheckCircle2,
  ChevronDown,
  Copy,
  Download,
  Edit2,
  Edit3,
  FileCode,
  FileText,
  Filter,
  Globe,
  Layers,
  Plus,
  Radio,
  Search,
  Sliders,
  Trash2,
  Upload,
  X,
  XCircle,
  Zap,
} from 'lucide-react';
import { ProxyGroupItem, UnifiedRuleItem } from '../types';

interface RulesetsManagerProps {
  proxyGroups: ProxyGroupItem[];
  rulesList: UnifiedRuleItem[];
  onAddGroup: (group: Partial<ProxyGroupItem>) => Promise<void>;
  onBatchImportGroups: (text: string, replaceAll?: boolean) => Promise<void>;
  onUpdateGroup: (id: string, updates: Partial<ProxyGroupItem>) => Promise<void>;
  onDeleteGroup: (id: string) => Promise<void>;
  onAddRule: (rule: Partial<UnifiedRuleItem>) => Promise<void>;
  onImportLocalRules: (text: string, defaultOutbound?: string) => Promise<void>;
  onImportRemoteRules: (text: string, defaultOutbound?: string) => Promise<void>;
  onBatchReplaceRules: (text: string, defaultOutbound?: string) => Promise<void>;
  onUpdateRule: (id: string, updates: Partial<UnifiedRuleItem>) => Promise<void>;
  onDeleteRule: (id: string) => Promise<void>;
  onClearAllRules: () => Promise<void>;
}

export const RulesetsManager: React.FC<RulesetsManagerProps> = ({
  proxyGroups,
  rulesList,
  onAddGroup,
  onBatchImportGroups,
  onUpdateGroup,
  onDeleteGroup,
  onAddRule,
  onImportLocalRules,
  onImportRemoteRules,
  onBatchReplaceRules,
  onUpdateRule,
  onDeleteRule,
  onClearAllRules,
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [kindFilter, setKindFilter] = useState<'all' | 'local' | 'remote'>('all');
  const [groupFilter, setGroupFilter] = useState<string>('all');

  // Modals state
  const [showImportGroupsModal, setShowImportGroupsModal] = useState(false);
  const [groupsImportText, setGroupsImportText] = useState('');
  const [groupsReplaceAll, setGroupsReplaceAll] = useState(false);

  const [showImportLocalModal, setShowImportLocalModal] = useState(false);
  const [localImportText, setLocalImportText] = useState('');
  const [localDefaultOutbound, setLocalDefaultOutbound] = useState(proxyGroups[0]?.name || '🎯 本地直连');

  const [showImportRemoteModal, setShowImportRemoteModal] = useState(false);
  const [remoteImportText, setRemoteImportText] = useState('');
  const [remoteDefaultOutbound, setRemoteDefaultOutbound] = useState(proxyGroups[0]?.name || '🚀 节点选择');

  // Full Text Editor modal state
  const [showFullTextModal, setShowFullTextModal] = useState(false);
  const [fullRulesText, setFullRulesText] = useState('');
  const [copiedFullText, setCopiedFullText] = useState(false);

  const [showAddSingleModal, setShowAddSingleModal] = useState(false);
  const [singleName, setSingleName] = useState('');
  const [singleKind, setSingleKind] = useState<'local' | 'remote'>('local');
  const [singleType, setSingleType] = useState<any>('DOMAIN-SUFFIX');
  const [singlePayload, setSinglePayload] = useState('');
  const [singleOutbound, setSingleOutbound] = useState(proxyGroups[0]?.name || '🎯 本地直连');

  // Group Management modal
  const [showGroupModal, setShowGroupModal] = useState(false);
  const [newGroupName, setNewGroupName] = useState('');
  const [newGroupType, setNewGroupType] = useState<'select' | 'urltest' | 'direct'>('select');

  const availableOutbounds = useMemo(() => {
    const list = ['REJECT', ...proxyGroups.map(g => g.name)];
    rulesList.forEach(r => {
      if (r.outbound && !list.includes(r.outbound)) {
        list.push(r.outbound);
      }
    });
    return Array.from(new Set(list));
  }, [proxyGroups, rulesList]);

  // Format rules to text for Full Text Editor
  const formatRulesToText = (rules: UnifiedRuleItem[]): string => {
    const localRules = rules.filter(r => r.kind === 'local');
    const remoteRules = rules.filter(r => r.kind === 'remote');

    const lines: string[] = [];

    if (localRules.length > 0) {
      lines.push('# ================= 本地分流规则 (Local Rules) =================');
      localRules.forEach(r => {
        const comment = r.name && !r.name.startsWith(r.type) ? `  # ${r.name}` : '';
        if (r.type === 'FINAL') {
          lines.push(`- FINAL,${r.outbound}${comment}`);
        } else {
          const payloads = r.payload.split(/[,;\n]+/).map(p => p.trim()).filter(Boolean);
          if (payloads.length > 1) {
            payloads.forEach(p => {
              lines.push(`- ${r.type},${p},${r.outbound},no-resolve${comment}`);
            });
          } else {
            lines.push(`- ${r.type},${r.payload.trim()},${r.outbound},no-resolve${comment}`);
          }
        }
      });
      lines.push('');
    }

    if (remoteRules.length > 0) {
      lines.push('# ================= 远程规则集 (Remote Rule-Sets) =================');
      remoteRules.forEach(r => {
        const comment = r.name && !r.name.startsWith(r.type) ? `  # ${r.name}` : '';
        lines.push(`- RULE-SET,${r.payload},${r.outbound}${comment}`);
      });
      lines.push('');
    }

    return lines.join('\n');
  };

  const openFullTextEditor = () => {
    setFullRulesText(formatRulesToText(rulesList));
    setShowFullTextModal(true);
  };

  const handleFullTextSave = async (e: React.FormEvent) => {
    e.preventDefault();
    await onBatchReplaceRules(fullRulesText, proxyGroups[0]?.name || '🎯 本地直连');
    setShowFullTextModal(false);
  };

  // Filter rules
  const filteredRules = rulesList.filter(rule => {
    const matchesSearch =
      rule.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      rule.payload.toLowerCase().includes(searchTerm.toLowerCase()) ||
      rule.outbound.toLowerCase().includes(searchTerm.toLowerCase()) ||
      rule.type.toLowerCase().includes(searchTerm.toLowerCase());

    const matchesKind = kindFilter === 'all' || rule.kind === kindFilter;
    const matchesGroup = groupFilter === 'all' || rule.outbound === groupFilter;

    return matchesSearch && matchesKind && matchesGroup;
  });

  const handleImportGroupsSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!groupsImportText.trim()) return;
    await onBatchImportGroups(groupsImportText, groupsReplaceAll);
    setGroupsImportText('');
    setShowImportGroupsModal(false);
  };

  const handleImportLocalSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!localImportText.trim()) return;
    await onImportLocalRules(localImportText, localDefaultOutbound);
    setLocalImportText('');
    setShowImportLocalModal(false);
  };

  const handleImportRemoteSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!remoteImportText.trim()) return;
    await onImportRemoteRules(remoteImportText, remoteDefaultOutbound);
    setRemoteImportText('');
    setShowImportRemoteModal(false);
  };

  const handleAddSingleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!singlePayload.trim()) return;
    await onAddRule({
      name: singleName.trim() || `${singleType}: ${singlePayload.trim()}`,
      kind: singleKind,
      type: singleType,
      payload: singlePayload.trim(),
      outbound: singleOutbound,
      enabled: true,
    });
    setSingleName('');
    setSinglePayload('');
    setShowAddSingleModal(false);
  };

  const handleAddGroupSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newGroupName.trim()) return;
    await onAddGroup({
      name: newGroupName.trim(),
      type: newGroupType,
      proxies: ['🚀 节点选择', '🎯 本地直连'],
    });
    setNewGroupName('');
    setShowGroupModal(false);
  };

  const getTypeStyle = (type: string, kind: string) => {
    if (kind === 'remote') return 'bg-[#F2F0F7] text-[#635588] border-[#DDD8EB]';
    if (type.includes('DOMAIN')) return 'bg-[#EFF6F4] text-[#367A68] border-[#D1E5DF]';
    if (type.includes('IP')) return 'bg-[#FAF0E6] text-[#B85D38] border-[#E8D7C7]';
    if (type === 'GEOIP') return 'bg-[#F0F5FA] text-[#3D6B99] border-[#D4E2F0]';
    return 'bg-[#F3EFEA] text-[#69655E] border-[#E5DFD5]';
  };

  return (
    <div className="space-y-5 max-w-6xl mx-auto">
      {/* 1. Outbound Groups Top Overview Bar */}
      <div className="claude-panel p-4 rounded-2xl space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Layers className="w-4 h-4 text-[#CC785C]" />
            <h3 className="text-xs font-bold text-[#1F1E1D]">出口策略分组清单 (Proxy Groups)</h3>
            <span className="text-[11px] text-[#78746D]">
              共 {proxyGroups.length} 个策略分组（分流规则的目标出口）
            </span>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowImportGroupsModal(true)}
              className="flex items-center gap-1 px-3 py-1.5 text-xs font-semibold btn-claude-secondary rounded-xl"
              title="直接粘贴 YAML/JSON/MCF 批量添加分组"
            >
              <Upload className="w-3.5 h-3.5 text-[#CC785C]" />
              <span>批量贴入分组</span>
            </button>
            <button
              onClick={() => setShowGroupModal(true)}
              className="flex items-center gap-1 px-3 py-1.5 text-xs font-semibold btn-claude-secondary rounded-xl"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>添加分组</span>
            </button>
          </div>
        </div>

        {/* Group Badges List */}
        <div className="flex items-center gap-2 flex-wrap pt-1">
          {proxyGroups.map(grp => (
            <div
              key={grp.id}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-[#FAF8F5] border border-[#E8E4DC] rounded-xl text-xs text-[#2D2B28] hover:border-[#D5CFC5] transition-all group"
            >
              <span className="font-semibold">{grp.name}</span>
              <span className="text-[10px] font-mono px-1.5 py-0.2 bg-[#F0ECE4] text-[#78746D] rounded">
                {grp.type}
              </span>
              <button
                onClick={() => onDeleteGroup(grp.id)}
                className="opacity-0 group-hover:opacity-100 p-0.5 text-[#A8483B] hover:text-red-700 transition-opacity ml-1"
                title="直接删除分组"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          ))}
          {proxyGroups.length === 0 && (
            <div className="text-xs text-[#9E9A91] py-2">暂无策略组，请点击上方按钮添加或批量贴入</div>
          )}
        </div>
      </div>

      {/* 2. Rules Control Bar & Action Buttons */}
      <div className="claude-panel p-4 rounded-2xl flex flex-col md:flex-row md:items-center justify-between gap-3">
        <div className="flex items-center gap-2 flex-1 max-w-lg">
          <div className="relative flex-1">
            <Search className="w-4 h-4 text-[#8C877D] absolute left-3.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="搜索规则名称、域名、IP 或 URL..."
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
              className="w-full pl-9 pr-3.5 py-2 claude-input rounded-xl text-xs"
            />
          </div>

          <select
            value={kindFilter}
            onChange={e => setKindFilter(e.target.value as any)}
            className="px-3 py-2 claude-input rounded-xl text-xs cursor-pointer"
          >
            <option value="all">全部类型 ({rulesList.length})</option>
            <option value="local">仅本地规则 ({rulesList.filter(r => r.kind === 'local').length})</option>
            <option value="remote">仅远程规则集 ({rulesList.filter(r => r.kind === 'remote').length})</option>
          </select>

          <select
            value={groupFilter}
            onChange={e => setGroupFilter(e.target.value)}
            className="px-3 py-2 claude-input rounded-xl text-xs cursor-pointer max-w-[150px] truncate"
          >
            <option value="all">全部分组去向</option>
            {availableOutbounds.map(ob => (
              <option key={ob} value={ob}>{ob === 'REJECT' ? '🛑 REJECT (拦截丢弃)' : ob}</option>
            ))}
          </select>
        </div>

        {/* Action Buttons */}
        <div className="flex items-center gap-2 overflow-x-auto pb-1 md:pb-0">
          <button
            onClick={openFullTextEditor}
            className="flex items-center gap-1.5 px-3 py-2 text-xs font-semibold btn-claude-secondary rounded-xl whitespace-nowrap bg-[#FAF0E6] text-[#B85D38] border-[#E8D7C7]"
            title="将全部规则以纯文本直接查看与编辑"
          >
            <Edit3 className="w-3.5 h-3.5 text-[#CC785C]" />
            <span>📝 文本编辑</span>
          </button>

          <button
            onClick={() => setShowImportLocalModal(true)}
            className="flex items-center gap-1.5 px-3 py-2 text-xs font-semibold btn-claude-secondary rounded-xl whitespace-nowrap"
            title="直接贴入大段本地规则 (YAML/JSON/文本)"
          >
            <FileText className="w-3.5 h-3.5 text-[#367A68]" />
            <span>贴入本地规则</span>
          </button>

          <button
            onClick={() => setShowImportRemoteModal(true)}
            className="flex items-center gap-1.5 px-3 py-2 text-xs font-semibold btn-claude-secondary rounded-xl whitespace-nowrap"
            title="直接贴入远程规则集 (YAML/JSON/URL列表)"
          >
            <Globe className="w-3.5 h-3.5 text-[#635588]" />
            <span>贴入远程规则集</span>
          </button>

          <button
            onClick={() => setShowAddSingleModal(true)}
            className="flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold btn-claude-primary rounded-xl whitespace-nowrap shadow-sm"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>新建单条</span>
          </button>
        </div>
      </div>

      {/* 3. Rules Matrix Table */}
      <div className="claude-panel rounded-2xl overflow-hidden shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="bg-[#FAF8F5] border-b border-[#E8E4DC] text-[#78746D] font-semibold">
                <th className="py-3 px-4 w-12 text-center">状态</th>
                <th className="py-3 px-4 w-28">类型</th>
                <th className="py-3 px-4">规则名称 & 匹配条件 / URL</th>
                <th className="py-3 px-4 w-56">去向策略组 (可秒切)</th>
                <th className="py-3 px-4 w-20 text-right">操作</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#EFECE6]">
              {filteredRules.map(rule => (
                <tr
                  key={rule.id}
                  className={`hover:bg-[#FAF9F6] transition-colors ${!rule.enabled ? 'opacity-50 bg-[#FBF9F7]' : ''
                    }`}
                >
                  {/* Status Toggle */}
                  <td className="py-3 px-4 text-center">
                    <button
                      onClick={() => onUpdateRule(rule.id, { enabled: !rule.enabled })}
                      title={rule.enabled ? '点击禁用' : '点击启用'}
                    >
                      {rule.enabled ? (
                        <CheckCircle2 className="w-4 h-4 text-[#367A68]" />
                      ) : (
                        <XCircle className="w-4 h-4 text-[#9E9A91]" />
                      )}
                    </button>
                  </td>

                  {/* Rule Type Badge */}
                  <td className="py-3 px-4 whitespace-nowrap">
                    <span className={`px-2 py-0.5 text-[10px] font-mono font-bold rounded-md border ${getTypeStyle(rule.type, rule.kind)}`}>
                      {rule.kind === 'remote' ? 'RULE-SET' : rule.type}
                    </span>
                  </td>

                  {/* Name & Payload */}
                  <td className="py-3 px-4 min-w-0">
                    <div className="font-bold text-[#1F1E1D] mb-0.5 truncate">{rule.name}</div>
                    <div className="font-mono text-[11px] text-[#78746D] truncate max-w-xl select-all">
                      {rule.payload}
                    </div>
                  </td>

                  {/* Target Outbound Dropdown Selector (Core Feature!) */}
                  <td className="py-3 px-4">
                    <div className="relative">
                      <select
                        value={rule.outbound}
                        onChange={e => onUpdateRule(rule.id, { outbound: e.target.value })}
                        className="w-full appearance-none pl-3 pr-8 py-1.5 bg-white border border-[#DFD9CF] rounded-xl text-xs font-semibold text-[#1F1E1D] focus:outline-none focus:border-[#CC785C] shadow-2xs cursor-pointer hover:border-[#CC785C]/60 transition-colors"
                      >
                        {availableOutbounds.map(ob => (
                          <option key={ob} value={ob}>{ob === 'REJECT' ? '🛑 REJECT' : `➔ ${ob}`}</option>
                        ))}
                      </select>
                      <ChevronDown className="w-3.5 h-3.5 text-[#8C877D] absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                    </div>
                  </td>

                  {/* Actions */}
                  <td className="py-3 px-4 text-right">
                    <button
                      onClick={() => onDeleteRule(rule.id)}
                      className="p-1.5 text-[#A8483B] hover:bg-[#FDF2F0] rounded-lg transition-colors"
                      title="直接删除规则"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </td>
                </tr>
              ))}

              {filteredRules.length === 0 && (
                <tr>
                  <td colSpan={5} className="py-12 text-center text-xs text-[#9E9A91]">
                    未找到匹配的规则条目，请点击上方按钮贴入或新建
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* MODAL: Full Text Rules Editor (文本直接编辑) */}
      {showFullTextModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-xs p-4">
          <div className="claude-panel w-full max-w-4xl max-h-[88vh] flex flex-col p-6 rounded-2xl shadow-xl space-y-4 animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between pb-2 border-b border-[#E8E4DC] shrink-0">
              <div>
                <div className="flex items-center gap-2">
                  <Edit3 className="w-5 h-5 text-[#CC785C]" />
                  <h3 className="text-base font-bold text-[#1F1E1D]">规则文本编辑</h3>
                </div>
              </div>
              <button onClick={() => setShowFullTextModal(false)} className="p-1 text-[#8C877D] hover:text-[#1F1E1D]">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleFullTextSave} className="flex-1 flex flex-col min-h-0 space-y-3">
              <div className="flex items-center justify-between text-xs text-[#78746D]">
                <div className="flex items-center gap-2">
                  <span>支持格式：<code className="bg-[#EFEAE2] px-1 py-0.5 rounded text-[11px]">- TYPE,payload,去向策略组  # 备注名称</code></span>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    navigator.clipboard.writeText(fullRulesText);
                    setCopiedFullText(true);
                    setTimeout(() => setCopiedFullText(false), 2000);
                  }}
                  className="flex items-center gap-1 text-[11px] font-semibold text-[#CC785C] hover:underline"
                >
                  {copiedFullText ? <Check className="w-3.5 h-3.5 text-[#367A68]" /> : <Copy className="w-3.5 h-3.5" />}
                  <span>{copiedFullText ? '已复制全文' : '复制全文'}</span>
                </button>
              </div>

              <div className="flex-1 relative min-h-0 bg-white rounded-xl border border-[#DFD9CF] overflow-hidden">
                <textarea
                  required
                  value={fullRulesText}
                  onChange={e => setFullRulesText(e.target.value)}
                  spellCheck={false}
                  placeholder={`# 示例规则：\n- IP-CIDR,192.168.1.100/32,🎯 本地直连,no-resolve  # 本地NAS\n- IP-CIDR,10.0.0.50/32,💻 远程运维,no-resolve  # 远程跳板机\n- DOMAIN-SUFFIX,apple.com,🎯 本地直连  # Apple 服务\n- RULE-SET,https://raw.githubusercontent.com/.../ai.srs,🤖 AI 服务`}
                  className="w-full h-full p-4 font-mono text-xs text-[#1F1E1D] focus:outline-none resize-none leading-relaxed overflow-y-auto"
                />
              </div>

              <div className="flex items-center justify-between pt-2 shrink-0">
                <span className="text-[11px] text-[#8C877D]">
                  💡 提示：若规则中出现新的去向分组名称（如「💻 远程运维」），系统将自动创建该策略组。
                </span>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setShowFullTextModal(false)}
                    className="px-4 py-2 text-xs font-medium btn-claude-secondary rounded-xl"
                  >
                    取消
                  </button>
                  <button
                    type="submit"
                    className="px-5 py-2 text-xs font-bold btn-claude-primary rounded-xl shadow-xs"
                  >
                    保存并应用
                  </button>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 1: Batch Import Groups */}
      {showImportGroupsModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-xs p-4">
          <div className="claude-panel w-full max-w-5xl h-[85vh] p-6 rounded-2xl shadow-2xl flex flex-col space-y-4 animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between pb-3 border-b border-[#F0ECE4] shrink-0">
              <div>
                <h3 className="text-base font-bold text-[#1F1E1D]">批量贴入策略分组 (Proxy Groups)</h3>
                <p className="text-xs text-[#78746D]">支持直接粘贴 YAML proxy-groups、JSON outbounds 或 Loon MCF 文本行</p>
              </div>
              <button onClick={() => setShowImportGroupsModal(false)} className="p-1.5 text-[#8C877D] hover:text-[#1F1E1D]">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleImportGroupsSubmit} className="flex-1 min-h-0 flex flex-col space-y-4">
              <div className="flex-1 min-h-0 w-full relative">
                <textarea
                  required
                  placeholder={`支持粘贴 YAML 列表：\n- name: 🤖 AI 服务\n  type: select\n  proxies:\n    - 🚀 节点选择\n    - 🇺🇸 美国节点\n\n或 Loon 格式：\n📹 YouTube = select,🚀 节点选择,🇺🇸 美国节点\n\n或直接逗号分隔分组名称列表...`}
                  value={groupsImportText}
                  onChange={e => setGroupsImportText(e.target.value)}
                  spellCheck={false}
                  className="absolute inset-0 w-full h-full p-4 bg-[#FAF8F5] border border-[#E8E4DC] rounded-xl font-mono text-xs text-[#1F1E1D] focus:outline-none focus:border-[#CC785C] resize-none leading-relaxed"
                />
              </div>

              <div className="flex items-center justify-between pt-3 border-t border-[#F0ECE4] shrink-0">
                <label className="flex items-center gap-2 text-xs text-[#4A4742] cursor-pointer">
                  <input
                    type="checkbox"
                    checked={groupsReplaceAll}
                    onChange={e => setGroupsReplaceAll(e.target.checked)}
                    className="rounded text-[#CC785C] focus:ring-[#CC785C]"
                  />
                  <span>清空并替换现有所有分组（默认追加合并）</span>
                </label>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setShowImportGroupsModal(false)}
                    className="px-4 py-2 text-xs font-medium btn-claude-secondary rounded-xl"
                  >
                    取消
                  </button>
                  <button
                    type="submit"
                    className="px-6 py-2 text-xs font-semibold btn-claude-primary rounded-xl"
                  >
                    解析并导入策略组
                  </button>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 2: Batch Import Local Rules */}
      {showImportLocalModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-xs p-4">
          <div className="claude-panel w-full max-w-5xl h-[85vh] p-6 rounded-2xl shadow-2xl flex flex-col space-y-4 animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between pb-3 border-b border-[#F0ECE4] shrink-0">
              <div>
                <h3 className="text-base font-bold text-[#1F1E1D]">批量贴入本地规则 (Local Rules)</h3>
                <p className="text-xs text-[#78746D]">支持粘贴 Clash YAML rules、Sing-box JSON 路由规则或 Surge/Loon 文本行</p>
              </div>
              <button onClick={() => setShowImportLocalModal(false)} className="p-1.5 text-[#8C877D] hover:text-[#1F1E1D]">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleImportLocalSubmit} className="flex-1 min-h-0 flex flex-col space-y-4">
              <div className="shrink-0">
                <label className="block text-xs font-medium text-[#4A4742] mb-1.5">
                  默认去向分组（若粘贴的规则中已指定去向，则以规则中的去向为准）
                </label>
                <select
                  value={localDefaultOutbound}
                  onChange={e => setLocalDefaultOutbound(e.target.value)}
                  className="w-full px-3.5 py-2 claude-input rounded-xl text-xs"
                >
                  {availableOutbounds.map(ob => (
                    <option key={ob} value={ob}>{ob === 'REJECT' ? '🛑 REJECT (拦截丢弃)' : `➔ ${ob}`}</option>
                  ))}
                </select>
              </div>

              <div className="flex-1 min-h-0 w-full relative">
                <textarea
                  required
                  placeholder={`- IP-CIDR,192.168.1.100/32,🎯 本地直连,no-resolve  # 本地NAS\n- IP-CIDR,10.0.0.50/32,💻 远程运维,no-resolve  # 远程跳板机\n- DOMAIN-SUFFIX,apple.com,🎯 本地直连\n- DOMAIN-KEYWORD,torrent,🎯 本地直连\n- GEOIP,CN,🎯 本地直连`}
                  value={localImportText}
                  onChange={e => setLocalImportText(e.target.value)}
                  spellCheck={false}
                  className="absolute inset-0 w-full h-full p-4 bg-[#FAF8F5] border border-[#E8E4DC] rounded-xl font-mono text-xs text-[#1F1E1D] focus:outline-none focus:border-[#CC785C] resize-none leading-relaxed"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-[#F0ECE4] shrink-0">
                <button
                  type="button"
                  onClick={() => setShowImportLocalModal(false)}
                  className="px-4 py-2 text-xs font-medium btn-claude-secondary rounded-xl"
                >
                  取消
                </button>
                <button
                  type="submit"
                  className="px-6 py-2 text-xs font-semibold btn-claude-primary rounded-xl"
                >
                  解析并导入规则
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 3: Batch Import Remote Rules */}
      {showImportRemoteModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-xs p-4">
          <div className="claude-panel w-full max-w-5xl h-[85vh] p-6 rounded-2xl shadow-2xl flex flex-col space-y-4 animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between pb-3 border-b border-[#F0ECE4] shrink-0">
              <div>
                <h3 className="text-base font-bold text-[#1F1E1D]">批量贴入远程规则集 (Remote Rule-Sets)</h3>
                <p className="text-xs text-[#78746D]">支持粘贴 Sing-box rule_set JSON、Clash rule-providers 或 Loon [Remote Rule] 列表</p>
              </div>
              <button onClick={() => setShowImportRemoteModal(false)} className="p-1.5 text-[#8C877D] hover:text-[#1F1E1D]">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleImportRemoteSubmit} className="flex-1 min-h-0 flex flex-col space-y-4">
              <div className="shrink-0">
                <label className="block text-xs font-medium text-[#4A4742] mb-1.5">
                  默认去向分组（若粘贴的规则中已指定去向，则以规则中的去向为准）
                </label>
                <select
                  value={remoteDefaultOutbound}
                  onChange={e => setRemoteDefaultOutbound(e.target.value)}
                  className="w-full px-3.5 py-2 claude-input rounded-xl text-xs"
                >
                  {availableOutbounds.map(ob => (
                    <option key={ob} value={ob}>{ob === 'REJECT' ? '🛑 REJECT (拦截丢弃)' : `➔ ${ob}`}</option>
                  ))}
                </select>
              </div>

              <div className="flex-1 min-h-0 w-full relative">
                <textarea
                  required
                  placeholder={`https://gh-proxy.com/https://raw.githubusercontent.com/MetaCubeX/meta-rules-dat/sing/geo/geosite/category-ai-!cn.srs, policy=🤖 AI 服务, tag=AI服务\nhttps://gh-proxy.com/https://raw.githubusercontent.com/MetaCubeX/meta-rules-dat/sing/geo/geosite/youtube.srs, policy=📹 YouTube, tag=YouTube\nhttps://gh-proxy.com/https://raw.githubusercontent.com/SagerNet/sing-geosite/rule-set/geosite-cn.srs, policy=🇨🇳 国内服务, tag=国内直连`}
                  value={remoteImportText}
                  onChange={e => setRemoteImportText(e.target.value)}
                  spellCheck={false}
                  className="absolute inset-0 w-full h-full p-4 bg-[#FAF8F5] border border-[#E8E4DC] rounded-xl font-mono text-xs text-[#1F1E1D] focus:outline-none focus:border-[#CC785C] resize-none leading-relaxed"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-[#F0ECE4] shrink-0">
                <button
                  type="button"
                  onClick={() => setShowImportRemoteModal(false)}
                  className="px-4 py-2 text-xs font-medium btn-claude-secondary rounded-xl"
                >
                  取消
                </button>
                <button
                  type="submit"
                  className="px-6 py-2 text-xs font-semibold btn-claude-primary rounded-xl"
                >
                  解析并导入规则集
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 4: Create Single Rule */}
      {showAddSingleModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-xs p-4">
          <div className="claude-panel w-full max-w-lg p-6 rounded-2xl shadow-xl space-y-4 animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between">
              <h3 className="text-base font-bold text-[#1F1E1D]">新建单条分流规则</h3>
              <button onClick={() => setShowAddSingleModal(false)} className="p-1 text-[#8C877D] hover:text-[#1F1E1D]">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleAddSingleSubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-[#4A4742] mb-1.5">规则名称 / 备注 (可选)</label>
                <input
                  type="text"
                  placeholder="例如：自建私有服务、GitHub 加速"
                  value={singleName}
                  onChange={e => setSingleName(e.target.value)}
                  className="w-full px-3.5 py-2 claude-input rounded-xl text-xs"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-[#4A4742] mb-1.5">规则类型</label>
                  <select
                    value={singleType}
                    onChange={e => {
                      const val = e.target.value as any;
                      setSingleType(val);
                      if (val === 'RULE-SET') setSingleKind('remote');
                      else setSingleKind('local');
                    }}
                    className="w-full px-3.5 py-2 claude-input rounded-xl text-xs"
                  >
                    <option value="DOMAIN-SUFFIX">DOMAIN-SUFFIX (域名后缀)</option>
                    <option value="DOMAIN-KEYWORD">DOMAIN-KEYWORD (域名关键字)</option>
                    <option value="DOMAIN">DOMAIN (完整域名)</option>
                    <option value="IP-CIDR">IP-CIDR (IP/网段)</option>
                    <option value="GEOIP">GEOIP (地理IP库)</option>
                    <option value="RULE-SET">RULE-SET (远程规则集)</option>
                    <option value="FINAL">FINAL / MATCH (最终规则)</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-medium text-[#4A4742] mb-1.5">去向策略组</label>
                  <select
                    value={singleOutbound}
                    onChange={e => setSingleOutbound(e.target.value)}
                    className="w-full px-3.5 py-2 claude-input rounded-xl text-xs font-semibold"
                  >
                    {availableOutbounds.map(ob => (
                      <option key={ob} value={ob}>{ob === 'REJECT' ? '🛑 REJECT (拦截丢弃)' : `➔ ${ob}`}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-[#4A4742] mb-1.5">
                  匹配参数 / 规则内容 / 远程 URL
                </label>
                <input
                  type="text"
                  required
                  placeholder={singleType === 'RULE-SET' ? 'https://...srs 或 https://...yaml' : '例如：google.com 或 10.0.0.0/8'}
                  value={singlePayload}
                  onChange={e => setSinglePayload(e.target.value)}
                  className="w-full px-3.5 py-2 claude-input rounded-xl text-xs font-mono"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowAddSingleModal(false)}
                  className="px-4 py-2 text-xs font-medium btn-claude-secondary rounded-xl"
                >
                  取消
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 text-xs font-semibold btn-claude-primary rounded-xl"
                >
                  确认添加
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 5: Create New Proxy Group */}
      {showGroupModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-xs p-4">
          <div className="claude-panel w-full max-w-md p-6 rounded-2xl shadow-xl space-y-4 animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between">
              <h3 className="text-base font-bold text-[#1F1E1D]">添加策略分组</h3>
              <button onClick={() => setShowGroupModal(false)} className="p-1 text-[#8C877D] hover:text-[#1F1E1D]">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleAddGroupSubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-[#4A4742] mb-1.5">分组名称 (支持 Emoji)</label>
                <input
                  type="text"
                  required
                  placeholder="例如：🎮 游戏服务、📺 Netflix、💻 远程运维"
                  value={newGroupName}
                  onChange={e => setNewGroupName(e.target.value)}
                  className="w-full px-3.5 py-2 claude-input rounded-xl text-xs"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-[#4A4742] mb-1.5">策略组类型</label>
                <select
                  value={newGroupType}
                  onChange={e => setNewGroupType(e.target.value as any)}
                  className="w-full px-3.5 py-2 claude-input rounded-xl text-xs"
                >
                  <option value="select">手动选择 (Select)</option>
                  <option value="urltest">自动测速 (URL-Test)</option>
                  <option value="direct">本地直连 (Direct)</option>
                </select>
              </div>

              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowGroupModal(false)}
                  className="px-4 py-2 text-xs font-medium btn-claude-secondary rounded-xl"
                >
                  取消
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 text-xs font-semibold btn-claude-primary rounded-xl"
                >
                  确认添加
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
