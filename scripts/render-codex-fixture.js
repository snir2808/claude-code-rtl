// Renders scripts/fixture/codex.html against a real Codex install's CSS with both Codex blocks
// synced, in VS Code's dark theme (vscode-dark) and a light one (vscode-light), checks computed
// styles, runs diagnostics/codex.js on the page and saves screenshots. Only reads the Codex
// install: everything is written to a temp folder.
// Usage: node scripts/render-codex-fixture.js <codex-extension-dir> [out-dir]
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const { CHROME, missingClasses, renderReport, serve } = require('./fixture-lib');
const { computeSyncedCss, loadBlockBodies } = require('../out/sync');
const { THEME } = require('../out/features');
const { findCodexCss } = require('../out/codex');
const { checkCodexInstallHealth, formatCodexHealthWarning, isCodexHealthy } = require('../out/health');

const ROOT = path.join(__dirname, '..');
// A roomy side bar, tall enough for the thread and the composer.
const SIZE = '900,1100';
// The CSS chunks Codex loads with a conversation, by name: their file names end in a hash.
const CHUNKS = ['markdown', 'user-message-bubble', 'user-formatted-text', 'composer-layout', 'prompt-editor', 'prosemirror', 'composer-content'];
// Text the page shows. The diagnostics report must hold none of it.
const PAGE_TEXT = ['syncInstall', 'README', 'uninstall', 'הפונקציה', 'Fonts first', 'ואז'];
const USAGE = `usage: node scripts/render-codex-fixture.js <codex-extension-dir> [out-dir]
e.g. node scripts/render-codex-fixture.js ~/.vscode/extensions/openai.chatgpt-26.51021.22027-darwin-arm64
Chrome: ${CHROME} (set CHROME_PATH to use another)`;

function check(mode, r) {
  const problems = [];
  const expect = (ok, message) => {
    if (!ok) {
      problems.push(message);
    }
  };
  // RTL applies in every theme.
  expect(r.paragraphBidi === 'plaintext', `paragraph unicode-bidi: ${r.paragraphBidi} (want plaintext)`);
  expect(r.answerHeRight <= 1 && r.answerEnLeft <= 1, `answer: Hebrew ${r.answerHeRight}px from the right, English ${r.answerEnLeft}px from the left`);
  expect(r.listPosition === 'inside' && r.listBidi === 'plaintext', `list items: ${r.listPosition} markers, ${r.listBidi} (want inside, plaintext)`);
  expect(
    r.listHeRight > 0 && r.listHeRight < 30 && r.listEnLeft > 0 && r.listEnLeft < 30,
    `list markers: the Hebrew item's text ends ${r.listHeRight}px from the right, the English item's starts ${r.listEnLeft}px from the left (want each marker before its text)`
  );
  expect(
    r.looseEnTop <= 8 && r.looseHeTop <= 8 && r.looseEnLeft > 0 && r.looseEnLeft < 30 && r.looseHeRight > 0 && r.looseHeRight < 30 && r.looseSecondBelow >= 0,
    `loose list: text ${r.looseEnTop}/${r.looseHeTop}px below its item's top, English ${r.looseEnLeft}px from the left, Hebrew ${r.looseHeRight}px from the right, the second paragraph ${r.looseSecondBelow}px below the first (want each marker beside its text)`
  );
  expect(r.userHeRight <= 1 && r.userEnLeft <= 1, `your message's lines: Hebrew ${r.userHeRight}px from the right, English ${r.userEnLeft}px from the left`);
  expect(r.editorHeRight <= 1 && r.editorEnLeft <= 1, `composer lines: Hebrew ${r.editorHeRight}px from the right, English ${r.editorEnLeft}px from the left`);
  expect(r.codeDir === 'ltr' && r.inlineCodeDir === 'ltr', `code: block ${r.codeDir}, inline ${r.inlineCodeDir} (want ltr)`);
  expect(r.bubbleDir === 'rtl', `your message's block direction: ${r.bubbleDir} (want rtl)`);
  const d = r.diagnostics || {};
  expect(
    d.report === 'bidi-codex-diagnostics' && d.blocks && d.blocks.rtl === true && d.blocks.theme === (mode === 'dark'),
    `diagnostics: blocks ${JSON.stringify(d.blocks)}`
  );
  expect(
    d.counts && d.counts.userMessage === 1 && d.counts.listItem === 4 && d.counts.composerLine === 2 && d.counts.sendButton === 1,
    `diagnostics: counts ${JSON.stringify(d.counts)}`
  );
  expect(
    d.samples && d.samples.paragraph.some((s) => s.firstStrong === 'rtl' && s.side === 'right'),
    `diagnostics: no Hebrew paragraph on the right in ${JSON.stringify(d.samples && d.samples.paragraph)}`
  );
  const leaked = PAGE_TEXT.filter((text) => JSON.stringify(d).includes(text));
  expect(leaked.length === 0, `diagnostics: the report holds the page's text: ${leaked.join(', ')}`);
  if (mode === 'dark') {
    expect(r.fontsLoaded >= 2, `BiDi Rubik faces loaded: ${r.fontsLoaded} (want 2)`);
    expect(r.bodyBg === 'rgb(27, 26, 24)', `panel background: ${r.bodyBg}`);
    expect(r.textFont.startsWith('"BiDi Rubik"'), `text font: ${r.textFont}`);
    expect(r.textSize === '15px' && r.lineHeight === '26.25px', `text: ${r.textSize} / ${r.lineHeight} (want 15px / 26.25px)`);
    expect(r.textColor === 'rgb(235, 229, 218)', `text color: ${r.textColor}`);
    expect(r.h2 === '18px 600 rgb(245, 240, 232)', `h2: ${r.h2}`);
    expect(r.marker === 'rgb(217, 119, 87)', `list marker: ${r.marker}`);
    expect(r.inlineCode === 'rgb(43, 40, 36) / rgb(242, 184, 150)', `inline code: ${r.inlineCode}`);
    expect(r.secondary === 'rgb(163, 157, 146)' && r.tertiary === 'rgb(163, 157, 146)', `secondary / tertiary text: ${r.secondary} / ${r.tertiary}`);
    expect(r.border === 'rgb(59, 54, 47)', `border: ${r.border}`);
    expect(r.bubble === 'rgb(38, 35, 32) rgb(245, 240, 232) 14px 12px 16px', `your message: ${r.bubble}`);
    expect(r.bubbleBar === '3px solid rgb(217, 119, 87)' && r.bubbleBarLeft === '0px', `your message's accent bar: right ${r.bubbleBar}, left ${r.bubbleBarLeft} (want it on the right)`);
    expect(r.bubbleWidth === r.rowWidth, `your message: ${r.bubbleWidth}px wide (want the row's ${r.rowWidth}px)`);
    expect(r.composer === 'rgb(36, 33, 32) 18px rgb(115, 106, 93) 0px 0px 0px 1px', `composer: ${r.composer}`);
    expect(r.composerFocused === 'rgb(217, 119, 87) 0px 0px 0px 1px', `focused composer ring: ${r.composerFocused}`);
    expect(r.editor === '18px 27px' && r.editorFont.startsWith('"BiDi Rubik"'), `composer text: ${r.editor} ${r.editorFont}`);
    expect(r.send === 'rgb(198, 97, 63) rgb(250, 249, 245)', `send button: ${r.send}`);
  } else {
    // Only the body's theme kind differs from the dark page, so these check that none of the theme applies.
    expect(r.fontsLoaded === 0, `BiDi Rubik faces loaded: ${r.fontsLoaded} (want 0)`);
    expect(!r.textFont.includes('BiDi Rubik') && r.textSize === '13px', `light theme text: ${r.textFont} ${r.textSize} (want VS Code's font at 13px)`);
    expect(r.bodyBg === 'rgba(0, 0, 0, 0)', `light theme paints the panel: ${r.bodyBg}`);
    expect(r.bubbleWidth < r.rowWidth && r.bubbleBar.startsWith('0px'), `light theme styles your message: ${r.bubbleWidth}px, bar ${r.bubbleBar}`);
    expect(!r.composer.includes('rgb(115, 106, 93)'), `light theme rings the composer: ${r.composer}`);
    expect(!r.send.startsWith('rgb(198, 97, 63)'), `light theme colors the send button: ${r.send}`);
  }
  return problems;
}

/** The files of each CSS chunk in Codex's assets folder; throws when a chunk is gone. */
function chunkFiles(assets) {
  const names = fs.readdirSync(assets);
  return CHUNKS.flatMap((chunk) => {
    const files = names.filter((name) => new RegExp(`^${chunk}-[0-9a-f]{12}\\.css$`).test(name)).sort();
    if (files.length === 0) {
      throw new Error(`no ${chunk}-<hash>.css in ${assets}: Codex renamed its CSS chunks, update CHUNKS`);
    }
    return files;
  });
}

async function main() {
  const [codexArg, outArg] = process.argv.slice(2);
  if (!codexArg) {
    console.error(USAGE);
    process.exit(2);
  }
  const codexDir = path.resolve(codexArg);
  const outDir = path.resolve(outArg || path.join(ROOT, 'fixture-out'));
  const work = fs.mkdtempSync(path.join(os.tmpdir(), 'bidi-codex-fixture-'));
  let server;
  let failed = false;
  try {
    const cssPath = await findCodexCss(codexDir);
    if (!cssPath) {
      throw new Error(`${codexDir}: webview/index.html links no stylesheet this extension can find`);
    }
    const health = await checkCodexInstallHealth(cssPath);
    if (!isCodexHealthy(health)) {
      throw new Error(`Codex is not healthy:\n${formatCodexHealthWarning(path.basename(codexDir), health)}`);
    }
    console.log('health check: ok');
    const bodies = await loadBlockBodies(ROOT, 'codex');
    // Without any block this extension may have added to the installed copy.
    const pristine = computeSyncedCss(fs.readFileSync(cssPath, 'utf8'), new Set(), bodies, 'codex');
    const assets = path.dirname(cssPath);
    const chunks = chunkFiles(assets);
    const page = fs.readFileSync(path.join(__dirname, 'fixture', 'codex.html'), 'utf8');
    const css = [pristine, ...chunks.map((name) => fs.readFileSync(path.join(assets, name), 'utf8'))].join('\n');
    const missing = missingClasses(page, css);
    if (missing.length > 0) {
      throw new Error(`codex.html uses classes this Codex does not define: ${missing.join(', ')}`);
    }
    fs.mkdirSync(outDir, { recursive: true });
    fs.writeFileSync(path.join(work, 'app-initial.css'), computeSyncedCss(pristine, new Set(['theme', 'rtl']), bodies, 'codex'));
    for (const name of chunks) {
      fs.copyFileSync(path.join(assets, name), path.join(work, name));
    }
    for (const asset of THEME.blocks.codex.assets) {
      fs.copyFileSync(path.join(ROOT, asset.source), path.join(work, asset.target));
    }
    fs.copyFileSync(path.join(ROOT, 'diagnostics', 'codex.js'), path.join(work, 'codex-diagnostics.js'));
    // Codex links its main stylesheet, then adds each chunk's stylesheet as the conversation loads.
    const links = chunks.map((name) => `<link rel="stylesheet" href="${name}">`).join('\n');
    const modes = { dark: 'vscode-dark', light: 'vscode-light' };
    for (const [mode, kind] of Object.entries(modes)) {
      fs.writeFileSync(path.join(work, `${mode}.html`), page.replace('__CHUNKS__', links).replace(/__THEME_KIND__/g, kind));
    }

    server = await serve(work);
    const base = `http://127.0.0.1:${server.address().port}`;
    // A fresh profile for every Chrome run, so no run sees another's cache or state.
    let runs = 0;
    const profile = () => `--user-data-dir=${path.join(work, `chrome-profile-${++runs}`)}`;
    for (const mode of Object.keys(modes)) {
      const shot = path.join(outDir, `codex-fixture-${mode}.png`);
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
