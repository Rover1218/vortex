// Adult / explicit content filter for search results.
//
// Providers (esp. The Pirate Bay / TorrentCSV) index large adult catalogs. We hide
// those. Matching is high-precision: porn studio brands, the substring "xxx", and
// explicit terms that essentially never appear in mainstream film/TV/anime titles.
// A small allow-list rescues the rare legit title that contains "xxx" (xXx, MaXXXine).

// Distinctive porn studio / site brand names — substring match on the normalized
// title. Only DISTINCTIVE / coined names are listed here; common English words that
// happen to be studio names (Deeper, Vixen, Wicked, Private, Kink, Slayed…) are
// deliberately omitted to avoid blocking real titles — the term/xxx lists catch those.
const ADULT_STUDIOS = [
    "brazzers", "blacked", "tushy", "evilangel", "evil angel", "teamskeet", "team skeet",
    "legalporno", "legal porno", "onlyfans", "only fans", "manyvids", "many vids",
    "chaturbate", "naughtyamerica", "naughty america", "realitykings", "reality kings",
    "bangbros", "bang bros", "bangbus", "bang bus", "mofos", "sislovesme", "sis loves me",
    "familystrokes", "family strokes", "stepsiblings", "step siblings", "mysistershotfriend",
    "my sisters hot friend", "passionhd", "passion hd", "mylf", "nubilefilms", "nubiles",
    "nubilesporn", "exxxtra", "povd", "fakehub", "fake hub", "faketaxi", "fake taxi",
    "publicagent", "public agent", "metart", "met art", "joymii", "tushyraw",
    "sweetsinner", "sweet sinner", "devilsfilm", "devils film", "julesjordan",
    "jules jordan", "dogfart", "cumlouder", "cum louder", "badoink", "vrporn", "vr porn",
    "wankzvr", "perverted", "pervertedpov", "parasited", "freeuse", "free use",
    "freeusefantasy", "crazycollegegfs", "college gfs", "thewhiteboxxx", "whiteboxxx",
    "pervmom", "perv mom", "dadcrush", "dad crush", "badmilfs", "bad milfs", "daughterswap",
    "daughter swap", "momswap", "familyswap", "family swap", "hotwife", "propertysex",
    "milfhunter", "milf hunter", "blackedraw", "blacked raw", "adulttime", "adult time",
    "mamacitaz", "letsdoeit", "lets doe it", "sexyhub", "brattysis", "bratty sis",
    "czechcasting", "czech casting", "czechstreets", "czech streets", "czechav", "czech av",
    "pornhub", "porn hub", "xhamster", "youjizz", "spankbang", "spank bang", "xvideos",
    "xnxx", "eporner", "hqporner", "redtube", "youporn", "playboyplus", "playboy plus",
    "digitalplayground", "digital playground", "dorcel", "twistys", "wankz",
    // JAV / hentai labels
    "fc2ppv", "fc2-ppv", "caribbeancom", "caribbean com", "1pondo", "heyzo", "tokyohot",
    "tokyo hot", "10musume", "pacopacomama", "pacopaco",
];

// Explicit terms — word-boundary match. Chosen to avoid mainstream collisions
// (note: "sex", "teen", "nude", "naked", "facial", "swallow", "hardcore", "private"
// are intentionally NOT here — they appear in real titles).
const ADULT_TERMS = [
    "porn", "porno", "p0rn", "hentai", "futanari", "ahegao", "milf", "gilf", "gangbang",
    "gang bang", "creampie", "cream pie", "blowjob", "blow job", "deepthroat", "deep throat",
    "bukkake", "cumshot", "cum shot", "cumpilation", "handjob", "hand job", "footjob",
    "rimjob", "titfuck", "titjob", "threesome", "foursome", "gloryhole", "glory hole",
    "cuckold", "fauxcest", "incest", "bareback", "camgirl", "camwhore", "nympho", "pegging",
    "squirting", "strapon", "strap-on", "bdsm", "hogtied", "gonzo", "anal", "fucking",
    "fucked", "fucks", "gaping", "throatpie", "spitroast", "hardcorexxx", "deepfake porn",
    "uncensored jav", "jav uncensored", "double penetration", "dp xxx", "18+", "adults only",
    "stepsister", "step sister", "stepsis", "step sis", "stepmom", "step mom", "stepbro",
    "step bro", "stepbrother", "step brother", "stepdad", "step dad", "stepson", "step son",
    "stepdaughter", "step daughter",
];

// Real titles that legitimately contain "xxx" — don't block these.
const ALLOW_RE = /\b(xander cage|maxxxine)\b/i;

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const STUDIO_RE = new RegExp(ADULT_STUDIOS.map(escape).join("|"), "i");
const TERM_RE = new RegExp("\\b(?:" + ADULT_TERMS.map(escape).join("|") + ")\\b", "i");
// "xxx" as a raw substring catches embedded forms (TheWhiteBoxxx, Exxxtra, etc.).
const XXX_RE = /xxx/i;

const normalize = (s: string) => s.toLowerCase().replace(/[._\-]+/g, " ").replace(/\s+/g, " ");

/** Returns true if a torrent title is adult/explicit content that should be hidden. */
export function isAdultTitle(title: string | undefined | null): boolean {
    if (!title) return false;
    const norm = normalize(title);
    if (ALLOW_RE.test(norm)) return false;
    return XXX_RE.test(norm) || STUDIO_RE.test(norm) || TERM_RE.test(norm);
}

// A few extra words that are clear adult INTENT when typed into the search bar, but
// too risky to filter out of result titles (they appear in mainstream titles, e.g.
// "Sex Education", "The Naked Gun"). Only applied to the query, with word boundaries.
const QUERY_ONLY_TERMS = ["nsfw", "sex video", "sex tape", "sex scene", "naked girls", "naked women"];
const QUERY_TERM_RE = new RegExp("\\b(?:" + QUERY_ONLY_TERMS.map(escape).join("|") + ")\\b", "i");

/** Returns true if a search query is explicitly looking for adult content. */
export function isAdultQuery(query: string | undefined | null): boolean {
    if (!query) return false;
    if (isAdultTitle(query)) return true;
    const norm = normalize(query);
    if (ALLOW_RE.test(norm)) return false;
    return QUERY_TERM_RE.test(norm);
}
