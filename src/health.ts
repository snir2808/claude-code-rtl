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
