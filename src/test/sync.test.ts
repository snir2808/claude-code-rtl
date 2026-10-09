import * as assert from 'assert';
import { FeatureId, RTL, THEME } from '../features';
import { appendBlock } from '../patcher';
import { BlockBodies, computeSyncedCss } from '../sync';

const CSS = '.foo{color:red}\n/* ✳ unicode stays */\n.bar{display:flex}\n';
const BODIES: BlockBodies = { theme: '.t{color:#1b1a18}', rtl: '.r{direction:rtl}' };
const STATES: FeatureId[][] = [[], ['theme'], ['rtl'], ['theme', 'rtl']];
const on = (ids: FeatureId[]): Set<FeatureId> => new Set(ids);

suite('sync — computeSyncedCss', () => {
  test('nothing enabled returns clean CSS unchanged', () => {
    assert.strictEqual(computeSyncedCss(CSS, on([]), BODIES), CSS);
  });

  test('theme only', () => {
    assert.strictEqual(
      computeSyncedCss(CSS, on(['theme']), BODIES),
      appendBlock(CSS, THEME.markers, BODIES.theme)
    );
  });

  test('rtl only', () => {
    assert.strictEqual(
      computeSyncedCss(CSS, on(['rtl']), BODIES),
      appendBlock(CSS, RTL.markers, BODIES.rtl)
    );
  });

  test('both: the theme block comes before the rtl block', () => {
    assert.strictEqual(
      computeSyncedCss(CSS, on(['rtl', 'theme']), BODIES),
      appendBlock(appendBlock(CSS, THEME.markers, BODIES.theme), RTL.markers, BODIES.rtl)
    );
  });

  test('idempotent, and every state reaches every other state', () => {
    for (const from of STATES) {
      for (const to of STATES) {
        const start = computeSyncedCss(CSS, on(from), BODIES);
        const next = computeSyncedCss(start, on(to), BODIES);
        assert.strictEqual(next, computeSyncedCss(CSS, on(to), BODIES), `${from} -> ${to}`);
        assert.strictEqual(computeSyncedCss(next, on(to), BODIES), next, `${to} twice`);
      }
    }
  });

  test('toggling the theme leaves the rtl block byte-identical', () => {
    const rtlBlock = appendBlock('', RTL.markers, BODIES.rtl);
    for (const ids of [['rtl'], ['theme', 'rtl']] as FeatureId[][]) {
      assert.ok(computeSyncedCss(CSS, on(ids), BODIES).endsWith(rtlBlock), String(ids));
    }
  });

  test('an old RTL body is replaced with the current one', () => {
    const legacy = CSS + '\n/* bidi-rtl-patch-start */\n.old{direction:rtl}\n/* bidi-rtl-patch-end */';
    assert.strictEqual(
      computeSyncedCss(legacy, on(['rtl']), BODIES),
      appendBlock(CSS, RTL.markers, BODIES.rtl)
    );
  });
});
