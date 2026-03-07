"use client";

import React, { createContext, useContext, useEffect, useState, useRef, useCallback } from 'react';
import io from 'socket.io-client';
import axios from 'axios';

// ─── Types ───
interface TorrentState {
    infoHash: string; name: string; progress: string;
    downloadSpeed: number; uploadSpeed: number; numPeers: number;
    timeRemaining: number; downloaded: number; totalLength: number;
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
    settings: Settings | null;
    diskInfo: DiskInfo | null;
    library: LibraryItem[];
    // Search state persisted in context
    searchResults: any[];
    searchLogs: any[];
    searchQuery: string;
    searchCategory: string;
    isSearching: boolean;
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
    stopSeeding: (infoHash: string) => Promise<void>;
    deleteWithFiles: (infoHash: string) => Promise<void>;
    updateSettings: (newSettings: Partial<Settings>) => Promise<void>;
    fetchDiskInfo: () => Promise<void>;
    fetchLibrary: () => Promise<void>;
    browseFolders: (folderPath: string) => Promise<BrowseResult>;
}

const TorrentContext = createContext<TorrentContextType | undefined>(undefined);
const API_BASE = 'http://localhost:3001';

export function TorrentProvider({ children }: { children: React.ReactNode }) {
    const [torrents, setTorrents] = useState<TorrentState[]>([]);
    const [totalDownloadSpeed, setTotalDownloadSpeed] = useState(0);
    const [totalUploadSpeed, setTotalUploadSpeed] = useState(0);
    const [settings, setSettings] = useState<Settings | null>(null);
    const [diskInfo, setDiskInfo] = useState<DiskInfo | null>(null);
    const [library, setLibrary] = useState<LibraryItem[]>([]);

    // Search state persisted across navigation
    const [searchResults, setSearchResults] = useState<any[]>([]);
    const [searchLogs, setSearchLogs] = useState<any[]>([]);
    const [searchQuery, setSearchQuery] = useState('');
    const [searchCategory, setSearchCategory] = useState('All');
    const [isSearching, setIsSearching] = useState(false);
    const searchAbortRef = useRef<AbortController | null>(null);

    useEffect(() => {
        const socket = io(API_BASE);
        socket.on('torrent-status', (data: any) => {
            setTorrents(data.torrents || []);
            setTotalDownloadSpeed(data.totalDownloadSpeed || 0);
            setTotalUploadSpeed(data.totalUploadSpeed || 0);
            if (data.settings) setSettings(data.settings);
        });

        // Instant settings refresh when server applies changes
        socket.on('settings-updated', (data: any) => {
            setSettings(data);
        });

        socket.on('search-progress', (data: any) => {
            if (data.providers) setSearchLogs(data.providers);
        });

        return () => { socket.disconnect(); };
    }, []);

    useEffect(() => {
        fetchDiskInfo();
        const id = setInterval(fetchDiskInfo, 30000);
        return () => clearInterval(id);
    }, []);

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
        try { await axios.post(`${API_BASE}/api/torrents`, { magnet }); }
        catch (err) { console.error('Failed to add magnet:', err); }
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
            settings, diskInfo, library,
            searchResults, searchLogs, searchQuery, searchCategory, isSearching,
            setSearchQuery, setSearchCategory, doSearch, cancelSearch, clearSearch, getSuggestions,
            addMagnet, removeTorrent, pauseTorrent, resumeTorrent, stopSeeding, deleteWithFiles,
            updateSettings, fetchDiskInfo, fetchLibrary, browseFolders
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
