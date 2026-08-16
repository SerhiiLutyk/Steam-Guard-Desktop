const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('steamAuth', {
  // ─── Window Controls ───
  minimize: () => ipcRenderer.invoke('window:minimize'),
  maximize: () => ipcRenderer.invoke('window:maximize'),
  close: () => ipcRenderer.invoke('window:close'),

  // ─── TOTP / Steam Guard ───
  syncTime: () => ipcRenderer.invoke('totp:syncTime'),
  generateCode: (sharedSecret) => ipcRenderer.invoke('totp:generateCode', sharedSecret),
  getSecondsLeft: () => ipcRenderer.invoke('totp:getSecondsLeft'),

  // ─── Storage / Accounts ───
  initStorage: () => ipcRenderer.invoke('storage:init'),
  setPassword: (password) => ipcRenderer.invoke('storage:setPassword', password),
  loadAccounts: (password) => ipcRenderer.invoke('storage:loadAccounts', password),
  importMaFile: () => ipcRenderer.invoke('storage:importMaFile'),
  importMaFileFromPath: (filePath) => ipcRenderer.invoke('storage:importMaFileFromPath', filePath),
  getAccount: (accountName) => ipcRenderer.invoke('storage:getAccount', accountName),
  removeAccount: (accountName) => ipcRenderer.invoke('storage:removeAccount', accountName),
  exportMaFile: (accountName) => ipcRenderer.invoke('storage:exportMaFile', accountName),
  getAccountList: () => ipcRenderer.invoke('storage:getAccountList'),

  // ─── Steam Login ───
  login: (data) => ipcRenderer.invoke('auth:login', data),
  submitCode: (data) => ipcRenderer.invoke('auth:submitCode', data),
  getSession: (accountName) => ipcRenderer.invoke('auth:getSession', accountName),

  // ─── Setup New Steam Guard ───
  setupEnable: (data) => ipcRenderer.invoke('setup:enable', data),
  setupFinalize: (data) => ipcRenderer.invoke('setup:finalize', data),

  // ─── Confirmations ───
  fetchConfirmations: (data) => ipcRenderer.invoke('confirmations:fetch', data),
  respondToConfirmation: (data) => ipcRenderer.invoke('confirmations:respond', data),
  batchRespond: (data) => ipcRenderer.invoke('confirmations:batchRespond', data)
});
