"use client";

import { 
  Check, 
  Copy, 
  ExternalLink, 
  RotateCcw, 
  Save, 
  DollarSign, 
  User, 
  Link2,
} from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { useAuth } from "@/components/auth-provider";
import { useToast } from "@/components/ui/toast";
import type { Lead } from "@/lib/types";
import { WorkbenchHeader } from "@/components/workbench-header";

export function PitchEditorPage({ leadId }: { leadId: string }) {
  const { user } = useAuth();
  const { toast } = useToast();
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
      setTimeout(() => setSaved(false), 3000);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to save.");
    } finally {
      setSaving(false);
    }
  }

  // A native confirm() blocks the tab and looks nothing like the product.
  function reset() {
    toast({
      title: "Reset to the original Gemini draft?",
      description: "Your edits to this pitch will be discarded.",
      tone: "info",
      duration: 8000,
      action: { label: "Reset", onClick: () => void resetPitch() },
    });
  }

  async function resetPitch() {
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

  return (
    <div className="relative min-h-dvh overflow-x-hidden bg-surface-0 text-slate-100 pb-20">
      {/* Subtle Grid Background */}
      <div className="absolute inset-0 bg-grid-subtle pointer-events-none opacity-40" />

      <WorkbenchHeader
        backHref="/freelance"
        backLabel="Back to Studio"
        width="max-w-5xl"
        title={lead?.title || "Pitch Studio"}
        actions={
          <>
            <button
              onClick={copyPitch}
              aria-label="Copy this pitch to the clipboard"
              className="flex items-center gap-1.5 rounded-control border border-line-strong bg-white/5 px-3 py-2 text-xs font-medium text-slate-300 transition hover:bg-white/10 hover:text-white"
            >
              {copied ? (
                <Check className="size-3.5 text-studio" aria-hidden />
              ) : (
                <Copy className="size-3.5" aria-hidden />
              )}
              <span className="hidden sm:inline">{copied ? "Copied" : "Copy Pitch"}</span>
            </button>

            <button
              onClick={save}
              disabled={saving}
              className="flex items-center gap-1.5 rounded-control bg-studio px-4 py-2 text-xs font-semibold text-surface-0 shadow-[0_0_15px_rgba(245,158,11,0.3)] transition hover:bg-studio-bright active:scale-[0.98] disabled:opacity-50"
            >
              <Save className="size-3.5" aria-hidden />
              <span>{saving ? "Saving…" : "Save Changes"}</span>
            </button>
          </>
        }
      />

      {/* Main Studio View */}
      <main className="relative z-10 mx-auto max-w-5xl px-4 py-8 sm:px-6">
        {loading ? (
          <div className="flex min-h-[300px] items-center justify-center">
            <span className="size-5 animate-spin rounded-full border-2 border-amber-500/30 border-t-amber-400" />
          </div>
        ) : error ? (
          <div className="rounded-surface border border-rose-500/30 bg-rose-950/30 p-6 text-center text-xs text-rose-300">
            {error}
          </div>
        ) : lead ? (
          <div className="space-y-6">
            {/* Lead Context Header Card */}
            <div className="glass-panel rounded-surface p-6 border border-line-strong">
              <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <span className="text-xs font-mono text-amber-400 uppercase tracking-wider">Freelance Lead Context</span>
                  <h1 className="font-display text-2xl font-bold text-white mt-1">{lead.title}</h1>
                  <div className="mt-2 flex flex-wrap items-center gap-3 text-xs text-slate-400">
                    {lead.client && (
                      <span className="flex items-center gap-1">
                        <User className="size-3 text-slate-500" />
                        {lead.client}
                      </span>
                    )}
                    {lead.budget && (
                      <span className="flex items-center gap-1 font-mono text-amber-300 font-semibold">
                        <DollarSign className="size-3" />
                        {lead.budget}
                      </span>
                    )}
                  </div>
                </div>

                {lead.url && (
                  <a
                    href={lead.url}
                    target="_blank"
                    rel="noreferrer"
                    className="flex items-center gap-1.5 rounded-control border border-line-strong bg-white/5 px-3 py-1.5 text-xs font-medium text-slate-300 hover:text-white self-start"
                  >
                    <span>Open Client Post</span>
                    <ExternalLink className="size-3.5" />
                  </a>
                )}
              </div>
            </div>

            {/* Pitch Editor Workspace */}
            <div className="glass-card rounded-surface p-6 border border-line-strong space-y-4">
              <div className="flex items-center justify-between border-b border-line pb-3">
                <div>
                  <h3 className="font-display text-base font-bold text-white">Targeted Client Pitch</h3>
                  <p className="text-xs text-slate-400">100-200 word direct outreach message tailored to the client&rsquo;s stated problem</p>
                </div>
                <button
                  type="button"
                  onClick={reset}
                  className="flex items-center gap-1 text-xs text-slate-400 hover:text-rose-400 transition"
                >
                  <RotateCcw className="size-3.5" />
                  <span>Reset to AI Draft</span>
                </button>
              </div>

              {saved && (
                <div className="rounded-control border border-amber-500/30 bg-amber-950/40 p-3 text-xs text-amber-300">
                  ✓ Pitch updated and saved to Firestore.
                </div>
              )}

              <textarea
                value={editedPitch}
                onChange={(e) => setEditedPitch(e.target.value)}
                rows={12}
                className="w-full resize-y rounded-surface border border-line-strong bg-surface-1 p-4 text-sm leading-relaxed text-slate-200 placeholder:text-slate-500 focus:border-amber-500/50 focus:outline-none"
              />

              {/* Pitch Metadata Chips */}
              <div className="grid gap-4 sm:grid-cols-2 pt-2">
                <div className="rounded-surface border border-line bg-surface-sunken p-4 text-xs">
                  <span className="font-semibold text-slate-300">Suggested Pricing Anchor:</span>
                  <div className="font-mono text-amber-400 font-bold mt-1 text-sm">
                    {lead.suggested_rate || "Competitive Fixed / Hourly"}
                  </div>
                </div>

                <div className="rounded-surface border border-line bg-surface-sunken p-4 text-xs">
                  <span className="font-semibold text-slate-300">Recommended Channel:</span>
                  <div className="text-slate-300 font-medium mt-1">
                    {lead.contact_method || "Direct Message / Email"}
                  </div>
                </div>
              </div>

              {/* Relevant Portfolio Links */}
              {lead.relevant_portfolio && lead.relevant_portfolio.length > 0 && (
                <div className="rounded-surface border border-line bg-surface-sunken p-4 text-xs">
                  <span className="font-semibold text-slate-300">Verified Portfolio Links to Include:</span>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {lead.relevant_portfolio.map((link, i) => (
                      <a
                        key={i}
                        href={link}
                        target="_blank"
                        rel="noreferrer"
                        className="flex items-center gap-1 rounded-control border border-line-strong bg-white/5 px-2.5 py-1 text-amber-300 hover:bg-white/10 font-mono text-xs"
                      >
                        <Link2 className="size-3" />
                        <span>{link.replace(/^https?:\/\//, "")}</span>
                      </a>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        ) : null}
      </main>
    </div>
  );
}