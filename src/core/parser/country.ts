import { CountryPatternRule } from '../../types/index.js';

export interface CountryInfo {
  code: string;
  name: string;
  emoji: string;
}

export const DEFAULT_COUNTRY_PATTERNS: CountryPatternRule[] = [
  {
    id: 'c-hk',
    code: 'HK',
    name: '香港',
    emoji: '🇭🇰',
    pattern: '(🇭🇰|香港|港|hk|hongkong|hong\\s*kong|hkg)',
    groupName: '🇭🇰 香港节点',
  },
  {
    id: 'c-tw',
    code: 'TW',
    name: '台湾',
    emoji: '🇹🇼',
    pattern: '(🇹🇼|台湾|台北|台中|高雄|tw|taiwan|tai\\s*wan|twn)',
    groupName: '🇹🇼 台湾节点',
  },
  {
    id: 'c-jp',
    code: 'JP',
    name: '日本',
    emoji: '🇯🇵',
    pattern: '(🇯🇵|日本|东京|大阪|埼玉|jp|japan|tokyo|osaka|jpn)',
    groupName: '🇯🇵 日本节点',
  },
  {
    id: 'c-sg',
    code: 'SG',
    name: '新加坡',
    emoji: '🇸🇬',
    pattern: '(🇸🇬|新加坡|狮城|sg|singapore|sgp|sin)',
    groupName: '🇸🇬 新加坡节点',
  },
  {
    id: 'c-us',
    code: 'US',
    name: '美国',
    emoji: '🇺🇸',
    pattern: '(🇺🇸|美国|波特兰|洛杉矶|硅谷|西雅图|达拉斯|芝加哥|圣何塞|凤凰城|us|usa|united\\s*states|lax|sjc|ord|dfw|sea|pdx)',
    groupName: '🇺🇸 美国节点',
  },
  {
    id: 'c-kr',
    code: 'KR',
    name: '韩国',
    emoji: '🇰🇷',
    pattern: '(🇰🇷|韩国|首尔|kr|korea|seoul|icn)',
    groupName: '🇰🇷 韩国节点',
  },
  {
    id: 'c-uk',
    code: 'UK',
    name: '英国',
    emoji: '🇬🇧',
    pattern: '(🇬🇧|英国|伦敦|uk|united\\s*kingdom|great\\s*britain|london|gb|lhr)',
    groupName: '🇬🇧 英国节点',
  },
  {
    id: 'c-de',
    code: 'DE',
    name: '德国',
    emoji: '🇩🇪',
    pattern: '(🇩🇪|德国|法兰克福|de|germany|deutschland|frankfurt|fra)',
    groupName: '🇩🇪 德国节点',
  },
  {
    id: 'c-fr',
    code: 'FR',
    name: '法国',
    emoji: '🇫🇷',
    pattern: '(🇫🇷|法国|巴黎|fr|france|paris)',
    groupName: '🇫🇷 法国节点',
  },
  {
    id: 'c-ca',
    code: 'CA',
    name: '加拿大',
    emoji: '🇨🇦',
    pattern: '(🇨🇦|加拿大|加|温哥华|多伦多|ca|canada|vancouver|toronto)',
    groupName: '🇨🇦 加拿大节点',
  },
  {
    id: 'c-au',
    code: 'AU',
    name: '澳大利亚',
    emoji: '🇦🇺',
    pattern: '(🇦🇺|澳大利亚|澳洲|悉尼|墨尔本|au|australia|sydney|melbourne)',
    groupName: '🇦🇺 澳洲节点',
  }
];

export function detectCountry(nodeName: string, customPatterns?: CountryPatternRule[]): CountryInfo | null {
  const patterns = customPatterns && customPatterns.length > 0 ? customPatterns : DEFAULT_COUNTRY_PATTERNS;
  for (const item of patterns) {
    try {
      const cleanPattern = item.pattern.trim().replace(/^\(\?i\)/i, '').replace(/\(\?i\)/gi, '');
      const reg = new RegExp(cleanPattern, 'i');
      if (reg.test(nodeName)) {
        return {
          code: item.code,
          name: item.name,
          emoji: item.emoji,
        };
      }
    } catch (e) {
      if (nodeName.toLowerCase().includes(item.code.toLowerCase()) || nodeName.includes(item.name)) {
        return {
          code: item.code,
          name: item.name,
          emoji: item.emoji,
        };
      }
    }
  }
  return null;
}
