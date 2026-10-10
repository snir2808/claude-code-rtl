#!/usr/bin/env node
// Renders scripts/fixture/panel.html against a real Claude Code index.css with
// both blocks synced, in dark and light mode, checks computed styles and saves
// screenshots. Usage: node scripts/render-fixture.js <claude-code-extension-dir> [out-dir]
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const http = require('http');
const { spawn } = require('child_process');
const { computeSyncedCss, loadBlockBodies } = require('../out/sync');
const { THEME } = require('../out/features');

const ROOT = path.join(__dirname, '..');
const CHROME = process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
// Flags for every Chrome call. The window size is shared so the DOM dump measures the same
// viewport as the screenshot.
const CHROME_FLAGS = [
  '--headless=new',
  '--disable-gpu',
  '--hide-scrollbars',
  '--virtual-time-budget=5000',
  '--window-size=1100,900',
];
const CHROME_TIMEOUT_MS = 20000;
const CHROME_POLL_MS = 200;
const PNG_END = Buffer.from('49454e44ae426082', 'hex'); // IEND chunk type + CRC: the last 8 bytes of every PNG
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
    expect(r.coldCacheColor === 'rgb(248, 81, 73)', `cold cache timer: ${r.coldCacheColor} (want the error color)`);
    expect(
      r.flatSpanFills.every((fill) => fill === 'rgba(0, 0, 0, 0)'),
      `cache timer and selection chip fills: ${r.flatSpanFills.join(', ')} (want none)`
    );
    for (const colors of r.modeSendColors) {
      expect(colors.endsWith('rgb(255, 255, 255) / rgb(255, 255, 255)'), `send button and icon, ${colors}`);
    }
    for (const [name, b] of [['model pill on its own row', r.rowPill], ['context pie', r.pie]]) {
      expect(
        b.height === 28 && b.background === 'rgba(0, 0, 0, 0)' && b.border === '1px solid rgb(69, 62, 53)' && b.radius === '9px',
        `${name}: ${JSON.stringify(b)} (want the 28px ghost button)`
      );
    }
    expect(r.pie.width === 30, `context pie width: ${r.pie.width}`);
    expect(/^30px (?!none$)/.test(r.toolWithText), `tool row with an empty text block: ${r.toolWithText}`);
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
      fs.rmSync(shot, { force: true }); // a PNG left by an earlier run must not pass for this one
      await chrome(
        [profile, `--screenshot=${shot}`, url],
        () => pngIsComplete(shot),
        `${mode} screenshot, expected a complete PNG at ${shot}`
      );
      const dom = await chrome(
        [profile, '--dump-dom', url],
        (stdout) => stdout.includes('</html>'),
        `${mode} DOM dump, expected </html> on stdout`
      );
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
