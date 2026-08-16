// ═══════════════════════════════════════════════════════
// Steam Guard Desktop — Frontend Application
// SPA router, TOTP timer, confirmations, drag-n-drop
// ═══════════════════════════════════════════════════════

const api = window.steamAuth;

// ─── State ───
let currentPage = 'guard';
let selectedAccount = null;
let accounts = [];
let codeInterval = null;
let currentCode = '';

// ─── Init ───
document.addEventListener('DOMContentLoaded', async () => {
  initWindowControls();
  initNavigation();
  initGuardPage();
  initAccountsPage();
  initConfirmationsPage();
  initLoginPage();
  initSettingsPage();
  initSetupPage();

  // Load storage
  const storageInfo = await api.initStorage();
  
  if (storageInfo.hasPassword) {
    document.getElementById('password-modal').style.display = 'flex';
    document.getElementById('password-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      const pwd = document.getElementById('startup-password').value;
      const result = await api.loadAccounts(pwd);
      if (result.success) {
        document.getElementById('password-modal').style.display = 'none';
        accounts = result.accounts;
        updateAccountSelectors();
        renderAccountsList();
        showToast('Акаунти розшифровано', 'success');
      } else {
        showToast('Невірний пароль', 'error');
      }
    });
  } else {
    const result = await api.loadAccounts();
    if (result.success) {
      accounts = result.accounts;
      updateAccountSelectors();
      renderAccountsList();
    }
  }

  // Sync time with Steam
  const timeSync = await api.syncTime();
  if (timeSync.success) {
    document.getElementById('time-offset').textContent = `Зміщення: ${timeSync.offset}мс`;
  }
});

// ═══════════════════════════════════════════════════════
// Window Controls
// ═══════════════════════════════════════════════════════
function initWindowControls() {
  document.getElementById('btn-minimize').addEventListener('click', () => api.minimize());
  document.getElementById('btn-maximize').addEventListener('click', () => api.maximize());
  document.getElementById('btn-close').addEventListener('click', () => api.close());
}

// ═══════════════════════════════════════════════════════
// Navigation (SPA Router)
// ═══════════════════════════════════════════════════════
function initNavigation() {
  document.querySelectorAll('.nav-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const page = btn.dataset.page;
      navigateTo(page);
    });
  });
}

function navigateTo(page) {
  // Update nav buttons
  document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
  document.querySelector(`[data-page="${page}"]`)?.classList.add('active');

  // Update pages
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  const pageEl = document.getElementById(`page-${page}`);
  if (pageEl) {
    pageEl.classList.add('active');
    // Re-trigger animation
    pageEl.style.animation = 'none';
    pageEl.offsetHeight; // reflow
    pageEl.style.animation = '';
  }

  currentPage = page;

  // Refresh data on page switch
  if (page === 'accounts') renderAccountsList();
  if (page === 'login') updateLoginSessions();
}

// ═══════════════════════════════════════════════════════
// Steam Guard Page — TOTP Code Generation
// ═══════════════════════════════════════════════════════
function initGuardPage() {
  const select = document.getElementById('guard-account-select');
  const codeEl = document.getElementById('code-value');
  const copyBtn = document.getElementById('copy-code-btn');

  select.addEventListener('change', () => {
    selectedAccount = select.value || null;
    if (selectedAccount) {
      document.getElementById('no-account-hint').style.display = 'none';
      startCodeGeneration();
    } else {
      stopCodeGeneration();
      codeEl.textContent = '—';
      document.getElementById('no-account-hint').style.display = '';
    }
  });

  // Click on code to copy
  codeEl.addEventListener('click', () => copyCodeToClipboard());
  copyBtn.addEventListener('click', () => copyCodeToClipboard());
}

async function startCodeGeneration() {
  stopCodeGeneration();
  await generateAndDisplayCode();

  codeInterval = setInterval(async () => {
    await generateAndDisplayCode();
  }, 1000);
}

function stopCodeGeneration() {
  if (codeInterval) {
    clearInterval(codeInterval);
    codeInterval = null;
  }
}

async function generateAndDisplayCode() {
  if (!selectedAccount) return;

  const accountData = await api.getAccount(selectedAccount);
  if (!accountData.success || !accountData.account.shared_secret) return;

  const result = await api.generateCode(accountData.account.shared_secret);
  if (!result.success) return;

  const codeEl = document.getElementById('code-value');
  const secondsEl = document.getElementById('code-seconds');
  const ringFill = document.getElementById('progress-ring-fill');

  // Update timer
  secondsEl.textContent = result.secondsLeft;

  // Update progress ring (628.32 = full circumference)
  const progress = result.secondsLeft / 30;
  const offset = 628.32 * (1 - progress);
  ringFill.style.strokeDashoffset = offset;

  // Color based on time remaining
  ringFill.classList.remove('warning', 'danger');
  if (result.secondsLeft <= 5) {
    ringFill.classList.add('danger');
  } else if (result.secondsLeft <= 10) {
    ringFill.classList.add('warning');
  }

  // Update code with animation if changed
  if (result.code !== currentCode) {
    currentCode = result.code;
    codeEl.classList.add('changing');
    setTimeout(() => {
      codeEl.textContent = result.code;
      codeEl.classList.remove('changing');
    }, 200);
  }
}

async function copyCodeToClipboard() {
  if (!currentCode || currentCode === '—') return;

  try {
    await navigator.clipboard.writeText(currentCode);
    const btn = document.getElementById('copy-code-btn');
    btn.classList.add('copied');
    btn.querySelector('span').textContent = 'Скопійовано!';
    showToast('Код скопійовано в буфер обміну', 'success');

    setTimeout(() => {
      btn.classList.remove('copied');
      btn.querySelector('span').textContent = 'Копіювати';
    }, 2000);
  } catch {
    showToast('Не вдалось скопіювати', 'error');
  }
}

// ═══════════════════════════════════════════════════════
// Accounts Page
// ═══════════════════════════════════════════════════════
function initAccountsPage() {
  const importBtn = document.getElementById('btn-import-mafile');
  const dropZone = document.getElementById('drop-zone');

  importBtn.addEventListener('click', handleImportMaFile);

  // Drag and drop
  dropZone.addEventListener('dragover', (e) => {
    e.preventDefault();
    dropZone.classList.add('drag-over');
  });

  dropZone.addEventListener('dragleave', () => {
    dropZone.classList.remove('drag-over');
  });

  dropZone.addEventListener('drop', async (e) => {
    e.preventDefault();
    dropZone.classList.remove('drag-over');

    const files = e.dataTransfer.files;
    for (const file of files) {
      if (file.name.endsWith('.maFile') || file.name.endsWith('.mafile')) {
        const result = await api.importMaFileFromPath(file.path);
        if (result.success) {
          showToast(`Акаунт ${result.accountName} імпортовано!`, 'success');
        } else {
          showToast(`Помилка: ${result.error}`, 'error');
        }
      }
    }

    await refreshAccounts();
  });
}

async function handleImportMaFile() {
  const result = await api.importMaFile();
  if (result.canceled) return;

  if (result.success) {
    showToast(`Акаунт ${result.accountName} імпортовано!`, 'success');
    await refreshAccounts();
  } else {
    showToast(`Помилка: ${result.error}`, 'error');
  }
}

async function refreshAccounts() {
  const result = await api.loadAccounts();
  if (result.success) {
    accounts = result.accounts;
    updateAccountSelectors();
    renderAccountsList();
  }
}

function renderAccountsList() {
  const container = document.getElementById('accounts-list');
  container.innerHTML = '';

  if (accounts.length === 0) {
    container.innerHTML = `
      <div class="empty-state">
        <p>Немає імпортованих акаунтів</p>
        <span class="hint">Натисніть "Імпорт .maFile" або перетягніть файл</span>
      </div>
    `;
    return;
  }

  accounts.forEach((acc, index) => {
    const card = document.createElement('div');
    card.className = 'account-card';
    card.style.animationDelay = `${index * 0.05}s`;
    card.innerHTML = `
      <div class="account-avatar">${acc.accountName.charAt(0).toUpperCase()}</div>
      <div class="account-info">
        <div class="account-name">${escapeHtml(acc.accountName)}</div>
        <div class="account-steamid">${acc.steamId || 'SteamID не вказано'}</div>
      </div>
      <div class="account-actions">
        <button class="icon-btn" title="Експорт" data-action="export" data-account="${escapeHtml(acc.accountName)}">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
            <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
            <polyline points="7,10 12,15 17,10" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
            <line x1="12" y1="15" x2="12" y2="3" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
          </svg>
        </button>
        <button class="icon-btn danger" title="Видалити" data-action="remove" data-account="${escapeHtml(acc.accountName)}">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
            <polyline points="3,6 5,6 21,6" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
            <path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
          </svg>
        </button>
      </div>
    `;
    container.appendChild(card);
  });

  // Event delegation for account actions
  container.querySelectorAll('[data-action]').forEach(btn => {
    btn.addEventListener('click', async () => {
      const action = btn.dataset.action;
      const accountName = btn.dataset.account;

      if (action === 'export') {
        const result = await api.exportMaFile(accountName);
        if (result.success) {
          showToast(`Експортовано: ${result.path}`, 'success');
        } else if (!result.canceled) {
          showToast(`Помилка: ${result.error}`, 'error');
        }
      } else if (action === 'remove') {
        if (confirm(`Видалити акаунт "${accountName}"? Цю дію не можна скасувати.`)) {
          const result = await api.removeAccount(accountName);
          if (result.success) {
            showToast(`Акаунт ${accountName} видалено`, 'info');
            await refreshAccounts();
          }
        }
      }
    });
  });
}

function updateAccountSelectors() {
  const selectors = ['guard-account-select', 'conf-account-select', 'login-account'];
  selectors.forEach(id => {
    const select = document.getElementById(id);
    const currentVal = select.value;
    const options = select.querySelectorAll('option:not(:first-child)');
    options.forEach(o => o.remove());

    accounts.forEach(acc => {
      const opt = document.createElement('option');
      opt.value = acc.accountName;
      opt.textContent = acc.accountName;
      select.appendChild(opt);
    });

    // Restore selection if still valid
    if (currentVal && accounts.find(a => a.accountName === currentVal)) {
      select.value = currentVal;
    }
  });
}

// ═══════════════════════════════════════════════════════
// Confirmations Page — Trades & Market
// ═══════════════════════════════════════════════════════
let autoConfirmInterval = null;
let autoRefreshInterval = null;
let confsFetchId = 0; // Monotonically increasing ID to track which fetch is "current"
let confsFetchDebounceTimer = null;

function initConfirmationsPage() {
  const refreshBtn = document.getElementById('btn-refresh-confs');
  const acceptAllBtn = document.getElementById('btn-accept-all');
  const denyAllBtn = document.getElementById('btn-deny-all');
  const autoConfirmCheckbox = document.getElementById('auto-confirm-checkbox');
  const autoRefreshCheckbox = document.getElementById('auto-refresh-checkbox');
  const confAccountSelect = document.getElementById('conf-account-select');

  refreshBtn.addEventListener('click', () => fetchConfirmations(false));
  acceptAllBtn.addEventListener('click', () => batchRespondAll(true));
  denyAllBtn.addEventListener('click', () => batchRespondAll(false));
  autoConfirmCheckbox.addEventListener('change', (e) => toggleAutoConfirm(e.target.checked));
  autoRefreshCheckbox.addEventListener('change', (e) => toggleAutoRefresh(e.target.checked));
  
  confAccountSelect.addEventListener('change', () => {
    // Debounce: wait 300ms before fetching, in case user is clicking through accounts quickly
    if (confsFetchDebounceTimer) clearTimeout(confsFetchDebounceTimer);
    // Immediately clear the list so old data doesn't linger
    clearConfirmationsList();
    confsFetchDebounceTimer = setTimeout(() => {
      confsFetchDebounceTimer = null;
      fetchConfirmations(false);
    }, 300);
  });
}

function toggleAutoRefresh(enabled) {
  if (enabled) {
    autoRefreshInterval = setInterval(() => {
      if (document.getElementById('conf-account-select').value) {
        fetchConfirmations(true); // silent fetch
      }
    }, 10000); // Check every 10 seconds
    showToast('Авто-оновлення увімкнено', 'success');
  } else {
    if (autoRefreshInterval) {
      clearInterval(autoRefreshInterval);
      autoRefreshInterval = null;
    }
    showToast('Авто-оновлення вимкнено', 'info');
  }
}

function toggleAutoConfirm(enabled) {
  if (enabled) {
    autoConfirmInterval = setInterval(async () => {
      const accountName = document.getElementById('conf-account-select').value;
      if (!accountName) return;

      const result = await api.fetchConfirmations({ accountName });
      if (result.success && result.confirmations.length > 0) {
        const confirmations = result.confirmations.map(c => ({
          id: c.id,
          nonce: c.nonce
        }));
        
        showToast(`Авто-підтвердження ${confirmations.length} трейдів...`, 'info');
        await api.batchRespond({ accountName, confirmations, accept: true });
        fetchConfirmations(true);
      }
    }, 10000); // Check every 10 seconds
    showToast('Авто-підтвердження увімкнено', 'success');
  } else {
    if (autoConfirmInterval) {
      clearInterval(autoConfirmInterval);
      autoConfirmInterval = null;
    }
    showToast('Авто-підтвердження вимкнено', 'info');
  }
}

async function fetchConfirmations(silent = false) {
  const accountName = document.getElementById('conf-account-select').value;
  if (!accountName) {
    if (!silent) showToast('Оберіть акаунт', 'error');
    clearConfirmationsList();
    return;
  }

  // Assign a unique ID to this fetch request
  const myFetchId = ++confsFetchId;

  const loading = document.getElementById('confs-loading');
  if (!silent) loading.style.display = 'flex';

  const result = await api.fetchConfirmations({ accountName });

  // *** KEY FIX ***: If a newer fetch was started while we were waiting,
  // this result is stale — discard it completely.
  if (myFetchId !== confsFetchId) {
    return;
  }

  if (!silent) loading.style.display = 'none';

  if (result.success) {
    renderConfirmations(result.confirmations);
    if (result.confirmations.length > 0) {
      updateBadge(result.confirmations.length);
      if (!silent) showToast(`Знайдено ${result.confirmations.length} підтверджень`, 'info');
    } else {
      updateBadge(0);
      if (!silent) showToast('Підтверджень немає', 'info');
    }
  } else {
    if (!silent) showToast(`Помилка: ${result.error}`, 'error');
  }
}

// Safely clear the confirmations list without destroying the empty-state element
function clearConfirmationsList() {
  const container = document.getElementById('confirmations-list');
  // Remove all children EXCEPT confs-empty
  const toRemove = [];
  for (const child of container.children) {
    if (child.id !== 'confs-empty') {
      toRemove.push(child);
    }
  }
  toRemove.forEach(el => el.remove());
  // Show the empty state
  const emptyEl = document.getElementById('confs-empty');
  if (emptyEl) {
    emptyEl.style.display = '';
  }
}

function renderConfirmations(confirmations) {
  const container = document.getElementById('confirmations-list');
  const emptyEl = document.getElementById('confs-empty');

  if (confirmations.length === 0) {
    clearConfirmationsList();
    return;
  }

  // Hide empty state, remove old cards (but keep emptyEl in DOM!)
  if (emptyEl) emptyEl.style.display = 'none';
  const toRemove = [];
  for (const child of container.children) {
    if (child.id !== 'confs-empty') {
      toRemove.push(child);
    }
  }
  toRemove.forEach(el => el.remove());

  confirmations.forEach((conf, index) => {
    const card = document.createElement('div');
    card.className = 'confirmation-card';
    card.dataset.id = conf.id;
    card.dataset.nonce = conf.nonce;
    card.style.animationDelay = `${index * 0.05}s`;

    const iconClass = conf.type === 2 ? 'trade' : conf.type === 3 ? 'market' : '';
    const iconSymbol = conf.type === 2 ? '⇄' : conf.type === 3 ? '$' : '?';

    // Format timestamp
    let timeStr = '';
    if (conf.timestamp) {
      try {
        const d = new Date(conf.timestamp);
        timeStr = d.toLocaleString('uk-UA', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
      } catch { timeStr = ''; }
    }

    // Build details content
    const detailRows = [];
    if (conf.sending) detailRows.push(`<div class="conf-detail-row"><span class="conf-detail-label">Віддаєте:</span><span class="conf-detail-value">${escapeHtml(conf.sending)}</span></div>`);
    if (conf.receiving) detailRows.push(`<div class="conf-detail-row"><span class="conf-detail-label">Отримуєте:</span><span class="conf-detail-value">${escapeHtml(conf.receiving)}</span></div>`);
    if (conf.typeDescription) detailRows.push(`<div class="conf-detail-row"><span class="conf-detail-label">Тип:</span><span class="conf-detail-value">${escapeHtml(conf.typeDescription)}</span></div>`);
    if (conf.creatorId) detailRows.push(`<div class="conf-detail-row"><span class="conf-detail-label">${conf.type === 2 ? 'Trade Offer ID:' : 'Creator ID:'}</span><span class="conf-detail-value conf-detail-mono">${escapeHtml(String(conf.creatorId))}</span></div>`);
    if (timeStr) detailRows.push(`<div class="conf-detail-row"><span class="conf-detail-label">Створено:</span><span class="conf-detail-value">${escapeHtml(timeStr)}</span></div>`);
    if (conf.id) detailRows.push(`<div class="conf-detail-row"><span class="conf-detail-label">Confirmation ID:</span><span class="conf-detail-value conf-detail-mono">${escapeHtml(String(conf.id))}</span></div>`);

    card.innerHTML = `
      <div class="conf-main-row">
        <div class="conf-icon ${iconClass}">${iconSymbol}</div>
        <div class="conf-info">
          <div class="conf-headline">${escapeHtml(conf.headline || 'Підтвердження')}</div>
          <div class="conf-summary">${escapeHtml(conf.summary || '')}</div>
        </div>
        <div class="conf-actions">
          <button class="conf-btn expand" title="Деталі" data-action="expand">▼</button>
          <button class="conf-btn accept" title="Прийняти" data-action="accept">✓</button>
          <button class="conf-btn deny" title="Відхилити" data-action="deny">✕</button>
        </div>
      </div>
      <div class="conf-details" style="display:none;">
        ${conf.icon ? `<div class="conf-detail-icon"><img src="${escapeHtml(conf.icon)}" alt="icon" onerror="this.style.display='none'"></div>` : ''}
        <div class="conf-detail-rows">
          ${detailRows.join('')}
        </div>
      </div>
    `;

    // Expand/collapse
    card.querySelector('[data-action="expand"]').addEventListener('click', () => {
      const details = card.querySelector('.conf-details');
      const expandBtn = card.querySelector('[data-action="expand"]');
      if (details.style.display === 'none') {
        details.style.display = '';
        expandBtn.textContent = '▲';
        expandBtn.classList.add('expanded');
        card.classList.add('expanded');
      } else {
        details.style.display = 'none';
        expandBtn.textContent = '▼';
        expandBtn.classList.remove('expanded');
        card.classList.remove('expanded');
      }
    });

    // Individual accept/deny
    card.querySelector('[data-action="accept"]').addEventListener('click', () => {
      respondToSingle(conf, true, card);
    });
    card.querySelector('[data-action="deny"]').addEventListener('click', () => {
      respondToSingle(conf, false, card);
    });

    container.appendChild(card);
  });
}

async function respondToSingle(conf, accept, cardEl) {
  const accountName = document.getElementById('conf-account-select').value;
  if (!accountName) return;

  cardEl.classList.add('processing');
  const btns = cardEl.querySelectorAll('.conf-btn');
  btns.forEach(b => b.disabled = true);

  const result = await api.respondToConfirmation({
    accountName,
    confirmationId: conf.id,
    confirmationNonce: conf.nonce,
    accept
  });

  if (result.success) {
    cardEl.classList.remove('processing');
    cardEl.classList.add(accept ? 'accepted' : 'denied');
    showToast(accept ? 'Підтверджено!' : 'Відхилено!', accept ? 'success' : 'info');

    // Remove card after animation
    setTimeout(() => {
      cardEl.remove();
      updateBadgeFromDOM();
    }, 450);
  } else {
    cardEl.classList.remove('processing');
    btns.forEach(b => b.disabled = false);
    showToast(`Помилка: ${result.error}`, 'error');
  }
}

async function batchRespondAll(accept) {
  const accountName = document.getElementById('conf-account-select').value;
  if (!accountName) {
    showToast('Оберіть акаунт', 'error');
    return;
  }

  const cards = document.querySelectorAll('.confirmation-card');
  if (cards.length === 0) {
    showToast('Немає підтверджень', 'info');
    return;
  }

  const action = accept ? 'прийняти' : 'відхилити';
  if (!confirm(`${accept ? 'Прийняти' : 'Відхилити'} всі ${cards.length} підтверджень?`)) return;

  // Collect all confirmations data
  const confirmations = [];
  cards.forEach(card => {
    card.classList.add('processing');
    confirmations.push({
      id: card.dataset.id,
      nonce: card.dataset.nonce
    });
  });

  showToast(`Обробка ${confirmations.length} підтверджень...`, 'info');

  // Use batch API — all run concurrently via Promise.allSettled
  const result = await api.batchRespond({ accountName, confirmations, accept });

  if (result.success) {
    let successCount = 0;
    let failCount = 0;

    result.results.forEach((res, index) => {
      const card = document.querySelector(`.confirmation-card[data-id="${res.confirmationId}"]`);
      if (card) {
        card.classList.remove('processing');
        if (res.success) {
          successCount++;
          card.classList.add(accept ? 'accepted' : 'denied');
          setTimeout(() => card.remove(), 450 + index * 50);
        } else {
          failCount++;
          const btns = card.querySelectorAll('.conf-btn');
          btns.forEach(b => b.disabled = false);
        }
      }
    });

    const msg = `${accept ? 'Прийнято' : 'Відхилено'}: ${successCount}${failCount > 0 ? `, помилок: ${failCount}` : ''}`;
    showToast(msg, failCount > 0 ? 'error' : 'success');

    setTimeout(() => updateBadgeFromDOM(), 600);
  } else {
    cards.forEach(card => {
      card.classList.remove('processing');
      card.querySelectorAll('.conf-btn').forEach(b => b.disabled = false);
    });
    showToast(`Помилка: ${result.error}`, 'error');
  }
}

function updateBadge(count) {
  const badge = document.getElementById('confirmations-badge');
  if (count > 0) {
    badge.textContent = count;
    badge.style.display = '';
  } else {
    badge.style.display = 'none';
  }
}

function updateBadgeFromDOM() {
  const count = document.querySelectorAll('.confirmation-card:not(.accepted):not(.denied)').length;
  updateBadge(count);
}

// ═══════════════════════════════════════════════════════
// Login Page
// ═══════════════════════════════════════════════════════
function initLoginPage() {
  const form = document.getElementById('login-form');
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    await handleLogin();
  });
}

async function handleLogin() {
  const accountName = document.getElementById('login-account').value;
  const password = document.getElementById('login-password').value;
  const statusEl = document.getElementById('login-status');
  const loginBtn = document.getElementById('btn-login');

  if (!accountName) {
    showToast('Оберіть акаунт', 'error');
    return;
  }
  if (!password) {
    showToast('Введіть пароль', 'error');
    return;
  }

  statusEl.className = 'login-status loading';
  statusEl.textContent = 'Підключення до Steam...';
  loginBtn.disabled = true;

  // Get shared_secret for auto-2FA
  const accountData = await api.getAccount(accountName);
  const sharedSecret = accountData.success ? accountData.account.shared_secret : null;

  const result = await api.login({
    accountName,
    password,
    sharedSecret
  });

  loginBtn.disabled = false;

  if (result.success) {
    statusEl.className = 'login-status success';
    statusEl.textContent = `✓ Авторизовано! SteamID: ${result.session.steamId}`;
    showToast(`Логін успішний: ${accountName}`, 'success');
    document.getElementById('login-password').value = '';
    updateLoginSessions();
  } else {
    statusEl.className = 'login-status error';
    statusEl.textContent = `✕ Помилка: ${result.error}`;
    showToast(`Помилка логіну: ${result.error}`, 'error');
  }
}

async function updateLoginSessions() {
  const container = document.getElementById('sessions-list');
  container.innerHTML = '';

  for (const acc of accounts) {
    const session = await api.getSession(acc.accountName);
    if (session.success) {
      const item = document.createElement('div');
      item.className = 'session-item';
      item.innerHTML = `
        <span class="session-name">${escapeHtml(acc.accountName)}</span>
        <span class="session-status">Активна</span>
      `;
      container.appendChild(item);
    }
  }

  if (container.children.length === 0) {
    container.innerHTML = '<p class="hint" style="padding: 12px; text-align: center;">Немає активних сесій</p>';
  }
}

// ═══════════════════════════════════════════════════════
// Settings Page
// ═══════════════════════════════════════════════════════
function initSettingsPage() {
  const setEncryptionBtn = document.getElementById('btn-set-encryption');
  const syncTimeBtn = document.getElementById('btn-sync-time');

  setEncryptionBtn.addEventListener('click', async () => {
    const password = document.getElementById('encryption-password').value;
    if (!password) {
      showToast('Введіть пароль', 'error');
      return;
    }
    await api.setPassword(password);
    showToast('Пароль шифрування встановлено', 'success');
    document.getElementById('encryption-password').value = '';
  });

  syncTimeBtn.addEventListener('click', async () => {
    const result = await api.syncTime();
    if (result.success) {
      document.getElementById('time-offset').textContent = `Зміщення: ${result.offset}мс`;
      showToast(`Час синхронізовано (зміщення: ${result.offset}мс)`, 'success');
    } else {
      showToast(`Помилка синхронізації: ${result.error}`, 'error');
    }
  });
}

// ═══════════════════════════════════════════════════════
// Toast Notifications
// ═══════════════════════════════════════════════════════
function showToast(message, type = 'info') {
  const container = document.getElementById('toast-container');
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.textContent = message;
  container.appendChild(toast);

  // Auto-remove after animation
  setTimeout(() => {
    if (toast.parentNode) toast.remove();
  }, 3100);
}

// ═══════════════════════════════════════════════════════
// Setup New Guard Page
// ═══════════════════════════════════════════════════════
let setupResponse = null;
let isEmailVerified = false;

function initSetupPage() {
  const loginForm = document.getElementById('setup-login-form');
  const savedCheckbox = document.getElementById('setup-saved-checkbox');
  const btnSaved = document.getElementById('btn-setup-code-saved');
  const finalizeForm = document.getElementById('setup-finalize-form');

  let pendingActionRequired = false;

  loginForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const accountName = document.getElementById('setup-account').value;
    const password = document.getElementById('setup-password').value;
    const emailCode = document.getElementById('setup-email-code').value;
    const btn = document.getElementById('btn-setup-login');
    const emailGroup = document.getElementById('setup-email-code-group');
    
    btn.disabled = true;
    
    if (!isEmailVerified) {
      if (pendingActionRequired) {
        if (!emailCode) {
          showToast('Введіть код з пошти!', 'error');
          btn.disabled = false;
          return;
        }
        btn.textContent = 'Перевірка коду...';
        const submitRes = await api.submitCode({ accountName, code: emailCode });
        if (!submitRes.success) {
          showToast(`Помилка: ${submitRes.error}`, 'error');
          btn.disabled = false;
          btn.textContent = 'Продовжити';
          return;
        }
        isEmailVerified = true;
      } else {
        btn.textContent = 'Авторизація...';
        // Login to steam
        const loginRes = await api.login({ accountName, password });
        if (loginRes.actionRequired) {
          pendingActionRequired = true;
          emailGroup.style.display = 'block';
          document.getElementById('setup-email-code').required = true;
          btn.disabled = false;
          btn.textContent = 'Продовжити';
          showToast('Steam надіслав код на вашу пошту. Введіть його.', 'warning');
          return;
        } else if (!loginRes.success) {
          showToast(`Помилка логіну: ${loginRes.error}`, 'error');
          btn.disabled = false;
          btn.textContent = 'Продовжити';
          return;
        }
        isEmailVerified = true;
      }
    }
    
    btn.textContent = 'Створення Guard...';
    
    // Call setup:enable
    const enableRes = await api.setupEnable({ accountName });
    btn.disabled = false;
    btn.textContent = 'Продовжити';
    
    if (enableRes.success) {
      setupResponse = enableRes.response;
      document.getElementById('setup-revocation-code').textContent = setupResponse.revocation_code;
      
      const hint = document.getElementById('setup-confirm-hint');
      if (setupResponse.phone_number_hint) {
        hint.textContent = `Введіть код з SMS, надісланий на номер, що закінчується на ${setupResponse.phone_number_hint}.`;
      } else if (setupResponse.confirm_type == 3) {
        hint.textContent = 'Введіть код підтвердження, надісланий на ваш Email.';
      } else {
        hint.textContent = 'Введіть код підтвердження.';
      }
      
      switchSetupStep(2);
    } else {
      showToast(`Помилка: ${enableRes.error}`, 'error');
    }
  });

  savedCheckbox.addEventListener('change', (e) => {
    btnSaved.disabled = !e.target.checked;
  });

  btnSaved.addEventListener('click', () => {
    switchSetupStep(3);
  });

  finalizeForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const smsCode = document.getElementById('setup-sms-code').value;
    const accountName = document.getElementById('setup-account').value;
    const btn = document.getElementById('btn-setup-finalize');
    
    btn.disabled = true;
    btn.textContent = 'Перевірка...';
    
    const result = await api.setupFinalize({ accountName, response: setupResponse, smsCode });
    btn.disabled = false;
    btn.textContent = 'Завершити';
    
    if (result.success) {
      showToast('Steam Guard успішно прив\'язано!', 'success');
      // Reset forms
      loginForm.reset();
      finalizeForm.reset();
      savedCheckbox.checked = false;
      btnSaved.disabled = true;
      isEmailVerified = false; // reset for next setup
      pendingActionRequired = false;
      document.getElementById('setup-email-code-group').style.display = 'none';
      switchSetupStep(1);
      
      // Refresh accounts list globally
      const accRes = await api.loadAccounts();
      if (accRes.success) {
        accounts = accRes.accounts;
        updateAccountSelectors();
        renderAccountsList();
      }
      navigateTo('guard');
    } else {
      showToast(`Помилка: ${result.error}`, 'error');
    }
  });
}

function switchSetupStep(stepNum) {
  document.querySelectorAll('.setup-step').forEach(el => el.style.display = 'none');
  document.getElementById(`setup-step-${stepNum}`).style.display = 'block';
}

// ═══════════════════════════════════════════════════════
// Utilities
// ═══════════════════════════════════════════════════════
function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}
