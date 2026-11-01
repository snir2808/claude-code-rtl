import * as assert from 'assert';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import type * as vscode from 'vscode';
import { UsageSource, activate } from '../extension';
import { FeatureId, RTL, THEME } from '../features';
import { REQUIRED_CHAT_CLASSES, REQUIRED_CLASS_PREFIXES, REQUIRED_CODEX_HOOKS, REQUIRED_JS_HOOKS } from '../health';
import { appendBlock } from '../blocks';
import { computeChecksum } from '../checksum';
import { WORKBENCH_CSS, workbenchCssPath } from '../workbench';
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
const HEALTHY_WORKBENCH_CSS = REQUIRED_CHAT_CLASSES.map((c) => `.${c}{color:red}`).join('\n');
const RELOAD = 'BiDi RTL & Theme: styles updated. Reload window to apply.';
const RESTART =
  'BiDi RTL & Theme: styles updated. Quit and reopen VS Code to apply. A window reload also works, ' +
  'but VS Code then warns that its installation is corrupt until it restarts (harmless).';
const MISSING = "BiDi RTL & Theme: found none of Claude Code, VS Code's chat stylesheet or Codex, so there is nothing to change.";
/** A product.json laid out like VS Code's, holding the checksum of `css`. */
const productJson = (css: string): string =>
  `{\n\t"nameShort": "Code - Insiders",\n\t"checksums": {\n\t\t"${WORKBENCH_CSS}": "${computeChecksum(css)}"\n\t}\n}\n`;
/** Codex's main stylesheet, as its webview/index.html links it. */
const CODEX_CSS = 'app-initial-0123456789ab.css';
const CODEX_INDEX_HTML = `<!doctype html><html><head><link rel="stylesheet" crossorigin href="./assets/${CODEX_CSS}"></head><body></body></html>`;
/** A Codex stylesheet that holds every hook the Codex blocks rely on, the way Codex's files spell them. */
const HEALTHY_CODEX_CSS = REQUIRED_CODEX_HOOKS.map((hook) =>
  hook.endsWith('_')
    ? `${hook}abc12_1{color:red}`
    : hook.startsWith('[')
      ? `${hook}=x]{color:red}`
      : hook.startsWith('--')
        ? `:root{${hook}:0}`
        : `${hook}{color:red}`
).join('\n');
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
  let copilotThemeBody: string;
  let copilotRtlBody: string;
  let codexThemeBody: string;
  let codexRtlBody: string;
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
      css = appendBlock(css, THEME.blocks.claude.markers, themeBody);
    }
    if (ids.includes('rtl')) {
      css = appendBlock(css, RTL.blocks.claude.markers, rtlBody);
    }
    return css;
  }

  const fontsIn = (dir: string): string[] =>
    THEME.blocks.claude.assets.map((a) => a.target).filter((target) => fs.existsSync(path.join(dir, 'webview', target)));

  /** A VS Code installation with a workbench CSS and its checksum; vscode.env.appRoot points at it. */
  async function installWorkbench(css = HEALTHY_WORKBENCH_CSS): Promise<string> {
    const appRoot = path.join(tmp, 'Code.app', 'Contents', 'Resources', 'app');
    await fs.promises.mkdir(path.dirname(workbenchCssPath(appRoot)), { recursive: true });
    await fs.promises.writeFile(workbenchCssPath(appRoot), css);
    await fs.promises.writeFile(path.join(appRoot, 'product.json'), productJson(css));
    fake.setAppRoot(appRoot);
    return appRoot;
  }

  const chatCssOf = (appRoot: string): string => fs.readFileSync(workbenchCssPath(appRoot), 'utf8');
  const productOf = (appRoot: string): string => fs.readFileSync(path.join(appRoot, 'product.json'), 'utf8');
  const chatFontsIn = (appRoot: string): string[] =>
    THEME.blocks.workbench.assets
      .map((a) => a.target)
      .filter((target) => fs.existsSync(path.join(path.dirname(workbenchCssPath(appRoot)), target)));

  /** The workbench CSS a sync of HEALTHY_WORKBENCH_CSS writes with these modules on. */
  function syncedChat(ids: FeatureId[]): string {
    let css = HEALTHY_WORKBENCH_CSS;
    if (ids.includes('theme')) {
      css = appendBlock(css, THEME.blocks.workbench.markers, copilotThemeBody);
    }
    if (ids.includes('rtl')) {
      css = appendBlock(css, RTL.blocks.workbench.markers, copilotRtlBody);
    }
    return css;
  }

  /** A Codex install whose webview/index.html links its stylesheet; VS Code reports it as openai.chatgpt. */
  async function installCodex(version: string, css = HEALTHY_CODEX_CSS, html = CODEX_INDEX_HTML): Promise<string> {
    const dir = path.join(tmp, `openai.chatgpt-${version}-darwin-arm64`);
    await fs.promises.mkdir(path.join(dir, 'webview', 'assets'), { recursive: true });
    await fs.promises.writeFile(path.join(dir, 'webview', 'index.html'), html);
    await fs.promises.writeFile(path.join(dir, 'webview', 'assets', CODEX_CSS), css);
    fake.setCodex({ extensionPath: dir, packageJSON: { version } });
    return dir;
  }

  const codexCssOf = (dir: string): string => fs.readFileSync(path.join(dir, 'webview', 'assets', CODEX_CSS), 'utf8');
  const codexFontsIn = (dir: string): string[] =>
    THEME.blocks.codex.assets
      .map((a) => a.target)
      .filter((target) => fs.existsSync(path.join(dir, 'webview', 'assets', target)));

  /** The Codex CSS a sync of HEALTHY_CODEX_CSS writes with these modules on. */
  function syncedCodex(ids: FeatureId[]): string {
    let css = HEALTHY_CODEX_CSS;
    if (ids.includes('theme')) {
      css = appendBlock(css, THEME.blocks.codex.markers, codexThemeBody);
    }
    if (ids.includes('rtl')) {
      css = appendBlock(css, RTL.blocks.codex.markers, codexRtlBody);
    }
    return css;
  }

  function item(command: string): FakeStatusBarItem {
    const found = fake.items.find((i) => i.command === command);
    assert.ok(found, `no status item runs ${command}`);
    return found;
  }

  const clockItem = (): FakeStatusBarItem => item('bidi-usage.refresh');
  const texts = (kind: 'info' | 'warning' | 'error'): string[] =>
    fake.messages.filter((m) => m.kind === kind).map((m) => m.text);

  suiteSetup(() => {
    themeBody = fs.readFileSync(path.join(ROOT, THEME.blocks.claude.cssFile), 'utf8');
    rtlBody = fs.readFileSync(path.join(ROOT, RTL.blocks.claude.cssFile), 'utf8');
    copilotThemeBody = fs.readFileSync(path.join(ROOT, THEME.blocks.workbench.cssFile), 'utf8');
    copilotRtlBody = fs.readFileSync(path.join(ROOT, RTL.blocks.workbench.cssFile), 'utf8');
    codexThemeBody = fs.readFileSync(path.join(ROOT, THEME.blocks.codex.cssFile), 'utf8');
    codexRtlBody = fs.readFileSync(path.join(ROOT, RTL.blocks.codex.cssFile), 'utf8');
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
      const legacy = `${HEALTHY_CSS}\n${RTL.blocks.claude.markers.start}\n[class*="messagesContainer_"]{direction:rtl}\n${RTL.blocks.claude.markers.end}`;
      const dir = await installClaudeCode('2.1.287', legacy);
      await start();
      assert.strictEqual(cssOf(dir), synced(['theme', 'rtl']));
      for (const asset of THEME.blocks.claude.assets) {
        const copied = fs.readFileSync(path.join(dir, 'webview', asset.target));
        assert.ok(copied.equals(fs.readFileSync(path.join(ROOT, asset.source))), asset.target);
      }
      assert.strictEqual(item('bidi-theme.toggle').text, '$(check) Theme');
      assert.strictEqual(item('bidi-rtl.toggle').text, '$(check) RTL');
      assert.ok(texts('info').includes(RELOAD));
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
      assert.strictEqual(fontsIn(dir).length, THEME.blocks.claude.assets.length);
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
          prompts.push(`${message.text} Theme block: ${cssOf(dir).includes(THEME.blocks.claude.markers.start)}`);
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
      await fs.promises.mkdir(path.join(dir, 'webview', THEME.blocks.claude.assets[0].target)); // a folder where a font goes
      const logged: string[] = [];
      const consoleError = console.error;
      console.error = (...args: unknown[]) => void logged.push(args.join(' '));
      try {
        await start(new Memento({ [THEME.flagKey]: false }));
      } finally {
        console.error = consoleError;
      }
      assert.strictEqual(logged.length, 1, logged.join('\n'));
      assert.ok(logged[0].startsWith(`BiDi Theme: font sync failed — ${THEME.blocks.claude.assets[0].target}`), logged[0]);
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

  suite('Copilot chat', () => {
    test('without Claude Code, activation styles the chat, sets its checksum and offers a restart', async () => {
      const appRoot = await installWorkbench();
      await start();
      assert.strictEqual(chatCssOf(appRoot), syncedChat(['theme', 'rtl']));
      assert.strictEqual(chatFontsIn(appRoot).length, THEME.blocks.workbench.assets.length);
      assert.strictEqual(productOf(appRoot), productJson(syncedChat(['theme', 'rtl'])));
      assert.deepStrictEqual(texts('warning'), []);
      const prompt = fake.messages.find((m) => m.text === RESTART);
      assert.ok(prompt, texts('info').join('\n'));
      assert.deepStrictEqual(prompt.items, ['Quit VS Code', 'Reload Window']);
    });

    test('one toggle updates Claude Code and the chat together, and off restores the checksum', async () => {
      const dir = await installClaudeCode('2.1.287');
      const appRoot = await installWorkbench();
      await start();

      await commands.executeCommand('bidi-rtl.toggle');
      assert.strictEqual(cssOf(dir), synced(['theme']));
      assert.strictEqual(chatCssOf(appRoot), syncedChat(['theme']));

      await commands.executeCommand('bidi-theme.toggle');
      assert.strictEqual(cssOf(dir), HEALTHY_CSS);
      assert.strictEqual(chatCssOf(appRoot), HEALTHY_WORKBENCH_CSS);
      assert.deepStrictEqual(chatFontsIn(appRoot), []);
      assert.strictEqual(productOf(appRoot), productJson(HEALTHY_WORKBENCH_CSS));
    });

    test('with neither target, activation says nothing, and a toggle warns and keeps the flag', async () => {
      const context = await start();
      assert.deepStrictEqual(texts('warning'), []);
      assert.ok(!texts('info').includes(RELOAD));
      assert.ok(!texts('info').includes(RESTART));

      await commands.executeCommand('bidi-theme.toggle');
      assert.deepStrictEqual(texts('warning'), [MISSING]);
      assert.strictEqual(context.globalState.get(THEME.flagKey), true);
      assert.strictEqual(item('bidi-theme.toggle').text, '$(check) Theme');
    });

    test('a toggle that changes the chat offers a restart, and Quit VS Code quits', async () => {
      await installClaudeCode('2.1.287');
      await installWorkbench();
      await start();
      fake.answer((message) => (message.items.includes('Quit VS Code') ? 'Quit VS Code' : undefined));
      await commands.executeCommand('bidi-rtl.toggle');
      await flush();
      assert.ok(
        texts('info').some((t) => t.startsWith('BiDi RTL: turned off. Quit and reopen VS Code to apply.')),
        texts('info').join('\n')
      );
      assert.ok(fake.executed.includes('workbench.action.quit'), fake.executed.join(', '));
      assert.ok(!fake.executed.includes('workbench.action.reloadWindow'));
    });

    test('a change to Claude Code alone still offers a window reload', async () => {
      await installClaudeCode('2.1.287');
      await start();
      await commands.executeCommand('bidi-rtl.toggle');
      const prompt = fake.messages.find((m) => m.text === 'BiDi RTL: turned off. Reload window to apply.');
      assert.ok(prompt, texts('info').join('\n'));
      assert.deepStrictEqual(prompt.items, ['Reload Window']);
    });

    test('the chat health warning shows once per VS Code version', async () => {
      const [first] = REQUIRED_CHAT_CLASSES;
      await installWorkbench(HEALTHY_WORKBENCH_CSS.replace(`.${first}{color:red}`, ''));
      const context = await start();
      assert.strictEqual(texts('warning').length, 1);
      assert.ok(texts('warning')[0].includes('1.143.0-insider'), texts('warning')[0]);
      assert.ok(texts('warning')[0].includes(`.${first}`), texts('warning')[0]);

      await fake.extensionsChanged(); // another sync in the same activation
      stop(context);
      const second = await start(context.globalState); // remembers the warned version
      assert.strictEqual(texts('warning').length, 1);

      stop(second);
      fake.setVersion('1.144.0-insider');
      await start(context.globalState);
      assert.strictEqual(texts('warning').length, 2);
      assert.ok(texts('warning')[1].includes('1.144.0-insider'), texts('warning')[1]);
    });

    test('a chat CSS that cannot be written does not hold back Claude Code, and the toggle keeps its flag', async () => {
      const dir = await installClaudeCode('2.1.287');
      const appRoot = await installWorkbench();
      const context = await start();
      // A folder where writeFileAtomic puts its temp file makes the chat CSS write fail.
      await fs.promises.mkdir(`${workbenchCssPath(appRoot)}.bidi-rtl-tmp-${process.pid}`);

      await commands.executeCommand('bidi-theme.toggle');
      assert.strictEqual(cssOf(dir), synced(['rtl']));
      assert.strictEqual(chatCssOf(appRoot), syncedChat(['theme', 'rtl']));
      assert.strictEqual(context.globalState.get(THEME.flagKey), false);
      assert.strictEqual(texts('error').length, 1);
      assert.ok(texts('error')[0].includes("Could not update VS Code's chat CSS"), texts('error')[0]);
    });

    test('a chat CSS that cannot be written is shown once per VS Code version at activation, and on every toggle', async () => {
      const appRoot = await installWorkbench();
      // A folder where writeFileAtomic puts its temp file makes every chat CSS write fail.
      await fs.promises.mkdir(`${workbenchCssPath(appRoot)}.bidi-rtl-tmp-${process.pid}`);
      const logged: string[] = [];
      const consoleError = console.error;
      console.error = (...args: unknown[]) => void logged.push(args.join(' '));
      try {
        const first = await start();
        assert.strictEqual(texts('error').length, 1);
        assert.ok(texts('error')[0].includes("Could not update VS Code's chat CSS"), texts('error')[0]);

        stop(first);
        const second = await start(first.globalState); // same version: logged only
        assert.strictEqual(texts('error').length, 1);
        assert.ok(logged.some((line) => line.includes("Could not update VS Code's chat CSS")), logged.join('\n'));

        await commands.executeCommand('bidi-theme.toggle'); // a toggle always says so
        assert.strictEqual(texts('error').length, 2);
        assert.strictEqual(second.globalState.get(THEME.flagKey), true); // the only target failed: flag restored

        stop(second);
        fake.setVersion('1.144.0-insider');
        await start(first.globalState); // a new version: shown again
        assert.strictEqual(texts('error').length, 3);
      } finally {
        console.error = consoleError;
      }
    });

    test('a checksum that cannot be updated is logged, never shown', async () => {
      const appRoot = await installWorkbench();
      await fs.promises.rm(path.join(appRoot, 'product.json'));
      await fs.promises.mkdir(path.join(appRoot, 'product.json')); // a folder: reading it fails
      const logged: string[] = [];
      const consoleError = console.error;
      console.error = (...args: unknown[]) => void logged.push(args.join(' '));
      try {
        await start();
      } finally {
        console.error = consoleError;
      }
      assert.strictEqual(chatCssOf(appRoot), syncedChat(['theme', 'rtl']));
      assert.deepStrictEqual(texts('error'), []);
      assert.ok(
        logged.some((line) => line.startsWith('BiDi RTL & Theme: could not update the checksum in product.json — ')),
        logged.join('\n')
      );
    });
  });

  suite('Codex', () => {
    const VERSION = '26.51021.22027';

    test('without Claude Code or the chat, activation styles Codex and offers a window reload', async () => {
      const dir = await installCodex(VERSION);
      await start();
      assert.strictEqual(codexCssOf(dir), syncedCodex(['theme', 'rtl']));
      assert.strictEqual(codexFontsIn(dir).length, THEME.blocks.codex.assets.length);
      assert.deepStrictEqual(texts('warning'), []);
      const prompt = fake.messages.find((m) => m.text === RELOAD);
      assert.ok(prompt, texts('info').join('\n'));
      assert.deepStrictEqual(prompt.items, ['Reload Window']);
    });

    test('one toggle updates Claude Code, the chat and Codex together', async () => {
      const claude = await installClaudeCode('2.1.287');
      const appRoot = await installWorkbench();
      const codex = await installCodex(VERSION);
      await start();

      await commands.executeCommand('bidi-rtl.toggle');
      assert.strictEqual(cssOf(claude), synced(['theme']));
      assert.strictEqual(chatCssOf(appRoot), syncedChat(['theme']));
      assert.strictEqual(codexCssOf(codex), syncedCodex(['theme']));

      await commands.executeCommand('bidi-theme.toggle');
      assert.strictEqual(codexCssOf(codex), HEALTHY_CODEX_CSS);
      assert.deepStrictEqual(codexFontsIn(codex), []);
    });

    test('the Codex switch turns Codex off and on, and leaves the modules and the other targets alone', async () => {
      const claude = await installClaudeCode('2.1.287');
      const codex = await installCodex(VERSION);
      const context = await start();

      await commands.executeCommand('bidi-codex.toggle');
      assert.strictEqual(context.globalState.get('bidiCodex.enabled'), false);
      assert.strictEqual(codexCssOf(codex), HEALTHY_CODEX_CSS);
      assert.deepStrictEqual(codexFontsIn(codex), []);
      assert.strictEqual(cssOf(claude), synced(['theme', 'rtl']));
      assert.strictEqual(item('bidi-theme.toggle').text, '$(check) Theme');
      assert.strictEqual(item('bidi-rtl.toggle').text, '$(check) RTL');
      const prompt = fake.messages.find((m) => m.text === 'BiDi Codex: turned off. Reload window to apply.');
      assert.ok(prompt, texts('info').join('\n'));
      assert.deepStrictEqual(prompt.items, ['Reload Window']);

      await commands.executeCommand('bidi-rtl.toggle'); // a module toggle while Codex is off leaves Codex as it is
      assert.strictEqual(cssOf(claude), synced(['theme']));
      assert.strictEqual(codexCssOf(codex), HEALTHY_CODEX_CSS);

      await commands.executeCommand('bidi-codex.toggle');
      assert.strictEqual(context.globalState.get('bidiCodex.enabled'), true);
      assert.strictEqual(codexCssOf(codex), syncedCodex(['theme']));
      assert.ok(texts('info').includes('BiDi Codex: turned on. Reload window to apply.'), texts('info').join('\n'));
    });

    test('the Codex switch without Codex says so and keeps the setting for later', async () => {
      const context = await start();
      await commands.executeCommand('bidi-codex.toggle');
      assert.strictEqual(context.globalState.get('bidiCodex.enabled'), false);
      assert.ok(
        texts('info').includes('BiDi Codex: turned off. Codex is not installed in this VS Code.'),
        texts('info').join('\n')
      );
      assert.deepStrictEqual(texts('warning'), []);
    });

    test('a Codex update is styled when VS Code reports the change', async () => {
      await installCodex('26.51007.21434');
      await start();
      const next = await installCodex(VERSION);
      await fake.extensionsChanged();
      assert.strictEqual(codexCssOf(next), syncedCodex(['theme', 'rtl']));
    });

    test('a Codex that links no stylesheet is said once per Codex version, and the other targets still sync', async () => {
      const claude = await installClaudeCode('2.1.287');
      await installCodex(VERSION, HEALTHY_CODEX_CSS, '<html><head></head><body></body></html>');
      const logged: string[] = [];
      const consoleError = console.error;
      console.error = (...args: unknown[]) => void logged.push(args.join(' '));
      try {
        const context = await start();
        assert.strictEqual(cssOf(claude), synced(['theme', 'rtl']));
        assert.strictEqual(texts('warning').length, 1);
        assert.ok(texts('warning')[0].includes(`Codex ${VERSION}`), texts('warning')[0]);

        await fake.extensionsChanged(); // the same version again
        stop(context);
        const second = await start(context.globalState); // remembers the warned version
        assert.strictEqual(texts('warning').length, 1);
        assert.ok(
          logged.some((line) => line.startsWith(`BiDi RTL & Theme: Codex ${VERSION} links no stylesheet`)),
          logged.join('\n')
        );

        stop(second);
        await installCodex('26.51022.10000', HEALTHY_CODEX_CSS, '<html></html>');
        await start(context.globalState);
        assert.strictEqual(texts('warning').length, 2);
        assert.ok(texts('warning')[1].includes('Codex 26.51022.10000'), texts('warning')[1]);
      } finally {
        console.error = consoleError;
      }
    });

    test('the Codex health warning shows once per Codex version, and only while the theme is on', async () => {
      const [first] = REQUIRED_CODEX_HOOKS;
      const broken = HEALTHY_CODEX_CSS.replace(`${first}abc12_1{color:red}`, '');
      await installCodex(VERSION, broken);
      const context = await start();
      assert.strictEqual(texts('warning').length, 1);
      assert.ok(texts('warning')[0].includes(`Codex ${VERSION}`), texts('warning')[0]);
      assert.ok(texts('warning')[0].includes(first), texts('warning')[0]);

      await fake.extensionsChanged(); // another sync of the same version
      stop(context);
      await start(context.globalState); // remembers the warned version
      assert.strictEqual(texts('warning').length, 1);

      await commands.executeCommand('bidi-theme.toggle'); // theme off
      await installCodex('26.51022.10000', broken);
      await fake.extensionsChanged();
      assert.strictEqual(texts('warning').length, 1);

      await commands.executeCommand('bidi-theme.toggle'); // theme on
      assert.strictEqual(texts('warning').length, 2);
      assert.ok(texts('warning')[1].includes('Codex 26.51022.10000'), texts('warning')[1]);
    });

    test('the diagnostics command copies the shipped script and says how to run it', async () => {
      await start();
      await commands.executeCommand('bidi-codex.copyDiagnostics');
      assert.strictEqual(fake.clipboard, fs.readFileSync(path.join(ROOT, 'diagnostics', 'codex.js'), 'utf8'));
      const steps = texts('info').find((t) => t.startsWith('BiDi Codex: the diagnostics script is on the clipboard.'));
      assert.ok(steps, texts('info').join('\n'));
      assert.ok(steps.includes('Developer: Open Webview Developer Tools'), steps);
      assert.ok(steps.includes('allow pasting'), steps);
    });

    test('a Codex CSS that cannot be written is shown, and does not hold back Claude Code', async () => {
      const claude = await installClaudeCode('2.1.287');
      const codex = await installCodex(VERSION);
      await start();
      // A folder where writeFileAtomic puts its temp file makes the Codex CSS write fail.
      await fs.promises.mkdir(`${path.join(codex, 'webview', 'assets', CODEX_CSS)}.bidi-rtl-tmp-${process.pid}`);
      await commands.executeCommand('bidi-theme.toggle');
      assert.strictEqual(cssOf(claude), synced(['rtl']));
      assert.strictEqual(texts('error').length, 1);
      assert.ok(texts('error')[0].includes('Could not update the Codex CSS'), texts('error')[0]);
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

    test('an unfocused window does not ask; it waits for focus and checks again', async () => {
      await installClaudeCode('2.1.287');
      await fake.focus(false);
      const context = await start();
      assert.deepStrictEqual(prompts(), [], 'no question from a window nobody is looking at');
      assert.strictEqual(context.globalState.get('bidiUsage.prompted'), undefined);

      await fake.focus(true);
      await flush();
      assert.strictEqual(prompts().length, 1);
      await fake.focus(false);
      await fake.focus(true);
      await flush();
      assert.strictEqual(prompts().length, 1, 'only the first focus asks');
    });

    test('a window that gets focus after another one asked does not ask again', async () => {
      await installClaudeCode('2.1.287');
      await fake.focus(false);
      const context = await start();
      await context.globalState.update('bidiUsage.prompted', true); // the other window asked meanwhile
      await fake.focus(true);
      await flush();
      assert.deepStrictEqual(prompts(), []);
    });

    test('a window closed before it gets focus never asks', async () => {
      await installClaudeCode('2.1.287');
      await fake.focus(false);
      const context = await start();
      stop(context);
      await fake.focus(true);
      await flush();
      assert.deepStrictEqual(prompts(), []);
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

    test('refreshing while the clock is off offers to turn it on', async () => {
      await installClaudeCode('2.1.287');
      const context = await start(new Memento({ [USAGE_FLAG]: false }));
      const offers = (): FakeMessage[] => fake.messages.filter((m) => m.text === 'The session clock is off.');
      await commands.executeCommand('bidi-usage.refresh');
      assert.strictEqual(offers().length, 1);
      assert.strictEqual(offers()[0].kind, 'info');
      assert.deepStrictEqual(offers()[0].items, ['Turn on']);
      assert.strictEqual(usage.reads, 0, 'nothing is read until the user agrees');

      fake.answer((message) => (message.items.includes('Turn on') ? 'Turn on' : undefined));
      await commands.executeCommand('bidi-usage.refresh');
      await flush();
      assert.strictEqual(context.globalState.get(USAGE_FLAG), true);
      assert.strictEqual(usage.reads, 1);
      assert.strictEqual(clockItem().text, '$(watch) 11:00 · 42%');
    });

    test('the offer to turn the clock on never blocks the command', async () => {
      await installClaudeCode('2.1.287');
      await start(new Memento({ [USAGE_FLAG]: false }));
      fake.answer(() => new Promise<undefined>(() => undefined)); // never answered
      await commands.executeCommand('bidi-usage.refresh'); // would hang if it awaited the toast
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
