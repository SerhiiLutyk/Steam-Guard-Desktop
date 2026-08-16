const { app, BrowserWindow, ipcMain, dialog, Tray, Menu, nativeImage } = require('electron');
const path = require('path');
const fs = require('fs');

// Services
const totpService = require('./src/services/totp-service');
const storageService = require('./src/services/storage');
const confirmationsService = require('./src/services/confirmations');
const steamAuthService = require('./src/services/steam-auth');

const SteamCommunity = require('steamcommunity');
const SteamTotp = require('steam-totp');

let mainWindow;
let tray = null;
let isQuitting = false;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 460,
    height: 720,
    minWidth: 400,
    minHeight: 600,
    frame: false,
    transparent: false,
    backgroundColor: '#0e1621',
    icon: path.join(__dirname, 'src', 'assets', 'icon.png'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  });

  mainWindow.loadFile(path.join(__dirname, 'src', 'pages', 'index.html'));
  mainWindow.setMenuBarVisibility(false);

  mainWindow.on('close', (event) => {
    if (!isQuitting) {
      event.preventDefault();
      mainWindow.hide();
    }
  });
}

// ═══════════════════════════════════════════════════════
// Window controls (custom titlebar)
// ═══════════════════════════════════════════════════════
ipcMain.handle('window:minimize', () => mainWindow.minimize());
ipcMain.handle('window:maximize', () => {
  if (mainWindow.isMaximized()) {
    mainWindow.unmaximize();
  } else {
    mainWindow.maximize();
  }
});
ipcMain.handle('window:close', () => mainWindow.hide());

// ═══════════════════════════════════════════════════════
// TOTP / Steam Guard codes
// ═══════════════════════════════════════════════════════
ipcMain.handle('totp:syncTime', async () => {
  try {
    const result = await totpService.syncTime();
    confirmationsService.setTimeOffset(totpService.timeOffset);
    return { success: true, ...result };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

ipcMain.handle('totp:generateCode', (_, sharedSecret) => {
  try {
    const code = totpService.generateCode(sharedSecret);
    const secondsLeft = totpService.getSecondsUntilChange();
    return { success: true, code, secondsLeft };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

ipcMain.handle('totp:getSecondsLeft', () => {
  return totpService.getSecondsUntilChange();
});

// ═══════════════════════════════════════════════════════
// Storage / Account management
// ═══════════════════════════════════════════════════════
ipcMain.handle('storage:init', () => {
  storageService.init();
  return {
    hasAccounts: storageService.hasAccounts(),
    hasPassword: storageService.hasPassword()
  };
});

ipcMain.handle('storage:setPassword', (_, password) => {
  storageService.setPassword(password);
  storageService.saveConfig(!!password);
  return { success: true };
});

ipcMain.handle('storage:loadAccounts', (_, password) => {
  try {
    if (password) storageService.setPassword(password);
    const accounts = storageService.loadAccounts();
    return { success: true, accounts };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

ipcMain.handle('storage:importMaFile', async () => {
  try {
    const result = await dialog.showOpenDialog(mainWindow, {
      title: 'Import .maFile',
      filters: [
        { name: 'Steam Authenticator Files', extensions: ['maFile'] },
        { name: 'All Files', extensions: ['*'] }
      ],
      properties: ['openFile']
    });

    if (result.canceled || !result.filePaths.length) {
      return { success: false, canceled: true };
    }

    const imported = storageService.importMaFile(result.filePaths[0]);
    return { success: true, ...imported };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

ipcMain.handle('storage:importMaFileFromPath', (_, filePath) => {
  try {
    const imported = storageService.importMaFile(filePath);
    return { success: true, ...imported };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

ipcMain.handle('storage:getAccount', (_, accountName) => {
  const account = storageService.getAccount(accountName);
  if (!account) return { success: false, error: 'Account not found' };
  return { success: true, account };
});

ipcMain.handle('storage:removeAccount', (_, accountName) => {
  try {
    storageService.removeAccount(accountName);
    return { success: true };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

ipcMain.handle('storage:exportMaFile', async (_, accountName) => {
  try {
    const data = storageService.exportMaFile(accountName);
    const result = await dialog.showSaveDialog(mainWindow, {
      title: 'Export .maFile',
      defaultPath: `${accountName}.maFile`,
      filters: [
        { name: 'Steam Authenticator Files', extensions: ['maFile'] }
      ]
    });

    if (result.canceled) return { success: false, canceled: true };
    fs.writeFileSync(result.filePath, data);
    return { success: true, path: result.filePath };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

ipcMain.handle('storage:getAccountList', () => {
  return storageService.getAccountList();
});

// ═══════════════════════════════════════════════════════
// Steam Authentication (Login)
// ═══════════════════════════════════════════════════════
ipcMain.handle('auth:login', async (_, { accountName, password, sharedSecret }) => {
  try {
    const res = await steamAuthService.login(accountName, password, sharedSecret);
    if (res.actionRequired) return { success: true, actionRequired: true };
    return { success: true, session: { accountName: res.session.accountName, steamId: res.session.steamId } };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

ipcMain.handle('auth:submitCode', async (_, { accountName, code }) => {
  try {
    const res = await steamAuthService.submitSteamGuardCode(accountName, code);
    return { success: true, session: { accountName: res.session.accountName, steamId: res.session.steamId } };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

ipcMain.handle('auth:getSession', (_, accountName) => {
  const session = steamAuthService.getSession(accountName);
  if (!session) return { success: false };
  return { success: true, steamId: session.steamId };
});

// ═══════════════════════════════════════════════════════
// Confirmations (trades, market listings)
// ═══════════════════════════════════════════════════════
ipcMain.handle('confirmations:fetch', async (_, { accountName }) => {
  try {
    const account = storageService.getAccount(accountName);
    if (!account) return { success: false, error: 'Account not found' };

    const steamId = account.Session?.SteamID;
    const identitySecret = account.identity_secret;
    const deviceId = account.device_id;
    if (!steamId || !identitySecret) {
      return { success: false, error: 'Missing Session.SteamID or identity_secret in maFile' };
    }

    const cookies = steamAuthService.getCookies(accountName);
    if (!cookies) {
      return { success: false, error: 'Not logged in. Please login first.' };
    }

    const result = await confirmationsService.fetchConfirmations(steamId, identitySecret, deviceId, cookies);
    return result;
  } catch (err) {
    return { success: false, error: err.message };
  }
});

ipcMain.handle('confirmations:respond', async (_, { accountName, confirmationId, confirmationNonce, accept }) => {
  try {
    const account = storageService.getAccount(accountName);
    if (!account) return { success: false, error: 'Account not found' };

    const steamId = account.Session?.SteamID;
    const identitySecret = account.identity_secret;
    const deviceId = account.device_id;
    const cookies = steamAuthService.getCookies(accountName);

    if (!cookies) return { success: false, error: 'Not logged in' };

    const result = await confirmationsService.respondToConfirmation(
      steamId, identitySecret, deviceId, cookies, confirmationId, confirmationNonce, accept
    );
    return result;
  } catch (err) {
    return { success: false, error: err.message };
  }
});

// Batch accept/deny — this is the performance-critical operation
ipcMain.handle('confirmations:batchRespond', async (_, { accountName, confirmations, accept }) => {
  try {
    const account = storageService.getAccount(accountName);
    if (!account) return { success: false, error: 'Account not found' };

    const steamId = account.Session?.SteamID;
    const identitySecret = account.identity_secret;
    const deviceId = account.device_id;
    const cookies = steamAuthService.getCookies(accountName);

    if (!cookies) return { success: false, error: 'Not logged in' };

    const results = await confirmationsService.batchRespond(
      steamId, identitySecret, deviceId, cookies, confirmations, accept
    );
    return { success: true, results };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

// ═══════════════════════════════════════════════════════
// Setup New Steam Guard
// ═══════════════════════════════════════════════════════
const setupSessions = new Map(); // steamId -> SteamCommunity instance

ipcMain.handle('setup:enable', async (_, { accountName }) => {
  try {
    const session = steamAuthService.getSession(accountName);
    if (!session || !session.accessToken) {
      return { success: false, error: 'Not logged in or missing access token' };
    }
    
    const SteamCommunity = require('steamcommunity');
    const community = new SteamCommunity();
    community.steamID = new SteamCommunity.SteamID(session.steamId);
    community.setMobileAppAccessToken(session.accessToken);
    
    return new Promise((resolve) => {
      community.enableTwoFactor((err, response) => {
        if (err) {
          return resolve({ success: false, error: err.message === 'Fail' ? 'Не вдалося створити Steam Guard. Можливо, на акаунті не вистачає номеру телефону, або ви перевищили ліміт запитів.' : err.message });
        }
        if (response.status !== 1) {
          return resolve({ success: false, error: `Steam API Status ${response.status}` });
        }
        
        setupSessions.set(session.steamId, community);
        resolve({ success: true, response });
      });
    });
  } catch (err) {
    return { success: false, error: err.message };
  }
});

ipcMain.handle('setup:finalize', async (_, { accountName, response, smsCode }) => {
  try {
    const session = steamAuthService.getSession(accountName);
    if (!session || !session.steamId) return { success: false, error: 'Not logged in' };
    
    const community = setupSessions.get(session.steamId);
    if (!community) return { success: false, error: 'Setup session expired' };
    
    return new Promise((resolve) => {
      community.finalizeTwoFactor(response.shared_secret, smsCode, (err) => {
        if (err) {
          return resolve({ success: false, error: err.message });
        }
        
        setupSessions.delete(session.steamId);
        
        // Generate a standard .maFile and save it
        const maFile = {
          shared_secret: response.shared_secret,
          serial_number: response.serial_number,
          revocation_code: response.revocation_code,
          uri: response.uri,
          server_time: response.server_time,
          account_name: accountName,
          token_gid: response.token_gid,
          identity_secret: response.identity_secret,
          secret_1: response.secret_1,
          status: response.status,
          device_id: SteamTotp.getDeviceID(session.steamId),
          fully_enrolled: true,
          Session: {
            SessionID: "", // Steamcommunity cookies don't perfectly map to SDA session, but steamId does
            SteamLogin: "",
            SteamLoginSecure: "",
            WebCookie: "",
            OAuthToken: "",
            SteamID: session.steamId
          }
        };
        
        // Use our storage service to save it
        storageService._saveAccount(accountName, maFile);
        storageService.accounts.set(accountName, maFile);
        
        resolve({ success: true, maFile });
      });
    });
  } catch (err) {
    return { success: false, error: err.message };
  }
});

// ═══════════════════════════════════════════════════════
// App lifecycle
// ═══════════════════════════════════════════════════════
app.whenReady().then(async () => {
  createWindow();

  // Sync time with Steam on startup
  try {
    await totpService.syncTime();
    confirmationsService.setTimeOffset(totpService.timeOffset);
    console.log('[Steam Auth] Time synced, offset:', totpService.timeOffset);
  } catch (err) {
    console.warn('[Steam Auth] Time sync failed:', err.message);
  }

  // Restore login sessions automatically
  try {
    await steamAuthService.loadAndRestoreSessions();
    console.log('[Steam Auth] Sessions restored successfully');
  } catch (err) {
    console.warn('[Steam Auth] Session restore failed:', err.message);
  }

  // Create Tray
  const trayIconBase64 = 'iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9hAAAAAXNSR0IArs4c6QAAAARnQU1BAACxjwv8YQUAAAAJcEhZcwAADsQAAA7EAZUrDhsAAABcSURBVDhPY3iPz/6fCAw7gA2DYSAXgA3jE0RTgG4gugF4w6FuILpB6AbgNBTdAHSnoJsFNQh1b8HNgroL6mZB3Q2N3c2Cuhto7mYx3Cz0cAPN3EBT1yDU3YBhAADA273n35+VDAAAAABJRU5ErkJggg==';
  const trayIcon = nativeImage.createFromDataURL('data:image/png;base64,' + trayIconBase64);
  tray = new Tray(trayIcon);
  const contextMenu = Menu.buildFromTemplate([
    { label: 'Показати', click: () => mainWindow.show() },
    { label: 'Вихід', click: () => { isQuitting = true; app.quit(); } }
  ]);
  tray.setToolTip('Steam Guard Desktop');
  tray.setContextMenu(contextMenu);
  tray.on('click', () => mainWindow.show());
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});
