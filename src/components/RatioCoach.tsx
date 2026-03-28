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

    const health = useMemo(() => {
        if (ratio >= 1) return { label: "Excellent", color: "from-teal to-green-500", bg: "bg-teal/20", text: "text-teal", border: "border-teal/40" };
        if (ratio >= 0.5) return { label: "Good", color: "from-amber-500 to-yellow-400", bg: "bg-amber-500/20", text: "text-amber-500", border: "border-amber-500/40" };
        return { label: "Low", color: "from-red-500 to-rose-500", bg: "bg-red-500/20", text: "text-red-500", border: "border-red-500/40" };
    }, [ratio]);

    // Top 3 torrents by upload speed that are ACTIVELY seeding, or if none, suggest top completed torrents
    const topSeeders = useMemo(() => {
        const activeSeeding = torrents
            .filter(t => (t.status === "Seeding" || t.status === "Completed") && (t.uploadSpeed || 0) > 0)
            .sort((a, b) => (b.uploadSpeed || 0) - (a.uploadSpeed || 0));

        if (activeSeeding.length > 0) return activeSeeding.slice(0, 3);

        // If no active seeding, suggest largest completed torrents instead
        return torrents
            .filter(t => t.status === "Completed" || t.status === "Seeding")
            .sort((a, b) => (b.totalLength || 0) - (a.totalLength || 0))
            .slice(0, 3);
    }, [torrents]);

    const getMessage = () => {
        if (ratio >= 1) return "You're a community hero! Keep seeding to help others.";
        if (ratio >= 0.5) return `Your ratio is healthy at ${formatRatio(ratio)}. Keep seeding stronger content.`;
        return `Your ratio is ${formatRatio(ratio)} (low). Seed these torrents for quick wins:`;
    };

    return (
        <div className={`rounded-2xl ${health.bg} border ${health.border} px-5 py-4 space-y-4 backdrop-blur-sm`}>
            {/* Header with ratio */}
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                    <div className={`w-12 h-12 rounded-xl bg-gradient-to-br ${health.color} flex items-center justify-center font-black text-white text-lg`}>
                        {ratio >= 1 ? "✓" : ratio >= 0.5 ? "⚡" : "↑"}
                    </div>
                    <div>
                        <p className="text-xs text-text-3 font-medium uppercase tracking-wider">Ratio Health</p>
                        <p className={`text-2xl font-black ${health.text}`}>{formatRatio(ratio)}</p>
                    </div>
                </div>
                <div className={`px-3 py-1 rounded-lg ${health.bg} border ${health.border} font-medium text-sm ${health.text}`}>
                    {health.label}
                </div>
            </div>

            {/* Message */}
            <p className="text-sm text-text-2 leading-relaxed">{getMessage()}</p>

            {/* Top seeding torrents */}
            {topSeeders.length > 0 && ratio < 1 && (
                <div className="space-y-2">
                    <p className="text-xs text-text-3 font-medium uppercase tracking-wider">
                        {topSeeders.some(t => (t.uploadSpeed || 0) > 0) ? "Top Contributors" : "Start Seeding"}
                    </p>
                    <div className="space-y-2">
                        {topSeeders.map((torrent, i) => {
                            const hasUpload = (torrent.uploadSpeed || 0) > 0;
                            return (
                                <div key={torrent.infoHash} className="flex items-center justify-between p-2 rounded-lg bg-white/[0.05] border border-white/[0.08] hover:bg-white/[0.08] transition-colors">
                                    <div className="flex items-center gap-2 min-w-0 flex-1">
                                        <span className="text-xs font-black text-accent-primary">{i + 1}</span>
                                        <span className="text-sm text-text-1 truncate font-medium">{torrent.name}</span>
                                    </div>
                                    <span className={`text-xs ml-2 shrink-0 ${hasUpload ? 'text-accent-secondary' : 'text-text-3'}`}>
                                        {hasUpload ? formatSpeed(torrent.uploadSpeed || 0) + ' ↑' : formatSize(torrent.totalLength || 0)}
                                    </span>
                                </div>
                            );
                        })}
                    </div>
                </div>
            )}

            {/* Seeding summary */}
            {torrents.length > 0 && (
                <div className="pt-2 border-t border-white/[0.08] text-xs text-text-3 space-y-1">
                    <p>📊 <span className="text-teal">{torrents.filter(t => (t.status === "Seeding" || t.status === "Completed") && (t.uploadSpeed || 0) > 0).length}</span> torrents actively seeding</p>
                    <p>💾 <span className="text-accent-primary">{formatSize(lifetimeSeeded)}</span> total seeded lifetime</p>
                </div>
            )}
        </div>
    );
}

export default memo(RatioCoach);
