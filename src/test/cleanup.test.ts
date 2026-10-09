import * as assert from 'assert';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { cleanupAll, findClaudeCodeCssPaths } from '../cleanup';
import { RTL, THEME } from '../features';
import { appendBlock } from '../patcher';
import { main } from '../uninstall';

const ORIGINAL_A = '.a{color:red}\n.b{display:flex}';
const ORIGINAL_B = '.c{margin:0}';
const ORIGINAL_C = '.d{padding:0}';
const OTHER = appendBlock('.other{top:0}', RTL.markers, '.x{}');

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

  setup(async () => {
    root = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'bidi-cleanup-'));
    cssA = path.join(root, 'anthropic.claude-code-2.1.287-darwin-arm64', 'webview', 'index.css');
    cssB = path.join(root, 'anthropic.claude-code-2.1.292-darwin-arm64', 'webview', 'index.css');
    cssC = path.join(root, 'anthropic.claude-code-2.1.300-darwin-arm64', 'webview', 'index.css');
    cssD = path.join(root, 'some.other-ext', 'webview', 'index.css');
    await write(cssA, appendBlock(ORIGINAL_A, RTL.markers, '.r{}'));
    await write(cssB, ORIGINAL_B);
    await write(cssC, appendBlock(appendBlock(ORIGINAL_C, THEME.markers, '.t{}'), RTL.markers, '.r{}'));
    fontsC = THEME.assets.map((a) => path.join(path.dirname(cssC), a.target));
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
    assert.strictEqual(await cleanupAll(root), 2);
    assert.strictEqual(await fs.promises.readFile(cssA, 'utf8'), ORIGINAL_A);
    assert.strictEqual(await fs.promises.readFile(cssB, 'utf8'), ORIGINAL_B);
    assert.strictEqual(await fs.promises.readFile(cssC, 'utf8'), ORIGINAL_C);
    assert.strictEqual(await fs.promises.readFile(cssD, 'utf8'), OTHER);
    for (const font of fontsC) {
      assert.ok(!fs.existsSync(font), font);
    }
  });

  test('missing root yields [] and 0 without throwing', async () => {
    const missing = path.join(root, 'does-not-exist');
    assert.deepStrictEqual(await findClaudeCodeCssPaths(missing), []);
    assert.strictEqual(await cleanupAll(missing), 0);
  });

  test('uninstall main() returns the cleaned count', async () => {
    assert.strictEqual(await main(root), 2);
    assert.strictEqual(await fs.promises.readFile(cssC, 'utf8'), ORIGINAL_C);
    assert.strictEqual(await main(path.join(root, 'nope')), 0);
  });
});
