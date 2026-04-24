import * as assert from 'assert';
import { isPatched, applyPatchToContent, removePatchFromContent, buildWorkbenchHtmlPath } from '../patcher';

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

  test('applyPatchToContent throws when </head> is absent', () => {
    assert.throws(
      () => applyPatchToContent('<html><body></body></html>'),
      /no <\/head> tag found/
    );
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

  test('buildWorkbenchHtmlPath returns correct path on macOS', () => {
    const result = buildWorkbenchHtmlPath('/Applications/VSCode.app/Contents/MacOS/Electron', 'darwin');
    assert.ok(result.includes('Resources/app'), 'macOS path must use Resources/app');
    assert.ok(result.endsWith('workbench.desktop.main.html'));
  });

  test('buildWorkbenchHtmlPath returns correct path on Windows/Linux', () => {
    const result = buildWorkbenchHtmlPath('C:\\Program Files\\VSCode\\Code.exe', 'win32');
    assert.ok(result.includes('resources\\app') || result.includes('resources/app'), 'non-macOS path must use resources/app');
    assert.ok(result.endsWith('workbench.desktop.main.html'));
  });
});
