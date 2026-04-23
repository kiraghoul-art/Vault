/* ═══════════════════════════════════════════════
   KIRA PORTFOLIO — app.js
   ═══════════════════════════════════════════════ */

const WORKER = 'https://kira-discord-proxy.ghoullkira.workers.dev';

const API = {
  token: null,
  h()    { return { 'Content-Type': 'application/json', ...(this.token ? { 'X-Session-Token': this.token } : {}) }; },
  get(p)    { return fetch(WORKER + p, { headers: this.h() }).then(r => r.json()); },
  post(p,d) { return fetch(WORKER + p, { method:'POST',   headers: this.h(), body: JSON.stringify(d) }).then(r => r.json()); },
  del(p)    { return fetch(WORKER + p, { method:'DELETE', headers: this.h() }).then(r => r.json()); }
};

let state = {
  profile: {}, theme: {}, projects: [], shorts: [], socials: [],
  vault: [], music: { themeSong: null, playlists: [] }, about: {},
  channels: [], isOwner: false,
  vaultFilter: 'all', vaultType: 'link',
  musicData: { themeSong: null, playlists: [] },
  channelRows: [], activeTheme: 'medieval'
};

/* ── INIT ── */
document.addEventListener('DOMContentLoaded', async () => {
  setupNav();
  setupLoginModal();
  setupModals();
  setupSettingsListeners();
  setupMusicDropZones();
  loadStoredTheme();

  const tok = sessionStorage.getItem('kira_token');
  if (tok) {
    API.token = tok;
    try {
      const saved = sessionStorage.getItem('kira_profile');
      const savedTheme = sessionStorage.getItem('kira_theme');
      if (saved) state.profile = JSON.parse(saved);
      if (savedTheme) state.theme = JSON.parse(savedTheme);
      await enterOwner(false);
    } catch(e) { await loadPublic(); }
    return;
  }
  await loadPublic();
});

async function loadPublic() {
  setStatus('connecting');
  try {
    const r = await API.get('/public');
    if (!r.ok) { setStatus('error'); return; }
    state.profile  = r.profile  || {};
    state.theme    = r.theme    || {};
    state.projects = r.projects || [];
    state.shorts   = r.shorts   || [];
    state.socials  = r.socials  || [];
    state.music    = r.music    || { themeSong: null, playlists: [] };
    state.about    = r.about    || {};
    applyProfile(); applyPageVisibility(); renderAll();
    setStatus('connected');
  } catch(e) { setStatus('error'); }
}

/* ── NAV ── */
function setupNav() {
  document.querySelectorAll('.nav-links button[data-page]').forEach(b =>
    b.addEventListener('click', function() { goTo(this.dataset.page); })
  );
  document.querySelectorAll('[data-goto]').forEach(b =>
    b.addEventListener('click', function() { goTo(this.dataset.goto); })
  );
  const ham = document.getElementById('nav-hamburger');
  const nl  = document.getElementById('nav-links');
  if (ham && nl) {
    ham.addEventListener('click', e => { e.stopPropagation(); nl.classList.toggle('open'); });
    document.addEventListener('click', () => nl.classList.remove('open'));
  }
  document.getElementById('nav-logo')?.addEventListener('click', () => goTo('home'));
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') { closeAllModals(); closeLogin(); }
  });
}

function goTo(page) {
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.nav-links button[data-page]').forEach(b =>
    b.classList.toggle('active', b.dataset.page === page)
  );
  const el = document.getElementById('page-' + page);
  if (el) el.classList.add('active');
  document.getElementById('nav-links')?.classList.remove('open');
  if (page === 'music') loadMusic();
}

function applyPageVisibility() {
  const p = state.profile;
  const pages = [
    ['projects', p.showProjects !== false],
    ['music',    p.showMusic    !== false],
    ['shorts',   p.showShorts   !== false],
    ['vault',    state.isOwner],
    ['socials',  p.showSocials  !== false],
    ['cv',       p.showCv       !== false],
    ['about',    p.showAbout    !== false],
    ['setup',    state.isOwner]
  ];
  pages.forEach(([name, show]) => {
    const btn = document.querySelector(`.nav-links button[data-page="${name}"]`);
    if (btn) btn.style.display = show ? '' : 'none';
  });
}

/* ── LOGIN ── */
function setupLoginModal() {
  document.getElementById('btn-open-login')?.addEventListener('click', openLogin);
  document.getElementById('btn-login')?.addEventListener('click', doLogin);
  document.getElementById('btn-logout')?.addEventListener('click', doLogout);
  document.getElementById('login-pass')?.addEventListener('keydown', e => { if (e.key === 'Enter') doLogin(); });
  document.getElementById('login-user')?.addEventListener('keydown', e => { if (e.key === 'Enter') document.getElementById('login-pass')?.focus(); });
  document.getElementById('login-screen')?.addEventListener('click', function(e) { if (e.target === this) closeLogin(); });
}

function openLogin() {
  const s = document.getElementById('login-screen');
  if (s) { s.style.display = 'flex'; document.getElementById('login-user')?.focus(); }
}
function closeLogin() {
  const s = document.getElementById('login-screen');
  if (s) s.style.display = 'none';
  setLoginMsg('');
}
function setLoginMsg(msg, type) {
  const el = document.getElementById('login-result');
  if (!el) return;
  el.textContent = msg;
  el.className = 'login-result' + (type ? ' ' + type : '');
}

async function doLogin() {
  const user = document.getElementById('login-user')?.value.trim() || '';
  const pass = document.getElementById('login-pass')?.value || '';
  if (!user || !pass) { setLoginMsg('Fill both fields.', 'err'); return; }
  const btn = document.getElementById('btn-login');
  if (btn) btn.disabled = true;
  setLoginMsg('Verifying…');
  try {
    const r = await fetch(WORKER + '/auth', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: user, password: pass })
    }).then(r => r.json());
    if (!r.ok) { setLoginMsg('Wrong credentials.', 'err'); return; }
    API.token = r.token;
    state.profile = r.profile || {};
    state.theme   = r.theme   || {};
    sessionStorage.setItem('kira_token',   r.token);
    sessionStorage.setItem('kira_profile', JSON.stringify(state.profile));
    sessionStorage.setItem('kira_theme',   JSON.stringify(state.theme));
    closeLogin();
    await enterOwner(true);
  } catch(e) { setLoginMsg('Connection error.', 'err'); }
  finally { if (btn) btn.disabled = false; }
}

function doLogout() {
  API.token = null; state.isOwner = false;
  sessionStorage.clear(); location.reload();
}

async function enterOwner(fetchData) {
  state.isOwner = true;
  document.querySelectorAll('.owner-only').forEach(el => el.style.display = '');
  applyPageVisibility();

  if (fetchData) {
    setStatus('connecting');
    try {
      const r = await API.get('/data');
      if (!r.ok) { setStatus('error'); return; }
      state.profile  = r.profile  || {};
      state.theme    = r.theme    || {};
      state.projects = r.projects || [];
      state.shorts   = r.shorts   || [];
      state.socials  = r.socials  || [];
      state.vault    = r.vault    || [];
      state.music    = r.music    || { themeSong: null, playlists: [] };
      state.about    = r.about    || {};
      state.channels = r.channels || [];
      sessionStorage.setItem('kira_profile', JSON.stringify(state.profile));
      sessionStorage.setItem('kira_theme',   JSON.stringify(state.theme));
    } catch(e) { setStatus('error'); return; }
  } else {
    try {
      const r = await API.get('/data');
      if (r.ok) {
        state.profile  = r.profile  || state.profile;
        state.theme    = r.theme    || state.theme;
        state.projects = r.projects || [];
        state.shorts   = r.shorts   || [];
        state.socials  = r.socials  || [];
        state.vault    = r.vault    || [];
        state.music    = r.music    || { themeSong: null, playlists: [] };
        state.about    = r.about    || {};
        state.channels = r.channels || [];
        sessionStorage.setItem('kira_profile', JSON.stringify(state.profile));
        sessionStorage.setItem('kira_theme',   JSON.stringify(state.theme));
      }
    } catch(e) {}
  }

  applyProfile();
  applyPageVisibility();
  populateSetup();
  renderAll();
  setStatus('connected');
}

function renderAll() {
  applyProfile();
  renderProjects();
  renderShorts();
  renderSocials();
  renderVault();
  renderAbout();
  renderCV();
  updateStats();
}

/* ── PROFILE ── */
function applyProfile() {
  const p = state.profile;
  const bgEl = document.getElementById('bg-img');
  if (bgEl) {
    bgEl.style.backgroundImage = p.bgUrl ? `url(${p.bgUrl})` : '';
    bgEl.style.opacity = state.theme.bgOpacity !== undefined ? state.theme.bgOpacity : 0.4;
  }
  const av = document.getElementById('home-avatar');
  const avSrc = p.avatar || state.about?.image || '';
  if (av) { av.src = avSrc; av.style.display = avSrc ? '' : 'none'; }

  const el = (id, val) => { const e = document.getElementById(id); if (e) e.textContent = val || ''; };
  el('home-name', p.name || 'Kira');
  el('home-tagline', p.tagline || '');
  document.title = (p.name || 'Kira') + ' — Portfolio';
  document.getElementById('nav-logo').innerHTML = (p.name || 'Kira').charAt(0) + '<span>' + (p.name || 'Kira').slice(1) + '</span>';
  document.getElementById('login-logo').innerHTML = (p.name || 'Kira').charAt(0) + '<span style="color:var(--accent)">' + (p.name || 'Kira').slice(1) + '</span>';

  const quote = document.getElementById('home-quote');
  if (quote) { quote.textContent = p.quote || ''; quote.style.display = p.quote ? '' : 'none'; }

  // Home nav chips
  const chips = document.getElementById('home-nav-links');
  if (chips) {
    const pages = ['projects','music','shorts','socials','cv','about'];
    chips.innerHTML = pages.map(pg => `<button class="home-nav-chip" data-goto="${pg}">${pg.charAt(0).toUpperCase()+pg.slice(1)}</button>`).join('');
    chips.querySelectorAll('[data-goto]').forEach(b => b.addEventListener('click', function() { goTo(this.dataset.goto); }));
  }

  // Owner edit areas
  if (state.isOwner) {
    ['cv-edit','about-edit'].forEach(id => { const el = document.getElementById(id); if (el) el.style.display = ''; });
  }
}

/* ── THEME ── */
function loadStoredTheme() {
  try {
    const t = localStorage.getItem('kira_theme_name') || 'medieval';
    state.activeTheme = t;
    applyThemeCSS(t);
    const overrides = localStorage.getItem('kira_theme_overrides');
    if (overrides) applyThemeOverrides(JSON.parse(overrides));
  } catch(e) {}
}

function applyThemeCSS(name) {
  const link = document.getElementById('theme-css');
  if (link) link.href = 'css/themes/' + name + '.css';
  document.querySelectorAll('.theme-option').forEach(o => o.classList.toggle('active', o.dataset.theme === name));
  state.activeTheme = name;
  localStorage.setItem('kira_theme_name', name);
}

function applyThemeOverrides(t) {
  if (!t) return;
  const r = document.documentElement;
  const map = { accent:'--accent', accentLight:'--accent-light', accentDim:'--accent-dim', bg:'--bg', text:'--text', textDim:'--text-dim' };
  Object.entries(map).forEach(([k,v]) => { if (t[k]) r.style.setProperty(v, t[k]); });
  const bgEl = document.getElementById('bg-img');
  if (bgEl) {
    if (t.bgUrl) bgEl.style.backgroundImage = `url(${t.bgUrl})`;
    if (t.bgOpacity !== undefined) bgEl.style.opacity = t.bgOpacity;
  }
}

/* ── STATS ── */
function updateStats() {
  const si = (id, v) => { const e = document.getElementById(id); if (e) e.textContent = v; };
  si('stat-projects', state.projects.filter(p => state.isOwner || p.isPublic !== false).length);
  si('stat-shorts',   state.shorts.filter(s => state.isOwner || s.isPublic !== false).length);
  si('stat-socials',  state.socials.filter(s => state.isOwner || s.isPublic !== false).length);
}

/* ── PROJECTS ── */
function renderProjects() {
  const grid = document.getElementById('projects-grid');
  const filterBar = document.getElementById('projects-filter');
  if (!grid) return;

  const visible = state.projects.filter(p => state.isOwner || p.isPublic !== false);
  if (!visible.length) { grid.innerHTML = '<div class="music-empty">No projects yet.</div>'; if (filterBar) filterBar.innerHTML = ''; return; }

  const tags = ['all', ...new Set(visible.flatMap(p => (p.tags || '').split(',').map(t => t.trim()).filter(Boolean)))];
  if (filterBar) {
    filterBar.innerHTML = tags.map(t => `<button class="filter-btn${t==='all'?' active':''}" data-pf="${esc(t)}">${t==='all'?'All':esc(t)}</button>`).join('');
    filterBar.querySelectorAll('.filter-btn').forEach(btn => btn.addEventListener('click', function() {
      filterBar.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
      this.classList.add('active');
      const f = this.dataset.pf;
      grid.querySelectorAll('.project-card').forEach(c => {
        c.style.display = (f === 'all' || c.dataset.tags?.includes(f)) ? '' : 'none';
      });
    }));
  }

  grid.innerHTML = visible.map(p => {
    const pub = p.isPublic !== false;
    const stack = (p.stack || '').split(',').map(s => s.trim()).filter(Boolean);
    const tags2 = (p.tags  || '').split(',').map(t => t.trim()).filter(Boolean);
    return `<div class="card project-card" data-pid="${p.id}" data-tags="${esc(p.tags||'')}" style="${!pub&&state.isOwner?'opacity:.6':'}">
      <div class="project-img-wrap">
        ${p.img ? `<img class="project-img" src="${esc(p.img)}" alt="">` : `<div class="project-img-placeholder">🗂</div>`}
        ${state.isOwner?`<div style="position:absolute;top:.5rem;right:.5rem;display:flex;gap:.25rem;z-index:2">
          <button class="filter-btn" style="padding:.2rem .5rem;font-size:.55rem" onclick="openEditProject('${p.id}')">Edit</button>
          <button class="filter-btn" style="padding:.2rem .5rem;font-size:.55rem;color:#e06c75" onclick="deleteProject('${p.id}')">✕</button>
        </div>`:''}
      </div>
      <div class="card-title">${esc(p.title||'')}</div>
      ${p.description?`<div class="card-body">${esc(p.description)}</div>`:''}
      ${stack.length?`<div class="project-stack">${stack.map(s=>`<span>${esc(s)}</span>`).join('')}</div>`:''}
      ${tags2.length?`<div class="card-tags">${tags2.map(t=>`<span class="tag">${esc(t)}</span>`).join('')}</div>`:''}
      <div class="project-links">
        ${p.url    ?`<a class="project-link" href="${esc(p.url)}" target="_blank" rel="noopener">↗ Live</a>`:''}
        ${p.github ?`<a class="project-link" href="${esc(p.github)}" target="_blank" rel="noopener">⌥ GitHub</a>`:''}
      </div>
    </div>`;
  }).join('');
}

function openAddProject()  { openProjectModal(null); }
function openEditProject(id) {
  const p = state.projects.find(x => x.id === id);
  if (p) openProjectModal(p);
}

function openProjectModal(p) {
  const isEdit = !!p;
  document.getElementById('modal-project-title').textContent = isEdit ? 'Edit Project' : 'Add Project';
  document.getElementById('project-edit-id').value = p?.id || '';
  const sv = (id, v) => { const e = document.getElementById(id); if (e) e.value = v || ''; };
  sv('proj-title', p?.title); sv('proj-desc', p?.description); sv('proj-stack', p?.stack);
  sv('proj-tags', p?.tags); sv('proj-url', p?.url); sv('proj-github', p?.github); sv('proj-img', p?.img);
  const pub = document.getElementById('proj-public'); if (pub) pub.checked = p?.isPublic !== false;
  openModal('modal-project');
}

async function saveProject() {
  const id   = document.getElementById('project-edit-id')?.value;
  const data = {
    title:       document.getElementById('proj-title')?.value.trim()   || '',
    description: document.getElementById('proj-desc')?.value.trim()    || '',
    stack:       document.getElementById('proj-stack')?.value.trim()   || '',
    tags:        document.getElementById('proj-tags')?.value.trim()    || '',
    url:         document.getElementById('proj-url')?.value.trim()     || '',
    github:      document.getElementById('proj-github')?.value.trim()  || '',
    img:         document.getElementById('proj-img')?.value.trim()     || '',
    isPublic:    document.getElementById('proj-public')?.checked ?? true
  };
  if (!data.title) { toast('Title required.'); return; }
  try {
    if (id) {
      await API.post('/projects/update', { id, ...data });
      const idx = state.projects.findIndex(p => p.id === id);
      if (idx > -1) state.projects[idx] = { ...state.projects[idx], ...data };
    } else {
      const r = await API.post('/projects', data);
      if (r.ok) state.projects.unshift({ id: r.id, ...data, createdAt: Date.now() });
    }
    renderProjects(); updateStats(); closeModal('modal-project'); toast('✦ Project saved.');
  } catch(e) { toast('Error: ' + e.message); }
}

async function deleteProject(id) {
  if (!confirm('Delete project?')) return;
  try {
    await API.del('/projects/' + id);
    state.projects = state.projects.filter(p => p.id !== id);
    renderProjects(); updateStats(); toast('Deleted.');
  } catch(e) { toast('Error.'); }
}

/* ── MUSIC ── */
function setupMusicDropZones() {
  makeDropZone('drop-theme', handleThemeDrop);
  makeDropZone('drop-playlist', handlePlaylistDrop);
}

function makeDropZone(id, handler) {
  const el = document.getElementById(id);
  if (!el) return;
  el.addEventListener('dragover', e => { e.preventDefault(); el.classList.add('drag-over'); });
  el.addEventListener('dragleave', () => el.classList.remove('drag-over'));
  el.addEventListener('drop', e => {
    e.preventDefault(); el.classList.remove('drag-over');
    const url = e.dataTransfer.getData('text/plain') || e.dataTransfer.getData('text/uri-list');
    if (url) handler(url.trim());
  });
  el.addEventListener('click', () => {
    const url = prompt('Cola o link do Spotify:');
    if (url) handler(url.trim());
  });
}

async function handleThemeDrop(url) {
  if (!state.isOwner) return;
  const prev = document.getElementById('theme-preview');
  if (prev) prev.innerHTML = '<div style="padding:.5rem 0;font-size:.8rem;color:var(--accent-dim)">Loading… <span class="spin"></span></div>';
  try {
    const r = await API.post('/spotify/lookup', { url });
    if (!r.ok) { toast('❌ ' + r.error); if (prev) prev.innerHTML = ''; return; }
    state.musicData.themeSong = { title: r.title || r.name, artist: r.artist || '', img: r.img, url: r.url, gif: state.musicData.themeSong?.gif || '' };
    renderMusicSetup(); toast('✦ Theme song added.');
  } catch(e) { toast('Error: ' + e.message); if (prev) prev.innerHTML = ''; }
}

async function handlePlaylistDrop(url) {
  if (!state.isOwner) return;
  try {
    const r = await API.post('/spotify/lookup', { url });
    if (!r.ok) { toast('❌ ' + r.error); return; }
    state.musicData.playlists.push({ name: r.name || r.title, img: r.img, url: r.url, gif: '' });
    renderMusicSetup(); toast('✦ Playlist added.');
  } catch(e) { toast('Error: ' + e.message); }
}

function renderMusicSetup() {
  const prev = document.getElementById('theme-preview');
  const gifWrap = document.getElementById('theme-gif-wrap');
  if (prev) {
    const s = state.musicData.themeSong;
    if (s?.title) {
      prev.innerHTML = `<div class="music-setup-preview">
        ${s.img ? `<img class="music-setup-thumb" src="${esc(s.img)}" alt="">` : '<div class="music-setup-thumb" style="display:flex;align-items:center;justify-content:center;font-size:1.2rem">♪</div>'}
        <div class="music-setup-info">
          <div class="music-setup-title">${esc(s.title)}</div>
          ${s.artist?`<div class="music-setup-artist">${esc(s.artist)}</div>`:''}
        </div>
        <button class="music-setup-del" id="btn-del-theme">✕</button>
      </div>`;
      document.getElementById('btn-del-theme')?.addEventListener('click', () => { state.musicData.themeSong = null; renderMusicSetup(); });
      if (gifWrap) { gifWrap.style.display = ''; const g = document.getElementById('music-song-gif'); if (g) g.value = s.gif || ''; }
    } else {
      prev.innerHTML = '';
      if (gifWrap) gifWrap.style.display = 'none';
    }
  }
  const list = document.getElementById('playlist-setup-list');
  if (!list) return;
  if (!state.musicData.playlists.length) { list.innerHTML = ''; return; }
  list.innerHTML = state.musicData.playlists.map((p, i) => `
    <div class="playlist-setup-item">
      ${p.img ? `<img class="playlist-setup-thumb" src="${esc(p.img)}" alt="">` : '<div class="playlist-setup-thumb" style="display:flex;align-items:center;justify-content:center;font-size:1rem">🎧</div>'}
      <div class="playlist-setup-name">${esc(p.name||'')}</div>
      <input class="playlist-gif-input" type="url" placeholder="GIF URL" value="${esc(p.gif||'')}" data-pi="${i}">
      <button class="playlist-setup-del" data-pi="${i}">✕</button>
    </div>
  `).join('');
  list.querySelectorAll('.playlist-gif-input').forEach(inp => inp.addEventListener('input', function() { state.musicData.playlists[+this.dataset.pi].gif = this.value; }));
  list.querySelectorAll('.playlist-setup-del').forEach(btn => btn.addEventListener('click', function() { state.musicData.playlists.splice(+this.dataset.pi, 1); renderMusicSetup(); }));
}

async function saveMusic() {
  if (!state.isOwner) return;
  const el = document.getElementById('music-result');
  showResult(el, 'Saving…', '');
  const gifVal = document.getElementById('music-song-gif')?.value.trim() || '';
  if (state.musicData.themeSong) state.musicData.themeSong.gif = gifVal;
  try {
    const r = await API.post('/music', state.musicData);
    showResult(el, r.ok ? '✅ Saved.' : '❌ Failed.', r.ok ? 'ok' : 'err');
    if (r.ok) state.music = { ...state.musicData };
  } catch(e) { showResult(el, '❌ ' + e.message, 'err'); }
}

async function loadMusic() {
  const c = document.getElementById('music-content');
  if (!c) return;
  c.innerHTML = '<div class="music-empty">Loading…</div>';
  try {
    const r = await API.get('/music');
    if (!r.ok) { c.innerHTML = '<div class="music-empty">Could not load music.</div>'; return; }
    renderMusicPage(r, c);
  } catch(e) { c.innerHTML = '<div class="music-empty">Connection error.</div>'; }
}

function renderMusicPage(data, c) {
  let html = '';
  if (data.themeSong?.title || data.themeSong?.url) {
    const s = data.themeSong;
    const gifBg = s.gif
      ? `<div class="music-theme-bg"><img src="${esc(s.gif)}" alt=""></div>`
      : `<div class="music-theme-bg" style="background:linear-gradient(135deg,var(--bg),var(--bg3))"></div>`;
    html += `<a class="music-theme-card" href="${esc(s.url||'#')}" target="_blank" rel="noopener">
      ${gifBg}
      <div class="music-theme-overlay"></div>
      <div class="music-theme-content">
        ${s.img ? `<img class="music-theme-cover" src="${esc(s.img)}" alt="" onerror="this.outerHTML='<div class=music-theme-cover-placeholder>♪</div>'">` : '<div class="music-theme-cover-placeholder">♪</div>'}
        <div class="music-theme-info">
          <div class="music-now-label"><span class="music-eq"><span></span><span></span><span></span><span></span></span> Theme Song</div>
          <div class="music-track-title">${esc(s.title||'Untitled')}</div>
          ${s.artist?`<div class="music-track-artist">${esc(s.artist)}</div>`:''}
          <div class="music-open-btn">
            <svg width="11" height="11" viewBox="0 0 24 24" fill="currentColor"><path d="M12 0C5.4 0 0 5.4 0 12s5.4 12 12 12 12-5.4 12-12S18.66 0 12 0zm5.521 17.34c-.24.359-.66.48-1.021.24-2.82-1.74-6.36-2.101-10.561-1.141-.418.122-.779-.179-.899-.539-.12-.421.18-.78.54-.9 4.56-1.021 8.52-.6 11.64 1.32.42.18.479.659.301 1.02zm1.44-3.3c-.301.42-.841.6-1.262.3-3.239-1.98-8.159-2.58-11.939-1.38-.479.12-1.02-.12-1.14-.6-.12-.48.12-1.021.6-1.141C9.6 9.9 15 10.561 18.72 12.84c.361.181.54.78.241 1.2zm.12-3.36C15.24 8.4 8.82 8.16 5.16 9.301c-.6.179-1.2-.181-1.38-.721-.18-.601.18-1.2.72-1.381 4.26-1.26 11.28-1.02 15.721 1.621.539.3.719 1.02.419 1.56-.299.421-1.02.599-1.559.3z"/></svg>
            Open in Spotify
          </div>
        </div>
      </div>
    </a>`;
  }
  if (data.playlists?.length) {
    html += `<div class="music-section-title" style="margin-top:2rem">Playlists</div>
    <div class="music-playlists-grid">
      ${data.playlists.map(p => `
      <a class="music-playlist-card" href="${esc(p.url||'#')}" target="_blank" rel="noopener">
        <div class="music-playlist-img-wrap">
          ${p.gif?`<div class="music-playlist-gif"><img src="${esc(p.gif)}" alt=""></div>`:''}
          ${p.img?`<img class="music-playlist-cover" src="${esc(p.img)}" alt="" onerror="this.style.display='none'">`:(!p.gif?`<div class="music-playlist-placeholder">♫</div>`:'')}
          <div class="music-playlist-play"><svg viewBox="0 0 24 24"><polygon points="5,3 19,12 5,21"/></svg></div>
        </div>
        <div class="music-playlist-info">
          <div class="music-playlist-name">${esc(p.name||'Playlist')}</div>
          <div class="music-playlist-meta">Playlist · Spotify</div>
        </div>
      </a>`).join('')}
    </div>`;
  }
  c.innerHTML = html || '<div class="music-empty">No music configured yet. Go to Setup → Music.</div>';
}

/* ── SHORTS ── */
function renderShorts() {
  const grid = document.getElementById('shorts-grid');
  const filterBar = document.getElementById('shorts-filter');
  if (!grid) return;
  const visible = state.shorts.filter(s => state.isOwner || s.isPublic !== false);
  if (!visible.length) { grid.innerHTML = '<div class="short-empty">No shorts yet.</div>'; if (filterBar) filterBar.innerHTML = ''; return; }

  const cats = ['all', ...new Set(visible.map(s => s.cat).filter(Boolean))];
  if (filterBar) {
    filterBar.innerHTML = cats.map(c => `<button class="filter-btn${c==='all'?' active':''}" data-sf="${esc(c)}">${c==='all'?'All':esc(c)}</button>`).join('');
    filterBar.querySelectorAll('.filter-btn').forEach(btn => btn.addEventListener('click', function() {
      filterBar.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
      this.classList.add('active');
      const f = this.dataset.sf;
      grid.querySelectorAll('.short-card').forEach(c => c.style.display = (f==='all'||c.dataset.cat===f)?'':'none');
    }));
  }

  grid.innerHTML = visible.map(s => {
    const pub = s.isPublic !== false;
    return `<div class="short-card" data-cat="${esc(s.cat||'')}" data-sid="${s.id}" style="${!pub&&state.isOwner?'opacity:.6':''}">
      <div class="short-thumb">
        <div class="short-thumb-overlay"></div>
        <div class="short-play"><svg viewBox="0 0 24 24"><polygon points="5,3 19,12 5,21" fill="currentColor"/></svg></div>
        ${s.cat?`<div class="short-cat-badge">${esc(s.cat)}</div>`:''}
        ${state.isOwner?`<div style="position:absolute;top:.4rem;right:.4rem;display:flex;gap:.25rem;z-index:2">
          <button style="background:rgba(0,0,0,.8);border:1px solid var(--border);color:var(--text-muted);cursor:pointer;font-size:.55rem;padding:.15rem .35rem;border-radius:2px" onclick="toggleShort('${s.id}',${pub})">${pub?'Hide':'Show'}</button>
          <button style="background:rgba(0,0,0,.8);border:none;color:var(--text-muted);cursor:pointer;font-size:.7rem;padding:.15rem .35rem" onclick="deleteShort('${s.id}')">✕</button>
        </div>`:''}
      </div>
      <div class="short-info">
        <div class="short-title">${esc(s.titulo||'')}</div>
        ${s.views?`<div class="short-views">${esc(s.views)} views</div>`:''}
      </div>
    </div>`;
  }).join('');

  grid.querySelectorAll('.short-card').forEach((card, i) => {
    card.addEventListener('click', e => {
      if (e.target.tagName === 'BUTTON') return;
      if (visible[i]?.url) window.open(visible[i].url, '_blank');
    });
  });
}

async function toggleShort(id, isPub) {
  try {
    await API.post('/shorts/update', { id, isPublic: !isPub });
    const idx = state.shorts.findIndex(s => s.id === id);
    if (idx > -1) state.shorts[idx].isPublic = !isPub;
    renderShorts(); toast(!isPub ? '👁 Public.' : '🔒 Hidden.');
  } catch(e) { toast('Error.'); }
}

async function deleteShort(id) {
  if (!confirm('Delete?')) return;
  try {
    await API.del('/shorts/' + id);
    state.shorts = state.shorts.filter(s => s.id !== id);
    renderShorts(); updateStats(); toast('Deleted.');
  } catch(e) { toast('Error.'); }
}

async function addShort() {
  if (!state.isOwner) return;
  const data = {
    titulo:   document.getElementById('short-title')?.value.trim()  || '',
    url:      document.getElementById('short-url')?.value.trim()    || '',
    cat:      document.getElementById('short-cat')?.value.trim()    || '',
    views:    document.getElementById('short-views')?.value.trim()  || '',
    isPublic: document.getElementById('short-public')?.checked ?? true
  };
  if (!data.titulo || !data.url) { toast('Title and URL required.'); return; }
  try {
    const r = await API.post('/shorts', data);
    if (r.ok) {
      state.shorts.unshift({ id: r.id, ...data, createdAt: Date.now() });
      renderShorts(); updateStats(); closeModal('modal-short'); toast('✦ Added.');
    } else toast('Error: ' + (r.error||'failed'));
  } catch(e) { toast('Error: ' + e.message); }
}

/* ── VAULT ── */
function renderVault() {
  const c = document.getElementById('vault-cards');
  if (!c) return;
  const q = (document.getElementById('vault-search')?.value || '').toLowerCase();
  const items = state.vault.filter(i => {
    if (!state.isOwner && i.isPublic === false) return false;
    if (state.vaultFilter !== 'all' && i.type !== state.vaultFilter) return false;
    if (q && !(i.titulo+i.content+i.tags+i.url).toLowerCase().includes(q)) return false;
    return true;
  });
  if (!items.length) { c.innerHTML = '<div class="vault-empty">Nothing found.</div>'; renderVaultTags(); return; }
  const ic = { link:'⊞', note:'≡', file:'◫', idea:'◇', code:'</>' };
  c.innerHTML = items.map(i => {
    const pub = i.isPublic !== false;
    return `<div class="vault-item" style="${!pub&&state.isOwner?'opacity:.6':''}">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:.4rem">
        <span class="vault-item-type">${ic[i.type]||'▦'} ${i.type}</span>
        ${state.isOwner?`<span style="display:flex;gap:.3rem">
          <button style="background:none;border:1px solid var(--border);color:var(--text-muted);cursor:pointer;font-size:.52rem;padding:.1rem .3rem;border-radius:2px" onclick="toggleVault('${i.id}',${pub})">${pub?'Hide':'Show'}</button>
          <button style="background:none;border:none;color:var(--text-muted);cursor:pointer;font-size:.7rem" onclick="deleteVault('${i.id}')">✕</button>
        </span>`:''}
      </div>
      <div class="vault-item-title">${esc(i.titulo||'')}</div>
      ${i.url?`<div class="vault-item-url"><a href="${esc(i.url)}" target="_blank" rel="noopener">${esc(i.url)}</a></div>`:''}
      ${i.content?`<div class="vault-item-preview">${esc(i.content)}</div>`:''}
      ${i.tags?`<div class="card-tags">${i.tags.split(',').map(t=>`<span class="tag">${esc(t.trim())}</span>`).join('')}</div>`:''}
    </div>`;
  }).join('');
  renderVaultTags();
}

function renderVaultTags() {
  const sb = document.getElementById('vault-tags');
  if (!sb) return;
  const tags = new Set();
  state.vault.forEach(i => { if (i.tags) i.tags.split(',').forEach(t => tags.add(t.trim())); });
  sb.innerHTML = [...tags].map(t => `<div class="vault-cat" data-vt="${esc(t)}"># ${esc(t)}</div>`).join('');
  sb.querySelectorAll('[data-vt]').forEach(el => el.addEventListener('click', function() {
    const inp = document.getElementById('vault-search');
    if (inp) { inp.value = this.dataset.vt; renderVault(); }
  }));
}

async function toggleVault(id, isPub) {
  try {
    await API.post('/vault/update', { id, isPublic: !isPub });
    const idx = state.vault.findIndex(v => v.id === id);
    if (idx > -1) state.vault[idx].isPublic = !isPub;
    renderVault(); toast(!isPub ? '👁 Public.' : '🔒 Hidden.');
  } catch(e) { toast('Error.'); }
}

async function deleteVault(id) {
  if (!confirm('Delete?')) return;
  try {
    await API.del('/vault/' + id);
    state.vault = state.vault.filter(v => v.id !== id);
    renderVault(); toast('Deleted.');
  } catch(e) { toast('Error.'); }
}

async function addVaultItem() {
  if (!state.isOwner) return;
  const data = {
    type:     state.vaultType,
    titulo:   document.getElementById('vault-title')?.value.trim()   || '',
    url:      document.getElementById('vault-url')?.value.trim()     || '',
    content:  document.getElementById('vault-content')?.value.trim() || '',
    tags:     document.getElementById('vault-tags')?.value.trim()    || '',
    lang:     document.getElementById('vault-lang')?.value.trim()    || '',
    isPublic: document.getElementById('vault-public')?.checked ?? true
  };
  if (!data.titulo) { toast('Title required.'); return; }
  try {
    const r = await API.post('/vault', data);
    if (r.ok) {
      state.vault.unshift({ id: r.id, ...data, createdAt: Date.now() });
      renderVault(); closeModal('modal-vault'); toast('✦ Added.');
    } else toast('Error: ' + (r.error||'failed'));
  } catch(e) { toast('Error: ' + e.message); }
}

/* ── SOCIALS ── */
function renderSocials() {
  const grid = document.getElementById('socials-grid');
  if (!grid) return;
  const visible = state.socials.filter(s => state.isOwner || s.isPublic !== false);
  if (!visible.length) { grid.innerHTML = '<div class="music-empty">No socials yet.</div>'; return; }
  grid.innerHTML = visible.map(s => {
    const pub = s.isPublic !== false;
    return `<a class="social-card" href="${esc(s.url||'#')}" target="_blank" rel="noopener" style="${!pub&&state.isOwner?'opacity:.6':''}">
      <div class="social-icon">${s.icon||'🔗'}</div>
      <div>
        <div class="social-name">${esc(s.platform||'')}</div>
        ${s.handle?`<div class="social-handle">${esc(s.handle)}</div>`:''}
      </div>
      ${state.isOwner?`<div style="margin-left:auto;display:flex;gap:.25rem">
        <button style="background:none;border:1px solid var(--border);color:var(--text-muted);cursor:pointer;font-size:.52rem;padding:.1rem .3rem;border-radius:2px" onclick="toggleSocial(event,'${s.id}',${pub})">${pub?'Hide':'Show'}</button>
        <button style="background:none;border:none;color:var(--text-muted);cursor:pointer;font-size:.7rem" onclick="deleteSocial(event,'${s.id}')">✕</button>
      </div>`:''}
    </a>`;
  }).join('');
}

async function toggleSocial(e, id, isPub) {
  e.preventDefault(); e.stopPropagation();
  try {
    await API.post('/socials/update', { id, isPublic: !isPub });
    const idx = state.socials.findIndex(s => s.id === id);
    if (idx > -1) state.socials[idx].isPublic = !isPub;
    renderSocials(); toast(!isPub ? '👁 Public.' : '🔒 Hidden.');
  } catch(err) { toast('Error.'); }
}

async function deleteSocial(e, id) {
  e.preventDefault(); e.stopPropagation();
  if (!confirm('Delete?')) return;
  try {
    await API.del('/socials/' + id);
    state.socials = state.socials.filter(s => s.id !== id);
    renderSocials(); toast('Deleted.');
  } catch(err) { toast('Error.'); }
}

async function addSocial() {
  if (!state.isOwner) return;
  const data = {
    platform: document.getElementById('social-platform')?.value.trim() || '',
    url:      document.getElementById('social-url')?.value.trim()      || '',
    handle:   document.getElementById('social-handle')?.value.trim()   || '',
    icon:     document.getElementById('social-icon')?.value.trim()     || '',
    isPublic: document.getElementById('social-public')?.checked ?? true
  };
  if (!data.platform || !data.url) { toast('Platform and URL required.'); return; }
  try {
    const r = await API.post('/socials', data);
    if (r.ok) {
      state.socials.push({ id: r.id, ...data });
      renderSocials(); closeModal('modal-social'); toast('✦ Added.');
    } else toast('Error: ' + (r.error||'failed'));
  } catch(e) { toast('Error: ' + e.message); }
}

/* ── ABOUT ── */
function renderAbout() {
  const txt = document.getElementById('about-text');
  const img = document.getElementById('about-img');
  const ph  = document.getElementById('about-img-placeholder');
  const a   = state.about || {};
  if (txt) txt.textContent = a.text || (state.isOwner ? 'Edit your about section in Setup.' : '');
  if (img) { img.src = a.image || ''; img.style.display = a.image ? '' : 'none'; }
  if (ph)  ph.style.display = a.image ? 'none' : '';
  if (state.isOwner) {
    const inp = document.getElementById('about-text-input'); if (inp) inp.value = a.text || '';
    const url = document.getElementById('about-img-url');   if (url) url.value = a.image || '';
  }
}

async function saveAbout() {
  if (!state.isOwner) return;
  const el = document.getElementById('about-result');
  const data = {
    text:  document.getElementById('about-text-input')?.value.trim() || '',
    image: document.getElementById('about-img-url')?.value.trim()    || ''
  };
  showResult(el, 'Saving…', '');
  try {
    const r = await API.post('/about', data);
    if (!r.ok) { showResult(el, '❌ Failed.', 'err'); return; }
    state.about = data; renderAbout(); showResult(el, '✅ Saved.', 'ok');
  } catch(e) { showResult(el, '❌ ' + e.message, 'err'); }
}

/* ── CV ── */
function renderCV() {
  const c = document.getElementById('cv-content');
  if (!c) return;
  const url = state.profile.cvUrl;
  if (url) {
    c.innerHTML = `<iframe class="cv-embed" src="${esc(url)}" frameborder="0"></iframe>`;
  } else {
    c.innerHTML = '<div class="cv-empty">No CV uploaded yet.</div>';
  }
  if (state.isOwner) {
    const inp = document.getElementById('cv-url'); if (inp) inp.value = url || '';
  }
}

async function saveCV() {
  if (!state.isOwner) return;
  const el  = document.getElementById('cv-result');
  const url = document.getElementById('cv-url')?.value.trim() || '';
  showResult(el, 'Saving…', '');
  try {
    const cur = state.profile;
    const r = await API.post('/profile', { ...cur, cvUrl: url });
    if (!r.ok) { showResult(el, '❌ Failed.', 'err'); return; }
    state.profile = r.profile || { ...cur, cvUrl: url };
    renderCV(); showResult(el, '✅ Saved.', 'ok');
  } catch(e) { showResult(el, '❌ ' + e.message, 'err'); }
}

/* ── SETUP ── */
async function populateSetup() {
  const sv = (id, v) => { const e = document.getElementById(id); if (e && v !== undefined) e.value = v; };
  const p = state.profile;
  sv('cfg-name', p.name); sv('cfg-tagline', p.tagline); sv('cfg-quote', p.quote); sv('cfg-avatar', p.avatar);
  ['Projects','Music','Shorts','Vault','Socials','Cv','About'].forEach(pg => {
    const cb = document.getElementById('show-' + pg.toLowerCase());
    if (cb) cb.checked = p['show' + pg] !== false;
  });

  // Theme
  const savedTheme = localStorage.getItem('kira_theme_name') || 'medieval';
  applyThemeCSS(savedTheme);

  // Load music into setup
  try {
    const r = await API.get('/music');
    if (r.ok) {
      state.musicData = { themeSong: r.themeSong || null, playlists: r.playlists || [] };
      renderMusicSetup();
    }
  } catch(e) {}

  // Load channels
  try {
    const r = await API.get('/channels');
    if (r.ok) { state.channelRows = r.channels || []; renderChannelRows(); }
  } catch(e) {}
}

function renderChannelRows() {
  const c = document.getElementById('channel-list');
  if (!c) return;
  if (!state.channelRows.length) { c.innerHTML = ''; return; }
  c.innerHTML = state.channelRows.map((ch, i) => `
    <div class="channel-row">
      <input class="input" type="text" placeholder="Label (ex: music)" value="${esc(ch.label||'')}" data-ci="${i}" data-cf="label" style="font-family:var(--font-mono);font-size:.65rem">
      <input class="input" type="text" placeholder="Channel ID" value="${esc(ch.id||'')}" data-ci="${i}" data-cf="id" style="font-family:var(--font-mono);font-size:.65rem">
      <button class="channel-del" data-ci="${i}">✕</button>
    </div>
  `).join('');
  c.querySelectorAll('input[data-ci]').forEach(inp => inp.addEventListener('input', function() { state.channelRows[+this.dataset.ci][this.dataset.cf] = this.value; }));
  c.querySelectorAll('.channel-del').forEach(btn => btn.addEventListener('click', function() { state.channelRows.splice(+this.dataset.ci, 1); renderChannelRows(); }));
}

function setupSettingsListeners() {
  document.getElementById('btn-save-profile')?.addEventListener('click', saveProfile);
  document.getElementById('btn-save-music')?.addEventListener('click', saveMusic);
  document.getElementById('btn-save-spotify')?.addEventListener('click', saveSpotifyCreds);
  document.getElementById('btn-save-channels')?.addEventListener('click', saveChannels);
  document.getElementById('btn-test-connection')?.addEventListener('click', testConnection);
  document.getElementById('btn-save-theme')?.addEventListener('click', saveTheme);
  document.getElementById('btn-reset-theme')?.addEventListener('click', resetTheme);
  document.getElementById('btn-save-cv')?.addEventListener('click', saveCV);
  document.getElementById('btn-save-about')?.addEventListener('click', saveAbout);
  document.getElementById('btn-add-project')?.addEventListener('click', openAddProject);
  document.getElementById('btn-add-short')?.addEventListener('click', () => openModal('modal-short'));
  document.getElementById('btn-add-social')?.addEventListener('click', () => openModal('modal-social'));
  document.getElementById('btn-add-vault')?.addEventListener('click', () => openModal('modal-vault'));
  document.getElementById('btn-add-channel')?.addEventListener('click', () => { state.channelRows.push({ id:'', label:'' }); renderChannelRows(); });

  // Theme picker
  document.querySelectorAll('.theme-option').forEach(o => o.addEventListener('click', function() { applyThemeCSS(this.dataset.theme); }));

  // Color pickers
  document.querySelectorAll('.theme-color-picker').forEach(pk => {
    pk.addEventListener('input', function() {
      const inp = this.closest('.color-field')?.querySelector('.theme-color-input');
      if (inp) inp.value = this.value;
      document.documentElement.style.setProperty(this.dataset.var, this.value);
    });
  });
  document.querySelectorAll('.theme-color-input').forEach(inp => {
    inp.addEventListener('input', function() {
      const pk = this.closest('.color-field')?.querySelector('.theme-color-picker');
      if (pk) pk.value = this.value;
      document.documentElement.style.setProperty(pk?.dataset.var || '', this.value);
    });
  });
  const op = document.getElementById('tc-bg-opacity');
  if (op) op.addEventListener('input', function() {
    const lbl = document.getElementById('tc-bg-opacity-val');
    if (lbl) lbl.textContent = parseFloat(this.value).toFixed(2);
    const bg = document.getElementById('bg-img'); if (bg) bg.style.opacity = this.value;
  });

  // Vault modal type btns
  document.querySelectorAll('[data-vt]').forEach(b => b.addEventListener('click', function() {
    document.querySelectorAll('[data-vt]').forEach(x => x.classList.remove('active'));
    this.classList.add('active'); state.vaultType = this.dataset.vt;
    const ug = document.getElementById('vault-url-group');
    const lg = document.getElementById('vault-lang-group');
    const cl = document.getElementById('vault-content-label');
    if (ug) ug.style.display = (state.vaultType==='note'||state.vaultType==='idea') ? 'none' : '';
    if (lg) lg.style.display = state.vaultType==='code' ? '' : 'none';
    if (cl) cl.textContent  = state.vaultType==='code' ? 'Code' : 'Content';
  }));

  // Vault sidebar cats
  document.querySelectorAll('.vault-cat[data-vf]').forEach(c => c.addEventListener('click', function() {
    document.querySelectorAll('.vault-cat[data-vf]').forEach(x => x.classList.remove('active'));
    this.classList.add('active'); state.vaultFilter = this.dataset.vf; renderVault();
  }));
  document.getElementById('vault-search')?.addEventListener('input', renderVault);
}

async function saveProfile() {
  if (!state.isOwner) return;
  const el = document.getElementById('profile-result');
  showResult(el, 'Saving…', '');
  const pages = ['Projects','Music','Shorts','Vault','Socials','Cv','About'];
  const data = {
    name:    document.getElementById('cfg-name')?.value.trim()    || state.profile.name    || 'Kira',
    tagline: document.getElementById('cfg-tagline')?.value.trim() || '',
    quote:   document.getElementById('cfg-quote')?.value.trim()   || '',
    avatar:  document.getElementById('cfg-avatar')?.value.trim()  || '',
    cvUrl:   state.profile.cvUrl || ''
  };
  pages.forEach(pg => { const cb = document.getElementById('show-' + pg.toLowerCase()); if (cb) data['show' + pg] = cb.checked; });
  try {
    const r = await API.post('/profile', data);
    if (!r.ok) { showResult(el, '❌ Failed.', 'err'); return; }
    state.profile = r.profile || { ...state.profile, ...data };
    sessionStorage.setItem('kira_profile', JSON.stringify(state.profile));
    applyProfile(); applyPageVisibility(); showResult(el, '✅ Saved.', 'ok');
  } catch(e) { showResult(el, '❌ ' + e.message, 'err'); }
}

async function saveSpotifyCreds() {
  if (!state.isOwner) return;
  const el = document.getElementById('spotify-result');
  const clientId     = document.getElementById('spotify-client-id')?.value.trim()     || '';
  const clientSecret = document.getElementById('spotify-client-secret')?.value.trim() || '';
  if (!clientId && !clientSecret) { showResult(el, '❌ Fill at least one field.', 'err'); return; }
  showResult(el, 'Saving…', '');
  try {
    const r = await API.post('/spotify/credentials', { clientId, clientSecret });
    showResult(el, r.ok ? '✅ Saved.' : '❌ Failed.', r.ok ? 'ok' : 'err');
  } catch(e) { showResult(el, '❌ ' + e.message, 'err'); }
}

async function saveChannels() {
  if (!state.isOwner) return;
  const el = document.getElementById('channels-result');
  showResult(el, 'Saving…', '');
  try {
    const r = await API.post('/channels', { channels: state.channelRows });
    showResult(el, r.ok ? '✅ Saved.' : '❌ Failed.', r.ok ? 'ok' : 'err');
  } catch(e) { showResult(el, '❌ ' + e.message, 'err'); }
}

async function testConnection() {
  const el = document.getElementById('channels-result');
  showResult(el, 'Testing…', '');
  try {
    const r = await API.get('/public');
    showResult(el, r.ok ? '✅ Connected.' : '❌ Worker error.', r.ok ? 'ok' : 'err');
    setStatus(r.ok ? 'connected' : 'error');
  } catch(e) { showResult(el, '❌ ' + e.message, 'err'); setStatus('error'); }
}

async function saveTheme() {
  if (!state.isOwner) return;
  const el = document.getElementById('theme-result');
  showResult(el, 'Saving…', '');
  const overrides = {
    accent:      document.getElementById('ti-accent')?.value      || '',
    accentLight: document.getElementById('ti-accent-light')?.value|| '',
    bg:          document.getElementById('ti-bg')?.value          || '',
    text:        document.getElementById('ti-text')?.value        || '',
    textDim:     document.getElementById('ti-text-dim')?.value    || '',
    bgUrl:       document.getElementById('tc-bg-url')?.value      || '',
    bgOpacity:   parseFloat(document.getElementById('tc-bg-opacity')?.value || '0.4'),
    themeName:   state.activeTheme
  };
  try {
    const r = await API.post('/theme', overrides);
    if (!r.ok) { showResult(el, '❌ Failed.', 'err'); return; }
    state.theme = overrides;
    sessionStorage.setItem('kira_theme', JSON.stringify(overrides));
    localStorage.setItem('kira_theme_overrides', JSON.stringify(overrides));
    applyThemeOverrides(overrides);
    showResult(el, '✅ Theme saved.', 'ok');
  } catch(e) { showResult(el, '❌ ' + e.message, 'err'); }
}

function resetTheme() {
  localStorage.removeItem('kira_theme_overrides');
  applyThemeCSS(state.activeTheme);
  document.documentElement.removeAttribute('style');
  const bg = document.getElementById('bg-img');
  if (bg) { bg.style.opacity = '0.4'; bg.style.backgroundImage = state.profile.bgUrl ? `url(${state.profile.bgUrl})` : ''; }
}

/* ── MODALS ── */
function setupModals() {
  document.querySelectorAll('.modal-cancel, [data-close]').forEach(b => {
    const target = b.dataset.close || b.closest('.modal-backdrop')?.id;
    if (target) b.addEventListener('click', () => closeModal(target));
  });
  document.querySelectorAll('.modal-backdrop').forEach(m => m.addEventListener('click', function(e) { if (e.target === this) closeModal(this.id); }));
  document.getElementById('btn-confirm-project')?.addEventListener('click', saveProject);
  document.getElementById('btn-confirm-short')?.addEventListener('click', addShort);
  document.getElementById('btn-confirm-vault')?.addEventListener('click', addVaultItem);
  document.getElementById('btn-confirm-social')?.addEventListener('click', addSocial);
}

function openModal(id)    { const m = document.getElementById(id); if (m) m.style.display = 'flex'; }
function closeModal(id)   { const m = document.getElementById(id); if (m) m.style.display = 'none'; }
function closeAllModals() { document.querySelectorAll('.modal-backdrop').forEach(m => m.style.display = 'none'); }

/* ── STATUS ── */
function setStatus(state2) {
  const dot = document.getElementById('discord-dot');
  const lbl = document.getElementById('discord-label');
  const c = { connected:'connected', connecting:'', error:'error' };
  const l = { connected:'Connected', connecting:'Connecting…', error:'Error' };
  if (dot) { dot.className = 'discord-dot ' + (c[state2]||''); }
  if (lbl) lbl.textContent = l[state2] || '';
}

/* ── UTILS ── */
function showResult(el, msg, type) {
  if (!el) return;
  el.textContent = msg; el.style.display = msg ? 'block' : 'none';
  el.className = 'result-msg' + (type ? ' ' + type : '');
}

function toast(msg) {
  const t = document.getElementById('kira-toast');
  if (!t) return;
  t.textContent = msg; t.style.opacity = '1';
  clearTimeout(t._h); t._h = setTimeout(() => t.style.opacity = '0', 3000);
}

function esc(s) {
  return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}
