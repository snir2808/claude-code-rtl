import type { BlockMarkers } from './blocks';

export type FeatureId = 'theme' | 'rtl';

/**
 * Where a module's blocks go: Claude Code's webview/index.css, VS Code's
 * own workbench CSS, which styles the built-in chat that Copilot runs in, or
 * the stylesheet of OpenAI's Codex webview.
 */
export type TargetId = 'claude' | 'workbench' | 'codex';

export const TARGETS: readonly TargetId[] = ['claude', 'workbench', 'codex'];

export interface Asset {
  /** Path inside this extension, relative to its root. */
  readonly source: string;
  /** File name written next to the target's CSS. */
  readonly target: string;
}

/** What one module adds to one target's CSS. */
export interface Block {
  readonly markers: BlockMarkers;
  /** Block body, relative to the extension root. */
  readonly cssFile: string;
  readonly assets: readonly Asset[];
}

export interface Feature {
  readonly id: FeatureId;
  /** Status-bar label. */
  readonly label: string;
  readonly blocks: Readonly<Record<TargetId, Block>>;
  /** globalState key of the on/off flag (default on); one flag covers every target. */
  readonly flagKey: string;
  readonly toggleCommand: string;
}

const RUBIK: readonly Asset[] = [
  { source: 'fonts/rubik-hebrew.woff2', target: 'bidi-theme-rubik-hebrew.woff2' },
  { source: 'fonts/rubik-latin.woff2', target: 'bidi-theme-rubik-latin.woff2' },
];

// The Claude Code blocks use hash-stable selectors: Claude Code's class names
// carry a build-hash suffix (e.g. messagesContainer_07S1Yg), so elements are
// matched by [class*="prefix_"], and the chat input by role + aria-label.
// VS Code's chat uses plain class names (interactive-session, …). Codex mixes
// Tailwind utilities with CSS modules named _Name_<hash>_<n>, matched by
// [class*="_Name_"].
export const THEME: Feature = {
  id: 'theme',
  label: 'Theme',
  blocks: {
    claude: {
      markers: { start: '/* bidi-theme-patch-start */', end: '/* bidi-theme-patch-end */' },
      cssFile: 'css/theme.css',
      assets: RUBIK,
    },
    workbench: {
      markers: { start: '/* bidi-copilot-theme-start */', end: '/* bidi-copilot-theme-end */' },
      cssFile: 'css/copilot-theme.css',
      assets: RUBIK,
    },
    codex: {
      markers: { start: '/* bidi-codex-theme-start */', end: '/* bidi-codex-theme-end */' },
      cssFile: 'css/codex-theme.css',
      assets: RUBIK,
    },
  },
  flagKey: 'bidiTheme.enabled',
  toggleCommand: 'bidi-theme.toggle',
};

export const RTL: Feature = {
  id: 'rtl',
  label: 'RTL',
  blocks: {
    claude: {
      markers: { start: '/* bidi-rtl-patch-start */', end: '/* bidi-rtl-patch-end */' },
      cssFile: 'css/rtl.css',
      assets: [],
    },
    workbench: {
      markers: { start: '/* bidi-copilot-rtl-start */', end: '/* bidi-copilot-rtl-end */' },
      cssFile: 'css/copilot-rtl.css',
      assets: [],
    },
    codex: {
      markers: { start: '/* bidi-codex-rtl-start */', end: '/* bidi-codex-rtl-end */' },
      cssFile: 'css/codex-rtl.css',
      assets: [],
    },
  },
  flagKey: 'bidiRtl.enabled',
  toggleCommand: 'bidi-rtl.toggle',
};

/** Canonical order: sync appends the enabled blocks in this order, in every target. */
export const FEATURES: readonly Feature[] = [THEME, RTL];
