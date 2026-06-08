"use client";

import { useTorrents } from "@/context/TorrentContext";
import { useMemo, memo } from "react";

function formatRatio(ratio: number): string {
    if (!Number.isFinite(ratio) || ratio <= 0) return "0.0000";
    if (ratio < 0.01) return ratio.toFixed(4);
    if (ratio < 0.1) return ratio.toFixed(3);
    return ratio.toFixed(2);
}

function formatSize(bytes: number) {
    if (!bytes || bytes <= 0) return "0 B";
    const k = 1024, sizes = ["B", "KB", "MB", "GB", "TB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + " " + sizes[i];
}

function formatSpeed(bytes: number) {
    if (!bytes || bytes <= 0) return "0 B/s";
    const k = 1024, sizes = ["B/s", "KB/s", "MB/s", "GB/s"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + " " + sizes[i];
}

function RatioCoach() {
    const { torrents, lifetimeDownloaded, lifetimeSeeded } = useTorrents();

    const ratio = useMemo(() => {
        if (!lifetimeDownloaded || lifetimeDownloaded === 0) return 0;
        return lifetimeSeeded / lifetimeDownloaded;
    }, [lifetimeDownloaded, lifetimeSeeded]);

    // Use the app's design tokens (teal / warning / danger) instead of a heavy
    // full-color background — a neutral card with a colored accent strip + icon.
    const health = useMemo(() => {
        if (ratio >= 1) return { label: "Excellent", text: "text-teal", chip: "bg-teal/12 text-teal border-teal/25", bar: "bg-teal", glow: "bg-teal/10", icon: "✓" };
        if (ratio >= 0.5) return { label: "Good", text: "text-warning", chip: "bg-warning/12 text-warning border-warning/25", bar: "bg-warning", glow: "bg-warning/10", icon: "⚡" };
        return { label: "Low", text: "text-danger", chip: "bg-danger/12 text-danger border-danger/25", bar: "bg-danger", glow: "bg-danger/10", icon: "↑" };
    }, [ratio]);

    const topSeeders = useMemo(() => {
        const activeSeeding = torrents
            .filter(t => (t.status === "Seeding" || t.status === "Completed") && (t.uploadSpeed || 0) > 0)
            .sort((a, b) => (b.uploadSpeed || 0) - (a.uploadSpeed || 0));
        if (activeSeeding.length > 0) return activeSeeding.slice(0, 3);
        return torrents
            .filter(t => t.status === "Completed" || t.status === "Seeding")
            .sort((a, b) => (b.totalLength || 0) - (a.totalLength || 0))
            .slice(0, 3);
    }, [torrents]);

    const activeSeedingCount = torrents.filter(t => (t.status === "Seeding" || t.status === "Completed") && (t.uploadSpeed || 0) > 0).length;

    const message = ratio >= 1
        ? "You're a community hero — keep seeding to help others."
        : ratio >= 0.5
            ? `Your ratio is healthy at ${formatRatio(ratio)}. Keep seeding stronger content.`
            : `Your ratio is ${formatRatio(ratio)} (low). Seed these for quick wins:`;

    // Progress toward a healthy ratio of 1.0 (capped visual).
    const progressPct = Math.min(100, Math.round(ratio * 100));

    return (
        <div className="relative overflow-hidden cine-card shadow-cinema">
            {/* Health accent strip */}
            <div className="h-[3px] w-full bg-white/[0.06]">
                <div className={`h-full ${health.bar} transition-all duration-700`} style={{ width: `${Math.max(4, progressPct)}%` }} />
            </div>
            {/* Soft glow keyed to health */}
            <div className={`pointer-events-none absolute -top-16 -right-10 h-40 w-40 rounded-full ${health.glow} blur-3xl`} aria-hidden />

            <div className="relative p-5 space-y-4">
                {/* Header */}
                <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-3.5">
                        <div className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-xl border text-xl font-black ${health.chip}`}>
                            {health.icon}
                        </div>
                        <div>
                            <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-text-3">Ratio Health</p>
                            <p className={`text-2xl font-black ${health.text}`}>{formatRatio(ratio)}</p>
                        </div>
                    </div>
                    <span className={`rounded-full border px-3 py-1 text-xs font-bold ${health.chip}`}>{health.label}</span>
                </div>

                {/* Message */}
                <p className="text-sm text-text-2 leading-relaxed">{message}</p>

                {/* Seed suggestions */}
                {topSeeders.length > 0 && ratio < 1 && (
                    <div className="space-y-2">
                        <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-text-3">
                            {topSeeders.some(t => (t.uploadSpeed || 0) > 0) ? "Top contributors" : "Start seeding"}
                        </p>
                        <div className="space-y-1.5">
                            {topSeeders.map((torrent, i) => {
                                const hasUpload = (torrent.uploadSpeed || 0) > 0;
                                return (
                                    <div key={torrent.infoHash} className="flex items-center justify-between gap-3 rounded-xl border border-white/[0.06] bg-white/[0.02] px-3 py-2.5 transition-colors hover:bg-white/[0.04]">
                                        <div className="flex min-w-0 flex-1 items-center gap-2.5">
                                            <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-md bg-white/[0.06] text-[10px] font-black text-text-3">{i + 1}</span>
                                            <span className="truncate text-sm font-medium text-text-1">{torrent.name}</span>
                                        </div>
                                        <span className={`shrink-0 font-mono text-xs ${hasUpload ? "text-teal" : "text-text-3"}`}>
                                            {hasUpload ? formatSpeed(torrent.uploadSpeed || 0) + " ↑" : formatSize(torrent.totalLength || 0)}
                                        </span>
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                )}

                {/* Summary footer */}
                {torrents.length > 0 && (
                    <div className="flex flex-wrap gap-x-5 gap-y-1.5 border-t border-white/[0.06] pt-3 text-xs text-text-3">
                        <span className="inline-flex items-center gap-1.5">
                            <svg className="h-3.5 w-3.5 text-teal" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M12 3v12M8 7l4-4 4 4M5 21h14" /></svg>
                            <span className="font-bold text-teal">{activeSeedingCount}</span> actively seeding
                        </span>
                        <span className="inline-flex items-center gap-1.5">
                            <svg className="h-3.5 w-3.5 text-accent" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2Z" /><path d="M17 21v-8H7v8M7 3v5h8" /></svg>
                            <span className="font-bold text-accent">{formatSize(lifetimeSeeded)}</span> seeded lifetime
                        </span>
                    </div>
                )}
            </div>
        </div>
    );
}

export default memo(RatioCoach);
