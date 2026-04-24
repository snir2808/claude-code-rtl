# VSCode BiDi RTL Extension — Design Spec

**Date:** 2026-04-24  
**Project:** `vscode-bidi-rtl`  
**Status:** Approved

---

## Problem

When using Claude Code in VSCode and conversing in Hebrew with mixed English words, the text direction flips incorrectly due to Unicode BiDi (bidirectional) rendering. The conversation becomes unreadable because RTL Hebrew and LTR English clash without direction markers.

## Goal

A VSCode extension that automatically applies RTL text direction to the Claude Code conversation panel when VSCode starts — no manual intervention required.

## Scope

- **In scope:** Claude Code sidebar/panel in VSCode
- **Out of scope:** code editor files, terminals, other webview panels

---

## Architecture

### Approach

CSS Injection via Workbench Patching (Approach A). The extension modifies VSCode's `workbench.html` at install time to inject RTL styles and a MutationObserver script. The patch is idempotent and self-cleaning.

### File Structure

```
vscode-bidi-rtl/
├── package.json          ← extension manifest & activation events
├── src/
│   ├── extension.ts      ← activate() / deactivate() entry points
│   └── patcher.ts        ← workbench.html read/write/cleanup logic
├── tsconfig.json
└── .vscodeignore
```

---

## Components

### `extension.ts`

- Exports `activate(context)` and `deactivate()`
- `activate`: calls `patcher.applyPatch()` on every startup; shows restart prompt if a new patch was applied
- `deactivate`: called on VSCode shutdown (NOT on uninstall) — does not clean up automatically
- Registers a manual command `bidi-rtl.removePatch` for the user to run before uninstalling

### `patcher.ts`

Responsible for all file I/O on `workbench.html`.

**`applyPatch()`**
1. Resolve `workbench.html` path from `process.execPath`:
   - macOS: `execPath` → `.../MacOS/Electron` → go up 3 levels → append `Resources/app/out/vs/workbench/workbench.desktop.main.html`
   - Windows: `execPath` → `Code.exe` → go up 1 level → append `resources\app\out\vs\workbench\workbench.desktop.main.html`
2. Read file contents
3. Check for `<!-- bidi-rtl-patch-start -->` marker — if found, skip (already patched)
4. Inject the patch block before `</head>`
5. Write file back
6. Return `true` if patched, `false` if already patched

**`removePatch()`**
1. Read `workbench.html`
2. Strip everything between `<!-- bidi-rtl-patch-start -->` and `<!-- bidi-rtl-patch-end -->`
3. Write file back

### Injected Patch Block

```html
<!-- bidi-rtl-patch-start -->
<style id="bidi-rtl-styles">
  /* Outer panel container */
  .part.sidebar .composite.viewlet { direction: rtl; }
  .pane-header, .title-label { text-align: right; }

  /* Attempt to reach webview content */
  .webview iframe { direction: rtl; }
</style>
<script id="bidi-rtl-script">
(function() {
  const s = document.createElement('style');
  s.textContent = '* { direction: rtl !important; text-align: right !important; }';
  const observer = new MutationObserver(() => {
    document.querySelectorAll('iframe').forEach(f => {
      try { f.contentDocument.head.appendChild(s.cloneNode(true)); } catch(e) {}
    });
  });
  observer.observe(document.body, { childList: true, subtree: true });
})();
</script>
<!-- bidi-rtl-patch-end -->
```

---

## Data Flow

```
VSCode starts
    → extension activates
    → patcher reads workbench.html
    → already patched? → skip → done
    → not patched? → inject block → write file → show restart prompt
    → user restarts VSCode
    → CSS+JS active in workbench
    → MutationObserver watches for Claude Code iframe
    → applies RTL styles when panel opens
```

---

## Error Handling

| Scenario | Behavior |
|---|---|
| No write permission to workbench.html | Show error: "Run VSCode as admin or use sudo" |
| VSCode update wipes workbench.html | Patch re-applied automatically on next startup |
| Extension uninstalled | User runs `bidi-rtl.removePatch` command manually before uninstalling |
| Claude Code iframe is sandboxed (CSS blocked) | Outer panel still gets RTL; user informed of limitation |

---

## Known Limitation

VSCode webviews (iframes) are sandboxed. CSS and JS injected into `workbench.html` may not reach the conversation text inside Claude Code's webview. If this is the case:
- The outer panel chrome (headers, scrollbar side) will be RTL
- A future v2 could explore modifying Claude Code's own extension files or using an Electron-level hook

---

## Testing Plan

1. Install extension in VSCode
2. Open Claude Code panel
3. Send a Hebrew+English message
4. Verify text displays RTL
5. Uninstall extension → verify workbench.html is restored
6. Update VSCode → verify patch re-applies on next start
