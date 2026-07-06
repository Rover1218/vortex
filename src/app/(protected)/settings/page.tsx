"use client";

import { useTorrents } from "@/context/TorrentContext";
import { usePremium } from "@/context/PremiumContext";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { THEMES, applyTheme, getStoredTheme, DEFAULT_THEME } from "@/lib/themes";
import { FREE_MAX_DOWNLOAD_MBPS } from "@/lib/premium/plans";

export default function SettingsPage() {
    const { settings, updateSettings, browseFolders } = useTorrents();
    const { isPremium, isLifetime, premiumUntil, loading: premiumLoading, openLimitModal } = usePremium();
    const forcedSubtitleOff = useRef(false);
    const [activeTheme, setActiveTheme] = useState(DEFAULT_THEME);

    useEffect(() => {
        setActiveTheme(getStoredTheme());
    }, []);
    const [localSettings, setLocalSettings] = useState<any>(null);
    const [dlLimitStr, setDlLimitStr] = useState("");
    const [ulLimitStr, setUlLimitStr] = useState("");
    const [isSaving, setIsSaving] = useState(false);
    const [saved, setSaved] = useState(false);
    const [showBrowser, setShowBrowser] = useState(false);
    const [browserData, setBrowserData] = useState<any>(null);
    const [browserLoading, setBrowserLoading] = useState(false);
    const panelClassName = "cine-card overflow-hidden";

    useEffect(() => {
        if (settings && !localSettings) {
            setLocalSettings(settings);
            setDlLimitStr(settings.globalDownloadLimit.toString());
            setUlLimitStr(settings.globalUploadLimit.toString());
        }
    }, [settings, localSettings]);

    // Auto-subtitles are premium: if a user's plan lapsed with the toggle still
    // on, switch it off once so the engine stops fetching subtitles. Also keeps
    // the form in sync when it snapshotted settings before enforcement ran.
    useEffect(() => {
        if (premiumLoading || isPremium) return;
        if (localSettings?.autoSubtitle) {
            setLocalSettings((prev: any) => (prev ? { ...prev, autoSubtitle: false } : prev));
        }
        if (!forcedSubtitleOff.current && (settings as any)?.autoSubtitle) {
            forcedSubtitleOff.current = true;
            updateSettings({ autoSubtitle: false } as any);
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [premiumLoading, isPremium, settings, localSettings]);

    // Free tier: if the form loaded an over-cap / unlimited speed value before
    // the automatic clamp applied, reflect the clamped value in the field.
    useEffect(() => {
        if (premiumLoading || isPremium || !settings) return;
        setDlLimitStr((prev) => {
            const v = parseInt(prev) || 0;
            if (v !== 0 && v <= FREE_MAX_DOWNLOAD_MBPS) return prev; // legal value — keep user input
            const enforced = settings.globalDownloadLimit > 0 && settings.globalDownloadLimit <= FREE_MAX_DOWNLOAD_MBPS
                ? settings.globalDownloadLimit
                : FREE_MAX_DOWNLOAD_MBPS;
            return enforced.toString();
        });
    }, [premiumLoading, isPremium, settings]);

    const handleSave = async () => {
        if (!localSettings) return;
        setIsSaving(true);
        const requestedDl = parseInt(dlLimitStr) || 0;
        let dlToSave = requestedDl;
        // Free tier: download speed is capped (0 = unlimited isn't allowed either).
        if (!isPremium) {
            dlToSave = requestedDl === 0 ? FREE_MAX_DOWNLOAD_MBPS : Math.min(requestedDl, FREE_MAX_DOWNLOAD_MBPS);
            if (dlToSave !== requestedDl) {
                setDlLimitStr(dlToSave.toString());
                openLimitModal('speed');
            }
        }
        const toSave = {
            ...localSettings,
            globalDownloadLimit: dlToSave,
            globalUploadLimit: parseInt(ulLimitStr) || 0
        };
        await updateSettings(toSave);
        setIsSaving(false);
        setSaved(true);
        setTimeout(() => setSaved(false), 2500);
    };

    const openFolderBrowser = async (startPath?: string) => {
        setShowBrowser(true);
        setBrowserLoading(true);
        const dlPath = localSettings?.downloadPath || 'C:\\';
        const parentOfDl = dlPath.includes('\\') ? dlPath.substring(0, dlPath.lastIndexOf('\\')) || 'C:\\' : dlPath.includes('/') ? dlPath.substring(0, dlPath.lastIndexOf('/')) || '/' : dlPath;
        const data = await browseFolders(startPath || parentOfDl);
        setBrowserData(data);
        setBrowserLoading(false);
    };

    const navigateFolder = async (folderPath: string) => {
        setBrowserLoading(true);
        const data = await browseFolders(folderPath);
        setBrowserData(data);
        setBrowserLoading(false);
    };

    const selectFolder = (folderPath: string) => {
        setLocalSettings({ ...localSettings, downloadPath: folderPath });
        setShowBrowser(false);
    };

    if (!localSettings) {
        return (
            <div className="flex items-center justify-center min-h-[50vh]">
                <div className="w-8 h-8 border-2 border-accent/30 border-t-accent rounded-full animate-spin" />
            </div>
        );
    }

    return (
        <div className="max-w-6xl mx-auto space-y-5 pb-6 relative perf-auto isolate">
            {/* Ambient glow */}
            <div className="pointer-events-none absolute -top-24 left-1/3 h-64 w-[50%] rounded-full bg-accent/8 blur-[120px]" aria-hidden />

            <div className="relative z-10 flex flex-wrap items-center justify-between gap-4 cine-card px-6 py-5">
                <div className="flex items-center gap-4">
                    <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-accent/12 text-accent ring-1 ring-accent/25">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" className="h-6 w-6"><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1Z" /></svg>
                    </div>
                    <div>
                        <h1 className="cine-title text-3xl sm:text-4xl font-black tracking-tight text-text-1">Settings</h1>
                        <p className="text-text-3 text-sm mt-0.5">Configure your Vortex client</p>
                    </div>
                </div>

                <div className="flex items-center gap-3">
                    <button onClick={() => setLocalSettings(settings)} className="btn-ghost">Discard</button>
                    <button onClick={handleSave} disabled={isSaving}
                        className={`btn-primary ${saved ? '!bg-teal/15 !text-teal' : ''}`}>
                        {saved ? (
                            <>
                                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4"><polyline points="20 6 9 17 4 12" /></svg>
                                Saved!
                            </>
                        ) : isSaving ? "Saving..." : "Save Settings"}
                    </button>
                </div>
            </div>

            {/* Plan */}
            <div className="relative z-10 cine-card px-6 py-5 flex flex-wrap items-center justify-between gap-4">
                <div className="flex items-center gap-4">
                    <div className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl ring-1 ${isPremium ? "bg-accent/12 text-accent ring-accent/25" : "bg-white/[0.04] text-text-3 ring-white/[0.08]"}`}>
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5"><path d="m2 8 4 10h12l4-10-6 4-4-7-4 7z" /></svg>
                    </div>
                    <div>
                        <h2 className="cine-title text-sm">
                            {isLifetime ? "Lifetime Premium" : isPremium ? "Premium" : "Free plan"}
                        </h2>
                        <p className="text-[11px] text-text-3 mt-0.5">
                            {isLifetime
                                ? "Everything unlocked, forever"
                                : isPremium
                                    ? `Active until ${premiumUntil?.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" }) ?? "—"}`
                                    : "2 downloads at a time · no streaming while downloading · no auto-subtitles"}
                        </p>
                    </div>
                </div>
                {!isLifetime && (
                    <Link href="/upgrade" className="px-5 py-2.5 bg-accent/10 text-accent border border-accent/20 rounded-xl font-semibold text-sm hover:bg-accent/20 transition-all">
                        {isPremium ? "Extend plan" : "Go Premium"}
                    </Link>
                )}
            </div>

            {/* Appearance */}
            <section className="relative z-10 cine-card overflow-hidden">
                <div className="px-6 py-4 border-b border-white/[0.06] flex items-center gap-3">
                    <div className="w-9 h-9 rounded-xl bg-accent/10 border border-accent/15 flex items-center justify-center text-accent">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5"><circle cx="13.5" cy="6.5" r="2.5" /><circle cx="19" cy="13" r="2.5" /><circle cx="6" cy="12" r="2.5" /><circle cx="10" cy="18.5" r="2.5" /><path d="M12 2a10 10 0 1 0 0 20" /></svg>
                    </div>
                    <div>
                        <h2 className="cine-title text-sm">Appearance</h2>
                        <p className="text-[11px] text-text-3">Pick a theme — saved on this device, applies instantly</p>
                    </div>
                </div>
                <div className="p-6 grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-6 gap-3">
                    {THEMES.map((t) => (
                        <button
                            key={t.id}
                            onClick={() => { applyTheme(t.id); setActiveTheme(t.id); }}
                            className={`group rounded-xl border p-4 text-left transition-all ${activeTheme === t.id
                                ? "border-accent/60 bg-accent/[0.07] ring-1 ring-accent/30"
                                : "border-white/[0.06] bg-white/[0.02] hover:border-white/[0.16] hover:bg-white/[0.04]"
                                }`}
                        >
                            <div className="flex gap-1.5 mb-3">
                                {t.swatch.map((c, i) => (
                                    <span key={i} className="w-4 h-4 rounded-full border border-white/20" style={{ background: c }} />
                                ))}
                            </div>
                            <div className="text-sm font-semibold text-text-1 flex items-center gap-1.5">
                                {t.name}
                                {activeTheme === t.id && (
                                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" className="w-3.5 h-3.5 text-accent"><polyline points="20 6 9 17 4 12" /></svg>
                                )}
                            </div>
                            <div className="text-[10px] text-text-3 mt-0.5 leading-snug">{t.description}</div>
                        </button>
                    ))}
                </div>
            </section>

            <div className="relative z-10 grid grid-cols-1 lg:grid-cols-2 gap-4 items-start">
                <div className="space-y-4">
                {/* Download Location */}
                <section className={panelClassName}>
                    <div className="px-6 py-4 border-b border-white/[0.06] flex items-center gap-3">
                        <div className="w-9 h-9 rounded-xl bg-accent/10 border border-accent/15 flex items-center justify-center text-accent">
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5"><path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" /></svg>
                        </div>
                        <div>
                            <h2 className="cine-title text-sm">Download Location</h2>
                            <p className="text-[11px] text-text-3">Where to save downloaded files</p>
                        </div>
                    </div>
                    <div className="p-6">
                        <div className="flex gap-2">
                            <input
                                type="text" value={localSettings.downloadPath}
                                onChange={(e) => setLocalSettings({ ...localSettings, downloadPath: e.target.value })}
                                className="cine-input flex-1 font-mono"
                            />
                            <button onClick={() => openFolderBrowser()}
                                className="px-5 py-2.5 bg-accent/10 text-accent border border-accent/20 rounded-xl font-semibold text-sm hover:bg-accent/20 transition-all">
                                Browse
                            </button>
                        </div>
                    </div>
                </section>

                {/* Bandwidth */}
                <section className={panelClassName}>
                    <div className="px-6 py-4 border-b border-white/[0.06] flex items-center gap-3">
                        <div className="w-9 h-9 rounded-xl bg-teal/10 border border-teal/15 flex items-center justify-center text-teal">
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5"><circle cx="12" cy="12" r="9" /><path d="M3 12h18M12 3a15 15 0 0 1 0 18M12 3a15 15 0 0 0 0 18" /></svg>
                        </div>
                        <div>
                            <h2 className="cine-title text-sm">Bandwidth Control</h2>
                            <p className="text-[11px] text-text-3">Limit download and upload speeds</p>
                        </div>
                    </div>
                    <div className="p-6 grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                            <label className="text-xs text-text-2 font-medium flex items-center gap-2 min-h-[22px]">
                                <span className="whitespace-nowrap">Download Limit (MB/s)</span>
                                {!isPremium && (
                                    <span className="whitespace-nowrap px-1.5 py-0.5 rounded-md bg-accent/15 border border-accent/30 text-accent text-[9px] font-black uppercase tracking-wide" title={`Free accounts are capped at ${FREE_MAX_DOWNLOAD_MBPS} MB/s — Premium unlocks unlimited`}>
                                        Max {FREE_MAX_DOWNLOAD_MBPS} MB/s
                                    </span>
                                )}
                            </label>
                            <input type="text" value={dlLimitStr}
                                onChange={(e) => {
                                    const val = e.target.value;
                                    if (val === "" || /^\d+$/.test(val)) setDlLimitStr(val);
                                }}
                                className="cine-input font-mono"
                            />
                            <p className="text-[10px] text-text-3">
                                {isPremium ? "0 = unlimited" : `Free: 1–${FREE_MAX_DOWNLOAD_MBPS} MB/s · Premium removes the cap`}
                            </p>
                        </div>
                        <div className="space-y-2">
                            <label className="text-xs text-text-2 font-medium flex items-center gap-2 min-h-[22px]">
                                <span className="whitespace-nowrap">Upload Limit (MB/s)</span>
                            </label>
                            <input type="text" value={ulLimitStr}
                                onChange={(e) => {
                                    const val = e.target.value;
                                    if (val === "" || /^\d+$/.test(val)) setUlLimitStr(val);
                                }}
                                className="cine-input font-mono"
                            />
                            <p className="text-[10px] text-text-3">0 = unlimited</p>
                        </div>
                    </div>
                </section>
                </div>

                <div className="space-y-4">
                {/* Subtitles */}
                <section className={panelClassName}>
                    <div className="px-6 py-4 border-b border-white/[0.06] flex items-center gap-3">
                        <div className="w-9 h-9 rounded-xl bg-accent/10 border border-accent/15 flex items-center justify-center text-accent">
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5"><rect x="3" y="5" width="18" height="14" rx="2" /><path d="M7 15h4M13 15h4M7 11h2M11 11h6" /></svg>
                        </div>
                        <div>
                            <h2 className="cine-title text-sm">Subtitles</h2>
                            <p className="text-[11px] text-text-3">OpenSubtitles.com API key for subtitle search &amp; auto-download</p>
                        </div>
                    </div>
                    <div className="p-6 space-y-4">
                        <div className="space-y-2">
                            <label className="text-xs text-text-2 font-medium">API Key</label>
                            <input
                                type="password"
                                value={localSettings.opensubtitlesApiKey || ""}
                                onChange={e => setLocalSettings({ ...localSettings, opensubtitlesApiKey: e.target.value })}
                                placeholder="Paste your OpenSubtitles.com API key…"
                                className="cine-input font-mono"
                            />
                        </div>

                        {/* Language preference */}
                        <div className="space-y-2">
                            <label className="text-xs text-text-2 font-medium">Preferred Language</label>
                            <div className="relative">
                                <select
                                    value={localSettings.subtitleLang || "en"}
                                    onChange={e => setLocalSettings({ ...localSettings, subtitleLang: e.target.value })}
                                    className="cine-input appearance-none cursor-pointer pr-10"
                                >
                                    {[
                                        { v: "en", l: "English" }, { v: "fr", l: "French" }, { v: "de", l: "German" },
                                        { v: "es", l: "Spanish" }, { v: "pt", l: "Portuguese" }, { v: "it", l: "Italian" },
                                        { v: "ja", l: "Japanese" }, { v: "ko", l: "Korean" }, { v: "zh", l: "Chinese" },
                                        { v: "hi", l: "Hindi" }, { v: "bn", l: "Bengali" }, { v: "ta", l: "Tamil" },
                                        { v: "ar", l: "Arabic" }, { v: "ru", l: "Russian" }, { v: "tr", l: "Turkish" },
                                        { v: "nl", l: "Dutch" }, { v: "pl", l: "Polish" }, { v: "sv", l: "Swedish" }
                                    ].map(lang => (
                                        <option key={lang.v} value={lang.v} className="bg-surface text-text-1">{lang.l}</option>
                                    ))}
                                </select>
                                <div className="absolute right-4 top-1/2 -translate-y-1/2 pointer-events-none text-text-3">
                                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4"><polyline points="6 9 12 15 18 9" /></svg>
                                </div>
                            </div>
                            <p className="text-[10px] text-text-3">This language is used for both manual CC search and auto-download</p>
                        </div>

                        {/* Auto-download toggle */}
                        <div className="flex items-center justify-between py-3 px-4 rounded-xl bg-white/[0.02] border border-white/[0.06]">
                            <div>
                                <p className="text-sm text-text-1 font-medium flex items-center gap-2">
                                    Auto-download subtitles
                                    {!isPremium && (
                                        <span className="px-1.5 py-0.5 rounded-md bg-accent/15 border border-accent/30 text-accent text-[9px] font-black uppercase tracking-wide">Premium</span>
                                    )}
                                </p>
                                <p className="text-[11px] text-text-3 mt-0.5">Automatically fetch the top subtitle match when a torrent finishes downloading</p>
                            </div>
                            <button
                                onClick={() => {
                                    if (!isPremium) {
                                        openLimitModal('subtitles');
                                        return;
                                    }
                                    setLocalSettings({ ...localSettings, autoSubtitle: !localSettings.autoSubtitle });
                                }}
                                className={`relative shrink-0 w-11 h-6 rounded-full transition-all duration-300 ${localSettings.autoSubtitle ? "bg-accent" : "bg-white/10"} ${!isPremium ? "opacity-50" : ""}`}
                            >
                                <span className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow-sm transition-all duration-300 ${localSettings.autoSubtitle ? "translate-x-5" : "translate-x-0"}`} />
                            </button>
                        </div>

                        <p className="text-[11px] text-text-3 leading-relaxed">
                            Free API key from{" "}
                            <a href="https://www.opensubtitles.com/consumers" target="_blank" rel="noopener noreferrer"
                                className="text-accent hover:text-accent-strong underline underline-offset-2">
                                opensubtitles.com/consumers
                            </a>
                            {" "}— register a free account, then create a consumer app to get your key.
                        </p>
                    </div>
                </section>

                {/* Posters info */}
                <section className={panelClassName}>
                    <div className="px-6 py-4 border-b border-white/[0.06] flex items-center gap-3">
                        <div className="w-9 h-9 rounded-xl bg-teal/10 border border-teal/15 flex items-center justify-center text-teal">
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5"><rect x="3" y="4" width="18" height="16" rx="2" /><path d="M7 4v16M17 4v16M3 9h4M3 15h4M17 9h4M17 15h4" /></svg>
                        </div>
                        <div>
                            <h2 className="cine-title text-sm">Posters &amp; Metadata</h2>
                            <p className="text-[11px] text-text-3">Movie &amp; show artwork shown in Library and Search</p>
                        </div>
                    </div>
                    <div className="p-6 space-y-4">
                        <div className="space-y-2">
                            <label className="text-xs text-text-2 font-medium">TMDb API Key</label>
                            <input
                                type="password"
                                value={localSettings.tmdbApiKey || ""}
                                onChange={e => setLocalSettings({ ...localSettings, tmdbApiKey: e.target.value })}
                                placeholder="Paste your TMDB (The Movie Database) API key…"
                                className="cine-input font-mono"
                            />
                            <p className="text-[11px] text-text-3 leading-relaxed mt-2">
                                Free API key from <a href="https://www.themoviedb.org/settings/api" target="_blank" rel="noopener noreferrer" className="text-teal hover:text-teal/80 underline underline-offset-2">themoviedb.org</a>. Highly recommended for the best quality posters! <br />
                                If left blank, Vortex will gracefully fall back to free providers (TVmaze, Jikan, Kitsu).
                            </p>
                        </div>
                    </div>
                </section>
                </div>
            </div>



            {/* Folder Browser Modal */}
            {showBrowser && (
                <div className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center p-4" onClick={() => setShowBrowser(false)}>
                    <div className="bg-surface rounded-2xl border border-white/[0.06] w-full max-w-lg max-h-[80vh] flex flex-col shadow-cinema" onClick={e => e.stopPropagation()}>
                        <div className="p-5 border-b border-white/[0.06] flex items-center justify-between">
                            <div>
                                <h3 className="cine-title text-sm">Select Folder</h3>
                                <p className="text-[10px] text-text-3 font-mono mt-1 truncate max-w-[350px]">{browserData?.current || '...'}</p>
                            </div>
                            <button onClick={() => setShowBrowser(false)} className="btn-icon">
                                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
                            </button>
                        </div>

                        <div className="flex-1 overflow-y-auto p-3 space-y-0.5">
                            {browserLoading ? (
                                <div className="py-12 text-center">
                                    <div className="w-6 h-6 border-2 border-accent/30 border-t-accent rounded-full animate-spin mx-auto" />
                                </div>
                            ) : (
                                <>
                                    {browserData?.parent && (
                                        <button onClick={() => navigateFolder(browserData.parent)}
                                            className="w-full flex items-center gap-2 text-left px-4 py-3 rounded-xl text-sm text-accent hover:bg-accent/10 transition-all font-semibold">
                                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4"><line x1="19" y1="12" x2="5" y2="12" /><polyline points="12 19 5 12 12 5" /></svg>
                                            Back
                                        </button>
                                    )}
                                    {browserData?.items?.length > 0 ? (
                                        browserData.items.map((item: any) => (
                                            <div key={item.path} className="flex items-center gap-1">
                                                <button onClick={() => navigateFolder(item.path)}
                                                    className="flex-1 flex items-center gap-2 text-left px-4 py-2.5 rounded-xl text-sm text-text-1 hover:bg-white/[0.04] transition-all truncate">
                                                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4 shrink-0 text-text-3"><path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" /></svg>
                                                    <span className="truncate">{item.name}</span>
                                                </button>
                                                <button onClick={() => selectFolder(item.path)}
                                                    className="px-3 py-1.5 rounded-lg text-[10px] font-semibold bg-accent/10 text-accent hover:bg-accent hover:text-black transition-all shrink-0">
                                                    Select
                                                </button>
                                            </div>
                                        ))
                                    ) : (
                                        <p className="text-text-3 text-center py-8 text-sm italic">Empty folder</p>
                                    )}
                                </>
                            )}
                        </div>

                        <div className="p-4 border-t border-white/[0.06] flex justify-between">
                            <button onClick={() => selectFolder(browserData?.current)}
                                className="btn-primary text-xs px-5 py-2.5">
                                Select Current Folder
                            </button>
                            <button onClick={() => setShowBrowser(false)} className="btn-ghost text-xs px-4 py-2.5">Cancel</button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
