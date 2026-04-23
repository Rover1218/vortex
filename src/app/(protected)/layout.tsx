"use client";

import { useAuth } from "@/context/AuthContext";
import { useRouter, usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import Sidebar from "@/components/Sidebar";
import { TorrentProvider } from "@/context/TorrentContext";
import EngineStatusOverlay from "@/components/EngineStatusOverlay";
import MobileBlocker from "@/components/MobileBlocker";

export default function ProtectedLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { user, loading } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const [key, setKey] = useState(0);

  useEffect(() => {
    if (!loading && !user) {
      router.push("/login");
    }
  }, [user, loading, router]);

  useEffect(() => {
    setKey(prev => prev + 1);
  }, [pathname]);

  // Show loading state while checking auth
  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-base">
        <div className="flex flex-col items-center gap-4">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-accent to-teal flex items-center justify-center text-white text-lg font-black animate-pulse">
            V
          </div>
          <span className="text-text-2 text-sm">Loading...</span>
        </div>
      </div>
    );
  }

  // Don't render protected content if not authenticated
  if (!user) {
    return null;
  }

  return (
    <MobileBlocker>
      <TorrentProvider>
        <div className="flex min-h-screen overflow-x-hidden">
          <Sidebar />
          <main className="flex-1 ml-60 min-h-screen px-8 py-6 relative">
            <div key={key} className="perf-auto page-enter-active">
              {children}
            </div>
            <EngineStatusOverlay />
          </main>
        </div>
      </TorrentProvider>
    </MobileBlocker>
  );
}
