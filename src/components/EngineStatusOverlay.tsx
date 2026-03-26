"use client";

import { useTorrents } from "@/context/TorrentContext";
import { useEffect, useState } from "react";

export default function EngineStatusOverlay() {
    const { isEngineConnected } = useTorrents();
    const [mounted, setMounted] = useState(false);

    useEffect(() => {
        setMounted(true);
    }, []);

    if (!mounted) return null;
    if (isEngineConnected) return null;

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xl">
            <div className="max-w-md w-full bg-surface border border-white/[0.1] rounded-3xl p-8 shadow-2xl relative overflow-hidden">
                <div className="absolute inset-0 bg-gradient-to-br from-red-500/10 via-transparent to-accent/10 pointer-events-none" />
                
                <div className="w-16 h-16 rounded-2xl bg-red-500/10 border border-red-500/20 flex items-center justify-center text-red-500 mb-6 relative">
                    <span className="absolute -top-1 -right-1 flex h-3 w-3">
                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span>
                        <span className="relative inline-flex rounded-full h-3 w-3 bg-red-500"></span>
                    </span>
                    <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                    </svg>
                </div>

                <h2 className="text-2xl font-black text-white mb-2 tracking-tight">Vortex Engine Offline</h2>
                <p className="text-text-2 mb-8 text-sm leading-relaxed">
                    The background torrent engine is not running or unreachable. You need the standalone engine to safely search, download, and manage your torrents.
                </p>

                <div className="space-y-4">
                    <div className="p-4 rounded-2xl bg-white/[0.03] border border-white/[0.05]">
                        <h3 className="text-xs font-bold text-white uppercase tracking-wider mb-2">Instructions</h3>
                        <ol className="text-sm text-text-3 space-y-2 list-decimal list-inside marker:text-accent">
                            <li>Download the Vortex Engine EXE below.</li>
                            <li>Run the <span className="font-mono text-accent/80">vortex.exe</span> file on your computer.</li>
                            <li>It will automatically sync with this dashboard.</li>
                        </ol>
                    </div>

                    <a
                        href="https://github.com/Rover1218/vortex/releases/tag/Vortex"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center justify-center gap-2 w-full py-4 text-sm font-bold rounded-xl bg-gradient-to-r from-accent to-teal text-white shadow-xl shadow-accent/20 hover:shadow-accent/40 transition-all duration-300 hover:scale-[1.02] active:scale-[0.98]"
                    >
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                            <polyline points="7 10 12 15 17 10" />
                            <line x1="12" y1="15" x2="12" y2="3" />
                        </svg>
                        Download Engine (v0.1.0)
                    </a>
                </div>
            </div>
        </div>
    );
}
