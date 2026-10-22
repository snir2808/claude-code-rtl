import * as crypto from 'crypto';
import * as fs from 'fs';
import * as path from 'path';
import { escapeRegExp, writeFileAtomic } from './blocks';

/**
 * VS Code checks its own files against `checksums` in product.json and says
 * the installation is corrupt when one differs. The keys are paths under
 * <appRoot>/out; the values are base64 SHA-256 digests without '=' padding.
 */
export function computeChecksum(content: string | Buffer): string {
  return crypto.createHash('sha256').update(content).digest('base64').replace(/=+$/, '');
}

/**
 * product.json with the checksum of `file` set to `checksum`, changing only
 * the characters of that one value; null when product.json lists no checksum
 * for `file`. Throws when the entry is not written as one `"file": "value"`
 * pair, so a file this cannot edit exactly is left alone.
 */
export function replaceChecksum(productJson: string, file: string, checksum: string): string | null {
  const product = JSON.parse(productJson) as { checksums?: Record<string, unknown> };
  const current = product.checksums?.[file];
  if (typeof current !== 'string') {
    return null;
  }
  if (current === checksum) {
    return productJson;
  }
  const entry = new RegExp(
    `(${escapeRegExp(JSON.stringify(file))}\\s*:\\s*)${escapeRegExp(JSON.stringify(current))}`,
    'g'
  );
  const count = productJson.match(entry)?.length ?? 0;
  if (count !== 1) {
    throw new Error(`expected one checksum entry for ${file} in product.json, found ${count}`);
  }
  return productJson.replace(entry, (_match, key: string) => key + JSON.stringify(checksum));
}

/**
 * Sets product.json's checksum for `file` to the checksum of that file as it
 * is now. Resolves to true when product.json was rewritten.
 */
export async function updateChecksum(appRoot: string, file: string): Promise<boolean> {
  const productPath = path.join(appRoot, 'product.json');
  const [content, productJson] = await Promise.all([
    fs.promises.readFile(path.join(appRoot, 'out', ...file.split('/'))),
    fs.promises.readFile(productPath, 'utf8'),
  ]);
  const next = replaceChecksum(productJson, file, computeChecksum(content));
  if (next === null || next === productJson) {
    return false;
  }
  await writeFileAtomic(productPath, next);
  return true;
}
