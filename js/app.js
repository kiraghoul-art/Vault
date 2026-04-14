// Kira Portfolio — app.js
// Login: username + password only. Worker URL comes from #vault-config.
// Session only — tab closes = everything gone.

const WORKER = 'https://kira-discord-proxy.ghoullkira.workers.dev';

let cfg = {};
let shorts = [];
let vaultItems = [];
let currentVaultFilter = 'all';
let currentVaultType = 'link';

// ── DISCORD ───────────────────────────────────────────────────────────────────
const DISCORD = {
  async post(path, data) {
    const r = await fetch(WORKER + path, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    });
    return r.json();
  },
  async get(path) {
    const r = await fetch(WORKER + path);
    return r.json();
  },
  async send(type, content) {
    const ch = { link: cfg.links, note: cfg.notes, file: cfg.files, idea: cfg.ideas, code: cfg.code, bg: cfg.bg }[type];
    if (!ch) return false;
    try { const d = await this.post('/channel/' + ch + '/message', { content }); return d.ok; }
    catch { return false; }
  },
  async fetchMessages(channelId) {
    try { const d = await this.get('/channel/' + channelId + '/messages?limit=50'); return d.ok ? d.messages : []; }
    catch { return []; }
  }
};

// ── LOGIN ─────────────────────────────────────────────────────────────────────
document.getElementById('btn-login').addEventListener('click', doLogin);
['login-user', 'login-pass'].forEach(function(id) {
  document.getElementById(id).addEventListener('keydown', function(e) { if (e.key === 'Enter') doLogin(); });
});

async function doLogin() {
  // ── DEV SKIP — remove before production ──
  cfg = {
    links:  '1493193077765181550',
    notes:  '1493193123336028170',
    files:  '1493193181544845454',
    ideas:  '1493193239551934515',
    code:   '1493563889701486612',
    bg:     '1493580916055085147',
  };
  enterApp();
  return;
  // ── END DEV SKIP ──

  const username = document.getElementById('login-user').value.trim();
  const password = document.getElementById('login-pass').value.trim();
  const btn      = document.getElementById('btn-login');

  if (!username || !password) { showLoginMsg(false, 'Thou must provide thy name and seal.'); return; }

  btn.textContent = 'Verifying…'; btn.disabled = true;

  let res;
  try {
    res = await DISCORD.post('/auth', { username, password });
  } catch (e) {
    btn.textContent = 'Enter'; btn.disabled = false;
    showLoginMsg(false, 'The courier cannot be reached. Try again.'); return;
  }

  btn.textContent = 'Enter'; btn.disabled = false;

  if (!res.ok) { showLoginMsg(false, 'Thy identity is unknown to the Keep.'); return; }

  if (res.firstTime || !res.config) {
    document.getElementById('login-screen').style.display = 'none';
    document.getElementById('setup-screen').style.display = 'flex';
    return;
  }

  cfg = res.config;
  enterApp();
}

function showLoginMsg(ok, msg) {
  const el = document.getElementById('login-result');
  el.textContent = msg;
  el.className = 'login-result ' + (ok ? 'ok' : 'err');
}

// ── FIRST TIME SETUP ──────────────────────────────────────────────────────────
document.getElementById('btn-setup-save').addEventListener('click', async () => {
  const links = document.getElementById('setup-links').value.trim();
  const notes = document.getElementById('setup-notes').value.trim();
  const files = document.getElementById('setup-files').value.trim();
  const ideas = document.getElementById('setup-ideas').value.trim();
  if (!links || !notes || !files || !ideas) { showMsg('setup-result', false, 'All chamber IDs must be provided.'); return; }
  const btn = document.getElementById('btn-setup-save');
  btn.textContent = 'Saving…'; btn.disabled = true;
  try {
    const res = await DISCORD.post('/config/save', { config: { links, notes, files, ideas } });
    if (res.ok) { cfg = { links, notes, files, ideas }; document.getElementById('setup-screen').style.display = 'none'; enterApp(); }
    else showMsg('setup-result', false, 'Failed to save. Check channel IDs.');
  } catch (e) { showMsg('setup-result', false, 'Error: ' + e.message); }
  btn.textContent = 'Save & Enter'; btn.disabled = false;
});

// ── ENTER APP ─────────────────────────────────────────────────────────────────
function enterApp() {
  document.getElementById('login-screen').style.display = 'none';
  document.getElementById('setup-screen').style.display = 'none';
  document.getElementById('app').style.display = 'block';
  applyProfile();
  loadSettingsForm();
  fetchBgImage();
  renderShorts(); renderFilterBar();
  syncFromDiscord();
  updateStats();
}

// ── BACKGROUND IMAGE ──────────────────────────────────────────────────────────
async function fetchBgImage() {
  if (!cfg.bg) return;
  try {
    const msgs = await DISCORD.fetchMessages(cfg.bg);
    if (!msgs || !msgs.length) return;
    // Procura a última mensagem com URL de imagem no conteúdo
    for (let i = 0; i < msgs.length; i++) {
      const m = msgs[i];
      if (m.content) {
        const match = m.content.match(/https?:\/\/\S+/);
        if (match) { applyBgImage(match[0]); return; }
      }
      // Ou attachment
      if (m.attachments && m.attachments.length > 0) {
        const att = m.attachments[0];
        if (att.url) { applyBgImage(att.url); return; }
      }
    }
  } catch (e) {
    console.warn('fetchBgImage failed:', e);
  }
}

function applyBgImage(url) {
  const bgImg = document.querySelector('.bg-img');
  if (bgImg) {
    bgImg.style.backgroundImage = 'url(' + url + ')';
    bgImg.style.backgroundSize = 'cover';
    bgImg.style.backgroundPosition = 'center center';
    bgImg.style.backgroundRepeat = 'no-repeat';
    bgImg.style.backgroundAttachment = 'scroll';
  }
  document.documentElement.style.setProperty('--bg-image', 'url(' + url + ')');
}

// ── LOGOUT ────────────────────────────────────────────────────────────────────
document.getElementById('btn-logout').addEventListener('click', () => {
  cfg = {}; shorts = []; vaultItems = [];
  document.getElementById('app').style.display = 'none';
  document.getElementById('login-screen').style.display = 'flex';
  document.getElementById('login-user').value = '';
  document.getElementById('login-pass').value = '';
  document.getElementById('login-result').textContent = '';
  document.getElementById('login-result').className = 'login-result';
});

// ── SYNC FROM DISCORD ─────────────────────────────────────────────────────────
async function syncFromDiscord() {
  if (!cfg.links && !cfg.notes && !cfg.files && !cfg.ideas) return;
  document.getElementById('discord-label').textContent = 'Consulting the courier…';
  const types = [
    { key: 'links', type: 'link' }, { key: 'notes', type: 'note' },
    { key: 'files', type: 'file' }, { key: 'ideas', type: 'idea' }
  ];
  let synced = [];
  for (const { key, type } of types) {
    if (!cfg[key]) continue;
    const msgs = await DISCORD.fetchMessages(cfg[key]);
    synced = synced.concat(parseMessages(msgs, type));
  }
  vaultItems = synced;
  renderVault(); renderTagSidebar(); updateStats();
  document.getElementById('discord-label').textContent = 'Discord courier: ready';
}

function parseMessages(messages, type) {
  return messages
    .filter(m => m.content && (m.content.includes('[' + type.toUpperCase() + ']') || (type==='code' && m.content.includes('[CODE]'))))
    .map(m => {
      const lines   = m.content.split('\n');
      const tm      = lines[0].match(/\*\*\[.*?\]\s(.+?)\*\*/);
      const title   = tm ? tm[1] : lines[0].replace(/\*/g, '');
      const url     = lines.find(l => l.startsWith('http')) || '';
      const tagLine = lines.find(l => l.startsWith('Tags:'));
      const tags    = tagLine ? tagLine.replace('Tags: ', '').split(', ').map(t => t.trim()) : [];
      const content = lines.filter(l => !l.startsWith('**') && !l.startsWith('http') && !l.startsWith('Tags:') && l.trim()).join(' ').trim();
      return { id: m.id, type, title, url, content, tags, date: new Date(m.timestamp).toLocaleDateString('en-GB', { day:'2-digit', month:'short', year:'numeric' }), fromDiscord: true };
    });
}

// ── NAVIGATION ────────────────────────────────────────────────────────────────
function showPage(id) {
  document.querySelectorAll('.page').forEach(p => { p.classList.remove('active'); });
  document.querySelectorAll('.nav-links button').forEach(b => b.classList.toggle('active', b.dataset.page === id));
  const pg = document.getElementById('page-' + id);
  if (pg) pg.classList.add('active');
  document.querySelector('.nav-links').classList.remove('open');
  if (id === 'vault') syncFromDiscord();
}
document.querySelectorAll('.nav-links button[data-page]').forEach(b => b.addEventListener('click', () => showPage(b.dataset.page)));
document.querySelectorAll('[data-goto]').forEach(b => b.addEventListener('click', () => showPage(b.dataset.goto)));
document.getElementById('nav-logo').addEventListener('click', () => showPage('home'));
document.getElementById('nav-hamburger').addEventListener('click', () => document.querySelector('.nav-links').classList.toggle('open'));

// ── PROFILE ───────────────────────────────────────────────────────────────────
function applyProfile() {
  const name    = cfg.profileName    || 'Kira';
  const tagline = cfg.profileTagline || 'Short-form content, ideas, and a private vault — all in one place.';
  const navLogo = document.getElementById('nav-logo');
  if (navLogo) navLogo.innerHTML = name.charAt(0) + '<span>' + name.slice(1) + '</span>';
  const heroTitle = document.getElementById('hero-title');
  const taglineEl = document.getElementById('hero-tagline');
  if (heroTitle) heroTitle.innerHTML = name + '<em id="hero-sub-em">' + (cfg.profileTagline || 'creates.') + '</em>';
  if (taglineEl) taglineEl.textContent = tagline;
}
document.getElementById('btn-save-profile').addEventListener('click', async () => {
  cfg.profileName    = document.getElementById('cfg-name').value.trim() || 'Kira';
  cfg.profileTagline = document.getElementById('cfg-tagline').value.trim();
  const bgUrlEl = document.getElementById('cfg-bg-url');
  if (bgUrlEl && bgUrlEl.value.trim()) {
    const newUrl = bgUrlEl.value.trim();
    // Apaga mensagens antigas do canal bg e posta o novo URL
    if (cfg.bg) {
      try {
        const old = await DISCORD.fetchMessages(cfg.bg);
        for (const m of old) {
          await DISCORD.post('/channel/' + cfg.bg + '/delete/' + m.id, {});
        }
      } catch(e) {}
      await DISCORD.send('bg', newUrl);
    }
    applyBgImage(newUrl);
    bgUrlEl.value = '';
  }
  applyProfile();
  const res = await DISCORD.post('/config/save', { config: cfg });
  showMsg('profile-result', res.ok, res.ok ? 'Profile saved.' : 'Failed to save.');
});

// ── SETTINGS ──────────────────────────────────────────────────────────────────
function loadSettingsForm() {
  document.getElementById('cfg-ch-links').value = cfg.links || '';
  document.getElementById('cfg-ch-notes').value = cfg.notes || '';
  document.getElementById('cfg-ch-files').value = cfg.files || '';
  document.getElementById('cfg-ch-ideas').value = cfg.ideas || '';
  if(document.getElementById('cfg-ch-code')) document.getElementById('cfg-ch-code').value = cfg.code || '';
  if(document.getElementById('cfg-ch-bg')) document.getElementById('cfg-ch-bg').value = cfg.bg || '';
  document.getElementById('cfg-name').value     = cfg.profileName    || 'Kira';
  document.getElementById('cfg-tagline').value  = cfg.profileTagline || '';
  if(document.getElementById('cfg-bg-url')) document.getElementById('cfg-bg-url').value = cfg.bgUrl || '';
}
document.getElementById('btn-save-config').addEventListener('click', async () => {
  cfg.links = document.getElementById('cfg-ch-links').value.trim();
  cfg.notes = document.getElementById('cfg-ch-notes').value.trim();
  cfg.files = document.getElementById('cfg-ch-files').value.trim();
  cfg.ideas = document.getElementById('cfg-ch-ideas').value.trim();
  cfg.code  = document.getElementById('cfg-ch-code').value.trim();
  const bgEl = document.getElementById('cfg-ch-bg');
  if (bgEl) cfg.bg = bgEl.value.trim();
  const res = await DISCORD.post('/config/save', { config: cfg });
  showMsg('connection-result', res.ok, res.ok ? 'Saved to Discord.' : 'Failed to save.');
});
document.getElementById('btn-test-connection').addEventListener('click', async () => {
  const chId = document.getElementById('cfg-ch-links').value.trim() || document.getElementById('cfg-ch-notes').value.trim();
  if (!chId) { showMsg('connection-result', false, 'Enter at least one channel ID.'); return; }
  const el = document.getElementById('connection-result');
  el.textContent = 'Testing…'; el.className = 'connection-result'; el.style.display = 'block';
  try {
    const res = await DISCORD.get('/channel/' + chId + '/test');
    showMsg('connection-result', res.ok, res.ok ? 'Connected! #' + res.name : 'Error: ' + res.error);
  } catch (e) { showMsg('connection-result', false, 'Error: ' + e.message); }
});

// ── SHORTS ────────────────────────────────────────────────────────────────────
const THUMB_COLORS = ['#2a1a0e','#0e1a2a','#1a0e2a','#0e2a1a','#1a1a0e','#2a0e1a'];
function renderShorts(filter) {
  filter = filter || 'all';
  const grid  = document.getElementById('shorts-grid');
  const items = filter === 'all' ? shorts : shorts.filter(s => s.cat.toLowerCase() === filter.toLowerCase());
  if (!items.length) { grid.innerHTML = '<div class="short-empty">No shorts yet.</div>'; return; }
  grid.innerHTML = items.map((s, i) => '<div class="short-card"' + (s.url ? ' onclick="window.open(\'' + esc(s.url) + '\',\'_blank\')"' : '') + '><div class="short-thumb" style="background:' + THUMB_COLORS[i % THUMB_COLORS.length] + '"><div class="thumb-gradient"></div><div class="play-icon"><svg viewBox="0 0 16 16"><polygon points="3,2 13,8 3,14"/></svg></div><div class="thumb-tag">' + esc(s.cat) + '</div></div><div class="short-info"><div class="short-title">' + esc(s.title) + '</div><div class="short-meta"><span class="short-date">' + esc(s.date) + '</span>' + (s.views ? '<span class="short-views">' + esc(s.views) + ' views</span>' : '') + '</div></div></div>').join('');
}
function renderFilterBar() {
  const cats = [...new Set(shorts.map(s => s.cat))];
  const bar  = document.getElementById('filter-bar');
  bar.innerHTML = '<button class="filter-btn active" data-filter="all">All</button>' + cats.map(c => '<button class="filter-btn" data-filter="' + esc(c) + '">' + esc(c) + '</button>').join('');
  bar.querySelectorAll('.filter-btn').forEach(b => b.addEventListener('click', () => { bar.querySelectorAll('.filter-btn').forEach(x => x.classList.remove('active')); b.classList.add('active'); renderShorts(b.dataset.filter); }));
}
document.getElementById('btn-add-short').addEventListener('click', () => openModal('modal-short'));
document.getElementById('btn-confirm-short').addEventListener('click', async () => {
  const title = document.getElementById('short-title').value.trim();
  const url   = document.getElementById('short-url').value.trim();
  const cat   = document.getElementById('short-cat').value.trim() || 'Other';
  const views = document.getElementById('short-views').value.trim();
  if (!title) return;
  document.getElementById('short-saving').style.display = 'block';
  await DISCORD.send('note', ['📽️ **[SHORT] ' + title + '**', 'Category: ' + cat, url, views ? 'Views: ' + views : ''].filter(Boolean).join('\n'));
  document.getElementById('short-saving').style.display = 'none';
  shorts.push({ id: Date.now(), title, url, cat, views, date: new Date().toLocaleDateString('en-GB', { day:'2-digit', month:'short', year:'numeric' }) });
  renderShorts(); renderFilterBar(); updateStats(); buildMarquee();
  closeModal('modal-short'); clearForm(['short-title','short-url','short-cat','short-views']);
});

// ── VAULT ─────────────────────────────────────────────────────────────────────
const TYPE_ICON = { link:'⊞', note:'≡', file:'◫', idea:'◇' };
function renderVault(items) {
  const all = items !== undefined ? items : (currentVaultFilter === 'all' ? vaultItems : vaultItems.filter(v => v.type === currentVaultFilter));
  const c = document.getElementById('vault-cards');
  if (!all.length) { c.innerHTML = '<div class="vault-empty">Nothing here yet.</div>'; return; }
  c.innerHTML = all.map(v => '<div class="vault-item"' + (v.url ? ' onclick="window.open(\'' + esc(v.url) + '\',\'_blank\')"' : '') + '><div class="vault-item-type">' + (TYPE_ICON[v.type]||'·') + ' ' + esc(v.type) + '</div><div class="vault-item-title">' + esc(v.title) + '</div>' + (v.content ? '<div class="vault-item-preview">' + esc(v.content.substring(0,90)) + (v.content.length>90?'…':'') + '</div>' : '') + (v.url ? '<div class="vault-item-url">' + esc(v.url.substring(0,50)) + (v.url.length>50?'…':'') + '</div>' : '') + '<div class="vault-item-footer"><div style="display:flex;gap:0.35rem;flex-wrap:wrap;">' + (v.tags||[]).map(t=>'<span class="vault-tag">'+esc(t)+'</span>').join('') + '</div><span class="vault-date">' + esc(v.date) + '</span></div></div>').join('');
}
function renderTagSidebar() {
  const tags = [...new Set(vaultItems.flatMap(v => v.tags||[]))];
  const s = document.getElementById('tag-sidebar');
  if (!tags.length) { s.innerHTML = ''; return; }
  s.innerHTML = '<div class="vault-sidebar-title" style="padding-top:0">Tags</div>' + tags.map(t => '<div class="vault-cat" data-tag="' + esc(t) + '"><span class="vault-cat-icon">◈</span> ' + esc(t) + '</div>').join('');
  s.querySelectorAll('[data-tag]').forEach(el => el.addEventListener('click', () => { document.querySelectorAll('.vault-cat').forEach(b => b.classList.remove('active')); el.classList.add('active'); renderVault(vaultItems.filter(v => (v.tags||[]).includes(el.dataset.tag))); }));
}
document.querySelectorAll('.vault-cat[data-vault-filter]').forEach(el => el.addEventListener('click', () => { document.querySelectorAll('.vault-cat').forEach(b => b.classList.remove('active')); el.classList.add('active'); currentVaultFilter = el.dataset.vaultFilter; renderVault(); }));
document.getElementById('vault-search-input').addEventListener('input', e => { const q = e.target.value.trim().toLowerCase(); if (!q) { renderVault(); return; } renderVault(vaultItems.filter(v => v.title.toLowerCase().includes(q) || (v.content||'').toLowerCase().includes(q) || (v.tags||[]).some(t=>t.toLowerCase().includes(q)))); });
document.getElementById('btn-add-vault').addEventListener('click', () => openModal('modal-vault'));
document.querySelectorAll('.type-opt').forEach(b => b.addEventListener('click', () => { currentVaultType = b.dataset.type; document.querySelectorAll('.type-opt').forEach(x => x.classList.remove('active')); b.classList.add('active'); document.getElementById('vault-url-group').style.display = (currentVaultType==='link'||currentVaultType==='file') ? 'block' : 'none'; }));
document.getElementById('btn-confirm-vault').addEventListener('click', async () => {
  const title   = document.getElementById('vault-title').value.trim();
  const url     = document.getElementById('vault-url').value.trim();
  const content = document.getElementById('vault-content').value.trim();
  const tags    = document.getElementById('vault-tags').value.trim().split(',').map(t=>t.trim()).filter(Boolean);
  if (!title) return;
  document.getElementById('vault-saving').style.display = 'block';
  const emoji = {link:'🔗',note:'📝',file:'📁',idea:'💡',code:'💻'}[currentVaultType];
  const lang = (document.getElementById('vault-lang')||{}).value || '';
  let msg = emoji + ' **[' + currentVaultType.toUpperCase() + '] ' + title + '**';
  if (lang)        msg += '\nLanguage: ' + lang;
  if (url)         msg += '\n' + url;
  if (content && currentVaultType==='code') msg += '\n```' + lang + '\n' + content + '\n```';
  else if (content) msg += '\n' + content;
  if (tags.length) msg += '\nTags: ' + tags.join(', ');
  await DISCORD.send(currentVaultType, msg);
  document.getElementById('vault-saving').style.display = 'none';
  vaultItems.push({ id: Date.now(), type: currentVaultType, title, url, content, tags, date: new Date().toLocaleDateString('en-GB', {day:'2-digit',month:'short',year:'numeric'}) });
  renderVault(); renderTagSidebar(); updateStats();
  closeModal('modal-vault'); clearForm(['vault-title','vault-url','vault-content','vault-tags','vault-lang']);
});

// ── STATS & MARQUEE ───────────────────────────────────────────────────────────
function updateStats() {
  document.getElementById('stat-shorts').textContent = shorts.length;
  document.getElementById('stat-items').textContent  = vaultItems.length;
  document.getElementById('stat-tags').textContent   = new Set(vaultItems.flatMap(v=>v.tags||[])).size;
}
function buildMarquee() {
  const cats = shorts.length ? [...new Set(shorts.map(s=>s.cat))] : ['Shorts','Links','Notes','Ideas','Files'];
  const html = [...cats,...cats].map(c=>'<span class="marquee-item"><span>✦</span>'+esc(c)+'</span>').join('');
  document.getElementById('marquee-inner').innerHTML = html + html;
}

// ── MODALS ────────────────────────────────────────────────────────────────────
function openModal(id)  { document.getElementById(id).classList.add('open'); }
function closeModal(id) { document.getElementById(id).classList.remove('open'); }
document.querySelectorAll('[data-close]').forEach(b => b.addEventListener('click', () => closeModal(b.dataset.close)));
document.querySelectorAll('.modal-backdrop').forEach(b => b.addEventListener('click', e => { if(e.target===b) closeModal(b.id); }));
document.addEventListener('keydown', e => { if(e.key==='Escape') document.querySelectorAll('.modal-backdrop.open').forEach(m=>closeModal(m.id)); });

// ── UTILS ─────────────────────────────────────────────────────────────────────
function esc(s) { return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }
function clearForm(ids) { ids.forEach(id => { const el=document.getElementById(id); if(el) el.value=''; }); }
function showMsg(id, ok, msg) {
  const el = document.getElementById(id);
  if (!el) return;
  el.textContent = msg;
  el.className = 'connection-result ' + (ok ? 'ok' : 'err');
  el.style.display = 'block';
  setTimeout(() => { el.style.display = 'none'; }, 4000);
}
