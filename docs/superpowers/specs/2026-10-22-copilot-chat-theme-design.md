# Copilot Chat Warm Theme — Design Spec

**Date:** 2026-10-22  
**Project:** `vscode-bidi-rtl` (this repo), version 0.2.0  
**Status:** Approved; implemented in 0.2.0 (plan: [2026-10-22-copilot-chat-theme.md](../plans/2026-10-22-copilot-chat-theme.md))  
**Builds on:** 0.1.0 (RTL + warm theme for Claude Code, session clock) — see [`2026-10-09-claude-code-warm-theme-design.md`](2026-10-09-claude-code-warm-theme-design.md). Visual values are the ones defined there; this spec maps them onto VS Code's built-in chat.

---

## Problem

The user's team switched to GitHub Copilot at work. Copilot's chat — VS Code's built-in chat view — looks nothing like the warm Claude Code panel the user now works in: small system text, a blue right-aligned request bubble, flat status lines, a small input box with tiny controls, and broken direction for Hebrew.

## Goal

Make VS Code's built-in chat (where Copilot runs) look exactly like the user's Claude Code panel, including Hebrew RTL, by extending this extension. Test on this Mac (VS Code Insiders 1.143, Copilot Free), then ship the same VSIX to the work Mac.

| Topic | Decision |
|---|---|
| Approach | A new patch target in this extension: VS Code's own `workbench.desktop.main.css` (approach 1 of 3; chosen as "the best result") |
| Modules | The existing `theme` and `rtl` modules each gain a second target; the same `Theme` / `RTL` toggles control Claude Code and Copilot together |
| Look | The Claude Code warm theme as installed in 0.1.0: palette, Rubik 15px / 1.75, full-width messages, user messages as soft blocks with an accent bar, activity in quiet boxes, the 1.2× composer |
| Integrity warning | The extension updates the matching checksum in `product.json` so VS Code shows no "installation is corrupt" warning, and restores it on removal |
| Missing Claude Code | Skipped silently (the work Mac may not have it); the warning appears only when the user explicitly toggles a module and no target exists |
| Work Mac | User-managed ("everything open"): VSIX install and patching are allowed |

## Scope

- **In scope:** VS Code's chat view (`.interactive-session`) in dark themes — the conversation list and the chat input part — in the side bar, the secondary side bar, the panel and the editor area.
- **Out of scope:** the Copilot usage counter (next sub-project, its own spec); inline chat in the editor; quick chat; any other VS Code surface; light and high-contrast themes; other forks (Cursor, Windsurf).

---

## Background: how VS Code's chat is built (VS Code Insiders 1.143)

Checked on 2026-10-22 against `/Applications/Visual Studio Code - Insiders 2.app/Contents/Resources/app`.

- **Not a webview.** The chat is part of the workbench DOM. Its styles live in `<appRoot>/out/vs/workbench/workbench.desktop.main.css` (1.8 MB). `vscode.env.appRoot` gives `<appRoot>` for stable and Insiders alike. Copilot itself ships inside the app (`<appRoot>/extensions/copilot`).
- **Stable class names.** Unlike Claude Code's hashed CSS modules, the chat uses plain names: `interactive-session` (473 rules), `interactive-item-container`, `interactive-request`, `interactive-response`, `interactive-input-part`, `chat-input-container`, `chat-input-toolbars`, `chat-input-toolbar`, `chat-execute-toolbar`, `chat-secondary-toolbar`, `chat-tool-invocation-part`, `chat-thinking-box`, `chat-terminal-content-part`, `chat-confirmation-widget`, `chat-used-context`, `chat-input-picker-item`, `interactive-result-code-block`.
- **Tokens.** 34 chat tokens are used, among them `--vscode-chat-requestBackground`, `--vscode-chat-requestBorder`, `--vscode-chat-requestBubbleBackground`, `--vscode-chat-requestBubbleHoverBackground`, `--vscode-chat-list-background`, `--vscode-chat-font-family`, and relative sizes `--vscode-chat-font-size-body-xs … xxl` defined on `.interactive-session` (e.g. `body-s: .923em`).
- **Theme classes.** The workbench root carries the theme kind: `.monaco-workbench.vs-dark` (dark), `.vs` (light), `.hc-black` / `.hc-light` (high contrast).
- **Native width.** `.interactive-session{display:flex;flex-direction:column;max-width:950px;margin:auto}` — the whole chat, including the input part, is capped at 950px and centered.
- **Input toolbars.** `.chat-input-toolbars{display:flex}`; `.chat-input-toolbars>.chat-execute-toolbar{order:2;flex-shrink:0}` (mic, send). The left `.chat-input-toolbar` holds attach (`+`) and the pickers (mode `Agent`, model `Auto`, `Balance`).
- **Integrity check.** `product.json` → `checksums["vs/workbench/workbench.desktop.main.css"]` is the base64 SHA-256 of the file without `=` padding (verified: the computed value matches). A mismatch makes VS Code warn that the installation is corrupt.
- **Fonts.** `workbench.html`'s CSP has `font-src 'self' …`; files under `<appRoot>` are `'self'`, so fonts copied next to the workbench CSS load.
- **Load timing.** The workbench CSS loads when a window opens, before extensions activate. A patch applied at activation shows after one window reload. Every VS Code update replaces `<appRoot>`, removing the patch (Insiders updates almost daily).

Exact DOM shapes (element nesting, the markdown container's class, the request/response header) are confirmed against a real DOM sample captured once with **Help → Toggle Developer Tools → Copy outerHTML** of `.interactive-session` during implementation; this spec fixes roles and values, the plan fixes selectors.

**Found while planning** (static analysis of 1.143's `workbench.desktop.main.js` and `.css`). These facts changed four decisions below, each marked *(changed while planning)*:

- **The input editor is sized in JS.** The input editor is a Monaco editor whose font (the system UI font), size (13px) and line height (20px) are set in JS. Its width is computed in JS from the chat's layout width. Monaco also lays out line wrapping and the caret from these options, so a CSS font change would misplace the caret and clip lines. Monaco also has no right-to-left mode.
- **The layout width is capped in JS.** The chat widget lays itself out at most 950px wide (`maximumWidth`). The input part's width must match that, less its 12px margins.
- **VS Code writes inline styles on the root.** JS writes `font-size` (from `chat.fontSize`) and three resolved colors inline on `.interactive-session`. These are redefined one level down, on `.interactive-list`, rather than overridden with `!important`.
- **Other surfaces share the root class.** `.interactive-session` also appears in inline chat (inside `.chat-widget`), quick chat and hovers. The chat view lives in `.chat-viewpane`; the chat editor tab lives in `.editor-instance`.

---

## Architecture

### Targets

The feature registry gains a target dimension. Each module keeps one flag and one toggle; it now has a block per target:

| Module | Target `claude` (unchanged) | Target `workbench` (new) |
|---|---|---|
| `theme` | `css/theme.css` → Claude Code `webview/index.css`, fonts in `webview/` | `css/copilot-theme.css` → `<appRoot>/out/vs/workbench/workbench.desktop.main.css`, fonts in `<appRoot>/out/vs/workbench/` |
| `rtl` | `css/rtl.css` → Claude Code `webview/index.css` | `css/copilot-rtl.css` → workbench CSS |

- Workbench markers: `/* bidi-copilot-theme-start */ … /* bidi-copilot-theme-end */` and `/* bidi-copilot-rtl-start */ … /* bidi-copilot-rtl-end */`. Canonical order inside the workbench CSS: theme, then rtl (as for Claude Code).
- Font targets reuse the theme's names (`bidi-theme-rubik-hebrew.woff2`, `bidi-theme-rubik-latin.woff2`), copied to `<appRoot>/out/vs/workbench/`.
- Sync runs per target with the existing pure `computeSyncedCss` and atomic write, on activation, on `extensions.onDidChange`, and on every toggle — through the same queue.
- **Checksum:** after the workbench CSS is written, the extension recomputes its checksum and replaces the old value in `product.json` by exact string replacement of that one value (no JSON re-serialization), atomically. When every workbench block is removed, it writes the checksum of the restored file. If `product.json` can't be written, the patch still applies and the warning is the only symptom (logged, not shown).
- **Missing targets:** a missing Claude Code install is skipped silently on activation and on updates. A toggle with no target at all shows the existing "not found" warning.
- **Health check:** extended with the workbench target — the chat class names the Copilot blocks rely on must appear in the workbench CSS; same once-per-version warning, keyed by target and version.
- **Uninstall cleanup:** strips the workbench blocks, deletes the copied fonts and restores the checksum, for the VS Code installation the hook runs from (its `appRoot` derived from `process.execPath`), in addition to every Claude Code install as today.
- **Restart prompt:** VS Code's main process reads `product.json` once, at startup, so the new
  checksum counts only after a full restart. After a change to the chat CSS, the prompt offers
  **Quit VS Code** and **Reload Window**. It explains that a reload shows VS Code's harmless
  "installation is corrupt" warning until the next restart *(changed after the final review)*.
  A change to Claude Code alone still offers a window reload. Every VS Code update means one extra
  restart.
- **Write errors:** a chat CSS that cannot be written (VS Code installed where the user cannot
  write) is reported once per VS Code version at activation, and every time on a toggle; after
  that it is only logged *(changed after the Task 7 review)*.

---

## Visual spec

Everything is scoped under `.monaco-workbench.vs-dark :is(.chat-viewpane,.editor-instance) .interactive-session:not(.chat-widget>.interactive-session)`. That covers the chat view and the chat editor tab, but not inline chat or quick chat *(changed while planning: the plain `.interactive-session` scope reached inline chat too)*. Light and high-contrast themes are untouched. Values are the Claude Code theme's (spec of 2026-10-09, as amended).

### Palette

Redefine, inside the scope, the `--vscode-*` tokens the chat consumes so they resolve to the warm palette:

| Role | Value |
|---|---|
| Chat background (`--vscode-chat-list-background`, and the session/view background) | `#1b1a18` |
| Text | `#ebe5da` |
| Secondary text | `#a39d92` |
| Borders | `#3b362f` |
| User message block (`--vscode-chat-requestBubbleBackground`, `--vscode-chat-requestBackground`) | `#262320`; hover (`--vscode-chat-requestBubbleHoverBackground`) `#2a2622` |
| Activity box surface / border / text | `#211f1c` / `#2b2824` / `#968f83`, tool names `#cfc6b7` |
| Input box fill / border / focus | `#242120` / `#736a5d` / `#d97757` |
| Accent (links, markers, focus) | `#d97757`, links `#e8a07f` |
| Inline code | `#2b2824` / `#f2b896` |
| Code blocks | `#121110` |
| Send button | `#c6613f` with ivory icon (as Claude Code's) |

### Typography

- `--vscode-chat-font-family: "BiDi Rubik", -apple-system, BlinkMacSystemFont, system-ui, sans-serif` inside the scope; base font size 15px on `.interactive-session` (the chat's `body-*` sizes are relative and scale with it); markdown line height 1.75; headings 20/18/16px weight 600 `#f5f0e8`; list markers `#d97757`.
- The same `@font-face "BiDi Rubik"` faces as the Claude theme (Hebrew and Latin subsets), with `src` relative to the workbench CSS.
- Code keeps the editor font.
- The input editor keeps VS Code's font, 13px with a 20px line height *(changed while planning: 18px Rubik there would break the caret and wrapping, which Monaco computes from its JS options)*.

### Layout and components

- **Width:** messages use the full width of the chat view (override the native `max-width:950px` on `.interactive-session`). The input part keeps VS Code's layout width: at most 950px including its 12px margins, so 926px, centered *(changed while planning: VS Code sizes the input editor for that width, so a narrower box would clip it)*. Code blocks are laid out by VS Code at most 910px wide, so in a chat wider than 950px long code lines wrap there (accepted).
- **Your messages:** a full-width block (not a right-aligned bubble): background `#262320`, radius 14px, padding 12px 16px, text `#f5f0e8`, `border-inline-start: 3px solid #d97757`.
- **Responses:** markdown as above; code blocks radius 12px, padding 12px 16px.
- **Activity:** status lines and parts — routing/progress lines, used references (`chat-used-context`), tool invocations (`chat-tool-invocation-part`), thinking (`chat-thinking-box`), terminal blocks (`chat-terminal-content-part`) — get the quiet box: surface `#211f1c`, 1px `#2b2824` border, radius 12px, 12.5px text `#968f83`. Consecutive parts read as one box where the DOM groups them; otherwise each part is its own box.
- **Confirmation widgets** (permission prompts): palette and radius only.
- **Composer (1.2×, as Claude Code's):**
  - Box: fill `#242120`, radius 18px, border `#736a5d`, focus `#d97757` (replacing the blue focus border).
  - Input text: keeps VS Code's font and size (see Typography).
  - `+`: a 36×34 icon button on the left, filled `#2f2b26` as in Claude Code.
  - Pickers: the mode picker and the model picker (a split button holding the model and its `Balance` setting) as 34px ghost pills: transparent, 1px `#453e35`, radius 11px, 15px text. They move to the right, next to the execute toolbar.
  - Mic: a 36×34 icon button.
  - Send: a 40px round button `#c6613f` with an ivory icon.
  - Secondary toolbar under the box (`Interactive`, `Manual permissions`): secondary text.
  - The box keeps its horizontal margins, padding and border width, which VS Code's JS assumes.
- **Unchanged:** the chat view title bar and tabs, and everything outside `.interactive-session`.

### Rules for the Copilot CSS files

- `css/copilot-theme.css`: every style rule's selectors start with the scope above; only `@font-face` at top level; no `direction`, `text-align` or `unicode-bidi`; no rule on the input editor (`.monaco-editor`, `.chat-editor-container`).
- `css/copilot-rtl.css`: only direction rules (`direction`, `text-align`, `unicode-bidi`, list marker placement and the bullet's `content`), scoped under `.interactive-session` (all themes, like the Claude RTL block), and never on the input part.
- Neither file uses `!important` unless a native inline style forces it, and then with a comment naming the element.

### RTL (as in Claude Code)

- Conversation container RTL with `text-align: start`; each paragraph, list item and the request text uses `unicode-bidi: plaintext`, so Hebrew paragraphs align right and English ones left.
- Code blocks, inline code, tool invocations, terminal blocks, file and reference pills, and toolbars stay LTR.
- The input editor keeps VS Code's left-to-right layout. Monaco has no right-to-left mode; Hebrew still reads in the right order within a line *(changed while planning)*.

---

## Testing

### Unit (mocha, existing setup; 130 tests today)

- Registry: each module has both targets; workbench markers and canonical order.
- Sync for the workbench target with temp folders: blocks added/removed, fonts copied/removed, untouched content byte-identical.
- Checksum: after a patch `product.json` holds the patched file's checksum and nothing else in the file changes; after removal it holds the original's; an unwritable `product.json` does not fail the sync.
- Copilot CSS rules test (scope prefix, at-rules, forbidden properties) and a coverage test tying every class it uses to the workbench health list.
- Activation harness: no Claude Code → no warning and the workbench target still syncs; one toggle updates both targets; health warning once per target and version.

### Visual fixture

- A static page reproducing the chat DOM from the captured sample (a Hebrew request, an English request, a response with heading, list, inline code and a code block, a routing line, a tool invocation, a thinking box, a terminal block, and the input part with its toolbars), loaded with the real `workbench.desktop.main.css` plus the synced blocks, rendered in headless Chrome with `.monaco-workbench.vs-dark` and with `.vs`.
- Checks: palette values, Rubik 15px messages, the input editor's text still 13px, user block full width, input part 926px, toolbar order (`+` left; pickers and send right), send 40px, RTL direction per paragraph, code LTR; in light mode nothing of the theme applies.

### Manual (VS Code Insiders here, with Copilot Free)

- A Copilot conversation with tools, code and Hebrew; input focused; light and high-contrast themes unchanged; all Theme/RTL toggle combinations; no "corrupt installation" warning after a full restart (a plain reload shows it until then); the chat in the side bar and in an editor tab.
- Then on the work Mac: install the VSIX, reload, repeat the conversation check.

---

## Risks

1. **VS Code updates.** Each update removes the patch; activation re-applies it and asks for one reload. On Insiders that's about daily.
2. **Checksum edit.** Writing `product.json` is a second change to the installation. It's a single value, replaced exactly; VS Code updates overwrite it anyway.
3. **DOM drift.** VS Code's chat changes often (new parts, new pickers). The stable class names and the health check limit the damage: missing hooks give one warning, nothing breaks.
4. **Testing quota.** Copilot Free has 50 chat requests a month on this Mac; the fixture carries most of the checking.
5. **Stable vs Insiders at work.** The work Mac may run stable VS Code, whose chat DOM can lag Insiders; the health check reports differences.
