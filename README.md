# claude-dev-recorder

Automatically record and leverage Claude Code implementation history.

Claude Codeの実装履歴を自動記録し、過去の実装パターンを活用可能にするMCPサーバーです。ベクトル検索とメモリキャッシュを組み合わせて、高速で正確な類似実装の検索を実現します。

## Features

- **自動実装記録**: Claude Codeで行った実装を自動的にドキュメント化
- **高速検索**: メモリキャッシュによる超高速な類似実装の検索
- **ベクトル検索**: セマンティック検索による関連実装の発見
- **重複検出**: 類似ドキュメントの自動検出とマージ提案
- **品質管理**: ドキュメントの品質チェックと自動修正
- **変更履歴**: すべての変更を追跡する監査ログ
- **ロールバック**: マージ操作の取り消しが可能

## Installation

### npm経由でのインストール

```bash
npm install -g claude-dev-recorder
```

### npxでの直接実行

```bash
npx claude-dev-recorder
```

### ソースからのビルド

```bash
git clone https://github.com/Tora29/claude-dev-recorder.git
cd claude-dev-recorder
npm install
npm run build
```

## Configuration

### Claude Desktopでの設定

Claude Desktop（またはClaude Code）の設定ファイルを編集します：

**macOS**: `~/Library/Application Support/Claude/claude_desktop_config.json`
**Windows**: `%APPDATA%\Claude\claude_desktop_config.json`

```json
{
  "mcpServers": {
    "claude-dev-recorder": {
      "command": "npx",
      "args": ["claude-dev-recorder"]
    }
  }
}
```

グローバルインストールした場合：

```json
{
  "mcpServers": {
    "claude-dev-recorder": {
      "command": "claude-dev-recorder"
    }
  }
}
```

### プロジェクトごとの設定

プロジェクトルートで以下を実行すると、自動的に `.claude/` ディレクトリが作成されます：

```bash
npx claude-dev-recorder
```

## Usage

Claude DesktopまたはClaude Codeから、以下のツールが利用可能になります：

### 1. search_related_docs

現在のタスクに関連する過去の実装を検索します。

```
関連ドキュメントを検索: 「ユーザー認証の実装」
```

**パラメータ:**

- `prompt` (required): 検索クエリ
- `maxResults` (optional): 最大検索結果数（デフォルト: 3）
- `threshold` (optional): 類似度の閾値（デフォルト: 0.7）

### 2. record_implementation

新しい実装をドキュメントとして記録します。

```
実装を記録: 変更したファイル、プロンプト、サマリー
```

**パラメータ:**

- `files` (required): 変更したファイルのリスト
- `prompt` (required): 実装の目的や内容
- `summary` (optional): 実装の要約

### 3. manage_documents

ドキュメントの管理（アーカイブ、削除）を行います。

```
ドキュメントをアーカイブ: doc-id-123
```

**パラメータ:**

- `action` (required): "archive" または "delete"
- `docId` (required): ドキュメントID

### 4. merge_similar_docs

類似するドキュメントを自動的に検出してマージします。

```
類似ドキュメントをマージ
```

**パラメータ:**

- `threshold` (optional): 類似度の閾値（デフォルト: 0.85）
- `autoMerge` (optional): 自動マージを有効化

### 5. search_by_keyword

キーワードとタグでドキュメントを検索します。

```
キーワードで検索: "authentication"
```

**パラメータ:**

- `keyword` (required): 検索キーワード
- `tags` (optional): タグのリスト

### 6. preview_merge

マージ操作を実行する前にプレビューを表示します。

```
マージをプレビュー
```

**パラメータ:**

- `threshold` (optional): 類似度の閾値（デフォルト: 0.85）

### 7. check_document_quality

ドキュメントの品質をチェックし、問題を検出します。

```
ドキュメント品質をチェック
```

**パラメータ:**

- `fix` (optional): 自動修正を有効化（デフォルト: false）

### 8. get_document_history

ドキュメントの変更履歴を取得します。

```
ドキュメント履歴を取得: doc-id-123
```

**パラメータ:**

- `docId` (required): ドキュメントID

### 9. rollback_merge

マージ操作をロールバックします。

```
マージをロールバック: merged-doc-id-456
```

**パラメータ:**

- `mergedDocId` (required): マージされたドキュメントのID

## Architecture

### ディレクトリ構造

```
.claude/
├── docs/              # ドキュメント保存先
├── .index/            # ベクトルインデックス
├── archive/           # アーカイブされたドキュメント
└── audit.log          # 監査ログ
```

### ドキュメント形式

各ドキュメントはMarkdown形式で保存され、frontmatterに以下のメタデータを含みます：

```markdown
---
id: doc-123
summary: ユーザー認証の実装
tags: [authentication, security]
related_files: [src/auth.ts, src/middleware.ts]
created: 2025-01-15T10:30:00Z
author: Claude
---

# 実装の詳細

...
```

## Performance

- **メモリキャッシュ**: すべてのドキュメントをメモリに保持し、超高速検索を実現
- **遅延インデックス**: ベクトルインデックスは必要時のみ構築
- **増分更新**: 新しいドキュメントの追加は即座にキャッシュに反映

## Development

### スクリプト

```bash
# 開発モードで実行
npm run dev

# ビルド
npm run build

# 本番環境で実行
npm start

# Lint
npm run lint
npm run lint:fix

# フォーマット
npm run format
npm run format:check
```

### 要件

- Node.js >= 18.0.0
- TypeScript 5.x

## Contributing

貢献は大歓迎です！以下の手順でプルリクエストを送ってください：

1. このリポジトリをフォーク
2. 新しいブランチを作成 (`git checkout -b feature/amazing-feature`)
3. 変更をコミット (`git commit -m 'Add amazing feature'`)
4. ブランチにプッシュ (`git push origin feature/amazing-feature`)
5. プルリクエストを作成

## License

MIT

## Author

Tora29

## Links

- [GitHub Repository](https://github.com/Tora29/claude-dev-recorder)
- [Report Issues](https://github.com/Tora29/claude-dev-recorder/issues)
- [MCP Documentation](https://modelcontextprotocol.io)
- [Claude Code](https://claude.com/claude-code)

## Acknowledgments

このプロジェクトは以下のツールを使用しています：

- [@modelcontextprotocol/sdk](https://github.com/anthropics/modelcontextprotocol) - MCP SDK
- [vectra](https://github.com/Stevenic/vectra) - ベクトルデータベース
- [gray-matter](https://github.com/jonschlinkert/gray-matter) - Frontmatter パーサー
