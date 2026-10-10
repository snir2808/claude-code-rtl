import * as assert from 'assert';
import * as fs from 'fs';
import * as path from 'path';
import { FEATURES, RTL, THEME } from '../features';
import { REQUIRED_CLASS_PREFIXES } from '../health';
import { appendBlock, stripBlock } from '../blocks';

const CSS = '.foo{color:red}\n.bar{display:flex}';
const M = { start: '/* x-start */', end: '/* x-end */' };
const OTHER = { start: '/* y-start */', end: '/* y-end */' };
const ROOT = path.join(__dirname, '..', '..');
/** A class name with Claude Code's build-hash suffix, e.g. messagesContainer_07S1Yg or host_a_iRsA. */
const HASHED_CLASS = /[A-Za-z]+_[\w-]{6}(?![\w-])/;
const withoutComments = (css: string): string => css.replace(/\/\*[\s\S]*?\*\//g, '');

suite('blocks — generic', () => {
  test('appendBlock wraps the trimmed body in markers at the end', () => {
    assert.strictEqual(
      appendBlock(CSS, M, '\n.a{top:0}\n'),
      CSS + '\n/* x-start */\n.a{top:0}\n/* x-end */'
    );
  });

  test('stripBlock restores the original exactly', () => {
    assert.strictEqual(stripBlock(appendBlock(CSS, M, '.a{}'), M), CSS);
  });

  test('stripBlock removes every copy and keeps other blocks', () => {
    const withBoth = appendBlock(appendBlock(appendBlock(CSS, M, '.a{}'), OTHER, '.b{}'), M, '.c{}');
    assert.strictEqual(stripBlock(withBoth, M), appendBlock(CSS, OTHER, '.b{}'));
  });

  test('stripBlock treats marker text literally', () => {
    const odd = { start: '/* (a+b)? [x] */', end: '/* $end^ */' };
    assert.strictEqual(stripBlock(appendBlock(CSS, odd, '.a{}'), odd), CSS);
  });

  test('stripBlock leaves CSS without the block untouched', () => {
    assert.strictEqual(stripBlock(CSS, M), CSS);
  });
});

suite('features — registry', () => {
  test('canonical order is theme, then rtl', () => {
    assert.deepStrictEqual(FEATURES.map((f) => f.id), ['theme', 'rtl']);
  });

  test('RTL keeps the markers existing installs already have', () => {
    assert.deepStrictEqual(RTL.markers, {
      start: '/* bidi-rtl-patch-start */',
      end: '/* bidi-rtl-patch-end */',
    });
  });

  test('theme assets are woff2 files prefixed bidi-theme-', () => {
    assert.ok(THEME.assets.length > 0);
    for (const asset of THEME.assets) {
      assert.match(asset.target, /^bidi-theme-[a-z-]+\.woff2$/);
    }
  });
});

suite('rtl.css', () => {
  let RTL_CSS: string;

  suiteSetup(() => {
    RTL_CSS = fs.readFileSync(path.join(ROOT, RTL.cssFile), 'utf8');
  });

  test('holds only the block body, without markers', () => {
    assert.ok(!RTL_CSS.includes('bidi-rtl-patch'));
    assert.ok(RTL_CSS.includes('[class*="messagesContainer_"]'));
  });

  test('keeps a single backslash before 2022', () => {
    assert.ok(RTL_CSS.includes('\\2022'));
    assert.ok(!RTL_CSS.includes('\\\\2022'));
  });

  test('keeps the "Thinking" label LTR but not the thinking text', () => {
    const ltrRule = RTL_CSS.split('}').find((rule) => rule.includes('[class*="toolUse_"]')) ?? '';
    assert.ok(ltrRule.includes('[class*="messagesContainer_"] [class*="thinkingSummary_"]'));
    assert.ok(ltrRule.includes('direction:ltr'));
    assert.ok(!/thinking_|thinkingContent/.test(withoutComments(RTL_CSS)));
    assert.ok(REQUIRED_CLASS_PREFIXES.includes('thinkingSummary_'));
  });

  test('uses text-align:start and matches the input by role and label', () => {
    assert.ok(RTL_CSS.includes('[role="textbox"][aria-label="Message input"]'));
    assert.ok(RTL_CSS.includes('text-align:start;'));
  });
});

suite('hash-free selectors', () => {
  test('the guard spots hashed class names and lets prefixes through', () => {
    for (const hashed of ['messagesContainer_07S1Yg', 'root_-a7MRw', 'host_a_iRsA', '.inputFooter_gGYT1w{']) {
      assert.ok(HASHED_CLASS.test(hashed), hashed);
    }
    for (const prefix of ['[class*="messagesContainer_"]', '[class*="root_"]>p', 'bidi-theme-rubik-hebrew.woff2']) {
      assert.ok(!HASHED_CLASS.test(prefix), prefix);
    }
  });

  for (const feature of [RTL, THEME]) {
    test(`${feature.cssFile} names no hashed class`, () => {
      const css = withoutComments(fs.readFileSync(path.join(ROOT, feature.cssFile), 'utf8'));
      assert.strictEqual(HASHED_CLASS.exec(css), null);
    });
  }
});
