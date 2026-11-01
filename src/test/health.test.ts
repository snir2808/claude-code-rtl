import * as assert from 'assert';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import {
  CodexHealthReport,
  HealthReport,
  REQUIRED_CHAT_CLASSES,
  REQUIRED_CLASS_PREFIXES,
  REQUIRED_CODEX_HOOKS,
  REQUIRED_JS_HOOKS,
  WorkbenchHealthReport,
  checkCodexHealth,
  checkCodexInstallHealth,
  checkHealth,
  checkInstallHealth,
  checkWorkbenchHealth,
  checkWorkbenchInstallHealth,
  formatCodexHealthWarning,
  formatHealthWarning,
  formatWorkbenchHealthWarning,
  isCodexHealthy,
  isHealthy,
  isWorkbenchHealthy,
} from '../health';
import { appendBlock } from '../blocks';
import { RTL, THEME } from '../features';
import { workbenchCssPath } from '../workbench';

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

suite('health — the Copilot chat', () => {
  const GOOD_WORKBENCH = REQUIRED_CHAT_CLASSES.map((c) => `.${c}{color:red}`).join('\n');
  const HEALTHY_CHAT: WorkbenchHealthReport = { unreadable: false, missingClasses: [] };

  test('a complete workbench CSS is healthy', () => {
    const report = checkWorkbenchHealth(GOOD_WORKBENCH);
    assert.deepStrictEqual(report, HEALTHY_CHAT);
    assert.strictEqual(isWorkbenchHealthy(report), true);
  });

  test('missing classes are listed, and a longer name does not count', () => {
    const css = GOOD_WORKBENCH.replace('.chat-input-toolbar{color:red}', '.chat-input-toolbar-x{color:red}');
    assert.deepStrictEqual(checkWorkbenchHealth(css).missingClasses, ['chat-input-toolbar']);
    assert.strictEqual(isWorkbenchHealthy(checkWorkbenchHealth(css)), false);
  });

  test('an unreadable file is reported, and nothing in it is checked', () => {
    assert.deepStrictEqual(checkWorkbenchHealth(null), { unreadable: true, missingClasses: [] });
    assert.strictEqual(isWorkbenchHealthy(checkWorkbenchHealth(null)), false);
  });

  suite('checkWorkbenchInstallHealth', () => {
    let appRoot: string;

    setup(async () => {
      appRoot = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'bidi-chat-health-'));
      await fs.promises.mkdir(path.dirname(workbenchCssPath(appRoot)), { recursive: true });
    });

    teardown(async () => {
      await fs.promises.rm(appRoot, { recursive: true, force: true });
    });

    test("ignores this extension's own blocks, which name the same classes", async () => {
      const css = appendBlock(GOOD_WORKBENCH.replace('.value{color:red}', ''), THEME.blocks.workbench.markers, '.value{}');
      await fs.promises.writeFile(workbenchCssPath(appRoot), css);
      assert.deepStrictEqual((await checkWorkbenchInstallHealth(appRoot)).missingClasses, ['value']);
    });

    test('reports a missing file instead of rejecting', async () => {
      assert.strictEqual((await checkWorkbenchInstallHealth(appRoot)).unreadable, true);
    });
  });

  test('the warning names the VS Code version and the missing classes', () => {
    const message = formatWorkbenchHealthWarning('1.144.0-insider', { unreadable: false, missingClasses: ['value', 'codicon'] });
    assert.ok(message.includes('1.144.0-insider'), message);
    assert.ok(message.includes('.value, .codicon'), message);
  });

  test('the warning names a file it could not read', () => {
    const message = formatWorkbenchHealthWarning('1.144.0-insider', { unreadable: true, missingClasses: [] });
    assert.ok(message.includes('could not read the workbench CSS'), message);
    assert.ok(!message.includes('Missing'), message);
  });

  test('a healthy workbench CSS has no warning', () => {
    assert.strictEqual(formatWorkbenchHealthWarning('1.143.0-insider', HEALTHY_CHAT), '');
  });
});

suite('health — Codex', () => {
  /** One CSS rule per hook, the way Codex's files spell them. */
  const GOOD_CODEX = REQUIRED_CODEX_HOOKS.map((hook) =>
    hook.endsWith('_')
      ? `${hook}abc12_1{color:red}`
      : hook.startsWith('[')
        ? `${hook}=x]{color:red}`
        : hook.startsWith('--')
          ? `:root{${hook}:0}`
          : `${hook}{color:red}`
  ).join('\n');
  const HEALTHY_CODEX: CodexHealthReport = { unreadable: false, missingHooks: [] };

  test('a complete Codex stylesheet set is healthy', () => {
    const report = checkCodexHealth(GOOD_CODEX);
    assert.deepStrictEqual(report, HEALTHY_CODEX);
    assert.strictEqual(isCodexHealthy(report), true);
  });

  test('missing hooks are listed; a longer class or property name does not count', () => {
    const css = GOOD_CODEX.replace('.ProseMirror{color:red}', '.ProseMirror-focused{color:red}').replace(
      ':root{--font-ui-family:0}',
      ':root{--font-ui-family-x:0}'
    );
    assert.deepStrictEqual(checkCodexHealth(css).missingHooks, ['.ProseMirror', '--font-ui-family']);
    assert.strictEqual(isCodexHealthy(checkCodexHealth(css)), false);
  });

  test('an unreadable stylesheet set is reported, and nothing in it is checked', () => {
    assert.deepStrictEqual(checkCodexHealth(null), { unreadable: true, missingHooks: [] });
    assert.strictEqual(isCodexHealthy(checkCodexHealth(null)), false);
  });

  suite('checkCodexInstallHealth', () => {
    let assets: string;

    setup(async () => {
      assets = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'bidi-codex-health-'));
    });

    teardown(async () => {
      await fs.promises.rm(assets, { recursive: true, force: true });
    });

    test('reads every CSS file in the stylesheet\'s folder', async () => {
      const lines = GOOD_CODEX.split('\n');
      const half = Math.ceil(lines.length / 2);
      await fs.promises.writeFile(path.join(assets, 'app-initial-0123456789ab.css'), lines.slice(0, half).join('\n'));
      await fs.promises.writeFile(path.join(assets, 'markdown-0123456789ab.css'), lines.slice(half).join('\n'));
      await fs.promises.writeFile(path.join(assets, 'notes.txt'), '.ProseMirror{}');
      assert.deepStrictEqual(await checkCodexInstallHealth(path.join(assets, 'app-initial-0123456789ab.css')), HEALTHY_CODEX);
    });

    test("ignores this extension's own blocks, which name the same hooks", async () => {
      const without = GOOD_CODEX.replace('.ProseMirror{color:red}', '');
      const css = appendBlock(
        appendBlock(without, THEME.blocks.codex.markers, '.ProseMirror{}'),
        RTL.blocks.codex.markers,
        '.ProseMirror p{}'
      );
      const cssPath = path.join(assets, 'app-initial-0123456789ab.css');
      await fs.promises.writeFile(cssPath, css);
      assert.deepStrictEqual((await checkCodexInstallHealth(cssPath)).missingHooks, ['.ProseMirror']);
    });

    test('reports a folder it cannot read instead of rejecting', async () => {
      const report = await checkCodexInstallHealth(path.join(assets, 'gone', 'app-initial-0123456789ab.css'));
      assert.deepStrictEqual(report, { unreadable: true, missingHooks: [] });
    });
  });

  test('the warning names the Codex version and the missing hooks', () => {
    const message = formatCodexHealthWarning('26.51021.22027', { unreadable: false, missingHooks: ['._MarkdownRoot_', '.ProseMirror'] });
    assert.ok(message.includes('Codex 26.51021.22027'), message);
    assert.ok(message.includes('._MarkdownRoot_, .ProseMirror'), message);
  });

  test('the warning names stylesheets it could not read', () => {
    const message = formatCodexHealthWarning('26.51021.22027', { unreadable: true, missingHooks: [] });
    assert.ok(message.includes('could not read the stylesheets of Codex 26.51021.22027'), message);
    assert.ok(!message.includes('Missing'), message);
  });

  test('a healthy Codex has no warning', () => {
    assert.strictEqual(formatCodexHealthWarning('26.51021.22027', HEALTHY_CODEX), '');
  });
});
