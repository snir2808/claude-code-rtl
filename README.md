# BiDi RTL for Claude Code

A small VS Code extension that automatically applies **RTL (right-to-left) direction** to the
Claude Code conversation panel — so Hebrew, Arabic, and other RTL text renders naturally instead
of reversed.

If you talk to Claude Code in Hebrew, you've seen it: punctuation jumps to the wrong side,
mixed Hebrew/English lines scramble, and reading your own prompt back is a headache. This
extension fixes that at the source.

## What it does

It patches the CSS of the Claude Code webview to set `direction: rtl` on the conversation panel.
That's it — no telemetry, no network calls, no settings to configure. It just makes the panel
bidi-aware.

## Install

This extension is distributed as a `.vsix` file (it's not on the Marketplace).

1. Download `vscode-bidi-rtl-0.0.1.vsix` from the [latest release](../../releases/latest).
2. In VS Code: **Extensions** panel → `…` menu → **Install from VSIX…** → pick the file.
   Or from the terminal:
   ```bash
   code --install-extension vscode-bidi-rtl-0.0.1.vsix
   ```
3. Run the command **`BiDi RTL: Apply RTL Patch to Claude Code`** from the Command Palette
   (`Cmd/Ctrl+Shift+P`), then reload the Claude Code panel.

## Commands

| Command | What it does |
|---|---|
| `BiDi RTL: Apply RTL Patch to Claude Code` | Applies the RTL patch and reloads the window. |
| `BiDi RTL: Remove RTL Patch` | Reverts the patch. **Run this before uninstalling.** |

## How it works

Claude Code renders its conversation in a VS Code webview. This extension locates that webview's
CSS and injects a small RTL rule. The patch is applied to files under the VS Code app root, so:

- It survives reloads, but a **Claude Code update may overwrite it** — just run *Apply* again.
- Always run **Remove** before uninstalling, so you leave the CSS clean.

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
