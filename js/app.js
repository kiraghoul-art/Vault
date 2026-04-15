// Kira Portfolio — app.js
const WORKER     = 'https://kira-discord-proxy.ghoullkira.workers.dev';
const APP_SECRET = 'Trip_in_Tazer13377!#2026#!77331rezaT_ni_pirT';

// ── API ───────────────────────────────────────────────────────────────────────
const API = {
  _h() { return { 'Content-Type': 'application/json', 'X-App-Secret': APP_SECRET }; },
  async get(path) {
    const r = await fetch(WORKER + path, { headers: this._h() }); return r.json();
  },
  async post(path, data) {
    const r = await fetch(WORKER + path, { method:'POST', headers: this._h(), body: JSON.stringify(data) }); return r.json();
  },
  async patch(path, data) {
    const r = await fetch(WORKER + path, { method:'PATCH', headers: this._h(), body: JSON.stringify(data) }); return r.json();
  },
  async getChannel(id, limit) { return this.get('/channel/' + id + (limit ? '?limit='+limit : '')); },
  async sendToChannel(id, content) { return this.post('/channel/' + id + '/message', { content }); },
  async deleteMsg(channelId, msgId) { return this.post('/channel/' + channelId + '/delete/' + msgId, {}); },
  async editMsg(channelId, msgId, content) { return this.patch('/channel/' + channelId + '/message/' + msgId, { content }); },
  async getConfig() { return this.get('/config'); },
  async setConfigLine(line) { return this.post('/config', { line }); }
};

// ── Estado ────────────────────────────────────────────────────────────────────
let cfg = {};
let isOwner = false;
let shorts = [];
let vaultItems = [];
let currentVaultFilter = 'all';
let currentVaultType = 'link';
let currentPage = 'home';

// ── Init ──────────────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', async function() {
  setupNav();
  setupLoginModal();
  setupModals();
  setupVaultModal();
  setupShortModal();
  setupSettings();

  // Sessão owner guardada?
  const ownerFlag = sessionStorage.getItem('kira_owner');
  const storedCfg = sessionStorage.getItem('kira_cfg');
  if (ownerFlag === '1' && storedCfg) {
    try { cfg = JSON.parse(storedCfg); enterOwnerMode(); return; } catch(e) {}
  }

  // Carregar config pública
  try {
    const res = await API.getConfig();
    if (res.ok && res.config) {
      cfg = res.config;
      applyProfile();
      fetchBgImage();
      syncPublicData();
    }
  } catch(e) { console.error('Config load error:', e); }
  updateStats();
});

// ── Navegação ─────────────────────────────────────────────────────────────────
function setupNav() {
  // Botões do nav
  document.querySelectorAll('.nav-links button[data-page]').forEach(btn => {
    btn.addEventListener('click', function() { goTo(this.dataset.page); });
  });

  // Botões CTA da home (data-goto)
  document.querySelectorAll('[data-goto]').forEach(btn => {
    btn.addEventListener('click', function() { goTo(this.dataset.goto); });
  });

  // Hamburger (mobile)
  const hamburger = document.getElementById('nav-hamburger');
  const navLinks  = document.querySelector('.nav-links');
  if (hamburger && navLinks) {
    hamburger.addEventListener('click', function(e) {
      e.stopPropagation();
      navLinks.classList.toggle('open');
    });
    document.addEventListener('click', function() { navLinks.classList.remove('open'); });
  }

  // Logo → home
  const logo = document.getElementById('nav-logo');
  if (logo) logo.addEventListener('click', () => goTo('home'));
}

function goTo(page) {
  currentPage = page;
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.nav-links button[data-page]').forEach(b => {
    b.classList.toggle('active', b.dataset.page === page);
  });
  const target = document.getElementById('page-' + page);
  if (target) target.classList.add('active');
  document.querySelector('.nav-links')?.classList.remove('open');
}

// ── Login modal ───────────────────────────────────────────────────────────────
function setupLoginModal() {
  // Abrir
  const btnOpen = document.getElementById('btn-open-login');
  if (btnOpen) btnOpen.addEventListener('click', openLoginModal);

  // Fechar
  const btnClose = document.getElementById('btn-close-login');
  if (btnClose) btnClose.addEventListener('click', closeLoginModal);

  // Fechar ao clicar fora
  const screen = document.getElementById('login-screen');
  if (screen) screen.addEventListener('click', function(e) {
    if (e.target === screen) closeLoginModal();
  });

  // Botão login
  const btnLogin = document.getElementById('btn-login');
  if (btnLogin) btnLogin.addEventListener('click', doLogin);

  // Enter no campo password
  const passInput = document.getElementById('login-pass');
  if (passInput) passInput.addEventListener('keydown', function(e) {
    if (e.key === 'Enter') doLogin();
  });

  // Logout
  const btnLogout = document.getElementById('btn-logout');
  if (btnLogout) btnLogout.addEventListener('click', doLogout);
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
  el.style.color = isError ? '#e06c75' : '#98c379';
  el.style.display = msg ? 'block' : 'none';
}

async function doLogin() {
  const user = (document.getElementById('login-user')?.value || '').trim();
  const pass = document.getElementById('login-pass')?.value || '';
  if (!user || !pass) { setLoginResult('Fill both fields.', true); return; }

  const btn = document.getElementById('btn-login');
  if (btn) btn.disabled = true;
  setLoginResult('Verifying…');

  try {
    const res = await API.getConfig();
    if (!res.ok || !res.config) { setLoginResult('Config error.', true); return; }
    cfg = res.config;

    if (!cfg.auth) { setLoginResult('Auth channel not configured.', true); return; }

    const msgs = await API.getChannel(cfg.auth, 10);
    if (!msgs.ok || !msgs.messages) { setLoginResult('Cannot reach auth channel.', true); return; }

    let ok = false;
    for (const m of msgs.messages) {
      const parts = (m.content || '').trim().split(':');
      if (parts.length >= 2 && parts[0].trim() === user && parts.slice(1).join(':').trim() === pass) {
        ok = true; break;
      }
    }

    if (!ok) { setLoginResult('Wrong username or password.', true); return; }

    sessionStorage.setItem('kira_owner', '1');
    sessionStorage.setItem('kira_cfg', JSON.stringify(cfg));
    closeLoginModal();
    enterOwnerMode();
  } catch(e) {
    setLoginResult('Connection error: ' + e.message, true);
  } finally {
    if (btn) btn.disabled = false;
  }
}

function doLogout() {
  isOwner = false;
  cfg = {}; shorts = []; vaultItems = [];
  sessionStorage.removeItem('kira_owner');
  sessionStorage.removeItem('kira_cfg');
  location.reload();
}

// ── Owner mode ────────────────────────────────────────────────────────────────
function enterOwnerMode() {
  isOwner = true;
  document.querySelectorAll('.owner-only').forEach(el => el.style.display = '');
  applyProfile();
  fetchBgImage();
  populateSettingsFields();
  syncAllData();
}

// ── Background ────────────────────────────────────────────────────────────────
async function fetchBgImage() {
  if (!cfg.bg) return;
  try {
    const res = await API.getChannel(cfg.bg, 5);
    if (!res.ok || !res.messages?.length) return;
    const url = res.messages[0].content.trim();
    if (url.startsWith('http')) {
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
  // Save config channels
  const btnSaveCfg = document.getElementById('btn-save-config');
  if (btnSaveCfg) btnSaveCfg.addEventListener('click', saveChannelConfig);

  // Save profile
  const btnSaveProfile = document.getElementById('btn-save-profile');
  if (btnSaveProfile) btnSaveProfile.addEventListener('click', saveProfile);

  // Test connection
  const btnTest = document.getElementById('btn-test-connection');
  if (btnTest) btnTest.addEventListener('click', testConnection);

  // Re-register commands
  const btnReregister = document.getElementById('btn-reregister-commands');
  if (btnReregister) btnReregister.addEventListener('click', reregisterCommands);
}

function populateSettingsFields() {
  const map = {
    'cfg-ch-links': 'links', 'cfg-ch-notes': 'notes', 'cfg-ch-files': 'files',
    'cfg-ch-ideas': 'ideas', 'cfg-ch-code': 'code',   'cfg-ch-bg': 'bg',
    'cfg-ch-socials': 'socials', 'cfg-ch-cv': 'cv'
  };
  Object.entries(map).forEach(([id, key]) => {
    const el = document.getElementById(id);
    if (el && cfg[key]) el.value = cfg[key];
  });
  if (cfg.profileName)    { const el = document.getElementById('cfg-name');    if (el) el.value = cfg.profileName; }
  if (cfg.profileTagline) { const el = document.getElementById('cfg-tagline'); if (el) el.value = cfg.profileTagline; }
  // Show owner-only edit areas
  const socialsEdit = document.getElementById('socials-edit-area');
  const cvEdit      = document.getElementById('cv-edit-area');
  if (socialsEdit) socialsEdit.style.display = '';
  if (cvEdit)      cvEdit.style.display = '';
}

async function saveChannelConfig() {
  if (!isOwner) return;
  const map = {
    'cfg-ch-links': 'links', 'cfg-ch-notes': 'notes', 'cfg-ch-files': 'files',
    'cfg-ch-ideas': 'ideas', 'cfg-ch-code': 'code',   'cfg-ch-bg': 'bg',
    'cfg-ch-socials': 'socials', 'cfg-ch-cv': 'cv'
  };
  const result = document.getElementById('connection-result');
  if (result) result.textContent = 'Saving…';
  try {
    for (const [id, key] of Object.entries(map)) {
      const el = document.getElementById(id);
      if (el && el.value.trim()) {
        cfg[key] = el.value.trim();
        await API.setConfigLine(key + '=' + el.value.trim());
      }
    }
    sessionStorage.setItem('kira_cfg', JSON.stringify(cfg));
    if (result) { result.textContent = '✅ Config saved!'; result.style.color = '#98c379'; }
  } catch(e) {
    if (result) { result.textContent = '❌ Error: ' + e.message; result.style.color = '#e06c75'; }
  }
}

async function saveProfile() {
  if (!isOwner) return;
  const name    = document.getElementById('cfg-name')?.value.trim()    || '';
  const tagline = document.getElementById('cfg-tagline')?.value.trim() || '';
  const bgUrl   = document.getElementById('cfg-bg-url')?.value.trim()  || '';
  const result  = document.getElementById('profile-result');
  if (result) result.textContent = 'Saving…';
  try {
    if (name)    { await API.setConfigLine('profileName=' + name);    cfg.profileName = name; }
    if (tagline) { await API.setConfigLine('profileTagline=' + tagline); cfg.profileTagline = tagline; }
    if (bgUrl)   {
      // Apagar mensagens anteriores do canal bg e postar novo URL
      if (cfg.bg) {
        const existing = await API.getChannel(cfg.bg, 10);
        if (existing.ok && existing.messages) {
          for (const m of existing.messages) await API.deleteMsg(cfg.bg, m.id);
        }
        await API.sendToChannel(cfg.bg, bgUrl);
      }
    }
    applyProfile();
    fetchBgImage();
    sessionStorage.setItem('kira_cfg', JSON.stringify(cfg));
    if (result) { result.textContent = '✅ Profile saved!'; result.style.color = '#98c379'; }
  } catch(e) {
    if (result) { result.textContent = '❌ Error: ' + e.message; result.style.color = '#e06c75'; }
  }
}

async function testConnection() {
  const result = document.getElementById('connection-result');
  if (result) result.textContent = 'Testing…';
  try {
    const res = await API.getConfig();
    if (res.ok) {
      if (result) { result.textContent = '✅ Connected!'; result.style.color = '#98c379'; }
      const dot = document.getElementById('discord-dot');
      if (dot) dot.style.background = '#98c379';
    } else {
      if (result) { result.textContent = '❌ Worker responded but no config.'; result.style.color = '#e06c75'; }
    }
  } catch(e) {
    if (result) { result.textContent = '❌ Failed: ' + e.message; result.style.color = '#e06c75'; }
  }
}

async function reregisterCommands() {
  const result = document.getElementById('commands-result');
  if (result) { result.textContent = 'Registering…'; result.style.color = '#c9a84c'; }
  try {
    const res = await API.post('/register-commands', {});
    if (result) {
      result.textContent = res.ok ? '✅ Commands registered!' : '❌ ' + (res.error || 'Failed');
      result.style.color = res.ok ? '#98c379' : '#e06c75';
    }
  } catch(e) {
    if (result) { result.textContent = '❌ ' + e.message; result.style.color = '#e06c75'; }
  }
}

// ── Vault filter (sidebar) ────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', function() {
  document.querySelectorAll('.vault-cat').forEach(cat => {
    cat.addEventListener('click', function() {
      document.querySelectorAll('.vault-cat').forEach(c => c.classList.remove('active'));
      this.classList.add('active');
      currentVaultFilter = this.dataset.vaultFilter || 'all';
      renderVault();
    });
  });

  // Vault search
  const searchInput = document.getElementById('vault-search-input');
  if (searchInput) searchInput.addEventListener('input', renderVault);

  // Add vault button
  const btnAddVault = document.getElementById('btn-add-vault');
  if (btnAddVault) btnAddVault.addEventListener('click', function() { openVaultModal(); });

  // Add short button
  const btnAddShort = document.getElementById('btn-add-short');
  if (btnAddShort) btnAddShort.addEventListener('click', function() { openShortModal(); });
});

// ── Vault modal ───────────────────────────────────────────────────────────────
function setupVaultModal() {
  // Type selector
  document.querySelectorAll('.type-opt').forEach(btn => {
    btn.addEventListener('click', function() {
      document.querySelectorAll('.type-opt').forEach(b => b.classList.remove('active'));
      this.classList.add('active');
      currentVaultType = this.dataset.type;
      updateVaultModalFields(currentVaultType);
    });
  });

  // Confirm
  const btnConfirm = document.getElementById('btn-confirm-vault');
  if (btnConfirm) btnConfirm.addEventListener('click', addVaultItem);

  // Cancel
  const btnCancel = document.querySelector('[data-close="modal-vault"]');
  if (btnCancel) btnCancel.addEventListener('click', function() { closeModal('modal-vault'); });

  // Backdrop click
  const backdrop = document.getElementById('modal-vault');
  if (backdrop) backdrop.addEventListener('click', function(e) {
    if (e.target === backdrop) closeModal('modal-vault');
  });

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
}

function openVaultModal(type) {
  currentVaultType = type || 'link';
  document.querySelectorAll('.type-opt').forEach(b => {
    b.classList.toggle('active', b.dataset.type === currentVaultType);
  });
  updateVaultModalFields(currentVaultType);
  // Limpar campos
  ['vault-title','vault-url','vault-content','vault-tags','vault-lang','vault-file-url'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.value = '';
  });
  const label = document.getElementById('vault-file-label');
  if (label) label.textContent = 'Drag & drop or click to browse';
  const saving = document.getElementById('vault-saving');
  if (saving) saving.style.display = 'none';
  openModal('modal-vault');
}

function updateVaultModalFields(type) {
  const urlGroup  = document.getElementById('vault-url-group');
  const fileGroup = document.getElementById('vault-file-group');
  const langGroup = document.getElementById('vault-lang-group');
  const contentLabel = document.getElementById('vault-content-label');

  if (urlGroup)  urlGroup.style.display  = (type === 'note' || type === 'idea') ? 'none' : '';
  if (fileGroup) fileGroup.style.display = (type === 'file') ? '' : 'none';
  if (langGroup) langGroup.style.display = (type === 'code') ? '' : 'none';
  if (contentLabel) {
    contentLabel.textContent = type === 'code' ? 'Code' : 'Content / Notes';
  }
}

async function addVaultItem() {
  if (!isOwner) return;
  const titulo  = document.getElementById('vault-title')?.value.trim()   || '';
  const url     = document.getElementById('vault-url')?.value.trim()     || '';
  const content = document.getElementById('vault-content')?.value.trim() || '';
  const tags    = document.getElementById('vault-tags')?.value.trim()    || '';
  const lang    = document.getElementById('vault-lang')?.value.trim()    || '';
  const fileUrl = document.getElementById('vault-file-url')?.value.trim()|| '';
  const isPublic= document.getElementById('vault-public')?.checked ?? true;
  const type    = currentVaultType;

  if (!titulo) { toast('Title is required.'); return; }

  const channelMap = { link: cfg.links, note: cfg.notes, file: cfg.files, idea: cfg.ideas, code: cfg.code };
  const channelId  = channelMap[type];
  if (!channelId)  { toast('Channel not configured for ' + type); return; }

  const saving = document.getElementById('vault-saving');
  if (saving) saving.style.display = 'block';

  let msg = titulo;
  const effectiveUrl = url || fileUrl;
  if (effectiveUrl) msg += '\n' + effectiveUrl;
  if (lang)    msg += '\nLang: ' + lang;
  if (content) msg += '\n' + content;
  if (tags)    msg += '\nTags: ' + tags;
  if (!isPublic) msg += '\nPublic: false';

  try {
    const res = await API.sendToChannel(channelId, msg);
    if (res.ok) {
      vaultItems.push({ id: res.id, channelId, type, titulo, url: effectiveUrl, content, tags, lang, isPublic });
      renderVault();
      updateStats();
      closeModal('modal-vault');
      toast('✦ Added to Vault!');
    } else {
      toast('Error: ' + (res.error || 'Failed to save'));
    }
  } catch(e) { toast('Error: ' + e.message); }
  finally { if (saving) saving.style.display = 'none'; }
}

// ── Shorts modal ──────────────────────────────────────────────────────────────
function setupShortModal() {
  const btnConfirm = document.getElementById('btn-confirm-short');
  if (btnConfirm) btnConfirm.addEventListener('click', addShort);

  const btnCancel = document.querySelector('[data-close="modal-short"]');
  if (btnCancel) btnCancel.addEventListener('click', function() { closeModal('modal-short'); });

  const backdrop = document.getElementById('modal-short');
  if (backdrop) backdrop.addEventListener('click', function(e) {
    if (e.target === backdrop) closeModal('modal-short');
  });
}

function openShortModal() {
  ['short-title','short-url','short-cat','short-views'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.value = '';
  });
  const pub = document.getElementById('short-public');
  if (pub) pub.checked = true;
  const saving = document.getElementById('short-saving');
  if (saving) saving.style.display = 'none';
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

  if (!cfg.shorts && !cfg.notes) { toast('No shorts channel configured.'); return; }
  const channelId = cfg.shorts || cfg.notes;

  const saving = document.getElementById('short-saving');
  if (saving) saving.style.display = 'block';

  let msg = 'SHORT: ' + titulo + '\n' + url;
  if (cat)   msg += '\nCat: ' + cat;
  if (views) msg += '\nViews: ' + views;
  if (!isPublic) msg += '\nPublic: false';

  try {
    const res = await API.sendToChannel(channelId, msg);
    if (res.ok) {
      shorts.push({ id: res.id, titulo, url, cat, views, isPublic });
      renderShorts();
      updateStats();
      closeModal('modal-short');
      toast('✦ Scroll added!');
    } else {
      toast('Error: ' + (res.error || 'Failed'));
    }
  } catch(e) { toast('Error: ' + e.message); }
  finally { if (saving) saving.style.display = 'none'; }
}

// ── Generic modal helpers ─────────────────────────────────────────────────────
function setupModals() {
  // ESC fecha qualquer modal aberto
  document.addEventListener('keydown', function(e) {
    if (e.key === 'Escape') {
      closeModal('modal-vault');
      closeModal('modal-short');
      closeLoginModal();
    }
  });
}

function openModal(id) {
  const m = document.getElementById(id);
  if (m) { m.style.display = 'flex'; m.classList.add('active'); }
}

function closeModal(id) {
  const m = document.getElementById(id);
  if (m) { m.style.display = 'none'; m.classList.remove('active'); }
}

// ── Vault render ──────────────────────────────────────────────────────────────
function renderVault() {
  const container = document.getElementById('vault-cards');
  if (!container) return;

  const searchVal = (document.getElementById('vault-search-input')?.value || '').toLowerCase();

  const filtered = vaultItems.filter(item => {
    if (currentVaultFilter !== 'all' && item.type !== currentVaultFilter) return false;
    if (searchVal) {
      const hay = (item.titulo + item.content + item.tags + item.url).toLowerCase();
      if (!hay.includes(searchVal)) return false;
    }
    if (!isOwner && item.isPublic === false) return false;
    return true;
  });

  if (!filtered.length) {
    container.innerHTML = '<div class="vault-empty">No scrolls found in this chamber.</div>';
    return;
  }

  container.innerHTML = filtered.map(item => {
    const typeIcon = { link:'⊞', note:'≡', file:'◫', idea:'◇', code:'</>' }[item.type] || '▦';
    return `<div class="vault-card" data-type="${item.type}">
      <div class="vault-card-header">
        <span class="vault-card-type">${typeIcon} ${item.type}</span>
        ${isOwner ? `<button class="vault-card-delete" data-id="${item.id}" data-ch="${item.channelId}" title="Delete">✕</button>` : ''}
      </div>
      <div class="vault-card-title">${escHtml(item.titulo)}</div>
      ${item.url ? `<a class="vault-card-url" href="${escHtml(item.url)}" target="_blank" rel="noopener">${escHtml(item.url)}</a>` : ''}
      ${item.content ? `<div class="vault-card-content">${escHtml(item.content)}</div>` : ''}
      ${item.tags ? `<div class="vault-card-tags">${item.tags.split(',').map(t=>`<span class="tag">${escHtml(t.trim())}</span>`).join('')}</div>` : ''}
    </div>`;
  }).join('');

  // Delete handlers
  container.querySelectorAll('.vault-card-delete').forEach(btn => {
    btn.addEventListener('click', async function(e) {
      e.stopPropagation();
      const id = this.dataset.id;
      const ch = this.dataset.ch;
      if (!confirm('Delete this entry?')) return;
      try {
        await API.deleteMsg(ch, id);
        vaultItems = vaultItems.filter(i => i.id !== id);
        renderVault();
        updateStats();
        toast('Deleted.');
      } catch(err) { toast('Error deleting.'); }
    });
  });

  // Tag sidebar
  renderTagSidebar();
}

function renderTagSidebar() {
  const sidebar = document.getElementById('tag-sidebar');
  if (!sidebar) return;
  const allTags = new Set();
  vaultItems.forEach(item => {
    if (item.tags) item.tags.split(',').forEach(t => allTags.add(t.trim()));
  });
  sidebar.innerHTML = [...allTags].map(tag =>
    `<div class="vault-cat vault-tag" data-tag="${escHtml(tag)}"># ${escHtml(tag)}</div>`
  ).join('');
  sidebar.querySelectorAll('.vault-tag').forEach(el => {
    el.addEventListener('click', function() {
      const tag = this.dataset.tag;
      const searchInput = document.getElementById('vault-search-input');
      if (searchInput) { searchInput.value = tag; renderVault(); }
    });
  });
}

// ── Shorts render ─────────────────────────────────────────────────────────────
function renderShorts() {
  const grid = document.getElementById('shorts-grid');
  if (!grid) return;

  const visible = shorts.filter(s => isOwner || s.isPublic !== false);
  if (!visible.length) {
    grid.innerHTML = '<div class="vault-empty">No scrolls yet.</div>';
    return;
  }

  // Build filter bar
  const filterBar = document.getElementById('filter-bar');
  if (filterBar) {
    const cats = ['all', ...new Set(visible.map(s => s.cat).filter(Boolean))];
    filterBar.innerHTML = cats.map(c =>
      `<button class="filter-btn${c==='all'?' active':''}" data-filter="${c}">${c==='all'?'All':c}</button>`
    ).join('');
    filterBar.querySelectorAll('.filter-btn').forEach(btn => {
      btn.addEventListener('click', function() {
        filterBar.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
        this.classList.add('active');
        const f = this.dataset.filter;
        grid.querySelectorAll('.short-card').forEach(card => {
          card.style.display = (f === 'all' || card.dataset.cat === f) ? '' : 'none';
        });
      });
    });
  }

  grid.innerHTML = visible.map(item => `
    <div class="short-card" data-cat="${escHtml(item.cat||'')}">
      <div class="short-card-cat">${escHtml(item.cat||'Misc')}</div>
      <div class="short-card-title">${escHtml(item.titulo)}</div>
      ${item.views ? `<div class="short-card-views">${escHtml(item.views)} views</div>` : ''}
      <a class="short-card-link" href="${escHtml(item.url)}" target="_blank" rel="noopener">Watch →</a>
      ${isOwner ? `<button class="vault-card-delete" data-id="${item.id}" title="Delete">✕</button>` : ''}
    </div>
  `).join('');
}

// ── Sync data ─────────────────────────────────────────────────────────────────
async function syncPublicData() {
  if (cfg.links)  loadVaultChannel(cfg.links,  'link');
  if (cfg.notes)  loadVaultChannel(cfg.notes,  'note');
  if (cfg.files)  loadVaultChannel(cfg.files,  'file');
  if (cfg.ideas)  loadVaultChannel(cfg.ideas,  'idea');
  if (cfg.code)   loadVaultChannel(cfg.code,   'code');
}

async function syncAllData() {
  syncPublicData();
}

async function loadVaultChannel(channelId, type) {
  try {
    const res = await API.getChannel(channelId);
    if (!res.ok || !res.messages) return;
    res.messages.forEach(m => {
      if (!m.content || m.content.startsWith('KIRA_CFG:')) return;
      const lines    = m.content.split('\n');
      const titulo   = lines[0] || '';
      const urlLine  = lines.find(l => l.startsWith('http'));
      const tagsLine = lines.find(l => l.startsWith('Tags:'));
      const langLine = lines.find(l => l.startsWith('Lang:'));
      const pubLine  = lines.find(l => l.startsWith('Public:'));
      const content  = lines.filter(l =>
        l !== lines[0] && !l.startsWith('http') && !l.startsWith('Tags:') &&
        !l.startsWith('Lang:') && !l.startsWith('Public:')
      ).join('\n').trim();
      const isPublic = pubLine ? pubLine.includes('true') : true;
      vaultItems.push({
        id: m.id, channelId, type, titulo,
        url:     urlLine  || '',
        content: content  || '',
        tags:    tagsLine ? tagsLine.replace('Tags:', '').trim() : '',
        lang:    langLine ? langLine.replace('Lang:', '').trim() : '',
        isPublic
      });
    });
    renderVault();
    updateStats();
  } catch(e) {}
}

// ── Stats ─────────────────────────────────────────────────────────────────────
function updateStats() {
  const el = document.getElementById('stat-items');
  if (el) el.textContent = vaultItems.length;
  const elS = document.getElementById('stat-shorts');
  if (elS) elS.textContent = shorts.length;
  const allTags = new Set();
  vaultItems.forEach(i => { if (i.tags) i.tags.split(',').forEach(t => allTags.add(t.trim())); });
  const elT = document.getElementById('stat-tags');
  if (elT) elT.textContent = allTags.size;
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function toast(msg, duration) {
  let t = document.getElementById('toast');
  if (!t) {
    t = document.createElement('div');
    t.id = 'toast';
    t.style.cssText = 'position:fixed;bottom:2rem;left:50%;transform:translateX(-50%);background:rgba(20,16,10,0.95);color:#c9a84c;border:1px solid rgba(201,168,76,0.3);padding:0.75rem 1.5rem;border-radius:4px;font-size:0.8rem;letter-spacing:.05em;z-index:9999;opacity:0;transition:opacity .3s;font-family:var(--serif,serif)';
    document.body.appendChild(t);
  }
  t.textContent = msg;
  t.style.opacity = '1';
  clearTimeout(t._hide);
  t._hide = setTimeout(() => t.style.opacity = '0', duration || 3000);
}

function escHtml(str) {
  return String(str||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}
