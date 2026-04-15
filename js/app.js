const WORKER = 'https://kira-discord-proxy.ghoullkira.workers.dev';

const API = {
  token: null,
  h() {
    const h = { 'Content-Type': 'application/json' };
    if (this.token) h['X-Session-Token'] = this.token;
    return h;
  },
  async get(path) {
    return (await fetch(WORKER + path, { headers: this.h() })).json();
  },
  async post(path, data) {
    return (await fetch(WORKER + path, { method: 'POST', headers: this.h(), body: JSON.stringify(data) })).json();
  },
  async patch(path, data) {
    return (await fetch(WORKER + path, { method: 'PATCH', headers: this.h(), body: JSON.stringify(data) })).json();
  }
};

let cfg = {};
let isOwner = false;
let vaultItems = [];
let vaultFilter = 'all';
let vaultType = 'link';

document.addEventListener('DOMContentLoaded', async () => {
  setupNav();
  setupVaultEvents();
  setupShortEvents();
  setupSettingsEvents();

  const savedToken = sessionStorage.getItem('kira_token');
  const savedCfg   = sessionStorage.getItem('kira_cfg');

  if (savedToken && savedCfg) {
    try {
      API.token = savedToken;
      cfg = JSON.parse(savedCfg);
      await enterOwner();
      return;
    } catch(e) {}
  }

  await loadPublic();
});

async function loadPublic() {
  setStatus('connecting');
  try {
    const res = await API.get('/public');
    if (!res.ok) { setStatus('error'); return; }
    applyProfile(res.profile);
    applyBg(res.profile.bg);
    vaultItems = res.items || [];
    renderVault();
    updateStats();
    setStatus('connected');
  } catch(e) {
    setStatus('error');
  }
}

function setupNav() {
  document.querySelectorAll('.nav-links button[data-page]').forEach(b =>
    b.addEventListener('click', function() { goTo(this.dataset.page); })
  );
  document.querySelectorAll('[data-goto]').forEach(b =>
    b.addEventListener('click', function() { goTo(this.dataset.goto); })
  );
  const ham = document.getElementById('nav-hamburger');
  const nl  = document.querySelector('.nav-links');
  if (ham && nl) {
    ham.addEventListener('click', e => { e.stopPropagation(); nl.classList.toggle('open'); });
    document.addEventListener('click', () => nl.classList.remove('open'));
  }
  document.getElementById('nav-logo')?.addEventListener('click', () => goTo('home'));
  document.getElementById('btn-logout')?.addEventListener('click', doLogout);
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') { closeModal('modal-vault'); closeModal('modal-short'); }
  });
}

function goTo(page) {
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.nav-links button[data-page]').forEach(b =>
    b.classList.toggle('active', b.dataset.page === page)
  );
  document.getElementById('page-' + page)?.classList.add('active');
  document.querySelector('.nav-links')?.classList.remove('open');
}

async function enterOwner() {
  isOwner = true;
  document.querySelectorAll('.owner-only').forEach(el => el.style.display = '');
  setStatus('connecting');
  try {
    const res = await API.get('/data');
    if (!res.ok) { setStatus('error'); return; }
    cfg = res.config || cfg;
    vaultItems = res.items || [];
    applyProfile({ name: cfg.profileName, tagline: cfg.profileTagline, bg: cfg.bg });
    applyBg(cfg.bg);
    populateSettings();
    renderVault();
    updateStats();
    setStatus('connected');
  } catch(e) { setStatus('error'); }
}

function doLogout() {
  API.token = null; isOwner = false; cfg = {}; vaultItems = [];
  sessionStorage.removeItem('kira_token');
  sessionStorage.removeItem('kira_cfg');
  location.reload();
}

function applyProfile(p) {
  if (!p) return;
  const name    = p.name    || 'Kira';
  const tagline = p.tagline || 'Short-form content, ideas, and a private vault.';
  const h1 = document.getElementById('hero-title');
  if (h1) h1.innerHTML = name + '<em>creates.</em>';
  const tg = document.getElementById('hero-tagline');
  if (tg) tg.textContent = tagline;
}

async function applyBg(bgChannelId) {
  if (!bgChannelId) return;
  try {
    const r = await fetch(`${WORKER}/channel/${bgChannelId}?limit=3`, { headers: API.h() });
    const d = await r.json();
    if (!d.ok || !d.messages?.length) return;
    const url = d.messages[0].content?.trim();
    if (url?.startsWith('http')) {
      const el = document.querySelector('.bg-img');
      if (el) el.style.backgroundImage = `url(${url})`;
    }
  } catch(e) {}
}

function setupSettingsEvents() {
  document.getElementById('btn-save-config')?.addEventListener('click', saveConfig);
  document.getElementById('btn-save-profile')?.addEventListener('click', saveProfile);
  document.getElementById('btn-test-connection')?.addEventListener('click', testConnection);
}

function populateSettings() {
  const map = {
    'cfg-ch-links': 'links', 'cfg-ch-notes': 'notes', 'cfg-ch-files': 'files',
    'cfg-ch-ideas': 'ideas', 'cfg-ch-code': 'code',   'cfg-ch-bg': 'bg',
    'cfg-ch-socials': 'socials', 'cfg-ch-cv': 'cv'
  };
  Object.entries(map).forEach(([id, key]) => {
    const el = document.getElementById(id);
    if (el && cfg[key]) el.value = cfg[key];
  });
  const cn = document.getElementById('cfg-name');    if (cn) cn.value = cfg.profileName    || '';
  const ct = document.getElementById('cfg-tagline'); if (ct) ct.value = cfg.profileTagline || '';
}

async function saveConfig() {
  if (!isOwner) return;
  const map = {
    'cfg-ch-links': 'links', 'cfg-ch-notes': 'notes', 'cfg-ch-files': 'files',
    'cfg-ch-ideas': 'ideas', 'cfg-ch-code': 'code',   'cfg-ch-bg': 'bg',
    'cfg-ch-socials': 'socials', 'cfg-ch-cv': 'cv'
  };
  const el = document.getElementById('connection-result');
  showResult(el, 'Saving…', '');
  try {
    for (const [id, key] of Object.entries(map)) {
      const f = document.getElementById(id);
      if (f?.value.trim()) { cfg[key] = f.value.trim(); await API.post('/config', { line: key + '=' + f.value.trim() }); }
    }
    sessionStorage.setItem('kira_cfg', JSON.stringify(cfg));
    showResult(el, '✅ Saved.', 'ok');
  } catch(e) { showResult(el, '❌ ' + e.message, 'err'); }
}

async function saveProfile() {
  if (!isOwner) return;
  const name   = document.getElementById('cfg-name')?.value.trim()    || '';
  const tagline= document.getElementById('cfg-tagline')?.value.trim() || '';
  const bgUrl  = document.getElementById('cfg-bg-url')?.value.trim()  || '';
  const el = document.getElementById('profile-result');
  showResult(el, 'Saving…', '');
  try {
    if (name)    { cfg.profileName    = name;    await API.post('/config', { line: 'profileName=' + name }); }
    if (tagline) { cfg.profileTagline = tagline; await API.post('/config', { line: 'profileTagline=' + tagline }); }
    if (bgUrl)   { await API.post('/bg', { url: bgUrl }); }
    applyProfile({ name: cfg.profileName, tagline: cfg.profileTagline });
    if (bgUrl) applyBg(cfg.bg);
    sessionStorage.setItem('kira_cfg', JSON.stringify(cfg));
    showResult(el, '✅ Saved.', 'ok');
  } catch(e) { showResult(el, '❌ ' + e.message, 'err'); }
}

async function testConnection() {
  const el = document.getElementById('connection-result');
  showResult(el, 'Testing…', '');
  try {
    const r = await API.get('/public');
    showResult(el, r.ok ? '✅ Connected.' : '❌ Worker error.', r.ok ? 'ok' : 'err');
    setStatus(r.ok ? 'connected' : 'error');
  } catch(e) { showResult(el, '❌ ' + e.message, 'err'); setStatus('error'); }
}

function setupVaultEvents() {
  document.querySelectorAll('.vault-cat').forEach(c =>
    c.addEventListener('click', function() {
      document.querySelectorAll('.vault-cat').forEach(x => x.classList.remove('active'));
      this.classList.add('active');
      vaultFilter = this.dataset.vaultFilter || 'all';
      renderVault();
    })
  );
  document.getElementById('vault-search-input')?.addEventListener('input', renderVault);
  document.getElementById('btn-add-vault')?.addEventListener('click', () => openVaultModal());
  document.querySelectorAll('.type-opt').forEach(b =>
    b.addEventListener('click', function() {
      document.querySelectorAll('.type-opt').forEach(x => x.classList.remove('active'));
      this.classList.add('active');
      vaultType = this.dataset.type;
      updateVaultFields(vaultType);
    })
  );
  document.getElementById('btn-confirm-vault')?.addEventListener('click', addVaultItem);
  document.querySelector('[data-close="modal-vault"]')?.addEventListener('click', () => closeModal('modal-vault'));
  document.getElementById('modal-vault')?.addEventListener('click', function(e) { if (e.target === this) closeModal('modal-vault'); });
  const dz = document.getElementById('vault-file-drop');
  const fi = document.getElementById('vault-file-input');
  if (dz && fi) {
    dz.addEventListener('click', () => fi.click());
    fi.addEventListener('change', function() {
      const lbl = document.getElementById('vault-file-label');
      if (lbl && this.files[0]) lbl.textContent = this.files[0].name;
    });
  }
}

function openVaultModal(type) {
  vaultType = type || 'link';
  document.querySelectorAll('.type-opt').forEach(b => b.classList.toggle('active', b.dataset.type === vaultType));
  updateVaultFields(vaultType);
  ['vault-title','vault-url','vault-content','vault-tags','vault-lang','vault-file-url'].forEach(id => {
    const el = document.getElementById(id); if (el) el.value = '';
  });
  const lbl = document.getElementById('vault-file-label'); if (lbl) lbl.textContent = 'Drag & drop or click to browse';
  const pub = document.getElementById('vault-public');    if (pub) pub.checked = true;
  const sav = document.getElementById('vault-saving');   if (sav) sav.style.display = 'none';
  openModal('modal-vault');
}

function updateVaultFields(type) {
  const ug = document.getElementById('vault-url-group');  if (ug) ug.style.display  = (type==='note'||type==='idea') ? 'none' : '';
  const fg = document.getElementById('vault-file-group'); if (fg) fg.style.display  = type==='file' ? '' : 'none';
  const lg = document.getElementById('vault-lang-group'); if (lg) lg.style.display  = type==='code' ? '' : 'none';
  const cl = document.getElementById('vault-content-label'); if (cl) cl.textContent = type==='code' ? 'Code' : 'Content / Notes';
}

async function addVaultItem() {
  if (!isOwner) return;
  const titulo  = document.getElementById('vault-title')?.value.trim()    || '';
  const url     = document.getElementById('vault-url')?.value.trim()      || '';
  const content = document.getElementById('vault-content')?.value.trim()  || '';
  const tags    = document.getElementById('vault-tags')?.value.trim()     || '';
  const lang    = document.getElementById('vault-lang')?.value.trim()     || '';
  const fileUrl = document.getElementById('vault-file-url')?.value.trim() || '';
  const isPublic= document.getElementById('vault-public')?.checked ?? true;
  if (!titulo) { toast('Title is required.'); return; }
  const chMap = { link: cfg.links, note: cfg.notes, file: cfg.files, idea: cfg.ideas, code: cfg.code };
  const chId  = chMap[vaultType];
  if (!chId) { toast('Channel not set for ' + vaultType + '. Go to Setup.'); return; }
  const sav = document.getElementById('vault-saving'); if (sav) sav.style.display = 'block';
  const effUrl = url || fileUrl;
  let msg = titulo;
  if (effUrl)  msg += '\n' + effUrl;
  if (lang)    msg += '\nLang: ' + lang;
  if (content) msg += '\n' + content;
  if (tags)    msg += '\nTags: ' + tags;
  if (!isPublic) msg += '\nPublic: false';
  try {
    const r = await API.post('/channel/' + chId + '/message', { content: msg });
    if (r.ok) {
      vaultItems.push({ id: r.id, channelId: chId, type: vaultType, titulo, url: effUrl, content, tags, isPublic });
      renderVault(); updateStats(); closeModal('modal-vault'); toast('✦ Added.');
    } else { toast('Error: ' + (r.error || 'failed')); }
  } catch(e) { toast('Error: ' + e.message); }
  finally { if (sav) sav.style.display = 'none'; }
}

function renderVault() {
  const c = document.getElementById('vault-cards');
  if (!c) return;
  const q = (document.getElementById('vault-search-input')?.value || '').toLowerCase();
  const items = vaultItems.filter(i => {
    if (vaultFilter !== 'all' && i.type !== vaultFilter) return false;
    if (q && !(i.titulo + i.content + i.tags + i.url).toLowerCase().includes(q)) return false;
    return true;
  });
  if (!items.length) { c.innerHTML = '<div class="vault-empty">No scrolls found.</div>'; renderTagSidebar(); return; }
  const ic = { link:'⊞', note:'≡', file:'◫', idea:'◇', code:'</>' };
  c.innerHTML = items.map(i => `
    <div class="vault-item" data-type="${i.type}">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:.5rem">
        <span class="vault-item-type">${ic[i.type]||'▦'} ${i.type}</span>
        ${!i.isPublic ? '<span style="font-size:.6rem;color:var(--text-muted)">🔒</span>' : ''}
        ${isOwner ? `<button class="vault-del-btn" data-id="${i.id}" data-ch="${i.channelId||''}" style="background:none;border:none;color:var(--text-muted);cursor:pointer;font-size:.7rem;padding:.1rem .3rem;transition:color .2s" onmouseover="this.style.color='#cc6644'" onmouseout="this.style.color='var(--text-muted)'">✕</button>` : ''}
      </div>
      <div class="vault-item-title">${esc(i.titulo)}</div>
      ${i.url     ? `<div class="vault-item-url"><a href="${esc(i.url)}" target="_blank" rel="noopener" style="color:var(--gold-dark);text-decoration:none">${esc(i.url)}</a></div>` : ''}
      ${i.content ? `<div class="vault-item-preview">${esc(i.content)}</div>` : ''}
      ${i.tags    ? `<div class="vault-item-footer"><div style="display:flex;gap:.3rem;flex-wrap:wrap">${i.tags.split(',').map(t=>`<span class="vault-tag">${esc(t.trim())}</span>`).join('')}</div></div>` : ''}
    </div>`).join('');
  c.querySelectorAll('.vault-del-btn').forEach(btn =>
    btn.addEventListener('click', async function(e) {
      e.stopPropagation();
      if (!confirm('Delete this entry?')) return;
      const id = this.dataset.id, ch = this.dataset.ch;
      try {
        await API.post('/channel/' + ch + '/delete/' + id, {});
        vaultItems = vaultItems.filter(x => x.id !== id);
        renderVault(); updateStats(); toast('Deleted.');
      } catch(err) { toast('Delete failed.'); }
    })
  );
  renderTagSidebar();
}

function renderTagSidebar() {
  const sb = document.getElementById('tag-sidebar');
  if (!sb) return;
  const tags = new Set();
  vaultItems.forEach(i => { if (i.tags) i.tags.split(',').forEach(t => tags.add(t.trim())); });
  sb.innerHTML = [...tags].map(t =>
    `<div class="vault-cat vault-tag-item" data-tag="${esc(t)}"># ${esc(t)}</div>`
  ).join('');
  sb.querySelectorAll('.vault-tag-item').forEach(el =>
    el.addEventListener('click', function() {
      const inp = document.getElementById('vault-search-input');
      if (inp) { inp.value = this.dataset.tag; renderVault(); }
    })
  );
}

function setupShortEvents() {
  document.getElementById('btn-add-short')?.addEventListener('click', openShortModal);
  document.getElementById('btn-confirm-short')?.addEventListener('click', addShort);
  document.querySelector('[data-close="modal-short"]')?.addEventListener('click', () => closeModal('modal-short'));
  document.getElementById('modal-short')?.addEventListener('click', function(e) { if (e.target === this) closeModal('modal-short'); });
}

function openShortModal() {
  ['short-title','short-url','short-cat','short-views'].forEach(id => { const el = document.getElementById(id); if (el) el.value = ''; });
  const pub = document.getElementById('short-public'); if (pub) pub.checked = true;
  const sav = document.getElementById('short-saving'); if (sav) sav.style.display = 'none';
  openModal('modal-short');
}

async function addShort() {
  if (!isOwner) return;
  const titulo   = document.getElementById('short-title')?.value.trim() || '';
  const url      = document.getElementById('short-url')?.value.trim()   || '';
  const cat      = document.getElementById('short-cat')?.value.trim()   || '';
  const views    = document.getElementById('short-views')?.value.trim() || '';
  const isPublic = document.getElementById('short-public')?.checked ?? true;
  if (!titulo || !url) { toast('Title and URL required.'); return; }
  const chId = cfg.shorts || cfg.notes;
  if (!chId) { toast('No channel for shorts. Set in Setup.'); return; }
  const sav = document.getElementById('short-saving'); if (sav) sav.style.display = 'block';
  let msg = 'SHORT: ' + titulo + '\n' + url;
  if (cat)   msg += '\nCat: ' + cat;
  if (views) msg += '\nViews: ' + views;
  if (!isPublic) msg += '\nPublic: false';
  try {
    const r = await API.post('/channel/' + chId + '/message', { content: msg });
    if (r.ok) { closeModal('modal-short'); toast('✦ Scroll added.'); }
    else toast('Error: ' + (r.error || 'failed'));
  } catch(e) { toast('Error: ' + e.message); }
  finally { if (sav) sav.style.display = 'none'; }
}

function openModal(id)  { const m = document.getElementById(id); if (m) m.style.display = 'flex'; }
function closeModal(id) { const m = document.getElementById(id); if (m) m.style.display = 'none'; }

function updateStats() {
  const tags = new Set();
  vaultItems.forEach(i => { if (i.tags) i.tags.split(',').forEach(t => tags.add(t.trim())); });
  const si = document.getElementById('stat-items'); if (si) si.textContent = vaultItems.length;
  const st = document.getElementById('stat-tags');  if (st) st.textContent = tags.size;
}

function setStatus(state) {
  const dot = document.getElementById('discord-dot');
  const lbl = document.getElementById('discord-label');
  const c = { connected:'#98c379', connecting:'#c9a84c', error:'#e06c75' };
  const l = { connected:'Discord: connected', connecting:'Discord: connecting…', error:'Discord: error' };
  if (dot) dot.style.background = c[state] || '#666';
  if (lbl) lbl.textContent = l[state] || 'Discord: unknown';
}

function showResult(el, msg, type) {
  if (!el) return;
  el.textContent = msg;
  el.style.display = msg ? 'block' : 'none';
  el.className = 'connection-result' + (type ? ' ' + type : '');
}

function toast(msg) {
  let t = document.getElementById('toast');
  if (!t) {
    t = document.createElement('div'); t.id = 'toast';
    t.style.cssText = 'position:fixed;bottom:2rem;left:50%;transform:translateX(-50%);background:rgba(20,16,10,.95);color:#c9a84c;border:1px solid rgba(201,168,76,.3);padding:.75rem 1.5rem;border-radius:4px;font-size:.8rem;letter-spacing:.05em;z-index:9999;opacity:0;transition:opacity .3s;pointer-events:none';
    document.body.appendChild(t);
  }
  t.textContent = msg; t.style.opacity = '1';
  clearTimeout(t._h);
  t._h = setTimeout(() => t.style.opacity = '0', 3000);
}

function esc(s) {
  return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}
