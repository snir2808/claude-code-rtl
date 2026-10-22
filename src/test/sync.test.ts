import * as assert from 'assert';
import { FeatureId, RTL, THEME } from '../features';
import { appendBlock } from '../blocks';
import { BlockBodies, computeSyncedCss } from '../sync';

const CSS = '.foo{color:red}\n/* ✳ unicode stays */\n.bar{display:flex}\n';
const BODIES: BlockBodies = { theme: '.t{color:#1b1a18}', rtl: '.r{direction:rtl}' };
const STATES: FeatureId[][] = [[], ['theme'], ['rtl'], ['theme', 'rtl']];
const on = (ids: FeatureId[]): Set<FeatureId> => new Set(ids);

suite('sync — computeSyncedCss', () => {
  test('nothing enabled returns clean CSS unchanged', () => {
    assert.strictEqual(computeSyncedCss(CSS, on([]), BODIES, 'claude'), CSS);
  });

  test('theme only', () => {
    assert.strictEqual(
      computeSyncedCss(CSS, on(['theme']), BODIES, 'claude'),
      appendBlock(CSS, THEME.blocks.claude.markers, BODIES.theme)
    );
  });

  test('rtl only', () => {
    assert.strictEqual(
      computeSyncedCss(CSS, on(['rtl']), BODIES, 'claude'),
      appendBlock(CSS, RTL.blocks.claude.markers, BODIES.rtl)
    );
  });

  test('both: the theme block comes before the rtl block', () => {
    assert.strictEqual(
      computeSyncedCss(CSS, on(['rtl', 'theme']), BODIES, 'claude'),
      appendBlock(appendBlock(CSS, THEME.blocks.claude.markers, BODIES.theme), RTL.blocks.claude.markers, BODIES.rtl)
    );
  });

  test('idempotent, and every state reaches every other state', () => {
    for (const from of STATES) {
      for (const to of STATES) {
        const start = computeSyncedCss(CSS, on(from), BODIES, 'claude');
        const next = computeSyncedCss(start, on(to), BODIES, 'claude');
        assert.strictEqual(next, computeSyncedCss(CSS, on(to), BODIES, 'claude'), `${from} -> ${to}`);
        assert.strictEqual(computeSyncedCss(next, on(to), BODIES, 'claude'), next, `${to} twice`);
      }
    }
  });

  test('toggling the theme leaves the rtl block byte-identical', () => {
    const rtlBlock = appendBlock('', RTL.blocks.claude.markers, BODIES.rtl);
    for (const ids of [['rtl'], ['theme', 'rtl']] as FeatureId[][]) {
      assert.ok(computeSyncedCss(CSS, on(ids), BODIES, 'claude').endsWith(rtlBlock), String(ids));
    }
  });

  test('an old RTL body is replaced with the current one', () => {
    const legacy = CSS + '\n/* bidi-rtl-patch-start */\n.old{direction:rtl}\n/* bidi-rtl-patch-end */';
    assert.strictEqual(
      computeSyncedCss(legacy, on(['rtl']), BODIES, 'claude'),
      appendBlock(CSS, RTL.blocks.claude.markers, BODIES.rtl)
    );
  });

  test('the workbench target uses its own markers and leaves Claude Code blocks alone', () => {
    const withClaude = appendBlock(CSS, THEME.blocks.claude.markers, '.c{}');
    const both = computeSyncedCss(withClaude, on(['rtl', 'theme']), BODIES, 'workbench');
    assert.strictEqual(
      both,
      appendBlock(
        appendBlock(withClaude, THEME.blocks.workbench.markers, BODIES.theme),
        RTL.blocks.workbench.markers,
        BODIES.rtl
      )
    );
    assert.strictEqual(computeSyncedCss(both, on([]), BODIES, 'workbench'), withClaude);
  });
});
