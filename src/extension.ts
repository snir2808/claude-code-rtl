import * as vscode from 'vscode';
import { FEATURES, Feature, FeatureId, RTL } from './features';
import { checkInstallHealth, formatHealthWarning, isHealthy } from './health';
import { getStatusBarState } from './status';
import { syncInstall } from './sync';
import { UsageStatus, fetchUsage, formatUsageError, formatUsageStatus, readAccessToken } from './usage';

const CLAUDE_EXTENSION_ID = 'anthropic.claude-code';
const LAST_WARNED_KEY = 'bidiTheme.lastWarnedVersion';
const USAGE_FLAG = 'bidiUsage.enabled';
const USAGE_REFRESH_MS = 5 * 60 * 1000;

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

// Every sync goes through this chain so that activation, the onDidChange
// listener and the commands never read/write index.css concurrently.
let syncQueue: Promise<unknown> = Promise.resolve();

function enqueue<T>(op: () => Promise<T>): Promise<T> {
  const result = syncQueue.then(op);
  syncQueue = result.catch(() => undefined);
  return result;
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
    'BiDi RTL & Theme: Claude Code extension not found. Please install it first.'
  );
}

export async function activate(context: vscode.ExtensionContext): Promise<void> {
  const isEnabled = (feature: Feature): boolean =>
    context.globalState.get<boolean>(feature.flagKey, true);
  const enabledIds = (): Set<FeatureId> =>
    new Set(FEATURES.filter(isEnabled).map((feature) => feature.id));

  const statusItems = FEATURES.map((feature, index) => {
    const item = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100 - index);
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

  // Session clock: when the 5-hour usage window resets. Errors show in the
  // item's tooltip, never as a toast.
  const usageItem = vscode.window.createStatusBarItem(
    vscode.StatusBarAlignment.Right,
    100 - FEATURES.length
  );
  usageItem.command = 'bidi-usage.refresh';
  let lastUsageFetch = 0;
  let resetTimer: NodeJS.Timeout | undefined;
  const isUsageEnabled = (): boolean => context.globalState.get<boolean>(USAGE_FLAG, true);

  const refreshUsage = async (): Promise<void> => {
    clearTimeout(resetTimer);
    if (!isUsageEnabled()) {
      usageItem.hide();
      return;
    }
    lastUsageFetch = Date.now();
    let status: UsageStatus;
    try {
      const token = await readAccessToken();
      if (!token) {
        throw new Error('not signed in to Claude Code');
      }
      const usage = await fetchUsage(token);
      status = formatUsageStatus(usage, new Date());
      // Refresh right after the window resets, if that happens before the next tick.
      const untilReset = (usage.session?.resetsAt?.getTime() ?? 0) - Date.now();
      if (untilReset > 0 && untilReset < USAGE_REFRESH_MS) {
        resetTimer = setTimeout(() => void refreshUsage(), untilReset + 5000);
      }
    } catch (err: unknown) {
      status = formatUsageError(err instanceof Error ? err.message : String(err));
    }
    usageItem.text = status.text;
    usageItem.tooltip = status.tooltip;
    usageItem.show();
  };
  const usageTimer = setInterval(() => void refreshUsage(), USAGE_REFRESH_MS);

  // At most one warning per Claude Code version; the toast is never awaited.
  const warnIfUnhealthy = async (ext: vscode.Extension<unknown>): Promise<void> => {
    const version = String(ext.packageJSON?.version ?? 'unknown');
    if (context.globalState.get<string>(LAST_WARNED_KEY) === version) {
      return;
    }
    const report = await checkInstallHealth(ext.extensionPath);
    if (isHealthy(report)) {
      return;
    }
    await context.globalState.update(LAST_WARNED_KEY, version);
    void vscode.window.showWarningMessage(formatHealthWarning(version, report));
  };

  const sync = (silent: boolean): Promise<SyncOutcome> => enqueue(async () => {
    const ext = vscode.extensions.getExtension(CLAUDE_EXTENSION_ID);
    if (!ext) {
      return 'missing';
    }
    const enabled = enabledIds();
    let cssChanged: boolean;
    try {
      const result = await syncInstall(ext.extensionPath, context.extensionPath, enabled);
      for (const assetError of result.assetErrors) {
        console.error(`BiDi Theme: font copy failed — ${assetError}`);
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
  });

  // Sets one module's flag and syncs; the flag is restored if the sync fails.
  const setFeature = async (feature: Feature, enabled: boolean): Promise<SyncOutcome> => {
    const previous = isEnabled(feature);
    await context.globalState.update(feature.flagKey, enabled);
    const outcome = await sync(false);
    if (outcome === 'missing' || outcome === 'error') {
      await context.globalState.update(feature.flagKey, previous);
    }
    if (outcome === 'missing') {
      warnMissing();
    }
    refreshStatusBar();
    return outcome;
  };

  // globalState is shared across windows; refresh when this window regains focus.
  const windowListener = vscode.window.onDidChangeWindowState((e) => {
    if (e.focused) {
      refreshStatusBar();
      if (Date.now() - lastUsageFetch > 60_000) {
        void refreshUsage();
      }
    }
  });

  // Claude Code updates change its extensionPath (version is in the folder
  // name), so the new install needs syncing.
  const changeListener = vscode.extensions.onDidChange(() => {
    void sync(true);
  });

  const toggleCommands = FEATURES.map((feature) =>
    vscode.commands.registerCommand(feature.toggleCommand, async () => {
      const enabled = !isEnabled(feature);
      const outcome = await setFeature(feature, enabled);
      if (outcome === 'changed' || outcome === 'unchanged') {
        void offerReload(
          `BiDi ${feature.label}: turned ${enabled ? 'on' : 'off'}. Reload window to apply.`
        );
      }
    })
  );

  const applyCmd = vscode.commands.registerCommand('bidi-rtl.applyPatch', async () => {
    if ((await setFeature(RTL, true)) === 'changed') {
      void offerReload('BiDi RTL: RTL patch applied to Claude Code. Reload window to apply.');
    }
  });

  const removeCmd = vscode.commands.registerCommand('bidi-rtl.removePatch', async () => {
    const outcome = await setFeature(RTL, false);
    if (outcome === 'changed') {
      void offerReload('BiDi RTL: RTL patch removed. Reload window to apply.');
    } else if (outcome === 'unchanged') {
      void vscode.window.showInformationMessage('BiDi RTL: No RTL patch found — nothing to remove.');
    }
  });

  const usageRefreshCmd = vscode.commands.registerCommand('bidi-usage.refresh', () => refreshUsage());

  const usageToggleCmd = vscode.commands.registerCommand('bidi-usage.toggle', async () => {
    await context.globalState.update(USAGE_FLAG, !isUsageEnabled());
    await refreshUsage();
  });

  context.subscriptions.push(
    ...statusItems.map(({ item }) => item),
    usageItem,
    windowListener,
    changeListener,
    ...toggleCommands,
    applyCmd,
    removeCmd,
    usageRefreshCmd,
    usageToggleCmd,
    { dispose: () => { clearInterval(usageTimer); clearTimeout(resetTimer); } }
  );

  void refreshUsage();

  // The initial sync runs after everything is registered and never blocks
  // activation on a toast.
  const outcome = await sync(false);
  if (outcome === 'missing') {
    warnMissing();
  } else if (outcome === 'changed') {
    void offerReload('BiDi RTL & Theme: Claude Code CSS updated. Reload window to apply.');
  }
}

export function deactivate(): void {}
