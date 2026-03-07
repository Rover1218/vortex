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
        <div className="max-w-3xl mx-auto space-y-8">
            <div>
                <h1 className="text-4xl font-black tracking-tight mb-1">
                    <span className="bg-gradient-to-r from-white to-text-2 bg-clip-text text-transparent">Settings</span>
                </h1>
                <p className="text-text-3 text-sm">Configure your Vortex client</p>
            </div>

            <div className="space-y-4">
                {/* Download Location */}
                <section className="rounded-2xl bg-white/[0.02] border border-white/[0.04] overflow-hidden">
                    <div className="px-6 py-4 border-b border-white/[0.04] flex items-center gap-3">
                        <div className="w-8 h-8 rounded-xl bg-accent/10 border border-accent/10 flex items-center justify-center text-sm">📂</div>
                        <div>
                            <h2 className="text-sm font-bold text-white">Download Location</h2>
                            <p className="text-[11px] text-text-3">Where to save downloaded files</p>
                        </div>
                    </div>
                    <div className="p-6">
                        <div className="flex gap-2">
                            <input
                                type="text" value={localSettings.downloadPath}
                                onChange={(e) => setLocalSettings({ ...localSettings, downloadPath: e.target.value })}
                                className="flex-1 bg-white/[0.04] border border-white/[0.06] rounded-xl px-4 py-3 text-white focus:outline-none focus:border-accent/40 focus:shadow-[0_0_20px_rgba(124,106,255,0.08)] font-mono text-sm transition-all"
                            />
                            <button onClick={() => openFolderBrowser()}
                                className="px-5 py-3 bg-accent/10 text-accent border border-accent/15 rounded-xl font-bold text-sm hover:bg-accent/20 transition-all">
                                Browse
                            </button>
                        </div>
                    </div>
                </section>

                {/* Bandwidth */}
                <section className="rounded-2xl bg-white/[0.02] border border-white/[0.04] overflow-hidden">
                    <div className="px-6 py-4 border-b border-white/[0.04] flex items-center gap-3">
                        <div className="w-8 h-8 rounded-xl bg-teal/10 border border-teal/10 flex items-center justify-center text-sm">🌐</div>
                        <div>
                            <h2 className="text-sm font-bold text-white">Bandwidth Control</h2>
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
                                className="w-full bg-white/[0.04] border border-white/[0.06] rounded-xl px-4 py-3 text-white focus:outline-none focus:border-accent/40 font-mono text-sm transition-all"
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
                                className="w-full bg-white/[0.04] border border-white/[0.06] rounded-xl px-4 py-3 text-white focus:outline-none focus:border-accent/40 font-mono text-sm transition-all"
                            />
                            <p className="text-[10px] text-text-3">0 = unlimited</p>
                        </div>
                    </div>
                </section>

                {/* Subtitles */}
                <section className="rounded-2xl bg-white/[0.02] border border-white/[0.04] overflow-hidden">
                    <div className="px-6 py-4 border-b border-white/[0.04] flex items-center gap-3">
                        <div className="w-8 h-8 rounded-xl bg-purple-500/10 border border-purple-500/10 flex items-center justify-center text-sm">CC</div>
                        <div>
                            <h2 className="text-sm font-bold text-white">Subtitles</h2>
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
                                className="w-full bg-white/[0.04] border border-white/[0.06] rounded-xl px-4 py-3 text-white placeholder-text-3 focus:outline-none focus:border-purple-500/40 font-mono text-sm transition-all"
                            />
                        </div>

                        {/* Language preference */}
                        <div className="space-y-2">
                            <label className="text-xs text-text-2 font-medium">Preferred Language</label>
                            <select
                                value={localSettings.subtitleLang || "en"}
                                onChange={e => setLocalSettings({ ...localSettings, subtitleLang: e.target.value })}
                                className="w-full bg-white/[0.04] border border-white/[0.06] rounded-xl px-4 py-3 text-white focus:outline-none focus:border-purple-500/40 text-sm transition-all appearance-none cursor-pointer"
                            >
                                <option value="en">English</option>
                                <option value="fr">French</option>
                                <option value="de">German</option>
                                <option value="es">Spanish</option>
                                <option value="pt">Portuguese</option>
                                <option value="it">Italian</option>
                                <option value="ja">Japanese</option>
                                <option value="ko">Korean</option>
                                <option value="zh">Chinese</option>
                                <option value="hi">Hindi</option>
                                <option value="bn">Bengali</option>
                                <option value="ta">Tamil</option>
                                <option value="ar">Arabic</option>
                                <option value="ru">Russian</option>
                                <option value="tr">Turkish</option>
                                <option value="nl">Dutch</option>
                                <option value="pl">Polish</option>
                                <option value="sv">Swedish</option>
                            </select>
                            <p className="text-[10px] text-text-3">This language is used for both manual CC search and auto-download</p>
                        </div>

                        {/* Auto-download toggle */}
                        <div className="flex items-center justify-between py-3 px-4 rounded-xl bg-white/[0.02] border border-white/[0.04]">
                            <div>
                                <p className="text-sm text-white font-medium">Auto-download subtitles</p>
                                <p className="text-[11px] text-text-3 mt-0.5">Automatically fetch the top subtitle match when a torrent finishes downloading</p>
                            </div>
                            <button
                                onClick={() => setLocalSettings({ ...localSettings, autoSubtitle: !localSettings.autoSubtitle })}
                                className={`relative shrink-0 w-11 h-6 rounded-full transition-all duration-300 ${localSettings.autoSubtitle ? "bg-purple-500" : "bg-white/10"}`}
                            >
                                <span className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow-sm transition-all duration-300 ${localSettings.autoSubtitle ? "translate-x-5" : "translate-x-0"}`} />
                            </button>
                        </div>

                        <p className="text-[11px] text-text-3 leading-relaxed">
                            Free API key from{" "}
                            <a href="https://www.opensubtitles.com/consumers" target="_blank" rel="noopener noreferrer"
                                className="text-purple-400 hover:text-purple-300 underline underline-offset-2">
                                opensubtitles.com/consumers
                            </a>
                            {" "}— register a free account, then create a consumer app to get your key.
                        </p>
                    </div>
                </section>

                {/* TMDB */}
                <section className="rounded-2xl bg-white/[0.02] border border-white/[0.04] overflow-hidden">
                    <div className="px-6 py-4 border-b border-white/[0.04] flex items-center gap-3">
                        <div className="w-8 h-8 rounded-xl bg-yellow-500/10 border border-yellow-500/10 flex items-center justify-center text-xs font-black text-yellow-400">T</div>
                        <div>
                            <h2 className="text-sm font-bold text-white">TMDB Posters</h2>
                            <p className="text-[11px] text-text-3">The Movie Database API key for movie/show posters in Library</p>
                        </div>
                    </div>
                    <div className="p-6 space-y-3">
                        <div className="space-y-2">
                            <label className="text-xs text-text-2 font-medium">API Key (v3 auth)</label>
                            <input
                                type="password"
                                value={localSettings.tmdbApiKey || ""}
                                onChange={e => setLocalSettings({ ...localSettings, tmdbApiKey: e.target.value })}
                                placeholder="Paste your TMDB API key…"
                                className="w-full bg-white/[0.04] border border-white/[0.06] rounded-xl px-4 py-3 text-white placeholder-text-3 focus:outline-none focus:border-yellow-500/40 font-mono text-sm transition-all"
                            />
                        </div>
                        <p className="text-[11px] text-text-3 leading-relaxed">
                            Free API key from{" "}
                            <a href="https://www.themoviedb.org/settings/api" target="_blank" rel="noopener noreferrer"
                                className="text-yellow-400 hover:text-yellow-300 underline underline-offset-2">
                                themoviedb.org/settings/api
                            </a>
                            {" "}— create a free account, go to Settings → API, request a Developer key.
                        </p>
                    </div>
                </section>
            </div>

            {/* Save */}
            <div className="flex justify-end gap-3">
                <button onClick={() => setLocalSettings(settings)} className="px-5 py-2.5 text-text-3 hover:text-white text-sm transition-colors">Discard</button>
                <button onClick={handleSave} disabled={isSaving}
                    className={`px-6 py-2.5 rounded-xl font-bold text-sm transition-all active:scale-95 ${saved ? 'bg-teal/20 text-teal border border-teal/20' : 'bg-gradient-to-r from-accent to-accent/80 text-white hover:brightness-110 hover:shadow-lg hover:shadow-accent/20'
                        } disabled:opacity-50`}>
                    {saved ? "✓ Saved!" : isSaving ? "Saving..." : "Save Settings"}
                </button>
            </div>

            {/* Folder Browser Modal */}
            {showBrowser && (
                <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={() => setShowBrowser(false)}>
                    <div className="bg-[#0e0e1a] rounded-2xl border border-white/[0.08] w-full max-w-lg max-h-[80vh] flex flex-col shadow-2xl shadow-black/60" onClick={e => e.stopPropagation()}>
                        <div className="p-5 border-b border-white/[0.04] flex items-center justify-between">
                            <div>
                                <h3 className="text-sm font-bold text-white">Select Folder</h3>
                                <p className="text-[10px] text-text-3 font-mono mt-1 truncate max-w-[350px]">{browserData?.current || '...'}</p>
                            </div>
                            <button onClick={() => setShowBrowser(false)} className="w-8 h-8 rounded-lg bg-white/[0.04] text-text-3 hover:text-white flex items-center justify-center transition-all">✕</button>
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
                                            className="w-full text-left px-4 py-3 rounded-xl text-sm text-accent hover:bg-accent/10 transition-all font-bold">
                                            ← Back
                                        </button>
                                    )}
                                    {browserData?.items?.length > 0 ? (
                                        browserData.items.map((item: any) => (
                                            <div key={item.path} className="flex items-center gap-1">
                                                <button onClick={() => navigateFolder(item.path)}
                                                    className="flex-1 text-left px-4 py-2.5 rounded-xl text-sm text-text-1 hover:bg-white/[0.04] transition-all truncate">
                                                    📁 {item.name}
                                                </button>
                                                <button onClick={() => selectFolder(item.path)}
                                                    className="px-3 py-1.5 rounded-lg text-[10px] font-bold bg-accent/10 text-accent hover:bg-accent hover:text-white transition-all shrink-0">
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

                        <div className="p-4 border-t border-white/[0.04] flex justify-between">
                            <button onClick={() => selectFolder(browserData?.current)}
                                className="px-5 py-2.5 bg-gradient-to-r from-accent to-accent/80 text-white rounded-xl font-bold text-xs hover:brightness-110 transition-all">
                                Select Current Folder
                            </button>
                            <button onClick={() => setShowBrowser(false)} className="px-5 py-2.5 text-text-3 hover:text-white text-xs transition-colors">Cancel</button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
