/* ========================================================================== 
   scripts.js — Full site logic (stable rollback + minimal safe fixes)
   - Robust image fallback helper (one-time onerror)
   - Bottom spacer for main list so last element isn't clipped
   - Minimal router/init logic and page handlers
   ========================================================================== */

/* ----------------------- Configuration / Constants ----------------------- */
const DEFAULT_PFP = 'defaultProfilePicture.png'; // <-- place this PNG in your site's root (optional)
const KEY_USERS = 'dl_users_v1_explicit';
const KEY_LEVELS = 'dl_levels_v1_explicit';
const KEY_SUBS = 'dl_subs_v1_explicit';
const KEY_SESSION = 'dl_session_v1_explicit';
const KEY_AUDIT = 'dl_audit_v1';

/* ----------------------- Storage helpers ----------------------- */
function readJSON(key, fallback){ try{ const raw = localStorage.getItem(key); return raw ? JSON.parse(raw) : JSON.parse(JSON.stringify(fallback)); } catch(e){ console.error('readJSON', key, e); return JSON.parse(JSON.stringify(fallback)); } }
function writeJSON(key, val){ try { localStorage.setItem(key, JSON.stringify(val)); } catch(e){ console.error('writeJSON', key, e); } }

function getUsers(){ return readJSON(KEY_USERS, []); }
function saveUsers(v){ writeJSON(KEY_USERS, v); }
function getLevels(){ return readJSON(KEY_LEVELS, []); }
function saveLevels(v){ writeJSON(KEY_LEVELS, v); }
function getSubs(){ return readJSON(KEY_SUBS, []); }
function saveSubs(v){ writeJSON(KEY_SUBS, v); }
function getAudit(){ return readJSON(KEY_AUDIT, []); }
function saveAudit(v){ writeJSON(KEY_AUDIT, v); }

function setSession(obj){ localStorage.setItem(KEY_SESSION, JSON.stringify(obj)); }
function getSession(){ return JSON.parse(localStorage.getItem(KEY_SESSION) || 'null'); }
function clearSession(){ localStorage.removeItem(KEY_SESSION); }

function uid(){ return Math.random().toString(36).slice(2,9); }
function now(){ return Date.now(); }
function escapeHTML(s){ if(s===null||s===undefined) return ''; return String(s).replace(/[&<>"']/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[m]); }
function formatDate(ms){ if(!ms) return '-'; try{ return new Date(ms).toLocaleString(); } catch(e){ return String(ms); } }

/* ----------------------- Image fallback helper (one-time) ----------------------- */
/* Embedded default fallback (SVG data URL) used if DEFAULT_PFP is missing or broken */
const DEFAULT_PFP_DATAURL = 'data:image/svg+xml;utf8,' + encodeURIComponent(
  `<svg xmlns="http://www.w3.org/2000/svg" width="160" height="160" viewBox="0 0 160 160">
     <rect width="100%" height="100%" rx="16" fill="#0b0b0b"/>
     <g transform="translate(24,20)" fill="#484848">
       <circle cx="56" cy="36" r="28" />
       <rect x="8" y="76" width="96" height="38" rx="8" />
     </g>
   </svg>`
);

/* setImgSrcWithFallback(imgElement, srcCandidate)
   - sets imgElement.src to srcCandidate
   - installs a one-time onerror that will try DEFAULT_PFP then embedded SVG
   - avoids repeated onerror loops by clearing handler before setting fallback
*/
function setImgSrcWithFallback(img, srcCandidate){
  try {
    // remove old handler (safe even if null)
    img.onerror = null;
    // install one-time handler
    img.onerror = function(){
      img.onerror = null; // prevent recursion
      try {
        if (typeof DEFAULT_PFP !== 'undefined' && DEFAULT_PFP && img.src !== DEFAULT_PFP){
          img.src = DEFAULT_PFP;
        } else {
          img.src = DEFAULT_PFP_DATAURL;
        }
      } catch(e) {
        // final attempt
        img.src = DEFAULT_PFP_DATAURL;
      }
    };
    // if candidate empty -> short-circuit to DEFAULT_PFP or DATAURL (onerror covers next fallback)
    if(!srcCandidate){
      if (typeof DEFAULT_PFP !== 'undefined' && DEFAULT_PFP){
        img.src = DEFAULT_PFP;
      } else {
        img.src = DEFAULT_PFP_DATAURL;
      }
    } else {
      img.src = srcCandidate;
    }
  } catch(e){
    // Fallback in extreme edge cases
    try { img.src = DEFAULT_PFP_DATAURL; } catch(err) { /* ignore */ }
  }
}

/* ----------------------- YouTube helpers ----------------------- */
function youtubeID(url){
  if(!url) return null;
  const q = /[?&]v=([^&]+)/.exec(url);
  if(q && q[1]) return q[1];
  const b = /youtu\.be\/([^?&]+)/.exec(url);
  if(b && b[1]) return b[1];
  const e = /youtube\.com\/embed\/([^?&/]+)/.exec(url);
  if(e && e[1]) return e[1];
  const parts = url.split('/');
  return parts[parts.length-1] || null;
}
function youtubeThumb(url){ const id = youtubeID(url); return id ? `https://i.ytimg.com/vi/${id}/hqdefault.jpg` : ''; }
function youtubeEmbed(url){ const id = youtubeID(url); return id ? `https://www.youtube.com/embed/${id}` : null; }

/* ----------------------- Tags ----------------------- */
const ALL_TAGS = [
  "Cube Carried","Ship Carried","Wave Carried","Ufo Carried","Ball Carried","Spider Carried","Swing Carried",
  "Medium Length","Long Length","XL Length","XXL Length (3+ Minutes)","Slow Paced","Fast Paced","Memory Level","Visibility Level"
];

function tagToBadgeClass(tag){
  switch(tag){
    case 'Cube Carried': return 'tag-badge-cube';
    case 'Ship Carried': return 'tag-badge-ship';
    case 'Wave Carried': return 'tag-badge-wave';
    case 'Ufo Carried': return 'tag-badge-ufo';
    case 'Ball Carried': return 'tag-badge-ball';
    case 'Spider Carried': return 'tag-badge-spider';
    case 'Swing Carried': return 'tag-badge-swing';
    default: return 'tag-badge-default';
  }
}
function renderTagBadgesHTML(tags){
  if (!tags || tags.length === 0) return '';
  return tags.map(t => `<span class="tag-badge ${tagToBadgeClass(t)}">${escapeHTML(t)}</span>`).join('');
}

/* ----------------------- Leaderboard & Titles ----------------------- */
function getLeaderboardSortedUsers(){
  return (getUsers()||[]).slice().sort((a,b) => (b.points||0) - (a.points||0));
}
function getUserRank(username){
  const sorted = getLeaderboardSortedUsers();
  const idx = sorted.findIndex(u => u.username === username);
  return idx === -1 ? null : idx + 1; // 1-based rank
}

const TITLES = [
  { id:'fresh', label:'Fresh', reqText:'Free — available to everyone' },
  { id:'maybe_him', label:'Maybe him', reqText:'100 points' },
  { id:'let_me_cook', label:'Let me Cook...', reqText:'300 points' },
  { id:'just_better', label:"I'm just better", reqText:'500 points' },
  { id:'god_like', label:'God-Like', reqText:'1000 points' },
  { id:'fart', label:'Fart', reqText:'3000 points' },
  { id:'top3', label:'Top 3', reqText:'Only user ranked #3' },
  { id:'top2', label:'Top 2', reqText:'Only user ranked #2' },
  { id:'top1', label:"Yes I'm him, the Top 1", reqText:'Only user ranked #1' }
];

/* central rule-checker for whether a user may equip a title */
function canEquipTitle(user, titleId){
  if(!user) return false;
  const pts = user.points || 0;
  const rank = getUserRank(user.username);
  switch(titleId){
    case 'fresh': return true;
    case 'maybe_him': return pts >= 100;
    case 'let_me_cook': return pts >= 300;
    case 'just_better': return pts >= 500;
    case 'god_like': return pts >= 1000;
    case 'fart': return pts >= 3000;
    case 'top3': return rank !== null && rank === 3;
    case 'top2': return rank !== null && rank === 2;
    case 'top1': return rank === 1;
    default: return false;
  }
}
function eligibleTitlesForUser(user){ return TITLES.filter(t => canEquipTitle(user, t.id)); }

/* ----------------------- Seed (only if empty) ----------------------- */
function seedIfEmpty(){
  const users = getUsers();
  if(users && users.length) return;
  const headAdmin = {
    id: uid(),
    username: 'zmmieh.',
    password: '123456',
    role: 'headadmin',
    nationality: 'United Kingdom',
    points: 0,
    createdAt: now(),
    profilePic: '',
    showCountry: true,
    bio: '',
    completedRecords: [],
    equippedTitle: 'fresh'
  };
  saveUsers([headAdmin]);
  saveLevels([]);
  saveSubs([]);
  saveAudit([]);
}
seedIfEmpty();

/* ----------------------- Mention autocomplete ----------------------- */
function initCreatorsMentionAutocomplete(){
  const input = document.getElementById('lev-creators'); if(!input) return;
  let ac = document.getElementById('mention-autocomplete');
  if(!ac){
    ac = document.createElement('div'); ac.id='mention-autocomplete';
    ac.style.position='absolute'; ac.style.display='none'; ac.style.zIndex='99999';
    ac.style.background = '#0f0f12'; ac.style.border = '1px solid rgba(255,255,255,0.06)'; ac.style.padding = '6px'; ac.style.borderRadius='8px'; ac.style.minWidth='220px';
    document.body.appendChild(ac);
  }
  function reposition(){ const r = input.getBoundingClientRect(); ac.style.left = `${r.left}px`; ac.style.top = `${r.bottom + 6 + window.scrollY}px`; }
  window.addEventListener('resize', reposition); window.addEventListener('scroll', reposition);

  input.addEventListener('input', function(){
    const val = input.value; const caret = input.selectionStart || val.length;
    const sub = val.slice(0, caret); const atIndex = sub.lastIndexOf('@'); if(atIndex === -1){ ac.style.display='none'; return; }
    const query = sub.slice(atIndex+1); if(query.includes(' ')){ ac.style.display='none'; return; }
    const q = query.toLowerCase();
    const users = getUsers().filter(u => u.username.toLowerCase().startsWith(q)).slice(0,8);
    if(!users.length){ ac.style.display='none'; return; }
    reposition(); ac.innerHTML = '';
    users.forEach(u => {
      const item = document.createElement('div');
      item.textContent = u.username;
      item.style.padding = '6px';
      item.style.cursor = 'pointer';
      item.onmouseenter = () => item.style.background = 'rgba(255,255,255,0.02)';
      item.onmouseleave = () => item.style.background = 'transparent';
      item.onclick = () => {
        const before = val.slice(0, atIndex);
        const after = val.slice(caret);
        input.value = before + '@' + u.username + (after || '');
        ac.style.display = 'none';
        input.focus();
      };
      ac.appendChild(item);
    });
    ac.style.display = 'block';
  });

  input.addEventListener('blur', () => setTimeout(()=> { ac.style.display = 'none'; }, 150));
}

/* ----------------------- Creators rendering ----------------------- */
function renderCreatorsHTML(creatorsArray){
  if(!creatorsArray || !creatorsArray.length) return '';
  return creatorsArray.map(entry => {
    entry = String(entry || '');
    return entry.split(/\s+/).map(token => {
      if(token.startsWith('@')){
        const uname = token.slice(1);
        if(!uname) return escapeHTML(token);
        return `<a class="user-link" href="profile.html?user=${encodeURIComponent(uname)}">${escapeHTML(token)}</a>`;
      }
      return escapeHTML(token);
    }).join(' ');
  }).join(', ');
}

/* ----------------------- Ban helpers ----------------------- */
function isUserBanned(username){
  if(!username) return false;
  const users = getUsers();
  const u = users.find(x => x.username === username);
  if(!u) return false;
  if(!u.bannedUntil) return false;
  if(u.bannedUntil === 9999999999999) return true;
  if(Date.now() < u.bannedUntil) return true;
  delete u.bannedUntil; delete u.banReason; delete u.bannedBy; delete u.bannedAt;
  saveUsers(users);
  return false;
}
function showBanOverlay(user){
  if(!user) return;
  if(document.getElementById('banOverlay')) return;
  const overlay = document.createElement('div'); overlay.id = 'banOverlay';
  Object.assign(overlay.style, {position:'fixed', inset:'0', background:'rgba(0,0,0,0.9)', zIndex:999999, display:'flex', alignItems:'center', justifyContent:'center'});
  overlay.innerHTML = `
    <div style="max-width:760px;background:linear-gradient(180deg,#111,#0b0b0b);padding:28px;border-radius:12px;color:#fff;text-align:center;border:1px solid rgba(255,255,255,0.04)">
      <h2 style="margin:0 0 8px">You are banned</h2>
      <p style="color:var(--muted)">Username: <strong>${escapeHTML(user.username)}</strong></p>
      <p style="color:var(--muted)">Banned until: <strong>${escapeHTML(user.bannedUntil===9999999999999?'Permanent':formatDate(user.bannedUntil))}</strong></p>
      <p style="color:var(--muted)">Reason: <strong>${escapeHTML(user.banReason||'No reason provided')}</strong></p>
      <div style="margin-top:16px"><button id="banSignOutBtn" class="btn">Sign out</button></div>
    </div>
  `;
  document.body.appendChild(overlay);
  document.getElementById('banSignOutBtn').onclick = () => { clearSession(); overlay.remove(); window.location.href = 'index.html'; };
}
function enforceBanForSession(){
  const s = getSession(); if(!s) return false;
  const users = getUsers(); const me = users.find(u => u.username === s.username);
  if(!me) return false;
  if(isUserBanned(me.username)){ showBanOverlay(me); return true; }
  return false;
}

/* ----------------------- Topbar ----------------------- */
function countryToFlag(country){
  const map = {'United Kingdom':'🇬🇧','Hungary':'🇭🇺','Austria':'🇦🇹','Belgium':'🇧🇪','Germany':'🇩🇪','France':'🇫🇷','Japan':'🇯🇵','China':'🇨🇳','India':'🇮🇳','South Korea':'🇰🇷','Indonesia':'🇮🇩','United States':'🇺🇸','Canada':'🇨🇦','Mexico':'🇲🇽','Brazil':'🇧🇷'};
  return map[country] || '';
}
function renderTopbar(){
  const top = document.querySelector('.topbar'); if(!top) return;
  top.innerHTML = '';
  const session = getSession();
  const title = document.createElement('div'); title.className = 'site-title'; title.textContent = 'The All Levels Lists'; top.appendChild(title);
  const nav = document.createElement('nav'); nav.className = 'topnav';
  [['mainlist.html','Main List'],['submissions.html','Submissions'],['stats.html','Stats Viewer']].forEach(([href,label]) => {
    const a = document.createElement('a'); a.href = href; a.textContent = label; nav.appendChild(a);
  });
  top.appendChild(nav);

  const pa = document.createElement('div'); pa.className = 'profile-area'; pa.id = 'profile-area'; top.appendChild(pa);

  if(!session){ pa.innerHTML = `<a class="btn ghost small-btn" href="index.html">Login</a>`; return; }
  const users = getUsers(); const me = users.find(u => u.username === session.username) || {};
  const wrap = document.createElement('div'); wrap.style.display = 'flex'; wrap.style.gap = '8px'; wrap.style.alignItems = 'center';

  const circle = document.createElement('div'); circle.className = 'profile-circle';
  const img = document.createElement('img');
  setImgSrcWithFallback(img, (me.profilePic && me.profilePic.trim()) ? me.profilePic : DEFAULT_PFP);
  circle.appendChild(img);
  wrap.appendChild(circle);

  const nameDiv = document.createElement('div'); nameDiv.style.textAlign = 'right'; nameDiv.innerHTML = `<div style="font-weight:700">${escapeHTML(me.username)}</div>`;
  if(me.equippedTitle){
    const titleObj = TITLES.find(t => t.id === me.equippedTitle);
    if(titleObj) nameDiv.innerHTML += `<div style="font-size:12px;color:var(--muted);margin-top:4px">${escapeHTML(titleObj.label)}</div>`;
  }
  nameDiv.innerHTML += `<div style="font-size:12px;color:var(--muted)">${escapeHTML(me.nationality || '')}</div>`;
  wrap.appendChild(nameDiv);

  const editBtn = document.createElement('a'); editBtn.className = 'btn ghost small-btn'; editBtn.href = 'profile.html'; editBtn.textContent = 'Edit Profile'; wrap.appendChild(editBtn);
  const cp = document.createElement('a'); cp.className = 'btn ghost small-btn'; cp.href = 'change_password.html'; cp.textContent = 'Reset Password'; wrap.appendChild(cp);
  if(me.role === 'mod' || me.role === 'headadmin'){ const mp = document.createElement('a'); mp.className = 'btn ghost small-btn'; mp.href='modpanel.html'; mp.textContent='Mod Panel'; wrap.appendChild(mp); }
  const logout = document.createElement('button'); logout.className = 'btn ghost small-btn'; logout.textContent = 'Logout'; logout.onclick = () => { clearSession(); window.location.href = 'index.html'; };
  wrap.appendChild(logout);
  pa.appendChild(wrap);
}

/* ----------------------- Router (with redirect guard) ----------------------- */
function initPage(page){
  // Prevent infinite redirect loops by guarding redirects to run only once per page load.
  if(!window.__initRedirectGuard) window.__initRedirectGuard = {};
  // if page is 'index' and there's a session, redirect *once* to mainlist:
  if(page === 'index' && getSession()){
    const current = location.pathname.split('/').pop();
    if(current !== 'mainlist.html'){
      if(!window.__initRedirectGuard['index->mainlist']){
        window.__initRedirectGuard['index->mainlist'] = true;
        window.location.href = 'mainlist.html';
        return;
      } else {
        return;
      }
    }
  }

  renderTopbar();
  if(getSession()) if(enforceBanForSession()) return;

  const protectedPages = ['submissions','submitlevel','submitcompletion','mysubmissions','modpanel','change_password','profile'];
  if(protectedPages.includes(page) && page !== 'profile' && !getSession()){
    alert('You must be logged in to access this page.');
    window.location.href = 'index.html';
    return;
  }

  switch(page){
    case 'index': initIndexPage(); break;
    case 'mainlist': initMainListPage(); break;
    case 'submissions': initSubmissionsPage(); break;
    case 'submitlevel': initSubmitLevelPage(); break;
    case 'submitcompletion': initSubmitCompletionPage(); break;
    case 'mysubmissions': initMySubmissionsPage(); break;
    case 'modpanel': initModPanelPage(); break;
    case 'stats': initStatsPage(); break;
    case 'change_password': initChangePasswordPage(); break;
    case 'profile': initProfilePage(); break;
    default: break;
  }
}

// === Robust signup handler (replace the old signup-form handler with this) ===
const signupForm = document.getElementById('signup-form') || document.querySelector('form#signup-form');
if (signupForm) {
  signupForm.addEventListener('submit', function (e) {
    e.preventDefault();

    // find inputs (work even if HTML uses slightly different structure)
    const usernameEl = document.getElementById('su-username') || signupForm.querySelector('input[name="su-username"], input[name="username"]');
    const passwordEl = document.getElementById('su-password') || signupForm.querySelector('input[name="su-password"], input[name="password"]');
    const nationalityEl = document.getElementById('su-nationality') || signupForm.querySelector('input[name="su-nationality"], input[name="nationality"]');
    const msg = document.getElementById('signup-msg');

    const username = (usernameEl && usernameEl.value || '').trim();
    const password = (passwordEl && passwordEl.value) || '';
    const nationality = (nationalityEl && nationalityEl.value || '').trim();

    function showMsg(text){
      if(msg){
        msg.classList.remove('hidden');
        msg.textContent = text;
      } else {
        alert(text);
      }
    }

    // validations
    if(!username || !password || !nationality){
      showMsg('Please fill all fields');
      return;
    }
    if(password.length < 6){
      showMsg('Password must be at least 6 characters');
      return;
    }

    // username allowed characters: letters, numbers, parentheses, braces, brackets, dot, underscore, hyphen, ?, !
    const USER_RE = /^[A-Za-z0-9()\[\]\{\}\._\-?!]+$/;
    if(!USER_RE.test(username)){
      showMsg('Invalid username — no spaces; allowed: A-Z,0-9, (), [], {}, ., _, -, ?, !');
      return;
    }

    // load users (local cache) and check duplicates
    const users = (typeof getUsers === 'function') ? (getUsers() || []) : [];
    if(users.find(u => (u.username || '').toLowerCase() === username.toLowerCase())){
      showMsg('Username already taken');
      return;
    }

    // create new user object and save
    const newUser = {
      id: (typeof uid === 'function' ? uid() : Math.random().toString(36).slice(2,9)),
      username,
      password,
      nationality,
      role: 'user',
      points: 0,
      createdAt: (typeof now === 'function' ? now() : Date.now()),
      profilePic: '',
      showCountry: true,
      bio: '',
      completedRecords: [],
      equippedTitle: 'fresh'
    };

    users.push(newUser);
    if(typeof saveUsers === 'function') saveUsers(users);
    if(typeof setSession === 'function') setSession({ username });

    // navigate to main list
    window.location.href = 'mainlist.html';
  });
}


/* ======================== MAIN LIST ======================== */
function initMainListPage(){ renderTopbar(); renderMainList(); }

function renderMainList(){
  renderTopbar();
  const area = document.getElementById('list-area'); if(!area) return;
  area.innerHTML = '';
  const levels = (getLevels()||[]).filter(l => l.status === 'published').slice().sort((a,b) => (a.placement||999) - (b.placement||999));
  if(!levels.length){
    area.innerHTML = '<div class="card">No published levels.</div>';
    // spacer so even empty list leaves bottom space
    const spacerEmpty = document.createElement('div'); spacerEmpty.style.height = '120px'; area.appendChild(spacerEmpty);
    return;
  }
  levels.forEach(l => {
    const thumb = (l.thumbnail && l.thumbnail.trim()) ? l.thumbnail : (l.youtube ? youtubeThumb(l.youtube) : '');
    const creatorsHTML = renderCreatorsHTML(l.creators || []);
    const row = document.createElement('div'); row.className = 'level-row';
    const header = document.createElement('div'); header.className = 'level-header';
    const placement = document.createElement('div'); placement.className = 'placement'; placement.textContent = l.placement || '—';
    const thumbDiv = document.createElement('div'); thumbDiv.className = 'thumb'; if(thumb){ const img = document.createElement('img'); img.src = thumb; img.alt = 'thumb'; thumbDiv.appendChild(img); }
    const meta = document.createElement('div'); meta.className = 'level-meta';
    const nameEl = document.createElement('div'); nameEl.className = 'level-name'; nameEl.textContent = l.name || '';
    const subEl = document.createElement('div'); subEl.className = 'level-sub'; subEl.innerHTML = `ID: ${escapeHTML(l.levelId || '')}, Creator: ${creatorsHTML} • Placed Date: ${l.approvedAt ? formatDate(l.approvedAt) : '-'}`;

    meta.appendChild(nameEl); meta.appendChild(subEl);
    const actions = document.createElement('div'); actions.className = 'row-actions muted'; actions.textContent = 'Click to expand';
    header.appendChild(placement); header.appendChild(thumbDiv); header.appendChild(meta); header.appendChild(actions);

    const accordion = document.createElement('div'); accordion.className = 'accordion';
    accordion.innerHTML = `
      <div class="expanded-info" style="margin-bottom:10px;padding:0 15px;font-size:0.95em;color:#aaa">
        <div>ID: ${escapeHTML(l.levelId || '')}, Creator: ${creatorsHTML}</div>
        ${renderTagBadgesHTML(l.tags || []) ? `<div class="tag-badges" style="margin-top:8px">${renderTagBadgesHTML(l.tags||[])}</div>` : ''}
      </div>
      <div class="expanded">
        <div class="expanded-thumb">${ thumb ? `<img src="${thumb}" alt="expanded">` : '' }</div>
        <div class="expanded-video">${ l.youtube ? `<iframe src="${youtubeEmbed(l.youtube)}" allowfullscreen></iframe>` : '<div class="muted">No video</div>' }</div>
      </div>
      <div class="muted" style="margin-top:10px;padding:0 15px">Submitted by ${escapeHTML(l.submitter||'-')} — Approved by ${escapeHTML(l.approvedBy||'-')}</div>
    `;

    header.onclick = () => {
      const wasOpen = row.classList.contains('open');
      document.querySelectorAll('.level-row.open').forEach(r => r.classList.remove('open'));
      document.querySelectorAll('.level-row .thumb').forEach(t => t.style.display = 'block');

      if(!wasOpen){
        row.classList.add('open');
        const t = row.querySelector('.thumb'); if(t) t.style.display = 'none';
      } else {
        row.classList.remove('open');
        const t = row.querySelector('.thumb'); if(t) t.style.display = 'block';
      }
    };

    row.appendChild(header); row.appendChild(accordion); area.appendChild(row);
  });

  // after rendering all level rows, add a spacer so the final element isn't flush to the viewport bottom
  const spacer = document.createElement('div');
  spacer.style.height = '120px';   // tweak 120 to taste (bigger -> more space)
  area.appendChild(spacer);
}

/* ======================== SUBMISSIONS ======================== */
function initSubmissionsPage(){ renderTopbar(); }
function initSubmitLevelPage(){
  renderTopbar();
  const session = getSession(); if(!session){ alert('Login required'); window.location.href='index.html'; return; }
  const picker = document.getElementById('tag-picker');
  if(picker){ picker.innerHTML=''; ALL_TAGS.forEach(t => { const btn = document.createElement('button'); btn.type='button'; btn.className='tagbtn'; btn.dataset.tag = t; btn.textContent = t; btn.onclick = () => btn.classList.toggle('selected'); picker.appendChild(btn); }); }
  initCreatorsMentionAutocomplete();
  document.getElementById('submit-level-form')?.addEventListener('submit', e => {
    e.preventDefault();
    const name = (document.getElementById('lev-name') && document.getElementById('lev-name').value || '').trim();
    const creatorsRaw = (document.getElementById('lev-creators') && document.getElementById('lev-creators').value || '').trim();
    const levelId = (document.getElementById('lev-id') && document.getElementById('lev-id').value || '').trim();
    const youtube = (document.getElementById('lev-youtube') && document.getElementById('lev-youtube').value || '').trim();
    const raw = (document.getElementById('lev-raw') && document.getElementById('lev-raw').value || '').trim();
    const picked = Array.from(document.querySelectorAll('#tag-picker .tagbtn.selected')).map(b => b.dataset.tag);
    const msg = document.getElementById('lev-msg');
    if(!name || !creatorsRaw || !levelId || !youtube || !raw){ if(msg){ msg.textContent = 'Please fill required fields'; msg.style.color = '#ff6b6b'; } return; }
    if(!picked.length){ if(msg){ msg.textContent = 'Please select at least one tag'; msg.style.color = '#ff6b6b'; } return; }
    const creatorsArray = creatorsRaw.split(',').map(s => s.trim()).filter(Boolean);
    const subs = getSubs(); subs.push({ id: uid(), type:'level', name, creators: creatorsArray, levelId, youtube, raw, tags: picked, submitter: getSession().username, status: 'pending', createdAt: now() });
    saveSubs(subs);
    addAudit({ id: uid(), action:'submit_level', actor: getSession().username, target: null, details:{ name }, ts: now() });
    if(msg){ msg.textContent = 'Submitted — pending review'; msg.style.color = '#30c75b'; }
    setTimeout(()=> window.location.href = 'submissions.html', 700);
  });
}

/* ======================== SUBMIT COMPLETION ======================== */
function initSubmitCompletionPage(){
  renderTopbar();
  const session = getSession(); if(!session){ alert('Login required'); window.location.href='index.html'; return; }
  const sel = document.getElementById('comp-level');
  if(sel){ sel.innerHTML = ''; getLevels().filter(l => l.status === 'published').sort((a,b) => (a.placement||999) - (b.placement||999)).forEach(l => { const opt = document.createElement('option'); opt.value = l.id; opt.textContent = `#${l.placement} — ${l.name}`; sel.appendChild(opt); }); }
  document.getElementById('submit-completion-form')?.addEventListener('submit', e => {
    e.preventDefault();
    const levelRef = (document.getElementById('comp-level') && document.getElementById('comp-level').value) || '';
    const youtube = (document.getElementById('comp-youtube') && document.getElementById('comp-youtube').value) || '';
    const raw = (document.getElementById('comp-raw') && document.getElementById('comp-raw').value) || '';
    const percentInput = document.getElementById('comp-percent'); let percent = null;
    if(percentInput){ const v = parseFloat(percentInput.value); if(!isNaN(v)) percent = Math.max(0, Math.min(100, Math.round(v))); }
    const msg = document.getElementById('comp-msg');
    if(!levelRef || !youtube || !raw){ if(msg){ msg.textContent = 'Fill required fields'; msg.style.color = '#ff6b6b'; } return; }
    const levelObj = getLevels().find(x => x.id === levelRef);
    const levelNameSnapshot = levelObj ? levelObj.name : '';
    const subs = getSubs(); subs.push({ id: uid(), type:'completion', levelRef, levelName: levelNameSnapshot, youtube, raw, percent, submitter: getSession().username, status:'pending', createdAt: now() });
    saveSubs(subs);
    addAudit({ id: uid(), action:'submit_completion', actor: getSession().username, target: null, details:{ levelRef, percent }, ts: now() });
    if(msg){ msg.textContent = 'Completion submitted — pending review'; msg.style.color = '#30c75b'; }
    setTimeout(()=> window.location.href = 'submissions.html', 900);
  });
}

/* ======================== MY SUBMISSIONS ======================== */
function initMySubmissionsPage(){
  renderTopbar();
  const session = getSession(); if(!session){ alert('Login required'); window.location.href='index.html'; return; }
  const area = document.getElementById('my-subs-area'); if(!area) return; area.innerHTML = '';
  const subs = getSubs().filter(s => s.submitter === session.username);
  if(!subs.length){ area.innerHTML = '<div class="muted">You have no submissions</div>'; return; }
  subs.forEach(s => {
    const el = document.createElement('div'); el.className = 'card'; el.style.margin = '8px 0';
    el.innerHTML = `<div style="display:flex;justify-content:space-between;align-items:center"><div><strong>${escapeHTML(s.name || s.levelName || '(completion)')}</strong> — ${escapeHTML(s.type)}</div><div><button class="btn ghost ms-delete" data-id="${s.id}">Delete</button></div></div>`;
    area.appendChild(el);
  });
  area.querySelectorAll('.ms-delete').forEach(b => b.onclick = function(){ if(!confirm('Delete submission?')) return; saveSubs(getSubs().filter(x=>x.id !== this.dataset.id)); initMySubmissionsPage(); });
}

/* ======================== MOD PANEL ======================== */
function initModPanelPage(){
  renderTopbar();
  const sess = getSession(); if(!sess){ alert('Login required'); window.location.href='index.html'; return; }
  const me = getUsers().find(u => u.username === sess.username);
  if(!me || (me.role !== 'mod' && me.role !== 'headadmin')){ alert('Mods only'); window.location.href='index.html'; return; }

  renderPendingSubmissions();
  renderRankingEditor();
  renderBannedUsersList();
  renderAuditLog();
  renderUserManagementArea();
  renderPlayerSearchArea();

  document.getElementById('ban-btn')?.addEventListener('click', () => {
    const username = (document.getElementById('ban-username') && document.getElementById('ban-username').value || '').trim();
    const days = parseInt((document.getElementById('ban-days') && document.getElementById('ban-days').value) || '1', 10);
    const reason = (document.getElementById('ban-reason') && document.getElementById('ban-reason').value) || 'No reason';
    if(!username){ alert('Enter a username'); return; }
    const users = getUsers(); const target = users.find(u => u.username === username);
    if(!target){ alert('User not found'); return; }
    if(target.role === 'headadmin'){ alert('You cannot ban the Head Admin'); return; }
    if(days === 0) target.bannedUntil = 9999999999999; else target.bannedUntil = Date.now() + days*24*3600*1000;
    target.banReason = reason; target.bannedBy = getSession().username; target.bannedAt = now();
    saveUsers(users);
    addAudit({ id: uid(), action:'ban', actor: getSession().username, target: target.username, details:{ until: target.bannedUntil, reason }, ts: now() });
    alert(`Banned ${username}`);
    renderBannedUsersList(); renderAuditLog();
  });
}

/* Pending submissions */
function renderPendingSubmissions(){
  const area = document.getElementById('pending-submissions'); if(!area) return; area.innerHTML = '';
  const subs = getSubs().filter(s => s.status === 'pending');
  if(!subs.length){ area.innerHTML = '<div class="muted">No pending submissions</div>'; return; }
  subs.forEach(s => {
    const wrapper = document.createElement('div'); wrapper.className = 'mod-item';
    wrapper.innerHTML = `<div style="max-width:60%"><strong>${escapeHTML(s.name || s.levelName || '(completion)')}</strong> — ${escapeHTML(s.type)} — ${escapeHTML(s.submitter)} ${s.levelRef ? '• levelRef:' + escapeHTML(s.levelRef) : ''}${renderTagBadgesHTML(s.tags||'') ? `<div class="tag-badges" style="margin-top:6px">${renderTagBadgesHTML(s.tags||[])}</div>` : ''}</div><div style="display:flex;gap:8px;align-items:center"><button class="btn approve" data-id="${s.id}">Approve</button><button class="btn ghost reject" data-id="${s.id}">Reject</button></div>`;
    area.appendChild(wrapper);
  });
  area.querySelectorAll('.approve').forEach(b => b.onclick = () => { approveSubmission(b.dataset.id); renderPendingSubmissions(); renderRankingEditor(); renderMainList(); renderAuditLog(); renderBannedUsersList(); });
  area.querySelectorAll('.reject').forEach(b => b.onclick = () => { if(!confirm('Reject?')) return; saveSubs(getSubs().filter(x => x.id !== b.dataset.id)); renderPendingSubmissions(); });
}

/* Approve submission (level or completion) */
function approveSubmission(id){
  const subs = getSubs(); const s = subs.find(x => x.id === id); if(!s) return;
  if(s.type === 'level'){
    const levels = getLevels(); const maxPlacement = levels.reduce((m,lv) => Math.max(m, lv.placement || 0), 0);
    const thumb = youtubeThumb(s.youtube) || '';
    const newLevel = {
      id: uid(),
      placement: maxPlacement + 1,
      name: s.name,
      levelId: s.levelId,
      creators: s.creators || [],
      thumbnail: thumb,
      youtube: s.youtube,
      tags: s.tags || [],
      status: 'published',
      submitter: s.submitter,
      approvedBy: getSession().username,
      approvedAt: now()
    };
    levels.push(newLevel); saveLevels(levels); saveSubs(subs.filter(x=>x.id !== id));
    addAudit({ id: uid(), action:'approve_level', actor:getSession() && getSession().username, target: newLevel.id, details:{ name:newLevel.name, placement:newLevel.placement }, ts: now() });
    alert('Level approved and added to main list');
  } else if(s.type === 'completion'){
    const levels = getLevels(); const level = levels.find(l => l.id === s.levelRef);
    if(!level){ alert('Referenced level not found'); return; }
    const placement = level.placement || 999;
    const pts = Math.max(1, Math.min(100, 101 - placement));
    const users = getUsers(); const user = users.find(u => u.username === s.submitter);
    if(!user){ alert('Submitter account missing'); saveSubs(subs.filter(x=>x.id !== id)); return; }
    user.points = (user.points || 0) + pts;
    user.completedRecords = user.completedRecords || [];
    const exists = user.completedRecords.find(r => r.levelId === s.levelRef && r.youtube === s.youtube);
    if(!exists){
      user.completedRecords.push({ levelId: s.levelRef, levelName: s.levelName || (level && level.name) || '', ts: now(), percent: (s.percent !== undefined ? s.percent : null), youtube: s.youtube, awardedPoints: pts });
    }
    saveUsers(users);
    saveSubs(subs.filter(x => x.id !== id));
    addAudit({ id: uid(), action:'approve_completion', actor:getSession() && getSession().username, target: s.id, details:{ submitter: user.username, level: s.levelRef, points: pts, percent: s.percent }, ts: now() });
    alert(`Approved completion — awarded ${pts} points to ${user.username}`);
  }
}

/* ----------------------- Ranking editor and tag edit/remove ----------------------- */
function renderRankingEditor(){
  const out = document.getElementById('ranking-editor'); if(!out) return; out.innerHTML = '';
  const levels = (getLevels()||[]).filter(l => l.status === 'published').slice().sort((a,b) => (a.placement||999) - (b.placement||999));
  if(!levels.length){ out.innerHTML = '<div class="muted">No published levels on the list.</div>'; return; }
  levels.forEach(l => {
    const row = document.createElement('div'); row.className = 'mod-item'; row.style.display = 'flex'; row.style.justifyContent = 'space-between'; row.style.alignItems = 'center';
    const left = document.createElement('div'); left.innerHTML = `<strong>#${l.placement}</strong> ${escapeHTML(l.name)}`;
    const right = document.createElement('div'); right.style.display = 'flex'; right.style.gap = '8px'; right.style.alignItems = 'center';
    const up = document.createElement('button'); up.className = 'btn ghost small-btn'; up.textContent = '↑'; up.onclick = () => { swapPlacement(l.id, -1); renderRankingEditor(); renderMainList(); };
    const down = document.createElement('button'); down.className = 'btn ghost small-btn'; down.textContent = '↓'; down.onclick = () => { swapPlacement(l.id, 1); renderRankingEditor(); renderMainList(); };
    const edit = document.createElement('button'); edit.className = 'btn ghost small-btn'; edit.innerHTML = '✎'; edit.title = 'Edit tags'; edit.onclick = () => openTagEditorForLevel(l.id);
    const removeBtn = document.createElement('button'); removeBtn.className = 'btn danger small-btn'; removeBtn.textContent = '✕'; removeBtn.onclick = () => { if(!confirm(`Permanently remove level "${l.name}"?`)) return; removeLevelById(l.id); addAudit({ id: uid(), action:'remove_level', actor:getSession() && getSession().username, target: l.id, details:{ name: l.name }, ts: now() }); renderRankingEditor(); renderMainList(); };
    right.appendChild(up); right.appendChild(down); right.appendChild(edit); right.appendChild(removeBtn);
    row.appendChild(left); row.appendChild(right);
    out.appendChild(row);
  });
}

/* swap placement helper */
function swapPlacement(levelId, dir){
  const levels = (getLevels()||[]).slice();
  const idx = levels.findIndex(l => l.id === levelId);
  if(idx === -1) return;
  const newIdx = idx + dir;
  if(newIdx < 0 || newIdx >= levels.length) return;
  const a = levels[idx];
  const b = levels[newIdx];
  const tmp = a.placement; a.placement = b.placement; b.placement = tmp;
  levels.sort((x,y)=> (x.placement||999) - (y.placement||999));
  saveLevels(levels);
  addAudit({ id: uid(), action:'swap_placement', actor:getSession() && getSession().username, target: levelId, details:{ dir }, ts: now() });
}

/* tag edit helper */
function openTagEditorForLevel(levelId){
  const levels = getLevels(); const level = levels.find(l => l.id === levelId); if(!level){ alert('Level not found'); return; }
  const tags = level.tags || [];
  const newTags = prompt('Edit tags (comma separated)', (tags||[]).join(', '));
  if(newTags === null) return;
  level.tags = newTags.split(',').map(s=>s.trim()).filter(Boolean);
  saveLevels(levels);
  addAudit({ id: uid(), action:'edit_tags', actor:getSession() && getSession().username, target: levelId, details:{ tags: level.tags }, ts: now() });
  renderRankingEditor(); renderMainList();
}

/* remove level */
function removeLevelById(id){
  const levels = getLevels().filter(l => l.id !== id);
  levels.sort((a,b) => (a.placement||999)-(b.placement||999)).forEach((l,i)=> l.placement = i+1);
  saveLevels(levels);
}

/* ----------------------- Banned users list ----------------------- */
function renderBannedUsersList(){
  const out = document.getElementById('banned-users-list'); if(!out) return; out.innerHTML = '';
  const users = (getUsers()||[]).filter(u => u.bannedUntil);
  if(!users.length){ out.innerHTML = '<div class="muted">No banned users</div>'; return; }
  users.forEach(u => {
    const item = document.createElement('div'); item.className = 'player-card';
    const left = document.createElement('div'); left.innerHTML = `<strong>${escapeHTML(u.username)}</strong> <div class="muted" style="font-size:13px">Until: ${u.bannedUntil===9999999999999?'Permanent':formatDate(u.bannedUntil)} • By: ${escapeHTML(u.bannedBy||'-')}</div>`;
    const right = document.createElement('div');
    const unban = document.createElement('button'); unban.className = 'btn small-btn'; unban.textContent = 'Unban'; unban.onclick = () => { if(!confirm('Unban user?')) return; delete u.bannedUntil; delete u.banReason; delete u.bannedBy; delete u.bannedAt; saveUsers(getUsers()); addAudit({ id: uid(), action:'unban', actor:getSession() && getSession().username, target: u.username, details:{}, ts: now() }); renderBannedUsersList(); renderAuditLog(); };
    right.appendChild(unban);
    item.appendChild(left); item.appendChild(right);
    out.appendChild(item);
  });
}

/* ----------------------- Audit log ----------------------- */
function renderAuditLog(){
  const out = document.getElementById('mod-audit-log'); if(!out) return; out.innerHTML = '';
  const logs = (getAudit()||[]).slice().sort((a,b)=> (b.ts||0)-(a.ts||0));
  if(!logs.length){ out.innerHTML = '<div class="muted">No audit entries</div>'; return; }
  logs.slice(0,50).forEach(e => {
    const item = document.createElement('div'); item.className = 'card'; item.style.margin = '6px 0'; item.innerHTML = `<div style="display:flex;justify-content:space-between;align-items:center"><div><strong>${escapeHTML(e.action)}</strong> — ${escapeHTML(e.actor||'')}</div><div class="muted">${formatDate(e.ts)}</div></div><div style="margin-top:6px;color:var(--muted);font-size:13px">${escapeHTML(JSON.stringify(e.details || {}))}</div>`;
    out.appendChild(item);
  });
}

/* ----------------------- User management area ----------------------- */
function renderUserManagementArea(){
  const outId = 'player-mgmt-area';
  let out = document.getElementById(outId);
  if(!out){
    out = document.createElement('div'); out.id = outId; out.style.marginTop = '12px';
    const container = document.querySelector('.container');
    if(container) container.appendChild(out);
  }
  const users = getUsers().slice().sort((a,b)=> (b.points||0)-(a.points||0));
  out.innerHTML = '<h3>Players (quick)</h3>';
  users.forEach(u => {
    const row = document.createElement('div'); row.className='player-card'; row.style.margin='6px 0';
    row.innerHTML = `<div><strong>${escapeHTML(u.username)}</strong> <div class="muted" style="font-size:13px">Role: ${escapeHTML(u.role||'user')} • Points: ${escapeHTML(String(u.points||0))}</div></div><div style="display:flex;gap:8px"><button class="btn small-btn promote">Promote</button><button class="btn danger small-btn demote">Demote</button></div>`;
    const promote = row.querySelector('.promote'); const demote = row.querySelector('.demote');
    promote.onclick = () => { u.role = (u.role === 'mod' ? 'headadmin' : 'mod'); saveUsers(getUsers()); addAudit({ id: uid(), action:'promote', actor:getSession() && getSession().username, target:u.username, details:{ role:u.role }, ts: now() }); renderUserManagementArea(); };
    demote.onclick = () => { if(u.role === 'headadmin') { alert('Cannot demote headadmin'); return; } u.role = 'user'; saveUsers(getUsers()); addAudit({ id: uid(), action:'demote', actor:getSession() && getSession().username, target:u.username, details:{ role:u.role }, ts: now() }); renderUserManagementArea(); };
    out.appendChild(row);
  });
}

/* ----------------------- Player search area ----------------------- */
function renderPlayerSearchArea(){
  const area = document.getElementById('player-search-area');
  if(!area) return;
  const results = document.getElementById('player-search-results') || document.createElement('div'); results.id='player-search-results';
  results.innerHTML = '';
  area.appendChild(results);
  area.querySelector('input')?.addEventListener('input', function(){
    const q = this.value.trim().toLowerCase();
    results.innerHTML = '';
    if(!q) return;
    getUsers().filter(u => u.username.toLowerCase().includes(q)).slice(0,10).forEach(u => {
      const pc = document.createElement('div'); pc.className='player-card';
      pc.innerHTML = `<div><strong>${escapeHTML(u.username)}</strong> <div class="muted">${escapeHTML(u.role||'')}</div></div><div><button class="btn small-btn view">View</button></div>`;
      pc.querySelector('.view').onclick = () => { window.location.href = `profile.html?user=${encodeURIComponent(u.username)}`; };
      results.appendChild(pc);
    });
  });
}

/* ----------------------- Mod helpers: audit add ----------------------- */
function addAudit(entry){
  const arr = getAudit(); arr.unshift(Object.assign({ id: uid(), ts: now() }, entry)); saveAudit(arr);
}

/* ----------------------- Profile + editing (minimal, safe) ----------------------- */
function initProfilePage(){
  renderTopbar();
  const params = new URLSearchParams(location.search);
  const userQuery = params.get('user');
  const session = getSession();
  const showUser = userQuery || (session && session.username);
  if(!showUser){ document.getElementById('profile-left') && (document.getElementById('profile-left').innerHTML = '<div class="muted">No user specified</div>'); return; }
  const users = getUsers(); const viewer = session ? users.find(u => u.username === session.username) : null;
  const target = users.find(u => u.username === showUser);
  if(!target){ document.getElementById('profile-left') && (document.getElementById('profile-left').innerHTML = '<div class="muted">User not found</div>'); return; }

  // Render profile preview where applicable
  renderProfilePreview(target);

  // Basic editor hookups (conservative: only wire simple save that matches earlier behavior)
  const editorArea = document.getElementById('editor-area');
  if(editorArea){
    const pfpInput = document.getElementById('profile-pic-input');
    const pfpPreview = document.getElementById('profile-pic-preview');
    const saveBtn = document.getElementById('profile-save-btn');

    // live preview (safe)
    if(pfpInput && pfpPreview){
      pfpInput.addEventListener('change', function(){
        const f = pfpInput.files && pfpInput.files[0];
        if(!f) return;
        const r = new FileReader();
        r.onload = function(ev){ try{ setImgSrcWithFallback(pfpPreview, ev.target.result); }catch(e){ pfpPreview.src = ev.target.result; } };
        r.readAsDataURL(f);
      });
    }

    // Save (minimal): follows original pattern — update viewer's storage entry if they're owner
    if(saveBtn){
      saveBtn.onclick = function(){
        const sess = getSession(); if(!sess){ alert('Login required'); return; }
        const usersAll = getUsers(); const me = usersAll.find(u => u.username === sess.username);
        if(!me){ alert('Account missing'); return; }

        // bio (if present)
        const bioEl = document.getElementById('profile-bio');
        if(bioEl) me.bio = (bioEl.value || '').slice(0, 250);

        // profile pic: handle file if present
        const fileInput = document.getElementById('profile-pic-input');
        if(fileInput && fileInput.files && fileInput.files[0]){
          const f = fileInput.files[0];
          const r = new FileReader();
          r.onload = function(ev){ me.profilePic = ev.target.result; saveUsers(usersAll); addAudit({ id: uid(), action:'edit_profile', actor: sess.username, target: me.username, details:{}, ts: now() }); renderTopbar(); renderProfilePreview(me); alert('Profile saved'); };
          r.readAsDataURL(f);
        } else {
          saveUsers(usersAll);
          addAudit({ id: uid(), action:'edit_profile', actor: sess.username, target: me.username, details:{}, ts: now() });
          renderTopbar(); renderProfilePreview(me); alert('Profile saved');
        }
      };
    }
  }
}

/* profile preview helper (safe update of DOM nodes if present) */
function renderProfilePreview(user){
  const left = document.getElementById('profile-left');
  if(!left) return;
  // Common placeholders that pages may use; update if exist
  const nameNode = document.getElementById('pl-username');
  const bioNode = document.getElementById('pl-bio');
  const pfpNode = document.getElementById('profile-pic-preview');
  const titleNode = document.getElementById('pl-title');
  const countryNode = document.getElementById('pl-country');

  if(nameNode) nameNode.textContent = user.username || '';
  if(bioNode) { bioNode.textContent = user.bio || ''; bioNode.style.whiteSpace='normal'; bioNode.style.wordWrap='break-word'; bioNode.style.overflowWrap='break-word'; }
  if(titleNode) titleNode.textContent = (user.equippedTitle ? (TITLES.find(t=>t.id===user.equippedTitle)||{}).label : '') || '';
  if(countryNode) countryNode.textContent = user.showCountry && user.nationality ? (countryToFlag(user.nationality) + ' ' + user.nationality) : '';
  if(pfpNode){
    try { setImgSrcWithFallback(pfpNode, (user.profilePic && user.profilePic.trim()) ? user.profilePic : DEFAULT_PFP); } catch(e){ pfpNode.src = (user.profilePic || DEFAULT_PFP); }
  }
}

/* ----------------------- Utility exports ----------------------- */
function pointsForPlacement(placement){
  if(!placement) return 1;
  const p = Math.max(1, Math.min(100, 101 - (placement || 999)));
  return p;
}

/* expose initPage globally */
window.initPage = initPage;

/* End of scripts.js */