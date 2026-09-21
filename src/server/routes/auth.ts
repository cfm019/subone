import express from 'express';
import crypto from 'crypto';
import { getAppConfig } from '../context.js';
import { saveServerConfig, generateRandomSubToken } from '../../storage/db.js';
import {
  activeSessions,
  isValidSession,
  createSession,
  destroySession,
  extractBearerToken,
  requireAuth,
} from '../middlewares/auth.js';

export const authRouter = express.Router();

// Public Auth Endpoints
authRouter.get('/auth/status', (req, res) => {
  const appConfig = getAppConfig();
  const hasPassword = Boolean(appConfig.settings.adminPassword);
  const token = extractBearerToken(req);
  const authenticated = !hasPassword || isValidSession(token);
  res.json({ success: true, authRequired: hasPassword, authenticated });
});

authRouter.post('/auth/login', (req, res) => {
  const { password } = req.body;
  const appConfig = getAppConfig();
  const adminPassword = appConfig.settings.adminPassword;
  if (!adminPassword) {
    const sessionToken = createSession();
    return res.json({ success: true, token: sessionToken });
  }

  if (!password || typeof password !== 'string') {
    return res.status(401).json({ success: false, message: '请输入密码' });
  }

  const a = Buffer.from(password);
  const b = Buffer.from(adminPassword);
  if (a.length === b.length && crypto.timingSafeEqual(a, b)) {
    const sessionToken = createSession();
    return res.json({ success: true, token: sessionToken });
  }

  return res.status(401).json({ success: false, message: '密码错误，请重新输入' });
});

authRouter.post('/auth/logout', (req, res) => {
  const token = extractBearerToken(req);
  if (token) destroySession(token);
  res.json({ success: true, message: '已退出登录' });
});

authRouter.post('/auth/change-password', requireAuth, (req, res) => {
  const { oldPassword, newPassword } = req.body;
  const appConfig = getAppConfig();
  if (!newPassword || typeof newPassword !== 'string' || newPassword.trim().length === 0) {
    return res.status(400).json({ success: false, message: '新密码不能为空' });
  }

  if (appConfig.settings.adminPassword) {
    if (!oldPassword || oldPassword !== appConfig.settings.adminPassword) {
      return res.status(400).json({ success: false, message: '旧密码验证失败' });
    }
  }

  appConfig.settings.adminPassword = newPassword.trim();
  saveServerConfig({ adminPassword: newPassword.trim() });
  res.json({ success: true, message: '密码修改成功' });
});

authRouter.post('/settings/regenerate-sub-token', requireAuth, (req, res) => {
  const appConfig = getAppConfig();
  const newToken = generateRandomSubToken();
  appConfig.settings.subToken = newToken;
  saveServerConfig({ subToken: newToken });
  res.json({ success: true, subToken: newToken });
});
