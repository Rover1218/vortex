import Link from "next/link";
import { revalidatePath } from "next/cache";
import RefreshRadarButton from "@/components/RefreshRadarButton";
import RadarAuthButton from "@/components/RadarAuthButton";
import RadarCard from "@/components/RadarCard";

export const revalidate = 300;
export const runtime = "nodejs";

type AnimeItem = {
    key: string;
    title: string;
    url: string;
    image?: string;
    episodes?: number | null;
    score?: number | null;
    broadcast?: string | null;
    currentEpisode?: number | null;
    synopsis?: string | null;
    year?: number | null;
    genres: string[];
    source: string;
};

type Bucket<T> = {
    name: string;
    items: T[];
};

type ChipTone = "accent" | "teal" | "violet" | "amber" | "rose" | "slate" | "neutral";

type Chip = {
    label: string;
    tone?: ChipTone;
};

const DAY_KEYS = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"] as const;
const ANIME_BUCKETS = ["Romance", "Action", "Fantasy", "Slice of Life", "Drama", "Sci-Fi", "Mystery", "Sports", "Other"] as const;
const MAX_RENDER_ITEMS_PER_BUCKET = 8;
const FETCH_TIMEOUT_MS = 9000;
const FETCH_RETRIES = 2;
const LAST_GOOD_JSON = new Map<string, any>();
const LAST_GOOD_GRAPHQL = new Map<string, any>();
const MANUAL_REFRESH_COOLDOWN_MS = 30000;
let lastManualRefreshAt = 0;
const MIN_NOW_AIRING_TARGET = 70;

function stripHtml(value?: string | null) {
    return String(value || "").replace(/<[^>]*>/g, "").replace(/\s+/g, " ").trim();
}

function normalizeText(value: string) {
    return value.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function uniqueBy<T>(items: T[], getKey: (item: T) => string) {
    const seen = new Set<string>();
    return items.filter(item => {
        const key = getKey(item);
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
    });
}

function parseGenres(entry: any): string[] {
    return [
        ...(Array.isArray(entry?.genres) ? entry.genres : []),
        ...(Array.isArray(entry?.themes) ? entry.themes : []),
        ...(Array.isArray(entry?.demographics) ? entry.demographics : []),
    ]
        .map((item: any) => item?.name)
        .filter(Boolean)
        .map((name: string) => name.trim());
}

function bucketForGenres(genres: string[]) {
    const normalized = genres.map(normalizeText);

    if (normalized.some(item => item.includes("romance") || item.includes("romcom") || item.includes("love"))) return "Romance";
    if (normalized.some(item => item.includes("action") || item.includes("battle") || item.includes("martial arts") || item.includes("super power"))) return "Action";
    if (normalized.some(item => item.includes("fantasy") || item.includes("magic") || item.includes("isekai") || item.includes("supernatural") || item.includes("adventure"))) return "Fantasy";
    if (normalized.some(item => item.includes("slice of life") || item.includes("school") || item.includes("workplace") || item.includes("gourmet"))) return "Slice of Life";
    if (normalized.some(item => item.includes("drama") || item.includes("psychological") || item.includes("historical") || item.includes("award winning"))) return "Drama";
    if (normalized.some(item => item.includes("sci fi") || item.includes("scifi") || item.includes("mecha") || item.includes("space"))) return "Sci-Fi";
    if (normalized.some(item => item.includes("mystery") || item.includes("thriller") || item.includes("detective") || item.includes("horror"))) return "Mystery";
    if (normalized.some(item => item.includes("sports"))) return "Sports";
    return "Other";
}

function getAiringMeta(item: AnimeItem) {
    const episodeChip = item.currentEpisode ? `Episode ${item.currentEpisode} streaming` : "Weekly schedule";
    const recentChip = item.currentEpisode && item.currentEpisode <= 2 ? "Started recently" : null;

    return {
        episodeChip,
        recentChip,
    };
}

function chipClass(tone: ChipTone = "neutral") {
    switch (tone) {
        case "accent":
            return "border-accent/25 bg-accent/12 text-accent";
        case "teal":
            return "border-teal/25 bg-teal/12 text-teal";
        case "violet":
            return "border-white/[0.10] bg-white/[0.05] text-text-2";
        case "amber":
            return "border-warning/25 bg-warning/12 text-warning";
        case "rose":
            return "border-danger/25 bg-danger/12 text-danger";
        case "slate":
            return "border-white/[0.10] bg-white/[0.045] text-text-2";
        default:
            return "border-white/[0.08] bg-white/[0.03] text-text-3";
    }
}

function genreTone(label: string): ChipTone {
    const normalized = normalizeText(label);

    if (normalized.includes("romance")) return "rose";
    if (normalized.includes("action")) return "accent";
    if (normalized.includes("fantasy")) return "violet";
    if (normalized.includes("slice of life")) return "teal";
    if (normalized.includes("drama")) return "amber";
    if (normalized.includes("sci fi")) return "accent";
    if (normalized.includes("mystery")) return "slate";
    if (normalized.includes("sports")) return "teal";
    return "slate";
}

function groupByBucket<T extends { genres: string[] }>(items: T[], getItemBucket: (item: T) => string = item => bucketForGenres(item.genres)) {
    const grouped = new Map<string, T[]>();

    for (const item of items) {
        const bucket = getItemBucket(item);
        const current = grouped.get(bucket) || [];
        current.push(item);
        grouped.set(bucket, current);
    }

    return Array.from(grouped.entries()).map(([name, list]) => ({
        name,
        items: list,
    })) as Bucket<T>[];
}

function cleanTitle(value: unknown) {
    if (value == null) return "Untitled";

    if (typeof value === "string") {
        return value.replace(/\s+/g, " ").trim();
    }

    if (typeof value === "object") {
        const candidate =
            (value as { english?: unknown }).english ??
            (value as { romaji?: unknown }).romaji ??
            (value as { canonicalTitle?: unknown }).canonicalTitle ??
            (value as { title?: unknown }).title;

        if (typeof candidate === "string") {
            return candidate.replace(/\s+/g, " ").trim();
        }
    }

    return String(value).replace(/\s+/g, " ").trim();
}

function normalizeAnimeTitle(value: unknown) {
    // Keep season/part markers so different seasons of a show stay as separate cards
    // (previously "… S1" and "… S4" collapsed into one).
    return normalizeText(cleanTitle(value));
}

function makeAnimeKey(entry: any, source: string) {
    return `${source}:${entry?.mal_id ?? entry?.id ?? entry?.slug ?? entry?.title ?? "anime"}:${entry?.year ?? entry?.startDate?.year ?? "na"}`;
}

function extractAnimeItem(entry: any, source: string): AnimeItem {
    const title = cleanTitle(entry?.title_english || entry?.title || entry?.title?.english || entry?.title?.romaji || entry?.canonicalTitle || "Untitled");
    const image = entry?.images?.jpg?.large_image_url || entry?.images?.jpg?.image_url || entry?.coverImage?.extraLarge || entry?.coverImage?.large || entry?.attributes?.posterImage?.large || entry?.attributes?.posterImage?.medium;
    const score = typeof entry?.score === "number" ? entry.score : typeof entry?.averageScore === "number" ? entry.averageScore / 10 : null;
    const year = typeof entry?.year === "number" ? entry.year : typeof entry?.startDate?.year === "number" ? entry.startDate.year : null;
    const currentEpisode = typeof entry?.nextAiringEpisode?.episode === "number"
        ? Math.max(entry.nextAiringEpisode.episode - 1, 1)
        : typeof entry?.airingEpisode?.episode === "number"
            ? entry.airingEpisode.episode
            : null;

    return {
        key: makeAnimeKey(entry, source),
        title,
        url: entry?.url || "#",
        image,
        episodes: typeof entry?.episodes === "number" ? entry.episodes : null,
        score,
        broadcast: entry?.broadcast?.string || entry?.broadcast?.day || entry?.airingEpisode?.episode || entry?.airingAt || null,
        currentEpisode,
        synopsis: stripHtml(entry?.synopsis || entry?.description).slice(0, 200) || null,
        year,
        genres: parseGenres(entry),
        source,
    };
}

type AnimeSlot = "upcoming" | "now";

type AnimeCard = AnimeItem & {
    slot: AnimeSlot;
};

function mergeAnimeCollections(upcomingItems: AnimeItem[], nowItems: AnimeItem[]) {
    const merged = new Map<string, AnimeCard>();

    const enqueue = (item: AnimeItem, slot: AnimeSlot) => {
        const key = normalizeAnimeTitle(item.title);
        const existing = merged.get(key);

        if (!existing) {
            merged.set(key, { ...item, slot });
            return;
        }

        merged.set(key, {
            ...existing,
            slot: existing.slot === "now" || slot === "now" ? "now" : "upcoming",
            title: existing.title.length >= item.title.length ? existing.title : item.title,
            url: existing.url !== "#" ? existing.url : item.url,
            image: existing.image || item.image,
            episodes: existing.episodes ?? item.episodes,
            currentEpisode: existing.currentEpisode ?? item.currentEpisode,
            score: Math.max(existing.score || 0, item.score || 0) || null,
            broadcast: existing.broadcast || item.broadcast,
            synopsis: existing.synopsis || item.synopsis,
            year: existing.year ?? item.year,
            genres: uniqueBy([...existing.genres, ...item.genres], genre => normalizeText(genre)),
            source: uniqueBy([...existing.source.split(" • "), item.source], sourceName => normalizeText(sourceName)).join(" • "),
        });
    };

    upcomingItems.forEach(item => enqueue(item, "upcoming"));
    nowItems.forEach(item => enqueue(item, "now"));

    return Array.from(merged.values()).sort((left, right) => {
        if (left.slot !== right.slot) return left.slot === "now" ? -1 : 1;
        return (right.score || 0) - (left.score || 0) || (left.title || "").localeCompare(right.title || "");
    });
}

async function fetchJson(url: string) {
    for (let attempt = 0; attempt <= FETCH_RETRIES; attempt += 1) {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

        try {
            const res = await fetch(url, { next: { revalidate }, signal: controller.signal });

            if (res.ok) {
                const parsed = await res.json();
                LAST_GOOD_JSON.set(url, parsed);
                return parsed;
            }
            if (res.status !== 429 && res.status < 500) return null;
        } catch {
            // retry on network/timeout errors
        } finally {
            clearTimeout(timeout);
        }

        if (attempt < FETCH_RETRIES) {
            await new Promise(resolve => setTimeout(resolve, 250 * (attempt + 1)));
        }
    }

    return LAST_GOOD_JSON.get(url) ?? null;
}

async function fetchGraphQL(url: string, query: string, variables: Record<string, unknown>) {
    const key = `${url}:${JSON.stringify(variables)}`;

    for (let attempt = 0; attempt <= FETCH_RETRIES; attempt += 1) {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

        try {
            const res = await fetch(url, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ query, variables }),
                next: { revalidate },
                signal: controller.signal,
            });

            if (res.ok) {
                const parsed = await res.json();
                LAST_GOOD_GRAPHQL.set(key, parsed);
                return parsed;
            }
            if (res.status !== 429 && res.status < 500) return null;
        } catch {
            // retry on network/timeout errors
        } finally {
            clearTimeout(timeout);
        }

        if (attempt < FETCH_RETRIES) {
            await new Promise(resolve => setTimeout(resolve, 250 * (attempt + 1)));
        }
    }

    return LAST_GOOD_GRAPHQL.get(key) ?? null;
}

async function getJikanUpcomingAnime(): Promise<AnimeItem[]> {
    const pages = await Promise.all([1, 2, 3, 4].map(page => fetchJson(`https://api.jikan.moe/v4/seasons/upcoming?page=${page}&limit=25`)));
    const items = pages.flatMap(page => (Array.isArray(page?.data) ? page.data : [])).map(item => extractAnimeItem(item, "Jikan Upcoming"));
    return uniqueBy(items, item => item.key).slice(0, 40);
}

async function getJikanNowAiringAnime(): Promise<AnimeItem[]> {
    const pages = await Promise.all(DAY_KEYS.map(day => fetchJson(`https://api.jikan.moe/v4/schedules?filter=${day}&sfw=true&limit=25`)));
    const scheduleItems = pages.flatMap(page => (Array.isArray(page?.data) ? page.data : [])).map(item => extractAnimeItem(item, "Jikan Schedule"));

    // If schedule pages are partially unavailable, top up from Jikan's now-season feed.
    if (scheduleItems.length < MIN_NOW_AIRING_TARGET) {
        const nowSeasonPages = await Promise.all([1, 2, 3, 4].map(page => fetchJson(`https://api.jikan.moe/v4/seasons/now?page=${page}&limit=25`)));
        const seasonItems = nowSeasonPages
            .flatMap(page => (Array.isArray(page?.data) ? page.data : []))
            .map(item => extractAnimeItem(item, "Jikan Now"));

        return uniqueBy([...scheduleItems, ...seasonItems], item => item.key).slice(0, 120);
    }

    return uniqueBy(scheduleItems, item => item.key).slice(0, 120);
}

async function getAniListSeasonAnime(kind: "now" | "next"): Promise<AnimeItem[]> {
    const query = `
        query ($season: MediaSeason, $seasonYear: Int, $type: MediaType, $page: Int) {
            Page(page: $page, perPage: 50) {
        media(season: $season, seasonYear: $seasonYear, type: $type, sort: [POPULARITY_DESC, SCORE_DESC]) {
          id
          title { romaji english }
          coverImage { extraLarge large }
          episodes
                    nextAiringEpisode { episode airingAt }
          averageScore
          genres
          tags { name }
          description(asHtml: false)
          siteUrl
          startDate { year }
        }
      }
    }
  `;

    const today = new Date();
    const month = today.getMonth();
    const year = today.getFullYear();
    const season = month < 3 ? "WINTER" : month < 6 ? "SPRING" : month < 9 ? "SUMMER" : "FALL";
    const nextSeason = season === "WINTER" ? "SPRING" : season === "SPRING" ? "SUMMER" : season === "SUMMER" ? "FALL" : "WINTER";
    const targetSeason = kind === "now" ? season : nextSeason;
    const targetYear = kind === "now" ? year : season === "FALL" ? year : year + 1;

    const pageIndexes = kind === "now" ? [1, 2] : [1];
    const payloads = await Promise.all(
        pageIndexes.map(page =>
            fetchGraphQL("https://graphql.anilist.co", query, {
                season: targetSeason,
                seasonYear: targetYear,
                type: "ANIME",
                page,
            }),
        ),
    );

    const items: AnimeItem[] = payloads
        .flatMap(data => (Array.isArray(data?.data?.Page?.media) ? data.data.Page.media : []))
        .map((item: any) => extractAnimeItem({ ...item, title: item.title, url: item.siteUrl }, `AniList ${kind}`));

    return uniqueBy(items, item => item.key).slice(0, 100);
}

type MediaKind = "movie" | "series";

type MediaItem = {
    key: string;
    title: string;
    image?: string;
    year: number | null;
    released: string | null;
    score: number | null;
    synopsis: string | null;
    genres: string[];
};

// Movies / TV via Cinemeta (keyless, datacenter-friendly — same source as the search
// page's discover rows). The "top" catalog returns currently-popular titles.
async function getCinemetaMedia(type: MediaKind): Promise<MediaItem[]> {
    const data = await fetchJson(`https://v3-cinemeta.strem.io/catalog/${type}/top.json`);
    const metas = Array.isArray(data?.metas) ? data.metas : [];

    return metas
        .map((m: any) => ({
            key: `cinemeta:${type}:${m.imdb_id || m.id || m.name}`,
            title: cleanTitle(m.name),
            image: String(m.poster || "").replace("/poster/small/", "/poster/medium/"),
            year: m.releaseInfo ? (parseInt(String(m.releaseInfo).slice(0, 4), 10) || null) : null,
            released: typeof m.released === "string" ? m.released : null,
            score: typeof m.imdbRating === "string" && m.imdbRating
                ? (parseFloat(m.imdbRating) || null)
                : (typeof m.imdbRating === "number" ? m.imdbRating : null),
            synopsis: stripHtml(m.description).slice(0, 200) || null,
            genres: Array.isArray(m.genre) ? m.genre : Array.isArray(m.genres) ? m.genres : [],
        }))
        .filter((m: MediaItem) => m.title && m.title !== "Untitled");
}

function StatCard({ label, value, hint }: { label: string; value: string; hint: string }) {
    return (
        <div className="rounded-2xl border border-white/[0.06] bg-elevated p-4">
            <div className="text-[10px] font-bold uppercase tracking-[0.2em] text-text-3">{label}</div>
            <div className="mt-1 text-2xl font-black text-text-1">{value}</div>
            <div className="mt-1 text-xs text-text-3">{hint}</div>
        </div>
    );
}

function AccordionSection<T extends { key: string }>({
    title,
    subtitle,
    items,
    emptyText,
    renderItem,
    defaultOpen = false,
    badge,
}: {
    title: string;
    subtitle: string;
    items: Bucket<T>[];
    emptyText: string;
    renderItem: (item: T) => React.ReactNode;
    defaultOpen?: boolean;
    badge: string;
}) {
    return (
        <section className="cine-card p-6">
            <div className="flex items-start justify-between gap-4">
                <div>
                    <div className="text-[10px] font-bold uppercase tracking-[0.2em] text-accent">{badge}</div>
                    <h2 className="cine-title mt-1 text-2xl">{title}</h2>
                    <p className="mt-1 text-sm text-text-3">{subtitle}</p>
                </div>
            </div>

            <div className="mt-5 space-y-3">
                {items.length > 0 ? (
                    items.map(bucket => (
                        <details
                            key={bucket.name}
                            open={defaultOpen && bucket.items.length > 0}
                            className="group rounded-2xl border border-white/[0.06] bg-elevated p-4"
                            style={{ contentVisibility: "auto", containIntrinsicSize: "300px", contain: "layout paint style" }}
                        >
                            <summary className="flex cursor-pointer list-none items-center justify-between gap-4">
                                <div>
                                    <div className="text-sm font-black uppercase tracking-[0.18em] text-text-2">{bucket.name}</div>
                                    <div className="mt-1 text-xs text-text-3">{bucket.items.length} title{bucket.items.length === 1 ? "" : "s"}</div>
                                </div>
                                <div className="flex h-8 w-8 items-center justify-center rounded-full border border-white/[0.08] bg-surface text-text-3 transition group-open:border-accent/30 group-open:text-accent">
                                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4 transition-transform duration-200 group-open:rotate-180" aria-hidden="true">
                                        <path d="m6 9 6 6 6-6" />
                                    </svg>
                                </div>
                            </summary>

                            <div className="mt-4 space-y-3" style={{ contain: "layout paint" }}>
                                {bucket.items.map(renderItem)}
                            </div>
                        </details>
                    ))
                ) : (
                    <div className="rounded-2xl border border-white/[0.06] bg-surface p-6 text-sm text-text-3">{emptyText}</div>
                )}
            </div>
        </section>
    );
}

export default async function ReleaseRadarPage() {
    async function refreshRadar() {
        "use server";
        const now = Date.now();
        if (now - lastManualRefreshAt < MANUAL_REFRESH_COOLDOWN_MS) return;
        lastManualRefreshAt = now;
        revalidatePath("/release-radar");
    }

    const [jikanUpcoming, jikanWeekly, aniListNow, aniListNext, cinemetaMovies, cinemetaSeries] = await Promise.all([
        getJikanUpcomingAnime(),
        getJikanNowAiringAnime(),
        getAniListSeasonAnime("now"),
        getAniListSeasonAnime("next"),
        getCinemetaMedia("movie"),
        getCinemetaMedia("series"),
    ]);

    // Split movies/shows into "coming soon" (release date still in the future) vs
    // currently popular, then bucket each by genre for the accordion sections.
    const nowMs = Date.now();
    const isFuture = (m: MediaItem) => (m.released ? new Date(m.released).getTime() > nowMs : false);
    const toMediaBuckets = (items: MediaItem[]) => ANIME_BUCKETS
        .map(name => ({ name, items: items.filter(item => bucketForGenres(item.genres) === name) }))
        .filter(bucket => bucket.items.length > 0)
        .map(bucket => ({ ...bucket, items: bucket.items.slice(0, MAX_RENDER_ITEMS_PER_BUCKET) }));

    const movieSoonBuckets = toMediaBuckets(cinemetaMovies.filter(isFuture));
    const movieNowBuckets = toMediaBuckets(cinemetaMovies.filter(m => !isFuture(m)));
    const seriesNowBuckets = toMediaBuckets(cinemetaSeries.filter(m => !isFuture(m)));

    const animeMerged = mergeAnimeCollections(uniqueBy([...jikanUpcoming, ...aniListNext], item => item.key), uniqueBy([...jikanWeekly, ...aniListNow], item => item.key));
    const animeAll = animeMerged;
    const animeUpcoming = animeMerged.filter(item => item.slot === "upcoming");
    const animeNow = animeMerged.filter(item => item.slot === "now");

    const animeUpcomingBuckets = ANIME_BUCKETS
        .map(name => ({ name, items: animeUpcoming.filter(item => bucketForGenres(item.genres) === name) }))
        .filter(bucket => bucket.items.length > 0)
        .map(bucket => ({ ...bucket, items: bucket.items.slice(0, MAX_RENDER_ITEMS_PER_BUCKET) }));

    const animeNowBuckets = ANIME_BUCKETS
        .map(name => ({ name, items: animeNow.filter(item => bucketForGenres(item.genres) === name) }))
        .filter(bucket => bucket.items.length > 0)
        .map(bucket => ({ ...bucket, items: bucket.items.slice(0, MAX_RENDER_ITEMS_PER_BUCKET) }));

    const nowLabel = new Intl.DateTimeFormat("en-US", { weekday: "long", month: "short", day: "numeric" }).format(new Date());

    return (
        <div className="min-h-screen bg-base text-text-1">
            <header className="relative z-10 mx-auto flex max-w-7xl items-center justify-between px-6 py-5">
                <Link href="/" className="flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-accent/12 text-accent ring-1 ring-accent/25">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5" aria-hidden="true">
                            <circle cx="12" cy="12" r="9" />
                            <circle cx="12" cy="12" r="4" />
                            <path d="M12 3v4M12 17v4M3 12h4M17 12h4" />
                        </svg>
                    </div>
                    <div>
                        <div className="text-lg font-black text-text-1">Vortex</div>
                        <div className="text-[10px] font-bold uppercase tracking-[0.2em] text-text-3">Release Radar</div>
                    </div>
                </Link>

                <div className="flex items-center gap-2">
                    <form action={refreshRadar}>
                        <RefreshRadarButton />
                    </form>
                    <RadarAuthButton />
                </div>
            </header>

            <main className="relative z-10 mx-auto max-w-7xl px-6 pb-16">
                <section className="overflow-hidden cine-card shadow-cinema p-8 md:p-10">
                    <div>
                        <div className="flex flex-wrap items-center gap-3">
                            <div className="cine-chip border-accent/25 bg-accent/12 text-accent">
                                Weekly release tracker
                            </div>
                            <div className="cine-chip border-white/[0.08] bg-surface text-text-2">
                                Updated {nowLabel}
                            </div>
                        </div>

                        <div className="mt-6 max-w-4xl">
                            <h1 className="cine-title text-4xl tracking-tight md:text-6xl">What&apos;s coming and what&apos;s playing — movies, shows &amp; anime.</h1>
                            <p className="mt-4 max-w-3xl text-base leading-relaxed text-text-2 md:text-lg">
                                Popular movies and TV plus upcoming and currently-airing anime, organized by genre. Tap any title to search for it in Vortex.
                            </p>
                        </div>

                        <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                            <StatCard label="Updated" value={nowLabel} hint="Fresh snapshot" />
                            <StatCard label="Movies" value={String(cinemetaMovies.length)} hint="Popular now" />
                            <StatCard label="TV shows" value={String(cinemetaSeries.length)} hint="Popular now" />
                            <StatCard label="Anime" value={String(animeAll.length)} hint={`${animeNow.length} airing now`} />
                        </div>
                    </div>
                </section>

                <section className="mt-8 cine-card p-6">
                    <div className="flex flex-wrap gap-2">
                        {ANIME_BUCKETS.map(bucket => {
                            const count = animeAll.filter(item => bucketForGenres(item.genres) === bucket).length;
                            return (
                                <span key={bucket} className={`inline-flex items-center gap-2 rounded-full border px-4 py-2 text-sm font-bold uppercase tracking-[0.18em] transition-colors hover:border-white/[0.14] ${chipClass(genreTone(bucket))}`}>
                                    {bucket}
                                    <span className="rounded-full bg-black/30 px-2 py-0.5 text-[10px] text-text-3">{count}</span>
                                </span>
                            );
                        })}
                    </div>
                </section>

                <div className="mt-8 space-y-8">
                    {movieSoonBuckets.length > 0 && (
                        <AccordionSection
                            title="Movies coming soon"
                            subtitle="Upcoming releases from Cinemeta, grouped by genre."
                            items={movieSoonBuckets}
                            emptyText="No upcoming movies right now."
                            badge="Movies"
                            defaultOpen={false}
                            renderItem={(item: MediaItem) => (
                                <RadarCard
                                    key={item.key}
                                    title={item.title}
                                    searchTitle={item.title}
                                    upcoming
                                    subtitle="Upcoming movie"
                                    image={item.image}
                                    meta={[
                                        { label: item.year ? String(item.year) : "Soon", tone: "neutral" },
                                        { label: item.score ? `★ ${item.score.toFixed(1)}` : "Unrated", tone: "amber" },
                                        { label: bucketForGenres(item.genres).toUpperCase(), tone: genreTone(bucketForGenres(item.genres)) },
                                    ]}
                                    description={item.synopsis}
                                />
                            )}
                        />
                    )}

                    <AccordionSection
                        title="Movies — popular now"
                        subtitle="Trending movies from Cinemeta, grouped by genre. Tap to search."
                        items={movieNowBuckets}
                        emptyText="No movies could be loaded right now."
                        badge="Movies"
                        defaultOpen={false}
                        renderItem={(item: MediaItem) => (
                            <RadarCard
                                key={item.key}
                                title={item.title}
                                searchTitle={item.title}
                                subtitle="Movie"
                                image={item.image}
                                meta={[
                                    { label: item.year ? String(item.year) : "Movie", tone: "neutral" },
                                    { label: item.score ? `★ ${item.score.toFixed(1)}` : "Unrated", tone: "amber" },
                                    { label: bucketForGenres(item.genres).toUpperCase(), tone: genreTone(bucketForGenres(item.genres)) },
                                ]}
                                description={item.synopsis}
                            />
                        )}
                    />

                    <AccordionSection
                        title="TV shows — popular now"
                        subtitle="Trending series from Cinemeta, grouped by genre. Tap to search."
                        items={seriesNowBuckets}
                        emptyText="No shows could be loaded right now."
                        badge="TV"
                        defaultOpen={false}
                        renderItem={(item: MediaItem) => (
                            <RadarCard
                                key={item.key}
                                title={item.title}
                                searchTitle={item.title}
                                subtitle="TV series"
                                image={item.image}
                                accent="teal"
                                meta={[
                                    { label: item.year ? String(item.year) : "Series", tone: "neutral" },
                                    { label: item.score ? `★ ${item.score.toFixed(1)}` : "Unrated", tone: "amber" },
                                    { label: bucketForGenres(item.genres).toUpperCase(), tone: genreTone(bucketForGenres(item.genres)) },
                                ]}
                                description={item.synopsis}
                            />
                        )}
                    />

                    <AccordionSection
                        title="Anime coming soon"
                        subtitle="Jikan upcoming + AniList next season, grouped by genre and stacked by bucket."
                        items={animeUpcomingBuckets}
                        emptyText="No upcoming anime could be loaded right now."
                        badge="Anime"
                        defaultOpen={false}
                        renderItem={item => (
                            <RadarCard
                                key={item.key}
                                title={item.title}
                                searchTitle={item.title}
                                upcoming
                                subtitle={`Upcoming anime • ${item.source}`}
                                image={item.image}
                                meta={[
                                    { label: item.year ? String(item.year) : "Soon", tone: "neutral" },
                                    { label: item.currentEpisode ? `Episode ${item.currentEpisode}` : item.episodes ? `${item.episodes} eps` : "Series", tone: item.currentEpisode ? "accent" : "slate" },
                                    { label: item.score ? `★ ${item.score.toFixed(1)}` : "No score yet", tone: "amber" },
                                    { label: bucketForGenres(item.genres).toUpperCase(), tone: genreTone(bucketForGenres(item.genres)) },
                                ]}
                                description={item.synopsis}
                            />
                        )}
                    />

                    <AccordionSection
                        title="Anime airing now"
                        subtitle="Jikan weekly schedules + AniList current season, grouped by genre and shown with a consistent status chip."
                        items={animeNowBuckets}
                        emptyText="No currently airing anime could be loaded right now."
                        badge="Anime"
                        defaultOpen={false}
                        renderItem={item => (
                            <RadarCard
                                key={item.key}
                                title={item.title}
                                searchTitle={item.title}
                                subtitle={`Airing now • ${item.source}`}
                                image={item.image}
                                accent="teal"
                                meta={(() => {
                                    const airingMeta = getAiringMeta(item);
                                    const chips = [] as Chip[];

                                    if (airingMeta.recentChip) chips.push({ label: airingMeta.recentChip, tone: "teal" });
                                    chips.push({ label: airingMeta.episodeChip, tone: item.currentEpisode ? "accent" : "slate" });
                                    chips.push({ label: item.episodes ? `${item.episodes} eps` : "Ongoing", tone: "violet" });
                                    if (item.score) chips.push({ label: `★ ${item.score.toFixed(1)}`, tone: "amber" });
                                    chips.push({ label: bucketForGenres(item.genres).toUpperCase(), tone: genreTone(bucketForGenres(item.genres)) });

                                    return chips;
                                })()}
                                description={item.synopsis}
                            />
                        )}
                    />
                </div>
            </main>
        </div>
    );
}