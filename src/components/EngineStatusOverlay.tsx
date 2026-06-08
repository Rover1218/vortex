"use client";

import { useTorrents } from "@/context/TorrentContext";
import { useAuth } from "@/context/AuthContext";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { DOWNLOAD_LINK, LATEST_ENGINE_VERSION } from "@/constants/version";

export default function EngineStatusOverlay() {
    const { isEngineConnected, engineVersion } = useTorrents();
    const { user, signOut } = useAuth();
    const router = useRouter();
    const [mounted, setMounted] = useState(false);
    const [loggingOut, setLoggingOut] = useState(false);
    const [detectedOutdatedVersion, setDetectedOutdatedVersion] = useState(false);
    const [storedEngineVersion, setStoredEngineVersion] = useState<string | null>(null);

    useEffect(() => {
        setMounted(true);

        try {
            const savedVersion = window.localStorage.getItem("vortex:last-engine-version");
            if (savedVersion) setStoredEngineVersion(savedVersion);
        } catch {
            // ignore storage failures
        }
    }, []);

    // Track if we've ever detected an outdated version to prevent modal flickering
    useEffect(() => {
        if (isEngineConnected && engineVersion) {
            try {
                window.localStorage.setItem("vortex:last-engine-version", engineVersion);
            } catch {
                // ignore storage failures
            }

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

    useEffect(() => {
        if (engineVersion) {
            setStoredEngineVersion(engineVersion);
        }
    }, [engineVersion]);

    const handleLogout = async () => {
        if (loggingOut) return;
        setLoggingOut(true);
        try {
            await signOut();
            router.push("/");
        } catch (err) {
            console.error("Logout failed:", err);
            setLoggingOut(false);
        }
    };

    if (!mounted) return null;

    // Determine which modal to show - prioritize outdated version
    const rememberedVersion = engineVersion || storedEngineVersion;
    const shouldShowOutdatedModal = detectedOutdatedVersion || (rememberedVersion !== null && rememberedVersion !== LATEST_ENGINE_VERSION && (!isEngineConnected || !!engineVersion));
    const shouldShowOfflineModal = !isEngineConnected && !shouldShowOutdatedModal;

    if (!shouldShowOutdatedModal && !shouldShowOfflineModal) return null;

    const isOutdated = shouldShowOutdatedModal;
    const tone = isOutdated
        ? { glow: "rgba(251,191,36,0.18)", dot: "bg-warning", text: "text-warning", soft: "bg-warning/10", border: "border-warning/25", hairline: "via-warning/60" }
        : { glow: "rgba(255,84,112,0.18)", dot: "bg-danger", text: "text-danger", soft: "bg-danger/10", border: "border-danger/25", hairline: "via-danger/60" };

    const steps = isOutdated
        ? [
            "Download the latest Vortex Engine.",
            <>Quit your current <span className="font-mono text-accent">vortex.exe</span>.</>,
            "Launch the new engine — it reconnects automatically.",
        ]
        : [
            "Download the Vortex Engine below.",
            <>Run <span className="font-mono text-accent">vortex.exe</span> on your computer.</>,
            "It syncs with this dashboard in seconds.",
        ];

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-2xl">
            {/* ambient color wash behind the card */}
            <div
                className="pointer-events-none absolute inset-0 opacity-70"
                style={{ background: `radial-gradient(60% 50% at 50% 0%, ${tone.glow}, transparent 70%)` }}
            />

            <div className="relative w-full max-w-md overflow-hidden rounded-3xl border border-white/[0.08] bg-surface/95 shadow-cinema-lg">
                {/* top hairline accent */}
                <div className={`absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent ${tone.hairline} to-transparent`} />
                <div className="pointer-events-none absolute -top-24 -right-16 h-56 w-56 rounded-full opacity-30 blur-3xl" style={{ background: tone.glow }} />

                <div className="relative p-7 sm:p-8">
                    {/* ── Header ───────────────────────────────── */}
                    <div className="flex items-start justify-between gap-4 mb-6">
                        <div className={`relative flex h-14 w-14 items-center justify-center rounded-2xl border ${tone.border} ${tone.soft} ${tone.text}`}>
                            {isOutdated ? (
                                <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                                    <polyline points="7 10 12 15 17 10" />
                                    <line x1="12" y1="15" x2="12" y2="3" />
                                </svg>
                            ) : (
                                <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                    <path d="M18.36 6.64A9 9 0 1 1 5.64 6.64" />
                                    <line x1="12" y1="2" x2="12" y2="12" />
                                </svg>
                            )}
                        </div>

                        {/* live status pill */}
                        <div className="flex items-center gap-2 rounded-full border border-white/[0.08] bg-white/[0.03] px-3 py-1.5">
                            <span className="relative flex h-2 w-2">
                                <span className={`absolute inline-flex h-full w-full animate-ping rounded-full ${tone.dot} opacity-75`} />
                                <span className={`relative inline-flex h-2 w-2 rounded-full ${tone.dot}`} />
                            </span>
                            <span className="text-[11px] font-semibold uppercase tracking-wider text-text-2">
                                {isOutdated ? "Update available" : "Searching for engine"}
                            </span>
                        </div>
                    </div>

                    <h2 className="text-2xl font-black tracking-tight text-text-1">
                        {isOutdated ? "Update Required" : "Engine Offline"}
                    </h2>
                    <p className="mt-2 text-sm leading-relaxed text-text-2">
                        {isOutdated && rememberedVersion
                            ? <>Your engine <span className="font-mono text-text-1">v{rememberedVersion}</span> is out of date. Update to <span className="font-mono text-accent">v{LATEST_ENGINE_VERSION}</span> to keep downloading safely.</>
                            : "We can't reach the background torrent engine. Start the standalone engine to search, download, and manage your torrents."}
                    </p>

                    {/* ── Steps ────────────────────────────────── */}
                    <div className="mt-6 rounded-2xl border border-white/[0.06] bg-white/[0.02] p-4">
                        <h3 className="mb-3 text-[11px] font-bold uppercase tracking-wider text-text-3">
                            {isOutdated ? "How to update" : "Get started"}
                        </h3>
                        <ul className="space-y-3">
                            {steps.map((step, i) => (
                                <li key={i} className="flex items-center gap-3">
                                    <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-accent/15 text-[11px] font-bold text-accent">
                                        {i + 1}
                                    </span>
                                    <span className="text-sm text-text-2">{step}</span>
                                </li>
                            ))}
                        </ul>
                    </div>

                    {/* ── Actions ──────────────────────────────── */}
                    <div className="mt-6 space-y-3">
                        {!isOutdated && (
                            <button
                                onClick={() => { window.location.href = 'vortex://launch'; }}
                                className="group flex w-full items-center justify-center gap-2 rounded-xl border border-white/10 bg-white/[0.04] py-3.5 text-sm font-bold text-text-1 transition-all duration-200 hover:bg-white/[0.08]"
                            >
                                <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5">
                                    <polyline points="15 3 21 3 21 9" />
                                    <line x1="10" y1="14" x2="21" y2="3" />
                                    <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
                                </svg>
                                Magic Launch
                            </button>
                        )}

                        <button
                            onClick={() => window.open(DOWNLOAD_LINK, "_blank")}
                            className="flex w-full items-center justify-center gap-2 rounded-xl bg-accent py-3.5 text-sm font-bold text-black shadow-accent-glow transition-all duration-200 hover:bg-accent-strong hover:scale-[1.01] active:scale-[0.99]"
                        >
                            <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                                <polyline points="7 10 12 15 17 10" />
                                <line x1="12" y1="15" x2="12" y2="3" />
                            </svg>
                            {isOutdated ? "Download Update" : "Download Engine"}
                        </button>
                    </div>

                    {/* ── Account footer ───────────────────────── */}
                    <div className="mt-6 flex items-center justify-between gap-3 border-t border-white/[0.06] pt-5">
                        <div className="flex min-w-0 items-center gap-2.5">
                            {user?.photoURL ? (
                                // eslint-disable-next-line @next/next/no-img-element
                                <img src={user.photoURL} alt="" className="h-8 w-8 shrink-0 rounded-full border border-white/10" />
                            ) : (
                                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-white/10 bg-white/[0.06] text-xs font-bold text-text-2">
                                    {(user?.displayName || user?.email || "?").charAt(0).toUpperCase()}
                                </div>
                            )}
                            <div className="min-w-0 leading-tight">
                                <p className="text-[10px] font-semibold uppercase tracking-wider text-text-3">Signed in as</p>
                                <p className="truncate text-xs text-text-2">{user?.email || user?.displayName || "Unknown account"}</p>
                            </div>
                        </div>
                        <button
                            onClick={handleLogout}
                            disabled={loggingOut}
                            className="flex shrink-0 items-center gap-1.5 rounded-lg border border-white/[0.06] px-3 py-2 text-xs font-bold text-text-2 transition-all duration-200 hover:border-danger/25 hover:bg-danger/10 hover:text-danger disabled:cursor-not-allowed disabled:opacity-50"
                        >
                            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
                                <polyline points="16 17 21 12 16 7" />
                                <line x1="21" y1="12" x2="9" y2="12" />
                            </svg>
                            {loggingOut ? "Signing out…" : "Sign out"}
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}
