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
