import express from 'express';
import { AppConfig, ProxyNode } from '../types/index.js';
import { loadConfig, saveConfig } from '../storage/db.js';

export let appConfig: AppConfig = loadConfig();
let globalNodesCache: ProxyNode[] = [];

export function getAppConfig(): AppConfig {
  return appConfig;
}

export function setAppConfig(config: AppConfig): void {
  appConfig = config;
}

export function saveAppConfig(): void {
  saveConfig(appConfig);
}

export function getGlobalNodesCache(): ProxyNode[] {
  return globalNodesCache;
}

export function setGlobalNodesCache(nodes: ProxyNode[]): void {
  globalNodesCache = nodes;
}

export function getBaseUrl(req: express.Request): string {
  const port = process.env.PORT || appConfig.settings?.port || 3456;
  const proto = (req.headers['x-forwarded-proto'] as string) || req.protocol || 'http';
  const host = (req.headers['x-forwarded-host'] as string) || req.get('host') || `localhost:${port}`;
  return `${proto}://${host}`;
}
