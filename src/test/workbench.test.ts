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
