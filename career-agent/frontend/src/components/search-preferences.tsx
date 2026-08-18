"use client";

import { ArrowLeft, CheckCircle2, MapPin, Plus, Save, Trash2 } from "lucide-react";
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

function LoadingPage() {
  return (
    <main className="min-h-dvh bg-[#f5f7f7] px-4 py-10" aria-label="Loading search preferences">
      <div className="mx-auto max-w-3xl space-y-5">
        <div className="h-8 w-72 rounded bg-[#e3e9e7]" />
        <div className="h-56 rounded-2xl border border-[#dce4e1] bg-white" />
        <div className="h-72 rounded-2xl border border-[#dce4e1] bg-white" />
      </div>
    </main>
  );
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

  if (authLoading || (user && loading)) return <LoadingPage />;
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
      setPreferences(await response.json() as SearchPreferences);
      setSaved(true);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not save preferences.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="min-h-dvh bg-[#f5f7f7]">
      <header className="border-b border-[#dce4e1] bg-white">
        <div className="mx-auto flex h-16 max-w-3xl items-center px-4 sm:px-6">
          <Link href="/" className="inline-flex items-center gap-2 text-sm font-semibold text-[#42504b] hover:text-[#0f6b55]">
            <ArrowLeft className="size-4" /> Back to jobs
          </Link>
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-4 py-8 sm:px-6 sm:py-10">
        <p className="text-sm font-semibold text-[#0f6b55]">AGENT SETTINGS</p>
        <h1 className="mt-2 text-balance text-3xl font-semibold text-[#17211e]">Search preferences</h1>
        <p className="mt-2 max-w-2xl text-pretty leading-6 text-[#64726d]">Choose the roles and locations the agent should search. Changes apply to future runs.</p>

        <form onSubmit={save} className="mt-8 space-y-5">
          <section className="rounded-2xl border border-[#dce4e1] bg-white p-5 shadow-sm sm:p-6">
            <div className="flex items-start justify-between gap-4">
              <div><h2 className="text-lg font-semibold text-[#25312d]">Target positions</h2><p className="mt-1 text-pretty text-sm text-[#6a7772]">A posting must match at least one of these titles.</p></div>
              <span className="text-xs font-semibold tabular-nums text-[#7a8782]">{preferences.target_titles.length}/15</span>
            </div>
            <div className="mt-5 space-y-3">
              {preferences.target_titles.map((title, index) => (
                <div key={index} className="flex gap-2">
                  <label className="flex-1"><span className="sr-only">Position {index + 1}</span><input required value={title} onChange={(event) => updateTitle(index, event.target.value)} placeholder="e.g. Machine Learning Engineer" className="h-11 w-full rounded-xl border border-[#cfd9d5] px-3 text-sm" /></label>
                  <button type="button" aria-label={`Remove position ${index + 1}`} disabled={preferences.target_titles.length === 1} onClick={() => setPreferences((current) => ({ ...current, target_titles: current.target_titles.filter((_, item) => item !== index) }))} className="grid size-11 place-items-center rounded-xl text-[#8d362d] hover:bg-[#fbf3f2] disabled:cursor-not-allowed disabled:opacity-35"><Trash2 className="size-4" /></button>
                </div>
              ))}
            </div>
            <button type="button" disabled={preferences.target_titles.length >= 15} onClick={() => setPreferences((current) => ({ ...current, target_titles: [...current.target_titles, ""] }))} className="mt-4 inline-flex h-10 items-center gap-2 rounded-xl border border-[#cfd9d5] px-4 text-sm font-semibold text-[#42504b] hover:bg-[#f7f9f8] disabled:opacity-45"><Plus className="size-4" /> Add position</button>
          </section>

          <section className="rounded-2xl border border-[#dce4e1] bg-white p-5 shadow-sm sm:p-6">
            <div className="flex items-start justify-between gap-4">
              <div><h2 className="inline-flex items-center gap-2 text-lg font-semibold text-[#25312d]"><MapPin className="size-5 text-[#0f6b55]" /> Locations</h2><p className="mt-1 text-pretty text-sm text-[#6a7772]">Add up to five local or international search areas and select how you want to work there.</p></div>
              <span className="text-xs font-semibold tabular-nums text-[#7a8782]">{preferences.location_preferences.length}/5</span>
            </div>
            <div className="mt-5 space-y-3">
              {preferences.location_preferences.map((item, index) => (
                <div key={index} className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_150px_44px]">
                  <label><span className="sr-only">Location {index + 1}</span><input required value={item.location} onChange={(event) => updateLocation(index, { location: event.target.value })} placeholder="e.g. Bengaluru, India" className="h-11 w-full rounded-xl border border-[#cfd9d5] px-3 text-sm" /></label>
                  <label><span className="sr-only">Work mode for {item.location || `location ${index + 1}`}</span><select value={item.work_mode} onChange={(event) => updateLocation(index, { work_mode: event.target.value as WorkMode })} className="h-11 w-full rounded-xl border border-[#cfd9d5] bg-white px-3 text-sm"><option value="both">On-site + remote</option><option value="onsite">On-site</option><option value="remote">Remote</option></select></label>
                  <button type="button" aria-label={`Remove location ${index + 1}`} disabled={preferences.location_preferences.length === 1} onClick={() => setPreferences((current) => ({ ...current, location_preferences: current.location_preferences.filter((_, itemIndex) => itemIndex !== index) }))} className="grid size-11 place-items-center rounded-xl text-[#8d362d] hover:bg-[#fbf3f2] disabled:cursor-not-allowed disabled:opacity-35"><Trash2 className="size-4" /></button>
                </div>
              ))}
            </div>
            <button type="button" disabled={preferences.location_preferences.length >= 5} onClick={() => setPreferences((current) => ({ ...current, location_preferences: [...current.location_preferences, emptyLocation()] }))} className="mt-4 inline-flex h-10 items-center gap-2 rounded-xl border border-[#cfd9d5] px-4 text-sm font-semibold text-[#42504b] hover:bg-[#f7f9f8] disabled:opacity-45"><Plus className="size-4" /> Add location</button>
          </section>

          <section className="rounded-2xl border border-[#dce4e1] bg-white p-5 shadow-sm sm:p-6">
            <label className="flex cursor-pointer items-start gap-3"><input type="checkbox" checked={preferences.needs_visa_sponsorship} onChange={(event) => { setSaved(false); setPreferences((current) => ({ ...current, needs_visa_sponsorship: event.target.checked })); }} className="mt-1 size-4 accent-[#0f6b55]" /><span><span className="block font-semibold text-[#25312d]">I need visa sponsorship for international on-site roles</span><span className="mt-1 block text-pretty text-sm leading-6 text-[#6a7772]">The agent will only keep early-career international on-site jobs that explicitly offer sponsorship.</span></span></label>
          </section>

          {error && <p role="alert" className="rounded-xl border border-[#efc7c2] bg-[#fff5f3] px-4 py-3 text-sm text-[#8d362d]">{error}</p>}
          {saved && <p role="status" className="inline-flex items-center gap-2 text-sm font-semibold text-[#0f6b55]"><CheckCircle2 className="size-4" /> Preferences saved</p>}
          <div className="flex justify-end"><button disabled={saving} className="inline-flex h-11 items-center gap-2 rounded-xl bg-[#0f6b55] px-5 text-sm font-semibold text-white hover:bg-[#0a5947] disabled:opacity-60"><Save className="size-4" /> {saving ? "Saving…" : "Save preferences"}</button></div>
        </form>
      </main>
    </div>
  );
}
