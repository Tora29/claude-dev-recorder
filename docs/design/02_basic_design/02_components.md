# コンポーネント設計

## ドキュメント情報

| 項目           | 内容                                                                                                                                           |
| -------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| プロジェクト名 | claude-dev-recorder                                                                                                                            |
| バージョン     | 1.0.0                                                                                                                                          |
| 作成日         | 2025-11-19                                                                                                                                     |
| 最終更新日     | 2025-11-19                                                                                                                                     |
| ステータス     | Draft                                                                                                                                          |
| 関連文書       | [アーキテクチャ設計](./01_architecture.md)、[データ設計](./03_data_design.md)、[デプロイメント・セキュリティ設計](./04_deployment_security.md) |

---

## 1. パッケージ構成

```
claude-dev-recorder/
├── package.json
├── tsconfig.json
├── .npmignore
├── README.md
├── LICENSE
│
├── src/
│   ├── index.ts                    # エントリーポイント（MCP Server起動）
│   │
│   ├── mcp/
│   │   ├── server.ts               # MCPサーバー本体
│   │   ├── tools.ts                # MCPツール定義
│   │   └── types.ts                # MCP型定義
│   │
│   ├── services/
│   │   ├── DocumentManager.ts      # ドキュメント管理
│   │   ├── DocumentMerger.ts       # ドキュメント統合
│   │   ├── QualityManager.ts       # 品質管理・レビュー
│   │   ├── VectorStore.ts          # ベクトル検索（オプション）
│   │   ├── Summarizer.ts           # 要約生成
│   │   ├── MetadataExtractor.ts    # メタデータ抽出
│   │   ├── AuditLogger.ts          # 監査ログ記録
│   │   ├── FileWatcher.ts          # ファイルシステム監視
│   │   ├── IntegrityChecker.ts     # データ整合性チェック
│   │   ├── SensitiveDataDetector.ts # 機密情報検出
│   │   └── ConfigManager.ts        # 設定管理
│   │
│   ├── models/
│   │   ├── Document.ts             # ドキュメントモデル
│   │   ├── SearchResult.ts         # 検索結果モデル
│   │   └── Config.ts               # 設定モデル
│   │
│   ├── utils/
│   │   ├── logger.ts               # ロギング
│   │   ├── fileSystem.ts           # ファイル操作
│   │   ├── gitUtils.ts             # Git情報取得
│   │   └── embeddings.ts           # 埋め込みベクトル生成
│   │
│   └── setup/
│       ├── installer.ts            # セットアップ処理
│       └── validator.ts            # 環境検証
│
├── scripts/
│   ├── postinstall.js              # npm postinstallスクリプト
│   ├── preuninstall.js             # npm preuninstallスクリプト
│   └── build.js                    # ビルドスクリプト
│
├── templates/
│   ├── config.json.template        # Claude Code設定テンプレート
│   ├── recorder.config.json        # デフォルト設定
│   ├── sensitive-patterns.json     # 機密情報検出パターン
│   ├── hooks/
│   │   ├── user-prompt-submit-hook # プロンプト送信フック
│   │   └── after-tool-use-hook     # ツール使用後フック
│   ├── git-hooks/
│   │   └── post-merge              # Git post-mergeフック
│   └── .gitignore.append           # .gitignore追加内容
│
└── dist/                           # ビルド成果物（npm publish対象）
    ├── index.js
    ├── index.d.ts
    └── ...
```

---

## 2. 主要コンポーネント詳細

### 2.1 MCP Server (`src/mcp/server.ts`)

**責務:**

- Claude CodeからのMCPリクエストを受信
- ツール呼び出しをルーティング
- レスポンスを返す

**提供するツール:**

| ツール名                 | 説明                                   | パラメータ                                   |
| ------------------------ | -------------------------------------- | -------------------------------------------- |
| `search_related_docs`    | プロンプトに関連するドキュメントを検索 | `prompt: string`                             |
| `record_implementation`  | 実装内容をドキュメント化               | `files: string[], summary?: string`          |
| `preview_merge`          | 統合のプレビューを生成（実行しない）   | `threshold?: number`                         |
| `merge_similar_docs`     | 類似ドキュメントを検出して統合         | `threshold?: number, autoMerge?: boolean`    |
| `check_document_quality` | 全ドキュメントの品質をチェック         | `fix_issues?: boolean`                       |
| `get_document_history`   | ドキュメントの変更履歴を取得           | `docId: string`                              |
| `rollback_merge`         | 統合を取り消してアーカイブから復元     | `mergedDocId: string`                        |
| `manage_documents`       | ドキュメントの整理・削除               | `action: 'archive'\|'delete', docId: string` |
| `search_by_keyword`      | キーワードでドキュメント検索           | `keyword: string, tags?: string[]`           |

**インターフェース:**

```typescript
interface MCPServer {
  start(): Promise<void>;
  handleRequest(request: MCPRequest): Promise<MCPResponse>;
  registerTool(tool: MCPTool): void;
  shutdown(): Promise<void>;

  // メモリキャッシュ管理
  loadAllDocumentsIntoMemory(): Promise<void>;
  addDocumentToMemory(doc: Document): void;
  removeDocumentFromMemory(docId: string): void;
  searchInMemory(query: string): Document[];
}
```

### 2.2 DocumentManager (`src/services/DocumentManager.ts`)

**責務:**

- ドキュメントの CRUD 操作
- ドキュメントの検索・フィルタリング
- メタデータ管理

**主要メソッド:**

```typescript
class DocumentManager {
  // ドキュメント作成
  async createDocument(params: CreateDocParams): Promise<Document>;

  // ドキュメント検索
  async searchDocuments(query: SearchQuery): Promise<Document[]>;

  // ドキュメント取得
  async getDocument(id: string): Promise<Document | null>;

  // ドキュメント更新
  async updateDocument(id: string, updates: Partial<Document>): Promise<Document>;

  // ドキュメント削除
  async deleteDocument(id: string): Promise<void>;

  // アーカイブ
  async archiveDocument(id: string): Promise<void>;

  // 古いドキュメントの整理
  async cleanupOldDocuments(daysThreshold: number): Promise<number>;
}
```

### 2.3 VectorStore (`src/services/VectorStore.ts`)

**位置づけ:** 補助的な機能（メモリ内検索がメイン）

**責務:**

- 埋め込みベクトルの生成（オプション）
- 高精度な意味的類似度検索（メモリ検索の補完）
- インデックスの管理（使用する場合のみ）

**主要メソッド:**

```typescript
class VectorStore {
  // 初期化
  async initialize(indexPath: string): Promise<void>;

  // ドキュメント追加
  async addDocument(doc: Document): Promise<void>;

  // 類似検索
  async search(query: string, limit: number): Promise<SearchResult[]>;

  // ドキュメント削除
  async removeDocument(id: string): Promise<void>;

  // インデックス再構築
  async rebuildIndex(): Promise<void>;

  // 埋め込みベクトル生成
  private async embed(text: string): Promise<number[]>;
}
```

**使用ライブラリ:**

- `vectra`: ローカルベクトルデータベース
- `@xenova/transformers`: ブラウザ・Node.js対応の埋め込み生成（fallback）
- Ollama API: 高精度埋め込み生成（オプション）

### 2.4 Summarizer (`src/services/Summarizer.ts`)

**責務:**

- ドキュメントの要約生成
- キーポイント抽出
- fallback処理

**主要メソッド:**

```typescript
class Summarizer {
  // 要約生成
  async summarize(content: string, maxLength: number): Promise<string>;

  // キーポイント抽出
  async extractKeyPoints(content: string): Promise<string[]>;

  // Ollama使用可能チェック
  private async isOllamaAvailable(): Promise<boolean>;

  // Ollama要約
  private async summarizeWithOllama(content: string): Promise<string>;

  // Fallback要約（AI不要）
  private fallbackSummarize(content: string): string;
}
```

**要約戦略:**

1. **Primary**: Ollama (llama3.2:3b)
2. **Fallback**: キーワード抽出 + 冒頭500文字

### 2.5 MetadataExtractor (`src/services/MetadataExtractor.ts`)

**責務:**

- Git情報の抽出
- ファイル変更の検出
- タグ生成

**主要メソッド:**

```typescript
class MetadataExtractor {
  // Git情報取得
  async getGitInfo(): Promise<GitInfo>;

  // 変更ファイル検出
  async detectChangedFiles(): Promise<string[]>;

  // タグ自動生成
  async generateTags(content: string, files: string[]): Promise<string[]>;

  // プロンプトハッシュ生成
  generatePromptHash(prompt: string): string;
}
```

### 2.6 FileWatcher (`src/services/FileWatcher.ts`)

**責務:**

- ファイルシステムの変更を監視
- 他インスタンスの変更を検知
- メモリキャッシュとの同期

**主要メソッド:**

```typescript
class FileWatcher {
  // 監視開始
  async startWatching(path: string, callback: (event, filename) => void): Promise<void>;

  // 同期チェック
  async syncWithFileSystem(): Promise<SyncResult>;

  // 新規ファイル検出
  async detectNewFiles(): Promise<string[]>;

  // 監視停止
  stopWatching(): void;
}
```

### 2.7 IntegrityChecker (`src/services/IntegrityChecker.ts`)

**責務:**

- データ整合性の検証
- 未完了操作の検出
- 自動リカバリ

**主要メソッド:**

```typescript
class IntegrityChecker {
  // 整合性チェック実行
  async checkIntegrity(): Promise<IntegrityReport>;

  // 未完了操作の検出
  async findIncompleteOperations(): Promise<AuditLogEntry[]>;

  // メタデータ検証
  validateMetadata(metadata: DocumentMetadata): boolean;

  // 自動リカバリ
  async recover(issues: IntegrityIssue[]): Promise<RecoveryResult>;
}
```

### 2.8 SensitiveDataDetector (`src/services/SensitiveDataDetector.ts`)

**責務:**

- 機密情報の検出
- 自動マスキング
- カスタムパターン管理

**主要メソッド:**

```typescript
class SensitiveDataDetector {
  // 機密情報検出
  detect(content: string): DetectedSensitiveData[];

  // 自動マスキング
  sanitize(content: string): string;

  // カスタムパターン追加
  addCustomPattern(pattern: RegExp, name: string): void;

  // ホワイトリスト追加
  addToWhitelist(value: string): void;
}
```

**デフォルト検出パターン:**

- `API_KEY`, `SECRET`, `PASSWORD`, `TOKEN`
- OpenAI API key: `sk-[a-zA-Z0-9]{32,}`
- GitHub token: `ghp_[a-zA-Z0-9]{36}`
- AWS key: `AKIA[A-Z0-9]{16}`
- 長いランダム文字列: `[a-zA-Z0-9]{32,}`
