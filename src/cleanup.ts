import * as fs from 'fs';
import * as path from 'path';
import { FEATURES } from './features';
import { stripBlock, writeFileAtomic } from './blocks';

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
// install. Returns true if anything changed. An asset that is already gone is
// fine; any other failure is thrown once every asset has been tried.
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
  const failures: string[] = [];
  for (const feature of FEATURES) {
    for (const asset of feature.assets) {
      try {
        await fs.promises.unlink(path.join(path.dirname(cssPath), asset.target));
        changed = true;
      } catch (err: unknown) {
        if ((err as NodeJS.ErrnoException | undefined)?.code !== 'ENOENT') {
          failures.push(`${asset.target}: ${errorMessage(err)}`);
        }
      }
    }
  }
  if (failures.length > 0) {
    throw new Error(`could not delete ${failures.join('; ')}`);
  }
  return changed;
}

export interface CleanupResult {
  /** Installs that had a block or an asset removed. */
  cleaned: number;
  /** One line per install that could not be cleaned completely: its folder and the error. */
  failures: string[];
}

export async function cleanupAll(extensionsRoot: string): Promise<CleanupResult> {
  const result: CleanupResult = { cleaned: 0, failures: [] };
  for (const cssPath of await findClaudeCodeCssPaths(extensionsRoot)) {
    try {
      if (await cleanInstall(cssPath)) {
        result.cleaned++;
      }
    } catch (err: unknown) {
      // One bad install must not stop the others.
      result.failures.push(`${path.dirname(path.dirname(cssPath))}: ${errorMessage(err)}`);
    }
  }
  return result;
}

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}
