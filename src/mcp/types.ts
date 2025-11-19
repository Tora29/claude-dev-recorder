/**
 * MCP型定義
 * Model Context Protocolサーバーの型定義
 */

import { z } from 'zod';
import type { Document } from '../models/Document.js';

/**
 * MCPツールのZodスキーマ定義
 */
export const SearchRelatedDocsSchema = z.object({
  prompt: z.string().describe('The prompt or query to search for related documents'),
  maxResults: z.number().optional().describe('Maximum number of results to return (default: 3)'),
  threshold: z
    .number()
    .optional()
    .describe('Similarity threshold for results (0.0-1.0, default: 0.7)'),
});

export const RecordImplementationSchema = z.object({
  files: z.array(z.string()).describe('Array of file paths that were changed'),
  prompt: z.string().describe('The prompt or task description'),
  summary: z.string().optional().describe('Optional custom summary (auto-generated if omitted)'),
});

export const ManageDocumentsSchema = z.object({
  action: z.enum(['archive', 'delete']).describe('Action to perform on the document'),
  docId: z.string().describe('Document ID to manage'),
});

export const MergeSimilarDocsSchema = z.object({
  threshold: z
    .number()
    .optional()
    .describe('Similarity threshold for merging (0.0-1.0, default: 0.85)'),
  autoMerge: z
    .boolean()
    .optional()
    .describe('Automatically merge without confirmation (default: false)'),
});

export const SearchByKeywordSchema = z.object({
  keyword: z.string().describe('Keyword to search for in document content'),
  tags: z.array(z.string()).optional().describe('Optional tags to filter by'),
});

export const PreviewMergeSchema = z.object({
  threshold: z
    .number()
    .optional()
    .describe('Similarity threshold for detection (0.0-1.0, default: 0.85)'),
});

export const CheckDocumentQualitySchema = z.object({
  fix: z.boolean().optional().describe('Automatically fix issues if possible (default: false)'),
});

export const GetDocumentHistorySchema = z.object({
  docId: z.string().describe('Document ID to get history for'),
});

export const RollbackMergeSchema = z.object({
  mergedDocId: z.string().describe('The merged document ID to rollback'),
});

/**
 * TypeScript型定義（Zodスキーマから自動生成）
 */
export type SearchRelatedDocsArgs = z.infer<typeof SearchRelatedDocsSchema>;
export type RecordImplementationArgs = z.infer<typeof RecordImplementationSchema>;
export type ManageDocumentsArgs = z.infer<typeof ManageDocumentsSchema>;
export type MergeSimilarDocsArgs = z.infer<typeof MergeSimilarDocsSchema>;
export type SearchByKeywordArgs = z.infer<typeof SearchByKeywordSchema>;
export type PreviewMergeArgs = z.infer<typeof PreviewMergeSchema>;
export type CheckDocumentQualityArgs = z.infer<typeof CheckDocumentQualitySchema>;
export type GetDocumentHistoryArgs = z.infer<typeof GetDocumentHistorySchema>;
export type RollbackMergeArgs = z.infer<typeof RollbackMergeSchema>;

/**
 * プロジェクトコンテキスト（メモリ内インデックス）
 */
export interface ProjectContext {
  byDate: Map<string, Document[]>;
  byTag: Map<string, Document[]>;
  byFile: Map<string, Document[]>;
  allDocs: Document[];
}

/**
 * 類似度スコア付きドキュメント
 */
export interface DocumentWithSimilarity extends Document {
  similarity: number;
}

/**
 * MCPツール定義
 */
export interface MCPToolDefinition {
  name: string;
  description: string;
  inputSchema: {
    type: 'object';
    properties: Record<string, unknown>;
    required?: string[];
  };
}
