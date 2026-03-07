"use client";

import { useTorrents } from "@/context/TorrentContext";
import { useEffect, useState, useMemo, useRef, useCallback } from "react";
import axios from "axios";

const API_BASE = 'http://localhost:3001';

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

const CATEGORY_ICONS: Record<string, string> = {
    All: "🗂",
    Folder: "📁",
    Video: "🎬",
    Audio: "🎵",
    "App/Archive": "📦",
    Other: "📄",
};

const CATEGORY_COLORS: Record<string, string> = {
    Video: "text-teal bg-teal/10 border-teal/15",
    Audio: "text-accent bg-accent/10 border-accent/15",
    "App/Archive": "text-orange-400 bg-orange-400/10 border-orange-400/15",
    Folder: "text-blue-400 bg-blue-400/10 border-blue-400/15",
    Other: "text-text-3 bg-white/5 border-white/10",
};

const SORT_LABELS: Record<string, string> = {
    modified: "Newest first",
    size: "Largest first",
    name: "Name A–Z",
};

export default function LibraryPage() {
    const { library, fetchLibrary, settings, diskInfo } = useTorrents();
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
                setSubMsg({ type: "err", text: e.response?.data?.message || "Search failed. Check server connection." });
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
        fetchLibrary().finally(() => setLoading(false));
    }, [fetchLibrary]);

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
                    const q = cleanVideoName(item.name);
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
    }, [topLevel]);

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
        <div className="max-w-5xl mx-auto space-y-8">
            {/* Header */}
            <div className="flex items-end justify-between">
                <div>
                    <h1 className="text-4xl font-black tracking-tight mb-1">
                        <span className="bg-gradient-to-r from-white to-text-2 bg-clip-text text-transparent">Library</span>
                    </h1>
                    <p className="text-text-3 text-sm">
                        {loading ? "Loading…" : `${topLevel.length} items · ${formatSize(totalSize)}`}
                        {settings?.downloadPath && (
                            <span className="ml-2 text-text-3/50">→ {settings.downloadPath}</span>
                        )}
                    </p>
                </div>
                <div className="flex items-center gap-2">
                    <button onClick={() => setViewMode("grid")}
                        className={`w-8 h-8 rounded-lg flex items-center justify-center text-sm transition-all border ${viewMode === "grid" ? "bg-accent/15 text-accent border-accent/20" : "bg-white/[0.03] text-text-3 border-white/[0.06] hover:text-white"}`}
                        title="Grid view">⊞</button>
                    <button onClick={() => setViewMode("list")}
                        className={`w-8 h-8 rounded-lg flex items-center justify-center text-sm transition-all border ${viewMode === "list" ? "bg-accent/15 text-accent border-accent/20" : "bg-white/[0.03] text-text-3 border-white/[0.06] hover:text-white"}`}
                        title="List view">☰</button>
                    <button onClick={() => { setLoading(true); fetchLibrary().finally(() => setLoading(false)); }}
                        className="w-8 h-8 rounded-lg flex items-center justify-center text-sm bg-white/[0.03] text-text-3 hover:text-white border border-white/[0.06] transition-all"
                        title="Refresh">↻</button>
                </div>
            </div>

            {/* Stats Row */}
            {!loading && topLevel.length > 0 && (
                <div className="space-y-3">
                    <div className="grid grid-cols-3 gap-3">
                        <div className="rounded-2xl bg-gradient-to-br from-teal/10 to-transparent border border-teal/10 p-4">
                            <div className="text-[10px] font-bold text-teal/60 uppercase tracking-widest mb-1">Total Files</div>
                            <div className="text-2xl font-black text-white">{library.filter(i => !i.isDir).length}</div>
                        </div>
                        <div className="rounded-2xl bg-gradient-to-br from-accent/10 to-transparent border border-accent/10 p-4">
                            <div className="text-[10px] font-bold text-accent/60 uppercase tracking-widest mb-1">Videos</div>
                            <div className="text-2xl font-black text-white">{videoCount}</div>
                        </div>
                        <div className="rounded-2xl bg-gradient-to-br from-purple-500/10 to-transparent border border-purple-500/10 p-4">
                            <div className="text-[10px] font-bold text-purple-400/60 uppercase tracking-widest mb-1">Total Size</div>
                            <div className="text-2xl font-black text-white">{formatSize(totalSize)}</div>
                        </div>
                    </div>
                    {diskInfo && diskInfo.total > 0 && (() => {
                        const usedPct = (diskInfo.used / diskInfo.total) * 100;
                        const freePct = 100 - usedPct;
                        const fmtD = (b: number) => { const k = 1024, u = ["B", "KB", "MB", "GB", "TB"]; const i = Math.floor(Math.log(Math.max(b, 1)) / Math.log(k)); return (b / Math.pow(k, i)).toFixed(1) + " " + u[i]; };
                        return (
                            <div className="rounded-2xl bg-white/[0.02] border border-white/[0.04] px-5 py-4 space-y-2">
                                <div className="flex justify-between items-baseline">
                                    <span className="text-[10px] font-bold text-text-3/60 uppercase tracking-widest">Disk Usage</span>
                                    <div className="flex items-baseline gap-2 text-[11px] font-mono">
                                        <span className="text-text-3">{fmtD(diskInfo.used)} used</span>
                                        <span className="text-text-3/40">/</span>
                                        <span className="text-text-2 font-bold">{fmtD(diskInfo.total)}</span>
                                        <span className={`font-black ${freePct < 10 ? 'text-red-400' : freePct < 25 ? 'text-warning' : 'text-teal'}`}>· {fmtD(diskInfo.free)} free</span>
                                    </div>
                                </div>
                                <div className="h-2 bg-white/[0.05] rounded-full overflow-hidden">
                                    <div className={`h-full rounded-full transition-all duration-700 ${usedPct > 90 ? 'bg-gradient-to-r from-red-500 to-red-400' : usedPct > 75 ? 'bg-gradient-to-r from-warning to-amber-400' : 'bg-gradient-to-r from-accent to-teal'}`}
                                        style={{ width: `${Math.min(usedPct, 100)}%` }} />
                                </div>
                                <p className="text-[10px] text-text-3/40 truncate">{diskInfo.path}</p>
                            </div>
                        );
                    })()}
                </div>
            )}

            {/* Search + Sort */}
            <div className="flex gap-3">
                <div className="relative flex-1">
                    <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-text-3 text-sm pointer-events-none">
                        <svg width="13" height="13" viewBox="0 0 13 13" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"><circle cx="5.5" cy="5.5" r="4" /><path d="M9 9l2.5 2.5" /></svg>
                    </span>
                    <input
                        ref={searchInputRef}
                        type="text"
                        value={search}
                        onChange={e => setSearch(e.target.value)}
                        onKeyDown={e => e.key === 'Escape' && setSearch('')}
                        placeholder="Filter files… (press / to focus)"
                        className="w-full pl-9 pr-10 py-2.5 rounded-xl bg-white/[0.04] border border-white/[0.07] text-sm text-white placeholder-text-3 focus:outline-none focus:border-accent/40 focus:bg-white/[0.06] transition-all"
                    />
                    {search ? (
                        <button onClick={() => setSearch("")} className="absolute right-3 top-1/2 -translate-y-1/2 text-text-3 hover:text-white text-xs">✕</button>
                    ) : (
                        <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[10px] text-text-3/30 font-mono border border-white/[0.08] px-1.5 py-0.5 rounded pointer-events-none">/</span>
                    )}
                </div>
                <div className="relative" ref={sortRef}>
                    <button
                        onClick={() => setSortOpen(o => !o)}
                        className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-white/[0.04] border border-white/[0.07] hover:border-white/[0.14] text-sm text-text-2 hover:text-white transition-all min-w-[150px] justify-between"
                    >
                        <span>{SORT_LABELS[sortBy]}</span>
                        <span className={`text-[10px] text-text-3 transition-transform duration-200 ${sortOpen ? "rotate-180" : ""}`}>▼</span>
                    </button>
                    {sortOpen && (
                        <div className="absolute right-0 top-full mt-1.5 w-44 rounded-xl bg-[#12122a] border border-white/[0.08] shadow-2xl shadow-black/60 overflow-hidden z-50">
                            {(["modified", "size", "name"] as const).map(opt => (
                                <button key={opt} onClick={() => { setSortBy(opt); setSortOpen(false); }}
                                    className={`w-full text-left px-4 py-2.5 text-sm transition-all ${sortBy === opt
                                        ? "bg-accent/15 text-white font-semibold"
                                        : "text-text-2 hover:bg-white/[0.05] hover:text-white"
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
                <div className="flex gap-2 flex-wrap">
                    {categories.map(cat => {
                        const count = cat === "All" ? topLevel.length : topLevel.filter(i => i.category === cat).length;
                        const isActive = activeCategory === cat;
                        return (
                            <button key={cat} onClick={() => setActiveCategory(cat)}
                                className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl text-[11px] font-bold border transition-all ${isActive
                                    ? "bg-accent/15 text-accent border-accent/20"
                                    : "bg-white/[0.03] text-text-3 border-white/[0.05] hover:text-white hover:border-white/[0.1]"
                                    }`}>
                                <span>{CATEGORY_ICONS[cat] || "📄"}</span>
                                {cat}
                                <span className={`px-1.5 py-0.5 rounded-full text-[9px] font-bold ${isActive ? "bg-accent/20 text-accent" : "bg-white/5 text-text-3"}`}>{count}</span>
                            </button>
                        );
                    })}
                </div>
            )}

            {/* Content */}
            {loading ? (
                <div className="py-20 text-center">
                    <div className="text-4xl mb-3 opacity-20 animate-pulse">🎬</div>
                    <p className="text-text-3 text-sm">Loading library…</p>
                </div>
            ) : filtered.length === 0 ? (
                <div className="py-20 text-center rounded-3xl bg-white/[0.02] border border-dashed border-white/[0.06]">
                    <div className="text-4xl mb-3 opacity-20">🎬</div>
                    <p className="text-text-3 text-sm">{topLevel.length === 0 ? "No files in download folder yet" : "No results match your filter"}</p>
                    {topLevel.length === 0 && settings?.downloadPath && (
                        <p className="text-text-3/50 text-xs mt-1">{settings.downloadPath}</p>
                    )}
                </div>
            ) : viewMode === "grid" ? (
                <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                    {filtered.map((item, idx) => (
                        <div key={idx} className="group rounded-2xl bg-white/[0.02] border border-white/[0.04] hover:border-white/[0.08] hover:bg-white/[0.04] transition-all flex flex-col gap-0 overflow-hidden">
                            {/* Poster or skeleton or icon banner */}
                            {(item.category === 'Video' || item.isDir) && posters[item.name] === 'loading' ? (
                                <div className="w-full aspect-[2/3] bg-white/[0.04] animate-pulse rounded-t-xl flex items-center justify-center">
                                    <svg className="w-6 h-6 text-white/10" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>
                                </div>
                            ) : typeof posters[item.name] === 'string' && posters[item.name] !== 'loading' ? (
                                <div className="relative w-full aspect-[2/3] overflow-hidden bg-black/30">
                                    <img src={posters[item.name] as string} alt={item.name}
                                        className="w-full h-full object-cover opacity-90 group-hover:opacity-100 group-hover:scale-105 transition-all duration-500"
                                        onError={() => setPosters(prev => ({ ...prev, [item.name]: null }))}
                                    />
                                    <div className="absolute inset-0 bg-gradient-to-t from-[#0e0e1a]/80 via-transparent to-transparent" />
                                    <span className={`absolute top-2 right-2 px-2 py-0.5 rounded-lg text-[9px] font-bold border ${CATEGORY_COLORS[item.category] || CATEGORY_COLORS.Other}`}>
                                        {item.category}
                                    </span>
                                </div>
                            ) : (
                                <div className="px-4 pt-4 pb-0 flex items-center justify-between">
                                    <span className="text-2xl">{CATEGORY_ICONS[item.category] || "📄"}</span>
                                    <span className={`px-2 py-0.5 rounded-lg text-[9px] font-bold border ${CATEGORY_COLORS[item.category] || CATEGORY_COLORS.Other}`}>
                                        {item.category}
                                    </span>
                                </div>
                            )}
                            {/* Name + meta */}
                            <div className="flex flex-col gap-2 p-4 flex-1">
                                <p className="text-xs font-semibold text-white leading-tight line-clamp-2 break-all">{item.name}</p>
                                <div className="mt-auto flex items-center justify-between text-[10px] text-text-3">
                                    <span className="font-mono">{item.isDir ? "—" : formatSize(item.size)}</span>
                                    <div className="flex items-center gap-1.5">
                                        <span>{formatDate(item.modified)}</span>
                                        {(item.category === "Video" || (item.isDir && findVideoInFolder(item.path))) && (
                                            <button onClick={() => {
                                                const target = item.isDir ? findVideoInFolder(item.path)! : item;
                                                openSubPanel(target);
                                            }}
                                                className="opacity-0 group-hover:opacity-100 transition-all w-6 h-6 rounded-lg flex items-center justify-center bg-teal/15 text-teal hover:bg-teal/25 border border-teal/15 text-[9px] font-black"
                                                title="Find subtitles">CC</button>
                                        )}
                                    </div>
                                </div>
                            </div>
                        </div>
                    ))}
                </div>
            ) : (
                <div className="space-y-1.5">
                    {filtered.map((item, idx) => (
                        <div key={idx} className="group flex items-center gap-4 px-5 py-3 rounded-xl bg-white/[0.02] border border-white/[0.04] hover:border-white/[0.08] hover:bg-white/[0.04] transition-all">
                            <span className="text-xl shrink-0">{CATEGORY_ICONS[item.category] || "📄"}</span>
                            <div className="flex-1 min-w-0">
                                <p className="text-sm font-medium text-white truncate">{item.name}</p>
                                <p className="text-[10px] text-text-3 mt-0.5 truncate">{item.path}</p>
                            </div>
                            <span className={`px-2 py-0.5 rounded-lg text-[9px] font-bold border shrink-0 ${CATEGORY_COLORS[item.category] || CATEGORY_COLORS.Other}`}>
                                {item.category}
                            </span>
                            <span className="text-[11px] font-mono text-text-3 shrink-0 w-16 text-right">
                                {item.isDir ? "—" : formatSize(item.size)}
                            </span>
                            <span className="text-[10px] text-text-3 shrink-0 w-24 text-right">{formatDate(item.modified)}</span>
                            <div className="flex gap-1 shrink-0 opacity-0 group-hover:opacity-100 transition-all">
                                {(item.category === "Video" || (item.isDir && findVideoInFolder(item.path))) && (
                                    <button onClick={() => {
                                        const target = item.isDir ? findVideoInFolder(item.path)! : item;
                                        openSubPanel(target);
                                    }}
                                        className="w-7 h-7 rounded-lg flex items-center justify-center bg-teal/15 text-teal hover:bg-teal/25 border border-teal/15 text-[10px] font-black transition-all"
                                        title="Find subtitles">CC</button>
                                )}
                            </div>
                        </div>
                    ))}
                </div>
            )}

            {/* ── Subtitle Panel ── */}
            {subItem && (
                <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
                    onClick={e => { if (e.target === e.currentTarget) { setSubItem(null); setSubResults([]); } }}>
                    <div className="w-full max-w-2xl rounded-2xl bg-[#0d0d20] border border-white/[0.08] shadow-2xl shadow-black/80 flex flex-col max-h-[85vh]">
                        {/* Header */}
                        <div className="flex items-start justify-between p-5 pb-4 border-b border-white/[0.06]">
                            <div className="min-w-0">
                                <h2 className="text-base font-bold text-white">Find Subtitles</h2>
                                <p className="text-[11px] text-text-3 truncate mt-0.5">{subItem.name}</p>
                            </div>
                            <button onClick={() => { setSubItem(null); setSubResults([]); }}
                                className="w-7 h-7 rounded-lg flex items-center justify-center text-text-3 hover:text-white hover:bg-white/[0.06] transition-all text-sm shrink-0 ml-3">✕</button>
                        </div>
                        {/* Controls */}
                        <div className="p-4 border-b border-white/[0.04] flex gap-2">
                            <input type="text" value={subQuery} onChange={e => setSubQuery(e.target.value)}
                                onKeyDown={e => e.key === "Enter" && searchSubs(undefined, undefined, subItem ?? undefined)}
                                placeholder="Movie / show name…"
                                className="flex-1 px-3 py-2 rounded-xl bg-white/[0.04] border border-white/[0.07] text-sm text-white placeholder-text-3 focus:outline-none focus:border-teal/40 transition-all" />
                            <select value={subLang} onChange={e => { setSubLang(e.target.value); searchSubs(subQuery, e.target.value, subItem ?? undefined); }}
                                style={{ colorScheme: 'dark', backgroundColor: '#0d0d20' }}
                                className="px-3 py-2 rounded-xl border border-white/[0.07] text-sm text-text-2 focus:outline-none cursor-pointer shrink-0">
                                {LANGS.map(l => <option key={l.code} value={l.code} style={{ backgroundColor: '#0d0d20' }}>{l.label}</option>)}
                            </select>
                            <button onClick={() => searchSubs(undefined, undefined, subItem ?? undefined)} disabled={subLoading}
                                className="px-4 py-2 rounded-xl bg-teal/15 text-teal hover:bg-teal/25 border border-teal/15 text-sm font-bold transition-all disabled:opacity-50 shrink-0">
                                {subLoading ? "…" : "Search"}
                            </button>
                        </div>
                        {/* Message */}
                        {subMsg && (
                            <div className={`mx-4 mt-3 px-4 py-2.5 rounded-xl text-sm font-medium ${subMsg.type === "ok"
                                ? "bg-teal/10 text-teal border border-teal/15"
                                : "bg-red-500/10 text-red-400 border border-red-500/15"
                                }`}>{subMsg.text}</div>
                        )}
                        {/* Results */}
                        <div className="flex-1 overflow-y-auto p-4 space-y-1.5">
                            {subLoading ? (
                                <div className="py-10 text-center text-text-3 text-sm animate-pulse">Searching OpenSubtitles…</div>
                            ) : subResults.length === 0 && !subMsg ? (
                                <div className="py-10 text-center text-text-3/40 text-sm">Results will appear here</div>
                            ) : subResults.map(r => (
                                <div key={r.id} className={`flex items-center gap-3 px-4 py-3 rounded-xl border transition-all ${r.exact
                                    ? "bg-teal/[0.04] border-teal/20 hover:border-teal/30"
                                    : "bg-white/[0.02] border-white/[0.04] hover:border-white/[0.08] hover:bg-white/[0.04]"
                                    }`}>
                                    <div className="flex-1 min-w-0">
                                        <p className="text-xs font-medium text-white truncate">{r.name}</p>
                                        <div className="flex items-center gap-2 mt-1 flex-wrap">
                                            {r.exact && (
                                                <span className="text-[9px] px-1.5 py-0.5 rounded-md bg-teal/20 text-teal border border-teal/20 font-black tracking-wide">⚡ EXACT</span>
                                            )}
                                            <span className="text-[9px] px-1.5 py-0.5 rounded-md bg-white/[0.06] text-text-2 border border-white/[0.06] font-bold">{r.lang}</span>
                                            {r.hearing && <span className="text-[9px] px-1.5 py-0.5 rounded-md bg-blue-500/10 text-blue-400 border border-blue-500/10">HoH</span>}
                                            <span className="text-[10px] text-text-3">↓ {parseInt(r.downloads || "0").toLocaleString()}</span>
                                            {r.rating && r.rating !== "0.0" && <span className="text-[10px] text-yellow-400">★ {parseFloat(r.rating).toFixed(1)}</span>}
                                        </div>
                                    </div>
                                    <button onClick={() => downloadSub(r)} disabled={subDownloading === r.id}
                                        className={`shrink-0 px-3 py-1.5 rounded-lg text-[11px] font-bold border transition-all disabled:opacity-50 ${r.exact
                                            ? "bg-teal/15 text-teal hover:bg-teal/25 border-teal/15"
                                            : "bg-white/[0.06] text-text-2 hover:bg-white/[0.1] hover:text-white border-white/[0.08]"
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
