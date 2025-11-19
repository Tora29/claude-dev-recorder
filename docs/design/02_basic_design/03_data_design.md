# データ設計

## ドキュメント情報

| 項目           | 内容                                                                                                                                                  |
| -------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| プロジェクト名 | claude-dev-recorder                                                                                                                                   |
| バージョン     | 1.0.0                                                                                                                                                 |
| 作成日         | 2025-11-19                                                                                                                                            |
| 最終更新日     | 2025-11-19                                                                                                                                            |
| ステータス     | Draft                                                                                                                                                 |
| 関連文書       | [アーキテクチャ設計](./01_architecture.md)、[コンポーネント設計](./02_components.md)、[デプロイメント・セキュリティ設計](./04_deployment_security.md) |

---

## 1. ドキュメントフォーマット

### 1.1 Markdownファイル構造

```markdown
---
id: '550e8400-e29b-41d4-a716-446655440000'
created: '2025-11-19T10:30:00.000Z'
updated: '2025-11-19T10:30:00.000Z'
author: 'user@example.com'
tags: ['authentication', 'security', 'jwt']
prompt_hash: 'sha256:abc123...'
related_files:
  - 'src/auth/login.ts'
  - 'src/auth/session.ts'
  - 'src/middleware/auth.ts'
summary: 'JWT認証システムの実装'
embedding_model: 'nomic-embed-text'
version: '1.0'
---

## 実装概要

JWT（JSON Web Token）を使用した認証システムを実装しました。ログイン時にトークンを発行し、APIリクエスト時にトークンを検証する仕組みです。

## 実装詳細

### 1. ログイン処理 (src/auth/login.ts)

ユーザー名とパスワードを受け取り、認証に成功したらJWTを発行します。

- パスワードはbcryptでハッシュ化して比較
- JWTのペイロードにはuser_idとroleを含める
- 有効期限は24時間

### 2. トークン検証ミドルウェア (src/middleware/auth.ts)

リクエストヘッダーからトークンを取得し、検証します。

- Authorizationヘッダーから "Bearer <token>" 形式で取得
- jwt.verify()で署名検証
- 有効期限チェック
- デコードしたユーザー情報をreq.userに格納

### 3. セッション管理 (src/auth/session.ts)

トークンのリフレッシュとログアウト処理。

- リフレッシュトークンは7日間有効
- ログアウト時はトークンをブラックリストに追加

## 変更ファイル

- `src/auth/login.ts`: 新規作成
- `src/auth/session.ts`: 新規作成
- `src/middleware/auth.ts`: 新規作成
- `package.json`: jsonwebtoken, bcryptを追加

## 使用技術

- jsonwebtoken: v9.0.2
- bcrypt: v5.1.1
- TypeScript

## 注意事項

- JWT_SECRETは環境変数で設定すること
- 本番環境ではHTTPS必須
- リフレッシュトークンはHTTPOnlyクッキーで保存推奨

## 関連ドキュメント

- [JWT公式ドキュメント](https://jwt.io/)
- プロジェクト内の認証仕様書: `docs/auth-spec.md`
```

### 1.2 メタデータスキーマ (TypeScript)

```typescript
interface DocumentMetadata {
  id: string; // UUID v4
  created: string; // ISO 8601形式
  updated: string; // ISO 8601形式
  author: string | string[]; // Git user.email (統合時は配列)
  tags: string[]; // 自動生成 + 手動タグ
  prompt_hash: string; // SHA-256ハッシュ
  related_files: string[]; // 変更されたファイルパス
  summary: string; // 1行サマリ
  ultra_summary: string; // 超圧縮サマリー（~50文字）
  standard_summary: string; // 標準要約（~200文字）
  embedding_model: string; // 使用した埋め込みモデル
  version: string; // スキーマバージョン

  // ドキュメント統合関連（統合ドキュメントの場合のみ）
  merged_from?: string[]; // 統合元ドキュメントのID配列
  merge_method?: string; // 統合方法 ("ai_unified" | "manual")
  merge_timestamp?: string; // 統合日時 (ISO 8601形式)
  is_merged?: boolean; // 統合済みフラグ
  merge_reviewed?: boolean; // レビュー済みフラグ
  merge_reviewer?: string; // レビュー者

  // 品質管理関連
  quality_score?: number; // 総合品質スコア (0.0〜1.0)
  freshness_score?: number; // 鮮度スコア (0.0〜1.0)
  completeness_score?: number; // 完全性スコア (0.0〜1.0)
  reference_count?: number; // 参照回数

  // 変更履歴
  change_log?: ChangeLogEntry[]; // 変更履歴の配列
}

interface ChangeLogEntry {
  timestamp: string; // 変更日時 (ISO 8601形式)
  action: string; // 操作 ("created" | "updated" | "merged" | "archived")
  author: string; // 操作者
  reason?: string; // 変更理由
  details?: any; // 詳細情報
}

interface Document {
  metadata: DocumentMetadata;
  content: string; // Markdown本文
  file_path: string; // ファイルシステム上のパス
  vector?: number[]; // 埋め込みベクトル（メモリ上のみ）
}
```

---

## 2. 設定ファイル形式

### 2.1 `.claude/recorder.config.json`

```json
{
  "version": "1.0.0",
  "summarizer": {
    "provider": "ollama",
    "fallback": "keyword",
    "maxLength": 500,
    "ollamaModel": "llama3.2:3b",
    "ollamaEndpoint": "http://localhost:11434"
  },
  "vectorStore": {
    "provider": "vectra",
    "embeddingModel": "nomic-embed-text",
    "indexPath": ".claude/docs/.index",
    "similarityThreshold": 0.7
  },
  "documentManager": {
    "autoArchiveDays": 30,
    "maxDocuments": 1000,
    "autoCleanup": true
  },
  "search": {
    "maxResults": 3,
    "includeArchived": false
  },
  "git": {
    "enabled": true,
    "autoCommit": false
  },
  "fileWatcher": {
    "enabled": true,
    "syncIntervalSeconds": 60,
    "watchGitHooks": true
  },
  "integrityChecker": {
    "checkOnStartup": true,
    "autoRecover": true,
    "validateMetadata": true
  },
  "sensitiveData": {
    "enabled": true,
    "autoMask": true,
    "warnUser": true,
    "customPatternsPath": ".claude/sensitive-patterns.json"
  },
  "logging": {
    "level": "info",
    "logPath": ".claude/docs/.logs"
  }
}
```

### 2.2 機密情報検出パターン設定 (`.claude/sensitive-patterns.json`)

```json
{
  "patterns": [
    {
      "name": "API_KEY",
      "regex": "API_KEY\\s*=\\s*[\"']([^\"']+)[\"']",
      "severity": "high"
    },
    {
      "name": "OpenAI_Key",
      "regex": "sk-[a-zA-Z0-9]{32,}",
      "severity": "critical"
    },
    {
      "name": "GitHub_Token",
      "regex": "ghp_[a-zA-Z0-9]{36}",
      "severity": "critical"
    },
    {
      "name": "AWS_Key",
      "regex": "AKIA[A-Z0-9]{16}",
      "severity": "critical"
    },
    {
      "name": "Generic_Secret",
      "regex": "SECRET\\s*=\\s*[\"']([^\"']+)[\"']",
      "severity": "high"
    }
  ],
  "whitelist": ["example-api-key-for-testing", "placeholder-secret"],
  "excludeFiles": [".env.example", "README.md"]
}
```

### 2.3 `.claude/config.json` への追加内容

```json
{
  "mcpServers": {
    "claude-dev-recorder": {
      "command": "node",
      "args": ["./node_modules/claude-dev-recorder/dist/index.js"],
      "env": {
        "DEBUG": "claude-dev-recorder:*"
      }
    }
  }
}
```

---

## 3. ベクトルインデックス構造

Vectraを使用した場合のディレクトリ構造:

```
.claude/docs/.index/
├── index.json              # インデックスメタデータ
├── vectors.bin             # 埋め込みベクトル（バイナリ）
└── metadata.json           # ドキュメントメタデータ
```

---

## 4. 監査ログ設計

### 4.1 監査ログ形式

```typescript
interface AuditLogEntry {
  timestamp: string; // ISO 8601形式
  action: string; // 操作種別
  actor: string; // 操作者 ("system" | user.email)
  details: {
    [key: string]: any; // 操作詳細情報
  };
  impact: 'low' | 'medium' | 'high'; // 影響度
}
```

### 4.2 監査ログ例

```json
{
  "timestamp": "2025-11-19T15:00:00.000Z",
  "action": "merge_documents",
  "actor": "system",
  "details": {
    "merged_docs": ["abc123", "def456"],
    "result_doc": "ghi789",
    "similarity_score": 0.92,
    "file_overlap": 0.6,
    "review_status": "approved",
    "reviewer": "user@example.com"
  },
  "impact": "medium"
}

{
  "timestamp": "2025-11-19T15:05:00.000Z",
  "action": "manual_edit",
  "actor": "user@example.com",
  "details": {
    "doc_id": "ghi789",
    "changes": ["Fixed API endpoint", "Updated example code"],
    "reason": "Incorrect information detected"
  },
  "impact": "high"
}

{
  "timestamp": "2025-11-19T15:10:00.000Z",
  "action": "rollback_merge",
  "actor": "user@example.com",
  "details": {
    "merged_doc": "ghi789",
    "restored_docs": ["abc123", "def456"],
    "reason": "Incorrect merge"
  },
  "impact": "high"
}
```

### 4.3 ログローテーション

- ファイルサイズが1MBを超えたら自動ローテーション
- ローテーション形式: `audit.log.2025-11-19T15-00-00Z`
- 圧縮保存（gzip）
- 90日以上経過したログは自動削除
