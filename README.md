# BiDi RTL & Theme for Claude Code

A small VS Code extension for the Claude Code conversation panel:

- **RTL** makes mixed Hebrew/English conversations read naturally.
- **Theme** gives the panel a warm, easier-to-read look in dark themes.
- **Session clock** shows in the status bar when your 5-hour usage window resets.

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
- A roomier input box: bigger buttons, actions on the left, status on the right.

Light and high-contrast themes are left untouched.

### Session clock

A status-bar item, `⏱ 17:42 · 42%`, shows when your current 5-hour Claude usage window resets
and how much of it you've used. Hover for the weekly window; click to refresh.

The clock is off until you turn it on. The first time the extension starts, it asks once:

> BiDi: Show when your Claude 5-hour session resets in the status bar? It reads Claude Code's
> sign-in from the macOS Keychain and asks Anthropic for your usage.

**Enable** turns it on. **Not now**, or closing the message, leaves it off: nothing is read and
nothing is sent. `BiDi Usage: Toggle Session Clock On/Off` turns it on or off at any time, and off
stops all Keychain and network access.

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

1. Download `vscode-bidi-rtl-0.1.0.vsix` from the [latest release](../../releases/latest).
2. In VS Code: **Extensions** panel → `…` menu → **Install from VSIX…** → pick the file.
   Or from the terminal:
   ```bash
   code --install-extension vscode-bidi-rtl-0.1.0.vsix
   ```
3. Reload the window. RTL and the theme are applied automatically on startup; the session clock
   asks first.

## Commands

| Command | What it does |
|---|---|
| `BiDi RTL: Toggle RTL On/Off` | Turns RTL on or off (remembered across restarts). Also the **RTL** button in the status bar. |
| `BiDi Theme: Toggle Warm Theme On/Off` | Turns the theme on or off (remembered across restarts). Also the **Theme** button in the status bar. |
| `BiDi Usage: Toggle Session Clock On/Off` | Shows or hides the session clock. Off means no Keychain reads and no network requests. |
| `BiDi Usage: Refresh Session Clock` | Refreshes the clock now (same as clicking it). |
| `BiDi RTL: Apply RTL Patch to Claude Code` | Turns RTL on. |
| `BiDi RTL: Remove RTL Patch` | Turns RTL off. |

## How it works

Claude Code renders its conversation in a webview. This extension appends one clearly marked
CSS block per enabled module to that webview's `index.css`, and copies the theme's font files
next to it.

- Each enabled block is re-applied automatically after a Claude Code update.
- While the theme is on, every sync (at startup, after a Claude Code update, on each toggle)
  checks that the parts of Claude Code the theme styles are still there, and warns once per
  Claude Code version if something is missing.
- Uninstalling the extension removes the blocks and fonts by itself. The cleanup runs the next
  time VS Code fully restarts after the uninstall, because that is when VS Code runs uninstall
  hooks.
- *Disabling* the extension (as opposed to uninstalling it) keeps the patch, so use the toggles
  to turn the modules off.
- Going back to 0.0.3 leaves the theme block and its fonts behind, since 0.0.3 knows only the RTL
  block. Turn the theme off first (or uninstall 0.1.0 and restart VS Code), then install 0.0.3.

## Build from source

```bash
npm install
npm run compile
npx vsce package   # produces the .vsix
npm test           # runs the unit and integration tests
npm run fixture -- <path-to-claude-code-extension>   # renders the theme in headless Chrome
```

## Credits

The theme bundles [Rubik](https://github.com/googlefonts/rubik) (Hebrew and Latin subsets),
licensed under the SIL Open Font License 1.1 — see `fonts/OFL.txt`.

## Notes

Built for personal use and shared as-is. It edits Claude Code's own CSS, which is a bit of a hack
by nature — if a Claude Code update changes the markup, the patch may need updating. PRs welcome.

## License

MIT.
