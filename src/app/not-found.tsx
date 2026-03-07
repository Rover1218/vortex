import Link from 'next/link';

export default function NotFound() {
    return (
        <div className="flex flex-col items-center justify-center min-h-[60vh] text-center space-y-6">
            <div className="relative">
                <h1 className="text-9xl font-black text-white/5 tracking-tighter select-none">404</h1>
                <div className="absolute inset-0 flex items-center justify-center">
                    <span className="text-6xl">🛸</span>
                </div>
            </div>

            <div className="space-y-2">
                <h2 className="text-3xl font-bold text-text-1">Signal Lost</h2>
                <p className="text-text-2 max-w-md mx-auto">
                    The page you're looking for has drifted into deep space or never existed in this sector.
                </p>
            </div>

            <Link
                href="/"
                className="bg-accent text-white px-8 py-3 rounded-xl font-bold hover:brightness-110 hover:scale-105 active:scale-95 transition-all shadow-lg shadow-accent/20"
            >
                Return to Dashboard
            </Link>

            <div className="pt-8 grid grid-cols-2 gap-4 text-xs font-mono text-text-3">
                <div className="bg-white/5 p-4 rounded-xl border border-white/5">
                    <p className="mb-1 text-accent uppercase">Error Code</p>
                    <p>ERR_SECTOR_NOT_FOUND</p>
                </div>
                <div className="bg-white/5 p-4 rounded-xl border border-white/5">
                    <p className="mb-1 text-teal uppercase">Coordinates</p>
                    <p>NULL_SPACE_X04</p>
                </div>
            </div>
        </div>
    );
}
