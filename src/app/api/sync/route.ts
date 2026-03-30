import { NextRequest, NextResponse } from 'next/server';
import { adminAuth, adminDb } from '@/lib/firebase-admin';

type SyncType = 'settings' | 'stats' | 'torrents' | 'delete_torrent';

function cleanString(value: unknown, maxLen: number) {
  if (value === undefined || value === null) return '';
  return String(value).replace(/[\r\n\t]+/g, ' ').trim().slice(0, maxLen);
}

function toNonNegativeNumber(value: unknown, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) && n >= 0 ? n : fallback;
}

function normalizeSettingsPayload(raw: any) {
  const safe = raw || {};
  return {
    downloadPath: cleanString(safe.downloadPath, 512),
    globalDownloadLimit: toNonNegativeNumber(safe.globalDownloadLimit, 0),
    globalUploadLimit: toNonNegativeNumber(safe.globalUploadLimit, 0),
    opensubtitlesApiKey: cleanString(safe.opensubtitlesApiKey, 256),
    tmdbApiKey: cleanString(safe.tmdbApiKey, 128),
    autoSubtitle: !!safe.autoSubtitle,
    subtitleLang: cleanString(safe.subtitleLang, 16) || 'en',
  };
}

export async function POST(req: NextRequest) {
  try {
    const { token, type, data } = await req.json();
    const syncType = String(type || '') as SyncType;

    if (!token) {
      return NextResponse.json({ error: 'Missing token' }, { status: 401 });
    }

    // Verify the user's ID token
    let decodedToken;
    try {
      decodedToken = await adminAuth.verifyIdToken(token);
    } catch (err: any) {
      return NextResponse.json({ error: 'Invalid token: ' + err.message }, { status: 401 });
    }

    const userId = decodedToken.uid;
    const userRef = adminDb.collection('users').doc(userId);

    // Ensure parent user document exists so Firestore console and security logic are consistent.
    await userRef.set({
      uid: userId,
      updatedAt: new Date().toISOString(),
    }, { merge: true });

    if (syncType === 'settings') {
      const normalized = normalizeSettingsPayload(data);
      if (!normalized.downloadPath) {
        return NextResponse.json({ error: 'Invalid settings payload: downloadPath is required' }, { status: 400 });
      }
      await userRef.collection('config').doc('settings').set(normalized);
      console.log(`[Sync] Settings updated for user: ${userId}`);
    } else if (syncType === 'stats') {
      const normalized = {
        downloaded: toNonNegativeNumber(data?.downloaded, 0),
        seeded: toNonNegativeNumber(data?.seeded, 0),
      };
      await userRef.collection('config').doc('stats').set(normalized);
      console.log(`[Sync] Stats updated for user: ${userId}`);
    } else if (syncType === 'torrents') {
      if (!Array.isArray(data)) {
        return NextResponse.json({ error: 'Data must be an array for torrents' }, { status: 400 });
      }

      const batch = adminDb.batch();
      const torrentsRef = userRef.collection('torrents');

      // Basic implementation for batch update
      data.forEach((item: any) => {
        if (!item.infoHash) return;
        const docRef = torrentsRef.doc(String(item.infoHash));
        batch.set(docRef, item);
      });

      await batch.commit();
      console.log(`[Sync] ${data.length} torrents updated for user: ${userId}`);
    } else if (syncType === 'delete_torrent') {
      if (!data?.infoHash) {
        return NextResponse.json({ error: 'Missing infoHash' }, { status: 400 });
      }
      await userRef.collection('torrents').doc(String(data.infoHash)).delete();
      console.log(`[Sync] Torrent deleted for user: ${userId}, hash: ${data.infoHash}`);
    } else {
      return NextResponse.json({ error: 'Invalid sync type' }, { status: 400 });
    }

    return NextResponse.json({ success: true });
  } catch (err: any) {
    console.error('[Sync API Error]', err.message);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

// Optional: GET to retrieve data (for engine initialization)
export async function GET(req: NextRequest) {
  try {
    const token = req.nextUrl.searchParams.get('token');
    const type = req.nextUrl.searchParams.get('type');

    if (!token) return NextResponse.json({ error: 'Missing token' }, { status: 401 });

    const decodedToken = await adminAuth.verifyIdToken(token);
    const userId = decodedToken.uid;
    const userRef = adminDb.collection('users').doc(userId);

    // Ensure parent user document exists on first read paths as well.
    await userRef.set({
      uid: userId,
      updatedAt: new Date().toISOString(),
    }, { merge: true });

    if (type === 'settings') {
      const doc = await userRef.collection('config').doc('settings').get();
      return NextResponse.json(doc.exists ? doc.data() : null);
    } else if (type === 'torrents') {
      const snapshot = await userRef.collection('torrents').get();
      const list = snapshot.docs.map(doc => doc.data());
      return NextResponse.json(list);
    }

    return NextResponse.json({ error: 'Invalid type' }, { status: 400 });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
