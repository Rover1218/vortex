"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname, useRouter } from "next/navigation";
import { useTorrents } from "@/context/TorrentContext";
import { useAuth } from "@/context/AuthContext";

type IconProps = { className?: string };
const Icon = {
  Search: (p: IconProps) => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className={p.className}><circle cx="11" cy="11" r="7" /><path d="m21 21-4.3-4.3" /></svg>
  ),
  Radar: (p: IconProps) => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className={p.className}><rect x="3" y="4" width="18" height="18" rx="2" /><path d="M16 2v4M8 2v4M3 10h18" /></svg>
  ),
  Download: (p: IconProps) => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className={p.className}><path d="M12 3v12M7 10l5 5 5-5M5 21h14" /></svg>
  ),
  Film: (p: IconProps) => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className={p.className}><rect x="3" y="3" width="18" height="18" rx="2" /><path d="M7 3v18M17 3v18M3 8h4m10 0h4M3 16h4m10 0h4" /></svg>
  ),
  Trophy: (p: IconProps) => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className={p.className}><path d="M6 4h12v4a6 6 0 0 1-12 0V4Z" /><path d="M6 6H4a2 2 0 0 0 0 4h2M18 6h2a2 2 0 0 1 0 4h-2M9 20h6M12 14v6" /></svg>
  ),
  Settings: (p: IconProps) => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className={p.className}><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1Z" /></svg>
  ),
  Logout: (p: IconProps) => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className={p.className}><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9" /></svg>
  ),
};

const NAV_ITEMS = [
  { label: "Search", href: "/search", icon: Icon.Search },
  { label: "Release Radar", href: "/release-radar", icon: Icon.Radar },
  { label: "Downloads", href: "/downloads", icon: Icon.Download },
  { label: "Library", href: "/library", icon: Icon.Film },
  { label: "Leaderboard", href: "/leaderboard", icon: Icon.Trophy },
  { label: "Settings", href: "/settings", icon: Icon.Settings },
];

export default function Sidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const { diskInfo, torrents, totalDownloadSpeed, totalUploadSpeed, lifetimeDownloaded, lifetimeSeeded } = useTorrents();
  const { user, signOut } = useAuth();

  const handleLogout = async () => {
    try {
      await signOut();
      router.push("/");
    } catch (err) {
      console.error("Logout failed:", err);
    }
  };

  const formatSize = (bytes: number, zeroLabel = "—") => {
    if (!bytes || bytes <= 0) return zeroLabel;
    const k = 1024;
    const sizes = ["B", "KB", "MB", "GB", "TB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + " " + sizes[i];
  };

  const formatSpeed = (bytes: number) => {
    if (!bytes || bytes <= 0) return "0 B/s";
    const k = 1024;
    const sizes = ["B/s", "KB/s", "MB/s", "GB/s"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + " " + sizes[i];
  };

  const usedStr = diskInfo ? formatSize(diskInfo.used) : "—";
  const totalStr = diskInfo ? formatSize(diskInfo.total) : "—";
  const usedPercent = diskInfo && diskInfo.total > 0 ? Math.round((diskInfo.used / diskInfo.total) * 100) : 0;
  const activeDownloads = torrents.filter(t => t.status === 'Downloading').length;

  return (
    <aside className="fixed left-0 top-0 h-screen w-60 bg-[#0c0c0e] border-r border-white/[0.06] flex flex-col z-50" style={{ minHeight: 0 }}>
      {/* Logo */}
      <div className="px-5 h-16 flex items-center gap-2.5 border-b border-white/[0.05]">
        <div className="w-9 h-9 rounded-xl bg-accent flex items-center justify-center text-black text-base font-black shadow-accent-glow">V</div>
        <span className="text-lg font-black tracking-tight text-text-1">Vortex</span>
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto hide-scrollbar px-3 py-4 space-y-4">
        {/* Nav */}
        <nav className="space-y-1">
          {NAV_ITEMS.map((item) => {
            const isActive = pathname === item.href || (item.href === '/search' && pathname === '/');
            const ItemIcon = item.icon;
            return (
              <Link
                key={item.href}
                href={item.href}
                prefetch={false}
                className={`group relative flex items-center gap-3 px-3.5 py-2.5 rounded-xl font-medium text-sm transition-colors ${isActive
                  ? "bg-white/[0.06] text-text-1"
                  : "text-text-2 hover:text-text-1 hover:bg-white/[0.03]"
                  }`}
              >
                {isActive && <span className="absolute left-0 top-1/2 -translate-y-1/2 w-[3px] h-5 bg-accent rounded-r-full" />}
                <ItemIcon className={`w-[18px] h-[18px] shrink-0 ${isActive ? "text-accent" : "text-text-3 group-hover:text-text-2"}`} />
                <span>{item.label}</span>
                {item.label === 'Downloads' && activeDownloads > 0 && (
                  <span className="ml-auto text-[10px] font-bold bg-accent/15 text-accent px-2 py-0.5 rounded-full">{activeDownloads}</span>
                )}
              </Link>
            );
          })}
        </nav>

        {/* Live speed indicator */}
        {(totalDownloadSpeed > 0 || totalUploadSpeed > 0) && (
          <div className="p-3 rounded-xl border border-accent/15 bg-accent/[0.06]">
            <div className="flex items-center gap-2">
              <span className="w-1.5 h-1.5 rounded-full bg-teal animate-pulse-glow" />
              <span className="text-[10px] font-bold text-text-3 uppercase tracking-widest">Live</span>
            </div>
            <div className="mt-1.5 space-y-0.5 text-sm font-mono font-bold">
              {totalDownloadSpeed > 0 && <div className="text-text-1">↓ {formatSpeed(totalDownloadSpeed)}</div>}
              {totalUploadSpeed > 0 && <div className="text-teal">↑ {formatSpeed(totalUploadSpeed)}</div>}
            </div>
          </div>
        )}

        {/* Totals */}
        <div className="p-3.5 rounded-xl border border-white/[0.06] bg-white/[0.02]">
          <div className="text-[10px] text-text-3 font-bold uppercase tracking-widest mb-2.5">Totals</div>
          <div className="space-y-2 text-xs font-mono">
            <div className="flex items-center justify-between gap-2">
              <span className="text-text-3">Downloaded</span>
              <span className="text-text-1 font-bold">{formatSize(lifetimeDownloaded, "0 B")}</span>
            </div>
            <div className="flex items-center justify-between gap-2">
              <span className="text-text-3">Seeded</span>
              <span className="text-teal font-bold">{formatSize(lifetimeSeeded, "0 B")}</span>
            </div>
          </div>
        </div>

        {/* Storage */}
        <div className="p-3.5 rounded-xl border border-white/[0.06] bg-white/[0.02]">
          <div className="flex items-center justify-between mb-2.5">
            <span className="text-[10px] text-text-3 font-bold uppercase tracking-widest">Storage</span>
            <span className="text-[10px] text-text-2 font-mono">{usedPercent}%</span>
          </div>
          <div className="h-1.5 w-full bg-white/[0.06] rounded-full overflow-hidden mb-2">
            <div
              className={`h-full rounded-full transition-all duration-700 ${usedPercent > 90 ? 'bg-danger' : usedPercent > 70 ? 'bg-warning' : 'bg-accent'}`}
              style={{ width: `${usedPercent}%` }}
            />
          </div>
          <div className="text-xs text-text-2 font-mono">{usedStr} / {totalStr}</div>
        </div>
      </div>

      {/* User Profile + Logout */}
      {user && (
        <div className="mx-3 mb-4 p-3 rounded-xl bg-white/[0.02] border border-white/[0.06] shrink-0">
          <div className="flex items-center gap-3 mb-3">
            {user.photoURL ? (
              <Image src={user.photoURL} alt="" width={32} height={32} className="rounded-full ring-1 ring-white/10" referrerPolicy="no-referrer" unoptimized />
            ) : (
              <div className="w-8 h-8 rounded-full bg-accent/15 flex items-center justify-center text-accent text-xs font-bold ring-1 ring-white/10">
                {user.displayName?.[0] || user.email?.[0] || "?"}
              </div>
            )}
            <div className="flex-1 min-w-0">
              <div className="text-xs font-semibold text-text-1 truncate">{user.displayName || "User"}</div>
              <div className="text-[10px] text-text-3 truncate">{user.email}</div>
            </div>
          </div>
          <button
            onClick={handleLogout}
            className="w-full flex items-center justify-center gap-2 px-3 py-2 rounded-lg text-xs font-medium text-text-2 hover:text-danger bg-white/[0.02] hover:bg-danger/10 border border-white/[0.05] hover:border-danger/20 transition-all"
          >
            <Icon.Logout className="w-3.5 h-3.5" />
            Sign Out
          </button>
        </div>
      )}
    </aside>
  );
}
