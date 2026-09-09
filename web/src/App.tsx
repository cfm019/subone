import React, { useState, useEffect } from 'react';
import { Header } from './components/Header';
import { Dashboard } from './components/Dashboard';
import { SourcesManager } from './components/SourcesManager';
import { NodesViewer } from './components/NodesViewer';
import { GroupsManager } from './components/GroupsManager';
import { RulesManager } from './components/RulesManager';
import { TemplateEditor } from './components/TemplateEditor';
import { SettingsModal } from './components/SettingsModal';
import { LoginView } from './components/LoginView';
import {
  AppConfig,
  ProxyNode,
  SubscriptionSource,
  ExtractionRule,
  CountryPatternRule,
  ConfigTemplate,
  ProxyGroupItem,
  UnifiedRuleItem,
} from './types';

const API_BASE = '/api';

export function App() {
  const [activeTab, setActiveTab] = useState<'dashboard' | 'sources' | 'nodes' | 'groups' | 'rules' | 'templates'>('dashboard');

  const [config, setConfig] = useState<AppConfig | null>(null);
  const [nodes, setNodes] = useState<ProxyNode[]>([]);
  const [showSettings, setShowSettings] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Authentication State
  const [authChecked, setAuthChecked] = useState(false);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [authRequired, setAuthRequired] = useState(false);

  // API helper that auto-injects auth header
  const apiFetch = async (url: string, options: RequestInit = {}) => {
    const headers = new Headers(options.headers || {});
    const token = localStorage.getItem('subone_auth_token');
    if (token) {
      headers.set('Authorization', `Bearer ${token}`);
    }
    const res = await fetch(url, { ...options, headers });
    if (res.status === 401) {
      setIsAuthenticated(false);
      setAuthRequired(true);
    }
    return res;
  };

  const checkAuth = async () => {
    try {
      const token = localStorage.getItem('subone_auth_token');
      const headers: Record<string, string> = {};
      if (token) headers['Authorization'] = `Bearer ${token}`;

      const res = await fetch(`${API_BASE}/auth/status`, { headers });
      if (res.ok) {
        const json = await res.json();
        setAuthRequired(json.authRequired);
        setIsAuthenticated(json.authenticated);
      } else {
        setIsAuthenticated(false);
      }
    } catch (e) {
      console.error('Auth check error:', e);
    } finally {
      setAuthChecked(true);
    }
  };

  const fetchData = async () => {
    try {
      const [configRes, nodesRes] = await Promise.all([
        apiFetch(`${API_BASE}/config`),
        apiFetch(`${API_BASE}/nodes`),
      ]);

      if (configRes.ok) {
        const cJson = await configRes.json();
        setConfig(cJson.data);
      }

      if (nodesRes.ok) {
        const nJson = await nodesRes.json();
        setNodes(nJson.data || []);
      }
    } catch (e: any) {
      console.error('Failed to load initial data:', e);
      setErrorMsg('无法连接后端服务，请确认服务已启动');
    }
  };

  useEffect(() => {
    checkAuth();
  }, []);

  useEffect(() => {
    if (authChecked && (isAuthenticated || !authRequired)) {
      fetchData();
    }
  }, [authChecked, isAuthenticated, authRequired]);

  const handleLoginSuccess = (token: string) => {
    localStorage.setItem('subone_auth_token', token);
    setIsAuthenticated(true);
    fetchData();
  };

  const handleLogout = async () => {
    try {
      await apiFetch(`${API_BASE}/auth/logout`, { method: 'POST' });
    } finally {
      localStorage.removeItem('subone_auth_token');
      setIsAuthenticated(false);
    }
  };

  const handleChangePassword = async (oldPassword: string, newPassword: string): Promise<boolean> => {
    const res = await apiFetch(`${API_BASE}/auth/change-password`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ oldPassword, newPassword }),
    });
    if (res.ok) {
      await fetchData();
      return true;
    }
    return false;
  };

  const handleRegenerateSubToken = async (): Promise<string | null> => {
    const res = await apiFetch(`${API_BASE}/settings/regenerate-sub-token`, { method: 'POST' });
    if (res.ok) {
      const json = await res.json();
      await fetchData();
      return json.subToken;
    }
    return null;
  };

  // Custom Nodes handlers
  const handleImportCustomNodes = async (text: string, replaceAll?: boolean) => {
    const res = await apiFetch(`${API_BASE}/custom-nodes/import`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text, replaceAll }),
    });
    if (res.ok) await fetchData();
  };

  const handleDeleteCustomNode = async (id: string) => {
    const res = await apiFetch(`${API_BASE}/custom-nodes/${id}`, { method: 'DELETE' });
    if (res.ok) await fetchData();
  };

  // Sources handlers
  const handleAddSource = async (source: { name: string; url: string; type: string }) => {
    try {
      setErrorMsg(null);
      const res = await apiFetch(`${API_BASE}/sources`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(source),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok || (json && json.success === false)) {
        const msg = json?.message || `添加订阅失败 (HTTP ${res.status})`;
        setErrorMsg(msg);
        alert(msg);
        return;
      }
      await fetchData();
      if (json && json.count === 0) {
        setErrorMsg(`订阅【${source.name}】已添加，但当前未解析到有效节点（可能网络暂不可达或格式不匹配）`);
      }
    } catch (err: any) {
      console.error('handleAddSource error:', err);
      const msg = `添加订阅发生异常: ${err.message || err}`;
      setErrorMsg(msg);
      alert(msg);
    }
  };

  const handleUpdateSource = async (id: string, updates: Partial<SubscriptionSource>) => {
    try {
      const res = await apiFetch(`${API_BASE}/sources/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updates),
      });
      if (res.ok) await fetchData();
    } catch (err: any) {
      console.error('handleUpdateSource error:', err);
    }
  };

  const handleDeleteSource = async (id: string) => {
    try {
      const res = await apiFetch(`${API_BASE}/sources/${id}`, { method: 'DELETE' });
      if (res.ok) await fetchData();
    } catch (err: any) {
      console.error('handleDeleteSource error:', err);
    }
  };

  const handleRefreshSource = async (id: string) => {
    try {
      setErrorMsg(null);
      const res = await apiFetch(`${API_BASE}/sources/${id}/refresh`, { method: 'POST' });
      const json = await res.json().catch(() => null);
      if (!res.ok || (json && json.success === false)) {
        const msg = json?.message || '刷新订阅失败';
        setErrorMsg(msg);
        return;
      }
      await fetchData();
    } catch (err: any) {
      console.error('handleRefreshSource error:', err);
      setErrorMsg(`刷新订阅发生异常: ${err.message || err}`);
    }
  };

  // Groups handlers
  const handleAddGroup = async (group: Partial<ProxyGroupItem>) => {
    const res = await apiFetch(`${API_BASE}/groups`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(group),
    });
    if (res.ok) await fetchData();
  };

  const handleBatchImportGroups = async (text: string, replaceAll?: boolean) => {
    const res = await apiFetch(`${API_BASE}/groups/batch-import`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text, replaceAll }),
    });
    if (res.ok) await fetchData();
  };

  const handleUpdateGroup = async (id: string, updates: Partial<ProxyGroupItem>) => {
    const res = await apiFetch(`${API_BASE}/groups/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(updates),
    });
    if (res.ok) await fetchData();
  };

  const handleDeleteGroup = async (id: string) => {
    const res = await apiFetch(`${API_BASE}/groups/${id}`, { method: 'DELETE' });
    if (res.ok) await fetchData();
  };

  // Unified Rules handlers
  const handleAddRule = async (rule: Partial<UnifiedRuleItem>) => {
    const res = await apiFetch(`${API_BASE}/rules/unified`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(rule),
    });
    if (res.ok) await fetchData();
  };

  const handleImportLocalRules = async (text: string, defaultOutbound?: string) => {
    const res = await apiFetch(`${API_BASE}/rules/import-local`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text, defaultOutbound }),
    });
    if (res.ok) await fetchData();
  };

  const handleImportRemoteRules = async (text: string, defaultOutbound?: string) => {
    const res = await apiFetch(`${API_BASE}/rules/import-remote`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text, defaultOutbound }),
    });
    if (res.ok) await fetchData();
  };

  const handleBatchReplaceRules = async (text: string, defaultOutbound?: string) => {
    const res = await apiFetch(`${API_BASE}/rules/unified/batch-replace`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text, defaultOutbound }),
    });
    if (res.ok) await fetchData();
  };

  const handleUpdateRule = async (id: string, updates: Partial<UnifiedRuleItem>) => {
    const res = await apiFetch(`${API_BASE}/rules/unified/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(updates),
    });
    if (res.ok) await fetchData();
  };

  const handleDeleteRule = async (id: string) => {
    const res = await apiFetch(`${API_BASE}/rules/unified/${id}`, { method: 'DELETE' });
    if (res.ok) await fetchData();
  };

  const handleClearAllRules = async () => {
    const res = await apiFetch(`${API_BASE}/rules/unified/clear-all`, { method: 'POST' });
    if (res.ok) await fetchData();
  };

  // Templates handlers

  const handleAddTemplate = async (template: Partial<ConfigTemplate>): Promise<ConfigTemplate | undefined> => {
    const res = await apiFetch(`${API_BASE}/templates`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(template),
    });
    if (res.ok) {
      const data = await res.json();
      await fetchData();
      return data.data;
    }
    return undefined;
  };

  const handleUpdateTemplate = async (id: string, updates: Partial<ConfigTemplate>) => {
    const res = await apiFetch(`${API_BASE}/templates/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(updates),
    });
    if (res.ok) await fetchData();
  };

  const handleDeleteTemplate = async (id: string) => {
    const res = await apiFetch(`${API_BASE}/templates/${id}`, { method: 'DELETE' });
    if (res.ok) await fetchData();
  };

  const handleResetTemplate = async (id: string): Promise<ConfigTemplate> => {
    const res = await apiFetch(`${API_BASE}/templates/${id}/reset`, { method: 'POST' });
    const json = await res.json().catch(() => ({}));
    if (!res.ok || !json.success) {
      throw new Error(json.message || json.error || '恢复默认模版失败');
    }
    await fetchData();
    return json.data;
  };

  const handlePreview = async (templateId?: string, customTemplate?: string, customType?: string) => {
    const res = await apiFetch(`${API_BASE}/generate/preview`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ templateId, customTemplate, customType }),
    });
    if (!res.ok) throw new Error('Preview failed');
    const json = await res.json();
    return { nodeCount: json.nodeCount, data: json.data };
  };

  // Settings handlers
  const handleSaveSettings = async (settings: { subToken?: string }) => {
    const res = await apiFetch(`${API_BASE}/config/settings`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ settings }),
    });
    if (res.ok) await fetchData();
  };

  if (!authChecked) {
    return (
      <div className="min-h-screen bg-[#FAF8F5] flex items-center justify-center">
        <div className="text-xs text-[#8C877D] font-mono animate-pulse">正在初始化安全环境...</div>
      </div>
    );
  }

  if (authRequired && !isAuthenticated) {
    return <LoginView onLoginSuccess={handleLoginSuccess} />;
  }

  return (
    <div className="min-h-screen bg-[#FAF8F5] text-[#2D2B28] flex flex-col selection:bg-[#E8D7C7] selection:text-[#1F1E1D]">
      <Header
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        onOpenSettings={() => setShowSettings(true)}
        nodeCount={nodes.length}
        hasAuth={authRequired}
        onLogout={handleLogout}
      />

      {errorMsg && (
        <div className="bg-[#FDF2F0] border-b border-[#F2D6D3] text-[#A8483B] text-xs px-6 py-2 text-center">
          {errorMsg}
        </div>
      )}

      <main className="flex-1 p-6">
        {activeTab === 'dashboard' && (
          <Dashboard
            config={config}
            nodes={nodes}
            onNavigateTab={setActiveTab}
            onRefreshConfig={fetchData}
          />
        )}

        {activeTab === 'sources' && (
          <SourcesManager
            sources={config?.sources || []}
            onAddSource={handleAddSource}
            onUpdateSource={handleUpdateSource}
            onDeleteSource={handleDeleteSource}
            onRefreshSource={handleRefreshSource}
            onImportCustomNodes={handleImportCustomNodes}
            onDeleteCustomNode={handleDeleteCustomNode}
          />
        )}

        {activeTab === 'nodes' && (
          <NodesViewer
            nodes={nodes}
            sources={config?.sources || []}
          />
        )}


        {activeTab === 'groups' && config && (
          <GroupsManager
            groups={config.proxyGroups || []}
            sources={config.sources || []}
            nodes={nodes}
            onAddGroup={handleAddGroup}
            onUpdateGroup={handleUpdateGroup}
            onDeleteGroup={handleDeleteGroup}
            onBatchImportGroups={handleBatchImportGroups}
          />
        )}

        {activeTab === 'rules' && config && (
          <RulesManager
            proxyGroups={config.proxyGroups || []}
            rulesList={config.rulesList || []}
            onAddRule={handleAddRule}
            onImportLocalRules={handleImportLocalRules}
            onImportRemoteRules={handleImportRemoteRules}
            onBatchReplaceRules={handleBatchReplaceRules}
            onUpdateRule={handleUpdateRule}
            onDeleteRule={handleDeleteRule}
            onClearAllRules={handleClearAllRules}
          />
        )}

        {activeTab === 'templates' && config && (
          <TemplateEditor
            templates={config.templates || []}
            onAddTemplate={handleAddTemplate}
            onUpdateTemplate={handleUpdateTemplate}
            onDeleteTemplate={handleDeleteTemplate}
            onResetTemplate={handleResetTemplate}
            onPreview={handlePreview}
          />
        )}

      </main>

      {showSettings && config && (
        <SettingsModal
          config={config}
          onClose={() => setShowSettings(false)}
          onChangePassword={handleChangePassword}
        />
      )}
    </div>
  );
}

export default App;

