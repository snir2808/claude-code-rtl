// BiDi RTL & Theme: a report on how the extension's blocks apply in the Codex panel, for its
// DevTools console. Click in the Codex panel, run "Developer: Open Webview Developer Tools", open
// the Console, type "allow pasting" the first time, then paste this and press Enter. It reads only
// the page's structure and computed styles, never message text or anything from your files: the
// report holds class and data-attribute names, the page's window type and theme kind, computed
// styles, and the names of Codex's own stylesheets. It goes to the clipboard as JSON.
(function bidiCodexDiagnostics() {
  'use strict';
  // What the blocks style, as css/codex-theme.css and css/codex-rtl.css match it.
  const HOOKS = {
    markdownRoot: '[class*="_MarkdownRoot_"]',
    paragraph: '[class*="_MarkdownRoot_"] [class*="_Paragraph_"]',
    heading: '[class*="_MarkdownRoot_"] [class*="_Heading_"]',
    listItem: '[class*="_MarkdownRoot_"] [class*="_ListItem_"]',
    userMessage: '.bg-user-message[class*="_bubble_"]',
    composer: '[class*="_ComposerLayoutRoot_"]',
    composerEditor: '[class*="_RichTextInput_"] .ProseMirror',
    composerLine: '[class*="_RichTextInput_"] .ProseMirror p',
    sendButton: '.bg-composer-primary',
    inlineCode: '[class*="_InlineCode_"]',
    codeBlock: '[class*="_MarkdownRoot_"] pre',
  };
  const SAMPLED = ['paragraph', 'heading', 'listItem', 'composerLine'];
  const CONTAINERS = ['markdownRoot', 'userMessage', 'composer', 'composerEditor', 'codeBlock'];
  const RTL_CHAR = /[֐-ࣿיִ-﷿ﹰ-ﻼ]/;
  const LTR_CHAR = /[A-Za-zÀ-ɏͰ-ϿЀ-ӿ]/;

  // The Codex page: this frame, or a child frame of the same origin.
  function codexDocument() {
    if (document.documentElement.hasAttribute('data-codex-window-type')) {
      return document;
    }
    for (const frame of document.querySelectorAll('iframe')) {
      try {
        const doc = frame.contentDocument;
        if (doc && doc.documentElement.hasAttribute('data-codex-window-type')) {
          return doc;
        }
      } catch {
        // another origin: not the Codex page
      }
    }
    return null;
  }

  // The direction of the first strong character, worked out here; the text itself never leaves.
  function firstStrong(text) {
    for (const ch of text) {
      if (RTL_CHAR.test(ch)) {
        return 'rtl';
      }
      if (LTR_CHAR.test(ch)) {
        return 'ltr';
      }
    }
    return 'none';
  }

  const doc = codexDocument();
  if (!doc) {
    const message =
      'BiDi: no Codex page in this frame. Pick "active-frame" in the Console\'s context menu (top left), then run this again.';
    console.warn(message);
    return { error: message };
  }
  const view = doc.defaultView;
  const root = doc.documentElement;
  const style = (el) => view.getComputedStyle(el);
  const classes = (el) => (typeof el.className === 'string' ? el.className.split(/\s+/).filter(Boolean) : []);
  const attributeNames = (el) => el.getAttributeNames().filter((name) => name === 'dir' || name.startsWith('data-'));
  // Which side of its box the text sits on, measured from its rendered lines.
  const side = (el) => {
    const range = doc.createRange();
    range.selectNodeContents(el);
    const text = range.getBoundingClientRect();
    if (text.width === 0) {
      return 'empty';
    }
    const box = el.getBoundingClientRect();
    const left = text.left - box.left;
    const right = box.right - text.right;
    return Math.abs(left - right) < 2 ? 'center' : left < right ? 'left' : 'right';
  };
  const sample = (el) => {
    const s = style(el);
    return {
      side: side(el),
      firstStrong: firstStrong(el.textContent || ''),
      direction: s.direction,
      unicodeBidi: s.unicodeBidi,
      textAlign: s.textAlign,
      font: s.fontFamily.split(',')[0].trim(),
      size: s.fontSize,
    };
  };
  const ancestry = (el) => {
    const chain = [];
    for (let node = el; node && node !== doc.body && chain.length < 5; node = node.parentElement) {
      chain.push({ tag: node.tagName.toLowerCase(), classes: classes(node), attributes: attributeNames(node) });
    }
    return chain;
  };

  const counts = {};
  for (const [name, selector] of Object.entries(HOOKS)) {
    counts[name] = doc.querySelectorAll(selector).length;
  }
  const samples = {};
  for (const name of SAMPLED) {
    samples[name] = [...doc.querySelectorAll(HOOKS[name])].slice(0, 10).map(sample);
  }
  const containers = {};
  for (const name of CONTAINERS) {
    const el = doc.querySelector(HOOKS[name]);
    containers[name] = el ? ancestry(el) : null;
  }
  const rootStyle = style(root);
  // A loose list item's first paragraph runs inline with unicode-bidi:normal (css/codex-rtl.css): skip it.
  const paragraph = doc.querySelector(`${HOOKS.paragraph}:not([class*="_ListItem_"] > :first-child)`);
  const report = {
    report: 'bidi-codex-diagnostics',
    version: 1,
    windowType: root.getAttribute('data-codex-window-type'),
    themeKind: doc.body.getAttribute('data-vscode-theme-kind'),
    blocks: {
      theme: rootStyle.getPropertyValue('--codex-chat-font-size-override').trim() === '15px',
      rtl: paragraph ? style(paragraph).unicodeBidi === 'plaintext' : null,
    },
    rubik: [...doc.fonts].filter((f) => f.family.replace(/"/g, '') === 'BiDi Rubik').map((f) => f.status),
    chatFontSize: rootStyle.getPropertyValue('--codex-chat-font-size').trim(),
    counts,
    samples,
    containers,
    stylesheets: [...doc.styleSheets].map((sheet) => (sheet.href ? sheet.href.split(/[?#]/)[0].split('/').pop() : 'inline')),
  };
  const json = JSON.stringify(report, null, 2);
  if (typeof copy === 'function') {
    copy(json); // the DevTools Console's own helper
    console.log('BiDi: the Codex report is on the clipboard. Paste it into a message to yourself.');
  } else {
    console.log(json);
  }
  return report;
})();
