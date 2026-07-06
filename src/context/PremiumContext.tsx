"use client";

import React, { createContext, useContext, useEffect, useState, useCallback, useMemo } from "react";
import { doc, onSnapshot, Timestamp } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useAuth } from "./AuthContext";
import { isPremiumActive } from "@/lib/premium/entitlement";

export type LimitReason = "download-limit" | "streaming" | "subtitles" | "release-radar" | "speed";

interface EntitlementSnapshot {
    isLifetime: boolean;
    premiumUntilMs: number | null;
    plan: string;
    firstPurchaseUsed: boolean;
}

interface PremiumContextType {
    isPremium: boolean;
    isLifetime: boolean;
    plan: string;
    premiumUntil: Date | null;
    /** True once the account has made any payment — hides the first-purchase bonus badge. */
    firstPurchaseUsed: boolean;
    loading: boolean;
    isAdmin: boolean;
    limitModalOpen: boolean;
    limitReason: LimitReason;
    openLimitModal: (reason: LimitReason) => void;
    closeLimitModal: () => void;
}

const PremiumContext = createContext<PremiumContextType>({
    isPremium: false,
    isLifetime: false,
    plan: "free",
    premiumUntil: null,
    firstPurchaseUsed: false,
    loading: true,
    isAdmin: false,
    limitModalOpen: false,
    limitReason: "download-limit",
    openLimitModal: () => {},
    closeLimitModal: () => {},
});

export function PremiumProvider({ children }: { children: React.ReactNode }) {
    const { user } = useAuth();
    const [loading, setLoading] = useState(true);
    const [ent, setEnt] = useState<EntitlementSnapshot | null>(null);
    const [limitModalOpen, setLimitModalOpen] = useState(false);
    const [limitReason, setLimitReason] = useState<LimitReason>("download-limit");

    useEffect(() => {
        if (!user) {
            setEnt(null);
            setLoading(false);
            return;
        }
        setLoading(true);
        // Entitlement is written exclusively by the server (firebase-admin);
        // clients only ever listen. A missing doc means the free tier.
        const ref = doc(db, "users", user.uid, "config", "entitlement");
        const unsubscribe = onSnapshot(
            ref,
            (snap) => {
                const data = snap.data();
                if (!data) {
                    setEnt(null);
                } else {
                    setEnt({
                        isLifetime: !!data.isLifetime,
                        premiumUntilMs: data.premiumUntil instanceof Timestamp ? data.premiumUntil.toMillis() : null,
                        plan: typeof data.plan === "string" ? data.plan : "free",
                        firstPurchaseUsed: !!data.firstPurchaseUsed,
                    });
                }
                setLoading(false);
            },
            (error) => {
                console.error("Entitlement listener error:", error);
                setEnt(null);
                setLoading(false);
            }
        );
        return () => unsubscribe();
    }, [user]);

    const openLimitModal = useCallback((reason: LimitReason) => {
        setLimitReason(reason);
        setLimitModalOpen(true);
    }, []);
    const closeLimitModal = useCallback(() => setLimitModalOpen(false), []);

    const value = useMemo<PremiumContextType>(() => {
        const isPremium = isPremiumActive(
            ent ? { isLifetime: ent.isLifetime, premiumUntilMs: ent.premiumUntilMs } : null,
            Date.now()
        );
        return {
            isPremium,
            isLifetime: !!ent?.isLifetime,
            plan: isPremium ? (ent?.plan ?? "free") : "free",
            premiumUntil: ent?.premiumUntilMs ? new Date(ent.premiumUntilMs) : null,
            firstPurchaseUsed: !!ent?.firstPurchaseUsed,
            loading,
            isAdmin: !!user && !!process.env.NEXT_PUBLIC_ADMIN_UID && user.uid === process.env.NEXT_PUBLIC_ADMIN_UID,
            limitModalOpen,
            limitReason,
            openLimitModal,
            closeLimitModal,
        };
    }, [ent, loading, user, limitModalOpen, limitReason, openLimitModal, closeLimitModal]);

    return <PremiumContext.Provider value={value}>{children}</PremiumContext.Provider>;
}

export const usePremium = () => useContext(PremiumContext);
