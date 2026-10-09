# BiDi RTL for Claude Code

A small VS Code extension that automatically applies **RTL (right-to-left) direction** to the
Claude Code conversation panel — so Hebrew, Arabic, and other RTL text renders naturally instead
of reversed.

If you talk to Claude Code in Hebrew, you've seen it: punctuation jumps to the wrong side,
mixed Hebrew/English lines scramble, and reading your own prompt back is a headache. This
extension fixes that at the source.

## What it does

It patches the CSS of the Claude Code webview so mixed Hebrew/English conversations read naturally:

- Hebrew paragraphs align right, English paragraphs align left.
- Lists follow the language of each item.
- Code, tool calls, diffs and buttons stay LTR.

No telemetry, no network calls, no settings to configure.

## Install

This extension is distributed as a `.vsix` file (it's not on the Marketplace).

1. Download `vscode-bidi-rtl-0.0.3.vsix` from the [latest release](../../releases/latest).
2. In VS Code: **Extensions** panel → `…` menu → **Install from VSIX…** → pick the file.
   Or from the terminal:
   ```bash
   code --install-extension vscode-bidi-rtl-0.0.3.vsix
   ```
3. Reload the window. The patch is applied automatically on startup.

## Commands

| Command | What it does |
|---|---|
| `BiDi RTL: Toggle RTL On/Off` | Turns RTL on or off (remembered across restarts). Also available as the **RTL** button in the status bar. |
| `BiDi RTL: Apply RTL Patch to Claude Code` | Applies the patch and turns RTL on. |
| `BiDi RTL: Remove RTL Patch` | Removes the patch and turns RTL off. |

## How it works

Claude Code renders its conversation in a webview. This extension appends a small, clearly
marked CSS block to that webview's `index.css`.

- It is re-applied automatically after a Claude Code update.
- Uninstalling the extension removes the patch by itself — no need to run *Remove* first. The
  cleanup runs the next time VS Code fully restarts after the uninstall, because that is when
  VS Code runs uninstall hooks.
- *Disabling* the extension (as opposed to uninstalling it) keeps the patch, so use the RTL
  toggle to turn it off.

## Build from source

```bash
npm install
npm run compile
npx vsce package   # produces the .vsix
npm test           # runs the patcher tests
```

## Notes

Built for personal use and shared as-is. It edits VS Code's own CSS, which is a bit of a hack by
nature — if a Claude Code update changes the markup, the patch may need updating. PRs welcome.

## License

MIT.
