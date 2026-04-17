const WORKER = 'https://kira-discord-proxy.ghoullkira.workers.dev';

const API = {
  token: null,
  h() { return { 'Content-Type': 'application/json', ...(this.token ? { 'X-Session-Token': this.token } : {}) }; },
  async get(p)    { return (await fetch(WORKER + p, { headers: this.h() })).json(); },
  async post(p,d) { return (await fetch(WORKER + p, { method:'POST',   headers: this.h(), body: JSON.stringify(d) })).json(); },
  async del(p)    { return (await fetch(WORKER + p, { method:'DELETE', headers: this.h() })).json(); }
};

let profile = {};
let theme   = {};
let isOwner = false;
let vaultItems = [];
let shorts  = [];
let socials = [];
let vaultFilter = 'all';
let vaultType   = 'link';

document.addEventListener('DOMContentLoaded', async () => {
  setupNav();
  setupLoginModal();
  setupVaultModal();
  setupShortModal();
  setupSettingsListeners();
  applyStoredTheme();

  const tok = sessionStorage.getItem('kira_token');
  if (tok) {
    API.token = tok;
    const saved = sessionStorage.getItem('kira_profile');
    const savedTheme = sessionStorage.getItem('kira_theme');
    if (saved) profile = JSON.parse(saved);
    if (savedTheme) theme = JSON.parse(savedTheme);
    await enterOwner(false);
    return;
  }
  await loadPublic();
});

async function loadPublic() {
  setStatus('connecting');
  try {
    const r = await API.get('/public');
    if (!r.ok) { setStatus('error'); return; }
    profile = r.profile || {};
    theme   = r.theme   || {};
    vaultItems = r.items   || [];
    shorts     = r.shorts  || [];
    socials    = r.socials || [];
    applyProfile();
    applyTheme(theme);
    applyPageVisibility();
    renderAll();
    setStatus('connected');
  } catch(e) { setStatus('error'); }
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
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') { closeModal('modal-vault'); closeModal('modal-short'); closeLoginModal(); }
  });
}

function goTo(page) {
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.nav-links button[data-page]').forEach(b =>
    b.classList.toggle('active', b.dataset.page === page)
  );
  document.getElementById('page-' + page)?.classList.add('active');
  document.querySelector('.nav-links')?.classList.remove('open');
  if (page === 'music') loadMusic();
}

function applyPageVisibility() {
  const pages = ['shorts','vault','socials','curriculum','music'];
  pages.forEach(p => {
    const key = 'show' + p.charAt(0).toUpperCase() + p.slice(1);
    const show = isOwner || profile[key] !== false;
    const navBtn = document.querySelector(`.nav-links button[data-page="${p}"]`);
    if (navBtn) navBtn.style.display = show ? '' : 'none';
  });
}

function setupLoginModal() {
  document.getElementById('btn-open-login')?.addEventListener('click', openLoginModal);
  document.getElementById('btn-close-login')?.addEventListener('click', closeLoginModal);
  document.getElementById('login-screen')?.addEventListener('click', function(e) { if (e.target === this) closeLoginModal(); });
  document.getElementById('btn-login')?.addEventListener('click', doLogin);
  document.getElementById('login-pass')?.addEventListener('keydown', e => { if (e.key === 'Enter') doLogin(); });
  document.getElementById('login-user')?.addEventListener('keydown', e => { if (e.key === 'Enter') document.getElementById('login-pass')?.focus(); });
  document.getElementById('btn-logout')?.addEventListener('click', doLogout);
}

function openLoginModal() {
  const s = document.getElementById('login-screen');
  if (s) { s.style.display = 'flex'; document.getElementById('login-user')?.focus(); }
}

function closeLoginModal() {
  const s = document.getElementById('login-screen');
  if (s) s.style.display = 'none';
  setLoginMsg('');
}

function setLoginMsg(msg, ok) {
  const el = document.getElementById('login-result');
  if (!el) return;
  el.textContent = msg;
  el.className = 'login-result' + (ok ? ' ok' : msg ? ' err' : '');
  el.style.display = msg ? 'block' : 'none';
}

async function doLogin() {
  const user = document.getElementById('login-user')?.value.trim() || '';
  const pass = document.getElementById('login-pass')?.value || '';
  if (!user || !pass) { setLoginMsg('Fill both fields.'); return; }
  const btn = document.getElementById('btn-login');
  if (btn) btn.disabled = true;
  setLoginMsg('Verifying…');
  try {
    const r = await (await fetch(WORKER + '/auth', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: user, password: pass })
    })).json();
    if (!r.ok) { setLoginMsg('Wrong credentials.'); return; }
    API.token = r.token;
    profile = r.profile || {};
    theme   = r.theme   || {};
    sessionStorage.setItem('kira_token', r.token);
    sessionStorage.setItem('kira_profile', JSON.stringify(profile));
    sessionStorage.setItem('kira_theme', JSON.stringify(theme));
    closeLoginModal();
    await enterOwner(true);
  } catch(e) { setLoginMsg('Connection error.'); }
  finally { if (btn) btn.disabled = false; }
}

function doLogout() {
  API.token = null; isOwner = false;
  profile = {}; theme = {}; vaultItems = []; shorts = []; socials = [];
  sessionStorage.clear();
  location.reload();
}

async function enterOwner(fetchData) {
  isOwner = true;
  document.querySelectorAll('.owner-only').forEach(el => el.style.display = '');
  applyProfile();
  applyTheme(theme);

  if (fetchData) {
    setStatus('connecting');
    try {
      const r = await API.get('/data');
      if (!r.ok) { setStatus('error'); return; }
      profile    = r.profile || {};
      theme      = r.theme   || {};
      vaultItems = r.items   || [];
      shorts     = r.shorts  || [];
      socials    = r.socials || [];
      sessionStorage.setItem('kira_profile', JSON.stringify(profile));
      sessionStorage.setItem('kira_theme', JSON.stringify(theme));
    } catch(e) { setStatus('error'); return; }
  } else {
    const r = await API.get('/data');
    if (r.ok) {
      profile    = r.profile || {};
      theme      = r.theme   || {};
      vaultItems = r.items   || [];
      shorts     = r.shorts  || [];
      socials    = r.socials || [];
      sessionStorage.setItem('kira_profile', JSON.stringify(profile));
      sessionStorage.setItem('kira_theme', JSON.stringify(theme));
    }
  }

  applyProfile();
  applyTheme(theme);
  applyPageVisibility();
  populateSettings();
  renderAll();
  setStatus('connected');
}

function renderAll() {
  renderVault();
  renderShorts();
  renderSocials();
  updateStats();
}

function applyProfile() {
  const bgEl = document.querySelector('.bg-img');
  if (bgEl && profile.bgUrl) bgEl.style.backgroundImage = 'url(' + profile.bgUrl + ')';
  const h1 = document.getElementById('hero-title');
  if (h1) h1.innerHTML = (profile.name || 'Kira') + '<em>creates.</em>';
  const tg = document.getElementById('hero-tagline');
  if (tg) tg.textContent = profile.tagline || 'Short-form content, ideas, and a private vault.';
}

function applyTheme(t) {
  if (!t) return;
  const r = document.documentElement;
  if (t.gold)       r.style.setProperty('--gold',       t.gold);
  if (t.goldLight)  r.style.setProperty('--gold-light', t.goldLight);
  if (t.goldDim)    r.style.setProperty('--gold-dim',   t.goldDim);
  if (t.bg)         r.style.setProperty('--bg',         t.bg);
  if (t.surface)    r.style.setProperty('--surface',    t.surface);
  if (t.text)       r.style.setProperty('--text',       t.text);
  if (t.textDim)    r.style.setProperty('--text-dim',   t.textDim);
  if (t.bgOpacity !== undefined) {
    const bgEl = document.querySelector('.bg-img');
    if (bgEl) bgEl.style.opacity = t.bgOpacity;
  }
  localStorage.setItem('kira_theme', JSON.stringify(t));
}

function applyStoredTheme() {
  try { const t = localStorage.getItem('kira_theme'); if (t) applyTheme(JSON.parse(t)); } catch(e) {}
}

function setupSettingsListeners() {
  document.getElementById('btn-save-profile')?.addEventListener('click', saveProfile);
  document.getElementById('btn-save-theme')?.addEventListener('click', saveTheme);
  document.getElementById('btn-reset-theme')?.addEventListener('click', resetTheme);
  document.getElementById('btn-test-connection')?.addEventListener('click', testConnection);
  document.getElementById('btn-add-social')?.addEventListener('click', addSocial);
  document.getElementById('btn-spotify-connect')?.addEventListener('click', () => {
    window.open(WORKER + '/spotify/login', '_blank', 'width=500,height=700');
  });
  document.getElementById('btn-spotify-load')?.addEventListener('click', loadMusic);

  document.querySelectorAll('.theme-color-input').forEach(inp => {
    inp.addEventListener('input', function() {
      const picker = document.getElementById(this.id + '-picker');
      if (picker) picker.value = this.value;
      livePreviewTheme();
    });
  });
  document.querySelectorAll('.theme-color-picker').forEach(p => {
    p.addEventListener('input', function() {
      const txt = document.getElementById(this.dataset.target);
      if (txt) txt.value = this.value;
      livePreviewTheme();
    });
  });
  const opSlider = document.getElementById('theme-bg-opacity');
  if (opSlider) opSlider.addEventListener('input', function() {
    const lbl = document.getElementById('theme-bg-opacity-val');
    if (lbl) lbl.textContent = parseFloat(this.value).toFixed(2);
    livePreviewTheme();
  });
}

function livePreviewTheme() { applyTheme(readThemeForm()); }

function readThemeForm() {
  const g = id => document.getElementById(id)?.value || '';
  return {
    gold:      g('theme-gold')      || '#c9a84c',
    goldLight: g('theme-gold-light')|| '#e8d08a',
    goldDim:   g('theme-gold-dim')  || '#a07c30',
    bg:        g('theme-bg')        || '#080604',
    surface:   g('theme-surface')   || '#0f0c07',
    text:      g('theme-text')      || '#e8dcc8',
    textDim:   g('theme-text-dim')  || '#9a8860',
    bgUrl:     g('theme-bg-url'),
    bgOpacity: parseFloat(document.getElementById('theme-bg-opacity')?.value || '0.45')
  };
}

function populateSettings() {
  const sv = (id, v) => { const el = document.getElementById(id); if (el && v !== undefined) el.value = v; };
  sv('cfg-name',    profile.name);
  sv('cfg-tagline', profile.tagline);

  const pages = ['Shorts','Vault','Socials','Curriculum','Music'];
  pages.forEach(p => {
    const cb = document.getElementById('show-' + p.toLowerCase());
    if (cb) cb.checked = profile['show' + p] !== false;
  });

  if (theme.gold)       { sv('theme-gold',       theme.gold);       const pk = document.getElementById('theme-gold-picker');       if (pk) pk.value = theme.gold; }
  if (theme.goldLight)  { sv('theme-gold-light',  theme.goldLight);  const pk = document.getElementById('theme-gold-light-picker'); if (pk) pk.value = theme.goldLight; }
  if (theme.goldDim)    { sv('theme-gold-dim',    theme.goldDim);    const pk = document.getElementById('theme-gold-dim-picker');   if (pk) pk.value = theme.goldDim; }
  if (theme.bg)         { sv('theme-bg',          theme.bg);         const pk = document.getElementById('theme-bg-picker');         if (pk) pk.value = theme.bg; }
  if (theme.surface)    { sv('theme-surface',     theme.surface);    const pk = document.getElementById('theme-surface-picker');    if (pk) pk.value = theme.surface; }
  if (theme.text)       { sv('theme-text',        theme.text);       const pk = document.getElementById('theme-text-picker');       if (pk) pk.value = theme.text; }
  if (theme.textDim)    { sv('theme-text-dim',    theme.textDim);    const pk = document.getElementById('theme-text-dim-picker');   if (pk) pk.value = theme.textDim; }
  if (theme.bgUrl)      sv('theme-bg-url',     theme.bgUrl);
  if (theme.bgOpacity !== undefined) {
    sv('theme-bg-opacity', theme.bgOpacity);
    const lbl = document.getElementById('theme-bg-opacity-val');
    if (lbl) lbl.textContent = parseFloat(theme.bgOpacity).toFixed(2);
  }

  const sea = document.getElementById('socials-edit-area'); if (sea) sea.style.display = '';
  const cea = document.getElementById('cv-edit-area');      if (cea) cea.style.display = '';
}

async function saveProfile() {
  if (!isOwner) return;
  const el = document.getElementById('profile-result');
  showResult(el, 'Saving…', '');
  const pages = ['Shorts','Vault','Socials','Curriculum','Music'];
  const updated = {
    name:    document.getElementById('cfg-name')?.value.trim()    || profile.name    || 'Kira',
    tagline: document.getElementById('cfg-tagline')?.value.trim() || profile.tagline || ''
  };
  pages.forEach(p => {
    const cb = document.getElementById('show-' + p.toLowerCase());
    if (cb) updated['show' + p] = cb.checked;
  });
  if (profile.bgUrl) updated.bgUrl = profile.bgUrl;
  try {
    const r = await API.post('/profile', updated);
    if (!r.ok) { showResult(el, '❌ Failed.', 'err'); return; }
    profile = r.profile || { ...profile, ...updated };
    sessionStorage.setItem('kira_profile', JSON.stringify(profile));
    applyProfile();
    applyPageVisibility();
    showResult(el, '✅ Saved.', 'ok');
  } catch(e) { showResult(el, '❌ ' + e.message, 'err'); }
}

async function saveTheme() {
  if (!isOwner) return;
  const el = document.getElementById('theme-result');
  showResult(el, 'Saving…', '');
  const t = readThemeForm();
  try {
    const r = await API.post('/theme', t);
    if (!r.ok) { showResult(el, '❌ Failed.', 'err'); return; }
    theme = r.theme || t;
    applyTheme(theme);
    sessionStorage.setItem('kira_theme', JSON.stringify(theme));
    if (t.bgUrl) {
      profile.bgUrl = t.bgUrl;
      sessionStorage.setItem('kira_profile', JSON.stringify(profile));
      applyProfile();
    }
    showResult(el, '✅ Theme saved.', 'ok');
  } catch(e) { showResult(el, '❌ ' + e.message, 'err'); }
}

function resetTheme() {
  const d = { gold:'#c9a84c', goldLight:'#e8d08a', goldDim:'#a07c30', bg:'#080604', surface:'#0f0c07', text:'#e8dcc8', textDim:'#9a8860', bgOpacity:0.45 };
  const sv = (id, v) => { const el = document.getElementById(id); if (el) el.value = v; };
  sv('theme-gold',       d.gold);       const pk1 = document.getElementById('theme-gold-picker');       if (pk1) pk1.value = d.gold;
  sv('theme-gold-light', d.goldLight);  const pk2 = document.getElementById('theme-gold-light-picker'); if (pk2) pk2.value = d.goldLight;
  sv('theme-gold-dim',   d.goldDim);    const pk3 = document.getElementById('theme-gold-dim-picker');   if (pk3) pk3.value = d.goldDim;
  sv('theme-bg',         d.bg);         const pk4 = document.getElementById('theme-bg-picker');         if (pk4) pk4.value = d.bg;
  sv('theme-surface',    d.surface);    const pk5 = document.getElementById('theme-surface-picker');    if (pk5) pk5.value = d.surface;
  sv('theme-text',       d.text);       const pk6 = document.getElementById('theme-text-picker');       if (pk6) pk6.value = d.text;
  sv('theme-text-dim',   d.textDim);    const pk7 = document.getElementById('theme-text-dim-picker');   if (pk7) pk7.value = d.textDim;
  sv('theme-bg-opacity', d.bgOpacity);
  const lbl = document.getElementById('theme-bg-opacity-val'); if (lbl) lbl.textContent = '0.45';
  applyTheme(d);
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

function setupVaultModal() {
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
  const pub = document.getElementById('vault-public');     if (pub) pub.checked = true;
  const sav = document.getElementById('vault-saving');     if (sav) sav.style.display = 'none';
  openModal('modal-vault');
}

function updateVaultFields(type) {
  const ug = document.getElementById('vault-url-group');    if (ug) ug.style.display  = (type==='note'||type==='idea') ? 'none' : '';
  const fg = document.getElementById('vault-file-group');   if (fg) fg.style.display  = type==='file' ? '' : 'none';
  const lg = document.getElementById('vault-lang-group');   if (lg) lg.style.display  = type==='code' ? '' : 'none';
  const cl = document.getElementById('vault-content-label'); if (cl) cl.textContent   = type==='code' ? 'Code' : 'Content / Notes';
}

async function addVaultItem() {
  if (!isOwner) return;
  const titulo   = document.getElementById('vault-title')?.value.trim()    || '';
  const url      = document.getElementById('vault-url')?.value.trim()      || '';
  const content  = document.getElementById('vault-content')?.value.trim()  || '';
  const tags     = document.getElementById('vault-tags')?.value.trim()     || '';
  const lang     = document.getElementById('vault-lang')?.value.trim()     || '';
  const fileUrl  = document.getElementById('vault-file-url')?.value.trim() || '';
  const isPublic = document.getElementById('vault-public')?.checked ?? true;
  if (!titulo) { toast('Title is required.'); return; }
  const sav = document.getElementById('vault-saving'); if (sav) sav.style.display = 'block';
  try {
    const r = await API.post('/items', { type: vaultType, titulo, url: url || fileUrl, content, tags, lang, isPublic });
    if (r.ok) {
      vaultItems.unshift({ id: r.id, type: vaultType, titulo, url: url || fileUrl, content, tags, lang, isPublic });
      renderVault(); updateStats(); closeModal('modal-vault'); toast('✦ Added.');
    } else toast('Error: ' + (r.error || 'failed'));
  } catch(e) { toast('Error: ' + e.message); }
  finally { if (sav) sav.style.display = 'none'; }
}

function renderVault() {
  const c = document.getElementById('vault-cards');
  if (!c) return;
  const q = (document.getElementById('vault-search-input')?.value || '').toLowerCase();
  const items = vaultItems.filter(i => {
    if (!isOwner && i.isPublic === false) return false;
    if (vaultFilter !== 'all' && i.type !== vaultFilter) return false;
    if (q && !(i.titulo + i.content + i.tags + i.url).toLowerCase().includes(q)) return false;
    return true;
  });
  if (!items.length) { c.innerHTML = '<div class="vault-empty">No scrolls found.</div>'; renderTagSidebar(); return; }
  const ic = { link:'⊞', note:'≡', file:'◫', idea:'◇', code:'</>' };
  c.innerHTML = items.map(i => {
    const pub = i.isPublic !== false;
    return `<div class="vault-item" data-type="${i.type}" style="${!pub&&isOwner?'opacity:.6;border-style:dashed':''}">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:.5rem">
        <span class="vault-item-type">${ic[i.type]||'▦'} ${i.type}</span>
        <span style="display:flex;align-items:center;gap:.35rem">
          <span style="font-size:.65rem;color:${pub?'var(--gold-dark)':'var(--text-muted)'}">${pub?'👁':'🔒'}</span>
          ${isOwner?`<button class="vtoggle" data-id="${i.id}" data-pub="${pub}" style="background:none;border:1px solid rgba(201,168,76,.2);color:var(--text-muted);cursor:pointer;font-size:.52rem;padding:.1rem .35rem;border-radius:2px;font-family:var(--display);letter-spacing:.06em">${pub?'Hide':'Show'}</button>
          <button class="vdel" data-id="${i.id}" style="background:none;border:none;color:var(--text-muted);cursor:pointer;font-size:.75rem;padding:.1rem .3rem">✕</button>`:''}
        </span>
      </div>
      <div class="vault-item-title">${esc(i.titulo)}</div>
      ${i.url?`<div class="vault-item-url"><a href="${esc(i.url)}" target="_blank" rel="noopener">${esc(i.url)}</a></div>`:''}
      ${i.content?`<div class="vault-item-preview">${esc(i.content)}</div>`:''}
      ${i.tags?`<div class="vault-item-footer"><div style="display:flex;gap:.3rem;flex-wrap:wrap">${i.tags.split(',').map(t=>`<span class="vault-tag">${esc(t.trim())}</span>`).join('')}</div></div>`:''}
    </div>`;
  }).join('');
  c.querySelectorAll('.vtoggle').forEach(btn => btn.addEventListener('click', async function(e) {
    e.stopPropagation();
    const id = this.dataset.id, newPub = this.dataset.pub !== 'true';
    try {
      await API.post('/items/update', { id, isPublic: newPub });
      const idx = vaultItems.findIndex(x => x.id === id);
      if (idx > -1) vaultItems[idx].isPublic = newPub;
      renderVault(); toast(newPub ? '👁 Public.' : '🔒 Hidden.');
    } catch(err) { toast('Failed.'); }
  }));
  c.querySelectorAll('.vdel').forEach(btn => btn.addEventListener('click', async function(e) {
    e.stopPropagation();
    if (!confirm('Delete?')) return;
    try {
      await API.del('/items/' + this.dataset.id);
      vaultItems = vaultItems.filter(x => x.id !== this.dataset.id);
      renderVault(); updateStats(); toast('Deleted.');
    } catch(err) { toast('Delete failed.'); }
  }));
  renderTagSidebar();
}

function renderTagSidebar() {
  const sb = document.getElementById('tag-sidebar');
  if (!sb) return;
  const tags = new Set();
  vaultItems.forEach(i => { if (i.tags) i.tags.split(',').forEach(t => tags.add(t.trim())); });
  sb.innerHTML = [...tags].map(t => `<div class="vault-cat" data-stag="${esc(t)}"># ${esc(t)}</div>`).join('');
  sb.querySelectorAll('[data-stag]').forEach(el => el.addEventListener('click', function() {
    const inp = document.getElementById('vault-search-input');
    if (inp) { inp.value = this.dataset.stag; renderVault(); }
  }));
}

function setupShortModal() {
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
  const sav = document.getElementById('short-saving'); if (sav) sav.style.display = 'block';
  try {
    const r = await API.post('/shorts', { titulo, url, cat, views, isPublic });
    if (r.ok) {
      shorts.unshift({ id: r.id, titulo, url, cat, views, isPublic });
      renderShorts(); updateStats(); closeModal('modal-short'); toast('✦ Scroll added.');
    } else toast('Error: ' + (r.error || 'failed'));
  } catch(e) { toast('Error: ' + e.message); }
  finally { if (sav) sav.style.display = 'none'; }
}

function renderShorts() {
  const grid = document.getElementById('shorts-grid');
  if (!grid) return;
  const visible = shorts.filter(s => isOwner || s.isPublic !== false);
  if (!visible.length) { grid.innerHTML = '<div class="short-empty">No scrolls yet.</div>'; return; }
  const cats = ['all', ...new Set(visible.map(s => s.cat).filter(Boolean))];
  const fb = document.getElementById('filter-bar');
  if (fb) {
    fb.innerHTML = cats.map(c => `<button class="filter-btn${c==='all'?' active':''}" data-fcat="${esc(c)}">${c==='all'?'All':esc(c)}</button>`).join('');
    fb.querySelectorAll('.filter-btn').forEach(btn => btn.addEventListener('click', function() {
      fb.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
      this.classList.add('active');
      const f = this.dataset.fcat;
      grid.querySelectorAll('.short-card').forEach(card => card.style.display = (f==='all'||card.dataset.scat===f)?'':'none');
    }));
  }
  grid.innerHTML = visible.map(s => {
    const pub = s.isPublic !== false;
    return `<div class="short-card" data-scat="${esc(s.cat||'')}" data-sid="${s.id}" style="${!pub&&isOwner?'opacity:.6;border-style:dashed':''}">
      <div class="short-thumb">
        <div class="thumb-gradient"></div>
        <div class="play-icon"><svg viewBox="0 0 24 24"><polygon points="5,3 19,12 5,21" fill="currentColor"/></svg></div>
        ${s.cat?`<div class="thumb-tag">${esc(s.cat)}</div>`:''}
        ${isOwner?`<div style="position:absolute;top:.4rem;right:.4rem;display:flex;gap:.25rem;z-index:2">
          <button class="stoggle" data-id="${s.id}" data-pub="${pub}" style="background:rgba(8,6,4,.85);border:1px solid rgba(201,168,76,.25);color:var(--text-muted);cursor:pointer;font-size:.5rem;padding:.15rem .35rem;border-radius:2px;font-family:var(--display)">${pub?'Hide':'Show'}</button>
          <button class="sdel" data-id="${s.id}" style="background:rgba(8,6,4,.85);border:none;color:var(--text-muted);cursor:pointer;font-size:.7rem;padding:.15rem .35rem">✕</button>
        </div>`:''}
      </div>
      <div class="short-info">
        <div class="short-title">${esc(s.titulo)}</div>
        <div class="short-meta">
          ${s.views?`<span class="short-views">${esc(s.views)} views</span>`:''}
          <span style="font-size:.6rem;color:${pub?'var(--gold-dark)':'var(--text-muted)'};margin-left:auto">${pub?'👁':'🔒'}</span>
        </div>
      </div>
    </div>`;
  }).join('');
  grid.querySelectorAll('.short-card').forEach((card, i) => {
    card.addEventListener('click', e => {
      if (['stoggle','sdel'].some(c => e.target.classList.contains(c))) return;
      if (visible[i]?.url) window.open(visible[i].url, '_blank');
    });
  });
  grid.querySelectorAll('.stoggle').forEach(btn => btn.addEventListener('click', async function(e) {
    e.stopPropagation();
    const id = this.dataset.id, newPub = this.dataset.pub !== 'true';
    try {
      await API.post('/shorts/update', { id, isPublic: newPub });
      const idx = shorts.findIndex(x => x.id === id);
      if (idx > -1) shorts[idx].isPublic = newPub;
      renderShorts(); toast(newPub ? '👁 Public.' : '🔒 Hidden.');
    } catch(err) { toast('Failed.'); }
  }));
  grid.querySelectorAll('.sdel').forEach(btn => btn.addEventListener('click', async function(e) {
    e.stopPropagation();
    if (!confirm('Delete?')) return;
    try {
      await API.del('/shorts/' + this.dataset.id);
      shorts = shorts.filter(x => x.id !== this.dataset.id);
      renderShorts(); updateStats(); toast('Deleted.');
    } catch(err) { toast('Delete failed.'); }
  }));
}

async function addSocial() {
  if (!isOwner) return;
  const platform = document.getElementById('social-platform')?.value.trim() || '';
  const url      = document.getElementById('social-url')?.value.trim()      || '';
  const handle   = document.getElementById('social-handle')?.value.trim()   || '';
  const icon     = document.getElementById('social-icon')?.value.trim()     || '';
  const isPublic = document.getElementById('social-public')?.checked ?? true;
  if (!platform || !url) { toast('Platform and URL required.'); return; }
  try {
    const r = await API.post('/socials', { platform, url, handle, icon, isPublic });
    if (r.ok) {
      socials.push({ id: r.id, platform, url, handle, icon, isPublic });
      renderSocials();
      ['social-platform','social-url','social-handle','social-icon'].forEach(id => { const f = document.getElementById(id); if (f) f.value = ''; });
      const el = document.getElementById('social-result'); showResult(el, '✅ Added.', 'ok');
    } else toast('Error: ' + (r.error || 'failed'));
  } catch(e) { toast('Error: ' + e.message); }
}

function renderSocials() {
  const grid = document.getElementById('socials-grid');
  if (!grid) return;
  const visible = socials.filter(s => isOwner || s.isPublic !== false);
  if (!visible.length) { grid.innerHTML = '<div class="socials-empty">No socials yet.</div>'; return; }
  grid.innerHTML = visible.map(s => {
    const pub = s.isPublic !== false;
    return `<a class="social-card" href="${esc(s.url)}" target="_blank" rel="noopener" style="${!pub&&isOwner?'opacity:.6;border-style:dashed':''}">
      <div class="social-icon-wrap">${s.icon||'🔗'}</div>
      <div class="social-info">
        <div class="social-name">${esc(s.platform)}</div>
        ${s.handle?`<div class="social-handle">${esc(s.handle)}</div>`:''}
      </div>
      ${isOwner?`<div style="display:flex;flex-direction:column;gap:.25rem;align-items:flex-end;margin-left:.5rem">
        <button class="soctoggle" data-id="${s.id}" data-pub="${pub}" style="background:none;border:1px solid rgba(201,168,76,.2);color:var(--text-muted);cursor:pointer;font-size:.5rem;padding:.1rem .3rem;border-radius:2px;font-family:var(--display)">${pub?'Hide':'Show'}</button>
        <button class="socdel" data-id="${s.id}" style="background:none;border:none;color:var(--text-muted);cursor:pointer;font-size:.7rem">✕</button>
      </div>`:''}
    </a>`;
  }).join('');
  grid.querySelectorAll('.soctoggle').forEach(btn => btn.addEventListener('click', async function(e) {
    e.preventDefault(); e.stopPropagation();
    const id = this.dataset.id, newPub = this.dataset.pub !== 'true';
    try {
      await API.post('/socials/update', { id, isPublic: newPub });
      const idx = socials.findIndex(x => x.id === id);
      if (idx > -1) socials[idx].isPublic = newPub;
      renderSocials(); toast(newPub ? '👁 Public.' : '🔒 Hidden.');
    } catch(err) { toast('Failed.'); }
  }));
  grid.querySelectorAll('.socdel').forEach(btn => btn.addEventListener('click', async function(e) {
    e.preventDefault(); e.stopPropagation();
    if (!confirm('Delete?')) return;
    try {
      await API.del('/socials/' + this.dataset.id);
      socials = socials.filter(x => x.id !== this.dataset.id);
      renderSocials(); toast('Deleted.');
    } catch(err) { toast('Delete failed.'); }
  }));
}

async function loadMusic() {
  const grid = document.getElementById('music-content');
  if (!grid) return;
  grid.innerHTML = '<div style="color:var(--text-muted);font-style:italic;padding:2rem 0">Loading from Spotify…</div>';
  try {
    const r = await API.get('/spotify/data');
    if (!r.ok) {
      grid.innerHTML = `<div style="color:#e06c75;font-style:italic;padding:2rem 0">Error: ${esc(r.error || 'unknown')}</div>`;
      return;
    }
    if (!r.topTracks?.length && !r.topArtists?.length && !r.playlists?.length) {
      grid.innerHTML = `<div style="color:var(--text-muted);font-style:italic;padding:2rem 0">Spotify connected but no data returned. Make sure your Spotify email is added as a tester in the Developer Portal, then reconnect.</div>`;
      return;
    }
    renderMusic(r);
  } catch(e) {
    grid.innerHTML = `<div style="color:#e06c75;font-style:italic;padding:2rem 0">Connection error: ${esc(e.message)}</div>`;
  }
}

function renderMusic(data) {
  const grid = document.getElementById('music-content');
  if (!grid) return;

  let html = '';

  if (data.topTracks?.length) {
    html += `<div class="music-section">
      <div class="music-section-title">✦ Top Tracks</div>
      <div class="music-tracks">
        ${data.topTracks.map((t, i) => `
          <a class="music-track" href="${t.external_urls?.spotify || '#'}" target="_blank" rel="noopener">
            <span class="music-track-num">${i + 1}</span>
            <img class="music-track-img" src="${t.album?.images?.[2]?.url || ''}" alt="">
            <div class="music-track-info">
              <div class="music-track-name">${esc(t.name)}</div>
              <div class="music-track-artist">${esc(t.artists?.map(a => a.name).join(', ') || '')}</div>
            </div>
            <div class="music-track-album">${esc(t.album?.name || '')}</div>
          </a>`).join('')}
      </div>
    </div>`;
  }

  if (data.topArtists?.length) {
    html += `<div class="music-section">
      <div class="music-section-title">✦ Top Artists</div>
      <div class="music-artists">
        ${data.topArtists.map(a => `
          <a class="music-artist" href="${a.external_urls?.spotify || '#'}" target="_blank" rel="noopener">
            <img class="music-artist-img" src="${a.images?.[1]?.url || a.images?.[0]?.url || ''}" alt="">
            <div class="music-artist-name">${esc(a.name)}</div>
            <div class="music-artist-genre">${esc(a.genres?.[0] || '')}</div>
          </a>`).join('')}
      </div>
    </div>`;
  }

  if (data.playlists?.length) {
    html += `<div class="music-section">
      <div class="music-section-title">✦ Playlists</div>
      <div class="music-playlists">
        ${data.playlists.map(p => `
          <a class="music-playlist" href="${p.external_urls?.spotify || '#'}" target="_blank" rel="noopener">
            <img class="music-playlist-img" src="${p.images?.[0]?.url || ''}" alt="">
            <div class="music-playlist-info">
              <div class="music-playlist-name">${esc(p.name)}</div>
              <div class="music-playlist-tracks">${p.tracks?.total || 0} tracks</div>
            </div>
          </a>`).join('')}
      </div>
    </div>`;
  }

  grid.innerHTML = html || '<div style="color:var(--text-muted);font-style:italic;padding:2rem 0">No data available.</div>';
}

function openModal(id)  { const m = document.getElementById(id); if (m) m.style.display = 'flex'; }
function closeModal(id) { const m = document.getElementById(id); if (m) m.style.display = 'none'; }

function updateStats() {
  const tags = new Set();
  vaultItems.forEach(i => { if (i.tags) i.tags.split(',').forEach(t => tags.add(t.trim())); });
  const si = document.getElementById('stat-items');  if (si) si.textContent = vaultItems.length;
  const ss = document.getElementById('stat-shorts'); if (ss) ss.textContent = shorts.length;
  const st = document.getElementById('stat-tags');   if (st) st.textContent = tags.size;
}

function setStatus(state) {
  const dot = document.getElementById('discord-dot');
  const lbl = document.getElementById('discord-label');
  const c = { connected:'#98c379', connecting:'#c9a84c', error:'#e06c75' };
  const l = { connected:'Discord: connected', connecting:'Connecting…', error:'Connection error' };
  if (dot) dot.style.background = c[state] || '#666';
  if (lbl) lbl.textContent = l[state] || '';
}

function showResult(el, msg, type) {
  if (!el) return;
  el.textContent = msg;
  el.style.display = msg ? 'block' : 'none';
  el.className = 'connection-result' + (type ? ' ' + type : '');
}

function toast(msg) {
  let t = document.getElementById('kira-toast');
  if (!t) {
    t = document.createElement('div'); t.id = 'kira-toast';
    t.style.cssText = 'position:fixed;bottom:2rem;left:50%;transform:translateX(-50%);background:rgba(20,16,10,.95);color:#c9a84c;border:1px solid rgba(201,168,76,.3);padding:.75rem 1.5rem;border-radius:4px;font-size:.8rem;letter-spacing:.05em;z-index:9999;opacity:0;transition:opacity .3s;pointer-events:none;font-family:var(--display,serif)';
    document.body.appendChild(t);
  }
  t.textContent = msg; t.style.opacity = '1';
  clearTimeout(t._h);
  t._h = setTimeout(() => t.style.opacity = '0', 3000);
}

function esc(s) {
  return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}
