import { NextRequest, NextResponse } from 'next/server';

type ChatHistoryItem = {
    role: 'user' | 'bot';
    text: string;
};

type ParsedModelResponse = {
    reply: string;
    suggestions: string[];
    contextTags: string[];
    suggestionItems: SuggestionItem[];
};

type SuggestionItem = {
    title: string;
    reason: string;
};

const GLOBAL_TITLE_POOL = [
    'Inception', 'Interstellar', 'Arrival', 'Blade Runner 2049', 'Ex Machina', 'Predestination',
    'Parasite', 'Memories of Murder', 'Oldboy', 'The Chaser', 'Burning', 'The Wailing',
    'Your Name', 'A Silent Voice', 'Spirited Away', 'Weathering with You', 'Paprika', 'Perfect Blue',
    '3 Idiots', 'Taare Zameen Par', 'Dangal', 'Andhadhun', 'PK', 'Queen',
    'The Dark Knight', 'Prisoners', 'Gone Girl', 'Shutter Island', 'Whiplash', 'Nightcrawler',
    'The Truman Show', 'Eternal Sunshine of the Spotless Mind', 'Everything Everywhere All at Once', 'The Prestige',
    'About Time', 'The Intern', 'Little Miss Sunshine', 'The Grand Budapest Hotel', 'Chef', 'La La Land'
];

function sanitizeText(value: unknown, max = 240): string {
    return String(value || '').replace(/[\r\n\t]+/g, ' ').trim().slice(0, max);
}

function normalizeTitle(value: string): string {
    return String(value || '')
        .toLowerCase()
        .replace(/[^a-z0-9\s]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
}

function extractJsonCandidate(text: string): string {
    const cleaned = text
        .replace(/```json/gi, '```')
        .replace(/```/g, '')
        .trim();

    const firstBrace = cleaned.indexOf('{');
    const lastBrace = cleaned.lastIndexOf('}');
    if (firstBrace >= 0 && lastBrace > firstBrace) {
        return cleaned.slice(firstBrace, lastBrace + 1);
    }

    return cleaned;
}

function parseMaybeJsonString(value: unknown): unknown {
    if (typeof value !== 'string') return value;
    const t = value.trim();
    if (!(t.startsWith('{') || t.startsWith('['))) return value;
    try {
        return JSON.parse(t);
    } catch {
        return value;
    }
}

function sanitizeAvoid(raw: unknown): string[] {
    if (!Array.isArray(raw)) return [];
    return raw
        .map(v => sanitizeText(v, 90))
        .filter(Boolean)
        .slice(0, 30);
}

function sanitizeSuggestionItems(raw: unknown): SuggestionItem[] {
    if (!Array.isArray(raw)) return [];
    const out: SuggestionItem[] = [];
    const seen = new Set<string>();

    for (const item of raw) {
        const maybeParsed = parseMaybeJsonString(item);

        // Some models return nested arrays/objects encoded as strings; flatten one level.
        if (Array.isArray(maybeParsed)) {
            for (const nested of maybeParsed) {
                const nestedItems = sanitizeSuggestionItems([nested]);
                for (const nestedItem of nestedItems) {
                    const nestedKey = normalizeTitle(nestedItem.title);
                    if (nestedKey && !seen.has(nestedKey)) {
                        seen.add(nestedKey);
                        out.push(nestedItem);
                        if (out.length >= 5) return out;
                    }
                }
            }
            continue;
        }

        const title = sanitizeText((maybeParsed as any)?.title ?? (maybeParsed as any)?.name ?? maybeParsed, 90)
            .replace(/^[-*\d.)\s]+/, '')
            .trim();
        const reason = sanitizeText((maybeParsed as any)?.reason, 140);
        if (!title) continue;

        // Reject raw JSON-like strings that leaked through parsing.
        if (/^\{.*(reply|suggestions|suggestionItems|contextTags).*/i.test(title)) continue;

        const key = normalizeTitle(title);
        if (!key) continue;
        if (seen.has(key)) continue;
        seen.add(key);
        out.push({ title, reason: reason || 'Fits your prompt and is easy to search.' });
        if (out.length >= 5) break;
    }

    return out;
}

function sanitizeContextTags(raw: unknown): string[] {
    if (!Array.isArray(raw)) return [];
    const out: string[] = [];
    const seen = new Set<string>();

    for (const item of raw) {
        const value = sanitizeText(item, 24).replace(/[^a-zA-Z0-9\-\s]/g, '').trim();
        if (!value) continue;
        const key = value.toLowerCase();
        if (seen.has(key)) continue;
        seen.add(key);
        out.push(value);
        if (out.length >= 4) break;
    }

    return out;
}

function inferContextTags(prompt: string): string[] {
    const p = (prompt || '').toLowerCase();
    const tags: string[] = [];

    if (/anime|japan|japanese/.test(p)) tags.push('anime');
    if (/korean|k-drama/.test(p)) tags.push('korean');
    if (/hindi|bollywood|indian/.test(p)) tags.push('hindi');
    if (/thriller|crime|mystery|suspense/.test(p)) tags.push('thriller');
    if (/romance|love/.test(p)) tags.push('romance');
    if (/comedy|funny|feel[-\s]?good|light/.test(p)) tags.push('feel-good');
    if (/sci|space|time|mind[-\s]?bending|future/.test(p)) tags.push('sci-fi');
    if (/action|adventure/.test(p)) tags.push('action');

    if (tags.length === 0) tags.push('movie picks');
    return tags.slice(0, 3);
}

function titlePoolByTags(tags: string[], prompt: string): string[] {
    const p = prompt.toLowerCase();
    const pool: string[] = [];

    if (tags.includes('anime')) {
        pool.push('Your Name', 'A Silent Voice', 'Spirited Away', 'Weathering with You', 'Paprika', 'Perfect Blue');
    }
    if (tags.includes('korean') || tags.includes('thriller')) {
        pool.push('Parasite', 'Memories of Murder', 'Oldboy', 'The Chaser', 'Burning', 'The Wailing');
    }
    if (tags.includes('hindi')) {
        pool.push('3 Idiots', 'Taare Zameen Par', 'Dangal', 'Andhadhun', 'PK', 'Queen');
    }
    if (tags.includes('sci-fi')) {
        pool.push('Inception', 'Interstellar', 'Arrival', 'Blade Runner 2049', 'Ex Machina', 'Predestination', 'The Prestige');
    }
    if (tags.includes('feel-good')) {
        pool.push('About Time', 'The Intern', 'Little Miss Sunshine', 'Chef', 'The Secret Life of Walter Mitty');
    }
    if (tags.includes('romance')) {
        pool.push('La La Land', 'About Time', 'Before Sunrise', 'Her', 'The Notebook');
    }
    if (tags.includes('action')) {
        pool.push('Mad Max: Fury Road', 'John Wick', 'The Dark Knight', 'Casino Royale', 'The Raid');
    }

    if (/mind|twist|psychological/.test(p)) {
        pool.push('Shutter Island', 'Fight Club', 'Donnie Darko', 'Mulholland Drive', 'Coherence');
    }
    if (/something new|new titles|different/.test(p)) {
        pool.push('The Truman Show', 'Eternal Sunshine of the Spotless Mind', 'Everything Everywhere All at Once', 'Nightcrawler');
    }

    return sanitizeSuggestions([...pool, ...GLOBAL_TITLE_POOL]);
}

function ensureMinSuggestionItems(items: SuggestionItem[], prompt: string, tags: string[], avoid: string[], min = 4): SuggestionItem[] {
    const avoidSet = new Set(avoid.map(a => normalizeTitle(a)));
    const out: SuggestionItem[] = [];
    const seen = new Set<string>();

    for (const item of items) {
        const key = normalizeTitle(item.title);
        if (!key || avoidSet.has(key) || seen.has(key)) continue;
        seen.add(key);
        out.push(item);
        if (out.length >= 5) return out;
    }

    if (out.length < min) {
        for (const title of titlePoolByTags(tags, prompt)) {
            const key = normalizeTitle(title);
            if (!key || avoidSet.has(key) || seen.has(key)) continue;
            seen.add(key);
            out.push({ title, reason: inferReason(title, prompt, tags) });
            if (out.length >= 5) break;
        }
    }

    return out;
}

function sanitizeHistory(raw: unknown): ChatHistoryItem[] {
    if (!Array.isArray(raw)) return [];
    return raw
        .map(item => {
            const role = item?.role === 'user' ? 'user' : item?.role === 'bot' ? 'bot' : null;
            const text = sanitizeText(item?.text, 220);
            if (!role || !text) return null;
            return { role, text };
        })
        .filter(Boolean) as ChatHistoryItem[];
}

function filterAvoided(values: string[], avoid: string[]): string[] {
    const avoidSet = new Set(avoid.map(v => normalizeTitle(v)));
    return values.filter(v => !avoidSet.has(normalizeTitle(v)));
}

function inferReason(title: string, prompt: string, tags: string[]): string {
    const t = title.toLowerCase();
    const p = prompt.toLowerCase();
    if (tags.includes('sci-fi')) return 'Strong sci-fi concept with memorable ideas.';
    if (tags.includes('thriller')) return 'High tension pace with strong suspense.';
    if (tags.includes('feel-good')) return 'Easy watch with an uplifting tone.';
    if (tags.includes('romance')) return 'Romance-forward story with emotional payoff.';
    if (tags.includes('anime')) return 'Popular anime pick with strong storytelling.';
    if (tags.includes('korean')) return 'Widely recommended Korean standout.';
    if (tags.includes('hindi')) return 'Well-loved Hindi favorite with broad appeal.';
    if (/dark|intense/.test(p)) return 'Darker tone with strong dramatic impact.';
    if (/classic|old/.test(p)) return 'A classic pick with lasting reputation.';
    if (/action/.test(p)) return 'Action-heavy with consistent momentum.';
    if (/comedy/.test(p)) return 'Comedy-driven pick with great rewatch value.';
    if (/interstellar|inception|parasite|oldboy/.test(t)) return 'Fan-favorite title often recommended for this taste.';
    return 'Matches your request and has high recommendation value.';
}

function toSuggestionItems(titles: string[], prompt: string, tags: string[]): SuggestionItem[] {
    return titles.slice(0, 5).map(title => ({
        title,
        reason: inferReason(title, prompt, tags),
    }));
}

function fallbackSuggestions(prompt: string, avoid: string[] = []): string[] {
    const tags = inferContextTags(prompt);
    const combined = titlePoolByTags(tags, prompt);
    const filtered = filterAvoided(combined, avoid);
    return filtered.slice(0, 5);
}

function sanitizeSuggestions(raw: unknown): string[] {
    if (!Array.isArray(raw)) return [];
    const seen = new Set<string>();
    const out: string[] = [];

    for (const item of raw) {
        const parsed = parseMaybeJsonString(item);
        if (typeof parsed === 'object' && parsed && !Array.isArray(parsed)) {
            const nested = sanitizeSuggestionItems([parsed]);
            for (const n of nested) {
                const key = normalizeTitle(n.title);
                if (!key || seen.has(key)) continue;
                seen.add(key);
                out.push(n.title);
                if (out.length >= 5) return out;
            }
            continue;
        }

        const value = String(parsed || '').replace(/[\r\n\t]+/g, ' ').replace(/^[-*\d.)\s]+/, '').trim();
        if (!value || value.length > 90) continue;
        if (/^\{.*(reply|suggestions|suggestionItems|contextTags).*/i.test(value)) continue;
        const key = normalizeTitle(value);
        if (!key) continue;
        if (seen.has(key)) continue;
        seen.add(key);
        out.push(value);
        if (out.length >= 5) break;
    }

    return out;
}

function parseModelSuggestions(content: string): ParsedModelResponse {
    const text = (content || '').trim();
    if (!text) {
        return { reply: 'Try one of these titles. Tap to search instantly.', suggestions: [], contextTags: [], suggestionItems: [] };
    }

    try {
        const obj = JSON.parse(extractJsonCandidate(text)) as {
            reply?: string;
            suggestions?: Array<string | { title?: string; reason?: string }>;
            suggestionItems?: Array<{ title?: string; reason?: string }>;
            contextTags?: string[];
        };
        const fromItems = sanitizeSuggestionItems(obj.suggestionItems || obj.suggestions || []);
        const suggestions = fromItems.length > 0
            ? fromItems.map(item => item.title)
            : sanitizeSuggestions(obj.suggestions || []);
        const contextTags = sanitizeContextTags(obj.contextTags || []);
        const reply = String(obj.reply || 'Try one of these titles. Tap to search instantly.').trim();
        return {
            reply,
            suggestions,
            contextTags,
            suggestionItems: fromItems,
        };
    } catch {
        // Second chance: try parsing each line as JSON and then sanitizing.
        const parsedLineItems = text
            .split('\n')
            .map(line => parseMaybeJsonString(line.trim()))
            .filter(Boolean);

        const fromLineItems = sanitizeSuggestionItems(parsedLineItems);
        if (fromLineItems.length > 0) {
            return {
                reply: 'Try one of these titles. Tap to search instantly.',
                suggestions: fromLineItems.map(item => item.title),
                contextTags: [],
                suggestionItems: fromLineItems,
            };
        }

        const lines = text
            .split('\n')
            .map(line => line.replace(/^[-*\d.)\s]+/, '').trim())
            .filter(Boolean);

        const suggestions = sanitizeSuggestions(lines);
        return {
            reply: 'Try one of these titles. Tap to search instantly.',
            suggestions,
            contextTags: [],
            suggestionItems: [],
        };
    }
}

export async function POST(req: NextRequest) {
    try {
        const body = await req.json();
        const message = sanitizeText(body?.message, 260);
        const history = sanitizeHistory(body?.history).slice(-8);
        const avoid = sanitizeAvoid(body?.avoid);

        if (!message) {
            return NextResponse.json({ reply: 'Tell me your mood, language, or a similar title.', suggestions: [], contextTags: [], suggestionItems: [] });
        }

        const groqKey = process.env.GROQ_API || process.env.GROQ_API_KEY;
        if (!groqKey) {
            const suggestions = fallbackSuggestions(message, avoid);
            const contextTags = inferContextTags(message);
            return NextResponse.json({
                reply: 'Using local picks for now. Tap any title to search.',
                suggestions,
                contextTags,
                suggestionItems: toSuggestionItems(suggestions, message, contextTags),
            });
        }

        const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${groqKey}`,
            },
            body: JSON.stringify({
                model: 'llama-3.1-8b-instant',
                temperature: 0.72,
                top_p: 0.92,
                max_tokens: 320,
                messages: [
                    {
                        role: 'system',
                        content: 'You are a movie and TV recommendation assistant inside a torrent search app. Keep it conversational and context-aware. Return ONLY compact JSON: {"reply":"short natural line","suggestionItems":[{"title":"title1","reason":"short why"}],"contextTags":["tag1","tag2","tag3"]}. CRITICAL: suggestionItems.title must always be exact, real released movie/show titles that can be searched directly. Never output generic phrases like "mind bending sci-fi" as titles. Never repeat avoided titles if alternatives exist. Provide 4-5 suggestionItems whenever possible. Keep reasons under 14 words.',
                    },
                    ...history.map(item => ({
                        role: item.role === 'bot' ? 'assistant' : 'user',
                        content: item.text,
                    })),
                    {
                        role: 'user',
                        content: `Prompt: ${message}\nAvoid titles: ${avoid.join(', ') || 'none'}\nReturn fresh recommendations.`,
                    },
                ],
            }),
        });

        if (!response.ok) {
            const suggestions = fallbackSuggestions(message, avoid);
            const contextTags = inferContextTags(message);
            return NextResponse.json({
                reply: 'I could not reach AI suggestions right now. Try these picks.',
                suggestions,
                contextTags,
                suggestionItems: toSuggestionItems(suggestions, message, contextTags),
            });
        }

        const payload = (await response.json()) as {
            choices?: Array<{ message?: { content?: string } }>;
        };

        const content = payload?.choices?.[0]?.message?.content || '';
        const parsed = parseModelSuggestions(content);
        const contextTags = parsed.contextTags.length > 0 ? parsed.contextTags : inferContextTags(message);
        const candidateTitles = filterAvoided(sanitizeSuggestions(parsed.suggestions), avoid);
        const rawItems = parsed.suggestionItems.length > 0
            ? parsed.suggestionItems.filter(item => candidateTitles.includes(item.title)).slice(0, 5)
            : toSuggestionItems(candidateTitles, message, contextTags);

        const suggestionItems = ensureMinSuggestionItems(rawItems, message, contextTags, avoid, 4);
        const suggestions = suggestionItems.map(item => item.title);

        return NextResponse.json({
            reply: parsed.reply || 'Try one of these titles. Tap to search instantly.',
            suggestions,
            contextTags,
            suggestionItems,
        });
    } catch {
        const contextTags = ['movie picks'];
        const suggestions = fallbackSuggestions('', []);
        return NextResponse.json({
            reply: 'I could not process that request right now. Try one of these picks.',
            suggestions,
            contextTags,
            suggestionItems: toSuggestionItems(suggestions, '', contextTags),
        });
    }
}
