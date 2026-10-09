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

  test('removeCssPatchFromContent removes every block', () => {
    const block = '\n/* bidi-rtl-patch-start */\n.x{}\n/* bidi-rtl-patch-end */';
    const restored = removeCssPatchFromContent(FAKE_CSS + block + block);
    assert.strictEqual(restored, FAKE_CSS);
  });

  test('removeCssPatchFromContent is safe on unpatched CSS', () => {
    const result = removeCssPatchFromContent(FAKE_CSS);
    assert.strictEqual(result, FAKE_CSS);
  });
});

suite('patcher — CSS content', () => {
  test('patched output contains a literal backslash before 2022', () => {
    const patched = applyCssPatchToContent(FAKE_CSS);
    assert.ok(patched.includes('\\2022'), 'expected 5-char sequence \\2022');
    assert.ok(!patched.includes('\\\\2022'), 'backslash must not be doubled');
  });

  test('patch uses text-align:start and keeps the markers first/last', () => {
    const patched = applyCssPatchToContent(FAKE_CSS);
    const block = patched.slice(FAKE_CSS.length + 1);
    assert.ok(block.startsWith('/* bidi-rtl-patch-start */'));
    assert.ok(block.endsWith('/* bidi-rtl-patch-end */'));
    assert.ok(patched.includes('[role="textbox"][aria-label="Message input"]'));
    assert.ok(patched.includes('text-align:start;'));
  });
});
