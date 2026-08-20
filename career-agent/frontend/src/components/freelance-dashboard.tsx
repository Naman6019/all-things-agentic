"use client";

import {
  BriefcaseBusiness,
  Check,
  CheckCircle2,
  ChevronDown,
  CircleAlert,
  DollarSign,
  ExternalLink,
  Inbox,
  Info,
  Search,
  Send,
  SlidersHorizontal,
  TriangleAlert,
  X,
  Zap,
} from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { AppHeader } from "@/components/app-header";
import { useAuth } from "@/components/auth-provider";
import { useToast } from "@/components/ui/toast";
import type { Lead, LeadsResponse } from "@/lib/types";
import { cn } from "@/lib/utils";

type SortOption = "newest" | "position" | "budget" | "match";
type LeadTab = "matched" | "sent" | "skipped";
type LeadBuckets = Record<LeadTab, Lead[]>;

const LEAD_TABS: LeadTab[] = ["matched", "sent", "skipped"];
const emptyBuckets: LeadBuckets = { matched: [], sent: [], skipped: [] };

const matchRank: Record<NonNullable<Lead["match_strength"]>, number> = {
  strong: 0,
  medium: 1,
  weak: 2,
  unscored: 3,
};

const tabs: { value: LeadTab; label: string; icon: typeof Inbox }[] = [
  { value: "matched", label: "To Pitch", icon: Inbox },
  { value: "sent", label: "Pitches Sent", icon: CheckCircle2 },
  { value: "skipped", label: "Skipped Gigs", icon: X },
];

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

function sourceBadge(source?: string) {
  if (!source) return { label: "Freelance feed", className: "border-line bg-white/5 text-slate-300" };
  const s = source.toLowerCase();
  if (s.includes("reddit") || s.includes("rforhire"))
    return { label: "r/forhire", className: "border-orange-500/30 bg-orange-950/40 text-orange-300" };
  if (s.includes("wwr") || s.includes("weworkremotely"))
    return { label: "We Work Remotely", className: "border-amber-500/30 bg-amber-950/40 text-amber-300" };
  if (s.includes("contra"))
    return { label: "Contra", className: "border-yellow-500/30 bg-yellow-950/40 text-yellow-200" };
  return { label: source.toUpperCase(), className: "border-line bg-white/5 text-slate-300" };
}

type LeadConfig = { label: string; pill: string; accent: string; bar: string; fill: number };

function leadConfig(lead: Lead): LeadConfig {
  if (lead.status === "skipped")
    return {
      label: "Scope Mismatch",
      pill: "border-rose-500/30 bg-rose-950/40 text-rose-300",
      accent: "from-rose-500/60 via-rose-500/20 to-transparent",
      bar: "bg-rose-500/40",
      fill: 0.15,
    };
  if (lead.status === "sent")
    return {
      label: "Pitch Sent",
      pill: "border-slate-600/30 bg-slate-800/40 text-slate-300",
      accent: "from-slate-500/40 via-slate-500/10 to-transparent",
      bar: "bg-slate-500/40",
      fill: 1,
    };
  if (lead.match_strength === "strong")
    return {
      label: "High Conversion Fit",
      pill: "border-amber-500/40 bg-amber-950/50 text-amber-300",
      accent: "from-amber-500/50 via-amber-500/15 to-transparent",
      bar: "bg-studio",
      fill: 1,
    };
  if (lead.match_strength === "medium")
    return {
      label: "Viable Fit",
      pill: "border-yellow-500/30 bg-yellow-950/40 text-yellow-200",
      accent: "from-yellow-500/40 via-yellow-500/10 to-transparent",
      bar: "bg-yellow-500",
      fill: 0.62,
    };
  return {
    label: "Low Fit",
    pill: "border-slate-700/40 bg-slate-900/40 text-slate-400",
    accent: "from-slate-600/20 via-transparent to-transparent",
    bar: "bg-slate-600/50",
    fill: 0.3,
  };
}

function leadTimestamp(lead: Lead) {
  const value = lead.posted_at || lead.materials_created_at || lead.evaluated_at;
  const timestamp = value ? new Date(value).getTime() : 0;
  return Number.isNaN(timestamp) ? 0 : timestamp;
}

function sortLeads(leads: Lead[], sort: SortOption) {
  return [...leads].sort((left, right) => {
    if (sort === "position") return (left.title || "").localeCompare(right.title || "");
    if (sort === "budget")
      return (left.budget || "Unspecified").localeCompare(right.budget || "Unspecified");
    if (sort === "match") {
      const strength =
        matchRank[left.match_strength || "unscored"] - matchRank[right.match_strength || "unscored"];
      return strength || leadTimestamp(right) - leadTimestamp(left);
    }
    return leadTimestamp(right) - leadTimestamp(left);
  });
}

type Requester = (path: string, init?: RequestInit) => Promise<Response>;

/** All three tabs at once — see the note in career-dashboard for why. */
async function loadLeadBuckets(request: Requester): Promise<LeadBuckets> {
  const responses = await Promise.all(
    LEAD_TABS.map(async (status) => {
      const res = await request(`/api/leads?status=${status}`);
      if (!res.ok) throw new Error(await responseError(res));
      return (await res.json()) as LeadsResponse;
    }),
  );
  return {
    matched: responses[0].leads || [],
    sent: responses[1].leads || [],
    skipped: responses[2].leads || [],
  };
}

function EmptyState({ tab, searching }: { tab: LeadTab; searching: boolean }) {
  if (searching) {
    return (
      <div className="flex min-h-[240px] flex-col items-center justify-center rounded-surface border border-line bg-surface-1 p-8 text-center">
        <div className="grid size-12 place-items-center rounded-surface border border-line bg-white/[0.03] text-slate-500">
          <Search className="size-6" aria-hidden />
        </div>
        <h3 className="mt-4 font-display text-base font-bold text-white">No leads match that search</h3>
        <p className="mt-1 max-w-sm text-sm text-slate-400">
          Try a shorter query, or clear the search to see everything in this tab.
        </p>
      </div>
    );
  }

  const copy = {
    matched: {
      icon: BriefcaseBusiness,
      title: "No client leads waiting",
      body: "Studio watches r/forhire, We Work Remotely and Contra continuously. Anything that clears budget, scope and stack lands here with a pitch already drafted.",
      action: (
        <Link
          href="/freelance/settings"
          className="mt-5 flex items-center gap-2 rounded-control border border-line-strong bg-white/5 px-4 py-2 text-xs font-semibold text-white transition hover:bg-white/10"
        >
          <SlidersHorizontal className="size-3.5" aria-hidden />
          Review your services and rates
        </Link>
      ),
    },
    sent: {
      icon: Send,
      title: "No pitches sent yet",
      body: "Once you send a pitch and mark it here, this tab becomes your follow-up list.",
      action: null,
    },
    skipped: {
      icon: X,
      title: "Nothing has been ruled out",
      body: "Leads that missed on budget, timeline or stack collect here with their reasoning. A crowded tab usually means your niche or availability needs widening.",
      action: (
        <Link
          href="/freelance/settings"
          className="mt-5 flex items-center gap-2 rounded-control border border-line-strong bg-white/5 px-4 py-2 text-xs font-semibold text-white transition hover:bg-white/10"
        >
          <SlidersHorizontal className="size-3.5" aria-hidden />
          Adjust freelance profile
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

export function FreelanceDashboard() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [activeTab, setActiveTab] = useState<LeadTab>("matched");
  const [buckets, setBuckets] = useState<LeadBuckets>(emptyBuckets);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState<SortOption>("newest");
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});

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

  /** Kicks off the load; returns a cleanup that ignores in-flight results. */
  const refresh = useCallback(() => {
    if (!user) return () => {};
    let active = true;
    loadLeadBuckets(request)
      .then((loaded) => {
        if (!active) return;
        setBuckets(loaded);
        setError("");
      })
      .catch((err: unknown) => {
        if (!active) return;
        setError(err instanceof Error ? err.message : "Failed to load freelance leads.");
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [request, user]);

  useEffect(() => refresh(), [refresh]);

  function retry() {
    setLoading(true);
    setError("");
    refresh();
  }

  const counts = useMemo(
    () => ({
      matched: buckets.matched.length,
      sent: buckets.sent.length,
      skipped: buckets.skipped.length,
    }),
    [buckets],
  );

  const moveLocally = useCallback((lead: Lead, from: LeadTab, to: LeadTab) => {
    setBuckets((prev) => ({
      ...prev,
      [from]: prev[from].filter((l) => l.lead_id !== lead.lead_id),
      [to]: [{ ...lead, status: to }, ...prev[to].filter((l) => l.lead_id !== lead.lead_id)],
    }));
  }, []);

  // Held in a ref so the Undo action inside a toast can call back into this
  // function without the callback having to reference itself.
  const applyRef = useRef<(lead: Lead, from: LeadTab, to: LeadTab, announce: boolean) => void>(
    () => {},
  );

  const applyStatus = useCallback(
    async (lead: Lead, from: LeadTab, to: LeadTab, announce: boolean) => {
      if (from === to) return;
      moveLocally(lead, from, to);
      try {
        const res = await request("/api/leads/status", {
          method: "PUT",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ lead_id: lead.lead_id, status: to }),
        });
        if (!res.ok) throw new Error(await responseError(res));
        if (announce) {
          const verb =
            to === "sent" ? "Pitch marked sent" : to === "skipped" ? "Skipped" : "Moved to inbox";
          toast({
            title: `${verb}: ${lead.title}`,
            description: lead.client,
            tone: "success",
            action: { label: "Undo", onClick: () => applyRef.current(lead, to, from, false) },
          });
        }
      } catch (err) {
        moveLocally(lead, to, from);
        toast({
          title: "Could not update that lead",
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
    (lead: Lead, next: LeadTab) => {
      const from = LEAD_TABS.find((s) => buckets[s].some((l) => l.lead_id === lead.lead_id)) ?? activeTab;
      void applyStatus(lead, from, next, true);
    },
    [activeTab, applyStatus, buckets],
  );

  const displayedLeads = useMemo(() => {
    let list = buckets[activeTab];
    if (search.trim()) {
      const term = search.toLowerCase();
      list = list.filter(
        (l) =>
          l.title?.toLowerCase().includes(term) ||
          l.client?.toLowerCase().includes(term) ||
          l.reasoning?.toLowerCase().includes(term),
      );
    }
    return sortLeads(list, sort);
  }, [buckets, activeTab, search, sort]);

  const isExpanded = useCallback(
    (lead: Lead) =>
      expanded[lead.lead_id] ?? (activeTab === "matched" && lead.match_strength === "strong"),
    [expanded, activeTab],
  );

  return (
    <div className="relative min-h-dvh overflow-x-hidden bg-surface-0 text-slate-100">
      <a href="#leads" className="skip-link">
        Skip to client leads
      </a>
      <div className="pointer-events-none absolute inset-0 bg-grid-subtle opacity-40" aria-hidden />

      <AppHeader
        stream="studio"
        settingsHref="/freelance/settings"
        settingsLabel="Freelance services and rates"
      />

      <main className="relative z-10 mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        <div className="flex flex-col gap-6 md:flex-row md:items-end md:justify-between">
          <div>
            <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-studio">
              <span>TalentOS // Studio</span>
              <span className="size-1 rounded-full bg-studio" aria-hidden />
              <span>Freelance Pipeline</span>
            </div>
            <h1 className="mt-1 font-display text-3xl font-extrabold text-white sm:text-4xl">
              Client Opportunity Feed
            </h1>
            <p className="mt-1.5 max-w-xl text-sm text-slate-400">
              Autonomous gig monitoring across r/forhire, We Work Remotely and Contra, with Gemini fit
              scoring and a pre-drafted client pitch on every lead.
            </p>
          </div>

          <div className="flex items-center overflow-hidden rounded-surface border border-line bg-surface-1">
            {(
              [
                { label: "To Pitch", value: counts.matched, dot: "bg-studio", text: "text-studio" },
                { label: "Sent Out", value: counts.sent, dot: "bg-slate-400", text: "text-slate-200" },
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

        <div className="mt-8 flex flex-col gap-4 border-b border-line pb-4 lg:flex-row lg:items-center lg:justify-between">
          <div role="tablist" aria-label="Lead status" className="flex flex-wrap items-center gap-1.5">
            {tabs.map((tab) => {
              const Icon = tab.icon;
              const isActive = activeTab === tab.value;
              return (
                <button
                  key={tab.value}
                  role="tab"
                  aria-selected={isActive}
                  onClick={() => setActiveTab(tab.value)}
                  className={cn(
                    "flex items-center gap-2 rounded-control px-4 py-2 text-xs font-semibold transition",
                    isActive
                      ? "bg-studio text-surface-0 shadow-[0_0_15px_rgba(245,158,11,0.3)]"
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
                type="search"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                aria-label="Search leads and clients"
                placeholder="Search leads or client…"
                className="h-9 w-full rounded-control border border-line bg-surface-1 pl-9 pr-3 text-sm text-white placeholder:text-slate-500 focus:border-studio/50 focus:outline-none lg:w-60"
              />
            </div>
            <label className="sr-only" htmlFor="sort-leads">
              Sort leads
            </label>
            <select
              id="sort-leads"
              value={sort}
              onChange={(e) => setSort(e.target.value as SortOption)}
              className="h-9 rounded-control border border-line bg-surface-1 px-3 text-sm text-slate-200 focus:border-studio/50 focus:outline-none"
            >
              <option value="newest">Newest First</option>
              <option value="match">Highest Fit</option>
              <option value="budget">Budget Size</option>
              <option value="position">Lead Title</option>
            </select>
          </div>
        </div>

        <div id="leads" className="mt-6">
          {loading ? (
            <div className="space-y-3">
              {Array.from({ length: 3 }).map((_, i) => (
                <div
                  key={i}
                  className="h-32 animate-pulse rounded-surface border border-line bg-surface-1"
                />
              ))}
            </div>
          ) : error ? (
            <div className="rounded-surface border border-rose-500/25 bg-rose-950/20 p-8 text-center">
              <CircleAlert className="mx-auto size-8 text-rose-400" aria-hidden />
              <h3 className="mt-3 font-display text-base font-bold text-white">
                Could not load client leads
              </h3>
              <p className="mt-1 text-sm text-rose-300">{error}</p>
              <button
                onClick={retry}
                className="mt-4 rounded-control border border-line-strong bg-white/5 px-4 py-2 text-xs font-semibold text-white hover:bg-white/10"
              >
                Retry connection
              </button>
            </div>
          ) : displayedLeads.length === 0 ? (
            <EmptyState tab={activeTab} searching={Boolean(search.trim())} />
          ) : (
            <div className="space-y-3">
              <AnimatePresence mode="popLayout" initial={false}>
                {displayedLeads.map((lead) => {
                  const cfg = leadConfig(lead);
                  const src = sourceBadge(lead.source);
                  const open = isExpanded(lead);
                  const prominent = activeTab === "matched" && lead.match_strength === "strong";
                  const label = `${lead.title}${lead.client ? ` for ${lead.client}` : ""}`;

                  return (
                    <motion.article
                      key={lead.lead_id}
                      layout
                      initial={{ opacity: 0, y: 12 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -8, scale: 0.98 }}
                      transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
                      aria-label={label}
                      className="relative overflow-hidden rounded-surface border border-line bg-surface-1 transition-colors hover:border-line-strong"
                    >
                      <div
                        className={cn("absolute left-0 top-0 h-full w-[3px] bg-gradient-to-b", cfg.accent)}
                        aria-hidden
                      />
                      <div className={cn("pl-5 pr-4 sm:pr-5", prominent ? "pb-4 pt-5" : "pb-3 pt-4")}>
                        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                          <div className="min-w-0 space-y-1.5">
                            <div className="flex flex-wrap items-center gap-1.5">
                              <span
                                className={cn(
                                  "rounded-full border px-2.5 py-0.5 text-xs font-semibold tracking-wide",
                                  cfg.pill,
                                )}
                              >
                                {cfg.label}
                              </span>
                              <span
                                className={cn("rounded-control border px-2 py-0.5 font-mono text-xs", src.className)}
                              >
                                {src.label}
                              </span>
                              {lead.budget && (
                                <span className="flex items-center gap-1 rounded-control border border-amber-500/25 bg-amber-950/30 px-2 py-0.5 font-mono text-xs font-semibold text-amber-300">
                                  <DollarSign className="size-3" aria-hidden />
                                  {lead.budget}
                                </span>
                              )}
                              {lead.timeline && (
                                <span className="rounded-control border border-line bg-white/[0.04] px-2 py-0.5 text-xs text-slate-300">
                                  {lead.timeline}
                                </span>
                              )}
                              <span className="text-xs text-slate-500">
                                {formatDate(lead.posted_at || lead.evaluated_at)}
                              </span>
                            </div>

                            <h3
                              className={cn(
                                "font-display font-bold text-white",
                                prominent ? "text-xl" : "text-base",
                              )}
                            >
                              {lead.title}
                            </h3>

                            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-slate-400">
                              {lead.client && (
                                <span>
                                  Client: <strong className="font-medium text-slate-300">{lead.client}</strong>
                                </span>
                              )}
                              {lead.contact_method && (
                                <span>
                                  Contact: <span className="text-slate-200">{lead.contact_method}</span>
                                </span>
                              )}
                              {lead.suggested_rate && (
                                <span>
                                  Suggested rate:{" "}
                                  <span className="text-slate-200">{lead.suggested_rate}</span>
                                </span>
                              )}
                            </div>

                            <div className="pt-1">
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

                          <div className="flex shrink-0 flex-wrap items-center gap-2">
                            {lead.url && (
                              <a
                                href={lead.url}
                                target="_blank"
                                rel="noreferrer"
                                aria-label={`Open the original posting for ${label} in a new tab`}
                                title="Original gig posting"
                                className="grid size-8 place-items-center rounded-control border border-line bg-white/[0.03] text-slate-400 transition hover:bg-white/[0.08] hover:text-white"
                              >
                                <ExternalLink className="size-3.5" aria-hidden />
                              </a>
                            )}

                            {activeTab !== "skipped" && (
                              <Link
                                href={`/freelance/pitch?lead_id=${encodeURIComponent(lead.lead_id)}`}
                                aria-label={`Review and send the pitch for ${label}`}
                                className="flex items-center gap-1.5 rounded-control bg-studio px-3.5 py-2 text-xs font-semibold text-surface-0 shadow-[0_0_15px_rgba(245,158,11,0.2)] transition hover:bg-studio-bright active:scale-[0.98]"
                              >
                                <Send className="size-3.5" aria-hidden />
                                <span>Review &amp; Send Pitch</span>
                              </Link>
                            )}

                            {activeTab === "matched" && (
                              <button
                                onClick={() => updateStatus(lead, "sent")}
                                aria-label={`Mark the pitch for ${label} as sent`}
                                className="flex items-center gap-1 rounded-control border border-line bg-white/[0.03] px-3 py-2 text-xs font-medium text-slate-300 transition hover:bg-white/[0.08] hover:text-white"
                              >
                                <Check className="size-3.5 text-studio" aria-hidden />
                                <span>Mark Sent</span>
                              </button>
                            )}

                            {activeTab !== "matched" && (
                              <button
                                onClick={() => updateStatus(lead, "matched")}
                                aria-label={`Move ${label} back to the To Pitch inbox`}
                                className="rounded-control border border-line bg-white/[0.03] px-3 py-2 text-xs font-medium text-slate-300 transition hover:bg-white/[0.08] hover:text-white"
                              >
                                Move to Inbox
                              </button>
                            )}

                            {activeTab !== "skipped" && (
                              <button
                                onClick={() => updateStatus(lead, "skipped")}
                                aria-label={`Skip ${label}`}
                                title="Skip lead"
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
                            onClick={() =>
                              setExpanded((prev) => ({ ...prev, [lead.lead_id]: !open }))
                            }
                            aria-expanded={open}
                            className="flex items-center gap-1.5 text-xs font-medium text-slate-400 transition hover:text-slate-200"
                          >
                            <ChevronDown
                              className={cn("size-3.5 transition-transform duration-200", open && "rotate-180")}
                              aria-hidden
                            />
                            <span>{open ? "Hide details" : "View client request & Gemini fit reasoning"}</span>
                          </button>
                        </div>
                      </div>

                      <AnimatePresence initial={false}>
                        {open && (
                          <motion.div
                            initial={{ height: 0, opacity: 0 }}
                            animate={{ height: "auto", opacity: 1 }}
                            exit={{ height: 0, opacity: 0 }}
                            transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
                            className="overflow-hidden"
                          >
                            <div className="space-y-4 border-t border-line bg-surface-sunken px-5 py-4 text-sm leading-relaxed">
                              {lead.reasoning && (
                                <div className="flex gap-3">
                                  <Zap className="mt-0.5 size-4 shrink-0 text-studio" aria-hidden />
                                  <div>
                                    <span className="block text-xs font-semibold uppercase tracking-wider text-slate-300">
                                      Why this project fits
                                    </span>
                                    <p className="mt-1 text-slate-400">{lead.reasoning}</p>
                                  </div>
                                </div>
                              )}

                              {lead.relevant_portfolio && lead.relevant_portfolio.length > 0 && (
                                <div className="flex gap-3">
                                  <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-emerald-400" aria-hidden />
                                  <div>
                                    <span className="block text-xs font-semibold uppercase tracking-wider text-slate-300">
                                      Portfolio anchors
                                    </span>
                                    <ul className="mt-1.5 space-y-1 text-slate-400">
                                      {lead.relevant_portfolio.map((item, i) => (
                                        <li key={i} className="flex items-start gap-2">
                                          <span
                                            className="mt-2 size-1 shrink-0 rounded-full bg-emerald-400/60"
                                            aria-hidden
                                          />
                                          {item}
                                        </li>
                                      ))}
                                    </ul>
                                  </div>
                                </div>
                              )}

                              {lead.unmet_requirements && lead.unmet_requirements.length > 0 && (
                                <div className="flex gap-3">
                                  <TriangleAlert className="mt-0.5 size-4 shrink-0 text-rose-400" aria-hidden />
                                  <div>
                                    <span className="block text-xs font-semibold uppercase tracking-wider text-rose-400">
                                      Unmet requirements
                                    </span>
                                    <ul className="mt-1.5 space-y-1 text-rose-300/80">
                                      {lead.unmet_requirements.map((item, i) => (
                                        <li key={i} className="flex items-start gap-2">
                                          <span
                                            className="mt-2 size-1 shrink-0 rounded-full bg-rose-400/60"
                                            aria-hidden
                                          />
                                          {item}
                                        </li>
                                      ))}
                                    </ul>
                                  </div>
                                </div>
                              )}

                              {lead.missing_information && lead.missing_information.length > 0 && (
                                <div className="flex gap-3">
                                  <Info className="mt-0.5 size-4 shrink-0 text-studio" aria-hidden />
                                  <div>
                                    <span className="block text-xs font-semibold uppercase tracking-wider text-studio">
                                      Not stated — confirm with the client
                                    </span>
                                    <ul className="mt-1.5 space-y-1 text-slate-400">
                                      {lead.missing_information.map((item, i) => (
                                        <li key={i} className="flex items-start gap-2">
                                          <span
                                            className="mt-2 size-1 shrink-0 rounded-full bg-amber-400/60"
                                            aria-hidden
                                          />
                                          {item}
                                        </li>
                                      ))}
                                    </ul>
                                  </div>
                                </div>
                              )}

                              {!lead.reasoning &&
                                !lead.relevant_portfolio?.length &&
                                !lead.unmet_requirements?.length &&
                                !lead.missing_information?.length && (
                                  <p className="text-slate-400">
                                    No detailed reasoning was stored for this evaluation.
                                  </p>
                                )}
                            </div>
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </motion.article>
                  );
                })}
              </AnimatePresence>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
