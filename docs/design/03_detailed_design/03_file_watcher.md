# FileWatcher クラス詳細設計

## ドキュメント情報

| 項目         | 内容                                       |
| ------------ | ------------------------------------------ |
| ファイルパス | `src/services/FileWatcher.ts`              |
| クラス名     | FileWatcher                                |
| 責務         | ファイルシステム監視、メモリキャッシュ同期 |
| 依存クラス   | なし                                       |

---

## 概要

ファイルシステムの変更を監視し、他のClaude Codeインスタンスによる変更を検知してメモリキャッシュと同期。

---

## クラス定義

```typescript
import * as fs from 'fs';
import { Logger } from '../utils/logger.js';

interface SyncResult {
  added: string[];
  modified: string[];
  deleted: string[];
}

class FileWatcher {
  private watcher: fs.FSWatcher | null = null;
  private logger: Logger;
  private syncInterval: NodeJS.Timeout | null = null;

  constructor() {
    this.logger = new Logger('FileWatcher');
  }

  /**
   * 監視開始
   */
  async startWatching(
    path: string,
    callback: (event: string, filename: string) => void
  ): Promise<void> {
    this.watcher = fs.watch(path, { recursive: false }, callback);

    // 定期同期も開始
    this.syncInterval = setInterval(() => this.syncCheck(), 60000);

    this.logger.info('File watching started', { path });
  }

  /**
   * 同期チェック
   */
  private async syncCheck(): Promise<void> {
    // ファイルシステムとメモリを比較
    const result = await this.syncWithFileSystem();

    if (result.added.length > 0 || result.modified.length > 0 || result.deleted.length > 0) {
      this.logger.info('Sync check completed', result);
    }
  }

  /**
   * ファイルシステムと同期
   */
  async syncWithFileSystem(): Promise<SyncResult> {
    const result: SyncResult = {
      added: [],
      modified: [],
      deleted: [],
    };

    // ファイルシステムとメモリを比較
    // 差分があればメモリ更新

    return result;
  }

  /**
   * 監視停止
   */
  stopWatching(): void {
    if (this.watcher) {
      this.watcher.close();
      this.watcher = null;
    }

    if (this.syncInterval) {
      clearInterval(this.syncInterval);
      this.syncInterval = null;
    }

    this.logger.info('File watching stopped');
  }
}
```

---

## メソッド詳細

| メソッド               | 引数             | 戻り値                | 説明                            |
| ---------------------- | ---------------- | --------------------- | ------------------------------- |
| `startWatching()`      | `path, callback` | `Promise<void>`       | ファイルシステム監視を開始      |
| `syncCheck()`          | なし             | `Promise<void>`       | 定期的な同期チェック（1分ごと） |
| `syncWithFileSystem()` | なし             | `Promise<SyncResult>` | ファイルシステムとメモリを同期  |
| `stopWatching()`       | なし             | `void`                | 監視を停止                      |

---

## 関連クラス

- [MCPServer](./01_mcp_server.md) - メモリキャッシュ管理
