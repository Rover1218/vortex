"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { getProgress, saveProgress } from "@/lib/watchProgress";
import { useTorrents } from "@/context/TorrentContext";

const API_BASE = process.env.NEXT_PUBLIC_ENGINE_URL || "http://localhost:3001";

interface StreamPlayerProps {
    infoHash: string;
    name: string;
    onClose: () => void;
    initialFileIdx?: number;
    initialTime?: number;
    ephemeral?: boolean; // Quick Watch: don't save progress; stop & purge on close
}

type Phase = "loading" | "ready" | "error";

interface VideoFile {
    idx: number;
    name: string;
    length: number;
    ext: string;
    browserFriendly: boolean;
}

interface SubTrack { id: string; label: string; lang: string; }

function formatBytes(bytes: number) {
    if (!bytes || bytes <= 0) return "";
    const k = 1024;
    const units = ["B", "KB", "MB", "GB", "TB"];
    const i = Math.min(units.length - 1, Math.floor(Math.log(bytes) / Math.log(k)));
    return `${(bytes / Math.pow(k, i)).toFixed(1)} ${units[i]}`;
}

function fmtTime(s: number) {
    s = Math.max(0, Math.floor(s || 0));
    const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60;
    const pad = (n: number) => String(n).padStart(2, "0");
    return h > 0 ? `${h}:${pad(m)}:${pad(sec)}` : `${m}:${pad(sec)}`;
}

export default function StreamPlayer({ infoHash, name, onClose, initialFileIdx, initialTime, ephemeral }: StreamPlayerProps) {
    const { torrents } = useTorrents();
    const [phase, setPhase] = useState<Phase>("loading");
    const [source, setSource] = useState<string>("");
    const [files, setFiles] = useState<VideoFile[]>([]);
    const [selectedIdx, setSelectedIdx] = useState<number | null>(initialFileIdx ?? null);
    const [errorMsg, setErrorMsg] = useState<string>("");
    const [mounted, setMounted] = useState(false);
    const [transcodeAvailable, setTranscodeAvailable] = useState(false);
    const [transcode, setTranscode] = useState(false);
    const [subs, setSubs] = useState<SubTrack[]>([]);
    const [subTrack, setSubTrack] = useState<string | null>(null);
    const [subsOpen, setSubsOpen] = useState(false);
    // Audio tracks (dual-audio). Selecting a non-default track forces a remux.
    const [audioTracks, setAudioTracks] = useState<{ idx: number; lang: string; label: string }[]>([]);
    const [audioSel, setAudioSel] = useState<number | null>(null); // global stream idx, null = default
    const [audioOpen, setAudioOpen] = useState(false);
    const [videoCodec, setVideoCodec] = useState("");

    // Transcode-mode custom controls / virtual timeline.
    const [duration, setDuration] = useState(0);
    const [baseOffset, setBaseOffset] = useState(0); // transcode start time
    const [curTime, setCurTime] = useState(0);       // video.currentTime within current segment
    const [playing, setPlaying] = useState(true);
    const [muted, setMuted] = useState(false);
    const [volume, setVolume] = useState(1);
    const [scrub, setScrub] = useState<number | null>(null);
    const [controlsVisible, setControlsVisible] = useState(true);

    const cancelledRef = useRef(false);
    const hideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const videoRef = useRef<HTMLVideoElement>(null);
    const stageRef = useRef<HTMLDivElement>(null);
    const lastSaveRef = useRef(0);
    const resumeRef = useRef<number>(0);          // seconds to resume to for current file
    const resumeAppliedRef = useRef(false);
    const initialTimeRef = useRef<number | undefined>(initialTime);

    useEffect(() => { setMounted(true); }, []);
    // Show controls when paused; start the auto-hide countdown when playing.
    useEffect(() => {
        if (hideTimerRef.current) clearTimeout(hideTimerRef.current);
        if (!playing) { setControlsVisible(true); return; }
        hideTimerRef.current = setTimeout(() => setControlsVisible(false), 3000);
        return () => { if (hideTimerRef.current) clearTimeout(hideTimerRef.current); };
    }, [playing]);
    // Switching file resets transcode/subtitle/timeline state.
    useEffect(() => {
        setTranscode(false); setSubTrack(null); setSubs([]); setSubsOpen(false);
        setAudioSel(null); setAudioOpen(false); setAudioTracks([]);
        setBaseOffset(0); setCurTime(0); setDuration(0);
        resumeAppliedRef.current = false;
    }, [selectedIdx]);

    // Poll /info until a playable file is found.
    useEffect(() => {
        cancelledRef.current = false;
        let attempts = 0;
        let lastReason = "";
        const maxAttempts = 20;
        const poll = async () => {
            if (cancelledRef.current) return;
            attempts++;
            try {
                const res = await fetch(`${API_BASE}/api/stream/${infoHash}/info`, { cache: "no-store" });
                const info = await res.json();
                if (cancelledRef.current) return;
                lastReason = info?.reason || lastReason;
                if (info?.streamable && Array.isArray(info.files) && info.files.length) {
                    setFiles(info.files);
                    setSelectedIdx(prev => (prev == null ? (info.defaultIdx ?? 0) : prev));
                    setTranscodeAvailable(!!info.transcodeAvailable);
                    setSource(info.source || "");
                    setPhase("ready");
                    return;
                }
                if (info?.reason === "no-video") { setErrorMsg("No playable video file was found."); setPhase("error"); return; }
            } catch { /* retry */ }
            if (attempts >= maxAttempts) {
                setErrorMsg(lastReason === "not-active"
                    ? "This title isn't available to play — it may have been removed from Downloads. Try downloading it again."
                    : "Timed out waiting for the stream. The download may have no seeders yet.");
                setPhase("error");
                return;
            }
            setTimeout(poll, 2000);
        };
        poll();
        return () => { cancelledRef.current = true; };
    }, [infoHash]);

    // Determine the resume point for the selected file.
    useEffect(() => {
        if (phase !== "ready" || selectedIdx == null) return;
        let t = 0;
        if (initialFileIdx != null && selectedIdx === initialFileIdx && initialTimeRef.current != null) {
            t = initialTimeRef.current;
            initialTimeRef.current = undefined; // consume once
        } else {
            const saved = getProgress(infoHash, selectedIdx);
            if (saved && saved.t > 10) t = saved.t;
        }
        resumeRef.current = t;
        resumeAppliedRef.current = false;
    }, [phase, selectedIdx, infoHash, initialFileIdx]);

    // Load subtitle tracks for the selected file.
    useEffect(() => {
        if (phase !== "ready" || selectedIdx == null) return;
        let cancelled = false;
        fetch(`${API_BASE}/api/stream/${infoHash}/subs?fileIdx=${selectedIdx}`, { cache: "no-store" })
            .then(r => r.json())
            .then(d => {
                if (cancelled) return;
                setSubs(Array.isArray(d.tracks) ? d.tracks : []);
                setAudioTracks(Array.isArray(d.audio) ? d.audio : []);
                setVideoCodec(d.videoCodec || "");
            })
            .catch(() => { if (!cancelled) { setSubs([]); setAudioTracks([]); } });
        return () => { cancelled = true; };
    }, [phase, selectedIdx, infoHash]);

    // On entering transcode mode: resume from the saved point and fetch duration.
    useEffect(() => {
        if (!transcode) { setBaseOffset(0); setCurTime(0); return; }
        if (!resumeAppliedRef.current && resumeRef.current > 0) {
            setBaseOffset(resumeRef.current);
            resumeAppliedRef.current = true;
        }
        let cancelled = false;
        fetch(`${API_BASE}/api/stream/${infoHash}/probe?fileIdx=${selectedIdx ?? 0}`, { cache: "no-store" })
            .then(r => r.json())
            .then(d => { if (!cancelled) setDuration(d.duration || 0); })
            .catch(() => { });
        return () => { cancelled = true; };
    }, [transcode, selectedIdx, infoHash]);

    // Lock background scroll (page scroller is <html>).
    useEffect(() => {
        const html = document.documentElement;
        const prevHtml = html.style.overflow, prevBody = document.body.style.overflow;
        html.style.overflow = "hidden"; document.body.style.overflow = "hidden";
        return () => { html.style.overflow = prevHtml; document.body.style.overflow = prevBody; };
    }, []);

    // Toggle subtitle track in place (no remount).
    useEffect(() => {
        const v = videoRef.current;
        if (!v || !v.textTracks) return;
        for (let i = 0; i < v.textTracks.length; i++) v.textTracks[i].mode = subTrack ? "showing" : "disabled";
    }, [subTrack, phase, selectedIdx, transcode, baseOffset, audioSel]);

    const selected = files.find(f => f.idx === selectedIdx) || null;

    // CC (embedded subs read from the file) and "Open in player" (launches the local
    // file in VLC) only work once the movie is FULLY on disk. While Stream is still
    // downloading — or in ephemeral Quick Watch — the file isn't complete, so hide them.
    const liveTorrent = torrents.find(t => t.infoHash === infoHash);
    const fileReady = !ephemeral && (
        source === "disk" ||
        (!!liveTorrent && (liveTorrent.status === "Completed" || liveTorrent.status === "Seeding" || parseFloat(liveTorrent.progress) >= 100))
    );

    const q = selectedIdx != null ? `?fileIdx=${selectedIdx}` : "";
    const streamUrl = `${API_BASE}/api/stream/${infoHash}${q}`;
    const isH264 = /h264|avc/i.test(videoCodec);
    // Picking a non-default audio track is done via a (fast, video-copy when H.264) remux.
    const audioQ = audioSel != null ? `&audio=${audioSel}${isH264 ? "&vcopy=1" : ""}` : "";
    const transcodeUrl = `${API_BASE}/api/transcode/${infoHash}?fileIdx=${selectedIdx ?? 0}&t=${Math.floor(baseOffset)}${audioQ}`;
    const videoSrc = transcode ? transcodeUrl : streamUrl;
    // When transcoding from a seek point, the video timeline resets to 0 — so shift
    // the subtitle extraction by the same offset to keep cues in sync.
    const subUrl = subTrack
        ? `${API_BASE}/api/stream/${infoHash}/sub?fileIdx=${selectedIdx ?? 0}&track=${encodeURIComponent(subTrack)}${transcode && baseOffset > 0 ? `&t=${Math.floor(baseOffset)}` : ""}`
        : null;
    const needsConvert = !!(selected && !selected.browserFriendly);
    const isMulti = files.length > 1;
    const absTime = (transcode ? baseOffset : 0) + curTime;

    // Persist playback position (throttled).
    const persist = (force = false) => {
        if (ephemeral) return; // Quick Watch is throwaway — no resume point saved
        const v = videoRef.current;
        if (!v || selectedIdx == null) return;
        const abs = (transcode ? baseOffset : 0) + (v.currentTime || 0);
        const dur = transcode ? duration : (v.duration || 0);
        const now = Date.now();
        if (!force && now - lastSaveRef.current < 4000) return;
        lastSaveRef.current = now;
        saveProgress({ infoHash, fileIdx: selectedIdx, name: selected?.name || name, title: name, t: abs, dur, updatedAt: now });
    };

    const handleClose = () => {
        if (ephemeral) {
            // Quick Watch is throwaway — stop & purge the stream on the real close.
            try { fetch(`${API_BASE}/api/stream-stop/${infoHash}`, { method: "POST", keepalive: true }); } catch { /* best effort */ }
        } else {
            persist(true);
        }
        onClose();
    };

    // Keyboard shortcuts: Space = play/pause · ←/→ = seek 5s · F = fullscreen · M = mute · Esc = close.
    useEffect(() => {
        const onKey = (e: KeyboardEvent) => {
            const tag = (e.target as HTMLElement | null)?.tagName;
            if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return; // don't hijack typing
            switch (e.key) {
                case "Escape": handleClose(); break;
                case " ": case "Spacebar": e.preventDefault(); togglePlay(); break;
                case "ArrowLeft": e.preventDefault(); nudge(-5); break;
                case "ArrowRight": e.preventDefault(); nudge(5); break;
                case "f": case "F": e.preventDefault(); toggleFullscreen(); break;
                case "m": case "M": toggleMute(); break;
                default: break;
            }
        };
        window.addEventListener("keydown", onKey);
        return () => window.removeEventListener("keydown", onKey);
    });

    const openInPlayer = async () => {
        try {
            await fetch(`${API_BASE}/api/stream/${infoHash}/open`, {
                method: "POST", headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ fileIdx: selectedIdx ?? 0 }),
            });
        } catch { /* best effort */ }
    };

    // Direct-mode resume: seek once metadata is known.
    const onLoadedMetadata = () => {
        const v = videoRef.current;
        if (!v) return;
        if (!transcode) {
            if (v.duration && isFinite(v.duration)) setDuration(v.duration);
            if (!resumeAppliedRef.current && resumeRef.current > 0 && resumeRef.current < (v.duration || Infinity)) {
                v.currentTime = resumeRef.current;
                resumeAppliedRef.current = true;
            }
        }
    };

    // Transcode controls.
    const togglePlay = () => { const v = videoRef.current; if (!v) return; if (v.paused) v.play().catch(() => { }); else v.pause(); };
    const seekTo = (t: number) => {
        const clamped = Math.max(0, Math.min(duration || t, t));
        setScrub(null);
        setCurTime(0);
        setBaseOffset(clamped); // src key includes baseOffset → reloads transcode from here
        lastSaveRef.current = 0; // allow immediate save at new spot
    };
    const skip = (delta: number) => seekTo(absTime + delta);
    // Relative seek for keyboard shortcuts. In transcode mode native currentTime seeking
    // doesn't work on the live ffmpeg stream, so reuse skip() (reloads from a new offset)
    // — same mechanism as the −10s/+30s buttons. In normal mode, seek natively.
    const nudge = (delta: number) => {
        if (transcode) { skip(delta); return; }
        const v = videoRef.current;
        if (!v) return;
        const dur = v.duration && isFinite(v.duration) ? v.duration : Infinity;
        v.currentTime = Math.max(0, Math.min(dur, (v.currentTime || 0) + delta));
    };
    const toggleFullscreen = () => {
        const el = stageRef.current;
        if (!el) return;
        if (document.fullscreenElement) document.exitFullscreen();
        else el.requestFullscreen?.();
    };
    const toggleMute = () => { const v = videoRef.current; if (!v) return; v.muted = !v.muted; setMuted(v.muted); };

    // Auto-hide controls (and the cursor) after a few seconds of mouse inactivity
    // while playing — needed for fullscreen, where the bar otherwise sits over the
    // video forever. Any pointer movement brings them back; paused always shows them.
    const revealControls = () => {
        setControlsVisible(true);
        if (hideTimerRef.current) clearTimeout(hideTimerRef.current);
        if (playing) hideTimerRef.current = setTimeout(() => setControlsVisible(false), 3000);
    };

    if (!mounted) return null;

    return createPortal(
        <div
            className="fixed inset-0 z-[300] flex items-center justify-center bg-black/85 backdrop-blur-sm p-4"
            onClick={(e) => { if (e.target === e.currentTarget) handleClose(); }}
        >
            <div className="relative w-full max-w-6xl rounded-2xl overflow-hidden border border-white/[0.08] bg-surface shadow-cinema-lg">
                <div className="flex items-center justify-between gap-4 px-4 py-3 border-b border-white/[0.06]">
                    <div className="min-w-0">
                        <h3 className="text-sm font-bold text-text-1 truncate">{name}</h3>
                        {selected && isMulti && <p className="text-[11px] text-text-3 truncate">{selected.name}</p>}
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                        {phase === "ready" && audioTracks.length > 1 && (
                            <div className="relative">
                                <button
                                    onClick={() => setAudioOpen(o => !o)}
                                    className={`flex items-center gap-1.5 px-3 h-8 rounded-lg border text-xs font-semibold transition-all ${audioSel != null ? "bg-accent/15 border-accent/30 text-accent" : "bg-white/[0.05] border-white/[0.08] text-text-2 hover:text-text-1 hover:bg-white/[0.12]"}`}
                                    title="Audio track"
                                >
                                    <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M3 10v4M7 7v10M11 4v16M15 8v8M19 11v2" /></svg>
                                    Audio
                                </button>
                                {audioOpen && (
                                    <div className="absolute right-0 top-full mt-2 w-56 rounded-xl border border-white/[0.08] bg-elevated shadow-cinema z-10 overflow-hidden py-1">
                                        <button onClick={() => { setAudioSel(null); setTranscode(false); setAudioOpen(false); }} className={`w-full text-left px-3 py-2 text-xs transition-colors hover:bg-white/[0.05] ${audioSel == null ? "text-accent font-semibold" : "text-text-1"}`}>Default{audioTracks[0] ? ` · ${audioTracks[0].label}` : ""}</button>
                                        {audioTracks.map(a => (
                                            <button key={a.idx} onClick={() => { setAudioSel(a.idx); setTranscode(true); setAudioOpen(false); }} className={`w-full text-left px-3 py-2 text-xs truncate transition-colors hover:bg-white/[0.05] ${audioSel === a.idx ? "text-accent font-semibold" : "text-text-1"}`} title={a.label}>{a.label}</button>
                                        ))}
                                    </div>
                                )}
                            </div>
                        )}
                        {phase === "ready" && fileReady && (
                            <div className="relative">
                                <button
                                    onClick={() => setSubsOpen(o => !o)}
                                    className={`flex items-center gap-1.5 px-3 h-8 rounded-lg border text-xs font-semibold transition-all ${subTrack ? "bg-accent/15 border-accent/30 text-accent" : "bg-white/[0.05] border-white/[0.08] text-text-2 hover:text-text-1 hover:bg-white/[0.12]"}`}
                                    title="Subtitles"
                                >
                                    <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="5" width="18" height="14" rx="2" /><path d="M7 15h4M15 15h2M7 11h2M13 11h4" /></svg>
                                    CC
                                </button>
                                {subsOpen && (
                                    <div className="absolute right-0 top-full mt-2 w-56 rounded-xl border border-white/[0.08] bg-elevated shadow-cinema z-10 overflow-hidden py-1">
                                        <button onClick={() => { setSubTrack(null); setSubsOpen(false); }} className={`w-full text-left px-3 py-2 text-xs transition-colors hover:bg-white/[0.05] ${!subTrack ? "text-accent font-semibold" : "text-text-2"}`}>Off</button>
                                        {subs.length === 0 ? (
                                            <div className="px-3 py-2 text-[11px] text-text-3">No subtitles found</div>
                                        ) : subs.map(s => (
                                            <button key={s.id} onClick={() => { setSubTrack(s.id); setSubsOpen(false); }} className={`w-full text-left px-3 py-2 text-xs truncate transition-colors hover:bg-white/[0.05] ${subTrack === s.id ? "text-accent font-semibold" : "text-text-1"}`} title={s.label}>{s.label}</button>
                                        ))}
                                    </div>
                                )}
                            </div>
                        )}
                        {fileReady && (
                            <button onClick={openInPlayer} className="flex items-center gap-1.5 px-3 h-8 rounded-lg bg-white/[0.05] text-text-2 hover:text-text-1 hover:bg-white/[0.12] border border-white/[0.08] text-xs font-semibold transition-all" title="Open this file in your default player (e.g. VLC)">
                                <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M15 3h6v6M10 14 21 3M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" /></svg>
                                Open in player
                            </button>
                        )}
                        <button onClick={handleClose} className="w-8 h-8 rounded-lg flex items-center justify-center bg-white/[0.05] text-text-3 hover:text-text-1 hover:bg-white/[0.12] border border-white/[0.08] transition-all" title="Close (Esc)">✕</button>
                    </div>
                </div>

                {transcode ? (
                    <div className="px-4 py-2 text-[12px] text-accent bg-accent/10 border-b border-accent/15">
                        {audioSel != null && isH264
                            ? "Switching audio track (re-muxing)… first frames may take a moment. Use the bar below to seek."
                            : "Converting to browser-friendly H.264… first frames may take a few seconds. Use the bar below to seek."}
                    </div>
                ) : needsConvert && (
                    <div className="px-4 py-2 text-[12px] text-warning bg-warning/10 border-b border-warning/15 flex items-center justify-between gap-3 flex-wrap">
                        <span>This file is {selected?.ext || "an unsupported format"} — browsers can&apos;t decode it (audio only / black screen).</span>
                        {transcodeAvailable && (
                            <button onClick={() => setTranscode(true)} className="shrink-0 px-3 py-1.5 rounded-lg bg-accent text-black text-[11px] font-bold hover:bg-accent-strong transition-colors">▶ Play in browser (convert)</button>
                        )}
                    </div>
                )}

                {phase === "loading" && (
                    <div className="flex flex-col items-center justify-center gap-3 py-20 text-text-2">
                        <div className="h-8 w-8 rounded-full border-2 border-white/15 border-t-accent animate-spin" />
                        <span className="text-sm">Preparing stream — connecting to peers…</span>
                    </div>
                )}

                {phase === "error" && (
                    <div className="flex flex-col items-center justify-center gap-3 py-20 px-6 text-center">
                        <span className="text-sm text-danger">{errorMsg}</span>
                        <button onClick={handleClose} className="btn-ghost">Close</button>
                    </div>
                )}

                {phase === "ready" && (
                    <div className="flex flex-col md:flex-row">
                        <div
                            ref={stageRef}
                            onMouseMove={revealControls}
                            onMouseLeave={() => { if (playing) setControlsVisible(false); }}
                            onTouchStart={revealControls}
                            style={{ cursor: controlsVisible ? undefined : "none" }}
                            className="player-stage relative w-full min-w-0 md:flex-1 bg-black"
                        >
                            <video
                                ref={videoRef}
                                key={`${selectedIdx ?? "default"}-${transcode ? `t${Math.floor(baseOffset)}` : "d"}-a${audioSel ?? "def"}`}
                                src={videoSrc}
                                controls={false}
                                autoPlay
                                crossOrigin="anonymous"
                                controlsList="nodownload noremoteplayback"
                                onContextMenu={(e) => e.preventDefault()}
                                onClick={togglePlay}
                                onLoadedMetadata={onLoadedMetadata}
                                onTimeUpdate={() => { const v = videoRef.current; if (v) { setCurTime(v.currentTime || 0); persist(); } }}
                                onPlay={() => setPlaying(true)}
                                onPause={() => { setPlaying(false); persist(true); }}
                                className="w-full max-h-[72vh] block"
                            >
                                {subUrl && <track kind="subtitles" src={subUrl} srcLang="en" label="Subtitles" default />}
                                Your browser cannot play this video.
                            </video>

                            {/* Custom controls for transcode mode (native seek can't work on a live stream) */}
                            {transcode && (
                                <div className={`absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/85 to-transparent px-3 pt-8 pb-3 transition-opacity duration-300 ${controlsVisible ? "opacity-100" : "opacity-0 pointer-events-none"}`}>
                                    <input
                                        type="range" min={0} max={duration || 0} step={1}
                                        value={scrub ?? Math.min(absTime, duration || absTime)}
                                        onChange={(e) => setScrub(Number(e.target.value))}
                                        onMouseUp={(e) => seekTo(Number((e.target as HTMLInputElement).value))}
                                        onTouchEnd={(e) => seekTo(Number((e.target as HTMLInputElement).value))}
                                        disabled={!duration}
                                        style={{ accentColor: "#f5a623" }}
                                        className="w-full h-1.5 cursor-pointer disabled:opacity-40"
                                    />
                                    <div className="flex items-center gap-3 mt-2 text-text-1">
                                        <button onClick={togglePlay} className="w-9 h-9 rounded-lg bg-white/10 hover:bg-white/20 flex items-center justify-center" title={playing ? "Pause" : "Play"}>
                                            {playing
                                                ? <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="5" width="4" height="14" rx="1" /><rect x="14" y="5" width="4" height="14" rx="1" /></svg>
                                                : <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor"><path d="M7 5l12 7-12 7V5z" /></svg>}
                                        </button>
                                        <button onClick={() => skip(-10)} className="px-2 h-9 rounded-lg bg-white/10 hover:bg-white/20 text-xs font-semibold" title="Back 10s">−10s</button>
                                        <button onClick={() => skip(30)} className="px-2 h-9 rounded-lg bg-white/10 hover:bg-white/20 text-xs font-semibold" title="Forward 30s">+30s</button>
                                        <span className="text-[12px] font-mono text-text-2">
                                            {fmtTime(scrub ?? absTime)} {duration ? `/ ${fmtTime(duration)}` : ""}
                                        </span>
                                        <div className="ml-auto flex items-center gap-2">
                                            <button onClick={toggleMute} className="w-9 h-9 rounded-lg bg-white/10 hover:bg-white/20 flex items-center justify-center" title={muted ? "Unmute" : "Mute"}>
                                                {muted
                                                    ? <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M11 5 6 9H2v6h4l5 4V5zM23 9l-6 6M17 9l6 6" /></svg>
                                                    : <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M11 5 6 9H2v6h4l5 4V5zM15.5 8.5a5 5 0 0 1 0 7M19 5a9 9 0 0 1 0 14" /></svg>}
                                            </button>
                                            <button onClick={toggleFullscreen} className="w-9 h-9 rounded-lg bg-white/10 hover:bg-white/20 flex items-center justify-center" title="Fullscreen">
                                                <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M8 3H5a2 2 0 0 0-2 2v3M21 8V5a2 2 0 0 0-2-2h-3M16 21h3a2 2 0 0 0 2-2v-3M3 16v3a2 2 0 0 0 2 2h3" /></svg>
                                            </button>
                                        </div>
                                    </div>
                                </div>
                            )}

                            {/* Custom controls for normal (direct) playback. */}
                            {!transcode && (
                                <div className={`absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/85 via-black/40 to-transparent px-3 pt-10 pb-3 transition-opacity duration-300 ${controlsVisible ? "opacity-100" : "opacity-0 pointer-events-none"}`}>
                                    <input
                                        type="range" min={0} max={duration || 0} step="any"
                                        value={Math.min(curTime, duration || curTime)}
                                        onChange={(e) => { const v = videoRef.current; const val = Number(e.target.value); if (v) { v.currentTime = val; setCurTime(val); } }}
                                        disabled={!duration}
                                        style={{ accentColor: "#f5a623" }}
                                        className="w-full h-1.5 cursor-pointer disabled:opacity-40"
                                    />
                                    <div className="flex items-center gap-3 mt-2 text-text-1">
                                        <button onClick={togglePlay} className="w-9 h-9 rounded-lg bg-white/10 hover:bg-white/20 flex items-center justify-center" title={playing ? "Pause (space)" : "Play (space)"}>
                                            {playing
                                                ? <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="5" width="4" height="14" rx="1" /><rect x="14" y="5" width="4" height="14" rx="1" /></svg>
                                                : <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor"><path d="M7 5l12 7-12 7V5z" /></svg>}
                                        </button>
                                        <button onClick={() => nudge(-5)} className="px-2 h-9 rounded-lg bg-white/10 hover:bg-white/20 text-xs font-semibold" title="Back 5s (←)">−5s</button>
                                        <button onClick={() => nudge(5)} className="px-2 h-9 rounded-lg bg-white/10 hover:bg-white/20 text-xs font-semibold" title="Forward 5s (→)">+5s</button>
                                        <span className="text-[12px] font-mono text-text-2">
                                            {fmtTime(curTime)} {duration ? `/ ${fmtTime(duration)}` : ""}
                                        </span>
                                        <div className="ml-auto flex items-center gap-2">
                                            <div className="flex items-center gap-1.5">
                                                <button onClick={toggleMute} className="w-9 h-9 rounded-lg bg-white/10 hover:bg-white/20 flex items-center justify-center" title={muted ? "Unmute (m)" : "Mute (m)"}>
                                                    {muted
                                                        ? <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M11 5 6 9H2v6h4l5 4V5zM23 9l-6 6M17 9l6 6" /></svg>
                                                        : <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M11 5 6 9H2v6h4l5 4V5zM15.5 8.5a5 5 0 0 1 0 7M19 5a9 9 0 0 1 0 14" /></svg>}
                                                </button>
                                                <input
                                                    type="range" min={0} max={1} step={0.05}
                                                    value={muted ? 0 : volume}
                                                    onChange={(e) => { const v = videoRef.current; const val = Number(e.target.value); if (v) { v.volume = val; v.muted = val === 0; setVolume(val); setMuted(val === 0); } }}
                                                    style={{ accentColor: "#f5a623" }}
                                                    className="w-16 h-1 cursor-pointer"
                                                    title="Volume"
                                                />
                                            </div>
                                            <button onClick={toggleFullscreen} className="w-9 h-9 rounded-lg bg-white/10 hover:bg-white/20 flex items-center justify-center" title="Fullscreen (f)">
                                                <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M8 3H5a2 2 0 0 0-2 2v3M21 8V5a2 2 0 0 0-2-2h-3M16 21h3a2 2 0 0 0 2-2v-3M3 16v3a2 2 0 0 0 2 2h3" /></svg>
                                            </button>
                                        </div>
                                    </div>
                                </div>
                            )}
                        </div>

                        {isMulti && (
                            <div className="md:w-64 shrink-0 border-t md:border-t-0 md:border-l border-white/[0.06] bg-base/40 max-h-[40vh] md:max-h-[72vh] overflow-y-auto">
                                <div className="px-3 py-2 text-[10px] font-bold uppercase tracking-widest text-text-3 sticky top-0 bg-surface/95 border-b border-white/[0.05]">Episodes / Files ({files.length})</div>
                                <div className="p-2 space-y-1">
                                    {files.map((f) => (
                                        <button key={f.idx} onClick={() => setSelectedIdx(f.idx)} title={f.name}
                                            className={`w-full text-left px-3 py-2 rounded-lg transition-colors ${f.idx === selectedIdx ? "bg-accent/15 border border-accent/25" : "bg-white/[0.02] border border-transparent hover:bg-white/[0.05]"}`}>
                                            <div className={`text-[12px] font-medium truncate ${f.idx === selectedIdx ? "text-accent" : "text-text-1"}`}>{f.name}</div>
                                            <div className="text-[10px] text-text-3 mt-0.5">{formatBytes(f.length)}{!f.browserFriendly ? " · may not play" : ""}</div>
                                        </button>
                                    ))}
                                </div>
                            </div>
                        )}
                    </div>
                )}

                <div className="px-4 py-2 text-[11px] text-text-3 border-t border-white/[0.06]">
                    {ephemeral
                        ? "Quick Watch — streaming without saving. Nothing is kept on disk after you close."
                        : "Streaming while downloading — playback may buffer until enough is fetched. Resumes where you left off."}
                </div>
            </div>
        </div>,
        document.body
    );
}
