"use client";

import { useTorrents } from "@/context/TorrentContext";
import { useEffect, useState } from "react";

export default function SettingsPage() {
    const { settings, updateSettings, browseFolders } = useTorrents();
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

    const handleSave = async () => {
        if (!localSettings) return;
        setIsSaving(true);
        const toSave = {
            ...localSettings,
            globalDownloadLimit: parseInt(dlLimitStr) || 0,
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
        <div className="max-w-6xl mx-auto space-y-5 pb-6 relative perf-auto">

            <div className="relative z-10 flex items-center justify-between cine-card bg-elevated px-6 py-5 shadow-cinema">
                <div>
                    <h1 className="text-3xl font-black tracking-tight text-text-1 mb-1">Settings</h1>
                    <p className="text-text-3 text-sm">Configure your Vortex client</p>
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

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 items-start">
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
                            <label className="text-xs text-text-2 font-medium">Download Limit (MB/s)</label>
                            <input type="text" value={dlLimitStr}
                                onChange={(e) => {
                                    const val = e.target.value;
                                    if (val === "" || /^\d+$/.test(val)) setDlLimitStr(val);
                                }}
                                className="cine-input font-mono"
                            />
                            <p className="text-[10px] text-text-3">0 = unlimited</p>
                        </div>
                        <div className="space-y-2">
                            <label className="text-xs text-text-2 font-medium">Upload Limit (MB/s)</label>
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
                                <p className="text-sm text-text-1 font-medium">Auto-download subtitles</p>
                                <p className="text-[11px] text-text-3 mt-0.5">Automatically fetch the top subtitle match when a torrent finishes downloading</p>
                            </div>
                            <button
                                onClick={() => setLocalSettings({ ...localSettings, autoSubtitle: !localSettings.autoSubtitle })}
                                className={`relative shrink-0 w-11 h-6 rounded-full transition-all duration-300 ${localSettings.autoSubtitle ? "bg-accent" : "bg-white/10"}`}
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
