import * as assert from 'assert';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import {
  REQUIRED_CLASS_PREFIXES,
  REQUIRED_JS_HOOKS,
  checkHealth,
  checkInstallHealth,
  formatHealthWarning,
  isHealthy,
} from '../health';

const GOOD_CSS =
  'html{--app-primary-background:#000}' +
  REQUIRED_CLASS_PREFIXES.map((p) => `.${p}abc123{color:red}`).join('');
const GOOD_JS = REQUIRED_JS_HOOKS.map((h) => `x("${h}")`).join(';');

suite('health', () => {
  test('a complete install is healthy', () => {
    const report = checkHealth(GOOD_CSS, GOOD_JS);
    assert.deepStrictEqual(report, { damaged: false, missingClassPrefixes: [], missingJsHooks: [] });
    assert.strictEqual(isHealthy(report), true);
  });

  test('missing class prefixes are listed', () => {
    const report = checkHealth(GOOD_CSS.replace('.toolUse_abc123{color:red}', ''), GOOD_JS);
    assert.deepStrictEqual(report.missingClassPrefixes, ['toolUse_']);
    assert.strictEqual(isHealthy(report), false);
  });

  test('a file without the token block is damaged', () => {
    const report = checkHealth(GOOD_CSS.replace('html{--app-', 'body{--x-'), GOOD_JS);
    assert.strictEqual(report.damaged, true);
    assert.strictEqual(isHealthy(report), false);
  });

  test('missing JS hooks are listed', () => {
    const report = checkHealth(GOOD_CSS, GOOD_JS.replace('assistant-message', 'assistant-msg'));
    assert.deepStrictEqual(report.missingJsHooks, ['assistant-message']);
  });

  test('checkInstallHealth reads webview/index.css and webview/index.js', async () => {
    const dir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'bidi-health-'));
    try {
      await fs.promises.mkdir(path.join(dir, 'webview'));
      await fs.promises.writeFile(path.join(dir, 'webview', 'index.css'), GOOD_CSS);
      await fs.promises.writeFile(path.join(dir, 'webview', 'index.js'), GOOD_JS);
      assert.strictEqual(isHealthy(await checkInstallHealth(dir)), true);
    } finally {
      await fs.promises.rm(dir, { recursive: true, force: true });
    }
  });

  test('the warning names the version and what is missing', () => {
    const message = formatHealthWarning('2.1.300', {
      damaged: false,
      missingClassPrefixes: ['toolUse_'],
      missingJsHooks: ['Claude, '],
    });
    assert.ok(message.includes('2.1.300'), message);
    assert.ok(message.includes('toolUse_'), message);
    assert.ok(message.includes('"Claude, "'), message);
  });

  test('a damaged install gets a reinstall message', () => {
    const message = formatHealthWarning('2.1.292', {
      damaged: true,
      missingClassPrefixes: [],
      missingJsHooks: [],
    });
    assert.ok(message.includes('2.1.292') && message.includes('Reinstall Claude Code'), message);
  });
});
