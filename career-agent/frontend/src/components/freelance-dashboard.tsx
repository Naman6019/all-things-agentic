"use client";

import {
  ArrowUpRight,
  BriefcaseBusiness,
  Check,
  CheckCircle2,
  ChevronDown,
  CircleAlert,
  Clock3,
  FileText,
  Inbox,
  Link2,
  LogOut,
  Search,
  Send,
  Settings,
  ShieldCheck,
  Sparkles,
  UserRound,
  X,
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
  { value: "matched", label: "To pitch", icon: Inbox },
  { value: "sent", label: "Sent", icon: CheckCircle2 },
  { value: "skipped", label: "Skipped", icon: X },
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
  if (!source) return "Freelance board";
  const names: Record<string, string> = { rforhire: "r/forhire", wwr: "WWR", contra: "Contra", peerlist: "Peerlist" };
  return names[source] || source.charAt(0).toUpperCase() + source.slice(1);
}

function matchLabel(lead: Lead) {
  if (lead.status === "skipped") return "Not selected";
  if (lead.status === "sent") return "Pitch sent";
  if (lead.match_strength === "strong") return "Strong match";
  if (lead.match_strength === "medium") return "Medium match";
  if (lead.match_strength === "weak") return "Weak match";
  return "Match";
}

function matchBadgeClass(lead: Lead) {
  if (lead.status === "skipped") return "bg-[#f4eceb] text-[#8b423a]";
  if (lead.status === "sent") return "bg-[#eef3f1] text-[#53635e]";
  if (lead.match_strength === "medium") return "bg-[#f7f1e5] text-[#805f20]";
  if (lead.match_strength === "weak") return "bg-[#f3eeee] text-[#76504b]";
  return "bg-[#e8f3ef] text-[#0f6b55]";
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

function DashboardSkeleton() {
  return (
    <div className="space-y-5" aria-label="Loading leads">
      {[0, 1, 2].map((item) => (
        <div key={item} className="rounded-2xl border border-[#dce4e1] bg-white p-6">
          <div className="h-5 w-2/5 rounded bg-[#e9eeec]" />
          <div className="mt-3 h-4 w-1/4 rounded bg-[#eef2f1]" />
          <div className="mt-7 h-4 w-full rounded bg-[#eef2f1]" />
          <div className="mt-2 h-4 w-4/5 rounded bg-[#eef2f1]" />
        </div>
      ))}
    </div>
  );
}

function Metric({ label, value, detail, icon: Icon }: { label: string; value: number; detail: string; icon: typeof Inbox }) {
  return (
    <div className="rounded-2xl border border-[#dce4e1] bg-white p-5 shadow-sm">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-sm font-medium text-[#67756f]">{label}</p>
          <p className="mt-2 text-3xl font-semibold tabular-nums text-[#17211e]">{value}</p>
        </div>
        <div className="grid size-10 place-items-center rounded-xl bg-[#f4eceb] text-[#8b423a]">
          <Icon className="size-5" />
        </div>
      </div>
      <p className="mt-3 text-xs text-[#7a8782]">{detail}</p>
    </div>
  );
}

function LeadCard({ lead, onSent, busy }: { lead: Lead; onSent: (lead: Lead) => void; busy: boolean }) {
  const missing = lead.missing_information ?? [];
  const unmet = lead.unmet_requirements ?? [];
  const isSkipped = lead.status === "skipped";
  const effectivePitch = lead.edited_pitch_message ?? lead.pitch_message ?? "";

  return (
    <article className="rounded-2xl border border-[#dce4e1] bg-white p-5 shadow-sm sm:p-6">
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-start">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className={cn("rounded-full px-2.5 py-1 text-xs font-semibold", matchBadgeClass(lead))}>
              {matchLabel(lead)}
            </span>
            <span className="text-xs text-[#7a8782]">{lead.posted_at ? `Posted ${formatDate(lead.posted_at)}` : formatDate(lead.materials_created_at || lead.evaluated_at)}</span>
          </div>
          <h3 className="mt-3 text-balance text-xl font-semibold text-[#17211e]">{lead.title || "Untitled gig"}</h3>
          <p className="mt-1 text-pretty font-medium text-[#53635e]">{lead.client || "Client not listed"}</p>
        </div>
        {lead.url && (
          <a
            href={lead.url}
            target="_blank"
            rel="noreferrer"
            className="inline-flex h-10 shrink-0 items-center justify-center gap-2 rounded-xl border border-[#cfd9d5] bg-white px-4 text-sm font-semibold text-[#25312d] hover:bg-[#f7f9f8]"
          >
            View lead <ArrowUpRight className="size-4" />
          </a>
        )}
      </div>

      <div className="mt-5 flex flex-wrap gap-2 text-xs text-[#5e6d67]">
        {lead.budget && <span className="rounded-lg bg-[#f2f5f4] px-2.5 py-1.5">Budget: {lead.budget}</span>}
        {lead.timeline && <span className="rounded-lg bg-[#f2f5f4] px-2.5 py-1.5">Timeline: {lead.timeline}</span>}
        {lead.source && <span className="inline-flex items-center gap-1.5 rounded-lg bg-[#f2f5f4] px-2.5 py-1.5"><Link2 className="size-3.5" />{sourceName(lead.source)}</span>}
        {lead.suggested_rate && <span className="rounded-lg bg-[#e8f3ef] px-2.5 py-1.5 font-semibold text-[#0f6b55]">Rate: {lead.suggested_rate}</span>}
      </div>

      {lead.reasoning && (
        <div className="mt-5 border-l-2 border-[#77ad9d] pl-4">
          <p className="text-xs font-semibold text-[#0f6b55]">WHY THIS {isSkipped ? "WAS SKIPPED" : "MATCHES"}</p>
          <p className="mt-1 text-pretty text-sm leading-6 text-[#42504b]">{lead.reasoning}</p>
        </div>
      )}

      {(missing.length > 0 || unmet.length > 0) && (
        <details className="group mt-5 rounded-xl border border-[#e0e6e4] bg-[#fafbfb]">
          <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-3 text-sm font-medium text-[#42504b]">
            <span className="inline-flex items-center gap-2"><CircleAlert className="size-4 text-[#9b7129]" />{isSkipped ? "Requirements to review" : "Information to clarify"}</span>
            <ChevronDown className="size-4 group-open:rotate-180" />
          </summary>
          <ul className="space-y-2 border-t border-[#e0e6e4] px-4 py-3 text-sm leading-6 text-[#5e6d67]">
            {[...unmet, ...missing].map((item) => <li key={item} className="flex gap-2"><span aria-hidden="true">•</span><span>{item}</span></li>)}
          </ul>
        </details>
      )}

      {!isSkipped && effectivePitch && (
        <div className="mt-5 flex flex-wrap items-center gap-2 border-t border-[#e6ebe9] pt-5">
          <a href={`/freelance/pitch?lead_id=${encodeURIComponent(lead.lead_id)}`} target="_blank" rel="noopener noreferrer" className="inline-flex h-10 items-center gap-2 rounded-xl border border-[#cfd9d5] px-4 text-sm font-semibold text-[#42504b] hover:bg-[#f7f9f8]">
            <FileText className="size-4" /> View pitch {lead.pitch_edited_at && <span className="rounded-full bg-[#e8f3ef] px-2 py-0.5 text-xs text-[#0f6b55]">Edited</span>}
          </a>
          {lead.contact_method && (
            <span className="inline-flex items-center gap-1.5 text-xs text-[#7a8782]">
              <Send className="size-3.5" /> Send via: {lead.contact_method}
            </span>
          )}
          {lead.status !== "sent" && (
            <button disabled={busy} type="button" onClick={() => onSent(lead)} className="inline-flex h-10 items-center gap-2 rounded-xl bg-[#8b423a] px-4 text-sm font-semibold text-white hover:bg-[#7a3830] disabled:opacity-60">
              <Check className="size-4" /> Mark sent
            </button>
          )}
        </div>
      )}
    </article>
  );
}

export function FreelanceDashboard() {
  const { user, logout } = useAuth();
  const [active, setActive] = useState("matched");
  const [datasets, setDatasets] = useState<Record<string, Lead[]>>({ matched: [], sent: [], skipped: [] });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState<SortOption>("newest");
  const [busyLead, setBusyLead] = useState("");
  const [notice, setNotice] = useState("");

  const request = useCallback(async (path: string, init: RequestInit = {}) => {
    if (!user) throw new Error("Sign in is required.");
    const token = await user.getIdToken();
    const headers = new Headers(init.headers);
    headers.set("authorization", `Bearer ${token}`);
    return fetch(path, { ...init, headers });
  }, [user]);

  const load = useCallback(async () => {
    setLoading(true); setError("");
    try {
      const responses = await Promise.all(tabs.map(({ value }) => request(`/api/leads?status=${value}`)));
      const firstFailure = responses.find((response) => !response.ok);
      if (firstFailure) throw new Error(await responseError(firstFailure));
      const data = (await Promise.all(responses.map((response) => response.json()))) as LeadsResponse[];
      setDatasets({ matched: data[0].leads, sent: data[1].leads, skipped: data[2].leads });
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not load your freelance leads.");
    } finally {
      setLoading(false);
    }
  }, [request]);

  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  const visibleLeads = useMemo(() => {
    const query = search.trim().toLowerCase();
    const filtered = query
      ? datasets[active].filter((lead) =>
          `${lead.title} ${lead.client} ${lead.budget || ""}`.toLowerCase().includes(query),
        )
      : datasets[active];
    return sortLeads(filtered, sort);
  }, [active, datasets, search, sort]);

  async function markSent(lead: Lead) {
    setBusyLead(lead.lead_id); setError("");
    try {
      const response = await request("/api/leads/status", { method: "PUT", headers: { "content-type": "application/x-www-form-urlencoded" }, body: `lead_id=${encodeURIComponent(lead.lead_id)}&status=sent` });
      if (!response.ok) throw new Error(await responseError(response));
      setDatasets((current) => ({ ...current, matched: current.matched.filter((item) => item.lead_id !== lead.lead_id), sent: [{ ...lead, status: "sent" }, ...current.sent] }));
      setNotice("Pitch moved to Sent.");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not update this lead.");
    } finally {
      setBusyLead("");
    }
  }

  const firstName = user?.displayName?.split(" ")[0] || "there";

  return (
    <div className="min-h-dvh bg-[#f5f7f7]">
      <header className="border-b border-[#dce4e1] bg-white">
        <div className="mx-auto flex h-16 max-w-[1440px] items-center justify-between px-4 sm:px-6 lg:px-8">
          <div className="flex items-center gap-3">
            <Link href="/" className="grid size-9 place-items-center rounded-xl bg-[#153b32] text-white hover:bg-[#1a4a3e]">
              <BriefcaseBusiness className="size-4" />
            </Link>
            <span className="font-semibold text-[#17211e]">TalentOS // Studio</span>
            <span className="hidden rounded-full bg-[#eef3f1] px-2.5 py-1 text-xs font-medium text-[#53635e] sm:inline">Private beta</span>
          </div>
          <div className="flex items-center gap-2 sm:gap-4">
            <Link href="/freelance/settings" className="inline-flex h-9 items-center gap-2 rounded-lg px-2.5 text-sm font-semibold text-[#53635e] hover:bg-[#f0f3f2] hover:text-[#25312d]">
              <Settings className="size-4" /><span className="hidden sm:inline">Freelance settings</span>
            </Link>
            <div className="hidden text-right sm:block"><p className="text-sm font-medium text-[#25312d]">{user?.displayName || user?.email}</p><p className="text-xs text-[#7a8782]">Human reviewer</p></div>
            <div className="grid size-9 place-items-center rounded-full bg-[#f4eceb] text-[#8b423a]"><UserRound className="size-4" /></div>
            <button type="button" aria-label="Sign out" onClick={() => void logout()} className="grid size-9 place-items-center rounded-lg text-[#64726d] hover:bg-[#f0f3f2] hover:text-[#25312d]"><LogOut className="size-4" /></button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-[1440px] px-4 py-7 sm:px-6 lg:px-8 lg:py-10">
        <div className="flex flex-col justify-between gap-5 md:flex-row md:items-end">
          <div>
            <p className="text-sm font-semibold text-[#8b423a]">YOUR FREELANCE WORKSPACE</p>
            <h1 className="mt-2 text-balance text-3xl font-semibold text-[#17211e] sm:text-4xl">Good to see you, {firstName}.</h1>
            <p className="mt-2 text-pretty text-[#64726d]">Review matched leads, prepare your pitch, and make the final send.</p>
          </div>
        </div>

        {notice && <div role="status" className="mt-5 flex items-center justify-between rounded-xl border border-[#bcded3] bg-[#f1faf7] px-4 py-3 text-sm text-[#0a5d49]"><span className="inline-flex items-center gap-2"><CheckCircle2 className="size-4" />{notice}</span><button aria-label="Dismiss message" onClick={() => setNotice("")}><X className="size-4" /></button></div>}

        <section aria-label="Lead summary" className="mt-7 grid gap-3 sm:grid-cols-3">
          <Metric label="Ready to pitch" value={datasets.matched.length} detail="Matched and drafted by your agent" icon={Sparkles} />
          <Metric label="Pitches sent" value={datasets.sent.length} detail="Marked sent by you" icon={CheckCircle2} />
          <Metric label="Reviewed out" value={datasets.skipped.length} detail="Kept visible with a reason" icon={ShieldCheck} />
        </section>

        <div className="mt-8 grid gap-7 lg:grid-cols-[220px_minmax(0,1fr)]">
          <aside className="lg:sticky lg:top-6 lg:self-start">
            <nav aria-label="Pitch stages" className="flex gap-2 overflow-x-auto pb-1 lg:flex-col">
              {tabs.map(({ value, label, icon: Icon }) => (
                <button key={value} type="button" onClick={() => setActive(value)} className={cn("flex h-11 shrink-0 items-center gap-3 rounded-xl px-3 text-sm font-medium lg:w-full", active === value ? "bg-[#153b32] text-white" : "text-[#53635e] hover:bg-white hover:text-[#25312d]")}><Icon className="size-4" /><span>{label}</span><span className={cn("ml-auto tabular-nums", active === value ? "text-[#c5ddd6]" : "text-[#8a9692]")}>{datasets[value]?.length ?? 0}</span></button>
              ))}
            </nav>
            <div className="mt-5 hidden rounded-xl border border-[#dce4e1] bg-white p-4 text-sm lg:block"><div className="flex items-center gap-2 font-semibold text-[#25312d]"><Clock3 className="size-4 text-[#8b423a]" /> Agent schedule</div><p className="mt-2 text-pretty leading-6 text-[#6a7772]">Sources refresh on schedule. New leads enter the next run.</p></div>
          </aside>

          <section>
            <div className="mb-5 flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
              <div><h2 className="text-balance text-xl font-semibold text-[#17211e]">{tabs.find((tab) => tab.value === active)?.label}</h2><p className="mt-1 text-sm text-[#7a8782]">{visibleLeads.length} {visibleLeads.length === 1 ? "lead" : "leads"}</p></div>
              <div className="flex flex-col gap-2 sm:flex-row">
                <label className="relative block sm:w-72"><span className="sr-only">Search leads</span><Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-[#81908a]" /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search title or client" className="h-11 w-full rounded-xl border border-[#cfd9d5] bg-white pl-10 pr-4 text-sm shadow-sm" /></label>
                <label>
                  <span className="sr-only">Sort leads</span>
                  <select value={sort} onChange={(event) => setSort(event.target.value as SortOption)} className="h-11 w-full rounded-xl border border-[#cfd9d5] bg-white px-3 text-sm font-medium text-[#42504b] shadow-sm sm:w-48">
                    <option value="newest">Newest lead</option>
                    <option value="position">Position A–Z</option>
                    <option value="budget">Budget</option>
                    <option value="match">Strongest match</option>
                  </select>
                </label>
              </div>
            </div>

            {error && <div role="alert" className="mb-5 rounded-xl border border-[#efc7c2] bg-[#fff5f3] p-4 text-sm text-[#8d362d]"><div className="flex items-start gap-3"><CircleAlert className="mt-0.5 size-4 shrink-0" /><div><p className="font-semibold">Could not load leads</p><p className="mt-1 text-pretty">{error}</p><button type="button" onClick={() => void load()} className="mt-3 font-semibold underline">Try again</button></div></div></div>}

            {loading ? <DashboardSkeleton /> : visibleLeads.length ? (
              <div className="space-y-4">{visibleLeads.map((lead) => <LeadCard key={lead.lead_id} lead={lead} onSent={markSent} busy={busyLead === lead.lead_id} />)}</div>
            ) : (
              <div className="rounded-2xl border border-dashed border-[#c9d4d0] bg-white px-6 py-16 text-center"><div className="mx-auto grid size-12 place-items-center rounded-2xl bg-[#f4eceb] text-[#8b423a]"><BriefcaseBusiness className="size-5" /></div><h3 className="mt-4 text-balance text-lg font-semibold text-[#25312d]">{search ? "No leads match your search" : active === "matched" ? "No leads to pitch yet" : `No ${active} leads yet`}</h3><p className="mx-auto mt-2 max-w-sm text-pretty text-sm leading-6 text-[#6a7772]">{search ? "Try a title, client name, or budget." : "New leads will appear after the next scheduled run."}</p>{search && <button type="button" onClick={() => setSearch("")} className="mt-4 text-sm font-semibold text-[#8b423a]">Clear search</button>}</div>
            )}
          </section>
        </div>
      </main>
    </div>
  );
}