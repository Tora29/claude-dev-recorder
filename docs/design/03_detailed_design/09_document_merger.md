# DocumentMerger クラス詳細設計

## ドキュメント情報

| 項目         | 内容                                                                                       |
| ------------ | ------------------------------------------------------------------------------------------ |
| ファイルパス | `src/services/DocumentMerger.ts`                                                           |
| クラス名     | DocumentMerger                                                                             |
| 責務         | 類似ドキュメント検出、統合処理                                                             |
| 依存クラス   | [DocumentManager](./02_document_manager.md), VectorStore, [Summarizer](./06_summarizer.md) |

---

## クラス定義

```typescript
import { DocumentManager } from './DocumentManager.js';
import { VectorStore } from './VectorStore.js';
import { Summarizer } from './Summarizer.js';
import { Document } from '../models/Document.js';
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
   */
  async detectSimilarDocuments(threshold: number = 0.85): Promise<DocumentGroup[]> {
    const allDocs = await this.getAllActiveDocuments();
    const groups: DocumentGroup[] = [];

    for (let i = 0; i < allDocs.length; i++) {
      for (let j = i + 1; j < allDocs.length; j++) {
        const docA = allDocs[i];
        const docB = allDocs[j];

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
        }
      }
    }

    // グループをマージ（共通ドキュメントを持つグループを統合）
    return this.mergeGroups(groups);
  }

  /**
   * ドキュメントを統合
   */
  async mergeDocuments(docs: Document[]): Promise<Document> {
    if (docs.length < 2) {
      throw new Error('At least 2 documents are required for merging');
    }

    // 1. 全ドキュメントの内容を結合
    const combined = docs
      .map((d, i) => `### ドキュメント${i + 1}: ${d.metadata.summary}\n\n${d.content}`)
      .join('\n\n---\n\n');

    // 2. AI統合
    const unifiedContent = await this.unifyWithAI(combined, docs.length);

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
    merged.metadata.author = Array.from(new Set(docs.map((d) => d.metadata.author).flat()));

    await this.documentManager.updateDocument(merged.metadata.id, merged.metadata);

    this.logger.info('Documents merged', {
      mergedId: merged.metadata.id,
      originalIds: merged.metadata.merged_from,
    });

    return merged;
  }

  /**
   * 統合処理を実行
   */
  async executeMerge(threshold: number = 0.85): Promise<string> {
    // 1. 類似ドキュメント検出
    const groups = await this.detectSimilarDocuments(threshold);

    if (groups.length === 0) {
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
        await this.vectorStore.removeDocument(doc.metadata.id);
      }

      // 4. 統合ドキュメントをインデックスに追加
      await this.vectorStore.addDocument(merged);

      results.push(
        `統合グループ ${results.length + 1}:\n` +
          `- 統合前: ${group.documents.map((d) => d.metadata.summary).join(', ')}\n` +
          `- 統合後: ${merged.metadata.summary}\n` +
          `- アーカイブ: ${group.documents.length}件`
      );

      totalMerged += group.documents.length;
    }

    return (
      results.join('\n\n') +
      `\n\n合計: ${totalMerged}件のドキュメントを${groups.length}件に統合しました。`
    );
  }

  /**
   * ベクトル類似度を計算
   */
  private async calculateVectorSimilarity(docA: Document, docB: Document): Promise<number> {
    // ベクトルストアで検索して類似度を取得
    const results = await this.vectorStore.search(docA.content, 10);
    const match = results.find((r) => r.id === docB.metadata.id);

    return match ? match.similarity : 0;
  }

  /**
   * ファイル重複率を計算
   */
  private calculateFileOverlap(filesA: string[], filesB: string[]): number {
    const setA = new Set(filesA);
    const setB = new Set(filesB);
    const intersection = new Set([...setA].filter((f) => setB.has(f)));

    return intersection.size / Math.max(filesA.length, filesB.length);
  }

  /**
   * AIで統合
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
   */
  private createMergedMetadata(docs: Document[]): any {
    return {
      related_files: Array.from(new Set(docs.flatMap((d) => d.metadata.related_files))),
      summary: `統合: ${docs[0].metadata.summary}`,
      tags: Array.from(new Set(docs.flatMap((d) => d.metadata.tags))),
    };
  }

  /**
   * 全アクティブドキュメントを取得
   */
  private async getAllActiveDocuments(): Promise<Document[]> {
    return await this.documentManager.searchDocuments({});
  }

  /**
   * グループをマージ（共通ドキュメントを持つグループを統合）
   */
  private mergeGroups(groups: DocumentGroup[]): DocumentGroup[] {
    // 簡易実装: そのまま返す（本実装では共通ドキュメントを持つグループを統合）
    return groups;
  }
}
```

---

## メソッド詳細

| メソッド                      | 引数                 | 戻り値                     | 説明                                         |
| ----------------------------- | -------------------- | -------------------------- | -------------------------------------------- |
| `detectSimilarDocuments()`    | `threshold: number`  | `Promise<DocumentGroup[]>` | 類似度が閾値以上のドキュメントグループを検出 |
| `mergeDocuments()`            | `docs: Document[]`   | `Promise<Document>`        | 複数のドキュメントを1つに統合                |
| `executeMerge()`              | `threshold: number`  | `Promise<string>`          | 統合処理を実行し、結果を返す                 |
| `calculateVectorSimilarity()` | `docA, docB`         | `Promise<number>`          | 2つのドキュメントのベクトル類似度を計算      |
| `calculateFileOverlap()`      | `filesA, filesB`     | `number`                   | ファイル重複率を計算（0.0〜1.0）             |
| `unifyWithAI()`               | `combined, docCount` | `Promise<string>`          | AIで複数ドキュメントを統合                   |
| `createMergedMetadata()`      | `docs`               | `any`                      | 統合ドキュメントのメタデータを生成           |

---

## 統合フロー

```
1. 類似ドキュメント検出
   ├─ ベクトル類似度 >= threshold
   └─ ファイル重複率 >= 0.5

2. ドキュメント統合
   ├─ 全ドキュメント内容を結合
   ├─ AIで統合（Summarizer使用）
   └─ 統合ドキュメント作成

3. 元ドキュメント処理
   ├─ アーカイブに移動
   └─ ベクトルインデックスから削除

4. 統合ドキュメント登録
   └─ ベクトルインデックスに追加
```

---

## 関連クラス

- [DocumentManager](./02_document_manager.md) - ドキュメント管理
- [Summarizer](./06_summarizer.md) - AI統合
- [MCPServer](./01_mcp_server.md) - 統合ツール実装
