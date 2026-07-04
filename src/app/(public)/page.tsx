"use client";

import { useAuth } from "@/context/AuthContext";
import { DOWNLOAD_LINK, LATEST_ENGINE_VERSION } from "@/constants/version";
import { Reveal, RevealGroup, RevealItem } from "@/components/landing/Reveal";
import { CountUp } from "@/components/landing/CountUp";
import { HeroPosters } from "@/components/landing/HeroPosters";
import { ScrollScene } from "@/components/landing/ScrollScene";
import { SceneShelf } from "@/components/landing/SceneShelf";
import { ButterflyLoader } from "@/components/landing/ButterflyLoader";
import { motion, useScroll, useSpring, useMotionValueEvent, MotionConfig } from "framer-motion";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

const MARQUEE = ["Movies", "Anime", "TV Series", "4K · HDR", "x265 / HEVC", "Documentaries", "K-Drama", "Subtitles", "Stream while downloading", "Release Radar"];

const STATS = [
  { to: 5, suffix: "", label: "Search sources, queried at once" },
  { to: 150, suffix: "+", label: "Mbps tuned download speed" },
  { to: 300, suffix: "", label: "Peer connections per torrent" },
  { to: 100, suffix: "%", label: "Private — your data, yours alone" },
];

export default function LandingPage() {
  const { user, loading } = useAuth();
  const router = useRouter();
  const [mounted, setMounted] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  // Keep the butterfly loader on screen for a minimum beat so it's enjoyed even
  // when auth resolves instantly.
  const [minLoaderDone, setMinLoaderDone] = useState(false);

  const { scrollYProgress } = useScroll();
  const progressX = useSpring(scrollYProgress, { stiffness: 140, damping: 30, mass: 0.3 });

  useMotionValueEvent(scrollYProgress, "change", (v) => {
    setScrolled(v > 0.02);
  });

  useEffect(() => { setMounted(true); }, []);
  useEffect(() => {
    const t = setTimeout(() => setMinLoaderDone(true), 6000);
    return () => clearTimeout(t);
  }, []);
  useEffect(() => { if (!loading && user) router.push("/search"); }, [user, loading, router]);

  const scrollTo = (id: string) => document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });

  if (loading || !mounted || !minLoaderDone) {
    return <ButterflyLoader />;
  }
  if (user) return null;

  return (
    <MotionConfig reducedMotion="never">
    <div className="min-h-screen bg-base text-text-1 overflow-x-clip relative">
      {/* Scroll progress bar */}
      <motion.div
        className="fixed top-0 left-0 right-0 h-0.5 origin-left z-50 bg-gradient-to-r from-accent via-accent-strong to-teal"
        style={{ scaleX: progressX }}
      />

      {/* Animated cinematic background */}
      <div className="fixed inset-0 z-0 pointer-events-none overflow-hidden">
        <div className="absolute -top-1/3 left-1/2 -translate-x-1/2 w-[120vw] h-[80vh] rounded-full blur-[120px] animate-aurora" style={{ background: "radial-gradient(circle, rgba(245,166,35,0.16), transparent 60%)" }} />
        <div className="absolute top-1/3 -right-[10vw] w-[50vw] h-[50vw] rounded-full blur-[120px] animate-aurora" style={{ background: "radial-gradient(circle, rgba(45,212,167,0.08), transparent 60%)", animationDelay: "-6s" }} />
        <div className="absolute inset-0 opacity-[0.04]" style={{ backgroundImage: "linear-gradient(rgba(255,255,255,.6) 1px,transparent 1px),linear-gradient(90deg,rgba(255,255,255,.6) 1px,transparent 1px)", backgroundSize: "48px 48px", maskImage: "radial-gradient(ellipse 90% 60% at 50% 20%,#000,transparent 75%)", WebkitMaskImage: "radial-gradient(ellipse 90% 60% at 50% 20%,#000,transparent 75%)" }} />
      </div>

      {/* Sticky condensing nav */}
      <motion.nav
        className={`sticky top-0 z-40 transition-all duration-300 ${
          scrolled ? "bg-base/70 backdrop-blur-xl border-b border-white/[0.06]" : "bg-transparent border-b border-transparent"
        }`}
      >
        <div className="flex items-center justify-between px-6 md:px-12 py-4 max-w-7xl mx-auto">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-accent to-accent-strong flex items-center justify-center text-black text-sm font-black shadow-accent-glow">V</div>
            <span className="text-2xl font-black tracking-tight">Vortex</span>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={() => scrollTo("features")} className="hidden md:inline-block px-4 py-2 text-sm font-medium text-text-2 hover:text-text-1 transition-colors">Features</button>
            <Link href="/release-radar" className="hidden md:inline-block px-4 py-2 text-sm font-medium text-text-2 hover:text-text-1 transition-colors">Release Radar</Link>
            <button onClick={() => scrollTo("how-it-works")} className="hidden md:inline-block px-4 py-2 text-sm font-medium text-text-2 hover:text-text-1 transition-colors">How it works</button>
            <Link href="/pricing" className="hidden md:inline-block px-4 py-2 text-sm font-medium text-text-2 hover:text-text-1 transition-colors">Pricing</Link>
            <button onClick={() => router.push("/login")} className="btn-primary px-6">Sign In</button>
          </div>
        </div>
      </motion.nav>

      {/* Hero */}
      <section className="relative z-10 max-w-7xl mx-auto px-6 md:px-12 pt-12 md:pt-20 pb-12 grid lg:grid-cols-2 gap-12 items-center">
        <motion.div initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.8, ease: [0.22, 1, 0.36, 1] }}>
          <motion.div
            className="cine-chip px-4 py-2 mb-7 !text-accent border-accent/25 bg-accent/[0.08]"
            initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1, duration: 0.6 }}
          >
            <span className="relative flex h-2 w-2"><span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-teal opacity-75" /><span className="relative inline-flex rounded-full h-2 w-2 bg-teal" /></span>
            <span className="text-[11px] font-bold uppercase tracking-[0.15em]">Private download manager + local player</span>
          </motion.div>

          <h1 className="text-5xl sm:text-6xl md:text-7xl font-black tracking-[-0.035em] leading-[0.98]">
            Your torrents,<br />
            now a <span className="text-gradient-amber">home<br className="hidden sm:block" /> theater.</span>
          </h1>

          <p className="text-base md:text-lg text-text-2 max-w-xl mt-7 leading-relaxed">
            Search 5 sources, download at full speed, and <span className="text-text-1 font-semibold">stream while it downloads</span> — even 4K &amp; x265, transcoded to play right in your browser. Subtitles, resume, and a private media library.
          </p>

          <div className="flex flex-wrap items-center gap-3 mt-9">
            <motion.button
              onClick={() => router.push("/login")}
              className="btn-primary px-9 py-4 text-base shadow-accent-glow"
              whileHover={{ scale: 1.03 }} whileTap={{ scale: 0.97 }}
            >
              Get Started Free
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M3 8h10m0 0L9 4m4 4L9 12" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>
            </motion.button>
            <button onClick={() => scrollTo("features")} className="px-6 py-4 text-base font-semibold text-text-2 hover:text-text-1 transition-colors">Explore features</button>
          </div>
          <p className="text-xs text-text-3 mt-5">No credit card · Free forever · 2-click setup</p>
        </motion.div>

        {/* Floating poster cluster (parallax) */}
        <HeroPosters />
      </section>

      {/* Marquee */}
      <div className="relative z-10 border-y border-white/[0.06] bg-white/[0.015] py-4 overflow-hidden">
        <div className="flex w-max animate-marquee gap-10 pr-10">
          {[...MARQUEE, ...MARQUEE].map((m, i) => (
            <span key={i} className="flex items-center gap-10 text-sm font-bold uppercase tracking-[0.2em] text-text-3 whitespace-nowrap">
              {m}<span className="w-1.5 h-1.5 rounded-full bg-accent/50" />
            </span>
          ))}
        </div>
      </div>

      {/* Stats band */}
      <section className="relative z-10 max-w-6xl mx-auto px-6 pt-16">
        <RevealGroup className="grid grid-cols-2 md:grid-cols-4 gap-4" stagger={0.1}>
          {STATS.map((s) => (
            <RevealItem key={s.label}>
              <div className="cine-card cine-card-hover p-6 text-center h-full">
                <div className="text-4xl md:text-5xl font-black text-gradient-amber tracking-tight">
                  <CountUp to={s.to} suffix={s.suffix} />
                </div>
                <p className="text-xs text-text-3 mt-2 leading-relaxed">{s.label}</p>
              </div>
            </RevealItem>
          ))}
        </RevealGroup>
      </section>

      {/* Engine version banner */}
      <section className="relative z-10 max-w-5xl mx-auto px-6 pt-16">
        <Reveal>
          <div className="cine-card rounded-3xl px-6 py-5 shadow-cinema flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div>
              <div className="text-[10px] font-bold uppercase tracking-[0.2em] text-text-3 mb-2">Desktop Engine</div>
              <div className="text-lg font-black">Latest release {LATEST_ENGINE_VERSION} · auto-updates</div>
              <p className="text-sm text-text-2 mt-1">Install once — new versions download and apply themselves in the background.</p>
            </div>
            <motion.button onClick={() => window.open(DOWNLOAD_LINK, "_blank")} className="btn-primary shrink-0" whileHover={{ scale: 1.03 }} whileTap={{ scale: 0.97 }}>
              Download engine
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><path d="M7 2v8m0 0 3-3M7 10 4 7M2 12h10" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" /></svg>
            </motion.button>
          </div>
        </Reveal>
      </section>

      {/* Scroll-scrubbed cinematic scene */}
      <div className="pt-16 md:pt-20">
        <ScrollScene />
      </div>

      {/* Bento Features */}
      <section id="features" className="relative z-10 max-w-6xl mx-auto px-6 pt-12 pb-20 md:pt-16 scroll-mt-20">
        <Reveal className="text-center mb-12">
          <div className="cine-chip px-4 py-1.5 mb-5 !text-teal border-teal/15 bg-teal/[0.08] uppercase tracking-[0.12em] font-bold">Features</div>
          <h2 className="text-4xl md:text-5xl font-black tracking-tight">A full cinema, <span className="text-gradient-amber">privately yours.</span></h2>
        </Reveal>

        <RevealGroup className="grid grid-cols-1 md:grid-cols-3 gap-4 auto-rows-[180px]" stagger={0.07}>
          {/* Big: stream while downloading */}
          <RevealItem className="md:col-span-2 md:row-span-2">
            <div className="cine-card cine-card-hover h-full p-8 relative overflow-hidden group">
              <div className="absolute -right-10 -top-10 w-56 h-56 rounded-full bg-accent/10 blur-3xl group-hover:bg-accent/20 transition-colors" />
              <div className="relative">
                <div className="w-14 h-14 rounded-2xl bg-accent/15 text-accent flex items-center justify-center mb-5">
                  <svg className="w-7 h-7" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z" /></svg>
                </div>
                <h3 className="text-2xl font-black mb-2">Stream while it downloads</h3>
                <p className="text-text-2 max-w-md leading-relaxed">Hit play and watch instantly — Vortex streams as it fetches. Even 4K, x265 &amp; 10-bit play in your browser via on-the-fly transcoding, with a seekable timeline and resume.</p>
                <div className="flex gap-2 mt-6 flex-wrap">
                  {["Transcode x265", "Seek anywhere", "Resume", "Episode picker"].map(t => <span key={t} className="cine-chip text-[11px]">{t}</span>)}
                </div>
              </div>
            </div>
          </RevealItem>
          <BentoCard title="5 search sources" desc="ThePirateBay, Torrentio, Nyaa, AnimeTosho & TorrentCSV — searched at once.">
            <svg className="w-6 h-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="7" /><path d="M21 21l-4.3-4.3" /></svg>
          </BentoCard>
          <BentoCard title="Subtitles built in" desc="Embedded & OpenSubtitles tracks, right in the player.">
            <svg className="w-6 h-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="5" width="18" height="14" rx="2" /><path d="M7 15h4M15 15h2M7 11h2M13 11h4" /></svg>
          </BentoCard>
          <BentoCard title="Release Radar" desc="Track upcoming anime & weekly episodes at a glance." accent="teal">
            <svg className="w-6 h-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="17" rx="2" /><path d="M3 9h18M8 2v4M16 2v4" /></svg>
          </BentoCard>
          <BentoCard title="Maximum speed" desc="WebTorrent tuned for 150+ Mbps & 300 connections." accent="teal">
            <svg className="w-6 h-6" viewBox="0 0 24 24" fill="currentColor"><path d="M13 2 4.5 13.5H11l-1 8.5L19.5 10H13z" /></svg>
          </BentoCard>
          <BentoCard title="Private & secure" desc="Google sign-in, per-user isolation, your data alone.">
            <svg className="w-6 h-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><rect x="4" y="11" width="16" height="10" rx="2" /><path d="M8 11V7a4 4 0 0 1 8 0v4" /></svg>
          </BentoCard>
        </RevealGroup>
      </section>

      {/* Horizontal scroll-scrubbed filmstrip */}
      <SceneShelf />

      {/* How it works */}
      <section id="how-it-works" className="relative z-10 max-w-5xl mx-auto px-6 py-16 scroll-mt-20">
        <Reveal className="text-center mb-12">
          <div className="cine-chip px-4 py-1.5 mb-5 !text-accent border-accent/15 bg-accent/[0.08] uppercase tracking-[0.12em] font-bold">How it works</div>
          <h2 className="text-3xl md:text-4xl font-black tracking-tight">Up and running in seconds</h2>
        </Reveal>
        <RevealGroup className="grid md:grid-cols-3 gap-5" stagger={0.12}>
          {[
            { n: "01", t: "Sign in", d: "One-click Google auth. No passwords, no forms." },
            { n: "02", t: "Search & grab", d: "Search 5 providers and start downloading instantly." },
            { n: "03", t: "Stream & manage", d: "Play in-browser, track stats, build your library." },
          ].map((s) => (
            <RevealItem key={s.n}>
              <div className="cine-card cine-card-hover p-7 relative overflow-hidden h-full hover:-translate-y-1 transition-transform">
                <div className="absolute top-3 right-4 text-6xl font-black text-accent/[0.08] select-none">{s.n}</div>
                <div className="text-[10px] font-bold text-accent uppercase tracking-[0.2em] mb-2">Step {s.n}</div>
                <h3 className="text-xl font-bold mb-2 text-text-1">{s.t}</h3>
                <p className="text-sm text-text-3 leading-relaxed">{s.d}</p>
              </div>
            </RevealItem>
          ))}
        </RevealGroup>
      </section>

      {/* CTA */}
      <section className="relative z-10 max-w-4xl mx-auto px-6 py-16 text-center">
        <Reveal direction="none">
          <div className="relative overflow-hidden cine-card rounded-3xl p-12 md:p-16 shadow-cinema-lg" style={{ background: "radial-gradient(ellipse 80% 100% at 50% 0%, rgba(245,166,35,0.12) 0%, transparent 70%), #131316" }}>
            <h2 className="text-3xl md:text-5xl font-black mb-5 tracking-tight">Ready to <span className="text-gradient-amber">press play?</span></h2>
            <p className="text-text-2 mb-9 max-w-md mx-auto">Sign in with Google and turn your downloads into a private home theater.</p>
            <motion.button onClick={() => router.push("/login")} className="btn-primary px-10 py-4 text-base shadow-accent-glow" whileHover={{ scale: 1.03 }} whileTap={{ scale: 0.97 }}>
              <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-white">
                <svg width="15" height="15" viewBox="0 0 24 24"><path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4" /><path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" /><path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05" /><path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" /></svg>
              </span>
              Sign In with Google
            </motion.button>
          </div>
        </Reveal>
      </section>

      {/* Footer */}
      <footer className="relative z-10 border-t border-white/[0.06]">
        <div className="max-w-6xl mx-auto px-6 py-10 flex flex-col md:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-accent flex items-center justify-center text-black text-xs font-black">V</div>
            <span className="text-lg font-black">Vortex</span>
            <span className="ml-3 flex items-center gap-1.5 text-xs text-text-3"><span className="w-1.5 h-1.5 rounded-full bg-teal" />All systems operational</span>
          </div>
          <div className="flex items-center gap-6 text-xs text-text-3">
            <Link href="/pricing" className="hover:text-text-1 transition-colors">Pricing</Link>
            <a href="/terms" className="hover:text-text-1 transition-colors">Terms</a>
            <a href="/privacy" className="hover:text-text-1 transition-colors">Privacy</a>
            <a href="/cookies" className="hover:text-text-1 transition-colors">Cookies</a>
            <span>© {new Date().getFullYear()} Vortex</span>
          </div>
        </div>
      </footer>
    </div>
    </MotionConfig>
  );
}

function BentoCard({ title, desc, children, accent = "accent" }: { title: string; desc: string; children: React.ReactNode; accent?: "accent" | "teal" }) {
  const color = accent === "teal" ? "bg-teal/15 text-teal" : "bg-accent/15 text-accent";
  return (
    <RevealItem>
      <div className="cine-card cine-card-hover h-full p-6 hover:-translate-y-1 transition-transform">
        <div className={`w-11 h-11 mb-4 rounded-xl flex items-center justify-center ${color}`}>{children}</div>
        <h3 className="text-base font-bold mb-1.5 text-text-1">{title}</h3>
        <p className="text-[13px] text-text-3 leading-relaxed">{desc}</p>
      </div>
    </RevealItem>
  );
}
