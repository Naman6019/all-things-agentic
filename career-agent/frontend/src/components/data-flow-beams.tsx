"use client";

import React, { forwardRef, useRef } from "react";
import Image from "next/image";
import { AnimatedBeam } from "@/components/ui/animated-beam";
import { Briefcase, Send, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";

const Circle = forwardRef<
  HTMLDivElement,
  { className?: string; children?: React.ReactNode; title?: string }
>(({ className, children, title }, ref) => {
  return (
    <div
      ref={ref}
      title={title}
      className={cn(
        "z-10 flex size-12 items-center justify-center rounded-full bg-white shadow-[0_8px_30px_rgba(0,0,0,0.5)] border border-line-strong overflow-hidden transition-transform hover:scale-110",
        className
      )}
    >
      {children}
    </div>
  );
});

Circle.displayName = "Circle";

// Greenhouse — kept as SVG (no logo file provided)
function GreenhouseIcon() {
  return (
    <svg className="size-7" viewBox="0 0 24 24" fill="none">
      <rect width="24" height="24" fill="#047a55" />
      <path d="M12 4L5 9.5V19H19V9.5L12 4Z" fill="#047a55" />
      <rect width="24" height="24" fill="#047a55" />
      <text x="4" y="17" fontSize="13" fontWeight="900" fill="white" fontFamily="sans-serif">G</text>
    </svg>
  );
}

// Lever — kept as SVG (no logo file provided)
function LeverIcon() {
  return (
    <svg className="size-7" viewBox="0 0 24 24" fill="none">
      <rect width="24" height="24" fill="#1b5a90" />
      <text x="3" y="17" fontSize="11" fontWeight="900" fill="white" fontFamily="sans-serif">Lvr</text>
    </svg>
  );
}

export function DataFlowBeams() {
  const containerRef = useRef<HTMLDivElement>(null);

  // 3 ATS Sources (Top-Left column)
  const greenhouseRef = useRef<HTMLDivElement>(null);
  const leverRef = useRef<HTMLDivElement>(null);
  const ashbyRef = useRef<HTMLDivElement>(null);

  // 3 Freelance Sources (Top-Right column)
  const contraRef = useRef<HTMLDivElement>(null);
  const redditRef = useRef<HTMLDivElement>(null);
  const wwrRef = useRef<HTMLDivElement>(null);

  // Central TalentOS Autonomous Engine Node
  const engineRef = useRef<HTMLDivElement>(null);

  // 2 Destination Stream Nodes (Bottom row)
  const careersStreamRef = useRef<HTMLDivElement>(null);
  const studioStreamRef = useRef<HTMLDivElement>(null);

  return (
    <div
      ref={containerRef}
      className="relative flex flex-col h-[340px] w-full max-w-xl items-center justify-between select-none mx-auto"
    >
      {/* ── TOP ROW: 3 ATS  |  Engine  |  3 Freelance ── */}
      <div className="flex w-full items-center justify-between h-[220px]">

        {/* Left Column: ATS Job Sources */}
        <div className="flex flex-col justify-between h-full py-1">
          <Circle ref={greenhouseRef} title="Greenhouse ATS">
            <GreenhouseIcon />
          </Circle>
          <Circle ref={leverRef} title="Lever Postings">
            <LeverIcon />
          </Circle>
          <Circle ref={ashbyRef} title="Ashby ATS" className="p-0">
            <Image
              src="/ashbyhq_logo.jpeg"
              alt="Ashby"
              width={48}
              height={48}
              className="w-full h-full object-cover"
            />
          </Circle>
        </div>

        {/* Center: TalentOS Autonomous Engine */}
        <div className="flex flex-col justify-center items-center">
          <Circle
            ref={engineRef}
            className="size-16 border-2 border-emerald-500/50 shadow-[0_0_40px_rgba(16,185,129,0.4)] bg-[#0e1f18]"
            title="TalentOS Autonomous Engine — Gemini 3.6 Flash"
          >
            <div className="grid size-10 place-items-center rounded-full bg-emerald-50 text-emerald-600">
              <Sparkles className="size-5" />
            </div>
          </Circle>
        </div>

        {/* Right Column: Freelance Sources */}
        <div className="flex flex-col justify-between h-full py-1">
          <Circle ref={contraRef} title="Contra Freelance" className="p-0">
            <Image
              src="/contra.jpg"
              alt="Contra"
              width={48}
              height={48}
              className="w-full h-full object-cover"
            />
          </Circle>
          <Circle ref={redditRef} title="Reddit r/forhire" className="p-0">
            <Image
              src="/reddit.png"
              alt="Reddit r/forhire"
              width={48}
              height={48}
              className="w-full h-full object-cover"
            />
          </Circle>
          <Circle ref={wwrRef} title="We Work Remotely" className="p-0">
            <Image
              src="/wwr.png"
              alt="We Work Remotely"
              width={48}
              height={48}
              className="w-full h-full object-cover"
            />
          </Circle>
        </div>

      </div>

      {/* ── BOTTOM ROW: Careers Stream  |  Studio Stream ── */}
      <div className="flex w-full items-center justify-around px-8 mt-2">

        {/* Careers Stream (skewed left — closer to ATS side) */}
        <div className="flex flex-col items-center gap-1.5">
          <Circle
            ref={careersStreamRef}
            className="size-11 border-2 border-emerald-500/40 shadow-[0_0_20px_rgba(16,185,129,0.25)] bg-[#0e1f18]"
            title="TalentOS // Careers — Tailored Resumes & Matches"
          >
            <div className="grid size-7 place-items-center rounded-full bg-emerald-500/10 text-emerald-500">
              <Briefcase className="size-4" />
            </div>
          </Circle>
          <span className="font-mono text-xs font-bold text-emerald-400 text-center leading-tight">
            Careers
          </span>
        </div>

        {/* Studio Stream (skewed right — closer to Freelance side) */}
        <div className="flex flex-col items-center gap-1.5">
          <Circle
            ref={studioStreamRef}
            className="size-11 border-2 border-amber-500/40 shadow-[0_0_20px_rgba(245,158,11,0.25)] bg-[#1f170a]"
            title="TalentOS // Studio — Client Pitches & Outreach"
          >
            <div className="grid size-7 place-items-center rounded-full bg-amber-500/10 text-amber-500">
              <Send className="size-4" />
            </div>
          </Circle>
          <span className="font-mono text-xs font-bold text-amber-400 text-center leading-tight">
            Studio
          </span>
        </div>

      </div>

      {/* ════ BEAM DECLARATIONS ════ */}

      {/* ATS Sources → Engine (flows INWARD from left to center) */}
      <AnimatedBeam
        containerRef={containerRef}
        fromRef={greenhouseRef}
        toRef={engineRef}
        curvature={30}
        gradientStartColor="#047a55"
        gradientStopColor="#10b981"
        duration={3.0}
        delay={0}
      />
      <AnimatedBeam
        containerRef={containerRef}
        fromRef={leverRef}
        toRef={engineRef}
        curvature={0}
        gradientStartColor="#1b5a90"
        gradientStopColor="#10b981"
        duration={3.3}
        delay={0.3}
      />
      <AnimatedBeam
        containerRef={containerRef}
        fromRef={ashbyRef}
        toRef={engineRef}
        curvature={-30}
        gradientStartColor="#5450d4"
        gradientStopColor="#10b981"
        duration={3.6}
        delay={0.6}
      />

      {/* Freelance Sources → Engine (flows INWARD from right to center) */}
      <AnimatedBeam
        containerRef={containerRef}
        fromRef={contraRef}
        toRef={engineRef}
        curvature={-30}
        gradientStartColor="#f97316"
        gradientStopColor="#10b981"
        duration={3.1}
        delay={0.15}
      />
      <AnimatedBeam
        containerRef={containerRef}
        fromRef={redditRef}
        toRef={engineRef}
        curvature={0}
        gradientStartColor="#ff4500"
        gradientStopColor="#10b981"
        duration={3.4}
        delay={0.45}
      />
      <AnimatedBeam
        containerRef={containerRef}
        fromRef={wwrRef}
        toRef={engineRef}
        curvature={30}
        gradientStartColor="#d9222a"
        gradientStopColor="#10b981"
        duration={3.7}
        delay={0.75}
      />

      {/* Engine → Careers Stream (flows DOWN-LEFT) */}
      <AnimatedBeam
        containerRef={containerRef}
        fromRef={engineRef}
        toRef={careersStreamRef}
        curvature={-15}
        gradientStartColor="#10b981"
        gradientStopColor="#047a55"
        duration={2.6}
        delay={1.0}
      />

      {/* Engine → Studio Stream (flows DOWN-RIGHT) */}
      <AnimatedBeam
        containerRef={containerRef}
        fromRef={engineRef}
        toRef={studioStreamRef}
        curvature={15}
        gradientStartColor="#10b981"
        gradientStopColor="#f59e0b"
        duration={2.6}
        delay={1.2}
      />
    </div>
  );
}
