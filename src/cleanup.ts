import * as fs from 'fs';
import * as path from 'path';
import { FEATURES } from './features';
import { stripBlock, writeFileAtomic } from './patcher';

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

// Strips every block and deletes every asset this extension wrote into one
// install. Returns true if anything changed.
export async function cleanInstall(cssPath: string): Promise<boolean> {
  let changed = false;
  const content = await fs.promises.readFile(cssPath, 'utf8');
  let cleaned = content;
  for (const feature of FEATURES) {
    cleaned = stripBlock(cleaned, feature.markers);
  }
  if (cleaned !== content) {
    await writeFileAtomic(cssPath, cleaned);
    changed = true;
  }
  for (const feature of FEATURES) {
    for (const asset of feature.assets) {
      try {
        await fs.promises.unlink(path.join(path.dirname(cssPath), asset.target));
        changed = true;
      } catch {
        // not there
      }
    }
  }
  return changed;
}

export async function cleanupAll(extensionsRoot: string): Promise<number> {
  let count = 0;
  for (const cssPath of await findClaudeCodeCssPaths(extensionsRoot)) {
    try {
      if (await cleanInstall(cssPath)) {
        count++;
      }
    } catch {
      // one bad install must not stop the others
    }
  }
  return count;
}
