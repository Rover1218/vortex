import type { Metadata } from "next";
import { DM_Sans, JetBrains_Mono } from "next/font/google";
import "./globals.css";
import Sidebar from "@/components/Sidebar";
import { TorrentProvider } from "@/context/TorrentContext";

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
    <html lang="en">
      <body
        className={`${dmSans.variable} ${jetBrainsMono.variable} antialiased bg-base text-text-1 min-h-screen flex`}
      >
        <TorrentProvider>
          <Sidebar />
          <main className="flex-1 ml-60 h-screen overflow-y-auto px-8 py-6">
            {children}
          </main>
        </TorrentProvider>
      </body>
    </html>
  );
}
