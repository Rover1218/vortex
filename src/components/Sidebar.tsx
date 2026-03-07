"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTorrents } from "@/context/TorrentContext";

const NAV_ITEMS = [
  { label: "Search", href: "/search", icon: "🔍" },
  { label: "Downloads", href: "/downloads", icon: "📥" },
  { label: "Library", href: "/library", icon: "🎬" },
  { label: "Settings", href: "/settings", icon: "⚙️" },
];

export default function Sidebar() {
  const pathname = usePathname();
  const { diskInfo, torrents, totalDownloadSpeed } = useTorrents();

  const formatSize = (bytes: number) => {
    if (!bytes || bytes <= 0) return "—";
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

  return (
    <aside className="fixed left-0 top-0 h-screen w-60 bg-[#08081a]/90 backdrop-blur-xl border-r border-white/[0.04] flex flex-col z-50">
      {/* Logo */}
      <div className="p-6 pb-2">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-accent to-teal flex items-center justify-center text-white text-sm font-black">V</div>
          <span className="text-xl font-black tracking-tight text-white">Vortex</span>
        </div>
      </div>

      {/* Nav */}
      <nav className="flex-1 px-3 py-4 space-y-1">
        {NAV_ITEMS.map((item) => {
          const isActive = pathname === item.href || (item.href === '/search' && pathname === '/');
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex items-center gap-3 px-4 py-3 rounded-xl transition-all duration-200 font-medium relative group ${isActive
                ? "bg-gradient-to-r from-accent/15 to-transparent text-white"
                : "text-text-2 hover:text-white hover:bg-white/[0.04]"
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
      {totalDownloadSpeed > 0 && (
        <div className="mx-3 mb-3 p-3 bg-accent/5 rounded-xl border border-accent/10">
          <div className="flex items-center gap-2">
            <div className="w-1.5 h-1.5 rounded-full bg-teal animate-pulse-glow" />
            <span className="text-[10px] font-bold text-text-3 uppercase tracking-wider">Live</span>
          </div>
          <div className="text-sm font-mono font-bold text-white mt-1">↓ {formatSpeed(totalDownloadSpeed)}</div>
        </div>
      )}

      {/* Storage */}
      <div className="mx-3 mb-4 p-4 bg-white/[0.03] rounded-2xl border border-white/[0.04]">
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
    </aside>
  );
}
