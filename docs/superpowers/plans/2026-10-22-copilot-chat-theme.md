# Copilot Chat Warm Theme Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make VS Code's built-in chat, where GitHub Copilot runs, look like the warm Claude Code panel of 0.1.0, Hebrew RTL included. The `Theme` and `RTL` toggles control both.

**Architecture:** Each module (`theme`, `rtl`) gets a block per *target*. Target `claude` is Claude Code's `webview/index.css`, as today. Target `workbench` is VS Code's own `<appRoot>/out/vs/workbench/workbench.desktop.main.css`, which styles the chat.
- The existing pure `computeSyncedCss` and the atomic write run per target.
- After the workbench CSS is written, `product.json`'s checksum for it is set to the new file's, so VS Code does not report a corrupt install.
- Health checks, uninstall cleanup and the activation harness cover the new target.
- A static fixture of the chat DOM is rendered in headless Chrome against the real workbench CSS.

**Tech Stack:** TypeScript 5 (strict, CommonJS), VS Code API ^1.85 (`vscode.env.appRoot`, `vscode.version`), mocha (TDD UI), Node built-ins (`fs`, `crypto`, `http`, `child_process`), headless Google Chrome for the fixture, `@vscode/vsce` for packaging.

## Global Constraints

- Spec: `docs/superpowers/specs/2026-10-22-copilot-chat-theme-design.md`. Visual values come from the Claude Code theme (`css/theme.css`, spec of 2026-10-09).
- Repo `~/vscode-bidi-flipper`, branch `feat/copilot-theme`. Run every command from the repo root.
- No new dependencies, runtime or dev. Scripts use Node built-ins only.
- Targets: `claude` (Claude Code `webview/index.css`, unchanged) and `workbench` (`<appRoot>/out/vs/workbench/workbench.desktop.main.css`).
- Workbench markers: `/* bidi-copilot-theme-start */` … `/* bidi-copilot-theme-end */` and `/* bidi-copilot-rtl-start */` … `/* bidi-copilot-rtl-end */`. Canonical order in every target: theme, then rtl. The Claude Code markers stay `/* bidi-theme-patch-start|end */` and `/* bidi-rtl-patch-start|end */`.
- Fonts in the workbench target: `bidi-theme-rubik-hebrew.woff2` and `bidi-theme-rubik-latin.woff2`, copied to `<appRoot>/out/vs/workbench/`.
- Checksum: `<appRoot>/product.json` → `checksums["vs/workbench/workbench.desktop.main.css"]`. The value is the base64 SHA-256 of the file without `=` padding. Only that one value is replaced, by exact string replacement (no JSON re-serialization), atomically. A checksum that cannot be written is logged, never shown.
- A missing target is skipped silently on activation and on updates. Only a toggle with no target at all shows a warning.
- `globalState` keys: `bidiTheme.enabled`, `bidiRtl.enabled` (default on, one flag for both targets), `bidiTheme.lastWarnedVersion` (Claude Code), `bidiTheme.lastWarnedWorkbenchVersion` (VS Code, new), `bidiTheme.lastChatErrorVersion` (VS Code, new: the chat CSS write error shown at activation once per version; added after the Task 7 review), `bidiUsage.enabled`, `bidiUsage.prompted`.
- `css/copilot-theme.css`:
  - Every style rule's selectors start with `.monaco-workbench.vs-dark :is(.chat-viewpane,.editor-instance) .interactive-session:not(.chat-widget>.interactive-session)`. That is the chat view and the chat editor tab in dark themes; inline chat and quick chat are excluded.
  - The only top-level at-rule is `@font-face`.
  - No `direction`, `text-align` or `unicode-bidi` declarations.
  - No rule on the input editor (`.chat-editor-container`, `.interactive-input-editor`, `.monaco-editor`).
- `css/copilot-rtl.css`:
  - Only `direction`, `text-align`, `unicode-bidi`, `list-style-position` and the bullet's `content` in `::marker` rules.
  - Every selector starts with `.interactive-session` (all themes).
  - Never on the parts VS Code lays out in JS (the input part, its toolbars, Monaco editors, the list).
- No `!important` in either Copilot file.
- Palette:

  | Role | Value |
  |---|---|
  | Chat background | `#1b1a18` |
  | Text | `#ebe5da` |
  | Secondary text | `#a39d92` |
  | Borders | `#3b362f` |
  | User block | `#262320`, hover `#2a2622`, text `#f5f0e8`, `border-inline-start:3px solid #d97757`, radius 14px, padding 12px 16px |
  | Activity box | `#211f1c`, border `#2b2824`, text `#968f83` at 12.5px, tool names `#cfc6b7`, radius 12px |
  | Input box | fill `#242120`, border `#736a5d`, focus `#d97757`, radius 18px; the typed text keeps VS Code's 13px font |
  | Accent | `#d97757`; links `#e8a07f` |
  | Inline code | `#2b2824` / `#f2b896` |
  | Code blocks | `#121110`, radius 12px |
  | Send button | `#c6613f`, ivory icon, 40px round |
  | Ghost pills | transparent, 1px `#453e35`, radius 11px, 34px tall, 15px text |

- Typography:
  - Font: `"BiDi Rubik", -apple-system, BlinkMacSystemFont, system-ui, sans-serif`.
  - Messages: 15px, set on `.interactive-list` because VS Code writes an inline 13px on `.interactive-session`; line height 1.75.
  - Headings 20/18/16px, weight 600, `#f5f0e8`. List markers `#d97757`.
  - Code keeps the editor font. The input editor keeps VS Code's font, size and line height: Monaco sets them in JS.
- Layout:
  - Messages fill the chat view's width (no native `max-width:950px`).
  - The input part keeps VS Code's layout width: at most 950px with its 12px margins (926px), centered. VS Code sizes the input editor for that width.
- The spec's "Found while planning" list explains each of these.
- Tests must never touch a real VS Code install, the Keychain, the network or child processes. `src/test/setup.ts` already blocks processes and `fetch`. The fake `vscode.env.appRoot` defaults to `''`, which means "no workbench".
- Nothing in this plan writes under `/Applications` except the manual install after the tasks, which the controller runs. The fixture copies the real workbench CSS into a temp folder and only reads the original.
- Tests: `npm test` (compiles, then mocha on `out/test/**/*.test.js`), written with `suite`/`test`.
- Version 0.2.0. Extension `name` stays `vscode-bidi-rtl`, id `local.vscode-bidi-rtl`.
- Commits: conventional-commit subject, body ending with `Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>`. Never push.

## File Map

| File | Task | Responsibility |
|---|---|---|
| `src/features.ts` | 1 | Registry: `TargetId`, `TARGETS`, `Block`; each `Feature` has `blocks.claude` and `blocks.workbench` |
| `src/sync.ts` | 1 | `computeSyncedCss(content, enabled, bodies, target)`, `loadBlockBodies(root, target)`, `syncCssFile`, `syncInstall` |
| `src/blocks.ts` | 2 | `escapeRegExp` exported |
| `src/checksum.ts` | 2 (new) | `computeChecksum`, `replaceChecksum`, `updateChecksum` |
| `src/cleanup.ts` | 1, 3 | `cleanCssFile(cssPath, target)`; `cleanInstall` and `cleanupAll` for Claude Code |
| `src/workbench.ts` | 3 (new) | `WORKBENCH_CSS`, `workbenchCssPath`, `syncWorkbench`, `cleanWorkbench`, `findAppRoot` |
| `src/test/css-rules.ts` | 4 (new) | CSS parsing helpers for the CSS tests, moved out of `theme-css.test.ts` |
| `css/copilot-rtl.css` | 4 (new) | RTL block for the chat |
| `css/copilot-theme.css` | 5 (new) | Theme block for the chat |
| `src/health.ts` | 5 | `REQUIRED_CHAT_CLASSES`, `checkWorkbenchHealth`, `checkWorkbenchInstallHealth`, `formatWorkbenchHealthWarning` |
| `src/test/copilot-css.test.ts` | 4, 5 (new) | Rules and health coverage of the Copilot CSS |
| `scripts/fixture-lib.js` | 6 (new) | Server, Chrome runner and class check shared by both fixtures |
| `scripts/fixture/chat.html`, `scripts/render-chat-fixture.js` | 6 (new) | Chat fixture rendered against the real workbench CSS |
| `src/extension.ts`, `src/test/fake-vscode.ts` | 7 | Both targets in every sync; silent missing; chat health warning |
| `src/uninstall.ts` | 8 | Also cleans the chat CSS of the VS Code the hook runs under |
| `package.json`, `README.md`, spec | 9 | 0.2.0, texts, docs |

---

### Task 1: Targets in the registry, sync per target

**Files:**
- Modify: `src/features.ts` (whole file)
- Modify: `src/sync.ts` (whole file)
- Modify: `src/cleanup.ts:36-64` (`cleanInstall`)
- Modify: `scripts/render-fixture.js:11-13,260-264`
- Test: `src/test/blocks.test.ts`, `src/test/sync.test.ts`, `src/test/sync.integration.test.ts`, `src/test/cleanup.test.ts`, `src/test/extension.test.ts`, `src/test/theme-css.test.ts`

**Interfaces:**
- Produces:
  - `type TargetId = 'claude' | 'workbench'`
  - `TARGETS: readonly TargetId[]`
  - `interface Block { markers: BlockMarkers; cssFile: string; assets: readonly Asset[] }`
  - `Feature.blocks: Readonly<Record<TargetId, Block>>`. `Feature.markers`, `Feature.cssFile` and `Feature.assets` are gone.
  - `computeSyncedCss(content: string, enabled: ReadonlySet<FeatureId>, bodies: BlockBodies, target: TargetId): string`
  - `loadBlockBodies(extensionRoot: string, target: TargetId): Promise<BlockBodies>`
  - `syncCssFile(cssPath: string, target: TargetId, extensionRoot: string, enabled: ReadonlySet<FeatureId>): Promise<SyncResult>`: fonts go into `path.dirname(cssPath)`.
  - `syncInstall(claudeCodeDir, extensionRoot, enabled): Promise<SyncResult>` is unchanged for callers.

- [ ] **Step 1: Update the existing tests to the new registry shape**

Every `THEME.markers|cssFile|assets` and `RTL.markers|cssFile|assets` becomes `….blocks.claude.…`. Every `computeSyncedCss(…)` call gets `'claude'` as its fourth argument, and `loadBlockBodies(ROOT)` becomes `loadBlockBodies(ROOT, 'claude')`:

```bash
perl -pi -e 's/\b(THEME|RTL)\.(markers|cssFile|assets)\b/$1.blocks.claude.$2/g' src/test/*.ts scripts/render-fixture.js
perl -pi -e 's/\bfeature\.cssFile\b/feature.blocks.claude.cssFile/g' src/test/blocks.test.ts
perl -pi -e "s/, BODIES\)/, BODIES, 'claude')/g" src/test/sync.test.ts
perl -pi -e "s/computeSyncedCss\(css, new Set\(\['theme', 'rtl'\]\), await loadBlockBodies\(ROOT\)\)/computeSyncedCss(css, new Set(['theme', 'rtl']), await loadBlockBodies(ROOT, 'claude'), 'claude')/" scripts/render-fixture.js
grep -n "computeSyncedCss\|loadBlockBodies" src/test/sync.test.ts scripts/render-fixture.js
```

Expected: every `computeSyncedCss` call in `src/test/sync.test.ts` ends in `BODIES, 'claude')` (10 calls), and `scripts/render-fixture.js:260` reads `computeSyncedCss(css, new Set(['theme', 'rtl']), await loadBlockBodies(ROOT, 'claude'), 'claude')`. If a call was missed, fix it by hand.

- [ ] **Step 2: Add the failing registry and per-target tests**

In `src/test/blocks.test.ts`:
- Change the import to `import { FEATURES, RTL, TARGETS, THEME } from '../features';`.
- Replace the whole `suite('features — registry', …)` with:

```ts
suite('features — registry', () => {
  test('canonical order is theme, then rtl', () => {
    assert.deepStrictEqual(FEATURES.map((f) => f.id), ['theme', 'rtl']);
  });

  test('every module has a block for each target', () => {
    assert.deepStrictEqual(TARGETS, ['claude', 'workbench']);
    for (const feature of FEATURES) {
      assert.deepStrictEqual(Object.keys(feature.blocks).sort(), [...TARGETS].sort(), feature.id);
    }
  });

  test('RTL keeps the markers existing installs already have', () => {
    assert.deepStrictEqual(RTL.blocks.claude.markers, {
      start: '/* bidi-rtl-patch-start */',
      end: '/* bidi-rtl-patch-end */',
    });
  });

  test('the workbench blocks have their own markers and CSS files', () => {
    assert.deepStrictEqual(THEME.blocks.workbench.markers, {
      start: '/* bidi-copilot-theme-start */',
      end: '/* bidi-copilot-theme-end */',
    });
    assert.deepStrictEqual(RTL.blocks.workbench.markers, {
      start: '/* bidi-copilot-rtl-start */',
      end: '/* bidi-copilot-rtl-end */',
    });
    assert.strictEqual(THEME.blocks.workbench.cssFile, 'css/copilot-theme.css');
    assert.strictEqual(RTL.blocks.workbench.cssFile, 'css/copilot-rtl.css');
  });

  test('theme assets are woff2 files prefixed bidi-theme-, the same in both targets', () => {
    assert.ok(THEME.blocks.claude.assets.length > 0);
    assert.deepStrictEqual(THEME.blocks.workbench.assets, THEME.blocks.claude.assets);
    for (const asset of THEME.blocks.claude.assets) {
      assert.match(asset.target, /^bidi-theme-[a-z-]+\.woff2$/);
    }
  });

  test('RTL has no assets in any target', () => {
    for (const target of TARGETS) {
      assert.deepStrictEqual(RTL.blocks[target].assets, [], target);
    }
  });
});
```

Append to the `suite('sync — computeSyncedCss', …)` in `src/test/sync.test.ts`, before its closing `});`:

```ts
  test('the workbench target uses its own markers and leaves Claude Code blocks alone', () => {
    const withClaude = appendBlock(CSS, THEME.blocks.claude.markers, '.c{}');
    const both = computeSyncedCss(withClaude, on(['rtl', 'theme']), BODIES, 'workbench');
    assert.strictEqual(
      both,
      appendBlock(
        appendBlock(withClaude, THEME.blocks.workbench.markers, BODIES.theme),
        RTL.blocks.workbench.markers,
        BODIES.rtl
      )
    );
    assert.strictEqual(computeSyncedCss(both, on([]), BODIES, 'workbench'), withClaude);
  });
```

Append to the `suite('sync — syncInstall (file I/O)', …)` in `src/test/sync.integration.test.ts`, before its closing `});`. Also change its import to `import { syncCssFile, syncInstall } from '../sync';`:

```ts
  test('syncCssFile writes the workbench blocks, with the fonts next to that CSS', async () => {
    const workbenchCss = path.join(tmp, 'app', 'out', 'vs', 'workbench', 'workbench.desktop.main.css');
    await write(workbenchCss, ORIGINAL);
    await write(path.join(extRoot, THEME.blocks.workbench.cssFile), '.ct{}');
    await write(path.join(extRoot, RTL.blocks.workbench.cssFile), '.cr{}');
    const fonts = THEME.blocks.workbench.assets.map((a) => path.join(path.dirname(workbenchCss), a.target));

    const result = await syncCssFile(workbenchCss, 'workbench', extRoot, on('theme', 'rtl'));
    assert.deepStrictEqual(result, { cssChanged: true, assetErrors: [] });
    assert.strictEqual(
      await fs.promises.readFile(workbenchCss, 'utf8'),
      appendBlock(appendBlock(ORIGINAL, THEME.blocks.workbench.markers, '.ct{}'), RTL.blocks.workbench.markers, '.cr{}')
    );
    for (const font of fonts) {
      assert.ok(fs.existsSync(font), font);
    }

    await syncCssFile(workbenchCss, 'workbench', extRoot, on());
    assert.strictEqual(await fs.promises.readFile(workbenchCss, 'utf8'), ORIGINAL);
    for (const font of fonts) {
      assert.ok(!fs.existsSync(font), font);
    }
    assert.strictEqual(await fs.promises.readFile(cssPath, 'utf8'), ORIGINAL); // Claude Code untouched
  });
```

- [ ] **Step 3: Run the tests to verify they fail**

Run: `npm test 2>&1 | tail -20`
Expected: the TypeScript compile fails with errors such as `Property 'blocks' does not exist on type 'Feature'` and `Module '"../features"' has no exported member 'TARGETS'`.

- [ ] **Step 4: Replace `src/features.ts`**

```ts
import type { BlockMarkers } from './blocks';

export type FeatureId = 'theme' | 'rtl';

/**
 * Where a module's blocks go: Claude Code's webview/index.css, or VS Code's
 * own workbench CSS, which styles the built-in chat that Copilot runs in.
 */
export type TargetId = 'claude' | 'workbench';

export const TARGETS: readonly TargetId[] = ['claude', 'workbench'];

export interface Asset {
  /** Path inside this extension, relative to its root. */
  readonly source: string;
  /** File name written next to the target's CSS. */
  readonly target: string;
}

/** What one module adds to one target's CSS. */
export interface Block {
  readonly markers: BlockMarkers;
  /** Block body, relative to the extension root. */
  readonly cssFile: string;
  readonly assets: readonly Asset[];
}

export interface Feature {
  readonly id: FeatureId;
  /** Status-bar label. */
  readonly label: string;
  readonly blocks: Readonly<Record<TargetId, Block>>;
  /** globalState key of the on/off flag (default on); one flag covers every target. */
  readonly flagKey: string;
  readonly toggleCommand: string;
}

const RUBIK: readonly Asset[] = [
  { source: 'fonts/rubik-hebrew.woff2', target: 'bidi-theme-rubik-hebrew.woff2' },
  { source: 'fonts/rubik-latin.woff2', target: 'bidi-theme-rubik-latin.woff2' },
];

// The Claude Code blocks use hash-stable selectors: Claude Code's class names
// carry a build-hash suffix (e.g. messagesContainer_07S1Yg), so elements are
// matched by [class*="prefix_"], and the chat input by role + aria-label.
// VS Code's chat uses plain class names (interactive-session, …).
export const THEME: Feature = {
  id: 'theme',
  label: 'Theme',
  blocks: {
    claude: {
      markers: { start: '/* bidi-theme-patch-start */', end: '/* bidi-theme-patch-end */' },
      cssFile: 'css/theme.css',
      assets: RUBIK,
    },
    workbench: {
      markers: { start: '/* bidi-copilot-theme-start */', end: '/* bidi-copilot-theme-end */' },
      cssFile: 'css/copilot-theme.css',
      assets: RUBIK,
    },
  },
  flagKey: 'bidiTheme.enabled',
  toggleCommand: 'bidi-theme.toggle',
};

export const RTL: Feature = {
  id: 'rtl',
  label: 'RTL',
  blocks: {
    claude: {
      markers: { start: '/* bidi-rtl-patch-start */', end: '/* bidi-rtl-patch-end */' },
      cssFile: 'css/rtl.css',
      assets: [],
    },
    workbench: {
      markers: { start: '/* bidi-copilot-rtl-start */', end: '/* bidi-copilot-rtl-end */' },
      cssFile: 'css/copilot-rtl.css',
      assets: [],
    },
  },
  flagKey: 'bidiRtl.enabled',
  toggleCommand: 'bidi-rtl.toggle',
};

/** Canonical order: sync appends the enabled blocks in this order, in every target. */
export const FEATURES: readonly Feature[] = [THEME, RTL];
```

- [ ] **Step 5: Replace `src/sync.ts`**

```ts
import * as crypto from 'crypto';
import * as fs from 'fs';
import * as path from 'path';
import { FEATURES, Feature, FeatureId, TargetId } from './features';
import { appendBlock, stripBlock, writeFileAtomic } from './blocks';

export type BlockBodies = Readonly<Record<FeatureId, string>>;

/** Strips every block of the target, then appends the enabled ones in canonical order. */
export function computeSyncedCss(
  content: string,
  enabled: ReadonlySet<FeatureId>,
  bodies: BlockBodies,
  target: TargetId
): string {
  let result = content;
  for (const feature of FEATURES) {
    result = stripBlock(result, feature.blocks[target].markers);
  }
  for (const feature of FEATURES) {
    if (enabled.has(feature.id)) {
      result = appendBlock(result, feature.blocks[target].markers, bodies[feature.id]);
    }
  }
  return result;
}

export async function loadBlockBodies(extensionRoot: string, target: TargetId): Promise<BlockBodies> {
  const entries = await Promise.all(
    FEATURES.map(async (feature) => {
      const body = await fs.promises.readFile(path.join(extensionRoot, feature.blocks[target].cssFile), 'utf8');
      return [feature.id, body] as const;
    })
  );
  return Object.fromEntries(entries) as Record<FeatureId, string>;
}

export interface SyncResult {
  /** True when the target's CSS was rewritten. */
  cssChanged: boolean;
  /** Font copy/delete failures, each starting with the file name. They never stop the sync. */
  assetErrors: string[];
}

async function sha256(file: string): Promise<string> {
  return crypto.createHash('sha256').update(await fs.promises.readFile(file)).digest('hex');
}

async function sameFile(a: string, b: string): Promise<boolean> {
  try {
    const [statA, statB] = await Promise.all([fs.promises.stat(a), fs.promises.stat(b)]);
    return statA.size === statB.size && (await sha256(a)) === (await sha256(b));
  } catch {
    return false;
  }
}

/**
 * Copies each asset of the given features' blocks for the target (when
 * missing or different) into `dir`, or deletes it there. Returns the failures.
 */
async function syncAssets(
  dir: string,
  extensionRoot: string,
  features: readonly Feature[],
  target: TargetId,
  action: 'copy' | 'delete'
): Promise<string[]> {
  const errors: string[] = [];
  for (const feature of features) {
    for (const asset of feature.blocks[target].assets) {
      const source = path.join(extensionRoot, asset.source);
      const file = path.join(dir, asset.target);
      try {
        if (action === 'delete') {
          await fs.promises.rm(file, { force: true });
        } else if (!(await sameFile(source, file))) {
          await fs.promises.copyFile(source, file);
        }
      } catch (err: unknown) {
        errors.push(`${asset.target}: ${err instanceof Error ? err.message : String(err)}`);
      }
    }
  }
  return errors;
}

/**
 * Brings one target's CSS file in line with the enabled features, with the
 * fonts in the same folder. Fonts of enabled blocks are copied before the CSS
 * is written and fonts of disabled blocks are deleted after it, so the CSS
 * never points at a font this sync has yet to copy or has already deleted,
 * even when the write fails. A font that fails to copy is reported in
 * assetErrors.
 */
export async function syncCssFile(
  cssPath: string,
  target: TargetId,
  extensionRoot: string,
  enabled: ReadonlySet<FeatureId>
): Promise<SyncResult> {
  const dir = path.dirname(cssPath);
  const content = await fs.promises.readFile(cssPath, 'utf8');
  const next = computeSyncedCss(content, enabled, await loadBlockBodies(extensionRoot, target), target);
  const on = FEATURES.filter((feature) => enabled.has(feature.id));
  const off = FEATURES.filter((feature) => !enabled.has(feature.id));
  const assetErrors = await syncAssets(dir, extensionRoot, on, target, 'copy');
  const cssChanged = next !== content;
  if (cssChanged) {
    await writeFileAtomic(cssPath, next);
  }
  assetErrors.push(...(await syncAssets(dir, extensionRoot, off, target, 'delete')));
  return { cssChanged, assetErrors };
}

/** Brings one Claude Code install's webview/index.css in line with the enabled features. */
export function syncInstall(
  claudeCodeDir: string,
  extensionRoot: string,
  enabled: ReadonlySet<FeatureId>
): Promise<SyncResult> {
  return syncCssFile(path.join(claudeCodeDir, 'webview', 'index.css'), 'claude', extensionRoot, enabled);
}
```

- [ ] **Step 6: Point `cleanInstall` in `src/cleanup.ts` at the Claude Code blocks**

In `cleanInstall`, replace `stripBlock(cleaned, feature.markers)` with `stripBlock(cleaned, feature.blocks.claude.markers)` and `for (const asset of feature.assets)` with `for (const asset of feature.blocks.claude.assets)`. Task 3 generalizes this function.

- [ ] **Step 7: Run the tests to verify they pass**

Run: `npm test 2>&1 | tail -8`
Expected: PASS, `135 passing`, 0 failing. That is 130 before, with the 3 old registry tests replaced by 6, plus the new `computeSyncedCss` and `syncCssFile` tests.

Also run: `grep -n "THEME\.\(markers\|cssFile\|assets\)\|RTL\.\(markers\|cssFile\|assets\)" src scripts -r`
Expected: no output. No file still names the old fields.

- [ ] **Step 8: Commit**

```bash
git add src/features.ts src/sync.ts src/cleanup.ts src/test scripts/render-fixture.js
git commit -m "refactor: give each module a block per target (Claude Code, workbench)

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 2: product.json checksum

**Files:**
- Modify: `src/blocks.ts:9-11` (export `escapeRegExp`)
- Create: `src/checksum.ts`
- Test: `src/test/checksum.test.ts` (new)

**Interfaces:**
- Consumes: `writeFileAtomic(path, content)` from `src/blocks.ts`.
- Produces:
  - `escapeRegExp(text: string): string`, exported from `src/blocks.ts`
  - `computeChecksum(content: string | Buffer): string`
  - `replaceChecksum(productJson: string, file: string, checksum: string): string | null`
  - `updateChecksum(appRoot: string, file: string): Promise<boolean>`: `file` is the checksum key, a `/`-separated path under `<appRoot>/out`.

- [ ] **Step 1: Write the failing tests**

Create `src/test/checksum.test.ts`:

```ts
import * as assert from 'assert';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { computeChecksum, replaceChecksum, updateChecksum } from '../checksum';

const FILE = 'vs/workbench/workbench.desktop.main.css';
// Laid out like VS Code's product.json: tabs, and another file with the same value.
const PRODUCT =
  '{\n\t"nameShort": "Code - Insiders",\n\t"checksums": {\n' +
  '\t\t"vs/workbench/workbench.desktop.main.js": "OLD/+sum",\n' +
  `\t\t"${FILE}": "OLD/+sum",\n` +
  '\t\t"vs/code/electron-browser/workbench/workbench.html": "AAAA"\n\t}\n}\n';
const withValue = (value: string): string => PRODUCT.split(`"${FILE}": "OLD/+sum"`).join(`"${FILE}": "${value}"`);

suite('checksum', () => {
  test('is the base64 SHA-256 without padding, as in product.json', () => {
    assert.strictEqual(computeChecksum(''), '47DEQpj8HBSa+/TImW+5JCeuQeRkm5NMpJWZG3hSuFU');
    assert.strictEqual(computeChecksum(Buffer.from('abc')), 'ungWv48Bz+pBQUDeXa4iI7ADYaOWF3qctBD/YfIAFa0');
  });

  test('replaceChecksum changes only that one value', () => {
    const next = replaceChecksum(PRODUCT, FILE, 'NEW+/sum');
    assert.strictEqual(next, withValue('NEW+/sum'));
    assert.ok(next?.includes('"vs/workbench/workbench.desktop.main.js": "OLD/+sum"'));
  });

  test('replaceChecksum returns the same text when the value is already right', () => {
    assert.strictEqual(replaceChecksum(PRODUCT, FILE, 'OLD/+sum'), PRODUCT);
  });

  test('replaceChecksum returns null when product.json lists no checksum for the file', () => {
    assert.strictEqual(replaceChecksum('{"nameShort":"Code"}', FILE, 'x'), null);
    assert.strictEqual(replaceChecksum('{"checksums":{"other.js":"x"}}', FILE, 'x'), null);
  });

  test('replaceChecksum refuses an entry it cannot find written out', () => {
    const escaped = PRODUCT.replace(`"${FILE}"`, `"${FILE.replace(/\//g, '\\/')}"`);
    assert.throws(() => replaceChecksum(escaped, FILE, 'NEW'), /one checksum entry/);
  });

  suite('updateChecksum', () => {
    let appRoot: string;
    let productPath: string;

    setup(async () => {
      appRoot = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'bidi-checksum-'));
      productPath = path.join(appRoot, 'product.json');
      const cssPath = path.join(appRoot, 'out', 'vs', 'workbench', 'workbench.desktop.main.css');
      await fs.promises.mkdir(path.dirname(cssPath), { recursive: true });
      await fs.promises.writeFile(cssPath, '.a{color:red}');
      await fs.promises.writeFile(productPath, PRODUCT);
    });

    teardown(async () => {
      await fs.promises.rm(appRoot, { recursive: true, force: true });
    });

    test('writes the checksum of the file as it is now, and nothing else', async () => {
      assert.strictEqual(await updateChecksum(appRoot, FILE), true);
      assert.strictEqual(await fs.promises.readFile(productPath, 'utf8'), withValue(computeChecksum('.a{color:red}')));
    });

    test('leaves product.json alone when the checksum is already right', async () => {
      await updateChecksum(appRoot, FILE);
      const past = new Date('2020-01-01T00:00:00Z');
      await fs.promises.utimes(productPath, past, past);
      assert.strictEqual(await updateChecksum(appRoot, FILE), false);
      assert.strictEqual((await fs.promises.stat(productPath)).mtime.getTime(), past.getTime());
    });

    test('leaves product.json alone when it lists no checksum for the file', async () => {
      await fs.promises.writeFile(productPath, '{"nameShort":"Code"}');
      assert.strictEqual(await updateChecksum(appRoot, FILE), false);
      assert.strictEqual(await fs.promises.readFile(productPath, 'utf8'), '{"nameShort":"Code"}');
    });

    test('rejects when product.json is missing', async () => {
      await fs.promises.rm(productPath);
      await assert.rejects(updateChecksum(appRoot, FILE), { code: 'ENOENT' });
    });
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm test 2>&1 | tail -8`
Expected: the compile fails with `Cannot find module '../checksum'`.

- [ ] **Step 3: Export `escapeRegExp` from `src/blocks.ts`**

Change `function escapeRegExp(text: string): string {` to `export function escapeRegExp(text: string): string {`.

- [ ] **Step 4: Create `src/checksum.ts`**

```ts
import * as crypto from 'crypto';
import * as fs from 'fs';
import * as path from 'path';
import { escapeRegExp, writeFileAtomic } from './blocks';

/**
 * VS Code checks its own files against `checksums` in product.json and says
 * the installation is corrupt when one differs. The keys are paths under
 * <appRoot>/out; the values are base64 SHA-256 digests without '=' padding.
 */
export function computeChecksum(content: string | Buffer): string {
  return crypto.createHash('sha256').update(content).digest('base64').replace(/=+$/, '');
}

/**
 * product.json with the checksum of `file` set to `checksum`, changing only
 * the characters of that one value; null when product.json lists no checksum
 * for `file`. Throws when the entry is not written as one `"file": "value"`
 * pair, so a file this cannot edit exactly is left alone.
 */
export function replaceChecksum(productJson: string, file: string, checksum: string): string | null {
  const product = JSON.parse(productJson) as { checksums?: Record<string, unknown> };
  const current = product.checksums?.[file];
  if (typeof current !== 'string') {
    return null;
  }
  if (current === checksum) {
    return productJson;
  }
  const entry = new RegExp(
    `(${escapeRegExp(JSON.stringify(file))}\\s*:\\s*)${escapeRegExp(JSON.stringify(current))}`,
    'g'
  );
  const count = productJson.match(entry)?.length ?? 0;
  if (count !== 1) {
    throw new Error(`expected one checksum entry for ${file} in product.json, found ${count}`);
  }
  return productJson.replace(entry, (_match, key: string) => key + JSON.stringify(checksum));
}

/**
 * Sets product.json's checksum for `file` to the checksum of that file as it
 * is now. Resolves to true when product.json was rewritten.
 */
export async function updateChecksum(appRoot: string, file: string): Promise<boolean> {
  const productPath = path.join(appRoot, 'product.json');
  const [content, productJson] = await Promise.all([
    fs.promises.readFile(path.join(appRoot, 'out', ...file.split('/'))),
    fs.promises.readFile(productPath, 'utf8'),
  ]);
  const next = replaceChecksum(productJson, file, computeChecksum(content));
  if (next === null || next === productJson) {
    return false;
  }
  await writeFileAtomic(productPath, next);
  return true;
}
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npm test 2>&1 | tail -8`
Expected: PASS, `144 passing` (9 new), 0 failing.

- [ ] **Step 6: Check the checksum against the real VS Code, read-only**

Run:
```bash
node -e "
const fs=require('fs');const {computeChecksum}=require('./out/checksum');
const app='/Applications/Visual Studio Code - Insiders 2.app/Contents/Resources/app';
const key='vs/workbench/workbench.desktop.main.css';
const want=JSON.parse(fs.readFileSync(app+'/product.json','utf8')).checksums[key];
const got=computeChecksum(fs.readFileSync(app+'/out/'+key));
console.log(got===want?'checksum matches product.json':'MISMATCH '+got+' vs '+want);"
```
Expected: `checksum matches product.json`. A mismatch means the install is already patched: say so in the report and do not change anything there.

- [ ] **Step 7: Commit**

```bash
git add src/blocks.ts src/checksum.ts src/test/checksum.test.ts
git commit -m "feat: compute and update VS Code's product.json checksums

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 3: The workbench target: sync, clean, find the app

**Files:**
- Modify: `src/cleanup.ts:33-64` (`cleanCssFile`, `cleanInstall`)
- Create: `src/workbench.ts`
- Test: `src/test/workbench.test.ts` (new)

**Interfaces:**
- Consumes:
  - `syncCssFile(cssPath, target, extensionRoot, enabled)` and `SyncResult` from `src/sync.ts` (Task 1)
  - `updateChecksum(appRoot, file)` from `src/checksum.ts` (Task 2)
- Produces:
  - `cleanCssFile(cssPath: string, target: TargetId): Promise<boolean>` in `src/cleanup.ts`
  - `WORKBENCH_CSS = 'vs/workbench/workbench.desktop.main.css'`
  - `workbenchCssPath(appRoot: string): string`
  - `interface WorkbenchSyncResult extends SyncResult { checksumError: string | null }`
  - `syncWorkbench(appRoot: string, extensionRoot: string, enabled: ReadonlySet<FeatureId>): Promise<WorkbenchSyncResult | null>`: null when there is no workbench CSS.
  - `cleanWorkbench(appRoot: string): Promise<boolean>`
  - `findAppRoot(execPath: string): Promise<string | null>`

- [ ] **Step 1: Write the failing tests**

Create `src/test/workbench.test.ts`:

```ts
import * as assert from 'assert';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { appendBlock } from '../blocks';
import { computeChecksum } from '../checksum';
import { FeatureId, RTL, THEME } from '../features';
import { WORKBENCH_CSS, cleanWorkbench, findAppRoot, syncWorkbench, workbenchCssPath } from '../workbench';

const ORIGINAL = '.interactive-session{max-width:950px}\n/*# sourceMappingURL=x.css.map*/';
const THEME_BODY = '.monaco-workbench.vs-dark .interactive-session{max-width:none}';
const RTL_BODY = '.interactive-session .rendered-markdown{direction:rtl}';
const PATCHED = appendBlock(
  appendBlock(ORIGINAL, THEME.blocks.workbench.markers, THEME_BODY),
  RTL.blocks.workbench.markers,
  RTL_BODY
);
const on = (...ids: FeatureId[]): Set<FeatureId> => new Set(ids);
/** A product.json laid out like VS Code's, holding the checksum of `css`. */
const product = (css: string): string =>
  `{\n\t"nameShort": "Code - Insiders",\n\t"checksums": {\n\t\t"${WORKBENCH_CSS}": "${computeChecksum(css)}"\n\t}\n}\n`;

async function write(file: string, content: string | Buffer): Promise<void> {
  await fs.promises.mkdir(path.dirname(file), { recursive: true });
  await fs.promises.writeFile(file, content);
}

const read = (file: string): string => fs.readFileSync(file, 'utf8');

suite('workbench — the VS Code chat target', () => {
  let tmp: string;
  let contents: string;
  let appRoot: string;
  let extRoot: string;
  let cssPath: string;
  let productPath: string;
  let fonts: string[];

  setup(async () => {
    tmp = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'bidi-workbench-'));
    contents = path.join(tmp, 'Visual Studio Code.app', 'Contents');
    appRoot = path.join(contents, 'Resources', 'app');
    extRoot = path.join(tmp, 'ext');
    cssPath = workbenchCssPath(appRoot);
    productPath = path.join(appRoot, 'product.json');
    await write(cssPath, ORIGINAL);
    await write(productPath, product(ORIGINAL));
    await write(path.join(extRoot, THEME.blocks.workbench.cssFile), THEME_BODY);
    await write(path.join(extRoot, RTL.blocks.workbench.cssFile), RTL_BODY);
    for (const asset of THEME.blocks.workbench.assets) {
      await write(path.join(extRoot, asset.source), Buffer.from(`font:${asset.target}`));
    }
    fonts = THEME.blocks.workbench.assets.map((a) => path.join(path.dirname(cssPath), a.target));
  });

  teardown(async () => {
    await fs.promises.rm(tmp, { recursive: true, force: true });
  });

  test('the workbench CSS lives under out/vs/workbench', () => {
    assert.strictEqual(
      workbenchCssPath(path.join(tmp, 'app')),
      path.join(tmp, 'app', 'out', 'vs', 'workbench', 'workbench.desktop.main.css')
    );
  });

  test('syncWorkbench writes both blocks, copies the fonts and updates the checksum', async () => {
    assert.deepStrictEqual(await syncWorkbench(appRoot, extRoot, on('theme', 'rtl')), {
      cssChanged: true,
      assetErrors: [],
      checksumError: null,
    });
    assert.strictEqual(read(cssPath), PATCHED);
    for (const font of fonts) {
      assert.ok(fs.existsSync(font), font);
    }
    assert.strictEqual(read(productPath), product(PATCHED));
  });

  test('a second sync changes nothing', async () => {
    await syncWorkbench(appRoot, extRoot, on('theme', 'rtl'));
    assert.deepStrictEqual(await syncWorkbench(appRoot, extRoot, on('theme', 'rtl')), {
      cssChanged: false,
      assetErrors: [],
      checksumError: null,
    });
    assert.strictEqual(read(productPath), product(PATCHED));
  });

  test('turning everything off restores the CSS, the fonts and the checksum exactly', async () => {
    await syncWorkbench(appRoot, extRoot, on('theme', 'rtl'));
    await syncWorkbench(appRoot, extRoot, on());
    assert.strictEqual(read(cssPath), ORIGINAL);
    for (const font of fonts) {
      assert.ok(!fs.existsSync(font), font);
    }
    assert.strictEqual(read(productPath), product(ORIGINAL));
  });

  test('a checksum that cannot be written is reported, and the CSS is still patched', async () => {
    await fs.promises.rm(productPath);
    await fs.promises.mkdir(productPath); // a folder: reading it fails
    const result = await syncWorkbench(appRoot, extRoot, on('theme'));
    assert.ok(result);
    assert.strictEqual(result.cssChanged, true);
    assert.ok(result.checksumError, 'no checksumError');
    assert.strictEqual(read(cssPath), appendBlock(ORIGINAL, THEME.blocks.workbench.markers, THEME_BODY));
  });

  test('resolves to null without a workbench CSS or an absolute appRoot', async () => {
    assert.strictEqual(await syncWorkbench(path.join(tmp, 'nowhere'), extRoot, on('theme')), null);
    assert.strictEqual(await syncWorkbench('', extRoot, on('theme')), null);
  });

  test('cleanWorkbench removes the blocks and fonts and restores the checksum', async () => {
    await syncWorkbench(appRoot, extRoot, on('theme', 'rtl'));
    assert.strictEqual(await cleanWorkbench(appRoot), true);
    assert.strictEqual(read(cssPath), ORIGINAL);
    for (const font of fonts) {
      assert.ok(!fs.existsSync(font), font);
    }
    assert.strictEqual(read(productPath), product(ORIGINAL));
    assert.strictEqual(await cleanWorkbench(appRoot), false);
    assert.strictEqual(await cleanWorkbench(path.join(tmp, 'nowhere')), false);
  });

  test('cleanWorkbench restores the checksum even when a font cannot be deleted', async () => {
    await syncWorkbench(appRoot, extRoot, on('theme', 'rtl'));
    await fs.promises.rm(fonts[0]);
    await fs.promises.mkdir(fonts[0]); // a folder cannot be unlinked as a file
    await assert.rejects(cleanWorkbench(appRoot), (err: Error) => err.message.includes(path.basename(fonts[0])));
    assert.strictEqual(read(cssPath), ORIGINAL);
    assert.strictEqual(read(productPath), product(ORIGINAL));
  });

  suite('findAppRoot', () => {
    test('finds the macOS app from its executable or from a helper inside the bundle', async () => {
      assert.strictEqual(await findAppRoot(path.join(contents, 'MacOS', 'Electron')), appRoot);
      const helper = path.join(contents, 'Frameworks', 'Code Helper.app', 'Contents', 'MacOS', 'Code Helper');
      assert.strictEqual(await findAppRoot(helper), appRoot);
    });

    test('finds the Windows and Linux layout: resources/app next to the executable', async () => {
      const install = path.join(tmp, 'VSCode-linux-x64');
      const linuxRoot = path.join(install, 'resources', 'app');
      await write(workbenchCssPath(linuxRoot), ORIGINAL);
      assert.strictEqual(await findAppRoot(path.join(install, 'code')), linuxRoot);
    });

    test('resolves to null when no VS Code holds the executable', async () => {
      assert.strictEqual(await findAppRoot(path.join(tmp, 'bin', 'node')), null);
    });
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm test 2>&1 | tail -8`
Expected: the compile fails with `Cannot find module '../workbench'`.

- [ ] **Step 3: Generalize `cleanInstall` in `src/cleanup.ts`**

Change the import line to `import { FEATURES, TargetId } from './features';`. Then replace the comment and the whole `cleanInstall` function (from `// Strips every block and deletes every asset` through the function's closing `}`) with:

```ts
// Strips every block of the target from one CSS file and deletes every asset
// this extension wrote next to it. Returns true if anything changed. An asset
// that is already gone is fine; any other failure is thrown once every asset
// has been tried.
export async function cleanCssFile(cssPath: string, target: TargetId): Promise<boolean> {
  let changed = false;
  const content = await fs.promises.readFile(cssPath, 'utf8');
  let cleaned = content;
  for (const feature of FEATURES) {
    cleaned = stripBlock(cleaned, feature.blocks[target].markers);
  }
  if (cleaned !== content) {
    await writeFileAtomic(cssPath, cleaned);
    changed = true;
  }
  const failures: string[] = [];
  for (const feature of FEATURES) {
    for (const asset of feature.blocks[target].assets) {
      try {
        await fs.promises.unlink(path.join(path.dirname(cssPath), asset.target));
        changed = true;
      } catch (err: unknown) {
        if ((err as NodeJS.ErrnoException | undefined)?.code !== 'ENOENT') {
          failures.push(`${asset.target}: ${errorMessage(err)}`);
        }
      }
    }
  }
  if (failures.length > 0) {
    throw new Error(`could not delete ${failures.join('; ')}`);
  }
  return changed;
}

/** Cleans one Claude Code install, given its webview/index.css. */
export function cleanInstall(cssPath: string): Promise<boolean> {
  return cleanCssFile(cssPath, 'claude');
}
```

- [ ] **Step 4: Create `src/workbench.ts`**

```ts
import * as fs from 'fs';
import * as path from 'path';
import { updateChecksum } from './checksum';
import { cleanCssFile } from './cleanup';
import { FeatureId } from './features';
import { SyncResult, syncCssFile } from './sync';

/**
 * VS Code's workbench stylesheet, which styles the built-in chat that Copilot
 * runs in, as a path under <appRoot>/out: its key in product.json's checksums.
 */
export const WORKBENCH_CSS = 'vs/workbench/workbench.desktop.main.css';

export function workbenchCssPath(appRoot: string): string {
  return path.join(appRoot, 'out', ...WORKBENCH_CSS.split('/'));
}

export interface WorkbenchSyncResult extends SyncResult {
  /** Why product.json's checksum could not be updated, or null. The blocks apply either way. */
  checksumError: string | null;
}

async function exists(file: string): Promise<boolean> {
  try {
    await fs.promises.access(file);
    return true;
  } catch {
    return false;
  }
}

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

/**
 * Brings the workbench CSS of the VS Code at `appRoot` in line with the
 * enabled modules, then sets its checksum in product.json so VS Code does not
 * call the installation corrupt. Resolves to null when there is no workbench
 * CSS there (VS Code for the Web, or a remote extension host).
 */
export async function syncWorkbench(
  appRoot: string,
  extensionRoot: string,
  enabled: ReadonlySet<FeatureId>
): Promise<WorkbenchSyncResult | null> {
  const cssPath = workbenchCssPath(appRoot);
  if (!path.isAbsolute(appRoot) || !(await exists(cssPath))) {
    return null;
  }
  const result = await syncCssFile(cssPath, 'workbench', extensionRoot, enabled);
  let checksumError: string | null = null;
  try {
    await updateChecksum(appRoot, WORKBENCH_CSS);
  } catch (err: unknown) {
    checksumError = errorMessage(err);
  }
  return { ...result, checksumError };
}

/**
 * Removes this extension's blocks and fonts from the workbench CSS at
 * `appRoot` and restores its checksum. Resolves to false when there was
 * nothing to remove or no workbench CSS.
 */
export async function cleanWorkbench(appRoot: string): Promise<boolean> {
  const cssPath = workbenchCssPath(appRoot);
  if (!(await exists(cssPath))) {
    return false;
  }
  try {
    return await cleanCssFile(cssPath, 'workbench');
  } finally {
    // Also when a font could not be deleted: the CSS has changed by then.
    await updateChecksum(appRoot, WORKBENCH_CSS);
  }
}

/**
 * The appRoot of the VS Code that `execPath` belongs to: the nearest
 * <folder>/Resources/app (macOS) or <folder>/resources/app (Windows, Linux)
 * above it that holds a workbench CSS. The uninstall hook runs under VS
 * Code's own executable or one of its helpers, all inside the installation.
 * Folder names come from the disk, so the result has their real case.
 */
export async function findAppRoot(execPath: string): Promise<string | null> {
  let dir = path.dirname(execPath);
  for (;;) {
    let names: string[] = [];
    try {
      names = await fs.promises.readdir(dir);
    } catch {
      // missing or unreadable: keep looking further up
    }
    for (const name of names.filter((n) => n.toLowerCase() === 'resources')) {
      const appRoot = path.join(dir, name, 'app');
      if (await exists(workbenchCssPath(appRoot))) {
        return appRoot;
      }
    }
    const parent = path.dirname(dir);
    if (parent === dir) {
      return null;
    }
    dir = parent;
  }
}
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npm test 2>&1 | tail -8`
Expected: PASS, `155 passing` (11 new), 0 failing.

- [ ] **Step 6: Commit**

```bash
git add src/cleanup.ts src/workbench.ts src/test/workbench.test.ts
git commit -m "feat: sync and clean VS Code's workbench CSS with its checksum

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---
### Task 4: The Copilot RTL block

**Files:**
- Create: `src/test/css-rules.ts` (CSS parsing helpers, moved out of `src/test/theme-css.test.ts`)
- Modify: `src/test/theme-css.test.ts:9-79` (use the helpers)
- Create: `css/copilot-rtl.css`
- Test: `src/test/copilot-css.test.ts` (new)

**Interfaces:**
- Consumes: `RTL.blocks.workbench.cssFile` (`'css/copilot-rtl.css'`) from Task 1.
- Produces:
  - `src/test/css-rules.ts` exports `TopLevelRule`, `topLevelRules(css)`, `splitSelectors(prelude)`, `urls(css)`, `properties(body): string[]` and `classNames(prelude): string[]`.
  - `css/copilot-rtl.css`, the block body of the `rtl` module for the workbench target.

Background for this task: VS Code's chat is the workbench DOM itself, not a webview. Its class names are stable:
- `.interactive-session` is the root.
- `.interactive-item-container.interactive-request` and `.interactive-response` are the rows.
- Their `.value` holds the parts:
  - `.rendered-markdown` for markdown;
  - `.chat-tool-invocation-part` and `.chat-terminal-content-part` for tool calls and terminal commands;
  - `.progress-container` for status lines;
  - `.chat-used-context` for collapsible parts.

VS Code lays out the list, the toolbars and the input editor (Monaco) in JS, and Monaco has no right-to-left mode. So only the message text turns right-to-left.

- [ ] **Step 1: Move the CSS helpers into `src/test/css-rules.ts`**

Create `src/test/css-rules.ts`:

```ts
import * as assert from 'assert';

// Helpers for the tests that check the CSS block files. Not a test file itself.

export interface TopLevelRule {
  prelude: string;
  body: string;
}

/** Splits a flat stylesheet (comments removed, no nesting) into top-level rules. */
export function topLevelRules(css: string): TopLevelRule[] {
  const src = css.replace(/\/\*[\s\S]*?\*\//g, '');
  const rules: TopLevelRule[] = [];
  let depth = 0;
  let quote: string | null = null;
  let start = 0;
  let prelude = '';
  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    if (quote) {
      if (ch === quote) {
        quote = null;
      }
    } else if (ch === '"' || ch === "'") {
      quote = ch;
    } else if (ch === '{') {
      if (depth === 0) {
        prelude = src.slice(start, i).trim();
        start = i + 1;
      }
      depth++;
    } else if (ch === '}') {
      depth--;
      if (depth === 0) {
        rules.push({ prelude, body: src.slice(start, i) });
        start = i + 1;
      }
    }
  }
  assert.strictEqual(depth, 0, 'unbalanced braces');
  assert.strictEqual(src.slice(start).trim(), '', 'text after the last rule');
  return rules;
}

/** Splits a selector list on commas outside quotes, brackets and parentheses. */
export function splitSelectors(prelude: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let quote: string | null = null;
  let start = 0;
  for (let i = 0; i < prelude.length; i++) {
    const ch = prelude[i];
    if (quote) {
      if (ch === quote) {
        quote = null;
      }
    } else if (ch === '"' || ch === "'") {
      quote = ch;
    } else if (ch === '(' || ch === '[') {
      depth++;
    } else if (ch === ')' || ch === ']') {
      depth--;
    } else if (ch === ',' && depth === 0) {
      parts.push(prelude.slice(start, i).trim());
      start = i + 1;
    }
  }
  parts.push(prelude.slice(start).trim());
  return parts;
}

/** The url() references in a stylesheet: unquoted, single- or double-quoted. */
export function urls(css: string): string[] {
  return [...css.matchAll(/url\(\s*(?:"([^"]*)"|'([^']*)'|([^)\s'"]+))\s*\)/g)].map((m) => m[1] ?? m[2] ?? m[3]);
}

/** The property names a rule body declares, lowercased (custom properties included). */
export function properties(body: string): string[] {
  return [...body.matchAll(/(?:^|;)\s*([\w-]+)\s*:/g)].map((m) => m[1].toLowerCase());
}

/** The class names a selector list names. */
export function classNames(prelude: string): string[] {
  return [...prelude.matchAll(/\.(-?[_a-zA-Z][\w-]*)/g)].map((m) => m[1]);
}
```

In `src/test/theme-css.test.ts`, delete the local `interface TopLevelRule`, `function topLevelRules`, `function splitSelectors` and `function urls` (lines 9–79: from `interface TopLevelRule {` through the closing `}` of `urls`). Then add this import after the `../health` import:

```ts
import { TopLevelRule, splitSelectors, topLevelRules, urls } from './css-rules';
```

Run: `npm test 2>&1 | tail -4`
Expected: PASS, `155 passing`, as after Task 3. The tests did not change, only where the helpers live.

- [ ] **Step 2: Write the failing RTL tests**

Create `src/test/copilot-css.test.ts`:

```ts
import * as assert from 'assert';
import * as fs from 'fs';
import * as path from 'path';
import { RTL } from '../features';
import { TopLevelRule, properties, splitSelectors, topLevelRules } from './css-rules';

const ROOT = path.join(__dirname, '..', '..');
/** Parts VS Code lays out in JS: the input part, its toolbars, the Monaco editors and the list. */
const JS_LAID_OUT = /\.(interactive-input-part|chat-input-[\w-]+|chat-editor-container|interactive-input-editor|monaco-editor|monaco-list|view-lines?)(?![\w-])/;
const read = (file: string): string => fs.readFileSync(path.join(ROOT, file), 'utf8');
const oneLine = (body: string): string => body.replace(/\s/g, '');

// Each suite reads its file in suiteSetup, so a missing file fails its tests
// instead of aborting the whole run while the suites are registered.
suite('copilot-rtl.css', () => {
  let css: string;
  let rules: TopLevelRule[];

  suiteSetup(() => {
    css = read(RTL.blocks.workbench.cssFile);
    rules = topLevelRules(css);
  });

  test('holds only the block body: no markers, no !important, no at-rules', () => {
    assert.ok(!css.includes('bidi-copilot-'));
    assert.ok(!css.includes('!important'));
    assert.ok(rules.length > 0);
    assert.deepStrictEqual(rules.filter((r) => r.prelude.startsWith('@')), []);
  });

  test('every selector starts with .interactive-session', () => {
    for (const rule of rules) {
      for (const selector of splitSelectors(rule.prelude)) {
        assert.match(selector, /^\.interactive-session(?![\w-])/, `unscoped selector: ${selector}`);
      }
    }
  });

  test('declares only direction and list-marker properties', () => {
    const allowed = new Set(['direction', 'text-align', 'unicode-bidi', 'list-style-position']);
    for (const rule of rules) {
      for (const property of properties(rule.body)) {
        const ok = allowed.has(property) || (property === 'content' && rule.prelude.endsWith('::marker'));
        assert.ok(ok, `${property} in "${rule.prelude}"`);
      }
    }
  });

  test('never turns the parts VS Code lays out in JS right-to-left', () => {
    for (const rule of rules) {
      assert.doesNotMatch(rule.prelude, JS_LAID_OUT, rule.prelude);
    }
  });

  test('turns message text right-to-left and keeps code and tool calls left-to-right', () => {
    const rtl = rules.find((r) => oneLine(r.body).includes('direction:rtl'));
    assert.ok(rtl, 'no RTL rule');
    assert.ok(splitSelectors(rtl.prelude).includes('.interactive-session .interactive-item-container .value .rendered-markdown'));
    const ltr = rules.find((r) => oneLine(r.body).includes('direction:ltr'));
    assert.ok(ltr, 'no LTR rule');
    for (const part of ['code', 'interactive-result-code-block', 'chat-tool-invocation-part', 'chat-terminal-content-part']) {
      assert.ok(ltr.prelude.includes(part), `${part} is not kept LTR`);
    }
  });
});
```

- [ ] **Step 3: Run the tests to verify they fail**

Run: `npm test 2>&1 | grep -E "passing|failing|ENOENT" | head -5`
Expected: `155 passing` and 5 failing. Every `copilot-rtl.css` test fails with `ENOENT: no such file or directory, open '…/css/copilot-rtl.css'` from `suiteSetup`.

- [ ] **Step 4: Create `css/copilot-rtl.css`**

```css
/* RTL for VS Code's chat, in every theme. Only the message text turns
   right-to-left: VS Code lays out the list, the toolbars and the input editor
   in JS, and the input editor (Monaco) has no right-to-left mode, so those
   keep their direction. Rules (enforced by src/test/copilot-css.test.ts): only
   direction, text-align, unicode-bidi and list-marker placement, every
   selector starting with .interactive-session. */

/* Markdown, in your messages and in Copilot's: RTL blocks with
   text-align:start, and each paragraph, heading and list item takes the
   direction of its own text, so Hebrew paragraphs sit on the right and
   English ones on the left. */
.interactive-session .interactive-item-container .value .rendered-markdown{
direction:rtl;
text-align:start;
unicode-bidi:isolate;
}
.interactive-session .interactive-item-container .value .rendered-markdown :is(p,h1,h2,h3,h4,h5,h6,li,blockquote,th,td){
unicode-bidi:plaintext;
text-align:start;
}
/* Inside markers + unicode-bidi:normal make each marker follow its item's language. */
.interactive-session .interactive-item-container .value .rendered-markdown :is(ol,ul)>li{
list-style-position:inside;
}
.interactive-session .interactive-item-container .value .rendered-markdown :is(ol,ul)>li::marker{
unicode-bidi:normal;
}
.interactive-session .interactive-item-container .value .rendered-markdown ul>li::marker{
content:"\2022  ";
}
/* Code, tool calls, terminal commands, file pills, progress lines and the
   labels of collapsible parts stay LTR. */
.interactive-session .interactive-item-container .value :is(.chat-tool-invocation-part,.chat-terminal-content-part,.progress-container,.chat-used-context-label),
.interactive-session .interactive-item-container .value :is(.chat-tool-invocation-part,.chat-terminal-content-part,.progress-container) .rendered-markdown,
.interactive-session .interactive-item-container .value .rendered-markdown :is(code,pre,.interactive-result-code-block,.chat-inline-anchor-widget,.chat-codeblock-pill-container){
direction:ltr;
text-align:left;
unicode-bidi:isolate;
}
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npm test 2>&1 | tail -4`
Expected: PASS, `160 passing`, 0 failing.

- [ ] **Step 6: Commit**

```bash
git add src/test/css-rules.ts src/test/theme-css.test.ts src/test/copilot-css.test.ts css/copilot-rtl.css
git commit -m "feat: RTL block for VS Code's Copilot chat

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 5: The Copilot theme block and the chat health check

**Files:**
- Modify: `src/health.ts` (imports; append the chat health check)
- Create: `css/copilot-theme.css`
- Test: `src/test/health.test.ts`, `src/test/copilot-css.test.ts`

**Interfaces:**
- Consumes:
  - `THEME.blocks.workbench` (`cssFile: 'css/copilot-theme.css'`, the two Rubik assets) and `FEATURES` from Task 1
  - `escapeRegExp` and `stripBlock` from `src/blocks.ts` (Task 2)
  - `workbenchCssPath(appRoot)` from `src/workbench.ts` (Task 3)
  - `css/copilot-rtl.css` and `src/test/css-rules.ts` from Task 4
- Produces:
  - `REQUIRED_CHAT_CLASSES: readonly string[]` (36 class names)
  - `interface WorkbenchHealthReport { unreadable: boolean; missingClasses: string[] }`
  - `checkWorkbenchHealth(css: string | null): WorkbenchHealthReport` (the CSS without this extension's blocks)
  - `isWorkbenchHealthy(report): boolean`
  - `checkWorkbenchInstallHealth(appRoot: string): Promise<WorkbenchHealthReport>`, which never rejects
  - `formatWorkbenchHealthWarning(version: string, report): string`, empty when healthy
  - `css/copilot-theme.css`

Background for this task: the CSS below was rendered and checked against VS Code 1.143's real `workbench.desktop.main.css` while this plan was written, with the fixture of Task 6. Some parts of the chat are measured or set in JS, so they keep their native geometry:
- the input editor's font, line height and width;
- the input part's horizontal margins: VS Code lays the widget out at most 950px wide;
- the input box's horizontal padding and border.

Three resolved colors and the 13px font size are inline styles on `.interactive-session`, so they are redefined on `.interactive-list`. The theme's selectors also exclude inline chat (`.chat-widget`) and quick chat. Copy the CSS exactly.

- [ ] **Step 1: Write the failing tests**

In `src/test/health.test.ts`:
- Extend the `../health` import with `REQUIRED_CHAT_CLASSES`, `WorkbenchHealthReport`, `checkWorkbenchHealth`, `checkWorkbenchInstallHealth`, `formatWorkbenchHealthWarning` and `isWorkbenchHealthy`.
- Add these imports:

```ts
import { appendBlock } from '../blocks';
import { THEME } from '../features';
import { workbenchCssPath } from '../workbench';
```

- Append at the end of the file:

```ts
suite('health — the Copilot chat', () => {
  const GOOD_WORKBENCH = REQUIRED_CHAT_CLASSES.map((c) => `.${c}{color:red}`).join('\n');
  const HEALTHY_CHAT: WorkbenchHealthReport = { unreadable: false, missingClasses: [] };

  test('a complete workbench CSS is healthy', () => {
    const report = checkWorkbenchHealth(GOOD_WORKBENCH);
    assert.deepStrictEqual(report, HEALTHY_CHAT);
    assert.strictEqual(isWorkbenchHealthy(report), true);
  });

  test('missing classes are listed, and a longer name does not count', () => {
    const css = GOOD_WORKBENCH.replace('.chat-input-toolbar{color:red}', '.chat-input-toolbar-x{color:red}');
    assert.deepStrictEqual(checkWorkbenchHealth(css).missingClasses, ['chat-input-toolbar']);
    assert.strictEqual(isWorkbenchHealthy(checkWorkbenchHealth(css)), false);
  });

  test('an unreadable file is reported, and nothing in it is checked', () => {
    assert.deepStrictEqual(checkWorkbenchHealth(null), { unreadable: true, missingClasses: [] });
    assert.strictEqual(isWorkbenchHealthy(checkWorkbenchHealth(null)), false);
  });

  suite('checkWorkbenchInstallHealth', () => {
    let appRoot: string;

    setup(async () => {
      appRoot = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'bidi-chat-health-'));
      await fs.promises.mkdir(path.dirname(workbenchCssPath(appRoot)), { recursive: true });
    });

    teardown(async () => {
      await fs.promises.rm(appRoot, { recursive: true, force: true });
    });

    test("ignores this extension's own blocks, which name the same classes", async () => {
      const css = appendBlock(GOOD_WORKBENCH.replace('.value{color:red}', ''), THEME.blocks.workbench.markers, '.value{}');
      await fs.promises.writeFile(workbenchCssPath(appRoot), css);
      assert.deepStrictEqual((await checkWorkbenchInstallHealth(appRoot)).missingClasses, ['value']);
    });

    test('reports a missing file instead of rejecting', async () => {
      assert.strictEqual((await checkWorkbenchInstallHealth(appRoot)).unreadable, true);
    });
  });

  test('the warning names the VS Code version and the missing classes', () => {
    const message = formatWorkbenchHealthWarning('1.144.0-insider', { unreadable: false, missingClasses: ['value', 'codicon'] });
    assert.ok(message.includes('1.144.0-insider'), message);
    assert.ok(message.includes('.value, .codicon'), message);
  });

  test('the warning names a file it could not read', () => {
    const message = formatWorkbenchHealthWarning('1.144.0-insider', { unreadable: true, missingClasses: [] });
    assert.ok(message.includes('could not read the workbench CSS'), message);
    assert.ok(!message.includes('Missing'), message);
  });

  test('a healthy workbench CSS has no warning', () => {
    assert.strictEqual(formatWorkbenchHealthWarning('1.143.0-insider', HEALTHY_CHAT), '');
  });
});
```

In `src/test/copilot-css.test.ts`, change the imports to:

```ts
import { RTL, THEME } from '../features';
import { REQUIRED_CHAT_CLASSES } from '../health';
import { TopLevelRule, classNames, properties, splitSelectors, topLevelRules, urls } from './css-rules';
```

and append at the end of the file:

```ts
/** The chat view and the chat editor tab, in dark themes; not inline chat (.chat-widget) or quick chat. */
const THEME_SCOPE =
  '.monaco-workbench.vs-dark :is(.chat-viewpane,.editor-instance) .interactive-session:not(.chat-widget>.interactive-session)';
/** The input editor (Monaco), whose font, line height and width VS Code sets in JS. */
const INPUT_EDITOR = /\.(chat-editor-container|interactive-input-editor|monaco-editor|view-lines?|mtk1)(?![\w-])/;

suite('copilot-theme.css — rules', () => {
  let css: string;
  let rules: TopLevelRule[];

  suiteSetup(() => {
    css = read(THEME.blocks.workbench.cssFile);
    rules = topLevelRules(css);
  });

  test('holds only the block body: no markers, no !important', () => {
    assert.ok(!css.includes('bidi-copilot-'));
    assert.ok(!css.includes('!important'));
  });

  test('the only top-level at-rule is @font-face', () => {
    for (const rule of rules.filter((r) => r.prelude.startsWith('@'))) {
      assert.strictEqual(rule.prelude, '@font-face');
    }
  });

  test('every selector starts with the chat scope', () => {
    for (const rule of rules.filter((r) => !r.prelude.startsWith('@'))) {
      for (const selector of splitSelectors(rule.prelude)) {
        const rest = selector.slice(THEME_SCOPE.length);
        assert.ok(selector.startsWith(THEME_SCOPE) && /^($|[\s>:.[])/.test(rest), `unscoped selector: ${selector}`);
      }
    }
  });

  test('no direction, text-align or unicode-bidi declarations', () => {
    for (const rule of rules) {
      const bad = /(^|[;{\s])(direction|text-align|unicode-bidi)\s*:/i.exec(rule.body);
      assert.strictEqual(bad, null, `forbidden property in "${rule.prelude}"`);
    }
  });

  test('leaves the input editor to VS Code', () => {
    for (const rule of rules) {
      assert.doesNotMatch(rule.prelude, INPUT_EDITOR, rule.prelude);
    }
  });

  test('keeps the input box geometry VS Code computes: tokens only on the box, margins only on the part', () => {
    for (const rule of rules) {
      for (const selector of splitSelectors(rule.prelude)) {
        if (selector.endsWith('.chat-input-container')) {
          assert.ok(properties(rule.body).every((p) => p.startsWith('--')), rule.prelude);
        }
        if (selector.endsWith('.interactive-input-part')) {
          assert.deepStrictEqual(properties(rule.body).sort(), ['--chat-input-radius', 'margin-inline']);
        }
      }
    }
  });

  test("the input part stays at VS Code's 950px layout width, centered", () => {
    assert.ok(css.includes('margin-inline:max(12px,calc((100% - 926px) / 2));'));
  });
});

suite('copilot-theme.css — assets', () => {
  test('every url() points at a declared theme asset, and every asset is used', () => {
    const css = read(THEME.blocks.workbench.cssFile);
    assert.deepStrictEqual(urls(css).sort(), THEME.blocks.workbench.assets.map((a) => a.target).sort());
  });
});

suite('Copilot CSS — health check coverage', () => {
  test('REQUIRED_CHAT_CLASSES lists exactly the classes both files name', () => {
    const used = new Set<string>();
    for (const file of [THEME.blocks.workbench.cssFile, RTL.blocks.workbench.cssFile]) {
      for (const rule of topLevelRules(read(file)).filter((r) => !r.prelude.startsWith('@'))) {
        for (const name of classNames(rule.prelude)) {
          used.add(name);
        }
      }
    }
    assert.deepStrictEqual([...used].sort(), [...REQUIRED_CHAT_CLASSES].sort());
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm test 2>&1 | tail -8`
Expected: the compile fails with `Module '"../health"' has no exported member 'REQUIRED_CHAT_CLASSES'` (and the other new names).

- [ ] **Step 3: Add the chat health check to `src/health.ts`**

Add after the existing imports:

```ts
import { escapeRegExp, stripBlock } from './blocks';
import { FEATURES } from './features';
import { workbenchCssPath } from './workbench';
```

Append at the end of the file:

```ts
/**
 * Class names the Copilot chat blocks rely on; each must still appear as
 * `.name` in VS Code's workbench CSS, without this extension's blocks. Every
 * class css/copilot-theme.css and css/copilot-rtl.css name is here, and
 * nothing else (src/test/copilot-css.test.ts checks that).
 */
export const REQUIRED_CHAT_CLASSES: readonly string[] = [
  // the scope: dark themes, the chat view or editor tab, not inline chat
  'monaco-workbench',
  'vs-dark',
  'chat-viewpane',
  'editor-instance',
  'interactive-session',
  'chat-widget',
  // the conversation
  'interactive-list',
  'interactive-item-container',
  'interactive-request',
  'interactive-response',
  'value',
  'rendered-markdown',
  'interactive-result-code-block',
  'chat-inline-anchor-widget',
  'chat-codeblock-pill-container',
  // activity
  'chat-used-context',
  'chat-used-context-label',
  'chat-tool-invocation-part',
  'chat-terminal-content-part',
  'progress-container',
  // the composer
  'interactive-input-part',
  'chat-input-container',
  'chat-input-toolbars',
  'chat-input-toolbar',
  'chat-execute-toolbar',
  'chat-secondary-toolbar',
  'monaco-action-bar',
  'actions-container',
  'action-item',
  'action-label',
  'menu-entry',
  'codicon',
  'chat-input-picker-item',
  'chat-input-picker-split',
  'chat-input-picker-split-button',
  'chat-submit-button',
];

export interface WorkbenchHealthReport {
  /** The workbench CSS could not be read; nothing in it was checked. */
  unreadable: boolean;
  missingClasses: string[];
}

/**
 * Checks VS Code's workbench CSS, given without this extension's blocks (they
 * name the same classes); null stands for a file that could not be read.
 */
export function checkWorkbenchHealth(css: string | null): WorkbenchHealthReport {
  if (css === null) {
    return { unreadable: true, missingClasses: [] };
  }
  return {
    unreadable: false,
    missingClasses: REQUIRED_CHAT_CLASSES.filter((name) => !new RegExp(`\\.${escapeRegExp(name)}(?![\\w-])`).test(css)),
  };
}

export function isWorkbenchHealthy(report: WorkbenchHealthReport): boolean {
  return !report.unreadable && report.missingClasses.length === 0;
}

/** Never rejects. Reads the workbench CSS at appRoot and checks it without this extension's blocks. */
export async function checkWorkbenchInstallHealth(appRoot: string): Promise<WorkbenchHealthReport> {
  const css = await fs.promises.readFile(workbenchCssPath(appRoot), 'utf8').catch(() => null);
  if (css === null) {
    return checkWorkbenchHealth(null);
  }
  let pristine = css;
  for (const feature of FEATURES) {
    pristine = stripBlock(pristine, feature.blocks.workbench.markers);
  }
  return checkWorkbenchHealth(pristine);
}

/** The warning for an unhealthy workbench CSS; empty for a healthy one. */
export function formatWorkbenchHealthWarning(version: string, report: WorkbenchHealthReport): string {
  if (isWorkbenchHealthy(report)) {
    return '';
  }
  if (report.unreadable) {
    return `BiDi Theme: could not read the workbench CSS of VS Code ${version}, so the Copilot chat theme was not checked.`;
  }
  return `BiDi Theme: VS Code ${version} changed its chat markup, so parts of the Copilot chat theme may not apply. ` +
    `Missing: ${report.missingClasses.map((name) => `.${name}`).join(', ')}.`;
}
```

- [ ] **Step 4: Run the tests to see which still fail**

Run: `npm test 2>&1 | grep -E "passing|failing" `
Expected: 9 failing: every test in the `copilot-theme.css` suites and the coverage suite, with `ENOENT … css/copilot-theme.css`. The 8 new health tests pass.

- [ ] **Step 5: Create `css/copilot-theme.css`**

```css
/* Warm reading theme for VS Code's chat, where Copilot runs: dark themes only.
   The chat's class names are stable (interactive-session, chat-input-container…).
   It styles the chat view (side bar, panel) and the chat editor tab, not
   inline chat (.chat-widget) or quick chat. Rules (enforced by
   src/test/copilot-css.test.ts): every selector starts with
   .monaco-workbench.vs-dark :is(.chat-viewpane,.editor-instance)
   .interactive-session:not(.chat-widget>.interactive-session), only
   @font-face at top level, and no direction, text-align or unicode-bidi
   (those belong to css/copilot-rtl.css). VS Code measures some of the chat in JS, so those parts
   keep their native size: the input editor's font and line height, the input
   part's horizontal margins (up to its 950px layout width) and the input box's
   horizontal padding and border. The font files sit next to the workbench CSS. */

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

/* Palette. VS Code's theme defines its tokens on .monaco-workbench, so
   redefining them here gives every part of the chat these values. The list
   rows paint with the side bar color; parts of the chat in an editor tab use
   the editor color. Messages span the whole view instead of the native 950px
   column. */
.monaco-workbench.vs-dark :is(.chat-viewpane,.editor-instance) .interactive-session:not(.chat-widget>.interactive-session){
--vscode-chat-font-family:"BiDi Rubik",-apple-system,BlinkMacSystemFont,system-ui,sans-serif;
--vscode-sideBar-background:#1b1a18;
--vscode-editor-background:#1b1a18;
--vscode-foreground:#ebe5da;
--vscode-descriptionForeground:#a39d92;
--vscode-icon-foreground:#cfc6b7;
--vscode-widget-border:#3b362f;
--vscode-toolbar-hoverBackground:#2a2622;
--vscode-chat-requestBackground:#262320;
--vscode-chat-requestBubbleBackground:#262320;
--vscode-chat-requestBubbleHoverBackground:#2a2622;
--vscode-chat-requestBorder:#3b362f;
--vscode-chat-requestCodeBorder:#3b362f;
--vscode-textLink-foreground:#e8a07f;
--vscode-textLink-activeForeground:#f2b896;
--vscode-textPreformat-foreground:#f2b896;
--vscode-textPreformat-background:#2b2824;
--vscode-textBlockQuote-background:#211f1c;
--vscode-textBlockQuote-border:#d97757;
--vscode-focusBorder:#d97757;
max-width:none;
background:#1b1a18;
}
/* VS Code writes three resolved colors and the 13px chat font size inline on
   .interactive-session; the list redefines them for the conversation. */
.monaco-workbench.vs-dark :is(.chat-viewpane,.editor-instance) .interactive-session:not(.chat-widget>.interactive-session) .interactive-list{
--vscode-interactive-session-foreground:#ebe5da;
--vscode-chat-list-background:#1b1a18;
--vscode-interactive-result-editor-background-color:#121110;
font-size:15px;
}

/* Your messages: a full-width soft block with an accent bar where the text starts. */
.monaco-workbench.vs-dark :is(.chat-viewpane,.editor-instance) .interactive-session:not(.chat-widget>.interactive-session) .interactive-item-container.interactive-request .value .rendered-markdown{
width:100%;
max-width:none;
margin-left:0;
box-sizing:border-box;
color:#f5f0e8;
border-inline-start:3px solid #d97757;
border-radius:14px;
padding:12px 16px;
}
.monaco-workbench.vs-dark :is(.chat-viewpane,.editor-instance) .interactive-session:not(.chat-widget>.interactive-session) .interactive-item-container.interactive-request .value>.rendered-markdown p{
width:auto;
}

/* Copilot's markdown. */
.monaco-workbench.vs-dark :is(.chat-viewpane,.editor-instance) .interactive-session:not(.chat-widget>.interactive-session) .interactive-item-container .value .rendered-markdown{
line-height:1.75;
}
.monaco-workbench.vs-dark :is(.chat-viewpane,.editor-instance) .interactive-session:not(.chat-widget>.interactive-session) .interactive-item-container .value>.rendered-markdown>p{
margin:0 0 12px;
}
.monaco-workbench.vs-dark :is(.chat-viewpane,.editor-instance) .interactive-session:not(.chat-widget>.interactive-session) .interactive-item-container .value .rendered-markdown h1,
.monaco-workbench.vs-dark :is(.chat-viewpane,.editor-instance) .interactive-session:not(.chat-widget>.interactive-session) .interactive-item-container .value .rendered-markdown h2,
.monaco-workbench.vs-dark :is(.chat-viewpane,.editor-instance) .interactive-session:not(.chat-widget>.interactive-session) .interactive-item-container .value .rendered-markdown h3{
font-weight:600;
color:#f5f0e8;
}
.monaco-workbench.vs-dark :is(.chat-viewpane,.editor-instance) .interactive-session:not(.chat-widget>.interactive-session) .interactive-item-container .value .rendered-markdown h1{
font-size:20px;
}
.monaco-workbench.vs-dark :is(.chat-viewpane,.editor-instance) .interactive-session:not(.chat-widget>.interactive-session) .interactive-item-container .value .rendered-markdown h2{
font-size:18px;
}
.monaco-workbench.vs-dark :is(.chat-viewpane,.editor-instance) .interactive-session:not(.chat-widget>.interactive-session) .interactive-item-container .value .rendered-markdown h3{
font-size:16px;
}
.monaco-workbench.vs-dark :is(.chat-viewpane,.editor-instance) .interactive-session:not(.chat-widget>.interactive-session) .interactive-item-container .value .rendered-markdown li::marker{
color:#d97757;
}
/* Code blocks: the block and the editor inside it both read the medium radius. */
.monaco-workbench.vs-dark :is(.chat-viewpane,.editor-instance) .interactive-session:not(.chat-widget>.interactive-session) .interactive-response .interactive-result-code-block{
--vscode-cornerRadius-medium:12px;
border-color:#2b2824;
border-radius:12px;
}

/* Activity: auto-routing, references, thinking with its grouped tool calls,
   and tool calls or terminal commands on their own, each in a quiet box. */
.monaco-workbench.vs-dark :is(.chat-viewpane,.editor-instance) .interactive-session:not(.chat-widget>.interactive-session) .interactive-response .value>.chat-used-context,
.monaco-workbench.vs-dark :is(.chat-viewpane,.editor-instance) .interactive-session:not(.chat-widget>.interactive-session) .interactive-response .value>.chat-tool-invocation-part,
.monaco-workbench.vs-dark :is(.chat-viewpane,.editor-instance) .interactive-session:not(.chat-widget>.interactive-session) .interactive-response .value>.chat-terminal-content-part{
--vscode-chat-font-size-body-xs:11.5px;
--vscode-chat-font-size-body-s:12.5px;
--vscode-chat-font-size-body-m:12.5px;
--vscode-descriptionForeground:#968f83;
--vscode-foreground:#cfc6b7;
--vscode-interactive-session-foreground:#cfc6b7;
--vscode-chat-requestBorder:#2b2824;
background:#211f1c;
border:1px solid #2b2824;
border-radius:12px;
padding:6px 12px;
color:#968f83;
}
.monaco-workbench.vs-dark :is(.chat-viewpane,.editor-instance) .interactive-session:not(.chat-widget>.interactive-session) .interactive-response .value>.chat-used-context{
margin-bottom:12px;
}

/* Composer: a rounder box with the accent as its focus color, a 34px
   toolbar, attach on the left, the pickers next to send on the right. */
.monaco-workbench.vs-dark :is(.chat-viewpane,.editor-instance) .interactive-session:not(.chat-widget>.interactive-session) .interactive-input-part{
--chat-input-radius:18px;
margin-inline:max(12px,calc((100% - 926px) / 2));
}
.monaco-workbench.vs-dark :is(.chat-viewpane,.editor-instance) .interactive-session:not(.chat-widget>.interactive-session) .chat-input-container{
--vscode-input-background:#242120;
--vscode-input-border:#736a5d;
--vscode-input-foreground:#f5f0e8;
--vscode-input-placeholderForeground:#9a9387;
}
.monaco-workbench.vs-dark :is(.chat-viewpane,.editor-instance) .interactive-session:not(.chat-widget>.interactive-session) .chat-input-toolbars{
--chat-input-control-height:34px;
--vscode-codiconFontSize-compact:16px;
}
.monaco-workbench.vs-dark :is(.chat-viewpane,.editor-instance) .interactive-session:not(.chat-widget>.interactive-session) .chat-input-toolbars>.chat-input-toolbar .actions-container{
justify-content:flex-end;
}
.monaco-workbench.vs-dark :is(.chat-viewpane,.editor-instance) .interactive-session:not(.chat-widget>.interactive-session) .chat-input-toolbars>.chat-input-toolbar .actions-container>.action-item.menu-entry:first-child{
margin-right:auto;
}
/* Attach (+) and the other icon buttons: 36x34, attach filled as in Claude Code. */
.monaco-workbench.vs-dark :is(.chat-viewpane,.editor-instance) .interactive-session:not(.chat-widget>.interactive-session) .chat-input-toolbars .action-item.menu-entry:not(.chat-submit-button)>.action-label.codicon,
.monaco-workbench.vs-dark :is(.chat-viewpane,.editor-instance) .interactive-session:not(.chat-widget>.interactive-session) .chat-input-toolbars>.chat-execute-toolbar .action-item:not(.chat-submit-button)>.action-label{
box-sizing:border-box;
width:36px;
height:34px;
border-radius:11px;
justify-content:center;
}
.monaco-workbench.vs-dark :is(.chat-viewpane,.editor-instance) .interactive-session:not(.chat-widget>.interactive-session) .chat-input-toolbars>.chat-input-toolbar .actions-container>.action-item.menu-entry:first-child>.action-label{
background:#2f2b26;
}
.monaco-workbench.vs-dark :is(.chat-viewpane,.editor-instance) .interactive-session:not(.chat-widget>.interactive-session) .chat-input-toolbars>.chat-input-toolbar .actions-container>.action-item.menu-entry:first-child>.action-label:hover{
background:#38332c;
}
/* The mode and model pickers: 34px ghost pills with 15px text. */
.monaco-workbench.vs-dark :is(.chat-viewpane,.editor-instance) .interactive-session:not(.chat-widget>.interactive-session) .chat-input-toolbar .chat-input-picker-item .action-label{
padding:0 12px;
border:1px solid #453e35;
border-radius:11px;
background:transparent;
font-size:15px;
color:#ddd4c6;
}
.monaco-workbench.vs-dark :is(.chat-viewpane,.editor-instance) .interactive-session:not(.chat-widget>.interactive-session) .chat-input-toolbar .chat-input-picker-item .action-label:hover{
background:#2a2622;
}
/* The model picker is a split button: the model and its setting (Balance)
   are two buttons inside one pill. */
.monaco-workbench.vs-dark :is(.chat-viewpane,.editor-instance) .interactive-session:not(.chat-widget>.interactive-session) .chat-input-toolbar .chat-input-picker-item .action-label.chat-input-picker-split{
padding:0;
}
.monaco-workbench.vs-dark :is(.chat-viewpane,.editor-instance) .interactive-session:not(.chat-widget>.interactive-session) .chat-input-toolbar .chat-input-picker-split>.chat-input-picker-split-button{
height:100%;
padding:0 12px;
border-radius:10px;
font-size:15px;
}
.monaco-workbench.vs-dark :is(.chat-viewpane,.editor-instance) .interactive-session:not(.chat-widget>.interactive-session) .chat-input-toolbars>.chat-execute-toolbar .monaco-action-bar .action-item.chat-submit-button>.action-label{
--vscode-button-background:#c6613f;
--vscode-button-hoverBackground:#d97757;
--vscode-button-foreground:#faf9f5;
width:40px;
height:40px;
}
.monaco-workbench.vs-dark :is(.chat-viewpane,.editor-instance) .interactive-session:not(.chat-widget>.interactive-session) .chat-secondary-toolbar{
--vscode-icon-foreground:#a39d92;
}
```

- [ ] **Step 6: Run the tests to verify they pass**

Run: `npm test 2>&1 | tail -4`
Expected: PASS, `177 passing` (17 new), 0 failing.

- [ ] **Step 7: Check the classes against the real VS Code, read-only**

Run:
```bash
node -e "
const {checkWorkbenchInstallHealth,formatWorkbenchHealthWarning}=require('./out/health');
checkWorkbenchInstallHealth('/Applications/Visual Studio Code - Insiders 2.app/Contents/Resources/app')
  .then((r)=>console.log(formatWorkbenchHealthWarning('installed',r)||'all 36 chat classes found'));"
```
Expected: `all 36 chat classes found`.

- [ ] **Step 8: Commit**

```bash
git add src/health.ts src/test/health.test.ts src/test/copilot-css.test.ts css/copilot-theme.css
git commit -m "feat: warm theme block for VS Code's Copilot chat, with its health check

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 6: The Copilot chat fixture

**Files:**
- Create: `scripts/fixture-lib.js` (shared by both fixtures)
- Modify: `scripts/render-fixture.js:1-174` and its render loop (use the lib)
- Create: `scripts/fixture/chat.html`
- Create: `scripts/render-chat-fixture.js`
- Modify: `package.json` (`fixture:chat` script)

**Interfaces:**
- Consumes:
  - `computeSyncedCss(content, enabled, bodies, target)` and `loadBlockBodies(root, target)` (Task 1)
  - `THEME.blocks.workbench.assets` (Task 1)
  - `workbenchCssPath(appRoot)` (Task 3)
  - `checkWorkbenchHealth`, `isWorkbenchHealthy` and `formatWorkbenchHealthWarning` (Task 5)
  - both Copilot CSS files (Tasks 4–5)
- Produces:
  - `scripts/fixture-lib.js` exports `CHROME`, `serve(dir)`, `missingClasses(page, css)` and `renderReport(url, shot, size, profile, label)`.
  - `npm run fixture:chat -- "<VS Code app root>"` renders and checks the chat. It exits 0 when every check passes.

Background for this task: the fixture reproduces VS Code 1.143's chat-view DOM:
- a Hebrew and an English request;
- a response with auto-routing, references, a thinking box holding grouped tool calls and a terminal command, markdown, a code block and a status line;
- the input part with its toolbars.

It is served from a temp folder with the real workbench CSS (with both blocks synced) and the fonts, and rendered in headless Chrome twice: with `vs-dark` and with `vs`. The page measures itself and leaves a JSON report in `data-report`, which the script checks. Nothing under `/Applications` is written; the installed CSS is only read.

- [ ] **Step 1: Create `scripts/fixture-lib.js`**

It is the server, the PNG check and the Chrome runner from `scripts/render-fixture.js`, unchanged except that the window size moved out of the shared flags, plus `renderReport`:

```js
// What the fixture renderers share: a local HTTP server for the page and its CSS and fonts,
// headless Chrome runs that end as soon as their output is complete, and the check that a
// fixture page uses only classes the stylesheet under test defines.
// Set CHROME_PATH when Chrome is not at the default macOS location.
'use strict';
const fs = require('fs');
const path = require('path');
const http = require('http');
const { spawn } = require('child_process');

const CHROME = process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
// Flags for every Chrome call. Callers add the window size, so a DOM dump measures the same
// viewport as the screenshot.
const CHROME_FLAGS = ['--headless=new', '--disable-gpu', '--hide-scrollbars', '--virtual-time-budget=5000'];
const CHROME_TIMEOUT_MS = 20000;
const CHROME_POLL_MS = 200;
const PNG_END = Buffer.from('49454e44ae426082', 'hex'); // IEND chunk type + CRC: the last 8 bytes of every PNG
const TYPES = { '.html': 'text/html; charset=utf-8', '.css': 'text/css', '.woff2': 'font/woff2' };

function serve(dir) {
  const server = http.createServer((req, res) => {
    let name;
    try {
      name = path.basename(decodeURIComponent(req.url.split('?')[0]));
    } catch {
      res.writeHead(400); // a malformed %-escape
      res.end();
      return;
    }
    const file = path.join(dir, name);
    fs.readFile(file, (err, body) => {
      if (err) {
        res.writeHead(404);
        res.end();
        return;
      }
      res.writeHead(200, { 'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream' });
      res.end(body);
    });
  });
  return new Promise((resolve) => server.listen(0, '127.0.0.1', () => resolve(server)));
}

// A screenshot is complete once the file ends with the PNG IEND trailer.
function pngIsComplete(file) {
  let fd;
  try {
    fd = fs.openSync(file, 'r');
    const { size } = fs.fstatSync(fd);
    const tail = Buffer.alloc(PNG_END.length);
    return (
      size >= tail.length &&
      fs.readSync(fd, tail, 0, tail.length, size - tail.length) === tail.length &&
      tail.equals(PNG_END)
    );
  } catch (err) {
    if (err.code === 'ENOENT') {
      return false; // Chrome has not created the file yet
    }
    throw err;
  } finally {
    if (fd !== undefined) {
      fs.closeSync(fd);
    }
  }
}

// Runs Chrome and resolves with its stdout as soon as isDone(stdout) is true. Headless Chrome can
// stay alive after its output is ready, so waiting for it to exit would wait out a timeout and a
// hung Chrome would look like a success. Chrome is killed as soon as the output is complete
// instead, and the call rejects if Chrome cannot start, exits before the output is complete, or
// is not done in time. Chrome has exited by the time the promise settles. `what` names the call
// in error messages.
function chrome(args, isDone, what) {
  return new Promise((resolve, reject) => {
    const child = spawn(CHROME, [...CHROME_FLAGS, ...args], { stdio: ['ignore', 'pipe', 'pipe'] });
    child.stdout.setEncoding('utf8');
    child.stderr.setEncoding('utf8');
    let stdout = '';
    let stderr = '';
    let decided = false; // success or failure is known; the promise settles once Chrome is gone
    let error = null;
    let gone = false; // the Chrome process has exited, or never started
    const failure = (message) => {
      const tail = stderr.trim().slice(-500);
      return new Error(tail ? `${message}\nlast Chrome stderr: ${tail}` : message);
    };
    const settle = () => (error ? reject(error) : resolve(stdout));
    const decide = (err) => {
      if (decided) {
        return;
      }
      decided = true;
      error = err || null;
      clearInterval(pollTimer);
      clearTimeout(deadline);
      if (gone) {
        settle();
      } else {
        child.kill('SIGKILL'); // the 'exit' handler settles
      }
    };
    const poll = () => {
      if (decided) {
        return;
      }
      try {
        if (isDone(stdout)) {
          decide();
        }
      } catch (err) {
        decide(err);
      }
    };
    const pollTimer = setInterval(poll, CHROME_POLL_MS);
    const deadline = setTimeout(
      () => decide(failure(`Chrome timed out after ${CHROME_TIMEOUT_MS / 1000}s (${what})`)),
      CHROME_TIMEOUT_MS
    );

    child.stdout.on('data', (chunk) => {
      stdout += chunk;
      poll();
    });
    child.stderr.on('data', (chunk) => {
      stderr = (stderr + chunk).slice(-4000);
    });
    child.on('error', (err) => {
      gone = gone || child.pid === undefined; // it never started
      decide(new Error(`could not run Chrome (${CHROME}): ${err.message}`));
    });
    child.on('exit', () => {
      gone = true;
      if (decided) {
        settle();
      }
    });
    child.on('close', (code, signal) => {
      // Chrome ended by itself, so all of its output is in: it may have finished before the next poll.
      poll();
      const how = signal ? `signal ${signal}` : `code ${code}`;
      decide(failure(`Chrome exited (${how}) before its output was complete (${what})`));
    });
  });
}

// The class names in a fixture page that the given CSS does not define: a sign that the fixture
// no longer matches what the app renders. Placeholders like __THEME_CLASS__ are skipped.
function missingClasses(page, css) {
  const names = new Set();
  for (const [, list] of page.matchAll(/class="([^"]*)"/g)) {
    for (const name of list.split(/\s+/)) {
      if (name && !name.startsWith('__')) {
        names.add(name);
      }
    }
  }
  const defined = (name) => new RegExp(`\\.${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?![\\w-])`).test(css);
  return [...names].filter((name) => !defined(name));
}

// Renders `url` to a screenshot at `shot` and returns the JSON report the page leaves in
// data-report on its body. `size` is the window size, e.g. '1100,900'; `profile()` returns a
// fresh --user-data-dir flag for each Chrome run.
async function renderReport(url, shot, size, profile, label) {
  fs.rmSync(shot, { force: true }); // a PNG left by an earlier run must not pass for this one
  const window = `--window-size=${size}`;
  await chrome([profile(), window, `--screenshot=${shot}`, url], () => pngIsComplete(shot), `${label} screenshot, expected a complete PNG at ${shot}`);
  const dom = await chrome([profile(), window, '--dump-dom', url], (stdout) => stdout.includes('</html>'), `${label} DOM dump, expected </html> on stdout`);
  const match = /data-report="([^"]*)"/.exec(dom);
  if (!match) {
    throw new Error(`${label}: the page did not produce a report`);
  }
  return JSON.parse(match[1].replace(/&quot;/g, '"').replace(/&amp;/g, '&'));
}

module.exports = { CHROME, missingClasses, renderReport, serve };
```

- [ ] **Step 2: Make `scripts/render-fixture.js` use it**

Replace everything from the first line down to (not including) the line `function check(mode, r) {` with:

```js
// Renders scripts/fixture/panel.html against a real Claude Code index.css with
// both blocks synced, in dark and light mode, checks computed styles and saves
// screenshots. Usage: node scripts/render-fixture.js <claude-code-extension-dir> [out-dir]
// Set CHROME_PATH when Chrome is not at the default macOS location.
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const { CHROME, missingClasses, renderReport, serve } = require('./fixture-lib');
const { computeSyncedCss, loadBlockBodies } = require('../out/sync');
const { THEME } = require('../out/features');
const { checkInstallHealth, formatHealthWarning, isHealthy } = require('../out/health');

const ROOT = path.join(__dirname, '..');
const SIZE = '1100,900';
const USAGE = `usage: node scripts/render-fixture.js <claude-code-extension-dir> [out-dir]
Chrome: ${CHROME} (set CHROME_PATH to use another)`;
```

That removes the file's own `serve`, `pngIsComplete`, `chrome` and `missingClasses`. Then, in `main()`, replace the body of the `for (const mode of ['dark', 'light'])` loop that renders (from `      const url = \`${base}/${mode}.html\`;` through `      const report = JSON.parse(…);`) with:

```js
      const shot = path.join(outDir, `fixture-${mode}.png`);
      const report = await renderReport(`${base}/${mode}.html`, shot, SIZE, profile, mode);
```

Keep the lines from `const problems = check(mode, report);` to the end of the loop as they are.

Run: `npm run fixture -- "$(ls -d ~/.vscode-insiders/extensions/anthropic.claude-code-* | tail -1)" 2>&1 | tail -4`
Expected: `health check: ok`, `dark: ok`, `light: ok`. This is the Claude Code fixture, unchanged in behavior.

- [ ] **Step 3: Create `scripts/fixture/chat.html`**

```html
<!doctype html>
<!-- The Copilot chat fixture. scripts/render-chat-fixture.js serves it twice against VS Code's real
     workbench.desktop.main.css with both blocks synced: with the workbench class vs-dark, and with vs
     to check that none of the theme applies there (RTL applies in every theme). Both pages keep the
     Dark Modern values below, so the light page checks the theme's scoping only, not how a light
     theme looks. The markup follows VS Code 1.143's chat view: a request, a response with grouped
     tool calls, thinking, a terminal command, markdown and a code block, and the input part. The
     list rows flow here; VS Code positions them absolutely at heights it measures. Every class here
     must exist in the workbench CSS under test (the script checks). -->
<html>
<head>
<meta charset="utf-8">
<link rel="stylesheet" href="workbench.desktop.main.css">
<style>
/* What VS Code injects at runtime in <style> elements: theme colors (Dark Modern) and size tokens
   on .monaco-workbench, and the list's own row colors. */
.monaco-workbench{
--vscode-foreground:#cccccc;
--vscode-descriptionForeground:#9d9d9d;
--vscode-disabledForeground:#cccccc80;
--vscode-icon-foreground:#cccccc;
--vscode-focusBorder:#0078d4;
--vscode-sideBar-background:#181818;
--vscode-editor-background:#1f1f1f;
--vscode-editorWidget-background:#202020;
--vscode-widget-border:#313131;
--vscode-input-background:#313131;
--vscode-input-border:#3c3c3c;
--vscode-input-foreground:#cccccc;
--vscode-input-placeholderForeground:#989898;
--vscode-button-background:#0078d4;
--vscode-button-foreground:#ffffff;
--vscode-button-hoverBackground:#026ec1;
--vscode-toolbar-hoverBackground:#5a5d5e50;
--vscode-textLink-foreground:#4daafc;
--vscode-textLink-activeForeground:#4daafc;
--vscode-textPreformat-foreground:#d0d0d0;
--vscode-textPreformat-background:#3c3c3c;
--vscode-textCodeBlock-background:#2b2b2b;
--vscode-textBlockQuote-background:#2b2b2b;
--vscode-textBlockQuote-border:#616161;
--vscode-textSeparator-foreground:#21262d;
--vscode-chat-requestBubbleBackground:#264f784d;
--vscode-chat-requestBubbleHoverBackground:#264f7899;
--vscode-chat-requestBorder:#ffffff1a;
--vscode-chat-requestCodeBorder:#ffffff1a;
--vscode-chat-font-family:-apple-system,BlinkMacSystemFont,sans-serif;
--monaco-monospace-font:Menlo,Monaco,"Courier New",monospace;
--vscode-bodyFontSize:13px;
--vscode-codiconFontSize:16px;
--vscode-codiconFontSize-compact:12px;
--vscode-cornerRadius-circle:9999px;
--vscode-cornerRadius-large:8px;
--vscode-cornerRadius-medium:6px;
--vscode-cornerRadius-small:4px;
--vscode-cornerRadius-xLarge:12px;
--vscode-cornerRadius-xSmall:2px;
--vscode-fontSize-body1:13px;
--vscode-fontSize-label1:12px;
--vscode-fontSize-label2:11px;
--vscode-fontSize-label3:10px;
--vscode-fontWeight-semiBold:600;
--vscode-spacing-size20:2px;
--vscode-spacing-size40:4px;
--vscode-spacing-size60:6px;
--vscode-spacing-size80:8px;
--vscode-spacing-size100:10px;
--vscode-spacing-size120:12px;
--vscode-spacing-size160:16px;
--vscode-spacing-size200:20px;
--vscode-strokeThickness:1px;
}
/* VS Code's list styles target .monaco-list.list_id_N; the id is left out here. */
.interactive-list .monaco-list .monaco-list-rows{background:var(--vscode-sideBar-background)}
/* Fixture only: the page is the chat view, and the rows flow. */
html,body{height:100%;margin:0}
.monaco-workbench{height:100%;font-family:-apple-system,BlinkMacSystemFont,sans-serif;font-size:13px;color:var(--vscode-foreground);background:var(--vscode-sideBar-background)}
.chat-viewpane{height:100%;display:flex;flex-direction:column}
.monaco-list-row{position:relative!important}
</style>
</head>
<body>
<div class="monaco-workbench mac __THEME_CLASS__">
<div class="pane-body chat-viewpane">
<div class="chat-controls-container">
<div class="interactive-session" style="font-size: 13px; --vscode-interactive-session-foreground: #cccccc; --vscode-chat-list-background: #181818; --vscode-interactive-result-editor-background-color: #1f1f1f;">
<div class="interactive-list">
<div class="monaco-list mouse-support">
<div class="monaco-scrollable-element">
<div class="monaco-list-rows">

<div class="monaco-list-row request" data-index="0">
<div class="monaco-tl-row"><div class="monaco-tl-twistie"></div><div class="monaco-tl-contents">
<div class="interactive-item-container interactive-request" id="request-he">
<div class="header header-disabled"></div>
<div class="value">
<div class="chat-markdown-part rendered-markdown" id="bubble-he"><p id="request-he-text">תסביר לי מה עושה הפונקציה <code>syncInstall</code> ולמה היא כותבת קודם את הגופנים</p></div>
</div>
</div>
</div></div>
</div>

<div class="monaco-list-row response" data-index="1">
<div class="monaco-tl-row"><div class="monaco-tl-twistie"></div><div class="monaco-tl-contents">
<div class="interactive-item-container interactive-response chat-persistent-progress chat-most-recent-response" id="response">
<div class="header"><div class="user"><div class="avatar-container hidden"></div><h3 class="username hidden">GitHub Copilot</h3></div><span class="detail-container"><span class="detail"></span></span></div>
<div class="value">
<div class="chat-used-context chat-thinking-box chat-collapsible-not-expandable" id="auto-route"><div class="chat-used-context-label"><div class="monaco-button monaco-icon-button monaco-text-button"><div class="codicon codicon-check"></div><span class="monaco-button-mdlabel">Auto routed task to GPT-5 mini</span></div></div></div>
<div class="chat-used-context chat-used-context-collapsed" id="references"><div class="chat-used-context-label"><div class="monaco-button monaco-icon-button monaco-text-button"><span class="monaco-button-mdlabel">Used 2 references</span><span class="codicon chat-collapsible-hover-chevron"></span></div></div><div class="chat-used-context-list"></div></div>
<div class="chat-used-context chat-thinking-box chat-tool-chain" id="tool-chain">
<div class="chat-used-context-label"><div class="monaco-button monaco-icon-button monaco-text-button"><span class="monaco-button-mdlabel" id="tool-chain-title">Read 2 files, ran 1 command</span></div></div>
<div class="chat-used-context-list chat-thinking-collapsible">
<div class="chat-thinking-item markdown-content" id="thinking-text"><div class="rendered-markdown"><p>I should read sync.ts first, then check where the fonts are copied.</p></div></div>
<div class="chat-thinking-tool-wrapper"><span class="chat-thinking-icon codicon"></span><div class="chat-tool-invocation-part" id="tool-read"><div class="progress-container"><div class="codicon codicon-check"></div><div class="rendered-markdown progress-step"><p>Read <span class="chat-inline-anchor-widget">sync.ts</span>, lines 1 to 111</p></div></div></div></div>
<div class="chat-thinking-tool-wrapper"><span class="chat-thinking-icon codicon codicon-terminal"></span><div class="chat-used-context chat-terminal-thinking-collapsible"><div class="chat-used-context-list chat-terminal-thinking-content"><div class="chat-terminal-content-part" id="terminal"><div class="chat-terminal-content-title"><div class="chat-terminal-command-block"><div class="rendered-markdown"><p><code>npm test</code></p></div></div></div></div></div></div></div>
</div>
</div>
<div class="chat-markdown-part rendered-markdown" id="answer">
<h2 id="answer-h2">מה הפונקציה עושה</h2>
<p id="answer-he">הפונקציה מביאה את קובץ ה־CSS של Claude Code למצב שמתאים למודולים שמופעלים, ואז מעתיקה את <code id="inline-code">rubik-hebrew.woff2</code> לתיקייה.</p>
<p id="answer-en">In short: fonts are copied before the CSS is written, so the CSS never points at a missing font.</p>
<ul id="answer-list"><li id="li-he">קודם הגופנים</li><li id="li-en">Then the CSS, atomically</li></ul>
<div class="code" data-code="0"><div class="interactive-result-code-block" id="code-block"><div class="interactive-result-editor"><div class="monaco-editor" style="width:100%;height:42px"><div class="overflow-guard" style="width:100%;height:42px;padding:12px 16px;box-sizing:border-box"><div class="monaco-editor-background"></div><div class="lines-content"><div class="view-lines" style="font-family:Menlo,monospace;font-size:12px;line-height:18px"><div class="view-line"><span><span class="mtk1">await syncInstall(dir, root, enabled);</span></span></div></div></div></div></div></div></div></div>
<p><a href="#" id="link">Read more</a></p>
</div>
<div class="progress-container chat-working-progress" id="progress"><div class="codicon codicon-loading"></div><div class="rendered-markdown progress-step"><p>Working</p></div></div>
</div>
</div>
</div></div>
</div>

<div class="monaco-list-row request" data-index="2">
<div class="monaco-tl-row"><div class="monaco-tl-twistie"></div><div class="monaco-tl-contents">
<div class="interactive-item-container interactive-request" id="request-en">
<div class="header header-disabled"></div>
<div class="value">
<div class="chat-markdown-part rendered-markdown" id="bubble-en"><p id="request-en-text">Now explain cleanup.ts in English.</p></div>
</div>
</div>
</div></div>
</div>

</div>
</div>
</div>
</div>

<div class="interactive-input-part chat-input-surface-stack" id="input-part">
<div class="chat-input-stack">
<div class="interactive-input-and-side-toolbar">
<div class="chat-input-container focused" id="input-box">
<div class="chat-attachments-container"><div class="chat-attached-context"></div></div>
<div class="chat-editor-container"><div class="interactive-input-editor"><div class="monaco-editor" id="input-editor" style="width:100%;height:44px"><div class="overflow-guard" style="width:100%;height:44px"><div class="monaco-editor-background"></div><div class="lines-content"><div class="view-lines" style="font-family:-apple-system,BlinkMacSystemFont,sans-serif;font-size:13px;line-height:20px;padding-top:12px"><div class="view-line"><span><span class="mtk1" id="input-text">ובדוק גם את uninstall.ts</span></span></div></div></div></div></div></div></div>
<div class="chat-input-toolbars" id="toolbars">
<div class="monaco-toolbar chat-input-toolbar responsive" id="input-toolbar"><div class="monaco-action-bar"><ul class="actions-container">
<li class="action-item menu-entry" id="attach"><a class="action-label codicon codicon-add-compact" role="button" aria-label="Add Context"></a></li>
<li class="action-item chat-input-picker-item" id="mode-picker"><a class="action-label" role="button"><span class="codicon"></span><span class="chat-input-picker-label">Agent</span><span class="codicon codicon-chevron-down"></span></a></li>
<li class="action-item chat-input-picker-item model-picker-item" id="model-picker"><div class="action-label model-picker-split chat-input-picker-split" role="group"><a class="chat-input-picker-split-button model-picker-section model-picker-name" role="button" id="model-name"><span class="chat-input-picker-label">Auto</span><span class="codicon codicon-chevron-down"></span></a><a class="chat-input-picker-split-button chat-input-picker-split-secondary model-picker-section model-picker-config model-picker-config-summary" role="button" id="model-config">Balance</a></div></li>
</ul></div></div>
<div class="monaco-toolbar chat-execute-toolbar" id="execute-toolbar"><div class="monaco-action-bar"><ul class="actions-container">
<li class="action-item" id="mic"><a class="action-label codicon codicon-mic-compact" role="button" aria-label="Voice"></a></li>
<li class="action-item menu-entry chat-submit-button" id="send-item"><a class="action-label codicon codicon-arrow-up-compact" role="button" aria-label="Send" id="send"></a></li>
</ul></div></div>
</div>
</div>
</div>
</div>
<div class="chat-secondary-toolbar" id="secondary-toolbar">
<div class="chat-responsive-picker-container"><div class="monaco-toolbar chat-secondary-input-toolbar"><div class="monaco-action-bar"><ul class="actions-container">
<li class="action-item chat-input-picker-item" id="permissions-picker"><a class="action-label" role="button"><span class="chat-input-picker-label">Manual permissions</span></a></li>
</ul></div></div></div>
</div>
</div>

</div>
</div>
</div>
</div>
<script>
document.fonts.ready.then(() => {
  const q = (s) => document.querySelector(s);
  const cs = (s, pseudo) => getComputedStyle(q(s), pseudo);
  const rect = (s) => q(s).getBoundingClientRect();
  const width = (s) => Math.round(rect(s).width);
  const pill = (s) => {
    const style = cs(`${s} > .action-label`);
    return {
      height: Math.round(q(`${s} > .action-label`).getBoundingClientRect().height),
      background: style.backgroundColor,
      border: `${style.borderTopWidth} ${style.borderTopStyle} ${style.borderTopColor}`,
      radius: style.borderTopLeftRadius,
      size: style.fontSize,
    };
  };
  const report = {
    fontsLoaded: [...document.fonts].filter((f) => f.family.replace(/"/g, '') === 'BiDi Rubik' && f.status === 'loaded').length,
    textFont: cs('#answer-en').fontFamily,
    textSize: cs('#answer-en').fontSize,
    lineHeight: cs('#answer-en').lineHeight,
    textColor: cs('#answer-en').color,
    h2: `${cs('#answer-h2').fontSize} ${cs('#answer-h2').fontWeight} ${cs('#answer-h2').color}`,
    marker: cs('#li-en', '::marker').color,
    link: cs('#link').color,
    inlineCode: `${cs('#inline-code').backgroundColor} / ${cs('#inline-code').color}`,
    codeBlock: `${cs('#code-block').backgroundColor} ${cs('#code-block').borderTopLeftRadius}`,
    listBg: cs('.monaco-list-rows').backgroundColor,
    sessionBg: cs('.interactive-session').backgroundColor,
    sessionWidth: width('.interactive-session'),
    viewportWidth: document.documentElement.clientWidth,
    userBg: cs('#bubble-he').backgroundColor,
    userColor: cs('#request-he-text').color,
    userRadius: cs('#bubble-he').borderTopLeftRadius,
    userBar: `${cs('#bubble-he').borderInlineStartWidth} ${cs('#bubble-he').borderInlineStartStyle} ${cs('#bubble-he').borderInlineStartColor}`,
    userWidth: width('#bubble-en'),
    requestContentWidth: (() => {
      const el = q('#request-en');
      const style = getComputedStyle(el);
      return Math.round(el.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight));
    })(),
    activity: `${cs('#tool-chain').backgroundColor} ${cs('#tool-chain').borderTopWidth} ${cs('#tool-chain').borderTopColor} ${cs('#tool-chain').borderTopLeftRadius}`,
    activityText: `${cs('#tool-read .progress-step p').fontSize} ${cs('#tool-read .progress-step p').color}`,
    toolTitle: cs('#tool-chain-title').color,
    inputPartWidth: width('#input-part'),
    inputBox: `${cs('#input-box').backgroundColor} ${cs('#input-box').borderTopColor} ${cs('#input-box').borderTopLeftRadius}`,
    inputEditorBg: cs('#input-editor').backgroundColor,
    inputTextSize: cs('#input-editor .view-lines').fontSize,
    attach: (() => { const r = q('#attach > .action-label').getBoundingClientRect(); return `${Math.round(r.width)}x${Math.round(r.height)}`; })(),
    attachLeft: Math.round(rect('#attach').left - rect('#input-box').left),
    modePicker: pill('#mode-picker'),
    modelPicker: pill('#model-picker'),
    pickersRight: Math.round(rect('#execute-toolbar').left - rect('#model-picker').right),
    send: `${width('#send')}x${Math.round(rect('#send').height)} ${cs('#send').backgroundColor} ${cs('#send').color} ${cs('#send').borderTopLeftRadius}`,
    secondaryColor: cs('#permissions-picker > .action-label').color,
    dirAnswerHe: cs('#answer-he').direction,
    alignAnswerHe: Math.round(rect('#answer-he').right - rect('#answer').right),
    dirRequestHe: cs('#request-he-text').direction,
    dirCode: cs('#code-block').direction,
    dirTool: cs('#tool-read').direction,
    dirToolbar: cs('#toolbars').direction,
    bidiAnswerEn: cs('#answer-en').unicodeBidi,
  };
  document.body.setAttribute('data-report', JSON.stringify(report));
});
</script>
</body>
</html>
```

- [ ] **Step 4: Create `scripts/render-chat-fixture.js`**

```js
// Renders scripts/fixture/chat.html against a real VS Code workbench CSS with both Copilot chat
// blocks synced, in a dark theme (vs-dark) and a light one (vs), checks computed styles and saves
// screenshots. Only reads the VS Code installation: everything is written to a temp folder.
// Usage: node scripts/render-chat-fixture.js <vscode-app-root> [out-dir]
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const { CHROME, missingClasses, renderReport, serve } = require('./fixture-lib');
const { computeSyncedCss, loadBlockBodies } = require('../out/sync');
const { THEME } = require('../out/features');
const { checkWorkbenchHealth, formatWorkbenchHealthWarning, isWorkbenchHealthy } = require('../out/health');
const { workbenchCssPath } = require('../out/workbench');

const ROOT = path.join(__dirname, '..');
// Wider than the chat's 950px layout width, so the full-width messages and the centered input
// part both show; tall enough for the whole conversation and the input part.
const SIZE = '1100,1400';
const USAGE = `usage: node scripts/render-chat-fixture.js <vscode-app-root> [out-dir]
e.g. node scripts/render-chat-fixture.js "/Applications/Visual Studio Code.app/Contents/Resources/app"
Chrome: ${CHROME} (set CHROME_PATH to use another)`;

function check(mode, r) {
  const problems = [];
  const expect = (ok, message) => {
    if (!ok) {
      problems.push(message);
    }
  };
  // RTL applies in every theme.
  expect(r.dirAnswerHe === 'rtl' && Math.abs(r.alignAnswerHe) <= 1, `Hebrew paragraph: ${r.dirAnswerHe}, ${r.alignAnswerHe}px from the right edge`);
  expect(r.bidiAnswerEn === 'plaintext', `paragraph unicode-bidi: ${r.bidiAnswerEn} (want plaintext)`);
  expect(r.dirRequestHe === 'rtl', `Hebrew request direction: ${r.dirRequestHe}`);
  expect(r.dirCode === 'ltr' && r.dirTool === 'ltr' && r.dirToolbar === 'ltr', `code/tool/toolbar direction: ${r.dirCode}/${r.dirTool}/${r.dirToolbar} (want ltr)`);
  if (mode === 'dark') {
    expect(r.fontsLoaded >= 2, `BiDi Rubik faces loaded: ${r.fontsLoaded} (want 2)`);
    expect(r.textFont.startsWith('"BiDi Rubik"'), `text font: ${r.textFont}`);
    expect(r.textSize === '15px' && r.lineHeight === '26.25px', `text: ${r.textSize} / ${r.lineHeight} (want 15px / 26.25px)`);
    expect(r.textColor === 'rgb(235, 229, 218)', `text color: ${r.textColor}`);
    expect(r.h2 === '18px 600 rgb(245, 240, 232)', `h2: ${r.h2}`);
    expect(r.marker === 'rgb(217, 119, 87)', `list marker: ${r.marker}`);
    expect(r.link === 'rgb(232, 160, 127)', `link: ${r.link}`);
    expect(r.inlineCode === 'rgb(43, 40, 36) / rgb(242, 184, 150)', `inline code: ${r.inlineCode}`);
    expect(r.codeBlock === 'rgb(18, 17, 16) 12px', `code block: ${r.codeBlock}`);
    expect(r.listBg === 'rgb(27, 26, 24)' && r.sessionBg === 'rgb(27, 26, 24)', `backgrounds: list ${r.listBg}, session ${r.sessionBg}`);
    expect(r.sessionWidth === r.viewportWidth, `chat width: ${r.sessionWidth} (want the view's ${r.viewportWidth})`);
    expect(r.userBg === 'rgb(38, 35, 32)' && r.userColor === 'rgb(245, 240, 232)' && r.userRadius === '14px', `your message: ${r.userBg} ${r.userColor} ${r.userRadius}`);
    expect(r.userBar === '3px solid rgb(217, 119, 87)', `your message's accent bar: ${r.userBar}`);
    expect(r.userWidth === r.requestContentWidth, `your message width: ${r.userWidth} (want the row's ${r.requestContentWidth})`);
    expect(r.activity === 'rgb(33, 31, 28) 1px rgb(43, 40, 36) 12px', `activity box: ${r.activity}`);
    expect(r.activityText === '12.5px rgb(150, 143, 131)', `activity text: ${r.activityText}`);
    expect(r.inputPartWidth === 926, `input part: ${r.inputPartWidth} (want 926, VS Code's 950px layout width less its margins)`);
    expect(r.inputBox === 'rgb(36, 33, 32) rgb(217, 119, 87) 18px', `focused input box: ${r.inputBox}`);
    expect(r.inputEditorBg === 'rgb(36, 33, 32)', `input editor background: ${r.inputEditorBg}`);
    expect(r.inputTextSize === '13px', `input text: ${r.inputTextSize} (VS Code sets it in JS; it must stay 13px)`);
    expect(r.attach === '36x34' && r.attachLeft <= 12, `attach button: ${r.attach} at ${r.attachLeft}px`);
    for (const [name, p] of [['mode picker', r.modePicker], ['model picker', r.modelPicker]]) {
      expect(
        p.height === 34 && p.background === 'rgba(0, 0, 0, 0)' && p.border === '1px solid rgb(69, 62, 53)' && p.radius === '11px' && p.size === '15px',
        `${name}: ${JSON.stringify(p)} (want the 34px ghost pill)`
      );
    }
    expect(r.pickersRight >= 0 && r.pickersRight <= 12, `pickers end ${r.pickersRight}px before the send toolbar (want them next to it)`);
    expect(r.send === '40x40 rgb(198, 97, 63) rgb(250, 249, 245) 9999px', `send button: ${r.send}`);
    expect(r.secondaryColor === 'rgb(163, 157, 146)', `secondary toolbar: ${r.secondaryColor}`);
  } else {
    // Only the workbench class differs from the dark page, so these check that none of the theme applies.
    expect(r.fontsLoaded === 0, `BiDi Rubik faces loaded: ${r.fontsLoaded} (want 0)`);
    expect(!r.textFont.includes('BiDi Rubik'), `light theme uses the theme font: ${r.textFont}`);
    expect(r.textSize === '13px', `light theme text size: ${r.textSize} (want the native 13px)`);
    expect(r.sessionWidth === 950, `light theme chat width: ${r.sessionWidth} (want the native 950)`);
    expect(r.userWidth < r.requestContentWidth, 'light theme stretches your messages');
    expect(r.userBg !== 'rgb(38, 35, 32)', 'light theme uses the theme user-message color');
    expect(r.activity.startsWith('rgba(0, 0, 0, 0)'), `light theme boxes the activity: ${r.activity}`);
    expect(!r.inputBox.endsWith('18px'), `light theme uses the theme input box: ${r.inputBox}`);
    expect(r.send.startsWith('22x22'), `light theme uses the theme send button: ${r.send}`);
  }
  return problems;
}

async function main() {
  const [appRoot, outArg] = process.argv.slice(2);
  if (!appRoot) {
    console.error(USAGE);
    process.exit(2);
  }
  const outDir = path.resolve(outArg || path.join(ROOT, 'fixture-out'));
  const work = fs.mkdtempSync(path.join(os.tmpdir(), 'bidi-chat-fixture-'));
  let server;
  let failed = false;
  try {
    const bodies = await loadBlockBodies(ROOT, 'workbench');
    // Without any block this extension may have added to the installed copy.
    const pristine = computeSyncedCss(fs.readFileSync(workbenchCssPath(appRoot), 'utf8'), new Set(), bodies, 'workbench');
    const page = fs.readFileSync(path.join(__dirname, 'fixture', 'chat.html'), 'utf8');
    const health = checkWorkbenchHealth(pristine);
    if (!isWorkbenchHealthy(health)) {
      throw new Error(`the workbench CSS is not healthy:\n${formatWorkbenchHealthWarning(path.basename(appRoot), health)}`);
    }
    console.log('health check: ok');
    const missing = missingClasses(page, pristine);
    if (missing.length > 0) {
      throw new Error(`chat.html uses classes this workbench CSS does not define: ${missing.join(', ')}`);
    }
    fs.mkdirSync(outDir, { recursive: true });
    fs.writeFileSync(
      path.join(work, 'workbench.desktop.main.css'),
      computeSyncedCss(pristine, new Set(['theme', 'rtl']), bodies, 'workbench')
    );
    for (const asset of THEME.blocks.workbench.assets) {
      fs.copyFileSync(path.join(ROOT, asset.source), path.join(work, asset.target));
    }
    const modes = { dark: 'vs-dark', light: 'vs' };
    for (const [mode, themeClass] of Object.entries(modes)) {
      fs.writeFileSync(path.join(work, `${mode}.html`), page.replace('__THEME_CLASS__', themeClass));
    }

    server = await serve(work);
    const base = `http://127.0.0.1:${server.address().port}`;
    // A fresh profile for every Chrome run, so no run sees another's cache or state.
    let runs = 0;
    const profile = () => `--user-data-dir=${path.join(work, `chrome-profile-${++runs}`)}`;
    for (const mode of Object.keys(modes)) {
      const shot = path.join(outDir, `chat-fixture-${mode}.png`);
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

- [ ] **Step 5: Add the npm script**

In `package.json` `scripts`, after `"fixture": …,` add:

```json
    "fixture:chat": "npm run compile && node scripts/render-chat-fixture.js",
```

- [ ] **Step 6: Render the chat fixture**

Run: `npm run fixture:chat -- "/Applications/Visual Studio Code - Insiders 2.app/Contents/Resources/app" 2>&1 | tail -5`
Expected:
```
health check: ok
dark: ok
light: ok
screenshots: …/fixture-out
```
Open `fixture-out/chat-fixture-dark.png` and check it against the theme:
- warm dark background;
- full-width message blocks with an orange bar on the right (RTL is on);
- three quiet activity boxes;
- the Hebrew heading and paragraph on the right, the English ones on the left;
- the rounded input box with `+` on the left and the `Agent`, `Auto | Balance` pills next to the round orange send button.

`chat-fixture-light.png` must look like VS Code's own chat, with RTL text.

- [ ] **Step 7: Commit**

```bash
git add scripts/fixture-lib.js scripts/render-fixture.js scripts/fixture/chat.html scripts/render-chat-fixture.js package.json
git commit -m "test: Copilot chat fixture rendered against VS Code's workbench CSS

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 7: Wire both targets into the extension

**Files:**
- Modify: `src/test/fake-vscode.ts` (add `env`, `version`, `fake.setAppRoot`, `fake.setVersion`)
- Modify: `src/extension.ts:2-5` (imports), `:24-25` (keys), `:52` (outcomes), `:63-67` (`warnMissing`), `:80-82` (comment), `:240-285` (syncs), `:341-345` (`applyPatch`), `:390-397` (initial sync)
- Test: `src/test/extension.test.ts`

**Interfaces:**
- Consumes:
  - `syncWorkbench(appRoot, extensionRoot, enabled): Promise<WorkbenchSyncResult | null>`, `WorkbenchSyncResult`, `WORKBENCH_CSS` and `workbenchCssPath` from `src/workbench.ts` (Task 3)
  - `computeChecksum` from `src/checksum.ts` (Task 2)
  - `REQUIRED_CHAT_CLASSES`, `checkWorkbenchInstallHealth(appRoot)`, `isWorkbenchHealthy(report)` and `formatWorkbenchHealthWarning(version, report)` from `src/health.ts` (Task 5)
- Produces: activation and toggles that sync Claude Code and the chat together. Message texts that later tasks and the README quote:
  - `BiDi RTL & Theme: styles updated. Reload window to apply.`
  - `BiDi RTL & Theme: found neither Claude Code nor VS Code's chat stylesheet, so there is nothing to change.`
  - `BiDi RTL: RTL patch applied. Reload window to apply.`
  - the logged line `BiDi RTL & Theme: could not update the checksum in product.json — <reason>`

- [ ] **Step 1: Give the fake `vscode` an `env.appRoot` and a `version`**

In `src/test/fake-vscode.ts`, add after the `extensions` export:

```ts
/** vscode.env: appRoot is '' (no workbench CSS) until a test calls fake.setAppRoot. */
export const env = { appRoot: '' };

const DEFAULT_VERSION = '1.143.0-insider';

/** vscode.version; fake.setVersion changes it. */
export let version = DEFAULT_VERSION;
```

In `fake.reset()`, after `window.state.focused = true;`, add:

```ts
    env.appRoot = '';
    version = DEFAULT_VERSION;
```

Add to the `fake` object, after `setClaudeCode`:

```ts
  /** The VS Code installation folder vscode.env.appRoot reports ('' for none). */
  setAppRoot(appRoot: string): void {
    env.appRoot = appRoot;
  },
  setVersion(next: string): void {
    version = next;
  },
```

Change the first doc comment's `reset()` line to: `/** Forgets everything: items, messages, commands, listeners, answers, Claude Code and the app root. */`.

- [ ] **Step 2: Write the failing activation tests**

In `src/test/extension.test.ts`:

1. Add the imports:

```ts
import { computeChecksum } from '../checksum';
import { WORKBENCH_CSS, workbenchCssPath } from '../workbench';
```

   Then change the health import to `import { REQUIRED_CHAT_CLASSES, REQUIRED_CLASS_PREFIXES, REQUIRED_JS_HOOKS } from '../health';`.

2. Below `const HEALTHY_JS = …;`, add:

```ts
const HEALTHY_WORKBENCH_CSS = REQUIRED_CHAT_CLASSES.map((c) => `.${c}{color:red}`).join('\n');
const RELOAD = 'BiDi RTL & Theme: styles updated. Reload window to apply.';
const MISSING = "BiDi RTL & Theme: found neither Claude Code nor VS Code's chat stylesheet, so there is nothing to change.";
/** A product.json laid out like VS Code's, holding the checksum of `css`. */
const productJson = (css: string): string =>
  `{\n\t"nameShort": "Code - Insiders",\n\t"checksums": {\n\t\t"${WORKBENCH_CSS}": "${computeChecksum(css)}"\n\t}\n}\n`;
```

3. In the `suite('extension — activate()', …)` body, add `let copilotThemeBody: string;` and `let copilotRtlBody: string;` next to `let rtlBody: string;`. In `suiteSetup`, add:

```ts
    copilotThemeBody = fs.readFileSync(path.join(ROOT, THEME.blocks.workbench.cssFile), 'utf8');
    copilotRtlBody = fs.readFileSync(path.join(ROOT, RTL.blocks.workbench.cssFile), 'utf8');
```

4. Below the `fontsIn` helper, add:

```ts
  /** A VS Code installation with a workbench CSS and its checksum; vscode.env.appRoot points at it. */
  async function installWorkbench(css = HEALTHY_WORKBENCH_CSS): Promise<string> {
    const appRoot = path.join(tmp, 'Code.app', 'Contents', 'Resources', 'app');
    await fs.promises.mkdir(path.dirname(workbenchCssPath(appRoot)), { recursive: true });
    await fs.promises.writeFile(workbenchCssPath(appRoot), css);
    await fs.promises.writeFile(path.join(appRoot, 'product.json'), productJson(css));
    fake.setAppRoot(appRoot);
    return appRoot;
  }

  const chatCssOf = (appRoot: string): string => fs.readFileSync(workbenchCssPath(appRoot), 'utf8');
  const productOf = (appRoot: string): string => fs.readFileSync(path.join(appRoot, 'product.json'), 'utf8');
  const chatFontsIn = (appRoot: string): string[] =>
    THEME.blocks.workbench.assets
      .map((a) => a.target)
      .filter((target) => fs.existsSync(path.join(path.dirname(workbenchCssPath(appRoot)), target)));

  /** The workbench CSS a sync of HEALTHY_WORKBENCH_CSS writes with these modules on. */
  function syncedChat(ids: FeatureId[]): string {
    let css = HEALTHY_WORKBENCH_CSS;
    if (ids.includes('theme')) {
      css = appendBlock(css, THEME.blocks.workbench.markers, copilotThemeBody);
    }
    if (ids.includes('rtl')) {
      css = appendBlock(css, RTL.blocks.workbench.markers, copilotRtlBody);
    }
    return css;
  }
```

5. In the test `upgrading from 0.0.3 migrates the RTL block…`, replace
   `assert.ok(texts('info').includes('BiDi RTL & Theme: Claude Code CSS updated. Reload window to apply.'));`
   with `assert.ok(texts('info').includes(RELOAD));`.

6. Add a new suite after the closing `});` of `suite('modules', …)`:

```ts
  suite('Copilot chat', () => {
    test('without Claude Code, activation styles the chat, sets its checksum and offers a reload', async () => {
      const appRoot = await installWorkbench();
      await start();
      assert.strictEqual(chatCssOf(appRoot), syncedChat(['theme', 'rtl']));
      assert.strictEqual(chatFontsIn(appRoot).length, THEME.blocks.workbench.assets.length);
      assert.strictEqual(productOf(appRoot), productJson(syncedChat(['theme', 'rtl'])));
      assert.deepStrictEqual(texts('warning'), []);
      assert.ok(texts('info').includes(RELOAD));
    });

    test('one toggle updates Claude Code and the chat together, and off restores the checksum', async () => {
      const dir = await installClaudeCode('2.1.287');
      const appRoot = await installWorkbench();
      await start();

      await commands.executeCommand('bidi-rtl.toggle');
      assert.strictEqual(cssOf(dir), synced(['theme']));
      assert.strictEqual(chatCssOf(appRoot), syncedChat(['theme']));

      await commands.executeCommand('bidi-theme.toggle');
      assert.strictEqual(cssOf(dir), HEALTHY_CSS);
      assert.strictEqual(chatCssOf(appRoot), HEALTHY_WORKBENCH_CSS);
      assert.deepStrictEqual(chatFontsIn(appRoot), []);
      assert.strictEqual(productOf(appRoot), productJson(HEALTHY_WORKBENCH_CSS));
    });

    test('with neither target, activation says nothing, and a toggle warns and keeps the flag', async () => {
      const context = await start();
      assert.deepStrictEqual(texts('warning'), []);
      assert.ok(!texts('info').includes(RELOAD));

      await commands.executeCommand('bidi-theme.toggle');
      assert.deepStrictEqual(texts('warning'), [MISSING]);
      assert.strictEqual(context.globalState.get(THEME.flagKey), true);
      assert.strictEqual(item('bidi-theme.toggle').text, '$(check) Theme');
    });

    test('the chat health warning shows once per VS Code version', async () => {
      const [first] = REQUIRED_CHAT_CLASSES;
      await installWorkbench(HEALTHY_WORKBENCH_CSS.replace(`.${first}{color:red}`, ''));
      const context = await start();
      assert.strictEqual(texts('warning').length, 1);
      assert.ok(texts('warning')[0].includes('1.143.0-insider'), texts('warning')[0]);
      assert.ok(texts('warning')[0].includes(`.${first}`), texts('warning')[0]);

      await fake.extensionsChanged(); // another sync in the same activation
      stop(context);
      const second = await start(context.globalState); // remembers the warned version
      assert.strictEqual(texts('warning').length, 1);

      stop(second);
      fake.setVersion('1.144.0-insider');
      await start(context.globalState);
      assert.strictEqual(texts('warning').length, 2);
      assert.ok(texts('warning')[1].includes('1.144.0-insider'), texts('warning')[1]);
    });

    test('a chat CSS that cannot be written does not hold back Claude Code, and the toggle keeps its flag', async () => {
      const dir = await installClaudeCode('2.1.287');
      const appRoot = await installWorkbench();
      const context = await start();
      // A folder where writeFileAtomic puts its temp file makes the chat CSS write fail.
      await fs.promises.mkdir(`${workbenchCssPath(appRoot)}.bidi-rtl-tmp-${process.pid}`);

      await commands.executeCommand('bidi-theme.toggle');
      assert.strictEqual(cssOf(dir), synced(['rtl']));
      assert.strictEqual(chatCssOf(appRoot), syncedChat(['theme', 'rtl']));
      assert.strictEqual(context.globalState.get(THEME.flagKey), false);
      assert.strictEqual(texts('error').length, 1);
      assert.ok(texts('error')[0].includes("Could not update VS Code's chat CSS"), texts('error')[0]);
    });

    test('a checksum that cannot be updated is logged, never shown', async () => {
      const appRoot = await installWorkbench();
      await fs.promises.rm(path.join(appRoot, 'product.json'));
      await fs.promises.mkdir(path.join(appRoot, 'product.json')); // a folder: reading it fails
      const logged: string[] = [];
      const consoleError = console.error;
      console.error = (...args: unknown[]) => void logged.push(args.join(' '));
      try {
        await start();
      } finally {
        console.error = consoleError;
      }
      assert.strictEqual(chatCssOf(appRoot), syncedChat(['theme', 'rtl']));
      assert.deepStrictEqual(texts('error'), []);
      assert.ok(
        logged.some((line) => line.startsWith('BiDi RTL & Theme: could not update the checksum in product.json — ')),
        logged.join('\n')
      );
    });
  });
```

- [ ] **Step 3: Run the tests to verify they fail**

Run: `npm test 2>&1 | grep -E "passing|failing|^  [0-9]+\)" | head -20`
Expected: 7 failing: the six `Copilot chat` tests and `upgrading from 0.0.3…`, whose reload text is still `Claude Code CSS updated`. Most fail on assertions, because the extension does not yet touch the chat.

- [ ] **Step 4: Wire the chat into `src/extension.ts`**

Replace the imports on lines 2–5 with:

```ts
import { FEATURES, Feature, FeatureId, RTL } from './features';
import {
  checkInstallHealth,
  checkWorkbenchInstallHealth,
  formatHealthWarning,
  formatWorkbenchHealthWarning,
  isHealthy,
  isWorkbenchHealthy,
} from './health';
import { getStatusBarState } from './status';
import { syncInstall } from './sync';
import { WorkbenchSyncResult, syncWorkbench } from './workbench';
```

After `const LAST_WARNED_KEY = 'bidiTheme.lastWarnedVersion';`, add:

```ts
const LAST_WARNED_WORKBENCH_KEY = 'bidiTheme.lastWarnedWorkbenchVersion';
```

Replace the line `type SyncOutcome = 'changed' | 'unchanged' | 'error' | 'missing';` with:

```ts
type SyncOutcome = 'changed' | 'unchanged' | 'error' | 'missing';

/**
 * One outcome for a sync of every target: missing when no target exists,
 * error when none of the existing ones could be updated.
 */
function combineOutcomes(outcomes: readonly SyncOutcome[]): SyncOutcome {
  const present = outcomes.filter((outcome) => outcome !== 'missing');
  if (present.length === 0) {
    return 'missing';
  }
  if (present.every((outcome) => outcome === 'error')) {
    return 'error';
  }
  return present.includes('changed') ? 'changed' : 'unchanged';
}
```

Replace the body of `warnMissing` with:

```ts
  void vscode.window.showWarningMessage(
    "BiDi RTL & Theme: found neither Claude Code nor VS Code's chat stylesheet, so there is nothing to change."
  );
```

In the comment above `let syncQueue`, replace `never read/write index.css concurrently.` with `never read/write the CSS files concurrently.`

Replace everything from `  // Versions found healthy in this activation: every sync would otherwise` down to and including the line `  const sync = (silent: boolean): Promise<SyncOutcome> => enqueue(() => syncNow(silent));` with:

```ts
  // Versions found healthy in this activation: every sync would otherwise
  // read Claude Code's index.js (megabytes) again.
  const healthyVersions = new Set<string>();
  // The workbench CSS changes only with a VS Code update, which restarts this
  // extension, so the chat is checked at most once per activation.
  let chatChecked = false;

  // At most one warning per Claude Code version; the toast is never awaited.
  const warnIfUnhealthy = async (ext: vscode.Extension<unknown>): Promise<void> => {
    const version = String(ext.packageJSON?.version ?? 'unknown');
    if (healthyVersions.has(version) || context.globalState.get<string>(LAST_WARNED_KEY) === version) {
      return;
    }
    const report = await checkInstallHealth(ext.extensionPath);
    if (isHealthy(report)) {
      healthyVersions.add(version);
      return;
    }
    await context.globalState.update(LAST_WARNED_KEY, version);
    void vscode.window.showWarningMessage(formatHealthWarning(version, report));
  };

  // At most one warning per VS Code version, kept apart from Claude Code's.
  const warnIfChatUnhealthy = async (): Promise<void> => {
    const version = vscode.version;
    if (chatChecked || context.globalState.get<string>(LAST_WARNED_WORKBENCH_KEY) === version) {
      return;
    }
    chatChecked = true;
    const report = await checkWorkbenchInstallHealth(vscode.env.appRoot);
    if (isWorkbenchHealthy(report)) {
      return;
    }
    await context.globalState.update(LAST_WARNED_WORKBENCH_KEY, version);
    void vscode.window.showWarningMessage(formatWorkbenchHealthWarning(version, report));
  };

  const syncClaudeCode = async (enabled: ReadonlySet<FeatureId>, silent: boolean): Promise<SyncOutcome> => {
    const ext = vscode.extensions.getExtension(CLAUDE_EXTENSION_ID);
    if (!ext) {
      return 'missing';
    }
    let cssChanged: boolean;
    try {
      const result = await syncInstall(ext.extensionPath, context.extensionPath, enabled);
      for (const assetError of result.assetErrors) {
        console.error(`BiDi Theme: font sync failed — ${assetError}`);
      }
      cssChanged = result.cssChanged;
    } catch (err: unknown) {
      reportError('update Claude Code CSS', err, silent);
      return 'error';
    }
    if (enabled.has('theme')) {
      await warnIfUnhealthy(ext).catch((err: unknown) => {
        console.error(formatError('check Claude Code', err));
      });
    }
    return cssChanged ? 'changed' : 'unchanged';
  };

  // VS Code's own chat, where Copilot runs, is styled by the workbench CSS.
  const syncChat = async (enabled: ReadonlySet<FeatureId>, silent: boolean): Promise<SyncOutcome> => {
    let result: WorkbenchSyncResult | null;
    try {
      result = await syncWorkbench(vscode.env.appRoot, context.extensionPath, enabled);
    } catch (err: unknown) {
      reportError("update VS Code's chat CSS", err, silent);
      return 'error';
    }
    if (!result) {
      return 'missing';
    }
    for (const assetError of result.assetErrors) {
      console.error(`BiDi Theme: font sync failed — ${assetError}`);
    }
    if (result.checksumError) {
      // VS Code may then call the installation corrupt; the chat is styled anyway.
      console.error(`BiDi RTL & Theme: could not update the checksum in product.json — ${result.checksumError}`);
    }
    if (enabled.has('theme')) {
      await warnIfChatUnhealthy().catch((err: unknown) => {
        console.error(formatError("check VS Code's chat", err));
      });
    }
    return result.cssChanged ? 'changed' : 'unchanged';
  };

  // One sync of every target; callers run it through the queue.
  const syncNow = async (silent: boolean): Promise<SyncOutcome> => {
    const enabled = enabledIds();
    return combineOutcomes([await syncClaudeCode(enabled, silent), await syncChat(enabled, silent)]);
  };

  const sync = (silent: boolean): Promise<SyncOutcome> => enqueue(() => syncNow(silent));
```

In the `bidi-rtl.applyPatch` command, replace the message `'BiDi RTL: RTL patch applied to Claude Code. Reload window to apply.'` with `'BiDi RTL: RTL patch applied. Reload window to apply.'`.

Replace the initial sync at the end of `activate` (from the comment `// The initial sync runs after everything is registered and never blocks` to the end of the `else if` block) with:

```ts
  // The initial sync runs after everything is registered and never blocks
  // activation on a toast. A missing target is skipped silently: some people
  // use only Claude Code, others only Copilot.
  if ((await sync(false)) === 'changed') {
    void offerReload('BiDi RTL & Theme: styles updated. Reload window to apply.');
  }
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npm test 2>&1 | tail -8`
Expected: PASS, `183 passing` (6 new), 0 failing.

- [ ] **Step 6: Check that nothing outside the tests reads the old message**

Run: `grep -rn "Claude Code CSS updated\|applied to Claude Code" src README.md`
Expected: no output.

- [ ] **Step 7: Commit**

```bash
git add src/extension.ts src/test/fake-vscode.ts src/test/extension.test.ts
git commit -m "feat: style VS Code's Copilot chat on activation and with every toggle

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 8: Uninstall cleans the chat too

**Files:**
- Modify: `src/uninstall.ts` (whole file)
- Test: `src/test/cleanup.test.ts` (`suite('uninstall main()', …)`)

**Interfaces:**
- Consumes: `cleanWorkbench(appRoot)`, `findAppRoot(execPath)`, `WORKBENCH_CSS` and `workbenchCssPath` from `src/workbench.ts`; `computeChecksum` from `src/checksum.ts`.
- Produces: `main(extensionsRoot: string, execPath: string): Promise<number>`. It returns how many Claude Code installs were cleaned and also cleans the chat of the VS Code that `execPath` belongs to.

- [ ] **Step 1: Write the failing tests**

In `src/test/cleanup.test.ts`, add the imports:

```ts
import { computeChecksum } from '../checksum';
import { WORKBENCH_CSS, workbenchCssPath } from '../workbench';
```

In `suite('uninstall main()', …)`, add `const NO_VSCODE = (): string => path.join(root, 'bin', 'node');` at the top of the suite. Then replace `main(root)` with `main(root, NO_VSCODE())` and `main(path.join(root, 'nope'))` with `main(path.join(root, 'nope'), NO_VSCODE())` in the two existing tests. Add these tests at the end of the suite:

```ts
    test('also cleans the chat of the VS Code it runs under and restores its checksum', async () => {
      const contents = path.join(root, 'Code.app', 'Contents');
      const appRoot = path.join(contents, 'Resources', 'app');
      const css = workbenchCssPath(appRoot);
      const patched = appendBlock(ORIGINAL_A, THEME.blocks.workbench.markers, '.t{}');
      const product = (content: string): string => `{"checksums":{"${WORKBENCH_CSS}":"${computeChecksum(content)}"}}`;
      await write(css, patched);
      await write(path.join(appRoot, 'product.json'), product(patched));
      await write(path.join(path.dirname(css), THEME.blocks.workbench.assets[0].target), 'font');

      assert.strictEqual(await main(root, path.join(contents, 'MacOS', 'Electron')), 2);
      assert.strictEqual(await fs.promises.readFile(css, 'utf8'), ORIGINAL_A);
      assert.strictEqual(await fs.promises.readFile(path.join(appRoot, 'product.json'), 'utf8'), product(ORIGINAL_A));
      assert.ok(!fs.existsSync(path.join(path.dirname(css), THEME.blocks.workbench.assets[0].target)));
      assert.deepStrictEqual(logged, [
        'BiDi RTL & Theme: cleaned 2 Claude Code install(s).',
        `BiDi RTL & Theme: cleaned VS Code's chat CSS in ${appRoot}.`,
      ]);
    });

    test('logs a chat CSS it could not clean', async () => {
      const contents = path.join(root, 'Code.app', 'Contents');
      const appRoot = path.join(contents, 'Resources', 'app');
      await write(workbenchCssPath(appRoot), appendBlock(ORIGINAL_A, THEME.blocks.workbench.markers, '.t{}'));
      await fs.promises.mkdir(path.join(appRoot, 'product.json'), { recursive: true }); // unreadable
      assert.strictEqual(await main(root, path.join(contents, 'MacOS', 'Electron')), 2);
      assert.strictEqual(logged.length, 2, logged.join('\n'));
      assert.ok(logged[1].startsWith("BiDi RTL & Theme: could not clean VS Code's chat CSS — "), logged[1]);
    });
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm test 2>&1 | grep -E "passing|failing" `
Expected: 2 failing, the new tests. The chat CSS still has its block, and the log has one line.

- [ ] **Step 3: Replace `src/uninstall.ts`**

```ts
import * as path from 'path';
import { cleanupAll } from './cleanup';
import { cleanWorkbench, findAppRoot } from './workbench';

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

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
  await cleanChat(execPath);
  return cleaned;
}

// Run by `vscode:uninstall` under VS Code's own executable (or a helper inside
// it); this file lives at <extensionsRoot>/<ext-dir>/out/uninstall.js.
if (require.main === module) {
  void main(path.resolve(__dirname, '..', '..'), process.execPath);
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm test 2>&1 | tail -8`
Expected: PASS, `185 passing` (2 new), 0 failing.

- [ ] **Step 5: Commit**

```bash
git add src/uninstall.ts src/test/cleanup.test.ts
git commit -m "feat: uninstall also cleans the Copilot chat CSS and its checksum

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 9: Version 0.2.0, texts and README

**Files:**
- Modify: `package.json` (`version`, `displayName`, `description`, the `bidi-rtl.applyPatch` title)
- Modify: `README.md`
- Modify: `docs/superpowers/specs/2026-10-22-copilot-chat-theme-design.md:5` (status line)

**Interfaces:**
- Consumes: the message texts from Task 8 and the `fixture:chat` script from Task 6.
- Produces: `vscode-bidi-rtl-0.2.0.vsix` in the repo root (ignored by git, like the older ones).

- [ ] **Step 1: Update `package.json`**

Set:
- `"displayName": "BiDi RTL & Theme for Claude Code and Copilot"`
- `"description": "RTL direction and a warm reading theme for the Claude Code panel and VS Code's Copilot chat"`
- `"version": "0.2.0"`
- the `bidi-rtl.applyPatch` command's title: `"BiDi RTL: Apply RTL Patch"`

- [ ] **Step 2: Update `README.md`**

1. Title: `# BiDi RTL & Theme for Claude Code and Copilot`.
2. Replace the first line under the title, `A small VS Code extension for the Claude Code conversation panel:`, with
   `A small VS Code extension for the Claude Code conversation panel and VS Code's Copilot chat:`.
3. After the bullet `- **Session clock** shows …`, add the bullet
   `- **Copilot chat** gets the same RTL and theme: VS Code's built-in chat, where GitHub Copilot runs, looks and reads like the Claude Code panel.`
4. Insert this section before `### Session clock`:

```markdown
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

VS Code loads its chat styles when a window opens, before extensions start. After you install
this extension, and after every VS Code update (an update replaces VS Code's files), the extension
applies the styles again and asks you to reload the window once.
```

5. In `## Install`, change both `vscode-bidi-rtl-0.1.0.vsix` to `vscode-bidi-rtl-0.2.0.vsix`. Change step 3 to:
   `3. Reload the window. RTL and the theme are applied automatically on startup, to Claude Code and to the Copilot chat (the chat needs one more reload the first time; the extension asks). The session clock asks first.`
6. In the commands table, replace the row `` | `BiDi RTL: Apply RTL Patch to Claude Code` | Turns RTL on. | `` with
   `` | `BiDi RTL: Apply RTL Patch` | Turns RTL on. | ``.
7. In `## How it works`, after the first paragraph (it ends with `next to it.`), add:

```markdown
For the Copilot chat, the blocks go into VS Code's own `workbench.desktop.main.css`, inside the
VS Code application, with the fonts next to it. VS Code keeps a checksum of that file in its
`product.json` and would otherwise report that the installation is corrupt. The extension sets
that one checksum after every change and restores it when the blocks are removed.
```

8. In the same section's list, add these bullets after the bullet that starts `- While the theme is on, every sync`:

```markdown
- A VS Code update replaces the chat's stylesheet, so the extension applies the chat blocks again
  at the next start and asks for one reload. On VS Code Insiders that is about once a day.
- While the theme is on, the extension also checks that the chat's class names it styles are
  still in VS Code, and warns once per VS Code version if some are gone.
- When VS Code is installed where your user cannot write (for example an `/Applications` copy
  owned by an administrator), the chat cannot be styled. The extension says so once per VS Code
  version when a window opens (and every time you toggle a module), and Claude Code is still
  styled.
```

9. Replace the bullet that starts `- Uninstalling the extension removes the blocks and fonts by itself.` (both of its lines) with:

```markdown
- Uninstalling the extension removes the blocks and fonts by itself, from every Claude Code
  install and from the VS Code it was uninstalled in (restoring its checksum). The cleanup runs
  the next time VS Code fully restarts after the uninstall, because that is when VS Code runs
  uninstall hooks. Another copy of VS Code that shares the same extensions folder keeps its chat
  styles until its next update: turn both modules off there first.
```

10. After the bullet that starts `- Going back to 0.0.3`, add:

```markdown
- Going back to 0.1.0 leaves the Copilot chat styled until the next VS Code update, since 0.1.0
  knows only Claude Code. Turn both modules off first, then install 0.1.0.
```

11. In `## Build from source`, add after the `npm run fixture` line:

```bash
npm run fixture:chat -- "<VS Code app root>"   # renders the Copilot chat fixture, e.g. /Applications/Visual Studio Code.app/Contents/Resources/app
```

12. Replace the whole paragraph under `## Notes` with:

```markdown
Built for personal use and shared as-is. It edits Claude Code's own CSS and VS Code's workbench CSS,
which is a bit of a hack by nature — if an update to either changes the markup, the patch may need
updating. PRs welcome.
```

- [ ] **Step 3: Mark the spec as implemented**

In `docs/superpowers/specs/2026-10-22-copilot-chat-theme-design.md`, replace the line `**Status:** Approved in brainstorming; written spec pending review  ` with `**Status:** Approved; implemented in 0.2.0 (plan: [2026-10-22-copilot-chat-theme.md](../plans/2026-10-22-copilot-chat-theme.md))  `.

- [ ] **Step 4: Run the tests, build and package**

Run: `npm test 2>&1 | tail -4 && npx vsce package 2>&1 | tail -3 && unzip -l vscode-bidi-rtl-0.2.0.vsix | grep -E "copilot|workbench.js|checksum.js|uninstall.js|woff2|scripts/|render" `
Expected:
- the tests pass;
- `DONE  Packaged: …/vscode-bidi-rtl-0.2.0.vsix`;
- the listing shows `extension/css/copilot-theme.css`, `extension/css/copilot-rtl.css`, `extension/out/workbench.js`, `extension/out/checksum.js`, `extension/out/uninstall.js` and both woff2 fonts, and no `scripts/` path.

- [ ] **Step 5: Commit**

```bash
git add package.json README.md docs/superpowers/specs/2026-10-22-copilot-chat-theme-design.md
git commit -m "docs: 0.2.0, Copilot chat in the README

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

## After the tasks (controller, not a subagent)

These steps touch the real VS Code installation, so the controller runs them, with the user.

1. **Back up** the two files the extension will change, before the first activation of 0.2.0:
   ```bash
   APP="/Applications/Visual Studio Code - Insiders 2.app/Contents/Resources/app"
   mkdir -p ~/bidi-backup-1.143 && cp "$APP/out/vs/workbench/workbench.desktop.main.css" "$APP/product.json" ~/bidi-backup-1.143/
   ```
2. **Install** with the approved CLI: `"$APP/bin/code" --install-extension vscode-bidi-rtl-0.2.0.vsix --force`. Ask the user to reload. The extension patches the chat and offers a second reload.
3. **Manual check** with the user (Copilot Free; keep the number of requests low):
   - A Copilot agent conversation with a Hebrew and an English prompt, a tool call, code and thinking.
   - The input focused.
   - The chat in the secondary side bar and in an editor tab.
   - Light and high-contrast themes unchanged.
   - Every Theme/RTL combination.
   - A window reload after the chat changed shows VS Code's "corrupt installation" warning (expected);
     after Quit VS Code and reopening, no warning.
   - Copy `.interactive-session`'s outerHTML once (Help → Toggle Developer Tools) to compare with the fixture.
4. **Work Mac:** copy `vscode-bidi-rtl-0.2.0.vsix`, install it there with that VS Code's CLI, reload twice, and repeat the conversation check. If that VS Code is stable rather than Insiders, the health check reports any chat class names that differ.
