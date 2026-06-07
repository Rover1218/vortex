"use client";

import type { Config } from "tailwindcss";

const config: Config = {
    content: [
        "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
        "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
        "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
    ],
    theme: {
        extend: {
            colors: {
                // Cinematic dark — true near-black neutrals, warm amber-gold accent.
                base: "#09090b",
                surface: "#131316",
                elevated: "#1c1c21",
                'vortex-border': "#ffffff14",
                accent: "#f5a623",          // warm amber-gold (brand / primary CTAs)
                'accent-strong': "#ffc04d", // hover / glow
                teal: "#2dd4a7",            // success / seeding
                danger: "#ff5470",
                warning: "#fbbf24",
                'text-1': "#f7f6f3",        // warm white
                'text-2': "#9b9ba6",
                'text-3': "#60606b",
            },
            fontFamily: {
                sans: ["var(--font-dm-sans)"],
                mono: ["var(--font-jetbrains-mono)"],
            },
            borderRadius: {
                'xl2': '1.125rem',
                '2xl': '1.25rem',
                '3xl': '1.75rem',
            },
            boxShadow: {
                'cinema': '0 24px 60px -28px rgba(0,0,0,0.85)',
                'cinema-lg': '0 40px 120px -40px rgba(0,0,0,0.9)',
                'accent-glow': '0 14px 40px -16px rgba(245,166,35,0.55)',
            },
            animation: {
                shimmer: "shimmer 2s infinite linear",
                float: "float 8s ease-in-out infinite",
            },
            keyframes: {
                shimmer: {
                    "0%": { transform: "translateX(-100%) skewX(-12deg)" },
                    "100%": { transform: "translateX(200%) skewX(-12deg)" },
                },
                float: {
                    "0%, 100%": { transform: "translateY(0) scale(1)" },
                    "50%": { transform: "translateY(-20px) scale(1.02)" },
                },
            },
        },
    },
    plugins: [],
};
export default config;
