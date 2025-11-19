# Summarizer クラス詳細設計

## ドキュメント情報

| 項目         | 内容                                     |
| ------------ | ---------------------------------------- |
| ファイルパス | `src/services/Summarizer.ts`             |
| クラス名     | Summarizer                               |
| 責務         | テキスト要約（Ollama使用、Fallbackあり） |
| 依存クラス   | ConfigManager                            |

---

## クラス定義

```typescript
import fetch from 'node-fetch';
import { ConfigManager } from './ConfigManager.js';
import { Logger } from '../utils/logger.js';

export class Summarizer {
  private config: ConfigManager;
  private logger: Logger;

  constructor() {
    this.config = new ConfigManager();
    this.logger = new Logger('Summarizer');
  }

  /**
   * テキストを要約
   */
  async summarize(content: string, maxLength: number): Promise<string> {
    // Ollama使用可能かチェック
    const ollamaAvailable = await this.isOllamaAvailable();

    if (ollamaAvailable) {
      try {
        return await this.summarizeWithOllama(content, maxLength);
      } catch (error) {
        this.logger.warn('Ollama summarization failed, falling back', { error });
      }
    }

    // Fallback: キーワード抽出
    return this.fallbackSummarize(content, maxLength);
  }

  /**
   * Ollama使用可能かチェック
   */
  private async isOllamaAvailable(): Promise<boolean> {
    const endpoint = this.config.get('summarizer.ollamaEndpoint');

    try {
      const response = await fetch(`${endpoint}/api/tags`, {
        method: 'GET',
        signal: AbortSignal.timeout(2000),
      });

      return response.ok;
    } catch {
      return false;
    }
  }

  /**
   * Ollamaで要約
   */
  private async summarizeWithOllama(content: string, maxLength: number): Promise<string> {
    const endpoint = this.config.get('summarizer.ollamaEndpoint');
    const model = this.config.get('summarizer.ollamaModel');

    const prompt = `以下のテキストを${maxLength}文字以内で要約してください。重要なポイントのみを簡潔にまとめてください。\n\n${content}`;

    const response = await fetch(`${endpoint}/api/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model,
        prompt,
        stream: false,
        options: {
          temperature: 0.3,
          num_predict: Math.floor(maxLength / 2), // トークン数の概算
        },
      }),
    });

    const data = await response.json();
    return data.response.trim();
  }

  /**
   * Fallback要約（AI不要）
   */
  private fallbackSummarize(content: string, maxLength: number): string {
    // 最初の段落を抽出
    const firstParagraph = content.split('\n\n')[0];

    // 最大文字数にカット
    if (firstParagraph.length <= maxLength) {
      return firstParagraph;
    }

    return firstParagraph.slice(0, maxLength - 3) + '...';
  }

  /**
   * キーポイントを抽出
   */
  async extractKeyPoints(content: string): Promise<string[]> {
    // 簡易実装: 見出しを抽出
    const lines = content.split('\n');
    const keyPoints: string[] = [];

    for (const line of lines) {
      if (line.startsWith('##')) {
        keyPoints.push(line.replace(/^#+\s*/, '').trim());
      }
    }

    return keyPoints;
  }
}
```

---

## メソッド詳細

| メソッド                | 引数                 | 戻り値              | 説明                                       |
| ----------------------- | -------------------- | ------------------- | ------------------------------------------ |
| `summarize()`           | `content, maxLength` | `Promise<string>`   | テキストを要約（Ollama優先、Fallbackあり） |
| `isOllamaAvailable()`   | なし                 | `Promise<boolean>`  | Ollama接続可否をチェック                   |
| `summarizeWithOllama()` | `content, maxLength` | `Promise<string>`   | Ollamaで要約                               |
| `fallbackSummarize()`   | `content, maxLength` | `string`            | AI不要のFallback要約                       |
| `extractKeyPoints()`    | `content`            | `Promise<string[]>` | 見出しからキーポイント抽出                 |

---

## 要約フロー

```
入力テキスト
    |
    v
Ollama接続チェック
    |
    ├─ 利用可能 → Ollamaで要約
    |               |
    |               └─ 失敗 → Fallback
    |
    └─ 利用不可 → Fallback要約
                     |
                     v
                  最初の段落抽出
                     |
                     v
                  最大文字数でカット
```

---

## 関連クラス

- [DocumentManager](./02_document_manager.md) - ドキュメント要約時に使用
- [DocumentMerger](./09_document_merger.md) - ドキュメント統合時に使用
