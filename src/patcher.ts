import * as fs from 'fs';

// Hash-stable selectors:
// - chat input: identified by role + aria-label (no hashed class needed)
// - messages list: matched by [class*="messagesContainer_"] prefix so the
//   hash suffix (e.g. _07S1Yg) can change between Claude Code releases
//   without breaking the patch.
//
// LTR exclusions: buttons, code blocks, and tool-use blocks must stay LTR
// even inside the RTL container — these are technical/UI elements, not
// natural-language text.
const CSS_PATCH = [
  '/* bidi-rtl-patch-start */',
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
    /\n?\/\* bidi-rtl-patch-start \*\/[\s\S]*?\/\* bidi-rtl-patch-end \*\//,
    ''
  );
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
  await fs.promises.writeFile(cssPath, patched, 'utf8');
  return true;
}

export async function removeCssPatch(cssPath: string): Promise<boolean> {
  const content = await fs.promises.readFile(cssPath, 'utf8');
  if (!isCssPatched(content)) {
    return false;
  }
  await fs.promises.writeFile(cssPath, removeCssPatchFromContent(content), 'utf8');
  return true;
}
