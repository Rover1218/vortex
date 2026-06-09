"use client";

import { DOWNLOAD_LINK, LATEST_ENGINE_VERSION } from "@/constants/version";

type Item = { term: string; desc: string };
type Section = {
    title: string;
    blurb: string;
    icon: React.ReactNode;
    items: Item[];
};

const ICON = "h-6 w-6";

const SECTIONS: Section[] = [
    {
        title: "How Vortex works",
        blurb: "The dashboard you're looking at is just the control panel. The actual downloading is done by the Vortex Engine running on your computer.",
        icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" className={ICON}><rect x="2" y="3" width="20" height="14" rx="2" /><path d="M8 21h8M12 17v4" /></svg>,
        items: [
            { term: "Engine required", desc: "The standalone engine must be running for search, downloads, and streaming to work. If it isn't, you'll see the “Engine Offline” screen with a download button." },
            { term: "Stays in the tray", desc: "Once launched, the engine runs quietly in the background (system tray). Closing the desktop window only hides it — downloads keep going." },
            { term: "Keeping it updated", desc: `The latest engine is v${LATEST_ENGINE_VERSION}. The desktop app auto-updates, or you can grab it manually from the download link.` },
        ],
    },
    {
        title: "Search",
        blurb: "Find torrents across multiple providers at once — then watch or download right from the result.",
        icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" className={ICON}><circle cx="11" cy="11" r="7" /><path d="m21 21-4.3-4.3" /></svg>,
        items: [
            { term: "Categories & suggestions", desc: "Filter by type (movies, TV, etc.) to cut noise, and pick from auto-suggestions as you type." },
            { term: "Quick Watch", desc: "Stream a title instantly without downloading — nothing is saved to disk. Great for a quick look before committing." },
            { term: "Stream / Play", desc: "“Stream” starts playback while downloading and saves the file to your library. If you already have it, the button becomes “Play”." },
            { term: "Preview files & subtitles", desc: "Peek inside a torrent's file list before adding it, and search for matching subtitles." },
            { term: "Group TV episodes", desc: "Toggle to collapse a show's episodes together so big season packs stay readable." },
            { term: "Continue Watching", desc: "On the Search home view, your in-progress titles show up here — click to resume right where you stopped." },
        ],
    },
    {
        title: "Release Radar",
        blurb: "Track upcoming and recent releases so you don't miss them.",
        icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" className={ICON}><rect x="3" y="4" width="18" height="18" rx="2" /><path d="M16 2v4M8 2v4M3 10h18" /></svg>,
        items: [
            { term: "Discover rows", desc: "Curated rows surface trending and upcoming titles to browse." },
            { term: "Jump to search", desc: "Pick a title from the radar and it deep-links straight into Search." },
        ],
    },
    {
        title: "Downloads",
        blurb: "Manage everything the engine is fetching or seeding. This is where the grouped buttons live.",
        icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" className={ICON}><path d="M12 3v12M7 10l5 5 5-5M5 21h14" /></svg>,
        items: [
            { term: "Status tabs", desc: "Filter by All · Downloading · Paused · Completed to quickly find what you're after." },
            { term: "Series grouping", desc: "Multi-file torrents (whole seasons) collapse into a single card. Expand it to see each episode, its progress, and size — instead of a long flat list." },
            { term: "File selection", desc: "Open the file drawer on a torrent to choose which files to download. Deselect the ones you don't want to save bandwidth and disk." },
            { term: "Pause / Resume / Delete", desc: "Each torrent has controls to pause, resume, or delete it (with a confirm step). Removing stops the transfer but won't touch already-finished files unless you choose to delete them." },
            { term: "Stream while downloading", desc: "Hit play on a file to stream it before it finishes — the engine prioritises the pieces you're watching." },
            { term: "Continue Watching", desc: "Just like Search, your in-progress titles appear at the top here so you can jump back in." },
            { term: "Live badge", desc: "The “1” badge on the Downloads nav item and the LIVE speed in the sidebar show active transfers at a glance." },
        ],
    },
    {
        title: "The Player",
        blurb: "Stream any file straight in your browser, with subtitle and audio-track support.",
        icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" className={ICON}><circle cx="12" cy="12" r="9" /><path d="m10 8 6 4-6 4V8z" /></svg>,
        items: [
            { term: "Direct vs Convert", desc: "Browser-friendly files (H.264/MP4) play directly. For other formats use “Play in browser (convert)” — the engine transcodes on the fly. Converted mode seeks by reloading from a new point, so it uses −10s / +30s buttons instead of native seeking." },
            { term: "Subtitles (CC)", desc: "Pick from detected subtitle tracks, or turn them off. Embedded subs are extracted automatically." },
            { term: "Audio tracks", desc: "Dual-audio files let you switch language. Choosing a non-default track triggers a quick re-mux." },
            { term: "Open in external player", desc: "Prefer VLC? “Open in player” hands the file to your system's default media player." },
            { term: "Keyboard shortcuts", desc: "Space = play/pause · ← / → = seek 5s · F = fullscreen · M = mute · Esc = close. In fullscreen the controls auto-hide after a few idle seconds — move the mouse to bring them back." },
        ],
    },
    {
        title: "Library",
        blurb: "Your completed and saved content, organised for re-watching.",
        icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" className={ICON}><rect x="3" y="3" width="18" height="18" rx="2" /><path d="M7 3v18M17 3v18M3 8h4m10 0h4M3 16h4m10 0h4" /></svg>,
        items: [
            { term: "Finished content", desc: "Everything you've downloaded and kept lives here, ready to play any time." },
            { term: "Series view", desc: "Just like Downloads, seasons group together so episodes stay tidy." },
            { term: "Play from library", desc: "Open any saved title straight in the built-in player. (To resume where you left off, use Continue Watching on the Search or Downloads page.)" },
        ],
    },
    {
        title: "Leaderboard & Totals",
        blurb: "See how much you've contributed to the swarm.",
        icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" className={ICON}><path d="M8 21h8M12 17v4M7 4h10v4a5 5 0 0 1-10 0V4Z" /></svg>,
        items: [
            { term: "Seeding rank", desc: "Ranked by total bytes shared. Keep torrents seeding to climb." },
            { term: "Sidebar totals", desc: "Lifetime Downloaded and Seeded are always visible in the sidebar, along with your disk usage." },
        ],
    },
    {
        title: "Settings",
        blurb: "Configure where files land and how the engine behaves.",
        icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" className={ICON}><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1Z" /></svg>,
        items: [
            { term: "Download path", desc: "Choose the folder where finished files are saved." },
            { term: "Account", desc: "You can sign out from the sidebar — or from the Engine Offline screen if you ever get stuck there." },
        ],
    },
];

export default function GuidePage() {
    return (
        <div className="w-full max-w-full space-y-6 pb-12 relative isolate">
            {/* Ambient glow */}
            <div className="pointer-events-none absolute -top-24 left-1/2 -translate-x-1/2 h-72 w-[60%] rounded-full bg-accent/10 blur-[120px]" aria-hidden />

            {/* Hero */}
            <header className="relative z-10 cine-card overflow-hidden p-6 sm:p-8">
                <div className="flex flex-wrap items-center justify-between gap-4">
                    <div className="flex items-center gap-4">
                        <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-accent/12 text-accent ring-1 ring-accent/25">
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" className="h-7 w-7"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" /><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" /></svg>
                        </div>
                        <div>
                            <h1 className="cine-title text-3xl sm:text-4xl font-black tracking-tight text-text-1">Guide</h1>
                            <p className="text-text-3 text-sm mt-1">Everything you need to get the most out of Vortex — from the engine to streaming.</p>
                        </div>
                    </div>
                    <a
                        href={DOWNLOAD_LINK}
                        target="_blank"
                        rel="noreferrer"
                        className="flex items-center gap-2 rounded-xl bg-accent px-4 py-2.5 text-sm font-bold text-black shadow-accent-glow transition-all hover:bg-accent-strong"
                    >
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="7 10 12 15 17 10" /><line x1="12" y1="15" x2="12" y2="3" /></svg>
                        Get the Engine
                    </a>
                </div>
            </header>

            {/* Sections */}
            <div className="relative z-10 grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
                {SECTIONS.map((section) => (
                    <section key={section.title} className="cine-card p-5 sm:p-6">
                        <div className="flex items-start gap-3.5">
                            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-accent/12 text-accent ring-1 ring-accent/20">
                                {section.icon}
                            </div>
                            <div className="min-w-0">
                                <h2 className="text-lg font-black tracking-tight text-text-1">{section.title}</h2>
                                <p className="text-[13px] leading-relaxed text-text-3 mt-0.5">{section.blurb}</p>
                            </div>
                        </div>

                        <ul className="mt-5 space-y-3.5">
                            {section.items.map((item) => (
                                <li key={item.term} className="flex gap-3">
                                    <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-accent/60" />
                                    <div className="min-w-0">
                                        <span className="text-sm font-bold text-text-1">{item.term}</span>
                                        <p className="text-[13px] leading-relaxed text-text-2 mt-0.5">{item.desc}</p>
                                    </div>
                                </li>
                            ))}
                        </ul>
                    </section>
                ))}
            </div>

            {/* Footer note */}
            <div className="relative z-10 cine-card p-5 sm:p-6 text-center">
                <p className="text-sm text-text-2">
                    Still stuck? Make sure the engine is running and up to date — most issues come down to the engine being offline or an old version.
                </p>
            </div>
        </div>
    );
}
