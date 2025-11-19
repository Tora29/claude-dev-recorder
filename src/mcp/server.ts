/**
 * MCPサーバー実装
 * メモリキャッシュとツールハンドラを備えたMCP準拠のサーバーを提供します
 */
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { DocumentManager } from '../services/DocumentManager.js';
import { VectorStore } from '../services/VectorStore.js';
import { DocumentMerger } from '../services/DocumentMerger.js';
import { Summarizer } from '../services/Summarizer.js';
import { AuditLogger } from '../services/AuditLogger.js';
import { QualityManager } from '../services/QualityManager.js';
import { Logger } from '../utils/logger.js';
import type { Document } from '../models/Document.js';
import type {
  ProjectContext,
  DocumentWithSimilarity,
  SearchRelatedDocsArgs,
  RecordImplementationArgs,
  ManageDocumentsArgs,
  MergeSimilarDocsArgs,
  SearchByKeywordArgs,
  PreviewMergeArgs,
  CheckDocumentQualityArgs,
  GetDocumentHistoryArgs,
  RollbackMergeArgs,
} from './types.js';
import {
  SearchRelatedDocsSchema,
  RecordImplementationSchema,
  ManageDocumentsSchema,
  MergeSimilarDocsSchema,
  SearchByKeywordSchema,
  PreviewMergeSchema,
  CheckDocumentQualitySchema,
  GetDocumentHistorySchema,
  RollbackMergeSchema,
} from './types.js';
import * as path from 'path';

export class MCPServer {
  private mcpServer: McpServer;
  private documentManager: DocumentManager;
  private vectorStore: VectorStore;
  private documentMerger: DocumentMerger;
  private summarizer: Summarizer;
  private auditLogger: AuditLogger;
  private qualityManager: QualityManager;
  private logger: Logger;

  // メモリキャッシュ
  private documentCache: Map<string, Document> = new Map();
  private projectContext: ProjectContext | null = null;

  constructor() {
    this.mcpServer = new McpServer({
      name: 'claude-dev-recorder',
      version: '1.0.0',
    });

    this.logger = new Logger('MCPServer');
    this.documentManager = new DocumentManager();
    this.vectorStore = new VectorStore({
      indexPath: path.join(process.cwd(), '.claude/docs/.index'),
    });
    this.summarizer = new Summarizer();
    this.auditLogger = new AuditLogger();
    this.documentMerger = new DocumentMerger(
      this.documentManager,
      this.vectorStore,
      this.summarizer
    );
    this.qualityManager = new QualityManager(this.documentManager, this.documentMerger);
  }

  /**
   * サーバーを起動します
   */
  async start(): Promise<void> {
    await this.initialize();
    this.registerTools();

    const transport = new StdioServerTransport();
    await this.mcpServer.connect(transport);

    this.logger.info('MCP Server started');
  }

  /**
   * すべてのサービスを初期化し、ドキュメントをメモリにロードします
   */
  private async initialize(): Promise<void> {
    this.logger.info('Initializing services...');

    await this.documentManager.initialize();
    await this.auditLogger.initialize();

    // すべてのドキュメントをメモリにロード
    await this.loadAllDocumentsIntoMemory();

    // VectorStoreはオプション - 必要な場合のみ初期化
    // await this.vectorStore.initialize();

    this.logger.info('Services initialized', {
      documentsLoaded: this.documentCache.size,
      memoryUsage: `${(process.memoryUsage().heapUsed / 1024 / 1024).toFixed(2)} MB`,
    });
  }

  /**
   * すべてのドキュメントをメモリキャッシュにロードします
   */
  private async loadAllDocumentsIntoMemory(): Promise<void> {
    this.logger.info('Loading all documents into memory...');

    const allDocs = await this.documentManager.getAllDocuments();

    // メモリキャッシュに格納
    for (const doc of allDocs) {
      this.documentCache.set(doc.metadata.id, doc);
    }

    // プロジェクトコンテキスト（インデックス）を構築
    this.projectContext = this.buildProjectContext(allDocs);

    this.logger.info('All documents loaded into memory', {
      count: allDocs.length,
      memoryUsage: `${(process.memoryUsage().heapUsed / 1024 / 1024).toFixed(2)} MB`,
    });
  }

  /**
   * プロジェクトコンテキストを構築します（高速検索用のインデックス）
   */
  private buildProjectContext(docs: Document[]): ProjectContext {
    const byDate = new Map<string, Document[]>();
    const byTag = new Map<string, Document[]>();
    const byFile = new Map<string, Document[]>();

    for (const doc of docs) {
      // 日付でインデックス化
      const date = doc.metadata.created.split('T')[0]!;
      if (!byDate.has(date)) {
        byDate.set(date, []);
      }
      byDate.get(date)!.push(doc);

      // タグでインデックス化
      for (const tag of doc.metadata.tags) {
        if (!byTag.has(tag)) {
          byTag.set(tag, []);
        }
        byTag.get(tag)!.push(doc);
      }

      // ファイルでインデックス化
      for (const file of doc.metadata.related_files) {
        if (!byFile.has(file)) {
          byFile.set(file, []);
        }
        byFile.get(file)!.push(doc);
      }
    }

    return { byDate, byTag, byFile, allDocs: docs };
  }

  /**
   * MCPツールを登録します
   */
  private registerTools(): void {
    // 1. search_related_docs
    this.mcpServer.registerTool(
      'search_related_docs',
      {
        title: 'Search Related Documents',
        description:
          'Search for documents related to a prompt. Returns recent implementations and semantically similar documents.',
        inputSchema: SearchRelatedDocsSchema,
      },
      ({ prompt, maxResults, threshold }) => {
        this.logger.debug('Tool called: search_related_docs', { prompt, maxResults, threshold });
        const result = this.handleSearchRelatedDocs({
          prompt,
          ...(maxResults !== undefined && { maxResults }),
          ...(threshold !== undefined && { threshold }),
        });
        return {
          content: result.content,
        };
      }
    );

    // 2. record_implementation
    this.mcpServer.registerTool(
      'record_implementation',
      {
        title: 'Record Implementation',
        description:
          'Record a new implementation document. Creates a document from changed files and prompt.',
        inputSchema: RecordImplementationSchema,
      },
      async ({ files, prompt, summary }) => {
        this.logger.debug('Tool called: record_implementation', { files, prompt, summary });
        const result = await this.handleRecordImplementation({
          files,
          prompt,
          ...(summary !== undefined && { summary }),
        });
        return {
          content: result.content,
        };
      }
    );

    // 3. manage_documents
    this.mcpServer.registerTool(
      'manage_documents',
      {
        title: 'Manage Documents',
        description: 'Manage documents (archive or delete). Use for cleanup operations.',
        inputSchema: ManageDocumentsSchema,
      },
      async ({ action, docId }) => {
        this.logger.debug('Tool called: manage_documents', { action, docId });
        const result = await this.handleManageDocuments({ action, docId });
        return {
          content: result.content,
        };
      }
    );

    // 4. merge_similar_docs
    this.mcpServer.registerTool(
      'merge_similar_docs',
      {
        title: 'Merge Similar Documents',
        description:
          'Detect and merge similar documents. Reduces duplication and consolidates related implementations.',
        inputSchema: MergeSimilarDocsSchema,
      },
      async ({ threshold, autoMerge }) => {
        this.logger.debug('Tool called: merge_similar_docs', { threshold, autoMerge });
        const result = await this.handleMergeSimilarDocs({
          ...(threshold !== undefined && { threshold }),
          ...(autoMerge !== undefined && { autoMerge }),
        });
        return {
          content: result.content,
        };
      }
    );

    // 5. search_by_keyword
    this.mcpServer.registerTool(
      'search_by_keyword',
      {
        title: 'Search by Keyword',
        description:
          'Search documents by keyword and tags. Useful for finding specific implementations.',
        inputSchema: SearchByKeywordSchema,
      },
      async ({ keyword, tags }) => {
        this.logger.debug('Tool called: search_by_keyword', { keyword, tags });
        const result = await this.handleSearchByKeyword({
          keyword,
          ...(tags !== undefined && { tags }),
        });
        return {
          content: result.content,
        };
      }
    );

    // 6. preview_merge
    this.mcpServer.registerTool(
      'preview_merge',
      {
        title: 'Preview Merge',
        description:
          'Preview merge results before executing. Shows what will be merged and estimated quality.',
        inputSchema: PreviewMergeSchema,
      },
      async ({ threshold }) => {
        this.logger.debug('Tool called: preview_merge', { threshold });
        const result = await this.handlePreviewMerge({
          ...(threshold !== undefined && { threshold }),
        });
        return {
          content: result.content,
        };
      }
    );

    // 7. check_document_quality
    this.mcpServer.registerTool(
      'check_document_quality',
      {
        title: 'Check Document Quality',
        description:
          'Check document quality and detect issues. Returns a comprehensive quality report.',
        inputSchema: CheckDocumentQualitySchema,
      },
      async ({ fix }) => {
        this.logger.debug('Tool called: check_document_quality', { fix });
        const result = await this.handleCheckDocumentQuality({
          ...(fix !== undefined && { fix }),
        });
        return {
          content: result.content,
        };
      }
    );

    // 8. get_document_history
    this.mcpServer.registerTool(
      'get_document_history',
      {
        title: 'Get Document History',
        description: 'Get the change history of a document. Returns all changes and modifications.',
        inputSchema: GetDocumentHistorySchema,
      },
      async ({ docId }) => {
        this.logger.debug('Tool called: get_document_history', { docId });
        const result = await this.handleGetDocumentHistory({ docId });
        return {
          content: result.content,
        };
      }
    );

    // 9. rollback_merge
    this.mcpServer.registerTool(
      'rollback_merge',
      {
        title: 'Rollback Merge',
        description: 'Rollback a merge operation. Restores the original documents from archive.',
        inputSchema: RollbackMergeSchema,
      },
      async ({ mergedDocId }) => {
        this.logger.debug('Tool called: rollback_merge', { mergedDocId });
        const result = await this.handleRollbackMerge({ mergedDocId });
        return {
          content: result.content,
        };
      }
    );

    this.logger.info('All tools registered successfully');
  }

  /**
   * search_related_docsツールを処理します
   */
  private handleSearchRelatedDocs(args: SearchRelatedDocsArgs): CallToolResult {
    const { prompt, maxResults = 3 } = args;

    this.logger.debug('Searching related docs in memory', { prompt });

    // 高速なメモリ内検索
    const recentDocs = this.getRecentDocumentsFromMemory(5);
    const relatedDocs = this.searchInMemory(prompt, maxResults);

    // 結果をフォーマット
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
   * メモリ内で関連ドキュメントを検索します
   */
  private searchInMemory(query: string, limit: number): Document[] {
    const queryLower = query.toLowerCase();
    const results: Array<{ doc: Document; score: number }> = [];

    for (const doc of this.documentCache.values()) {
      let score = 0;

      // サマリーとのマッチング
      if (doc.metadata.summary.toLowerCase().includes(queryLower)) {
        score += 10;
      }

      // タグとのマッチング
      for (const tag of doc.metadata.tags) {
        if (queryLower.includes(tag.toLowerCase())) {
          score += 5;
        }
      }

      // ファイルとのマッチング
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
   * メモリから最近のドキュメントを取得します
   */
  private getRecentDocumentsFromMemory(count: number): Document[] {
    if (!this.projectContext) return [];

    const sorted = Array.from(this.documentCache.values()).sort(
      (a, b) => new Date(b.metadata.created).getTime() - new Date(a.metadata.created).getTime()
    );

    return sorted.slice(0, count);
  }

  /**
   * record_implementationツールを処理します
   */
  private async handleRecordImplementation(
    args: RecordImplementationArgs
  ): Promise<CallToolResult> {
    const { files, prompt, summary } = args;

    this.logger.debug('Recording implementation', { files });

    // 1. ドキュメントを作成（ファイルシステムに保存）
    const doc = await this.documentManager.createDocument({
      files,
      prompt,
      ...(summary ? { summary } : {}),
    });

    // 2. メモリキャッシュに即座に追加
    this.documentCache.set(doc.metadata.id, doc);
    this.updateProjectContext(doc);

    this.logger.info('Document added to memory cache', {
      id: doc.metadata.id,
      cacheSize: this.documentCache.size,
      memoryUsage: `${(process.memoryUsage().heapUsed / 1024 / 1024).toFixed(2)} MB`,
    });

    // 3. メモリ内で類似ドキュメントをチェック（超高速）
    const similarDocs = this.findSimilarInMemory(doc, 0.9);

    // 4. 監査ログに記録
    await this.auditLogger.log({
      timestamp: new Date().toISOString(),
      action: 'document_created',
      actor: doc.metadata.author as string,
      details: {
        doc_id: doc.metadata.id,
        files: doc.metadata.related_files,
      },
      impact: 'low',
    });

    // 5. レスポンスを生成
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
   * メモリ内で類似ドキュメントを検索します
   */
  private findSimilarInMemory(newDoc: Document, threshold: number = 0.9): DocumentWithSimilarity[] {
    const results: DocumentWithSimilarity[] = [];

    for (const [id, doc] of this.documentCache) {
      if (id === newDoc.metadata.id) continue;

      let similarity = 0;

      // ファイルの重複（重み: 60%）
      const fileOverlap = this.calculateFileOverlap(
        newDoc.metadata.related_files,
        doc.metadata.related_files
      );
      similarity += fileOverlap * 0.6;

      // タグの類似度（重み: 20%）
      const commonTags = newDoc.metadata.tags.filter((tag) => doc.metadata.tags.includes(tag));
      const tagSimilarity =
        commonTags.length / Math.max(newDoc.metadata.tags.length, doc.metadata.tags.length);
      similarity += tagSimilarity * 0.2;

      // キーワードの類似度（重み: 20%）
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
   * 新しいドキュメントでプロジェクトコンテキストを更新します
   */
  private updateProjectContext(doc: Document): void {
    if (!this.projectContext) return;

    // 日付インデックスに追加
    const date = doc.metadata.created.split('T')[0]!;
    if (!this.projectContext.byDate.has(date)) {
      this.projectContext.byDate.set(date, []);
    }
    this.projectContext.byDate.get(date)!.push(doc);

    // タグインデックスに追加
    for (const tag of doc.metadata.tags) {
      if (!this.projectContext.byTag.has(tag)) {
        this.projectContext.byTag.set(tag, []);
      }
      this.projectContext.byTag.get(tag)!.push(doc);
    }

    // ファイルインデックスに追加
    for (const file of doc.metadata.related_files) {
      if (!this.projectContext.byFile.has(file)) {
        this.projectContext.byFile.set(file, []);
      }
      this.projectContext.byFile.get(file)!.push(doc);
    }

    this.projectContext.allDocs.push(doc);
  }

  /**
   * ファイルの重複率を計算します
   */
  private calculateFileOverlap(filesA: string[], filesB: string[]): number {
    if (filesA.length === 0 || filesB.length === 0) return 0;

    const setA = new Set(filesA);
    const setB = new Set(filesB);
    const intersection = new Set([...setA].filter((f) => setB.has(f)));

    return intersection.size / Math.max(filesA.length, filesB.length);
  }

  /**
   * キーワードの類似度を計算します
   */
  private calculateKeywordSimilarity(textA: string, textB: string): number {
    const wordsA = new Set(textA.toLowerCase().split(/\s+/));
    const wordsB = new Set(textB.toLowerCase().split(/\s+/));
    const intersection = new Set([...wordsA].filter((w) => wordsB.has(w)));

    return intersection.size / Math.max(wordsA.size, wordsB.size);
  }

  /**
   * 類似ドキュメントを含む作成レスポンスをフォーマットします
   */
  private formatCreationWithSimilarDocs(
    doc: Document,
    similarDocs: DocumentWithSimilarity[]
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
   * 検索結果をフォーマットします
   */
  private formatSearchResultsWithRecent(recentDocs: Document[], relatedDocs: Document[]): string {
    let result = '## 最近の実装\n\n';

    if (recentDocs.length > 0) {
      recentDocs.forEach((doc) => {
        const date = doc.metadata.created.split('T')[0];
        result += `• ${doc.metadata.ultra_summary || doc.metadata.summary} (${date})\n`;
      });
    } else {
      result += 'なし\n';
    }

    result += '\n## 関連する過去の実装\n\n';

    if (relatedDocs.length > 0) {
      relatedDocs.forEach((doc, i) => {
        result += `### ${i + 1}. ${doc.metadata.summary}\n`;
        result += `${doc.metadata.standard_summary || doc.metadata.summary}\n\n`;
      });
    } else {
      result += '関連する実装が見つかりませんでした。\n';
    }

    return result;
  }

  /**
   * manage_documentsツールを処理します
   */
  private async handleManageDocuments(args: ManageDocumentsArgs): Promise<CallToolResult> {
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

        // メモリキャッシュから削除
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
        throw new Error(`Unknown action: ${String(action)}`);
    }
  }

  /**
   * search_by_keywordツールを処理します
   */
  private async handleSearchByKeyword(args: SearchByKeywordArgs): Promise<CallToolResult> {
    const { keyword, tags } = args;

    const results = await this.documentManager.searchDocuments({
      keyword,
      ...(tags ? { tags } : {}),
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
   * merge_similar_docsツールを処理します
   */
  private async handleMergeSimilarDocs(args: MergeSimilarDocsArgs): Promise<CallToolResult> {
    const { threshold = 0.85 } = args;

    this.logger.debug('Merging similar docs', { threshold });

    // マージを実行
    const result = await this.documentMerger.executeMerge(threshold);

    // マージ後にメモリキャッシュを再ロード
    await this.loadAllDocumentsIntoMemory();

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
   * preview_mergeツールを処理します
   */
  private async handlePreviewMerge(args: PreviewMergeArgs): Promise<CallToolResult> {
    const { threshold = 0.85 } = args;

    this.logger.debug('Previewing merge', { threshold });

    const previews = await this.qualityManager.generateMergePreview(threshold);

    if (previews.length === 0) {
      return {
        content: [
          {
            type: 'text',
            text: '統合可能な類似ドキュメントは見つかりませんでした。',
          },
        ],
      };
    }

    const formatted = previews
      .map((preview, i) => {
        const group = preview.group;
        const docs = group.documents.map((d) => d.metadata.summary).join(', ');
        return `
## 統合グループ ${i + 1}
- 類似度: ${Math.round(group.similarity * 100)}%
- ドキュメント数: ${group.documents.length}件
- ドキュメント: ${docs}
- 推定品質: ${Math.round(preview.estimatedQuality)}点

### プレビュー
${preview.previewContent}
`;
      })
      .join('\n---\n');

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
   * check_document_qualityツールを処理します
   */
  private async handleCheckDocumentQuality(
    args: CheckDocumentQualityArgs
  ): Promise<CallToolResult> {
    const { fix = false } = args;

    this.logger.debug('Checking document quality', { fix });

    const report = await this.qualityManager.checkDocumentQuality(fix);

    const formatted = `
# ドキュメント品質レポート

## 概要
- 総ドキュメント数: ${report.totalDocuments}件
- 平均スコア: ${report.averageScore.toFixed(2)}点

## 検出された問題
${
  report.issues.length > 0
    ? report.issues
        .map((issue) => `- [${issue.severity}] ${issue.message} (ID: ${issue.docId})`)
        .join('\n')
    : 'なし'
}

## 推奨事項
${
  report.recommendations.length > 0
    ? report.recommendations.map((r) => `- ${r}`).join('\n')
    : 'なし'
}
`;

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
   * get_document_historyツールを処理します
   */
  private async handleGetDocumentHistory(args: GetDocumentHistoryArgs): Promise<CallToolResult> {
    const { docId } = args;

    const doc = await this.documentManager.getDocument(docId);

    if (!doc) {
      return {
        content: [
          {
            type: 'text',
            text: `ドキュメントが見つかりませんでした: ${docId}`,
          },
        ],
      };
    }

    const changeLog = doc.metadata.change_log || [];

    if (changeLog.length === 0) {
      return {
        content: [
          {
            type: 'text',
            text: `変更履歴がありません: ${docId}`,
          },
        ],
      };
    }

    const formatted = `
# ドキュメント変更履歴

**ドキュメントID:** ${docId}
**サマリー:** ${doc.metadata.summary}

## 変更履歴
${changeLog
  .map(
    (entry) => `
- **${entry.timestamp}** - ${entry.action}
  - 実行者: ${entry.author}
  ${entry.reason ? `- 理由: ${entry.reason}` : ''}
`
  )
  .join('\n')}
`;

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
   * rollback_mergeツールを処理します
   */
  private async handleRollbackMerge(args: RollbackMergeArgs): Promise<CallToolResult> {
    const { mergedDocId } = args;

    this.logger.debug('Rolling back merge', { mergedDocId });

    const doc = await this.documentManager.getDocument(mergedDocId);

    if (!doc) {
      return {
        content: [
          {
            type: 'text',
            text: `ドキュメントが見つかりませんでした: ${mergedDocId}`,
          },
        ],
      };
    }

    if (!doc.metadata.is_merged || !doc.metadata.merged_from) {
      return {
        content: [
          {
            type: 'text',
            text: `このドキュメントは統合ドキュメントではありません: ${mergedDocId}`,
          },
        ],
      };
    }

    // TODO: ロールバックロジックを実装
    // これには以下が含まれます:
    // 1. merged_from配列からアーカイブされたドキュメントを復元
    // 2. 統合ドキュメントを削除
    // 3. メモリキャッシュを更新

    return {
      content: [
        {
          type: 'text',
          text: `ロールバック機能は現在開発中です。\n統合元ドキュメント: ${doc.metadata.merged_from.join(', ')}`,
        },
      ],
    };
  }

  /**
   * サーバーをシャットダウンします
   */
  async shutdown(): Promise<void> {
    this.logger.info('Shutting down MCP Server');
    await this.mcpServer.close();
  }
}
