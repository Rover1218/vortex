// Global Warning Filter (Silence library-level uTP warnings and system-level warnings during import)
const originalWarn = console.warn;
console.warn = (...args) => {
    if (args[0] && typeof args[0] === 'string' && args[0].includes('uTP')) return;
    originalWarn.apply(console, args);
};

// Suppress process-level warnings (like uTP not supported)
const originalEmitWarning = process.emitWarning;
process.emitWarning = (warning, ...args) => {
    if (typeof warning === 'string' && warning.includes('uTP')) return;
    if (warning && warning.message && warning.message.includes('uTP')) return;
    originalEmitWarning.call(process, warning, ...args);
};

import express from 'express';
import http from 'http';
import https from 'https';
import { Server } from 'socket.io';
import cors from 'cors';
import path from 'path';
import fs from 'fs';
import os from 'os';
import zlib from 'zlib';
import { execSync, spawn, spawnSync } from 'child_process';
// admin import removed for security (proxy approach)
import WebTorrentImport from 'webtorrent';
import pt from 'parse-torrent';

const parseTorrent = pt.default || pt;

const WebTorrentModule = WebTorrentImport.default || WebTorrentImport;

const VERSION = "0.1.8";
// For testing locally, it will try localhost:3000 if the Vercel site is not deployed with the proxy yet.
let PROXY_URL = 'https://vortex-movies.vercel.app/api/sync';

// Security: No longer embedding master keys. Engine uses user's Auth token to talk to Vercel proxy.
const __EMBEDDED_FIREBASE_CREDS__ = null;

// ─── Local API access control ───────────────────────────────────────────────
// The engine HTTP API is bound to loopback and only accepts requests from the
// known dashboard origins. Random websites in the user's browser cannot read
// responses or issue preflighted requests (delete/post) from disallowed origins.
const ALLOWED_ORIGINS = (process.env.VORTEX_ALLOWED_ORIGINS
    ? process.env.VORTEX_ALLOWED_ORIGINS.split(',').map(s => s.trim()).filter(Boolean)
    : ['https://vortex-movies.vercel.app', 'http://localhost:3000', 'http://127.0.0.1:3000']);

function isAllowedOrigin(origin) {
    // No Origin header → non-browser / same-origin / file:// (Electron) caller.
    // Since we bind to loopback only, such callers are local processes; allow them.
    return !origin || ALLOWED_ORIGINS.includes(origin);
}

const corsOptions = {
    // Non-throwing: disallowed origins simply receive no CORS headers (so the
    // browser blocks them from reading the response) rather than a 500 error.
    origin: (origin, cb) => cb(null, isAllowedOrigin(origin)),
    credentials: true,
};

// Firebase project this engine accepts tokens for. Used to reject forged/foreign
// tokens. Full cryptographic signature verification still happens at the proxy;
// this is a structural + claims gate so the local engine can't be driven by a
// trivially-forged "Bearer x".
const EXPECTED_PROJECT_ID = process.env.VORTEX_FIREBASE_PROJECT_ID || 'torrent-6cc35';

// Atomic JSON write: write to a temp file then rename over the target. Rename is
// atomic on the same volume, so a concurrent reader never sees a half-written or
// truncated file even if two writes race or the process dies mid-write. Without
// this, a torn write to torrents.json makes the whole list unparseable and the
// engine silently drops every saved torrent on next load.
function writeJsonAtomic(file, value) {
    const json = typeof value === 'string' ? value : JSON.stringify(value, null, 2);
    const tmp = `${file}.${process.pid}.tmp`;
    try {
        fs.writeFileSync(tmp, json);
        fs.renameSync(tmp, file);
    } catch {
        // Fallback to a direct write if the atomic rename is transiently blocked
        // (e.g. an AV/indexer lock on Windows). Still better than losing the data.
        try { fs.writeFileSync(file, json); } catch { /* ignore */ }
        try { if (fs.existsSync(tmp)) fs.unlinkSync(tmp); } catch { /* ignore */ }
    }
}

function validateFirebaseToken(token) {
    if (!token || typeof token !== 'string') return null;
    const parts = token.split('.');
    if (parts.length !== 3) return null;
    try {
        const payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf-8'));
        if (payload.aud !== EXPECTED_PROJECT_ID) return null;
        if (payload.iss !== `https://securetoken.google.com/${EXPECTED_PROJECT_ID}`) return null;
        if (!payload.sub || typeof payload.sub !== 'string') return null;
        const now = Math.floor(Date.now() / 1000);
        if (typeof payload.exp !== 'number' || payload.exp < now) return null;
        return payload;
    } catch {
        return null;
    }
}

const app = express();
const server = http.createServer(app);
let io = null;

// Defer Socket.IO initialization for pkg compatibility
function initializeSocketIO() {
    if (!io) {
        io = new Server(server, { cors: { origin: ALLOWED_ORIGINS, credentials: true } });
    }
    return io;
}

const RUNTIME_DIR = path.dirname(process.execPath || process.cwd());
const DATA_ROOT = process.env.APPDATA || path.join(os.homedir(), '.vortex');
const DATA_DIR = process.pkg ? path.join(DATA_ROOT, 'VortexEngine') : process.cwd();

if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

async function startServer() {
    console.log('\n----------------------------------------');
    console.log('   🌀 VORTEX ENGINE - STARTING UP...    ');
    console.log('----------------------------------------\n');

    // Initialize Socket.IO (deferred for pkg compatibility)
    initializeSocketIO();

    // ─── Private Network Access (PNA) preflight ──────────────────────────────
    // Chrome blocks requests from a public origin (the hosted dashboard) to the
    // loopback address space — "Permission was denied for this request to access
    // the `loopback` address space" — unless the preflight response carries
    // `Access-Control-Allow-Private-Network: true`. Neither the express `cors`
    // middleware nor Socket.IO's built-in CORS emit this header, so without it
    // EVERY request (socket.io polling AND the REST API) is blocked and the
    // dashboard shows "engine offline" even though the engine is running.
    //
    // Socket.IO/engine.io takes over the server's "request" event for its own
    // path and handles those preflights itself, so we can't add this via express
    // middleware alone. Instead we wrap the http server's request listeners and
    // stamp the header on every PNA preflight before delegating — covering both
    // the socket.io path and the express routes in one place.
    {
        const existingListeners = server.listeners('request').slice();
        server.removeAllListeners('request');
        server.on('request', (req, res) => {
            if (req.method === 'OPTIONS' && req.headers['access-control-request-private-network'] && isAllowedOrigin(req.headers.origin)) {
                res.setHeader('Access-Control-Allow-Private-Network', 'true');
            }
            for (const listener of existingListeners) listener.call(server, req, res);
        });
    }

    app.use(cors(corsOptions));
    app.use(express.json());

    // ─── Firebase Admin & Cloud Sync ───
    // ─── Firebase Proxy Setup ───
    let activeUserId = null;
    let activeUserToken = null; // Store for background syncs
    let lastSyncErrorStatus = null; // Track sync errors to silence spam
    const AUTH_CACHE_FILE = path.join(DATA_DIR, 'local-auth.json');
    const AUTH_TOKEN_FILE = path.join(DATA_DIR, 'local-token.json');

    if (fs.existsSync(AUTH_CACHE_FILE)) {
        activeUserId = JSON.parse(fs.readFileSync(AUTH_CACHE_FILE, 'utf-8')).uid;
        if (activeUserId) console.log('[System] ✓ Resuming session for UID:', activeUserId);
    }
    if (fs.existsSync(AUTH_TOKEN_FILE)) {
        try { activeUserToken = JSON.parse(fs.readFileSync(AUTH_TOKEN_FILE, 'utf-8')).token; } catch (e) { }
    }

    const SYNC_MIN_INTERVAL_MS = {
        settings: 1000,
        stats: 15000,
        torrents: 5000,
    };
    const syncQueueState = new Map();

    function getSyncFingerprint(data) {
        try {
            return JSON.stringify(data);
        } catch {
            return String(Date.now());
        }
    }

    async function syncToCloud(type, data) {
        if (!activeUserToken) return false;

        const trySync = async (url) => {
            try {
                const res = await fetch(url, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ token: activeUserToken, type, data })
                });
                return res;
            } catch (err) {
                return { ok: false, status: 'error', message: err.message };
            }
        };

        let response = await trySync(PROXY_URL);

        // 404 Fallback for Local Development
        if (!response.ok && (response.status === 404 || response.status === 'error')) {
            const localUrl = 'http://localhost:3000/api/sync';
            if (process.env.VORTEX_DEBUG) console.log(`[Sync] Primary 404/Error, trying local: ${localUrl}`);
            const localResponse = await trySync(localUrl);
            if (localResponse.ok) {
                if (process.env.VORTEX_DEBUG) console.log(`[Sync] ✓ ${type} synced to LOCAL cloud`);
                return true;
            }
            response = localResponse; // Use local error if both fail
        }

        if (response.ok) {
            if (process.env.VORTEX_DEBUG) console.log(`[Sync] ✓ ${type} synced to cloud`);
            lastSyncErrorStatus = null;
            return true;
        } else {
            const errData = response.json ? await response.json().catch(() => ({})) : {};
            const status = response.status;

            // Silence redundant 401/403 errors
            if (status === 401 || status === 403) {
                if (lastSyncErrorStatus === status) return;
                lastSyncErrorStatus = status;
                console.error(`[Sync] ⚠ Session expired (${status}). Please refresh your dashboard.`);
            } else {
                console.error(`[Sync] ✗ ${type} failed (${status}):`, errData.error || response.message || 'Unknown error');
            }
            return false;
        }
    }

    function queueSyncToCloud(type, data) {
        if (!activeUserToken) return;

        const minInterval = SYNC_MIN_INTERVAL_MS[type] ?? 0;
        const fingerprint = getSyncFingerprint(data);
        let state = syncQueueState.get(type);

        if (!state) {
            state = {
                timer: null,
                lastSentAt: 0,
                lastSentFingerprint: '',
                pendingData: null,
                pendingFingerprint: ''
            };
            syncQueueState.set(type, state);
        }

        state.pendingData = data;
        state.pendingFingerprint = fingerprint;

        if (state.timer) return;

        const scheduleDelay = Math.max(0, minInterval - (Date.now() - state.lastSentAt));
        const flush = async () => {
            state.timer = null;
            if (!state.pendingData) return;

            const payload = state.pendingData;
            const payloadFingerprint = state.pendingFingerprint;
            state.pendingData = null;
            state.pendingFingerprint = '';

            if (payloadFingerprint && payloadFingerprint === state.lastSentFingerprint) return;

            const ok = await syncToCloud(type, payload);
            if (ok) {
                state.lastSentAt = Date.now();
                state.lastSentFingerprint = payloadFingerprint;
            }

            if (state.pendingData) {
                const nextDelay = Math.max(0, minInterval - (Date.now() - state.lastSentAt));
                state.timer = setTimeout(flush, nextDelay);
            }
        };

        state.timer = setTimeout(flush, scheduleDelay);
    }

    function syncAllStateToCloud(reason = 'manual') {
        if (!activeUserToken) return;
        queueSyncToCloud('settings', settings);
        queueSyncToCloud('stats', lifetimeTotals);
        saveTorrentList();
        if (process.env.VORTEX_DEBUG) {
            console.log(`[Sync] Seeded full state to cloud (${reason})`);
        }
    }

    async function fetchFromCloud(type) {
        if (!activeUserToken) return null;
        try {
            const res = await fetch(`${PROXY_URL}?token=${encodeURIComponent(activeUserToken)}&type=${type}`);
            if (res.ok) return await res.json();
        } catch (err) {
            if (process.env.VORTEX_DEBUG) console.error(`[Sync] Fetch ${type} failed:`, err.message);
        }
        return null;
    }

    // ─── Windows Protocol Registration (Auto-Open) ───
    function registerProtocol() {
        // Disabled: Protocol handled exclusively by Electron Desktop Shell to prevent overwriting
        return;
    }

    // ─── Auto-Open Dashboard (Disabled on request, just logging URL) ───
    function logDashboardInfo() {
        const url = 'https://vortex-movies.vercel.app';
        console.log(`[System] Dashboard URL: ${url}`);
    }

    registerProtocol();
    logDashboardInfo();

    // ─── Idle Heartbeat (Auto-Close) ───
    // When running inside the Electron desktop shell (VORTEX_DESKTOP_SHELL=true),
    // skip idle auto-shutdown — Electron owns the process lifetime and will kill us
    // on app quit. Without this, the engine exits after 10 min with no socket
    // connections (the desktop shell uses HTTP polling, not sockets), causing the
    // "Offline — Network error" that appears after ~30-40 minutes.
    const IS_DESKTOP_SHELL = process.env.VORTEX_DESKTOP_SHELL === 'true';
    let idleTimer = null;
    function resetIdleTimer() {
        if (IS_DESKTOP_SHELL) return; // Electron manages lifetime — never idle-shutdown
        if (idleTimer) clearTimeout(idleTimer);
        idleTimer = setTimeout(() => {
            const socketCount = io ? io.engine.clientsCount : 0;
            // Keep the engine alive while anything is still downloading — closing the
            // dashboard tab must never kill in-progress downloads.
            const activeDownloads = (client?.torrents || []).filter(t => t && !t.paused && (t.progress || 0) < 1).length;
            if (socketCount === 0 && activeDownloads === 0) {
                console.log('\n[System] Idle for 10 minutes (no connections, no active downloads). Shutting down Vortex... 👋');
                process.exit(0);
            } else { resetIdleTimer(); }
        }, 600000); // 10 minutes
    }
    resetIdleTimer();

    // Auth Middleware (Simplified for Proxy approach)
    async function verifyUser(req, res, next) {
        const authHeader = req.headers.authorization;
        if (!authHeader || !authHeader.startsWith('Bearer ')) return res.status(401).json({ error: 'Unauthorized' });
        const token = authHeader.split('Bearer ')[1];

        // Structural + claims validation rejects forged/expired/foreign tokens.
        // The Proxy still performs full Firebase signature verification before
        // any cloud write; this gate protects the local engine API itself.
        if (!validateFirebaseToken(token)) return res.status(401).json({ error: 'Invalid or expired token' });

        const tokenChanged = activeUserToken !== token;
        activeUserToken = token;
        if (tokenChanged) {
            fs.writeFileSync(AUTH_TOKEN_FILE, JSON.stringify({ token }));
            lastSyncErrorStatus = null;
            hydrateSettingsFromCloud('http-auth').catch(() => { });
            setTimeout(() => syncAllStateToCloud('http-auth'), 250);
        }
        next();
    }

    // Socket.IO Auth Middleware
    io.use(async (socket, next) => {
        const token = socket.handshake.auth?.token;
        if (!token) return next(new Error('Unauthorized'));
        if (!validateFirebaseToken(token)) return next(new Error('Invalid or expired token'));
        const tokenChanged = activeUserToken !== token;
        activeUserToken = token;
        lastSyncErrorStatus = null; // Reset error state on new connection
        // Token just became available for this socket; hydrate cloud settings into engine memory.
        if (tokenChanged) {
            fs.writeFileSync(AUTH_TOKEN_FILE, JSON.stringify({ token }));
            hydrateSettingsFromCloud('socket-auth').catch(() => { });
            setTimeout(() => syncAllStateToCloud('socket-auth'), 250);
        }
        next();
    });

    io.on('connection', (socket) => {
        socket.on('update-token', (data) => {
            if (data?.token && validateFirebaseToken(data.token)) {
                if (process.env.VORTEX_DEBUG) console.log('[Engine] Token updated via socket');
                const tokenChanged = activeUserToken !== data.token;
                activeUserToken = data.token;
                lastSyncErrorStatus = null; // Reset error state
                if (tokenChanged) {
                    fs.writeFileSync(AUTH_TOKEN_FILE, JSON.stringify({ token: data.token }));
                    hydrateSettingsFromCloud('socket-update-token').catch(() => { });
                    setTimeout(() => syncAllStateToCloud('socket-update-token'), 250);
                }
            }
        });
    });

    // ─── Settings ───
    const SETTINGS_FILE = path.join(DATA_DIR, 'settings.json');
    const TORRENTS_FILE = path.join(DATA_DIR, 'torrents.json');
    const STATS_FILE = path.join(DATA_DIR, 'stats.json');
    const DEFAULT_SETTINGS = { downloadPath: path.join(DATA_DIR, 'downloads'), globalDownloadLimit: 0, globalUploadLimit: 0, opensubtitlesApiKey: '', tmdbApiKey: '', autoSubtitle: false, subtitleLang: 'en' };

    function normalizeSettings(raw = {}) {
        const toCleanString = (value, fallback = '') => {
            if (value === undefined || value === null) return fallback;
            return String(value).replace(/[\r\n\t]+/g, ' ').trim();
        };
        const toNonNegativeNumber = (value, fallback = 0) => {
            const n = Number(value);
            return Number.isFinite(n) && n >= 0 ? n : fallback;
        };

        const merged = { ...DEFAULT_SETTINGS, ...(raw || {}) };
        return {
            ...merged,
            downloadPath: toCleanString(merged.downloadPath, DEFAULT_SETTINGS.downloadPath),
            globalDownloadLimit: toNonNegativeNumber(merged.globalDownloadLimit, DEFAULT_SETTINGS.globalDownloadLimit),
            globalUploadLimit: toNonNegativeNumber(merged.globalUploadLimit, DEFAULT_SETTINGS.globalUploadLimit),
            opensubtitlesApiKey: toCleanString(merged.opensubtitlesApiKey, DEFAULT_SETTINGS.opensubtitlesApiKey),
            tmdbApiKey: toCleanString(merged.tmdbApiKey, DEFAULT_SETTINGS.tmdbApiKey),
            autoSubtitle: !!merged.autoSubtitle,
            subtitleLang: toCleanString(merged.subtitleLang, DEFAULT_SETTINGS.subtitleLang) || DEFAULT_SETTINGS.subtitleLang,
        };
    }

    let settings = normalizeSettings(DEFAULT_SETTINGS);
    let settingsHydrateInFlight = false;
    let lastSettingsHydrateAt = 0;

    function ensureSettingsFile() {
        try {
            if (!fs.existsSync(SETTINGS_FILE)) {
                const initialSettings = normalizeSettings(DEFAULT_SETTINGS);
                fs.writeFileSync(SETTINGS_FILE, JSON.stringify(initialSettings, null, 2));
                if (!fs.existsSync(initialSettings.downloadPath)) {
                    fs.mkdirSync(initialSettings.downloadPath, { recursive: true });
                }
                settings = initialSettings;
            }
        } catch (err) {
            console.error('[Settings] Failed to create default settings.json:', err.message);
        }
    }

    function ensureStateFiles() {
        try {
            if (!fs.existsSync(STATS_FILE)) {
                fs.writeFileSync(STATS_FILE, JSON.stringify({ downloaded: 0, seeded: 0 }, null, 2));
            }
            if (!fs.existsSync(TORRENTS_FILE)) {
                fs.writeFileSync(TORRENTS_FILE, JSON.stringify([], null, 2));
            }
        } catch (err) {
            console.error('[State] Failed to initialize stats/torrents files:', err.message);
        }
    }

    async function hydrateSettingsFromCloud(reason = 'manual') {
        if (!activeUserToken) return false;
        if (settingsHydrateInFlight) return false;
        // Avoid excessive cloud reads from repeated token updates.
        if (Date.now() - lastSettingsHydrateAt < 10000) return false;

        settingsHydrateInFlight = true;
        try {
            const cloudSettings = await fetchFromCloud('settings');
            if (!cloudSettings) {
                // First-time user path: no cloud settings yet, seed defaults/current local settings.
                queueSyncToCloud('settings', settings);
                lastSettingsHydrateAt = Date.now();
                if (process.env.VORTEX_DEBUG) {
                    console.log(`[Sync] No cloud settings found (${reason}) - seeded defaults to cloud`);
                }
                return false;
            }

            const nextSettings = normalizeSettings(cloudSettings);
            const changed = JSON.stringify(nextSettings) !== JSON.stringify(settings);
            if (changed) {
                settings = nextSettings;
                writeJsonAtomic(SETTINGS_FILE, settings);
                io.emit('settings-updated', settings);
                applyBandwidthLimits();
            }

            lastSettingsHydrateAt = Date.now();
            if (process.env.VORTEX_DEBUG) {
                console.log(`[Sync] Settings hydrated from cloud (${reason})${changed ? ' [updated]' : ' [no-change]'}`);
            }
            return true;
        } catch {
            return false;
        } finally {
            settingsHydrateInFlight = false;
        }
    }

    function loadSettingsFromDisk() {
        if (fs.existsSync(SETTINGS_FILE)) {
            try {
                const saved = JSON.parse(fs.readFileSync(SETTINGS_FILE, 'utf-8'));
                settings = normalizeSettings(saved);
                return;
            } catch {
                // Fall through and rewrite settings file below.
            }
        }
        saveSettings();
    }

    function loadSettings() {
        // Load local settings synchronously so startup logs and restored torrents
        // use the persisted download path right away.
        loadSettingsFromDisk();

        // Then hydrate from cloud in the background when available.
        hydrateSettingsFromCloud('startup').then((hydrated) => {
            if (!hydrated) return;
            console.log(`⚙ Settings synced from cloud: path=${settings.downloadPath} dl=${settings.globalDownloadLimit} ul=${settings.globalUploadLimit}`);
        });
    }
    function saveSettings() {
        settings = normalizeSettings(settings);
        writeJsonAtomic(SETTINGS_FILE, settings);
        if (!fs.existsSync(settings.downloadPath)) fs.mkdirSync(settings.downloadPath, { recursive: true });
        queueSyncToCloud('settings', settings);
    }
    ensureSettingsFile();
    ensureStateFiles();
    loadSettings();

    // ─── Torrent Persistence ───
    const completedTorrents = new Map();
    const pausedTorrents = new Map();
    const magnetsByHash = new Map(); // tracks original magnet URIs by infoHash
    const addedAtMap = new Map();   // tracks when each torrent was first added
    const namesMap = new Map();     // persistent name store — survives state transitions
    const pausedFilesByHash = new Map(); // tracks per-file paused state while torrent is active
    const ephemeralHashes = new Set();  // Quick-Watch torrents: streamed from a temp store, fetch-on-demand, never saved, auto-removed on stop
    // Quick-Watch temp store lives UNDER the user's chosen download path (same drive),
    // as a hidden ".stream-cache" folder — dot-prefixed so the Library/search/browse
    // scans skip it. Wiped once per session (clears crash leftovers); per-torrent
    // files are deleted on stop.
    let streamCacheCleaned = false;
    function streamTmpDir() {
        const dir = path.join(settings.downloadPath || DATA_DIR, '.stream-cache');
        if (!streamCacheCleaned) {
            try { fs.rmSync(dir, { recursive: true, force: true }); } catch { /* ignore */ }
            streamCacheCleaned = true;
        }
        try { fs.mkdirSync(dir, { recursive: true }); } catch { /* ignore */ }
        return dir;
    }
    let lifetimeTotals = { downloaded: 0, seeded: 0 };
    let lastLifetimeTickAt = Date.now();

    function toFiniteNonNegative(value) {
        const n = Number(value);
        return Number.isFinite(n) && n > 0 ? n : 0;
    }

    function loadLifetimeTotals() {
        if (fs.existsSync(STATS_FILE)) {
            try {
                const saved = JSON.parse(fs.readFileSync(STATS_FILE, 'utf-8'));
                lifetimeTotals.downloaded = toFiniteNonNegative(saved.downloaded);
                lifetimeTotals.seeded = toFiniteNonNegative(saved.seeded);
            } catch { }
        }
        // Stats are updated in saveLifetimeTotals
    }

    function saveLifetimeTotals() {
        lifetimeTotals.downloaded = toFiniteNonNegative(lifetimeTotals.downloaded);
        lifetimeTotals.seeded = toFiniteNonNegative(lifetimeTotals.seeded);
        writeJsonAtomic(STATS_FILE, lifetimeTotals);
        queueSyncToCloud('stats', lifetimeTotals);
    }

    function resolveUploaded(downloaded, uploaded, ratio) {
        const downloadedSafe = toFiniteNonNegative(downloaded);
        const uploadedSafe = Number(uploaded);
        if (Number.isFinite(uploadedSafe) && uploadedSafe >= 0) return uploadedSafe;
        const ratioSafe = toFiniteNonNegative(ratio);
        return Math.round(ratioSafe * downloadedSafe);
    }

    function accumulateLifetimeFromSpeeds(downloadSpeed, uploadSpeed, elapsedMs) {
        const seconds = Math.max(0, elapsedMs) / 1000;
        if (seconds <= 0) return;

        const dl = toFiniteNonNegative(downloadSpeed) * seconds;
        const ul = toFiniteNonNegative(uploadSpeed) * seconds;
        if (dl <= 0 && ul <= 0) return;

        lifetimeTotals.downloaded += dl;
        lifetimeTotals.seeded += ul;
        saveLifetimeTotals();
    }

    function archiveTorrentTransfer(hash, activeTorrent = null) {
        // Intentionally no-op.
        // Lifetime totals are measured from network transfer speed, not torrent progress snapshots.
    }

    loadLifetimeTotals();

    function getPausedFileSet(hash) {
        const existing = pausedFilesByHash.get(hash);
        if (existing) return existing;
        const created = new Set();
        pausedFilesByHash.set(hash, created);
        return created;
    }

    function applyPausedFileSelections(torrent) {
        if (!torrent?.infoHash || !torrent.files?.length) return;
        const pausedPaths = pausedFilesByHash.get(torrent.infoHash);
        if (!pausedPaths || pausedPaths.size === 0) return;

        for (const file of torrent.files) {
            if (!pausedPaths.has(file.path)) continue;
            try { file.deselect(); } catch { /* ignore per-file errors */ }
        }
    }

    // Extract display name from a magnet URI's dn= parameter
    function getNameFromMagnet(magnet) {
        if (!magnet) return null;
        const m = magnet.match(/[&?]dn=([^&]+)/i);
        return m ? decodeURIComponent(m[1].replace(/\+/g, ' ')) : null;
    }

    function parseInfoHashFromMagnet(magnet) {
        if (!magnet || typeof magnet !== 'string') return '';
        const m = magnet.match(/btih:([a-fA-F0-9]{40}|[A-Z2-7]{32})/i);
        return m ? String(m[1]).toLowerCase() : '';
    }

    function normalizeSavedTorrentEntry(entry) {
        if (!entry || typeof entry !== 'object') return null;

        const state = String(entry.state || '').trim().toLowerCase() || 'active';
        const magnet = entry.magnet ? String(entry.magnet).trim() : '';
        const infoHashRaw = entry.infoHash ? String(entry.infoHash).trim().toLowerCase() : '';
        const infoHash = infoHashRaw || parseInfoHashFromMagnet(magnet);
        const name = entry.name ? String(entry.name).trim() : '';
        const addedAt = Number(entry.addedAt) || 0;

        // Keep only entries we can reliably identify during restore.
        if (!infoHash && !magnet && !name) return null;

        return {
            ...entry,
            state,
            magnet,
            infoHash,
            name,
            addedAt
        };
    }

    function dedupeSavedTorrents(list) {
        const byKey = new Map();
        const statePriority = {
            active: 4,
            seeding: 3,
            paused: 2,
            completed: 1,
        };

        for (const raw of (Array.isArray(list) ? list : [])) {
            const item = normalizeSavedTorrentEntry(raw);
            if (!item) continue;

            const key = item.infoHash
                ? `hash:${item.infoHash}`
                : (item.magnet ? `magnet:${item.magnet}` : `name:${item.name}:${item.state}`);

            const existing = byKey.get(key);
            if (!existing) {
                byKey.set(key, item);
                continue;
            }

            const existingAddedAt = Number(existing.addedAt) || 0;
            const nextAddedAt = Number(item.addedAt) || 0;
            const existingPriority = statePriority[String(existing.state)] || 0;
            const nextPriority = statePriority[String(item.state)] || 0;

            const takeNext =
                nextAddedAt > existingAddedAt ||
                (nextAddedAt === existingAddedAt && nextPriority > existingPriority);

            const merged = {
                ...(takeNext ? existing : item),
                ...(takeNext ? item : existing),
                infoHash: item.infoHash || existing.infoHash || '',
                magnet: item.magnet || existing.magnet || '',
                name: item.name || existing.name || '',
                addedAt: Math.max(existingAddedAt, nextAddedAt)
            };

            byKey.set(key, merged);
        }

        return Array.from(byKey.values());
    }

    function loadLocalSavedTorrents() {
        if (!fs.existsSync(TORRENTS_FILE)) return [];
        try {
            const parsed = JSON.parse(fs.readFileSync(TORRENTS_FILE, 'utf-8'));
            return Array.isArray(parsed) ? parsed : [];
        } catch {
            return [];
        }
    }

    async function loadSavedTorrents() {
        const localTorrents = loadLocalSavedTorrents();
        const cloudRaw = await fetchFromCloud('torrents');
        const cloudTorrents = Array.isArray(cloudRaw) ? cloudRaw : [];

        const merged = dedupeSavedTorrents([...localTorrents, ...cloudTorrents]);

        // Keep local file resilient even when cloud is stale or missing recent updates.
        writeJsonAtomic(TORRENTS_FILE, merged);
        return merged;
    }

    function saveTorrentList() {
        const list = [];
        for (const t of client.torrents) {
            if (ephemeralHashes.has(t.infoHash)) continue; // Quick-Watch streams are never persisted
            const name = t.name || namesMap.get(t.infoHash) || getNameFromMagnet(magnetsByHash.get(t.infoHash));
            if (name) namesMap.set(t.infoHash, name);
            const uploadedNow = resolveUploaded(t.downloaded || 0, t.uploaded, t.ratio);
            if (t.progress === 1) {
                list.push({
                    name,
                    infoHash: t.infoHash,
                    state: 'seeding',
                    magnet: t.magnetURI || magnetsByHash.get(t.infoHash),
                    downloaded: t.downloaded,
                    uploaded: uploadedNow,
                    ratio: t.ratio || 0,
                    totalLength: t.length || 0,
                    addedAt: addedAtMap.get(t.infoHash) || Date.now()
                });
            } else {
                list.push({ magnet: t.magnetURI || magnetsByHash.get(t.infoHash), name, infoHash: t.infoHash, state: 'active', addedAt: addedAtMap.get(t.infoHash) || Date.now() });
            }
        }
        for (const [hash, data] of pausedTorrents.entries()) {
            const name = data.name || namesMap.get(hash) || getNameFromMagnet(data.magnet);
            list.push({ magnet: data.magnet, name, infoHash: hash, state: 'paused', progress: data.progress, downloaded: data.downloaded, totalLength: data.totalLength, addedAt: data.addedAt || Date.now() });
        }
        for (const [hash, data] of completedTorrents.entries()) {
            const name = data.name || namesMap.get(hash);
            list.push({
                name,
                infoHash: hash,
                state: 'completed',
                magnet: data.magnet || magnetsByHash.get(hash),
                downloaded: data.downloaded,
                uploaded: data.uploaded || 0,
                ratio: data.ratio || 0,
                totalLength: data.totalLength,
                addedAt: data.addedAt || Date.now()
            });
        }
        writeJsonAtomic(TORRENTS_FILE, list);
        queueSyncToCloud('torrents', list);
    }

    // ─── Search Engine ───
    let searchReady = true;

    // ─── Custom Providers (direct API) ───────────────────────────────────────────

    const TPB_TRACKERS = [
        'udp://tracker.opentrackr.org:1337/announce',
        'udp://open.tracker.cl:1337/announce',
        'udp://tracker.openbittorrent.com:6969/announce',
        'udp://open.demonii.com:1337/announce',
        'udp://tracker.bittor.pw:1337/announce',
        'udp://tracker.moeking.me:6969/announce',
        'udp://tracker.cyberia.is:6969/announce',
        'udp://tracker1.bt.moack.co.kr:80/announce',
        'udp://tracker2.dler.com:80/announce',
        'udp://tracker.torrent.eu.org:451/announce',
        'udp://explodie.org:6969/announce',
        'udp://tracker.uw0.xyz:6969/announce',
        'udp://opentor.org:2710/announce',
        'udp://tracker.leechers-paradise.org:6969/announce',
        'udp://tracker.tiny-vps.com:6969/announce',
        'http://tracker.tbp.pm:8080/announce',
        'udp://exodus.desync.com:6969/announce',
        'udp://tracker.internetwarriors.net:1337/announce',
        'udp://tracker2.dler.org:80/announce',
        'udp://tracker.ds.is:6969/announce',
        'udp://retracker.lanta-net.ru:2710/announce',
        'https://tracker.tamersunion.org:443/announce',
        'udp://movies.zsw.ca:6969/announce',
        'udp://tracker.srv00.com:6969/announce',
        'udp://tracker.leech.ie:1337/announce',
        'udp://sanincode.com:6969/announce',
        'udp://tracker.theoks.net:6969/announce',
    ];
    const TPB_TR_QUERY = TPB_TRACKERS.map(t => '&tr=' + encodeURIComponent(t)).join('');

    function mergeTrackers(...trackerLists) {
        const merged = [];
        const seen = new Set();
        for (const list of trackerLists) {
            for (const raw of (list || [])) {
                const tracker = String(raw || '').trim();
                if (!tracker) continue;
                const key = tracker.toLowerCase();
                if (seen.has(key)) continue;
                seen.add(key);
                merged.push(tracker);
            }
        }
        return merged;
    }

    function getAnnounceListForMagnet(magnet) {
        let magnetTrackers = [];
        try {
            const parsed = parseTorrent(magnet);
            if (parsed?.announce && Array.isArray(parsed.announce)) {
                magnetTrackers = parsed.announce;
            }
        } catch {
            // Ignore parse failures and fall back to our static tracker list.
        }
        // Keep the list bounded to avoid excessive tracker churn.
        return mergeTrackers(magnetTrackers, TPB_TRACKERS).slice(0, 50);
    }

    function getTorrentAddOptions(magnet, downloadPath) {
        return {
            path: downloadPath,
            announce: getAnnounceListForMagnet(magnet),
            maxWebConns: ENGINE_TORRENT_MAX_WEB_CONNS,
            uploads: ENGINE_TORRENT_UPLOAD_SLOTS,
        };
    }

    function buildMagnet(hash, name) {
        return `magnet:?xt=urn:btih:${hash}&dn=${encodeURIComponent(name)}${TPB_TR_QUERY}`;
    }

    function httpsGet(url, timeout = 9000) {
        return new Promise((resolve, reject) => {
            const req = https.get(url, {
                headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)', 'Accept': 'application/json, text/html, */*' },
                timeout
            }, (res) => {
                let data = '';
                res.on('data', chunk => data += chunk);
                res.on('end', () => resolve({ status: res.statusCode, body: data }));
            });
            req.on('error', reject);
            req.on('timeout', () => { req.destroy(); reject(new Error('timeout')); });
        });
    }

    function humanizeBytes(bytes) {
        const b = parseInt(bytes) || 0;
        if (b <= 0) return '?';
        const u = ['B', 'KB', 'MB', 'GB', 'TB'];
        const i = Math.min(Math.floor(Math.log(b) / Math.log(1024)), 4);
        return (b / Math.pow(1024, i)).toFixed(1) + ' ' + u[i];
    }

    // ── apibay.org (The Pirate Bay official API) ──────────────────────────────
    // cat codes: 0=All 100=Audio 200=Video 201=Movies 207=HDMovies 205=TV 208=HDTV 300=Apps 400=Games
    const APIBAY_CAT = {
        All: ['0'],
        Movies: ['207', '201'],
        'TV Shows': ['208', '205'],
        Music: ['100'],
        Applications: ['300'],
        Games: ['400'],
        Anime: ['0'],           // TPB has no anime cat, use all
    };

    async function searchApiBay(query, userCategory, providerLabel) {
        const cats = APIBAY_CAT[userCategory] || ['0'];
        const seen = new Set();
        const results = [];
        await Promise.all(cats.map(async cat => {
            try {
                const url = `https://apibay.org/q.php?q=${encodeURIComponent(query)}&cat=${cat}`;
                const { body } = await httpsGet(url);
                const data = JSON.parse(body);
                if (!Array.isArray(data)) return;
                for (const r of data) {
                    if (!r.info_hash || r.info_hash === '0000000000000000000000000000000000000000') continue;
                    const hash = r.info_hash.toLowerCase();
                    if (seen.has(hash)) continue;
                    seen.add(hash);
                    results.push({
                        _provider: providerLabel,
                        _magnet: buildMagnet(r.info_hash, r.name),
                        title: r.name,
                        seeds: parseInt(r.seeders) || 0,
                        peers: parseInt(r.leechers) || 0,
                        size: humanizeBytes(r.size),
                        time: r.added ? new Date(parseInt(r.added) * 1000).toUTCString() : '',
                        category: r.category,
                        uploader: r.username,
                        status: r.status,
                    });
                }
            } catch { /* ignore per-cat failures */ }
        }));
        return results;
    }

    // ── Nyaa.si (RSS – best for Anime, also subs/manga) ──────────────────────
    const NYAA_CAT = { Anime: '1_0', 'TV Shows': '1_0', All: '0_0', Music: '2_0', Applications: '6_0' };
    async function searchNyaa(query, userCategory) {
        const c = NYAA_CAT[userCategory] || '0_0';
        const url = `https://nyaa.si/?page=rss&q=${encodeURIComponent(query)}&c=${c}&f=0`;
        const { body } = await httpsGet(url);
        const items = [...body.matchAll(/<item>([\s\S]*?)<\/item>/g)];
        return items.slice(0, 30).map(m => {
            const x = m[1];
            const get = (tag) => { const r = x.match(new RegExp(`<${tag}[^>]*><!\\[CDATA\\[([\\s\\S]*?)\\]\\]><\\/${tag}>|<${tag}[^>]*>([^<]*)<\\/${tag}>`)); return r ? (r[1] || r[2] || '').trim() : ''; };
            const getAttr = (tag, attr) => { const r = x.match(new RegExp(`<nyaa:${tag}>([^<]*)<\/nyaa:${tag}>`)); return r ? r[1].trim() : ''; };
            const hash = x.match(/<nyaa:infoHash>([^<]+)<\/nyaa:infoHash>/)?.[1]?.trim() || '';
            const title = get('title');
            const magnet = x.match(/<nyaa:magnetLink>([^<]+)<\/nyaa:magnetLink>/)?.[1]?.trim()
                || (hash ? buildMagnet(hash, title) : null);
            if (!title || !magnet) return null;
            return {
                _provider: 'Nyaa',
                _magnet: magnet,
                title,
                seeds: parseInt(x.match(/<nyaa:seeders>(\d+)<\/nyaa:seeders>/)?.[1]) || 0,
                peers: parseInt(x.match(/<nyaa:leechers>(\d+)<\/nyaa:leechers>/)?.[1]) || 0,
                size: x.match(/<nyaa:size>([^<]+)<\/nyaa:size>/)?.[1]?.trim() || '?',
                time: get('pubDate'),
                category: x.match(/<nyaa:category>([^<]+)<\/nyaa:category>/)?.[1]?.trim() || 'Anime',
            };
        }).filter(Boolean);
    }

    // ── TorrentCSV — open DHT index, fast JSON API, broad coverage ───────────
    async function searchTorrentCSV(query) {
        const url = `https://torrents-csv.com/service/search?q=${encodeURIComponent(query)}&size=25`;
        let data = null;
        try {
            const { body } = await httpsGet(url, 8000);
            data = JSON.parse(body);
        } catch { return []; }
        return (data?.torrents || []).filter(t => t.infohash && t.name).map(t => ({
            _provider: 'TorrentCSV',
            _magnet: buildMagnet(t.infohash, t.name),
            title: t.name,
            seeds: t.seeders || 0,
            peers: t.leechers || 0,
            size: t.size_bytes ? humanizeBytes(t.size_bytes) : '?',
            time: t.created_unix ? new Date(t.created_unix * 1000).toUTCString() : '',
            category: 'All',
            uploader: '',
        }));
    }

    // ── AnimeTosho — anime-focused RSS index with magnets ────────────────────
    async function searchAnimeTosho(query) {
        const url = `https://feed.animetosho.org/api?q=${encodeURIComponent(query)}&only_tor=1`;
        let body = '';
        try {
            const r = await httpsGet(url, 8000);
            body = r.body;
        } catch { return []; }
        const items = [...body.matchAll(/<item>([\s\S]*?)<\/item>/g)];
        return items.slice(0, 30).map(m => {
            const x = m[1];
            const getCdata = tag => x.match(new RegExp(`<${tag}[^>]*>(?:<!\\[CDATA\\[)?([\\s\\S]*?)(?:\\]\\]>)?<\\/${tag}>`))?.[1]?.trim() || '';
            const getAttr = name => x.match(new RegExp(`<torznab:attr name="${name}" value="([^"]+)"`))?.[1] || '';
            const title = getCdata('title');
            const infohash = getAttr('infohash');
            // magnet may be in <link> or built from infohash
            const linkVal = getCdata('link');
            const magnet = (linkVal.startsWith('magnet:') ? linkVal : null) || (infohash ? buildMagnet(infohash, title) : null);
            if (!title || !magnet) return null;
            const sizeBytes = parseInt(getAttr('size')) || 0;
            return {
                _provider: 'AnimeTosho',
                _magnet: magnet,
                title,
                seeds: parseInt(getAttr('seeders')) || 0,
                peers: parseInt(getAttr('leechers')) || 0,
                size: sizeBytes ? humanizeBytes(sizeBytes) : '?',
                time: getCdata('pubDate'),
                category: 'Anime',
                uploader: '',
            };
        }).filter(Boolean);
    }

    // ── Torrentio (Stremio addon, aggregates many sources) ───────────────────
    // Torrentio is IMDB-id based, not keyword based, so we first resolve the
    // query to an IMDB id via TMDB. We support movies; TV series need a specific
    // season/episode that a plain name search can't provide, so TV is skipped.
    async function resolveImdbId(query) {
        // Primary: Stremio's Cinemeta — KEYLESS title→IMDB resolver in the same
        // ecosystem as Torrentio (one fast request, no API key needed).
        try {
            const url = `https://v3-cinemeta.strem.io/catalog/movie/top/search=${encodeURIComponent(query)}.json`;
            const { body } = await httpsGet(url, 7000);
            const metas = JSON.parse(body)?.metas || [];
            const hit = metas.find(m => typeof m?.id === 'string' && /^tt\d+$/.test(m.id));
            if (hit) return { imdbId: hit.id, type: 'movie' };
        } catch { /* fall through to TMDB */ }

        // Fallback: TMDB (only if a key is configured).
        if (settings.tmdbApiKey) {
            try {
                const searchUrl = `https://api.themoviedb.org/3/search/multi?api_key=${settings.tmdbApiKey}&query=${encodeURIComponent(query)}&include_adult=false`;
                const { body } = await httpsGet(searchUrl, 6000);
                const list = JSON.parse(body)?.results || [];
                const hit = list.find(r => (r.media_type === 'movie' || r.media_type === 'tv') && r.id);
                if (hit) {
                    const ext = await httpsGet(`https://api.themoviedb.org/3/${hit.media_type}/${hit.id}/external_ids?api_key=${settings.tmdbApiKey}`, 6000);
                    const imdbId = JSON.parse(ext.body)?.imdb_id;
                    if (imdbId && /^tt\d+$/.test(imdbId)) return { imdbId, type: hit.media_type };
                }
            } catch { /* ignore */ }
        }
        return null;
    }

    async function searchTorrentio(query) {
        const resolved = await resolveImdbId(query);
        if (!resolved || resolved.type !== 'movie') return [];
        let data;
        try {
            const { body } = await httpsGet(`https://torrentio.strem.fun/stream/movie/${resolved.imdbId}.json`, 9000);
            data = JSON.parse(body);
        } catch { return []; }
        const streams = Array.isArray(data?.streams) ? data.streams : [];
        const seen = new Set();
        const results = [];
        for (const s of streams) {
            const hash = (s.infoHash || '').toLowerCase();
            if (!hash || seen.has(hash)) continue;
            seen.add(hash);
            const fullTitle = s.title || s.name || '';
            const name = (fullTitle.split('\n')[0] || '').trim() || query;
            // Torrentio encodes seeders/size in the title, e.g. "👤 123 💾 2.1 GB ⚙ provider".
            const seeds = parseInt(fullTitle.match(/👤\s*(\d+)/)?.[1]) || 0;
            const size = fullTitle.match(/💾\s*([\d.]+\s*[KMGT]B)/i)?.[1]?.trim() || '?';
            results.push({
                _provider: 'Torrentio',
                _magnet: buildMagnet(s.infoHash, name),
                title: name,
                seeds,
                peers: 0,
                size,
                time: '',
                category: 'Movies',
                uploader: 'Torrentio',
            });
        }
        return results;
    }

    // ── Provider registry ─────────────────────────────────────────────────────
    const CUSTOM_PROVIDERS = [
        {
            name: 'ThePirateBay',
            search: (q, cat) => searchApiBay(q, cat, 'ThePirateBay'),
            categories: ['All', 'Movies', 'TV Shows', 'Music', 'Applications', 'Games', 'Anime'],
        },
        {
            name: 'TorrentCSV',
            search: (q, _cat) => searchTorrentCSV(q),
            categories: ['All', 'Movies', 'TV Shows', 'Anime', 'Music', 'Applications', 'Games'],
        },
        {
            name: 'AnimeTosho',
            search: (q, cat) => (['All', 'Anime', 'TV Shows'].includes(cat) ? searchAnimeTosho(q) : Promise.resolve([])),
            categories: ['All', 'Anime', 'TV Shows'],
        },
        {
            name: 'Nyaa',
            search: (q, cat) => searchNyaa(q, cat),
            categories: ['All', 'Anime', 'TV Shows', 'Music', 'Applications'],
        },
        {
            name: 'Torrentio',
            // Movies only (IMDB-based aggregator). Skips other categories to avoid
            // wasting the TMDB lookup on searches it can't serve.
            search: (q, cat) => (['All', 'Movies'].includes(cat) ? searchTorrentio(q) : Promise.resolve([])),
            categories: ['All', 'Movies'],
        },
    ];

    const enabledProviders = CUSTOM_PROVIDERS.map(p => p.name);
    console.log(`✓ Search providers (${enabledProviders.length}): ${enabledProviders.join(', ')}`);

    // Some environments inject invalid proxy values that break WebTorrent's HTTP stack.
    // Strip malformed proxy URLs so engine startup remains stable.
    const proxyEnvKeys = ['HTTP_PROXY', 'HTTPS_PROXY', 'ALL_PROXY', 'http_proxy', 'https_proxy', 'all_proxy'];
    for (const key of proxyEnvKeys) {
        const value = process.env[key];
        if (!value) continue;
        // WebTorrent in packaged runtimes can fail hard on proxy env parsing.
        // For desktop engine reliability, always disable inherited proxy vars.
        delete process.env[key];
        console.warn(`[Network] Ignoring ${key} from environment for engine stability.`);
    }

    const ENGINE_VERBOSE = process.env.VORTEX_DEBUG === '1';
    const ENGINE_MAX_CONNS = Math.max(120, Number(process.env.VORTEX_MAX_CONNS) || 800);
    const ENGINE_TORRENT_UPLOAD_SLOTS = Math.max(8, Number(process.env.VORTEX_UPLOAD_SLOTS) || 40);
    const ENGINE_TORRENT_MAX_WEB_CONNS = Math.max(20, Number(process.env.VORTEX_MAX_WEB_CONNS) || 120);

    // ─── WebTorrent Client ─── (tuned for higher seeding throughput)
    console.log('⏳ Initializing torrent engine...');
    const WebTorrent = WebTorrentModule; // Use the pre-imported module from top of file
    let client;
    try {
        client = new WebTorrent({
            maxConns: ENGINE_MAX_CONNS,
            dht: {
                bootstrap: [
                    'router.bittorrent.com:6881',
                    'router.utorrent.com:6881',
                    'dht.transmissionbt.com:6881',
                    'dht.libtorrent.org:25401'
                ]
            },
            lsd: true,
            natUpnp: true,
            natPmp: true,
            webSeeds: true,
            utp: false           // This runtime does not support uTP; force TCP-only transport
        });
    } catch (err) {
        console.warn('[WebTorrent] Primary init failed, retrying with safe defaults:', err.message);
        try {
            client = new WebTorrent({
                maxConns: 120,
                dht: false,
                lsd: false,
                natUpnp: false,
                natPmp: false,
                webSeeds: true,
                utp: false
            });
        } catch (retryErr) {
            console.warn('[WebTorrent] Safe init failed, retrying with bare defaults:', retryErr.message);
            client = new WebTorrent();
        }
    }
    // ─── Torrent Diagnostic Helper ───
    function attachDiagnosticListeners(torrent) {
        if (!torrent) return;
        const getDisplayName = () => torrent.name || namesMap.get(torrent.infoHash) || 'Unknown';
        const infoHash = torrent.infoHash;
        console.log(`[Engine] Attaching diagnostics: ${getDisplayName()} (${infoHash})`);
        const seenWireAddrs = new Set();
        let peerLogCount = 0;

        torrent.on('warning', (w) => {
            // Silence common cosmetic warnings if we are already discovering peers or have metadata
            const isTrackerIssue = w.message.includes('tracker') && (w.message.includes('timeout') || w.message.includes('ENOTFOUND'));
            const isDhtIssue = w.message.includes('No nodes to query');

            if (isTrackerIssue || isDhtIssue) {
                // If we have any wires connected or metadata resolved, hide the noise
                if (torrent.wires.length > 0 || torrent.name) return;
            }
            console.warn(`[Engine] Torrent warning (${getDisplayName() || infoHash}):`, w.message);
        });
        torrent.on('error', (e) => console.error(`[Engine] Torrent error (${getDisplayName() || infoHash}):`, e.message));
        torrent.on('metadata', () => console.log(`[Engine] ✓ Metadata fetched: ${torrent.name}`));

        torrent.on('peer', (addr) => {
            // Peer events can be extremely noisy; keep only a small sample unless debug is enabled.
            peerLogCount += 1;
            if (ENGINE_VERBOSE || peerLogCount <= 5 || peerLogCount % 50 === 0) {
                console.log(`[Engine] Peer found for ${torrent.name || infoHash}: ${addr}`);
            }
        });

        torrent.on('wire', (wire, addr) => {
            if (!ENGINE_VERBOSE && seenWireAddrs.has(addr)) return;
            seenWireAddrs.add(addr);
            console.log(`[Engine] Connected to wire: ${addr} for ${torrent.name || infoHash}`);
        });

        // Trackers are already handled in client.add({ announce: TPB_TRACKERS })
    }

    client.on('error', (err) => console.error('WebTorrent error:', err.message));
    client.on('torrent', (torrent) => {
        // This still fires when ready, but we use attachDiagnosticListeners for early setup
        console.log(`[Engine] Torrent ready: ${torrent.name} (${torrent.infoHash})`);
    });

    // Apply bandwidth limits — also propagates to currently active torrent wires
    function applyBandwidthLimits() {
        // -1 means unlimited in our internal logic
        const dlRate = settings.globalDownloadLimit > 0 ? Math.round(settings.globalDownloadLimit * 1024 * 1024) : -1;
        const ulRate = settings.globalUploadLimit > 0 ? Math.round(settings.globalUploadLimit * 1024 * 1024) : -1;

        // Use Infinity for unlimited to avoid throttle-group issues
        const dlRateSafe = dlRate < 0 ? Infinity : dlRate;
        const ulRateSafe = ulRate < 0 ? Infinity : ulRate;

        try { client.throttleDownload(dlRateSafe); } catch { }
        try { client.throttleUpload(ulRateSafe); } catch { }

        // Propagate to existing wires
        for (const torrent of client.torrents) {
            for (const wire of (torrent.wires || [])) {
                try {
                    if (wire._downloadThrottle?.setRate) wire._downloadThrottle.setRate(dlRateSafe);
                    if (wire._uploadThrottle?.setRate) wire._uploadThrottle.setRate(ulRateSafe);
                } catch { }
            }
        }

        const dlLabel = dlRate < 0 ? '∞' : settings.globalDownloadLimit + ' MB/s';
        const ulLabel = ulRate < 0 ? '∞' : settings.globalUploadLimit + ' MB/s';
        console.log(`⚡ Bandwidth: DL=${dlLabel} UL=${ulLabel}`);
    }
    applyBandwidthLimits();

    // Track restored torrents so auto-subtitle doesn't re-fire on server restart
    const restoredHashes = new Set();

    // Restore saved torrents
    loadSavedTorrents().then(savedTorrents => {
        if (savedTorrents.length > 0) {
            console.log(`Restoring ${savedTorrents.length} saved items...`);
            savedTorrents.forEach(st => {
                // Restore name into namesMap immediately so it's available everywhere
                if (st.infoHash && st.name) namesMap.set(st.infoHash, st.name);

                if (st.state === 'completed') {
                    completedTorrents.set(st.infoHash, {
                        name: st.name,
                        magnet: st.magnet,
                        downloaded: st.downloaded,
                        uploaded: st.uploaded || 0,
                        ratio: st.ratio || 0,
                        totalLength: st.totalLength,
                        addedAt: st.addedAt
                    });
                    if (st.magnet) magnetsByHash.set(st.infoHash, st.magnet);
                    restoredHashes.add(st.infoHash);
                    console.log(`  ✓ Completed: ${st.name}`);
                } else if (st.state === 'seeding' && st.magnet) {
                    if (st.infoHash) magnetsByHash.set(st.infoHash, st.magnet);
                    if (st.infoHash && st.addedAt) addedAtMap.set(st.infoHash, st.addedAt);
                    try {
                        const torrent = client.add(st.magnet, getTorrentAddOptions(st.magnet, settings.downloadPath), (torrent) => {
                            const resolvedName = torrent.name || st.name || getNameFromMagnet(st.magnet);
                            if (resolvedName) namesMap.set(torrent.infoHash, resolvedName);
                            console.log(`  ▶ Restored seeding: ${resolvedName || torrent.infoHash}`);
                            if (torrent.infoHash) {
                                magnetsByHash.set(torrent.infoHash, torrent.magnetURI || st.magnet);
                                if (!addedAtMap.has(torrent.infoHash)) addedAtMap.set(torrent.infoHash, st.addedAt || Date.now());
                            }
                        });
                        attachDiagnosticListeners(torrent);
                    } catch (err) {
                        console.error(`  ✗ Failed to restore seeding: ${err.message}`);
                        completedTorrents.set(st.infoHash, {
                            name: st.name,
                            magnet: st.magnet,
                            downloaded: st.downloaded || st.totalLength || 0,
                            uploaded: st.uploaded || 0,
                            ratio: st.ratio || 0,
                            totalLength: st.totalLength || st.downloaded || 0,
                            addedAt: st.addedAt
                        });
                    }
                } else if (st.state === 'paused') {
                    // Ensure paused torrents always have a valid magnet for resume
                    const savedMagnet = st.magnet || `magnet:?xt=urn:btih:${st.infoHash}`;
                    const savedName = st.name || getNameFromMagnet(savedMagnet) || 'Unknown';
                    const addedAt = st.addedAt || Date.now();
                    pausedTorrents.set(st.infoHash, { magnet: savedMagnet, name: savedName, progress: st.progress || '0', downloaded: st.downloaded || 0, totalLength: st.totalLength || 0, addedAt });
                    magnetsByHash.set(st.infoHash, savedMagnet);
                    addedAtMap.set(st.infoHash, addedAt);
                    console.log(`  \u23f8 Paused: ${savedName}`);
                } else if (st.magnet) {
                    if (st.infoHash) magnetsByHash.set(st.infoHash, st.magnet);
                    if (st.infoHash && st.addedAt) addedAtMap.set(st.infoHash, st.addedAt);
                    try {
                        const torrent = client.add(st.magnet, getTorrentAddOptions(st.magnet, settings.downloadPath), (torrent) => {
                            const resolvedName = torrent.name || st.name || getNameFromMagnet(st.magnet);
                            if (resolvedName) namesMap.set(torrent.infoHash, resolvedName);
                            console.log(`  ✓ Restored: ${resolvedName || torrent.infoHash}`);
                            if (torrent.infoHash) {
                                magnetsByHash.set(torrent.infoHash, torrent.magnetURI || st.magnet);
                                if (!addedAtMap.has(torrent.infoHash)) addedAtMap.set(torrent.infoHash, st.addedAt || Date.now());
                            }
                        });
                        attachDiagnosticListeners(torrent);
                    } catch (err) { console.error(`  \u2717 Failed: ${err.message}`); }
                }
            });

            // Force an immediate sync to Firestore so local data migrates to the cloud instantly
            setTimeout(() => {
                saveTorrentList();
            }, 2000);
        }
    }).catch(console.error);

    // ─── Real-Time Status Broadcast ───
    setInterval(() => {
        // Continuously account true network bytes transferred since last tick.
        const now = Date.now();
        const elapsedMs = now - lastLifetimeTickAt;
        lastLifetimeTickAt = now;
        accumulateLifetimeFromSpeeds(client.downloadSpeed || 0, client.uploadSpeed || 0, elapsedMs);

        const activeTorrents = client.torrents.filter(t => !ephemeralHashes.has(t.infoHash)).map(t => ({
            uploaded: resolveUploaded(t.downloaded || 0, t.uploaded, t.ratio) || 0,
            infoHash: t.infoHash,
            name: t.name || namesMap.get(t.infoHash) || getNameFromMagnet(magnetsByHash.get(t.infoHash)) || 'Loading metadata...',
            progress: (t.progress * 100).toFixed(2),
            downloadSpeed: t.downloadSpeed || 0, uploadSpeed: t.uploadSpeed || 0,
            numPeers: t.numPeers || 0, timeRemaining: t.timeRemaining || 0,
            downloaded: t.downloaded || 0, totalLength: t.length || 0,
            ratio: t.ratio || 0, status: t.progress === 1 ? 'Seeding' : 'Downloading'
        }));

        const paused = Array.from(pausedTorrents.entries()).map(([hash, data]) => ({
            infoHash: hash,
            name: data.name || namesMap.get(hash) || getNameFromMagnet(data.magnet) || 'Unknown',
            progress: data.progress || '0.00',
            downloadSpeed: 0, uploadSpeed: 0, numPeers: 0, timeRemaining: 0,
            downloaded: data.downloaded || 0, uploaded: 0, totalLength: data.totalLength || 0, ratio: 0, status: 'Paused'
        }));

        const completed = Array.from(completedTorrents.entries()).map(([hash, data]) => ({
            infoHash: hash,
            name: data.name || namesMap.get(hash) || 'Unknown',
            progress: '100.00',
            downloadSpeed: 0, uploadSpeed: 0, numPeers: 0, timeRemaining: 0,
            downloaded: data.downloaded || 0,
            uploaded: data.uploaded || 0,
            totalLength: data.totalLength || data.downloaded || 0,
            ratio: data.ratio || 0,
            status: 'Completed'
        }));

        io.emit('torrent-status', {
            torrents: [...activeTorrents, ...paused, ...completed],
            totalDownloadSpeed: client.downloadSpeed || 0,
            totalUploadSpeed: client.uploadSpeed || 0,
            lifetimeTotals,
            settings,
            engineVersion: VERSION
        });
    }, 1000);

    // ═══════════════════════════════════
    //  API ROUTES
    // ═══════════════════════════════════

    // Read-only status for the Electron desktop panel, which loads from a
    // file:// origin (serialized as "null"). Allow any origin here since the
    // payload is non-sensitive status and the server is bound to loopback.
    app.get('/api/desktop-status', cors({ origin: '*' }), (req, res) => {
        const torrents = Array.isArray(client?.torrents) ? client.torrents : [];
        const activeCount = torrents.filter(t => t?.progress > 0 && t?.progress < 1).length;
        const seedingCount = torrents.filter(t => t?.progress === 1).length;
        const pausedCount = pausedTorrents.size;
        const completedCount = completedTorrents.size;
        const downloadSpeed = client?.downloadSpeed || 0;
        const uploadSpeed = client?.uploadSpeed || 0;

        res.json({
            ok: true,
            engineVersion: VERSION,
            connected: true,
            downloadPath: settings.downloadPath,
            totalDownloadSpeed: downloadSpeed,
            totalUploadSpeed: uploadSpeed,
            torrentCount: torrents.length + pausedCount + completedCount,
            activeCount,
            seedingCount,
            pausedCount,
            completedCount,
            lifetimeTotals,
            topDownloads: torrents.slice(0, 5).map(t => ({
                name: t.name || namesMap.get(t.infoHash) || getNameFromMagnet(magnetsByHash.get(t.infoHash)) || 'Loading metadata...',
                progress: Math.round((t.progress || 0) * 100),
                status: t.progress === 1 ? 'Seeding' : 'Downloading',
                downloaded: t.downloaded || 0,
                totalLength: t.length || 0,
            })),
        });
    });

    app.get('/api/settings', verifyUser, (req, res) => res.json(settings));
    app.post('/api/settings', verifyUser, (req, res) => {
        settings = normalizeSettings({ ...settings, ...(req.body || {}) });
        saveSettings();
        applyBandwidthLimits();
        // Emit updated settings immediately to all connected clients
        io.emit('settings-updated', settings);
        console.log(`⚙ Settings saved: path=${settings.downloadPath} dl=${settings.globalDownloadLimit} ul=${settings.globalUploadLimit}`);
        res.json(settings);
    });

    // Watch settings.json for external edits (e.g. manual file edit)
    const SETTINGS_FILENAME = path.basename(SETTINGS_FILE);
    fs.watch(DATA_DIR, { persistent: false }, (eventType, filename) => {
        if (!filename || filename.toString() !== SETTINGS_FILENAME) return;
        if (eventType !== 'change' && eventType !== 'rename') return;

        try {
            if (!fs.existsSync(SETTINGS_FILE)) {
                ensureSettingsFile();
                return;
            }

            const saved = JSON.parse(fs.readFileSync(SETTINGS_FILE, 'utf-8'));
            settings = normalizeSettings(saved);
            applyBandwidthLimits();
            io.emit('settings-updated', settings);
            console.log('⚙ Settings reloaded from file');
        } catch {
            // Ignore transient file-write timing and parse errors.
        }
    });

    app.get('/api/disk', verifyUser, (req, res) => {
        try {
            fs.statfs(settings.downloadPath, (err, stats) => {
                if (err) {
                    const t = os.totalmem();
                    return res.json({ total: t, free: os.freemem(), used: t - os.freemem(), path: settings.downloadPath });
                }
                const total = stats.blocks * stats.bsize;
                const free = stats.bfree * stats.bsize;
                res.json({ total, free, used: total - free, path: settings.downloadPath });
            });
        } catch (err) { res.status(500).json({ error: err.message }); }
    });

    app.get('/api/browse', verifyUser, (req, res) => {
        let targetPath = req.query.path || (process.platform === 'win32' ? 'C:\\' : '/');
        if (targetPath === 'drives') {
            const drives = [];
            try {
                if (process.platform === 'win32') {
                    const output = execSync('powershell -Command "Get-PSDrive -PSProvider FileSystem | Select-Object -ExpandProperty Root"', { encoding: 'utf-8', timeout: 5000 });
                    output.split('\n').map(l => l.trim()).filter(l => /^[A-Z]:/i.test(l)).forEach(d => {
                        const dp = d.endsWith('\\') ? d : d + '\\';
                        drives.push({ name: dp, path: dp, isDir: true });
                    });
                }
            } catch { }
            if (drives.length === 0) {
                for (const l of 'CDEFGHIJKLMNOPQRSTUVWXYZ') {
                    const dp = l + ':\\';
                    try { fs.accessSync(dp); drives.push({ name: dp, path: dp, isDir: true }); } catch { }
                }
            }
            return res.json({ current: 'drives', parent: null, items: drives });
        }
        try {
            const entries = fs.readdirSync(targetPath, { withFileTypes: true });
            const dirs = entries.filter(e => { try { return e.isDirectory(); } catch { return false; } })
                .filter(e => !e.name.startsWith('.') && !e.name.startsWith('$') && e.name !== 'System Volume Information')
                .map(e => ({ name: e.name, path: path.join(targetPath, e.name), isDir: true }))
                .sort((a, b) => a.name.localeCompare(b.name));
            const parent = path.dirname(targetPath);
            res.json({ current: targetPath, parent: parent !== targetPath ? parent : (process.platform === 'win32' ? 'drives' : null), items: dirs });
        } catch (err) { res.status(400).json({ error: err.message }); }
    });

    // ─── Library Delete ───
    app.delete('/api/library/delete', verifyUser, (req, res) => {
        const targetPath = req.query.path;
        if (!targetPath) return res.status(400).json({ error: 'path required' });
        // Safety: must be the download dir itself or strictly nested under it.
        // A plain startsWith() check is unsafe — "F:\Downloads-evil" would pass a
        // prefix test against "F:\Downloads"; requiring the path separator fixes it.
        const base = path.resolve(settings.downloadPath);
        const resolved = path.resolve(targetPath);
        const isContained = resolved === base || resolved.startsWith(base + path.sep);
        if (!isContained) {
            return res.status(403).json({ error: 'Path outside download directory' });
        }
        try {
            if (!fs.existsSync(resolved)) return res.json({ success: true, note: 'already gone' });
            const stat = fs.statSync(resolved);
            if (stat.isDirectory()) {
                fs.rmSync(resolved, { recursive: true, force: true });
            } else {
                fs.unlinkSync(resolved);
            }
            console.log('🗑 Library delete:', resolved);
            res.json({ success: true });
        } catch (err) {
            console.error('Library delete error:', err.message);
            res.status(500).json({ error: err.message });
        }
    });

    // ─── Library ───
    function scanLibraryItems() {
        const dlPath = settings.downloadPath;
        if (!fs.existsSync(dlPath)) return [];
        const VIDEO_EXT = new Set(['.mkv', '.mp4', '.avi', '.mov', '.wmv', '.flv', '.webm', '.m4v', '.mpg', '.mpeg', '.ts', '.m2ts']);
        const AUDIO_EXT = new Set(['.mp3', '.flac', '.aac', '.ogg', '.wav', '.m4a', '.opus', '.wma']);
        const APP_EXT = new Set(['.exe', '.msi', '.dmg', '.deb', '.rpm', '.apk', '.ipa', '.zip', '.rar', '.7z', '.tar', '.gz']);

        const getCategory = (name) => {
            const ext = path.extname(name).toLowerCase();
            if (VIDEO_EXT.has(ext)) return 'Video';
            if (AUDIO_EXT.has(ext)) return 'Audio';
            if (APP_EXT.has(ext)) return 'App/Archive';
            return 'Other';
        };

        const JUNK_NAMES = new Set([
            'thanks', 'thank you', 'sample', 'samples', 'extras', 'extra',
            'bonus', 'featurettes', 'behindthescenes', 'deleted scenes',
            'interviews', 'scenes', 'shorts', 'trailers', 'specials',
            'subs', 'subtitles', 'sub', 'nfo', 'proof'
        ]);

        const walk = (dir, depth = 0) => {
            if (depth > 2) return [];
            let results = [];
            try {
                const entries = fs.readdirSync(dir, { withFileTypes: true });
                for (const e of entries) {
                    if (e.name.startsWith('.') || e.name === '$RECYCLE.BIN') continue;
                    if (JUNK_NAMES.has(e.name.toLowerCase())) continue;
                    const fullPath = path.join(dir, e.name);
                    try {
                        const stat = fs.statSync(fullPath);
                        if (e.isDirectory()) {
                            // For folders, find the largest video file inside (recursively or just one level)
                            // to help with poster fetching
                            let bestVideo = null;
                            try {
                                const subEntries = fs.readdirSync(fullPath, { withFileTypes: true });
                                let maxS = -1;
                                for (const se of subEntries) {
                                    if (se.isFile() && VIDEO_EXT.has(path.extname(se.name).toLowerCase())) {
                                        const ss = fs.statSync(path.join(fullPath, se.name)).size;
                                        if (ss > maxS) { maxS = ss; bestVideo = se.name; }
                                    }
                                }
                            } catch { }

                            results.push({
                                name: e.name, path: fullPath, isDir: true,
                                size: 0, modified: stat.mtime.toISOString(), category: 'Folder',
                                representativeName: bestVideo || e.name
                            });
                            results = results.concat(walk(fullPath, depth + 1));
                        } else {
                            const cat = getCategory(e.name);
                            if (depth === 0 || cat !== 'Other') {
                                results.push({
                                    name: e.name, path: fullPath, isDir: false,
                                    size: stat.size, modified: stat.mtime.toISOString(), category: cat
                                });
                            }
                        }
                    } catch { }
                }
            } catch { }
            return results;
        };

        return walk(dlPath, 0);
    }

    function normalizeSearchName(name) {
        return (name || '')
            .replace(/\.(mkv|mp4|avi|mov|wmv|flv|webm|m4v|mpg|mpeg|ts|m2ts|zip|rar|7z)$/i, '')
            .replace(/[._]/g, ' ')
            .replace(/\b(720p|1080p|2160p|4k|bluray|brrip|bdrip|webrip|web[-. ]?dl|x264|x265|hevc|avc|xvid|hdr|dv|dts|aac|ac3|remux|repack|proper|extended)\b/gi, ' ')
            .replace(/\[[^\]]+\]/g, ' ')
            .replace(/\([^\)]*\)/g, ' ')
            .replace(/\s+/g, ' ')
            .trim()
            .toLowerCase();
    }

    function normalizeReleaseName(name) {
        return (name || '')
            .replace(/\.(mkv|mp4|avi|mov|wmv|flv|webm|m4v|mpg|mpeg|ts|m2ts|zip|rar|7z)$/i, '')
            .replace(/[._\-\[\]\(\)]+/g, ' ')
            .replace(/\s+/g, ' ')
            .trim()
            .toLowerCase();
    }

    function tokenizeReleaseName(name) {
        return normalizeReleaseName(name)
            .split(/\s+/)
            .filter(token => token.length > 1);
    }

    function searchLocalLibrary(query, category) {
        const qn = normalizeSearchName(query);
        if (!qn) return [];
        const queryWords = qn.split(/\s+/).filter(Boolean);
        const items = scanLibraryItems();
        const seen = new Set();
        const matchedDirs = new Set();
        const results = [];

        const isMatch = (normalized) => {
            const wordStartMatch = (queryWord, text) => text.split(/\s+/).some(w => w.startsWith(queryWord) || queryWord.startsWith(w));
            const allWordsMatch = queryWords.every(w => normalized.includes(w));
            // Guard the substring directions with a min length so tiny junk folder
            // names like "NC" (creditless openings) don't match any query that merely
            // contains those letters (e.g. "i-NC-eption").
            const fuzzyMatch = (qn.length >= 3 && normalized.includes(qn)) || (normalized.length >= 4 && qn.includes(normalized));
            const partialWordMatches = queryWords.filter(w => normalized.includes(w) || wordStartMatch(w, normalized)).length;
            const partialMatch = queryWords.length >= 2 && partialWordMatches / queryWords.length >= 0.6;
            return allWordsMatch || fuzzyMatch || partialMatch;
        };

        // First pass: find matching directories
        for (const item of items) {
            if (!item.isDir) continue;
            const normalized = normalizeSearchName(item.name);
            if (normalized && isMatch(normalized)) matchedDirs.add(item.path.toLowerCase());
        }

        // Second pass: collect results, skip files inside matched dirs
        for (const item of items) {
            const isMedia = item.category === 'Video' || item.category === 'Folder';
            if (!isMedia) continue;
            if (category && category !== 'All' && !['Movies', 'TV Shows', 'Anime'].includes(category)) continue;
            // Skip files inside a matched directory
            if (!item.isDir) {
                const parentDir = path.dirname(item.path).toLowerCase();
                if ([...matchedDirs].some(d => parentDir === d || parentDir.startsWith(d + path.sep))) continue;
            }
            const normalized = normalizeSearchName(item.name);
            if (!normalized || !isMatch(normalized)) continue;
            const dedupeKey = `${item.path}`.toLowerCase();
            if (seen.has(dedupeKey)) continue;
            seen.add(dedupeKey);
            results.push({
                _provider: 'Local',
                _magnet: null,
                _localPath: item.path,
                _inLibrary: true,
                _isDir: item.isDir,
                title: item.name,
                seeds: 0,
                peers: 0,
                size: item.isDir ? 'Folder' : humanizeBytes(item.size),
                time: item.modified ? new Date(item.modified).toUTCString() : '',
                uploader: 'On Disk',
            });
        }

        results.sort((a, b) => a.title.length - b.title.length);
        return results.slice(0, 25);
    }

    function extractYearHint(name) {
        return (name || '').match(/\b((?:19|20)\d{2})\b/)?.[1] || '';
    }

    function extractInfoHashFromMagnet(magnet) {
        if (!magnet || typeof magnet !== 'string') return '';
        const m = magnet.match(/btih:([a-fA-F0-9]{40}|[A-Z2-7]{32})/i);
        return m ? m[1].toLowerCase() : '';
    }

    function getSearchTokens(query) {
        const stopWords = new Set(['the', 'and', 'for', 'with', 'from', 'that', 'this', 'movie', 'show', 'season', 'episode']);
        return normalizeReleaseName(query)
            .split(/\s+/)
            .map(t => t.trim())
            .filter(t => t.length > 1 && !stopWords.has(t));
    }

    function scoreSearchResult(result, query, tokens) {
        const title = String(result?.title || '');
        const titleNorm = normalizeReleaseName(title);
        const queryNorm = normalizeReleaseName(query);
        const seeds = Number(result?.seeds || 0);
        const inLibraryBoost = result?._inLibrary ? 400 : 0;

        let tokenHits = 0;
        let startsWithHits = 0;
        for (const t of tokens) {
            if (titleNorm.includes(t)) {
                tokenHits += 1;
                if (titleNorm.split(/\s+/).some(w => w.startsWith(t))) startsWithHits += 1;
            }
        }

        const hasExact = queryNorm && titleNorm.includes(queryNorm);
        const tokenCoverage = tokens.length > 0 ? tokenHits / tokens.length : 0;
        const seedScore = Math.log10(Math.max(1, seeds + 1)) * 20;
        const titleLengthPenalty = Math.max(0, titleNorm.length - 120) * 0.15;

        const score =
            inLibraryBoost +
            (hasExact ? 220 : 0) +
            (tokenCoverage * 180) +
            (startsWithHits * 18) +
            seedScore -
            titleLengthPenalty;

        return {
            ...result,
            _score: score,
            _tokenHits: tokenHits,
            _tokenCoverage: tokenCoverage
        };
    }

    function localMatchForTitle(title, localResults) {
        const normalizedTitle = normalizeSearchName(title);
        const normalizedRelease = normalizeReleaseName(title);
        const remoteTokens = tokenizeReleaseName(title);
        if (!normalizedTitle || !normalizedRelease || remoteTokens.length === 0) return null;
        const titleYear = extractYearHint(title);

        for (const item of localResults) {
            if (item._isDir) continue;
            const normalizedLocal = normalizeSearchName(item.title);
            const normalizedLocalRelease = normalizeReleaseName(item.title);
            const localTokens = tokenizeReleaseName(item.title);
            if (!normalizedLocal) continue;
            if (!normalizedLocalRelease || localTokens.length === 0) continue;
            const localYear = extractYearHint(item.title);
            const yearCompatible = !titleYear || !localYear || titleYear === localYear;
            if (!yearCompatible) continue;

            if (normalizedRelease === normalizedLocalRelease) return item;
            if (normalizedTitle !== normalizedLocal && !normalizedTitle.includes(normalizedLocal) && !normalizedLocal.includes(normalizedTitle)) continue;

            const localSet = new Set(localTokens);
            const remoteSet = new Set(remoteTokens);
            let overlap = 0;
            for (const token of remoteSet) {
                if (localSet.has(token)) overlap += 1;
            }
            const localCoverage = overlap / localSet.size;
            const remoteCoverage = overlap / remoteSet.size;
            if (localCoverage >= 0.8 && remoteCoverage >= 0.8) return item;
        }
        return null;
    }

    app.get('/api/library', verifyUser, (req, res) => {
        try {
            res.json(scanLibraryItems());
        } catch (err) { res.status(500).json({ error: err.message }); }
    });

    // ─── Search Suggestions ───
    const TRENDING = [
        'Avengers', 'Interstellar', 'The Dark Knight', 'Inception', 'Breaking Bad',
        'Game of Thrones', 'Stranger Things', 'The Witcher', 'Money Heist', 'Narcos',
        'Spider-Man', 'Batman', 'Oppenheimer', 'Barbie', 'John Wick', 'Fast and Furious',
        'The Mandalorian', 'House of the Dragon', 'Peaky Blinders', 'Squid Game',
        'Dune', 'Top Gun Maverick', 'Avatar', 'Black Panther', 'Doctor Strange',
        'Wednesday', 'The Last of Us', 'Succession', 'Ted Lasso', 'Loki',
        'GTA V', 'Minecraft', 'Cyberpunk 2077', 'Elden Ring', 'God of War',
        'Windows 11', 'Adobe Photoshop', 'Microsoft Office', 'FL Studio', 'Premiere Pro',
        'Taare Zameen Par', 'Dangal', '3 Idiots', 'PK', 'Dil Chahta Hai',
        'RRR', 'Pushpa', 'KGF', 'Bahubali', 'Jawan', 'Animal', 'Pathaan',
        'Sholay', 'Lagaan', 'Rang De Basanti', 'Queen', 'Barfi', 'Zindagi Na Milegi Dobara'
    ];

    app.get('/api/suggestions', async (req, res) => {
        const q = (req.query.q || '').toLowerCase().trim();
        if (!q || q.length < 2) return res.json([]);

        // 1. Fuzzy match against TRENDING (includes partial + transposition tolerance)
        const scored = TRENDING.map(t => {
            const tl = t.toLowerCase();
            // exact substring
            if (tl.includes(q)) return { t, score: 2 };
            // every word in q appears somewhere in t
            const words = q.split(/\s+/).filter(Boolean);
            if (words.every(w => tl.includes(w))) return { t, score: 1.5 };
            // first word match (user typed start of title)
            if (tl.startsWith(words[0])) return { t, score: 1 };
            // single-char tolerance (drop last char of query)
            if (q.length > 3 && tl.includes(q.slice(0, -1))) return { t, score: 0.8 };
            return null;
        }).filter(Boolean).sort((a, b) => b.score - a.score).map(x => x.t);

        // 2. Live iTunes suggestions to supplement (best-effort, fires in parallel)
        let itunesTitles = [];
        try {
            const result = await new Promise((resolve) => {
                const qs = new URLSearchParams({ term: q, media: 'all', limit: '6', country: 'US' });
                const req2 = https.get(`https://itunes.apple.com/search?${qs}`, { headers: { Accept: 'application/json' }, timeout: 5000 }, (r) => {
                    const chunks = [];
                    r.on('data', c => chunks.push(c));
                    r.on('end', () => { try { resolve(JSON.parse(Buffer.concat(chunks).toString('utf8'))); } catch { resolve({ results: [] }); } });
                });
                req2.on('error', () => resolve({ results: [] }));
                req2.on('timeout', () => { req2.destroy(); resolve({ results: [] }); });
            });
            itunesTitles = (result.results || [])
                .map(r => r.trackName || r.collectionName || r.artistName)
                .filter(Boolean)
                .filter(t => !scored.some(s => s.toLowerCase() === t.toLowerCase()));
        } catch { /* ignore */ }

        const combined = [...new Set([...scored, ...itunesTitles])].slice(0, 10);
        res.json(combined);
    });

    // ─── Search with per-provider progress ───
    let lastSearchResults = [];
    let activeSearchId = 0;

    app.get('/api/search', async (req, res) => {
        const q = req.query.q;
        if (!q) return res.json({ results: [], logs: [] });

        const cat = req.query.category || 'All';
        const searchId = ++activeSearchId;
        console.log(`\n🔍 Search #${searchId}: "${q}" [${cat}]`);

        const allResults = [];
        const providerStatus = {};
        CUSTOM_PROVIDERS.forEach(p => { providerStatus[p.name] = { name: p.name, status: 'pending', count: 0 }; });

        const localResults = searchLocalLibrary(String(q), String(cat));
        providerStatus.Local = { name: 'Local', status: 'done', count: localResults.length, time: 0 };
        if (localResults.length > 0) localResults.forEach(r => allResults.push(r));

        // Emit initial state
        io.emit('search-progress', {
            searchId,
            providers: Object.values(providerStatus),
            totalResults: allResults.length,
            query: q,
            partialResults: allResults.map((r, i) => ({
                id: i,
                title: r.title || 'Unknown',
                size: r.size || '?',
                seeders: r.seeds || 0,
                leechers: r.peers || 0,
                provider: r._provider || '',
                time: r.time || '',
                uploader: r.uploader || '',
                inLibrary: Boolean(r._inLibrary),
                localPath: r._localPath || '',
            })).filter(r => r.title !== 'Unknown')
        });

        const searchPromises = CUSTOM_PROVIDERS.map(async (provider) => {
            if (searchId !== activeSearchId) return;

            providerStatus[provider.name].status = 'searching';
            io.emit('search-progress', { searchId, providers: Object.values(providerStatus), totalResults: allResults.length, query: q });

            const startTime = Date.now();
            // All active providers are API/RSS based — a flat 10s timeout is enough.
            const providerTimeout = 10000;
            try {
                let results = await Promise.race([
                    provider.search(q, cat),
                    new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), providerTimeout))
                ]);
                results = (results || []).map(r => {
                    const localMatch = localMatchForTitle(r.title, localResults);
                    return localMatch ? {
                        ...r,
                        _inLibrary: true,
                        _localPath: localMatch._localPath || '',
                    } : r;
                });
                const elapsed = Date.now() - startTime;
                if (searchId !== activeSearchId) return;
                const count = results?.length || 0;
                providerStatus[provider.name] = { name: provider.name, status: 'done', count, time: elapsed };
                if (count > 0) results.forEach(r => allResults.push(r));
                console.log(`   ✓ ${provider.name}: ${count} results (${elapsed}ms)`);
            } catch (err) {
                const elapsed = Date.now() - startTime;
                providerStatus[provider.name] = { name: provider.name, status: 'error', count: 0, time: elapsed, message: err.message };
                console.log(`   ✗ ${provider.name}: ${err.message} (${elapsed}ms)`);
            }

            if (searchId === activeSearchId) {
                // Snapshot allResults so magnet lookup works for partial results
                lastSearchResults = allResults.slice();
                const partialFormatted = lastSearchResults.map((r, i) => ({
                    id: i,
                    title: r.title || 'Unknown',
                    size: r.size || '?',
                    seeders: r.seeds || 0,
                    leechers: r.peers || 0,
                    provider: r._provider || '',
                    time: r.time || '',
                    uploader: r.uploader || '',
                    inLibrary: Boolean(r._inLibrary),
                    localPath: r._localPath || '',
                })).filter(r => r.title !== 'Unknown');
                io.emit('search-progress', { searchId, providers: Object.values(providerStatus), totalResults: allResults.length, query: q, partialResults: partialFormatted });
            }
        });

        await Promise.allSettled(searchPromises);

        if (searchId !== activeSearchId) return res.json({ results: [], logs: [], cancelled: true });

        const searchTokens = getSearchTokens(String(q));

        // Score each result for actual relevance (not only seeds).
        const scored = allResults.map(r => scoreSearchResult(r, String(q), searchTokens));

        // Optional quality gate: when tokenized query exists, drop obviously unrelated remote noise.
        const qualityFiltered = scored.filter(r => {
            if (r._inLibrary || r._provider === 'Local') return true;
            if (searchTokens.length === 0) return true;
            // Keep strong matches, and allow high-seed items with at least one token hit.
            return r._tokenCoverage >= 0.5 || (r._tokenHits >= 1 && (r.seeds || 0) >= 25);
        });

        // Deduplicate by infoHash/magnet when possible, otherwise by normalized title.
        const byKey = new Map();
        for (const r of qualityFiltered) {
            const hash = extractInfoHashFromMagnet(r._magnet);
            const titleKey = normalizeReleaseName(r.title || '');
            const key = hash ? `hash:${hash}` : `title:${titleKey}`;
            const existing = byKey.get(key);
            if (!existing || (r._score || 0) > (existing._score || 0)) {
                byKey.set(key, r);
            }
        }

        const deduped = Array.from(byKey.values());

        // Primary sort by relevance score, secondary by seeders, tertiary by shorter title.
        deduped.sort((a, b) => {
            const scoreDelta = (b._score || 0) - (a._score || 0);
            if (scoreDelta !== 0) return scoreDelta;
            const seedsDelta = (b.seeds || 0) - (a.seeds || 0);
            if (seedsDelta !== 0) return seedsDelta;
            return String(a.title || '').length - String(b.title || '').length;
        });

        lastSearchResults = deduped.slice(0, 150);
        const formatted = lastSearchResults.map((r, i) => ({
            id: i,
            title: r.title || 'Unknown',
            size: r.size || '?',
            seeders: r.seeds || 0,
            leechers: r.peers || 0,
            provider: r._provider || '',
            time: r.time || '',
            uploader: r.uploader || '',
            inLibrary: Boolean(r._inLibrary),
            localPath: r._localPath || '',
        })).filter(r => r.title !== 'Unknown');

        console.log(`   📊 Total: ${formatted.length} results (after dedup)`);

        io.emit('search-progress', {
            searchId, providers: Object.values(providerStatus),
            totalResults: formatted.length, query: q, done: true
        });

        res.json({ results: formatted, logs: Object.values(providerStatus) });
    });

    app.get('/api/magnet/:id', async (req, res) => {
        const id = parseInt(req.params.id);
        if (isNaN(id) || id < 0 || id >= lastSearchResults.length) return res.status(400).json({ error: 'Invalid ID' });
        const result = lastSearchResults[id];
        if (result._magnet) return res.json({ magnet: result._magnet });
        return res.status(500).json({ error: 'No magnet available for this result' });
    });

    // ─── Preview torrent files before download (fast — uses torrent cache) ───
    app.get('/api/torrent-files/:id', async (req, res) => {
        const id = parseInt(req.params.id);
        if (isNaN(id) || id < 0 || id >= lastSearchResults.length) return res.status(400).json({ error: 'Invalid ID' });
        const result = lastSearchResults[id];
        if (!result._magnet) return res.status(400).json({ error: 'No magnet available' });

        // Extract info hash (hex or base32)
        let infoHash = null;
        const hexMatch = result._magnet.match(/btih:([a-fA-F0-9]{40})/i);
        if (hexMatch) {
            infoHash = hexMatch[1].toLowerCase();
        } else {
            const b32Match = result._magnet.match(/btih:([A-Z2-7]{32})/i);
            if (b32Match) {
                const base32 = b32Match[1].toUpperCase();
                const alpha = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
                let bits = '';
                for (const c of base32) bits += alpha.indexOf(c).toString(2).padStart(5, '0');
                let hex = '';
                for (let i = 0; i + 4 <= bits.length; i += 4) hex += parseInt(bits.slice(i, i + 4), 2).toString(16);
                infoHash = hex.slice(0, 40);
            }
        }

        // 1. Check active client — instant
        if (infoHash) {
            const existing = client.torrents.find(t => t.infoHash === infoHash);
            if (existing && existing.files && existing.files.length > 0) {
                return res.json({
                    name: existing.name,
                    files: existing.files.map(f => ({ name: f.name, size: f.length, path: f.path })),
                });
            }
        }

        // 2. Try torrent cache services — fast (~1-2s)
        if (infoHash) {
            const HASH = infoHash.toUpperCase();
            const cacheUrls = [
                `https://itorrents.org/torrent/${HASH}.torrent`,
            ];

            for (const url of cacheUrls) {
                try {
                    const torrentBuf = await new Promise((resolve, reject) => {
                        const fetchWithRedirect = (currentUrl, depth = 0) => {
                            if (depth > 3) return reject(new Error('Too many redirects'));
                            const u = new URL(currentUrl);
                            const mod = u.protocol === 'https:' ? https : http;
                            mod.get({ hostname: u.hostname, path: u.pathname + u.search, timeout: 5000, headers: { 'User-Agent': 'VortexApp/1.0' } }, (resp) => {
                                if (resp.statusCode === 301 || resp.statusCode === 302) {
                                    const loc = resp.headers.location;
                                    if (loc) {
                                        resp.resume();
                                        return fetchWithRedirect(new URL(loc, currentUrl).href, depth + 1);
                                    }
                                }
                                if (resp.statusCode !== 200) { resp.resume(); return reject(new Error(`HTTP ${resp.statusCode}`)); }
                                const chunks = [];
                                resp.on('data', c => chunks.push(c));
                                resp.on('end', () => resolve(Buffer.concat(chunks)));
                            }).on('error', reject).on('timeout', function () { this.destroy(); reject(new Error('timeout')); });
                        };
                        fetchWithRedirect(url);
                    });

                    if (torrentBuf.length > 0 && torrentBuf[0] === 0x64) {
                        try {
                            const parsed = parseTorrent(torrentBuf);
                            if (parsed && parsed.files && parsed.files.length > 0) {
                                return res.json({
                                    name: parsed.name || result.title,
                                    files: parsed.files.map(f => ({ name: f.name, size: f.length, path: f.path })),
                                });
                            }
                        } catch (e) {
                            console.error('Parse torrent failed:', e.message);
                        }
                    }
                } catch {
                    continue;
                }
            }
        }

        // 3. WebTorrent fallback — use an isolated throwaway client so preview
        // never pollutes the main downloads list.
        try {
            const fileList = await new Promise((resolve, reject) => {
                const previewClient = new WebTorrentModule();
                let tempTorrent = null;
                let settled = false;

                const cleanup = () => {
                    try {
                        if (tempTorrent?.infoHash) {
                            previewClient.remove(tempTorrent.infoHash, { destroyStore: true }, () => {
                                try { previewClient.destroy(() => { }); } catch { }
                            });
                            return;
                        }
                    } catch { }
                    try { previewClient.destroy(() => { }); } catch { }
                };

                const finish = (err, payload) => {
                    if (settled) return;
                    settled = true;
                    clearTimeout(timer);
                    cleanup();
                    if (err) return reject(err);
                    resolve(payload);
                };

                const timer = setTimeout(() => finish(new Error('timeout')), 10000);

                try {
                    tempTorrent = previewClient.add(result._magnet, {
                        path: path.join(os.tmpdir(), 'vortex-preview'),
                        destroyStoreOnDestroy: true,
                    }, (torrent) => {
                        const files = (torrent.files || []).map(f => ({ name: f.name, size: f.length, path: f.path }));
                        finish(null, { name: torrent.name || result.title, files });
                    });

                    if (tempTorrent) {
                        tempTorrent.on('error', (err) => finish(err));
                    }
                } catch (e) {
                    finish(e);
                }
            });
            return res.json(fileList);
        } catch {
            // Final fallback — show torrent title as estimated
            return res.json({
                name: result.title || 'Unknown',
                files: [{ name: result.title || 'Unknown', size: 0, path: result.title || 'Unknown' }],
                estimated: true,
            });
        }
    });

    function resolveTorrentFolderPath(infoHash) {
        const active = client.torrents.find(t => t.infoHash === infoHash);
        const completed = completedTorrents.get(infoHash);
        const paused = pausedTorrents.get(infoHash);

        const candidates = [];

        if (active?.name) candidates.push(path.join(settings.downloadPath, active.name));
        if (completed?.name) candidates.push(path.join(settings.downloadPath, completed.name));
        if (paused?.name) candidates.push(path.join(settings.downloadPath, paused.name));

        // Try deriving folder from active files if available.
        if (active?.files?.length) {
            const first = active.files[0];
            if (first?.path) {
                const resolved = path.join(settings.downloadPath, first.path);
                candidates.push(path.dirname(resolved));
            }
        }

        for (const candidate of candidates) {
            try {
                if (!candidate) continue;
                if (!fs.existsSync(candidate)) continue;
                const stat = fs.statSync(candidate);
                return stat.isDirectory() ? candidate : path.dirname(candidate);
            } catch {
                // Ignore candidate errors and keep trying.
            }
        }

        // Fallback to the configured download root.
        return settings.downloadPath;
    }

    function openFolderOnSystem(folderPath) {
        if (!folderPath || !fs.existsSync(folderPath)) return false;

        try {
            if (process.platform === 'win32') {
                const winPath = path.normalize(folderPath);
                const child = spawn('explorer.exe', [winPath], { detached: true, stdio: 'ignore', windowsHide: true });
                child.unref();
                return true;
            }
            if (process.platform === 'darwin') {
                const child = spawn('open', [folderPath], { detached: true, stdio: 'ignore' });
                child.unref();
                return true;
            }
            const child = spawn('xdg-open', [folderPath], { detached: true, stdio: 'ignore' });
            child.unref();
            return true;
        } catch {
            return false;
        }
    }

    // Open a single file in the OS default player (e.g. VLC for x265/HEVC that the
    // browser can't decode).
    function openFileOnSystem(filePath) {
        if (!filePath || !fs.existsSync(filePath)) return false;
        try {
            if (process.platform === 'win32') {
                // 'start' is a cmd builtin; the empty "" is the (required) window title.
                const child = spawn('cmd', ['/c', 'start', '', path.normalize(filePath)], { detached: true, stdio: 'ignore', windowsHide: true });
                child.unref();
                return true;
            }
            const opener = process.platform === 'darwin' ? 'open' : 'xdg-open';
            const child = spawn(opener, [filePath], { detached: true, stdio: 'ignore' });
            child.unref();
            return true;
        } catch {
            return false;
        }
    }

    app.post('/api/torrents/:infoHash/open-folder', verifyUser, (req, res) => {
        const hash = String(req.params.infoHash || '').trim();
        if (!hash) return res.status(400).json({ error: 'Invalid infoHash' });

        const folderPath = resolveTorrentFolderPath(hash);
        if (!folderPath || !fs.existsSync(folderPath)) {
            return res.status(404).json({ error: 'Download folder not found' });
        }

        const opened = openFolderOnSystem(folderPath);
        if (!opened) return res.status(500).json({ error: 'Failed to open folder' });

        return res.json({ success: true, folderPath });
    });

    // ─── Add Torrent ───
    app.post('/api/torrents', verifyUser, (req, res) => {
        const { magnet } = req.body;
        if (!magnet) return res.status(400).json({ error: 'Magnet required' });

        let hash = null;
        const hashMatch = magnet.match(/btih:([a-fA-F0-9]{40})/i);
        if (hashMatch) {
            hash = hashMatch[1].toLowerCase();
            completedTorrents.delete(hash);
            pausedTorrents.delete(hash);
        }

        try {
            const torrent = client.add(magnet, getTorrentAddOptions(magnet, settings.downloadPath));
            attachDiagnosticListeners(torrent);

            // Ensure infoHash is available
            const infoHash = torrent.infoHash || hash;

            // Store the original magnet so pause/resume always has it
            const now = Date.now();
            if (infoHash) { magnetsByHash.set(infoHash, magnet); addedAtMap.set(infoHash, now); }

            // Pre-populate name from magnet dn= so UI shows something before metadata
            const magnetName = getNameFromMagnet(magnet);
            if (infoHash && magnetName) namesMap.set(infoHash, magnetName);

            setTimeout(() => saveTorrentList(), 2000);
            torrent.on('metadata', () => {
                console.log('   ✓ Metadata:', torrent.name);
                if (torrent.name) namesMap.set(torrent.infoHash, torrent.name);
                applyPausedFileSelections(torrent);
                // Update stored magnet with full URI (includes trackers from DHT)
                if (torrent.infoHash) {
                    magnetsByHash.set(torrent.infoHash, torrent.magnetURI || magnet);
                    if (!addedAtMap.has(torrent.infoHash)) addedAtMap.set(torrent.infoHash, now);
                }
                saveTorrentList();
            });
            torrent.on('error', (err) => console.error('   ✗ Torrent error:', err.message));
            torrent.on('done', async () => {
                console.log(`✅ Done: ${torrent.name}`);
                saveTorrentList();
                // Don't re-trigger auto-subtitle for torrents restored from previous session
                if (restoredHashes.has(torrent.infoHash)) return;
                if (!settings.autoSubtitle || !settings.opensubtitlesApiKey) return;
                const videoExts = ['.mkv', '.mp4', '.avi', '.mov', '.wmv', '.m4v', '.ts', '.flv'];
                const videoFile = (torrent.files || []).find(f => videoExts.some(ext => f.name.toLowerCase().endsWith(ext)));
                const rawName = videoFile?.name || torrent.name || '';
                const searchName = rawName.replace(/\.[^.]+$/, '').replace(/[._+]+/g, ' ').trim();
                // Put subtitle next to video file, or in torrent root folder
                const destFolder = (torrent.files || []).length > 1
                    ? path.join(settings.downloadPath, torrent.name)
                    : settings.downloadPath;
                const lang = settings.subtitleLang || 'en';
                console.log(`🎬 Auto-subtitle: "${searchName}" [${lang}] → ${destFolder}`);
                try {
                    const items = await osSearch(settings.opensubtitlesApiKey, {
                        query: searchName,
                        languages: lang,
                        order_by: 'download_count',
                        order_direction: 'desc',
                    }, lang);
                    const mapped = mapOsItems(items.slice(0, 1), lang);
                    if (!mapped.length || !mapped[0].fileId) {
                        console.log('🔕 Auto-subtitle: no results found');
                        return;
                    }
                    const sub = mapped[0];
                    const saved = await downloadSubtitleFile(settings.opensubtitlesApiKey, sub.fileId, sub.name, destFolder);
                    console.log(`✅ Auto-subtitle saved: ${path.basename(saved)}`);
                    io.emit('subtitle-auto-saved', { torrentName: torrent.name, subtitleFile: path.basename(saved), lang });
                } catch (e) {
                    console.log(`🔕 Auto-subtitle error: ${e.message}`);
                }
            });

            console.log('📥 Added:', infoHash);
            res.json({ infoHash, name: torrent.name || getNameFromMagnet(magnet) || 'Loading metadata...', added: true });
        } catch (err) {
            if (err.message && (err.message.includes('duplicate') || err.message.includes('Cannot add'))) {
                if (hash) {
                    const existing = client.get(hash);
                    if (existing) return res.json({ infoHash: existing.infoHash, name: existing.name || 'Loading...', alreadyExists: true });
                }
                return res.json({ added: true, alreadyExists: true });
            }
            console.error('Add error:', err.message);
            res.status(500).json({ error: err.message });
        }
    });

    // ─── Remove Torrent (keep files) ───
    app.delete('/api/torrents/:infoHash', verifyUser, (req, res) => {
        const hash = req.params.infoHash;
        const torrent = client.torrents.find(t => t.infoHash === hash);
        archiveTorrentTransfer(hash, torrent);
        pausedTorrents.delete(hash);
        completedTorrents.delete(hash);
        magnetsByHash.delete(hash);
        syncToCloud('delete_torrent', { infoHash: hash });
        addedAtMap.delete(hash);
        pausedFilesByHash.delete(hash);



        if (torrent) {
            client.remove(hash, { destroyStore: false }, () => { saveTorrentList(); res.json({ success: true }); });
        } else { saveTorrentList(); res.json({ success: true }); }
    });

    // ─── Delete Torrent + Files ───
    app.delete('/api/torrents/:infoHash/delete-files', verifyUser, (req, res) => {
        const hash = req.params.infoHash;
        const isPaused = pausedTorrents.has(hash);
        // Use find() — definitive check, avoids stale client.get() reference
        const torrent = isPaused ? null : client.torrents.find(t => t.infoHash === hash);
        archiveTorrentTransfer(hash, torrent);
        const torrentName = torrent?.name || namesMap.get(hash) ||
            completedTorrents.get(hash)?.name ||
            pausedTorrents.get(hash)?.name || null;

        pausedTorrents.delete(hash);
        completedTorrents.delete(hash);
        magnetsByHash.delete(hash);
        syncToCloud('delete_torrent', { infoHash: hash });
        addedAtMap.delete(hash);
        pausedFilesByHash.delete(hash);



        const doDeleteFiles = () => {
            if (torrentName) {
                const filePath = path.join(settings.downloadPath, torrentName);
                try {
                    if (fs.existsSync(filePath)) {
                        try {
                            const stats = fs.statSync(filePath);
                            stats.isDirectory()
                                ? fs.rmSync(filePath, { recursive: true, force: true })
                                : fs.unlinkSync(filePath);
                            console.log('🗑 Deleted:', filePath);
                        } catch (e) { console.error('Delete error:', e.message); }
                    }
                } catch (err) { console.error('Delete error:', err.message); }
            }
            saveTorrentList();
            res.json({ success: true });
        };

        if (torrent) {
            client.remove(hash, { destroyStore: false }, doDeleteFiles);
        } else {
            doDeleteFiles();
        }
    });

    // ─── Pause ───
    app.post('/api/torrents/:infoHash/pause', verifyUser, (req, res) => {
        const hash = req.params.infoHash;
        // Use find() — definitive check, avoids stale client.get() reference
        const torrent = client.torrents.find(t => t.infoHash === hash);
        if (torrent) {
            const storedMagnet = magnetsByHash.get(hash) || torrent.magnetURI || `magnet:?xt=urn:btih:${hash}`;
            const name = torrent.name || namesMap.get(hash) || getNameFromMagnet(storedMagnet) || 'Unknown';
            if (name !== 'Unknown') namesMap.set(hash, name);
            pausedTorrents.set(hash, {
                magnet: storedMagnet, name,
                progress: (torrent.progress * 100).toFixed(2),
                downloaded: torrent.downloaded || 0, totalLength: torrent.length || 0,
                addedAt: addedAtMap.get(hash) || Date.now()
            });
            client.remove(hash, { destroyStore: false }, () => { saveTorrentList(); res.json({ success: true }); });
        } else if (pausedTorrents.has(hash)) { res.json({ success: true }); }
        else { res.status(404).json({ error: 'Not found' }); }
    });

    // ─── Resume ───
    app.post('/api/torrents/:infoHash/resume', verifyUser, (req, res) => {
        const hash = req.params.infoHash;
        if (pausedTorrents.has(hash)) {
            const data = pausedTorrents.get(hash);
            // Ensure we have a valid magnet — fall back to reconstructing from hash
            const magnet = data.magnet || magnetsByHash.get(hash) || `magnet:?xt=urn:btih:${hash}`;
            // Remove from paused AFTER ensuring we can add it
            try {
                const torrent = client.add(magnet, getTorrentAddOptions(magnet, settings.downloadPath));
                // Now safe to remove from paused map
                pausedTorrents.delete(hash);
                if (magnet) magnetsByHash.set(hash, magnet);
                torrent.on('metadata', () => {
                    console.log('▶ Resumed:', torrent.name);
                    if (torrent.infoHash) magnetsByHash.set(torrent.infoHash, torrent.magnetURI || magnet);
                    applyPausedFileSelections(torrent);
                    saveTorrentList();
                });
                saveTorrentList();
                res.json({ success: true });
            } catch (err) {
                if (err.message?.includes('duplicate') || err.message?.includes('Cannot add')) {
                    // Already in client — just remove from paused
                    pausedTorrents.delete(hash);
                    return res.json({ success: true });
                }
                // Add failed — keep in paused so it doesn't vanish
                console.error('Resume failed, keeping paused:', err.message);
                res.status(500).json({ error: err.message });
            }
        } else { res.json({ success: true }); }
    });

    // ─── Stop Seeding ───
    app.post('/api/torrents/:infoHash/stop-seeding', verifyUser, (req, res) => {
        const hash = req.params.infoHash;
        // Use find() as the definitive check — avoids stale client.get() references
        const torrent = client.torrents.find(t => t.infoHash === hash);
        const name = (torrent?.name) || namesMap.get(hash) || 'Unknown';
        namesMap.set(hash, name);
        const uploadedNow = resolveUploaded(torrent?.downloaded || 0, torrent?.uploaded, torrent?.ratio);
        completedTorrents.set(hash, {
            name,
            magnet: magnetsByHash.get(hash) || torrent?.magnetURI || `magnet:?xt=urn:btih:${hash}`,
            downloaded: torrent?.downloaded || torrent?.length || 0,
            uploaded: uploadedNow || 0,
            ratio: torrent?.ratio || 0,
            totalLength: torrent?.length || torrent?.downloaded || 0,
            addedAt: addedAtMap.get(hash) || Date.now()
        });
        console.log('⏹ Stopped seeding:', name);
        if (torrent) {
            client.remove(hash, { destroyStore: false }, () => { saveTorrentList(); res.json({ success: true }); });
        } else {
            saveTorrentList(); res.json({ success: true });
        }
    });

    // ─── Start Seeding Again (from Completed) ───
    app.post('/api/torrents/:infoHash/start-seeding', verifyUser, (req, res) => {
        const hash = req.params.infoHash;
        const existing = client.torrents.find(t => t.infoHash === hash);
        if (existing) return res.json({ success: true, alreadyActive: true });

        const completed = completedTorrents.get(hash);
        if (!completed) return res.status(404).json({ error: 'Completed torrent not found' });

        const magnet = completed.magnet || magnetsByHash.get(hash) || `magnet:?xt=urn:btih:${hash}`;
        if (!magnet) return res.status(400).json({ error: 'No magnet available to start seeding' });

        try {
            const torrent = client.add(magnet, getTorrentAddOptions(magnet, settings.downloadPath));
            completedTorrents.delete(hash);
            magnetsByHash.set(hash, magnet);
            torrent.on('metadata', () => {
                if (torrent.name) namesMap.set(torrent.infoHash, torrent.name);
                if (torrent.infoHash) magnetsByHash.set(torrent.infoHash, torrent.magnetURI || magnet);
                applyPausedFileSelections(torrent);
                saveTorrentList();
            });
            saveTorrentList();
            return res.json({ success: true });
        } catch (err) {
            if (err.message?.includes('duplicate') || err.message?.includes('Cannot add')) {
                completedTorrents.delete(hash);
                saveTorrentList();
                return res.json({ success: true, alreadyActive: true });
            }
            return res.status(500).json({ error: err.message || 'Failed to start seeding' });
        }
    });

    // ─── Stream video for in-browser playback (HTTP Range) ───
    // Works for active torrents (stream-while-downloading) AND already-downloaded
    // items on disk (completed / not seeding). Supports ?fileIdx=N to pick a
    // specific episode out of a multi-file folder.
    const STREAMABLE_EXT = ['.mp4', '.m4v', '.webm', '.mkv', '.mov', '.avi', '.ts'];
    const isVideoName = (name) => STREAMABLE_EXT.some(ext => name.toLowerCase().endsWith(ext));
    const isBrowserFriendly = (name) => ['.mp4', '.m4v', '.webm'].includes((name.match(/\.[^.]+$/)?.[0] || '').toLowerCase());
    function mimeForFile(name) {
        const n = name.toLowerCase();
        if (n.endsWith('.mp4') || n.endsWith('.m4v')) return 'video/mp4';
        if (n.endsWith('.webm')) return 'video/webm';
        if (n.endsWith('.mkv')) return 'video/x-matroska';
        if (n.endsWith('.mov')) return 'video/quicktime';
        if (n.endsWith('.avi')) return 'video/x-msvideo';
        if (n.endsWith('.ts')) return 'video/mp2t';
        return 'application/octet-stream';
    }
    // Natural episode order (so "Ep 2" sorts before "Ep 10").
    const byEpisodeOrder = (a, b) => a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' });

    function listVideoFilesOnDisk(rootPath) {
        const out = [];
        const walk = (p, depth) => {
            if (depth > 4) return;
            let stat; try { stat = fs.statSync(p); } catch { return; }
            if (stat.isDirectory()) {
                let entries = []; try { entries = fs.readdirSync(p); } catch { return; }
                for (const e of entries) walk(path.join(p, e), depth + 1);
            } else if (isVideoName(p)) {
                out.push({ name: path.basename(p), absPath: p, length: stat.size });
            }
        };
        walk(rootPath, 0);
        out.sort(byEpisodeOrder);
        return out;
    }

    function getTorrentName(hash) {
        const active = client.torrents.find(t => (t.infoHash || '').toLowerCase() === hash);
        if (active?.name) return active.name;
        const rec = completedTorrents.get(hash) || pausedTorrents.get(hash);
        return rec?.name || null;
    }

    // Ordered list of playable videos for an infoHash.
    // source: 'torrent' (live) | 'disk' (on-disk fallback) | 'loading' | 'none'.
    function getPlayableFiles(hash) {
        const torrent = client.torrents.find(t => (t.infoHash || '').toLowerCase() === hash);
        if (torrent) {
            if (!torrent.files || torrent.files.length === 0) return { source: 'loading', files: [] };
            const vids = torrent.files.filter(f => isVideoName(f.name)).slice().sort(byEpisodeOrder);
            return { source: 'torrent', torrent, files: vids.map(f => ({ name: f.name, length: f.length || 0, file: f })) };
        }
        const name = getTorrentName(hash);
        const target = name ? path.join(settings.downloadPath, name) : null;
        if (target && fs.existsSync(target)) {
            return { source: 'disk', files: listVideoFilesOnDisk(target) };
        }
        return { source: 'none', files: [] };
    }

    function pickDefaultIdx(files) {
        let idx = 0, max = -1;
        files.forEach((f, i) => { if ((f.length || 0) > max) { max = f.length || 0; idx = i; } });
        return idx;
    }

    // ── Transcoding (ffmpeg) — lets x265/HEVC/10-bit play in-browser ──────────
    let ffmpegPathCache;
    async function resolveFfmpeg() {
        if (ffmpegPathCache !== undefined) return ffmpegPathCache;
        const candidates = [];
        if (process.env.VORTEX_FFMPEG) candidates.push(process.env.VORTEX_FFMPEG);
        // Bundled next to the engine exe (packaged builds).
        candidates.push(path.join(RUNTIME_DIR, process.platform === 'win32' ? 'ffmpeg.exe' : 'ffmpeg'));
        for (const c of candidates) {
            try { if (c && fs.existsSync(c)) { ffmpegPathCache = c; return c; } } catch { /* ignore */ }
        }
        // ffmpeg-static (dev / unpackaged installs).
        try {
            const mod = await import('ffmpeg-static');
            const p = mod?.default || mod;
            if (p && typeof p === 'string' && fs.existsSync(p)) { ffmpegPathCache = p; return p; }
        } catch { /* not installed */ }
        // System ffmpeg on PATH.
        ffmpegPathCache = 'ffmpeg';
        return ffmpegPathCache;
    }

    let ffmpegAvailCache;
    async function ffmpegAvailable() {
        if (ffmpegAvailCache !== undefined) return ffmpegAvailCache;
        try {
            const p = await resolveFfmpeg();
            const r = spawnSync(p, ['-version'], { windowsHide: true, timeout: 5000 });
            ffmpegAvailCache = !r.error && r.status === 0;
        } catch { ffmpegAvailCache = false; }
        return ffmpegAvailCache;
    }

    const absPathForChoice = (p, chosen) => p.source === 'torrent'
        ? path.join(p.torrent?.path || settings.downloadPath, chosen.file.path)
        : chosen.absPath;

    // Lightweight check + the full episode list, so the UI can warn on container
    // support and show an episode picker for multi-file folders.
    app.get('/api/stream/:infoHash/info', async (req, res) => {
        const hash = (req.params.infoHash || '').toLowerCase();
        const p = getPlayableFiles(hash);
        if (p.source === 'loading') return res.json({ streamable: false, reason: 'loading' });
        if (p.source === 'none') return res.json({ streamable: false, reason: 'not-active' });
        if (!p.files.length) return res.json({ streamable: false, reason: 'no-video' });
        const files = p.files.map((f, idx) => ({
            idx,
            name: f.name,
            length: f.length || 0,
            ext: (f.name.match(/\.[^.]+$/)?.[0] || '').toLowerCase(),
            browserFriendly: isBrowserFriendly(f.name),
        }));
        const defaultIdx = pickDefaultIdx(files);
        const d = files[defaultIdx];
        const transcodeAvailable = await ffmpegAvailable();
        res.json({
            streamable: true,
            source: p.source,
            multi: files.length > 1,
            files,
            defaultIdx,
            transcodeAvailable,
            name: d.name, ext: d.ext, browserFriendly: d.browserFriendly, length: d.length,
        });
    });

    // No verifyUser: a <video> element can't attach an Authorization header, and
    // the server is loopback-bound, so it isn't a general file server.
    app.get('/api/stream/:infoHash', (req, res) => {
        const hash = (req.params.infoHash || '').toLowerCase();
        const p = getPlayableFiles(hash);
        if (!p.files.length) return res.status(404).json({ error: 'No playable video file' });

        let idx = parseInt(req.query.fileIdx, 10);
        if (isNaN(idx) || idx < 0 || idx >= p.files.length) idx = pickDefaultIdx(p.files);
        const chosen = p.files[idx];
        const total = chosen.length || 0;

        let start = 0, end = total - 1, status = 200;
        const range = req.headers.range;
        if (range) {
            const m = /bytes=(\d*)-(\d*)/.exec(range);
            if (m) {
                if (m[1]) start = parseInt(m[1], 10);
                if (m[2]) end = parseInt(m[2], 10);
                if (isNaN(start) || start < 0) start = 0;
                if (isNaN(end) || end >= total) end = total - 1;
                if (start > end) { start = 0; end = total - 1; }
                status = 206;
            }
        }

        res.status(status);
        res.setHeader('Content-Type', mimeForFile(chosen.name));
        res.setHeader('Accept-Ranges', 'bytes');
        res.setHeader('Content-Length', (end - start) + 1);
        if (status === 206) res.setHeader('Content-Range', `bytes ${start}-${end}/${total}`);

        let stream;
        try {
            if (p.source === 'torrent') {
                // Prioritize this file so playback can begin before completion — but
                // NOT for Quick-Watch (ephemeral) streams, which should only fetch the
                // pieces actually played, never the whole file.
                if (!ephemeralHashes.has(hash)) { try { chosen.file.select(); } catch { /* ignore */ } }
                stream = chosen.file.createReadStream({ start, end });
            } else {
                stream = fs.createReadStream(chosen.absPath, { start, end });
            }
        } catch (err) {
            return res.status(500).json({ error: err.message || 'stream failed' });
        }
        stream.on('error', () => { try { res.destroy(); } catch { /* ignore */ } });
        req.on('close', () => { try { stream.destroy(); } catch { /* ignore */ } });
        stream.pipe(res);
    });

    // Open the chosen file in the OS default player (for x265/HEVC etc. the browser
    // can't decode). Loopback-only and scoped to download files, like /stream.
    app.post('/api/stream/:infoHash/open', (req, res) => {
        const hash = (req.params.infoHash || '').toLowerCase();
        const p = getPlayableFiles(hash);
        if (!p.files.length) return res.status(404).json({ error: 'No playable file' });
        let idx = parseInt(req.body?.fileIdx, 10);
        if (isNaN(idx) || idx < 0 || idx >= p.files.length) idx = pickDefaultIdx(p.files);
        const chosen = p.files[idx];
        const absPath = p.source === 'torrent'
            ? path.join(settings.downloadPath, chosen.file.path)
            : chosen.absPath;
        if (!openFileOnSystem(absPath)) return res.status(500).json({ error: 'Could not open file. It may still be downloading.' });
        res.json({ success: true });
    });

    // Total duration (seconds) of a file — used by the transcode seek bar, since a
    // live transcode stream has no seekable byte ranges the browser can read.
    app.get('/api/stream/:infoHash/probe', async (req, res) => {
        const hash = (req.params.infoHash || '').toLowerCase();
        const p = getPlayableFiles(hash);
        if (!p.files.length) return res.json({ duration: 0 });
        let idx = parseInt(req.query.fileIdx, 10);
        if (isNaN(idx) || idx < 0 || idx >= p.files.length) idx = pickDefaultIdx(p.files);
        const absPath = absPathForChoice(p, p.files[idx]);
        let duration = 0;
        if (fs.existsSync(absPath) && await ffmpegAvailable()) {
            try {
                const ff = await resolveFfmpeg();
                const r = spawnSync(ff, ['-i', absPath], { windowsHide: true, timeout: 8000, encoding: 'utf-8' });
                const m = String(r.stderr || '').match(/Duration:\s*(\d+):(\d+):(\d+(?:\.\d+)?)/);
                if (m) duration = (+m[1]) * 3600 + (+m[2]) * 60 + parseFloat(m[3]);
            } catch { /* ignore */ }
        }
        res.json({ duration });
    });

    // On-the-fly transcode to browser-friendly H.264/AAC MP4 so x265/HEVC/10-bit
    // plays in <video>. Output is a fragmented MP4 streamed over one response.
    // CPU-heavy; used only when the user opts in for an unplayable file.
    app.get('/api/transcode/:infoHash', async (req, res) => {
        const hash = (req.params.infoHash || '').toLowerCase();
        const p = getPlayableFiles(hash);
        if (!p.files.length) return res.status(404).json({ error: 'No playable file' });
        let idx = parseInt(req.query.fileIdx, 10);
        if (isNaN(idx) || idx < 0 || idx >= p.files.length) idx = pickDefaultIdx(p.files);
        const chosen = p.files[idx];
        const absPath = absPathForChoice(p, chosen);
        if (!absPath || !fs.existsSync(absPath)) return res.status(404).json({ error: 'File not on disk yet — let it download first.' });

        const ffmpeg = await resolveFfmpeg();
        const seek = Math.max(0, parseFloat(req.query.t) || 0);
        // Optional explicit audio track (global stream index) for dual-audio files.
        const audioParam = req.query.audio;
        const audioMap = (audioParam != null && /^\d+$/.test(String(audioParam))) ? `0:${audioParam}` : '0:a:0?';
        // vcopy=1 keeps the original H.264 video (just remuxes + swaps audio) — fast,
        // no re-encode. Used when the source video already plays in browsers.
        const vcopy = req.query.vcopy === '1';
        const videoArgs = vcopy
            ? ['-c:v', 'copy']
            : ['-c:v', 'libx264', '-preset', 'veryfast', '-crf', '23', '-pix_fmt', 'yuv420p'];
        const args = [
            ...(seek > 0 ? ['-ss', String(seek)] : []),
            '-i', absPath,
            '-map', '0:v:0', '-map', audioMap,
            ...videoArgs,
            '-c:a', 'aac', '-b:a', '160k', '-ac', '2',
            '-movflags', 'frag_keyframe+empty_moov+default_base_moof+faststart',
            '-f', 'mp4', 'pipe:1',
        ];

        res.setHeader('Content-Type', 'video/mp4');
        res.setHeader('Cache-Control', 'no-store');

        let proc;
        try {
            proc = spawn(ffmpeg, args, { windowsHide: true });
        } catch {
            return res.status(500).json({ error: 'ffmpeg not available' });
        }
        proc.stdout.pipe(res);
        // ffmpeg writes progress/info to stderr; only surface it under debug.
        proc.stderr.on('data', (d) => { if (process.env.VORTEX_DEBUG) process.stderr.write(d); });
        proc.on('error', () => { try { if (!res.headersSent) res.status(500).end(); else res.destroy(); } catch { /* ignore */ } });
        const kill = () => { try { proc.kill('SIGKILL'); } catch { /* ignore */ } };
        req.on('close', kill);
        res.on('close', kill);
    });

    const LANG_NAMES = { eng: 'English', en: 'English', jpn: 'Japanese', jp: 'Japanese', ja: 'Japanese', spa: 'Spanish', es: 'Spanish', fre: 'French', fra: 'French', fr: 'French', ger: 'German', deu: 'German', de: 'German', ita: 'Italian', it: 'Italian', por: 'Portuguese', pt: 'Portuguese', rus: 'Russian', ru: 'Russian', kor: 'Korean', ko: 'Korean', chi: 'Chinese', zho: 'Chinese', zh: 'Chinese', hin: 'Hindi', hi: 'Hindi', ara: 'Arabic', ar: 'Arabic' };
    const langName = (c) => LANG_NAMES[c] || (c && c !== 'und' ? c.toUpperCase() : '');

    // Tracks for a file: subtitle tracks (sidecar + embedded text), audio tracks
    // (with language/title so dual-audio is selectable), and the video codec (so the
    // UI knows whether audio-switch can fast-remux or needs a full transcode).
    app.get('/api/stream/:infoHash/subs', async (req, res) => {
        const hash = (req.params.infoHash || '').toLowerCase();
        const p = getPlayableFiles(hash);
        if (!p.files.length) return res.json({ tracks: [], audio: [], videoCodec: '' });
        let idx = parseInt(req.query.fileIdx, 10);
        if (isNaN(idx) || idx < 0 || idx >= p.files.length) idx = pickDefaultIdx(p.files);
        const absPath = absPathForChoice(p, p.files[idx]);
        const subs = [];
        const audio = [];
        let videoCodec = '';
        try {
            const dir = path.dirname(absPath);
            const base = path.basename(absPath).replace(/\.[^.]+$/, '').toLowerCase();
            for (const f of fs.readdirSync(dir)) {
                const ext = (f.match(/\.[^.]+$/)?.[0] || '').toLowerCase();
                if (!['.srt', '.vtt', '.ass', '.ssa'].includes(ext)) continue;
                const fb = f.replace(/\.[^.]+$/, '').toLowerCase();
                if (fb === base || fb.startsWith(base) || base.startsWith(fb)) {
                    const lang = (f.match(/[._-]([a-z]{2,3})\.[^.]+$/i)?.[1] || '').toLowerCase();
                    subs.push({ id: `file:${f}`, label: `Sidecar: ${f}`, lang });
                }
            }
        } catch { /* ignore */ }
        if (await ffmpegAvailable() && fs.existsSync(absPath)) {
            try {
                const ff = await resolveFfmpeg();
                const r = spawnSync(ff, ['-i', absPath], { windowsHide: true, timeout: 8000, encoding: 'utf-8' });
                const out = String(r.stderr || '');
                // Split per-stream so a stream's "title :" metadata stays with it.
                const blocks = out.split(/(?=\n\s*Stream #0:\d+)/);
                let subN = 0, audN = 0;
                for (const b of blocks) {
                    const sm = b.match(/Stream #0:(\d+)(?:\((\w+)\))?: (Audio|Subtitle|Video): (\w+)/);
                    if (!sm) continue;
                    const sidx = Number(sm[1]);
                    const lang = (sm[2] || '').toLowerCase();
                    const kind = sm[3];
                    const codec = sm[4].toLowerCase();
                    const title = (b.match(/title\s*:\s*([^\n\r]+)/)?.[1] || '').trim();
                    if (kind === 'Video') { if (!videoCodec) videoCodec = codec; continue; }
                    if (kind === 'Audio') {
                        audN++;
                        const label = title || langName(lang) || `Audio ${audN}`;
                        audio.push({ idx: sidx, lang, label, default: /\(default\)/.test(b) });
                        continue;
                    }
                    // Subtitle (text-based only — image subs can't become WebVTT)
                    if (!['subrip', 'ass', 'ssa', 'mov_text', 'webvtt', 'text'].includes(codec)) continue;
                    subN++;
                    const label = title || langName(lang) || `Subtitle ${subN}`;
                    subs.push({ id: `embed:${sidx}`, label: lang && !title ? label : `${label}${lang ? ` (${lang})` : ''}`, lang });
                }
            } catch { /* ignore */ }
        }
        res.json({ tracks: subs, audio, videoCodec });
    });

    // Serve a subtitle track as WebVTT (converted via ffmpeg when needed).
    // Permissive CORS so the cross-origin <track> can load it.
    app.get('/api/stream/:infoHash/sub', cors({ origin: '*' }), async (req, res) => {
        const hash = (req.params.infoHash || '').toLowerCase();
        const p = getPlayableFiles(hash);
        if (!p.files.length) return res.status(404).end();
        let idx = parseInt(req.query.fileIdx, 10);
        if (isNaN(idx) || idx < 0 || idx >= p.files.length) idx = pickDefaultIdx(p.files);
        const absPath = absPathForChoice(p, p.files[idx]);
        const track = String(req.query.track || '');
        // When the player is transcoding from a seek point, shift the subtitle
        // timestamps by the same offset so cues stay in sync with the reset timeline.
        const seek = Math.max(0, parseFloat(req.query.t) || 0);
        const seekArgs = seek > 0 ? ['-ss', String(seek)] : [];
        res.setHeader('Content-Type', 'text/vtt; charset=utf-8');
        res.setHeader('Cache-Control', 'no-store');

        const pipeFfmpeg = async (inputArgs) => {
            const ff = await resolveFfmpeg();
            let proc;
            try { proc = spawn(ff, [...inputArgs, '-f', 'webvtt', 'pipe:1'], { windowsHide: true }); }
            catch { return res.status(500).end(); }
            proc.stdout.pipe(res);
            proc.stderr.on('data', () => { });
            proc.on('error', () => { try { res.end(); } catch { /* ignore */ } });
            const kill = () => { try { proc.kill('SIGKILL'); } catch { /* ignore */ } };
            req.on('close', kill); res.on('close', kill);
        };

        if (track.startsWith('file:')) {
            const subPath = path.join(path.dirname(absPath), track.slice(5));
            if (!fs.existsSync(subPath)) return res.status(404).end();
            // Raw .vtt with no seek can be streamed directly; otherwise run through
            // ffmpeg so the -ss offset (and srt/ass→vtt conversion) is applied.
            if (subPath.toLowerCase().endsWith('.vtt') && seek === 0) { fs.createReadStream(subPath).pipe(res); return; }
            return pipeFfmpeg([...seekArgs, '-i', subPath]);
        }
        if (track.startsWith('embed:')) {
            const streamIdx = parseInt(track.slice(6), 10);
            if (isNaN(streamIdx)) return res.status(400).end();
            return pipeFfmpeg([...seekArgs, '-i', absPath, '-map', `0:${streamIdx}`]);
        }
        return res.status(400).end();
    });

    // ─── Quick Watch (ephemeral stream) ───
    // Adds a torrent to a temp store for watch-without-download: fetch only what's
    // played, never saved to the library/Downloads, and removed (files deleted) on
    // stop. No verifyUser — loopback only, like the other stream endpoints.
    app.post('/api/stream-add', (req, res) => {
        const { magnet } = req.body || {};
        if (!magnet) return res.status(400).json({ error: 'Magnet required' });
        const hashMatch = String(magnet).match(/btih:([a-fA-F0-9]{40})/i);
        const hash = hashMatch ? hashMatch[1].toLowerCase() : null;

        // Reuse if already active (ephemeral or a normal download).
        const existing = hash ? client.get(hash) : null;
        if (existing) {
            return res.json({ infoHash: existing.infoHash, ephemeral: ephemeralHashes.has(existing.infoHash) });
        }

        try {
            const torrent = client.add(magnet, getTorrentAddOptions(magnet, streamTmpDir()));
            const infoHash = torrent.infoHash || hash;
            if (infoHash) {
                ephemeralHashes.add(infoHash);
                magnetsByHash.set(infoHash, magnet);
            }
            // Once metadata is in, deselect everything so nothing downloads in the
            // background — only the pieces the player reads get fetched.
            torrent.on('metadata', () => {
                try { torrent.deselect(0, torrent.pieces.length - 1, 0); } catch { /* ignore */ }
                try { (torrent.files || []).forEach(f => f.deselect()); } catch { /* ignore */ }
            });
            torrent.on('error', (e) => { if (process.env.VORTEX_DEBUG) console.error('[QuickWatch] error:', e?.message); });
            console.log('▶ Quick-Watch (ephemeral):', infoHash);
            res.json({ infoHash, ephemeral: true });
        } catch (err) {
            if (hash) { const ex = client.get(hash); if (ex) return res.json({ infoHash: ex.infoHash }); }
            res.status(500).json({ error: err.message || 'Failed to start stream' });
        }
    });

    app.post('/api/stream-stop/:infoHash', (req, res) => {
        const hash = (req.params.infoHash || '').toLowerCase();
        if (!ephemeralHashes.has(hash)) return res.json({ ok: true, note: 'not ephemeral' });
        ephemeralHashes.delete(hash);
        try {
            client.remove(hash, { destroyStore: true }, () => { });
            console.log('🗑 Quick-Watch stopped & purged:', hash);
        } catch { /* ignore */ }
        res.json({ ok: true });
    });

    // ─── Torrent File List ───
    app.get('/api/torrents/:infoHash/files', (req, res) => {
        const hash = (req.params.infoHash || '').toLowerCase();
        const torrent = client.torrents.find(t => (t.infoHash || '').toLowerCase() === hash);
        if (!torrent) return res.json([]);
        const pausedFiles = pausedFilesByHash.get(torrent.infoHash) || new Set();
        const files = (torrent.files || []).map(f => {
            const len = f.length || 0;
            const prog = Math.min(f.progress || 0, 1);
            const downloaded = f.downloaded != null ? f.downloaded : Math.round(prog * len);
            const paused = pausedFiles.has(f.path);
            return {
                name: f.name,
                path: f.path,
                length: len,
                downloaded,
                progress: prog,
                selected: !paused,
                paused,
            };
        });
        res.json(files);
    });

    // ─── Pause/Resume Single Torrent File ───
    app.post('/api/torrents/:infoHash/files/selection', verifyUser, (req, res) => {
        const hash = (req.params.infoHash || '').toLowerCase();
        const { path: filePath, action } = req.body || {};
        if (!filePath || typeof filePath !== 'string') {
            return res.status(400).json({ error: 'File path is required' });
        }
        if (action !== 'pause' && action !== 'resume') {
            return res.status(400).json({ error: 'Action must be pause or resume' });
        }

        const torrent = client.torrents.find(t => (t.infoHash || '').toLowerCase() === hash);
        if (!torrent) return res.status(404).json({ error: 'Torrent not found or not active' });
        if (torrent.progress === 1) return res.status(400).json({ error: 'Completed torrents cannot be changed' });

        const target = (torrent.files || []).find(f => f.path === filePath);
        if (!target) return res.status(404).json({ error: 'File not found in torrent' });

        const pausedFiles = getPausedFileSet(torrent.infoHash);
        const shouldPause = action === 'pause';

        try {
            if (shouldPause) {
                target.deselect();
                pausedFiles.add(target.path);
            } else {
                target.select();
                pausedFiles.delete(target.path);
                if (pausedFiles.size === 0) pausedFilesByHash.delete(torrent.infoHash);
            }

            const files = (torrent.files || []).map(f => {
                const len = f.length || 0;
                const prog = Math.min(f.progress || 0, 1);
                const downloaded = f.downloaded != null ? f.downloaded : Math.round(prog * len);
                const paused = (pausedFilesByHash.get(torrent.infoHash) || new Set()).has(f.path);
                return {
                    name: f.name,
                    path: f.path,
                    length: len,
                    downloaded,
                    progress: prog,
                    selected: !paused,
                    paused,
                };
            });
            res.json({ success: true, files });
        } catch (err) {
            res.status(500).json({ error: err.message || 'Failed to update file selection' });
        }
    });

    // ─── Poster search (TVmaze primary + iTunes fallback, no API keys needed) ───
    function httpGet(urlStr, timeout = 9000) {
        return new Promise((resolve) => {
            const mod = urlStr.startsWith('https') ? https : http;
            const req2 = mod.get(urlStr, { headers: { Accept: 'application/json', 'User-Agent': 'VortexApp/1.0' }, timeout }, (r) => {
                const chunks = [];
                r.on('data', c => chunks.push(c));
                r.on('end', () => { try { resolve(JSON.parse(Buffer.concat(chunks).toString('utf8'))); } catch { resolve(null); } });
            });
            req2.on('error', () => resolve(null));
            req2.on('timeout', () => { req2.destroy(); resolve(null); });
        });
    }

    function httpPost(urlStr, body, timeout = 9000) {
        return new Promise((resolve) => {
            const payload = Buffer.from(JSON.stringify(body));
            const u = new URL(urlStr);
            const req2 = https.request({
                hostname: u.hostname, path: u.pathname + u.search, method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Content-Length': payload.length, Accept: 'application/json', 'User-Agent': 'VortexApp/1.0' },
                timeout,
            }, (r) => {
                const chunks = [];
                r.on('data', c => chunks.push(c));
                r.on('end', () => { try { resolve(JSON.parse(Buffer.concat(chunks).toString('utf8'))); } catch { resolve(null); } });
            });
            req2.on('error', () => resolve(null));
            req2.on('timeout', () => { req2.destroy(); resolve(null); });
            req2.write(payload);
            req2.end();
        });
    }

    function cleanTitle(q) {
        const QUALITY_TAGS = ['1080p', '720p', '4k', '2160p', 'bluray', 'bdrip', 'webrip', 'webdl', 'hdtv', 'x264', 'x265', 'hevc'];

        // Extract bracket content (e.g., "[Taare Zameen Par]") as canonical alt title
        const brackets = [...q.matchAll(/\[([^\]]{2,})\]/g)].map(m => m[1].trim());
        // Filter out quality tags or short strings from being the "altTitle"
        const altTitle = brackets.find(t => t.length > 2 && !QUALITY_TAGS.some(tag => t.toLowerCase().includes(tag))) || '';

        let s = q.replace(/\[.*?\]/g, ' ').replace(/\(.*?\)/g, ' ').replace(/[._]/g, ' ');
        const yearMatch = s.match(/\b((?:19|20)\d{2})\b/);
        const year = yearMatch ? yearMatch[1] : '';
        const cutIdx = s.search(/\b((?:19|20)\d{2}|720p|1080p|2160p|4k|bluray|bdrip|hdtv|webrip|web[-. ]?dl|x264|x265|hevc|xvid|remux|repack|proper|s\d{1,2}e\d{1,2}|ep\d+|hc)\b/i);
        s = (cutIdx > 2 ? s.slice(0, cutIdx) : s).replace(/\s*-\s*[A-Za-z0-9]{2,}$/, '').replace(/\s+/g, ' ').trim();
        return { clean: s, year, altTitle };
    }

    // In-memory poster cache — avoids re-hitting external APIs for same query
    const posterCache = new Map();

    app.get('/api/poster', async (req, res) => {
        const q = (req.query.q || '').toString().trim();
        if (!q) return res.status(400).json({ error: 'Missing query' });
        const { clean, year, altTitle } = cleanTitle(q);
        if (!clean) return res.json({ poster: null });

        async function tryTvmaze(title) {
            const tvData = await httpGet(`https://api.tvmaze.com/search/shows?q=${encodeURIComponent(title)}`, 5000);
            if (!Array.isArray(tvData) || !tvData.length) throw new Error('no results');
            let best = null, bestScore = -1;
            for (const { score, show } of tvData) {
                if (!show?.image?.original && !show?.image?.medium) continue;
                const nameMatch = (show.name || '').toLowerCase() === title.toLowerCase() ? 10 : score * 5;
                const yearBonus = year && (show.premiered || '').startsWith(year) ? 3 : 0;
                const total = nameMatch + yearBonus;
                if (total > bestScore) { bestScore = total; best = show; }
            }
            if (!best || bestScore < 7) throw new Error('no confident match');
            return { poster: best.image.original || best.image.medium, title: best.name, year: (best.premiered || '').slice(0, 4), type: 'tvShow' };
        }

        async function tryAniList(title) {
            const alQuery = 'query($s:String){Page(perPage:5){media(search:$s,type:ANIME){title{romaji english}coverImage{extraLarge large}startDate{year}}}}';
            const alData = await httpPost('https://graphql.anilist.co', { query: alQuery, variables: { s: title } }, 5000);
            const alList = alData?.data?.Page?.media || [];
            if (!alList.length) throw new Error('no results');
            let best = null, bestScore = -1;
            for (const a of alList) {
                const img = a.coverImage?.extraLarge || a.coverImage?.large;
                if (!img) continue;
                const cl = title.toLowerCase();
                const titles = [a.title?.english, a.title?.romaji].filter(Boolean).map(t => t.toLowerCase());
                const nameMatch = titles.some(t => t === cl) ? 10 : titles.some(t => t.includes(cl) || cl.includes(t)) ? 5 : 0;
                const yearBonus = year && String(a.startDate?.year) === year ? 3 : 0;
                const total = nameMatch + yearBonus;
                if (total > bestScore) { bestScore = total; best = { img, title: a.title?.english || a.title?.romaji, year: String(a.startDate?.year || '') }; }
            }
            if (!best || bestScore < 5) throw new Error('no confident match');
            return { poster: best.img, title: best.title, year: best.year, type: 'anime' };
        }

        async function tryJikan(title) {
            const jData = await httpGet(`https://api.jikan.moe/v4/anime?q=${encodeURIComponent(title)}&limit=5&sfw`, 5000);
            if (!Array.isArray(jData?.data) || !jData.data.length) throw new Error('no results');
            let best = null, bestScore = -1;
            for (const a of jData.data) {
                const img = a.images?.jpg?.large_image_url || a.images?.jpg?.image_url;
                if (!img) continue;
                const titles = [a.title, a.title_english, ...(a.titles || []).map(t => t.title)].filter(Boolean);
                const cl = title.toLowerCase();
                const nameMatch = titles.some(t => t.toLowerCase() === cl) ? 10 : titles.some(t => t.toLowerCase().includes(cl) || cl.includes(t.toLowerCase())) ? 5 : 0;
                const yearBonus = year && String(a.year) === year ? 3 : 0;
                const total = nameMatch + yearBonus;
                if (total > bestScore) { bestScore = total; best = { img, title: a.title_english || a.title, year: String(a.year || '') }; }
            }
            if (!best || bestScore < 5) throw new Error('no confident match');
            return { poster: best.img, title: best.title, year: best.year, type: 'anime' };
        }

        async function tryKitsu(title) {
            const kData = await httpGet(`https://kitsu.io/api/edge/anime?filter[text]=${encodeURIComponent(title)}&page[limit]=5`, 5000);
            if (!Array.isArray(kData?.data) || !kData.data.length) throw new Error('no results');
            let best = null, bestScore = -1;
            for (const a of kData.data) {
                const img = a.attributes?.posterImage?.large || a.attributes?.posterImage?.medium;
                if (!img) continue;
                const cl = title.toLowerCase();
                const titleEn = (a.attributes?.titles?.en || a.attributes?.titles?.en_jp || a.attributes?.canonicalTitle || '').toLowerCase();
                const nameMatch = titleEn === cl ? 10 : (titleEn.includes(cl) || cl.includes(titleEn)) ? 5 : 0;
                const startYear = (a.attributes?.startDate || '').slice(0, 4);
                const yearBonus = year && startYear === year ? 3 : 0;
                const total = nameMatch + yearBonus;
                if (total > bestScore) { bestScore = total; best = { img, title: a.attributes?.canonicalTitle || title, year: startYear }; }
            }
            if (!best || bestScore < 5) throw new Error('no confident match');
            return { poster: best.img, title: best.title, year: best.year, type: 'anime' };
        }

        async function tryTmdb(title, yearHint) {
            if (!settings.tmdbApiKey) throw new Error('no tmdb api key');
            const url = `https://api.themoviedb.org/3/search/multi?api_key=${settings.tmdbApiKey}&query=${encodeURIComponent(title)}&include_adult=false`;
            const data = await httpGet(url, 5000);
            const list = data?.results || [];
            if (!list.length) throw new Error('no results');

            let best = null, bestScore = -1;
            for (const item of list) {
                const img = item.poster_path;
                if (!img) continue;

                const itemTitle = item.title || item.name || item.original_title || item.original_name;
                const cl = title.toLowerCase();
                const itl = itemTitle.toLowerCase();

                let score = 0;
                if (itl === cl) score += 10;
                else if (itl.includes(cl) || cl.includes(itl)) score += 5;

                const releaseDate = item.release_date || item.first_air_date || '';
                const itemYear = releaseDate.slice(0, 4);
                if (yearHint && itemYear === yearHint) score += 5;

                if (score > bestScore) {
                    bestScore = score;
                    best = {
                        poster: `https://image.tmdb.org/t/p/w500${img}`,
                        title: itemTitle,
                        year: itemYear,
                        type: item.media_type
                    };
                }
            }
            if (!best || bestScore < 5) throw new Error('no confident match');
            return best;
        }

        async function tryWikipedia(title) {
            const attempts = [
                title,
                ...(year ? [`${title} (${year} film)`, `${title} (film)`] : [`${title} (film)`]),
            ];
            for (const attempt of attempts) {
                const slug = attempt.trim().replace(/\s+/g, '_');
                const wData = await httpGet(`https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(slug)}`, 5000);
                if (wData?.type === 'standard' && wData.thumbnail?.source) {
                    // Replace pixel size with 500px — valid Wikimedia thumbnail URL
                    const poster = wData.thumbnail.source.replace(/\/\d+px-/, '/500px-');
                    return { poster, title: wData.title, year: (wData.description || '').match(/\b((?:19|20)\d{2})\b/)?.[1] || year, type: 'movie' };
                }
            }
            // Search API fallback
            const searchData = await httpGet(
                `https://en.wikipedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(title + (year ? ' film ' + year : ' film'))}&srlimit=3&format=json`,
                5000
            );
            for (const hit of (searchData?.query?.search || [])) {
                const slug = hit.title.replace(/\s+/g, '_');
                const wData = await httpGet(`https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(slug)}`, 5000);
                if (wData?.type === 'standard' && wData.thumbnail?.source) {
                    const poster = wData.thumbnail.source.replace(/\/\d+px-/, '/500px-');
                    return { poster, title: wData.title, year, type: 'movie' };
                }
            }
            throw new Error('no match');
        }

        const cacheKey = `${clean}|${altTitle}|${year}`;
        if (posterCache.has(cacheKey)) return res.json(posterCache.get(cacheKey));

        console.log(`🎬 Poster search: "${clean}" (Year: ${year}, Alt: ${altTitle})`);

        // Phase 1: TMDb Try
        const QUALITY_TAGS = ['1080p', '720p', '4k', '2160p', 'bluray', 'bdrip', 'webrip', 'webdl', 'hdtv', 'x264', 'x265', 'hevc'];
        const isRealTitle = (t) => t && t.length > 2 && !QUALITY_TAGS.some(tag => t.toLowerCase().includes(tag));

        try {
            let result = null;
            try {
                result = await tryTmdb(clean, year);
            } catch (e) {
                if (altTitle && isRealTitle(altTitle)) {
                    result = await tryTmdb(altTitle, year);
                } else {
                    throw e;
                }
            }
            console.log(`   ✓ TMDb match: ${result.title} (${result.year})`);
            posterCache.set(cacheKey, result);
            return res.json(result);
        } catch {
            console.log(`   ✗ TMDb failed, trying fallbacks...`);
        }

        // Phase 2: AltTitle Wikipedia (legacy logic)
        if (altTitle && isRealTitle(altTitle)) {
            try {
                const result = await tryWikipedia(altTitle);
                posterCache.set(cacheKey, result);
                return res.json(result);
            } catch { }
        }

        // Phase 3: Race all sources simultaneously — first confident match wins
        try {
            const result = await Promise.any([
                tryTvmaze(clean),
                tryAniList(clean),
                tryJikan(clean),
                tryKitsu(clean),
                tryWikipedia(clean),
            ]);
            posterCache.set(cacheKey, result);
            return res.json(result);
        } catch {
            const noResult = { poster: null };
            posterCache.set(cacheKey, noResult);
            return res.json(noResult);
        }
    });

    // ─── Subtitles (OpenSubtitles.com REST v2) ───
    const OSUB_UA = 'VortexApp v1.0';
    const OSUB_AGENT = new https.Agent({ keepAlive: true });

    function isTransientSubtitleError(err) {
        if (!err) return false;
        const code = String(err.code || '').toUpperCase();
        if (['ECONNRESET', 'ETIMEDOUT', 'EAI_AGAIN', 'ECONNREFUSED', 'ENOTFOUND'].includes(code)) return true;
        const msg = String(err.message || '').toLowerCase();
        return msg.includes('timeout') || msg.includes('socket hang up') || msg.includes('connection reset');
    }

    function wait(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    async function osRequestWithRetry(options, body, maxAttempts = 3) {
        let lastErr = null;
        for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
            try {
                return await osRequest(options, body);
            } catch (err) {
                lastErr = err;
                if (!isTransientSubtitleError(err) || attempt >= maxAttempts) {
                    throw err;
                }
                const backoffMs = 250 * attempt;
                if (process.env.VORTEX_DEBUG) {
                    console.log(`[Subtitles] transient network error (${err.code || err.message}), retry ${attempt}/${maxAttempts} in ${backoffMs}ms`);
                }
                await wait(backoffMs);
            }
        }
        throw lastErr || new Error('subtitle request failed');
    }

    // Shared helper: exchange fileId → temp link → download to disk
    async function downloadSubtitleFile(apiKey, fileId, filename, destFolder) {
        fs.mkdirSync(path.resolve(destFolder), { recursive: true });
        const tokenBody = Buffer.from(JSON.stringify({ file_id: fileId }));
        const tokenResp = await osRequestWithRetry({
            hostname: 'api.opensubtitles.com',
            path: '/api/v1/download',
            method: 'POST',
            headers: { 'Api-Key': apiKey, 'Content-Type': 'application/json', 'User-Agent': OSUB_UA, 'Content-Length': tokenBody.length },
            timeout: 10000,
        }, tokenBody);
        let tokenData;
        try {
            tokenData = JSON.parse(tokenResp.body);
        } catch {
            throw new Error(`OpenSubtitles returned non-JSON (HTTP ${tokenResp.status}) — possibly rate-limited, try again later`);
        }
        if (!tokenData.link) throw new Error(tokenData.message || 'No download link returned');
        const rawName = filename || tokenData.file_name || 'subtitle';
        const saveName = /\.(srt|ass|sub|ssa)$/i.test(rawName) ? rawName : rawName + '.srt';
        const savePath = path.join(path.resolve(destFolder), saveName);
        await new Promise((resolve2, reject2) => {
            const dlUrl = new URL(tokenData.link);
            https.get({ hostname: dlUrl.hostname, path: dlUrl.pathname + dlUrl.search, headers: { 'User-Agent': OSUB_UA }, timeout: 15000 }, (dlRes) => {
                if (dlRes.statusCode !== 200) return reject2(new Error(`HTTP ${dlRes.statusCode}`));
                const out = fs.createWriteStream(savePath);
                dlRes.pipe(out);
                out.on('finish', resolve2);
                out.on('error', reject2);
                dlRes.on('error', reject2);
            }).on('error', reject2).on('timeout', function () { this.destroy(); reject2(new Error('timeout')); });
        });
        return savePath;
    }

    // Generic HTTPS request helper (POST or GET) — follows 301/302 redirects
    function osRequest(options, body, _redirectCount = 0) {
        return new Promise((resolve, reject) => {
            const requestOptions = {
                ...options,
                family: 4,
                agent: OSUB_AGENT,
            };
            const req = https.request(requestOptions, (res) => {
                // Follow redirects (max 5)
                if ((res.statusCode === 301 || res.statusCode === 302) && res.headers.location && _redirectCount < 5) {
                    res.resume(); // drain
                    let loc = res.headers.location;
                    // Relative redirect → keep same host
                    if (loc.startsWith('/')) {
                        loc = `https://${requestOptions.hostname}${loc}`;
                    }
                    const u = new URL(loc);
                    const newOpts = {
                        hostname: u.hostname,
                        path: u.pathname + u.search,
                        method: requestOptions.method || 'GET',
                        headers: requestOptions.headers,
                        timeout: requestOptions.timeout || 15000,
                    };
                    osRequest(newOpts, null, _redirectCount + 1).then(resolve).catch(reject);
                    return;
                }
                const chunks = [];
                res.on('data', c => chunks.push(c));
                res.on('end', () => resolve({ status: res.statusCode, body: Buffer.concat(chunks).toString('utf8') }));
            });
            req.on('error', reject);
            req.on('timeout', () => { req.destroy(); reject(new Error('timeout')); });
            if (body) req.write(body);
            req.end();
        });
    }

    // ── OpenSubtitles movie-hash algorithm ────────────────────────────────────────
    // Read first + last 64 KB, sum all 8-byte LE uint64 chunks + filesize, mod 2^64
    // Returns { hash: '16-char-hex', size: BigInt } or null on any error
    function computeMovieHash(filePath) {
        const CHUNK = 65536; // 64 KB
        try {
            const stat = fs.statSync(filePath);
            const fileSize = BigInt(stat.size);
            if (fileSize < BigInt(CHUNK * 2)) return null; // file too small

            const buf1 = Buffer.alloc(CHUNK);
            const buf2 = Buffer.alloc(CHUNK);
            const fd = fs.openSync(filePath, 'r');
            fs.readSync(fd, buf1, 0, CHUNK, 0);
            fs.readSync(fd, buf2, 0, CHUNK, Number(fileSize) - CHUNK);
            fs.closeSync(fd);

            const MASK = (1n << 64n) - 1n;
            let hash = fileSize;
            for (let i = 0; i < CHUNK; i += 8) {
                hash = (hash + buf1.readBigUInt64LE(i)) & MASK;
                hash = (hash + buf2.readBigUInt64LE(i)) & MASK;
            }
            return { hash: hash.toString(16).padStart(16, '0'), size: fileSize };
        } catch { return null; }
    }

    function mapOsItems(items, lang, exactFlag = false) {
        return items.map((item) => {
            const a = item.attributes || {};
            const file = (a.files || [])[0] || {};
            return {
                id: String(file.file_id || item.id),
                fileId: file.file_id,
                name: file.file_name || a.release || 'subtitle',
                lang: a.language || lang,
                langCode: a.language || lang,
                rating: String(a.ratings || ''),
                downloads: String(a.download_count || 0),
                hearing: !!a.hearing_impaired,
                format: a.format || 'srt',
                movieName: (a.feature_details || {}).movie_name || '',
                year: String((a.feature_details || {}).year || ''),
                exact: exactFlag,
            };
        });
    }

    async function osSearch(apiKey, params, lang) {
        const qs = new URLSearchParams(params).toString();
        const r = await osRequestWithRetry({
            hostname: 'api.opensubtitles.com',
            path: `/api/v1/subtitles?${qs}`,
            method: 'GET',
            headers: { 'Api-Key': apiKey, 'Content-Type': 'application/json', 'User-Agent': OSUB_UA },
            timeout: 15000,
        });
        if (r.status !== 200) return [];
        try {
            const data = JSON.parse(r.body);
            return data.data || [];
        } catch {
            console.log(`🔕 osSearch: API returned non-JSON (status ${r.status})`);
            return [];
        }
    }

    app.get('/api/subtitles', async (req, res) => {
        const query = typeof req.query.name === 'string' ? req.query.name : '';         // text query (fallback)
        const filePath = typeof req.query.file === 'string' ? req.query.file : '';      // full path to video file (hash search)
        const lang = (typeof req.query.lang === 'string' && req.query.lang.trim()) ? req.query.lang.trim() : 'en';
        if (!query && !filePath) return res.status(400).json({ error: 'name or file required' });

        const apiKey = settings.opensubtitlesApiKey;
        if (!apiKey) return res.status(503).json({ error: 'NO_API_KEY', message: 'OpenSubtitles API key not set. Add it in Settings → Subtitles.' });

        let exactResults = [];
        let textResults = [];
        let hashError = null;
        let textError = null;

        // ── 1. Hash search (exact match) ─────────────────────────────────────
        if (filePath) {
            try {
                // Safety: path must be within downloadPath
                if (!path.resolve(filePath).startsWith(path.resolve(settings.downloadPath))) {
                    return res.status(403).json({ error: 'File outside download directory' });
                }
                const hashed = computeMovieHash(filePath);
                if (hashed) {
                    const items = await osSearch(apiKey, {
                        moviehash: hashed.hash,
                        moviebytesize: String(hashed.size),
                        languages: lang,
                        order_by: 'download_count',
                        order_direction: 'desc',
                    }, lang);
                    exactResults = mapOsItems(items.slice(0, 10), lang, true);
                    console.log(`🎯 Hash search for ${path.basename(filePath)}: hash=${hashed.hash} → ${exactResults.length} exact results`);
                }
            } catch (e) {
                hashError = e;
                console.warn('Subtitle hash search error:', e.code || e.message || String(e));
            }
        }

        // ── 2. Text search ───────────────────────────────────────────────────
        if (query) {
            try {
                const items = await osSearch(apiKey, {
                    query,
                    languages: lang,
                    order_by: 'download_count',
                    order_direction: 'desc',
                }, lang);
                // De-duplicate: skip items already returned from hash search
                const exactIds = new Set(exactResults.map(r => r.id));
                const unique = items.filter(i => {
                    const f = (i.attributes?.files || [])[0] || {};
                    return !exactIds.has(String(f.file_id || i.id));
                });
                textResults = mapOsItems(unique.slice(0, 20), lang, false);
            } catch (e) {
                textError = e;
                console.warn('Subtitle text search error:', e.code || e.message || String(e));
            }
        }

        const mergedResults = [...exactResults, ...textResults];
        if (mergedResults.length > 0 || (!hashError && !textError)) {
            return res.json(mergedResults);
        }

        const primaryError = textError || hashError;
        if (isTransientSubtitleError(primaryError)) {
            console.warn('Subtitle search transient error:', primaryError.code || primaryError.message);
            // Keep search UX stable during temporary upstream issues.
            return res.status(200).json([]);
        }

        const msg = primaryError?.message || 'subtitle search failed';
        console.error('Subtitle search error:', msg);
        return res.status(500).json({ error: msg });
    });

    // Download subtitle via OpenSubtitles v2 token endpoint
    app.post('/api/subtitles/download', async (req, res) => {
        const { fileId, filename, destFolder } = req.body;
        const apiKey = settings.opensubtitlesApiKey;
        if (!apiKey) return res.status(503).json({ error: 'API key not configured' });
        if (!fileId) return res.status(400).json({ error: 'fileId required' });

        const baseDest = destFolder || settings.downloadPath;
        const resolved = path.resolve(baseDest);
        if (!resolved.startsWith(path.resolve(settings.downloadPath))) {
            return res.status(403).json({ error: 'Destination outside download directory' });
        }
        try {
            const savePath = await downloadSubtitleFile(apiKey, fileId, filename, resolved);
            console.log(`📝 Subtitle saved: ${savePath}`);
            res.json({ success: true, path: savePath, filename: path.basename(savePath) });
        } catch (e) {
            console.error('Subtitle download error:', e.message);
            res.status(500).json({ error: e.message });
        }
    });

    // ── Library Subtitle Status ──
    // Check which library items already have subtitle files
    app.get('/api/library/subtitles-status', (req, res) => {
        const SUB_EXTS = new Set(['.srt', '.sub', '.ass', '.ssa', '.vtt', '.idx']);
        const dlPath = settings.downloadPath;
        if (!fs.existsSync(dlPath)) return res.json({});

        const status = {};
        try {
            const entries = fs.readdirSync(dlPath, { withFileTypes: true });
            for (const e of entries) {
                if (e.name.startsWith('.') || e.name === '$RECYCLE.BIN') continue;
                const fullPath = path.join(dlPath, e.name);
                if (e.isDirectory()) {
                    // Check if any subtitle file exists inside the folder
                    try {
                        const inner = fs.readdirSync(fullPath);
                        const hasSub = inner.some(f => SUB_EXTS.has(path.extname(f).toLowerCase()));
                        status[e.name] = hasSub;
                    } catch { status[e.name] = false; }
                } else {
                    // Check if a subtitle file with same base name exists
                    const baseName = path.parse(e.name).name;
                    const dirFiles = entries.map(en => en.name);
                    const hasSub = dirFiles.some(f => {
                        const fb = path.parse(f).name;
                        const fExt = path.extname(f).toLowerCase();
                        return SUB_EXTS.has(fExt) && fb.startsWith(baseName);
                    });
                    status[e.name] = hasSub;
                }
            }
        } catch { /* ignore */ }
        res.json(status);
    });

    // Manual auto-subtitle trigger for a library item
    app.post('/api/library/auto-subtitle', async (req, res) => {
        const { itemName, itemPath, isDir } = req.body;
        if (!itemName) return res.status(400).json({ error: 'itemName required' });

        const apiKey = settings.opensubtitlesApiKey;
        if (!apiKey) return res.status(503).json({ error: 'NO_API_KEY', message: 'OpenSubtitles API key not set.' });

        // Build search name from the item name
        const searchName = (itemName || '')
            .replace(/\.[^.]+$/, '')
            .replace(/[._+\-\[\]\(\)]+/g, ' ')
            .replace(/\b(720p|1080p|2160p|4k|bluray|brrip|bdrip|webrip|web[. -]?dl|x264|x265|hevc|avc|xvid|hdr|dv|dts|aac|ac3|remux|repack|proper|extended)\b/gi, ' ')
            .replace(/\s+/g, ' ')
            .trim();

        const destFolder = itemPath && isDir ? itemPath : (itemPath ? path.dirname(itemPath) : settings.downloadPath);
        const lang = settings.subtitleLang || 'en';

        console.log(`🎬 Manual auto-subtitle: "${searchName}" [${lang}] → ${destFolder}`);
        try {
            const items = await osSearch(apiKey, {
                query: searchName,
                languages: lang,
                order_by: 'download_count',
                order_direction: 'desc',
            }, lang);
            const mapped = mapOsItems(items.slice(0, 1), lang);
            if (!mapped.length || !mapped[0].fileId) {
                return res.json({ success: false, message: 'No subtitles found for this item.' });
            }
            const sub = mapped[0];
            const saved = await downloadSubtitleFile(apiKey, sub.fileId, sub.name, destFolder);
            console.log(`✅ Manual auto-subtitle saved: ${path.basename(saved)}`);
            res.json({ success: true, filename: path.basename(saved), lang });
        } catch (e) {
            console.error(`🔕 Manual auto-subtitle error: ${e.message}`);
            res.status(500).json({ error: e.message });
        }
    });

    // ─── Start ───
    const PORT = Number(process.env.VORTEX_ENGINE_PORT) || 3001;
    server.on('error', (err) => {
        if (err && err.code === 'EADDRINUSE') {
            console.error(`\n✖ Port ${PORT} is already in use — another Vortex engine is likely still running.`);
            console.error('  Close the existing instance (or wait for it to exit) and relaunch.');
            // Exit cleanly so the desktop shell's restart logic can decide what to do
            // instead of crashing on an unhandled 'error' event.
            process.exit(1);
        }
        console.error('Engine server error:', err);
        process.exit(1);
    });
    // Bind to loopback only — the API must never be reachable from the LAN.
    server.listen(PORT, '127.0.0.1', () => {
        console.log(`\n⚡ Vortex Backend on http://127.0.0.1:${PORT}`);
        console.log(`📂 Downloads → ${settings.downloadPath}`);
        console.log(`🔍 Providers: ${enabledProviders.join(', ')}`);
        console.log(`🌐 Swarm Tuning: maxConns=${ENGINE_MAX_CONNS} uploadSlots=${ENGINE_TORRENT_UPLOAD_SLOTS} maxWebConns=${ENGINE_TORRENT_MAX_WEB_CONNS}`);
        console.log(`⚡ DL Limit: ${settings.globalDownloadLimit || '∞'} MB/s | UL Limit: ${settings.globalUploadLimit || '∞'} MB/s\n`);
    });
}

startServer().catch(console.error);
