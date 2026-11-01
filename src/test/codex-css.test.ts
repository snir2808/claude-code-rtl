import * as assert from 'assert';
import * as fs from 'fs';
import * as path from 'path';
import { RTL, THEME } from '../features';
import { REQUIRED_CODEX_HOOKS } from '../health';
import { TopLevelRule, classNames, properties, splitSelectors, topLevelRules, urls } from './css-rules';

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

const DARK = 'body.vscode-dark';
/** <html>, in dark themes: where VS Code writes its colors inline. */
const DARK_ROOT = ':root:has(>body.vscode-dark)';
/** Codex tokens that Codex's own script also writes inline on <html> (the chat size, from VS Code's chat.fontSize). */
const INLINE_CODEX_TOKENS: readonly string[] = ['--codex-chat-font-size-override'];

suite('codex-theme.css — rules', () => {
  let css: string;
  let rules: TopLevelRule[];

  suiteSetup(() => {
    css = read(THEME.blocks.codex.cssFile);
    rules = topLevelRules(css);
  });

  test('holds only the block body: no markers', () => {
    assert.ok(!css.includes('bidi-codex-'));
    assert.ok(rules.length > 0);
  });

  test('the only top-level at-rule is @font-face', () => {
    for (const rule of rules.filter((r) => r.prelude.startsWith('@'))) {
      assert.strictEqual(rule.prelude, '@font-face');
    }
  });

  test('every selector starts with body.vscode-dark or :root:has(>body.vscode-dark)', () => {
    for (const rule of rules.filter((r) => !r.prelude.startsWith('@'))) {
      for (const selector of splitSelectors(rule.prelude)) {
        const scoped = [DARK, DARK_ROOT].some(
          (scope) => selector.startsWith(scope) && /^($|[\s>:.[])/.test(selector.slice(scope.length))
        );
        assert.ok(scoped, `unscoped selector: ${selector}`);
      }
    }
  });

  test('no direction, text-align or unicode-bidi declarations', () => {
    for (const rule of rules) {
      const bad = /(^|[;{\s])(direction|text-align|unicode-bidi)\s*:/i.exec(rule.body);
      assert.strictEqual(bad, null, `forbidden property in "${rule.prelude}"`);
    }
  });

  test('!important only on what VS Code and Codex write inline on <html>: the --vscode-* colors and the chat size', () => {
    for (const rule of rules) {
      for (const declaration of rule.body.split(';').map((d) => d.trim()).filter(Boolean)) {
        const property = declaration.slice(0, declaration.indexOf(':')).trim();
        const important = /!\s*important$/i.test(declaration);
        if (property.startsWith('--vscode-')) {
          assert.strictEqual(rule.prelude, DARK_ROOT, `${property} outside the palette rule`);
          assert.ok(important, `${property} needs !important to outrank VS Code's inline style`);
        } else if (INLINE_CODEX_TOKENS.includes(property)) {
          assert.strictEqual(splitSelectors(rule.prelude)[0], DARK_ROOT, `${property} outside the token rule`);
          assert.ok(important, `${property} needs !important to outrank Codex's inline style`);
        } else {
          assert.ok(!important, `!important on ${property} in "${rule.prelude}"`);
        }
      }
    }
    assert.ok(
      rules.some((r) => /--codex-chat-font-size-override\s*:\s*15px\s*!\s*important/.test(r.body)),
      'the chat size is not forced to 15px'
    );
  });

  test('the palette redefines the VS Code colors Codex paints the panel with', () => {
    const palette = rules.find((r) => r.prelude === DARK_ROOT);
    assert.ok(palette, 'no palette rule');
    const declared = properties(palette.body); // lowercased
    for (const color of [
      '--vscode-foreground',
      '--vscode-sidebar-background',
      '--vscode-editor-background',
      '--vscode-input-background',
      '--vscode-input-border',
      '--vscode-focusborder',
      '--vscode-menu-background',
      '--vscode-textlink-foreground',
      '--vscode-terminal-background',
    ]) {
      assert.ok(declared.includes(color), color);
    }
  });

  test('names no hashed class', () => {
    assert.strictEqual(HASHED_CODEX_CLASS.exec(withoutComments(css)), null);
  });
});

suite('codex-theme.css — assets', () => {
  test('every url() points at a declared theme asset, and every asset is used', () => {
    const css = read(THEME.blocks.codex.cssFile);
    assert.deepStrictEqual(urls(css).sort(), THEME.blocks.codex.assets.map((a) => a.target).sort());
  });
});

/**
 * The Codex hooks a stylesheet uses, written the way REQUIRED_CODEX_HOOKS
 * writes them: CSS-module prefixes ("._Name_"), classes (".name"),
 * attributes ("[name") and Codex's custom properties ("--name"), set or read.
 * VS Code's own body class and --vscode-* colors are not Codex's.
 */
function codexHooks(css: string): Set<string> {
  const hooks = new Set<string>();
  for (const rule of topLevelRules(css).filter((r) => !r.prelude.startsWith('@'))) {
    for (const m of rule.prelude.matchAll(/\[\s*([\w-]+)\s*(?:[~|^$*]?=\s*(?:"([^"]*)"|'([^']*)'|([^\]\s]+)))?\s*\]/g)) {
      hooks.add(m[1] === 'class' ? `.${m[2] ?? m[3] ?? m[4]}` : `[${m[1]}`);
    }
    for (const name of classNames(rule.prelude.replace(/\[[^\]]*\]/g, ''))) {
      if (name !== 'vscode-dark') {
        hooks.add(`.${name}`);
      }
    }
    for (const property of properties(rule.body)) {
      if (property.startsWith('--') && !property.startsWith('--vscode-')) {
        hooks.add(property);
      }
    }
    for (const [, name] of rule.body.matchAll(/var\(\s*(--[\w-]+)/g)) {
      if (!name.startsWith('--vscode-')) {
        hooks.add(name);
      }
    }
  }
  return hooks;
}

suite('Codex CSS — health check coverage', () => {
  test('REQUIRED_CODEX_HOOKS lists exactly the hooks both files use', () => {
    const used = new Set([...codexHooks(read(THEME.blocks.codex.cssFile)), ...codexHooks(read(RTL.blocks.codex.cssFile))]);
    assert.deepStrictEqual([...used].sort(), [...REQUIRED_CODEX_HOOKS].sort());
  });
});
