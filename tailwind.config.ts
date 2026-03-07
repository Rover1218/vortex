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
                base: "#0a0a0f",
                surface: "#111118",
                elevated: "#1a1a26",
                'vortex-border': "#ffffff12",
                accent: "#6c63ff",
                teal: "#00d4aa",
                danger: "#ff4d6d",
                warning: "#f59e0b",
                'text-1': "#f0f0ff",
                'text-2': "#8888aa",
                'text-3': "#55556a",
            },
            fontFamily: {
                sans: ["var(--font-dm-sans)"],
                mono: ["var(--font-jetbrains-mono)"],
            },
            animation: {
                shimmer: "shimmer 2s infinite linear",
            },
            keyframes: {
                shimmer: {
                    "0%": { transform: "translateX(-100%) skewX(-12deg)" },
                    "100%": { transform: "translateX(200%) skewX(-12deg)" },
                },
            },
        },
    },
    plugins: [],
};
export default config;
