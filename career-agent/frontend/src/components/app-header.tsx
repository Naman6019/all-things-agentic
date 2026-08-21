"use client";

import { BriefcaseBusiness, LogOut, Search, Sliders } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import type { ReactNode } from "react";
import { useAuth } from "@/components/auth-provider";
import { cn } from "@/lib/utils";

export type Stream = "careers" | "studio";

/**
 * The TalentOS star mark, on its own. Sized by the caller so the glyph can sit
 * anywhere the lockup does not fit — nav squares, auth cards, the mockup rail.
 */
export function BrandGlyph({ className = "size-8" }: { className?: string }) {
  return (
    <Image
      src="/brand/talentos-mark.png"
      alt=""
      width={512}
      height={512}
      priority
      aria-hidden
      className={cn("shrink-0 object-contain", className)}
    />
  );
}

/** The TalentOS lockup. Shared so the mark can never drift between screens. */
export function BrandMark({ href = "/" }: { href?: string }) {
  return (
    <Link
      href={href}
      className="flex items-center gap-2.5 transition hover:opacity-80"
      aria-label="TalentOS home"
    >
      <BrandGlyph className="size-8" />
      <span className="font-display text-lg font-bold tracking-tight text-white">TalentOS</span>
    </Link>
  );
}

const streamLinks: { stream: Stream; href: string; label: string; icon: typeof Search }[] = [
  { stream: "careers", href: "/jobs", label: "Careers", icon: Search },
  { stream: "studio", href: "/freelance", label: "Studio", icon: BriefcaseBusiness },
];

function StreamNav({ active, className }: { active?: Stream; className?: string }) {
  return (
    <nav
      aria-label="Pipeline stream"
      className={cn("flex items-center gap-1 rounded-control border border-line-strong bg-white/5 p-1", className)}
    >
      {streamLinks.map(({ stream, href, label, icon: Icon }) => {
        const isActive = active === stream;
        return (
          <Link
            key={stream}
            href={href}
            aria-current={isActive ? "page" : undefined}
            className={cn(
              "flex flex-1 items-center justify-center gap-1.5 rounded-control px-3 py-1.5 text-xs font-semibold transition",
              isActive
                ? stream === "careers"
                  ? "bg-careers/20 text-emerald-300"
                  : "bg-studio/20 text-amber-300"
                : "text-slate-400 hover:bg-white/5 hover:text-white",
            )}
          >
            <Icon className="size-3.5" aria-hidden />
            <span>{label}</span>
          </Link>
        );
      })}
    </nav>
  );
}

/**
 * One header for every signed-in screen. This markup used to be copy-pasted
 * into seven components and had already drifted — different z-indexes, a
 * settings link on some screens and not others, two different cadence claims.
 */
export function AppHeader({
  stream,
  status,
  actions,
  settingsHref,
  settingsLabel = "Search preferences",
}: {
  stream?: Stream;
  /** Small live-status pill, e.g. the run cadence. Hidden below `lg`. */
  status?: ReactNode;
  /** Screen-specific buttons, rendered before the settings and sign-out controls. */
  actions?: ReactNode;
  settingsHref?: string;
  settingsLabel?: string;
}) {
  const { user, logout } = useAuth();
  const resolvedSettingsHref =
    settingsHref ?? (stream === "studio" ? "/freelance/settings" : "/settings");

  return (
    <header className="sticky top-0 z-40 border-b border-line bg-surface-0/90 backdrop-blur-md">
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between gap-3 px-4 sm:px-6 lg:px-8">
        <div className="flex min-w-0 items-center gap-3">
          <BrandMark />
          <StreamNav active={stream} className="hidden md:flex" />
        </div>

        <div className="flex shrink-0 items-center gap-2 sm:gap-3">
          {status && <div className="hidden lg:block">{status}</div>}
          {actions}
          {user && (
            <>
              <Link
                href={resolvedSettingsHref}
                aria-label={settingsLabel}
                title={settingsLabel}
                className="grid size-8 place-items-center rounded-control border border-line-strong bg-white/5 text-slate-400 transition hover:bg-white/10 hover:text-white"
              >
                <Sliders className="size-4" aria-hidden />
              </Link>
              <span className="hidden h-4 w-px bg-white/10 sm:block" aria-hidden />
              <button
                type="button"
                onClick={() => void logout()}
                aria-label="Sign out"
                title="Sign out"
                className="grid size-8 place-items-center rounded-control text-slate-400 transition hover:bg-white/5 hover:text-white"
              >
                <LogOut className="size-4" aria-hidden />
              </button>
            </>
          )}
        </div>
      </div>

      {/* On phones the stream switcher moves to its own row. It used to be
          `md:flex` only, which left no way to change stream on a phone. */}
      <div className="border-t border-line px-4 py-2 md:hidden">
        <StreamNav active={stream} />
      </div>
    </header>
  );
}
