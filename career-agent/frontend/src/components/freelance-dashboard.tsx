"use client";

import {
  BriefcaseBusiness,
  Check,
  CheckCircle2,
  ChevronRight,
  CircleAlert,
  DollarSign,
  ExternalLink,
  Inbox,
  LogOut,
  Plus,
  Search,
  Send,
  Sliders,
  Sparkles,
  User,
  X
} from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useAuth } from "@/components/auth-provider";
import type { Lead, LeadsResponse } from "@/lib/types";
import { cn } from "@/lib/utils";

type SortOption = "newest" | "position" | "budget" | "match";

const matchRank: Record<NonNullable<Lead["match_strength"]>, number> = {
  strong: 0,
  medium: 1,
  weak: 2,
  unscored: 3,
};

const tabs: { value: string; label: string; icon: typeof Inbox }[] = [
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
  if (!source) return { label: "Freelance Feed", className: "border-white/10 bg-white/5 text-slate-400" };
  const s = source.toLowerCase();
  if (s.includes("reddit") || s.includes("rforhire")) {
    return { label: "r/forhire", className: "border-orange-500/30 bg-orange-950/40 text-orange-400" };
  }
  if (s.includes("wwr") || s.includes("weworkremotely")) {
    return { label: "We Work Remotely", className: "border-amber-500/30 bg-amber-950/40 text-amber-300" };
  }
  if (s.includes("contra")) {
    return { label: "Contra Feed", className: "border-yellow-500/30 bg-yellow-950/40 text-yellow-300" };
  }
  return { label: source.toUpperCase(), className: "border-white/10 bg-white/5 text-slate-300" };
}

function matchBadge(lead: Lead) {
  if (lead.status === "skipped") {
    return { label: "Scope Mismatch", className: "border-rose-500/30 bg-rose-950/40 text-rose-300" };
  }
  if (lead.status === "sent") {
    return { label: "Pitch Sent", className: "border-slate-600/30 bg-slate-800/40 text-slate-300" };
  }
  if (lead.match_strength === "strong") {
    return { label: "High Conversion Fit", className: "border-amber-500/40 bg-amber-950/50 text-amber-300 shadow-[0_0_12px_rgba(245,158,11,0.2)]" };
  }
  if (lead.match_strength === "medium") {
    return { label: "Viable Fit", className: "border-yellow-500/30 bg-yellow-950/40 text-yellow-300" };
  }
  return { label: "Low Fit", className: "border-slate-700/30 bg-slate-900/40 text-slate-400" };
}

function leadTimestamp(lead: Lead) {
  const value = lead.posted_at || lead.materials_created_at || lead.evaluated_at;
  const timestamp = value ? new Date(value).getTime() : 0;
  return Number.isNaN(timestamp) ? 0 : timestamp;
}

function sortLeads(leads: Lead[], sort: SortOption) {
  return [...leads].sort((left, right) => {
    if (sort === "position") return (left.title || "").localeCompare(right.title || "");
    if (sort === "budget") return (left.budget || "Unspecified").localeCompare(right.budget || "Unspecified");
    if (sort === "match") {
      const strength = matchRank[left.match_strength || "unscored"] - matchRank[right.match_strength || "unscored"];
      return strength || leadTimestamp(right) - leadTimestamp(left);
    }
    return leadTimestamp(right) - leadTimestamp(left);
  });
}

export function FreelanceDashboard() {
  const { user, logout } = useAuth();
  const [activeTab, setActiveTab] = useState<string>("matched");
  const [leads, setLeads] = useState<Lead[]>([]);
  const [counts, setCounts] = useState<{ matched: number; sent: number; skipped: number }>({
    matched: 0,
    sent: 0,
    skipped: 0,
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState<SortOption>("newest");
  const [expandedLeadId, setExpandedLeadId] = useState<string | null>(null);

  const fetchLeads = useCallback(async (tab: string) => {
    setLoading(true);
    setError("");
    try {
      const res = await fetch(`/api/leads?status=${tab}`);
      if (!res.ok) throw new Error(await responseError(res));
      const data = (await res.json()) as LeadsResponse;
      const loadedLeads = data.leads || [];
      setLeads(loadedLeads);
      setCounts((prev: any) => ({
        ...prev,
        [tab]: loadedLeads.length,
      }));
    } catch (err: any) {
      setError(err.message || "Failed to load freelance leads.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchLeads(activeTab);
  }, [activeTab, fetchLeads]);

  async function updateStatus(leadId: string, status: string) {
    try {
      const res = await fetch(`/api/leads/status`, {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ lead_id: leadId, status }),
      });
      if (!res.ok) throw new Error(await responseError(res));
      setLeads((prev) => prev.filter((l) => l.lead_id !== leadId));
      setCounts((prev: any) => ({
        ...prev,
        [activeTab]: Math.max(0, (prev[activeTab] || 0) - 1),
        [status]: (prev[status] || 0) + 1,
      }));
    } catch (err: any) {
      alert(`Could not update lead status: ${err.message}`);
    }
  }

  const displayedLeads = useMemo(() => {
    let list = leads;
    if (search.trim()) {
      const term = search.toLowerCase();
      list = list.filter(
        (l) =>
          l.title?.toLowerCase().includes(term) ||
          l.client?.toLowerCase().includes(term) ||
          l.reasoning?.toLowerCase().includes(term)
      );
    }
    return sortLeads(list, sort);
  }, [leads, search, sort]);

  return (
    <div className="relative min-h-dvh overflow-x-hidden bg-[#080c0e] text-slate-100">
      {/* Amber Background Ambient Glow */}
      <div className="ambient-glow-studio" />

      {/* Top Navbar */}
      <header className="sticky top-0 z-40 border-b border-white/5 bg-[#080c0e]/85 backdrop-blur-xl">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
          <div className="flex items-center gap-4">
            <Link href="/" className="flex items-center gap-2.5 transition hover:opacity-80">
              <div className="grid size-8 place-items-center rounded-xl bg-amber-500/20 text-amber-400 border border-amber-500/30">
                <Sparkles className="size-4" />
              </div>
              <span className="font-display text-lg font-bold tracking-tight text-white">TalentOS</span>
            </Link>

            <div className="hidden items-center gap-1 rounded-xl border border-white/10 bg-white/5 p-1 sm:flex">
              <Link
                href="/jobs"
                className="flex items-center gap-1.5 rounded-lg px-3 py-1 text-xs font-medium text-slate-400 transition hover:text-white"
              >
                <Search className="size-3.5" />
                <span>Careers</span>
              </Link>
              <Link
                href="/freelance"
                className="flex items-center gap-1.5 rounded-lg bg-amber-500/20 px-3 py-1 text-xs font-semibold text-amber-300"
              >
                <BriefcaseBusiness className="size-3.5" />
                <span>Studio</span>
              </Link>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <Link
              href="/freelance/settings"
              className="flex items-center gap-1.5 rounded-xl border border-amber-500/30 bg-amber-950/40 px-3 py-1.5 text-xs font-semibold text-amber-300 transition hover:bg-amber-900/50"
            >
              <Sliders className="size-3.5" />
              <span className="hidden sm:inline">Freelance Services</span>
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
        {/* Header & Metrics */}
        <div className="flex flex-col gap-6 md:flex-row md:items-end md:justify-between">
          <div>
            <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-amber-400">
              <span>TalentOS // Studio</span>
              <span className="size-1 rounded-full bg-amber-400" />
              <span>Freelance Pipeline</span>
            </div>
            <h1 className="font-display mt-1 text-3xl font-extrabold text-white sm:text-4xl">
              Client Opportunity Feed
            </h1>
            <p className="mt-1 text-sm text-slate-400">
              Autonomous gig monitoring (r/forhire, WWR, Contra) with Gemini fit scoring & pre-drafted client pitches.
            </p>
          </div>

          {/* Quick Metrics */}
          <div className="glass-panel flex items-center gap-4 rounded-2xl px-5 py-3 border border-white/5">
            <div className="text-left">
              <span className="block text-[10px] font-semibold uppercase tracking-wider text-slate-400">To Pitch</span>
              <span className="font-display text-lg font-bold text-amber-400">{counts.matched}</span>
            </div>
            <div className="h-6 w-px bg-white/10" />
            <div className="text-left">
              <span className="block text-[10px] font-semibold uppercase tracking-wider text-slate-400">Sent Out</span>
              <span className="font-display text-lg font-bold text-slate-300">{counts.sent}</span>
            </div>
            <div className="h-6 w-px bg-white/10" />
            <div className="text-left">
              <span className="block text-[10px] font-semibold uppercase tracking-wider text-slate-400">Skipped</span>
              <span className="font-display text-lg font-bold text-slate-400">{counts.skipped}</span>
            </div>
          </div>
        </div>

        {/* Status Tabs & Filters */}
        <div className="mt-8 flex flex-col gap-4 border-b border-white/5 pb-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-2">
            {tabs.map((tab) => {
              const Icon = tab.icon;
              const count = (counts as any)[tab.value] || 0;
              const isActive = activeTab === tab.value;
              return (
                <button
                  key={tab.value}
                  onClick={() => setActiveTab(tab.value)}
                  className={cn(
                    "flex items-center gap-2 rounded-xl px-4 py-2 text-xs font-semibold transition",
                    isActive
                      ? "bg-amber-500 text-[#080c0e] shadow-[0_0_15px_rgba(245,158,11,0.3)]"
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

          <div className="flex items-center gap-3">
            <div className="relative flex-1 sm:w-64">
              <Search className="absolute top-2.5 left-3 size-3.5 text-slate-500" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search leads or client..."
                className="h-9 w-full rounded-xl border border-white/10 bg-[#0d1317] pl-8 pr-3 text-xs text-white placeholder:text-slate-600 focus:border-amber-500/50 focus:outline-none"
              />
            </div>

            <select
              value={sort}
              onChange={(e) => setSort(e.target.value as SortOption)}
              className="h-9 rounded-xl border border-white/10 bg-[#0d1317] px-3 text-xs text-slate-300 focus:border-amber-500/50 focus:outline-none"
            >
              <option value="newest">Newest First</option>
              <option value="match">Highest Fit</option>
              <option value="budget">Budget Size</option>
              <option value="position">Lead Title</option>
            </select>
          </div>
        </div>

        {/* Lead Stream */}
        {loading ? (
          <div className="flex min-h-[300px] items-center justify-center">
            <div className="flex items-center gap-3 text-sm text-slate-400">
              <span className="size-4 animate-spin rounded-full border-2 border-amber-500/30 border-t-amber-400" />
              <span>Scanning freelance feeds & Firestore leads…</span>
            </div>
          </div>
        ) : error ? (
          <div className="rounded-2xl border border-rose-500/30 bg-rose-950/30 p-6 text-center">
            <CircleAlert className="mx-auto size-8 text-rose-400" />
            <h3 className="font-display mt-2 text-base font-bold text-white">Error loading client leads</h3>
            <p className="mt-1 text-xs text-rose-300">{error}</p>
            <button
              onClick={() => void fetchLeads(activeTab)}
              className="mt-4 rounded-xl border border-white/10 bg-white/5 px-4 py-2 text-xs font-semibold text-white hover:bg-white/10"
            >
              Retry
            </button>
          </div>
        ) : displayedLeads.length === 0 ? (
          <div className="glass-panel flex min-h-[260px] flex-col items-center justify-center rounded-3xl p-8 text-center border border-white/5">
            <div className="grid size-12 place-items-center rounded-2xl bg-white/5 text-slate-500">
              <BriefcaseBusiness className="size-6" />
            </div>
            <h3 className="font-display mt-4 text-base font-bold text-white">No freelance leads in this view</h3>
            <p className="mt-1 max-w-sm text-xs text-slate-400">
              {search ? "No leads matched your search query." : "TalentOS Studio monitors r/forhire, WWR contracts, and Contra continuously."}
            </p>
          </div>
        ) : (
          <div className="mt-6 space-y-4">
            {displayedLeads.map((lead) => {
              const badge = matchBadge(lead);
              const src = sourceBadge(lead.source);
              const isExpanded = expandedLeadId === lead.lead_id;
              return (
                <div
                  key={lead.lead_id}
                  className="glass-card rounded-2xl p-6 border border-white/10 transition-all hover:border-white/20"
                >
                  <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                    <div className="space-y-1.5">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className={cn("rounded-full border px-2.5 py-0.5 text-[11px] font-semibold tracking-wide", badge.className)}>
                          {badge.label}
                        </span>
                        <span className={cn("rounded-md border px-2 py-0.5 text-[11px] font-mono", src.className)}>
                          {src.label}
                        </span>
                        {lead.budget && (
                          <span className="flex items-center gap-1 rounded-md border border-amber-500/20 bg-amber-950/30 px-2 py-0.5 text-[11px] text-amber-300 font-mono font-semibold">
                            <DollarSign className="size-3" />
                            {lead.budget}
                          </span>
                        )}
                        <span className="text-xs text-slate-500">{formatDate(lead.posted_at || lead.evaluated_at)}</span>
                      </div>

                      <h3 className="font-display text-xl font-bold text-white">{lead.title}</h3>

                      <div className="flex flex-wrap items-center gap-4 text-xs text-slate-400">
                        {lead.client && (
                          <span>Client: <strong className="text-slate-300 font-medium">{lead.client}</strong></span>
                        )}
                        {lead.contact_method && (
                          <span className="text-slate-400">Contact: <span className="text-slate-200">{lead.contact_method}</span></span>
                        )}
                      </div>
                    </div>

                    {/* Action Bar */}
                    <div className="flex flex-wrap items-center gap-2 sm:self-start">
                      {lead.url && (
                        <a
                          href={lead.url}
                          target="_blank"
                          rel="noreferrer"
                          className="flex items-center gap-1 rounded-xl border border-white/10 bg-white/5 p-2 text-xs font-medium text-slate-300 transition hover:bg-white/10 hover:text-white"
                          title="Original Gig Posting"
                        >
                          <ExternalLink className="size-4" />
                        </a>
                      )}

                      {activeTab !== "skipped" && (
                        <Link
                          href={`/freelance/pitch?lead_id=${encodeURIComponent(lead.lead_id)}`}
                          className="flex items-center gap-1.5 rounded-xl bg-amber-500 px-3.5 py-2 text-xs font-semibold text-[#080c0e] shadow-[0_0_15px_rgba(245,158,11,0.2)] transition hover:bg-amber-400 active:scale-[0.98]"
                        >
                          <Send className="size-3.5" />
                          <span>Review & Send Pitch</span>
                        </Link>
                      )}

                      {activeTab === "matched" && (
                        <button
                          onClick={() => void updateStatus(lead.lead_id, "sent")}
                          className="flex items-center gap-1 rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-xs font-medium text-slate-300 hover:bg-white/10 hover:text-white"
                        >
                          <Check className="size-3.5 text-amber-400" />
                          <span>Mark Sent</span>
                        </button>
                      )}

                      {activeTab === "sent" && (
                        <button
                          onClick={() => void updateStatus(lead.lead_id, "matched")}
                          className="rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-xs font-medium text-slate-400 hover:text-white"
                        >
                          Move to Inbox
                        </button>
                      )}

                      {activeTab !== "skipped" && (
                        <button
                          onClick={() => void updateStatus(lead.lead_id, "skipped")}
                          className="rounded-xl p-2 text-slate-500 hover:bg-rose-500/10 hover:text-rose-400"
                          title="Skip lead"
                        >
                          <X className="size-4" />
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Expandable Reasoning & Lead Details */}
                  <div className="mt-4 border-t border-white/5 pt-3">
                    <button
                      type="button"
                      onClick={() => setExpandedLeadId(isExpanded ? null : lead.lead_id)}
                      className="flex items-center gap-1.5 text-xs font-medium text-slate-400 hover:text-white transition"
                    >
                      <ChevronRight className={cn("size-3.5 transition-transform", isExpanded && "rotate-90")} />
                      <span>{isExpanded ? "Hide Details" : "View Client Request & AI Fit Reasoning"}</span>
                    </button>

                    {isExpanded && (
                      <div className="mt-3 space-y-3 rounded-xl border border-white/5 bg-[#0a0f12] p-4 text-xs leading-relaxed">
                        {lead.reasoning && (
                          <div>
                            <span className="font-semibold text-amber-300">Why this project fits:</span>
                            <p className="mt-0.5 text-slate-300">{lead.reasoning}</p>
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
    </div>
  );
}