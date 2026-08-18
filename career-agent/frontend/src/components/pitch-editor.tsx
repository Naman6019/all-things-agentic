"use client";

import { ArrowLeft, Check, Copy, FileText, RotateCcw, Send } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { useAuth } from "@/components/auth-provider";
import type { Lead } from "@/lib/types";

export function PitchEditorPage({ leadId }: { leadId: string }) {
  const { user } = useAuth();
  const [lead, setLead] = useState<Lead | null>(null);
  const [editedPitch, setEditedPitch] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);
  const [copied, setCopied] = useState(false);

  const request = useCallback(async (path: string, init: RequestInit = {}) => {
    if (!user) throw new Error("Sign in is required.");
    const token = await user.getIdToken();
    const headers = new Headers(init.headers);
    headers.set("authorization", `Bearer ${token}`);
    return fetch(path, { ...init, headers });
  }, [user]);

  useEffect(() => {
    if (!leadId) return;
    let cancelled = false;
    void (async () => {
      try {
        const response = await request(`/api/pitch?lead_id=${encodeURIComponent(leadId)}`);
        if (!response.ok) throw new Error("Could not load pitch.");
        const data = (await response.json()) as Lead;
        if (cancelled) return;
        setLead(data);
        setEditedPitch(data.edited_pitch_message ?? data.pitch_message ?? "");
      } catch (e) {
        if (cancelled) return;
        setError(e instanceof Error ? e.message : "Failed to load.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [leadId, request]);

  async function save() {
    setSaving(true); setError(""); setSaved(false);
    try {
      const response = await request("/api/pitch", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ lead_id: leadId, pitch_message: editedPitch }),
      });
      if (!response.ok) throw new Error("Could not save pitch.");
      setSaved(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to save.");
    } finally {
      setSaving(false);
    }
  }

  async function reset() {
    setSaving(true); setError("");
    try {
      const response = await request("/api/pitch", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ lead_id: leadId, reset: true }),
      });
      if (!response.ok) throw new Error("Could not reset pitch.");
      setEditedPitch(lead?.pitch_message ?? "");
      setSaved(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to reset.");
    } finally {
      setSaving(false);
    }
  }

  async function copyPitch() {
    try {
      await navigator.clipboard.writeText(editedPitch);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Fallback for non-HTTPS contexts (gcloud proxy)
      const textarea = document.createElement("textarea");
      textarea.value = editedPitch;
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand("copy");
      document.body.removeChild(textarea);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  }

  if (loading) {
    return (
      <main className="grid min-h-dvh place-items-center bg-[#f5f7f7]">
        <span className="size-4 rounded-full border-2 border-[#b5c9c2] border-t-[#8b423a]" />
      </main>
    );
  }

  if (!lead) {
    return (
      <main className="grid min-h-dvh place-items-center bg-[#f5f7f7]">
        <p className="text-sm text-[#64726d]">{error || "No pitch found."}</p>
      </main>
    );
  }

  const isEdited = Boolean(lead.pitch_edited_at);

  return (
    <div className="min-h-dvh bg-[#f5f7f7]">
      <header className="border-b border-[#dce4e1] bg-white">
        <div className="mx-auto flex h-16 max-w-[800px] items-center gap-3 px-4 sm:px-6 lg:px-8">
          <Link href="/freelance" className="grid size-9 place-items-center rounded-lg text-[#53635e] hover:bg-[#f0f3f2]">
            <ArrowLeft className="size-4" />
          </Link>
          <FileText className="size-4 text-[#8b423a]" />
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-[#17211e]">{lead.title}</p>
            <p className="truncate text-xs text-[#7a8782]">{lead.client}</p>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-[800px] px-4 py-8 sm:px-6 lg:px-8">
        {lead.reasoning && (
          <div className="mb-6 rounded-xl border border-[#e0e6e4] bg-white p-4">
            <p className="text-xs font-semibold text-[#8b423a]">WHY THIS MATCHED</p>
            <p className="mt-1 text-pretty text-sm leading-6 text-[#42504b]">{lead.reasoning}</p>
          </div>
        )}

        {lead.contact_method && (
          <div className="mb-6 flex items-center gap-3 rounded-xl border border-[#bcded3] bg-[#f1faf7] px-4 py-3">
            <Send className="size-4 text-[#0f6b55]" />
            <div>
              <p className="text-sm font-medium text-[#25312d]">Send via: {lead.contact_method}</p>
              {lead.url && <a href={lead.url} target="_blank" rel="noreferrer" className="text-xs text-[#0f6b55] hover:underline">Open the platform →</a>}
            </div>
          </div>
        )}

        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-[#17211e]">
            Your pitch {isEdited && <span className="ml-2 rounded-full bg-[#e8f3ef] px-2 py-0.5 text-xs text-[#0f6b55]">Edited</span>}
          </h2>
          <div className="flex gap-2">
            <button type="button" onClick={copyPitch} className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-[#cfd9d5] px-3 text-sm font-medium text-[#42504b] hover:bg-[#f7f9f8]">
              <Copy className="size-3.5" /> {copied ? "Copied!" : "Copy"}
            </button>
            {isEdited && (
              <button type="button" onClick={reset} disabled={saving} className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-[#cfd9d5] px-3 text-sm font-medium text-[#42504b] hover:bg-[#f7f9f8] disabled:opacity-60">
                <RotateCcw className="size-3.5" /> Restore AI draft
              </button>
            )}
          </div>
        </div>

        <textarea
          value={editedPitch}
          onChange={(e) => { setEditedPitch(e.target.value); setSaved(false); }}
          rows={16}
          className="w-full resize-y rounded-xl border border-[#c8d8d3] bg-white px-4 py-3 text-sm leading-6 text-[#17211e]"
        />

        {error && <p role="alert" className="mt-4 rounded-lg border border-[#efc7c2] bg-[#fff5f3] px-3 py-2 text-sm text-[#8d362d]">{error}</p>}
        {saved && <p role="status" className="mt-4 inline-flex items-center gap-2 rounded-lg border border-[#bcded3] bg-[#f1faf7] px-3 py-2 text-sm text-[#0a5d49]"><Check className="size-4" /> Pitch saved.</p>}

        <div className="mt-6 flex items-center gap-3">
          <button type="button" onClick={save} disabled={saving} className="inline-flex h-10 items-center gap-2 rounded-xl bg-[#8b423a] px-4 text-sm font-semibold text-white disabled:opacity-60">
            {saving ? "Saving…" : "Save pitch"}
          </button>
          {lead.url && (
            <a href={lead.url} target="_blank" rel="noreferrer" className="inline-flex h-10 items-center gap-2 rounded-xl bg-[#0f6b55] px-4 text-sm font-semibold text-white hover:bg-[#0a5947]">
              <Send className="size-4" /> Open platform to send
            </a>
          )}
        </div>

        {lead.relevant_portfolio && lead.relevant_portfolio.length > 0 && (
          <div className="mt-8 rounded-xl border border-[#e0e6e4] bg-white p-4">
            <p className="text-xs font-semibold text-[#8b423a]">RELEVANT PORTFOLIO</p>
            <ul className="mt-2 space-y-1 text-sm text-[#5e6d67]">
              {lead.relevant_portfolio.map((item) => <li key={item} className="flex gap-2"><span aria-hidden="true">•</span>{item}</li>)}
            </ul>
          </div>
        )}
      </main>
    </div>
  );
}