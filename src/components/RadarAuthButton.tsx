"use client";

import Link from "next/link";
import { useAuth } from "@/context/AuthContext";

export default function RadarAuthButton() {
    const { user, loading } = useAuth();

    if (loading) return null;

    if (user) {
        return (
            <Link
                href="/search"
                className="rounded-xl bg-accent px-5 py-2.5 text-sm font-bold text-black shadow-accent-glow hover:bg-accent-strong transition-colors"
            >
                Open App
            </Link>
        );
    }

    return (
        <Link
            href="/login"
            className="rounded-xl bg-accent px-5 py-2.5 text-sm font-bold text-black shadow-accent-glow hover:bg-accent-strong transition-colors"
        >
            Sign In
        </Link>
    );
}
