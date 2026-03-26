import { build } from 'esbuild';
import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';

async function buildEngine() {
    console.log('🚀 Starting Vortex Engine Build...');

    // 1. Get Firebase Credentials
    let firebaseCredsB64 = '';
    const credPath = 'vortex-firebase-adminsdk.json';
    
    if (fs.existsSync(credPath)) {
        console.log('📦 Found Firebase Credentials, embedding in binary...');
        const creds = fs.readFileSync(credPath, 'utf-8');
        firebaseCredsB64 = Buffer.from(creds).toString('base64');
    } else {
        console.warn('⚠️ No vortex-firebase-adminsdk.json found. Engine will run in local-only mode.');
    }

    // 2. Bundle server.mjs using esbuild
    console.log('🏗️ Bundling server.mjs...');
    await build({
        entryPoints: ['server.mjs'],
        bundle: true,
        platform: 'node',
        format: 'esm',
        outfile: 'dist/server-bundled.mjs',
        minify: true,
        external: ['webtorrent', 'firebase-admin'], // native or complex modules often work better as external if pkg handles them
        // In this case, we'll try to bundle MOST things but keep peer-dependencies external if they cause issues
        // Actually, for a standalone EXE, we want to bundle as much as possible.
        // Let's use the 'define' to inject our credentials
        define: {
            'process.env.__FIREBASE_CREDS_B64__': JSON.stringify(firebaseCredsB64)
        },
        banner: {
            js: `// Vortex Engine Bundled Code`
        }
    });

    // 3. Create public/downloads folder if it doesn't exist
    if (!fs.existsSync('public/downloads')) fs.mkdirSync('public/downloads', { recursive: true });

    // 4. Run pkg
    console.log('📦 Packaging into standalone EXE...');
    try {
        // We use @yao-pkg/pkg via npx for the best compatibility with modern node
        execSync('npx pkg dist/server-bundled.mjs --target node18-win-x64 --output public/downloads/vortex.exe --public', { stdio: 'inherit' });
        console.log('✅ Success! Vortex Engine built at: public/downloads/vortex.exe');
    } catch (err) {
        console.error('❌ Build failed during packaging:', err.message);
        process.exit(1);
    }
}

buildEngine();
