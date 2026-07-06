"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname, useRouter } from "next/navigation";
import { useTorrents } from "@/context/TorrentContext";
import { useAuth } from "@/context/AuthContext";
import { usePremium } from "@/context/PremiumContext";

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
  Guide: (p: IconProps) => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className={p.className}><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" /><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" /></svg>
  ),
  Crown: (p: IconProps) => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className={p.className}><path d="m2 8 4 10h12l4-10-6 4-4-7-4 7z" /></svg>
  ),
  Shield: (p: IconProps) => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className={p.className}><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" /><path d="m9 12 2 2 4-4" /></svg>
  ),
};

// Core content flow — search for something, watch it download, find it in the library.
const CORE_ITEMS = [
  { label: "Search", href: "/search", icon: Icon.Search },
  { label: "Downloads", href: "/downloads", icon: Icon.Download },
  { label: "Library", href: "/library", icon: Icon.Film },
  { label: "Release Radar", href: "/release-radar", icon: Icon.Radar },
];

// Account & app meta — pinned as the bottom group of the nav.
const META_ITEMS = [
  { label: "Settings", href: "/settings", icon: Icon.Settings },
  { label: "Guide", href: "/guide", icon: Icon.Guide },
];

export default function Sidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const { torrents } = useTorrents();
  const { user, signOut } = useAuth();
  const { isPremium, isLifetime, isAdmin } = usePremium();

  const navGroups = [
    { key: "core", label: null as string | null, items: CORE_ITEMS },
    // Admin-only tools (leaderboard aggregates every user's stats).
    ...(isAdmin
      ? [{
          key: "admin",
          label: "Admin",
          items: [
            { label: "Leaderboard", href: "/leaderboard", icon: Icon.Trophy },
            { label: "Admin", href: "/admin", icon: Icon.Shield },
          ],
        }]
      : []),
    {
      key: "meta",
      label: null as string | null,
      items: [
        // Lifetime users have nothing left to buy; everyone else can upgrade/extend.
        ...(!isLifetime ? [{ label: "Upgrade", href: "/upgrade", icon: Icon.Crown }] : []),
        ...META_ITEMS,
      ],
    },
  ];

  const handleLogout = async () => {
    try {
      await signOut();
      router.push("/");
    } catch (err) {
      console.error("Logout failed:", err);
    }
  };

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
          {navGroups.map((group, groupIdx) => (
            <div key={group.key}>
              {groupIdx > 0 && group.items.length > 0 && (
                <div className="my-3 mx-3.5 border-t border-white/[0.06]" />
              )}
              {group.label && group.items.length > 0 && (
                <div className="px-3.5 pb-1.5 text-[9px] font-black uppercase tracking-[0.2em] text-text-3">{group.label}</div>
              )}
              <div className="space-y-1">
                {group.items.map((item) => {
                  const isActive = pathname === item.href || (item.href === '/search' && pathname === '/');
                  const ItemIcon = item.icon;
                  const isUpgrade = item.label === 'Upgrade';
                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      prefetch={false}
                      className={`group relative flex items-center gap-3 px-3.5 py-2.5 rounded-xl font-medium text-sm transition-colors ${isActive
                        ? "bg-white/[0.06] text-text-1"
                        : isUpgrade && !isPremium
                          ? "text-accent hover:bg-accent/[0.08]"
                          : "text-text-2 hover:text-text-1 hover:bg-white/[0.03]"
                        }`}
                    >
                      {isActive && <span className="absolute left-0 top-1/2 -translate-y-1/2 w-[3px] h-5 bg-accent rounded-r-full" />}
                      <ItemIcon className={`w-[18px] h-[18px] shrink-0 ${isActive || (isUpgrade && !isPremium) ? "text-accent" : "text-text-3 group-hover:text-text-2"}`} />
                      <span>{item.label}</span>
                      {item.label === 'Downloads' && activeDownloads > 0 && (
                        <span className="ml-auto text-[10px] font-bold bg-accent/15 text-accent px-2 py-0.5 rounded-full">{activeDownloads}</span>
                      )}
                      {isUpgrade && (
                        <span className={`ml-auto text-[9px] font-black uppercase tracking-wide px-1.5 py-0.5 rounded-md ${isPremium ? "bg-teal/15 text-teal" : "bg-accent/15 text-accent"}`}>
                          {isPremium ? "Active" : "Pro"}
                        </span>
                      )}
                    </Link>
                  );
                })}
              </div>
            </div>
          ))}
        </nav>

      </div>

      {/* User Profile + Logout */}
      {user && (
        <div className={`mx-3 mb-4 p-3 rounded-xl shrink-0 border ${isPremium
          ? "bg-gradient-to-br from-accent/[0.08] to-transparent border-accent/25"
          : "bg-white/[0.02] border-white/[0.06]"}`}>
          <div className="flex items-center gap-3 mb-3">
            <div className="relative shrink-0">
              {user.photoURL ? (
                <Image src={user.photoURL} alt="" width={32} height={32} className={`rounded-full ring-2 ${isPremium ? "ring-accent/60" : "ring-white/10"}`} referrerPolicy="no-referrer" unoptimized />
              ) : (
                <div className={`w-8 h-8 rounded-full bg-accent/15 flex items-center justify-center text-accent text-xs font-bold ring-2 ${isPremium ? "ring-accent/60" : "ring-white/10"}`}>
                  {user.displayName?.[0] || user.email?.[0] || "?"}
                </div>
              )}
              {isPremium && (
                <span className="absolute -bottom-1 -right-1 w-4 h-4 rounded-full bg-accent flex items-center justify-center shadow-accent-glow" title={isLifetime ? "Lifetime Premium" : "Premium"}>
                  <Icon.Crown className="w-2.5 h-2.5 text-black" />
                </span>
              )}
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-xs font-semibold text-text-1 truncate flex items-center gap-1.5">
                <span className="truncate">{user.displayName || "User"}</span>
                {isPremium && (
                  <span className={`shrink-0 px-1.5 py-[1px] rounded-md text-[8px] font-black uppercase tracking-wider ${isLifetime
                    ? "bg-gradient-to-r from-accent to-accent-strong text-black"
                    : "bg-accent/15 text-accent border border-accent/30"}`}>
                    {isLifetime ? "Lifetime" : "Premium"}
                  </span>
                )}
              </div>
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
