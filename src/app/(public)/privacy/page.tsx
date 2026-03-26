"use client";

import { useRouter } from "next/navigation";
import { motion } from "framer-motion";

export default function PrivacyPage() {
  const router = useRouter();

  return (
    <div className="min-h-screen bg-base text-text-1 relative">
      <div className="fixed inset-0 pointer-events-none">
        <div className="absolute bottom-[-20%] right-[-5%] w-[600px] h-[600px] bg-teal/[0.04] rounded-full blur-[120px]" />
      </div>

      <nav className="relative z-10 flex items-center justify-between px-6 md:px-12 py-5 max-w-5xl mx-auto">
        <button onClick={() => router.push("/")} className="flex items-center gap-2 text-text-3 hover:text-white transition-colors group">
          <svg width="18" height="18" viewBox="0 0 16 16" fill="none" className="group-hover:-translate-x-0.5 transition-transform"><path d="M10 12L6 8L10 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>
          <span className="text-sm font-medium">Back to home</span>
        </button>
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-accent to-teal flex items-center justify-center text-white text-[10px] font-black">V</div>
          <span className="text-sm font-bold text-white">Vortex</span>
        </div>
      </nav>

      <motion.main initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }}
        className="relative z-10 max-w-3xl mx-auto px-6 py-12">
        <div className="mb-12">
          <div className="inline-flex items-center gap-2 px-4 py-1.5 mb-5 rounded-full bg-teal/[0.08] border border-teal/15 text-teal text-xs font-bold uppercase tracking-[0.12em]">Legal</div>
          <h1 className="text-4xl md:text-5xl font-black tracking-tight mb-4">Privacy Policy</h1>
          <p className="text-text-3 text-sm">Last updated: {new Date().toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })}</p>
        </div>

        <div className="space-y-8">
          <section>
            <h2 className="text-xl font-bold text-white mb-3">1. Information We Collect</h2>
            <p className="text-text-2 leading-relaxed text-sm mb-3">When you use Vortex, we collect the following information:</p>
            <ul className="space-y-2 text-text-2 text-sm">
              <li className="flex gap-2"><span className="text-teal mt-1">•</span><span><strong className="text-white">Account Information:</strong> Your Google account name, email address, and profile photo (provided via Google Sign-In).</span></li>
              <li className="flex gap-2"><span className="text-teal mt-1">•</span><span><strong className="text-white">Usage Data:</strong> Torrent search queries, download history, library contents, and platform settings configured by you.</span></li>
              <li className="flex gap-2"><span className="text-teal mt-1">•</span><span><strong className="text-white">Statistics:</strong> Download/upload volumes, session data, and usage patterns for your personal dashboard.</span></li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-bold text-white mb-3">2. How We Use Your Information</h2>
            <ul className="space-y-2 text-text-2 text-sm">
              <li className="flex gap-2"><span className="text-teal mt-1">•</span><span>To authenticate your identity and provide access to the platform.</span></li>
              <li className="flex gap-2"><span className="text-teal mt-1">•</span><span>To store your personal torrent library, settings, and statistics.</span></li>
              <li className="flex gap-2"><span className="text-teal mt-1">•</span><span>To maintain and improve the Service.</span></li>
              <li className="flex gap-2"><span className="text-teal mt-1">•</span><span>We do not sell, share, or distribute your personal data to third parties.</span></li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-bold text-white mb-3">3. Data Storage & Security</h2>
            <p className="text-text-2 leading-relaxed text-sm">Your data is stored in Google Firebase (Firestore) with per-user isolation. Each user&apos;s data is stored in a separate, access-controlled document. We use industry-standard security measures including encrypted connections (HTTPS) and Firebase security rules to protect your data.</p>
          </section>

          <section>
            <h2 className="text-xl font-bold text-white mb-3">4. Data Isolation</h2>
            <div className="p-4 rounded-xl bg-teal/[0.06] border border-teal/10">
              <p className="text-text-2 text-sm leading-relaxed">
                <strong className="text-teal">Your data is fully isolated.</strong> No other user can access your torrent list, download history, settings, or statistics. Each account operates as an independent, private instance.
              </p>
            </div>
          </section>

          <section>
            <h2 className="text-xl font-bold text-white mb-3">5. Third-Party Services</h2>
            <p className="text-text-2 leading-relaxed text-sm mb-3">Vortex integrates with the following third-party services:</p>
            <ul className="space-y-2 text-text-2 text-sm">
              <li className="flex gap-2"><span className="text-accent mt-1">•</span><span><strong className="text-white">Google Firebase:</strong> Authentication and data storage.</span></li>
              <li className="flex gap-2"><span className="text-accent mt-1">•</span><span><strong className="text-white">Torrent Search APIs:</strong> ThePirateBay, Nyaa, AnimeTosho, TorrentCSV for search results.</span></li>
              <li className="flex gap-2"><span className="text-accent mt-1">•</span><span><strong className="text-white">Media APIs:</strong> TVmaze, Jikan, Kitsu for poster and metadata fetching.</span></li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-bold text-white mb-3">6. Data Retention & Deletion</h2>
            <p className="text-text-2 leading-relaxed text-sm">Your data is retained as long as your account is active. You may request deletion of your data at any time by contacting the administrator. Upon account deletion, all associated data (torrents, settings, statistics) will be permanently removed.</p>
          </section>

          <section>
            <h2 className="text-xl font-bold text-white mb-3">7. Your Rights</h2>
            <ul className="space-y-2 text-text-2 text-sm">
              <li className="flex gap-2"><span className="text-teal mt-1">•</span><span>Access and export your personal data.</span></li>
              <li className="flex gap-2"><span className="text-teal mt-1">•</span><span>Request correction of inaccurate data.</span></li>
              <li className="flex gap-2"><span className="text-teal mt-1">•</span><span>Request deletion of your account and all associated data.</span></li>
            </ul>
          </section>

          <section className="pt-4 border-t border-white/[0.06]">
            <p className="text-text-3 text-xs">For privacy-related inquiries, please contact the platform administrator.</p>
          </section>
        </div>
      </motion.main>
    </div>
  );
}
