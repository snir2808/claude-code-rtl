import * as path from 'path';
import { cleanupAll } from './cleanup';

export async function main(extensionsRoot: string): Promise<number> {
  try {
    const { cleaned, failures } = await cleanupAll(extensionsRoot);
    const notCleaned = failures.length > 0 ? `; ${failures.length} could not be cleaned` : '';
    console.log(`BiDi RTL & Theme: cleaned ${cleaned} Claude Code install(s)${notCleaned}.`);
    for (const failure of failures) {
      console.log(`BiDi RTL & Theme: could not clean ${failure}`);
    }
    return cleaned;
  } catch (err: unknown) {
    console.log(`BiDi RTL & Theme: cleanup failed — ${err instanceof Error ? err.message : String(err)}`);
    return 0;
  }
}

// Run by `vscode:uninstall`; this file lives at <extensionsRoot>/<ext-dir>/out/uninstall.js.
if (require.main === module) {
  void main(path.resolve(__dirname, '..', '..'));
}
