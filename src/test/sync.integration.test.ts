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
