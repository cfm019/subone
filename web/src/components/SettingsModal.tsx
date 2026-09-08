import React, { useState } from 'react';
import { KeyRound, Lock, Save, X, RefreshCw, Check, ShieldAlert } from 'lucide-react';
import { AppConfig } from '../types';

interface SettingsModalProps {
  config: AppConfig;
  onClose: () => void;
  onChangePassword?: (oldPass: string, newPass: string) => Promise<boolean>;
}

export const SettingsModal: React.FC<SettingsModalProps> = ({
  config,
  onClose,
  onChangePassword,
}) => {
  // Password modification state
  const [oldPassword, setOldPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [pwdMsg, setPwdMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [isUpdatingPwd, setIsUpdatingPwd] = useState(false);

  const handleUpdatePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newPassword) {
      setPwdMsg({ type: 'error', text: '新密码不能为空' });
      return;
    }
    if (newPassword !== confirmPassword) {
      setPwdMsg({ type: 'error', text: '两次输入的新密码不一致' });
      return;
    }

    setIsUpdatingPwd(true);
    setPwdMsg(null);
    try {
      if (onChangePassword) {
        const ok = await onChangePassword(oldPassword, newPassword);
        if (ok) {
          setPwdMsg({ type: 'success', text: '管理密码修改成功！' });
          setOldPassword('');
          setNewPassword('');
          setConfirmPassword('');
        } else {
          setPwdMsg({ type: 'error', text: '密码修改失败，请检查旧密码是否正确' });
        }
      }
    } catch (err: any) {
      setPwdMsg({ type: 'error', text: err.message || '修改密码失败' });
    } finally {
      setIsUpdatingPwd(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-xs p-4 overflow-y-auto">
      <div className="claude-panel w-full max-w-lg p-6 rounded-3xl bg-white border border-[#E3DDD2] shadow-2xl space-y-6 my-8 animate-in fade-in zoom-in-95 duration-150">
        <div className="flex items-center justify-between pb-3 border-b border-[#F0ECE4]">
          <div className="flex items-center gap-2">
            <Lock className="w-5 h-5 text-[#CC785C]" />
            <h3 className="text-base font-bold text-[#1F1E1D]">管理员密码设置</h3>
          </div>
          <button onClick={onClose} className="p-1 text-[#8C877D] hover:text-[#1F1E1D] rounded-lg">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Change Admin Password */}
        <div className="space-y-4">
          <div className="flex items-center gap-2">
            <KeyRound className="w-4 h-4 text-[#CC785C]" />
            <h4 className="text-xs font-bold text-[#1F1E1D]">修改管理员登录密码</h4>
          </div>

          <p className="text-xs text-[#8C877D]">
            修改用于登录 SubOne 控制台的管理员密码。
          </p>

          {pwdMsg && (
            <div
              className={`p-2.5 rounded-xl text-xs flex items-center gap-2 ${
                pwdMsg.type === 'success'
                  ? 'bg-[#EAF2EE] border border-[#D5E5DE] text-[#367A68]'
                  : 'bg-[#FDF2F0] border border-[#F2D6D3] text-[#A8483B]'
              }`}
            >
              {pwdMsg.type === 'success' ? <Check className="w-3.5 h-3.5" /> : <ShieldAlert className="w-3.5 h-3.5" />}
              <span>{pwdMsg.text}</span>
            </div>
          )}

          <form onSubmit={handleUpdatePassword} className="space-y-3">
            {config.settings.adminPassword && (
              <div>
                <label className="block text-[11px] font-medium text-[#4A4742] mb-1">
                  原登录密码
                </label>
                <input
                  type="password"
                  placeholder="请输入当前密码"
                  value={oldPassword}
                  onChange={e => setOldPassword(e.target.value)}
                  className="w-full px-3 py-2 claude-input rounded-xl text-xs font-mono"
                />
              </div>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              <div>
                <label className="block text-[11px] font-medium text-[#4A4742] mb-1">
                  新登录密码
                </label>
                <input
                  type="password"
                  required
                  placeholder="输入新密码"
                  value={newPassword}
                  onChange={e => setNewPassword(e.target.value)}
                  className="w-full px-3 py-2 claude-input rounded-xl text-xs font-mono"
                />
              </div>
              <div>
                <label className="block text-[11px] font-medium text-[#4A4742] mb-1">
                  确认新密码
                </label>
                <input
                  type="password"
                  required
                  placeholder="再次输入新密码"
                  value={confirmPassword}
                  onChange={e => setConfirmPassword(e.target.value)}
                  className="w-full px-3 py-2 claude-input rounded-xl text-xs font-mono"
                />
              </div>
            </div>

            <div className="flex justify-end">
              <button
                type="submit"
                disabled={isUpdatingPwd || !newPassword}
                className="px-3.5 py-1.5 text-xs font-medium text-[#CC785C] bg-[#FAF0EC] hover:bg-[#F3DDD3] border border-[#F3DDD3] rounded-xl transition-colors disabled:opacity-50"
              >
                {isUpdatingPwd ? '更新中...' : '更新密码'}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
};

