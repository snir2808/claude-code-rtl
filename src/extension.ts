import * as vscode from 'vscode';
import { applyPatch, removePatch, getWorkbenchHtmlPath } from './patcher';

export async function activate(context: vscode.ExtensionContext): Promise<void> {
  const htmlPath = getWorkbenchHtmlPath();

  try {
    const applied = await applyPatch(htmlPath);
    if (applied) {
      const choice = await vscode.window.showInformationMessage(
        'BiDi RTL: RTL patch applied to Claude Code panel. Restart VSCode to activate.',
        'Restart Now'
      );
      if (choice === 'Restart Now') {
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
      `BiDi RTL: Could not patch workbench.html — ${msg}.${hint}`
    );
  }

  const removeCmd = vscode.commands.registerCommand('bidi-rtl.removePatch', async () => {
    try {
      const removed = await removePatch(htmlPath);
      if (!removed) {
        await vscode.window.showInformationMessage(
          'BiDi RTL: No patch found — workbench.html was already clean.'
        );
        return;
      }
      const choice = await vscode.window.showInformationMessage(
        'BiDi RTL: RTL patch removed. Restart VSCode to apply.',
        'Restart Now'
      );
      if (choice === 'Restart Now') {
        await vscode.commands.executeCommand('workbench.action.reloadWindow')
          .then(undefined, () => { /* reload unavailable; user will need to restart manually */ });
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

  context.subscriptions.push(removeCmd);
}

export function deactivate(): void {}
