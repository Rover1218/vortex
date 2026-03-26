"use client";

import { useAuth } from "@/context/AuthContext";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

export default function LandingPage() {
  const { user, loading } = useAuth();
  const router = useRouter();
  const [mounted, setMounted] = useState(false);

  useEffect(() => { setMounted(true); }, []);
  useEffect(() => { if (!loading && user) router.push("/search"); }, [user, loading, router]);

  const scrollTo = (id: string) => {
    document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  if (loading || !mounted) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-base">
        <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-accent to-teal flex items-center justify-center text-white text-lg font-black animate-pulse">V</div>
      </div>
    );
  }
  if (user) return null;

  return (
    <div className="min-h-screen bg-base text-text-1 overflow-x-hidden">
      {/* Static ambient glow — no animation, no blur, just radial gradients */}
      <div className="fixed inset-0 pointer-events-none" style={{ zIndex: 0 }}>
        <div className="absolute top-0 left-0 w-full h-full" style={{
          background: "radial-gradient(ellipse 60% 50% at 20% 20%, rgba(124,106,255,0.07) 0%, transparent 70%), radial-gradient(ellipse 50% 40% at 80% 80%, rgba(0,232,176,0.05) 0%, transparent 70%), radial-gradient(ellipse 30% 30% at 70% 30%, rgba(255,107,157,0.03) 0%, transparent 70%)"
        }} />
      </div>

      {/* Nav */}
      <nav className="relative z-10 flex items-center justify-between px-6 md:px-12 py-5 max-w-7xl mx-auto" style={{ animation: "fadeIn 0.5s ease" }}>
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-accent to-teal flex items-center justify-center text-white text-sm font-black shadow-lg shadow-accent/25 ring-1 ring-white/10">V</div>
          <span className="text-2xl font-black tracking-tight text-white">Vortex</span>
        </div>
        <div className="flex items-center gap-3">
          <button onClick={() => scrollTo("features")} className="hidden md:inline-block px-4 py-2 text-sm font-medium text-text-2 hover:text-white transition-colors">Features</button>
          <button onClick={() => scrollTo("how-it-works")} className="hidden md:inline-block px-4 py-2 text-sm font-medium text-text-2 hover:text-white transition-colors">How it works</button>
          <button onClick={() => router.push("/login")}
            className="px-6 py-2.5 text-sm font-bold rounded-xl bg-gradient-to-r from-accent to-[#8b7aff] text-white shadow-lg shadow-accent/20 hover:shadow-accent/40 transition-all duration-300 hover:scale-[1.02] active:scale-[0.98]">
            Sign In
          </button>
        </div>
      </nav>

      {/* Hero */}
      <section className="relative z-10 flex flex-col items-center text-center px-6 pt-20 pb-12 max-w-5xl mx-auto" style={{ animation: "fadeUp 0.7s ease" }}>
        <div className="inline-flex items-center gap-2.5 px-5 py-2 mb-10 rounded-full bg-accent/[0.08] border border-accent/20">
          <span className="relative flex h-2 w-2">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-teal opacity-75" />
            <span className="relative inline-flex rounded-full h-2 w-2 bg-teal" />
          </span>
          <span className="text-accent text-xs font-bold uppercase tracking-[0.15em]">Private Torrent Management</span>
        </div>

        <h1 className="text-5xl sm:text-6xl md:text-[5.5rem] font-black tracking-[-0.03em] leading-[1.02] mb-7">
          Your torrents,<br />
          <span className="bg-gradient-to-r from-accent via-[#9b8aff] to-teal bg-clip-text text-transparent">supercharged</span>
        </h1>

        <p className="text-base md:text-lg text-text-2 max-w-xl mb-12 leading-relaxed">
          Search across multiple providers, download at full speed, and manage your entire media library — all from one premium interface.
        </p>

        <div className="flex flex-col sm:flex-row items-center gap-4 mb-6">
          <button onClick={() => router.push("/login")}
            className="px-10 py-4 text-base font-bold rounded-2xl bg-gradient-to-r from-accent to-[#8b7aff] text-white shadow-2xl shadow-accent/30 hover:shadow-accent/50 transition-all duration-300 hover:scale-[1.03] active:scale-[0.98]">
            <span className="flex items-center gap-2">
              Get Started Free
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M3 8h10m0 0L9 4m4 4L9 12" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>
            </span>
          </button>
          <button onClick={() => scrollTo("features")}
            className="flex items-center gap-2 px-6 py-4 text-base font-semibold text-text-2 hover:text-white transition-colors duration-300 group">
            Learn more
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none" className="group-hover:translate-y-0.5 transition-transform"><path d="M7 2v10m0 0l4-4m-4 4L3 8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>
          </button>
        </div>

        <p className="text-xs text-text-3 mb-16">No credit card required · Free forever · 2-click setup</p>

        {/* Dashboard Preview */}
        <div className="w-full max-w-4xl relative" style={{ animation: "fadeUp 0.9s ease 0.3s both" }}>
          <div className="absolute -inset-1 bg-gradient-to-r from-accent/15 via-teal/10 to-accent/15 rounded-3xl opacity-50" />
          <div className="relative rounded-2xl border border-white/[0.1] bg-surface overflow-hidden shadow-2xl shadow-black/60">
            <div className="flex items-center gap-2 px-5 py-3.5 border-b border-white/[0.06] bg-black/20">
              <div className="w-3 h-3 rounded-full bg-[#ff5f57]" /><div className="w-3 h-3 rounded-full bg-[#febc2e]" /><div className="w-3 h-3 rounded-full bg-[#28c840]" />
              <span className="ml-4 text-[11px] text-text-3 font-mono tracking-wide">vortex — search torrents</span>
            </div>
            <div className="p-6 md:p-8">
              <div className="flex gap-5">
                <div className="hidden md:flex flex-col gap-3 w-44 shrink-0">
                  <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-accent/10"><div className="w-4 h-4 rounded bg-accent/40" /><div className="w-14 h-2.5 rounded bg-accent/30" /></div>
                  {[1,2,3].map(i=><div key={i} className="flex items-center gap-2 px-3 py-2"><div className="w-4 h-4 rounded bg-white/[0.06]"/><div className="w-16 h-2.5 rounded bg-white/[0.04]"/></div>)}
                  <div className="mt-auto pt-4 border-t border-white/[0.04]"><div className="px-3 py-2 space-y-2"><div className="flex justify-between"><div className="w-16 h-2 rounded bg-white/[0.04]"/><div className="w-10 h-2 rounded bg-teal/20"/></div><div className="h-1 rounded-full bg-white/[0.04]"><div className="h-1 rounded-full bg-gradient-to-r from-accent to-teal" style={{width:"30%"}}/></div></div></div>
                </div>
                <div className="flex-1">
                  <div className="flex gap-3 mb-5">
                    <div className="flex-1 h-11 rounded-xl bg-elevated/80 border border-white/[0.06] flex items-center px-4"><div className="w-3 h-3 rounded-full bg-white/[0.06] mr-2"/><div className="w-32 h-2.5 rounded bg-white/[0.04]"/></div>
                    <div className="w-24 h-11 rounded-xl bg-gradient-to-r from-accent to-[#8b7aff] flex items-center justify-center"><div className="w-12 h-2.5 rounded bg-white/30"/></div>
                  </div>
                  <div className="flex gap-2 mb-6">
                    {["All","Movies","TV","Anime","Apps"].map((f,i)=>(
                      <div key={f} className={`px-3.5 py-1.5 rounded-full text-[10px] font-medium ${i===0?"bg-accent/15 text-accent border border-accent/20":"bg-white/[0.03] text-text-3 border border-white/[0.04]"}`}>{f}</div>
                    ))}
                  </div>
                  <div className="space-y-2.5">
                    {[{w:"w-48",s:"42",p:"8"},{w:"w-56",s:"128",p:"23"},{w:"w-40",s:"67",p:"12"},{w:"w-52",s:"95",p:"31"}].map((item,i)=>(
                      <div key={i} className="h-12 rounded-lg bg-white/[0.02] border border-white/[0.04] flex items-center px-4 gap-3">
                        <div className={`${item.w} h-2.5 rounded bg-white/[0.06]`}/><div className="flex-1"/>
                        <div className="text-[10px] font-mono text-teal/60">{item.s}</div>
                        <div className="text-[10px] font-mono text-text-3">{item.p}</div>
                        <div className="w-6 h-6 rounded-md bg-accent/10 flex items-center justify-center"><div className="w-2.5 h-2.5 rounded-sm bg-accent/30"/></div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>
          <div className="absolute inset-x-0 bottom-0 h-32 bg-gradient-to-t from-base to-transparent z-10 pointer-events-none" />
        </div>
      </section>

      {/* Stats */}
      <section className="relative z-10 max-w-5xl mx-auto px-6 py-16">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-6 md:gap-8">
          {[
            {value:"4+",label:"Search Providers",color:"text-accent"},
            {value:"150+",label:"Mbps Optimized",color:"text-teal"},
            {value:"100%",label:"Private & Isolated",color:"text-[#ff6b9d]"},
            {value:"$0",label:"Cost — Free Forever",color:"text-warning"},
          ].map((stat,i)=>(
            <div key={i} className="text-center p-5 rounded-2xl bg-white/[0.02] border border-white/[0.04] hover:border-white/[0.08] transition-colors duration-300">
              <div className={`text-4xl md:text-5xl font-black ${stat.color} mb-1.5`}>{stat.value}</div>
              <div className="text-xs text-text-3 font-medium uppercase tracking-wider">{stat.label}</div>
            </div>
          ))}
        </div>
      </section>

      {/* Features */}
      <section id="features" className="relative z-10 max-w-6xl mx-auto px-6 py-16 scroll-mt-20">
        <div className="text-center mb-16">
          <div className="inline-flex items-center gap-2 px-4 py-1.5 mb-5 rounded-full bg-teal/[0.08] border border-teal/15 text-teal text-xs font-bold uppercase tracking-[0.12em]">Features</div>
          <h2 className="text-3xl md:text-5xl font-black tracking-tight mb-4">Everything you need,<br/><span className="text-text-2">nothing you don&apos;t</span></h2>
          <p className="text-text-2 max-w-lg mx-auto">A complete torrent management platform engineered for power users who demand a premium experience.</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {[
            {icon:"🔍",title:"Multi-Source Search",desc:"Search ThePirateBay, Nyaa, AnimeTosho, TorrentCSV simultaneously with smart deduplication and filters.",bg:"from-accent/10 via-accent/5 to-transparent"},
            {icon:"⚡",title:"Maximum Speed",desc:"WebTorrent engine optimized for 150+ Mbps with 300 concurrent connections and smart peer management.",bg:"from-teal/10 via-teal/5 to-transparent"},
            {icon:"🎬",title:"Media Library",desc:"Auto-organized library with poster fetching from TVmaze, Jikan & Kitsu, plus automatic subtitle downloads.",bg:"from-[#ff6b9d]/10 via-[#ff6b9d]/5 to-transparent"},
            {icon:"🔒",title:"Private & Secure",desc:"Google authentication with per-user data isolation. Your torrents, settings, and stats are yours alone.",bg:"from-warning/10 via-warning/5 to-transparent"},
            {icon:"📊",title:"Real-Time Stats",desc:"Live download speeds, upload ratios, storage visualization, and lifetime statistics updating every second.",bg:"from-accent/8 via-teal/5 to-transparent"},
            {icon:"🎛️",title:"Full Control",desc:"Bandwidth limits, download paths, auto-seeding, subtitle preferences — every detail is configurable.",bg:"from-teal/8 via-accent/5 to-transparent"},
          ].map((f,i)=>(
            <div key={i} className={`p-6 rounded-2xl bg-gradient-to-br ${f.bg} border border-white/[0.05] hover:border-white/[0.12] transition-all duration-300 hover:-translate-y-1`}>
              <div className="text-3xl mb-4">{f.icon}</div>
              <h3 className="text-base font-bold mb-2 text-white">{f.title}</h3>
              <p className="text-sm text-text-2 leading-relaxed">{f.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* How It Works */}
      <section id="how-it-works" className="relative z-10 max-w-5xl mx-auto px-6 py-20 scroll-mt-20">
        <div className="text-center mb-16">
          <div className="inline-flex items-center gap-2 px-4 py-1.5 mb-5 rounded-full bg-accent/[0.08] border border-accent/15 text-accent text-xs font-bold uppercase tracking-[0.12em]">How it works</div>
          <h2 className="text-3xl md:text-4xl font-black tracking-tight mb-4">Up and running in seconds</h2>
          <p className="text-text-2 max-w-md mx-auto">Three simple steps to take full control of your torrents.</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">

          {[
            {step:"01",title:"Sign In",desc:"One-click Google authentication. No passwords to remember, no forms to fill out.",icon:(
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M15 3h4a2 2 0 012 2v14a2 2 0 01-2 2h-4M10 17l5-5-5-5M15 12H3"/></svg>
            ),color:"accent",gradient:"from-accent/20 via-accent/5 to-transparent",ring:"ring-accent/20"},
            {step:"02",title:"Search & Download",desc:"Search across 4+ providers, find what you want, and start downloading instantly.",icon:(
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8"/><path d="M21 21l-4.35-4.35"/><path d="M11 8v6M8 11h6"/></svg>
            ),color:"teal",gradient:"from-teal/20 via-teal/5 to-transparent",ring:"ring-teal/20"},
            {step:"03",title:"Enjoy & Manage",desc:"Stream media, manage your library, track stats — all from your private dashboard.",icon:(
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M22 11.08V12a10 10 0 11-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>
            ),color:"[#ff6b9d]",gradient:"from-[#ff6b9d]/20 via-[#ff6b9d]/5 to-transparent",ring:"ring-[#ff6b9d]/20"},
          ].map((item,i)=>(
            <div key={i} className={`relative p-8 rounded-2xl bg-gradient-to-br ${item.gradient} border border-white/[0.06] hover:border-white/[0.12] transition-all duration-300 group`}>
              {/* Step number watermark */}
              <div className={`absolute top-4 right-5 text-6xl font-black text-${item.color}/[0.07] select-none`}>{item.step}</div>

              {/* Icon */}
              <div className={`w-14 h-14 rounded-xl bg-${item.color}/10 border border-${item.color}/15 ring-1 ${item.ring} flex items-center justify-center text-${item.color} mb-5 group-hover:scale-105 transition-transform duration-300`}>
                {item.icon}
              </div>

              {/* Step label */}
              <div className={`text-[10px] font-bold text-${item.color} uppercase tracking-[0.2em] mb-2`}>Step {item.step}</div>
              <h3 className="text-xl font-bold text-white mb-2">{item.title}</h3>
              <p className="text-sm text-text-2 leading-relaxed">{item.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* CTA */}
      <section className="relative z-10 max-w-4xl mx-auto px-6 py-16 text-center">
        <div className="relative overflow-hidden p-12 md:p-16 rounded-3xl border border-white/[0.08] bg-gradient-to-br from-accent/10 via-surface to-teal/8">
          <div className="relative">
            <h2 className="text-3xl md:text-5xl font-black mb-5 tracking-tight">Ready to take<br/>control?</h2>
            <p className="text-text-2 mb-10 max-w-md mx-auto text-base">Sign in with Google and start managing your torrents from a premium, private interface.</p>
            <button onClick={() => router.push("/login")}
              className="px-10 py-4 text-base font-bold rounded-2xl bg-gradient-to-r from-accent to-teal text-white shadow-2xl shadow-accent/25 hover:shadow-accent/40 transition-all duration-300 hover:scale-[1.03] active:scale-[0.98]">
              <span className="flex items-center gap-2">
                <svg width="20" height="20" viewBox="0 0 24 24"><path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 01-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#fff"/><path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#fff" opacity=".8"/><path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#fff" opacity=".6"/><path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#fff" opacity=".9"/></svg>
                Sign In with Google
              </span>
            </button>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="relative z-10 border-t border-white/[0.06]">
        <div className="max-w-6xl mx-auto px-6 py-12">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-10 md:gap-8 mb-10">
            <div className="md:col-span-2">
              <div className="flex items-center gap-2.5 mb-4">
                <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-accent to-teal flex items-center justify-center text-white text-xs font-black">V</div>
                <span className="text-lg font-black text-white">Vortex</span>
              </div>
              <p className="text-sm text-text-3 leading-relaxed max-w-sm mb-4">A premium private torrent management platform built for speed, privacy, and beautiful design.</p>
              <div className="flex items-center gap-1.5 text-xs text-text-3"><span className="w-1.5 h-1.5 rounded-full bg-teal"/>All systems operational</div>
            </div>
            <div>
              <h4 className="text-xs font-bold text-white uppercase tracking-widest mb-4">Product</h4>
              <ul className="space-y-2.5">
                <li><button onClick={() => scrollTo("features")} className="text-sm text-text-3 hover:text-white transition-colors">Features</button></li>
                <li><button onClick={() => scrollTo("how-it-works")} className="text-sm text-text-3 hover:text-white transition-colors">How it works</button></li>
                <li><button onClick={() => router.push("/login")} className="text-sm text-text-3 hover:text-white transition-colors">Get Started</button></li>
              </ul>
            </div>
            <div>
              <h4 className="text-xs font-bold text-white uppercase tracking-widest mb-4">Legal</h4>
              <ul className="space-y-2.5">
                <li><a href="/terms" className="text-sm text-text-3 hover:text-white transition-colors">Terms of Service</a></li>
                <li><a href="/privacy" className="text-sm text-text-3 hover:text-white transition-colors">Privacy Policy</a></li>
                <li><a href="/cookies" className="text-sm text-text-3 hover:text-white transition-colors">Cookie Policy</a></li>
              </ul>
            </div>
          </div>
          <div className="flex flex-col md:flex-row items-center justify-between pt-8 border-t border-white/[0.04] gap-4">
            <p className="text-xs text-text-3">© {new Date().getFullYear()} Vortex. All rights reserved.</p>
            <div className="flex items-center gap-6">
              <a href="/terms" className="text-xs text-text-3 hover:text-text-2 transition-colors">Terms</a>
              <a href="/privacy" className="text-xs text-text-3 hover:text-text-2 transition-colors">Privacy</a>
              <a href="/cookies" className="text-xs text-text-3 hover:text-text-2 transition-colors">Cookies</a>
            </div>
          </div>
        </div>
      </footer>

      <style jsx>{`
        @keyframes fadeIn {
          from { opacity: 0; transform: translateY(-10px); }
          to { opacity: 1; transform: translateY(0); }
        }
        @keyframes fadeUp {
          from { opacity: 0; transform: translateY(30px); }
          to { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </div>
  );
}
