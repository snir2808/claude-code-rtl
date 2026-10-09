import * as path from 'path';
import * as vscode from 'vscode';
import { applyCssPatch, removeCssPatch } from './patcher';
import { getStatusBarState } from './status';

const CLAUDE_EXTENSION_ID = 'anthropic.claude-code';
const ENABLED_KEY = 'bidiRtl.enabled';

function getClaudeCodeCssPath(): string | undefined {
  const ext = vscode.extensions.getExtension(CLAUDE_EXTENSION_ID);
  if (!ext) {
    return undefined;
  }
  return path.join(ext.extensionPath, 'webview', 'index.css');
}

function formatError(action: string, err: unknown): string {
  const isPermission = err instanceof Error &&
    (err as NodeJS.ErrnoException).code === 'EACCES';
  const msg = err instanceof Error ? err.message : String(err);
  const hint = isPermission ? ' Try running VSCode as administrator.' : '';
  return `BiDi RTL: Could not ${action} — ${msg}.${hint}`;
}

async function offerReload(message: string): Promise<void> {
  const choice = await vscode.window.showInformationMessage(message, 'Reload Window');
  if (choice === 'Reload Window') {
    await vscode.commands.executeCommand('workbench.action.reloadWindow')
      .then(undefined, () => { /* reload unavailable; user will need to restart manually */ });
  }
}

type PatchResult = 'changed' | 'unchanged' | 'error' | 'missing';

// Every patch operation goes through this chain so that activation, the
// onDidChange listener and the commands never read/write index.css concurrently.
let patchQueue: Promise<unknown> = Promise.resolve();

function enqueue<T>(op: () => Promise<T>): Promise<T> {
  const result = patchQueue.then(op);
  patchQueue = result.catch(() => undefined);
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

function tryApplyPatch(silent: boolean): Promise<PatchResult> {
  return enqueue(async () => {
    const cssPath = getClaudeCodeCssPath();
    if (!cssPath) {
      return 'missing';
    }
    try {
      return (await applyCssPatch(cssPath)) ? 'changed' : 'unchanged';
    } catch (err: unknown) {
      reportError('patch Claude Code CSS', err, silent);
      return 'error';
    }
  });
}

function tryRemovePatch(silent: boolean): Promise<PatchResult> {
  return enqueue(async () => {
    const cssPath = getClaudeCodeCssPath();
    if (!cssPath) {
      return 'missing';
    }
    try {
      return (await removeCssPatch(cssPath)) ? 'changed' : 'unchanged';
    } catch (err: unknown) {
      reportError('remove patch', err, silent);
      return 'error';
    }
  });
}

function warnMissing(): void {
  void vscode.window.showWarningMessage(
    'BiDi RTL: Claude Code extension not found. Please install it first.'
  );
}

export async function activate(context: vscode.ExtensionContext): Promise<void> {
  const isEnabled = (): boolean => context.globalState.get<boolean>(ENABLED_KEY, true);

  const statusBar = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
  statusBar.command = 'bidi-rtl.toggle';
  const refreshStatusBar = (): void => {
    const state = getStatusBarState(isEnabled());
    statusBar.text = state.text;
    statusBar.tooltip = state.tooltip;
  };
  refreshStatusBar();
  statusBar.show();

  const setEnabled = async (enabled: boolean): Promise<void> => {
    await context.globalState.update(ENABLED_KEY, enabled);
    refreshStatusBar();
  };

  // globalState is shared across windows; refresh when this window regains focus.
  const windowListener = vscode.window.onDidChangeWindowState((e) => {
    if (e.focused) {
      refreshStatusBar();
    }
  });

  // Claude Code updates change its extensionPath (version is in the folder
  // name), so the new CSS needs patching again.
  const changeListener = vscode.extensions.onDidChange(() => {
    if (isEnabled()) {
      void tryApplyPatch(true);
    }
  });

  const applyCmd = vscode.commands.registerCommand('bidi-rtl.applyPatch', async () => {
    const result = await tryApplyPatch(false);
    if (result === 'missing') {
      warnMissing();
      return;
    }
    if (result === 'error') {
      return;
    }
    await setEnabled(true);
    if (result === 'changed') {
      void offerReload(
        'BiDi RTL: RTL patch applied to Claude Code. Reload the Claude Code panel to activate.'
      );
    }
  });

  const removeCmd = vscode.commands.registerCommand('bidi-rtl.removePatch', async () => {
    const result = await tryRemovePatch(false);
    if (result === 'missing') {
      void vscode.window.showWarningMessage('BiDi RTL: Claude Code extension not found.');
      return;
    }
    if (result === 'error') {
      return;
    }
    await setEnabled(false);
    if (result === 'changed') {
      void offerReload('BiDi RTL: RTL patch removed. Reload window to apply.');
    } else {
      void vscode.window.showInformationMessage(
        'BiDi RTL: No patch found — Claude Code CSS was already clean.'
      );
    }
  });

  const toggleCmd = vscode.commands.registerCommand('bidi-rtl.toggle', async () => {
    const enabled = !isEnabled();
    const result = await (enabled ? tryApplyPatch(false) : tryRemovePatch(false));
    if (result === 'missing') {
      warnMissing();
      return;
    }
    if (result === 'error') {
      return;
    }
    await setEnabled(enabled);
    void offerReload(
      `BiDi RTL: RTL turned ${enabled ? 'on' : 'off'}. Reload window to apply.`
    );
  });

  context.subscriptions.push(
    statusBar, windowListener, changeListener, applyCmd, removeCmd, toggleCmd
  );

  // Initial apply/remove runs after everything is registered and never blocks
  // activation on a toast.
  if (isEnabled()) {
    const result = await tryApplyPatch(false);
    if (result === 'missing') {
      warnMissing();
    } else if (result === 'changed') {
      void offerReload(
        'BiDi RTL: RTL patch applied to Claude Code. Reload the Claude Code panel to activate.'
      );
    }
  } else {
    await tryRemovePatch(true);
  }
}

export function deactivate(): void {}
