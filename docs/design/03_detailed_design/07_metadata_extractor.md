# MetadataExtractor クラス詳細設計

## ドキュメント情報

| 項目         | 内容                                |
| ------------ | ----------------------------------- |
| ファイルパス | `src/services/MetadataExtractor.ts` |
| クラス名     | MetadataExtractor                   |
| 責務         | Git情報取得、タグ生成、ハッシュ生成 |
| 依存クラス   | なし                                |

---

## クラス定義

```typescript
import { execSync } from 'child_process';
import * as crypto from 'crypto';
import { Logger } from '../utils/logger.js';

export interface GitInfo {
  email: string;
  name: string;
  branch: string;
}

export class MetadataExtractor {
  private logger: Logger;

  constructor() {
    this.logger = new Logger('MetadataExtractor');
  }

  /**
   * Git情報を取得
   */
  async getGitInfo(): Promise<GitInfo> {
    try {
      const email = execSync('git config user.email', { encoding: 'utf-8' }).trim();
      const name = execSync('git config user.name', { encoding: 'utf-8' }).trim();
      const branch = execSync('git rev-parse --abbrev-ref HEAD', {
        encoding: 'utf-8',
      }).trim();

      return { email, name, branch };
    } catch (error) {
      this.logger.warn('Failed to get git info', { error });

      return {
        email: 'unknown@example.com',
        name: 'Unknown',
        branch: 'unknown',
      };
    }
  }

  /**
   * 変更されたファイルを検出
   */
  async detectChangedFiles(): Promise<string[]> {
    try {
      const output = execSync('git diff --name-only HEAD', {
        encoding: 'utf-8',
      });

      return output.split('\n').filter((line) => line.trim() !== '');
    } catch (error) {
      this.logger.warn('Failed to detect changed files', { error });
      return [];
    }
  }

  /**
   * タグを自動生成
   */
  async generateTags(prompt: string, files: string[]): Promise<string[]> {
    const tags = new Set<string>();

    // プロンプトからキーワード抽出
    const keywords = this.extractKeywords(prompt);
    keywords.forEach((kw) => tags.add(kw));

    // ファイルパスからタグ生成
    files.forEach((file) => {
      const parts = file.split('/');

      // ディレクトリ名をタグに
      if (parts.length > 1) {
        tags.add(parts[1]); // 例: src/auth/login.ts → "auth"
      }

      // ファイル名（拡張子なし）をタグに
      const fileName = parts[parts.length - 1];
      const baseName = fileName.split('.')[0];
      tags.add(baseName);
    });

    return Array.from(tags).slice(0, 10); // 最大10個
  }

  /**
   * プロンプトからキーワードを抽出
   */
  private extractKeywords(text: string): string[] {
    const stopWords = new Set([
      'を',
      'の',
      'に',
      'は',
      'が',
      'で',
      'と',
      'から',
      'まで',
      '実装',
      '作成',
      '追加',
      'する',
      'した',
    ]);

    const words = text
      .toLowerCase()
      .split(/\s+/)
      .filter((word) => word.length > 2 && !stopWords.has(word));

    // 出現頻度順にソート
    const freq = new Map<string, number>();
    words.forEach((word) => {
      freq.set(word, (freq.get(word) || 0) + 1);
    });

    return Array.from(freq.entries())
      .sort((a, b) => b[1] - a[1])
      .map((entry) => entry[0])
      .slice(0, 5);
  }

  /**
   * プロンプトのハッシュを生成
   */
  generatePromptHash(prompt: string): string {
    const hash = crypto.createHash('sha256');
    hash.update(prompt);
    return `sha256:${hash.digest('hex')}`;
  }
}
```

---

## メソッド詳細

| メソッド               | 引数            | 戻り値              | 説明                                               |
| ---------------------- | --------------- | ------------------- | -------------------------------------------------- |
| `getGitInfo()`         | なし            | `Promise<GitInfo>`  | Git設定から著者情報とブランチ名を取得              |
| `detectChangedFiles()` | なし            | `Promise<string[]>` | Git diffで変更ファイルを検出                       |
| `generateTags()`       | `prompt, files` | `Promise<string[]>` | プロンプトとファイルパスからタグを自動生成         |
| `extractKeywords()`    | `text`          | `string[]`          | テキストからキーワードを抽出（ストップワード除去） |
| `generatePromptHash()` | `prompt`        | `string`            | プロンプトのSHA256ハッシュを生成                   |

---

## タグ生成ロジック

### 1. プロンプトからキーワード抽出

- ストップワード（助詞、一般的な動詞）を除去
- 2文字以下の単語を除外
- 出現頻度順にソート
- 上位5個を採用

### 2. ファイルパスからタグ生成

- ディレクトリ名を抽出（例: `src/auth/login.ts` → `auth`）
- ファイル名（拡張子なし）を抽出（例: `login.ts` → `login`）

### 3. タグ数の制限

- 最大10個まで

---

## 関連クラス

- [DocumentManager](./02_document_manager.md) - メタデータ生成時に使用
