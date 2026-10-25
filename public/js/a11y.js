/*
 * Read-aloud and language support for the Ballot Assistant.
 *
 * Self-contained: it adds its own toolbar and attaches to whatever the app
 * renders, so index.html only needs to load this file and its strings.
 *
 *  - Read aloud uses the browser's Web Speech API (speechSynthesis). Nothing
 *    is sent to a server.
 *  - Interface text is translated from BA_I18N (a11y-i18n-strings.js) by
 *    matching the English text that is on screen.
 *  - Race and candidate details come from English JSON. When the browser has
 *    an on-device translator (the Translator API in Chrome 138+), they are
 *    translated locally; otherwise they stay in English and a notice says so.
 */
(function () {
  'use strict';

  const I18N = window.BA_I18N;
  if (!I18N) return;

  const LANGS = I18N.languages;
  const PREFS_KEY = 'ba-a11y-prefs';
  const RATES = [
    { value: 0.75, key: 'Slow' },
    { value: 1, key: 'Normal' },
    { value: 1.25, key: 'Fast' },
    { value: 1.5, key: 'Faster' },
  ];

  // Text under these is never rewritten by the translator.
  const NO_TRANSLATE = 'script, style, noscript, textarea, select, option, .a11y-own, [translate="no"], .notranslate';
  // Candidate names only get exact dictionary matches (ballot measure "Yes"/"No"),
  // never machine translation.
  const NAME = '.candidate-name';
  // Text under these is not read when reading a whole page or section.
  const NO_READ = 'script, style, noscript, textarea, select, option, button, .a11y-own, [aria-hidden="true"]';
  // Sections that get their own "read this" button.
  const SECTIONS = [
    { sel: '.overview-box', anchor: 'h4' },
    { sel: '.candidate-card', anchor: '.candidate-header' },
    { sel: '.summary-card', anchor: null },
  ];
  const TRANSLATED_ATTRS = ['placeholder', 'title', 'aria-label'];

  const state = { lang: 'en', rate: 1, autoRead: false, tapToRead: false };

  /* ------------------------------------------------------------------ */
  /* Preferences                                                         */
  /* ------------------------------------------------------------------ */

  function langMeta(code) {
    return LANGS.find(l => l.code === code) || LANGS[0];
  }

  // Map a browser or URL language tag (e.g. "zh-TW", "es-419", "fil") to one we support.
  function matchLang(tag) {
    if (!tag) return null;
    const t = String(tag).toLowerCase().replace('_', '-');
    const exact = LANGS.find(l => l.code.toLowerCase() === t);
    if (exact) return exact.code;
    if (t.startsWith('zh')) return /hant|tw|hk|mo/.test(t) ? 'zh-Hant' : 'zh-Hans';
    if (t.startsWith('fil')) return 'tl';
    const base = t.split('-')[0];
    const byBase = LANGS.find(l => l.code.toLowerCase() === base);
    return byBase ? byBase.code : null;
  }

  function loadPrefs() {
    let saved = {};
    try { saved = JSON.parse(localStorage.getItem(PREFS_KEY) || '{}') || {}; } catch (e) { saved = {}; }
    let fromUrl = null;
    try { fromUrl = matchLang(new URLSearchParams(location.search).get('lang')); } catch (e) {}
    let fromBrowser = null;
    for (const tag of (navigator.languages || [navigator.language])) {
      fromBrowser = matchLang(tag);
      if (fromBrowser) break;
    }
    state.lang = fromUrl || matchLang(saved.lang) || fromBrowser || 'en';
    if (RATES.some(r => r.value === saved.rate)) state.rate = saved.rate;
    state.autoRead = !!saved.autoRead;
    state.tapToRead = !!saved.tapToRead;
  }

  function savePrefs() {
    try { localStorage.setItem(PREFS_KEY, JSON.stringify(state)); } catch (e) {}
  }

  /* ------------------------------------------------------------------ */
  /* Dictionary translation                                              */
  /* ------------------------------------------------------------------ */

  // Leading/trailing symbols (emoji, arrows, check marks) and "1. " step numbers
  // are kept as-is around the translated text.
  const PREFIX_RE = /^[\s\p{S}‍️]*(?:\d+\.\s+)?/u;
  const SUFFIX_RE = /[\s\p{S}‍️]*$/u;
  const SEPARATORS = [' • ', ' | '];

  const templates = Object.keys(I18N.templates.es || {}).map(src => ({
    src,
    re: new RegExp('^' + src.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\\\{\d\\\}/g, '(.+?)') + '$'),
  }));

  function t(key) {
    const dict = I18N.strings[state.lang];
    return (dict && dict[key]) || key;
  }

  function lookup(text, lang) {
    const dict = I18N.strings[lang];
    return dict && Object.prototype.hasOwnProperty.call(dict, text) ? dict[text] : null;
  }

  function translateCore(core, lang) {
    // Templates can leave doubled spaces where a value was empty.
    core = core.replace(/\s{2,}/g, ' ');
    let v = lookup(core, lang);
    if (v != null) return v;

    const punct = core.match(/^([\s\S]*?)([.:!?…]+)$/);
    if (punct) {
      v = lookup(punct[1], lang);
      if (v != null) return v + punct[2];
    }

    for (const sep of SEPARATORS) {
      if (!core.includes(sep)) continue;
      let any = false;
      const parts = core.split(sep).map(p => {
        const tr = translateString(p, lang);
        if (tr != null) { any = true; return tr; }
        return p;
      });
      return any ? parts.join(sep) : null;
    }

    const date = localizeDate(core, lang);
    if (date != null) return date;

    const tpls = I18N.templates[lang] || {};
    for (const tpl of templates) {
      const m = core.match(tpl.re);
      if (!m || !tpls[tpl.src]) continue;
      return tpls[tpl.src].replace(/\{(\d)\}/g, (_, i) => {
        const part = m[Number(i) + 1];
        const tr = translateString(part, lang);
        return tr != null ? tr : part;
      });
    }

    // Several sentences in one text node. If some are unknown (an address, say),
    // leave the whole node to the machine translator when there is one, else
    // translate the known sentences. "U.S. General" is not a sentence break.
    const sentences = core.split(/(?<=[a-z0-9)][.!?])\s+(?=[A-Z(])/);
    if (sentences.length > 1) {
      let known = 0;
      const out = sentences.map(sentence => {
        const tr = translateString(sentence, lang);
        if (tr == null) return sentence;
        known++;
        return tr;
      });
      if (!known || (known < sentences.length && mt.status === 'ready')) return null;
      return out.join(/^(zh|ja)/.test(lang) ? '' : ' ');
    }

    // "Washington General Election." matches a template once the period is off.
    if (punct && punct[1]) {
      v = translateCore(punct[1], lang);
      if (v != null) return v + punct[2];
    }
    return null;
  }

  const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  const DATE_RE = new RegExp('^(' + WEEKDAYS.join('|') + '), (' + MONTHS.join('|') + ') (\\d{1,2}), (\\d{4})$');

  // "Tuesday, November 3, 2026" in the reader's language.
  function localizeDate(text, lang) {
    const m = text.match(DATE_RE);
    if (!m) return null;
    const date = new Date(Number(m[4]), MONTHS.indexOf(m[2]), Number(m[3]));
    const meta = langMeta(lang);
    if (meta.dateNames) {
      return `${meta.dateNames.days[date.getDay()]} ${date.getDate()} ${meta.dateNames.months[date.getMonth()]} ${date.getFullYear()}`;
    }
    try {
      return date.toLocaleDateString(meta.intl || meta.html, { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
    } catch (e) {
      return null;
    }
  }

  function splitAffixes(text) {
    const pre = text.match(PREFIX_RE)[0];
    const rest = text.slice(pre.length);
    const suf = rest.match(SUFFIX_RE)[0];
    return { pre, core: rest.slice(0, rest.length - suf.length), suf };
  }

  // Returns the translation of an English UI string, or null if it is unknown.
  function translateString(text, lang) {
    if (lang === 'en' || !text) return null;
    const { pre, core, suf } = splitAffixes(text);
    if (!core) return null;
    const out = translateCore(core, lang);
    return out == null ? null : pre + out + suf;
  }

  /* ------------------------------------------------------------------ */
  /* Applying translations to the page                                   */
  /* ------------------------------------------------------------------ */

  const original = new WeakMap(); // Text node -> English source text
  const shown = new WeakMap();    // Text node -> text we last put there
  const kind = new WeakMap();     // Text node -> 'ui' | 'mt' | 'en'
  const attrOriginal = new WeakMap();

  function canTranslate(node) {
    const p = node.parentElement;
    return !!p && !p.closest(NO_TRANSLATE);
  }

  function setText(node, value, k) {
    if (node.data !== value) node.data = value;
    shown.set(node, value);
    kind.set(node, k);
  }

  function processText(node) {
    if (!canTranslate(node)) return;
    // If the app changed the text since we last touched it, that is the new source.
    if (!original.has(node) || node.data !== shown.get(node)) original.set(node, node.data);
    const src = original.get(node);
    if (!/\p{L}/u.test(src)) return;

    const ui = translateString(src, state.lang);
    if (ui != null) { setText(node, ui, 'ui'); return; }
    if (node.parentElement.closest(NAME)) {
      const exact = lookup(src.trim(), state.lang);
      setText(node, exact != null ? src.replace(src.trim(), exact) : src, exact != null ? 'ui' : 'en');
      return;
    }
    const cached = mtCached(src);
    if (cached != null) { applyMT(node, src, cached); return; }
    setText(node, src, 'en');
    if (state.lang !== 'en') mtEnqueue(node, src);
  }

  function processAttrs(el) {
    if (el.closest(NO_TRANSLATE)) return;
    let orig = attrOriginal.get(el);
    for (const name of TRANSLATED_ATTRS) {
      if (!el.hasAttribute(name)) continue;
      const cur = el.getAttribute(name);
      if (!orig) { orig = {}; attrOriginal.set(el, orig); }
      if (!orig[name] || cur !== orig[name].shown) orig[name] = { src: cur, shown: cur };
      const tr = translateString(orig[name].src, state.lang);
      const val = tr != null ? tr : orig[name].src;
      orig[name].shown = val;
      if (cur !== val) el.setAttribute(name, val);
    }
  }

  function processTree(root) {
    if (root.nodeType === Node.TEXT_NODE) { processText(root); return; }
    if (root.nodeType !== Node.ELEMENT_NODE) return;
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    let n;
    while ((n = walker.nextNode())) processText(n);
    processAttrs(root);
    root.querySelectorAll('[placeholder], [title], [aria-label]').forEach(processAttrs);
  }

  function processAll() {
    const title = document.querySelector('title');
    if (title) processTree(title);
    processTree(document.body);
  }

  /* ------------------------------------------------------------------ */
  /* On-device machine translation (Translator API)                      */
  /* ------------------------------------------------------------------ */

  const mt = {
    status: 'off',          // off | unsupported | needs-activation | loading | ready
    lang: null,
    translator: null,
    queue: [],
    queued: new WeakSet(),
    running: false,
    cache: new Map(),       // "lang\u0000text" -> translation
  };

  async function setupMT(lang) {
    if (mt.translator && mt.translator.destroy) { try { mt.translator.destroy(); } catch (e) {} }
    mt.translator = null;
    mt.queue = [];
    mt.queued = new WeakSet();
    mt.lang = lang;
    if (lang === 'en') { mt.status = 'off'; updateNotice(); return; }
    if (!('Translator' in self)) { mt.status = 'unsupported'; updateNotice(); return; }

    const opts = { sourceLanguage: 'en', targetLanguage: langMeta(lang).mt };
    try {
      // Some browsers expose the API but never answer; don't wait forever.
      const avail = await Promise.race([
        self.Translator.availability(opts),
        new Promise(resolve => setTimeout(() => resolve('unavailable'), 5000)),
      ]);
      if (mt.lang !== lang) return;
      if (avail === 'unavailable' || avail === 'no') { mt.status = 'unsupported'; updateNotice(); return; }
      // Downloading a language model needs a click or tap.
      const activated = !navigator.userActivation || navigator.userActivation.isActive;
      if (avail !== 'available' && !activated) { mt.status = 'needs-activation'; updateNotice(); return; }
      mt.status = 'loading';
      updateNotice();
      const translator = await self.Translator.create(opts);
      if (mt.lang !== lang) { if (translator.destroy) translator.destroy(); return; }
      mt.translator = translator;
      mt.status = 'ready';
      updateNotice();
      processAll();
    } catch (e) {
      if (mt.lang !== lang) return;
      mt.status = (e && e.name === 'NotAllowedError') ? 'needs-activation' : 'unsupported';
      updateNotice();
    }
  }

  function mtEnqueue(node, src) {
    if (mt.status !== 'ready' || mt.lang !== state.lang) return;
    const { core } = splitAffixes(src);
    if (!/\p{L}{2,}/u.test(core)) return;
    if (mt.queued.has(node)) return;
    mt.queued.add(node);
    mt.queue.push({ node, src });
    runMT();
  }

  function mtCached(src) {
    if (mt.status !== 'ready' || mt.lang !== state.lang) return null;
    const hit = mt.cache.get(state.lang + '\u0000' + splitAffixes(src).core);
    return hit == null ? null : hit;
  }

  function applyMT(node, src, translatedCore) {
    const { pre, suf } = splitAffixes(src);
    setText(node, pre + translatedCore + suf, 'mt');
  }

  // Translate what the reader is looking at first.
  function nextMTJob() {
    const active = activeRoot();
    let i = mt.queue.findIndex(j => active && active.contains(j.node));
    if (i < 0) i = 0;
    return mt.queue.splice(i, 1)[0];
  }

  async function runMT() {
    if (mt.running) return;
    mt.running = true;
    updateNotice();
    try {
      while (mt.queue.length && mt.status === 'ready') {
        const job = nextMTJob();
        mt.queued.delete(job.node);
        const lang = mt.lang;
        // Skip nodes that were removed or changed while waiting.
        if (!job.node.isConnected || original.get(job.node) !== job.src || lang !== state.lang) continue;
        const { core } = splitAffixes(job.src);
        const key = lang + '\u0000' + core;
        let out = mt.cache.get(key);
        if (out == null) {
          try { out = await mt.translator.translate(core); } catch (e) { out = null; }
          if (out == null) continue;
          mt.cache.set(key, out);
        }
        if (lang === state.lang && original.get(job.node) === job.src) applyMT(job.node, job.src, out);
      }
    } finally {
      mt.running = false;
      updateNotice();
      mtIdleWaiters.splice(0).forEach(fn => fn());
    }
  }

  const mtIdleWaiters = [];
  function mtPendingIn(root) {
    return mt.queue.some(j => root.contains(j.node));
  }
  // Resolve once the given section has been translated (or after a timeout).
  function whenTranslated(root, timeoutMs) {
    if (mt.status !== 'ready' || !mtPendingIn(root)) return Promise.resolve();
    return new Promise(resolve => {
      const timer = setTimeout(resolve, timeoutMs);
      const check = () => {
        if (!mtPendingIn(root) || !mt.running) { clearTimeout(timer); resolve(); return; }
        setTimeout(check, 100);
      };
      check();
    });
  }

  /* ------------------------------------------------------------------ */
  /* Read aloud (speechSynthesis)                                        */
  /* ------------------------------------------------------------------ */

  const synth = ('speechSynthesis' in window && 'SpeechSynthesisUtterance' in window) ? window.speechSynthesis : null;
  const tts = { voices: [], queue: [], index: 0, token: 0, utterance: null, active: false, paused: false, source: null, highlighted: null };

  function loadVoices() {
    if (!synth) return;
    tts.voices = synth.getVoices() || [];
    updateNotice();
  }

  function voiceScore(v) {
    let s = 0;
    if (/natural|neural|enhanced|premium|google|online/i.test(v.name)) s += 2;
    if (v.localService) s += 1;
    if (v.default) s += 0.5;
    return s;
  }

  function bestOf(list) {
    return list.slice().sort((a, b) => voiceScore(b) - voiceScore(a))[0];
  }

  // Returns { voice, approximate } for a language, voice may be null.
  function pickVoice(code) {
    const meta = langMeta(code);
    const voices = tts.voices.map(v => ({ v, l: (v.lang || '').replace('_', '-').toLowerCase() }));
    const tryTags = (tags) => {
      for (const tag of tags) {
        const m = voices.filter(x => x.l === tag.toLowerCase());
        if (m.length) return bestOf(m.map(x => x.v));
      }
      for (const tag of tags) {
        const base = tag.toLowerCase().split('-')[0];
        const m = voices.filter(x => x.l.split('-')[0] === base);
        if (m.length) return bestOf(m.map(x => x.v));
      }
      return null;
    };
    const voice = tryTags(meta.tts);
    if (voice) return { voice, approximate: false };
    const fallback = meta.ttsFallback ? tryTags(meta.ttsFallback) : null;
    return { voice: fallback, approximate: true };
  }

  function cleanForSpeech(s) {
    return s
      .replace(/[\p{Extended_Pictographic}‍️⃣]/gu, ' ')
      .replace(/\s*[•|→←✓○]\s*/g, ', ')
      .replace(/\s+\/\s+/g, ', ')
      .replace(/\s+/g, ' ')
      .replace(/^[\s,]+|[\s,]+$/g, '');
  }

  function isVisible(el) {
    if (el.checkVisibility) return el.checkVisibility({ visibilityProperty: true });
    return el.getClientRects().length > 0 && getComputedStyle(el).visibility !== 'hidden';
  }

  function blockAncestor(el, root, cache) {
    let cur = el;
    while (cur && cur !== root) {
      let d = cache.get(cur);
      if (d === undefined) { d = getComputedStyle(cur).display; cache.set(cur, d); }
      if (!d.startsWith('inline') && d !== 'contents') return cur;
      cur = cur.parentElement;
    }
    return root;
  }

  // Which voice to use for a piece of text: the chosen language, unless it is
  // a longer passage that is still in English (no translator available).
  function speechLangFor(node) {
    if (state.lang === 'en') return 'en';
    const k = kind.get(node);
    if (k === 'ui' || k === 'mt') return state.lang;
    if (node.parentElement && node.parentElement.closest('.candidate-name')) return state.lang;
    return /\p{L}+(\s+\p{L}+){3,}/u.test(node.data) ? 'en' : state.lang;
  }

  function endsSentence(s) {
    return /[.!?:;,。！？：；、،؟।]$/.test(s);
  }

  // Group the visible text under root into readable blocks.
  function collectBlocks(root, includeControls) {
    const skip = includeControls ? NO_READ.replace('button, ', '') : NO_READ;
    const cache = new Map();
    const blocks = [];
    let cur = null;
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
      acceptNode(n) {
        const p = n.parentElement;
        if (!p || p.closest(skip) || !/[\p{L}\p{N}]/u.test(n.data) || !isVisible(p)) return NodeFilter.FILTER_REJECT;
        return NodeFilter.FILTER_ACCEPT;
      },
    });
    let n;
    while ((n = walker.nextNode())) {
      const text = cleanForSpeech(n.data);
      if (!text) continue;
      const el = blockAncestor(n.parentElement, root, cache);
      const lang = speechLangFor(n);
      if (cur && cur.el === el && cur.lang === lang) {
        // Items laid out side by side (name and party) get a pause; inline text runs on.
        const display = cache.get(el) || getComputedStyle(el).display;
        const sideBySide = /flex|grid/.test(display) || (cur.lastParent.closest('a') && n.parentElement.closest('a'));
        const pause = sideBySide && cur.lastParent !== n.parentElement && !endsSentence(cur.text);
        cur.text += (pause ? ', ' : ' ') + text;
      } else {
        cur = { el, lang, text };
        blocks.push(cur);
      }
      cur.lastParent = n.parentElement;
    }
    return blocks;
  }

  // Break long text into sentence-sized pieces; some engines stop reading
  // utterances that run longer than about 15 seconds.
  function chunk(text, max) {
    const sentences = text.split(/(?<=[\p{Ll}\d)][.!?])\s+|(?<=[؟।])\s+|(?<=[。！？])\s*/u).filter(Boolean);
    const out = [];
    let buf = '';
    for (let s of sentences) {
      while (s.length > max) {
        let cut = s.lastIndexOf(' ', max);
        if (cut < max / 2) cut = max;
        out.push(s.slice(0, cut));
        s = s.slice(cut).trim();
      }
      if (buf && (buf + ' ' + s).length > max) { out.push(buf); buf = s; }
      else buf = buf ? buf + ' ' + s : s;
    }
    if (buf) out.push(buf);
    return out;
  }

  function highlight(el) {
    if (tts.highlighted === el) return;
    if (tts.highlighted) tts.highlighted.classList.remove('a11y-speaking');
    tts.highlighted = el || null;
    if (!el) return;
    el.classList.add('a11y-speaking');
    const r = el.getBoundingClientRect();
    if (r.top < 0 || r.bottom > window.innerHeight) {
      const reduce = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
      el.scrollIntoView({ block: 'center', behavior: reduce ? 'auto' : 'smooth' });
    }
  }

  function speakBlocks(blocks, source) {
    if (!synth) return;
    stopSpeaking();
    tts.queue = [];
    for (const b of blocks) for (const piece of chunk(b.text, 220)) tts.queue.push({ el: b.el, lang: b.lang, text: piece });
    if (!tts.queue.length) return;
    tts.index = 0;
    tts.active = true;
    tts.paused = false;
    tts.source = source || null;
    const token = ++tts.token;
    speakNext(token);
    updatePlayer();
  }

  function speakNext(token) {
    if (token !== tts.token) return;
    const item = tts.queue[tts.index];
    if (!item) { finishSpeaking(); return; }
    const u = new SpeechSynthesisUtterance(item.text);
    const { voice } = pickVoice(item.lang);
    if (voice) u.voice = voice;
    u.lang = voice ? voice.lang : (langMeta(item.lang).tts[0] || item.lang);
    u.rate = state.rate;
    u.onend = () => { if (token === tts.token) { tts.index++; speakNext(token); } };
    u.onerror = (e) => {
      if (token !== tts.token || e.error === 'interrupted' || e.error === 'canceled') return;
      tts.index++;
      speakNext(token);
    };
    tts.utterance = u; // keep a reference so the end event is not lost to garbage collection
    highlight(item.el);
    synth.speak(u);
  }

  function finishSpeaking() {
    tts.active = false;
    tts.paused = false;
    tts.source = null;
    highlight(null);
    updatePlayer();
  }

  function stopSpeaking() {
    tts.token++;
    if (synth && (synth.speaking || synth.pending || synth.paused)) synth.cancel();
    if (tts.active) finishSpeaking();
  }

  function togglePause() {
    if (!synth || !tts.active) return;
    if (tts.paused) { synth.resume(); tts.paused = false; }
    else { synth.pause(); tts.paused = true; }
    updatePlayer();
  }

  // The step the reader is on: the active step card, or the main area.
  function activeRoot() {
    return document.querySelector('.step-card.active') || document.querySelector('main') || document.body;
  }

  async function readPage() {
    const root = activeRoot();
    await whenTranslated(root, 4000);
    const blocks = [];
    const header = document.querySelector('header');
    // The page heading is only worth repeating on the first screen.
    if (header && root.id === 'step-0') blocks.push(...collectBlocks(header));
    blocks.push(...collectBlocks(root));
    speakBlocks(blocks, 'page');
  }

  function readSection(el) {
    if (tts.active && tts.source === el) { stopSpeaking(); return; }
    speakBlocks(collectBlocks(el), el);
  }

  /* ------------------------------------------------------------------ */
  /* Toolbar, player and per-section buttons                             */
  /* ------------------------------------------------------------------ */

  let bar, player, notice;

  const ICON_SPEAKER = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M11 5 6 9H3v6h3l5 4z"/><path d="M15.5 8.5a5 5 0 0 1 0 7M18.5 5.5a9 9 0 0 1 0 13"/></svg>';

  function buildToolbar() {
    bar = document.createElement('div');
    bar.className = 'a11y-bar a11y-own';
    bar.setAttribute('role', 'region');
    bar.innerHTML = `
      <label class="a11y-field a11y-lang-field">
        <svg class="a11y-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18"/></svg>
        <span class="a11y-visually-hidden" data-k="Language"></span>
        <select id="a11y-lang" translate="no">
          ${LANGS.map(l => `<option value="${l.code}" lang="${l.html}">${l.native}${l.native !== l.name ? ' (' + l.name + ')' : ''}</option>`).join('')}
        </select>
      </label>
      <button type="button" class="a11y-btn a11y-primary" id="a11y-read">
        ${ICON_SPEAKER} <span id="a11y-read-label" data-k="Read this page"></span>
      </button>
      <details class="a11y-options">
        <summary class="a11y-btn" aria-haspopup="true">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 7h10M18 7h2M4 17h4M12 17h8"/><circle cx="16" cy="7" r="2"/><circle cx="10" cy="17" r="2"/></svg>
          <span class="a11y-visually-hidden" data-k="Reading options"></span>
        </summary>
        <div class="a11y-options-panel">
          <label class="a11y-field a11y-stack">
            <span data-k="Reading speed"></span>
            <select id="a11y-rate">
              ${RATES.map(r => `<option value="${r.value}" data-k="${r.key}"></option>`).join('')}
            </select>
          </label>
          <label class="a11y-check"><input type="checkbox" id="a11y-auto"> <span data-k="Read each step aloud automatically"></span></label>
          <label class="a11y-check"><input type="checkbox" id="a11y-tap"> <span data-k="Tap any text to hear it"></span></label>
        </div>
      </details>
    `;
    const slot = document.getElementById('a11y-slot');
    const container = document.querySelector('.container');
    if (slot) slot.appendChild(bar);
    else if (container) container.insertBefore(bar, container.firstChild);
    else document.body.insertBefore(bar, document.body.firstChild);

    // Notices about voices and translation sit under the top bar, full width.
    const noticeEl = document.createElement('div');
    noticeEl.className = 'a11y-notice a11y-own';
    noticeEl.id = 'a11y-notice';
    noticeEl.setAttribute('role', 'status');
    noticeEl.setAttribute('aria-live', 'polite');
    noticeEl.hidden = true;
    const topbar = document.querySelector('.topbar');
    if (topbar) topbar.after(noticeEl);
    else bar.appendChild(noticeEl);

    const options = bar.querySelector('.a11y-options');
    document.addEventListener('click', e => { if (options.open && !options.contains(e.target)) options.open = false; });
    options.addEventListener('keydown', e => { if (e.key === 'Escape' && options.open) { options.open = false; options.querySelector('summary').focus(); } });

    player = document.createElement('div');
    player.className = 'a11y-player a11y-own';
    player.hidden = true;
    player.innerHTML = `
      <span class="a11y-player-label">${ICON_SPEAKER} <span data-k="Reading aloud"></span></span>
      <button type="button" class="a11y-btn" id="a11y-pause"></button>
      <button type="button" class="a11y-btn" id="a11y-stop"><span aria-hidden="true">■</span> <span data-k="Stop"></span></button>
    `;
    document.body.appendChild(player);
    notice = noticeEl;

    const langSel = bar.querySelector('#a11y-lang');
    langSel.value = state.lang;
    langSel.addEventListener('change', () => setLanguage(langSel.value));

    const rateSel = bar.querySelector('#a11y-rate');
    rateSel.value = String(state.rate);
    rateSel.addEventListener('change', () => { state.rate = Number(rateSel.value); savePrefs(); });

    const auto = bar.querySelector('#a11y-auto');
    auto.checked = state.autoRead;
    auto.addEventListener('change', () => { state.autoRead = auto.checked; savePrefs(); });

    const tap = bar.querySelector('#a11y-tap');
    tap.checked = state.tapToRead;
    tap.addEventListener('change', () => { state.tapToRead = tap.checked; savePrefs(); });

    bar.querySelector('#a11y-read').addEventListener('click', () => {
      if (tts.active) stopSpeaking(); else readPage();
    });
    player.querySelector('#a11y-pause').addEventListener('click', togglePause);
    player.querySelector('#a11y-stop').addEventListener('click', stopSpeaking);

    if (!synth) {
      bar.querySelectorAll('#a11y-read, #a11y-rate, #a11y-auto, #a11y-tap').forEach(el => { el.disabled = true; });
    }
  }

  function renderOwnText() {
    document.querySelectorAll('.a11y-own [data-k]').forEach(el => { el.textContent = t(el.dataset.k); });
    bar.setAttribute('aria-label', t('Read aloud & language'));
    const optionsToggle = bar.querySelector('.a11y-options summary');
    if (optionsToggle) optionsToggle.title = t('Reading options');
    document.querySelectorAll('.a11y-say').forEach(b => {
      b.setAttribute('aria-label', t('Read this section aloud'));
      b.title = t('Read this section aloud');
    });
    updatePlayer();
    updateNotice();
  }

  function updatePlayer() {
    if (!player) return;
    player.hidden = !tts.active;
    const pause = player.querySelector('#a11y-pause');
    pause.innerHTML = tts.paused
      ? `<span aria-hidden="true">▶</span> ${t('Resume')}`
      : `<span aria-hidden="true">⏸</span> ${t('Pause')}`;
    const label = bar.querySelector('#a11y-read-label');
    label.textContent = tts.active && tts.source === 'page' ? t('Stop') : t('Read this page');
    document.querySelectorAll('.a11y-say').forEach(b => b.classList.toggle('a11y-say-active', tts.active && tts.source === b._a11ySection));
  }

  function updateNotice() {
    if (!notice) return;
    const lines = [];
    let button = false;
    if (!synth) {
      lines.push(t('Read-aloud is not available in this browser.'));
    } else if (state.lang !== 'en' && tts.voices.length && pickVoice(state.lang).approximate) {
      lines.push(t('No voice for this language is installed on this device, so it will be read with the closest available voice.'));
    }
    if (state.lang !== 'en') {
      if (mt.status === 'ready' || mt.status === 'loading') {
        lines.push(t('Race and candidate details were translated automatically by your browser and may contain errors. Always check your official voter guide.'));
        if (mt.status === 'loading' || mt.running) lines.push(t('Translating…'));
      } else if (mt.status === 'unsupported' || mt.status === 'needs-activation') {
        lines.push(t('Race and candidate details are shown in English because this browser cannot translate them automatically. Your county election office may provide an official voter guide in your language.'));
        button = mt.status === 'needs-activation';
      }
    }
    notice.hidden = !lines.length;
    notice.innerHTML = '';
    for (const line of lines) {
      const p = document.createElement('p');
      p.textContent = line;
      notice.appendChild(p);
    }
    if (button) {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'a11y-btn';
      b.textContent = t('Turn on automatic translation');
      b.addEventListener('click', () => setupMT(state.lang));
      notice.appendChild(b);
    }
  }

  function addSectionButtons(root) {
    if (!synth || root.nodeType !== Node.ELEMENT_NODE) return;
    for (const { sel, anchor } of SECTIONS) {
      const found = root.matches(sel) ? [root] : Array.from(root.querySelectorAll(sel));
      for (const section of found) {
        if (section._a11ySay && section.contains(section._a11ySay)) continue;
        const target = (anchor && section.querySelector(anchor)) || section;
        const b = document.createElement('button');
        b.type = 'button';
        b.className = 'a11y-say a11y-own';
        b.innerHTML = ICON_SPEAKER;
        b.setAttribute('aria-label', t('Read this section aloud'));
        b.title = t('Read this section aloud');
        b._a11ySection = section;
        b.addEventListener('click', (e) => {
          e.preventDefault();
          e.stopPropagation(); // don't select the candidate card
          readSection(section);
        });
        section._a11ySay = b;
        if (target === section) section.insertBefore(b, section.firstChild);
        else target.appendChild(b);
      }
    }
  }

  /* ------------------------------------------------------------------ */
  /* Wiring                                                              */
  /* ------------------------------------------------------------------ */

  function setLanguage(code) {
    state.lang = langMeta(code).code;
    savePrefs();
    const meta = langMeta(state.lang);
    document.documentElement.lang = meta.html;
    document.documentElement.dir = meta.dir;
    stopSpeaking();
    renderOwnText();
    processAll();
    setupMT(state.lang);
  }

  let lastActive = null;
  function onStepChange() {
    const active = document.querySelector('.step-card.active');
    if (active === lastActive) return;
    lastActive = active;
    if (tts.active) stopSpeaking();
    if (state.autoRead && active) readPage();
  }

  function onTap(e) {
    if (!state.tapToRead || !synth) return;
    const target = e.target;
    if (!(target instanceof Element) || target.closest('.a11y-own, input, select, textarea, a[href]')) return;
    const block = blockAncestor(target, document.body, new Map());
    const blocks = collectBlocks(block, true);
    if (blocks.length) speakBlocks(blocks, block);
  }

  function init() {
    loadPrefs();
    buildToolbar();
    const meta = langMeta(state.lang);
    document.documentElement.lang = meta.html;
    document.documentElement.dir = meta.dir;

    if (synth) {
      loadVoices();
      if (synth.addEventListener) synth.addEventListener('voiceschanged', loadVoices);
      else synth.onvoiceschanged = loadVoices;
      window.addEventListener('pagehide', () => synth.cancel());
    }

    renderOwnText();
    addSectionButtons(document.body);
    processAll();
    setupMT(state.lang);
    lastActive = document.querySelector('.step-card.active');

    let stepCheck = false;
    new MutationObserver(muts => {
      for (const m of muts) {
        if (m.type === 'childList') {
          m.addedNodes.forEach(n => {
            if (n.nodeType === Node.ELEMENT_NODE && n.classList.contains('a11y-own')) return;
            addSectionButtons(n);
            processTree(n);
          });
        } else if (m.type === 'characterData') {
          processText(m.target);
        } else if (m.type === 'attributes') {
          if (m.attributeName === 'class') stepCheck = true;
          else processAttrs(m.target);
        }
      }
      if (stepCheck) { stepCheck = false; onStepChange(); }
    }).observe(document.documentElement, {
      childList: true,
      subtree: true,
      characterData: true,
      attributes: true,
      attributeFilter: ['class'].concat(TRANSLATED_ATTRS),
    });

    document.addEventListener('click', onTap, true);
    document.addEventListener('keydown', e => { if (e.key === 'Escape' && tts.active) stopSpeaking(); });
  }

  // Small hooks for testing from the console.
  window.BallotA11y = { setLanguage, readPage, stopSpeaking, translateString, collectBlocks, get state() { return { ...state, mt: mt.status }; } };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
