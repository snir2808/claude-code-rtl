// Renders scripts/fixture/chat.html against a real VS Code workbench CSS with both Copilot chat
// blocks synced, in a dark theme (vs-dark) and a light one (vs), checks computed styles and saves
// screenshots. Only reads the VS Code installation: everything is written to a temp folder.
// Usage: node scripts/render-chat-fixture.js <vscode-app-root> [out-dir]
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const { CHROME, missingClasses, renderReport, serve } = require('./fixture-lib');
const { computeSyncedCss, loadBlockBodies } = require('../out/sync');
const { THEME } = require('../out/features');
const { checkWorkbenchHealth, formatWorkbenchHealthWarning, isWorkbenchHealthy } = require('../out/health');
const { workbenchCssPath } = require('../out/workbench');

const ROOT = path.join(__dirname, '..');
// Wider than the chat's 950px layout width, so the full-width messages and the centered input
// part both show; tall enough for the whole conversation and the input part.
const SIZE = '1100,1400';
const USAGE = `usage: node scripts/render-chat-fixture.js <vscode-app-root> [out-dir]
e.g. node scripts/render-chat-fixture.js "/Applications/Visual Studio Code.app/Contents/Resources/app"
Chrome: ${CHROME} (set CHROME_PATH to use another)`;

function check(mode, r) {
  const problems = [];
  const expect = (ok, message) => {
    if (!ok) {
      problems.push(message);
    }
  };
  // RTL applies in every theme.
  expect(r.dirAnswerHe === 'rtl' && Math.abs(r.alignAnswerHe) <= 1, `Hebrew paragraph: ${r.dirAnswerHe}, ${r.alignAnswerHe}px from the right edge`);
  expect(r.bidiAnswerEn === 'plaintext', `paragraph unicode-bidi: ${r.bidiAnswerEn} (want plaintext)`);
  expect(r.dirRequestHe === 'rtl', `Hebrew request direction: ${r.dirRequestHe}`);
  expect(r.dirCode === 'ltr' && r.dirTool === 'ltr' && r.dirToolbar === 'ltr', `code/tool/toolbar direction: ${r.dirCode}/${r.dirTool}/${r.dirToolbar} (want ltr)`);
  if (mode === 'dark') {
    expect(r.fontsLoaded >= 2, `BiDi Rubik faces loaded: ${r.fontsLoaded} (want 2)`);
    expect(r.textFont.startsWith('"BiDi Rubik"'), `text font: ${r.textFont}`);
    expect(r.textSize === '15px' && r.lineHeight === '26.25px', `text: ${r.textSize} / ${r.lineHeight} (want 15px / 26.25px)`);
    expect(r.textColor === 'rgb(235, 229, 218)', `text color: ${r.textColor}`);
    expect(r.h2 === '18px 600 rgb(245, 240, 232)', `h2: ${r.h2}`);
    expect(r.marker === 'rgb(217, 119, 87)', `list marker: ${r.marker}`);
    expect(r.link === 'rgb(232, 160, 127)', `link: ${r.link}`);
    expect(r.inlineCode === 'rgb(43, 40, 36) / rgb(242, 184, 150)', `inline code: ${r.inlineCode}`);
    expect(r.codeBlock === 'rgb(18, 17, 16) 12px', `code block: ${r.codeBlock}`);
    expect(r.listBg === 'rgb(27, 26, 24)' && r.sessionBg === 'rgb(27, 26, 24)', `backgrounds: list ${r.listBg}, session ${r.sessionBg}`);
    expect(r.sessionWidth === r.viewportWidth, `chat width: ${r.sessionWidth} (want the view's ${r.viewportWidth})`);
    expect(r.userBg === 'rgb(38, 35, 32)' && r.userColor === 'rgb(245, 240, 232)' && r.userRadius === '14px', `your message: ${r.userBg} ${r.userColor} ${r.userRadius}`);
    expect(r.userBar === '3px solid rgb(217, 119, 87)', `your message's accent bar: ${r.userBar}`);
    expect(r.userWidth === r.requestContentWidth, `your message width: ${r.userWidth} (want the row's ${r.requestContentWidth})`);
    expect(r.activity === 'rgb(33, 31, 28) 1px rgb(43, 40, 36) 12px', `activity box: ${r.activity}`);
    expect(r.activityText === '12.5px rgb(150, 143, 131)', `activity text: ${r.activityText}`);
    expect(r.inputPartWidth === 926, `input part: ${r.inputPartWidth} (want 926, VS Code's 950px layout width less its margins)`);
    expect(r.inputBox === 'rgb(36, 33, 32) rgb(217, 119, 87) 18px', `focused input box: ${r.inputBox}`);
    expect(r.inputEditorBg === 'rgb(36, 33, 32)', `input editor background: ${r.inputEditorBg}`);
    expect(r.inputTextSize === '13px', `input text: ${r.inputTextSize} (VS Code sets it in JS; it must stay 13px)`);
    expect(r.attach === '36x34' && r.attachLeft <= 12, `attach button: ${r.attach} at ${r.attachLeft}px`);
    for (const [name, p] of [['mode picker', r.modePicker], ['model picker', r.modelPicker]]) {
      expect(
        p.height === 34 && p.background === 'rgba(0, 0, 0, 0)' && p.border === '1px solid rgb(69, 62, 53)' && p.radius === '11px' && p.size === '15px',
        `${name}: ${JSON.stringify(p)} (want the 34px ghost pill)`
      );
    }
    expect(r.pickersRight >= 0 && r.pickersRight <= 12, `pickers end ${r.pickersRight}px before the send toolbar (want them next to it)`);
    expect(r.send === '40x40 rgb(198, 97, 63) rgb(250, 249, 245) 9999px', `send button: ${r.send}`);
    expect(r.secondaryColor === 'rgb(163, 157, 146)', `secondary toolbar: ${r.secondaryColor}`);
  } else {
    // Only the workbench class differs from the dark page, so these check that none of the theme applies.
    expect(r.fontsLoaded === 0, `BiDi Rubik faces loaded: ${r.fontsLoaded} (want 0)`);
    expect(!r.textFont.includes('BiDi Rubik'), `light theme uses the theme font: ${r.textFont}`);
    expect(r.textSize === '13px', `light theme text size: ${r.textSize} (want the native 13px)`);
    expect(r.sessionWidth === 950, `light theme chat width: ${r.sessionWidth} (want the native 950)`);
    expect(r.userWidth < r.requestContentWidth, 'light theme stretches your messages');
    expect(r.userBg !== 'rgb(38, 35, 32)', 'light theme uses the theme user-message color');
    expect(r.activity.startsWith('rgba(0, 0, 0, 0)'), `light theme boxes the activity: ${r.activity}`);
    expect(!r.inputBox.endsWith('18px'), `light theme uses the theme input box: ${r.inputBox}`);
    expect(r.send.startsWith('22x22'), `light theme uses the theme send button: ${r.send}`);
  }
  return problems;
}

async function main() {
  const [appRoot, outArg] = process.argv.slice(2);
  if (!appRoot) {
    console.error(USAGE);
    process.exit(2);
  }
  const outDir = path.resolve(outArg || path.join(ROOT, 'fixture-out'));
  const work = fs.mkdtempSync(path.join(os.tmpdir(), 'bidi-chat-fixture-'));
  let server;
  let failed = false;
  try {
    const bodies = await loadBlockBodies(ROOT, 'workbench');
    // Without any block this extension may have added to the installed copy.
    const pristine = computeSyncedCss(fs.readFileSync(workbenchCssPath(appRoot), 'utf8'), new Set(), bodies, 'workbench');
    const page = fs.readFileSync(path.join(__dirname, 'fixture', 'chat.html'), 'utf8');
    const health = checkWorkbenchHealth(pristine);
    if (!isWorkbenchHealthy(health)) {
      throw new Error(`the workbench CSS is not healthy:\n${formatWorkbenchHealthWarning(path.basename(appRoot), health)}`);
    }
    console.log('health check: ok');
    const missing = missingClasses(page, pristine);
    if (missing.length > 0) {
      throw new Error(`chat.html uses classes this workbench CSS does not define: ${missing.join(', ')}`);
    }
    fs.mkdirSync(outDir, { recursive: true });
    fs.writeFileSync(
      path.join(work, 'workbench.desktop.main.css'),
      computeSyncedCss(pristine, new Set(['theme', 'rtl']), bodies, 'workbench')
    );
    for (const asset of THEME.blocks.workbench.assets) {
      fs.copyFileSync(path.join(ROOT, asset.source), path.join(work, asset.target));
    }
    const modes = { dark: 'vs-dark', light: 'vs' };
    for (const [mode, themeClass] of Object.entries(modes)) {
      fs.writeFileSync(path.join(work, `${mode}.html`), page.replace('__THEME_CLASS__', themeClass));
    }

    server = await serve(work);
    const base = `http://127.0.0.1:${server.address().port}`;
    // A fresh profile for every Chrome run, so no run sees another's cache or state.
    let runs = 0;
    const profile = () => `--user-data-dir=${path.join(work, `chrome-profile-${++runs}`)}`;
    for (const mode of Object.keys(modes)) {
      const shot = path.join(outDir, `chat-fixture-${mode}.png`);
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
