"use client";

/**
 * The one loading state for the whole app. /jobs and /freelance each had their
 * own copy painted in an old light-theme palette (#f5f7f7 on #53635e), which
 * flashed white over a black app on every load — and neither spinner actually
 * spun: the ring was rendered without `animate-spin`.
 */
export function LoadingScreen({ label }: { label: string }) {
  return (
    <main className="grid min-h-dvh place-items-center bg-surface-0" aria-busy="true">
      <div className="flex items-center gap-3 font-mono text-sm text-slate-400" role="status">
        <span
          className="size-4 animate-spin rounded-full border-2 border-emerald-500/30 border-t-emerald-400"
          aria-hidden
        />
        <span>{label}</span>
      </div>
    </main>
  );
}
