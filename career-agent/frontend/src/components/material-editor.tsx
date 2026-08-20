"use client";

import {
  Check,
  Clipboard,
  FileText,
  Plus,
  Printer,
  RotateCcw,
  Save,
  Trash2,
  Edit3
} from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { useAuth } from "@/components/auth-provider";
import { cn } from "@/lib/utils";
import type { MaterialsResponse, ResumeEntry, TailoredResume } from "@/lib/types";
import { WorkbenchHeader } from "@/components/workbench-header";
import { useToast } from "@/components/ui/toast";

type MaterialType = "cover-letter" | "resume";

type MaterialEditPayload = {
  job_id: string;
  cover_letter?: string;
  tailored_resume?: TailoredResume;
  reset_cover_letter?: boolean;
  reset_tailored_resume?: boolean;
};

async function responseError(response: Response) {
  try {
    const body = (await response.json()) as { error?: string };
    return body.error || `Request failed with ${response.status}.`;
  } catch {
    return `Request failed with ${response.status}.`;
  }
}

async function loadMaterials(
  request: (path: string, init?: RequestInit) => Promise<Response>,
  jobId: string,
): Promise<MaterialsResponse> {
  const res = await request(`/api/materials?job_id=${encodeURIComponent(jobId)}`);
  if (!res.ok) throw new Error(await responseError(res));
  return (await res.json()) as MaterialsResponse;
}

function emptyEntry(): ResumeEntry {
  return { title: "", organization: "", dates: "", bullets: [""] };
}

function splitLines(value: string) {
  return value.split("\n");
}

function normalizeResume(value: TailoredResume): TailoredResume {
  const normalizeEntries = (entries: ResumeEntry[]) => entries.map((entry) => ({
    ...entry,
    title: entry.title.trim(),
    organization: entry.organization.trim(),
    dates: entry.dates.trim(),
    bullets: entry.bullets.map((item) => item.trim()).filter(Boolean),
  }));

  return {
    headline: value.headline.trim(),
    summary: value.summary.trim(),
    skills: value.skills.map((item) => item.trim()).filter(Boolean),
    experience: normalizeEntries(value.experience),
    projects: normalizeEntries(value.projects),
    education: value.education.map((item) => item.trim()).filter(Boolean),
  };
}

function ResumeEntryEditor({
  entry,
  label,
  onChange,
  onRemove,
}: {
  entry: ResumeEntry;
  label: string;
  onChange: (entry: ResumeEntry) => void;
  onRemove: () => void;
}) {
  return (
    <fieldset className="glass-card rounded-surface border border-line-strong p-5 shadow-lg">
      <div className="flex items-center justify-between gap-3 border-b border-line pb-3">
        <legend className="font-display text-sm font-bold text-white">{label}</legend>
        <button
          type="button"
          onClick={onRemove}
          className="inline-flex items-center gap-1.5 rounded-control px-2.5 py-1 text-xs font-semibold text-rose-400 hover:bg-rose-500/10 transition"
        >
          <Trash2 className="size-3.5" /> Remove
        </button>
      </div>
      
      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        <div>
          <label className="mb-1 block text-xs font-medium text-slate-400">Position / Project Title</label>
          <input
            value={entry.title}
            onChange={(event) => onChange({ ...entry, title: event.target.value })}
            className="h-10 w-full rounded-control border border-line-strong bg-surface-1 px-3 text-xs text-white placeholder:text-slate-500 focus:border-emerald-500/50 focus:outline-none"
          />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-slate-400">Organization / Employer</label>
          <input
            value={entry.organization}
            onChange={(event) => onChange({ ...entry, organization: event.target.value })}
            className="h-10 w-full rounded-control border border-line-strong bg-surface-1 px-3 text-xs text-white placeholder:text-slate-500 focus:border-emerald-500/50 focus:outline-none"
          />
        </div>
        <div className="sm:col-span-2">
          <label className="mb-1 block text-xs font-medium text-slate-400">Employment Dates / Timeline</label>
          <input
            value={entry.dates}
            onChange={(event) => onChange({ ...entry, dates: event.target.value })}
            placeholder="e.g. 2023 — Present"
            className="h-10 w-full rounded-control border border-line-strong bg-surface-1 px-3 text-xs text-white placeholder:text-slate-500 focus:border-emerald-500/50 focus:outline-none"
          />
        </div>
        <div className="sm:col-span-2">
          <label className="mb-1 block text-xs font-medium text-slate-400">Tailored Bullets (One per line)</label>
          <textarea
            value={entry.bullets.join("\n")}
            onChange={(event) => onChange({ ...entry, bullets: splitLines(event.target.value) })}
            rows={4}
            className="w-full resize-y rounded-control border border-line-strong bg-surface-1 p-3 text-xs text-slate-200 leading-relaxed placeholder:text-slate-500 focus:border-emerald-500/50 focus:outline-none"
          />
        </div>
      </div>
    </fieldset>
  );
}

export function MaterialEditor({ jobId, materialType = "cover-letter" }: { jobId: string; materialType?: MaterialType }) {
  const { user } = useAuth();
  const { toast } = useToast();
  const [activeTab, setActiveTab] = useState<MaterialType>(materialType);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [materials, setMaterials] = useState<MaterialsResponse | null>(null);

  // Edit states
  const [coverLetterText, setCoverLetterText] = useState("");
  const [resumeData, setResumeData] = useState<TailoredResume | null>(null);
  const [saving, setSaving] = useState(false);
  const [copied, setCopied] = useState(false);
  const [savedNotice, setSavedNotice] = useState(false);

  const request = useCallback(async (path: string, init: RequestInit = {}) => {
    if (!user) throw new Error("Sign in is required.");
    const token = await user.getIdToken();
    const headers = new Headers(init.headers);
    headers.set("authorization", `Bearer ${token}`);
    return fetch(path, { ...init, headers });
  }, [user]);

  /** Kicks off the load; returns a cleanup that ignores in-flight results. */
  const refresh = useCallback(() => {
    if (!user) return () => {};
    let active = true;
    loadMaterials(request, jobId)
      .then((data) => {
        if (!active) return;
        setMaterials(data);
        setCoverLetterText(data.effective_cover_letter || data.generated_cover_letter || "");
        setResumeData(data.effective_tailored_resume || data.generated_tailored_resume || null);
        setError("");
      })
      .catch((err: unknown) => {
        if (!active) return;
        setError(err instanceof Error ? err.message : "Failed to load application materials.");
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [jobId, request, user]);

  useEffect(() => refresh(), [refresh]);

  async function handleSave() {
    setSaving(true);
    setSavedNotice(false);
    try {
      const body: MaterialEditPayload = { job_id: jobId };
      if (activeTab === "cover-letter") {
        body.cover_letter = coverLetterText;
      } else if (activeTab === "resume" && resumeData) {
        body.tailored_resume = normalizeResume(resumeData);
      }

      const res = await request("/api/materials", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error(await responseError(res));
      setSavedNotice(true);
      setTimeout(() => setSavedNotice(false), 3000);
      toast({ title: "Saved", description: "Your edits are stored in Firestore.", tone: "success" });
      refresh();
    } catch (err) {
      toast({
        title: "Save failed",
        description: err instanceof Error ? err.message : "Unknown error.",
        tone: "error",
      });
    } finally {
      setSaving(false);
    }
  }

  // A native confirm() blocks the tab and looks nothing like the product.
  // The reset is fully reversible from the AI draft, so an explicit second
  // click in a toast is enough friction.
  function handleResetDraft() {
    toast({
      title: "Reset to the original Gemini draft?",
      description: "Your edits to this document will be discarded.",
      tone: "info",
      duration: 8000,
      action: { label: "Reset", onClick: () => void resetDraft() },
    });
  }

  async function resetDraft() {
    setSaving(true);
    try {
      const body: MaterialEditPayload = { job_id: jobId };
      if (activeTab === "cover-letter") {
        body.reset_cover_letter = true;
      } else {
        body.reset_tailored_resume = true;
      }
      const res = await request("/api/materials", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error(await responseError(res));
      refresh();
    } catch (err) {
      toast({
        title: "Reset failed",
        description: err instanceof Error ? err.message : "Unknown error.",
        tone: "error",
      });
    } finally {
      setSaving(false);
    }
  }

  function handleCopy() {
    if (activeTab === "cover-letter") {
      navigator.clipboard.writeText(coverLetterText);
    } else if (resumeData) {
      const text = `${resumeData.headline}\n\n${resumeData.summary}\n\nSkills: ${resumeData.skills.join(", ")}`;
      navigator.clipboard.writeText(text);
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  function handlePrint() {
    window.open(`/api/resume?job_id=${encodeURIComponent(jobId)}`, "_blank");
  }

  return (
    <div className="relative min-h-dvh overflow-x-hidden bg-surface-0 text-slate-100 pb-20">
      {/* Subtle Grid Background */}
      <div className="absolute inset-0 bg-grid-subtle pointer-events-none opacity-40" />

      <WorkbenchHeader
        backHref="/jobs"
        backLabel="Back to Jobs"
        width="max-w-6xl"
        title={materials?.title || "Application Studio"}
        actions={
          <>
            <button
              onClick={handlePrint}
              aria-label="Open the print-ready A4 resume"
              title="Open printable resume"
              className="flex items-center gap-1.5 rounded-control border border-line-strong bg-white/5 px-3 py-2 text-xs font-medium text-slate-300 transition hover:bg-white/10 hover:text-white"
            >
              <Printer className="size-3.5" aria-hidden />
              <span className="hidden sm:inline">Print Ready A4</span>
            </button>

            <button
              onClick={handleCopy}
              aria-label="Copy this document to the clipboard"
              className="flex items-center gap-1.5 rounded-control border border-line-strong bg-white/5 px-3 py-2 text-xs font-medium text-slate-300 transition hover:bg-white/10 hover:text-white"
            >
              {copied ? (
                <Check className="size-3.5 text-careers" aria-hidden />
              ) : (
                <Clipboard className="size-3.5" aria-hidden />
              )}
              <span className="hidden sm:inline">{copied ? "Copied" : "Copy"}</span>
            </button>

            <button
              onClick={handleSave}
              disabled={saving}
              className="flex items-center gap-1.5 rounded-control bg-careers px-4 py-2 text-xs font-semibold text-surface-0 shadow-[0_0_15px_rgba(16,185,129,0.3)] transition hover:bg-careers-bright active:scale-[0.98] disabled:opacity-50"
            >
              <Save className="size-3.5" aria-hidden />
              <span>{saving ? "Saving…" : "Save Changes"}</span>
            </button>
          </>
        }
      />

      {/* Main Studio View */}
      <main className="relative z-10 mx-auto max-w-6xl px-4 py-8 sm:px-6">
        {/* Context Card */}
        {materials && (
          <div className="glass-panel mb-8 rounded-surface p-6 border border-line-strong">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <span className="text-xs font-mono text-emerald-400 uppercase tracking-wider">Target Position</span>
                <h1 className="font-display text-2xl font-bold text-white">{materials.title}</h1>
                <p className="mt-1 text-xs text-slate-400">
                  {materials.company}
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Tab Switcher */}
        <div className="flex items-center justify-between border-b border-line pb-4">
          <div className="flex items-center gap-2">
            <button
              onClick={() => setActiveTab("cover-letter")}
              className={cn(
                "flex items-center gap-2 rounded-control px-4 py-2 text-xs font-semibold transition",
                activeTab === "cover-letter"
                  ? "bg-emerald-500 text-surface-0 shadow-[0_0_15px_rgba(16,185,129,0.3)]"
                  : "border border-line bg-white/5 text-slate-400 hover:text-white"
              )}
            >
              <FileText className="size-3.5" />
              <span>Targeted Cover Letter</span>
            </button>

            <button
              onClick={() => setActiveTab("resume")}
              className={cn(
                "flex items-center gap-2 rounded-control px-4 py-2 text-xs font-semibold transition",
                activeTab === "resume"
                  ? "bg-emerald-500 text-surface-0 shadow-[0_0_15px_rgba(16,185,129,0.3)]"
                  : "border border-line bg-white/5 text-slate-400 hover:text-white"
              )}
            >
              <Edit3 className="size-3.5" />
              <span>Tailored Resume Structure</span>
            </button>
          </div>

          <button
            onClick={handleResetDraft}
            className="flex items-center gap-1.5 text-xs text-slate-400 hover:text-rose-400 transition"
          >
            <RotateCcw className="size-3.5" />
            <span className="hidden sm:inline">Reset to AI Draft</span>
          </button>
        </div>

        {savedNotice && (
          <div className="mt-4 rounded-control border border-emerald-500/30 bg-emerald-950/40 p-3 text-xs text-emerald-300 text-center">
            ✓ Changes saved to Firestore. Print-ready resume and materials are up to date.
          </div>
        )}

        {/* Editor Panes */}
        {loading ? (
          <div className="flex min-h-[300px] items-center justify-center">
            <span className="size-5 animate-spin rounded-full border-2 border-emerald-500/30 border-t-emerald-400" />
          </div>
        ) : error ? (
          <div className="mt-8 rounded-surface border border-rose-500/30 bg-rose-950/30 p-6 text-center text-xs text-rose-300">
            {error}
          </div>
        ) : activeTab === "cover-letter" ? (
          <div className="mt-6 space-y-4">
            <div className="glass-panel rounded-surface p-6 border border-line-strong">
              <label className="mb-2 block text-xs font-semibold uppercase tracking-wider text-slate-400">
                150-250 Word Targeted Cover Letter (Crafted by Gemini 3.6 Flash)
              </label>
              <textarea
                value={coverLetterText}
                onChange={(e) => setCoverLetterText(e.target.value)}
                rows={14}
                className="w-full resize-y rounded-surface border border-line-strong bg-surface-1 p-4 text-sm leading-relaxed text-slate-200 placeholder:text-slate-500 focus:border-emerald-500/50 focus:outline-none"
              />
            </div>
          </div>
        ) : resumeData ? (
          <div className="mt-6 space-y-6">
            {/* Header & Headline */}
            <div className="glass-panel rounded-surface p-6 border border-line-strong space-y-4">
              <div>
                <label className="mb-1 block text-xs font-semibold text-slate-400 uppercase">Tailored Professional Headline</label>
                <input
                  value={resumeData.headline}
                  onChange={(e) => setResumeData({ ...resumeData, headline: e.target.value })}
                  className="h-11 w-full rounded-control border border-line-strong bg-surface-1 px-3.5 text-sm font-semibold text-white focus:border-emerald-500/50 focus:outline-none"
                />
              </div>

              <div>
                <label className="mb-1 block text-xs font-semibold text-slate-400 uppercase">Executive Summary</label>
                <textarea
                  value={resumeData.summary}
                  onChange={(e) => setResumeData({ ...resumeData, summary: e.target.value })}
                  rows={4}
                  className="w-full rounded-control border border-line-strong bg-surface-1 p-3 text-xs leading-relaxed text-slate-200 focus:border-emerald-500/50 focus:outline-none"
                />
              </div>

              <div>
                <label className="mb-1 block text-xs font-semibold text-slate-400 uppercase">Targeted Skills (Comma separated)</label>
                <input
                  value={resumeData.skills.join(", ")}
                  onChange={(e) => setResumeData({ ...resumeData, skills: e.target.value.split(",").map((s) => s.trim()) })}
                  className="h-10 w-full rounded-control border border-line-strong bg-surface-1 px-3.5 text-xs text-emerald-300 font-mono focus:border-emerald-500/50 focus:outline-none"
                />
              </div>
            </div>

            {/* Experience Section */}
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="font-display text-lg font-bold text-white">Experience</h3>
                <button
                  type="button"
                  onClick={() => setResumeData({ ...resumeData, experience: [...resumeData.experience, emptyEntry()] })}
                  className="flex items-center gap-1.5 rounded-control border border-line-strong bg-white/5 px-3 py-1.5 text-xs font-semibold text-emerald-400 hover:bg-white/10"
                >
                  <Plus className="size-3.5" /> Add Experience
                </button>
              </div>

              {resumeData.experience.map((exp, idx) => (
                <ResumeEntryEditor
                  key={idx}
                  entry={exp}
                  label={`Role #${idx + 1}: ${exp.title || "Untitled"}`}
                  onChange={(updated) => {
                    const next = [...resumeData.experience];
                    next[idx] = updated;
                    setResumeData({ ...resumeData, experience: next });
                  }}
                  onRemove={() => {
                    setResumeData({ ...resumeData, experience: resumeData.experience.filter((_, i) => i !== idx) });
                  }}
                />
              ))}
            </div>

            {/* Projects Section */}
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="font-display text-lg font-bold text-white">Projects</h3>
                <button
                  type="button"
                  onClick={() => setResumeData({ ...resumeData, projects: [...resumeData.projects, emptyEntry()] })}
                  className="flex items-center gap-1.5 rounded-control border border-line-strong bg-white/5 px-3 py-1.5 text-xs font-semibold text-emerald-400 hover:bg-white/10"
                >
                  <Plus className="size-3.5" /> Add Project
                </button>
              </div>

              {resumeData.projects.map((proj, idx) => (
                <ResumeEntryEditor
                  key={idx}
                  entry={proj}
                  label={`Project #${idx + 1}: ${proj.title || "Untitled"}`}
                  onChange={(updated) => {
                    const next = [...resumeData.projects];
                    next[idx] = updated;
                    setResumeData({ ...resumeData, projects: next });
                  }}
                  onRemove={() => {
                    setResumeData({ ...resumeData, projects: resumeData.projects.filter((_, i) => i !== idx) });
                  }}
                />
              ))}
            </div>
          </div>
        ) : null}
      </main>
    </div>
  );
}

export const MaterialEditorPage = MaterialEditor;
