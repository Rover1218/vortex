// Per-file playback progress, stored locally so you can resume where you left off
// and see a "Continue Watching" row. Keyed by infoHash + file index.

const KEY = "vortex:watchProgress";
const MAX_ENTRIES = 40;
const DONE_FRACTION = 0.95; // treat as finished (drop) past this

export interface WatchEntry {
    infoHash: string;
    fileIdx: number;
    name: string;   // file name
    title: string;  // torrent/display title
    t: number;      // last position (seconds)
    dur: number;    // total duration (seconds, 0 if unknown)
    updatedAt: number;
}

function readMap(): Record<string, WatchEntry> {
    if (typeof window === "undefined") return {};
    try { return JSON.parse(localStorage.getItem(KEY) || "{}"); } catch { return {}; }
}

function writeMap(map: Record<string, WatchEntry>) {
    if (typeof window === "undefined") return;
    try { localStorage.setItem(KEY, JSON.stringify(map)); } catch { /* ignore quota */ }
}

const keyOf = (infoHash: string, fileIdx: number) => `${infoHash}:${fileIdx}`;

export function getProgress(infoHash: string, fileIdx: number): WatchEntry | null {
    return readMap()[keyOf(infoHash, fileIdx)] || null;
}

export function saveProgress(entry: WatchEntry) {
    const map = readMap();
    const k = keyOf(entry.infoHash, entry.fileIdx);
    // Finished (or too close to the start) → don't keep a resume point.
    if (entry.t < 10 || (entry.dur > 0 && entry.t / entry.dur >= DONE_FRACTION)) {
        delete map[k];
    } else {
        map[k] = entry;
    }
    // Keep only the most-recent MAX_ENTRIES.
    const trimmed = Object.entries(map)
        .sort((a, b) => b[1].updatedAt - a[1].updatedAt)
        .slice(0, MAX_ENTRIES);
    writeMap(Object.fromEntries(trimmed));
}

export function removeProgress(infoHash: string, fileIdx: number) {
    const map = readMap();
    delete map[keyOf(infoHash, fileIdx)];
    writeMap(map);
}

// Drop every saved position for a torrent — call this when the torrent (and its
// files) are deleted, so it stops showing in Continue Watching.
export function removeProgressByInfoHash(infoHash: string) {
    const map = readMap();
    let changed = false;
    for (const k of Object.keys(map)) {
        if (k.startsWith(infoHash + ":")) { delete map[k]; changed = true; }
    }
    if (changed) writeMap(map);
}

// Most-recent first, only unfinished items.
export function listContinueWatching(): WatchEntry[] {
    return Object.values(readMap())
        .filter(e => e.t >= 10 && (e.dur === 0 || e.t / e.dur < DONE_FRACTION))
        .sort((a, b) => b.updatedAt - a.updatedAt);
}
