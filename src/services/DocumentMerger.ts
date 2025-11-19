/**
 * ドキュメント統合サービス
 * 類似ドキュメント検出、統合処理を提供
 */

import { DocumentManager } from './DocumentManager.js';
import { VectorStore } from './VectorStore.js';
import { Summarizer } from './Summarizer.js';
import type { Document } from '../models/Document.js';
import { Logger } from '../utils/logger.js';

interface DocumentGroup {
  similarity: number;
  documents: Document[];
  reason: 'vector_similarity' | 'file_overlap';
}

export class DocumentMerger {
  private documentManager: DocumentManager;
  private vectorStore: VectorStore;
  private summarizer: Summarizer;
  private logger: Logger;

  constructor(documentManager: DocumentManager, vectorStore: VectorStore, summarizer: Summarizer) {
    this.documentManager = documentManager;
    this.vectorStore = vectorStore;
    this.summarizer = summarizer;
    this.logger = new Logger('DocumentMerger');
  }

  /**
   * 類似ドキュメントを検出
   * @param threshold - 類似度の閾値（0.0〜1.0）
   * @returns 類似ドキュメントのグループ配列
   */
  async detectSimilarDocuments(threshold: number = 0.85): Promise<DocumentGroup[]> {
    const allDocs = await this.getAllActiveDocuments();
    const groups: DocumentGroup[] = [];

    this.logger.info('Detecting similar documents', {
      totalDocs: allDocs.length,
      threshold,
    });

    for (let i = 0; i < allDocs.length; i++) {
      for (let j = i + 1; j < allDocs.length; j++) {
        const docA = allDocs[i];
        const docB = allDocs[j];

        if (!docA || !docB) continue;

        // ベクトル類似度チェック
        const vectorSim = await this.calculateVectorSimilarity(docA, docB);

        // ファイル重複率チェック
        const fileOverlap = this.calculateFileOverlap(
          docA.metadata.related_files,
          docB.metadata.related_files
        );

        // 統合候補判定
        if (vectorSim >= threshold || fileOverlap >= 0.5) {
          groups.push({
            similarity: vectorSim,
            documents: [docA, docB],
            reason: vectorSim >= threshold ? 'vector_similarity' : 'file_overlap',
          });

          this.logger.debug('Similar documents detected', {
            docA: docA.metadata.id,
            docB: docB.metadata.id,
            vectorSim,
            fileOverlap,
            reason: vectorSim >= threshold ? 'vector_similarity' : 'file_overlap',
          });
        }
      }
    }

    // グループをマージ（共通ドキュメントを持つグループを統合）
    const mergedGroups = this.mergeGroups(groups);

    this.logger.info('Detection completed', {
      groupsFound: mergedGroups.length,
    });

    return mergedGroups;
  }

  /**
   * ドキュメントを統合
   * @param docs - 統合するドキュメント配列
   * @returns 統合されたドキュメント
   */
  async mergeDocuments(docs: Document[]): Promise<Document> {
    if (docs.length < 2) {
      throw new Error('At least 2 documents are required for merging');
    }

    this.logger.info('Merging documents', {
      count: docs.length,
      ids: docs.map((d) => d.metadata.id),
    });

    // 1. 全ドキュメントの内容を結合
    const combined = docs
      .map((d, i) => `### ドキュメント${i + 1}: ${d.metadata.summary}\n\n${d.content}`)
      .join('\n\n---\n\n');

    // 2. AI統合
    await this.unifyWithAI(combined, docs.length);

    // 3. メタデータ生成
    const metadata = this.createMergedMetadata(docs);

    // 4. 統合ドキュメント作成
    const merged = await this.documentManager.createDocument({
      files: metadata.related_files,
      prompt: `統合: ${docs.map((d) => d.metadata.summary).join(', ')}`,
      summary: metadata.summary,
    });

    // メタデータ更新（merged_from等を追加）
    merged.metadata.merged_from = docs.map((d) => d.metadata.id);
    merged.metadata.merge_method = 'ai_unified';
    merged.metadata.merge_timestamp = new Date().toISOString();
    merged.metadata.is_merged = true;
    merged.metadata.author = Array.from(
      new Set(
        docs.flatMap((d) =>
          Array.isArray(d.metadata.author) ? d.metadata.author : [d.metadata.author]
        )
      )
    );

    await this.documentManager.updateDocument(merged.metadata.id, merged.metadata);

    this.logger.info('Documents merged', {
      mergedId: merged.metadata.id,
      originalIds: merged.metadata.merged_from,
    });

    return merged;
  }

  /**
   * 統合処理を実行
   * @param threshold - 類似度の閾値
   * @returns 統合結果のレポート
   */
  async executeMerge(threshold: number = 0.85): Promise<string> {
    this.logger.info('Starting merge execution', { threshold });

    // 1. 類似ドキュメント検出
    const groups = await this.detectSimilarDocuments(threshold);

    if (groups.length === 0) {
      this.logger.info('No similar documents found');
      return '統合可能な類似ドキュメントは見つかりませんでした。';
    }

    // 2. 各グループを統合
    const results: string[] = [];
    let totalMerged = 0;

    for (const group of groups) {
      const merged = await this.mergeDocuments(group.documents);

      // 3. 元のドキュメントをアーカイブ
      for (const doc of group.documents) {
        await this.documentManager.archiveDocument(doc.metadata.id);
        await this.vectorStore.deleteDocument(doc.metadata.id);
      }

      // 4. 統合ドキュメントをインデックスに追加
      await this.vectorStore.addDocument({
        id: merged.metadata.id,
        text: merged.content,
        metadata: merged.metadata as unknown as Record<string, unknown>,
      });

      results.push(
        `統合グループ ${results.length + 1}:\n` +
          `- 統合前: ${group.documents.map((d) => d.metadata.summary).join(', ')}\n` +
          `- 統合後: ${merged.metadata.summary}\n` +
          `- アーカイブ: ${group.documents.length}件`
      );

      totalMerged += group.documents.length;
    }

    const report =
      results.join('\n\n') +
      `\n\n合計: ${totalMerged}件のドキュメントを${groups.length}件に統合しました。`;

    this.logger.info('Merge execution completed', {
      groupsProcessed: groups.length,
      totalMerged,
    });

    return report;
  }

  /**
   * ベクトル類似度を計算
   * @param docA - ドキュメントA
   * @param docB - ドキュメントB
   * @returns 類似度（0.0〜1.0）
   */
  private async calculateVectorSimilarity(docA: Document, docB: Document): Promise<number> {
    try {
      // ベクトルストアで検索して類似度を取得
      const results = await this.vectorStore.search(docA.content, 10);
      const match = results.find((r) => r.id === docB.metadata.id);

      return match ? match.score : 0;
    } catch (error) {
      this.logger.warn('Vector similarity calculation failed', {
        docA: docA.metadata.id,
        docB: docB.metadata.id,
        error,
      });
      return 0;
    }
  }

  /**
   * ファイル重複率を計算
   * @param filesA - ファイルAのリスト
   * @param filesB - ファイルBのリスト
   * @returns 重複率（0.0〜1.0）
   */
  private calculateFileOverlap(filesA: string[], filesB: string[]): number {
    if (filesA.length === 0 || filesB.length === 0) {
      return 0;
    }

    const setA = new Set(filesA);
    const setB = new Set(filesB);
    const intersection = new Set([...setA].filter((f) => setB.has(f)));

    return intersection.size / Math.max(filesA.length, filesB.length);
  }

  /**
   * AIで統合
   * @param combined - 結合されたドキュメント内容
   * @param docCount - ドキュメント数
   * @returns 統合された内容
   */
  private async unifyWithAI(combined: string, docCount: number): Promise<string> {
    const prompt = `
以下は同じトピックに関する${docCount}つの実装ドキュメントです。
これらを1つの統合ドキュメントにまとめてください。

要件:
- 重複する情報は統合
- 異なる実装内容は両方記載
- 時系列を保持
- Markdown形式で出力

${combined}
`;

    return await this.summarizer.summarize(prompt, 2000);
  }

  /**
   * 統合メタデータを作成
   * @param docs - ドキュメント配列
   * @returns 統合メタデータ
   */
  private createMergedMetadata(docs: Document[]): {
    related_files: string[];
    summary: string;
    tags: string[];
  } {
    const firstDoc = docs[0];
    if (!firstDoc) {
      throw new Error('No documents provided for metadata creation');
    }

    return {
      related_files: Array.from(new Set(docs.flatMap((d) => d.metadata.related_files))),
      summary: `統合: ${firstDoc.metadata.summary}`,
      tags: Array.from(new Set(docs.flatMap((d) => d.metadata.tags))),
    };
  }

  /**
   * 全アクティブドキュメントを取得
   * @returns アクティブなドキュメント配列
   */
  private async getAllActiveDocuments(): Promise<Document[]> {
    return await this.documentManager.searchDocuments({});
  }

  /**
   * グループをマージ（共通ドキュメントを持つグループを統合）
   * @param groups - ドキュメントグループ配列
   * @returns マージされたグループ配列
   */
  private mergeGroups(groups: DocumentGroup[]): DocumentGroup[] {
    if (groups.length <= 1) {
      return groups;
    }

    const merged: DocumentGroup[] = [];
    const processed = new Set<number>();

    for (let i = 0; i < groups.length; i++) {
      if (processed.has(i)) continue;

      const currentGroup = groups[i];
      if (!currentGroup) continue;

      const currentDocIds = new Set(currentGroup.documents.map((d) => d.metadata.id));

      // 共通ドキュメントを持つグループを探す
      for (let j = i + 1; j < groups.length; j++) {
        if (processed.has(j)) continue;

        const otherGroup = groups[j];
        if (!otherGroup) continue;

        const hasCommonDoc = otherGroup.documents.some((d) => currentDocIds.has(d.metadata.id));

        if (hasCommonDoc) {
          // グループを統合
          for (const doc of otherGroup.documents) {
            if (!currentDocIds.has(doc.metadata.id)) {
              currentGroup.documents.push(doc);
              currentDocIds.add(doc.metadata.id);
            }
          }

          // 類似度は最大値を採用
          currentGroup.similarity = Math.max(currentGroup.similarity, otherGroup.similarity);

          processed.add(j);
        }
      }

      merged.push(currentGroup);
      processed.add(i);
    }

    this.logger.debug('Groups merged', {
      originalCount: groups.length,
      mergedCount: merged.length,
    });

    return merged;
  }
}
