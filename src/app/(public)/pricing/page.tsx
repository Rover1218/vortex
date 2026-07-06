"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import { Check, Gift, Crown, Zap, ShieldCheck, RefreshCw } from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { usePremium } from "@/context/PremiumContext";
import { PLANS, FIRST_PURCHASE_BONUS_DAYS, FREE_MAX_ACTIVE_DOWNLOADS, type PlanId } from "@/lib/premium/plans";

const PREMIUM_FEATURES = [
    "Unlimited simultaneous downloads",
    "Stream your files while they download",
    "Automatic subtitle fetching",
    "Release Radar calendar",
];

const FREE_FEATURES = [
    "Multi-source search",
    `${FREE_MAX_ACTIVE_DOWNLOADS} simultaneous downloads`,
    "Unlimited seeding",
    "Watch completed files",
    "Cloud-synced library & settings",
];

export default function PricingPage() {
    const { user } = useAuth();
    const { firstPurchaseUsed } = usePremium();
    const ctaHref = user ? "/upgrade" : "/login";
    const ctaLabel = user ? "Go to your plan" : "Sign in to get Premium";

    return (
        <div className="min-h-screen bg-base text-text-1">
            {/* Nav */}
            <nav className="sticky top-0 z-40 bg-base/70 backdrop-blur-xl border-b border-white/[0.06]">
                <div className="flex items-center justify-between px-6 md:px-12 py-4 max-w-7xl mx-auto">
                    <Link href="/" className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-accent to-accent-strong flex items-center justify-center text-black text-sm font-black shadow-accent-glow">V</div>
                        <span className="text-2xl font-black tracking-tight">Vortex</span>
                    </Link>
                    <div className="flex items-center gap-2">
                        <Link href="/" className="hidden md:inline-block px-4 py-2 text-sm font-medium text-text-2 hover:text-text-1 transition-colors">Home</Link>
                        <Link href="/release-radar" className="hidden md:inline-block px-4 py-2 text-sm font-medium text-text-2 hover:text-text-1 transition-colors">Release Radar</Link>
                        <Link href={ctaHref} className="btn-primary px-6">{user ? "Dashboard" : "Sign In"}</Link>
                    </div>
                </div>
            </nav>

            <main className="relative z-10 max-w-6xl mx-auto px-6 md:px-12 pb-20">
                {/* Hero */}
                <div className="text-center pt-14 pb-10">
                    <motion.h1
                        initial={{ opacity: 0, y: 16 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.6 }}
                        className="text-4xl md:text-6xl font-black tracking-tight"
                    >
                        Simple, honest <span className="text-gradient-amber">pricing</span>
                    </motion.h1>
                    <p className="text-text-2 mt-4 max-w-2xl mx-auto leading-relaxed">
                        One-time payments — no subscriptions, no auto-renewal, no card on file.
                        Premium unlocks software features on your account instantly after payment.
                        UPI, cards &amp; netbanking for India; international users can pay via PayPal by email.
                    </p>
                </div>

                {/* Plans */}
                <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                    {/* Free */}
                    <div className="rounded-2xl p-6 border border-white/[0.06] bg-surface flex flex-col">
                        <div className="text-sm font-semibold text-text-2">Free</div>
                        <div className="mt-2 flex items-baseline gap-2">
                            <span className="text-3xl font-black text-text-1">₹0</span>
                            <span className="text-xs text-text-3">forever</span>
                        </div>
                        <div className="text-xs text-text-3 mt-1">Everything you need to start</div>
                        <ul className="mt-5 space-y-2 flex-1">
                            {FREE_FEATURES.map((f) => (
                                <li key={f} className="flex items-center gap-2 text-xs text-text-2">
                                    <Check size={13} className="text-text-3 shrink-0" /> {f}
                                </li>
                            ))}
                        </ul>
                        <Link href={ctaHref} className="mt-6 w-full text-center px-4 py-2.5 rounded-xl border border-white/[0.08] text-sm font-bold text-text-2 hover:text-text-1 hover:bg-white/[0.04] transition-colors">
                            Start free
                        </Link>
                    </div>

                    {(Object.keys(PLANS) as PlanId[]).map((planId) => {
                        const plan = PLANS[planId];
                        const highlight = planId === "lifetime";
                        return (
                            <motion.div
                                key={planId}
                                whileHover={{ y: -3 }}
                                className={`relative rounded-2xl p-6 border flex flex-col ${highlight ? "bg-accent/[0.07] border-accent/40" : "bg-surface border-white/[0.06]"}`}
                            >
                                {highlight && (
                                    <span className="absolute -top-2.5 left-6 px-2.5 py-0.5 rounded-full bg-accent text-black text-[10px] font-black uppercase tracking-wide">
                                        Best value
                                    </span>
                                )}
                                <div className="text-sm font-semibold text-text-2">{plan.label}</div>
                                <div className="mt-2 flex items-baseline gap-2">
                                    <span className="text-3xl font-black text-text-1">₹{plan.inr.toLocaleString("en-IN")}</span>
                                    <span className="text-xs text-text-3">/ ${plan.usd} intl</span>
                                </div>
                                <div className="text-xs text-text-3 mt-1">
                                    {plan.durationDays === null ? "Pay once, premium forever" : `${plan.durationDays} days of premium`}
                                </div>
                                {plan.durationDays !== null && !firstPurchaseUsed && (
                                    <div className="mt-2 self-start inline-flex items-center gap-1.5 px-2 py-1 rounded-md bg-teal/10 border border-teal/30 text-[10px] font-bold text-teal">
                                        <Gift size={11} /> First purchase: +{FIRST_PURCHASE_BONUS_DAYS} days free
                                    </div>
                                )}
                                <ul className="mt-4 space-y-2 flex-1">
                                    {PREMIUM_FEATURES.map((f) => (
                                        <li key={f} className="flex items-center gap-2 text-xs text-text-2">
                                            <Check size={13} className="text-teal shrink-0" /> {f}
                                        </li>
                                    ))}
                                </ul>
                                <Link
                                    href={ctaHref}
                                    className={`mt-6 w-full text-center px-4 py-2.5 rounded-xl text-sm font-bold transition-all ${highlight ? "bg-accent text-black hover:brightness-110" : "bg-white/[0.06] text-text-1 hover:bg-white/[0.1] border border-white/[0.08]"}`}
                                >
                                    {ctaLabel}
                                </Link>
                            </motion.div>
                        );
                    })}
                </div>

                {/* How it works / trust strip */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-10">
                    <div className="rounded-2xl border border-white/[0.06] p-6">
                        <Zap size={18} className="text-accent mb-3" />
                        <h3 className="text-sm font-bold text-text-1 mb-1.5">Instant activation</h3>
                        <p className="text-xs text-text-3 leading-relaxed">
                            Pay with UPI, card, or your local payment method. Premium switches on for your
                            account automatically within seconds — nothing to install, no keys to enter.
                        </p>
                    </div>
                    <div className="rounded-2xl border border-white/[0.06] p-6">
                        <ShieldCheck size={18} className="text-accent mb-3" />
                        <h3 className="text-sm font-bold text-text-1 mb-1.5">Software features only</h3>
                        <p className="text-xs text-text-3 leading-relaxed">
                            Vortex doesn&apos;t host, provide, or stream any content. The engine runs on your own
                            computer and your files stay on your own disk. Premium unlocks features of the
                            software itself — never access to media.
                        </p>
                    </div>
                    <div className="rounded-2xl border border-white/[0.06] p-6">
                        <RefreshCw size={18} className="text-accent mb-3" />
                        <h3 className="text-sm font-bold text-text-1 mb-1.5">Fair &amp; flexible</h3>
                        <p className="text-xs text-text-3 leading-relaxed">
                            No auto-renewal — plans simply expire unless you top up, and time from multiple
                            purchases stacks. Something not working after a purchase? Contact us within 7 days
                            and we&apos;ll make it right, refund included.
                        </p>
                    </div>
                </div>

                {/* CTA */}
                <div className="text-center mt-14">
                    <Link href={ctaHref} className="inline-flex items-center gap-2 btn-primary px-8 py-3">
                        <Crown size={16} /> {ctaLabel}
                    </Link>
                    <p className="text-[11px] text-text-3 mt-4">
                        Payments are processed securely by Razorpay (UPI, cards, netbanking — India).
                    </p>
                    <p className="text-[11px] text-text-3 mt-1.5">
                        🌍 Outside India? Email{" "}
                        <a href="mailto:anindyakanti2020@gmail.com?subject=Vortex%20Premium%20(international)" className="text-accent hover:text-accent-strong underline underline-offset-2">
                            anindyakanti2020@gmail.com
                        </a>{" "}
                        — we&apos;ll take payment via PayPal and activate premium with a redeem code.
                    </p>
                </div>
            </main>

            {/* Footer */}
            <footer className="relative z-10 border-t border-white/[0.06]">
                <div className="max-w-7xl mx-auto px-6 md:px-12 py-8 flex flex-wrap items-center justify-between gap-4 text-xs text-text-3">
                    <span>© {new Date().getFullYear()} Vortex</span>
                    <div className="flex items-center gap-5">
                        <Link href="/pricing" className="hover:text-text-1 transition-colors">Pricing</Link>
                        <a href="/terms" className="hover:text-text-1 transition-colors">Terms</a>
                        <a href="/privacy" className="hover:text-text-1 transition-colors">Privacy</a>
                    </div>
                </div>
            </footer>
        </div>
    );
}
