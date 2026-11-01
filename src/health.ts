import * as fs from 'fs';
import * as path from 'path';
import { escapeRegExp, stripBlock } from './blocks';
import { FEATURES } from './features';
import { workbenchCssPath } from './workbench';

/**
 * Class-name prefixes the blocks rely on; each must still appear as
 * `.prefix…` in index.css. Every [class*="…_"] prefix in css/theme.css is
 * here (src/test/theme-css.test.ts checks that), plus what the blocks reach
 * without naming it (turn_ holds each conversation turn's rows,
 * inputContainerBackground_ paints the composer's rounded corners) and
 * toolUse_ and thinkingSummary_, which css/rtl.css keeps left-to-right.
 */
export const REQUIRED_CLASS_PREFIXES: readonly string[] = [
  'messagesContainer_',
  'turn_',
  'timelineMessage_',
  'userMessage_',
  'root_',
  'toolUse_',
  'thinkingSummary_',
  'toolNameText_',
  'codeBlockWrapper_',
  'chatContainer_',
  'inputContainer_',
  'inputWrapper_',
  'permissionsContainer_',
  'inputContainerBackground_',
  'inputFooter_',
  'footerButton_',
  'footerButtonPrimary_',
  'footerButtonStatic_',
  'usageButtonV2_',
  'pill_',
  'modelPill_',
  'modelPillRow_',
  'menuButton_',
  'spacer_',
  'sendButton_',
];

/**
 * Text the blocks' attribute selectors depend on, looked up in index.js: the
 * attribute values css/theme.css matches (src/test/theme-css.test.ts checks
 * the coverage) and the input's aria-label, which css/rtl.css matches.
 */
export const REQUIRED_JS_HOOKS: readonly string[] = [
  'assistant-message',
  'Claude, ',
  'Message input',
  'data-cache-window',
  'title:"Add"',
  'combobox',
  'type:"submit"',
  'data-permission-mode',
  'bypassPermissions',
];

/** Claude Code defines its design tokens as `html{--app-…}`; a file without them is damaged. */
export const TOKEN_BLOCK_MARKER = 'html{--app-';

export interface HealthReport {
  /** Files under webview/ that could not be read; nothing in them was checked. */
  unreadableFiles: string[];
  damaged: boolean;
  missingClassPrefixes: string[];
  missingJsHooks: string[];
}

/** Checks the contents of index.css and index.js; null stands for a file that could not be read. */
export function checkHealth(css: string | null, js: string | null): HealthReport {
  const unreadableFiles: string[] = [];
  if (css === null) {
    unreadableFiles.push('index.css');
  }
  if (js === null) {
    unreadableFiles.push('index.js');
  }
  return {
    unreadableFiles,
    damaged: css !== null && !css.includes(TOKEN_BLOCK_MARKER),
    missingClassPrefixes: css === null ? [] : REQUIRED_CLASS_PREFIXES.filter((p) => !css.includes(`.${p}`)),
    missingJsHooks: js === null ? [] : REQUIRED_JS_HOOKS.filter((h) => !js.includes(h)),
  };
}

export function isHealthy(report: HealthReport): boolean {
  return (
    report.unreadableFiles.length === 0 &&
    !report.damaged &&
    report.missingClassPrefixes.length === 0 &&
    report.missingJsHooks.length === 0
  );
}

/**
 * Never rejects: a file that cannot be read is part of the report, since a
 * moved or renamed file is the kind of change this check exists to catch.
 */
export async function checkInstallHealth(claudeCodeDir: string): Promise<HealthReport> {
  const webviewDir = path.join(claudeCodeDir, 'webview');
  const read = (name: string): Promise<string | null> =>
    fs.promises.readFile(path.join(webviewDir, name), 'utf8').catch(() => null);
  const [css, js] = await Promise.all([read('index.css'), read('index.js')]);
  return checkHealth(css, js);
}

/** The warning for an unhealthy install; empty for a healthy one. */
export function formatHealthWarning(version: string, report: HealthReport): string {
  if (isHealthy(report)) {
    return '';
  }
  if (report.damaged) {
    return `BiDi Theme: Claude Code ${version} has a damaged webview/index.css ` +
      '(its design tokens are missing), or Claude Code changed its stylesheet format. ' +
      'Reinstall Claude Code to rule out damage.';
  }
  const details: string[] = [];
  if (report.unreadableFiles.length > 0) {
    details.push(`Could not read: ${report.unreadableFiles.map((f) => `webview/${f}`).join(', ')}.`);
  }
  const missing = [...report.missingClassPrefixes, ...report.missingJsHooks.map((h) => `"${h}"`)];
  if (missing.length > 0) {
    details.push(`Missing: ${missing.join(', ')}.`);
  }
  const changed = report.unreadableFiles.length > 0 ? 'its webview files' : 'its markup';
  return `BiDi Theme: Claude Code ${version} changed ${changed}, so parts of the theme may not apply. ` +
    details.join(' ');
}

/**
 * Class names the Copilot chat blocks rely on; each must still appear as
 * `.name` in VS Code's workbench CSS, without this extension's blocks. Every
 * class css/copilot-theme.css and css/copilot-rtl.css name is here, and
 * nothing else (src/test/copilot-css.test.ts checks that).
 */
export const REQUIRED_CHAT_CLASSES: readonly string[] = [
  // the scope: dark themes, the chat view or editor tab, not inline chat
  'monaco-workbench',
  'vs-dark',
  'chat-viewpane',
  'editor-instance',
  'interactive-session',
  'chat-widget',
  // the conversation
  'interactive-list',
  'interactive-item-container',
  'interactive-request',
  'interactive-response',
  'value',
  'rendered-markdown',
  'interactive-result-code-block',
  'chat-inline-anchor-widget',
  'chat-codeblock-pill-container',
  // activity
  'chat-used-context',
  'chat-used-context-label',
  'chat-tool-invocation-part',
  'chat-terminal-content-part',
  'progress-container',
  // the composer
  'interactive-input-part',
  'chat-input-container',
  'chat-input-toolbars',
  'chat-input-toolbar',
  'chat-execute-toolbar',
  'chat-secondary-toolbar',
  'monaco-action-bar',
  'actions-container',
  'action-item',
  'action-label',
  'menu-entry',
  'codicon',
  'chat-input-picker-item',
  'chat-input-picker-split',
  'chat-input-picker-split-button',
  'chat-submit-button',
  'chat-editor-container',
  'view-line',
];

export interface WorkbenchHealthReport {
  /** The workbench CSS could not be read; nothing in it was checked. */
  unreadable: boolean;
  missingClasses: string[];
}

/**
 * Checks VS Code's workbench CSS, given without this extension's blocks (they
 * name the same classes); null stands for a file that could not be read.
 */
export function checkWorkbenchHealth(css: string | null): WorkbenchHealthReport {
  if (css === null) {
    return { unreadable: true, missingClasses: [] };
  }
  return {
    unreadable: false,
    missingClasses: REQUIRED_CHAT_CLASSES.filter((name) => !new RegExp(`\\.${escapeRegExp(name)}(?![\\w-])`).test(css)),
  };
}

export function isWorkbenchHealthy(report: WorkbenchHealthReport): boolean {
  return !report.unreadable && report.missingClasses.length === 0;
}

/** Never rejects. Reads the workbench CSS at appRoot and checks it without this extension's blocks. */
export async function checkWorkbenchInstallHealth(appRoot: string): Promise<WorkbenchHealthReport> {
  const css = await fs.promises.readFile(workbenchCssPath(appRoot), 'utf8').catch(() => null);
  if (css === null) {
    return checkWorkbenchHealth(null);
  }
  let pristine = css;
  for (const feature of FEATURES) {
    pristine = stripBlock(pristine, feature.blocks.workbench.markers);
  }
  return checkWorkbenchHealth(pristine);
}

/** The warning for an unhealthy workbench CSS; empty for a healthy one. */
export function formatWorkbenchHealthWarning(version: string, report: WorkbenchHealthReport): string {
  if (isWorkbenchHealthy(report)) {
    return '';
  }
  if (report.unreadable) {
    return `BiDi Theme: could not read the workbench CSS of VS Code ${version}, so the Copilot chat theme was not checked.`;
  }
  return `BiDi Theme: VS Code ${version} changed its chat markup, so parts of the Copilot chat theme may not apply. ` +
    `Missing: ${report.missingClasses.map((name) => `.${name}`).join(', ')}.`;
}

/**
 * What the Codex blocks rely on in Codex's own CSS (every webview/assets/*.css
 * file, without this extension's blocks): CSS-module prefixes ("._Name_"),
 * classes (".name"), attributes ("[name") and Codex's custom properties
 * ("--name"), set or read. Exactly the hooks css/codex-theme.css and
 * css/codex-rtl.css use (src/test/codex-css.test.ts checks that). VS Code's
 * --vscode-* colors are VS Code's, so they are not listed.
 */
export const REQUIRED_CODEX_HOOKS: readonly string[] = [
  // the markdown of your messages and Codex's answers
  '._MarkdownRoot_',
  '._Paragraph_',
  '._Heading_',
  '._ListItem_',
  '._UnorderedList_',
  '._Blockquote_',
  '._InlineCode_',
  '--markdown-font-size',
  '--markdown-line-height',
  // your messages
  '.bg-user-message',
  '._bubble_',
  '--color-background-user-message',
  '--color-text-user-message',
  // the composer and its send button
  '._ComposerLayoutRoot_',
  '._RichTextInput_',
  '.ProseMirror',
  '[data-composer-surface-variant',
  '--composer-border-radius',
  '--composer-layout-surface-shadow',
  '--color-background-composer-primary',
  '--color-text-composer-primary',
  // fonts and the palette
  '[data-theme',
  '--font-ui-family',
  '--codex-chat-font-size-override',
  '--app-color-border',
  '--app-color-text-secondary',
];

export interface CodexHealthReport {
  /** Codex's stylesheets could not be read; nothing in them was checked. */
  unreadable: boolean;
  missingHooks: string[];
}

/** A hook as a pattern: a module prefix or an attribute may go on, a class or a property may not. */
function codexHookPattern(hook: string): RegExp {
  const open = hook.endsWith('_') || hook.startsWith('[');
  return new RegExp(escapeRegExp(hook) + (open ? '' : '(?![\\w-])'));
}

/**
 * Checks Codex's CSS, every file together and without this extension's
 * blocks; null stands for files that could not be read.
 */
export function checkCodexHealth(css: string | null): CodexHealthReport {
  if (css === null) {
    return { unreadable: true, missingHooks: [] };
  }
  return { unreadable: false, missingHooks: REQUIRED_CODEX_HOOKS.filter((hook) => !codexHookPattern(hook).test(css)) };
}

export function isCodexHealthy(report: CodexHealthReport): boolean {
  return !report.unreadable && report.missingHooks.length === 0;
}

/**
 * Never rejects. Reads every CSS file next to Codex's stylesheet (Codex loads
 * the conversation's CSS modules from the same folder, about 3 MB in all) and
 * checks them without this extension's blocks.
 */
export async function checkCodexInstallHealth(cssPath: string): Promise<CodexHealthReport> {
  const dir = path.dirname(cssPath);
  let css: string;
  try {
    const names = (await fs.promises.readdir(dir)).filter((name) => name.endsWith('.css'));
    const parts: string[] = [];
    // One file at a time: Codex ships about 470 stylesheets, more than a low open-files limit.
    for (const name of names) {
      parts.push(await fs.promises.readFile(path.join(dir, name), 'utf8'));
    }
    css = parts.join('\n');
  } catch {
    return checkCodexHealth(null);
  }
  for (const feature of FEATURES) {
    css = stripBlock(css, feature.blocks.codex.markers);
  }
  return checkCodexHealth(css);
}

/** The warning for an unhealthy Codex; empty for a healthy one. */
export function formatCodexHealthWarning(version: string, report: CodexHealthReport): string {
  if (isCodexHealthy(report)) {
    return '';
  }
  if (report.unreadable) {
    return `BiDi Theme: could not read the stylesheets of Codex ${version}, so the Codex theme was not checked.`;
  }
  return `BiDi Theme: Codex ${version} changed its markup, so parts of the Codex theme may not apply. ` +
    `Missing: ${report.missingHooks.join(', ')}.`;
}
