import * as fs from 'fs';

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
