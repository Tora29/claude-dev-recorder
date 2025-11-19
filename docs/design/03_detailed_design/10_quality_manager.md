# QualityManager クラス詳細設計

## ドキュメント情報

| 項目         | 内容                                                                                   |
| ------------ | -------------------------------------------------------------------------------------- |
| ファイルパス | `src/services/QualityManager.ts`                                                       |
| クラス名     | QualityManager                                                                         |
| 責務         | 品質管理・レビュー、スコアリング                                                       |
| 依存クラス   | [DocumentManager](./02_document_manager.md), [DocumentMerger](./09_document_merger.md) |

---

## 概要

品質管理・レビュー機能を提供するクラス。ドキュメントの品質チェック、統合前プレビュー、スコアリングを担当。

---

## クラス定義

```typescript
import { DocumentManager } from './DocumentManager.js';
import { DocumentMerger } from './DocumentMerger.js';
import { Document } from '../models/Document.js';
import { Logger } from '../utils/logger.js';

interface MergePreview {
  group: DocumentGroup;
  previewContent: string;
  estimatedQuality: number;
}

interface QualityReport {
  totalDocuments: number;
  averageScore: number;
  issues: QualityIssue[];
  recommendations: string[];
}

interface QualityScores {
  freshness: number; // 鮮度（0-100）
  completeness: number; // 完全性（0-100）
  references: number; // 参照回数
  total: number; // 総合スコア（0-100）
}

interface QualityIssue {
  docId: string;
  type: 'stale' | 'incomplete' | 'duplicate' | 'contradiction';
  severity: 'low' | 'medium' | 'high';
  message: string;
}

interface Contradiction {
  docIds: string[];
  description: string;
  files: string[];
}

class QualityManager {
  private documentManager: DocumentManager;
  private documentMerger: DocumentMerger;
  private logger: Logger;

  constructor(documentManager: DocumentManager, documentMerger: DocumentMerger) {
    this.documentManager = documentManager;
    this.documentMerger = documentMerger;
    this.logger = new Logger('QualityManager');
  }

  /**
   * 統合プレビュー生成
   */
  async generateMergePreview(threshold: number): Promise<MergePreview[]> {
    const groups = await this.documentMerger.detectSimilarDocuments(threshold);
    const previews: MergePreview[] = [];

    for (const group of groups) {
      const previewContent = await this.createPreviewContent(group.documents);
      const estimatedQuality = await this.estimateMergedQuality(group.documents);

      previews.push({
        group,
        previewContent,
        estimatedQuality,
      });
    }

    return previews;
  }

  /**
   * 品質チェック実行
   */
  async checkDocumentQuality(fix: boolean = false): Promise<QualityReport> {
    const allDocs = await this.documentManager.getAllDocuments();
    const issues: QualityIssue[] = [];
    const scores: number[] = [];

    for (const doc of allDocs) {
      const score = await this.calculateQualityScore(doc);
      scores.push(score.total);

      // 古い情報検出
      if (score.freshness < 50) {
        issues.push({
          docId: doc.metadata.id,
          type: 'stale',
          severity: 'medium',
          message: `ドキュメントが古くなっています（${score.freshness}点）`,
        });
      }

      // 不完全な情報検出
      if (score.completeness < 60) {
        issues.push({
          docId: doc.metadata.id,
          type: 'incomplete',
          severity: 'low',
          message: `ドキュメントが不完全です（${score.completeness}点）`,
        });
      }
    }

    // 矛盾検出
    const contradictions = await this.detectContradictions(allDocs);
    for (const contradiction of contradictions) {
      issues.push({
        docId: contradiction.docIds[0],
        type: 'contradiction',
        severity: 'high',
        message: `矛盾を検出: ${contradiction.description}`,
      });
    }

    const averageScore = scores.reduce((a, b) => a + b, 0) / scores.length;

    return {
      totalDocuments: allDocs.length,
      averageScore,
      issues,
      recommendations: this.generateRecommendations(issues, averageScore),
    };
  }

  /**
   * 品質スコア算出
   */
  async calculateQualityScore(doc: Document): Promise<QualityScores> {
    // 鮮度（作成日からの経過日数）
    const ageInDays =
      (Date.now() - new Date(doc.metadata.created).getTime()) / (1000 * 60 * 60 * 24);
    const freshness = Math.max(0, 100 - ageInDays);

    // 完全性（メタデータの充実度）
    let completeness = 0;
    if (doc.metadata.summary && doc.metadata.summary.length > 10) completeness += 40;
    if (doc.metadata.tags && doc.metadata.tags.length > 0) completeness += 30;
    if (doc.metadata.related_files && doc.metadata.related_files.length > 0) completeness += 30;

    // 参照回数（仮実装）
    const references = 0;

    // 総合スコア
    const total = freshness * 0.4 + completeness * 0.4 + references * 0.2;

    return { freshness, completeness, references, total };
  }

  /**
   * 矛盾検出
   */
  async detectContradictions(docs: Document[]): Promise<Contradiction[]> {
    const contradictions: Contradiction[] = [];

    // 同じファイルに関する異なる実装記述をチェック
    const fileMap = new Map<string, Document[]>();

    for (const doc of docs) {
      for (const file of doc.metadata.related_files) {
        if (!fileMap.has(file)) fileMap.set(file, []);
        fileMap.get(file)!.push(doc);
      }
    }

    for (const [file, relatedDocs] of fileMap) {
      if (relatedDocs.length > 1) {
        // 簡易チェック: 同じファイルに関するドキュメントが複数ある場合
        contradictions.push({
          docIds: relatedDocs.map((d) => d.metadata.id),
          description: `${file} に関する複数の実装記録があります`,
          files: [file],
        });
      }
    }

    return contradictions;
  }

  /**
   * 古い情報検出
   */
  async detectStaleInfo(docs: Document[], daysThreshold: number): Promise<Document[]> {
    const threshold = Date.now() - daysThreshold * 24 * 60 * 60 * 1000;

    return docs.filter((doc) => new Date(doc.metadata.created).getTime() < threshold);
  }

  /**
   * プレビューコンテンツ作成
   */
  private async createPreviewContent(docs: Document[]): Promise<string> {
    return docs
      .map(
        (d, i) => `### ドキュメント${i + 1}: ${d.metadata.summary}\n${d.content.slice(0, 200)}...`
      )
      .join('\n\n');
  }

  /**
   * 統合後の品質を推定
   */
  private async estimateMergedQuality(docs: Document[]): Promise<number> {
    // 簡易実装: 平均スコア
    const scores = await Promise.all(docs.map((d) => this.calculateQualityScore(d)));
    const avgTotal = scores.reduce((a, b) => a + b.total, 0) / scores.length;

    return avgTotal;
  }

  /**
   * 推奨事項を生成
   */
  private generateRecommendations(issues: QualityIssue[], averageScore: number): string[] {
    const recommendations: string[] = [];

    if (averageScore < 60) {
      recommendations.push('全体的な品質が低いです。ドキュメントの見直しを推奨します。');
    }

    const staleCount = issues.filter((i) => i.type === 'stale').length;
    if (staleCount > 0) {
      recommendations.push(
        `${staleCount}件の古いドキュメントがあります。アーカイブを検討してください。`
      );
    }

    const contradictionCount = issues.filter((i) => i.type === 'contradiction').length;
    if (contradictionCount > 0) {
      recommendations.push(`${contradictionCount}件の矛盾があります。統合を検討してください。`);
    }

    return recommendations;
  }
}
```

---

## メソッド詳細

| メソッド                  | 説明                                           |
| ------------------------- | ---------------------------------------------- |
| `generateMergePreview()`  | 統合候補を検出し、統合後の内容をプレビュー生成 |
| `checkDocumentQuality()`  | 全ドキュメントの品質をチェックし、レポート生成 |
| `calculateQualityScore()` | 鮮度、完全性、参照回数から総合スコアを算出     |
| `detectContradictions()`  | 同じファイルに異なる実装記述がないかチェック   |
| `detectStaleInfo()`       | 指定日数以上更新されていないドキュメントを検出 |

---

## 品質スコア算出ロジック

### 鮮度（40%）

- 作成日からの経過日数で算出
- 新しいほど高得点

### 完全性（40%）

- サマリーの充実度: 40点
- タグの有無: 30点
- 関連ファイルの有無: 30点

### 参照回数（20%）

- 他のドキュメントからの参照回数

---

## 関連クラス

- [DocumentManager](./02_document_manager.md) - ドキュメント取得
- [DocumentMerger](./09_document_merger.md) - 類似ドキュメント検出
