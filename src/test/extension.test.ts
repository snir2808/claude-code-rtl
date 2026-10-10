import * as assert from 'assert';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import type * as vscode from 'vscode';
import { UsageSource, activate } from '../extension';
import { FeatureId, RTL, THEME } from '../features';
import { REQUIRED_CLASS_PREFIXES, REQUIRED_JS_HOOKS } from '../health';
import { appendBlock } from '../blocks';
import { CredentialReadError, Usage } from '../usage';
import { FakeClock, flush } from './fake-clock';
import { FakeMessage, FakeStatusBarItem, commands, fake } from './fake-vscode';

// activate() runs against the fake vscode module (see setup.ts), a fake
// clock, a temp folder standing in for Claude Code, and a fake UsageSource:
// no Keychain, credentials file or network is touched.

const ROOT = path.join(__dirname, '..', '..');
const HEALTHY_CSS =
  'html{--app-primary-background:#000}' +
  REQUIRED_CLASS_PREFIXES.map((p) => `.${p}abc123{color:red}`).join('');
const HEALTHY_JS = REQUIRED_JS_HOOKS.map((h) => `x("${h}")`).join(';');
const USAGE_FLAG = 'bidiUsage.enabled';
const MINUTE = 60_000;
/** Where the fake clock starts; RESET is the session reset the fake usage reports. */
const START = new Date(2026, 9, 10, 9, 0).getTime();
const RESET = new Date(2026, 9, 10, 11, 0);

class Memento {
  readonly values: Map<string, unknown>;

  constructor(entries: Record<string, unknown> = {}) {
    this.values = new Map(Object.entries(entries));
  }

  get<T>(key: string, defaultValue?: T): T | undefined {
    return this.values.has(key) ? (this.values.get(key) as T) : defaultValue;
  }

  async update(key: string, value: unknown): Promise<void> {
    if (value === undefined) {
      this.values.delete(key);
    } else {
      this.values.set(key, value);
    }
  }

  keys(): readonly string[] {
    return [...this.values.keys()];
  }

  setKeysForSync(): void {}
}

class FakeUsage implements UsageSource {
  reads = 0;
  fetches = 0;
  read: () => Promise<string | null> = async () => 'tok-test';
  fetch: () => Promise<Usage> = async () => ({ session: { utilization: 42, resetsAt: RESET }, weekly: null });

  readAccessToken = (): Promise<string | null> => {
    this.reads++;
    return this.read();
  };

  fetchUsage = (): Promise<Usage> => {
    this.fetches++;
    return this.fetch();
  };
}

interface Deferred<T> {
  promise: Promise<T>;
  resolve(value: T): void;
}

function deferred<T>(): Deferred<T> {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}

interface Context {
  subscriptions: { dispose(): unknown }[];
  extensionPath: string;
  globalState: Memento;
}

suite('extension — activate()', () => {
  let tmp: string;
  let clock: FakeClock;
  let usage: FakeUsage;
  let themeBody: string;
  let rtlBody: string;
  let contexts: Context[];

  /** Activates the extension the way VS Code would, with fakes for the clock's data. */
  async function start(globalState = new Memento()): Promise<Context> {
    const context: Context = { subscriptions: [], extensionPath: ROOT, globalState };
    contexts.push(context);
    await activate(context as unknown as vscode.ExtensionContext, usage);
    await flush();
    return context;
  }

  /** Disposes what the activation registered, as VS Code does on deactivation. */
  function stop(context: Context): void {
    for (const subscription of context.subscriptions.splice(0)) {
      subscription.dispose();
    }
  }

  async function installClaudeCode(version: string, css = HEALTHY_CSS, js: string | null = HEALTHY_JS): Promise<string> {
    const dir = path.join(tmp, `anthropic.claude-code-${version}`);
    await fs.promises.mkdir(path.join(dir, 'webview'), { recursive: true });
    await fs.promises.writeFile(path.join(dir, 'webview', 'index.css'), css);
    if (js !== null) {
      await fs.promises.writeFile(path.join(dir, 'webview', 'index.js'), js);
    }
    fake.setClaudeCode({ extensionPath: dir, packageJSON: { version } });
    return dir;
  }

  const cssOf = (dir: string): string => fs.readFileSync(path.join(dir, 'webview', 'index.css'), 'utf8');

  /** The CSS a sync of HEALTHY_CSS writes with these modules on. */
  function synced(ids: FeatureId[]): string {
    let css = HEALTHY_CSS;
    if (ids.includes('theme')) {
      css = appendBlock(css, THEME.markers, themeBody);
    }
    if (ids.includes('rtl')) {
      css = appendBlock(css, RTL.markers, rtlBody);
    }
    return css;
  }

  const fontsIn = (dir: string): string[] =>
    THEME.assets.map((a) => a.target).filter((target) => fs.existsSync(path.join(dir, 'webview', target)));

  function item(command: string): FakeStatusBarItem {
    const found = fake.items.find((i) => i.command === command);
    assert.ok(found, `no status item runs ${command}`);
    return found;
  }

  const clockItem = (): FakeStatusBarItem => item('bidi-usage.refresh');
  const texts = (kind: 'info' | 'warning' | 'error'): string[] =>
    fake.messages.filter((m) => m.kind === kind).map((m) => m.text);

  suiteSetup(() => {
    themeBody = fs.readFileSync(path.join(ROOT, THEME.cssFile), 'utf8');
    rtlBody = fs.readFileSync(path.join(ROOT, RTL.cssFile), 'utf8');
  });

  setup(async () => {
    tmp = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'bidi-activate-'));
    fake.reset();
    clock = new FakeClock(START);
    clock.install();
    usage = new FakeUsage();
    contexts = [];
  });

  teardown(async () => {
    for (const context of contexts) {
      stop(context);
    }
    clock.uninstall();
    fake.reset();
    await fs.promises.rm(tmp, { recursive: true, force: true });
  });

  suite('modules', () => {
    test('upgrading from 0.0.3 migrates the RTL block and adds the theme block and fonts, both on', async () => {
      const legacy = `${HEALTHY_CSS}\n${RTL.markers.start}\n[class*="messagesContainer_"]{direction:rtl}\n${RTL.markers.end}`;
      const dir = await installClaudeCode('2.1.287', legacy);
      await start();
      assert.strictEqual(cssOf(dir), synced(['theme', 'rtl']));
      for (const asset of THEME.assets) {
        const copied = fs.readFileSync(path.join(dir, 'webview', asset.target));
        assert.ok(copied.equals(fs.readFileSync(path.join(ROOT, asset.source))), asset.target);
      }
      assert.strictEqual(item('bidi-theme.toggle').text, '$(check) Theme');
      assert.strictEqual(item('bidi-rtl.toggle').text, '$(check) RTL');
      assert.ok(texts('info').includes('BiDi RTL & Theme: Claude Code CSS updated. Reload window to apply.'));
      assert.deepStrictEqual(texts('warning'), []);
    });

    test('turning the theme off and on removes and restores its block and fonts', async () => {
      const dir = await installClaudeCode('2.1.287');
      const context = await start();

      await commands.executeCommand('bidi-theme.toggle');
      assert.strictEqual(cssOf(dir), synced(['rtl']));
      assert.deepStrictEqual(fontsIn(dir), []);
      assert.strictEqual(context.globalState.get(THEME.flagKey), false);
      assert.strictEqual(item('bidi-theme.toggle').text, '$(circle-slash) Theme');
      assert.ok(texts('info').includes('BiDi Theme: turned off. Reload window to apply.'));

      await commands.executeCommand('bidi-theme.toggle');
      assert.strictEqual(cssOf(dir), synced(['theme', 'rtl']));
      assert.strictEqual(fontsIn(dir).length, THEME.assets.length);
      assert.strictEqual(item('bidi-theme.toggle').text, '$(check) Theme');
      assert.ok(texts('info').includes('BiDi Theme: turned on. Reload window to apply.'));
    });

    test('the health warning shows once per Claude Code version, and only while the theme is on', async () => {
      const brokenJs = HEALTHY_JS.replace('assistant-message', 'assistant-msg');
      await installClaudeCode('2.1.300', HEALTHY_CSS, brokenJs);
      const context = await start();
      assert.strictEqual(texts('warning').length, 1);
      assert.ok(texts('warning')[0].includes('2.1.300'), texts('warning')[0]);

      await fake.extensionsChanged(); // another sync of the same version
      assert.strictEqual(texts('warning').length, 1);

      await commands.executeCommand('bidi-theme.toggle'); // theme off
      await installClaudeCode('2.1.301', HEALTHY_CSS, brokenJs);
      await fake.extensionsChanged();
      assert.strictEqual(texts('warning').length, 1);

      await commands.executeCommand('bidi-theme.toggle'); // theme on
      assert.strictEqual(texts('warning').length, 2);
      assert.ok(texts('warning')[1].includes('2.1.301'), texts('warning')[1]);

      stop(context); // the next activation remembers the warned version
      await start(context.globalState);
      assert.strictEqual(texts('warning').length, 2);
    });

    test('an unreadable index.js gets the once-per-version warning', async () => {
      await installClaudeCode('2.1.302', HEALTHY_CSS, null);
      await start();
      assert.strictEqual(texts('warning').length, 1);
      assert.ok(texts('warning')[0].includes('webview/index.js'), texts('warning')[0]);
    });

    test('a healthy verdict lasts the activation, so later syncs do not read index.js again', async () => {
      const dir = await installClaudeCode('2.1.287');
      const context = await start();
      await fs.promises.writeFile(path.join(dir, 'webview', 'index.js'), 'nothing the theme needs');
      await fake.extensionsChanged();
      assert.deepStrictEqual(texts('warning'), []);

      stop(context); // a new activation checks again
      await start(context.globalState);
      assert.strictEqual(texts('warning').length, 1);
    });

    test('two quick theme toggles apply in order, and each prompt matches the CSS it reports', async () => {
      const dir = await installClaudeCode('2.1.287');
      await start();
      const prompts: string[] = [];
      fake.answer((message) => {
        if (message.text.startsWith('BiDi Theme: turned')) {
          prompts.push(`${message.text} Theme block: ${cssOf(dir).includes(THEME.markers.start)}`);
        }
        return undefined;
      });
      await Promise.all([commands.executeCommand('bidi-theme.toggle'), commands.executeCommand('bidi-theme.toggle')]);
      assert.deepStrictEqual(prompts, [
        'BiDi Theme: turned off. Reload window to apply. Theme block: false',
        'BiDi Theme: turned on. Reload window to apply. Theme block: true',
      ]);
      assert.strictEqual(cssOf(dir), synced(['theme', 'rtl']));
    });

    test('a font that cannot be removed is logged as a font sync failure', async () => {
      const dir = await installClaudeCode('2.1.287');
      await fs.promises.mkdir(path.join(dir, 'webview', THEME.assets[0].target)); // a folder where a font goes
      const logged: string[] = [];
      const consoleError = console.error;
      console.error = (...args: unknown[]) => void logged.push(args.join(' '));
      try {
        await start(new Memento({ [THEME.flagKey]: false }));
      } finally {
        console.error = consoleError;
      }
      assert.strictEqual(logged.length, 1, logged.join('\n'));
      assert.ok(logged[0].startsWith(`BiDi Theme: font sync failed — ${THEME.assets[0].target}`), logged[0]);
    });

    test('each status item has its own id and name', async () => {
      await installClaudeCode('2.1.287');
      await start();
      assert.deepStrictEqual(
        fake.items.map((i) => [i.id, i.name]),
        [
          ['bidi.theme', 'BiDi Theme'],
          ['bidi.rtl', 'BiDi RTL'],
          ['bidi.sessionClock', 'Claude Session Clock'],
        ]
      );
    });

    test('a failed activation still hands over everything it created', async () => {
      await installClaudeCode('2.1.287');
      commands.registerCommand('bidi-usage.toggle', () => undefined); // taken: registering it again throws
      const context: Context = { subscriptions: [], extensionPath: ROOT, globalState: new Memento() };
      await assert.rejects(activate(context as unknown as vscode.ExtensionContext, usage), /already exists/);
      stop(context);
      assert.strictEqual(fake.listenerCount, 0);
      assert.deepStrictEqual(fake.commandIds, ['bidi-usage.toggle']);
      assert.ok(fake.items.length > 0 && fake.items.every((i) => i.disposed));
      assert.strictEqual(clock.pending, 0);
    });

  });

  suite('session clock', () => {
    const PROMPT =
      "BiDi: Show when your Claude 5-hour session resets in the status bar? It reads Claude Code's sign-in " +
      'from the macOS Keychain and asks Anthropic for your usage.';
    const prompts = (): FakeMessage[] => fake.messages.filter((m) => m.text.startsWith('BiDi: Show when'));

    test('it is off until the user opts in, and it asks only once', async () => {
      await installClaudeCode('2.1.287');
      fake.answer((message) => (message.items.includes('Not now') ? 'Not now' : undefined));
      const context = await start();
      assert.strictEqual(prompts().length, 1);
      assert.deepStrictEqual(prompts()[0].items, ['Enable', 'Not now']);
      if (process.platform === 'darwin') {
        assert.strictEqual(prompts()[0].text, PROMPT);
      }
      assert.strictEqual(context.globalState.get(USAGE_FLAG), undefined);
      assert.strictEqual(clockItem().visible, false);

      await clock.tick(5 * MINUTE);
      await fake.focus(false);
      await fake.focus(true);
      await flush();
      assert.strictEqual(usage.reads, 0, 'no Keychain read while the clock is off');
      assert.strictEqual(usage.fetches, 0, 'no request while the clock is off');

      stop(context);
      await start(context.globalState); // another window, or the next session
      assert.strictEqual(prompts().length, 1);
      assert.strictEqual(usage.reads, 0);
    });

    test('a dismissed question also leaves it off', async () => {
      await installClaudeCode('2.1.287');
      const context = await start(); // the fake dismisses every toast
      assert.strictEqual(prompts().length, 1);
      assert.strictEqual(context.globalState.get(USAGE_FLAG), undefined);
      assert.strictEqual(usage.reads, 0);
    });

    test('Enable turns it on and shows it', async () => {
      await installClaudeCode('2.1.287');
      fake.answer((message) => (message.items.includes('Enable') ? 'Enable' : undefined));
      const context = await start();
      assert.strictEqual(context.globalState.get(USAGE_FLAG), true);
      assert.strictEqual(usage.reads, 1);
      assert.ok(clockItem().visible);
      assert.strictEqual(clockItem().text, '$(watch) 11:00 · 42%');
    });

    test('activation does not wait for the answer', async () => {
      const dir = await installClaudeCode('2.1.287');
      fake.answer(() => new Promise<undefined>(() => undefined)); // never answered
      await start();
      assert.strictEqual(prompts().length, 1);
      assert.strictEqual(cssOf(dir), synced(['theme', 'rtl']));
    });

    test('an Enable that arrives after the window closed changes nothing', async () => {
      await installClaudeCode('2.1.287');
      const answer = deferred<string | undefined>();
      fake.answer((message) => (message.items.includes('Enable') ? answer.promise : undefined));
      const context = await start();
      stop(context);
      answer.resolve('Enable');
      await flush();
      assert.strictEqual(context.globalState.get(USAGE_FLAG), undefined);
      assert.strictEqual(usage.reads, 0);
    });

    test('a choice made before, on or off, is never asked about', async () => {
      await installClaudeCode('2.1.287');
      const on = await start(new Memento({ [USAGE_FLAG]: true }));
      stop(on);
      await start(new Memento({ [USAGE_FLAG]: false }));
      assert.deepStrictEqual(prompts(), []);
      assert.strictEqual(usage.reads, 1);
    });

    test('the 5-minute refresh runs only in the focused window', async () => {
      await installClaudeCode('2.1.287');
      await start(new Memento({ [USAGE_FLAG]: true }));
      assert.strictEqual(usage.reads, 1);
      await fake.focus(false);
      await clock.tick(5 * MINUTE);
      assert.strictEqual(usage.reads, 1, 'no refresh in a window without focus');
      await fake.focus(true); // focus refreshes: the last fetch is over a minute old
      await flush();
      assert.strictEqual(usage.reads, 2);
      await clock.tick(5 * MINUTE);
      assert.strictEqual(usage.reads, 3);
    });

    test('focus shows the last result as of now, even when it is too soon to fetch again', async () => {
      await installClaudeCode('2.1.287');
      usage.fetch = async () => ({ session: { utilization: 97, resetsAt: new Date(START + 20_000) }, weekly: null });
      await start(new Memento({ [USAGE_FLAG]: true }));
      assert.strictEqual(clockItem().text, '$(watch) 09:00 · 97%');

      clock.jump(40_000); // the machine sleeps through the reset
      await fake.focus(true);
      await flush();
      assert.strictEqual(usage.fetches, 1, 'the last fetch is under a minute old');
      assert.strictEqual(clockItem().text, '$(watch) —');
      assert.ok(clockItem().tooltip?.startsWith('Claude session (5h): no active window'), clockItem().tooltip);
    });

    test('a toggle-off made in another window applies as soon as this one has focus', async () => {
      await installClaudeCode('2.1.287');
      const context = await start(new Memento({ [USAGE_FLAG]: true }));
      assert.ok(clockItem().visible);
      await context.globalState.update(USAGE_FLAG, false); // the other window
      await fake.focus(true);
      await flush();
      assert.strictEqual(clockItem().visible, false);
      assert.strictEqual(usage.reads, 1);
    });

    test('a toggle-off made in another window applies here even while paused', async () => {
      await installClaudeCode('2.1.287');
      usage.read = async () => {
        throw new CredentialReadError('Keychain access was denied', true);
      };
      const context = await start(new Memento({ [USAGE_FLAG]: true }));
      assert.ok(clockItem().visible);

      await context.globalState.update(USAGE_FLAG, false); // the other window
      await clock.tick(5 * MINUTE);
      assert.strictEqual(clockItem().visible, false);

      usage.read = async () => 'tok-test';
      await context.globalState.update(USAGE_FLAG, true); // turned on again over there
      await clock.tick(5 * MINUTE);
      assert.strictEqual(usage.reads, 2, 'turning it off ended the pause');
      assert.strictEqual(clockItem().text, '$(watch) 11:00 · 42%');
    });

    test('a Keychain denial pauses automatic refreshes until the clock is clicked or toggled', async () => {
      await installClaudeCode('2.1.287');
      usage.read = async () => {
        throw new CredentialReadError('Keychain access was denied', true);
      };
      await start(new Memento({ [USAGE_FLAG]: true }));
      assert.strictEqual(usage.reads, 1);
      assert.ok(clockItem().visible);
      assert.ok(clockItem().tooltip?.includes('Keychain access was denied'), clockItem().tooltip);

      await clock.tick(5 * MINUTE);
      await fake.focus(false);
      await fake.focus(true);
      await flush();
      assert.strictEqual(usage.reads, 1, 'automatic refreshes stay paused');

      await commands.executeCommand('bidi-usage.refresh'); // a click retries, and is denied again
      assert.strictEqual(usage.reads, 2);
      usage.read = async () => 'tok-test';
      await clock.tick(5 * MINUTE);
      assert.strictEqual(usage.reads, 2, 'paused again after the second denial');

      await commands.executeCommand('bidi-usage.toggle'); // off
      await commands.executeCommand('bidi-usage.toggle'); // on: refreshes and resumes
      assert.strictEqual(usage.reads, 3);
      assert.strictEqual(clockItem().text, '$(watch) 11:00 · 42%');
      await clock.tick(5 * MINUTE);
      assert.strictEqual(usage.reads, 4, 'the 5-minute refresh runs again');
    });

    test('turning the clock off while a refresh is in flight leaves it hidden', async () => {
      await installClaudeCode('2.1.287');
      const pending = deferred<Usage>();
      usage.fetch = () => pending.promise;
      await start(new Memento({ [USAGE_FLAG]: true }));
      assert.strictEqual(usage.fetches, 1);

      await commands.executeCommand('bidi-usage.toggle');
      assert.strictEqual(clockItem().visible, false);
      pending.resolve({ session: { utilization: 42, resetsAt: new Date(START + 2 * MINUTE) }, weekly: null });
      await flush();
      assert.strictEqual(clockItem().visible, false);
      assert.strictEqual(clockItem().text, '');
      assert.strictEqual(clock.pending, 1, 'only the 5-minute interval; no reset timer');
    });

    test('disposal clears the timers, listeners and commands', async () => {
      await installClaudeCode('2.1.287');
      usage.fetch = async () => ({ session: { utilization: 42, resetsAt: new Date(START + 2 * MINUTE) }, weekly: null });
      const context = await start(new Memento({ [USAGE_FLAG]: true }));
      assert.strictEqual(clock.pending, 2, 'the 5-minute interval and the reset timer');

      stop(context);
      assert.strictEqual(clock.pending, 0);
      assert.strictEqual(fake.listenerCount, 0);
      assert.deepStrictEqual(fake.commandIds, []);
      assert.ok(fake.items.every((i) => i.disposed));
    });
  });
});
