"use client";

import Link from "next/link";
import { motion, AnimatePresence } from "framer-motion";
import { Crown, X } from "lucide-react";
import { usePremium, type LimitReason } from "@/context/PremiumContext";
import { FREE_MAX_ACTIVE_DOWNLOADS, FREE_MAX_DOWNLOAD_MBPS } from "@/lib/premium/plans";

const COPY: Record<LimitReason, { title: string; body: string }> = {
    "download-limit": {
        title: "Download limit reached",
        body: `Free accounts can download ${FREE_MAX_ACTIVE_DOWNLOADS} torrents at a time. Finish or remove one first — or go Premium for unlimited downloads.`,
    },
    streaming: {
        title: "Streaming while downloading is Premium",
        body: "Wait for the download to finish to watch it free, or go Premium to start watching instantly.",
    },
    subtitles: {
        title: "Auto-subtitles are Premium",
        body: "Premium fetches matching subtitles automatically for everything you download.",
    },
    "release-radar": {
        title: "Release Radar is Premium",
        body: "Track upcoming movie and show releases with Premium.",
    },
    speed: {
        title: "Full speed is Premium",
        body: `Free accounts are capped at ${FREE_MAX_DOWNLOAD_MBPS} MB/s download. Go Premium to unlock uncapped speed.`,
    },
};

export default function UpgradeModal() {
    const { limitModalOpen, limitReason, closeLimitModal } = usePremium();
    const copy = COPY[limitReason];

    return (
        <AnimatePresence>
            {limitModalOpen && (
                <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 backdrop-blur-sm"
                    onClick={closeLimitModal}
                >
                    <motion.div
                        initial={{ opacity: 0, scale: 0.95, y: 12 }}
                        animate={{ opacity: 1, scale: 1, y: 0 }}
                        exit={{ opacity: 0, scale: 0.95, y: 12 }}
                        transition={{ duration: 0.2 }}
                        className="relative w-full max-w-md mx-4 rounded-2xl bg-surface border border-white/[0.08] p-8 shadow-2xl"
                        onClick={(e) => e.stopPropagation()}
                    >
                        <button
                            onClick={closeLimitModal}
                            className="absolute top-4 right-4 p-1.5 rounded-lg text-text-3 hover:text-text-1 hover:bg-white/[0.06] transition-colors"
                            aria-label="Close"
                        >
                            <X size={16} />
                        </button>

                        <div className="w-12 h-12 rounded-xl bg-accent/15 border border-accent/30 flex items-center justify-center mb-5">
                            <Crown size={22} className="text-accent" />
                        </div>

                        <h2 className="text-lg font-bold text-text-1 mb-2">{copy.title}</h2>
                        <p className="text-sm text-text-2 leading-relaxed mb-6">{copy.body}</p>

                        <div className="flex items-center gap-3">
                            <Link
                                href="/upgrade"
                                onClick={closeLimitModal}
                                className="flex-1 text-center px-4 py-2.5 rounded-xl bg-accent text-black text-sm font-bold hover:brightness-110 transition-all"
                            >
                                See plans
                            </Link>
                            <button
                                onClick={closeLimitModal}
                                className="px-4 py-2.5 rounded-xl border border-white/[0.08] text-sm text-text-2 hover:text-text-1 hover:bg-white/[0.04] transition-colors"
                            >
                                Not now
                            </button>
                        </div>
                    </motion.div>
                </motion.div>
            )}
        </AnimatePresence>
    );
}
