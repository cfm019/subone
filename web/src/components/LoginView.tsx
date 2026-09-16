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
        setError(data.message || '密码错误');
      }
    } catch {
      setError('网络连接异常，无法连接到服务端');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#FAF8F5] relative flex flex-col justify-center items-center px-4 overflow-hidden selection:bg-[#E8D7C7] selection:text-[#1F1E1D]">
      {/* Ambient background glow */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background: 'radial-gradient(ellipse 650px 420px at 50% 38%, rgba(204, 120, 92, 0.08), transparent 75%)',
        }}
      />

      <div className="w-full max-w-[360px] relative z-10">
        {/* Brand */}
        <div className="flex flex-col items-center mb-8 select-none">
          <div className="w-13 h-13 rounded-2xl bg-gradient-to-b from-[#CC785C] to-[#B8684D] flex items-center justify-center text-white shadow-lg shadow-[#CC785C]/15 mb-3.5 transition-transform hover:scale-105 duration-200">
            <Layers className="w-6 h-6 stroke-[2]" />
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-[#1F1E1D] font-mono">
            sub<span className="text-[#CC785C] font-normal">one</span>
          </h1>
        </div>

        {/* Minimal Floating Card */}
        <div className="bg-white/90 backdrop-blur-md rounded-2xl border border-[#EAE5DC] shadow-[0_10px_35px_-8px_rgba(45,43,40,0.06)] p-6 sm:p-7">
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="relative">
              <input
                type={showPassword ? 'text' : 'password'}
                required
                autoFocus
                placeholder="访问密码"
                value={password}
                onChange={e => {
                  setPassword(e.target.value);
                  if (error) setError(null);
                }}
                className="w-full h-11 pl-4 pr-11 bg-[#FAF8F5] border border-[#E3DDD2] rounded-xl text-sm text-[#1F1E1D] focus:outline-none focus:border-[#CC785C] focus:bg-white focus:ring-3 focus:ring-[#CC785C]/10 transition-all placeholder:text-[#A39E93]"
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                tabIndex={-1}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-[#9E9A91] hover:text-[#1F1E1D] transition-colors p-1 cursor-pointer rounded-md hover:bg-[#F3EFEA]"
              >
                {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>

            {error && (
              <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-[#FDF2F0] border border-[#F2D6D3] text-[#A8483B] text-xs">
                <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                <span>{error}</span>
              </div>
            )}

            <button
              type="submit"
              disabled={isLoading || !password.trim()}
              className="w-full h-11 flex items-center justify-center gap-2 rounded-xl text-sm font-medium btn-claude-primary shadow-xs transition-all disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
            >
              {isLoading ? (
                <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              ) : (
                <>
                  <span>进入</span>
                  <ArrowRight className="w-4 h-4 stroke-[2]" />
                </>
              )}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
};
