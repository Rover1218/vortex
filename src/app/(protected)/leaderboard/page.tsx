"use client";

import { useAuth } from "@/context/AuthContext";
import { usePremium } from "@/context/PremiumContext";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

type LeaderboardRow = {
    rank: number;
    uid: string;
    displayName: string;
    downloaded: number;
    seeded: number;
    ratio: number;
};

function formatBytes(bytes: number) {
    if (!bytes || bytes <= 0) return "0 B";
    const k = 1024;
    const units = ["B", "KB", "MB", "GB", "TB"];
    const i = Math.min(Math.floor(Math.log(bytes) / Math.log(k)), units.length - 1);
    return `${(bytes / Math.pow(k, i)).toFixed(1)} ${units[i]}`;
}

function ratioColor(ratio: number) {
    if (ratio >= 1) return "text-teal";
    if (ratio >= 0.5) return "text-warning";
    return "text-danger";
}

function ratioChip(ratio: number) {
    if (ratio >= 1) return "bg-teal/12 text-teal border-teal/25";
    if (ratio >= 0.5) return "bg-warning/12 text-warning border-warning/25";
    return "bg-danger/12 text-danger border-danger/25";
}

function formatRatio(ratio: number) {
    if (!Number.isFinite(ratio) || ratio <= 0) return "0.0000";
    if (ratio < 0.01) return ratio.toFixed(4);
    if (ratio < 0.1) return ratio.toFixed(3);
    return ratio.toFixed(2);
}

function initials(name: string) {
    const parts = (name || "?").trim().split(/\s+/).filter(Boolean);
    if (parts.length === 0) return "?";
    if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

// Deterministic accent color for an avatar, derived from the name.
const AVATAR_TONES = [
    "from-accent/30 to-accent/5 text-accent",
    "from-teal/30 to-teal/5 text-teal",
    "from-warning/30 to-warning/5 text-warning",
    "from-danger/30 to-danger/5 text-danger",
    "from-white/20 to-white/5 text-text-1",
];
function avatarTone(seed: string) {
    let h = 0;
    for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
    return AVATAR_TONES[h % AVATAR_TONES.length];
}

const PODIUM = {
    1: { ring: "ring-accent/50", glow: "shadow-accent-glow", bar: "from-accent/80 to-accent/30", pedestal: "h-28", label: "text-accent", medal: "🥇", size: "w-20 h-20 text-2xl" },
    2: { ring: "ring-white/30", glow: "", bar: "from-white/40 to-white/10", pedestal: "h-20", label: "text-text-2", medal: "🥈", size: "w-16 h-16 text-xl" },
    3: { ring: "ring-warning/40", glow: "", bar: "from-warning/50 to-warning/15", pedestal: "h-14", label: "text-warning", medal: "🥉", size: "w-16 h-16 text-xl" },
} as const;

export default function LeaderboardPage() {
    const { user } = useAuth();
    const { isAdmin, loading: premiumLoading } = usePremium();
    const router = useRouter();
    const [rows, setRows] = useState<LeaderboardRow[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    // Admin-only page: it aggregates stats across every user's account.
    useEffect(() => {
        if (!premiumLoading && !isAdmin) router.replace("/search");
    }, [premiumLoading, isAdmin, router]);

    useEffect(() => {
        let cancelled = false;
        async function load() {
            if (!user) return;
            setLoading(true);
            setError(null);
            try {
                const token = await user.getIdToken();
                const res = await fetch("/api/leaderboard?limit=30", {
                    headers: { Authorization: `Bearer ${token}` },
                    cache: "no-store",
                });
                const data = await res.json();
                if (!res.ok) throw new Error(data?.error || "Failed to load leaderboard");
                if (!cancelled) setRows(Array.isArray(data.rows) ? data.rows : []);
            } catch (e: any) {
                if (!cancelled) setError(e?.message || "Failed to load leaderboard");
            } finally {
                if (!cancelled) setLoading(false);
            }
        }
        load();
        return () => { cancelled = true; };
    }, [user]);

    const topThree = useMemo(() => rows.slice(0, 3), [rows]);
    const rest = useMemo(() => rows.slice(3), [rows]);
    const totalSeeded = useMemo(() => rows.reduce((s, r) => s + r.seeded, 0), [rows]);
    const totalDownloaded = useMemo(() => rows.reduce((s, r) => s + r.downloaded, 0), [rows]);
    const avgRatio = useMemo(() => (rows.length ? rows.reduce((s, r) => s + r.ratio, 0) / rows.length : 0), [rows]);
    const maxSeeded = useMemo(() => Math.max(1, ...rows.map(r => r.seeded)), [rows]);
    const myRow = useMemo(() => rows.find(r => r.uid === user?.uid) || null, [rows, user]);

    // Podium display order: #2, #1, #3
    const podiumOrder = useMemo(() => {
        const [a, b, c] = topThree;
        return [b, a, c].filter(Boolean) as LeaderboardRow[];
    }, [topThree]);

    if (premiumLoading || !isAdmin) return null;

    return (
        <div className="w-full max-w-full space-y-6 pb-12 relative isolate">
            {/* Ambient glow */}
            <div className="pointer-events-none absolute -top-24 left-1/2 -translate-x-1/2 h-72 w-[60%] rounded-full bg-accent/10 blur-[120px]" aria-hidden />

            {/* Hero */}
            <header className="relative z-10 cine-card overflow-hidden p-6 sm:p-8">
                <div className="flex flex-wrap items-center justify-between gap-4">
                    <div className="flex items-center gap-4">
                        <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-accent/12 text-accent ring-1 ring-accent/25">
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" className="h-7 w-7"><path d="M8 21h8M12 17v4M7 4h10v4a5 5 0 0 1-10 0V4Z" /><path d="M17 5h3v2a3 3 0 0 1-3 3M7 5H4v2a3 3 0 0 0 3 3" /></svg>
                        </div>
                        <div>
                            <h1 className="cine-title text-3xl sm:text-4xl font-black tracking-tight text-text-1">Leaderboard</h1>
                            <p className="text-text-3 text-sm mt-1">Top seeders keeping the swarm alive — ranked by total bytes shared.</p>
                        </div>
                    </div>
                    {myRow && (
                        <div className="rounded-2xl border border-accent/25 bg-accent/[0.07] px-4 py-3 text-right">
                            <div className="text-[10px] font-bold uppercase tracking-[0.18em] text-accent">Your rank</div>
                            <div className="text-2xl font-black text-text-1">#{myRow.rank}</div>
                            <div className="text-[11px] text-text-3">{formatBytes(myRow.seeded)} seeded</div>
                        </div>
                    )}
                </div>
            </header>

            {loading ? (
                <div className="cine-card p-12 text-center text-text-2">
                    <div className="mx-auto mb-3 h-9 w-9 animate-spin rounded-full border-2 border-accent/30 border-t-accent" />
                    Loading leaderboard…
                </div>
            ) : error ? (
                <div className="rounded-2xl border border-danger/30 bg-danger/10 p-8 text-center text-danger">{error}</div>
            ) : rows.length === 0 ? (
                <div className="cine-card p-12 text-center text-text-3">No seeders ranked yet — start seeding to claim the top spot.</div>
            ) : (
                <>
                    {/* Stat cards */}
                    <section className="relative z-10 grid grid-cols-1 sm:grid-cols-3 gap-4">
                        {[
                            { label: "Total Seeded", value: formatBytes(totalSeeded), tone: "text-teal", icon: <path d="M12 3v12M7 8l5-5 5 5M5 21h14" /> },
                            { label: "Total Downloaded", value: formatBytes(totalDownloaded), tone: "text-text-1", icon: <path d="M12 21V9M7 16l5 5 5-5M5 3h14" /> },
                            { label: "Average Ratio", value: formatRatio(avgRatio), tone: ratioColor(avgRatio), icon: <path d="M3 12a9 9 0 1 0 18 0 9 9 0 0 0-18 0ZM12 7v5l3 2" /> },
                        ].map(s => (
                            <div key={s.label} className="cine-card flex items-center gap-4 p-5">
                                <div className={`flex h-11 w-11 items-center justify-center rounded-xl bg-white/[0.04] border border-white/[0.06] ${s.tone}`}>
                                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5">{s.icon}</svg>
                                </div>
                                <div>
                                    <div className="text-[10px] font-bold uppercase tracking-[0.18em] text-text-3">{s.label}</div>
                                    <div className={`text-2xl font-black mt-0.5 ${s.tone}`}>{s.value}</div>
                                </div>
                            </div>
                        ))}
                    </section>

                    {/* Podium */}
                    {topThree.length > 0 && (
                        <section className="relative z-10 cine-card p-6 sm:p-8">
                            <div className="grid grid-cols-3 gap-3 sm:gap-5 items-end">
                                {podiumOrder.map(row => {
                                    const p = PODIUM[row.rank as 1 | 2 | 3] ?? PODIUM[3];
                                    const isMe = row.uid === user?.uid;
                                    return (
                                        <div key={row.uid} className="flex flex-col items-center">
                                            {row.rank === 1 && (
                                                <svg viewBox="0 0 24 24" fill="currentColor" className="mb-1 h-6 w-6 text-accent drop-shadow"><path d="M3 7l4 4 5-7 5 7 4-4v11H3V7Z" /></svg>
                                            )}
                                            <div className={`relative rounded-full bg-gradient-to-b ${avatarTone(row.uid)} ${p.size} flex items-center justify-center font-black ring-2 ${p.ring} ${p.glow}`}>
                                                {initials(row.displayName)}
                                                <span className="absolute -bottom-1 -right-1 text-lg">{p.medal}</span>
                                            </div>
                                            <div className="mt-3 max-w-full truncate text-center text-sm font-bold text-text-1" title={row.displayName}>
                                                {row.displayName}
                                                {isMe && <span className="ml-1 rounded bg-accent/20 px-1.5 py-0.5 text-[9px] font-black text-accent align-middle">YOU</span>}
                                            </div>
                                            <div className="text-center text-xs text-teal font-semibold">{formatBytes(row.seeded)}</div>
                                            <div className={`mt-1 rounded-full border px-2 py-0.5 text-[10px] font-bold ${ratioChip(row.ratio)}`}>×{formatRatio(row.ratio)}</div>
                                            {/* Pedestal */}
                                            <div className={`mt-3 w-full rounded-t-xl bg-gradient-to-b ${p.bar} ${p.pedestal} flex items-start justify-center pt-2`}>
                                                <span className={`text-2xl font-black ${p.label}`}>{row.rank}</span>
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        </section>
                    )}

                    {/* Full standings */}
                    {rest.length > 0 && (
                        <section className="relative z-10 cine-card overflow-hidden">
                            <div className="flex items-center justify-between px-5 py-4 border-b border-white/[0.06]">
                                <h2 className="text-sm font-black uppercase tracking-[0.18em] text-text-2">Full standings</h2>
                                <span className="text-[11px] text-text-3">{rows.length} ranked</span>
                            </div>
                            <div className="divide-y divide-white/[0.05]">
                                {rest.map(row => {
                                    const isMe = row.uid === user?.uid;
                                    return (
                                        <div key={row.uid} className={`flex items-center gap-4 px-5 py-3.5 transition-colors ${isMe ? "bg-accent/[0.07]" : "hover:bg-white/[0.02]"}`}>
                                            <div className="w-8 shrink-0 text-center font-mono text-sm font-bold text-text-3">{row.rank}</div>
                                            <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-gradient-to-b ${avatarTone(row.uid)} text-xs font-black ring-1 ring-white/10`}>
                                                {initials(row.displayName)}
                                            </div>
                                            <div className="min-w-0 flex-1">
                                                <div className="flex items-center gap-2">
                                                    <span className="truncate text-sm font-semibold text-text-1">{row.displayName}</span>
                                                    {isMe && <span className="rounded bg-accent/20 px-1.5 py-0.5 text-[9px] font-black text-accent shrink-0">YOU</span>}
                                                </div>
                                                {/* Seeded bar relative to the top seeder */}
                                                <div className="mt-1.5 h-1.5 w-full max-w-[260px] overflow-hidden rounded-full bg-white/[0.05]">
                                                    <div className="h-full rounded-full bg-gradient-to-r from-teal to-teal/40" style={{ width: `${Math.max(3, (row.seeded / maxSeeded) * 100)}%` }} />
                                                </div>
                                            </div>
                                            <div className="hidden sm:block w-28 shrink-0 text-right">
                                                <div className="text-sm font-bold text-teal">{formatBytes(row.seeded)}</div>
                                                <div className="text-[10px] text-text-3">{formatBytes(row.downloaded)} down</div>
                                            </div>
                                            <div className={`shrink-0 rounded-full border px-2.5 py-1 text-xs font-bold ${ratioChip(row.ratio)}`}>×{formatRatio(row.ratio)}</div>
                                        </div>
                                    );
                                })}
                            </div>
                        </section>
                    )}
                </>
            )}
        </div>
    );
}
