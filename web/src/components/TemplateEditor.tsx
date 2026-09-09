import React, { useState, useEffect } from 'react';
import {
  Check,
  ChevronDown,
  Copy,
  Download,
  Eye,
  FileCode,
  Plus,
  RefreshCw,
  RotateCcw,
  Save,
  Trash2,
  X,
} from 'lucide-react';
import { ConfigTemplate } from '../types';

interface TemplateEditorProps {
  templates: ConfigTemplate[];
  onAddTemplate: (template: Partial<ConfigTemplate>) => Promise<void>;
  onUpdateTemplate: (id: string, updates: Partial<ConfigTemplate>) => Promise<void>;
  onDeleteTemplate: (id: string) => Promise<void>;
  onResetTemplate: (id: string) => Promise<ConfigTemplate>;
  onPreview: (templateId?: string, customTemplate?: string, customType?: string) => Promise<{ nodeCount: number; data: string }>;
}

export const TemplateEditor: React.FC<TemplateEditorProps> = ({
  templates,
  onAddTemplate,
  onUpdateTemplate,
  onDeleteTemplate,
  onResetTemplate,
  onPreview,
}) => {
  const [selectedTemplateId, setSelectedTemplateId] = useState<string>(templates[0]?.id || '');
  const [templateContent, setTemplateContent] = useState('');
  const [previewContent, setPreviewContent] = useState('');
  const [previewNodeCount, setPreviewNodeCount] = useState(0);
  const [isPreviewLoading, setIsPreviewLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [copied, setCopied] = useState(false);

  // New Template Modal state
  const [showNewModal, setShowNewModal] = useState(false);
  const [newName, setNewName] = useState('');
  const [newType, setNewType] = useState<'singbox' | 'mihomo' | 'loon' | 'quantumultx' | 'egern'>('singbox');
  const [newDesc, setNewDesc] = useState('');

  const currentTemplate = templates.find(t => t.id === selectedTemplateId) || templates[0];

  useEffect(() => {
    if (currentTemplate) {
      setTemplateContent(currentTemplate.content || '');
      handleRefreshPreview(currentTemplate.id, currentTemplate.content, currentTemplate.type);
    }
  }, [selectedTemplateId, currentTemplate]);

  const handleRefreshPreview = async (
    tplId = currentTemplate?.id,
    customTpl = templateContent,
    customType = currentTemplate?.type
  ) => {
    setIsPreviewLoading(true);
    try {
      const res = await onPreview(tplId, customTpl, customType);
      setPreviewContent(res.data);
      setPreviewNodeCount(res.nodeCount);
    } catch (e) {
      setPreviewContent('# 预览生成失败，请检查模版语法');
    } finally {
      setIsPreviewLoading(false);
    }
  };

  const handleResetTemplate = async () => {
    if (!currentTemplate) return;
    if (!window.confirm(`确定要将当前模版「${currentTemplate.name}」恢复为系统内置的默认配置吗？`)) return;
    setIsSaving(true);
    try {
      const resetTpl = await onResetTemplate(currentTemplate.id);
      if (resetTpl?.content) {
        setTemplateContent(resetTpl.content);
        await handleRefreshPreview(resetTpl.id, resetTpl.content, resetTpl.type);
      }
    } catch (err: any) {
      console.error('handleResetTemplate error:', err);
      alert(err.message || '重置失败');
    } finally {
      setIsSaving(false);
    }
  };

  const handleSave = async () => {
    if (!currentTemplate) return;
    setIsSaving(true);
    try {
      await onUpdateTemplate(currentTemplate.id, { content: templateContent });
      await handleRefreshPreview();
    } finally {
      setIsSaving(false);
    }
  };

  const handleCreateSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newName.trim()) return;
    await onAddTemplate({
      name: newName.trim(),
      type: newType,
      description: newDesc.trim() || undefined,
      content: currentTemplate ? currentTemplate.content : '# 模版内容',
    });
    setNewName('');
    setNewDesc('');
    setShowNewModal(false);
  };

  const handleCopyPreview = () => {
    navigator.clipboard.writeText(previewContent);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleDownloadPreview = () => {
    if (!currentTemplate) return;
    const ext = currentTemplate.type === 'singbox' ? 'json' : (currentTemplate.type === 'mihomo' ? 'yaml' : 'mcf');
    const blob = new Blob([previewContent], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${currentTemplate.name || 'subone'}.${ext}`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const getTypeBadge = (type: string) => {
    if (type === 'singbox') return { label: 'Sing-box', color: 'bg-[#EFF6F4] text-[#367A68] border-[#D1E5DF]' };
    if (type === 'mihomo') return { label: 'Mihomo (Clash)', color: 'bg-[#FAF0E6] text-[#B85D38] border-[#E8D7C7]' };
    return { label: 'Loon', color: 'bg-[#F2F0F7] text-[#635588] border-[#DDD8EB]' };
  };

  return (
    <div className="space-y-4 max-w-7xl mx-auto h-[calc(100vh-130px)] flex flex-col min-h-0">
      {/* Control bar */}
      <div className="claude-panel p-3.5 rounded-2xl flex flex-wrap items-center justify-between gap-3 shrink-0">
        {/* Dropdown template selector */}
        <div className="flex items-center gap-3">
          <div className="relative">
            <select
              value={selectedTemplateId}
              onChange={e => setSelectedTemplateId(e.target.value)}
              className="appearance-none pl-3.5 pr-9 py-2 bg-white border border-[#DFD9CF] rounded-xl text-xs font-semibold text-[#1F1E1D] focus:outline-none focus:border-[#CC785C] shadow-xs cursor-pointer"
            >
              {templates.map(t => (
                <option key={t.id} value={t.id}>
                  {t.name} {t.isDefault ? '⭐' : ''}
                </option>
              ))}
            </select>
            <ChevronDown className="w-4 h-4 text-[#8C877D] absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
          </div>

          <button
            onClick={() => setShowNewModal(true)}
            className="flex items-center gap-1 px-3 py-2 text-xs font-semibold btn-claude-secondary rounded-xl shadow-xs"
          >
            <Plus className="w-3.5 h-3.5 text-[#CC785C]" />
            <span>新建模版</span>
          </button>

          {currentTemplate && (
            <div className="hidden sm:flex items-center gap-2">
              <span className={`px-2 py-0.5 text-[10px] font-semibold rounded-md border ${getTypeBadge(currentTemplate.type).color}`}>
                {getTypeBadge(currentTemplate.type).label}
              </span>
              {!currentTemplate.isDefault && (
                <button
                  onClick={() => onUpdateTemplate(currentTemplate.id, { isDefault: true })}
                  className="text-[11px] text-[#78746D] hover:text-[#1F1E1D] hover:underline"
                >
                  设为此格式默认
                </button>
              )}
            </div>
          )}
        </div>

        {/* Actions */}
        <div className="flex items-center gap-2">
          {templates.length > 1 && currentTemplate && (
            <button
              onClick={() => onDeleteTemplate(currentTemplate.id)}
              className="p-2 text-[#A8483B] hover:bg-[#FDF2F0] rounded-xl border border-transparent hover:border-[#F2D6D3]"
              title="删除当前模版"
            >
              <Trash2 className="w-4 h-4" />
            </button>
          )}

          <button
            onClick={handleResetTemplate}
            disabled={isSaving}
            className="flex items-center gap-1.5 px-3 py-2 text-xs font-semibold btn-claude-secondary rounded-xl text-[#78746D] hover:text-[#1F1E1D]"
            title="恢复为系统最新内置的默认模版"
          >
            <RotateCcw className="w-3.5 h-3.5 text-[#CC785C]" />
            <span>恢复默认</span>
          </button>

          <button
            onClick={() => handleRefreshPreview()}
            disabled={isPreviewLoading}
            className="flex items-center gap-1.5 px-3 py-2 text-xs font-semibold btn-claude-secondary rounded-xl"
          >
            <RefreshCw className={`w-3.5 h-3.5 text-[#CC785C] ${isPreviewLoading ? 'animate-spin' : ''}`} />
            <span>实时生成</span>
          </button>

          <button
            onClick={handleSave}
            disabled={isSaving}
            className="flex items-center gap-1.5 px-4 py-2 text-xs font-semibold btn-claude-primary rounded-xl shadow-xs"
          >
            <Save className="w-3.5 h-3.5" />
            <span>{isSaving ? '保存中...' : '保存模版'}</span>
          </button>
        </div>
      </div>

      {/* Editor & Preview Side-by-Side Split Panes with Smooth Scroll */}
      <div className="flex-1 grid grid-cols-1 lg:grid-cols-2 gap-4 min-h-0 h-full">
        {/* Left: Template Source Editor */}
        <div className="claude-panel rounded-2xl flex flex-col h-full min-h-0 overflow-hidden shadow-xs">
          <div className="px-4 py-2.5 bg-[#FAF8F5] border-b border-[#E8E4DC] flex items-center justify-between shrink-0">
            <div className="flex items-center gap-2">
              <FileCode className="w-4 h-4 text-[#CC785C]" />
              <span className="text-xs font-bold text-[#1F1E1D]">模版配置骨架 </span>
            </div>
            <span className="text-[11px] text-[#8C877D]">保存后将实时注入节点与规则</span>
          </div>
          <div className="flex-1 relative min-h-0 w-full h-full bg-white">
            <textarea
              value={templateContent}
              onChange={e => setTemplateContent(e.target.value)}
              spellCheck={false}
              className="absolute inset-0 w-full h-full p-4 bg-white font-mono text-xs text-[#2D2B28] focus:outline-none resize-none leading-relaxed overflow-y-auto overflow-x-auto"
              placeholder="此处粘贴或编辑配置模版..."
            />
          </div>
        </div>

        {/* Right: Merged Output Preview */}
        <div className="claude-panel rounded-2xl flex flex-col h-full min-h-0 overflow-hidden shadow-xs">
          <div className="px-4 py-2.5 bg-[#FAF8F5] border-b border-[#E8E4DC] flex items-center justify-between shrink-0">
            <div className="flex items-center gap-2">
              <Eye className="w-4 h-4 text-[#367A68]" />
              <span className="text-xs font-bold text-[#1F1E1D]">
                实时合成预览 ({previewNodeCount} 节点已注入)
              </span>
            </div>
            <div className="flex items-center gap-1.5">
              <button
                onClick={handleCopyPreview}
                className="flex items-center gap-1 px-2.5 py-1 text-[11px] font-medium btn-claude-secondary rounded-lg"
                title="复制合成后的完整配置"
              >
                {copied ? <Check className="w-3 h-3 text-[#367A68]" /> : <Copy className="w-3 h-3" />}
                <span>{copied ? '已复制' : '复制结果'}</span>
              </button>
              <button
                onClick={handleDownloadPreview}
                className="p-1 text-[#69655E] hover:text-[#1F1E1D] btn-claude-secondary rounded-lg"
                title="下载为本地配置文件"
              >
                <Download className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
          <div className="flex-1 relative min-h-0 w-full h-full bg-[#FAF9F6]">
            <pre className="absolute inset-0 w-full h-full p-4 bg-[#FAF9F6] font-mono text-xs text-[#1F1E1D] overflow-y-auto overflow-x-auto leading-relaxed select-all">
              {previewContent || '# 正在生成合成配置...'}
            </pre>
          </div>
        </div>
      </div>

      {/* New Template Modal */}
      {showNewModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-xs p-4">
          <div className="claude-panel w-full max-w-md p-6 rounded-2xl shadow-xl space-y-4 animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between">
              <h3 className="text-base font-bold text-[#1F1E1D]">新建配置模版</h3>
              <button onClick={() => setShowNewModal(false)} className="p-1 text-[#8C877D] hover:text-[#1F1E1D]">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleCreateSubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-[#4A4742] mb-1.5">模版名称</label>
                <input
                  type="text"
                  required
                  placeholder="例如：旁路由备用模版、家庭精简版"
                  value={newName}
                  onChange={e => setNewName(e.target.value)}
                  className="w-full px-3.5 py-2 claude-input rounded-xl text-xs"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-[#4A4742] mb-1.5">目标客户端格式</label>
                <select
                  value={newType}
                  onChange={e => setNewType(e.target.value as any)}
                  className="w-full px-3.5 py-2 claude-input rounded-xl text-xs"
                >
                  <option value="singbox">Sing-box (JSON 格式)</option>
                  <option value="mihomo">Mihomo / ShellCrash (YAML 格式)</option>
                  <option value="loon">Loon (MCF 格式)</option>
                  <option value="quantumultx">Quantumult X (CONF 格式)</option>
                  <option value="egern">Egern (YAML 格式)</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-medium text-[#4A4742] mb-1.5">模版备注描述 (可选)</label>
                <input
                  type="text"
                  placeholder="例如： 校园网分流调优"
                  value={newDesc}
                  onChange={e => setNewDesc(e.target.value)}
                  className="w-full px-3.5 py-2 claude-input rounded-xl text-xs"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowNewModal(false)}
                  className="px-4 py-2 text-xs font-medium btn-claude-secondary rounded-xl"
                >
                  取消
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 text-xs font-semibold btn-claude-primary rounded-xl"
                >
                  确认创建
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
