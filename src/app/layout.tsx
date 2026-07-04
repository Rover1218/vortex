import type { Metadata } from "next";
import { DM_Sans, JetBrains_Mono } from "next/font/google";
import "./globals.css";
import { AuthProvider } from "@/context/AuthContext";
import { PremiumProvider } from "@/context/PremiumContext";
import { SpeedInsights } from "@vercel/speed-insights/next";
import { Analytics } from "@vercel/analytics/next";

const dmSans = DM_Sans({
  variable: "--font-dm-sans",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"]
});

const jetBrainsMono = JetBrains_Mono({
  variable: "--font-jetbrains-mono",
  subsets: ["latin"],
  weight: ["400", "500"]
});

export const metadata: Metadata = {
  title: "Vortex - Private Torrent Management",
  description: "A high-end private torrent management platform",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    // suppressHydrationWarning: the theme script below sets data-theme on <html>
    // before hydration — the official Next.js pattern for flash-free theming.
    <html lang="en" suppressHydrationWarning>
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html:
              "(function(){try{var t=localStorage.getItem('vortex-theme');if(t&&t!=='vortex')document.documentElement.setAttribute('data-theme',t)}catch(e){}})()",
          }}
        />
      </head>
      <body
        className={`${dmSans.variable} ${jetBrainsMono.variable} antialiased bg-base text-text-1 min-h-screen`}
      >
        <AuthProvider>
          <PremiumProvider>
            {children}
          </PremiumProvider>
        </AuthProvider>
        <SpeedInsights />
        <Analytics />
      </body>
    </html>
  );
}
