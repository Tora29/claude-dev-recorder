import { DocumentManager } from './DocumentManager.js';
import type { Document } from '../models/Document.js';
import { Logger } from '../utils/logger.js';

/**
 * マージプレビュー用のドキュメントグループインターフェース
 */
export interface DocumentGroup {
  similarity: number;
  documents: Document[];
  reason: 'vector_similarity' | 'file_overlap';
}

/**
 * マージプレビューインターフェース
 */
export interface MergePreview {
  group: DocumentGroup;
  previewContent: string;
  estimatedQuality: number;
}

/**
 * 品質レポートインターフェース
 */
export interface QualityReport {
  totalDocuments: number;
  averageScore: number;
  issues: QualityIssue[];
  recommendations: string[];
}

/**
 * 品質スコアの内訳
 */
export interface QualityScores {
  freshness: number; // 鮮度スコア（0-100）
  completeness: number; // 完全性スコア（0-100）
  references: number; // 参照回数
  total: number; // 総合スコア（0-100）
}

/**
 * 品質問題インターフェース
 */
export interface QualityIssue {
  docId: string;
  type: 'stale' | 'incomplete' | 'duplicate' | 'contradiction';
  severity: 'low' | 'medium' | 'high';
  message: string;
}

/**
 * 矛盾検出結果
 */
export interface Contradiction {
  docIds: string[];
  description: string;
  files: string[];
}

/**
 * 依存性注入用のDocumentMergerインターフェース
 */
export interface IDocumentMerger {
  detectSimilarDocuments(threshold: number): Promise<DocumentGroup[]>;
}

/**
 * 品質マネージャークラス
 * ドキュメントの品質チェック、スコアリング、マージプレビューを管理
 */
export class QualityManager {
  private documentManager: DocumentManager;
  private documentMerger: IDocumentMerger | undefined;
  private logger: Logger;

  constructor(documentManager: DocumentManager, documentMerger?: IDocumentMerger) {
    this.documentManager = documentManager;
    this.documentMerger = documentMerger;
    this.logger = new Logger('QualityManager');
  }

  /**
   * マージプレビューを生成
   * 類似するドキュメントを検出し、マージされたコンテンツのプレビューを生成
   */
  async generateMergePreview(threshold: number): Promise<MergePreview[]> {
    if (!this.documentMerger) {
      throw new Error(
        'DocumentMerger is required for generateMergePreview. Please provide it in the constructor.'
      );
    }

    const groups = await this.documentMerger.detectSimilarDocuments(threshold);
    const previews: MergePreview[] = [];

    for (const group of groups) {
      const previewContent = this.createPreviewContent(group.documents);
      const estimatedQuality = this.estimateMergedQuality(group.documents);

      previews.push({
        group,
        previewContent,
        estimatedQuality,
      });
    }

    this.logger.info('Merge preview generated', {
      groupCount: previews.length,
      threshold,
    });

    return previews;
  }

  /**
   * ドキュメントの品質をチェック
   * すべてのドキュメントに対して包括的な品質チェックを実行
   */
  async checkDocumentQuality(fix: boolean = false): Promise<QualityReport> {
    const allDocs = await this.documentManager.getAllDocuments();
    const issues: QualityIssue[] = [];
    const scores: number[] = [];

    this.logger.info('Starting quality check', {
      totalDocuments: allDocs.length,
      fixMode: fix,
    });

    for (const doc of allDocs) {
      const score = this.calculateQualityScore(doc);
      scores.push(score.total);

      // 古いドキュメントを検出
      if (score.freshness < 50) {
        issues.push({
          docId: doc.metadata.id,
          type: 'stale',
          severity: 'medium',
          message: `Document is stale (freshness score: ${score.freshness.toFixed(1)})`,
        });
      }

      // 不完全なドキュメントを検出
      if (score.completeness < 60) {
        issues.push({
          docId: doc.metadata.id,
          type: 'incomplete',
          severity: 'low',
          message: `Document is incomplete (completeness score: ${score.completeness.toFixed(1)})`,
        });
      }
    }

    // 矛盾を検出
    const contradictions = this.detectContradictions(allDocs);
    for (const contradiction of contradictions) {
      const firstDocId = contradiction.docIds[0];
      if (firstDocId) {
        issues.push({
          docId: firstDocId,
          type: 'contradiction',
          severity: 'high',
          message: `Contradiction detected: ${contradiction.description}`,
        });
      }
    }

    const averageScore = scores.length > 0 ? scores.reduce((a, b) => a + b, 0) / scores.length : 0;

    const report: QualityReport = {
      totalDocuments: allDocs.length,
      averageScore,
      issues,
      recommendations: this.generateRecommendations(issues, averageScore),
    };

    this.logger.info('Quality check completed', {
      totalDocuments: report.totalDocuments,
      averageScore: report.averageScore.toFixed(2),
      issueCount: report.issues.length,
    });

    return report;
  }

  /**
   * ドキュメントの品質スコアを計算
   * 鮮度、完全性、参照回数に基づく
   */
  calculateQualityScore(doc: Document): QualityScores {
    // 鮮度スコア（日数ベース）
    const ageInDays =
      (Date.now() - new Date(doc.metadata.created).getTime()) / (1000 * 60 * 60 * 24);
    const freshness = Math.max(0, 100 - ageInDays);

    // 完全性スコア（メタデータの充実度ベース）
    let completeness = 0;
    if (doc.metadata.summary && doc.metadata.summary.length > 10) {
      completeness += 40;
    }
    if (doc.metadata.tags && doc.metadata.tags.length > 0) {
      completeness += 30;
    }
    if (doc.metadata.related_files && doc.metadata.related_files.length > 0) {
      completeness += 30;
    }

    // 参照回数（プレースホルダー実装）
    const references = doc.metadata.reference_count || 0;

    // 総合スコア（重み付き平均）
    const total = freshness * 0.4 + completeness * 0.4 + references * 0.2;

    return { freshness, completeness, references, total };
  }

  /**
   * ドキュメント間の矛盾を検出
   * 同じファイルに関する矛盾する情報をチェック
   */
  detectContradictions(docs: Document[]): Contradiction[] {
    const contradictions: Contradiction[] = [];

    // 同じファイルに関連する異なる実装をチェック
    const fileMap = new Map<string, Document[]>();

    for (const doc of docs) {
      for (const file of doc.metadata.related_files) {
        if (!fileMap.has(file)) {
          fileMap.set(file, []);
        }
        fileMap.get(file)!.push(doc);
      }
    }

    for (const [file, relatedDocs] of fileMap) {
      if (relatedDocs.length > 1) {
        // シンプルチェック：同じファイルに関する複数のドキュメント
        // 実際の実装では、NLPを使用して意味的な矛盾を検出できる
        contradictions.push({
          docIds: relatedDocs.map((d) => d.metadata.id),
          description: `Multiple implementation records found for ${file}`,
          files: [file],
        });
      }
    }

    this.logger.debug('Contradiction detection completed', {
      contradictionCount: contradictions.length,
    });

    return contradictions;
  }

  /**
   * 古い情報を検出
   * 指定された閾値より古いドキュメントを返す
   */
  detectStaleInfo(docs: Document[], daysThreshold: number): Document[] {
    const threshold = Date.now() - daysThreshold * 24 * 60 * 60 * 1000;

    const staleDocs = docs.filter((doc) => new Date(doc.metadata.created).getTime() < threshold);

    this.logger.debug('Stale info detection completed', {
      totalDocs: docs.length,
      staleDocs: staleDocs.length,
      daysThreshold,
    });

    return staleDocs;
  }

  /**
   * ドキュメントからプレビューコンテンツを作成
   * プライベートヘルパーメソッド
   */
  private createPreviewContent(docs: Document[]): string {
    return docs
      .map((d, i) => `### Document ${i + 1}: ${d.metadata.summary}\n${d.content.slice(0, 200)}...`)
      .join('\n\n');
  }

  /**
   * マージ後の品質を推定
   * マージ後の推定品質スコアを計算
   * プライベートヘルパーメソッド
   */
  private estimateMergedQuality(docs: Document[]): number {
    // シンプルな実装：平均スコア
    const scores = docs.map((d) => this.calculateQualityScore(d));
    const avgTotal = scores.reduce((a, b) => a + b.total, 0) / scores.length;

    return avgTotal;
  }

  /**
   * 問題と平均スコアに基づいて推奨事項を生成
   * プライベートヘルパーメソッド
   */
  private generateRecommendations(issues: QualityIssue[], averageScore: number): string[] {
    const recommendations: string[] = [];

    if (averageScore < 60) {
      recommendations.push('Overall quality is low. Document review is recommended.');
    }

    const staleCount = issues.filter((i) => i.type === 'stale').length;
    if (staleCount > 0) {
      recommendations.push(`${staleCount} stale document(s) found. Consider archiving them.`);
    }

    const contradictionCount = issues.filter((i) => i.type === 'contradiction').length;
    if (contradictionCount > 0) {
      recommendations.push(
        `${contradictionCount} contradiction(s) found. Consider merging related documents.`
      );
    }

    const incompleteCount = issues.filter((i) => i.type === 'incomplete').length;
    if (incompleteCount > 0) {
      recommendations.push(
        `${incompleteCount} incomplete document(s) found. Consider updating metadata.`
      );
    }

    return recommendations;
  }
}
