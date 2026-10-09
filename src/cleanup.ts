import * as fs from 'fs';
import * as path from 'path';
import { removeCssPatch } from './patcher';

const CLAUDE_DIR_PREFIX = 'anthropic.claude-code-';

export async function findClaudeCodeCssPaths(extensionsRoot: string): Promise<string[]> {
  let entries: string[];
  try {
    entries = await fs.promises.readdir(extensionsRoot);
  } catch {
    return [];
  }

  const found: string[] = [];
  for (const entry of entries) {
    // Decide by name only (not Dirent type) so symlinked folders are included.
    if (!entry.toLowerCase().startsWith(CLAUDE_DIR_PREFIX)) {
      continue;
    }
    const cssPath = path.join(extensionsRoot, entry, 'webview', 'index.css');
    try {
      await fs.promises.access(cssPath);
      found.push(cssPath);
    } catch {
      // no webview CSS in this folder
    }
  }
  return found;
}

export async function removePatchFromAll(extensionsRoot: string): Promise<number> {
  let count = 0;
  for (const cssPath of await findClaudeCodeCssPaths(extensionsRoot)) {
    try {
      if (await removeCssPatch(cssPath)) {
        count++;
      }
    } catch {
      // one bad file must not stop the others
    }
  }
  return count;
}
