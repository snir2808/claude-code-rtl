import * as assert from 'assert';
import { isCssPatched, applyCssPatchToContent, removeCssPatchFromContent } from '../patcher';

const FAKE_CSS = `.foo{color:red}\n.bar{display:flex}`;

suite('patcher — pure functions', () => {
  test('isCssPatched returns false for unpatched CSS', () => {
    assert.strictEqual(isCssPatched(FAKE_CSS), false);
  });

  test('isCssPatched returns true for patched CSS', () => {
    const patched = applyCssPatchToContent(FAKE_CSS);
    assert.strictEqual(isCssPatched(patched), true);
  });

  test('applyCssPatchToContent appends patch block at end of content', () => {
    const patched = applyCssPatchToContent(FAKE_CSS);
    assert.ok(patched.startsWith(FAKE_CSS), 'original CSS preserved at start');
    assert.ok(patched.includes('/* bidi-rtl-patch-start */'));
    assert.ok(patched.includes('/* bidi-rtl-patch-end */'));
  });

  test('applyCssPatchToContent does not contain hashed class names', () => {
    const patched = applyCssPatchToContent(FAKE_CSS);
    assert.ok(
      !/messageInput_[a-zA-Z]{6,}/.test(patched),
      'must not contain hashed class names like messageInput_cKsPxg'
    );
  });

  test('applyCssPatchToContent is idempotent', () => {
    const once = applyCssPatchToContent(FAKE_CSS);
    const twice = applyCssPatchToContent(once);
    assert.strictEqual(once, twice);
  });

  test('removeCssPatchFromContent restores original CSS exactly', () => {
    const patched = applyCssPatchToContent(FAKE_CSS);
    const restored = removeCssPatchFromContent(patched);
    assert.strictEqual(restored, FAKE_CSS);
  });

  test('removeCssPatchFromContent is safe on unpatched CSS', () => {
    const result = removeCssPatchFromContent(FAKE_CSS);
    assert.strictEqual(result, FAKE_CSS);
  });
});
