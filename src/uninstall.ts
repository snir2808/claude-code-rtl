import * as path from 'path';
import { cleanupAll } from './cleanup';

export async function main(extensionsRoot: string): Promise<number> {
  try {
    const count = await cleanupAll(extensionsRoot);
    console.log(`BiDi RTL & Theme: cleaned ${count} Claude Code install(s).`);
    return count;
  } catch (err: unknown) {
    console.log(`BiDi RTL & Theme: cleanup failed — ${err instanceof Error ? err.message : String(err)}`);
    return 0;
  }
}

// Run by `vscode:uninstall`; this file lives at <extensionsRoot>/<ext-dir>/out/uninstall.js.
if (require.main === module) {
  void main(path.resolve(__dirname, '..', '..'));
}
