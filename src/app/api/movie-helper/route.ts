import { NextRequest, NextResponse } from 'next/server';

function fallbackSuggestions(prompt: string): string[] {
    const p = (prompt || '').toLowerCase();
    if (/anime|japan|japanese/.test(p)) return ['Your Name', 'A Silent Voice', 'Spirited Away', 'Weathering with You', 'Suzume'];
    if (/korean|thriller|crime/.test(p)) return ['Parasite', 'Memories of Murder', 'Oldboy', 'The Chaser', 'I Saw the Devil'];
    if (/hindi|bollywood|indian/.test(p)) return ['Taare Zameen Par', '3 Idiots', 'Dangal', 'Zindagi Na Milegi Dobara', 'PK'];
    if (/sci|space|mind|time/.test(p)) return ['Interstellar', 'Inception', 'Predestination', 'Arrival', 'The Prestige'];
    if (/feel|happy|romance|light/.test(p)) return ['About Time', 'The Intern', 'La La Land', 'Notting Hill', 'The Holiday'];
    return ['Oppenheimer', 'Interstellar', 'The Dark Knight', 'Parasite', 'Your Name'];
}

function sanitizeSuggestions(raw: unknown): string[] {
    if (!Array.isArray(raw)) return [];
    const seen = new Set<string>();
    const out: string[] = [];

    for (const item of raw) {
        const value = String(item || '').replace(/[\r\n\t]+/g, ' ').replace(/^[-*\d.)\s]+/, '').trim();
        if (!value || value.length > 90) continue;
        const key = value.toLowerCase();
        if (seen.has(key)) continue;
        seen.add(key);
        out.push(value);
        if (out.length >= 5) break;
    }

    return out;
}

function parseModelSuggestions(content: string): { reply: string; suggestions: string[] } {
    const text = (content || '').trim();
    if (!text) {
        return { reply: 'Try one of these titles. Tap to search instantly.', suggestions: [] };
    }

    try {
        const obj = JSON.parse(text) as { reply?: string; suggestions?: string[] };
        const suggestions = sanitizeSuggestions(obj.suggestions || []);
        const reply = String(obj.reply || 'Try one of these titles. Tap to search instantly.').trim();
        return { reply, suggestions };
    } catch {
        const lines = text
            .split('\n')
            .map(line => line.replace(/^[-*\d.)\s]+/, '').trim())
            .filter(Boolean);

        const suggestions = sanitizeSuggestions(lines);
        return {
            reply: 'Try one of these titles. Tap to search instantly.',
            suggestions,
        };
    }
}

export async function POST(req: NextRequest) {
    try {
        const body = await req.json();
        const message = String(body?.message || '').trim();

        if (!message) {
            return NextResponse.json({ reply: 'Tell me your mood, language, or a similar title.', suggestions: [] });
        }

        const groqKey = process.env.GROQ_API;
        if (!groqKey) {
            const suggestions = fallbackSuggestions(message);
            return NextResponse.json({
                reply: 'Using local picks for now. Tap any title to search.',
                suggestions,
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
                temperature: 0.4,
                max_tokens: 220,
                messages: [
                    {
                        role: 'system',
                        content: 'You are a movie and TV title assistant for torrent search. Return concise titles users can search directly. Respond ONLY as JSON: {"reply":"short helpful line","suggestions":["title1","title2","title3","title4","title5"]}. Suggestions must be exact or commonly known title names, max 5 items.',
                    },
                    {
                        role: 'user',
                        content: message,
                    },
                ],
            }),
        });

        if (!response.ok) {
            const suggestions = fallbackSuggestions(message);
            return NextResponse.json({
                reply: 'I could not reach AI suggestions right now. Try these picks.',
                suggestions,
            });
        }

        const payload = (await response.json()) as {
            choices?: Array<{ message?: { content?: string } }>;
        };

        const content = payload?.choices?.[0]?.message?.content || '';
        const parsed = parseModelSuggestions(content);
        const suggestions = parsed.suggestions.length > 0 ? parsed.suggestions : fallbackSuggestions(message);

        return NextResponse.json({
            reply: parsed.reply || 'Try one of these titles. Tap to search instantly.',
            suggestions,
        });
    } catch {
        return NextResponse.json({
            reply: 'I could not process that request right now. Try one of these picks.',
            suggestions: fallbackSuggestions(''),
        });
    }
}
