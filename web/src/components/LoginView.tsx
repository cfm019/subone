import React, { useState } from 'react';
import { Layers, ArrowRight, Eye, EyeOff, AlertCircle } from 'lucide-react';

interface LoginViewProps {
  onLoginSuccess: (token: string) => void;
}

export const LoginView: React.FC<LoginViewProps> = ({ onLoginSuccess }) => {
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
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
    <div className="min-h-screen bg-[#FAF8F5] flex flex-col justify-center items-center p-6 selection:bg-[#E8D7C7] selection:text-[#1F1E1D]">
      <div className="w-full max-w-sm space-y-7">
        {/* Brand */}
        <div className="flex flex-col items-center text-center space-y-3">
          <div className="w-12 h-12 rounded-2xl bg-[#CC785C] flex items-center justify-center text-white shadow-sm">
            <Layers className="w-6 h-6 stroke-[2.2]" />
          </div>
          <h1 className="text-xl font-bold tracking-tight text-[#1F1E1D]">
            sub<span className="text-[#CC785C] font-normal">one</span>
          </h1>
        </div>

        {/* Card */}
        <div className="p-6 sm:p-7 rounded-2xl bg-white border border-[#E3DDD2] shadow-sm space-y-5">
          {error && (
            <div className="flex items-center gap-2 px-3.5 py-2 rounded-xl bg-[#FDF2F0] border border-[#F2D6D3] text-[#A8483B] text-xs">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="relative">
              <input
                type={showPassword ? 'text' : 'password'}
                required
                autoFocus
                placeholder="输入访问密码"
                value={password}
                onChange={e => setPassword(e.target.value)}
                className="w-full pl-3.5 pr-10 py-2.5 bg-[#FAF8F5] border border-[#E3DDD2] rounded-xl text-sm text-[#1F1E1D] focus:outline-none focus:border-[#CC785C] focus:bg-white transition-all placeholder:text-[#9E9A91]"
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                tabIndex={-1}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-[#9E9A91] hover:text-[#1F1E1D] transition-colors p-0.5 cursor-pointer"
              >
                {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>

            <button
              type="submit"
              disabled={isLoading || !password.trim()}
              className="w-full flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl text-xs font-semibold btn-claude-primary shadow-xs transition-all disabled:opacity-50 cursor-pointer"
            >
              <span>{isLoading ? '登录中...' : '进入'}</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </form>
        </div>
      </div>
    </div>
  );
};
