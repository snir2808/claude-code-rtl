import type { BlockMarkers } from './patcher';

export type FeatureId = 'theme' | 'rtl';

export interface Asset {
  /** Path inside this extension, relative to its root. */
  readonly source: string;
  /** File name written next to Claude Code's webview/index.css. */
  readonly target: string;
}

export interface Feature {
  readonly id: FeatureId;
  /** Status-bar label. */
  readonly label: string;
  readonly markers: BlockMarkers;
  /** Block body, relative to the extension root. */
  readonly cssFile: string;
  readonly assets: readonly Asset[];
  /** globalState key of the on/off flag (default on). */
  readonly flagKey: string;
  readonly toggleCommand: string;
}

// Both blocks use hash-stable selectors: Claude Code's class names carry a
// build-hash suffix (e.g. messagesContainer_07S1Yg), so elements are matched
// by [class*="prefix_"], and the chat input by role + aria-label.
export const THEME: Feature = {
  id: 'theme',
  label: 'Theme',
  markers: { start: '/* bidi-theme-patch-start */', end: '/* bidi-theme-patch-end */' },
  cssFile: 'css/theme.css',
  assets: [
    { source: 'fonts/rubik-hebrew.woff2', target: 'bidi-theme-rubik-hebrew.woff2' },
    { source: 'fonts/rubik-latin.woff2', target: 'bidi-theme-rubik-latin.woff2' },
  ],
  flagKey: 'bidiTheme.enabled',
  toggleCommand: 'bidi-theme.toggle',
};

export const RTL: Feature = {
  id: 'rtl',
  label: 'RTL',
  markers: { start: '/* bidi-rtl-patch-start */', end: '/* bidi-rtl-patch-end */' },
  cssFile: 'css/rtl.css',
  assets: [],
  flagKey: 'bidiRtl.enabled',
  toggleCommand: 'bidi-rtl.toggle',
};

/** Canonical order: sync appends the enabled blocks in this order. */
export const FEATURES: readonly Feature[] = [THEME, RTL];
