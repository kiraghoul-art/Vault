// Kira Portfolio — app.js (versão segura)
// X-App-Secret é obrigatório em todos os pedidos ao Worker.
// O valor de APP_SECRET tem de ser IGUAL ao que meteste no Cloudflare Variables.

const WORKER     = 'https://kira-discord-proxy.ghoullkira.workers.dev';
const APP_SECRET = 'SUBSTITUI_ISTO_PELO_TEU_SECRET'; // <- mesmo valor que no Cloudflare

// Todas as chamadas ao worker passam por aqui — nunca fazer fetch directo
const API = {
  headers(extra) {
    return Object.assign({ 'Content-Type': 'application/json', 'X-App-Secret': APP_SECRET }, extra || {});
  },
  async get(path) {
    const r = await fetch(WORKER + path, { headers: this.headers() });
    return r.json();
  },
  async post(path, data) {
    const r = await fetch(WORKER + path, {
      method: 'POST',
      headers: this.headers(),
      body: JSON.stringify(data)
    });
    return r.json();
  },
  async patch(path, data) {
    const r = await fetch(WORKER + path, {
      method: 'PATCH',
      headers: this.headers(),
      body: JSON.stringify(data)
    });
    return r.json();
  },
  async del(path) {
    const r = await fetch(WORKER + path, { method: 'DELETE', headers: this.headers() });
    return r.json();
  },
  // Helpers semânticos
  async getChannel(id, limit) {
    return this.get('/channel/' + id + (limit ? '?limit=' + limit : ''));
  },
  async sendToChannel(id, content) {
    return this.post('/channel/' + id + '/message', { content });
  },
  async deleteFromChannel(channelId, msgId) {
    return this.post('/channel/' + channelId + '/delete/' + msgId, {});
  },
  async editInChannel(channelId, msgId, content) {
    return this.patch('/channel/' + channelId + '/message/' + msgId, { content });
  },
  async getConfig() {
    return this.get('/config');
  },
  async setConfigLine(line) {
    return this.post('/config', { line });
  }
};

// ── Estado global ─────────────────────────────────────────────────────────────
let cfg = {};
let isOwner = false;
let shorts = [];
let vaultItems = [];
let currentVaultFilter = 'all';
let currentVaultType = 'link';

// ── Init ──────────────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', async function() {
  // Verificar se há sessão owner guardada
  const ownerFlag  = sessionStorage.getItem('kira_owner');
  const storedCfg  = sessionStorage.getItem('kira_cfg');
  if (ownerFlag === '1' && storedCfg) {
    try {
      cfg = JSON.parse(storedCfg);
      enterOwnerMode();
      return;
    } catch(e) {}
  }
  // Carregar dados públicos
  try {
    const res = await API.getConfig();
    if (res.ok && res.config) {
      cfg = res.config;
      applyProfile();
      fetchBgImage();
      syncPublicData();
    }
  } catch(e) { console.error('Erro ao carregar config:', e); }
  buildMarquee();
  updateStats();
});

// ── Autenticação ──────────────────────────────────────────────────────────────
async function doLogin() {
  const user = document.getElementById('inp-user').value.trim();
  const pass = document.getElementById('inp-pass').value;
  if (!user || !pass) return showLoginError('Preenche os dois campos.');

  // Carregar config e verificar credenciais no canal vault-auth
  showLoginError('');
  document.getElementById('btn-login').disabled = true;
  try {
    const res = await API.getConfig();
    if (!res.ok || !res.config) { showLoginError('Erro ao carregar configuração.'); return; }
    cfg = res.config;
    if (!cfg.auth) { showLoginError('Canal de autenticação não configurado.'); return; }

    const msgs = await API.getChannel(cfg.auth, 10);
    if (!msgs.ok || !msgs.messages) { showLoginError('Erro ao verificar credenciais.'); return; }

    // Formato esperado no canal vault-auth: "user:pass"
    let autenticado = false;
    for (const m of msgs.messages) {
      const parts = (m.content || '').trim().split(':');
      if (parts.length >= 2 && parts[0].trim() === user && parts.slice(1).join(':').trim() === pass) {
        autenticado = true; break;
      }
    }
    if (!autenticado) { showLoginError('Utilizador ou password incorretos.'); return; }

    // Guardar sessão
    sessionStorage.setItem('kira_owner', '1');
    sessionStorage.setItem('kira_cfg', JSON.stringify(cfg));
    isOwner = true;
    closeLoginModal();
    enterOwnerMode();
  } catch(e) {
    showLoginError('Erro de ligação: ' + e.message);
  } finally {
    document.getElementById('btn-login').disabled = false;
  }
}

function showLoginError(msg) {
  const el = document.getElementById('login-error');
  if (el) { el.textContent = msg; el.style.display = msg ? 'block' : 'none'; }
}

function closeLoginModal() {
  const m = document.getElementById('login-modal');
  if (m) m.style.display = 'none';
}

function openLoginModal() {
  const m = document.getElementById('login-modal');
  if (m) m.style.display = 'flex';
}

// ── Modo owner ────────────────────────────────────────────────────────────────
function enterOwnerMode() {
  isOwner = true;
  document.querySelectorAll('.owner-only').forEach(el => el.style.display = '');
  document.querySelectorAll('.guest-only').forEach(el => el.style.display = 'none');
  applyProfile();
  fetchBgImage();
  syncAllData();
}

document.getElementById && document.addEventListener('DOMContentLoaded', function() {
  const logoutBtn = document.getElementById('btn-logout');
  if (logoutBtn) {
    logoutBtn.addEventListener('click', function() {
      isOwner = false;
      cfg = {}; shorts = []; vaultItems = [];
      sessionStorage.removeItem('kira_owner');
      sessionStorage.removeItem('kira_cfg');
      document.querySelectorAll('.owner-only').forEach(el => el.style.display = 'none');
      document.querySelectorAll('.guest-only').forEach(el => el.style.display = '');
      location.reload();
    });
  }
});

// ── Background ────────────────────────────────────────────────────────────────
async function fetchBgImage() {
  if (!cfg.bg) return;
  try {
    const res = await API.getChannel(cfg.bg, 5);
    if (!res.ok || !res.messages || !res.messages.length) return;
    const url = res.messages[0].content.trim();
    if (url && (url.startsWith('http://') || url.startsWith('https://'))) {
      document.body.style.backgroundImage = 'url(' + url + ')';
    }
  } catch(e) {}
}

async function saveBgImage(url) {
  if (!cfg.bg) return false;
  try {
    const existing = await API.getChannel(cfg.bg, 10);
    if (existing.ok && existing.messages) {
      for (const m of existing.messages) {
        await API.deleteFromChannel(cfg.bg, m.id);
      }
    }
    await API.sendToChannel(cfg.bg, url);
    return true;
  } catch(e) { return false; }
}

// ── Profile ───────────────────────────────────────────────────────────────────
function applyProfile() {
  const name    = cfg.profileName    || 'Kira';
  const tagline = cfg.profileTagline || '';
  document.querySelectorAll('.profile-name').forEach(el => el.textContent = name);
  document.querySelectorAll('.profile-tagline').forEach(el => el.textContent = tagline);
}

async function saveProfile() {
  const name    = document.getElementById('inp-profile-name').value.trim();
  const tagline = document.getElementById('inp-profile-tagline').value.trim();
  try {
    await API.setConfigLine('profileName=' + name);
    await API.setConfigLine('profileTagline=' + tagline);
    cfg.profileName = name; cfg.profileTagline = tagline;
    applyProfile();
    toast('✅ Perfil guardado!');
  } catch(e) { toast('Erro ao guardar perfil.'); }
}

// ── Sync dados ────────────────────────────────────────────────────────────────
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
    res.messages.forEach(function(m) {
      if (!m.content) return;
      const lines  = m.content.split('\n');
      const titulo = lines[0] || '';
      const url    = lines[1] && lines[1].startsWith('http') ? lines[1] : '';
      const content= lines.find(l => !l.startsWith('http') && !l.startsWith('Tags:') && l !== lines[0]) || '';
      const tagsLine = lines.find(l => l.startsWith('Tags:'));
      const tags   = tagsLine ? tagsLine.replace('Tags:', '').trim() : '';
      vaultItems.push({ id: m.id, channelId, type, titulo, url, content, tags });
    });
    renderVault();
  } catch(e) {}
}

// ── Vault render ──────────────────────────────────────────────────────────────
function renderVault() {
  const container = document.getElementById('vault-grid');
  if (!container) return;
  const filtered = vaultItems.filter(function(item) {
    if (currentVaultFilter !== 'all' && item.type !== currentVaultFilter) return false;
    return true;
  });
  container.innerHTML = filtered.map(function(item) {
    return '<div class="vault-card" data-type="' + item.type + '">' +
      '<div class="vault-card-type">' + item.type + '</div>' +
      '<div class="vault-card-title">' + escHtml(item.titulo) + '</div>' +
      (item.url ? '<a class="vault-card-url" href="' + escHtml(item.url) + '" target="_blank">' + escHtml(item.url) + '</a>' : '') +
      (item.content ? '<div class="vault-card-content">' + escHtml(item.content) + '</div>' : '') +
      (item.tags ? '<div class="vault-card-tags">' + item.tags.split(',').map(t => '<span class="tag">' + escHtml(t.trim()) + '</span>').join('') + '</div>' : '') +
      '</div>';
  }).join('');
}

// ── Adicionar ao vault ────────────────────────────────────────────────────────
async function addVaultItem() {
  if (!isOwner) return;
  const titulo  = document.getElementById('add-titulo').value.trim();
  const url     = document.getElementById('add-url') ? document.getElementById('add-url').value.trim() : '';
  const content = document.getElementById('add-content').value.trim();
  const tags    = document.getElementById('add-tags').value.trim();
  const type    = currentVaultType;
  if (!titulo) { toast('O título é obrigatório.'); return; }

  const channelMap = { link: cfg.links, note: cfg.notes, file: cfg.files, idea: cfg.ideas, code: cfg.code };
  const channelId  = channelMap[type];
  if (!channelId) { toast('Canal não configurado.'); return; }

  let msg = titulo;
  if (url)     msg += '\n' + url;
  if (content) msg += '\n' + content;
  if (tags)    msg += '\nTags: ' + tags;

  try {
    const res = await API.sendToChannel(channelId, msg);
    if (res.ok) {
      toast('✅ Adicionado!');
      vaultItems.push({ id: res.id, channelId, type, titulo, url, content, tags });
      renderVault();
      closeAddModal();
    } else {
      toast('Erro ao adicionar.');
    }
  } catch(e) { toast('Erro: ' + e.message); }
}

// ── Slugs/shortcuts de UI ─────────────────────────────────────────────────────
function setVaultFilter(f) {
  currentVaultFilter = f;
  document.querySelectorAll('.vault-filter-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.filter === f);
  });
  renderVault();
}

function openAddModal(type) {
  currentVaultType = type || 'link';
  const m = document.getElementById('add-modal');
  if (m) m.style.display = 'flex';
}

function closeAddModal() {
  const m = document.getElementById('add-modal');
  if (m) m.style.display = 'none';
}

function updateStats() {
  const el = document.getElementById('stat-total');
  if (el) el.textContent = vaultItems.length;
}

function buildMarquee() {}

// ── Helpers ───────────────────────────────────────────────────────────────────
function toast(msg, duration) {
  let t = document.getElementById('toast');
  if (!t) {
    t = document.createElement('div');
    t.id = 'toast';
    t.style.cssText = 'position:fixed;bottom:20px;left:50%;transform:translateX(-50%);background:#222;color:#fff;padding:10px 20px;border-radius:8px;font-size:14px;z-index:9999;opacity:0;transition:opacity .3s';
    document.body.appendChild(t);
  }
  t.textContent = msg;
  t.style.opacity = '1';
  clearTimeout(t._hide);
  t._hide = setTimeout(() => t.style.opacity = '0', duration || 3000);
}

function escHtml(str) {
  return String(str || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}
