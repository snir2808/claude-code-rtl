import * as fs from 'fs';
import * as path from 'path';

/** Class-name prefixes css/theme.css targets; each must still appear as `.prefix…` in index.css. */
export const REQUIRED_CLASS_PREFIXES: readonly string[] = [
  'messagesContainer_',
  'turn_',
  'timelineMessage_',
  'userMessage_',
  'toolUse_',
  'toolNameText_',
  'inputContainer_',
  'inputContainerBackground_',
  'inputFooter_',
  'footerButton_',
  'spacer_',
  'sendButton_',
  'modelPill_',
  'menuButton_',
  'codeBlockWrapper_',
];

/** Non-class hooks the theme's selectors rely on, looked up in index.js. */
export const REQUIRED_JS_HOOKS: readonly string[] = ['assistant-message', 'Claude, ', 'Message input'];

/** Claude Code defines its design tokens as `html{--app-…}`; a file without them is damaged. */
export const TOKEN_BLOCK_MARKER = 'html{--app-';

export interface HealthReport {
  damaged: boolean;
  missingClassPrefixes: string[];
  missingJsHooks: string[];
}

export function checkHealth(css: string, js: string): HealthReport {
  return {
    damaged: !css.includes(TOKEN_BLOCK_MARKER),
    missingClassPrefixes: REQUIRED_CLASS_PREFIXES.filter((p) => !css.includes(`.${p}`)),
    missingJsHooks: REQUIRED_JS_HOOKS.filter((h) => !js.includes(h)),
  };
}

export function isHealthy(report: HealthReport): boolean {
  return (
    !report.damaged &&
    report.missingClassPrefixes.length === 0 &&
    report.missingJsHooks.length === 0
  );
}

export async function checkInstallHealth(claudeCodeDir: string): Promise<HealthReport> {
  const webviewDir = path.join(claudeCodeDir, 'webview');
  const [css, js] = await Promise.all([
    fs.promises.readFile(path.join(webviewDir, 'index.css'), 'utf8'),
    fs.promises.readFile(path.join(webviewDir, 'index.js'), 'utf8'),
  ]);
  return checkHealth(css, js);
}

export function formatHealthWarning(version: string, report: HealthReport): string {
  if (report.damaged) {
    return `BiDi Theme: Claude Code ${version} has a damaged webview/index.css ` +
      '(its design tokens are missing). Reinstall Claude Code.';
  }
  const missing = [...report.missingClassPrefixes, ...report.missingJsHooks.map((h) => `"${h}"`)];
  return `BiDi Theme: Claude Code ${version} changed its markup, so parts of the theme ` +
    `may not apply. Missing: ${missing.join(', ')}.`;
}
