/**
 * 監査ログエントリモデル
 * 監査ログエントリの構造を定義
 */

/**
 * 監査ログエントリのインターフェース
 */
export interface AuditLogEntry {
  /** ISO 8601形式のタイムスタンプ */
  timestamp: string;
  /** アクションタイプ（例: "document_created", "merge_documents"） */
  action: string;
  /** アクションを実行した主体（例: "system", "user@example.com"） */
  actor: string;
  /** アクションに関する追加の詳細 */
  details: Record<string, unknown>;
  /** アクションの影響レベル */
  impact: 'low' | 'medium' | 'high';
}

/**
 * 監査ログ検索用のログフィルターインターフェース
 */
export interface LogFilters {
  /** 開始日でフィルター（ISO 8601形式） */
  startDate?: string;
  /** 終了日でフィルター（ISO 8601形式） */
  endDate?: string;
  /** アクションタイプでフィルター */
  action?: string;
  /** 主体でフィルター */
  actor?: string;
}
