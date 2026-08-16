"use client";

import {
  ArrowUpRight,
  BriefcaseBusiness,
  Check,
  CheckCircle2,
  ChevronDown,
  CircleAlert,
  Clipboard,
  Clock3,
  FileText,
  Inbox,
  Link2,
  LogOut,
  MapPin,
  Plus,
  Search,
  Send,
  ShieldCheck,
  Sparkles,
  UserRound,
  X,
} from "lucide-react";
import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { useAuth } from "@/components/auth-provider";
import type { Job, JobsResponse, JobStatus } from "@/lib/types";
import { cn } from "@/lib/utils";

const tabs: { value: JobStatus; label: string; icon: typeof Inbox }[] = [
  { value: "matched", label: "To apply", icon: Inbox },
  { value: "applied", label: "Applied", icon: CheckCircle2 },
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
  if (!source) return "Employer site";
  return source.charAt(0).toUpperCase() + source.slice(1);
}

function DashboardSkeleton() {
  return (
    <div className="space-y-5" aria-label="Loading jobs">
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
        <div className="grid size-10 place-items-center rounded-xl bg-[#e8f3ef] text-[#0f6b55]">
          <Icon className="size-5" />
        </div>
      </div>
      <p className="mt-3 text-xs text-[#7a8782]">{detail}</p>
    </div>
  );
}

function JobCard({ job, onApplied, onCopy, onResume, busy }: { job: Job; onApplied: (job: Job) => void; onCopy: (value: string) => void; onResume: (job: Job) => void; busy: boolean }) {
  const missing = job.missing_information ?? [];
  const unmet = job.unmet_requirements ?? [];
  const isSkipped = job.status === "skipped";

  return (
    <article className="rounded-2xl border border-[#dce4e1] bg-white p-5 shadow-sm sm:p-6">
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-start">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className={cn("rounded-full px-2.5 py-1 text-xs font-semibold", isSkipped ? "bg-[#f4eceb] text-[#8b423a]" : "bg-[#e8f3ef] text-[#0f6b55]")}>
              {isSkipped ? "Not selected" : job.status === "applied" ? "Applied" : "Strong match"}
            </span>
            <span className="text-xs text-[#7a8782]">{formatDate(job.materials_created_at || job.evaluated_at)}</span>
          </div>
          <h3 className="mt-3 text-balance text-xl font-semibold text-[#17211e]">{job.title || "Untitled role"}</h3>
          <p className="mt-1 text-pretty font-medium text-[#53635e]">{job.company || "Company not listed"}</p>
        </div>
        {job.url && (
          <a
            href={job.url}
            target="_blank"
            rel="noreferrer"
            className="inline-flex h-10 shrink-0 items-center justify-center gap-2 rounded-xl border border-[#cfd9d5] bg-white px-4 text-sm font-semibold text-[#25312d] hover:bg-[#f7f9f8]"
          >
            View posting <ArrowUpRight className="size-4" />
          </a>
        )}
      </div>

      <div className="mt-5 flex flex-wrap gap-2 text-xs text-[#5e6d67]">
        {job.location && <span className="inline-flex items-center gap-1.5 rounded-lg bg-[#f2f5f4] px-2.5 py-1.5"><MapPin className="size-3.5" />{job.location}</span>}
        {job.remote && <span className="rounded-lg bg-[#f2f5f4] px-2.5 py-1.5">Remote</span>}
        <span className="inline-flex items-center gap-1.5 rounded-lg bg-[#f2f5f4] px-2.5 py-1.5"><Link2 className="size-3.5" />{sourceName(job.source)}</span>
      </div>

      {job.reasoning && (
        <div className="mt-5 border-l-2 border-[#77ad9d] pl-4">
          <p className="text-xs font-semibold text-[#0f6b55]">WHY THIS {isSkipped ? "WAS SKIPPED" : "MATCHES"}</p>
          <p className="mt-1 text-pretty text-sm leading-6 text-[#42504b]">{job.reasoning}</p>
        </div>
      )}

      {(missing.length > 0 || unmet.length > 0) && (
        <details className="group mt-5 rounded-xl border border-[#e0e6e4] bg-[#fafbfb]">
          <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-3 text-sm font-medium text-[#42504b]">
            <span className="inline-flex items-center gap-2"><CircleAlert className="size-4 text-[#9b7129]" />{isSkipped ? "Requirements to review" : "Information to verify"}</span>
            <ChevronDown className="size-4 group-open:rotate-180" />
          </summary>
          <ul className="space-y-2 border-t border-[#e0e6e4] px-4 py-3 text-sm leading-6 text-[#5e6d67]">
            {[...unmet, ...missing].map((item) => <li key={item} className="flex gap-2"><span aria-hidden="true">•</span><span>{item}</span></li>)}
          </ul>
        </details>
      )}

      {!isSkipped && (
        <div className="mt-6 flex flex-wrap items-center gap-2 border-t border-[#e6ebe9] pt-5">
          {job.cover_letter && (
            <button type="button" onClick={() => onCopy(job.cover_letter ?? "")} className="inline-flex h-10 items-center gap-2 rounded-xl border border-[#cfd9d5] px-4 text-sm font-semibold text-[#42504b] hover:bg-[#f7f9f8]">
              <Clipboard className="size-4" /> Copy cover letter
            </button>
          )}
          {job.cover_letter && (
            <button type="button" onClick={() => onResume(job)} className="inline-flex h-10 items-center gap-2 rounded-xl border border-[#cfd9d5] px-4 text-sm font-semibold text-[#42504b] hover:bg-[#f7f9f8]">
              <FileText className="size-4" /> Tailored resume
            </button>
          )}
          {job.status !== "applied" && (
            <button disabled={busy} type="button" onClick={() => onApplied(job)} className="inline-flex h-10 items-center gap-2 rounded-xl bg-[#0f6b55] px-4 text-sm font-semibold text-white hover:bg-[#0a5947] disabled:opacity-60">
              <Check className="size-4" /> Mark applied
            </button>
          )}
          {job.contact_email && <span className="ml-auto text-xs text-[#7a8782]">Contact: {job.contact_email}</span>}
        </div>
      )}
    </article>
  );
}

function QuickAdd({ request, onQueued }: { request: (path: string, init?: RequestInit) => Promise<Response>; onQueued: () => void }) {
  const [open, setOpen] = useState(false);
  const [url, setUrl] = useState("");
  const [text, setText] = useState("");
  const [title, setTitle] = useState("");
  const [company, setCompany] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      const response = await request("/api/quick-add", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ url, text, title, company }) });
      if (!response.ok) throw new Error(await responseError(response));
      setUrl(""); setText(""); setTitle(""); setCompany(""); setOpen(false); onQueued();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not queue this job.");
    } finally {
      setBusy(false);
    }
  }

  if (!open) {
    return <button type="button" onClick={() => setOpen(true)} className="inline-flex h-11 items-center gap-2 rounded-xl bg-[#0f6b55] px-4 text-sm font-semibold text-white shadow-sm hover:bg-[#0a5947]"><Plus className="size-4" /> Add a job</button>;
  }

  return (
    <div className="rounded-2xl border border-[#bdd7cf] bg-[#f4faf8] p-5">
      <div className="flex items-start justify-between gap-4">
        <div><h3 className="font-semibold text-[#18352d]">Add a job you found</h3><p className="mt-1 text-pretty text-sm text-[#5e6d67]">Paste the job description for LinkedIn, Indeed, Glassdoor, or Wellfound.</p></div>
        <button type="button" aria-label="Close quick add" onClick={() => setOpen(false)} className="grid size-9 place-items-center rounded-lg text-[#53635e] hover:bg-[#e7f2ee]"><X className="size-4" /></button>
      </div>
      <form onSubmit={submit} className="mt-5 grid gap-4 sm:grid-cols-2">
        <label className="block"><span className="mb-1.5 block text-xs font-semibold text-[#42504b]">JOB URL</span><input value={url} onChange={(event) => setUrl(event.target.value)} type="url" placeholder="https://…" className="h-11 w-full rounded-xl border border-[#c8d8d3] bg-white px-3 text-sm" /></label>
        <label className="block"><span className="mb-1.5 block text-xs font-semibold text-[#42504b]">ROLE TITLE</span><input value={title} onChange={(event) => setTitle(event.target.value)} placeholder="Machine Learning Engineer" className="h-11 w-full rounded-xl border border-[#c8d8d3] bg-white px-3 text-sm" /></label>
        <label className="block sm:col-span-2"><span className="mb-1.5 block text-xs font-semibold text-[#42504b]">COMPANY</span><input value={company} onChange={(event) => setCompany(event.target.value)} placeholder="Company name" className="h-11 w-full rounded-xl border border-[#c8d8d3] bg-white px-3 text-sm" /></label>
        <label className="block sm:col-span-2"><span className="mb-1.5 block text-xs font-semibold text-[#42504b]">JOB DESCRIPTION</span><textarea value={text} onChange={(event) => setText(event.target.value)} rows={5} placeholder="Paste the full description here…" className="w-full resize-y rounded-xl border border-[#c8d8d3] bg-white px-3 py-3 text-sm" /></label>
        {error && <p role="alert" className="sm:col-span-2 text-sm text-[#8d362d]">{error}</p>}
        <div className="flex justify-end gap-2 sm:col-span-2"><button type="button" onClick={() => setOpen(false)} className="h-10 rounded-xl px-4 text-sm font-semibold text-[#53635e] hover:bg-[#e7f2ee]">Cancel</button><button disabled={busy} className="inline-flex h-10 items-center gap-2 rounded-xl bg-[#0f6b55] px-4 text-sm font-semibold text-white disabled:opacity-60"><Send className="size-4" />{busy ? "Queuing…" : "Queue for review"}</button></div>
      </form>
    </div>
  );
}

export function CareerDashboard() {
  const { user, logout } = useAuth();
  const [active, setActive] = useState<JobStatus>("matched");
  const [datasets, setDatasets] = useState<Record<JobStatus, Job[]>>({ matched: [], applied: [], skipped: [] });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [busyJob, setBusyJob] = useState("");
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
      const responses = await Promise.all(tabs.map(({ value }) => request(`/api/jobs?status=${value}`)));
      const firstFailure = responses.find((response) => !response.ok);
      if (firstFailure) throw new Error(await responseError(firstFailure));
      const data = (await Promise.all(responses.map((response) => response.json()))) as JobsResponse[];
      setDatasets({ matched: data[0].jobs, applied: data[1].jobs, skipped: data[2].jobs });
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not load your workspace.");
    } finally {
      setLoading(false);
    }
  }, [request]);

  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  const visibleJobs = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return datasets[active];
    return datasets[active].filter((job) => `${job.title} ${job.company} ${job.location}`.toLowerCase().includes(query));
  }, [active, datasets, search]);

  async function markApplied(job: Job) {
    setBusyJob(job.job_id); setError("");
    try {
      const response = await request("/api/applications/status", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ job_id: job.job_id, status: "applied" }) });
      if (!response.ok) throw new Error(await responseError(response));
      setDatasets((current) => ({ ...current, matched: current.matched.filter((item) => item.job_id !== job.job_id), applied: [{ ...job, status: "applied" }, ...current.applied] }));
      setNotice("Application moved to Applied.");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not update this application.");
    } finally {
      setBusyJob("");
    }
  }

  async function copy(value: string) {
    await navigator.clipboard.writeText(value);
    setNotice("Cover letter copied.");
  }

  async function openResume(job: Job) {
    setBusyJob(job.job_id); setError("");
    try {
      const response = await request(`/api/resume?job_id=${encodeURIComponent(job.job_id)}`);
      if (!response.ok) throw new Error(await responseError(response));
      const url = URL.createObjectURL(await response.blob());
      window.open(url, "_blank", "noopener,noreferrer");
      window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not open the tailored resume.");
    } finally {
      setBusyJob("");
    }
  }

  const firstName = user?.displayName?.split(" ")[0] || "there";

  return (
    <div className="min-h-dvh bg-[#f5f7f7]">
      <header className="border-b border-[#dce4e1] bg-white">
        <div className="mx-auto flex h-16 max-w-[1440px] items-center justify-between px-4 sm:px-6 lg:px-8">
          <div className="flex items-center gap-3"><div className="grid size-9 place-items-center rounded-xl bg-[#153b32] text-white"><Search className="size-4" /></div><span className="font-semibold text-[#17211e]">Career Agent</span><span className="hidden rounded-full bg-[#eef3f1] px-2.5 py-1 text-xs font-medium text-[#53635e] sm:inline">Private beta</span></div>
          <div className="flex items-center gap-2 sm:gap-4"><div className="hidden text-right sm:block"><p className="text-sm font-medium text-[#25312d]">{user?.displayName || user?.email}</p><p className="text-xs text-[#7a8782]">Human reviewer</p></div><div className="grid size-9 place-items-center rounded-full bg-[#e8f3ef] text-[#0f6b55]"><UserRound className="size-4" /></div><button type="button" aria-label="Sign out" onClick={() => void logout()} className="grid size-9 place-items-center rounded-lg text-[#64726d] hover:bg-[#f0f3f2] hover:text-[#25312d]"><LogOut className="size-4" /></button></div>
        </div>
      </header>

      <main className="mx-auto max-w-[1440px] px-4 py-7 sm:px-6 lg:px-8 lg:py-10">
        <div className="flex flex-col justify-between gap-5 md:flex-row md:items-end">
          <div><p className="text-sm font-semibold text-[#0f6b55]">YOUR JOB SEARCH WORKSPACE</p><h1 className="mt-2 text-balance text-3xl font-semibold text-[#17211e] sm:text-4xl">Good to see you, {firstName}.</h1><p className="mt-2 text-pretty text-[#64726d]">Review the evidence, prepare your application, and make the final call.</p></div>
          <QuickAdd request={request} onQueued={() => setNotice("Job queued for the next agent run.")} />
        </div>

        {notice && <div role="status" className="mt-5 flex items-center justify-between rounded-xl border border-[#bcded3] bg-[#f1faf7] px-4 py-3 text-sm text-[#0a5d49]"><span className="inline-flex items-center gap-2"><CheckCircle2 className="size-4" />{notice}</span><button aria-label="Dismiss message" onClick={() => setNotice("")}><X className="size-4" /></button></div>}

        <section aria-label="Application summary" className="mt-7 grid gap-3 sm:grid-cols-3">
          <Metric label="Ready to apply" value={datasets.matched.length} detail="Matched and drafted by your agent" icon={Sparkles} />
          <Metric label="Applications sent" value={datasets.applied.length} detail="Marked applied by you" icon={CheckCircle2} />
          <Metric label="Reviewed out" value={datasets.skipped.length} detail="Kept visible with a reason" icon={ShieldCheck} />
        </section>

        <div className="mt-8 grid gap-7 lg:grid-cols-[220px_minmax(0,1fr)]">
          <aside className="lg:sticky lg:top-6 lg:self-start">
            <nav aria-label="Application stages" className="flex gap-2 overflow-x-auto pb-1 lg:flex-col">
              {tabs.map(({ value, label, icon: Icon }) => (
                <button key={value} type="button" onClick={() => setActive(value)} className={cn("flex h-11 shrink-0 items-center gap-3 rounded-xl px-3 text-sm font-medium lg:w-full", active === value ? "bg-[#153b32] text-white" : "text-[#53635e] hover:bg-white hover:text-[#25312d]")}><Icon className="size-4" /><span>{label}</span><span className={cn("ml-auto tabular-nums", active === value ? "text-[#c5ddd6]" : "text-[#8a9692]")}>{datasets[value].length}</span></button>
              ))}
            </nav>
            <div className="mt-5 hidden rounded-xl border border-[#dce4e1] bg-white p-4 text-sm lg:block"><div className="flex items-center gap-2 font-semibold text-[#25312d]"><Clock3 className="size-4 text-[#0f6b55]" /> Agent schedule</div><p className="mt-2 text-pretty leading-6 text-[#6a7772]">Sources refresh every 12 hours. New quick-add jobs enter the next run.</p></div>
          </aside>

          <section>
            <div className="mb-5 flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
              <div><h2 className="text-balance text-xl font-semibold text-[#17211e]">{tabs.find((tab) => tab.value === active)?.label}</h2><p className="mt-1 text-sm text-[#7a8782]">{visibleJobs.length} {visibleJobs.length === 1 ? "role" : "roles"}</p></div>
              <label className="relative block sm:w-72"><span className="sr-only">Search jobs</span><Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-[#81908a]" /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search title or company" className="h-11 w-full rounded-xl border border-[#cfd9d5] bg-white pl-10 pr-4 text-sm shadow-sm" /></label>
            </div>

            {error && <div role="alert" className="mb-5 rounded-xl border border-[#efc7c2] bg-[#fff5f3] p-4 text-sm text-[#8d362d]"><div className="flex items-start gap-3"><CircleAlert className="mt-0.5 size-4 shrink-0" /><div><p className="font-semibold">Could not load the workspace</p><p className="mt-1 text-pretty">{error}</p><button type="button" onClick={() => void load()} className="mt-3 font-semibold underline">Try again</button></div></div></div>}

            {loading ? <DashboardSkeleton /> : visibleJobs.length ? (
              <div className="space-y-4">{visibleJobs.map((job) => <JobCard key={job.job_id} job={job} onApplied={markApplied} onCopy={(value) => void copy(value)} onResume={(value) => void openResume(value)} busy={busyJob === job.job_id} />)}</div>
            ) : (
              <div className="rounded-2xl border border-dashed border-[#c9d4d0] bg-white px-6 py-16 text-center"><div className="mx-auto grid size-12 place-items-center rounded-2xl bg-[#e8f3ef] text-[#0f6b55]"><BriefcaseBusiness className="size-5" /></div><h3 className="mt-4 text-balance text-lg font-semibold text-[#25312d]">{search ? "No roles match your search" : active === "matched" ? "You’re caught up" : `No ${active} roles yet`}</h3><p className="mx-auto mt-2 max-w-sm text-pretty text-sm leading-6 text-[#6a7772]">{search ? "Try a company name, role title, or location." : active === "matched" ? "Add a job you found or check back after the next scheduled run." : "Roles will appear here when their status changes."}</p>{search && <button type="button" onClick={() => setSearch("")} className="mt-4 text-sm font-semibold text-[#0f6b55]">Clear search</button>}</div>
            )}
          </section>
        </div>
      </main>
    </div>
  );
}
