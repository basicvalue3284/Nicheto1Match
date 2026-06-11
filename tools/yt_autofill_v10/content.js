// ── YT AutoFill · content.js v10.0 ───────────────────────────────────────────
// NEW: Read open popup filename before filling — return mismatch error if wrong
// NEW: Aggressive notify uncheck — shadow DOM, MutationObserver, multiple strategies
// NEW: Export readPopupFilename for panel to call before sending fill
// ─────────────────────────────────────────────────────────────────────────────

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.action === 'FILL_METADATA') {
    run(msg.meta, msg.thumbDataUrl, msg.expectedBase)
      .then(result => sendResponse({ success: true, thumbUploaded: result.thumbUploaded }))
      .catch(e    => sendResponse({ success: false, error: e.message }));
    return true;
  }
  if (msg.action === 'READ_POPUP_FILENAME') {
    const fn = getPopupFilename();
    sendResponse({ filename: fn });
    return false;
  }
});

// ── READ OPEN POPUP FILENAME ──────────────────────────────────────────────────
function getPopupFilename() {
  // Try multiple selectors for the filename shown in the upload dialog
  const sels = [
    '.ytcp-uploads-dialog .file-name',
    'ytcp-uploads-dialog .file-name',
    '[class*="file-name"]',
    '.ytcp-video-row__file-name',
    'ytcp-video-upload-progress .file-name',
  ];
  for (const s of sels) {
    const el = document.querySelector(s);
    const t = el?.textContent?.trim();
    if (t) return t;
  }
  // Broader scan for .mp4/.mov in text nodes
  for (const el of document.querySelectorAll('span, div, p, td, yt-formatted-string')) {
    const t = (el.textContent || '').trim();
    if (t.match(/\.(mp4|mov|avi|mkv|webm)$/i) && el.children.length === 0 && t.length < 300) return t;
  }
  return null;
}

// Strip extension and normalise for comparison
function baseOf(filename) {
  return (filename || '').replace(/\.(mp4|mov|avi|mkv|webm|json|png|jpe?g|webp|gif)$/i, '').trim().toLowerCase();
}

// ── MAIN ─────────────────────────────────────────────────────────────────────
async function run(meta, thumbDataUrl, expectedBase) {
  log('v10.0 starting…');

  // ── FILENAME VERIFICATION ──
  // If panel passed expectedBase (from JSON filename), check it matches
  // the popup currently open before touching any fields
  if (expectedBase) {
    const popupFile = getPopupFilename();
    if (popupFile) {
      const popupBase = baseOf(popupFile);
      const jsonBase  = baseOf(expectedBase);
      if (popupBase && jsonBase && popupBase !== jsonBase) {
        throw new Error(
          'FILENAME_MISMATCH||popup:' + popupFile + '||json:' + expectedBase
        );
      }
    }
    // If popupFile is null we can't verify — proceed anyway (better than blocking)
  }

  await fillTitle(meta.title);       log('title ✓');
  await fillDescription(meta.description); log('desc ✓');

  await scrollForm(300);
  await uncheckNotify();             log('notify ✓');
  await clickShowMore();             log('show more ✓');
  await fillTags(meta.tags);         log('tags ✓');
  await selectAlteredNo();           log('altered ✓');

  let thumbUploaded = false;
  if (thumbDataUrl) {
    thumbUploaded = await uploadThumbnail(thumbDataUrl);
    log('thumb: ' + (thumbUploaded ? 'uploaded ✓' : 'failed'));
  }

  log('done ✓');
  return { thumbUploaded };
}

// ── TITLE ─────────────────────────────────────────────────────────────────────
async function fillTitle(title) {
  const el = await waitFor(findTitle, 10000, 'Title field not found. Is the video Details popup open?');
  await fillEditable(el, title, 'title');
}
function findTitle() {
  const wrap = document.querySelector('#title-textarea');
  if (wrap) { const ce = wrap.querySelector('[contenteditable="true"]'); if (ce && vis(ce)) return ce; }
  for (const el of document.querySelectorAll('[contenteditable="true"]')) { if (vis(el)) return el; }
  return null;
}

// ── DESCRIPTION ───────────────────────────────────────────────────────────────
async function fillDescription(desc) {
  const el = await waitFor(findDesc, 8000, 'Description field not found.');
  await fillEditable(el, desc, 'desc');
}
function findDesc() {
  let n = 0;
  for (const el of document.querySelectorAll('[contenteditable="true"]')) {
    if (vis(el)) { n++; if (n === 2) return el; }
  }
  return null;
}

// ── EDITABLE FILL ─────────────────────────────────────────────────────────────
async function fillEditable(el, text, name) {
  el.focus(); await sleep(180);
  document.execCommand('selectAll', false, null); await sleep(70);
  document.execCommand('insertText', false, text); await sleep(220);
  fire(el); if (check(el, text)) { log(name + ' m1 ✓'); return; }

  log(name + ': m1 failed → m2');
  el.focus(); document.execCommand('selectAll', false, null);
  document.execCommand('delete', false, null); await sleep(60);
  document.execCommand('insertText', false, text); await sleep(220);
  fire(el); if (check(el, text)) { log(name + ' m2 ✓'); return; }

  log(name + ': m2 failed → m3');
  el.focus(); document.execCommand('selectAll', false, null);
  document.execCommand('delete', false, null); await sleep(50);
  el.innerText = text;
  const r = document.createRange(); r.selectNodeContents(el); r.collapse(false);
  const s = window.getSelection(); s.removeAllRanges(); s.addRange(r);
  fire(el); log(name + ' m3 applied');
}
function check(el, text) {
  const g = (el.innerText || el.textContent || '').trim();
  return g.startsWith(text.trim().substring(0, Math.min(30, text.length)));
}
function fire(el) {
  ['input', 'change', 'blur'].forEach(t => el.dispatchEvent(new Event(t, { bubbles: true })));
  el.dispatchEvent(new KeyboardEvent('keyup', { bubbles: true }));
}

// ── SCROLL FORM ───────────────────────────────────────────────────────────────
async function scrollForm(amount) {
  const containers = [
    document.querySelector('ytcp-uploads-dialog'),
    document.querySelector('ytcp-upload-dialog'),
    document.querySelector('[dialog-name="uploads"]'),
    document.querySelector('.ytcp-uploads-dialog'),
    document.querySelector('ytcp-animatable-dialog')
  ].filter(Boolean);
  for (const c of containers) {
    if (c.scrollHeight > c.clientHeight) {
      c.scrollTop = amount; await sleep(300);
      c.scrollTop = 0; await sleep(150);
      return;
    }
  }
  window.scrollBy(0, 400); await sleep(200); window.scrollBy(0, -400); await sleep(150);
}

// ── UNCHECK NOTIFY SUBSCRIBERS — v9: aggressive shadow DOM approach ───────────
// YouTube Studio uses web components with shadow roots.
// We must pierce shadow DOM to find the actual checkbox element.
async function uncheckNotify() {
  try {
    // First scroll down so the checkbox section is rendered
    await scrollForm(600);
    await sleep(400);

    let cb = null;

    // ── Strategy 1: Direct shadow DOM pierce ──
    // Walk all shadow roots recursively to find the checkbox
    cb = findInShadow(document.body, el => {
      if (!vis(el)) return false;
      const role  = (el.getAttribute('role') || '').toLowerCase();
      const label = (el.getAttribute('aria-label') || '').toLowerCase();
      const text  = (el.textContent || '').toLowerCase();
      const tag   = el.tagName?.toLowerCase() || '';
      const isCheckbox = role === 'checkbox' || tag.includes('checkbox') ||
                         el.type === 'checkbox';
      const isNotify   = label.includes('notify') || label.includes('subscriptions feed') ||
                         text.includes('notify subscribers') || text.includes('subscriptions feed') ||
                         text.includes('publish to subscriptions');
      return isCheckbox && isNotify;
    });

    // ── Strategy 2: tp-yt-paper-checkbox with notify text ──
    if (!cb) {
      for (const host of document.querySelectorAll('tp-yt-paper-checkbox, ytcp-checkbox-lit')) {
        const text = (host.textContent || '').toLowerCase();
        if (text.includes('notify') || text.includes('subscriptions feed')) {
          if (vis(host)) { cb = host; break; }
          // Try shadow root
          const inner = host.shadowRoot?.querySelector('[role="checkbox"], input[type="checkbox"]');
          if (inner && vis(inner)) { cb = inner; break; }
        }
      }
    }

    // ── Strategy 3: Find label text element, search nearby for checkbox ──
    if (!cb) {
      const notifyText = findNotifyTextElement();
      if (notifyText) {
        // Walk up 6 levels looking for a checkbox host
        let parent = notifyText.parentElement;
        for (let i = 0; i < 6 && parent; i++) {
          const found = parent.querySelector(
            'tp-yt-paper-checkbox, ytcp-checkbox-lit, [role="checkbox"], input[type="checkbox"]'
          );
          if (found && vis(found)) { cb = found; break; }
          // Also check shadow roots of children
          const shadow = findInShadow(parent, el => {
            const r = el.getAttribute('role') || '';
            return (r === 'checkbox' || el.type === 'checkbox') && vis(el);
          });
          if (shadow) { cb = shadow; break; }
          parent = parent.parentElement;
        }
      }
    }

    // ── Strategy 4: Brute force — all checkboxes, pick the one furthest down page ──
    // The notify checkbox is typically the last/lowest one on the Details form
    if (!cb) {
      const all = [];
      document.querySelectorAll(
        'tp-yt-paper-checkbox, ytcp-checkbox-lit, [role="checkbox"]'
      ).forEach(el => { if (vis(el)) all.push(el); });
      // Shadow DOM checkboxes
      findAllInShadow(document.body, el => {
        const r = el.getAttribute('role') || '';
        return r === 'checkbox' && vis(el);
      }).forEach(el => all.push(el));

      if (all.length > 0) {
        // Sort by vertical position — notify is near bottom of form
        all.sort((a, b) => {
          const ra = a.getBoundingClientRect(), rb = b.getBoundingClientRect();
          return rb.top - ra.top; // highest y value = furthest down
        });
        cb = all[0]; // topmost in sort = lowest on page
        log('notify: strategy 4 brute force found ' + all.length + ' checkboxes');
      }
    }

    if (!cb) {
      log('notify: all strategies failed — VA must uncheck manually');
      return;
    }

    // Read checked state — try multiple attributes
    const isChecked =
      cb.getAttribute('aria-checked') === 'true' ||
      cb.checked === true ||
      cb.classList.contains('checked') ||
      cb.hasAttribute('checked') ||
      cb.getAttribute('checked') === '' ||
      (cb.shadowRoot && cb.shadowRoot.querySelector('[aria-checked="true"]') !== null);

    log('notify checkbox found, checked=' + isChecked + ', tag=' + cb.tagName);

    if (isChecked) {
      // Try click on the element itself
      cb.click(); await sleep(350);
      // Verify unchecked
      const stillChecked = cb.getAttribute('aria-checked') === 'true' || cb.checked === true;
      if (stillChecked) {
        // Try clicking the inner paper-ripple or label
        const inner = cb.shadowRoot?.querySelector('#checkboxContainer, #checkbox, .checkbox-container');
        if (inner) { inner.click(); await sleep(300); }
      }
      log('notify unchecked ✓');
    } else {
      log('notify was already unchecked');
    }
  } catch (e) {
    log('notify error: ' + e.message + ' (non-fatal)');
  }
}

// Find element inside all shadow DOMs recursively
function findInShadow(root, predicate) {
  if (predicate(root)) return root;
  // Check shadow root
  if (root.shadowRoot) {
    const found = findInShadow(root.shadowRoot, predicate);
    if (found) return found;
  }
  for (const child of root.children || []) {
    const found = findInShadow(child, predicate);
    if (found) return found;
  }
  return null;
}

function findAllInShadow(root, predicate, results = []) {
  if (predicate(root)) results.push(root);
  if (root.shadowRoot) findAllInShadow(root.shadowRoot, predicate, results);
  for (const child of root.children || []) findAllInShadow(child, predicate, results);
  return results;
}

function findNotifyTextElement() {
  const keywords = ['publish to subscriptions feed', 'notify subscribers', 'notify your subscribers'];
  for (const el of document.querySelectorAll('span, label, div, p, yt-formatted-string')) {
    const t = (el.textContent || '').toLowerCase().trim();
    if (keywords.some(k => t.includes(k)) && el.children.length < 4) return el;
  }
  return null;
}

// ── SHOW MORE ─────────────────────────────────────────────────────────────────
async function clickShowMore() {
  if (tagsVis()) { log('tags already visible'); return; }
  await scrollForm(400);
  await sleep(300);
  let clicked = false;
  for (const b of document.querySelectorAll('ytcp-button,button,[role="button"]')) {
    if (b.textContent.trim().toLowerCase() === 'show more' && vis(b)) {
      b.click(); clicked = true; log('show more s1'); break;
    }
  }
  if (!clicked) {
    for (const b of document.querySelectorAll('ytcp-button,button,[role="button"]')) {
      if (b.textContent.trim().toLowerCase().includes('show more') && vis(b)) {
        b.click(); clicked = true; log('show more s2'); break;
      }
    }
  }
  if (!clicked) {
    for (const el of document.querySelectorAll('[aria-expanded="false"]')) {
      if (vis(el)) { el.click(); clicked = true; log('show more s3'); break; }
    }
  }
  if (!clicked) {
    const adv = document.querySelector('ytcp-video-metadata-editor-advanced');
    if (adv) { const b = adv.querySelector('ytcp-button,button'); if (b && vis(b)) { b.click(); clicked = true; log('show more s4'); } }
  }
  if (!clicked) { log('show more: no button found'); return; }
  let waited = 0;
  while (!tagsVis() && waited < 3500) { await sleep(200); waited += 200; }
  if (!tagsVis()) {
    log('show more: retrying');
    for (const b of document.querySelectorAll('ytcp-button,button,[role="button"]')) {
      if (b.textContent.trim().toLowerCase().includes('show more') && vis(b)) { b.click(); break; }
    }
    await sleep(800);
  }
}
function tagsVis() {
  return ['input[placeholder*="tag" i]', '#tags-container input', 'ytcp-chip-bar input', '#tags input']
    .some(s => { const el = document.querySelector(s); return el && vis(el); });
}

// ── TAGS ──────────────────────────────────────────────────────────────────────
async function fillTags(tagsStr) {
  const tags = tagsStr.split(',').map(t => t.trim()).filter(Boolean);
  const input = await waitFor(() => {
    return ['input[placeholder*="tag" i]', '#tags-container input', 'ytcp-chip-bar input', '#tags input', '[id*="tag"] input']
      .map(s => document.querySelector(s)).find(el => el && vis(el)) || null;
  }, 8000, 'Tags input not found.');
  const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
  for (const tag of tags) {
    input.focus(); await sleep(80);
    setter.call(input, tag);
    input.dispatchEvent(new Event('input', { bubbles: true })); await sleep(120);
    input.dispatchEvent(new KeyboardEvent('keydown', { key: ',', code: 'Comma', keyCode: 188, bubbles: true }));
    input.dispatchEvent(new KeyboardEvent('keyup',   { key: ',', code: 'Comma', keyCode: 188, bubbles: true }));
    await sleep(180);
  }
  log(tags.length + ' tags entered');
}

// ── ALTERED CONTENT → NO ──────────────────────────────────────────────────────
async function selectAlteredNo() {
  try {
    const btn = await waitFor(() => {
      for (const c of document.querySelectorAll('tp-yt-paper-radio-button,ytcp-radio-button,[role="radio"]')) {
        const t = c.textContent.trim(), a = c.getAttribute('aria-label') || '';
        if ((t === 'No' || a === 'No') && vis(c)) return c;
      }
      return null;
    }, 4000, 'Altered content radio not visible');
    if (btn.getAttribute('aria-checked') !== 'true') { btn.click(); await sleep(300); }
  } catch (e) { log('altered: ' + e.message + ' (non-fatal)'); }
}

// ── THUMBNAIL ─────────────────────────────────────────────────────────────────
async function uploadThumbnail(dataUrl) {
  try {
    const input = await waitFor(() => {
      const inputs = document.querySelectorAll('input[type="file"]');
      for (const inp of inputs) {
        const accept = inp.getAttribute('accept') || '';
        if (accept.includes('image')) return inp;
        if (inp.closest('ytcp-video-thumbnail,ytcp-thumbnails-compact-editor-desktop')) return inp;
      }
      return null;
    }, 6000, 'Thumbnail input not found');
    const res = await fetch(dataUrl);
    const blob = await res.blob();
    const ext = blob.type.includes('png') ? 'thumbnail.png' : 'thumbnail.jpg';
    const file = new File([blob], ext, { type: blob.type });
    const dt = new DataTransfer(); dt.items.add(file);
    input.files = dt.files;
    input.dispatchEvent(new Event('change', { bubbles: true }));
    await sleep(1100);
    return true;
  } catch (e) { log('thumb error: ' + e.message); return false; }
}

// ── UTILS ─────────────────────────────────────────────────────────────────────
function waitFor(fn, timeout = 8000, errMsg = 'Not found') {
  return new Promise((resolve, reject) => {
    let elapsed = 0;
    const tick = () => {
      const el = fn();
      if (el) { resolve(el); return; }
      elapsed += 200;
      if (elapsed >= timeout) { reject(new Error(errMsg)); return; }
      setTimeout(tick, 200);
    };
    tick();
  });
}
function vis(el) {
  if (!el) return false;
  try {
    const s = window.getComputedStyle(el);
    return s.display !== 'none' && s.visibility !== 'hidden' && s.opacity !== '0' && el.offsetParent !== null;
  } catch (_) { return false; }
}
function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }
function log(msg) { console.log('[YT AutoFill v10.0]', msg); }
