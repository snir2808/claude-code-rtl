import * as assert from 'assert';
import * as fs from 'fs';
import * as path from 'path';
import { FEATURES, RTL, THEME } from '../features';
import { appendBlock, stripBlock } from '../patcher';

const CSS = '.foo{color:red}\n.bar{display:flex}';
const M = { start: '/* x-start */', end: '/* x-end */' };
const OTHER = { start: '/* y-start */', end: '/* y-end */' };
const RTL_CSS = fs.readFileSync(path.join(__dirname, '..', '..', 'css', 'rtl.css'), 'utf8');

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
  test('holds only the block body, without markers', () => {
    assert.ok(!RTL_CSS.includes('bidi-rtl-patch'));
    assert.ok(RTL_CSS.includes('[class*="messagesContainer_"]'));
  });

  test('keeps a single backslash before 2022', () => {
    assert.ok(RTL_CSS.includes('\\2022'));
    assert.ok(!RTL_CSS.includes('\\\\2022'));
  });

  test('uses text-align:start and hash-free selectors', () => {
    assert.ok(RTL_CSS.includes('[role="textbox"][aria-label="Message input"]'));
    assert.ok(RTL_CSS.includes('text-align:start;'));
    assert.ok(!/(messageInput|messagesContainer|userMessage)_[A-Za-z0-9-]{6}/.test(RTL_CSS));
  });
});
