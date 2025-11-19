# MCPServer クラス詳細設計

## ドキュメント情報

| 項目         | 内容                                                                                          |
| ------------ | --------------------------------------------------------------------------------------------- |
| ファイルパス | `src/mcp/server.ts`                                                                           |
| クラス名     | MCPServer                                                                                     |
| 責務         | MCP通信、メモリキャッシュ管理、ツール実装                                                     |
| 依存クラス   | [DocumentManager](./02_document_manager.md), VectorStore, [AuditLogger](./08_audit_logger.md) |

---

## クラス定義

```typescript
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { DocumentManager } from '../services/DocumentManager.js';
import { VectorStore } from '../services/VectorStore.js';
import { Logger } from '../utils/logger.js';

export class MCPServer {
  private server: Server;
  private documentManager: DocumentManager;
  private vectorStore: VectorStore;
  private logger: Logger;

  // ★メモリキャッシュ★
  private documentCache: Map<string, Document> = new Map();
  private projectContext: {
    byDate: Map<string, Document[]>;
    byTag: Map<string, Document[]>;
    byFile: Map<string, Document[]>;
    allDocs: Document[];
  } | null = null;

  constructor() {
    this.server = new Server(
      {
        name: 'claude-dev-recorder',
        version: '1.0.0',
      },
      {
        capabilities: {
          tools: {},
        },
      }
    );

    this.logger = new Logger('MCPServer');
    this.documentManager = new DocumentManager();
    this.vectorStore = new VectorStore();
  }

  /**
   * サーバーを起動
   */
  async start(): Promise<void> {
    await this.initialize();
    this.registerTools();

    const transport = new StdioServerTransport();
    await this.server.connect(transport);

    this.logger.info('MCP Server started');
  }

  /**
   * 初期化処理
   */
  private async initialize(): Promise<void> {
    await this.documentManager.initialize();

    // ★全ドキュメントをメモリに読み込み★
    await this.loadAllDocumentsIntoMemory();

    // VectorStoreは補助的に初期化（オプション）
    // await this.vectorStore.initialize('.claude/docs/.index');

    this.logger.info('Services initialized', {
      documentsLoaded: this.documentCache.size,
      memoryUsage: `${(process.memoryUsage().heapUsed / 1024 / 1024).toFixed(2)} MB`,
    });
  }

  /**
   * 全ドキュメントをメモリに読み込み
   */
  private async loadAllDocumentsIntoMemory(): Promise<void> {
    this.logger.info('Loading all documents into memory...');

    const allDocs = await this.documentManager.getAllDocuments();

    // メモリキャッシュに格納
    for (const doc of allDocs) {
      this.documentCache.set(doc.metadata.id, doc);
    }

    // プロジェクトコンテキスト（インデックス）構築
    this.projectContext = this.buildProjectContext(allDocs);

    this.logger.info('All documents loaded into memory', {
      count: allDocs.length,
      memoryUsage: `${(process.memoryUsage().heapUsed / 1024 / 1024).toFixed(2)} MB`,
    });
  }

  /**
   * プロジェクトコンテキスト構築（高速検索用インデックス）
   */
  private buildProjectContext(docs: Document[]): any {
    const byDate = new Map<string, Document[]>();
    const byTag = new Map<string, Document[]>();
    const byFile = new Map<string, Document[]>();

    for (const doc of docs) {
      // 日付別
      const date = doc.metadata.created.split('T')[0];
      if (!byDate.has(date)) byDate.set(date, []);
      byDate.get(date)!.push(doc);

      // タグ別
      for (const tag of doc.metadata.tags) {
        if (!byTag.has(tag)) byTag.set(tag, []);
        byTag.get(tag)!.push(doc);
      }

      // ファイル別
      for (const file of doc.metadata.related_files) {
        if (!byFile.has(file)) byFile.set(file, []);
        byFile.get(file)!.push(doc);
      }
    }

    return { byDate, byTag, byFile, allDocs: docs };
  }

  /**
   * MCPツールを登録
   */
  private registerTools(): void {
    // search_related_docs
    this.server.setRequestHandler('tools/call', async (request) => {
      const { name, arguments: args } = request.params;

      try {
        switch (name) {
          case 'search_related_docs':
            return await this.handleSearchRelatedDocs(args);
          case 'record_implementation':
            return await this.handleRecordImplementation(args);
          case 'merge_similar_docs':
            return await this.handleMergeSimilarDocs(args);
          case 'manage_documents':
            return await this.handleManageDocuments(args);
          case 'search_by_keyword':
            return await this.handleSearchByKeyword(args);
          default:
            throw new Error(`Unknown tool: ${name}`);
        }
      } catch (error) {
        this.logger.error('Tool execution failed', { name, error });
        throw error;
      }
    });
  }

  /**
   * search_related_docs ツールのハンドラー
   */
  private async handleSearchRelatedDocs(args: any): Promise<any> {
    const { prompt, maxResults = 3 } = args;

    this.logger.debug('Searching related docs in memory', { prompt });

    // ★メモリ内で超高速検索★
    const recentDocs = this.getRecentDocumentsFromMemory(5);
    const relatedDocs = this.searchInMemory(prompt, maxResults);

    // フォーマット
    const formatted = this.formatSearchResultsWithRecent(recentDocs, relatedDocs);

    return {
      content: [
        {
          type: 'text',
          text: formatted,
        },
      ],
    };
  }

  /**
   * メモリ内で関連ドキュメントを検索
   */
  private searchInMemory(query: string, limit: number): Document[] {
    const queryLower = query.toLowerCase();
    const results: Array<{ doc: Document; score: number }> = [];

    for (const doc of this.documentCache.values()) {
      let score = 0;

      // サマリーマッチング
      if (doc.metadata.summary.toLowerCase().includes(queryLower)) {
        score += 10;
      }

      // タグマッチング
      for (const tag of doc.metadata.tags) {
        if (queryLower.includes(tag.toLowerCase())) {
          score += 5;
        }
      }

      // ファイル名マッチング
      for (const file of doc.metadata.related_files) {
        if (queryLower.includes(file.toLowerCase())) {
          score += 3;
        }
      }

      if (score > 0) {
        results.push({ doc, score });
      }
    }

    return results
      .sort((a, b) => b.score - a.score)
      .slice(0, limit)
      .map((r) => r.doc);
  }

  /**
   * メモリから最近のN件を取得
   */
  private getRecentDocumentsFromMemory(count: number): Document[] {
    if (!this.projectContext) return [];

    const sorted = Array.from(this.documentCache.values()).sort(
      (a, b) => new Date(b.metadata.created).getTime() - new Date(a.metadata.created).getTime()
    );

    return sorted.slice(0, count);
  }

  /**
   * record_implementation ツールのハンドラー
   */
  private async handleRecordImplementation(args: any): Promise<any> {
    const { files, prompt, summary } = args;

    this.logger.debug('Recording implementation', { files });

    // 1. ドキュメント作成（ファイルシステムに保存）
    const doc = await this.documentManager.createDocument({
      files,
      prompt,
      summary,
    });

    // 2. 要約を生成（メタデータに追加）
    doc.metadata.ultra_summary = this.generateUltraSummary(doc);
    doc.metadata.standard_summary = await this.summarizer.summarize(doc.content, 200);
    await this.documentManager.updateDocument(doc.metadata.id, doc.metadata);

    // 3. ★メモリキャッシュに即座に追加★
    this.documentCache.set(doc.metadata.id, doc);
    this.updateProjectContext(doc);

    this.logger.info('Document added to memory cache', {
      id: doc.metadata.id,
      cacheSize: this.documentCache.size,
      memoryUsage: `${(process.memoryUsage().heapUsed / 1024 / 1024).toFixed(2)} MB`,
    });

    // 4. メモリ内で類似度チェック（超高速）
    const similarDocs = this.findSimilarInMemory(doc, 0.9);

    // 5. 監査ログ記録
    await this.auditLogger.log({
      timestamp: new Date().toISOString(),
      action: 'document_created',
      actor: doc.metadata.author,
      details: {
        doc_id: doc.metadata.id,
        files: doc.metadata.related_files,
      },
      impact: 'low',
    });

    // 6. レスポンス生成
    if (similarDocs.length > 0) {
      return {
        content: [
          {
            type: 'text',
            text: this.formatCreationWithSimilarDocs(doc, similarDocs),
          },
        ],
      };
    }

    return {
      content: [
        {
          type: 'text',
          text: `実装ドキュメントを作成しました:\n- ID: ${doc.metadata.id}\n- ファイル: ${doc.metadata.related_files.join(', ')}`,
        },
      ],
    };
  }

  /**
   * 新規ドキュメントとの類似度をメモリ内でチェック
   */
  private findSimilarInMemory(
    newDoc: Document,
    threshold: number = 0.9
  ): Array<Document & { similarity: number }> {
    const results: Array<Document & { similarity: number }> = [];

    for (const [id, doc] of this.documentCache) {
      if (id === newDoc.metadata.id) continue;

      let similarity = 0;

      // ファイル重複率（重み: 60%）
      const fileOverlap = this.calculateFileOverlap(
        newDoc.metadata.related_files,
        doc.metadata.related_files
      );
      similarity += fileOverlap * 0.6;

      // タグ一致度（重み: 20%）
      const commonTags = newDoc.metadata.tags.filter((tag) => doc.metadata.tags.includes(tag));
      const tagSimilarity =
        commonTags.length / Math.max(newDoc.metadata.tags.length, doc.metadata.tags.length);
      similarity += tagSimilarity * 0.2;

      // キーワード一致（重み: 20%）
      const keywordSim = this.calculateKeywordSimilarity(
        newDoc.metadata.summary,
        doc.metadata.summary
      );
      similarity += keywordSim * 0.2;

      if (similarity >= threshold) {
        results.push({ ...doc, similarity });
      }
    }

    return results.sort((a, b) => b.similarity - a.similarity);
  }

  /**
   * プロジェクトコンテキスト更新
   */
  private updateProjectContext(doc: Document): void {
    if (!this.projectContext) return;

    // 日付別インデックスに追加
    const date = doc.metadata.created.split('T')[0];
    if (!this.projectContext.byDate.has(date)) {
      this.projectContext.byDate.set(date, []);
    }
    this.projectContext.byDate.get(date)!.push(doc);

    // タグ別インデックスに追加
    for (const tag of doc.metadata.tags) {
      if (!this.projectContext.byTag.has(tag)) {
        this.projectContext.byTag.set(tag, []);
      }
      this.projectContext.byTag.get(tag)!.push(doc);
    }

    // ファイル別インデックスに追加
    for (const file of doc.metadata.related_files) {
      if (!this.projectContext.byFile.has(file)) {
        this.projectContext.byFile.set(file, []);
      }
      this.projectContext.byFile.get(file)!.push(doc);
    }

    this.projectContext.allDocs.push(doc);
  }

  /**
   * ファイル重複率を計算
   */
  private calculateFileOverlap(filesA: string[], filesB: string[]): number {
    if (filesA.length === 0 || filesB.length === 0) return 0;

    const setA = new Set(filesA);
    const setB = new Set(filesB);
    const intersection = new Set([...setA].filter((f) => setB.has(f)));

    return intersection.size / Math.max(filesA.length, filesB.length);
  }

  /**
   * キーワード類似度を計算
   */
  private calculateKeywordSimilarity(textA: string, textB: string): number {
    const wordsA = new Set(textA.toLowerCase().split(/\s+/));
    const wordsB = new Set(textB.toLowerCase().split(/\s+/));
    const intersection = new Set([...wordsA].filter((w) => wordsB.has(w)));

    return intersection.size / Math.max(wordsA.size, wordsB.size);
  }

  /**
   * 超圧縮サマリーを生成
   */
  private generateUltraSummary(doc: Document): string {
    const mainFile = doc.metadata.related_files[0] || '';
    const summary = doc.metadata.summary.slice(0, 30);
    return `${summary} (${mainFile})`;
  }

  /**
   * 作成通知をフォーマット（類似ドキュメントあり）
   */
  private formatCreationWithSimilarDocs(
    doc: Document,
    similarDocs: Array<Document & { similarity: number }>
  ): string {
    let text = `実装ドキュメントを作成しました:\n- ID: ${doc.metadata.id}\n- ファイル: ${doc.metadata.related_files.join(', ')}\n\n`;

    text += `⚠️ 類似するドキュメントを検出しました:\n`;

    for (const similar of similarDocs) {
      const date = similar.metadata.created.split('T')[0];
      const percent = Math.round(similar.similarity * 100);
      text += `\n• ${similar.metadata.summary} (${date})\n`;
      text += `  類似度: ${percent}%\n`;
      text += `  ファイル: ${similar.metadata.related_files.join(', ')}\n`;
    }

    text += `\nこれらを統合しますか？`;

    return text;
  }

  /**
   * 検索結果をフォーマット（最近の実装 + 関連ドキュメント）
   */
  private formatSearchResultsWithRecent(recentDocs: Document[], relatedDocs: Document[]): string {
    let result = '## 最近の実装\n\n';

    if (recentDocs.length > 0) {
      recentDocs.forEach((doc) => {
        const date = doc.metadata.created.split('T')[0];
        result += `• ${doc.metadata.ultra_summary} (${date})\n`;
      });
    } else {
      result += 'なし\n';
    }

    result += '\n## 関連する過去の実装\n\n';

    if (relatedDocs.length > 0) {
      relatedDocs.forEach((doc, i) => {
        result += `### ${i + 1}. ${doc.metadata.summary}\n`;
        result += `${doc.metadata.standard_summary}\n\n`;
      });
    } else {
      result += '関連する実装が見つかりませんでした。\n';
    }

    return result;
  }

  /**
   * manage_documents ツールのハンドラー
   */
  private async handleManageDocuments(args: any): Promise<any> {
    const { action, docId } = args;

    switch (action) {
      case 'archive':
        await this.documentManager.archiveDocument(docId);
        return {
          content: [
            {
              type: 'text',
              text: `ドキュメントをアーカイブしました: ${docId}`,
            },
          ],
        };

      case 'delete':
        await this.documentManager.deleteDocument(docId);

        // ★メモリキャッシュからも削除★
        this.documentCache.delete(docId);
        this.logger.info('Document deleted from memory', { docId });

        return {
          content: [
            {
              type: 'text',
              text: `ドキュメントを削除しました: ${docId}`,
            },
          ],
        };

      default:
        throw new Error(`Unknown action: ${action}`);
    }
  }

  /**
   * search_by_keyword ツールのハンドラー
   */
  private async handleSearchByKeyword(args: any): Promise<any> {
    const { keyword, tags } = args;

    const results = await this.documentManager.searchDocuments({
      keyword,
      tags,
    });

    const formatted = results
      .map(
        (doc, i) =>
          `${i + 1}. ${doc.metadata.summary} (${doc.metadata.created})\n   ファイル: ${doc.file_path}`
      )
      .join('\n\n');

    return {
      content: [
        {
          type: 'text',
          text: formatted || '検索結果がありませんでした。',
        },
      ],
    };
  }

  /**
   * merge_similar_docs ツールのハンドラー
   */
  private async handleMergeSimilarDocs(args: any): Promise<any> {
    const { threshold = 0.85, autoMerge = false } = args;

    this.logger.debug('Merging similar docs', { threshold, autoMerge });

    // DocumentMergerを初期化
    const documentMerger = new DocumentMerger(
      this.documentManager,
      this.vectorStore,
      new Summarizer()
    );

    // 統合処理実行
    const result = await documentMerger.executeMerge(threshold);

    return {
      content: [
        {
          type: 'text',
          text: result,
        },
      ],
    };
  }

  /**
   * サーバーをシャットダウン
   */
  async shutdown(): Promise<void> {
    this.logger.info('Shutting down MCP Server');
    await this.server.close();
  }
}
```

---

## メソッド詳細

| メソッド                          | 引数                      | 戻り値                 | 説明                                           |
| --------------------------------- | ------------------------- | ---------------------- | ---------------------------------------------- |
| `start()`                         | なし                      | `Promise<void>`        | サーバーを起動し、stdioで通信開始              |
| `initialize()`                    | なし                      | `Promise<void>`        | サービス初期化、全ドキュメントメモリ読み込み   |
| `loadAllDocumentsIntoMemory()`    | なし                      | `Promise<void>`        | 全ドキュメントをメモリキャッシュに読み込み     |
| `buildProjectContext()`           | `docs: Document[]`        | `ProjectContext`       | 日付・タグ・ファイル別インデックス構築         |
| `registerTools()`                 | なし                      | `void`                 | MCPツールをサーバーに登録                      |
| `handleSearchRelatedDocs()`       | `args: any`               | `Promise<MCPResponse>` | メモリ内で関連ドキュメント検索                 |
| `searchInMemory()`                | `query, limit`            | `Document[]`           | メモリ内キーワード検索（超高速）               |
| `getRecentDocumentsFromMemory()`  | `count: number`           | `Document[]`           | 最近のN件をメモリから取得                      |
| `handleRecordImplementation()`    | `args: any`               | `Promise<MCPResponse>` | ドキュメント作成 + メモリ追加 + 類似度チェック |
| `findSimilarInMemory()`           | `newDoc, threshold`       | `Document[]`           | メモリ内で類似ドキュメント検出                 |
| `updateProjectContext()`          | `doc: Document`           | `void`                 | インデックスを更新                             |
| `calculateFileOverlap()`          | `filesA, filesB`          | `number`               | ファイル重複率計算                             |
| `calculateKeywordSimilarity()`    | `textA, textB`            | `number`               | キーワード類似度計算                           |
| `generateUltraSummary()`          | `doc: Document`           | `string`               | 超圧縮サマリー生成（~50文字）                  |
| `formatCreationWithSimilarDocs()` | `doc, similarDocs`        | `string`               | ドキュメント作成通知（類似あり）               |
| `formatSearchResultsWithRecent()` | `recentDocs, relatedDocs` | `string`               | 検索結果フォーマット                           |
| `handleMergeSimilarDocs()`        | `args: any`               | `Promise<MCPResponse>` | ドキュメント統合処理                           |
| `handleManageDocuments()`         | `args: any`               | `Promise<MCPResponse>` | ドキュメント管理（メモリからも削除）           |
| `handleSearchByKeyword()`         | `args: any`               | `Promise<MCPResponse>` | キーワード検索処理                             |
| `shutdown()`                      | なし                      | `Promise<void>`        | サーバーをシャットダウン                       |

---

## 関連クラス

- [DocumentManager](./02_document_manager.md) - ドキュメント管理
- [DocumentMerger](./09_document_merger.md) - ドキュメント統合
- [AuditLogger](./08_audit_logger.md) - 監査ログ
- [Summarizer](./06_summarizer.md) - テキスト要約
