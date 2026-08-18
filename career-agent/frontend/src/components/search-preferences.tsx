"use client";

import { ArrowLeft, CheckCircle2, MapPin, Plus, Save, Trash2, Sliders, Sparkles } from "lucide-react";
import Link from "next/link";
import { FormEvent, useCallback, useEffect, useState } from "react";
import { AuthScreen } from "@/components/auth-screen";
import { useAuth } from "@/components/auth-provider";
import type { LocationPreference, SearchPreferences, WorkMode } from "@/lib/types";

const emptyLocation = (): LocationPreference => ({ location: "", work_mode: "both" });

async function responseError(response: Response) {
  try {
    const body = (await response.json()) as { error?: string };
    return body.error || `Request failed with status ${response.status}.`;
  } catch {
    return `Request failed with status ${response.status}.`;
  }
}

export function SearchPreferencesPage() {
  const { user, loading: authLoading } = useAuth();
  const [preferences, setPreferences] = useState<SearchPreferences>({
    target_titles: [],
    location_preferences: [],
    needs_visa_sponsorship: true,
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);

  const request = useCallback(async (init: RequestInit = {}) => {
    if (!user) throw new Error("Sign in is required.");
    const headers = new Headers(init.headers);
    headers.set("authorization", `Bearer ${await user.getIdToken()}`);
    return fetch("/api/profile", { ...init, headers });
  }, [user]);

  useEffect(() => {
    if (!user) return;
    const load = async () => {
      setLoading(true);
      setError("");
      try {
        const response = await request();
        if (!response.ok) throw new Error(await responseError(response));
        setPreferences(await response.json() as SearchPreferences);
      } catch (caught) {
        setError(caught instanceof Error ? caught.message : "Could not load preferences.");
      } finally {
        setLoading(false);
      }
    };
    void load();
  }, [request, user]);

  if (authLoading || (user && loading)) {
    return (
      <div className="flex min-h-dvh items-center justify-center bg-[#080c0e]">
        <span className="size-5 animate-spin rounded-full border-2 border-emerald-500/30 border-t-emerald-400" />
      </div>
    );
  }

  if (!user) return <AuthScreen />;

  const updateTitle = (index: number, value: string) => {
    setSaved(false);
    setPreferences((current) => ({
      ...current,
      target_titles: current.target_titles.map((title, item) => item === index ? value : title),
    }));
  };

  const updateLocation = (index: number, patch: Partial<LocationPreference>) => {
    setSaved(false);
    setPreferences((current) => ({
      ...current,
      location_preferences: current.location_preferences.map((location, item) =>
        item === index ? { ...location, ...patch } : location),
    }));
  };

  async function save(event: FormEvent) {
    event.preventDefault();
    setSaving(true);
    setSaved(false);
    setError("");
    try {
      const response = await request({
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(preferences),
      });
      if (!response.ok) throw new Error(await responseError(response));
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Failed to save.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="relative min-h-dvh overflow-x-hidden bg-[#080c0e] text-slate-100 pb-20">
      <div className="ambient-glow-careers" />

      {/* Header */}
      <header className="sticky top-0 z-40 border-b border-white/5 bg-[#080c0e]/85 backdrop-blur-xl">
        <div className="mx-auto flex h-16 max-w-4xl items-center justify-between px-4 sm:px-6">
          <Link
            href="/jobs"
            className="flex items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-3 py-1.5 text-xs font-medium text-slate-300 transition hover:bg-white/10 hover:text-white"
          >
            <ArrowLeft className="size-3.5" />
            <span>Back to Careers</span>
          </Link>
          <span className="font-display text-sm font-bold text-white">Search Preferences</span>
          <button
            onClick={save}
            disabled={saving}
            className="flex items-center gap-1.5 rounded-xl bg-emerald-500 px-4 py-1.5 text-xs font-semibold text-[#080c0e] shadow-[0_0_15px_rgba(16,185,129,0.3)] transition hover:bg-emerald-400 active:scale-[0.98] disabled:opacity-50"
          >
            <Save className="size-3.5" />
            <span>{saving ? "Saving…" : "Save"}</span>
          </button>
        </div>
      </header>

      {/* Form Workspace */}
      <main className="relative z-10 mx-auto max-w-4xl px-4 py-8 sm:px-6">
        <div className="mb-8">
          <h1 className="font-display text-2xl font-bold text-white sm:text-3xl">Career Search Parameters</h1>
          <p className="mt-1 text-xs text-slate-400">
            Configure the hard criteria used by the deterministic pre-filter and Gemini 3.6 Flash evaluation engine.
          </p>
        </div>

        {saved && (
          <div className="mb-6 rounded-2xl border border-emerald-500/30 bg-emerald-950/40 p-4 text-xs text-emerald-300">
            ✓ Search preferences saved to Firestore. Subsequent pipeline runs will evaluate against these updated parameters.
          </div>
        )}

        {error && (
          <div className="mb-6 rounded-2xl border border-rose-500/30 bg-rose-950/40 p-4 text-xs text-rose-300">
            {error}
          </div>
        )}

        <form onSubmit={save} className="space-y-8">
          {/* Target Titles */}
          <section className="glass-panel rounded-3xl p-6 border border-white/10 space-y-4">
            <div className="flex items-center justify-between border-b border-white/5 pb-3">
              <div>
                <h3 className="font-display text-base font-bold text-white">Target Job Titles</h3>
                <p className="text-xs text-slate-400">ATS postings must match at least one of these title patterns</p>
              </div>
              <button
                type="button"
                onClick={() => setPreferences((p) => ({ ...p, target_titles: [...p.target_titles, ""] }))}
                className="flex items-center gap-1.5 rounded-xl border border-white/10 bg-white/5 px-3 py-1.5 text-xs font-semibold text-emerald-400 hover:bg-white/10"
              >
                <Plus className="size-3.5" /> Add Title
              </button>
            </div>

            <div className="space-y-3">
              {preferences.target_titles.map((title, idx) => (
                <div key={idx} className="flex items-center gap-3">
                  <input
                    value={title}
                    onChange={(e) => updateTitle(idx, e.target.value)}
                    placeholder="e.g. Senior AI Engineer, Full Stack Developer"
                    className="h-10 flex-1 rounded-xl border border-white/10 bg-[#0d1317] px-3.5 text-xs text-white placeholder:text-slate-600 focus:border-emerald-500/50 focus:outline-none"
                  />
                  <button
                    type="button"
                    onClick={() => setPreferences((p) => ({ ...p, target_titles: p.target_titles.filter((_, i) => i !== idx) }))}
                    className="rounded-lg p-2 text-slate-500 hover:bg-rose-500/10 hover:text-rose-400"
                  >
                    <Trash2 className="size-4" />
                  </button>
                </div>
              ))}
            </div>
          </section>

          {/* Location Preferences */}
          <section className="glass-panel rounded-3xl p-6 border border-white/10 space-y-4">
            <div className="flex items-center justify-between border-b border-white/5 pb-3">
              <div>
                <h3 className="font-display text-base font-bold text-white">Location & Work Modes</h3>
                <p className="text-xs text-slate-400">Specify allowed geographic regions or global remote</p>
              </div>
              <button
                type="button"
                onClick={() => setPreferences((p) => ({ ...p, location_preferences: [...p.location_preferences, emptyLocation()] }))}
                className="flex items-center gap-1.5 rounded-xl border border-white/10 bg-white/5 px-3 py-1.5 text-xs font-semibold text-emerald-400 hover:bg-white/10"
              >
                <Plus className="size-3.5" /> Add Location
              </button>
            </div>

            <div className="space-y-3">
              {preferences.location_preferences.map((loc, idx) => (
                <div key={idx} className="flex flex-wrap items-center gap-3">
                  <input
                    value={loc.location}
                    onChange={(e) => updateLocation(idx, { location: e.target.value })}
                    placeholder="e.g. Remote, San Francisco, London"
                    className="h-10 flex-1 min-w-[180px] rounded-xl border border-white/10 bg-[#0d1317] px-3.5 text-xs text-white placeholder:text-slate-600 focus:border-emerald-500/50 focus:outline-none"
                  />
                  <select
                    value={loc.work_mode}
                    onChange={(e) => updateLocation(idx, { work_mode: e.target.value as WorkMode })}
                    className="h-10 rounded-xl border border-white/10 bg-[#0d1317] px-3 text-xs text-slate-300 focus:border-emerald-500/50 focus:outline-none"
                  >
                    <option value="remote">Remote Only</option>
                    <option value="onsite">On-Site</option>
                    <option value="hybrid">Hybrid</option>
                    <option value="both">Any Mode</option>
                  </select>
                  <button
                    type="button"
                    onClick={() => setPreferences((p) => ({ ...p, location_preferences: p.location_preferences.filter((_, i) => i !== idx) }))}
                    className="rounded-lg p-2 text-slate-500 hover:bg-rose-500/10 hover:text-rose-400"
                  >
                    <Trash2 className="size-4" />
                  </button>
                </div>
              ))}
            </div>
          </section>

          {/* Visa Sponsorship Toggle */}
          <section className="glass-panel rounded-3xl p-6 border border-white/10">
            <label className="flex items-center justify-between cursor-pointer">
              <div>
                <span className="font-display text-sm font-bold text-white block">Requires Visa Sponsorship</span>
                <span className="text-xs text-slate-400 block mt-0.5">
                  When enabled, postings stating "no sponsorship available" will be flagged as unmet requirements.
                </span>
              </div>
              <input
                type="checkbox"
                checked={preferences.needs_visa_sponsorship}
                onChange={(e) => {
                  setSaved(false);
                  setPreferences((p) => ({ ...p, needs_visa_sponsorship: e.target.checked }));
                }}
                className="size-5 rounded border-white/20 bg-[#0d1317] text-emerald-500 focus:ring-emerald-500/20"
              />
            </label>
          </section>
        </form>
      </main>
    </div>
  );
}
