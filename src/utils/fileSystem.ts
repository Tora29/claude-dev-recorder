import { promises as fs } from 'node:fs';
import * as path from 'node:path';
import { Logger } from './logger.js';

const logger = new Logger('FileSystem');

/**
 * .claude/ ディレクトリ内で安全に操作するためのファイルシステムユーティリティ
 */
export class FileSystemError extends Error {
  constructor(
    message: string,
    public code?: string
  ) {
    super(message);
    this.name = 'FileSystemError';
  }
}

/**
 * 指定されたパスが .claude/ ディレクトリ内にあることを検証
 * @param filePath - 検証するパス
 * @param basePath - オプションのベースパス（デフォルトは process.cwd()）
 * @throws {FileSystemError} パスが .claude/ ディレクトリ外の場合
 */
export function validatePath(filePath: string, basePath?: string): void {
  const base = basePath || process.cwd();
  const claudeDir = path.join(base, '.claude');
  const absolutePath = path.resolve(base, filePath);
  const normalizedPath = path.normalize(absolutePath);

  // パスが .claude ディレクトリ内にあるかチェック
  if (!normalizedPath.startsWith(claudeDir)) {
    const error = new FileSystemError(
      `Access denied: Path must be within .claude/ directory. Got: ${filePath}`,
      'INVALID_PATH'
    );
    logger.error('Path validation failed', {
      filePath,
      basePath: base,
      claudeDir,
      resolvedPath: normalizedPath,
    });
    throw error;
  }

  logger.debug('Path validation successful', { filePath, normalizedPath });
}

/**
 * .claude/ ディレクトリから安全にファイルを読み込む
 * @param filePath - プロジェクトルートからの相対パスまたは絶対パス
 * @param basePath - オプションのベースパス（デフォルトは process.cwd()）
 * @returns 文字列としてのファイルの内容
 * @throws {FileSystemError} パス検証が失敗した場合、またはファイルを読み込めない場合
 */
export async function readFile(filePath: string, basePath?: string): Promise<string> {
  try {
    validatePath(filePath, basePath);
    const base = basePath || process.cwd();
    const absolutePath = path.resolve(base, filePath);

    logger.debug('Reading file', { filePath: absolutePath });
    const content = await fs.readFile(absolutePath, 'utf-8');
    logger.info('File read successfully', { filePath: absolutePath });

    return content;
  } catch (error) {
    if (error instanceof FileSystemError) {
      throw error;
    }

    const fsError = error as NodeJS.ErrnoException;
    const message =
      fsError.code === 'ENOENT'
        ? `File not found: ${filePath}`
        : `Failed to read file: ${filePath}`;

    logger.error('File read failed', {
      filePath,
      error: fsError.message,
      code: fsError.code,
    });

    throw new FileSystemError(message, fsError.code);
  }
}

/**
 * .claude/ ディレクトリ内のファイルに安全にコンテンツを書き込む
 * @param filePath - プロジェクトルートからの相対パスまたは絶対パス
 * @param content - 書き込むコンテンツ
 * @param basePath - オプションのベースパス（デフォルトは process.cwd()）
 * @throws {FileSystemError} パス検証が失敗した場合、またはファイルに書き込めない場合
 */
export async function writeFile(
  filePath: string,
  content: string,
  basePath?: string
): Promise<void> {
  try {
    validatePath(filePath, basePath);
    const base = basePath || process.cwd();
    const absolutePath = path.resolve(base, filePath);

    // 親ディレクトリの存在を確認
    const dir = path.dirname(absolutePath);
    await ensureDir(dir, basePath);

    logger.debug('Writing file', { filePath: absolutePath });
    await fs.writeFile(absolutePath, content, 'utf-8');
    logger.info('File written successfully', { filePath: absolutePath });
  } catch (error) {
    if (error instanceof FileSystemError) {
      throw error;
    }

    const fsError = error as NodeJS.ErrnoException;
    const message = `Failed to write file: ${filePath}`;

    logger.error('File write failed', {
      filePath,
      error: fsError.message,
      code: fsError.code,
    });

    throw new FileSystemError(message, fsError.code);
  }
}

/**
 * ディレクトリの存在を確認し、必要に応じて作成
 * @param dirPath - プロジェクトルートからの相対パスまたは絶対パス
 * @param basePath - オプションのベースパス（デフォルトは process.cwd()）
 * @throws {FileSystemError} パス検証が失敗した場合、またはディレクトリを作成できない場合
 */
export async function ensureDir(dirPath: string, basePath?: string): Promise<void> {
  try {
    validatePath(dirPath, basePath);
    const base = basePath || process.cwd();
    const absolutePath = path.resolve(base, dirPath);

    logger.debug('Ensuring directory exists', { dirPath: absolutePath });
    await fs.mkdir(absolutePath, { recursive: true });
    logger.info('Directory ensured', { dirPath: absolutePath });
  } catch (error) {
    if (error instanceof FileSystemError) {
      throw error;
    }

    const fsError = error as NodeJS.ErrnoException;
    const message = `Failed to create directory: ${dirPath}`;

    logger.error('Directory creation failed', {
      dirPath,
      error: fsError.message,
      code: fsError.code,
    });

    throw new FileSystemError(message, fsError.code);
  }
}

/**
 * ファイルまたはディレクトリが存在するかチェック
 * @param filePath - プロジェクトルートからの相対パスまたは絶対パス
 * @param basePath - オプションのベースパス（デフォルトは process.cwd()）
 * @returns ファイル/ディレクトリが存在する場合は true、それ以外は false
 * @throws {FileSystemError} パス検証が失敗した場合
 */
export async function exists(filePath: string, basePath?: string): Promise<boolean> {
  try {
    validatePath(filePath, basePath);
    const base = basePath || process.cwd();
    const absolutePath = path.resolve(base, filePath);

    await fs.access(absolutePath);
    logger.debug('Path exists', { filePath: absolutePath });
    return true;
  } catch (error) {
    if (error instanceof FileSystemError) {
      throw error;
    }

    const fsError = error as NodeJS.ErrnoException;
    if (fsError.code === 'ENOENT') {
      logger.debug('Path does not exist', { filePath });
      return false;
    }

    logger.error('Error checking path existence', {
      filePath,
      error: fsError.message,
      code: fsError.code,
    });

    throw new FileSystemError(`Failed to check path existence: ${filePath}`, fsError.code);
  }
}
