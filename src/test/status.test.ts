import * as assert from 'assert';
import { getStatusBarState } from '../status';

suite('status bar state', () => {
  test('on', () => {
    const s = getStatusBarState(true);
    assert.strictEqual(s.text, '$(check) RTL');
    assert.strictEqual(s.tooltip, 'BiDi RTL for Claude Code is on — click to turn off');
  });

  test('off', () => {
    const s = getStatusBarState(false);
    assert.strictEqual(s.text, '$(circle-slash) RTL');
    assert.strictEqual(s.tooltip, 'BiDi RTL for Claude Code is off — click to turn on');
  });
});
