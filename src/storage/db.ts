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
  subToken?: string;
  sourceIcons?: {
    custom?: string;
    filter?: string;
    remote?: string;
  };
}

export function generateRandomSubToken(): string {
  return crypto.randomBytes(16).toString('hex');
}

/**
 * Loads the Server instance configuration (Admin password, port, optional legacy subToken)
 * Checked in order: Environment Variables -> root `config.json` -> defaults/auto-generated
 */
export function loadServerConfig(): ServerConfig {
  let port = process.env.PORT ? parseInt(process.env.PORT, 10) : 3456;
  let adminPassword = process.env.ADMIN_PASSWORD ? process.env.ADMIN_PASSWORD.trim() : undefined;
  let subToken = process.env.SUB_TOKEN ? process.env.SUB_TOKEN.trim() : undefined;
  let sourceIcons = {
    custom: '🖥️',
    filter: '✨',
    remote: '⚡️',
  };

  if (fs.existsSync(ROOT_SERVER_CONFIG)) {
    try {
      const data = fs.readFileSync(ROOT_SERVER_CONFIG, 'utf-8');
      const parsed = JSON.parse(data);
      if (parsed.port && !process.env.PORT) {
        port = Number(parsed.port);
      }
      if (parsed.adminPassword !== undefined && !process.env.ADMIN_PASSWORD) {
        const pass = String(parsed.adminPassword).trim();
        adminPassword = (pass.length > 0 && pass !== 'YOUR_ADMIN_PASSWORD_HERE') ? pass : undefined;
      }
      if (parsed.subToken && !process.env.SUB_TOKEN) {
        subToken = String(parsed.subToken).trim();
      }
      if (parsed.sourceIcons && typeof parsed.sourceIcons === 'object') {
        sourceIcons = {
          custom: parsed.sourceIcons.custom || '🖥️',
          filter: parsed.sourceIcons.filter || '✨',
          remote: parsed.sourceIcons.remote || '⚡️',
        };
      }
    } catch (err) {
      console.error('Failed to parse root config.json:', err);
    }
  } else {
    const initialConfig = {
      port,
      adminPassword: adminPassword || 'YOUR_ADMIN_PASSWORD_HERE',
      sourceIcons,
    };
    try {
      fs.writeFileSync(ROOT_SERVER_CONFIG, JSON.stringify(initialConfig, null, 2) + '\n', 'utf-8');
      console.log(`[db] Created default config.json at ${ROOT_SERVER_CONFIG}`);
    } catch (err) {
      console.error('[db] Failed to save default config.json:', err);
    }
  }

  return { port, adminPassword, subToken, sourceIcons };
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

      // Ensure standard INITIAL_TEMPLATES exist
      for (const initTpl of INITIAL_TEMPLATES) {
        if (!templates.some(t => t.id === initTpl.id)) {
          if (initTpl.id === 'tpl-singbox-gateway') {
            const singboxIdx = templates.findIndex(t => t.id === 'tpl-singbox-default');
            if (singboxIdx >= 0) {
              templates.splice(singboxIdx + 1, 0, initTpl);
            } else {
              templates.push(initTpl);
            }
          } else {
            templates.push(initTpl);
          }
        }
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
        if (s.id === 'custom' && (!s.name || s.name === '自建节点' || s.name === '独立节点组')) {
          s.name = '独立节点组';
        }
        if (s.type === 'custom' && s.nodes) {
          s.nodes.forEach(n => {
            if (!n.sourceName || n.sourceName === '自建节点') {
              n.sourceName = s.name;
            }
          });
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

      const sourceIcons = parsed.settings?.sourceIcons || serverConfig.sourceIcons || {
        custom: '🖥️',
        filter: '✨',
        remote: '⚡️',
      };

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
          sourceIcons,
        },
      };

      return config;
    } catch (err) {
      console.error('Failed to parse data/subone_data.json:', err);
      // Attempt recovery from backup if available
      const BAK_FILE = `${DATA_CONFIG_FILE}.bak`;
      if (fs.existsSync(BAK_FILE)) {
        try {
          console.log('[db] Attempting recovery from data/subone_data.json.bak...');
          const bakData = fs.readFileSync(BAK_FILE, 'utf-8');
          const parsed = JSON.parse(bakData);
          if (Array.isArray(parsed.sources) && parsed.sources.length > 0) {
            console.log(`[db] Successfully recovered ${parsed.sources.length} sources from backup.`);
            fs.copyFileSync(BAK_FILE, DATA_CONFIG_FILE);
            return loadConfig();
          }
        } catch (bakErr) {
          console.error('[db] Failed recovery from .bak file:', bakErr);
        }
      }
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

    // Create a rotating backup of current data before overwriting
    if (fs.existsSync(DATA_CONFIG_FILE)) {
      try {
        const stats = fs.statSync(DATA_CONFIG_FILE);
        if (stats.size > 100) {
          fs.copyFileSync(DATA_CONFIG_FILE, `${DATA_CONFIG_FILE}.bak`);
        }
      } catch {}
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
      settings: {
        sourceIcons: config.settings?.sourceIcons,
      }
    };

    fs.writeFileSync(DATA_CONFIG_FILE, JSON.stringify(cleanToPersist, null, 2), 'utf-8');
  } catch (err) {
    console.error('Failed to save config to data/subone_data.json:', err);
  }
}

