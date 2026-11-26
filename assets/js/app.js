// ═══════════════════════════════════════════════════════
// ECOCYCLE APP v4.0 — Premium JS
// ═══════════════════════════════════════════════════════

const API = '/sampah/api';
let token = localStorage.getItem('ec_token');
let currentUser  = null;
let charts       = {};
let mapInstance  = null;
let mapMarkers   = [];
let allLocations = [];
let currentScanId   = null;
let iotInterval     = null;
let currentScanMode = 'camera';
let selectedFile    = null;
let cameraStream    = null;
let facingMode      = 'environment';
let flashEnabled    = false;

// ════════════════════════════════════════════════════════
// PARTICLE ENGINE — Enhanced (emoji + geometric dots)
// ════════════════════════════════════════════════════════
(function initParticles() {
  const canvas = document.getElementById('particleCanvas');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  let W, H;
  let emojiParticles = [];
  let dotParticles   = [];

  // Emoji particles
  const SYMBOLS = ['🌿','♻️','🌱','💚','⚡','🍃','🌾','✨'];
  const EMOJI_COUNT = 22;

  // Geometric dot colors — hijau & gold lebih intens
  const DOT_COLORS = [
    'rgba(22,163,74,',    // green
    'rgba(201,162,39,',   // gold
    'rgba(74,222,128,',   // green-bright
    'rgba(232,197,71,',   // gold-light
    'rgba(13,74,46,',     // forest
    'rgba(255,255,255,',  // white shimmer
  ];
  const DOT_COUNT = 35;

  function resize() {
    W = canvas.width  = window.innerWidth;
    H = canvas.height = window.innerHeight;
  }

  function createEmoji() {
    return {
      x:    Math.random() * W,
      y:    H + 40,
      size: 14 + Math.random() * 18,
      vy:   -(0.35 + Math.random() * 0.8),
      vx:   (Math.random() - 0.5) * 0.5,
      rot:  Math.random() * 360,
      rspd: (Math.random() - 0.5) * 1.5,
      sym:  SYMBOLS[Math.floor(Math.random() * SYMBOLS.length)],
      alpha: 0,
    };
  }

  function createDot() {
    return {
      x:     Math.random() * W,
      y:     H + 20,
      r:     2 + Math.random() * 5,
      vy:   -(0.4 + Math.random() * 1.2),
      vx:   (Math.random() - 0.5) * 0.8,
      color: DOT_COLORS[Math.floor(Math.random() * DOT_COLORS.length)],
      alpha: 0,
      maxA:  0.55 + Math.random() * 0.45,  // max opacity 0.55–1.0
      pulse: Math.random() * Math.PI * 2,  // phase offset
    };
  }

  function init() {
    resize();
    emojiParticles = Array.from({length: EMOJI_COUNT}, createEmoji).map(p => {
      p.y = Math.random() * H;
      return p;
    });
    dotParticles = Array.from({length: DOT_COUNT}, createDot).map(p => {
      p.y = Math.random() * H;
      return p;
    });
  }

  function draw() {
    ctx.clearRect(0, 0, W, H);
    const now = Date.now() / 1000;

    // — Draw dots (geometric) —
    dotParticles.forEach(p => {
      p.y  += p.vy;
      p.x  += p.vx;
      p.pulse += 0.02;

      const progress = 1 - (p.y / H);
      // Pulse effect: opacity berdenyut
      const pulseMod = 0.15 * Math.sin(p.pulse);
      p.alpha = Math.min(p.maxA, Math.max(0, progress * 2 + pulseMod));

      if (p.y < -20) Object.assign(p, createDot());

      ctx.save();
      ctx.globalAlpha = p.alpha;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
      ctx.fillStyle = p.color + p.alpha + ')';
      ctx.fill();
      // Glow ring pada dot gold
      if (p.color.includes('201,162') || p.color.includes('232,197')) {
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r + 3, 0, Math.PI * 2);
        ctx.strokeStyle = p.color + (p.alpha * 0.3) + ')';
        ctx.lineWidth = 1;
        ctx.stroke();
      }
      ctx.restore();
    });

    // — Draw emoji —
    emojiParticles.forEach(p => {
      p.y   += p.vy;
      p.x   += p.vx;
      p.rot += p.rspd;

      const progress = 1 - (p.y / H);
      p.alpha = Math.min(0.75, progress * 2.0);

      if (p.y < -40) Object.assign(p, createEmoji());

      ctx.save();
      ctx.globalAlpha = Math.max(0, p.alpha);
      ctx.translate(p.x, p.y);
      ctx.rotate(p.rot * Math.PI / 180);
      ctx.font = `${p.size}px serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(p.sym, 0, 0);
      ctx.restore();
    });

    requestAnimationFrame(draw);
  }

  window.addEventListener('resize', resize);
  init();
  draw();
})();

// ════════════════════════════════════════════════════════
// UTILITIES
// ════════════════════════════════════════════════════════
function toast(msg, type) {
  type = type || 'success';
  var c = document.getElementById('toastContainer');
  if (!c) { console.warn('[toast]', msg); return; }
  var t = document.createElement('div');
  t.className = 'toast ' + type;
  var icon = type === 'success' ? '&#10003;' : type === 'error' ? '&#10005;' : '&#9888;';
  t.innerHTML = '<span style="font-size:1rem;">' + icon + '</span><span>' + msg + '</span>';
  c.appendChild(t);
  setTimeout(function() {
    t.style.opacity = '0';
    t.style.transform = 'translateY(-10px)';
    setTimeout(function() { if (t.parentNode) t.remove(); }, 300);
  }, 3200);
}

function togglePwd(id, btn) {
  const inp = document.getElementById(id);
  if (!inp) return;
  if (inp.type === 'password') { inp.type = 'text'; btn.textContent = '🙈'; }
  else { inp.type = 'password'; btn.textContent = '👁'; }
}

async function api(endpoint, method = 'GET', body = null, isForm = false) {
  const opts = { method, headers: { 'Authorization': `Bearer ${token}` } };
  if (body && !isForm) { opts.headers['Content-Type'] = 'application/json'; opts.body = JSON.stringify(body); }
  else if (body && isForm) { opts.body = body; }
  try {
    const res = await fetch(`${API}/${endpoint}`, opts);
    return await res.json();
  } catch(e) { return { error: 'Network error' }; }
}

function timeAgo(ts) {
  if (!ts) return '—';
  const d = Math.floor((Date.now() - new Date(ts)) / 1000);
  if (d < 60) return 'baru saja';
  if (d < 3600) return Math.floor(d/60) + 'm lalu';
  if (d < 86400) return Math.floor(d/3600) + 'j lalu';
  return Math.floor(d/86400) + 'h lalu';
}

function animateCounter(el, target, duration = 1200) {
  if (!el) return;
  const start = performance.now();
  const from  = parseFloat(el.textContent.replace(/[^0-9.]/g,'')) || 0;
  const isFloat = String(target).includes('.');
  function step(now) {
    const p = Math.min((now - start) / duration, 1);
    const ease = 1 - Math.pow(1 - p, 3);
    const val  = from + (target - from) * ease;
    el.textContent = isFloat ? val.toFixed(1) : Math.round(val).toLocaleString();
    if (p < 1) requestAnimationFrame(step);
  }
  requestAnimationFrame(step);
}

// ════════════════════════════════════════════════════════
// AUTH
// ════════════════════════════════════════════════════════
function showAuth(view) {
  ['authLogin','authRegister','authForgot'].forEach(id => document.getElementById(id).classList.add('hidden'));
  document.getElementById('auth' + view.charAt(0).toUpperCase() + view.slice(1)).classList.remove('hidden');
}

async function doLogin() {
  const email = document.getElementById('loginEmail').value.trim();
  const password = document.getElementById('loginPassword').value;
  if (!email || !password) return toast('Isi semua kolom', 'error');
  const btn = document.getElementById('loginBtn');
  btn.disabled = true; btn.textContent = 'Masuk...';
  const res = await api('auth/?action=login', 'POST', { email, password });
  btn.disabled = false; btn.textContent = 'Masuk';
  if (!res.success) return toast(res.message || res.error || 'Login gagal', 'error');
  token = res.data?.token || res.token;
  localStorage.setItem('ec_token', token);
  currentUser = res.data?.user || res.user;
  initApp();
}

async function doRegister() {
  const name = document.getElementById('regName').value.trim();
  const email = document.getElementById('regEmail').value.trim();
  const phone = document.getElementById('regPhone').value.trim();
  const password = document.getElementById('regPassword').value;
  if (!name || !email || !password) return toast('Isi kolom yang wajib', 'error');
  const btn = document.getElementById('regBtn');
  btn.disabled = true; btn.textContent = 'Mendaftar...';
  const res = await api('auth/?action=register', 'POST', { name, email, phone, password });
  btn.disabled = false; btn.textContent = 'Buat Akun';
  if (!res.success) return toast(res.message || res.error || 'Registrasi gagal', 'error');
  token = res.data?.token || res.token;
  localStorage.setItem('ec_token', token);
  currentUser = res.data?.user || res.user;
  toast('Selamat datang di EcoCycle! 🌿');
  initApp();
}

async function doForgot() {
  const email = document.getElementById('forgotEmail').value.trim();
  if (!email) return toast('Masukkan email Anda', 'error');
  const res = await api('auth/?action=forgot-password', 'POST', { email });
  toast(res.message || 'Tautan reset dikirim');
}

function doLogout() {
  localStorage.removeItem('ec_token');
  token = null; currentUser = null;
  if (iotInterval) clearInterval(iotInterval);
  stopCamera();
  document.getElementById('appShell').classList.add('hidden');
  showAuth('login');
}

// ════════════════════════════════════════════════════════
// INIT APP
// ════════════════════════════════════════════════════════
async function initApp() {
  ['authLogin','authRegister','authForgot'].forEach(id => document.getElementById(id).classList.add('hidden'));
  document.getElementById('appShell').classList.remove('hidden');
  const res = await api('auth/?action=me');
  if (res.error || !res.success) { doLogout(); return; }
  currentUser = res.data?.user || res.user;
  updateUserUI();
  loadDashboard();
  loadCategories();
  startIoTPolling();
}

function updateUserUI() {
  if (!currentUser) return;
  const name = currentUser.name || 'EcoCycler';
  const pts  = currentUser.eco_points || 0;
  const safe = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = val; };
  safe('heroUserName', name);
  safe('heroLevel',    currentUser.level || 'Eco Starter');
  const hpEl = document.getElementById('heroPoints');
  if (hpEl) animateCounter(hpEl, pts, 900);
  safe('profileName',   name);
  safe('profileEmail',  currentUser.email);
  safe('profileLevel',  currentUser.level || 'Eco Starter');
  safe('profileAvatar', name.charAt(0).toUpperCase());
  const ppEl = document.getElementById('profilePoints');
  if (ppEl) animateCounter(ppEl, pts, 900);
  safe('profileScans', currentUser.total_scans || 0);
  safe('profileWaste', parseFloat(currentUser.waste_contributed || 0).toFixed(1));
  safe('profileCO2',   Math.round((currentUser.total_scans || 0) * 0.8));
}

// ════════════════════════════════════════════════════════
// NAVIGATION
// ════════════════════════════════════════════════════════
const pageNavMap = {
  pageHome:'navHome', pageMap:'navMap', pageScan:'navScan',
  pageMonitor:'navMonitor', pageProfile:'navProfile'
};

function showPage(pageId) {
  const prev = document.querySelector('.page.active');
  if (prev?.id === 'pageScan' && pageId !== 'pageScan') stopCamera();
  if (pageId === 'pageScan' && currentScanMode === 'camera') setTimeout(startCamera, 250);

  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
  const pg = document.getElementById(pageId);
  if (pg) pg.classList.add('active');
  const navId = pageNavMap[pageId];
  if (navId) document.getElementById(navId)?.classList.add('active');

  if (pageId === 'pageMap')           initMap();
  if (pageId === 'pageHistory')       loadHistory();
  if (pageId === 'pageAnalytics')     loadAnalytics('weekly');
  if (pageId === 'pageRewards')       loadRewards();
  if (pageId === 'pageImpact')        loadImpact();
  if (pageId === 'pageNotifications') loadNotifications();
  if (pageId === 'pageViewer3d')      initProtoViewer('biodigester');
  if (pageId === 'pageMonitor')       loadMonitorData();
  window.scrollTo(0, 0);
}

// ════════════════════════════════════════════════════════
// DASHBOARD
// ════════════════════════════════════════════════════════
async function loadDashboard() {
  const res = await api('analytics/?action=dashboard');
  if (!res.success && !res.stats) return;
  const s = res.data?.stats || res.stats || {};
  const ids = ['statTotalWaste','statBiogas','statOil','statCO2'];
  const vals = [
    parseFloat(s.total_waste_processed) || 0,
    parseFloat(s.total_biogas_m3)       || 0,
    parseFloat(s.total_pyrolysis_oil_l) || 0,
    Math.round(s.co2_saved_kg)          || 0,
  ];
  ids.forEach((id, i) => { const el = document.getElementById(id); if (el) animateCounter(el, vals[i], 1200); });

  const activity = res.data?.recent_activity || res.recent_activity || [];
  const list = document.getElementById('recentActivityList');
  if (!list) return;
  if (!activity.length) {
    list.innerHTML = `<div style="padding:28px;text-align:center;color:var(--muted);font-size:0.875rem;">Belum ada aktivitas. Mulai dengan scan sampah! 🌿</div>`;
    return;
  }
  const icons = { organic:'🌿', 'non-organic':'♻️', hazardous:'⚠️', residual:'🗑️' };
  list.innerHTML = activity.map(a => `
    <div class="list-item" style="padding:12px 16px;">
      <div class="list-icon" style="background:${a.color||'#f0fdf4'};font-size:1.1rem;">${icons[a.type]||'📦'}</div>
      <div class="list-content">
        <div class="list-title">${a.waste_name||'Sampah tidak diketahui'}</div>
        <div class="list-sub">${a.recommendation||''} · ${timeAgo(a.created_at)}</div>
      </div>
      <span class="badge ${a.confidence_level==='high'?'badge-green':a.confidence_level==='low'?'badge-yellow':'badge-gray'}" style="font-size:0.63rem;">${(a.confidence_level||'?').toUpperCase()}</span>
    </div>`).join('');
}

// ════════════════════════════════════════════════════════
// SCAN — Camera
// ════════════════════════════════════════════════════════
function switchScanMode(mode) {
  currentScanMode = mode;
  const camEl = document.getElementById('scanModeCamera');
  const galEl = document.getElementById('scanModeGallery');
  const tabCam = document.getElementById('tabCamera');
  const tabGal = document.getElementById('tabGallery');
  if (mode === 'camera') {
    if (camEl) camEl.style.display = 'block';
    if (galEl) galEl.style.display = 'none';
    if (tabCam) { tabCam.style.background='rgba(255,255,255,0.22)'; tabCam.style.borderColor='rgba(255,255,255,0.6)'; tabCam.style.color='white'; }
    if (tabGal) { tabGal.style.background='transparent'; tabGal.style.borderColor='rgba(255,255,255,0.2)'; tabGal.style.color='rgba(255,255,255,0.55)'; }
    document.getElementById('scanResult').classList.add('hidden');
    startCamera();
  } else {
    if (camEl) camEl.style.display = 'none';
    if (galEl) galEl.style.display = 'block';
    if (tabGal) { tabGal.style.background='rgba(255,255,255,0.22)'; tabGal.style.borderColor='rgba(255,255,255,0.6)'; tabGal.style.color='white'; }
    if (tabCam) { tabCam.style.background='transparent'; tabCam.style.borderColor='rgba(255,255,255,0.2)'; tabCam.style.color='rgba(255,255,255,0.55)'; }
    stopCamera();
  }
}

async function startCamera() {
  const video   = document.getElementById('cameraVideo');
  const errEl   = document.getElementById('cameraError');
  const loading = document.getElementById('cameraLoading');
  if (!video) return;
  if (errEl)   errEl.style.display   = 'none';
  if (loading) loading.style.display = 'flex';
  stopCamera();
  try {
    cameraStream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode, width:{ideal:1280}, height:{ideal:720} }, audio: false
    });
    video.srcObject = cameraStream;
    await video.play();
    if (loading) loading.style.display = 'none';
  } catch(err) {
    if (loading) loading.style.display = 'none';
    if (errEl)   errEl.style.display   = 'flex';
    let msg = 'Kamera tidak dapat diakses.';
    if (err.name==='NotAllowedError')  msg = 'Akses kamera ditolak. Izinkan kamera di pengaturan browser.';
    else if (err.name==='NotFoundError') msg = 'Kamera tidak ditemukan. Gunakan mode Pilih Foto.';
    else if (err.name==='NotReadableError') msg = 'Kamera dipakai aplikasi lain. Tutup dulu lalu coba lagi.';
    else if (location.protocol!=='https:' && location.hostname!=='localhost') msg = 'Kamera butuh HTTPS. Gunakan localhost.';
    const msgEl = document.getElementById('cameraErrorMsg');
    if (msgEl) msgEl.textContent = msg;
    console.warn('Camera:', err.name, err.message);
  }
}

function stopCamera() {
  if (cameraStream) { cameraStream.getTracks().forEach(t=>t.stop()); cameraStream = null; }
  const v = document.getElementById('cameraVideo');
  if (v) v.srcObject = null;
}

function flipCamera() {
  facingMode = facingMode === 'environment' ? 'user' : 'environment';
  startCamera();
  toast(facingMode==='user' ? 'Kamera depan aktif' : 'Kamera belakang aktif');
}

function toggleFlash() {
  if (!cameraStream) return;
  const track = cameraStream.getVideoTracks()[0];
  const caps  = track?.getCapabilities?.() || {};
  if (!caps.torch) { toast('Flash tidak didukung perangkat ini', 'warning'); return; }
  flashEnabled = !flashEnabled;
  track.applyConstraints({ advanced:[{torch:flashEnabled}] }).catch(()=>{});
  const btn = document.getElementById('flashBtn');
  if (btn) btn.style.background = flashEnabled ? '#fef3c7' : 'var(--bg)';
  toast(flashEnabled ? 'Flash ON ⚡' : 'Flash OFF');
}

async function captureFromCamera() {
  const video  = document.getElementById('cameraVideo');
  const canvas = document.getElementById('captureCanvas');
  const flash  = document.getElementById('captureFlash');
  if (!video?.srcObject) { toast('Kamera belum aktif', 'error'); return; }
  if (flash) { flash.style.opacity='0.9'; setTimeout(()=>{flash.style.animation='flashFade 0.3s forwards';flash.style.opacity='0';},50); }
  canvas.width  = video.videoWidth  || 640;
  canvas.height = video.videoHeight || 480;
  const ctx = canvas.getContext('2d');
  // Tidak ada mirror — gambar selalu normal (tidak di-flip)
  ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
  canvas.toBlob(async blob => {
    if (!blob) { toast('Gagal ambil gambar', 'error'); return; }
    selectedFile = new File([blob], `scan_${Date.now()}.jpg`, {type:'image/jpeg'});
    await runScanPipeline(selectedFile);
  }, 'image/jpeg', 0.88);
}

function handleImageSelect(e) {
  const file = e.target.files[0];
  if (!file) return;
  if (!['image/jpeg','image/png','image/webp'].includes(file.type)) return toast('Format tidak valid. Gunakan JPG, PNG, WEBP', 'error');
  if (file.size > 10*1024*1024) return toast('Foto terlalu besar (maks 10 MB)', 'error');
  selectedFile = file;
  const reader = new FileReader();
  reader.onload = ev => {
    const ph = document.getElementById('scanPlaceholder');
    const img = document.getElementById('scanPreviewImg');
    const frame = document.getElementById('scanFrame');
    const btn   = document.getElementById('scanBtn');
    if (ph)    ph.style.display    = 'none';
    if (img)   { img.src = ev.target.result; img.style.display = 'block'; }
    if (frame) frame.style.display = 'block';
    if (btn)   btn.disabled        = false;
  };
  reader.readAsDataURL(file);
  document.getElementById('scanResult').classList.add('hidden');
}

async function doScan() {
  if (!selectedFile) return;
  await runScanPipeline(selectedFile);
}

// ════════════════════════════════════════════════════════
// SCAN PIPELINE
// ════════════════════════════════════════════════════════
async function runScanPipeline(file) {
  const camEl = document.getElementById('scanModeCamera');
  const galEl = document.getElementById('scanModeGallery');
  if (camEl) camEl.style.display = 'none';
  if (galEl) galEl.style.display = 'none';
  document.getElementById('scanResult').classList.add('hidden');
  document.getElementById('scanProcessing').classList.remove('hidden');

  // Animate steps
  const stepIds = ['step2','step3','step4'];
  stepIds.forEach(id => {
    const el = document.getElementById(id);
    if (el) { el.style.opacity='0.35'; el.firstChild && (el.firstChild.textContent='⟳'); }
  });
  [500,950,1400].forEach((ms,i) => setTimeout(()=>{
    const el = document.getElementById(stepIds[i]);
    if (el) { el.style.opacity='1'; el.firstChild && (el.firstChild.textContent='✓'); }
  }, ms));

  const form = new FormData();
  form.append('image', file);
  const res = await api('waste/?action=scan', 'POST', form, true);

  document.getElementById('scanProcessing').classList.add('hidden');
  if (currentScanMode==='camera') { if (camEl) camEl.style.display='block'; }
  else { if (galEl) galEl.style.display='block'; }

  if (!res.success) {
    const msg = res.message || res.error || 'Scan gagal';
    if (msg.toLowerCase().includes('database')||msg.toLowerCase().includes('connection'))
      toast('❌ Database error: '+msg+' — Pastikan XAMPP MySQL menyala.','error');
    else toast(msg, 'error');
    return;
  }

  const data   = res.data   || res;
  const result = data.result || data;
  currentScanId = data.scan_id || res.scan_id;

  displayScanResult(result, data.points_earned || 5);
  if (currentUser) {
    currentUser.eco_points  = (currentUser.eco_points||0)  + (data.points_earned||5);
    currentUser.total_scans = (currentUser.total_scans||0) + 1;
    updateUserUI();
  }
  toast(`+${data.points_earned||5} Eco Points! 🌿`);
}

// ════════════════════════════════════════════════════════
// DISPLAY SCAN RESULT
// ════════════════════════════════════════════════════════
function displayScanResult(r, pts) {
  if (!r) return;
  const mainCat = (r.main_category||'').toUpperCase();
  const catStyle = {
    'ORGANIK':     { bar:'linear-gradient(135deg,#166534,#22c55e)', border:'#16a34a', bg:'#f0fdf4', text:'#14532d', badge:'badge-green' },
    'NON-ORGANIK': { bar:'linear-gradient(135deg,#1d4ed8,#60a5fa)', border:'#2563eb', bg:'#eff6ff', text:'#1e3a8a', badge:'badge-blue'  },
    'B3':          { bar:'linear-gradient(135deg,#991b1b,#f87171)', border:'#dc2626', bg:'#fef2f2', text:'#7f1d1d', badge:'badge-red'   },
    'RESIDU':      { bar:'linear-gradient(135deg,#334155,#94a3b8)', border:'#64748b', bg:'#f8fafc', text:'#1e293b', badge:'badge-gray'  },
  };
  const cs = catStyle[mainCat] || catStyle['RESIDU'];

  const set = (id, v) => { const e=document.getElementById(id); if(e) e.textContent=v; };
  const style = (id, prop, v) => { const e=document.getElementById(id); if(e) e.style[prop]=v; };

  style('resultTopBar','background', cs.bar);
  set('resultWasteName', r.waste_name||'—');

  const catBadge = document.getElementById('resultCategoryBadge');
  if (catBadge) { catBadge.textContent = mainCat || r.category||'Unknown'; catBadge.className = 'badge '+cs.badge; }
  set('resultMaterial', r.material||'—');

  const conf = parseFloat(r.confidence)||0;
  set('resultConfidence', conf+'%');
  const circle = document.getElementById('confCircle');
  if (circle) {
    const cc = conf>=85?'#16a34a':conf>=60?'#f59e0b':'#ef4444';
    circle.style.borderColor=cc; circle.style.color=cc;
  }
  const cb = document.getElementById('resultConfidenceBadge');
  if (cb) {
    if (r.confidence_level==='high')    { cb.textContent='✓ AKURASI TINGGI'; cb.className='badge badge-green'; }
    else if (r.confidence_level==='low'){ cb.textContent='⚠ AKURASI RENDAH'; cb.className='badge badge-yellow'; }
    else                                { cb.textContent='? TIDAK DIKETAHUI'; cb.className='badge badge-gray'; }
  }

  // Composition bar from API
  const comp = r.composition || {organic:0,non_organic:100,hazardous:0,residual:0};
  renderCompositionBar(comp);

  const recCard = document.getElementById('resultRecommendationCard');
  if (recCard) { recCard.style.background=cs.bg; recCard.style.borderLeftColor=cs.border; }
  const recLabel = document.getElementById('resultRecLabel');
  if (recLabel) { recLabel.style.color=cs.text; recLabel.textContent = mainCat==='B3'?'⚠ PENANGANAN KHUSUS':mainCat==='ORGANIK'?'🌿 REKOMENDASI':mainCat==='NON-ORGANIK'?'♻ REKOMENDASI':'🗑 REKOMENDASI'; }
  const recEl = document.getElementById('resultRecommendation');
  if (recEl) { recEl.textContent=r.recommendation||'—'; recEl.style.color=cs.text; }

  const routeMap = {
    biodigester:        ['Sampah Organik','Smart Biodigester','Produksi Biogas'],
    recycling:          ['Non-Organik','Pemilahan Cerdas','Daur Ulang'],
    pyrolysis:          ['Plastik Pirolisis','Smart Pyrolysis','Minyak Pirolisis'],
    special_handling:   ['Sampah B3','Penanganan Khusus','Fasilitas B3'],
    residual_management:['Sampah Residu','Fasilitas Residual'],
    residual:           ['Sampah Residu','Manajemen Limbah'],
  };
  const route = routeMap[r.processing_route] || [r.processing_route||'Pemrosesan'];
  const routeEl = document.getElementById('resultRouteFlow');
  if (routeEl) routeEl.innerHTML = route.map((s,i) =>
    `<span class="route-step">${s}</span>${i<route.length-1?'<span class="route-arrow">→</span>':''}`
  ).join('');

  const actionDiv = document.getElementById('resultActionBtn');
  if (actionDiv) actionDiv.innerHTML = buildActionButtons(r, mainCat, cs);

  const ptsEl = document.getElementById('resultPointsText');
  if (ptsEl) ptsEl.textContent = `+${pts||5} Eco Points`;

  // Show result with animation
  const result = document.getElementById('scanResult');
  result.classList.remove('hidden');
  const card = document.getElementById('scanResultCard');
  if (card) { card.style.animation='none'; card.offsetHeight; card.style.animation='resultGlow 0.6s ease'; }
  setTimeout(()=>result.scrollIntoView({behavior:'smooth',block:'start'}), 150);
}

function buildActionButtons(r, mainCat, cs) {
  const ir = r.iot_redirect;
  if (mainCat==='ORGANIK') return `
    <button onclick="showPage('pageMonitor');switchMonitorTab('biodigester',document.querySelector('#monitorTabs .tab-btn'))"
      style="width:100%;padding:13px;border-radius:var(--r-sm);background:${cs.bar};border:none;color:white;font-size:0.875rem;font-weight:800;cursor:pointer;display:flex;align-items:center;justify-content:center;gap:8px;box-shadow:0 4px 16px rgba(22,163,74,0.35);">
      🌿 BUKA IoT BIODIGESTER
    </button>`;
  if (mainCat==='NON-ORGANIK') {
    if (ir==='pyrolysis') return `
      <button onclick="showPage('pageMonitor');setTimeout(()=>{switchMonitorTab('pyrolysis',document.querySelectorAll('#monitorTabs .tab-btn')[1])},150)"
        style="width:100%;padding:13px;border-radius:var(--r-sm);background:linear-gradient(135deg,#6d28d9,#8b5cf6);border:none;color:white;font-size:0.875rem;font-weight:800;cursor:pointer;display:flex;align-items:center;justify-content:center;gap:8px;box-shadow:0 4px 16px rgba(109,40,217,0.3);margin-bottom:8px;">
        ⚗️ BUKA IoT SMART PYROLYSIS
      </button>
      <div style="font-size:0.72rem;color:var(--muted);text-align:center;">Material ini cocok sebagai bahan baku pirolisis</div>`;
    return `
      <button onclick="showPage('pageMap')"
        style="width:100%;padding:13px;border-radius:var(--r-sm);background:${cs.bar};border:none;color:white;font-size:0.875rem;font-weight:800;cursor:pointer;display:flex;align-items:center;justify-content:center;gap:8px;box-shadow:0 4px 16px rgba(37,99,235,0.3);">
        ♻️ LIHAT FASILITAS DAUR ULANG
      </button>`;
  }
  if (mainCat==='B3') return `
    <div style="background:#fef2f2;border:1px solid #fca5a5;border-radius:var(--r-sm);padding:12px;margin-bottom:10px;font-size:0.8rem;color:#7f1d1d;line-height:1.5;">
      ⚠️ <strong>Limbah B3</strong> — Jangan campur dengan sampah umum. Serahkan ke fasilitas bersertifikasi KLHK.
    </div>
    <button onclick="showPage('pageMap')"
      style="width:100%;padding:13px;border-radius:var(--r-sm);background:linear-gradient(135deg,#991b1b,#ef4444);border:none;color:white;font-size:0.875rem;font-weight:800;cursor:pointer;display:flex;align-items:center;justify-content:center;gap:8px;">
      🗺️ LIHAT FASILITAS B3 DI ECO MAP
    </button>`;
  return `
    <div style="background:#f8fafc;border:1px solid var(--border);border-radius:var(--r-sm);padding:12px;margin-bottom:10px;font-size:0.8rem;color:var(--slate);line-height:1.5;">
      🗑️ Sampah residu tidak memiliki jalur utama. Pisahkan dan serahkan ke fasilitas residual.
    </div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;">
      <button onclick="showPage('pageMap')" style="padding:11px;border-radius:var(--r-sm);background:#475569;border:none;color:white;font-size:0.8rem;font-weight:700;cursor:pointer;">🗺️ ECO MAP</button>
      <button onclick="toast('Panduan segera tersedia','warning')" style="padding:11px;border-radius:var(--r-sm);background:var(--bg);border:1.5px solid var(--border);color:var(--navy);font-size:0.8rem;font-weight:700;cursor:pointer;">📋 PANDUAN</button>
    </div>`;
}

function renderCompositionBar(comp) {
  const org = parseFloat(comp.organic||0);
  const non = parseFloat(comp.non_organic||0);
  const haz = parseFloat(comp.hazardous||0);
  const res = Math.max(0, 100-org-non-haz);
  const set = (id,pct) => { const e=document.getElementById(id); if(e) setTimeout(()=>e.style.width=pct+'%',80); };
  set('barOrganic',org); set('barNonOrganic',non); set('barHazardous',haz); set('barResidual',res);
  const lbl = (id,pct) => { const e=document.getElementById(id); if(e) e.textContent=pct>=14?pct+'%':''; };
  lbl('barOrganicLabel',org); lbl('barNonOrganicLabel',non); lbl('barHazardousLabel',haz); lbl('barResidualLabel',res);
  const pct = (id,v) => { const e=document.getElementById(id); if(e) e.textContent=v+'%'; };
  pct('pctOrganic',org); pct('pctNonOrganic',non); pct('pctHazardous',haz); pct('pctResidual',res);
}

function resetScan() {
  selectedFile = null;
  const els = { scanPreviewImg:'none', scanFrame:'none', scanPlaceholder:'block' };
  Object.entries(els).forEach(([id,v]) => { const e=document.getElementById(id); if(e) e.style.display=v; });
  const img=document.getElementById('scanPreviewImg'); if(img) img.src='';
  const btn=document.getElementById('scanBtn'); if(btn) btn.disabled=true;
  const fi=document.getElementById('fileInput'); if(fi) fi.value='';
  document.getElementById('scanResult').classList.add('hidden');
  const camEl=document.getElementById('scanModeCamera');
  const galEl=document.getElementById('scanModeGallery');
  if (currentScanMode==='camera') {
    if(camEl) camEl.style.display='block'; if(galEl) galEl.style.display='none';
    if (!cameraStream) startCamera();
  } else {
    if(camEl) camEl.style.display='none'; if(galEl) galEl.style.display='block';
  }
  ['step2','step3','step4'].forEach(id => {
    const el=document.getElementById(id); if(el){ el.style.opacity='0.35'; el.firstChild && (el.firstChild.textContent='⟳'); }
  });
  window.scrollTo(0,0);
}

// ════════════════════════════════════════════════════════
// CATEGORIES & FEEDBACK
// ════════════════════════════════════════════════════════
async function loadCategories() {
  const res = await api('waste/?action=categories');
  if (!res.success || !res.data?.categories) return;
  const cats = res.data.categories || res.categories || [];
  const container = document.getElementById('categoriesRef');
  if (!container) return;
  const emoji = {organic:'🌿',plastic:'🧴',paper:'📄',metal:'🔩',glass:'🫙','pyrolysis-plastic':'⚗️',hazardous:'⚠️',residual:'🗑️'};
  container.innerHTML = cats.map(c=>`
    <div class="list-item" style="padding:12px 16px;">
      <div class="list-icon" style="background:${c.color||'#f0fdf4'}22;font-size:1rem;">${emoji[c.slug]||'📦'}</div>
      <div class="list-content">
        <div class="list-title">${c.name}</div>
        <div class="list-sub">${(c.processing_route||'').replace(/_/g,' ')} · ${c.points_per_kg} pts/kg</div>
      </div>
      <span class="badge ${c.type==='organic'?'badge-green':c.type==='hazardous'?'badge-red':'badge-blue'}">${(c.type||'').toUpperCase()}</span>
    </div>`).join('');
  const fb = document.getElementById('feedbackCategories');
  if (fb) fb.innerHTML = cats.map(c=>`
    <label style="display:flex;align-items:center;gap:10px;padding:10px;border:1.5px solid var(--border);border-radius:var(--r-sm);cursor:pointer;transition:var(--tr);" onmouseover="this.style.borderColor='var(--green-mid)'" onmouseout="this.style.borderColor='var(--border)'">
      <input type="radio" name="fbCat" value="${c.id}" style="accent-color:var(--green-mid);">
      <span style="font-size:0.875rem;font-weight:600;">${emoji[c.slug]||'📦'} ${c.name}</span>
    </label>`).join('');
}

function showFeedbackModal() { openModal('feedbackModal'); }
async function submitFeedback() {
  const sel = document.querySelector('input[name="fbCat"]:checked');
  if (!sel) return toast('Pilih kategori yang benar', 'warning');
  const notes = document.getElementById('feedbackNotes')?.value || '';
  const res = await api('waste/?action=feedback','POST',{scan_id:currentScanId,correct_category_id:sel.value,notes});
  closeModal('feedbackModal');
  toast(res.message || 'Feedback terkirim. Terima kasih!');
}
function openModal(id)  { const m=document.getElementById(id); if(m){m.classList.add('open'); m.addEventListener('click',e=>{if(e.target===m)closeModal(id)},{once:true});} }
function closeModal(id) { const m=document.getElementById(id); if(m) m.classList.remove('open'); }

// ════════════════════════════════════════════════════════
// IoT MONITOR
// ════════════════════════════════════════════════════════
function switchMonitorTab(tab, btn) {
  ['tabBiodigester','tabPyrolysis','tabEnergy'].forEach(id=>{const e=document.getElementById(id);if(e)e.classList.add('hidden');});
  document.querySelectorAll('#monitorTabs .tab-btn').forEach(b=>b.classList.remove('active'));
  const el=document.getElementById('tab'+tab.charAt(0).toUpperCase()+tab.slice(1));
  if(el) el.classList.remove('hidden');
  if(btn) btn.classList.add('active');
  if (tab==='energy') loadEnergyCharts();
}

async function loadMonitorData() { loadBiodigesterData(); loadPyrolysisData(); }

async function loadBiodigesterData() {
  const res = await api('iot/?action=biodigester&device_id=BD-001');
  if (!res.success && !res.data) return;
  const d = res.data?.data || res.data || {};
  const set = (id,v) => { const e=document.getElementById(id); if(e) e.innerHTML=v; };
  set('bdTemp',     `${d.temperature||'—'} <span class="sensor-unit">°C</span>`);
  set('bdPH',       `${d.ph_level||'—'} <span class="sensor-unit">pH</span>`);
  set('bdPressure', `${d.pressure||'—'} <span class="sensor-unit">bar</span>`);
  set('bdVolume',   `${d.volume||'—'} <span class="sensor-unit">L</span>`);
  const fDay = d.fermentation_day||0, fTot = d.fermentation_total_days||21;
  const pct = Math.round((fDay/fTot)*100);
  const eid = id => document.getElementById(id);
  if(eid('bdFermDay'))  eid('bdFermDay').textContent  = fDay;
  if(eid('bdFermTotal'))eid('bdFermTotal').textContent= fTot;
  if(eid('bdFermPct'))  eid('bdFermPct').textContent  = pct+'%';
  if(eid('bdFermBar'))  eid('bdFermBar').style.width  = pct+'%';
  set('bdBiogas', `${d.biogas_volume||'—'} <span class="sensor-unit">m³</span>`);
  set('bdRate',   `${d.gas_production_rate||'—'} <span class="sensor-unit">m³/h</span>`);
  const statusMsg = {optimal:'Semua parameter optimal. Fermentasi berjalan normal.',needs_attention:'Beberapa parameter di luar rentang. Periksa sensor.',fermenting:'Fermentasi aktif berlangsung.',completed:'Siklus fermentasi selesai. Siap panen.'};
  if(eid('bdRecommendation')) eid('bdRecommendation').textContent = statusMsg[d.process_status]||'Monitoring aktif.';
  renderBiogasChart(d);
}

function renderBiogasChart(d) {
  const ctx = document.getElementById('biogasChart');
  if (!ctx) return;
  if (charts.biogas) charts.biogas.destroy();
  const labels = Array.from({length:24},(_,i)=>`${23-i}j`).reverse();
  const rate = parseFloat(d.gas_production_rate||0.18);
  const data  = labels.map((_,i)=>parseFloat((rate*(0.8+Math.sin(i*0.4)*0.2)).toFixed(3)));
  charts.biogas = new Chart(ctx,{
    type:'line', data:{labels,datasets:[{label:'Biogas (m³/j)',data,borderColor:'#16a34a',backgroundColor:'rgba(22,163,74,0.08)',fill:true,tension:0.4,pointRadius:0,borderWidth:2}]},
    options:{responsive:true,maintainAspectRatio:false,plugins:{legend:{display:false}},scales:{x:{ticks:{font:{size:9},maxTicksLimit:6}},y:{ticks:{font:{size:9}}}}}
  });
}

async function loadPyrolysisData() {
  const res = await api('iot/?action=pyrolysis&device_id=PY-001');
  if (!res.success && !res.data) return;
  const d = res.data?.data || res.data || {};
  const set = (id,v) => { const e=document.getElementById(id); if(e) e.innerHTML=v; };
  const setText = (id,v) => { const e=document.getElementById(id); if(e) e.textContent=v; };
  set('pyReactorTemp',`${d.reactor_temp||'—'} <span class="sensor-unit">°C</span>`);
  set('pyPressure',   `${d.reactor_pressure||'—'} <span class="sensor-unit">bar</span>`);
  set('pyCondenser',  `${d.condenser_temp||'—'} <span class="sensor-unit">°C</span>`);
  set('pyEnergy',     `${d.energy_consumption_kwh||'—'} <span class="sensor-unit">kWh</span>`);
  setText('pyOilOut',  (d.oil_volume_liters||'—')+' L');
  setText('pyGasOut',  (d.gas_volume_m3||'—')+' m³');
  setText('pyResidue', (d.residue_kg||'—')+' kg');
  setText('pyYield',   (d.oil_yield_percent||'—')+'%');
  const yb=document.getElementById('pyYieldBar'); if(yb) yb.style.width=(d.oil_yield_percent||0)+'%';
  setText('pyScore',   (d.performance_score||'—')+'/100');
  const sb=document.getElementById('pyScoreBar'); if(sb) sb.style.width=(d.performance_score||0)+'%';
  const statusColors={running:'badge-purple',completed:'badge-green',idle:'badge-gray',heating:'badge-yellow',cooling:'badge-blue'};
  const pyS=document.getElementById('pyStatus'); if(pyS){pyS.textContent=(d.status||'idle').toUpperCase();pyS.className='badge '+(statusColors[d.status]||'badge-gray');}
  loadPyrolysisBatches();
}

async function loadPyrolysisBatches() {
  const res = await api('iot/?action=pyrolysis-batches');
  if (!res.success) return;
  const batches = res.data?.batches || res.batches || [];
  const el = document.getElementById('pyBatchList');
  if (!el) return;
  el.innerHTML = batches.map(b=>`
    <div style="padding:10px;background:var(--bg);border-radius:var(--r-sm);margin-bottom:8px;border:1px solid var(--border);">
      <div style="display:flex;justify-content:space-between;margin-bottom:5px;">
        <span style="font-size:0.8rem;font-weight:800;">${b.batch_id}</span>
        <span class="badge ${b.status==='completed'?'badge-green':'badge-gray'}">${(b.status||'').toUpperCase()}</span>
      </div>
      <div style="font-size:0.73rem;color:var(--muted);display:flex;gap:12px;flex-wrap:wrap;">
        <span>Input: ${b.input_weight_kg}kg ${b.input_material}</span>
        <span>Oil: ${b.oil_volume_liters}L</span>
        <span>Yield: ${b.oil_yield_percent}%</span>
      </div>
    </div>`).join('');
}

async function loadEnergyCharts() {
  const res = await api('iot/?action=energy&period=weekly');
  if (!res.success) return;
  const d = res.data || res;
  const labels = (d.biogas||[]).map(x=>x.date?.slice(5)||'');
  const mkChart = (id,lbl,data,color,bg) => {
    const ctx=document.getElementById(id); if(!ctx) return;
    if(charts[id]) charts[id].destroy();
    charts[id]=new Chart(ctx,{type:'bar',data:{labels,datasets:[{label:lbl,data,backgroundColor:color,borderRadius:6}]},options:{responsive:true,maintainAspectRatio:false,plugins:{legend:{display:false}},scales:{x:{ticks:{font:{size:9}}},y:{ticks:{font:{size:9}}}}}});
  };
  mkChart('energyBiogasChart','Biogas (m³)',(d.biogas||[]).map(x=>x.value),'#16a34a','rgba(22,163,74,0.1)');
  mkChart('energyOilChart','Oil (L)',(d.pyrolysis_oil||[]).map(x=>x.value),'#8b5cf6','rgba(139,92,246,0.1)');
}

function startIoTPolling() {
  if (iotInterval) clearInterval(iotInterval);
  iotInterval = setInterval(()=>{
    const pg=document.querySelector('.page.active');
    if(pg?.id==='pageMonitor') loadMonitorData();
  }, 30000);
}

// ════════════════════════════════════════════════════════
// MAP
// ════════════════════════════════════════════════════════
const locIcons = {
  facility:{color:'#16a34a',emoji:'🏭'}, collection_point:{color:'#3b82f6',emoji:'📦'},
  recycling:{color:'#06b6d4',emoji:'♻️'}, biodigester:{color:'#22c55e',emoji:'🌿'},
  pyrolysis:{color:'#8b5cf6',emoji:'⚗️'}, user_contribution:{color:'#f59e0b',emoji:'👤'}
};

async function initMap() {
  if (mapInstance) return;
  mapInstance = L.map('ecomap').setView([-7.1986,112.6527],14);
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',{attribution:'© OpenStreetMap'}).addTo(mapInstance);
  const res = await api('analytics/?action=locations');
  if (!res.success) return;
  allLocations = res.data?.locations || res.locations || [];
  renderMapMarkers(allLocations);
  renderLocationList(allLocations);
}

function renderMapMarkers(locs) {
  mapMarkers.forEach(m=>m.remove()); mapMarkers=[];
  locs.forEach(loc=>{
    const info=locIcons[loc.type]||{color:'#6b7280',emoji:'📍'};
    const icon=L.divIcon({html:`<div style="background:${info.color};width:38px;height:38px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:1.1rem;box-shadow:0 3px 10px rgba(0,0,0,0.3);border:2.5px solid white;">${info.emoji}</div>`,className:'',iconSize:[38,38],iconAnchor:[19,19]});
    const m=L.marker([loc.latitude,loc.longitude],{icon}).addTo(mapInstance)
      .bindPopup(`<strong>${loc.name}</strong><br><small>${loc.address||''}</small><br><small>${loc.operating_hours||''}</small>`);
    mapMarkers.push(m);
  });
}

function renderLocationList(locs) {
  const list=document.getElementById('locationList');
  if (!list) return;
  list.innerHTML=locs.map(loc=>{
    const info=locIcons[loc.type]||{color:'#6b7280',emoji:'📍'};
    return `<div class="loc-card" onclick="focusLocation(${loc.latitude},${loc.longitude})">
      <div class="list-icon" style="background:${info.color}22;font-size:1.1rem;">${info.emoji}</div>
      <div class="list-content"><div class="list-title">${loc.name}</div><div class="list-sub">${loc.address||''}</div></div>
    </div>`;
  }).join('');
}

function focusLocation(lat,lng) { mapInstance?.setView([lat,lng],16); }

function filterMap(type,btn) {
  document.querySelectorAll('#mapFilters button').forEach(b=>{b.className='badge badge-gray';b.style.cursor='pointer';b.style.border='none';b.style.padding='5px 12px';});
  btn.className='badge badge-green'; btn.style.padding='5px 12px';
  const filtered=type==='all'?allLocations:allLocations.filter(l=>l.type===type);
  renderMapMarkers(filtered); renderLocationList(filtered);
}

// ════════════════════════════════════════════════════════
// ANALYTICS
// ════════════════════════════════════════════════════════
async function loadAnalytics(period) {
  const res = await api(`analytics/?action=analytics&period=${period}`);
  if (!res.success) return;
  const d = res.data || res;

  const mkLine = (id,key,labels,datasets) => {
    const ctx=document.getElementById(id); if(!ctx) return;
    if(charts[id]) charts[id].destroy();
    charts[id]=new Chart(ctx,{type:'line',data:{labels,datasets},options:{responsive:true,maintainAspectRatio:false,plugins:{legend:{position:'bottom',labels:{font:{size:10},boxWidth:12}}},scales:{x:{ticks:{font:{size:9},maxTicksLimit:7}},y:{ticks:{font:{size:9}}}}}});
  };
  const mkBar = (id,labels,datasets) => {
    const ctx=document.getElementById(id); if(!ctx) return;
    if(charts[id]) charts[id].destroy();
    charts[id]=new Chart(ctx,{type:'bar',data:{labels,datasets},options:{responsive:true,maintainAspectRatio:false,plugins:{legend:{position:'bottom',labels:{font:{size:10},boxWidth:12}}},scales:{x:{ticks:{font:{size:9},maxTicksLimit:7}},y:{ticks:{font:{size:9}}}}}});
  };

  mkLine('analyticsWasteChart','waste',d.labels,[
    {label:'Organik (kg)',data:d.organic,borderColor:'#16a34a',backgroundColor:'rgba(22,163,74,0.08)',fill:true,tension:0.4,pointRadius:2},
    {label:'Non-Organik (kg)',data:d.non_organic,borderColor:'#3b82f6',backgroundColor:'rgba(59,130,246,0.08)',fill:true,tension:0.4,pointRadius:2}
  ]);

  const catCtx=document.getElementById('analyticsCategoryChart');
  if(catCtx){
    if(charts.analyticsCategory) charts.analyticsCategory.destroy();
    charts.analyticsCategory=new Chart(catCtx,{type:'doughnut',data:{labels:d.category_distribution.map(c=>c.label),datasets:[{data:d.category_distribution.map(c=>c.value),backgroundColor:d.category_distribution.map(c=>c.color),borderWidth:0}]},options:{responsive:true,maintainAspectRatio:false,plugins:{legend:{display:false}},cutout:'65%'}});
  }
  const legend=document.getElementById('categoryLegend');
  if(legend) legend.innerHTML=d.category_distribution.map(c=>`
    <div style="display:flex;align-items:center;gap:6px;margin-bottom:6px;">
      <div style="width:10px;height:10px;border-radius:2px;background:${c.color};flex-shrink:0;"></div>
      <span style="font-size:0.73rem;color:var(--slate);flex:1;">${c.label}</span>
      <strong style="font-size:0.73rem;color:var(--navy);">${c.value}%</strong>
    </div>`).join('');

  mkBar('analyticsEnergyChart',d.labels,[
    {label:'Biogas (m³)',data:d.biogas,backgroundColor:'#16a34a',borderRadius:4},
    {label:'Minyak Pirolisis (L)',data:d.pyrolysis_oil,backgroundColor:'#8b5cf6',borderRadius:4}
  ]);

  const t=d.totals||{};
  const summary=document.getElementById('analyticsSummary');
  if(summary) summary.innerHTML=`
    <div class="sensor-card fade-in"><div class="sensor-label">Total Sampah</div><div class="sensor-value">${parseFloat(t.total_waste||0).toFixed(0)} <span class="sensor-unit">kg</span></div></div>
    <div class="sensor-card fade-in"><div class="sensor-label">Total Biogas</div><div class="sensor-value">${parseFloat(t.total_biogas||0).toFixed(1)} <span class="sensor-unit">m³</span></div></div>
    <div class="sensor-card fade-in"><div class="sensor-label">Total Oil</div><div class="sensor-value">${parseFloat(t.total_oil||0).toFixed(1)} <span class="sensor-unit">L</span></div></div>
    <div class="sensor-card fade-in"><div class="sensor-label">Konversi</div><div class="sensor-value">${t.conversion_rate||0} <span class="sensor-unit">%</span></div></div>`;
}

function switchAnalyticsPeriod(period,btn) {
  document.querySelectorAll('#analyticsTabs .tab-btn').forEach(b=>b.classList.remove('active'));
  btn.classList.add('active');
  loadAnalytics(period);
}

// ════════════════════════════════════════════════════════
// HISTORY
// ════════════════════════════════════════════════════════
async function loadHistory() {
  const res = await api('waste/?action=history');
  const list = document.getElementById('historyList');
  if (!list) return;
  const scans = res.data?.scans || res.scans || [];
  if (!scans.length) {
    list.innerHTML=`<div class="empty-state"><div style="font-size:3.5rem;margin-bottom:12px;">🗑️</div><h3>Belum ada riwayat scan</h3><p>Mulai scan sampah untuk membangun riwayat Anda</p></div>`;
    return;
  }
  const emoji={organic:'🌿',plastic:'🧴',paper:'📄',metal:'🔩',glass:'🫙','pyrolysis-plastic':'⚗️',hazardous:'⚠️',residual:'🗑️'};
  list.innerHTML = scans.map(s=>`
    <div class="history-card">
      <div style="display:flex;align-items:flex-start;gap:12px;">
        ${s.image_path
          ? `<img src="${s.image_path}" style="width:56px;height:56px;border-radius:10px;object-fit:cover;flex-shrink:0;">`
          : `<div style="width:56px;height:56px;border-radius:10px;background:var(--mint-light);display:flex;align-items:center;justify-content:center;font-size:1.5rem;flex-shrink:0;">${emoji[s.category_slug]||'📦'}</div>`}
        <div style="flex:1;min-width:0;">
          <div style="display:flex;justify-content:space-between;align-items:flex-start;">
            <div style="font-size:0.9rem;font-weight:800;color:var(--navy);">${s.waste_name||'Tidak diketahui'}</div>
            <span class="badge ${s.confidence_level==='high'?'badge-green':s.confidence_level==='low'?'badge-yellow':'badge-gray'}" style="font-size:0.62rem;flex-shrink:0;">${s.confidence||0}%</span>
          </div>
          <div style="font-size:0.73rem;color:var(--muted);margin-top:3px;">${s.category_name||''} · ${s.material||''}</div>
          <div style="font-size:0.73rem;color:var(--green-mid);margin-top:4px;font-weight:600;">${s.recommendation||''}</div>
          <div style="font-size:0.68rem;color:var(--muted);margin-top:4px;">${timeAgo(s.created_at)}</div>
        </div>
      </div>
    </div>`).join('');
}

// ════════════════════════════════════════════════════════
// REWARDS
// ════════════════════════════════════════════════════════
async function loadRewards() {
  const res = await api('analytics/?action=rewards');
  if (!res.success) return;
  const d = res.data || res;
  const pts = d.user?.eco_points || 0;
  const eid = id => document.getElementById(id);
  const ptsEl = eid('rewardPoints'); if(ptsEl) animateCounter(ptsEl, pts, 900);
  if(eid('rewardLevel')) eid('rewardLevel').textContent = d.user?.level||'Eco Starter';

  const nextLevel = d.levels?.find(l=>l.min>pts);
  if (nextLevel) {
    const prev = d.levels?.find(l=>l.min<=pts && l.max>=pts);
    const pct  = prev ? Math.round(((pts-prev.min)/(prev.max-prev.min))*100) : 0;
    if(eid('rewardNextLevel')) eid('rewardNextLevel').textContent=`${nextLevel.min-pts} pts ke ${nextLevel.name}`;
    if(eid('rewardProgressBar')) setTimeout(()=>{eid('rewardProgressBar').style.width=Math.min(pct,100)+'%';},200);
  }

  const listEl = eid('rewardsList');
  if (listEl) listEl.innerHTML = (d.rewards||[]).map(r=>`
    <div class="card mb-3" style="padding:16px;">
      <div style="display:flex;align-items:center;gap:12px;">
        <div style="width:48px;height:48px;background:var(--gold-subtle);border-radius:12px;display:flex;align-items:center;justify-content:center;font-size:1.4rem;flex-shrink:0;border:1px solid var(--gold-border);">🎁</div>
        <div style="flex:1;">
          <div style="font-size:0.9rem;font-weight:800;color:var(--navy);">${r.name}</div>
          <div style="font-size:0.75rem;color:var(--muted);margin-top:2px;">${r.description||''}</div>
          <div style="font-size:0.82rem;font-weight:800;color:var(--gold-dark);margin-top:4px;">⭐ ${(r.points_required||0).toLocaleString()} pts</div>
        </div>
        <button class="btn ${pts>=r.points_required?'btn-gold':'btn-ghost'} btn-sm"
          onclick="redeemReward(${r.id})"
          ${pts<r.points_required?'disabled':''}>
          ${pts>=r.points_required?'Tukar':'Kurang'}
        </button>
      </div>
    </div>`).join('');

  const hist = d.history||[];
  const histEl = eid('rewardsHistory');
  if (histEl) histEl.innerHTML = hist.length===0
    ? `<div class="empty-state" style="padding:28px;"><div style="font-size:2.5rem;margin-bottom:8px;">🎁</div><p>Belum ada penukaran</p></div>`
    : hist.map(h=>`
      <div class="card mb-2" style="padding:12px 16px;">
        <div style="display:flex;justify-content:space-between;align-items:center;">
          <span style="font-size:0.875rem;font-weight:700;">${h.reward_name}</span>
          <span class="badge badge-green">${h.status}</span>
        </div>
        <div style="font-size:0.73rem;color:var(--muted);margin-top:4px;">${timeAgo(h.created_at)} · -${h.points_spent} pts</div>
      </div>`).join('');
}

async function redeemReward(id) {
  const res = await api('analytics/?action=redeem','POST',{reward_id:id});
  if (!res.success) return toast(res.message||res.error||'Gagal menukar','error');
  toast('Reward ditukar! 🎉');
  loadRewards();
}

// ════════════════════════════════════════════════════════
// IMPACT
// ════════════════════════════════════════════════════════
async function loadImpact() {
  const res = await api('analytics/?action=impact');
  if (!res.success) return;
  const d = res.data || res;
  const anim = (id,v) => { const e=document.getElementById(id); if(e) animateCounter(e,parseFloat(v)||0,1000); };
  const set  = (id,v) => { const e=document.getElementById(id); if(e) e.textContent=v; };
  set('impactTotalWaste',(d.waste_contributed_kg||0)+' kg');
  anim('impactOrganic',    d.organic_waste_kg||0);
  anim('impactNonOrganic', d.non_organic_waste_kg||0);
  anim('impactBiogas',     d.estimated_biogas_m3||0);
  anim('impactOil',        d.estimated_pyrolysis_oil_l||0);
  anim('impactTrees',      d.trees_equivalent||0);
  anim('impactCO2',        d.co2_saved_kg||0);
  anim('impactScans',      d.total_scans||0);
}

// ════════════════════════════════════════════════════════
// NOTIFICATIONS
// ════════════════════════════════════════════════════════
async function loadNotifications() {
  const res = await api('analytics/?action=notifications');
  const list = document.getElementById('notificationsList');
  if (!list) return;
  const notifs = res.data?.notifications || res.notifications || [];
  if (!notifs.length) {
    list.innerHTML=`<div class="empty-state"><div style="font-size:3rem;margin-bottom:12px;">🔔</div><h3>Tidak ada notifikasi</h3></div>`;
    return;
  }
  const icons={sensor_warning:'⚠️',process_warning:'🔧',production_update:'📈',reward:'⭐',system:'ℹ️',critical:'🚨'};
  list.innerHTML=notifs.map(n=>`
    <div class="card mb-2 ${!n.is_read?'notif-unread':''}" style="padding:14px 16px;">
      <div style="display:flex;gap:10px;align-items:flex-start;">
        <span style="font-size:1.3rem;flex-shrink:0;">${icons[n.type]||'ℹ️'}</span>
        <div style="flex:1;">
          <div style="font-size:0.875rem;font-weight:${n.is_read?'600':'800'};color:var(--navy);">${n.title}</div>
          <div style="font-size:0.78rem;color:var(--muted);margin-top:4px;line-height:1.4;">${n.message}</div>
          <div style="font-size:0.68rem;color:var(--muted);margin-top:6px;">${timeAgo(n.created_at)}</div>
        </div>
        ${!n.is_read?'<div style="width:8px;height:8px;background:var(--green-mid);border-radius:50%;flex-shrink:0;margin-top:4px;"></div>':''}
      </div>
    </div>`).join('');
  const badge = document.getElementById('notifBadge');
  const unread = notifs.filter(n=>!n.is_read).length;
  if (badge) badge.classList.toggle('hidden', unread===0);
}

async function markAllRead() {
  await api('analytics/?action=notifications-read','PUT');
  loadNotifications();
  toast('Semua notifikasi ditandai dibaca');
}

// ════════════════════════════════════════════════════════
// PROTOTYPE VIEWER — 3 FOTO INTERAKTIF
// ════════════════════════════════════════════════════════
const PROTO_MACHINES = {
  biodigester: {
    title: 'Smart Biodigester',
    imgBase: 'assets/img/biodigester',
    specs: [
      {k:'Kapasitas',v:'80 Liter'},
      {k:'Suhu Optimal',v:'35–38°C'},
      {k:'pH Optimal',v:'6.5–7.5'},
      {k:'Durasi Fermentasi',v:'21 hari'},
      {k:'Output Biogas',v:'0.15–0.25 m³/hari'},
      {k:'Koneksi IoT',v:'ESP32 + LoRa'},
    ],
    hotspots: [
      {x:14,y:55, icon:'🌿', name:'Hopper Input Sampah Organik', desc:'Menerima sampah organik yang sudah dicacah sebagai bahan baku fermentasi'},
      {x:28,y:62, icon:'⚙️', name:'Sistem Pencacah',              desc:'Mereduksi ukuran partikel sampah untuk mempercepat proses digesti anaerobik'},
      {x:49,y:42, icon:'⚡', name:'Motor Pengaduk',               desc:'Menjaga slurry tetap tercampur untuk optimasi produksi biogas'},
      {x:50,y:55, icon:'🪣', name:'Tangki Biodigester',           desc:'Ruang digesti anaerobik kapasitas 80L tempat fermentasi berlangsung'},
      {x:63,y:32, icon:'📡', name:'Sensor Tekanan',               desc:'Sensor MPX5700 terhubung ESP32 untuk monitoring tekanan gas real-time'},
      {x:75,y:38, icon:'💨', name:'Penampung Biogas',             desc:'Menampung dan menyimpan biogas hasil produksi fermentasi organik'},
      {x:87,y:55, icon:'🔵', name:'Output Biogas',                desc:'Saluran output biogas ke sistem pemanfaatan atau pembakaran'},
      {x:68,y:72, icon:'💧', name:'Penampung Pupuk Cair',         desc:'Menampung digestate cair kaya nutrisi sebagai pupuk organik'},
      {x:84,y:75, icon:'🚰', name:'Output Pupuk Cair',            desc:'Saluran output pupuk cair organik siap digunakan'},
    ],
    components: [
      {icon:'🌿',name:'Hopper Input',     desc:'Penerima sampah organik'},
      {icon:'⚙️',name:'Sistem Pencacah',  desc:'Pencacah partikel sampah'},
      {icon:'⚡',name:'Motor Pengaduk',   desc:'Pengaduk slurry otomatis'},
      {icon:'🪣',name:'Tangki Biodigester',desc:'Ruang fermentasi 80L'},
      {icon:'📡',name:'Sensor Tekanan',   desc:'Monitoring tekanan IoT'},
      {icon:'💨',name:'Penampung Biogas', desc:'Penyimpan biogas hasil'},
      {icon:'💧',name:'Penampung Pupuk',  desc:'Output digestate cair'},
    ],
  },
  recycling: {
    title: 'Smart Recycling System',
    imgBase: 'assets/img/recycling',
    specs: [
      {k:'Kapasitas Input',v:'500 kg/jam'},
      {k:'Kecepatan Belt',v:'0.5 m/detik'},
      {k:'Motor Shredder',v:'7.5 kW'},
      {k:'Kapasitas Tangki Cuci',v:'500 Liter'},
      {k:'Output Material',v:'Plastik daur ulang bersih'},
      {k:'Efisiensi Sortir',v:'≥ 92%'},
    ],
    hotspots: [
      {x:10,y:55, icon:'📥', name:'Hopper Input Sampah Non-Organik', desc:'Penerima sampah non-organik (plastik, logam, kertas) sebelum proses sortir'},
      {x:22,y:60, icon:'🔵', name:'Conveyor Belt',                   desc:'Sabuk berjalan biru memindahkan sampah ke shredder secara kontinu'},
      {x:36,y:40, icon:'🔩', name:'Shredder / Crusher',              desc:'Motor industri 7.5kW memotong sampah menjadi partikel seragam'},
      {x:52,y:55, icon:'💧', name:'Tangki Pencucian',                desc:'Membersihkan material dari kontaminan dengan sistem sirkulasi air'},
      {x:64,y:50, icon:'🔘', name:'Sistem Filtrasi',                 desc:'Menyaring air kotor sebelum resirkulasi atau pembuangan'},
      {x:40,y:78, icon:'🔄', name:'Pompa Air',                      desc:'Sirkulasi air dalam sistem pencucian dan filtrasi'},
      {x:77,y:38, icon:'♻️', name:'Mesin Pengering',                desc:'Mengeringkan material bersih untuk kualitas output optimal'},
      {x:88,y:72, icon:'📦', name:'Output Plastik Daur Ulang',      desc:'Material plastik bersih siap kirim ke fasilitas daur ulang'},
    ],
    components: [
      {icon:'📥',name:'Hopper Input',   desc:'Penerima sampah non-organik'},
      {icon:'🔵',name:'Conveyor Belt',  desc:'Sabuk transport sampah'},
      {icon:'🔩',name:'Shredder',       desc:'Penghancur material'},
      {icon:'💧',name:'Tangki Cuci',   desc:'Pencuci material'},
      {icon:'🔘',name:'Sistem Filtrasi',desc:'Penyaring air'},
      {icon:'♻️',name:'Mesin Pengering',desc:'Pengering output'},
      {icon:'📦',name:'Output Daur Ulang',desc:'Material siap pakai'},
    ],
  },
  iot: {
    title: 'IoT Control Box (ESP32)',
    imgBase: 'assets/img/iot',
    specs: [
      {k:'Mikrokontroler',v:'ESP32 (Dual-core 240MHz)'},
      {k:'Komunikasi',v:'WiFi 2.4GHz + LoRa'},
      {k:'Daya Input',v:'12V DC'},
      {k:'Sensor Suhu',v:'DS18B20 (±0.5°C)'},
      {k:'Sensor pH',v:'pH-4502C (0–14 pH)'},
      {k:'Sensor Tekanan',v:'MPX5700 (0–700kPa)'},
      {k:'Backup Power',v:'Baterai LiPo (opsional)'},
      {k:'Protokol Data',v:'HTTP REST + MQTT'},
    ],
    hotspots: [
      {x:48,y:30, icon:'🧠', name:'ESP32 Microcontroller',  desc:'Otak sistem IoT — dual-core 240MHz dengan WiFi & Bluetooth terintegrasi'},
      {x:65,y:28, icon:'📡', name:'Modul LoRa / WiFi',      desc:'Komunikasi jarak jauh via LoRa dan WiFi untuk transmisi data sensor'},
      {x:35,y:55, icon:'🔌', name:'Relay Module',           desc:'Mengontrol aktuator (pompa, motor, katup) berdasarkan perintah dari server'},
      {x:50,y:72, icon:'⚡', name:'Power Supply 12V',       desc:'Sumber daya sistem — dapat diganti dengan panel surya'},
      {x:65,y:65, icon:'🔋', name:'Baterai Backup',         desc:'Baterai LiPo opsional untuk operasi tanpa listrik PLN (4–8 jam)'},
      {x:78,y:45, icon:'🔗', name:'Terminal Block',         desc:'Penghubung kabel sensor dan aktuator secara modular dan rapi'},
      {x:26,y:35, icon:'🌡️', name:'DC-DC Converter',       desc:'Penstabil tegangan untuk memastikan ESP32 dan sensor mendapat daya optimal'},
      {x:8, y:30, icon:'🌡️', name:'Sensor Suhu DS18B20',   desc:'Mengukur suhu cairan biodigester dengan akurasi ±0.5°C'},
      {x:8, y:48, icon:'🧪', name:'Sensor pH-4502C',        desc:'Mengukur tingkat keasaman (pH 0–14) untuk monitoring fermentasi'},
      {x:8, y:65, icon:'📊', name:'Sensor Tekanan MPX5700', desc:'Mengukur tekanan biogas 0–700kPa secara real-time'},
      {x:10,y:82, icon:'🌊', name:'Flow Sensor',            desc:'Mengukur volume biogas yang diproduksi per satuan waktu'},
    ],
    components: [
      {icon:'🧠',name:'ESP32',         desc:'Mikrokontroler utama IoT'},
      {icon:'📡',name:'LoRa/WiFi',     desc:'Modul komunikasi nirkabel'},
      {icon:'🔌',name:'Relay Module',  desc:'Kontrol aktuator'},
      {icon:'⚡',name:'Power Supply',  desc:'Sumber daya 12V'},
      {icon:'🔋',name:'Baterai Backup',desc:'Cadangan daya'},
      {icon:'🌡️',name:'Sensor Suhu',  desc:'DS18B20 ±0.5°C'},
      {icon:'🧪',name:'Sensor pH',     desc:'pH-4502C 0–14'},
      {icon:'📊',name:'Sensor Tekanan',desc:'MPX5700 0–700kPa'},
    ],
  },
};

// Proto viewer state
let protoScale   = 1.0;
let protoOffsetX = 0;
let protoOffsetY = 0;
let protoDragging= false;
let protoLastX   = 0;
let protoLastY   = 0;
let protoMinScale= 0.7;
let protoMaxScale= 3.5;
let currentProto = 'biodigester';

function initProtoViewer(machine) {
  currentProto = machine || 'biodigester';
  protoScale = 1; protoOffsetX = 0; protoOffsetY = 0;
  renderProtoMachine(currentProto);
}

function switchProtoTab(machine, btn) {
  document.querySelectorAll('.proto-switch-btn').forEach(b=>b.classList.remove('active'));
  if (btn) btn.classList.add('active');
  currentProto = machine;
  protoScale = 1; protoOffsetX = 0; protoOffsetY = 0;
  renderProtoMachine(machine);
}

function renderProtoMachine(machine) {
  const m = PROTO_MACHINES[machine];
  if (!m) return;

  // ── Resolve image path (coba jpg → png → webp) ──────────
  const base = m.imgBase || m.img?.replace(/\.\w+$/, '') || 'assets/img/' + machine;
  const tryExts = ['jpg','png','webp'];
  let resolvedSrc = base + '.jpg'; // default

  // Update image dengan auto-detect ekstensi
  const img = document.getElementById('protoImg');
  let extIdx = 0;

  function tryNextExt() {
    if (extIdx >= tryExts.length) {
      // Semua gagal → tampilkan placeholder animasi
      showProtoPH(machine, m);
      return;
    }
    img.src = base + '.' + tryExts[extIdx];
    extIdx++;
  }

  if (img) {
    img.style.display = 'block';
    img.style.transform = `translate(${protoOffsetX}px,${protoOffsetY}px) scale(${protoScale})`;
    // Reset animasi 3D
    img.style.animation = 'none';
    img.style.filter = 'none';
    // Sembunyikan placeholder jika ada
    const ph = document.getElementById('protoPlaceholder');
    if (ph) ph.style.display = 'none';

    img.onload = () => {
      // Gambar berhasil dimuat — tambahkan animasi float halus
      img.style.animation = 'protoFloat 6s ease-in-out infinite';
    };
    img.onerror = () => {
      tryNextExt();
    };
    tryNextExt(); // mulai coba dari ekstensi pertama
  }

  // ── Update title ──────────────────────────────────────────
  const titleEl = document.getElementById('protoMachineTitle');
  if (titleEl) titleEl.textContent = m.title;

  // ── Render hotspot pins ───────────────────────────────────
  const hContainer = document.getElementById('protoHotspots');
  if (hContainer) {
    hContainer.innerHTML = m.hotspots.map((h, i) => `
      <div class="proto-hotspot" style="left:${h.x}%;top:${h.y}%;"
           onclick="showProtoInfo(${i},'${machine}');event.stopPropagation()">
        <div class="proto-hotspot-ring">
          <div class="proto-hotspot-dot"></div>
        </div>
        <div class="proto-hotspot-tooltip">${h.icon} ${h.name}</div>
      </div>`).join('');
  }

  // ── Render component list ─────────────────────────────────
  const compList = document.getElementById('protoComponentList');
  if (compList) {
    compList.innerHTML = m.components.map((c, i) => `
      <div onclick="showProtoInfo(${i},'${machine}')"
        style="display:flex;align-items:center;gap:12px;padding:13px 16px;border-bottom:1px solid rgba(228,235,228,0.7);cursor:pointer;transition:all 0.2s;"
        onmouseover="this.style.background='var(--mint-light)';this.style.paddingLeft='20px';"
        onmouseout="this.style.background='transparent';this.style.paddingLeft='16px';">
        <div style="width:38px;height:38px;background:linear-gradient(135deg,var(--mint-light),var(--mint));border-radius:10px;display:flex;align-items:center;justify-content:center;font-size:1.1rem;flex-shrink:0;border:1px solid rgba(22,163,74,0.15);">${c.icon}</div>
        <div style="flex:1;">
          <div style="font-size:0.875rem;font-weight:700;color:var(--navy);">${c.name}</div>
          <div style="font-size:0.72rem;color:var(--muted);margin-top:1px;">${c.desc}</div>
        </div>
        <span style="font-size:1rem;color:var(--gold);">›</span>
      </div>`).join('');
  }

  // ── Render spesifikasi teknis ─────────────────────────────
  const specList = document.getElementById('protoSpecList');
  if (specList) {
    specList.innerHTML = m.specs.map(s => `
      <div style="display:flex;justify-content:space-between;align-items:center;padding:8px 12px;background:rgba(255,255,255,0.7);border-radius:var(--r-xs);border:1px solid rgba(212,160,23,0.2);">
        <span style="font-size:0.78rem;color:var(--slate);">${s.k}</span>
        <strong style="font-size:0.78rem;color:var(--navy);text-align:right;">${s.v}</strong>
      </div>`).join('');
  }

  // ── Sembunyikan info panel ────────────────────────────────
  const panel = document.getElementById('protoInfoPanel');
  if (panel) panel.classList.remove('visible');

  updateProtoTransform();
  updateScaleBadge();
}

// Tampilkan placeholder animasi saat foto belum ada
function showProtoPH(machine, m) {
  const img = document.getElementById('protoImg');
  const vp  = document.getElementById('protoViewport');
  if (!vp) return;
  if (img) img.style.display = 'none';

  let ph = document.getElementById('protoPlaceholder');
  if (!ph) {
    ph = document.createElement('div');
    ph.id = 'protoPlaceholder';
    ph.style.cssText = `
      position:absolute;inset:0;
      display:flex;flex-direction:column;
      align-items:center;justify-content:center;
      gap:14px;background:linear-gradient(145deg,#f0f7f0,#e4f0e4);
      z-index:5;`;
    vp.appendChild(ph);
  }

  const machineEmojis = {
    biodigester: {
      big: '&#127807;',
      icons: ['&#9889;', '&#128168;', '&#128167;', '&#127807;'],
      color: '#16a34a',
      name: 'Smart Biodigester',
      file: 'biodigester.jpg',
      desc: 'Tangki fermentasi anaerobik untuk sampah organik menghasilkan biogas'
    },
    recycling: {
      big: '&#9851;&#65039;',
      icons: ['&#128230;', '&#128167;', '&#128260;', '&#128230;'],
      color: '#3b82f6',
      name: 'Smart Recycling System',
      file: 'recycling.jpg',
      desc: 'Sistem pemilahan dan daur ulang sampah non-organik otomatis'
    },
    iot: {
      big: '&#128225;',
      icons: ['&#129302;', '&#128268;', '&#9889;', '&#128267;'],
      color: '#8b5cf6',
      name: 'IoT Control Box (ESP32)',
      file: 'iot.jpg',
      desc: 'Modul kontrol IoT dengan ESP32, sensor suhu, pH, tekanan, dan LoRa/WiFi'
    },
  };
  const info = machineEmojis[machine] || { big:'🏭', icons:['⚙️','🔧','⚡','🌿'], color:'#16a34a', name:m.title, file:machine+'.jpg' };

  ph.innerHTML = `
    <div style="font-size:3.2rem;animation:orbFloat 3s ease-in-out infinite;filter:drop-shadow(0 4px 16px ${info.color}66);">${info.big}</div>
    <div style="font-weight:900;color:${info.color};font-size:0.95rem;text-align:center;padding:0 12px;">${info.name}</div>
    <div style="font-size:0.72rem;color:var(--slate);text-align:center;padding:0 20px;max-width:260px;line-height:1.5;">${info.desc || ''}</div>
    <div style="display:flex;gap:10px;margin:2px 0;">
      ${info.icons.map((ic,i)=>`<span style="font-size:1.6rem;animation:orbFloat ${2.5+i*0.4}s ease-in-out infinite;animation-delay:${i*0.2}s;">${ic}</span>`).join('')}
    </div>
    <div style="background:white;border:2px solid ${info.color}44;border-radius:var(--r-sm);padding:10px 16px;max-width:270px;text-align:center;box-shadow:0 2px 12px ${info.color}22;">
      <div style="font-size:0.68rem;font-weight:900;color:${info.color};text-transform:uppercase;letter-spacing:0.06em;margin-bottom:5px;">&#128247; Foto Belum Ada</div>
      <div style="font-size:0.71rem;color:var(--muted);line-height:1.6;">
        Simpan foto sebagai <strong style="color:var(--navy);font-family:monospace;">${info.file}</strong><br>
        ke folder <code style="background:var(--bg);padding:2px 6px;border-radius:4px;font-size:0.68rem;">assets/img/</code><br>
        atau klik &rarr; <a href="/sampah/upload_proto.php" target="_blank" style="color:${info.color};font-weight:800;">Upload Foto</a>
      </div>
    </div>`;
  ph.style.display = 'flex';
}

function showProtoInfo(idx, machine) {
  const m = PROTO_MACHINES[machine || currentProto];
  if (!m) return;
  const h = m.hotspots[idx];
  if (!h) return;
  const panel = document.getElementById('protoInfoPanel');
  const icon  = document.getElementById('protoInfoIcon');
  const name  = document.getElementById('protoInfoName');
  const desc  = document.getElementById('protoInfoDesc');
  if (panel) {
    if (icon)  icon.textContent = h.icon;
    if (name)  name.textContent = h.name;
    if (desc)  desc.textContent = h.desc;
    panel.classList.add('visible');
  }
}

function updateProtoTransform() {
  const img = document.getElementById('protoImg');
  if (img && !proto3DActive) {
    img.style.transform = `translate(${protoOffsetX}px,${protoOffsetY}px) scale(${protoScale})`;
  }
}

function updateScaleBadge() {
  const badge = document.getElementById('protoScaleBadge');
  if (badge) badge.textContent = Math.round(protoScale * 100) + '%';
}

function getProtoPoint(e) {
  if (e.touches && e.touches.length > 0) return { x: e.touches[0].clientX, y: e.touches[0].clientY };
  return { x: e.clientX, y: e.clientY };
}

function protoPointerDown(e) {
  if (e.touches && e.touches.length === 2) return; // handled by pinch
  protoDragging = true;
  const pt = getProtoPoint(e);
  protoLastX = pt.x; protoLastY = pt.y;
  const vp = document.getElementById('protoViewport');
  if (vp) vp.classList.add('grabbing');
  e.preventDefault();
}

function protoPointerMove(e) {
  if (e.touches && e.touches.length === 2) { protoPinchMove(e); return; }
  if (!protoDragging) return;
  const pt = getProtoPoint(e);
  protoOffsetX += pt.x - protoLastX;
  protoOffsetY += pt.y - protoLastY;
  protoLastX = pt.x; protoLastY = pt.y;
  updateProtoTransform();
  e.preventDefault();
}

function protoPointerUp() {
  protoDragging = false;
  const vp = document.getElementById('protoViewport');
  if (vp) vp.classList.remove('grabbing');
}

let protoPinchDist0 = 0;
let protoScale0     = 1;

function protoPinchMove(e) {
  if (e.touches.length < 2) return;
  const dx = e.touches[0].clientX - e.touches[1].clientX;
  const dy = e.touches[0].clientY - e.touches[1].clientY;
  const dist = Math.sqrt(dx*dx + dy*dy);
  if (protoPinchDist0 === 0) { protoPinchDist0 = dist; protoScale0 = protoScale; return; }
  protoScale = Math.min(protoMaxScale, Math.max(protoMinScale, protoScale0 * (dist / protoPinchDist0)));
  updateProtoTransform();
  updateScaleBadge();
  e.preventDefault();
}

function protoWheel(e) {
  e.preventDefault();
  const delta = e.deltaY > 0 ? 0.88 : 1.14;
  protoScale  = Math.min(protoMaxScale, Math.max(protoMinScale, protoScale * delta));
  updateProtoTransform();
  updateScaleBadge();
}

function protoZoomIn()  { protoScale = Math.min(protoMaxScale, protoScale * 1.25); updateProtoTransform(); updateScaleBadge(); }
function protoZoomOut() { protoScale = Math.max(protoMinScale, protoScale * 0.8);  updateProtoTransform(); updateScaleBadge(); }
function protoReset()   {
  protoScale = 1; protoOffsetX = 0; protoOffsetY = 0;
  // Stop 3D rotate jika aktif
  const img = document.getElementById('protoImg');
  if (img) img.classList.remove('rotating');
  const btn = document.getElementById('proto3dBtn');
  if (btn) btn.classList.remove('active');
  proto3DActive = false;
  updateProtoTransform(); updateScaleBadge();
  const p = document.getElementById('protoInfoPanel');
  if (p) p.classList.remove('visible');
}

// Toggle auto-rotate 3D
let proto3DActive = false;
function toggleProto3D() {
  proto3DActive = !proto3DActive;
  const img = document.getElementById('protoImg');
  const btn = document.getElementById('proto3dBtn');
  if (img) {
    if (proto3DActive) {
      img.classList.add('rotating');
      // Reset posisi saat rotate agar terlihat bagus
      protoOffsetX = 0; protoOffsetY = 0; protoScale = 1;
      updateProtoTransform();
    } else {
      img.classList.remove('rotating');
      // Kembalikan float animation
      img.style.animation = 'protoFloat 6s ease-in-out infinite';
    }
  }
  if (btn) btn.classList.toggle('active', proto3DActive);
  toast(proto3DActive ? '3D Rotate aktif 🔄' : 'Mode normal');
}

// Legacy 3D viewer stubs (unused but prevent JS errors)
function init3DViewer()      {}
function switch3DModel(t,b)  { switchProtoTab(t==='biodigester'?'biodigester':t==='pyrolysis'?'recycling':'iot', b); }
function resetCamera()       { protoReset(); }
function toggleAutoRotate()  { toast('Mode foto interaktif aktif 📷'); }

// ════════════════════════════════════════════════════════
// BOOT
// ════════════════════════════════════════════════════════
document.addEventListener('DOMContentLoaded', async () => {
  if (token) {
    const res = await api('auth/?action=me');
    if (res.success || res.user) {
      currentUser = res.data?.user || res.user;
      initApp();
    } else {
      localStorage.removeItem('ec_token');
      token = null;
    }
  }

  // Enter key on login
  document.getElementById('loginPassword')?.addEventListener('keydown', e => { if(e.key==='Enter') doLogin(); });
  document.getElementById('loginEmail')?.addEventListener('keydown', e => { if(e.key==='Enter') doLogin(); });

  // Touch end reset for pinch
  document.addEventListener('touchend', () => { protoPinchDist0 = 0; });
});

