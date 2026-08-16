const { LoginSession, EAuthTokenPlatformType } = require('steam-session');
const SteamTotp = require('steam-totp');
const fs = require('fs');
const path = require('path');
const { app } = require('electron');

class SteamAuthService {
  constructor() {
    this.sessions = new Map(); // accountName -> session data
    this.pendingSessions = new Map(); // accountName -> LoginSession (for email codes)
    this.dataDir = null;
  }

  _initDir() {
    if (!this.dataDir) {
      this.dataDir = path.join(app.getPath('userData'), 'sessions');
      if (!fs.existsSync(this.dataDir)) {
        fs.mkdirSync(this.dataDir, { recursive: true });
      }
    }
  }

  _saveSessionToDisk(accountName, sessionData) {
    this._initDir();
    fs.writeFileSync(path.join(this.dataDir, `${accountName}.json`), JSON.stringify(sessionData, null, 2));
  }

  _removeSessionFromDisk(accountName) {
    this._initDir();
    const filePath = path.join(this.dataDir, `${accountName}.json`);
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }
  }

  // Login to Steam with credentials
  async login(accountName, password, sharedSecret) {
    const session = new LoginSession(EAuthTokenPlatformType.MobileApp);

    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error('Login timed out after 30 seconds'));
      }, 30000);

      session.on('authenticated', async () => {
        clearTimeout(timeout);
        try {
          const cookies = await session.getWebCookies();
          const sessionData = {
            accountName,
            steamId: session.steamID?.getSteamID64() || null,
            accessToken: session.accessToken,
            refreshToken: session.refreshToken,
            cookies: cookies.join('; '),
            authenticatedAt: Date.now()
          };
          this.sessions.set(accountName, sessionData);
          this._saveSessionToDisk(accountName, sessionData);
          this.pendingSessions.delete(accountName);
          resolve({ success: true, session: sessionData });
        } catch (err) {
          reject(err);
        }
      });

      session.on('timeout', () => {
        clearTimeout(timeout);
        reject(new Error('Steam login session timed out'));
      });

      session.on('error', (err) => {
        clearTimeout(timeout);
        reject(err);
      });

      const steamGuardCode = sharedSecret ? SteamTotp.generateAuthCode(sharedSecret) : undefined;

      session.startWithCredentials({
        accountName,
        password,
        steamGuardCode
      }).then(result => {
        if (result.actionRequired) {
          if (sharedSecret) {
            const code = SteamTotp.generateAuthCode(sharedSecret);
            session.submitSteamGuardCode(code).catch(reject);
          } else {
            // Need email code!
            clearTimeout(timeout);
            this.pendingSessions.set(accountName, session);
            resolve({ success: true, actionRequired: true });
          }
        }
      }).catch(err => {
        clearTimeout(timeout);
        reject(err);
      });
    });
  }

  // Submit email code for a pending login session
  async submitSteamGuardCode(accountName, code) {
    const session = this.pendingSessions.get(accountName);
    if (!session) throw new Error('No pending login session found for this account');

    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error('Login timed out after 30 seconds'));
      }, 30000);

      // We need to re-bind the authenticated event because the previous Promise resolved early
      session.removeAllListeners('authenticated');
      session.removeAllListeners('error');
      session.removeAllListeners('timeout');

      session.on('authenticated', async () => {
        clearTimeout(timeout);
        try {
          const cookies = await session.getWebCookies();
          const sessionData = {
            accountName,
            steamId: session.steamID?.getSteamID64() || null,
            accessToken: session.accessToken,
            refreshToken: session.refreshToken,
            cookies: cookies.join('; '),
            authenticatedAt: Date.now()
          };
          this.sessions.set(accountName, sessionData);
          this._saveSessionToDisk(accountName, sessionData);
          this.pendingSessions.delete(accountName);
          resolve({ success: true, session: sessionData });
        } catch (err) {
          reject(err);
        }
      });

      session.on('timeout', () => {
        clearTimeout(timeout);
        reject(new Error('Steam login session timed out'));
      });

      session.on('error', (err) => {
        clearTimeout(timeout);
        reject(err);
      });

      session.submitSteamGuardCode(code).catch(err => {
        clearTimeout(timeout);
        reject(err);
      });
    });
  }

  // Restore session from saved refresh token
  async restoreSession(accountName, refreshToken) {
    try {
      const session = new LoginSession(EAuthTokenPlatformType.MobileApp);
      session.refreshToken = refreshToken;

      const cookies = await session.getWebCookies();
      const sessionData = {
        accountName,
        steamId: session.steamID?.getSteamID64() || null,
        accessToken: session.accessToken,
        refreshToken: session.refreshToken,
        cookies: cookies.join('; '),
        authenticatedAt: Date.now()
      };
      this.sessions.set(accountName, sessionData);
      this._saveSessionToDisk(accountName, sessionData);
      return sessionData;
    } catch (err) {
      throw new Error(`Session restore failed: ${err.message}`);
    }
  }

  // Get session for an account
  getSession(accountName) {
    return this.sessions.get(accountName) || null;
  }

  // Get cookies string for an account
  getCookies(accountName) {
    const session = this.sessions.get(accountName);
    return session?.cookies || null;
  }

  // Check if a session is still valid (less than 24h old)
  isSessionValid(accountName) {
    const session = this.sessions.get(accountName);
    if (!session) return false;
    const age = Date.now() - session.authenticatedAt;
    return age < 24 * 60 * 60 * 1000; // 24 hours
  }

  // Logout (clear session)
  logout(accountName) {
    this.sessions.delete(accountName);
    this._removeSessionFromDisk(accountName);
  }

  // Load all saved sessions from disk and restore them automatically
  async loadAndRestoreSessions() {
    this._initDir();
    const files = fs.readdirSync(this.dataDir).filter(f => f.endsWith('.json'));
    
    for (const file of files) {
      try {
        const data = JSON.parse(fs.readFileSync(path.join(this.dataDir, file), 'utf8'));
        if (data.accountName && data.refreshToken) {
          // Restore the session using the saved refresh token
          await this.restoreSession(data.accountName, data.refreshToken);
        }
      } catch (err) {
        console.warn(`Failed to restore session from ${file}:`, err.message);
      }
    }
  }
}

module.exports = new SteamAuthService();
