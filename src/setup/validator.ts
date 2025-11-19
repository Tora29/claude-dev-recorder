import * as fs from 'fs';
import * as path from 'path';

/**
 * 環境検証結果
 */
export interface ValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

/**
 * 環境検証クラス
 */
export class EnvironmentValidator {
  private errors: string[] = [];
  private warnings: string[] = [];

  /**
   * 環境全体を検証
   */
  validate(): ValidationResult {
    this.errors = [];
    this.warnings = [];

    // 1. Node.jsバージョンチェック
    this.validateNodeVersion();

    // 2. .claude/ ディレクトリの存在確認
    this.validateClaudeDirectory();

    // 3. .claude/config.json の存在確認
    this.validateConfigFile();

    // 4. ファイルシステム書き込み権限チェック
    this.validateWritePermission();

    return {
      valid: this.errors.length === 0,
      errors: this.errors,
      warnings: this.warnings,
    };
  }

  /**
   * Node.jsバージョンを検証
   */
  private validateNodeVersion(): void {
    const currentVersion = process.versions.node;
    const [major] = currentVersion.split('.').map(Number);

    if (major !== undefined && major < 18) {
      this.errors.push(`Node.js 18 or higher is required. Current version: ${currentVersion}`);
    } else if (major === undefined) {
      this.errors.push(`Unable to determine Node.js version. Current version: ${currentVersion}`);
    }
  }

  /**
   * .claude/ ディレクトリの存在を検証
   */
  private validateClaudeDirectory(): void {
    const claudeDir = path.join(process.cwd(), '.claude');

    if (!fs.existsSync(claudeDir)) {
      this.errors.push(
        '.claude/ directory not found. Please ensure Claude Code is properly installed and initialized in this project.'
      );
      return;
    }

    if (!fs.statSync(claudeDir).isDirectory()) {
      this.errors.push(
        '.claude exists but is not a directory. Please remove it and reinitialize Claude Code.'
      );
    }
  }

  /**
   * .claude/config.json の存在を検証
   */
  private validateConfigFile(): void {
    const configPath = path.join(process.cwd(), '.claude', 'config.json');

    if (!fs.existsSync(configPath)) {
      this.errors.push(
        '.claude/config.json not found. Claude Code may not be properly configured.'
      );
      return;
    }

    try {
      const content = fs.readFileSync(configPath, 'utf-8');
      JSON.parse(content);
    } catch (error) {
      this.errors.push(
        `.claude/config.json is not valid JSON: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  /**
   * 書き込み権限を検証
   */
  private validateWritePermission(): void {
    const claudeDir = path.join(process.cwd(), '.claude');

    // .claude/ ディレクトリが存在しない場合はスキップ
    if (!fs.existsSync(claudeDir)) {
      return;
    }

    try {
      // 一時ファイルを作成して書き込みテスト
      const testFile = path.join(claudeDir, '.write_test_tmp');
      fs.writeFileSync(testFile, 'test', 'utf-8');
      fs.unlinkSync(testFile);
    } catch (error) {
      this.errors.push(
        `No write permission in .claude/ directory: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  /**
   * MCPサーバーの重複チェック
   */
  validateMcpServerDuplication(): boolean {
    const configPath = path.join(process.cwd(), '.claude', 'config.json');

    if (!fs.existsSync(configPath)) {
      return false;
    }

    try {
      const content = fs.readFileSync(configPath, 'utf-8');

      interface ClaudeConfig {
        mcpServers?: Record<string, unknown>;
      }

      const config = JSON.parse(content) as ClaudeConfig;

      // mcpServersセクションにclaudeDevRecorderが既に存在するか確認
      if (config.mcpServers && config.mcpServers.claudeDevRecorder) {
        this.warnings.push(
          'claude-dev-recorder is already configured in .claude/config.json. Installation will update the existing configuration.'
        );
        return true;
      }

      return false;
    } catch {
      // JSONパースエラーは既にvalidateConfigFileで検出されている
      return false;
    }
  }

  /**
   * ディスク容量チェック（最小100MB）
   */
  validateDiskSpace(): void {
    const claudeDir = path.join(process.cwd(), '.claude');

    if (!fs.existsSync(claudeDir)) {
      return;
    }

    try {
      // Node.jsの標準機能ではディスク容量を直接取得できないため、
      // 実際の運用では外部ライブラリ（check-disk-space等）の使用を推奨
      // ここでは警告のみを表示
      this.warnings.push(
        'Unable to check disk space. Please ensure at least 100MB of free space is available.'
      );
    } catch (error) {
      this.warnings.push(
        `Could not verify disk space: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }
}

/**
 * 環境検証を実行
 */
export function validateEnvironment(): ValidationResult {
  const validator = new EnvironmentValidator();
  const result = validator.validate();

  // MCPサーバーの重複チェック
  validator.validateMcpServerDuplication();

  // ディスク容量チェック
  validator.validateDiskSpace();

  return result;
}
