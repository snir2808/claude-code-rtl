# BiDi RTL & Theme for Claude Code, Copilot and Codex

A small VS Code extension for the Claude Code conversation panel, VS Code's Copilot chat and OpenAI's Codex panel:

- **RTL** makes mixed Hebrew/English conversations read naturally.
- **Theme** gives the panel a warm, easier-to-read look in dark themes.
- **Session clock** shows in the status bar when your 5-hour usage window resets.
- **Copilot chat** gets the same RTL and theme: VS Code's built-in chat, where GitHub Copilot runs, looks and reads like the Claude Code panel.
- **Codex** gets the same RTL and theme: OpenAI's Codex panel looks and reads like the Claude Code panel.

If you talk to Claude Code in Hebrew, you've seen it: punctuation jumps to the wrong side,
mixed Hebrew/English lines scramble, and reading your own prompt back is a headache. This
extension fixes that at the source.

## What it does

### RTL

- Hebrew paragraphs align right, English paragraphs align left.
- Lists follow the language of each item.
- Code, tool calls, diffs and buttons stay LTR.

### Theme (dark themes only)

- A warm palette that meets WCAG AA contrast, with 15px Rubik text and roomier line spacing.
- Your messages as soft blocks; tool calls grouped into quiet boxes.
- A roomier input box (1.2x bigger than Claude Code's: 816px wide, 18px text, bigger buttons; changed 2026-10-10 at the user's request): actions on the left, status on the right.

The "Thinking" label stays left-to-right inside the RTL conversation, and the cache timer, the
selection chip and the agents pill use the same 15px text as the footer buttons.

Light and high-contrast themes are left untouched.

### Copilot chat

The same two modules style VS Code's built-in chat, where GitHub Copilot runs, in dark themes:

- the warm palette and 15px Rubik text, with messages across the full width of the chat;
- your messages as soft blocks with an accent bar;
- quiet boxes for tool calls, thinking and terminal output;
- the roomier input box: `+` on the left; the mode, model and other pickers next to the send
  button on the right;
- Hebrew paragraphs aligned right and English ones left, with code, tools and toolbars kept
  left-to-right.

The **Theme** and **RTL** buttons control Claude Code and the Copilot chat together. Light and
high-contrast themes are left untouched.

Some parts of the chat are laid out by VS Code itself, so they keep VS Code's own size:

- the text you type keeps VS Code's size; a line with Hebrew turns right-to-left and aligns
  right, and in dark themes its Hebrew letters use Rubik (VS Code's own font list draws them in
  Courier New);
- the input box keeps VS Code's width, up to about 926px, centered;
- in a chat wider than 950px (say, a chat editor tab on a wide screen), long code lines still
  wrap or scroll at about 910px.

Inline chat in the editor and quick chat are left as they are.

VS Code loads its chat styles when a window opens, before extensions start. It also checks its own
files against checksums it reads once, when it starts. So after you install this extension, and
after every VS Code update (an update replaces VS Code's files), the extension applies the styles
again and asks you to **quit and reopen VS Code**. **Reload Window** also applies them, but VS Code
then shows "Your Code installation appears to be corrupt" until its next restart. That warning is
harmless.

### Codex

The same two modules style OpenAI's Codex panel (the Codex extension, in the side bar and in
editor tabs):

- the warm palette, in dark themes, across the whole panel, with Rubik text at 15px;
- your messages as full-width blocks with an accent bar;
- headings, list markers and inline code as in the Claude Code panel;
- the composer: 18px text, a warm box with a thin ring that turns orange while you type, and an
  orange send button;
- RTL, in every theme, that completes Codex's own: Codex already lays out each paragraph in its
  own direction, and the extension adds each list item, each line of your messages and each line
  you type in the composer. Code and commands stay left-to-right.

The **Theme** and **RTL** buttons control Codex too. To leave Codex as it is while Claude Code
and the Copilot chat stay styled, run `BiDi Codex: Toggle Codex Styling On/Off`.

Codex reads its stylesheet each time it opens its panel, so a change to Codex applies after
**Reload Window**: no restart, no checksum.

### Checking the Codex panel

After installing or updating, a quick check:

1. Send Codex this prompt:

   > Write a short paragraph in Hebrew and a short paragraph in English. Then a numbered list
   > with one Hebrew item and one English item, a bulleted list the same way, and a short
   > JavaScript code block. Then run `ls` and create a file named bidi-check.txt with one line in
   > Hebrew.

2. In the composer, type a Hebrew line and an English line (Shift+Enter between them). Then check
   that:
   1. the panel is warm brown, with Rubik text at 15px;
   2. your message is a full-width block with an orange bar on the right;
   3. the Hebrew paragraph sits on the right and the English one on the left;
   4. in each list, the Hebrew item and its number or bullet sit on the right, and the English
      item on the left;
   5. the code block, the command and its output read left-to-right;
   6. in the composer, the Hebrew line sits on the right and the English line on the left, at
      18px;
   7. the composer has a thin ring that turns orange while you type, and an orange send button;
   8. after `BiDi Codex: Toggle Codex Styling On/Off` and a window reload, Codex looks as it did
      without the extension, and the Copilot chat keeps its theme. Run the command again to bring
      the style back.
3. Run `BiDi Codex: Copy Diagnostics Script` and follow the steps it shows. The script copies a
   report on how the styles apply, without any message text. Paste the report into an issue,
   with a screenshot of anything that looks wrong.

### Session clock

A status-bar item, `⏱ 17:42 · 42%`, shows when your current 5-hour Claude usage window resets
and how much of it you've used. Hover for the weekly window; click to refresh.

The clock is off until you turn it on. The first time the extension starts, it asks once, from whichever window has focus (a window
that starts in the background waits until you switch to it, so you are never asked twice):

> BiDi: Show when your Claude 5-hour session resets in the status bar? It reads Claude Code's
> sign-in from the macOS Keychain and asks Anthropic for your usage.

**Enable** turns it on. **Not now**, or closing the message, leaves it off: nothing is read and
nothing is sent. `BiDi Usage: Toggle Session Clock On/Off` turns it on or off at any time, and off
stops all Keychain and network access. Clicking the clock while it is off says so and offers a
**Turn on** button. An idle account with no active 5-hour window shows `—`, not an error.

It asks Anthropic's usage endpoint (the one Claude Code itself uses) with the login Claude Code
already stored on your machine: the macOS Keychain entry `Claude Code-credentials`, or
`~/.claude/.credentials.json` elsewhere (where the question names that file instead). The token is
read fresh for each refresh, sent only to `api.anthropic.com`, and never logged or stored.

- **Keychain:** there is normally no dialog, because Claude Code stored the entry with macOS's
  own `security` tool, which is also what the clock reads it with. A locked keychain may ask you
  to unlock it. If you decline or don't answer, the clock shows `—` with the reason on hover and
  pauses until you click it, toggle it, or reload the window.
- **Refreshes:** when VS Code starts, every 5 minutes in the focused window, when a window
  regains focus (at most once a minute), and right after the session window resets.
- **Not supported:** an API-key sign-in stores no Claude.ai login, so the clock says
  `not signed in to Claude Code`. So do setups with a custom `CLAUDE_CONFIG_DIR` or
  `CLAUDE_SECURESTORAGE_CONFIG_DIR`, which keep the sign-in somewhere else.

No telemetry, no network calls besides that one, and no settings to configure.

## Install

This extension is distributed as a `.vsix` file (it's not on the Marketplace).

1. Download `vscode-bidi-rtl-0.3.0.vsix` from the [latest release](../../releases/latest).
2. In VS Code: **Extensions** panel → `…` menu → **Install from VSIX…** → pick the file.
   Or from the terminal:
   ```bash
   code --install-extension vscode-bidi-rtl-0.3.0.vsix
   ```
3. Reload the window. RTL and the theme are applied automatically on startup, to Claude Code, the Copilot chat and Codex (for the chat, quit and reopen VS Code once more when the extension asks). The session clock asks first.

## Commands

| Command | What it does |
|---|---|
| `BiDi RTL: Toggle RTL On/Off` | Turns RTL on or off (remembered across restarts). Also the **RTL** button in the status bar. |
| `BiDi Theme: Toggle Warm Theme On/Off` | Turns the theme on or off (remembered across restarts). Also the **Theme** button in the status bar. |
| `BiDi Codex: Toggle Codex Styling On/Off` | Turns the styling of the Codex panel off, or back on, on its own (remembered across restarts). The Theme and RTL buttons keep controlling Claude Code and the Copilot chat. |
| `BiDi Codex: Copy Diagnostics Script` | Copies a script for the Codex panel's DevTools that reports how the styles apply, without any message text. |
| `BiDi Usage: Toggle Session Clock On/Off` | Shows or hides the session clock. Off means no Keychain reads and no network requests. |
| `BiDi Usage: Refresh Session Clock` | Refreshes the clock now (same as clicking it). While the clock is off it offers to turn it on. |
| `BiDi RTL: Apply RTL Patch` | Turns RTL on. |
| `BiDi RTL: Remove RTL Patch` | Turns RTL off. |

## How it works

Claude Code renders its conversation in a webview. This extension appends one clearly marked
CSS block per enabled module to that webview's `index.css`, and copies the theme's font files
next to it.

For the Copilot chat, the blocks go into VS Code's own `workbench.desktop.main.css`, inside the
VS Code application, with the fonts next to it. VS Code keeps a checksum of that file in its
`product.json` and would otherwise report that the installation is corrupt. The extension sets
that one checksum after every change and restores it when the blocks are removed. VS Code reads
its checksums when it starts, so a new one counts from the next restart.

For Codex, the blocks go into the stylesheet that Codex's `webview/index.html` links, inside
Codex's extension folder, with the fonts next to it. Codex reads that page and its stylesheet
each time it opens its panel, so a change applies with a window reload, and there is no checksum.

- Each enabled block is re-applied automatically after a Claude Code update.
- While the theme is on, every sync (at startup, after a Claude Code update, on each toggle)
  checks that the parts of Claude Code the theme styles are still there, and warns once per
  Claude Code version if something is missing.
- A VS Code update replaces the chat's stylesheet, so the extension applies the chat blocks again
  at the next start and asks you to restart VS Code once. On VS Code Insiders that is about once a day.
- While the theme is on, the extension also checks that the chat's class names it styles are
  still in VS Code, and warns once per VS Code version if some are gone.
- Each Codex update installs a new folder. The extension styles it as soon as VS Code reports the
  update, and asks for a window reload. While the theme is on, it checks that the parts of Codex
  it styles are still in Codex's stylesheets, and warns once per Codex version if some are gone.
  If Codex stops linking a stylesheet the extension can find, the extension says so once per
  Codex version and leaves Codex as it is.
- When VS Code is installed where your user cannot write (for example an `/Applications` copy
  owned by an administrator), the chat cannot be styled. The extension says so once per VS Code
  version when a window opens (and every time you toggle a module), and Claude Code is still
  styled.
- Uninstalling the extension removes the blocks and fonts by itself, from every Claude Code
  install, from every Codex install and from the VS Code it was uninstalled in (restoring its
  checksum). The cleanup runs the next time VS Code fully restarts after the uninstall, because
  that is when VS Code runs uninstall hooks. Another copy of VS Code that shares the same
  extensions folder keeps its chat styles until its next update: turn both modules off there first.
- *Disabling* the extension (as opposed to uninstalling it) keeps the patch, so use the toggles
  to turn the modules off.
- Going back to 0.0.3 leaves the theme block and its fonts behind, since 0.0.3 knows only the RTL
  block. Turn the theme off first (or uninstall 0.1.0 and restart VS Code), then install 0.0.3.
- Going back to 0.1.0 leaves the Copilot chat styled until the next VS Code update, since 0.1.0
  knows only Claude Code. Turn both modules off first, then install 0.1.0.
- Going back to 0.2.0 leaves Codex styled until its next update, since 0.2.0 knows only Claude
  Code and the Copilot chat. Turn Codex off first (`BiDi Codex: Toggle Codex Styling On/Off`),
  then install 0.2.0.

## Build from source

```bash
npm install
npm run compile
npx vsce package   # produces the .vsix
npm test           # runs the unit and integration tests
npm run fixture -- <path-to-claude-code-extension>   # renders the theme in headless Chrome
npm run fixture:chat -- "<VS Code app root>"   # renders the Copilot chat fixture, e.g. /Applications/Visual Studio Code.app/Contents/Resources/app
npm run fixture:codex -- <codex-extension-dir>   # renders the Codex fixture, e.g. ~/.vscode/extensions/openai.chatgpt-26.51021.22027-darwin-arm64
```

## Credits

The theme bundles [Rubik](https://github.com/googlefonts/rubik) (Hebrew and Latin subsets),
licensed under the SIL Open Font License 1.1 — see `fonts/OFL.txt`.

## Notes

Built for personal use and shared as-is. It edits Claude Code's and Codex's own CSS and VS Code's
workbench CSS, which is a bit of a hack by nature — if an update to either changes the markup, the
patch may need updating. PRs welcome.

## License

MIT.
