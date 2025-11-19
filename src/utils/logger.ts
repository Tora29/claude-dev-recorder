import { appendFileSync } from 'fs';

/**
 * 優先度付きのログレベル
 */
export enum LogLevel {
  DEBUG = 0,
  INFO = 1,
  WARN = 2,
  ERROR = 3,
}

/**
 * ロガー設定
 */
export interface LoggerConfig {
  context: string;
  logFile?: string | undefined;
  minLevel?: LogLevel | undefined;
}

/**
 * ファイル出力とDEBUG環境変数サポートを備えた拡張ロガーユーティリティ
 */
export class Logger {
  private context: string;
  private logFile: string | undefined;
  private minLevel: LogLevel;

  constructor(config: string | LoggerConfig) {
    if (typeof config === 'string') {
      this.context = config;
      this.logFile = undefined;
      this.minLevel = this.getMinLevelFromEnv();
    } else {
      this.context = config.context;
      this.logFile = config.logFile;
      this.minLevel = config.minLevel ?? this.getMinLevelFromEnv();
    }
  }

  /**
   * DEBUG環境変数から最小ログレベルを取得
   * DEBUG=debug -> LogLevel.DEBUG
   * DEBUG=info -> LogLevel.INFO
   * DEBUG=warn -> LogLevel.WARN
   * DEBUG=error -> LogLevel.ERROR
   * デフォルト: LogLevel.INFO
   */
  private getMinLevelFromEnv(): LogLevel {
    const debugEnv = process.env.DEBUG?.toLowerCase();

    switch (debugEnv) {
      case 'debug':
        return LogLevel.DEBUG;
      case 'info':
        return LogLevel.INFO;
      case 'warn':
        return LogLevel.WARN;
      case 'error':
        return LogLevel.ERROR;
      default:
        return LogLevel.INFO;
    }
  }

  /**
   * ファイル出力用のログファイルパスを設定
   */
  setLogFile(filePath: string): void {
    this.logFile = filePath;
  }

  /**
   * 最小ログレベルを設定
   */
  setMinLevel(level: LogLevel): void {
    this.minLevel = level;
  }

  info(message: string, meta?: Record<string, unknown>): void {
    this.log(LogLevel.INFO, 'INFO', message, meta);
  }

  warn(message: string, meta?: Record<string, unknown>): void {
    this.log(LogLevel.WARN, 'WARN', message, meta);
  }

  debug(message: string, meta?: Record<string, unknown>): void {
    this.log(LogLevel.DEBUG, 'DEBUG', message, meta);
  }

  error(message: string, meta?: Record<string, unknown>): void {
    this.log(LogLevel.ERROR, 'ERROR', message, meta);
  }

  private log(
    level: LogLevel,
    levelName: string,
    message: string,
    meta?: Record<string, unknown>
  ): void {
    // ログレベルが有効かチェック
    if (level < this.minLevel) {
      return;
    }

    const timestamp = new Date().toISOString();
    const metaStr = meta ? ` ${JSON.stringify(meta)}` : '';
    const logMessage = `[${timestamp}] [${levelName}] [${this.context}] ${message}${metaStr}`;

    // コンソール出力
    console.log(logMessage);

    // ファイル出力
    if (this.logFile) {
      try {
        appendFileSync(this.logFile, logMessage + '\n', 'utf-8');
      } catch (error) {
        console.error(
          `Failed to write to log file: ${error instanceof Error ? error.message : String(error)}`
        );
      }
    }
  }
}
