import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

const PATCH_BLOCK = [
  '<!-- bidi-rtl-patch-start -->',
  '<style id="bidi-rtl-styles">',
  '  .part.sidebar .composite.viewlet { direction: rtl; }',
  '  .pane-header, .title-label { text-align: right; }',
  '  .webview iframe { direction: rtl; }',
  '</style>',
  '<script id="bidi-rtl-script">',
  '(function() {',
  "  const s = document.createElement('style');",
  "  s.textContent = '* { direction: rtl !important; text-align: right !important; }';",
  '  const observer = new MutationObserver(() => {',
  "    document.querySelectorAll('iframe').forEach(f => {",
  "      try { f.contentDocument.head.appendChild(s.cloneNode(true)); } catch(e) { /* cross-origin iframe, skip */ }",
  '    });',
  '  });',
  '  observer.observe(document.body, { childList: true, subtree: true });',
  '})();',
  '</script>',
  '<!-- bidi-rtl-patch-end -->',
].join('\n');

export function isPatched(content: string): boolean {
  return content.includes('<!-- bidi-rtl-patch-start -->');
}

export function applyPatchToContent(content: string): string {
  if (isPatched(content)) {
    return content;
  }
  if (!content.includes('</head>')) {
    throw new Error('applyPatchToContent: no </head> tag found in content');
  }
  return content.replace('</head>', PATCH_BLOCK + '\n</head>');
}

export function removePatchFromContent(content: string): string {
  return content.replace(
    /<!-- bidi-rtl-patch-start -->[\s\S]*?<!-- bidi-rtl-patch-end -->\n?/,
    ''
  );
}

export function buildWorkbenchHtmlPath(execPath: string, platform: string): string {
  const appDir = platform === 'darwin'
    ? path.join(path.dirname(execPath), '..', 'Resources', 'app')
    : path.join(path.dirname(execPath), 'resources', 'app');
  return path.join(appDir, 'out', 'vs', 'workbench', 'workbench.desktop.main.html');
}

export function getWorkbenchHtmlPath(): string {
  return buildWorkbenchHtmlPath(process.execPath, os.platform());
}

export async function applyPatch(htmlPath: string): Promise<boolean> {
  const content = await fs.promises.readFile(htmlPath, 'utf8');
  if (isPatched(content)) {
    return false;
  }
  await fs.promises.writeFile(htmlPath, applyPatchToContent(content), 'utf8');
  return true;
}

export async function removePatch(htmlPath: string): Promise<boolean> {
  const content = await fs.promises.readFile(htmlPath, 'utf8');
  if (!isPatched(content)) {
    return false;
  }
  await fs.promises.writeFile(htmlPath, removePatchFromContent(content), 'utf8');
  return true;
}

// --- Claude Code CSS patching ---

const CSS_PATCH = [
  '/* bidi-rtl-patch-start */',
  'body,#root{direction:rtl;unicode-bidi:embed}',
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
  if (isCssPatched(content)) {
    return false;
  }
  await fs.promises.writeFile(cssPath, applyCssPatchToContent(content), 'utf8');
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
