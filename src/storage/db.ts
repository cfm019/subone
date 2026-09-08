import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import {
  AppConfig,
  SubscriptionSource,
  ExtractionRule,
  ConfigTemplate,
  ProxyGroupItem,
  UnifiedRuleItem,
  CountryPatternRule,
  SubscriptionProfile,
} from '../types/index.js';
import {
  INITIAL_TEMPLATES,
  INITIAL_PROXY_GROUPS,
  INITIAL_RULES_LIST,
  INITIAL_COUNTRY_RULES,
  INITIAL_PROFILES,
  DEFAULT_SINGBOX_TEMPLATE,
  DEFAULT_MIHOMO_TEMPLATE,
  DEFAULT_LOON_TEMPLATE,
} from './default-templates.js';
import { aggregateRules } from '../core/parser/rules-parser.js';


const DATA_DIR = path.resolve(process.cwd(), 'data');
const DATA_CONFIG_FILE = path.join(DATA_DIR, 'subone_data.json');
const LEGACY_DATA_CONFIG_FILE = path.join(DATA_DIR, 'config.json');
const ROOT_SERVER_CONFIG = path.resolve(process.cwd(), 'config.json');

export interface ServerConfig {
  port: number;
  adminPassword?: string;
  subToken: string;
}

export function generateRandomSubToken(): string {
  return crypto.randomBytes(16).toString('hex');
}

/**
 * Loads the Server instance configuration (Admin password, secret sub token, port)
 * Checked in order: Environment Variables -> root `config.json` -> defaults/auto-generated
 */
export function loadServerConfig(): ServerConfig {
  let port = process.env.PORT ? parseInt(process.env.PORT, 10) : 3456;
  let adminPassword = process.env.ADMIN_PASSWORD || undefined;
  let subToken = process.env.SUB_TOKEN || undefined;

  if (fs.existsSync(ROOT_SERVER_CONFIG)) {
    try {
      const data = fs.readFileSync(ROOT_SERVER_CONFIG, 'utf-8');
      const parsed = JSON.parse(data);
      if (parsed.port && !process.env.PORT) port = Number(parsed.port);
      if (parsed.adminPassword !== undefined && !process.env.ADMIN_PASSWORD) {
        adminPassword = parsed.adminPassword ? String(parsed.adminPassword) : undefined;
      }
      if (parsed.subToken && !process.env.SUB_TOKEN) subToken = String(parsed.subToken);
    } catch (err) {
      console.error('Failed to parse root config.json:', err);
    }
  }

  // If subToken not yet specified, generate a random one and persist to config.json
  if (!subToken) {
    subToken = generateRandomSubToken();
    saveServerConfig({ port, adminPassword, subToken });
  }

  return { port, adminPassword, subToken };
}

/**
 * Persists server settings to root `config.json`
 */
export function saveServerConfig(serverConfig: Partial<ServerConfig>): void {
  try {
    let current: any = {};
    if (fs.existsSync(ROOT_SERVER_CONFIG)) {
      try {
        current = JSON.parse(fs.readFileSync(ROOT_SERVER_CONFIG, 'utf-8'));
      } catch {}
    }
    const merged = { ...current, ...serverConfig };
    fs.writeFileSync(ROOT_SERVER_CONFIG, JSON.stringify(merged, null, 2), 'utf-8');
  } catch (err) {
    console.error('Failed to save root config.json:', err);
  }
}

/**
 * Loads App application data from `data/config.json` (sources, rules, templates, proxy groups)
 */
export function loadConfig(): AppConfig {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }

  const serverConfig = loadServerConfig();

  if (!fs.existsSync(DATA_CONFIG_FILE) && fs.existsSync(LEGACY_DATA_CONFIG_FILE)) {
    try {
      fs.copyFileSync(LEGACY_DATA_CONFIG_FILE, DATA_CONFIG_FILE);
      console.log(`[db] Migrated application data from ${LEGACY_DATA_CONFIG_FILE} to ${DATA_CONFIG_FILE}`);
    } catch (err) {
      console.error(`[db] Failed to copy legacy data/config.json to ${DATA_CONFIG_FILE}:`, err);
    }
  }

  if (fs.existsSync(DATA_CONFIG_FILE)) {
    try {
      const data = fs.readFileSync(DATA_CONFIG_FILE, 'utf-8');
      const parsed: any = JSON.parse(data);

      let templates: ConfigTemplate[] = [];
      if (Array.isArray(parsed.templates)) {
        templates = parsed.templates;
      } else if (parsed.templates && typeof parsed.templates === 'object') {
        templates = INITIAL_TEMPLATES;
      } else {
        templates = INITIAL_TEMPLATES;
      }

      const proxyGroups: ProxyGroupItem[] = Array.isArray(parsed.proxyGroups) && parsed.proxyGroups.length > 0
        ? parsed.proxyGroups
        : INITIAL_PROXY_GROUPS;

      let rulesList: UnifiedRuleItem[] = Array.isArray(parsed.rulesList) && parsed.rulesList.length > 0
        ? aggregateRules(parsed.rulesList)
        : INITIAL_RULES_LIST;

      // Ensure essential default rules exist if missing from existing user database
      const hasTelegramIp = rulesList.some(r => r.id === 'r-telegram-ip' || r.payload?.includes('geoip/telegram'));
      if (!hasTelegramIp) {
        const tgRuleIndex = rulesList.findIndex(r => r.id === 'r-telegram-remote');
        const telegramIpRule = INITIAL_RULES_LIST.find(r => r.id === 'r-telegram-ip');
        if (telegramIpRule) {
          if (tgRuleIndex >= 0) {
            rulesList.splice(tgRuleIndex + 1, 0, telegramIpRule);
          } else {
            rulesList.push(telegramIpRule);
          }
        }
      }

      const hasForeignDomainProxy = rulesList.some(r => r.id === 'r-proxy-domain-remote' || r.payload?.includes('geolocation-!cn'));
      if (!hasForeignDomainProxy) {
        const cnDomainIndex = rulesList.findIndex(r => r.id === 'r-cn-domain-remote');
        const foreignRule = INITIAL_RULES_LIST.find(r => r.id === 'r-proxy-domain-remote');
        if (foreignRule) {
          if (cnDomainIndex >= 0) {
            rulesList.splice(cnDomainIndex, 0, foreignRule);
          } else {
            rulesList.push(foreignRule);
          }
        }
      }

      const countryRules = Array.isArray(parsed.countryRules) && parsed.countryRules.length > 0
        ? parsed.countryRules
        : INITIAL_COUNTRY_RULES;

      const sources: SubscriptionSource[] = Array.isArray(parsed.sources) ? parsed.sources : [];
      sources.forEach(s => {
        if (s.id === 'custom' && (s.name === '手工自建' || s.name === '自建' || s.name === '零散节点')) {
          s.name = '独立节点组';
        }
      });

      let profiles: SubscriptionProfile[] = [];
      if (Array.isArray(parsed.profiles) && parsed.profiles.length > 0) {
        profiles = parsed.profiles;
      } else {
        const defaultProfile: SubscriptionProfile = {
          ...INITIAL_PROFILES[0],
          token: generateRandomSubToken(),
        };
        profiles = [defaultProfile];
      }

      const config: AppConfig = {
        sources,
        rules: Array.isArray(parsed.rules) ? parsed.rules : [],
        countryRules,
        templates,
        proxyGroups,
        rulesList,
        profiles,
        settings: {
          token: parsed.settings?.token || undefined,
          subToken: serverConfig.subToken,
          adminPassword: serverConfig.adminPassword,
          port: serverConfig.port,
        },
      };

      return config;
    } catch (err) {
      console.error('Failed to parse data/subone_data.json, initializing defaults:', err);
    }
  }

  const defaultSources: SubscriptionSource[] = [];

  const defaultRules: ExtractionRule[] = [
    {
      id: 'rule-all-active',
      name: '过滤官网/过期/回国等无效节点',
      enabled: true,
      excludeRegex: '(官网|重置|到期|剩余|流量|回国|游戏|校园|🎮)',
    }
  ];

  const defaultProfile: SubscriptionProfile = {
    ...INITIAL_PROFILES[0],
    token: generateRandomSubToken(),
  };

  const initialConfig: AppConfig = {
    sources: defaultSources,
    rules: defaultRules,
    countryRules: INITIAL_COUNTRY_RULES,
    templates: INITIAL_TEMPLATES,
    proxyGroups: INITIAL_PROXY_GROUPS,
    rulesList: INITIAL_RULES_LIST,
    profiles: [defaultProfile],
    settings: {
      subToken: serverConfig.subToken,
      adminPassword: serverConfig.adminPassword,
      port: serverConfig.port,
    }
  };

  saveConfig(initialConfig);
  return initialConfig;
}

/**
 * Saves App application data to `data/subone_data.json` (cleans up any leaked deployment secrets)
 */
export function saveConfig(config: AppConfig): void {
  try {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }

    // Clone config to persist only app data in data/subone_data.json without server credentials
    const cleanToPersist = {
      sources: config.sources,
      rules: config.rules,
      countryRules: config.countryRules,
      templates: config.templates,
      proxyGroups: config.proxyGroups,
      rulesList: config.rulesList,
      profiles: config.profiles,
      settings: {}
    };

    fs.writeFileSync(DATA_CONFIG_FILE, JSON.stringify(cleanToPersist, null, 2), 'utf-8');
  } catch (err) {
    console.error('Failed to save config to data/subone_data.json:', err);
  }
}

