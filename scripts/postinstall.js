#!/usr/bin/env node

/**
 * Post-installation script for claude-dev-recorder
 *
 * This script runs automatically after npm install and performs:
 * 1. Environment validation
 * 2. MCP server registration in .claude/config.json
 * 3. Hook scripts deployment
 * 4. Directory creation
 * 5. Git hooks deployment (optional)
 */

// 色付きログ出力用のユーティリティ
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
};

function log(message, color = 'reset') {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

function logHeader(message) {
  console.log('');
  log('='.repeat(60), 'cyan');
  log(message, 'bright');
  log('='.repeat(60), 'cyan');
  console.log('');
}

function logSuccess(message) {
  log(`✓ ${message}`, 'green');
}

function logError(message) {
  log(`✗ ${message}`, 'red');
}

function logWarning(message) {
  log(`⚠ ${message}`, 'yellow');
}

function logInfo(message) {
  log(`ℹ ${message}`, 'blue');
}

/**
 * メイン処理
 */
async function main() {
  logHeader('claude-dev-recorder: Post-Installation');

  // グローバルインストールの場合はスキップ
  if (process.env.npm_config_global === 'true') {
    console.log('');
    logInfo('Global installation detected. Skipping project-specific setup.');
    console.log('');
    log('To use claude-dev-recorder in a project:', 'bright');
    console.log('');
    console.log('  1. Navigate to your project directory');
    console.log('  2. Ensure Claude Code is initialized (.claude/ directory exists)');
    console.log('  3. The MCP server will be available for use');
    console.log('');
    logInfo('For more information, visit: https://github.com/Tora29/claude-dev-recorder');
    console.log('');
    return;
  }

  try {
    // コンパイル済みJSファイルを動的インポート
    const validatorModule = await import('../dist/setup/validator.js');
    const installerModule = await import('../dist/setup/installer.js');

    const { validateEnvironment } = validatorModule;
    const { Installer } = installerModule;

    // 1. 環境検証
    logInfo('Validating environment...');
    const validationResult = await validateEnvironment();

    if (!validationResult.valid) {
      console.log('');
      logError('Environment validation failed:');
      for (const error of validationResult.errors) {
        console.log(`  ${colors.red}• ${error}${colors.reset}`);
      }
      console.log('');
      logInfo('Please fix the above issues and try again.');
      process.exit(1);
    }

    // 警告がある場合は表示
    if (validationResult.warnings.length > 0) {
      console.log('');
      logWarning('Warnings:');
      for (const warning of validationResult.warnings) {
        console.log(`  ${colors.yellow}• ${warning}${colors.reset}`);
      }
    }

    logSuccess('Environment validation passed');
    console.log('');

    // 2. インストール実行
    logInfo('Installing claude-dev-recorder...');
    const installer = new Installer();
    const installResult = await installer.install();

    if (!installResult.success) {
      console.log('');
      logError(installResult.message);
      process.exit(1);
    }

    // 成功メッセージと詳細を表示
    console.log('');
    logSuccess(installResult.message);

    if (installResult.details && installResult.details.length > 0) {
      console.log('');
      for (const detail of installResult.details) {
        console.log(`  ${detail}`);
      }
    }

    // 完了メッセージ
    console.log('');
    logHeader('Installation Complete!');
    console.log('');
    log('Next steps:', 'bright');
    console.log('');
    console.log('  1. Restart Claude Code to activate the MCP server');
    console.log('  2. Use the following tools in Claude Code:');
    console.log('     - search_related_docs: Search for relevant past implementations');
    console.log('     - record_implementation: Document your code changes');
    console.log('     - manage_documents: Archive or delete documents');
    console.log('     - merge_similar_docs: Merge similar documents');
    console.log('');
    console.log('  3. Configuration file: .claude/recorder.config.json');
    console.log('  4. Documents are saved in: .claude/docs/');
    console.log('');
    logInfo('For more information, visit: https://github.com/Tora29/claude-dev-recorder');
    console.log('');
  } catch (error) {
    console.log('');
    logError('Installation failed with an unexpected error:');
    console.error(error);
    console.log('');
    logInfo('Please report this issue at: https://github.com/Tora29/claude-dev-recorder/issues');
    console.log('');
    process.exit(1);
  }
}

// スクリプトが直接実行された場合のみ実行
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error) => {
    console.error('Fatal error:', error);
    process.exit(1);
  });
}
