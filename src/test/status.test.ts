import * as assert from 'assert';
import { getStatusBarState } from '../status';

suite('status bar state', () => {
  test('on', () => {
    const s = getStatusBarState('RTL', true);
    assert.strictEqual(s.text, '$(check) RTL');
    assert.strictEqual(s.tooltip, 'BiDi RTL for Claude Code is on — click to turn off');
  });

  test('off', () => {
    const s = getStatusBarState('Theme', false);
    assert.strictEqual(s.text, '$(circle-slash) Theme');
    assert.strictEqual(s.tooltip, 'BiDi Theme for Claude Code is off — click to turn on');
  });
});
