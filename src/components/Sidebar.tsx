"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname, useRouter } from "next/navigation";
import { useTorrents } from "@/context/TorrentContext";
import { useAuth } from "@/context/AuthContext";

const NAV_ITEMS = [
  { label: "Search", href: "/search", icon: "🔍" },
  { label: "Release Radar", href: "/release-radar", icon: "📅" },
  { label: "Downloads", href: "/downloads", icon: "📥" },
  { label: "Library", href: "/library", icon: "🎬" },
  { label: "Leaderboard", href: "/leaderboard", icon: "🏆" },
  { label: "Settings", href: "/settings", icon: "⚙️" },
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
  const usedPercent = diskInfo ? Math.round((diskInfo.used / diskInfo.total) * 100) : 0;
  const activeDownloads = torrents.filter(t => t.status === 'Downloading').length;
  const totalDownloadedAll = lifetimeDownloaded;
  const totalSeededAll = lifetimeSeeded;

  return (
    <aside className="fixed left-0 top-0 h-screen w-60 bg-gradient-to-b from-[#090922]/98 via-[#09091f]/97 to-[#07071a]/97 backdrop-blur-sm border-r border-white/[0.06] flex flex-col overflow-hidden z-50">
      {/* Logo */}
      <div className="p-6 pb-2 border-b border-white/[0.04]">
        <div className="flex items-center gap-2">
          <div className="w-9 h-9 rounded-2xl bg-gradient-to-br from-accent to-teal flex items-center justify-center text-white text-sm font-black shadow-[0_12px_30px_-12px_rgba(109,98,255,0.85)]">V</div>
          <span className="text-xl font-black tracking-tight text-white">Vortex</span>
        </div>
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto hide-scrollbar px-3 py-4 space-y-3">
        {/* Nav */}
        <nav className="space-y-1.5">
          {NAV_ITEMS.map((item) => {
            const isActive = pathname === item.href || (item.href === '/search' && pathname === '/');
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`flex items-center gap-3 px-4 py-3 rounded-xl transition-all duration-200 font-medium relative group border ${isActive
                  ? "bg-gradient-to-r from-accent/18 to-accent/5 text-white border-accent/25 shadow-[0_10px_30px_-18px_rgba(118,105,255,0.9)]"
                  : "text-text-2 border-white/[0.02] hover:text-white hover:bg-white/[0.04] hover:border-white/[0.08]"
                  }`}
              >
                {isActive && <div className="absolute left-0 top-1/2 -translate-y-1/2 w-[3px] h-5 bg-accent rounded-r-full" />}
                <span className="text-lg">{item.icon}</span>
                <span className="text-sm">{item.label}</span>
                {item.label === 'Downloads' && activeDownloads > 0 && (
                  <span className="ml-auto text-[10px] font-bold bg-accent/20 text-accent px-2 py-0.5 rounded-full">{activeDownloads}</span>
                )}
              </Link>
            );
          })}
        </nav>

        {/* Live speed indicator */}
        {(totalDownloadSpeed > 0 || totalUploadSpeed > 0) && (
          <div className="p-3 bg-accent/6 rounded-xl border border-accent/12">
            <div className="flex items-center gap-2">
              <div className="w-1.5 h-1.5 rounded-full bg-teal animate-pulse-glow" />
              <span className="text-[10px] font-bold text-text-3 uppercase tracking-wider">Live</span>
            </div>
            <div className="mt-1 space-y-0.5 text-sm font-mono font-bold">
              {totalDownloadSpeed > 0 && <div className="text-white">↓ {formatSpeed(totalDownloadSpeed)}</div>}
              {totalUploadSpeed > 0 && <div className="text-teal">↑ {formatSpeed(totalUploadSpeed)}</div>}
            </div>
          </div>
        )}

        {/* Universal totals */}
        <div className="p-3 bg-white/[0.04] rounded-xl border border-white/[0.06]">
          <div className="text-[10px] text-text-3 font-bold uppercase tracking-wider mb-2">Totals</div>
          <div className="space-y-1.5 text-xs font-mono">
            <div className="flex items-center justify-between gap-2">
              <span className="text-text-3">Downloaded</span>
              <span className="text-white font-bold">{formatSize(totalDownloadedAll, "0 B")}</span>
            </div>
            <div className="flex items-center justify-between gap-2">
              <span className="text-text-3">Seeded</span>
              <span className="text-teal font-bold">{formatSize(totalSeededAll, "0 B")}</span>
            </div>
          </div>
        </div>

        {/* Storage */}
        <div className="p-4 bg-white/[0.04] rounded-2xl border border-white/[0.06]">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[10px] text-text-3 font-bold uppercase tracking-wider">Storage</span>
            <span className="text-[10px] text-text-3 font-mono">{usedPercent}%</span>
          </div>
          <div className="h-1.5 w-full bg-white/[0.06] rounded-full overflow-hidden mb-2">
            <div
              className={`h-full rounded-full transition-all duration-700 ${usedPercent > 90 ? 'bg-gradient-to-r from-red-500 to-red-400' :
                usedPercent > 70 ? 'bg-gradient-to-r from-warning to-yellow-400' :
                  'bg-gradient-to-r from-accent to-teal'
                }`}
              style={{ width: `${usedPercent}%` }}
            />
          </div>
          <div className="text-xs text-text-2 font-mono">
            {usedStr} / {totalStr}
          </div>
        </div>
      </div>

      {/* User Profile + Logout */}
      {user && (
        <div className="mx-3 mb-4 p-3 rounded-2xl bg-white/[0.04] border border-white/[0.06] shrink-0">
          <div className="flex items-center gap-3 mb-3">
            {user.photoURL ? (
              <Image src={user.photoURL} alt="" width={32} height={32} className="rounded-full ring-1 ring-white/10" referrerPolicy="no-referrer" unoptimized />
            ) : (
              <div className="w-8 h-8 rounded-full bg-accent/20 flex items-center justify-center text-accent text-xs font-bold ring-1 ring-white/10">
                {user.displayName?.[0] || user.email?.[0] || "?"}
              </div>
            )}
            <div className="flex-1 min-w-0">
              <div className="text-xs font-semibold text-white truncate">{user.displayName || "User"}</div>
              <div className="text-[10px] text-text-3 truncate">{user.email}</div>
            </div>
          </div>
          <button
            onClick={handleLogout}
            className="w-full flex items-center justify-center gap-2 px-3 py-2 rounded-xl text-xs font-medium text-text-3 hover:text-red-400 bg-white/[0.02] hover:bg-red-500/10 border border-white/[0.04] hover:border-red-500/20 transition-all duration-200"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4M16 17l5-5-5-5M21 12H9" />
            </svg>
            Sign Out
          </button>
        </div>
      )}
    </aside>
  );
}
