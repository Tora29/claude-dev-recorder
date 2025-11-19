# デプロイメント・セキュリティ設計

## ドキュメント情報

| 項目           | 内容                                                                                                                    |
| -------------- | ----------------------------------------------------------------------------------------------------------------------- |
| プロジェクト名 | claude-dev-recorder                                                                                                     |
| バージョン     | 1.0.0                                                                                                                   |
| 作成日         | 2025-11-19                                                                                                              |
| 最終更新日     | 2025-11-19                                                                                                              |
| ステータス     | Draft                                                                                                                   |
| 関連文書       | [アーキテクチャ設計](./01_architecture.md)、[コンポーネント設計](./02_components.md)、[データ設計](./03_data_design.md) |

---

## 1. インターフェース設計

### 1.1 MCP Tools API

#### 1.1.1 search_related_docs

**説明:** プロンプトに関連するドキュメントを検索

**リクエスト:**

```json
{
  "name": "search_related_docs",
  "arguments": {
    "prompt": "ユーザー認証機能を実装したい",
    "maxResults": 3,
    "threshold": 0.7
  }
}
```

**レスポンス:**

```json
{
  "content": [
    {
      "type": "text",
      "text": "## 関連する過去の実装\n\n### 1. JWT認証システムの実装 (2025-11-15)\n- ファイル: src/auth/login.ts, src/middleware/auth.ts\n- 概要: JWTを使用した認証システム。ログイン時にトークンを発行し、ミドルウェアで検証。\n- 使用技術: jsonwebtoken, bcrypt\n\n### 2. OAuth2.0統合 (2025-11-10)\n- ファイル: src/auth/oauth.ts\n- 概要: Google OAuthを使用したソーシャルログイン実装。\n\n### 3. セッション管理 (2025-11-05)\n- ファイル: src/auth/session.ts\n- 概要: Redisを使用したセッションストア実装。"
    }
  ]
}
```

#### 1.1.2 record_implementation

**説明:** 実装内容をドキュメント化

**リクエスト:**

```json
{
  "name": "record_implementation",
  "arguments": {
    "files": ["src/auth/login.ts", "src/middleware/auth.ts"],
    "prompt": "JWT認証を実装",
    "summary": "JWT認証システムの実装"
  }
}
```

**レスポンス:**

```json
{
  "content": [
    {
      "type": "text",
      "text": "実装ドキュメントを作成しました:\n- ID: 550e8400-e29b-41d4-a716-446655440000\n- ファイル: .claude/docs/2025-11-19_550e8400_jwt-auth.md\n- 関連ファイル: 2件\n- タグ: authentication, security, jwt"
    }
  ]
}
```

#### 1.1.3 manage_documents

**説明:** ドキュメントの管理（アーカイブ・削除）

**リクエスト:**

```json
{
  "name": "manage_documents",
  "arguments": {
    "action": "archive",
    "docId": "550e8400-e29b-41d4-a716-446655440000"
  }
}
```

**レスポンス:**

```json
{
  "content": [
    {
      "type": "text",
      "text": "ドキュメントをアーカイブしました:\n- ID: 550e8400-e29b-41d4-a716-446655440000\n- 移動先: .claude/docs/.archive/2025-11-19_550e8400_jwt-auth.md"
    }
  ]
}
```

#### 1.1.4 merge_similar_docs

**説明:** 類似ドキュメントを検出して統合

**リクエスト:**

```json
{
  "name": "merge_similar_docs",
  "arguments": {
    "threshold": 0.85,
    "autoMerge": false
  }
}
```

**パラメータ:**

- `threshold`: 類似度の閾値（デフォルト: 0.85）
- `autoMerge`: trueの場合は確認なしで自動統合（デフォルト: false）

**レスポンス:**

```json
{
  "content": [
    {
      "type": "text",
      "text": "類似ドキュメントの統合が完了しました:\n\n統合グループ1: JWT認証関連\n- 統合前: 2025-11-19_abc123_jwt-auth.md, 2025-11-19_def456_jwt-error.md\n- 統合後: 2025-11-19_ghi789_jwt-unified.md\n- アーカイブ: 2件\n\n統合グループ2: API設計関連\n- 統合前: 3件\n- 統合後: 2025-11-19_jkl012_api-unified.md\n- アーカイブ: 3件\n\n合計: 5件のドキュメントを2件に統合しました。"
    }
  ]
}
```

### 1.2 Hook Scripts Interface

#### 1.2.1 user-prompt-submit-hook

**トリガー条件:** ユーザーがプロンプトを送信した時

**入力（環境変数）:**

- `PROMPT`: ユーザーが入力したプロンプト内容
- `CLAUDE_CODE_SESSION_ID`: セッションID

**処理フロー:**

```bash
#!/bin/bash

# 1. プロンプト内容を取得
PROMPT="$1"

# 2. MCP Toolを呼び出して関連ドキュメントを検索
RELATED_DOCS=$(claude-mcp-call search_related_docs "{\"prompt\": \"$PROMPT\"}")

# 3. 関連ドキュメントがあればプロンプトに追加
if [ -n "$RELATED_DOCS" ]; then
  echo "## 参考: 過去の関連実装"
  echo "$RELATED_DOCS"
fi
```

**出力:**

- 標準出力にテキストを出力 → Claude AIのコンテキストに追加される

#### 1.2.2 after-tool-use-hook

**トリガー条件:** Claude AIがEdit/WriteツールなどのFile操作ツールを使用した後

**入力（環境変数）:**

- `TOOL_NAME`: 使用されたツール名（例: "Edit", "Write"）
- `TOOL_ARGS`: ツールの引数（JSON形式）
- `TOOL_RESULT`: ツールの実行結果

**処理フロー:**

```bash
#!/bin/bash

# 1. File操作ツールのみ処理
if [[ "$TOOL_NAME" != "Edit" && "$TOOL_NAME" != "Write" ]]; then
  exit 0
fi

# 2. 変更されたファイルを抽出
FILES=$(echo "$TOOL_ARGS" | jq -r '.file_path')

# 3. 一定数のファイル変更が蓄積されたらドキュメント生成
# （即座に生成するとノイズが多いため、タイミングを調整）
# この実装はスクリプト内で状態管理が必要

# 4. MCP Toolを呼び出してドキュメント生成
claude-mcp-call record_implementation "{\"files\": [\"$FILES\"]}"
```

---

## 2. デプロイメント設計

### 2.1 npm公開パッケージ構成

**package.json:**

```json
{
  "name": "claude-dev-recorder",
  "version": "1.0.0",
  "description": "Automatically record and leverage Claude Code implementation history",
  "main": "dist/index.js",
  "types": "dist/index.d.ts",
  "bin": {
    "claude-dev-recorder": "dist/index.js"
  },
  "scripts": {
    "postinstall": "node scripts/postinstall.js",
    "build": "tsc",
    "prepublishOnly": "npm run build"
  },
  "files": ["dist/", "templates/", "scripts/postinstall.js", "README.md", "LICENSE"],
  "engines": {
    "node": ">=18.0.0"
  },
  "dependencies": {
    "@modelcontextprotocol/sdk": "^1.0.0",
    "vectra": "^0.9.0",
    "gray-matter": "^4.0.3",
    "uuid": "^11.0.0",
    "@xenova/transformers": "^2.17.0"
  },
  "devDependencies": {
    "typescript": "^5.3.0",
    "@types/node": "^20.0.0"
  },
  "keywords": ["claude", "claude-code", "documentation", "ai", "mcp"],
  "license": "MIT",
  "repository": {
    "type": "git",
    "url": "https://github.com/yourusername/claude-dev-recorder.git"
  }
}
```

### 2.2 インストールプロセス

```
npm install claude-dev-recorder
         ↓
┌────────────────────────────────────┐
│ 1. パッケージダウンロード            │
│    - node_modules/ に配置           │
│    - 依存パッケージもインストール     │
└────────────────────────────────────┘
         ↓
┌────────────────────────────────────┐
│ 2. postinstall実行                 │
│    (scripts/postinstall.js)        │
└────────────────────────────────────┘
         ↓
┌────────────────────────────────────┐
│ 3. 環境チェック                     │
│    - Node.js >= 18                 │
│    - .claude/ 存在確認              │
└────────────────────────────────────┘
         ↓
┌────────────────────────────────────┐
│ 4. 設定ファイル編集                 │
│    - .claude/config.json            │
│    - バックアップ作成                │
│    - mcpServers セクション追加      │
└────────────────────────────────────┘
         ↓
┌────────────────────────────────────┐
│ 5. ファイル配置                     │
│    - templates/ から .claude/ へ   │
│    - hooks/ スクリプト               │
│    - recorder.config.json           │
└────────────────────────────────────┘
         ↓
┌────────────────────────────────────┐
│ 6. ディレクトリ作成                 │
│    - .claude/docs/                 │
│    - .claude/docs/.index/          │
│    - .claude/docs/.archive/        │
│    - .claude/docs/.logs/           │
└────────────────────────────────────┘
         ↓
┌────────────────────────────────────┐
│ 7. 完了メッセージ表示               │
│    "Please restart Claude Code"    │
└────────────────────────────────────┘
```

### 2.3 アンインストールプロセス（重要）

```
npm uninstall claude-dev-recorder
         ↓
┌────────────────────────────────────┐
│ 1. preuninstall script 実行        │
│    scripts/preuninstall.js         │
└────────────────────────────────────┘
         ↓
┌────────────────────────────────────┐
│ 2. ドキュメント数を確認・表示       │
│    "1,234件のドキュメントが存在"    │
└────────────────────────────────────┘
         ↓
┌────────────────────────────────────┐
│ 3. ユーザーに通知                   │
│    "⚠️  実装ドキュメントは保持されます" │
│    "場所: .claude/docs/"           │
│    "削除する場合は手動で削除してください"│
└────────────────────────────────────┘
         ↓
┌────────────────────────────────────┐
│ 4. 設定のバックアップ作成           │
│    .claude/config.json.backup      │
└────────────────────────────────────┘
         ↓
┌────────────────────────────────────┐
│ 5. 設定のクリーンアップ             │
│    - .claude/config.json から      │
│      mcpServers 設定を削除         │
│    - .claude/hooks/ を削除         │
│    - .claude/recorder.config.json  │
│      を削除                         │
└────────────────────────────────────┘
         ↓
┌────────────────────────────────────┐
│ 6. Git hooksのクリーンアップ        │
│    - .git/hooks/post-merge 削除    │
│      (claude-dev-recorder追加分)   │
└────────────────────────────────────┘
         ↓
┌────────────────────────────────────┐
│ 7. 完了メッセージ表示               │
│    "アンインストール完了"           │
│    "ドキュメントは .claude/docs/ に│
│     保持されています"               │
└────────────────────────────────────┘
         ↓
┌────────────────────────────────────┐
│ 8. パッケージ削除                   │
│    - node_modules/ から削除         │
└────────────────────────────────────┘
```

**重要:**

- **ドキュメント（.claude/docs/）は削除されません**
- 設定ファイルのみクリーンアップ
- バックアップを作成してから削除
- ユーザーに明示的に通知

---

## 3. セキュリティ設計

### 3.1 脅威分析

| 脅威                     | 影響 | 対策                               |
| ------------------------ | ---- | ---------------------------------- |
| 任意コード実行           | 高   | フックスクリプトのサンドボックス化 |
| ファイルシステムアクセス | 中   | `.claude/` 配下のみアクセス許可    |
| 機密情報の漏洩           | 高   | ドキュメントは完全ローカル保存     |
| 依存パッケージの脆弱性   | 中   | 定期的な `npm audit` 実行          |

### 3.2 セキュリティ対策

#### 3.2.1 ファイルアクセス制限

```typescript
// 許可されたディレクトリのみアクセス
const ALLOWED_PATHS = [
  path.join(process.cwd(), '.claude'),
  path.join(process.cwd(), 'node_modules/claude-dev-recorder'),
];

function validatePath(filePath: string): boolean {
  const absolute = path.resolve(filePath);
  return ALLOWED_PATHS.some((allowed) => absolute.startsWith(allowed));
}
```

#### 3.2.2 入力値のサニタイズ

```typescript
// プロンプト内容のサニタイズ
function sanitizePrompt(prompt: string): string {
  // HTMLタグ除去
  const cleaned = prompt.replace(/<[^>]*>/g, '');

  // 最大文字数制限
  return cleaned.slice(0, 10000);
}
```

#### 3.2.3 機密情報の除外

```typescript
// 環境変数、トークンなどを自動検出して除外
const SENSITIVE_PATTERNS = [
  /API_KEY/i,
  /SECRET/i,
  /TOKEN/i,
  /PASSWORD/i,
  /[A-Za-z0-9]{32,}/, // 長いランダム文字列
];

function excludeSensitiveData(content: string): string {
  // パターンマッチした行を [REDACTED] に置換
  return content
    .split('\n')
    .map((line) => {
      if (SENSITIVE_PATTERNS.some((pattern) => pattern.test(line))) {
        return '[REDACTED]';
      }
      return line;
    })
    .join('\n');
}
```

---

## 4. パフォーマンス設計

### 4.1 性能目標

| 処理               | 目標時間 | 測定方法                     |
| ------------------ | -------- | ---------------------------- |
| プロンプト検索     | < 2秒    | ベクトル検索 + 要約生成      |
| ドキュメント生成   | < 5秒    | メタデータ抽出 + 要約 + 保存 |
| ベクトル検索       | < 500ms  | Vectraクエリ                 |
| 要約生成（Ollama） | < 3秒    | llama3.2:3b推論              |

### 4.2 最適化戦略

#### 4.2.1 ベクトル検索の最適化

- **インデックスキャッシュ**: メモリに常駐
- **バッチ処理**: 複数ドキュメントを一度に埋め込み
- **次元削減**: 768次元 → 384次元（精度とのトレードオフ）

#### 4.2.2 要約生成の最適化

- **非同期処理**: ドキュメント生成をバックグラウンドで実行
- **キャッシュ**: 同一内容の再要約を防止
- **タイムアウト**: Ollama応答が3秒超えたらfallback

#### 4.2.3 ファイルI/Oの最適化

- **遅延書き込み**: バッファリングして一括書き込み
- **ストリーム読み込み**: 大きなファイルはストリーミング
- **並列処理**: 複数ドキュメントの読み込みを並列化

---

## 5. エラーハンドリング設計

### 5.1 エラー分類

| カテゴリ     | エラー例                 | 対処                                   |
| ------------ | ------------------------ | -------------------------------------- |
| 環境エラー   | .claude/ が存在しない    | セットアップ中止、エラーメッセージ表示 |
| 設定エラー   | config.json が不正なJSON | バックアップから復元                   |
| 実行時エラー | Ollama接続失敗           | fallback処理に切り替え                 |
| データエラー | ベクトルインデックス破損 | 自動再構築                             |

### 5.2 エラーハンドリングフロー

```typescript
class ErrorHandler {
  handle(error: Error): void {
    // 1. エラー分類
    const category = this.categorize(error);

    // 2. ログ記録
    this.log(error, category);

    // 3. リカバリ試行
    const recovered = this.tryRecover(error, category);

    // 4. ユーザー通知
    if (!recovered) {
      this.notifyUser(error);
    }
  }

  private tryRecover(error: Error, category: ErrorCategory): boolean {
    switch (category) {
      case 'OLLAMA_CONNECTION':
        return this.switchToFallback();
      case 'INDEX_CORRUPTED':
        return this.rebuildIndex();
      case 'CONFIG_INVALID':
        return this.restoreBackup();
      default:
        return false;
    }
  }
}
```

---

## 6. テスト戦略

### 6.1 テスト範囲

| レイヤー    | テスト種類               | カバレッジ目標 |
| ----------- | ------------------------ | -------------- |
| Unit        | Jest                     | 80%以上        |
| Integration | MCP通信テスト            | 主要パス100%   |
| E2E         | 実環境セットアップテスト | 主要シナリオ   |

### 6.2 主要テストケース

#### 6.2.1 セットアップテスト

- ✅ 正常系: .claude/ が存在する場合
- ✅ 異常系: .claude/ が存在しない場合
- ✅ 異常系: config.json が既に存在し、mcpServers が設定済み
- ✅ 異常系: 書き込み権限がない場合

#### 6.2.2 ドキュメント生成テスト

- ✅ 正常系: 複数ファイル変更時のドキュメント生成
- ✅ 正常系: Git情報の取得
- ✅ 異常系: Ollama未起動時のfallback
- ✅ 異常系: ディスク容量不足

#### 6.2.3 検索テスト

- ✅ 正常系: 関連ドキュメントの検索
- ✅ 正常系: 関連度が低い場合の空結果
- ✅ 異常系: インデックスが存在しない場合
- ✅ 異常系: ベクトル生成失敗時のfallback

---

## 7. 監視・ロギング設計

### 7.1 ログレベル

| レベル | 用途                                 | 出力先                       |
| ------ | ------------------------------------ | ---------------------------- |
| ERROR  | エラー発生時                         | .claude/docs/.logs/error.log |
| WARN   | 警告（fallback使用など）             | .claude/docs/.logs/error.log |
| INFO   | 主要イベント（ドキュメント生成など） | 標準出力（開発時）           |
| DEBUG  | デバッグ情報                         | 環境変数 DEBUG=\* 時のみ     |

### 7.2 ログフォーマット

```json
{
  "timestamp": "2025-11-19T10:30:00.000Z",
  "level": "INFO",
  "component": "DocumentManager",
  "message": "Document created",
  "metadata": {
    "docId": "550e8400-e29b-41d4-a716-446655440000",
    "files": ["src/auth/login.ts"],
    "duration": 1234
  }
}
```

---

## 8. 拡張性設計

### 8.1 プラグインアーキテクチャ（将来）

```typescript
interface Plugin {
  name: string;
  version: string;
  onDocumentCreate?(doc: Document): Promise<void>;
  onDocumentSearch?(results: SearchResult[]): Promise<SearchResult[]>;
}

class PluginManager {
  register(plugin: Plugin): void;
  execute(hook: string, data: any): Promise<any>;
}
```

### 8.2 カスタムSummarizer

```typescript
interface SummarizerProvider {
  summarize(content: string): Promise<string>;
  isAvailable(): Promise<boolean>;
}

// ユーザーが独自のSummarizerを実装可能
class CustomSummarizer implements SummarizerProvider {
  async summarize(content: string): Promise<string> {
    // カスタムロジック
  }
}
```

---

## 9. 制約事項と前提条件

### 9.1 技術的前提条件

1. Node.js 18以上がインストールされている
2. Claude Codeがインストールされている
3. `.claude/` ディレクトリが存在する
4. MCPプロトコルがサポートされている

### 9.2 運用上の制約

1. 初回セットアップ後、Claude Codeの再起動が必要
2. Ollama使用時は別途インストールと起動が必要
3. ドキュメントはローカルのみ保存（クラウド同期なし）

---

## 改訂履歴

| バージョン | 日付       | 変更内容 | 変更者 |
| ---------- | ---------- | -------- | ------ |
| 1.0.0      | 2025-11-19 | 初版作成 | -      |
