// Kira Portfolio — app.js
const WORKER = 'https://kira-discord-proxy.ghoullkira.workers.dev';

var cfg = {};
var shorts = [];
var vaultItems = [];
var socials = [];
var isOwner = false;
var currentVaultFilter = 'all';
var currentVaultType = 'link';

// ── DISCORD ───────────────────────────────────────────────────────────────────
var DISCORD = {
  post: async function(path, data) {
    var r = await fetch(WORKER + path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) });
    return r.json();
  },
  get: async function(path) {
    var r = await fetch(WORKER + path);
    return r.json();
  },
  send: async function(type, content) {
    var channels = { link: cfg.links, note: cfg.notes, file: cfg.files, idea: cfg.ideas, code: cfg.code, bg: cfg.bg, socials: cfg.socials, cv: cfg.cv };
    var ch = channels[type];
    if (!ch) return false;
    try { var d = await this.post('/channel/' + ch + '/message', { content: content }); return d.ok; }
    catch(e) { return false; }
  },
  fetchMessages: async function(channelId) {
    try { var d = await this.get('/channel/' + channelId + '/messages?limit=50'); return d.ok ? d.messages : []; }
    catch(e) { return []; }
  }
};

// ── INIT ──────────────────────────────────────────────────────────────────────
window.addEventListener('DOMContentLoaded', async function() {
  // Owner session from login.html
  var ownerFlag = sessionStorage.getItem('kira_owner');
  var storedCfg = sessionStorage.getItem('kira_cfg');
  if (ownerFlag === '1' && storedCfg) {
    try { cfg = JSON.parse(storedCfg); enterOwnerMode(); return; } catch(e) {}
  }
  // Setup redirect
  if (window.location.search.indexOf('setup=1') !== -1) {
    document.getElementById('setup-screen').style.display = 'flex';
    return;
  }
  // Public load
  try {
    var res = await DISCORD.get('/public-config');
    if (res.ok && res.config) {
      cfg = res.config;
      applyProfile();
      fetchBgImage();
      syncPublicData();
    }
  } catch(e) {}
  buildMarquee();
  updateStats();
});

// ── LOGIN MODAL ───────────────────────────────────────────────────────────────
document.getElementById('btn-open-login').addEventListener('click', function() {
  if (isOwner) return;
  document.getElementById('login-screen').style.display = 'flex';
  setTimeout(function() { document.getElementById('login-user').focus(); }, 100);
});
document.getElementById('btn-close-login').addEventListener('click', function() {
  document.getElementById('login-screen').style.display = 'none';
});
document.getElementById('login-screen').addEventListener('click', function(e) {
  if (e.target === this) this.style.display = 'none';
});
document.getElementById('btn-login').addEventListener('click', doLogin);
document.getElementById('login-user').addEventListener('keydown', function(e) { if (e.key === 'Enter') document.getElementById('login-pass').focus(); });
document.getElementById('login-pass').addEventListener('keydown', function(e) { if (e.key === 'Enter') doLogin(); });

async function doLogin() {
  var username = document.getElementById('login-user').value.trim();
  var password = document.getElementById('login-pass').value.trim();
  var btn = document.getElementById('btn-login');
  if (!username || !password) { showLoginMsg(false, 'Thou must provide thy name and seal.'); return; }
  btn.textContent = 'Verifying…'; btn.disabled = true;
  var res;
  try { res = await DISCORD.post('/auth', { username: username, password: password }); }
  catch(e) { btn.textContent = 'Enter the Keep'; btn.disabled = false; showLoginMsg(false, 'The courier cannot be reached.'); return; }
  btn.textContent = 'Enter the Keep'; btn.disabled = false;
  if (!res.ok) { showLoginMsg(false, 'Thy identity is unknown to the Keep.'); return; }
  if (res.firstTime || !res.config) {
    document.getElementById('login-screen').style.display = 'none';
    document.getElementById('setup-screen').style.display = 'flex';
    return;
  }
  cfg = res.config;
  document.getElementById('login-screen').style.display = 'none';
  enterOwnerMode();
}

function showLoginMsg(ok, msg) {
  var el = document.getElementById('login-result');
  el.textContent = msg;
  el.className = 'login-result ' + (ok ? 'ok' : 'err');
}

// ── SETUP ─────────────────────────────────────────────────────────────────────
document.getElementById('btn-setup-save').addEventListener('click', async function() {
  var fields = ['links', 'notes', 'files', 'ideas', 'code', 'bg', 'socials', 'cv'];
  var config = {};
  for (var i = 0; i < fields.length; i++) {
    var el = document.getElementById('setup-' + fields[i]);
    if (el && el.value.trim()) config[fields[i]] = el.value.trim();
  }
  if (!config.links || !config.notes || !config.files || !config.ideas) {
    showMsg('setup-result', false, 'Links, Notes, Files and Ideas are required.'); return;
  }
  var btn = document.getElementById('btn-setup-save');
  btn.textContent = 'Saving…'; btn.disabled = true;
  try {
    var res = await DISCORD.post('/config/save', { config: config });
    if (res.ok) { cfg = config; document.getElementById('setup-screen').style.display = 'none'; enterOwnerMode(); }
    else showMsg('setup-result', false, 'Failed to save. Check channel IDs.');
  } catch(e) { showMsg('setup-result', false, 'Error: ' + e.message); }
  btn.textContent = 'Seal the Covenant'; btn.disabled = false;
});

// ── OWNER MODE ────────────────────────────────────────────────────────────────
function enterOwnerMode() {
  isOwner = true;
  document.querySelectorAll('.owner-only').forEach(function(el) { el.style.display = ''; });
  document.getElementById('btn-logout').style.display = '';
  document.getElementById('nav-settings').style.display = '';
  document.getElementById('btn-open-login').style.display = 'none';
  applyProfile();
  loadSettingsForm();
  fetchBgImage();
  syncFromDiscord();
  updateStats();
}

// ── LOGOUT ────────────────────────────────────────────────────────────────────
document.getElementById('btn-logout').addEventListener('click', function() {
  isOwner = false;
  cfg = {}; shorts = []; vaultItems = []; socials = [];
  sessionStorage.removeItem('kira_owner');
  sessionStorage.removeItem('kira_cfg');
  document.querySelectorAll('.owner-only').forEach(function(el) { el.style.display = 'none'; });
  document.getElementById('btn-logout').style.display = 'none';
  document.getElementById('nav-settings').style.display = 'none';
  document.getElementById('btn-open-login').style.display = '';
  document.getElementById('login-user').value = '';
  document.getElementById('login-pass').value = '';
  renderVault(); renderShorts(); renderSocials();
  showPage('home');
});

// ── SYNC PUBLIC ───────────────────────────────────────────────────────────────
async function syncPublicData() {
  if (!cfg.links && !cfg.notes && !cfg.files && !cfg.ideas) return;
  var types = [
    { key: 'links', type: 'link' }, { key: 'notes', type: 'note' },
    { key: 'files', type: 'file' }, { key: 'ideas', type: 'idea' }
  ];
  var synced = [];
  for (var i = 0; i < types.length; i++) {
    var key = types[i].key; var type = types[i].type;
    if (!cfg[key]) continue;
    var msgs = await DISCORD.fetchMessages(cfg[key]);
    synced = synced.concat(parseMessages(msgs, type));
  }
  vaultItems = synced.filter(function(v) { return v.isPublic; });
  renderVault(); renderTagSidebar(); updateStats();
  if (cfg.socials) {
    var sMsgs = await DISCORD.fetchMessages(cfg.socials);
    socials = parseSocials(sMsgs).filter(function(s) { return s.isPublic; });
    renderSocials();
  }
  if (cfg.cv) loadCurriculum();
}

// ── SYNC OWNER ────────────────────────────────────────────────────────────────
async function syncFromDiscord() {
  if (!cfg.links && !cfg.notes && !cfg.files && !cfg.ideas) return;
  document.getElementById('discord-label').textContent = 'Consulting the courier…';
  var types = [
    { key: 'links', type: 'link' }, { key: 'notes', type: 'note' },
    { key: 'files', type: 'file' }, { key: 'ideas', type: 'idea' }
  ];
  var synced = [];
  for (var i = 0; i < types.length; i++) {
    var key = types[i].key; var type = types[i].type;
    if (!cfg[key]) continue;
    var msgs = await DISCORD.fetchMessages(cfg[key]);
    synced = synced.concat(parseMessages(msgs, type));
  }
  vaultItems = synced;
  renderVault(); renderTagSidebar(); updateStats();
  if (cfg.socials) {
    var sMsgs = await DISCORD.fetchMessages(cfg.socials);
    socials = parseSocials(sMsgs);
    renderSocials();
  }
  if (cfg.cv) loadCurriculum();
  document.getElementById('discord-label').textContent = 'Discord courier: ready';
}

// ── PARSE MESSAGES ────────────────────────────────────────────────────────────
function parseMessages(messages, type) {
  var result = [];
  for (var i = 0; i < messages.length; i++) {
    var m = messages[i];
    if (!m.content || m.content.indexOf('[' + type.toUpperCase() + ']') === -1) continue;
    var lines = m.content.split('\n');
    var tm = lines[0].match(/\*\*\[.*?\]\s(.+?)\*\*/);
    var title = tm ? tm[1] : lines[0].replace(/\*/g, '');
    var url = '';
    for (var j = 0; j < lines.length; j++) { if (lines[j].indexOf('http') === 0) { url = lines[j]; break; } }
    var tagLine = '';
    for (var j = 0; j < lines.length; j++) { if (lines[j].indexOf('Tags:') === 0) { tagLine = lines[j]; break; } }
    var tags = tagLine ? tagLine.replace('Tags: ', '').split(', ').map(function(t) { return t.trim(); }) : [];
    var content = lines.filter(function(l) { return l.indexOf('**') !== 0 && l.indexOf('http') !== 0 && l.indexOf('Tags:') !== 0 && l.trim(); }).join(' ').trim();
    var isPublic = m.content.indexOf('[PRIVATE]') === -1;
    result.push({ id: m.id, type: type, title: title, url: url, content: content, tags: tags, isPublic: isPublic, date: new Date(m.timestamp).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }), fromDiscord: true });
  }
  return result;
}

function parseSocials(messages) {
  var result = [];
  for (var i = 0; i < messages.length; i++) {
    var m = messages[i];
    if (!m.content || m.content.indexOf('SOCIAL:') !== 0) continue;
    try { result.push(JSON.parse(m.content.replace('SOCIAL:', ''))); } catch(e) {}
  }
  return result;
}

// ── BACKGROUND ────────────────────────────────────────────────────────────────
async function fetchBgImage() {
  if (!cfg.bg) return;
  try {
    var msgs = await DISCORD.fetchMessages(cfg.bg);
    if (!msgs || !msgs.length) return;
    for (var i = 0; i < msgs.length; i++) {
      var m = msgs[i];
      if (m.content) { var match = m.content.match(/https?:\/\/\S+/); if (match) { applyBgImage(match[0]); return; } }
      if (m.attachments && m.attachments.length > 0 && m.attachments[0].url) { applyBgImage(m.attachments[0].url); return; }
    }
  } catch(e) {}
}

function applyBgImage(url) {
  var bgImg = document.querySelector('.bg-img');
  if (bgImg) {
    bgImg.style.backgroundImage = 'url(' + url + ')';
    bgImg.style.backgroundSize = 'cover';
    bgImg.style.backgroundPosition = 'center center';
    bgImg.style.backgroundRepeat = 'no-repeat';
  }
}

// ── CURRICULUM ────────────────────────────────────────────────────────────────
async function loadCurriculum() {
  if (!cfg.cv) return;
  try {
    var msgs = await DISCORD.fetchMessages(cfg.cv);
    for (var i = 0; i < msgs.length; i++) {
      if (msgs[i].content && msgs[i].content.indexOf('CV_PDF:') === 0) {
        var pdfUrl = msgs[i].content.replace('CV_PDF:', '').trim();
        var container = document.getElementById('cv-content');
        if (container) container.innerHTML = '<div class="cv-viewer"><iframe src="' + pdfUrl + '#toolbar=0" width="100%" height="800px" style="border:1px solid var(--border);border-radius:3px"></iframe><a href="' + pdfUrl + '" target="_blank" class="btn-ghost" style="display:inline-block;margin-top:1rem">Open Full PDF</a></div>';
        return;
      }
    }
  } catch(e) {}
}

var cvBox = document.getElementById('cv-upload-box');
var cvFileInput = document.getElementById('cv-file-input');
if (cvBox && cvFileInput) {
  cvBox.addEventListener('dragover', function(e) { e.preventDefault(); cvBox.classList.add('drag-over'); });
  cvBox.addEventListener('dragleave', function() { cvBox.classList.remove('drag-over'); });
  cvBox.addEventListener('drop', function(e) {
    e.preventDefault(); cvBox.classList.remove('drag-over');
    var file = e.dataTransfer.files[0];
    if (file && file.type === 'application/pdf') { cvFileInput.files = e.dataTransfer.files; document.getElementById('cv-file-name').textContent = file.name; }
  });
  cvFileInput.addEventListener('change', function() {
    if (cvFileInput.files[0]) document.getElementById('cv-file-name').textContent = cvFileInput.files[0].name;
  });
}
document.getElementById('btn-save-cv').addEventListener('click', function() {
  showMsg('cv-result', false, 'To display a PDF: host it on Google Drive, share with "Anyone with link", then post CV_PDF:https://... in your #vault-cv channel.');
});

// ── SOCIALS ───────────────────────────────────────────────────────────────────
var SOCIAL_ICONS = { instagram: '📸', tiktok: '🎵', youtube: '▶️', twitter: '𝕏', x: '𝕏', linkedin: '💼', github: '💻', twitch: '🎮', discord: '💬', facebook: '👥', snapchat: '👻', pinterest: '📌', reddit: '🔴', spotify: '🎧' };

function renderSocials() {
  var grid = document.getElementById('socials-grid');
  if (!grid) return;
  var visible = isOwner ? socials : socials.filter(function(s) { return s.isPublic; });
  if (!visible.length) { grid.innerHTML = '<div class="socials-empty">No social links added yet.</div>'; return; }
  var html = '';
  for (var i = 0; i < visible.length; i++) {
    var s = visible[i];
    var icon = s.icon || SOCIAL_ICONS[s.platform.toLowerCase()] || '🔗';
    var vis = isOwner ? '<span class="social-vis" data-id="' + s.id + '" title="Toggle visibility">' + (s.isPublic ? '👁️' : '🔒') + '</span>' : '';
    var del = isOwner ? '<button class="social-del" data-id="' + s.id + '" onclick="event.preventDefault();event.stopPropagation()">✕</button>' : '';
    html += '<a class="social-card" href="' + esc(s.url) + '" target="_blank" rel="noopener">'
      + '<div class="social-icon-wrap">' + icon + '</div>'
      + '<div class="social-info"><div class="social-name">' + esc(s.platform) + '</div>'
      + '<div class="social-handle">' + esc(s.handle || '') + '</div></div>'
      + vis + del + '</a>';
  }
  grid.innerHTML = html;
  grid.querySelectorAll('.social-vis').forEach(function(el) {
    el.addEventListener('click', async function(e) {
      e.preventDefault(); e.stopPropagation();
      var id = el.dataset.id;
      for (var i = 0; i < socials.length; i++) {
        if (socials[i].id === id) { socials[i].isPublic = !socials[i].isPublic; await saveSocial(socials[i]); break; }
      }
      renderSocials();
    });
  });
  grid.querySelectorAll('.social-del').forEach(function(el) {
    el.addEventListener('click', async function(e) {
      e.preventDefault(); e.stopPropagation();
      var id = el.dataset.id;
      socials = socials.filter(function(s) { return s.id !== id; });
      await rebuildSocialsChannel();
      renderSocials();
    });
  });
}

document.getElementById('btn-add-social').addEventListener('click', async function() {
  var platform = document.getElementById('social-platform').value.trim();
  var url = document.getElementById('social-url').value.trim();
  var handle = document.getElementById('social-handle').value.trim();
  var icon = document.getElementById('social-icon').value.trim();
  var isPublic = document.getElementById('social-public').checked;
  if (!platform || !url) { showMsg('social-result', false, 'Platform and URL are required.'); return; }
  var social = { id: Date.now().toString(), platform: platform, url: url, handle: handle, icon: icon, isPublic: isPublic };
  socials.push(social);
  await DISCORD.send('socials', 'SOCIAL:' + JSON.stringify(social));
  renderSocials();
  showMsg('social-result', true, 'Social added!');
  document.getElementById('social-platform').value = '';
  document.getElementById('social-url').value = '';
  document.getElementById('social-handle').value = '';
  document.getElementById('social-icon').value = '';
  document.getElementById('social-public').checked = true;
});

async function saveSocial(social) {
  if (!cfg.socials) return;
  var existing = await DISCORD.fetchMessages(cfg.socials);
  for (var i = 0; i < existing.length; i++) {
    var m = existing[i];
    if (m.content && m.content.indexOf('SOCIAL:') === 0) {
      try { var p = JSON.parse(m.content.replace('SOCIAL:', '')); if (p.id === social.id) await DISCORD.post('/channel/' + cfg.socials + '/delete/' + m.id, {}); }
      catch(e) {}
    }
  }
  await DISCORD.send('socials', 'SOCIAL:' + JSON.stringify(social));
}

async function rebuildSocialsChannel() {
  if (!cfg.socials) return;
  var msgs = await DISCORD.fetchMessages(cfg.socials);
  for (var i = 0; i < msgs.length; i++) {
    if (msgs[i].content && msgs[i].content.indexOf('SOCIAL:') === 0)
      await DISCORD.post('/channel/' + cfg.socials + '/delete/' + msgs[i].id, {});
  }
  for (var i = 0; i < socials.length; i++) {
    await DISCORD.send('socials', 'SOCIAL:' + JSON.stringify(socials[i]));
  }
}

// ── NAVIGATION ────────────────────────────────────────────────────────────────
function showPage(id) {
  document.querySelectorAll('.page').forEach(function(p) { p.classList.remove('active'); });
  document.querySelectorAll('.nav-links button').forEach(function(b) { b.classList.toggle('active', b.dataset.page === id); });
  var pg = document.getElementById('page-' + id);
  if (pg) pg.classList.add('active');
  document.querySelector('.nav-links').classList.remove('open');
  if (id === 'vault') { if (isOwner) syncFromDiscord(); else syncPublicData(); }
  if (id === 'socials' && !socials.length) { if (isOwner) syncFromDiscord(); else syncPublicData(); }
}
document.querySelectorAll('.nav-links button[data-page]').forEach(function(b) { b.addEventListener('click', function() { showPage(b.dataset.page); }); });
document.querySelectorAll('[data-goto]').forEach(function(b) { b.addEventListener('click', function() { showPage(b.dataset.goto); }); });
document.getElementById('nav-logo').addEventListener('click', function() { showPage('home'); });
document.getElementById('nav-hamburger').addEventListener('click', function() { document.querySelector('.nav-links').classList.toggle('open'); });

// ── PROFILE ───────────────────────────────────────────────────────────────────
function applyProfile() {
  var name = cfg.profileName || 'Kira';
  var tagline = cfg.profileTagline || 'Short-form content, ideas, and a private vault.';
  var navLogo = document.getElementById('nav-logo');
  if (navLogo) navLogo.innerHTML = name.charAt(0) + '<span>' + name.slice(1) + '</span>';
  var heroTitle = document.getElementById('hero-title');
  var taglineEl = document.getElementById('hero-tagline');
  if (heroTitle) heroTitle.innerHTML = name + '<em>' + (cfg.profileSub || 'creates.') + '</em>';
  if (taglineEl) taglineEl.textContent = tagline;
}

document.getElementById('btn-save-profile').addEventListener('click', async function() {
  cfg.profileName = document.getElementById('cfg-name').value.trim() || 'Kira';
  cfg.profileTagline = document.getElementById('cfg-tagline').value.trim();
  var bgUrlEl = document.getElementById('cfg-bg-url');
  if (bgUrlEl && bgUrlEl.value.trim()) {
    var newUrl = bgUrlEl.value.trim();
    if (cfg.bg) {
      try {
        var old = await DISCORD.fetchMessages(cfg.bg);
        for (var i = 0; i < old.length; i++) await DISCORD.post('/channel/' + cfg.bg + '/delete/' + old[i].id, {});
      } catch(e) {}
      await DISCORD.send('bg', newUrl);
    }
    applyBgImage(newUrl);
    bgUrlEl.value = '';
  }
  applyProfile();
  var res = await DISCORD.post('/config/save', { config: cfg });
  showMsg('profile-result', res.ok, res.ok ? 'Profile saved.' : 'Failed to save.');
});

// ── SETTINGS ──────────────────────────────────────────────────────────────────
function loadSettingsForm() {
  var fields = ['links', 'notes', 'files', 'ideas', 'code', 'bg', 'socials', 'cv'];
  for (var i = 0; i < fields.length; i++) {
    var el = document.getElementById('cfg-ch-' + fields[i]);
    if (el) el.value = cfg[fields[i]] || '';
  }
  document.getElementById('cfg-name').value = cfg.profileName || 'Kira';
  document.getElementById('cfg-tagline').value = cfg.profileTagline || '';
}

document.getElementById('btn-save-config').addEventListener('click', async function() {
  var fields = ['links', 'notes', 'files', 'ideas', 'code', 'bg', 'socials', 'cv'];
  for (var i = 0; i < fields.length; i++) {
    var el = document.getElementById('cfg-ch-' + fields[i]);
    if (el) cfg[fields[i]] = el.value.trim();
  }
  var res = await DISCORD.post('/config/save', { config: cfg });
  showMsg('connection-result', res.ok, res.ok ? 'Saved to Discord.' : 'Failed to save.');
});

document.getElementById('btn-test-connection').addEventListener('click', async function() {
  var chId = document.getElementById('cfg-ch-links').value.trim() || document.getElementById('cfg-ch-notes').value.trim();
  if (!chId) { showMsg('connection-result', false, 'Enter at least one channel ID.'); return; }
  var el = document.getElementById('connection-result');
  el.textContent = 'Testing…'; el.className = 'connection-result'; el.style.display = 'block';
  try {
    var res = await DISCORD.get('/channel/' + chId + '/test');
    showMsg('connection-result', res.ok, res.ok ? 'Connected! #' + res.name : 'Error: ' + res.error);
  } catch(e) { showMsg('connection-result', false, 'Error: ' + e.message); }
});

document.getElementById('btn-reregister-commands').addEventListener('click', async function() {
  showMsg('commands-result', null, 'Registering…');
  try {
    var res = await DISCORD.get('/register-commands?guild=1493192929408319488');
    showMsg('commands-result', res.ok, res.ok ? 'Commands registered: ' + res.registered.join(', ') : 'Failed: ' + JSON.stringify(res.error));
  } catch(e) { showMsg('commands-result', false, 'Error: ' + e.message); }
});

// ── SHORTS ────────────────────────────────────────────────────────────────────
var THUMB_COLORS = ['#2a1a0e', '#0e1a2a', '#1a0e2a', '#0e2a1a', '#1a1a0e', '#2a0e1a'];

function renderShorts(filter) {
  filter = filter || 'all';
  var grid = document.getElementById('shorts-grid');
  var all = isOwner ? shorts : shorts.filter(function(s) { return s.isPublic; });
  var items = filter === 'all' ? all : all.filter(function(s) { return s.cat.toLowerCase() === filter.toLowerCase(); });
  if (!items.length) { grid.innerHTML = '<div class="short-empty">No shorts yet.</div>'; return; }
  var html = '';
  for (var i = 0; i < items.length; i++) {
    var s = items[i];
    var vis = isOwner ? '<div class="item-vis-toggle" style="position:absolute;top:6px;right:6px;z-index:2;cursor:pointer;font-size:0.75rem" data-sid="' + s.id + '">' + (s.isPublic ? '👁️' : '🔒') + '</div>' : '';
    html += '<div class="short-card" style="position:relative"' + (s.url ? ' onclick="window.open(\'' + esc(s.url) + '\',\'_blank\')"' : '') + '>'
      + vis
      + '<div class="short-thumb" style="background:' + THUMB_COLORS[i % THUMB_COLORS.length] + '">'
      + '<div class="thumb-gradient"></div>'
      + '<div class="play-icon"><svg viewBox="0 0 16 16"><polygon points="3,2 13,8 3,14"/></svg></div>'
      + '<div class="thumb-tag">' + esc(s.cat) + '</div></div>'
      + '<div class="short-info"><div class="short-title">' + esc(s.title) + '</div>'
      + '<div class="short-meta"><span class="short-date">' + esc(s.date) + '</span>' + (s.views ? '<span class="short-views">' + esc(s.views) + '</span>' : '') + '</div></div></div>';
  }
  grid.innerHTML = html;
}

function renderFilterBar() {
  var cats = [];
  for (var i = 0; i < shorts.length; i++) { if (cats.indexOf(shorts[i].cat) === -1) cats.push(shorts[i].cat); }
  var bar = document.getElementById('filter-bar');
  var html = '<button class="filter-btn active" data-filter="all">All</button>';
  for (var i = 0; i < cats.length; i++) html += '<button class="filter-btn" data-filter="' + esc(cats[i]) + '">' + esc(cats[i]) + '</button>';
  bar.innerHTML = html;
  bar.querySelectorAll('.filter-btn').forEach(function(b) {
    b.addEventListener('click', function() {
      bar.querySelectorAll('.filter-btn').forEach(function(x) { x.classList.remove('active'); });
      b.classList.add('active'); renderShorts(b.dataset.filter);
    });
  });
}

document.getElementById('btn-add-short').addEventListener('click', function() { openModal('modal-short'); });
document.getElementById('btn-confirm-short').addEventListener('click', async function() {
  var title = document.getElementById('short-title').value.trim();
  var url = document.getElementById('short-url').value.trim();
  var cat = document.getElementById('short-cat').value.trim() || 'Other';
  var views = document.getElementById('short-views').value.trim();
  var isPublic = document.getElementById('short-public').checked;
  if (!title) return;
  document.getElementById('short-saving').style.display = 'block';
  var privTag = isPublic ? '' : ' [PRIVATE]';
  var msg = '📽️ **[SHORT] ' + title + '**' + privTag + '\nCategory: ' + cat + (url ? '\n' + url : '') + (views ? '\nViews: ' + views : '');
  await DISCORD.send('note', msg);
  document.getElementById('short-saving').style.display = 'none';
  shorts.push({ id: Date.now().toString(), title: title, url: url, cat: cat, views: views, isPublic: isPublic, date: new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) });
  renderShorts(); renderFilterBar(); updateStats(); buildMarquee();
  closeModal('modal-short');
  clearForm(['short-title', 'short-url', 'short-cat', 'short-views']);
});

// ── VAULT ─────────────────────────────────────────────────────────────────────
var TYPE_ICON = { link: '⊞', note: '≡', file: '◫', idea: '◇', code: '</>' };

function renderVault(items) {
  var all = items !== undefined ? items : (currentVaultFilter === 'all' ? vaultItems : vaultItems.filter(function(v) { return v.type === currentVaultFilter; }));
  var c = document.getElementById('vault-cards');
  if (!all.length) { c.innerHTML = '<div class="vault-empty">Nothing here yet.</div>'; return; }
  var html = '';
  for (var i = 0; i < all.length; i++) {
    var v = all[i];
    var vis = isOwner ? '<span class="item-vis-toggle" data-vid="' + v.id + '" title="Toggle visibility" style="cursor:pointer;font-size:0.7rem;margin-left:0.3rem">' + (v.isPublic ? '👁️' : '🔒') + '</span>' : '';
    html += '<div class="vault-item"' + (v.url ? ' onclick="window.open(\'' + esc(v.url) + '\',\'_blank\')"' : '') + '>'
      + '<div class="vault-item-type">' + (TYPE_ICON[v.type] || '·') + ' ' + esc(v.type) + vis + '</div>'
      + '<div class="vault-item-title">' + esc(v.title) + '</div>'
      + (v.content ? '<div class="vault-item-preview">' + esc(v.content.substring(0, 90)) + (v.content.length > 90 ? '…' : '') + '</div>' : '')
      + (v.url ? '<div class="vault-item-url">' + esc(v.url.substring(0, 50)) + (v.url.length > 50 ? '…' : '') + '</div>' : '')
      + '<div class="vault-item-footer"><div style="display:flex;gap:0.35rem;flex-wrap:wrap;">'
      + v.tags.map(function(t) { return '<span class="vault-tag">' + esc(t) + '</span>'; }).join('')
      + '</div><span class="vault-date">' + esc(v.date) + '</span></div></div>';
  }
  c.innerHTML = html;
}

function renderTagSidebar() {
  var allTags = [];
  for (var i = 0; i < vaultItems.length; i++) {
    var tags = vaultItems[i].tags || [];
    for (var j = 0; j < tags.length; j++) { if (allTags.indexOf(tags[j]) === -1) allTags.push(tags[j]); }
  }
  var s = document.getElementById('tag-sidebar');
  if (!allTags.length) { s.innerHTML = ''; return; }
  var html = '<div class="vault-sidebar-title" style="padding-top:0">Tags</div>';
  for (var i = 0; i < allTags.length; i++) html += '<div class="vault-cat" data-tag="' + esc(allTags[i]) + '"><span class="vault-cat-icon">◈</span> ' + esc(allTags[i]) + '</div>';
  s.innerHTML = html;
  s.querySelectorAll('[data-tag]').forEach(function(el) {
    el.addEventListener('click', function() {
      document.querySelectorAll('.vault-cat').forEach(function(b) { b.classList.remove('active'); });
      el.classList.add('active');
      renderVault(vaultItems.filter(function(v) { return (v.tags || []).indexOf(el.dataset.tag) !== -1; }));
    });
  });
}

document.querySelectorAll('.vault-cat[data-vault-filter]').forEach(function(el) {
  el.addEventListener('click', function() {
    document.querySelectorAll('.vault-cat').forEach(function(b) { b.classList.remove('active'); });
    el.classList.add('active'); currentVaultFilter = el.dataset.vaultFilter; renderVault();
  });
});

document.getElementById('vault-search-input').addEventListener('input', function(e) {
  var q = e.target.value.trim().toLowerCase();
  if (!q) { renderVault(); return; }
  renderVault(vaultItems.filter(function(v) {
    return v.title.toLowerCase().indexOf(q) !== -1 || (v.content || '').toLowerCase().indexOf(q) !== -1 || (v.tags || []).some(function(t) { return t.toLowerCase().indexOf(q) !== -1; });
  }));
});

document.getElementById('btn-add-vault').addEventListener('click', function() { openModal('modal-vault'); });

document.querySelectorAll('.type-opt').forEach(function(b) {
  b.addEventListener('click', function() {
    currentVaultType = b.dataset.type;
    document.querySelectorAll('.type-opt').forEach(function(x) { x.classList.remove('active'); });
    b.classList.add('active');
    document.getElementById('vault-url-group').style.display = currentVaultType === 'link' ? 'block' : 'none';
    document.getElementById('vault-file-group').style.display = currentVaultType === 'file' ? 'block' : 'none';
    document.getElementById('vault-lang-group').style.display = currentVaultType === 'code' ? 'block' : 'none';
    var cl = document.getElementById('vault-content-label');
    if (cl) cl.textContent = currentVaultType === 'code' ? 'Code' : currentVaultType === 'note' ? 'Note Content' : 'Content / Notes';
  });
});

// File drop zone
(function() {
  var dropZone = document.getElementById('vault-file-drop');
  var fileInput = document.getElementById('vault-file-input');
  if (!dropZone || !fileInput) return;
  dropZone.addEventListener('click', function() { fileInput.click(); });
  dropZone.addEventListener('dragover', function(e) { e.preventDefault(); dropZone.classList.add('drag-over'); });
  dropZone.addEventListener('dragleave', function() { dropZone.classList.remove('drag-over'); });
  dropZone.addEventListener('drop', function(e) {
    e.preventDefault(); dropZone.classList.remove('drag-over');
    var file = e.dataTransfer.files[0];
    if (file) { fileInput.files = e.dataTransfer.files; document.getElementById('vault-file-label').textContent = file.name; }
  });
  fileInput.addEventListener('change', function() {
    if (fileInput.files[0]) document.getElementById('vault-file-label').textContent = fileInput.files[0].name;
  });
})();

document.getElementById('btn-confirm-vault').addEventListener('click', async function() {
  var title = document.getElementById('vault-title').value.trim();
  var urlVal = document.getElementById('vault-url') ? document.getElementById('vault-url').value.trim() : '';
  var fileUrlVal = document.getElementById('vault-file-url') ? document.getElementById('vault-file-url').value.trim() : '';
  var txtContent = document.getElementById('vault-content').value.trim();
  var tags = document.getElementById('vault-tags').value.trim().split(',').map(function(t) { return t.trim(); }).filter(Boolean);
  var isPublic = document.getElementById('vault-public').checked;
  var lang = document.getElementById('vault-lang') ? document.getElementById('vault-lang').value.trim() : '';
  if (!title) return;
  document.getElementById('vault-saving').style.display = 'block';
  var emoji = { link: '🔗', note: '📝', file: '📁', idea: '💡', code: '💻' }[currentVaultType] || '📌';
  var privTag = isPublic ? '' : ' [PRIVATE]';
  var msg = emoji + ' **[' + currentVaultType.toUpperCase() + '] ' + title + '**' + privTag;
  var finalUrl = urlVal;
  var finalContent = txtContent;

  // File upload handling
  if (currentVaultType === 'file') {
    var fileInput = document.getElementById('vault-file-input');
    if (fileInput && fileInput.files && fileInput.files[0]) {
      var file = fileInput.files[0];
      var ext = file.name.split('.').pop().toLowerCase();
      var textExts = ['txt', 'js', 'ts', 'py', 'cs', 'java', 'html', 'css', 'json', 'md', 'xml', 'csv', 'sh', 'sql'];
      if (textExts.indexOf(ext) !== -1 && file.size < 1800000) {
        finalContent = await new Promise(function(resolve, reject) {
          var reader = new FileReader();
          reader.onload = function(e) { resolve(e.target.result); };
          reader.onerror = reject;
          reader.readAsText(file);
        });
        msg += '\nFilename: ' + file.name;
        if (tags.length) msg += '\nTags: ' + tags.join(', ');
        msg += '\n```' + ext + '\n' + finalContent.substring(0, 1500) + (finalContent.length > 1500 ? '\n[truncated…]' : '') + '\n```';
        await DISCORD.send('file', msg);
        document.getElementById('vault-saving').style.display = 'none';
        vaultItems.push({ id: Date.now().toString(), type: 'file', title: title, url: '', content: finalContent.substring(0, 200), tags: tags, isPublic: isPublic, date: new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) });
        renderVault(); renderTagSidebar(); updateStats();
        closeModal('modal-vault');
        clearForm(['vault-title', 'vault-url', 'vault-content', 'vault-tags', 'vault-lang', 'vault-file-url']);
        document.getElementById('vault-file-label').textContent = 'Drag & drop or click to browse';
        fileInput.value = '';
        return;
      }
    }
    finalUrl = fileUrlVal || urlVal;
  }

  if (lang && currentVaultType === 'code') msg += '\nLanguage: ' + lang;
  if (finalUrl) msg += '\n' + finalUrl;
  if (finalContent && currentVaultType === 'code') msg += '\n```' + lang + '\n' + finalContent + '\n```';
  else if (finalContent) msg += '\n' + finalContent;
  if (tags.length) msg += '\nTags: ' + tags.join(', ');

  await DISCORD.send(currentVaultType, msg);
  document.getElementById('vault-saving').style.display = 'none';
  vaultItems.push({ id: Date.now().toString(), type: currentVaultType, title: title, url: finalUrl, content: finalContent.substring(0, 200), tags: tags, isPublic: isPublic, date: new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) });
  renderVault(); renderTagSidebar(); updateStats();
  closeModal('modal-vault');
  clearForm(['vault-title', 'vault-url', 'vault-content', 'vault-tags', 'vault-lang', 'vault-file-url']);
  if (document.getElementById('vault-file-label')) document.getElementById('vault-file-label').textContent = 'Drag & drop or click to browse';
  if (document.getElementById('vault-file-input')) document.getElementById('vault-file-input').value = '';
});

// ── STATS & MARQUEE ───────────────────────────────────────────────────────────
function updateStats() {
  document.getElementById('stat-shorts').textContent = shorts.length;
  document.getElementById('stat-items').textContent = vaultItems.length;
  var allTags = [];
  for (var i = 0; i < vaultItems.length; i++) { var t = vaultItems[i].tags || []; for (var j = 0; j < t.length; j++) { if (allTags.indexOf(t[j]) === -1) allTags.push(t[j]); } }
  document.getElementById('stat-tags').textContent = allTags.length;
}

function buildMarquee() {
  var el = document.getElementById('marquee-inner');
  if (!el) return;
  var cats = shorts.length ? [] : ['Shorts', 'Links', 'Notes', 'Ideas', 'Files'];
  if (shorts.length) { for (var i = 0; i < shorts.length; i++) { if (cats.indexOf(shorts[i].cat) === -1) cats.push(shorts[i].cat); } }
  var html = '';
  var doubled = cats.concat(cats);
  for (var i = 0; i < doubled.length; i++) html += '<span class="marquee-item"><span>✦</span>' + esc(doubled[i]) + '</span>';
  el.innerHTML = html + html;
}

// ── MODALS ────────────────────────────────────────────────────────────────────
function openModal(id) { document.getElementById(id).classList.add('open'); }
function closeModal(id) { document.getElementById(id).classList.remove('open'); }
document.querySelectorAll('[data-close]').forEach(function(b) { b.addEventListener('click', function() { closeModal(b.dataset.close); }); });
document.querySelectorAll('.modal-backdrop').forEach(function(b) { b.addEventListener('click', function(e) { if (e.target === b) closeModal(b.id); }); });
document.addEventListener('keydown', function(e) { if (e.key === 'Escape') document.querySelectorAll('.modal-backdrop.open').forEach(function(m) { closeModal(m.id); }); });

// ── UTILS ─────────────────────────────────────────────────────────────────────
function esc(s) { return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }
function clearForm(ids) { ids.forEach(function(id) { var el = document.getElementById(id); if (el) el.value = ''; }); }
function showMsg(id, ok, msg) {
  var el = document.getElementById(id);
  if (!el) return;
  el.textContent = msg;
  el.className = 'connection-result ' + (ok === true ? 'ok' : ok === false ? 'err' : '');
  el.style.display = 'block';
  if (ok !== null) setTimeout(function() { el.style.display = 'none'; }, 4000);
}
