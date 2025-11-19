#!/usr/bin/env node

/**
 * Pre-uninstallation script for claude-dev-recorder
 *
 * This script runs automatically before npm uninstall and performs:
 * 1. Document count display
 * 2. User notification about preserved documents
 * 3. Configuration cleanup
 * 4. Hook scripts removal
 * 5. Git hooks cleanup
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
  logHeader('claude-dev-recorder: Pre-Uninstallation');

  try {
    // コンパイル済みJSファイルを動的インポート
    const installerModule = await import('../dist/setup/installer.js');
    const { Installer } = installerModule;

    // 1. アンインストール実行
    logInfo('Uninstalling claude-dev-recorder...');
    const installer = new Installer();
    const uninstallResult = await installer.uninstall();

    if (!uninstallResult.success) {
      console.log('');
      logError(uninstallResult.message);
      // uninstallは失敗してもnpmのアンインストールは続行
      // ユーザーに手動クリーンアップを促す
      console.log('');
      logWarning('Some cleanup steps may have failed.');
      logInfo('You may need to manually remove configuration files.');
    } else {
      // 成功メッセージと詳細を表示
      console.log('');
      logSuccess(uninstallResult.message);

      if (uninstallResult.details && uninstallResult.details.length > 0) {
        console.log('');
        for (const detail of uninstallResult.details) {
          console.log(`  ${detail}`);
        }
      }
    }

    // 完了メッセージ
    console.log('');
    logHeader('Uninstallation Process Complete');
    console.log('');
    log('Important Information:', 'bright');
    console.log('');
    console.log('  Your implementation documents have been preserved.');
    console.log('  They remain in: .claude/docs/');
    console.log('');
    console.log('  To completely remove all data, manually delete:');
    console.log('    rm -rf .claude/docs/');
    console.log('    rm -rf .claude/docs/.index/');
    console.log('    rm -rf .claude/docs/.archive/');
    console.log('    rm -rf .claude/docs/.logs/');
    console.log('');
    log('Configuration files removed:', 'bright');
    console.log('  - .claude/config.json (MCP server entry removed)');
    console.log('  - .claude/hooks/ (removed)');
    console.log('  - .claude/recorder.config.json (removed)');
    console.log('  - .claude/sensitive-patterns.json (removed)');
    console.log('');
    logInfo('Thank you for using claude-dev-recorder!');
    console.log('');
  } catch (error) {
    console.log('');
    logWarning('Uninstallation encountered an issue:');
    console.error(error);
    console.log('');
    logInfo('The package will still be removed from node_modules/');
    logWarning('You may need to manually clean up configuration files.');
    console.log('');
    console.log('Manual cleanup commands:');
    console.log('  # Remove MCP server from .claude/config.json manually');
    console.log('  # Or restore from backup: .claude/config.json.backup.*');
    console.log('');
    console.log('  # Remove hook scripts:');
    console.log('  rm -rf .claude/hooks/');
    console.log('');
    console.log('  # Remove configuration files:');
    console.log('  rm .claude/recorder.config.json');
    console.log('  rm .claude/sensitive-patterns.json');
    console.log('');

    // エラーでもプロセスは正常終了（npmのアンインストールを妨げない）
  }
}

// スクリプトが直接実行された場合のみ実行
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error) => {
    console.error('Fatal error:', error);
    // エラーでもプロセスは正常終了
    process.exit(0);
  });
}
