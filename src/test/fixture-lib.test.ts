import * as assert from 'assert';
import * as path from 'path';

// scripts/fixture-lib.js is plain JS, loaded from the repo (the tests run from out/test).
const { missingClasses } = require(path.join(__dirname, '..', '..', 'scripts', 'fixture-lib')) as {
  missingClasses(page: string, css: string): string[];
};

suite('fixture-lib — missingClasses', () => {
  test('finds plain class names, skips placeholders and reports the undefined ones', () => {
    const page = '<div class="turn_07S1Yg __THEME_CLASS__ ghost"></div>';
    assert.deepStrictEqual(missingClasses(page, '.turn_07S1Yg{top:0}'), ['ghost']);
  });

  test('reads class lists HTML-decoded and looks names up the way CSS escapes them', () => {
    const page = '<div class="max-w-(--user-chat-width) [&amp;&gt;p]:!m-0 rounded-2xl"></div>';
    const css =
      '.max-w-\\(--user-chat-width\\){max-width:var(--user-chat-width)}' +
      '.\\[\\&\\>p\\]\\:\\!m-0>p{margin:0!important}';
    assert.deepStrictEqual(missingClasses(page, css), ['rounded-2xl']);
  });

  test('a longer name does not count', () => {
    assert.deepStrictEqual(missingClasses('<p class="value"></p>', '.value-x{top:0}'), ['value']);
  });
});
