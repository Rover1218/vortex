"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { motion } from "framer-motion";
import { Crown, Check, Ticket, Loader2, PartyPopper, Gift } from "lucide-react";
import { auth } from "@/lib/firebase";
import { usePremium } from "@/context/PremiumContext";
import { PLANS, FIRST_PURCHASE_BONUS_DAYS, type PlanId } from "@/lib/premium/plans";

const PLAN_FEATURES = [
    "Unlimited simultaneous downloads",
    "Stream while downloading",
    "Automatic subtitles",
    "Release Radar",
];

const FREE_FEATURES = ["Search all sources", "2 downloads at a time", "Unlimited seeding", "Watch completed files"];

function formatDate(d: Date) {
    return d.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
}

function UpgradePageInner() {
    const { isPremium, isLifetime, premiumUntil, loading } = usePremium();
    const searchParams = useSearchParams();
    const cameFromPayment = searchParams.get("status") === "success";

    const [buying, setBuying] = useState<PlanId | null>(null);
    const [buyError, setBuyError] = useState<string | null>(null);
    const [code, setCode] = useState("");
    const [redeeming, setRedeeming] = useState(false);
    const [redeemMsg, setRedeemMsg] = useState<{ ok: boolean; text: string } | null>(null);
    const [waitingActivation, setWaitingActivation] = useState(cameFromPayment);
    const [activationSlow, setActivationSlow] = useState(false);

    // After returning from checkout, the webhook usually lands within seconds;
    // the entitlement snapshot flips isPremium live, so we just wait for it.
    useEffect(() => {
        if (waitingActivation && isPremium) setWaitingActivation(false);
    }, [waitingActivation, isPremium]);

    // If the webhook is delayed, stop implying it's about to finish and tell
    // the buyer their money is safe instead of spinning forever.
    useEffect(() => {
        if (!waitingActivation) return;
        const id = setTimeout(() => setActivationSlow(true), 60_000);
        return () => clearTimeout(id);
    }, [waitingActivation]);

    const startCheckout = async (plan: PlanId) => {
        setBuyError(null);
        setBuying(plan);
        try {
            const token = await auth.currentUser?.getIdToken();
            if (!token) throw new Error("Sign in again");
            const res = await fetch("/api/premium/checkout", {
                method: "POST",
                headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
                body: JSON.stringify({ plan }),
            });
            const data = await res.json();
            if (!res.ok || !data.checkout_url) throw new Error(data.error || "Could not start checkout");
            window.location.href = data.checkout_url;
        } catch (err) {
            setBuyError(err instanceof Error ? err.message : "Could not start checkout");
            setBuying(null);
        }
    };

    const redeem = async () => {
        if (!code.trim() || redeeming) return;
        setRedeeming(true);
        setRedeemMsg(null);
        try {
            const token = await auth.currentUser?.getIdToken();
            if (!token) throw new Error("Sign in again");
            const res = await fetch("/api/premium/redeem", {
                method: "POST",
                headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
                body: JSON.stringify({ code }),
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || "Could not redeem");
            setCode("");
            setRedeemMsg({
                ok: true,
                text: data.durationDays === null ? "Lifetime premium activated. Enjoy!" : `Premium extended by ${data.durationDays} days.`,
            });
        } catch (err) {
            setRedeemMsg({ ok: false, text: err instanceof Error ? err.message : "Could not redeem" });
        } finally {
            setRedeeming(false);
        }
    };

    return (
        <div className="max-w-5xl mx-auto pb-16">
            <div className="mb-8">
                <h1 className="text-2xl font-bold text-text-1 flex items-center gap-2.5">
                    <Crown className="text-accent" size={24} /> Vortex Premium
                </h1>
                <p className="text-sm text-text-2 mt-1.5">One-time payments, no auto-renewal. UPI for India, cards worldwide.</p>
            </div>

            {waitingActivation && !isPremium && (
                <div className="mb-6 flex items-center gap-3 px-5 py-4 rounded-2xl bg-accent/10 border border-accent/30 text-sm text-text-1">
                    <Loader2 className="animate-spin text-accent" size={18} />
                    {activationSlow
                        ? "Activation is taking longer than usual. Your payment is safe — leave this page open, or check back in a few minutes. Still locked after that? Contact support with your payment email and it will be activated manually."
                        : "Payment received — activating your premium… this usually takes a few seconds."}
                </div>
            )}

            {isPremium && (
                <div className="mb-6 flex items-center gap-3 px-5 py-4 rounded-2xl bg-teal/10 border border-teal/30 text-sm text-text-1">
                    <PartyPopper className="text-teal" size={18} />
                    {isLifetime
                        ? "You have Lifetime Premium. Everything is unlocked, forever."
                        : `Premium is active${premiumUntil ? ` until ${formatDate(premiumUntil)}` : ""}. Buying more time stacks on top.`}
                </div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-10">
                {(Object.keys(PLANS) as PlanId[]).map((planId) => {
                    const plan = PLANS[planId];
                    const highlight = planId === "lifetime";
                    return (
                        <motion.div
                            key={planId}
                            whileHover={{ y: -3 }}
                            className={`relative rounded-2xl p-6 border flex flex-col ${
                                highlight ? "bg-accent/[0.07] border-accent/40" : "bg-surface border-white/[0.06]"
                            }`}
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
                            {plan.durationDays !== null && (
                                <div className="mt-2 self-start inline-flex items-center gap-1.5 px-2 py-1 rounded-md bg-teal/10 border border-teal/30 text-[10px] font-bold text-teal">
                                    <Gift size={11} /> First purchase: +{FIRST_PURCHASE_BONUS_DAYS} days free
                                </div>
                            )}
                            <ul className="mt-5 space-y-2 flex-1">
                                {PLAN_FEATURES.map((f) => (
                                    <li key={f} className="flex items-center gap-2 text-xs text-text-2">
                                        <Check size={13} className="text-teal shrink-0" /> {f}
                                    </li>
                                ))}
                            </ul>
                            <button
                                onClick={() => startCheckout(planId)}
                                disabled={buying !== null || (isLifetime && loading === false)}
                                className={`mt-6 w-full px-4 py-2.5 rounded-xl text-sm font-bold transition-all disabled:opacity-50 ${
                                    highlight
                                        ? "bg-accent text-black hover:brightness-110"
                                        : "bg-white/[0.06] text-text-1 hover:bg-white/[0.1] border border-white/[0.08]"
                                }`}
                            >
                                {buying === planId ? "Opening checkout…" : isLifetime ? "Already lifetime" : plan.tagline}
                            </button>
                        </motion.div>
                    );
                })}
            </div>

            {buyError && <p className="mb-8 -mt-6 text-sm text-red-400">{buyError}</p>}

            <div className="rounded-2xl bg-surface border border-white/[0.06] p-6 mb-10">
                <h2 className="text-sm font-bold text-text-1 flex items-center gap-2 mb-1.5">
                    <Ticket size={16} className="text-accent" /> Redeem a code
                </h2>
                <p className="text-xs text-text-3 mb-4">
                    {isLifetime
                        ? "You already have Lifetime Premium — codes can't add anything. Gift them to a friend instead."
                        : "Got a Vortex premium code? Redeem it here — it stacks with any active plan."}
                </p>
                <div className="flex gap-3 max-w-md">
                    <input
                        value={code}
                        onChange={(e) => setCode(e.target.value.toUpperCase())}
                        onKeyDown={(e) => e.key === "Enter" && redeem()}
                        placeholder="VTX-XXXX-XXXX-XXXX"
                        spellCheck={false}
                        disabled={isLifetime}
                        className="flex-1 px-4 py-2.5 rounded-xl bg-base border border-white/[0.08] text-sm text-text-1 font-mono tracking-wider placeholder:text-text-3 focus:outline-none focus:border-accent/50 disabled:opacity-40"
                    />
                    <button
                        onClick={redeem}
                        disabled={redeeming || !code.trim() || isLifetime}
                        className="px-5 py-2.5 rounded-xl bg-accent text-black text-sm font-bold hover:brightness-110 transition-all disabled:opacity-50"
                    >
                        {redeeming ? "Checking…" : "Redeem"}
                    </button>
                </div>
                {redeemMsg && (
                    <p className={`mt-3 text-sm ${redeemMsg.ok ? "text-teal" : "text-red-400"}`}>{redeemMsg.text}</p>
                )}
            </div>

            <div className="rounded-2xl border border-white/[0.06] p-6">
                <h2 className="text-sm font-bold text-text-1 mb-4">What free accounts keep</h2>
                <ul className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {FREE_FEATURES.map((f) => (
                        <li key={f} className="flex items-center gap-2 text-xs text-text-2">
                            <Check size={13} className="text-text-3 shrink-0" /> {f}
                        </li>
                    ))}
                </ul>
                <p className="text-[11px] text-text-3 mt-4">
                    Torrents you already added keep running no matter what. Payments are one-time (not subscriptions) and
                    handled by Dodo Payments; time from multiple purchases and codes always adds up.
                </p>
            </div>
        </div>
    );
}

export default function UpgradePage() {
    return (
        <Suspense fallback={null}>
            <UpgradePageInner />
        </Suspense>
    );
}
