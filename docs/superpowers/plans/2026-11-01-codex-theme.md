# Codex Warm Theme and RTL Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make OpenAI's Codex panel look and read like the warm Claude Code panel, Hebrew RTL included. The `Theme` and `RTL` toggles control it, and a Codex-only switch can turn it off on its own.

**Architecture:** Each module (`theme`, `rtl`) gets a third block, for target `codex`: the stylesheet that Codex's `webview/index.html` links (`webview/assets/app-initial-<hash>.css` in Codex's extension folder).
- `src/codex.ts` finds that stylesheet and syncs it with the existing `syncCssFile`; the Rubik fonts go next to it.
- The theme redefines VS Code's `--vscode-*` colors on `<html>`, where VS Code writes them inline, plus a few of Codex's own tokens. The RTL block fills the three gaps in Codex's own `dir="auto"` handling.
- Activation, the toggles, the Codex switch, health warnings and the uninstall hook cover the new target. A diagnostics script for the Codex webview's DevTools reports, on the work Mac, how the blocks apply.
- A static fixture of the Codex conversation is rendered in headless Chrome against Codex's real CSS.

**Tech Stack:** TypeScript 5 (strict, CommonJS), VS Code API ^1.85 (`vscode.extensions`, `vscode.env.clipboard`), mocha (TDD UI), Node built-ins (`fs`, `path`, `http`, `child_process`), headless Google Chrome for the fixture, `@vscode/vsce` for packaging.

## Global Constraints

- Spec: `docs/superpowers/specs/2026-11-01-codex-theme-design.md`, including its *changed while planning* notes. Visual values come from the Claude Code theme (`css/theme.css`).
- Repo `~/vscode-bidi-flipper`, branch `feat/codex-theme`. Run every command from the repo root.
- No new dependencies, runtime or dev. Scripts use Node built-ins only.
- Codex:
  - Extension id `openai.chatgpt`. Installs are folders `openai.chatgpt-<version>[-<platform>]` in the extensions folder.
  - Its stylesheet is the `href` of the first `<link rel="stylesheet">` in `<install>/webview/index.html`, resolved against `webview/`.
  - A URL, a site-absolute path, a path that leaves `webview/` or a missing file means "no stylesheet": Codex changed its layout.
- Codex markers: `/* bidi-codex-theme-start */` … `/* bidi-codex-theme-end */` and `/* bidi-codex-rtl-start */` … `/* bidi-codex-rtl-end */`. Canonical order: theme, then rtl. The other targets' markers do not change.
- Fonts: `bidi-theme-rubik-hebrew.woff2` and `bidi-theme-rubik-latin.woff2`, in the folder of Codex's stylesheet.
- New `globalState` keys:
  - `bidiCodex.enabled`: the Codex switch, default on;
  - `bidiTheme.lastWarnedCodexVersion`: the Codex health warning;
  - `bidiCodex.lastLayoutWarnedVersion`: the "no stylesheet" warning.

  Existing keys are unchanged.
- New commands:
  - `bidi-codex.toggle`, titled "BiDi Codex: Toggle Codex Styling On/Off";
  - `bidi-codex.copyDiagnostics`, titled "BiDi Codex: Copy Diagnostics Script".
- A change to Codex alone offers **Reload Window** only. Codex reads `index.html` and its stylesheet each time it creates a webview, and it has no checksum.
- `css/codex-theme.css`:
  - Every style rule's selectors start with `body.vscode-dark` or `:root:has(>body.vscode-dark)` (dark themes only).
  - The only top-level at-rule is `@font-face`.
  - No `direction`, `text-align` or `unicode-bidi` declarations.
  - `!important` only on `--vscode-*` declarations, all in the `:root:has(>body.vscode-dark)` palette rule. VS Code writes those colors inline on `<html>`, and only `!important` outranks an inline style.
- `css/codex-rtl.css`:
  - Only `direction`, `text-align`, `unicode-bidi`, `list-style-position` and the bullet's `content` in `::marker` rules, plus `display:inline` (with `unicode-bidi:normal`) on a list item's first paragraph, `[class*="_MarkdownRoot_"] [class*="_ListItem_"]>[class*="_Paragraph_"]:first-child`, so a loose item's marker sits beside its text *(changed during execution, Task 2 review)*.
  - Every selector starts with `[class*="_MarkdownRoot_"]`, `[class*="_RichTextInput_"]` or `.bg-user-message[class*="_bubble_"]`.
  - No rule on the markdown root itself: it keeps Codex's `dir="auto"`.
  - No `!important`.
- Hooks, in both files: selectors use only:
  - CSS-module prefixes `[class*="_Name_"]`, never a full hashed name like `_MarkdownRoot_16avx_2`;
  - the classes `bg-user-message` and `ProseMirror`;
  - the attributes `data-theme` and `data-composer-surface-variant`;
  - plain elements, `body.vscode-dark` and `:root`.

  `REQUIRED_CODEX_HOOKS` in `src/health.ts` lists exactly the hooks both files use, Codex's custom properties included; `--vscode-*` ones are VS Code's and are not listed.
- Palette:

  | Role | Where | Value |
  |---|---|---|
  | Panel | `body` background; `--vscode-sideBar-background`, `--vscode-editor-background`, `--vscode-panel-background` | `#1b1a18` |
  | Text | `--vscode-foreground` | `#ebe5da` |
  | Secondary text | `--app-color-text-secondary`, `--vscode-descriptionForeground` | `#a39d92` |
  | Disabled | `--vscode-disabledForeground` | `#7d766a` |
  | Icons | `--vscode-icon-foreground` | `#cfc6b7` |
  | Borders | `--app-color-border`, `--vscode-widget-border`, menu and dropdown borders, `--vscode-textSeparator-foreground` | `#3b362f` |
  | Hover / selected | `--vscode-list-hoverBackground`, `--vscode-toolbar-hoverBackground` / list, menu and toolbar selection | `#2a2622` / `#3a332b` |
  | Inputs, menus, dropdowns, widgets (and so the composer) | `--vscode-input-background`, `--vscode-menu-background`, `--vscode-dropdown-background`, `--vscode-editorWidget-background` | `#242120` |
  | Input text / placeholder | `--vscode-input-foreground` / `--vscode-input-placeholderForeground` | `#f5f0e8` / `#9a9387` |
  | Input border / focus | `--vscode-input-border` / `--vscode-focusBorder` | `#736a5d` / `#d97757` |
  | Buttons, badges | `--vscode-button-background`, `--vscode-badge-background` (text `#1b1a18`, hover `#e3876a`); secondary `#2f2b26` / `#ddd4c6`, hover `#38332c` | `#d97757` |
  | Links | `--vscode-textLink-foreground` / `--vscode-textLink-activeForeground` | `#e8a07f` / `#f2b896` |
  | Inline code | `--vscode-textPreformat-background` / `-foreground`, and `[class*="_InlineCode_"]` directly | `#2b2824` / `#f2b896` |
  | Code blocks, command output | `--vscode-textCodeBlock-background`, `--vscode-terminal-background` / `--vscode-terminal-foreground` | `#121110` / `#cfc6b7` |
  | Quotes | `--vscode-textBlockQuote-background` / `-border` | `#211f1c` / `#d97757` |
  | Your messages | `--color-background-user-message` / `--color-text-user-message`; radius 14px, padding 12px 16px, `border-inline-start:3px solid #d97757`, full width | `#262320` / `#f5f0e8` |
  | Send button | `--color-background-composer-primary` / `--color-text-composer-primary` | `#c6613f` / `#faf9f5` |
  | Composer | radius 18px (`--composer-border-radius`); ring `0 0 0 1px #736a5d`, focused `#d97757` (`--composer-layout-surface-shadow`) | |

- Typography:
  - `--font-ui-family: "BiDi Rubik",-apple-system,BlinkMacSystemFont,system-ui,sans-serif`, so the whole panel uses Rubik.
  - `--codex-chat-font-size-override: 15px`.
  - Markdown: line height 1.75 through `--markdown-line-height`; headings h1/h2/h3 20/18/16px, weight 600, `#f5f0e8`; list markers `#d97757`.
  - The composer's text: 18px, line height 1.5.
  - Code keeps the editor font.
- Tests must never touch a real VS Code or Codex install, the Keychain, the network or child processes. `src/test/setup.ts` already blocks processes and `fetch`.
- The fixture only reads the Codex install; it writes to a temp folder.
- The unpacked Codex 26.51021.22027 (darwin-arm64) for the fixture is at `/private/tmp/claude-501/-Users-snirhakmoun/deb757a7-607a-4128-a1b1-c3bec6783887/scratchpad/codex/extension`. It goes away with that session's scratchpad. Task 4, Step 1 says how to download it again.
- Tests: `npm test` compiles, then runs mocha on `out/test/**/*.test.js`. Tests use `suite`/`test`.
- Version 0.3.0. The extension `name` stays `vscode-bidi-rtl`, so the id stays `local.vscode-bidi-rtl`.
- Commits: a conventional-commit subject, and a body that ends with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. Never push.

## File Map

| File | Task | Responsibility |
|---|---|---|
| `src/features.ts` | 1 | Registry: target `codex`; each `Feature` gets `blocks.codex` |
| `src/cleanup.ts` | 1 | `errorMessage` exported for `codex.ts` and `uninstall.ts` |
| `src/codex.ts` | 1 (new) | `CODEX_EXTENSION_ID`, `stylesheetHref`, `findCodexCss`, `syncCodex`, `cleanupCodex` |
| `css/codex-rtl.css` | 2 (new) | RTL block for Codex |
| `src/test/codex-css.test.ts` | 2, 3 (new) | Rules of both Codex CSS files and the health coverage |
| `css/codex-theme.css` | 3 (new) | Theme block for Codex |
| `src/health.ts` | 3 | `REQUIRED_CODEX_HOOKS`, `checkCodexHealth`, `isCodexHealthy`, `checkCodexInstallHealth`, `formatCodexHealthWarning` |
| `scripts/fixture-lib.js` | 4 | `missingClasses` reads HTML-escaped class lists and CSS-escaped names; serves `.js` |
| `diagnostics/codex.js` | 4 (new) | The DevTools script for the Codex panel, shipped in the VSIX |
| `scripts/fixture/codex.html`, `scripts/render-codex-fixture.js` | 4 (new) | Codex fixture rendered against Codex's real CSS |
| `src/test/fake-vscode.ts`, `src/extension.ts`, `src/status.ts` | 5 | Codex in every sync, the Codex switch, the diagnostics command, warnings, tooltips |
| `src/uninstall.ts` | 6 | Also cleans every Codex install |
| `package.json`, `README.md` | 4, 5, 7 | Fixture script, commands, 0.3.0, Codex docs and the work check |

---

### Task 1: The codex target: registry, stylesheet, sync and cleanup

**Files:**
- Modify: `src/features.ts` (the `TargetId` comment and type, `TARGETS`, the selector comment, `THEME.blocks`, `RTL.blocks`)
- Modify: `src/cleanup.ts:94-96` (`errorMessage`)
- Create: `src/codex.ts`
- Test: `src/test/blocks.test.ts`, `src/test/sync.test.ts`, `src/test/codex.test.ts` (new)

**Interfaces:**
- Consumes: `syncCssFile(cssPath, target, extensionRoot, enabled): Promise<SyncResult>` and `SyncResult { cssChanged; assetErrors }` from `src/sync.ts`; `cleanCssFile(cssPath, target): Promise<boolean>` and `CleanupResult { cleaned; failures }` from `src/cleanup.ts`.
- Produces:
  - `type TargetId = 'claude' | 'workbench' | 'codex'` and `TARGETS = ['claude', 'workbench', 'codex']`
  - `THEME.blocks.codex` (file `css/codex-theme.css`, the Rubik assets) and `RTL.blocks.codex` (file `css/codex-rtl.css`, no assets), with the Codex markers
  - `export function errorMessage(err: unknown): string` in `src/cleanup.ts`
  - `src/codex.ts`:
    - `CODEX_EXTENSION_ID = 'openai.chatgpt'`
    - `stylesheetHref(html: string): string | null`
    - `findCodexCss(codexDir: string): Promise<string | null>`
    - `interface CodexSyncResult extends SyncResult { cssPath: string }`
    - `syncCodex(codexDir: string, extensionRoot: string, enabled: ReadonlySet<FeatureId>): Promise<CodexSyncResult | null>`: null when Codex links no stylesheet
    - `cleanupCodex(extensionsRoot: string): Promise<CleanupResult>`

- [ ] **Step 1: Add the failing registry tests**

In `src/test/blocks.test.ts`, in `suite('features — registry', …)`:
- In the test `'every module has a block for each target'`, change the first assertion to:

```ts
    assert.deepStrictEqual(TARGETS, ['claude', 'workbench', 'codex']);
```

- Replace the test `'theme assets are woff2 files prefixed bidi-theme-, the same in both targets'` with:

```ts
  test('theme assets are woff2 files prefixed bidi-theme-, the same in every target', () => {
    assert.ok(THEME.blocks.claude.assets.length > 0);
    for (const target of TARGETS) {
      assert.deepStrictEqual(THEME.blocks[target].assets, THEME.blocks.claude.assets, target);
    }
    for (const asset of THEME.blocks.claude.assets) {
      assert.match(asset.target, /^bidi-theme-[a-z-]+\.woff2$/);
    }
  });
```

- After the test `'the workbench blocks have their own markers and CSS files'`, add:

```ts
  test('the Codex blocks have their own markers and CSS files', () => {
    assert.deepStrictEqual(THEME.blocks.codex.markers, {
      start: '/* bidi-codex-theme-start */',
      end: '/* bidi-codex-theme-end */',
    });
    assert.deepStrictEqual(RTL.blocks.codex.markers, {
      start: '/* bidi-codex-rtl-start */',
      end: '/* bidi-codex-rtl-end */',
    });
    assert.strictEqual(THEME.blocks.codex.cssFile, 'css/codex-theme.css');
    assert.strictEqual(RTL.blocks.codex.cssFile, 'css/codex-rtl.css');
  });
```

In `src/test/sync.test.ts`, at the end of `suite('sync — computeSyncedCss', …)`, add:

```ts
  test("the codex target uses its own markers and leaves the other targets' blocks alone", () => {
    const withOthers = appendBlock(appendBlock(CSS, THEME.blocks.claude.markers, '.c{}'), RTL.blocks.workbench.markers, '.w{}');
    const both = computeSyncedCss(withOthers, on(['rtl', 'theme']), BODIES, 'codex');
    assert.strictEqual(
      both,
      appendBlock(appendBlock(withOthers, THEME.blocks.codex.markers, BODIES.theme), RTL.blocks.codex.markers, BODIES.rtl)
    );
    assert.strictEqual(computeSyncedCss(both, on([]), BODIES, 'codex'), withOthers);
  });
```

- [ ] **Step 2: Write the failing tests for `src/codex.ts`**

Create `src/test/codex.test.ts`:

```ts
import * as assert from 'assert';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { appendBlock } from '../blocks';
import { cleanupCodex, findCodexCss, stylesheetHref, syncCodex } from '../codex';
import { FeatureId, RTL, THEME } from '../features';

const ORIGINAL = '@layer theme{:root{--color-text:var(--vscode-foreground)}}\n/*# sourceMappingURL=app-initial.css.map*/';
const THEME_BODY = ':root:has(>body.vscode-dark){--vscode-foreground:#ebe5da!important}';
const RTL_BODY = '[class*="_MarkdownRoot_"] [class*="_Paragraph_"]{unicode-bidi:plaintext}';
const PATCHED = appendBlock(
  appendBlock(ORIGINAL, THEME.blocks.codex.markers, THEME_BODY),
  RTL.blocks.codex.markers,
  RTL_BODY
);
const CSS_NAME = 'app-initial-0123456789ab.css';
/** Codex's webview/index.html, shortened: a module script, a preload, then the stylesheet. */
const INDEX_HTML = `<!doctype html>
<html lang="en"><head>
<!-- PROD_BASE_TAG_HERE -->
<script type="module" crossorigin src="./assets/index-0123456789ab.js"></script>
<link rel="modulepreload" crossorigin href="./assets/app-initial-0123456789ab.js">
<link rel="stylesheet" crossorigin href="./assets/${CSS_NAME}">
</head><body><div id="root"></div></body></html>`;
const on = (...ids: FeatureId[]): Set<FeatureId> => new Set(ids);

async function write(file: string, content: string | Buffer): Promise<void> {
  await fs.promises.mkdir(path.dirname(file), { recursive: true });
  await fs.promises.writeFile(file, content);
}

const read = (file: string): string => fs.readFileSync(file, 'utf8');

suite('codex — stylesheetHref', () => {
  test('returns the first stylesheet link, whatever the attribute order and quotes', () => {
    assert.strictEqual(stylesheetHref(INDEX_HTML), `./assets/${CSS_NAME}`);
    assert.strictEqual(
      stylesheetHref(`<link href='a.css' crossorigin rel='stylesheet'><link rel="stylesheet" href="b.css">`),
      'a.css'
    );
    assert.strictEqual(stylesheetHref('<LINK REL=STYLESHEET HREF=c.css>'), 'c.css');
  });

  test('skips links that are not stylesheets, and finds none in a page without one', () => {
    assert.strictEqual(stylesheetHref('<link rel="modulepreload" href="x.js"><link rel="icon" href="i.png">'), null);
    assert.strictEqual(stylesheetHref('<link rel="stylesheet">'), null);
    assert.strictEqual(stylesheetHref(''), null);
  });
});

suite('codex — the Codex target', () => {
  let tmp: string;
  let extensions: string;
  let codexDir: string;
  let extRoot: string;
  let cssPath: string;
  let fonts: string[];

  setup(async () => {
    tmp = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'bidi-codex-'));
    extensions = path.join(tmp, 'extensions');
    codexDir = path.join(extensions, 'openai.chatgpt-26.51021.22027-darwin-arm64');
    extRoot = path.join(tmp, 'ext');
    cssPath = path.join(codexDir, 'webview', 'assets', CSS_NAME);
    await write(path.join(codexDir, 'webview', 'index.html'), INDEX_HTML);
    await write(cssPath, ORIGINAL);
    await write(path.join(extRoot, THEME.blocks.codex.cssFile), THEME_BODY);
    await write(path.join(extRoot, RTL.blocks.codex.cssFile), RTL_BODY);
    for (const asset of THEME.blocks.codex.assets) {
      await write(path.join(extRoot, asset.source), Buffer.from(`font:${asset.target}`));
    }
    fonts = THEME.blocks.codex.assets.map((a) => path.join(path.dirname(cssPath), a.target));
  });

  teardown(async () => {
    await fs.promises.rm(tmp, { recursive: true, force: true });
  });

  test('findCodexCss resolves the linked stylesheet inside webview/', async () => {
    assert.strictEqual(await findCodexCss(codexDir), cssPath);
    await write(path.join(codexDir, 'webview', 'index.html'), `<link rel="stylesheet" href="assets/${CSS_NAME}">`);
    assert.strictEqual(await findCodexCss(codexDir), cssPath);
  });

  test('findCodexCss finds nothing without index.html, a stylesheet link, or the linked file', async () => {
    const html = path.join(codexDir, 'webview', 'index.html');
    await write(html, '<link rel="modulepreload" href="./assets/x.js">');
    assert.strictEqual(await findCodexCss(codexDir), null);
    await write(html, '<link rel="stylesheet" href="./assets/gone-0123456789ab.css">');
    assert.strictEqual(await findCodexCss(codexDir), null);
    await fs.promises.rm(html);
    assert.strictEqual(await findCodexCss(codexDir), null);
    assert.strictEqual(await findCodexCss(path.join(tmp, 'nowhere')), null);
  });

  test('findCodexCss never leaves webview/: no parent paths, absolute paths, URLs or bad escapes', async () => {
    const html = path.join(codexDir, 'webview', 'index.html');
    await write(path.join(codexDir, 'outside.css'), ORIGINAL);
    for (const href of ['../outside.css', '/outside.css', 'https://cdn.example/app.css', 'file:///etc/app.css', '%E0%A4%A']) {
      await write(html, `<link rel="stylesheet" href="${href}">`);
      assert.strictEqual(await findCodexCss(codexDir), null, href);
    }
  });

  test('syncCodex writes both blocks and copies the fonts next to the stylesheet', async () => {
    assert.deepStrictEqual(await syncCodex(codexDir, extRoot, on('theme', 'rtl')), {
      cssPath,
      cssChanged: true,
      assetErrors: [],
    });
    assert.strictEqual(read(cssPath), PATCHED);
    for (const font of fonts) {
      assert.ok(fs.existsSync(font), font);
    }
  });

  test('a second sync changes nothing, and turning everything off restores the file exactly', async () => {
    await syncCodex(codexDir, extRoot, on('theme', 'rtl'));
    assert.deepStrictEqual(await syncCodex(codexDir, extRoot, on('theme', 'rtl')), {
      cssPath,
      cssChanged: false,
      assetErrors: [],
    });
    await syncCodex(codexDir, extRoot, on());
    assert.strictEqual(read(cssPath), ORIGINAL);
    for (const font of fonts) {
      assert.ok(!fs.existsSync(font), font);
    }
  });

  test('syncCodex resolves to null and writes nothing when Codex links no stylesheet', async () => {
    await write(path.join(codexDir, 'webview', 'index.html'), '<html></html>');
    assert.strictEqual(await syncCodex(codexDir, extRoot, on('theme', 'rtl')), null);
    assert.strictEqual(read(cssPath), ORIGINAL);
    for (const font of fonts) {
      assert.ok(!fs.existsSync(font), font);
    }
  });

  test('cleanupCodex cleans every Codex install, symlinked ones too, and nothing else', async () => {
    await syncCodex(codexDir, extRoot, on('theme', 'rtl'));
    const target = path.join(tmp, 'real-codex');
    const linkedCss = path.join(target, 'webview', 'assets', CSS_NAME);
    await write(path.join(target, 'webview', 'index.html'), INDEX_HTML);
    await write(linkedCss, appendBlock(ORIGINAL, RTL.blocks.codex.markers, RTL_BODY));
    await fs.promises.symlink(target, path.join(extensions, 'openai.chatgpt-26.51007.21434-darwin-arm64'), 'dir');
    const claude = path.join(extensions, 'anthropic.claude-code-2.1.287', 'webview', 'assets', CSS_NAME);
    await write(path.join(path.dirname(path.dirname(claude)), 'index.html'), INDEX_HTML);
    await write(claude, PATCHED);

    assert.deepStrictEqual(await cleanupCodex(extensions), { cleaned: 2, failures: [] });
    assert.strictEqual(read(cssPath), ORIGINAL);
    assert.strictEqual(read(linkedCss), ORIGINAL);
    for (const font of fonts) {
      assert.ok(!fs.existsSync(font), font);
    }
    assert.strictEqual(read(claude), PATCHED); // not a Codex folder
    assert.deepStrictEqual(await cleanupCodex(extensions), { cleaned: 0, failures: [] });
    assert.deepStrictEqual(await cleanupCodex(path.join(tmp, 'nowhere')), { cleaned: 0, failures: [] });
  });

  test('a Codex install that cannot be cleaned is reported and does not stop the others', async () => {
    await syncCodex(codexDir, extRoot, on('theme'));
    const broken = path.join(extensions, 'openai.chatgpt-26.5930.61225-darwin-arm64');
    await write(path.join(broken, 'webview', 'index.html'), INDEX_HTML);
    await fs.promises.mkdir(path.join(broken, 'webview', 'assets', CSS_NAME), { recursive: true }); // a folder: reading it fails
    const result = await cleanupCodex(extensions);
    assert.strictEqual(result.cleaned, 1);
    assert.strictEqual(result.failures.length, 1);
    assert.ok(result.failures[0].startsWith(`${broken}: `), result.failures[0]);
    assert.strictEqual(read(cssPath), ORIGINAL);
  });
});
```

- [ ] **Step 3: Run the tests to see them fail**

Run: `npm test`
Expected: the compile step fails: `src/test/codex.test.ts` cannot find module `'../codex'`, and `blocks.test.ts` and `sync.test.ts` report that `'codex'` is not a `TargetId` / property `codex` does not exist.

- [ ] **Step 4: Add the codex target to the registry**

In `src/features.ts`, replace the `TargetId` comment, type and `TARGETS` (lines 5-11) with:

```ts
/**
 * Where a module's blocks go: Claude Code's webview/index.css, VS Code's
 * own workbench CSS, which styles the built-in chat that Copilot runs in, or
 * the stylesheet of OpenAI's Codex webview.
 */
export type TargetId = 'claude' | 'workbench' | 'codex';

export const TARGETS: readonly TargetId[] = ['claude', 'workbench', 'codex'];
```

Replace the comment above `THEME` (lines 43-46) with:

```ts
// The Claude Code blocks use hash-stable selectors: Claude Code's class names
// carry a build-hash suffix (e.g. messagesContainer_07S1Yg), so elements are
// matched by [class*="prefix_"], and the chat input by role + aria-label.
// VS Code's chat uses plain class names (interactive-session, …). Codex mixes
// Tailwind utilities with CSS modules named _Name_<hash>_<n>, matched by
// [class*="_Name_"].
```

In `THEME.blocks`, after the `workbench` block, add:

```ts
    codex: {
      markers: { start: '/* bidi-codex-theme-start */', end: '/* bidi-codex-theme-end */' },
      cssFile: 'css/codex-theme.css',
      assets: RUBIK,
    },
```

In `RTL.blocks`, after the `workbench` block, add:

```ts
    codex: {
      markers: { start: '/* bidi-codex-rtl-start */', end: '/* bidi-codex-rtl-end */' },
      cssFile: 'css/codex-rtl.css',
      assets: [],
    },
```

The two CSS files are written in Tasks 2 and 3. Until then, nothing reads them: every test that syncs the codex target writes its own block bodies.

- [ ] **Step 5: Export `errorMessage` from `src/cleanup.ts`**

Replace the last function of `src/cleanup.ts`:

```ts
function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}
```

with:

```ts
export function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}
```

- [ ] **Step 6: Write `src/codex.ts`**

```ts
import * as fs from 'fs';
import * as path from 'path';
import { CleanupResult, cleanCssFile, errorMessage } from './cleanup';
import { FeatureId } from './features';
import { SyncResult, syncCssFile } from './sync';

/** OpenAI's Codex extension ("Codex – OpenAI's coding agent"). */
export const CODEX_EXTENSION_ID = 'openai.chatgpt';

/** Codex installs are folders named openai.chatgpt-<version>[-<platform>] in the extensions folder. */
const CODEX_DIR_PREFIX = 'openai.chatgpt-';

/**
 * The href of the first <link rel="stylesheet"> in an HTML page, or null.
 * Attribute order and quoting vary, so each <link> tag is read attribute by
 * attribute.
 */
export function stylesheetHref(html: string): string | null {
  for (const [tag] of html.matchAll(/<link\b[^>]*>/gi)) {
    const attributes = new Map<string, string>();
    for (const m of tag.matchAll(/([\w-]+)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'>]+))/g)) {
      attributes.set(m[1].toLowerCase(), m[2] ?? m[3] ?? m[4]);
    }
    const rel = (attributes.get('rel') ?? '').toLowerCase().split(/\s+/);
    const href = attributes.get('href');
    if (rel.includes('stylesheet') && href) {
      return href;
    }
  }
  return null;
}

/**
 * A relative href as a file under `dir`, or null for a URL, a site-absolute
 * path, a malformed %-escape, or a path that leaves `dir`.
 */
function fileUnder(dir: string, href: string): string | null {
  if (/^[a-z][a-z\d+.-]*:/i.test(href) || href.startsWith('/') || href.startsWith('\\')) {
    return null;
  }
  let decoded: string;
  try {
    decoded = decodeURIComponent(href.split(/[?#]/)[0]);
  } catch {
    return null;
  }
  const file = path.resolve(dir, decoded);
  return file.startsWith(dir + path.sep) ? file : null;
}

/**
 * The stylesheet Codex's webview/index.html links first, as an absolute path.
 * Null when there is no such page or link, or the link points outside
 * webview/ or at a missing file: Codex has changed its layout. Codex reads
 * index.html, and so this stylesheet, each time it creates a webview.
 */
export async function findCodexCss(codexDir: string): Promise<string | null> {
  const webview = path.resolve(codexDir, 'webview');
  let html: string;
  try {
    html = await fs.promises.readFile(path.join(webview, 'index.html'), 'utf8');
  } catch {
    return null;
  }
  const href = stylesheetHref(html);
  const cssPath = href === null ? null : fileUnder(webview, href);
  if (cssPath === null) {
    return null;
  }
  try {
    await fs.promises.access(cssPath);
    return cssPath;
  } catch {
    return null;
  }
}

export interface CodexSyncResult extends SyncResult {
  /** The stylesheet that was synced. */
  cssPath: string;
}

/**
 * Brings the Codex install at codexDir in line with the enabled modules, with
 * the fonts next to its stylesheet. Resolves to null, writing nothing, when
 * Codex links no stylesheet this can find (see findCodexCss).
 */
export async function syncCodex(
  codexDir: string,
  extensionRoot: string,
  enabled: ReadonlySet<FeatureId>
): Promise<CodexSyncResult | null> {
  const cssPath = await findCodexCss(codexDir);
  if (cssPath === null) {
    return null;
  }
  return { cssPath, ...(await syncCssFile(cssPath, 'codex', extensionRoot, enabled)) };
}

/** Every Codex install in an extensions folder that links a stylesheet, symlinked installs included. */
async function findCodexInstalls(extensionsRoot: string): Promise<{ dir: string; cssPath: string }[]> {
  let entries: string[];
  try {
    entries = await fs.promises.readdir(extensionsRoot);
  } catch {
    return [];
  }
  const found: { dir: string; cssPath: string }[] = [];
  for (const entry of entries) {
    // Decide by name only (not Dirent type) so symlinked folders are included.
    if (!entry.toLowerCase().startsWith(CODEX_DIR_PREFIX)) {
      continue;
    }
    const dir = path.join(extensionsRoot, entry);
    const cssPath = await findCodexCss(dir);
    if (cssPath !== null) {
      found.push({ dir, cssPath });
    }
  }
  return found;
}

/** Strips both Codex blocks and their fonts from every Codex install in an extensions folder. */
export async function cleanupCodex(extensionsRoot: string): Promise<CleanupResult> {
  const result: CleanupResult = { cleaned: 0, failures: [] };
  for (const { dir, cssPath } of await findCodexInstalls(extensionsRoot)) {
    try {
      if (await cleanCssFile(cssPath, 'codex')) {
        result.cleaned++;
      }
    } catch (err: unknown) {
      // One bad install must not stop the others.
      result.failures.push(`${dir}: ${errorMessage(err)}`);
    }
  }
  return result;
}
```

- [ ] **Step 7: Run the tests to see them pass**

Run: `npm test`
Expected: PASS, every test (189 before this task, plus the new ones).

- [ ] **Step 8: Commit**

```bash
git add src/features.ts src/cleanup.ts src/codex.ts src/test/blocks.test.ts src/test/sync.test.ts src/test/codex.test.ts
git commit -m "feat: a codex target: find and sync the stylesheet of OpenAI's Codex webview

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

### Task 2: The RTL block for Codex

**Files:**
- Create: `css/codex-rtl.css`
- Create: `src/test/codex-css.test.ts` (the RTL suite; Task 3 adds the theme suites)

**Interfaces:**
- Consumes: `RTL.blocks.codex.cssFile` (Task 1); `TopLevelRule`, `topLevelRules`, `splitSelectors`, `properties` from `src/test/css-rules.ts`.
- Produces: `css/codex-rtl.css`, whose selectors use the hooks `._MarkdownRoot_`, `._Paragraph_`, `._Heading_`, `._ListItem_`, `._Blockquote_`, `._UnorderedList_`, `.bg-user-message`, `._bubble_`, `._RichTextInput_` and `.ProseMirror`. Task 3's coverage test counts them.

Background, from Codex 26.51021's code:
- Codex's markdown gives the root and every paragraph, heading, list, quote and table cell `dir="auto"`, and inline code and code blocks `dir="ltr"`. The `<li>` has no `dir`, so an item follows its list's first item.
- A user message is markdown with `white-space: pre-wrap`. Its lines all follow the paragraph's first line.
- The composer is a ProseMirror editor with one `<p>` per line and no direction handling.
- `unicode-bidi: plaintext` makes each line take the direction of its own text, and `text-align: start` then aligns it to that side.
- The prototype (Chrome 156, against Codex's real CSS) measured each Hebrew line 0px from the right and each English line 0px from the left, in answers, in a two-line user message and in the composer.
- A loose list (blank lines between items) renders each item as `<li><p class="_Paragraph_…">…</p></li>`. With inside markers the paragraph, a block, would leave the marker alone on the line above, on the list's side. So the item's first paragraph runs inline, with `unicode-bidi:normal` so its text sets the item's direction: each item stays one line, with its marker beside it on its own side *(changed during execution, Task 2 review)*.

- [ ] **Step 1: Write the failing test**

Create `src/test/codex-css.test.ts`:

```ts
import * as assert from 'assert';
import * as fs from 'fs';
import * as path from 'path';
import { RTL } from '../features';
import { TopLevelRule, properties, splitSelectors, topLevelRules } from './css-rules';

const ROOT = path.join(__dirname, '..', '..');
const read = (file: string): string => fs.readFileSync(path.join(ROOT, file), 'utf8');
const withoutComments = (css: string): string => css.replace(/\/\*[\s\S]*?\*\//g, '');
const oneLine = (body: string): string => body.replace(/\s/g, '');
/** A full Codex CSS-module class name, e.g. _MarkdownRoot_16avx_2: selectors match the prefix only. */
const HASHED_CODEX_CLASS = /_[A-Za-z]+_[a-z0-9]{5}_\d+/;
const MARKDOWN = '[class*="_MarkdownRoot_"]';
const COMPOSER = '[class*="_RichTextInput_"]';
const USER_MESSAGE = '.bg-user-message[class*="_bubble_"]';
/** A loose list item's first paragraph, which runs inline beside the item's marker. */
const LOOSE_ITEM_PARAGRAPH = '[class*="_MarkdownRoot_"] [class*="_ListItem_"]>[class*="_Paragraph_"]:first-child';

// Each suite reads its file in suiteSetup, so a missing file fails its tests
// instead of aborting the whole run while the suites are registered.
suite('codex-rtl.css', () => {
  let css: string;
  let rules: TopLevelRule[];

  suiteSetup(() => {
    css = read(RTL.blocks.codex.cssFile);
    rules = topLevelRules(css);
  });

  test('holds only the block body: no markers, no at-rules, no !important', () => {
    assert.ok(!css.includes('bidi-codex-'));
    assert.ok(rules.length > 0);
    assert.deepStrictEqual(rules.filter((r) => r.prelude.startsWith('@')), []);
    assert.ok(!css.includes('!important'));
  });

  test('every selector starts with the markdown root, the composer or your message', () => {
    for (const rule of rules) {
      for (const selector of splitSelectors(rule.prelude)) {
        assert.ok(
          [MARKDOWN, COMPOSER, USER_MESSAGE].some((scope) => selector.startsWith(scope)),
          `unscoped selector: ${selector}`
        );
      }
    }
  });

  test('declares only direction and list-marker properties, plus inline display for a loose list item\'s first paragraph', () => {
    const allowed = new Set(['direction', 'text-align', 'unicode-bidi', 'list-style-position']);
    for (const rule of rules) {
      for (const property of properties(rule.body)) {
        const ok = allowed.has(property) || (property === 'content' && rule.prelude.endsWith('::marker')) || (property === 'display' && rule.prelude === LOOSE_ITEM_PARAGRAPH);
        assert.ok(ok, `${property} in "${rule.prelude}"`);
      }
    }
  });

  test('keeps Codex\'s dir="auto" on the markdown root: no rule targets the root itself', () => {
    for (const rule of rules) {
      for (const selector of splitSelectors(rule.prelude)) {
        assert.notStrictEqual(selector, MARKDOWN);
      }
    }
  });

  test('each paragraph, heading, list item and quote, and each composer line, follows its own text', () => {
    const selectors = rules
      .filter((r) => oneLine(r.body) === 'unicode-bidi:plaintext;text-align:start;')
      .flatMap((r) => splitSelectors(r.prelude));
    for (const part of ['_Paragraph_', '_Heading_', '_ListItem_', '_Blockquote_']) {
      assert.ok(selectors.some((s) => s.startsWith(MARKDOWN) && s.includes(part)), part);
    }
    assert.ok(
      selectors.some((s) => s.startsWith(`${COMPOSER} .ProseMirror`) && /\bp\b/.test(s) && /\bli\b/.test(s)),
      'composer lines'
    );
  });

  test('list markers sit inside their item and follow its language', () => {
    assert.ok(rules.some((r) => r.prelude.endsWith('[class*="_ListItem_"]') && oneLine(r.body) === 'list-style-position:inside;'));
    assert.ok(rules.some((r) => r.prelude.endsWith('[class*="_ListItem_"]::marker') && oneLine(r.body) === 'unicode-bidi:normal;'));
  });

  test("a loose list item's first paragraph runs inline, so its marker sits beside it", () => {
    const rule = rules.find((r) => r.prelude === LOOSE_ITEM_PARAGRAPH);
    assert.ok(rule, 'no rule for a loose list item\'s first paragraph');
    assert.strictEqual(oneLine(rule.body), 'display:inline;unicode-bidi:normal;');
  });

  test('your message is right-to-left, so its accent bar sits on the right', () => {
    const rule = rules.find((r) => r.prelude === USER_MESSAGE);
    assert.ok(rule, 'no rule for your message');
    assert.strictEqual(oneLine(rule.body), 'direction:rtl;');
  });

  test('keeps a single backslash before 2022, and names no hashed class', () => {
    assert.ok(css.includes('\\2022'));
    assert.ok(!css.includes('\\\\2022'));
    assert.strictEqual(HASHED_CODEX_CLASS.exec(withoutComments(css)), null);
  });
});
```

- [ ] **Step 2: Run the test to see it fail**

Run: `npm test`
Expected: the `codex-rtl.css` suite FAILS in its `"before all" hook` with `ENOENT: no such file or directory, open '…/css/codex-rtl.css'`, so its 9 tests do not run; every other suite passes.

- [ ] **Step 3: Write `css/codex-rtl.css`**

```css
/* RTL for OpenAI's Codex panel, in every theme. Codex already gives each
   markdown paragraph, heading, list, quote and table cell dir="auto", and
   inline code, code blocks and command output dir="ltr". This block fills
   the gaps: each line of a paragraph, list item or quote follows its own
   text (a list item no longer follows its list's first item, nor a line of
   your message the message's first line), and so does each line of the
   composer, which has no direction handling at all. Codex's dir attributes
   stay, so an English table is not mirrored. Rules (enforced by
   src/test/codex-css.test.ts): only direction, text-align, unicode-bidi and
   list-marker placement, plus display:inline on a list item's first
   paragraph, and every selector starts with the markdown root, the
   composer's editor or your message. */

/* Markdown, in your messages and in Codex's answers: text-align:start lets
   each line's unicode-bidi:plaintext put Hebrew on the right and English on
   the left. */
[class*="_MarkdownRoot_"] :is([class*="_Paragraph_"],[class*="_Heading_"],[class*="_ListItem_"],[class*="_Blockquote_"]){
unicode-bidi:plaintext;
text-align:start;
}
/* Inside markers + unicode-bidi:normal make each marker follow its item's language. */
[class*="_MarkdownRoot_"] [class*="_ListItem_"]{
list-style-position:inside;
}
[class*="_MarkdownRoot_"] [class*="_ListItem_"]::marker{
unicode-bidi:normal;
}
[class*="_MarkdownRoot_"] [class*="_UnorderedList_"]>[class*="_ListItem_"]::marker{
content:"\2022  ";
}
/* A loose list item (blank lines between items) holds paragraphs. Its first
   paragraph runs inline, so the inside marker sits beside it, on the item's
   side, instead of alone on the line above. unicode-bidi:normal lets its text
   set the item's direction (an isolate would hide it from the item). */
[class*="_MarkdownRoot_"] [class*="_ListItem_"]>[class*="_Paragraph_"]:first-child{
display:inline;
unicode-bidi:normal;
}
/* Your message: a right-to-left block, so its accent bar (css/codex-theme.css)
   sits on the right, as in Claude Code. Its lines follow the markdown rule. */
.bg-user-message[class*="_bubble_"]{
direction:rtl;
}
/* The composer (ProseMirror): each line you type follows its own text. */
[class*="_RichTextInput_"] .ProseMirror :is(p,li,h1,h2,h3,h4,h5,h6,blockquote){
unicode-bidi:plaintext;
text-align:start;
}
```

- [ ] **Step 4: Run the test to see it pass**

Run: `npm test`
Expected: PASS, including the 9 `codex-rtl.css` tests.

- [ ] **Step 5: Commit**

```bash
git add css/codex-rtl.css src/test/codex-css.test.ts
git commit -m "feat: RTL block for Codex: list items, message lines and the composer

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

### Task 3: The theme block for Codex, with its health check

**Files:**
- Create: `css/codex-theme.css`
- Modify: `src/health.ts` (append the Codex section)
- Test: `src/test/codex-css.test.ts` (add the theme and coverage suites), `src/test/health.test.ts` (add the Codex suite)

**Interfaces:**
- Consumes: `THEME.blocks.codex` and `RTL.blocks.codex` (Task 1); `css/codex-rtl.css` (Task 2); `escapeRegExp`, `stripBlock` from `src/blocks.ts`.
- Produces:
  - `css/codex-theme.css`
  - In `src/health.ts`:
    - `REQUIRED_CODEX_HOOKS: readonly string[]`
    - `interface CodexHealthReport { unreadable: boolean; missingHooks: string[] }`
    - `checkCodexHealth(css: string | null): CodexHealthReport`
    - `isCodexHealthy(report: CodexHealthReport): boolean`
    - `checkCodexInstallHealth(cssPath: string): Promise<CodexHealthReport>`: never rejects; checks every `*.css` in the stylesheet's folder, without this extension's Codex blocks
    - `formatCodexHealthWarning(version: string, report: CodexHealthReport): string`: `''` for a healthy report

Background, from Codex 26.51021's CSS. The prototype gave every value listed here in Chrome 156:
- VS Code writes the theme's colors inline on the webview's `<html>`: `document.documentElement.style.setProperty('--vscode-…')`. Codex maps its tokens to them on `:root[data-codex-window-type=extension]` and on `[data-theme]` elements, inside `@layer theme`. An `!important` redefinition on `<html>` therefore reaches every Codex token derived from those colors.
- Codex's own tokens are in `@layer theme` too, so an unlayered rule outranks them without `!important`:
  - `--font-ui-family`: VS Code's UI font, feeding `--font-sans` and `--font-content`;
  - `--codex-chat-font-size-override`;
  - `--app-color-border` and `--app-color-text-secondary`: otherwise borders are 8% and secondary text 65% of the text color;
  - the user message and send button colors.
- Markdown sizes come from variables on the `_MarkdownRoot_` element: `--markdown-font-size`, from the chat size, and `--markdown-line-height`.
- The user message bubble is `.bg-user-message` plus the `_bubble_` module, which caps its width at `--user-chat-width` (70%). Its `data-user-message-bubble` attribute appears only in JS, so it is not a hook.
- The composer forces `border:0!important` in a layer, which no unlayered rule can override. It paints `--composer-layout-surface-background` (the menu color, `#242120` here) and `box-shadow: var(--composer-layout-surface-shadow)`, rounded by `--composer-border-radius`. Inline composers (`data-composer-surface-variant="inline"`) are left alone.
- The send button is `bg-composer-primary text-composer-primary`.

- [ ] **Step 1: Write the failing tests**

In `src/test/codex-css.test.ts`, change the imports at the top to:

```ts
import * as assert from 'assert';
import * as fs from 'fs';
import * as path from 'path';
import { RTL, THEME } from '../features';
import { REQUIRED_CODEX_HOOKS } from '../health';
import { TopLevelRule, classNames, properties, splitSelectors, topLevelRules, urls } from './css-rules';
```

and append to the end of the file:

```ts
const DARK = 'body.vscode-dark';
/** <html>, in dark themes: where VS Code writes its colors inline. */
const DARK_ROOT = ':root:has(>body.vscode-dark)';

suite('codex-theme.css — rules', () => {
  let css: string;
  let rules: TopLevelRule[];

  suiteSetup(() => {
    css = read(THEME.blocks.codex.cssFile);
    rules = topLevelRules(css);
  });

  test('holds only the block body: no markers', () => {
    assert.ok(!css.includes('bidi-codex-'));
    assert.ok(rules.length > 0);
  });

  test('the only top-level at-rule is @font-face', () => {
    for (const rule of rules.filter((r) => r.prelude.startsWith('@'))) {
      assert.strictEqual(rule.prelude, '@font-face');
    }
  });

  test('every selector starts with body.vscode-dark or :root:has(>body.vscode-dark)', () => {
    for (const rule of rules.filter((r) => !r.prelude.startsWith('@'))) {
      for (const selector of splitSelectors(rule.prelude)) {
        const scoped = [DARK, DARK_ROOT].some(
          (scope) => selector.startsWith(scope) && /^($|[\s>:.[])/.test(selector.slice(scope.length))
        );
        assert.ok(scoped, `unscoped selector: ${selector}`);
      }
    }
  });

  test('no direction, text-align or unicode-bidi declarations', () => {
    for (const rule of rules) {
      const bad = /(^|[;{\s])(direction|text-align|unicode-bidi)\s*:/i.exec(rule.body);
      assert.strictEqual(bad, null, `forbidden property in "${rule.prelude}"`);
    }
  });

  test("!important only on the --vscode-* colors, which VS Code writes inline on <html>", () => {
    for (const rule of rules) {
      for (const declaration of rule.body.split(';').map((d) => d.trim()).filter(Boolean)) {
        const property = declaration.slice(0, declaration.indexOf(':')).trim();
        const important = /!\s*important$/i.test(declaration);
        if (property.startsWith('--vscode-')) {
          assert.strictEqual(rule.prelude, DARK_ROOT, `${property} outside the palette rule`);
          assert.ok(important, `${property} needs !important to outrank VS Code's inline style`);
        } else {
          assert.ok(!important, `!important on ${property} in "${rule.prelude}"`);
        }
      }
    }
  });

  test('the palette redefines the VS Code colors Codex paints the panel with', () => {
    const palette = rules.find((r) => r.prelude === DARK_ROOT);
    assert.ok(palette, 'no palette rule');
    const declared = properties(palette.body); // lowercased
    for (const color of [
      '--vscode-foreground',
      '--vscode-sidebar-background',
      '--vscode-editor-background',
      '--vscode-input-background',
      '--vscode-input-border',
      '--vscode-focusborder',
      '--vscode-menu-background',
      '--vscode-textlink-foreground',
      '--vscode-terminal-background',
    ]) {
      assert.ok(declared.includes(color), color);
    }
  });

  test('names no hashed class', () => {
    assert.strictEqual(HASHED_CODEX_CLASS.exec(withoutComments(css)), null);
  });
});

suite('codex-theme.css — assets', () => {
  test('every url() points at a declared theme asset, and every asset is used', () => {
    const css = read(THEME.blocks.codex.cssFile);
    assert.deepStrictEqual(urls(css).sort(), THEME.blocks.codex.assets.map((a) => a.target).sort());
  });
});

/**
 * The Codex hooks a stylesheet uses, written the way REQUIRED_CODEX_HOOKS
 * writes them: CSS-module prefixes ("._Name_"), classes (".name"),
 * attributes ("[name") and Codex's custom properties ("--name"), set or read.
 * VS Code's own body class and --vscode-* colors are not Codex's.
 */
function codexHooks(css: string): Set<string> {
  const hooks = new Set<string>();
  for (const rule of topLevelRules(css).filter((r) => !r.prelude.startsWith('@'))) {
    for (const m of rule.prelude.matchAll(/\[\s*([\w-]+)\s*(?:[~|^$*]?=\s*(?:"([^"]*)"|'([^']*)'|([^\]\s]+)))?\s*\]/g)) {
      hooks.add(m[1] === 'class' ? `.${m[2] ?? m[3] ?? m[4]}` : `[${m[1]}`);
    }
    for (const name of classNames(rule.prelude.replace(/\[[^\]]*\]/g, ''))) {
      if (name !== 'vscode-dark') {
        hooks.add(`.${name}`);
      }
    }
    for (const property of properties(rule.body)) {
      if (property.startsWith('--') && !property.startsWith('--vscode-')) {
        hooks.add(property);
      }
    }
    for (const [, name] of rule.body.matchAll(/var\(\s*(--[\w-]+)/g)) {
      if (!name.startsWith('--vscode-')) {
        hooks.add(name);
      }
    }
  }
  return hooks;
}

suite('Codex CSS — health check coverage', () => {
  test('REQUIRED_CODEX_HOOKS lists exactly the hooks both files use', () => {
    const used = new Set([...codexHooks(read(THEME.blocks.codex.cssFile)), ...codexHooks(read(RTL.blocks.codex.cssFile))]);
    assert.deepStrictEqual([...used].sort(), [...REQUIRED_CODEX_HOOKS].sort());
  });
});
```

In `src/test/health.test.ts`:
- Add `CodexHealthReport`, `REQUIRED_CODEX_HOOKS`, `checkCodexHealth`, `checkCodexInstallHealth`, `formatCodexHealthWarning` and `isCodexHealthy` to the import from `'../health'`, in alphabetical order with the others. The full list is: `CodexHealthReport, HealthReport, REQUIRED_CHAT_CLASSES, REQUIRED_CLASS_PREFIXES, REQUIRED_CODEX_HOOKS, REQUIRED_JS_HOOKS, WorkbenchHealthReport, checkCodexHealth, checkCodexInstallHealth, checkHealth, checkInstallHealth, checkWorkbenchHealth, checkWorkbenchInstallHealth, formatCodexHealthWarning, formatHealthWarning, formatWorkbenchHealthWarning, isCodexHealthy, isHealthy, isWorkbenchHealthy`.
- Change `import { THEME } from '../features';` to `import { RTL, THEME } from '../features';`.
- Append:

```ts
suite('health — Codex', () => {
  /** One CSS rule per hook, the way Codex's files spell them. */
  const GOOD_CODEX = REQUIRED_CODEX_HOOKS.map((hook) =>
    hook.endsWith('_')
      ? `${hook}abc12_1{color:red}`
      : hook.startsWith('[')
        ? `${hook}=x]{color:red}`
        : hook.startsWith('--')
          ? `:root{${hook}:0}`
          : `${hook}{color:red}`
  ).join('\n');
  const HEALTHY_CODEX: CodexHealthReport = { unreadable: false, missingHooks: [] };

  test('a complete Codex stylesheet set is healthy', () => {
    const report = checkCodexHealth(GOOD_CODEX);
    assert.deepStrictEqual(report, HEALTHY_CODEX);
    assert.strictEqual(isCodexHealthy(report), true);
  });

  test('missing hooks are listed; a longer class or property name does not count', () => {
    const css = GOOD_CODEX.replace('.ProseMirror{color:red}', '.ProseMirror-focused{color:red}').replace(
      ':root{--font-ui-family:0}',
      ':root{--font-ui-family-x:0}'
    );
    assert.deepStrictEqual(checkCodexHealth(css).missingHooks, ['.ProseMirror', '--font-ui-family']);
    assert.strictEqual(isCodexHealthy(checkCodexHealth(css)), false);
  });

  test('an unreadable stylesheet set is reported, and nothing in it is checked', () => {
    assert.deepStrictEqual(checkCodexHealth(null), { unreadable: true, missingHooks: [] });
    assert.strictEqual(isCodexHealthy(checkCodexHealth(null)), false);
  });

  suite('checkCodexInstallHealth', () => {
    let assets: string;

    setup(async () => {
      assets = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'bidi-codex-health-'));
    });

    teardown(async () => {
      await fs.promises.rm(assets, { recursive: true, force: true });
    });

    test('reads every CSS file in the stylesheet\'s folder', async () => {
      const lines = GOOD_CODEX.split('\n');
      const half = Math.ceil(lines.length / 2);
      await fs.promises.writeFile(path.join(assets, 'app-initial-0123456789ab.css'), lines.slice(0, half).join('\n'));
      await fs.promises.writeFile(path.join(assets, 'markdown-0123456789ab.css'), lines.slice(half).join('\n'));
      await fs.promises.writeFile(path.join(assets, 'notes.txt'), '.ProseMirror{}');
      assert.deepStrictEqual(await checkCodexInstallHealth(path.join(assets, 'app-initial-0123456789ab.css')), HEALTHY_CODEX);
    });

    test("ignores this extension's own blocks, which name the same hooks", async () => {
      const without = GOOD_CODEX.replace('.ProseMirror{color:red}', '');
      const css = appendBlock(
        appendBlock(without, THEME.blocks.codex.markers, '.ProseMirror{}'),
        RTL.blocks.codex.markers,
        '.ProseMirror p{}'
      );
      const cssPath = path.join(assets, 'app-initial-0123456789ab.css');
      await fs.promises.writeFile(cssPath, css);
      assert.deepStrictEqual((await checkCodexInstallHealth(cssPath)).missingHooks, ['.ProseMirror']);
    });

    test('reports a folder it cannot read instead of rejecting', async () => {
      const report = await checkCodexInstallHealth(path.join(assets, 'gone', 'app-initial-0123456789ab.css'));
      assert.deepStrictEqual(report, { unreadable: true, missingHooks: [] });
    });
  });

  test('the warning names the Codex version and the missing hooks', () => {
    const message = formatCodexHealthWarning('26.51021.22027', { unreadable: false, missingHooks: ['._MarkdownRoot_', '.ProseMirror'] });
    assert.ok(message.includes('Codex 26.51021.22027'), message);
    assert.ok(message.includes('._MarkdownRoot_, .ProseMirror'), message);
  });

  test('the warning names stylesheets it could not read', () => {
    const message = formatCodexHealthWarning('26.51021.22027', { unreadable: true, missingHooks: [] });
    assert.ok(message.includes('could not read the stylesheets of Codex 26.51021.22027'), message);
    assert.ok(!message.includes('Missing'), message);
  });

  test('a healthy Codex has no warning', () => {
    assert.strictEqual(formatCodexHealthWarning('26.51021.22027', HEALTHY_CODEX), '');
  });
});
```

- [ ] **Step 2: Run the tests to see them fail**

Run: `npm test`
Expected: the compile step fails: `'../health'` has no exported member `REQUIRED_CODEX_HOOKS` (and the other Codex names).

- [ ] **Step 3: Add the Codex health check to `src/health.ts`**

Append to `src/health.ts`:

```ts
/**
 * What the Codex blocks rely on in Codex's own CSS (every webview/assets/*.css
 * file, without this extension's blocks): CSS-module prefixes ("._Name_"),
 * classes (".name"), attributes ("[name") and Codex's custom properties
 * ("--name"), set or read. Exactly the hooks css/codex-theme.css and
 * css/codex-rtl.css use (src/test/codex-css.test.ts checks that). VS Code's
 * --vscode-* colors are VS Code's, so they are not listed.
 */
export const REQUIRED_CODEX_HOOKS: readonly string[] = [
  // the markdown of your messages and Codex's answers
  '._MarkdownRoot_',
  '._Paragraph_',
  '._Heading_',
  '._ListItem_',
  '._UnorderedList_',
  '._Blockquote_',
  '._InlineCode_',
  '--markdown-font-size',
  '--markdown-line-height',
  // your messages
  '.bg-user-message',
  '._bubble_',
  '--color-background-user-message',
  '--color-text-user-message',
  // the composer and its send button
  '._ComposerLayoutRoot_',
  '._RichTextInput_',
  '.ProseMirror',
  '[data-composer-surface-variant',
  '--composer-border-radius',
  '--composer-layout-surface-shadow',
  '--color-background-composer-primary',
  '--color-text-composer-primary',
  // fonts and the palette
  '[data-theme',
  '--font-ui-family',
  '--codex-chat-font-size-override',
  '--app-color-border',
  '--app-color-text-secondary',
];

export interface CodexHealthReport {
  /** Codex's stylesheets could not be read; nothing in them was checked. */
  unreadable: boolean;
  missingHooks: string[];
}

/** A hook as a pattern: a module prefix or an attribute may go on, a class or a property may not. */
function codexHookPattern(hook: string): RegExp {
  const open = hook.endsWith('_') || hook.startsWith('[');
  return new RegExp(escapeRegExp(hook) + (open ? '' : '(?![\\w-])'));
}

/**
 * Checks Codex's CSS, every file together and without this extension's
 * blocks; null stands for files that could not be read.
 */
export function checkCodexHealth(css: string | null): CodexHealthReport {
  if (css === null) {
    return { unreadable: true, missingHooks: [] };
  }
  return { unreadable: false, missingHooks: REQUIRED_CODEX_HOOKS.filter((hook) => !codexHookPattern(hook).test(css)) };
}

export function isCodexHealthy(report: CodexHealthReport): boolean {
  return !report.unreadable && report.missingHooks.length === 0;
}

/**
 * Never rejects. Reads every CSS file next to Codex's stylesheet (Codex loads
 * the conversation's CSS modules from the same folder, about 3 MB in all) and
 * checks them without this extension's blocks.
 */
export async function checkCodexInstallHealth(cssPath: string): Promise<CodexHealthReport> {
  const dir = path.dirname(cssPath);
  let css: string;
  try {
    const names = (await fs.promises.readdir(dir)).filter((name) => name.endsWith('.css'));
    css = (await Promise.all(names.map((name) => fs.promises.readFile(path.join(dir, name), 'utf8')))).join('\n');
  } catch {
    return checkCodexHealth(null);
  }
  for (const feature of FEATURES) {
    css = stripBlock(css, feature.blocks.codex.markers);
  }
  return checkCodexHealth(css);
}

/** The warning for an unhealthy Codex; empty for a healthy one. */
export function formatCodexHealthWarning(version: string, report: CodexHealthReport): string {
  if (isCodexHealthy(report)) {
    return '';
  }
  if (report.unreadable) {
    return `BiDi Theme: could not read the stylesheets of Codex ${version}, so the Codex theme was not checked.`;
  }
  return `BiDi Theme: Codex ${version} changed its markup, so parts of the Codex theme may not apply. ` +
    `Missing: ${report.missingHooks.join(', ')}.`;
}
```

`src/health.ts` already imports `fs`, `path`, `escapeRegExp`, `stripBlock` and `FEATURES`.

- [ ] **Step 4: Write `css/codex-theme.css`**

```css
/* Warm reading theme for OpenAI's Codex panel, dark themes only.
   Codex's webview takes its colors from VS Code's theme: VS Code writes them
   inline on the page's <html> (--vscode-*), and Codex derives its own tokens
   from them on :root, in its theme layer. So the palette redefines VS Code's
   colors on <html>, plus a few of Codex's own tokens that do not come from
   them. Components are matched by Codex's CSS-module prefixes
   ([class*="_Name_"]: the class names carry a build hash) and a few semantic
   classes. Rules (enforced by src/test/codex-css.test.ts): every selector
   starts with body.vscode-dark or :root:has(>body.vscode-dark), only
   @font-face at top level, !important only on the --vscode-* colors, and no
   direction, text-align or unicode-bidi (those belong to css/codex-rtl.css).
   The font files sit next to Codex's stylesheet. */

@font-face{
font-family:"BiDi Rubik";
src:url("bidi-theme-rubik-hebrew.woff2") format("woff2");
font-style:normal;
font-weight:300 900;
font-display:swap;
unicode-range:U+0307-0308,U+0590-05FF,U+200C-2010,U+20AA,U+25CC,U+FB1D-FB4F;
}
@font-face{
font-family:"BiDi Rubik";
src:url("bidi-theme-rubik-latin.woff2") format("woff2");
font-style:normal;
font-weight:300 900;
font-display:swap;
unicode-range:U+0000-00FF,U+0131,U+0152-0153,U+02BB-02BC,U+02C6,U+02DA,U+02DC,U+0304,U+0308,U+0329,U+2000-206F,U+20AC,U+2122,U+2191,U+2193,U+2212,U+2215,U+FEFF,U+FFFD;
}

/* VS Code's colors. !important: VS Code writes them inline on <html>, and
   only an !important declaration outranks an inline style. Every Codex token
   derived from them follows: text, surfaces, inputs, menus, lists, buttons,
   links, code, and the terminal colors command output is drawn with. */
:root:has(>body.vscode-dark){
--vscode-foreground:#ebe5da!important;
--vscode-descriptionForeground:#a39d92!important;
--vscode-disabledForeground:#7d766a!important;
--vscode-icon-foreground:#cfc6b7!important;
--vscode-focusBorder:#d97757!important;
--vscode-widget-border:#3b362f!important;
--vscode-sideBar-background:#1b1a18!important;
--vscode-editor-background:#1b1a18!important;
--vscode-panel-background:#1b1a18!important;
--vscode-editorWidget-background:#242120!important;
--vscode-input-background:#242120!important;
--vscode-input-foreground:#f5f0e8!important;
--vscode-input-border:#736a5d!important;
--vscode-input-placeholderForeground:#9a9387!important;
--vscode-dropdown-background:#242120!important;
--vscode-dropdown-foreground:#ebe5da!important;
--vscode-dropdown-border:#3b362f!important;
--vscode-menu-background:#242120!important;
--vscode-menu-foreground:#ebe5da!important;
--vscode-menu-selectionBackground:#3a332b!important;
--vscode-menu-selectionForeground:#f5f0e8!important;
--vscode-menu-border:#3b362f!important;
--vscode-menu-separatorBackground:#3b362f!important;
--vscode-list-hoverBackground:#2a2622!important;
--vscode-list-activeSelectionBackground:#3a332b!important;
--vscode-list-activeSelectionForeground:#f5f0e8!important;
--vscode-list-inactiveSelectionBackground:#3a332b!important;
--vscode-toolbar-hoverBackground:#2a2622!important;
--vscode-toolbar-activeBackground:#3a332b!important;
--vscode-button-background:#d97757!important;
--vscode-button-foreground:#1b1a18!important;
--vscode-button-hoverBackground:#e3876a!important;
--vscode-button-secondaryBackground:#2f2b26!important;
--vscode-button-secondaryForeground:#ddd4c6!important;
--vscode-button-secondaryHoverBackground:#38332c!important;
--vscode-badge-background:#d97757!important;
--vscode-badge-foreground:#1b1a18!important;
--vscode-textLink-foreground:#e8a07f!important;
--vscode-textLink-activeForeground:#f2b896!important;
--vscode-textPreformat-foreground:#f2b896!important;
--vscode-textPreformat-background:#2b2824!important;
--vscode-textCodeBlock-background:#121110!important;
--vscode-textBlockQuote-background:#211f1c!important;
--vscode-textBlockQuote-border:#d97757!important;
--vscode-textSeparator-foreground:#3b362f!important;
--vscode-terminal-background:#121110!important;
--vscode-terminal-foreground:#cfc6b7!important;
}
/* Codex's own tokens. Codex declares them on :root and again on [data-theme]
   elements, in its theme layer, which an unlayered rule outranks. Without
   the two --app-color hooks, borders and secondary text are mixes of the
   text color. */
:root:has(>body.vscode-dark),
:root:has(>body.vscode-dark) [data-theme]{
--font-ui-family:"BiDi Rubik",-apple-system,BlinkMacSystemFont,system-ui,sans-serif;
--codex-chat-font-size-override:15px;
--app-color-border:#3b362f;
--app-color-text-secondary:#a39d92;
--color-background-user-message:#262320;
--color-text-user-message:#f5f0e8;
--color-background-composer-primary:#c6613f;
--color-text-composer-primary:#faf9f5;
}
/* The webview's body is transparent over VS Code's side bar. */
body.vscode-dark{
background:#1b1a18;
}

/* Your messages: a full-width block with an accent bar where the text
   starts. css/codex-rtl.css makes the block right-to-left, so with RTL on the
   bar sits on the right, as in Claude Code. */
body.vscode-dark .bg-user-message[class*="_bubble_"]{
width:100%;
max-width:none;
border-inline-start:3px solid #d97757;
border-radius:14px;
padding:12px 16px;
}

/* Codex's markdown: roomier lines (Codex sizes them from this variable), and
   the Claude theme's headings, list markers and inline code. */
body.vscode-dark [class*="_MarkdownRoot_"]{
--markdown-line-height:calc(var(--markdown-font-size) * 1.75);
}
body.vscode-dark [class*="_MarkdownRoot_"] [class*="_Heading_"]{
font-weight:600;
color:#f5f0e8;
}
body.vscode-dark [class*="_MarkdownRoot_"] h1[class*="_Heading_"]{
font-size:20px;
}
body.vscode-dark [class*="_MarkdownRoot_"] h2[class*="_Heading_"]{
font-size:18px;
}
body.vscode-dark [class*="_MarkdownRoot_"] h3[class*="_Heading_"]{
font-size:16px;
}
body.vscode-dark [class*="_MarkdownRoot_"] [class*="_ListItem_"]::marker{
color:#d97757;
}
body.vscode-dark [class*="_MarkdownRoot_"] [class*="_InlineCode_"]{
background:#2b2824;
color:#f2b896;
}

/* The composer: rounder, with a thin ring that turns to the accent while you
   type. Codex forces border:0!important on it in a layer, so the ring is its
   surface shadow. Inline composers stay as they are. */
body.vscode-dark [class*="_ComposerLayoutRoot_"]:not([data-composer-surface-variant="inline"]){
--composer-border-radius:18px;
--composer-layout-surface-shadow:0 0 0 1px #736a5d;
}
body.vscode-dark [class*="_ComposerLayoutRoot_"]:not([data-composer-surface-variant="inline"]):focus-within{
--composer-layout-surface-shadow:0 0 0 1px #d97757;
}
/* The text you type: 1.2x the 15px messages, as in Claude Code. */
body.vscode-dark [class*="_RichTextInput_"] .ProseMirror{
font-size:18px;
line-height:1.5;
}
```

- [ ] **Step 5: Run the tests to see them pass**

Run: `npm test`
Expected: PASS, including `codex-theme.css — rules`, `codex-theme.css — assets`, `Codex CSS — health check coverage` and `health — Codex`.

If the coverage test fails, its message lists both sets. A hook that only the CSS uses means the CSS gained a selector or variable: add the hook to `REQUIRED_CODEX_HOOKS` only after checking that Codex's CSS has it (`grep -l` in the unpacked Codex's `webview/assets/*.css`). A hook that only the list has goes from the list.

- [ ] **Step 6: Commit**

```bash
git add css/codex-theme.css src/health.ts src/test/codex-css.test.ts src/test/health.test.ts
git commit -m "feat: warm theme block for Codex, with its health check

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

### Task 4: The Codex fixture and the diagnostics script

**Files:**
- Modify: `scripts/fixture-lib.js` (`TYPES`, `missingClasses`)
- Create: `src/test/fixture-lib.test.ts`
- Create: `diagnostics/codex.js`
- Create: `scripts/fixture/codex.html`
- Create: `scripts/render-codex-fixture.js`
- Modify: `package.json` (`scripts`)

**Interfaces:**
- Consumes:
  - `findCodexCss` (Task 1), as `require('../out/codex')`;
  - `checkCodexInstallHealth`, `isCodexHealthy`, `formatCodexHealthWarning` (Task 3), as `require('../out/health')`;
  - `computeSyncedCss`, `loadBlockBodies` from `out/sync`, and `THEME` from `out/features`;
  - `css/codex-theme.css` and `css/codex-rtl.css` (Tasks 2, 3).
- Produces:
  - `diagnostics/codex.js`: Task 5's command copies this file's text. The script is one function expression called at once, so the value of the whole script is its report. Without DevTools' `copy()` it logs the JSON instead.
  - `missingClasses(page, css)` with the same signature: class lists are HTML-decoded, and names are looked up CSS-escaped.
  - `npm run fixture:codex -- <codex-extension-dir> [out-dir]` writes `codex-fixture-dark.png` and `codex-fixture-light.png`.

The fixture page reproduces what Codex 26.51021 renders, with its real class strings:
- your message: the `user-message-bubble` component, holding the `user-formatted-text` markdown;
- four long paragraphs (Hebrew, English, Hebrew, English) that wrap, for the diagnostics' side of a wrapped paragraph *(added during execution, Task 4 review)*;
- an answer: the markdown root and its default components (`presentation-components`: `p`, `h2`, `ul`/`li`, all with `dir="auto"`; code with `dir="ltr"`), with a tight list and a loose one (its items hold paragraphs);
- the composer: `composer-layout`, the `prompt-editor`'s `_RichTextInput_` wrapper and a ProseMirror editor, and the send button's `bg-composer-primary text-composer-primary`.

The page loads Codex's main stylesheet and the conversation's CSS chunks, the way Codex's page does. The prototype rendered this page with the CSS of Tasks 2 and 3 and measured every value the checks expect.

- [ ] **Step 1: Make sure the unpacked Codex is there**

Run: `ls /private/tmp/claude-501/-Users-snirhakmoun/deb757a7-607a-4128-a1b1-c3bec6783887/scratchpad/codex/extension/webview/index.html`
Expected: the path is printed. If it is missing (another session), download Codex 26.51021.22027 for darwin-arm64 from the Marketplace and unpack it. Only read its files; never run anything from it:

```bash
mkdir -p "$TMPDIR/codex-vsix" && cd "$TMPDIR/codex-vsix" \
  && curl -sL --compressed -o codex.vsix 'https://openai.gallerycdn.vsassets.io/extensions/openai/chatgpt/26.51021.22027/1792787943772/Microsoft.VisualStudio.Services.VSIXPackage' \
  && unzip -q -o codex.vsix -d codex && ls "$TMPDIR/codex-vsix/codex/extension/webview/index.html"; cd ~/vscode-bidi-flipper
```

Below, `CODEX` stands for the folder that holds `webview/` (`…/scratchpad/codex/extension` or `$TMPDIR/codex-vsix/codex/extension`).

- [ ] **Step 2: Write the failing test for `missingClasses`**

Create `src/test/fixture-lib.test.ts`:

```ts
import * as assert from 'assert';
import * as path from 'path';

// scripts/fixture-lib.js is plain JS, loaded from the repo (the tests run from out/test).
const { missingClasses } = require(path.join(__dirname, '..', '..', 'scripts', 'fixture-lib')) as {
  missingClasses(page: string, css: string): string[];
};

suite('fixture-lib — missingClasses', () => {
  test('finds plain class names, skips placeholders and reports the undefined ones', () => {
    const page = '<div class="turn_07S1Yg __THEME_CLASS__ ghost"></div>';
    assert.deepStrictEqual(missingClasses(page, '.turn_07S1Yg{top:0}'), ['ghost']);
  });

  test('reads class lists HTML-decoded and looks names up the way CSS escapes them', () => {
    const page = '<div class="max-w-(--user-chat-width) [&amp;&gt;p]:!m-0 rounded-2xl"></div>';
    const css =
      '.max-w-\\(--user-chat-width\\){max-width:var(--user-chat-width)}' +
      '.\\[\\&\\>p\\]\\:\\!m-0>p{margin:0!important}';
    assert.deepStrictEqual(missingClasses(page, css), ['rounded-2xl']);
  });

  test('a longer name does not count', () => {
    assert.deepStrictEqual(missingClasses('<p class="value"></p>', '.value-x{top:0}'), ['value']);
  });
});
```

- [ ] **Step 3: Run the test to see it fail**

Run: `npm test`
Expected: `reads class lists HTML-decoded and looks names up the way CSS escapes them` FAILS. Its actual value lists `max-w-(--user-chat-width)` and `[&amp;&gt;p]:!m-0` next to `rounded-2xl`. The other two pass.

- [ ] **Step 4: Teach `missingClasses` Tailwind's names, and serve `.js`**

In `scripts/fixture-lib.js`, change `TYPES` to:

```js
const TYPES = { '.html': 'text/html; charset=utf-8', '.css': 'text/css', '.woff2': 'font/woff2', '.js': 'text/javascript' };
```

and replace the whole `missingClasses` function and its comment with:

```js
// The class names in a fixture page that the given CSS does not define: a sign that the fixture
// no longer matches what the app renders. Placeholders like __THEME_CLASS__ are skipped. Class
// lists are HTML-decoded, and each name is looked up the way CSS writes it, with a backslash
// before every character other than a letter, a digit, _ or - (Tailwind names such as
// max-w-(--user-chat-width) or [&>p]:!m-0).
function missingClasses(page, css) {
  const entities = { amp: '&', lt: '<', gt: '>', quot: '"' };
  const names = new Set();
  for (const [, list] of page.matchAll(/class="([^"]*)"/g)) {
    for (const name of list.replace(/&(amp|lt|gt|quot);/g, (_, entity) => entities[entity]).split(/\s+/)) {
      if (name && !name.startsWith('__')) {
        names.add(name);
      }
    }
  }
  const cssName = (name) => name.replace(/[^\w-]/g, '\\$&');
  const defined = (name) =>
    new RegExp(`\\.${cssName(name).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?![\\w-])`).test(css);
  return [...names].filter((name) => !defined(name));
}
```

Names made only of letters, digits, `_` and `-` (every class in `panel.html` and `chat.html`) are looked up exactly as before.

- [ ] **Step 5: Run the test to see it pass**

Run: `npm test`
Expected: PASS.

- [ ] **Step 6: Write `diagnostics/codex.js`**

```js
// BiDi RTL & Theme: a report on how the extension's blocks apply in the Codex panel, for its
// DevTools console. Click in the Codex panel, run "Developer: Open Webview Developer Tools", open
// the Console, type "allow pasting" the first time, then paste this and press Enter. It reads the
// page's structure and computed styles and never exports message text or anything from your files:
// the report holds class and data-attribute names, the page's window type and theme kind, computed
// styles, and the names of Codex's own stylesheets. It goes to the clipboard as JSON.
(function bidiCodexDiagnostics() {
  'use strict';
  // What the blocks style, as css/codex-theme.css and css/codex-rtl.css match it.
  const HOOKS = {
    markdownRoot: '[class*="_MarkdownRoot_"]',
    paragraph: '[class*="_MarkdownRoot_"] [class*="_Paragraph_"]',
    heading: '[class*="_MarkdownRoot_"] [class*="_Heading_"]',
    listItem: '[class*="_MarkdownRoot_"] [class*="_ListItem_"]',
    userMessage: '.bg-user-message[class*="_bubble_"]',
    composer: '[class*="_ComposerLayoutRoot_"]',
    composerEditor: '[class*="_RichTextInput_"] .ProseMirror',
    composerLine: '[class*="_RichTextInput_"] .ProseMirror p',
    sendButton: '.bg-composer-primary',
    inlineCode: '[class*="_InlineCode_"]',
    codeBlock: '[class*="_MarkdownRoot_"] pre',
  };
  const SAMPLED = ['paragraph', 'heading', 'listItem', 'composerLine'];
  const CONTAINERS = ['markdownRoot', 'userMessage', 'composer', 'composerEditor', 'codeBlock'];
  const RTL_CHAR = /[֐-ࣿיִ-﷿ﹰ-ﻼ]/;
  const LTR_CHAR = /[A-Za-zÀ-ɏͰ-ϿЀ-ӿ]/;

  // The Codex page: this frame, or a child frame of the same origin.
  function codexDocument() {
    if (document.documentElement.hasAttribute('data-codex-window-type')) {
      return document;
    }
    for (const frame of document.querySelectorAll('iframe')) {
      try {
        const doc = frame.contentDocument;
        if (doc && doc.documentElement.hasAttribute('data-codex-window-type')) {
          return doc;
        }
      } catch {
        // another origin: not the Codex page
      }
    }
    return null;
  }

  // The direction of the first strong character, worked out here; the text itself never leaves.
  function firstStrong(text) {
    for (const ch of text) {
      if (RTL_CHAR.test(ch)) {
        return 'rtl';
      }
      if (LTR_CHAR.test(ch)) {
        return 'ltr';
      }
    }
    return 'none';
  }

  const doc = codexDocument();
  if (!doc) {
    const message =
      'BiDi: no Codex page in this frame. Pick "active-frame" in the Console\'s context menu (top left), then run this again.';
    console.warn(message);
    return { error: message };
  }
  const view = doc.defaultView;
  const root = doc.documentElement;
  const style = (el) => view.getComputedStyle(el);
  const classes = (el) => (typeof el.className === 'string' ? el.className.split(/\s+/).filter(Boolean) : []);
  const attributeNames = (el) => el.getAttributeNames().filter((name) => name === 'dir' || name.startsWith('data-'));
  // Which side of its box the text sits on, judged on its shortest rendered line: a full line can
  // fill the box and say nothing about the side.
  const side = (el) => {
    const range = doc.createRange();
    range.selectNodeContents(el);
    const lines = [];
    for (const rect of range.getClientRects()) {
      if (rect.width === 0) {
        continue;
      }
      const middle = (rect.top + rect.bottom) / 2;
      const line = lines.find((l) => middle >= l.top && middle <= l.bottom);
      if (line) {
        line.left = Math.min(line.left, rect.left);
        line.right = Math.max(line.right, rect.right);
      } else {
        lines.push({ top: rect.top, bottom: rect.bottom, left: rect.left, right: rect.right });
      }
    }
    if (lines.length === 0) {
      return 'empty';
    }
    const shortest = lines.reduce((a, b) => (b.right - b.left < a.right - a.left ? b : a));
    const box = el.getBoundingClientRect();
    const left = shortest.left - box.left;
    const right = box.right - shortest.right;
    return Math.abs(left - right) < 2 ? 'center' : left < right ? 'left' : 'right';
  };
  const sample = (el) => {
    const s = style(el);
    return {
      side: side(el),
      firstStrong: firstStrong(el.textContent || ''),
      direction: s.direction,
      unicodeBidi: s.unicodeBidi,
      textAlign: s.textAlign,
      font: s.fontFamily.split(',')[0].trim(),
      size: s.fontSize,
    };
  };
  const ancestry = (el) => {
    const chain = [];
    for (let node = el; node && node !== doc.body && chain.length < 5; node = node.parentElement) {
      chain.push({ tag: node.tagName.toLowerCase(), classes: classes(node), attributes: attributeNames(node) });
    }
    return chain;
  };

  const counts = {};
  for (const [name, selector] of Object.entries(HOOKS)) {
    counts[name] = doc.querySelectorAll(selector).length;
  }
  const samples = {};
  for (const name of SAMPLED) {
    samples[name] = [...doc.querySelectorAll(HOOKS[name])].slice(0, 10).map(sample);
  }
  const containers = {};
  for (const name of CONTAINERS) {
    const el = doc.querySelector(HOOKS[name]);
    containers[name] = el ? ancestry(el) : null;
  }
  const rootStyle = style(root);
  // A loose list item's first paragraph runs inline with unicode-bidi:normal (css/codex-rtl.css): skip it.
  const paragraph = doc.querySelector(`${HOOKS.paragraph}:not([class*="_ListItem_"] > :first-child)`);
  const report = {
    report: 'bidi-codex-diagnostics',
    version: 1,
    windowType: root.getAttribute('data-codex-window-type'),
    themeKind: doc.body.getAttribute('data-vscode-theme-kind'),
    blocks: {
      theme: rootStyle.getPropertyValue('--codex-chat-font-size-override').trim() === '15px',
      rtl: paragraph ? style(paragraph).unicodeBidi === 'plaintext' : null,
    },
    rubik: [...doc.fonts].filter((f) => f.family.replace(/"/g, '') === 'BiDi Rubik').map((f) => f.status),
    chatFontSize: rootStyle.getPropertyValue('--codex-chat-font-size').trim(),
    counts,
    samples,
    containers,
    stylesheets: [...doc.styleSheets].map((sheet) => (sheet.href ? sheet.href.split(/[?#]/)[0].split('/').pop() : 'inline')),
  };
  const json = JSON.stringify(report, null, 2);
  if (typeof copy === 'function') {
    copy(json); // the DevTools Console's own helper
    console.log('BiDi: the Codex report is on the clipboard. Paste it into a message to yourself.');
  } else {
    console.log(json);
  }
  return report;
})();
```

- [ ] **Step 7: Write `scripts/fixture/codex.html`**

```html
<!doctype html>
<!-- The Codex fixture. scripts/render-codex-fixture.js serves it twice against Codex's real CSS,
     the main stylesheet with both Codex blocks synced and then the conversation's CSS chunks: with
     the body marked vscode-dark, and vscode-light to check that none of the theme applies there
     (RTL applies in every theme). Both pages keep the Dark Modern values that VS Code writes inline
     on <html>, so the light page checks the theme's scoping only, not how a light theme looks. The
     markup follows Codex 26.51021's components: your message (user-message-bubble and
     user-formatted-text), an answer through the markdown renderer's default components, secondary
     text, a bordered box, and the composer (composer-layout, prompt-editor, ProseMirror) with its
     send button. Every class here must exist in that CSS (the script checks). -->
<html lang="en" data-codex-window-type="extension" style="--vscode-font-family:-apple-system, BlinkMacSystemFont, sans-serif;--vscode-font-size:13px;--vscode-font-weight:normal;--vscode-editor-font-family:Menlo, Monaco, 'Courier New', monospace;--vscode-editor-font-size:12px;--vscode-editor-font-weight:normal;--vscode-foreground:#cccccc;--vscode-descriptionForeground:#9d9d9d;--vscode-disabledForeground:#cccccc80;--vscode-icon-foreground:#cccccc;--vscode-focusBorder:#0078d4;--vscode-widget-border:#313131;--vscode-sideBar-background:#181818;--vscode-editor-background:#1f1f1f;--vscode-panel-background:#181818;--vscode-editorWidget-background:#202020;--vscode-input-background:#313131;--vscode-input-foreground:#cccccc;--vscode-input-border:#3c3c3c;--vscode-input-placeholderForeground:#989898;--vscode-dropdown-background:#313131;--vscode-dropdown-foreground:#cccccc;--vscode-dropdown-border:#3c3c3c;--vscode-menu-background:#1f1f1f;--vscode-menu-foreground:#cccccc;--vscode-menu-selectionBackground:#0078d4;--vscode-menu-selectionForeground:#ffffff;--vscode-menu-border:#454545;--vscode-menu-separatorBackground:#454545;--vscode-list-hoverBackground:#2a2d2e;--vscode-list-activeSelectionBackground:#04395e;--vscode-list-activeSelectionForeground:#ffffff;--vscode-list-inactiveSelectionBackground:#37373d;--vscode-toolbar-hoverBackground:#5a5d5e50;--vscode-toolbar-activeBackground:#63666750;--vscode-button-background:#0078d4;--vscode-button-foreground:#ffffff;--vscode-button-hoverBackground:#026ec1;--vscode-button-secondaryBackground:#313131;--vscode-button-secondaryForeground:#cccccc;--vscode-button-secondaryHoverBackground:#3c3c3c;--vscode-badge-background:#616161;--vscode-badge-foreground:#f8f8f8;--vscode-textLink-foreground:#4daafc;--vscode-textLink-activeForeground:#4daafc;--vscode-textPreformat-foreground:#d0d0d0;--vscode-textPreformat-background:#3c3c3c;--vscode-textCodeBlock-background:#2b2b2b;--vscode-textBlockQuote-background:#2b2b2b;--vscode-textBlockQuote-border:#616161;--vscode-textSeparator-foreground:#21262d;--vscode-terminal-background:#181818;--vscode-terminal-foreground:#cccccc;">
<head>
<meta charset="utf-8">
<link rel="stylesheet" href="app-initial.css">
__CHUNKS__
<style>
/* Fixture only: the page is the Codex side bar, with some room around the thread, and the send
   button gets the size its own utility classes give it in Codex. */
html,body{margin:0}
#root{padding:16px}
#send{width:36px;height:36px}
</style>
</head>
<body class="__THEME_KIND__" data-vscode-theme-kind="__THEME_KIND__">
<div id="root">
<div class="flex flex-col gap-6">

<div dir="auto" class="_MarkdownRoot_16avx_2 [&amp;&gt;*:first-child]:mt-0 [&amp;&gt;*:last-child]:mb-0" id="wrapped">
<p class="_Paragraph_16avx_2" dir="auto">כשמפעילים את ערכת הנושא, התוסף מוסיף בלוק CSS לקובץ הסגנונות של Codex ומעתיק לידו את הגופנים. כשמכבים אותה, הבלוק יוצא והגופנים נמחקים, כך שהקובץ חוזר להיות בדיוק כמו שהיה. כל זה קורה שוב אחרי עדכון של Codex, בפעם הבאה שהחלון נפתח.</p>
<p class="_Paragraph_16avx_2" dir="auto">When the theme is on, the extension appends a CSS block to the stylesheet of Codex and copies the fonts next to it. When it is off, the block comes out and the fonts are deleted, so the file is exactly as it was. All of this happens again after a Codex update, the next time the window opens.</p>
<p class="_Paragraph_16avx_2" dir="auto">בדיקת התקינות קוראת את כל קובצי ה־CSS של Codex, אחד אחרי השני, ומחפשת בהם את כל המשתנים והמחלקות שהבלוקים צריכים. אם משהו חסר, מופיעה אזהרה אחת לכל גרסה של Codex, והעיצוב נשאר במקומו בינתיים, עד שהתוסף יתעדכן.</p>
<p class="_Paragraph_16avx_2" dir="auto">The health check reads every CSS file of Codex, one at a time, and looks for each variable and class the blocks need. If one is missing, a single warning shows for that version of Codex, and the styles stay in place meanwhile, until the extension is updated.</p>
</div>

<div class="flex w-full flex-col items-end" id="user-row">
<div data-user-message-bubble="true" class="bg-user-message text-user-message min-w-0 max-w-(--user-chat-width) overflow-hidden break-words px-(--thread-content-margin) [&amp;_.contain-inline-size]:[contain:initial] _bubble_168sz_1 py-2.5 rounded-2xl relative text-start" id="bubble">
<div class="relative w-full min-w-0 text-size-chat leading-relaxed">
<div dir="auto" data-markdown-text-tone="user-message" class="_MarkdownRoot_16avx_2 [&amp;&gt;*:first-child]:mt-0 [&amp;&gt;*:last-child]:mb-0 text-size-chat whitespace-pre-wrap [&amp;_ol]:!ps-6 [&amp;_ul]:!ps-6 rich-text-user-turn [&amp;&gt;p]:!m-0 [&amp;&gt;p+p]:!mt-5"><p class="_Paragraph_16avx_2" dir="auto" id="user-p"><span id="user-he">תבדוק בבקשה את הפונקציה syncInstall</span>
<span id="user-en">Then check the README in English</span></p></div>
</div>
</div>
</div>

<div dir="auto" class="_MarkdownRoot_16avx_2 [&amp;&gt;*:first-child]:mt-0 [&amp;&gt;*:last-child]:mb-0" id="answer">
<h2 class="_Heading_16avx_2" dir="auto" id="answer-h2">מה הפונקציה עושה</h2>
<p class="_Paragraph_16avx_2" dir="auto" id="answer-he">הפונקציה מביאה את קובץ ה־CSS למצב שמתאים למודולים, ואז מעתיקה את <code class="_InlineCode_16avx_2" dir="ltr" id="inline-code">rubik.woff2</code> לתיקייה.</p>
<p class="_Paragraph_16avx_2" dir="auto" id="answer-en">In short: fonts are copied before the CSS is written.</p>
<ul class="_List_16avx_2 _UnorderedList_16avx_2" dir="auto"><li class="_ListItem_16avx_2" id="li-en">Fonts first</li><li class="_ListItem_16avx_2" id="li-he">ואז ה־CSS</li></ul>
<ul class="_List_16avx_2 _UnorderedList_16avx_2" dir="auto"><li class="_ListItem_16avx_2" id="loose-en"><p class="_Paragraph_16avx_2" dir="auto" id="loose-en-p">Fonts first, then the CSS</p></li><li class="_ListItem_16avx_2" id="loose-he"><p class="_Paragraph_16avx_2" dir="auto" id="loose-he-p">ואז ה־CSS נכתב</p><p class="_Paragraph_16avx_2" dir="auto" id="loose-he-p2">ובסוף מוחקים גופנים שלא בשימוש</p></li></ul>
<pre dir="ltr" id="code-block"><code>await syncInstall(dir, root, enabled);</code></pre>
<p class="_Paragraph_16avx_2" dir="auto"><span class="text-secondary" id="secondary">Worked for 2m</span> <span class="text-tertiary" id="tertiary">2 files</span></p>
<div class="border border-border rounded-lg p-2" id="bordered">box</div>
</div>

<div class="_ComposerLayoutRoot_1q7o3_2" data-composer-surface-variant="default" data-composer-radius-variant="default" data-composer-layout="multiline" id="composer">
<div class="_ComposerLayoutBody_1q7o3_2">
<div class="_ComposerLayoutInput_1q7o3_2" data-composer-layout="multiline">
<div class="_RichTextInput_1ev2o_1 _composer_ilwj8_1 _composerTables_ilwj8_49 _composerHorizontalRules_x01ph_1" data-rich-text-layout="multiline">
<div class="ProseMirror" contenteditable="true" data-composer-markdown="true" id="editor"><p id="editor-he">ובדוק גם את uninstall.ts</p><p id="editor-en">and the README</p></div>
</div>
</div>
<div class="_ComposerLayoutFooter_1q7o3_2"><button class="bg-composer-primary text-composer-primary rounded-full" id="send">↑</button></div>
</div>
</div>

</div>
</div>
<script>
// Fixture only: measures what scripts/render-codex-fixture.js checks, then runs the diagnostics
// script (served as codex-diagnostics.js) the way the DevTools Console would.
document.fonts.ready.then(async () => {
  const q = (s) => document.querySelector(s);
  const cs = (s, pseudo) => getComputedStyle(q(s), pseudo);
  const rect = (s) => q(s).getBoundingClientRect();
  // Where an element's text starts and ends, from its rendered lines.
  const textRect = (s) => {
    const range = document.createRange();
    range.selectNodeContents(q(s));
    return range.getBoundingClientRect();
  };
  const report = {
    fontsLoaded: [...document.fonts].filter((f) => f.family.replace(/"/g, '') === 'BiDi Rubik' && f.status === 'loaded').length,
    bodyBg: getComputedStyle(document.body).backgroundColor,
    textFont: cs('#answer-en').fontFamily,
    textSize: cs('#answer-en').fontSize,
    lineHeight: cs('#answer-en').lineHeight,
    textColor: cs('#answer-en').color,
    h2: `${cs('#answer-h2').fontSize} ${cs('#answer-h2').fontWeight} ${cs('#answer-h2').color}`,
    marker: cs('#li-en', '::marker').color,
    inlineCode: `${cs('#inline-code').backgroundColor} / ${cs('#inline-code').color}`,
    inlineCodeDir: cs('#inline-code').direction,
    codeDir: cs('#code-block').direction,
    secondary: cs('#secondary').color,
    tertiary: cs('#tertiary').color,
    border: cs('#bordered').borderTopColor,
    bubble: `${cs('#bubble').backgroundColor} ${cs('#bubble').color} ${cs('#bubble').borderTopLeftRadius} ${cs('#bubble').paddingTop} ${cs('#bubble').paddingLeft}`,
    bubbleBar: `${cs('#bubble').borderRightWidth} ${cs('#bubble').borderRightStyle} ${cs('#bubble').borderRightColor}`,
    bubbleBarLeft: cs('#bubble').borderLeftWidth,
    bubbleDir: cs('#bubble').direction,
    bubbleWidth: Math.round(rect('#bubble').width),
    rowWidth: Math.round(rect('#user-row').width),
    composer: `${cs('#composer').backgroundColor} ${cs('#composer').borderTopLeftRadius} ${cs('#composer').boxShadow}`,
    editor: `${cs('#editor').fontSize} ${cs('#editor').lineHeight}`,
    editorFont: cs('#editor').fontFamily,
    send: `${cs('#send').backgroundColor} ${cs('#send').color}`,
    paragraphBidi: cs('#answer-en').unicodeBidi,
    answerHeRight: Math.round(rect('#answer-he').right - textRect('#answer-he').right),
    answerEnLeft: Math.round(textRect('#answer-en').left - rect('#answer-en').left),
    listPosition: cs('#li-he').listStylePosition,
    listBidi: cs('#li-he').unicodeBidi,
    listHeRight: Math.round(rect('#li-he').right - textRect('#li-he').right),
    listEnLeft: Math.round(textRect('#li-en').left - rect('#li-en').left),
    userHeRight: Math.round(rect('#user-p').right - textRect('#user-he').right),
    userEnLeft: Math.round(textRect('#user-en').left - rect('#user-p').left),
    editorHeRight: Math.round(rect('#editor-he').right - textRect('#editor-he').right),
    editorEnLeft: Math.round(textRect('#editor-en').left - rect('#editor-en').left),
    looseEnTop: Math.round(textRect('#loose-en-p').top - rect('#loose-en').top),
    looseHeTop: Math.round(textRect('#loose-he-p').top - rect('#loose-he').top),
    looseEnLeft: Math.round(textRect('#loose-en-p').left - rect('#loose-en').left),
    looseHeRight: Math.round(rect('#loose-he').right - textRect('#loose-he-p').right),
    looseSecondBelow: Math.round(rect('#loose-he-p2').top - textRect('#loose-he-p').bottom),
    wrappedLines: [...document.querySelectorAll('#wrapped p')].map((p) => Math.round(p.getBoundingClientRect().height / parseFloat(getComputedStyle(p).lineHeight))),
  };
  q('#editor').focus();
  report.composerFocused = cs('#composer').boxShadow;
  const code = await (await fetch('codex-diagnostics.js')).text();
  // The script is one call expression: an indirect eval runs it as a classic script and returns its report.
  report.diagnostics = (0, eval)(code);
  document.body.setAttribute('data-report', JSON.stringify(report));
});
</script>
</body>
</html>
```

- [ ] **Step 8: Write `scripts/render-codex-fixture.js` and its npm script**

```js
// Renders scripts/fixture/codex.html against a real Codex install's CSS with both Codex blocks
// synced, in VS Code's dark theme (vscode-dark) and a light one (vscode-light), checks computed
// styles, runs diagnostics/codex.js on the page and saves screenshots. Only reads the Codex
// install: everything is written to a temp folder.
// Usage: node scripts/render-codex-fixture.js <codex-extension-dir> [out-dir]
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const { CHROME, missingClasses, renderReport, serve } = require('./fixture-lib');
const { computeSyncedCss, loadBlockBodies } = require('../out/sync');
const { THEME } = require('../out/features');
const { findCodexCss } = require('../out/codex');
const { checkCodexInstallHealth, formatCodexHealthWarning, isCodexHealthy } = require('../out/health');

const ROOT = path.join(__dirname, '..');
// A roomy side bar, tall enough for the thread and the composer.
const SIZE = '900,1100';
// The CSS chunks Codex loads with a conversation, by name: their file names end in a hash.
const CHUNKS = ['markdown', 'user-message-bubble', 'user-formatted-text', 'composer-layout', 'prompt-editor', 'prosemirror', 'composer-content'];
// Text the page shows. The diagnostics report must hold none of it.
const PAGE_TEXT = ['syncInstall', 'README', 'uninstall', 'הפונקציה', 'Fonts first', 'ואז', 'appends', 'התקינות'];
const USAGE = `usage: node scripts/render-codex-fixture.js <codex-extension-dir> [out-dir]
e.g. node scripts/render-codex-fixture.js ~/.vscode/extensions/openai.chatgpt-26.51021.22027-darwin-arm64
Chrome: ${CHROME} (set CHROME_PATH to use another)`;

function check(mode, r) {
  const problems = [];
  const expect = (ok, message) => {
    if (!ok) {
      problems.push(message);
    }
  };
  // RTL applies in every theme.
  expect(r.paragraphBidi === 'plaintext', `paragraph unicode-bidi: ${r.paragraphBidi} (want plaintext)`);
  expect(r.answerHeRight <= 1 && r.answerEnLeft <= 1, `answer: Hebrew ${r.answerHeRight}px from the right, English ${r.answerEnLeft}px from the left`);
  expect(r.listPosition === 'inside' && r.listBidi === 'plaintext', `list items: ${r.listPosition} markers, ${r.listBidi} (want inside, plaintext)`);
  expect(
    r.listHeRight > 0 && r.listHeRight < 30 && r.listEnLeft > 0 && r.listEnLeft < 30,
    `list markers: the Hebrew item's text ends ${r.listHeRight}px from the right, the English item's starts ${r.listEnLeft}px from the left (want each marker before its text)`
  );
  expect(
    r.looseEnTop <= 8 && r.looseHeTop <= 8 && r.looseEnLeft > 0 && r.looseEnLeft < 30 && r.looseHeRight > 0 && r.looseHeRight < 30 && r.looseSecondBelow >= 0,
    `loose list: text ${r.looseEnTop}/${r.looseHeTop}px below its item's top, English ${r.looseEnLeft}px from the left, Hebrew ${r.looseHeRight}px from the right, the second paragraph ${r.looseSecondBelow}px below the first (want each marker beside its text)`
  );
  expect(r.userHeRight <= 1 && r.userEnLeft <= 1, `your message's lines: Hebrew ${r.userHeRight}px from the right, English ${r.userEnLeft}px from the left`);
  expect(r.editorHeRight <= 1 && r.editorEnLeft <= 1, `composer lines: Hebrew ${r.editorHeRight}px from the right, English ${r.editorEnLeft}px from the left`);
  expect(r.codeDir === 'ltr' && r.inlineCodeDir === 'ltr', `code: block ${r.codeDir}, inline ${r.inlineCodeDir} (want ltr)`);
  expect(r.bubbleDir === 'rtl', `your message's block direction: ${r.bubbleDir} (want rtl)`);
  const d = r.diagnostics || {};
  expect(
    d.report === 'bidi-codex-diagnostics' && d.blocks && d.blocks.rtl === true && d.blocks.theme === (mode === 'dark'),
    `diagnostics: blocks ${JSON.stringify(d.blocks)}`
  );
  expect(
    d.counts && d.counts.userMessage === 1 && d.counts.listItem === 4 && d.counts.composerLine === 2 && d.counts.sendButton === 1,
    `diagnostics: counts ${JSON.stringify(d.counts)}`
  );
  expect(
    d.samples && d.samples.paragraph.some((s) => s.firstStrong === 'rtl' && s.side === 'right'),
    `diagnostics: no Hebrew paragraph on the right in ${JSON.stringify(d.samples && d.samples.paragraph)}`
  );
  const wrapped = d.samples ? d.samples.paragraph.slice(0, 4).map((s) => `${s.firstStrong}:${s.side}`).join(' ') : '';
  expect(
    r.wrappedLines.every((lines) => lines >= 2) && wrapped === 'rtl:right ltr:left rtl:right ltr:left',
    `diagnostics: the wrapped paragraphs (${r.wrappedLines.join(', ')} lines) read ${wrapped} (want rtl:right ltr:left rtl:right ltr:left)`
  );
  const leaked = PAGE_TEXT.filter((text) => JSON.stringify(d).includes(text));
  expect(leaked.length === 0, `diagnostics: the report holds the page's text: ${leaked.join(', ')}`);
  if (mode === 'dark') {
    expect(r.fontsLoaded >= 2, `BiDi Rubik faces loaded: ${r.fontsLoaded} (want 2)`);
    expect(r.bodyBg === 'rgb(27, 26, 24)', `panel background: ${r.bodyBg}`);
    expect(r.textFont.startsWith('"BiDi Rubik"'), `text font: ${r.textFont}`);
    expect(r.textSize === '15px' && r.lineHeight === '26.25px', `text: ${r.textSize} / ${r.lineHeight} (want 15px / 26.25px)`);
    expect(r.textColor === 'rgb(235, 229, 218)', `text color: ${r.textColor}`);
    expect(r.h2 === '18px 600 rgb(245, 240, 232)', `h2: ${r.h2}`);
    expect(r.marker === 'rgb(217, 119, 87)', `list marker: ${r.marker}`);
    expect(r.inlineCode === 'rgb(43, 40, 36) / rgb(242, 184, 150)', `inline code: ${r.inlineCode}`);
    expect(r.secondary === 'rgb(163, 157, 146)' && r.tertiary === 'rgb(163, 157, 146)', `secondary / tertiary text: ${r.secondary} / ${r.tertiary}`);
    expect(r.border === 'rgb(59, 54, 47)', `border: ${r.border}`);
    expect(r.bubble === 'rgb(38, 35, 32) rgb(245, 240, 232) 14px 12px 16px', `your message: ${r.bubble}`);
    expect(r.bubbleBar === '3px solid rgb(217, 119, 87)' && r.bubbleBarLeft === '0px', `your message's accent bar: right ${r.bubbleBar}, left ${r.bubbleBarLeft} (want it on the right)`);
    expect(r.bubbleWidth === r.rowWidth, `your message: ${r.bubbleWidth}px wide (want the row's ${r.rowWidth}px)`);
    expect(r.composer === 'rgb(36, 33, 32) 18px rgb(115, 106, 93) 0px 0px 0px 1px', `composer: ${r.composer}`);
    expect(r.composerFocused === 'rgb(217, 119, 87) 0px 0px 0px 1px', `focused composer ring: ${r.composerFocused}`);
    expect(r.editor === '18px 27px' && r.editorFont.startsWith('"BiDi Rubik"'), `composer text: ${r.editor} ${r.editorFont}`);
    expect(r.send === 'rgb(198, 97, 63) rgb(250, 249, 245)', `send button: ${r.send}`);
  } else {
    // Only the body's theme kind differs from the dark page, so these check that none of the theme applies.
    expect(r.fontsLoaded === 0, `BiDi Rubik faces loaded: ${r.fontsLoaded} (want 0)`);
    expect(!r.textFont.includes('BiDi Rubik') && r.textSize === '13px', `light theme text: ${r.textFont} ${r.textSize} (want VS Code's font at 13px)`);
    expect(r.bodyBg === 'rgba(0, 0, 0, 0)', `light theme paints the panel: ${r.bodyBg}`);
    expect(r.bubbleWidth < r.rowWidth && r.bubbleBar.startsWith('0px'), `light theme styles your message: ${r.bubbleWidth}px, bar ${r.bubbleBar}`);
    expect(!r.composer.includes('rgb(115, 106, 93)'), `light theme rings the composer: ${r.composer}`);
    expect(!r.send.startsWith('rgb(198, 97, 63)'), `light theme colors the send button: ${r.send}`);
  }
  return problems;
}

/** The files of each CSS chunk in Codex's assets folder; throws when a chunk is gone. */
function chunkFiles(assets) {
  const names = fs.readdirSync(assets);
  return CHUNKS.flatMap((chunk) => {
    const files = names.filter((name) => new RegExp(`^${chunk}-[0-9a-f]{12}\\.css$`).test(name)).sort();
    if (files.length === 0) {
      throw new Error(`no ${chunk}-<hash>.css in ${assets}: Codex renamed its CSS chunks, update CHUNKS`);
    }
    return files;
  });
}

async function main() {
  const [codexArg, outArg] = process.argv.slice(2);
  if (!codexArg) {
    console.error(USAGE);
    process.exit(2);
  }
  const codexDir = path.resolve(codexArg);
  const outDir = path.resolve(outArg || path.join(ROOT, 'fixture-out'));
  const work = fs.mkdtempSync(path.join(os.tmpdir(), 'bidi-codex-fixture-'));
  let server;
  let failed = false;
  try {
    const cssPath = await findCodexCss(codexDir);
    if (!cssPath) {
      throw new Error(`${codexDir}: webview/index.html links no stylesheet this extension can find`);
    }
    const health = await checkCodexInstallHealth(cssPath);
    if (!isCodexHealthy(health)) {
      throw new Error(`Codex is not healthy:\n${formatCodexHealthWarning(path.basename(codexDir), health)}`);
    }
    console.log('health check: ok');
    const bodies = await loadBlockBodies(ROOT, 'codex');
    // Without any block this extension may have added to the installed copy.
    const pristine = computeSyncedCss(fs.readFileSync(cssPath, 'utf8'), new Set(), bodies, 'codex');
    const assets = path.dirname(cssPath);
    const chunks = chunkFiles(assets);
    const page = fs.readFileSync(path.join(__dirname, 'fixture', 'codex.html'), 'utf8');
    const css = [pristine, ...chunks.map((name) => fs.readFileSync(path.join(assets, name), 'utf8'))].join('\n');
    const missing = missingClasses(page, css);
    if (missing.length > 0) {
      throw new Error(`codex.html uses classes this Codex does not define: ${missing.join(', ')}`);
    }
    fs.mkdirSync(outDir, { recursive: true });
    fs.writeFileSync(path.join(work, 'app-initial.css'), computeSyncedCss(pristine, new Set(['theme', 'rtl']), bodies, 'codex'));
    for (const name of chunks) {
      fs.copyFileSync(path.join(assets, name), path.join(work, name));
    }
    for (const asset of THEME.blocks.codex.assets) {
      fs.copyFileSync(path.join(ROOT, asset.source), path.join(work, asset.target));
    }
    fs.copyFileSync(path.join(ROOT, 'diagnostics', 'codex.js'), path.join(work, 'codex-diagnostics.js'));
    // Codex links its main stylesheet, then adds each chunk's stylesheet as the conversation loads.
    const links = chunks.map((name) => `<link rel="stylesheet" href="${name}">`).join('\n');
    const modes = { dark: 'vscode-dark', light: 'vscode-light' };
    for (const [mode, kind] of Object.entries(modes)) {
      fs.writeFileSync(path.join(work, `${mode}.html`), page.replace('__CHUNKS__', links).replace(/__THEME_KIND__/g, kind));
    }

    server = await serve(work);
    const base = `http://127.0.0.1:${server.address().port}`;
    // A fresh profile for every Chrome run, so no run sees another's cache or state.
    let runs = 0;
    const profile = () => `--user-data-dir=${path.join(work, `chrome-profile-${++runs}`)}`;
    for (const mode of Object.keys(modes)) {
      const shot = path.join(outDir, `codex-fixture-${mode}.png`);
      const report = await renderReport(`${base}/${mode}.html`, shot, SIZE, profile, mode);
      const problems = check(mode, report);
      console.log(`${mode}: ${problems.length ? 'FAIL' : 'ok'}`);
      for (const problem of problems) {
        console.log(`  - ${problem}`);
      }
      failed = failed || problems.length > 0;
    }
  } finally {
    if (server) {
      server.close();
    }
    // Chrome was killed moments ago and may still be releasing its profile files.
    fs.rmSync(work, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
  }
  console.log(`screenshots: ${outDir}`);
  process.exit(failed ? 1 : 0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
```

In `package.json`, after the `"fixture:chat"` line, add:

```json
    "fixture:codex": "npm run compile && node scripts/render-codex-fixture.js",
```

- [ ] **Step 9: Run the fixture**

Run: `npm run fixture:codex -- "$CODEX"`
Expected:

```
health check: ok
dark: ok
light: ok
screenshots: …/fixture-out
```

Then look at `fixture-out/codex-fixture-dark.png` and `fixture-out/codex-fixture-light.png`:
- Dark: a warm brown panel in Rubik. Four wrapped paragraphs at the top: the Hebrew ones on the right, the English ones on the left. Your message is a full-width block with an orange bar on the right; its Hebrew line is on the right and its English line on the left. The Hebrew heading and paragraph are on the right and the English paragraph on the left. The bullets of both lists are orange, each beside its item's text on that item's side, one line per item (the loose list's second Hebrew paragraph sits under its first). The code line is on the left. The composer is rounded, with an orange ring (the page focuses it), its Hebrew line on the right and its English line on the left, and an orange send button.
- Light: Codex's own look, with the same direction per line.

A failing check names the value it got. The prototype measured every expected value against this Codex (26.51021), so a failure most likely means a step here was copied differently. Compare the two files before changing a value.

- [ ] **Step 10: Run the tests**

Run: `npm test`
Expected: PASS.

- [ ] **Step 11: Commit**

```bash
git add scripts/fixture-lib.js src/test/fixture-lib.test.ts diagnostics/codex.js scripts/fixture/codex.html scripts/render-codex-fixture.js package.json
git commit -m "test: Codex fixture against Codex's real CSS, and the diagnostics script it runs

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

### Task 5: Codex in every sync, the Codex switch and the diagnostics command

**Files:**
- Modify: `src/test/fake-vscode.ts` (Codex as an installed extension; the clipboard)
- Modify: `src/extension.ts` (imports, constants, `warnMissing`, activation)
- Modify: `src/status.ts`, `src/test/status.test.ts` (tooltips)
- Modify: `package.json` (`contributes.commands`)
- Test: `src/test/extension.test.ts`

**Interfaces:**
- Consumes:
  - `CODEX_EXTENSION_ID`, `CodexSyncResult` and `syncCodex` (Task 1);
  - `checkCodexInstallHealth`, `isCodexHealthy`, `formatCodexHealthWarning` and `REQUIRED_CODEX_HOOKS` (Task 3);
  - `diagnostics/codex.js` (Task 4).
- Produces:
  - the commands `bidi-codex.toggle` and `bidi-codex.copyDiagnostics`;
  - the `globalState` keys `bidiCodex.enabled`, `bidiTheme.lastWarnedCodexVersion` and `bidiCodex.lastLayoutWarnedVersion`;
  - `fake.setCodex(extension)` and `fake.clipboard` for tests.

How activation treats Codex:
- **Sync:** every sync (activation, `extensions.onDidChange`, each toggle) syncs Codex after Claude Code and the chat, through the same queue.
- **The Codex switch:** while it is off, Codex is synced with no module enabled, so its blocks and fonts come out and the Theme and RTL flags stay as they are.
- **Outcomes:** a Codex that links no stylesheet counts as `'error'` (it cannot be updated) and is said once per Codex version. With the switch off, it counts as `'unchanged'`, silently: nothing of ours can be in it.
- **Restart prompt:** a Codex change never asks to quit VS Code, since `chatChanged` stays about the workbench CSS only.

- [ ] **Step 1: Teach the fake `vscode` about Codex and the clipboard**

In `src/test/fake-vscode.ts`:
- In `freshState()`, after `claudeCode: undefined as FakeExtension | undefined,`, add:

```ts
    codex: undefined as FakeExtension | undefined,
    clipboard: '',
```

- Replace `export const extensions = { … };` with:

```ts
export const extensions = {
  getExtension: (id: string): FakeExtension | undefined =>
    id === 'anthropic.claude-code' ? current.claudeCode : id === 'openai.chatgpt' ? current.codex : undefined,
  onDidChange: (listener: Listener<void>) => current.extensionsChanged.event(listener),
};
```

- Replace the `env` export and its comment with:

```ts
/** vscode.env: appRoot is '' (no workbench CSS) until a test calls fake.setAppRoot; the clipboard is fake.clipboard. */
export const env = {
  appRoot: '',
  clipboard: {
    async writeText(text: string): Promise<void> {
      current.clipboard = text;
    },
  },
};
```

- In `fake`, after `setClaudeCode`, add:

```ts
  /** The Codex extension VS Code reports, or undefined when it is not installed. */
  setCodex(extension: FakeExtension | undefined): void {
    current.codex = extension;
  },
  /** What the extension last wrote to the clipboard. */
  get clipboard(): string {
    return current.clipboard;
  },
```

- Change the `reset()` doc comment to `/** Forgets everything: items, messages, commands, listeners, answers, Claude Code, Codex, the clipboard and the app root. */`.

- [ ] **Step 2: Write the failing activation tests**

In `src/test/extension.test.ts`:
- Change the health import to:

```ts
import { REQUIRED_CHAT_CLASSES, REQUIRED_CLASS_PREFIXES, REQUIRED_CODEX_HOOKS, REQUIRED_JS_HOOKS } from '../health';
```

- Replace the `MISSING` constant with:

```ts
const MISSING = "BiDi RTL & Theme: found none of Claude Code, VS Code's chat stylesheet or Codex, so there is nothing to change.";
```

- After the `productJson` constant, add:

```ts
/** Codex's main stylesheet, as its webview/index.html links it. */
const CODEX_CSS = 'app-initial-0123456789ab.css';
const CODEX_INDEX_HTML = `<!doctype html><html><head><link rel="stylesheet" crossorigin href="./assets/${CODEX_CSS}"></head><body></body></html>`;
/** A Codex stylesheet that holds every hook the Codex blocks rely on, the way Codex's files spell them. */
const HEALTHY_CODEX_CSS = REQUIRED_CODEX_HOOKS.map((hook) =>
  hook.endsWith('_')
    ? `${hook}abc12_1{color:red}`
    : hook.startsWith('[')
      ? `${hook}=x]{color:red}`
      : hook.startsWith('--')
        ? `:root{${hook}:0}`
        : `${hook}{color:red}`
).join('\n');
```

- In `suite('extension — activate()', …)`, after `let copilotRtlBody: string;`, add:

```ts
  let codexThemeBody: string;
  let codexRtlBody: string;
```

- After the `syncedChat` function, add:

```ts
  /** A Codex install whose webview/index.html links its stylesheet; VS Code reports it as openai.chatgpt. */
  async function installCodex(version: string, css = HEALTHY_CODEX_CSS, html = CODEX_INDEX_HTML): Promise<string> {
    const dir = path.join(tmp, `openai.chatgpt-${version}-darwin-arm64`);
    await fs.promises.mkdir(path.join(dir, 'webview', 'assets'), { recursive: true });
    await fs.promises.writeFile(path.join(dir, 'webview', 'index.html'), html);
    await fs.promises.writeFile(path.join(dir, 'webview', 'assets', CODEX_CSS), css);
    fake.setCodex({ extensionPath: dir, packageJSON: { version } });
    return dir;
  }

  const codexCssOf = (dir: string): string => fs.readFileSync(path.join(dir, 'webview', 'assets', CODEX_CSS), 'utf8');
  const codexFontsIn = (dir: string): string[] =>
    THEME.blocks.codex.assets
      .map((a) => a.target)
      .filter((target) => fs.existsSync(path.join(dir, 'webview', 'assets', target)));

  /** The Codex CSS a sync of HEALTHY_CODEX_CSS writes with these modules on. */
  function syncedCodex(ids: FeatureId[]): string {
    let css = HEALTHY_CODEX_CSS;
    if (ids.includes('theme')) {
      css = appendBlock(css, THEME.blocks.codex.markers, codexThemeBody);
    }
    if (ids.includes('rtl')) {
      css = appendBlock(css, RTL.blocks.codex.markers, codexRtlBody);
    }
    return css;
  }
```

- In `suiteSetup`, add:

```ts
    codexThemeBody = fs.readFileSync(path.join(ROOT, THEME.blocks.codex.cssFile), 'utf8');
    codexRtlBody = fs.readFileSync(path.join(ROOT, RTL.blocks.codex.cssFile), 'utf8');
```

- After `suite('Copilot chat', …)`, add:

```ts
  suite('Codex', () => {
    const VERSION = '26.51021.22027';

    test('without Claude Code or the chat, activation styles Codex and offers a window reload', async () => {
      const dir = await installCodex(VERSION);
      await start();
      assert.strictEqual(codexCssOf(dir), syncedCodex(['theme', 'rtl']));
      assert.strictEqual(codexFontsIn(dir).length, THEME.blocks.codex.assets.length);
      assert.deepStrictEqual(texts('warning'), []);
      const prompt = fake.messages.find((m) => m.text === RELOAD);
      assert.ok(prompt, texts('info').join('\n'));
      assert.deepStrictEqual(prompt.items, ['Reload Window']);
    });

    test('one toggle updates Claude Code, the chat and Codex together', async () => {
      const claude = await installClaudeCode('2.1.287');
      const appRoot = await installWorkbench();
      const codex = await installCodex(VERSION);
      await start();

      await commands.executeCommand('bidi-rtl.toggle');
      assert.strictEqual(cssOf(claude), synced(['theme']));
      assert.strictEqual(chatCssOf(appRoot), syncedChat(['theme']));
      assert.strictEqual(codexCssOf(codex), syncedCodex(['theme']));

      await commands.executeCommand('bidi-theme.toggle');
      assert.strictEqual(codexCssOf(codex), HEALTHY_CODEX_CSS);
      assert.deepStrictEqual(codexFontsIn(codex), []);
    });

    test('the Codex switch turns Codex off and on, and leaves the modules and the other targets alone', async () => {
      const claude = await installClaudeCode('2.1.287');
      const codex = await installCodex(VERSION);
      const context = await start();

      await commands.executeCommand('bidi-codex.toggle');
      assert.strictEqual(context.globalState.get('bidiCodex.enabled'), false);
      assert.strictEqual(codexCssOf(codex), HEALTHY_CODEX_CSS);
      assert.deepStrictEqual(codexFontsIn(codex), []);
      assert.strictEqual(cssOf(claude), synced(['theme', 'rtl']));
      assert.strictEqual(item('bidi-theme.toggle').text, '$(check) Theme');
      assert.strictEqual(item('bidi-rtl.toggle').text, '$(check) RTL');
      const prompt = fake.messages.find((m) => m.text === 'BiDi Codex: turned off. Reload window to apply.');
      assert.ok(prompt, texts('info').join('\n'));
      assert.deepStrictEqual(prompt.items, ['Reload Window']);

      await commands.executeCommand('bidi-rtl.toggle'); // a module toggle while Codex is off leaves Codex as it is
      assert.strictEqual(cssOf(claude), synced(['theme']));
      assert.strictEqual(codexCssOf(codex), HEALTHY_CODEX_CSS);

      await commands.executeCommand('bidi-codex.toggle');
      assert.strictEqual(context.globalState.get('bidiCodex.enabled'), true);
      assert.strictEqual(codexCssOf(codex), syncedCodex(['theme']));
      assert.ok(texts('info').includes('BiDi Codex: turned on. Reload window to apply.'), texts('info').join('\n'));
    });

    test('the Codex switch without Codex says so and keeps the setting for later', async () => {
      const context = await start();
      await commands.executeCommand('bidi-codex.toggle');
      assert.strictEqual(context.globalState.get('bidiCodex.enabled'), false);
      assert.ok(
        texts('info').includes('BiDi Codex: turned off. Codex is not installed in this VS Code.'),
        texts('info').join('\n')
      );
      assert.deepStrictEqual(texts('warning'), []);
    });

    test('a Codex update is styled when VS Code reports the change', async () => {
      await installCodex('26.51007.21434');
      await start();
      const next = await installCodex(VERSION);
      await fake.extensionsChanged();
      assert.strictEqual(codexCssOf(next), syncedCodex(['theme', 'rtl']));
    });

    test('a Codex that links no stylesheet is said once per Codex version, and the other targets still sync', async () => {
      const claude = await installClaudeCode('2.1.287');
      await installCodex(VERSION, HEALTHY_CODEX_CSS, '<html><head></head><body></body></html>');
      const context = await start();
      assert.strictEqual(cssOf(claude), synced(['theme', 'rtl']));
      assert.strictEqual(texts('warning').length, 1);
      assert.ok(texts('warning')[0].includes(`Codex ${VERSION}`), texts('warning')[0]);

      await fake.extensionsChanged(); // the same version again
      stop(context);
      const second = await start(context.globalState); // remembers the warned version
      assert.strictEqual(texts('warning').length, 1);

      stop(second);
      await installCodex('26.51022.10000', HEALTHY_CODEX_CSS, '<html></html>');
      await start(context.globalState);
      assert.strictEqual(texts('warning').length, 2);
      assert.ok(texts('warning')[1].includes('Codex 26.51022.10000'), texts('warning')[1]);
    });

    test('the Codex health warning shows once per Codex version, and only while the theme is on', async () => {
      const [first] = REQUIRED_CODEX_HOOKS;
      const broken = HEALTHY_CODEX_CSS.replace(`${first}abc12_1{color:red}`, '');
      await installCodex(VERSION, broken);
      const context = await start();
      assert.strictEqual(texts('warning').length, 1);
      assert.ok(texts('warning')[0].includes(`Codex ${VERSION}`), texts('warning')[0]);
      assert.ok(texts('warning')[0].includes(first), texts('warning')[0]);

      await fake.extensionsChanged(); // another sync of the same version
      stop(context);
      await start(context.globalState); // remembers the warned version
      assert.strictEqual(texts('warning').length, 1);

      await commands.executeCommand('bidi-theme.toggle'); // theme off
      await installCodex('26.51022.10000', broken);
      await fake.extensionsChanged();
      assert.strictEqual(texts('warning').length, 1);

      await commands.executeCommand('bidi-theme.toggle'); // theme on
      assert.strictEqual(texts('warning').length, 2);
      assert.ok(texts('warning')[1].includes('Codex 26.51022.10000'), texts('warning')[1]);
    });

    test('the diagnostics command copies the shipped script and says how to run it', async () => {
      await start();
      await commands.executeCommand('bidi-codex.copyDiagnostics');
      assert.strictEqual(fake.clipboard, fs.readFileSync(path.join(ROOT, 'diagnostics', 'codex.js'), 'utf8'));
      const steps = texts('info').find((t) => t.startsWith('BiDi Codex: the diagnostics script is on the clipboard.'));
      assert.ok(steps, texts('info').join('\n'));
      assert.ok(steps.includes('Developer: Open Webview Developer Tools'), steps);
      assert.ok(steps.includes('allow pasting'), steps);
    });

    test('a Codex CSS that cannot be written is shown, and does not hold back Claude Code', async () => {
      const claude = await installClaudeCode('2.1.287');
      const codex = await installCodex(VERSION);
      await start();
      // A folder where writeFileAtomic puts its temp file makes the Codex CSS write fail.
      await fs.promises.mkdir(`${path.join(codex, 'webview', 'assets', CODEX_CSS)}.bidi-rtl-tmp-${process.pid}`);
      await commands.executeCommand('bidi-theme.toggle');
      assert.strictEqual(cssOf(claude), synced(['rtl']));
      assert.strictEqual(texts('error').length, 1);
      assert.ok(texts('error')[0].includes('Could not update the Codex CSS'), texts('error')[0]);
    });
  });
```

In `src/test/status.test.ts`, change the two tooltip assertions to:

```ts
    assert.strictEqual(s.tooltip, 'BiDi RTL for Claude Code, Copilot and Codex is on — click to turn off');
```

and

```ts
    assert.strictEqual(s.tooltip, 'BiDi Theme for Claude Code, Copilot and Codex is off — click to turn on');
```

- [ ] **Step 3: Run the tests to see them fail**

Run: `npm test`
Expected: compiles. The new `Codex` tests and the two status tests FAIL: Codex's CSS is never written, the `bidi-codex.*` commands do not exist, and the tooltips still say "for Claude Code". The test `'with neither target, activation says nothing, and a toggle warns and keeps the flag'` FAILS on the new `MISSING` text.

- [ ] **Step 4: Update the tooltips in `src/status.ts`**

```ts
export interface StatusBarState {
  text: string;
  tooltip: string;
}

export function getStatusBarState(label: string, enabled: boolean): StatusBarState {
  return enabled
    ? {
        text: `$(check) ${label}`,
        tooltip: `BiDi ${label} for Claude Code, Copilot and Codex is on — click to turn off`,
      }
    : {
        text: `$(circle-slash) ${label}`,
        tooltip: `BiDi ${label} for Claude Code, Copilot and Codex is off — click to turn on`,
      };
}
```

- [ ] **Step 5: Wire Codex into `src/extension.ts`**

Replace the imports (the first 13 lines) with:

```ts
import * as fs from 'fs';
import * as path from 'path';
import * as vscode from 'vscode';
import { CODEX_EXTENSION_ID, CodexSyncResult, syncCodex } from './codex';
import { FEATURES, Feature, FeatureId, RTL } from './features';
import {
  checkCodexInstallHealth,
  checkInstallHealth,
  checkWorkbenchInstallHealth,
  formatCodexHealthWarning,
  formatHealthWarning,
  formatWorkbenchHealthWarning,
  isCodexHealthy,
  isHealthy,
  isWorkbenchHealthy,
} from './health';
import { getStatusBarState } from './status';
import { syncInstall } from './sync';
import { WorkbenchSyncResult, syncWorkbench } from './workbench';
```

After `const LAST_CHAT_ERROR_KEY = 'bidiTheme.lastChatErrorVersion';`, add:

```ts
const LAST_WARNED_CODEX_KEY = 'bidiTheme.lastWarnedCodexVersion';
/** The Codex switch: Codex gets the enabled modules only while it is on (the default). */
const CODEX_FLAG = 'bidiCodex.enabled';
/** The Codex version whose missing stylesheet the warning last named. */
const LAST_CODEX_LAYOUT_KEY = 'bidiCodex.lastLayoutWarnedVersion';
/** The script for the Codex panel's DevTools, shipped with this extension. */
const CODEX_DIAGNOSTICS = path.join('diagnostics', 'codex.js');
const CODEX_DIAGNOSTICS_STEPS =
  'BiDi Codex: the diagnostics script is on the clipboard. Click in the Codex panel, run ' +
  '"Developer: Open Webview Developer Tools" and open its Console. Type "allow pasting" the first time, ' +
  'then paste and press Enter. The report it copies holds no message text.';
```

Replace `warnMissing` with:

```ts
function warnMissing(): void {
  void vscode.window.showWarningMessage(
    "BiDi RTL & Theme: found none of Claude Code, VS Code's chat stylesheet or Codex, so there is nothing to change."
  );
}

function codexLayoutWarning(version: string): string {
  return `BiDi RTL & Theme: Codex ${version} links no stylesheet this extension can style (Codex changed its layout), ` +
    'so Codex keeps its own look.';
}
```

In `activate`, after the `enabledIds` arrow function, add:

```ts
  const isCodexOn = (): boolean => context.globalState.get<boolean>(CODEX_FLAG, true);
```

After `warnIfChatUnhealthy`, add:

```ts
  // Codex versions found healthy in this activation: each check reads Codex's stylesheets (3 MB).
  const healthyCodexVersions = new Set<string>();

  // At most one warning per Codex version, kept apart from the other targets'.
  const warnIfCodexUnhealthy = async (version: string, cssPath: string): Promise<void> => {
    if (healthyCodexVersions.has(version) || context.globalState.get<string>(LAST_WARNED_CODEX_KEY) === version) {
      return;
    }
    const report = await checkCodexInstallHealth(cssPath);
    if (isCodexHealthy(report)) {
      healthyCodexVersions.add(version);
      return;
    }
    await context.globalState.update(LAST_WARNED_CODEX_KEY, version);
    void vscode.window.showWarningMessage(formatCodexHealthWarning(version, report));
  };

  // A Codex that links no stylesheet is said once per Codex version, then only logged.
  const warnCodexLayout = async (version: string): Promise<void> => {
    if (context.globalState.get<string>(LAST_CODEX_LAYOUT_KEY) === version) {
      console.error(codexLayoutWarning(version));
      return;
    }
    await context.globalState.update(LAST_CODEX_LAYOUT_KEY, version);
    void vscode.window.showWarningMessage(codexLayoutWarning(version));
  };
```

After `syncChat`, add:

```ts
  // OpenAI's Codex panel: a webview whose stylesheet sits in Codex's install.
  // While the Codex switch is off, Codex is synced with nothing enabled.
  const syncCodexPanel = async (enabled: ReadonlySet<FeatureId>, silent: boolean): Promise<SyncOutcome> => {
    const ext = vscode.extensions.getExtension(CODEX_EXTENSION_ID);
    if (!ext) {
      return 'missing';
    }
    const version = String(ext.packageJSON?.version ?? 'unknown');
    const codexEnabled: ReadonlySet<FeatureId> = isCodexOn() ? enabled : new Set();
    let result: CodexSyncResult | null;
    try {
      result = await syncCodex(ext.extensionPath, context.extensionPath, codexEnabled);
    } catch (err: unknown) {
      reportError('update the Codex CSS', err, silent);
      return 'error';
    }
    if (!result) {
      if (!isCodexOn()) {
        return 'unchanged'; // nothing of ours can be there, and Codex is not to be styled
      }
      await warnCodexLayout(version).catch((err: unknown) => {
        console.error(formatError('remember the Codex layout warning', err));
      });
      return 'error';
    }
    for (const assetError of result.assetErrors) {
      console.error(`BiDi Theme: Codex font sync failed — ${assetError}`);
    }
    if (codexEnabled.has('theme')) {
      await warnIfCodexUnhealthy(version, result.cssPath).catch((err: unknown) => {
        console.error(formatError('check Codex', err));
      });
    }
    return result.cssChanged ? 'changed' : 'unchanged';
  };
```

Replace `syncNow` with:

```ts
  // One sync of every target; callers run it through the queue. `activation`
  // marks the sync each window runs when it starts.
  const syncNow = async (silent: boolean, activation = false): Promise<SyncReport> => {
    const enabled = enabledIds();
    const claude = await syncClaudeCode(enabled, silent);
    const chat = await syncChat(enabled, silent, activation);
    const codex = await syncCodexPanel(enabled, silent);
    return { outcome: combineOutcomes([claude, chat, codex]), chatChanged: chat === 'changed' };
  };
```

After the `bidi-rtl.removePatch` command registration, add:

```ts
  // Codex on its own: the modules stay as they are for Claude Code and the chat.
  own(vscode.commands.registerCommand('bidi-codex.toggle', async () => {
    const { outcome, on } = await enqueue(async () => {
      const previous = isCodexOn();
      await context.globalState.update(CODEX_FLAG, !previous);
      const result = await syncCodexPanel(enabledIds(), false);
      if (result === 'error') {
        await context.globalState.update(CODEX_FLAG, previous);
      }
      return { outcome: result, on: result === 'error' ? previous : !previous };
    });
    const state = on ? 'on' : 'off';
    if (outcome === 'missing') {
      void vscode.window.showInformationMessage(`BiDi Codex: turned ${state}. Codex is not installed in this VS Code.`);
    } else if (outcome === 'changed' || outcome === 'unchanged') {
      void offerReload(`BiDi Codex: turned ${state}. ${applyHint(false)}`, false);
    }
  }));

  own(vscode.commands.registerCommand('bidi-codex.copyDiagnostics', async () => {
    try {
      const script = await fs.promises.readFile(path.join(context.extensionPath, CODEX_DIAGNOSTICS), 'utf8');
      await vscode.env.clipboard.writeText(script);
    } catch (err: unknown) {
      reportError('copy the Codex diagnostics script', err, false);
      return;
    }
    void vscode.window.showInformationMessage(CODEX_DIAGNOSTICS_STEPS);
  }));
```

In the comment above the initial sync at the end of `activate`, change `some people use only Claude Code, others only Copilot.` to `some people use only Claude Code, others only Copilot or Codex.`

- [ ] **Step 6: Declare the two commands in `package.json`**

In `contributes.commands`, after the `bidi-theme.toggle` entry, add:

```json
      {
        "command": "bidi-codex.toggle",
        "title": "BiDi Codex: Toggle Codex Styling On/Off"
      },
      {
        "command": "bidi-codex.copyDiagnostics",
        "title": "BiDi Codex: Copy Diagnostics Script"
      },
```

- [ ] **Step 7: Run the tests to see them pass**

Run: `npm test`
Expected: PASS, every suite.

- [ ] **Step 8: Commit**

```bash
git add src/test/fake-vscode.ts src/extension.ts src/status.ts src/test/status.test.ts src/test/extension.test.ts package.json
git commit -m "feat: style Codex with every sync; a Codex-only switch and a diagnostics command

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

### Task 6: Uninstall also cleans Codex

**Files:**
- Modify: `src/uninstall.ts`
- Test: `src/test/cleanup.test.ts` (`suite('uninstall main()', …)`)

**Interfaces:**
- Consumes: `cleanupCodex(extensionsRoot): Promise<CleanupResult>` (Task 1), `errorMessage` from `src/cleanup.ts` (Task 1).
- Produces: `main(extensionsRoot, execPath)` cleans Claude Code, then Codex, then the chat. It still returns the number of Claude Code installs cleaned. The Codex line is logged only when there was something to clean, so a machine without Codex logs exactly what it did before.

- [ ] **Step 1: Write the failing tests**

In `src/test/cleanup.test.ts`, inside `suite('uninstall main()', …)`, after the test `'logs each install it could not clean'`, add:

```ts
    const CODEX_DIR = 'openai.chatgpt-26.51021.22027-darwin-arm64';
    const CODEX_INDEX = '<link rel="stylesheet" href="./assets/app-initial-0123456789ab.css">';

    test('also cleans every Codex install in the extensions folder', async () => {
      const css = path.join(root, CODEX_DIR, 'webview', 'assets', 'app-initial-0123456789ab.css');
      const font = path.join(path.dirname(css), THEME.blocks.codex.assets[0].target);
      await write(path.join(root, CODEX_DIR, 'webview', 'index.html'), CODEX_INDEX);
      await write(css, appendBlock(appendBlock(ORIGINAL_A, THEME.blocks.codex.markers, '.t{}'), RTL.blocks.codex.markers, '.r{}'));
      await write(font, 'font');

      assert.strictEqual(await main(root, NO_VSCODE()), 2);
      assert.strictEqual(await fs.promises.readFile(css, 'utf8'), ORIGINAL_A);
      assert.ok(!fs.existsSync(font), font);
      assert.deepStrictEqual(logged, [
        'BiDi RTL & Theme: cleaned 2 Claude Code install(s).',
        'BiDi RTL & Theme: cleaned 1 Codex install(s).',
      ]);
    });

    test('logs a Codex install it could not clean', async () => {
      const dir = path.join(root, CODEX_DIR);
      await write(path.join(dir, 'webview', 'index.html'), CODEX_INDEX);
      // A folder where the stylesheet goes: reading it fails.
      await fs.promises.mkdir(path.join(dir, 'webview', 'assets', 'app-initial-0123456789ab.css'), { recursive: true });

      assert.strictEqual(await main(root, NO_VSCODE()), 2);
      assert.strictEqual(logged.length, 3, logged.join('\n'));
      assert.strictEqual(logged[1], 'BiDi RTL & Theme: cleaned 0 Codex install(s); 1 could not be cleaned.');
      assert.ok(logged[2].startsWith(`BiDi RTL & Theme: could not clean ${dir}: `), logged[2]);
    });
```

- [ ] **Step 2: Run the tests to see them fail**

Run: `npm test`
Expected: the two new tests FAIL: the Codex stylesheet keeps its blocks, and only the Claude Code line is logged.

- [ ] **Step 3: Clean Codex in `src/uninstall.ts`**

Replace the whole file with:

```ts
import * as path from 'path';
import { cleanupAll, errorMessage } from './cleanup';
import { cleanupCodex } from './codex';
import { cleanWorkbench, findAppRoot } from './workbench';

async function cleanClaudeCode(extensionsRoot: string): Promise<number> {
  try {
    const { cleaned, failures } = await cleanupAll(extensionsRoot);
    const notCleaned = failures.length > 0 ? `; ${failures.length} could not be cleaned` : '';
    console.log(`BiDi RTL & Theme: cleaned ${cleaned} Claude Code install(s)${notCleaned}.`);
    for (const failure of failures) {
      console.log(`BiDi RTL & Theme: could not clean ${failure}`);
    }
    return cleaned;
  } catch (err: unknown) {
    console.log(`BiDi RTL & Theme: cleanup failed — ${errorMessage(err)}`);
    return 0;
  }
}

// Every Codex install in the extensions folder. Logged only when there was
// something to clean, so a machine without Codex logs what it always did.
async function cleanCodex(extensionsRoot: string): Promise<void> {
  try {
    const { cleaned, failures } = await cleanupCodex(extensionsRoot);
    if (cleaned > 0 || failures.length > 0) {
      const notCleaned = failures.length > 0 ? `; ${failures.length} could not be cleaned` : '';
      console.log(`BiDi RTL & Theme: cleaned ${cleaned} Codex install(s)${notCleaned}.`);
    }
    for (const failure of failures) {
      console.log(`BiDi RTL & Theme: could not clean ${failure}`);
    }
  } catch (err: unknown) {
    console.log(`BiDi RTL & Theme: Codex cleanup failed — ${errorMessage(err)}`);
  }
}

// Only the VS Code this hook runs under: another copy of VS Code that shares
// the extensions folder keeps its patch until its next update or a toggle.
async function cleanChat(execPath: string): Promise<void> {
  try {
    const appRoot = await findAppRoot(execPath);
    if (appRoot && (await cleanWorkbench(appRoot))) {
      console.log(`BiDi RTL & Theme: cleaned VS Code's chat CSS in ${appRoot}.`);
    }
  } catch (err: unknown) {
    console.log(`BiDi RTL & Theme: could not clean VS Code's chat CSS — ${errorMessage(err)}`);
  }
}

/** Returns how many Claude Code installs were cleaned. */
export async function main(extensionsRoot: string, execPath: string): Promise<number> {
  const cleaned = await cleanClaudeCode(extensionsRoot);
  await cleanCodex(extensionsRoot);
  await cleanChat(execPath);
  return cleaned;
}

// Run by `vscode:uninstall` under VS Code's own executable (or a helper inside
// it); this file lives at <extensionsRoot>/<ext-dir>/out/uninstall.js.
if (require.main === module) {
  void main(path.resolve(__dirname, '..', '..'), process.execPath);
}
```

- [ ] **Step 4: Run the tests to see them pass**

Run: `npm test`
Expected: PASS, the existing `uninstall main()` tests included: their logs are unchanged.

- [ ] **Step 5: Commit**

```bash
git add src/uninstall.ts src/test/cleanup.test.ts
git commit -m "feat: uninstall also cleans every Codex install

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

### Task 7: Version 0.3.0 and the README

**Files:**
- Modify: `package.json` (`version`, `displayName`, `description`)
- Modify: `README.md`

**Interfaces:**
- Consumes: the commands of Task 5, the fixture of Task 4 and the behavior of Tasks 1–6, as the README describes them.
- Produces: the docs and the version that the VSIX is built from.

- [ ] **Step 1: Bump the version and the names**

In `package.json`, set:

```json
  "displayName": "BiDi RTL & Theme for Claude Code, Copilot and Codex",
  "description": "RTL direction and a warm reading theme for the Claude Code panel, VS Code's Copilot chat and OpenAI's Codex panel",
  "version": "0.3.0",
```

- [ ] **Step 2: Update the README's opening**

- Change the title to `# BiDi RTL & Theme for Claude Code, Copilot and Codex`.
- Change the first sentence to `A small VS Code extension for the Claude Code conversation panel, VS Code's Copilot chat and OpenAI's Codex panel:`.
- After the `**Copilot chat**` bullet, add:

```markdown
- **Codex** gets the same RTL and theme: OpenAI's Codex panel looks and reads like the Claude Code panel.
```

- [ ] **Step 3: Add the Codex sections**

Insert before `### Session clock`:

```markdown
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

The **Theme** and **RTL** buttons control Codex too, while its own switch is on. To leave Codex as
it is while Claude Code and the Copilot chat stay styled, turn that switch off with
`BiDi Codex: Toggle Codex Styling On/Off`.

Codex reads its stylesheet each time it opens its panel, so a change to Codex applies after
**Reload Window**: no restart, no checksum.

### Checking the Codex panel

After installing or updating, a quick check, in a dark theme with RTL on:

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
      without the extension, and the Copilot chat keeps its theme. Run the command again, and
      reload, to bring the style back.
3. Run `BiDi Codex: Copy Diagnostics Script` and follow the steps it shows. The script copies a
   report on how the styles apply, without any message text. Paste the report into an issue,
   with a screenshot of anything that looks wrong.
```

- [ ] **Step 4: Update Install and Commands**

- In `## Install`, change both `vscode-bidi-rtl-0.2.0.vsix` to `vscode-bidi-rtl-0.3.0.vsix`. In step 3, change `to Claude Code and to the Copilot chat` to `to Claude Code, the Copilot chat and Codex`, and `(for the chat,` to `(for the Copilot chat,` *(the second change was added by the Task 7 review)*.
- In the `## Commands` table, after the `BiDi Theme: Toggle Warm Theme On/Off` row, add:

```markdown
| `BiDi Codex: Toggle Codex Styling On/Off` | Turns the styling of the Codex panel off, or back on, on its own (remembered across restarts). The Theme and RTL buttons keep controlling Claude Code and the Copilot chat. |
| `BiDi Codex: Copy Diagnostics Script` | Copies a script for the Codex panel's DevTools that reports how the styles apply, without any message text. |
```

- [ ] **Step 5: Update How it works, Build from source and Notes**

- In `## How it works`, after the paragraph that starts `For the Copilot chat, the blocks go into VS Code's own`, add:

```markdown
For Codex, the blocks go into the stylesheet that Codex's `webview/index.html` links, inside
Codex's extension folder, with the fonts next to it. Codex reads that page and its stylesheet
each time it opens its panel, so a change applies with a window reload, and there is no checksum.
```

- In the list below, after the bullet that starts `While the theme is on, the extension also checks that the chat's class names`, add:

```markdown
- Each Codex update installs a new folder. The extension styles it as soon as VS Code reports the
  update; if Codex's panel opened before that, reload the window to see the styles. While the
  theme is on, it checks that the parts of Codex it styles are still in Codex's stylesheets, and
  warns once per Codex version if some are gone. If Codex stops linking a stylesheet the extension
  can find, the extension says so once per Codex version and leaves Codex as it is.
```

- In the uninstall bullet, change `from every Claude Code install and from the VS Code it was uninstalled in (restoring its checksum)` to `from every Claude Code install, from every Codex install and from the VS Code it was uninstalled in (restoring its checksum)`.
- In the bullet that starts `When VS Code is installed where your user cannot write`, change `and Claude Code is still styled.` to `and Claude Code and Codex are still styled.` *(added by the Task 7 review)*.
- Replace the bullet that starts `Going back to 0.1.0` with *(added by the Task 7 review)*:

```markdown
- Going back to 0.1.0 leaves the Copilot chat styled until the next VS Code update, and Codex
  until its next update, since 0.1.0 knows only Claude Code. Turn both modules off first, then
  install 0.1.0.
```

- After that bullet, add:

```markdown
- Going back to 0.2.0 leaves Codex styled until its next update, since 0.2.0 knows only Claude
  Code and the Copilot chat. Turn Codex off first (`BiDi Codex: Toggle Codex Styling On/Off`),
  then install 0.2.0.
```

- In `## Build from source`, after the `npm run fixture:chat` line, add:

```bash
npm run fixture:codex -- <codex-extension-dir>   # renders the Codex fixture, e.g. ~/.vscode/extensions/openai.chatgpt-26.51021.22027-darwin-arm64
```

- In `## Notes`, change `It edits Claude Code's own CSS and VS Code's workbench CSS,` to `It edits Claude Code's and Codex's own CSS and VS Code's workbench CSS,`, and `if an update to either changes the markup` to `if an update to any of them changes the markup` *(the second change was added during execution)*.

- [ ] **Step 6: Check the result**

Run: `grep -n "0.2.0.vsix\|Claude Code and Copilot$\|BiDi Codex" README.md`
Expected: no `0.2.0.vsix` line, no title ending in `Claude Code and Copilot`; the `BiDi Codex` lines are the Codex section, the check, the two command rows and the going-back bullet.

Run: `npm test`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add package.json README.md
git commit -m "docs: 0.3.0, Codex in the README with a check for the Codex panel

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

## After the tasks (controller)

These steps involve the user, and some of them publish things. Ask before each one marked **ask**.

1. **Final review** of the whole branch (`git diff main...feat/codex-theme`) by an opus reviewer, against the spec. Apply the fixes the user agrees to.
2. **Verification:**
   - `npm test`: everything passes.
   - `npm run fixture:codex -- <unpacked Codex>`: `dark: ok`, `light: ok`.
   - If the installs are at hand, `npm run fixture -- <Claude Code dir>` and `npm run fixture:chat -- <VS Code app root>` still get past their class checks (Task 4 touched `missingClasses`).
   - Show the user `fixture-out/codex-fixture-dark.png` and `-light.png`.
3. **Package:** `npx vsce package` gives `vscode-bidi-rtl-0.3.0.vsix`. Check that `diagnostics/codex.js`, `css/codex-theme.css` and `css/codex-rtl.css` are in it: `unzip -l vscode-bidi-rtl-0.3.0.vsix | grep -E "codex"`.
4. **Ask:** an optional live check here:
   - VS Code Insiders runs with a short temporary `--user-data-dir` and `--extensions-dir` (a short path, such as `/tmp/bc/…`: VS Code's IPC socket path has a length limit) and `--remote-debugging-port`.
   - Codex and this VSIX are installed into that extensions folder only. Codex stays signed out.
   - Over CDP, on the Codex webview's frame, check that the sign-in screen has the warm background, that BiDi Rubik is `loaded` in `document.fonts`, and that the stylesheet holds both Codex blocks.
   - This runs Codex's code, which the user has so far allowed only to be read.
5. **Ask:** merge `feat/codex-theme` into `main`, push, and publish the GitHub **pre-release** `v0.3.0` with the VSIX. Its notes carry the README's "Checking the Codex panel" (prompt and checklist). The latest regular release stays 0.2.0.
6. **The work Mac:**
   - The user installs the pre-release, reloads, runs the check and the diagnostics script, and brings back the report and screenshots.
   - Fixes ship as 0.3.x pre-releases.
   - Once the work Mac confirms, publish a regular release (ask), and update the project memory and the progress ledger.
