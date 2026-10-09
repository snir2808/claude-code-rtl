import * as assert from 'assert';
import * as fs from 'fs';
import * as path from 'path';
import { THEME } from '../features';

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

suite('theme.css — rules', () => {
  const css = fs.readFileSync(path.join(ROOT, THEME.cssFile), 'utf8');
  const rules = topLevelRules(css);

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
  const css = fs.readFileSync(path.join(ROOT, THEME.cssFile), 'utf8');

  test('every url() points at a declared theme asset, and every asset is used', () => {
    const urls = [...css.matchAll(/url\("([^"]+)"\)/g)].map((m) => m[1]).sort();
    assert.deepStrictEqual(urls, THEME.assets.map((a) => a.target).sort());
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
