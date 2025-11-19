/**
 * 要約サービス
 * Ollama APIを使用したテキスト要約を提供し、シンプルな抽出にフォールバック
 */

import { ConfigManager } from './ConfigManager.js';
import { Logger } from '../utils/logger.js';

export class Summarizer {
  private config: ConfigManager;
  private logger: Logger;

  constructor() {
    this.config = ConfigManager.getInstance();
    this.logger = new Logger('Summarizer');
  }

  /**
   * テキストコンテンツを要約
   * まずOllama APIを試行し、利用できない場合はシンプルな抽出にフォールバック
   *
   * @param content - 要約するテキストコンテンツ
   * @param maxLength - 要約の最大文字数
   * @returns 要約テキストに解決されるPromise
   */
  async summarize(content: string, maxLength: number): Promise<string> {
    // Ollamaが利用可能かチェック
    const ollamaAvailable = await this.isOllamaAvailable();

    if (ollamaAvailable) {
      try {
        return await this.summarizeWithOllama(content, maxLength);
      } catch (error) {
        this.logger.warn('Ollama summarization failed, falling back', { error });
      }
    }

    // フォールバック: シンプルなテキスト抽出
    return this.fallbackSummarize(content, maxLength);
  }

  /**
   * Ollama APIが利用可能かチェック
   *
   * @returns Ollamaに到達可能な場合はtrueに解決されるPromise、それ以外はfalse
   */
  private async isOllamaAvailable(): Promise<boolean> {
    const endpoint = this.config.getNested('summarizer', 'ollamaEndpoint');

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
   * Ollama APIを使用してテキストを要約
   *
   * @param content - 要約するテキストコンテンツ
   * @param maxLength - 要約の最大文字数
   * @returns AI生成の要約に解決されるPromise
   */
  private async summarizeWithOllama(content: string, maxLength: number): Promise<string> {
    const endpoint = this.config.getNested('summarizer', 'ollamaEndpoint');
    const model = this.config.getNested('summarizer', 'ollamaModel');

    const prompt = `以下のテキストを${maxLength}文字以内で要約してください。重要なポイントのみを簡潔にまとめてください。\n\n${content}`;

    const response = await fetch(`${endpoint}/api/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model,
        prompt,
        stream: false,
        options: {
          temperature: 0.3,
          num_predict: Math.floor(maxLength / 2), // おおよそのトークン数
        },
      }),
    });

    if (!response.ok) {
      throw new Error(`Ollama API request failed: ${response.status} ${response.statusText}`);
    }

    const data = (await response.json()) as { response: string };
    return data.response.trim();
  }

  /**
   * AIなしのフォールバック要約
   * 最初の段落を抽出し、最大長に切り詰める
   *
   * @param content - 要約するテキストコンテンツ
   * @param maxLength - 要約の最大文字数
   * @returns 抽出/切り詰められた要約
   */
  private fallbackSummarize(content: string, maxLength: number): string {
    // 最初の段落を抽出
    const firstParagraphOrUndefined = content.split('\n\n')[0];
    const firstParagraph = firstParagraphOrUndefined ?? '';

    // コンテンツがない場合は空を返す
    if (!firstParagraph) {
      return '';
    }

    // 必要に応じて最大長に切り詰め
    if (firstParagraph.length <= maxLength) {
      return firstParagraph;
    }

    return firstParagraph.slice(0, maxLength - 3) + '...';
  }

  /**
   * テキストコンテンツから要点を抽出
   * マークダウン見出しを抽出するシンプルな実装
   *
   * @param content - 分析するテキストコンテンツ
   * @returns 要点の配列に解決されるPromise
   */
  extractKeyPoints(content: string): string[] {
    // シンプルな実装: 見出しを抽出
    const lines = content.split('\n');
    const keyPoints: string[] = [];

    for (const line of lines) {
      if (line.startsWith('##')) {
        keyPoints.push(line.replace(/^#+\s*/, '').trim());
      }
    }

    return keyPoints;
  }
}
