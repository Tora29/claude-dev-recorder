/**
 * 監査ログサービス
 * 監査ログの記録、検索、管理機能を提供
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import { Logger } from '../utils/logger.js';
import type { AuditLogEntry, LogFilters } from '../models/AuditLogEntry.js';

/**
 * 監査ログを管理する監査ログクラス
 */
export class AuditLogger {
  private logPath: string;
  private logger: Logger;

  constructor() {
    this.logPath = path.join(process.cwd(), '.claude/docs/.audit/audit.log');
    this.logger = new Logger('AuditLogger');
  }

  /**
   * 監査ログを初期化
   * 必要なディレクトリ構造を作成
   */
  async initialize(): Promise<void> {
    const dir = path.dirname(this.logPath);
    await fs.mkdir(dir, { recursive: true });
    this.logger.info('AuditLogger initialized', { logPath: this.logPath });
  }

  /**
   * 監査エントリをログに記録
   * JSON形式でエントリを記録し、ローテーションをチェック
   * @param entry - 記録する監査ログエントリ
   */
  async log(entry: AuditLogEntry): Promise<void> {
    const logLine = JSON.stringify(entry) + '\n';

    await fs.appendFile(this.logPath, logLine, 'utf-8');

    this.logger.debug('Audit log recorded', { action: entry.action });

    // ローテーションが必要かチェック
    await this.rotateIfNeeded();
  }

  /**
   * フィルターを使用して監査ログを検索
   * @param filters - ログを検索するフィルター基準
   * @returns マッチする監査ログエントリの配列
   */
  async search(filters: LogFilters): Promise<AuditLogEntry[]> {
    try {
      const content = await fs.readFile(this.logPath, 'utf-8');
      const lines = content.split('\n').filter((line) => line.trim() !== '');

      let entries: AuditLogEntry[] = lines.map((line) => JSON.parse(line) as AuditLogEntry);

      // フィルターを適用
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
   * ログファイルが1MBを超えた場合にローテーション
   * 現在のログファイルをタイムスタンプ付きでアーカイブ
   */
  async rotateIfNeeded(): Promise<void> {
    try {
      const stats = await fs.stat(this.logPath);

      // ファイルサイズが1MBを超える場合にローテーション
      if (stats.size > 1024 * 1024) {
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const archivePath = this.logPath.replace('.log', `.${timestamp}.log`);

        await fs.rename(this.logPath, archivePath);

        this.logger.info('Audit log rotated', { archivePath });
      }
    } catch {
      // ファイルが存在しない場合は無視
    }
  }

  /**
   * 古いログファイルをクリーンアップ
   * 指定された閾値より古いアーカイブログファイルを削除
   * @param daysThreshold - ログを保持する日数
   * @returns 削除されたファイル数
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
