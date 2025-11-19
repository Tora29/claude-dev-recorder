# IntegrityChecker クラス詳細設計

## ドキュメント情報

| 項目         | 内容                                        |
| ------------ | ------------------------------------------- |
| ファイルパス | `src/services/IntegrityChecker.ts`          |
| クラス名     | IntegrityChecker                            |
| 責務         | データ整合性チェック、自動リカバリ          |
| 依存クラス   | [DocumentManager](./02_document_manager.md) |

---

## 概要

起動時およびオンデマンドでデータ整合性をチェックし、問題があれば自動リカバリ。

---

## クラス定義

```typescript
import { Logger } from '../utils/logger.js';
import { DocumentMetadata } from '../models/Document.js';

interface IntegrityIssue {
  type: 'invalid_metadata' | 'incomplete_operation' | 'file_memory_mismatch';
  docId?: string;
  operation?: string;
  details: any;
}

interface IntegrityReport {
  issues: IntegrityIssue[];
  severity: 'low' | 'medium' | 'high' | 'critical';
}

interface RecoveryResult {
  total: number;
  recovered: number;
}

class IntegrityChecker {
  private logger: Logger;

  constructor() {
    this.logger = new Logger('IntegrityChecker');
  }

  /**
   * 整合性チェック実行
   */
  async checkIntegrity(): Promise<IntegrityReport> {
    const issues: IntegrityIssue[] = [];

    // 1. メタデータ検証
    const metadataIssues = await this.validateAllMetadata();
    issues.push(...metadataIssues);

    // 2. 未完了操作の検出
    const incompleteOps = await this.findIncompleteOperations();
    issues.push(...incompleteOps);

    // 3. ファイルとメモリの整合性
    const syncIssues = await this.checkFileMemorySync();
    issues.push(...syncIssues);

    return { issues, severity: this.calculateSeverity(issues) };
  }

  /**
   * 全メタデータを検証
   */
  private async validateAllMetadata(): Promise<IntegrityIssue[]> {
    const issues: IntegrityIssue[] = [];

    // 実装: 全ドキュメントのメタデータをチェック

    return issues;
  }

  /**
   * メタデータ検証
   */
  validateMetadata(metadata: DocumentMetadata): boolean {
    // UUID検証
    if (
      !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(metadata.id)
    ) {
      return false;
    }

    // 必須フィールドチェック
    const required = ['id', 'created', 'author', 'summary'];
    for (const field of required) {
      if (!metadata[field]) return false;
    }

    return true;
  }

  /**
   * 未完了操作の検出
   */
  private async findIncompleteOperations(): Promise<IntegrityIssue[]> {
    const issues: IntegrityIssue[] = [];

    // 実装: 未完了の操作を検出

    return issues;
  }

  /**
   * ファイルとメモリの整合性チェック
   */
  private async checkFileMemorySync(): Promise<IntegrityIssue[]> {
    const issues: IntegrityIssue[] = [];

    // 実装: ファイルシステムとメモリの差分をチェック

    return issues;
  }

  /**
   * 深刻度を計算
   */
  private calculateSeverity(issues: IntegrityIssue[]): 'low' | 'medium' | 'high' | 'critical' {
    if (issues.length === 0) return 'low';
    if (issues.length > 10) return 'critical';
    if (issues.length > 5) return 'high';
    return 'medium';
  }

  /**
   * 自動リカバリ
   */
  async recover(issues: IntegrityIssue[]): Promise<RecoveryResult> {
    let recovered = 0;

    for (const issue of issues) {
      try {
        switch (issue.type) {
          case 'invalid_metadata':
            await this.fixMetadata(issue.docId!);
            break;
          case 'incomplete_operation':
            await this.completeOperation(issue.operation!);
            break;
          case 'file_memory_mismatch':
            await this.syncFileToMemory(issue.docId!);
            break;
        }
        recovered++;
      } catch (error) {
        this.logger.error('Recovery failed', { issue, error });
      }
    }

    return { total: issues.length, recovered };
  }

  /**
   * メタデータを修正
   */
  private async fixMetadata(docId: string): Promise<void> {
    // 実装: メタデータを修正
    this.logger.info('Fixing metadata', { docId });
  }

  /**
   * 未完了操作を完了
   */
  private async completeOperation(operation: string): Promise<void> {
    // 実装: 未完了操作を完了
    this.logger.info('Completing operation', { operation });
  }

  /**
   * ファイルをメモリに同期
   */
  private async syncFileToMemory(docId: string): Promise<void> {
    // 実装: ファイルをメモリに同期
    this.logger.info('Syncing file to memory', { docId });
  }
}
```

---

## メソッド詳細

| メソッド                     | 引数        | 戻り値                      | 説明                             |
| ---------------------------- | ----------- | --------------------------- | -------------------------------- |
| `checkIntegrity()`           | なし        | `Promise<IntegrityReport>`  | 全整合性チェックを実行           |
| `validateAllMetadata()`      | なし        | `Promise<IntegrityIssue[]>` | 全メタデータを検証               |
| `validateMetadata()`         | `metadata`  | `boolean`                   | 単一メタデータを検証             |
| `findIncompleteOperations()` | なし        | `Promise<IntegrityIssue[]>` | 未完了操作を検出                 |
| `checkFileMemorySync()`      | なし        | `Promise<IntegrityIssue[]>` | ファイルとメモリの整合性チェック |
| `calculateSeverity()`        | `issues`    | `string`                    | 深刻度を計算                     |
| `recover()`                  | `issues`    | `Promise<RecoveryResult>`   | 問題を自動修復                   |
| `fixMetadata()`              | `docId`     | `Promise<void>`             | メタデータを修正                 |
| `completeOperation()`        | `operation` | `Promise<void>`             | 未完了操作を完了                 |
| `syncFileToMemory()`         | `docId`     | `Promise<void>`             | ファイルをメモリに同期           |

---

## 関連クラス

- [DocumentManager](./02_document_manager.md) - ドキュメント管理
- [MCPServer](./01_mcp_server.md) - メモリキャッシュ管理
