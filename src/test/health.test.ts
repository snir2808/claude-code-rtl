import * as assert from 'assert';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import {
  HealthReport,
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
const HEALTHY: HealthReport = { unreadableFiles: [], damaged: false, missingClassPrefixes: [], missingJsHooks: [] };

suite('health', () => {
  test('a complete install is healthy', () => {
    const report = checkHealth(GOOD_CSS, GOOD_JS);
    assert.deepStrictEqual(report, HEALTHY);
    assert.strictEqual(isHealthy(report), true);
  });

  test('missing class prefixes are listed', () => {
    const report = checkHealth(GOOD_CSS.replace('.toolUse_abc123{color:red}', ''), GOOD_JS);
    assert.deepStrictEqual(report.missingClassPrefixes, ['toolUse_']);
    assert.strictEqual(isHealthy(report), false);
  });

  test('a prefix counts only right after a dot: .return_ is not .turn_', () => {
    const css = GOOD_CSS.replace('.turn_abc123{color:red}', '.return_abc{color:red}');
    assert.deepStrictEqual(checkHealth(css, GOOD_JS).missingClassPrefixes, ['turn_']);
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

  test('an unreadable file is reported, and nothing in it is checked', () => {
    assert.deepStrictEqual(checkHealth(GOOD_CSS, null), { ...HEALTHY, unreadableFiles: ['index.js'] });
    assert.deepStrictEqual(checkHealth(null, GOOD_JS), { ...HEALTHY, unreadableFiles: ['index.css'] });
    assert.strictEqual(isHealthy(checkHealth(GOOD_CSS, null)), false);
  });

  suite('checkInstallHealth', () => {
    let dir: string;

    setup(async () => {
      dir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'bidi-health-'));
      await fs.promises.mkdir(path.join(dir, 'webview'));
    });

    teardown(async () => {
      await fs.promises.rm(dir, { recursive: true, force: true });
    });

    test('reads webview/index.css and webview/index.js', async () => {
      await fs.promises.writeFile(path.join(dir, 'webview', 'index.css'), GOOD_CSS);
      await fs.promises.writeFile(path.join(dir, 'webview', 'index.js'), GOOD_JS);
      assert.strictEqual(isHealthy(await checkInstallHealth(dir)), true);
    });

    test('reports files it cannot read instead of rejecting', async () => {
      await fs.promises.writeFile(path.join(dir, 'webview', 'index.css'), GOOD_CSS);
      assert.deepStrictEqual((await checkInstallHealth(dir)).unreadableFiles, ['index.js']);
      await fs.promises.rm(path.join(dir, 'webview', 'index.css'));
      await fs.promises.mkdir(path.join(dir, 'webview', 'index.js')); // a directory: unreadable, not missing
      assert.deepStrictEqual((await checkInstallHealth(dir)).unreadableFiles, ['index.css', 'index.js']);
    });
  });

  test('the warning names the version and what is missing', () => {
    const message = formatHealthWarning('2.1.300', {
      ...HEALTHY,
      missingClassPrefixes: ['toolUse_'],
      missingJsHooks: ['Claude, '],
    });
    assert.ok(message.includes('2.1.300'), message);
    assert.ok(message.includes('toolUse_'), message);
    assert.ok(message.includes('"Claude, "'), message);
  });

  test('the warning names a file it could not read', () => {
    const message = formatHealthWarning('2.1.301', { ...HEALTHY, unreadableFiles: ['index.js'] });
    assert.ok(message.includes('2.1.301'), message);
    assert.ok(message.includes('webview/index.js'), message);
    assert.ok(!message.includes('Missing'), message);
  });

  test('a damaged install gets a reinstall message that allows for a format change', () => {
    const message = formatHealthWarning('2.1.292', { ...HEALTHY, damaged: true });
    assert.ok(message.includes('2.1.292'), message);
    assert.ok(message.includes('Reinstall Claude Code'), message);
    assert.ok(message.includes('or Claude Code changed its stylesheet format'), message);
  });

  test('a healthy install has no warning', () => {
    assert.strictEqual(formatHealthWarning('2.1.287', HEALTHY), '');
  });
});
