import React, { useState, useEffect } from 'react';
import { Header } from './components/Header';
import { Dashboard } from './components/Dashboard';
import { SourcesManager } from './components/SourcesManager';
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
  SubscriptionProfile,
} from './types';

const API_BASE = '/api';

export function App() {
  const [activeTab, setActiveTab] = useState<'dashboard' | 'sources' | 'groups' | 'rules' | 'templates'>('dashboard');

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

  const fetchConfigOnly = async () => {
    try {
      const res = await apiFetch(`${API_BASE}/config`);
      if (res.ok) {
        const cJson = await res.json();
        setConfig(cJson.data);
      }
    } catch (e: any) {
      console.error('Failed to reload config:', e);
    }
  };

  const fetchNodesOnly = async () => {
    try {
      const res = await apiFetch(`${API_BASE}/nodes`);
      if (res.ok) {
        const nJson = await res.json();
        setNodes(nJson.data || []);
      }
    } catch (e: any) {
      console.error('Failed to reload nodes:', e);
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
  const handleImportCustomNodes = async (text: string, replaceAll?: boolean, targetSourceId?: string) => {
    try {
      const res = await apiFetch(`${API_BASE}/custom-nodes/import`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text, replaceAll, sourceId: targetSourceId }),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok || (json && json.success === false)) {
        const msg = json?.message || `导入独立节点失败 (HTTP ${res.status})`;
        setErrorMsg(msg);
        throw new Error(msg);
      }

      if (json?.data) {
        const targetId = json.sourceId || targetSourceId || 'custom';
        setConfig(prev => {
          if (!prev) return prev;
          return {
            ...prev,
            sources: (prev.sources || []).map(s => {
              if (s.id === targetId) {
                return {
                  ...s,
                  nodes: json.data,
                  nodeCount: json.count ?? json.data.length,
                };
              }
              return s;
            }),
            proxyGroups: json.proxyGroups || prev.proxyGroups,
          };
        });
        // Background sync effective nodes without blocking UI
        fetchNodesOnly();
      } else {
        await fetchData();
      }
    } catch (err: any) {
      console.error('handleImportCustomNodes error:', err);
      throw err;
    }
  };

  const handleDeleteCustomNode = async (id: string) => {
    // 0ms Optimistic UI update: immediately remove from UI list & badge count
    setConfig(prev => {
      if (!prev) return prev;
      return {
        ...prev,
        sources: (prev.sources || []).map(s => {
          if (s.nodes && s.nodes.some(n => n.id === id)) {
            const nextNodes = (s.nodes || []).filter(n => n.id !== id);
            return {
              ...s,
              nodes: nextNodes,
              nodeCount: nextNodes.length,
            };
          }
          return s;
        }),
      };
    });
    setNodes(prev => (prev || []).filter(n => n.id !== id));

    try {
      const res = await apiFetch(`${API_BASE}/custom-nodes/${id}`, { method: 'DELETE' });
      if (!res.ok) {
        await fetchData();
      }
    } catch (err) {
      console.error('handleDeleteCustomNode error:', err);
      await fetchData();
    }
  };

  const handleUpdateCustomNode = async (id: string, updates: Partial<ProxyNode>) => {
    setConfig(prev => {
      if (!prev) return prev;
      return {
        ...prev,
        sources: (prev.sources || []).map(s => {
          if (s.nodes && s.nodes.some(n => n.id === id)) {
            const nextNodes = s.nodes.map(n => (n.id === id ? { ...n, ...updates } : n));
            return {
              ...s,
              nodes: nextNodes,
            };
          }
          return s;
        }),
      };
    });
    setNodes(prev => (prev || []).map(n => (n.id === id ? { ...n, ...updates } : n)));

    try {
      const res = await apiFetch(`${API_BASE}/custom-nodes/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updates),
      });
      if (!res.ok) {
        await fetchData();
      }
    } catch (err) {
      console.error('handleUpdateCustomNode error:', err);
      await fetchData();
    }
  };

  const handleAddCustomGroup = async (name: string) => {
    try {
      setErrorMsg(null);
      const res = await apiFetch(`${API_BASE}/sources`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, type: 'custom', url: '' }),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok || (json && json.success === false)) {
        const msg = json?.message || `创建节点组失败 (HTTP ${res.status})`;
        setErrorMsg(msg);
        alert(msg);
        return;
      }
      await fetchData();
    } catch (err: any) {
      console.error('handleAddCustomGroup error:', err);
      const msg = `创建节点组发生异常: ${err.message || err}`;
      setErrorMsg(msg);
      alert(msg);
    }
  };

  const handleRefreshAllSources = async () => {
    try {
      setErrorMsg(null);
      const res = await apiFetch(`${API_BASE}/sources/refresh-all`, { method: 'POST' });
      if (res.ok) {
        await fetchData();
      }
    } catch (err: any) {
      console.error('handleRefreshAllSources error:', err);
    }
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
    setConfig(prev => prev ? {
      ...prev,
      sources: (prev.sources || []).map(s => s.id === id ? { ...s, ...updates } : s),
    } : prev);

    try {
      const res = await apiFetch(`${API_BASE}/sources/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updates),
      });
      if (!res.ok) await fetchConfigOnly();
    } catch (err: any) {
      console.error('handleUpdateSource error:', err);
      await fetchConfigOnly();
    }
  };

  const handleDeleteSource = async (id: string) => {
    setConfig(prev => prev ? {
      ...prev,
      sources: (prev.sources || []).filter(s => s.id !== id),
    } : prev);

    try {
      const res = await apiFetch(`${API_BASE}/sources/${id}`, { method: 'DELETE' });
      if (!res.ok) await fetchConfigOnly();
    } catch (err: any) {
      console.error('handleDeleteSource error:', err);
      await fetchConfigOnly();
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
    if (res.ok) {
      const json = await res.json().catch(() => null);
      if (json?.data) {
        setConfig(prev => prev ? { ...prev, proxyGroups: [...(prev.proxyGroups || []), json.data] } : prev);
      } else {
        await fetchConfigOnly();
      }
    }
  };

  const handleBatchImportGroups = async (text: string, replaceAll?: boolean) => {
    const res = await apiFetch(`${API_BASE}/groups/batch-import`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text, replaceAll }),
    });
    if (res.ok) {
      const json = await res.json().catch(() => null);
      if (json?.data) {
        setConfig(prev => prev ? { ...prev, proxyGroups: json.data } : prev);
      } else {
        await fetchConfigOnly();
      }
    }
  };

  const handleUpdateGroup = async (id: string, updates: Partial<ProxyGroupItem>) => {
    // Optimistic update for instant UI feedback
    setConfig(prev => {
      if (!prev) return prev;
      return {
        ...prev,
        proxyGroups: (prev.proxyGroups || []).map(g => g.id === id ? { ...g, ...updates } : g),
      };
    });

    try {
      const res = await apiFetch(`${API_BASE}/groups/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updates),
      });
      if (res.ok) {
        const json = await res.json().catch(() => null);
        if (json?.data) {
          setConfig(prev => {
            if (!prev) return prev;
            return {
              ...prev,
              proxyGroups: (prev.proxyGroups || []).map(g => g.id === id ? json.data : g),
            };
          });
        }
      } else {
        await fetchConfigOnly();
      }
    } catch (err) {
      console.error('Failed to update group:', err);
      await fetchConfigOnly();
    }
  };

  const handleDeleteGroup = async (id: string) => {
    setConfig(prev => prev ? {
      ...prev,
      proxyGroups: (prev.proxyGroups || []).filter(g => g.id !== id),
    } : prev);

    const res = await apiFetch(`${API_BASE}/groups/${id}`, { method: 'DELETE' });
    if (!res.ok) {
      await fetchConfigOnly();
    }
  };

  // Unified Rules handlers
  const handleAddRule = async (rule: Partial<UnifiedRuleItem>) => {
    const res = await apiFetch(`${API_BASE}/rules/unified`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(rule),
    });
    if (res.ok) {
      const json = await res.json().catch(() => null);
      if (json?.data) {
        setConfig(prev => prev ? { ...prev, rulesList: [...(prev.rulesList || []), json.data] } : prev);
      } else {
        await fetchConfigOnly();
      }
    }
  };

  const handleImportLocalRules = async (text: string, defaultOutbound?: string) => {
    const res = await apiFetch(`${API_BASE}/rules/import-local`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text, defaultOutbound }),
    });
    if (res.ok) {
      const json = await res.json().catch(() => null);
      if (json?.data) {
        setConfig(prev => prev ? { ...prev, rulesList: json.data } : prev);
      } else {
        await fetchConfigOnly();
      }
    }
  };

  const handleImportRemoteRules = async (text: string, defaultOutbound?: string) => {
    const res = await apiFetch(`${API_BASE}/rules/import-remote`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text, defaultOutbound }),
    });
    if (res.ok) {
      const json = await res.json().catch(() => null);
      if (json?.data) {
        setConfig(prev => prev ? { ...prev, rulesList: json.data } : prev);
      } else {
        await fetchConfigOnly();
      }
    }
  };

  const handleBatchReplaceRules = async (text: string, defaultOutbound?: string) => {
    const res = await apiFetch(`${API_BASE}/rules/unified/batch-replace`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text, defaultOutbound }),
    });
    if (res.ok) {
      const json = await res.json().catch(() => null);
      if (json?.data) {
        setConfig(prev => {
          if (!prev) return prev;
          return {
            ...prev,
            rulesList: json.data,
            proxyGroups: json.groups || prev.proxyGroups,
          };
        });
      } else {
        await fetchConfigOnly();
      }
    }
  };

  const handleUpdateRule = async (id: string, updates: Partial<UnifiedRuleItem>) => {
    // Optimistic update for instant UI feedback
    setConfig(prev => {
      if (!prev) return prev;
      return {
        ...prev,
        rulesList: (prev.rulesList || []).map(r => r.id === id ? { ...r, ...updates } : r),
      };
    });

    try {
      const res = await apiFetch(`${API_BASE}/rules/unified/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updates),
      });
      if (res.ok) {
        const json = await res.json().catch(() => null);
        if (json?.data) {
          setConfig(prev => {
            if (!prev) return prev;
            return {
              ...prev,
              rulesList: (prev.rulesList || []).map(r => r.id === id ? json.data : r),
            };
          });
        }
      } else {
        await fetchConfigOnly();
      }
    } catch (err) {
      console.error('Failed to update rule:', err);
      await fetchConfigOnly();
    }
  };

  const handleDeleteRule = async (id: string) => {
    setConfig(prev => prev ? {
      ...prev,
      rulesList: (prev.rulesList || []).filter(r => r.id !== id),
    } : prev);

    const res = await apiFetch(`${API_BASE}/rules/unified/${id}`, { method: 'DELETE' });
    if (!res.ok) {
      await fetchConfigOnly();
    }
  };

  const handleClearAllRules = async () => {
    setConfig(prev => prev ? { ...prev, rulesList: [] } : prev);
    const res = await apiFetch(`${API_BASE}/rules/unified/clear-all`, { method: 'POST' });
    if (!res.ok) {
      await fetchConfigOnly();
    }
  };

  const handleResetDefaultRules = async () => {
    const res = await apiFetch(`${API_BASE}/rules/unified/reset`, { method: 'POST' });
    if (res.ok) {
      const json = await res.json();
      if (json.data) {
        setConfig(prev => prev ? { ...prev, rulesList: json.data } : prev);
      }
    } else {
      await fetchConfigOnly();
    }
  };

  // Templates handlers

  const handleAddTemplate = async (template: Partial<ConfigTemplate>): Promise<ConfigTemplate | undefined> => {
    const res = await apiFetch(`${API_BASE}/templates`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(template),
    });
    if (res.ok) {
      const data = await res.json().catch(() => null);
      if (data?.data) {
        setConfig(prev => prev ? { ...prev, templates: [...(prev.templates || []), data.data] } : prev);
        return data.data;
      }
      await fetchConfigOnly();
    }
    return undefined;
  };

  const handleUpdateTemplate = async (id: string, updates: Partial<ConfigTemplate>) => {
    setConfig(prev => prev ? {
      ...prev,
      templates: (prev.templates || []).map(t => t.id === id ? { ...t, ...updates } : t),
    } : prev);

    const res = await apiFetch(`${API_BASE}/templates/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(updates),
    });
    if (res.ok) {
      const json = await res.json().catch(() => null);
      if (json?.data) {
        setConfig(prev => prev ? {
          ...prev,
          templates: (prev.templates || []).map(t => t.id === id ? json.data : t),
        } : prev);
      }
    } else {
      await fetchConfigOnly();
    }
  };

  const handleDeleteTemplate = async (id: string) => {
    setConfig(prev => prev ? {
      ...prev,
      templates: (prev.templates || []).filter(t => t.id !== id),
    } : prev);

    const res = await apiFetch(`${API_BASE}/templates/${id}`, { method: 'DELETE' });
    if (!res.ok) {
      await fetchConfigOnly();
    }
  };

  const handleResetTemplate = async (id: string): Promise<ConfigTemplate> => {
    const res = await apiFetch(`${API_BASE}/templates/${id}/reset`, { method: 'POST' });
    const json = await res.json().catch(() => ({}));
    if (!res.ok || !json.success) {
      throw new Error(json.message || json.error || '恢复默认模版失败');
    }
    if (json.data) {
      setConfig(prev => prev ? {
        ...prev,
        templates: (prev.templates || []).map(t => t.id === id ? json.data : t),
      } : prev);
    }
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

  const handleUpdateProfiles = (updater: (prevProfiles: SubscriptionProfile[]) => SubscriptionProfile[]) => {
    setConfig(prev => {
      if (!prev) return prev;
      return {
        ...prev,
        profiles: updater(prev.profiles || []),
      };
    });
  };

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

      <main className="flex-1 p-4 pb-24 sm:p-6 md:pb-6">
        {activeTab === 'dashboard' && (
          <Dashboard
            config={config}
            nodes={nodes}
            onNavigateTab={setActiveTab}
            onRefreshConfig={fetchData}
            onUpdateProfiles={handleUpdateProfiles}
          />
        )}

        {activeTab === 'sources' && (
          <SourcesManager
            sources={config?.sources || []}
            onAddSource={handleAddSource}
            onAddCustomGroup={handleAddCustomGroup}
            onUpdateSource={handleUpdateSource}
            onDeleteSource={handleDeleteSource}
            onRefreshSource={handleRefreshSource}
            onRefreshAllSources={handleRefreshAllSources}
            onImportCustomNodes={handleImportCustomNodes}
            onUpdateCustomNode={handleUpdateCustomNode}
            onDeleteCustomNode={handleDeleteCustomNode}
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
            onResetDefaultRules={handleResetDefaultRules}
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

