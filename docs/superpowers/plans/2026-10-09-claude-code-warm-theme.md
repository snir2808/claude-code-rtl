# Claude Code Warm Theme Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a second module to the BiDi RTL extension that reskins the Claude Code webview in dark themes (warm palette, Rubik 15px, 680px reading column, grouped tool rows, roomier composer), with its own toggle, synced alongside the existing RTL block.

**Architecture:** A feature registry (`src/features.ts`) describes each module: markers, CSS file, assets, flag and command. `src/sync.ts` strips every known block from Claude Code's `webview/index.css` and re-appends the enabled ones in a fixed order, copying the theme's fonts next to it. `src/health.ts` checks that the install still has what the theme targets. `src/extension.ts` runs sync on activation, on Claude Code updates and on every toggle.

**Tech Stack:** TypeScript 5 (strict, CommonJS), VS Code API ^1.85, mocha (TDD UI), Node built-ins (`fs`, `crypto`, `http`, `child_process`), headless Google Chrome for the visual fixture, `@vscode/vsce` for packaging.

## Global Constraints

- Spec: `docs/superpowers/specs/2026-10-09-claude-code-warm-theme-design.md`. Mockup: `docs/superpowers/specs/assets/2026-10-09-warm-theme-mockup.html`.
- Repo `/Users/snirhakmoun/vscode-bidi-flipper`, branch `feat/warm-theme`. Run every command from the repo root.
- No new dependencies (runtime or dev). Scripts use Node built-ins only.
- Markers: RTL `/* bidi-rtl-patch-start */` … `/* bidi-rtl-patch-end */` (unchanged); theme `/* bidi-theme-patch-start */` … `/* bidi-theme-patch-end */`.
- Canonical block order: `theme`, then `rtl`.
- Theme assets are written to `<claude-code>/webview/bidi-theme-rubik-hebrew.woff2` and `<claude-code>/webview/bidi-theme-rubik-latin.woff2`.
- `globalState` keys: `bidiRtl.enabled` (default on), `bidiTheme.enabled` (default on), `bidiTheme.lastWarnedVersion`, `bidiUsage.enabled` (default on).
- Commands: `bidi-rtl.toggle`, `bidi-rtl.applyPatch`, `bidi-rtl.removePatch` (unchanged), `bidi-theme.toggle`, `bidi-usage.toggle`, `bidi-usage.refresh`.
- Session clock: Claude Code's OAuth token is read fresh for each refresh, held only for that request, never logged or stored, and sent only to `https://api.anthropic.com/api/oauth/usage`.
- `css/theme.css`: every style rule's selectors start with `body.vscode-dark`; the only top-level at-rule is `@font-face`; no `direction`, `text-align` or `unicode-bidi` declarations.
- Never override inline styles, the composer dock's position or outer spacing, or anything keyed on `data-fit-stage`.
- Extension `name` stays `vscode-bidi-rtl`; `displayName` becomes "BiDi RTL & Theme for Claude Code"; version 0.1.0.
- Tests: `npm test` (compiles, then runs mocha on `out/test/**/*.test.js`), written with `suite`/`test`.
- Commits: conventional-commit subject, body ending with `Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>`. Never push.

## File Map

| File | Task | Responsibility |
|---|---|---|
| `css/rtl.css` | 1 (new) | RTL block body, moved verbatim out of `patcher.ts` |
| `src/features.ts` | 1 (new) | Feature registry: `THEME`, `RTL`, `FEATURES` |
| `src/patcher.ts` | 1, 7 | Block primitives (`stripBlock`, `appendBlock`) and `writeFileAtomic`; legacy RTL functions removed in Task 7 |
| `src/sync.ts` | 2 (new) | `computeSyncedCss` (pure), `loadBlockBodies`, `syncInstall` (I/O + fonts) |
| `src/health.ts` | 3 (new) | Integrity and compatibility checks, warning text |
| `css/theme.css`, `fonts/*` | 4 (new) | Theme block body, Rubik woff2 subsets, OFL license |
| `scripts/fixture/panel.html`, `scripts/render-fixture.js` | 5 (new) | Visual fixture rendered against Claude Code's real CSS |
| `src/cleanup.ts`, `src/uninstall.ts` | 6 | Strip both blocks and delete fonts from every install |
| `src/status.ts`, `src/extension.ts`, `package.json` | 7, 8 | Status bar per feature, wiring, manifest |
| `src/usage.ts` | 8 (new) | Session clock: usage endpoint, OAuth token, status text |
| `README.md` | 9 | Theme and session-clock docs, font credit |

---

### Task 1: Block primitives, feature registry and `css/rtl.css`

The RTL CSS moves from a string array in `patcher.ts` to `css/rtl.css`. The legacy RTL functions keep working (they now read the file), so the existing 23 tests prove the move is lossless. Generic block functions and the feature registry are added next to them.

**Files:**
- Create: `css/rtl.css` (generated from the current code in Step 1)
- Create: `src/features.ts`
- Modify: `src/patcher.ts` (CSS source + new exports)
- Test: `src/test/blocks.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `src/patcher.ts`: `interface BlockMarkers { readonly start: string; readonly end: string }`, `stripBlock(content: string, markers: BlockMarkers): string`, `appendBlock(content: string, markers: BlockMarkers, body: string): string`, `writeFileAtomic(cssPath: string, content: string): Promise<void>` (now exported).
  - `src/features.ts`: `type FeatureId = 'theme' | 'rtl'`, `interface Asset { readonly source: string; readonly target: string }`, `interface Feature { readonly id: FeatureId; readonly label: string; readonly markers: BlockMarkers; readonly cssFile: string; readonly assets: readonly Asset[]; readonly flagKey: string; readonly toggleCommand: string }`, constants `THEME`, `RTL`, `FEATURES` (`[THEME, RTL]`).

- [ ] **Step 1: Generate `css/rtl.css` from the current patch**

```bash
npm run compile && node -e "
const fs = require('fs');
const lines = require('./out/patcher').applyCssPatchToContent('').slice(1).split('\n');
fs.mkdirSync('css', { recursive: true });
fs.writeFileSync('css/rtl.css', lines.slice(1, -1).join('\n') + '\n');
" && head -2 css/rtl.css && tail -3 css/rtl.css && (grep -c 'bidi-rtl-patch' css/rtl.css || true)
```

Expected output:

```
/* Input: RTL base direction. unicode-bidi is intentionally NOT set so
   Claude Code's native `plaintext` on the input keeps working. */
text-align:left;
unicode-bidi:isolate;
}
0
```

- [ ] **Step 2: Write the failing tests**

Create `src/test/blocks.test.ts`:

```ts
import * as assert from 'assert';
import * as fs from 'fs';
import * as path from 'path';
import { FEATURES, RTL, THEME } from '../features';
import { appendBlock, stripBlock } from '../patcher';

const CSS = '.foo{color:red}\n.bar{display:flex}';
const M = { start: '/* x-start */', end: '/* x-end */' };
const OTHER = { start: '/* y-start */', end: '/* y-end */' };
const RTL_CSS = fs.readFileSync(path.join(__dirname, '..', '..', 'css', 'rtl.css'), 'utf8');

suite('blocks — generic', () => {
  test('appendBlock wraps the trimmed body in markers at the end', () => {
    assert.strictEqual(
      appendBlock(CSS, M, '\n.a{top:0}\n'),
      CSS + '\n/* x-start */\n.a{top:0}\n/* x-end */'
    );
  });

  test('stripBlock restores the original exactly', () => {
    assert.strictEqual(stripBlock(appendBlock(CSS, M, '.a{}'), M), CSS);
  });

  test('stripBlock removes every copy and keeps other blocks', () => {
    const withBoth = appendBlock(appendBlock(appendBlock(CSS, M, '.a{}'), OTHER, '.b{}'), M, '.c{}');
    assert.strictEqual(stripBlock(withBoth, M), appendBlock(CSS, OTHER, '.b{}'));
  });

  test('stripBlock treats marker text literally', () => {
    const odd = { start: '/* (a+b)? [x] */', end: '/* $end^ */' };
    assert.strictEqual(stripBlock(appendBlock(CSS, odd, '.a{}'), odd), CSS);
  });

  test('stripBlock leaves CSS without the block untouched', () => {
    assert.strictEqual(stripBlock(CSS, M), CSS);
  });
});

suite('features — registry', () => {
  test('canonical order is theme, then rtl', () => {
    assert.deepStrictEqual(FEATURES.map((f) => f.id), ['theme', 'rtl']);
  });

  test('RTL keeps the markers existing installs already have', () => {
    assert.deepStrictEqual(RTL.markers, {
      start: '/* bidi-rtl-patch-start */',
      end: '/* bidi-rtl-patch-end */',
    });
  });

  test('theme assets are woff2 files prefixed bidi-theme-', () => {
    assert.ok(THEME.assets.length > 0);
    for (const asset of THEME.assets) {
      assert.match(asset.target, /^bidi-theme-[a-z-]+\.woff2$/);
    }
  });
});

suite('rtl.css', () => {
  test('holds only the block body, without markers', () => {
    assert.ok(!RTL_CSS.includes('bidi-rtl-patch'));
    assert.ok(RTL_CSS.includes('[class*="messagesContainer_"]'));
  });

  test('keeps a single backslash before 2022', () => {
    assert.ok(RTL_CSS.includes('\\2022'));
    assert.ok(!RTL_CSS.includes('\\\\2022'));
  });

  test('uses text-align:start and hash-free selectors', () => {
    assert.ok(RTL_CSS.includes('[role="textbox"][aria-label="Message input"]'));
    assert.ok(RTL_CSS.includes('text-align:start;'));
    assert.ok(!/(messageInput|messagesContainer|userMessage)_[A-Za-z0-9-]{6}/.test(RTL_CSS));
  });
});
```

- [ ] **Step 3: Run the tests to verify they fail**

Run: `npm test`
Expected: compile error `Cannot find module '../features'` (and `Module '"../patcher"' has no exported member 'appendBlock'`).

- [ ] **Step 4: Create `src/features.ts`**

```ts
import type { BlockMarkers } from './patcher';

export type FeatureId = 'theme' | 'rtl';

export interface Asset {
  /** Path inside this extension, relative to its root. */
  readonly source: string;
  /** File name written next to Claude Code's webview/index.css. */
  readonly target: string;
}

export interface Feature {
  readonly id: FeatureId;
  /** Status-bar label. */
  readonly label: string;
  readonly markers: BlockMarkers;
  /** Block body, relative to the extension root. */
  readonly cssFile: string;
  readonly assets: readonly Asset[];
  /** globalState key of the on/off flag (default on). */
  readonly flagKey: string;
  readonly toggleCommand: string;
}

export const THEME: Feature = {
  id: 'theme',
  label: 'Theme',
  markers: { start: '/* bidi-theme-patch-start */', end: '/* bidi-theme-patch-end */' },
  cssFile: 'css/theme.css',
  assets: [
    { source: 'fonts/rubik-hebrew.woff2', target: 'bidi-theme-rubik-hebrew.woff2' },
    { source: 'fonts/rubik-latin.woff2', target: 'bidi-theme-rubik-latin.woff2' },
  ],
  flagKey: 'bidiTheme.enabled',
  toggleCommand: 'bidi-theme.toggle',
};

export const RTL: Feature = {
  id: 'rtl',
  label: 'RTL',
  markers: { start: '/* bidi-rtl-patch-start */', end: '/* bidi-rtl-patch-end */' },
  cssFile: 'css/rtl.css',
  assets: [],
  flagKey: 'bidiRtl.enabled',
  toggleCommand: 'bidi-rtl.toggle',
};

/** Canonical order: sync appends the enabled blocks in this order. */
export const FEATURES: readonly Feature[] = [THEME, RTL];
```

- [ ] **Step 5: Update `src/patcher.ts`**

Replace everything from the top of the file through the closing `].join('\n');` of `CSS_PATCH` (the imports, the comment and the whole string array) with:

```ts
import * as fs from 'fs';
import * as path from 'path';

/** Start/end comments that delimit one block appended to Claude Code's CSS. */
export interface BlockMarkers {
  readonly start: string;
  readonly end: string;
}

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// Removes every copy of the block, plus the newline appendBlock put before it.
export function stripBlock(content: string, markers: BlockMarkers): string {
  const pattern = new RegExp(
    `\\n?${escapeRegExp(markers.start)}[\\s\\S]*?${escapeRegExp(markers.end)}`,
    'g'
  );
  return content.replace(pattern, '');
}

export function appendBlock(content: string, markers: BlockMarkers, body: string): string {
  return `${content}\n${markers.start}\n${body.trim()}\n${markers.end}`;
}

// The RTL block body lives in css/rtl.css, next to out/ in the packaged extension.
const CSS_PATCH = [
  '/* bidi-rtl-patch-start */',
  fs.readFileSync(path.join(__dirname, '..', 'css', 'rtl.css'), 'utf8').trim(),
  '/* bidi-rtl-patch-end */',
].join('\n');
```

Then change `async function writeFileAtomic(` to `export async function writeFileAtomic(`. Leave `isCssPatched`, `applyCssPatchToContent`, `removeCssPatchFromContent`, `applyCssPatch` and `removeCssPatch` unchanged.

- [ ] **Step 6: Run the tests to verify they pass**

Run: `npm test`
Expected: `34 passing` (the 23 existing tests, unchanged, plus 11 new ones).

- [ ] **Step 7: Commit**

```bash
git add css/rtl.css src/features.ts src/patcher.ts src/test/blocks.test.ts
git commit -F - <<'EOF'
refactor: move RTL CSS to css/rtl.css, add block primitives and feature registry

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
EOF
```

---

### Task 2: Sync — compute and write the blocks, copy the fonts

**Files:**
- Create: `src/sync.ts`
- Test: `src/test/sync.test.ts` (pure), `src/test/sync.integration.test.ts` (file I/O)

**Interfaces:**
- Consumes: `FEATURES`, `FeatureId` from `./features`; `appendBlock`, `stripBlock`, `writeFileAtomic` from `./patcher`.
- Produces (`src/sync.ts`):
  - `type BlockBodies = Readonly<Record<FeatureId, string>>`
  - `computeSyncedCss(content: string, enabled: ReadonlySet<FeatureId>, bodies: BlockBodies): string`
  - `loadBlockBodies(extensionRoot: string): Promise<BlockBodies>`
  - `interface SyncResult { cssChanged: boolean; assetErrors: string[] }` — each error string starts with the asset's target file name.
  - `syncInstall(claudeCodeDir: string, extensionRoot: string, enabled: ReadonlySet<FeatureId>): Promise<SyncResult>` — rejects if `webview/index.css` is missing.

- [ ] **Step 1: Write the failing pure tests**

Create `src/test/sync.test.ts`:

```ts
import * as assert from 'assert';
import { FeatureId, RTL, THEME } from '../features';
import { appendBlock } from '../patcher';
import { BlockBodies, computeSyncedCss } from '../sync';

const CSS = '.foo{color:red}\n/* ✳ unicode stays */\n.bar{display:flex}\n';
const BODIES: BlockBodies = { theme: '.t{color:#1b1a18}', rtl: '.r{direction:rtl}' };
const STATES: FeatureId[][] = [[], ['theme'], ['rtl'], ['theme', 'rtl']];
const on = (ids: FeatureId[]): Set<FeatureId> => new Set(ids);

suite('sync — computeSyncedCss', () => {
  test('nothing enabled returns clean CSS unchanged', () => {
    assert.strictEqual(computeSyncedCss(CSS, on([]), BODIES), CSS);
  });

  test('theme only', () => {
    assert.strictEqual(
      computeSyncedCss(CSS, on(['theme']), BODIES),
      appendBlock(CSS, THEME.markers, BODIES.theme)
    );
  });

  test('rtl only', () => {
    assert.strictEqual(
      computeSyncedCss(CSS, on(['rtl']), BODIES),
      appendBlock(CSS, RTL.markers, BODIES.rtl)
    );
  });

  test('both: the theme block comes before the rtl block', () => {
    assert.strictEqual(
      computeSyncedCss(CSS, on(['rtl', 'theme']), BODIES),
      appendBlock(appendBlock(CSS, THEME.markers, BODIES.theme), RTL.markers, BODIES.rtl)
    );
  });

  test('idempotent, and every state reaches every other state', () => {
    for (const from of STATES) {
      for (const to of STATES) {
        const start = computeSyncedCss(CSS, on(from), BODIES);
        const next = computeSyncedCss(start, on(to), BODIES);
        assert.strictEqual(next, computeSyncedCss(CSS, on(to), BODIES), `${from} -> ${to}`);
        assert.strictEqual(computeSyncedCss(next, on(to), BODIES), next, `${to} twice`);
      }
    }
  });

  test('toggling the theme leaves the rtl block byte-identical', () => {
    const rtlBlock = appendBlock('', RTL.markers, BODIES.rtl);
    for (const ids of [['rtl'], ['theme', 'rtl']] as FeatureId[][]) {
      assert.ok(computeSyncedCss(CSS, on(ids), BODIES).endsWith(rtlBlock), String(ids));
    }
  });

  test('an old RTL body is replaced with the current one', () => {
    const legacy = CSS + '\n/* bidi-rtl-patch-start */\n.old{direction:rtl}\n/* bidi-rtl-patch-end */';
    assert.strictEqual(
      computeSyncedCss(legacy, on(['rtl']), BODIES),
      appendBlock(CSS, RTL.markers, BODIES.rtl)
    );
  });
});
```

- [ ] **Step 2: Write the failing integration tests**

Create `src/test/sync.integration.test.ts`:

```ts
import * as assert from 'assert';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { FeatureId, RTL, THEME } from '../features';
import { appendBlock } from '../patcher';
import { syncInstall } from '../sync';

const ORIGINAL = '.foo{color:red}\n.bar{display:flex}';
const THEME_BODY = '.t{color:#1b1a18}';
const RTL_BODY = '.r{direction:rtl}';
const on = (...ids: FeatureId[]): Set<FeatureId> => new Set(ids);

async function write(file: string, content: string | Buffer): Promise<void> {
  await fs.promises.mkdir(path.dirname(file), { recursive: true });
  await fs.promises.writeFile(file, content);
}

suite('sync — syncInstall (file I/O)', () => {
  let tmp: string;
  let extRoot: string;
  let claudeDir: string;
  let cssPath: string;
  let fontTargets: string[];

  setup(async () => {
    tmp = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'bidi-sync-'));
    extRoot = path.join(tmp, 'ext');
    claudeDir = path.join(tmp, 'anthropic.claude-code-9.9.9');
    cssPath = path.join(claudeDir, 'webview', 'index.css');
    await write(path.join(extRoot, THEME.cssFile), THEME_BODY);
    await write(path.join(extRoot, RTL.cssFile), RTL_BODY);
    for (const asset of THEME.assets) {
      await write(path.join(extRoot, asset.source), Buffer.from(`font:${asset.target}`));
    }
    await write(cssPath, ORIGINAL);
    fontTargets = THEME.assets.map((a) => path.join(claudeDir, 'webview', a.target));
  });

  teardown(async () => {
    await fs.promises.rm(tmp, { recursive: true, force: true });
  });

  test('enabling both writes both blocks and copies the fonts', async () => {
    const result = await syncInstall(claudeDir, extRoot, on('theme', 'rtl'));
    assert.deepStrictEqual(result, { cssChanged: true, assetErrors: [] });
    const expected = appendBlock(appendBlock(ORIGINAL, THEME.markers, THEME_BODY), RTL.markers, RTL_BODY);
    assert.strictEqual(await fs.promises.readFile(cssPath, 'utf8'), expected);
    for (const target of fontTargets) {
      assert.ok(fs.existsSync(target), target);
    }
  });

  test('a second sync changes nothing', async () => {
    await syncInstall(claudeDir, extRoot, on('theme', 'rtl'));
    const result = await syncInstall(claudeDir, extRoot, on('theme', 'rtl'));
    assert.deepStrictEqual(result, { cssChanged: false, assetErrors: [] });
  });

  test('turning the theme off strips its block, deletes the fonts and keeps RTL', async () => {
    await syncInstall(claudeDir, extRoot, on('theme', 'rtl'));
    const result = await syncInstall(claudeDir, extRoot, on('rtl'));
    assert.strictEqual(result.cssChanged, true);
    assert.strictEqual(
      await fs.promises.readFile(cssPath, 'utf8'),
      appendBlock(ORIGINAL, RTL.markers, RTL_BODY)
    );
    for (const target of fontTargets) {
      assert.ok(!fs.existsSync(target), target);
    }
  });

  test('a changed font source is copied again', async () => {
    await syncInstall(claudeDir, extRoot, on('theme'));
    const asset = THEME.assets[0];
    await write(path.join(extRoot, asset.source), Buffer.from('font:v2-longer'));
    await syncInstall(claudeDir, extRoot, on('theme'));
    assert.strictEqual(
      await fs.promises.readFile(path.join(claudeDir, 'webview', asset.target), 'utf8'),
      'font:v2-longer'
    );
  });

  test('a missing font is reported, and the CSS is still synced', async () => {
    await fs.promises.rm(path.join(extRoot, THEME.assets[0].source));
    const result = await syncInstall(claudeDir, extRoot, on('theme'));
    assert.strictEqual(result.cssChanged, true);
    assert.strictEqual(result.assetErrors.length, 1);
    assert.ok(result.assetErrors[0].startsWith(THEME.assets[0].target), result.assetErrors[0]);
  });

  test('a legacy RTL block is replaced, not duplicated', async () => {
    await write(cssPath, ORIGINAL + '\n/* bidi-rtl-patch-start */\n.old{direction:rtl}\n/* bidi-rtl-patch-end */');
    await syncInstall(claudeDir, extRoot, on('rtl'));
    assert.strictEqual(
      await fs.promises.readFile(cssPath, 'utf8'),
      appendBlock(ORIGINAL, RTL.markers, RTL_BODY)
    );
  });

  test('leaves no temp files behind', async () => {
    await syncInstall(claudeDir, extRoot, on('theme', 'rtl'));
    await syncInstall(claudeDir, extRoot, on());
    const leftovers = (await fs.promises.readdir(path.join(claudeDir, 'webview')))
      .filter((f) => f.includes('-tmp-'));
    assert.deepStrictEqual(leftovers, []);
  });

  test('rejects when Claude Code has no index.css', async () => {
    await fs.promises.rm(cssPath);
    await assert.rejects(syncInstall(claudeDir, extRoot, on('rtl')));
  });
});
```

- [ ] **Step 3: Run the tests to verify they fail**

Run: `npm test`
Expected: compile error `Cannot find module '../sync'`.

- [ ] **Step 4: Implement `src/sync.ts`**

```ts
import * as crypto from 'crypto';
import * as fs from 'fs';
import * as path from 'path';
import { FEATURES, FeatureId } from './features';
import { appendBlock, stripBlock, writeFileAtomic } from './patcher';

export type BlockBodies = Readonly<Record<FeatureId, string>>;

/** Strips every known block, then appends the enabled ones in canonical order. */
export function computeSyncedCss(
  content: string,
  enabled: ReadonlySet<FeatureId>,
  bodies: BlockBodies
): string {
  let result = content;
  for (const feature of FEATURES) {
    result = stripBlock(result, feature.markers);
  }
  for (const feature of FEATURES) {
    if (enabled.has(feature.id)) {
      result = appendBlock(result, feature.markers, bodies[feature.id]);
    }
  }
  return result;
}

export async function loadBlockBodies(extensionRoot: string): Promise<BlockBodies> {
  const entries = await Promise.all(
    FEATURES.map(async (feature) => {
      const body = await fs.promises.readFile(path.join(extensionRoot, feature.cssFile), 'utf8');
      return [feature.id, body] as const;
    })
  );
  return Object.fromEntries(entries) as Record<FeatureId, string>;
}

export interface SyncResult {
  /** True when index.css was rewritten. */
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

async function syncAssets(
  webviewDir: string,
  extensionRoot: string,
  enabled: ReadonlySet<FeatureId>
): Promise<string[]> {
  const errors: string[] = [];
  for (const feature of FEATURES) {
    for (const asset of feature.assets) {
      const source = path.join(extensionRoot, asset.source);
      const target = path.join(webviewDir, asset.target);
      try {
        if (!enabled.has(feature.id)) {
          await fs.promises.rm(target, { force: true });
        } else if (!(await sameFile(source, target))) {
          await fs.promises.copyFile(source, target);
        }
      } catch (err: unknown) {
        errors.push(`${asset.target}: ${err instanceof Error ? err.message : String(err)}`);
      }
    }
  }
  return errors;
}

/**
 * Brings one Claude Code install in line with the enabled features. Fonts are
 * copied before the CSS is written, so the CSS never points at a missing file.
 */
export async function syncInstall(
  claudeCodeDir: string,
  extensionRoot: string,
  enabled: ReadonlySet<FeatureId>
): Promise<SyncResult> {
  const webviewDir = path.join(claudeCodeDir, 'webview');
  const cssPath = path.join(webviewDir, 'index.css');
  const content = await fs.promises.readFile(cssPath, 'utf8');
  const assetErrors = await syncAssets(webviewDir, extensionRoot, enabled);
  const next = computeSyncedCss(content, enabled, await loadBlockBodies(extensionRoot));
  if (next === content) {
    return { cssChanged: false, assetErrors };
  }
  await writeFileAtomic(cssPath, next);
  return { cssChanged: true, assetErrors };
}
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npm test`
Expected: `49 passing`.

- [ ] **Step 6: Commit**

```bash
git add src/sync.ts src/test/sync.test.ts src/test/sync.integration.test.ts
git commit -F - <<'EOF'
feat: sync every enabled block and the theme fonts into Claude Code

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
EOF
```

---

### Task 3: Health check

**Files:**
- Create: `src/health.ts`
- Test: `src/test/health.test.ts`

**Interfaces:**
- Consumes: nothing from earlier tasks.
- Produces (`src/health.ts`): `REQUIRED_CLASS_PREFIXES: readonly string[]`, `REQUIRED_JS_HOOKS: readonly string[]`, `TOKEN_BLOCK_MARKER = 'html{--app-'`, `interface HealthReport { damaged: boolean; missingClassPrefixes: string[]; missingJsHooks: string[] }`, `checkHealth(css: string, js: string): HealthReport`, `isHealthy(report: HealthReport): boolean`, `checkInstallHealth(claudeCodeDir: string): Promise<HealthReport>`, `formatHealthWarning(version: string, report: HealthReport): string`.

- [ ] **Step 1: Write the failing tests**

Create `src/test/health.test.ts`:

```ts
import * as assert from 'assert';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import {
  REQUIRED_CLASS_PREFIXES,
  REQUIRED_JS_HOOKS,
  checkHealth,
  checkInstallHealth,
  formatHealthWarning,
  isHealthy,
} from '../health';

const GOOD_CSS =
  'html{--app-primary-background:#000}' +
  REQUIRED_CLASS_PREFIXES.map((p) => `.${p}abc123{color:red}`).join('');
const GOOD_JS = REQUIRED_JS_HOOKS.map((h) => `x("${h}")`).join(';');

suite('health', () => {
  test('a complete install is healthy', () => {
    const report = checkHealth(GOOD_CSS, GOOD_JS);
    assert.deepStrictEqual(report, { damaged: false, missingClassPrefixes: [], missingJsHooks: [] });
    assert.strictEqual(isHealthy(report), true);
  });

  test('missing class prefixes are listed', () => {
    const report = checkHealth(GOOD_CSS.replace('.toolUse_abc123{color:red}', ''), GOOD_JS);
    assert.deepStrictEqual(report.missingClassPrefixes, ['toolUse_']);
    assert.strictEqual(isHealthy(report), false);
  });

  test('a file without the token block is damaged', () => {
    const report = checkHealth(GOOD_CSS.replace('html{--app-', 'body{--x-'), GOOD_JS);
    assert.strictEqual(report.damaged, true);
    assert.strictEqual(isHealthy(report), false);
  });

  test('missing JS hooks are listed', () => {
    const report = checkHealth(GOOD_CSS, GOOD_JS.replace('assistant-message', 'assistant-msg'));
    assert.deepStrictEqual(report.missingJsHooks, ['assistant-message']);
  });

  test('checkInstallHealth reads webview/index.css and webview/index.js', async () => {
    const dir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'bidi-health-'));
    try {
      await fs.promises.mkdir(path.join(dir, 'webview'));
      await fs.promises.writeFile(path.join(dir, 'webview', 'index.css'), GOOD_CSS);
      await fs.promises.writeFile(path.join(dir, 'webview', 'index.js'), GOOD_JS);
      assert.strictEqual(isHealthy(await checkInstallHealth(dir)), true);
    } finally {
      await fs.promises.rm(dir, { recursive: true, force: true });
    }
  });

  test('the warning names the version and what is missing', () => {
    const message = formatHealthWarning('2.1.300', {
      damaged: false,
      missingClassPrefixes: ['toolUse_'],
      missingJsHooks: ['Claude, '],
    });
    assert.ok(message.includes('2.1.300'), message);
    assert.ok(message.includes('toolUse_'), message);
    assert.ok(message.includes('"Claude, "'), message);
  });

  test('a damaged install gets a reinstall message', () => {
    const message = formatHealthWarning('2.1.292', {
      damaged: true,
      missingClassPrefixes: [],
      missingJsHooks: [],
    });
    assert.ok(message.includes('2.1.292') && message.includes('Reinstall Claude Code'), message);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm test`
Expected: compile error `Cannot find module '../health'`.

- [ ] **Step 3: Implement `src/health.ts`**

```ts
import * as fs from 'fs';
import * as path from 'path';

/** Class-name prefixes css/theme.css targets; each must still appear as `.prefix…` in index.css. */
export const REQUIRED_CLASS_PREFIXES: readonly string[] = [
  'messagesContainer_',
  'turn_',
  'timelineMessage_',
  'userMessage_',
  'toolUse_',
  'toolNameText_',
  'inputContainer_',
  'inputContainerBackground_',
  'inputFooter_',
  'footerButton_',
  'spacer_',
  'sendButton_',
  'modelPill_',
  'menuButton_',
  'codeBlockWrapper_',
];

/** Non-class hooks the theme's selectors rely on, looked up in index.js. */
export const REQUIRED_JS_HOOKS: readonly string[] = ['assistant-message', 'Claude, ', 'Message input'];

/** Claude Code defines its design tokens as `html{--app-…}`; a file without them is damaged. */
export const TOKEN_BLOCK_MARKER = 'html{--app-';

export interface HealthReport {
  damaged: boolean;
  missingClassPrefixes: string[];
  missingJsHooks: string[];
}

export function checkHealth(css: string, js: string): HealthReport {
  return {
    damaged: !css.includes(TOKEN_BLOCK_MARKER),
    missingClassPrefixes: REQUIRED_CLASS_PREFIXES.filter((p) => !css.includes(`.${p}`)),
    missingJsHooks: REQUIRED_JS_HOOKS.filter((h) => !js.includes(h)),
  };
}

export function isHealthy(report: HealthReport): boolean {
  return (
    !report.damaged &&
    report.missingClassPrefixes.length === 0 &&
    report.missingJsHooks.length === 0
  );
}

export async function checkInstallHealth(claudeCodeDir: string): Promise<HealthReport> {
  const webviewDir = path.join(claudeCodeDir, 'webview');
  const [css, js] = await Promise.all([
    fs.promises.readFile(path.join(webviewDir, 'index.css'), 'utf8'),
    fs.promises.readFile(path.join(webviewDir, 'index.js'), 'utf8'),
  ]);
  return checkHealth(css, js);
}

export function formatHealthWarning(version: string, report: HealthReport): string {
  if (report.damaged) {
    return `BiDi Theme: Claude Code ${version} has a damaged webview/index.css ` +
      '(its design tokens are missing). Reinstall Claude Code.';
  }
  const missing = [...report.missingClassPrefixes, ...report.missingJsHooks.map((h) => `"${h}"`)];
  return `BiDi Theme: Claude Code ${version} changed its markup, so parts of the theme ` +
    `may not apply. Missing: ${missing.join(', ')}.`;
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm test`
Expected: `56 passing`.

- [ ] **Step 5: Check the real install is healthy**

```bash
node -e "
require('./out/health').checkInstallHealth('/Users/snirhakmoun/.vscode-insiders/extensions/anthropic.claude-code-2.1.287-darwin-arm64')
  .then((r) => console.log(JSON.stringify(r)));
"
```

Expected: `{"damaged":false,"missingClassPrefixes":[],"missingJsHooks":[]}`

- [ ] **Step 6: Commit**

```bash
git add src/health.ts src/test/health.test.ts
git commit -F - <<'EOF'
feat: check Claude Code still has what the theme targets

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
EOF
```

---

### Task 4: Theme CSS, fonts and the rules test

**Files:**
- Create: `fonts/rubik-hebrew.woff2`, `fonts/rubik-latin.woff2`, `fonts/OFL.txt` (downloaded)
- Create: `css/theme.css`
- Test: `src/test/theme-css.test.ts`

**Interfaces:**
- Consumes: `THEME` from `./features` (`cssFile`, `assets`).
- Produces: `css/theme.css` (read by `loadBlockBodies`), the two woff2 files at `THEME.assets[*].source`.

- [ ] **Step 1: Download Rubik and its license**

```bash
mkdir -p fonts
curl -sSfL -o fonts/rubik-hebrew.woff2 https://fonts.gstatic.com/s/rubik/v31/iJWKBXyIfDnIV7nDrXyw023e1Ik.woff2
curl -sSfL -o fonts/rubik-latin.woff2 https://fonts.gstatic.com/s/rubik/v31/iJWKBXyIfDnIV7nBrXyw023e.woff2
curl -sSfL -o fonts/OFL.txt https://raw.githubusercontent.com/google/fonts/main/ofl/rubik/OFL.txt
file fonts/*.woff2 && wc -c fonts/*.woff2 && grep -m1 -o 'SIL OPEN FONT LICENSE[^-]*' fonts/OFL.txt
```

Expected: both files report `Web Open Font Format (Version 2)`; sizes `9352` (Hebrew) and `35324` (Latin); the last line contains `SIL OPEN FONT LICENSE Version 1.1`. These are Rubik v31 variable-weight (300–900) subsets as served by Google Fonts on 2026-10-09; the `unicode-range` values in Step 4 come from the same response.

- [ ] **Step 2: Write the failing rules test**

Create `src/test/theme-css.test.ts`:

```ts
import * as assert from 'assert';
import * as fs from 'fs';
import * as path from 'path';
import { THEME } from '../features';

const ROOT = path.join(__dirname, '..', '..');

interface TopLevelRule {
  prelude: string;
  body: string;
}

/** Splits a flat stylesheet (comments removed, no nesting) into top-level rules. */
function topLevelRules(css: string): TopLevelRule[] {
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
function splitSelectors(prelude: string): string[] {
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

suite('theme.css — rules', () => {
  const css = fs.readFileSync(path.join(ROOT, THEME.cssFile), 'utf8');
  const rules = topLevelRules(css);

  test('the only top-level at-rule is @font-face', () => {
    for (const rule of rules.filter((r) => r.prelude.startsWith('@'))) {
      assert.strictEqual(rule.prelude, '@font-face');
    }
  });

  test('every selector starts with body.vscode-dark', () => {
    for (const rule of rules.filter((r) => !r.prelude.startsWith('@'))) {
      for (const selector of splitSelectors(rule.prelude)) {
        assert.ok(/^body\.vscode-dark(?![\w-])/.test(selector), `unscoped selector: ${selector}`);
      }
    }
  });

  test('no direction, text-align or unicode-bidi declarations', () => {
    for (const rule of rules) {
      const bad = /(^|[;{\s])(direction|text-align|unicode-bidi)\s*:/i.exec(rule.body);
      assert.strictEqual(bad, null, `forbidden property in "${rule.prelude}"`);
    }
  });
});

suite('theme.css — assets', () => {
  const css = fs.readFileSync(path.join(ROOT, THEME.cssFile), 'utf8');

  test('every url() points at a declared theme asset, and every asset is used', () => {
    const urls = [...css.matchAll(/url\("([^"]+)"\)/g)].map((m) => m[1]).sort();
    assert.deepStrictEqual(urls, THEME.assets.map((a) => a.target).sort());
  });

  test('every asset source is a woff2 file', () => {
    for (const asset of THEME.assets) {
      const magic = fs.readFileSync(path.join(ROOT, asset.source)).subarray(0, 4).toString('latin1');
      assert.strictEqual(magic, 'wOF2', asset.source);
    }
  });

  test('the Rubik license ships with the fonts', () => {
    assert.ok(fs.readFileSync(path.join(ROOT, 'fonts', 'OFL.txt'), 'utf8').includes('SIL OPEN FONT LICENSE'));
  });
});
```

- [ ] **Step 3: Run the tests to verify they fail**

Run: `npm test`
Expected: the `theme.css` suites fail with `ENOENT: no such file or directory` for `css/theme.css`.

- [ ] **Step 4: Write `css/theme.css`**

```css
/* Warm reading theme for Claude Code, dark themes only.
   Rules (enforced by src/test/theme-css.test.ts): every selector starts with
   body.vscode-dark, only @font-face at top level, and no direction, text-align
   or unicode-bidi (those belong to css/rtl.css). */

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

/* Palette. Claude Code defines its tokens on html; redefining them on body
   makes every descendant use these values. Tokens that html derives from
   other tokens (accent, pills, inline code) are set here directly, because a
   derived value is computed on html and would not see these overrides. Both
   backgrounds get the panel color: the sidebar paints with primary, the
   editor tab with secondary. body also consumes the two chat font variables,
   so the whole panel switches to Rubik 15px. */
body.vscode-dark{
--app-primary-background:#1b1a18;
--app-secondary-background:#1b1a18;
--app-header-background:#1b1a18;
--app-primary-foreground:#ebe5da;
--app-secondary-foreground:#a39d92;
--app-disabled-foreground:#7d766a;
--app-primary-border-color:#3b362f;
--app-menu-border:#3b362f;
--app-widget-border:#3b362f;
--app-input-background:#242120;
--app-input-secondary-background:#242120;
--app-input-border:#736a5d;
--app-input-foreground:#f5f0e8;
--app-input-placeholder-foreground:#9a9387;
--app-menu-background:#242120;
--app-modal-background:#242120;
--app-menu-foreground:#ebe5da;
--app-menu-selection-background:#3a332b;
--app-menu-selection-foreground:#f5f0e8;
--app-list-active-background:#3a332b;
--app-list-active-foreground:#f5f0e8;
--app-list-hover-background:#2a2622;
--app-ghost-button-hover-background:#2a2622;
--app-accent-color:#d97757;
--app-button-background:#d97757;
--app-input-active-border:#d97757;
--app-badge-background:#d97757;
--app-button-foreground:#1b1a18;
--app-badge-foreground:#1b1a18;
--app-button-hover-background:#e3876a;
--app-link-foreground:#e8a07f;
--app-inline-code-background:#2b2824;
--app-inline-code-foreground:#f2b896;
--app-code-background:#121110;
--app-tool-background:#121110;
--app-pill-background:#2f2b26;
--app-pill-foreground:#ddd4c6;
--app-pill-hover-background:#38332c;
--app-success-foreground:#a8c792;
--vscode-chat-font-family:"BiDi Rubik",-apple-system,BlinkMacSystemFont,system-ui,sans-serif;
--vscode-chat-font-size:15px;
}

/* Reading column: the conversation shares the composer's 680px column. */
body.vscode-dark [class*="messagesContainer_"]>*{
max-width:680px;
width:100%;
margin-inline:auto;
box-sizing:border-box;
}

/* Your messages: a soft block with an accent bar where the text starts. */
body.vscode-dark [class*="userMessage_"]{
background:#262320;
color:#f5f0e8;
border:0;
border-inline-start:3px solid #d97757;
border-radius:14px;
padding:12px 16px;
}

/* Claude's text rows: no timeline dot, no line, no 30px gutter. */
body.vscode-dark [class*="timelineMessage_"][data-testid="assistant-message"]:has(>span[class*="root_"]){
padding-left:0;
}
body.vscode-dark [class*="timelineMessage_"][data-testid="assistant-message"]:has(>span[class*="root_"])::before,
body.vscode-dark [class*="timelineMessage_"][data-testid="assistant-message"]:has(>span[class*="root_"])::after{
display:none;
}

/* Claude's markdown. */
body.vscode-dark [data-testid="assistant-message"]>span[class*="root_"]{
line-height:1.75;
}
body.vscode-dark [data-testid="assistant-message"]>span[class*="root_"] p{
margin:0 0 12px;
}
body.vscode-dark [data-testid="assistant-message"]>span[class*="root_"] p:last-child{
margin-bottom:0;
}
body.vscode-dark [data-testid="assistant-message"]>span[class*="root_"] h1,
body.vscode-dark [data-testid="assistant-message"]>span[class*="root_"] h2,
body.vscode-dark [data-testid="assistant-message"]>span[class*="root_"] h3{
font-weight:600;
color:#f5f0e8;
}
body.vscode-dark [data-testid="assistant-message"]>span[class*="root_"] h1{
font-size:20px;
}
body.vscode-dark [data-testid="assistant-message"]>span[class*="root_"] h2{
font-size:18px;
}
body.vscode-dark [data-testid="assistant-message"]>span[class*="root_"] h3{
font-size:16px;
}
body.vscode-dark [data-testid="assistant-message"]>span[class*="root_"] li::marker{
color:#d97757;
}
body.vscode-dark [class*="codeBlockWrapper_"],
body.vscode-dark [class*="codeBlockWrapper_"]>pre{
border-radius:12px;
}
body.vscode-dark [class*="codeBlockWrapper_"]>pre{
padding:12px 16px;
}

/* Tool and thinking rows. Nothing wraps consecutive rows, so each run is
   drawn as one box: shared fill and side borders on every row, the top edge
   on the first row of a run and the bottom edge on the last. */
body.vscode-dark [data-testid="assistant-message"][aria-label^="Claude, "]{
background:#211f1c;
border-left:1px solid #2b2824;
border-right:1px solid #2b2824;
padding-right:12px;
font-size:12.5px;
color:#968f83;
}
body.vscode-dark [data-testid="assistant-message"][aria-label^="Claude, "] [class*="toolNameText_"]{
color:#cfc6b7;
font-weight:600;
}
body.vscode-dark [data-testid="assistant-message"][aria-label^="Claude, "]:not([data-testid="assistant-message"][aria-label^="Claude, "]+[data-testid="assistant-message"][aria-label^="Claude, "]){
border-top:1px solid #2b2824;
border-top-left-radius:12px;
border-top-right-radius:12px;
margin-top:4px;
}
body.vscode-dark [data-testid="assistant-message"][aria-label^="Claude, "]:not(:has(+[data-testid="assistant-message"][aria-label^="Claude, "])){
border-bottom:1px solid #2b2824;
border-bottom-left-radius:12px;
border-bottom-right-radius:12px;
margin-bottom:12px;
}

/* The timeline line runs only between the dots of one group. */
body.vscode-dark [data-testid="assistant-message"][aria-label^="Claude, "]:not([data-testid="assistant-message"][aria-label^="Claude, "]+[data-testid="assistant-message"][aria-label^="Claude, "])::after{
top:calc(var(--message-padding-top,8px) + 10px);
}
body.vscode-dark [data-testid="assistant-message"][aria-label^="Claude, "]:not(:has(+[data-testid="assistant-message"][aria-label^="Claude, "]))::after{
bottom:auto;
height:calc(var(--message-padding-top,8px) + 10px);
}
body.vscode-dark [data-testid="assistant-message"][aria-label^="Claude, "]:not([data-testid="assistant-message"][aria-label^="Claude, "]+[data-testid="assistant-message"][aria-label^="Claude, "]):not(:has(+[data-testid="assistant-message"][aria-label^="Claude, "]))::after{
display:none;
}

/* Composer: a rounder box, roomier buttons, status on the right. Its outer
   size and position are measured by Claude Code, so they stay untouched.
   The box and its background layer both read --corner-radius-large. */
body.vscode-dark fieldset[class*="inputContainer_"]{
--corner-radius-large:16px;
}
body.vscode-dark [class*="inputFooter_"]{
gap:6px;
}
body.vscode-dark [class*="inputFooter_"] button[title="Add"],
body.vscode-dark [class*="inputFooter_"] [class*="menuButton_"]{
width:30px;
height:28px;
padding:0;
border-radius:9px;
background:#2f2b26;
color:#ddd4c6;
}
body.vscode-dark [class*="inputFooter_"] [class*="footerButton_"],
body.vscode-dark [class*="inputFooter_"] [class*="modelPill_"]{
min-height:28px;
padding:0 10px;
border-radius:9px;
font-size:12.5px;
background:#2f2b26;
color:#ddd4c6;
}
body.vscode-dark [class*="inputFooter_"]>:has(>button[class*="footerButtonPrimary_"])>button,
body.vscode-dark [class*="inputFooter_"] button[class*="modelPill_"][role="combobox"]{
background:transparent;
border:1px solid #453e35;
}
body.vscode-dark [class*="inputFooter_"] button[title="Add"]:hover,
body.vscode-dark [class*="inputFooter_"] [class*="menuButton_"]:hover,
body.vscode-dark [class*="inputFooter_"] [class*="footerButton_"]:hover,
body.vscode-dark [class*="inputFooter_"] [class*="modelPill_"]:hover{
background:#38332c;
}
body.vscode-dark [class*="inputFooter_"]>:has(>button[class*="footerButtonPrimary_"])>button:hover,
body.vscode-dark [class*="inputFooter_"] button[class*="modelPill_"][role="combobox"]:hover{
background:#2a2622;
}
body.vscode-dark [class*="inputFooter_"]>[class*="spacer_"]{
order:1;
}
body.vscode-dark [class*="inputFooter_"]>:has(>[class*="usageButtonV2_"]),
body.vscode-dark [class*="inputFooter_"]>[data-cache-window],
body.vscode-dark [class*="inputFooter_"]>[class*="pill_"],
body.vscode-dark [class*="inputFooter_"]>[class*="modelPill_"]{
order:2;
}
body.vscode-dark [class*="inputFooter_"]>:has(>button[class*="footerButtonPrimary_"]){
order:3;
}
body.vscode-dark [class*="inputFooter_"]>button[type="submit"][class*="sendButton_"]{
order:4;
}
body.vscode-dark [class*="inputFooter_"] button[type="submit"][class*="sendButton_"]{
width:34px;
height:34px;
border-radius:50%;
}
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npm test`
Expected: `62 passing`.

- [ ] **Step 6: Commit**

```bash
git add css/theme.css fonts src/test/theme-css.test.ts
git commit -F - <<'EOF'
feat: warm reading theme CSS with bundled Rubik

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
EOF
```

---

### Task 5: Visual fixture against Claude Code's real CSS

A static page reproduces the panel's DOM shapes with Claude Code 2.1.287's real class names. A script syncs both blocks into a copy of the real `index.css`, serves it over a local HTTP server (so fonts load like in the webview), renders it in headless Chrome for dark and light, checks computed styles, and saves screenshots.

**Files:**
- Create: `scripts/fixture/panel.html`
- Create: `scripts/render-fixture.js`
- Modify: `package.json` (`scripts.fixture`), `.vscodeignore`, `.gitignore`

**Interfaces:**
- Consumes: `computeSyncedCss`, `loadBlockBodies` from `out/sync.js`; `THEME` from `out/features.js` (compiled by `npm run compile`).
- Produces: `npm run fixture -- <claude-code-extension-dir>`; exit code 0 when every check passes; `fixture-out/fixture-dark.png` and `fixture-out/fixture-light.png`.

- [ ] **Step 1: Create `scripts/fixture/panel.html`**

```html
<!doctype html>
<html>
<head>
<meta charset="utf-8">
<link rel="stylesheet" href="index.css">
<style>
/* What VS Code and Claude Code's webview template provide (Dark Modern values). */
:root{
--vscode-chat-font-family:-apple-system,BlinkMacSystemFont,sans-serif;
--vscode-chat-font-size:13px;
--vscode-editor-font-family:Menlo,Monaco,monospace;
--vscode-editor-font-size:12px;
--vscode-foreground:#cccccc;
--vscode-descriptionForeground:#9d9d9d;
--vscode-sideBar-background:#181818;
--vscode-editor-background:#1f1f1f;
--vscode-input-background:#313131;
--vscode-input-border:#3c3c3c;
--vscode-input-foreground:#cccccc;
--vscode-input-placeholderForeground:#989898;
--vscode-button-background:#0078d4;
--vscode-button-foreground:#ffffff;
--vscode-button-hoverBackground:#026ec1;
--vscode-focusBorder:#0078d4;
--vscode-textPreformat-foreground:#d0d0d0;
--vscode-textCodeBlock-background:#2b2b2b;
--vscode-widget-border:#313131;
--vscode-errorForeground:#f85149;
}
html,body{height:100%;margin:0}
</style>
</head>
<body class="__THEME_CLASS__">
<div id="root">
<div class="root_aqhumA editorMode_aqhumA">
<div class="sessionBody_aqhumA">
<div class="sessionLayout_07S1Yg">
<div class="chatContainer_07S1Yg">
<div class="messagesContainer_07S1Yg stickyMode_07S1Yg fullEditor_07S1Yg" role="region" aria-label="Claude Code conversation" tabindex="0">
<div class="turn_07S1Yg">
  <div class="message_07S1Yg userMessageContainer_07S1Yg stickyHeader_07S1Yg" role="article" aria-label="You" data-transcript-message>
    <div class="userMessageContainer_07S1Yg">
      <div class="userMessage_07S1Yg"><div class="expandableContainer_xGDvVg"><div><div class="content_xGDvVg"><span dir="auto">להוסיף בדיקה ל-parseConfig שמכסה קובץ ריק, ולעדכן את ה-README</span></div></div></div></div>
    </div>
  </div>
  <div class="message_07S1Yg timelineMessage_07S1Yg dotSuccess_07S1Yg" data-testid="assistant-message" role="article" aria-label="Claude, Read" data-transcript-message>
    <div class="toolUse_uq5aLg"><div class="root_ZUQaOA"><summary class="toolSummary_ZUQaOA"><span><span class="toolNameText_ZUQaOA">Read</span> <span class="toolNameTextSecondary_ZUQaOA">src/config.ts</span></span></summary></div></div>
  </div>
  <div class="message_07S1Yg timelineMessage_07S1Yg dotSuccess_07S1Yg" data-testid="assistant-message" role="article" aria-label="Claude, Edit" data-transcript-message>
    <div class="toolUse_uq5aLg"><div class="root_ZUQaOA"><summary class="toolSummary_ZUQaOA"><span><span class="toolNameText_ZUQaOA">Edit</span> <span class="toolNameTextSecondary_ZUQaOA">src/config.test.ts</span></span></summary><div class="secondaryLine_mLrg7g"><span class="content_mLrg7g">Added 6 lines</span></div></div></div>
  </div>
  <div class="message_07S1Yg timelineMessage_07S1Yg dotFailure_07S1Yg" data-testid="assistant-message" role="article" aria-label="Claude, Bash" data-transcript-message>
    <div class="toolUse_uq5aLg"><div class="root_ZUQaOA"><summary class="toolSummary_ZUQaOA"><span><span class="toolNameText_ZUQaOA">Bash</span> <span class="toolNameTextSecondary_ZUQaOA">npm test</span></span></summary><div class="secondaryLine_mLrg7g"><span class="content_mLrg7g">1 failing</span></div></div></div>
  </div>
  <div class="message_07S1Yg timelineMessage_07S1Yg" data-testid="assistant-message" role="article" aria-label="Claude, thinking" data-transcript-message>
    <details class="thinking_aHyQPQ"><summary class="thinkingSummary_aHyQPQ">Thinking</summary></details>
  </div>
  <div class="message_07S1Yg timelineMessage_07S1Yg" data-testid="assistant-message" role="article" aria-label="Claude" data-transcript-message>
    <span class="root_-a7MRw"><h3>סיכום השינויים</h3><p>עדכנתי את <code>parseConfig</code> כך שקובץ ריק מחזיר את ערכי ברירת המחדל במקום לזרוק <code>TypeError</code>.</p><ul><li>הוספתי fixture של קובץ ריק</li><li>עדכנתי את ה-README עם דוגמה חדשה</li></ul><div class="codeBlockWrapper_-a7MRw"><pre><code>test('empty file → defaults', () =&gt; {
  expect(parseConfig('')).toEqual(DEFAULTS);
});</code></pre></div><p>רוצה שאוסיף גם מקרה של קובץ עם הערות בלבד?</p></span>
  </div>
  <div class="message_07S1Yg timelineMessage_07S1Yg dotSuccess_07S1Yg" data-testid="assistant-message" role="article" aria-label="Claude, Bash" data-transcript-message>
    <div class="toolUse_uq5aLg"><div class="root_ZUQaOA"><summary class="toolSummary_ZUQaOA"><span><span class="toolNameText_ZUQaOA">Bash</span> <span class="toolNameTextSecondary_ZUQaOA">npm test</span></span></summary><div class="secondaryLine_mLrg7g"><span class="content_mLrg7g">12 passing</span></div></div></div>
  </div>
</div>
<div style="height:150px"></div>
</div>
<div class="inputContainer_07S1Yg">
<div>
<div class="inputWrapper_cKsPxg">
<form>
<fieldset class="inputContainer_cKsPxg" data-permission-mode="default">
  <div class="inputContainerBackground_cKsPxg"></div>
  <div class="messageInputContainer_cKsPxg">
    <div class="messageInput_cKsPxg" contenteditable="plaintext-only" role="textbox" aria-label="Message input">כן, ואז להריץ שוב את כל הבדיקות</div>
    <div class="mentionMirror_cKsPxg" aria-hidden="true">כן, ואז להריץ שוב את כל הבדיקות</div>
  </div>
  <div class="inputFooter_gGYT1w inputFooterV2_gGYT1w" data-fit-stage="0">
    <div class="addButtonContainer_Lu5mZA"><button class="addButton_Lu5mZA" type="button" title="Add">+</button></div>
    <button class="menuButton_gGYT1w" type="button" title="Show command menu (/)">/</button>
    <div class="host_v41KHw"><button class="usage_P2QnnQ usageButtonV2_gGYT1w" type="button" aria-label="62% context used — click to compact">◔</button></div>
    <button class="modelPill_gGYT1w" type="button" role="combobox">Opus</button>
    <div class="divider_gGYT1w"></div>
    <span class="selectionChip_gGYT1w"><span class="footerButton_gGYT1w footerButtonStatic_gGYT1w">config.ts</span></span>
    <div class="spacer_gGYT1w"></div>
    <div class="container_8RAulQ"><button class="footerButton_gGYT1w footerButtonPrimary_gGYT1w" type="button">Edit automatically</button></div>
    <button class="sendButton_gGYT1w" type="submit" data-permission-mode="default" aria-label="Send message">↑</button>
  </div>
</fieldset>
</form>
</div>
</div>
</div>
</div>
</div>
</div>
</div>
</div>
<script>
document.fonts.ready.then(() => {
  const q = (s) => document.querySelector(s);
  const cs = (s) => getComputedStyle(q(s));
  const text = '[data-testid="assistant-message"] > span[class*="root_"]';
  const report = {
    fontsLoaded: [...document.fonts].filter((f) => f.family.replace(/"/g, '') === 'BiDi Rubik' && f.status === 'loaded').length,
    textFont: cs(text).fontFamily,
    textSize: cs(text).fontSize,
    inputFont: cs('[role="textbox"]').fontFamily,
    inputSize: cs('[role="textbox"]').fontSize,
    mirrorFont: cs('[class*="mentionMirror_"]').fontFamily,
    mirrorSize: cs('[class*="mentionMirror_"]').fontSize,
    panelBg: cs('[class*="messagesContainer_"]').backgroundColor,
    userBg: cs('[class*="userMessage_"]').backgroundColor,
    groupBg: cs('[aria-label="Claude, Read"]').backgroundColor,
    turnWidth: Math.round(q('[class*="turn_"]').getBoundingClientRect().width),
    sendSize: Math.round(q('[class*="sendButton_"]').getBoundingClientRect().width),
    footerOrder: [...q('[class*="inputFooter_"]').children].map((el) => getComputedStyle(el).order).join(','),
  };
  document.body.setAttribute('data-report', JSON.stringify(report));
});
</script>
</body>
</html>
```

- [ ] **Step 2: Create `scripts/render-fixture.js`**

```js
#!/usr/bin/env node
// Renders scripts/fixture/panel.html against a real Claude Code index.css with
// both blocks synced, in dark and light mode, checks computed styles and saves
// screenshots. Usage: node scripts/render-fixture.js <claude-code-extension-dir> [out-dir]
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const http = require('http');
const { execFile } = require('child_process');
const { computeSyncedCss, loadBlockBodies } = require('../out/sync');
const { THEME } = require('../out/features');

const ROOT = path.join(__dirname, '..');
const CHROME = process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const TYPES = { '.html': 'text/html; charset=utf-8', '.css': 'text/css', '.woff2': 'font/woff2' };

function serve(dir) {
  const server = http.createServer((req, res) => {
    const file = path.join(dir, path.basename(decodeURIComponent(req.url.split('?')[0])));
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

function chrome(args) {
  return new Promise((resolve, reject) => {
    execFile(
      CHROME,
      ['--headless=new', '--disable-gpu', '--hide-scrollbars', '--virtual-time-budget=5000', ...args],
      { timeout: 60000, maxBuffer: 32 * 1024 * 1024 },
      (err, stdout) => (err ? reject(err) : resolve(stdout))
    );
  });
}

function check(mode, r) {
  const problems = [];
  const expect = (ok, message) => {
    if (!ok) {
      problems.push(message);
    }
  };
  if (mode === 'dark') {
    expect(r.fontsLoaded >= 2, `BiDi Rubik faces loaded: ${r.fontsLoaded} (want 2)`);
    expect(r.textFont.startsWith('"BiDi Rubik"'), `text font: ${r.textFont}`);
    expect(r.textSize === '15px', `text size: ${r.textSize}`);
    expect(r.inputSize === '15px', `input size: ${r.inputSize}`);
    expect(r.inputFont === r.mirrorFont && r.inputSize === r.mirrorSize, 'input and mirror layers differ');
    expect(r.panelBg === 'rgb(27, 26, 24)', `panel background: ${r.panelBg}`);
    expect(r.userBg === 'rgb(38, 35, 32)', `user message background: ${r.userBg}`);
    expect(r.groupBg === 'rgb(33, 31, 28)', `tool group background: ${r.groupBg}`);
    expect(r.turnWidth <= 680, `turn width: ${r.turnWidth}`);
    expect(r.sendSize === 34, `send button: ${r.sendSize}px`);
    expect(r.footerOrder === '0,0,2,2,0,0,1,3,4', `footer order: ${r.footerOrder}`);
  } else {
    expect(!r.textFont.includes('BiDi Rubik'), `light theme uses the theme font: ${r.textFont}`);
    expect(r.userBg !== 'rgb(38, 35, 32)', 'light theme uses the theme user-message color');
  }
  return problems;
}

async function main() {
  const [claudeDir, outArg] = process.argv.slice(2);
  if (!claudeDir) {
    console.error('usage: node scripts/render-fixture.js <claude-code-extension-dir> [out-dir]');
    process.exit(2);
  }
  const outDir = path.resolve(outArg || path.join(ROOT, 'fixture-out'));
  fs.mkdirSync(outDir, { recursive: true });
  const work = fs.mkdtempSync(path.join(os.tmpdir(), 'bidi-fixture-'));

  const css = fs.readFileSync(path.join(claudeDir, 'webview', 'index.css'), 'utf8');
  const synced = computeSyncedCss(css, new Set(['theme', 'rtl']), await loadBlockBodies(ROOT));
  fs.writeFileSync(path.join(work, 'index.css'), synced);
  for (const asset of THEME.assets) {
    fs.copyFileSync(path.join(ROOT, asset.source), path.join(work, asset.target));
  }
  const page = fs.readFileSync(path.join(__dirname, 'fixture', 'panel.html'), 'utf8');
  for (const mode of ['dark', 'light']) {
    fs.writeFileSync(path.join(work, `${mode}.html`), page.replace('__THEME_CLASS__', `vscode-${mode}`));
  }

  const server = await serve(work);
  const base = `http://127.0.0.1:${server.address().port}`;
  const profile = `--user-data-dir=${path.join(work, 'chrome-profile')}`;
  let failed = false;
  try {
    for (const mode of ['dark', 'light']) {
      const url = `${base}/${mode}.html`;
      const shot = path.join(outDir, `fixture-${mode}.png`);
      await chrome([profile, '--window-size=1100,900', `--screenshot=${shot}`, url]);
      const dom = await chrome([profile, '--dump-dom', url]);
      const match = /data-report="([^"]*)"/.exec(dom);
      if (!match) {
        throw new Error(`${mode}: the page did not produce a report`);
      }
      const report = JSON.parse(match[1].replace(/&quot;/g, '"').replace(/&amp;/g, '&'));
      const problems = check(mode, report);
      console.log(`${mode}: ${problems.length ? 'FAIL' : 'ok'}`);
      for (const problem of problems) {
        console.log(`  - ${problem}`);
      }
      failed = failed || problems.length > 0;
    }
  } finally {
    server.close();
    fs.rmSync(work, { recursive: true, force: true });
  }
  console.log(`screenshots: ${outDir}`);
  process.exit(failed ? 1 : 0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
```

- [ ] **Step 3: Wire the script and keep its output out of git and the VSIX**

In `package.json`, add to `"scripts"` (after `"watch"`):

```json
    "fixture": "npm run compile && node scripts/render-fixture.js",
```

Append to `.gitignore`:

```
fixture-out
```

Append to `.vscodeignore`:

```
scripts/**
fixture-out/**
```

- [ ] **Step 4: Run the fixture**

Run: `npm run fixture -- "/Users/snirhakmoun/.vscode-insiders/extensions/anthropic.claude-code-2.1.287-darwin-arm64"`
Expected:

```
dark: ok
light: ok
screenshots: /Users/snirhakmoun/vscode-bidi-flipper/fixture-out
```

If `dark` fails with `text font`, `text size` or `input size`, Claude Code no longer sizes those elements from `body`. Add this rule to the end of `css/theme.css`, run `npm test` (the rules test must still pass) and run the fixture again:

```css
/* Fallback: these containers do not inherit the chat font from body. */
body.vscode-dark [class*="messagesContainer_"],
body.vscode-dark fieldset[class*="inputContainer_"]{
font-family:var(--vscode-chat-font-family);
font-size:var(--vscode-chat-font-size);
}
```

Any other failure is a real defect in `css/theme.css`: fix the rule the message names and re-run.

- [ ] **Step 5: Compare the screenshots with the mockup**

Open `fixture-out/fixture-dark.png` and `docs/superpowers/specs/assets/2026-10-09-warm-theme-mockup.html`. Confirm:
- The conversation sits in one centered column, the same width as the input box.
- The user message is a rounded block with an orange bar on the right (the RTL block makes the conversation right-to-left).
- Read, Edit, the failed Bash and Thinking form one rounded box with status dots; the connecting line starts at the first dot and ends at the last.
- Claude's text has no dot and no left gutter; the heading, list markers and the rounded code block match the mockup.
- The single Bash row after the text is its own small box without a line.
- The input box has 16px corners; footer: `+`, `/`, divider, `config.ts` on the left; context, `Opus`, `Edit automatically` and the 34px round send button on the right.

Open `fixture-out/fixture-light.png` and confirm none of the warm palette or Rubik appears.

- [ ] **Step 6: Commit**

```bash
git add scripts package.json .gitignore .vscodeignore css/theme.css
git commit -F - <<'EOF'
test: render the theme against Claude Code's real CSS in headless Chrome

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
EOF
```

---

### Task 6: Cleanup for both modules

**Files:**
- Modify: `src/cleanup.ts`, `src/uninstall.ts`
- Test: `src/test/cleanup.test.ts` (rewritten)

**Interfaces:**
- Consumes: `FEATURES`, `RTL`, `THEME` from `./features`; `stripBlock`, `appendBlock`, `writeFileAtomic` from `./patcher`.
- Produces: `findClaudeCodeCssPaths(extensionsRoot: string): Promise<string[]>` (unchanged), `cleanInstall(cssPath: string): Promise<boolean>`, `cleanupAll(extensionsRoot: string): Promise<number>` (replaces `removePatchFromAll`); `uninstall.main(extensionsRoot: string): Promise<number>` now returns the `cleanupAll` count.

- [ ] **Step 1: Rewrite the tests**

Replace `src/test/cleanup.test.ts` with:

```ts
import * as assert from 'assert';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { cleanupAll, findClaudeCodeCssPaths } from '../cleanup';
import { RTL, THEME } from '../features';
import { appendBlock } from '../patcher';
import { main } from '../uninstall';

const ORIGINAL_A = '.a{color:red}\n.b{display:flex}';
const ORIGINAL_B = '.c{margin:0}';
const ORIGINAL_C = '.d{padding:0}';
const OTHER = appendBlock('.other{top:0}', RTL.markers, '.x{}');

async function write(file: string, content: string): Promise<void> {
  await fs.promises.mkdir(path.dirname(file), { recursive: true });
  await fs.promises.writeFile(file, content, 'utf8');
}

suite('cleanup — uninstall', () => {
  let root: string;
  let cssA: string;
  let cssB: string;
  let cssC: string;
  let cssD: string;
  let fontsC: string[];

  setup(async () => {
    root = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'bidi-cleanup-'));
    cssA = path.join(root, 'anthropic.claude-code-2.1.287-darwin-arm64', 'webview', 'index.css');
    cssB = path.join(root, 'anthropic.claude-code-2.1.292-darwin-arm64', 'webview', 'index.css');
    cssC = path.join(root, 'anthropic.claude-code-2.1.300-darwin-arm64', 'webview', 'index.css');
    cssD = path.join(root, 'some.other-ext', 'webview', 'index.css');
    await write(cssA, appendBlock(ORIGINAL_A, RTL.markers, '.r{}'));
    await write(cssB, ORIGINAL_B);
    await write(cssC, appendBlock(appendBlock(ORIGINAL_C, THEME.markers, '.t{}'), RTL.markers, '.r{}'));
    fontsC = THEME.assets.map((a) => path.join(path.dirname(cssC), a.target));
    for (const font of fontsC) {
      await write(font, 'font');
    }
    await fs.promises.mkdir(path.join(root, 'anthropic.claude-code-2.1.100-darwin-arm64'));
    await write(cssD, OTHER);
  });

  teardown(async () => {
    await fs.promises.rm(root, { recursive: true, force: true });
  });

  test('findClaudeCodeCssPaths returns only claude-code css files', async () => {
    const found = (await findClaudeCodeCssPaths(root)).sort();
    assert.deepStrictEqual(found, [cssA, cssB, cssC].sort());
  });

  test('findClaudeCodeCssPaths follows symlinked claude-code folders', async () => {
    const target = path.join(root, 'real-target');
    await write(path.join(target, 'webview', 'index.css'), ORIGINAL_B);
    const link = path.join(root, 'anthropic.claude-code-2.1.400-darwin-arm64');
    await fs.promises.symlink(target, link, 'dir');
    const found = await findClaudeCodeCssPaths(root);
    assert.ok(found.includes(path.join(link, 'webview', 'index.css')));
  });

  test('cleanupAll strips both blocks and deletes the theme fonts', async () => {
    assert.strictEqual(await cleanupAll(root), 2);
    assert.strictEqual(await fs.promises.readFile(cssA, 'utf8'), ORIGINAL_A);
    assert.strictEqual(await fs.promises.readFile(cssB, 'utf8'), ORIGINAL_B);
    assert.strictEqual(await fs.promises.readFile(cssC, 'utf8'), ORIGINAL_C);
    assert.strictEqual(await fs.promises.readFile(cssD, 'utf8'), OTHER);
    for (const font of fontsC) {
      assert.ok(!fs.existsSync(font), font);
    }
  });

  test('missing root yields [] and 0 without throwing', async () => {
    const missing = path.join(root, 'does-not-exist');
    assert.deepStrictEqual(await findClaudeCodeCssPaths(missing), []);
    assert.strictEqual(await cleanupAll(missing), 0);
  });

  test('uninstall main() returns the cleaned count', async () => {
    assert.strictEqual(await main(root), 2);
    assert.strictEqual(await fs.promises.readFile(cssC, 'utf8'), ORIGINAL_C);
    assert.strictEqual(await main(path.join(root, 'nope')), 0);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm test`
Expected: compile error `Module '"../cleanup"' has no exported member 'cleanupAll'`.

- [ ] **Step 3: Rewrite `src/cleanup.ts`**

```ts
import * as fs from 'fs';
import * as path from 'path';
import { FEATURES } from './features';
import { stripBlock, writeFileAtomic } from './patcher';

const CLAUDE_DIR_PREFIX = 'anthropic.claude-code-';

export async function findClaudeCodeCssPaths(extensionsRoot: string): Promise<string[]> {
  let entries: string[];
  try {
    entries = await fs.promises.readdir(extensionsRoot);
  } catch {
    return [];
  }

  const found: string[] = [];
  for (const entry of entries) {
    // Decide by name only (not Dirent type) so symlinked folders are included.
    if (!entry.toLowerCase().startsWith(CLAUDE_DIR_PREFIX)) {
      continue;
    }
    const cssPath = path.join(extensionsRoot, entry, 'webview', 'index.css');
    try {
      await fs.promises.access(cssPath);
      found.push(cssPath);
    } catch {
      // no webview CSS in this folder
    }
  }
  return found;
}

// Strips every block and deletes every asset this extension wrote into one
// install. Returns true if anything changed.
export async function cleanInstall(cssPath: string): Promise<boolean> {
  let changed = false;
  const content = await fs.promises.readFile(cssPath, 'utf8');
  let cleaned = content;
  for (const feature of FEATURES) {
    cleaned = stripBlock(cleaned, feature.markers);
  }
  if (cleaned !== content) {
    await writeFileAtomic(cssPath, cleaned);
    changed = true;
  }
  for (const feature of FEATURES) {
    for (const asset of feature.assets) {
      try {
        await fs.promises.unlink(path.join(path.dirname(cssPath), asset.target));
        changed = true;
      } catch {
        // not there
      }
    }
  }
  return changed;
}

export async function cleanupAll(extensionsRoot: string): Promise<number> {
  let count = 0;
  for (const cssPath of await findClaudeCodeCssPaths(extensionsRoot)) {
    try {
      if (await cleanInstall(cssPath)) {
        count++;
      }
    } catch {
      // one bad install must not stop the others
    }
  }
  return count;
}
```

- [ ] **Step 4: Update `src/uninstall.ts`**

```ts
import * as path from 'path';
import { cleanupAll } from './cleanup';

export async function main(extensionsRoot: string): Promise<number> {
  try {
    const count = await cleanupAll(extensionsRoot);
    console.log(`BiDi RTL & Theme: cleaned ${count} Claude Code install(s).`);
    return count;
  } catch (err: unknown) {
    console.log(`BiDi RTL & Theme: cleanup failed — ${err instanceof Error ? err.message : String(err)}`);
    return 0;
  }
}

// Run by `vscode:uninstall`; this file lives at <extensionsRoot>/<ext-dir>/out/uninstall.js.
if (require.main === module) {
  void main(path.resolve(__dirname, '..', '..'));
}
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npm test`
Expected: `62 passing`.

- [ ] **Step 6: Commit**

```bash
git add src/cleanup.ts src/uninstall.ts src/test/cleanup.test.ts
git commit -F - <<'EOF'
feat: uninstall cleanup removes both blocks and the theme fonts

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
EOF
```

---

### Task 7: Wire the extension, status bar and manifest; drop the legacy patch API

**Files:**
- Modify: `src/status.ts`, `src/test/status.test.ts`
- Rewrite: `src/extension.ts`
- Modify: `src/patcher.ts` (remove legacy RTL functions)
- Delete: `src/test/patcher.test.ts`, `src/test/patcher.integration.test.ts` (their coverage now lives in `blocks.test.ts` and `sync*.test.ts`)
- Modify: `package.json`

**Interfaces:**
- Consumes: `FEATURES`, `Feature`, `FeatureId`, `RTL` (`./features`); `syncInstall` (`./sync`); `checkInstallHealth`, `formatHealthWarning`, `isHealthy` (`./health`).
- Produces: `getStatusBarState(label: string, enabled: boolean): StatusBarState`; commands `bidi-theme.toggle`, `bidi-rtl.toggle`, `bidi-rtl.applyPatch`, `bidi-rtl.removePatch`.

- [ ] **Step 1: Update the status test**

Replace `src/test/status.test.ts` with:

```ts
import * as assert from 'assert';
import { getStatusBarState } from '../status';

suite('status bar state', () => {
  test('on', () => {
    const s = getStatusBarState('RTL', true);
    assert.strictEqual(s.text, '$(check) RTL');
    assert.strictEqual(s.tooltip, 'BiDi RTL for Claude Code is on — click to turn off');
  });

  test('off', () => {
    const s = getStatusBarState('Theme', false);
    assert.strictEqual(s.text, '$(circle-slash) Theme');
    assert.strictEqual(s.tooltip, 'BiDi Theme for Claude Code is off — click to turn on');
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm test`
Expected: compile error `Expected 1 arguments, but got 2.` in `status.test.ts`.

- [ ] **Step 3: Update `src/status.ts`**

```ts
export interface StatusBarState {
  text: string;
  tooltip: string;
}

export function getStatusBarState(label: string, enabled: boolean): StatusBarState {
  return enabled
    ? {
        text: `$(check) ${label}`,
        tooltip: `BiDi ${label} for Claude Code is on — click to turn off`,
      }
    : {
        text: `$(circle-slash) ${label}`,
        tooltip: `BiDi ${label} for Claude Code is off — click to turn on`,
      };
}
```

- [ ] **Step 4: Rewrite `src/extension.ts`**

```ts
import * as vscode from 'vscode';
import { FEATURES, Feature, FeatureId, RTL } from './features';
import { checkInstallHealth, formatHealthWarning, isHealthy } from './health';
import { getStatusBarState } from './status';
import { syncInstall } from './sync';

const CLAUDE_EXTENSION_ID = 'anthropic.claude-code';
const LAST_WARNED_KEY = 'bidiTheme.lastWarnedVersion';

function formatError(action: string, err: unknown): string {
  const isPermission = err instanceof Error &&
    (err as NodeJS.ErrnoException).code === 'EACCES';
  const msg = err instanceof Error ? err.message : String(err);
  const hint = isPermission ? ' Try running VSCode as administrator.' : '';
  return `BiDi RTL & Theme: Could not ${action} — ${msg}.${hint}`;
}

async function offerReload(message: string): Promise<void> {
  const choice = await vscode.window.showInformationMessage(message, 'Reload Window');
  if (choice === 'Reload Window') {
    await vscode.commands.executeCommand('workbench.action.reloadWindow')
      .then(undefined, () => { /* reload unavailable; user will need to restart manually */ });
  }
}

type SyncOutcome = 'changed' | 'unchanged' | 'error' | 'missing';

// Every sync goes through this chain so that activation, the onDidChange
// listener and the commands never read/write index.css concurrently.
let syncQueue: Promise<unknown> = Promise.resolve();

function enqueue<T>(op: () => Promise<T>): Promise<T> {
  const result = syncQueue.then(op);
  syncQueue = result.catch(() => undefined);
  return result;
}

// Error toasts are not awaited, so a pending toast never blocks the queue.
function reportError(action: string, err: unknown, silent: boolean): void {
  if (silent) {
    console.error(formatError(action, err));
  } else {
    void vscode.window.showErrorMessage(formatError(action, err));
  }
}

function warnMissing(): void {
  void vscode.window.showWarningMessage(
    'BiDi RTL & Theme: Claude Code extension not found. Please install it first.'
  );
}

export async function activate(context: vscode.ExtensionContext): Promise<void> {
  const isEnabled = (feature: Feature): boolean =>
    context.globalState.get<boolean>(feature.flagKey, true);
  const enabledIds = (): Set<FeatureId> =>
    new Set(FEATURES.filter(isEnabled).map((feature) => feature.id));

  const statusItems = FEATURES.map((feature, index) => {
    const item = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100 - index);
    item.command = feature.toggleCommand;
    item.show();
    return { feature, item };
  });
  const refreshStatusBar = (): void => {
    for (const { feature, item } of statusItems) {
      const state = getStatusBarState(feature.label, isEnabled(feature));
      item.text = state.text;
      item.tooltip = state.tooltip;
    }
  };
  refreshStatusBar();

  // At most one warning per Claude Code version; the toast is never awaited.
  const warnIfUnhealthy = async (ext: vscode.Extension<unknown>): Promise<void> => {
    const version = String(ext.packageJSON?.version ?? 'unknown');
    if (context.globalState.get<string>(LAST_WARNED_KEY) === version) {
      return;
    }
    const report = await checkInstallHealth(ext.extensionPath);
    if (isHealthy(report)) {
      return;
    }
    await context.globalState.update(LAST_WARNED_KEY, version);
    void vscode.window.showWarningMessage(formatHealthWarning(version, report));
  };

  const sync = (silent: boolean): Promise<SyncOutcome> => enqueue(async () => {
    const ext = vscode.extensions.getExtension(CLAUDE_EXTENSION_ID);
    if (!ext) {
      return 'missing';
    }
    const enabled = enabledIds();
    let cssChanged: boolean;
    try {
      const result = await syncInstall(ext.extensionPath, context.extensionPath, enabled);
      for (const assetError of result.assetErrors) {
        console.error(`BiDi Theme: font copy failed — ${assetError}`);
      }
      cssChanged = result.cssChanged;
    } catch (err: unknown) {
      reportError('update Claude Code CSS', err, silent);
      return 'error';
    }
    if (enabled.size > 0) {
      await warnIfUnhealthy(ext).catch((err: unknown) => {
        console.error(formatError('check Claude Code', err));
      });
    }
    return cssChanged ? 'changed' : 'unchanged';
  });

  // Sets one module's flag and syncs; the flag is restored if the sync fails.
  const setFeature = async (feature: Feature, enabled: boolean): Promise<SyncOutcome> => {
    const previous = isEnabled(feature);
    await context.globalState.update(feature.flagKey, enabled);
    const outcome = await sync(false);
    if (outcome === 'missing' || outcome === 'error') {
      await context.globalState.update(feature.flagKey, previous);
    }
    if (outcome === 'missing') {
      warnMissing();
    }
    refreshStatusBar();
    return outcome;
  };

  // globalState is shared across windows; refresh when this window regains focus.
  const windowListener = vscode.window.onDidChangeWindowState((e) => {
    if (e.focused) {
      refreshStatusBar();
    }
  });

  // Claude Code updates change its extensionPath (version is in the folder
  // name), so the new install needs syncing.
  const changeListener = vscode.extensions.onDidChange(() => {
    void sync(true);
  });

  const toggleCommands = FEATURES.map((feature) =>
    vscode.commands.registerCommand(feature.toggleCommand, async () => {
      const enabled = !isEnabled(feature);
      const outcome = await setFeature(feature, enabled);
      if (outcome === 'changed' || outcome === 'unchanged') {
        void offerReload(
          `BiDi ${feature.label}: turned ${enabled ? 'on' : 'off'}. Reload window to apply.`
        );
      }
    })
  );

  const applyCmd = vscode.commands.registerCommand('bidi-rtl.applyPatch', async () => {
    if ((await setFeature(RTL, true)) === 'changed') {
      void offerReload('BiDi RTL: RTL patch applied to Claude Code. Reload window to apply.');
    }
  });

  const removeCmd = vscode.commands.registerCommand('bidi-rtl.removePatch', async () => {
    const outcome = await setFeature(RTL, false);
    if (outcome === 'changed') {
      void offerReload('BiDi RTL: RTL patch removed. Reload window to apply.');
    } else if (outcome === 'unchanged') {
      void vscode.window.showInformationMessage('BiDi RTL: No RTL patch found — nothing to remove.');
    }
  });

  context.subscriptions.push(
    ...statusItems.map(({ item }) => item),
    windowListener,
    changeListener,
    ...toggleCommands,
    applyCmd,
    removeCmd
  );

  // The initial sync runs after everything is registered and never blocks
  // activation on a toast.
  const outcome = await sync(false);
  if (outcome === 'missing') {
    warnMissing();
  } else if (outcome === 'changed') {
    void offerReload('BiDi RTL & Theme: Claude Code CSS updated. Reload window to apply.');
  }
}

export function deactivate(): void {}
```

- [ ] **Step 5: Drop the legacy patch API**

In `src/patcher.ts`, delete the `path` import, the `CSS_PATCH` constant and its comment, and the functions `isCssPatched`, `applyCssPatchToContent`, `removeCssPatchFromContent`, `applyCssPatch` and `removeCssPatch`. The file keeps the `fs` import, `BlockMarkers`, `escapeRegExp`, `stripBlock`, `appendBlock` and `writeFileAtomic` (with its existing comment).

Then delete the legacy tests and their compiled copies (tsc does not remove stale output, and mocha would still run it):

```bash
git rm src/test/patcher.test.ts src/test/patcher.integration.test.ts
rm -rf out
```

- [ ] **Step 6: Update `package.json`**

Set these fields:

```json
  "displayName": "BiDi RTL & Theme for Claude Code",
  "description": "RTL direction and a warm reading theme for the Claude Code panel",
  "version": "0.1.0",
```

Append this entry to `contributes.commands`, after `bidi-rtl.toggle`:

```json
      {
        "command": "bidi-theme.toggle",
        "title": "BiDi Theme: Toggle Warm Theme On/Off"
      }
```

- [ ] **Step 7: Run the tests and check nothing references the legacy API**

```bash
npm test && (grep -rn "applyCssPatch\|removeCssPatch\|isCssPatched\|removePatchFromAll" src || echo "no legacy references")
```

Expected: `46 passing`, then `no legacy references`.

- [ ] **Step 8: Re-run the fixture (sync code changed underneath it)**

Run: `npm run fixture -- "/Users/snirhakmoun/.vscode-insiders/extensions/anthropic.claude-code-2.1.287-darwin-arm64"`
Expected: `dark: ok` and `light: ok`.

- [ ] **Step 9: Commit**

```bash
git add -A src package.json
git commit -F - <<'EOF'
feat: theme toggle and sync-driven activation; drop the legacy patch API

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
EOF
```

---

### Task 8: Session clock in the status bar

Added during execution at the user's request (spec section "Session clock"). A third status-bar item shows when the current 5-hour usage window resets, from Anthropic's usage endpoint, authenticated with Claude Code's own OAuth token.

**Files:**
- Create: `src/usage.ts`
- Test: `src/test/usage.test.ts`
- Modify: `src/extension.ts` (full file below), `package.json` (two commands)

**Interfaces:**
- Consumes: the Task 7 `src/extension.ts` (replaced in full in Step 5).
- Produces (`src/usage.ts`): `USAGE_URL`, `interface UsageWindow { utilization: number; resetsAt: Date | null }`, `interface Usage { session: UsageWindow | null; weekly: UsageWindow | null }`, `interface UsageStatus { text: string; tooltip: string }`, `parseUsage(body: unknown): Usage | null`, `formatClock(date: Date): string`, `formatUsageStatus(usage: Usage, now: Date): UsageStatus`, `formatUsageError(reason: string): UsageStatus`, `parseAccessToken(raw: string): string | null`, `readAccessToken(): Promise<string | null>`, `type FetchLike`, `fetchUsage(token: string, fetchFn?: FetchLike): Promise<Usage>`.
- Security contract: the token is read fresh for each refresh, held only for that request, never logged or stored, and sent only to `USAGE_URL`.

- [ ] **Step 1: Write the failing tests**

Create `src/test/usage.test.ts`:

```ts
import * as assert from 'assert';
import {
  FetchLike,
  USAGE_URL,
  fetchUsage,
  formatClock,
  formatUsageError,
  formatUsageStatus,
  parseAccessToken,
  parseUsage,
} from '../usage';

const BODY = {
  five_hour: { utilization: 42.4, resets_at: '2026-10-09T14:42:00.000Z' },
  seven_day: { utilization: 31, resets_at: '2026-10-15T06:00:00.000Z' },
  seven_day_opus: null,
};

suite('usage — parse', () => {
  test('reads the session and weekly windows', () => {
    const usage = parseUsage(BODY);
    assert.ok(usage && usage.session && usage.weekly);
    assert.strictEqual(usage.session.utilization, 42.4);
    assert.strictEqual(usage.session.resetsAt?.toISOString(), '2026-10-09T14:42:00.000Z');
    assert.strictEqual(usage.weekly.utilization, 31);
  });

  test('accepts windows nested under rate_limits', () => {
    assert.deepStrictEqual(parseUsage({ rate_limits: BODY }), parseUsage(BODY));
  });

  test('a null reset time means no active window; malformed windows are dropped', () => {
    const usage = parseUsage({ five_hour: { utilization: 0, resets_at: null }, seven_day: { utilization: 'x' } });
    assert.deepStrictEqual(usage, { session: { utilization: 0, resetsAt: null }, weekly: null });
  });

  test('unrelated bodies are rejected', () => {
    assert.strictEqual(parseUsage({ error: 'nope' }), null);
    assert.strictEqual(parseUsage('five_hour'), null);
    assert.strictEqual(parseUsage(null), null);
  });
});

suite('usage — format', () => {
  const at = (h: number, m: number, day = 9): Date => new Date(2026, 9, day, h, m);

  test('formatClock is a zero-padded 24-hour clock', () => {
    assert.strictEqual(formatClock(at(7, 5)), '07:05');
    assert.strictEqual(formatClock(at(17, 42)), '17:42');
  });

  test('an active window shows its reset time and usage', () => {
    const status = formatUsageStatus(
      { session: { utilization: 42.4, resetsAt: at(17, 42) }, weekly: { utilization: 31, resetsAt: at(9, 0, 15) } },
      at(15, 0)
    );
    assert.strictEqual(status.text, '$(watch) 17:42 · 42%');
    assert.ok(status.tooltip.includes('Claude session (5h): 42% used, resets at 17:42.'), status.tooltip);
    assert.ok(status.tooltip.includes('Weekly (7 days): 31% used, resets Thu 09:00.'), status.tooltip);
    assert.ok(status.tooltip.endsWith('Click to refresh.'), status.tooltip);
  });

  test('no active window shows a dash', () => {
    const status = formatUsageStatus({ session: { utilization: 0, resetsAt: null }, weekly: null }, at(15, 0));
    assert.strictEqual(status.text, '$(watch) —');
    assert.ok(
      status.tooltip.startsWith('Claude session (5h): no active window — it starts with your next message.'),
      status.tooltip
    );
  });

  test('a reset time in the past counts as no active window', () => {
    const status = formatUsageStatus({ session: { utilization: 97, resetsAt: at(14, 0) }, weekly: null }, at(15, 0));
    assert.strictEqual(status.text, '$(watch) —');
  });

  test('errors show a dash and the reason', () => {
    const status = formatUsageError('not signed in to Claude Code');
    assert.strictEqual(status.text, '$(watch) —');
    assert.strictEqual(
      status.tooltip,
      'Claude session (5h): unavailable — not signed in to Claude Code. Click to retry.'
    );
  });
});

suite('usage — credentials and request', () => {
  test('parseAccessToken reads claudeAiOauth.accessToken', () => {
    assert.strictEqual(parseAccessToken('{"claudeAiOauth":{"accessToken":"tok-123","refreshToken":"r"}}'), 'tok-123');
    assert.strictEqual(parseAccessToken('{"claudeAiOauth":{}}'), null);
    assert.strictEqual(parseAccessToken('not json'), null);
  });

  test('fetchUsage sends the bearer token and the OAuth beta header', async () => {
    let seen: { url: string; headers: Record<string, string> } | undefined;
    const fake: FetchLike = async (url, init) => {
      seen = { url, headers: init.headers };
      return { ok: true, status: 200, json: async () => BODY };
    };
    const usage = await fetchUsage('tok-123', fake);
    assert.strictEqual(seen?.url, USAGE_URL);
    assert.strictEqual(seen?.headers.Authorization, 'Bearer tok-123');
    assert.strictEqual(seen?.headers['anthropic-beta'], 'oauth-2025-04-20');
    assert.strictEqual(usage.session?.utilization, 42.4);
  });

  test('fetchUsage rejects HTTP errors and unexpected bodies', async () => {
    const reply = (code: number, body: unknown): FetchLike => async () => ({
      ok: code < 400,
      status: code,
      json: async () => body,
    });
    await assert.rejects(fetchUsage('t', reply(401, {})), /HTTP 401/);
    await assert.rejects(fetchUsage('t', reply(200, { hello: 1 })), /unexpected usage response/);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm test`
Expected: compile error `Cannot find module '../usage'`.

- [ ] **Step 3: Implement `src/usage.ts`**

```ts
import { execFile } from 'child_process';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

export const USAGE_URL = 'https://api.anthropic.com/api/oauth/usage';
const KEYCHAIN_SERVICE = 'Claude Code-credentials';
const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export interface UsageWindow {
  /** Share of the window used, 0–100. */
  utilization: number;
  /** When the window resets; null when no window is active. */
  resetsAt: Date | null;
}

export interface Usage {
  session: UsageWindow | null;
  weekly: UsageWindow | null;
}

export interface UsageStatus {
  text: string;
  tooltip: string;
}

function parseWindow(raw: unknown): UsageWindow | null {
  if (!raw || typeof raw !== 'object') {
    return null;
  }
  const { utilization, resets_at: resetsAt } = raw as { utilization?: unknown; resets_at?: unknown };
  if (typeof utilization !== 'number' || !Number.isFinite(utilization)) {
    return null;
  }
  if (resetsAt === null || resetsAt === undefined) {
    return { utilization, resetsAt: null };
  }
  const time = typeof resetsAt === 'string' ? Date.parse(resetsAt) : NaN;
  return Number.isFinite(time) ? { utilization, resetsAt: new Date(time) } : null;
}

/** Reads the usage endpoint's body; the windows sit at the top level or under rate_limits. */
export function parseUsage(body: unknown): Usage | null {
  if (!body || typeof body !== 'object') {
    return null;
  }
  const root = body as Record<string, unknown>;
  const limits = (
    root.rate_limits && typeof root.rate_limits === 'object' ? root.rate_limits : root
  ) as Record<string, unknown>;
  if (!('five_hour' in limits) && !('seven_day' in limits)) {
    return null;
  }
  return { session: parseWindow(limits.five_hour), weekly: parseWindow(limits.seven_day) };
}

/** 24-hour local clock, e.g. 07:05. */
export function formatClock(date: Date): string {
  return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
}

function weeklyLine(weekly: UsageWindow | null): string {
  if (!weekly) {
    return '';
  }
  const resets = weekly.resetsAt
    ? `, resets ${WEEKDAYS[weekly.resetsAt.getDay()]} ${formatClock(weekly.resetsAt)}`
    : '';
  return `\nWeekly (7 days): ${Math.round(weekly.utilization)}% used${resets}.`;
}

export function formatUsageStatus(usage: Usage, now: Date): UsageStatus {
  const session = usage.session;
  const weekly = weeklyLine(usage.weekly);
  if (!session || !session.resetsAt || session.resetsAt.getTime() <= now.getTime()) {
    return {
      text: '$(watch) —',
      tooltip: `Claude session (5h): no active window — it starts with your next message.${weekly}\nClick to refresh.`,
    };
  }
  const clock = formatClock(session.resetsAt);
  const used = Math.round(session.utilization);
  return {
    text: `$(watch) ${clock} · ${used}%`,
    tooltip: `Claude session (5h): ${used}% used, resets at ${clock}.${weekly}\nClick to refresh.`,
  };
}

export function formatUsageError(reason: string): UsageStatus {
  return {
    text: '$(watch) —',
    tooltip: `Claude session (5h): unavailable — ${reason}. Click to retry.`,
  };
}

/** Extracts the OAuth access token from Claude Code's stored credentials JSON. */
export function parseAccessToken(raw: string): string | null {
  try {
    const token = (JSON.parse(raw) as { claudeAiOauth?: { accessToken?: unknown } }).claudeAiOauth?.accessToken;
    return typeof token === 'string' && token.length > 0 ? token : null;
  } catch {
    return null;
  }
}

function readKeychain(): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile(
      '/usr/bin/security',
      ['find-generic-password', '-s', KEYCHAIN_SERVICE, '-w'],
      { timeout: 10000 },
      (err, stdout) => (err ? reject(err) : resolve(stdout.trim()))
    );
  });
}

/**
 * Reads Claude Code's OAuth access token from the macOS Keychain, or from
 * ~/.claude/.credentials.json elsewhere. Returns null when there is none
 * (signed out, or using an API key): an expected state the status bar shows,
 * not an error.
 */
export async function readAccessToken(): Promise<string | null> {
  try {
    const raw = process.platform === 'darwin'
      ? await readKeychain()
      : await fs.promises.readFile(path.join(os.homedir(), '.claude', '.credentials.json'), 'utf8');
    return parseAccessToken(raw);
  } catch {
    return null;
  }
}

export type FetchLike = (
  url: string,
  init: { headers: Record<string, string>; signal?: AbortSignal }
) => Promise<{ ok: boolean; status: number; json(): Promise<unknown> }>;

/** Fetches the current usage windows. The token is sent only to USAGE_URL. */
export async function fetchUsage(
  token: string,
  fetchFn: FetchLike = (url, init) => fetch(url, init)
): Promise<Usage> {
  const response = await fetchFn(USAGE_URL, {
    headers: { Authorization: `Bearer ${token}`, 'anthropic-beta': 'oauth-2025-04-20' },
    signal: AbortSignal.timeout(10000),
  });
  if (!response.ok) {
    throw new Error(`usage request failed (HTTP ${response.status})`);
  }
  const usage = parseUsage(await response.json());
  if (!usage) {
    throw new Error('unexpected usage response');
  }
  return usage;
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm test`
Expected: `58 passing`.

- [ ] **Step 5: Wire the clock into `src/extension.ts`**

Replace `src/extension.ts` with the Task 7 version plus the session clock (new: the `./usage` import, `USAGE_FLAG`, `USAGE_REFRESH_MS`, the "Session clock" block, the focus refresh in `windowListener`, the two `bidi-usage.*` commands, their subscriptions, and `void refreshUsage()` before the initial sync):

```ts
import * as vscode from 'vscode';
import { FEATURES, Feature, FeatureId, RTL } from './features';
import { checkInstallHealth, formatHealthWarning, isHealthy } from './health';
import { getStatusBarState } from './status';
import { syncInstall } from './sync';
import { UsageStatus, fetchUsage, formatUsageError, formatUsageStatus, readAccessToken } from './usage';

const CLAUDE_EXTENSION_ID = 'anthropic.claude-code';
const LAST_WARNED_KEY = 'bidiTheme.lastWarnedVersion';
const USAGE_FLAG = 'bidiUsage.enabled';
const USAGE_REFRESH_MS = 5 * 60 * 1000;

function formatError(action: string, err: unknown): string {
  const isPermission = err instanceof Error &&
    (err as NodeJS.ErrnoException).code === 'EACCES';
  const msg = err instanceof Error ? err.message : String(err);
  const hint = isPermission ? ' Try running VSCode as administrator.' : '';
  return `BiDi RTL & Theme: Could not ${action} — ${msg}.${hint}`;
}

async function offerReload(message: string): Promise<void> {
  const choice = await vscode.window.showInformationMessage(message, 'Reload Window');
  if (choice === 'Reload Window') {
    await vscode.commands.executeCommand('workbench.action.reloadWindow')
      .then(undefined, () => { /* reload unavailable; user will need to restart manually */ });
  }
}

type SyncOutcome = 'changed' | 'unchanged' | 'error' | 'missing';

// Every sync goes through this chain so that activation, the onDidChange
// listener and the commands never read/write index.css concurrently.
let syncQueue: Promise<unknown> = Promise.resolve();

function enqueue<T>(op: () => Promise<T>): Promise<T> {
  const result = syncQueue.then(op);
  syncQueue = result.catch(() => undefined);
  return result;
}

// Error toasts are not awaited, so a pending toast never blocks the queue.
function reportError(action: string, err: unknown, silent: boolean): void {
  if (silent) {
    console.error(formatError(action, err));
  } else {
    void vscode.window.showErrorMessage(formatError(action, err));
  }
}

function warnMissing(): void {
  void vscode.window.showWarningMessage(
    'BiDi RTL & Theme: Claude Code extension not found. Please install it first.'
  );
}

export async function activate(context: vscode.ExtensionContext): Promise<void> {
  const isEnabled = (feature: Feature): boolean =>
    context.globalState.get<boolean>(feature.flagKey, true);
  const enabledIds = (): Set<FeatureId> =>
    new Set(FEATURES.filter(isEnabled).map((feature) => feature.id));

  const statusItems = FEATURES.map((feature, index) => {
    const item = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100 - index);
    item.command = feature.toggleCommand;
    item.show();
    return { feature, item };
  });
  const refreshStatusBar = (): void => {
    for (const { feature, item } of statusItems) {
      const state = getStatusBarState(feature.label, isEnabled(feature));
      item.text = state.text;
      item.tooltip = state.tooltip;
    }
  };
  refreshStatusBar();

  // Session clock: when the 5-hour usage window resets. Errors show in the
  // item's tooltip, never as a toast.
  const usageItem = vscode.window.createStatusBarItem(
    vscode.StatusBarAlignment.Right,
    100 - FEATURES.length
  );
  usageItem.command = 'bidi-usage.refresh';
  let lastUsageFetch = 0;
  let resetTimer: NodeJS.Timeout | undefined;
  const isUsageEnabled = (): boolean => context.globalState.get<boolean>(USAGE_FLAG, true);

  const refreshUsage = async (): Promise<void> => {
    clearTimeout(resetTimer);
    if (!isUsageEnabled()) {
      usageItem.hide();
      return;
    }
    lastUsageFetch = Date.now();
    let status: UsageStatus;
    try {
      const token = await readAccessToken();
      if (!token) {
        throw new Error('not signed in to Claude Code');
      }
      const usage = await fetchUsage(token);
      status = formatUsageStatus(usage, new Date());
      // Refresh right after the window resets, if that happens before the next tick.
      const untilReset = (usage.session?.resetsAt?.getTime() ?? 0) - Date.now();
      if (untilReset > 0 && untilReset < USAGE_REFRESH_MS) {
        resetTimer = setTimeout(() => void refreshUsage(), untilReset + 5000);
      }
    } catch (err: unknown) {
      status = formatUsageError(err instanceof Error ? err.message : String(err));
    }
    usageItem.text = status.text;
    usageItem.tooltip = status.tooltip;
    usageItem.show();
  };
  const usageTimer = setInterval(() => void refreshUsage(), USAGE_REFRESH_MS);

  // At most one warning per Claude Code version; the toast is never awaited.
  const warnIfUnhealthy = async (ext: vscode.Extension<unknown>): Promise<void> => {
    const version = String(ext.packageJSON?.version ?? 'unknown');
    if (context.globalState.get<string>(LAST_WARNED_KEY) === version) {
      return;
    }
    const report = await checkInstallHealth(ext.extensionPath);
    if (isHealthy(report)) {
      return;
    }
    await context.globalState.update(LAST_WARNED_KEY, version);
    void vscode.window.showWarningMessage(formatHealthWarning(version, report));
  };

  const sync = (silent: boolean): Promise<SyncOutcome> => enqueue(async () => {
    const ext = vscode.extensions.getExtension(CLAUDE_EXTENSION_ID);
    if (!ext) {
      return 'missing';
    }
    const enabled = enabledIds();
    let cssChanged: boolean;
    try {
      const result = await syncInstall(ext.extensionPath, context.extensionPath, enabled);
      for (const assetError of result.assetErrors) {
        console.error(`BiDi Theme: font copy failed — ${assetError}`);
      }
      cssChanged = result.cssChanged;
    } catch (err: unknown) {
      reportError('update Claude Code CSS', err, silent);
      return 'error';
    }
    if (enabled.size > 0) {
      await warnIfUnhealthy(ext).catch((err: unknown) => {
        console.error(formatError('check Claude Code', err));
      });
    }
    return cssChanged ? 'changed' : 'unchanged';
  });

  // Sets one module's flag and syncs; the flag is restored if the sync fails.
  const setFeature = async (feature: Feature, enabled: boolean): Promise<SyncOutcome> => {
    const previous = isEnabled(feature);
    await context.globalState.update(feature.flagKey, enabled);
    const outcome = await sync(false);
    if (outcome === 'missing' || outcome === 'error') {
      await context.globalState.update(feature.flagKey, previous);
    }
    if (outcome === 'missing') {
      warnMissing();
    }
    refreshStatusBar();
    return outcome;
  };

  // globalState is shared across windows; refresh when this window regains focus.
  const windowListener = vscode.window.onDidChangeWindowState((e) => {
    if (e.focused) {
      refreshStatusBar();
      if (Date.now() - lastUsageFetch > 60_000) {
        void refreshUsage();
      }
    }
  });

  // Claude Code updates change its extensionPath (version is in the folder
  // name), so the new install needs syncing.
  const changeListener = vscode.extensions.onDidChange(() => {
    void sync(true);
  });

  const toggleCommands = FEATURES.map((feature) =>
    vscode.commands.registerCommand(feature.toggleCommand, async () => {
      const enabled = !isEnabled(feature);
      const outcome = await setFeature(feature, enabled);
      if (outcome === 'changed' || outcome === 'unchanged') {
        void offerReload(
          `BiDi ${feature.label}: turned ${enabled ? 'on' : 'off'}. Reload window to apply.`
        );
      }
    })
  );

  const applyCmd = vscode.commands.registerCommand('bidi-rtl.applyPatch', async () => {
    if ((await setFeature(RTL, true)) === 'changed') {
      void offerReload('BiDi RTL: RTL patch applied to Claude Code. Reload window to apply.');
    }
  });

  const removeCmd = vscode.commands.registerCommand('bidi-rtl.removePatch', async () => {
    const outcome = await setFeature(RTL, false);
    if (outcome === 'changed') {
      void offerReload('BiDi RTL: RTL patch removed. Reload window to apply.');
    } else if (outcome === 'unchanged') {
      void vscode.window.showInformationMessage('BiDi RTL: No RTL patch found — nothing to remove.');
    }
  });

  const usageRefreshCmd = vscode.commands.registerCommand('bidi-usage.refresh', () => refreshUsage());

  const usageToggleCmd = vscode.commands.registerCommand('bidi-usage.toggle', async () => {
    await context.globalState.update(USAGE_FLAG, !isUsageEnabled());
    await refreshUsage();
  });

  context.subscriptions.push(
    ...statusItems.map(({ item }) => item),
    usageItem,
    windowListener,
    changeListener,
    ...toggleCommands,
    applyCmd,
    removeCmd,
    usageRefreshCmd,
    usageToggleCmd,
    { dispose: () => { clearInterval(usageTimer); clearTimeout(resetTimer); } }
  );

  void refreshUsage();

  // The initial sync runs after everything is registered and never blocks
  // activation on a toast.
  const outcome = await sync(false);
  if (outcome === 'missing') {
    warnMissing();
  } else if (outcome === 'changed') {
    void offerReload('BiDi RTL & Theme: Claude Code CSS updated. Reload window to apply.');
  }
}

export function deactivate(): void {}
```

- [ ] **Step 6: Add the commands to `package.json`**

Append to `contributes.commands`, after `bidi-theme.toggle`:

```json
      {
        "command": "bidi-usage.toggle",
        "title": "BiDi Usage: Toggle Session Clock On/Off"
      },
      {
        "command": "bidi-usage.refresh",
        "title": "BiDi Usage: Refresh Session Clock"
      }
```

- [ ] **Step 7: Run the tests and check the token never reaches a log**

```bash
npm test && (grep -n "console\.\(log\|error\|warn\)" src/usage.ts || echo "usage.ts never logs")
```

Expected: `58 passing`, then `usage.ts never logs`.

- [ ] **Step 8: Commit**

```bash
git add src/usage.ts src/test/usage.test.ts src/extension.ts package.json
git commit -F - <<'EOF'
feat: status-bar clock for when the 5-hour session resets

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
EOF
```

---

### Task 9: README, package, install and the manual check

**Files:**
- Modify: `README.md`

**Interfaces:**
- Consumes: the finished extension.
- Produces: `vscode-bidi-rtl-0.1.0.vsix`, installed into VS Code Insiders.

- [ ] **Step 1: Rewrite `README.md`**

````markdown
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
`api.anthropic.com`, and never logged or stored. macOS may ask once to allow Keychain access.

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
````

- [ ] **Step 2: Test and package**

```bash
npm test && npx vsce package && npx vsce ls | grep -E '^(css|fonts|out)/' | sort
```

Expected: `58 passing`; `vscode-bidi-rtl-0.1.0.vsix` created; the listing includes `css/rtl.css`, `css/theme.css`, `fonts/OFL.txt`, `fonts/rubik-hebrew.woff2`, `fonts/rubik-latin.woff2` and the `out/*.js` modules (`cleanup`, `extension`, `features`, `health`, `patcher`, `status`, `sync`, `uninstall`, `usage`), and nothing under `out/test/` or `scripts/`.

- [ ] **Step 3: Install into VS Code Insiders**

```bash
"/Applications/Visual Studio Code - Insiders 2.app/Contents/Resources/app/bin/code" --install-extension vscode-bidi-rtl-0.1.0.vsix --force
```

Expected: `Extension 'vscode-bidi-rtl-0.1.0.vsix' was successfully installed.`

- [ ] **Step 4: Reload and verify the install was patched**

Ask the user to run **Developer: Reload Window** in VS Code Insiders, then:

```bash
C=/Users/snirhakmoun/.vscode-insiders/extensions/anthropic.claude-code-2.1.287-darwin-arm64/webview
grep -c 'bidi-theme-patch-start' $C/index.css; grep -c 'bidi-rtl-patch-start' $C/index.css; ls $C | grep bidi-theme
```

Expected: `1`, `1`, then `bidi-theme-rubik-hebrew.woff2` and `bidi-theme-rubik-latin.woff2`. The status bar shows `✓ Theme`, `✓ RTL` and the session clock (`⏱ HH:MM · N%`, or `⏱ —` with the reason in its tooltip). If the extension offered **Reload Window** after activation, reload once more so the Claude Code panel loads the new CSS.

- [ ] **Step 5: Manual check with the user**

Walk through the spec's manual list with the user and record the results:
- A conversation with successful and failed tools, thinking, and code blocks.
- A permission request, the `/` menu and the model menu.
- A narrow sidebar (< 500px): the footer still collapses sensibly.
- A light theme and a high-contrast theme: the panel is unchanged.
- All four RTL/theme on/off combinations, via the status-bar buttons.
- The session clock: its time matches Claude Code's usage view ("Session (5hr) … Resets in Xh"); hovering shows the weekly line; clicking refreshes; `BiDi Usage: Toggle Session Clock On/Off` hides and shows it. If macOS asks for Keychain access, the user decides.

Fix anything found in `css/theme.css`, re-run `npm test` and the fixture, repackage and reinstall.

- [ ] **Step 6: Commit**

```bash
git add README.md
git commit -F - <<'EOF'
docs: README for the theme module

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
EOF
```

Then use superpowers:finishing-a-development-branch to decide how `feat/warm-theme` lands on `main`.
