import { execSync } from 'child_process';

/**
 * Git設定情報
 */
export interface GitConfig {
  email: string | null;
  name: string | null;
}

/**
 * 変更ファイル情報
 */
export interface GitChangedFile {
  status: string;
  path: string;
}

/**
 * Gitコマンドを安全に実行する
 * @param command 実行するGitコマンド
 * @returns コマンドの実行結果（失敗時はnull）
 */
function executeGitCommand(command: string): string | null {
  try {
    const result = execSync(command, {
      encoding: 'utf8',
      stdio: ['pipe', 'pipe', 'pipe'],
      cwd: process.cwd(),
    });
    return result.trim();
  } catch {
    // Gitが初期化されていない、またはコマンドが失敗した場合
    return null;
  }
}

/**
 * Git設定（user.email, user.name）を取得する
 * @returns Git設定情報
 */
export function getGitConfig(): GitConfig {
  const email = executeGitCommand('git config user.email');
  const name = executeGitCommand('git config user.name');

  return {
    email,
    name,
  };
}

/**
 * 現在のブランチ名を取得する
 * @returns 現在のブランチ名（取得失敗時はnull）
 */
export function getCurrentBranch(): string | null {
  // git rev-parse --abbrev-ref HEAD で現在のブランチを取得
  const branch = executeGitCommand('git rev-parse --abbrev-ref HEAD');
  return branch;
}

/**
 * 変更されたファイルの一覧を取得する
 * @returns 変更ファイルの配列
 */
export function getChangedFiles(): GitChangedFile[] {
  // git status --porcelain で変更ファイルを取得
  const statusOutput = executeGitCommand('git status --porcelain');

  if (!statusOutput) {
    return [];
  }

  const files: GitChangedFile[] = [];
  const lines = statusOutput.split('\n').filter((line) => line.trim());

  for (const line of lines) {
    // git status --porcelain の形式: "XY path"
    // X: インデックスの状態、Y: ワークツリーの状態
    if (line.length >= 3) {
      const status = line.substring(0, 2).trim();
      const path = line.substring(3);
      files.push({ status, path });
    }
  }

  return files;
}

/**
 * Gitリポジトリが初期化されているかチェックする
 * @returns Gitリポジトリが初期化されている場合true
 */
export function isGitRepository(): boolean {
  const result = executeGitCommand('git rev-parse --is-inside-work-tree');
  return result === 'true';
}
