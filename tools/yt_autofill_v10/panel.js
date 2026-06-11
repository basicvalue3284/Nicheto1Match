// ── YT AutoFill · panel.js v10.0 ─────────────────────────────────────────────
// NEW: Copy button beside each filename in queue
// NEW: FILL button is per-row (inline), no global floating fill area
// NEW: Filename verification — reads popup before fill, shows mismatch error
// NEW: Retry state (orange) — pending button to keep or retry after error/mismatch
// NEW: Batch success no longer shows "Next × 3" steps
// NEW: Notify uncheck now uses READ_POPUP_FILENAME for context verification
// ─────────────────────────────────────────────────────────────────────────────

const $ = id => document.getElementById(id);

let isDark = false, ytTabId = null, curMode = 'single';
let sMeta = null, sThumb = null, sJsonBase = null, sThumbBase = null;
let queue = {}, curKey = null, lastFile = '', expandedKey = null;

// ── BOOT ─────────────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  chrome.storage.local.get(['ytaf_theme', 'ytaf_meta'], r => {
    applyTheme(r.ytaf_theme || 'light');
    if (r.ytaf_meta) {
      sMeta = r.ytaf_meta;
      sJsonBase = r.ytaf_meta.sourceFile.replace(/\.json$/i, '');
      applySingleUI(sMeta);
    }
  });

  chrome.tabs.query({ active: true, currentWindow: true }, tabs => {
    const t = tabs[0];
    if (t?.url?.includes('studio.youtube.com')) { ytTabId = t.id; setDot('green'); }
    else setDot('amber');
  });

  initTheme();
  initGuide();
  initNav();
  initSingle();
  initBatch();
  setInterval(pollFilename, 1500);
});

// ── THEME ─────────────────────────────────────────────────────────────────────
function initTheme() {
  $('theme-btn').addEventListener('click', () => {
    isDark = !isDark;
    const t = isDark ? 'dark' : 'light';
    applyTheme(t); chrome.storage.local.set({ ytaf_theme: t });
  });
}
function applyTheme(t) {
  isDark = t === 'dark';
  document.documentElement.setAttribute('data-theme', t);
  $('ico-moon').style.display = isDark ? 'none' : '';
  $('ico-sun').style.display  = isDark ? ''     : 'none';
}
function setDot(c) { $('logo-dot').className = 'logo-dot ' + c; }

// ── GUIDE ─────────────────────────────────────────────────────────────────────
function initGuide() {
  $('guide-toggle').addEventListener('click', () => {
    const open = $('guide-body').classList.toggle('open');
    $('guide-toggle').classList.toggle('open', open);
  });
  document.querySelectorAll('.gsec-hd').forEach(hd => {
    hd.addEventListener('click', () => {
      const body = $('gs-' + hd.dataset.sec);
      if (!body) return;
      const open = body.classList.toggle('open');
      hd.classList.toggle('open', open);
    });
  });
}

// ── MODE NAV ─────────────────────────────────────────────────────────────────
function initNav() {
  $('m-single').addEventListener('click', () => setMode('single'));
  $('m-batch').addEventListener('click',  () => setMode('batch'));
}
function setMode(m) {
  curMode = m;
  $('m-single').classList.toggle('active', m === 'single');
  $('m-batch').classList.toggle('active',  m === 'batch');
  if (m === 'batch') $('m-single').classList.add('done');
  else               $('m-single').classList.remove('done');
  $('mode-single').style.cssText = m === 'single' ? 'display:flex;flex-direction:column;gap:8px;' : 'display:none;';
  $('mode-batch').style.cssText  = m === 'batch'  ? 'display:flex;flex-direction:column;gap:8px;' : 'display:none;';
}
$('mode-single').style.cssText = 'display:flex;flex-direction:column;gap:8px;';
$('mode-batch').style.cssText  = 'display:none;';

// Fill table toggle
document.addEventListener('DOMContentLoaded', () => {
  $('ftbl-hd-s').addEventListener('click', () => {
    const open = $('ftbl-rows-s').classList.toggle('open');
    $('ftbl-hd-s').classList.toggle('open', open);
  });
});

// ── SINGLE MODE ───────────────────────────────────────────────────────────────
function initSingle() {
  $('fi-s-json').addEventListener('change', e => {
    if (e.target.files?.[0]) handleSingleJson(e.target.files[0]);
    e.target.value = '';
  });
  $('fi-s-thumb').addEventListener('change', e => {
    if (e.target.files?.[0]) handleSingleThumb(e.target.files[0]);
    e.target.value = '';
  });
  zoneDrag($('z-json'),  f => handleSingleJson(f));
  zoneDrag($('z-thumb'), f => handleSingleThumb(f));
  $('btn-fill-s').addEventListener('click', doSingleFill);
  $('btn-clr-s').addEventListener('click',  resetSingle);
  $('suc-s-next').addEventListener('click', resetSingle);
}

function handleSingleJson(file) {
  if (!file.name.toLowerCase().endsWith('.json')) { showErr('err-s', 'Must be a .json file.'); return; }
  parseJson(file, (err, data) => {
    if (err) { showErr('err-s', 'Bad JSON: ' + file.name + '\n' + err); return; }
    sMeta = { title: data.title.trim(), description: data.description.trim(), tags: data.tags.trim(), sourceFile: file.name };
    sJsonBase = file.name.replace(/\.json$/i, '');
    chrome.storage.local.set({ ytaf_meta: sMeta });
    clearErr('err-s'); hideMismatch('mismatch-s');
    applySingleUI(sMeta);
    checkSingleMatch();
  });
}

function handleSingleThumb(file) {
  if (!file.type.startsWith('image/')) { showErr('err-s', 'Must be an image.'); return; }
  sThumbBase = file.name.replace(/\.(png|jpe?g|webp|gif)$/i, '');
  toDataUrl(file, url => {
    sThumb = url;
    const z = $('z-thumb'); z.classList.add('loaded');
    $('zn-thumb').textContent = '✓ ' + file.name;
    $('zh-thumb').textContent = 'thumbnail ready';
    $('zp-thumb').textContent = 'loaded'; $('zp-thumb').className = 'zpill p-ok';
    $('zi-thumb').innerHTML = '<path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z" fill="#15803d"/>';
    $('sthumb').src = url; $('sthumb').classList.add('show');
    setFRow('pi-th', 'ps-th', 'ok', '✓', 'Will upload');
    checkSingleMatch(); clearErr('err-s');
  });
}

function applySingleUI(meta) {
  $('pv-title').textContent = meta.title;
  $('pv-desc').textContent  = meta.description.substring(0, 100) + (meta.description.length > 100 ? '…' : '');
  $('pv-tags').textContent  = meta.tags;
  $('smeta').classList.add('show');
  const z = $('z-json'); z.classList.add('loaded');
  $('zn-json').textContent = '✓ ' + meta.sourceFile;
  $('zh-json').textContent = meta.title.substring(0, 48) + (meta.title.length > 48 ? '…' : '');
  $('zp-json').textContent = 'loaded'; $('zp-json').className = 'zpill p-ok';
  $('zi-json').innerHTML = '<path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z" fill="#15803d"/>';
  $('pre-tbl').classList.add('show');
  $('btn-fill-s').classList.add('show');
  $('btn-clr-s').classList.add('show');
  setDot('green');
}

function checkSingleMatch() {
  if (!sJsonBase || !sThumbBase) { $('mbanner').className = 'mbanner'; return; }
  const ok = sJsonBase.toLowerCase() === sThumbBase.toLowerCase();
  $('mbanner').className = 'mbanner ' + (ok ? 'ok' : 'miss');
  $('mbanner').innerHTML = ok
    ? '<b>✓ Files match</b>' + sJsonBase + ' · JSON + thumbnail paired'
    : '<b>⚠ Mismatch</b>JSON: ' + sJsonBase + ' · Thumb: ' + sThumbBase;
}

// ── SINGLE FILL — verify popup filename first ─────────────────────────────────
async function doSingleFill() {
  if (!sMeta) return;
  if (sThumb && sJsonBase && sThumbBase && sJsonBase.toLowerCase() !== sThumbBase.toLowerCase()) {
    showErr('err-s', 'Fix filename mismatch between JSON and thumbnail first.'); return;
  }
  if (!ytTabId) { showErr('err-s', 'No YouTube Studio tab.\nOpen studio.youtube.com first.'); return; }

  // ── Read popup filename, check against JSON before filling ──
  hideMismatch('mismatch-s');
  try {
    const pfRes = await new Promise(resolve => chrome.tabs.sendMessage(ytTabId, { action: 'READ_POPUP_FILENAME' }, resolve));
    if (pfRes?.filename) {
      const popupBase = baseOf(pfRes.filename);
      const jsonBase  = baseOf(sJsonBase);
      if (popupBase && jsonBase && popupBase !== jsonBase) {
        showMismatch('mismatch-s', pfRes.filename, sMeta.sourceFile);
        return; // Do NOT fill
      }
    }
  } catch (_) { /* Can't read popup — proceed anyway */ }

  $('btn-fill-s').disabled = true; $('btn-fill-s').textContent = '⏳ Filling…';
  setDot('blue');
  sendFill(ytTabId, sMeta, sThumb, sJsonBase, res => {
    $('btn-fill-s').disabled = false;
    $('btn-fill-s').innerHTML = ck() + ' AUTO-FILL YOUTUBE STUDIO';
    if (!res) { showErr('err-s', 'Connection failed.\nOpen the video Details popup first.'); setDot('red'); return; }
    if (res.success) {
      clearErr('err-s'); hideMismatch('mismatch-s');
      const tok = res.thumbUploaded === true;
      $('ri-th').textContent = tok ? '✓' : '–'; $('ri-th').className = 'fico ' + (tok ? 'ok' : 'sk');
      $('rs-th').textContent = tok ? 'Uploaded ✓' : 'Not provided'; $('rs-th').className = 'fs ' + (tok ? 'ok' : 'sk');
      [$('z-json'), $('z-thumb'), $('smeta'), $('pre-tbl'), $('mbanner')].forEach(el => el.style.display = 'none');
      $('btn-fill-s').classList.remove('show'); $('btn-clr-s').classList.remove('show');
      $('suc-s').classList.add('show'); setDot('green');
    } else if (res.error && res.error.startsWith('FILENAME_MISMATCH')) {
      // content.js detected mismatch after fill started — shouldn't happen now but handle it
      const parts = res.error.split('||');
      const popup = (parts[1] || '').replace('popup:', '');
      const json  = (parts[2] || '').replace('json:', '');
      showMismatch('mismatch-s', popup, json);
      $('btn-fill-s').classList.add('show');
    } else {
      showErr('err-s', 'Fill failed: ' + (res.error || 'Unknown')); setDot('red');
    }
  });
}

function resetSingle() {
  sMeta = null; sThumb = null; sJsonBase = null; sThumbBase = null;
  chrome.storage.local.remove(['ytaf_meta']);
  const zj = $('z-json'); zj.classList.remove('loaded','err','drag');
  $('zn-json').textContent = 'Drop JSON · or click to browse';
  $('zh-json').textContent = 'videoname.json · required';
  $('zp-json').textContent = 'required'; $('zp-json').className = 'zpill p-req';
  $('zi-json').innerHTML = '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8l-6-6zm-1 7V3.5L18.5 9H13z" fill="#9ca3af"/>';
  const zt = $('z-thumb'); zt.classList.remove('loaded','err','drag');
  $('zn-thumb').textContent = 'Drop thumbnail · or click to browse';
  $('zh-thumb').textContent = 'videoname.png / .jpg · optional';
  $('zp-thumb').textContent = 'optional'; $('zp-thumb').className = 'zpill p-opt';
  $('zi-thumb').innerHTML = '<path d="M21 19V5c0-1.1-.9-2-2-2H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-1.1 2-2zM8.5 13.5l2.5 3.01L14.5 12l4.5 6H5l3.5-4.5z" fill="#9ca3af"/>';
  $('sthumb').src = ''; $('sthumb').classList.remove('show');
  [$('z-json'), $('z-thumb')].forEach(el => el.style.display = '');
  $('mbanner').className = 'mbanner';
  $('smeta').classList.remove('show'); $('pre-tbl').classList.remove('show');
  $('ftbl-rows-s').classList.remove('open'); $('ftbl-hd-s').classList.remove('open');
  $('btn-fill-s').classList.remove('show'); $('btn-clr-s').classList.remove('show');
  $('suc-s').classList.remove('show');
  clearErr('err-s'); hideMismatch('mismatch-s');
  setDot(ytTabId ? 'green' : 'amber');
}

// ── MISMATCH HELPERS ──────────────────────────────────────────────────────────
function showMismatch(id, popupFile, jsonFile) {
  const el = $(id); if (!el) return;
  el.innerHTML = `<strong>⚠ Filename mismatch — nothing was filled</strong>
Open popup: <em>${popupFile}</em>
Your JSON: <em>${jsonFile}</em>
Open the correct video popup, or load the matching JSON.`;
  el.classList.add('show');
  setDot('red');
}
function hideMismatch(id) { const el=$(id); if(el) el.classList.remove('show'); }
function baseOf(name) {
  return (name||'').replace(/\.(mp4|mov|avi|mkv|webm|json|png|jpe?g|webp|gif)$/i,'').trim().toLowerCase();
}

// ── BATCH MODE ────────────────────────────────────────────────────────────────
function initBatch() {
  $('fi-batch').addEventListener('change', e => {
    if (e.target.files?.length) handleBatchFiles(e.target.files);
    e.target.value = '';
  });
  zoneDragMulti($('z-batch'), handleBatchFiles);
  $('btn-b-clr').addEventListener('click', resetBatch);
  $('suc-b-next').addEventListener('click', () => {
    $('suc-b').classList.remove('show');
    curKey = null; lastFile = '';
    renderQueueItems();
  });
}

function handleBatchFiles(files) {
  const arr = Array.from(files);
  const jsons  = arr.filter(f => f.name.toLowerCase().endsWith('.json'));
  const images = arr.filter(f => f.type.startsWith('image/'));
  const bad = [];
  if (!jsons.length && !images.length) { showErr('err-b', 'No valid files found.'); return; }
  let jd = 0, id = 0;
  const tot = jsons.length + images.length;
  const checkDone = () => { if (jd + id >= tot) renderQueue(); };
  jsons.forEach(f => {
    parseJson(f, (err, data) => {
      if (err) { bad.push(f.name + ': ' + err); jd++; checkDone(); return; }
      if (isBatchManifest(data)) {
        importManifest(data);
        jd++; checkDone();
        return;
      }
      const base = f.name.replace(/\.json$/i, '');
      if (!queue[base]) queue[base] = { meta: null, thumbUrl: null, state: 'pending', schedule: null, number: null };
      queue[base].meta = { title: data.title.trim(), description: data.description.trim(), tags: data.tags.trim(), sourceFile: f.name };
      jd++; checkDone();
    });
  });
  images.forEach(f => {
    const base = f.name.replace(/\.(png|jpe?g|webp|gif)$/i, '');
    toDataUrl(f, url => {
      if (!queue[base]) queue[base] = { meta: null, thumbUrl: null, state: 'pending', schedule: null, number: null };
      queue[base].thumbUrl = url;
      id++; checkDone();
    });
  });
  if (!jsons.length)  { jd = 0; checkDone(); }
  if (!images.length) { id = 0; checkDone(); }
  if (bad.length) showWarn('warn-b', '⚠ ' + bad.length + ' bad JSON skipped:\n' + bad.slice(0,3).join('\n'));
}

function isBatchManifest(data) {
  return data && Array.isArray(data.items) && String(data.schema || '').startsWith('yt-upload-command-center/');
}

function importManifest(data) {
  data.items.forEach(item => {
    const base = item.base || (item.video_file || item.metadata_file || '').replace(/\.(mp4|mov|avi|mkv|webm|json)$/i, '');
    if (!base) return;
    if (!queue[base]) queue[base] = { meta: null, thumbUrl: null, state: 'pending', schedule: null, number: null };
    queue[base].meta = {
      title: String(item.title || '').trim(),
      description: String(item.description || '').trim(),
      tags: Array.isArray(item.tags) ? item.tags.join(', ') : String(item.tags || '').trim(),
      sourceFile: item.metadata_file || `${base}.json`
    };
    queue[base].schedule = {
      date: String(item.schedule_date || '').trim(),
      time: String(item.schedule_time || '').trim(),
      timezone: String(item.timezone || data.timezone || '').trim()
    };
    queue[base].number = item.number || null;
  });
  showWarn('warn-b', `Loaded manifest: ${data.items.length} scheduled item(s). Drop thumbnails too if needed.`);
}

function renderQueue() {
  const keys = Object.keys(queue); if (!keys.length) return;
  const jc = keys.filter(k => queue[k].meta).length;
  const tc = keys.filter(k => queue[k].thumbUrl).length;
  const dc = doneCount();
  $('z-batch').classList.add('loaded');
  $('zn-batch').textContent = '✓ ' + keys.length + ' items · ' + jc + ' JSON · ' + tc + ' thumbs';
  $('zh-batch').textContent = 'click to add more files';
  $('zp-batch').textContent = 'loaded'; $('zp-batch').className = 'zpill p-ok';
  $('qwrap').classList.add('show');
  $('qcount').textContent = keys.length + ' video'+(keys.length>1?'s':'')+(dc?' · '+dc+' done':'');
  renderQueueItems();
  clearErr('err-b');
}

function renderQueueItems() {
  const list = $('qlist');
  list.innerHTML = '';
  Object.entries(queue).forEach(([key, item], i) => {
    const isActive = key === curKey;
    const st = item.state;
    let cc, badge, bc, wrapCls;
    if (st==='done')     { cc='qc-done';    badge='done ✓'; bc='qb-done';   wrapCls='q-done'; }
    else if (st==='aside'){cc='qc-aside';   badge='aside';  bc='qb-aside';  wrapCls=''; }
    else if (st==='err') { cc='qc-err';     badge='error';  bc='qb-err';    wrapCls='q-err'; }
    else if (st==='retry'){cc='qc-retry';   badge='retry';  bc='qb-aside';  wrapCls='q-retry'; }
    else if (isActive)   { cc='qc-active';  badge='▶ fill'; bc='qb-ready';  wrapCls='q-active'; }
    else if (!item.meta) { cc='qc-nojson';  badge='no json';bc='qb-nojson'; wrapCls=''; }
    else                 { cc='qc-pending'; badge='ready';  bc='qb-ready';  wrapCls=''; }
    const ci = st==='done'?'✓':st==='err'?'!':st==='retry'?'↺':String(item.number || i+1);

    // Action buttons - all in one row
    let acts = '';
    if (st !== 'done') {
      if (st === 'err' || st === 'retry') {
        acts += `<button class="qbtn rb" data-k="${key}" data-a="retry">Retry</button>`;
        acts += `<button class="qbtn" data-k="${key}" data-a="pending">Pending</button>`;
      } else if (st === 'aside') {
        acts += `<button class="qbtn" data-k="${key}" data-a="pending">↺</button>`;
      } else {
        acts += `<button class="qbtn" data-k="${key}" data-a="aside" title="Set aside">◑</button>`;
      }
    }
    // Copy button — always visible
    acts += `<button class="copy-btn" data-k="${key}" data-a="copy" title="Copy filename">⎘</button>`;

    // Inline FILL button — only on active item with JSON
    const fillBtn = (isActive && item.meta && st !== 'done')
      ? `<button class="qbtn fb" data-k="${key}" data-a="fill">FILL</button>`
      : '';

    const wrap = document.createElement('div');
    wrap.className = 'qitem-wrap ' + wrapCls;
    wrap.dataset.key = key;
    wrap.innerHTML = `
      <div class="qitem">
        <div class="qcircle ${cc}">${ci}</div>
        ${item.thumbUrl ? `<img class="qthumb show" src="${item.thumbUrl}" alt=""/>` : ''}
        <div class="qname" title="${key}">${key}</div>
        <span class="qbadge ${bc}">${badge}</span>
        <div class="qacts">${fillBtn}${acts}</div>
      </div>
      ${expandedKey===key ? buildExpand(key, item) : ''}
    `;
    list.appendChild(wrap);
  });

  attachQueueEvents(list);
}

function buildExpand(key, item) {
  const hasJson  = !!item.meta;
  const hasThumb = !!item.thumbUrl;
  return `
    <div class="qexpand open">
      <div class="qe-title">Files for: ${key}</div>
      <div class="qe-pair">
        <div class="qe-pair-label">JSON + Thumbnail — as a pair</div>
        <label class="mz-lbl ${hasJson?'loaded':''}" data-k="${key}" data-t="json">
          <input type="file" accept=".json" data-k="${key}" data-t="json"/>
          <div class="mz-ico">
            <svg width="11" height="11" viewBox="0 0 24 24">
              <path d="${hasJson?'M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z':'M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8l-6-6zm-1 7V3.5L18.5 9H13z'}" fill="${hasJson?'#15803d':'#9ca3af'}"/>
            </svg>
          </div>
          <span class="mz-name">${hasJson?'✓ '+item.meta.sourceFile:'Drop JSON · or click'}</span>
          <span class="mz-pill ${hasJson?'p-ok':'p-req'}">${hasJson?'ok':'required'}</span>
        </label>
        <label class="mz-lbl ${hasThumb?'loaded':''}" data-k="${key}" data-t="thumb">
          <input type="file" accept="image/*" data-k="${key}" data-t="thumb"/>
          <div class="mz-ico">
            ${hasThumb
              ? `<img src="${item.thumbUrl}" style="width:18px;height:12px;border-radius:2px;object-fit:cover;" alt=""/>`
              : `<svg width="11" height="11" viewBox="0 0 24 24"><path d="M21 19V5c0-1.1-.9-2-2-2H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-1.1 2-2zM8.5 13.5l2.5 3.01L14.5 12l4.5 6H5l3.5-4.5z" fill="#9ca3af"/></svg>`}
          </div>
          <span class="mz-name">${hasThumb?'✓ Thumbnail loaded':'Drop thumbnail · or click'}</span>
          <span class="mz-pill ${hasThumb?'p-ok':'p-opt'}">${hasThumb?'ok':'optional'}</span>
        </label>
        ${hasJson
          ? `<button class="qe-fill" data-k="${key}" data-a="qefill">
               <svg width="12" height="12" viewBox="0 0 24 24" fill="white"><path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/></svg>
               FILL THIS VIDEO
             </button>`
          : '<div style="font-size:10px;color:var(--mu);text-align:center;padding:4px 0">Add JSON file to enable fill</div>'}
        ${scheduleHtml(item)}
      </div>
    </div>`;
}

function scheduleHtml(item) {
  if (!item.schedule?.date || !item.schedule?.time) return '';
  return `
    <div class="schedule-card">
      <div class="schedule-main">
        <strong>Schedule</strong>
        ${item.schedule.date}<br>${item.schedule.time}
      </div>
      <div class="schedule-actions">
        <button data-a="copy-date" data-copy="${escAttr(item.schedule.date)}">Date</button>
        <button data-a="copy-time" data-copy="${escAttr(item.schedule.time)}">Time</button>
      </div>
    </div>`;
}

function attachQueueEvents(list) {
  // Row click — select item, toggle expand
  list.querySelectorAll('.qitem-wrap').forEach(wrap => {
    wrap.addEventListener('click', e => {
      if (e.target.closest('button, input, .mz-lbl')) return;
      const key = wrap.dataset.key;
      const item = queue[key];
      if (!item || item.state === 'done') return;
      expandedKey = expandedKey === key ? null : key;
      curKey = key;
      hideMismatch('mismatch-b');
      renderQueueItems();
    });
  });

  // Button actions
  list.querySelectorAll('[data-a]').forEach(btn => {
    btn.addEventListener('click', e => {
      e.stopPropagation();
      const k = btn.dataset.k, a = btn.dataset.a;
      if (a === 'fill')    { curKey = k; doBatchFill(); }
      else if (a === 'qefill') { curKey = k; doBatchFill(); }
      else if (a === 'aside')  { queue[k].state = 'aside';   renderQueueItems(); }
      else if (a === 'pending'){ queue[k].state = 'pending'; hideMismatch('mismatch-b'); renderQueueItems(); }
      else if (a === 'retry')  { queue[k].state = 'pending'; curKey = k; hideMismatch('mismatch-b'); renderQueueItems(); }
      else if (a === 'copy') {
        navigator.clipboard.writeText(k).then(() => {
          btn.textContent = '✓'; btn.classList.add('copied');
          setTimeout(() => { btn.textContent = '⎘'; btn.classList.remove('copied'); }, 1500);
        }).catch(() => {
          // Fallback
          const ta = document.createElement('textarea');
          ta.value = k; document.body.appendChild(ta); ta.select();
          document.execCommand('copy'); document.body.removeChild(ta);
          btn.textContent = '✓'; btn.classList.add('copied');
          setTimeout(() => { btn.textContent = '⎘'; btn.classList.remove('copied'); }, 1500);
        });
      } else if (a === 'copy-date' || a === 'copy-time') {
        copyButtonText(btn.dataset.copy || '', btn);
      }
    });
  });

  // File inputs in expanded zones
  list.querySelectorAll('.mz-lbl input[type="file"]').forEach(inp => {
    inp.addEventListener('change', e => {
      e.stopPropagation();
      const f = e.target.files?.[0];
      if (f) handleItemFile(e.target.dataset.k, e.target.dataset.t, f);
      e.target.value = '';
    });
  });

  // Drag on mini zones
  list.querySelectorAll('.mz-lbl').forEach(lbl => {
    lbl.addEventListener('dragenter', e => { e.preventDefault(); lbl.classList.add('drag'); });
    lbl.addEventListener('dragover',  e => { e.preventDefault(); e.stopPropagation(); e.dataTransfer.dropEffect = 'copy'; });
    lbl.addEventListener('dragleave', e => { if (!e.relatedTarget || !lbl.contains(e.relatedTarget)) lbl.classList.remove('drag'); });
    lbl.addEventListener('drop', e => {
      e.preventDefault(); e.stopPropagation(); lbl.classList.remove('drag');
      const f = e.dataTransfer.files?.[0];
      if (f) handleItemFile(lbl.dataset.k, lbl.dataset.t, f);
    });
  });
}

function handleItemFile(key, type, file) {
  if (type === 'json') {
    if (!file.name.toLowerCase().endsWith('.json')) { showWarn('warn-b', 'Must be a .json file.'); return; }
    parseJson(file, (err, data) => {
      if (err) { showWarn('warn-b', 'Bad JSON: ' + err); return; }
      if (isBatchManifest(data)) { importManifest(data); renderQueue(); return; }
      if (!queue[key]) queue[key] = { meta: null, thumbUrl: null, state: 'pending', schedule: null, number: null };
      queue[key].meta = { title: data.title.trim(), description: data.description.trim(), tags: data.tags.trim(), sourceFile: file.name };
      clearWarn('warn-b'); renderQueue();
    });
  } else {
    if (!file.type.startsWith('image/')) { showWarn('warn-b', 'Must be an image.'); return; }
    toDataUrl(file, url => {
      if (!queue[key]) queue[key] = { meta: null, thumbUrl: null, state: 'pending', schedule: null, number: null };
      queue[key].thumbUrl = url; renderQueueItems();
    });
  }
}

// ── BATCH FILL — verify popup filename first ──────────────────────────────────
async function doBatchFill() {
  if (!curKey || !queue[curKey]?.meta) {
    showErr('err-b', 'No metadata. Expand the item and add a JSON file.'); return;
  }
  if (!ytTabId) { showErr('err-b', 'No YouTube Studio tab.'); return; }

  const item = queue[curKey], key = curKey;
  hideMismatch('mismatch-b');

  // ── Filename verification ──
  try {
    const pfRes = await new Promise(resolve => chrome.tabs.sendMessage(ytTabId, { action: 'READ_POPUP_FILENAME' }, resolve));
    if (pfRes?.filename) {
      const popupBase = baseOf(pfRes.filename);
      const jsonBase  = baseOf(key); // queue key IS the base filename
      if (popupBase && jsonBase && popupBase !== jsonBase) {
        showMismatch('mismatch-b', pfRes.filename, key);
        queue[key].state = 'retry'; // mark as retry
        renderQueueItems();
        return;
      }
    }
  } catch (_) { /* Can't read popup — proceed */ }

  // Update circle to active/filling
  const fillBtns = $('qlist').querySelectorAll(`[data-k="${key}"][data-a="fill"], [data-k="${key}"][data-a="qefill"]`);
  fillBtns.forEach(b => { b.disabled = true; b.textContent = '⏳'; });
  setDot('blue');

  sendFill(ytTabId, item.meta, item.thumbUrl || null, key, res => {
    fillBtns.forEach(b => { b.disabled = false; b.textContent = b.dataset.a === 'fill' ? 'FILL' : 'FILL THIS VIDEO'; });
    if (!res) {
      showErr('err-b', 'Connection failed. Open video Details popup first.');
      queue[key].state = 'retry'; setDot('red'); renderQueueItems(); return;
    }
    if (res.success) {
      queue[key].state = 'done'; expandedKey = null;
      clearErr('err-b'); hideMismatch('mismatch-b');
      const d = doneCount(), t = totalCount();
      $('b-suc-ttl').textContent = key.substring(0,28) + ' ✓';
      $('b-suc-sub').textContent = d + ' of ' + t + ' complete';
      $('suc-b').classList.add('show');
      setDot('green'); renderQueueItems();
    } else if (res.error?.startsWith('FILENAME_MISMATCH')) {
      const parts = res.error.split('||');
      showMismatch('mismatch-b', (parts[1]||'').replace('popup:',''), (parts[2]||'').replace('json:',''));
      queue[key].state = 'retry'; setDot('red'); renderQueueItems();
    } else {
      queue[key].state = 'retry';
      showErr('err-b', 'Fill failed: ' + (res.error||'Unknown'));
      setDot('red'); renderQueueItems();
    }
  });
}

function resetBatch() {
  queue = {}; curKey = null; lastFile = ''; expandedKey = null;
  const z = $('z-batch'); z.classList.remove('loaded','drag');
  $('zn-batch').textContent = 'Drop manifest, JSON + PNG files at once';
  $('zh-batch').textContent = 'manifest adds schedule · thumbnails still load by filename';
  $('zp-batch').textContent = 'load files'; $('zp-batch').className = 'zpill p-req';
  $('qwrap').classList.remove('show'); $('qlist').innerHTML = '';
  $('suc-b').classList.remove('show');
  clearErr('err-b'); clearWarn('warn-b'); hideMismatch('mismatch-b');
  setDot(ytTabId ? 'green' : 'amber');
}

// ── AUTO-DETECT ───────────────────────────────────────────────────────────────
async function pollFilename() {
  if (curMode !== 'batch' || !ytTabId || !Object.keys(queue).length) return;
  try {
    const res = await chrome.scripting.executeScript({
      target: { tabId: ytTabId },
      func: () => {
        const sels = ['.ytcp-uploads-dialog .file-name','[class*="file-name"]','.ytcp-video-row__file-name'];
        for (const s of sels) { const el=document.querySelector(s); if (el?.textContent?.trim()) return el.textContent.trim(); }
        for (const el of document.querySelectorAll('span,div,p,td')) {
          const t=(el.textContent||'').trim();
          if (t.match(/\.(mp4|mov|avi|mkv|webm)$/i)&&el.children.length===0&&t.length<200) return t;
        }
        return null;
      }
    });
    const fn = res?.[0]?.result?.trim();
    if (!fn || fn === lastFile) return;
    lastFile = fn;
    autoMatch(fn.replace(/\.(mp4|mov|avi|mkv|webm)$/i,''));
  } catch (_) {}
}

function autoMatch(base) {
  const lc = base.toLowerCase();
  const key = queue[base] ? base : Object.keys(queue).find(k => k.toLowerCase() === lc) || null;
  if (!key || queue[key].state === 'done') return;
  curKey = key; expandedKey = null;
  hideMismatch('mismatch-b');
  renderQueueItems();
  setDot('blue');
}

// ── SEND FILL ─────────────────────────────────────────────────────────────────
function sendFill(tabId, meta, thumbUrl, expectedBase, cb) {
  const payload = { action: 'FILL_METADATA', meta, thumbDataUrl: thumbUrl || null, expectedBase: expectedBase || null };
  chrome.tabs.sendMessage(tabId, payload, res => {
    if (chrome.runtime.lastError) {
      chrome.scripting.executeScript({ target: { tabId }, files: ['content.js'] }, () => {
        setTimeout(() => chrome.tabs.sendMessage(tabId, payload, cb), 900);
      });
      return;
    }
    cb(res);
  });
}

// ── DRAG HELPERS ──────────────────────────────────────────────────────────────
function zoneDrag(lbl, cb) {
  lbl.addEventListener('dragenter', e => { e.preventDefault(); lbl.classList.add('drag'); });
  lbl.addEventListener('dragover',  e => { e.preventDefault(); e.dataTransfer.dropEffect = 'copy'; });
  lbl.addEventListener('dragleave', e => { if (!e.relatedTarget||!lbl.contains(e.relatedTarget)) lbl.classList.remove('drag'); });
  lbl.addEventListener('drop', e => {
    e.preventDefault(); e.stopPropagation(); lbl.classList.remove('drag');
    const files = e.dataTransfer.files; if (files?.length) cb(files[0]);
  });
}
function zoneDragMulti(lbl, cb) {
  lbl.addEventListener('dragenter', e => { e.preventDefault(); lbl.classList.add('drag'); });
  lbl.addEventListener('dragover',  e => { e.preventDefault(); e.dataTransfer.dropEffect = 'copy'; });
  lbl.addEventListener('dragleave', e => { if (!e.relatedTarget||!lbl.contains(e.relatedTarget)) lbl.classList.remove('drag'); });
  lbl.addEventListener('drop', e => {
    e.preventDefault(); e.stopPropagation(); lbl.classList.remove('drag');
    if (e.dataTransfer.files?.length) cb(e.dataTransfer.files);
  });
}

// ── FILE + UI HELPERS ─────────────────────────────────────────────────────────
function parseJson(file, cb) {
  const r = new FileReader();
  r.onload = e => {
    try {
      const d = JSON.parse(e.target.result);
      if (isBatchManifest(d)) { cb(null, d); return; }
      const miss = ['title','description','tags'].filter(k => !d[k]);
      if (miss.length) { cb('Missing: '+miss.join(', '), null); return; }
      cb(null, d);
    } catch (err) { cb(err.message, null); }
  };
  r.onerror = () => cb('Could not read file', null);
  r.readAsText(file);
}
function toDataUrl(file, cb) { const r=new FileReader(); r.onload=e=>cb(e.target.result); r.readAsDataURL(file); }
function copyButtonText(text, btn) {
  navigator.clipboard.writeText(text).then(() => {
    const old = btn.textContent;
    btn.textContent = '✓';
    setTimeout(() => { btn.textContent = old; }, 1200);
  });
}
function escAttr(value) {
  return String(value || '').replace(/&/g,'&amp;').replace(/"/g,'&quot;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}
function showErr(id, msg)  { $(id).textContent=msg; $(id).classList.add('show'); }
function clearErr(id)      { $(id).classList.remove('show'); }
function showWarn(id, msg) { $(id).textContent=msg; $(id).classList.add('show'); }
function clearWarn(id)     { $(id).classList.remove('show'); }
function setFRow(icoId,stId,type,icon,text){ const ic=$(icoId),st=$(stId); if(!ic||!st)return; ic.textContent=icon; ic.className='fico '+type; st.textContent=text; st.className='fs '+type; }
function doneCount()  { return Object.values(queue).filter(v=>v.state==='done').length; }
function totalCount() { return Object.keys(queue).length; }
function ck() { return '<svg width="14" height="14" viewBox="0 0 24 24" fill="white"><path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/></svg>'; }
