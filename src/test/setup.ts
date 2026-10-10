/**
 * Loaded by mocha (--require) before any test file; not a test itself.
 * `vscode` exists only inside VS Code, so require('vscode') resolves to the
 * fake in fake-vscode.ts. The tests use fakes for Claude Code's sign-in and
 * Anthropic's usage endpoint; as a backstop, the macOS `security` tool and
 * fetch() refuse to run in this process.
 */
import Module = require('module');
import childProcess = require('child_process');
import * as path from 'path';

type ResolveFilename = (request: string, ...rest: unknown[]) => string;

const loader = Module as unknown as { _resolveFilename: ResolveFilename };
const resolveFilename = loader._resolveFilename;
const FAKE_VSCODE = path.join(__dirname, 'fake-vscode.js');
loader._resolveFilename = function (this: unknown, request: string, ...rest: unknown[]): string {
  return request === 'vscode' ? FAKE_VSCODE : resolveFilename.call(this, request, ...rest);
};

const execFile = childProcess.execFile as (...args: unknown[]) => unknown;
(childProcess as { execFile: unknown }).execFile = function (this: unknown, file: unknown, ...rest: unknown[]) {
  if (path.basename(String(file)) === 'security') {
    throw new Error('tests must not run the security tool');
  }
  return execFile.call(this, file, ...rest);
};

globalThis.fetch = (() => Promise.reject(new Error('tests must not use the network'))) as typeof fetch;
