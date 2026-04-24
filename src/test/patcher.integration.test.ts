import * as assert from 'assert';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { applyPatch, removePatch, isPatched } from '../patcher';

const FAKE_HTML = `<!DOCTYPE html>
<html>
<head>
<title>VSCode</title>
</head>
<body></body>
</html>`;

suite('patcher — file I/O', () => {
  let tmpFile: string;

  setup(async () => {
    tmpFile = path.join(os.tmpdir(), `bidi-test-${Date.now()}.html`);
    await fs.promises.writeFile(tmpFile, FAKE_HTML, 'utf8');
  });

  teardown(async () => {
    await fs.promises.unlink(tmpFile).catch(() => {});
  });

  test('applyPatch writes patched content and returns true', async () => {
    const result = await applyPatch(tmpFile);
    assert.strictEqual(result, true);
    const content = await fs.promises.readFile(tmpFile, 'utf8');
    assert.ok(isPatched(content));
  });

  test('applyPatch returns false when already patched', async () => {
    await applyPatch(tmpFile);
    const result = await applyPatch(tmpFile);
    assert.strictEqual(result, false);
  });

  test('removePatch restores original content', async () => {
    await applyPatch(tmpFile);
    await removePatch(tmpFile);
    const content = await fs.promises.readFile(tmpFile, 'utf8');
    assert.strictEqual(content, FAKE_HTML);
  });
});
