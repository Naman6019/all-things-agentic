"use client";

import {
  ArrowRight,
  CheckCircle2,
  ChevronRight,
  Cpu,
  FileCode2,
  Layers,
  ShieldAlert,
  Terminal,
} from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { motion, useInView } from "motion/react";
import { useAuth } from "@/components/auth-provider";
import { BrandGlyph, BrandMark } from "@/components/app-header";
import { AuthScreen } from "@/components/auth-screen";
import { ScrollVelocityContainer, ScrollVelocityRow } from "@/components/ui/scroll-based-velocity";
import { DataFlowBeams } from "@/components/data-flow-beams";

// ── Scroll-reveal wrapper ──────────────────────────────────────────────────────
function Reveal({
  children,
  className,
  delay = 0,
}: {
  children: React.ReactNode;
  className?: string;
  delay?: number;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { once: true, margin: "-80px" });
  return (
    <motion.div
      ref={ref}
      initial={{ opacity: 0, y: 28 }}
      animate={inView ? { opacity: 1, y: 0 } : {}}
      transition={{ duration: 0.55, ease: [0.22, 1, 0.36, 1], delay }}
      className={className}
    >
      {children}
    </motion.div>
  );
}

function GithubIcon({ className = "size-3.5" }: { className?: string }) {
  return (
    <svg className={className} fill="currentColor" viewBox="0 0 24 24">
      <path
        fillRule="evenodd"
        clipRule="evenodd"
        d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.53 1.032 1.53 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0022 12.017C22 6.484 17.522 2 12 2z"
      />
    </svg>
  );
}

// ── Inline Dashboard Mockup ────────────────────────────────────────────────────
function DashboardMockup() {
  const jobs = [
    { company: "Anthropic", title: "AI Systems Engineer", strength: "strong", source: "Ashby" },
    { company: "Stripe", title: "Backend Engineer — AI Platform", strength: "strong", source: "Greenhouse" },
    { company: "Vercel", title: "Staff Software Engineer", strength: "medium", source: "Lever" },
  ];
  return (
    <div className="w-full overflow-hidden rounded-surface border border-line shadow-[0_32px_80px_rgba(0,0,0,0.7)]">
      {/* Browser chrome */}
      <div className="flex items-center gap-3 border-b border-line bg-surface-1 px-4 py-2.5">
        <div className="flex gap-1.5">
          <span className="size-2.5 rounded-full bg-rose-500/50" />
          <span className="size-2.5 rounded-full bg-amber-500/50" />
          <span className="size-2.5 rounded-full bg-emerald-500/50" />
        </div>
        <div className="flex-1 truncate rounded-control bg-white/[0.04] px-3 py-0.5 text-center font-mono text-xs text-slate-500">
          all-things-agentic--allthingsagentic-505213.asia-southeast1.hosted.app/jobs
        </div>
      </div>
      <div className="flex bg-surface-0">
        <div className="hidden w-48 shrink-0 border-r border-line bg-surface-1 p-3 sm:block">
          <div className="mb-3 flex items-center gap-2 px-2">
            <BrandGlyph className="size-4" />
            <span className="font-display text-xs font-bold text-white">TalentOS</span>
          </div>
          {["Careers", "Studio", "Materials", "Preferences"].map((item, i) => (
            <div
              key={item}
              className={`mb-0.5 rounded-control px-2 py-1.5 text-xs font-medium ${i === 0 ? "bg-emerald-500/10 text-emerald-400" : "text-slate-500"}`}
            >
              {item}
            </div>
          ))}
        </div>
        <div className="flex-1 p-4">
          <div className="mb-3 flex items-center justify-between">
            <span className="font-mono text-xs font-semibold uppercase tracking-wider text-emerald-400">
              3 New Matches · Last run 4m ago
            </span>
            <span className="rounded-full border border-emerald-500/20 bg-emerald-950/30 px-2 py-0.5 font-mono text-xs text-emerald-400">
              ● Running
            </span>
          </div>
          <div className="space-y-2">
            {jobs.map((job, i) => (
              <motion.div
                key={job.title}
                initial={{ opacity: 0, x: -10 }}
                whileInView={{ opacity: 1, x: 0 }}
                viewport={{ once: true }}
                transition={{ delay: 0.1 * i + 0.3, duration: 0.4 }}
                className="flex items-center justify-between rounded-control border border-line bg-surface-1 p-3"
              >
                <div>
                  <p className="text-xs font-semibold text-white">{job.title}</p>
                  <p className="mt-0.5 font-mono text-xs text-slate-500">{job.company} · via {job.source}</p>
                </div>
                <span
                  className={`rounded-full border px-2 py-0.5 text-xs font-semibold ${
                    job.strength === "strong"
                      ? "border-emerald-500/20 bg-emerald-950/60 text-emerald-400"
                      : "border-sky-500/20 bg-sky-950/60 text-sky-400"
                  }`}
                >
                  {job.strength}
                </span>
              </motion.div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Simulator step data ────────────────────────────────────────────────────────
const SIM_STEPS = [
  {
    step: 1,
    title: "1. Public ATS & Aggregator Ingestion",
    desc: "Direct keyless API discovery across Greenhouse, Lever, Ashby, SmartRecruiters, Remotive, and Arbeitnow.",
    lines: [
      { c: "text-emerald-400", t: "[INGESTION] Connected to 4 ATS endpoints + 3 Aggregators" },
      { c: "text-slate-400", t: "-> GET https://boards-api.greenhouse.io/v1/boards/stripe/jobs (200 OK)" },
      { c: "text-slate-400", t: "-> GET https://api.lever.co/v0/postings/retool?mode=json (200 OK)" },
      { c: "text-slate-400", t: "-> GET https://jobs.ashbyhq.com/api/non-auth/anthropic (200 OK)" },
      { c: "text-slate-400", t: "-> Ingested: 142 total raw postings from public sources." },
    ],
  },
  {
    step: 2,
    title: "2. Deterministic Regex Pre-Filter",
    desc: "Drops 90%+ of irrelevant titles, wrong seniorities, and unsupported locations before touching Vertex AI.",
    lines: [
      { c: "text-amber-400", t: "[PRE-FILTER] Deterministic rule evaluation (0 Vertex AI tokens consumed)" },
      { c: "text-rose-400/80", t: "x Dropped 48: title_not_in_target_titles" },
      { c: "text-rose-400/80", t: "x Dropped 34: seniority_above_target" },
      { c: "text-rose-400/80", t: "x Dropped 21: location_unsupported" },
      { c: "text-emerald-400 font-semibold", t: "v Admitted 8 postings for isolated Gemini judgment." },
    ],
  },
  {
    step: 3,
    title: "3. Gemini 3.6 Flash Fit Evaluation",
    desc: "Single-job isolated invocation evaluating candidate skills, GitHub repo activity, and 3-state qualification.",
    lines: [
      { c: "text-emerald-400", t: "[EVALUATOR] Invoking Gemini 3.6 Flash (Single Job Session)" },
      { c: "text-slate-400", t: 'Job: Staff AI Systems Engineer (Remote)' },
      { c: "text-slate-400", t: 'match: true, match_strength: "strong"' },
      { c: "text-slate-400", t: 'reasoning: "Candidate has 3+ yrs Python & LLM pipelines..."' },
      { c: "text-slate-400", t: 'missing_information: ["visa sponsorship not stated"]' },
    ],
  },
  {
    step: 4,
    title: "4. Tailored Artifact Generation",
    desc: "Outputs print-ready A4 tailored resumes, targeted cover letters, or high-conversion client pitches.",
    lines: [
      { c: "text-emerald-400", t: "[DRAFTER] Gemini 3.6 Flash Material Assembly" },
      { c: "text-slate-400", t: "-> Re-aligned resume bullet verbs with target job terminology." },
      { c: "text-slate-400", t: "-> Generated 200-word cover letter with verified GitHub refs." },
      { c: "text-slate-400", t: "-> HTML/CSS Print-ready A4 resume generated." },
      { c: "text-emerald-400 font-semibold", t: "v Ready for 1-Click Human Review." },
    ],
  },
];

// ══════════════════════════════════════════════════════════════════════════════
export function LandingPage() {
  const router = useRouter();
  const { user } = useAuth();
  const [showAuth, setShowAuth] = useState(false);
  const [activeSimStep, setActiveSimStep] = useState<number>(1);
  // The walkthrough plays itself until someone takes the wheel. It used to
  // keep advancing every 3s even after a click, so choosing a step and then
  // reading it was impossible.
  const [simAutoplay, setSimAutoplay] = useState(true);

  useEffect(() => {
    if (!simAutoplay) return;
    const t = setInterval(() => setActiveSimStep((p) => (p === 4 ? 1 : p + 1)), 4000);
    return () => clearInterval(t);
  }, [simAutoplay]);

  function selectSimStep(step: number) {
    setSimAutoplay(false);
    setActiveSimStep(step);
  }

  if (showAuth && !user) return <AuthScreen onBack={() => setShowAuth(false)} />;

  return (
    <div className="relative min-h-dvh bg-surface-0 text-slate-100 selection:bg-emerald-500/20 selection:text-emerald-300">
      <div className="pointer-events-none absolute inset-0 bg-grid-subtle opacity-40" />

      {/* ── HEADER ─────────────────────────────────────────────────────────── */}
      <header className="sticky top-0 z-40 border-b border-line bg-surface-0/90 backdrop-blur-md">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
          <div className="flex items-center gap-3">
            <BrandMark />
          </div>
          <nav className="hidden items-center gap-6 text-xs font-medium text-slate-400 md:flex">
            <a href="#careers" className="transition hover:text-white">Careers Stream</a>
            <a href="#studio" className="transition hover:text-white">Studio Stream</a>
            <a href="#simulator" className="transition hover:text-white">Interactive Engine</a>
            <a href="#architecture" className="transition hover:text-white">Architecture</a>
          </nav>
          <div className="flex items-center gap-3">
            <a
              href="https://github.com/Naman6019/all-things-agentic"
              target="_blank" rel="noreferrer"
              className="flex items-center gap-1.5 rounded-control border border-line-strong bg-white/[0.03] px-3 py-1.5 text-xs font-medium text-slate-300 transition hover:bg-white/[0.08] hover:text-white"
            >
              <GithubIcon className="size-3.5" />
              <span className="hidden sm:inline">GitHub</span>
            </a>
            {user ? (
              <Link href="/jobs" className="flex items-center gap-1.5 rounded-control bg-emerald-500 px-3.5 py-1.5 text-xs font-semibold text-surface-0 transition hover:bg-emerald-400">
                Open Workspace <ArrowRight className="size-3.5" />
              </Link>
            ) : (
              <button onClick={() => setShowAuth(true)} className="flex items-center gap-1.5 rounded-control bg-emerald-500 px-3.5 py-1.5 text-xs font-semibold text-surface-0 transition hover:bg-emerald-400">
                Sign In / Create Account <ArrowRight className="size-3.5" />
              </button>
            )}
          </div>
        </div>
      </header>

      {/* ── HERO — exact one viewport ───────────────────────────────────────── */}
      <section className="relative z-10 flex min-h-[calc(100dvh-4rem)] flex-col">
        {/* Split grid */}
        <div className="mx-auto flex w-full max-w-7xl flex-1 items-center px-4 py-10 sm:px-6 lg:px-8">
          <div className="grid w-full items-center gap-12 lg:grid-cols-2 lg:gap-16">

            {/* Left: headline + CTAs + stats */}
            <motion.div
              initial={{ opacity: 0, y: 32 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.65, ease: [0.22, 1, 0.36, 1] }}
              className="flex flex-col gap-7"
            >
              <div className="inline-flex w-fit items-center gap-2 rounded-full border border-emerald-500/20 bg-emerald-950/40 px-3 py-1 text-xs font-medium text-emerald-300">
                <span className="relative flex size-1.5">
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
                  <span className="relative inline-flex size-1.5 rounded-full bg-emerald-400" />
                </span>
                <span className="font-mono font-semibold tracking-wide">TASKMASTER TRACK</span>
                <span className="text-emerald-600">·</span>
                <span className="text-emerald-400/70">All Things Agentic Hackathon</span>
              </div>

              <div className="space-y-3">
                <h1 className="font-display text-5xl font-extrabold tracking-tight text-white sm:text-6xl sm:leading-[1.05]">
                  Your AI hunts jobs
                  <br />
                  <span className="relative inline-block">
                    <span className="relative z-10 bg-gradient-to-r from-emerald-400 to-teal-300 bg-clip-text text-transparent">
                      while you sleep.
                    </span>
                    <span className="absolute bottom-1 left-0 h-px w-full bg-gradient-to-r from-emerald-500/80 to-teal-400/0" aria-hidden />
                  </span>
                </h1>
                <p className="max-w-xl text-base leading-relaxed text-slate-400 sm:text-lg">
                  Continuous ATS discovery, 3-state Gemini reasoning, and print-ready tailored resumes —
                  all before you open your laptop.{" "}
                  <span className="text-slate-500">No hallucinated experience. No spam applications.</span>
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-3">
                {user ? (
                  <Link href="/jobs" className="group flex items-center gap-2 rounded-control bg-emerald-500 px-5 py-2.5 text-sm font-semibold text-surface-0 shadow-[0_0_24px_rgba(16,185,129,0.35)] transition hover:bg-emerald-400 hover:shadow-[0_0_36px_rgba(16,185,129,0.5)]">
                    Open Workspace <ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5" />
                  </Link>
                ) : (
                  <button onClick={() => setShowAuth(true)} className="group flex items-center gap-2 rounded-control bg-emerald-500 px-5 py-2.5 text-sm font-semibold text-surface-0 shadow-[0_0_24px_rgba(16,185,129,0.35)] transition hover:bg-emerald-400 hover:shadow-[0_0_36px_rgba(16,185,129,0.5)]">
                    Start for free — Create Account <ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5" />
                  </button>
                )}
                <a href="#careers" className="group flex items-center gap-2 rounded-control border border-line-strong bg-white/[0.04] px-5 py-2.5 text-sm font-medium text-slate-300 transition hover:bg-white/[0.08] hover:text-white">
                  Explore the platform <ChevronRight className="size-4 transition-transform group-hover:translate-x-0.5" />
                </a>
              </div>

              {/* 4 stat pills — 0% featured */}
              <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
                <div className="rounded-control border border-line bg-surface-1 px-3 py-2.5">
                  <span className="block font-mono text-xs uppercase tracking-wider text-slate-500">Filter Rate</span>
                  <span className="mt-0.5 block font-display text-xl font-bold text-white">90%+</span>
                  <span className="block text-xs text-slate-500">bad titles dropped</span>
                </div>
                <div className="rounded-control border border-emerald-500/15 bg-emerald-950/20 px-3 py-2.5">
                  <span className="block font-mono text-xs uppercase tracking-wider text-emerald-500">Reasoning</span>
                  <span className="mt-0.5 block font-display text-xl font-bold text-emerald-400">3-State</span>
                  <span className="block text-xs text-slate-500">MET · UNMET · GAP</span>
                </div>
                {/* Featured: 0% Fabrication */}
                <div className="relative rounded-control border border-emerald-500/30 bg-surface-1 px-3 py-2.5 shadow-[0_0_18px_rgba(16,185,129,0.15)]">
                  <span className="absolute -top-2 left-3 rounded-full bg-emerald-500 px-1.5 py-px font-mono text-xs font-bold text-surface-0">ZERO</span>
                  <span className="block font-mono text-xs uppercase tracking-wider text-slate-500">Fabrication</span>
                  <span className="mt-0.5 block font-display text-xl font-bold text-white">0%</span>
                  <span className="block text-xs text-slate-500">verified data only</span>
                </div>
                <div className="rounded-control border border-line bg-surface-1 px-3 py-2.5">
                  <span className="block font-mono text-xs uppercase tracking-wider text-slate-500">Test Suite</span>
                  <span className="mt-0.5 block font-display text-xl font-bold text-slate-200">235+</span>
                  <span className="block text-xs text-slate-500">100% offline pass</span>
                </div>
              </div>
            </motion.div>

            {/* Right: DataFlowBeams */}
            <motion.div
              initial={{ opacity: 0, scale: 0.96 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1], delay: 0.15 }}
              className="relative flex items-center justify-center lg:justify-end"
            >
              <div
                className="pointer-events-none absolute inset-0 rounded-surface"
                style={{ background: "radial-gradient(ellipse 70% 60% at 50% 50%, rgba(16,185,129,0.07) 0%, rgba(16,185,129,0.02) 50%, transparent 100%)" }}
                aria-hidden
              />
              <div className="relative w-full max-w-lg rounded-surface border border-line bg-surface-1/80 p-6 shadow-[0_32px_80px_rgba(0,0,0,0.6)] backdrop-blur-sm">
                <div className="mb-4 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="relative flex size-2">
                      <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-60" />
                      <span className="relative inline-flex size-2 rounded-full bg-emerald-400" />
                    </span>
                    <span className="font-mono text-xs font-semibold uppercase tracking-wider text-emerald-400">Live Pipeline · Running</span>
                  </div>
                  <span className="font-mono text-xs text-slate-500">Gemini 3.6 Flash · Vertex AI</span>
                </div>
                <DataFlowBeams />
                <div className="mt-4 flex items-center justify-between border-t border-line pt-3">
                  <div className="flex items-center gap-3 text-xs text-slate-500">
                    <span className="flex items-center gap-1"><span className="size-1.5 rounded-full bg-emerald-400" />ATS Feeds</span>
                    <span className="flex items-center gap-1"><span className="size-1.5 rounded-full bg-amber-400" />Freelance Feeds</span>
                  </div>
                  <span className="font-mono text-xs text-slate-500">Human-in-the-loop</span>
                </div>
              </div>
            </motion.div>
          </div>
        </div>

        {/* Marquee anchored at bottom of viewport */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.6, delay: 0.5 }}
          className="border-t border-line bg-surface-sunken py-5"
        >
          <ScrollVelocityContainer className="font-display text-lg font-extrabold uppercase tracking-wider text-slate-300 sm:text-xl">
            <ScrollVelocityRow baseVelocity={2} direction={1} scrollReactivity={false} className="py-0.5">
              <span className="mx-5 inline-flex items-center gap-2.5">
                <Image src="/ashbyhq_logo.jpeg" alt="Ashby" width={20} height={20} className="size-5 rounded-sm object-cover" />
                <span>Ashby ATS</span>
              </span>
              <span className="mx-5 inline-flex items-center gap-2.5"><span className="size-2 rounded-full bg-emerald-400" /><span>Greenhouse API</span></span>
              <span className="mx-5 inline-flex items-center gap-2.5"><span className="size-2 rounded-full bg-sky-400" /><span>Lever Postings</span></span>
              <span className="mx-5 inline-flex items-center gap-2.5"><span className="size-2 rounded-full bg-teal-400" /><span>SmartRecruiters</span></span>
              <span className="mx-5 inline-flex items-center gap-2.5">
                <Image src="/contra.jpg" alt="Contra" width={20} height={20} className="size-5 rounded-sm object-cover" />
                <span>Contra Freelance</span>
              </span>
              <span className="mx-5 inline-flex items-center gap-2.5">
                <Image src="/reddit.png" alt="Reddit" width={20} height={20} className="size-5 rounded-sm object-cover" />
                <span>Reddit r/forhire</span>
              </span>
              <span className="mx-5 inline-flex items-center gap-2.5">
                <Image src="/wwr.png" alt="WWR" width={20} height={20} className="size-5 rounded-sm object-cover" />
                <span>We Work Remotely</span>
              </span>
              <span className="mx-5 inline-flex items-center gap-2.5"><span className="size-2 rounded-full bg-amber-400" /><span>RemoteOK &amp; Remotive</span></span>
            </ScrollVelocityRow>
            <ScrollVelocityRow baseVelocity={1.5} direction={-1} scrollReactivity={false} className="py-0.5 text-slate-500">
              <span className="mx-5 inline-flex items-center gap-2 font-mono text-sm tracking-normal text-emerald-400">✦ 0% EXPERIENCE FABRICATION</span>
              <span className="mx-5 inline-flex items-center gap-2 font-mono text-sm tracking-normal">✦ STRICT 3-STATE QUALIFICATION</span>
              <span className="mx-5 inline-flex items-center gap-2 font-mono text-sm tracking-normal text-amber-400">✦ 1-CLICK HUMAN APPROVAL</span>
              <span className="mx-5 inline-flex items-center gap-2 font-mono text-sm tracking-normal">✦ GOOGLE ADK + VERTEX AI</span>
              <span className="mx-5 inline-flex items-center gap-2 font-mono text-sm tracking-normal text-sky-400">✦ DURABLE FIRESTORE DEDUPLICATION</span>
              <span className="mx-5 inline-flex items-center gap-2 font-mono text-sm tracking-normal">✦ LANGGRAPH STATE MACHINE</span>
            </ScrollVelocityRow>
          </ScrollVelocityContainer>
        </motion.div>
      </section>

      {/* ── PRODUCT PREVIEW ─────────────────────────────────────────────────── */}
      <Reveal>
        <section className="border-t border-line bg-surface-0 py-20">
          <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
            <div className="mx-auto mb-10 max-w-2xl text-center">
              <span className="font-mono text-xs font-semibold uppercase tracking-wider text-emerald-400">Inside the Workspace</span>
              <h2 className="mt-2 font-display text-3xl font-extrabold text-white">Review. Approve. Apply in one click.</h2>
              <p className="mt-2 text-sm text-slate-400">
                Every match arrives fully enriched — tailored resume, cover letter, match reasoning, and verified contact. You only see what is worth your time.
              </p>
            </div>
            <DashboardMockup />
          </div>
        </section>
      </Reveal>

      {/* ── DUAL STREAM ─────────────────────────────────────────────────────── */}
      <section className="py-20">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <Reveal>
            <div className="mx-auto mb-14 max-w-2xl text-center">
              <span className="font-mono text-xs font-semibold uppercase tracking-wider text-emerald-400">Dual-Stream Architecture</span>
              <h2 className="mt-2 font-display text-3xl font-extrabold text-white">Two Autonomous Pipelines. One Unified Engine.</h2>
              <p className="mt-2 text-sm text-slate-400">
                Engineered to discover, filter, reason, and draft tailored materials for both full-time engineering roles and high-value freelance contracts.
              </p>
            </div>
          </Reveal>
          <div className="grid gap-8 md:grid-cols-2">
            <Reveal delay={0.05}>
              <div id="careers" className="h-full space-y-6 rounded-surface border border-line bg-surface-1 p-8">
                <div className="flex items-center justify-between">
                  <span className="font-mono text-xs font-semibold uppercase tracking-wider text-emerald-400">Stream 01 // Primary Track</span>
                  <span className="rounded-full border border-emerald-500/20 bg-emerald-950/40 px-2.5 py-0.5 text-xs text-emerald-300">Taskmaster</span>
                </div>
                <div>
                  <h3 className="font-display text-2xl font-bold text-white">TalentOS // Careers</h3>
                  <p className="mt-1 text-sm leading-relaxed text-slate-400">
                    Autonomous full-time opportunity intelligence pipeline discovering listings across Greenhouse, Lever, Ashby, and SmartRecruiters.
                  </p>
                </div>
                <ul className="space-y-3 text-xs text-slate-300">
                  <li className="flex items-start gap-2.5"><CheckCircle2 className="mt-0.5 size-4 shrink-0 text-emerald-400" /><span><strong>Search-Grounded Board Scout:</strong> Google Search Grounding dynamically finds newly launched career portals.</span></li>
                  <li className="flex items-start gap-2.5"><CheckCircle2 className="mt-0.5 size-4 shrink-0 text-emerald-400" /><span><strong>Strict 3-State Reasoning:</strong> Never rejects for missing salary or visa data — silence is not a rejection.</span></li>
                  <li className="flex items-start gap-2.5"><CheckCircle2 className="mt-0.5 size-4 shrink-0 text-emerald-400" /><span><strong>Print-Ready A4 Resume Studio:</strong> Re-orders real experience without hallucinating dates or employers.</span></li>
                </ul>
                <button onClick={() => (user ? router.push("/jobs") : setShowAuth(true))} className="flex w-full items-center justify-center gap-2 rounded-control bg-emerald-500 px-4 py-2.5 text-xs font-semibold text-surface-0 transition hover:bg-emerald-400">
                  Launch Careers Pipeline <ArrowRight className="size-3.5" />
                </button>
              </div>
            </Reveal>
            <Reveal delay={0.1}>
              <div id="studio" className="h-full space-y-6 rounded-surface border border-line bg-surface-1 p-8">
                <div className="flex items-center justify-between">
                  <span className="font-mono text-xs font-semibold uppercase tracking-wider text-amber-400">Stream 02 // Secondary Track</span>
                  <span className="rounded-full border border-amber-500/20 bg-amber-950/40 px-2.5 py-0.5 text-xs text-amber-300">Taskmaster</span>
                </div>
                <div>
                  <h3 className="font-display text-2xl font-bold text-white">TalentOS // Studio</h3>
                  <p className="mt-1 text-sm leading-relaxed text-slate-400">
                    Autonomous freelance client intelligence monitoring r/forhire, We Work Remotely, and Contra with personalized pitch drafting.
                  </p>
                </div>
                <ul className="space-y-3 text-xs text-slate-300">
                  <li className="flex items-start gap-2.5"><CheckCircle2 className="mt-0.5 size-4 shrink-0 text-amber-400" /><span><strong>Public Hiring Board Ingestion:</strong> Continuous RSS and JSON feed ingestion across Reddit, WWR, and Contra.</span></li>
                  <li className="flex items-start gap-2.5"><CheckCircle2 className="mt-0.5 size-4 shrink-0 text-amber-400" /><span><strong>Budget and Scope Extraction:</strong> Evaluates project timeline, client budget, and stack feasibility.</span></li>
                  <li className="flex items-start gap-2.5"><CheckCircle2 className="mt-0.5 size-4 shrink-0 text-amber-400" /><span><strong>High-Conversion Pitch Drafter:</strong> 100-200 word outreach with verified portfolio anchors.</span></li>
                </ul>
                <button onClick={() => (user ? router.push("/freelance") : setShowAuth(true))} className="flex w-full items-center justify-center gap-2 rounded-control bg-amber-500 px-4 py-2.5 text-xs font-semibold text-surface-0 transition hover:bg-amber-400">
                  Launch Studio Pipeline <ArrowRight className="size-3.5" />
                </button>
              </div>
            </Reveal>
          </div>
        </div>
      </section>

      {/* ── SIMULATOR ───────────────────────────────────────────────────────── */}
      <Reveal>
        <section id="simulator" className="border-t border-line bg-surface-1 py-20">
          <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
            <div className="mx-auto max-w-2xl text-center">
              <span className="font-mono text-xs font-semibold uppercase tracking-wider text-emerald-400">Live Architecture Walkthrough</span>
              <h2 className="mt-2 font-display text-3xl font-extrabold text-white">Deterministic Ingestion Meets Isolated Gemini Reasoning</h2>
              <p className="mt-2 text-sm text-slate-400">The model is not the control flow. Heavy data fetching runs in standard Python — isolating Vertex AI to qualitative fit judgments only.</p>
            </div>
            {/* Step dot progress */}
            <div className="mb-6 mt-6 flex justify-center gap-2">
              {SIM_STEPS.map((s) => (
                <button key={s.step} onClick={() => selectSimStep(s.step)}
                  className={`h-1.5 rounded-full transition-all duration-300 ${activeSimStep === s.step ? "w-8 bg-emerald-400" : "w-3 bg-white/10 hover:bg-white/20"}`}
                  aria-label={`Step ${s.step}`}
                />
              ))}
            </div>
            <div className="mt-8 grid gap-8 lg:grid-cols-12">
              <div className="space-y-3 lg:col-span-4">
                {SIM_STEPS.map((item) => (
                  <button key={item.step} onClick={() => selectSimStep(item.step)}
                    className={`w-full rounded-control border p-4 text-left transition ${activeSimStep === item.step ? "border-emerald-500/30 bg-surface-2 shadow-[0_0_20px_rgba(16,185,129,0.08)]" : "border-line bg-surface-1 hover:border-line-strong"}`}
                  >
                    <span className={`block font-display text-sm font-bold ${activeSimStep === item.step ? "text-white" : "text-slate-400"}`}>{item.title}</span>
                    <span className="mt-1 block text-xs leading-relaxed text-slate-500">{item.desc}</span>
                  </button>
                ))}
              </div>
              <div className="flex flex-col overflow-hidden rounded-surface border border-line bg-surface-0 p-6 font-mono text-xs lg:col-span-8">
                <div className="flex items-center justify-between border-b border-line pb-3 text-slate-400">
                  <div className="flex items-center gap-2">
                    <Terminal className="size-4 text-emerald-400" />
                    <span>pipeline_trace.json — Step {activeSimStep} of 4</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="relative flex size-1.5">
                      <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
                      <span className="relative inline-flex size-1.5 rounded-full bg-emerald-400" />
                    </span>
                    <span className="text-xs text-slate-500">Vertex AI (global) · Live</span>
                  </div>
                </div>
                <motion.div
                  key={activeSimStep}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.3 }}
                  className="mt-4 space-y-2 overflow-y-auto leading-relaxed"
                >
                  {SIM_STEPS[activeSimStep - 1].lines.map((line, i) => (
                    <p key={i} className={line.c}>{line.t}</p>
                  ))}
                  <p className="text-slate-500">
                    <span className="text-emerald-400">$</span>{" "}
                    <span className="inline-block h-3.5 w-2 translate-y-0.5 animate-pulse bg-emerald-400/70" />
                  </p>
                </motion.div>

                {/* Pins the panel's footer to the bottom so the trace box stays
                    the same height as the step list beside it instead of
                    leaving a third of itself empty. */}
                <div className="mt-auto flex items-center justify-between border-t border-line pt-3 text-slate-500">
                  <span>
                    {simAutoplay ? "Autoplaying — click a step to take over" : "Manual — you are driving"}
                  </span>
                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => selectSimStep(activeSimStep === 1 ? 4 : activeSimStep - 1)}
                      aria-label="Previous pipeline step"
                      className="rounded-control border border-line px-2 py-1 transition hover:bg-white/5 hover:text-white"
                    >
                      ←
                    </button>
                    <button
                      type="button"
                      onClick={() => selectSimStep(activeSimStep === 4 ? 1 : activeSimStep + 1)}
                      aria-label="Next pipeline step"
                      className="rounded-control border border-line px-2 py-1 transition hover:bg-white/5 hover:text-white"
                    >
                      →
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>
      </Reveal>

      {/* ── ARCHITECTURE ────────────────────────────────────────────────────── */}
      <Reveal>
        <section id="architecture" className="border-t border-line bg-surface-0 py-20">
          <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
            <div className="mx-auto mb-12 max-w-2xl text-center">
              <span className="font-mono text-xs font-semibold uppercase tracking-wider text-slate-400">Architectural Rationale</span>
              <h2 className="mt-2 font-display text-3xl font-extrabold text-white">Anti-AI-Slop Engineering Principles</h2>
              <p className="mt-2 text-sm text-slate-400">Strict architectural tenets prevent cost explosion, token drift, and compliance violations.</p>
            </div>
            <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
              {[
                { icon: <Cpu className="size-4" />, color: "text-slate-300", title: "Model Is Not Control Flow", desc: "Deterministic Python handles fetching, deduplication, and scheduling. LLM is reserved for qualitative fit judgment only." },
                { icon: <Layers className="size-4" />, color: "text-emerald-400", title: "Pre-Filter Drop Accounting", desc: "Cheap regex rules drop ~90%+ of irrelevant jobs before Vertex AI. Every drop reason is tracked in run telemetry." },
                { icon: <ShieldAlert className="size-4" />, color: "text-amber-400", title: "No Direct Bot Submissions", desc: "Strict anti-automation guardrails protect platform TOS. Final submission is always a 1-click human action." },
                { icon: <FileCode2 className="size-4" />, color: "text-teal-400", title: "Durable Deduplication", desc: "Firestore seen markers written only after verdicts are stored — 429 errors never burn unseen opportunities." },
              ].map((card, i) => (
                <Reveal key={card.title} delay={i * 0.07}>
                  <div className="h-full space-y-3 rounded-surface border border-line bg-surface-1 p-6">
                    <div className={`grid size-8 place-items-center rounded-control border border-line-strong bg-white/5 ${card.color}`}>{card.icon}</div>
                    <h4 className="font-display text-base font-bold text-white">{card.title}</h4>
                    <p className="text-xs leading-relaxed text-slate-400">{card.desc}</p>
                  </div>
                </Reveal>
              ))}
            </div>
          </div>
        </section>
      </Reveal>

      {/* ── FOOTER ──────────────────────────────────────────────────────────── */}
      <footer className="border-t border-line bg-surface-0 py-10">
        <div className="mx-auto flex max-w-7xl flex-col gap-6 px-4 sm:flex-row sm:items-center sm:justify-between sm:px-6 lg:px-8">
          <div className="flex items-center gap-2 text-xs text-slate-500">
            <span className="font-bold text-slate-300">TalentOS</span>
            <span>·</span><span>All Things Agentic Hackathon</span>
          </div>
          <div className="flex items-center gap-5 text-xs text-slate-400">
            <a href="#careers" className="transition hover:text-white">Careers Stream</a>
            <a href="#studio" className="transition hover:text-white">Studio Stream</a>
            <a href="https://github.com/Naman6019/all-things-agentic" target="_blank" rel="noreferrer" className="transition hover:text-white">GitHub</a>
            <button onClick={() => setShowAuth(true)} className="transition hover:text-white">Sign In</button>
          </div>
        </div>
      </footer>
    </div>
  );
}
