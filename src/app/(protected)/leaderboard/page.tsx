"use client";

import { useAuth } from "@/context/AuthContext";
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

function formatRatio(ratio: number) {
    if (!Number.isFinite(ratio) || ratio <= 0) return "0.0000";
    if (ratio < 0.01) return ratio.toFixed(4);
    if (ratio < 0.1) return ratio.toFixed(3);
    return ratio.toFixed(2);
}

export default function LeaderboardPage() {
    const { user } = useAuth();
    const [rows, setRows] = useState<LeaderboardRow[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

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
        return () => {
            cancelled = true;
        };
    }, [user]);

    const topThree = useMemo(() => rows.slice(0, 3), [rows]);
    const totalSeeded = useMemo(() => rows.reduce((sum, row) => sum + row.seeded, 0), [rows]);
    const totalDownloaded = useMemo(() => rows.reduce((sum, row) => sum + row.downloaded, 0), [rows]);
    const avgRatio = useMemo(() => {
        if (!rows.length) return 0;
        return rows.reduce((sum, row) => sum + row.ratio, 0) / rows.length;
    }, [rows]);

    return (
        <div className="w-full max-w-full space-y-6 pb-10 bg-base">
            <header className="cine-card px-6 py-5">
                <h1 className="cine-title text-4xl font-black tracking-tight text-text-1">
                    Leaderboard
                </h1>
                <p className="text-text-3 text-sm mt-1">Top users ranked by total seeded bytes.</p>
            </header>

            {loading ? (
                <div className="cine-card p-8 text-center text-text-2">Loading leaderboard...</div>
            ) : error ? (
                <div className="rounded-2xl border border-danger/30 bg-danger/10 p-8 text-center text-danger">{error}</div>
            ) : (
                <>
                    <section className="grid grid-cols-1 md:grid-cols-3 gap-4">
                        <div className="rounded-2xl border border-white/[0.06] bg-surface p-4">
                            <div className="text-[11px] uppercase tracking-wider text-text-3">Total Seeded</div>
                            <div className="text-2xl font-black text-teal mt-1">{formatBytes(totalSeeded)}</div>
                        </div>
                        <div className="rounded-2xl border border-white/[0.06] bg-surface p-4">
                            <div className="text-[11px] uppercase tracking-wider text-text-3">Total Downloaded</div>
                            <div className="text-2xl font-black text-text-1 mt-1">{formatBytes(totalDownloaded)}</div>
                        </div>
                        <div className="rounded-2xl border border-white/[0.06] bg-surface p-4">
                            <div className="text-[11px] uppercase tracking-wider text-text-3">Avg Ratio</div>
                            <div className={`text-2xl font-black mt-1 ${ratioColor(avgRatio)}`}>{formatRatio(avgRatio)}</div>
                        </div>
                    </section>

                    <section className="grid grid-cols-1 md:grid-cols-3 gap-4">
                        {topThree.map((row, i) => (
                            <div
                                key={row.uid}
                                className={`rounded-2xl border p-5 shadow-cinema ${
                                    i === 0
                                        ? "border-accent/40 bg-elevated ring-1 ring-accent/20"
                                        : "border-white/[0.06] bg-surface"
                                }`}
                            >
                                <div className={`text-xs uppercase tracking-wider mb-2 ${i === 0 ? "text-accent" : "text-text-3"}`}>{i === 0 ? "🥇 Rank #1" : i === 1 ? "🥈 Rank #2" : "🥉 Rank #3"}</div>
                                <div className="text-lg font-bold text-text-1 truncate">{row.displayName}</div>
                                <div className="mt-3 text-sm text-text-2">Seeded: <span className="text-teal font-semibold">{formatBytes(row.seeded)}</span></div>
                                <div className="text-sm text-text-2">Downloaded: <span className="text-text-1 font-semibold">{formatBytes(row.downloaded)}</span></div>
                                <div className="text-sm text-text-2">Ratio: <span className={`font-semibold ${ratioColor(row.ratio)}`}>{formatRatio(row.ratio)}</span></div>
                            </div>
                        ))}
                    </section>

                    <section className="rounded-2xl border border-white/[0.06] bg-surface overflow-hidden shadow-cinema">
                        <div className="overflow-x-auto">
                            <table className="w-full min-w-[720px] text-sm">
                                <thead className="bg-elevated border-b border-white/[0.06] text-text-3">
                                    <tr>
                                        <th className="text-left px-5 py-3 font-medium">Rank</th>
                                        <th className="text-left px-5 py-3 font-medium">User</th>
                                        <th className="text-right px-5 py-3 font-medium">Seeded</th>
                                        <th className="text-right px-5 py-3 font-medium">Downloaded</th>
                                        <th className="text-right px-5 py-3 font-medium">Ratio</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {rows.map((row) => (
                                        <tr key={row.uid} className="border-b border-white/[0.06] last:border-b-0 hover:bg-white/[0.02] transition-colors">
                                            <td className={`px-5 py-3 font-mono ${row.rank === 1 ? "text-accent font-semibold" : "text-text-2"}`}>#{row.rank}</td>
                                            <td className="px-5 py-3 text-text-1 truncate max-w-[280px]">{row.displayName}</td>
                                            <td className="px-5 py-3 text-right text-teal font-semibold">{formatBytes(row.seeded)}</td>
                                            <td className="px-5 py-3 text-right text-text-2">{formatBytes(row.downloaded)}</td>
                                            <td className={`px-5 py-3 text-right font-semibold ${ratioColor(row.ratio)}`}>{formatRatio(row.ratio)}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </section>
                </>
            )}
        </div>
    );
}
