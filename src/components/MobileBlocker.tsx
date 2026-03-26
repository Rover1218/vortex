"use client";

import { useState, useEffect } from "react";

export default function MobileBlocker({ children }: { children: React.ReactNode }) {
  const [isMobile, setIsMobile] = useState(false);
  const [checked, setChecked] = useState(false);

  useEffect(() => {
    const checkMobile = () => {
      const userAgent = navigator.userAgent || navigator.vendor;
      const mobileRegex = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini|Mobile|mobile|CriOS/i;
      const isTouchDevice = "ontouchstart" in window && window.innerWidth < 1024;
      setIsMobile(mobileRegex.test(userAgent) || isTouchDevice);
      setChecked(true);
    };
    checkMobile();
    window.addEventListener("resize", checkMobile);
    return () => window.removeEventListener("resize", checkMobile);
  }, []);

  if (!checked) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-base">
        <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-accent to-teal flex items-center justify-center text-white text-lg font-black animate-pulse">V</div>
      </div>
    );
  }

  if (isMobile) {
    return (
      <div className="min-h-screen bg-base text-text-1 flex items-center justify-center p-6 relative overflow-hidden">
        {/* Background */}
        <div className="absolute inset-0 pointer-events-none">
          <div className="absolute top-[-30%] left-[-10%] w-[500px] h-[500px] bg-accent/[0.06] rounded-full blur-[120px]" />
          <div className="absolute bottom-[-20%] right-[-10%] w-[400px] h-[400px] bg-teal/[0.04] rounded-full blur-[100px]" />
        </div>

        <div className="relative z-10 text-center max-w-sm mx-auto">
          {/* Logo */}
          <div className="relative inline-block mb-8">
            <div className="absolute inset-0 w-20 h-20 rounded-2xl bg-gradient-to-br from-accent to-teal blur-xl opacity-40" />
            <div className="relative w-20 h-20 rounded-2xl bg-gradient-to-br from-accent to-teal flex items-center justify-center text-white text-3xl font-black shadow-xl ring-1 ring-white/10 mx-auto">
              V
            </div>
          </div>

          <h1 className="text-3xl font-black tracking-tight text-white mb-3">Desktop Only</h1>
          <p className="text-base text-text-2 leading-relaxed mb-8">
            Vortex is designed for desktop browsers only. Please visit us from your PC or laptop for the best experience.
          </p>

          {/* Device illustration */}
          <div className="flex items-center justify-center gap-6 mb-8">
            {/* Mobile - crossed out */}
            <div className="relative">
              <div className="w-12 h-20 rounded-xl border-2 border-danger/40 flex items-center justify-center">
                <div className="w-6 h-10 rounded bg-danger/10" />
              </div>
              <div className="absolute inset-0 flex items-center justify-center">
                <div className="w-14 h-0.5 bg-danger/60 rotate-45 rounded" />
              </div>
            </div>

            <div className="text-text-3 text-2xl">→</div>

            {/* Desktop - check */}
            <div className="relative">
              <div className="w-20 h-14 rounded-xl border-2 border-teal/40 flex items-center justify-center mb-1">
                <div className="w-12 h-7 rounded bg-teal/10 flex items-center justify-center">
                  <svg width="16" height="16" viewBox="0 0 16 16" fill="none" className="text-teal">
                    <path d="M3 8l3.5 3.5L13 5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </div>
              </div>
              <div className="w-8 h-1 rounded bg-teal/30 mx-auto" />
            </div>
          </div>

          <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-accent/[0.08] border border-accent/15">
            <span className="text-xs text-accent font-medium">Open on your desktop to continue</span>
          </div>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}
