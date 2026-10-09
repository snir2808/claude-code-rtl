import * as path from 'path';
import { removePatchFromAll } from './cleanup';

export async function main(extensionsRoot: string): Promise<number> {
  try {
    const count = await removePatchFromAll(extensionsRoot);
    console.log(`BiDi RTL: removed RTL patch from ${count} Claude Code install(s).`);
    return count;
  } catch (err: unknown) {
    console.log(`BiDi RTL: cleanup failed — ${err instanceof Error ? err.message : String(err)}`);
    return 0;
  }
}

// Run by `vscode:uninstall`; this file lives at <extensionsRoot>/<ext-dir>/out/uninstall.js.
if (require.main === module) {
  void main(path.resolve(__dirname, '..', '..'));
}
