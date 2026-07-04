"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ShieldCheck, Ticket, UserPlus, Copy, Ban, RefreshCw } from "lucide-react";
import { auth } from "@/lib/firebase";
import { usePremium } from "@/context/PremiumContext";
import { COUPON_DURATIONS } from "@/lib/premium/plans";

interface CouponRow {
    id: string;
    durationDays: number | null;
    isLifetime: boolean;
    createdAt: string | null;
    redeemedBy: string | null;
    redeemedByEmail: string | null;
    redeemedAt: string | null;
    revoked: boolean;
}

async function adminCall(body: Record<string, unknown>) {
    const token = await auth.currentUser?.getIdToken();
    if (!token) throw new Error("Sign in again");
    const res = await fetch("/api/premium/admin", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify(body),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Request failed");
    return data;
}

function durationLabel(row: CouponRow) {
    if (row.isLifetime) return "Lifetime";
    const match = COUPON_DURATIONS.find((d) => d.durationDays === row.durationDays);
    return match?.label ?? `${row.durationDays} days`;
}

export default function AdminPage() {
    const { isAdmin, loading } = usePremium();
    const router = useRouter();

    const [coupons, setCoupons] = useState<CouponRow[]>([]);
    const [listLoading, setListLoading] = useState(false);
    const [genDuration, setGenDuration] = useState<string>("30");
    const [genCount, setGenCount] = useState(5);
    const [genBusy, setGenBusy] = useState(false);
    const [newCodes, setNewCodes] = useState<string[]>([]);
    const [grantEmail, setGrantEmail] = useState("");
    const [grantDuration, setGrantDuration] = useState<string>("30");
    const [grantBusy, setGrantBusy] = useState(false);
    const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

    useEffect(() => {
        if (!loading && !isAdmin) router.replace("/search");
    }, [loading, isAdmin, router]);

    const refreshList = useCallback(async () => {
        setListLoading(true);
        try {
            const data = await adminCall({ action: "list" });
            setCoupons(data.coupons ?? []);
        } catch (err) {
            setMessage({ ok: false, text: err instanceof Error ? err.message : "Could not load coupons" });
        } finally {
            setListLoading(false);
        }
    }, []);

    useEffect(() => {
        if (isAdmin) refreshList();
    }, [isAdmin, refreshList]);

    const generate = async () => {
        setGenBusy(true);
        setMessage(null);
        try {
            const durationDays = genDuration === "lifetime" ? null : Number(genDuration);
            const data = await adminCall({ action: "generate", count: genCount, durationDays });
            setNewCodes(data.codes ?? []);
            setMessage({ ok: true, text: `Generated ${data.codes?.length ?? 0} codes — copy them now, they are stored hashed.` });
            refreshList();
        } catch (err) {
            setMessage({ ok: false, text: err instanceof Error ? err.message : "Generation failed" });
        } finally {
            setGenBusy(false);
        }
    };

    const grant = async (remove: boolean) => {
        if (!grantEmail.trim()) return;
        setGrantBusy(true);
        setMessage(null);
        try {
            const durationDays = grantDuration === "lifetime" ? null : Number(grantDuration);
            const data = await adminCall({ action: "grant", email: grantEmail.trim(), durationDays, remove });
            setMessage({ ok: true, text: remove ? `Premium removed for ${data.email}` : `Premium granted to ${data.email}` });
        } catch (err) {
            setMessage({ ok: false, text: err instanceof Error ? err.message : "Grant failed" });
        } finally {
            setGrantBusy(false);
        }
    };

    const revoke = async (id: string) => {
        setMessage(null);
        try {
            await adminCall({ action: "revoke", id });
            refreshList();
        } catch (err) {
            setMessage({ ok: false, text: err instanceof Error ? err.message : "Revoke failed" });
        }
    };

    if (loading || !isAdmin) return null;

    return (
        <div className="max-w-5xl mx-auto pb-16">
            <div className="mb-8">
                <h1 className="text-2xl font-bold text-text-1 flex items-center gap-2.5">
                    <ShieldCheck className="text-accent" size={24} /> Admin
                </h1>
                <p className="text-sm text-text-2 mt-1.5">Coupon codes and manual premium grants. Server-enforced — this page is just the controls.</p>
            </div>

            {message && (
                <div className={`mb-6 px-4 py-3 rounded-xl text-sm border ${message.ok ? "bg-teal/10 border-teal/30 text-teal" : "bg-red-500/10 border-red-500/30 text-red-400"}`}>
                    {message.text}
                </div>
            )}

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-8">
                <div className="rounded-2xl bg-surface border border-white/[0.06] p-6">
                    <h2 className="text-sm font-bold text-text-1 flex items-center gap-2 mb-4">
                        <UserPlus size={16} className="text-accent" /> Grant premium by email
                    </h2>
                    <input
                        value={grantEmail}
                        onChange={(e) => setGrantEmail(e.target.value)}
                        placeholder="user@gmail.com"
                        className="w-full px-4 py-2.5 rounded-xl bg-base border border-white/[0.08] text-sm text-text-1 placeholder:text-text-3 focus:outline-none focus:border-accent/50 mb-3"
                    />
                    <div className="flex gap-3">
                        <select
                            value={grantDuration}
                            onChange={(e) => setGrantDuration(e.target.value)}
                            className="flex-1 px-3 py-2.5 rounded-xl bg-base border border-white/[0.08] text-sm text-text-1 focus:outline-none"
                        >
                            {COUPON_DURATIONS.map((d) => (
                                <option key={d.label} value={d.durationDays === null ? "lifetime" : String(d.durationDays)}>
                                    {d.label}
                                </option>
                            ))}
                        </select>
                        <button
                            onClick={() => grant(false)}
                            disabled={grantBusy || !grantEmail.trim()}
                            className="px-4 py-2.5 rounded-xl bg-accent text-black text-sm font-bold hover:brightness-110 disabled:opacity-50"
                        >
                            Grant
                        </button>
                        <button
                            onClick={() => grant(true)}
                            disabled={grantBusy || !grantEmail.trim()}
                            className="px-4 py-2.5 rounded-xl border border-red-500/40 text-red-400 text-sm font-bold hover:bg-red-500/10 disabled:opacity-50"
                        >
                            Remove
                        </button>
                    </div>
                </div>

                <div className="rounded-2xl bg-surface border border-white/[0.06] p-6">
                    <h2 className="text-sm font-bold text-text-1 flex items-center gap-2 mb-4">
                        <Ticket size={16} className="text-accent" /> Generate coupon codes
                    </h2>
                    <div className="flex gap-3 mb-3">
                        <select
                            value={genDuration}
                            onChange={(e) => setGenDuration(e.target.value)}
                            className="flex-1 px-3 py-2.5 rounded-xl bg-base border border-white/[0.08] text-sm text-text-1 focus:outline-none"
                        >
                            {COUPON_DURATIONS.map((d) => (
                                <option key={d.label} value={d.durationDays === null ? "lifetime" : String(d.durationDays)}>
                                    {d.label}
                                </option>
                            ))}
                        </select>
                        <input
                            type="number"
                            min={1}
                            max={100}
                            value={genCount}
                            onChange={(e) => setGenCount(Math.max(1, Math.min(100, Number(e.target.value) || 1)))}
                            className="w-24 px-3 py-2.5 rounded-xl bg-base border border-white/[0.08] text-sm text-text-1 focus:outline-none"
                        />
                        <button
                            onClick={generate}
                            disabled={genBusy}
                            className="px-4 py-2.5 rounded-xl bg-accent text-black text-sm font-bold hover:brightness-110 disabled:opacity-50"
                        >
                            {genBusy ? "…" : "Generate"}
                        </button>
                    </div>
                    {newCodes.length > 0 && (
                        <div className="rounded-xl bg-base border border-accent/30 p-4">
                            <div className="flex items-center justify-between mb-2">
                                <span className="text-xs font-bold text-accent">New codes (visible once)</span>
                                <button
                                    onClick={() => navigator.clipboard.writeText(newCodes.join("\n"))}
                                    className="flex items-center gap-1.5 text-xs text-text-2 hover:text-text-1"
                                >
                                    <Copy size={12} /> Copy all
                                </button>
                            </div>
                            <div className="font-mono text-xs text-text-1 space-y-1 max-h-40 overflow-y-auto">
                                {newCodes.map((c) => (
                                    <div key={c}>{c}</div>
                                ))}
                            </div>
                        </div>
                    )}
                </div>
            </div>

            <div className="rounded-2xl bg-surface border border-white/[0.06] overflow-hidden">
                <div className="flex items-center justify-between px-6 py-4 border-b border-white/[0.06]">
                    <h2 className="text-sm font-bold text-text-1">Coupons (latest 200)</h2>
                    <button onClick={refreshList} className="flex items-center gap-1.5 text-xs text-text-2 hover:text-text-1">
                        <RefreshCw size={12} className={listLoading ? "animate-spin" : ""} /> Refresh
                    </button>
                </div>
                <div className="overflow-x-auto">
                    <table className="w-full text-left text-xs">
                        <thead>
                            <tr className="text-text-3 border-b border-white/[0.06]">
                                <th className="px-6 py-3 font-medium">Created</th>
                                <th className="px-4 py-3 font-medium">Duration</th>
                                <th className="px-4 py-3 font-medium">Status</th>
                                <th className="px-4 py-3 font-medium">Redeemed by</th>
                                <th className="px-4 py-3 font-medium" />
                            </tr>
                        </thead>
                        <tbody>
                            {coupons.map((c) => (
                                <tr key={c.id} className="border-b border-white/[0.04] text-text-2">
                                    <td className="px-6 py-3 whitespace-nowrap">
                                        {c.createdAt ? new Date(c.createdAt).toLocaleDateString("en-IN", { day: "numeric", month: "short" }) : "—"}
                                    </td>
                                    <td className="px-4 py-3">{durationLabel(c)}</td>
                                    <td className="px-4 py-3">
                                        {c.revoked ? (
                                            <span className="px-2 py-0.5 rounded-full bg-red-500/10 text-red-400">revoked</span>
                                        ) : c.redeemedBy ? (
                                            <span className="px-2 py-0.5 rounded-full bg-teal/10 text-teal">redeemed</span>
                                        ) : (
                                            <span className="px-2 py-0.5 rounded-full bg-white/[0.06] text-text-2">unused</span>
                                        )}
                                    </td>
                                    <td className="px-4 py-3">{c.redeemedByEmail ?? "—"}</td>
                                    <td className="px-4 py-3 text-right">
                                        {!c.redeemedBy && !c.revoked && (
                                            <button
                                                onClick={() => revoke(c.id)}
                                                className="inline-flex items-center gap-1 text-red-400/80 hover:text-red-400"
                                                title="Revoke this code"
                                            >
                                                <Ban size={12} /> Revoke
                                            </button>
                                        )}
                                    </td>
                                </tr>
                            ))}
                            {coupons.length === 0 && !listLoading && (
                                <tr>
                                    <td colSpan={5} className="px-6 py-8 text-center text-text-3">
                                        No coupons yet — generate some above.
                                    </td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
}
