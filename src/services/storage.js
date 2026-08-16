const fs = require('fs');
const path = require('path');
const { app } = require('electron');
const cryptoService = require('./crypto-service');

class StorageService {
  constructor() {
    this.dataDir = null;
    this.accounts = new Map();
    this.encryptionPassword = null;
  }

  // Initialize storage directory
  init() {
    this.dataDir = path.join(app.getPath('userData'), 'accounts');
    if (!fs.existsSync(this.dataDir)) {
      fs.mkdirSync(this.dataDir, { recursive: true });
    }
  }

  // Set encryption password
  setPassword(password) {
    this.encryptionPassword = password;
  }

  // Check if any accounts exist
  hasAccounts() {
    if (!this.dataDir) this.init();
    const files = fs.readdirSync(this.dataDir).filter(f => f.endsWith('.maFile'));
    return files.length > 0;
  }

  // Check if master password is set
  hasPassword() {
    const configPath = path.join(app.getPath('userData'), 'config.json');
    if (!fs.existsSync(configPath)) return false;
    const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
    return !!config.encrypted;
  }

  // Save master password flag
  saveConfig(encrypted) {
    const configPath = path.join(app.getPath('userData'), 'config.json');
    fs.writeFileSync(configPath, JSON.stringify({ encrypted }, null, 2));
  }

  // Import a .maFile from a file path
  importMaFile(filePath) {
    let raw = fs.readFileSync(filePath, 'utf8');
    // Fix JavaScript precision loss for 64-bit SteamIDs
    raw = raw.replace(/"SteamID"\s*:\s*(\d+)/g, '"SteamID":"$1"');
    
    let maData;
    try {
      maData = JSON.parse(raw);
    } catch {
      throw new Error('Invalid .maFile format: not valid JSON');
    }

    if (!maData.shared_secret) {
      throw new Error('Invalid .maFile: missing shared_secret');
    }

    const accountName = maData.account_name || path.basename(filePath, '.maFile');
    this._saveAccount(accountName, maData);
    this.accounts.set(accountName, maData);
    return { accountName, steamId: maData.Session?.SteamID || null };
  }

  // Save account data to disk
  _saveAccount(accountName, data) {
    if (!this.dataDir) this.init();
    const filePath = path.join(this.dataDir, `${accountName}.maFile`);

    if (this.encryptionPassword) {
      const encrypted = cryptoService.encrypt(data, this.encryptionPassword);
      fs.writeFileSync(filePath, JSON.stringify(encrypted, null, 2));
    } else {
      fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
    }
  }

  // Load all accounts from disk
  loadAccounts() {
    if (!this.dataDir) this.init();
    this.accounts.clear();
    const files = fs.readdirSync(this.dataDir).filter(f => f.endsWith('.maFile'));

    for (const file of files) {
      const filePath = path.join(this.dataDir, file);
      let rawText = fs.readFileSync(filePath, 'utf8');
      rawText = rawText.replace(/"SteamID"\s*:\s*(\d+)/g, '"SteamID":"$1"');
      const raw = JSON.parse(rawText);

      let data;
      if (raw.encrypted && this.encryptionPassword) {
        try {
          data = cryptoService.decrypt(raw, this.encryptionPassword);
        } catch {
          continue; // Skip accounts that fail to decrypt
        }
      } else if (raw.shared_secret) {
        data = raw; // Unencrypted maFile
      } else {
        continue;
      }

      const accountName = data.account_name || path.basename(file, '.maFile');
      this.accounts.set(accountName, data);
    }

    return this.getAccountList();
  }

  // Get list of accounts (names + steamIds, no secrets)
  getAccountList() {
    const list = [];
    for (const [name, data] of this.accounts) {
      list.push({
        accountName: name,
        steamId: data.Session?.SteamID || null
      });
    }
    return list;
  }

  // Get account data by name
  getAccount(accountName) {
    return this.accounts.get(accountName) || null;
  }

  // Remove an account
  removeAccount(accountName) {
    const filePath = path.join(this.dataDir, `${accountName}.maFile`);
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }
    this.accounts.delete(accountName);
  }

  // Export maFile
  exportMaFile(accountName) {
    const data = this.accounts.get(accountName);
    if (!data) throw new Error('Account not found');
    return JSON.stringify(data, null, 2);
  }
}

module.exports = new StorageService();
