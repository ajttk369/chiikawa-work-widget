const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('widget', Object.freeze({
  getState: () => ipcRenderer.invoke('widget:state'),
  getArtwork: () => ipcRenderer.invoke('widget:artwork'),
  action: action => ipcRenderer.invoke('widget:action', action),
  preview: mode => ipcRenderer.invoke('widget:preview', mode),
  saveSettings: settings => ipcRenderer.invoke('widget:settings', settings),
  onState: callback => {
    if (typeof callback !== 'function') return () => {};
    const listener = (_event, value) => callback(value);
    ipcRenderer.on('widget:update', listener);
    return () => ipcRenderer.removeListener('widget:update', listener);
  }
}));
