import * as vscode from 'vscode';
import { FEATURES, Feature, FeatureId, RTL } from './features';
import {
  checkInstallHealth,
  checkWorkbenchInstallHealth,
  formatHealthWarning,
  formatWorkbenchHealthWarning,
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
  const hint = isPermission ? ' Try running VSCode as administrator.' : '';
  return `BiDi RTL & Theme: Could not ${action} — ${msg}.${hint}`;
}

async function offerReload(message: string): Promise<void> {
  const choice = await vscode.window.showInformationMessage(message, 'Reload Window');
  if (choice === 'Reload Window') {
    await vscode.commands.executeCommand('workbench.action.reloadWindow')
      .then(undefined, () => { /* reload unavailable; user will need to restart manually */ });
  }
}

type SyncOutcome = 'changed' | 'unchanged' | 'error' | 'missing';

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
    "BiDi RTL & Theme: found neither Claude Code nor VS Code's chat stylesheet, so there is nothing to change."
  );
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
  const syncChat = async (enabled: ReadonlySet<FeatureId>, silent: boolean): Promise<SyncOutcome> => {
    let result: WorkbenchSyncResult | null;
    try {
      result = await syncWorkbench(vscode.env.appRoot, context.extensionPath, enabled);
    } catch (err: unknown) {
      reportError("update VS Code's chat CSS", err, silent);
      return 'error';
    }
    if (!result) {
      return 'missing';
    }
    for (const assetError of result.assetErrors) {
      console.error(`BiDi Theme: font sync failed — ${assetError}`);
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

  // One sync of every target; callers run it through the queue.
  const syncNow = async (silent: boolean): Promise<SyncOutcome> => {
    const enabled = enabledIds();
    return combineOutcomes([await syncClaudeCode(enabled, silent), await syncChat(enabled, silent)]);
  };

  const sync = (silent: boolean): Promise<SyncOutcome> => enqueue(() => syncNow(silent));

  // Reads, sets and syncs one module's flag as one queued step, so quick
  // toggles apply in order and each reload prompt matches what was synced.
  // The flag is restored if the sync fails.
  const setFeature = async (
    feature: Feature,
    next: (enabled: boolean) => boolean
  ): Promise<{ outcome: SyncOutcome; enabled: boolean }> => {
    const result = await enqueue(async () => {
      const previous = isEnabled(feature);
      const enabled = next(previous);
      await context.globalState.update(feature.flagKey, enabled);
      const outcome = await syncNow(false);
      if (outcome === 'missing' || outcome === 'error') {
        await context.globalState.update(feature.flagKey, previous);
      }
      return { outcome, enabled };
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
      const { outcome, enabled } = await setFeature(feature, (on) => !on);
      if (outcome === 'changed' || outcome === 'unchanged') {
        void offerReload(
          `BiDi ${feature.label}: turned ${enabled ? 'on' : 'off'}. Reload window to apply.`
        );
      }
    }));
  }

  own(vscode.commands.registerCommand('bidi-rtl.applyPatch', async () => {
    if ((await setFeature(RTL, () => true)).outcome === 'changed') {
      void offerReload('BiDi RTL: RTL patch applied. Reload window to apply.');
    }
  }));

  own(vscode.commands.registerCommand('bidi-rtl.removePatch', async () => {
    const { outcome } = await setFeature(RTL, () => false);
    if (outcome === 'changed') {
      void offerReload('BiDi RTL: RTL patch removed. Reload window to apply.');
    } else if (outcome === 'unchanged') {
      void vscode.window.showInformationMessage('BiDi RTL: No RTL patch found — nothing to remove.');
    }
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
  // use only Claude Code, others only Copilot.
  if ((await sync(false)) === 'changed') {
    void offerReload('BiDi RTL & Theme: styles updated. Reload window to apply.');
  }
}

export function deactivate(): void {}
