"use client";

import { useTorrents } from "@/context/TorrentContext";
import { useEffect, useState, useMemo, useRef, useCallback } from "react";
import axios from "axios";

const API_BASE = process.env.NEXT_PUBLIC_ENGINE_URL || 'http://localhost:3001';

// ── Subtitle helpers ────────────────────────────────────────────────────────

const LANGS = [
    { code: "en", label: "English" }, { code: "hi", label: "Hindi" },
    { code: "es", label: "Spanish" }, { code: "fr", label: "French" },
    { code: "ar", label: "Arabic" }, { code: "pt", label: "Portuguese" },
    { code: "ja", label: "Japanese" }, { code: "ko", label: "Korean" },
    { code: "zh", label: "Chinese" }, { code: "de", label: "German" },
];

function cleanVideoName(filename: string): string {
    let s = filename
        .replace(/\.[a-z0-9]{2,4}$/i, '')   // strip extension
        .replace(/\[.*?\]/g, ' ')            // strip [EtHD] [720p] [Group]
        .replace(/\(.*?\)/g, ' ')            // strip (2016) etc in parens
        .replace(/[\._]/g, ' ');             // dots/underscores → spaces
    // Cut from first quality/year tag onward
    const cut = s.search(/\b((?:19|20)\d{2}|1080p|720p|480p|2160p|4k|bluray|bdrip|webrip|web[-. ]?dl|hdtv|dvdrip|x264|x265|hevc|avc|xvid|remux|proper|repack)\b/i);
    if (cut > 2) s = s.slice(0, cut);
    // Strip trailing release-group like "-HAiKU" or "- YIFY"
    s = s.replace(/\s*-\s*[A-Za-z0-9]{2,}$/, '');
    return s.replace(/\s{2,}/g, ' ').trim();
}

interface SubResult {
    id: string; fileId?: number; name: string; lang: string; langCode: string;
    rating: string; downloads: string; hearing: boolean;
    format: string; movieName: string; year: string; exact?: boolean;
}

function CategoryIcon({ category, className }: { category: string; className?: string }) {
    const cls = className ?? "w-5 h-5";
    const common = { fill: "none", viewBox: "0 0 24 24", stroke: "currentColor", strokeWidth: 1.8, strokeLinecap: "round" as const, strokeLinejoin: "round" as const, className: cls };
    switch (category) {
        case "Folder":
            return (<svg {...common}><path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7Z" /></svg>);
        case "Video":
            return (<svg {...common}><rect x="3" y="5" width="18" height="14" rx="2" /><path d="M10 9l5 3-5 3V9Z" /></svg>);
        case "Audio":
            return (<svg {...common}><path d="M9 18V6l10-2v12" /><circle cx="6" cy="18" r="3" /><circle cx="16" cy="16" r="3" /></svg>);
        case "App/Archive":
            return (<svg {...common}><path d="M3 8l9-4 9 4-9 4-9-4Z" /><path d="M3 8v8l9 4 9-4V8" /><path d="M12 12v8" /></svg>);
        case "All":
            return (<svg {...common}><rect x="3" y="3" width="7" height="7" rx="1.5" /><rect x="14" y="3" width="7" height="7" rx="1.5" /><rect x="3" y="14" width="7" height="7" rx="1.5" /><rect x="14" y="14" width="7" height="7" rx="1.5" /></svg>);
        default:
            return (<svg {...common}><path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8l-5-5Z" /><path d="M14 3v5h5" /></svg>);
    }
}

const CATEGORY_COLORS: Record<string, string> = {
    Video: "text-teal bg-teal/10 border-teal/15",
    Audio: "text-accent bg-accent/10 border-accent/15",
    "App/Archive": "text-warning bg-warning/10 border-warning/15",
    Folder: "text-accent bg-accent/10 border-accent/15",
    Other: "text-text-3 bg-white/5 border-white/[0.06]",
};

const SORT_LABELS: Record<string, string> = {
    modified: "Newest first",
    size: "Largest first",
    name: "Name A–Z",
};

export default function LibraryPage() {
    const { library, fetchLibrary, settings, diskInfo, torrents } = useTorrents();
    const [activeCategory, setActiveCategory] = useState("All");
    const [search, setSearch] = useState("");
    const [sortBy, setSortBy] = useState<"name" | "size" | "modified">("modified");
    const [sortOpen, setSortOpen] = useState(false);
    const sortRef = useRef<HTMLDivElement>(null);
    const searchInputRef = useRef<HTMLInputElement>(null);
    const [viewMode, setViewMode] = useState<"grid" | "list">("grid");
    const [loading, setLoading] = useState(true);

    // Press "/" anywhere to focus the search box
    useEffect(() => {
        const handler = (e: KeyboardEvent) => {
            if (e.key === '/' && document.activeElement?.tagName !== 'INPUT' && document.activeElement?.tagName !== 'TEXTAREA') {
                e.preventDefault();
                searchInputRef.current?.focus();
            }
        };
        document.addEventListener('keydown', handler);
        return () => document.removeEventListener('keydown', handler);
    }, []);


    // Subtitle state
    const [subItem, setSubItem] = useState<{ name: string; path: string; isDir: boolean } | null>(null);
    const [subQuery, setSubQuery] = useState("");
    const [subLang, setSubLang] = useState("en");
    const [subResults, setSubResults] = useState<SubResult[]>([]);
    const [subLoading, setSubLoading] = useState(false);
    const [subDownloading, setSubDownloading] = useState<string | null>(null);
    const [subMsg, setSubMsg] = useState<{ type: "ok" | "err"; text: string } | null>(null);

    // Auto-subtitle status: which items already have subtitle files
    const [subStatus, setSubStatus] = useState<Record<string, boolean>>({});
    const [autoSubTriggering, setAutoSubTriggering] = useState<string | null>(null);
    const [autoSubDone, setAutoSubDone] = useState<Set<string>>(new Set());

    // Poster state: 'loading' | url string | null (no poster found)
    const [posters, setPosters] = useState<Record<string, string | null | 'loading'>>({});
    const posterAbortRef = useRef<AbortController | null>(null);

    const searchSubs = useCallback(async (q?: string, lang?: string, itemOverride?: { name: string; path: string; isDir: boolean }) => {
        const query = (q ?? subQuery).trim();
        const language = lang ?? subLang;
        const target = itemOverride ?? subItem;
        if (!query && !target) return;
        setSubLoading(true);
        setSubResults([]);
        setSubMsg(null);
        try {
            // Build params: send file path for hash search + text query for fallback
            const params = new URLSearchParams({ lang: language });
            if (query) params.set('name', query);
            if (target && !target.isDir) params.set('file', target.path);
            const res = await axios.get(`${API_BASE}/api/subtitles?${params.toString()}`);
            const data: SubResult[] = res.data || [];
            setSubResults(data);
            if (data.length === 0) setSubMsg({ type: "err", text: "No subtitles found. Try editing the query or language." });
            else {
                const exactCount = data.filter(r => r.exact).length;
                if (exactCount > 0) setSubMsg({ type: "ok", text: `\u26A1 ${exactCount} exact match${exactCount > 1 ? 'es' : ''} found for your specific file — these are frame-perfect.` });
            }
        } catch (e: any) {
            const errCode = e.response?.data?.error;
            if (errCode === 'NO_API_KEY') {
                setSubMsg({ type: "err", text: "\u26A0\uFE0F No API key configured. Go to Settings \u2192 Subtitles and add your free OpenSubtitles.com API key." });
            } else {
                setSubMsg({ type: "err", text: e.response?.data?.message || e.response?.data?.error || e.message || "Search failed. Check server connection." });
            }
        }
        setSubLoading(false);
    }, [subQuery, subLang, subItem]);

    const openSubPanel = useCallback((item: { name: string; path: string; isDir: boolean }) => {
        setSubItem(item);
        setSubResults([]);
        setSubMsg(null);
        setSubDownloading(null);
        const q = cleanVideoName(item.name);
        setSubQuery(q);
        searchSubs(q, subLang, item);
    }, [subLang, searchSubs]);

    const downloadSub = useCallback(async (result: SubResult) => {
        if (!subItem) return;
        setSubDownloading(result.id);
        setSubMsg(null);
        const sep = subItem.path.includes("\\") ? "\\" : "/";
        const destFolder = subItem.isDir
            ? subItem.path
            : subItem.path.substring(0, subItem.path.lastIndexOf(sep));
        try {
            const res = await axios.post(`${API_BASE}/api/subtitles/download`, {
                fileId: result.fileId,
                filename: result.name,
                destFolder,
            });
            setSubMsg({ type: "ok", text: `✓ Saved: ${res.data.filename}` });
        } catch (e: any) {
            setSubMsg({ type: "err", text: `Download failed: ${e.response?.data?.error || e.message}` });
        }
        setSubDownloading(null);
    }, [subItem]);

    // Close sort dropdown on outside click
    useEffect(() => {
        if (!sortOpen) return;
        const handler = (e: MouseEvent) => {
            if (sortRef.current && !sortRef.current.contains(e.target as Node)) setSortOpen(false);
        };
        document.addEventListener("mousedown", handler);
        return () => document.removeEventListener("mousedown", handler);
    }, [sortOpen]);

    useEffect(() => {
        setLoading(true);
        Promise.all([
            fetchLibrary(),
            axios.get(`${API_BASE}/api/library/subtitles-status`).then(r => setSubStatus(r.data || {})).catch(() => { }),
        ]).finally(() => setLoading(false));
    }, [fetchLibrary]);

    // Auto subtitle trigger
    const triggerAutoSub = useCallback(async (item: { name: string; path: string; isDir: boolean }) => {
        setAutoSubTriggering(item.name);
        try {
            const res = await axios.post(`${API_BASE}/api/library/auto-subtitle`, {
                itemName: item.name,
                itemPath: item.path,
                isDir: item.isDir,
            });
            if (res.data.success) {
                setAutoSubDone(prev => new Set(prev).add(item.name));
                setSubStatus(prev => ({ ...prev, [item.name]: true }));
            }
        } catch { /* silent */ }
        setAutoSubTriggering(null);
    }, []);

    const formatSize = (bytes: number) => {
        if (!bytes || bytes <= 0) return "—";
        const k = 1024;
        const sizes = ["B", "KB", "MB", "GB", "TB"];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + " " + sizes[i];
    };

    const formatDate = (iso: string) => {
        if (!iso) return "—";
        const d = new Date(iso);
        return d.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
    };

    // Deduplicate: skip files inside a folder that the server already surfaced
    const topLevel = useMemo(() => {
        const sep = library.some(i => i.path.includes("\\")) ? "\\" : "/";
        const folderPaths = new Set(library.filter(i => i.isDir).map(i => i.path));
        return library.filter(item => {
            if (item.isDir) return true;
            const parentDir = item.path.substring(0, item.path.lastIndexOf(sep));
            return !folderPaths.has(parentDir);
        });
    }, [library]);

    // Re-run poster fetching only when the SET of items changes, not on every
    // library refresh. topLevel is recreated on each poll; depending on its
    // reference aborted in-flight poster fetches before they finished, so posters
    // would flicker / never appear. A name-signature dep avoids that churn.
    const posterNamesKey = topLevel.map(i => i.name).join('|');

    // Fetch posters — TVmaze (TV/anime/drama) + iTunes (movies), shows skeleton while loading
    useEffect(() => {
        if (topLevel.length === 0) return;
        const needsPoster = topLevel.filter(item =>
            (item.category === 'Video' || item.isDir) && posters[item.name] === undefined
        );
        if (needsPoster.length === 0) return;

        // Mark as loading immediately so skeletons appear
        setPosters(prev => {
            const next = { ...prev };
            needsPoster.forEach(item => { if (next[item.name] === undefined) next[item.name] = 'loading'; });
            return next;
        });

        if (posterAbortRef.current) posterAbortRef.current.abort();
        posterAbortRef.current = new AbortController();
        const signal = posterAbortRef.current.signal;
        // Track names we started so cleanup can reset them if aborted
        const startedNames = new Set(needsPoster.map(i => i.name));

        // Fetch in parallel batches of 4 for speed
        (async () => {
            const BATCH = 4;
            for (let i = 0; i < needsPoster.length; i += BATCH) {
                if (signal.aborted) break;
                const batch = needsPoster.slice(i, i + BATCH);
                await Promise.all(batch.map(async item => {
                    const q = cleanVideoName((item as any).representativeName || item.name);
                    if (!q) { setPosters(prev => ({ ...prev, [item.name]: null })); return; }
                    try {
                        const r = await axios.get(`${API_BASE}/api/poster?q=${encodeURIComponent(q)}`, { signal, timeout: 12000 });
                        setPosters(prev => ({ ...prev, [item.name]: r.data?.poster ?? null }));
                    } catch {
                        if (!signal.aborted) setPosters(prev => ({ ...prev, [item.name]: null }));
                    }
                }));
                if (i + BATCH < needsPoster.length) await new Promise(res => setTimeout(res, 150));
            }
        })();

        return () => {
            posterAbortRef.current?.abort();
            // Reset any still-loading items back to undefined so next run re-fetches them
            setPosters(prev => {
                const next = { ...prev };
                for (const name of startedNames) {
                    if (next[name] === 'loading') delete next[name];
                }
                return next;
            });
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [posterNamesKey]);

    const categories = useMemo(() => {
        const cats = ["All", ...Array.from(new Set(topLevel.map(i => i.category))).sort()];
        return cats;
    }, [topLevel]);

    const filtered = useMemo(() => {
        let items = topLevel;
        if (activeCategory !== "All") items = items.filter(i => i.category === activeCategory);
        if (search.trim()) {
            const q = search.toLowerCase();
            items = items.filter(i => i.name.toLowerCase().includes(q));
        }
        return [...items].sort((a, b) => {
            if (sortBy === "name") return a.name.localeCompare(b.name);
            if (sortBy === "size") return b.size - a.size;
            if (sortBy === "modified") return new Date(b.modified).getTime() - new Date(a.modified).getTime();
            return 0;
        });
    }, [topLevel, activeCategory, search, sortBy]);

    // ── Download status matching ──────────────────────────────────────────────
    // Cross-reference library item names with active torrent names
    const getTorrentStatus = useCallback((itemName: string): { status: 'downloading' | 'completed' | null; progress?: string } => {
        if (!torrents || torrents.length === 0) return { status: null };
        const normalizedItem = itemName.toLowerCase().replace(/[._\-\[\]\(\)]/g, ' ').replace(/\s+/g, ' ').trim();
        for (const t of torrents) {
            const normalizedTorrent = (t.name || '').toLowerCase().replace(/[._\-\[\]\(\)]/g, ' ').replace(/\s+/g, ' ').trim();
            if (!normalizedTorrent) continue;
            // Match if either contains the other or they share the same base name
            if (normalizedItem === normalizedTorrent || normalizedItem.includes(normalizedTorrent) || normalizedTorrent.includes(normalizedItem)) {
                if (t.status === 'Seeding' || t.status === 'Completed' || parseFloat(t.progress) >= 100) {
                    return { status: 'completed', progress: '100.00' };
                }
                if (t.status === 'Downloading' || t.status === 'Paused') {
                    return { status: 'downloading', progress: t.progress };
                }
            }
        }
        return { status: null };
    }, [torrents]);

    // Stats count ALL files recursively (not just top-level)
    const totalSize = useMemo(() => library.filter(i => !i.isDir).reduce((sum, i) => sum + (i.size || 0), 0), [library]);
    const videoCount = useMemo(() => library.filter(i => i.category === "Video").length, [library]);

    // For a folder, find the LARGEST video inside it (the main movie, not a sample)
    const sep = typeof window !== 'undefined' ? (library.some(i => i.path.includes("\\")) ? "\\" : "/") : "\\";
    const findVideoInFolder = useCallback((folderPath: string) => {
        const videos = library.filter(i => !i.isDir && i.category === "Video" && i.path.startsWith(folderPath + sep));
        if (videos.length === 0) return undefined;
        return videos.reduce((biggest, cur) => cur.size > biggest.size ? cur : biggest);
    }, [library, sep]);

    return (
        <div className="w-full max-w-full space-y-6 pb-10 relative overflow-x-hidden isolate">
            {/* Ambient glow */}
            <div className="pointer-events-none absolute -top-24 left-1/3 h-64 w-[50%] rounded-full bg-teal/8 blur-[120px]" aria-hidden />

            {/* Header */}
            <div className="relative z-10 flex flex-wrap items-center justify-between gap-4 cine-card px-6 py-5">
                <div className="flex items-center gap-4 min-w-0">
                    <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-teal/12 text-teal ring-1 ring-teal/25">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" className="h-6 w-6"><rect x="3" y="3" width="7" height="18" rx="1.5" /><rect x="12" y="3" width="4" height="18" rx="1.5" /><path d="m18 5 3 1-3 14-2-0.5" /></svg>
                    </div>
                    <div className="min-w-0">
                        <h1 className="cine-title text-3xl sm:text-4xl font-black tracking-tight text-text-1">Library</h1>
                        <p className="text-text-3 text-sm mt-0.5 truncate">
                            {loading ? "Loading…" : `${topLevel.length} items · ${formatSize(totalSize)}`}
                            {settings?.downloadPath && (
                                <span className="ml-2 text-text-3">→ {settings.downloadPath}</span>
                            )}
                        </p>
                    </div>
                </div>
                <div className="flex items-center gap-2">
                    <button onClick={() => setViewMode("grid")}
                        className={`w-9 h-9 rounded-xl flex items-center justify-center transition-all border ${viewMode === "grid" ? "bg-accent text-black border-transparent" : "bg-elevated text-text-3 border-white/[0.06] hover:text-text-1"}`}
                        title="Grid view">
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="7" height="7" rx="1.5" /><rect x="14" y="3" width="7" height="7" rx="1.5" /><rect x="3" y="14" width="7" height="7" rx="1.5" /><rect x="14" y="14" width="7" height="7" rx="1.5" /></svg>
                    </button>
                    <button onClick={() => setViewMode("list")}
                        className={`w-9 h-9 rounded-xl flex items-center justify-center transition-all border ${viewMode === "list" ? "bg-accent text-black border-transparent" : "bg-elevated text-text-3 border-white/[0.06] hover:text-text-1"}`}
                        title="List view">
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01" /></svg>
                    </button>
                    <button onClick={() => { setLoading(true); fetchLibrary().finally(() => setLoading(false)); }}
                        className="w-9 h-9 rounded-xl flex items-center justify-center bg-elevated text-text-3 hover:text-text-1 border border-white/[0.06] transition-all"
                        title="Refresh">
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M21 12a9 9 0 1 1-3-6.7L21 8" /><path d="M21 4v4h-4" /></svg>
                    </button>
                </div>
            </div>

            {/* Stats Row */}
            {!loading && topLevel.length > 0 && (
                <div className="space-y-3">
                    <div className="grid grid-cols-3 gap-3">
                        <div className="cine-card flex items-center gap-3.5 p-4">
                            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white/[0.04] border border-white/[0.06] text-text-2">
                                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5"><path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8l-5-5Z" /><path d="M14 3v5h5" /></svg>
                            </div>
                            <div>
                                <div className="text-[10px] font-bold text-text-3 uppercase tracking-widest">Total Files</div>
                                <div className="text-2xl font-black text-text-1">{library.filter(i => !i.isDir).length}</div>
                            </div>
                        </div>
                        <div className="cine-card flex items-center gap-3.5 p-4">
                            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-accent/10 border border-accent/15 text-accent">
                                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5"><rect x="3" y="5" width="18" height="14" rx="2" /><path d="M10 9l5 3-5 3V9Z" /></svg>
                            </div>
                            <div>
                                <div className="text-[10px] font-bold text-accent uppercase tracking-widest">Videos</div>
                                <div className="text-2xl font-black text-text-1">{videoCount}</div>
                            </div>
                        </div>
                        <div className="cine-card flex items-center gap-3.5 p-4">
                            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-teal/10 border border-teal/15 text-teal">
                                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5"><path d="M3 8l9-4 9 4-9 4-9-4Z" /><path d="M3 8v8l9 4 9-4V8" /></svg>
                            </div>
                            <div>
                                <div className="text-[10px] font-bold text-text-3 uppercase tracking-widest">Total Size</div>
                                <div className="text-2xl font-black text-text-1">{formatSize(totalSize)}</div>
                            </div>
                        </div>
                    </div>
                    {diskInfo && diskInfo.total > 0 && (() => {
                        const usedPct = (diskInfo.used / diskInfo.total) * 100;
                        const freePct = 100 - usedPct;
                        const fmtD = (b: number) => { const k = 1024, u = ["B", "KB", "MB", "GB", "TB"]; const i = Math.floor(Math.log(Math.max(b, 1)) / Math.log(k)); return (b / Math.pow(k, i)).toFixed(1) + " " + u[i]; };
                        return (
                            <div className="rounded-2xl bg-surface border border-white/[0.06] px-5 py-4 space-y-2">
                                <div className="flex justify-between items-baseline">
                                    <span className="text-[10px] font-bold text-text-3 uppercase tracking-widest">Disk Usage</span>
                                    <div className="flex items-baseline gap-2 text-[11px] font-mono">
                                        <span className="text-text-3">{fmtD(diskInfo.used)} used</span>
                                        <span className="text-text-3">/</span>
                                        <span className="text-text-2 font-bold">{fmtD(diskInfo.total)}</span>
                                        <span className={`font-black ${freePct < 10 ? 'text-danger' : freePct < 25 ? 'text-warning' : 'text-teal'}`}>· {fmtD(diskInfo.free)} free</span>
                                    </div>
                                </div>
                                <div className="h-2 bg-elevated rounded-full overflow-hidden">
                                    <div className={`h-full rounded-full transition-all duration-700 ${usedPct > 90 ? 'bg-danger' : usedPct > 75 ? 'bg-warning' : 'bg-accent'}`}
                                        style={{ width: `${Math.min(usedPct, 100)}%` }} />
                                </div>
                                <p className="text-[10px] text-text-3 truncate">{diskInfo.path}</p>
                            </div>
                        );
                    })()}
                </div>
            )}

            {/* Search + Sort */}
            <div className="rounded-2xl border border-white/[0.06] bg-surface p-3 flex gap-3">
                <div className="relative flex-1">
                    <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-text-3 pointer-events-none">
                        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><circle cx="10.5" cy="10.5" r="7" /><path d="M16 16l5 5" /></svg>
                    </span>
                    <input
                        ref={searchInputRef}
                        type="text"
                        value={search}
                        onChange={e => setSearch(e.target.value)}
                        onKeyDown={e => e.key === 'Escape' && setSearch('')}
                        placeholder="Filter files… (press / to focus)"
                        className="w-full pl-10 pr-10 py-2.5 rounded-xl bg-elevated border border-white/[0.06] text-sm text-text-1 placeholder-text-3 focus:outline-none focus:border-accent transition-all"
                    />
                    {search ? (
                        <button onClick={() => setSearch("")} className="absolute right-3 top-1/2 -translate-y-1/2 text-text-3 hover:text-text-1">
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6 6 18M6 6l12 12" /></svg>
                        </button>
                    ) : (
                        <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[10px] text-text-3 font-mono border border-white/[0.06] px-1.5 py-0.5 rounded pointer-events-none">/</span>
                    )}
                </div>
                <div className="relative" ref={sortRef}>
                    <button
                        onClick={() => setSortOpen(o => !o)}
                        className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-elevated border border-white/[0.06] hover:border-white/[0.14] text-sm text-text-2 hover:text-text-1 transition-all min-w-[150px] justify-between"
                    >
                        <span>{SORT_LABELS[sortBy]}</span>
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className={`text-text-3 transition-transform duration-200 ${sortOpen ? "rotate-180" : ""}`}><path d="m6 9 6 6 6-6" /></svg>
                    </button>
                    {sortOpen && (
                        <div className="absolute right-0 top-full mt-1.5 w-44 rounded-xl bg-elevated border border-white/[0.06] shadow-cinema overflow-hidden z-50">
                            {(["modified", "size", "name"] as const).map(opt => (
                                <button key={opt} onClick={() => { setSortBy(opt); setSortOpen(false); }}
                                    className={`w-full text-left px-4 py-2.5 text-sm transition-all ${sortBy === opt
                                        ? "bg-accent text-black font-semibold"
                                        : "text-text-2 hover:bg-white/[0.05] hover:text-text-1"
                                        }`}>
                                    {SORT_LABELS[opt]}
                                </button>
                            ))}
                        </div>
                    )}
                </div>
            </div>

            {/* Category Tabs */}
            {!loading && categories.length > 1 && (
                <div className="rounded-2xl border border-white/[0.06] bg-surface p-2 sm:p-3 flex gap-2 flex-wrap">
                    {categories.map(cat => {
                        const count = cat === "All" ? topLevel.length : topLevel.filter(i => i.category === cat).length;
                        const isActive = activeCategory === cat;
                        return (
                            <button key={cat} onClick={() => setActiveCategory(cat)}
                                className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-full text-[11px] font-bold border transition-all ${isActive
                                    ? "bg-accent text-black border-transparent"
                                    : "bg-elevated text-text-3 border-white/[0.06] hover:text-text-1 hover:border-white/[0.14]"
                                    }`}>
                                <CategoryIcon category={cat} className="w-3.5 h-3.5" />
                                {cat}
                                <span className={`px-1.5 py-0.5 rounded-full text-[9px] font-bold ${isActive ? "bg-black/15 text-black" : "bg-white/[0.06] text-text-3"}`}>{count}</span>
                            </button>
                        );
                    })}
                </div>
            )}

            {/* Content */}
            {loading ? (
                <div className="py-20 text-center">
                    <svg className="w-12 h-12 mx-auto mb-3 text-text-3 opacity-30 animate-pulse" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="5" width="18" height="14" rx="2" /><path d="M10 9l5 3-5 3V9Z" /></svg>
                    <p className="text-text-3 text-sm">Loading library…</p>
                </div>
            ) : filtered.length === 0 ? (
                <div className="py-20 text-center rounded-2xl bg-surface border border-dashed border-white/[0.06]">
                    <svg className="w-12 h-12 mx-auto mb-3 text-text-3 opacity-30" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="5" width="18" height="14" rx="2" /><path d="M10 9l5 3-5 3V9Z" /></svg>
                    <p className="text-text-3 text-sm">{topLevel.length === 0 ? "No files in download folder yet" : "No results match your filter"}</p>
                    {topLevel.length === 0 && settings?.downloadPath && (
                        <p className="text-text-3 text-xs mt-1">{settings.downloadPath}</p>
                    )}
                </div>
            ) : viewMode === "grid" ? (
                <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                    {filtered.map((item, idx) => {
                        const dlStatus = getTorrentStatus(item.name);
                        return (
                            <div key={idx} style={{ contentVisibility: 'auto', containIntrinsicSize: '260px' }} className={`group cine-card cine-card-hover rounded-2xl border transition-all flex flex-col gap-0 overflow-hidden ${dlStatus.status === 'completed' ? 'border-teal/30' : dlStatus.status === 'downloading' ? 'border-accent/30' : 'border-white/[0.06] hover:border-white/[0.14]'}`}>
                                {/* Poster or skeleton or icon banner */}
                                {(item.category === 'Video' || item.isDir) && posters[item.name] === 'loading' ? (
                                    <div className="w-full poster-ratio bg-elevated animate-pulse rounded-t-2xl flex items-center justify-center">
                                        <svg className="w-7 h-7 text-text-3 opacity-30" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" /><circle cx="8.5" cy="8.5" r="1.5" /><path d="m21 15-5-5L5 21" /></svg>
                                    </div>
                                ) : typeof posters[item.name] === 'string' && posters[item.name] !== 'loading' ? (
                                    <div className="relative w-full poster-ratio overflow-hidden bg-base">
                                        {/* eslint-disable-next-line @next/next/no-img-element */}
                                        <img src={posters[item.name] as string} alt={item.name}
                                            className="w-full h-full object-cover opacity-90 group-hover:opacity-100 group-hover:scale-105 transition-all duration-500"
                                            onError={() => setPosters(prev => ({ ...prev, [item.name]: null }))}
                                        />
                                        <div className="absolute inset-0 bg-gradient-to-t from-base via-transparent to-transparent" />
                                        <span className={`absolute top-2 right-2 px-2 py-0.5 rounded-lg text-[9px] font-bold border ${CATEGORY_COLORS[item.category] || CATEGORY_COLORS.Other}`}>
                                            {item.category}
                                        </span>
                                        {/* Download status badge on poster */}
                                        {dlStatus.status === 'completed' && (
                                            <span className="absolute top-2 left-2 w-7 h-7 rounded-full bg-teal flex items-center justify-center shadow-cinema ring-2 ring-teal/30">
                                                <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="#09090b" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M3 7.5l3 3 5-6" /></svg>
                                            </span>
                                        )}
                                        {dlStatus.status === 'downloading' && (
                                            <span className="absolute top-2 left-2 px-2 py-1 rounded-lg bg-accent text-black text-[9px] font-black shadow-cinema ring-1 ring-accent/40 flex items-center gap-1 animate-pulse">
                                                <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"><path d="M5 1v6M3 5l2 2 2-2" /><path d="M1 8h8" /></svg>
                                                {parseFloat(dlStatus.progress || '0').toFixed(0)}%
                                            </span>
                                        )}
                                    </div>
                                ) : (
                                    <div className="px-4 pt-4 pb-0 flex items-center justify-between">
                                        <CategoryIcon category={item.category} className="w-6 h-6 text-text-2" />
                                        <div className="flex items-center gap-2">
                                            {dlStatus.status === 'completed' && (
                                                <span className="w-6 h-6 rounded-full bg-teal flex items-center justify-center shadow-cinema">
                                                    <svg width="12" height="12" viewBox="0 0 14 14" fill="none" stroke="#09090b" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M3 7.5l3 3 5-6" /></svg>
                                                </span>
                                            )}
                                            {dlStatus.status === 'downloading' && (
                                                <span className="px-2 py-0.5 rounded-lg bg-accent/20 text-accent text-[9px] font-black border border-accent/20 animate-pulse flex items-center gap-1">
                                                    <svg width="9" height="9" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"><path d="M5 1v6M3 5l2 2 2-2" /><path d="M1 8h8" /></svg>
                                                    {parseFloat(dlStatus.progress || '0').toFixed(0)}%
                                                </span>
                                            )}
                                            <span className={`px-2 py-0.5 rounded-lg text-[9px] font-bold border ${CATEGORY_COLORS[item.category] || CATEGORY_COLORS.Other}`}>
                                                {item.category}
                                            </span>
                                        </div>
                                    </div>
                                )}
                                {/* Name + meta */}
                                <div className="flex flex-col gap-2 p-4 flex-1">
                                    <p className="text-xs font-semibold text-text-1 leading-tight line-clamp-2 break-all">{item.name}</p>
                                    <div className="mt-auto flex items-center justify-between text-[10px] text-text-3">
                                        <span className="font-mono">{item.isDir ? "—" : formatSize(item.size)}</span>
                                        <div className="flex items-center gap-1.5">
                                            <span>{formatDate(item.modified)}</span>
                                            {(item.category === "Video" || (item.isDir && findVideoInFolder(item.path))) && dlStatus.status !== 'downloading' && (
                                                <>
                                                    {/* Subtitle status */}
                                                    {(subStatus[item.name] || autoSubDone.has(item.name)) ? (
                                                        <span className="flex items-center gap-0.5 px-1.5 py-0.5 rounded-md bg-teal/15 text-teal text-[9px] font-bold border border-teal/15" title="Subtitles available">
                                                            CC
                                                            <svg width="9" height="9" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 7.5l3 3 5-6" /></svg>
                                                        </span>
                                                    ) : autoSubTriggering === item.name ? (
                                                        <span className="flex items-center gap-1 px-1.5 py-0.5 rounded-md bg-accent/15 text-accent text-[9px] font-bold border border-accent/15 animate-pulse">
                                                            <svg className="w-3 h-3 animate-spin" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5"><circle cx="6" cy="6" r="5" strokeDasharray="20" strokeDashoffset="5" /></svg>
                                                            CC
                                                        </span>
                                                    ) : (
                                                        <button onClick={(e) => { e.stopPropagation(); triggerAutoSub(item); }}
                                                            className="opacity-0 group-hover:opacity-100 transition-all flex items-center gap-0.5 px-1.5 py-0.5 rounded-md bg-accent/10 text-accent hover:bg-accent/20 border border-accent/15 text-[9px] font-bold"
                                                            title="Auto-download subtitles">
                                                            <svg width="8" height="8" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"><path d="M5 1v6M3 5l2 2 2-2" /><path d="M1 8h8" /></svg>
                                                            CC
                                                        </button>
                                                    )}
                                                    <button onClick={() => {
                                                        const target = item.isDir ? findVideoInFolder(item.path)! : item;
                                                        openSubPanel(target);
                                                    }}
                                                        className="opacity-0 group-hover:opacity-100 transition-all w-6 h-6 rounded-lg flex items-center justify-center bg-teal/15 text-teal hover:bg-teal/25 border border-teal/15 text-[9px] font-black"
                                                        title="Browse subtitles">CC</button>
                                                </>
                                            )}
                                        </div>
                                    </div>
                                </div>
                            </div>
                        );
                    })}
                </div>
            ) : (
                <div className="space-y-1.5">
                    {filtered.map((item, idx) => {
                        const dlStatus = getTorrentStatus(item.name);
                        return (
                            <div key={idx} style={{ contentVisibility: 'auto', containIntrinsicSize: '76px' }} className={`group flex items-center gap-4 px-5 py-3 rounded-xl bg-surface hover:bg-elevated border transition-all ${dlStatus.status === 'completed' ? 'border-teal/30 hover:border-teal/40' : dlStatus.status === 'downloading' ? 'border-accent/30 hover:border-accent/40' : 'border-white/[0.06] hover:border-white/[0.14]'}`}>
                                <CategoryIcon category={item.category} className="w-5 h-5 shrink-0 text-text-2" />
                                <div className="flex-1 min-w-0">
                                    <p className="text-sm font-medium text-text-1 truncate">{item.name}</p>
                                    <p className="text-[10px] text-text-3 mt-0.5 truncate">{item.path}</p>
                                </div>
                                {/* Download status badge */}
                                {dlStatus.status === 'completed' && (
                                    <span className="shrink-0 w-7 h-7 rounded-full bg-teal flex items-center justify-center shadow-cinema">
                                        <svg width="12" height="12" viewBox="0 0 14 14" fill="none" stroke="#09090b" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M3 7.5l3 3 5-6" /></svg>
                                    </span>
                                )}
                                {dlStatus.status === 'downloading' && (
                                    <span className="shrink-0 px-2.5 py-1 rounded-lg bg-accent/15 text-accent text-[10px] font-black border border-accent/20 flex items-center gap-1.5 animate-pulse">
                                        <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"><path d="M5 1v6M3 5l2 2 2-2" /><path d="M1 8h8" /></svg>
                                        {parseFloat(dlStatus.progress || '0').toFixed(0)}%
                                    </span>
                                )}
                                <span className={`px-2 py-0.5 rounded-lg text-[9px] font-bold border shrink-0 ${CATEGORY_COLORS[item.category] || CATEGORY_COLORS.Other}`}>
                                    {item.category}
                                </span>
                                <span className="text-[11px] font-mono text-text-3 shrink-0 w-16 text-right">
                                    {item.isDir ? "—" : formatSize(item.size)}
                                </span>
                                <span className="text-[10px] text-text-3 shrink-0 w-24 text-right">{formatDate(item.modified)}</span>
                                <div className="flex gap-1 shrink-0 transition-all">
                                    {(item.category === "Video" || (item.isDir && findVideoInFolder(item.path))) && dlStatus.status !== 'downloading' && (
                                        <>
                                            {(subStatus[item.name] || autoSubDone.has(item.name)) ? (
                                                <span className="flex items-center gap-0.5 px-2 py-1 rounded-lg bg-teal/15 text-teal text-[9px] font-bold border border-teal/15" title="Subtitles available">
                                                    CC
                                                    <svg width="10" height="10" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 7.5l3 3 5-6" /></svg>
                                                </span>
                                            ) : autoSubTriggering === item.name ? (
                                                <span className="flex items-center gap-1 px-2 py-1 rounded-lg bg-accent/15 text-accent text-[9px] font-bold border border-accent/15 animate-pulse">
                                                    <svg className="w-3 h-3 animate-spin" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5"><circle cx="6" cy="6" r="5" strokeDasharray="20" strokeDashoffset="5" /></svg>
                                                    CC
                                                </span>
                                            ) : (
                                                <button onClick={(e) => { e.stopPropagation(); triggerAutoSub(item); }}
                                                    className="opacity-0 group-hover:opacity-100 flex items-center gap-0.5 px-2 py-1 rounded-lg bg-accent/10 text-accent hover:bg-accent/20 border border-accent/15 text-[9px] font-bold transition-all"
                                                    title="Auto-download subtitles">
                                                    <svg width="8" height="8" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"><path d="M5 1v6M3 5l2 2 2-2" /><path d="M1 8h8" /></svg>
                                                    CC
                                                </button>
                                            )}
                                            <button onClick={() => {
                                                const target = item.isDir ? findVideoInFolder(item.path)! : item;
                                                openSubPanel(target);
                                            }}
                                                className="opacity-0 group-hover:opacity-100 w-7 h-7 rounded-lg flex items-center justify-center bg-teal/15 text-teal hover:bg-teal/25 border border-teal/15 text-[10px] font-black transition-all"
                                                title="Browse subtitles">CC</button>
                                        </>
                                    )}
                                </div>
                            </div>
                        );
                    })}
                </div>
            )}

            {/* ── Subtitle Panel ── */}
            {subItem && (
                <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4 bg-black/70"
                    onClick={e => { if (e.target === e.currentTarget) { setSubItem(null); setSubResults([]); } }}>
                    <div className="w-full max-w-2xl rounded-2xl bg-surface border border-white/[0.06] shadow-cinema flex flex-col max-h-[85vh]">
                        {/* Header */}
                        <div className="flex items-start justify-between p-5 pb-4 border-b border-white/[0.06]">
                            <div className="min-w-0">
                                <h2 className="cine-title text-base font-bold text-text-1">Find Subtitles</h2>
                                <p className="text-[11px] text-text-3 truncate mt-0.5">{subItem.name}</p>
                            </div>
                            <button onClick={() => { setSubItem(null); setSubResults([]); }}
                                className="w-7 h-7 rounded-lg flex items-center justify-center text-text-3 hover:text-text-1 hover:bg-elevated transition-all shrink-0 ml-3">
                                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6 6 18M6 6l12 12" /></svg>
                            </button>
                        </div>
                        {/* Controls */}
                        <div className="p-4 border-b border-white/[0.06] flex gap-2">
                            <input type="text" value={subQuery} onChange={e => setSubQuery(e.target.value)}
                                onKeyDown={e => e.key === "Enter" && searchSubs(undefined, undefined, subItem ?? undefined)}
                                placeholder="Movie / show name…"
                                className="flex-1 px-3 py-2 rounded-xl bg-elevated border border-white/[0.06] text-sm text-text-1 placeholder-text-3 focus:outline-none focus:border-accent transition-all" />
                            <select value={subLang} onChange={e => { setSubLang(e.target.value); searchSubs(subQuery, e.target.value, subItem ?? undefined); }}
                                style={{ colorScheme: 'dark', backgroundColor: '#1c1c21' }}
                                className="px-3 py-2 rounded-xl bg-elevated border border-white/[0.06] text-sm text-text-2 focus:outline-none cursor-pointer shrink-0">
                                {LANGS.map(l => <option key={l.code} value={l.code} style={{ backgroundColor: '#1c1c21' }}>{l.label}</option>)}
                            </select>
                            <button onClick={() => searchSubs(undefined, undefined, subItem ?? undefined)} disabled={subLoading}
                                className="btn-primary px-4 py-2 rounded-xl text-sm font-bold transition-all disabled:opacity-50 shrink-0">
                                {subLoading ? "…" : "Search"}
                            </button>
                        </div>
                        {/* Message */}
                        {subMsg && (
                            <div className={`mx-4 mt-3 px-4 py-2.5 rounded-xl text-sm font-medium ${subMsg.type === "ok"
                                ? "bg-teal/10 text-teal border border-teal/15"
                                : "bg-danger/10 text-danger border border-danger/15"
                                }`}>{subMsg.text}</div>
                        )}
                        {/* Results */}
                        <div className="flex-1 overflow-y-auto p-4 space-y-1.5">
                            {subLoading ? (
                                <div className="py-10 text-center text-text-3 text-sm animate-pulse">Searching OpenSubtitles…</div>
                            ) : subResults.length === 0 && !subMsg ? (
                                <div className="py-10 text-center text-text-3 text-sm">Results will appear here</div>
                            ) : subResults.map(r => (
                                <div key={r.id} className={`flex items-center gap-3 px-4 py-3 rounded-xl border transition-all ${r.exact
                                    ? "bg-teal/[0.06] border-teal/20 hover:border-teal/30"
                                    : "bg-elevated border-white/[0.06] hover:border-white/[0.14]"
                                    }`}>
                                    <div className="flex-1 min-w-0">
                                        <p className="text-xs font-medium text-text-1 truncate">{r.name}</p>
                                        <div className="flex items-center gap-2 mt-1 flex-wrap">
                                            {r.exact && (
                                                <span className="flex items-center gap-0.5 text-[9px] px-1.5 py-0.5 rounded-md bg-teal/20 text-teal border border-teal/20 font-black tracking-wide">
                                                    <svg width="9" height="9" viewBox="0 0 24 24" fill="currentColor" stroke="none"><path d="M13 2 4 14h6l-1 8 9-12h-6l1-8Z" /></svg>
                                                    EXACT
                                                </span>
                                            )}
                                            <span className="text-[9px] px-1.5 py-0.5 rounded-md bg-white/[0.06] text-text-2 border border-white/[0.06] font-bold">{r.lang}</span>
                                            {r.hearing && <span className="text-[9px] px-1.5 py-0.5 rounded-md bg-accent/10 text-accent border border-accent/15">HoH</span>}
                                            <span className="flex items-center gap-0.5 text-[10px] text-text-3">
                                                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M12 3v12M7 11l5 5 5-5M5 21h14" /></svg>
                                                {parseInt(r.downloads || "0").toLocaleString()}
                                            </span>
                                            {r.rating && r.rating !== "0.0" && (
                                                <span className="flex items-center gap-0.5 text-[10px] text-warning">
                                                    <svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor" stroke="none"><path d="m12 2 2.9 6.3 6.9.6-5.2 4.6 1.6 6.8L12 17.3 5.8 20.9l1.6-6.8L2.2 9.5l6.9-.6L12 2Z" /></svg>
                                                    {parseFloat(r.rating).toFixed(1)}
                                                </span>
                                            )}
                                        </div>
                                    </div>
                                    <button onClick={() => downloadSub(r)} disabled={subDownloading === r.id}
                                        className={`shrink-0 px-3 py-1.5 rounded-lg text-[11px] font-bold border transition-all disabled:opacity-50 ${r.exact
                                            ? "bg-teal/15 text-teal hover:bg-teal/25 border-teal/15"
                                            : "bg-white/[0.06] text-text-2 hover:bg-white/[0.1] hover:text-text-1 border-white/[0.06]"
                                            }`}>
                                        {subDownloading === r.id ? "…" : "Download"}
                                    </button>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
