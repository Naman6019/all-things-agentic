"use client";

import { BriefcaseBusiness, Search, ShieldCheck, Sparkles } from "lucide-react";
import Link from "next/link";
import { useAuth } from "@/components/auth-provider";

export function AgentLauncher() {
  const { user, logout } = useAuth();
  const firstName = user?.displayName?.split(" ")[0] || "there";

  return (
    <div className="min-h-dvh bg-[#f5f7f7]">
      <header className="border-b border-[#dce4e1] bg-white">
        <div className="mx-auto flex h-16 max-w-[1200px] items-center justify-between px-4 sm:px-6 lg:px-8">
          <div className="flex items-center gap-3">
            <div className="grid size-9 place-items-center rounded-xl bg-[#153b32] text-white">
              <Sparkles className="size-4" />
            </div>
            <span className="font-semibold text-[#17211e]">TalentOS</span>
            <span className="hidden rounded-full bg-[#eef3f1] px-2.5 py-1 text-xs font-medium text-[#53635e] sm:inline">
              An AllStackLabs Product
            </span>
          </div>
          <div className="flex items-center gap-3">
            <span className="hidden text-sm font-medium text-[#25312d] sm:block">{user?.displayName || user?.email}</span>
            <button
              type="button"
              aria-label="Sign out"
              onClick={() => void logout()}
              className="rounded-lg px-3 py-1.5 text-sm font-medium text-[#53635e] hover:bg-[#f0f3f2] hover:text-[#25312d]"
            >
              Sign out
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-[1200px] px-4 py-12 sm:px-6 lg:px-8 lg:py-20">
        <div className="text-center">
          <p className="text-sm font-semibold uppercase tracking-wide text-[#0f6b55]">Your opportunity workspace</p>
          <h1 className="mt-3 text-balance text-4xl font-semibold text-[#17211e] sm:text-5xl">
            Good to see you, {firstName}.
          </h1>
          <p className="mx-auto mt-4 max-w-xl text-pretty text-lg leading-8 text-[#64726d]">
            Two agents, one workspace. Find your next role or your next client — both autonomous, both human-approved.
          </p>
        </div>

        <div className="mx-auto mt-12 grid max-w-3xl gap-6 sm:grid-cols-2">
          <Link
            href="/jobs"
            className="group rounded-3xl border border-[#dce4e1] bg-white p-8 shadow-sm transition hover:border-[#b5c9c2] hover:shadow-md"
          >
            <div className="flex items-center gap-3">
              <div className="grid size-12 place-items-center rounded-2xl bg-[#e8f3ef] text-[#0f6b55]">
                <Search className="size-5" />
              </div>
              <div>
                <h2 className="text-xl font-semibold text-[#17211e]">TalentOS // Careers</h2>
                <p className="text-sm text-[#7a8782]">Full-time job search</p>
              </div>
            </div>
            <p className="mt-5 text-pretty text-sm leading-6 text-[#5e6d67]">
              Discovers postings across public ATS and aggregators, validates requirements via per-job reasoning, and drafts tailored resumes with cover letters. You review and apply.
            </p>
            <div className="mt-6 flex items-center gap-2 text-sm font-semibold text-[#0f6b55]">
              Open Careers
              <span className="transition group-hover:translate-x-0.5">&rarr;</span>
            </div>
          </Link>

          <Link
            href="/freelance"
            className="group rounded-3xl border border-[#dce4e1] bg-white p-8 shadow-sm transition hover:border-[#b5c9c2] hover:shadow-md"
          >
            <div className="flex items-center gap-3">
              <div className="grid size-12 place-items-center rounded-2xl bg-[#f4eceb] text-[#8b423a]">
                <BriefcaseBusiness className="size-5" />
              </div>
              <div>
                <h2 className="text-xl font-semibold text-[#17211e]">TalentOS // Studio</h2>
                <p className="text-sm text-[#7a8782]">Freelance client pipeline</p>
              </div>
            </div>
            <p className="mt-5 text-pretty text-sm leading-6 text-[#5e6d67]">
              Monitors public hiring boards for freelance gigs, scores fit against your services, and drafts high-conversion pitches with deep-link send assistance. You review and send.
            </p>
            <div className="mt-6 flex items-center gap-2 text-sm font-semibold text-[#8b423a]">
              Open Studio
              <span className="transition group-hover:translate-x-0.5">&rarr;</span>
            </div>
          </Link>
        </div>

        <div className="mx-auto mt-10 flex max-w-3xl items-center justify-center gap-2 text-sm text-[#7a8782]">
          <ShieldCheck className="size-4 text-[#0f6b55]" />
          Both agents draft and find. You always make the final send.
        </div>
      </main>
    </div>
  );
}