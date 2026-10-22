import * as path from 'path';
import { cleanupAll } from './cleanup';
import { cleanWorkbench, findAppRoot } from './workbench';

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

async function cleanClaudeCode(extensionsRoot: string): Promise<number> {
  try {
    const { cleaned, failures } = await cleanupAll(extensionsRoot);
    const notCleaned = failures.length > 0 ? `; ${failures.length} could not be cleaned` : '';
    console.log(`BiDi RTL & Theme: cleaned ${cleaned} Claude Code install(s)${notCleaned}.`);
    for (const failure of failures) {
      console.log(`BiDi RTL & Theme: could not clean ${failure}`);
    }
    return cleaned;
  } catch (err: unknown) {
    console.log(`BiDi RTL & Theme: cleanup failed — ${errorMessage(err)}`);
    return 0;
  }
}

// Only the VS Code this hook runs under: another copy of VS Code that shares
// the extensions folder keeps its patch until its next update or a toggle.
async function cleanChat(execPath: string): Promise<void> {
  try {
    const appRoot = await findAppRoot(execPath);
    if (appRoot && (await cleanWorkbench(appRoot))) {
      console.log(`BiDi RTL & Theme: cleaned VS Code's chat CSS in ${appRoot}.`);
    }
  } catch (err: unknown) {
    console.log(`BiDi RTL & Theme: could not clean VS Code's chat CSS — ${errorMessage(err)}`);
  }
}

/** Returns how many Claude Code installs were cleaned. */
export async function main(extensionsRoot: string, execPath: string): Promise<number> {
  const cleaned = await cleanClaudeCode(extensionsRoot);
  await cleanChat(execPath);
  return cleaned;
}

// Run by `vscode:uninstall` under VS Code's own executable (or a helper inside
// it); this file lives at <extensionsRoot>/<ext-dir>/out/uninstall.js.
if (require.main === module) {
  void main(path.resolve(__dirname, '..', '..'), process.execPath);
}
