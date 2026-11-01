import * as assert from 'assert';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { cleanupAll, findClaudeCodeCssPaths } from '../cleanup';
import { RTL, THEME } from '../features';
import { appendBlock } from '../blocks';
import { main } from '../uninstall';
import { computeChecksum } from '../checksum';
import { WORKBENCH_CSS, workbenchCssPath } from '../workbench';

const ORIGINAL_A = '.a{color:red}\n.b{display:flex}';
const ORIGINAL_B = '.c{margin:0}';
const ORIGINAL_C = '.d{padding:0}';
const OTHER = appendBlock('.other{top:0}', RTL.blocks.claude.markers, '.x{}');

async function write(file: string, content: string): Promise<void> {
  await fs.promises.mkdir(path.dirname(file), { recursive: true });
  await fs.promises.writeFile(file, content, 'utf8');
}

suite('cleanup — uninstall', () => {
  let root: string;
  let cssA: string;
  let cssB: string;
  let cssC: string;
  let cssD: string;
  let fontsC: string[];

  const install = (version: string): string =>
    path.join(root, `anthropic.claude-code-${version}-darwin-arm64`, 'webview', 'index.css');
  const fontsNextTo = (cssPath: string): string[] =>
    THEME.blocks.claude.assets.map((a) => path.join(path.dirname(cssPath), a.target));

  setup(async () => {
    root = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'bidi-cleanup-'));
    cssA = install('2.1.287');
    cssB = install('2.1.292');
    cssC = install('2.1.300');
    cssD = path.join(root, 'some.other-ext', 'webview', 'index.css');
    await write(cssA, appendBlock(ORIGINAL_A, RTL.blocks.claude.markers, '.r{}'));
    await write(cssB, ORIGINAL_B);
    await write(cssC, appendBlock(appendBlock(ORIGINAL_C, THEME.blocks.claude.markers, '.t{}'), RTL.blocks.claude.markers, '.r{}'));
    fontsC = fontsNextTo(cssC);
    for (const font of fontsC) {
      await write(font, 'font');
    }
    await fs.promises.mkdir(path.join(root, 'anthropic.claude-code-2.1.100-darwin-arm64'));
    await write(cssD, OTHER);
  });

  teardown(async () => {
    await fs.promises.rm(root, { recursive: true, force: true });
  });

  test('findClaudeCodeCssPaths returns only claude-code css files', async () => {
    const found = (await findClaudeCodeCssPaths(root)).sort();
    assert.deepStrictEqual(found, [cssA, cssB, cssC].sort());
  });

  test('findClaudeCodeCssPaths follows symlinked claude-code folders', async () => {
    const target = path.join(root, 'real-target');
    await write(path.join(target, 'webview', 'index.css'), ORIGINAL_B);
    const link = path.join(root, 'anthropic.claude-code-2.1.400-darwin-arm64');
    await fs.promises.symlink(target, link, 'dir');
    const found = await findClaudeCodeCssPaths(root);
    assert.ok(found.includes(path.join(link, 'webview', 'index.css')));
  });

  test('cleanupAll strips both blocks and deletes the theme fonts', async () => {
    assert.deepStrictEqual(await cleanupAll(root), { cleaned: 2, failures: [] });
    assert.strictEqual(await fs.promises.readFile(cssA, 'utf8'), ORIGINAL_A);
    assert.strictEqual(await fs.promises.readFile(cssB, 'utf8'), ORIGINAL_B);
    assert.strictEqual(await fs.promises.readFile(cssC, 'utf8'), ORIGINAL_C);
    assert.strictEqual(await fs.promises.readFile(cssD, 'utf8'), OTHER);
    for (const font of fontsC) {
      assert.ok(!fs.existsSync(font), font);
    }
  });

  test('an install with only our fonts left counts as cleaned', async () => {
    const cssE = install('2.1.310');
    await write(cssE, ORIGINAL_B);
    await write(fontsNextTo(cssE)[0], 'font');
    assert.deepStrictEqual(await cleanupAll(root), { cleaned: 3, failures: [] });
    assert.ok(!fs.existsSync(fontsNextTo(cssE)[0]));
    assert.strictEqual(await fs.promises.readFile(cssE, 'utf8'), ORIGINAL_B);
  });

  test('an install that cannot be read is reported and does not stop the rest', async () => {
    const broken = install('2.1.250');
    await fs.promises.mkdir(broken, { recursive: true }); // index.css is a folder: reading it fails
    const result = await cleanupAll(root);
    assert.strictEqual(result.cleaned, 2);
    assert.strictEqual(result.failures.length, 1);
    assert.ok(result.failures[0].includes('anthropic.claude-code-2.1.250'), result.failures[0]);
    assert.strictEqual(await fs.promises.readFile(cssA, 'utf8'), ORIGINAL_A);
    assert.strictEqual(await fs.promises.readFile(cssC, 'utf8'), ORIGINAL_C);
  });

  test('a font that cannot be deleted is reported, and the rest of that install is still cleaned', async () => {
    await fs.promises.rm(fontsC[0]);
    await fs.promises.mkdir(fontsC[0]); // a folder cannot be unlinked as a file
    const result = await cleanupAll(root);
    assert.strictEqual(result.cleaned, 1); // cssA; cssC is not fully clean
    assert.strictEqual(result.failures.length, 1);
    assert.ok(result.failures[0].includes(THEME.blocks.claude.assets[0].target), result.failures[0]);
    assert.strictEqual(await fs.promises.readFile(cssC, 'utf8'), ORIGINAL_C);
    assert.ok(!fs.existsSync(fontsC[1]), fontsC[1]);
  });

  test('missing root yields [] and nothing cleaned, without throwing', async () => {
    const missing = path.join(root, 'does-not-exist');
    assert.deepStrictEqual(await findClaudeCodeCssPaths(missing), []);
    assert.deepStrictEqual(await cleanupAll(missing), { cleaned: 0, failures: [] });
  });

  suite('uninstall main()', () => {
    let logged: string[];
    let consoleLog: typeof console.log;
    const NO_VSCODE = (): string => path.join(root, 'bin', 'node');

    setup(() => {
      logged = [];
      consoleLog = console.log;
      console.log = (...args: unknown[]) => void logged.push(args.join(' '));
    });

    teardown(() => {
      console.log = consoleLog;
    });

    test('returns and logs the cleaned count', async () => {
      assert.strictEqual(await main(root, NO_VSCODE()), 2);
      assert.strictEqual(await fs.promises.readFile(cssC, 'utf8'), ORIGINAL_C);
      assert.strictEqual(await main(path.join(root, 'nope'), NO_VSCODE()), 0);
      assert.deepStrictEqual(logged, [
        'BiDi RTL & Theme: cleaned 2 Claude Code install(s).',
        'BiDi RTL & Theme: cleaned 0 Claude Code install(s).',
      ]);
    });

    test('logs each install it could not clean', async () => {
      await fs.promises.mkdir(install('2.1.250'), { recursive: true });
      assert.strictEqual(await main(root, NO_VSCODE()), 2);
      assert.strictEqual(logged.length, 2, logged.join('\n'));
      assert.strictEqual(logged[0], 'BiDi RTL & Theme: cleaned 2 Claude Code install(s); 1 could not be cleaned.');
      assert.ok(logged[1].startsWith('BiDi RTL & Theme: could not clean '), logged[1]);
      assert.ok(logged[1].includes('anthropic.claude-code-2.1.250'), logged[1]);
    });

    const CODEX_DIR = 'openai.chatgpt-26.51021.22027-darwin-arm64';
    const CODEX_INDEX = '<link rel="stylesheet" href="./assets/app-initial-0123456789ab.css">';

    test('also cleans every Codex install in the extensions folder', async () => {
      const css = path.join(root, CODEX_DIR, 'webview', 'assets', 'app-initial-0123456789ab.css');
      const font = path.join(path.dirname(css), THEME.blocks.codex.assets[0].target);
      await write(path.join(root, CODEX_DIR, 'webview', 'index.html'), CODEX_INDEX);
      await write(css, appendBlock(appendBlock(ORIGINAL_A, THEME.blocks.codex.markers, '.t{}'), RTL.blocks.codex.markers, '.r{}'));
      await write(font, 'font');

      assert.strictEqual(await main(root, NO_VSCODE()), 2);
      assert.strictEqual(await fs.promises.readFile(css, 'utf8'), ORIGINAL_A);
      assert.ok(!fs.existsSync(font), font);
      assert.deepStrictEqual(logged, [
        'BiDi RTL & Theme: cleaned 2 Claude Code install(s).',
        'BiDi RTL & Theme: cleaned 1 Codex install(s).',
      ]);
    });

    test('logs a Codex install it could not clean', async () => {
      const dir = path.join(root, CODEX_DIR);
      await write(path.join(dir, 'webview', 'index.html'), CODEX_INDEX);
      // A folder where the stylesheet goes: reading it fails.
      await fs.promises.mkdir(path.join(dir, 'webview', 'assets', 'app-initial-0123456789ab.css'), { recursive: true });

      assert.strictEqual(await main(root, NO_VSCODE()), 2);
      assert.strictEqual(logged.length, 3, logged.join('\n'));
      assert.strictEqual(logged[1], 'BiDi RTL & Theme: cleaned 0 Codex install(s); 1 could not be cleaned.');
      assert.ok(logged[2].startsWith(`BiDi RTL & Theme: could not clean ${dir}: `), logged[2]);
    });

    test('also cleans the chat of the VS Code it runs under and restores its checksum', async () => {
      const contents = path.join(root, 'Code.app', 'Contents');
      const appRoot = path.join(contents, 'Resources', 'app');
      const css = workbenchCssPath(appRoot);
      const patched = appendBlock(ORIGINAL_A, THEME.blocks.workbench.markers, '.t{}');
      const product = (content: string): string => `{"checksums":{"${WORKBENCH_CSS}":"${computeChecksum(content)}"}}`;
      await write(css, patched);
      await write(path.join(appRoot, 'product.json'), product(patched));
      await write(path.join(path.dirname(css), THEME.blocks.workbench.assets[0].target), 'font');

      assert.strictEqual(await main(root, path.join(contents, 'MacOS', 'Electron')), 2);
      assert.strictEqual(await fs.promises.readFile(css, 'utf8'), ORIGINAL_A);
      assert.strictEqual(await fs.promises.readFile(path.join(appRoot, 'product.json'), 'utf8'), product(ORIGINAL_A));
      assert.ok(!fs.existsSync(path.join(path.dirname(css), THEME.blocks.workbench.assets[0].target)));
      assert.deepStrictEqual(logged, [
        'BiDi RTL & Theme: cleaned 2 Claude Code install(s).',
        `BiDi RTL & Theme: cleaned VS Code's chat CSS in ${appRoot}.`,
      ]);
    });

    test('logs a chat CSS it could not clean', async () => {
      const contents = path.join(root, 'Code.app', 'Contents');
      const appRoot = path.join(contents, 'Resources', 'app');
      await write(workbenchCssPath(appRoot), appendBlock(ORIGINAL_A, THEME.blocks.workbench.markers, '.t{}'));
      await fs.promises.mkdir(path.join(appRoot, 'product.json'), { recursive: true }); // unreadable
      assert.strictEqual(await main(root, path.join(contents, 'MacOS', 'Electron')), 2);
      assert.strictEqual(logged.length, 2, logged.join('\n'));
      assert.ok(logged[1].startsWith("BiDi RTL & Theme: could not clean VS Code's chat CSS — "), logged[1]);
    });
  });
});
