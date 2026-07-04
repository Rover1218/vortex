"use client";

import Link from "next/link";
import { useAuth } from "@/context/AuthContext";
import { usePremium } from "@/context/PremiumContext";

/**
 * Release Radar is a premium feature. Premium users see the real content;
 * everyone else sees it blurred behind an upgrade card. While entitlement is
 * still loading we render the content unlocked to avoid flashing the lock at
 * premium users — free users get locked a beat later.
 */
export default function RadarPremiumGate({ children }: { children: React.ReactNode }) {
    const { user } = useAuth();
    const { isPremium, loading } = usePremium();

    if (loading || isPremium) return <>{children}</>;

    return (
        <div className="relative">
            <div className="pointer-events-none select-none blur-md opacity-30 max-h-[75vh] overflow-hidden" aria-hidden>
                {children}
            </div>
            <div className="absolute inset-0 flex items-start justify-center pt-16">
                <div className="mx-6 max-w-sm text-center px-8 py-10 rounded-2xl bg-surface/95 border border-white/[0.08] shadow-2xl backdrop-blur-sm">
                    <div className="mx-auto mb-5 flex h-12 w-12 items-center justify-center rounded-xl bg-accent/15 border border-accent/30 text-accent">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="h-6 w-6">
                            <path d="m2 8 4 10h12l4-10-6 4-4-7-4 7z" />
                        </svg>
                    </div>
                    <h2 className="text-lg font-bold text-text-1 mb-2">Release Radar is Premium</h2>
                    <p className="text-sm text-text-2 leading-relaxed mb-6">
                        Track upcoming movies, shows, and anime — with weekly airing schedules — on any Premium plan.
                    </p>
                    {user ? (
                        <Link
                            href="/upgrade"
                            className="inline-block px-6 py-2.5 rounded-xl bg-accent text-black text-sm font-bold hover:brightness-110 transition-all"
                        >
                            See plans
                        </Link>
                    ) : (
                        <Link
                            href="/login"
                            className="inline-block px-6 py-2.5 rounded-xl bg-accent text-black text-sm font-bold hover:brightness-110 transition-all"
                        >
                            Sign in to upgrade
                        </Link>
                    )}
                </div>
            </div>
        </div>
    );
}
