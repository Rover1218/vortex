import { isAdultTitle } from "@/lib/contentFilter";

// Curated "discover" rows for the empty search page — keyless sources, cached for
// an hour. Cinemeta (Stremio) gives top movies/shows with poster URLs; Jikan (the
// MyAnimeList API) gives top anime.
export const revalidate = 3600;

interface DiscoverItem { name: string; poster: string; year: string; type: string; }

const CINEMETA = "https://v3-cinemeta.strem.io";

async function cinemeta(type: "movie" | "series"): Promise<DiscoverItem[]> {
    try {
        const res = await fetch(`${CINEMETA}/catalog/${type}/top.json`, { next: { revalidate } });
        if (!res.ok) return [];
        const data = await res.json();
        return (data.metas || [])
            .map((m: { name?: string; poster?: string; releaseInfo?: string; year?: string | number }) => ({
                name: m.name || "",
                poster: (m.poster || "").replace("/poster/small/", "/poster/medium/"),
                year: String(m.releaseInfo || m.year || "").slice(0, 4),
                type,
            }))
            .filter((m: DiscoverItem) => m.name && m.poster && !isAdultTitle(m.name))
            .slice(0, 30);
    } catch { return []; }
}

async function topAnime(): Promise<DiscoverItem[]> {
    try {
        const res = await fetch("https://api.jikan.moe/v4/top/anime?filter=bypopularity&limit=24", { next: { revalidate } });
        if (!res.ok) return [];
        const data = await res.json();
        return (data.data || [])
            .map((a: { title?: string; title_english?: string; year?: number; images?: { jpg?: { large_image_url?: string; image_url?: string } } }) => ({
                name: a.title_english || a.title || "",
                poster: a.images?.jpg?.large_image_url || a.images?.jpg?.image_url || "",
                year: a.year ? String(a.year) : "",
                type: "anime",
            }))
            .filter((m: DiscoverItem) => m.name && m.poster && !isAdultTitle(m.name));
    } catch { return []; }
}

export async function GET() {
    const [movies, series, anime] = await Promise.all([
        cinemeta("movie"),
        cinemeta("series"),
        topAnime(),
    ]);
    const rows = [
        { key: "movies", title: "Popular Movies", items: movies },
        { key: "series", title: "Popular Shows", items: series },
        { key: "anime", title: "Top Anime", items: anime },
    ].filter(r => r.items.length > 0);
    return Response.json({ rows }, { headers: { "Cache-Control": "public, s-maxage=3600, stale-while-revalidate=86400" } });
}
