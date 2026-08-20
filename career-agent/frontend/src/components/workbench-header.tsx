"use client";

import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * The header for focused, one-document screens — the material editor, the
 * pitch editor, and both settings pages. All four had their own copy of this
 * markup, which is why their sticky offsets and paddings had drifted apart.
 */
export function WorkbenchHeader({
  backHref,
  backLabel,
  title,
  actions,
  width = "max-w-4xl",
}: {
  backHref: string;
  backLabel: string;
  title: string;
  actions?: ReactNode;
  width?: string;
}) {
  return (
    <header className="sticky top-0 z-40 border-b border-line bg-surface-0/90 backdrop-blur-md">
      <div className={cn("mx-auto flex h-16 items-center justify-between gap-3 px-4 sm:px-6", width)}>
        <Link
          href={backHref}
          className="flex shrink-0 items-center gap-2 rounded-control border border-line-strong bg-white/5 px-3 py-1.5 text-xs font-medium text-slate-300 transition hover:bg-white/10 hover:text-white"
        >
          <ArrowLeft className="size-3.5" aria-hidden />
          <span className="hidden sm:inline">{backLabel}</span>
        </Link>
        <span className="min-w-0 truncate font-display text-sm font-bold text-white">{title}</span>
        <div className="flex shrink-0 items-center gap-2">{actions}</div>
      </div>
    </header>
  );
}
