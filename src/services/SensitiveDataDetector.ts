import * as fs from 'fs/promises';
import { Logger } from '../utils/logger.js';

/**
 * 機密データパターン定義のインターフェース
 */
interface SensitivePattern {
  name: string;
  regex: RegExp;
  severity: 'low' | 'medium' | 'high' | 'critical';
}

/**
 * 検出された機密データのインターフェース
 */
interface DetectedSensitiveData {
  pattern: string;
  matches: string[];
  severity: string;
  locations: number[]; // Character positions
}

/**
 * 機密データ検出クラス
 * コンテンツ内の機密情報を検出しマスク
 */
export class SensitiveDataDetector {
  private patterns: SensitivePattern[] = [];
  private whitelist: Set<string> = new Set();
  private logger: Logger;

  constructor() {
    this.logger = new Logger('SensitiveDataDetector');
    this.loadDefaultPatterns();
  }

  /**
   * デフォルトの検出パターンを読み込み
   */
  private loadDefaultPatterns(): void {
    this.patterns = [
      {
        name: 'API_KEY',
        regex: /API_KEY\s*=\s*["']([^"']+)["']/gi,
        severity: 'high',
      },
      {
        name: 'OpenAI_Key',
        regex: /sk-[a-zA-Z0-9]{32,}/g,
        severity: 'critical',
      },
      {
        name: 'GitHub_Token',
        regex: /ghp_[a-zA-Z0-9]{36}/g,
        severity: 'critical',
      },
      {
        name: 'AWS_Key',
        regex: /AKIA[A-Z0-9]{16}/g,
        severity: 'critical',
      },
      {
        name: 'Generic_Secret',
        regex: /SECRET\s*=\s*["']([^"']+)["']/gi,
        severity: 'high',
      },
      {
        name: 'Long_Random_String',
        regex: /[a-zA-Z0-9]{64,}/g,
        severity: 'medium',
      },
      {
        name: 'Private_Key',
        regex: /-----BEGIN\s+(RSA\s+)?PRIVATE\s+KEY-----/gi,
        severity: 'critical',
      },
      {
        name: 'JWT_Token',
        regex: /eyJ[a-zA-Z0-9_-]+\.eyJ[a-zA-Z0-9_-]+\.[a-zA-Z0-9_-]+/g,
        severity: 'high',
      },
    ];
  }

  /**
   * コンテンツ内の機密情報を検出
   * @param content - スキャンするコンテンツ
   * @returns 検出された機密データの配列
   */
  detect(content: string): DetectedSensitiveData[] {
    const results: DetectedSensitiveData[] = [];

    for (const pattern of this.patterns) {
      const matches = content.match(pattern.regex);

      if (matches && matches.length > 0) {
        // ホワイトリスト項目を除外
        const filtered = matches.filter((m) => !this.whitelist.has(m));

        if (filtered.length > 0) {
          results.push({
            pattern: pattern.name,
            matches: filtered,
            severity: pattern.severity,
            locations: this.findLocations(content, filtered),
          });
        }
      }
    }

    return results;
  }

  /**
   * 機密情報を自動的にマスク
   * @param content - サニタイズするコンテンツ
   * @returns 機密データがマスクされたサニタイズ済みコンテンツ
   */
  sanitize(content: string): string {
    let sanitized = content;

    for (const pattern of this.patterns) {
      sanitized = sanitized.replace(pattern.regex, '[REDACTED]');
    }

    return sanitized;
  }

  /**
   * カスタム検出パターンを追加
   * @param pattern - 正規表現パターン
   * @param name - パターン名
   * @param severity - 深刻度レベル
   */
  addCustomPattern(pattern: RegExp, name: string, severity: string): void {
    this.patterns.push({
      name,
      regex: pattern,
      severity: severity as 'low' | 'medium' | 'high' | 'critical',
    });

    this.logger.info('Custom pattern added', { name });
  }

  /**
   * ホワイトリストに値を追加
   * @param value - ホワイトリストに追加する値
   */
  addToWhitelist(value: string): void {
    this.whitelist.add(value);
  }

  /**
   * 設定ファイルからカスタムパターンを読み込み
   * @param configPath - 設定ファイルのパス
   */
  async loadCustomPatterns(configPath: string): Promise<void> {
    try {
      interface PatternConfig {
        patterns?: Array<{ regex: string; name: string; severity: 'low' | 'medium' | 'high' }>;
        whitelist?: string[];
      }

      const config = JSON.parse(await fs.readFile(configPath, 'utf-8')) as PatternConfig;

      if (config.patterns) {
        for (const p of config.patterns) {
          this.addCustomPattern(new RegExp(p.regex, 'gi'), p.name, p.severity);
        }
      }

      if (config.whitelist) {
        for (const w of config.whitelist) {
          this.addToWhitelist(w);
        }
      }

      this.logger.info('Custom patterns loaded', {
        patterns: config.patterns?.length || 0,
        whitelist: config.whitelist?.length || 0,
      });
    } catch (error) {
      this.logger.warn('Failed to load custom patterns', { error });
    }
  }

  /**
   * コンテンツ内のマッチの文字位置を検索
   * @param content - 検索するコンテンツ
   * @param matches - 検索する文字列
   * @returns 文字位置の配列
   */
  private findLocations(content: string, matches: string[]): number[] {
    const locations: number[] = [];

    for (const match of matches) {
      const index = content.indexOf(match);
      if (index !== -1) {
        locations.push(index);
      }
    }

    return locations;
  }
}
