import { NextRequest, NextResponse } from 'next/server';
import { adminAuth, adminDb } from '@/lib/firebase-admin';

type LeaderboardRow = {
    rank: number;
    uid: string;
    displayName: string;
    downloaded: number;
    seeded: number;
    ratio: number;
};

function toNonNegative(value: unknown) {
    const n = Number(value);
    return Number.isFinite(n) && n >= 0 ? n : 0;
}

function maskUid(uid: string) {
    if (!uid) return 'Unknown';
    if (uid.length <= 10) return uid;
    return `${uid.slice(0, 4)}...${uid.slice(-4)}`;
}

function normalizeDisplayName(name: string) {
    if (!name) return 'Unknown';
    if (name.trim().toLowerCase() === 'megha roy') return 'Winter';
    return name;
}

export async function GET(req: NextRequest) {
    try {
        const authHeader = req.headers.get('authorization') || '';
        if (!authHeader.startsWith('Bearer ')) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const token = authHeader.slice('Bearer '.length);
        await adminAuth.verifyIdToken(token);

        const limitParam = Number(req.nextUrl.searchParams.get('limit') || '25');
        const limit = Number.isFinite(limitParam) ? Math.min(Math.max(limitParam, 5), 100) : 25;

        // Use an index-free query path to avoid FAILED_PRECONDITION on projects
        // where composite indexes for collectionGroup ordering are not created yet.
        const statsSnapshot = await adminDb
            .collectionGroup('config')
            .get();

        const baseRows = statsSnapshot.docs
            .filter((doc) => doc.id === 'stats')
            .map((doc) => {
                const uid = doc.ref.parent?.parent?.id || '';
                const data = doc.data() || {};
                const downloaded = toNonNegative(data.downloaded);
                const seeded = toNonNegative(data.seeded);
                const ratio = downloaded > 0 ? seeded / downloaded : 0;
                return { uid, downloaded, seeded, ratio };
            })
            .filter((row) => !!row.uid)
            .sort((a, b) => b.seeded - a.seeded)
            .slice(0, limit);

        const uidToName = new Map<string, string>();
        await Promise.all(
            baseRows.map(async (row) => {
                try {
                    const user = await adminAuth.getUser(row.uid);
                    const rawName = user.displayName || user.email || maskUid(row.uid);
                    uidToName.set(row.uid, normalizeDisplayName(rawName));
                } catch {
                    uidToName.set(row.uid, normalizeDisplayName(maskUid(row.uid)));
                }
            })
        );

        const rows: LeaderboardRow[] = baseRows.map((row, idx) => ({
            rank: idx + 1,
            uid: row.uid,
            displayName: normalizeDisplayName(uidToName.get(row.uid) || maskUid(row.uid)),
            downloaded: row.downloaded,
            seeded: row.seeded,
            ratio: row.ratio,
        }));

        return NextResponse.json({ rows, generatedAt: Date.now() });
    } catch (err: any) {
        return NextResponse.json({ error: err?.message || 'Failed to load leaderboard' }, { status: 500 });
    }
}
