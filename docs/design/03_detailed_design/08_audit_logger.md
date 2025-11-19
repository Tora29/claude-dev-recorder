# AuditLogger クラス詳細設計

## ドキュメント情報

| 項目         | 内容                               |
| ------------ | ---------------------------------- |
| ファイルパス | `src/services/AuditLogger.ts`      |
| クラス名     | AuditLogger                        |
| 責務         | 監査ログ記録、検索、ローテーション |
| 依存クラス   | なし                               |

---

## 概要

監査ログ記録機能を提供するクラス。全操作を `.claude/docs/.audit/audit.log` に記録。

---

## クラス定義

```typescript
import * as fs from 'fs/promises';
import * as path from 'path';
import { Logger } from '../utils/logger.js';

interface AuditLogEntry {
  timestamp: string;
  action: string;
  actor: string;
  details: any;
  impact: 'low' | 'medium' | 'high';
}

interface LogFilters {
  startDate?: string;
  endDate?: string;
  action?: string;
  actor?: string;
}

class AuditLogger {
  private logPath: string;
  private logger: Logger;

  constructor() {
    this.logPath = path.join(process.cwd(), '.claude/docs/.audit/audit.log');
    this.logger = new Logger('AuditLogger');
  }

  /**
   * 初期化
   */
  async initialize(): Promise<void> {
    const dir = path.dirname(this.logPath);
    await fs.mkdir(dir, { recursive: true });
    this.logger.info('AuditLogger initialized', { logPath: this.logPath });
  }

  /**
   * ログ記録
   */
  async log(entry: AuditLogEntry): Promise<void> {
    const logLine = JSON.stringify(entry) + '\n';

    await fs.appendFile(this.logPath, logLine, 'utf-8');

    this.logger.debug('Audit log recorded', { action: entry.action });

    // ローテーションチェック
    await this.rotateIfNeeded();
  }

  /**
   * ログ検索
   */
  async search(filters: LogFilters): Promise<AuditLogEntry[]> {
    try {
      const content = await fs.readFile(this.logPath, 'utf-8');
      const lines = content.split('\n').filter((line) => line.trim() !== '');

      let entries: AuditLogEntry[] = lines.map((line) => JSON.parse(line));

      // フィルタ適用
      if (filters.startDate) {
        entries = entries.filter((e) => e.timestamp >= filters.startDate!);
      }

      if (filters.endDate) {
        entries = entries.filter((e) => e.timestamp <= filters.endDate!);
      }

      if (filters.action) {
        entries = entries.filter((e) => e.action === filters.action);
      }

      if (filters.actor) {
        entries = entries.filter((e) => e.actor === filters.actor);
      }

      return entries;
    } catch (error) {
      this.logger.warn('Failed to search audit logs', { error });
      return [];
    }
  }

  /**
   * ログローテーション
   */
  async rotateIfNeeded(): Promise<void> {
    try {
      const stats = await fs.stat(this.logPath);

      // 1MB超過でローテーション
      if (stats.size > 1024 * 1024) {
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const archivePath = this.logPath.replace('.log', `.${timestamp}.log`);

        await fs.rename(this.logPath, archivePath);

        this.logger.info('Audit log rotated', { archivePath });
      }
    } catch (error) {
      // ファイルが存在しない場合は無視
    }
  }

  /**
   * 古いログ削除
   */
  async cleanupOldLogs(daysThreshold: number): Promise<number> {
    const dir = path.dirname(this.logPath);
    const files = await fs.readdir(dir);
    const threshold = Date.now() - daysThreshold * 24 * 60 * 60 * 1000;
    let count = 0;

    for (const file of files) {
      if (!file.startsWith('audit.') || !file.endsWith('.log')) continue;

      const filePath = path.join(dir, file);
      const stats = await fs.stat(filePath);

      if (stats.mtimeMs < threshold) {
        await fs.unlink(filePath);
        count++;
      }
    }

    this.logger.info('Old audit logs cleaned up', { count });
    return count;
  }
}
```

---

## メソッド詳細

| メソッド           | 引数                   | 戻り値                     | 説明                                      |
| ------------------ | ---------------------- | -------------------------- | ----------------------------------------- |
| `initialize()`     | なし                   | `Promise<void>`            | ディレクトリを作成                        |
| `log()`            | `entry: AuditLogEntry` | `Promise<void>`            | 操作をJSON形式で audit.log に追記         |
| `search()`         | `filters: LogFilters`  | `Promise<AuditLogEntry[]>` | 条件に合致するログエントリを検索          |
| `rotateIfNeeded()` | なし                   | `Promise<void>`            | ファイルサイズが1MB超過時にローテーション |
| `cleanupOldLogs()` | `daysThreshold`        | `Promise<number>`          | 指定日数以上経過したログを削除            |

---

## ログフォーマット

```json
{
  "timestamp": "2025-11-19T10:30:00.000Z",
  "action": "document_created",
  "actor": "user@example.com",
  "details": {
    "doc_id": "abc123",
    "files": ["src/auth/login.ts"]
  },
  "impact": "low"
}
```

---

## 関連クラス

- [MCPServer](./01_mcp_server.md) - ドキュメント操作時にログ記録
