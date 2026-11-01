import * as assert from 'assert';
import * as fs from 'fs';
import * as path from 'path';
import { RTL } from '../features';
import { TopLevelRule, properties, splitSelectors, topLevelRules } from './css-rules';

const ROOT = path.join(__dirname, '..', '..');
const read = (file: string): string => fs.readFileSync(path.join(ROOT, file), 'utf8');
const withoutComments = (css: string): string => css.replace(/\/\*[\s\S]*?\*\//g, '');
const oneLine = (body: string): string => body.replace(/\s/g, '');
/** A full Codex CSS-module class name, e.g. _MarkdownRoot_16avx_2: selectors match the prefix only. */
const HASHED_CODEX_CLASS = /_[A-Za-z]+_[a-z0-9]{5}_\d+/;
const MARKDOWN = '[class*="_MarkdownRoot_"]';
const COMPOSER = '[class*="_RichTextInput_"]';
const USER_MESSAGE = '.bg-user-message[class*="_bubble_"]';
/** A loose list item's first paragraph, which runs inline beside the item's marker. */
const LOOSE_ITEM_PARAGRAPH = '[class*="_MarkdownRoot_"] [class*="_ListItem_"]>[class*="_Paragraph_"]:first-child';

// Each suite reads its file in suiteSetup, so a missing file fails its tests
// instead of aborting the whole run while the suites are registered.
suite('codex-rtl.css', () => {
  let css: string;
  let rules: TopLevelRule[];

  suiteSetup(() => {
    css = read(RTL.blocks.codex.cssFile);
    rules = topLevelRules(css);
  });

  test('holds only the block body: no markers, no at-rules, no !important', () => {
    assert.ok(!css.includes('bidi-codex-'));
    assert.ok(rules.length > 0);
    assert.deepStrictEqual(rules.filter((r) => r.prelude.startsWith('@')), []);
    assert.ok(!css.includes('!important'));
  });

  test('every selector starts with the markdown root, the composer or your message', () => {
    for (const rule of rules) {
      for (const selector of splitSelectors(rule.prelude)) {
        assert.ok(
          [MARKDOWN, COMPOSER, USER_MESSAGE].some((scope) => selector.startsWith(scope)),
          `unscoped selector: ${selector}`
        );
      }
    }
  });

  test('declares only direction and list-marker properties, plus inline display for a loose list item\'s first paragraph', () => {
    const allowed = new Set(['direction', 'text-align', 'unicode-bidi', 'list-style-position']);
    for (const rule of rules) {
      for (const property of properties(rule.body)) {
        const ok = allowed.has(property) || (property === 'content' && rule.prelude.endsWith('::marker')) || (property === 'display' && rule.prelude === LOOSE_ITEM_PARAGRAPH);
        assert.ok(ok, `${property} in "${rule.prelude}"`);
      }
    }
  });

  test('keeps Codex\'s dir="auto" on the markdown root: no rule targets the root itself', () => {
    for (const rule of rules) {
      for (const selector of splitSelectors(rule.prelude)) {
        assert.notStrictEqual(selector, MARKDOWN);
      }
    }
  });

  test('each paragraph, heading, list item and quote, and each composer line, follows its own text', () => {
    const selectors = rules
      .filter((r) => oneLine(r.body) === 'unicode-bidi:plaintext;text-align:start;')
      .flatMap((r) => splitSelectors(r.prelude));
    for (const part of ['_Paragraph_', '_Heading_', '_ListItem_', '_Blockquote_']) {
      assert.ok(selectors.some((s) => s.startsWith(MARKDOWN) && s.includes(part)), part);
    }
    assert.ok(
      selectors.some((s) => s.startsWith(`${COMPOSER} .ProseMirror`) && /\bp\b/.test(s) && /\bli\b/.test(s)),
      'composer lines'
    );
  });

  test('list markers sit inside their item and follow its language', () => {
    assert.ok(rules.some((r) => r.prelude.endsWith('[class*="_ListItem_"]') && oneLine(r.body) === 'list-style-position:inside;'));
    assert.ok(rules.some((r) => r.prelude.endsWith('[class*="_ListItem_"]::marker') && oneLine(r.body) === 'unicode-bidi:normal;'));
  });

  test("a loose list item's first paragraph runs inline, so its marker sits beside it", () => {
    const rule = rules.find((r) => r.prelude === LOOSE_ITEM_PARAGRAPH);
    assert.ok(rule, 'no rule for a loose list item\'s first paragraph');
    assert.strictEqual(oneLine(rule.body), 'display:inline;unicode-bidi:normal;');
  });

  test('your message is right-to-left, so its accent bar sits on the right', () => {
    const rule = rules.find((r) => r.prelude === USER_MESSAGE);
    assert.ok(rule, 'no rule for your message');
    assert.strictEqual(oneLine(rule.body), 'direction:rtl;');
  });

  test('keeps a single backslash before 2022, and names no hashed class', () => {
    assert.ok(css.includes('\\2022'));
    assert.ok(!css.includes('\\\\2022'));
    assert.strictEqual(HASHED_CODEX_CLASS.exec(withoutComments(css)), null);
  });
});
