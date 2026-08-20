"use client";

import {
  Building2,
  Check,
  CheckCircle2,
  ChevronDown,
  CircleAlert,
  ExternalLink,
  FileText,
  Inbox,
  Info,
  Keyboard,
  MapPin,
  MessageSquareText,
  Plus,
  Search,
  SlidersHorizontal,
  Sparkles,
  TriangleAlert,
  X,
  Zap,
} from "lucide-react";
import Link from "next/link";
import {
  FormEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { motion, AnimatePresence } from "motion/react";
import { AppHeader } from "@/components/app-header";
import { useAuth } from "@/components/auth-provider";
import { RunSummaryBar } from "@/components/run-summary-bar";
import { Modal } from "@/components/ui/modal";
import { useToast } from "@/components/ui/toast";
import type { Job, JobsResponse, JobStatus, RunSummary } from "@/lib/types";
import { cn } from "@/lib/utils";

type SortOption = "newest" | "position" | "location" | "match";
type Strength = NonNullable<Job["match_strength"]>;
type JobBuckets = Record<JobStatus, Job[]>;

const ALL_STATUSES: JobStatus[] = ["matched", "applied", "skipped"];

const matchRank: Record<Strength, number> = {
  strong: 0,
  medium: 1,
  weak: 2,
  unscored: 3,
};

const tabs: { value: JobStatus; label: string; icon: typeof Inbox }[] = [
  { value: "matched", label: "To Apply", icon: Inbox },
  { value: "applied", label: "Applied", icon: CheckCircle2 },
  { value: "skipped", label: "Skipped / Unmet", icon: X },
];

const emptyBuckets: JobBuckets = { matched: [], applied: [], skipped: [] };

async function responseError(response: Response) {
  try {
    const body = (await response.json()) as { error?: string };
    return body.error || `Request failed with status ${response.status}.`;
  } catch {
    return `Request failed with status ${response.status}.`;
  }
}

function formatDate(value?: string) {
  if (!value) return "Recently evaluated";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Recently evaluated";
  return new Intl.DateTimeFormat("en", { month: "short", day: "numeric" }).format(date);
}

function sourceName(source?: string) {
  if (!source) return "Direct ATS";
  return source.charAt(0).toUpperCase() + source.slice(1);
}

function jobTimestamp(job: Job) {
  const value = job.posted_at || job.materials_created_at || job.evaluated_at;
  const timestamp = value ? new Date(value).getTime() : 0;
  return Number.isNaN(timestamp) ? 0 : timestamp;
}

function sortJobs(jobs: Job[], sort: SortOption) {
  return [...jobs].sort((left, right) => {
    if (sort === "position") return (left.title || "").localeCompare(right.title || "");
    if (sort === "location")
      return (left.location || "Unspecified").localeCompare(right.location || "Unspecified");
    if (sort === "match") {
      const strength =
        matchRank[left.match_strength || "unscored"] - matchRank[right.match_strength || "unscored"];
      return strength || jobTimestamp(right) - jobTimestamp(left);
    }
    return jobTimestamp(right) - jobTimestamp(left);
  });
}

type Requester = (path: string, init?: RequestInit) => Promise<Response>;

/**
 * Loads all three tabs at once.
 *
 * The old version fetched only the visible tab and wrote only that tab's
 * count, so Applied and Skipped both showed a hard-coded 0 until you clicked
 * them — the counters were simply wrong on arrival. Holding all three also
 * makes tab switching instant and gives a status change something to undo
 * back into.
 */
async function loadJobBuckets(request: Requester): Promise<JobBuckets> {
  const responses = await Promise.all(
    ALL_STATUSES.map(async (status) => {
      const res = await request(`/api/jobs?status=${status}`);
      if (!res.ok) throw new Error(await responseError(res));
      return (await res.json()) as JobsResponse;
    }),
  );
  return {
    matched: responses[0].jobs || [],
    applied: responses[1].jobs || [],
    skipped: responses[2].jobs || [],
  };
}

async function loadRunSummary(request: Requester): Promise<RunSummary | null> {
  try {
    const res = await request("/api/run-summary");
    // A deployment without this endpoint yet should cost the user nothing —
    // the telemetry strip simply does not render.
    return res.ok ? ((await res.json()) as RunSummary) : null;
  } catch {
    return null;
  }
}

// ── Company monogram avatar ────────────────────────────────────────────────────
function CompanyAvatar({
  company,
  strength,
  large,
}: {
  company?: string;
  strength?: string;
  large?: boolean;
}) {
  const initials = company
    ? company
        .split(" ")
        .slice(0, 2)
        .map((w) => w[0])
        .join("")
        .toUpperCase()
    : "?";

  const colorMap: Record<string, string> = {
    strong: "bg-emerald-950/60 border-emerald-500/30 text-emerald-400",
    medium: "bg-amber-950/60 border-amber-500/25 text-amber-400",
    weak: "bg-slate-800/60 border-line-strong text-slate-400",
  };

  return (
    <div
      aria-hidden
      className={cn(
        "grid shrink-0 place-items-center rounded-control border font-display font-bold",
        large ? "size-11 text-base" : "size-9 text-sm",
        colorMap[strength || "weak"] || colorMap.weak,
      )}
    >
      {initials}
    </div>
  );
}

// ── Match badge config ─────────────────────────────────────────────────────────
type MatchConfig = {
  label: string;
  dot: string;
  pill: string;
  accent: string;
  bar: string;
  /** Fraction of the fit meter to fill. */
  fill: number;
};

function matchConfig(job: Job): MatchConfig {
  if (job.status === "skipped")
    return {
      label: "Unmet Criteria",
      dot: "bg-rose-400",
      pill: "border-rose-500/25 bg-rose-950/40 text-rose-300",
      accent: "from-rose-500/60 via-rose-500/20 to-transparent",
      bar: "bg-rose-500/40",
      fill: 0.15,
    };
  if (job.status === "applied")
    return {
      label: "Application Sent",
      dot: "bg-slate-400",
      pill: "border-slate-500/25 bg-slate-800/40 text-slate-300",
      accent: "from-slate-500/40 via-slate-500/10 to-transparent",
      bar: "bg-slate-500/40",
      fill: 1,
    };
  if (job.match_strength === "strong")
    return {
      label: "Strong Fit",
      dot: "bg-emerald-400",
      pill: "border-emerald-500/30 bg-emerald-950/50 text-emerald-300",
      accent: "from-emerald-500/50 via-emerald-500/15 to-transparent",
      bar: "bg-careers",
      fill: 1,
    };
  if (job.match_strength === "medium")
    return {
      label: "Medium Fit",
      dot: "bg-amber-400",
      pill: "border-amber-500/30 bg-amber-950/40 text-amber-300",
      accent: "from-amber-500/40 via-amber-500/10 to-transparent",
      bar: "bg-studio",
      fill: 0.62,
    };
  return {
    label: "Low Fit",
    dot: "bg-slate-500",
    pill: "border-slate-600/30 bg-slate-900/40 text-slate-400",
    accent: "from-slate-600/20 via-transparent to-transparent",
    bar: "bg-slate-600/50",
    fill: 0.3,
  };
}

// ── Card skeleton ──────────────────────────────────────────────────────────────
function CardSkeleton() {
  return (
    <div className="animate-pulse rounded-surface border border-line bg-surface-1 p-5">
      <div className="flex items-start gap-4">
        <div className="size-10 rounded-control bg-white/5" />
        <div className="flex-1 space-y-2.5">
          <div className="flex gap-2">
            <div className="h-5 w-20 rounded-full bg-white/5" />
            <div className="h-5 w-16 rounded-full bg-white/5" />
          </div>
          <div className="h-5 w-64 rounded-control bg-white/[0.07]" />
          <div className="h-3.5 w-40 rounded-control bg-white/5" />
        </div>
        <div className="hidden gap-2 sm:flex">
          <div className="h-8 w-32 rounded-control bg-white/5" />
          <div className="h-8 w-24 rounded-control bg-white/5" />
        </div>
      </div>
    </div>
  );
}

// ── Job Card ───────────────────────────────────────────────────────────────────
function JobCard({
  job,
  activeTab,
  isExpanded,
  isFocused,
  onToggleExpand,
  onFocus,
  onUpdateStatus,
}: {
  job: Job;
  activeTab: JobStatus;
  isExpanded: boolean;
  isFocused: boolean;
  onToggleExpand: () => void;
  onFocus: () => void;
  onUpdateStatus: (job: Job, status: JobStatus) => void;
}) {
  const cfg = matchConfig(job);
  // Density follows conviction. A strong fit is the thing the user came for,
  // so it gets the room; a low-fit posting stays out of the way until asked
  // for. Previously every card was identical regardless of verdict.
  const prominent = activeTab === "matched" && job.match_strength === "strong";
  const label = `${job.title} at ${job.company || "employer"}`;

  return (
    <motion.article
      layout
      onMouseDown={onFocus}
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -8, scale: 0.98 }}
      transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
      aria-label={label}
      className={cn(
        "group relative overflow-hidden rounded-surface border bg-surface-1 transition-colors",
        isFocused ? "border-careers/40 ring-1 ring-careers/25" : "border-line hover:border-line-strong",
      )}
    >
      <div className={cn("absolute left-0 top-0 h-full w-[3px] bg-gradient-to-b", cfg.accent)} aria-hidden />

      <div className={cn("pl-4 pr-4 sm:pr-5", prominent ? "pb-4 pt-5" : "pb-3 pt-4")}>
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
          <div className="flex min-w-0 flex-1 items-start gap-3.5">
            <CompanyAvatar
              company={job.company}
              strength={
                job.status === "matched" ? job.match_strength : job.status === "applied" ? "strong" : "weak"
              }
              large={prominent}
            />

            <div className="min-w-0 flex-1 space-y-1.5">
              <div className="flex flex-wrap items-center gap-1.5">
                <span
                  className={cn(
                    "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-semibold",
                    cfg.pill,
                  )}
                >
                  <span className={cn("size-1.5 rounded-full", cfg.dot)} aria-hidden />
                  {cfg.label}
                </span>
                <span className="rounded-control border border-line bg-white/[0.04] px-1.5 py-0.5 font-mono text-xs text-slate-400">
                  {sourceName(job.source)}
                </span>
                {job.remote && (
                  <span className="rounded-control border border-teal-500/20 bg-teal-950/20 px-1.5 py-0.5 text-xs text-teal-400">
                    Remote
                  </span>
                )}
                <span className="text-xs text-slate-500">
                  {formatDate(job.posted_at || job.evaluated_at)}
                </span>
              </div>

              <h3
                className={cn(
                  "font-display font-bold leading-snug text-white",
                  prominent ? "text-xl" : "text-base",
                )}
              >
                {job.title}
              </h3>

              <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
                <span className="font-semibold text-slate-300">{job.company || "Employer"}</span>
                {job.location && (
                  <span className="flex items-center gap-1 text-slate-400">
                    <MapPin className="size-3.5" aria-hidden />
                    {job.location}
                  </span>
                )}
              </div>

              {/* The fit meter. matchConfig has always defined a bar colour for
                  every verdict; nothing ever drew it. */}
              <div className="flex items-center gap-2 pt-1">
                <div
                  className="h-1 w-24 overflow-hidden rounded-full bg-white/[0.07]"
                  role="img"
                  aria-label={`${cfg.label}: ${Math.round(cfg.fill * 100)} percent`}
                >
                  <div
                    className={cn("h-full rounded-full", cfg.bar)}
                    style={{ width: `${cfg.fill * 100}%` }}
                  />
                </div>
              </div>
            </div>
          </div>

          <div className="flex shrink-0 flex-wrap items-center gap-2">
            {job.url && (
              <a
                href={job.url}
                target="_blank"
                rel="noreferrer"
                aria-label={`Open the original posting for ${label} in a new tab`}
                title="Open original ATS posting"
                className="grid size-8 place-items-center rounded-control border border-line bg-white/[0.03] text-slate-400 transition hover:bg-white/[0.08] hover:text-slate-100"
              >
                <ExternalLink className="size-3.5" aria-hidden />
              </a>
            )}

            {activeTab !== "skipped" && (
              <Link
                href={`/materials?job_id=${encodeURIComponent(job.job_id)}`}
                aria-label={`Review tailored materials for ${label}`}
                className="flex items-center gap-1.5 rounded-control bg-careers px-3 py-2 text-xs font-semibold text-surface-0 shadow-[0_0_12px_rgba(16,185,129,0.25)] transition hover:bg-careers-bright hover:shadow-[0_0_20px_rgba(16,185,129,0.4)] active:scale-[0.98]"
              >
                <FileText className="size-3.5" aria-hidden />
                <span>Review Materials</span>
              </Link>
            )}

            {activeTab === "matched" && (
              <button
                onClick={() => onUpdateStatus(job, "applied")}
                aria-label={`Mark ${label} as applied`}
                className="flex items-center gap-1 rounded-control border border-line bg-white/[0.03] px-3 py-2 text-xs font-medium text-slate-300 transition hover:border-emerald-500/25 hover:bg-emerald-950/30 hover:text-emerald-300"
              >
                <Check className="size-3.5" aria-hidden />
                <span>Mark Applied</span>
              </button>
            )}

            {activeTab !== "matched" && (
              <button
                onClick={() => onUpdateStatus(job, "matched")}
                aria-label={`Move ${label} back to the To Apply inbox`}
                className="rounded-control border border-line bg-white/[0.03] px-3 py-2 text-xs font-medium text-slate-300 transition hover:bg-white/[0.08] hover:text-white"
              >
                Move to Inbox
              </button>
            )}

            {activeTab !== "skipped" && (
              <button
                onClick={() => onUpdateStatus(job, "skipped")}
                aria-label={`Skip ${label}`}
                title="Skip this opportunity"
                className="grid size-8 place-items-center rounded-control text-slate-500 transition hover:bg-rose-500/10 hover:text-rose-400"
              >
                <X className="size-4" aria-hidden />
              </button>
            )}
          </div>
        </div>

        <div className="mt-3 border-t border-line pt-2.5">
          <button
            type="button"
            onClick={onToggleExpand}
            aria-expanded={isExpanded}
            className="flex items-center gap-1.5 text-xs font-medium text-slate-400 transition hover:text-slate-200"
          >
            <MessageSquareText className="size-3.5" aria-hidden />
            <span>{isExpanded ? "Hide Gemini fit analysis" : "View Gemini 3-state fit reasoning"}</span>
            <ChevronDown
              className={cn("size-3.5 transition-transform duration-200", isExpanded && "rotate-180")}
              aria-hidden
            />
          </button>
        </div>
      </div>

      <AnimatePresence initial={false}>
        {isExpanded && (
          <motion.div
            key="reasoning"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
            className="overflow-hidden"
          >
            <div className="space-y-4 border-t border-line bg-surface-sunken px-5 py-4 text-sm leading-relaxed">
              {job.reasoning && (
                <div className="flex gap-3">
                  <Zap className="mt-0.5 size-4 shrink-0 text-careers" aria-hidden />
                  <div>
                    <span className="block text-xs font-semibold uppercase tracking-wider text-slate-300">
                      Why it matches
                    </span>
                    <p className="mt-1 text-slate-400">{job.reasoning}</p>
                  </div>
                </div>
              )}

              {job.unmet_requirements && job.unmet_requirements.length > 0 && (
                <div className="flex gap-3">
                  <TriangleAlert className="mt-0.5 size-4 shrink-0 text-rose-400" aria-hidden />
                  <div>
                    <span className="block text-xs font-semibold uppercase tracking-wider text-rose-400">
                      Unmet requirements
                    </span>
                    <ul className="mt-1.5 space-y-1 text-rose-300/80">
                      {job.unmet_requirements.map((req, i) => (
                        <li key={i} className="flex items-start gap-2">
                          <span className="mt-2 size-1 shrink-0 rounded-full bg-rose-400/60" aria-hidden />
                          {req}
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>
              )}

              {job.missing_information && job.missing_information.length > 0 && (
                <div className="flex gap-3">
                  <Info className="mt-0.5 size-4 shrink-0 text-studio" aria-hidden />
                  <div>
                    <span className="block text-xs font-semibold uppercase tracking-wider text-studio">
                      Not stated — verify with employer
                    </span>
                    <ul className="mt-1.5 space-y-1 text-slate-400">
                      {job.missing_information.map((item, i) => (
                        <li key={i} className="flex items-start gap-2">
                          <span className="mt-2 size-1 shrink-0 rounded-full bg-amber-400/60" aria-hidden />
                          {item}
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>
              )}

              {!job.reasoning &&
                !job.unmet_requirements?.length &&
                !job.missing_information?.length && (
                  <p className="text-slate-400">No detailed reasoning was stored for this evaluation.</p>
                )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.article>
  );
}

// ── Per-tab empty states ───────────────────────────────────────────────────────
function EmptyState({
  tab,
  searching,
  onQuickAdd,
}: {
  tab: JobStatus;
  searching: boolean;
  onQuickAdd: () => void;
}) {
  if (searching) {
    return (
      <div className="flex min-h-[240px] flex-col items-center justify-center rounded-surface border border-line bg-surface-1 p-8 text-center">
        <div className="grid size-12 place-items-center rounded-surface border border-line bg-white/[0.03] text-slate-500">
          <Search className="size-6" aria-hidden />
        </div>
        <h3 className="mt-4 font-display text-base font-bold text-white">No listings match that search</h3>
        <p className="mt-1 max-w-sm text-sm text-slate-400">
          Try a shorter query, or clear the search to see everything in this tab.
        </p>
      </div>
    );
  }

  const copy = {
    matched: {
      icon: Building2,
      title: "Inbox clear — nothing waiting on you",
      body: "The pipeline keeps scanning Greenhouse, Lever, Ashby and SmartRecruiters on its own schedule. New strong fits land here with a tailored resume and cover letter already drafted.",
      action: (
        <button
          onClick={onQuickAdd}
          className="mt-5 flex items-center gap-2 rounded-control bg-careers px-4 py-2 text-xs font-semibold text-surface-0 transition hover:bg-careers-bright"
        >
          <Plus className="size-3.5" aria-hidden />
          Evaluate a posting now
        </button>
      ),
    },
    applied: {
      icon: CheckCircle2,
      title: "No applications sent yet",
      body: "Anything you mark as applied moves here, so you can tell a draft from a job you have actually followed up on.",
      action: null,
    },
    skipped: {
      icon: X,
      title: "Nothing has been ruled out",
      body: "Postings Gemini judged unmet, and anything you skip by hand, collect here with the reasoning intact. If too much is landing here, loosen your target titles or locations.",
      action: (
        <Link
          href="/settings"
          className="mt-5 flex items-center gap-2 rounded-control border border-line-strong bg-white/5 px-4 py-2 text-xs font-semibold text-white transition hover:bg-white/10"
        >
          <SlidersHorizontal className="size-3.5" aria-hidden />
          Adjust search preferences
        </Link>
      ),
    },
  }[tab];

  const Icon = copy.icon;

  return (
    <div className="flex min-h-[280px] flex-col items-center justify-center rounded-surface border border-line bg-surface-1 p-8 text-center">
      <div className="grid size-12 place-items-center rounded-surface border border-line bg-white/[0.03] text-slate-500">
        <Icon className="size-6" aria-hidden />
      </div>
      <h3 className="mt-4 font-display text-base font-bold text-white">{copy.title}</h3>
      <p className="mt-1.5 max-w-md text-sm leading-relaxed text-slate-400">{copy.body}</p>
      {copy.action}
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
export function CareerDashboard() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [activeTab, setActiveTab] = useState<JobStatus>("matched");
  const [buckets, setBuckets] = useState<JobBuckets>(emptyBuckets);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState<SortOption>("newest");
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [focusedIndex, setFocusedIndex] = useState(0);
  const [quickAddOpen, setQuickAddOpen] = useState(false);
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  const [quickAddUrl, setQuickAddUrl] = useState("");
  const [quickAddText, setQuickAddText] = useState("");
  const [quickAddBusy, setQuickAddBusy] = useState(false);
  const [quickAddResult, setQuickAddResult] = useState<
    { match?: boolean; reasoning?: string; error?: string } | null
  >(null);
  const [runSummary, setRunSummary] = useState<RunSummary | null>(null);
  const [summaryLoading, setSummaryLoading] = useState(true);
  const [summaryExpanded, setSummaryExpanded] = useState(false);

  const searchRef = useRef<HTMLInputElement>(null);

  const request = useCallback(
    async (path: string, init: RequestInit = {}) => {
      if (!user) throw new Error("Sign in is required.");
      const token = await user.getIdToken();
      const headers = new Headers(init.headers);
      headers.set("authorization", `Bearer ${token}`);
      return fetch(path, { ...init, headers });
    },
    [user],
  );

  /** Kicks off both loads; returns a cleanup that ignores in-flight results. */
  const refresh = useCallback(() => {
    if (!user) return () => {};
    let active = true;
    loadJobBuckets(request)
      .then((loaded) => {
        if (!active) return;
        setBuckets(loaded);
        setError("");
      })
      .catch((err: unknown) => {
        if (!active) return;
        setError(err instanceof Error ? err.message : "Failed to load opportunities.");
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    void loadRunSummary(request).then((summary) => {
      if (!active) return;
      setRunSummary(summary);
      setSummaryLoading(false);
    });

    return () => {
      active = false;
    };
  }, [request, user]);

  useEffect(() => refresh(), [refresh]);

  function retry() {
    setLoading(true);
    setSummaryLoading(true);
    setError("");
    refresh();
  }

  const counts = useMemo(
    () => ({
      matched: buckets.matched.length,
      applied: buckets.applied.length,
      skipped: buckets.skipped.length,
    }),
    [buckets],
  );

  const moveLocally = useCallback((job: Job, from: JobStatus, to: JobStatus) => {
    setBuckets((prev) => ({
      ...prev,
      [from]: prev[from].filter((j) => j.job_id !== job.job_id),
      [to]: [{ ...job, status: to }, ...prev[to].filter((j) => j.job_id !== job.job_id)],
    }));
  }, []);

  // Held in a ref so the Undo action inside a toast can call straight back
  // into this function without the callback having to reference itself.
  const applyRef = useRef<(job: Job, from: JobStatus, to: JobStatus, announce: boolean) => void>(
    () => {},
  );

  const applyStatus = useCallback(
    async (job: Job, from: JobStatus, to: JobStatus, announce: boolean) => {
      if (from === to) return;
      // Optimistic: the card moves now, and rolls back if the server says no.
      moveLocally(job, from, to);
      try {
        const res = await request("/api/applications/status", {
          method: "PUT",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ job_id: job.job_id, status: to }),
        });
        if (!res.ok) throw new Error(await responseError(res));
        if (announce) {
          const verb =
            to === "applied" ? "Marked as applied" : to === "skipped" ? "Skipped" : "Moved to inbox";
          toast({
            title: `${verb}: ${job.title}`,
            description: job.company,
            tone: "success",
            action: { label: "Undo", onClick: () => applyRef.current(job, to, from, false) },
          });
        }
      } catch (err) {
        moveLocally(job, to, from);
        toast({
          title: "Could not update that job",
          description: err instanceof Error ? err.message : "Unknown error.",
          tone: "error",
        });
      }
    },
    [moveLocally, request, toast],
  );

  useEffect(() => {
    applyRef.current = applyStatus;
  }, [applyStatus]);

  const updateStatus = useCallback(
    (job: Job, next: JobStatus) => {
      const from = ALL_STATUSES.find((s) => buckets[s].some((j) => j.job_id === job.job_id)) ?? activeTab;
      void applyStatus(job, from, next, true);
    },
    [activeTab, applyStatus, buckets],
  );

  async function handleQuickAdd(e: FormEvent) {
    e.preventDefault();
    setQuickAddBusy(true);
    setQuickAddResult(null);
    try {
      const res = await request("/api/quick-add", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ url: quickAddUrl, text: quickAddText }),
      });
      const data = await res.json();
      setQuickAddResult(data);
      if (data.match) refresh();
    } catch (err) {
      setQuickAddResult({
        error: err instanceof Error ? err.message : "Evaluation request failed.",
      });
    } finally {
      setQuickAddBusy(false);
    }
  }

  const displayedJobs = useMemo(() => {
    let list = buckets[activeTab];
    if (search.trim()) {
      const term = search.toLowerCase();
      list = list.filter(
        (j) =>
          j.title?.toLowerCase().includes(term) ||
          j.company?.toLowerCase().includes(term) ||
          j.location?.toLowerCase().includes(term),
      );
    }
    return sortJobs(list, sort);
  }, [buckets, activeTab, search, sort]);

  const isExpanded = useCallback(
    (job: Job) =>
      expanded[job.job_id] ??
      // A strong fit leads with its evidence: that reasoning is the reason to
      // trust the match, and it should not cost a click.
      (activeTab === "matched" && job.match_strength === "strong"),
    [expanded, activeTab],
  );

  // ── Keyboard triage ──────────────────────────────────────────────────────
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      const target = event.target as HTMLElement | null;
      const typing =
        target &&
        (target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.tagName === "SELECT" ||
          target.isContentEditable);

      if (event.key === "/" && !typing) {
        event.preventDefault();
        searchRef.current?.focus();
        return;
      }
      if (event.key === "Escape" && typing && target === searchRef.current) {
        searchRef.current?.blur();
        return;
      }
      if (typing || event.metaKey || event.ctrlKey || event.altKey) return;
      if (quickAddOpen || shortcutsOpen) return;

      const job = displayedJobs[focusedIndex];
      switch (event.key) {
        case "j":
          event.preventDefault();
          setFocusedIndex((i) => Math.min(displayedJobs.length - 1, i + 1));
          break;
        case "k":
          event.preventDefault();
          setFocusedIndex((i) => Math.max(0, i - 1));
          break;
        case "a":
          if (job && activeTab === "matched") {
            event.preventDefault();
            void updateStatus(job, "applied");
          }
          break;
        case "s":
          if (job && activeTab !== "skipped") {
            event.preventDefault();
            void updateStatus(job, "skipped");
          }
          break;
        case "e":
          if (job) {
            event.preventDefault();
            setExpanded((prev) => ({ ...prev, [job.job_id]: !isExpanded(job) }));
          }
          break;
        case "n":
          event.preventDefault();
          setQuickAddOpen(true);
          break;
        case "?":
          event.preventDefault();
          setShortcutsOpen(true);
          break;
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [displayedJobs, focusedIndex, activeTab, updateStatus, isExpanded, quickAddOpen, shortcutsOpen]);

  return (
    <div className="relative min-h-dvh overflow-x-hidden bg-surface-0 text-slate-100">
      <a href="#opportunities" className="skip-link">
        Skip to opportunities
      </a>
      <div className="pointer-events-none absolute inset-0 bg-grid-subtle opacity-40" aria-hidden />

      <AppHeader
        stream="careers"
        settingsLabel="Career search preferences"
        actions={
          <button
            onClick={() => setQuickAddOpen(true)}
            className="flex items-center gap-1.5 rounded-control border border-emerald-500/30 bg-emerald-950/40 px-3 py-1.5 text-xs font-semibold text-emerald-300 transition hover:bg-emerald-900/50"
          >
            <Plus className="size-3.5" aria-hidden />
            <span className="hidden sm:inline">Evaluate Job</span>
          </button>
        }
      />

      <main className="relative z-10 mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        <div className="flex flex-col gap-6 md:flex-row md:items-end md:justify-between">
          <div>
            <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-careers">
              <span>TalentOS // Careers</span>
              <span className="size-1 rounded-full bg-careers" aria-hidden />
              <span>Full-Time Pipeline</span>
            </div>
            <h1 className="mt-1 font-display text-3xl font-extrabold text-white sm:text-4xl">
              Opportunity Intelligence
            </h1>
            <p className="mt-1.5 max-w-xl text-sm text-slate-400">
              Every job evaluated by Gemini against your hard criteria, with tailored application
              drafts attached before you see it.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <div className="flex items-center overflow-hidden rounded-surface border border-line bg-surface-1">
              {(
                [
                  { label: "To Apply", value: counts.matched, dot: "bg-careers", text: "text-careers" },
                  { label: "Applied", value: counts.applied, dot: "bg-slate-400", text: "text-slate-200" },
                  { label: "Skipped", value: counts.skipped, dot: "bg-rose-400", text: "text-slate-400" },
                ] as const
              ).map((stat, i) => (
                <div key={stat.label} className="flex items-center">
                  {i > 0 && <span className="h-9 w-px bg-white/[0.06]" aria-hidden />}
                  <div className="flex items-center gap-2 px-4 py-2.5">
                    <span className={cn("size-2 rounded-full", stat.dot)} aria-hidden />
                    <div>
                      <span className="block font-mono text-xs uppercase tracking-wider text-slate-400">
                        {stat.label}
                      </span>
                      <span className={cn("font-display text-lg font-bold leading-none", stat.text)}>
                        {loading ? "—" : stat.value}
                      </span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        <RunSummaryBar
          summary={runSummary}
          loading={summaryLoading}
          expanded={summaryExpanded}
          onToggle={() => setSummaryExpanded((v) => !v)}
        />

        {/* Tabs + filters */}
        <div className="mt-6 flex flex-col gap-4 border-b border-line pb-4 lg:flex-row lg:items-center lg:justify-between">
          <div role="tablist" aria-label="Opportunity status" className="flex flex-wrap items-center gap-1.5">
            {tabs.map((tab) => {
              const Icon = tab.icon;
              const isActive = activeTab === tab.value;
              return (
                <button
                  key={tab.value}
                  role="tab"
                  aria-selected={isActive}
                  onClick={() => {
                    setActiveTab(tab.value);
                    setFocusedIndex(0);
                  }}
                  className={cn(
                    "flex items-center gap-2 rounded-control px-4 py-2 text-xs font-semibold transition",
                    isActive
                      ? "bg-careers text-surface-0 shadow-[0_0_14px_rgba(16,185,129,0.3)]"
                      : "border border-line bg-white/[0.03] text-slate-300 hover:bg-white/[0.07] hover:text-white",
                  )}
                >
                  <Icon className="size-3.5" aria-hidden />
                  <span>{tab.label}</span>
                  <span
                    className={cn(
                      "rounded-full px-1.5 py-0.5 font-mono text-xs font-bold tabular-nums",
                      isActive ? "bg-black/20 text-surface-0" : "bg-white/10 text-slate-300",
                    )}
                  >
                    {loading ? "–" : counts[tab.value]}
                  </span>
                </button>
              );
            })}
          </div>

          <div className="flex items-center gap-2">
            <div className="relative flex-1 lg:flex-none">
              <Search className="pointer-events-none absolute left-3 top-2.5 size-4 text-slate-500" aria-hidden />
              <input
                ref={searchRef}
                type="search"
                value={search}
                onChange={(e) => {
                  setSearch(e.target.value);
                  setFocusedIndex(0);
                }}
                aria-label="Search positions and companies"
                placeholder="Search position or company…"
                className="h-9 w-full rounded-control border border-line bg-surface-1 pl-9 pr-3 text-sm text-white placeholder:text-slate-500 focus:border-careers/40 focus:outline-none lg:w-60"
              />
            </div>
            <label className="sr-only" htmlFor="sort-jobs">
              Sort opportunities
            </label>
            <select
              id="sort-jobs"
              value={sort}
              onChange={(e) => {
                setSort(e.target.value as SortOption);
                setFocusedIndex(0);
              }}
              className="h-9 rounded-control border border-line bg-surface-1 px-3 text-sm text-slate-200 focus:border-careers/40 focus:outline-none"
            >
              <option value="newest">Newest First</option>
              <option value="match">Highest Fit</option>
              <option value="position">Job Title</option>
              <option value="location">Location</option>
            </select>
            <button
              type="button"
              onClick={() => setShortcutsOpen(true)}
              aria-label="Keyboard shortcuts"
              title="Keyboard shortcuts (?)"
              className="hidden size-9 place-items-center rounded-control border border-line bg-surface-1 text-slate-400 transition hover:text-white md:grid"
            >
              <Keyboard className="size-4" aria-hidden />
            </button>
          </div>
        </div>

        <div id="opportunities" className="mt-6">
          {loading ? (
            <div className="space-y-3">
              {Array.from({ length: 3 }).map((_, i) => (
                <CardSkeleton key={i} />
              ))}
            </div>
          ) : error ? (
            <div className="rounded-surface border border-rose-500/25 bg-rose-950/20 p-8 text-center">
              <CircleAlert className="mx-auto size-8 text-rose-400" aria-hidden />
              <h3 className="mt-3 font-display text-base font-bold text-white">
                Could not load opportunities
              </h3>
              <p className="mt-1 text-sm text-rose-300">{error}</p>
              <button
                onClick={retry}
                className="mt-4 rounded-control border border-line-strong bg-white/5 px-4 py-2 text-xs font-semibold text-white hover:bg-white/10"
              >
                Retry connection
              </button>
            </div>
          ) : displayedJobs.length === 0 ? (
            <EmptyState
              tab={activeTab}
              searching={Boolean(search.trim())}
              onQuickAdd={() => setQuickAddOpen(true)}
            />
          ) : (
            <div className="space-y-3">
              <AnimatePresence mode="popLayout" initial={false}>
                {displayedJobs.map((job, index) => (
                  <JobCard
                    key={job.job_id}
                    job={job}
                    activeTab={activeTab}
                    isExpanded={isExpanded(job)}
                    isFocused={index === focusedIndex}
                    onFocus={() => setFocusedIndex(index)}
                    onToggleExpand={() =>
                      setExpanded((prev) => ({ ...prev, [job.job_id]: !isExpanded(job) }))
                    }
                    onUpdateStatus={updateStatus}
                  />
                ))}
              </AnimatePresence>
            </div>
          )}
        </div>
      </main>

      {/* ── Quick add ──────────────────────────────────────────────────────── */}
      <Modal
        open={quickAddOpen}
        onClose={() => {
          setQuickAddOpen(false);
          setQuickAddResult(null);
        }}
        title="Evaluate job with Gemini"
        icon={
          <span className="grid size-7 place-items-center rounded-control border border-emerald-500/25 bg-emerald-950/40 text-careers">
            <Sparkles className="size-3.5" aria-hidden />
          </span>
        }
      >
        <form onSubmit={handleQuickAdd} className="space-y-4 p-6">
          <div>
            <label htmlFor="quick-add-url" className="mb-1.5 block text-sm font-semibold text-slate-300">
              ATS job posting URL
            </label>
            <input
              id="quick-add-url"
              type="url"
              value={quickAddUrl}
              onChange={(e) => setQuickAddUrl(e.target.value)}
              placeholder="https://jobs.lever.co/…"
              className="h-10 w-full rounded-control border border-line bg-surface-0 px-3 text-sm text-white placeholder:text-slate-500 focus:border-careers/40 focus:outline-none"
            />
            <p className="mt-1.5 text-xs text-slate-400">
              Greenhouse, Lever and Ashby links resolve through their public APIs.
            </p>
          </div>
          <div>
            <label htmlFor="quick-add-text" className="mb-1.5 block text-sm font-semibold text-slate-300">
              Or paste the full job description
            </label>
            <textarea
              id="quick-add-text"
              rows={5}
              value={quickAddText}
              onChange={(e) => setQuickAddText(e.target.value)}
              placeholder="Paste job posting text…"
              className="w-full resize-none rounded-control border border-line bg-surface-0 p-3 text-sm text-white placeholder:text-slate-500 focus:border-careers/40 focus:outline-none"
            />
          </div>

          {quickAddResult && (
            <div
              role="status"
              className={cn(
                "rounded-control border p-4 text-sm leading-relaxed",
                quickAddResult.error
                  ? "border-rose-500/25 bg-rose-950/20"
                  : quickAddResult.match
                    ? "border-emerald-500/25 bg-emerald-950/20"
                    : "border-amber-500/25 bg-amber-950/20",
              )}
            >
              {quickAddResult.error ? (
                <p className="text-rose-300">{quickAddResult.error}</p>
              ) : (
                <div>
                  <span
                    className={cn(
                      "flex items-center gap-1.5 font-bold",
                      quickAddResult.match ? "text-careers" : "text-studio",
                    )}
                  >
                    {quickAddResult.match ? (
                      <CheckCircle2 className="size-4" aria-hidden />
                    ) : (
                      <CircleAlert className="size-4" aria-hidden />
                    )}
                    {quickAddResult.match ? "Match found — materials drafted" : "Skipped: criteria unmet"}
                  </span>
                  <p className="mt-1.5 text-slate-300">{quickAddResult.reasoning}</p>
                </div>
              )}
            </div>
          )}

          <div className="flex items-center justify-end gap-2 pt-1">
            <button
              type="button"
              onClick={() => {
                setQuickAddOpen(false);
                setQuickAddResult(null);
              }}
              className="rounded-control px-4 py-2 text-xs font-semibold text-slate-300 transition hover:text-white"
            >
              Close
            </button>
            <button
              type="submit"
              disabled={quickAddBusy || (!quickAddUrl && !quickAddText)}
              className="flex items-center gap-1.5 rounded-control bg-careers px-4 py-2 text-xs font-semibold text-surface-0 transition hover:bg-careers-bright disabled:opacity-50"
            >
              {quickAddBusy && (
                <span
                  className="size-3 animate-spin rounded-full border-2 border-black/25 border-t-black/70"
                  aria-hidden
                />
              )}
              {quickAddBusy ? "Evaluating…" : "Evaluate posting"}
            </button>
          </div>
        </form>
      </Modal>

      {/* ── Shortcuts ──────────────────────────────────────────────────────── */}
      <Modal
        open={shortcutsOpen}
        onClose={() => setShortcutsOpen(false)}
        title="Keyboard shortcuts"
        className="max-w-md"
        icon={
          <span className="grid size-7 place-items-center rounded-control border border-line-strong bg-white/5 text-slate-300">
            <Keyboard className="size-3.5" aria-hidden />
          </span>
        }
      >
        <dl className="divide-y divide-line p-2">
          {[
            ["J / K", "Move between opportunities"],
            ["A", "Mark the focused job as applied"],
            ["S", "Skip the focused job"],
            ["E", "Expand or collapse its fit reasoning"],
            ["N", "Evaluate a new posting"],
            ["/", "Jump to search"],
            ["?", "Show this list"],
          ].map(([key, description]) => (
            <div key={key} className="flex items-center justify-between gap-4 px-4 py-2.5">
              <dt>
                <kbd className="rounded-control border border-line-strong bg-white/5 px-2 py-1 font-mono text-xs font-semibold text-white">
                  {key}
                </kbd>
              </dt>
              <dd className="text-sm text-slate-400">{description}</dd>
            </div>
          ))}
        </dl>
      </Modal>
    </div>
  );
}
