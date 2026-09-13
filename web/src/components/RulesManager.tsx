import React, { useState, useMemo } from 'react';
import {
  Check,
  CheckCircle2,
  Edit2,
  FileCode,
  FileText,
  Filter,
  Plus,
  RotateCcw,
  Search,
  Trash2,
  Upload,
  XCircle,
  Zap,
} from 'lucide-react';
import { ProxyGroupItem, UnifiedRuleItem } from '../types';

interface RulesManagerProps {
  proxyGroups: ProxyGroupItem[];
  rulesList: UnifiedRuleItem[];
  onAddRule: (rule: Partial<UnifiedRuleItem>) => Promise<void>;
  onImportLocalRules: (text: string, defaultOutbound?: string) => Promise<void>;
  onImportRemoteRules: (text: string, defaultOutbound?: string) => Promise<void>;
  onBatchReplaceRules: (text: string, defaultOutbound?: string) => Promise<void>;
  onUpdateRule: (id: string, updates: Partial<UnifiedRuleItem>) => Promise<void>;
  onDeleteRule: (id: string) => Promise<void>;
  onClearAllRules: () => Promise<void>;
  onResetDefaultRules?: () => Promise<void>;
}

export const RulesManager: React.FC<RulesManagerProps> = ({
  proxyGroups,
  rulesList,
  onAddRule,
  onImportLocalRules,
  onImportRemoteRules,
  onBatchReplaceRules,
  onUpdateRule,
  onDeleteRule,
  onClearAllRules,
  onResetDefaultRules,
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [kindFilter, setKindFilter] = useState<'all' | 'local' | 'remote'>('all');
  const [groupFilter, setGroupFilter] = useState<string>('all');

  // Full Text Editor modal
  const [showFullTextModal, setShowFullTextModal] = useState(false);
  const [fullRulesText, setFullRulesText] = useState('');

  // Single Add modal
  const [showAddSingleModal, setShowAddSingleModal] = useState(false);
  const [singleName, setSingleName] = useState('');
  const [singleKind, setSingleKind] = useState<'local' | 'remote'>('local');
  const [singleType, setSingleType] = useState<any>('DOMAIN-SUFFIX');
  const [singlePayload, setSinglePayload] = useState('');
  const [singleOutbound, setSingleOutbound] = useState('REJECT');

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
    const text = fullRulesText;
    const outbound = proxyGroups[0]?.name || '🎯 本地直连';
    setShowFullTextModal(false);
    await onBatchReplaceRules(text, outbound);
  };

  const handleSingleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!singlePayload.trim()) return;

    const formattedPayload = singleKind === 'local'
      ? singlePayload.split(/[\r\n,]+/).map(s => s.trim()).filter(Boolean).join(', ')
      : singlePayload.trim();

    if (!formattedPayload) return;

    const newRuleData = {
      name: singleName.trim() || `${singleType}: ${formattedPayload.slice(0, 30)}${formattedPayload.length > 30 ? '...' : ''}`,
      kind: singleKind,
      type: singleKind === 'remote' ? 'RULE-SET' : singleType,
      payload: formattedPayload,
      outbound: singleOutbound,
      enabled: true,
    };

    setSingleName('');
    setSinglePayload('');
    setShowAddSingleModal(false);

    await onAddRule(newRuleData);
  };

  // Edit Single Rule modal
  const [editingRule, setEditingRule] = useState<UnifiedRuleItem | null>(null);
  const [editName, setEditName] = useState('');
  const [editKind, setEditKind] = useState<'local' | 'remote'>('local');
  const [editType, setEditType] = useState<any>('DOMAIN-SUFFIX');
  const [editPayload, setEditPayload] = useState('');
  const [editOutbound, setEditOutbound] = useState('');

  const openEditModal = (rule: UnifiedRuleItem) => {
    setEditingRule(rule);
    setEditName(rule.name);
    setEditKind(rule.kind);
    setEditType(rule.type);
    setEditPayload(rule.payload);
    setEditOutbound(rule.outbound);
  };

  const handleEditSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingRule || !editPayload.trim()) return;

    const formattedPayload = editKind === 'local'
      ? editPayload.split(/[\r\n,]+/).map(s => s.trim()).filter(Boolean).join(', ')
      : editPayload.trim();

    if (!formattedPayload) return;

    const ruleId = editingRule.id;
    const updates = {
      name: editName.trim() || `${editType}: ${formattedPayload.slice(0, 30)}`,
      kind: editKind,
      type: editKind === 'remote' ? 'RULE-SET' : editType,
      payload: formattedPayload,
      outbound: editOutbound,
    };

    // Close modal immediately for instant 0ms response
    setEditingRule(null);

    await onUpdateRule(ruleId, updates);
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

  return (
    <div className="max-w-6xl mx-auto space-y-5 pb-16">
      {/* Header Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white p-4 rounded-2xl border border-[#E3DDD2] shadow-2xs">
        <div>
          <div className="flex items-center gap-2">
            <Zap className="w-5 h-5 text-[#CC785C]" />
            <h2 className="text-base font-bold text-[#1F1E1D]">分流规则</h2>
            <span className="px-2.5 py-0.5 bg-[#FAF0EC] text-[#B85D3F] rounded-md font-mono text-xs font-bold border border-[#F3DDD3]">
              共 {rulesList.length} 组规则
            </span>
          </div>
          <p className="text-xs text-[#78746D] mt-0.5">
            配置本地域名/IP 规则与远程规则集，指定去向
          </p>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          {onResetDefaultRules && (
            <button
              onClick={async () => {
                if (window.confirm('确定要恢复为模版默认分流规则吗？\n系统将重新从 templates 模版目录载入预设的分流规则。')) {
                  await onResetDefaultRules();
                }
              }}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium btn-claude-secondary rounded-xl text-[#78746D] hover:text-[#B85D3F]"
              title="从 templates 模版目录重新载入默认分流规则"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>恢复默认</span>
            </button>
          )}

          <button
            onClick={openFullTextEditor}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium btn-claude-secondary rounded-xl"
            title="以文本格式编辑/粘贴规则"
          >
            <FileCode className="w-3.5 h-3.5 text-[#CC785C]" />
            <span>YAML 编辑</span>
          </button>

          <button
            onClick={() => setShowAddSingleModal(true)}
            className="flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-semibold btn-claude-primary rounded-xl shadow-2xs"
          >
            <Plus className="w-4 h-4" />
            <span>添加规则</span>
          </button>
        </div>
      </div>

      {/* Filter & Search Bar */}
      <div className="claude-panel p-3.5 rounded-2xl bg-white border border-[#E3DDD2] flex flex-col sm:flex-row items-center justify-between gap-3 shadow-2xs">
        <div className="relative flex-1 w-full">
          <Search className="w-4 h-4 text-[#8C877D] absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
          <input
            type="text"
            placeholder="搜索规则名称、域名、IP 或策略去向..."
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
            className="w-full pl-9 pr-3.5 py-2 bg-[#FAF8F5] border border-[#E8E4DC] rounded-xl text-xs text-[#1F1E1D] placeholder-[#9E9A91] focus:outline-none focus:border-[#CC785C]"
          />
        </div>

        <div className="flex items-center gap-2 w-full sm:w-auto shrink-0">
          {/* Kind Filter */}
          <select
            value={kindFilter}
            onChange={e => setKindFilter(e.target.value as any)}
            className="px-3 py-2 bg-[#FAF8F5] border border-[#E8E4DC] rounded-xl text-xs font-medium text-[#1F1E1D] focus:outline-none focus:border-[#CC785C]"
          >
            <option value="all">全部类型 ({rulesList.length})</option>
            <option value="local">本地规则 ({rulesList.filter(r => r.kind === 'local').length})</option>
            <option value="remote">远程规则集 ({rulesList.filter(r => r.kind === 'remote').length})</option>
          </select>

          {/* Group Filter */}
          <select
            value={groupFilter}
            onChange={e => setGroupFilter(e.target.value)}
            className="px-3 py-2 bg-[#FAF8F5] border border-[#E8E4DC] rounded-xl text-xs font-medium text-[#1F1E1D] focus:outline-none focus:border-[#CC785C]"
          >
            <option value="all">全部目标策略</option>
            {availableOutbounds.map(g => (
              <option key={g} value={g}>
                {g === 'REJECT' ? '🛑 REJECT (拦截丢弃)' : g}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Rules Table */}
      <div className="claude-panel rounded-2xl bg-white border border-[#E3DDD2] overflow-hidden shadow-2xs">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-[#FAF8F5] border-b border-[#E8E4DC] text-[#78746D] font-semibold text-[11px]">
              <tr>
                <th className="py-2.5 px-4 w-10">状态</th>
                <th className="py-2.5 px-4 min-w-[160px] max-w-[240px]">规则名称 / 备注</th>
                <th className="py-2.5 px-4 w-28">类型</th>
                <th className="py-2.5 px-4">匹配内容 / 链接</th>
                <th className="py-2.5 px-4 w-52">去向策略组</th>
                <th className="py-2.5 px-4 w-20 text-right">操作</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#F0ECE4]">
              {filteredRules.map(rule => {
                const payloadItems = rule.payload.split(/[,;\n]+/).map(s => s.trim()).filter(Boolean);
                return (
                  <tr key={rule.id} className="hover:bg-[#FAF8F5] transition-colors">
                    <td className="py-2.5 px-4">
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

                    <td className="py-2.5 px-4 font-semibold text-[#1F1E1D] max-w-[240px] truncate" title={rule.name}>
                      {rule.name}
                    </td>

                    <td className="py-2.5 px-4">
                      <span
                        className={`px-2 py-0.5 rounded text-[10px] font-mono font-bold ${rule.kind === 'remote'
                          ? 'bg-[#EAF2EE] text-[#2D6A5A]'
                          : 'bg-[#F0ECE4] text-[#59554E]'
                          }`}
                      >
                        {rule.type}
                      </span>
                    </td>

                    <td className="py-2.5 px-4 max-w-[360px]" title={rule.payload}>
                      <div className="flex items-center gap-1.5 min-w-0">
                        {payloadItems.length > 1 && (
                          <span className="shrink-0 px-1.5 py-0.5 text-[10px] font-mono font-semibold bg-[#FAF0EC] text-[#B85D3F] rounded border border-[#F3DDD3]">
                            {payloadItems.length} 项
                          </span>
                        )}
                        <span className="font-mono text-[#59554E] text-[11px] truncate select-all">
                          {rule.payload}
                        </span>
                      </div>
                    </td>

                    <td className="py-2.5 px-4">
                      <select
                        value={rule.outbound}
                        onChange={e => onUpdateRule(rule.id, { outbound: e.target.value })}
                        className={`w-full px-2.5 py-1 bg-white border rounded-lg text-xs font-semibold focus:outline-none focus:border-[#CC785C] transition-colors ${rule.outbound === 'REJECT'
                          ? 'border-red-200 text-red-600 bg-red-50/50'
                          : 'border-[#E8E4DC] text-[#1F1E1D] hover:border-[#CC785C]'
                          }`}
                      >
                        {availableOutbounds.map(g => (
                          <option key={g} value={g}>
                            {g === 'REJECT' ? '🛑 REJECT' : g}
                          </option>
                        ))}
                      </select>
                    </td>

                    <td className="py-2.5 px-4 text-right">
                      <div className="flex items-center justify-end gap-1">
                        <button
                          onClick={() => openEditModal(rule)}
                          className="p-1 text-[#9E9A91] hover:text-[#CC785C] hover:bg-[#FAF0EC] rounded-lg transition-colors"
                          title="编辑规则"
                        >
                          <Edit2 className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={() => onDeleteRule(rule.id)}
                          className="p-1 text-[#9E9A91] hover:text-[#B85D3F] hover:bg-[#FAF0EC] rounded-lg transition-colors"
                          title="删除规则"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {filteredRules.length === 0 && (
          <div className="p-12 text-center text-xs text-[#78746D]">
            <p>未找到符合条件的规则</p>
          </div>
        )}
      </div>

      {/* Full Text Editor Modal */}
      {showFullTextModal && (
        <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl border border-[#E3DDD2] shadow-2xl w-full max-w-5xl h-[85vh] p-6 flex flex-col space-y-4 animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between pb-3 border-b border-[#F0ECE4] shrink-0">
              <div>
                <h3 className="text-base font-bold text-[#1F1E1D]">分流规则文本编辑</h3>
                <p className="text-xs text-[#78746D]">
                  以 Clash / YAML 格式编辑规则，用注释 # 备注与目标去向
                </p>
              </div>
              <button
                onClick={() => setShowFullTextModal(false)}
                className="text-sm text-[#9E9A91] hover:text-[#1F1E1D] p-1.5"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleFullTextSave} className="flex-1 flex flex-col min-h-0 space-y-3">
              <div className="flex-1 min-h-0 w-full relative">
                <textarea
                  value={fullRulesText}
                  onChange={e => setFullRulesText(e.target.value)}
                  spellCheck={false}
                  className="absolute inset-0 w-full h-full p-4 bg-[#FAF8F5] border border-[#E8E4DC] rounded-xl font-mono text-xs text-[#1F1E1D] focus:outline-none focus:border-[#CC785C] resize-none leading-relaxed"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-[#F0ECE4] shrink-0">
                <button
                  type="button"
                  onClick={() => setShowFullTextModal(false)}
                  className="px-4 py-2 text-xs font-medium btn-claude-secondary rounded-xl"
                >
                  取消
                </button>
                <button
                  type="submit"
                  className="px-6 py-2 text-xs font-semibold btn-claude-primary rounded-xl"
                >
                  保存并同步
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Add Single Rule Modal */}
      {showAddSingleModal && (
        <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl border border-[#E3DDD2] shadow-2xl w-full max-w-xl p-6 space-y-4.5">
            <div className="flex items-center justify-between pb-3 border-b border-[#F0ECE4]">
              <h3 className="text-base font-bold text-[#1F1E1D]">添加单条规则</h3>
              <button
                onClick={() => setShowAddSingleModal(false)}
                className="text-sm text-[#9E9A91] hover:text-[#1F1E1D]"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleSingleAdd} className="space-y-3.5 text-xs">
              <div className="space-y-1">
                <label className="font-semibold text-[#1F1E1D]">规则类型</label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setSingleKind('local')}
                    className={`py-1.5 text-xs font-medium rounded-xl border transition-all ${singleKind === 'local'
                      ? 'bg-[#1F1E1D] text-white border-[#1F1E1D]'
                      : 'bg-[#FAF8F5] text-[#59554E] border-[#E8E4DC]'
                      }`}
                  >
                    本地规则
                  </button>
                  <button
                    type="button"
                    onClick={() => setSingleKind('remote')}
                    className={`py-1.5 text-xs font-medium rounded-xl border transition-all ${singleKind === 'remote'
                      ? 'bg-[#1F1E1D] text-white border-[#1F1E1D]'
                      : 'bg-[#FAF8F5] text-[#59554E] border-[#E8E4DC]'
                      }`}
                  >
                    远程规则集
                  </button>
                </div>
              </div>

              {singleKind === 'local' && (
                <div className="space-y-1">
                  <label className="font-semibold text-[#1F1E1D]">匹配类型</label>
                  <select
                    value={singleType}
                    onChange={e => setSingleType(e.target.value)}
                    className="w-full px-3 py-2 bg-[#FAF8F5] border border-[#E8E4DC] rounded-xl text-[#1F1E1D] focus:outline-none focus:border-[#CC785C]"
                  >
                    <option value="DOMAIN-SUFFIX">DOMAIN-SUFFIX (域名后缀)</option>
                    <option value="DOMAIN-KEYWORD">DOMAIN-KEYWORD (域名关键字)</option>
                    <option value="DOMAIN">DOMAIN (完整域名)</option>
                    <option value="IP-CIDR">IP-CIDR (IP网段 / 单IP)</option>
                    <option value="GEOIP">GEOIP (地理位置IP)</option>
                  </select>
                </div>
              )}

              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <label className="font-semibold text-[#1F1E1D]">
                    {singleKind === 'remote' ? '规则集 URL 或名称' : '匹配目标 (域名/IP，支持多个)'}
                  </label>
                  {singleKind === 'local' && (
                    <span className="text-[10px] text-[#9E9A91]">支持逗号或换行输入多个 IP/域名</span>
                  )}
                </div>
                <textarea
                  required
                  rows={singleKind === 'remote' ? 2 : 3}
                  placeholder={
                    singleKind === 'remote'
                      ? 'https://raw.githubusercontent.com/.../reject.yaml'
                      : '例如私有运维节点:\n192.168.1.100/32\n10.0.0.0/24\nvps.example.com'
                  }
                  value={singlePayload}
                  onChange={e => setSinglePayload(e.target.value)}
                  className="w-full px-3 py-2 bg-[#FAF8F5] border border-[#E8E4DC] rounded-xl font-mono text-xs text-[#1F1E1D] focus:outline-none focus:border-[#CC785C] resize-y leading-relaxed"
                />
              </div>

              <div className="space-y-1">
                <label className="font-semibold text-[#1F1E1D]">目标策略组 / 出口</label>
                <select
                  value={singleOutbound}
                  onChange={e => setSingleOutbound(e.target.value)}
                  className="w-full px-3 py-2 bg-[#FAF8F5] border border-[#E8E4DC] rounded-xl text-[#1F1E1D] focus:outline-none focus:border-[#CC785C]"
                >
                  {availableOutbounds.map(g => (
                    <option key={g} value={g}>
                      {g === 'REJECT' ? '🛑 REJECT (拦截丢弃)' : g}
                    </option>
                  ))}
                </select>
              </div>

              <div className="space-y-1">
                <label className="font-semibold text-[#1F1E1D]">备注名称 (可选)</label>
                <input
                  type="text"
                  placeholder="例如: 谷歌服务 / 办公专线"
                  value={singleName}
                  onChange={e => setSingleName(e.target.value)}
                  className="w-full px-3 py-2 bg-[#FAF8F5] border border-[#E8E4DC] rounded-xl text-[#1F1E1D] focus:outline-none focus:border-[#CC785C]"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-[#F0ECE4]">
                <button
                  type="button"
                  onClick={() => setShowAddSingleModal(false)}
                  className="px-4 py-2 text-xs font-medium btn-claude-secondary rounded-xl"
                >
                  取消
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 text-xs font-semibold btn-claude-primary rounded-xl"
                >
                  添加
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Edit Single Rule Modal */}
      {editingRule && (
        <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl border border-[#E3DDD2] shadow-2xl w-full max-w-xl p-6 space-y-4.5 animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between pb-3 border-b border-[#F0ECE4]">
              <h3 className="text-base font-bold text-[#1F1E1D]">编辑分流规则</h3>
              <button
                onClick={() => setEditingRule(null)}
                className="text-sm text-[#9E9A91] hover:text-[#1F1E1D]"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleEditSave} className="space-y-3.5 text-xs">
              <div className="space-y-1">
                <label className="font-semibold text-[#1F1E1D]">规则类型</label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setEditKind('local')}
                    className={`py-1.5 text-xs font-medium rounded-xl border transition-all ${editKind === 'local'
                      ? 'bg-[#1F1E1D] text-white border-[#1F1E1D]'
                      : 'bg-[#FAF8F5] text-[#59554E] border-[#E8E4DC]'
                      }`}
                  >
                    本地规则
                  </button>
                  <button
                    type="button"
                    onClick={() => setEditKind('remote')}
                    className={`py-1.5 text-xs font-medium rounded-xl border transition-all ${editKind === 'remote'
                      ? 'bg-[#1F1E1D] text-white border-[#1F1E1D]'
                      : 'bg-[#FAF8F5] text-[#59554E] border-[#E8E4DC]'
                      }`}
                  >
                    远程规则集
                  </button>
                </div>
              </div>

              {editKind === 'local' && (
                <div className="space-y-1">
                  <label className="font-semibold text-[#1F1E1D]">匹配类型</label>
                  <select
                    value={editType}
                    onChange={e => setEditType(e.target.value)}
                    className="w-full px-3 py-2 bg-[#FAF8F5] border border-[#E8E4DC] rounded-xl text-[#1F1E1D] focus:outline-none focus:border-[#CC785C]"
                  >
                    <option value="DOMAIN-SUFFIX">DOMAIN-SUFFIX (域名后缀)</option>
                    <option value="DOMAIN-KEYWORD">DOMAIN-KEYWORD (域名关键字)</option>
                    <option value="DOMAIN">DOMAIN (完整域名)</option>
                    <option value="IP-CIDR">IP-CIDR (IP网段 / 单IP)</option>
                    <option value="GEOIP">GEOIP (地理位置IP)</option>
                    <option value="FINAL">FINAL (漏网之鱼)</option>
                  </select>
                </div>
              )}

              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <label className="font-semibold text-[#1F1E1D]">
                    {editKind === 'remote' ? '规则集 URL 或名称' : '匹配目标 (域名/IP，聚合在一行管理)'}
                  </label>
                  {editKind === 'local' && (
                    <span className="text-[10px] text-[#9E9A91]">支持逗号或换行输入多个 IP/域名</span>
                  )}
                </div>
                <textarea
                  required
                  rows={editKind === 'remote' ? 2 : 4}
                  value={editPayload}
                  onChange={e => setEditPayload(e.target.value)}
                  className="w-full px-3 py-2 bg-[#FAF8F5] border border-[#E8E4DC] rounded-xl font-mono text-xs text-[#1F1E1D] focus:outline-none focus:border-[#CC785C] resize-y leading-relaxed"
                />
              </div>

              <div className="space-y-1">
                <label className="font-semibold text-[#1F1E1D]">目标策略组 / 出口</label>
                <select
                  value={editOutbound}
                  onChange={e => setEditOutbound(e.target.value)}
                  className="w-full px-3 py-2 bg-[#FAF8F5] border border-[#E8E4DC] rounded-xl text-[#1F1E1D] focus:outline-none focus:border-[#CC785C]"
                >
                  {availableOutbounds.map(g => (
                    <option key={g} value={g}>
                      {g === 'REJECT' ? '🛑 REJECT (拦截丢弃)' : g}
                    </option>
                  ))}
                </select>
              </div>

              <div className="space-y-1">
                <label className="font-semibold text-[#1F1E1D]">备注名称</label>
                <input
                  type="text"
                  placeholder="例如: 谷歌服务 / 办公专线"
                  value={editName}
                  onChange={e => setEditName(e.target.value)}
                  className="w-full px-3 py-2 bg-[#FAF8F5] border border-[#E8E4DC] rounded-xl text-[#1F1E1D] focus:outline-none focus:border-[#CC785C]"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-[#F0ECE4]">
                <button
                  type="button"
                  onClick={() => setEditingRule(null)}
                  className="px-4 py-2 text-xs font-medium btn-claude-secondary rounded-xl"
                >
                  取消
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 text-xs font-semibold btn-claude-primary rounded-xl"
                >
                  保存修改
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
