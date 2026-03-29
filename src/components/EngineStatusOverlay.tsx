"use client";

import { useTorrents } from "@/context/TorrentContext";
import { useEffect, useState } from "react";
import { LATEST_ENGINE_VERSION } from "@/constants/version";

export default function EngineStatusOverlay() {
    const { isEngineConnected, engineVersion } = useTorrents();
    const [mounted, setMounted] = useState(false);
    const [detectedOutdatedVersion, setDetectedOutdatedVersion] = useState(false);

    useEffect(() => {
        setMounted(true);
    }, []);

    // Track if we've ever detected an outdated version to prevent modal flickering
    useEffect(() => {
        if (isEngineConnected && engineVersion) {
            // Only mark as outdated if we have a version AND it doesn't match
            if (engineVersion !== LATEST_ENGINE_VERSION) {
                setDetectedOutdatedVersion(true);
            } else {
                // If version matches, clear the outdated flag
                setDetectedOutdatedVersion(false);
            }
        }
        // If version is null but connected, don't set outdated yet - wait for version
    }, [isEngineConnected, engineVersion]);

    if (!mounted) return null;

    // Determine which modal to show - prioritize outdated version
    const shouldShowOutdatedModal = detectedOutdatedVersion;
    const shouldShowOfflineModal = !isEngineConnected && !detectedOutdatedVersion;

    if (!shouldShowOutdatedModal && !shouldShowOfflineModal) return null;

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xl">
            <div className="max-w-md w-full bg-surface border border-white/[0.1] rounded-3xl p-8 shadow-2xl relative overflow-hidden">
                <div className={`absolute inset-0 bg-gradient-to-br ${shouldShowOutdatedModal ? 'from-amber-500/10' : 'from-red-500/10'} via-transparent to-accent/10 pointer-events-none`} />

                <div className={`w-16 h-16 rounded-2xl ${shouldShowOutdatedModal ? 'bg-amber-500/10 border-amber-500/20 text-amber-500' : 'bg-red-500/10 border-red-500/20 text-red-500'} border flex items-center justify-center mb-6 relative`}>
                    <span className="absolute -top-1 -right-1 flex h-3 w-3">
                        <span className={`animate-ping absolute inline-flex h-full w-full rounded-full ${shouldShowOutdatedModal ? 'bg-amber-400' : 'bg-red-400'} opacity-75`}></span>
                        <span className={`relative inline-flex rounded-full h-3 w-3 ${shouldShowOutdatedModal ? 'bg-amber-500' : 'bg-red-500'}`}></span>
                    </span>
                    {shouldShowOutdatedModal ? (
                        <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                            <polyline points="7 10 12 15 17 10" />
                            <line x1="12" y1="15" x2="12" y2="3" />
                        </svg>
                    ) : (
                        <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                        </svg>
                    )}
                </div>

                <h2 className="text-2xl font-black text-white mb-2 tracking-tight">
                    {shouldShowOutdatedModal ? "Update Required" : "Vortex Engine Offline"}
                </h2>
                <p className="text-text-2 mb-8 text-sm leading-relaxed">
                    {shouldShowOutdatedModal && engineVersion
                        ? `Your engine version (${engineVersion}) is outdated. Please download the latest version (${LATEST_ENGINE_VERSION}) to continue using Vortex safely.`
                        : "The background torrent engine is not running or unreachable. You need the standalone engine to safely search, download, and manage your torrents."
                    }
                </p>

                <div className="space-y-4">
                    <div className="p-4 rounded-2xl bg-white/[0.03] border border-white/[0.05]">
                        <h3 className="text-xs font-bold text-white uppercase tracking-wider mb-2">Instructions</h3>
                        <ol className="text-sm text-text-3 space-y-2 list-decimal list-inside marker:text-accent">
                            {shouldShowOutdatedModal ? (
                                <>
                                    <li>Download the latest Vortex Engine EXE.</li>
                                    <li>Close your current <span className="font-mono text-accent/80">vortex.exe</span>.</li>
                                    <li>Run the new version of the engine.</li>
                                </>
                            ) : (
                                <>
                                    <li>Download the Vortex Engine EXE below.</li>
                                    <li>Run the <span className="font-mono text-accent/80">vortex.exe</span> file on your computer.</li>
                                    <li>It will automatically sync with this dashboard.</li>
                                </>
                            )}
                        </ol>
                    </div>

                    <div className="flex flex-col gap-3 w-full">
                        {!shouldShowOutdatedModal && (
                            <button
                                onClick={() => { window.location.href = 'vortex://launch'; }}
                                className="flex items-center justify-center gap-2 w-full py-4 text-sm font-bold rounded-xl bg-white/[0.05] text-white border border-white/10 hover:bg-white/[0.1] transition-all duration-300"
                            >
                                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                    <polyline points="15 3 21 3 21 9"></polyline>
                                    <line x1="10" y1="14" x2="21" y2="3"></line>
                                    <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"></path>
                                </svg>
                                Magic Launch (Open Engine)
                            </button>
                        )}

                        <button
                            onClick={() => window.open("https://github.com/Rover1218/vortex/releases/download/0.1.2/vortex.exe", "_blank")}
                            className="flex items-center justify-center gap-2 w-full py-4 text-sm font-bold rounded-xl bg-gradient-to-r from-accent to-teal text-white shadow-xl shadow-accent/20 hover:shadow-accent/40 transition-all duration-300 hover:scale-[1.02] active:scale-[0.98]"
                        >
                            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                                <polyline points="7 10 12 15 17 10" />
                                <line x1="12" y1="15" x2="12" y2="3" />
                            </svg>
                            {shouldShowOutdatedModal ? "Download Update" : "First Launch? Download Engine"}
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}
