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
  '/* Auto-RTL for the Claude Code conversation panel.',
  '   Selectors use [class*="prefix_"] so the hash suffix (e.g. _07S1Yg) can',
  '   change between releases without breaking the patch. Technical/UI elements',
  '   (code, tool-use, buttons, inputs) are forced back to LTR. */',
  '',
  '/* Conversation + message containers: right-to-left, right-aligned. */',
  '[class*="chatContainer_"],',
  '[class*="messagesContainer_"],',
  '[class*="userMessageContainer_"],',
  '[class*="userMessage_"] {',
  '  direction: rtl;',
  '  text-align: right;',
  '}',
  '',
  '/* The message input itself. */',
  'textarea[aria-label="Message input"],',
  '[class*="inputContainer_"] {',
  '  direction: rtl;',
  '  text-align: right;',
  '}',
  '',
  '/* Keep technical content strictly LTR even inside an RTL container:',
  '   code blocks, tool-use blocks, and anything monospace/pre. */',
  '[class*="codeBlock"],',
  '[class*="toolUse_"],',
  '[class*="markdown_preview"] pre,',
  '[class*="markdown_preview"] code,',
  'pre, code, kbd, samp {',
  '  direction: ltr;',
  '  text-align: left;',
  '  unicode-bidi: isolate;',
  '}',
  '',
  '/* Buttons and icon controls should not inherit RTL flow. */',
  '[class*="chatContainer_"] button,',
  '[class*="messagesContainer_"] button {',
  '  direction: ltr;',
  '}',
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
