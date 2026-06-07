import { app, BrowserWindow, shell, Tray, Menu, nativeImage, dialog } from "electron";
import { spawn, spawnSync } from "child_process";
import net from "net";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

app.name = "Vortex";

// Single instance lock — must be called before app.whenReady()
const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
    app.quit();
    process.exit(0);
}

const ENGINE_PORT = Number(process.env.VORTEX_ENGINE_PORT || 3001);
const DASHBOARD_URL = process.env.VORTEX_DASHBOARD_URL || "https://vortex-movies.vercel.app";
let engineProcess = null;
let mainWindow = null;
let tray = null;
let engineRestartEnabled = true;  // set false on intentional quit
let engineRestartCount = 0;

// Auto-Start is configured inside whenReady() below

function getEnginePath() {
    if (app.isPackaged) {
        return path.join(process.resourcesPath, "engine", "vortex.exe");
    }

    const localExe = path.join(app.getAppPath(), "public", "downloads", "vortex.exe");
    if (fs.existsSync(localExe)) return localExe;

    return null;
}

function createSplashWindow() {
    const splash = new BrowserWindow({
        width: 880,
        height: 560,
        frame: false,
        resizable: false,
        minimizable: false,
        maximizable: false,
        fullscreenable: false,
        show: true,
        backgroundColor: "#09091f",
        webPreferences: {
            contextIsolation: true,
            sandbox: true,
        },
    });

    const html = `
    <!doctype html>
    <html>
      <head>
        <meta charset="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <style>
          :root { color-scheme: dark; }
          * { box-sizing: border-box; }
          body {
            margin: 0;
            min-height: 100vh;
            display: grid;
            place-items: center;
            font-family: Inter, system-ui, sans-serif;
            background:
              radial-gradient(circle at 20% 20%, rgba(124,106,255,0.26), transparent 26%),
              radial-gradient(circle at 80% 30%, rgba(31,214,163,0.22), transparent 24%),
              linear-gradient(160deg, #09091f 0%, #0b1020 55%, #09091f 100%);
            color: #fff;
            overflow: hidden;
          }
          .card {
            width: min(560px, calc(100vw - 48px));
            padding: 34px 32px;
            border-radius: 28px;
            border: 1px solid rgba(255,255,255,0.08);
            background: rgba(9, 9, 31, 0.72);
            backdrop-filter: blur(18px);
            box-shadow: 0 30px 100px rgba(0,0,0,0.45);
          }
          .row { display: flex; align-items: center; gap: 16px; }
          .logo {
            width: 56px; height: 56px; border-radius: 18px;
            display: grid; place-items: center;
            background: linear-gradient(135deg, #7c6aff 0%, #39a0ff 55%, #1fd6a3 100%);
            font-weight: 900; font-size: 24px;
            box-shadow: 0 20px 40px rgba(57,160,255,0.25);
          }
          h1 { margin: 0; font-size: 28px; line-height: 1.05; }
          p { margin: 10px 0 0; color: rgba(236,240,255,0.66); font-size: 14px; line-height: 1.6; }
          .bar {
            margin-top: 28px;
            height: 8px;
            border-radius: 999px;
            background: rgba(255,255,255,0.08);
            overflow: hidden;
          }
          .bar > div {
            width: 40%; height: 100%;
            border-radius: 999px;
            background: linear-gradient(90deg, #7c6aff, #39a0ff, #1fd6a3);
            animation: move 1.6s ease-in-out infinite;
          }
          .footer { margin-top: 18px; display: flex; justify-content: space-between; gap: 12px; font-size: 11px; color: rgba(236,240,255,0.45); letter-spacing: 0.16em; text-transform: uppercase; }
          @keyframes move {
            0% { transform: translateX(-120%); }
            50% { transform: translateX(80%); }
            100% { transform: translateX(220%); }
          }
        </style>
      </head>
      <body>
        <div class="card">
          <div class="row">
            <div class="logo">V</div>
            <div>
              <h1>Vortex</h1>
              <p>Starting desktop interface and hidden engine...</p>
            </div>
          </div>
          <div class="bar"><div></div></div>
          <div class="footer">
            <span>Private Torrent Management</span>
            <span>Loading secure session</span>
          </div>
        </div>
      </body>
    </html>
  `;

    splash.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`);
    return splash;
}

function waitForPort(port, host = "127.0.0.1", timeoutMs = 20000) {
    return new Promise(resolve => {
        const start = Date.now();

        const tryConnect = () => {
            const socket = net.createConnection({ port, host });
            socket.once("connect", () => {
                socket.end();
                resolve(true);
            });
            socket.once("error", () => {
                socket.destroy();
                if (Date.now() - start >= timeoutMs) {
                    resolve(false);
                    return;
                }
                setTimeout(tryConnect, 350);
            });
        };

        tryConnect();
    });
}

async function launchEngineHidden() {
    const enginePath = getEnginePath();
    const serverPath = path.join(app.getAppPath(), "server.mjs");

    const args = [];
    const isExe = enginePath && enginePath.toLowerCase().endsWith(".exe");

    let proc = null;
    if (enginePath && fs.existsSync(enginePath) && isExe) {
        proc = spawn(enginePath, args, {
            windowsHide: true,
            detached: false,
            stdio: "ignore",
            env: {
                ...process.env,
                VORTEX_PROD: "true",
                // Tell the engine it is inside the desktop shell — disables idle auto-shutdown
                VORTEX_DESKTOP_SHELL: "true",
            },
        });
    } else if (fs.existsSync(serverPath)) {
        const nodeBin = process.env.npm_node_execpath || process.execPath || "node";
        proc = spawn(nodeBin, [serverPath, ...args], {
            windowsHide: true,
            detached: false,
            stdio: "ignore",
            env: {
                ...process.env,
                VORTEX_PROD: "true",
                VORTEX_DESKTOP_SHELL: "true",
            },
        });
    } else {
        return null;
    }

    engineProcess = proc;

    // Auto-restart the engine if it exits unexpectedly (e.g., idle-shutdown after 10 min)
    proc.on('exit', (code, signal) => {
        console.log(`[Engine] Process exited (code=${code}, signal=${signal})`);
        engineProcess = null;

        if (!engineRestartEnabled) return;
        if (engineRestartCount >= 20) {
            console.error('[Engine] Too many restarts — giving up.');
            return;
        }

        const delay = Math.min(3000, 500 + engineRestartCount * 300);
        engineRestartCount++;
        console.log(`[Engine] Restarting in ${delay}ms (attempt ${engineRestartCount})...`);

        setTimeout(async () => {
            if (!engineRestartEnabled) return;
            await launchEngineHidden();
            // Wait for the port to come back up. Only credit the counter back when
            // the engine actually became reachable — otherwise a fast crash-loop
            // (e.g. port held by an orphan) would keep crediting itself and defeat
            // the give-up cap, spinning forever.
            const came_up = await waitForPort(ENGINE_PORT, '127.0.0.1', 15000);
            if (came_up) {
                engineRestartCount = Math.max(0, engineRestartCount - 1);
                if (tray) tray.setToolTip('Vortex — Engine running');
                console.log('[Engine] Restarted successfully.');
            } else {
                console.error('[Engine] Restart did not become reachable within timeout.');
                if (tray) tray.setToolTip('Vortex — Engine not responding');
            }
        }, delay);
    });

    proc.unref?.();
    return proc;
}

function createDesktopUiWindow(engineReady) {
    mainWindow = new BrowserWindow({
        width: 1280,
        height: 820,
        minWidth: 1080,
        minHeight: 720,
        backgroundColor: "#09091f",
        title: "Vortex",
        autoHideMenuBar: true,
        show: false,
        icon: app.isPackaged
            ? path.join(process.resourcesPath, 'app.asar', 'public', 'icon.png')
            : path.join(__dirname, '..', 'public', 'icon.png'),
        webPreferences: {
            // Hardened: the renderer (ui.html) is pure DOM + XHR with no Node usage,
            // so the secure defaults apply cleanly. nodeIntegration stays off.
            nodeIntegration: false,
            contextIsolation: true,
            sandbox: true,
            webSecurity: true,
        },
        titleBarOverlay: {
            color: "#09091f",
            symbolColor: "#ffffff",
            height: 34,
        },
    });

    mainWindow.webContents.setWindowOpenHandler(({ url }) => {
        shell.openExternal(url);
        return { action: "deny" };
    });

    mainWindow.webContents.on('render-process-gone', (_e, details) => {
        console.error('Renderer gone:', details.reason);
    });

    // Load the UI html file with runtime config passed as a query param. This is
    // robust under contextIsolation — the page reads config from location.search
    // rather than us reaching into the page's JS world via executeJavaScript.
    const uiPath = app.isPackaged
        ? path.join(process.resourcesPath, 'app.asar', 'electron', 'ui.html')
        : path.join(__dirname, 'ui.html');

    const config = {
        statusUrl: 'http://127.0.0.1:' + ENGINE_PORT + '/api/desktop-status',
        engineReady: engineReady,
        dashboardUrl: DASHBOARD_URL,
        enginePort: ENGINE_PORT,
    };

    mainWindow.loadFile(uiPath, { query: { vortexConfig: JSON.stringify(config) } })
        .catch(err => console.error('loadFile error:', err));

    mainWindow.on("closed", () => {
        mainWindow = null;
    });

    // Hide to tray on close instead of quitting
    mainWindow.on('close', function(event) {
        if (!app.isQuiting) {
            event.preventDefault();
            mainWindow.hide();
            return false;
        }
    });

    mainWindow.on("minimize", (event) => {
        event.preventDefault();
        mainWindow.hide();
    });

    mainWindow.once('ready-to-show', () => {
        // Visibility controlled by createWindow() — do not auto-show here.
    });
}


function getTrayIconPath() {
    // Packaged: icon lives at resources/icon.png (extraResource, outside ASAR)
    // Dev: use public/icon.png
    return app.isPackaged
        ? path.join(process.resourcesPath, 'icon.png')
        : path.join(__dirname, '..', 'public', 'icon.png');
}

function openMainWindow() {
    if (mainWindow) {
        if (mainWindow.isMinimized()) mainWindow.restore();
        mainWindow.show();
        mainWindow.focus();
    }
}

function buildTrayMenu() {
    return Menu.buildFromTemplate([
        {
            label: 'Open Vortex',
            click: () => openMainWindow()
        },
        { type: 'separator' },
        {
            label: 'Quit Vortex',
            click: () => { app.isQuiting = true; app.quit(); }
        }
    ]);
}

function setupTray() {
    const iconPath = getTrayIconPath();
    // Use icon if it exists, otherwise fall back to an empty image
    // (tray must ALWAYS be created so close-to-tray works)
    let icon;
    if (fs.existsSync(iconPath)) {
        icon = nativeImage.createFromPath(iconPath);
    } else {
        console.warn('Tray icon not found at', iconPath, '— using empty icon');
        icon = nativeImage.createEmpty();
    }

    tray = new Tray(icon);
    tray.setToolTip('Vortex — Engine starting...');
    tray.setContextMenu(buildTrayMenu());

    // Single click OR double-click opens the window
    tray.on('click', () => openMainWindow());
    tray.on('double-click', () => openMainWindow());
}

async function startEngine() {
    await launchEngineHidden();
    const engineReady = await waitForPort(ENGINE_PORT, '127.0.0.1', 20000);

    // Update tray tooltip to reflect engine state
    if (tray) {
        tray.setToolTip(engineReady ? 'Vortex — Engine running' : 'Vortex — Engine offline');
    }

    // Create main window (hidden until user clicks tray or opens normally)
    createDesktopUiWindow(engineReady);
}

async function createWindow() {
    const startHidden = process.argv.includes('--hidden');

    // Create tray FIRST so it shows immediately — even before the engine starts
    setupTray();

    if (startHidden) {
        // Auto-start on boot: no splash, no window — engine starts silently in bg
        startEngine(); // intentionally not awaited — runs in background
    } else {
        // Normal launch: show splash while engine starts
        const splash = createSplashWindow();
        await startEngine();
        if (!splash.isDestroyed()) splash.close();
        // Show the main window for normal (non-hidden) launches
        if (mainWindow) {
            mainWindow.show();
            mainWindow.focus();
        }
    }
}

app.commandLine.appendSwitch('disable-features', 'CalculateNativeWinOcclusion');
app.commandLine.appendSwitch('autoplay-policy', 'no-user-gesture-required');

// Protocol handler
if (process.defaultApp) {
    if (process.argv.length >= 2) {
        app.setAsDefaultProtocolClient('vortex', process.execPath, [path.resolve(process.argv[1])]);
    }
} else {
    app.setAsDefaultProtocolClient('vortex');
}

// second-instance must be registered before whenReady
app.on('second-instance', () => {
    console.log('App already running, bringing to focus');
    openMainWindow();
});

// Auto-update from GitHub releases. Only runs in packaged builds; the dependency
// is imported dynamically so a dev run (or a missing dep) never crashes startup.
async function setupAutoUpdate() {
    if (!app.isPackaged) return;
    try {
        const mod = await import('electron-updater');
        const autoUpdater = (mod.default || mod).autoUpdater;
        autoUpdater.autoDownload = true;
        autoUpdater.autoInstallOnAppQuit = true; // installs on next quit if user defers

        autoUpdater.on('update-downloaded', async (info) => {
            try {
                const { response } = await dialog.showMessageBox({
                    type: 'info',
                    buttons: ['Restart now', 'Later'],
                    defaultId: 0,
                    cancelId: 1,
                    title: 'Update ready',
                    message: `Vortex ${info?.version || ''} is ready to install.`,
                    detail: 'Restart to apply it now, or it will install automatically the next time you quit.',
                });
                if (response === 0) {
                    engineRestartEnabled = false; // let the engine die cleanly on quit
                    app.isQuiting = true;
                    autoUpdater.quitAndInstall();
                }
            } catch { /* ignore */ }
        });
        autoUpdater.on('error', (err) => console.error('[AutoUpdate] error:', err?.message || err));

        autoUpdater.checkForUpdates().catch(() => { });
        // Re-check every 6h for long-running sessions.
        setInterval(() => { autoUpdater.checkForUpdates().catch(() => { }); }, 6 * 60 * 60 * 1000);
    } catch (e) {
        console.error('[AutoUpdate] unavailable:', e?.message || e);
    }
}

app.whenReady().then(async () => {
    app.setName('Vortex');

    // Configure auto-start ONLY on first run. After that, respect whatever the
    // user has chosen (e.g. disabling the entry via Task Manager). Forcing
    // openAtLogin on every launch would silently re-enable a disabled entry.
    try {
        const flagPath = path.join(app.getPath('userData'), '.autostart-configured');
        if (!fs.existsSync(flagPath)) {
            app.setLoginItemSettings({
                openAtLogin: true,
                path: app.getPath('exe'),
                args: ['--hidden']
            });
            fs.writeFileSync(flagPath, '1');
        }
    } catch { /* ignore on unsupported platforms */ }

    await createWindow();

    setupAutoUpdate(); // check for app updates in the background (packaged only)

    app.on('activate', () => {
        // macOS: re-open window if dock icon clicked with no windows
        openMainWindow();
    });

    app.on('open-url', (event, url) => {
        console.log('Received URL:', url);
        event.preventDefault();
        openMainWindow();
    });
});

app.on('before-quit', () => {
    console.log('Before quit - cleaning up engine process');
    engineRestartEnabled = false; // Prevent auto-restart on intentional quit
    try {
        if (engineProcess && !engineProcess.killed && engineProcess.pid) {
            if (process.platform === 'win32') {
                // SIGTERM does not reliably kill a packaged (pkg) exe and its child
                // threads on Windows, leaving an orphan that holds port 3001.
                // taskkill /T terminates the whole process tree; /F forces it.
                spawnSync('taskkill', ['/pid', String(engineProcess.pid), '/T', '/F'], { windowsHide: true });
            } else {
                engineProcess.kill();
            }
        }
    } catch { /* ignore */ }
});

// Keep app alive in tray even with no windows
app.on('window-all-closed', () => {
    // Do NOT quit — stay alive in tray
});
