# VSCode BiDi RTL Extension Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a VSCode extension that automatically injects RTL CSS into VSCode's workbench on startup, fixing Hebrew+English mixed-text display in the Claude Code panel.

**Architecture:** The extension activates on VSCode startup, patches `workbench.html` with RTL CSS + a MutationObserver script (idempotent), and prompts a reload. A manual command `bidi-rtl.removePatch` lets users clean up before uninstalling.

**Tech Stack:** TypeScript 5, VSCode Extension API (^1.85), Node.js `fs/promises`, Mocha 10 (unit tests)

---

## File Map

| File | Purpose |
|---|---|
| `package.json` | Extension manifest, activation events, command contributions |
| `tsconfig.json` | TypeScript compiler config |
| `.vscodeignore` | Exclude dev files from packaged extension |
| `src/patcher.ts` | Pure functions + file I/O for workbench.html patching |
| `src/extension.ts` | VSCode entry point: activate, deactivate, command |
| `src/test/patcher.test.ts` | Unit tests for patcher pure functions |
| `src/test/patcher.integration.test.ts` | Integration tests for file I/O (uses tmp files) |

---

## Task 1: Scaffold the project

**Files:**
- Create: `package.json`
- Create: `tsconfig.json`
- Create: `.vscodeignore`

- [ ] **Step 1: Create `package.json`**

```json
{
  "name": "vscode-bidi-rtl",
  "displayName": "BiDi RTL for Claude Code",
  "description": "Automatically applies RTL direction to Claude Code conversation panel",
  "version": "0.0.1",
  "engines": { "vscode": "^1.85.0" },
  "categories": ["Other"],
  "activationEvents": ["onStartupFinished"],
  "main": "./out/extension.js",
  "contributes": {
    "commands": [
      {
        "command": "bidi-rtl.removePatch",
        "title": "BiDi RTL: Remove RTL Patch (run before uninstalling)"
      }
    ]
  },
  "scripts": {
    "compile": "tsc -p ./",
    "watch": "tsc -watch -p ./",
    "test": "npm run compile && mocha out/test/**/*.test.js"
  },
  "devDependencies": {
    "@types/mocha": "^10.0.0",
    "@types/node": "^20.0.0",
    "@types/vscode": "^1.85.0",
    "mocha": "^10.0.0",
    "typescript": "^5.0.0"
  }
}
```

- [ ] **Step 2: Create `tsconfig.json`**

```json
{
  "compilerOptions": {
    "module": "commonjs",
    "target": "ES2020",
    "outDir": "out",
    "rootDir": "src",
    "strict": true,
    "esModuleInterop": true,
    "sourceMap": true
  },
  "include": ["src/**/*.ts"],
  "exclude": ["node_modules"]
}
```

- [ ] **Step 3: Create `.vscodeignore`**

```
.vscode/**
src/**
out/test/**
tsconfig.json
.gitignore
docs/**
node_modules/**
```

- [ ] **Step 4: Create `src/` directory and install dependencies**

```bash
mkdir -p src/test
npm install
```

Expected: `node_modules/` created, no errors.

- [ ] **Step 5: Create stub `src/extension.ts`** (needed for compile to pass)

```typescript
import * as vscode from 'vscode';

export function activate(_context: vscode.ExtensionContext) {}
export function deactivate() {}
```

- [ ] **Step 6: Compile to verify setup**

```bash
npm run compile
```

Expected: `out/extension.js` created, no TypeScript errors.

- [ ] **Step 7: Commit**

```bash
git add package.json tsconfig.json .vscodeignore src/
git commit -m "feat: scaffold vscode-bidi-rtl extension"
```

---

## Task 2: Implement patcher.ts pure functions (TDD)

**Files:**
- Create: `src/test/patcher.test.ts`
- Create: `src/patcher.ts`

The pure functions operate on strings and have no side effects — easy to test in isolation.

- [ ] **Step 1: Write failing tests for `isPatched`, `applyPatchToContent`, `removePatchFromContent`**

Create `src/test/patcher.test.ts`:

```typescript
import * as assert from 'assert';
import { isPatched, applyPatchToContent, removePatchFromContent } from '../patcher';

const FAKE_HTML = `<!DOCTYPE html>
<html>
<head>
<title>VSCode</title>
</head>
<body></body>
</html>`;

suite('patcher — pure functions', () => {
  test('isPatched returns false for unpatched HTML', () => {
    assert.strictEqual(isPatched(FAKE_HTML), false);
  });

  test('isPatched returns true for patched HTML', () => {
    const patched = applyPatchToContent(FAKE_HTML);
    assert.strictEqual(isPatched(patched), true);
  });

  test('applyPatchToContent injects block before </head>', () => {
    const patched = applyPatchToContent(FAKE_HTML);
    assert.ok(patched.includes('<!-- bidi-rtl-patch-start -->'));
    assert.ok(patched.includes('direction: rtl'));
    const patchIdx = patched.indexOf('<!-- bidi-rtl-patch-start -->');
    const headIdx = patched.indexOf('</head>');
    assert.ok(patchIdx < headIdx, 'patch must appear before </head>');
  });

  test('applyPatchToContent is idempotent', () => {
    const once = applyPatchToContent(FAKE_HTML);
    const twice = applyPatchToContent(once);
    assert.strictEqual(once, twice);
  });

  test('removePatchFromContent restores original HTML exactly', () => {
    const patched = applyPatchToContent(FAKE_HTML);
    const restored = removePatchFromContent(patched);
    assert.strictEqual(restored, FAKE_HTML);
  });

  test('removePatchFromContent is safe on unpatched HTML', () => {
    const result = removePatchFromContent(FAKE_HTML);
    assert.strictEqual(result, FAKE_HTML);
  });
});
```

- [ ] **Step 2: Run tests — verify they fail (patcher.ts missing)**

```bash
npm test
```

Expected: compilation error `Cannot find module '../patcher'`

- [ ] **Step 3: Implement `src/patcher.ts` pure functions**

Create `src/patcher.ts`:

```typescript
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

const PATCH_BLOCK = [
  '<!-- bidi-rtl-patch-start -->',
  '<style id="bidi-rtl-styles">',
  '  .part.sidebar .composite.viewlet { direction: rtl; }',
  '  .pane-header, .title-label { text-align: right; }',
  '  .webview iframe { direction: rtl; }',
  '</style>',
  '<script id="bidi-rtl-script">',
  '(function() {',
  "  const s = document.createElement('style');",
  "  s.textContent = '* { direction: rtl !important; text-align: right !important; }';",
  '  const observer = new MutationObserver(() => {',
  "    document.querySelectorAll('iframe').forEach(f => {",
  "      try { f.contentDocument.head.appendChild(s.cloneNode(true)); } catch(e) {}",
  '    });',
  '  });',
  '  observer.observe(document.body, { childList: true, subtree: true });',
  '})();',
  '</script>',
  '<!-- bidi-rtl-patch-end -->',
].join('\n');

export function isPatched(content: string): boolean {
  return content.includes('<!-- bidi-rtl-patch-start -->');
}

export function applyPatchToContent(content: string): string {
  if (isPatched(content)) {
    return content;
  }
  return content.replace('</head>', PATCH_BLOCK + '\n</head>');
}

export function removePatchFromContent(content: string): string {
  return content.replace(
    /<!-- bidi-rtl-patch-start -->[\s\S]*?<!-- bidi-rtl-patch-end -->\n/,
    ''
  );
}

export function getWorkbenchHtmlPath(): string {
  const execPath = process.execPath;
  let appDir: string;

  if (os.platform() === 'darwin') {
    // execPath: /Applications/VSCode.app/Contents/MacOS/Electron
    appDir = path.join(path.dirname(execPath), '..', 'Resources', 'app');
  } else {
    // Windows/Linux: execPath sits next to resources/
    appDir = path.join(path.dirname(execPath), 'resources', 'app');
  }

  return path.join(appDir, 'out', 'vs', 'workbench', 'workbench.desktop.main.html');
}

export async function applyPatch(htmlPath: string): Promise<boolean> {
  const content = await fs.promises.readFile(htmlPath, 'utf8');
  if (isPatched(content)) {
    return false;
  }
  await fs.promises.writeFile(htmlPath, applyPatchToContent(content), 'utf8');
  return true;
}

export async function removePatch(htmlPath: string): Promise<void> {
  const content = await fs.promises.readFile(htmlPath, 'utf8');
  await fs.promises.writeFile(htmlPath, removePatchFromContent(content), 'utf8');
}
```

- [ ] **Step 4: Run tests — verify they pass**

```bash
npm test
```

Expected: 6 passing, 0 failing.

- [ ] **Step 5: Commit**

```bash
git add src/patcher.ts src/test/patcher.test.ts
git commit -m "feat: implement patcher pure functions with tests"
```

---

## Task 3: Integration tests for file I/O

**Files:**
- Create: `src/test/patcher.integration.test.ts`

These tests write to a temp file to verify `applyPatch` and `removePatch` work end-to-end.

- [ ] **Step 1: Write failing integration tests**

Create `src/test/patcher.integration.test.ts`:

```typescript
import * as assert from 'assert';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { applyPatch, removePatch, isPatched } from '../patcher';

const FAKE_HTML = `<!DOCTYPE html>
<html>
<head>
<title>VSCode</title>
</head>
<body></body>
</html>`;

suite('patcher — file I/O', () => {
  let tmpFile: string;

  setup(async () => {
    tmpFile = path.join(os.tmpdir(), `bidi-test-${Date.now()}.html`);
    await fs.promises.writeFile(tmpFile, FAKE_HTML, 'utf8');
  });

  teardown(async () => {
    await fs.promises.unlink(tmpFile).catch(() => {});
  });

  test('applyPatch writes patched content and returns true', async () => {
    const result = await applyPatch(tmpFile);
    assert.strictEqual(result, true);
    const content = await fs.promises.readFile(tmpFile, 'utf8');
    assert.ok(isPatched(content));
  });

  test('applyPatch returns false when already patched', async () => {
    await applyPatch(tmpFile);
    const result = await applyPatch(tmpFile);
    assert.strictEqual(result, false);
  });

  test('removePatch restores original content', async () => {
    await applyPatch(tmpFile);
    await removePatch(tmpFile);
    const content = await fs.promises.readFile(tmpFile, 'utf8');
    assert.strictEqual(content, FAKE_HTML);
  });
});
```

- [ ] **Step 2: Run tests — verify they pass (patcher.ts already implemented)**

```bash
npm test
```

Expected: 9 passing, 0 failing.

- [ ] **Step 3: Commit**

```bash
git add src/test/patcher.integration.test.ts
git commit -m "test: add file I/O integration tests for patcher"
```

---

## Task 4: Implement extension.ts

**Files:**
- Modify: `src/extension.ts`

- [ ] **Step 1: Replace stub with full implementation**

```typescript
import * as vscode from 'vscode';
import { applyPatch, removePatch, getWorkbenchHtmlPath } from './patcher';

export async function activate(context: vscode.ExtensionContext): Promise<void> {
  const htmlPath = getWorkbenchHtmlPath();

  try {
    const applied = await applyPatch(htmlPath);
    if (applied) {
      const choice = await vscode.window.showInformationMessage(
        'BiDi RTL: RTL patch applied to Claude Code panel. Restart VSCode to activate.',
        'Restart Now'
      );
      if (choice === 'Restart Now') {
        await vscode.commands.executeCommand('workbench.action.reloadWindow');
      }
    }
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    vscode.window.showErrorMessage(
      `BiDi RTL: Could not patch workbench.html — ${msg}. Try running VSCode as administrator.`
    );
  }

  const removeCmd = vscode.commands.registerCommand('bidi-rtl.removePatch', async () => {
    try {
      await removePatch(htmlPath);
      const choice = await vscode.window.showInformationMessage(
        'BiDi RTL: RTL patch removed. Restart VSCode to apply.',
        'Restart Now'
      );
      if (choice === 'Restart Now') {
        await vscode.commands.executeCommand('workbench.action.reloadWindow');
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      vscode.window.showErrorMessage(`BiDi RTL: Could not remove patch — ${msg}`);
    }
  });

  context.subscriptions.push(removeCmd);
}

export function deactivate(): void {}
```

- [ ] **Step 2: Compile and verify no TypeScript errors**

```bash
npm run compile
```

Expected: exits 0, `out/extension.js` updated.

- [ ] **Step 3: Commit**

```bash
git add src/extension.ts
git commit -m "feat: implement extension activate with patch + remove command"
```

---

## Task 5: Manual end-to-end verification

**Files:** none

- [ ] **Step 1: Open the project folder in VSCode**

```bash
code /Users/snirhakmoun/vscode-bidi-flipper
```

- [ ] **Step 2: Press `F5` to launch Extension Development Host**

A new VSCode window opens with the extension loaded. The Output panel (select "BiDi RTL") should show no errors.

- [ ] **Step 3: Verify patch was applied**

Check that `workbench.html` now contains the patch:

```bash
grep -c 'bidi-rtl-patch-start' \
  "/Applications/Visual Studio Code.app/Contents/Resources/app/out/vs/workbench/workbench.desktop.main.html"
```

Expected: `1`

- [ ] **Step 4: Restart VSCode and open Claude Code panel**

Send a Hebrew message with English words (e.g., "שלום world, מה נשמע today?") and verify the text aligns RTL.

- [ ] **Step 5: Test remove command**

Open Command Palette (`Cmd+Shift+P`) → type "BiDi RTL: Remove" → run `BiDi RTL: Remove RTL Patch`. Confirm the patch is removed from `workbench.html`:

```bash
grep -c 'bidi-rtl-patch-start' \
  "/Applications/Visual Studio Code.app/Contents/Resources/app/out/vs/workbench/workbench.desktop.main.html"
```

Expected: `0` (grep returns exit 1 with no matches — that's correct).

- [ ] **Step 6: Final commit**

```bash
git add -A
git commit -m "chore: verified end-to-end — RTL patch applies and removes correctly"
```
