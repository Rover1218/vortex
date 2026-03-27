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
    return "text-red-400";
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
        <div className="max-w-6xl mx-auto space-y-6 pb-10 relative">
            <div className="pointer-events-none absolute -top-10 right-[-8%] h-56 w-56 rounded-full bg-accent/10 blur-2xl" />
            <header className="relative rounded-3xl border border-white/[0.08] bg-gradient-to-br from-white/[0.05] to-white/[0.015] px-6 py-5 overflow-hidden">
                <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(124,106,255,0.12),transparent_55%)]" />
                <h1 className="text-4xl font-black tracking-tight bg-gradient-to-r from-white to-text-2 bg-clip-text text-transparent">
                    Leaderboard
                </h1>
                <p className="text-text-3 text-sm mt-1">Top users ranked by total seeded bytes.</p>
            </header>

            {loading ? (
                <div className="rounded-2xl border border-white/[0.08] bg-white/[0.03] p-8 text-center text-text-2">Loading leaderboard...</div>
            ) : error ? (
                <div className="rounded-2xl border border-red-500/20 bg-red-500/10 p-8 text-center text-red-300">{error}</div>
            ) : (
                <>
                    <section className="grid grid-cols-1 md:grid-cols-3 gap-4">
                        <div className="rounded-2xl border border-white/[0.08] bg-gradient-to-br from-white/[0.05] to-white/[0.015] p-4">
                            <div className="text-[11px] uppercase tracking-wider text-text-3">Total Seeded</div>
                            <div className="text-2xl font-black text-teal mt-1">{formatBytes(totalSeeded)}</div>
                        </div>
                        <div className="rounded-2xl border border-white/[0.08] bg-gradient-to-br from-white/[0.05] to-white/[0.015] p-4">
                            <div className="text-[11px] uppercase tracking-wider text-text-3">Total Downloaded</div>
                            <div className="text-2xl font-black text-white mt-1">{formatBytes(totalDownloaded)}</div>
                        </div>
                        <div className="rounded-2xl border border-white/[0.08] bg-gradient-to-br from-white/[0.05] to-white/[0.015] p-4">
                            <div className="text-[11px] uppercase tracking-wider text-text-3">Avg Ratio</div>
                            <div className={`text-2xl font-black mt-1 ${ratioColor(avgRatio)}`}>{formatRatio(avgRatio)}</div>
                        </div>
                    </section>

                    <section className="grid grid-cols-1 md:grid-cols-3 gap-4">
                        {topThree.map((row, i) => (
                            <div key={row.uid} className="rounded-2xl border border-white/[0.08] bg-gradient-to-br from-white/[0.06] to-white/[0.015] p-5 shadow-[0_14px_34px_-24px_rgba(109,98,255,0.65)]">
                                <div className="text-xs uppercase tracking-wider text-text-3 mb-2">{i === 0 ? "🥇 Rank #1" : i === 1 ? "🥈 Rank #2" : "🥉 Rank #3"}</div>
                                <div className="text-lg font-bold text-white truncate">{row.displayName}</div>
                                <div className="mt-3 text-sm text-text-2">Seeded: <span className="text-teal font-semibold">{formatBytes(row.seeded)}</span></div>
                                <div className="text-sm text-text-2">Downloaded: <span className="text-white font-semibold">{formatBytes(row.downloaded)}</span></div>
                                <div className="text-sm text-text-2">Ratio: <span className={`font-semibold ${ratioColor(row.ratio)}`}>{formatRatio(row.ratio)}</span></div>
                            </div>
                        ))}
                    </section>

                    <section className="rounded-2xl border border-white/[0.08] bg-gradient-to-br from-white/[0.05] to-white/[0.015] overflow-hidden">
                        <div className="overflow-x-auto">
                            <table className="w-full min-w-[720px] text-sm">
                                <thead className="bg-white/[0.03] border-b border-white/[0.06] text-text-3">
                                    <tr>
                                        <th className="text-left px-5 py-3">Rank</th>
                                        <th className="text-left px-5 py-3">User</th>
                                        <th className="text-right px-5 py-3">Seeded</th>
                                        <th className="text-right px-5 py-3">Downloaded</th>
                                        <th className="text-right px-5 py-3">Ratio</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {rows.map((row) => (
                                        <tr key={row.uid} className="border-b border-white/[0.05] last:border-b-0 hover:bg-white/[0.02]">
                                            <td className="px-5 py-3 font-mono text-white">#{row.rank}</td>
                                            <td className="px-5 py-3 text-white truncate max-w-[280px]">{row.displayName}</td>
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
