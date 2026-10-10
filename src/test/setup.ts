/**
 * Loaded by mocha (--require) before any test file; not a test itself.
 * `vscode` exists only inside VS Code, so require('vscode') resolves to the
 * fake in fake-vscode.ts. The tests use fakes for Claude Code's sign-in and
 * Anthropic's usage endpoint; as a backstop, every child_process entry point and
 * fetch() refuse to run in this process, and HOME is an empty temp folder.
 */
import Module = require('module');
import childProcess = require('child_process');
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

type ResolveFilename = (request: string, ...rest: unknown[]) => string;

const loader = Module as unknown as { _resolveFilename: ResolveFilename };
const resolveFilename = loader._resolveFilename;
const FAKE_VSCODE = path.join(__dirname, 'fake-vscode.js');
loader._resolveFilename = function (this: unknown, request: string, ...rest: unknown[]): string {
  return request === 'vscode' ? FAKE_VSCODE : resolveFilename.call(this, request, ...rest);
};

// Every way of starting a process is refused, so a test cannot reach the
// macOS `security` tool (or anything else) by accident. A test that really
// needs one sets BIDI_TEST_ALLOW_CHILD_PROCESS=1 for the duration of that call.
for (const name of ['spawn', 'spawnSync', 'exec', 'execSync', 'execFile', 'execFileSync', 'fork']) {
  const table = childProcess as unknown as Record<string, (...args: unknown[]) => unknown>;
  const original = table[name];
  table[name] = function (this: unknown, ...args: unknown[]) {
    if (process.env.BIDI_TEST_ALLOW_CHILD_PROCESS !== '1') {
      throw new Error(`tests must not start processes (child_process.${name})`);
    }
    return original.apply(this, args);
  };
}

// os.homedir() reads HOME (USERPROFILE on Windows): point both at an empty
// folder, so nothing under the real home (~/.claude credentials) is read.
const home = fs.mkdtempSync(path.join(os.tmpdir(), 'bidi-test-home-'));
process.env.HOME = home;
process.env.USERPROFILE = home;
process.on('exit', () => fs.rmSync(home, { recursive: true, force: true }));

globalThis.fetch = (() => Promise.reject(new Error('tests must not use the network'))) as typeof fetch;
