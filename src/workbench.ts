import * as fs from 'fs';
import * as path from 'path';
import { updateChecksum } from './checksum';
import { cleanCssFile } from './cleanup';
import { FeatureId } from './features';
import { SyncResult, syncCssFile } from './sync';

/**
 * VS Code's workbench stylesheet, which styles the built-in chat that Copilot
 * runs in, as a path under <appRoot>/out: its key in product.json's checksums.
 */
export const WORKBENCH_CSS = 'vs/workbench/workbench.desktop.main.css';

export function workbenchCssPath(appRoot: string): string {
  return path.join(appRoot, 'out', ...WORKBENCH_CSS.split('/'));
}

export interface WorkbenchSyncResult extends SyncResult {
  /** Why product.json's checksum could not be updated, or null. The blocks apply either way. */
  checksumError: string | null;
}

async function exists(file: string): Promise<boolean> {
  try {
    await fs.promises.access(file);
    return true;
  } catch {
    return false;
  }
}

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

/**
 * Brings the workbench CSS of the VS Code at `appRoot` in line with the
 * enabled modules, then sets its checksum in product.json so VS Code does not
 * call the installation corrupt. Resolves to null when there is no workbench
 * CSS there (VS Code for the Web, or a remote extension host).
 */
export async function syncWorkbench(
  appRoot: string,
  extensionRoot: string,
  enabled: ReadonlySet<FeatureId>
): Promise<WorkbenchSyncResult | null> {
  const cssPath = workbenchCssPath(appRoot);
  if (!path.isAbsolute(appRoot) || !(await exists(cssPath))) {
    return null;
  }
  const result = await syncCssFile(cssPath, 'workbench', extensionRoot, enabled);
  let checksumError: string | null = null;
  try {
    await updateChecksum(appRoot, WORKBENCH_CSS);
  } catch (err: unknown) {
    checksumError = errorMessage(err);
  }
  return { ...result, checksumError };
}

/**
 * Removes this extension's blocks and fonts from the workbench CSS at
 * `appRoot` and restores its checksum. Resolves to false when there was
 * nothing to remove or no workbench CSS.
 */
export async function cleanWorkbench(appRoot: string): Promise<boolean> {
  const cssPath = workbenchCssPath(appRoot);
  if (!(await exists(cssPath))) {
    return false;
  }
  try {
    return await cleanCssFile(cssPath, 'workbench');
  } finally {
    // Also when a font could not be deleted: the CSS has changed by then.
    await updateChecksum(appRoot, WORKBENCH_CSS);
  }
}

/**
 * The appRoot of the VS Code that `execPath` belongs to: the nearest
 * <folder>/Resources/app (macOS) or <folder>/resources/app (Windows, Linux)
 * above it that holds a workbench CSS. The uninstall hook runs under VS
 * Code's own executable or one of its helpers, all inside the installation.
 * Folder names come from the disk, so the result has their real case.
 */
export async function findAppRoot(execPath: string): Promise<string | null> {
  let dir = path.dirname(execPath);
  for (;;) {
    let names: string[] = [];
    try {
      names = await fs.promises.readdir(dir);
    } catch {
      // missing or unreadable: keep looking further up
    }
    for (const name of names.filter((n) => n.toLowerCase() === 'resources')) {
      const appRoot = path.join(dir, name, 'app');
      if (await exists(workbenchCssPath(appRoot))) {
        return appRoot;
      }
    }
    const parent = path.dirname(dir);
    if (parent === dir) {
      return null;
    }
    dir = parent;
  }
}
