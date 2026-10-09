# Claude Code Warm Theme — Design Spec

**Date:** 2026-10-09  
**Project:** `vscode-bidi-rtl` (this repo)  
**Status:** Approved in brainstorming; written spec pending review  
**Builds on:** extension 0.0.3 (working tree, not yet committed)  
**Visual reference:** [`assets/2026-10-09-warm-theme-mockup.html`](assets/2026-10-09-warm-theme-mockup.html) — open in a browser (loads Rubik from Google Fonts). Where the mockup and this spec differ, the spec wins.

---

## Problem

The Claude Code panel in VS Code Insiders (Claude Code 2.1.287, Dark Modern theme, opened as an editor tab) is tiring to read in Hebrew:

- Body text is 13px with tight spacing, and in a wide editor tab lines run the full width.
- Hebrew falls back to whatever Hebrew font macOS substitutes for `-apple-system`.
- The input box is cramped: footer buttons are 11px gray text (4.8:1) with ~20px hit areas, and the send button is 26px.
- The unfocused input box border (Dark Modern's `#3c3c3c`) is about 1.5:1 against the panel (1.49:1 on `#1f1f1f`, 1.61:1 on `#181818`).

## Goal

A fixed reskin of the Claude Code webview — "Warm reading" — shipped as a second module of this extension, on by default, with a status-bar on/off toggle. Decisions from brainstorming:

| Topic | Decision |
|---|---|
| Visual direction | A, "calm reading": warm dark palette, 15px text, 1.75 line height, centered reading column |
| Input box | A1, "single tidy row": 28px filled buttons, actions left / status right, 34px round send |
| Font | Rubik (SIL OFL 1.1), bundled with the extension |
| Themes | Dark themes only (`body.vscode-dark`); light and high-contrast untouched |
| Settings | On/off toggle only; the design is fixed in code |
| Packaging | Second module of this extension; extension ID unchanged |

## Scope

- **In scope:** the conversation (user messages, assistant text, tool and thinking rows), the composer, and the palette for every other surface (menus, permission card, session list, dialogs, banners) through Claude Code's `--app-*` tokens.
- **Out of scope:** Monaco diff colors; light and high-contrast themes; settings beyond the toggle; translating Claude Code's UI labels; JS patching; moving the composer dock or changing its outer spacing.

---

## Background: how the panel is built (Claude Code 2.1.287)

Mapped from `webview/index.js` and `webview/index.css` on 2026-10-09. The hash suffixes of the key classes were the same in every installed version (2.1.141, 2.1.287, 2.1.292), but selectors still match by prefix (`[class*="name_"]`), as the RTL module already does. Prefix matching is case-sensitive, so `[class*="message_"]` does not match `userMessage_`.

- **CSP:** `font-src` allows only the extension's own `webview/` and `resources/` folders — no remote fonts and no `data:` fonts.
- **Theme classes:** VS Code puts `vscode-light`, `vscode-dark` or `vscode-high-contrast` on the webview `<body>`. Claude Code's CSS treats dark as the default and only overrides for `.vscode-light` and `.vscode-high-contrast[-light]`.
- **Tokens:** the `--app-*` tokens are defined on `html`. A token that `html` derives from another one (`--app-accent-color: var(--app-button-background)`, the three pill tokens, `--app-inline-code-foreground`) is computed on `html`, so overriding only its base token lower in the tree does not change it.
- **Backgrounds:** the sidebar paints the conversation with `--app-primary-background`. The editor tab (`.fullEditor_`, `.editorMode_`) paints the conversation, the bottom fade, the sticky headers and the root with `--app-secondary-background`. `--app-root-background` is derived from those two on the root element itself.
- **Chat font:** the extension injects `--vscode-chat-font-family` and `--vscode-chat-font-size` on `:root` from VS Code's `chat.fontFamily` / `chat.fontSize`. Claude Code's CSS consumes them on `body` (`font-family`, `font-size` with a 13px fallback) and on `button` and some menus; everything else inherits from `body`.
- **Conversation:** `[class*="messagesContainer_"]` (scroll container, flex column) > `[class*="turn_"]` per prompt > rows.
  - A user row is `[class*="userMessageContainer_"][class*="message_"]`; its bubble is `[class*="userMessage_"]`, full width in Claude Code's always-on sticky mode.
  - Every assistant content block is its own sibling row `[data-testid="assistant-message"]`. Its `aria-label` is `Claude` (text), `Claude, thinking`, or `Claude, <Tool>`. Nothing wraps consecutive tool calls.
  - Assistant markdown is `[data-testid="assistant-message"] > span[class*="root_"]`; code blocks are `[class*="codeBlockWrapper_"] > pre`.
- **Timeline:** `[class*="timelineMessage_"]` rows have `padding-left: 30px`, a 7px dot (`::before`, physical left 9px) and a connecting line (`::after`, left 12px) whose start and end depend on adjacent timeline rows. Status dot colors are hardcoded.
- **Composer:** the dock `[class*="chatContainer_"] > [class*="inputContainer_"]` is absolutely positioned with max-width 680px; a spacer under the messages is sized from it by a ResizeObserver.
  - The bordered box is `fieldset[class*="inputContainer_"]` (border `--app-input-border`, radius `--corner-radius-large`), painted by the child `[class*="inputContainerBackground_"]` (same radius). Its `:focus-within` ring color depends on `data-permission-mode`.
  - The text field is two layers that must share font metrics: `[role="textbox"][aria-label="Message input"]` (transparent text) and `[class*="mentionMirror_"]` (visible text). The placeholder uses physical offsets.
- **Footer** (`[class*="inputFooter_"]`), left to right: add (+), command menu (/), context pie (only above 50% used), cache timer, pills (remote control, agents, model), divider + selection chip (only with an editor selection), spacer, mode selector, send. `data-fit-stage` (0–2) is computed from measured widths and collapses items when space runs out.
- **Send button:** 26px, `--app-claude-clay-button-orange` (`#c6613f`) with an `--app-claude-ivory` icon; other colors per `data-permission-mode`.

---

## Architecture

### Modules

Two independent modules share one patcher:

| | `rtl` (existing) | `theme` (new) |
|---|---|---|
| CSS source | `css/rtl.css` (moved out of `patcher.ts`, content unchanged) | `css/theme.css` |
| Markers | `/* bidi-rtl-patch-start */` … `/* bidi-rtl-patch-end */` (unchanged) | `/* bidi-theme-patch-start */` … `/* bidi-theme-patch-end */` |
| Assets | none | `fonts/rubik-hebrew.woff2`, `fonts/rubik-latin.woff2`, copied to `<claude-code>/webview/bidi-theme-rubik-hebrew.woff2` and `…-latin.woff2` |
| Flag (`globalState`) | `bidiRtl.enabled` (unchanged, default on) | `bidiTheme.enabled` (default on) |
| Commands | `bidi-rtl.toggle`, `bidi-rtl.applyPatch`, `bidi-rtl.removePatch` (unchanged) | `bidi-theme.toggle` |
| Status bar | `$(check) RTL` / `$(circle-slash) RTL` | `$(check) Theme` / `$(circle-slash) Theme` |

### File structure

```
css/rtl.css            RTL block content (moved from patcher.ts)
css/theme.css          theme block content
fonts/rubik-*.woff2    Rubik variable font (wght 300–900), Hebrew and Latin subsets
fonts/OFL.txt          Rubik license
src/features.ts        feature registry: id, markers, CSS file, assets, flag key
src/patcher.ts         generic block functions + writeFileAtomic (existing)
src/sync.ts            computeSyncedCss() (pure) + syncInstall() (I/O)
src/health.ts          integrity and compatibility checks
src/status.ts          status-bar state per feature
src/cleanup.ts         strip all blocks and assets from every install
src/uninstall.ts       vscode:uninstall entry; now covers both modules
src/extension.ts       activation, listeners, commands
```

`css/` and `fonts/` sit at the repo root, which `.vscodeignore` already packages.

### Sync

One operation, `sync`, replaces the separate apply/remove calls. It runs on activation, on `vscode.extensions.onDidChange` (each Claude Code update installs a new versioned folder), and on every toggle — always through the existing `enqueue` chain.

1. Read `<claude-code>/webview/index.css`.
2. Strip every known block (both marker pairs, global match as today).
3. Append the enabled blocks in canonical order: `theme`, then `rtl`.
4. If the result equals the file, skip the write; otherwise write with `writeFileAtomic`.
5. Theme assets: when the theme is enabled, copy each font if it is missing or its size or SHA-256 differs; when disabled, delete our `bidi-theme-*` files.
6. Run the health check.

`computeSyncedCss(content, enabledIds)` is pure, so steps 2–3 are unit-tested without I/O. The toggle commands flip the flag, run sync, and offer a window reload, as the RTL toggle does today.

### Rules for `theme.css`

- Every style rule's selectors start with `body.vscode-dark`. The only allowed top-level at-rule is `@font-face`.
- No `direction`, `text-align` or `unicode-bidi` declarations — those belong to the RTL module. Logical properties that follow direction (`border-inline-start`, `margin-inline`) are allowed.
- Prefer token overrides; target components only where tokens can't express the design.
- Don't override inline styles, the composer dock's position or outer spacing, or anything keyed on `data-fit-stage`.

A unit test enforces the first two rules.

### Health check

Runs after each sync against the active install:

- **Integrity:** `index.css` contains Claude Code's token block (`html{--app-`). A damaged file is still synced, and the warning names it.
- **Compatibility:** `index.css` still contains the class prefixes the theme targets — `messagesContainer_`, `turn_`, `timelineMessage_`, `userMessage_`, `toolUse_`, `toolNameText_`, `inputContainer_`, `inputContainerBackground_`, `inputFooter_`, `footerButton_`, `spacer_`, `sendButton_`, `modelPill_`, `menuButton_`, `codeBlockWrapper_` — and `index.js` still contains the hooks used in selectors: `assistant-message`, `Claude, `, `Message input`.
- Problems produce one warning per Claude Code version (remembered in `bidiTheme.lastWarnedVersion`) that lists what is missing. The theme stays applied: partial breakage is visible but never blocks the panel.

### Error handling

- Claude Code not installed → the existing warning.
- Permission or write errors → the existing error toast (`formatError`).
- Font copy fails → the theme CSS still applies and the font stack falls back to the system font; the error is logged, not shown.
- Uninstall → `cleanup.ts` strips both blocks and deletes `bidi-theme-*` files from every `anthropic.claude-code-*` folder, symlinks included (existing behavior).

### Identity

`name` stays `vscode-bidi-rtl`, so the install upgrades in place. `displayName` becomes "BiDi RTL & Theme for Claude Code" and the version 0.1.0. The README gains a Theme section and credits Rubik's license.

---

## Visual spec

Everything below is scoped under `body.vscode-dark`. Contrast ratios are WCAG 2.x, computed for these exact values.

### Palette (token overrides)

Tokens are overridden on `body.vscode-dark` (closer than `html`, so descendants inherit the new values). Derived tokens the design needs are overridden directly. `--app-plan-mode-color` is deliberately left alone: it keeps VS Code's button color, so plan mode stays distinct from the orange accent.

| Role | Tokens | Value | Contrast |
|---|---|---|---|
| Panel background | `--app-primary-background`, `--app-secondary-background`, `--app-header-background` | `#1b1a18` | — |
| Text | `--app-primary-foreground` | `#ebe5da` | 13.9:1 on panel |
| Secondary text | `--app-secondary-foreground` | `#a39d92` | 6.5:1 on panel |
| Disabled text | `--app-disabled-foreground` | `#7d766a` | 3.9:1 (exempt) |
| Borders | `--app-primary-border-color`, `--app-menu-border`, `--app-widget-border` | `#3b362f` | decorative |
| Input box fill | `--app-input-background`, `--app-input-secondary-background` | `#242120` | — |
| Input border (unfocused) | `--app-input-border` | `#736a5d` | 3.3:1 on panel, 3.0:1 on box |
| Input text | `--app-input-foreground` | `#f5f0e8` | 14.1:1 on box |
| Placeholder | `--app-input-placeholder-foreground` | `#9a9387` | 5.3:1 on box |
| Menus and modals | `--app-menu-background`, `--app-modal-background` / `--app-menu-foreground` | `#242120` / `#ebe5da` | 12.8:1 |
| Selection | `--app-menu-selection-background`, `--app-list-active-background` / `--app-menu-selection-foreground`, `--app-list-active-foreground` | `#3a332b` / `#f5f0e8` | 11.0:1 |
| Hover | `--app-list-hover-background`, `--app-ghost-button-hover-background` | `#2a2622` | 12.0:1 with text |
| Accent | `--app-accent-color`, `--app-button-background`, `--app-input-active-border`, `--app-badge-background` | `#d97757` | 5.6:1 on panel |
| Text on accent | `--app-button-foreground`, `--app-badge-foreground` | `#1b1a18` | 5.6:1 on accent |
| Accent hover | `--app-button-hover-background` | `#e3876a` | 6.6:1 with text on accent |
| Links | `--app-link-foreground` | `#e8a07f` | 8.1:1 on panel |
| Inline code | `--app-inline-code-background` / `--app-inline-code-foreground` | `#2b2824` / `#f2b896` | 8.4:1 |
| Code blocks, tool bodies | `--app-code-background`, `--app-tool-background` | `#121110` | 14.8:1 with `#e9e3d8` |
| Pills | `--app-pill-background` / `--app-pill-foreground` / `--app-pill-hover-background` | `#2f2b26` / `#ddd4c6` / `#38332c` | 9.6:1 |
| Success | `--app-success-foreground` | `#a8c792` | 8.8:1 on surfaces |

Both background tokens get the panel color, so the sidebar and the editor tab look the same; the activity-group surface `#211f1c` comes from its component rule, not from a token. Tokens not listed keep Claude Code's values. In particular `--app-claude-clay-button-orange` (`#c6613f`) and `--app-claude-ivory` stay, so the send button keeps a 3.85:1 icon; the mockup's lighter `#d97757` behind the ivory icon would be 2.96:1. Global corner-radius tokens stay; radii are set per component below. The timeline status dots keep their hardcoded colors.

### Typography

- `--vscode-chat-font-family: "BiDi Rubik", -apple-system, BlinkMacSystemFont, system-ui, sans-serif` and `--vscode-chat-font-size: 15px`, overridden on `body.vscode-dark`. Both input layers inherit them, so the caret stays aligned.
- Because `body` itself consumes the variables, overriding them on `body.vscode-dark` resizes everything that inherits from it. Verification step: in the fixture, assistant text and both input layers must compute to 15px "BiDi Rubik". If they don't, add `font-family: var(--vscode-chat-font-family); font-size: var(--vscode-chat-font-size)` on `[class*="messagesContainer_"]` and on `fieldset[class*="inputContainer_"]` (both input layers inherit from it) — never on one input layer alone.
- `@font-face` "BiDi Rubik": two faces (Hebrew subset, Latin subset) with their `unicode-range`, `font-weight: 300 900`, `font-display: swap`, and `src: url("bidi-theme-rubik-<subset>.woff2") format("woff2")`. The URL resolves next to `index.css`, which the CSP allows.
- Assistant markdown (`[data-testid="assistant-message"] > span[class*="root_"]`): line height 1.75; 12px between paragraphs; `h1`/`h2`/`h3` at 20/18/16px, weight 600, color `#f5f0e8`; list markers `#d97757` (color only — marker layout stays with the RTL module).
- Code, inline and in blocks, keeps the editor font (`--app-monospace-font-family`). Code blocks (`[class*="codeBlockWrapper_"] > pre`) get a 12px radius and 12px 16px padding.

### Layout

- **Reading column:** direct children of `[class*="messagesContainer_"]` get `max-width: 680px; width: 100%; margin-inline: auto`. 680px is Claude Code's composer max-width, so messages and composer share one centered column in an editor tab; in a narrow sidebar the column is simply full width.

### Components

**User message** (`[class*="userMessage_"]`): background `#262320`; no border except `border-inline-start: 3px solid #d97757`; radius 14px; padding 12px 16px; text `#f5f0e8` (13.8:1). Claude Code's inline 60px clamp stays.

**Assistant text rows** (`[data-testid="assistant-message"]:has(> span[class*="root_"])`): `padding-left: 0`; the dot (`::before`) and line (`::after`) are hidden.

**Activity groups (tool and thinking rows).** An activity row (ACT below) is `[data-testid="assistant-message"][aria-label^="Claude, "]`. It is attribute-only, so it can sit inside `:has()` without nesting `:has()`.

- Every ACT row: background `#211f1c`, 1px `#2b2824` side borders, 12px right padding, 12.5px text in `#968f83` (5.1:1). The tool name (`[class*="toolNameText_"]`) is `#cfc6b7` (9.7:1), weight 600.
- First of a run (`ACT:not(ACT + ACT)`): top border, 12px top corners, 4px top margin.
- Last of a run (`ACT:not(:has(+ ACT))`): bottom border, 12px bottom corners, 12px bottom margin.
- A row that is both first and last gets all four corners.
- The dots stay where Claude Code draws them (physical left, inside the group). The connecting line is re-scoped to the group: on the first row it starts at the dot, on the last row it ends at the dot, using the same first/last selectors. Claude Code's run-based line rules peak at specificity (0,4,1); the group rules are more specific.
- Any non-ACT row (assistant text, user row, meta rows) ends a group.

**Composer (A1):**

- Box: `body.vscode-dark fieldset[class*="inputContainer_"] { --corner-radius-large: 16px }`. The background layer inherits the same radius, and colors come from the tokens. The existing `:focus-within` rules keep their permission-mode ring colors.
- Text layers: no padding or position changes, so the placeholder's physical offsets stay correct.
- The footer gets a 6px gap between items.
- Footer buttons — add (`button[title="Add"]`), command menu (`[class*="menuButton_"]`), `[class*="footerButton_"]` and pills (`[class*="modelPill_"]`): min-height 28px, padding 0 10px, radius 9px, 12.5px text. Filled `#2f2b26` with `#ddd4c6` text (9.6:1). The mode selector and the model pill use a ghost style instead: transparent fill and a 1px `#453e35` border.
- Order (`order` on direct children of `[class*="inputFooter_"]`):

  | Item | Direct-child selector | `order` |
  |---|---|---|
  | add, command menu, divider, selection chip | (default) | 0 |
  | spacer | `> [class*="spacer_"]` | 1 |
  | context pie | `> :has(> [class*="usageButtonV2_"])` | 2 |
  | cache timer (a span inside a wrapper) | `> :has(> [data-cache-window])` | 2 |
  | pills (remote control, agents, model) | `> [class*="pill_"]`, `> [class*="modelPill_"]` | 2 |
  | mode selector | `> :has(> button[class*="footerButtonPrimary_"])` | 3 |
  | send | `> button[type="submit"][class*="sendButton_"]` | 4 |

  Result: actions on the left, status on the right, send last.
- Send (`button[type="submit"][class*="sendButton_"]`): 34×34px, radius 50%. Colors stay Claude Code's (default clay orange with an ivory icon, and the per-mode variants).

**Other surfaces** (menus, permission card, session list, dialogs, banners): palette through tokens only.

---

## Session clock (added 2026-10-09)

A third status-bar item shows when the current 5-hour usage window resets, requested during execution. The user chose the authoritative server data over a local estimate.

- **Display:** `$(watch) 17:42 · 42%` — the reset time as a 24-hour local clock, and the share of the window used (rounded). Tooltip: `Claude session (5h): 42% used, resets at 17:42.`, a line for the weekly window when present (`Weekly (7 days): 31% used, resets Thu 09:00.`), and `Click to refresh.` Clicking refreshes.
- **No active window** (`five_hour` missing, `resets_at` null, or the reset time already passed): `$(watch) —`, tooltip `Claude session (5h): no active window — it starts with your next message.`
- **Data:** `GET https://api.anthropic.com/api/oauth/usage` with `Authorization: Bearer <token>` and `anthropic-beta: oauth-2025-04-20` — the endpoint and header the Claude Code CLI itself uses. The body has `five_hour` and `seven_day` windows (`utilization` 0–100, `resets_at` ISO time or null), at the top level or under `rate_limits`.
- **Token:** Claude Code's OAuth access token (`claudeAiOauth.accessToken`), read from the macOS Keychain generic password `Claude Code-credentials` via `/usr/bin/security find-generic-password -s "Claude Code-credentials" -w`, or from `~/.claude/.credentials.json` elsewhere. It is read fresh for each refresh, held only for that request, never logged or stored, and sent only to `api.anthropic.com`. macOS may ask once to allow Keychain access.
- **Refresh:** on activation, every 5 minutes, when the window regains focus and the last fetch is older than 60 seconds, on click, and 5 seconds after the session window resets.
- **Errors** (no credentials, expired token, network, unexpected body): `$(watch) —`, tooltip `Claude session (5h): unavailable — <reason>. Click to retry.` Never a toast.
- **Toggle:** `bidi-usage.toggle` with flag `bidiUsage.enabled` (default on); `bidi-usage.refresh` backs the click.
- **Out of scope:** refreshing the OAuth token, weekly limits in the status text (tooltip only), notifications.
- **Risk:** the endpoint is undocumented and may change; the item then shows `—` with the reason.

## Testing

### Unit (mocha, existing setup)

- Blocks: add and strip each block alone; idempotent; canonical order (`theme` before `rtl`); legacy RTL markers recognized; content outside the markers stays byte-identical.
- `computeSyncedCss`: every combination of enabled flags; toggling one module leaves the other's block unchanged.
- Health: missing class prefixes and JS hooks reported; a damaged file (no `html{--app-`) reported.
- `theme.css` lint: every style rule's selectors start with `body.vscode-dark`; only `@font-face` at top level; no `direction`, `text-align` or `unicode-bidi`.

### Integration (temp directories)

- Fonts are copied along with the theme block and deleted when the theme is off.
- Cleanup strips both blocks and our fonts from every install, including symlinked folders.
- Missing or damaged files don't throw.

### Visual

- A fixture page reproduces the DOM shapes above: a user row, assistant text, a run of tool rows with success and failure dots, a thinking row, and the composer with its footer. It loads Claude Code's real `index.css` with the synced blocks and is rendered in headless Chrome.
- Screenshot it with `<body class="vscode-dark">` and compare against the mockup, then with `vscode-light` to confirm nothing changes.

### Manual (VS Code Insiders, by the user)

- A conversation with successful and failed tools, thinking, and code blocks.
- A permission request, the `/` menu and the model menu.
- A narrow sidebar (< 500px): footer fit stages still behave.
- A light theme and a high-contrast theme: the panel is unchanged.
- All four RTL/theme on/off combinations.

---

## Risks

1. **English aria-labels.** Activity rows are matched by `aria-label^="Claude, "`. If Claude Code localizes or renames them, groups lose their styling; the health check flags it.
2. **Fonts under the webview CSP.** Expected to load, since the files sit in the same folder as `index.css`; verified in the real panel during implementation. If blocked, the theme still applies with the system font.
3. **Footer fit stages.** Larger buttons reach fit stages 1–2 sooner in narrow panels. Accepted, and checked manually.
4. **Update cadence.** Claude Code ships almost daily; every update re-runs sync and the health check.
5. **Damaged inactive install.** The 2.1.292 folder's `index.css` is missing its first ~800 bytes, likely written by the old 0.0.1 patcher on 2026-10-07 at 19:45. The user chose to leave it; the integrity check warns if it ever becomes the active install.

## Before implementation

- Commit the 0.0.3 working tree as its own commit, then build this on top of it.
