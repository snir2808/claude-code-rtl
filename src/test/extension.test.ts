import * as assert from 'assert';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import type * as vscode from 'vscode';
import { UsageSource, activate } from '../extension';
import { FeatureId, RTL, THEME } from '../features';
import { REQUIRED_CLASS_PREFIXES, REQUIRED_JS_HOOKS } from '../health';
import { appendBlock } from '../patcher';
import { CredentialReadError, Usage } from '../usage';
import { FakeClock, flush } from './fake-clock';
import { FakeStatusBarItem, commands, fake } from './fake-vscode';

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
  });

  suite('session clock', () => {
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
