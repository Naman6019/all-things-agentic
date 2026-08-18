"use client";

import { ArrowLeft, Check, Save, Settings, Sliders, Sparkles } from "lucide-react";
import Link from "next/link";
import { FormEvent, useCallback, useEffect, useState } from "react";
import { useAuth } from "@/components/auth-provider";
import type { FreelanceProfile } from "@/lib/types";

export function FreelanceSettingsPage() {
  const { user } = useAuth();
  const [niche, setNiche] = useState("");
  const [availability, setAvailability] = useState("");
  const [services, setServices] = useState("");
  const [summary, setSummary] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);

  const request = useCallback(async (path: string, init: RequestInit = {}) => {
    if (!user) throw new Error("Sign in is required.");
    const token = await user.getIdToken();
    const headers = new Headers(init.headers);
    headers.set("authorization", `Bearer ${token}`);
    return fetch(path, { ...init, headers });
  }, [user]);

  useEffect(() => {
    void (async () => {
      try {
        const response = await request("/api/freelance-profile");
        if (!response.ok) throw new Error("Could not load freelance profile.");
        const data = (await response.json()) as FreelanceProfile;
        setNiche(data.freelance_niche || "");
        setAvailability(data.freelance_availability || "");
        setServices((data.freelance_services || []).join("\n"));
        setSummary(data.freelance_portfolio_summary || "");
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed to load.");
      } finally {
        setLoading(false);
      }
    })();
  }, [request]);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setSaving(true); setError(""); setSaved(false);
    try {
      const response = await request("/api/freelance-profile", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          freelance_niche: niche,
          freelance_availability: availability,
          freelance_services: services.split("\n").map((s) => s.trim()).filter(Boolean),
          freelance_portfolio_summary: summary,
        }),
      });
      if (!response.ok) throw new Error("Could not save freelance profile.");
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to save.");
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div className="flex min-h-dvh items-center justify-center bg-[#080c0e]">
        <span className="size-5 animate-spin rounded-full border-2 border-amber-500/30 border-t-amber-400" />
      </div>
    );
  }

  return (
    <div className="relative min-h-dvh overflow-x-hidden bg-[#080c0e] text-slate-100 pb-20">
      <div className="ambient-glow-studio" />

      {/* Header */}
      <header className="sticky top-0 z-40 border-b border-white/5 bg-[#080c0e]/85 backdrop-blur-xl">
        <div className="mx-auto flex h-16 max-w-4xl items-center justify-between px-4 sm:px-6">
          <Link
            href="/freelance"
            className="flex items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-3 py-1.5 text-xs font-medium text-slate-300 transition hover:bg-white/10 hover:text-white"
          >
            <ArrowLeft className="size-3.5" />
            <span>Back to Studio</span>
          </Link>
          <span className="font-display text-sm font-bold text-white">Freelance Services Profile</span>
          <button
            onClick={submit}
            disabled={saving}
            className="flex items-center gap-1.5 rounded-xl bg-amber-500 px-4 py-1.5 text-xs font-semibold text-[#080c0e] shadow-[0_0_15px_rgba(245,158,11,0.3)] transition hover:bg-amber-400 active:scale-[0.98] disabled:opacity-50"
          >
            <Save className="size-3.5" />
            <span>{saving ? "Saving…" : "Save"}</span>
          </button>
        </div>
      </header>

      {/* Main Form */}
      <main className="relative z-10 mx-auto max-w-4xl px-4 py-8 sm:px-6">
        <div className="mb-8">
          <h1 className="font-display text-2xl font-bold text-white sm:text-3xl">Freelance Agent Configuration</h1>
          <p className="mt-1 text-xs text-slate-400">
            These parameters drive the TalentOS // Studio freelance evaluator and pitch drafter agents.
          </p>
        </div>

        {saved && (
          <div className="mb-6 rounded-2xl border border-amber-500/30 bg-amber-950/40 p-4 text-xs text-amber-300">
            ✓ Freelance profile saved to Firestore. Subsequent gig monitoring runs will evaluate against these services.
          </div>
        )}

        {error && (
          <div className="mb-6 rounded-2xl border border-rose-500/30 bg-rose-950/40 p-4 text-xs text-rose-300">
            {error}
          </div>
        )}

        <form onSubmit={submit} className="space-y-6">
          <div className="glass-panel rounded-3xl p-6 border border-white/10 space-y-5">
            <div>
              <label className="mb-1 block text-xs font-semibold text-slate-400 uppercase">Freelance Niche / Domain</label>
              <input
                value={niche}
                onChange={(e) => setNiche(e.target.value)}
                placeholder="e.g. Full-Stack Web Development, Next.js Apps, AI Integrations"
                className="h-11 w-full rounded-xl border border-white/10 bg-[#0d1317] px-3.5 text-xs text-white placeholder:text-slate-600 focus:border-amber-500/50 focus:outline-none"
              />
              <span className="mt-1 block text-[11px] text-slate-500">Drives which public gigs and feeds are admitted by the pre-filter.</span>
            </div>

            <div>
              <label className="mb-1 block text-xs font-semibold text-slate-400 uppercase">Availability & Lead Time</label>
              <input
                value={availability}
                onChange={(e) => setAvailability(e.target.value)}
                placeholder="e.g. Available immediately, 20 hrs/week, 2 weeks notice"
                className="h-11 w-full rounded-xl border border-white/10 bg-[#0d1317] px-3.5 text-xs text-white placeholder:text-slate-600 focus:border-amber-500/50 focus:outline-none"
              />
              <span className="mt-1 block text-[11px] text-slate-500">Allows Gemini to evaluate client timeline feasibility.</span>
            </div>

            <div>
              <label className="mb-1 block text-xs font-semibold text-slate-400 uppercase">Services Offered (One per line)</label>
              <textarea
                value={services}
                onChange={(e) => setServices(e.target.value)}
                rows={5}
                placeholder={"Full-stack Next.js web applications\nAPI integrations & LLM pipelines\nMobile responsive UI development\nPerformance optimization & SEO"}
                className="w-full resize-y rounded-xl border border-white/10 bg-[#0d1317] p-3 text-xs leading-relaxed text-slate-200 placeholder:text-slate-600 focus:border-amber-500/50 focus:outline-none"
              />
              <span className="mt-1 block text-[11px] text-slate-500">The freelance evaluator checks client requirements against this service list.</span>
            </div>

            <div>
              <label className="mb-1 block text-xs font-semibold text-slate-400 uppercase">Portfolio Summary / Opening Hook</label>
              <textarea
                value={summary}
                onChange={(e) => setSummary(e.target.value)}
                rows={4}
                placeholder="e.g. I build high-performance React & Python web applications. Shipped 15+ production systems with 99.9% uptime."
                className="w-full resize-y rounded-xl border border-white/10 bg-[#0d1317] p-3 text-xs leading-relaxed text-slate-200 placeholder:text-slate-600 focus:border-amber-500/50 focus:outline-none"
              />
              <span className="mt-1 block text-[11px] text-slate-500">The pitcher agent incorporates this track record into direct client outreach messages.</span>
            </div>
          </div>
        </form>
      </main>
    </div>
  );
}