import Link from "next/link";
import { revalidatePath } from "next/cache";
import RefreshRadarButton from "@/components/RefreshRadarButton";
import RadarAuthButton from "@/components/RadarAuthButton";

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
            return "border-[#8b7aff]/25 bg-[#8b7aff]/12 text-[#b8adff]";
        case "amber":
            return "border-warning/25 bg-warning/12 text-warning";
        case "rose":
            return "border-[#ff6b9d]/25 bg-[#ff6b9d]/12 text-[#ff9abd]";
        case "slate":
            return "border-white/[0.10] bg-white/[0.045] text-text-2";
        default:
            return "border-white/[0.08] bg-black/20 text-text-2";
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
    return normalizeText(cleanTitle(value)).replace(/\b(season|part|cour|ii|iii|iv|2nd|3rd|4th)\b/g, "").replace(/\s+/g, " ").trim();
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
    const items = pages.flatMap(page => (Array.isArray(page?.data) ? page.data : [])).map(item => extractAnimeItem(item, "Jikan Schedule"));
    return uniqueBy(items, item => item.key).slice(0, 70);
}

async function getAniListSeasonAnime(kind: "now" | "next"): Promise<AnimeItem[]> {
    const query = `
    query ($season: MediaSeason, $seasonYear: Int, $type: MediaType) {
      Page(perPage: 50) {
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

    const data = await fetchGraphQL("https://graphql.anilist.co", query, { season: targetSeason, seasonYear: targetYear, type: "ANIME" });
    const items: AnimeItem[] = Array.isArray(data?.data?.Page?.media)
        ? data.data.Page.media.map((item: any) => extractAnimeItem({ ...item, title: item.title, url: item.siteUrl }, `AniList ${kind}`))
        : [];
    return uniqueBy(items, item => item.key).slice(0, 50);
}

function StatCard({ label, value, hint }: { label: string; value: string; hint: string }) {
    return (
        <div className="rounded-2xl border border-white/[0.08] bg-white/[0.04] p-4">
            <div className="text-[10px] font-bold uppercase tracking-[0.2em] text-text-3">{label}</div>
            <div className="mt-1 text-2xl font-black text-white">{value}</div>
            <div className="mt-1 text-xs text-text-3">{hint}</div>
        </div>
    );
}

function PosterCard({
    title,
    subtitle,
    url,
    image,
    meta,
    description,
    accent = "accent",
}: {
    title: string;
    subtitle: string;
    url: string;
    image?: string;
    meta: Chip[];
    description?: string | null;
    accent?: "accent" | "teal";
}) {
    return (
        <a
            href={url}
            target="_blank"
            rel="noreferrer"
            className="group flex gap-4 rounded-[1.5rem] border border-white/[0.08] bg-gradient-to-br from-white/[0.055] via-white/[0.035] to-transparent p-4 transition-colors duration-200 hover:border-white/[0.14] hover:bg-white/[0.05]"
            style={{ contentVisibility: "auto", containIntrinsicSize: "160px" }}
        >
            <div className={`h-20 w-14 shrink-0 overflow-hidden rounded-xl border ${accent === "teal" ? "border-teal/25 bg-teal/10" : "border-accent/25 bg-accent/10"}`}>
                {image ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={image} alt={title} className="h-full w-full object-cover" loading="lazy" decoding="async" fetchPriority="low" />
                ) : (
                    <div className="flex h-full w-full items-center justify-center text-xs font-black text-text-3">V</div>
                )}
            </div>
            <div className="min-w-0 flex-1">
                <div className="text-[10px] font-bold uppercase tracking-[0.18em] text-text-3">{subtitle}</div>
                <div className="mt-1 text-base font-bold text-white group-hover:text-white">{title}</div>
                <div className="mt-2 flex flex-wrap gap-2">
                    {meta.map(item => (
                        <span key={item.label} className={`rounded-full border px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider ${chipClass(item.tone)}`}>
                            {item.label}
                        </span>
                    ))}
                </div>
                {description ? <p className="mt-2 text-sm text-text-3 line-clamp-2">{description}</p> : null}
            </div>
        </a>
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
        <section className="rounded-[2rem] border border-white/[0.08] bg-white/[0.04] p-6">
            <div className="flex items-start justify-between gap-4">
                <div>
                    <div className="text-[10px] font-bold uppercase tracking-[0.2em] text-accent">{badge}</div>
                    <h2 className="mt-1 text-2xl font-black text-white">{title}</h2>
                    <p className="mt-1 text-sm text-text-3">{subtitle}</p>
                </div>
            </div>

            <div className="mt-5 space-y-3">
                {items.length > 0 ? (
                    items.map(bucket => (
                        <details
                            key={bucket.name}
                            open={defaultOpen && bucket.items.length > 0}
                            className="group rounded-2xl border border-white/[0.08] bg-black/20 p-4"
                            style={{ contentVisibility: "auto", containIntrinsicSize: "300px", contain: "layout paint style" }}
                        >
                            <summary className="flex cursor-pointer list-none items-center justify-between gap-4">
                                <div>
                                    <div className="text-sm font-black uppercase tracking-[0.18em] text-text-2">{bucket.name}</div>
                                    <div className="mt-1 text-xs text-text-3">{bucket.items.length} title{bucket.items.length === 1 ? "" : "s"}</div>
                                </div>
                                <div className="rounded-full border border-white/[0.08] bg-white/[0.03] px-3 py-1 text-[10px] font-bold uppercase tracking-[0.18em] text-text-3 transition group-open:bg-accent/10 group-open:text-accent">
                                    Toggle
                                </div>
                            </summary>

                            <div className="mt-4 space-y-3" style={{ contain: "layout paint" }}>
                                {bucket.items.map(renderItem)}
                            </div>
                        </details>
                    ))
                ) : (
                    <div className="rounded-2xl border border-white/[0.06] bg-black/20 p-6 text-sm text-text-3">{emptyText}</div>
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

    const [jikanUpcoming, jikanWeekly, aniListNow, aniListNext] = await Promise.all([
        getJikanUpcomingAnime(),
        getJikanNowAiringAnime(),
        getAniListSeasonAnime("now"),
        getAniListSeasonAnime("next"),
    ]);

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
    const sourceSnapshot = [
        `Jikan upcoming: ${jikanUpcoming.length}`,
        `Jikan weekly: ${jikanWeekly.length}`,
        `AniList now: ${aniListNow.length}`,
        `AniList next: ${aniListNext.length}`,
    ].join(" • ");

    return (
        <div className="min-h-screen bg-base text-text-1">
            <header className="relative z-10 mx-auto flex max-w-7xl items-center justify-between px-6 py-5">
                <Link href="/" className="flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-gradient-to-br from-accent via-[#8b7aff] to-teal text-white font-black shadow-[0_18px_36px_-20px_rgba(57,160,255,0.95)] ring-1 ring-white/10">
                        V
                    </div>
                    <div>
                        <div className="text-lg font-black text-white">Vortex</div>
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
                <section className="overflow-hidden rounded-[2.4rem] border border-white/[0.08] bg-gradient-to-br from-white/[0.07] via-white/[0.035] to-white/[0.015] p-8 md:p-10">
                    <div>
                        <div className="flex flex-wrap items-center gap-3">
                            <div className="inline-flex items-center gap-2 rounded-full border border-accent/20 bg-accent/10 px-4 py-1.5 text-[11px] font-bold uppercase tracking-[0.18em] text-accent">
                                Weekly release tracker
                            </div>
                            <div className="inline-flex items-center gap-2 rounded-full border border-white/[0.08] bg-black/20 px-4 py-1.5 text-[11px] font-bold uppercase tracking-[0.18em] text-text-2">
                                Updated {nowLabel}
                            </div>
                        </div>

                        <div className="mt-6 max-w-4xl">
                            <h1 className="text-4xl font-black tracking-tight text-white md:text-6xl">Anime coming soon and what is airing now.</h1>
                            <p className="mt-4 max-w-3xl text-base leading-relaxed text-text-2 md:text-lg">
                                Merged from Jikan and AniList, then shaped into a premium radar with clean genre buckets, consistent episode labels, and a strong visual hierarchy.
                            </p>
                            <p className="mt-3 text-sm text-text-3">Source snapshot: {sourceSnapshot}</p>
                        </div>

                        <div className="mt-8 grid gap-4 sm:grid-cols-3">
                            <StatCard label="Updated" value={nowLabel} hint="Fresh weekly snapshot" />
                            <StatCard label="All anime" value={String(animeAll.length)} hint="Merged Jikan + AniList" />
                            <StatCard label="Now airing" value={String(animeNow.length)} hint="Current-season anime" />
                        </div>

                        <div className="mt-5 grid gap-3 md:grid-cols-2">
                            <div className="rounded-2xl border border-white/[0.08] bg-black/20 px-4 py-3 text-sm text-text-2">
                                <span className="font-bold text-white">Airing now</span> cards stay consistent: episode number when known, otherwise a weekly schedule label.
                            </div>
                            <div className="rounded-2xl border border-white/[0.08] bg-black/20 px-4 py-3 text-sm text-text-2">
                                <span className="font-bold text-white">Started recently</span> highlights episode 1 and 2 so new shows stand out immediately.
                            </div>
                        </div>
                    </div>
                </section>

                <section className="mt-8 rounded-[2rem] border border-white/[0.08] bg-white/[0.04] p-6">
                    <div className="flex flex-wrap gap-2">
                        {ANIME_BUCKETS.map(bucket => {
                            const count = animeAll.filter(item => bucketForGenres(item.genres) === bucket).length;
                            return (
                                <span key={bucket} className={`inline-flex items-center gap-2 rounded-full border px-4 py-2 text-sm font-bold uppercase tracking-[0.18em] transition-colors hover:border-white/[0.14] ${chipClass(genreTone(bucket))}`}>
                                    {bucket}
                                    <span className="rounded-full bg-white/5 px-2 py-0.5 text-[10px] text-text-3">{count}</span>
                                </span>
                            );
                        })}
                    </div>
                </section>

                <div className="mt-8 space-y-8">
                    <AccordionSection
                        title="Anime coming soon"
                        subtitle="Jikan upcoming + AniList next season, grouped by genre and stacked by bucket."
                        items={animeUpcomingBuckets}
                        emptyText="No upcoming anime could be loaded right now."
                        badge="Anime"
                        defaultOpen={false}
                        renderItem={item => (
                            <PosterCard
                                key={item.key}
                                title={item.title}
                                subtitle={`Upcoming anime • ${item.source}`}
                                url={item.url}
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
                            <PosterCard
                                key={item.key}
                                title={item.title}
                                subtitle={`Airing now • ${item.source}`}
                                url={item.url}
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