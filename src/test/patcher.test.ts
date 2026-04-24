import * as assert from 'assert';
import { isPatched, applyPatchToContent, removePatchFromContent } from '../patcher';

const FAKE_HTML = `<!DOCTYPE html>
<html>
<head>
<title>VSCode</title>
</head>
<body></body>
</html>`;

suite('patcher — pure functions', () => {
  test('isPatched returns false for unpatched HTML', () => {
    assert.strictEqual(isPatched(FAKE_HTML), false);
  });

  test('isPatched returns true for patched HTML', () => {
    const patched = applyPatchToContent(FAKE_HTML);
    assert.strictEqual(isPatched(patched), true);
  });

  test('applyPatchToContent injects block before </head>', () => {
    const patched = applyPatchToContent(FAKE_HTML);
    assert.ok(patched.includes('<!-- bidi-rtl-patch-start -->'));
    assert.ok(patched.includes('direction: rtl'));
    const patchIdx = patched.indexOf('<!-- bidi-rtl-patch-start -->');
    const headIdx = patched.indexOf('</head>');
    assert.ok(patchIdx < headIdx, 'patch must appear before </head>');
  });

  test('applyPatchToContent is idempotent', () => {
    const once = applyPatchToContent(FAKE_HTML);
    const twice = applyPatchToContent(once);
    assert.strictEqual(once, twice);
  });

  test('removePatchFromContent restores original HTML exactly', () => {
    const patched = applyPatchToContent(FAKE_HTML);
    const restored = removePatchFromContent(patched);
    assert.strictEqual(restored, FAKE_HTML);
  });

  test('removePatchFromContent is safe on unpatched HTML', () => {
    const result = removePatchFromContent(FAKE_HTML);
    assert.strictEqual(result, FAKE_HTML);
  });
});
