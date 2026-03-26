"use client";

import { useAuth } from "@/context/AuthContext";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

export default function LoginPage() {
  const { user, loading, signInWithGoogle } = useAuth();
  const router = useRouter();
  const [signingIn, setSigningIn] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => { if (!loading && user) router.push("/search"); }, [user, loading, router]);

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
        <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-accent to-teal flex items-center justify-center text-white text-lg font-black animate-pulse">V</div>
      </div>
    );
  }
  if (user) return null;

  return (
    <div className="min-h-screen bg-base text-text-1 flex flex-col relative overflow-hidden">
      {/* Static ambient glow */}
      <div className="fixed inset-0 pointer-events-none" style={{
        background: "radial-gradient(ellipse 50% 50% at 40% 30%, rgba(124,106,255,0.06) 0%, transparent 70%), radial-gradient(ellipse 40% 40% at 70% 80%, rgba(0,232,176,0.04) 0%, transparent 70%)"
      }} />

      {/* Nav */}
      <nav className="relative z-20 flex items-center justify-between px-6 md:px-12 py-5 max-w-7xl mx-auto w-full" style={{ animation: "fadeIn 0.5s ease" }}>
        <button onClick={() => router.push("/")} className="flex items-center gap-2 text-text-3 hover:text-white transition-colors duration-300 group">
          <svg width="18" height="18" viewBox="0 0 16 16" fill="none" className="group-hover:-translate-x-0.5 transition-transform">
            <path d="M10 12L6 8L10 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          <span className="text-sm font-medium">Back to home</span>
        </button>
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-accent to-teal flex items-center justify-center text-white text-[10px] font-black">V</div>
          <span className="text-sm font-bold text-white">Vortex</span>
        </div>
      </nav>

      {/* Main */}
      <div className="flex-1 flex items-center justify-center px-4 py-8 relative z-10">
        <div className="w-full max-w-[420px]" style={{ animation: "fadeUp 0.6s ease" }}>
          {/* Card */}
          <div className="relative">
            <div className="absolute -inset-0.5 bg-gradient-to-br from-accent/20 via-transparent to-teal/20 rounded-[28px] opacity-40" />
            <div className="relative p-8 md:p-10 rounded-[24px] bg-[#0e0e1a]/90 border border-white/[0.07] shadow-2xl shadow-black/50">
              {/* Logo */}
              <div className="flex flex-col items-center mb-8">
                <div className="relative mb-5">
                  <div className="absolute inset-0 w-16 h-16 rounded-2xl bg-gradient-to-br from-accent to-teal opacity-40" style={{ filter: "blur(12px)" }} />
                  <div className="relative w-16 h-16 rounded-2xl bg-gradient-to-br from-accent to-teal flex items-center justify-center text-white text-2xl font-black shadow-lg ring-1 ring-white/10">V</div>
                </div>
                <h1 className="text-2xl font-black tracking-tight text-white mb-1.5">Welcome back</h1>
                <p className="text-sm text-text-2 text-center">Sign in to access your private torrent manager</p>
              </div>

              {/* Google Sign In */}
              <button
                onClick={handleGoogleSignIn} disabled={signingIn}
                className="w-full flex items-center justify-center gap-3 px-6 py-4 rounded-2xl bg-white text-[#1f1f1f] font-semibold text-[15px] hover:bg-gray-50 transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed shadow-xl shadow-black/15 hover:shadow-2xl hover:shadow-black/25 hover:scale-[1.01] active:scale-[0.99] ring-1 ring-black/5 mb-4">
                {signingIn ? (
                  <div className="w-5 h-5 border-2 border-gray-300 border-t-gray-600 rounded-full animate-spin" />
                ) : (
                  <svg width="20" height="20" viewBox="0 0 24 24">
                    <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 01-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4"/>
                    <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
                    <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
                    <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
                  </svg>
                )}
                {signingIn ? "Signing in..." : "Continue with Google"}
              </button>

              {error && (
                <div className="mb-4 p-3.5 rounded-xl bg-danger/10 border border-danger/20 text-danger text-sm text-center font-medium">{error}</div>
              )}

              {/* Divider */}
              <div className="flex items-center gap-4 my-6">
                <div className="flex-1 h-px bg-gradient-to-r from-transparent via-white/[0.06] to-transparent" />
              </div>

              {/* Trust signals */}
              <div className="space-y-3">
                {[
                  {icon:(<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0110 0v4"/></svg>),text:"Your data is private and encrypted",color:"teal"},
                  {icon:(<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>),text:"Instant access to all features",color:"accent"},
                  {icon:(<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 014 10 15.3 15.3 0 01-4 10 15.3 15.3 0 01-4-10 15.3 15.3 0 014-10z"/></svg>),text:"Manage from any device, anywhere",color:"[#ff6b9d]"},
                ].map((item,i)=>(
                  <div key={i} className="flex items-center gap-3.5 px-3 py-2.5 rounded-xl bg-white/[0.02] border border-white/[0.03]">
                    <div className={`w-8 h-8 rounded-lg bg-${item.color}/10 flex items-center justify-center text-${item.color} shrink-0`}>{item.icon}</div>
                    <span className="text-sm text-text-2">{item.text}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Footer */}
          <div className="mt-8 text-center space-y-3">
            <p className="text-xs text-text-3">
              By signing in, you agree to our{" "}
              <a href="/terms" className="text-text-2 hover:text-white transition-colors underline underline-offset-2">Terms of Service</a>
              {" "}and{" "}
              <a href="/privacy" className="text-text-2 hover:text-white transition-colors underline underline-offset-2">Privacy Policy</a>
            </p>
          </div>
        </div>
      </div>

      <style jsx>{`
        @keyframes fadeIn {
          from { opacity: 0; transform: translateY(-10px); }
          to { opacity: 1; transform: translateY(0); }
        }
        @keyframes fadeUp {
          from { opacity: 0; transform: translateY(20px); }
          to { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </div>
  );
}
