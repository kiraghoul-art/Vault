// ─────────────────────────────────────────────
//  Kira Portfolio — app.js
// ─────────────────────────────────────────────

const LS = {
  get: (k, fb) => { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : fb; } catch { return fb; } },
  set: (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} },
};

let shorts         = LS.get('kira_shorts', []);
let vaultItems     = LS.get('kira_vault', []);
let cfg            = LS.get('kira_cfg', {});
let profile        = LS.get('kira_profile', { name: 'Kira', tagline: 'Short-form content, ideas, and a private vault — all in one place.' });
let currentVaultFilter = 'all';
let currentVaultType   = 'link';

// ── CRYPTO HELPERS (password-based encrypt/decrypt) ──────────────────────────
async function deriveKey(password) {
  const enc = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey("raw", enc.encode(password), "PBKDF2", false, ["deriveKey"]);
  return crypto.subtle.deriveKey(
    { name: "PBKDF2", salt: enc.encode("kira-vault-salt"), iterations: 100000, hash: "SHA-256" },
    keyMaterial, { name: "AES-GCM", length: 256 }, false, ["encrypt", "decrypt"]
  );
}
async function encryptConfig(data, password) {
  const key = await deriveKey(password);
  const iv  = crypto.getRandomValues(new Uint8Array(12));
  const enc = new TextEncoder();
  const encrypted = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, enc.encode(JSON.stringify(data)));
  const combined = new Uint8Array(iv.byteLength + encrypted.byteLength);
  combined.set(iv, 0);
  combined.set(new Uint8Array(encrypted), iv.byteLength);
  return btoa(String.fromCharCode(...combined));
}
async function decryptConfig(payload, password) {
  const key = await deriveKey(password);
  const combined = Uint8Array.from(atob(payload), c => c.charCodeAt(0));
  const iv  = combined.slice(0, 12);
  const data = combined.slice(12);
  const dec = await crypto.subtle.decrypt({ name: "AES-GCM", iv }, key, data);
  return JSON.parse(new TextDecoder().decode(dec));
}

// ── DISCORD API ───────────────────────────────────────────────────────────────
const DISCORD = {
  base() { return (cfg.worker || '').replace(/\/$/, ''); },

  async test(channelId) {
    if (!cfg.worker) return { ok: false, error: 'Worker URL missing' };
    try {
      const r = await fetch(`${this.base()}/channel/${channelId}/test`);
      return await r.json();
    } catch (e) { return { ok: false, error: e.message }; }
  },

  async send(type, content) {
    const ch = { link: cfg.links, note: cfg.notes, file: cfg.files, idea: cfg.ideas }[type];
    if (!cfg.worker || !ch) return false;
    try {
      const r = await fetch(`${this.base()}/channel/${ch}/message`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content })
      });
      const d = await r.json(); return d.ok === true;
    } catch { return false; }
  },

  async fetchMessages(channelId) {
    if (!cfg.worker || !channelId) return [];
    try {
      const r = await fetch(`${this.base()}/channel/${channelId}/messages?limit=50`);
      const d = await r.json();
      return d.ok ? d.messages : [];
    } catch { return []; }
  },

  async saveConfig(configChannelId, data, password) {
    if (!cfg.worker) return false;
    try {
      const payload = await encryptConfig(data, password);
      const r = await fetch(`${this.base()}/config/save`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ channelId: configChannelId, payload })
      });
      const d = await r.json(); return d.ok === true;
    } catch { return false; }
  },

  async loadConfig(configChannelId, password) {
    if (!cfg.worker) return null;
    try {
      const r = await fetch(`${this.base()}/config/load`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ channelId: configChannelId, password })
      });
      const d = await r.json();
      if (!d.ok) return null;
      return await decryptConfig(d.payload, password);
    } catch { return null; }
  }
};

// ── PARSE DISCORD MESSAGES INTO VAULT ITEMS ───────────────────────────────────
function parseDiscordMessages(messages, type) {
  return messages
    .filter(m => m.content && m.content.includes(`[${type.toUpperCase()}]`))
    .map(m => {
      const lines = m.content.split('\n');
      const titleMatch = lines[0].match(/\*\*\[.*?\]\s(.+?)\*\*/);
      const title = titleMatch ? titleMatch[1] : lines[0];
      const url   = lines.find(l => l.startsWith('http')) || '';
      const tags  = lines.find(l => l.startsWith('Tags:')) ? lines.find(l => l.startsWith('Tags:')).replace('Tags: ','').split(', ') : [];
      const content = lines.filter(l => !l.startsWith('**') && !l.startsWith('http') && !l.startsWith('Tags:')).join(' ').trim();
      return {
        id: m.id, type, title, url, content, tags,
        date: new Date(m.timestamp).toLocaleDateString('en-GB', { day:'2-digit', month:'short', year:'numeric' }),
        fromDiscord: true
      };
    });
}

// ── SYNC FROM DISCORD ─────────────────────────────────────────────────────────
async function syncFromDiscord() {
  if (!cfg.worker || (!cfg.links && !cfg.notes && !cfg.files && !cfg.ideas)) return;

  showSyncBadge(true);
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

  if (synced.length > 0) {
    // Merge: keep local items not in Discord, add Discord items
    const localOnly = vaultItems.filter(v => !v.fromDiscord);
    vaultItems = [...synced, ...localOnly];
    LS.set('kira_vault', vaultItems);
    renderVault(); renderTagSidebar(); updateStats();
  }
  showSyncBadge(false);
}

function showSyncBadge(loading) {
  const label = document.getElementById('discord-label');
  if (label) label.textContent = loading ? 'Discord: syncing…' : 'Discord: connected';
}

// ── NAVIGATION ────────────────────────────────────────────────────────────────
function showPage(id) {
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.nav-links button').forEach(b => b.classList.toggle('active', b.dataset.page === id));
  document.getElementById('page-' + id).classList.add('active');
  document.querySelector('.nav-links').classList.remove('open');
  if (id === 'settings') loadSettingsForm();
  if (id === 'vault') syncFromDiscord();
}

document.querySelectorAll('.nav-links button[data-page]').forEach(btn => btn.addEventListener('click', () => showPage(btn.dataset.page)));
document.querySelectorAll('[data-goto]').forEach(btn => btn.addEventListener('click', () => showPage(btn.dataset.goto)));
document.querySelector('.nav-logo').addEventListener('click', () => showPage('home'));
document.getElementById('nav-hamburger').addEventListener('click', () => document.querySelector('.nav-links').classList.toggle('open'));

// ── PROFILE ───────────────────────────────────────────────────────────────────
function applyProfile() {
  if (profile.name) {
    document.querySelector('.nav-logo').innerHTML = profile.name.charAt(0) + '<span>' + profile.name.slice(1) + '</span>';
    const h1 = document.querySelector('.hero h1');
    if (h1) h1.innerHTML = profile.name + '<br><em>creates.</em>';
  }
  if (profile.tagline) {
    const sub = document.querySelector('.hero-sub');
    if (sub) sub.textContent = profile.tagline;
  }
}
document.getElementById('btn-save-profile').addEventListener('click', () => {
  profile.name    = document.getElementById('cfg-name').value.trim() || 'Kira';
  profile.tagline = document.getElementById('cfg-tagline').value.trim();
  LS.set('kira_profile', profile);
  applyProfile();
  flashResult('connection-result', true, 'Profile saved.');
});

// ── SETTINGS ──────────────────────────────────────────────────────────────────
function loadSettingsForm() {
  if (cfg.worker)  document.getElementById('cfg-worker').value   = cfg.worker;
  if (cfg.links)   document.getElementById('cfg-ch-links').value = cfg.links;
  if (cfg.notes)   document.getElementById('cfg-ch-notes').value = cfg.notes;
  if (cfg.files)   document.getElementById('cfg-ch-files').value = cfg.files;
  if (cfg.ideas)   document.getElementById('cfg-ch-ideas').value = cfg.ideas;
  if (cfg.configCh) document.getElementById('cfg-ch-config').value = cfg.configCh;
  document.getElementById('cfg-name').value    = profile.name    || '';
  document.getElementById('cfg-tagline').value = profile.tagline || '';
}

document.getElementById('btn-save-config').addEventListener('click', () => {
  cfg = {
    worker:   document.getElementById('cfg-worker').value.trim(),
    links:    document.getElementById('cfg-ch-links').value.trim(),
    notes:    document.getElementById('cfg-ch-notes').value.trim(),
    files:    document.getElementById('cfg-ch-files').value.trim(),
    ideas:    document.getElementById('cfg-ch-ideas').value.trim(),
    configCh: document.getElementById('cfg-ch-config').value.trim(),
  };
  LS.set('kira_cfg', cfg);
  updateDiscordStatus();
  flashResult('connection-result', true, 'Configuration saved locally.');
});

document.getElementById('btn-test-connection').addEventListener('click', async () => {
  const worker = document.getElementById('cfg-worker').value.trim();
  const chId   = document.getElementById('cfg-ch-links').value.trim() || document.getElementById('cfg-ch-notes').value.trim();
  if (!worker || !chId) { flashResult('connection-result', false, 'Enter Worker URL and at least one channel ID first.'); return; }
  const el = document.getElementById('connection-result');
  el.textContent = 'Testing…'; el.className = 'connection-result'; el.style.display = 'block';
  const savedWorker = cfg.worker; cfg.worker = worker;
  const result = await DISCORD.test(chId);
  cfg.worker = savedWorker;
  if (result.ok) { flashResult('connection-result', true, `Connected! Channel: #${result.name}`); updateDiscordStatus(true); }
  else { flashResult('connection-result', false, `Error: ${result.error}`); }
});

// ── CLOUD SAVE / LOAD CONFIG ──────────────────────────────────────────────────
document.getElementById('btn-cloud-save').addEventListener('click', async () => {
  const chId     = document.getElementById('cfg-ch-config').value.trim();
  const password = document.getElementById('cfg-password').value.trim();
  if (!chId || !password) { flashResult('cloud-result', false, 'Enter Config Channel ID and password first.'); return; }
  flashResult('cloud-result', null, 'Saving to Discord…');
  cfg.configCh = chId;
  LS.set('kira_cfg', cfg);
  const ok = await DISCORD.saveConfig(chId, cfg, password);
  if (ok) flashResult('cloud-result', true, 'Config saved to Discord! Use your password on any device.');
  else    flashResult('cloud-result', false, 'Failed to save. Check Worker URL and channel ID.');
});

document.getElementById('btn-cloud-load').addEventListener('click', async () => {
  const chId     = document.getElementById('cfg-ch-config').value.trim();
  const password = document.getElementById('cfg-password').value.trim();
  if (!chId || !password) { flashResult('cloud-result', false, 'Enter Config Channel ID and password.'); return; }
  flashResult('cloud-result', null, 'Loading from Discord…');
  const loaded = await DISCORD.loadConfig(chId, password);
  if (loaded) {
    cfg = loaded;
    LS.set('kira_cfg', cfg);
    loadSettingsForm();
    updateDiscordStatus();
    flashResult('cloud-result', true, 'Config loaded! All settings restored.');
  } else {
    flashResult('cloud-result', false, 'Wrong password or no config found.');
  }
});

function flashResult(id, ok, msg) {
  const el = document.getElementById(id);
  if (!el) return;
  el.textContent = msg;
  el.className   = 'connection-result ' + (ok === true ? 'ok' : ok === false ? 'err' : '');
  el.style.display = 'block';
  if (ok !== null) setTimeout(() => { el.style.display = 'none'; }, 4000);
}

function updateDiscordStatus(connected) {
  const has = cfg.worker && (cfg.links || cfg.notes || cfg.files || cfg.ideas);
  document.getElementById('discord-dot').classList.toggle('off', !connected && !has);
  document.getElementById('discord-label').textContent = (connected || has) ? 'Discord: connected' : 'Discord: not configured';
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
  if (cfg.worker && cfg.notes) {
    saving.style.display = 'block';
    await DISCORD.send('note', [`📽️ **[SHORT] ${title}**`, `Category: ${cat}`, url ? `URL: ${url}` : '', views ? `Views: ${views}` : ''].filter(Boolean).join('\n'));
    saving.style.display = 'none';
  }
  shorts.push(short); LS.set('kira_shorts', shorts);
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
      <div class="vault-item-type">${TYPE_ICON[v.type] || '·'} ${escHtml(v.type)}</div>
      <div class="vault-item-title">${escHtml(v.title)}</div>
      ${v.content ? `<div class="vault-item-preview">${escHtml(v.content.substring(0,90))}${v.content.length > 90 ? '…' : ''}</div>` : ''}
      ${v.url ? `<div class="vault-item-url">${escHtml(v.url.substring(0,50))}${v.url.length > 50 ? '…' : ''}</div>` : ''}
      <div class="vault-item-footer">
        <div style="display:flex;gap:0.35rem;flex-wrap:wrap;">${(v.tags||[]).map(t => `<span class="vault-tag">${escHtml(t)}</span>`).join('')}</div>
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
  if (cfg.worker) {
    saving.style.display = 'block';
    const emoji = { link:'🔗', note:'📝', file:'📁', idea:'💡' }[item.type];
    let msg = `${emoji} **[${item.type.toUpperCase()}] ${title}**`;
    if (url)         msg += `\n${url}`;
    if (content)     msg += `\n${content}`;
    if (tags.length) msg += `\nTags: ${tags.join(', ')}`;
    await DISCORD.send(item.type, msg);
    saving.style.display = 'none';
  }
  vaultItems.push(item); LS.set('kira_vault', vaultItems);
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
  const cats  = shorts.length ? [...new Set(shorts.map(s => s.cat))] : ['Shorts','Links','Notes','Ideas','Files'];
  const items = [...cats,...cats].map(c => `<span class="marquee-item"><span>✦</span>${escHtml(c)}</span>`).join('');
  document.getElementById('marquee-inner').innerHTML = items + items;
}

// ── MODALS ────────────────────────────────────────────────────────────────────
function openModal(id)  { document.getElementById(id).classList.add('open'); }
function closeModal(id) { document.getElementById(id).classList.remove('open'); }
document.querySelectorAll('[data-close]').forEach(btn => btn.addEventListener('click', () => closeModal(btn.dataset.close)));
document.querySelectorAll('.modal-backdrop').forEach(b => b.addEventListener('click', e => { if (e.target === b) closeModal(b.id); }));
document.addEventListener('keydown', e => { if (e.key === 'Escape') document.querySelectorAll('.modal-backdrop.open').forEach(m => closeModal(m.id)); });

// ── UTILS ─────────────────────────────────────────────────────────────────────
function escHtml(str) { return String(str||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }
function clearForm(ids) { ids.forEach(id => { const el = document.getElementById(id); if (el) el.value = ''; }); }

// ── INIT ──────────────────────────────────────────────────────────────────────
applyProfile();
renderShorts(); renderFilterBar();
renderVault();  renderTagSidebar();
updateStats();  buildMarquee();
updateDiscordStatus();
