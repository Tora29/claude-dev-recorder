import { LocalIndex } from 'vectra';
import * as path from 'path';
import * as fs from 'fs/promises';
import { Logger } from '../utils/logger.js';
import { EmbeddingsGenerator } from '../utils/embeddings.js';

const logger = new Logger('VectorStore');

export interface VectorStoreConfig {
  indexPath: string;
  similarityThreshold?: number;
}

export interface DocumentVector {
  id: string;
  text: string;
  metadata?: Record<string, unknown>;
}

export interface SearchResult {
  id: string;
  score: number;
  metadata?: Record<string, unknown>;
}

/**
 * VectorStore - ベクトル検索機能を提供するオプショナルコンポーネント
 *
 * 主な機能:
 * - Vectraを使用したベクトル検索
 * - ドキュメントの追加・削除
 * - 類似度ベースの検索
 * - インデックスの再構築
 */
export class VectorStore {
  private index: LocalIndex | null = null;
  private config: Required<VectorStoreConfig>;
  private initialized = false;
  private embeddings: EmbeddingsGenerator;

  constructor(config: VectorStoreConfig) {
    this.config = {
      indexPath: config.indexPath,
      similarityThreshold: config.similarityThreshold ?? 0.7,
    };
    this.embeddings = new EmbeddingsGenerator();
  }

  /**
   * Vectraインデックスを初期化
   */
  async initialize(): Promise<void> {
    try {
      logger.info('Initializing VectorStore', {
        indexPath: this.config.indexPath,
      });

      // インデックスディレクトリが存在しない場合は作成
      const indexDir = path.dirname(this.config.indexPath);
      await fs.mkdir(indexDir, { recursive: true });

      // Vectraインデックスを作成または読み込み
      this.index = new LocalIndex(this.config.indexPath);

      // インデックスが存在するか確認
      const indexExists = await this.checkIndexExists();

      if (!indexExists) {
        logger.info('Creating new index');
        await this.index.createIndex();
      } else {
        logger.info('Loading existing index');
      }

      this.initialized = true;
      logger.info('VectorStore initialized successfully');
    } catch (error) {
      logger.error('Failed to initialize VectorStore', { error });
      throw new Error(
        `VectorStore initialization failed: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  /**
   * インデックスが存在するか確認
   */
  private async checkIndexExists(): Promise<boolean> {
    try {
      const stats = await fs.stat(this.config.indexPath);
      return stats.isDirectory();
    } catch {
      return false;
    }
  }

  /**
   * 初期化済みかチェック
   */
  private ensureInitialized(): void {
    if (!this.initialized || !this.index) {
      throw new Error('VectorStore is not initialized. Call initialize() first.');
    }
  }

  /**
   * ドキュメントを追加
   *
   * @param document - 追加するドキュメント
   */
  async addDocument(document: DocumentVector): Promise<void> {
    this.ensureInitialized();

    try {
      logger.debug('Adding document to index', { id: document.id });

      // Generate embeddings for the document text
      const embeddingResult = await this.embeddings.generate(document.text);

      await this.index!.insertItem({
        id: document.id,
        vector: embeddingResult.embedding,
        metadata: {
          ...document.metadata,
          text: document.text,
        },
      });

      logger.info('Document added to index', { id: document.id });
    } catch (error) {
      logger.error('Failed to add document', { id: document.id, error });
      throw new Error(
        `Failed to add document: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  /**
   * 複数のドキュメントを一括追加
   *
   * @param documents - 追加するドキュメント配列
   */
  async addDocuments(documents: DocumentVector[]): Promise<void> {
    this.ensureInitialized();

    logger.info('Adding multiple documents', { count: documents.length });

    for (const document of documents) {
      await this.addDocument(document);
    }

    logger.info('All documents added successfully');
  }

  /**
   * 類似ドキュメントを検索
   *
   * @param query - 検索クエリ
   * @param maxResults - 最大結果数
   * @returns 類似度の高い順にソートされた検索結果
   */
  async search(query: string, maxResults = 3): Promise<SearchResult[]> {
    this.ensureInitialized();

    try {
      logger.debug('Searching for similar documents', { query, maxResults });

      // Generate embeddings for the query
      const embeddingResult = await this.embeddings.generate(query);

      // Perform similarity search
      const results = await this.index!.queryItems(embeddingResult.embedding, query, maxResults);

      // Filter by threshold and format results
      const searchResults: SearchResult[] = results
        .filter((result) => result.score >= this.config.similarityThreshold)
        .map((result) => ({
          id: result.item.id,
          score: result.score,
          metadata: result.item.metadata,
        }));

      logger.info('Search completed', {
        query,
        resultsCount: searchResults.length,
      });

      return searchResults;
    } catch (error) {
      logger.error('Search failed', { query, error });
      throw new Error(`Search failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * ドキュメントを削除
   *
   * @param id - 削除するドキュメントID
   */
  async deleteDocument(id: string): Promise<void> {
    this.ensureInitialized();

    try {
      logger.debug('Deleting document from index', { id });

      await this.index!.deleteItem(id);

      logger.info('Document deleted from index', { id });
    } catch (error) {
      logger.error('Failed to delete document', { id, error });
      throw new Error(
        `Failed to delete document: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  /**
   * 複数のドキュメントを一括削除
   *
   * @param ids - 削除するドキュメントID配列
   */
  async deleteDocuments(ids: string[]): Promise<void> {
    this.ensureInitialized();

    logger.info('Deleting multiple documents', { count: ids.length });

    for (const id of ids) {
      await this.deleteDocument(id);
    }

    logger.info('All documents deleted successfully');
  }

  /**
   * インデックスを再構築
   *
   * 既存のインデックスを削除し、新しいインデックスを作成します。
   * データの整合性に問題がある場合や、設定を変更した場合に使用します。
   */
  async rebuildIndex(): Promise<void> {
    try {
      logger.info('Rebuilding index', { indexPath: this.config.indexPath });

      // 既存のインデックスを削除
      if (await this.checkIndexExists()) {
        await fs.rm(this.config.indexPath, { recursive: true, force: true });
        logger.debug('Existing index deleted');
      }

      // 新しいインデックスを作成
      this.initialized = false;
      await this.initialize();

      logger.info('Index rebuilt successfully');
    } catch (error) {
      logger.error('Failed to rebuild index', { error });
      throw new Error(
        `Failed to rebuild index: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  /**
   * インデックス内の全ドキュメントIDを取得
   *
   * @returns ドキュメントID配列
   */
  async listDocuments(): Promise<string[]> {
    this.ensureInitialized();

    try {
      const items = await this.index!.listItems();
      return items.map((item) => item.id);
    } catch (error) {
      logger.error('Failed to list documents', { error });
      throw new Error(
        `Failed to list documents: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  /**
   * インデックスの統計情報を取得
   *
   * @returns インデックスの統計情報
   */
  async getStats(): Promise<{
    documentCount: number;
    indexPath: string;
    similarityThreshold: number;
  }> {
    this.ensureInitialized();

    try {
      const documents = await this.listDocuments();
      return {
        documentCount: documents.length,
        indexPath: this.config.indexPath,
        similarityThreshold: this.config.similarityThreshold,
      };
    } catch (error) {
      logger.error('Failed to get stats', { error });
      throw new Error(
        `Failed to get stats: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  /**
   * リソースをクリーンアップ
   */
  cleanup(): void {
    if (this.index) {
      logger.info('Cleaning up VectorStore');
      // Vectraは特別なクリーンアップが不要
      this.index = null;
      this.initialized = false;
    }
  }
}
