// Renders scripts/fixture/panel.html against a real Claude Code index.css with
// both blocks synced, in dark and light mode, checks computed styles and saves
// screenshots. Usage: node scripts/render-fixture.js <claude-code-extension-dir> [out-dir]
// Set CHROME_PATH when Chrome is not at the default macOS location.
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const { CHROME, missingClasses, renderReport, serve } = require('./fixture-lib');
const { computeSyncedCss, loadBlockBodies } = require('../out/sync');
const { THEME } = require('../out/features');
const { checkInstallHealth, formatHealthWarning, isHealthy } = require('../out/health');

const ROOT = path.join(__dirname, '..');
const SIZE = '1100,900';
const USAGE = `usage: node scripts/render-fixture.js <claude-code-extension-dir> [out-dir]
Chrome: ${CHROME} (set CHROME_PATH to use another)`;

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
    expect(r.inputSize === '18px', `input size (1.2x the 15px messages): ${r.inputSize}`);
    expect(r.inputFont === r.mirrorFont && r.inputSize === r.mirrorSize, 'input and mirror layers differ');
    expect(r.panelBg === 'rgb(27, 26, 24)', `panel background: ${r.panelBg}`);
    expect(r.userBg === 'rgb(38, 35, 32)', `user message background: ${r.userBg}`);
    expect(r.groupBg === 'rgb(33, 31, 28)', `tool group background: ${r.groupBg}`);
    expect(r.turnWidth === r.messagesContentWidth && r.turnWidth > 680, `turn width: ${r.turnWidth} (want the full ${r.messagesContentWidth})`);
    expect(r.userBubbleWidth === r.turnWidth, `user bubble width: ${r.userBubbleWidth} (want the turn's ${r.turnWidth})`);
    expect(r.messagesWidth === r.viewportWidth, `messages container: ${r.messagesWidth}px (want the viewport's ${r.viewportWidth}px)`);
    expect(r.thinkingSummaryDirection === 'ltr', `thinking summary direction: ${r.thinkingSummaryDirection} (want ltr)`);
    expect(
      r.flatSpanSizes.every((size) => size === '15px') && r.footerButtonSize === '15px',
      `footer spans ${r.flatSpanSizes.join(', ')} vs buttons ${r.footerButtonSize} (want all 15px)`
    );
    expect(r.permissionsWidth === 816, `permissions container width: ${r.permissionsWidth} (want 816)`);
    expect(r.inputBoxWidth === 816, `input box width: ${r.inputBoxWidth} (want 816, 1.2x Claude Code's native 680)`);
    expect(r.sendSize === 40, `send button: ${r.sendSize}px`);
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
        b.height === 34 && b.background === 'rgba(0, 0, 0, 0)' && b.border === '1px solid rgb(69, 62, 53)' && b.radius === '11px',
        `${name}: ${JSON.stringify(b)} (want the 34px ghost button)`
      );
    }
    expect(r.pie.width === 36, `context pie width: ${r.pie.width}`);
    expect(/^30px (?!none$)/.test(r.toolWithText), `tool row with an empty text block: ${r.toolWithText}`);
  } else {
    // Only the body class differs from the dark page, so these check that nothing of the theme applies.
    expect(r.fontsLoaded === 0, `BiDi Rubik faces loaded: ${r.fontsLoaded} (want 0)`);
    expect(!r.textFont.includes('BiDi Rubik'), `light theme uses the theme font: ${r.textFont}`);
    expect(r.textSize !== '15px', `light theme uses the theme text size: ${r.textSize}`);
    expect(r.inputSize !== '18px', `light theme uses the theme input size: ${r.inputSize}`);
    expect(r.inputBoxWidth === 680, `light theme keeps the native input box: ${r.inputBoxWidth} (want the native 680)`);
    expect(r.permissionsWidth === 680, `light theme keeps the native permissions container: ${r.permissionsWidth} (want 680)`);
    expect(r.panelBg !== 'rgb(27, 26, 24)', 'light theme uses the theme panel color');
    expect(r.userBg !== 'rgb(38, 35, 32)', 'light theme uses the theme user-message color');
    expect(r.groupBg !== 'rgb(33, 31, 28)', 'light theme uses the theme tool-group color');
    expect(r.sendSize !== 40, `light theme uses the theme send button: ${r.sendSize}px`);
    expect(/^0(,0)*$/.test(r.footerOrder), `footer order: ${r.footerOrder} (want all 0)`);
    expect(r.pie.radius !== '11px' && r.rowPill.radius !== '11px', 'light theme uses the theme footer buttons');
  }
  return problems;
}

async function main() {
  const [claudeDir, outArg] = process.argv.slice(2);
  if (!claudeDir) {
    console.error(USAGE);
    process.exit(2);
  }
  const outDir = path.resolve(outArg || path.join(ROOT, 'fixture-out'));
  const work = fs.mkdtempSync(path.join(os.tmpdir(), 'bidi-fixture-'));
  let server;
  let failed = false;
  try {
    const css = fs.readFileSync(path.join(claudeDir, 'webview', 'index.css'), 'utf8');
    const page = fs.readFileSync(path.join(__dirname, 'fixture', 'panel.html'), 'utf8');
    const health = await checkInstallHealth(claudeDir);
    if (!isHealthy(health)) {
      throw new Error(`the Claude Code install is not healthy:\n${formatHealthWarning(path.basename(claudeDir), health)}`);
    }
    console.log('health check: ok');
    const missing = missingClasses(page, css);
    if (missing.length > 0) {
      throw new Error(`panel.html uses classes this index.css does not define: ${missing.join(', ')}`);
    }
    fs.mkdirSync(outDir, { recursive: true });
    const synced = computeSyncedCss(css, new Set(['theme', 'rtl']), await loadBlockBodies(ROOT, 'claude'), 'claude');
    fs.writeFileSync(path.join(work, 'index.css'), synced);
    for (const asset of THEME.blocks.claude.assets) {
      fs.copyFileSync(path.join(ROOT, asset.source), path.join(work, asset.target));
    }
    for (const mode of ['dark', 'light']) {
      fs.writeFileSync(path.join(work, `${mode}.html`), page.replace('__THEME_CLASS__', `vscode-${mode}`));
    }

    server = await serve(work);
    const base = `http://127.0.0.1:${server.address().port}`;
    // A fresh profile for every Chrome run, so no run sees another's cache or state.
    let runs = 0;
    const profile = () => `--user-data-dir=${path.join(work, `chrome-profile-${++runs}`)}`;
    for (const mode of ['dark', 'light']) {
      const shot = path.join(outDir, `fixture-${mode}.png`);
      const report = await renderReport(`${base}/${mode}.html`, shot, SIZE, profile, mode);
      const problems = check(mode, report);
      console.log(`${mode}: ${problems.length ? 'FAIL' : 'ok'}`);
      for (const problem of problems) {
        console.log(`  - ${problem}`);
      }
      failed = failed || problems.length > 0;
    }
  } finally {
    if (server) {
      server.close();
    }
    // Chrome was killed moments ago and may still be releasing its profile files.
    fs.rmSync(work, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
  }
  console.log(`screenshots: ${outDir}`);
  process.exit(failed ? 1 : 0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
