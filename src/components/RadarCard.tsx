"use client";

import { useAuth } from "@/context/AuthContext";
import { useRouter } from "next/navigation";

type ChipTone = "accent" | "teal" | "violet" | "amber" | "rose" | "slate" | "neutral";
type Chip = { label: string; tone?: ChipTone };

function chipClass(tone: ChipTone = "neutral") {
    switch (tone) {
        case "accent": return "border-accent/25 bg-accent/12 text-accent";
        case "teal": return "border-teal/25 bg-teal/12 text-teal";
        case "violet": return "border-white/[0.10] bg-white/[0.05] text-text-2";
        case "amber": return "border-warning/25 bg-warning/12 text-warning";
        case "rose": return "border-danger/25 bg-danger/12 text-danger";
        case "slate": return "border-white/[0.10] bg-white/[0.045] text-text-2";
        default: return "border-white/[0.08] bg-white/[0.03] text-text-3";
    }
}

// A Release Radar item. Clicking searches for it INSIDE Vortex. Radar is a public
// page, so logged-out users are sent to login first, then bounced back to the search
// (via ?next=) once signed in — no dead-end, no external hop.
export default function RadarCard({
    title, subtitle, image, meta, description, accent = "accent", searchTitle,
}: {
    title: string;
    subtitle: string;
    image?: string;
    meta: Chip[];
    description?: string | null;
    accent?: "accent" | "teal";
    searchTitle: string;
}) {
    const { user } = useAuth();
    const router = useRouter();

    const go = () => {
        const dest = `/search?q=${encodeURIComponent(searchTitle)}`;
        router.push(user ? dest : `/login?next=${encodeURIComponent(dest)}`);
    };

    return (
        <button
            type="button"
            onClick={go}
            title={`Search "${searchTitle}" in Vortex`}
            className="group flex w-full gap-4 cine-card cine-card-hover p-4 text-left"
            style={{ contentVisibility: "auto", containIntrinsicSize: "160px" }}
        >
            <div className={`poster-ratio w-16 shrink-0 overflow-hidden rounded-xl border bg-base ${accent === "teal" ? "border-teal/20" : "border-accent/20"}`}>
                {image ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={image} alt={title} className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105" loading="lazy" decoding="async" />
                ) : (
                    <div className="flex h-full w-full items-center justify-center text-text-3">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="h-6 w-6" aria-hidden="true">
                            <rect x="3" y="3" width="18" height="18" rx="2" /><path d="M3 9h18M9 3v18" />
                        </svg>
                    </div>
                )}
            </div>
            <div className="min-w-0 flex-1">
                <div className="text-[10px] font-bold uppercase tracking-[0.18em] text-text-3">{subtitle}</div>
                <div className="mt-1 flex items-center gap-1.5 text-base font-bold text-text-1 group-hover:text-accent transition-colors">
                    {title}
                    <svg className="h-3.5 w-3.5 shrink-0 opacity-0 -translate-x-1 group-hover:opacity-100 group-hover:translate-x-0 transition-all" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="7" /><path d="m21 21-4.3-4.3" /></svg>
                </div>
                <div className="mt-2 flex flex-wrap gap-2">
                    {meta.map(item => (
                        <span key={item.label} className={`cine-chip ${chipClass(item.tone)}`}>{item.label}</span>
                    ))}
                </div>
                {description ? <p className="mt-2 text-sm text-text-3 line-clamp-2">{description}</p> : null}
            </div>
        </button>
    );
}
