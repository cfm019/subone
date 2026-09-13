import React from 'react';
import {
  Layers,
  Settings,
  LogOut,
  LayoutDashboard,
  Radio,
  SlidersHorizontal,
  GitBranch,
  FileCode,
} from 'lucide-react';

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
    { id: 'dashboard', label: '首页', shortLabel: '首页', icon: LayoutDashboard },
    { id: 'sources', label: '订阅与节点', shortLabel: '订阅与节点', icon: Radio },
    { id: 'groups', label: '策略组', shortLabel: '策略组', icon: SlidersHorizontal },
    { id: 'rules', label: '分流规则', shortLabel: '分流规则', icon: GitBranch },
    { id: 'templates', label: '配置模版', shortLabel: '配置模版', icon: FileCode },
  ] as const;

  return (
    <>
      {/* Top Header Bar */}
      <header className="sticky top-0 z-30 bg-[#FAF8F5]/85 backdrop-blur-md border-b border-[#E8E4DC]/80 px-4 sm:px-8 py-2.5 flex items-center justify-between">
        {/* Brand logo */}
        <div className="flex items-center gap-3">
          <div
            className="flex items-center gap-2.5 cursor-pointer group"
            onClick={() => setActiveTab('dashboard')}
          >
            <div className="w-7 h-7 rounded-lg bg-[#CC785C] flex items-center justify-center text-white shadow-sm transition-transform group-hover:scale-105">
              <Layers className="w-4 h-4 stroke-[2.2]" />
            </div>
            <span className="text-[15px] font-bold tracking-tight text-[#1F1E1D]">
              sub<span className="text-[#CC785C] font-normal">one</span>
            </span>
          </div>
        </div>

        {/* Desktop Tabs navigation (hidden on mobile, visible on md and up) */}
        <nav className="hidden md:flex items-center gap-1">
          {tabs.map(tab => {
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`px-3 py-1.5 text-xs font-medium rounded-lg whitespace-nowrap transition-colors duration-150 cursor-pointer ${
                  isActive
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
            className="p-1.5 text-[#69655E] hover:text-[#1F1E1D] hover:bg-[#EFEAE2] rounded-lg transition-colors cursor-pointer"
            title="设置与安全"
            aria-label="设置与安全"
          >
            <Settings className="w-4 h-4" />
          </button>

          {hasAuth && onLogout && (
            <button
              onClick={onLogout}
              className="p-1.5 text-[#69655E] hover:text-[#A8483B] hover:bg-[#FDF2F0] rounded-lg transition-colors cursor-pointer"
              title="退出登录"
              aria-label="退出登录"
            >
              <LogOut className="w-4 h-4" />
            </button>
          )}
        </div>
      </header>

      {/* Mobile Bottom Navigation Bar (visible on mobile < md, fixed at bottom) */}
      <nav
        className="md:hidden fixed bottom-0 left-0 right-0 z-40 bg-[#FAF8F5]/92 backdrop-blur-md border-t border-[#E8E4DC]/80 px-2 pt-1.5 pb-[max(0.375rem,env(safe-area-inset-bottom))] shadow-lg shadow-black/5 flex items-center justify-around"
        aria-label="移动端底部导航"
      >
        {tabs.map(tab => {
          const isActive = activeTab === tab.id;
          const IconComponent = tab.icon;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex-1 flex flex-col items-center justify-center py-1 px-1 rounded-lg transition-all duration-150 cursor-pointer ${
                isActive
                  ? 'text-[#CC785C]'
                  : 'text-[#7D7971] hover:text-[#1F1E1D]'
              }`}
            >
              <div
                className={`relative flex items-center justify-center w-8 h-6 rounded-full transition-colors ${
                  isActive ? 'bg-[#CC785C]/15' : ''
                }`}
              >
                <IconComponent
                  className={`w-4 h-4 transition-transform duration-150 ${
                    isActive ? 'scale-110 stroke-[2.4]' : 'stroke-[1.8]'
                  }`}
                />
              </div>
              <span
                className={`text-[10px] leading-tight tracking-tight mt-0.5 whitespace-nowrap ${
                  isActive ? 'font-semibold text-[#CC785C]' : 'font-normal'
                }`}
              >
                {tab.shortLabel}
              </span>
            </button>
          );
        })}
      </nav>
    </>
  );
};

