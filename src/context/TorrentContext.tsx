"use client";

import React, { createContext, useContext, useEffect, useState, useRef, useCallback } from 'react';
import io from 'socket.io-client';
import axios from 'axios';
import { auth } from "@/lib/firebase";
import { onIdTokenChanged } from "firebase/auth";
import { useAuth } from './AuthContext';

// ─── Types ───
interface TorrentState {
    infoHash: string; name: string; progress: string;
    downloadSpeed: number; uploadSpeed: number; numPeers: number;
    timeRemaining: number; downloaded: number; totalLength: number;
    uploaded?: number;
    ratio: number; status: string;
}

interface Settings {
    downloadPath: string;
    globalDownloadLimit: number;
    globalUploadLimit: number;
}

interface DiskInfo { total: number; free: number; used: number; path: string; }
interface LibraryItem { name: string; path: string; isDir: boolean; size: number; modified: string; category: string; }
interface BrowseResult { current: string; parent: string | null; items: { name: string; path: string; isDir: boolean }[]; }

interface TorrentContextType {
    torrents: TorrentState[];
    totalDownloadSpeed: number;
    totalUploadSpeed: number;
    lifetimeDownloaded: number;
    lifetimeSeeded: number;
    settings: Settings | null;
    diskInfo: DiskInfo | null;
    library: LibraryItem[];
    // Search state persisted in context
    searchResults: any[];
    searchLogs: any[];
    searchQuery: string;
    searchCategory: string;
    isSearching: boolean;
    searchPosters: Record<string, string | null | 'loading'>;
    setSearchPosters: React.Dispatch<React.SetStateAction<Record<string, string | null | 'loading'>>>;
    setSearchQuery: (q: string) => void;
    setSearchCategory: (c: string) => void;
    doSearch: (query?: string, category?: string) => Promise<void>;
    cancelSearch: () => void;
    clearSearch: () => void;
    getSuggestions: (q: string) => Promise<string[]>;
    addMagnet: (magnet: string) => Promise<void>;
    removeTorrent: (infoHash: string) => Promise<void>;
    pauseTorrent: (infoHash: string) => Promise<void>;
    resumeTorrent: (infoHash: string) => Promise<void>;
    startSeeding: (infoHash: string) => Promise<void>;
    setTorrentFileSelection: (infoHash: string, filePath: string, action: 'pause' | 'resume') => Promise<any[]>;
    stopSeeding: (infoHash: string) => Promise<void>;
    deleteWithFiles: (infoHash: string) => Promise<void>;
    updateSettings: (newSettings: Partial<Settings>) => Promise<void>;
    fetchDiskInfo: () => Promise<void>;
    fetchLibrary: () => Promise<void>;
    browseFolders: (folderPath: string) => Promise<BrowseResult>;
    isEngineConnected: boolean;
    engineVersion: string | null;
}

const TorrentContext = createContext<TorrentContextType | undefined>(undefined);
// Default to localhost for development, but allow override via Vercel Environment Variables
const API_BASE = process.env.NEXT_PUBLIC_ENGINE_URL || 'http://localhost:3001';

export function TorrentProvider({ children }: { children: React.ReactNode }) {
    const [torrents, setTorrents] = useState<TorrentState[]>([]);
    const [totalDownloadSpeed, setTotalDownloadSpeed] = useState(0);
    const [totalUploadSpeed, setTotalUploadSpeed] = useState(0);
    const [lifetimeDownloaded, setLifetimeDownloaded] = useState(0);
    const [lifetimeSeeded, setLifetimeSeeded] = useState(0);
    const [settings, setSettings] = useState<Settings | null>(null);
    const [diskInfo, setDiskInfo] = useState<DiskInfo | null>(null);
    const [library, setLibrary] = useState<LibraryItem[]>([]);

    // Search state persisted across navigation
    const [searchResults, setSearchResults] = useState<any[]>([]);
    const [searchLogs, setSearchLogs] = useState<any[]>([]);
    const [searchQuery, setSearchQuery] = useState('');
    const [searchCategory, setSearchCategory] = useState('All');
    const [isSearching, setIsSearching] = useState(false);
    const [searchPosters, setSearchPosters] = useState<Record<string, string | null | 'loading'>>({});
    const searchAbortRef = useRef<AbortController | null>(null);

    const [isEngineConnected, setIsEngineConnected] = useState(true);
    const [engineVersion, setEngineVersion] = useState<string | null>(null);

    const { user } = useAuth();

    useEffect(() => {
        if (!user) return; // Wait until authenticated

        // Axios Interceptor
        const reqInterceptor = axios.interceptors.request.use(async (config) => {
            try {
                const token = await user.getIdToken();
                config.headers.Authorization = `Bearer ${token}`;
            } catch (err) { console.error('Token err:', err); }
            return config;
        });

        // Socket.IO
        let socket: any = null;
        user.getIdToken().then(token => {
            socket = io(API_BASE, { auth: { token } });

            socket.on('connect', () => {
                setIsEngineConnected(true);
                // Push fresh token immediately on connect
                user.getIdToken().then(t => socket.emit('update-token', { token: t }));
            });
            socket.on('disconnect', () => setIsEngineConnected(false));
            socket.on('connect_error', () => setIsEngineConnected(false));

            // Auto-refresh token for background engine sync
            const unsubscribeToken = onIdTokenChanged(auth, async (newUser) => {
                if (newUser && socket?.connected) {
                    const freshToken = await newUser.getIdToken();
                    socket.emit('update-token', { token: freshToken });
                }
            });

            socket.on('torrent-status', (data: any) => {
                setTorrents(data.torrents || []);
                setTotalDownloadSpeed(data.totalDownloadSpeed || 0);
                setTotalUploadSpeed(data.totalUploadSpeed || 0);
                setLifetimeDownloaded(data.lifetimeTotals?.downloaded || 0);
                setLifetimeSeeded(data.lifetimeTotals?.seeded || 0);
                if (data.settings) setSettings(data.settings);
                if (data.engineVersion) setEngineVersion(data.engineVersion);
            });

            socket.on('settings-updated', (data: any) => setSettings(data));

            socket.on('search-progress', (data: any) => {
                if (data.providers) setSearchLogs(data.providers);
                if (data.partialResults && !data.done) setSearchResults(data.partialResults);
            });
        });

        return () => {
            axios.interceptors.request.eject(reqInterceptor);
            if (socket) socket.disconnect();
        };
    }, [user]);

    useEffect(() => {
        if (!user) return;
        const loadDiskInfo = async () => {
            try {
                const res = await axios.get(`${API_BASE}/api/disk`);
                setDiskInfo(res.data);
            } catch { /* silent */ }
        };

        loadDiskInfo();
        const id = setInterval(loadDiskInfo, 30000);
        return () => clearInterval(id);
    }, [user]);

    const doSearch = useCallback(async (query?: string, category?: string) => {
        const q = query || searchQuery;
        const cat = category || searchCategory;
        if (!q.trim()) return;

        if (searchAbortRef.current) searchAbortRef.current.abort();
        const controller = new AbortController();
        searchAbortRef.current = controller;

        setIsSearching(true);
        setSearchResults([]);
        setSearchLogs([]);
        try {
            const res = await axios.get(
                `${API_BASE}/api/search?q=${encodeURIComponent(q)}&category=${encodeURIComponent(cat)}`,
                { signal: controller.signal }
            );
            if (res.data.results) setSearchResults(res.data.results);
            else setSearchResults(res.data); // fallback
        } catch (err: any) {
            if (err.name !== 'CanceledError') {
                console.error('Search failed:', err);
                setSearchResults([]);
            }
        }
        if (!controller.signal.aborted) setIsSearching(false);
    }, [searchQuery, searchCategory]);

    const cancelSearch = useCallback(() => {
        if (searchAbortRef.current) {
            searchAbortRef.current.abort();
            searchAbortRef.current = null;
        }
        setIsSearching(false);
    }, []);

    const clearSearch = useCallback(() => {
        if (searchAbortRef.current) {
            searchAbortRef.current.abort();
            searchAbortRef.current = null;
        }
        setIsSearching(false);
        setSearchResults([]);
        setSearchLogs([]);
        setSearchPosters({});
        setSearchQuery('');
    }, []);

    const getSuggestions = useCallback(async (q: string): Promise<string[]> => {
        if (!q || q.length < 2) return [];
        try {
            const res = await axios.get(`${API_BASE}/api/suggestions?q=${encodeURIComponent(q)}`);
            return res.data;
        } catch { return []; }
    }, []);

    const addMagnet = async (magnet: string) => {
        try {
            await axios.post(`${API_BASE}/api/torrents`, { magnet });
        } catch (err) {
            console.error('Failed to add magnet:', err);
            throw err;
        }
    };

    const removeTorrent = async (infoHash: string) => {
        try { await axios.delete(`${API_BASE}/api/torrents/${infoHash}`); }
        catch (err) { console.error('Failed to remove torrent:', err); }
    };

    const pauseTorrent = async (infoHash: string) => {
        try { await axios.post(`${API_BASE}/api/torrents/${infoHash}/pause`); }
        catch (err) { console.error('Failed to pause torrent:', err); }
    };

    const resumeTorrent = async (infoHash: string) => {
        try { await axios.post(`${API_BASE}/api/torrents/${infoHash}/resume`); }
        catch (err) { console.error('Failed to resume torrent:', err); }
    };

    const startSeeding = async (infoHash: string) => {
        try { await axios.post(`${API_BASE}/api/torrents/${infoHash}/start-seeding`); }
        catch (err) { console.error('Failed to start seeding:', err); }
    };

    const setTorrentFileSelection = async (infoHash: string, filePath: string, action: 'pause' | 'resume') => {
        try {
            const res = await axios.post(`${API_BASE}/api/torrents/${infoHash}/files/selection`, { path: filePath, action });
            return res.data?.files || [];
        } catch (err) {
            console.error('Failed to update file selection:', err);
            throw err;
        }
    };

    const stopSeeding = async (infoHash: string) => {
        try { await axios.post(`${API_BASE}/api/torrents/${infoHash}/stop-seeding`); }
        catch (err) { console.error('Failed to stop seeding:', err); }
    };

    const deleteWithFiles = async (infoHash: string) => {
        try { await axios.delete(`${API_BASE}/api/torrents/${infoHash}/delete-files`); }
        catch (err) { console.error('Failed to delete torrent files:', err); }
    };

    const updateSettings = async (newSettings: Partial<Settings>) => {
        try {
            const res = await axios.post(`${API_BASE}/api/settings`, newSettings);
            setSettings(res.data);
            fetchDiskInfo();
        } catch (err) { console.error('Update settings failed:', err); }
    };

    const fetchDiskInfo = useCallback(async () => {
        try {
            const res = await axios.get(`${API_BASE}/api/disk`);
            setDiskInfo(res.data);
        } catch { /* silent */ }
    }, []);

    const fetchLibrary = useCallback(async () => {
        try {
            const res = await axios.get(`${API_BASE}/api/library`);
            setLibrary(res.data);
        } catch { setLibrary([]); }
    }, []);

    const browseFolders = useCallback(async (folderPath: string): Promise<BrowseResult> => {
        try {
            const res = await axios.get(`${API_BASE}/api/browse?path=${encodeURIComponent(folderPath)}`);
            return res.data;
        } catch {
            return { current: folderPath, parent: null, items: [] };
        }
    }, []);

    return (
        <TorrentContext.Provider value={{
            torrents, totalDownloadSpeed, totalUploadSpeed,
            lifetimeDownloaded, lifetimeSeeded,
            settings, diskInfo, library,
            searchResults, searchLogs, searchQuery, searchCategory, isSearching,
            searchPosters, setSearchPosters,
            setSearchQuery, setSearchCategory, doSearch, cancelSearch, clearSearch,
            getSuggestions,
            addMagnet, removeTorrent, pauseTorrent, resumeTorrent,
            startSeeding, setTorrentFileSelection, stopSeeding, deleteWithFiles,
            updateSettings, fetchDiskInfo, fetchLibrary, browseFolders,
            isEngineConnected,
            engineVersion
        }}>
            {children}
        </TorrentContext.Provider>
    );
}

export function useTorrents() {
    const context = useContext(TorrentContext);
    if (!context) throw new Error('useTorrents must be used within a TorrentProvider');
    return context;
}
