"use client";

import { useTorrents } from "@/context/TorrentContext";
import { useState, useRef, useEffect, useCallback, useMemo } from "react";

const SORT_OPTIONS = ['Relevance', 'Seeders (Most)', 'Seeders (Least)', 'Size (Largest)', 'Size (Smallest)'];

const LANGS = [
    { code: "en", label: "English" }, { code: "hi", label: "Hindi" },
    { code: "ko", label: "Korean" }, { code: "ja", label: "Japanese" },
    { code: "zh", label: "Chinese" }, { code: "es", label: "Spanish" },
    { code: "fr", label: "French" }, { code: "ar", label: "Arabic" },
    { code: "pt", label: "Portuguese" }, { code: "de", label: "German" },
];

interface SubResult {
    id: string;
    fileId?: number;
    name: string;
    lang: string;
    rating: string;
    downloads: string;
    hearing: boolean;
    format: string;
    movieName: string;
    year: string;
    exact?: boolean;
}

export default function SearchPage() {
    const {
        searchResults, searchLogs, searchQuery, setSearchQuery,
        isSearching, doSearch, cancelSearch, clearSearch, getSuggestions
    } = useTorrents();

    const [sortBy, setSortBy] = useState('Relevance');
    const [sortOpen, setSortOpen] = useState(false);
    const [providerFilter, setProviderFilter] = useState<string | null>(null);
    const [addingId, setAddingId] = useState<number | null>(null);
    const [addedIds, setAddedIds] = useState<Set<number>>(new Set());
    const [errorId, setErrorId] = useState<number | null>(null);
    const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());
    const [groupMode, setGroupMode] = useState(true); // toggle grouping on/off

    const [suggestions, setSuggestions] = useState<string[]>([]);
    const [showSuggestions, setShowSuggestions] = useState(false);
    const [searchedOnce, setSearchedOnce] = useState(false);

    // Subtitle panel state
    const [subOpenId, setSubOpenId] = useState<number | null>(null);
    const [subResults, setSubResults] = useState<SubResult[]>([]);
    const [subLoading, setSubLoading] = useState(false);
    const [subLang, setSubLang] = useState('en');
    const [subQuery, setSubQuery] = useState('');
    const [subError, setSubError] = useState('');
    const [downloadingId, setDownloadingId] = useState<string | null>(null);
    const [downloadedIds, setDownloadedIds] = useState<Set<string>>(new Set());

    const sortRef = useRef<HTMLDivElement>(null);
    const suggestionRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const handleClickOutside = (e: MouseEvent) => {
            if (sortRef.current && !sortRef.current.contains(e.target as Node)) setSortOpen(false);
            if (suggestionRef.current && !suggestionRef.current.contains(e.target as Node)) setShowSuggestions(false);
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    const updateSuggestions = useCallback(async (q: string) => {
        if (q.length < 2) {
            setSuggestions([]);
            setShowSuggestions(false);
            return;
        }
        const results = await getSuggestions(q);
        setSuggestions(results);
        setShowSuggestions(results.length > 0);
    }, [getSuggestions]);

    // ── Subtitle helpers ──────────────────────────────────────────────────────
    const cleanTitle = (title: string) =>
        title.replace(/\.(mkv|mp4|avi|mov)$/i, '')
            .replace(/[\._]/g, ' ')
            .replace(/\b(720p|1080p|2160p|4k|bluray|bdrip|webrip|web-dl|x264|x265|hevc|avc|xvid|dvdrip|hdrip|hdtv|H\.264|H\.265|AAC|AC3|DTS|YIFY|YTSYIFY|REPACK|PROPER|EXTENDED)\b/gi, '')
            .replace(/\s+/g, ' ').trim();

    const searchSubs = useCallback(async (title: string, lang: string) => {
        setSubLoading(true);
        setSubError('');
        setSubResults([]);
        try {
            const params = new URLSearchParams({ name: title, lang });
            const r = await fetch(`http://localhost:3001/api/subtitles?${params}`);
            const data = await r.json();
            if (data.error === 'NO_API_KEY') {
                setSubError('⚠️ No API key configured. Go to Settings → Subtitles to add your OpenSubtitles.com key.');
                return;
            }
            if (!r.ok) { setSubError(data.error || 'Search failed'); return; }
            setSubResults(data);
            if (data.length === 0) setSubError('No subtitles found. Try a shorter title or different language.');
        } catch {
            setSubError('Connection error — is the server running?');
        } finally {
            setSubLoading(false);
        }
    }, []);

    const openSubPanel = (res: typeof searchResults[0]) => {
        if (subOpenId === res.id) { setSubOpenId(null); return; }
        const title = cleanTitle(res.title);
        setSubOpenId(res.id);
        setSubQuery(title);
        setSubResults([]);
        setSubError('');
        searchSubs(title, subLang);
    };

    const downloadSub = async (result: SubResult, torrentTitle: string) => {
        if (!result.fileId) { setSubError('No file ID available for this subtitle.'); return; }
        setDownloadingId(result.id);
        try {
            const destFolder = (await fetch('http://localhost:3001/api/settings').then(r => r.json())).downloadPath || '.';
            const r = await fetch('http://localhost:3001/api/subtitles/download', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ fileId: result.fileId, filename: result.name, destFolder }),
            });
            const data = await r.json();
            if (!r.ok) throw new Error(data.error || 'Download failed');
            setDownloadedIds(prev => new Set(prev).add(result.id));
        } catch (e: unknown) {
            setSubError(e instanceof Error ? e.message : 'Download failed');
        } finally {
            setDownloadingId(null);
        }
    };

    const handleSearch = (e?: React.FormEvent, qOverride?: string) => {
        if (e) e.preventDefault();
        const q = (qOverride || searchQuery).trim();
        if (q) {
            setShowSuggestions(false);
            setSearchedOnce(true);
            doSearch(q);
        }
    };

    const handleClear = () => {
        clearSearch();
        setSearchedOnce(false);
        setSuggestions([]);
        setShowSuggestions(false);
        setAddedIds(new Set());
        setSortBy('Relevance');
        setProviderFilter(null);
    };

    const handleAdd = async (id: number) => {
        setAddingId(id);
        setErrorId(null);
        try {
            const magnetRes = await fetch(`http://localhost:3001/api/magnet/${id}`);
            if (!magnetRes.ok) throw new Error('Magnet fetch failed');
            const { magnet } = await magnetRes.json();
            if (!magnet) throw new Error('No magnet returned');

            const addRes = await fetch('http://localhost:3001/api/torrents', {
                method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ magnet })
            });
            if (!addRes.ok) throw new Error('Add failed');

            setAddedIds(prev => new Set(prev).add(id));
        } catch (err) {
            console.error('Add error:', err);
            setErrorId(id);
            setTimeout(() => setErrorId(null), 3000);
        }
        setAddingId(null);
    };

    const parseSize = (s: string) => {
        const match = s.match(/([\d.]+)\s*(GB|MB|KB|TB)/i);
        if (!match) return 0;
        const val = parseFloat(match[1]);
        const unit = match[2].toUpperCase();
        if (unit === 'TB') return val * 1024 * 1024;
        if (unit === 'GB') return val * 1024;
        if (unit === 'MB') return val;
        return val / 1024;
    };

    // Detect TV episode and extract parts
    const parseEpisode = (title: string): { showName: string; season: number; episode: number; episodeKey: string } | null => {
        // Match S01E01, S01E01-E02, 1x01, etc.
        const m = title.match(/^(.+?)\s*[Ss](\d{1,2})[Ee](\d{1,2})/);
        if (m) {
            const showName = m[1].replace(/[._]/g, ' ').replace(/\s+/g, ' ').trim();
            return { showName, season: parseInt(m[2]), episode: parseInt(m[3]), episodeKey: `${showName}__S${m[2].padStart(2, '0')}` };
        }
        // Match Show.Name.1x01
        const m2 = title.match(/^(.+?)\s*(\d{1,2})x(\d{2})/);
        if (m2) {
            const showName = m2[1].replace(/[._]/g, ' ').replace(/\s+/g, ' ').trim();
            return { showName, season: parseInt(m2[2]), episode: parseInt(m2[3]), episodeKey: `${showName}__S${m2[2].padStart(2, '0')}` };
        }
        return null;
    };

    const baseSorted = [...searchResults].sort((a, b) => {
        if (sortBy === 'Seeders (Most)') return b.seeders - a.seeders;
        if (sortBy === 'Seeders (Least)') return a.seeders - b.seeders;
        if (sortBy === 'Size (Largest)') return parseSize(b.size) - parseSize(a.size);
        if (sortBy === 'Size (Smallest)') return parseSize(a.size) - parseSize(b.size);
        return 0;
    });
    const sorted = providerFilter ? baseSorted.filter(r => r.provider === providerFilter) : baseSorted;

    // Group TV episodes — only when groupMode is on and not sorted by anything specific
    interface EpGroup { key: string; showName: string; season: number; episodes: typeof sorted; bestSeeders: number; }
    const { flatItems, groups } = useMemo<{ flatItems: typeof sorted; groups: Map<string, EpGroup> }>(() => {
        if (!groupMode) return { flatItems: sorted, groups: new Map() };
        const groups = new Map<string, EpGroup>();
        const flatItems: typeof sorted = [];
        for (const r of sorted) {
            const ep = parseEpisode(r.title);
            if (ep) {
                const existing = groups.get(ep.episodeKey);
                if (existing) {
                    existing.episodes.push(r);
                    if (r.seeders > existing.bestSeeders) existing.bestSeeders = r.seeders;
                } else {
                    groups.set(ep.episodeKey, { key: ep.episodeKey, showName: ep.showName, season: ep.season, episodes: [r], bestSeeders: r.seeders });
                }
            } else {
                flatItems.push(r);
            }
        }
        // Sort episodes within each group
        for (const g of groups.values()) {
            g.episodes.sort((a, b) => {
                const ea = parseEpisode(a.title);
                const eb = parseEpisode(b.title);
                return (ea?.episode ?? 0) - (eb?.episode ?? 0);
            });
        }
        return { flatItems, groups };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [sorted, groupMode]);

    const toggleGroup = (key: string) => setExpandedGroups(prev => {
        const n = new Set(prev);
        n.has(key) ? n.delete(key) : n.add(key);
        return n;
    });

    return (
        <div className="max-w-5xl mx-auto space-y-6">
            {/* Hero Search */}
            <div className="relative rounded-3xl p-8 pb-10">
                <div className="absolute inset-0 bg-gradient-to-br from-accent/20 via-[#1a1040] to-teal/10 -z-10 rounded-3xl overflow-hidden" />
                <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,rgba(124,106,255,0.15),transparent_60%)] -z-10 rounded-3xl" />

                <h1 className="text-4xl font-black text-center mb-6 tracking-tight text-white">
                    Search Torrents
                </h1>

                <div className="relative max-w-2xl mx-auto" ref={suggestionRef}>
                    <form onSubmit={(e) => handleSearch(e)} className="flex bg-white/[0.06] backdrop-blur-xl border border-white/[0.08] rounded-2xl overflow-hidden focus-within:border-accent/40 transition-all">
                        <input
                            type="text" value={searchQuery}
                            onChange={(e) => {
                                setSearchQuery(e.target.value);
                                updateSuggestions(e.target.value);
                            }}
                            onFocus={() => { if (suggestions.length > 0) setShowSuggestions(true); }}
                            placeholder="Search movies, shows, software, games..."
                            className="flex-1 bg-transparent px-6 py-4 text-white placeholder-text-3 focus:outline-none text-sm"
                        />
                        {searchQuery.length > 0 && !isSearching && (
                            <button type="button" onClick={handleClear}
                                className="px-3 py-4 text-text-3 hover:text-white transition-colors"
                                title="Clear search">
                                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                            </button>
                        )}
                        {isSearching ? (
                            <button type="button" onClick={cancelSearch}
                                className="px-6 py-4 bg-red-500/20 text-red-400 font-bold text-sm hover:bg-red-500/30 transition-all">
                                Cancel
                            </button>
                        ) : (
                            <button type="submit"
                                className="px-8 py-4 bg-gradient-to-r from-accent to-accent/80 text-white font-bold text-sm hover:brightness-110 transition-all">
                                Search
                            </button>
                        )}
                    </form>

                    {/* Suggestions Dropdown */}
                    {showSuggestions && suggestions.length > 0 && (
                        <div className="absolute top-full left-0 right-0 mt-3 bg-[#111122] border border-accent/20 rounded-2xl shadow-[0_10px_40px_-10px_rgba(0,0,0,0.8)] z-[100] overflow-hidden py-2 backdrop-blur-2xl">
                            <div className="px-5 py-2 text-[10px] font-bold text-accent/50 uppercase tracking-widest border-b border-white/5 mb-1">Suggestions</div>
                            {suggestions.map((s, i) => (
                                <button key={i} onClick={() => { setSearchQuery(s); handleSearch(undefined, s); }}
                                    className="w-full text-left px-5 py-3 text-sm text-text-2 hover:bg-accent/10 hover:text-white transition-all flex items-center gap-3">
                                    <span className="opacity-40">🔍</span>
                                    <span>{s}</span>
                                </button>
                            ))}
                        </div>
                    )}
                </div>
            </div>

            {/* Search Progress Logs — clickable to filter by provider */}
            {searchLogs.length > 0 && (
                <div className="flex flex-wrap gap-2">
                    {searchLogs.map((log: any) => {
                        const isActive = providerFilter === log.name;
                        const isDone = log.status === 'done';
                        const count = isDone
                            ? searchResults.filter(r => r.provider === log.name).length
                            : 0;
                        return (
                            <button
                                key={log.name}
                                onClick={() => isDone ? setProviderFilter(isActive ? null : log.name) : undefined}
                                disabled={!isDone}
                                className={`px-4 py-2.5 rounded-xl border text-[11px] font-bold transition-all flex items-center gap-2
                                    ${isDone
                                        ? isActive
                                            ? 'bg-teal/20 border-teal/40 text-teal ring-1 ring-teal/30 scale-[1.03]'
                                            : 'bg-teal/10 border-teal/20 text-teal hover:bg-teal/20 hover:scale-[1.02] cursor-pointer'
                                        : log.status === 'searching'
                                            ? 'bg-accent/10 border-accent/20 text-accent animate-pulse-glow cursor-default'
                                            : log.status === 'error'
                                                ? 'bg-red-500/10 border-red-500/20 text-red-400 cursor-default opacity-70'
                                                : 'bg-white/[0.02] border-white/[0.04] text-text-3 opacity-40 cursor-default'
                                    }`}
                            >
                                <span className="uppercase tracking-widest">{log.name}</span>
                                {isDone ? (
                                    <span className={`font-mono px-1.5 py-0.5 rounded-md text-[10px] ${isActive ? 'bg-teal/20' : 'bg-white/[0.06]'}`}>
                                        {isActive ? `${count}` : `${count} res`}
                                    </span>
                                ) : log.status === 'searching' ? (
                                    <span className="opacity-60">...</span>
                                ) : log.status === 'error' ? (
                                    <span title={log.message} className="opacity-60">✗</span>
                                ) : null}
                                {isActive && <span className="text-[9px] opacity-60">✕</span>}
                            </button>
                        );
                    })}
                    {providerFilter && (
                        <button
                            onClick={() => setProviderFilter(null)}
                            className="px-3 py-2.5 rounded-xl border border-white/[0.06] text-[11px] text-text-3 hover:text-white hover:bg-white/[0.05] transition-all">
                            Show all
                        </button>
                    )}
                </div>
            )}

            {/* Results */}
            {isSearching && searchResults.length === 0 ? (
                <div className="flex flex-col items-center py-16 gap-4">
                    <div className="w-10 h-10 border-2 border-accent/30 border-t-accent rounded-full animate-spin" />
                    <p className="text-text-3 text-sm">Collating results from {searchLogs.filter(l => l.status === 'done').length} sites...</p>
                </div>
            ) : sorted.length > 0 ? (
                <>
                    {/* Results Header */}
                    <div className="flex items-center justify-between">
                        <div>
                            <h2 className="text-xl font-black text-white">Results</h2>
                            <p className="text-xs text-text-3 mt-0.5">
                                {sorted.length} {providerFilter ? <><span className="text-teal font-semibold">{providerFilter}</span> results</> : 'torrents found'}
                                {groups.size > 0 && <span className="ml-2 text-accent/60">· {groups.size} show{groups.size !== 1 ? 's' : ''} grouped</span>}
                            </p>
                        </div>

                        <div className="flex items-center gap-3">
                            {/* Group toggle */}
                            <button onClick={() => setGroupMode(m => !m)}
                                className={`flex items-center gap-1.5 px-3 py-2 rounded-xl border text-xs font-bold transition-all ${groupMode ? 'bg-accent/15 text-accent border-accent/20' : 'bg-white/[0.03] border-white/[0.06] text-text-3 hover:text-white'
                                    }`}
                                title="Group TV episodes by show">
                                <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"><rect x="1" y="1" width="4" height="4" rx="0.8" /><rect x="7" y="1" width="4" height="4" rx="0.8" /><rect x="1" y="7" width="4" height="4" rx="0.8" /><rect x="7" y="7" width="4" height="4" rx="0.8" /></svg>
                                Group series
                            </button>
                            <button onClick={handleClear}
                                className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-white/[0.03] border border-white/[0.06] text-xs text-text-3 hover:text-white hover:bg-white/[0.06] transition-all">
                                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                                Clear
                            </button>
                            <div className="relative" ref={sortRef}>
                                <button onClick={() => setSortOpen(!sortOpen)}
                                    className="flex items-center gap-2 px-4 py-2 rounded-xl bg-white/[0.04] border border-white/[0.06] text-sm text-text-2 hover:text-white transition-all">
                                    <span className="text-text-3 text-[10px] font-bold uppercase tracking-wider">Sort</span>
                                    <span className="text-white font-medium">{sortBy}</span>
                                    <svg className={`w-3.5 h-3.5 transition-transform ${sortOpen ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
                                </button>
                                {sortOpen && (
                                    <div className="absolute right-0 top-full mt-2 w-52 bg-[#0e0e1a] border border-white/[0.08] rounded-2xl shadow-2xl z-50 overflow-hidden">
                                        {SORT_OPTIONS.map(opt => (
                                            <button key={opt} onClick={() => { setSortBy(opt); setSortOpen(false); }}
                                                className={`w-full text-left px-5 py-3 text-sm transition-all ${opt === sortBy ? 'bg-accent/10 text-accent font-bold' : 'text-text-2 hover:bg-white/[0.04] hover:text-white'}`}>
                                                {opt}
                                            </button>
                                        ))}
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>

                    <div className="grid gap-3">
                        {/* TV series groups */}
                        {[...groups.values()].map(group => {
                            const isExpanded = expandedGroups.has(group.key);
                            const epCount = group.episodes.length;
                            return (
                                <div key={group.key} className="rounded-2xl bg-white/[0.02] border border-accent/10 overflow-hidden">
                                    {/* Group header — div not button to avoid nested button violation */}
                                    <div
                                        role="button" tabIndex={0}
                                        onClick={() => toggleGroup(group.key)}
                                        onKeyDown={e => (e.key === 'Enter' || e.key === ' ') && toggleGroup(group.key)}
                                        className="w-full flex items-center gap-4 p-5 hover:bg-white/[0.03] transition-all cursor-pointer select-none">
                                        <div className="w-9 h-9 rounded-xl bg-accent/10 border border-accent/15 flex items-center justify-center shrink-0">
                                            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" className="text-accent">
                                                <rect x="1" y="2" width="14" height="10" rx="2" /><path d="M5 14h6M8 12v2" />
                                            </svg>
                                        </div>
                                        <div className="flex-1 min-w-0">
                                            <h3 className="text-white font-bold truncate">{group.showName}</h3>
                                            <p className="text-[11px] text-text-3 mt-0.5">
                                                Season {group.season}
                                                <span className="mx-1.5 opacity-30">·</span>
                                                <span className="text-accent font-bold">{epCount} episode{epCount !== 1 ? 's' : ''}</span>
                                                <span className="mx-1.5 opacity-30">·</span>
                                                best: <span className="text-teal font-mono font-bold">{group.bestSeeders} seeds</span>
                                            </p>
                                        </div>
                                        <div className="flex items-center gap-2 shrink-0">
                                            <button
                                                onClick={e => { e.stopPropagation(); group.episodes.forEach(r => handleAdd(r.id)); }}
                                                className="px-4 py-2 rounded-xl text-xs font-bold bg-accent/10 text-accent border border-accent/15 hover:bg-accent hover:text-white transition-all">
                                                All
                                            </button>
                                            <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"
                                                className={`text-text-3 transition-transform duration-200 ${isExpanded ? 'rotate-180' : ''}`}>
                                                <path d="M3 5l4 4 4-4" />
                                            </svg>
                                        </div>
                                    </div>
                                    {/* Episodes list */}
                                    {isExpanded && (
                                        <div className="border-t border-white/[0.05] divide-y divide-white/[0.03]">
                                            {group.episodes.map(res => {
                                                const ep = parseEpisode(res.title);
                                                return (
                                                    <div key={res.id} className="flex items-center gap-4 px-5 py-3.5 hover:bg-white/[0.03] transition-all">
                                                        {ep && (
                                                            <span className="shrink-0 w-9 text-center text-[10px] font-black font-mono text-accent/70 bg-accent/10 rounded-lg py-1">
                                                                E{String(ep.episode).padStart(2, '0')}
                                                            </span>
                                                        )}
                                                        <div className="flex-1 min-w-0">
                                                            <p className="text-sm text-white/80 truncate">{res.title}</p>
                                                            <div className="flex items-center gap-3 text-[10px] mt-0.5">
                                                                <span className="text-text-3 font-mono">{res.size}</span>
                                                                <span className="text-teal font-bold">{res.seeders}S</span>
                                                                <span className="text-text-3/40 uppercase tracking-widest">{res.provider}</span>
                                                            </div>
                                                        </div>
                                                        <button onClick={() => handleAdd(res.id)} disabled={addingId === res.id || addedIds.has(res.id)}
                                                            className={`shrink-0 px-4 py-2 rounded-xl text-xs font-bold transition-all active:scale-95 disabled:cursor-default ${addedIds.has(res.id) ? 'bg-teal/15 text-teal border border-teal/20' :
                                                                    errorId === res.id ? 'bg-red-500/15 text-red-400' :
                                                                        addingId === res.id ? 'bg-accent/10 text-accent/60' :
                                                                            'bg-accent/10 text-accent border border-accent/15 hover:bg-accent hover:text-white'
                                                                }`}>
                                                            {addedIds.has(res.id) ? '✓' : errorId === res.id ? '✗' : addingId === res.id ? '...' : '+'}
                                                        </button>
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    )}
                                </div>
                            );
                        })}

                        {/* Flat results (movies + ungrouped) */}
                        {flatItems.map((res) => (
                            <div key={res.id} className="rounded-2xl bg-white/[0.02] border border-white/[0.04] overflow-hidden transition-all">
                                {/* Result Row */}
                                <div className="group flex items-center gap-4 p-5 hover:bg-white/[0.03] transition-all">
                                    <div className="flex-1 min-w-0 space-y-1.5">
                                        <h3 className="text-white font-bold group-hover:text-accent transition-colors truncate">{res.title}</h3>
                                        <div className="flex items-center gap-3 text-xs">
                                            <span className="text-text-3 font-mono">{res.size}</span>
                                            <span className="flex items-center gap-1">
                                                <span className="w-1.5 h-1.5 rounded-full bg-teal" />
                                                <span className="text-teal font-bold">{res.seeders}</span>
                                            </span>
                                            <span className="flex items-center gap-1">
                                                <span className="w-1.5 h-1.5 rounded-full bg-warning" />
                                                <span className="text-warning font-bold">{res.leechers}</span>
                                            </span>
                                            <span className="text-text-3/50 uppercase tracking-widest text-[9px]">{res.provider}</span>
                                        </div>
                                    </div>
                                    <div className="flex items-center gap-2">
                                        {/* CC / Subtitles button */}
                                        <button
                                            onClick={() => openSubPanel(res)}
                                            title="Find subtitles"
                                            className={`px-3 py-2.5 rounded-xl text-xs font-bold border transition-all ${subOpenId === res.id
                                                ? 'bg-teal/20 border-teal/40 text-teal'
                                                : 'bg-white/[0.04] border-white/[0.08] text-text-3 hover:text-teal hover:border-teal/30 hover:bg-teal/10'}`}>
                                            CC
                                        </button>
                                        <button onClick={() => handleAdd(res.id)} disabled={addingId === res.id || addedIds.has(res.id)}
                                            className={`px-6 py-2.5 rounded-xl text-xs font-bold transition-all active:scale-95 disabled:cursor-default ${addedIds.has(res.id) ? 'bg-teal/15 text-teal border border-teal/20' :
                                                errorId === res.id ? 'bg-red-500/15 text-red-400' :
                                                    addingId === res.id ? 'bg-accent/10 text-accent/60' :
                                                        'bg-accent/10 text-accent border border-accent/15 hover:bg-accent hover:text-white'
                                                }`}>
                                            {addedIds.has(res.id) ? '✓ Added' : errorId === res.id ? '✗ Failed' : addingId === res.id ? '⏳ Adding...' : 'Download'}
                                        </button>
                                    </div>
                                </div>

                                {/* Subtitle Panel — inline below card */}
                                {subOpenId === res.id && (
                                    <div className="border-t border-white/[0.06] bg-black/20 p-5 space-y-4">
                                        {/* Controls */}
                                        <div className="flex items-center gap-3 flex-wrap">
                                            <span className="text-xs text-teal font-bold uppercase tracking-wider">Subtitles</span>
                                            <input
                                                type="text"
                                                value={subQuery}
                                                onChange={e => setSubQuery(e.target.value)}
                                                onKeyDown={e => { if (e.key === 'Enter') searchSubs(subQuery, subLang); }}
                                                className="flex-1 min-w-[160px] bg-white/[0.05] border border-white/[0.08] rounded-xl px-3 py-2 text-white text-xs focus:outline-none focus:border-teal/40 placeholder-text-3"
                                                placeholder="Movie name..."
                                            />
                                            <select
                                                value={subLang}
                                                onChange={e => { setSubLang(e.target.value); searchSubs(subQuery, e.target.value); }}
                                                style={{ colorScheme: 'dark', backgroundColor: '#0e0e1a' }}
                                                className="border border-white/[0.08] rounded-xl px-3 py-2 text-white text-xs focus:outline-none cursor-pointer">
                                                {LANGS.map(l => <option key={l.code} value={l.code} style={{ backgroundColor: '#0e0e1a' }}>{l.label}</option>)}
                                            </select>
                                            <button
                                                onClick={() => searchSubs(subQuery, subLang)}
                                                className="px-4 py-2 rounded-xl bg-teal/15 border border-teal/25 text-teal text-xs font-bold hover:bg-teal/25 transition-all">
                                                Search
                                            </button>
                                        </div>

                                        {/* Error */}
                                        {subError && <p className="text-xs text-red-400">{subError}</p>}

                                        {/* Loading */}
                                        {subLoading && (
                                            <div className="flex items-center gap-3 py-4">
                                                <div className="w-4 h-4 border-2 border-teal/30 border-t-teal rounded-full animate-spin" />
                                                <span className="text-xs text-text-3">Searching subtitles...</span>
                                            </div>
                                        )}

                                        {/* Results list */}
                                        {!subLoading && subResults.length > 0 && (
                                            <div className="space-y-2 max-h-72 overflow-y-auto pr-1">
                                                {subResults.map(sub => (
                                                    <div key={sub.id}
                                                        className={`flex items-center gap-3 p-3 rounded-xl border text-xs ${sub.exact
                                                            ? 'bg-teal/[0.06] border-teal/20'
                                                            : 'bg-white/[0.02] border-white/[0.05]'}`}>
                                                        <div className="flex-1 min-w-0 space-y-0.5">
                                                            <div className="flex items-center gap-2 flex-wrap">
                                                                {sub.exact && <span className="text-[9px] font-bold bg-teal/20 text-teal px-1.5 py-0.5 rounded-md">⚡ EXACT</span>}
                                                                <span className="text-white font-medium truncate">{sub.name}</span>
                                                                {sub.hearing && <span className="text-[9px] bg-white/[0.06] text-text-3 px-1.5 py-0.5 rounded-md">HI</span>}
                                                            </div>
                                                            <div className="flex items-center gap-3 text-text-3">
                                                                <span>{sub.lang}</span>
                                                                {sub.rating && <span>★ {sub.rating}</span>}
                                                                {sub.downloads && <span>↓ {parseInt(sub.downloads).toLocaleString()}</span>}
                                                                {sub.year && <span>{sub.year}</span>}
                                                            </div>
                                                        </div>
                                                        <button
                                                            onClick={() => downloadSub(sub, res.title)}
                                                            disabled={!!downloadingId || downloadedIds.has(sub.id)}
                                                            className={`shrink-0 px-3 py-1.5 rounded-lg font-bold text-[11px] transition-all ${downloadedIds.has(sub.id)
                                                                ? 'bg-teal/15 text-teal border border-teal/20'
                                                                : downloadingId === sub.id
                                                                    ? 'bg-white/[0.04] text-text-3 cursor-wait'
                                                                    : sub.exact
                                                                        ? 'bg-teal/15 border border-teal/25 text-teal hover:bg-teal/30'
                                                                        : 'bg-white/[0.06] border border-white/[0.08] text-text-2 hover:text-white hover:bg-white/[0.12]'}`}>
                                                            {downloadedIds.has(sub.id) ? '✓ Saved' : downloadingId === sub.id ? '...' : 'Download'}
                                                        </button>
                                                    </div>
                                                ))}
                                            </div>
                                        )}
                                    </div>
                                )}
                            </div>
                        ))}
                    </div>
                </>
            ) : searchQuery && !isSearching && searchedOnce ? (
                <div className="text-center py-20 bg-white/[0.01] rounded-3xl border border-dashed border-white/[0.04]">
                    <div className="text-4xl mb-4 opacity-20">🔍</div>
                    <p className="text-text-3 font-medium">No results found for &quot;{searchQuery}&quot;</p>
                </div>
            ) : (
                <div className="text-center py-32">
                    <div className="text-5xl mb-6 opacity-20 animate-float">☁️</div>
                    <p className="text-text-3 font-medium">Start exploring across all providers</p>
                </div>
            )}
        </div>
    );
}
