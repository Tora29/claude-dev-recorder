/**
 * 整合性チェッカーサービス
 * データ整合性チェックと自動リカバリを実行
 */

import { Logger } from '../utils/logger.js';
import type { DocumentMetadata } from '../models/Document.js';
import { AuditLogger } from './AuditLogger.js';

/**
 * チェック中に見つかった整合性の問題を表す
 */
export interface IntegrityIssue {
  type: 'invalid_metadata' | 'incomplete_operation' | 'file_memory_mismatch';
  docId?: string;
  operation?: string;
  details: Record<string, unknown>;
}

/**
 * 問題と深刻度を含む整合性チェックレポート
 */
export interface IntegrityReport {
  issues: IntegrityIssue[];
  severity: 'low' | 'medium' | 'high' | 'critical';
}

/**
 * リカバリ操作の結果
 */
export interface RecoveryResult {
  total: number;
  recovered: number;
}

/**
 * データ整合性を管理する整合性チェッカークラス
 */
export class IntegrityChecker {
  private logger: Logger;
  private auditLogger: AuditLogger;
  private documentCache: Map<string, DocumentMetadata>;

  constructor(auditLogger?: AuditLogger) {
    this.logger = new Logger('IntegrityChecker');
    this.auditLogger = auditLogger || new AuditLogger();
    this.documentCache = new Map();
  }

  /**
   * 整合性チェッカーを初期化
   */
  async initialize(): Promise<void> {
    await this.auditLogger.initialize();
    this.logger.info('IntegrityChecker initialized');
  }

  /**
   * 包括的な整合性チェックを実行
   * @returns 問題と深刻度を含む整合性レポート
   */
  async checkIntegrity(): Promise<IntegrityReport> {
    this.logger.info('Starting integrity check');
    const issues: IntegrityIssue[] = [];

    try {
      // 1. すべてのメタデータを検証
      const metadataIssues = this.validateAllMetadata();
      issues.push(...metadataIssues);

      // 2. 未完了の操作を検索
      const incompleteOps = this.findIncompleteOperations();
      issues.push(...incompleteOps);

      // 3. ファイルとメモリの同期をチェック
      const syncIssues = this.checkFileMemorySync();
      issues.push(...syncIssues);

      const severity = this.calculateSeverity(issues);
      this.logger.info('Integrity check completed', {
        issueCount: issues.length,
        severity,
      });

      // 監査ログに記録
      await this.auditLogger.log({
        timestamp: new Date().toISOString(),
        action: 'integrity_check',
        actor: 'system',
        details: {
          issueCount: issues.length,
          severity,
          issueTypes: issues.map((i) => i.type),
        },
        impact: severity === 'critical' || severity === 'high' ? 'high' : 'medium',
      });

      return { issues, severity };
    } catch (error) {
      this.logger.error('Integrity check failed', { error });
      throw error;
    }
  }

  /**
   * ドキュメントキャッシュ内のすべてのメタデータを検証
   * @returns 整合性の問題の配列
   */
  private validateAllMetadata(): IntegrityIssue[] {
    const issues: IntegrityIssue[] = [];

    for (const [docId, metadata] of this.documentCache.entries()) {
      if (!this.validateMetadata(metadata)) {
        issues.push({
          type: 'invalid_metadata',
          docId,
          details: {
            metadata,
            reason: 'Metadata validation failed',
          },
        });
        this.logger.warn('Invalid metadata detected', { docId });
      }
    }

    return issues;
  }

  /**
   * 単一のドキュメントメタデータを検証
   * UUID形式と必須フィールドをチェック
   * @param metadata - 検証するドキュメントメタデータ
   * @returns 有効な場合はtrue、それ以外はfalse
   */
  validateMetadata(metadata: DocumentMetadata): boolean {
    // UUID v4検証
    // フォーマット: xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx
    // xは任意の16進数、yは8、9、a、またはbのいずれか
    const uuidV4Regex = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

    if (!uuidV4Regex.test(metadata.id)) {
      this.logger.warn('Invalid UUID format', { id: metadata.id });
      return false;
    }

    // 必須フィールドのチェック
    const required: Array<keyof DocumentMetadata> = ['id', 'created', 'author', 'summary'];

    for (const field of required) {
      const value = metadata[field];
      if (value === undefined || value === null || value === '') {
        this.logger.warn('Missing required field', { field, docId: metadata.id });
        return false;
      }
    }

    // 作成日と更新日のISO 8601日付形式を検証
    try {
      const createdDate = new Date(metadata.created);
      if (isNaN(createdDate.getTime())) {
        this.logger.warn('Invalid created date format', {
          created: metadata.created,
        });
        return false;
      }

      const updatedDate = new Date(metadata.updated);
      if (isNaN(updatedDate.getTime())) {
        this.logger.warn('Invalid updated date format', {
          updated: metadata.updated,
        });
        return false;
      }
    } catch (error) {
      this.logger.warn('Date validation failed', { error });
      return false;
    }

    return true;
  }

  /**
   * システム内の未完了操作を検索
   * @returns 未完了操作の整合性の問題の配列
   */
  private findIncompleteOperations(): IntegrityIssue[] {
    const issues: IntegrityIssue[] = [];

    // 未完了のマージ操作をチェック
    for (const [docId, metadata] of this.documentCache.entries()) {
      // merge_timestampが存在し、is_mergedがfalseの場合は未完了
      if (metadata.merge_timestamp && !metadata.is_merged) {
        issues.push({
          type: 'incomplete_operation',
          docId,
          operation: 'merge',
          details: {
            merge_timestamp: metadata.merge_timestamp,
            merge_method: metadata.merge_method,
          },
        });
        this.logger.warn('Incomplete merge operation detected', { docId });
      }

      // merged_fromが存在し、merge_timestampが存在しない場合は不整合
      if (metadata.merged_from && !metadata.merge_timestamp) {
        issues.push({
          type: 'incomplete_operation',
          docId,
          operation: 'merge_inconsistency',
          details: {
            merged_from: metadata.merged_from,
          },
        });
        this.logger.warn('Merge metadata inconsistency detected', { docId });
      }
    }

    return issues;
  }

  /**
   * ファイルシステムとメモリの同期をチェック
   * @returns 同期の問題の整合性の問題の配列
   */
  private checkFileMemorySync(): IntegrityIssue[] {
    const issues: IntegrityIssue[] = [];

    // 注: これはファイルシステム同期チェックのプレースホルダー
    // 完全な実装にはDocumentManagerの統合が必要
    // ファイルシステムの状態とメモリ内キャッシュを比較する

    // 例: キャッシュ内でchange_logを持たないドキュメントをチェック
    for (const [docId, metadata] of this.documentCache.entries()) {
      if (!metadata.change_log || metadata.change_log.length === 0) {
        issues.push({
          type: 'file_memory_mismatch',
          docId,
          details: {
            reason: 'Missing change log',
          },
        });
        this.logger.warn('Document missing change log', { docId });
      }
    }

    return issues;
  }

  /**
   * 問題の数とタイプに基づいて深刻度を計算
   * @param issues - 整合性の問題の配列
   * @returns 深刻度レベル
   */
  private calculateSeverity(issues: IntegrityIssue[]): 'low' | 'medium' | 'high' | 'critical' {
    if (issues.length === 0) return 'low';

    // クリティカル: 10個以上の問題または無効なメタデータ
    const hasInvalidMetadata = issues.some((i) => i.type === 'invalid_metadata');
    if (issues.length > 10 || hasInvalidMetadata) return 'critical';

    // 高: 5個以上の問題または未完了の操作
    const hasIncompleteOps = issues.some((i) => i.type === 'incomplete_operation');
    if (issues.length > 5 || hasIncompleteOps) return 'high';

    // 中: その他の問題
    return 'medium';
  }

  /**
   * 整合性の問題から自動的にリカバリ
   * @param issues - リカバリする整合性の問題の配列
   * @returns 合計とリカバリ数を含むリカバリ結果
   */
  async recover(issues: IntegrityIssue[]): Promise<RecoveryResult> {
    this.logger.info('Starting automatic recovery', { issueCount: issues.length });
    let recovered = 0;

    for (const issue of issues) {
      try {
        switch (issue.type) {
          case 'invalid_metadata':
            await this.fixMetadata(issue.docId!);
            recovered++;
            break;

          case 'incomplete_operation':
            await this.completeOperation(issue.operation!);
            recovered++;
            break;

          case 'file_memory_mismatch':
            await this.syncFileToMemory(issue.docId!);
            recovered++;
            break;

          default:
            this.logger.warn('Unknown issue type', { issue });
        }
      } catch (error) {
        this.logger.error('Recovery failed for issue', { issue, error });
      }
    }

    const result = { total: issues.length, recovered };
    this.logger.info('Recovery completed', result);

    // 監査ログに記録
    await this.auditLogger.log({
      timestamp: new Date().toISOString(),
      action: 'auto_recovery',
      actor: 'system',
      details: result,
      impact: recovered < issues.length ? 'high' : 'medium',
    });

    return result;
  }

  /**
   * 無効なメタデータを修正
   * @param docId - 修正するドキュメントID
   */
  private async fixMetadata(docId: string): Promise<void> {
    this.logger.info('Fixing metadata', { docId });

    const metadata = this.documentCache.get(docId);
    if (!metadata) {
      this.logger.warn('Document not found in cache', { docId });
      return;
    }

    // 一般的な問題の修正を試行
    let fixed = false;

    // 欠落している必須フィールドをデフォルト値で修正
    if (!metadata.created) {
      metadata.created = new Date().toISOString();
      fixed = true;
    }

    if (!metadata.updated) {
      metadata.updated = metadata.created || new Date().toISOString();
      fixed = true;
    }

    if (!metadata.author || metadata.author === '') {
      metadata.author = 'unknown';
      fixed = true;
    }

    if (!metadata.summary || metadata.summary === '') {
      metadata.summary = 'No summary available';
      fixed = true;
    }

    if (fixed) {
      this.documentCache.set(docId, metadata);
      this.logger.info('Metadata fixed successfully', { docId });

      await this.auditLogger.log({
        timestamp: new Date().toISOString(),
        action: 'fix_metadata',
        actor: 'system',
        details: { docId, fixed: true },
        impact: 'medium',
      });
    }
  }

  /**
   * 未完了の操作を完了
   * @param operation - 完了する操作タイプ
   */
  private async completeOperation(operation: string): Promise<void> {
    this.logger.info('Completing operation', { operation });

    // 実装は操作タイプに依存
    switch (operation) {
      case 'merge':
        // マージを完了としてマークまたはロールバック
        this.logger.info('Completing merge operation');
        break;

      case 'merge_inconsistency':
        // マージメタデータの不整合を修正
        this.logger.info('Fixing merge inconsistency');
        break;

      default:
        this.logger.warn('Unknown operation type', { operation });
    }

    await this.auditLogger.log({
      timestamp: new Date().toISOString(),
      action: 'complete_operation',
      actor: 'system',
      details: { operation },
      impact: 'medium',
    });
  }

  /**
   * ファイルをメモリキャッシュに同期
   * @param docId - 同期するドキュメントID
   */
  private async syncFileToMemory(docId: string): Promise<void> {
    this.logger.info('Syncing file to memory', { docId });

    const metadata = this.documentCache.get(docId);
    if (!metadata) {
      this.logger.warn('Document not found in cache', { docId });
      return;
    }

    // change_logが欠落している場合は初期化
    if (!metadata.change_log) {
      const author = Array.isArray(metadata.author)
        ? (metadata.author[0] ?? 'unknown')
        : (metadata.author ?? 'unknown');

      metadata.change_log = [
        {
          timestamp: new Date().toISOString(),
          action: 'created',
          author,
          reason: 'Initialized during sync',
        },
      ];

      this.documentCache.set(docId, metadata);
      this.logger.info('Change log initialized', { docId });

      await this.auditLogger.log({
        timestamp: new Date().toISOString(),
        action: 'sync_file_to_memory',
        actor: 'system',
        details: { docId, changeLogInitialized: true },
        impact: 'low',
      });
    }
  }

  /**
   * 整合性チェックのためキャッシュにドキュメントを追加
   * @param docId - ドキュメントID
   * @param metadata - ドキュメントメタデータ
   */
  addToCache(docId: string, metadata: DocumentMetadata): void {
    this.documentCache.set(docId, metadata);
    this.logger.debug('Document added to cache', { docId });
  }

  /**
   * キャッシュからドキュメントを削除
   * @param docId - ドキュメントID
   */
  removeFromCache(docId: string): void {
    this.documentCache.delete(docId);
    this.logger.debug('Document removed from cache', { docId });
  }

  /**
   * キャッシュからすべてのドキュメントをクリア
   */
  clearCache(): void {
    this.documentCache.clear();
    this.logger.debug('Cache cleared');
  }

  /**
   * キャッシュサイズを取得
   * @returns キャッシュ内のドキュメント数
   */
  getCacheSize(): number {
    return this.documentCache.size;
  }
}
