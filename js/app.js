// ─────────────────────────────────────────────
//  Kira Portfolio — app.js
//  Session-only: sessionStorage, no localStorage for sensitive data
// ─────────────────────────────────────────────

// ── SESSION STORE (cleared when tab closes) ───────────────────────────────────
const SS = {
  get: (k, fb) => { try { const v = sessionStorage.getItem(k); return v ? JSON.parse(v) : fb; } catch { return fb; } },
  set: (k, v) => { try { sessionStorage.setItem(k, JSON.stringify(v)); } catch {} },
  clear: ()   => { try { sessionStorage.clear(); } catch {} }
};

// Runtime state — lives only in memory during this session
let cfg            = {};   // loaded from Discord after login
let shorts         = [];   // loaded from Discord
let vaultItems     = [];   // loaded from Discord
let workerUrl      = '';
let authChId       = '';
let cfgChId        = '';
let profile        = { name: 'Kira', tagline: 'Short-form content, ideas, and a private vault — all in one place.' };
let currentVaultFilter = 'all';
let currentVaultType   = 'link';

// ── DISCORD API ───────────────────────────────────────────────────────────────
const DISCORD = {
  base() { return workerUrl.replace(/\/$/, ''); },

  async auth(username, password) {
    try {
      const r = await fetch(`${this.base()}/auth`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ channelId: authChId, username, password })
      });
      return await r.json();
    } catch (e) { return { ok: false, error: e.message }; }
  },

  async loadConfig() {
    try {
      const r = await fetch(`${this.base()}/config/load`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ channelId: cfgChId })
      });
      return await r.json();
    } catch (e) { return { ok: false, error: e.message }; }
  },

  async saveConfig(data) {
    try {
      const r = await fetch(`${this.base()}/config/save`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ channelId: cfgChId, config: data })
      });
      return await r.json();
    } catch (e) { return { ok: false, error: e.message }; }
  },

  async send(type, content) {
    const ch = { link: cfg.links, note: cfg.notes, file: cfg.files, idea: cfg.ideas }[type];
    if (!workerUrl || !ch) return false;
    try {
      const r = await fetch(`${this.base()}/channel/${ch}/message`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content })
      });
      const d = await r.json(); return d.ok === true;
    } catch { return false; }
  },

  async fetchMessages(channelId) {
    if (!workerUrl || !channelId) return [];
    try {
      const r = await fetch(`${this.base()}/channel/${channelId}/messages?limit=50`);
      const d = await r.json();
      return d.ok ? d.messages : [];
    } catch { return []; }
  },

  async test(channelId) {
    try {
      const r = await fetch(`${this.base()}/channel/${channelId}/test`);
      return await r.json();
    } catch (e) { return { ok: false, error: e.message }; }
  }
};

// ── LOGIN ─────────────────────────────────────────────────────────────────────
document.getElementById('btn-login').addEventListener('click', doLogin);
document.addEventListener('keydown', e => {
  if (e.key === 'Enter' && document.getElementById('login-screen').style.display !== 'none') doLogin();
});

async function doLogin() {
  const worker   = document.getElementById('login-worker').value.trim();
  const authCh   = document.getElementById('login-auth-ch').value.trim();
  const cfgCh    = document.getElementById('login-cfg-ch').value.trim();
  const username = document.getElementById('login-user').value.trim();
  const password = document.getElementById('login-pass').value.trim();
  const result   = document.getElementById('login-result');
  const btn      = document.getElementById('btn-login');

  if (!worker || !authCh || !cfgCh || !username || !password) {
    showLoginError('All fields are required.'); return;
  }

  btn.textContent = 'Verifying…'; btn.disabled = true;
  result.textContent = ''; result.className = 'login-result';

  // Step 1 — set worker URL so DISCORD.auth works
  workerUrl = worker;
  authChId  = authCh;
  cfgChId   = cfgCh;

  // Step 2 — verify credentials against #vault-auth
  const authRes = await DISCORD.auth(username, password);
  if (!authRes.ok) {
    btn.textContent = 'Enter'; btn.disabled = false;
    showLoginError('Invalid credentials.'); return;
  }

  result.textContent = 'Authenticated — loading config…';
  result.className = 'login-result ok';

  // Step 3 — load config from #vault-config
  const cfgRes = await DISCORD.loadConfig();
  if (cfgRes.ok && cfgRes.config) {
    cfg = cfgRes.config;
  } else {
    // First time — no config yet, start with empty
    cfg = {};
  }

  // Enter app
  document.getElementById('login-screen').style.display = 'none';
  document.getElementById('app').style.display = 'block';
  btn.textContent = 'Enter'; btn.disabled = false;

  applyProfile();
  loadSettingsForm();
  renderShorts(); renderFilterBar();
  syncFromDiscord();
  updateStats(); buildMarquee();
}

function showLoginError(msg) {
  const r = document.getElementById('login-result');
  r.textContent = msg; r.className = 'login-result err';
}

// ── LOGOUT ────────────────────────────────────────────────────────────────────
document.getElementById('btn-logout').addEventListener('click', () => {
  SS.clear();
  cfg = {}; shorts = []; vaultItems = []; workerUrl = ''; authChId = ''; cfgChId = '';
  document.getElementById('app').style.display = 'none';
  document.getElementById('login-screen').style.display = 'flex';
  // Clear login form
  ['login-worker','login-auth-ch','login-cfg-ch','login-user','login-pass'].forEach(id => {
    document.getElementById(id).value = '';
  });
  document.getElementById('login-result').textContent = '';
});

// ── SYNC FROM DISCORD ─────────────────────────────────────────────────────────
async function syncFromDiscord() {
  if (!cfg.links && !cfg.notes && !cfg.files && !cfg.ideas) return;
  document.getElementById('discord-label').textContent = 'Discord: syncing…';

  const types = [
    { key: 'links', type: 'link' },
    { key: 'notes', type: 'note' },
    { key: 'files', type: 'file' },
    { key: 'ideas', type: 'idea' }
  ];

  let synced = [];
  for (const { key, type } of types) {
    if (!cfg[key]) continue;
    const msgs = await DISCORD.fetchMessages(cfg[key]);
    synced = synced.concat(parseDiscordMessages(msgs, type));
  }

  vaultItems = synced;
  renderVault(); renderTagSidebar(); updateStats();
  document.getElementById('discord-label').textContent = 'Discord: connected';
}

function parseDiscordMessages(messages, type) {
  return messages
    .filter(m => m.content && m.content.includes(`[${type.toUpperCase()}]`))
    .map(m => {
      const lines = m.content.split('\n');
      const titleMatch = lines[0].match(/\*\*\[.*?\]\s(.+?)\*\*/);
      const title   = titleMatch ? titleMatch[1] : lines[0].replace(/[*]/g,'');
      const url     = lines.find(l => l.startsWith('http')) || '';
      const tagLine = lines.find(l => l.startsWith('Tags:'));
      const tags    = tagLine ? tagLine.replace('Tags: ','').split(', ').map(t=>t.trim()) : [];
      const content = lines.filter(l => !l.startsWith('**') && !l.startsWith('http') && !l.startsWith('Tags:') && l.trim()).join(' ').trim();
      return {
        id: m.id, type, title, url, content, tags,
        date: new Date(m.timestamp).toLocaleDateString('en-GB', { day:'2-digit', month:'short', year:'numeric' }),
        fromDiscord: true
      };
    });
}

// ── NAVIGATION ────────────────────────────────────────────────────────────────
function showPage(id) {
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.nav-links button').forEach(b => b.classList.toggle('active', b.dataset.page === id));
  document.getElementById('page-' + id).classList.add('active');
  document.querySelector('.nav-links').classList.remove('open');
  if (id === 'vault') syncFromDiscord();
}

document.querySelectorAll('.nav-links button[data-page]').forEach(btn => btn.addEventListener('click', () => showPage(btn.dataset.page)));
document.querySelectorAll('[data-goto]').forEach(btn => btn.addEventListener('click', () => showPage(btn.dataset.goto)));
document.querySelector('.nav-logo').addEventListener('click', () => showPage('home'));
document.getElementById('nav-hamburger').addEventListener('click', () => document.querySelector('.nav-links').classList.toggle('open'));

// ── PROFILE ───────────────────────────────────────────────────────────────────
function applyProfile() {
  const name = cfg.profileName || 'Kira';
  const tagline = cfg.profileTagline || 'Short-form content, ideas, and a private vault — all in one place.';
  document.querySelector('.nav-logo').innerHTML = name.charAt(0) + '<span>' + name.slice(1) + '</span>';
  const h1 = document.querySelector('.hero h1');
  if (h1) h1.innerHTML = name + '<br><em>creates.</em>';
  const sub = document.querySelector('.hero-sub');
  if (sub) sub.textContent = tagline;
  document.getElementById('cfg-name').value    = name;
  document.getElementById('cfg-tagline').value = tagline;
}

document.getElementById('btn-save-profile').addEventListener('click', async () => {
  cfg.profileName    = document.getElementById('cfg-name').value.trim() || 'Kira';
  cfg.profileTagline = document.getElementById('cfg-tagline').value.trim();
  applyProfile();
  await DISCORD.saveConfig(cfg);
  flashResult('connection-result', true, 'Profile saved to Discord.');
});

// ── SETTINGS ──────────────────────────────────────────────────────────────────
function loadSettingsForm() {
  if (cfg.worker)  document.getElementById('cfg-worker').value   = cfg.worker  || workerUrl;
  if (cfg.links)   document.getElementById('cfg-ch-links').value = cfg.links   || '';
  if (cfg.notes)   document.getElementById('cfg-ch-notes').value = cfg.notes   || '';
  if (cfg.files)   document.getElementById('cfg-ch-files').value = cfg.files   || '';
  if (cfg.ideas)   document.getElementById('cfg-ch-ideas').value = cfg.ideas   || '';
}

document.getElementById('btn-save-config').addEventListener('click', async () => {
  cfg.worker = document.getElementById('cfg-worker').value.trim();
  cfg.links  = document.getElementById('cfg-ch-links').value.trim();
  cfg.notes  = document.getElementById('cfg-ch-notes').value.trim();
  cfg.files  = document.getElementById('cfg-ch-files').value.trim();
  cfg.ideas  = document.getElementById('cfg-ch-ideas').value.trim();
  workerUrl  = cfg.worker || workerUrl;
  const res = await DISCORD.saveConfig(cfg);
  if (res && res.ok) flashResult('connection-result', true, 'Config saved to Discord.');
  else flashResult('connection-result', false, 'Failed to save. Check Worker URL.');
});

document.getElementById('btn-test-connection').addEventListener('click', async () => {
  const chId = document.getElementById('cfg-ch-links').value.trim() || document.getElementById('cfg-ch-notes').value.trim();
  if (!chId) { flashResult('connection-result', false, 'Enter at least one channel ID.'); return; }
  const el = document.getElementById('connection-result');
  el.textContent = 'Testing…'; el.className = 'connection-result'; el.style.display = 'block';
  const result = await DISCORD.test(chId);
  if (result.ok) flashResult('connection-result', true, `Connected! Channel: #${result.name}`);
  else flashResult('connection-result', false, `Error: ${result.error}`);
});

function flashResult(id, ok, msg) {
  const el = document.getElementById(id);
  if (!el) return;
  el.textContent = msg;
  el.className   = 'connection-result ' + (ok ? 'ok' : 'err');
  el.style.display = 'block';
  setTimeout(() => { el.style.display = 'none'; }, 4000);
}

// ── SHORTS ────────────────────────────────────────────────────────────────────
const THUMB_COLORS = ['#2a1a0e','#0e1a2a','#1a0e2a','#0e2a1a','#1a1a0e','#2a0e1a'];

function renderShorts(filter = 'all') {
  const grid  = document.getElementById('shorts-grid');
  const items = filter === 'all' ? shorts : shorts.filter(s => s.cat.toLowerCase() === filter.toLowerCase());
  if (!items.length) { grid.innerHTML = `<div class="short-empty">No shorts yet — add your first one.</div>`; return; }
  grid.innerHTML = items.map((s, i) => `
    <div class="short-card" ${s.url ? `onclick="window.open('${escHtml(s.url)}','_blank')"` : ''}>
      <div class="short-thumb" style="background:${THUMB_COLORS[i % THUMB_COLORS.length]}">
        <div class="thumb-gradient"></div>
        <div class="play-icon"><svg viewBox="0 0 16 16"><polygon points="3,2 13,8 3,14"/></svg></div>
        <div class="thumb-tag">${escHtml(s.cat)}</div>
      </div>
      <div class="short-info">
        <div class="short-title">${escHtml(s.title)}</div>
        <div class="short-meta">
          <span class="short-date">${escHtml(s.date)}</span>
          ${s.views ? `<span class="short-views">${escHtml(s.views)} views</span>` : ''}
        </div>
      </div>
    </div>`).join('');
}

function renderFilterBar() {
  const cats = [...new Set(shorts.map(s => s.cat))];
  const bar  = document.getElementById('filter-bar');
  bar.innerHTML = `<button class="filter-btn active" data-filter="all">All</button>` +
    cats.map(c => `<button class="filter-btn" data-filter="${escHtml(c)}">${escHtml(c)}</button>`).join('');
  bar.querySelectorAll('.filter-btn').forEach(btn => btn.addEventListener('click', () => {
    bar.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active'); renderShorts(btn.dataset.filter);
  }));
}

document.getElementById('btn-add-short').addEventListener('click', () => openModal('modal-short'));
document.getElementById('btn-confirm-short').addEventListener('click', async () => {
  const title = document.getElementById('short-title').value.trim();
  const url   = document.getElementById('short-url').value.trim();
  const cat   = document.getElementById('short-cat').value.trim() || 'Other';
  const views = document.getElementById('short-views').value.trim();
  if (!title) return;
  const short = { id: Date.now(), title, url, cat, views, date: new Date().toLocaleDateString('en-GB', { day:'2-digit', month:'short', year:'numeric' }) };
  const saving = document.getElementById('short-saving');
  if (cfg.notes) {
    saving.style.display = 'block';
    await DISCORD.send('note', [`📽️ **[SHORT] ${title}**`, `Category: ${cat}`, url||'', views?`Views: ${views}`:''].filter(Boolean).join('\n'));
    saving.style.display = 'none';
  }
  shorts.push(short);
  renderShorts(); renderFilterBar(); updateStats(); buildMarquee();
  closeModal('modal-short'); clearForm(['short-title','short-url','short-cat','short-views']);
});

// ── VAULT ─────────────────────────────────────────────────────────────────────
const TYPE_ICON = { link: '⊞', note: '≡', file: '◫', idea: '◇' };

function renderVault(items = null) {
  const all = items !== null ? items : (currentVaultFilter === 'all' ? vaultItems : vaultItems.filter(v => v.type === currentVaultFilter));
  const container = document.getElementById('vault-cards');
  if (!all.length) { container.innerHTML = `<div class="vault-empty">Nothing here yet.</div>`; return; }
  container.innerHTML = all.map(v => `
    <div class="vault-item" ${v.url ? `onclick="window.open('${escHtml(v.url)}','_blank')"` : ''}>
      <div class="vault-item-type">${TYPE_ICON[v.type]||'·'} ${escHtml(v.type)}</div>
      <div class="vault-item-title">${escHtml(v.title)}</div>
      ${v.content ? `<div class="vault-item-preview">${escHtml(v.content.substring(0,90))}${v.content.length>90?'…':''}</div>` : ''}
      ${v.url ? `<div class="vault-item-url">${escHtml(v.url.substring(0,50))}${v.url.length>50?'…':''}</div>` : ''}
      <div class="vault-item-footer">
        <div style="display:flex;gap:0.35rem;flex-wrap:wrap;">${(v.tags||[]).map(t=>`<span class="vault-tag">${escHtml(t)}</span>`).join('')}</div>
        <span class="vault-date">${escHtml(v.date)}</span>
      </div>
    </div>`).join('');
}

function renderTagSidebar() {
  const tags = [...new Set(vaultItems.flatMap(v => v.tags||[]))];
  const sidebar = document.getElementById('tag-sidebar');
  if (!tags.length) { sidebar.innerHTML = ''; return; }
  sidebar.innerHTML = `<div class="vault-sidebar-title" style="padding-top:0">Tags</div>` +
    tags.map(t => `<div class="vault-cat" data-tag="${escHtml(t)}"><span class="vault-cat-icon">◈</span> ${escHtml(t)}</div>`).join('');
  sidebar.querySelectorAll('[data-tag]').forEach(el => el.addEventListener('click', () => {
    document.querySelectorAll('.vault-cat').forEach(b => b.classList.remove('active'));
    el.classList.add('active');
    renderVault(vaultItems.filter(v => (v.tags||[]).includes(el.dataset.tag)));
  }));
}

document.querySelectorAll('.vault-cat[data-vault-filter]').forEach(el => el.addEventListener('click', () => {
  document.querySelectorAll('.vault-cat').forEach(b => b.classList.remove('active'));
  el.classList.add('active'); currentVaultFilter = el.dataset.vaultFilter; renderVault();
}));

document.getElementById('vault-search-input').addEventListener('input', e => {
  const q = e.target.value.trim().toLowerCase();
  if (!q) { renderVault(); return; }
  renderVault(vaultItems.filter(v => v.title.toLowerCase().includes(q) || (v.content||'').toLowerCase().includes(q) || (v.tags||[]).some(t => t.toLowerCase().includes(q))));
});

document.getElementById('btn-add-vault').addEventListener('click', () => openModal('modal-vault'));
document.querySelectorAll('.type-opt').forEach(btn => btn.addEventListener('click', () => {
  currentVaultType = btn.dataset.type;
  document.querySelectorAll('.type-opt').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  document.getElementById('vault-url-group').style.display = (currentVaultType === 'link' || currentVaultType === 'file') ? 'block' : 'none';
}));

document.getElementById('btn-confirm-vault').addEventListener('click', async () => {
  const title   = document.getElementById('vault-title').value.trim();
  const url     = document.getElementById('vault-url').value.trim();
  const content = document.getElementById('vault-content').value.trim();
  const tags    = document.getElementById('vault-tags').value.trim().split(',').map(t => t.trim()).filter(Boolean);
  if (!title) return;
  const item = { id: Date.now(), type: currentVaultType, title, url, content, tags, date: new Date().toLocaleDateString('en-GB', { day:'2-digit', month:'short', year:'numeric' }) };
  const saving = document.getElementById('vault-saving');
  saving.style.display = 'block';
  const emoji = { link:'🔗', note:'📝', file:'📁', idea:'💡' }[item.type];
  let msg = `${emoji} **[${item.type.toUpperCase()}] ${title}**`;
  if (url)         msg += `\n${url}`;
  if (content)     msg += `\n${content}`;
  if (tags.length) msg += `\nTags: ${tags.join(', ')}`;
  await DISCORD.send(item.type, msg);
  saving.style.display = 'none';
  vaultItems.push(item);
  renderVault(); renderTagSidebar(); updateStats();
  closeModal('modal-vault'); clearForm(['vault-title','vault-url','vault-content','vault-tags']);
});

// ── STATS & MARQUEE ───────────────────────────────────────────────────────────
function updateStats() {
  document.getElementById('stat-shorts').textContent = shorts.length;
  document.getElementById('stat-items').textContent  = vaultItems.length;
  document.getElementById('stat-tags').textContent   = new Set(vaultItems.flatMap(v => v.tags||[])).size;
}
function buildMarquee() {
  const cats  = shorts.length ? [...new Set(shorts.map(s=>s.cat))] : ['Shorts','Links','Notes','Ideas','Files'];
  const items = [...cats,...cats].map(c=>`<span class="marquee-item"><span>✦</span>${escHtml(c)}</span>`).join('');
  document.getElementById('marquee-inner').innerHTML = items + items;
}

// ── MODALS ────────────────────────────────────────────────────────────────────
function openModal(id)  { document.getElementById(id).classList.add('open'); }
function closeModal(id) { document.getElementById(id).classList.remove('open'); }
document.querySelectorAll('[data-close]').forEach(btn => btn.addEventListener('click', () => closeModal(btn.dataset.close)));
document.querySelectorAll('.modal-backdrop').forEach(b => b.addEventListener('click', e => { if (e.target === b) closeModal(b.id); }));
document.addEventListener('keydown', e => { if (e.key === 'Escape') document.querySelectorAll('.modal-backdrop.open').forEach(m => closeModal(m.id)); });

// ── UTILS ─────────────────────────────────────────────────────────────────────
function escHtml(s) { return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }
function clearForm(ids) { ids.forEach(id => { const el=document.getElementById(id); if(el) el.value=''; }); }
