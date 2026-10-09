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
    expect(r.footerOrder === '0,0,2,2,2,0,0,1,3,4', `footer order: ${r.footerOrder}`);
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
