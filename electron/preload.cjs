// Preload bridge for the desktop UI (ui.html). The window runs sandboxed with
// contextIsolation, so the page has no Node access — this exposes a tiny, explicit
// API over IPC for the manual "Check for Updates" button and update status events.
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('vortexDesktop', {
    // Triggers an on-demand update check in the main process. Resolves with an
    // initial state ({ state: 'checking' | 'unavailable' | 'error' }); subsequent
    // progress arrives via onUpdateStatus.
    checkForUpdates: () => ipcRenderer.invoke('updater:check'),

    // Subscribe to update lifecycle events forwarded from the main process.
    // Returns an unsubscribe function.
    onUpdateStatus: (callback) => {
        const handler = (_event, data) => callback(data);
        ipcRenderer.on('updater:status', handler);
        return () => ipcRenderer.removeListener('updater:status', handler);
    },
});
