# 並列実装プロンプト集

このドキュメントには、claude-dev-recorderを並列実装するための完全に独立したプロンプトが含まれています。

---

## 📋 事前準備

以下を実行してから各フェーズを開始してください：

```bash
# プロジェクトルートで実行
npm init -y
npm install --save-dev typescript @types/node
npx tsc --init

# ディレクトリ作成
mkdir -p src/{mcp,services,models,utils,setup} templates/{hooks,git-hooks} scripts
```

---

## 🚀 フェーズ1: 基盤コンポーネント（5並列）

**重要**: 以下の5つのプロンプトを同時に実行してください（5並列）

### プロンプト 1-1: MetadataExtractor

```
設計書を参照して MetadataExtractor を実装してください：

参照ドキュメント:
- docs/design/03_detailed_design/07_metadata_extractor.md

実装先:
- src/services/MetadataExtractor.ts

実装内容:
1. Git情報取得（user.email, user.name, branch）
2. 変更ファイル検出
3. タグ自動生成（プロンプトとファイルパスから）
4. プロンプトハッシュ生成（SHA-256）

依存:
- なし（標準ライブラリのみ）

完了条件:
- TypeScriptコンパイルエラーなし
- すべてのメソッドが実装されている
- エラーハンドリングが適切
```

### プロンプト 1-2: SensitiveDataDetector

```
設計書を参照して SensitiveDataDetector を実装してください：

参照ドキュメント:
- docs/design/03_detailed_design/05_sensitive_data_detector.md
- docs/design/02_basic_design/03_data_design.md（機密パターン設定）

実装先:
- src/services/SensitiveDataDetector.ts
- templates/sensitive-patterns.json

実装内容:
1. デフォルトパターンの定義（API_KEY, OpenAI, GitHub, AWS等）
2. 機密情報検出メソッド
3. 自動マスキングメソッド
4. カスタムパターン読み込み
5. ホワイトリスト機能

依存:
- なし（標準ライブラリのみ）

完了条件:
- TypeScriptコンパイルエラーなし
- デフォルトパターン6種類以上定義
- テンプレートファイル作成済み
```

### プロンプト 1-3: AuditLogger

```
設計書を参照して AuditLogger を実装してください：

参照ドキュメント:
- docs/design/03_detailed_design/08_audit_logger.md
- docs/design/02_basic_design/03_data_design.md（監査ログ設計）

実装先:
- src/services/AuditLogger.ts
- src/models/AuditLogEntry.ts

実装内容:
1. ログ記録（JSON形式で追記）
2. ログ検索（フィルタリング）
3. ログローテーション（1MB超過時）
4. 古いログ削除

依存:
- なし（標準ライブラリのみ）

完了条件:
- TypeScriptコンパイルエラーなし
- JSON形式でログ出力
- ローテーション機能実装
```

### プロンプト 1-4: FileWatcher

```
設計書を参照して FileWatcher を実装してください：

参照ドキュメント:
- docs/design/03_detailed_design/03_file_watcher.md

実装先:
- src/services/FileWatcher.ts

実装内容:
1. fs.watch() でディレクトリ監視
2. ファイル変更検知
3. 定期同期（1分ごと）
4. 新規ファイル検出

依存:
- なし（標準ライブラリのみ）

完了条件:
- TypeScriptコンパイルエラーなし
- fs.watch() 正しく実装
- コールバック機能実装
```

### プロンプト 1-5: ConfigManager

```
設計書を参照して ConfigManager を実装してください：

参照ドキュメント:
- docs/design/02_basic_design/03_data_design.md（設定ファイル形式）

実装先:
- src/services/ConfigManager.ts
- src/models/Config.ts
- templates/recorder.config.json

実装内容:
1. 設定ファイル読み込み（.claude/recorder.config.json）
2. get/set メソッド
3. デフォルト設定の提供
4. 設定検証

テンプレート作成:
- templates/recorder.config.json にデフォルト設定を記載
- summarizer, documentManager, search, git, fileWatcher, integrityChecker, sensitiveData, logging セクション

依存:
- なし（標準ライブラリのみ）

完了条件:
- TypeScriptコンパイルエラーなし
- テンプレートファイル作成済み
- 型定義完備
```

---

## 🚀 フェーズ2: サポートコンポーネント（5並列）

**重要**: フェーズ1完了後、以下の5つを同時に実行

### プロンプト 2-1: Summarizer

```
設計書を参照して Summarizer を実装してください：

参照ドキュメント:
- docs/design/03_detailed_design/06_summarizer.md

実装先:
- src/services/Summarizer.ts

実装内容:
1. Ollama APIで要約生成
2. Ollama接続チェック
3. Fallback要約（AI不要）
4. キーポイント抽出

依存:
- ConfigManager（フェーズ1で実装済み）

完了条件:
- TypeScriptコンパイルエラーなし
- Ollama使用可能/不可の両方に対応
- Fallback実装済み
```

### プロンプト 2-2: IntegrityChecker

```
設計書を参照して IntegrityChecker を実装してください：

参照ドキュメント:
- docs/design/03_detailed_design/04_integrity_checker.md

実装先:
- src/services/IntegrityChecker.ts

実装内容:
1. 整合性チェック実行
2. メタデータ検証（UUID形式、必須フィールド）
3. 未完了操作検出
4. 自動リカバリ

依存:
- AuditLogger（フェーズ1で実装済み）

完了条件:
- TypeScriptコンパイルエラーなし
- UUID検証ロジック実装
- リカバリ機能実装
```

### プロンプト 2-3: Logger utility

```
ロギングユーティリティを実装してください：

実装先:
- src/utils/logger.ts

実装内容:
1. ログレベル（debug, info, warn, error）
2. ログフォーマット（タイムスタンプ、コンポーネント名）
3. ファイル出力
4. DEBUG環境変数対応

依存:
- なし

完了条件:
- TypeScriptコンパイルエラーなし
- 4つのログレベル実装
- ファイル出力機能
```

### プロンプト 2-4: fileSystem utility

```
ファイルシステムユーティリティを実装してください：

実装先:
- src/utils/fileSystem.ts

実装内容:
1. パス検証（.claude/ 配下のみ許可）
2. 安全なファイル読み込み
3. 安全なファイル書き込み
4. ディレクトリ作成

依存:
- なし

完了条件:
- TypeScriptコンパイルエラーなし
- パス検証ロジック実装
- エラーハンドリング適切
```

### プロンプト 2-5: gitUtils utility

```
Gitユーティリティを実装してください：

実装先:
- src/utils/gitUtils.ts

実装内容:
1. Git設定取得（user.email, user.name）
2. 現在のブランチ取得
3. 変更ファイル一覧取得
4. エラーハンドリング（Git未初期化時）

依存:
- なし

完了条件:
- TypeScriptコンパイルエラーなし
- child_process.execSync 使用
- Git未初期化でもエラーにならない
```

---

## 🚀 フェーズ3: ドキュメント管理（3並列）

**重要**: フェーズ2完了後、以下の3つを同時に実行

### プロンプト 3-1: DocumentManager

```
設計書を参照して DocumentManager を実装してください：

参照ドキュメント:
- docs/design/03_detailed_design/02_document_manager.md

実装先:
- src/services/DocumentManager.ts
- src/models/Document.ts

実装内容:
1. ドキュメント作成（createDocument）
2. ドキュメント取得（getDocument）
3. ドキュメント検索（searchDocuments）
4. ドキュメント更新（updateDocument）
5. ドキュメント削除（deleteDocument）
6. アーカイブ（archiveDocument）
7. クリーンアップ（cleanupOldDocuments）
8. YAMLフロントマター処理（gray-matter使用）

依存:
- MetadataExtractor（フェーズ1）
- Summarizer（フェーズ2）
- gray-matter（npm install gray-matter）

完了条件:
- TypeScriptコンパイルエラーなし
- すべてのCRUD操作実装
- gray-matterで正しくパース
```

### プロンプト 3-2: VectorStore (オプション)

```
設計書を参照して VectorStore を実装してください（オプショナル）：

参照ドキュメント:
- docs/design/03_detailed_design/00_index.md（VectorStoreセクション）

実装先:
- src/services/VectorStore.ts

実装内容:
1. Vectra初期化
2. ドキュメント追加
3. 類似検索
4. ドキュメント削除
5. インデックス再構築

依存:
- vectra（npm install vectra）

注意:
- このコンポーネントはオプションです
- メモリ内検索で十分な場合は実装スキップ可能

完了条件:
- TypeScriptコンパイルエラーなし
- Vectra正しく使用
```

### プロンプト 3-3: embeddings utility

```
埋め込みベクトル生成ユーティリティを実装してください（オプション）：

実装先:
- src/utils/embeddings.ts

実装内容:
1. Ollama embeddings API呼び出し
2. Fallback: transformers.js使用
3. キャッシュ機能

依存:
- @xenova/transformers（オプション、npm install @xenova/transformers）

注意:
- VectorStore使用時のみ必要

完了条件:
- TypeScriptコンパイルエラーなし
- Ollama利用可能時のロジック実装
```

---

## 🚀 フェーズ4: 高度な機能（2並列）

**重要**: フェーズ3完了後、以下の2つを同時に実行

### プロンプト 4-1: DocumentMerger

```
設計書を参照して DocumentMerger を実装してください：

参照ドキュメント:
- docs/design/03_detailed_design/09_document_merger.md

実装先:
- src/services/DocumentMerger.ts

実装内容:
1. 類似ドキュメント検出（detectSimilarDocuments）
2. ドキュメント統合（mergeDocuments）
3. 統合実行（executeMerge）
4. ファイル重複率計算
5. キーワード類似度計算
6. AI統合（unifyWithAI）

依存:
- DocumentManager（フェーズ3）
- Summarizer（フェーズ2）
- VectorStore（オプション）

完了条件:
- TypeScriptコンパイルエラーなし
- 類似度計算ロジック実装
- AI統合機能実装
```

### プロンプト 4-2: QualityManager

```
設計書を参照して QualityManager を実装してください：

参照ドキュメント:
- docs/design/03_detailed_design/10_quality_manager.md

実装先:
- src/services/QualityManager.ts

実装内容:
1. 統合プレビュー生成（generateMergePreview）
2. 品質チェック実行（checkDocumentQuality）
3. 品質スコア算出（calculateQualityScore）
4. 矛盾検出（detectContradictions）
5. 古い情報検出（detectStaleInfo）

依存:
- DocumentManager（フェーズ3）

完了条件:
- TypeScriptコンパイルエラーなし
- スコアリングロジック実装
- 品質チェック機能実装
```

---

## 🚀 フェーズ5: MCPサーバー統合（単独）

**重要**: フェーズ4完了後に実行

### プロンプト 5-1: MCPServer

```
設計書を参照して MCPServer を実装してください：

参照ドキュメント:
- docs/design/03_detailed_design/01_mcp_server.md
- docs/design/02_basic_design/04_deployment_security.md（MCP Tools API）

実装先:
- src/mcp/server.ts
- src/mcp/tools.ts
- src/mcp/types.ts
- src/index.ts（エントリーポイント）

実装内容:
1. MCPサーバー初期化
2. 全ドキュメントのメモリ読み込み
3. プロジェクトコンテキスト構築
4. 全MCPツールの実装:
   - search_related_docs
   - record_implementation
   - preview_merge
   - merge_similar_docs
   - check_document_quality
   - get_document_history
   - rollback_merge
   - manage_documents
   - search_by_keyword
5. メモリ内検索
6. 類似度チェック
7. メモリキャッシュ管理

依存:
- すべてのサービスクラス（フェーズ1-4で実装済み）
- @modelcontextprotocol/sdk（npm install @modelcontextprotocol/sdk）

完了条件:
- TypeScriptコンパイルエラーなし
- 全MCPツール実装
- stdio通信実装
- メモリキャッシュ機能実装
```

---

## 🔧 セットアップスクリプト（フェーズ5と並行可能）

### プロンプト 5-2: セットアップスクリプト

```
設計書を参照してセットアップスクリプトを実装してください：

参照ドキュメント:
- docs/design/02_basic_design/04_deployment_security.md（デプロイメント設計）

実装先:
- scripts/postinstall.js
- scripts/preuninstall.js
- src/setup/installer.ts
- src/setup/validator.ts

実装内容:
1. postinstall.js:
   - .claude/ 存在確認
   - .claude/config.json にMCPサーバー登録
   - フックスクリプト配置
   - ディレクトリ作成
   - Git hooks配置

2. preuninstall.js:
   - ドキュメント数表示
   - 保持されることを通知
   - 設定クリーンアップ

3. installer.ts:
   - セットアップロジック

4. validator.ts:
   - 環境検証

完了条件:
- スクリプト実行可能
- エラーハンドリング適切
- ユーザーに適切な通知
```

---

## 📝 実行手順

### ステップ1: プロジェクト準備

```bash
# package.json を設定
npm init -y

# 依存パッケージインストール
npm install @modelcontextprotocol/sdk gray-matter uuid

# 開発依存
npm install --save-dev typescript @types/node jest @types/jest
```

### ステップ2: フェーズ1実行（5並列）

Claude Codeで以下を実行:

```
以下の5つのコンポーネントを並列で実装してください：

[プロンプト 1-1: MetadataExtractor の内容をコピペ]
[プロンプト 1-2: SensitiveDataDetector の内容をコピペ]
[プロンプト 1-3: AuditLogger の内容をコピペ]
[プロンプト 1-4: FileWatcher の内容をコピペ]
[プロンプト 1-5: ConfigManager の内容をコピペ]
```

### ステップ3: 検証

```bash
npx tsc --noEmit
```

エラーがなければフェーズ2へ

### ステップ4-7: フェーズ2〜5を順次実行

同様に各フェーズのプロンプトを並列実行

---

## ⚠️ 注意事項

1. **並列実行**: Claude Codeで並列Taskを実行する際は、1つのメッセージで複数のTask呼び出しを行う
2. **依存確認**: 各フェーズ開始前に前フェーズの完了を確認
3. **コンパイル**: 各フェーズ後に `npx tsc --noEmit` でエラーチェック
4. **設計書参照**: 各プロンプトに記載された設計書を必ず参照

---

## 📊 進捗管理

- [ ] フェーズ1完了（5並列）
- [ ] フェーズ2完了（5並列）
- [ ] フェーズ3完了（3並列）
- [ ] フェーズ4完了（2並列）
- [ ] フェーズ5完了（単独）
- [ ] 全体テスト
- [ ] npm publish準備
