import * as assert from 'assert';

// Helpers for the tests that check the CSS block files. Not a test file itself.

export interface TopLevelRule {
  prelude: string;
  body: string;
}

/** Splits a flat stylesheet (comments removed, no nesting) into top-level rules. */
export function topLevelRules(css: string): TopLevelRule[] {
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
export function splitSelectors(prelude: string): string[] {
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
export function urls(css: string): string[] {
  return [...css.matchAll(/url\(\s*(?:"([^"]*)"|'([^']*)'|([^)\s'"]+))\s*\)/g)].map((m) => m[1] ?? m[2] ?? m[3]);
}

/** The property names a rule body declares, lowercased (custom properties included). */
export function properties(body: string): string[] {
  return [...body.matchAll(/(?:^|;)\s*([\w-]+)\s*:/g)].map((m) => m[1].toLowerCase());
}

/** The class names a selector list names. */
export function classNames(prelude: string): string[] {
  return [...prelude.matchAll(/\.(-?[_a-zA-Z][\w-]*)/g)].map((m) => m[1]);
}
