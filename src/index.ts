#!/usr/bin/env node
/**
 * claude-dev-recorder MCPサーバーのエントリーポイント
 * Claude Codeとの通信用のstdioトランスポートでサーバーを起動
 */

import { MCPServer } from './mcp/server.js';

async function main() {
  const server = new MCPServer();

  // グレースフルシャットダウンを処理
  process.on('SIGINT', () => {
    void server.shutdown().then(() => process.exit(0));
  });

  process.on('SIGTERM', () => {
    void server.shutdown().then(() => process.exit(0));
  });

  // サーバーを起動
  try {
    await server.start();
  } catch (error) {
    console.error('Failed to start MCP server:', error);
    process.exit(1);
  }
}

void main();
