import * as assert from 'assert';
import * as fs from 'fs';
import * as path from 'path';
import { RTL, THEME } from '../features';
import { REQUIRED_CHAT_CLASSES } from '../health';
import { TopLevelRule, classNames, properties, splitSelectors, topLevelRules, urls } from './css-rules';

const ROOT = path.join(__dirname, '..', '..');
/** Parts VS Code lays out in JS: the input part, its toolbars, the Monaco editors and the list. */
const JS_LAID_OUT = /\.(interactive-input-part|chat-input-[\w-]+|chat-editor-container|interactive-input-editor|monaco-editor|monaco-list|view-lines?)(?![\w-])/;
const read = (file: string): string => fs.readFileSync(path.join(ROOT, file), 'utf8');
const oneLine = (body: string): string => body.replace(/\s/g, '');
/** Lines of the input editor (Monaco) that hold right-to-left text, which Monaco marks dir="ltr", and their text runs. */
const INPUT_LINE = '.interactive-session .interactive-input-part .chat-editor-container .view-line[dir="ltr"]>span';
const INPUT_RUN = `${INPUT_LINE}>span`;

// Each suite reads its file in suiteSetup, so a missing file fails its tests
// instead of aborting the whole run while the suites are registered.
suite('copilot-rtl.css', () => {
  let css: string;
  let rules: TopLevelRule[];

  suiteSetup(() => {
    css = read(RTL.blocks.workbench.cssFile);
    rules = topLevelRules(css);
  });

  test('holds only the block body: no markers, no at-rules, !important only against Monaco\'s inline isolate', () => {
    assert.ok(!css.includes('bidi-copilot-'));
    assert.ok(rules.length > 0);
    assert.deepStrictEqual(rules.filter((r) => r.prelude.startsWith('@')), []);
    const important = rules.filter((r) => r.body.includes('!important'));
    assert.deepStrictEqual(important.map((r) => r.prelude), [INPUT_RUN]);
    assert.strictEqual(oneLine(important[0].body), 'unicode-bidi:normal!important;');
  });

  test('every selector starts with .interactive-session', () => {
    for (const rule of rules) {
      for (const selector of splitSelectors(rule.prelude)) {
        assert.match(selector, /^\.interactive-session(?![\w-])/, `unscoped selector: ${selector}`);
      }
    }
  });

  test("declares only direction and list-marker properties, plus the input line's stretch", () => {
    const allowed = new Set(['direction', 'text-align', 'unicode-bidi', 'list-style-position']);
    const stretch = new Set(['left', 'right', 'padding-right']);
    for (const rule of rules) {
      for (const property of properties(rule.body)) {
        const ok =
          allowed.has(property) ||
          (property === 'content' && rule.prelude.endsWith('::marker')) ||
          (stretch.has(property) && rule.prelude === INPUT_LINE);
        assert.ok(ok, `${property} in "${rule.prelude}"`);
      }
    }
  });

  test('of the parts VS Code lays out in JS, touches only input lines that hold right-to-left text', () => {
    for (const rule of rules) {
      for (const selector of splitSelectors(rule.prelude)) {
        if (JS_LAID_OUT.test(selector)) {
          assert.ok([INPUT_LINE, INPUT_RUN].includes(selector), selector);
        }
      }
    }
  });

  test('turns input lines that hold right-to-left text right-to-left, aligned right', () => {
    const line = rules.find((r) => r.prelude === INPUT_LINE);
    assert.ok(line, 'no rule for the input line');
    assert.strictEqual(oneLine(line.body), 'direction:rtl;text-align:start;left:0;right:0;padding-right:8px;');
    assert.ok(rules.some((r) => r.prelude === INPUT_RUN), 'no rule for its text runs');
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

/** The chat view and the chat editor tab, in dark themes; not inline chat (.chat-widget) or quick chat. */
const THEME_SCOPE =
  '.monaco-workbench.vs-dark :is(.chat-viewpane,.editor-instance) .interactive-session:not(.chat-widget>.interactive-session)';
/** The input editor (Monaco), whose font, line height and width VS Code sets in JS. */
const INPUT_EDITOR = /\.(chat-editor-container|interactive-input-editor|monaco-editor|view-lines?|mtk1)(?![\w-])/;

suite('copilot-theme.css — rules', () => {
  let css: string;
  let rules: TopLevelRule[];

  suiteSetup(() => {
    css = read(THEME.blocks.workbench.cssFile);
    rules = topLevelRules(css);
  });

  test('holds only the block body: no markers, no !important', () => {
    assert.ok(!css.includes('bidi-copilot-'));
    assert.ok(!css.includes('!important'));
  });

  test('the only top-level at-rule is @font-face', () => {
    for (const rule of rules.filter((r) => r.prelude.startsWith('@'))) {
      assert.strictEqual(rule.prelude, '@font-face');
    }
  });

  test('every selector starts with the chat scope', () => {
    for (const rule of rules.filter((r) => !r.prelude.startsWith('@'))) {
      for (const selector of splitSelectors(rule.prelude)) {
        const rest = selector.slice(THEME_SCOPE.length);
        assert.ok(selector.startsWith(THEME_SCOPE) && /^($|[\s>:.[])/.test(rest), `unscoped selector: ${selector}`);
      }
    }
  });

  test('no direction, text-align or unicode-bidi declarations', () => {
    for (const rule of rules) {
      const bad = /(^|[;{\s])(direction|text-align|unicode-bidi)\s*:/i.exec(rule.body);
      assert.strictEqual(bad, null, `forbidden property in "${rule.prelude}"`);
    }
  });

  test('of the input editor, sets only the Hebrew font, on lines that hold right-to-left text', () => {
    for (const rule of rules) {
      if (INPUT_EDITOR.test(rule.prelude)) {
        assert.strictEqual(rule.prelude, `${THEME_SCOPE} .chat-editor-container .view-line[dir="ltr"]>span>span`);
        assert.deepStrictEqual(properties(rule.body), ['font-family']);
        assert.ok(rule.body.includes('"BiDi Rubik"'), rule.body);
      }
    }
  });

  test('keeps the input box geometry VS Code computes: tokens only on the box, margins only on the part', () => {
    for (const rule of rules) {
      for (const selector of splitSelectors(rule.prelude)) {
        if (selector.endsWith('.chat-input-container')) {
          assert.ok(properties(rule.body).every((p) => p.startsWith('--')), rule.prelude);
        }
        if (selector.endsWith('.interactive-input-part')) {
          // Tokens are fine; margin-inline is the only real property (VS Code computes the rest).
          assert.deepStrictEqual(properties(rule.body).filter((p) => !p.startsWith('--')), ['margin-inline']);
        }
      }
    }
  });

  test("the input part stays at VS Code's 950px layout width, centered", () => {
    assert.ok(css.includes('margin-inline:max(12px,calc((100% - 926px) / 2));'));
  });
});

suite('copilot-theme.css — assets', () => {
  test('every url() points at a declared theme asset, and every asset is used', () => {
    const css = read(THEME.blocks.workbench.cssFile);
    assert.deepStrictEqual(urls(css).sort(), THEME.blocks.workbench.assets.map((a) => a.target).sort());
  });
});

suite('Copilot CSS — health check coverage', () => {
  test('REQUIRED_CHAT_CLASSES lists exactly the classes both files name', () => {
    const used = new Set<string>();
    for (const file of [THEME.blocks.workbench.cssFile, RTL.blocks.workbench.cssFile]) {
      for (const rule of topLevelRules(read(file)).filter((r) => !r.prelude.startsWith('@'))) {
        for (const name of classNames(rule.prelude)) {
          used.add(name);
        }
      }
    }
    assert.deepStrictEqual([...used].sort(), [...REQUIRED_CHAT_CLASSES].sort());
  });
});
