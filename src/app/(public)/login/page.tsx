"use client";

import { useAuth } from "@/context/AuthContext";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

export default function LoginPage() {
  const { user, loading, signInWithGoogle } = useAuth();
  const router = useRouter();
  const [signingIn, setSigningIn] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (loading || !user) return;
    // Return the user to where they came from (e.g. a Release Radar card → /search?q=…),
    // but only allow internal paths to avoid open-redirects.
    const next = new URLSearchParams(window.location.search).get("next");
    router.push(next && next.startsWith("/") && !next.startsWith("//") ? next : "/search");
  }, [user, loading, router]);

  const handleGoogleSignIn = async () => {
    setSigningIn(true);
    setError(null);
    try {
      await signInWithGoogle();
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Sign-in failed. Please try again.";
      if (!message.includes("popup-closed-by-user") && !message.includes("cancelled")) setError(message);
    } finally {
      setSigningIn(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-base">
        <div className="w-10 h-10 rounded-xl bg-accent flex items-center justify-center text-black text-lg font-black animate-pulse">V</div>
      </div>
    );
  }
  if (user) return null;

  return (
    <div className="h-screen bg-base text-text-1 flex relative overflow-hidden">
      {/* Animated background */}
      <div className="fixed inset-0 z-0 pointer-events-none overflow-hidden">
        <div className="absolute -top-1/4 -left-1/4 w-[70vw] h-[70vw] rounded-full blur-[130px] animate-aurora" style={{ background: "radial-gradient(circle, rgba(245,166,35,0.16), transparent 60%)" }} />
        <div className="absolute -bottom-1/4 -right-1/4 w-[55vw] h-[55vw] rounded-full blur-[130px] animate-aurora" style={{ background: "radial-gradient(circle, rgba(45,212,167,0.09), transparent 60%)", animationDelay: "-7s" }} />
      </div>

      {/* Back to home — fixed top-left corner */}
      <button onClick={() => router.push("/")} className="absolute top-6 left-6 z-30 flex items-center gap-2 text-text-3 hover:text-text-1 transition-colors group">
        <svg width="18" height="18" viewBox="0 0 16 16" fill="none" className="group-hover:-translate-x-0.5 transition-transform"><path d="M10 12 6 8l4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" /></svg>
        <span className="text-sm font-medium">Back to home</span>
      </button>

      {/* Left showcase (desktop) */}
      <div className="relative z-10 hidden lg:flex flex-col justify-center gap-6 w-[46%] p-10 pt-16 border-r border-white/[0.06] overflow-hidden">
        {/* Floating posters */}
        <div className="relative h-[330px]">
          <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-64 h-64 rounded-full blur-[80px] bg-accent/20 animate-glow-breathe" />
          {/* left back */}
          <div className="absolute left-1/2 -translate-x-[120%] top-[20%] w-36 z-10">
            <div className="animate-float-slow" style={{ ['--rot' as string]: '-11deg', animationDelay: '-1.5s' }}><LoginPoster src="/posters/silo.png" dim /></div>
          </div>
          {/* right back */}
          <div className="absolute left-1/2 translate-x-[20%] top-[16%] w-36 z-10">
            <div className="animate-float-slow" style={{ ['--rot' as string]: '11deg', animationDelay: '-3s' }}><LoginPoster src="/posters/dune.png" dim /></div>
          </div>
          {/* center front */}
          <div className="absolute left-1/2 -translate-x-1/2 top-[8%] w-48 z-20">
            <div className="animate-float-slow" style={{ ['--rot' as string]: '-2deg' }}><LoginPoster src="/posters/anime.png" play /></div>
          </div>
        </div>

        <div>
          <div className="flex items-center gap-2.5 mb-5">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-accent to-accent-strong flex items-center justify-center text-black text-sm font-black shadow-accent-glow">V</div>
            <span className="text-xl font-black tracking-tight">Vortex</span>
          </div>
          <h2 className="text-3xl font-black tracking-tight leading-tight mb-3">Your private cinema,<br /><span className="text-gradient-amber">one sign-in away.</span></h2>
          <p className="text-text-2 text-sm max-w-sm leading-relaxed">Search, download, and stream — even 4K &amp; x265 play right in your browser, with subtitles and resume.</p>
        </div>
      </div>

      {/* Right — sign-in */}
      <div className="relative z-10 flex-1 flex flex-col">
        <div className="flex-1 flex items-center justify-center px-4 py-8 overflow-y-auto">
          <div className="w-full max-w-[400px] animate-fade-up">
            <div className="relative p-8 md:p-10 rounded-3xl bg-surface/80 border border-white/[0.07] shadow-cinema-lg backdrop-blur-xl">
              <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-accent/60 to-transparent" />

              <div className="flex flex-col items-center mb-8">
                <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-accent to-accent-strong flex items-center justify-center text-black text-2xl font-black shadow-accent-glow mb-5">V</div>
                <h1 className="text-2xl font-black tracking-tight mb-1.5">Welcome back</h1>
                <p className="text-sm text-text-2 text-center">Sign in to your private torrent &amp; streaming hub</p>
              </div>

              <button onClick={handleGoogleSignIn} disabled={signingIn}
                className="w-full flex items-center justify-center gap-3 px-6 py-4 rounded-2xl bg-white text-black font-semibold text-[15px] hover:bg-white/90 transition-all disabled:opacity-50 disabled:cursor-not-allowed shadow-cinema hover:scale-[1.01] active:scale-[0.99]">
                {signingIn ? <div className="w-5 h-5 border-2 border-black/20 border-t-black/60 rounded-full animate-spin" /> : (
                  <svg width="20" height="20" viewBox="0 0 24 24">
                    <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4" />
                    <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
                    <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05" />
                    <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
                  </svg>
                )}
                {signingIn ? "Signing in..." : "Continue with Google"}
              </button>

              {error && <div className="mt-4 p-3.5 rounded-xl bg-danger/10 border border-danger/20 text-danger text-sm text-center font-medium">{error}</div>}

              <div className="mt-7 space-y-2.5">
                {[
                  { i: <path d="M3 11h18v11H3zM7 11V7a5 5 0 0 1 10 0v4" />, t: "Private & encrypted — your data alone" },
                  { i: <path d="M13 2 3 14h9l-1 8 10-12h-9l1-8z" />, t: "Stream instantly, even while downloading" },
                  { i: <><circle cx="12" cy="12" r="10" /><path d="M2 12h20M12 2a15 15 0 0 1 0 20 15 15 0 0 1 0-20z" /></>, t: "Manage from any device, anywhere" },
                ].map((item, i) => (
                  <div key={i} className="flex items-center gap-3.5 px-3 py-2.5 rounded-xl bg-white/[0.02] border border-white/[0.06]">
                    <span className="w-8 h-8 rounded-lg bg-accent/10 flex items-center justify-center text-accent shrink-0">
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">{item.i}</svg>
                    </span>
                    <span className="text-sm text-text-2">{item.t}</span>
                  </div>
                ))}
              </div>
            </div>

            <p className="mt-7 text-center text-xs text-text-3">
              By signing in, you agree to our{" "}
              <a href="/terms" className="text-text-2 hover:text-accent transition-colors underline underline-offset-2">Terms</a> and{" "}
              <a href="/privacy" className="text-text-2 hover:text-accent transition-colors underline underline-offset-2">Privacy Policy</a>.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

function LoginPoster({ src, play, dim }: { src: string; play?: boolean; dim?: boolean }) {
  return (
    <div className={`relative rounded-[20px] overflow-hidden poster-ratio border border-white/10 shadow-[0_40px_85px_-28px_rgba(0,0,0,0.92)] ${play ? "ring-1 ring-accent/40" : ""} ${dim ? "brightness-[0.6] saturate-[0.9]" : ""}`}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={src} alt="" className="w-full h-full object-cover" />
      <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/5 to-transparent" />
      {play && (
        <>
          <div className="absolute inset-0 flex items-center justify-center">
            <span className="relative flex items-center justify-center">
              <span className="absolute w-16 h-16 rounded-full bg-accent/25 animate-glow-breathe" />
              <span className="relative w-12 h-12 rounded-full bg-accent text-black flex items-center justify-center shadow-accent-glow ring-4 ring-black/25">
                <svg className="w-5 h-5 ml-0.5" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z" /></svg>
              </span>
            </span>
          </div>
          <div className="absolute bottom-3 inset-x-3"><div className="h-1 rounded-full bg-white/25 overflow-hidden"><div className="h-full w-2/5 bg-accent rounded-full" /></div></div>
        </>
      )}
    </div>
  );
}
