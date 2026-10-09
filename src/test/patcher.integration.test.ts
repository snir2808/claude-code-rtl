import * as assert from 'assert';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { randomUUID } from 'crypto';
import { applyCssPatch, removeCssPatch, isCssPatched } from '../patcher';

const FAKE_CSS = `.foo{color:red}\n.bar{display:flex}`;

suite('patcher — file I/O', () => {
  let tmpFile: string;

  setup(async () => {
    tmpFile = path.join(os.tmpdir(), `bidi-test-${randomUUID()}.css`);
    await fs.promises.writeFile(tmpFile, FAKE_CSS, 'utf8');
  });

  teardown(async () => {
    await fs.promises.unlink(tmpFile).catch(() => {});
  });

  test('applyCssPatch writes patched content and returns true', async () => {
    const result = await applyCssPatch(tmpFile);
    assert.strictEqual(result, true);
    const content = await fs.promises.readFile(tmpFile, 'utf8');
    assert.ok(isCssPatched(content));
    assert.ok(content.includes('/* bidi-rtl-patch-start */'));
    assert.ok(content.includes('/* bidi-rtl-patch-end */'));
  });

  test('applyCssPatch returns false when already patched', async () => {
    await applyCssPatch(tmpFile);
    const result = await applyCssPatch(tmpFile);
    assert.strictEqual(result, false);
  });

  test('removeCssPatch restores original content', async () => {
    await applyCssPatch(tmpFile);
    const removed = await removeCssPatch(tmpFile);
    assert.strictEqual(removed, true);
    const content = await fs.promises.readFile(tmpFile, 'utf8');
    assert.strictEqual(content, FAKE_CSS);
  });

  test('removeCssPatch returns false when not patched', async () => {
    const removed = await removeCssPatch(tmpFile);
    assert.strictEqual(removed, false);
    const content = await fs.promises.readFile(tmpFile, 'utf8');
    assert.strictEqual(content, FAKE_CSS);
  });

  test('apply and remove leave no temp files behind', async () => {
    await applyCssPatch(tmpFile);
    await removeCssPatch(tmpFile);
    const leftovers = (await fs.promises.readdir(os.tmpdir()))
      .filter((f) => f.startsWith(path.basename(tmpFile) + '.bidi-rtl-tmp'));
    assert.deepStrictEqual(leftovers, []);
  });

  test('applyCssPatch migrates an old-format block to exactly one new block', async () => {
    const old = FAKE_CSS + '\n/* bidi-rtl-patch-start */\n.old{direction:rtl}\n/* bidi-rtl-patch-end */';
    await fs.promises.writeFile(tmpFile, old, 'utf8');
    assert.strictEqual(await applyCssPatch(tmpFile), true);
    const content = await fs.promises.readFile(tmpFile, 'utf8');
    assert.strictEqual(content.split('/* bidi-rtl-patch-start */').length - 1, 1);
    assert.ok(!content.includes('.old{'));
    assert.ok(content.includes('messagesContainer_'));
  });
});
