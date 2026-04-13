// ─────────────────────────────────────────────
//  Kira Portfolio — app.js
// ─────────────────────────────────────────────

const LS = {
  get: (k, fallback) => { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : fallback; } catch { return fallback; } },
  set: (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} },
};

let shorts          = LS.get('kira_shorts', []);
let vaultItems      = LS.get('kira_vault', []);
let cfg             = LS.get('kira_cfg', {});   // { worker, links, notes, files, ideas }
let profile         = LS.get('kira_profile', { name: 'Kira', tagline: 'Short-form content, ideas, and a private vault — all in one place.' });
let currentVaultFilter = 'all';
let currentVaultType   = 'link';
let activeTagFilter    = null;

// ── DISCORD PROXY ────────────────────────────────────────────────────────────
const DISCORD = {
  async test(channelId) {
    if (!cfg.worker || !channelId) return { ok: false, error: 'Worker URL or channel ID missing' };
    try {
      const r = await fetch(`${cfg.worker.replace(/\/$/, '')}/channel/${channelId}/test`);
      return await r.json();
    } catch (e) { return { ok: false, error: e.message }; }
  },
  async send(type, content) {
    const chMap = { link: cfg.links, note: cfg.notes, file: cfg.files, idea: cfg.ideas };
    const chId  = chMap[type];
    if (!cfg.worker || !chId) return false;
    try {
      const r = await fetch(`${cfg.worker.replace(/\/$/, '')}/channel/${chId}/message`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content }),
      });
      const data = await r.json();
      return data.ok === true;
    } catch { return false; }
  },
};

// ── NAVIGATION ───────────────────────────────────────────────────────────────
function showPage(id) {
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.nav-links button').forEach(b => {
    b.classList.toggle('active', b.dataset.page === id);
  });
  document.getElementById('page-' + id).classList.add('active');
  // close mobile menu
  document.querySelector('.nav-links').classList.remove('open');
  if (id === 'settings') loadSettingsForm();
}

document.querySelectorAll('.nav-links button[data-page]').forEach(btn => {
  btn.addEventListener('click', () => showPage(btn.dataset.page));
});
document.querySelectorAll('[data-goto]').forEach(btn => {
  btn.addEventListener('click', () => showPage(btn.dataset.goto));
});
document.querySelector('.nav-logo').addEventListener('click', () => showPage('home'));
document.getElementById('nav-hamburger').addEventListener('click', () => {
  document.querySelector('.nav-links').classList.toggle('open');
});

// ── PROFILE ──────────────────────────────────────────────────────────────────
function applyProfile() {
  if (profile.name) {
    const logo = document.querySelector('.nav-logo');
    logo.innerHTML = profile.name.charAt(0) + '<span>' + profile.name.slice(1) + '</span>';
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

// ── SETTINGS ─────────────────────────────────────────────────────────────────
function loadSettingsForm() {
  if (cfg.worker)  document.getElementById('cfg-worker').value   = cfg.worker;
  if (cfg.links)   document.getElementById('cfg-ch-links').value = cfg.links;
  if (cfg.notes)   document.getElementById('cfg-ch-notes').value = cfg.notes;
  if (cfg.files)   document.getElementById('cfg-ch-files').value = cfg.files;
  if (cfg.ideas)   document.getElementById('cfg-ch-ideas').value = cfg.ideas;
  document.getElementById('cfg-name').value    = profile.name    || '';
  document.getElementById('cfg-tagline').value = profile.tagline || '';
}

document.getElementById('btn-save-config').addEventListener('click', () => {
  cfg = {
    worker: document.getElementById('cfg-worker').value.trim(),
    links:  document.getElementById('cfg-ch-links').value.trim(),
    notes:  document.getElementById('cfg-ch-notes').value.trim(),
    files:  document.getElementById('cfg-ch-files').value.trim(),
    ideas:  document.getElementById('cfg-ch-ideas').value.trim(),
  };
  LS.set('kira_cfg', cfg);
  updateDiscordStatus();
  flashResult('connection-result', true, 'Configuration saved.');
});

document.getElementById('btn-test-connection').addEventListener('click', async () => {
  const worker = document.getElementById('cfg-worker').value.trim();
  const chId   = document.getElementById('cfg-ch-links').value.trim()
              || document.getElementById('cfg-ch-notes').value.trim();
  const el = document.getElementById('connection-result');
  if (!worker || !chId) {
    flashResult('connection-result', false, 'Enter Worker URL and at least one channel ID first.');
    return;
  }
  el.textContent = 'Testing…'; el.className = 'connection-result'; el.style.display = 'block';
  // temporarily use the form values
  const savedCfg = { ...cfg };
  cfg.worker = worker;
  const result = await DISCORD.test(chId);
  cfg = savedCfg;
  if (result.ok) {
    flashResult('connection-result', true, `Connected! Channel: #${result.name || chId}`);
    updateDiscordStatus(true);
  } else {
    flashResult('connection-result', false, `Error: ${result.error || 'Check Worker URL and channel IDs'}`);
  }
});

function flashResult(id, ok, msg) {
  const el = document.getElementById(id);
  if (!el) return;
  el.textContent = msg;
  el.className   = 'connection-result ' + (ok ? 'ok' : 'err');
  el.style.display = 'block';
  setTimeout(() => { el.style.display = 'none'; }, 4000);
}

function updateDiscordStatus(connected) {
  const has = cfg.worker && (cfg.links || cfg.notes || cfg.files || cfg.ideas);
  const dot   = document.getElementById('discord-dot');
  const label = document.getElementById('discord-label');
  if (connected || has) {
    dot.classList.remove('off');
    label.textContent = 'Discord: connected';
  } else {
    dot.classList.add('off');
    label.textContent = 'Discord: not configured';
  }
}

// ── SHORTS ───────────────────────────────────────────────────────────────────
const THUMB_COLORS = ['#2a1a0e','#0e1a2a','#1a0e2a','#0e2a1a','#1a1a0e','#2a0e1a'];
const TYPE_ICON    = { link: '⊞', note: '≡', file: '◫', idea: '◇' };

function renderShorts(filter = 'all') {
  const grid  = document.getElementById('shorts-grid');
  const items = filter === 'all'
    ? shorts
    : shorts.filter(s => s.cat.toLowerCase() === filter.toLowerCase());

  if (!items.length) {
    grid.innerHTML = `<div class="short-empty">No shorts yet — add your first one.</div>`;
    return;
  }
  grid.innerHTML = items.map((s, i) => `
    <div class="short-card" ${s.url ? `onclick="window.open('${escHtml(s.url)}','_blank')"` : ''}>
      <div class="short-thumb" style="background:${THUMB_COLORS[i % THUMB_COLORS.length]}">
        <div class="thumb-gradient"></div>
        <div class="play-icon">
          <svg viewBox="0 0 16 16"><polygon points="3,2 13,8 3,14"/></svg>
        </div>
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
  bar.querySelectorAll('.filter-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      bar.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      renderShorts(btn.dataset.filter);
    });
  });
}

document.getElementById('btn-add-short').addEventListener('click', () => openModal('modal-short'));

document.getElementById('btn-confirm-short').addEventListener('click', async () => {
  const title = document.getElementById('short-title').value.trim();
  const url   = document.getElementById('short-url').value.trim();
  const cat   = document.getElementById('short-cat').value.trim() || 'Other';
  const views = document.getElementById('short-views').value.trim();
  if (!title) return;

  const short = {
    id: Date.now(), title, url, cat, views,
    date: new Date().toLocaleDateString('en-GB', { day:'2-digit', month:'short', year:'numeric' }),
  };

  const saving = document.getElementById('short-saving');
  if (cfg.worker && cfg.notes) {
    saving.style.display = 'block';
    const msg = [`📽️ **[SHORT] ${title}**`, `Category: ${cat}`, url ? `URL: ${url}` : '', views ? `Views: ${views}` : ''].filter(Boolean).join('\n');
    await DISCORD.send('note', msg);
    saving.style.display = 'none';
  }

  shorts.push(short);
  LS.set('kira_shorts', shorts);
  renderShorts(); renderFilterBar(); updateStats(); buildMarquee();
  closeModal('modal-short');
  clearForm(['short-title','short-url','short-cat','short-views']);
});

// ── VAULT ─────────────────────────────────────────────────────────────────────
function renderVault(items = null) {
  const all = items !== null
    ? items
    : (currentVaultFilter === 'all'
        ? vaultItems
        : vaultItems.filter(v => v.type === currentVaultFilter));

  const container = document.getElementById('vault-cards');
  if (!all.length) {
    container.innerHTML = `<div class="vault-empty">Nothing here yet.</div>`;
    return;
  }
  container.innerHTML = all.map(v => `
    <div class="vault-item" ${v.url ? `onclick="window.open('${escHtml(v.url)}','_blank')"` : ''}>
      <div class="vault-item-type">${TYPE_ICON[v.type] || '·'} ${escHtml(v.type)}</div>
      <div class="vault-item-title">${escHtml(v.title)}</div>
      ${v.content ? `<div class="vault-item-preview">${escHtml(v.content.substring(0,90))}${v.content.length > 90 ? '…' : ''}</div>` : ''}
      ${v.url ? `<div class="vault-item-url">${escHtml(v.url.substring(0,50))}${v.url.length > 50 ? '…' : ''}</div>` : ''}
      <div class="vault-item-footer">
        <div style="display:flex;gap:0.35rem;flex-wrap:wrap;">
          ${(v.tags || []).map(t => `<span class="vault-tag">${escHtml(t)}</span>`).join('')}
        </div>
        <span class="vault-date">${escHtml(v.date)}</span>
      </div>
    </div>`).join('');
}

function renderTagSidebar() {
  const tags = [...new Set(vaultItems.flatMap(v => v.tags || []))];
  const sidebar = document.getElementById('tag-sidebar');
  if (!tags.length) { sidebar.innerHTML = ''; return; }
  sidebar.innerHTML =
    `<div class="vault-sidebar-title" style="padding-top:0">Tags</div>` +
    tags.map(t => `<div class="vault-cat" data-tag="${escHtml(t)}"><span class="vault-cat-icon">◈</span> ${escHtml(t)}</div>`).join('');
  sidebar.querySelectorAll('[data-tag]').forEach(el => {
    el.addEventListener('click', () => {
      setAllVaultCatsInactive();
      el.classList.add('active');
      activeTagFilter = el.dataset.tag;
      renderVault(vaultItems.filter(v => (v.tags || []).includes(el.dataset.tag)));
    });
  });
}

document.querySelectorAll('.vault-cat[data-vault-filter]').forEach(el => {
  el.addEventListener('click', () => {
    setAllVaultCatsInactive();
    el.classList.add('active');
    currentVaultFilter = el.dataset.vaultFilter;
    activeTagFilter = null;
    renderVault();
  });
});

function setAllVaultCatsInactive() {
  document.querySelectorAll('.vault-cat').forEach(b => b.classList.remove('active'));
}

document.getElementById('vault-search-input').addEventListener('input', e => {
  const q = e.target.value.trim().toLowerCase();
  if (!q) { renderVault(); return; }
  renderVault(vaultItems.filter(v =>
    v.title.toLowerCase().includes(q) ||
    (v.content || '').toLowerCase().includes(q) ||
    (v.tags || []).some(t => t.toLowerCase().includes(q))
  ));
});

document.getElementById('btn-add-vault').addEventListener('click', () => openModal('modal-vault'));

document.querySelectorAll('.type-opt').forEach(btn => {
  btn.addEventListener('click', () => {
    currentVaultType = btn.dataset.type;
    document.querySelectorAll('.type-opt').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    document.getElementById('vault-url-group').style.display =
      (currentVaultType === 'link' || currentVaultType === 'file') ? 'block' : 'none';
  });
});

document.getElementById('btn-confirm-vault').addEventListener('click', async () => {
  const title   = document.getElementById('vault-title').value.trim();
  const url     = document.getElementById('vault-url').value.trim();
  const content = document.getElementById('vault-content').value.trim();
  const tags    = document.getElementById('vault-tags').value.trim().split(',').map(t => t.trim()).filter(Boolean);
  if (!title) return;

  const item = {
    id: Date.now(), type: currentVaultType, title, url, content, tags,
    date: new Date().toLocaleDateString('en-GB', { day:'2-digit', month:'short', year:'numeric' }),
  };

  const saving = document.getElementById('vault-saving');
  if (cfg.worker) {
    saving.style.display = 'block';
    const emoji = { link: '🔗', note: '📝', file: '📁', idea: '💡' }[item.type];
    let msg = `${emoji} **[${item.type.toUpperCase()}] ${title}**`;
    if (url)          msg += `\n${url}`;
    if (content)      msg += `\n${content}`;
    if (tags.length)  msg += `\nTags: ${tags.join(', ')}`;
    await DISCORD.send(item.type, msg);
    saving.style.display = 'none';
  }

  vaultItems.push(item);
  LS.set('kira_vault', vaultItems);
  renderVault(); renderTagSidebar(); updateStats();
  closeModal('modal-vault');
  clearForm(['vault-title','vault-url','vault-content','vault-tags']);
});

// ── STATS & MARQUEE ───────────────────────────────────────────────────────────
function updateStats() {
  document.getElementById('stat-shorts').textContent = shorts.length;
  document.getElementById('stat-items').textContent  = vaultItems.length;
  document.getElementById('stat-tags').textContent   = new Set(vaultItems.flatMap(v => v.tags || [])).size;
}

function buildMarquee() {
  const cats  = shorts.length ? [...new Set(shorts.map(s => s.cat))] : ['Shorts','Links','Notes','Ideas','Files'];
  const items = [...cats, ...cats].map(c => `<span class="marquee-item"><span>✦</span>${escHtml(c)}</span>`).join('');
  document.getElementById('marquee-inner').innerHTML = items + items;
}

// ── MODALS ────────────────────────────────────────────────────────────────────
function openModal(id)  { document.getElementById(id).classList.add('open'); }
function closeModal(id) { document.getElementById(id).classList.remove('open'); }

document.querySelectorAll('[data-close]').forEach(btn => {
  btn.addEventListener('click', () => closeModal(btn.dataset.close));
});
document.querySelectorAll('.modal-backdrop').forEach(backdrop => {
  backdrop.addEventListener('click', e => { if (e.target === backdrop) closeModal(backdrop.id); });
});
document.addEventListener('keydown', e => {
  if (e.key === 'Escape') document.querySelectorAll('.modal-backdrop.open').forEach(m => closeModal(m.id));
});

// ── UTILS ─────────────────────────────────────────────────────────────────────
function escHtml(str) {
  return String(str || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}
function clearForm(ids) {
  ids.forEach(id => { const el = document.getElementById(id); if (el) el.value = ''; });
}

// ── INIT ──────────────────────────────────────────────────────────────────────
applyProfile();
renderShorts(); renderFilterBar();
renderVault();  renderTagSidebar();
updateStats();  buildMarquee();
updateDiscordStatus();