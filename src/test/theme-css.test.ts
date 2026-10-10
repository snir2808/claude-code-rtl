import * as assert from 'assert';
import * as fs from 'fs';
import * as path from 'path';
import { THEME } from '../features';
import { REQUIRED_CLASS_PREFIXES, REQUIRED_JS_HOOKS } from '../health';

const ROOT = path.join(__dirname, '..', '..');

interface TopLevelRule {
  prelude: string;
  body: string;
}

/** Splits a flat stylesheet (comments removed, no nesting) into top-level rules. */
function topLevelRules(css: string): TopLevelRule[] {
  const src = css.replace(/\/\*[\s\S]*?\*\//g, '');
  const rules: TopLevelRule[] = [];
  let depth = 0;
  let quote: string | null = null;
  let start = 0;
  let prelude = '';
  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    if (quote) {
      if (ch === quote) {
        quote = null;
      }
    } else if (ch === '"' || ch === "'") {
      quote = ch;
    } else if (ch === '{') {
      if (depth === 0) {
        prelude = src.slice(start, i).trim();
        start = i + 1;
      }
      depth++;
    } else if (ch === '}') {
      depth--;
      if (depth === 0) {
        rules.push({ prelude, body: src.slice(start, i) });
        start = i + 1;
      }
    }
  }
  assert.strictEqual(depth, 0, 'unbalanced braces');
  assert.strictEqual(src.slice(start).trim(), '', 'text after the last rule');
  return rules;
}

/** Splits a selector list on commas outside quotes, brackets and parentheses. */
function splitSelectors(prelude: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let quote: string | null = null;
  let start = 0;
  for (let i = 0; i < prelude.length; i++) {
    const ch = prelude[i];
    if (quote) {
      if (ch === quote) {
        quote = null;
      }
    } else if (ch === '"' || ch === "'") {
      quote = ch;
    } else if (ch === '(' || ch === '[') {
      depth++;
    } else if (ch === ')' || ch === ']') {
      depth--;
    } else if (ch === ',' && depth === 0) {
      parts.push(prelude.slice(start, i).trim());
      start = i + 1;
    }
  }
  parts.push(prelude.slice(start).trim());
  return parts;
}

/** The url() references in a stylesheet: unquoted, single- or double-quoted. */
function urls(css: string): string[] {
  return [...css.matchAll(/url\(\s*(?:"([^"]*)"|'([^']*)'|([^)\s'"]+))\s*\)/g)].map((m) => m[1] ?? m[2] ?? m[3]);
}

// Each suite reads the file in suiteSetup, so a missing file fails its tests
// instead of aborting the whole run while the suites are registered.
suite('theme.css — rules', () => {
  let css: string;
  let rules: TopLevelRule[];

  suiteSetup(() => {
    css = fs.readFileSync(path.join(ROOT, THEME.cssFile), 'utf8');
    rules = topLevelRules(css);
  });

  test('holds only the block body: no block markers', () => {
    assert.ok(!css.includes('bidi-theme-patch'));
    assert.ok(!css.includes('bidi-rtl-patch'));
  });

  test('no !important, and nothing keyed on the footer fit stage', () => {
    assert.ok(!css.includes('!important'));
    assert.ok(!css.includes('data-fit-stage'));
  });

  test('the only top-level at-rule is @font-face', () => {
    for (const rule of rules.filter((r) => r.prelude.startsWith('@'))) {
      assert.strictEqual(rule.prelude, '@font-face');
    }
  });

  test('every selector starts with body.vscode-dark', () => {
    for (const rule of rules.filter((r) => !r.prelude.startsWith('@'))) {
      for (const selector of splitSelectors(rule.prelude)) {
        assert.ok(/^body\.vscode-dark(?![\w-])/.test(selector), `unscoped selector: ${selector}`);
      }
    }
  });

  test('no direction, text-align or unicode-bidi declarations', () => {
    for (const rule of rules) {
      const bad = /(^|[;{\s])(direction|text-align|unicode-bidi)\s*:/i.exec(rule.body);
      assert.strictEqual(bad, null, `forbidden property in "${rule.prelude}"`);
    }
  });
});

suite('theme.css — assets', () => {
  let css: string;

  suiteSetup(() => {
    css = fs.readFileSync(path.join(ROOT, THEME.cssFile), 'utf8');
  });

  test('url() references are found in every quoting style', () => {
    assert.deepStrictEqual(urls(`a{src:url(x.woff2)} b{src:url( 'y.woff2' )} c{src:url("z.woff2")}`), [
      'x.woff2',
      'y.woff2',
      'z.woff2',
    ]);
  });

  test('every url() points at a declared theme asset, and every asset is used', () => {
    assert.deepStrictEqual(urls(css).sort(), THEME.assets.map((a) => a.target).sort());
  });

  test('every asset source is a woff2 file', () => {
    for (const asset of THEME.assets) {
      const magic = fs.readFileSync(path.join(ROOT, asset.source)).subarray(0, 4).toString('latin1');
      assert.strictEqual(magic, 'wOF2', asset.source);
    }
  });

  test('the Rubik license ships with the fonts', () => {
    assert.ok(fs.readFileSync(path.join(ROOT, 'fonts', 'OFL.txt'), 'utf8').includes('SIL OPEN FONT LICENSE'));
  });
});

interface AttributeSelector {
  name: string;
  value: string | null;
}

/** Every attribute selector in the style rules' selectors: [name], [name="value"], [name^="value"]… */
function attributeSelectors(css: string): AttributeSelector[] {
  const found: AttributeSelector[] = [];
  for (const rule of topLevelRules(css).filter((r) => !r.prelude.startsWith('@'))) {
    for (const m of rule.prelude.matchAll(/\[\s*([\w-]+)\s*(?:[~|^$*]?=\s*(?:"([^"]*)"|'([^']*)'|([^\]\s]+)))?\s*\]/g)) {
      found.push({ name: m[1], value: m[2] ?? m[3] ?? m[4] ?? null });
    }
  }
  return found;
}

/**
 * Attribute values too generic to look for in minified JS. The hook named
 * here is checked instead.
 */
const STAND_INS: Readonly<Record<string, string>> = {
  '[data-permission-mode="plan"]': 'data-permission-mode',
  '[data-permission-mode="auto"]': 'data-permission-mode',
};

suite('theme.css — health check coverage', () => {
  let selectors: AttributeSelector[];

  suiteSetup(() => {
    selectors = attributeSelectors(fs.readFileSync(path.join(ROOT, THEME.cssFile), 'utf8'));
  });

  test('every class prefix it matches is in REQUIRED_CLASS_PREFIXES', () => {
    const prefixes = selectors.filter((s) => s.name === 'class').map((s) => String(s.value));
    assert.ok(prefixes.length > 0);
    for (const prefix of new Set(prefixes)) {
      assert.ok(REQUIRED_CLASS_PREFIXES.includes(prefix), `${prefix} is not in REQUIRED_CLASS_PREFIXES`);
    }
  });

  test('every other attribute it matches is covered by REQUIRED_JS_HOOKS', () => {
    for (const { name, value } of selectors.filter((s) => s.name !== 'class')) {
      const selector = value === null ? `[${name}]` : `[${name}="${value}"]`;
      const hook = STAND_INS[selector] ?? value ?? name;
      assert.ok(REQUIRED_JS_HOOKS.some((h) => h.includes(hook)), `${selector} is not covered by REQUIRED_JS_HOOKS`);
    }
  });
});
