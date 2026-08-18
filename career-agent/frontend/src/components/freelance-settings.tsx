"use client";

import { ArrowLeft, Check, Settings } from "lucide-react";
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
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to save.");
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <main className="grid min-h-dvh place-items-center bg-[#f5f7f7]">
        <span className="size-4 rounded-full border-2 border-[#b5c9c2] border-t-[#8b423a]" />
      </main>
    );
  }

  return (
    <div className="min-h-dvh bg-[#f5f7f7]">
      <header className="border-b border-[#dce4e1] bg-white">
        <div className="mx-auto flex h-16 max-w-[800px] items-center gap-3 px-4 sm:px-6 lg:px-8">
          <Link href="/freelance" className="grid size-9 place-items-center rounded-lg text-[#53635e] hover:bg-[#f0f3f2]">
            <ArrowLeft className="size-4" />
          </Link>
          <Settings className="size-4 text-[#8b423a]" />
          <span className="font-semibold text-[#17211e]">Freelance Settings</span>
        </div>
      </header>

      <main className="mx-auto max-w-[800px] px-4 py-8 sm:px-6 lg:px-8">
        <p className="text-sm text-[#64726d]">These fields configure the TalentOS // Studio agent. Your shared profile (name, skills, portfolio, GitHub) is already used by both agents.</p>

        <form onSubmit={submit} className="mt-8 space-y-6">
          <label className="block">
            <span className="mb-1.5 block text-sm font-semibold text-[#25312d]">Freelance niche</span>
            <input value={niche} onChange={(e) => setNiche(e.target.value)} placeholder="e.g. Web Development, Frontend, Full-stack" className="h-11 w-full rounded-xl border border-[#c8d8d3] bg-white px-3 text-sm" />
            <span className="mt-1 block text-xs text-[#7a8782]">Drives which leads the pre-filter admits.</span>
          </label>

          <label className="block">
            <span className="mb-1.5 block text-sm font-semibold text-[#25312d]">Availability</span>
            <input value={availability} onChange={(e) => setAvailability(e.target.value)} placeholder="e.g. Available now, 2 weeks notice" className="h-11 w-full rounded-xl border border-[#c8d8d3] bg-white px-3 text-sm" />
            <span className="mt-1 block text-xs text-[#7a8782]">Lets the agent reject leads with impossible timelines.</span>
          </label>

          <label className="block">
            <span className="mb-1.5 block text-sm font-semibold text-[#25312d]">Services offered (one per line)</span>
            <textarea value={services} onChange={(e) => setServices(e.target.value)} rows={5} placeholder={"Landing pages\nReact apps\nAPI integration\nShopify themes"} className="w-full resize-y rounded-xl border border-[#c8d8d3] bg-white px-3 py-3 text-sm" />
            <span className="mt-1 block text-xs text-[#7a8782]">The evaluator matches these against lead requirements.</span>
          </label>

          <label className="block">
            <span className="mb-1.5 block text-sm font-semibold text-[#25312d]">Portfolio summary (short pitch)</span>
            <textarea value={summary} onChange={(e) => setSummary(e.target.value)} rows={4} placeholder="e.g. I build fast, accessible React apps for startups. 3+ years, 20+ projects shipped." className="w-full resize-y rounded-xl border border-[#c8d8d3] bg-white px-3 py-3 text-sm" />
            <span className="mt-1 block text-xs text-[#7a8782]">The pitcher uses this to open pitches.</span>
          </label>

          {error && <p role="alert" className="rounded-lg border border-[#efc7c2] bg-[#fff5f3] px-3 py-2 text-sm text-[#8d362d]">{error}</p>}
          {saved && <p role="status" className="inline-flex items-center gap-2 rounded-lg border border-[#bcded3] bg-[#f1faf7] px-3 py-2 text-sm text-[#0a5d49]"><Check className="size-4" /> Freelance profile saved.</p>}

          <button type="submit" disabled={saving} className="inline-flex h-11 items-center gap-2 rounded-xl bg-[#8b423a] px-5 text-sm font-semibold text-white disabled:opacity-60">
            {saving ? "Saving…" : "Save freelance profile"}
          </button>
        </form>
      </main>
    </div>
  );
}