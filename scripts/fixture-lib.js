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
