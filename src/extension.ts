import * as fs from 'fs';
import * as path from 'path';
import * as vscode from 'vscode';
import { CODEX_EXTENSION_ID, CodexSyncResult, syncCodex } from './codex';
import { FEATURES, Feature, FeatureId, RTL } from './features';
import {
  checkCodexInstallHealth,
  checkInstallHealth,
  checkWorkbenchInstallHealth,
  formatCodexHealthWarning,
  formatHealthWarning,
  formatWorkbenchHealthWarning,
  isCodexHealthy,
  isHealthy,
  isWorkbenchHealthy,
} from './health';
import { getStatusBarState } from './status';
import { syncInstall } from './sync';
import { WorkbenchSyncResult, syncWorkbench } from './workbench';
import {
  CredentialReadError,
  Usage,
  UsageStatus,
  fetchUsage,
  formatUsageError,
  formatUsageStatus,
  readAccessToken,
} from './usage';

/** Where the session clock gets the sign-in token and the usage. Tests pass fakes. */
export interface UsageSource {
  readAccessToken(): Promise<string | null>;
  fetchUsage(token: string): Promise<Usage>;
}

const CLAUDE_CODE_USAGE: UsageSource = { readAccessToken, fetchUsage: (token) => fetchUsage(token) };

const CLAUDE_EXTENSION_ID = 'anthropic.claude-code';
const LAST_WARNED_KEY = 'bidiTheme.lastWarnedVersion';
const LAST_WARNED_WORKBENCH_KEY = 'bidiTheme.lastWarnedWorkbenchVersion';
/** The VS Code version whose chat CSS write error activation last showed. */
const LAST_CHAT_ERROR_KEY = 'bidiTheme.lastChatErrorVersion';
const LAST_WARNED_CODEX_KEY = 'bidiTheme.lastWarnedCodexVersion';
/** The Codex switch: Codex gets the enabled modules only while it is on (the default). */
const CODEX_FLAG = 'bidiCodex.enabled';
/** The Codex version whose missing stylesheet the warning last named. */
const LAST_CODEX_LAYOUT_KEY = 'bidiCodex.lastLayoutWarnedVersion';
/** The script for the Codex panel's DevTools, shipped with this extension. */
const CODEX_DIAGNOSTICS = path.join('diagnostics', 'codex.js');
const CODEX_DIAGNOSTICS_STEPS =
  'BiDi Codex: the diagnostics script is on the clipboard. Click in the Codex panel, run ' +
  '"Developer: Open Webview Developer Tools" and open its Console. Type "allow pasting" the first time, ' +
  'then paste and press Enter. The report it copies holds no message text.';
const USAGE_FLAG = 'bidiUsage.enabled';
/** Set when the clock's opt-in question is shown, so only one window or activation ever asks. */
const USAGE_PROMPTED_KEY = 'bidiUsage.prompted';
const USAGE_REFRESH_MS = 5 * 60 * 1000;
const USAGE_FOCUS_REFRESH_MS = 60 * 1000;
const USAGE_PROMPT =
  "BiDi: Show when your Claude 5-hour session resets in the status bar? It reads Claude Code's sign-in from " +
  `${process.platform === 'darwin' ? 'the macOS Keychain' : '~/.claude/.credentials.json'} ` +
  'and asks Anthropic for your usage.';

function formatError(action: string, err: unknown): string {
  const isPermission = err instanceof Error &&
    (err as NodeJS.ErrnoException).code === 'EACCES';
  const msg = err instanceof Error ? err.message : String(err);
  const hint = isPermission ? ' Check that your user account can write there.' : '';
  return `BiDi RTL & Theme: Could not ${action} — ${msg}.${hint}`;
}

const QUIT = 'Quit VS Code';
const RELOAD = 'Reload Window';

/**
 * How to apply a change. VS Code checks its files against the checksums it read
 * from product.json at startup, so after a chat change a window reload shows
 * a harmless "installation is corrupt" warning until VS Code restarts.
 */
function applyHint(chatChanged: boolean): string {
  return chatChanged
    ? 'Quit and reopen VS Code to apply. A window reload also works, but VS Code then warns that its ' +
        'installation is corrupt until it restarts (harmless).'
    : 'Reload window to apply.';
}

async function offerReload(message: string, chatChanged: boolean): Promise<void> {
  const choice = chatChanged
    ? await vscode.window.showInformationMessage(message, QUIT, RELOAD)
    : await vscode.window.showInformationMessage(message, RELOAD);
  const command = choice === QUIT ? 'workbench.action.quit' : choice === RELOAD ? 'workbench.action.reloadWindow' : undefined;
  if (command) {
    await vscode.commands.executeCommand(command)
      .then(undefined, () => { /* unavailable; the user can restart by hand */ });
  }
}

type SyncOutcome = 'changed' | 'unchanged' | 'error' | 'missing';

/** What one sync of every target did; chatChanged is true when VS Code's chat CSS was rewritten. */
interface SyncReport {
  outcome: SyncOutcome;
  chatChanged: boolean;
}

/**
 * One outcome for a sync of every target: missing when no target exists,
 * error when none of the existing ones could be updated.
 */
function combineOutcomes(outcomes: readonly SyncOutcome[]): SyncOutcome {
  const present = outcomes.filter((outcome) => outcome !== 'missing');
  if (present.length === 0) {
    return 'missing';
  }
  if (present.every((outcome) => outcome === 'error')) {
    return 'error';
  }
  return present.includes('changed') ? 'changed' : 'unchanged';
}

// Error toasts are not awaited, so a pending toast never blocks the queue.
function reportError(action: string, err: unknown, silent: boolean): void {
  if (silent) {
    console.error(formatError(action, err));
  } else {
    void vscode.window.showErrorMessage(formatError(action, err));
  }
}

function warnMissing(): void {
  void vscode.window.showWarningMessage(
    "BiDi RTL & Theme: found none of Claude Code, VS Code's chat stylesheet or Codex, so there is nothing to change."
  );
}

function codexLayoutWarning(version: string): string {
  return `BiDi RTL & Theme: Codex ${version} links no stylesheet this extension can style (Codex changed its layout), ` +
    'so Codex keeps its own look.';
}

export async function activate(
  context: vscode.ExtensionContext,
  usageSource: UsageSource = CLAUDE_CODE_USAGE
): Promise<void> {
  // Each disposable goes to VS Code as soon as it exists, so a failure later
  // in activation cannot leave it behind.
  const own = <T extends vscode.Disposable>(disposable: T): T => {
    context.subscriptions.push(disposable);
    return disposable;
  };

  // Every sync goes through this chain so that activation, the onDidChange
  // listener and the commands never read/write the CSS files concurrently.
  let syncQueue: Promise<unknown> = Promise.resolve();
  const enqueue = <T>(op: () => Promise<T>): Promise<T> => {
    const result = syncQueue.then(op);
    syncQueue = result.catch(() => undefined);
    return result;
  };

  const isEnabled = (feature: Feature): boolean =>
    context.globalState.get<boolean>(feature.flagKey, true);
  const enabledIds = (): Set<FeatureId> =>
    new Set(FEATURES.filter(isEnabled).map((feature) => feature.id));
  const isCodexOn = (): boolean => context.globalState.get<boolean>(CODEX_FLAG, true);

  // Separate ids, so the status bar's context menu can hide each item on its own.
  const statusItems = FEATURES.map((feature, index) => {
    const item = own(
      vscode.window.createStatusBarItem(`bidi.${feature.id}`, vscode.StatusBarAlignment.Right, 100 - index)
    );
    item.name = `BiDi ${feature.label}`;
    item.command = feature.toggleCommand;
    item.show();
    return { feature, item };
  });
  const refreshStatusBar = (): void => {
    for (const { feature, item } of statusItems) {
      const state = getStatusBarState(feature.label, isEnabled(feature));
      item.text = state.text;
      item.tooltip = state.tooltip;
    }
  };
  refreshStatusBar();

  // Session clock: when the 5-hour usage window resets. It is off until the
  // user opts in. Errors show in the item's tooltip, never as a toast.
  const usageItem = own(
    vscode.window.createStatusBarItem('bidi.sessionClock', vscode.StatusBarAlignment.Right, 100 - FEATURES.length)
  );
  usageItem.name = 'Claude Session Clock';
  usageItem.command = 'bidi-usage.refresh';
  let lastUsageFetch = 0;
  // The last usage shown. Focus shows it again as of the current time, since
  // its reset can pass while the machine sleeps.
  let lastUsage: Usage | undefined;
  let resetTimer: NodeJS.Timeout | undefined;
  let usageTimer: NodeJS.Timeout | undefined;
  // Bumped by every refresh, the toggle and dispose. A refresh that finds it
  // changed after an await has been superseded and leaves the item and the
  // reset timer alone.
  let usageGen = 0;
  // Set when the Keychain was denied, never answered or is locked: the timers
  // and the focus refresh stay quiet, since they would only raise the prompt
  // again, until the user clicks the item or runs the toggle.
  let usagePaused = false;
  let disposed = false;
  own({
    dispose: () => {
      disposed = true;
      usageGen++;
      clearInterval(usageTimer);
      clearTimeout(resetTimer);
    },
  });
  const isUsageEnabled = (): boolean => context.globalState.get<boolean>(USAGE_FLAG, false);

  const showUsage = (status: UsageStatus): void => {
    usageItem.text = status.text;
    usageItem.tooltip = status.tooltip;
    usageItem.show();
  };

  const refreshUsage = async (trigger: 'auto' | 'user'): Promise<void> => {
    // Checked before the pause, so turning the clock off in another window
    // also applies here. Off ends the pause: turning it on again starts afresh.
    if (!isUsageEnabled()) {
      usageGen++; // a refresh still in flight stops when it resumes
      clearTimeout(resetTimer);
      usagePaused = false;
      lastUsage = undefined;
      usageItem.hide();
      return;
    }
    if (trigger === 'user') {
      usagePaused = false;
    } else if (usagePaused) {
      return;
    }
    const gen = ++usageGen;
    clearTimeout(resetTimer);
    lastUsageFetch = Date.now();
    const superseded = (): boolean => gen !== usageGen || !isUsageEnabled();
    let status: UsageStatus;
    try {
      const token = await usageSource.readAccessToken();
      if (superseded()) {
        return;
      }
      if (!token) {
        throw new Error('not signed in to Claude Code');
      }
      const usage = await usageSource.fetchUsage(token);
      if (superseded()) {
        return;
      }
      lastUsage = usage;
      status = formatUsageStatus(usage, new Date());
      // Refresh right after the window resets, if that happens before the next tick.
      // Only the latest refresh gets here, and it cleared the timer on entry,
      // so there is never more than one.
      const untilReset = (usage.session?.resetsAt?.getTime() ?? 0) - Date.now();
      if (untilReset > 0 && untilReset < USAGE_REFRESH_MS) {
        resetTimer = setTimeout(() => void refreshUsage('auto'), untilReset + 5000);
      }
    } catch (err: unknown) {
      if (superseded()) {
        return;
      }
      lastUsage = undefined;
      if (err instanceof CredentialReadError && err.denied) {
        usagePaused = true;
      }
      status = formatUsageError(err instanceof Error ? err.message : String(err));
    }
    showUsage(status);
  };

  const reportOfferError = (err: unknown): void => {
    console.error(formatError('ask about the session clock', err));
  };

  // The clock reads Claude Code's sign-in and calls Anthropic, so it asks
  // first, once: only when the user never turned it on or off. The answer is
  // never awaited by activation.
  const offerUsageClock = async (): Promise<void> => {
    if (
      context.globalState.get<boolean>(USAGE_FLAG) !== undefined ||
      context.globalState.get<boolean>(USAGE_PROMPTED_KEY, false)
    ) {
      return;
    }
    // Several windows can activate at once, and globalState reaches the others
    // late, so only a focused window asks; the others check again on focus.
    if (!vscode.window.state.focused) {
      const listener = own(vscode.window.onDidChangeWindowState((e) => {
        if (e.focused) {
          listener.dispose();
          void offerUsageClock().catch(reportOfferError);
        }
      }));
      return;
    }
    await context.globalState.update(USAGE_PROMPTED_KEY, true);
    const choice = await vscode.window.showInformationMessage(USAGE_PROMPT, 'Enable', 'Not now');
    if (choice === 'Enable' && !disposed) {
      usageGen++; // a refresh in flight must not undo the answer
      await context.globalState.update(USAGE_FLAG, true);
      await refreshUsage('user');
    }
  };

  // Versions found healthy in this activation: every sync would otherwise
  // read Claude Code's index.js (megabytes) again.
  const healthyVersions = new Set<string>();
  // The workbench CSS changes only with a VS Code update, which restarts this
  // extension, so the chat is checked at most once per activation.
  let chatChecked = false;

  // At most one warning per Claude Code version; the toast is never awaited.
  const warnIfUnhealthy = async (ext: vscode.Extension<unknown>): Promise<void> => {
    const version = String(ext.packageJSON?.version ?? 'unknown');
    if (healthyVersions.has(version) || context.globalState.get<string>(LAST_WARNED_KEY) === version) {
      return;
    }
    const report = await checkInstallHealth(ext.extensionPath);
    if (isHealthy(report)) {
      healthyVersions.add(version);
      return;
    }
    await context.globalState.update(LAST_WARNED_KEY, version);
    void vscode.window.showWarningMessage(formatHealthWarning(version, report));
  };

  // At most one warning per VS Code version, kept apart from Claude Code's.
  const warnIfChatUnhealthy = async (): Promise<void> => {
    const version = vscode.version;
    if (chatChecked || context.globalState.get<string>(LAST_WARNED_WORKBENCH_KEY) === version) {
      return;
    }
    chatChecked = true;
    const report = await checkWorkbenchInstallHealth(vscode.env.appRoot);
    if (isWorkbenchHealthy(report)) {
      return;
    }
    await context.globalState.update(LAST_WARNED_WORKBENCH_KEY, version);
    void vscode.window.showWarningMessage(formatWorkbenchHealthWarning(version, report));
  };

  // Codex versions found healthy in this activation: each check reads Codex's stylesheets (3 MB).
  const healthyCodexVersions = new Set<string>();

  // At most one warning per Codex version, kept apart from the other targets'.
  const warnIfCodexUnhealthy = async (version: string, cssPath: string): Promise<void> => {
    if (healthyCodexVersions.has(version) || context.globalState.get<string>(LAST_WARNED_CODEX_KEY) === version) {
      return;
    }
    const report = await checkCodexInstallHealth(cssPath);
    if (isCodexHealthy(report)) {
      healthyCodexVersions.add(version);
      return;
    }
    await context.globalState.update(LAST_WARNED_CODEX_KEY, version);
    void vscode.window.showWarningMessage(formatCodexHealthWarning(version, report));
  };

  // A Codex that links no stylesheet is said once per Codex version, then only logged.
  const warnCodexLayout = async (version: string): Promise<void> => {
    if (context.globalState.get<string>(LAST_CODEX_LAYOUT_KEY) === version) {
      console.error(codexLayoutWarning(version));
      return;
    }
    await context.globalState.update(LAST_CODEX_LAYOUT_KEY, version);
    void vscode.window.showWarningMessage(codexLayoutWarning(version));
  };

  const syncClaudeCode = async (enabled: ReadonlySet<FeatureId>, silent: boolean): Promise<SyncOutcome> => {
    const ext = vscode.extensions.getExtension(CLAUDE_EXTENSION_ID);
    if (!ext) {
      return 'missing';
    }
    let cssChanged: boolean;
    try {
      const result = await syncInstall(ext.extensionPath, context.extensionPath, enabled);
      for (const assetError of result.assetErrors) {
        console.error(`BiDi Theme: font sync failed — ${assetError}`);
      }
      cssChanged = result.cssChanged;
    } catch (err: unknown) {
      reportError('update Claude Code CSS', err, silent);
      return 'error';
    }
    if (enabled.has('theme')) {
      await warnIfUnhealthy(ext).catch((err: unknown) => {
        console.error(formatError('check Claude Code', err));
      });
    }
    return cssChanged ? 'changed' : 'unchanged';
  };

  // VS Code's own chat, where Copilot runs, is styled by the workbench CSS.
  const syncChat = async (
    enabled: ReadonlySet<FeatureId>,
    silent: boolean,
    activation: boolean
  ): Promise<SyncOutcome> => {
    let result: WorkbenchSyncResult | null;
    try {
      result = await syncWorkbench(vscode.env.appRoot, context.extensionPath, enabled);
    } catch (err: unknown) {
      // A VS Code installed where this user cannot write fails in every
      // window, so activation says so once per VS Code version and then only
      // logs it. A toggle says so every time.
      const shownBefore = context.globalState.get<string>(LAST_CHAT_ERROR_KEY) === vscode.version;
      reportError("update VS Code's chat CSS", err, silent || (activation && shownBefore));
      if (activation && !silent && !shownBefore) {
        await context.globalState.update(LAST_CHAT_ERROR_KEY, vscode.version).then(undefined, (e: unknown) => {
          console.error(formatError('remember the chat CSS error', e));
        });
      }
      return 'error';
    }
    if (!result) {
      return 'missing';
    }
    for (const assetError of result.assetErrors) {
      console.error(`BiDi Theme: chat font sync failed — ${assetError}`);
    }
    if (result.checksumError) {
      // VS Code may then call the installation corrupt; the chat is styled anyway.
      console.error(`BiDi RTL & Theme: could not update the checksum in product.json — ${result.checksumError}`);
    }
    if (enabled.has('theme')) {
      await warnIfChatUnhealthy().catch((err: unknown) => {
        console.error(formatError("check VS Code's chat", err));
      });
    }
    return result.cssChanged ? 'changed' : 'unchanged';
  };

  // OpenAI's Codex panel: a webview whose stylesheet sits in Codex's install.
  // While the Codex switch is off, Codex is synced with nothing enabled.
  const syncCodexPanel = async (enabled: ReadonlySet<FeatureId>, silent: boolean): Promise<SyncOutcome> => {
    const ext = vscode.extensions.getExtension(CODEX_EXTENSION_ID);
    if (!ext) {
      return 'missing';
    }
    const version = String(ext.packageJSON?.version ?? 'unknown');
    const codexEnabled: ReadonlySet<FeatureId> = isCodexOn() ? enabled : new Set();
    let result: CodexSyncResult | null;
    try {
      result = await syncCodex(ext.extensionPath, context.extensionPath, codexEnabled);
    } catch (err: unknown) {
      reportError('update the Codex CSS', err, silent);
      return 'error';
    }
    if (!result) {
      if (!isCodexOn()) {
        return 'unchanged'; // nothing of ours can be there, and Codex is not to be styled
      }
      await warnCodexLayout(version).catch((err: unknown) => {
        console.error(formatError('remember the Codex layout warning', err));
      });
      return 'error';
    }
    for (const assetError of result.assetErrors) {
      console.error(`BiDi Theme: Codex font sync failed — ${assetError}`);
    }
    if (codexEnabled.has('theme')) {
      await warnIfCodexUnhealthy(version, result.cssPath).catch((err: unknown) => {
        console.error(formatError('check Codex', err));
      });
    }
    return result.cssChanged ? 'changed' : 'unchanged';
  };

  // One sync of every target; callers run it through the queue. `activation`
  // marks the sync each window runs when it starts.
  const syncNow = async (silent: boolean, activation = false): Promise<SyncReport> => {
    const enabled = enabledIds();
    const claude = await syncClaudeCode(enabled, silent);
    const chat = await syncChat(enabled, silent, activation);
    const codex = await syncCodexPanel(enabled, silent);
    return { outcome: combineOutcomes([claude, chat, codex]), chatChanged: chat === 'changed' };
  };

  const sync = (silent: boolean, activation = false): Promise<SyncReport> =>
    enqueue(() => syncNow(silent, activation));

  // Reads, sets and syncs one module's flag as one queued step, so quick
  // toggles apply in order and each reload prompt matches what was synced.
  // The flag is restored if the sync fails.
  const setFeature = async (
    feature: Feature,
    next: (enabled: boolean) => boolean
  ): Promise<{ outcome: SyncOutcome; enabled: boolean; chatChanged: boolean }> => {
    const result = await enqueue(async () => {
      const previous = isEnabled(feature);
      const enabled = next(previous);
      await context.globalState.update(feature.flagKey, enabled);
      const report = await syncNow(false);
      if (report.outcome === 'missing' || report.outcome === 'error') {
        await context.globalState.update(feature.flagKey, previous);
      }
      return { outcome: report.outcome, enabled, chatChanged: report.chatChanged };
    });
    if (result.outcome === 'missing') {
      warnMissing();
    }
    refreshStatusBar();
    return result;
  };

  // globalState is shared across windows; refresh when this window regains focus.
  own(vscode.window.onDidChangeWindowState((e) => {
    if (!e.focused) {
      return;
    }
    refreshStatusBar();
    if (lastUsage && isUsageEnabled()) {
      showUsage(formatUsageStatus(lastUsage, new Date()));
    }
    if (!isUsageEnabled() || Date.now() - lastUsageFetch > USAGE_FOCUS_REFRESH_MS) {
      void refreshUsage('auto');
    }
  }));

  // Claude Code updates change its extensionPath (version is in the folder
  // name), so the new install needs syncing. VS Code ignores the returned
  // promise; tests use it to wait for the sync.
  own(vscode.extensions.onDidChange(() => sync(true)));

  for (const feature of FEATURES) {
    own(vscode.commands.registerCommand(feature.toggleCommand, async () => {
      const { outcome, enabled, chatChanged } = await setFeature(feature, (on) => !on);
      if (outcome === 'changed' || outcome === 'unchanged') {
        void offerReload(
          `BiDi ${feature.label}: turned ${enabled ? 'on' : 'off'}. ${applyHint(chatChanged)}`,
          chatChanged
        );
      }
    }));
  }

  own(vscode.commands.registerCommand('bidi-rtl.applyPatch', async () => {
    const { outcome, chatChanged } = await setFeature(RTL, () => true);
    if (outcome === 'changed') {
      void offerReload(`BiDi RTL: RTL patch applied. ${applyHint(chatChanged)}`, chatChanged);
    }
  }));

  own(vscode.commands.registerCommand('bidi-rtl.removePatch', async () => {
    const { outcome, chatChanged } = await setFeature(RTL, () => false);
    if (outcome === 'changed') {
      void offerReload(`BiDi RTL: RTL patch removed. ${applyHint(chatChanged)}`, chatChanged);
    } else if (outcome === 'unchanged') {
      void vscode.window.showInformationMessage('BiDi RTL: No RTL patch found — nothing to remove.');
    }
  }));

  // Codex on its own: the modules stay as they are for Claude Code and the chat.
  own(vscode.commands.registerCommand('bidi-codex.toggle', async () => {
    const { outcome, on } = await enqueue(async () => {
      const previous = isCodexOn();
      await context.globalState.update(CODEX_FLAG, !previous);
      const result = await syncCodexPanel(enabledIds(), false);
      if (result === 'error') {
        await context.globalState.update(CODEX_FLAG, previous);
      }
      return { outcome: result, on: result === 'error' ? previous : !previous };
    });
    const state = on ? 'on' : 'off';
    if (outcome === 'missing') {
      void vscode.window.showInformationMessage(`BiDi Codex: turned ${state}. Codex is not installed in this VS Code.`);
    } else if (outcome === 'changed' || outcome === 'unchanged') {
      void offerReload(`BiDi Codex: turned ${state}. ${applyHint(false)}`, false);
    }
  }));

  own(vscode.commands.registerCommand('bidi-codex.copyDiagnostics', async () => {
    try {
      const script = await fs.promises.readFile(path.join(context.extensionPath, CODEX_DIAGNOSTICS), 'utf8');
      await vscode.env.clipboard.writeText(script);
    } catch (err: unknown) {
      reportError('copy the Codex diagnostics script', err, false);
      return;
    }
    void vscode.window.showInformationMessage(CODEX_DIAGNOSTICS_STEPS);
  }));

  const setUsageEnabled = async (on: boolean): Promise<void> => {
    usageGen++; // a refresh in flight must not undo the change
    await context.globalState.update(USAGE_FLAG, on);
    await refreshUsage('user');
  };

  own(vscode.commands.registerCommand('bidi-usage.refresh', async () => {
    if (isUsageEnabled()) {
      await refreshUsage('user');
      return;
    }
    // Off: say so instead of doing nothing. The toast is never awaited.
    void vscode.window.showInformationMessage('The session clock is off.', 'Turn on').then(async (choice) => {
      if (choice === 'Turn on' && !disposed) {
        await setUsageEnabled(true);
      }
    }).then(undefined, (err: unknown) => {
      console.error(formatError('turn on the session clock', err));
    });
  }));

  own(vscode.commands.registerCommand('bidi-usage.toggle', () => setUsageEnabled(!isUsageEnabled())));

  // Started only now that everything is registered, so a failed activation
  // cannot leave a timer running. Each window polls only while it has focus;
  // the focus refresh catches up the others.
  void refreshUsage('auto');
  usageTimer = setInterval(() => {
    if (vscode.window.state.focused) {
      void refreshUsage('auto');
    }
  }, USAGE_REFRESH_MS);
  void offerUsageClock().catch(reportOfferError);

  // The initial sync runs after everything is registered and never blocks
  // activation on a toast. A missing target is skipped silently: some people
  // use only Claude Code, others only Copilot or Codex.
  const report = await sync(false, true);
  if (report.outcome === 'changed') {
    void offerReload(`BiDi RTL & Theme: styles updated. ${applyHint(report.chatChanged)}`, report.chatChanged);
  }
}

export function deactivate(): void {}
