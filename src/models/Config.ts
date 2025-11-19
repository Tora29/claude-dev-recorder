/**
 * claude-dev-recorderの設定モデル
 */

/**
 * 要約機能の設定
 */
export interface SummarizerConfig {
  /** 要約プロバイダータイプ */
  provider: 'ollama' | 'keyword';
  /** プライマリーが失敗した場合のフォールバックプロバイダー */
  fallback: 'ollama' | 'keyword';
  /** 要約の最大文字数 */
  maxLength: number;
  /** Ollamaモデル名 */
  ollamaModel: string;
  /** Ollama APIエンドポイント */
  ollamaEndpoint: string;
}

/**
 * ベクトルストアの設定
 */
export interface VectorStoreConfig {
  /** ベクトルストアプロバイダー */
  provider: 'vectra';
  /** 埋め込みモデル名 */
  embeddingModel: string;
  /** ベクトルインデックスへのパス */
  indexPath: string;
  /** 検索の類似度閾値（0.0-1.0） */
  similarityThreshold: number;
}

/**
 * ドキュメントマネージャーの設定
 */
export interface DocumentManagerConfig {
  /** ドキュメントを自動アーカイブするまでの日数 */
  autoArchiveDays: number;
  /** 保持する最大ドキュメント数 */
  maxDocuments: number;
  /** 自動クリーンアップを有効にする */
  autoCleanup: boolean;
}

/**
 * 検索設定
 */
export interface SearchConfig {
  /** 検索結果の最大数 */
  maxResults: number;
  /** 検索にアーカイブされたドキュメントを含める */
  includeArchived: boolean;
}

/**
 * Git統合設定
 */
export interface GitConfig {
  /** Git統合を有効にする */
  enabled: boolean;
  /** 変更を自動コミットする */
  autoCommit: boolean;
}

/**
 * ファイル監視設定
 */
export interface FileWatcherConfig {
  /** ファイル監視を有効にする */
  enabled: boolean;
  /** 同期間隔（秒） */
  syncIntervalSeconds: number;
  /** Gitフックの変更を監視する */
  watchGitHooks: boolean;
}

/**
 * 整合性チェッカー設定
 */
export interface IntegrityCheckerConfig {
  /** 起動時に整合性をチェックする */
  checkOnStartup: boolean;
  /** 整合性の問題から自動復旧する */
  autoRecover: boolean;
  /** メタデータ構造を検証する */
  validateMetadata: boolean;
}

/**
 * 機密データ検出設定
 */
export interface SensitiveDataConfig {
  /** 機密データ検出を有効にする */
  enabled: boolean;
  /** 機密データを自動でマスクする */
  autoMask: boolean;
  /** 機密データが検出された時にユーザーに警告する */
  warnUser: boolean;
  /** カスタムパターンファイルへのパス */
  customPatternsPath: string;
}

/**
 * ログ設定
 */
export interface LoggingConfig {
  /** ログレベル */
  level: 'error' | 'warn' | 'info' | 'debug';
  /** ログディレクトリへのパス */
  logPath: string;
}

/**
 * 完全なレコーダー設定
 */
export interface RecorderConfig {
  /** 設定バージョン */
  version: string;
  /** 要約機能の設定 */
  summarizer: SummarizerConfig;
  /** ベクトルストアの設定 */
  vectorStore: VectorStoreConfig;
  /** ドキュメントマネージャーの設定 */
  documentManager: DocumentManagerConfig;
  /** 検索設定 */
  search: SearchConfig;
  /** Git統合設定 */
  git: GitConfig;
  /** ファイル監視設定 */
  fileWatcher: FileWatcherConfig;
  /** 整合性チェッカー設定 */
  integrityChecker: IntegrityCheckerConfig;
  /** 機密データ検出設定 */
  sensitiveData: SensitiveDataConfig;
  /** ログ設定 */
  logging: LoggingConfig;
}

/**
 * 更新用の部分的な設定
 */
export type PartialRecorderConfig = Partial<RecorderConfig>;

/**
 * 設定検証エラー
 */
export interface ConfigValidationError {
  field: string;
  message: string;
  value?: unknown;
}
