# 詳細設計書 - インデックス

## ドキュメント情報

| 項目           | 内容                                   |
| -------------- | -------------------------------------- |
| プロジェクト名 | claude-dev-recorder                    |
| バージョン     | 1.0.0                                  |
| 作成日         | 2025-11-19                             |
| 最終更新日     | 2025-11-19                             |
| ステータス     | Draft                                  |
| 関連文書       | 01_requirements.md, 02_basic_design.md |

---

## 目次

### 1. クラス詳細設計

1. [MCPServer](./01_mcp_server.md) - MCPサーバー実装
2. [DocumentManager](./02_document_manager.md) - ドキュメント管理
3. [FileWatcher](./03_file_watcher.md) - ファイル監視
4. [IntegrityChecker](./04_integrity_checker.md) - データ整合性チェック
5. [SensitiveDataDetector](./05_sensitive_data_detector.md) - 機密情報検出
6. [Summarizer](./06_summarizer.md) - テキスト要約
7. [MetadataExtractor](./07_metadata_extractor.md) - メタデータ抽出
8. [AuditLogger](./08_audit_logger.md) - 監査ログ
9. [DocumentMerger](./09_document_merger.md) - ドキュメント統合
10. [QualityManager](./10_quality_manager.md) - 品質管理

### 2-11. その他設計ドキュメント

- [シーケンス図](#2-シーケンス図)
- [状態遷移図](#3-状態遷移図)
- [データフロー詳細](#4-データフロー詳細)
- [API詳細仕様](#5-api詳細仕様)
- [エラーコード一覧](#6-エラーコード一覧)
- [設定パラメータ詳細](#7-設定パラメータ詳細)
- [実装ガイドライン](#8-実装ガイドライン)
- [デプロイメント手順](#9-デプロイメント手順)
- [保守・運用](#10-保守運用)
- [改訂履歴](#11-改訂履歴)

---

## 実装推奨順序

依存関係を考慮した実装順序は以下の通りです：

### フェーズ1: 基盤コンポーネント（Week 1-2）

1. **Logger** (utils/logger.ts)
   - 全コンポーネントから利用される
   - 最優先で実装

2. **MetadataExtractor** ([詳細](./07_metadata_extractor.md))
   - Git情報取得、タグ生成
   - DocumentManagerの依存コンポーネント

3. **Summarizer** ([詳細](./06_summarizer.md))
   - テキスト要約機能
   - DocumentManagerの依存コンポーネント

4. **SensitiveDataDetector** ([詳細](./05_sensitive_data_detector.md))
   - 機密情報検出
   - DocumentManager作成時に使用

### フェーズ2: コア機能（Week 2-3）

5. **DocumentManager** ([詳細](./02_document_manager.md))
   - ドキュメント作成・管理の中核
   - MetadataExtractor, Summarizerに依存

6. **VectorStore** (optional)
   - ベクトル検索機能
   - DocumentManagerと連携

7. **AuditLogger** ([詳細](./08_audit_logger.md))
   - 監査ログ記録
   - DocumentManager操作時に使用

### フェーズ3: MCP統合（Week 3-4）

8. **MCPServer** ([詳細](./01_mcp_server.md))
   - MCPツールの実装
   - DocumentManager, VectorStoreに依存
   - メモリキャッシュ機能を含む

9. **FileWatcher** ([詳細](./03_file_watcher.md))
   - ファイルシステム監視
   - MCPServerのメモリキャッシュ同期に使用

### フェーズ4: 高度な機能（Week 4-5）

10. **DocumentMerger** ([詳細](./09_document_merger.md))
    - ドキュメント統合
    - DocumentManager, VectorStore, Summarizerに依存

11. **IntegrityChecker** ([詳細](./04_integrity_checker.md))
    - データ整合性チェック
    - 起動時およびオンデマンドで実行

12. **QualityManager** ([詳細](./10_quality_manager.md))
    - 品質管理・レビュー
    - DocumentMerger等に依存

### フェーズ5: テスト・最適化（Week 5-6）

13. **ユニットテスト**
14. **統合テスト**
15. **パフォーマンス最適化**
16. **ドキュメント整備**

---

## 2. シーケンス図

### 2.1 初回セットアップシーケンス

```
User              npm            postinstall.js       FileSystem        .claude/config.json
 |                 |                    |                   |                     |
 | npm install     |                    |                   |                     |
 |---------------->|                    |                   |                     |
 |                 |                    |                   |                     |
 |                 | execute            |                   |                     |
 |                 |------------------->|                   |                     |
 |                 |                    |                   |                     |
 |                 |                    | check .claude/    |                     |
 |                 |                    |------------------>|                     |
 |                 |                    |<------------------|                     |
 |                 |                    |     exists        |                     |
 |                 |                    |                   |                     |
 |                 |                    | read config       |                     |
 |                 |                    |-------------------------------------->|
 |                 |                    |<--------------------------------------|
 |                 |                    |            config content              |
 |                 |                    |                   |                     |
 |                 |                    | backup config     |                     |
 |                 |                    |-------------------------------------->|
 |                 |                    |                   |                     |
 |                 |                    | add mcpServers    |                     |
 |                 |                    |-------------------------------------->|
 |                 |                    |                   |                     |
 |                 |                    | copy hooks        |                     |
 |                 |                    |------------------>|                     |
 |                 |                    |                   |                     |
 |                 |                    | create dirs       |                     |
 |                 |                    |------------------>|                     |
 |                 |                    |                   |                     |
 |                 |                    | display message   |                     |
 |                 |<-------------------|                   |                     |
 |                 |                    |                   |                     |
 |<----------------|                    |                   |                     |
 |   success       |                    |                   |                     |
```

### 2.2 実装記録シーケンス

```
Claude AI     Tool(Edit)    Hook Script    MCPServer    DocumentManager    VectorStore    FileSystem
   |              |               |             |                |                |             |
   | Edit file    |               |             |                |                |             |
   |------------->|               |             |                |                |             |
   |              |               |             |                |                |             |
   |              | tool result   |             |                |                |             |
   |<-------------|               |             |                |                |             |
   |              |               |             |                |                |             |
   |              | trigger hook  |             |                |                |             |
   |              |-------------->|             |                |                |             |
   |              |               |             |                |                |             |
   |              |               | call MCP    |                |                |             |
   |              |               | record_impl |                |                |             |
   |              |               |------------>|                |                |             |
   |              |               |             |                |                |             |
   |              |               |             | createDocument |                |             |
   |              |               |             |--------------->|                |             |
   |              |               |             |                |                |             |
   |              |               |             |                | extract meta   |             |
   |              |               |             |                |--------------->|             |
   |              |               |             |                |                |             |
   |              |               |             |                | generate content|            |
   |              |               |             |                |--------------->|             |
   |              |               |             |                |                |             |
   |              |               |             |                | summarize      |             |
   |              |               |             |                |--------------->|             |
   |              |               |             |                |                |             |
   |              |               |             |                | save markdown  |             |
   |              |               |             |                |--------------------------->|
   |              |               |             |                |                |             |
   |              |               |             | addDocument    |                |             |
   |              |               |             |-------------------------------->|             |
   |              |               |             |                |                |             |
   |              |               |             |                |                | embed text  |
   |              |               |             |                |                | update index|
   |              |               |             |                |                |             |
   |              |               |             |<--------------------------------|             |
   |              |               |             |                |                |             |
   |              |               |<------------|                |                |             |
   |              |               |   response  |                |                |             |
```

### 2.3 関連ドキュメント検索シーケンス

```
User      Claude Code    Hook Script    MCPServer    VectorStore    DocumentManager    Summarizer
 |             |               |             |             |                |                |
 | type prompt |               |             |             |                |                |
 |------------>|               |             |             |                |                |
 |             |               |             |             |                |                |
 |             | submit hook   |             |             |                |                |
 |             |-------------->|             |             |                |                |
 |             |               |             |             |                |                |
 |             |               | call MCP    |             |                |                |
 |             |               | search_docs |             |                |                |
 |             |               |------------>|             |                |                |
 |             |               |             |             |                |                |
 |             |               |             | search      |                |                |
 |             |               |             |------------>|                |                |
 |             |               |             |             |                |                |
 |             |               |             |             | embed query    |                |
 |             |               |             |             | query index    |                |
 |             |               |             |             |                |                |
 |             |               |             |<------------|                |                |
 |             |               |             |  results    |                |                |
 |             |               |             |             |                |                |
 |             |               |             | getDocument |                |                |
 |             |               |             |--------------------------->|                |
 |             |               |             |<---------------------------|                |
 |             |               |             |        docs                |                |
 |             |               |             |                            |                |
 |             |               |             | summarize                  |                |
 |             |               |             |------------------------------------------>|
 |             |               |             |                            |                |
 |             |               |             |                            | check Ollama   |
 |             |               |             |                            | summarize      |
 |             |               |             |                            |                |
 |             |               |             |<------------------------------------------|
 |             |               |             |         summaries          |                |
 |             |               |             |                            |                |
 |             |               |<------------|                            |                |
 |             |               |  formatted  |                            |                |
 |             |               |             |                            |                |
 |             |<--------------|             |                            |                |
 |             | inject context|             |                            |                |
 |             |               |             |                            |                |
 |<------------|               |             |                            |                |
 | show prompt |               |             |                            |                |
 | with context|               |             |                            |                |
```

---

## 3. 状態遷移図

### 3.1 ドキュメントの状態遷移

```
                         [作成]
                           |
                           v
                    +-------------+
                    |   Active    |  <-- 通常の状態
                    | (.claude/   |
                    |   docs/)    |
                    +-------------+
                      |         |
        [30日経過]    |         |  [手動アーカイブ]
                      |         |
                      v         v
                 +------------------+
                 |    Archived      |
                 | (.claude/docs/   |
                 |   .archive/)     |
                 +------------------+
                           |
                           | [手動削除]
                           v
                     +----------+
                     | Deleted  |
                     +----------+
```

### 3.2 MCPサーバーの状態遷移

```
    [起動]
      |
      v
+-----------+
|  Starting |
+-----------+
      |
      | [初期化成功]
      v
+-----------+       [ツール呼び出し]      +-----------+
|   Ready   | <-----------------------> | Processing|
+-----------+                           +-----------+
      |                                       |
      | [シャットダウン]                      | [エラー]
      v                                       v
+-----------+                           +-----------+
| Stopping  |                           |   Error   |
+-----------+                           +-----------+
      |                                       |
      v                                       | [リカバリ]
+-----------+                                 v
|  Stopped  |                           +-----------+
+-----------+                           |   Ready   |
                                        +-----------+
```

---

## 4. データフロー詳細

### 4.1 実装記録フロー

```
┌─────────────────────────────────────────────────────────────┐
│  Input: ファイル変更イベント                                   │
│  - files: ['src/auth/login.ts', 'src/middleware/auth.ts']   │
│  - prompt: "JWT認証を実装"                                    │
└─────────────────────────────────────────────────────────────┘
                            |
                            v
┌─────────────────────────────────────────────────────────────┐
│  Step 1: メタデータ抽出                                        │
│  - Git情報取得 (author, branch)                              │
│  - タグ生成 (キーワード抽出)                                   │
│  - ハッシュ生成 (prompt_hash)                                 │
│  - UUID生成 (id)                                             │
└─────────────────────────────────────────────────────────────┘
                            |
                            v
┌─────────────────────────────────────────────────────────────┐
│  Step 2: ドキュメント本文生成                                  │
│  - プロンプト内容を含める                                      │
│  - 各ファイルの変更内容をプレビュー                             │
│  - 変更ファイル一覧を記載                                      │
└─────────────────────────────────────────────────────────────┘
                            |
                            v
┌─────────────────────────────────────────────────────────────┐
│  Step 3: 要約生成                                             │
│  - Ollama利用可能 → AI要約                                    │
│  - Ollama利用不可 → キーワード抽出 + 冒頭テキスト             │
└─────────────────────────────────────────────────────────────┘
                            |
                            v
┌─────────────────────────────────────────────────────────────┐
│  Step 4: Markdown作成                                         │
│  - YAMLフロントマター (メタデータ)                             │
│  - 本文 (Markdown)                                           │
│  - ファイル名生成: YYYY-MM-DD_UUID_summary.md                │
└─────────────────────────────────────────────────────────────┘
                            |
                            v
┌─────────────────────────────────────────────────────────────┐
│  Step 5: ファイルシステムへ保存                                │
│  - .claude/docs/ に書き込み                                   │
└─────────────────────────────────────────────────────────────┘
                            |
                            v
┌─────────────────────────────────────────────────────────────┐
│  Step 6: ベクトルインデックス更新                              │
│  - テキストを埋め込みベクトル化                                │
│  - Vectraインデックスに追加                                   │
└─────────────────────────────────────────────────────────────┘
                            |
                            v
┌─────────────────────────────────────────────────────────────┐
│  Output: Document                                            │
│  - metadata: {...}                                           │
│  - content: "..."                                            │
│  - file_path: ".claude/docs/2025-11-19_abc123_jwt-auth.md"  │
└─────────────────────────────────────────────────────────────┘
```

---

## 5. API詳細仕様

### 5.1 MCP Tool: search_related_docs

#### リクエストスキーマ

```json
{
  "name": "search_related_docs",
  "arguments": {
    "prompt": "string (required, max 10000 chars)",
    "maxResults": "number (optional, default: 3, range: 1-10)",
    "threshold": "number (optional, default: 0.7, range: 0.0-1.0)"
  }
}
```

#### レスポンススキーマ

```json
{
  "content": [
    {
      "type": "text",
      "text": "string (Markdown formatted)"
    }
  ]
}
```

#### エラーレスポンス

```json
{
  "error": {
    "code": "SEARCH_FAILED",
    "message": "Vector search failed: ...",
    "details": {}
  }
}
```

---

### 5.2 MCP Tool: record_implementation

#### リクエストスキーマ

```json
{
  "name": "record_implementation",
  "arguments": {
    "files": ["string[]", "required", "max 100 files"],
    "prompt": "string (optional, max 10000 chars)",
    "summary": "string (optional, max 200 chars)"
  }
}
```

#### レスポンススキーマ

```json
{
  "content": [
    {
      "type": "text",
      "text": "実装ドキュメントを作成しました:\n- ID: {id}\n- ファイル: {file_path}"
    }
  ]
}
```

---

## 6. エラーコード一覧

### 6.1 エラーコード定義

| コード               | 説明                       | HTTP相当 | リカバリ方法                  |
| -------------------- | -------------------------- | -------- | ----------------------------- |
| `SETUP_FAILED`       | セットアップ失敗           | 500      | .claude/ の存在確認、権限確認 |
| `CONFIG_INVALID`     | 設定ファイルが不正         | 400      | バックアップから復元          |
| `OLLAMA_UNAVAILABLE` | Ollama接続失敗             | 503      | Fallback処理に切り替え        |
| `INDEX_CORRUPTED`    | ベクトルインデックス破損   | 500      | インデックス再構築            |
| `SEARCH_FAILED`      | 検索失敗                   | 500      | エラーログ記録、空結果を返す  |
| `DOCUMENT_NOT_FOUND` | ドキュメントが見つからない | 404      | IDを確認                      |
| `FILE_READ_ERROR`    | ファイル読み込みエラー     | 500      | パーミッション確認            |
| `FILE_WRITE_ERROR`   | ファイル書き込みエラー     | 500      | ディスク容量確認              |
| `GIT_ERROR`          | Git操作エラー              | 500      | Git初期化確認                 |
| `EMBEDDING_FAILED`   | 埋め込みベクトル生成失敗   | 500      | モデル確認、Fallback          |

### 6.2 エラーハンドリング例

```typescript
class RecorderError extends Error {
  constructor(
    public code: string,
    message: string,
    public details?: any
  ) {
    super(message);
    this.name = 'RecorderError';
  }
}

// 使用例
try {
  await vectorStore.search(query, limit);
} catch (error) {
  if (error instanceof RecorderError && error.code === 'INDEX_CORRUPTED') {
    // リカバリ処理
    await vectorStore.rebuildIndex();
  } else {
    throw error;
  }
}
```

---

## 7. 設定パラメータ詳細

### 7.1 recorder.config.json 全パラメータ

```typescript
interface RecorderConfig {
  version: string; // 設定ファイルのバージョン

  summarizer: {
    provider: 'ollama' | 'keyword'; // 要約プロバイダー
    fallback: 'keyword' | 'none'; // Fallback方法
    maxLength: number; // 要約の最大文字数 (default: 500)
    ollamaModel: string; // Ollamaモデル名 (default: "llama3.2:3b")
    ollamaEndpoint: string; // Ollama API URL (default: "http://localhost:11434")
  };

  vectorStore: {
    provider: 'vectra'; // ベクトルストアプロバイダー
    embeddingModel: string; // 埋め込みモデル (default: "nomic-embed-text")
    indexPath: string; // インデックスパス (default: ".claude/docs/.index")
    similarityThreshold: number; // 類似度閾値 (default: 0.7, range: 0.0-1.0)
  };

  documentManager: {
    autoArchiveDays: number; // 自動アーカイブまでの日数 (default: 30)
    maxDocuments: number; // 最大ドキュメント数 (default: 1000)
    autoCleanup: boolean; // 自動クリーンアップ有効化 (default: true)
  };

  search: {
    maxResults: number; // 検索結果の最大件数 (default: 3, range: 1-10)
    includeArchived: boolean; // アーカイブを検索に含めるか (default: false)
  };

  git: {
    enabled: boolean; // Git情報取得を有効化 (default: true)
    autoCommit: boolean; // ドキュメント生成時に自動コミット (default: false)
  };

  logging: {
    level: 'debug' | 'info' | 'warn' | 'error'; // ログレベル (default: "info")
    logPath: string; // ログファイルパス (default: ".claude/docs/.logs")
  };
}
```

### 7.2 環境変数

| 環境変数                 | 説明                     | デフォルト値                   |
| ------------------------ | ------------------------ | ------------------------------ |
| `DEBUG`                  | デバッグモード有効化     | `""`                           |
| `RECORDER_CONFIG_PATH`   | 設定ファイルパス         | `.claude/recorder.config.json` |
| `OLLAMA_ENDPOINT`        | Ollama APIエンドポイント | `http://localhost:11434`       |
| `RECORDER_DISABLE_HOOKS` | フック無効化（テスト用） | `false`                        |

---

## 8. 実装ガイドライン

### 8.1 コーディング規約

#### 8.1.1 TypeScript スタイル

```typescript
// ✅ Good
export class DocumentManager {
  private readonly docsDir: string;

  constructor() {
    this.docsDir = path.join(process.cwd(), '.claude/docs');
  }

  async createDocument(params: CreateDocParams): Promise<Document> {
    // ...
  }
}

// ❌ Bad
export class DocumentManager {
  docsDir: any; // any型は避ける

  constructor() {
    this.docsDir = process.cwd() + '/.claude/docs'; // 文字列結合は避ける
  }

  createDocument(params) {
    // 型なし、asyncなし
  }
}
```

#### 8.1.2 エラーハンドリング

```typescript
// ✅ Good
try {
  const result = await this.vectorStore.search(query, limit);
  return result;
} catch (error) {
  this.logger.error('Search failed', { query, error });

  // リカバリ試行
  if (this.canRecover(error)) {
    return await this.fallbackSearch(query);
  }

  throw new RecorderError('SEARCH_FAILED', 'Vector search failed', { error });
}

// ❌ Bad
try {
  return this.vectorStore.search(query, limit);
} catch (e) {
  console.log(e); // ログ不足
  return []; // エラーを隠蔽
}
```

#### 8.1.3 非同期処理

```typescript
// ✅ Good: 並列処理
const [gitInfo, tags] = await Promise.all([this.getGitInfo(), this.generateTags(prompt, files)]);

// ❌ Bad: 逐次処理
const gitInfo = await this.getGitInfo();
const tags = await this.generateTags(prompt, files); // 待機が無駄
```

### 8.2 テストガイドライン

#### 8.2.1 ユニットテスト例

```typescript
// tests/services/DocumentManager.test.ts
import { DocumentManager } from '../../src/services/DocumentManager';

describe('DocumentManager', () => {
  let manager: DocumentManager;

  beforeEach(async () => {
    manager = new DocumentManager();
    await manager.initialize();
  });

  test('should create document with valid params', async () => {
    const params = {
      files: ['src/test.ts'],
      prompt: 'テスト実装',
      summary: 'テストドキュメント',
    };

    const doc = await manager.createDocument(params);

    expect(doc.metadata.id).toBeDefined();
    expect(doc.metadata.related_files).toEqual(['src/test.ts']);
    expect(doc.content).toContain('テスト実装');
  });

  test('should throw error when document not found', async () => {
    await expect(manager.getDocument('invalid-id')).resolves.toBeNull();
  });
});
```

#### 8.2.2 統合テスト例

```typescript
// tests/integration/mcp.test.ts
import { MCPServer } from '../../src/mcp/server';

describe('MCP Integration', () => {
  let server: MCPServer;

  beforeAll(async () => {
    server = new MCPServer();
    await server.start();
  });

  afterAll(async () => {
    await server.shutdown();
  });

  test('should search related docs', async () => {
    const response = await server.handleSearchRelatedDocs({
      prompt: 'JWT認証',
      maxResults: 3,
    });

    expect(response.content).toBeDefined();
    expect(response.content[0].type).toBe('text');
  });
});
```

### 8.3 パフォーマンス最適化

#### 8.3.1 ベクトル検索の最適化

```typescript
// ✅ Good: キャッシュ利用
class VectorStore {
  private embedCache = new Map<string, number[]>();

  async embed(text: string): Promise<number[]> {
    const cached = this.embedCache.get(text);
    if (cached) return cached;

    const vector = await embedText(text);
    this.embedCache.set(text, vector);
    return vector;
  }
}
```

#### 8.3.2 ファイルI/Oの最適化

```typescript
// ✅ Good: バッチ読み込み
async function loadDocuments(ids: string[]): Promise<Document[]> {
  const promises = ids.map((id) => loadDocument(id));
  return await Promise.all(promises);
}

// ❌ Bad: 逐次読み込み
async function loadDocuments(ids: string[]): Promise<Document[]> {
  const docs: Document[] = [];
  for (const id of ids) {
    docs.push(await loadDocument(id));
  }
  return docs;
}
```

### 8.4 セキュリティガイドライン

#### 8.4.1 パス検証

```typescript
function validatePath(filePath: string): void {
  const resolved = path.resolve(filePath);
  const allowedBase = path.resolve(process.cwd(), '.claude');

  if (!resolved.startsWith(allowedBase)) {
    throw new RecorderError('INVALID_PATH', 'Path outside allowed directory', { filePath });
  }
}
```

#### 8.4.2 入力サニタイズ

```typescript
function sanitizePrompt(prompt: string): string {
  // HTMLタグ除去
  let cleaned = prompt.replace(/<[^>]*>/g, '');

  // 制御文字除去
  cleaned = cleaned.replace(/[\x00-\x1F\x7F]/g, '');

  // 最大長制限
  return cleaned.slice(0, 10000);
}
```

---

## 9. デプロイメント手順

### 9.1 npm公開準備

```bash
# 1. ビルド
npm run build

# 2. テスト実行
npm test

# 3. バージョン更新
npm version patch  # or minor, major

# 4. パッケージ確認
npm pack
tar -xzf claude-dev-recorder-1.0.0.tgz
ls package/

# 5. npm公開
npm publish
```

### 9.2 .npmignore

```
# ソースファイル
src/
tests/

# 設定ファイル
tsconfig.json
.eslintrc.json

# ドキュメント（READMEは除く）
docs/

# CI設定
.github/

# その他
*.log
.DS_Store
```

---

## 10. 保守・運用

### 10.1 ログローテーション

```typescript
// ログファイルが1MBを超えたらローテーション
class Logger {
  private async checkLogRotation(): Promise<void> {
    const logPath = '.claude/docs/.logs/error.log';
    const stats = await fs.stat(logPath);

    if (stats.size > 1024 * 1024) {
      // 1MB
      const timestamp = new Date().toISOString();
      const archivePath = `.claude/docs/.logs/error.log.${timestamp}`;
      await fs.rename(logPath, archivePath);
    }
  }
}
```

### 10.2 定期メンテナンス

```typescript
// 月次メンテナンス
async function monthlyMaintenance(): Promise<void> {
  const manager = new DocumentManager();

  // 1. 古いドキュメントをアーカイブ
  await manager.cleanupOldDocuments(30);

  // 2. ベクトルインデックス最適化
  const vectorStore = new VectorStore();
  await vectorStore.rebuildIndex();

  // 3. ログローテーション
  // ...
}
```

---

## 11. 改訂履歴

| バージョン | 日付       | 変更内容 | 変更者 |
| ---------- | ---------- | -------- | ------ |
| 1.0.0      | 2025-11-19 | 初版作成 | -      |
