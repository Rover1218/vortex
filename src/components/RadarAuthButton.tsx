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
                className="rounded-xl bg-gradient-to-r from-accent to-teal px-5 py-2.5 text-sm font-bold text-white shadow-[0_18px_30px_-20px_rgba(57,160,255,0.95)]"
            >
                Open App
            </Link>
        );
    }

    return (
        <Link
            href="/login"
            className="rounded-xl bg-gradient-to-r from-accent to-teal px-5 py-2.5 text-sm font-bold text-white shadow-[0_18px_30px_-20px_rgba(57,160,255,0.95)]"
        >
            Sign In
        </Link>
    );
}
