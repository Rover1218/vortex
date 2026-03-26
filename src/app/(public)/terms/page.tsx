"use client";

import { useRouter } from "next/navigation";
import { motion } from "framer-motion";

export default function TermsPage() {
  const router = useRouter();

  return (
    <div className="min-h-screen bg-base text-text-1 relative">
      <div className="fixed inset-0 pointer-events-none">
        <div className="absolute top-[-30%] left-[-10%] w-[600px] h-[600px] bg-accent/[0.04] rounded-full blur-[120px]" />
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
          <div className="inline-flex items-center gap-2 px-4 py-1.5 mb-5 rounded-full bg-accent/[0.08] border border-accent/15 text-accent text-xs font-bold uppercase tracking-[0.12em]">Legal</div>
          <h1 className="text-4xl md:text-5xl font-black tracking-tight mb-4">Terms of Service</h1>
          <p className="text-text-3 text-sm">Last updated: {new Date().toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })}</p>
        </div>

        <div className="prose-custom space-y-8">
          <section>
            <h2 className="text-xl font-bold text-white mb-3">1. Acceptance of Terms</h2>
            <p className="text-text-2 leading-relaxed text-sm">By accessing and using Vortex (&quot;the Service&quot;), you accept and agree to be bound by these Terms of Service. If you do not agree to these terms, please do not use the Service.</p>
          </section>

          <section>
            <h2 className="text-xl font-bold text-white mb-3">2. Description of Service</h2>
            <p className="text-text-2 leading-relaxed text-sm">Vortex is a private torrent management platform that allows users to search, download, and manage torrent files through a web-based interface. The Service is intended for personal use with legally obtained content only.</p>
          </section>

          <section>
            <h2 className="text-xl font-bold text-white mb-3">3. User Accounts</h2>
            <ul className="space-y-2 text-text-2 text-sm">
              <li className="flex gap-2"><span className="text-accent mt-1">•</span><span>You must sign in with a valid Google account to use the Service.</span></li>
              <li className="flex gap-2"><span className="text-accent mt-1">•</span><span>You are responsible for all activity that occurs under your account.</span></li>
              <li className="flex gap-2"><span className="text-accent mt-1">•</span><span>Each user receives isolated, private data storage for their torrents, settings, and statistics.</span></li>
              <li className="flex gap-2"><span className="text-accent mt-1">•</span><span>You must not share your account access with others.</span></li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-bold text-white mb-3">4. Acceptable Use</h2>
            <p className="text-text-2 leading-relaxed text-sm mb-3">You agree not to use the Service to:</p>
            <ul className="space-y-2 text-text-2 text-sm">
              <li className="flex gap-2"><span className="text-danger mt-1">•</span><span>Download, distribute, or share copyrighted material without authorization.</span></li>
              <li className="flex gap-2"><span className="text-danger mt-1">•</span><span>Engage in any illegal activity or violate any applicable laws.</span></li>
              <li className="flex gap-2"><span className="text-danger mt-1">•</span><span>Attempt to gain unauthorized access to other users&apos; data.</span></li>
              <li className="flex gap-2"><span className="text-danger mt-1">•</span><span>Interfere with or disrupt the Service or its infrastructure.</span></li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-bold text-white mb-3">5. Intellectual Property</h2>
            <p className="text-text-2 leading-relaxed text-sm">The Vortex platform, including its design, code, and branding, is proprietary. You are granted a limited, non-exclusive license to use the Service for its intended purpose. You may not copy, modify, or redistribute any part of the Service.</p>
          </section>

          <section>
            <h2 className="text-xl font-bold text-white mb-3">6. Disclaimer of Warranties</h2>
            <p className="text-text-2 leading-relaxed text-sm">The Service is provided &quot;as is&quot; without warranties of any kind. We do not guarantee continuous, uninterrupted access to the Service. Download speeds and availability depend on external torrent networks beyond our control.</p>
          </section>

          <section>
            <h2 className="text-xl font-bold text-white mb-3">7. Limitation of Liability</h2>
            <p className="text-text-2 leading-relaxed text-sm">Vortex and its operators shall not be liable for any indirect, incidental, or consequential damages arising from your use of the Service. You use the Service at your own risk and are solely responsible for the content you download.</p>
          </section>

          <section>
            <h2 className="text-xl font-bold text-white mb-3">8. Termination</h2>
            <p className="text-text-2 leading-relaxed text-sm">We reserve the right to suspend or terminate your access to the Service at any time, for any reason, including violation of these Terms. Upon termination, your data may be deleted.</p>
          </section>

          <section>
            <h2 className="text-xl font-bold text-white mb-3">9. Changes to Terms</h2>
            <p className="text-text-2 leading-relaxed text-sm">We may update these Terms from time to time. Continued use of the Service after changes constitutes acceptance of the updated Terms.</p>
          </section>

          <section className="pt-4 border-t border-white/[0.06]">
            <p className="text-text-3 text-xs">If you have questions about these Terms, please contact the platform administrator.</p>
          </section>
        </div>
      </motion.main>
    </div>
  );
}
