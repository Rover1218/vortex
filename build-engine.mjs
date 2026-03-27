import path from 'path';
import fs from 'fs';
import { execSync } from 'child_process';
import * as esbuild from 'esbuild';

const DATA_DIR = path.join(process.cwd());
const SERVICE_ACCOUNT_PATH = path.join(DATA_DIR, 'vortex-firebase-adminsdk.json');
const OUTPUT_DIR = path.join(process.cwd(), '.engine-build');
const BUNDLE_FILE = path.join(OUTPUT_DIR, 'vortex-bundled.cjs');

async function build() {
    console.log('🚀 Starting Vortex Engine Build Process...');

    if (!fs.existsSync(OUTPUT_DIR)) fs.mkdirSync(OUTPUT_DIR, { recursive: true });

    // 1. Firebase Credentials are now handled by the Vercel Proxy (src/app/api/sync/route.ts)
    // No longer embedding service accounts in the client binary for security.
    console.log('🛡️ Security: Skipping Firebase credential embedding (Proxy mode active).');

    // 2. Bundle with esbuild (bundle MOST things, externalize only native/problematic ones)
    console.log('📦 Bundling server.mjs...');
    await esbuild.build({
        entryPoints: ['server.mjs'],
        bundle: true,
        platform: 'node',
        target: 'node18',
        outfile: BUNDLE_FILE,
        format: 'cjs',
        external: ['fsevents', 'node-gyp-build'],
        define: {
            'process.env.VORTEX_PROD': 'true',
        },
        minify: true,
        sourcemap: false,
    });

    // 3. Packaging with @yao-pkg/pkg
    console.log('🔨 Packaging with @yao-pkg/pkg...');
    const target = 'node18-win-x64';
    const finalExe = 'vortex.exe';
    // Quote the bundle path and the output path to handle spaces
    const pkgCommand = `npx @yao-pkg/pkg "${BUNDLE_FILE}" --target ${target} --output "public/downloads/${finalExe}"`;

    try {
        console.log(`Running: ${pkgCommand}`);
        execSync(pkgCommand, { stdio: 'inherit' });
        console.log(`\n✅ Vortex Engine Build Complete: public/downloads/${finalExe}\n`);
    } catch (err) {
        console.error('❌ Pkg failed:', err.message);
    }
}

build().catch(err => {
    console.error('❌ Build failed:', err);
    process.exit(1);
});
