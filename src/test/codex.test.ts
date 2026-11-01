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
