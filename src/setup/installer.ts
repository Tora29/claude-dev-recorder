import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

/**
 * インストール結果
 */
export interface InstallationResult {
  success: boolean;
  message: string;
  details?: string[];
}

/**
 * インストーラークラス
 */
export class Installer {
  private projectRoot: string;
  private claudeDir: string;
  private templatesDir: string;

  constructor() {
    this.projectRoot = process.cwd();
    this.claudeDir = path.join(this.projectRoot, '.claude');

    // node_modules内のtemplatesディレクトリを参照
    // ESMの場合、__dirnameは手動で計算する必要がある
    const currentDir = path.dirname(fileURLToPath(import.meta.url));
    this.templatesDir = path.join(currentDir, '..', '..', 'templates');
  }

  /**
   * インストールを実行
   */
  install(): InstallationResult {
    const details: string[] = [];

    try {
      // 1. 設定ファイルのバックアップ
      this.backupConfigFile();
      details.push('✓ Backed up existing configuration');

      // 2. .claude/config.json にMCPサーバー登録
      this.registerMcpServer();
      details.push('✓ Registered MCP server in .claude/config.json');

      // 3. ディレクトリ作成
      this.createDirectories();
      details.push('✓ Created required directories');

      // 4. フックスクリプト配置
      this.deployHookScripts();
      details.push('✓ Deployed hook scripts');

      // 5. 設定ファイル配置
      this.deployConfigFiles();
      details.push('✓ Deployed configuration files');

      // 6. Git hooks配置（オプショナル）
      const gitHooksDeployed = this.deployGitHooks();
      if (gitHooksDeployed) {
        details.push('✓ Deployed Git hooks');
      }

      return {
        success: true,
        message: 'Installation completed successfully',
        details,
      };
    } catch (error) {
      return {
        success: false,
        message: `Installation failed: ${error instanceof Error ? error.message : String(error)}`,
        details,
      };
    }
  }

  /**
   * 設定ファイルのバックアップ
   */
  private backupConfigFile(): void {
    const configPath = path.join(this.claudeDir, 'config.json');

    if (fs.existsSync(configPath)) {
      const backupPath = path.join(this.claudeDir, `config.json.backup.${Date.now()}`);
      fs.copyFileSync(configPath, backupPath);
    }
  }

  /**
   * MCPサーバーを登録
   */
  private registerMcpServer(): void {
    const configPath = path.join(this.claudeDir, 'config.json');

    interface ClaudeConfig {
      mcpServers?: Record<string, unknown>;
    }

    let config: ClaudeConfig = {};

    if (fs.existsSync(configPath)) {
      const content = fs.readFileSync(configPath, 'utf-8');
      config = JSON.parse(content) as ClaudeConfig;
    }

    // mcpServersセクションが存在しない場合は作成
    if (!config.mcpServers) {
      config.mcpServers = {};
    }

    // claude-dev-recorderの設定を追加/更新
    const nodeModulesPath = path.join(
      this.projectRoot,
      'node_modules',
      'claude-dev-recorder',
      'dist',
      'index.js'
    );

    config.mcpServers.claudeDevRecorder = {
      command: 'node',
      args: [nodeModulesPath],
      env: {
        CLAUDE_DEV_RECORDER_ROOT: this.projectRoot,
      },
    };

    // 整形して書き込み
    fs.writeFileSync(configPath, JSON.stringify(config, null, 2), 'utf-8');
  }

  /**
   * 必要なディレクトリを作成
   */
  private createDirectories(): void {
    const directories = [
      path.join(this.claudeDir, 'docs'),
      path.join(this.claudeDir, 'docs', '.index'),
      path.join(this.claudeDir, 'docs', '.archive'),
      path.join(this.claudeDir, 'docs', '.logs'),
      path.join(this.claudeDir, 'hooks'),
    ];

    for (const dir of directories) {
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
    }
  }

  /**
   * フックスクリプトを配置
   */
  private deployHookScripts(): void {
    const hooksSourceDir = path.join(this.templatesDir, 'hooks');
    const hooksTargetDir = path.join(this.claudeDir, 'hooks');

    if (!fs.existsSync(hooksSourceDir)) {
      throw new Error(`Hooks directory not found at ${hooksSourceDir}`);
    }

    // hooks/ 配下のすべてのファイルをコピー
    const files = fs.readdirSync(hooksSourceDir);

    for (const file of files) {
      const sourcePath = path.join(hooksSourceDir, file);
      const targetPath = path.join(hooksTargetDir, file);

      if (fs.statSync(sourcePath).isFile()) {
        fs.copyFileSync(sourcePath, targetPath);

        // スクリプトに実行権限を付与（Unix系のみ）
        if (process.platform !== 'win32') {
          fs.chmodSync(targetPath, 0o755);
        }
      }
    }
  }

  /**
   * 設定ファイルを配置
   */
  private deployConfigFiles(): void {
    const configSource = path.join(this.templatesDir, 'recorder.config.json');
    const configTarget = path.join(this.claudeDir, 'recorder.config.json');

    // 既に存在する場合はスキップ
    if (fs.existsSync(configTarget)) {
      return;
    }

    if (fs.existsSync(configSource)) {
      fs.copyFileSync(configSource, configTarget);
    } else {
      // デフォルト設定を作成
      const defaultConfig = {
        maxDocuments: 1000,
        vectorSearch: {
          threshold: 0.7,
          maxResults: 5,
        },
        summarizer: {
          provider: 'ollama',
          model: 'llama3.2:3b',
          timeout: 30000,
        },
        autoMerge: {
          enabled: false,
          threshold: 0.85,
        },
        gitIntegration: {
          enabled: true,
          trackBranches: true,
        },
      };

      fs.writeFileSync(configTarget, JSON.stringify(defaultConfig, null, 2), 'utf-8');
    }

    // sensitive-patterns.json も配置
    const patternsSource = path.join(this.templatesDir, 'sensitive-patterns.json');
    const patternsTarget = path.join(this.claudeDir, 'sensitive-patterns.json');

    if (fs.existsSync(patternsSource) && !fs.existsSync(patternsTarget)) {
      fs.copyFileSync(patternsSource, patternsTarget);
    }
  }

  /**
   * Git hooksを配置（オプショナル）
   */
  private deployGitHooks(): boolean {
    const gitDir = path.join(this.projectRoot, '.git');

    // Gitリポジトリでない場合はスキップ
    if (!fs.existsSync(gitDir)) {
      return false;
    }

    const gitHooksDir = path.join(gitDir, 'hooks');
    const gitHooksSourceDir = path.join(this.templatesDir, 'git-hooks');

    if (!fs.existsSync(gitHooksSourceDir)) {
      return false;
    }

    // Git hooks ディレクトリが存在しない場合は作成
    if (!fs.existsSync(gitHooksDir)) {
      fs.mkdirSync(gitHooksDir, { recursive: true });
    }

    // git-hooks/ 配下のすべてのファイルをコピー
    const files = fs.readdirSync(gitHooksSourceDir);

    for (const file of files) {
      const sourcePath = path.join(gitHooksSourceDir, file);
      const targetPath = path.join(gitHooksDir, file);

      if (fs.statSync(sourcePath).isFile()) {
        // 既存のフックがある場合は追記
        if (fs.existsSync(targetPath)) {
          const existingContent = fs.readFileSync(targetPath, 'utf-8');
          const newContent = fs.readFileSync(sourcePath, 'utf-8');

          // 既に含まれている場合はスキップ
          if (!existingContent.includes('claude-dev-recorder')) {
            fs.appendFileSync(targetPath, '\n' + newContent);
          }
        } else {
          fs.copyFileSync(sourcePath, targetPath);
        }

        // 実行権限を付与（Unix系のみ）
        if (process.platform !== 'win32') {
          fs.chmodSync(targetPath, 0o755);
        }
      }
    }

    return true;
  }

  /**
   * アンインストールを実行
   */
  uninstall(): InstallationResult {
    const details: string[] = [];

    try {
      // 1. ドキュメント数を確認
      const docCount = this.countDocuments();
      details.push(`Found ${docCount} documents in .claude/docs/`);

      // 2. 設定ファイルのバックアップ
      this.backupConfigFile();
      details.push('✓ Backed up configuration');

      // 3. .claude/config.json からMCPサーバー削除
      this.unregisterMcpServer();
      details.push('✓ Removed MCP server from .claude/config.json');

      // 4. フックスクリプト削除
      this.removeHookScripts();
      details.push('✓ Removed hook scripts');

      // 5. 設定ファイル削除
      this.removeConfigFiles();
      details.push('✓ Removed configuration files');

      // 6. Git hooks削除
      const gitHooksRemoved = this.removeGitHooks();
      if (gitHooksRemoved) {
        details.push('✓ Removed Git hooks');
      }

      // ドキュメントは保持されることを通知
      details.push('');
      details.push('⚠️  Implementation documents are preserved');
      details.push(`   Location: ${path.join(this.claudeDir, 'docs')}`);
      details.push('   To delete manually, run: rm -rf .claude/docs');

      return {
        success: true,
        message: 'Uninstallation completed successfully',
        details,
      };
    } catch (error) {
      return {
        success: false,
        message: `Uninstallation failed: ${error instanceof Error ? error.message : String(error)}`,
        details,
      };
    }
  }

  /**
   * ドキュメント数をカウント
   */
  private countDocuments(): number {
    const docsDir = path.join(this.claudeDir, 'docs');

    if (!fs.existsSync(docsDir)) {
      return 0;
    }

    const files = fs.readdirSync(docsDir);
    return files.filter(
      (file) =>
        file.endsWith('.md') &&
        !file.startsWith('.') &&
        fs.statSync(path.join(docsDir, file)).isFile()
    ).length;
  }

  /**
   * MCPサーバーを削除
   */
  private unregisterMcpServer(): void {
    const configPath = path.join(this.claudeDir, 'config.json');

    if (!fs.existsSync(configPath)) {
      return;
    }

    const content = fs.readFileSync(configPath, 'utf-8');

    interface ClaudeConfig {
      mcpServers?: Record<string, unknown>;
    }

    const config = JSON.parse(content) as ClaudeConfig;

    // claudeDevRecorderを削除
    if (config.mcpServers && config.mcpServers.claudeDevRecorder) {
      delete config.mcpServers.claudeDevRecorder;

      // 整形して書き込み
      fs.writeFileSync(configPath, JSON.stringify(config, null, 2), 'utf-8');
    }
  }

  /**
   * フックスクリプトを削除
   */
  private removeHookScripts(): void {
    const hooksDir = path.join(this.claudeDir, 'hooks');

    if (fs.existsSync(hooksDir)) {
      fs.rmSync(hooksDir, { recursive: true, force: true });
    }
  }

  /**
   * 設定ファイルを削除
   */
  private removeConfigFiles(): void {
    const configFiles = [
      path.join(this.claudeDir, 'recorder.config.json'),
      path.join(this.claudeDir, 'sensitive-patterns.json'),
    ];

    for (const file of configFiles) {
      if (fs.existsSync(file)) {
        fs.unlinkSync(file);
      }
    }
  }

  /**
   * Git hooksを削除
   */
  private removeGitHooks(): boolean {
    const gitDir = path.join(this.projectRoot, '.git');

    if (!fs.existsSync(gitDir)) {
      return false;
    }

    const gitHooksDir = path.join(gitDir, 'hooks');
    const hookFiles = ['post-merge', 'post-checkout'];

    let removed = false;

    for (const hookFile of hookFiles) {
      const hookPath = path.join(gitHooksDir, hookFile);

      if (fs.existsSync(hookPath)) {
        const content = fs.readFileSync(hookPath, 'utf-8');

        // claude-dev-recorder関連の行を削除
        const lines = content.split('\n');
        const filteredLines = lines.filter((line) => !line.includes('claude-dev-recorder'));

        if (filteredLines.length !== lines.length) {
          if (filteredLines.filter((l) => l.trim()).length === 0) {
            // 空になった場合は削除
            fs.unlinkSync(hookPath);
          } else {
            // 内容を更新
            fs.writeFileSync(hookPath, filteredLines.join('\n'), 'utf-8');
          }
          removed = true;
        }
      }
    }

    return removed;
  }
}
