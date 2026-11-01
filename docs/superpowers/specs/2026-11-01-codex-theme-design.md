# Codex Warm Theme and RTL — Design Spec

**Date:** 2026-11-01  
**Project:** `vscode-bidi-rtl` (this repo), version 0.3.0  
**Status:** Approved; implementation plan: [2026-11-01-codex-theme.md](../plans/2026-11-01-codex-theme.md). Decisions marked *(changed while planning)* come from a closer reading of Codex's code and a prototype rendered against its real CSS  
**Builds on:** 0.2.0 (Claude Code and Copilot chat) — see [`2026-10-22-copilot-chat-theme-design.md`](2026-10-22-copilot-chat-theme-design.md) and [`2026-10-09-claude-code-warm-theme-design.md`](2026-10-09-claude-code-warm-theme-design.md). Visual values are the Claude Code theme's; this spec maps them onto the Codex panel.

---

## Problem

At work the user also uses OpenAI's Codex extension (`openai.chatgpt`, "Codex – OpenAI's coding agent"). Its panel looks nothing like the warm Claude Code panel and the Copilot chat this extension already styles, and Hebrew reads badly: every paragraph is laid out left-to-right.

Unlike Claude Code and Copilot, Codex cannot be tried on this Mac: it is signed in only on the work Mac.

## Goal

Make the Codex panel look and read like the user's Claude Code panel, with the same Theme and RTL toggles. Do most of the checking here, against Codex's real files, so that the work Mac only confirms.

| Topic | Decision |
|---|---|
| Approach | A third patch target: the Codex webview's main stylesheet, with blocks appended as for Claude Code |
| Theme strategy | Token-first: redefine Codex's design tokens (colors, UI font, chat font size), plus a few component rules. Chosen over component-by-component rules because Codex's markup is mostly Tailwind utility classes |
| Toggles | The Theme and RTL toggles cover Codex too. A new command turns Codex styling off and on by itself, leaving Claude Code and Copilot styled |
| Apply | A window reload; no checksum and no restart |
| Testing here | Unit tests; a fixture built from Codex's real CSS; optionally, a live look at Codex's sign-in screen in a temporary Insiders profile |
| Testing at work | A checklist, a test prompt and a diagnostics script; the user brings screenshots and the script's report back here |
| Release | 0.3.0 as a GitHub pre-release, fixes as 0.3.x pre-releases, then a regular release once the work Mac confirms |

## Scope

- **In scope:** the Codex webview everywhere it appears: the side bar view (`chatgpt.sidebarView`), the secondary side bar view (`chatgpt.sidebarSecondaryView`), Codex editor panels (`chatgpt.newCodexPanel`) and the conversation editor (`chatgpt.conversationEditor`). All of them load the same `webview/index.html`. The theme applies in dark themes; RTL applies in every theme, as for the other targets.
- **Out of scope:** Codex's UI language (it ships no Hebrew locale); light and high-contrast themes; Codex in other editors (Cursor, Windsurf); the Codex CLI in a terminal; the reading width in a wide editor tab (Codex keeps its column of about 48rem, to revisit after the work check); a Codex usage counter.

---

## Background: how the Codex panel is built (Codex 26.51021.22027)

Checked on 2026-11-01 against the darwin-arm64 VSIX from the Marketplace (403 MB, released 2026-10-23), unpacked read-only in a scratch folder. Codex is not installed on this Mac.

- **One entry page.** Every Codex view and panel is a webview whose HTML comes from `<ext>/webview/index.html`. Codex reads that file from disk each time it creates a webview (`getWebviewContentProduction`) and replaces two placeholders with a `<base href>` (the webview folder) and a CSP `<meta>`. A patch therefore shows the next time a webview is created: after a window reload, or when the panel is reopened.
- **Stylesheet.** `index.html` links one stylesheet, `./assets/app-initial-<hash>.css` (1.2 MB, Tailwind v4), whose name changes with every build. Another 467 CSS files in `assets/` (3 MB with it) load on demand, among them the conversation's CSS modules. `index.html` declares the layers `@layer theme, base, components, utilities;`. Tailwind and the CSS modules checked (markdown, composer layout) sit in those layers, so unlayered rules at the end of `app-initial` win over them whatever their specificity.
- **CSP.** `style-src ${cspSource} 'unsafe-inline'; font-src ${cspSource}` with `localResourceRoots: [<ext>/webview]`. Fonts copied into `webview/assets/` load; nothing outside `webview/` can.
- **Size.** 17,596 JS files (567 MB): the webview bundles much of the ChatGPT app. Nothing in this design reads the JS at runtime.
- **Theme detection.** VS Code marks the webview's body (`class="vscode-dark"`, `data-vscode-theme-kind`), and Codex reads `data-vscode-theme-kind` to choose light or dark.
- **Tokens.** VS Code writes the theme's colors inline on the webview's `<html>` (`style="--vscode-foreground: …"`). Codex maps its design tokens to them under `:root[data-codex-window-type=extension]`, and again on `[data-theme]` elements, all inside `@layer theme`:
  - text: `--color-text`, `--color-text-secondary`, `--color-text-tertiary`, `--color-text-prose`;
  - surfaces: `--color-surface`, `--color-surface-secondary`, `--color-surface-tertiary`, `--color-surface-elevated`;
  - backgrounds: `--color-background-primary-soft`, `-ghost-hover` and `-soft-active`;
  - borders and focus: `--color-border`, `--color-border-subtle`, `--color-border-strong`, `--color-ring`;
  - about 290 `--color-token-*` values for inputs, buttons, menus, lists, editors and terminals.

  Some tokens name parts of the conversation directly: `--color-background-user-message`, `--color-text-user-message`, `--color-background-composer-primary` and `--color-text-composer-primary` (the send button). Borders and secondary text are mixes of the foreground (8% and 65%), unless the `--app-color-border` and `--app-color-text-secondary` hooks are set. `--color-background-execution-output` belongs to ChatGPT's Python analysis, not to Codex's commands; Codex draws command output with xterm in VS Code's terminal colors *(changed while planning)*.
- **Fonts and sizes.** `--font-sans` resolves to `--font-ui-family`, which is VS Code's UI font in the extension. `--font-mono` resolves to `--font-code-family`, the editor font. The chat size is `--codex-chat-font-size: var(--codex-chat-font-size-override, var(--font-ui-size, 13px))`.
- **Markup.** Mostly Tailwind utilities, plus CSS modules named `_<Name>_<hash>_<n>`. Like Claude Code's hashed names, these are matched with `[class*="_Name_"]`:
  - markdown: `_MarkdownRoot_`, `_Paragraph_`, `_Heading_`, `_List_`, `_OrderedList_`, `_UnorderedList_`, `_ListItem_`, `_Blockquote_`, `_TableCell_`, `_TableHeaderCell_`, `_CodeBlock_`, `_InlineCode_`;
  - the composer: `_ComposerLayoutRoot_` and `_RichTextInput_` around a ProseMirror editor (`.ProseMirror`, one `<p>` per line);
  - the user message: a bubble with `.bg-user-message`, the `_bubble_` module and `data-user-message-bubble`, aligned to the end, at most `--user-chat-width` wide. Its text is markdown too, with `data-markdown-text-tone="user-message"` and `white-space: pre-wrap`;
  - the composer's surface: `border: 0 !important` inside a layer (which no unlayered rule can override), a background from `--composer-layout-surface-background` and a shadow from `--composer-layout-surface-shadow`.
- **Direction** *(changed while planning)*. Codex has RTL rules for right-to-left UI locales (`:lang(he)` and others), but ships no Hebrew locale. Its markdown already handles most of the direction: the root and every paragraph, heading, list, quote and table cell get `dir="auto"`, inline code and code blocks get `dir="ltr"`, and assistant text isolates a trailing run in the other direction in a `<bdi>`. Three gaps remain:
  - a list item follows its list's first item, not its own text;
  - each line of a user message follows the whole paragraph (`dir="auto"` looks at the first line only);
  - the composer has no direction handling: a Hebrew line types left-to-right.
- **No asset cache.** The webview's service worker (`webview/service-worker/events.js`) handles push notifications only, so patched files are never served from a cache.
- **Updates.** About weekly, sometimes several times a week: 14 releases between 2026-09-03 and 2026-10-23. Each version installs into its own folder, `openai.chatgpt-<version>-<platform>`.

Which element carries which class in a live conversation is not known here. The fixture reproduces the nesting from Codex's component code, and the work Mac confirms it. A prototype of both blocks, rendered in headless Chrome against Codex's real CSS, gave every value of the visual spec below *(changed while planning)*.

---

## Architecture

### Target

| Module | `claude` | `workbench` | `codex` (new) |
|---|---|---|---|
| `theme` | `css/theme.css` | `css/copilot-theme.css` | `css/codex-theme.css` → Codex's `webview/assets/app-initial-<hash>.css`, fonts in the same `assets/` folder |
| `rtl` | `css/rtl.css` | `css/copilot-rtl.css` | `css/codex-rtl.css` → the same stylesheet |

- **Markers:** `/* bidi-codex-theme-start */ … /* bidi-codex-theme-end */` and `/* bidi-codex-rtl-start */ … /* bidi-codex-rtl-end */`. Canonical order: theme, then rtl.
- **Fonts:** the theme's Rubik files, under their usual names, copied next to the stylesheet.
- **Finding the stylesheet:** take `vscode.extensions.getExtension('openai.chatgpt')?.extensionPath` and read its `webview/index.html`. The stylesheet is the `href` of the first `<link rel="stylesheet">`, resolved against `webview/`. It must stay inside `webview/` and exist; otherwise Codex counts as changed (see below) and is skipped.
- **Sync:** the existing `syncCssFile` with the `codex` target. It runs on activation, on `extensions.onDidChange` (a Codex update brings a new folder) and on every toggle, through the same queue.
- **Codex switch:** a globalState flag `bidiCodex.enabled` (default on) and the command `BiDi Codex: Toggle Codex Styling On/Off` (`bidi-codex.toggle`). Codex receives the enabled modules only while the switch is on. Turning it off strips both Codex blocks and the fonts. The Theme and RTL flags and the other targets are not affected.
- **Apply:** a change to Codex alone offers Reload Window. When the Copilot chat changed in the same sync, the existing Quit/Reload prompt applies.
- **Missing Codex:** skipped silently, like the other targets. The "nothing to change" warning, shown when a toggle finds no target at all, names all three.
- **Layout changes:** when `index.html` has no usable stylesheet link, Codex is skipped and a warning shows once per Codex version: Codex `<version>` changed its layout, so it cannot be styled.
- **Write errors:** reported as for Claude Code.
- **Health check:** while the theme is on, the check runs once per Codex version. It verifies that every hook the Codex blocks rely on still appears in Codex's CSS files (`webview/assets/*.css`, about 3 MB). The hooks are the tokens and class names listed under the CSS rules below; each must appear in CSS, so the user message is matched as `.bg-user-message[class*="_bubble_"]` (its `data-user-message-bubble` attribute appears only in JS) *(changed while planning)*. A missing hook gives one warning per Codex version, kept under its own globalState key. The theme stays applied.
- **Uninstall:** the hook also cleans every `openai.chatgpt-*` folder in the extensions root (blocks stripped, fonts deleted), as it does for `anthropic.claude-code-*`. A folder that fails does not stop the others.
- **Status bar:** the Theme and RTL tooltips name everything they control: Claude Code, Copilot and Codex.
- **Diagnostics:** `BiDi Codex: Copy Diagnostics Script` (`bidi-codex.copyDiagnostics`) copies the script below to the clipboard and shows the steps to run it.
- **Identity:** version 0.3.0. `displayName` becomes "BiDi RTL & Theme for Claude Code, Copilot and Codex", and the description names Codex. The README gains a Codex section.

### Diagnostics script

The script is a plain JS file shipped in the VSIX as `diagnostics/codex.js` (`scripts/` is not packaged). It is meant to be pasted into the Codex webview's DevTools console: run **Developer: Open Webview Developer Tools** and type `allow pasting` before the first paste. The script:

- finds the Codex document: the current frame, or a same-origin child frame, whichever root has `data-codex-window-type`. When it finds none, it says to pick the `active-frame` context in the console;
- reads only structure and computed styles, never text, attribute values (other than class names) or file names;
- reports:
  - the theme kind;
  - whether each block is active. Theme is active when the chat font size override is 15px; RTL is active when a markdown paragraph has `unicode-bidi: plaintext`;
  - BiDi Rubik's status in `document.fonts`;
  - how many elements each hook matches;
  - for up to 10 each of the paragraphs (yours and Codex's), headings, list items and composer lines: the direction of the first strong character (computed in place, never exported), and the computed direction, unicode-bidi, text-align, first font and size;
  - which side of its box each sample's text sits on;
  - the class lists of the markdown root, the user message, the composer, its editor and the first code block, and of their ancestors up to 4 levels;
  - the names of the loaded stylesheets;
- copies the report as JSON with DevTools' `copy()` and prints a short summary.

---

## Visual spec

The values are the Claude Code theme's (spec of 2026-10-09, as amended), as in the Copilot spec.

### Theme (`css/codex-theme.css`)

Every selector starts with `body.vscode-dark` or, for the palette on `<html>`, with `:root:has(>body.vscode-dark)` *(changed while planning)*. Light and high-contrast themes are untouched.

**Palette** *(changed while planning)*. The warm values go where the colors come from:
- **VS Code's colors,** `--vscode-*`, are redefined on `:root:has(>body.vscode-dark)`, with `!important` because VS Code writes them inline on `<html>`. Every Codex token derived from them, on `:root` and on `[data-theme]` elements, then follows, including the ones derived from other tokens.
- **Codex's own tokens** that do not come from VS Code's colors are redefined on `:root:has(>body.vscode-dark)` and on its `[data-theme]` descendants. Codex declares them in `@layer theme`, which an unlayered rule outranks, so they need no `!important`.
- **The body** paints the panel background itself, since the webview's body is transparent over VS Code's side bar.

| Role | Where it is set | Value |
|---|---|---|
| Panel background | `body` background; `--vscode-sideBar-background`, `--vscode-editor-background`, `--vscode-panel-background` | `#1b1a18` |
| Text | `--vscode-foreground` | `#ebe5da` |
| Secondary text | `--app-color-text-secondary`, `--vscode-descriptionForeground` | `#a39d92` |
| Disabled text | `--vscode-disabledForeground` | `#7d766a` |
| Borders | `--app-color-border`, `--vscode-widget-border`, the menu and dropdown borders | `#3b362f` |
| Hover / selected | `--vscode-list-hoverBackground`, `--vscode-toolbar-hoverBackground` / the list and menu selection | `#2a2622` / `#3a332b` |
| Inputs, menus, dropdowns, the composer | `--vscode-input-background`, `--vscode-menu-background`, `--vscode-dropdown-background`, `--vscode-editorWidget-background` | `#242120` |
| Input border / focus | `--vscode-input-border` / `--vscode-focusBorder` | `#736a5d` / `#d97757` |
| Accent / links | `--vscode-button-background`, `--vscode-badge-background` / `--vscode-textLink-foreground` | `#d97757` / `#e8a07f` |
| Inline code | `--vscode-textPreformat-*`, and `[class*="_InlineCode_"]` directly | `#2b2824` / `#f2b896` |
| Code blocks | `--vscode-textCodeBlock-background` | `#121110` |
| Your messages | `--color-background-user-message` / `--color-text-user-message` | `#262320` / `#f5f0e8` |
| Command output | `--vscode-terminal-background` / `--vscode-terminal-foreground` | `#121110` / `#cfc6b7` |
| Send button | `--color-background-composer-primary` / `--color-text-composer-primary` (confirmed: the button's `bg-composer-primary` and `text-composer-primary`) | `#c6613f` / `#faf9f5` |

**Typography.**

- `--font-ui-family: "BiDi Rubik", -apple-system, BlinkMacSystemFont, system-ui, sans-serif`, so the whole panel uses Rubik, with the same `@font-face` faces (Hebrew and Latin subsets) as the Claude theme.
- `--codex-chat-font-size-override: 15px`.
- Code keeps the editor font.
- Markdown line height 1.75, through Codex's `--markdown-line-height`; headings 20/18/16px, weight 600, `#f5f0e8`; list markers `#d97757`.

**Components.**

- **Your messages:** a full-width block rather than an end-aligned bubble, as in Claude Code and Copilot: background `#262320`, radius 14px, padding 12px 16px, text `#f5f0e8`, `border-inline-start: 3px solid #d97757`. With RTL on, the block is right-to-left, so the bar sits on the right, as in Claude Code and Copilot *(changed while planning)*.
- **Responses:** the markdown described above. Paragraph spacing and code blocks keep Codex's own layout, on the warm tokens *(changed while planning)*.
- **Activity** (reasoning, commands, file changes): takes the palette through the tokens. No quiet boxes in this version: no stable hook was found for them. To revisit with the work check's report *(changed while planning)*.
- **Composer:** fill `#242120` (through the tokens), radius 18px through `--composer-border-radius`, and a 1px ring `#736a5d`, `#d97757` while focused, through `--composer-layout-surface-shadow`, since Codex forces `border: 0 !important` there. The input text is 18px with a 1.5 line height (1.2× like Claude Code's). Codex keeps the size of its buttons and pickers, whose layout is Tailwind utilities *(changed while planning)*.
- **Width:** Codex's own.

### RTL (`css/codex-rtl.css`)

The RTL block applies in every theme.

The block fills the three gaps in Codex's own direction handling and keeps its `dir` attributes *(changed while planning)*:
- **Markdown:** paragraphs, headings, list items and quotes inside `[class*="_MarkdownRoot_"]` get `unicode-bidi: plaintext; text-align: start`. Each line then follows its own text: a list item its own language, a line of a user message its own language. The markdown root keeps Codex's `dir="auto"`, so an English table is not mirrored.
- **Lists:** markers inside the item, with `::marker { unicode-bidi: normal }`, and the bullet as `"\2022  "`, as in the Copilot block. In a loose list, whose items hold paragraphs, an item's first paragraph runs inline (`display:inline; unicode-bidi:normal`) so the marker sits beside its text rather than alone on the line above *(changed during execution, Task 2 review)*.
- **Your messages:** the bubble is right-to-left (its accent bar on the right); its text follows the markdown rule above.
- **Composer:** each ProseMirror line (`p`, `li`, headings, quotes inside `[class*="_RichTextInput_"] .ProseMirror`) follows its own text. A Hebrew line types right-to-left and aligns right.
- **Kept left-to-right:** nothing to add: Codex marks inline code, code blocks and command output `dir="ltr"`, which isolates them from the paragraph around them.

### Rules for the Codex CSS files

Unit tests enforce these rules, as for the other targets.

- **`css/codex-theme.css`:**
  - every style rule's selectors start with `body.vscode-dark` or `:root:has(>body.vscode-dark)`;
  - the only top-level at-rule is `@font-face`;
  - no `direction`, `text-align` or `unicode-bidi`.
- **`css/codex-rtl.css`:** only `direction`, `text-align`, `unicode-bidi`, list marker placement and the bullet's `content`, plus `display:inline` on a list item's first paragraph *(changed during execution)*; every selector starts with `[class*="_MarkdownRoot_"]`, `[class*="_RichTextInput_"]` or the user message (`.bg-user-message[class*="_bubble_"]`).
- **Hooks, in both files:** selectors may use only:
  - CSS-module prefixes (`[class*="_Name_"]`, never a full hashed name);
  - semantic classes and attributes from a fixed list, kept with the health check's hooks (the classes `ProseMirror` and `bg-user-message`, and the attributes `data-theme` and `data-composer-surface-variant`) *(changed while planning)*;
  - plain elements.

  Tailwind layout utilities such as `px-2` or `rounded-2xl` are not allowed. Codex's own custom properties that the files set or read count as hooks too (`--vscode-*` ones do not: they are VS Code's). The health check's hook list must be exactly the hooks the two files use; a coverage test checks both directions.
- **`!important`:** only on the `--vscode-*` colors of the palette rule, which VS Code writes inline on `<html>` *(changed while planning)*.

---

## Testing

### Unit (mocha; 189 tests today)

- **Registry:** each module has three targets; the Codex markers; the canonical order.
- **Finding the stylesheet:**
  - the first stylesheet link wins;
  - `./` and bare relative hrefs both resolve;
  - a link that leaves `webview/` is rejected;
  - no link, or a missing file, counts as a layout change.
- **Sync** into a temporary Codex install (`webview/index.html` plus `webview/assets/app-initial-<hash>.css`):
  - blocks are added and removed;
  - fonts are copied into `assets/`;
  - untouched content stays byte-identical;
  - the Codex switch strips both blocks and the fonts while the other targets keep theirs.
- **Cleanup and uninstall:** every `openai.chatgpt-*` folder is cleaned, and a broken one does not stop the others.
- **Health:** hooks found, missing and unreadable; one warning per Codex version.
- **CSS rules:** the rules test (selector prefix, at-rules, forbidden properties, hook list) and the coverage test.
- **Activation:**
  - Codex alone, with no Claude Code and no chat CSS, syncs;
  - one toggle updates all three targets;
  - a Codex-only change offers Reload, not Quit;
  - the Codex switch command works;
  - the diagnostics command copies the script.

### Visual fixture (`npm run fixture:codex -- <unpacked Codex extension>`)

- **The page:**
  - `<html data-codex-window-type="extension">` and `<body class="vscode-dark" data-vscode-theme-kind="vscode-dark">`, with VS Code's Dark Modern `--vscode-*` values;
  - Codex's real `app-initial` stylesheet, plus the CSS modules the conversation loads (markdown, user message bubble, user text, composer layout, prompt editor, ProseMirror, composer content), found in `assets/` by name prefix;
  - the synced blocks.
- **The DOM,** reproduced from Codex's component code with its real class strings:
  - a user message with a Hebrew line and an English line;
  - a response with a Hebrew heading, Hebrew and English paragraphs, a list with an English item and a Hebrew item, a loose list of the same, inline code and a code block;
  - secondary text and a bordered box;
  - the composer with a Hebrew line and an English line, and its send button.

  Command output is drawn by xterm in Codex, so the fixture cannot show it *(changed while planning)*.
- **Checks:**
  - palette values, borders and secondary text;
  - Rubik at 15px in messages, 18px in the composer;
  - the user block at full width with its accent bar on the right;
  - the composer's ring, and its focus color;
  - alignment per paragraph and per line;
  - list markers on the side of their item;
  - code left-to-right;
  - under `vscode-light`, none of the theme applies but RTL does;
  - the diagnostics script's report has the expected shape and contains none of the fixture's text.
- **Screenshots** in dark and light, shown to the user before the work check.

### Live check here (optional; ask first)

VS Code Insiders runs with a temporary user-data folder and extensions folder, never the user's profile. Codex is installed there from the downloaded VSIX and left signed out. Its sign-in screen shows, end to end:
- the stylesheet was found and patched;
- Rubik loaded through the CSP;
- the warm background and text took effect;
- the Reload flow works.

These are checked over CDP, as for the Copilot input fix.

### Work Mac

1. Install 0.3.0 from the GitHub pre-release, reload the window and open Codex.
2. Run the test prompt, kept in the README's Codex section and in the release notes. It asks Codex for:
   - a Hebrew paragraph and an English paragraph;
   - a Hebrew numbered list and an English bulleted list;
   - a short code block;
   - running `ls`;
   - creating a small file.

   Then type a Hebrew line and an English line in the composer.
3. Go through the checklist: numbered items, each saying what should be seen.
4. Run the diagnostics script and take screenshots; bring both back here.
5. Fixes ship as 0.3.x pre-releases. Once the work Mac confirms, publish a regular release and update the README and the project memory.

---

## Risks

1. **Unseen DOM.** The live conversation's nesting is inferred from component code. Mitigation: the token-first theme, the fixture built from real class strings, the diagnostics report and the Codex switch.
2. **Frequent updates.** Codex releases about weekly, with hashed file and class names and a new folder per version. Mitigation: a re-sync on every update, class-prefix matching and a health check per version.
3. **Cascade.** CSS files loaded on demand come after `app-initial`, so their unlayered rules would beat ours at equal specificity. The ones checked are layered; the fixture loads the conversation's CSS modules to catch exceptions.
4. **Differences on the work Mac.** Its Codex version may differ from 26.51021; the health check and the report show it. Webview DevTools may be unavailable there; screenshots and the checklist still work.
5. **Round trips.** Each round takes a day (here, then work, then here). The fixture carries most of the checking.
