let services    = {};
let overrides   = JSON.parse(localStorage.getItem('ph_overrides')  || '{}');
let hiddenSvc   = JSON.parse(localStorage.getItem('ph_hidden_svc') || '[]');
let hiddenDev   = JSON.parse(localStorage.getItem('ph_hidden_dev') || '[]');
let manualDevices = JSON.parse(localStorage.getItem('ph_manual_devices') || '[]');
let refreshRate = parseInt(localStorage.getItem('ph_refresh')       || '30000');
let refreshTimer = null;
let editTarget   = null;
let resizeTimer  = null;

function initTheme() {
  document.body.setAttribute('data-theme', localStorage.getItem('ph_theme') || 'dark');
}
document.getElementById('themeBtn').addEventListener('click', () => {
  const t = document.body.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
  document.body.setAttribute('data-theme', t);
  localStorage.setItem('ph_theme', t);
});

// ── SETTINGS ───────────────────────────────────────────────────────────────
const settingsPanel = document.getElementById('settingsPanel');

document.getElementById('settingsBtn').addEventListener('click', () => {
  const opening = settingsPanel.classList.contains('hidden');
  settingsPanel.classList.toggle('hidden');
  if (opening) {
    document.getElementById('refreshInput').value = refreshRate / 1000;
    renderHiddenLists();
    renderManualDevList();
  }
});

document.getElementById('settingsSave').addEventListener('click', () => {
  const v = parseInt(document.getElementById('refreshInput').value) * 1000;
  if (v >= 5000) { refreshRate = v; localStorage.setItem('ph_refresh', v); resetTimer(); }
  settingsPanel.classList.add('hidden');
});

function renderHiddenLists() {
  const devList = document.getElementById('hiddenDevList');
  const svcList = document.getElementById('hiddenSvcList');
  if (!devList || !svcList) return;

  devList.innerHTML = '';
  if (hiddenDev.length === 0) {
    devList.innerHTML = '<span class="empty-hint">None hidden</span>';
  } else {
    hiddenDev.forEach(ip => {
      const meta  = services[ip] || {};
      const label = overrides[ip]?.label || meta.iface || ip;
      const row   = document.createElement('div');
      row.className = 'hidden-row';
      row.innerHTML = `<span>${label} (${ip})</span>
        <button class="show-btn" title="Restore"><svg viewBox="0 0 24 24" width="13" height="13" fill="currentColor"><path d="M12 4.5C7 4.5 2.73 7.61 1 12c1.73 4.39 6 7.5 11 7.5s9.27-3.11 11-7.5c-1.73-4.39-6-7.5-11-7.5zM12 17c-2.76 0-5-2.24-5-5s2.24-5 5-5 5 2.24 5 5-2.24 5-5 5zm0-8c-1.66 0-3 1.34-3 3s1.34 3 3 3 3-1.34 3-3-1.34-3-3-3z"/></svg></button>`;
      row.querySelector('.show-btn').addEventListener('click', () => {
        hiddenDev = hiddenDev.filter(h => h !== ip);
        localStorage.setItem('ph_hidden_dev', JSON.stringify(hiddenDev));
        renderHiddenLists();
    renderManualDevList(); buildLayout();
      });
      devList.appendChild(row);
    });
  }

  svcList.innerHTML = '';
  if (hiddenSvc.length === 0) {
    svcList.innerHTML = '<span class="empty-hint">None hidden</span>';
  } else {
    hiddenSvc.forEach(key => {
      const [port, ip] = key.split('@');
      const o   = overrides[key] || {};
      const row = document.createElement('div');
      row.className = 'hidden-row';
      row.innerHTML = `<span>${o.label || 'Port ' + port} @ ${ip}</span>
        <button class="show-btn" title="Restore"><svg viewBox="0 0 24 24" width="13" height="13" fill="currentColor"><path d="M12 4.5C7 4.5 2.73 7.61 1 12c1.73 4.39 6 7.5 11 7.5s9.27-3.11 11-7.5c-1.73-4.39-6-7.5-11-7.5zM12 17c-2.76 0-5-2.24-5-5s2.24-5 5-5 5 2.24 5 5-2.24 5-5 5zm0-8c-1.66 0-3 1.34-3 3s1.34 3 3 3 3-1.34 3-3-1.34-3-3-3z"/></svg></button>`;
      row.querySelector('.show-btn').addEventListener('click', () => {
        hiddenSvc = hiddenSvc.filter(h => h !== key);
        localStorage.setItem('ph_hidden_svc', JSON.stringify(hiddenSvc));
        renderHiddenLists();
    renderManualDevList(); buildLayout();
      });
      svcList.appendChild(row);
    });
  }
}

function restoreAll(type) {
  if (type === 'dev') { hiddenDev = []; localStorage.removeItem('ph_hidden_dev'); }
  else                { hiddenSvc = []; localStorage.removeItem('ph_hidden_svc'); }
  renderHiddenLists(); buildLayout();
}

// ── FETCH ──────────────────────────────────────────────────────────────────
async function fetchServices() {
  const res = await fetch('/api/services');
  return await res.json();
}

// ── CANVAS ─────────────────────────────────────────────────────────────────
function clearCanvas() {
  const canvas = document.getElementById('canvas');
  Array.from(canvas.children).forEach(c => { if (c.id !== 'lines') c.remove(); });
  document.getElementById('lines').innerHTML = '';
}

const nodes = {};
const lines = {};

function devicePositions(n, W, H) {
  const cx = W / 2, cy = H / 2;
  if (n === 0) return [];
  if (n === 1) return [[cx, cy]];
  if (n === 2) return [[W * 0.28, cy], [W * 0.72, cy]];
  if (n === 3) return [[W * 0.18, cy], [cx, cy], [W * 0.82, cy]];
  // 4+: two rows
  const cols = Math.ceil(Math.sqrt(n));
  const rows = Math.ceil(n / cols);
  const xStep = W / (cols + 1);
  const yStep = H / (rows + 1);
  return Array.from({length: n}, (_, i) => [
    xStep * (i % cols + 1),
    yStep * (Math.floor(i / cols) + 1)
  ]);
}

function buildLayout() {
  Object.keys(nodes).forEach(k => delete nodes[k]);
  Object.keys(lines).forEach(k => delete lines[k]);
  clearCanvas();
  hideTooltip();

  const W = window.innerWidth;
  const H = window.innerHeight - 52;
  const cx = W / 2, cy = H / 2;

  // merge API + manual devices
  const allHosts = Object.assign({}, services);
  manualDevices.forEach(d => {
    if (!allHosts[d.ip]) allHosts[d.ip] = { iface: d.label, services: [], manual: true };
  });

  const hosts = Object.keys(allHosts).filter(ip => !hiddenDev.includes(ip));
  const positions = devicePositions(hosts.length, W, H);

  hosts.forEach((ip, hi) => {
    const meta  = allHosts[ip];
    const [dx, dy] = positions[hi];
    const label = overrides[ip]?.label || meta.iface || ip;

    makeNode({ id: `dev-${ip}`, label, type: 'device', ip, aliases: meta.aliases, mac: meta.mac }, dx, dy);

    const svcs = (meta.services || []).filter(s => !hiddenSvc.includes(s.port + '@' + ip));
    if (!svcs.length) return;

    const minDist = 80;
    const spread  = Math.min(Math.PI * 1.8, Math.PI * 0.7 + svcs.length * 0.18);
    const svcR    = svcs.length <= 1
      ? Math.min(W, H) * 0.15
      : Math.max(Math.min(W, H) * 0.14, (minDist * (svcs.length - 1)) / spread);

    // point services away from screen center
    const baseAngle = Math.atan2(dy - cy, dx - cx);

    svcs.forEach((svc, si) => {
      const svcAngle = baseAngle - spread / 2 + (si / Math.max(svcs.length - 1, 1)) * spread;
      const sx = dx + svcR * Math.cos(svcAngle);
      const sy = dy + svcR * Math.sin(svcAngle);
      const o  = overrides[svc.port + '@' + ip] || {};
      const slabel = o.label || svc.label || String(svc.port);
      const port   = o.port  || svc.port;
      const url    = o.url   || `http://${ip}:${port}`;

      makeNode({ id: `svc-${ip}-${port}`, label: `${slabel}
:${port}`, type: 'service', url, svc, ip }, sx, sy);
      makeLine(`dev-${ip}-${port}`, dx, dy, sx, sy);
    });
  });
}

function makeNode(cfg, x, y) {
  const el   = document.createElement('div');
  const half = cfg.type === 'hub' ? 60 : cfg.type === 'device' ? 45 : 34;
  el.className = `node node-${cfg.type}`;
  el.style.left = (x - half) + 'px';
  el.style.top  = (y - half + 52) + 'px';

  let actions = '';
  if (cfg.type === 'service') {
    actions = `<div class="node-actions">
      <button class="btn-edit" title="Edit"><svg viewBox="0 0 24 24" width="13" height="13" fill="currentColor"><path d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04a1 1 0 0 0 0-1.41l-2.34-2.34a1 1 0 0 0-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z"/></svg></button>
      <button class="btn-hide" title="Hide"><svg viewBox="0 0 24 24" width="13" height="13" fill="currentColor"><path d="M12 7c2.76 0 5 2.24 5 5 0 .65-.13 1.26-.36 1.83l2.92 2.92c1.51-1.26 2.7-2.89 3.43-4.75-1.73-4.39-6-7.5-11-7.5-1.4 0-2.74.25-3.98.7l2.16 2.16C10.74 7.13 11.35 7 12 7zM2 4.27l2.28 2.28.46.46A11.804 11.804 0 0 0 1 12c1.73 4.39 6 7.5 11 7.5 1.55 0 3.03-.3 4.38-.84l.42.42L19.73 22 21 20.73 3.27 3 2 4.27zM7.53 9.8l1.55 1.55c-.05.21-.08.43-.08.65 0 1.66 1.34 3 3 3 .22 0 .44-.03.65-.08l1.55 1.55c-.67.33-1.41.53-2.2.53-2.76 0-5-2.24-5-5 0-.79.2-1.53.53-2.2zm4.31-.78l3.15 3.15.02-.16c0-1.66-1.34-3-3-3l-.17.01z"/></svg></button>
    </div>`;
  } else if (cfg.type === 'device') {
    actions = `<div class="node-actions">
      <button class="btn-edit-dev" title="Rename"><svg viewBox="0 0 24 24" width="13" height="13" fill="currentColor"><path d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04a1 1 0 0 0 0-1.41l-2.34-2.34a1 1 0 0 0-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z"/></svg></button>
      <button class="btn-hide-dev" title="Hide"><svg viewBox="0 0 24 24" width="13" height="13" fill="currentColor"><path d="M12 7c2.76 0 5 2.24 5 5 0 .65-.13 1.26-.36 1.83l2.92 2.92c1.51-1.26 2.7-2.89 3.43-4.75-1.73-4.39-6-7.5-11-7.5-1.4 0-2.74.25-3.98.7l2.16 2.16C10.74 7.13 11.35 7 12 7zM2 4.27l2.28 2.28.46.46A11.804 11.804 0 0 0 1 12c1.73 4.39 6 7.5 11 7.5 1.55 0 3.03-.3 4.38-.84l.42.42L19.73 22 21 20.73 3.27 3 2 4.27zM7.53 9.8l1.55 1.55c-.05.21-.08.43-.08.65 0 1.66 1.34 3 3 3 .22 0 .44-.03.65-.08l1.55 1.55c-.67.33-1.41.53-2.2.53-2.76 0-5-2.24-5-5 0-.79.2-1.53.53-2.2zm4.31-.78l3.15 3.15.02-.16c0-1.66-1.34-3-3-3l-.17.01z"/></svg></button>
    </div>`;
  }

  el.innerHTML = `<div class="node-label">${cfg.label}</div>
    ${actions}<div class="status-dot dot-checking" id="dot-${cfg.id}"></div>`;

  if (cfg.type === 'service' && cfg.url) {
    el.addEventListener('click', e => { if (!e.target.closest('.node-actions')) window.open(cfg.url, '_blank'); });
    el.querySelector('.btn-edit').addEventListener('click', e => { e.stopPropagation(); openEdit(cfg); });
    el.querySelector('.btn-hide').addEventListener('click', e => { e.stopPropagation(); hideSvc(cfg.svc, cfg.ip); });
  }
  if (cfg.type === 'device') {
    el.querySelector('.btn-edit-dev').addEventListener('click', e => { e.stopPropagation(); openDevEdit(cfg); });
    el.querySelector('.btn-hide-dev').addEventListener('click', e => { e.stopPropagation(); hideDev(cfg.ip); });
  }

  el.addEventListener('mouseenter', e => showTooltip(e, cfg));
  el.addEventListener('mouseleave', e => {
    if (!e.relatedTarget || !el.contains(e.relatedTarget)) hideTooltip();
  });

  document.getElementById('canvas').appendChild(el);
  nodes[cfg.id] = { el, x, y, cfg };
}

function makeLine(id, x1, y1, x2, y2) {
  const svg  = document.getElementById('lines');
  const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
  line.setAttribute('x1', x1); line.setAttribute('y1', y1 + 52);
  line.setAttribute('x2', x2); line.setAttribute('y2', y2 + 52);
  line.className.baseVal = 'conn-line';
  svg.appendChild(line);
  lines[id] = line;
}

// ── STATUS ─────────────────────────────────────────────────────────────────
function setDot(id, state) {
  const d = document.getElementById(`dot-${id}`);
  if (d) d.className = `status-dot dot-${state}`;
}

async function checkAll() {
  const btn = document.getElementById('refreshBtn');
  btn.classList.add('spinning');
  try {
    const fresh   = await fetchServices();
    const oldKeys = JSON.stringify(Object.keys(services).sort());
    const newKeys = JSON.stringify(Object.keys(fresh).sort());
    services = fresh;
    if (oldKeys !== newKeys) buildLayout();

    const checks = [];
    for (const [ip, meta] of Object.entries(services)) {
      if (hiddenDev.includes(ip)) continue;
      setDot(`dev-${ip}`, 'online');
      for (const svc of (meta.services || [])) {
        if (hiddenSvc.includes(svc.port + '@' + ip)) continue;
        checks.push((async () => {
          const id = `svc-${ip}-${svc.port}`;
          try {
            const res  = await fetch('/api/check', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({host: ip, port: svc.port}) });
            const data = await res.json();
            setDot(id, data.open ? 'online' : 'offline');
            const lId = `dev-${ip}-${svc.port}`;
            if (lines[lId]) lines[lId].className.baseVal = `conn-line${data.open ? ' active' : ''}`;
          } catch { setDot(id, 'offline'); }
        })());
      }
    }
    await Promise.all(checks);
    
  } catch {  }
  btn.classList.remove('spinning');
}

// ── TOOLTIP ────────────────────────────────────────────────────────────────
function showTooltip(e, cfg) {
  const t = document.getElementById('tooltip');
  let html = `<strong>${cfg.label.replace(/\n/g, ' ')}</strong>`;
  if (cfg.type === 'device') {
    html += cfg.ip  ? `<br>IP: ${cfg.ip}`   : '';
    html += cfg.mac ? `<br>MAC: ${cfg.mac}` : '';
    if (cfg.aliases?.length) html += `<br>Aliases: ${cfg.aliases.join(', ')}`;
  }
  if (cfg.type === 'service' && cfg.svc)
    html += `<br>Port: ${cfg.svc.port}<br>Source: ${cfg.svc.source}`;
  t.innerHTML = html;
  t.style.left = (e.clientX + 14) + 'px';
  t.style.top  = (e.clientY - 10) + 'px';
  t.style.opacity = '1';
}
function hideTooltip() {
  const t = document.getElementById('tooltip');
  if (t) t.style.opacity = '0';
}

// ── EDIT SERVICE ───────────────────────────────────────────────────────────
function openEdit(cfg) {
  editTarget = cfg;
  const key = cfg.svc.port + '@' + cfg.ip;
  const o   = overrides[key] || {};
  document.getElementById('editLabel').value = o.label || cfg.svc.label || '';
  document.getElementById('editPort').value  = o.port  || cfg.svc.port  || '';
  document.getElementById('editUrl').value   = o.url   || '';
  document.getElementById('editDevName').classList.add('hidden');
  document.getElementById('editSvcFields').classList.remove('hidden');
  document.getElementById('overlay').classList.remove('hidden');
  document.getElementById('editModal').classList.remove('hidden');
}

// ── EDIT DEVICE ────────────────────────────────────────────────────────────
function openDevEdit(cfg) {
  editTarget = cfg;
  const o = overrides[cfg.ip] || {};
  document.getElementById('editDevNameInput').value = o.label || cfg.label || '';
  document.getElementById('editDevName').classList.remove('hidden');
  document.getElementById('editSvcFields').classList.add('hidden');
  document.getElementById('overlay').classList.remove('hidden');
  document.getElementById('editModal').classList.remove('hidden');
}

function closeEdit() {
  document.getElementById('overlay').classList.add('hidden');
  document.getElementById('editModal').classList.add('hidden');
  editTarget = null;
}
document.getElementById('editCancel').addEventListener('click', closeEdit);
document.getElementById('overlay').addEventListener('click', closeEdit);
document.getElementById('editSave').addEventListener('click', () => {
  if (!editTarget) return;
  if (editTarget.type === 'device') {
    const label = document.getElementById('editDevNameInput').value.trim();
    overrides[editTarget.ip] = { ...overrides[editTarget.ip], label };
    localStorage.setItem('ph_overrides', JSON.stringify(overrides));
    closeEdit(); buildLayout();
  } else {
    const key = editTarget.svc.port + '@' + editTarget.ip;
    overrides[key] = {
      label: document.getElementById('editLabel').value.trim(),
      port:  parseInt(document.getElementById('editPort').value) || editTarget.svc.port,
      url:   document.getElementById('editUrl').value.trim()
    };
    localStorage.setItem('ph_overrides', JSON.stringify(overrides));
    closeEdit(); buildLayout();
  }
});

// ── HIDE ───────────────────────────────────────────────────────────────────
function hideSvc(svc, ip) {
  const key = svc.port + '@' + ip;
  if (!hiddenSvc.includes(key)) hiddenSvc.push(key);
  localStorage.setItem('ph_hidden_svc', JSON.stringify(hiddenSvc));
  hideTooltip();
  buildLayout();
}
function hideDev(ip) {
  if (!hiddenDev.includes(ip)) hiddenDev.push(ip);
  localStorage.setItem('ph_hidden_dev', JSON.stringify(hiddenDev));
  hideTooltip();
  buildLayout();
}

// ── TIMER / RESIZE ─────────────────────────────────────────────────────────
function resetTimer() {
  clearInterval(refreshTimer);
  refreshTimer = setInterval(checkAll, refreshRate);
}
window.addEventListener('resize', () => {
  clearTimeout(resizeTimer);
  resizeTimer = setTimeout(buildLayout, 150);
});

// ── MANUAL DEVICES ────────────────────────────────────────────────────────
function renderManualDevList() {
  const list = document.getElementById('manualDevList');
  if (!list) return;
  list.innerHTML = '';
  if (manualDevices.length === 0) {
    list.innerHTML = '<span class="empty-hint">No manual devices</span>';
    return;
  }
  manualDevices.forEach(d => {
    const row = document.createElement('div');
    row.className = 'hidden-row';
    row.innerHTML = `<span>${d.label} (${d.ip})</span>
      <button class="show-btn" title="Remove"><svg viewBox="0 0 24 24" width="13" height="13" fill="currentColor"><path d="M12 7c2.76 0 5 2.24 5 5 0 .65-.13 1.26-.36 1.83l2.92 2.92c1.51-1.26 2.7-2.89 3.43-4.75-1.73-4.39-6-7.5-11-7.5-1.4 0-2.74.25-3.98.7l2.16 2.16C10.74 7.13 11.35 7 12 7zM2 4.27l2.28 2.28.46.46A11.804 11.804 0 0 0 1 12c1.73 4.39 6 7.5 11 7.5 1.55 0 3.03-.3 4.38-.84l.42.42L19.73 22 21 20.73 3.27 3 2 4.27zM7.53 9.8l1.55 1.55c-.05.21-.08.43-.08.65 0 1.66 1.34 3 3 3 .22 0 .44-.03.65-.08l1.55 1.55c-.67.33-1.41.53-2.2.53-2.76 0-5-2.24-5-5 0-.79.2-1.53.53-2.2zm4.31-.78l3.15 3.15.02-.16c0-1.66-1.34-3-3-3l-.17.01z"/></svg></button>`;
    row.querySelector('.show-btn').addEventListener('click', () => {
      manualDevices = manualDevices.filter(x => x.ip !== d.ip);
      localStorage.setItem('ph_manual_devices', JSON.stringify(manualDevices));
      renderManualDevList(); buildLayout();
    });
    list.appendChild(row);
  });
}

// ── INIT ───────────────────────────────────────────────────────────────────
document.getElementById('refreshBtn').addEventListener('click', checkAll);
document.getElementById('addDeviceBtn').addEventListener('click', () => {
  const ip    = document.getElementById('manualIp').value.trim();
  const label = document.getElementById('manualName').value.trim() || ip;
  if (!ip) return;
  if (!manualDevices.find(d => d.ip === ip)) {
    manualDevices.push({ ip, label });
    localStorage.setItem('ph_manual_devices', JSON.stringify(manualDevices));
  }
  document.getElementById('manualIp').value   = '';
  document.getElementById('manualName').value = '';
  renderManualDevList(); buildLayout();
});
async function init() {
  initTheme();
  try {
    services = await fetchServices();
  } catch(e) { services = {}; }
  buildLayout();
  setTimeout(checkAll, 600);
  resetTimer();
}
document.addEventListener('DOMContentLoaded', init);
// Also run if DOM already loaded (e.g. hard refresh race)
if (document.readyState !== 'loading') init();
