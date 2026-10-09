import * as fs from 'fs';

// Hash-stable selectors: Claude Code's class names carry a build hash suffix
// (e.g. messagesContainer_07S1Yg), so everything is matched by
// [class*="prefix_"]. The chat input is matched by role + aria-label.
const CSS_PATCH = [
  '/* bidi-rtl-patch-start */',
  '/* Input: RTL base direction. unicode-bidi is intentionally NOT set so',
  '   Claude Code\'s native `plaintext` on the input keeps working. */',
  '[role="textbox"][aria-label="Message input"],',
  '[class*="mentionMirror_"]{',
  'direction:rtl;',
  'text-align:start;',
  '}',
  '/* Conversation: RTL container. text-align:start (not right) lets Claude',
  '   Code\'s per-paragraph unicode-bidi:plaintext put Hebrew paragraphs on the',
  '   right and English ones on the left. */',
  '[class*="messagesContainer_"]{',
  'direction:rtl;',
  'text-align:start;',
  'unicode-bidi:isolate;',
  '}',
  '[class*="messagesContainer_"] [class*="userMessage_"]{',
  'unicode-bidi:plaintext;',
  'text-align:start;',
  '}',
  '/* Markdown lists are class-less; Claude Code UI lists (todos, tool calls)',
  '   always have classes, so :not([class]) targets only message lists. */',
  '[class*="messagesContainer_"] ol:not([class]),',
  '[class*="messagesContainer_"] ul:not([class]){',
  'padding-inline:1em;',
  '}',
  '/* Inside markers + unicode-bidi:normal make each marker follow its item\'s language. */',
  '[class*="messagesContainer_"] ol:not([class])>li:not([class]),',
  '[class*="messagesContainer_"] ul:not([class])>li:not([class]){',
  'list-style-position:inside;',
  '}',
  '[class*="messagesContainer_"] ol:not([class])>li:not([class])::marker,',
  '[class*="messagesContainer_"] ul:not([class])>li:not([class])::marker{',
  'unicode-bidi:normal;',
  '}',
  '[class*="messagesContainer_"] ul:not([class])>li:not([class])::marker{',
  'content:"\\2022  ";',
  '}',
  '/* Buttons, tool blocks, editors and code stay LTR. */',
  '[class*="messagesContainer_"] [class*="button_"],',
  '[class*="messagesContainer_"] [class*="sendButton_"],',
  '[class*="messagesContainer_"] [class*="toolUse_"],',
  '[class*="messagesContainer_"] [class*="toolResult_"],',
  '[class*="messagesContainer_"] [class*="toolReference_"],',
  '[class*="messagesContainer_"] [class*="diffEditor"],',
  '[class*="messagesContainer_"] [class*="codeInput_"],',
  '[class*="messagesContainer_"] [class*="editorMode_"],',
  '[class*="messagesContainer_"] [class*="editing_"],',
  '[class*="messagesContainer_"] pre,',
  '[class*="messagesContainer_"] code{',
  'direction:ltr;',
  'text-align:left;',
  'unicode-bidi:isolate;',
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
    /\n?\/\* bidi-rtl-patch-start \*\/[\s\S]*?\/\* bidi-rtl-patch-end \*\//g,
    ''
  );
}

// Write to a temp file in the same directory, then rename over the target, so
// a concurrent reader never sees a truncated file.
async function writeFileAtomic(cssPath: string, content: string): Promise<void> {
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
