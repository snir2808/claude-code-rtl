import * as fs from 'fs';
import * as path from 'path';

/** Start/end comments that delimit one block appended to Claude Code's CSS. */
export interface BlockMarkers {
  readonly start: string;
  readonly end: string;
}

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// Removes every copy of the block, plus the newline appendBlock put before it.
export function stripBlock(content: string, markers: BlockMarkers): string {
  const pattern = new RegExp(
    `\\n?${escapeRegExp(markers.start)}[\\s\\S]*?${escapeRegExp(markers.end)}`,
    'g'
  );
  return content.replace(pattern, '');
}

export function appendBlock(content: string, markers: BlockMarkers, body: string): string {
  return `${content}\n${markers.start}\n${body.trim()}\n${markers.end}`;
}

// The RTL block body lives in css/rtl.css, next to out/ in the packaged extension.
const CSS_PATCH = [
  '/* bidi-rtl-patch-start */',
  fs.readFileSync(path.join(__dirname, '..', 'css', 'rtl.css'), 'utf8').trim(),
  '/* bidi-rtl-patch-end */',
].join('\n');

export function isCssPatched(content: string): boolean {
  return content.includes('/* bidi-rtl-patch-start */');
}

export function applyCssPatchToContent(content: string): string {
  if (isCssPatched(content)) {
    return content;
  }
  return content + '\n' + CSS_PATCH;
}

export function removeCssPatchFromContent(content: string): string {
  return content.replace(
    /\n?\/\* bidi-rtl-patch-start \*\/[\s\S]*?\/\* bidi-rtl-patch-end \*\//g,
    ''
  );
}

// Write to a temp file in the same directory, then rename over the target, so
// a concurrent reader never sees a truncated file.
export async function writeFileAtomic(cssPath: string, content: string): Promise<void> {
  const tmpPath = `${cssPath}.bidi-rtl-tmp-${process.pid}`;
  try {
    const { mode } = await fs.promises.stat(cssPath);
    await fs.promises.writeFile(tmpPath, content, { encoding: 'utf8', mode });
    await fs.promises.rename(tmpPath, cssPath);
  } catch (err) {
    await fs.promises.unlink(tmpPath).catch(() => {});
    throw err;
  }
}

export async function applyCssPatch(cssPath: string): Promise<boolean> {
  const content = await fs.promises.readFile(cssPath, 'utf8');
  // Always replace any existing patch — old versions used different selectors,
  // so checking only for the marker would skip migration to the new patch.
  const cleaned = removeCssPatchFromContent(content);
  const patched = applyCssPatchToContent(cleaned);
  if (patched === content) {
    return false;
  }
  await writeFileAtomic(cssPath, patched);
  return true;
}

export async function removeCssPatch(cssPath: string): Promise<boolean> {
  const content = await fs.promises.readFile(cssPath, 'utf8');
  if (!isCssPatched(content)) {
    return false;
  }
  await writeFileAtomic(cssPath, removeCssPatchFromContent(content));
  return true;
}
