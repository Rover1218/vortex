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
                // Colors come from CSS variables (globals.css) so themes can swap
                // the whole palette at runtime. Channel form keeps /opacity working.
                base: "rgb(var(--c-base) / <alpha-value>)",
                surface: "rgb(var(--c-surface) / <alpha-value>)",
                elevated: "rgb(var(--c-elevated) / <alpha-value>)",
                'vortex-border': "#ffffff14",
                accent: "rgb(var(--c-accent) / <alpha-value>)",
                'accent-strong': "rgb(var(--c-accent-strong) / <alpha-value>)",
                teal: "rgb(var(--c-teal) / <alpha-value>)",
                danger: "rgb(var(--c-danger) / <alpha-value>)",
                warning: "rgb(var(--c-warning) / <alpha-value>)",
                'text-1': "rgb(var(--c-text-1) / <alpha-value>)",
                'text-2': "rgb(var(--c-text-2) / <alpha-value>)",
                'text-3': "rgb(var(--c-text-3) / <alpha-value>)",
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
                'accent-glow': '0 14px 40px -16px rgb(var(--c-accent) / 0.55)',
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
