"use client";

import { useEffect, useState } from "react";
import { useFormStatus } from "react-dom";

const REFRESH_COOLDOWN_MS = 30000;

export default function RefreshRadarButton() {
    const { pending } = useFormStatus();
    const [cooldownUntil, setCooldownUntil] = useState(0);
    const [now, setNow] = useState(Date.now());

    useEffect(() => {
        if (cooldownUntil <= Date.now()) return;

        const timer = window.setInterval(() => {
            setNow(Date.now());
        }, 1000);

        return () => window.clearInterval(timer);
    }, [cooldownUntil]);

    const cooldownActive = cooldownUntil > now;
    const cooldownSeconds = Math.max(0, Math.ceil((cooldownUntil - now) / 1000));

    return (
        <button
            type="submit"
            disabled={pending || cooldownActive}
            onClick={() => {
                if (!pending && !cooldownActive) {
                    const next = Date.now() + REFRESH_COOLDOWN_MS;
                    setCooldownUntil(next);
                    setNow(Date.now());
                }
            }}
            className="rounded-xl border border-white/[0.12] bg-white/[0.04] px-4 py-2.5 text-sm font-bold text-white transition-colors disabled:cursor-not-allowed disabled:opacity-60 hover:bg-white/[0.08]"
        >
            {pending ? "Refreshing..." : cooldownActive ? `Wait ${cooldownSeconds}s` : "Refresh now"}
        </button>
    );
}
