import * as assert from 'assert';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { findClaudeCodeCssPaths, removePatchFromAll } from '../cleanup';
import { applyCssPatchToContent } from '../patcher';
import { main } from '../uninstall';

const ORIGINAL_A = '.a{color:red}\n.b{display:flex}';
const ORIGINAL_B = '.c{margin:0}';
const OTHER = applyCssPatchToContent('.other{top:0}');

async function write(file: string, content: string): Promise<void> {
  await fs.promises.mkdir(path.dirname(file), { recursive: true });
  await fs.promises.writeFile(file, content, 'utf8');
}

suite('cleanup — uninstall', () => {
  let root: string;
  let cssA: string;
  let cssB: string;
  let cssD: string;

  setup(async () => {
    root = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'bidi-cleanup-'));
    cssA = path.join(root, 'anthropic.claude-code-2.1.287-darwin-arm64', 'webview', 'index.css');
    cssB = path.join(root, 'anthropic.claude-code-2.1.292-darwin-arm64', 'webview', 'index.css');
    cssD = path.join(root, 'some.other-ext', 'webview', 'index.css');
    await write(cssA, applyCssPatchToContent(ORIGINAL_A));
    await write(cssB, ORIGINAL_B);
    await fs.promises.mkdir(path.join(root, 'anthropic.claude-code-2.1.100-darwin-arm64'));
    await write(cssD, OTHER);
  });

  teardown(async () => {
    await fs.promises.rm(root, { recursive: true, force: true });
  });

  test('findClaudeCodeCssPaths returns only claude-code css files', async () => {
    const found = (await findClaudeCodeCssPaths(root)).sort();
    assert.deepStrictEqual(found, [cssA, cssB].sort());
  });

  test('findClaudeCodeCssPaths follows symlinked claude-code folders', async () => {
    const target = path.join(root, 'real-target');
    const cssLinked = path.join(target, 'webview', 'index.css');
    await write(cssLinked, ORIGINAL_B);
    const link = path.join(root, 'anthropic.claude-code-2.1.300-darwin-arm64');
    await fs.promises.symlink(target, link, 'dir');
    const found = await findClaudeCodeCssPaths(root);
    assert.ok(found.includes(path.join(link, 'webview', 'index.css')));
  });

  test('removePatchFromAll un-patches only patched claude-code files', async () => {
    assert.strictEqual(await removePatchFromAll(root), 1);
    assert.strictEqual(await fs.promises.readFile(cssA, 'utf8'), ORIGINAL_A);
    assert.strictEqual(await fs.promises.readFile(cssB, 'utf8'), ORIGINAL_B);
    assert.strictEqual(await fs.promises.readFile(cssD, 'utf8'), OTHER);
  });

  test('missing root yields [] and 0 without throwing', async () => {
    const missing = path.join(root, 'does-not-exist');
    assert.deepStrictEqual(await findClaudeCodeCssPaths(missing), []);
    assert.strictEqual(await removePatchFromAll(missing), 0);
  });

  test('uninstall main() returns the un-patched count', async () => {
    assert.strictEqual(await main(root), 1);
    assert.strictEqual(await fs.promises.readFile(cssA, 'utf8'), ORIGINAL_A);
    assert.strictEqual(await main(path.join(root, 'nope')), 0);
  });
});
