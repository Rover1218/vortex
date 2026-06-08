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

// Choose the best poster. Cinemeta's search already ranks by relevance and resolves
// romaji/alias titles (e.g. "Natsu e no Tunnel…" → the English movie), so we TRUST its
// ordering and only override it for a confident exact-name or year-confirmed match.
// (Loose substring matching used to mis-fire — e.g. a romaji query containing the word
// "Sayonara" grabbing an unrelated title literally named "Sayonara".)
function pickBest(metas: Meta[], q: string, year: string): Meta | null {
    const withPoster = metas.filter(m => m.poster && m.name);
    if (withPoster.length === 0) return null;
    const nq = norm(q);

    // 1. Exact (normalized) name match — wins from any position.
    const exact = withPoster.find(m => norm(m.name || "") === nq);
    if (exact) return exact;

    // 2. Year-confirmed overlap (disambiguates same-named titles, e.g. two "Apex").
    if (year) {
        const ym = withPoster.find(m => {
            const nn = norm(m.name || "");
            return String(m.releaseInfo || "").slice(0, 4) === year && (nn.includes(nq) || nq.includes(nn));
        });
        if (ym) return ym;
    }

    // 3. Otherwise trust Cinemeta's top-ranked result.
    return withPoster[0];
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
