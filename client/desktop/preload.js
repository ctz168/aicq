/**
 * AICQ Desktop — Electron Preload Script
 * Provides safe bridge between renderer and main process.
 */
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('aicqDesktop', {
  platform: process.platform,
  isElectron: true,
  version: process.versions.electron,
  minimize: () => ipcRenderer.invoke('window-minimize'),
  maximize: () => ipcRenderer.invoke('window-maximize'),
  close: () => ipcRenderer.invoke('window-close'),
});
