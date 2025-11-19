# SensitiveDataDetector クラス詳細設計

## ドキュメント情報

| 項目         | 内容                                    |
| ------------ | --------------------------------------- |
| ファイルパス | `src/services/SensitiveDataDetector.ts` |
| クラス名     | SensitiveDataDetector                   |
| 責務         | 機密情報検出、自動マスキング            |
| 依存クラス   | なし                                    |

---

## 概要

機密情報を自動検出してマスキング。カスタムパターンのサポート。

---

## クラス定義

```typescript
import * as fs from 'fs/promises';
import { Logger } from '../utils/logger.js';

interface SensitivePattern {
  name: string;
  regex: RegExp;
  severity: 'low' | 'medium' | 'high' | 'critical';
}

interface DetectedSensitiveData {
  pattern: string;
  matches: string[];
  severity: string;
  locations: number[]; // 文字位置
}

class SensitiveDataDetector {
  private patterns: SensitivePattern[] = [];
  private whitelist: Set<string> = new Set();
  private logger: Logger;

  constructor() {
    this.logger = new Logger('SensitiveDataDetector');
    this.loadDefaultPatterns();
  }

  /**
   * デフォルトパターンを読み込み
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
    ];
  }

  /**
   * 機密情報を検出
   */
  detect(content: string): DetectedSensitiveData[] {
    const results: DetectedSensitiveData[] = [];

    for (const pattern of this.patterns) {
      const matches = content.match(pattern.regex);

      if (matches && matches.length > 0) {
        // ホワイトリストチェック
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
   * 自動マスキング
   */
  sanitize(content: string): string {
    let sanitized = content;

    for (const pattern of this.patterns) {
      sanitized = sanitized.replace(pattern.regex, '[REDACTED]');
    }

    return sanitized;
  }

  /**
   * カスタムパターン追加
   */
  addCustomPattern(pattern: RegExp, name: string, severity: string): void {
    this.patterns.push({
      name,
      regex: pattern,
      severity: severity as any,
    });

    this.logger.info('Custom pattern added', { name });
  }

  /**
   * ホワイトリスト追加
   */
  addToWhitelist(value: string): void {
    this.whitelist.add(value);
  }

  /**
   * カスタムパターンを設定ファイルから読み込み
   */
  async loadCustomPatterns(configPath: string): Promise<void> {
    try {
      const config = JSON.parse(await fs.readFile(configPath, 'utf-8'));

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
   * マッチング位置を検出
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
```

---

## メソッド詳細

| メソッド                | 引数                      | 戻り値                    | 説明                             |
| ----------------------- | ------------------------- | ------------------------- | -------------------------------- |
| `loadDefaultPatterns()` | なし                      | `void`                    | デフォルト検出パターンを読み込み |
| `detect()`              | `content: string`         | `DetectedSensitiveData[]` | 機密情報を検出                   |
| `sanitize()`            | `content: string`         | `string`                  | 機密情報を自動マスキング         |
| `addCustomPattern()`    | `pattern, name, severity` | `void`                    | カスタムパターンを追加           |
| `addToWhitelist()`      | `value: string`           | `void`                    | ホワイトリストに追加             |
| `loadCustomPatterns()`  | `configPath`              | `Promise<void>`           | 設定ファイルからパターン読み込み |
| `findLocations()`       | `content, matches`        | `number[]`                | マッチング位置を検出             |

---

## デフォルト検出パターン

| パターン名         | 正規表現                         | 深刻度   |
| ------------------ | -------------------------------- | -------- |
| API_KEY            | `API_KEY\s*=\s*["']([^"']+)["']` | high     |
| OpenAI_Key         | `sk-[a-zA-Z0-9]{32,}`            | critical |
| GitHub_Token       | `ghp_[a-zA-Z0-9]{36}`            | critical |
| AWS_Key            | `AKIA[A-Z0-9]{16}`               | critical |
| Generic_Secret     | `SECRET\s*=\s*["']([^"']+)["']`  | high     |
| Long_Random_String | `[a-zA-Z0-9]{64,}`               | medium   |

---

## 関連クラス

- [DocumentManager](./02_document_manager.md) - ドキュメント作成時に使用
