import * as assert from 'assert';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import {
  CredentialReadError,
  FetchLike,
  USAGE_URL,
  classifyKeychainError,
  fetchUsage,
  formatClock,
  formatUsageError,
  formatUsageStatus,
  parseAccessToken,
  parseUsage,
  readCredentialsFile,
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
  const stored = (token: string): string => JSON.stringify({ claudeAiOauth: { accessToken: token } });

  test('parseAccessToken reads claudeAiOauth.accessToken', () => {
    assert.strictEqual(parseAccessToken('{"claudeAiOauth":{"accessToken":"tok-123","refreshToken":"r"}}'), 'tok-123');
    assert.strictEqual(parseAccessToken('{"claudeAiOauth":{}}'), null);
    assert.strictEqual(parseAccessToken('not json'), null);
  });

  test('parseAccessToken takes printable ASCII only: no spaces, control or non-ASCII characters', () => {
    assert.strictEqual(parseAccessToken(stored('a.b-c_d~e+f/g==')), 'a.b-c_d~e+f/g==');
    const bad = ['tok\n123', 'tok-123\n', 'tok\r\n-123', 'tok 123', ' tok-123', 'tok\u0007-123', 'tok\u007f123', 'tök-123', ''];
    for (const token of bad) {
      assert.strictEqual(parseAccessToken(stored(token)), null, JSON.stringify(token));
    }
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

  test('fetchUsage refuses redirects and carries a timeout signal', async () => {
    let seen: Parameters<FetchLike>[1] | undefined;
    const fake: FetchLike = async (_url, init) => {
      seen = init;
      return { ok: true, status: 200, json: async () => BODY };
    };
    await fetchUsage('tok-123', fake);
    assert.strictEqual(seen?.redirect, 'error');
    assert.ok(seen?.signal, 'the request has no timeout signal');
  });
});

suite('usage — errors never carry the token or the response', () => {
  const SECRET = 'tok-SECRET';

  /** The rejection must be exactly this fixed message, with nothing of the original chained on. */
  const rejectsOnly = (promise: Promise<unknown>, message: string): Promise<void> =>
    assert.rejects(promise, (err: unknown) => {
      assert.ok(err instanceof Error);
      assert.strictEqual(err.message, message);
      assert.ok(!err.message.includes('SECRET'), err.message);
      assert.strictEqual((err as { cause?: unknown }).cause, undefined);
      return true;
    });

  const failing = (err: Error): FetchLike => async () => {
    throw err;
  };

  test('a request failure is just "network error"', async () => {
    const leaky = new Error(`Headers.append: "Bearer ${SECRET}" is invalid`);
    await rejectsOnly(fetchUsage(SECRET, failing(leaky)), 'network error');
  });

  test('a body that does not parse is just "unexpected usage response"', async () => {
    const fake: FetchLike = async () => ({
      ok: true,
      status: 200,
      json: async () => {
        throw new SyntaxError('Unexpected token < in JSON at "<html>secret"');
      },
    });
    await rejectsOnly(fetchUsage(SECRET, fake), 'unexpected usage response');
  });

  test('a timeout or abort is "the usage request timed out", in the request and in the body', async () => {
    for (const name of ['TimeoutError', 'AbortError']) {
      const err = new Error(`The operation timed out for ${SECRET}`);
      err.name = name;
      await rejectsOnly(fetchUsage(SECRET, failing(err)), 'the usage request timed out');
      const slowBody: FetchLike = async () => ({
        ok: true,
        status: 200,
        json: async () => {
          throw err;
        },
      });
      await rejectsOnly(fetchUsage(SECRET, slowBody), 'the usage request timed out');
    }
  });

  test('an HTTP error shows the status and nothing of the body', async () => {
    const fake: FetchLike = async () => ({
      ok: false,
      status: 403,
      json: async () => {
        throw new Error(`forbidden for ${SECRET}`);
      },
    });
    await rejectsOnly(fetchUsage(SECRET, fake), 'usage request failed (HTTP 403)');
  });
});

suite('usage — credential read errors', () => {
  const failure = (err: Parameters<typeof classifyKeychainError>[0]): CredentialReadError => {
    const result = classifyKeychainError(err);
    assert.ok(result instanceof CredentialReadError, String(result));
    return result;
  };

  test('exit 44 means the Keychain has no such item', () => {
    assert.strictEqual(classifyKeychainError({ code: 44 }), 'missing');
  });

  test('a killed run means the Keychain did not answer', () => {
    const timedOut = [{ code: null, killed: true, signal: 'SIGTERM' }, { killed: true }, { signal: 'SIGTERM' }];
    for (const err of timedOut) {
      const result = failure(err);
      assert.strictEqual(result.message, 'the Keychain did not answer');
      assert.strictEqual(result.denied, true);
    }
  });

  test('any other exit code means access was denied', () => {
    for (const code of [51, 1, 36]) {
      const result = failure({ code, killed: false, signal: null });
      assert.strictEqual(result.message, 'Keychain access was denied');
      assert.strictEqual(result.denied, true);
    }
  });

  test('a tool that did not run is a plain read failure, and free-form codes are not echoed', () => {
    const noTool = failure({ code: 'ENOENT' });
    assert.strictEqual(noTool.message, 'could not read Claude Code credentials (ENOENT)');
    assert.strictEqual(noTool.denied, false);
    assert.strictEqual(failure({}).message, 'could not read Claude Code credentials (unknown)');
    assert.strictEqual(
      failure({ code: 'Bearer tok-SECRET' }).message,
      'could not read Claude Code credentials (unknown)'
    );
  });

  test('CredentialReadError is a named Error carrying the denied flag', () => {
    const err = new CredentialReadError('x', true);
    assert.ok(err instanceof Error);
    assert.strictEqual(err.name, 'CredentialReadError');
    assert.strictEqual(err.denied, true);
  });
});

// Temp paths only: nothing here reads a real credentials file.
suite('usage — credentials file', () => {
  let dir: string;

  setup(async () => {
    dir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'bidi-usage-'));
  });

  teardown(async () => {
    await fs.promises.rm(dir, { recursive: true, force: true });
  });

  test('a file that does not exist means no credentials', async () => {
    assert.strictEqual(await readCredentialsFile(path.join(dir, 'missing.json')), null);
  });

  test('a file that exists is returned as text', async () => {
    const file = path.join(dir, 'credentials.json');
    await fs.promises.writeFile(file, '{"fake":true}');
    assert.strictEqual(await readCredentialsFile(file), '{"fake":true}');
  });

  test('any other read failure is an error that names only the errno', async () => {
    // A directory in place of the file: reading it fails with EISDIR, not ENOENT.
    await assert.rejects(readCredentialsFile(dir), (err: unknown) => {
      assert.ok(err instanceof CredentialReadError);
      assert.strictEqual(err.message, 'could not read Claude Code credentials (EISDIR)');
      assert.strictEqual(err.denied, false);
      return true;
    });
  });
});
