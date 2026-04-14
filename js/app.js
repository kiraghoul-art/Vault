// Kira Portfolio — app.js
// Public mode: everyone sees public content
// Owner mode: login reveals edit controls + private content

const WORKER = 'https://kira-discord-proxy.ghoullkira.workers.dev';

let cfg        = {};
let shorts     = [];
let vaultItems = [];
let socials    = [];
let isOwner    = false;
let currentVaultFilter = 'all';
let currentVaultType   = 'link';

// ── DISCORD ───────────────────────────────────────────────────────────────────
const DISCORD = {
  async post(path, data) {
    const r = await fetch(WORKER + path, { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify(data) });
    return r.json();
  },
  async get(path) {
    const r = await fetch(WORKER + path);
    return r.json();
  },
  async send(type, content) {
    const ch = {link:cfg.links,note:cfg.notes,file:cfg.files,idea:cfg.ideas,code:cfg.code,bg:cfg.bg,socials:cfg.socials,cv:cfg.cv}[type];
    if (!ch) return false;
    try { const d = await this.post('/channel/'+ch+'/message',{content}); return d.ok; }
    catch { return false; }
  },
  async fetchMessages(channelId) {
    try { const d = await this.get('/channel/'+channelId+'/messages?limit=50'); return d.ok ? d.messages : []; }
    catch { return []; }
  }
};

// ── PUBLIC INIT (runs immediately, no login needed) ───────────────────────────
window.addEventListener('DOMContentLoaded', async function() {
  // Check if coming from login.html with owner session
  const ownerFlag = sessionStorage.getItem('kira_owner');
  const storedCfg = sessionStorage.getItem('kira_cfg');
  if (ownerFlag === '1' && storedCfg) {
    try {
      cfg = JSON.parse(storedCfg);
      enterOwnerMode();
      return;
    } catch(e) {}
  }
  // Check setup redirect
  if (window.location.search.includes('setup=1')) {
    document.getElementById('setup-screen').style.display = 'flex';
    return;
  }
  // Normal public load
  try {
    const res = await DISCORD.get('/public-config');
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
  if (isOwner) return; // already logged in
  document.getElementById('login-screen').style.display = 'flex';
  setTimeout(function(){ document.getElementById('login-user').focus(); }, 100);
});
document.getElementById('btn-close-login').addEventListener('click', function() {
  document.getElementById('login-screen').style.display = 'none';
});
document.getElementById('login-screen').addEventListener('click', function(e) {
  if (e.target === this) this.style.display = 'none';
});

document.getElementById('btn-login').addEventListener('click', doLogin);
['login-user','login-pass'].forEach(function(id) {
  document.getElementById(id).addEventListener('keydown', function(e) { if (e.key==='Enter') doLogin(); });
});

async function doLogin() {
  const username = document.getElementById('login-user').value.trim();
  const password = document.getElementById('login-pass').value.trim();
  const btn      = document.getElementById('btn-login');
  if (!username || !password) { showLoginMsg(false,'Thou must provide thy name and seal.'); return; }
  btn.textContent = 'Verifying…'; btn.disabled = true;
  let res;
  try { res = await DISCORD.post('/auth',{username,password}); }
  catch(e) { btn.textContent='Enter the Keep'; btn.disabled=false; showLoginMsg(false,'The courier cannot be reached.'); return; }
  btn.textContent = 'Enter the Keep'; btn.disabled = false;
  if (!res.ok) { showLoginMsg(false,'Thy identity is unknown to the Keep.'); return; }
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
  const el = document.getElementById('login-result');
  el.textContent = msg;
  el.className = 'login-result '+(ok?'ok':'err');
}

// ── SETUP (first time) ────────────────────────────────────────────────────────
document.getElementById('btn-setup-save').addEventListener('click', async function() {
  const fields = ['links','notes','files','ideas','code','bg','socials','cv'];
  const config = {};
  for (const f of fields) {
    const val = document.getElementById('setup-'+f).value.trim();
    if (val) config[f] = val;
  }
  if (!config.links||!config.notes||!config.files||!config.ideas) { showMsg('setup-result',false,'Links, Notes, Files and Ideas are required.'); return; }
  const btn = document.getElementById('btn-setup-save');
  btn.textContent='Saving…'; btn.disabled=true;
  try {
    const res = await DISCORD.post('/config/save',{config});
    if (res.ok) { cfg=config; document.getElementById('setup-screen').style.display='none'; enterOwnerMode(); }
    else showMsg('setup-result',false,'Failed to save. Check channel IDs.');
  } catch(e) { showMsg('setup-result',false,'Error: '+e.message); }
  btn.textContent='Seal the Covenant'; btn.disabled=false;
});

// ── OWNER MODE ────────────────────────────────────────────────────────────────
function enterOwnerMode() {
  isOwner = true;
  // Show owner-only elements
  document.querySelectorAll('.owner-only').forEach(function(el){ el.style.display=''; });
  document.getElementById('btn-logout').style.display = '';
  document.getElementById('nav-settings').style.display = '';
  document.getElementById('btn-open-login').style.display = 'none';
  // Change sword icon to indicate logged in
  applyProfile();
  loadSettingsForm();
  fetchBgImage();
  syncFromDiscord(); // full sync including private
  updateStats();
}

// ── LOGOUT ────────────────────────────────────────────────────────────────────
document.getElementById('btn-logout').addEventListener('click', function() {
  isOwner = false;
  cfg = {}; shorts = []; vaultItems = []; socials = [];
  sessionStorage.removeItem('kira_owner');
  sessionStorage.removeItem('kira_cfg');
  document.querySelectorAll('.owner-only').forEach(function(el){ el.style.display='none'; });
  document.getElementById('btn-logout').style.display = 'none';
  document.getElementById('nav-settings').style.display = 'none';
  document.getElementById('btn-open-login').style.display = '';
  document.getElementById('login-user').value = '';
  document.getElementById('login-pass').value = '';
  renderVault(); renderShorts(); renderSocials();
  showPage('home');
});

// ── SYNC PUBLIC (no login) ────────────────────────────────────────────────────
async function syncPublicData() {
  if (!cfg.links && !cfg.notes && !cfg.files && !cfg.ideas) return;
  const types = [{key:'links',type:'link'},{key:'notes',type:'note'},{key:'files',type:'file'},{key:'ideas',type:'idea'}];
  let synced = [];
  for (const {key,type} of types) {
    if (!cfg[key]) continue;
    const msgs = await DISCORD.fetchMessages(cfg[key]);
    synced = synced.concat(parseMessages(msgs,type));
  }
  // Public only shows items with [PUBLIC] tag
  vaultItems = synced.filter(function(v){ return v.isPublic; });
  renderVault(); renderTagSidebar(); updateStats();
  // Socials
  if (cfg.socials) {
    const sMsgs = await DISCORD.fetchMessages(cfg.socials);
    socials = parseSocials(sMsgs).filter(function(s){ return s.isPublic; });
    renderSocials();
  }
  // CV
  if (cfg.cv) loadCurriculum();
}

// ── SYNC FULL (owner) ─────────────────────────────────────────────────────────
async function syncFromDiscord() {
  if (!cfg.links && !cfg.notes && !cfg.files && !cfg.ideas) return;
  document.getElementById('discord-label').textContent = 'Consulting the courier…';
  const types = [{key:'links',type:'link'},{key:'notes',type:'note'},{key:'files',type:'file'},{key:'ideas',type:'idea'}];
  let synced = [];
  for (const {key,type} of types) {
    if (!cfg[key]) continue;
    const msgs = await DISCORD.fetchMessages(cfg[key]);
    synced = synced.concat(parseMessages(msgs,type));
  }
  vaultItems = synced; // owner sees all
  renderVault(); renderTagSidebar(); updateStats();
  if (cfg.socials) {
    const sMsgs = await DISCORD.fetchMessages(cfg.socials);
    socials = parseSocials(sMsgs);
    renderSocials();
  }
  if (cfg.cv) loadCurriculum();
  document.getElementById('discord-label').textContent = 'Discord courier: ready';
}

// ── PARSE MESSAGES ────────────────────────────────────────────────────────────
function parseMessages(messages, type) {
  return messages
    .filter(function(m){ return m.content && m.content.includes('['+type.toUpperCase()+']'); })
    .map(function(m) {
      const lines   = m.content.split('\n');
      const tm      = lines[0].match(/\*\*\[.*?\]\s(.+?)\*\*/);
      const title   = tm ? tm[1] : lines[0].replace(/\*/g,'');
      const url     = lines.find(function(l){ return l.startsWith('http'); }) || '';
      const tagLine = lines.find(function(l){ return l.startsWith('Tags:'); });
      const tags    = tagLine ? tagLine.replace('Tags: ','').split(', ').map(function(t){ return t.trim(); }) : [];
      const content = lines.filter(function(l){ return !l.startsWith('**')&&!l.startsWith('http')&&!l.startsWith('Tags:')&&l.trim(); }).join(' ').trim();
      const isPublic = m.content.includes('[PUBLIC]');
      return { id:m.id, type, title, url, content, tags, isPublic, date:new Date(m.timestamp).toLocaleDateString('en-GB',{day:'2-digit',month:'short',year:'numeric'}), fromDiscord:true };
    });
}

function parseSocials(messages) {
  return messages
    .filter(function(m){ return m.content && m.content.startsWith('SOCIAL:'); })
    .map(function(m) {
      try { return JSON.parse(m.content.replace('SOCIAL:','')); }
      catch { return null; }
    })
    .filter(Boolean);
}

// ── BACKGROUND IMAGE ──────────────────────────────────────────────────────────
async function fetchBgImage() {
  if (!cfg.bg) return;
  try {
    const msgs = await DISCORD.fetchMessages(cfg.bg);
    if (!msgs||!msgs.length) return;
    for (let i=0; i<msgs.length; i++) {
      const m = msgs[i];
      if (m.content) { const match = m.content.match(/https?:\/\/\S+/); if (match) { applyBgImage(match[0]); return; } }
      if (m.attachments&&m.attachments.length>0&&m.attachments[0].url) { applyBgImage(m.attachments[0].url); return; }
    }
  } catch(e) { console.warn('fetchBgImage failed:',e); }
}

function applyBgImage(url) {
  const bgImg = document.querySelector('.bg-img');
  if (bgImg) {
    bgImg.style.backgroundImage = 'url('+url+')';
    bgImg.style.backgroundSize = 'cover';
    bgImg.style.backgroundPosition = 'center center';
    bgImg.style.backgroundRepeat = 'no-repeat';
  }
  document.documentElement.style.setProperty('--bg-image','url('+url+')');
}

// ── CURRICULUM ────────────────────────────────────────────────────────────────
async function loadCurriculum() {
  if (!cfg.cv) return;
  try {
    const msgs = await DISCORD.fetchMessages(cfg.cv);
    const cvMsg = msgs.find(function(m){ return m.content && m.content.startsWith('CV_PDF:'); });
    if (cvMsg) {
      const pdfUrl = cvMsg.content.replace('CV_PDF:','').trim();
      const container = document.getElementById('cv-content');
      container.innerHTML = '<div class="cv-viewer"><iframe src="'+pdfUrl+'#toolbar=0" width="100%" height="800px" style="border:1px solid var(--border);border-radius:3px"></iframe><a href="'+pdfUrl+'" target="_blank" class="btn-ghost" style="display:inline-block;margin-top:1rem">Open Full PDF</a></div>';
    }
  } catch(e) {}
}

// CV upload
document.getElementById('cv-file-input').addEventListener('change', function() {
  const file = this.files[0];
  if (file) document.getElementById('cv-file-name').textContent = file.name;
});
const cvBox = document.getElementById('cv-upload-box');
cvBox.addEventListener('dragover', function(e){ e.preventDefault(); cvBox.classList.add('drag-over'); });
cvBox.addEventListener('dragleave', function(){ cvBox.classList.remove('drag-over'); });
cvBox.addEventListener('drop', function(e){
  e.preventDefault(); cvBox.classList.remove('drag-over');
  const file = e.dataTransfer.files[0];
  if (file && file.type==='application/pdf') {
    document.getElementById('cv-file-input').files = e.dataTransfer.files;
    document.getElementById('cv-file-name').textContent = file.name;
  }
});
document.getElementById('btn-save-cv').addEventListener('click', async function() {
  const file = document.getElementById('cv-file-input').files[0];
  if (!file) { showMsg('cv-result',false,'No file selected.'); return; }
  showMsg('cv-result',null,'Uploading… (paste a direct PDF URL for now)');
  // For now, save URL — full upload requires file hosting
  showMsg('cv-result',false,'To display a PDF, host it on Google Drive or Imgur and paste the direct URL in the Discord #vault-cv channel as: CV_PDF:https://...');
});

// ── SOCIALS ───────────────────────────────────────────────────────────────────
const SOCIAL_ICONS = {
  instagram:'📸', tiktok:'🎵', youtube:'▶️', twitter:'𝕏', x:'𝕏',
  linkedin:'💼', github:'💻', twitch:'🎮', discord:'💬', facebook:'👥',
  snapchat:'👻', pinterest:'📌', reddit:'🔴', spotify:'🎧'
};

function renderSocials() {
  const grid = document.getElementById('socials-grid');
  const visible = isOwner ? socials : socials.filter(function(s){ return s.isPublic; });
  if (!visible.length) { grid.innerHTML = '<div class="socials-empty">No social links added yet.</div>'; return; }
  grid.innerHTML = visible.map(function(s) {
    const icon = s.icon || SOCIAL_ICONS[s.platform.toLowerCase()] || '🔗';
    const vis  = isOwner ? '<span class="social-vis" data-id="'+s.id+'" title="Toggle visibility">'+( s.isPublic?'👁️':'🔒')+'</span>' : '';
    const del  = isOwner ? '<button class="social-del" data-id="'+s.id+'">✕</button>' : '';
    return '<a class="social-card" href="'+esc(s.url)+'" target="_blank" rel="noopener">'
      +'<div class="social-icon-wrap">'+icon+'</div>'
      +'<div class="social-info"><div class="social-name">'+esc(s.platform)+'</div>'
      +'<div class="social-handle">'+esc(s.handle||'')+'</div></div>'
      +vis+del+'</a>';
  }).join('');
  // Toggle visibility
  grid.querySelectorAll('.social-vis').forEach(function(el){
    el.addEventListener('click', async function(e){
      e.preventDefault(); e.stopPropagation();
      const id = el.dataset.id;
      const s = socials.find(function(x){ return x.id===id; });
      if (s) { s.isPublic = !s.isPublic; await saveSocial(s); renderSocials(); }
    });
  });
  // Delete
  grid.querySelectorAll('.social-del').forEach(function(el){
    el.addEventListener('click', async function(e){
      e.preventDefault(); e.stopPropagation();
      const id = el.dataset.id;
      socials = socials.filter(function(s){ return s.id!==id; });
      await rebuildSocialsChannel();
      renderSocials();
    });
  });
}

document.getElementById('btn-add-social').addEventListener('click', async function() {
  const platform = document.getElementById('social-platform').value.trim();
  const url      = document.getElementById('social-url').value.trim();
  const handle   = document.getElementById('social-handle').value.trim();
  const icon     = document.getElementById('social-icon').value.trim();
  const isPublic = document.getElementById('social-public').checked;
  if (!platform||!url) { showMsg('social-result',false,'Platform and URL are required.'); return; }
  const social = { id: Date.now().toString(), platform, url, handle, icon, isPublic };
  socials.push(social);
  await saveSocial(social);
  renderSocials();
  showMsg('social-result',true,'Social added!');
  ['social-platform','social-url','social-handle','social-icon'].forEach(function(id){ document.getElementById(id).value=''; });
  document.getElementById('social-public').checked = true;
});

async function saveSocial(social) {
  if (!cfg.socials) return;
  await DISCORD.send('socials', 'SOCIAL:'+JSON.stringify(social));
}

async function rebuildSocialsChannel() {
  // Delete all and repost
  if (!cfg.socials) return;
  const msgs = await DISCORD.fetchMessages(cfg.socials);
  for (const m of msgs) {
    if (m.content&&m.content.startsWith('SOCIAL:'))
      await DISCORD.post('/channel/'+cfg.socials+'/delete/'+m.id,{});
  }
  for (const s of socials) {
    await DISCORD.send('socials','SOCIAL:'+JSON.stringify(s));
  }
}

// ── NAVIGATION ────────────────────────────────────────────────────────────────
function showPage(id) {
  document.querySelectorAll('.page').forEach(function(p){ p.classList.remove('active'); });
  document.querySelectorAll('.nav-links button').forEach(function(b){ b.classList.toggle('active', b.dataset.page===id); });
  const pg = document.getElementById('page-'+id);
  if (pg) pg.classList.add('active');
  document.querySelector('.nav-links').classList.remove('open');
  if (id==='vault') { if(isOwner) syncFromDiscord(); else syncPublicData(); }
  if (id==='socials' && !socials.length) { if(isOwner) syncFromDiscord(); else syncPublicData(); }
}
document.querySelectorAll('.nav-links button[data-page]').forEach(function(b){ b.addEventListener('click', function(){ showPage(b.dataset.page); }); });
document.querySelectorAll('[data-goto]').forEach(function(b){ b.addEventListener('click', function(){ showPage(b.dataset.goto); }); });
document.getElementById('nav-logo').addEventListener('click', function(){ showPage('home'); });
document.getElementById('nav-hamburger').addEventListener('click', function(){ document.querySelector('.nav-links').classList.toggle('open'); });

// ── PROFILE ───────────────────────────────────────────────────────────────────
function applyProfile() {
  const name    = cfg.profileName    || 'Kira';
  const tagline = cfg.profileTagline || 'Short-form content, ideas, and a private vault.';
  const navLogo = document.getElementById('nav-logo');
  if (navLogo) navLogo.innerHTML = name.charAt(0)+'<span>'+name.slice(1)+'</span>';
  const heroTitle = document.getElementById('hero-title');
  const taglineEl = document.getElementById('hero-tagline');
  if (heroTitle) heroTitle.innerHTML = name+'<em>'+(cfg.profileSub||'creates.')+'</em>';
  if (taglineEl) taglineEl.textContent = tagline;
}
document.getElementById('btn-save-profile').addEventListener('click', async function() {
  cfg.profileName    = document.getElementById('cfg-name').value.trim() || 'Kira';
  cfg.profileTagline = document.getElementById('cfg-tagline').value.trim();
  const bgUrlEl = document.getElementById('cfg-bg-url');
  if (bgUrlEl && bgUrlEl.value.trim()) {
    const newUrl = bgUrlEl.value.trim();
    if (cfg.bg) {
      try {
        const old = await DISCORD.fetchMessages(cfg.bg);
        for (const m of old) await DISCORD.post('/channel/'+cfg.bg+'/delete/'+m.id,{});
      } catch(e){}
      await DISCORD.send('bg', newUrl);
    }
    applyBgImage(newUrl);
    bgUrlEl.value = '';
  }
  applyProfile();
  const res = await DISCORD.post('/config/save',{config:cfg});
  showMsg('profile-result',res.ok,res.ok?'Profile saved.':'Failed to save.');
});

// ── SETTINGS ──────────────────────────────────────────────────────────────────
function loadSettingsForm() {
  ['links','notes','files','ideas','code'].forEach(function(f){
    const el = document.getElementById('cfg-ch-'+f); if(el) el.value = cfg[f]||'';
  });
  if(document.getElementById('cfg-ch-bg')) document.getElementById('cfg-ch-bg').value = cfg.bg||'';
  if(document.getElementById('cfg-ch-socials')) document.getElementById('cfg-ch-socials').value = cfg.socials||'';
  if(document.getElementById('cfg-ch-cv')) document.getElementById('cfg-ch-cv').value = cfg.cv||'';
  document.getElementById('cfg-name').value    = cfg.profileName    || 'Kira';
  document.getElementById('cfg-tagline').value = cfg.profileTagline || '';
}
document.getElementById('btn-save-config').addEventListener('click', async function() {
  ['links','notes','files','ideas','code','bg'].forEach(function(f){
    const el = document.getElementById('cfg-ch-'+f); if(el) cfg[f]=el.value.trim();
  });
  if(document.getElementById('cfg-ch-socials')) cfg.socials=document.getElementById('cfg-ch-socials').value.trim();
  if(document.getElementById('cfg-ch-cv')) cfg.cv=document.getElementById('cfg-ch-cv').value.trim();
  const res = await DISCORD.post('/config/save',{config:cfg});
  showMsg('connection-result',res.ok,res.ok?'Saved to Discord.':'Failed to save.');
});
document.getElementById('btn-test-connection').addEventListener('click', async function() {
  const chId = document.getElementById('cfg-ch-links').value.trim()||document.getElementById('cfg-ch-notes').value.trim();
  if (!chId) { showMsg('connection-result',false,'Enter at least one channel ID.'); return; }
  const el = document.getElementById('connection-result');
  el.textContent='Testing…'; el.className='connection-result'; el.style.display='block';
  try { const res = await DISCORD.get('/channel/'+chId+'/test'); showMsg('connection-result',res.ok,res.ok?'Connected! #'+res.name:'Error: '+res.error); }
  catch(e) { showMsg('connection-result',false,'Error: '+e.message); }
});
document.getElementById('btn-reregister-commands').addEventListener('click', async function() {
  showMsg('commands-result',null,'Registering…');
  try {
    const res = await DISCORD.get('/register-commands?guild=1493192929408319488');
    showMsg('commands-result',res.ok,res.ok?'Commands registered: '+res.registered.join(', '):'Failed: '+JSON.stringify(res.error));
  } catch(e) { showMsg('commands-result',false,'Error: '+e.message); }
});

// ── SHORTS ────────────────────────────────────────────────────────────────────
const THUMB_COLORS = ['#2a1a0e','#0e1a2a','#1a0e2a','#0e2a1a','#1a1a0e','#2a0e1a'];
function renderShorts(filter) {
  filter = filter||'all';
  const grid  = document.getElementById('shorts-grid');
  const all   = isOwner ? shorts : shorts.filter(function(s){ return s.isPublic; });
  const items = filter==='all' ? all : all.filter(function(s){ return s.cat.toLowerCase()===filter.toLowerCase(); });
  if (!items.length) { grid.innerHTML = '<div class="short-empty">No shorts yet.</div>'; return; }
  grid.innerHTML = items.map(function(s,i) {
    const vis = isOwner ? '<div class="item-vis-toggle" data-sid="'+s.id+'" title="Toggle visibility">'+(s.isPublic?'👁️':'🔒')+'</div>' : '';
    return '<div class="short-card"'+(s.url?' onclick="window.open(\''+esc(s.url)+'\',\'_blank\')"':'')+'>'+vis
      +'<div class="short-thumb" style="background:'+THUMB_COLORS[i%THUMB_COLORS.length]+'">'
      +'<div class="thumb-gradient"></div><div class="play-icon"><svg viewBox="0 0 16 16"><polygon points="3,2 13,8 3,14"/></svg></div>'
      +'<div class="thumb-tag">'+esc(s.cat)+'</div></div>'
      +'<div class="short-info"><div class="short-title">'+esc(s.title)+'</div>'
      +'<div class="short-meta"><span class="short-date">'+esc(s.date)+'</span>'+(s.views?'<span class="short-views">'+esc(s.views)+'</span>':'')+'</div></div></div>';
  }).join('');
}
function renderFilterBar() {
  const cats = [...new Set(shorts.map(function(s){ return s.cat; }))];
  const bar  = document.getElementById('filter-bar');
  bar.innerHTML = '<button class="filter-btn active" data-filter="all">All</button>'+cats.map(function(c){ return '<button class="filter-btn" data-filter="'+esc(c)+'">'+esc(c)+'</button>'; }).join('');
  bar.querySelectorAll('.filter-btn').forEach(function(b){ b.addEventListener('click', function(){ bar.querySelectorAll('.filter-btn').forEach(function(x){ x.classList.remove('active'); }); b.classList.add('active'); renderShorts(b.dataset.filter); }); });
}
document.getElementById('btn-add-short').addEventListener('click', function(){ openModal('modal-short'); });
document.getElementById('btn-confirm-short').addEventListener('click', async function() {
  const title    = document.getElementById('short-title').value.trim();
  const url      = document.getElementById('short-url').value.trim();
  const cat      = document.getElementById('short-cat').value.trim()||'Other';
  const views    = document.getElementById('short-views').value.trim();
  const isPublic = document.getElementById('short-public').checked;
  if (!title) return;
  document.getElementById('short-saving').style.display='block';
  const pubTag = isPublic ? ' [PUBLIC]' : '';
  await DISCORD.send('note','📽️ **[SHORT] '+title+'**'+pubTag+'\nCategory: '+cat+(url?'\n'+url:'')+(views?'\nViews: '+views:''));
  document.getElementById('short-saving').style.display='none';
  shorts.push({id:Date.now().toString(),title,url,cat,views,isPublic,date:new Date().toLocaleDateString('en-GB',{day:'2-digit',month:'short',year:'numeric'})});
  renderShorts(); renderFilterBar(); updateStats(); buildMarquee();
  closeModal('modal-short'); clearForm(['short-title','short-url','short-cat','short-views']);
});

// ── VAULT ─────────────────────────────────────────────────────────────────────
const TYPE_ICON = {link:'⊞',note:'≡',file:'◫',idea:'◇',code:'</>'}; 
function renderVault(items) {
  const all = items !== undefined ? items : (currentVaultFilter==='all' ? vaultItems : vaultItems.filter(function(v){ return v.type===currentVaultFilter; }));
  const c = document.getElementById('vault-cards');
  if (!all.length) { c.innerHTML='<div class="vault-empty">Nothing here yet.</div>'; return; }
  c.innerHTML = all.map(function(v) {
    const vis = isOwner ? '<span class="item-vis-toggle vault-vis" data-vid="'+v.id+'" title="Toggle visibility">'+(v.isPublic?'👁️':'🔒')+'</span>' : '';
    return '<div class="vault-item"'+(v.url?' onclick="window.open(\''+esc(v.url)+'\',\'_blank\')"':'')+'>'
      +'<div class="vault-item-type">'+(TYPE_ICON[v.type]||'·')+' '+esc(v.type)+vis+'</div>'
      +'<div class="vault-item-title">'+esc(v.title)+'</div>'
      +(v.content?'<div class="vault-item-preview">'+esc(v.content.substring(0,90))+(v.content.length>90?'…':'')+'</div>':'')
      +(v.url?'<div class="vault-item-url">'+esc(v.url.substring(0,50))+(v.url.length>50?'…':'')+'</div>':'')
      +'<div class="vault-item-footer"><div style="display:flex;gap:0.35rem;flex-wrap:wrap;">'+(v.tags||[]).map(function(t){ return '<span class="vault-tag">'+esc(t)+'</span>'; }).join('')+'</div><span class="vault-date">'+esc(v.date)+'</span></div></div>';
  }).join('');
}
function renderTagSidebar() {
  const tags = [...new Set(vaultItems.flatMap(function(v){ return v.tags||[]; }))];
  const s = document.getElementById('tag-sidebar');
  if (!tags.length) { s.innerHTML=''; return; }
  s.innerHTML='<div class="vault-sidebar-title" style="padding-top:0">Tags</div>'+tags.map(function(t){ return '<div class="vault-cat" data-tag="'+esc(t)+'"><span class="vault-cat-icon">◈</span> '+esc(t)+'</div>'; }).join('');
  s.querySelectorAll('[data-tag]').forEach(function(el){ el.addEventListener('click', function(){ document.querySelectorAll('.vault-cat').forEach(function(b){ b.classList.remove('active'); }); el.classList.add('active'); renderVault(vaultItems.filter(function(v){ return (v.tags||[]).includes(el.dataset.tag); })); }); });
}
document.querySelectorAll('.vault-cat[data-vault-filter]').forEach(function(el){ el.addEventListener('click', function(){ document.querySelectorAll('.vault-cat').forEach(function(b){ b.classList.remove('active'); }); el.classList.add('active'); currentVaultFilter=el.dataset.vaultFilter; renderVault(); }); });
document.getElementById('vault-search-input').addEventListener('input', function(e){ const q=e.target.value.trim().toLowerCase(); if(!q){renderVault();return;} renderVault(vaultItems.filter(function(v){ return v.title.toLowerCase().includes(q)||(v.content||'').toLowerCase().includes(q)||(v.tags||[]).some(function(t){ return t.toLowerCase().includes(q); }); })); });
document.getElementById('btn-add-vault').addEventListener('click', function(){ openModal('modal-vault'); });
document.querySelectorAll('.type-opt').forEach(function(b){ b.addEventListener('click', function(){
  currentVaultType = b.dataset.type;
  document.querySelectorAll('.type-opt').forEach(function(x){ x.classList.remove('active'); });
  b.classList.add('active');
  // Show/hide groups based on type
  document.getElementById('vault-url-group').style.display    = currentVaultType==='link' ? 'block' : 'none';
  document.getElementById('vault-file-group').style.display   = currentVaultType==='file' ? 'block' : 'none';
  document.getElementById('vault-lang-group').style.display   = currentVaultType==='code' ? 'block' : 'none';
  var cl = document.getElementById('vault-content-label');
  if (cl) cl.textContent = currentVaultType==='code' ? 'Code' : currentVaultType==='note' ? 'Note Content' : 'Content / Notes';
}); });

// File drop zone
(function(){
  const dropZone = document.getElementById('vault-file-drop');
  const fileInput = document.getElementById('vault-file-input');
  if (!dropZone) return;
  dropZone.addEventListener('click', function(){ fileInput.click(); });
  dropZone.addEventListener('dragover', function(e){ e.preventDefault(); dropZone.classList.add('drag-over'); });
  dropZone.addEventListener('dragleave', function(){ dropZone.classList.remove('drag-over'); });
  dropZone.addEventListener('drop', function(e){
    e.preventDefault(); dropZone.classList.remove('drag-over');
    const file = e.dataTransfer.files[0];
    if (file) { fileInput.files = e.dataTransfer.files; document.getElementById('vault-file-label').textContent = file.name; }
  });
  fileInput.addEventListener('change', function(){
    if (fileInput.files[0]) document.getElementById('vault-file-label').textContent = fileInput.files[0].name;
  });
})();
document.getElementById('btn-confirm-vault').addEventListener('click', async function() {
  const title    = document.getElementById('vault-title').value.trim();
  const urlVal   = document.getElementById('vault-url') ? document.getElementById('vault-url').value.trim() : '';
  const fileUrl  = document.getElementById('vault-file-url') ? document.getElementById('vault-file-url').value.trim() : '';
  const txtContent = document.getElementById('vault-content').value.trim();
  const tags     = document.getElementById('vault-tags').value.trim().split(',').map(function(t){ return t.trim(); }).filter(Boolean);
  const isPublic = document.getElementById('vault-public').checked;
  const lang     = (document.getElementById('vault-lang')||{}).value||'';
  if (!title) return;

  document.getElementById('vault-saving').style.display='block';

  const emoji  = {link:'🔗',note:'📝',file:'📁',idea:'💡',code:'💻'}[currentVaultType];
  const pubTag = isPublic ? ' [PUBLIC]' : '';
  let msg      = emoji+' **['+currentVaultType.toUpperCase()+'] '+title+'**'+pubTag;
  let finalUrl = urlVal;
  let fileContent = txtContent;

  // Handle file upload (txt/code files — read as text)
  if (currentVaultType === 'file') {
    const fileInput = document.getElementById('vault-file-input');
    if (fileInput && fileInput.files && fileInput.files[0]) {
      const file = fileInput.files[0];
      const ext  = file.name.split('.').pop().toLowerCase();
      const textExts = ['txt','js','ts','py','cs','java','html','css','json','md','xml','csv','sh','sql'];
      if (textExts.includes(ext) && file.size < 1800000) {
        // Read file as text and embed in Discord message
        fileContent = await new Promise(function(resolve, reject) {
          const reader = new FileReader();
          reader.onload = function(e){ resolve(e.target.result); };
          reader.onerror = reject;
          reader.readAsText(file);
        });
        msg += '\nFilename: '+file.name;
        if (tags.length) msg += '\nTags: '+tags.join(', ');
        // Discord has 2000 char limit — truncate if needed
        const codeBlock = '\n```'+ext+'\n'+fileContent.substring(0, 1500)+(fileContent.length>1500?'\n[truncated…]':'')+'\n```';
        msg += codeBlock;
        await DISCORD.send('file', msg);
        document.getElementById('vault-saving').style.display='none';
        vaultItems.push({id:Date.now().toString(),type:'file',title,url:'',content:fileContent.substring(0,200),tags,isPublic,date:new Date().toLocaleDateString('en-GB',{day:'2-digit',month:'short',year:'numeric'})});
        renderVault(); renderTagSidebar(); updateStats();
        closeModal('modal-vault'); clearForm(['vault-title','vault-url','vault-content','vault-tags','vault-lang','vault-file-url']);
        document.getElementById('vault-file-label').textContent = 'Drag & drop or click to browse';
        document.getElementById('vault-file-input').value = '';
        return;
      }
    }
    // External file URL (Google Drive, Dropbox, etc)
    finalUrl = fileUrl || urlVal;
    msg += '\nFile Type: '+( finalUrl ? finalUrl.split('.').pop().toUpperCase().split('?')[0] : 'External');
  }

  if (lang && currentVaultType==='code') msg += '\nLanguage: '+lang;
  if (finalUrl) msg += '\n'+finalUrl;
  if (fileContent && currentVaultType==='code') msg += '\n```'+lang+'\n'+fileContent+'\n```';
  else if (fileContent && currentVaultType!=='file') msg += '\n'+fileContent;
  if (tags.length) msg += '\nTags: '+tags.join(', ');

  await DISCORD.send(currentVaultType, msg);
  document.getElementById('vault-saving').style.display='none';
  vaultItems.push({id:Date.now().toString(),type:currentVaultType,title,url:finalUrl,content:fileContent.substring(0,200),tags,isPublic,date:new Date().toLocaleDateString('en-GB',{day:'2-digit',month:'short',year:'numeric'})});
  renderVault(); renderTagSidebar(); updateStats();
  closeModal('modal-vault'); clearForm(['vault-title','vault-url','vault-content','vault-tags','vault-lang','vault-file-url']);
  document.getElementById('vault-file-label').textContent = 'Drag & drop or click to browse';
  if(document.getElementById('vault-file-input')) document.getElementById('vault-file-input').value='';
});

// ── STATS & MARQUEE ───────────────────────────────────────────────────────────
function updateStats() {
  document.getElementById('stat-shorts').textContent  = shorts.length;
  document.getElementById('stat-items').textContent   = vaultItems.length;
  document.getElementById('stat-tags').textContent    = new Set(vaultItems.flatMap(function(v){ return v.tags||[]; })).size;
}
function buildMarquee() {
  const cats = shorts.length ? [...new Set(shorts.map(function(s){ return s.cat; }))] : ['Shorts','Links','Notes','Ideas','Files'];
  const m = document.getElementById('marquee-inner');
  if (!m) return;
  const html = [...cats,...cats].map(function(c){ return '<span class="marquee-item"><span>✦</span>'+esc(c)+'</span>'; }).join('');
  m.innerHTML = html+html;
}

// ── MODALS ────────────────────────────────────────────────────────────────────
function openModal(id)  { document.getElementById(id).classList.add('open'); }
function closeModal(id) { document.getElementById(id).classList.remove('open'); }
document.querySelectorAll('[data-close]').forEach(function(b){ b.addEventListener('click', function(){ closeModal(b.dataset.close); }); });
document.querySelectorAll('.modal-backdrop').forEach(function(b){ b.addEventListener('click', function(e){ if(e.target===b) closeModal(b.id); }); });
document.addEventListener('keydown', function(e){ if(e.key==='Escape') document.querySelectorAll('.modal-backdrop.open').forEach(function(m){ closeModal(m.id); }); });

// ── UTILS ─────────────────────────────────────────────────────────────────────
function esc(s) { return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }
function clearForm(ids) { ids.forEach(function(id){ const el=document.getElementById(id); if(el) el.value=''; }); }
function showMsg(id, ok, msg) {
  const el = document.getElementById(id);
  if (!el) return;
  el.textContent = msg;
  el.className = 'connection-result '+(ok===true?'ok':ok===false?'err':'');
  el.style.display = 'block';
  if (ok !== null) setTimeout(function(){ el.style.display='none'; }, 4000);
}
