"use client";

import { AnimatePresence, motion } from "motion/react";
import { Activity, ChevronDown, TriangleAlert } from "lucide-react";
import { useMemo } from "react";
import type { RunSummary } from "@/lib/types";
import { cn } from "@/lib/utils";

function relativeTime(iso?: string) {
  if (!iso) return null;
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return null;
  const minutes = Math.max(0, Math.round((Date.now() - then) / 60000));
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.round(hours / 24)}d ago`;
}

function humanizeReason(key: string) {
  return key.replace(/_/g, " ").replace(/^\w/, (c) => c.toUpperCase());
}

function Stage({
  label,
  value,
  tone = "default",
}: {
  label: string;
  value: number;
  tone?: "default" | "accent";
}) {
  return (
    <div className="flex items-baseline gap-1.5 whitespace-nowrap">
      <span
        className={cn(
          "font-display text-sm font-bold tabular-nums",
          tone === "accent" ? "text-careers" : "text-slate-200",
        )}
      >
        {value.toLocaleString()}
      </span>
      <span className="text-xs text-slate-400">{label}</span>
    </div>
  );
}

/**
 * The pipeline funnel, in the product rather than only on the marketing page.
 * Everything here already existed in the run summary the pipeline writes; it
 * had simply never been surfaced, so the dashboard gave no sign of the ~90%
 * of postings the deterministic pre-filter threw away before any model call.
 */
export function RunSummaryBar({
  summary,
  loading,
  expanded,
  onToggle,
}: {
  summary: RunSummary | null;
  loading: boolean;
  expanded: boolean;
  onToggle: () => void;
}) {
  const drops = useMemo(() => {
    const entries = Object.entries(summary?.filtered_out ?? {}).filter(([, n]) => n > 0);
    return entries.sort((a, b) => b[1] - a[1]);
  }, [summary]);

  const droppedTotal = drops.reduce((sum, [, n]) => sum + n, 0);
  const sourceErrors = Object.entries(summary?.source_errors ?? {});

  if (loading) {
    return (
      <div className="mt-6 h-12 animate-pulse rounded-surface border border-line bg-surface-1" />
    );
  }

  // No run yet is a normal first-use state, not an error worth a red box.
  if (!summary || summary.fetched === undefined) return null;

  const fetched = summary.fetched ?? 0;
  const unseen = summary.unseen ?? 0;
  const admitted = summary.relevant_after_prefilter ?? 0;
  const evaluated = summary.taken_this_run ?? 0;
  const ranAt = relativeTime(summary.recorded_at);
  const dropRate = fetched > 0 ? Math.round((droppedTotal / fetched) * 100) : 0;

  return (
    <section
      aria-label="Latest pipeline run"
      className="mt-6 overflow-hidden rounded-surface border border-line bg-surface-1"
    >
      <div className="flex flex-wrap items-center gap-x-4 gap-y-3 px-4 py-3">
        <span className="flex items-center gap-2 whitespace-nowrap">
          <span className="relative flex size-2" aria-hidden>
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-careers opacity-60" />
            <span className="relative inline-flex size-2 rounded-full bg-careers" />
          </span>
          <span className="font-mono text-xs font-semibold uppercase tracking-wider text-careers">
            Last run {ranAt ?? "—"}
          </span>
        </span>

        <div className="flex flex-wrap items-center gap-x-3 gap-y-2 text-slate-500">
          <Stage label="fetched" value={fetched} />
          <span aria-hidden>→</span>
          <Stage label="new" value={unseen} />
          <span aria-hidden>→</span>
          <Stage label="passed pre-filter" value={admitted} />
          <span aria-hidden>→</span>
          <Stage label="evaluated by Gemini" value={evaluated} tone="accent" />
        </div>

        <div className="flex w-full flex-wrap items-center gap-x-3 gap-y-2 sm:ml-auto sm:w-auto sm:flex-nowrap sm:justify-end">
          {summary.cost_usd !== undefined && (
            <span className="whitespace-nowrap rounded-control border border-line bg-white/[0.03] px-2 py-1 font-mono text-xs text-slate-300">
              ${summary.cost_usd.toFixed(4)}
              <span className="text-slate-500"> / run</span>
            </span>
          )}
          {sourceErrors.length > 0 && (
            <span className="flex items-center gap-1 whitespace-nowrap text-xs text-amber-400">
              <TriangleAlert className="size-3.5" aria-hidden />
              {sourceErrors.length} source {sourceErrors.length === 1 ? "error" : "errors"}
            </span>
          )}
          <button
            type="button"
            onClick={onToggle}
            aria-expanded={expanded}
            className="flex shrink-0 items-center gap-1.5 rounded-control px-2 py-1 text-xs font-medium text-slate-400 transition hover:bg-white/5 hover:text-white"
          >
            <Activity className="size-3.5 shrink-0" aria-hidden />
            <span className="whitespace-nowrap">
              {droppedTotal.toLocaleString()} dropped{dropRate ? ` (${dropRate}%)` : ""}
            </span>
            <ChevronDown
              className={cn("size-3.5 transition-transform", expanded && "rotate-180")}
              aria-hidden
            />
          </button>
        </div>
      </div>

      <AnimatePresence initial={false}>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
            className="overflow-hidden"
          >
            <div className="grid gap-6 border-t border-line bg-surface-sunken px-4 py-4 sm:grid-cols-2">
              <div>
                <h3 className="font-mono text-xs font-semibold uppercase tracking-wider text-slate-400">
                  Dropped before any model call
                </h3>
                {drops.length === 0 ? (
                  <p className="mt-2 text-xs text-slate-500">
                    Nothing was dropped by the pre-filter on this run.
                  </p>
                ) : (
                  <ul className="mt-2.5 space-y-2">
                    {drops.map(([reason, count]) => (
                      <li key={reason} className="text-xs">
                        <div className="flex items-baseline justify-between gap-3">
                          <span className="text-slate-300">{humanizeReason(reason)}</span>
                          <span className="font-mono tabular-nums text-slate-400">{count}</span>
                        </div>
                        <div className="mt-1 h-1 overflow-hidden rounded-full bg-white/5">
                          <div
                            className="h-full rounded-full bg-rose-500/50"
                            style={{
                              width: `${droppedTotal ? (count / droppedTotal) * 100 : 0}%`,
                            }}
                          />
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              <div className="space-y-4">
                {summary.selected_by_source && Object.keys(summary.selected_by_source).length > 0 && (
                  <div>
                    <h3 className="font-mono text-xs font-semibold uppercase tracking-wider text-slate-400">
                      Evaluated by source
                    </h3>
                    <div className="mt-2.5 flex flex-wrap gap-1.5">
                      {Object.entries(summary.selected_by_source).map(([source, count]) => (
                        <span
                          key={source}
                          className="rounded-control border border-line bg-white/[0.03] px-2 py-1 text-xs text-slate-300"
                        >
                          {source}{" "}
                          <span className="font-mono tabular-nums text-slate-500">{count}</span>
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                {sourceErrors.length > 0 && (
                  <div>
                    <h3 className="font-mono text-xs font-semibold uppercase tracking-wider text-amber-400">
                      Source errors
                    </h3>
                    <ul className="mt-2 space-y-1 text-xs text-slate-400">
                      {sourceErrors.map(([source, message]) => (
                        <li key={source}>
                          <span className="text-slate-300">{source}:</span> {message}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {summary.models?.evaluator && (
                  <p className="font-mono text-xs text-slate-500">
                    evaluator: {summary.models.evaluator}
                    {summary.models.drafter ? ` · drafter: ${summary.models.drafter}` : ""}
                    {summary.tokens ? ` · ${summary.tokens.toLocaleString()} tokens` : ""}
                  </p>
                )}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </section>
  );
}
