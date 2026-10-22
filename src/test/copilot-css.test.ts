import * as assert from 'assert';
import * as fs from 'fs';
import * as path from 'path';
import { RTL } from '../features';
import { TopLevelRule, properties, splitSelectors, topLevelRules } from './css-rules';

const ROOT = path.join(__dirname, '..', '..');
/** Parts VS Code lays out in JS: the input part, its toolbars, the Monaco editors and the list. */
const JS_LAID_OUT = /\.(interactive-input-part|chat-input-[\w-]+|chat-editor-container|interactive-input-editor|monaco-editor|monaco-list|view-lines?)(?![\w-])/;
const read = (file: string): string => fs.readFileSync(path.join(ROOT, file), 'utf8');
const oneLine = (body: string): string => body.replace(/\s/g, '');

// Each suite reads its file in suiteSetup, so a missing file fails its tests
// instead of aborting the whole run while the suites are registered.
suite('copilot-rtl.css', () => {
  let css: string;
  let rules: TopLevelRule[];

  suiteSetup(() => {
    css = read(RTL.blocks.workbench.cssFile);
    rules = topLevelRules(css);
  });

  test('holds only the block body: no markers, no !important, no at-rules', () => {
    assert.ok(!css.includes('bidi-copilot-'));
    assert.ok(!css.includes('!important'));
    assert.ok(rules.length > 0);
    assert.deepStrictEqual(rules.filter((r) => r.prelude.startsWith('@')), []);
  });

  test('every selector starts with .interactive-session', () => {
    for (const rule of rules) {
      for (const selector of splitSelectors(rule.prelude)) {
        assert.match(selector, /^\.interactive-session(?![\w-])/, `unscoped selector: ${selector}`);
      }
    }
  });

  test('declares only direction and list-marker properties', () => {
    const allowed = new Set(['direction', 'text-align', 'unicode-bidi', 'list-style-position']);
    for (const rule of rules) {
      for (const property of properties(rule.body)) {
        const ok = allowed.has(property) || (property === 'content' && rule.prelude.endsWith('::marker'));
        assert.ok(ok, `${property} in "${rule.prelude}"`);
      }
    }
  });

  test('never turns the parts VS Code lays out in JS right-to-left', () => {
    for (const rule of rules) {
      assert.doesNotMatch(rule.prelude, JS_LAID_OUT, rule.prelude);
    }
  });

  test('turns message text right-to-left and keeps code and tool calls left-to-right', () => {
    const rtl = rules.find((r) => oneLine(r.body).includes('direction:rtl'));
    assert.ok(rtl, 'no RTL rule');
    assert.ok(splitSelectors(rtl.prelude).includes('.interactive-session .interactive-item-container .value .rendered-markdown'));
    const ltr = rules.find((r) => oneLine(r.body).includes('direction:ltr'));
    assert.ok(ltr, 'no LTR rule');
    for (const part of ['code', 'interactive-result-code-block', 'chat-tool-invocation-part', 'chat-terminal-content-part']) {
      assert.ok(ltr.prelude.includes(part), `${part} is not kept LTR`);
    }
  });
});
