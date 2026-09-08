import React, { useState } from 'react';
import {
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Edit2,
  Filter,
  Globe,
  Layers,
  Plus,
  RefreshCw,
  RotateCcw,
  Search,
  Sliders,
  Sparkles,
  Trash2,
  X,
  XCircle,
  Zap,
} from 'lucide-react';
import { CountryPatternRule, ExtractionRule, ProxyNode, SubscriptionSource } from '../types';

interface NodesExtractorProps {
  nodes: ProxyNode[];
  rules: ExtractionRule[];
  countryRules: CountryPatternRule[];
  sources: SubscriptionSource[];
  isRefreshing: boolean;
  onRefreshAll: () => Promise<void>;
  onAddRule: (rule: Partial<ExtractionRule>) => Promise<void>;
  onUpdateRule: (id: string, updates: Partial<ExtractionRule>) => Promise<void>;
  onDeleteRule: (id: string) => Promise<void>;
  onAddCountryRule: (rule: Partial<CountryPatternRule>) => Promise<void>;
  onUpdateCountryRule: (id: string, updates: Partial<CountryPatternRule>) => Promise<void>;
  onDeleteCountryRule: (id: string) => Promise<void>;
  onResetCountryRules: () => Promise<void>;
}

export const NodesExtractor: React.FC<NodesExtractorProps> = ({
  nodes,
  rules,
  countryRules,
  sources,
  isRefreshing,
  onRefreshAll,
  onAddRule,
  onUpdateRule,
  onDeleteRule,
  onAddCountryRule,
  onUpdateCountryRule,
  onDeleteCountryRule,
  onResetCountryRules,
}) => {
  // Filter & Search states
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCountry, setSelectedCountry] = useState<string>('ALL');
  const [selectedType, setSelectedType] = useState<string>('ALL');

  // Collapse states for rules sections
  const [showCountryRules, setShowCountryRules] = useState(false);
  const [showExtractionRules, setShowExtractionRules] = useState(false);

  // Modals
  const [showRuleModal, setShowRuleModal] = useState(false);
  const [editingRule, setEditingRule] = useState<ExtractionRule | null>(null);

  const [showCountryModal, setShowCountryModal] = useState(false);
  const [editingCountryRule, setEditingCountryRule] = useState<CountryPatternRule | null>(null);

  // Rule Form States
  const [ruleName, setRuleName] = useState('');
  const [selectedSources, setSelectedSources] = useState<string[]>([]);
  const [targetCountries, setTargetCountries] = useState<string[]>([]);
  const [includeRegex, setIncludeRegex] = useState('');
  const [excludeRegex, setExcludeRegex] = useState('');
  const [prefix, setPrefix] = useState('');
  const [suffix, setSuffix] = useState('');
  const [replaceFrom, setReplaceFrom] = useState('');
  const [replaceTo, setReplaceTo] = useState('');

  // Country Rule Form States
  const [cCode, setCCode] = useState('');
  const [cName, setCName] = useState('');
  const [cEmoji, setCEmoji] = useState('🌐');
  const [cPattern, setCPattern] = useState('');
  const [cGroupName, setCGroupName] = useState('');

  // Country count stats
  const countryStats: Record<string, { count: number; emoji: string; name: string }> = {};
  nodes.forEach(n => {
    const code = n.countryCode || 'OTHER';
    if (!countryStats[code]) {
      countryStats[code] = {
        count: 0,
        emoji: n.countryEmoji || '🌐',
        name: code === 'OTHER' ? '其他' : code,
      };
    }
    countryStats[code].count++;
  });

  const availableCountries = Array.from(new Set(nodes.map(n => n.countryCode || 'OTHER'))).filter(Boolean);
  const availableTypes = Array.from(new Set(nodes.map(n => n.type))).filter(Boolean);

  const filteredNodes = nodes.filter(node => {
    const matchesSearch =
      node.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      node.server.toLowerCase().includes(searchTerm.toLowerCase()) ||
      String(node.port).includes(searchTerm);

    const matchesCountry =
      selectedCountry === 'ALL' || (node.countryCode || 'OTHER') === selectedCountry;

    const matchesType = selectedType === 'ALL' || node.type === selectedType;

    return matchesSearch && matchesCountry && matchesType;
  });

  // Extraction Rule Handlers
  const openAddRule = () => {
    setRuleName('');
    setSelectedSources([]);
    setTargetCountries([]);
    setIncludeRegex('');
    setExcludeRegex('');
    setPrefix('');
    setSuffix('');
    setReplaceFrom('');
    setReplaceTo('');
    setEditingRule(null);
    setShowRuleModal(true);
  };

  const openEditRule = (rule: ExtractionRule) => {
    setEditingRule(rule);
    setRuleName(rule.name);
    setSelectedSources(rule.sourceIds || []);
    setTargetCountries(rule.targetCountries || []);
    setIncludeRegex(rule.includeRegex || '');
    setExcludeRegex(rule.excludeRegex || '');
    setPrefix(rule.renamePattern?.prefix || '');
    setSuffix(rule.renamePattern?.suffix || '');
    setReplaceFrom(rule.renamePattern?.replaceFrom || '');
    setReplaceTo(rule.renamePattern?.replaceTo || '');
    setShowRuleModal(true);
  };

  const handleRuleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!ruleName.trim()) return;

    const payload: Partial<ExtractionRule> = {
      name: ruleName.trim(),
      enabled: editingRule ? editingRule.enabled : true,
      sourceIds: selectedSources.length > 0 ? selectedSources : undefined,
      targetCountries: targetCountries.length > 0 ? targetCountries : undefined,
      includeRegex: includeRegex.trim() || undefined,
      excludeRegex: excludeRegex.trim() || undefined,
      renamePattern: (prefix || suffix || replaceFrom) ? {
        prefix: prefix.trim() || undefined,
        suffix: suffix.trim() || undefined,
        replaceFrom: replaceFrom || undefined,
        replaceTo: replaceTo || undefined,
      } : undefined,
    };

    if (editingRule) {
      await onUpdateRule(editingRule.id, payload);
    } else {
      await onAddRule(payload);
    }
    setShowRuleModal(false);
  };

  // Country Rule Handlers
  const openAddCountry = () => {
    setCCode('');
    setCName('');
    setCEmoji('🌐');
    setCPattern('');
    setCGroupName('');
    setEditingCountryRule(null);
    setShowCountryModal(true);
  };

  const openEditCountry = (cr: CountryPatternRule) => {
    setEditingCountryRule(cr);
    setCCode(cr.code);
    setCName(cr.name);
    setCEmoji(cr.emoji);
    setCPattern(cr.pattern);
    setCGroupName(cr.groupName || `${cr.emoji} ${cr.name}节点`);
    setShowCountryModal(true);
  };

  const handleCountrySubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!cCode.trim() || !cName.trim() || !cPattern.trim()) return;

    const payload: Partial<CountryPatternRule> = {
      code: cCode.trim().toUpperCase(),
      name: cName.trim(),
      emoji: cEmoji.trim() || '🌐',
      pattern: cPattern.trim(),
      groupName: cGroupName.trim() || `${cEmoji.trim() || '🌐'} ${cName.trim()}节点`,
    };

    if (editingCountryRule) {
      await onUpdateCountryRule(editingCountryRule.id, payload);
    } else {
      await onAddCountryRule(payload);
    }
    setShowCountryModal(false);
  };

  return (
    <div className="space-y-5 max-w-6xl mx-auto">
      {/* Top Main Action & Refresh Header */}
      <div className="claude-panel p-5 rounded-2xl flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="space-y-1.5">
          <div className="flex items-center gap-2.5">
            <h2 className="text-lg font-bold text-[#1F1E1D]">节点池与抽取规则流水线</h2>
            <span className="px-2.5 py-0.5 text-xs font-semibold bg-[#EFF6F4] text-[#367A68] border border-[#D1E5DF] rounded-full">
              {nodes.length} 个有效节点
            </span>
          </div>
          <p className="text-xs text-[#78746D]">
            统一管理地区识别规则、关键字/正则过滤与重命名，一键拉取各订阅源并完成智能抽取与分组
          </p>

          {/* Country Quick Stat Badges */}
          <div className="flex items-center gap-1.5 flex-wrap pt-1">
            {Object.entries(countryStats).map(([code, data]) => (
              <button
                key={code}
                onClick={() => setSelectedCountry(selectedCountry === code ? 'ALL' : code)}
                className={`flex items-center gap-1 px-2 py-0.5 rounded-lg text-[11px] font-mono transition-all ${
                  selectedCountry === code
                    ? 'bg-[#CC785C] text-white font-bold shadow-xs'
                    : 'bg-[#F5F2EC] text-[#59554E] hover:bg-[#EDE8DE] border border-[#E3DDD2]'
                }`}
              >
                <span>{data.emoji}</span>
                <span>{data.name}</span>
                <span className="opacity-75 font-sans">({data.count})</span>
              </button>
            ))}
          </div>
        </div>

        <div className="flex items-center gap-2 self-start md:self-center">
          <button
            onClick={onRefreshAll}
            disabled={isRefreshing}
            className="flex items-center gap-2 px-5 py-2.5 text-xs font-bold btn-claude-primary rounded-xl shadow-sm disabled:opacity-50"
          >
            <RefreshCw className={`w-4 h-4 ${isRefreshing ? 'animate-spin' : ''}`} />
            <span>{isRefreshing ? '正在拉取并分组...' : '🔄 立即拉取并执行抽取分组'}</span>
          </button>
        </div>
      </div>

      {/* Rules Config Accordions */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Section 1: Country Grouping Rules */}
        <div className="claude-panel rounded-2xl overflow-hidden flex flex-col">
          <button
            onClick={() => setShowCountryRules(!showCountryRules)}
            className="w-full px-4 py-3.5 bg-[#FAF8F5] hover:bg-[#F3EFEA] border-b border-[#E8E4DC] flex items-center justify-between transition-colors text-left"
          >
            <div className="flex items-center gap-2.5">
              <Globe className="w-4 h-4 text-[#367A68]" />
              <div>
                <h3 className="text-xs font-bold text-[#1F1E1D]">🌍 国家/地区自动分类与分组规则</h3>
                <p className="text-[11px] text-[#78746D]">
                  已配置 {countryRules.length} 个地区正则匹配与对应策略分组
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2 text-[#78746D]">
              <span className="text-[11px] font-medium hidden sm:inline">
                {showCountryRules ? '收起规则' : '查看/编辑'}
              </span>
              {showCountryRules ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
            </div>
          </button>

          {showCountryRules && (
            <div className="p-4 space-y-3 bg-white animate-in fade-in duration-150 flex-1">
              <div className="flex items-center justify-between pb-2 border-b border-[#F0ECE4]">
                <span className="text-[11px] text-[#78746D]">匹配节点名称识别国家，并自动分流至对应测速策略组</span>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => onResetCountryRules()}
                    className="flex items-center gap-1 text-[11px] text-[#78746D] hover:text-[#1F1E1D]"
                    title="重置为默认规则"
                  >
                    <RotateCcw className="w-3 h-3" />
                    <span>恢复默认</span>
                  </button>
                  <button
                    onClick={openAddCountry}
                    className="flex items-center gap-1 px-2.5 py-1 text-[11px] font-semibold btn-claude-secondary rounded-lg"
                  >
                    <Plus className="w-3 h-3 text-[#CC785C]" />
                    <span>添加地区</span>
                  </button>
                </div>
              </div>

              <div className="space-y-2 max-h-80 overflow-y-auto pr-1">
                {countryRules.map(cr => (
                  <div
                    key={cr.id}
                    className="bg-[#FAF8F5] p-2.5 rounded-xl border border-[#EFECE6] flex items-center justify-between gap-3 text-xs"
                  >
                    <div className="flex items-center gap-2.5 min-w-0 flex-1">
                      <span className="text-base">{cr.emoji}</span>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1.5">
                          <span className="font-bold text-[#1F1E1D]">{cr.name}</span>
                          <span className="px-1.5 py-0.2 text-[10px] font-mono bg-[#EFEAE2] text-[#69655E] rounded">
                            {cr.code}
                          </span>
                          {cr.groupName && (
                            <span className="px-1.5 py-0.2 text-[10px] font-medium bg-[#EFF6F4] text-[#367A68] rounded truncate">
                              ➔ {cr.groupName}
                            </span>
                          )}
                        </div>
                        <div className="text-[11px] font-mono text-[#78746D] truncate mt-0.5" title={cr.pattern}>
                          {cr.pattern}
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => openEditCountry(cr)}
                        className="p-1 text-[#69655E] hover:text-[#1F1E1D] rounded-lg hover:bg-white"
                        title="编辑地区规则"
                      >
                        <Edit2 className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={() => onDeleteCountryRule(cr.id)}
                        className="p-1 text-[#A8483B] hover:bg-[#FDF2F0] rounded-lg"
                        title="删除地区规则"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Section 2: Custom Extraction & Rename Rules */}
        <div className="claude-panel rounded-2xl overflow-hidden flex flex-col">
          <button
            onClick={() => setShowExtractionRules(!showExtractionRules)}
            className="w-full px-4 py-3.5 bg-[#FAF8F5] hover:bg-[#F3EFEA] border-b border-[#E8E4DC] flex items-center justify-between transition-colors text-left"
          >
            <div className="flex items-center gap-2.5">
              <Sliders className="w-4 h-4 text-[#CC785C]" />
              <div>
                <h3 className="text-xs font-bold text-[#1F1E1D]">⚡ 自定义抽取与重命名规则</h3>
                <p className="text-[11px] text-[#78746D]">
                  已配置 {rules.length} 条节点白名单过滤、正则清洗与改名规则
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2 text-[#78746D]">
              <span className="text-[11px] font-medium hidden sm:inline">
                {showExtractionRules ? '收起规则' : '查看/编辑'}
              </span>
              {showExtractionRules ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
            </div>
          </button>

          {showExtractionRules && (
            <div className="p-4 space-y-3 bg-white animate-in fade-in duration-150 flex-1">
              <div className="flex items-center justify-between pb-2 border-b border-[#F0ECE4]">
                <span className="text-[11px] text-[#78746D]">规则按顺序执行；若无启用规则则默认保留全部节点</span>
                <button
                  onClick={openAddRule}
                  className="flex items-center gap-1 px-2.5 py-1 text-[11px] font-semibold btn-claude-secondary rounded-lg"
                >
                  <Plus className="w-3 h-3 text-[#CC785C]" />
                  <span>添加抽取规则</span>
                </button>
              </div>

              <div className="space-y-2 max-h-80 overflow-y-auto pr-1">
                {rules.map(rule => (
                  <div
                    key={rule.id}
                    className={`p-2.5 rounded-xl border flex items-center justify-between gap-3 text-xs transition-all ${
                      rule.enabled ? 'bg-[#FAF8F5] border-[#EFECE6]' : 'bg-[#F7F5F2] border-[#E5DFD5] opacity-60'
                    }`}
                  >
                    <div className="flex items-center gap-2.5 min-w-0 flex-1">
                      <button
                        onClick={() => onUpdateRule(rule.id, { enabled: !rule.enabled })}
                        className="mt-0.5"
                        title={rule.enabled ? '点击禁用' : '点击启用'}
                      >
                        {rule.enabled ? (
                          <CheckCircle2 className="w-4 h-4 text-[#367A68]" />
                        ) : (
                          <XCircle className="w-4 h-4 text-[#9E9A91]" />
                        )}
                      </button>

                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1.5">
                          <span className="font-bold text-[#1F1E1D]">{rule.name}</span>
                          {rule.excludeRegex && (
                            <span className="px-1.5 py-0.2 text-[10px] font-mono bg-[#FDF2F0] text-[#A8483B] rounded">
                              排除: {rule.excludeRegex}
                            </span>
                          )}
                          {rule.includeRegex && (
                            <span className="px-1.5 py-0.2 text-[10px] font-mono bg-[#EFF6F4] text-[#367A68] rounded">
                              包含: {rule.includeRegex}
                            </span>
                          )}
                        </div>
                        {rule.renamePattern && (
                          <div className="text-[11px] font-mono text-[#78746D] mt-0.5 truncate">
                            重命名: {rule.renamePattern.prefix ? `[前缀: ${rule.renamePattern.prefix}] ` : ''}
                            {rule.renamePattern.suffix ? `[后缀: ${rule.renamePattern.suffix}] ` : ''}
                            {rule.renamePattern.replaceFrom ? `[替换: ${rule.renamePattern.replaceFrom} -> ${rule.renamePattern.replaceTo || ''}]` : ''}
                          </div>
                        )}
                      </div>
                    </div>

                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => openEditRule(rule)}
                        className="p-1 text-[#69655E] hover:text-[#1F1E1D] rounded-lg hover:bg-white"
                        title="编辑规则"
                      >
                        <Edit2 className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={() => onDeleteRule(rule.id)}
                        className="p-1 text-[#A8483B] hover:bg-[#FDF2F0] rounded-lg"
                        title="删除规则"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                ))}

                {rules.length === 0 && (
                  <div className="text-center py-6 text-xs text-[#9E9A91]">暂无自定义抽取规则，默认保留所有节点</div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Nodes Search, Filters & Grid Display */}
      <div className="space-y-4">
        <div className="claude-panel p-4 rounded-2xl flex flex-col md:flex-row md:items-center justify-between gap-3">
          <div className="relative flex-1 max-w-md">
            <Search className="w-4 h-4 text-[#8C877D] absolute left-3.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="搜索节点名称、IP 或 端口..."
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
              className="w-full pl-9 pr-4 py-2 claude-input rounded-xl text-xs"
            />
          </div>

          <div className="flex items-center gap-2 overflow-x-auto pb-1 md:pb-0">
            <select
              value={selectedCountry}
              onChange={e => setSelectedCountry(e.target.value)}
              className="px-3 py-2 claude-input rounded-xl text-xs cursor-pointer"
            >
              <option value="ALL">全部地区 ({nodes.length})</option>
              {availableCountries.map(c => (
                <option key={c} value={c}>
                  {c} ({nodes.filter(n => (n.countryCode || 'OTHER') === c).length})
                </option>
              ))}
            </select>

            <select
              value={selectedType}
              onChange={e => setSelectedType(e.target.value)}
              className="px-3 py-2 claude-input rounded-xl text-xs cursor-pointer"
            >
              <option value="ALL">全部协议</option>
              {availableTypes.map(t => (
                <option key={t} value={t}>
                  {t.toUpperCase()}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Nodes Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {filteredNodes.map(node => (
            <div
              key={node.id}
              className="claude-panel p-4 rounded-2xl hover:border-[#D5CFC5] transition-all flex flex-col justify-between gap-3 group"
            >
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-center gap-2 min-w-0">
                  <span className="text-xl">{node.countryEmoji || '🌐'}</span>
                  <div className="min-w-0">
                    <h4 className="text-xs font-bold text-[#1F1E1D] truncate group-hover:text-[#CC785C] transition-colors">
                      {node.name}
                    </h4>
                    <div className="text-[11px] font-mono text-[#78746D] truncate">
                      {node.server}:{node.port}
                    </div>
                  </div>
                </div>
                <span className="px-2 py-0.5 text-[10px] font-mono uppercase font-bold bg-[#F3EFEA] text-[#69655E] rounded border border-[#E5DFD5]">
                  {node.type}
                </span>
              </div>

              <div className="flex items-center justify-between text-[11px] text-[#8C877D] border-t border-[#F0ECE4] pt-2">
                <div className="flex items-center gap-2 min-w-0">
                  {node.sourceName && (
                    <span className="truncate max-w-[130px]" title={node.sourceName}>
                      🏷️ {node.sourceName}
                    </span>
                  )}
                  {node.countryCode && (
                    <span className="px-1.5 py-0.2 bg-[#F3EFEA] text-[#69655E] text-[10px] rounded font-mono">
                      {node.countryCode}
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-1.5 font-mono text-[10px]">
                  {node.tls && <span className="text-[#367A68] bg-[#EFF6F4] px-1.5 py-0.5 rounded border border-[#D1E5DF]">TLS</span>}
                  {node.network && (
                    <span className="text-[#B85D38] bg-[#FAF0E6] px-1.5 py-0.5 rounded border border-[#E8D7C7] uppercase">
                      {node.network}
                    </span>
                  )}
                </div>
              </div>
            </div>
          ))}

          {filteredNodes.length === 0 && (
            <div className="col-span-full claude-panel p-12 rounded-2xl text-center text-xs text-[#9E9A91] space-y-2">
              <Layers className="w-8 h-8 text-[#CCC6BB] mx-auto" />
              <p>暂无符合筛选条件的节点</p>
              <button
                onClick={onRefreshAll}
                className="px-3.5 py-1.5 text-xs font-semibold btn-claude-primary rounded-xl"
              >
                立即从订阅源拉取
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Country Rule Modal */}
      {showCountryModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-xs p-4">
          <div className="claude-panel w-full max-w-md p-6 rounded-2xl shadow-xl space-y-4 animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between">
              <h3 className="text-base font-bold text-[#1F1E1D]">
                {editingCountryRule ? '编辑地区识别规则' : '添加国家/地区规则'}
              </h3>
              <button onClick={() => setShowCountryModal(false)} className="p-1 text-[#8C877D] hover:text-[#1F1E1D]">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleCountrySubmit} className="space-y-3.5">
              <div className="grid grid-cols-3 gap-2">
                <div>
                  <label className="block text-xs font-medium text-[#4A4742] mb-1">国旗 Emoji</label>
                  <input
                    type="text"
                    required
                    placeholder="🇭🇰"
                    value={cEmoji}
                    onChange={e => setCEmoji(e.target.value)}
                    className="w-full px-3 py-2 claude-input rounded-xl text-center text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-[#4A4742] mb-1">地区代码</label>
                  <input
                    type="text"
                    required
                    placeholder="HK"
                    value={cCode}
                    onChange={e => setCCode(e.target.value.toUpperCase())}
                    className="w-full px-3 py-2 claude-input rounded-xl text-xs uppercase font-mono"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-[#4A4742] mb-1">地区名称</label>
                  <input
                    type="text"
                    required
                    placeholder="香港"
                    value={cName}
                    onChange={e => setCName(e.target.value)}
                    className="w-full px-3 py-2 claude-input rounded-xl text-xs"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-[#4A4742] mb-1">匹配正则表达式 (不区分大小写)</label>
                <input
                  type="text"
                  required
                  placeholder="(🇭🇰|香港|港|hk|hongkong)"
                  value={cPattern}
                  onChange={e => setCPattern(e.target.value)}
                  className="w-full px-3 py-2 claude-input rounded-xl text-xs font-mono"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-[#4A4742] mb-1">挂载对应测速分组 (可选)</label>
                <input
                  type="text"
                  placeholder="例如：🇭🇰 香港节点"
                  value={cGroupName}
                  onChange={e => setCGroupName(e.target.value)}
                  className="w-full px-3 py-2 claude-input rounded-xl text-xs"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowCountryModal(false)}
                  className="px-4 py-2 text-xs font-medium btn-claude-secondary rounded-xl"
                >
                  取消
                </button>
                <button type="submit" className="px-4 py-2 text-xs font-semibold btn-claude-primary rounded-xl">
                  {editingCountryRule ? '保存修改' : '确认添加'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Extraction Rule Modal */}
      {showRuleModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-xs p-4">
          <div className="claude-panel w-full max-w-lg p-6 rounded-2xl shadow-xl space-y-4 animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between">
              <h3 className="text-base font-bold text-[#1F1E1D]">
                {editingRule ? '编辑抽取规则' : '新建抽取规则'}
              </h3>
              <button onClick={() => setShowRuleModal(false)} className="p-1 text-[#8C877D] hover:text-[#1F1E1D]">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleRuleSubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-[#4A4742] mb-1.5">规则名称</label>
                <input
                  type="text"
                  required
                  placeholder="例如：过滤官网与过期节点"
                  value={ruleName}
                  onChange={e => setRuleName(e.target.value)}
                  className="w-full px-3.5 py-2 claude-input rounded-xl text-xs"
                />
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-[#4A4742] mb-1">包含正则 (Include)</label>
                  <input
                    type="text"
                    placeholder="如：(0\.5x|专线|BGP)"
                    value={includeRegex}
                    onChange={e => setIncludeRegex(e.target.value)}
                    className="w-full px-3 py-2 claude-input rounded-xl text-xs font-mono"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-[#4A4742] mb-1">排除正则 (Exclude)</label>
                  <input
                    type="text"
                    placeholder="如：(官网|到期|剩余|流量)"
                    value={excludeRegex}
                    onChange={e => setExcludeRegex(e.target.value)}
                    className="w-full px-3 py-2 claude-input rounded-xl text-xs font-mono"
                  />
                </div>
              </div>

              <div className="p-3 bg-[#FAF8F5] rounded-xl border border-[#EFECE6] space-y-2">
                <span className="text-xs font-bold text-[#1F1E1D]">节点重命名处理 (可选)</span>
                <div className="grid grid-cols-2 gap-2">
                  <input
                    type="text"
                    placeholder="添加前缀 (如: [VIP] )"
                    value={prefix}
                    onChange={e => setPrefix(e.target.value)}
                    className="px-3 py-1.5 claude-input rounded-lg text-xs"
                  />
                  <input
                    type="text"
                    placeholder="添加后缀"
                    value={suffix}
                    onChange={e => setSuffix(e.target.value)}
                    className="px-3 py-1.5 claude-input rounded-lg text-xs"
                  />
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <input
                    type="text"
                    placeholder="正则替换 (From)"
                    value={replaceFrom}
                    onChange={e => setReplaceFrom(e.target.value)}
                    className="px-3 py-1.5 claude-input rounded-lg text-xs font-mono"
                  />
                  <input
                    type="text"
                    placeholder="替换为 (To)"
                    value={replaceTo}
                    onChange={e => setReplaceTo(e.target.value)}
                    className="px-3 py-1.5 claude-input rounded-lg text-xs font-mono"
                  />
                </div>
              </div>

              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowRuleModal(false)}
                  className="px-4 py-2 text-xs font-medium btn-claude-secondary rounded-xl"
                >
                  取消
                </button>
                <button type="submit" className="px-4 py-2 text-xs font-semibold btn-claude-primary rounded-xl">
                  {editingRule ? '保存修改' : '确认创建'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
