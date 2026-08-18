"use client";

import { 
  BriefcaseBusiness, 
  Search, 
  ShieldCheck, 
  Sparkles, 
  ArrowUpRight, 
  Layers, 
  Cpu, 
  Plus, 
  ExternalLink, 
  Clock, 
  Globe2, 
  Zap,
  Sliders
} from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { useAuth } from "@/components/auth-provider";

export function AgentLauncher() {
  const { user, logout } = useAuth();
  const firstName = user?.displayName?.split(" ")[0] || user?.email?.split("@")[0] || "there";
  const [quickAddOpen, setQuickAddOpen] = useState(false);
  const [quickAddUrl, setQuickAddUrl] = useState("");
  const [quickAddText, setQuickAddText] = useState("");
  const [evaluating, setEvaluating] = useState(false);
  const [evalResult, setEvalResult] = useState<any>(null);

  async function handleQuickAdd(e: React.FormEvent) {
    e.preventDefault();
    setEvaluating(true);
    setEvalResult(null);
    try {
      const headers: Record<string, string> = { "content-type": "application/json" };
      if (user) {
        headers["authorization"] = `Bearer ${await user.getIdToken()}`;
      }
      const res = await fetch("/api/quick-add", {
        method: "POST",
        headers,
        body: JSON.stringify({ url: quickAddUrl, text: quickAddText }),
      });
      const data = await res.json();
      setEvalResult(data);
    } catch (err) {
      setEvalResult({ error: "Failed to evaluate listing. Check backend connection." });
    } finally {
      setEvaluating(false);
    }
  }

  return (
    <div className="relative min-h-dvh overflow-x-hidden bg-[#080c0e] text-slate-100">
      {/* Dynamic Background Glows */}
      <div className="ambient-glow-careers" />
      <div className="ambient-glow-studio" />

      {/* Global Navigation Bar */}
      <header className="sticky top-0 z-50 border-b border-white/5 bg-[#080c0e]/80 backdrop-blur-xl">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
          <div className="flex items-center gap-3">
            <div className="grid size-9 place-items-center rounded-xl bg-gradient-to-br from-emerald-500/20 to-teal-900/40 border border-emerald-500/30 text-emerald-400 shadow-[0_0_15px_rgba(16,185,129,0.2)]">
              <Sparkles className="size-4" />
            </div>
            <span className="font-display text-lg font-bold tracking-tight text-white">TalentOS</span>
            <span className="hidden rounded-full border border-white/10 bg-white/5 px-2.5 py-0.5 text-xs font-medium text-slate-400 sm:inline">
              AllStackLabs
            </span>
          </div>

          <div className="flex items-center gap-3 sm:gap-4">
            <div className="hidden items-center gap-2 rounded-full border border-emerald-500/20 bg-emerald-950/30 px-3 py-1 text-xs text-emerald-400 md:flex">
              <span className="size-2 animate-pulse rounded-full bg-emerald-400" />
              <span>Cloud Run · 6h Cadence Active</span>
            </div>

            <button
              onClick={() => setQuickAddOpen(true)}
              className="flex items-center gap-1.5 rounded-xl border border-white/15 bg-white/5 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-white/10 hover:border-white/25"
            >
              <Plus className="size-3.5 text-emerald-400" />
              <span>Quick Add</span>
            </button>

            <div className="h-4 w-px bg-white/10" />

            <div className="flex items-center gap-3">
              <span className="hidden text-xs font-medium text-slate-300 sm:inline">
                {user?.displayName || user?.email}
              </span>
              <button
                type="button"
                onClick={() => void logout()}
                className="rounded-lg px-2.5 py-1 text-xs font-medium text-slate-400 transition hover:bg-white/5 hover:text-white"
              >
                Sign out
              </button>
            </div>
          </div>
        </div>
      </header>

      {/* Main Container */}
      <main className="relative z-10 mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-8 lg:py-16">
        {/* Hero Section */}
        <div className="max-w-3xl">
          <div className="inline-flex items-center gap-2 rounded-full border border-emerald-500/30 bg-emerald-950/40 px-3 py-1 text-xs font-semibold text-emerald-400 backdrop-blur-md">
            <Zap className="size-3.5" />
            <span>Autonomous Dual-Stream Opportunity Intelligence</span>
          </div>
          <h1 className="font-display mt-4 text-balance text-4xl font-extrabold tracking-tight text-white sm:text-5xl lg:text-6xl">
            Welcome back, <span className="bg-gradient-to-r from-emerald-400 via-teal-300 to-amber-300 bg-clip-text text-transparent">{firstName}</span>.
          </h1>
          <p className="mt-4 text-pretty text-base leading-relaxed text-slate-400 sm:text-lg">
            Your personal reverse headhunter and freelance client scout. Powered by Vertex AI Gemini 3.6 Flash with strict human-in-the-loop approval.
          </p>
        </div>

        {/* Dual Stream Bento Grid */}
        <div className="mt-10 grid gap-6 md:grid-cols-2">
          {/* Bento Card 1: Careers Stream */}
          <div className="glass-card border-beam-careers group relative flex flex-col justify-between overflow-hidden rounded-3xl p-8 border border-white/10">
            <div className="absolute top-0 right-0 p-6">
              <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-500/20 bg-emerald-950/40 px-3 py-1 text-xs font-medium text-emerald-400">
                <span className="size-1.5 rounded-full bg-emerald-400" /> Full-Time Pipeline
              </span>
            </div>

            <div>
              <div className="flex size-14 items-center justify-center rounded-2xl bg-emerald-500/10 border border-emerald-500/25 text-emerald-400 shadow-[0_0_25px_rgba(16,185,129,0.15)]">
                <Search className="size-7" />
              </div>

              <div className="mt-6">
                <h2 className="font-display text-2xl font-bold text-white group-hover:text-emerald-300 transition">
                  TalentOS // Careers
                </h2>
                <p className="mt-1 text-xs font-medium uppercase tracking-wider text-emerald-400/80">
                  Automated Job Search & Resume Tailoring
                </p>
              </div>

              <p className="mt-4 text-sm leading-relaxed text-slate-300">
                Continuously monitors Greenhouse, Lever, Ashby, SmartRecruiters and open aggregators. Evaluates requirements with 3-state logic and drafts tailored resumes and targeted cover letters.
              </p>

              <div className="mt-6 flex flex-wrap gap-2">
                {["Greenhouse & Lever ATS", "3-State Gap Analysis", "Print-Ready Resumes", "Hiring Contact Lookup"].map((tag) => (
                  <span key={tag} className="rounded-lg border border-white/5 bg-white/5 px-2.5 py-1 text-xs text-slate-400">
                    {tag}
                  </span>
                ))}
              </div>
            </div>

            <div className="mt-8 flex items-center justify-between border-t border-white/5 pt-6">
              <div className="flex items-center gap-3">
                <Link
                  href="/jobs"
                  className="flex items-center gap-2 rounded-xl bg-emerald-500 px-4 py-2 text-xs font-semibold text-[#080c0e] transition hover:bg-emerald-400 active:scale-[0.98]"
                >
                  <span>Open Careers Dashboard</span>
                  <ArrowUpRight className="size-4" />
                </Link>
                <Link
                  href="/settings"
                  className="flex items-center gap-1.5 rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-xs font-medium text-slate-300 transition hover:bg-white/10 hover:text-white"
                >
                  <Sliders className="size-3.5" />
                  <span>Preferences</span>
                </Link>
              </div>
              <span className="text-xs text-slate-500 font-mono">12 ATS & Aggregators</span>
            </div>
          </div>

          {/* Bento Card 2: Studio Stream */}
          <div className="glass-card border-beam-studio group relative flex flex-col justify-between overflow-hidden rounded-3xl p-8 border border-white/10">
            <div className="absolute top-0 right-0 p-6">
              <span className="inline-flex items-center gap-1.5 rounded-full border border-amber-500/20 bg-amber-950/40 px-3 py-1 text-xs font-medium text-amber-400">
                <span className="size-1.5 rounded-full bg-amber-400" /> Freelance & Contract
              </span>
            </div>

            <div>
              <div className="flex size-14 items-center justify-center rounded-2xl bg-amber-500/10 border border-amber-500/25 text-amber-400 shadow-[0_0_25px_rgba(245,158,11,0.15)]">
                <BriefcaseBusiness className="size-7" />
              </div>

              <div className="mt-6">
                <h2 className="font-display text-2xl font-bold text-white group-hover:text-amber-300 transition">
                  TalentOS // Studio
                </h2>
                <p className="mt-1 text-xs font-medium uppercase tracking-wider text-amber-400/80">
                  Freelance Client Lead Acquisition & Pitch Drafter
                </p>
              </div>

              <p className="mt-4 text-sm leading-relaxed text-slate-300">
                Monitors public hiring feeds (r/forhire, We Work Remotely contracts, Contra). Performs tech stack fit reasoning and drafts high-conversion 3-paragraph pitches with verified portfolio anchors.
              </p>

              <div className="mt-6 flex flex-wrap gap-2">
                {["r/forhire & WWR Feeds", "Budget Verification", "3-Paragraph Pitcher", "Deep-Link Outreach"].map((tag) => (
                  <span key={tag} className="rounded-lg border border-white/5 bg-white/5 px-2.5 py-1 text-xs text-slate-400">
                    {tag}
                  </span>
                ))}
              </div>
            </div>

            <div className="mt-8 flex items-center justify-between border-t border-white/5 pt-6">
              <div className="flex items-center gap-3">
                <Link
                  href="/freelance"
                  className="flex items-center gap-2 rounded-xl bg-amber-500 px-4 py-2 text-xs font-semibold text-[#080c0e] transition hover:bg-amber-400 active:scale-[0.98]"
                >
                  <span>Open Studio Dashboard</span>
                  <ArrowUpRight className="size-4" />
                </Link>
                <Link
                  href="/freelance/settings"
                  className="flex items-center gap-1.5 rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-xs font-medium text-slate-300 transition hover:bg-white/10 hover:text-white"
                >
                  <Sliders className="size-3.5" />
                  <span>Freelance Profile</span>
                </Link>
              </div>
              <span className="text-xs text-slate-500 font-mono">Live Gig Boards</span>
            </div>
          </div>
        </div>

        {/* Telemetry & Architecture Bento Strip */}
        <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <div className="glass-panel rounded-2xl p-5 border border-white/5">
            <div className="flex items-center justify-between text-slate-400">
              <span className="text-xs font-medium">ATS Discovery</span>
              <Globe2 className="size-4 text-emerald-400" />
            </div>
            <div className="font-display mt-2 text-2xl font-bold text-white">4 Platforms</div>
            <p className="mt-1 text-xs text-slate-400">Greenhouse, Lever, Ashby, SmartRecruiters</p>
          </div>

          <div className="glass-panel rounded-2xl p-5 border border-white/5">
            <div className="flex items-center justify-between text-slate-400">
              <span className="text-xs font-medium">Model Reasoning</span>
              <Cpu className="size-4 text-sky-400" />
            </div>
            <div className="font-display mt-2 text-2xl font-bold text-white">Gemini 3.6 Flash</div>
            <p className="mt-1 text-xs text-slate-400">Vertex AI Global with Search Grounding</p>
          </div>

          <div className="glass-panel rounded-2xl p-5 border border-white/5">
            <div className="flex items-center justify-between text-slate-400">
              <span className="text-xs font-medium">State & Orchestration</span>
              <Layers className="size-4 text-teal-400" />
            </div>
            <div className="font-display mt-2 text-2xl font-bold text-white">LangGraph</div>
            <p className="mt-1 text-xs text-slate-400">Multi-tenant Cloud Firestore persistence</p>
          </div>

          <div className="glass-panel rounded-2xl p-5 border border-white/5">
            <div className="flex items-center justify-between text-slate-400">
              <span className="text-xs font-medium">Safety Guarantee</span>
              <ShieldCheck className="size-4 text-amber-400" />
            </div>
            <div className="font-display mt-2 text-2xl font-bold text-white">Human Approval</div>
            <p className="mt-1 text-xs text-slate-400">Zero bot risk; single-click human send</p>
          </div>
        </div>
      </main>

      {/* Quick Add Modal */}
      {quickAddOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-md">
          <div className="glass-panel w-full max-w-xl rounded-3xl p-6 border border-white/10 shadow-2xl">
            <div className="flex items-center justify-between border-b border-white/10 pb-4">
              <div className="flex items-center gap-2">
                <div className="grid size-8 place-items-center rounded-lg bg-emerald-500/20 text-emerald-400">
                  <Plus className="size-4" />
                </div>
                <div>
                  <h3 className="font-display text-base font-bold text-white">Quick Add Job or Freelance Lead</h3>
                  <p className="text-xs text-slate-400">Directly evaluate any job posting text or supported URL</p>
                </div>
              </div>
              <button
                onClick={() => { setQuickAddOpen(false); setEvalResult(null); }}
                className="rounded-lg p-1.5 text-slate-400 hover:bg-white/10 hover:text-white"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleQuickAdd} className="mt-4 space-y-4">
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-300">Posting URL (Greenhouse, Lever, Ashby, etc.)</label>
                <input
                  type="url"
                  value={quickAddUrl}
                  onChange={(e) => setQuickAddUrl(e.target.value)}
                  placeholder="https://boards.greenhouse.io/..."
                  className="h-10 w-full rounded-xl border border-white/10 bg-[#0d1317] px-3 text-xs text-white placeholder:text-slate-600 focus:border-emerald-500/50 focus:outline-none"
                />
              </div>

              <div>
                <label className="mb-1 block text-xs font-medium text-slate-300">Or Paste Job Description / Lead Text</label>
                <textarea
                  rows={4}
                  value={quickAddText}
                  onChange={(e) => setQuickAddText(e.target.value)}
                  placeholder="Paste raw job description or client request text here..."
                  className="w-full rounded-xl border border-white/10 bg-[#0d1317] p-3 text-xs text-white placeholder:text-slate-600 focus:border-emerald-500/50 focus:outline-none"
                />
              </div>

              {evalResult && (
                <div className="rounded-xl border border-white/10 bg-[#0d1317] p-4 text-xs leading-relaxed">
                  {evalResult.error ? (
                    <p className="text-rose-400">{evalResult.error}</p>
                  ) : (
                    <div>
                      <div className="flex items-center gap-2 font-semibold text-white">
                        <span className={evalResult.match ? "text-emerald-400" : "text-amber-400"}>
                          {evalResult.match ? "✓ Match Found" : "✗ Skipped / Unmet Requirements"}
                        </span>
                      </div>
                      <p className="mt-1 text-slate-300">{evalResult.reasoning || JSON.stringify(evalResult)}</p>
                    </div>
                  )}
                </div>
              )}

              <div className="flex items-center justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => { setQuickAddOpen(false); setEvalResult(null); }}
                  className="rounded-xl px-4 py-2 text-xs font-medium text-slate-400 hover:text-white"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={evaluating || (!quickAddUrl && !quickAddText)}
                  className="flex items-center gap-2 rounded-xl bg-emerald-500 px-4 py-2 text-xs font-semibold text-[#080c0e] hover:bg-emerald-400 disabled:opacity-50"
                >
                  {evaluating ? "Evaluating with Gemini…" : "Evaluate Posting"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}