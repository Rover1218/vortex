"use client";

import { useEffect, useState } from "react";
import { type WatchEntry } from "@/lib/watchProgress";

// Reduce a stored title to a clean name for poster lookup.
function cleanTitle(t: string) {
    let s = (t || "").replace(/\.[a-z0-9]{2,4}$/i, "").replace(/\[.*?\]/g, " ").replace(/\(.*?\)/g, " ").replace(/[._]+/g, " ");
    const cut = s.search(/\b((?:19|20)\d{2}|480p|720p|1080p|2160p|4k|uhd|bluray|brrip|bdrip|webrip|web[-. ]?dl|hdtv|dvdrip|x264|x265|h264|h265|hevc)\b/i);
    if (cut > 2) s = s.slice(0, cut);
    return s.replace(/\s{2,}/g, " ").trim();
}
const extractYear = (t: string) => (t || "").match(/\b(?:19|20)\d{2}\b/)?.[0] || "";

// Module-level cache so thumbnails don't refetch across renders / pages.
const posterCache = new Map<string, string | null>();

function Thumb({ title }: { title: string }) {
    const [src, setSrc] = useState<string | null | undefined>(() => posterCache.get(title));

    useEffect(() => {
        if (posterCache.has(title)) { setSrc(posterCache.get(title)); return; }
        let cancelled = false;
        const q = cleanTitle(title) || title;
        const year = extractYear(title);
        fetch(`/api/poster?q=${encodeURIComponent(q)}${year ? `&year=${year}` : ""}`)
            .then(r => (r.ok ? r.json() : { poster: null }))
            .then(d => { const p = d?.poster ?? null; posterCache.set(title, p); if (!cancelled) setSrc(p); })
            .catch(() => { if (!cancelled) setSrc(null); });
        return () => { cancelled = true; };
    }, [title]);

    return (
        <div className="relative w-12 shrink-0 aspect-[2/3] overflow-hidden rounded-lg border border-white/[0.08] bg-elevated">
            {src ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={src} alt="" className="h-full w-full object-cover" loading="lazy" />
            ) : (
                <div className="flex h-full w-full items-center justify-center text-text-3/60">
                    <svg className="h-4 w-4" viewBox="0 0 24 24" fill="currentColor"><path d="M7 5l12 7-12 7V5z" /></svg>
                </div>
            )}
            {/* Play overlay on hover */}
            <div className="absolute inset-0 flex items-center justify-center bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity">
                <span className="flex h-6 w-6 items-center justify-center rounded-full bg-accent text-black">
                    <svg className="h-3 w-3" viewBox="0 0 24 24" fill="currentColor"><path d="M7 5l12 7-12 7V5z" /></svg>
                </span>
            </div>
        </div>
    );
}

export default function ContinueWatching({
    entries, onPlay, onRemove,
}: {
    entries: WatchEntry[];
    onPlay: (e: WatchEntry) => void;
    onRemove: (e: WatchEntry) => void;
}) {
    if (entries.length === 0) return null;

    return (
        <div className="cine-card p-4">
            <div className="flex items-center gap-2 mb-3">
                <svg className="w-4 h-4 text-accent" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></svg>
                <h2 className="text-sm font-bold text-text-1">Continue Watching</h2>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {entries.slice(0, 6).map((e) => {
                    const pct = e.dur > 0 ? Math.min(100, Math.round((e.t / e.dur) * 100)) : 0;
                    return (
                        <div
                            key={`${e.infoHash}:${e.fileIdx}`}
                            onClick={() => onPlay(e)}
                            className="group relative flex gap-3 rounded-xl border border-white/[0.06] bg-white/[0.02] p-2.5 transition-all hover:border-accent/30 hover:bg-white/[0.05] cursor-pointer"
                        >
                            <Thumb title={e.title} />
                            <div className="min-w-0 flex-1 pr-5">
                                <div className="truncate text-[12px] font-semibold text-text-1 group-hover:text-accent transition-colors">{e.title}</div>
                                <div className="truncate text-[10px] text-text-3 mt-0.5">{e.name}</div>
                                <div className="mt-2 h-1 overflow-hidden rounded-full bg-white/[0.06]">
                                    <div className="h-full rounded-full bg-accent" style={{ width: `${pct}%` }} />
                                </div>
                                <div className="mt-1 font-mono text-[10px] text-text-3">{pct}% watched · resume</div>
                            </div>
                            <button
                                onClick={(ev) => { ev.stopPropagation(); onRemove(e); }}
                                title="Remove from Continue Watching"
                                className="absolute top-2 right-2 flex h-6 w-6 items-center justify-center rounded-md text-text-3 opacity-0 transition-all hover:bg-white/[0.1] hover:text-text-1 group-hover:opacity-100"
                            >
                                <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M6 6l12 12M18 6 6 18" /></svg>
                            </button>
                        </div>
                    );
                })}
            </div>
        </div>
    );
}
