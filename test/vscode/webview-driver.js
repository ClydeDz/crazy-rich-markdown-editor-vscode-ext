/*__GFM_CHECK__*/
/*__KEY_PROBE__*/
// This script runs inside a real VS Code webview, after the editor bundle.
// The test in the extension host sends it commands, and it answers with what it measured.
(() => {
  const api = acquireVsCodeApi();
  const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
  const pm = () => document.querySelector('.ProseMirror');
  const editor = () => pm() && pm().editor;
  const bytes = (base64) => Uint8Array.from(atob(base64), (char) => char.charCodeAt(0));
  const box = (rect) =>
    rect
      ? {
          top: rect.top,
          bottom: rect.bottom,
          left: rect.left,
          right: rect.right,
          width: rect.width,
          height: rect.height,
        }
      : null;
  const toolbar = () => document.querySelector('.rme-toolbar:not(.rme-table-toolbar)');

  function positionOf(text) {
    let found;
    editor().state.doc.descendants((node, pos) => {
      if (found === undefined && node.isText && node.text.includes(text)) {
        found = pos + node.text.indexOf(text);
      }
    });
    return found;
  }

  function fileFrom({ name, type, base64 }) {
    const transfer = new DataTransfer();
    transfer.items.add(new File([bytes(base64)], name, { type }));
    return transfer;
  }

  // Record every message that the editor sends to the host. The test reads the list to see when a message went out.
  const sent = [];
  const sendToHost = api.postMessage.bind(api);
  api.postMessage = (message) => {
    sent.push(message);
    return sendToHost(message);
  };
  const edits = () => sent.filter((message) => message.type === 'edit').length;

  // What the window with the keyboard shortcuts looks like now.
  const shortcutsState = () => {
    const backdrop = document.querySelector('.rme-modal-backdrop');
    const dialog = backdrop && backdrop.querySelector('.rme-modal');
    const rect = dialog && dialog.getBoundingClientRect();
    const boldRow =
      dialog &&
      [...dialog.querySelectorAll('.rme-shortcut')].find(
        (row) => row.querySelector('.rme-shortcut-label').firstChild.textContent === 'Bold',
      );
    const button = document.querySelector('.rme-stats [data-action="shortcuts"]');
    const buttonRect = button && button.getBoundingClientRect();
    const atButton =
      buttonRect &&
      document.elementFromPoint(buttonRect.left + buttonRect.width / 2, buttonRect.top + buttonRect.height / 2);
    return {
      found: Boolean(backdrop),
      open: Boolean(backdrop) && !backdrop.hidden,
      visible: Boolean(rect) && rect.width > 0 && rect.height > 0,
      title: dialog ? dialog.querySelector('h2').textContent : '',
      groups: dialog ? [...dialog.querySelectorAll('h3')].map((heading) => heading.textContent) : [],
      rows: dialog ? dialog.querySelectorAll('.rme-shortcut').length : 0,
      bold: boldRow ? [...boldRow.querySelectorAll('kbd')].map((cap) => cap.textContent) : [],
      links: dialog
        ? [...dialog.querySelectorAll('footer a')].map((anchor) => ({
            text: anchor.textContent,
            href: anchor.getAttribute('href'),
          }))
        : [],
      credit: dialog ? dialog.querySelector('.rme-modal-credit').textContent : '',
      activeClass: document.activeElement ? document.activeElement.className : '',
      activeAction: document.activeElement ? document.activeElement.dataset.action : undefined,
      // The window must cover the sticky bar: the point of the button then belongs to the dark layer.
      coversBar: Boolean(atButton) && Boolean(backdrop) && backdrop.contains(atButton),
      dialogInside: rect
        ? rect.left >= 0 && rect.right <= innerWidth && rect.top >= 0 && rect.bottom <= innerHeight
        : false,
    };
  };

  const handlers = {
    async ping() {
      return { ready: Boolean(editor()) };
    },

    async theme() {
      const style = getComputedStyle(document.body);
      return {
        bodyClass: document.body.className,
        editorBackground: style.getPropertyValue('--vscode-editor-background').trim(),
        fontFamily: style.getPropertyValue('--vscode-font-family').trim(),
        background: style.backgroundColor,
        textColor: style.color,
      };
    },

    async counts() {
      const root = pm();
      return {
        alerts: root.querySelectorAll('.rme-alert-note').length,
        footnoteRefs: [...root.querySelectorAll('.rme-fn-ref')].map((el) => el.getAttribute('data-n')),
        footnoteDefs: [...root.querySelectorAll('.rme-fn-def')].map((el) => el.getAttribute('data-n')),
        emoji: [...root.querySelectorAll('.rme-emoji')].map((el) => el.textContent),
        swatches: root.querySelectorAll('.rme-swatch').length,
        sub: root.querySelectorAll('sub').length,
        sup: root.querySelectorAll('sup:not(.rme-fn-ref)').length,
        underline: root.querySelectorAll('u').length,
        keywordSpans: root.querySelectorAll('.rme-code .hljs-keyword').length,
        languageLabels: [...root.querySelectorAll('.rme-code-lang')].map((el) => el.textContent),
        htmlBlocks: root.querySelectorAll('.rme-raw').length,
        katexInline: root.querySelectorAll('.rme-math .katex').length,
        katexBlock: root.querySelectorAll('.rme-math-block .katex-display').length,
      };
    },

    async select({ text }) {
      pm().focus();
      const from = positionOf(text);
      editor().commands.setTextSelection({ from, to: from + text.length });
      await sleep(600);
      const bar = toolbar();
      const selection = getSelection().rangeCount ? getSelection().getRangeAt(0).getBoundingClientRect() : null;
      return {
        visible:
          Boolean(bar) && getComputedStyle(bar).visibility === 'visible' && getComputedStyle(bar).opacity === '1',
        bar: box(bar && bar.getBoundingClientRect()),
        selection: box(selection),
        buttons: bar ? [...bar.querySelectorAll('[data-action]')].map((el) => el.getAttribute('data-action')) : [],
        active: bar ? [...bar.querySelectorAll('.is-active')].map((el) => el.getAttribute('data-action')) : [],
        viewport: { width: innerWidth, height: innerHeight },
      };
    },

    // Select from the start of one text to the end of another, as a user does with the mouse over several lines.
    async selectLines({ first, last }) {
      pm().focus();
      const from = positionOf(first);
      editor().commands.setTextSelection({ from, to: positionOf(last) + last.length });
      await sleep(600);
      const bar = toolbar();
      return {
        visible:
          Boolean(bar) && getComputedStyle(bar).visibility === 'visible' && getComputedStyle(bar).opacity === '1',
      };
    },

    // What the blocks of the page are: the code blocks with their language, and the drawn math blocks.
    async lineBlocks() {
      const blocks = [...pm().querySelectorAll('.rme-code')];
      return {
        codeTexts: blocks.map((block) => block.querySelector('code').textContent),
        languages: blocks.map((block) => block.dataset.language),
        mathBlocks: pm().querySelectorAll('.rme-math-block').length,
        drawnMath: pm().querySelectorAll('.rme-math-block .katex-display').length,
        paragraphs: [...pm().querySelectorAll('p')].map((p) => p.textContent),
      };
    },

    async click({ action }) {
      toolbar().querySelector(`[data-action="${action}"]`).click();
      await sleep(100);
      return { ok: true };
    },

    async paste(file) {
      pm().focus();
      const event = new ClipboardEvent('paste', { clipboardData: fileFrom(file), bubbles: true, cancelable: true });
      pm().dispatchEvent(event);
      return { prevented: event.defaultPrevented };
    },

    async drop(file) {
      const target = pm().querySelector('p').getBoundingClientRect();
      const event = new DragEvent('drop', {
        dataTransfer: fileFrom(file),
        clientX: target.left + 5,
        clientY: target.top + target.height / 2,
        bubbles: true,
        cancelable: true,
      });
      pm().dispatchEvent(event);
      return { prevented: event.defaultPrevented };
    },

    // A file drag over the margin of the page, outside the text area. VS Code takes the drop (and opens the file
    // as a new editor) unless the page marks the first drag event as handled.
    async dropOnMargin(file) {
      const target = document.querySelector('#app');
      const transfer = fileFrom(file);
      const enter = new DragEvent('dragenter', { dataTransfer: transfer, bubbles: true, cancelable: true });
      target.dispatchEvent(enter);
      const over = new DragEvent('dragover', { dataTransfer: transfer, bubbles: true, cancelable: true });
      target.dispatchEvent(over);
      const drop = new DragEvent('drop', { dataTransfer: transfer, bubbles: true, cancelable: true });
      target.dispatchEvent(drop);
      return {
        enterPrevented: enter.defaultPrevented,
        overPrevented: over.defaultPrevented,
        dropEffect: transfer.dropEffect,
        dropPrevented: drop.defaultPrevented,
        insideText: pm().contains(target),
      };
    },

    async pickLanguage({ index, language }) {
      document.querySelectorAll('.rme-code-lang')[index].click();
      await sleep(200);
      const picker = document.querySelector('.rme-picker');
      const opened = Boolean(picker);
      const input = picker.querySelector('input');
      input.value = language;
      input.dispatchEvent(new Event('input', { bubbles: true }));
      input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }));
      await sleep(150);
      return {
        opened,
        closed: !document.querySelector('.rme-picker'),
        label: document.querySelectorAll('.rme-code-lang')[index].textContent,
      };
    },

    async moreMenu({ action }) {
      toolbar().querySelector('[data-action="more"]').click();
      await sleep(100);
      const menu = toolbar().querySelector('.rme-menu');
      const opened = !menu.hidden;
      menu.querySelector(`[data-action="${action}"]`).click();
      await sleep(100);
      return { opened, closed: menu.hidden };
    },

    // Put one example in the editor and report what the editor made of it. The host compares it with the fixture.
    async section({ markdown, expect }) {
      editor().commands.setContent(markdown, { contentType: 'markdown', emitUpdate: false });
      await sleep(150);
      const { nodes, marks } = countDocument(editor().getJSON());
      const { dom, values } = readDom(pm(), expect);
      return { nodes, marks, dom, values };
    },

    // Wait until the mermaid library has drawn the diagram, then report what the page holds.
    // Elements that have the hidden attribute must not take up space, whatever the styles say.
    async hiddenElements() {
      const visible = [...pm().querySelectorAll('[hidden]')].filter(
        (el) => getComputedStyle(el).display !== 'none' && el.getBoundingClientRect().height > 0,
      );
      return {
        count: pm().querySelectorAll('[hidden]').length,
        visible: visible.map((el) => el.className || el.tagName),
      };
    },

    async diagram() {
      const deadline = Date.now() + 50000;
      let svg;
      while (Date.now() < deadline && !(svg = pm().querySelector('.rme-code-preview svg'))) {
        await sleep(200);
      }
      const preview = pm().querySelector('.rme-code-preview');
      const rect = svg && svg.getBoundingClientRect();
      await document.fonts.load('16px KaTeX_Main');
      return {
        found: Boolean(svg),
        text: svg ? svg.textContent : preview ? preview.textContent : '',
        width: rect ? rect.width : 0,
        height: rect ? rect.height : 0,
        error: Boolean(preview && preview.classList.contains('is-error')),
        katexFont: document.fonts.check('16px KaTeX_Main'),
      };
    },

    // Read an example, write it as Markdown, read that, and tell if the document is the same.
    async roundTrip({ markdown }) {
      editor().commands.setContent(markdown, { contentType: 'markdown', emitUpdate: false });
      const first = JSON.stringify(editor().getJSON());
      const written = editor().getMarkdown();
      editor().commands.setContent(written, { contentType: 'markdown', emitUpdate: false });
      return { same: first === JSON.stringify(editor().getJSON()) };
    },

    // The line, word and character counts at the top of the page.
    async stats() {
      const bar = document.querySelector('.rme-stats');
      const value = (name) => {
        const item = bar && bar.querySelector(`[data-stat="${name}"]`);
        return item ? Number(item.dataset.value) : undefined;
      };
      const rect = bar && bar.getBoundingClientRect();
      return {
        found: Boolean(bar),
        hidden: Boolean(bar && bar.hidden),
        text: bar ? bar.textContent : '',
        lines: value('lines'),
        words: value('words'),
        characters: value('characters'),
        position: bar ? getComputedStyle(bar).position : '',
        top: rect ? rect.top : null,
        right: rect ? rect.right : null,
        width: innerWidth,
      };
    },

    // The facts about the file in the bar: the date and the authors. `hidden` is the attribute. On a narrow page a style hides the date too.
    async barFacts() {
      const bar = document.querySelector('.rme-stats');
      const read = (name) => {
        const item = bar.querySelector(`[data-stat="${name}"]`);
        return { hidden: item.hidden, text: item.textContent, title: item.title, value: item.dataset.value };
      };
      return {
        authors: read('authors'),
        modified: read('modified'),
        order: [...bar.querySelectorAll('[data-stat]')].map((item) => item.dataset.stat),
      };
    },

    // The settings button at the end of the bar.
    async settingsButton() {
      const button = document.querySelector('.rme-stats [data-action="settings"]');
      if (!button) {
        return { found: false };
      }
      const rect = button.getBoundingClientRect();
      const icon = button.querySelector('svg').getBoundingClientRect();
      const style = getComputedStyle(button);
      return {
        found: true,
        text: button.textContent,
        label: button.getAttribute('aria-label'),
        labelDisplay: getComputedStyle(button.querySelector('.rme-stats-button-label')).display,
        labelWidth: button.querySelector('.rme-stats-button-label').getBoundingClientRect().width,
        iconWidth: icon.width,
        top: rect.top,
        bottom: rect.bottom,
        right: rect.right,
        width: innerWidth,
        color: style.color,
        background: getComputedStyle(document.body).backgroundColor,
      };
    },

    async shortcutsState() {
      return shortcutsState();
    },

    async shortcutsOpen() {
      // A click of the mouse puts the focus on the button. A call of `click()` does not, so the test does it first.
      const button = document.querySelector('.rme-stats [data-action="shortcuts"]');
      button.focus();
      button.click();
      await sleep(50);
      return shortcutsState();
    },

    async pressEscape() {
      document.activeElement.dispatchEvent(
        new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }),
      );
      await sleep(50);
      return shortcutsState();
    },

    async clickBackdrop() {
      document
        .querySelector('.rme-modal-backdrop')
        .dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }));
      await sleep(50);
      return shortcutsState();
    },

    async clickModalLink({ index }) {
      const anchor = document.querySelectorAll('.rme-modal footer a')[index];
      const event = new MouseEvent('click', { bubbles: true, cancelable: true });
      anchor.dispatchEvent(event);
      await sleep(50);
      return { prevented: event.defaultPrevented, stillOpen: !document.querySelector('.rme-modal-backdrop').hidden };
    },

    // Press a formatting chord like a real keyboard, twice. `reachedWindow` counts the key presses that VS Code could see:
    // VS Code listens for keydown on the window of the page, and the editor stops a key that it handled before it gets there.
    async formatChord({ chord, shape }) {
      const mac = /Mac/.test(navigator.platform);
      const { mods, base } = parseChord(chord);
      const formats = () =>
        [
          'bold',
          'italic',
          'underline',
          'strike',
          'code',
          'superscript',
          'subscript',
          'bulletList',
          'orderedList',
          'taskList',
          'blockquote',
          'codeBlock',
        ]
          .filter((name) => editor().isActive(name))
          .concat(
            [1, 2, 3, 4, 5, 6].filter((level) => editor().isActive('heading', { level })).map((level) => `h${level}`),
          );
      let reachedWindow = 0;
      const spy = () => reachedWindow++;
      window.addEventListener('keydown', spy);
      try {
        pm().focus();
        editor().commands.setContent('some words here', { contentType: 'markdown', emitUpdate: false });
        editor().commands.setTextSelection({ from: 1, to: 5 });
        // VS Code prevents the default of some keys itself (Save, Find, Print, Copy) when they reach the window.
        // A key is handled by the editor when it is prevented and VS Code did not get it.
        const press = () => {
          const reachedBefore = reachedWindow;
          const event = new KeyboardEvent('keydown', keyEventInit(mods, base, shape, mac));
          pm().dispatchEvent(event);
          return event.defaultPrevented && reachedWindow === reachedBefore;
        };
        const before = formats();
        const handled = press();
        const afterFirst = formats();
        press();
        return { before, handled, afterFirst, afterSecond: formats(), reachedWindow };
      } finally {
        window.removeEventListener('keydown', spy);
      }
    },

    // A key that the editor must leave to VS Code: is it handled, and does it reach the window of the page?
    async keyReach({ chord, shape }) {
      const mac = /Mac/.test(navigator.platform);
      const { mods, base } = parseChord(chord);
      let reachedWindow = 0;
      const spy = () => reachedWindow++;
      window.addEventListener('keydown', spy);
      try {
        pm().focus();
        editor().commands.setContent('some words here', { contentType: 'markdown', emitUpdate: false });
        editor().commands.setTextSelection({ from: 1, to: 5 });
        const event = new KeyboardEvent('keydown', keyEventInit(mods, base, shape, mac));
        pm().dispatchEvent(event);
        // VS Code prevents the default of some keys itself (Save, Find, Print, Copy), so a prevented key is not always handled by the editor.
        return {
          handled: event.defaultPrevented && reachedWindow === 0,
          preventedByVsCode: event.defaultPrevented && reachedWindow > 0,
          reachedWindow,
          text: editor().getText(),
        };
      } finally {
        window.removeEventListener('keydown', spy);
      }
    },

    // Every chord that the editor handles, in every state and supported keyboard layout.
    async probeKeys() {
      const mac = /Mac/.test(navigator.platform);
      const applyState = (state) => {
        editor().commands.setContent(state.markdown, { contentType: 'markdown', emitUpdate: false });
        const size = editor().state.doc.content.size;
        editor().commands.setTextSelection({ from: Math.min(state.from, size), to: Math.min(state.to, size) });
        if (state.afterUndo) {
          editor().commands.toggleBold();
          editor().commands.undo();
        }
      };
      // A key is handled by the editor when it is prevented and it did not reach the window of the page, where VS Code listens.
      let reached = 0;
      const spy = () => reached++;
      const send = (init) => {
        reached = 0;
        const event = new KeyboardEvent('keydown', init);
        pm().dispatchEvent(event);
        return event.defaultPrevented && reached === 0;
      };
      pm().focus();
      window.addEventListener('keydown', spy);
      try {
        const shapes = /Win/.test(navigator.platform) ? ['win'] : ['win', 'mac'];
        return probeChords({ states: EDITOR_STATES, applyState, send, mac, shapes });
      } finally {
        window.removeEventListener('keydown', spy);
        // An open link field ends with a new, empty selection.
        editor().commands.setTextSelection(1);
      }
    },

    async clickSettings() {
      const base = sent.length;
      document.querySelector('.rme-stats [data-action="settings"]').click();
      await sleep(50);
      return { sent: sent.slice(base) };
    },

    // A change goes to the host after a short delay. Cmd+S, and leaving the editor, must send it at once.
    async flush({ how, text }) {
      await sleep(400);
      pm().focus();
      const base = edits();
      editor().commands.insertContentAt(editor().state.doc.content.size, {
        type: 'paragraph',
        content: [{ type: 'text', text }],
      });
      const before = edits() - base;
      if (how === 'save') {
        window.dispatchEvent(
          new KeyboardEvent('keydown', { key: 's', metaKey: true, bubbles: true, cancelable: true }),
        );
      } else {
        pm().dispatchEvent(new FocusEvent('blur'));
      }
      return { before, after: edits() - base };
    },

    async setContent({ markdown }) {
      editor().commands.setContent(markdown, { contentType: 'markdown', emitUpdate: false });
      window.scrollTo(0, 0);
      await sleep(150);
      return { links: [...pm().querySelectorAll('a')].map((a) => a.getAttribute('href')) };
    },

    async findReplace({ markdown, query, replacement }) {
      editor().commands.setContent(markdown, { contentType: 'markdown', emitUpdate: false });
      const mac = /Mac/.test(navigator.platform);
      const keyEvent = (key, modifiers) =>
        new KeyboardEvent('keydown', { key, ...modifiers, bubbles: true, cancelable: true });

      pm().focus();
      const findEvent = keyEvent('f', mac ? { metaKey: true } : { ctrlKey: true });
      pm().dispatchEvent(findEvent);
      await sleep(50);
      const bar = document.querySelector('.rme-find-bar');
      const findInput = bar.querySelector('[aria-label="Find"]');
      findInput.value = query;
      findInput.dispatchEvent(new Event('input', { bubbles: true }));
      const found = {
        handled: findEvent.defaultPrevented,
        focused: document.activeElement === findInput,
        count: bar.querySelector('.rme-find-count').textContent,
        highlights: pm().querySelectorAll('.rme-find-match').length,
      };

      const replaceEvent = keyEvent(mac ? 'f' : 'h', mac ? { metaKey: true, altKey: true } : { ctrlKey: true });
      pm().dispatchEvent(replaceEvent);
      await sleep(50);
      const replaceInput = bar.querySelector('[aria-label="Replace"]');
      replaceInput.value = replacement;
      bar.querySelector('[data-action="replace"]').click();
      bar.querySelector('[data-action="replace-all"]').click();
      await sleep(50);
      return {
        ...found,
        replaceHandled: replaceEvent.defaultPrevented,
        replaceFocused: document.activeElement === replaceInput,
        remaining: bar.querySelector('.rme-find-count').textContent,
      };
    },

    // Click a link in the text, with or without Ctrl or Cmd. The page may start a scroll.
    async clickLink({ href, meta, ctrl }) {
      const link = pm().querySelector(`a[href="${href}"]`);
      const event = new MouseEvent('click', {
        bubbles: true,
        cancelable: true,
        metaKey: Boolean(meta),
        ctrlKey: Boolean(ctrl),
      });
      link.dispatchEvent(event);
      // A scroll to a heading is smooth. Wait until the page stops.
      let last = -1;
      let still = 0;
      for (let step = 0; step < 60 && still < 3; step++) {
        await sleep(100);
        still = window.scrollY === last ? still + 1 : 0;
        last = window.scrollY;
      }
      const heading = [...pm().querySelectorAll('h2')].find((h) => h.textContent === 'The target');
      return {
        prevented: event.defaultPrevented,
        scrollY: window.scrollY,
        headingTop: heading ? heading.getBoundingClientRect().top : null,
      };
    },

    // A key press. VS Code reads every key in the webview, so the page must stop a key that the editor has handled.
    async keyLeak({ key, shortcut }) {
      const mac = /Mac/.test(navigator.platform);
      let reachedWindow = 0;
      const spy = () => reachedWindow++;
      window.addEventListener('keydown', spy);
      try {
        pm().focus();
        const event = new KeyboardEvent('keydown', {
          key,
          metaKey: shortcut && mac,
          ctrlKey: shortcut && !mac,
          bubbles: true,
          cancelable: true,
        });
        pm().dispatchEvent(event);
        return { handled: event.defaultPrevented, reachedWindow };
      } finally {
        window.removeEventListener('keydown', spy);
      }
    },

    async width() {
      return { property: getComputedStyle(document.documentElement).getPropertyValue('--rme-max-width').trim() };
    },

    // Ctrl or Cmd plus K on selected text, and Escape in the field: where does the focus go?
    async linkField({ text }) {
      const mac = /Mac/.test(navigator.platform);
      pm().focus();
      const from = positionOf(text);
      editor().commands.setTextSelection({ from, to: from + text.length });
      await sleep(600);
      pm().dispatchEvent(
        new KeyboardEvent('keydown', { key: 'k', metaKey: mac, ctrlKey: !mac, bubbles: true, cancelable: true }),
      );
      await sleep(500);
      const field = document.activeElement;
      return {
        linkMode: toolbar().classList.contains('is-link-mode'),
        focusInField: Boolean(field && field.matches('.rme-toolbar form input')),
        toolbarVisible: getComputedStyle(toolbar()).visibility === 'visible',
      };
    },

    async leaveLinkField() {
      document.activeElement.dispatchEvent(
        new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }),
      );
      await sleep(500);
      return { linkMode: toolbar().classList.contains('is-link-mode'), focusInText: document.activeElement === pm() };
    },

    // The front matter panel.
    async frontMatter() {
      const details = document.getElementById('frontmatter');
      return { hidden: details.hidden, value: document.getElementById('frontmatter-input').value };
    },

    async mdxBlocks() {
      return [...document.querySelectorAll('.rme-raw')].map((box) => {
        const area = box.querySelector('textarea');
        return {
          label: box.querySelector('.rme-raw-label')?.textContent,
          text: area?.value,
          colored: Boolean(box.querySelector('.rme-raw-colors [class^="hljs-"]')),
          // The colored copy is not cut off and does not sit lower than the text box (a padding of the page once did that).
          boxHeightOk: (() => {
            const colors = box.querySelector('.rme-raw-colors');
            return (
              Boolean(area && colors) &&
              colors.scrollHeight <= colors.clientHeight + 1 &&
              area.offsetHeight >= area.scrollHeight - 1
            );
          })(),
        };
      });
    },

    // How clear the selection color of a text box is. 1 is fully clear, so it hides the colored text that sits behind the box.
    async selectionAlpha({ selector }) {
      const area = document.querySelector(selector);
      const color = getComputedStyle(area, '::selection').backgroundColor;
      const slash = /\/\s*([\d.]+%?)\s*\)/.exec(color);
      const rgba = /^rgba\((?:[^,]+,){3}\s*([\d.]+)\)/.exec(color);
      const raw = slash ? slash[1] : rgba ? rgba[1] : '1';
      return { color, alpha: raw.endsWith('%') ? parseFloat(raw) / 100 : parseFloat(raw) };
    },

    async mdxInline() {
      return { count: document.querySelectorAll('.rme-html-inline').length };
    },

    async typeMdx({ index, value }) {
      const area = document.querySelectorAll('.rme-raw textarea')[index];
      area.value = value;
      area.dispatchEvent(new Event('input', { bubbles: true }));
      return { ok: true };
    },

    async typeFrontMatter({ value }) {
      const area = document.getElementById('frontmatter-input');
      area.value = value;
      area.dispatchEvent(new Event('input', { bubbles: true }));
      return { ok: true };
    },

    async linkTitle({ href }) {
      const link = pm().querySelector(`a[href="${href}"]`);
      link.title = '';
      link.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));
      return { title: link.title };
    },

    // Is the bar on the page? A bar that is off must take no room.
    async barState() {
      const bar = document.querySelector('.rme-stats');
      return {
        hidden: bar.hidden,
        height: bar.getBoundingClientRect().height,
        htmlClass: document.documentElement.classList.contains('rme-no-bar'),
      };
    },

    // The bar must stay at the top when the page scrolls.
    async statsWhenScrolled() {
      window.scrollTo(0, 150);
      await sleep(150);
      const rect = document.querySelector('.rme-stats').getBoundingClientRect();
      const result = { scrollY: window.scrollY, top: rect.top };
      window.scrollTo(0, 0);
      return result;
    },

    async typeAtEnd({ text }) {
      editor().chain().focus('end').insertContent(text).run();
      return { ok: true };
    },

    async media() {
      return {
        images: [...pm().querySelectorAll('img:not(.ProseMirror-separator)')].map((img) => ({
          src: img.getAttribute('src'),
          complete: img.complete,
          naturalWidth: img.naturalWidth,
        })),
        videos: [...pm().querySelectorAll('.rme-video video')].map((video) => video.getAttribute('src')),
      };
    },
  };

  window.addEventListener('message', async (event) => {
    const message = event.data;
    if (!message || message.type !== 'test:run') {
      return;
    }
    let result;
    try {
      result = await handlers[message.name](message.args || {});
    } catch (error) {
      result = { error: String((error && error.stack) || error) };
    }
    api.postMessage({ type: 'test:result', id: message.id, result });
  });
})();
