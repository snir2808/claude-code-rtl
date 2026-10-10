# Claude Code Warm Theme — Design Spec

**Date:** 2026-10-09  
**Project:** `vscode-bidi-rtl` (this repo)  
**Status:** Approved in brainstorming; written spec pending review  
**Builds on:** extension 0.0.3 (working tree, not yet committed)  
**Visual reference:** [`assets/2026-10-09-warm-theme-mockup.html`](assets/2026-10-09-warm-theme-mockup.html) — open in a browser (loads Rubik from Google Fonts). Where the mockup and this spec differ, the spec wins.

---

## Problem

The Claude Code panel in VS Code Insiders (Claude Code 2.1.287, Dark Modern theme, opened as an editor tab) is tiring to read in Hebrew:

- Body text is 13px with tight spacing.
- Hebrew falls back to whatever Hebrew font macOS substitutes for `-apple-system`.
- The input box is cramped: footer buttons are 11px gray text (4.8:1) with ~20px hit areas, and the send button is 26px.
- The unfocused input box border (Dark Modern's `#3c3c3c`) is about 1.5:1 against the panel (1.49:1 on `#1f1f1f`, 1.61:1 on `#181818`).

## Goal

A fixed reskin of the Claude Code webview — "Warm reading" — shipped as a second module of this extension, on by default, with a status-bar on/off toggle. Decisions from brainstorming:

| Topic | Decision |
|---|---|
| Visual direction | A, "calm reading": warm dark palette, 15px text, 1.75 line height, full-width messages |
| Input box | A1, "single tidy row": 34px filled buttons, actions left / status right, 40px round send (composer 1.2x bigger, changed 2026-10-10 at the user's request) |
| Font | Rubik (SIL OFL 1.1), bundled with the extension |
| Themes | Dark themes only (`body.vscode-dark`); light and high-contrast untouched |
| Settings | On/off toggle only; the design is fixed in code |
| Packaging | Second module of this extension; extension ID unchanged |

## Scope

- **In scope:** the conversation (user messages, assistant text, tool and thinking rows), the composer, and the palette for every other surface (menus, permission card, session list, dialogs, banners) through Claude Code's `--app-*` tokens.
- **Out of scope:** Monaco diff colors; light and high-contrast themes; settings beyond the toggle; translating Claude Code's UI labels; JS patching; moving the composer dock or changing its outer spacing (its max-width alone is widened).

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

Two independent modules share one set of block primitives (`src/blocks.ts`):

| | `rtl` (existing) | `theme` (new) |
|---|---|---|
| CSS source | `css/rtl.css` (moved out of the old `patcher.ts`, content unchanged) | `css/theme.css` |
| Markers | `/* bidi-rtl-patch-start */` … `/* bidi-rtl-patch-end */` (unchanged) | `/* bidi-theme-patch-start */` … `/* bidi-theme-patch-end */` |
| Assets | none | `fonts/rubik-hebrew.woff2`, `fonts/rubik-latin.woff2`, copied to `<claude-code>/webview/bidi-theme-rubik-hebrew.woff2` and `…-latin.woff2` |
| Flag (`globalState`) | `bidiRtl.enabled` (unchanged, default on) | `bidiTheme.enabled` (default on) |
| Commands | `bidi-rtl.toggle`, `bidi-rtl.applyPatch`, `bidi-rtl.removePatch` (unchanged) | `bidi-theme.toggle` |
| Status bar | `$(check) RTL` / `$(circle-slash) RTL` | `$(check) Theme` / `$(circle-slash) Theme` |

### File structure

```
css/rtl.css            RTL block content (moved from the old patcher.ts)
css/theme.css          theme block content
fonts/rubik-*.woff2    Rubik variable font (wght 300–900), Hebrew and Latin subsets
fonts/OFL.txt          Rubik license
src/features.ts        feature registry: id, markers, CSS file, assets, flag key
src/blocks.ts          generic block functions + writeFileAtomic (was patcher.ts)
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
4. Fonts of enabled blocks: copy each one that is missing or whose size or SHA-256 differs.
5. If the result equals the file, skip the write; otherwise write with `writeFileAtomic`.
6. Fonts of disabled blocks: delete our `bidi-theme-*` files, only now, so a failed write never leaves the old CSS pointing at deleted fonts.
7. While the theme is enabled, run the health check.

`computeSyncedCss(content, enabledIds)` is pure, so steps 2–3 are unit-tested without I/O. The toggle commands read, flip and sync the flag as one queued step (so quick toggles apply in order and each reload prompt matches what was synced) and offer a window reload, as the RTL toggle does today.

### Rules for `theme.css`

- Every style rule's selectors start with `body.vscode-dark`. The only allowed top-level at-rule is `@font-face`.
- No `direction`, `text-align` or `unicode-bidi` declarations — those belong to the RTL module. Logical properties that follow direction (`border-inline-start`, `margin-inline`) are allowed.
- Prefer token overrides; target components only where tokens can't express the design.
- Don't override inline styles, the composer dock's position or outer spacing, or anything keyed on `data-fit-stage`.
- No `!important`, no block marker text, and no hashed class names (`messagesContainer_07S1Yg`): Claude Code's class names carry a build hash, so selectors match the prefix.

Unit tests enforce the first two rules and the last one, and that `data-fit-stage` never appears.

### Health check

Runs after each sync against the active install, while the theme is enabled (its checks and warning are about the theme):

- **Integrity:** `index.css` contains Claude Code's token block (`html{--app-`). A file without it is still synced, and the warning says it is damaged or Claude Code changed its stylesheet format, and to reinstall Claude Code.
- **Compatibility:** `index.css` still contains (as `.prefix…`) every class prefix the blocks rely on — each `[class*="…_"]` prefix in `css/theme.css` (`timelineMessage_`, `userMessage_`, `root_`, `toolNameText_`, `codeBlockWrapper_`, `inputContainer_`, `inputFooter_`, `footerButton_`, `footerButtonPrimary_`, `footerButtonStatic_`, `usageButtonV2_`, `pill_`, `modelPill_`, `modelPillRow_`, `menuButton_`, `spacer_`, `sendButton_`), plus `turn_`, `inputContainerBackground_`, `toolUse_` and `thinkingSummary_` (the last two from `css/rtl.css`) — and `index.js` still contains the attribute hooks: `assistant-message`, `Claude, `, `Message input`, `data-cache-window`, `title:"Add"`, `combobox`, `type:"submit"`, `data-permission-mode` (standing in for the generic mode names `plan` and `auto`) and `bypassPermissions`. A unit test parses `css/theme.css` and fails if one of its class prefixes or attribute hooks is not on these lists.
- **Unreadable files:** an `index.css` or `index.js` that cannot be read is reported (and nothing in it checked), since a moved or renamed file is the kind of change the check exists for.
- Problems produce one warning per Claude Code version (remembered in `bidiTheme.lastWarnedVersion`) that lists what is missing or unreadable. The theme stays applied: partial breakage is visible but never blocks the panel.
- A healthy verdict is remembered per Claude Code version for the rest of the activation, so later syncs don't read `index.js` (megabytes) again.

### Error handling

- Claude Code not installed → the existing warning.
- Permission or write errors → the existing error toast (`formatError`).
- Font copy or delete fails → the theme CSS still applies and the font stack falls back to the system font; the error is logged (`font sync failed`), not shown.
- Uninstall → `cleanup.ts` strips both blocks and deletes `bidi-theme-*` files from every `anthropic.claude-code-*` folder, symlinks included (existing behavior). A font that is already gone is fine; any other failure, or an install that cannot be read, is logged per install without stopping the others.

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

- **Width:** messages use the panel's full width, as in Claude Code's default; the composer is centered at max 816px (1.2x the native 680px; changed 2026-10-10). (Changed on 2026-10-10 at the user's request: the first version had a 680px reading column for the messages too, and the mockup still draws it.)

### Components

**User message** (`[class*="userMessage_"]`): background `#262320`; no border except `border-inline-start: 3px solid #d97757`; radius 14px; padding 12px 16px; text `#f5f0e8` (13.8:1). Claude Code's inline 60px clamp stays.

**Assistant text rows** (`[data-testid="assistant-message"]:has(> span[class*="root_"]):not([aria-label^="Claude, "])`): `padding-left: 0`; the dot (`::before`) and line (`::after`) are hidden. A row whose message also holds a tool call (an empty text block plus `tool_use`) carries the tool's `aria-label`, so it stays a timeline row.

**Activity groups (tool and thinking rows).** An activity row (ACT below) is `[data-testid="assistant-message"][aria-label^="Claude, "]`. It is attribute-only, so it can sit inside `:has()` without nesting `:has()`.

- Every ACT row: background `#211f1c`, 1px `#2b2824` side borders, 12px right padding, 12.5px text in `#968f83` (5.1:1). The tool name (`[class*="toolNameText_"]`) is `#cfc6b7` (9.7:1), weight 600.
- First of a run (`ACT:not(ACT + ACT)`): top border, 12px top corners, 4px top margin.
- Last of a run (`ACT:not(:has(+ ACT))`): bottom border, 12px bottom corners, 12px bottom margin.
- A row that is both first and last gets all four corners.
- The dots stay where Claude Code draws them (physical left, inside the group). The connecting line is re-scoped to the group: on the first row it starts at the dot, on the last row it ends at the dot, using the same first/last selectors. Claude Code's run-based line rules peak at specificity (0,4,1); the group rules are more specific.
- Any non-ACT row (assistant text, user row, meta rows) ends a group.

**Composer (A1):** scaled 1.2x on 2026-10-10 at the user's request; the messages are untouched.

- Width: `max-width: 816px` (native 680px) on the dock `[class*="chatContainer_"] > [class*="inputContainer_"]`, `[class*="inputWrapper_"]` and `[class*="permissionsContainer_"]`. Only max-width changes, never the dock's position, offsets, margin or padding (a ResizeObserver measures it). No `zoom` or `transform`.
- Input text: `font-size: calc(var(--vscode-chat-font-size) * 1.2)` (18px) on the fieldset, so the transparent `[role="textbox"]` and the visible `[class*="mentionMirror_"]` layers inherit it together (Claude Code sets no font-size on either).
- Box: `body.vscode-dark fieldset[class*="inputContainer_"] { --corner-radius-large: 18px }`. The background layer inherits the same radius, and colors come from the tokens. The existing `:focus-within` rules keep their permission-mode ring colors.
- Text layers: no padding or position changes, so the placeholder's physical offsets stay correct.
- The footer gets a 7px gap between items.
- Footer buttons — add (`button[title="Add"]`), command menu (`button[class*="menuButton_"]`), `button[class*="footerButton_"]` and pills (`button[class*="modelPill_"]`): min-height 34px, padding 0 12px, radius 11px, 15px text (the icon buttons are 36×34px, radius 11px). Filled `#2f2b26` with `#ddd4c6` text (9.6:1). The mode selector, the model pill and the context pie (`button[class*="usageButtonV2_"]`, 36×34px) use a ghost style instead: transparent fill and a 1px `#453e35` border.
- Only buttons: the cache timer, the selection chip and the remote/agents pill are spans that keep Claude Code's flat look (no fill, no hover), including the timer's error color when the prompt cache is cold. Their `.85em` would compute to 15.3px under the 18px fieldset, so the theme sets them to 15px, like the text buttons (font size only).
- At the narrowest fit stage Claude Code moves the model pill to its own row below the footer (`[class*="modelPillRow_"] > button[class*="modelPill_"]`); it keeps the same size and ghost style there.
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
- Send (`button[type="submit"][class*="sendButton_"]`): 40×40px, radius 50%. Colors stay Claude Code's (default clay orange with an ivory icon, and the per-mode variants). Plan, bypass and auto paint the button and icon with `--app-button-foreground`, so on the send button in those modes the theme sets it back to `var(--vscode-button-foreground)`.

**Other surfaces** (menus, permission card, session list, dialogs, banners): palette through tokens only.

---

## Session clock (added 2026-10-09)

A third status-bar item shows when the current 5-hour usage window resets, requested during execution. The user chose the authoritative server data over a local estimate.

- **Display:** `$(watch) 17:42 · 42%` — the reset time as a 24-hour local clock, and the share of the window used (rounded). Tooltip: `Claude session (5h): 42% used, resets at 17:42.`, a line for the weekly window when present (`Weekly (7 days): 31% used, resets Thu 09:00.`), and `Click to refresh.` Clicking refreshes.
- **No active window** (`five_hour` missing or null, an idle `five_hour` whose `utilization` and `resets_at` are both null, `resets_at` null, or the reset time already passed): `$(watch) —`, tooltip `Claude session (5h): no active window — it starts with your next message.`
- **Data:** `GET https://api.anthropic.com/api/oauth/usage` with `Authorization: Bearer <token>` and `anthropic-beta: oauth-2025-04-20` — the endpoint and header the Claude Code CLI itself uses. The body has `five_hour` and `seven_day` windows (`utilization` 0–100, `resets_at` ISO time or null), at the top level or under `rate_limits`.
- **Token:** Claude Code's OAuth access token (`claudeAiOauth.accessToken`), read from the macOS Keychain generic password `Claude Code-credentials` via `/usr/bin/security find-generic-password -s "Claude Code-credentials" -w`, or from `~/.claude/.credentials.json` elsewhere. It is read fresh for each refresh, held only for that request, never logged or stored, and sent only to `api.anthropic.com`. There is normally no Keychain dialog, since Claude Code stored the item with the same `security` tool; a locked keychain may ask to be unlocked.
- **Opt-in:** the clock is off until the user turns it on. On the first activation that finds `bidiUsage.enabled` never set, it shows one information message, not awaited by activation: `BiDi: Show when your Claude 5-hour session resets in the status bar? It reads Claude Code's sign-in from the macOS Keychain and asks Anthropic for your usage.` (elsewhere it names `~/.claude/.credentials.json`), with `Enable` and `Not now`. Only a focused window asks: one that activates unfocused waits for its first focus event and then checks the flags again. `bidiUsage.prompted` is set when it shows, so only one window or activation ever asks. Enable sets the flag and refreshes; Not now or a dismissal leaves it off, with no Keychain read and no request.
- **Refresh:** on activation, every 5 minutes in the focused window only (each VS Code window polls on its own), when a window regains focus and the last fetch is older than 60 seconds, on click, and 5 seconds after the session window resets. Focus also shows the last result again as of the current time, so a reset that passed while the machine slept shows at once, even when it is too soon to fetch. Reset times are shown rounded to the nearest minute.
- **Errors:** `$(watch) —`, tooltip `Claude session (5h): unavailable — <reason>. Click to retry.` Never a toast. Reasons are fixed texts that never include the token or response text: `not signed in to Claude Code` (no Keychain item or credentials file, an API-key sign-in, or a custom `CLAUDE_CONFIG_DIR` / `CLAUDE_SECURESTORAGE_CONFIG_DIR`, which keep the credential under another name, unsupported), `the Keychain did not answer`, `Keychain access was denied` and `the Keychain is locked` (`security` exit 36; after any of these three, automatic refreshes pause until the user clicks the clock, toggles it, or turns it off anywhere), `could not read Claude Code credentials (<errno>)`, `the usage request timed out`, `network error`, `unexpected usage response` (also when `five_hour` is present but malformed, other than the idle null/null shape; a malformed weekly window is only dropped), `sign-in expired (use Claude Code to refresh it)` (HTTP 401), `usage request failed (HTTP <status>)`. Only tokens of printable ASCII are sent, and redirects are refused. A generation counter keeps an older refresh from overwriting a newer one or undoing a toggle. Turning the clock off, in this window or another, applies even while paused.
- **Toggle:** `bidi-usage.toggle` with flag `bidiUsage.enabled` (default off); `bidi-usage.refresh` backs the click; while the clock is off it shows `The session clock is off.` with a `Turn on` button (not awaited) that enables it like the toggle. Off means no Keychain reads and no requests.
- **Status items:** each has its own id and name (`bidi.theme` "BiDi Theme", `bidi.rtl` "BiDi RTL", `bidi.sessionClock` "Claude Session Clock"), so the status bar's menu can hide them one by one.
- **Out of scope:** refreshing the OAuth token, weekly limits in the status text (tooltip only), notifications.
- **Risk:** the endpoint is undocumented and may change; the item then shows `—` with the reason.

## Testing

### Unit (mocha, existing setup)

- Blocks: add and strip each block alone; idempotent; canonical order (`theme` before `rtl`); legacy RTL markers recognized; content outside the markers stays byte-identical.
- `computeSyncedCss`: every combination of enabled flags; toggling one module leaves the other's block unchanged.
- Health: missing class prefixes (only right after a dot) and JS hooks reported; a damaged file (no `html{--app-`) reported; an unreadable file reported instead of rejecting; a healthy report has no warning; every class prefix and attribute hook in `css/theme.css` is on the required lists.
- `theme.css` lint: every style rule's selectors start with `body.vscode-dark`; only `@font-face` at top level; no `direction`, `text-align` or `unicode-bidi`; no block markers, `!important` or `data-fit-stage`; `url()` in any quoting style points at a declared asset. Both CSS files are free of hashed class names.
- Session clock: response parsing, formatting (rounded times), the fixed error texts (including HTTP 401 and a locked keychain), and that no error carries the token or the response.

### activate() (mocha, fake host)

A `--require` hook (`out/test/setup.js`) maps `require('vscode')` to a small fake (status items, commands, `globalState`, window focus, `extensions.getExtension`/`onDidChange`, toasts with scripted answers). A fake clock drives the timers and `Date`, and `activate()` takes the clock's token and usage source as an optional argument, so the tests pass fakes; as a backstop, the hook makes every `child_process` entry point and `fetch()` refuse to run (unless a test sets `BIDI_TEST_ALLOW_CHILD_PROCESS=1`) and points `HOME` at an empty temp folder. Covered: the 0.0.3 → 0.1.0 upgrade; theme off/on (block and fonts); the health warning once per version and only while the theme is on, for unreadable files too, and the remembered healthy verdict; quick double toggles; the font error label; distinct status ids and names; a failed activation handing over what it created; the clock's one-time question (asked once across activations, Enable, Not now, dismissal, never awaited, an answer after closing); pause after denial and resume on click or toggle; a toggle-off from another window, on focus and while paused; focused-window polling; focus showing the last result as of now; an unfocused window asking only after it gets focus; a refresh click while the clock is off offering `Turn on`; a toggle-off during a refresh; and disposal clearing the timers, listeners and commands.

### Integration (temp directories)

- Fonts are copied along with the theme block (byte for byte, again when their bytes change, not again when identical) and deleted when the theme is off, only after the CSS write; a font that cannot be deleted is reported while the CSS still syncs.
- Cleanup strips both blocks and our fonts from every install, including symlinked folders; an install with only our fonts counts as cleaned; an unreadable install or an undeletable font is reported without stopping the others.
- Missing or damaged files don't throw.

### Visual

- A fixture page reproduces the DOM shapes above: a user row, assistant text, a run of tool rows with success and failure dots, a thinking row, a tool row that also holds an empty text block, and the composer with its footer, plus a second composer with the states one footer cannot show at once (a cold cache timer, a send button whose permission mode the page switches, and the model pill on its own row). It loads Claude Code's real `index.css` with the synced blocks and is rendered in headless Chrome. Before rendering, the script runs the install health check (`checkInstallHealth`) and fails with its report if the install is unhealthy, and every class in the page must exist in that `index.css`. The page also holds a permission dialog (`permissionsContainer_`) in the composer dock.
- Screenshot it with `<body class="vscode-dark">` and compare against the mockup; checks include full-width messages with the input box at 816px with 18px input text (messages stay 15px), 34px footer buttons and a 40px send, the flat cache timer (error color when cold) and selection chip, the per-mode send colors, the ghost model pill and context pie, the user bubble matching the turn width, messages spanning the viewport, the permissions container at 816px (680px in light), the "Thinking" label computing `ltr`, and the flat footer spans computing 15px like the text buttons. Then with `vscode-light`, which keeps the Dark Modern variables and so checks scoping only: no theme font, colors, sizes or footer order.

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
