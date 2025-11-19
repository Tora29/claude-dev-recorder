/**
 * ドキュメントモデル定義
 * ドキュメント、メタデータ、変更ログの構造を定義
 */

/**
 * ドキュメントの変更を追跡するための変更ログエントリ
 */
export interface ChangeLogEntry {
  timestamp: string; // ISO 8601形式
  action: string; // "created" | "updated" | "merged" | "archived"
  author: string; // アクションを実行したユーザー
  reason?: string; // 変更の理由
  details?: Record<string, unknown>; // 追加の詳細情報
}

/**
 * データ設計で定義されたスキーマに従うドキュメントメタデータ
 */
export interface DocumentMetadata {
  id: string; // UUID v4
  created: string; // ISO 8601形式
  updated: string; // ISO 8601形式
  author: string | string[]; // Git user.email（マージされたドキュメントの場合は配列）
  tags: string[]; // 自動生成 + 手動タグ
  prompt_hash: string; // SHA-256ハッシュ
  related_files: string[]; // 変更されたファイルパス
  summary: string; // 1行の要約
  ultra_summary: string; // 超圧縮要約（約50文字）
  standard_summary: string; // 標準要約（約200文字）
  embedding_model: string; // 使用された埋め込みモデル
  version: string; // スキーマバージョン

  // ドキュメントマージ関連（マージされたドキュメントのみ）
  merged_from?: string[]; // ソースドキュメントIDの配列
  merge_method?: string; // "ai_unified" | "manual"
  merge_timestamp?: string; // マージ日時（ISO 8601形式）
  is_merged?: boolean; // マージフラグ
  merge_reviewed?: boolean; // レビュー済みフラグ
  merge_reviewer?: string; // レビュー担当者

  // 品質管理関連
  quality_score?: number; // 総合品質スコア（0.0-1.0）
  freshness_score?: number; // 鮮度スコア（0.0-1.0）
  completeness_score?: number; // 完全性スコア（0.0-1.0）
  reference_count?: number; // 参照回数

  // 変更履歴
  change_log?: ChangeLogEntry[]; // 変更ログエントリの配列
}

/**
 * メタデータとコンテンツを含む完全なドキュメント構造
 */
export interface Document {
  metadata: DocumentMetadata;
  content: string; // Markdownコンテンツ
  file_path: string; // ファイルシステムパス
  vector?: number[]; // 埋め込みベクトル（メモリ内のみ）
}

/**
 * 新しいドキュメントを作成するためのパラメータ
 */
export interface CreateDocParams {
  files: string[];
  prompt: string;
  summary?: string;
}
