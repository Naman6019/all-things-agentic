"use client";

import {
  BriefcaseBusiness,
  Check,
  CheckCircle2,
  CircleAlert,
  Edit3,
  ExternalLink,
  FileText,
  Inbox,
  LogOut,
  MapPin,
  Plus,
  Search,
  Sliders,
  Sparkles,
  X,
  ChevronRight,
  ChevronDown
} from "lucide-react";
import Link from "next/link";
import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { useAuth } from "@/components/auth-provider";
import type { Job, JobsResponse, JobStatus } from "@/lib/types";
import { cn } from "@/lib/utils";

type SortOption = "newest" | "position" | "location" | "match";

const matchRank: Record<NonNullable<Job["match_strength"]>, number> = {
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

function matchBadge(job: Job) {
  if (job.status === "skipped") {
    return {
      label: "Unmet Criteria",
      className: "border-rose-500/30 bg-rose-950/40 text-rose-300",
    };
  }
  if (job.status === "applied") {
    return {
      label: "Application Sent",
      className: "border-slate-500/30 bg-slate-800/40 text-slate-300",
    };
  }
  if (job.match_strength === "strong") {
    return {
      label: "Strong Fit",
      className: "border-emerald-500/40 bg-emerald-950/50 text-emerald-300 shadow-[0_0_12px_rgba(16,185,129,0.2)]",
    };
  }
  if (job.match_strength === "medium") {
    return {
      label: "Medium Fit",
      className: "border-amber-500/30 bg-amber-950/40 text-amber-300",
    };
  }
  return {
    label: "Low Fit",
    className: "border-slate-600/30 bg-slate-900/40 text-slate-400",
  };
}

function jobTimestamp(job: Job) {
  const value = job.posted_at || job.materials_created_at || job.evaluated_at;
  const timestamp = value ? new Date(value).getTime() : 0;
  return Number.isNaN(timestamp) ? 0 : timestamp;
}

function sortJobs(jobs: Job[], sort: SortOption) {
  return [...jobs].sort((left, right) => {
    if (sort === "position") return (left.title || "").localeCompare(right.title || "");
    if (sort === "location") return (left.location || "Unspecified").localeCompare(right.location || "Unspecified");
    if (sort === "match") {
      const strength = (matchRank[left.match_strength || "unscored"] - matchRank[right.match_strength || "unscored"]);
      return strength || jobTimestamp(right) - jobTimestamp(left);
    }
    return jobTimestamp(right) - jobTimestamp(left);
  });
}

export function CareerDashboard() {
  const { user, logout } = useAuth();
  const [activeTab, setActiveTab] = useState<JobStatus>("matched");
  const [jobs, setJobs] = useState<Job[]>([]);
  const [counts, setCounts] = useState<{ matched: number; applied: number; skipped: number }>({
    matched: 0,
    applied: 0,
    skipped: 0,
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState<SortOption>("newest");
  const [expandedJobId, setExpandedJobId] = useState<string | null>(null);
  const [quickAddOpen, setQuickAddOpen] = useState(false);
  const [quickAddUrl, setQuickAddUrl] = useState("");
  const [quickAddText, setQuickAddText] = useState("");
  const [quickAddBusy, setQuickAddBusy] = useState(false);
  const [quickAddResult, setQuickAddResult] = useState<any>(null);

  const fetchJobs = useCallback(async (tab: JobStatus) => {
    setLoading(true);
    setError("");
    try {
      const res = await fetch(`/api/jobs?status=${tab}`);
      if (!res.ok) throw new Error(await responseError(res));
      const data = (await res.json()) as JobsResponse;
      const loadedJobs = data.jobs || [];
      setJobs(loadedJobs);
      setCounts((prev) => ({
        ...prev,
        [tab]: loadedJobs.length,
      }));
    } catch (err: any) {
      setError(err.message || "Failed to load opportunities.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchJobs(activeTab);
  }, [activeTab, fetchJobs]);

  async function updateStatus(jobId: string, status: JobStatus) {
    try {
      const res = await fetch("/api/applications/status", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ job_id: jobId, status }),
      });
      if (!res.ok) throw new Error(await responseError(res));
      setJobs((prev) => prev.filter((j) => j.job_id !== jobId));
      setCounts((prev) => ({
        ...prev,
        [activeTab]: Math.max(0, prev[activeTab] - 1),
        [status]: prev[status] + 1,
      }));
    } catch (err: any) {
      alert(`Could not update status: ${err.message}`);
    }
  }

  async function handleQuickAdd(e: FormEvent) {
    e.preventDefault();
    setQuickAddBusy(true);
    setQuickAddResult(null);
    try {
      const res = await fetch("/api/quick-add", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ url: quickAddUrl, text: quickAddText }),
      });
      const data = await res.json();
      setQuickAddResult(data);
      if (data.match) {
        void fetchJobs(activeTab);
      }
    } catch (err: any) {
      setQuickAddResult({ error: err.message || "Evaluation request failed." });
    } finally {
      setQuickAddBusy(false);
    }
  }

  const displayedJobs = useMemo(() => {
    let list = jobs;
    if (search.trim()) {
      const term = search.toLowerCase();
      list = list.filter(
        (j) =>
          j.title?.toLowerCase().includes(term) ||
          j.company?.toLowerCase().includes(term) ||
          j.location?.toLowerCase().includes(term)
      );
    }
    return sortJobs(list, sort);
  }, [jobs, search, sort]);

  return (
    <div className="relative min-h-dvh overflow-x-hidden bg-[#080c0e] text-slate-100">
      {/* Background Ambient Glows */}
      <div className="ambient-glow-careers" />

      {/* Top Navbar */}
      <header className="sticky top-0 z-40 border-b border-white/5 bg-[#080c0e]/85 backdrop-blur-xl">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
          <div className="flex items-center gap-4">
            <Link href="/" className="flex items-center gap-2.5 transition hover:opacity-80">
              <div className="grid size-8 place-items-center rounded-xl bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
                <Sparkles className="size-4" />
              </div>
              <span className="font-display text-lg font-bold tracking-tight text-white">TalentOS</span>
            </Link>
            
            <div className="hidden items-center gap-1 rounded-xl border border-white/10 bg-white/5 p-1 sm:flex">
              <Link
                href="/jobs"
                className="flex items-center gap-1.5 rounded-lg bg-emerald-500/20 px-3 py-1 text-xs font-semibold text-emerald-300"
              >
                <Search className="size-3.5" />
                <span>Careers</span>
              </Link>
              <Link
                href="/freelance"
                className="flex items-center gap-1.5 rounded-lg px-3 py-1 text-xs font-medium text-slate-400 transition hover:text-white"
              >
                <BriefcaseBusiness className="size-3.5" />
                <span>Studio</span>
              </Link>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={() => setQuickAddOpen(true)}
              className="flex items-center gap-1.5 rounded-xl border border-emerald-500/30 bg-emerald-950/40 px-3 py-1.5 text-xs font-semibold text-emerald-300 transition hover:bg-emerald-900/50"
            >
              <Plus className="size-3.5" />
              <span className="hidden sm:inline">Evaluate Job</span>
            </button>

            <Link
              href="/settings"
              className="flex items-center gap-1.5 rounded-xl border border-white/10 bg-white/5 p-2 text-xs font-medium text-slate-300 transition hover:bg-white/10 hover:text-white"
              title="Career Search Preferences"
            >
              <Sliders className="size-4" />
            </Link>

            <div className="h-4 w-px bg-white/10" />

            <button
              type="button"
              onClick={() => void logout()}
              className="rounded-lg p-2 text-slate-400 transition hover:bg-white/5 hover:text-white"
              title="Sign out"
            >
              <LogOut className="size-4" />
            </button>
          </div>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="relative z-10 mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        {/* Page Title & Stats Overview */}
        <div className="flex flex-col gap-6 md:flex-row md:items-end md:justify-between">
          <div>
            <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-emerald-400">
              <span>TalentOS // Careers</span>
              <span className="size-1 rounded-full bg-emerald-400" />
              <span>Full-Time Pipeline</span>
            </div>
            <h1 className="font-display mt-1 text-3xl font-extrabold text-white sm:text-4xl">
              Opportunity Intelligence
            </h1>
            <p className="mt-1 text-sm text-slate-400">
              Every job evaluated by Gemini 3.6 Flash against your hard criteria with tailored application drafts.
            </p>
          </div>

          {/* Quick Metrics Bar */}
          <div className="flex flex-wrap items-center gap-3">
            <div className="glass-panel flex items-center gap-4 rounded-2xl px-5 py-3 border border-white/5">
              <div className="text-left">
                <span className="block text-[10px] font-semibold uppercase tracking-wider text-slate-400">To Apply</span>
                <span className="font-display text-lg font-bold text-emerald-400">{counts.matched}</span>
              </div>
              <div className="h-6 w-px bg-white/10" />
              <div className="text-left">
                <span className="block text-[10px] font-semibold uppercase tracking-wider text-slate-400">Applied</span>
                <span className="font-display text-lg font-bold text-slate-300">{counts.applied}</span>
              </div>
              <div className="h-6 w-px bg-white/10" />
              <div className="text-left">
                <span className="block text-[10px] font-semibold uppercase tracking-wider text-slate-400">Skipped</span>
                <span className="font-display text-lg font-bold text-slate-400">{counts.skipped}</span>
              </div>
            </div>
          </div>
        </div>

        {/* Tab Selection & Search Filters */}
        <div className="mt-8 flex flex-col gap-4 border-b border-white/5 pb-4 sm:flex-row sm:items-center sm:justify-between">
          {/* Navigation Tabs */}
          <div className="flex items-center gap-2">
            {tabs.map((tab) => {
              const Icon = tab.icon;
              const count = counts[tab.value];
              const isActive = activeTab === tab.value;
              return (
                <button
                  key={tab.value}
                  onClick={() => setActiveTab(tab.value)}
                  className={cn(
                    "flex items-center gap-2 rounded-xl px-4 py-2 text-xs font-semibold transition",
                    isActive
                      ? "bg-emerald-500 text-[#080c0e] shadow-[0_0_15px_rgba(16,185,129,0.3)]"
                      : "border border-white/5 bg-white/5 text-slate-400 hover:bg-white/10 hover:text-white"
                  )}
                >
                  <Icon className="size-3.5" />
                  <span>{tab.label}</span>
                  <span
                    className={cn(
                      "rounded-full px-1.5 py-0.5 text-[10px] font-mono font-bold",
                      isActive ? "bg-black/20 text-[#080c0e]" : "bg-white/10 text-slate-400"
                    )}
                  >
                    {count}
                  </span>
                </button>
              );
            })}
          </div>

          {/* Search & Sort Controls */}
          <div className="flex items-center gap-3">
            <div className="relative flex-1 sm:w-64">
              <Search className="absolute top-2.5 left-3 size-3.5 text-slate-500" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search position or company..."
                className="h-9 w-full rounded-xl border border-white/10 bg-[#0d1317] pl-8 pr-3 text-xs text-white placeholder:text-slate-600 focus:border-emerald-500/50 focus:outline-none"
              />
            </div>

            <select
              value={sort}
              onChange={(e) => setSort(e.target.value as SortOption)}
              className="h-9 rounded-xl border border-white/10 bg-[#0d1317] px-3 text-xs text-slate-300 focus:border-emerald-500/50 focus:outline-none"
            >
              <option value="newest">Newest First</option>
              <option value="match">Highest Fit</option>
              <option value="position">Job Title</option>
              <option value="location">Location</option>
            </select>
          </div>
        </div>

        {/* Opportunity Card Stream */}
        {loading ? (
          <div className="flex min-h-[300px] items-center justify-center">
            <div className="flex items-center gap-3 text-sm text-slate-400">
              <span className="size-4 animate-spin rounded-full border-2 border-emerald-500/30 border-t-emerald-400" />
              <span>Fetching evaluated opportunities from Firestore…</span>
            </div>
          </div>
        ) : error ? (
          <div className="rounded-2xl border border-rose-500/30 bg-rose-950/30 p-6 text-center">
            <CircleAlert className="mx-auto size-8 text-rose-400" />
            <h3 className="font-display mt-2 text-base font-bold text-white">Could not load opportunities</h3>
            <p className="mt-1 text-xs text-rose-300">{error}</p>
            <button
              onClick={() => void fetchJobs(activeTab)}
              className="mt-4 rounded-xl border border-white/10 bg-white/5 px-4 py-2 text-xs font-semibold text-white hover:bg-white/10"
            >
              Retry Connection
            </button>
          </div>
        ) : displayedJobs.length === 0 ? (
          <div className="glass-panel flex min-h-[260px] flex-col items-center justify-center rounded-3xl p-8 text-center border border-white/5">
            <div className="grid size-12 place-items-center rounded-2xl bg-white/5 text-slate-500">
              <Inbox className="size-6" />
            </div>
            <h3 className="font-display mt-4 text-base font-bold text-white">No opportunities in this view</h3>
            <p className="mt-1 max-w-sm text-xs text-slate-400">
              {search ? "No listings matched your search query." : "The pipeline continuously scans ATS boards on a 6-hourly cadence."}
            </p>
            <button
              onClick={() => setQuickAddOpen(true)}
              className="mt-5 flex items-center gap-2 rounded-xl bg-emerald-500 px-4 py-2 text-xs font-semibold text-[#080c0e] hover:bg-emerald-400"
            >
              <Plus className="size-3.5" />
              <span>Manually Evaluate a Posting</span>
            </button>
          </div>
        ) : (
          <div className="mt-6 space-y-4">
            {displayedJobs.map((job) => {
              const badge = matchBadge(job);
              const isExpanded = expandedJobId === job.job_id;
              return (
                <div
                  key={job.job_id}
                  className="glass-card rounded-2xl p-6 border border-white/10 transition-all hover:border-white/20"
                >
                  <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                    <div className="space-y-1.5">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className={cn("rounded-full border px-2.5 py-0.5 text-[11px] font-semibold tracking-wide", badge.className)}>
                          {badge.label}
                        </span>
                        <span className="rounded-md border border-white/5 bg-white/5 px-2 py-0.5 text-[11px] text-slate-400 font-mono">
                          {sourceName(job.source)}
                        </span>
                        {job.remote && (
                          <span className="rounded-md border border-teal-500/20 bg-teal-950/30 px-2 py-0.5 text-[11px] text-teal-300">
                            Remote
                          </span>
                        )}
                        <span className="text-xs text-slate-500">{formatDate(job.posted_at || job.evaluated_at)}</span>
                      </div>

                      <h3 className="font-display text-xl font-bold text-white">{job.title}</h3>

                      <div className="flex flex-wrap items-center gap-4 text-xs text-slate-400">
                        <span className="font-semibold text-slate-200">{job.company || "Employer"}</span>
                        {job.location && (
                          <span className="flex items-center gap-1">
                            <MapPin className="size-3 text-slate-500" />
                            {job.location}
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Action Bar */}
                    <div className="flex flex-wrap items-center gap-2 sm:self-start">
                      {job.url && (
                        <a
                          href={job.url}
                          target="_blank"
                          rel="noreferrer"
                          className="flex items-center gap-1 rounded-xl border border-white/10 bg-white/5 p-2 text-xs font-medium text-slate-300 transition hover:bg-white/10 hover:text-white"
                          title="Original ATS Posting"
                        >
                          <ExternalLink className="size-4" />
                        </a>
                      )}

                      {activeTab !== "skipped" && (
                        <Link
                          href={`/materials?job_id=${encodeURIComponent(job.job_id)}`}
                          className="flex items-center gap-1.5 rounded-xl bg-emerald-500 px-3.5 py-2 text-xs font-semibold text-[#080c0e] shadow-[0_0_15px_rgba(16,185,129,0.2)] transition hover:bg-emerald-400 active:scale-[0.98]"
                        >
                          <FileText className="size-3.5" />
                          <span>Review Materials</span>
                        </Link>
                      )}

                      {activeTab === "matched" && (
                        <button
                          onClick={() => void updateStatus(job.job_id, "applied")}
                          className="flex items-center gap-1 rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-xs font-medium text-slate-300 hover:bg-white/10 hover:text-white"
                        >
                          <Check className="size-3.5 text-emerald-400" />
                          <span>Mark Applied</span>
                        </button>
                      )}

                      {activeTab === "applied" && (
                        <button
                          onClick={() => void updateStatus(job.job_id, "matched")}
                          className="rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-xs font-medium text-slate-400 hover:text-white"
                        >
                          Move to Inbox
                        </button>
                      )}

                      {activeTab !== "skipped" && (
                        <button
                          onClick={() => void updateStatus(job.job_id, "skipped")}
                          className="rounded-xl p-2 text-slate-500 hover:bg-rose-500/10 hover:text-rose-400"
                          title="Skip opportunity"
                        >
                          <X className="size-4" />
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Expandable Reasoning Drawer */}
                  <div className="mt-4 border-t border-white/5 pt-3">
                    <button
                      type="button"
                      onClick={() => setExpandedJobId(isExpanded ? null : job.job_id)}
                      className="flex items-center gap-1.5 text-xs font-medium text-slate-400 hover:text-white transition"
                    >
                      <ChevronRight className={cn("size-3.5 transition-transform", isExpanded && "rotate-90")} />
                      <span>{isExpanded ? "Hide Gemini Fit Analysis" : "View Gemini 3-State Fit Reasoning"}</span>
                    </button>

                    {isExpanded && (
                      <div className="mt-3 space-y-3 rounded-xl border border-white/5 bg-[#0a0f12] p-4 text-xs leading-relaxed">
                        {job.reasoning && (
                          <div>
                            <span className="font-semibold text-slate-300">Why it matches:</span>
                            <p className="mt-0.5 text-slate-400">{job.reasoning}</p>
                          </div>
                        )}

                        {job.unmet_requirements && job.unmet_requirements.length > 0 && (
                          <div>
                            <span className="font-semibold text-rose-400">Unmet Requirements:</span>
                            <ul className="mt-1 list-inside list-disc space-y-0.5 text-rose-300/90">
                              {job.unmet_requirements.map((req, i) => (
                                <li key={i}>{req}</li>
                              ))}
                            </ul>
                          </div>
                        )}

                        {job.missing_information && job.missing_information.length > 0 && (
                          <div>
                            <span className="font-semibold text-amber-400">Items Not Stated (Verify with employer):</span>
                            <ul className="mt-1 list-inside list-disc space-y-0.5 text-slate-400">
                              {job.missing_information.map((item, i) => (
                                <li key={i}>{item}</li>
                              ))}
                            </ul>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </main>

      {/* Quick Add Modal */}
      {quickAddOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-md">
          <div className="glass-panel w-full max-w-xl rounded-3xl p-6 border border-white/10 shadow-2xl">
            <div className="flex items-center justify-between border-b border-white/10 pb-4">
              <h3 className="font-display text-base font-bold text-white">Evaluate Job with Gemini</h3>
              <button onClick={() => { setQuickAddOpen(false); setQuickAddResult(null); }} className="text-slate-400 hover:text-white">✕</button>
            </div>
            <form onSubmit={handleQuickAdd} className="mt-4 space-y-4">
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-300">ATS Job Posting URL</label>
                <input
                  type="url"
                  value={quickAddUrl}
                  onChange={(e) => setQuickAddUrl(e.target.value)}
                  placeholder="https://jobs.lever.co/..."
                  className="h-10 w-full rounded-xl border border-white/10 bg-[#0d1317] px-3 text-xs text-white placeholder:text-slate-600 focus:border-emerald-500/50 focus:outline-none"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-300">Or Paste Full Job Description</label>
                <textarea
                  rows={4}
                  value={quickAddText}
                  onChange={(e) => setQuickAddText(e.target.value)}
                  placeholder="Paste job posting text..."
                  className="w-full rounded-xl border border-white/10 bg-[#0d1317] p-3 text-xs text-white placeholder:text-slate-600 focus:border-emerald-500/50 focus:outline-none"
                />
              </div>
              {quickAddResult && (
                <div className="rounded-xl border border-white/10 bg-[#0d1317] p-4 text-xs leading-relaxed">
                  {quickAddResult.error ? (
                    <p className="text-rose-400">{quickAddResult.error}</p>
                  ) : (
                    <div>
                      <span className={quickAddResult.match ? "text-emerald-400 font-bold" : "text-amber-400 font-bold"}>
                        {quickAddResult.match ? "✓ Match Found & Materials Drafted" : "✗ Skipped: Criteria Unmet"}
                      </span>
                      <p className="mt-1 text-slate-300">{quickAddResult.reasoning}</p>
                    </div>
                  )}
                </div>
              )}
              <div className="flex justify-end gap-2 pt-2">
                <button type="button" onClick={() => { setQuickAddOpen(false); setQuickAddResult(null); }} className="rounded-xl px-4 py-2 text-xs text-slate-400 hover:text-white">Close</button>
                <button type="submit" disabled={quickAddBusy || (!quickAddUrl && !quickAddText)} className="rounded-xl bg-emerald-500 px-4 py-2 text-xs font-semibold text-[#080c0e] hover:bg-emerald-400 disabled:opacity-50">
                  {quickAddBusy ? "Evaluating…" : "Evaluate Posting"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
