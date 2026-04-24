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
        await vscode.commands.executeCommand('workbench.action.reloadWindow');
      }
    }
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    vscode.window.showErrorMessage(
      `BiDi RTL: Could not patch workbench.html — ${msg}. Try running VSCode as administrator.`
    );
  }

  const removeCmd = vscode.commands.registerCommand('bidi-rtl.removePatch', async () => {
    try {
      await removePatch(htmlPath);
      const choice = await vscode.window.showInformationMessage(
        'BiDi RTL: RTL patch removed. Restart VSCode to apply.',
        'Restart Now'
      );
      if (choice === 'Restart Now') {
        await vscode.commands.executeCommand('workbench.action.reloadWindow');
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      vscode.window.showErrorMessage(`BiDi RTL: Could not remove patch — ${msg}`);
    }
  });

  context.subscriptions.push(removeCmd);
}

export function deactivate(): void {}
