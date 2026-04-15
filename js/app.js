const WORKER = 'https://kira-discord-proxy.ghoullkira.workers.dev';

const API = {
  token: null,
  h() { const h = { 'Content-Type': 'application/json' }; if (this.token) h['X-Session-Token'] = this.token; return h; },
  async get(path)        { return (await fetch(WORKER + path, { headers: this.h() })).json(); },
  async post(path, data) { return (await fetch(WORKER + path, { method: 'POST',   headers: this.h(), body: JSON.stringify(data) })).json(); },
  async del(path)        { return (await fetch(WORKER + path, { method: 'DELETE', headers: this.h() })).json(); }
};

let profile = {};
let theme = {};
let pages = { shorts: true, vault: true, socials: true, curriculum: true };
let isOwner = false;
let vaultItems = [];
let shorts = [];
let socials = [];
let vaultFilter = 'all';
let vaultType = 'link';

document.addEventListener('DOMContentLoaded', async () => {
  applyStoredTheme();
  setupNav();
  setupLoginModal();
  setupVaultModal();
  setupShortModal();
  setupSettings();

  const tok = sessionStorage.getItem('kira_token');
  if (tok) {
    API.token = tok;
    try { await enterOwner(); return; } catch(e) {}
  }
  await loadPublic();
});

async function loadPublic() {
  setStatus('connecting');
  try {
    const r = await API.get('/public');
    if (!r.ok) { setStatus('error'); return; }
    profile = r.profile || {};
    theme   = r.profile.theme || {};
    pages   = r.pages || pages;
    vaultItems = r.items   || [];
    shorts     = r.shorts  || [];
    socials    = r.socials || [];
    applyProfile();
    applyTheme(theme);
    applyPages();
    renderVault(); renderShorts(); renderSocials(); updateStats();
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
}

function applyPages() {
  const map = { shorts: 'nav-shorts', vault: 'nav-vault', socials: 'nav-socials', curriculum: 'nav-curriculum' };
  Object.entries(map).forEach(([key, id]) => {
    const btn = document.getElementById(id);
    if (btn) btn.style.display = (isOwner || pages[key] !== false) ? '' : 'none';
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
    sessionStorage.setItem('kira_token', r.token);
    closeLoginModal();
    await enterOwner();
  } catch(e) { setLoginMsg('Connection error.'); }
  finally { if (btn) btn.disabled = false; }
}

function doLogout() {
  API.token = null; isOwner = false;
  profile = {}; theme = {}; vaultItems = []; shorts = []; socials = [];
  sessionStorage.removeItem('kira_token');
  location.reload();
}

async function enterOwner() {
  isOwner = true;
  document.querySelectorAll('.owner-only').forEach(el => el.style.display = '');
  setStatus('connecting');
  try {
    const r = await API.get('/data');
    if (!r.ok) { setStatus('error'); return; }
    profile    = r.profile  || {};
    theme      = r.theme    || {};
    vaultItems = r.items    || [];
    shorts     = r.shorts   || [];
    socials    = r.socials  || [];
    pages = {
      shorts:     profile.showShorts     !== false,
      vault:      profile.showVault      !== false,
      socials:    profile.showSocials    !== false,
      curriculum: profile.showCurriculum !== false
    };
    applyProfile();
    applyTheme(theme);
    applyPages();
    populateSettings();
    renderVault(); renderShorts(); renderSocials(); updateStats();
    setStatus('connected');
  } catch(e) { setStatus('error'); }
}

function applyProfile() {
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
  const bgEl = document.querySelector('.bg-img');
  if (bgEl) {
    if (t.bgUrl) bgEl.style.backgroundImage = 'url(' + t.bgUrl + ')';
    if (t.bgOpacity !== undefined) bgEl.style.opacity = t.bgOpacity;
  }
}

function applyStoredTheme() {
  try { const t = localStorage.getItem('kira_theme'); if (t) applyTheme(JSON.parse(t)); } catch(e) {}
}

function setupSettings() {
  document.getElementById('btn-save-profile')?.addEventListener('click', saveProfile);
  document.getElementById('btn-save-theme')?.addEventListener('click', saveTheme);
  document.getElementById('btn-reset-theme')?.addEventListener('click', resetTheme);
  document.getElementById('btn-test-connection')?.addEventListener('click', testConnection);
  document.getElementById('btn-add-social')?.addEventListener('click', addSocial);

  const colorFields = ['theme-gold','theme-gold-light','theme-gold-dim','theme-bg','theme-surface','theme-text','theme-text-dim'];
  colorFields.forEach(id => {
    const txt = document.getElementById(id);
    const picker = document.getElementById(id + '-picker');
    if (txt && picker) {
      txt.addEventListener('input', function() { picker.value = this.value; livePreviewTheme(); });
      picker.addEventListener('input', function() { txt.value = this.value; livePreviewTheme(); });
    } else if (txt) {
      txt.addEventListener('input', livePreviewTheme);
    }
  });
  const opSlider = document.getElementById('theme-bg-opacity');
  if (opSlider) opSlider.addEventListener('input', function() {
    const v = document.getElementById('theme-bg-opacity-val');
    if (v) v.textContent = parseFloat(this.value).toFixed(2);
    livePreviewTheme();
  });
}

function populateSettings() {
  const pn = document.getElementById('cfg-name');    if (pn) pn.value = profile.name    || '';
  const pt = document.getElementById('cfg-tagline'); if (pt) pt.value = profile.tagline || '';

  const pageToggles = { 'toggle-shorts': 'showShorts', 'toggle-vault': 'showVault', 'toggle-socials': 'showSocials', 'toggle-curriculum': 'showCurriculum' };
  Object.entries(pageToggles).forEach(([id, key]) => {
    const el = document.getElementById(id);
    if (el) el.checked = profile[key] !== false;
  });

  const setVal = (id, v) => { const el = document.getElementById(id); if (el && v !== undefined) el.value = v; };
  setVal('theme-gold',        theme.gold       || '#c9a84c');
  setVal('theme-gold-light',  theme.goldLight  || '#e8d08a');
  setVal('theme-gold-dim',    theme.goldDim    || '#a07c30');
  setVal('theme-bg',          theme.bg         || '#080604');
  setVal('theme-surface',     theme.surface    || '#0f0c07');
  setVal('theme-text',        theme.text       || '#e8dcc8');
  setVal('theme-text-dim',    theme.textDim    || '#9a8860');
  setVal('theme-bg-url',      theme.bgUrl      || '');

  const op = document.getElementById('theme-bg-opacity');
  const opv = document.getElementById('theme-bg-opacity-val');
  const opVal = theme.bgOpacity !== undefined ? theme.bgOpacity : 0.45;
  if (op)  op.value = opVal;
  if (opv) opv.textContent = parseFloat(opVal).toFixed(2);

  const colorFields = ['theme-gold','theme-gold-light','theme-gold-dim','theme-bg','theme-surface','theme-text','theme-text-dim'];
  colorFields.forEach(id => {
    const txt = document.getElementById(id);
    const picker = document.getElementById(id + '-picker');
    if (txt && picker) picker.value = txt.value;
  });

  const sea = document.getElementById('socials-edit-area'); if (sea) sea.style.display = '';
  const cea = document.getElementById('cv-edit-area');      if (cea) cea.style.display = '';
}

function livePreviewTheme() {
  applyTheme(readThemeForm());
}

function readThemeForm() {
  return {
    gold:       document.getElementById('theme-gold')?.value       || '',
    goldLight:  document.getElementById('theme-gold-light')?.value || '',
    goldDim:    document.getElementById('theme-gold-dim')?.value   || '',
    bg:         document.getElementById('theme-bg')?.value         || '',
    surface:    document.getElementById('theme-surface')?.value    || '',
    text:       document.getElementById('theme-text')?.value       || '',
    textDim:    document.getElementById('theme-text-dim')?.value   || '',
    bgUrl:      document.getElementById('theme-bg-url')?.value.trim() || theme.bgUrl || '',
    bgOpacity:  parseFloat(document.getElementById('theme-bg-opacity')?.value || '0.45')
  };
}

async function saveProfile() {
  if (!isOwner) return;
  const el = document.getElementById('profile-result');
  showResult(el, 'Saving…', '');
  try {
    const data = {
      name:            document.getElementById('cfg-name')?.value.trim()    || '',
      tagline:         document.getElementById('cfg-tagline')?.value.trim() || '',
      showShorts:      document.getElementById('toggle-shorts')?.checked     ?? true,
      showVault:       document.getElementById('toggle-vault')?.checked      ?? true,
      showSocials:     document.getElementById('toggle-socials')?.checked    ?? true,
      showCurriculum:  document.getElementById('toggle-curriculum')?.checked ?? true
    };
    await API.post('/profile', data);
    profile = { ...profile, ...data };
    applyProfile();
    pages = { shorts: data.showShorts, vault: data.showVault, socials: data.showSocials, curriculum: data.showCurriculum };
    applyPages();
    showResult(el, '✅ Saved.', 'ok');
  } catch(e) { showResult(el, '❌ ' + e.message, 'err'); }
}

async function saveTheme() {
  if (!isOwner) return;
  const el = document.getElementById('theme-result');
  showResult(el, 'Saving…', '');
  try {
    const t = readThemeForm();
    await API.post('/theme', t);
    theme = t;
    applyTheme(t);
    localStorage.setItem('kira_theme', JSON.stringify(t));
    showResult(el, '✅ Theme saved.', 'ok');
  } catch(e) { showResult(el, '❌ ' + e.message, 'err'); }
}

function resetTheme() {
  const d = { gold:'#c9a84c', goldLight:'#e8d08a', goldDim:'#a07c30', bg:'#080604', surface:'#0f0c07', text:'#e8dcc8', textDim:'#9a8860', bgOpacity: 0.45 };
  const setVal = (id, v) => { const el = document.getElementById(id); if (el) el.value = v; };
  setVal('theme-gold', d.gold); setVal('theme-gold-light', d.goldLight); setVal('theme-gold-dim', d.goldDim);
  setVal('theme-bg', d.bg); setVal('theme-surface', d.surface); setVal('theme-text', d.text); setVal('theme-text-dim', d.textDim);
  setVal('theme-bg-opacity', d.bgOpacity);
  const opv = document.getElementById('theme-bg-opacity-val'); if (opv) opv.textContent = '0.45';
  const colorFields = ['theme-gold','theme-gold-light','theme-gold-dim','theme-bg','theme-surface','theme-text','theme-text-dim'];
  colorFields.forEach(id => { const txt = document.getElementById(id); const p = document.getElementById(id+'-picker'); if (txt && p) p.value = txt.value; });
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
      const lbl = document.getElementById('vault-file-label'); if (lbl && this.files[0]) lbl.textContent = this.files[0].name;
    });
  }
}

function openVaultModal(type) {
  vaultType = type || 'link';
  document.querySelectorAll('.type-opt').forEach(b => b.classList.toggle('active', b.dataset.type === vaultType));
  updateVaultFields(vaultType);
  ['vault-title','vault-url','vault-content','vault-tags','vault-lang','vault-file-url'].forEach(id => { const el = document.getElementById(id); if (el) el.value = ''; });
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
    } else { toast('Error: ' + (r.error || 'failed')); }
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
    return `<div class="vault-item" data-type="${i.type}" style="${!pub && isOwner ? 'opacity:.6;border-style:dashed' : ''}">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:.5rem">
        <span class="vault-item-type">${ic[i.type]||'▦'} ${i.type}</span>
        <span style="display:flex;align-items:center;gap:.35rem">
          <span style="font-size:.65rem">${pub?'👁':'🔒'}</span>
          ${isOwner ? `
            <button class="vtoggle" data-id="${i.id}" data-pub="${pub}" style="background:none;border:1px solid rgba(201,168,76,.2);color:var(--text-muted);cursor:pointer;font-size:.52rem;padding:.1rem .35rem;border-radius:2px;font-family:var(--display);letter-spacing:.06em">${pub?'Hide':'Show'}</button>
            <button class="vdel" data-id="${i.id}" style="background:none;border:none;color:var(--text-muted);cursor:pointer;font-size:.75rem;padding:.1rem .3rem">✕</button>
          ` : ''}
        </span>
      </div>
      <div class="vault-item-title">${esc(i.titulo)}</div>
      ${i.url ? `<div class="vault-item-url"><a href="${esc(i.url)}" target="_blank" rel="noopener">${esc(i.url)}</a></div>` : ''}
      ${i.content ? `<div class="vault-item-preview">${esc(i.content)}</div>` : ''}
      ${i.tags ? `<div class="vault-item-footer"><div style="display:flex;gap:.3rem;flex-wrap:wrap">${i.tags.split(',').map(t=>`<span class="vault-tag">${esc(t.trim())}</span>`).join('')}</div></div>` : ''}
    </div>`;
  }).join('');
  c.querySelectorAll('.vtoggle').forEach(btn => btn.addEventListener('click', async function(e) {
    e.stopPropagation();
    const id = this.dataset.id, newPub = this.dataset.pub !== 'true';
    try {
      await API.post('/items/update', { id, isPublic: newPub });
      const idx = vaultItems.findIndex(x => x.id === id);
      if (idx > -1) vaultItems[idx] = { ...vaultItems[idx], isPublic: newPub };
      renderVault(); toast(newPub ? '👁 Public.' : '🔒 Hidden.');
    } catch(err) { toast('Failed.'); }
  }));
  c.querySelectorAll('.vdel').forEach(btn => btn.addEventListener('click', async function(e) {
    e.stopPropagation();
    if (!confirm('Delete this entry?')) return;
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
  sb.innerHTML = [...tags].map(t => `<div class="vault-cat" style="cursor:pointer" data-stag="${esc(t)}"># ${esc(t)}</div>`).join('');
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
      renderShorts(); updateStats(); closeModal('modal-short'); toast('✦ Added.');
    } else { toast('Error: ' + (r.error || 'failed')); }
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
    return `<div class="short-card" data-scat="${esc(s.cat||'')}" style="${!pub&&isOwner?'opacity:.6;border-style:dashed':''}">
      <div class="short-thumb">
        <div class="thumb-gradient"></div>
        <div class="play-icon"><svg viewBox="0 0 24 24"><polygon points="5,3 19,12 5,21" fill="currentColor"/></svg></div>
        ${s.cat?`<div class="thumb-tag">${esc(s.cat)}</div>`:''}
        ${isOwner?`<div style="position:absolute;top:.4rem;right:.4rem;display:flex;gap:.25rem">
          <button class="stoggle" data-id="${s.id}" data-pub="${pub}" style="background:rgba(10,8,4,.85);border:1px solid rgba(201,168,76,.2);color:var(--text-muted);cursor:pointer;font-size:.5rem;padding:.1rem .3rem;border-radius:2px;font-family:var(--display)">${pub?'Hide':'Show'}</button>
          <button class="sdel" data-id="${s.id}" style="background:rgba(10,8,4,.85);border:none;color:var(--text-muted);cursor:pointer;font-size:.7rem;padding:.1rem .4rem">✕</button>
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
    card.addEventListener('click', e => { if (!e.target.classList.contains('sdel')&&!e.target.classList.contains('stoggle')&&visible[i]?.url) window.open(visible[i].url,'_blank'); });
  });
  grid.querySelectorAll('.stoggle').forEach(btn => btn.addEventListener('click', async function(e) {
    e.stopPropagation();
    const id = this.dataset.id, newPub = this.dataset.pub !== 'true';
    try {
      await API.post('/shorts/update', { id, isPublic: newPub });
      const idx = shorts.findIndex(x => x.id === id);
      if (idx > -1) shorts[idx] = { ...shorts[idx], isPublic: newPub };
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
      showResult(document.getElementById('social-result'), '✅ Added.', 'ok');
      toast('✦ Social added.');
    }
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
      ${isOwner?`<div style="display:flex;flex-direction:column;gap:.25rem;margin-left:.5rem">
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
      if (idx > -1) socials[idx] = { ...socials[idx], isPublic: newPub };
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
  el.textContent = msg; el.style.display = msg ? 'block' : 'none';
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
  clearTimeout(t._h); t._h = setTimeout(() => t.style.opacity = '0', 3000);
}

function esc(s) {
  return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}
