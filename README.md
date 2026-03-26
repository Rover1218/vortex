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
- **Download**: Get the latest `vortex.exe` from the [Releases](https://github.com/OWNER/REPO/releases) page.
- **Run**: Simply open the EXE. It will start a local server on port `3001` and automatically connect to your dashboard.

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

## 📜 License
This project is for personal use and educational purposes. Ensure you comply with local laws regarding torrenting.

---