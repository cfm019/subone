import React from 'react';
import { Layers, RefreshCw, Settings, LogOut } from 'lucide-react';

interface HeaderProps {
  activeTab: 'dashboard' | 'sources' | 'groups' | 'rules' | 'templates';
  setActiveTab: (tab: 'dashboard' | 'sources' | 'groups' | 'rules' | 'templates') => void;
  onOpenSettings: () => void;
  nodeCount: number;
  hasAuth?: boolean;
  onLogout?: () => void;
}

export const Header: React.FC<HeaderProps> = ({
  activeTab,
  setActiveTab,
  onOpenSettings,
  nodeCount,
  hasAuth,
  onLogout,
}) => {
  const tabs = [
    { id: 'dashboard', label: '首页' },
    { id: 'sources', label: '订阅与节点' },
    { id: 'groups', label: '策略组' },
    { id: 'rules', label: '分流规则' },
    { id: 'templates', label: '配置模版' },
  ] as const;




  return (
    <header className="sticky top-0 z-30 bg-[#FAF8F5]/85 backdrop-blur-md border-b border-[#E8E4DC]/80 px-6 sm:px-8 py-2.5 flex items-center justify-between">
      {/* Brand logo */}
      <div className="flex items-center gap-3">
        <div className="flex items-center gap-2.5 cursor-pointer group" onClick={() => setActiveTab('dashboard')}>
          <div className="w-7 h-7 rounded-lg bg-[#CC785C] flex items-center justify-center text-white shadow-sm transition-transform group-hover:scale-105">
            <Layers className="w-4 h-4 stroke-[2.2]" />
          </div>
          <span className="text-[15px] font-bold tracking-tight text-[#1F1E1D]">
            sub<span className="text-[#CC785C] font-normal">one</span>
          </span>
        </div>
      </div>

      {/* Tabs navigation - clean text tabs with bottom active bar / pill */}
      <nav className="flex items-center gap-1">
        {tabs.map(tab => {
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-colors duration-150 ${isActive
                  ? 'text-[#CC785C] font-semibold bg-[#CC785C]/10'
                  : 'text-[#69655E] hover:text-[#1F1E1D] hover:bg-[#EFEAE2]/60'
                }`}
            >
              {tab.label}
            </button>
          );
        })}
      </nav>

      {/* Right actions */}
      <div className="flex items-center gap-1.5">
        <button
          onClick={onOpenSettings}
          className="p-1.5 text-[#69655E] hover:text-[#1F1E1D] hover:bg-[#EFEAE2] rounded-lg transition-colors"
          title="设置与安全"
        >
          <Settings className="w-4 h-4" />
        </button>

        {hasAuth && onLogout && (
          <button
            onClick={onLogout}
            className="p-1.5 text-[#69655E] hover:text-[#A8483B] hover:bg-[#FDF2F0] rounded-lg transition-colors"
            title="退出登录"
          >
            <LogOut className="w-4 h-4" />
          </button>
        )}
      </div>
    </header>
  );
};

