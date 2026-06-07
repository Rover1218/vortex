"use client";

import { useTorrents } from "@/context/TorrentContext";
import RatioCoach from "@/components/RatioCoach";
import StreamPlayer from "@/components/StreamPlayer";
import { listContinueWatching, removeProgress, removeProgressByInfoHash, type WatchEntry } from "@/lib/watchProgress";
import { useState, useMemo, useEffect, useCallback, useRef, memo } from "react";
import axios from "axios";

const API_BASE = process.env.NEXT_PUBLIC_ENGINE_URL || "http://localhost:3001";
type Tab = "All" | "Downloading" | "Paused" | "Completed";

interface TorrentFile {
    name: string;
    path: string;
    length: number;
    downloaded: number;
    progress: number;
    selected?: boolean;
    paused?: boolean;
}

function normalizeTorrentFiles(next: TorrentFile[], prev: TorrentFile[]): TorrentFile[] {
    if (!Array.isArray(next)) return prev;
    if (next.length === 0) return next;

    const prevByPath = new Map(prev.map(file => [file.path, file]));
    let changed = next.length !== prev.length;

    const merged = next.map(file => {
        const existing = prevByPath.get(file.path);
        if (!existing) {
            changed = true;
            return file;
        }

        const same =
            existing.progress === file.progress &&
            existing.downloaded === file.downloaded &&
            existing.length === file.length &&
            existing.selected === file.selected &&
            existing.paused === file.paused &&
            existing.name === file.name;

        if (!same) changed = true;
        return same ? existing : file;
    });

    return changed ? merged : prev;
}

const IconDown = memo(() => (
    <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M5 1v7M2 6l3 3 3-3" /></svg>
));
IconDown.displayName = "IconDown";

const IconUp = memo(() => (
    <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M5 9V2M2 4l3-3 3 3" /></svg>
));
IconUp.displayName = "IconUp";

const IconPlay = memo(() => (
    <svg width="12" height="12" viewBox="0 0 12 12" fill="currentColor"><path d="M3 2l7 4-7 4V2z" /></svg>
));
IconPlay.displayName = "IconPlay";

const IconPause = memo(() => (
    <svg width="12" height="12" viewBox="0 0 12 12" fill="currentColor"><rect x="2" y="2" width="3" height="8" rx="1" /><rect x="7" y="2" width="3" height="8" rx="1" /></svg>
));
IconPause.displayName = "IconPause";

const IconStop = memo(() => (
    <svg width="12" height="12" viewBox="0 0 12 12" fill="currentColor"><rect x="2" y="2" width="8" height="8" rx="1.5" /></svg>
));
IconStop.displayName = "IconStop";

const IconTrash = memo(() => (
    <svg width="13" height="13" viewBox="0 0 13 13" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
        <path d="M2 3.5h9M4.5 3.5V2.5a.5.5 0 01.5-.5h3a.5.5 0 01.5.5v1M5 6v3.5M8 6v3.5M3 3.5l.7 7a.5.5 0 00.5.5h4.6a.5.5 0 00.5-.5l.7-7" />
    </svg>
));
IconTrash.displayName = "IconTrash";

const IconFiles = memo(() => (
    <svg width="13" height="13" viewBox="0 0 13 13" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round">
        <rect x="2" y="1.5" width="7" height="9" rx="1" />
        <path d="M4 4h3M4 6h3M4 8h2" />
        <rect x="4" y="3.5" width="5" height="7" rx="1" fill="currentColor" fillOpacity="0.08" stroke="none" />
    </svg>
));
IconFiles.displayName = "IconFiles";

const IconInbox = memo(() => (
    <svg width="40" height="40" viewBox="0 0 40 40" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <rect x="5" y="8" width="30" height="24" rx="3" /><path d="M5 24h8l3 4 3-4h8" /><path d="M20 12v8M16 16l4 4 4-4" />
    </svg>
));
IconInbox.displayName = "IconInbox";

const IconPauseCircle = memo(() => (
    <svg width="40" height="40" viewBox="0 0 40 40" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="20" cy="20" r="14" />
        <rect x="14" y="13" width="4" height="14" rx="1" fill="currentColor" stroke="none" />
        <rect x="22" y="13" width="4" height="14" rx="1" fill="currentColor" stroke="none" />
    </svg>
));
IconPauseCircle.displayName = "IconPauseCircle";

const IconCheckCircle = memo(() => (
    <svg width="40" height="40" viewBox="0 0 40 40" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="20" cy="20" r="14" /><path d="M13 20l5 5 9-10" />
    </svg>
));
IconCheckCircle.displayName = "IconCheckCircle";

export default function DownloadsPage() {
    const { torrents, totalDownloadSpeed, totalUploadSpeed, pauseTorrent, resumeTorrent, startSeeding, setTorrentFileSelection, stopSeeding, deleteWithFiles, diskInfo } = useTorrents();
    const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
    const [streamTarget, setStreamTarget] = useState<{ infoHash: string; name: string; fileIdx?: number; time?: number } | null>(null);
    const [continueList, setContinueList] = useState<WatchEntry[]>([]);
    const [activeTab, setActiveTab] = useState<Tab>("All");

    useEffect(() => { setContinueList(listContinueWatching()); }, []);
    const [drawerHash, setDrawerHash] = useState<string | null>(null);
    const [drawerFiles, setDrawerFiles] = useState<TorrentFile[]>([]);
    const [drawerLoading, setDrawerLoading] = useState(false);
    const [drawerActionByPath, setDrawerActionByPath] = useState<Record<string, boolean>>({});
    const [drawerTop] = useState(0);
    const drawerFetchingRef = useRef(false);
    const drawerPanelRef = useRef<HTMLDivElement>(null);

    // Speed sparkline history (last 60 ticks ~1 s each)
    const dlHistory = useRef<number[]>(new Array(60).fill(0));
    const ulHistory = useRef<number[]>(new Array(60).fill(0));
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const rafRef = useRef<number | null>(null);
    const speedsRef = useRef({ dl: 0, ul: 0 });

    useEffect(() => {
        speedsRef.current = { dl: totalDownloadSpeed, ul: totalUploadSpeed };

        if (rafRef.current) cancelAnimationFrame(rafRef.current);
        rafRef.current = requestAnimationFrame(() => {
            dlHistory.current = [...dlHistory.current.slice(1), speedsRef.current.dl];
            ulHistory.current = [...ulHistory.current.slice(1), speedsRef.current.ul];
            const canvas = canvasRef.current;
            if (!canvas) return;
            const ctx = canvas.getContext('2d');
            if (!ctx) return;
            const W = canvas.width, H = canvas.height;
            ctx.clearRect(0, 0, W, H);
            const maxVal = Math.max(...dlHistory.current, ...ulHistory.current, 1024);
            const drawLine = (data: number[], stroke: string, fill: string) => {
                const pts = data.map((v, i) => [i / (data.length - 1) * W, H - (v / maxVal) * H * 0.88] as [number, number]);
                ctx.beginPath();
                pts.forEach(([x, y], i) => i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y));
                ctx.lineTo(W, H); ctx.lineTo(0, H); ctx.closePath();
                ctx.fillStyle = fill; ctx.fill();
                ctx.beginPath();
                pts.forEach(([x, y], i) => i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y));
                ctx.strokeStyle = stroke; ctx.lineWidth = 1.5; ctx.lineJoin = 'round'; ctx.stroke();
            };
            drawLine(ulHistory.current, 'rgba(245,166,35,0.7)', 'rgba(245,166,35,0.08)');
            drawLine(dlHistory.current, 'rgba(45,212,167,0.9)', 'rgba(45,212,167,0.1)');
        });

        return () => {
            if (rafRef.current) cancelAnimationFrame(rafRef.current);
        };
    }, [totalDownloadSpeed, totalUploadSpeed]);

    const formatSpeed = (bytes: number) => {
        if (!bytes || bytes <= 0) return "0 B/s";
        const k = 1024, sizes = ["B/s", "KB/s", "MB/s", "GB/s"];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + " " + sizes[i];
    };
    const formatSize = (bytes: number) => {
        if (!bytes || bytes <= 0) return "0 B";
        const k = 1024, sizes = ["B", "KB", "MB", "GB", "TB"];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + " " + sizes[i];
    };
    const formatETA = (ms: number) => {
        if (!ms || ms <= 0 || !isFinite(ms)) return "--";
        const s = Math.floor(ms / 1000);
        if (s < 60) return `${s}s`;
        const m = Math.floor(s / 60), ss = s % 60;
        if (m < 60) return `${m}m ${ss}s`;
        const h = Math.floor(m / 60), mm = m % 60;
        if (h < 24) return `${h}h ${mm}m`;
        return `${Math.floor(h / 24)}d ${h % 24}h`;
    };

    const fetchFiles = useCallback(async (hash: string, silent = false) => {
        if (drawerFetchingRef.current) return; // skip if already in flight
        drawerFetchingRef.current = true;
        if (!silent) setDrawerLoading(true);
        try {
            const r = await axios.get(`${API_BASE}/api/torrents/${hash}/files`);
            const incoming = (r.data || []) as TorrentFile[];
            setDrawerFiles(prev => normalizeTorrentFiles(incoming, prev));
        } catch { setDrawerFiles([]); }
        if (!silent) setDrawerLoading(false);
        drawerFetchingRef.current = false;
    }, []);

    // Poll files every 3s while drawer is open — silently (no loading flash)
    useEffect(() => {
        if (!drawerHash) return;
        drawerFetchingRef.current = false;
        fetchFiles(drawerHash, false); // first load shows spinner
        const t = setInterval(() => fetchFiles(drawerHash, true), 3000); // polls silently
        return () => clearInterval(t);
    }, [drawerHash, fetchFiles]);

    const openDrawer = (hash: string) => {
        setDrawerHash(hash);
        setDrawerFiles([]);
        setDrawerActionByPath({});
    };
    const closeDrawer = () => {
        setDrawerHash(null);
        setDrawerFiles([]);
        setDrawerActionByPath({});
    };
    const drawerTorrent = torrents.find(t => t.infoHash === drawerHash);
    const canControlFiles = drawerTorrent?.status === "Downloading";

    useEffect(() => {
        if (!drawerHash) return;
        const onResize = () => {
            // Keep the panel naturally centered by wrapper alignment.
            // This listener exists only to force layout sync during viewport changes.
            if (drawerPanelRef.current) {
                drawerPanelRef.current.style.willChange = 'transform';
                requestAnimationFrame(() => {
                    if (drawerPanelRef.current) drawerPanelRef.current.style.willChange = 'auto';
                });
            }
        };
        window.addEventListener("resize", onResize);
        return () => window.removeEventListener("resize", onResize);
    }, [drawerHash]);

    const toggleDrawerFile = useCallback(async (file: TorrentFile) => {
        if (!drawerHash || !canControlFiles || drawerActionByPath[file.path]) return;

        const shouldPause = file.paused !== true;
        const action: 'pause' | 'resume' = shouldPause ? 'pause' : 'resume';
        const previous = drawerFiles;

        setDrawerActionByPath(prev => ({ ...prev, [file.path]: true }));
        setDrawerFiles(curr => curr.map(item =>
            item.path === file.path
                ? { ...item, paused: shouldPause, selected: !shouldPause }
                : item
        ));

        try {
            const files = await setTorrentFileSelection(drawerHash, file.path, action);
            if (Array.isArray(files) && files.length > 0) setDrawerFiles(files);
            else fetchFiles(drawerHash, true);
        } catch {
            setDrawerFiles(previous);
        } finally {
            setDrawerActionByPath(prev => {
                const next = { ...prev };
                delete next[file.path];
                return next;
            });
        }
    }, [canControlFiles, drawerActionByPath, drawerFiles, drawerHash, fetchFiles, setTorrentFileSelection]);

    const counts = useMemo(() => ({
        All: torrents.length,
        Downloading: torrents.filter(t => t.status === "Downloading").length,
        Paused: torrents.filter(t => t.status === "Paused").length,
        Completed: torrents.filter(t => t.status === "Completed" || t.status === "Seeding").length,
    }), [torrents]);

    const filtered = useMemo(() => {
        if (activeTab === "All") return torrents;
        if (activeTab === "Completed") return torrents.filter(t => t.status === "Completed" || t.status === "Seeding");
        return torrents.filter(t => t.status === activeTab);
    }, [torrents, activeTab]);

    const TABS: { id: Tab; label: string; color: string; activeClass: string }[] = [
        { id: "All", label: "All", color: "text-text-2", activeClass: "bg-accent/15 text-accent border-accent/30" },
        { id: "Downloading", label: "Downloading", color: "text-accent", activeClass: "bg-accent/15 text-accent border-accent/30" },
        { id: "Paused", label: "Paused", color: "text-warning", activeClass: "bg-warning/15 text-warning border-warning/30" },
        { id: "Completed", label: "Completed", color: "text-teal", activeClass: "bg-teal/15 text-teal border-teal/30" },
    ];
    const EmptyIcon = activeTab === "Paused" ? IconPauseCircle : activeTab === "Completed" ? IconCheckCircle : IconInbox;

    return (
        <div className="w-full max-w-full space-y-6 pb-10 relative isolate overflow-x-hidden">
            {/* Header */}
            <div className="relative z-10 flex items-end justify-between rounded-2xl border border-white/[0.06] bg-surface px-6 py-5 shadow-cinema">
                <div>
                    <h1 className="cine-title text-4xl font-black tracking-tight mb-1 text-text-1">Downloads</h1>
                    <p className="text-text-3 text-sm">{torrents.length} {torrents.length === 1 ? "task" : "tasks"} currently tracked</p>
                </div>
            </div>

            {/* Speed sparkline + disk usage */}
            {torrents.some(t => t.status === "Downloading" || t.status === "Seeding") && (
                <div className="rounded-2xl bg-surface border border-white/[0.06] px-5 pt-4 pb-3 space-y-3 shadow-cinema">
                    <div className="flex items-center justify-between">
                        <div className="flex gap-5 text-[11px] font-mono">
                            <span className="flex items-center gap-1.5 text-teal"><IconDown /><span className="font-black">{formatSpeed(totalDownloadSpeed)}</span></span>
                            <span className="flex items-center gap-1.5 text-accent"><IconUp /><span className="font-black">{formatSpeed(totalUploadSpeed)}</span></span>
                        </div>
                        <span className="text-[9px] text-text-3 uppercase tracking-widest">last 60 s</span>
                    </div>
                    <canvas ref={canvasRef} width={800} height={52}
                        className="w-full rounded-lg block"
                        style={{ height: '52px', willChange: 'contents' }}
                    />
                    {diskInfo && (() => {
                        const usedPct = diskInfo.total > 0 ? (diskInfo.used / diskInfo.total) * 100 : 0;
                        const freePct = 100 - usedPct;
                        const fmtD = (b: number) => { const k = 1024, u = ["B", "KB", "MB", "GB", "TB"]; const i = Math.floor(Math.log(Math.max(b, 1)) / Math.log(k)); return (b / Math.pow(k, i)).toFixed(1) + " " + u[i]; };
                        return (
                            <div className="space-y-1.5">
                                <div className="flex justify-between text-[10px] text-text-3">
                                    <span>Disk · <span className="text-text-2 font-mono">{fmtD(diskInfo.used)}</span> used</span>
                                    <span><span className={`font-mono font-bold ${freePct < 10 ? 'text-danger' : freePct < 25 ? 'text-warning' : 'text-teal'}`}>{fmtD(diskInfo.free)}</span> free of {fmtD(diskInfo.total)}</span>
                                </div>
                                <div className="h-1.5 bg-white/[0.06] rounded-full overflow-hidden">
                                    <div className={`h-full rounded-full transition-all duration-700 ${usedPct > 90 ? 'bg-danger' : usedPct > 75 ? 'bg-warning' : 'bg-accent'}`}
                                        style={{ width: `${Math.min(usedPct, 100)}%` }} />
                                </div>
                            </div>
                        );
                    })()}
                </div>
            )}

            {/* Tabs */}
            <div className="rounded-2xl border border-white/[0.06] bg-surface p-2 sm:p-3 flex gap-2 flex-wrap shadow-cinema">
                {TABS.map(tab => (
                    <button key={tab.id} onClick={() => setActiveTab(tab.id)}
                        className={`flex items-center gap-2 px-4 py-2 rounded-xl border text-xs font-bold transition-all ${activeTab === tab.id ? tab.activeClass : `bg-elevated border-white/[0.06] ${tab.color} hover:bg-white/[0.05]`}`}>
                        {tab.label}
                        {counts[tab.id] > 0 && (
                            <span className={`px-1.5 py-0.5 rounded-md text-[10px] font-mono ${activeTab === tab.id ? "bg-black/25" : "bg-white/[0.06] text-text-3"}`}>{counts[tab.id]}</span>
                        )}
                    </button>
                ))}
            </div>

            {/* Continue Watching */}
            {continueList.length > 0 && (
                <div className="rounded-2xl border border-white/[0.06] bg-surface p-4 shadow-cinema">
                    <div className="flex items-center gap-2 mb-3">
                        <svg className="w-4 h-4 text-accent" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></svg>
                        <h2 className="text-sm font-bold text-text-1">Continue Watching</h2>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                        {continueList.slice(0, 6).map((e) => {
                            const pct = e.dur > 0 ? Math.min(100, Math.round((e.t / e.dur) * 100)) : 0;
                            return (
                                <div
                                    key={`${e.infoHash}:${e.fileIdx}`}
                                    onClick={() => setStreamTarget({ infoHash: e.infoHash, name: e.title, fileIdx: e.fileIdx, time: e.t })}
                                    className="relative text-left rounded-xl border border-white/[0.06] bg-white/[0.02] hover:bg-white/[0.05] hover:border-accent/30 transition-all p-3 group cursor-pointer"
                                >
                                    <button
                                        onClick={(ev) => { ev.stopPropagation(); removeProgress(e.infoHash, e.fileIdx); setContinueList(listContinueWatching()); }}
                                        title="Remove from Continue Watching"
                                        className="absolute top-2 right-2 w-6 h-6 rounded-md flex items-center justify-center text-text-3 hover:text-text-1 hover:bg-white/[0.1] opacity-0 group-hover:opacity-100 transition-all z-10"
                                    >
                                        <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M6 6l12 12M18 6 6 18" /></svg>
                                    </button>
                                    <div className="flex items-center gap-2 mb-2 pr-6">
                                        <span className="w-7 h-7 rounded-lg bg-accent/10 text-accent flex items-center justify-center shrink-0 group-hover:bg-accent group-hover:text-black transition-colors">
                                            <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="currentColor"><path d="M7 5l12 7-12 7V5z" /></svg>
                                        </span>
                                        <div className="min-w-0">
                                            <div className="text-[12px] font-semibold text-text-1 truncate">{e.title}</div>
                                            <div className="text-[10px] text-text-3 truncate">{e.name}</div>
                                        </div>
                                    </div>
                                    <div className="h-1 rounded-full bg-white/[0.06] overflow-hidden">
                                        <div className="h-full bg-accent rounded-full" style={{ width: `${pct}%` }} />
                                    </div>
                                    <div className="mt-1 text-[10px] text-text-3 font-mono">{pct}% watched · resume</div>
                                </div>
                            );
                        })}
                    </div>
                </div>
            )}

            {/* Ratio Coach */}
            {torrents.length > 0 && <RatioCoach />}

            {/* Cards */}
            <div className="space-y-3">
                {filtered.length > 0 ? (
                    filtered.map((t) => {
                        const progress = parseFloat(t.progress) || 0;
                        const isCompleted = t.status === "Completed";
                        const isSeeding = t.status === "Seeding";
                        const isPaused = t.status === "Paused";
                        const isDone = isCompleted || isSeeding;
                        const totalDownloaded = t.downloaded || 0;
                        const totalSeeded = t.uploaded || 0;
                        const barFill = isDone ? "bg-teal" : isPaused ? "bg-warning" : "bg-accent";
                        const isActive = t.status === "Downloading" || t.status === "Seeding"; // has real-time files

                        return (
                            <div key={t.infoHash} style={{ contentVisibility: 'auto', containIntrinsicSize: '140px', willChange: 'transform' }} className="group rounded-2xl bg-surface border border-white/[0.06] hover:border-accent/40 transition-all overflow-hidden shadow-cinema">
                                <div className="h-[3px] bg-white/[0.06]">
                                    <div className={`h-full ${barFill} transition-all duration-700`} style={{ width: `${Math.min(progress, 100)}%` }} />
                                </div>
                                <div className="p-5">
                                    <div className="flex items-start justify-between gap-4">
                                        <div className="space-y-2 min-w-0 flex-1">
                                            <div className="flex items-center gap-3">
                                                <span className={`shrink-0 px-2.5 py-1 rounded-lg text-[10px] font-bold uppercase tracking-wider ${isCompleted ? "bg-teal/10 text-teal border border-teal/20" : isSeeding ? "bg-teal/10 text-teal border border-teal/20" : isPaused ? "bg-warning/10 text-warning border border-warning/20" : "bg-accent/10 text-accent border border-accent/20"}`}>{t.status}</span>
                                                <h3 className="text-sm font-bold text-text-1 truncate">{t.name}</h3>
                                            </div>
                                            <div className="flex flex-wrap gap-5 text-[11px] text-text-3">
                                                {!isDone && <span>Peers <span className="text-text-2 font-mono font-bold">{t.numPeers}</span></span>}
                                                <span>Size <span className="text-text-2 font-mono font-bold">{formatSize(t.totalLength)}</span></span>
                                                {!isDone && !isPaused && <span>ETA <span className="text-teal font-mono font-bold">{formatETA(t.timeRemaining)}</span></span>}
                                                <span>Downloaded <span className="text-text-2 font-mono font-bold">{formatSize(totalDownloaded)}</span></span>
                                                {isDone && <span>Seeded <span className="text-text-2 font-mono font-bold">{formatSize(totalSeeded)}</span></span>}
                                                <span className={`font-mono font-bold ${isDone ? "text-teal" : isPaused ? "text-warning" : "text-accent"}`}>{progress.toFixed(1)}%</span>
                                            </div>
                                        </div>
                                        <div className="flex items-center gap-3 shrink-0">
                                            {(t.downloadSpeed > 0 || t.uploadSpeed > 0) && (
                                                <div className="text-right text-[11px] font-mono space-y-0.5">
                                                    {t.downloadSpeed > 0 && <div className="flex items-center justify-end gap-1 text-teal"><IconDown />{formatSpeed(t.downloadSpeed)}</div>}
                                                    {t.uploadSpeed > 0 && <div className="flex items-center justify-end gap-1 text-text-3"><IconUp />{formatSpeed(t.uploadSpeed)}</div>}
                                                </div>
                                            )}
                                            <div className="flex gap-1.5">
                                                {/* Stream in browser — for anything with downloadable data */}
                                                {(isActive || isDone) && (
                                                    <button onClick={() => setStreamTarget({ infoHash: t.infoHash, name: t.name })}
                                                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-bold bg-accent text-black hover:bg-accent-strong transition-all"
                                                        title="Stream in browser">
                                                        <IconPlay /> Stream
                                                    </button>
                                                )}
                                                {/* Files drawer button — only for active downloads */}
                                                {isActive && (
                                                    <button onClick={() => openDrawer(t.infoHash)}
                                                        className="w-8 h-8 rounded-lg flex items-center justify-center bg-elevated text-text-3 hover:text-text-1 hover:bg-white/[0.11] border border-white/[0.06] transition-all"
                                                        title="View files">
                                                        <IconFiles />
                                                    </button>
                                                )}
                                                {isSeeding && (
                                                    <button onClick={() => stopSeeding(t.infoHash)}
                                                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-bold bg-teal/10 text-teal hover:bg-teal/20 border border-teal/20 transition-all">
                                                        <IconStop /> Stop
                                                    </button>
                                                )}
                                                {isCompleted && (
                                                    <button onClick={() => startSeeding(t.infoHash)}
                                                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-bold bg-teal/10 text-teal hover:bg-teal/20 border border-teal/20 transition-all">
                                                        <IconPlay /> Seed
                                                    </button>
                                                )}
                                                {!isDone && (
                                                    <button onClick={() => isPaused ? resumeTorrent(t.infoHash) : pauseTorrent(t.infoHash)}
                                                        className={`w-8 h-8 rounded-lg flex items-center justify-center transition-all ${isPaused ? "bg-teal/10 text-teal hover:bg-teal/20 border border-teal/20" : "bg-warning/10 text-warning hover:bg-warning/20 border border-warning/20"}`}
                                                        title={isPaused ? "Resume" : "Pause"}>
                                                        {isPaused ? <IconPlay /> : <IconPause />}
                                                    </button>
                                                )}
                                                {confirmDelete === t.infoHash ? (
                                                    <div className="flex gap-1">
                                                        <button onClick={() => { deleteWithFiles(t.infoHash); removeProgressByInfoHash(t.infoHash); setContinueList(listContinueWatching()); setConfirmDelete(null); }}
                                                            className="px-2.5 py-1.5 rounded-lg text-[10px] font-bold bg-danger/15 text-danger hover:bg-danger/25 border border-danger/20 transition-all">Yes</button>
                                                        <button onClick={() => setConfirmDelete(null)}
                                                            className="px-2 py-1.5 rounded-lg text-[10px] text-text-3 hover:text-text-1 transition-all">No</button>
                                                    </div>
                                                ) : (
                                                    <button onClick={() => setConfirmDelete(t.infoHash)}
                                                        className="w-8 h-8 rounded-lg flex items-center justify-center bg-elevated text-text-3 hover:text-danger hover:bg-danger/10 border border-white/[0.06] transition-all"
                                                        title="Delete"><IconTrash /></button>
                                                )}
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        );
                    })
                ) : (
                    <div className="py-20 text-center rounded-2xl bg-surface border border-dashed border-white/[0.1]">
                        <div className="flex justify-center mb-3 opacity-25 text-text-3"><EmptyIcon /></div>
                        <p className="text-text-3 text-sm">{activeTab === "All" ? "No downloads yet" : `No ${activeTab.toLowerCase()} torrents`}</p>
                    </div>
                )}
            </div>

            {/* File List Drawer */}
            {drawerHash && (
                <>
                    <div className="fixed inset-0 z-40 bg-black/80 animate-modal-overlay"
                        onClick={e => { if (e.target === e.currentTarget) closeDrawer(); }} />
                    <div className="fixed inset-0 z-50 p-4 flex items-center justify-center overflow-hidden pointer-events-none">
                        <div
                            ref={drawerPanelRef}
                            className="w-full max-w-2xl rounded-2xl bg-surface border border-white/[0.06] shadow-cinema-lg flex flex-col max-h-[85vh] animate-modal-panel transform-gpu pointer-events-auto"
                            style={{ marginTop: `${drawerTop}px` }}
                        >
                            {/* Drawer header */}
                            <div className="flex items-start justify-between p-5 pb-4 border-b border-white/[0.06]">
                                <div className="min-w-0">
                                    <h2 className="text-base font-bold text-text-1">Files</h2>
                                    <p className="text-[11px] text-text-3 truncate mt-0.5">{drawerTorrent?.name || drawerHash}</p>
                                </div>
                                <div className="flex items-center gap-2 shrink-0 ml-3">
                                    {drawerTorrent && (
                                        <span className="text-[10px] font-mono text-text-3">
                                            {drawerFiles.length} file{drawerFiles.length !== 1 ? "s" : ""}
                                        </span>
                                    )}
                                    <button onClick={closeDrawer}
                                        className="w-7 h-7 rounded-lg flex items-center justify-center text-text-3 hover:text-text-1 hover:bg-white/[0.06] transition-all">
                                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M6 6l12 12M18 6L6 18" /></svg>
                                    </button>
                                </div>
                            </div>

                            {/* Overall progress bar */}
                            {drawerTorrent && (
                                <div className="px-5 py-3 border-b border-white/[0.04]">
                                    <div className="flex items-center justify-between text-[11px] text-text-3 mb-1.5">
                                        <span>Overall progress</span>
                                        <span className={`font-mono font-bold ${drawerTorrent.status === "Downloading" ? "text-accent" : "text-teal"}`}>
                                            {parseFloat(drawerTorrent.progress).toFixed(1)}%
                                        </span>
                                    </div>
                                    <div className="h-1.5 bg-white/[0.06] rounded-full overflow-hidden">
                                        <div className={`h-full rounded-full transition-all duration-700 ${drawerTorrent.status === "Downloading" ? "bg-accent" : "bg-teal"}`}
                                            style={{ width: `${Math.min(parseFloat(drawerTorrent.progress), 100)}%` }} />
                                    </div>
                                    {!canControlFiles && (
                                        <p className="mt-2 text-[10px] text-text-3/70">File controls are available only while this torrent is downloading.</p>
                                    )}
                                </div>
                            )}

                            {/* File list */}
                            <div className="flex-1 overflow-y-auto overscroll-contain p-4 space-y-1.5 [contain:content] [scrollbar-gutter:stable]">
                                {drawerLoading && drawerFiles.length === 0 ? (
                                    <div className="py-10 text-center text-text-3 text-sm animate-pulse">Loading file list...</div>
                                ) : drawerFiles.length === 0 ? (
                                    <div className="py-10 text-center space-y-2">
                                        <p className="text-text-3/40 text-sm">No file info yet</p>
                                        <p className="text-text-3/25 text-[11px]">The torrent may still be fetching metadata — try again in a moment</p>
                                    </div>
                                ) : (
                                    drawerFiles.map((f) => {
                                        const pct = Math.min(f.progress * 100, 100);
                                        const isDone = pct >= 99.9;
                                        const isPaused = f.paused === true || f.selected === false;
                                        const isBusy = !!drawerActionByPath[f.path];
                                        const canToggle = canControlFiles && !isBusy && !isDone;
                                        return (
                                            <div key={f.path} className="px-4 py-3 rounded-xl bg-elevated border border-white/[0.06] transition-colors duration-200">
                                                <div className="flex items-center justify-between gap-3 mb-2">
                                                    <span className="text-xs text-text-1 font-medium truncate flex-1">{f.name}</span>
                                                    <div className="grid grid-cols-[28px_56px_72px] items-center gap-2 shrink-0 text-[10px] font-mono text-text-3">
                                                        <button
                                                            onClick={() => toggleDrawerFile(f)}
                                                            disabled={!canToggle}
                                                            title={isPaused ? "Resume this file" : "Pause this file"}
                                                            className={`w-7 h-7 rounded-lg flex items-center justify-center border transition-all ${isPaused
                                                                ? "bg-teal/10 text-teal border-teal/20 hover:bg-teal/20"
                                                                : "bg-warning/10 text-warning border-warning/20 hover:bg-warning/20"
                                                                } ${!canToggle ? "opacity-40 cursor-not-allowed hover:bg-transparent" : ""}`}
                                                        >
                                                            {isPaused ? <IconPlay /> : <IconPause />}
                                                        </button>
                                                        <span className="text-right">{(pct).toFixed(1)}%</span>
                                                        <span className="text-right">{formatSize(f.length)}</span>
                                                    </div>
                                                </div>
                                                <div className="h-1 bg-white/[0.06] rounded-full overflow-hidden">
                                                    <div className={`h-full rounded-full ${isPaused ? "bg-warning" : isDone ? "bg-teal" : "bg-accent"}`}
                                                        style={{ width: `${pct}%` }} />
                                                </div>
                                            </div>
                                        );
                                    })
                                )}
                            </div>
                        </div>
                    </div>
                </>
            )}

            {streamTarget && (
                <StreamPlayer
                    infoHash={streamTarget.infoHash}
                    name={streamTarget.name}
                    initialFileIdx={streamTarget.fileIdx}
                    initialTime={streamTarget.time}
                    onClose={() => { setStreamTarget(null); setContinueList(listContinueWatching()); }}
                />
            )}
        </div>
    );
}