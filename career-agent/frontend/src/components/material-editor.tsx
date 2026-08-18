"use client";

import {
  ArrowLeft,
  Check,
  Clipboard,
  FileText,
  Plus,
  Printer,
  RotateCcw,
  Save,
  Trash2,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AuthScreen } from "@/components/auth-screen";
import { useAuth } from "@/components/auth-provider";
import { cn } from "@/lib/utils";
import type { MaterialsResponse, ResumeEntry, TailoredResume } from "@/lib/types";

type MaterialType = "cover-letter" | "resume";

async function responseError(response: Response) {
  try {
    const body = (await response.json()) as { error?: string };
    return body.error || `Request failed with ${response.status}.`;
  } catch {
    return `Request failed with ${response.status}.`;
  }
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

function broadcastEdit(jobId: string, materialType: MaterialType, edited: boolean, timestamp?: string) {
  if (!("BroadcastChannel" in window)) return;
  const channel = new BroadcastChannel("career-agent-materials");
  channel.postMessage({ jobId, materialType, edited, timestamp });
  channel.close();
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
    <fieldset className="rounded-2xl border border-[#dce4e1] bg-white p-5 shadow-sm">
      <div className="flex items-center justify-between gap-3">
        <legend className="text-sm font-semibold text-[#25312d]">{label}</legend>
        <button type="button" onClick={onRemove} className="inline-flex h-9 items-center gap-2 rounded-lg px-3 text-sm font-semibold text-[#8d362d] hover:bg-[#fbf3f2]">
          <Trash2 className="size-4" /> Remove
        </button>
      </div>
      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        <label className="block">
          <span className="mb-1.5 block text-xs font-semibold text-[#53635e]">TITLE</span>
          <input value={entry.title} onChange={(event) => onChange({ ...entry, title: event.target.value })} className="h-11 w-full rounded-xl border border-[#cfd9d5] px-3 text-sm" />
        </label>
        <label className="block">
          <span className="mb-1.5 block text-xs font-semibold text-[#53635e]">ORGANIZATION</span>
          <input value={entry.organization} onChange={(event) => onChange({ ...entry, organization: event.target.value })} className="h-11 w-full rounded-xl border border-[#cfd9d5] px-3 text-sm" />
        </label>
        <label className="block sm:col-span-2">
          <span className="mb-1.5 block text-xs font-semibold text-[#53635e]">DATES</span>
          <input value={entry.dates} onChange={(event) => onChange({ ...entry, dates: event.target.value })} className="h-11 w-full rounded-xl border border-[#cfd9d5] px-3 text-sm" />
        </label>
        <label className="block sm:col-span-2">
          <span className="mb-1.5 block text-xs font-semibold text-[#53635e]">BULLETS — ONE PER LINE</span>
          <textarea value={entry.bullets.join("\n")} onChange={(event) => onChange({ ...entry, bullets: splitLines(event.target.value) })} rows={5} className="w-full resize-y rounded-xl border border-[#cfd9d5] px-3 py-3 text-sm leading-6" />
        </label>
      </div>
    </fieldset>
  );
}

function ResumeEditor({ value, onChange }: { value: TailoredResume; onChange: (value: TailoredResume) => void }) {
  function updateEntry(section: "experience" | "projects", index: number, entry: ResumeEntry) {
    const items = value[section].map((item, itemIndex) => itemIndex === index ? entry : item);
    onChange({ ...value, [section]: items });
  }

  function removeEntry(section: "experience" | "projects", index: number) {
    onChange({ ...value, [section]: value[section].filter((_, itemIndex) => itemIndex !== index) });
  }

  function addEntry(section: "experience" | "projects") {
    onChange({ ...value, [section]: [...value[section], emptyEntry()] });
  }

  return (
    <div className="space-y-8">
      <section className="rounded-2xl border border-[#dce4e1] bg-white p-5 shadow-sm sm:p-6">
        <h2 className="text-balance text-lg font-semibold text-[#17211e]">Positioning</h2>
        <div className="mt-5 space-y-4">
          <label className="block">
            <span className="mb-1.5 block text-xs font-semibold text-[#53635e]">HEADLINE</span>
            <input value={value.headline} onChange={(event) => onChange({ ...value, headline: event.target.value })} className="h-11 w-full rounded-xl border border-[#cfd9d5] px-3 text-sm" />
          </label>
          <label className="block">
            <span className="mb-1.5 block text-xs font-semibold text-[#53635e]">SUMMARY</span>
            <textarea value={value.summary} onChange={(event) => onChange({ ...value, summary: event.target.value })} rows={4} className="w-full resize-y rounded-xl border border-[#cfd9d5] px-3 py-3 text-sm leading-6" />
          </label>
          <label className="block">
            <span className="mb-1.5 block text-xs font-semibold text-[#53635e]">SKILLS — ONE PER LINE</span>
            <textarea value={value.skills.join("\n")} onChange={(event) => onChange({ ...value, skills: splitLines(event.target.value) })} rows={6} className="w-full resize-y rounded-xl border border-[#cfd9d5] px-3 py-3 text-sm leading-6" />
          </label>
        </div>
      </section>

      {(["experience", "projects"] as const).map((section) => (
        <section key={section}>
          <div className="mb-4 flex items-center justify-between gap-4">
            <div>
              <h2 className="text-balance text-lg font-semibold capitalize text-[#17211e]">{section}</h2>
              <p className="mt-1 text-pretty text-sm text-[#64726d]">Keep the most relevant entries first.</p>
            </div>
            <button type="button" onClick={() => addEntry(section)} className="inline-flex h-10 items-center gap-2 rounded-xl border border-[#cfd9d5] bg-white px-4 text-sm font-semibold text-[#42504b] hover:bg-[#f7f9f8]">
              <Plus className="size-4" /> Add
            </button>
          </div>
          <div className="space-y-4">
            {value[section].map((entry, index) => (
              <ResumeEntryEditor key={`${section}-${index}`} entry={entry} label={`${section === "experience" ? "Experience" : "Project"} ${index + 1}`} onChange={(next) => updateEntry(section, index, next)} onRemove={() => removeEntry(section, index)} />
            ))}
            {value[section].length === 0 && (
              <div className="rounded-2xl border border-dashed border-[#cfd9d5] bg-white p-6 text-center">
                <p className="text-pretty text-sm text-[#64726d]">No {section} entries. Add one if it strengthens this application.</p>
              </div>
            )}
          </div>
        </section>
      ))}

      <section className="rounded-2xl border border-[#dce4e1] bg-white p-5 shadow-sm sm:p-6">
        <h2 className="text-balance text-lg font-semibold text-[#17211e]">Education & achievements</h2>
        <label className="mt-5 block">
          <span className="mb-1.5 block text-xs font-semibold text-[#53635e]">ONE PER LINE</span>
          <textarea value={value.education.join("\n")} onChange={(event) => onChange({ ...value, education: splitLines(event.target.value) })} rows={6} className="w-full resize-y rounded-xl border border-[#cfd9d5] px-3 py-3 text-sm leading-6" />
        </label>
      </section>
    </div>
  );
}

function Editor({ jobId, materialType }: { jobId: string; materialType: MaterialType }) {
  const { user, loading: authLoading } = useAuth();
  const router = useRouter();
  const [materials, setMaterials] = useState<MaterialsResponse | null>(null);
  const [coverLetter, setCoverLetter] = useState("");
  const [resume, setResume] = useState<TailoredResume | null>(null);
  const [savedValue, setSavedValue] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const restoreDialog = useRef<HTMLDialogElement>(null);
  const leaveDialog = useRef<HTMLDialogElement>(null);

  const request = useCallback(async (path: string, init: RequestInit = {}) => {
    if (!user) throw new Error("Sign in is required.");
    const token = await user.getIdToken();
    const headers = new Headers(init.headers);
    headers.set("authorization", `Bearer ${token}`);
    return fetch(path, { ...init, headers });
  }, [user]);

  useEffect(() => {
    if (!user || !jobId) return;
    let active = true;
    void (async () => {
      setLoading(true); setError("");
      try {
        const response = await request(`/api/materials?job_id=${encodeURIComponent(jobId)}`);
        if (!response.ok) throw new Error(await responseError(response));
        const data = (await response.json()) as MaterialsResponse;
        if (!active) return;
        setMaterials(data);
        setCoverLetter(data.effective_cover_letter);
        setResume(data.effective_tailored_resume);
        setSavedValue(materialType === "cover-letter" ? data.effective_cover_letter : JSON.stringify(data.effective_tailored_resume));
      } catch (caught) {
        if (active) setError(caught instanceof Error ? caught.message : "Could not load application materials.");
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => { active = false; };
  }, [jobId, materialType, request, user]);

  const currentValue = materialType === "cover-letter" ? coverLetter : JSON.stringify(resume);
  const dirty = Boolean(materials) && currentValue !== savedValue;
  const editedAt = materialType === "cover-letter" ? materials?.cover_letter_edited_at : materials?.tailored_resume_edited_at;
  const wordCount = useMemo(() => coverLetter.trim() ? coverLetter.trim().split(/\s+/).length : 0, [coverLetter]);

  useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  async function save() {
    if (!resume) return;
    setSaving(true); setError(""); setNotice("");
    try {
      const normalizedResume = normalizeResume(resume);
      const body = materialType === "cover-letter"
        ? { job_id: jobId, material_type: "cover_letter", cover_letter: coverLetter }
        : { job_id: jobId, material_type: "tailored_resume", tailored_resume: normalizedResume };
      const response = await request("/api/materials", { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
      if (!response.ok) throw new Error(await responseError(response));
      const timestamp = new Date().toISOString();
      setSavedValue(materialType === "cover-letter" ? coverLetter.trim() : JSON.stringify(normalizedResume));
      setMaterials((current) => current ? {
        ...current,
        cover_letter_edited_at: materialType === "cover-letter" ? timestamp : current.cover_letter_edited_at,
        tailored_resume_edited_at: materialType === "resume" ? timestamp : current.tailored_resume_edited_at,
      } : current);
      if (materialType === "cover-letter") setCoverLetter((current) => current.trim());
      else setResume(normalizedResume);
      broadcastEdit(jobId, materialType, true, timestamp);
      setNotice("Edits saved for this posting.");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not save your edits.");
    } finally {
      setSaving(false);
    }
  }

  async function restoreGenerated() {
    if (!materials) return;
    setSaving(true); setError(""); setNotice("");
    try {
      const response = await request("/api/materials", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ job_id: jobId, material_type: materialType === "cover-letter" ? "cover_letter" : "tailored_resume", reset: true }),
      });
      if (!response.ok) throw new Error(await responseError(response));
      if (materialType === "cover-letter") {
        setCoverLetter(materials.generated_cover_letter);
        setSavedValue(materials.generated_cover_letter);
        setMaterials({ ...materials, edited_cover_letter: null, cover_letter_edited_at: null, effective_cover_letter: materials.generated_cover_letter });
      } else {
        setResume(materials.generated_tailored_resume);
        setSavedValue(JSON.stringify(materials.generated_tailored_resume));
        setMaterials({ ...materials, edited_tailored_resume: null, tailored_resume_edited_at: null, effective_tailored_resume: materials.generated_tailored_resume });
      }
      broadcastEdit(jobId, materialType, false);
      setNotice("Generated version restored.");
      restoreDialog.current?.close();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not restore the generated version.");
    } finally {
      setSaving(false);
    }
  }

  async function openPrintableResume() {
    setError("");
    const preview = window.open("", "_blank");
    if (!preview) {
      setError("Allow pop-ups to open the printable resume.");
      return;
    }
    preview.document.title = "Preparing resume…";
    preview.document.body.textContent = "Preparing printable resume…";
    try {
      const response = await request(`/api/resume?job_id=${encodeURIComponent(jobId)}`);
      if (!response.ok) throw new Error(await responseError(response));
      const url = URL.createObjectURL(await response.blob());
      preview.opener = null;
      preview.location.href = url;
      window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
    } catch (caught) {
      preview.close();
      setError(caught instanceof Error ? caught.message : "Could not open the printable resume.");
    }
  }

  async function copyCoverLetter() {
    setError("");
    try {
      await navigator.clipboard.writeText(coverLetter);
      setNotice("Copied to clipboard.");
    } catch {
      setError("Clipboard access was blocked by the browser.");
    }
  }

  if (authLoading) {
    return <main className="grid min-h-dvh place-items-center bg-[#f5f7f7]"><p className="text-sm font-medium text-[#53635e]">Opening editor…</p></main>;
  }
  if (!user) return <AuthScreen />;
  if (!jobId) return <main className="grid min-h-dvh place-items-center bg-[#f5f7f7] p-6"><p role="alert" className="text-sm text-[#8d362d]">No posting was selected.</p></main>;

  const title = materialType === "cover-letter" ? "Edit cover letter" : "Edit tailored resume";

  return (
    <div className="min-h-dvh bg-[#f5f7f7]">
      <header className="border-b border-[#dce4e1] bg-white">
        <div className="mx-auto flex min-h-16 max-w-5xl flex-wrap items-center justify-between gap-3 px-4 py-3 sm:px-6">
          <button type="button" onClick={() => dirty ? leaveDialog.current?.showModal() : router.push("/")} className="inline-flex h-10 items-center gap-2 rounded-xl px-3 text-sm font-semibold text-[#42504b] hover:bg-[#f0f3f2]"><ArrowLeft className="size-4" /> Workspace</button>
          <div className="flex items-center gap-2">
            {materialType === "cover-letter" ? (
              <button type="button" disabled={!coverLetter} onClick={() => void copyCoverLetter()} className="inline-flex h-10 items-center gap-2 rounded-xl border border-[#cfd9d5] px-4 text-sm font-semibold text-[#42504b] hover:bg-[#f7f9f8] disabled:opacity-50"><Clipboard className="size-4" /> Copy</button>
            ) : (
              <button type="button" disabled={!resume || dirty} title={dirty ? "Save changes before exporting" : "Open printable resume"} onClick={() => void openPrintableResume()} className="inline-flex h-10 items-center gap-2 rounded-xl border border-[#cfd9d5] px-4 text-sm font-semibold text-[#42504b] hover:bg-[#f7f9f8] disabled:opacity-50"><Printer className="size-4" /> Print / PDF</button>
            )}
            <button type="button" disabled={saving || !materials} onClick={() => restoreDialog.current?.showModal()} className="inline-flex h-10 items-center gap-2 rounded-xl border border-[#cfd9d5] px-4 text-sm font-semibold text-[#42504b] hover:bg-[#f7f9f8] disabled:opacity-50"><RotateCcw className="size-4" /> Restore</button>
            <button type="button" disabled={saving || !dirty} onClick={() => void save()} className="inline-flex h-10 items-center gap-2 rounded-xl bg-[#0f6b55] px-4 text-sm font-semibold text-white hover:bg-[#0a5947] disabled:opacity-50"><Save className="size-4" />{saving ? "Saving…" : "Save draft"}</button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-4 py-8 sm:px-6 sm:py-10">
        <div className="mb-7 flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
          <div>
            <div className="flex items-center gap-2 text-sm font-semibold text-[#0f6b55]"><FileText className="size-4" /> APPLICATION MATERIAL</div>
            <h1 className="mt-2 text-balance text-3xl font-semibold text-[#17211e]">{title}</h1>
            <p className="mt-2 text-pretty text-[#64726d]">{materials ? `${materials.title} at ${materials.company}` : "Loading posting…"}</p>
          </div>
          {materials && (
            <div className={cn("inline-flex w-fit items-center gap-2 rounded-full px-3 py-1.5 text-xs font-semibold", editedAt ? "bg-[#e8f3ef] text-[#0f6b55]" : "bg-[#eef3f1] text-[#53635e]")}>
              {editedAt ? <Check className="size-3.5" /> : null}{editedAt ? "Human edited" : "AI-generated original"}
            </div>
          )}
        </div>

        {error && <p role="alert" className="mb-5 rounded-xl border border-[#efd3cf] bg-[#fbf3f2] px-4 py-3 text-sm text-[#8d362d]">{error}</p>}
        {notice && <p role="status" className="mb-5 rounded-xl border border-[#c8ded6] bg-[#f0f8f5] px-4 py-3 text-sm text-[#0f6b55]">{notice}</p>}

        {loading ? (
          <div className="space-y-4" aria-label="Loading material">
            <div className="h-16 rounded-2xl bg-[#e8edeb]" />
            <div className="h-96 rounded-2xl bg-[#e8edeb]" />
          </div>
        ) : materialType === "cover-letter" ? (
          <section className="rounded-2xl border border-[#dce4e1] bg-white p-5 shadow-sm sm:p-7">
            <div className="mb-4 flex items-center justify-between gap-3">
              <p className="text-pretty text-sm text-[#64726d]">Review tone, claims, and role-specific details before using it.</p>
              <span className="tabular-nums text-xs font-semibold text-[#64726d]">{wordCount} words</span>
            </div>
            <label className="block">
              <span className="sr-only">Cover letter</span>
              <textarea value={coverLetter} onChange={(event) => { setCoverLetter(event.target.value); setNotice(""); }} rows={24} className="w-full resize-y rounded-xl border border-[#cfd9d5] px-4 py-4 text-base leading-7 text-[#25312d]" />
            </label>
          </section>
        ) : resume ? (
          <ResumeEditor value={resume} onChange={(next) => { setResume(next); setNotice(""); }} />
        ) : null}
      </main>

      <dialog ref={restoreDialog} aria-labelledby="restore-title" className="m-auto w-11/12 max-w-md rounded-2xl border border-[#dce4e1] bg-white p-0 shadow-xl backdrop:bg-black/40">
        <div className="p-6">
          <h2 id="restore-title" className="text-balance text-lg font-semibold text-[#17211e]">Restore generated version?</h2>
          <p className="mt-2 text-pretty text-sm leading-6 text-[#64726d]">Your saved edits for this {materialType === "cover-letter" ? "cover letter" : "resume"} will be removed. The original AI draft will remain available.</p>
          <div className="mt-6 flex justify-end gap-2">
            <button type="button" onClick={() => restoreDialog.current?.close()} className="h-10 rounded-xl px-4 text-sm font-semibold text-[#53635e] hover:bg-[#f0f3f2]">Cancel</button>
            <button type="button" disabled={saving} onClick={() => void restoreGenerated()} className="h-10 rounded-xl bg-[#8d362d] px-4 text-sm font-semibold text-white hover:bg-[#7c2e27] disabled:opacity-50">Restore original</button>
          </div>
        </div>
      </dialog>

      <dialog ref={leaveDialog} aria-labelledby="leave-title" className="m-auto w-11/12 max-w-md rounded-2xl border border-[#dce4e1] bg-white p-0 shadow-xl backdrop:bg-black/40">
        <div className="p-6">
          <h2 id="leave-title" className="text-balance text-lg font-semibold text-[#17211e]">Discard unsaved changes?</h2>
          <p className="mt-2 text-pretty text-sm leading-6 text-[#64726d]">Save this draft before returning to the workspace if you want to keep your latest changes.</p>
          <div className="mt-6 flex justify-end gap-2">
            <button type="button" onClick={() => leaveDialog.current?.close()} className="h-10 rounded-xl px-4 text-sm font-semibold text-[#53635e] hover:bg-[#f0f3f2]">Keep editing</button>
            <button type="button" onClick={() => router.push("/")} className="h-10 rounded-xl bg-[#8d362d] px-4 text-sm font-semibold text-white hover:bg-[#7c2e27]">Discard and leave</button>
          </div>
        </div>
      </dialog>
    </div>
  );
}

export function MaterialEditorPage({ jobId, materialType }: { jobId: string; materialType: MaterialType }) {
  return <Editor jobId={jobId} materialType={materialType} />;
}
