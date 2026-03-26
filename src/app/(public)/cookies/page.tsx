"use client";

import { useRouter } from "next/navigation";
import { motion } from "framer-motion";

export default function CookiePage() {
  const router = useRouter();

  return (
    <div className="min-h-screen bg-base text-text-1 relative">
      <div className="fixed inset-0 pointer-events-none">
        <div className="absolute top-[20%] right-[-10%] w-[500px] h-[500px] bg-accent/[0.03] rounded-full blur-[120px]" />
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
          <div className="inline-flex items-center gap-2 px-4 py-1.5 mb-5 rounded-full bg-warning/[0.08] border border-warning/15 text-warning text-xs font-bold uppercase tracking-[0.12em]">Legal</div>
          <h1 className="text-4xl md:text-5xl font-black tracking-tight mb-4">Cookie Policy</h1>
          <p className="text-text-3 text-sm">Last updated: {new Date().toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })}</p>
        </div>

        <div className="space-y-8">
          <section>
            <h2 className="text-xl font-bold text-white mb-3">1. What Are Cookies</h2>
            <p className="text-text-2 leading-relaxed text-sm">Cookies are small text files stored on your device when you visit a website. They help the website remember your preferences and provide a better user experience.</p>
          </section>

          <section>
            <h2 className="text-xl font-bold text-white mb-3">2. How We Use Cookies</h2>
            <p className="text-text-2 leading-relaxed text-sm mb-4">Vortex uses a minimal set of cookies, strictly necessary for the platform to function:</p>
            <div className="overflow-hidden rounded-xl border border-white/[0.06]">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-white/[0.06] bg-white/[0.02]">
                    <th className="text-left px-4 py-3 text-xs font-bold text-white uppercase tracking-wider">Cookie</th>
                    <th className="text-left px-4 py-3 text-xs font-bold text-white uppercase tracking-wider">Purpose</th>
                    <th className="text-left px-4 py-3 text-xs font-bold text-white uppercase tracking-wider">Duration</th>
                  </tr>
                </thead>
                <tbody className="text-text-2">
                  <tr className="border-b border-white/[0.03]">
                    <td className="px-4 py-3 font-mono text-xs text-accent">firebase-auth</td>
                    <td className="px-4 py-3 text-xs">Authentication session management</td>
                    <td className="px-4 py-3 text-xs">Session</td>
                  </tr>
                  <tr className="border-b border-white/[0.03]">
                    <td className="px-4 py-3 font-mono text-xs text-accent">__session</td>
                    <td className="px-4 py-3 text-xs">User session persistence</td>
                    <td className="px-4 py-3 text-xs">14 days</td>
                  </tr>
                  <tr>
                    <td className="px-4 py-3 font-mono text-xs text-accent">next-auth</td>
                    <td className="px-4 py-3 text-xs">CSRF protection</td>
                    <td className="px-4 py-3 text-xs">Session</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </section>

          <section>
            <h2 className="text-xl font-bold text-white mb-3">3. Essential Cookies Only</h2>
            <div className="p-4 rounded-xl bg-teal/[0.06] border border-teal/10">
              <p className="text-text-2 text-sm leading-relaxed">
                <strong className="text-teal">We do not use tracking, analytics, or advertising cookies.</strong> All cookies used by Vortex are strictly necessary for authentication and platform functionality.
              </p>
            </div>
          </section>

          <section>
            <h2 className="text-xl font-bold text-white mb-3">4. Third-Party Cookies</h2>
            <p className="text-text-2 leading-relaxed text-sm">Google Firebase may set cookies for authentication purposes. These cookies are governed by Google&apos;s Privacy Policy. We do not control third-party cookies and recommend reviewing their respective policies.</p>
          </section>

          <section>
            <h2 className="text-xl font-bold text-white mb-3">5. Managing Cookies</h2>
            <p className="text-text-2 leading-relaxed text-sm">You can control cookies through your browser settings. However, disabling essential cookies may prevent you from using the Service, as authentication requires cookies to function.</p>
          </section>

          <section className="pt-4 border-t border-white/[0.06]">
            <p className="text-text-3 text-xs">For cookie-related inquiries, please contact the platform administrator.</p>
          </section>
        </div>
      </motion.main>
    </div>
  );
}
