# 🌀 Vortex Engine

[![Vercel](https://img.shields.io/badge/Vercel-000000?style=for-the-badge&logo=vercel&logoColor=white)](https://vercel.com)
[![Next.js](https://img.shields.io/badge/Next.js-000000?style=for-the-badge&logo=nextdotjs&logoColor=white)](https://nextjs.org)
[![Firebase](https://img.shields.io/badge/Firebase-FFCA28?style=for-the-badge&logo=firebase&logoColor=black)](https://firebase.google.com)

**Vortex** is a premium, private torrent management ecosystem. It consists of a sleek, cloud-hosted **Next.js Dashboard** and a high-performance, standalone **Node.js Engine** that runs locally on your machine for maximum privacy and speed.

---

## ✨ Features

- 🔍 **Multi-Source Search**: Search across ThePirateBay, Nyaa, AnimeTosho, and TorrentCSV simultaneously.
- ⚡ **WebTorrent Core**: High-speed, memory-efficient torrenting engine.
- ☁️ **Cloud Sync**: Firebase-powered authentication and state management. Sync your library across devices.
- 🎬 **Poster Art & Metadata**: Automatic fetching of movie posters and TV show details.
- 🔒 **Privacy-First**: Your torrent data and files stay on your local machine.
- 💎 **Premium Interface**: Modern, dark-mode UI with glassmorphism and smooth animations.

---

## 🏗️ Architecture

Vortex uses a **Client-Side Engine** architecture:
1. **Frontend (Vercel)**: The beautiful web interface handles searching, library management, and sync.
2. **Engine (Local EXE)**: A standalone Windows executable (`vortex.exe`) that handles the actual downloading, seeding, and file management on your computer.

This setup gives you the best of both worlds: a cloud-accessible dashboard with the raw power and privacy of local downloading.

---

## 🚀 Getting Started

### 1. Web Dashboard
The frontend is built with Next.js 15 and can be deployed to Vercel in seconds.
- **Deploy**: Connect your repo to Vercel and set the Root Directory to `vortex`.
- **Environment Variables**: Add your Firebase keys (from `.env.local`) to Vercel settings.

### 2. Standalone Engine
To start downloading, you need the **Vortex Engine** running on your computer.
- **Download**: Get the latest installer from the [Official Release (v0.1.5)](https://github.com/Rover1218/vortex/releases/tag/0.1.5) — download `Vortex-Setup-0.1.0.exe`.
- **Run**: Simply open the EXE. It will start a local server on port `3001` and automatically connect to your dashboard.

---

## 💎 Premium & Payments

Vortex has a free tier and paid premium plans, all one-time payments (no auto-renewal):

| Plan | India | International | Grants |
|------|-------|---------------|--------|
| Free | — | — | Search, 2 simultaneous downloads, unlimited seeding, watch completed files |
| 1 Month | ₹89 | $1 | 30 days premium |
| 6 Months | ₹449 | $5 | 180 days premium |
| Lifetime | ₹3,299 | $40 | Premium forever |

**Premium unlocks:** unlimited simultaneous downloads, streaming while downloading, auto-subtitles, and Release Radar. Time from purchases and redeem codes always stacks. Existing torrents are never interrupted — the free limit only applies when adding new ones.

### How it works

- Payments run through [Dodo Payments](https://dodopayments.com) (UPI/cards in India, cards/PayPal internationally). A webhook auto-activates premium seconds after payment — no manual steps.
- Premium status lives in `users/{uid}/config/entitlement`, written **only** by the server (see `firestore.rules`). Clients can read it, never write it.
- Coupon codes (`VTX-XXXX-XXXX-XXXX`) are generated on the owner-only `/admin` page, stored **hashed**, single-use, and support 1/3/6/12-month and lifetime durations.

### Owner setup

1. Create a Dodo Payments account and complete KYC.
2. Create the three products (1 month / 6 months / lifetime) and note their product IDs.
3. Add a webhook pointing to `https://<your-domain>/api/premium/webhook` and copy the signing secret.
4. Fill the `DODO_*`, `ADMIN_UID`, and `NEXT_PUBLIC_*` variables (see `.env.example`) in Vercel.
5. Do one test-mode payment end-to-end before switching `DODO_API_BASE` to live.

If the payment provider is unavailable, coupon redemption on `/upgrade` and manual grants on `/admin` keep working as the fallback sales channel.

---

## 🛠️ Local Development

To run the full stack locally:

```bash
# Clone the repository
git clone https://github.com/your-username/vortex.git
cd vortex

# Install dependencies
npm install

# Run both Frontend & Engine in dev mode
npm run dev:full
```

---

## 📦 Building the Engine

If you want to build the standalone EXE yourself (with your own Firebase credentials embedded):

1. Put your `vortex-firebase-adminsdk.json` in the root.
2. Run the build command:
```bash
npm run build:engine:exe
```
The result will be in `public/downloads/vortex.exe`.

---

## 🛡️ Security & Privacy

Vortex is a private, personal tool. Because the **Vortex Engine** is a new, unsigned standalone executable that performs network-intensive torrenting tasks, you may see warnings from **Windows SmartScreen** or **Antivirus** software.

### ⚠️ Why is it flagged?
1. **Unsigned Executable**: To avoid the $300+/year cost of a Code Signing Certificate, the engine is currently unsigned.
2. **New Application**: Microsoft SmartScreen takes time to "learn" that a new application is safe.
3. **Torrenting Activity**: The engine uses `webtorrent`, which opens multiple peer-to-peer connections. This behavior is often flagged by generic antivirus heuristics.

### ✅ How to Run Safely
1. When you see "Windows protected your PC", click **"More info"**.
2. Click **"Run anyway"**.
3. If your antivirus blocks it, you may need to add an exception for `vortex.exe`.

**Note**: Vortex is open-source. You can always audit the code in `server.mjs` and build the executable yourself using `npm run build:engine:exe`.

---

## 📜 License
This project is for personal use and educational purposes. Ensure you comply with local laws regarding torrenting.

---