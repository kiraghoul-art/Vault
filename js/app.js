// Kira Vault — app.js
const WORKER = 'https://kira-discord-proxy.ghoullkira.workers.dev';

// ── API ───────────────────────────────────────────────────────────────────────
const API = {
  _token: null,
  _h(extra) {
    const h = { 'Content-Type': 'application/json' };
    if (this._token) h['X-Session-Token'] = this._token;
    return Object.assign(h, extra || {});
  },
  async get(path) {
    const r = await fetch(WORKER + path, { headers: this._h() }); return r.json();
  },
  async post(path, data) {
    const r = await fetch(WORKER + path, { method: 'POST', headers: this._h(), body: JSON.stringify(data) }); return r.json();
  },
  async patch(path, data) {
    const r = await fetch(WORKER + path, { method: 'PATCH', headers: this._h(), body: JSON.stringify(data) }); return r.json();
  },
  async login(user, pass) {
    // /login não precisa de token — é o que gera o token
    const r = await fetch(WORKER + '/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ user, pass })
    });
    return r.json();
  },
  async publicData()  { return this.get('/public-data'); },
  async allData()     { return this.get('/all-data'); },
  async sendToChannel(id, content) { return this.post('/channel/' + id + '/message', { content }); },
  async deleteMsg(chId, msgId)     { return this.post('/channel/' + chId + '/delete/' + msgId, {}); },
  async editMsg(chId, msgId, content) { return this.patch('/channel/' + chId + '/message/' + msgId, { content }); },
  async setConfigLine(line) { return this.post('/config', { line }); },
  async setBg(url) { return this.post('/bg', { url }); }
};

// ── Estado ────────────────────────────────────────────────────────────────────
let cfg       = {};
let isOwner   = false;
let vaultItems = [];
let currentVaultFilter = 'all';
let currentVaultType   = 'link';

// ── Init ──────────────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', async function() {
  setupNav();
  setupLoginModal();
  setupModals();
  setupSettings();

  // Sessão guardada?
  const savedToken = sessionStorage.getItem('kira_token');
  const savedCfg   = sessionStorage.getItem('kira_cfg');
  if (savedToken && savedCfg) {
    try {
      API._token = savedToken;
      cfg = JSON.parse(savedCfg);
      enterOwnerMode();
      return;
    } catch(e) {}
  }

  // Carregar dados públicos (sem login)
  loadPublicData();
});

async function loadPublicData() {
  setDiscordStatus('connecting');
  try {
    const res = await API.publicData();
    if (res.ok) {
      cfg        = res.config || {};
      vaultItems = res.items  || [];
      applyProfile();
      fetchBgImage();
      renderVault();
      updateStats();
      setDiscordStatus('connected');
    } else {
      setDiscordStatus('error');
    }
  } catch(e) {
    console.error('Failed to load public data:', e);
    setDiscordStatus('error');
  }
}

// ── Navegação ─────────────────────────────────────────────────────────────────
function setupNav() {
  document.querySelectorAll('.nav-links button[data-page]').forEach(btn => {
    btn.addEventListener('click', function() { goTo(this.dataset.page); });
  });
  document.querySelectorAll('[data-goto]').forEach(btn => {
    btn.addEventListener('click', function() { goTo(this.dataset.goto); });
  });
  const hamburger = document.getElementById('nav-hamburger');
  const navLinks  = document.querySelector('.nav-links');
  if (hamburger && navLinks) {
    hamburger.addEventListener('click', e => { e.stopPropagation(); navLinks.classList.toggle('open'); });
    document.addEventListener('click', () => navLinks.classList.remove('open'));
  }
  const logo = document.getElementById('nav-logo');
  if (logo) logo.addEventListener('click', () => goTo('home'));
}

function goTo(page) {
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.nav-links button[data-page]').forEach(b => {
    b.classList.toggle('active', b.dataset.page === page);
  });
  const target = document.getElementById('page-' + page);
  if (target) target.classList.add('active');
  document.querySelector('.nav-links')?.classList.remove('open');
}

// ── Login ─────────────────────────────────────────────────────────────────────
function setupLoginModal() {
  document.getElementById('btn-open-login')?.addEventListener('click', openLoginModal);
  document.getElementById('btn-close-login')?.addEventListener('click', closeLoginModal);
  document.getElementById('login-screen')?.addEventListener('click', function(e) {
    if (e.target === this) closeLoginModal();
  });
  document.getElementById('btn-login')?.addEventListener('click', doLogin);
  document.getElementById('login-pass')?.addEventListener('keydown', e => { if (e.key === 'Enter') doLogin(); });
  document.getElementById('btn-logout')?.addEventListener('click', doLogout);
}

function openLoginModal() {
  const s = document.getElementById('login-screen');
  if (s) s.style.display = 'flex';
}

function closeLoginModal() {
  const s = document.getElementById('login-screen');
  if (s) s.style.display = 'none';
  setLoginResult('');
}

function setLoginResult(msg, isError) {
  const el = document.getElementById('login-result');
  if (!el) return;
  el.textContent = msg;
  el.style.color   = isError ? '#e06c75' : '#c9a84c';
  el.style.display = msg ? 'block' : 'none';
}

async function doLogin() {
  const user = document.getElementById('login-user')?.value.trim() || '';
  const pass = document.getElementById('login-pass')?.value        || '';
  if (!user || !pass) { setLoginResult('Fill both fields.', true); return; }

  const btn = document.getElementById('btn-login');
  if (btn) btn.disabled = true;
  setLoginResult('Entering the Keep…');

  try {
    const res = await API.login(user, pass);
    if (!res.ok) {
      setLoginResult(res.error || 'Wrong credentials.', true);
      return;
    }
    // Guardar token e config na sessão
    API._token = res.token;
    cfg        = res.config || cfg;
    sessionStorage.setItem('kira_token', res.token);
    sessionStorage.setItem('kira_cfg',   JSON.stringify(cfg));
    closeLoginModal();
    enterOwnerMode();
  } catch(e) {
    setLoginResult('Connection error.', true);
  } finally {
    if (btn) btn.disabled = false;
  }
}

function doLogout() {
  API._token = null;
  isOwner    = false;
  cfg        = {};
  vaultItems = [];
  sessionStorage.removeItem('kira_token');
  sessionStorage.removeItem('kira_cfg');
  location.reload();
}

// ── Owner mode ────────────────────────────────────────────────────────────────
async function enterOwnerMode() {
  isOwner = true;
  document.querySelectorAll('.owner-only').forEach(el => el.style.display = '');
  document.getElementById('socials-edit-area') && (document.getElementById('socials-edit-area').style.display = '');
  document.getElementById('cv-edit-area')      && (document.getElementById('cv-edit-area').style.display      = '');
  applyProfile();
  fetchBgImage();
  populateSettingsFields();
  setDiscordStatus('connecting');
  try {
    const res = await API.allData();
    if (res.ok) {
      cfg        = res.config || cfg;
      vaultItems = res.items  || [];
      renderVault();
      updateStats();
      setDiscordStatus('connected');
    }
  } catch(e) { setDiscordStatus('error'); }
}

// ── Background ────────────────────────────────────────────────────────────────
async function fetchBgImage() {
  if (!cfg.bg) return;
  try {
    const r = await fetch(WORKER + '/channel/' + cfg.bg + '?limit=3', {
      headers: { 'Content-Type': 'application/json', 'X-Session-Token': API._token || '' }
    });
    const res = await r.json();
    if (!res.ok || !res.messages?.length) return;
    const url = res.messages[0].content?.trim();
    if (url?.startsWith('http')) {
      const bgEl = document.querySelector('.bg-img');
      if (bgEl) bgEl.style.backgroundImage = 'url(' + url + ')';
    }
  } catch(e) {}
}

// ── Profile ───────────────────────────────────────────────────────────────────
function applyProfile() {
  const name    = cfg.profileName    || 'Kira';
  const tagline = cfg.profileTagline || 'Short-form content, ideas, and a private vault.';
  const heroTitle = document.getElementById('hero-title');
  if (heroTitle) heroTitle.innerHTML = name + '<em>creates.</em>';
  const heroTagline = document.getElementById('hero-tagline');
  if (heroTagline) heroTagline.textContent = tagline;
}

// ── Settings ──────────────────────────────────────────────────────────────────
function setupSettings() {
  document.getElementById('btn-save-config')?.addEventListener('click', saveChannelConfig);
  document.getElementById('btn-save-profile')?.addEventListener('click', saveProfile);
  document.getElementById('btn-test-connection')?.addEventListener('click', testConnection);
  document.getElementById('btn-reregister-commands')?.addEventListener('click', reregisterCommands);
}

function populateSettingsFields() {
  const map = {
    'cfg-ch-links': 'links', 'cfg-ch-notes': 'notes', 'cfg-ch-files': 'files',
    'cfg-ch-ideas': 'ideas', 'cfg-ch-code':  'code',  'cfg-ch-bg':    'bg',
    'cfg-ch-socials': 'socials', 'cfg-ch-cv': 'cv'
  };
  Object.entries(map).forEach(([id, key]) => {
    const el = document.getElementById(id);
    if (el && cfg[key]) el.value = cfg[key];
  });
  if (cfg.profileName)    { const el = document.getElementById('cfg-name');    if (el) el.value = cfg.profileName; }
  if (cfg.profileTagline) { const el = document.getElementById('cfg-tagline'); if (el) el.value = cfg.profileTagline; }
}

async function saveChannelConfig() {
  if (!isOwner) return;
  const map = {
    'cfg-ch-links': 'links', 'cfg-ch-notes': 'notes', 'cfg-ch-files': 'files',
    'cfg-ch-ideas': 'ideas', 'cfg-ch-code':  'code',  'cfg-ch-bg':    'bg',
    'cfg-ch-socials': 'socials', 'cfg-ch-cv': 'cv'
  };
  const result = document.getElementById('connection-result');
  if (result) { result.textContent = 'Saving…'; result.style.color = '#c9a84c'; }
  try {
    for (const [id, key] of Object.entries(map)) {
      const el = document.getElementById(id);
      if (el?.value.trim()) { cfg[key] = el.value.trim(); await API.setConfigLine(key + '=' + el.value.trim()); }
    }
    sessionStorage.setItem('kira_cfg', JSON.stringify(cfg));
    if (result) { result.textContent = '✅ Config saved!'; result.style.color = '#98c379'; }
  } catch(e) {
    if (result) { result.textContent = '❌ ' + e.message; result.style.color = '#e06c75'; }
  }
}

async function saveProfile() {
  if (!isOwner) return;
  const name   = document.getElementById('cfg-name')?.value.trim()    || '';
  const tagline= document.getElementById('cfg-tagline')?.value.trim() || '';
  const bgUrl  = document.getElementById('cfg-bg-url')?.value.trim()  || '';
  const result = document.getElementById('profile-result');
  if (result) { result.textContent = 'Saving…'; result.style.color = '#c9a84c'; }
  try {
    if (name)    { await API.setConfigLine('profileName=' + name);    cfg.profileName = name; }
    if (tagline) { await API.setConfigLine('profileTagline=' + tagline); cfg.profileTagline = tagline; }
    if (bgUrl)   { await API.setBg(bgUrl); }
    applyProfile();
    fetchBgImage();
    sessionStorage.setItem('kira_cfg', JSON.stringify(cfg));
    if (result) { result.textContent = '✅ Saved!'; result.style.color = '#98c379'; }
  } catch(e) {
    if (result) { result.textContent = '❌ ' + e.message; result.style.color = '#e06c75'; }
  }
}

async function testConnection() {
  const result = document.getElementById('connection-result');
  if (result) { result.textContent = 'Testing…'; result.style.color = '#c9a84c'; }
  try {
    const res = await API.publicData();
    if (result) {
      result.textContent = res.ok ? '✅ Connected!' : '❌ Worker error';
      result.style.color = res.ok ? '#98c379' : '#e06c75';
    }
    setDiscordStatus(res.ok ? 'connected' : 'error');
  } catch(e) {
    if (result) { result.textContent = '❌ ' + e.message; result.style.color = '#e06c75'; }
    setDiscordStatus('error');
  }
}

async function reregisterCommands() {
  const result = document.getElementById('commands-result');
  if (result) { result.textContent = 'Registering…'; result.style.color = '#c9a84c'; }
  try {
    const res = await API.post('/register-commands', {});
    if (result) { result.textContent = res.ok ? '✅ Done!' : '❌ ' + (res.error || 'Failed'); result.style.color = res.ok ? '#98c379' : '#e06c75'; }
  } catch(e) {
    if (result) { result.textContent = '❌ ' + e.message; result.style.color = '#e06c75'; }
  }
}

// ── Vault ─────────────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', function() {
  document.querySelectorAll('.vault-cat').forEach(cat => {
    cat.addEventListener('click', function() {
      document.querySelectorAll('.vault-cat').forEach(c => c.classList.remove('active'));
      this.classList.add('active');
      currentVaultFilter = this.dataset.vaultFilter || 'all';
      renderVault();
    });
  });
  document.getElementById('vault-search-input')?.addEventListener('input', renderVault);
  document.getElementById('btn-add-vault')?.addEventListener('click', () => openVaultModal());
  document.getElementById('btn-add-short')?.addEventListener('click', () => openShortModal());
});

function renderVault() {
  const container = document.getElementById('vault-cards');
  if (!container) return;
  const search = (document.getElementById('vault-search-input')?.value || '').toLowerCase();
  const filtered = vaultItems.filter(item => {
    if (currentVaultFilter !== 'all' && item.type !== currentVaultFilter) return false;
    if (search) {
      const hay = (item.titulo + item.content + item.tags + item.url).toLowerCase();
      if (!hay.includes(search)) return false;
    }
    return true;
  });

  if (!filtered.length) {
    container.innerHTML = '<div class="vault-empty">No scrolls found in this chamber.</div>';
    renderTagSidebar();
    return;
  }

  const icons = { link:'⊞', note:'≡', file:'◫', idea:'◇', code:'</>' };
  container.innerHTML = filtered.map(item => `
    <div class="vault-card" data-type="${item.type}">
      <div class="vault-card-header">
        <span class="vault-card-type">${icons[item.type]||'▦'} ${item.type}</span>
        ${!item.isPublic ? '<span class="vault-private-badge">🔒 private</span>' : ''}
        ${isOwner ? `<button class="vault-card-delete" data-id="${item.id}" data-ch="${item.channelId||''}">✕</button>` : ''}
      </div>
      <div class="vault-card-title">${escHtml(item.titulo)}</div>
      ${item.url    ? `<a class="vault-card-url" href="${escHtml(item.url)}" target="_blank" rel="noopener">${escHtml(item.url)}</a>` : ''}
      ${item.content? `<div class="vault-card-content">${escHtml(item.content)}</div>` : ''}
      ${item.tags   ? `<div class="vault-card-tags">${item.tags.split(',').map(t=>`<span class="tag">${escHtml(t.trim())}</span>`).join('')}</div>` : ''}
    </div>`).join('');

  container.querySelectorAll('.vault-card-delete').forEach(btn => {
    btn.addEventListener('click', async function(e) {
      e.stopPropagation();
      if (!confirm('Delete this entry?')) return;
      const id = this.dataset.id, ch = this.dataset.ch;
      try {
        await API.deleteMsg(ch, id);
        vaultItems = vaultItems.filter(i => i.id !== id);
        renderVault(); updateStats();
        toast('Deleted.');
      } catch(err) { toast('Error deleting.'); }
    });
  });
  renderTagSidebar();
}

function renderTagSidebar() {
  const sidebar = document.getElementById('tag-sidebar');
  if (!sidebar) return;
  const tags = new Set();
  vaultItems.forEach(i => { if (i.tags) i.tags.split(',').forEach(t => tags.add(t.trim())); });
  sidebar.innerHTML = [...tags].map(tag =>
    `<div class="vault-cat vault-tag" data-tag="${escHtml(tag)}"># ${escHtml(tag)}</div>`
  ).join('');
  sidebar.querySelectorAll('.vault-tag').forEach(el => {
    el.addEventListener('click', function() {
      const inp = document.getElementById('vault-search-input');
      if (inp) { inp.value = this.dataset.tag; renderVault(); }
    });
  });
}

// ── Vault modal ───────────────────────────────────────────────────────────────
function setupModals() {
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') { closeModal('modal-vault'); closeModal('modal-short'); closeLoginModal(); }
  });
  // Vault modal
  document.querySelectorAll('.type-opt').forEach(btn => {
    btn.addEventListener('click', function() {
      document.querySelectorAll('.type-opt').forEach(b => b.classList.remove('active'));
      this.classList.add('active');
      currentVaultType = this.dataset.type;
      updateVaultModalFields(currentVaultType);
    });
  });
  document.getElementById('btn-confirm-vault')?.addEventListener('click', addVaultItem);
  document.querySelector('[data-close="modal-vault"]')?.addEventListener('click', () => closeModal('modal-vault'));
  document.getElementById('modal-vault')?.addEventListener('click', function(e) { if (e.target === this) closeModal('modal-vault'); });
  // File drop zone
  const dropZone  = document.getElementById('vault-file-drop');
  const fileInput = document.getElementById('vault-file-input');
  if (dropZone && fileInput) {
    dropZone.addEventListener('click', () => fileInput.click());
    fileInput.addEventListener('change', function() {
      const label = document.getElementById('vault-file-label');
      if (label && this.files[0]) label.textContent = this.files[0].name;
    });
  }
  // Short modal
  document.getElementById('btn-confirm-short')?.addEventListener('click', addShort);
  document.querySelector('[data-close="modal-short"]')?.addEventListener('click', () => closeModal('modal-short'));
  document.getElementById('modal-short')?.addEventListener('click', function(e) { if (e.target === this) closeModal('modal-short'); });
}

function openVaultModal(type) {
  currentVaultType = type || 'link';
  document.querySelectorAll('.type-opt').forEach(b => b.classList.toggle('active', b.dataset.type === currentVaultType));
  updateVaultModalFields(currentVaultType);
  ['vault-title','vault-url','vault-content','vault-tags','vault-lang','vault-file-url'].forEach(id => {
    const el = document.getElementById(id); if (el) el.value = '';
  });
  const lbl = document.getElementById('vault-file-label');
  if (lbl) lbl.textContent = 'Drag & drop or click to browse';
  const sav = document.getElementById('vault-saving');
  if (sav) sav.style.display = 'none';
  const pub = document.getElementById('vault-public');
  if (pub) pub.checked = true;
  openModal('modal-vault');
}

function updateVaultModalFields(type) {
  document.getElementById('vault-url-group') ?.style && (document.getElementById('vault-url-group').style.display  = (type==='note'||type==='idea') ? 'none' : '');
  document.getElementById('vault-file-group')?.style && (document.getElementById('vault-file-group').style.display = type==='file' ? '' : 'none');
  document.getElementById('vault-lang-group')?.style && (document.getElementById('vault-lang-group').style.display = type==='code' ? '' : 'none');
  const lbl = document.getElementById('vault-content-label');
  if (lbl) lbl.textContent = type==='code' ? 'Code' : 'Content / Notes';
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
  const type    = currentVaultType;
  if (!titulo) { toast('Title is required.'); return; }
  const chMap = { link: cfg.links, note: cfg.notes, file: cfg.files, idea: cfg.ideas, code: cfg.code };
  const chId  = chMap[type];
  if (!chId) { toast('Channel not configured for ' + type); return; }
  const sav = document.getElementById('vault-saving');
  if (sav) sav.style.display = 'block';
  let msg = titulo;
  const effUrl = url || fileUrl;
  if (effUrl)  msg += '\n' + effUrl;
  if (lang)    msg += '\nLang: ' + lang;
  if (content) msg += '\n' + content;
  if (tags)    msg += '\nTags: ' + tags;
  if (!isPublic) msg += '\nPublic: false';
  try {
    const res = await API.sendToChannel(chId, msg);
    if (res.ok) {
      vaultItems.push({ id: res.id, channelId: chId, type, titulo, url: effUrl, content, tags, lang, isPublic });
      renderVault(); updateStats();
      closeModal('modal-vault');
      toast('✦ Added to Vault!');
    } else { toast('Error: ' + (res.error || 'Failed')); }
  } catch(e) { toast('Error: ' + e.message); }
  finally { if (sav) sav.style.display = 'none'; }
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
  if (!titulo || !url) { toast('Title and URL are required.'); return; }
  const chId = cfg.shorts || cfg.notes;
  if (!chId) { toast('No channel configured for shorts.'); return; }
  const sav = document.getElementById('short-saving'); if (sav) sav.style.display = 'block';
  let msg = 'SHORT: ' + titulo + '\n' + url;
  if (cat)   msg += '\nCat: ' + cat;
  if (views) msg += '\nViews: ' + views;
  if (!isPublic) msg += '\nPublic: false';
  try {
    const res = await API.sendToChannel(chId, msg);
    if (res.ok) {
      closeModal('modal-short');
      toast('✦ Scroll added!');
    } else { toast('Error: ' + (res.error || 'Failed')); }
  } catch(e) { toast('Error: ' + e.message); }
  finally { if (sav) sav.style.display = 'none'; }
}

function openModal(id)  { const m = document.getElementById(id); if (m) { m.style.display = 'flex'; } }
function closeModal(id) { const m = document.getElementById(id); if (m) { m.style.display = 'none'; } }

// ── Stats & status ────────────────────────────────────────────────────────────
function updateStats() {
  const tags = new Set();
  vaultItems.forEach(i => { if (i.tags) i.tags.split(',').forEach(t => tags.add(t.trim())); });
  const el = document.getElementById('stat-items'); if (el) el.textContent = vaultItems.length;
  const et = document.getElementById('stat-tags');  if (et) et.textContent = tags.size;
}

function setDiscordStatus(state) {
  const dot   = document.getElementById('discord-dot');
  const label = document.getElementById('discord-label');
  const colors = { connected: '#98c379', connecting: '#c9a84c', error: '#e06c75' };
  const labels = { connected: 'Discord: connected', connecting: 'Discord: connecting…', error: 'Discord: error' };
  if (dot)   dot.style.background = colors[state] || '#666';
  if (label) label.textContent    = labels[state] || 'Discord: unknown';
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function toast(msg, duration) {
  let t = document.getElementById('toast');
  if (!t) {
    t = document.createElement('div'); t.id = 'toast';
    t.style.cssText = 'position:fixed;bottom:2rem;left:50%;transform:translateX(-50%);background:rgba(20,16,10,0.95);color:#c9a84c;border:1px solid rgba(201,168,76,0.3);padding:.75rem 1.5rem;border-radius:4px;font-size:.8rem;letter-spacing:.05em;z-index:9999;opacity:0;transition:opacity .3s;pointer-events:none';
    document.body.appendChild(t);
  }
  t.textContent = msg; t.style.opacity = '1';
  clearTimeout(t._h);
  t._h = setTimeout(() => t.style.opacity = '0', duration || 3000);
}

function escHtml(str) {
  return String(str||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}
