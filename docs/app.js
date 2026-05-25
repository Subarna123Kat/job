/* ============================================================
   Auto Job Applicator — Dashboard Logic
   All data lives in your private GitHub repo.
   This script talks to the GitHub API via your PAT token.
============================================================ */
'use strict';

// ── Constants ─────────────────────────────────────────────────
const GITHUB_API  = 'https://api.github.com';
const CONFIG_KEY  = 'jab_config_v1';
const WORKFLOW_ID = 'send-applications.yml';

// ── State ─────────────────────────────────────────────────────
let CONFIG = {};
const STATE = {
  companies : [],
  template  : '',
  profile   : { name: 'Subarna Katwal', subject: 'Internship Application – Subarna Katwal' },
  shas      : { companies: null, template: null, profile: null, cv: null },
  cvExists  : false,
};

// ════════════════════════════════════════════════════════════
// GITHUB API HELPERS
// ════════════════════════════════════════════════════════════

function ghHeaders() {
  return {
    'Authorization'        : `Bearer ${CONFIG.token}`,
    'Accept'               : 'application/vnd.github.v3+json',
    'Content-Type'         : 'application/json',
    'X-GitHub-Api-Version' : '2022-11-28',
  };
}

/** UTF-8-safe base64 encode */
function toB64(str) {
  return btoa(unescape(encodeURIComponent(str)));
}
/** UTF-8-safe base64 decode */
function fromB64(b64) {
  return decodeURIComponent(escape(atob(b64.replace(/\s/g, ''))));
}

/** GET a file from the repo. Returns null if 404. */
async function ghGet(filePath) {
  const url = `${GITHUB_API}/repos/${CONFIG.owner}/${CONFIG.repo}/contents/${filePath}`;
  const res = await fetch(url, { headers: ghHeaders() });
  if (res.status === 404) return null;
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.message || `GitHub ${res.status} on GET ${filePath}`);
  }
  return res.json(); // { content, sha, ... }
}

/** PUT (create or update) a text file in the repo. Returns the new SHA. */
async function ghPut(filePath, textContent, sha, message) {
  const url  = `${GITHUB_API}/repos/${CONFIG.owner}/${CONFIG.repo}/contents/${filePath}`;
  const body = { message: message || `Update ${filePath}`, content: toB64(textContent) };
  if (sha) body.sha = sha;

  const res = await fetch(url, { method: 'PUT', headers: ghHeaders(), body: JSON.stringify(body) });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.message || `GitHub ${res.status} on PUT ${filePath}`);
  }
  return (await res.json()).content.sha;
}

/** PUT a binary file (base64 string from FileReader). Returns new SHA. */
async function ghPutBinary(filePath, base64Content, sha, message) {
  const url  = `${GITHUB_API}/repos/${CONFIG.owner}/${CONFIG.repo}/contents/${filePath}`;
  const body = { message: message || `Upload ${filePath}`, content: base64Content };
  if (sha) body.sha = sha;

  const res = await fetch(url, { method: 'PUT', headers: ghHeaders(), body: JSON.stringify(body) });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.message || `GitHub ${res.status} on binary PUT ${filePath}`);
  }
  return (await res.json()).content.sha;
}

/** Trigger workflow_dispatch on the main branch. */
async function ghTriggerWorkflow(testMode = false) {
  const url = `${GITHUB_API}/repos/${CONFIG.owner}/${CONFIG.repo}/actions/workflows/${WORKFLOW_ID}/dispatches`;
  const body = {
    ref    : 'main',
    inputs : { test_mode: testMode ? 'true' : 'false' },
  };
  const res = await fetch(url, { method: 'POST', headers: ghHeaders(), body: JSON.stringify(body) });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.message || `Failed to trigger workflow (${res.status})`);
  }
}

/** Get the 5 most recent workflow runs. */
async function ghGetRuns() {
  const url = `${GITHUB_API}/repos/${CONFIG.owner}/${CONFIG.repo}/actions/workflows/${WORKFLOW_ID}/runs?per_page=5`;
  const res = await fetch(url, { headers: ghHeaders() });
  if (!res.ok) return [];
  return (await res.json()).workflow_runs || [];
}

// ════════════════════════════════════════════════════════════
// DATA OPERATIONS
// ════════════════════════════════════════════════════════════

async function loadAllData() {
  // Companies
  const compFile = await ghGet('data/companies.json');
  if (compFile) {
    STATE.companies     = JSON.parse(fromB64(compFile.content));
    STATE.shas.companies = compFile.sha;
  } else {
    STATE.companies      = [];
    STATE.shas.companies = await ghPut('data/companies.json', '[]', null, '🤖 Initialize companies list');
  }

  // Cover letter template
  const tmplFile = await ghGet('data/template.txt');
  if (tmplFile) {
    STATE.template     = fromB64(tmplFile.content);
    STATE.shas.template = tmplFile.sha;
  }

  // Profile
  const profFile = await ghGet('data/profile.json');
  if (profFile) {
    STATE.profile     = JSON.parse(fromB64(profFile.content));
    STATE.shas.profile = profFile.sha;
  }

  // CV existence check
  const cvFile = await ghGet('cv/resume.pdf');
  if (cvFile) {
    STATE.cvExists  = true;
    STATE.shas.cv   = cvFile.sha;
  }
}

async function saveCompanies() {
  STATE.shas.companies = await ghPut(
    'data/companies.json',
    JSON.stringify(STATE.companies, null, 2),
    STATE.shas.companies,
    '📋 Update company list'
  );
}

async function saveTemplate() {
  STATE.shas.template = await ghPut(
    'data/template.txt',
    STATE.template,
    STATE.shas.template,
    '✉️ Update cover letter template'
  );
}

async function saveProfile() {
  STATE.shas.profile = await ghPut(
    'data/profile.json',
    JSON.stringify(STATE.profile, null, 2),
    STATE.shas.profile,
    '👤 Update profile'
  );
}

// ════════════════════════════════════════════════════════════
// UTILITY
// ════════════════════════════════════════════════════════════

function extractCompanyName(email) {
  const domain = (email.split('@')[1] || '').toLowerCase();
  const clean  = domain.replace(/^(hr|jobs|careers|recruitment|talent|apply|mail|info|contact|noreply)\./i, '');
  const parts  = clean.split('.');
  const name   = parts.length >= 2 ? parts[parts.length - 2] : parts[0];
  return name.split('-').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
}

function previewCoverLetter(template) {
  // Replace "your company" with a highlighted "Google" for the preview
  return template
    .replace(/\byour company\b/gi, '<strong style="color:#6366f1;background:rgba(99,102,241,0.12);padding:1px 4px;border-radius:4px">Google</strong>')
    .replace(/\n/g, '<br>');
}

function timeAgo(dateStr) {
  const diff  = Date.now() - new Date(dateStr).getTime();
  const mins  = Math.floor(diff / 60_000);
  const hours = Math.floor(diff / 3_600_000);
  const days  = Math.floor(diff / 86_400_000);
  if (mins  < 1)  return 'just now';
  if (mins  < 60) return `${mins}m ago`;
  if (hours < 24) return `${hours}h ago`;
  return `${days}d ago`;
}

function showToast(message, type = 'success') {
  const el = document.createElement('div');
  el.className = `toast toast-${type}`;
  const icon = type === 'success' ? '✅' : type === 'error' ? '❌' : 'ℹ️';
  el.innerHTML = `<span class="toast-icon">${icon}</span><span>${message}</span>`;
  document.getElementById('toast-container').appendChild(el);
  requestAnimationFrame(() => el.classList.add('toast-show'));
  setTimeout(() => {
    el.classList.remove('toast-show');
    setTimeout(() => el.remove(), 350);
  }, 3500);
}

// ════════════════════════════════════════════════════════════
// NAVIGATION
// ════════════════════════════════════════════════════════════

function navigateTo(section) {
  document.querySelectorAll('.section').forEach(s => s.classList.add('hidden'));
  const target = document.getElementById(`section-${section}`);
  if (target) target.classList.remove('hidden');

  document.querySelectorAll('.nav-item').forEach(item => {
    item.classList.toggle('active', item.dataset.section === section);
  });

  if (section === 'send')     renderSendSection();
  if (section === 'template') renderTemplatePreview();
  if (section === 'cv')       renderCVSection();
}

function updateSidebar() {
  const count = STATE.companies.length;
  const badge = document.getElementById('companies-count');
  if (badge) {
    badge.textContent = count || '';
    badge.classList.toggle('hidden', count === 0);
  }
}

// ════════════════════════════════════════════════════════════
// SECTION: COMPANIES
// ════════════════════════════════════════════════════════════

function renderCompaniesList() {
  const list  = document.getElementById('companies-list');
  const total = document.getElementById('companies-total');
  if (!list) return;

  total.textContent = `${STATE.companies.length} compan${STATE.companies.length === 1 ? 'y' : 'ies'}`;

  if (STATE.companies.length === 0) {
    list.innerHTML = `<div class="empty-state">No companies yet.<br>Paste emails above to get started.</div>`;
    return;
  }

  list.innerHTML = STATE.companies.map((c, i) => `
    <div class="company-item" id="ci-${i}">
      <div class="company-info">
        <span class="company-name">${c.name || extractCompanyName(c.email)}</span>
        <span class="company-email">${c.email}</span>
      </div>
      <div class="company-actions">
        <button class="btn-icon" onclick="editCompany(${i})" title="Edit">✏️</button>
        <button class="btn-icon btn-danger" onclick="deleteCompany(${i})" title="Delete">🗑️</button>
      </div>
    </div>
  `).join('');
}

async function bulkAddCompanies() {
  const ta  = document.getElementById('bulk-emails');
  const raw = ta.value.trim();
  if (!raw) { showToast('Paste some emails first', 'info'); return; }

  const emails = raw
    .split(/[\n,;]+/)
    .map(e => e.trim().toLowerCase())
    .filter(e => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e));

  if (!emails.length) { showToast('No valid email addresses found', 'error'); return; }

  const existing = new Set(STATE.companies.map(c => c.email));
  const added    = [];
  emails.forEach(email => {
    if (!existing.has(email)) {
      STATE.companies.push({ email });
      existing.add(email);
      added.push(email);
    }
  });

  ta.value = '';
  renderCompaniesList();
  updateSidebar();

  if (!added.length) { showToast('All emails already in the list', 'info'); return; }

  const btn = document.getElementById('bulk-add-btn');
  btn.disabled = true;
  btn.textContent = 'Saving...';
  try {
    await saveCompanies();
    showToast(`Added ${added.length} compan${added.length === 1 ? 'y' : 'ies'} ✅`);
  } catch (err) {
    showToast(`Saved locally — GitHub sync failed: ${err.message}`, 'error');
  } finally {
    btn.disabled    = false;
    btn.textContent = '＋ Add All';
  }
}

async function addSingleCompany() {
  const input = document.getElementById('single-email');
  const email = input.value.trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { showToast('Enter a valid email address', 'error'); return; }
  if (STATE.companies.some(c => c.email === email)) { showToast('Already in the list', 'info'); return; }

  STATE.companies.push({ email });
  input.value = '';
  renderCompaniesList();
  updateSidebar();

  try {
    await saveCompanies();
    showToast('Company added ✅');
  } catch (err) {
    showToast(`Sync failed: ${err.message}`, 'error');
  }
}

async function deleteCompany(index) {
  STATE.companies.splice(index, 1);
  renderCompaniesList();
  updateSidebar();
  try { await saveCompanies(); } catch (err) { showToast(`Sync failed: ${err.message}`, 'error'); }
}

function editCompany(index) {
  const c    = STATE.companies[index];
  const el   = document.getElementById(`ci-${index}`);
  el.innerHTML = `
    <div class="company-edit">
      <input class="input-inline" type="email" id="edit-em-${index}" value="${c.email}" />
      <input class="input-inline" type="text"  id="edit-nm-${index}" value="${c.name || ''}" placeholder="Company name (optional)" />
    </div>
    <div class="company-actions">
      <button class="btn btn-primary btn-sm" onclick="saveEditCompany(${index})">Save</button>
      <button class="btn btn-ghost  btn-sm" onclick="renderCompaniesList()">Cancel</button>
    </div>
  `;
}

async function saveEditCompany(index) {
  const email = document.getElementById(`edit-em-${index}`).value.trim().toLowerCase();
  const name  = document.getElementById(`edit-nm-${index}`).value.trim();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { showToast('Invalid email', 'error'); return; }

  STATE.companies[index] = { email, ...(name && { name }) };
  renderCompaniesList();
  try {
    await saveCompanies();
    showToast('Saved ✅');
  } catch (err) {
    showToast(`Sync failed: ${err.message}`, 'error');
  }
}

async function clearAllCompanies() {
  if (!STATE.companies.length) return;
  if (!confirm(`Remove all ${STATE.companies.length} companies? This cannot be undone.`)) return;
  STATE.companies = [];
  renderCompaniesList();
  updateSidebar();
  try {
    await saveCompanies();
    showToast('All companies cleared');
  } catch (err) {
    showToast(`Sync failed: ${err.message}`, 'error');
  }
}

// ════════════════════════════════════════════════════════════
// SECTION: COVER LETTER TEMPLATE
// ════════════════════════════════════════════════════════════

function renderTemplatePreview() {
  const preview = document.getElementById('template-preview');
  if (!preview) return;
  const text = STATE.template.trim();
  preview.innerHTML = text ? previewCoverLetter(text) : '<span style="color:#55557a">Start typing in the editor…</span>';
}

async function saveTemplateClick() {
  const ta = document.getElementById('template-editor');
  STATE.template = ta.value;
  renderTemplatePreview();
  try {
    await saveTemplate();
    showToast('Template saved ✅');
  } catch (err) {
    showToast(`Failed: ${err.message}`, 'error');
  }
}

// ════════════════════════════════════════════════════════════
// SECTION: CV
// ════════════════════════════════════════════════════════════

function renderCVSection() {
  const status = document.getElementById('cv-status');
  if (!status) return;
  if (STATE.cvExists) {
    status.innerHTML = `
      <div class="cv-uploaded">
        <div class="cv-icon">📄</div>
        <div class="cv-info">
          <div class="cv-name">resume.pdf</div>
          <div class="cv-meta">Stored in your private GitHub repo · Attached to every email</div>
        </div>
        <span class="badge badge-success">✅ Ready</span>
      </div>
    `;
  } else {
    status.innerHTML = `<div style="margin-bottom:12px"><span class="badge badge-warning">⚠️ No CV uploaded yet</span></div>`;
  }
}

function setupCVDragDrop() {
  const zone  = document.getElementById('cv-drop-zone');
  const input = document.getElementById('cv-file-input');
  if (!zone || !input) return;

  zone.addEventListener('dragover',  e => { e.preventDefault(); zone.classList.add('drag-over'); });
  zone.addEventListener('dragleave', ()  => zone.classList.remove('drag-over'));
  zone.addEventListener('drop', async e => {
    e.preventDefault();
    zone.classList.remove('drag-over');
    const file = e.dataTransfer.files[0];
    if (file) await handleCVUpload(file);
  });
  input.addEventListener('change', async e => {
    if (e.target.files[0]) await handleCVUpload(e.target.files[0]);
    input.value = ''; // allow re-upload of same file
  });
}

async function handleCVUpload(file) {
  if (!file.name.toLowerCase().endsWith('.pdf')) {
    showToast('Please upload a PDF file', 'error');
    return;
  }

  const zone = document.getElementById('cv-drop-zone');
  zone.innerHTML = '<div class="uploading">⏳ Uploading CV to GitHub...</div>';

  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = async e => {
      try {
        const base64 = e.target.result.split(',')[1];
        STATE.shas.cv = await ghPutBinary('cv/resume.pdf', base64, STATE.shas.cv, '📎 Upload CV');
        STATE.cvExists = true;
        renderCVSection();
        // Reset drop zone
        zone.innerHTML = `
          <div class="cv-drop-icon">📄</div>
          <div class="cv-drop-title">Drop your CV here or click to browse</div>
          <div class="cv-drop-sub">PDF files only · Stored privately in your GitHub repo</div>
        `;
        showToast('CV uploaded successfully ✅');
        resolve();
      } catch (err) {
        showToast(`Upload failed: ${err.message}`, 'error');
        zone.innerHTML = `
          <div class="cv-drop-icon">📄</div>
          <div class="cv-drop-title">Drop your CV here or click to browse</div>
          <div class="cv-drop-sub">PDF files only · Stored privately in your GitHub repo</div>
        `;
        reject(err);
      }
    };
    reader.onerror = () => reject(new Error('Failed to read file'));
    reader.readAsDataURL(file);
  });
}

// ════════════════════════════════════════════════════════════
// SECTION: SEND
// ════════════════════════════════════════════════════════════

async function renderSendSection() {
  const ok = {
    companies : STATE.companies.length > 0,
    template  : STATE.template.trim().length > 0,
    cv        : STATE.cvExists,
  };

  // Companies check
  const ccEl = document.getElementById('check-companies');
  const ccV  = document.getElementById('check-companies-val');
  ccEl.className = `check-item ${ok.companies ? 'check-ok' : 'check-fail'}`;
  ccEl.querySelector('.check-indicator').textContent = ok.companies ? '✅' : '❌';
  ccV.textContent = ok.companies ? `${STATE.companies.length} companies ready` : 'No companies added';

  // Template check
  const tcEl = document.getElementById('check-template');
  const tcV  = document.getElementById('check-template-val');
  tcEl.className = `check-item ${ok.template ? 'check-ok' : 'check-fail'}`;
  tcEl.querySelector('.check-indicator').textContent = ok.template ? '✅' : '❌';
  tcV.textContent = ok.template ? 'Template saved' : 'No template saved';

  // CV check
  const cvEl = document.getElementById('check-cv');
  const cvV  = document.getElementById('check-cv-val');
  cvEl.className = `check-item ${ok.cv ? 'check-ok' : 'check-fail'}`;
  cvEl.querySelector('.check-indicator').textContent = ok.cv ? '✅' : '❌';
  cvV.textContent = ok.cv ? 'resume.pdf uploaded' : 'No CV uploaded';

  const allReady = Object.values(ok).every(Boolean);
  const btn = document.getElementById('send-btn');
  const desc = document.getElementById('send-description');
  btn.disabled = !allReady;
  if (allReady) {
    btn.textContent = `🚀  Send to ${STATE.companies.length} Companies`;
    desc.textContent = `${STATE.companies.length} personalized emails will be sent via GitHub Actions.`;
  } else {
    btn.textContent = '⚠️  Complete Setup First';
    desc.textContent = 'Complete the checklist above to unlock sending.';
  }

  // Actions link
  const link = document.getElementById('actions-link');
  if (link) link.href = `https://github.com/${CONFIG.owner}/${CONFIG.repo}/actions`;

  // Load runs
  try {
    const runs = await ghGetRuns();
    renderRuns(runs);
  } catch (_) { /* ignore */ }
}

function renderRuns(runs) {
  const el = document.getElementById('runs-container');
  if (!el) return;
  if (!runs.length) {
    el.innerHTML = `<div class="empty-state">No runs yet. Click Send to start!</div>`;
    return;
  }

  const statusIcon = r => {
    if (r.status === 'completed') {
      return { success: '✅', failure: '❌', cancelled: '⛔' }[r.conclusion] || '❓';
    }
    return r.status === 'in_progress' ? '⏳' : '🕐';
  };

  el.innerHTML = runs.map(r => `
    <div class="run-item">
      <span class="run-icon">${statusIcon(r)}</span>
      <div class="run-info">
        <div class="run-title">${r.display_title || r.name}</div>
        <div class="run-meta">${timeAgo(r.created_at)} · ${r.status === 'completed' ? r.conclusion : r.status}</div>
      </div>
      <a class="btn btn-ghost btn-sm" href="${r.html_url}" target="_blank">View Log →</a>
    </div>
  `).join('');
}

async function sendApplications() {
  const btn = document.getElementById('send-btn');
  btn.disabled = true;
  btn.innerHTML = '<span class="spinner"></span> Triggering GitHub Actions...';

  try {
    await ghTriggerWorkflow(false);
    showToast('🚀 Workflow triggered! Check the log below in ~15 seconds.');
    setTimeout(async () => {
      try { renderRuns(await ghGetRuns()); } catch (_) {}
    }, 6000);
  } catch (err) {
    showToast(`Failed: ${err.message}`, 'error');
  } finally {
    btn.disabled    = false;
    btn.textContent = `🚀  Send to ${STATE.companies.length} Companies`;
  }
}

async function sendTestApplication() {
  if (!confirm(`This will send ONE test email to yourself (${CONFIG.owner}) to verify everything works.\n\nContinue?`)) return;
  try {
    await ghTriggerWorkflow(true);
    showToast('🧪 Test triggered! You should receive an email shortly.');
    setTimeout(async () => {
      try { renderRuns(await ghGetRuns()); } catch (_) {}
    }, 6000);
  } catch (err) {
    showToast(`Failed: ${err.message}`, 'error');
  }
}

// ════════════════════════════════════════════════════════════
// SECTION: SETTINGS
// ════════════════════════════════════════════════════════════

async function saveSettings() {
  const token   = document.getElementById('settings-token').value.trim();
  const owner   = document.getElementById('settings-owner').value.trim();
  const repo    = document.getElementById('settings-repo').value.trim();
  const name    = document.getElementById('settings-name').value.trim();
  const subject = document.getElementById('settings-subject').value.trim();

  if (!token || !owner || !repo) { showToast('GitHub fields are required', 'error'); return; }

  CONFIG = { token, owner, repo };
  localStorage.setItem(CONFIG_KEY, JSON.stringify(CONFIG));

  if (name || subject) {
    STATE.profile.name    = name    || STATE.profile.name;
    STATE.profile.subject = subject || STATE.profile.subject;
    try { await saveProfile(); } catch (_) {}
  }

  showToast('Settings saved ✅');
}

function disconnectRepo() {
  if (!confirm('Clear your saved GitHub token from this browser?')) return;
  localStorage.removeItem(CONFIG_KEY);
  location.reload();
}

// ════════════════════════════════════════════════════════════
// SETUP MODAL
// ════════════════════════════════════════════════════════════

async function setupConnect() {
  const token = document.getElementById('setup-token').value.trim();
  const owner = document.getElementById('setup-owner').value.trim();
  const repo  = document.getElementById('setup-repo').value.trim();

  if (!token || !owner || !repo) { showToast('All fields are required', 'error'); return; }

  const btn = document.getElementById('setup-btn');
  btn.disabled    = true;
  btn.textContent = 'Connecting...';

  // Temporarily set CONFIG so ghHeaders() works for the test
  CONFIG = { token, owner, repo };

  try {
    const res = await fetch(`${GITHUB_API}/repos/${owner}/${repo}`, { headers: ghHeaders() });
    if (res.status === 404) throw new Error('Repository not found. Check the name and make sure it is not empty.');
    if (res.status === 401) throw new Error('Invalid token. Make sure it has repo + workflow permissions.');
    if (!res.ok) throw new Error(`GitHub returned ${res.status}`);

    localStorage.setItem(CONFIG_KEY, JSON.stringify(CONFIG));
    document.getElementById('setup-modal').classList.add('hidden');
    await initApp();
  } catch (err) {
    showToast(err.message, 'error');
    CONFIG = {};
    btn.disabled    = false;
    btn.textContent = 'Connect →';
  }
}

// ════════════════════════════════════════════════════════════
// APP INIT
// ════════════════════════════════════════════════════════════

async function initApp() {
  const app     = document.getElementById('app');
  const loader  = document.getElementById('app-loader');
  const content = document.getElementById('main-content');

  app.classList.remove('hidden');
  loader.classList.remove('hidden');
  content.classList.add('hidden');

  try {
    await loadAllData();

    // Populate UI
    document.getElementById('template-editor').value  = STATE.template;
    document.getElementById('settings-token').value   = CONFIG.token  || '';
    document.getElementById('settings-owner').value   = CONFIG.owner  || '';
    document.getElementById('settings-repo').value    = CONFIG.repo   || '';
    document.getElementById('settings-name').value    = STATE.profile.name    || '';
    document.getElementById('settings-subject').value = STATE.profile.subject || '';

    renderCompaniesList();
    renderCVSection();
    renderTemplatePreview();
    updateSidebar();

    loader.classList.add('hidden');
    content.classList.remove('hidden');
    navigateTo('companies');
  } catch (err) {
    loader.classList.add('hidden');
    content.classList.remove('hidden');
    showToast(`Failed to load data: ${err.message}`, 'error');
  }
}

// ════════════════════════════════════════════════════════════
// BOOTSTRAP
// ════════════════════════════════════════════════════════════

document.addEventListener('DOMContentLoaded', () => {
  // Load config
  const saved = localStorage.getItem(CONFIG_KEY);
  if (saved) {
    try { CONFIG = JSON.parse(saved); } catch (_) {}
  }

  if (!CONFIG.token || !CONFIG.owner || !CONFIG.repo) {
    document.getElementById('setup-modal').classList.remove('hidden');
    document.getElementById('app').classList.add('hidden');
  } else {
    document.getElementById('setup-modal').classList.add('hidden');
    initApp();
  }

  // Sidebar navigation
  document.querySelectorAll('.nav-item').forEach(item => {
    item.addEventListener('click', () => navigateTo(item.dataset.section));
  });

  // Live template preview
  document.getElementById('template-editor')?.addEventListener('input', e => {
    STATE.template = e.target.value;
    renderTemplatePreview();
  });

  // CV drag & drop
  setupCVDragDrop();
});
