import * as fs from 'fs';
import * as path from 'path';
import { CleanupResult, cleanCssFile, errorMessage } from './cleanup';
import { FeatureId } from './features';
import { SyncResult, syncCssFile } from './sync';

/** OpenAI's Codex extension ("Codex – OpenAI's coding agent"). */
export const CODEX_EXTENSION_ID = 'openai.chatgpt';

/** Codex installs are folders named openai.chatgpt-<version>[-<platform>] in the extensions folder. */
const CODEX_DIR_PREFIX = 'openai.chatgpt-';

/**
 * The href of the first <link rel="stylesheet"> in an HTML page, or null.
 * Attribute order and quoting vary, so each <link> tag is read attribute by
 * attribute.
 */
export function stylesheetHref(html: string): string | null {
  for (const [tag] of html.matchAll(/<link\b[^>]*>/gi)) {
    const attributes = new Map<string, string>();
    for (const m of tag.matchAll(/([\w-]+)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'>]+))/g)) {
      attributes.set(m[1].toLowerCase(), m[2] ?? m[3] ?? m[4]);
    }
    const rel = (attributes.get('rel') ?? '').toLowerCase().split(/\s+/);
    const href = attributes.get('href');
    if (rel.includes('stylesheet') && href) {
      return href;
    }
  }
  return null;
}

/**
 * A relative href as a file under `dir`, or null for a URL, a site-absolute
 * path, a malformed %-escape, or a path that leaves `dir`.
 */
function fileUnder(dir: string, href: string): string | null {
  if (/^[a-z][a-z\d+.-]*:/i.test(href) || href.startsWith('/') || href.startsWith('\\')) {
    return null;
  }
  let decoded: string;
  try {
    decoded = decodeURIComponent(href.split(/[?#]/)[0]);
  } catch {
    return null;
  }
  const file = path.resolve(dir, decoded);
  return file.startsWith(dir + path.sep) ? file : null;
}

/**
 * The stylesheet Codex's webview/index.html links first, as an absolute path.
 * Null when there is no such page or link, or the link points outside
 * webview/ or at a missing file: Codex has changed its layout. Codex reads
 * index.html, and so this stylesheet, each time it creates a webview.
 */
export async function findCodexCss(codexDir: string): Promise<string | null> {
  const webview = path.resolve(codexDir, 'webview');
  let html: string;
  try {
    html = await fs.promises.readFile(path.join(webview, 'index.html'), 'utf8');
  } catch {
    return null;
  }
  const href = stylesheetHref(html);
  const cssPath = href === null ? null : fileUnder(webview, href);
  if (cssPath === null) {
    return null;
  }
  try {
    await fs.promises.access(cssPath);
    return cssPath;
  } catch {
    return null;
  }
}

export interface CodexSyncResult extends SyncResult {
  /** The stylesheet that was synced. */
  cssPath: string;
}

/**
 * Brings the Codex install at codexDir in line with the enabled modules, with
 * the fonts next to its stylesheet. Resolves to null, writing nothing, when
 * Codex links no stylesheet this can find (see findCodexCss).
 */
export async function syncCodex(
  codexDir: string,
  extensionRoot: string,
  enabled: ReadonlySet<FeatureId>
): Promise<CodexSyncResult | null> {
  const cssPath = await findCodexCss(codexDir);
  if (cssPath === null) {
    return null;
  }
  return { cssPath, ...(await syncCssFile(cssPath, 'codex', extensionRoot, enabled)) };
}

/** Every Codex install in an extensions folder that links a stylesheet, symlinked installs included. */
async function findCodexInstalls(extensionsRoot: string): Promise<{ dir: string; cssPath: string }[]> {
  let entries: string[];
  try {
    entries = await fs.promises.readdir(extensionsRoot);
  } catch {
    return [];
  }
  const found: { dir: string; cssPath: string }[] = [];
  for (const entry of entries) {
    // Decide by name only (not Dirent type) so symlinked folders are included.
    if (!entry.toLowerCase().startsWith(CODEX_DIR_PREFIX)) {
      continue;
    }
    const dir = path.join(extensionsRoot, entry);
    const cssPath = await findCodexCss(dir);
    if (cssPath !== null) {
      found.push({ dir, cssPath });
    }
  }
  return found;
}

/** Strips both Codex blocks and their fonts from every Codex install in an extensions folder. */
export async function cleanupCodex(extensionsRoot: string): Promise<CleanupResult> {
  const result: CleanupResult = { cleaned: 0, failures: [] };
  for (const { dir, cssPath } of await findCodexInstalls(extensionsRoot)) {
    try {
      if (await cleanCssFile(cssPath, 'codex')) {
        result.cleaned++;
      }
    } catch (err: unknown) {
      // One bad install must not stop the others.
      result.failures.push(`${dir}: ${errorMessage(err)}`);
    }
  }
  return result;
}
