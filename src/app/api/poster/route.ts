import { isAdultTitle } from "@/lib/contentFilter";

// Fast poster resolver for search-result thumbnails. Uses Cinemeta (Stremio) — one
// quick call for movies + shows — with a Jikan anime fallback. Runs on Vercel and is
// cached, so after the first lookup a query is served from the edge instantly.
// Each upstream call has a hard timeout so a slow Cinemeta can never make the request
// hang (the old version did, which is why thumbnails felt stuck).
export const revalidate = 86400;

const CINEMETA = "https://v3-cinemeta.strem.io";
const UPSTREAM_TIMEOUT = 4500;

interface Meta { name?: string; poster?: string; releaseInfo?: string }

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

async function cinemetaSearch(type: "movie" | "series", q: string): Promise<Meta[]> {
    try {
        const res = await fetch(`${CINEMETA}/catalog/${type}/top/search=${encodeURIComponent(q)}.json`, {
            next: { revalidate },
            signal: AbortSignal.timeout(UPSTREAM_TIMEOUT),
        });
        if (!res.ok) return [];
        const data = await res.json();
        return (data.metas || []) as Meta[];
    } catch { return []; }
}

// Pick the meta whose name best matches the query; require some overlap so we never
// return a confidently-wrong poster (blank placeholder beats wrong art). When a year
// is supplied, an exact year match adds a bonus — this disambiguates same-named
// titles (two "Apex" movies) and rescues garbled multi-word titles.
function pickBest(metas: Meta[], q: string, year: string): Meta | null {
    const nq = norm(q);
    let best: Meta | null = null, bestScore = -1;
    for (const m of metas) {
        if (!m.poster || !m.name) continue;
        const nn = norm(m.name);
        let score = -1;
        if (nn === nq) score = 10;
        else if (nn.startsWith(nq) || nq.startsWith(nn)) score = 6;
        else if (nn.includes(nq) || nq.includes(nn)) score = 4;
        if (score < 0) continue; // no name overlap — never pick on year alone
        if (year && String(m.releaseInfo || "").slice(0, 4) === year) score += 3;
        if (score > bestScore) { bestScore = score; best = m; }
    }
    return best;
}

export async function GET(req: Request) {
    const params = new URL(req.url).searchParams;
    const q = (params.get("q") || "").trim();
    const year = (params.get("year") || "").match(/^(?:19|20)\d{2}$/)?.[0] || "";
    if (!q || isAdultTitle(q)) return Response.json({ poster: null });

    const [movies, series] = await Promise.all([cinemetaSearch("movie", q), cinemetaSearch("series", q)]);
    const best = pickBest([...movies, ...series], q, year);
    if (best?.poster) {
        return Response.json(
            { poster: best.poster.replace("/poster/small/", "/poster/medium/"), title: best.name, year: String(best.releaseInfo || "").slice(0, 4) },
            { headers: { "Cache-Control": "public, s-maxage=86400, stale-while-revalidate=604800" } },
        );
    }

    // Anime fallback (Cinemeta misses many anime).
    try {
        const r = await fetch(`https://api.jikan.moe/v4/anime?q=${encodeURIComponent(q)}&limit=3&sfw`, {
            next: { revalidate },
            signal: AbortSignal.timeout(UPSTREAM_TIMEOUT),
        });
        if (r.ok) {
            const d = await r.json();
            const a = (d.data || []).find((x: { images?: { jpg?: { large_image_url?: string; image_url?: string } } }) => x.images?.jpg?.large_image_url || x.images?.jpg?.image_url);
            if (a) return Response.json({ poster: a.images.jpg.large_image_url || a.images.jpg.image_url, title: a.title_english || a.title });
        }
    } catch { /* ignore */ }

    return Response.json({ poster: null });
}
