import React, { useState } from 'react';
import { Lock, ArrowRight, ShieldCheck, AlertCircle, Layers } from 'lucide-react';

interface LoginViewProps {
  onLoginSuccess: (token: string) => void;
}

export const LoginView: React.FC<LoginViewProps> = ({ onLoginSuccess }) => {
  const [password, setPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!password.trim()) return;

    setIsLoading(true);
    setError(null);

    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password }),
      });

      const data = await res.json();
      if (res.ok && data.token) {
        onLoginSuccess(data.token);
      } else {
        setError(data.message || '密码错误，请重新输入');
      }
    } catch (err) {
      setError('网络连接异常，无法连接到服务端');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#FAF8F5] flex flex-col justify-center items-center p-4 selection:bg-[#E8D7C7] selection:text-[#1F1E1D]">
      <div className="w-full max-w-md animate-in fade-in zoom-in-95 duration-200">
        {/* Header Branding */}
        <div className="text-center mb-8 space-y-2">
          <div className="inline-flex items-center justify-center w-12 h-12 rounded-2xl bg-[#CC785C] text-white shadow-md mb-3">
            <Layers className="w-6 h-6 stroke-[2.2]" />
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-[#1F1E1D]">
            sub<span className="text-[#CC785C] font-normal">one</span>
          </h1>
          <p className="text-xs text-[#8C877D]">
            智能订阅合并与规则路由中心 · 管理控制台
          </p>
        </div>

        {/* Login Card */}
        <div className="claude-panel p-6 sm:p-8 rounded-3xl bg-white border border-[#E3DDD2] shadow-xl space-y-6">
          <div className="flex items-center gap-2.5 pb-2 border-b border-[#F0ECE4]">
            <div className="w-8 h-8 rounded-xl bg-[#FAF0EC] flex items-center justify-center text-[#CC785C]">
              <Lock className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-[#1F1E1D]">全站安全验证</h2>
              <p className="text-[11px] text-[#8C877D]">请输入管理访问密码以继续</p>
            </div>
          </div>

          {error && (
            <div className="flex items-center gap-2 px-3.5 py-2.5 rounded-xl bg-[#FDF2F0] border border-[#F2D6D3] text-[#A8483B] text-xs">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-[#4A4742] mb-1.5">
                管理员访问密码
              </label>
              <input
                type="password"
                required
                autoFocus
                placeholder="请输入配置文件中设置的 adminPassword"
                value={password}
                onChange={e => setPassword(e.target.value)}
                className="w-full px-4 py-3 claude-input rounded-xl text-sm font-mono tracking-wider focus:outline-none focus:ring-2 focus:ring-[#CC785C]/30 focus:border-[#CC785C] transition-all"
              />
            </div>

            <button
              type="submit"
              disabled={isLoading || !password.trim()}
              className="w-full flex items-center justify-center gap-2 py-3 px-4 rounded-xl text-xs font-semibold btn-claude-primary shadow-sm hover:shadow transition-all disabled:opacity-50 cursor-pointer"
            >
              <span>{isLoading ? '验证中...' : '进入控制台'}</span>
              <ArrowRight className="w-4 h-4" />
            </button>
          </form>

          <div className="pt-2 text-center">
            <span className="inline-flex items-center gap-1 text-[11px] text-[#9E9A91]">
              <ShieldCheck className="w-3.5 h-3.5 text-[#367A68]" />
              端到端高强度密钥加密与会话保护
            </span>
          </div>
        </div>

        {/* Footer info */}
        <div className="text-center mt-6 text-[11px] text-[#9E9A91]">
          <span>如需重置密码，请编辑服务器根目录 <code>config.json</code> 中的 <code>adminPassword</code></span>
        </div>
      </div>
    </div>
  );
};
