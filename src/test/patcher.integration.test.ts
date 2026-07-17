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
});
