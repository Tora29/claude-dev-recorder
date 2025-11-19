/**
 * Embeddingsユーティリティ
 * Ollama APIまたはtransformers.jsをフォールバックとして使用してテキストの埋め込みを生成
 * パフォーマンス向上のためキャッシュ機能を含む
 */

import { ConfigManager } from '../services/ConfigManager.js';
import { Logger } from './logger.js';
import * as crypto from 'crypto';

/**
 * Embedding結果の構造
 */
export interface EmbeddingResult {
  embedding: number[];
  model: string;
  cached: boolean;
}

/**
 * キャッシュエントリの構造
 */
interface CacheEntry {
  embedding: number[];
  model: string;
  timestamp: number;
}

/**
 * Ollama APIとtransformers.jsフォールバックを使用したEmbeddingsジェネレータ
 */
export class EmbeddingsGenerator {
  private config: ConfigManager;
  private logger: Logger;
  private cache: Map<string, CacheEntry>;
  private maxCacheSize: number;
  private cacheTTL: number; // ミリ秒単位の有効期限

  constructor() {
    this.config = ConfigManager.getInstance();
    this.logger = new Logger('EmbeddingsGenerator');
    this.cache = new Map();
    this.maxCacheSize = 1000; // キャッシュするEmbeddingの最大数
    this.cacheTTL = 24 * 60 * 60 * 1000; // 24時間
  }

  /**
   * テキストのEmbeddingを生成
   * まずOllamaを試行し、利用できない場合はtransformers.jsにフォールバック
   *
   * @param text - Embeddingを生成するテキスト
   * @param options - オプション設定
   * @returns Embedding結果に解決されるPromise
   */
  async generate(
    text: string,
    options: { useCache?: boolean; model?: string } = {}
  ): Promise<EmbeddingResult> {
    const { useCache = true, model } = options;

    // まずキャッシュをチェック
    if (useCache) {
      const cached = this.getFromCache(text, model);
      if (cached) {
        this.logger.debug('Returning cached embedding');
        return {
          embedding: cached.embedding,
          model: cached.model,
          cached: true,
        };
      }
    }

    // Ollamaが利用可能かチェック
    const ollamaAvailable = await this.isOllamaAvailable();

    let result: EmbeddingResult;

    if (ollamaAvailable) {
      try {
        result = await this.generateWithOllama(text, model);
        this.logger.debug('Generated embedding with Ollama');
      } catch (error) {
        this.logger.warn('Ollama embedding generation failed, falling back', {
          error,
        });
        result = await this.generateWithTransformers(text);
      }
    } else {
      this.logger.debug('Ollama not available, using transformers.js');
      result = await this.generateWithTransformers(text);
    }

    // 結果をキャッシュ
    if (useCache) {
      this.addToCache(text, result, model);
    }

    return result;
  }

  /**
   * 複数のテキストのEmbeddingを生成
   *
   * @param texts - Embeddingを生成するテキストの配列
   * @param options - オプション設定
   * @returns Embedding結果の配列に解決されるPromise
   */
  async generateBatch(
    texts: string[],
    options: { useCache?: boolean; model?: string } = {}
  ): Promise<EmbeddingResult[]> {
    const results = await Promise.all(texts.map((text) => this.generate(text, options)));
    return results;
  }

  /**
   * Ollama APIが利用可能かチェック
   *
   * @returns Ollamaに到達可能な場合はtrueに解決されるPromise、それ以外はfalse
   */
  private async isOllamaAvailable(): Promise<boolean> {
    const endpoint = this.getOllamaEndpoint();

    try {
      const response = await fetch(`${endpoint}/api/tags`, {
        method: 'GET',
        signal: AbortSignal.timeout(2000),
      });

      return response.ok;
    } catch {
      return false;
    }
  }

  /**
   * Ollama APIを使用してEmbeddingを生成
   *
   * @param text - Embeddingを生成するテキスト
   * @param model - オプションのモデル名（デフォルトは設定値）
   * @returns Embedding結果に解決されるPromise
   */
  private async generateWithOllama(text: string, model?: string): Promise<EmbeddingResult> {
    const endpoint = this.getOllamaEndpoint();
    const modelName = model ?? this.getOllamaModel();

    const response = await fetch(`${endpoint}/api/embeddings`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: modelName,
        prompt: text,
      }),
    });

    if (!response.ok) {
      throw new Error(`Ollama API request failed: ${response.status} ${response.statusText}`);
    }

    const data = (await response.json()) as { embedding: number[] };

    return {
      embedding: data.embedding,
      model: modelName,
      cached: false,
    };
  }

  /**
   * transformers.jsを使用してEmbeddingを生成（フォールバック）
   * @xenova/transformersのインストールが必要
   *
   * @param text - Embeddingを生成するテキスト
   * @returns Embedding結果に解決されるPromise
   */
  private async generateWithTransformers(text: string): Promise<EmbeddingResult> {
    try {
      // オプショナル依存関係を許可するための動的インポート
      interface TransformersModule {
        pipeline: (
          task: string,
          model: string
        ) => Promise<
          (text: string, options: Record<string, unknown>) => Promise<{ data: ArrayLike<number> }>
        >;
      }

      // @ts-expect-error - Optional dependency, may not be installed
      const transformers = (await import('@xenova/transformers').catch(
        () => null
      )) as TransformersModule | null;

      if (!transformers) {
        throw new Error('transformers.js not installed');
      }

      // Embeddingには小型で効率的なモデルを使用
      const extractor = await transformers.pipeline(
        'feature-extraction',
        'Xenova/all-MiniLM-L6-v2'
      );

      const output = await extractor(text, {
        pooling: 'mean',
        normalize: true,
      });

      // 通常の配列に変換
      const embedding = Array.from(output.data);

      return {
        embedding,
        model: 'Xenova/all-MiniLM-L6-v2',
        cached: false,
      };
    } catch (error) {
      // transformers.jsがインストールされていないか失敗した場合は、シンプルなハッシュベースのEmbeddingを返す
      this.logger.warn('transformers.js not available or failed, using simple fallback', { error });
      return this.generateSimpleFallback(text);
    }
  }

  /**
   * OllamaとTransformers.jsの両方が利用できない場合にシンプルなフォールバックEmbeddingを生成
   * 文字頻度に基づく基本的なベクトルを作成
   *
   * @param text - Embeddingを生成するテキスト
   * @returns Embedding結果
   */
  private generateSimpleFallback(text: string): EmbeddingResult {
    // シンプルな384次元ベクトルを作成（all-MiniLM-L6-v2に合わせる）
    const dimensions = 384;
    const embedding: number[] = new Array<number>(dimensions).fill(0);

    // 文字頻度を使用してベクトルを埋める
    for (let i = 0; i < text.length; i++) {
      const charCode = text.charCodeAt(i);
      const index = charCode % dimensions;
      const currentVal = embedding[index];
      if (typeof currentVal === 'number') {
        embedding[index] = currentVal + 1;
      }
    }

    // ベクトルを正規化
    const magnitude = Math.sqrt(
      embedding.reduce((sum: number, val) => {
        const numVal = typeof val === 'number' ? val : 0;
        return sum + numVal * numVal;
      }, 0)
    );
    for (let i = 0; i < dimensions; i++) {
      const val = embedding[i];
      embedding[i] = magnitude > 0 && typeof val === 'number' ? val / magnitude : 0;
    }

    return {
      embedding,
      model: 'simple-fallback',
      cached: false,
    };
  }

  /**
   * 設定からOllamaエンドポイントを取得
   *
   * @returns OllamaエンドポイントのURL
   */
  private getOllamaEndpoint(): string {
    try {
      return this.config.getNested('summarizer', 'ollamaEndpoint');
    } catch {
      return 'http://localhost:11434';
    }
  }

  /**
   * 設定からOllamaモデルを取得
   *
   * @returns Ollamaモデル名
   */
  private getOllamaModel(): string {
    try {
      return this.config.getNested('vectorStore', 'embeddingModel');
    } catch {
      // 一般的なEmbeddingモデルをデフォルトとする
      return 'nomic-embed-text';
    }
  }

  /**
   * テキストとモデルからキャッシュキーを生成
   *
   * @param text - テキスト
   * @param model - オプションのモデル名
   * @returns キャッシュキー
   */
  private getCacheKey(text: string, model?: string): string {
    const content = model ? `${model}:${text}` : text;
    return crypto.createHash('sha256').update(content).digest('hex');
  }

  /**
   * キャッシュからEmbeddingを取得
   *
   * @param text - テキスト
   * @param model - オプションのモデル名
   * @returns キャッシュエントリ、見つからないか期限切れの場合はnull
   */
  private getFromCache(text: string, model?: string): CacheEntry | null {
    const key = this.getCacheKey(text, model);
    const entry = this.cache.get(key);

    if (!entry) {
      return null;
    }

    // エントリが期限切れかチェック
    if (Date.now() - entry.timestamp > this.cacheTTL) {
      this.cache.delete(key);
      return null;
    }

    return entry;
  }

  /**
   * キャッシュにEmbeddingを追加
   *
   * @param text - テキスト
   * @param result - Embedding結果
   * @param model - オプションのモデル名
   */
  private addToCache(text: string, result: EmbeddingResult, model?: string): void {
    // キャッシュサイズをチェックし、必要に応じて最も古いエントリを削除
    if (this.cache.size >= this.maxCacheSize) {
      this.evictOldestEntries(Math.floor(this.maxCacheSize * 0.1)); // 10%を削除
    }

    const key = this.getCacheKey(text, model);
    this.cache.set(key, {
      embedding: result.embedding,
      model: result.model,
      timestamp: Date.now(),
    });
  }

  /**
   * 最も古いキャッシュエントリを削除
   *
   * @param count - 削除するエントリの数
   */
  private evictOldestEntries(count: number): void {
    const entries = Array.from(this.cache.entries());
    entries.sort((a, b) => a[1].timestamp - b[1].timestamp);

    for (let i = 0; i < Math.min(count, entries.length); i++) {
      const entry = entries[i];
      if (entry) {
        this.cache.delete(entry[0]);
      }
    }
  }

  /**
   * キャッシュをクリア
   */
  clearCache(): void {
    this.cache.clear();
    this.logger.debug('Cache cleared');
  }

  /**
   * キャッシュ統計を取得
   *
   * @returns キャッシュ統計
   */
  getCacheStats(): {
    size: number;
    maxSize: number;
    ttl: number;
  } {
    return {
      size: this.cache.size,
      maxSize: this.maxCacheSize,
      ttl: this.cacheTTL,
    };
  }

  /**
   * 2つのEmbedding間のコサイン類似度を計算
   *
   * @param a - 1つ目のEmbedding
   * @param b - 2つ目のEmbedding
   * @returns コサイン類似度スコア（0-1）
   */
  static cosineSimilarity(a: number[], b: number[]): number {
    if (a.length !== b.length) {
      throw new Error('Embeddings must have the same dimensions');
    }

    let dotProduct = 0;
    let magnitudeA = 0;
    let magnitudeB = 0;

    for (let i = 0; i < a.length; i++) {
      const valA = a[i] ?? 0;
      const valB = b[i] ?? 0;
      dotProduct += valA * valB;
      magnitudeA += valA * valA;
      magnitudeB += valB * valB;
    }

    const magnitude = Math.sqrt(magnitudeA) * Math.sqrt(magnitudeB);
    return magnitude > 0 ? dotProduct / magnitude : 0;
  }
}
