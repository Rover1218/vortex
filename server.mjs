import express from 'express';
import http from 'http';
import https from 'https';
import { Server } from 'socket.io';
import cors from 'cors';
import WebTorrent from 'webtorrent';
import path from 'path';
import fs from 'fs';
import os from 'os';
import zlib from 'zlib';
import { execSync } from 'child_process';

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: "*" } });

app.use(cors());
app.use(express.json());

// ─── Settings ───
const SETTINGS_FILE = path.join(process.cwd(), 'settings.json');
const TORRENTS_FILE = path.join(process.cwd(), 'torrents.json');
const STATS_FILE = path.join(process.cwd(), 'stats.json');
const DEFAULT_SETTINGS = { downloadPath: path.join(process.cwd(), 'downloads'), globalDownloadLimit: 0, globalUploadLimit: 0, opensubtitlesApiKey: '', tmdbApiKey: '', autoSubtitle: false, subtitleLang: 'en' };

let settings = { ...DEFAULT_SETTINGS };

function loadSettings() {
    if (fs.existsSync(SETTINGS_FILE)) {
        try {
            const saved = JSON.parse(fs.readFileSync(SETTINGS_FILE, 'utf-8'));
            settings = { ...DEFAULT_SETTINGS, downloadPath: saved.downloadPath || DEFAULT_SETTINGS.downloadPath, globalDownloadLimit: saved.globalDownloadLimit || 0, globalUploadLimit: saved.globalUploadLimit || 0, opensubtitlesApiKey: saved.opensubtitlesApiKey || '', tmdbApiKey: saved.tmdbApiKey || '', autoSubtitle: !!saved.autoSubtitle, subtitleLang: saved.subtitleLang || 'en' };
        } catch { }
    }
}
function saveSettings() {
    fs.writeFileSync(SETTINGS_FILE, JSON.stringify(settings, null, 2));
    if (!fs.existsSync(settings.downloadPath)) fs.mkdirSync(settings.downloadPath, { recursive: true });
}
loadSettings();
saveSettings();

// ─── Torrent Persistence ───
const completedTorrents = new Map();
const pausedTorrents = new Map();
const magnetsByHash = new Map(); // tracks original magnet URIs by infoHash
const addedAtMap = new Map();   // tracks when each torrent was first added
const namesMap = new Map();     // persistent name store — survives state transitions
const pausedFilesByHash = new Map(); // tracks per-file paused state while torrent is active
let lifetimeTotals = { downloaded: 0, seeded: 0 };
let lastLifetimeTickAt = Date.now();

function toFiniteNonNegative(value) {
    const n = Number(value);
    return Number.isFinite(n) && n > 0 ? n : 0;
}

function loadLifetimeTotals() {
    if (!fs.existsSync(STATS_FILE)) return;
    try {
        const saved = JSON.parse(fs.readFileSync(STATS_FILE, 'utf-8'));
        lifetimeTotals.downloaded = toFiniteNonNegative(saved.downloaded);
        lifetimeTotals.seeded = toFiniteNonNegative(saved.seeded);
    } catch {
        lifetimeTotals = { downloaded: 0, seeded: 0 };
    }
}

function saveLifetimeTotals() {
    lifetimeTotals.downloaded = toFiniteNonNegative(lifetimeTotals.downloaded);
    lifetimeTotals.seeded = toFiniteNonNegative(lifetimeTotals.seeded);
    fs.writeFileSync(STATS_FILE, JSON.stringify(lifetimeTotals, null, 2));
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
saveLifetimeTotals();

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

function loadSavedTorrents() {
    if (fs.existsSync(TORRENTS_FILE)) {
        try { return JSON.parse(fs.readFileSync(TORRENTS_FILE, 'utf-8')); } catch { return []; }
    }
    return [];
}

function saveTorrentList() {
    const list = [];
    for (const t of client.torrents) {
        const name = t.name || namesMap.get(t.infoHash) || getNameFromMagnet(magnetsByHash.get(t.infoHash));
        if (name) namesMap.set(t.infoHash, name); // keep namesMap current
        const uploadedNow = resolveUploaded(t.downloaded || 0, t.uploaded, t.ratio);
        if (t.progress === 1) {
            // Seeding is active work; persist separately so it can resume after restart.
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
    fs.writeFileSync(TORRENTS_FILE, JSON.stringify(list, null, 2));
}

// ─── Search Engine ───
let searchReady = true;

// ─── Custom Providers (direct API) ───────────────────────────────────────────

const TPB_TRACKERS = [
    'udp://tracker.opentrackr.org:1337/announce',
    'udp://open.tracker.cl:1337/announce',
    'udp://tracker.openbittorrent.com:6969/announce',
    'udp://tracker.leechers-paradise.org:6969/announce',
    'udp://tracker.torrent.eu.org:451/announce',
    'udp://tracker.tiny-vps.com:6969/announce',
    'http://tracker.tbp.pm:8080/announce',
    'udp://exodus.desync.com:6969/announce',
    'udp://tracker.internetwarriors.net:1337/announce',
    'udp://9.rarbg.com:2810/announce',
    'udp://tracker.dler.org:6969/announce',
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
];

const enabledProviders = CUSTOM_PROVIDERS.map(p => p.name);
console.log(`✓ Search providers (${enabledProviders.length}): ${enabledProviders.join(', ')}`);

// ─── WebTorrent Client ─── (tuned for 150 Mbps)
const client = new WebTorrent({
    maxConns: 300,       // default 55 — more peers = faster
    dht: true,
    lsd: true,
    natUpnp: true,
    natPmp: true,
    webSeeds: true,
});
client.on('error', (err) => console.error('WebTorrent error:', err.message));

// Apply bandwidth limits — also propagates to currently active torrent wires
function applyBandwidthLimits() {
    const dlRate = settings.globalDownloadLimit > 0 ? Math.round(settings.globalDownloadLimit * 1024 * 1024) : -1;
    const ulRate = settings.globalUploadLimit > 0 ? Math.round(settings.globalUploadLimit * 1024 * 1024) : -1;

    // Client-level throttle affects new wires
    try { client.throttleDownload(dlRate); } catch { }
    try { client.throttleUpload(ulRate); } catch { }

    // Propagate immediately to all currently open wires
    for (const torrent of client.torrents) {
        for (const wire of (torrent.wires || [])) {
            try {
                // throttle-group sets rate via these internal refs
                if (wire._downloadThrottle?.setRate) wire._downloadThrottle.setRate(dlRate < 0 ? Infinity : dlRate);
                if (wire._uploadThrottle?.setRate) wire._uploadThrottle.setRate(ulRate < 0 ? Infinity : ulRate);
                // fallback: direct property
                if (wire.downloadThrottle != null) wire.downloadThrottle = dlRate < 0 ? 0 : dlRate;
                if (wire.uploadThrottle != null) wire.uploadThrottle = ulRate < 0 ? 0 : ulRate;
            } catch { /* ignore per-wire errors */ }
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
const savedTorrents = loadSavedTorrents();

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
                client.add(st.magnet, { path: settings.downloadPath, announce: TPB_TRACKERS, maxWebConns: 20 }, (torrent) => {
                    const resolvedName = torrent.name || st.name || getNameFromMagnet(st.magnet);
                    if (resolvedName) namesMap.set(torrent.infoHash, resolvedName);
                    console.log(`  ▶ Restored seeding: ${resolvedName || torrent.infoHash}`);
                    if (torrent.infoHash) {
                        magnetsByHash.set(torrent.infoHash, torrent.magnetURI || st.magnet);
                        if (!addedAtMap.has(torrent.infoHash)) addedAtMap.set(torrent.infoHash, st.addedAt || Date.now());
                    }
                });
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
                client.add(st.magnet, { path: settings.downloadPath, announce: TPB_TRACKERS, maxWebConns: 20 }, (torrent) => {
                    // Use saved name until fresh metadata arrives
                    const resolvedName = torrent.name || st.name || getNameFromMagnet(st.magnet);
                    if (resolvedName) namesMap.set(torrent.infoHash, resolvedName);
                    console.log(`  ✓ Restored: ${resolvedName || torrent.infoHash}`);
                    if (torrent.infoHash) {
                        magnetsByHash.set(torrent.infoHash, torrent.magnetURI || st.magnet);
                        if (!addedAtMap.has(torrent.infoHash)) addedAtMap.set(torrent.infoHash, st.addedAt || Date.now());
                    }
                });
            } catch (err) { console.error(`  \u2717 Failed: ${err.message}`); }
        }
    });
}

// ─── Real-Time Status Broadcast ───
setInterval(() => {
    // Continuously account true network bytes transferred since last tick.
    const now = Date.now();
    const elapsedMs = now - lastLifetimeTickAt;
    lastLifetimeTickAt = now;
    accumulateLifetimeFromSpeeds(client.downloadSpeed || 0, client.uploadSpeed || 0, elapsedMs);

    const activeTorrents = client.torrents.map(t => ({
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
        settings
    });
}, 1000);

// ═══════════════════════════════════
//  API ROUTES
// ═══════════════════════════════════

app.get('/api/settings', (req, res) => res.json(settings));
app.post('/api/settings', (req, res) => {
    settings = {
        ...settings,
        downloadPath: req.body.downloadPath || settings.downloadPath,
        globalDownloadLimit: req.body.globalDownloadLimit ?? settings.globalDownloadLimit,
        globalUploadLimit: req.body.globalUploadLimit ?? settings.globalUploadLimit,
        opensubtitlesApiKey: req.body.opensubtitlesApiKey !== undefined ? req.body.opensubtitlesApiKey : settings.opensubtitlesApiKey,
        tmdbApiKey: req.body.tmdbApiKey !== undefined ? req.body.tmdbApiKey : settings.tmdbApiKey,
        autoSubtitle: req.body.autoSubtitle !== undefined ? !!req.body.autoSubtitle : settings.autoSubtitle,
        subtitleLang: req.body.subtitleLang !== undefined ? req.body.subtitleLang : settings.subtitleLang,
    };
    saveSettings();
    applyBandwidthLimits();
    // Emit updated settings immediately to all connected clients
    io.emit('settings-updated', settings);
    console.log(`⚙ Settings saved: path=${settings.downloadPath} dl=${settings.globalDownloadLimit} ul=${settings.globalUploadLimit}`);
    res.json(settings);
});

// Watch settings.json for external edits (e.g. manual file edit)
fs.watch(SETTINGS_FILE, { persistent: false }, (eventType) => {
    if (eventType === 'change') {
        try {
            const saved = JSON.parse(fs.readFileSync(SETTINGS_FILE, 'utf-8'));
            settings = { ...DEFAULT_SETTINGS, ...saved };
            applyBandwidthLimits();
            io.emit('settings-updated', settings);
            console.log('⚙ Settings reloaded from file');
        } catch { /* ignore parse errors */ }
    }
});

app.get('/api/disk', (req, res) => {
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

app.get('/api/browse', (req, res) => {
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
app.delete('/api/library/delete', (req, res) => {
    const targetPath = req.query.path;
    if (!targetPath) return res.status(400).json({ error: 'path required' });
    // Safety: must be within the download path
    const dlPath = settings.downloadPath;
    const resolved = path.resolve(targetPath);
    if (!resolved.startsWith(path.resolve(dlPath))) {
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
        const fuzzyMatch = normalized.includes(qn) || qn.includes(normalized);
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

app.get('/api/library', (req, res) => {
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
        // Scraping providers need more time than API providers
        const providerTimeout = ['1337x', 'YTS'].includes(provider.name) ? 15000 : 10000;
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

    // Deduplicate by title (case-insensitive)
    const seen = new Set();
    const deduped = allResults.filter(r => {
        const key = `${r._provider || ''}::${(r.title || '').toLowerCase().trim()}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
    });

    // Sort by seeders desc, take top 150
    deduped.sort((a, b) => (b.seeds || 0) - (a.seeds || 0));

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
                    const parseTorrent = (await import('parse-torrent')).default;
                    const parsed = parseTorrent(torrentBuf);
                    if (parsed && parsed.files && parsed.files.length > 0) {
                        return res.json({
                            name: parsed.name || result.title,
                            files: parsed.files.map(f => ({ name: f.name, size: f.length, path: f.path })),
                        });
                    }
                }
            } catch {
                continue;
            }
        }
    }

    // 3. WebTorrent fallback — try metadata from peers (10s timeout)
    try {
        const fileList = await new Promise((resolve, reject) => {
            const timer = setTimeout(() => {
                reject(new Error('timeout'));
            }, 10000);
            try {
                const tempTorrent = client.add(result._magnet, { path: path.join(os.tmpdir(), 'vortex-preview'), destroyStoreOnDestroy: true }, (torrent) => {
                    clearTimeout(timer);
                    const files = (torrent.files || []).map(f => ({ name: f.name, size: f.length, path: f.path }));
                    try { client.remove(torrent.infoHash, { destroyStore: true }); } catch { }
                    resolve({ name: torrent.name, files });
                });
                if (tempTorrent) {
                    tempTorrent.on('error', (err) => {
                        clearTimeout(timer);
                        // Duplicate torrent — try reading from existing
                        if (infoHash) {
                            const existing = client.torrents.find(t => t.infoHash === infoHash);
                            if (existing && existing.files && existing.files.length > 0) {
                                resolve({ name: existing.name, files: existing.files.map(f => ({ name: f.name, size: f.length, path: f.path })) });
                                return;
                            }
                        }
                        reject(err);
                    });
                }
            } catch (e) {
                clearTimeout(timer);
                // Duplicate torrent error — try reading
                if (infoHash) {
                    const existing = client.torrents.find(t => t.infoHash === infoHash);
                    if (existing && existing.files && existing.files.length > 0) {
                        resolve({ name: existing.name, files: existing.files.map(f => ({ name: f.name, size: f.length, path: f.path })) });
                        return;
                    }
                }
                reject(e);
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

// ─── Add Torrent ───
app.post('/api/torrents', (req, res) => {
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
        const torrent = client.add(magnet, { path: settings.downloadPath, announce: TPB_TRACKERS, maxWebConns: 20 });

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
app.delete('/api/torrents/:infoHash', (req, res) => {
    const hash = req.params.infoHash;
    const torrent = client.torrents.find(t => t.infoHash === hash);
    archiveTorrentTransfer(hash, torrent);
    pausedTorrents.delete(hash);
    completedTorrents.delete(hash);
    magnetsByHash.delete(hash);
    addedAtMap.delete(hash);
    pausedFilesByHash.delete(hash);
    if (torrent) {
        client.remove(hash, { destroyStore: false }, () => { saveTorrentList(); res.json({ success: true }); });
    } else { saveTorrentList(); res.json({ success: true }); }
});

// ─── Delete Torrent + Files ───
app.delete('/api/torrents/:infoHash/delete-files', (req, res) => {
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
    addedAtMap.delete(hash);
    pausedFilesByHash.delete(hash);

    const doDeleteFiles = () => {
        if (torrentName) {
            const filePath = path.join(settings.downloadPath, torrentName);
            try {
                if (fs.existsSync(filePath)) {
                    fs.statSync(filePath).isDirectory()
                        ? fs.rmSync(filePath, { recursive: true, force: true })
                        : fs.unlinkSync(filePath);
                    console.log('🗑 Deleted:', filePath);
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
app.post('/api/torrents/:infoHash/pause', (req, res) => {
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
app.post('/api/torrents/:infoHash/resume', (req, res) => {
    const hash = req.params.infoHash;
    if (pausedTorrents.has(hash)) {
        const data = pausedTorrents.get(hash);
        // Ensure we have a valid magnet — fall back to reconstructing from hash
        const magnet = data.magnet || magnetsByHash.get(hash) || `magnet:?xt=urn:btih:${hash}`;
        // Remove from paused AFTER ensuring we can add it
        try {
            const torrent = client.add(magnet, { path: settings.downloadPath, announce: TPB_TRACKERS, maxWebConns: 20 });
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
app.post('/api/torrents/:infoHash/stop-seeding', (req, res) => {
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
app.post('/api/torrents/:infoHash/start-seeding', (req, res) => {
    const hash = req.params.infoHash;
    const existing = client.torrents.find(t => t.infoHash === hash);
    if (existing) return res.json({ success: true, alreadyActive: true });

    const completed = completedTorrents.get(hash);
    if (!completed) return res.status(404).json({ error: 'Completed torrent not found' });

    const magnet = completed.magnet || magnetsByHash.get(hash) || `magnet:?xt=urn:btih:${hash}`;
    if (!magnet) return res.status(400).json({ error: 'No magnet available to start seeding' });

    try {
        const torrent = client.add(magnet, { path: settings.downloadPath, announce: TPB_TRACKERS, maxWebConns: 20 });
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
app.post('/api/torrents/:infoHash/files/selection', (req, res) => {
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

// Shared helper: exchange fileId → temp link → download to disk
async function downloadSubtitleFile(apiKey, fileId, filename, destFolder) {
    fs.mkdirSync(path.resolve(destFolder), { recursive: true });
    const tokenBody = Buffer.from(JSON.stringify({ file_id: fileId }));
    const tokenResp = await osRequest({
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
        const req = https.request(options, (res) => {
            // Follow redirects (max 5)
            if ((res.statusCode === 301 || res.statusCode === 302) && res.headers.location && _redirectCount < 5) {
                res.resume(); // drain
                let loc = res.headers.location;
                // Relative redirect → keep same host
                if (loc.startsWith('/')) {
                    loc = `https://${options.hostname}${loc}`;
                }
                const u = new URL(loc);
                const newOpts = {
                    hostname: u.hostname,
                    path: u.pathname + u.search,
                    method: options.method || 'GET',
                    headers: options.headers,
                    timeout: options.timeout || 15000,
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
    const r = await osRequest({
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
    const query = req.query.name;         // text query (fallback)
    const filePath = req.query.file;      // full path to video file (hash search)
    const lang = req.query.lang || 'en';
    if (!query && !filePath) return res.status(400).json({ error: 'name or file required' });

    const apiKey = settings.opensubtitlesApiKey;
    if (!apiKey) return res.status(503).json({ error: 'NO_API_KEY', message: 'OpenSubtitles API key not set. Add it in Settings → Subtitles.' });

    try {
        let exactResults = [];
        let textResults = [];

        // ── 1. Hash search (exact match) ─────────────────────────────────────
        if (filePath) {
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
        }

        // ── 2. Text search ───────────────────────────────────────────────────
        if (query) {
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
        }

        res.json([...exactResults, ...textResults]);
    } catch (e) {
        console.error('Subtitle search error:', e.message);
        res.status(500).json({ error: e.message });
    }
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
const PORT = 3001;
server.listen(PORT, () => {
    console.log(`\n⚡ Vortex Backend on http://localhost:${PORT}`);
    console.log(`📂 Downloads → ${settings.downloadPath}`);
    console.log(`🔍 Providers: ${enabledProviders.join(', ')}`);
    console.log(`⚡ DL Limit: ${settings.globalDownloadLimit || '∞'} MB/s | UL Limit: ${settings.globalUploadLimit || '∞'} MB/s\n`);
});
