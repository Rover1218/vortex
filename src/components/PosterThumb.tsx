"use client";

import { useEffect, useState } from "react";

// Small poster thumbnail for list rows (downloads, etc.). Fetches via the cached
// /api/poster route and falls back to a film icon when no art is found.
function cleanTitle(t: string) {
    let s = (t || "").replace(/\.[a-z0-9]{2,4}$/i, "").replace(/\[.*?\]/g, " ").replace(/\(.*?\)/g, " ").replace(/[._]+/g, " ");
    const cut = s.search(/\b((?:19|20)\d{2}|480p|720p|1080p|2160p|4k|uhd|bluray|brrip|bdrip|webrip|web[-. ]?dl|hdtv|dvdrip|x264|x265|h264|h265|hevc)\b/i);
    if (cut > 2) s = s.slice(0, cut);
    return s.replace(/\s{2,}/g, " ").trim();
}
const extractYear = (t: string) => (t || "").match(/\b(?:19|20)\d{2}\b/)?.[0] || "";

const posterCache = new Map<string, string | null>();

export default function PosterThumb({ title, className = "w-12 aspect-[2/3]" }: { title: string; className?: string }) {
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
        <div className={`shrink-0 overflow-hidden rounded-lg border border-white/[0.08] bg-elevated ${className}`}>
            {src ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={src} alt="" className="h-full w-full object-cover" loading="lazy" />
            ) : (
                <div className="flex h-full w-full items-center justify-center text-text-3/50">
                    <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="5" width="18" height="14" rx="2" /><path d="M10 9l5 3-5 3V9Z" /></svg>
                </div>
            )}
        </div>
    );
}
