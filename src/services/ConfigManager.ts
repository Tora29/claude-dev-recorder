/**
 * claude-dev-recorder用の設定マネージャー
 * 設定の読み込み、検証、管理を処理
 */

import * as fs from 'fs';
import * as path from 'path';
import type {
  RecorderConfig,
  PartialRecorderConfig,
  ConfigValidationError,
} from '../models/Config.js';

/**
 * デフォルト設定値
 */
const DEFAULT_CONFIG: RecorderConfig = {
  version: '1.0.0',
  summarizer: {
    provider: 'ollama',
    fallback: 'keyword',
    maxLength: 500,
    ollamaModel: 'llama3.2:3b',
    ollamaEndpoint: 'http://localhost:11434',
  },
  vectorStore: {
    provider: 'vectra',
    embeddingModel: 'nomic-embed-text',
    indexPath: '.claude/docs/.index',
    similarityThreshold: 0.7,
  },
  documentManager: {
    autoArchiveDays: 30,
    maxDocuments: 1000,
    autoCleanup: true,
  },
  search: {
    maxResults: 3,
    includeArchived: false,
  },
  git: {
    enabled: true,
    autoCommit: false,
  },
  fileWatcher: {
    enabled: true,
    syncIntervalSeconds: 60,
    watchGitHooks: true,
  },
  integrityChecker: {
    checkOnStartup: true,
    autoRecover: true,
    validateMetadata: true,
  },
  sensitiveData: {
    enabled: true,
    autoMask: true,
    warnUser: true,
    customPatternsPath: '.claude/sensitive-patterns.json',
  },
  logging: {
    level: 'info',
    logPath: '.claude/docs/.logs',
  },
};

/**
 * ConfigManagerクラス - シングルトンパターン
 * 設定の読み込み、検証、更新を管理
 */
export class ConfigManager {
  private static instance: ConfigManager | undefined;
  private config: RecorderConfig;
  private configPath: string;

  /**
   * シングルトンパターン用のプライベートコンストラクタ
   */
  private constructor(configPath?: string) {
    this.configPath = configPath || this.getDefaultConfigPath();
    this.config = this.loadConfig();
  }

  /**
   * ConfigManagerのシングルトンインスタンスを取得
   */
  public static getInstance(configPath?: string): ConfigManager {
    if (!ConfigManager.instance) {
      ConfigManager.instance = new ConfigManager(configPath);
    }
    return ConfigManager.instance;
  }

  /**
   * シングルトンインスタンスをリセット（テスト用）
   */
  public static resetInstance(): void {
    ConfigManager.instance = undefined;
  }

  /**
   * デフォルトの設定ファイルパスを取得
   */
  private getDefaultConfigPath(): string {
    const cwd = process.cwd();
    return path.join(cwd, '.claude', 'recorder.config.json');
  }

  /**
   * ファイルから設定を読み込むか、デフォルトを使用
   */
  private loadConfig(): RecorderConfig {
    try {
      if (fs.existsSync(this.configPath)) {
        const fileContent = fs.readFileSync(this.configPath, 'utf-8');
        const loadedConfig = JSON.parse(fileContent) as PartialRecorderConfig;

        // すべてのフィールドが存在することを保証するためにデフォルトとマージ
        const mergedConfig = this.mergeWithDefaults(loadedConfig);

        // 設定を検証
        const errors = this.validateConfig(mergedConfig);
        if (errors.length > 0) {
          console.warn('Configuration validation warnings:', errors);
          // 警告があってもマージされた設定で続行
        }

        return mergedConfig;
      } else {
        console.info(`Config file not found at ${this.configPath}, using defaults`);
        return { ...DEFAULT_CONFIG };
      }
    } catch (error) {
      console.error('Error loading config, using defaults:', error);
      return { ...DEFAULT_CONFIG };
    }
  }

  /**
   * 読み込んだ設定をデフォルトとマージして必要なフィールドが存在することを保証
   */
  private mergeWithDefaults(loaded: Partial<RecorderConfig>): RecorderConfig {
    return {
      version: loaded.version || DEFAULT_CONFIG.version,
      summarizer: { ...DEFAULT_CONFIG.summarizer, ...loaded.summarizer },
      vectorStore: { ...DEFAULT_CONFIG.vectorStore, ...loaded.vectorStore },
      documentManager: { ...DEFAULT_CONFIG.documentManager, ...loaded.documentManager },
      search: { ...DEFAULT_CONFIG.search, ...loaded.search },
      git: { ...DEFAULT_CONFIG.git, ...loaded.git },
      fileWatcher: { ...DEFAULT_CONFIG.fileWatcher, ...loaded.fileWatcher },
      integrityChecker: { ...DEFAULT_CONFIG.integrityChecker, ...loaded.integrityChecker },
      sensitiveData: { ...DEFAULT_CONFIG.sensitiveData, ...loaded.sensitiveData },
      logging: { ...DEFAULT_CONFIG.logging, ...loaded.logging },
    };
  }

  /**
   * 設定値を検証
   */
  private validateConfig(config: RecorderConfig): ConfigValidationError[] {
    const errors: ConfigValidationError[] = [];

    // 要約機能を検証
    if (config.summarizer.maxLength <= 0) {
      errors.push({
        field: 'summarizer.maxLength',
        message: 'Must be greater than 0',
        value: config.summarizer.maxLength,
      });
    }

    // ベクトルストアを検証
    if (config.vectorStore.similarityThreshold < 0 || config.vectorStore.similarityThreshold > 1) {
      errors.push({
        field: 'vectorStore.similarityThreshold',
        message: 'Must be between 0 and 1',
        value: config.vectorStore.similarityThreshold,
      });
    }

    // ドキュメントマネージャーを検証
    if (config.documentManager.autoArchiveDays < 0) {
      errors.push({
        field: 'documentManager.autoArchiveDays',
        message: 'Must be non-negative',
        value: config.documentManager.autoArchiveDays,
      });
    }

    if (config.documentManager.maxDocuments <= 0) {
      errors.push({
        field: 'documentManager.maxDocuments',
        message: 'Must be greater than 0',
        value: config.documentManager.maxDocuments,
      });
    }

    // 検索を検証
    if (config.search.maxResults <= 0) {
      errors.push({
        field: 'search.maxResults',
        message: 'Must be greater than 0',
        value: config.search.maxResults,
      });
    }

    // ファイル監視を検証
    if (config.fileWatcher.syncIntervalSeconds <= 0) {
      errors.push({
        field: 'fileWatcher.syncIntervalSeconds',
        message: 'Must be greater than 0',
        value: config.fileWatcher.syncIntervalSeconds,
      });
    }

    return errors;
  }

  /**
   * 完全な設定を取得
   */
  public getConfig(): RecorderConfig {
    return { ...this.config };
  }

  /**
   * パスで特定の設定値を取得
   */
  public get<K extends keyof RecorderConfig>(key: K): RecorderConfig[K] {
    return this.config[key];
  }

  /**
   * ネストされた設定値を取得
   */
  public getNested<K extends keyof RecorderConfig, N extends keyof RecorderConfig[K]>(
    section: K,
    key: N
  ): RecorderConfig[K][N] {
    return this.config[section][key];
  }

  /**
   * 特定の設定セクションを設定
   */
  public set<K extends keyof RecorderConfig>(key: K, value: RecorderConfig[K]): void {
    this.config[key] = value;
  }

  /**
   * ネストされた設定値を設定
   */
  public setNested<K extends keyof RecorderConfig, N extends keyof RecorderConfig[K]>(
    section: K,
    key: N,
    value: RecorderConfig[K][N]
  ): void {
    this.config[section][key] = value;
  }

  /**
   * 部分的な値で設定を更新
   */
  public update(updates: PartialRecorderConfig): void {
    this.config = this.mergeWithDefaults({ ...this.config, ...updates });

    // 更新後に検証
    const errors = this.validateConfig(this.config);
    if (errors.length > 0) {
      throw new Error(`Configuration validation failed: ${JSON.stringify(errors)}`);
    }
  }

  /**
   * 現在の設定をファイルに保存
   */
  public save(): void {
    try {
      const configDir = path.dirname(this.configPath);

      // ディレクトリが存在することを保証
      if (!fs.existsSync(configDir)) {
        fs.mkdirSync(configDir, { recursive: true });
      }

      // 設定ファイルを書き込み
      fs.writeFileSync(this.configPath, JSON.stringify(this.config, null, 2), 'utf-8');
    } catch (error) {
      throw new Error(`Failed to save configuration: ${String(error)}`);
    }
  }

  /**
   * ファイルから設定を再読み込み
   */
  public reload(): void {
    this.config = this.loadConfig();
  }

  /**
   * 設定をデフォルトにリセット
   */
  public resetToDefaults(): void {
    this.config = { ...DEFAULT_CONFIG };
  }

  /**
   * デフォルト設定を取得
   */
  public static getDefaults(): RecorderConfig {
    return { ...DEFAULT_CONFIG };
  }

  /**
   * 読み込まずに設定オブジェクトを検証
   */
  public static validate(config: RecorderConfig): ConfigValidationError[] {
    const tempManager = new ConfigManager();
    return tempManager.validateConfig(config);
  }
}
