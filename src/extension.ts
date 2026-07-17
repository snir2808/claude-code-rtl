import * as path from 'path';
import * as vscode from 'vscode';
import { applyCssPatch, removeCssPatch } from './patcher';

const CLAUDE_EXTENSION_ID = 'anthropic.claude-code';

function getClaudeCodeCssPath(): string | undefined {
  const ext = vscode.extensions.getExtension(CLAUDE_EXTENSION_ID);
  if (!ext) {
    return undefined;
  }
  return path.join(ext.extensionPath, 'webview', 'index.css');
}

async function tryApplyPatch(silent: boolean = false): Promise<void> {
  const cssPath = getClaudeCodeCssPath();
  if (!cssPath) {
    if (!silent) {
      await vscode.window.showWarningMessage(
        'BiDi RTL: Claude Code extension not found. Please install it first.'
      );
    }
    return;
  }

  try {
    const applied = await applyCssPatch(cssPath);
    if (applied && !silent) {
      const choice = await vscode.window.showInformationMessage(
        'BiDi RTL: RTL patch applied to Claude Code. Reload the Claude Code panel to activate.',
        'Reload Window'
      );
      if (choice === 'Reload Window') {
        await vscode.commands.executeCommand('workbench.action.reloadWindow')
          .then(undefined, () => { /* reload unavailable; user will need to restart manually */ });
      }
    }
  } catch (err: unknown) {
    const isPermission = err instanceof Error &&
      (err as NodeJS.ErrnoException).code === 'EACCES';
    const msg = err instanceof Error ? err.message : String(err);
    const hint = isPermission ? ' Try running VSCode as administrator.' : '';
    await vscode.window.showErrorMessage(
      `BiDi RTL: Could not patch Claude Code CSS — ${msg}.${hint}`
    );
  }
}

export async function activate(context: vscode.ExtensionContext): Promise<void> {
  await tryApplyPatch();

  const applyCmd = vscode.commands.registerCommand('bidi-rtl.applyPatch', async () => {
    await tryApplyPatch();
  });

  const removeCmd = vscode.commands.registerCommand('bidi-rtl.removePatch', async () => {
    const p = getClaudeCodeCssPath();
    if (!p) {
      await vscode.window.showWarningMessage('BiDi RTL: Claude Code extension not found.');
      return;
    }
    try {
      const removed = await removeCssPatch(p);
      if (!removed) {
        await vscode.window.showInformationMessage(
          'BiDi RTL: No patch found — Claude Code CSS was already clean.'
        );
        return;
      }
      const choice = await vscode.window.showInformationMessage(
        'BiDi RTL: RTL patch removed. Reload window to apply.',
        'Reload Window'
      );
      if (choice === 'Reload Window') {
        await vscode.commands.executeCommand('workbench.action.reloadWindow')
          .then(undefined, () => { /* reload unavailable */ });
      }
    } catch (err: unknown) {
      const isPermission = err instanceof Error &&
        (err as NodeJS.ErrnoException).code === 'EACCES';
      const msg = err instanceof Error ? err.message : String(err);
      const hint = isPermission ? ' Try running VSCode as administrator.' : '';
      await vscode.window.showErrorMessage(
        `BiDi RTL: Could not remove patch — ${msg}.${hint}`
      );
    }
  });

  context.subscriptions.push(applyCmd, removeCmd);
}

export function deactivate(): void {}
