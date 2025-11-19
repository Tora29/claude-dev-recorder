import * as fs from 'fs/promises';
import * as path from 'path';
import { v4 as uuidv4 } from 'uuid';
import matter from 'gray-matter';
import type { Document, DocumentMetadata, CreateDocParams } from '../models/Document.js';
import { MetadataExtractor } from './MetadataExtractor.js';
import { Summarizer } from './Summarizer.js';
import { Logger } from '../utils/logger.js';

export class DocumentManager {
  private docsDir: string;
  private archiveDir: string;
  private metadataExtractor: MetadataExtractor;
  private summarizer: Summarizer;
  private logger: Logger;

  constructor() {
    this.docsDir = path.join(process.cwd(), '.claude/docs');
    this.archiveDir = path.join(this.docsDir, '.archive');
    this.metadataExtractor = new MetadataExtractor();
    this.summarizer = new Summarizer();
    this.logger = new Logger('DocumentManager');
  }

  /**
   * 初期化処理
   */
  async initialize(): Promise<void> {
    await fs.mkdir(this.docsDir, { recursive: true });
    await fs.mkdir(this.archiveDir, { recursive: true });
    this.logger.info('DocumentManager initialized');
  }

  /**
   * ドキュメントを作成
   */
  async createDocument(params: CreateDocParams): Promise<Document> {
    const { files, prompt, summary: customSummary } = params;

    // メタデータ生成
    const metadata = this.generateMetadata(files, prompt);

    // 本文生成
    const content = await this.generateContent(files, prompt);

    // 要約生成（カスタムサマリがなければ自動生成）
    const summary = customSummary || (await this.summarizer.summarize(content, 100));

    // 各種サマリを設定
    metadata.summary = summary;
    metadata.ultra_summary = await this.summarizer.summarize(content, 50);
    metadata.standard_summary = await this.summarizer.summarize(content, 200);

    // ファイル名生成
    const fileName = this.generateFileName(metadata);
    const filePath = path.join(this.docsDir, fileName);

    // Markdown作成（YAMLフロントマター + 本文）
    const markdown = this.createMarkdown(metadata, content);

    // ファイル保存
    await fs.writeFile(filePath, markdown, 'utf-8');

    this.logger.info('Document created', { id: metadata.id, filePath });

    return {
      metadata,
      content,
      file_path: filePath,
    };
  }

  /**
   * メタデータを生成
   */
  private generateMetadata(files: string[], prompt: string): DocumentMetadata {
    const gitInfo = this.metadataExtractor.getGitInfo();
    const tags = this.metadataExtractor.generateTags(prompt, files);
    const promptHash = this.metadataExtractor.generatePromptHash(prompt);

    return {
      id: uuidv4(),
      created: new Date().toISOString(),
      updated: new Date().toISOString(),
      author: gitInfo.email,
      tags,
      prompt_hash: promptHash,
      related_files: files,
      summary: '',
      ultra_summary: '',
      standard_summary: '',
      embedding_model: 'nomic-embed-text',
      version: '1.0',
    };
  }

  /**
   * ドキュメント本文を生成
   */
  private async generateContent(files: string[], prompt: string): Promise<string> {
    let content = `## 実装概要\n\n${prompt}\n\n`;

    content += `## 実装詳細\n\n`;

    // 各ファイルの変更内容を抽出
    for (const file of files) {
      try {
        const fileContent = await fs.readFile(file, 'utf-8');
        const preview = fileContent.slice(0, 500); // 最初の500文字

        content += `### ${file}\n\n\`\`\`\n${preview}\n...\n\`\`\`\n\n`;
      } catch (error) {
        this.logger.warn('Failed to read file', { file, error });
      }
    }

    content += `## 変更ファイル\n\n`;
    files.forEach((file) => {
      content += `- \`${file}\`\n`;
    });

    return content;
  }

  /**
   * ファイル名を生成
   * 形式: YYYY-MM-DD_UUID_summary.md
   */
  private generateFileName(metadata: DocumentMetadata): string {
    const date = metadata.created.split('T')[0]; // YYYY-MM-DD
    const uuid = metadata.id.split('-')[0]; // 最初のセグメントのみ
    const summary = metadata.summary
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .slice(0, 30);

    return `${date}_${uuid}_${summary}.md`;
  }

  /**
   * Markdownファイルを作成（YAMLフロントマター + 本文）
   */
  private createMarkdown(metadata: DocumentMetadata, content: string): string {
    const frontMatter = matter.stringify(content, metadata);
    return frontMatter;
  }

  /**
   * ドキュメントを取得
   */
  async getDocument(id: string): Promise<Document | null> {
    const files = await fs.readdir(this.docsDir);

    for (const file of files) {
      if (file.startsWith('.')) continue; // 隠しファイルをスキップ

      const filePath = path.join(this.docsDir, file);
      const fileContent = await fs.readFile(filePath, 'utf-8');
      const parsed = matter(fileContent);

      if (parsed.data.id === id) {
        return {
          metadata: parsed.data as DocumentMetadata,
          content: parsed.content,
          file_path: filePath,
        };
      }
    }

    return null;
  }

  /**
   * ドキュメントを検索
   */
  async searchDocuments(query: { keyword?: string; tags?: string[] }): Promise<Document[]> {
    const files = await fs.readdir(this.docsDir);
    const results: Document[] = [];

    for (const file of files) {
      if (file.startsWith('.')) continue;

      const filePath = path.join(this.docsDir, file);
      const fileContent = await fs.readFile(filePath, 'utf-8');
      const parsed = matter(fileContent);
      const metadata = parsed.data as DocumentMetadata;

      // キーワード検索
      if (query.keyword) {
        const lowerKeyword = query.keyword.toLowerCase();
        const inSummary = metadata.summary.toLowerCase().includes(lowerKeyword);
        const inContent = parsed.content.toLowerCase().includes(lowerKeyword);

        if (!inSummary && !inContent) continue;
      }

      // タグフィルタ
      if (query.tags && query.tags.length > 0) {
        const hasTag = query.tags.some((tag) => metadata.tags.includes(tag));
        if (!hasTag) continue;
      }

      results.push({
        metadata,
        content: parsed.content,
        file_path: filePath,
      });
    }

    // 作成日時の新しい順にソート
    results.sort(
      (a, b) => new Date(b.metadata.created).getTime() - new Date(a.metadata.created).getTime()
    );

    return results;
  }

  /**
   * ドキュメントを更新
   */
  async updateDocument(id: string, updates: Partial<DocumentMetadata>): Promise<Document> {
    const doc = await this.getDocument(id);
    if (!doc) {
      throw new Error(`Document not found: ${id}`);
    }

    const updatedMetadata = {
      ...doc.metadata,
      ...updates,
      updated: new Date().toISOString(),
    };

    const markdown = this.createMarkdown(updatedMetadata, doc.content);
    await fs.writeFile(doc.file_path, markdown, 'utf-8');

    this.logger.info('Document updated', { id });

    return {
      ...doc,
      metadata: updatedMetadata,
    };
  }

  /**
   * ドキュメントを削除
   */
  async deleteDocument(id: string): Promise<void> {
    const doc = await this.getDocument(id);
    if (!doc) {
      throw new Error(`Document not found: ${id}`);
    }

    await fs.unlink(doc.file_path);
    this.logger.info('Document deleted', { id });
  }

  /**
   * ドキュメントをアーカイブ
   */
  async archiveDocument(id: string): Promise<void> {
    const doc = await this.getDocument(id);
    if (!doc) {
      throw new Error(`Document not found: ${id}`);
    }

    const fileName = path.basename(doc.file_path);
    const archivePath = path.join(this.archiveDir, fileName);

    await fs.rename(doc.file_path, archivePath);
    this.logger.info('Document archived', { id, archivePath });
  }

  /**
   * 古いドキュメントを整理
   */
  async cleanupOldDocuments(daysThreshold: number): Promise<number> {
    const files = await fs.readdir(this.docsDir);
    const threshold = Date.now() - daysThreshold * 24 * 60 * 60 * 1000;
    let count = 0;

    for (const file of files) {
      if (file.startsWith('.')) continue;

      const filePath = path.join(this.docsDir, file);
      const fileContent = await fs.readFile(filePath, 'utf-8');
      const parsed = matter(fileContent);
      const metadata = parsed.data as DocumentMetadata;

      const createdTime = new Date(metadata.created).getTime();

      if (createdTime < threshold) {
        await this.archiveDocument(metadata.id);
        count++;
      }
    }

    this.logger.info('Cleanup completed', { count });
    return count;
  }

  /**
   * ドキュメントを要約
   */
  async summarizeDocument(doc: Document): Promise<string> {
    const summary = await this.summarizer.summarize(doc.content, 300);

    const formatted = `**${doc.metadata.summary}** (${doc.metadata.created.split('T')[0]})
- ファイル: ${doc.metadata.related_files.join(', ')}
- 概要: ${summary}`;

    return formatted;
  }

  /**
   * 全ドキュメントを取得
   */
  async getAllDocuments(): Promise<Document[]> {
    return await this.searchDocuments({});
  }
}
