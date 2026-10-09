import * as assert from 'assert';
import {
  FetchLike,
  USAGE_URL,
  fetchUsage,
  formatClock,
  formatUsageError,
  formatUsageStatus,
  parseAccessToken,
  parseUsage,
} from '../usage';

const BODY = {
  five_hour: { utilization: 42.4, resets_at: '2026-10-09T14:42:00.000Z' },
  seven_day: { utilization: 31, resets_at: '2026-10-15T06:00:00.000Z' },
  seven_day_opus: null,
};

suite('usage — parse', () => {
  test('reads the session and weekly windows', () => {
    const usage = parseUsage(BODY);
    assert.ok(usage && usage.session && usage.weekly);
    assert.strictEqual(usage.session.utilization, 42.4);
    assert.strictEqual(usage.session.resetsAt?.toISOString(), '2026-10-09T14:42:00.000Z');
    assert.strictEqual(usage.weekly.utilization, 31);
  });

  test('accepts windows nested under rate_limits', () => {
    assert.deepStrictEqual(parseUsage({ rate_limits: BODY }), parseUsage(BODY));
  });

  test('a null reset time means no active window; malformed windows are dropped', () => {
    const usage = parseUsage({ five_hour: { utilization: 0, resets_at: null }, seven_day: { utilization: 'x' } });
    assert.deepStrictEqual(usage, { session: { utilization: 0, resetsAt: null }, weekly: null });
  });

  test('unrelated bodies are rejected', () => {
    assert.strictEqual(parseUsage({ error: 'nope' }), null);
    assert.strictEqual(parseUsage('five_hour'), null);
    assert.strictEqual(parseUsage(null), null);
  });
});

suite('usage — format', () => {
  const at = (h: number, m: number, day = 9): Date => new Date(2026, 9, day, h, m);

  test('formatClock is a zero-padded 24-hour clock', () => {
    assert.strictEqual(formatClock(at(7, 5)), '07:05');
    assert.strictEqual(formatClock(at(17, 42)), '17:42');
  });

  test('an active window shows its reset time and usage', () => {
    const status = formatUsageStatus(
      { session: { utilization: 42.4, resetsAt: at(17, 42) }, weekly: { utilization: 31, resetsAt: at(9, 0, 15) } },
      at(15, 0)
    );
    assert.strictEqual(status.text, '$(watch) 17:42 · 42%');
    assert.ok(status.tooltip.includes('Claude session (5h): 42% used, resets at 17:42.'), status.tooltip);
    assert.ok(status.tooltip.includes('Weekly (7 days): 31% used, resets Thu 09:00.'), status.tooltip);
    assert.ok(status.tooltip.endsWith('Click to refresh.'), status.tooltip);
  });

  test('no active window shows a dash', () => {
    const status = formatUsageStatus({ session: { utilization: 0, resetsAt: null }, weekly: null }, at(15, 0));
    assert.strictEqual(status.text, '$(watch) —');
    assert.ok(
      status.tooltip.startsWith('Claude session (5h): no active window — it starts with your next message.'),
      status.tooltip
    );
  });

  test('a reset time in the past counts as no active window', () => {
    const status = formatUsageStatus({ session: { utilization: 97, resetsAt: at(14, 0) }, weekly: null }, at(15, 0));
    assert.strictEqual(status.text, '$(watch) —');
  });

  test('errors show a dash and the reason', () => {
    const status = formatUsageError('not signed in to Claude Code');
    assert.strictEqual(status.text, '$(watch) —');
    assert.strictEqual(
      status.tooltip,
      'Claude session (5h): unavailable — not signed in to Claude Code. Click to retry.'
    );
  });
});

suite('usage — credentials and request', () => {
  test('parseAccessToken reads claudeAiOauth.accessToken', () => {
    assert.strictEqual(parseAccessToken('{"claudeAiOauth":{"accessToken":"tok-123","refreshToken":"r"}}'), 'tok-123');
    assert.strictEqual(parseAccessToken('{"claudeAiOauth":{}}'), null);
    assert.strictEqual(parseAccessToken('not json'), null);
  });

  test('fetchUsage sends the bearer token and the OAuth beta header', async () => {
    let seen: { url: string; headers: Record<string, string> } | undefined;
    const fake: FetchLike = async (url, init) => {
      seen = { url, headers: init.headers };
      return { ok: true, status: 200, json: async () => BODY };
    };
    const usage = await fetchUsage('tok-123', fake);
    assert.strictEqual(seen?.url, USAGE_URL);
    assert.strictEqual(seen?.headers.Authorization, 'Bearer tok-123');
    assert.strictEqual(seen?.headers['anthropic-beta'], 'oauth-2025-04-20');
    assert.strictEqual(usage.session?.utilization, 42.4);
  });

  test('fetchUsage rejects HTTP errors and unexpected bodies', async () => {
    const reply = (code: number, body: unknown): FetchLike => async () => ({
      ok: code < 400,
      status: code,
      json: async () => body,
    });
    await assert.rejects(fetchUsage('t', reply(401, {})), /HTTP 401/);
    await assert.rejects(fetchUsage('t', reply(200, { hello: 1 })), /unexpected usage response/);
  });
});
