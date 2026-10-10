import * as crypto from 'crypto';
import * as fs from 'fs';
import * as path from 'path';
import { FEATURES, Feature, FeatureId } from './features';
import { appendBlock, stripBlock, writeFileAtomic } from './blocks';

export type BlockBodies = Readonly<Record<FeatureId, string>>;

/** Strips every known block, then appends the enabled ones in canonical order. */
export function computeSyncedCss(
  content: string,
  enabled: ReadonlySet<FeatureId>,
  bodies: BlockBodies
): string {
  let result = content;
  for (const feature of FEATURES) {
    result = stripBlock(result, feature.markers);
  }
  for (const feature of FEATURES) {
    if (enabled.has(feature.id)) {
      result = appendBlock(result, feature.markers, bodies[feature.id]);
    }
  }
  return result;
}

export async function loadBlockBodies(extensionRoot: string): Promise<BlockBodies> {
  const entries = await Promise.all(
    FEATURES.map(async (feature) => {
      const body = await fs.promises.readFile(path.join(extensionRoot, feature.cssFile), 'utf8');
      return [feature.id, body] as const;
    })
  );
  return Object.fromEntries(entries) as Record<FeatureId, string>;
}

export interface SyncResult {
  /** True when index.css was rewritten. */
  cssChanged: boolean;
  /** Font copy/delete failures, each starting with the file name. They never stop the sync. */
  assetErrors: string[];
}

async function sha256(file: string): Promise<string> {
  return crypto.createHash('sha256').update(await fs.promises.readFile(file)).digest('hex');
}

async function sameFile(a: string, b: string): Promise<boolean> {
  try {
    const [statA, statB] = await Promise.all([fs.promises.stat(a), fs.promises.stat(b)]);
    return statA.size === statB.size && (await sha256(a)) === (await sha256(b));
  } catch {
    return false;
  }
}

/**
 * Copies each asset of the given features (when missing or different), or
 * deletes it, into Claude Code's webview folder. Returns the failures.
 */
async function syncAssets(
  webviewDir: string,
  extensionRoot: string,
  features: readonly Feature[],
  action: 'copy' | 'delete'
): Promise<string[]> {
  const errors: string[] = [];
  for (const feature of features) {
    for (const asset of feature.assets) {
      const source = path.join(extensionRoot, asset.source);
      const target = path.join(webviewDir, asset.target);
      try {
        if (action === 'delete') {
          await fs.promises.rm(target, { force: true });
        } else if (!(await sameFile(source, target))) {
          await fs.promises.copyFile(source, target);
        }
      } catch (err: unknown) {
        errors.push(`${asset.target}: ${err instanceof Error ? err.message : String(err)}`);
      }
    }
  }
  return errors;
}

/**
 * Brings one Claude Code install in line with the enabled features. Fonts of
 * enabled blocks are copied before the CSS is written and fonts of disabled
 * blocks are deleted after it, so the CSS never points at a font this sync
 * has yet to copy or has already deleted, even when the write fails. A font
 * that fails to copy is reported in assetErrors.
 */
export async function syncInstall(
  claudeCodeDir: string,
  extensionRoot: string,
  enabled: ReadonlySet<FeatureId>
): Promise<SyncResult> {
  const webviewDir = path.join(claudeCodeDir, 'webview');
  const cssPath = path.join(webviewDir, 'index.css');
  const content = await fs.promises.readFile(cssPath, 'utf8');
  const next = computeSyncedCss(content, enabled, await loadBlockBodies(extensionRoot));
  const on = FEATURES.filter((feature) => enabled.has(feature.id));
  const off = FEATURES.filter((feature) => !enabled.has(feature.id));
  const assetErrors = await syncAssets(webviewDir, extensionRoot, on, 'copy');
  const cssChanged = next !== content;
  if (cssChanged) {
    await writeFileAtomic(cssPath, next);
  }
  assetErrors.push(...(await syncAssets(webviewDir, extensionRoot, off, 'delete')));
  return { cssChanged, assetErrors };
}
