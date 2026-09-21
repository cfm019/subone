import express from 'express';
import crypto from 'crypto';
import { getAppConfig } from '../context.js';

export const activeSessions = new Map<string, { createdAt: number }>();
export const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

export function isValidSession(token?: string): boolean {
  if (!token) return false;
  const session = activeSessions.get(token);
  if (!session) return false;
  if (Date.now() - session.createdAt > SESSION_TTL_MS) {
    activeSessions.delete(token);
    return false;
  }
  return true;
}

export function createSession(): string {
  const sessionToken = `sess_${crypto.randomBytes(24).toString('hex')}`;
  activeSessions.set(sessionToken, { createdAt: Date.now() });
  return sessionToken;
}

export function destroySession(token: string): void {
  activeSessions.delete(token);
}

export function extractBearerToken(req: express.Request): string | undefined {
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    return authHeader.substring(7).trim();
  }
  if (req.headers['x-auth-token'] && typeof req.headers['x-auth-token'] === 'string') {
    return req.headers['x-auth-token'];
  }
  return undefined;
}

export function requireAuth(req: express.Request, res: express.Response, next: express.NextFunction) {
  const appConfig = getAppConfig();
  if (!appConfig.settings.adminPassword) {
    return next();
  }
  const token = extractBearerToken(req);
  if (isValidSession(token)) {
    return next();
  }
  return res.status(401).json({ success: false, message: '请先登录管理控制台' });
}
