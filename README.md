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
- One centered 680px reading column when Claude Code is open in an editor tab.
- Your messages as soft blocks; tool calls grouped into quiet boxes.
- A roomier input box: bigger buttons, actions on the left, status on the right.

Light and high-contrast themes are left untouched.

### Session clock

A status-bar item, `⏱ 17:42 · 42%`, shows when your current 5-hour Claude usage window resets
and how much of it you've used. Hover for the weekly window; click to refresh.

It asks Anthropic's usage endpoint (the one Claude Code itself uses) with the login Claude Code
already stored on your machine: the macOS Keychain entry `Claude Code-credentials`, or
`~/.claude/.credentials.json` elsewhere. The token is read fresh for each refresh, sent only to
`api.anthropic.com`, and never logged or stored. macOS may ask once to allow Keychain access; if
you decline, the clock says so and stops asking until you click it.

No telemetry, no network calls besides that one, and no settings to configure.

## Install

This extension is distributed as a `.vsix` file (it's not on the Marketplace).

1. Download `vscode-bidi-rtl-0.1.0.vsix` from the [latest release](../../releases/latest).
2. In VS Code: **Extensions** panel → `…` menu → **Install from VSIX…** → pick the file.
   Or from the terminal:
   ```bash
   code --install-extension vscode-bidi-rtl-0.1.0.vsix
   ```
3. Reload the window. Both modules are applied automatically on startup.

## Commands

| Command | What it does |
|---|---|
| `BiDi RTL: Toggle RTL On/Off` | Turns RTL on or off (remembered across restarts). Also the **RTL** button in the status bar. |
| `BiDi Theme: Toggle Warm Theme On/Off` | Turns the theme on or off (remembered across restarts). Also the **Theme** button in the status bar. |
| `BiDi Usage: Toggle Session Clock On/Off` | Shows or hides the session clock. |
| `BiDi Usage: Refresh Session Clock` | Refreshes the clock now (same as clicking it). |
| `BiDi RTL: Apply RTL Patch to Claude Code` | Turns RTL on. |
| `BiDi RTL: Remove RTL Patch` | Turns RTL off. |

## How it works

Claude Code renders its conversation in a webview. This extension appends one clearly marked
CSS block per enabled module to that webview's `index.css`, and copies the theme's font files
next to it.

- Both blocks are re-applied automatically after a Claude Code update.
- After an update, the extension checks that the parts of Claude Code the theme styles are still
  there, and warns once per version if something is missing.
- Uninstalling the extension removes the blocks and fonts by itself. The cleanup runs the next
  time VS Code fully restarts after the uninstall, because that is when VS Code runs uninstall
  hooks.
- *Disabling* the extension (as opposed to uninstalling it) keeps the patch, so use the toggles
  to turn the modules off.

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
