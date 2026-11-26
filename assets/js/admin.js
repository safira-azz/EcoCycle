// ═══════════════════════════════════════════
// ECOCYCLE ADMIN PANEL - JavaScript
// ═══════════════════════════════════════════

const ADMIN_API = '../api';
let adminToken = localStorage.getItem('ec_admin_token');
let adminUser  = null;
let adminCharts = {};
let adminPollingInterval = null;

// ── TOAST ──────────────────────────────────────────────────
function adminToast(msg, type = 'success') {
  const c = document.getElementById('adminToastContainer');
  const t = document.createElement('div');
  t.className = `toast ${type}`;
  t.innerHTML = `<span>${type === 'success' ? '✓' : type === 'error' ? '✕' : '⚠'}</span><span>${msg}</span>`;
  c.appendChild(t);
  setTimeout(() => t.remove(), 3500);
}

// ── API HELPER ─────────────────────────────────────────────
async function adminApi(endpoint, method = 'GET', body = null, isForm = false) {
  const opts = { method, headers: { 'Authorization': `Bearer ${adminToken}` } };
  if (body && !isForm) {
    opts.headers['Content-Type'] = 'application/json';
    opts.body = JSON.stringify(body);
  } else if (body && isForm) {
    opts.body = body;
  }
  try {
    const res = await fetch(`${ADMIN_API}/${endpoint}`, opts);
    const data = await res.json();
    if (!data.success && data.message === 'Unauthorized') { adminLogout(); return { error: 'Unauthorized' }; }
    return data;
  } catch (e) {
    return { error: 'Network error: ' + e.message };
  }
}

// ── AUTH ───────────────────────────────────────────────────
function toggleAdminPwd() {
  const inp = document.getElementById('adminPassword');
  if (!inp) return;
  inp.type = inp.type === 'password' ? 'text' : 'password';
}

async function adminLogin() {
  const email    = document.getElementById('adminEmail').value.trim();
  const password = document.getElementById('adminPassword').value;
  if (!email || !password) return adminToast('Please fill all fields', 'error');

  const res = await fetch(`${ADMIN_API}/auth/?action=login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password })
  }).then(r => r.json()).catch(() => ({ error: 'Network error' }));

  if (!res.success) return adminToast(res.message || 'Login failed', 'error');
  if (res.user?.role !== 'admin') return adminToast('Admin access required', 'error');

  adminToken = res.token || res.data?.token;
  // Some API versions nest token inside data
  if (!adminToken && res.data) adminToken = res.data.token;
  localStorage.setItem('ec_admin_token', adminToken);
  adminUser = res.user || res.data?.user;
  showAdminApp();
}

function adminLogout() {
  localStorage.removeItem('ec_admin_token');
  adminToken = null; adminUser = null;
  if (adminPollingInterval) clearInterval(adminPollingInterval);
  document.getElementById('adminApp').classList.add('hidden');
  document.getElementById('adminAuthWrap').classList.remove('hidden');
  // Destroy all charts
  Object.values(adminCharts).forEach(c => { try { c.destroy(); } catch(e){} });
  adminCharts = {};
}

function showAdminApp() {
  document.getElementById('adminAuthWrap').classList.add('hidden');
  document.getElementById('adminApp').classList.remove('hidden');
  if (adminUser) document.getElementById('adminUserName').textContent = adminUser.name || 'Admin';
  showAdminPage('dashboard', document.querySelector('.sidebar-item'));
  startAdminPolling();
}

// ── NAVIGATION ─────────────────────────────────────────────
const adminPageTitles = {
  dashboard:   'Dashboard',
  users:       'User Management',
  scans:       'Waste Scan Records',
  iot:         'IoT Devices',
  biodigester: 'Biodigester Monitor',
  pyrolysis:   'Pyrolysis Monitor',
  analytics:   'Analytics',
  ai:          'AI Monitoring',
  rewards:     'Reward Management',
};

function showAdminPage(page, el) {
  document.querySelectorAll('.admin-page').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.sidebar-item').forEach(i => i.classList.remove('active'));
  const pageEl = document.getElementById('admin' + page.charAt(0).toUpperCase() + page.slice(1));
  if (pageEl) pageEl.classList.add('active');
  if (el) el.classList.add('active');
  document.getElementById('adminPageTitle').textContent = adminPageTitles[page] || page;
  closeSidebar();

  // Lazy load
  switch(page) {
    case 'dashboard':   loadAdminDashboard(); break;
    case 'users':       loadAdminUsers();     break;
    case 'scans':       loadAdminScans();     break;
    case 'iot':         loadAdminIot();       break;
    case 'biodigester': loadAdminBiodigester(); break;
    case 'pyrolysis':   loadAdminPyrolysis(); break;
    case 'analytics':   loadAdminAnalytics('weekly'); break;
    case 'ai':          loadAdminAi();        break;
    case 'rewards':     loadAdminRewards();   break;
  }
}

// ── SIDEBAR (mobile) ───────────────────────────────────────
function openSidebar() {
  document.getElementById('adminSidebar').style.transform = 'translateX(0)';
  document.getElementById('sidebarOverlay').classList.add('show');
}
function closeSidebar() {
  const sb = document.getElementById('adminSidebar');
  if (window.innerWidth < 768) sb.style.transform = 'translateX(-100%)';
  document.getElementById('sidebarOverlay').classList.remove('show');
}

// ── HELPERS ────────────────────────────────────────────────
function fmtDate(ts) {
  if (!ts) return '—';
  const d = new Date(ts);
  return d.toLocaleDateString('id-ID', { day:'2-digit', month:'short', year:'numeric' }) +
    ' ' + d.toLocaleTimeString('id-ID', { hour:'2-digit', minute:'2-digit' });
}
function timeAgo(ts) {
  if (!ts) return '—';
  const diff = Math.floor((Date.now() - new Date(ts)) / 1000);
  if (diff < 60)    return 'just now';
  if (diff < 3600)  return Math.floor(diff/60) + 'm ago';
  if (diff < 86400) return Math.floor(diff/3600) + 'h ago';
  return Math.floor(diff/86400) + 'd ago';
}
function statusBadge(status) {
  const map = {
    active:    'badge-green',  online:    'badge-green',  completed: 'badge-green',
    inactive:  'badge-gray',   offline:   'badge-gray',   idle:      'badge-gray',
    suspended: 'badge-red',    failed:    'badge-red',    critical:  'badge-red',
    warning:   'badge-yellow', heating:   'badge-yellow', running:   'badge-purple',
    pending:   'badge-yellow', approved:  'badge-green',  rejected:  'badge-red',
  };
  return `<span class="badge ${map[status] || 'badge-gray'}">${(status||'').toUpperCase()}</span>`;
}

// ── POLLING ────────────────────────────────────────────────
function startAdminPolling() {
  if (adminPollingInterval) clearInterval(adminPollingInterval);
  adminPollingInterval = setInterval(() => {
    const active = document.querySelector('.admin-page.active');
    if (!active) return;
    const id = active.id.replace('admin', '').toLowerCase();
    if (id === 'iot') loadAdminIot(true);
    if (id === 'biodigester') loadAdminBiodigester(true);
  }, 30000);
}

// ── DASHBOARD ──────────────────────────────────────────────
async function loadAdminDashboard() {
  const res = await adminApi('admin/?action=dashboard');
  if (res.error) return adminToast('Failed to load dashboard', 'error');

  const k = res.data?.kpis || res.kpis || {};
  document.getElementById('kpiUsers').textContent   = (k.total_users  || 0).toLocaleString();
  document.getElementById('kpiWaste').textContent   = parseFloat(k.total_waste_kg || 0).toLocaleString();
  document.getElementById('kpiScans').textContent   = (k.total_scans  || 0).toLocaleString();

  // Also update other static KPI cards dynamically if present
  const kpiAlerts = document.getElementById('kpiAlerts');
  if (kpiAlerts) kpiAlerts.textContent = k.alerts || 0;

  // Waste chart
  const wc = res.data?.waste_chart || res.waste_chart || {};
  renderAdminChart('adminWasteChart', 'bar', wc.labels || [], [{
    label: 'Scans/day', data: wc.data || [],
    backgroundColor: '#16a34a', borderRadius: 6,
  }], { x: { ticks: { font: { size: 10 } } }, y: { ticks: { font: { size: 10 } } } });

  // Category chart
  const cats = res.data?.category_dist || res.category_dist || [];
  renderAdminChart('adminCatChart', 'doughnut', cats.map(c => c.label), [{
    data: cats.map(c => c.value),
    backgroundColor: cats.map(c => c.color),
    borderWidth: 0,
  }], null, { cutout: '60%' });

  // Device table
  const devices = res.data?.devices || res.devices || [];
  const tbl = document.getElementById('adminDeviceTable');
  if (tbl) {
    tbl.innerHTML = `
      <thead><tr>
        <th>Device ID</th><th>Name</th><th>Type</th><th>Status</th><th>Last Seen</th><th>Firmware</th>
      </tr></thead>
      <tbody>${devices.map(d => `
        <tr>
          <td><code>${d.device_id}</code></td>
          <td>${d.name || '—'}</td>
          <td>${d.type || '—'}</td>
          <td>${statusBadge(d.status)}</td>
          <td>${timeAgo(d.last_seen)}</td>
          <td>${d.firmware_version || '—'}</td>
        </tr>`).join('')}
      </tbody>`;
  }
}

// ── USERS ──────────────────────────────────────────────────
let allUsersData = [];

async function loadAdminUsers() {
  const res = await adminApi('admin/?action=users');
  if (res.error) return adminToast('Failed to load users', 'error');
  allUsersData = res.data?.users || res.users || [];
  renderUsersTable(allUsersData);
}

function renderUsersTable(users) {
  const tbl = document.getElementById('usersTable');
  if (!tbl) return;
  if (users.length === 0) {
    tbl.innerHTML = '<tr><td colspan="8" style="text-align:center;color:var(--muted);padding:24px;">No users found</td></tr>';
    return;
  }
  tbl.innerHTML = `
    <thead><tr>
      <th>#</th><th>Name</th><th>Email</th><th>Role</th><th>Level</th>
      <th>Points</th><th>Scans</th><th>Status</th><th>Action</th>
    </tr></thead>
    <tbody>${users.map(u => `
      <tr>
        <td>${u.id}</td>
        <td><strong>${u.name || '—'}</strong></td>
        <td>${u.email}</td>
        <td><span class="badge badge-gray">${u.role || 'user'}</span></td>
        <td>${u.level || 'Eco Starter'}</td>
        <td>${(u.eco_points || 0).toLocaleString()}</td>
        <td>${u.total_scans || 0}</td>
        <td>${statusBadge(u.status)}</td>
        <td>
          <select class="form-input" style="padding:4px 8px;font-size:0.75rem;width:110px;"
            onchange="updateUserStatus(${u.id}, this.value)">
            <option value="active"    ${u.status==='active'    ? 'selected':''}>Active</option>
            <option value="inactive"  ${u.status==='inactive'  ? 'selected':''}>Inactive</option>
            <option value="suspended" ${u.status==='suspended' ? 'selected':''}>Suspended</option>
          </select>
        </td>
      </tr>`).join('')}
    </tbody>`;
}

function filterUsers(q) {
  const filtered = allUsersData.filter(u =>
    u.name?.toLowerCase().includes(q.toLowerCase()) ||
    u.email?.toLowerCase().includes(q.toLowerCase())
  );
  renderUsersTable(filtered);
}

async function updateUserStatus(userId, status) {
  const res = await adminApi('admin/?action=user-status', 'PUT', { user_id: userId, status });
  if (res.error) return adminToast(res.message || 'Failed to update', 'error');
  adminToast('User status updated');
}

// ── SCANS ──────────────────────────────────────────────────
async function loadAdminScans() {
  const res = await adminApi('admin/?action=scans');
  if (res.error) return adminToast('Failed to load scans', 'error');
  const scans = res.data?.scans || res.scans || [];
  const total = res.data?.total || res.total || 0;
  const tbl = document.getElementById('scansTable');
  if (!tbl) return;
  if (scans.length === 0) {
    tbl.innerHTML = '<tr><td colspan="8" style="text-align:center;padding:24px;color:var(--muted);">No scan records yet</td></tr>';
    return;
  }
  tbl.innerHTML = `
    <thead><tr>
      <th>Scan ID</th><th>User</th><th>Waste Name</th><th>Category</th>
      <th>Confidence</th><th>Route</th><th>Status</th><th>Date</th>
    </tr></thead>
    <tbody>${scans.map(s => `
      <tr>
        <td><code style="font-size:0.7rem;">${s.scan_id}</code></td>
        <td>${s.user_name || '—'}</td>
        <td>${s.waste_name || '—'}</td>
        <td><span class="badge ${s.category_type==='organic'?'badge-green':s.category_type==='hazardous'?'badge-red':'badge-blue'}">${s.category_name || '—'}</span></td>
        <td>${s.confidence || 0}% <span class="badge ${s.confidence_level==='high'?'badge-green':s.confidence_level==='low'?'badge-yellow':'badge-gray'}" style="font-size:0.6rem;">${s.confidence_level||'?'}</span></td>
        <td><span class="badge badge-gray">${(s.processing_route||'').replace(/_/g,' ')}</span></td>
        <td>${statusBadge(s.status)}</td>
        <td style="font-size:0.75rem;">${timeAgo(s.created_at)}</td>
      </tr>`).join('')}
    </tbody>`;
  // Show total count
  const header = tbl.closest('.card')?.querySelector('h4');
  if (header) header.textContent = `Waste Scan Records (${total.toLocaleString()} total)`;
}

// ── IoT DEVICES ────────────────────────────────────────────
async function loadAdminIot(silent = false) {
  const res = await adminApi('admin/?action=iot-devices');
  if (res.error) { if (!silent) adminToast('Failed to load IoT devices', 'error'); return; }
  const devices = res.data?.devices || res.devices || [];
  const tbl = document.getElementById('iotTable');
  if (!tbl) return;
  tbl.innerHTML = `
    <thead><tr>
      <th>Device ID</th><th>Name</th><th>Type</th><th>Location</th>
      <th>Status</th><th>Last Seen</th><th>IP</th><th>Active</th>
    </tr></thead>
    <tbody>${devices.map(d => `
      <tr>
        <td><code>${d.device_id}</code></td>
        <td>${d.name || '—'}</td>
        <td>${d.type || '—'}</td>
        <td>${d.location || '—'}</td>
        <td>${statusBadge(d.status)}</td>
        <td style="font-size:0.75rem;">${timeAgo(d.last_seen)}</td>
        <td>${d.ip_address || '—'}</td>
        <td>
          <label style="display:flex;align-items:center;gap:6px;cursor:pointer;">
            <input type="checkbox" ${d.is_active ? 'checked' : ''}
              onchange="toggleIotDevice('${d.device_id}', this.checked)"
              style="accent-color:var(--green);width:16px;height:16px;">
            <span style="font-size:0.75rem;">${d.is_active ? 'On' : 'Off'}</span>
          </label>
        </td>
      </tr>`).join('')}
    </tbody>`;

  // Live sensor grid
  renderLiveSensors(devices);
}

function renderLiveSensors(devices) {
  const grid = document.getElementById('liveSensorGrid');
  if (!grid) return;
  grid.innerHTML = devices.map(d => `
    <div class="sensor-card" style="background:var(--bg);border-radius:var(--radius-sm);padding:12px;">
      <div style="font-size:0.7rem;font-weight:700;text-transform:uppercase;color:var(--muted);margin-bottom:8px;">${d.name || d.device_id}</div>
      <div style="display:flex;align-items:center;gap:6px;margin-bottom:6px;">
        <span class="status-dot ${d.status === 'online' ? 'online' : 'offline'}"></span>
        <span style="font-size:0.75rem;font-weight:600;">${d.status || 'unknown'}</span>
      </div>
      <div style="font-size:0.7rem;color:var(--muted);">Last seen: ${timeAgo(d.last_seen)}</div>
      <div style="font-size:0.7rem;color:var(--muted);">Type: ${d.type}</div>
    </div>`).join('');
}

async function toggleIotDevice(deviceId, isActive) {
  const res = await adminApi('admin/?action=iot-device-status', 'PUT', { device_id: deviceId, is_active: isActive ? 1 : 0 });
  if (res.error) return adminToast('Failed to update device', 'error');
  adminToast(`Device ${isActive ? 'activated' : 'deactivated'}`);
}

function showAddDeviceForm() {
  const existing = document.getElementById('addDeviceForm');
  if (existing) { existing.remove(); return; }
  const card = document.createElement('div');
  card.id = 'addDeviceForm';
  card.className = 'card mt-4';
  card.innerHTML = `
    <h4 style="margin-bottom:16px;">Add New IoT Device</h4>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;">
      <div class="form-group"><label class="form-label">Device ID</label><input type="text" class="form-input" id="newDeviceId" placeholder="e.g. BD-002"></div>
      <div class="form-group"><label class="form-label">Device Key (secret)</label><input type="text" class="form-input" id="newDeviceKey" placeholder="Leave blank to auto-generate"></div>
      <div class="form-group"><label class="form-label">Name</label><input type="text" class="form-input" id="newDeviceName" placeholder="e.g. Biodigester Unit 2"></div>
      <div class="form-group"><label class="form-label">Type</label>
        <select class="form-input" id="newDeviceType">
          <option value="biodigester">Biodigester</option>
          <option value="pyrolysis">Pyrolysis</option>
          <option value="sorting">Sorting Belt</option>
          <option value="general">General</option>
        </select>
      </div>
      <div class="form-group" style="grid-column:1/-1;"><label class="form-label">Location</label><input type="text" class="form-input" id="newDeviceLocation" placeholder="e.g. Gresik Jawa Timur"></div>
    </div>
    <div style="display:flex;gap:10px;margin-top:12px;">
      <button class="btn btn-primary" onclick="submitAddDevice()">Add Device</button>
      <button class="btn btn-ghost" onclick="document.getElementById('addDeviceForm').remove()">Cancel</button>
    </div>`;
  document.getElementById('adminIot').appendChild(card);
}

async function submitAddDevice() {
  const payload = {
    device_id: document.getElementById('newDeviceId').value.trim(),
    device_key: document.getElementById('newDeviceKey').value.trim() || undefined,
    name:      document.getElementById('newDeviceName').value.trim(),
    type:      document.getElementById('newDeviceType').value,
    location:  document.getElementById('newDeviceLocation').value.trim(),
  };
  if (!payload.device_id || !payload.name) return adminToast('Device ID and Name required', 'error');
  const res = await adminApi('admin/?action=iot-device', 'POST', payload);
  if (res.error || !res.success) return adminToast(res.message || 'Failed to add device', 'error');
  const rawKey = res.data?.raw_key_shown_once;
  if (rawKey) adminToast(`Device added! Raw key (save now): ${rawKey}`, 'success');
  else adminToast('Device added!');
  document.getElementById('addDeviceForm')?.remove();
  loadAdminIot();
}

// ── BIODIGESTER ────────────────────────────────────────────
async function loadAdminBiodigester(silent = false) {
  // Use public IoT endpoint (admin viewing)
  const res = await adminApi('iot/?action=biodigester&device_id=BD-001');
  if (res.error) { if (!silent) adminToast('Failed to load biodigester data', 'error'); return; }
  const d = res.data?.data || res.data || {};
  const statusEl = document.getElementById('adminBdStatus');
  if (!statusEl) return;

  const pct = d.fermentation_day && d.fermentation_total_days
    ? Math.round((d.fermentation_day / d.fermentation_total_days) * 100) : 0;

  statusEl.innerHTML = `
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:16px;">
      <div class="sensor-card"><div class="sensor-label">Temperature</div><div class="sensor-value">${d.temperature || '—'} <span class="sensor-unit">°C</span></div></div>
      <div class="sensor-card"><div class="sensor-label">pH Level</div><div class="sensor-value">${d.ph_level || '—'} <span class="sensor-unit">pH</span></div></div>
      <div class="sensor-card"><div class="sensor-label">Pressure</div><div class="sensor-value">${d.pressure || '—'} <span class="sensor-unit">bar</span></div></div>
      <div class="sensor-card"><div class="sensor-label">Biogas Volume</div><div class="sensor-value">${d.biogas_volume || '—'} <span class="sensor-unit">m³</span></div></div>
    </div>
    <div style="margin-bottom:8px;display:flex;justify-content:space-between;">
      <span style="font-size:0.8rem;color:var(--muted);">Fermentation: Day ${d.fermentation_day || 0} / ${d.fermentation_total_days || 21}</span>
      <span style="font-size:0.8rem;font-weight:700;color:var(--green);">${pct}%</span>
    </div>
    <div class="progress-bar"><div class="progress-fill green" style="width:${pct}%"></div></div>
    <div style="margin-top:12px;padding:10px;background:var(--green-50);border-radius:8px;font-size:0.8rem;color:var(--green-dark);">
      Status: <strong>${d.process_status || 'monitoring'}</strong>
    </div>`;

  // Biogas chart
  const labels = Array.from({length: 24}, (_, i) => `${23-i}h`).reverse();
  const rate = parseFloat(d.gas_production_rate || 0.18);
  const data = labels.map((_, i) => parseFloat((rate * (0.8 + Math.sin(i * 0.4) * 0.2)).toFixed(3)));
  renderAdminChart('adminBiogasChart', 'line', labels, [{
    label: 'Biogas (m³/h)', data,
    borderColor: '#16a34a', backgroundColor: 'rgba(22,163,74,0.1)',
    fill: true, tension: 0.4, pointRadius: 0,
  }], { x: { ticks: { font:{ size:9 }, maxTicksLimit:6 } }, y: { ticks: { font:{ size:9 } } } });
}

// ── PYROLYSIS ──────────────────────────────────────────────
async function loadAdminPyrolysis() {
  const res = await adminApi('admin/?action=pyrolysis');
  if (res.error) return adminToast('Failed to load pyrolysis data', 'error');
  const batches = res.data?.batches || res.batches || [];
  const tbl = document.getElementById('pyrolysisTable');
  if (!tbl) return;
  if (batches.length === 0) {
    tbl.innerHTML = '<tr><td colspan="8" style="text-align:center;padding:24px;color:var(--muted);">No batch records yet</td></tr>';
    return;
  }
  tbl.innerHTML = `
    <thead><tr>
      <th>Batch ID</th><th>Input (kg)</th><th>Material</th><th>Oil (L)</th>
      <th>Gas (m³)</th><th>Yield %</th><th>Score</th><th>Status</th><th>Completed</th>
    </tr></thead>
    <tbody>${batches.map(b => `
      <tr>
        <td><code>${b.batch_id}</code></td>
        <td>${b.input_weight_kg || '—'}</td>
        <td>${b.input_material || '—'}</td>
        <td>${b.oil_volume_liters || '—'}</td>
        <td>${b.gas_volume_m3 || '—'}</td>
        <td>${b.oil_yield_percent || '—'}%</td>
        <td>${b.performance_score || '—'}</td>
        <td>${statusBadge(b.status)}</td>
        <td style="font-size:0.75rem;">${b.completed_at ? fmtDate(b.completed_at) : '—'}</td>
      </tr>`).join('')}
    </tbody>`;
}

// ── ANALYTICS ──────────────────────────────────────────────
async function loadAdminAnalytics(period = 'weekly') {
  const res = await adminApi(`admin/?action=analytics&period=${period}`);
  if (res.error) return adminToast('Failed to load analytics', 'error');
  const d = res.data || res;

  renderAdminChart('adminAnalyticsWaste', 'bar', d.labels || [], [{
    label: 'Daily Scans', data: d.waste || [],
    backgroundColor: '#16a34a', borderRadius: 4,
  }], { x: { ticks:{ font:{size:9} } }, y: { ticks:{ font:{size:9} } } });

  renderAdminChart('adminAnalyticsEnergy', 'bar', d.labels || [], [
    { label: 'Biogas (m³)', data: d.biogas || [], backgroundColor: '#22c55e', borderRadius: 4 },
    { label: 'Oil (L)',     data: d.oil || [],    backgroundColor: '#8b5cf6', borderRadius: 4 },
  ], { x: { ticks:{ font:{size:9} } }, y: { ticks:{ font:{size:9} } } });

  const t = d.totals || {};
  const convGrid = document.getElementById('adminConversionGrid');
  if (convGrid) convGrid.innerHTML = [
    { label:'Total Biogas',     val: `${parseFloat(t.total_biogas_m3||0).toFixed(1)} m³`,  icon:'💨' },
    { label:'Total Pyrolysis Oil', val: `${parseFloat(t.total_oil_l||0).toFixed(1)} L`,    icon:'⚗️' },
    { label:'Conversion Rate',  val: `${t.conversion_rate || 78.4}%`,                       icon:'⚡' },
    { label:'CO₂ Saved',        val: `${(parseFloat(t.total_biogas_m3||0) * 2.5).toFixed(0)} kg`, icon:'🌱' },
  ].map(item => `
    <div style="background:var(--bg);border-radius:var(--radius-sm);padding:16px;text-align:center;">
      <div style="font-size:1.5rem;margin-bottom:6px;">${item.icon}</div>
      <div style="font-size:1.1rem;font-weight:800;color:var(--navy);">${item.val}</div>
      <div style="font-size:0.75rem;color:var(--muted);margin-top:2px;">${item.label}</div>
    </div>`).join('');
}

function switchAdminAnalyticsPeriod(period, btn) {
  document.querySelectorAll('#adminAnalytics .tab-btn').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  loadAdminAnalytics(period);
}

// ── AI MONITORING ──────────────────────────────────────────
async function loadAdminAi() {
  const res = await adminApi('admin/?action=ai-stats');
  if (res.error) return adminToast('Failed to load AI stats', 'error');
  const d = res.data || res;
  const total = d.total_predictions || 0;

  // Update metrics display if elements exist
  const elTotal    = document.getElementById('aiTotalPred');
  const elAvgConf  = document.getElementById('aiAvgConf');
  const elFeedback = document.getElementById('aiFeedback');
  const elHighConf = document.getElementById('aiHighConf');
  if (elTotal)    elTotal.textContent = total.toLocaleString();
  if (elAvgConf)  elAvgConf.textContent = parseFloat(d.avg_confidence || 0).toFixed(1) + '%';
  if (elFeedback) elFeedback.textContent = d.feedback_count || 0;
  if (elHighConf) {
    const highPct = total > 0 ? Math.round((d.high_confidence / total) * 100) : 0;
    elHighConf.textContent = highPct + '%';
  }

  // Prediction distribution chart
  const dist = d.prediction_dist || [];
  if (dist.length > 0) {
    const colors = ['#16a34a','#3b82f6','#f59e0b','#6b7280','#06b6d4','#ef4444','#8b5cf6','#22c55e','#0e7490','#92400e','#dc2626','#15803d'];
    renderAdminChart('adminPredChart', 'bar', dist.map(d => d.name), [{
      label: 'Predictions', data: dist.map(d => d.cnt),
      backgroundColor: dist.map((_, i) => colors[i % colors.length]),
      borderRadius: 6,
    }], { x: { ticks:{ font:{size:9} } }, y: { ticks:{ font:{size:9} } } });
  } else {
    // Show placeholder
    renderAdminChart('adminPredChart', 'bar', ['No data yet'], [{ label:'Predictions', data:[0], backgroundColor:'#e5e7eb' }], {});
  }
}

// ── REWARDS ────────────────────────────────────────────────
async function loadAdminRewards() {
  const res = await adminApi('admin/?action=rewards');
  if (res.error) return adminToast('Failed to load rewards', 'error');
  const rewards = res.data?.rewards || res.rewards || [];
  const redemptions = res.data?.redemptions || res.redemptions || [];

  const tbl = document.getElementById('rewardsTable');
  if (!tbl) return;
  tbl.innerHTML = `
    <thead><tr>
      <th>#</th><th>Name</th><th>Type</th><th>Points</th><th>Stock</th><th>Active</th><th>Action</th>
    </tr></thead>
    <tbody>${rewards.map(r => `
      <tr>
        <td>${r.id}</td>
        <td>
          <strong>${r.name}</strong>
          <div style="font-size:0.72rem;color:var(--muted);margin-top:2px;">${r.description || ''}</div>
        </td>
        <td><span class="badge badge-blue">${r.reward_type || '—'}</span></td>
        <td><strong>${(r.points_required || 0).toLocaleString()}</strong> pts</td>
        <td>${r.stock === -1 ? '∞ Unlimited' : r.stock}</td>
        <td>${statusBadge(r.is_active ? 'active' : 'inactive')}</td>
        <td>
          <button class="btn btn-sm ${r.is_active ? 'btn-ghost' : 'btn-primary'}"
            onclick="toggleReward(${r.id}, ${r.is_active ? 0 : 1})"
            style="font-size:0.72rem;">
            ${r.is_active ? 'Deactivate' : 'Activate'}
          </button>
        </td>
      </tr>`).join('')}
    </tbody>`;

  // Redemptions section — add below table if not present
  let redSection = document.getElementById('adminRedemptionsSection');
  if (!redSection) {
    redSection = document.createElement('div');
    redSection.id = 'adminRedemptionsSection';
    redSection.className = 'card mt-4';
    document.getElementById('adminRewards').appendChild(redSection);
  }
  redSection.innerHTML = `
    <h4 style="margin-bottom:16px;">Recent Redemptions (${redemptions.length})</h4>
    <div style="overflow-x:auto;">
    <table class="admin-table">
      <thead><tr><th>User</th><th>Reward</th><th>Points Spent</th><th>Status</th><th>Date</th></tr></thead>
      <tbody>${redemptions.length === 0
        ? '<tr><td colspan="5" style="text-align:center;padding:16px;color:var(--muted);">No redemptions yet</td></tr>'
        : redemptions.map(r => `
          <tr>
            <td>${r.user_name || '—'}</td>
            <td>${r.reward_name || '—'}</td>
            <td>${(r.points_spent||0).toLocaleString()} pts</td>
            <td>${statusBadge(r.status)}</td>
            <td style="font-size:0.75rem;">${timeAgo(r.created_at)}</td>
          </tr>`).join('')}
      </tbody>
    </table></div>`;
}

async function toggleReward(rewardId, isActive) {
  const res = await adminApi('admin/?action=reward-status', 'PUT', { reward_id: rewardId, is_active: isActive });
  if (res.error || !res.success) return adminToast('Failed to update reward', 'error');
  adminToast(`Reward ${isActive ? 'activated' : 'deactivated'}`);
  loadAdminRewards();
}

// ── NOTIFICATIONS MODAL ────────────────────────────────────
function showNotifyModal() {
  let modal = document.getElementById('adminNotifyModal');
  if (!modal) {
    modal = document.createElement('div');
    modal.id = 'adminNotifyModal';
    modal.className = 'modal-overlay open';
    modal.innerHTML = `
      <div class="modal-sheet" style="max-width:480px;width:90%;border-radius:var(--radius);padding:24px;">
        <h3 style="margin-bottom:16px;">Broadcast Notification</h3>
        <div class="form-group">
          <label class="form-label">Type</label>
          <select class="form-input" id="notifType">
            <option value="system">System</option>
            <option value="reward">Reward</option>
            <option value="production_update">Production Update</option>
            <option value="sensor_warning">Sensor Warning</option>
            <option value="critical">Critical</option>
          </select>
        </div>
        <div class="form-group">
          <label class="form-label">Title</label>
          <input type="text" class="form-input" id="notifTitle" placeholder="Notification title">
        </div>
        <div class="form-group">
          <label class="form-label">Message</label>
          <textarea class="form-input" id="notifMessage" placeholder="Notification body..." rows="3" style="resize:vertical;"></textarea>
        </div>
        <div class="form-group">
          <label class="form-label">User ID (leave blank to broadcast all)</label>
          <input type="number" class="form-input" id="notifUserId" placeholder="Optional user ID">
        </div>
        <div style="display:flex;gap:10px;margin-top:8px;">
          <button class="btn btn-primary" onclick="submitNotification()">Send</button>
          <button class="btn btn-ghost" onclick="document.getElementById('adminNotifyModal').remove()">Cancel</button>
        </div>
      </div>`;
    modal.addEventListener('click', e => { if (e.target === modal) modal.remove(); });
    document.body.appendChild(modal);
  }
}

async function submitNotification() {
  const type    = document.getElementById('notifType').value;
  const title   = document.getElementById('notifTitle').value.trim();
  const message = document.getElementById('notifMessage').value.trim();
  const userId  = document.getElementById('notifUserId').value.trim();
  if (!title || !message) return adminToast('Title and message required', 'error');
  const payload = { type, title, message };
  if (userId) payload.user_id = parseInt(userId);
  const res = await adminApi('admin/?action=notify', 'POST', payload);
  if (res.error || !res.success) return adminToast('Failed to send notification', 'error');
  adminToast('Notification sent!');
  document.getElementById('adminNotifyModal')?.remove();
}

// ── CHART HELPER ───────────────────────────────────────────
function renderAdminChart(canvasId, type, labels, datasets, scales, extra = {}) {
  const ctx = document.getElementById(canvasId);
  if (!ctx) return;
  if (adminCharts[canvasId]) { try { adminCharts[canvasId].destroy(); } catch(e){} }
  adminCharts[canvasId] = new Chart(ctx, {
    type,
    data: { labels, datasets },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: datasets.length > 1, position: 'bottom', labels: { font: { size: 10 } } },
        ...extra
      },
      scales: scales || undefined,
    }
  });
}

// ── BOOT ───────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  if (adminToken) {
    // Verify token still valid
    fetch(`${ADMIN_API}/auth/?action=me`, {
      headers: { 'Authorization': `Bearer ${adminToken}` }
    }).then(r => r.json()).then(res => {
      if (res.success && res.data?.user?.role === 'admin') {
        adminUser = res.data.user;
        showAdminApp();
      } else {
        localStorage.removeItem('ec_admin_token');
        adminToken = null;
      }
    }).catch(() => {
      localStorage.removeItem('ec_admin_token');
      adminToken = null;
    });
  }

  // Enter key on login form
  document.getElementById('adminPassword')?.addEventListener('keydown', e => {
    if (e.key === 'Enter') adminLogin();
  });
});
