"use client";

import {
  createUserWithEmailAndPassword,
  GoogleAuthProvider,
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
  signInWithPopup,
} from "firebase/auth";
import { ArrowLeft, CheckCircle2, Eye, EyeOff, Sparkles, ShieldCheck, Cpu } from "lucide-react";
import { FormEvent, useState } from "react";
import { auth } from "@/lib/firebase-client";
import { cn } from "@/lib/utils";
import { DataFlowBeams } from "@/components/data-flow-beams";

type Mode = "sign-in" | "sign-up" | "reset";

function friendlyError(error: unknown) {
  const code = typeof error === "object" && error && "code" in error ? String(error.code) : "";
  const errors: Record<string, string> = {
    "auth/email-already-in-use": "An account already exists for this email.",
    "auth/invalid-credential": "The email or password is incorrect.",
    "auth/invalid-email": "Enter a valid email address.",
    "auth/popup-closed-by-user": "Google sign-in was closed before it finished.",
    "auth/too-many-requests": "Too many attempts. Please wait and try again.",
    "auth/weak-password": "Use a password with at least six characters.",
  };
  return errors[code] ?? "Something went wrong. Please try again.";
}

function GoogleMark() {
  return (
    <svg aria-hidden="true" className="size-4 shrink-0" viewBox="0 0 24 24">
      <path fill="#4285F4" d="M21.6 12.23c0-.71-.06-1.4-.18-2.07H12v3.92h5.38a4.6 4.6 0 0 1-2 3.02v2.54h3.24c1.9-1.75 2.98-4.33 2.98-7.41Z" />
      <path fill="#34A853" d="M12 22c2.7 0 4.98-.9 6.63-2.43l-3.24-2.54c-.9.6-2.05.96-3.39.96-2.61 0-4.83-1.76-5.62-4.13H3.03v2.62A10 10 0 0 0 12 22Z" />
      <path fill="#FBBC05" d="M6.38 13.86A6 6 0 0 1 6.06 12c0-.65.11-1.28.32-1.86V7.52H3.03A10 10 0 0 0 2 12c0 1.61.38 3.14 1.03 4.48l3.35-2.62Z" />
      <path fill="#EA4335" d="M12 6.01c1.47 0 2.78.5 3.82 1.49l2.88-2.88A9.65 9.65 0 0 0 12 2a10 10 0 0 0-8.97 5.52l3.35 2.62C7.17 7.77 9.39 6.01 12 6.01Z" />
    </svg>
  );
}

export function AuthScreen({
  compact = false,
  onBack,
}: {
  compact?: boolean;
  onBack?: () => void;
}) {
  const [mode, setMode] = useState<Mode>("sign-in");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  async function withFeedback(action: () => Promise<unknown>) {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await action();
    } catch (caught) {
      setError(friendlyError(caught));
    } finally {
      setBusy(false);
    }
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (mode === "reset") {
      void withFeedback(async () => {
        await sendPasswordResetEmail(auth, email);
        setNotice("Check your inbox for a password reset link.");
      });
      return;
    }

    void withFeedback(() =>
      mode === "sign-up"
        ? createUserWithEmailAndPassword(auth, email, password)
        : signInWithEmailAndPassword(auth, email, password),
    );
  }

  const formCard = (
    <div className="w-full rounded-surface border border-line bg-surface-1 p-6 sm:p-10 shadow-2xl text-slate-100">
      <div className="mb-6 flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <div className="grid size-8 place-items-center rounded-control bg-white/5 border border-line-strong text-emerald-400">
            <Sparkles className="size-4" />
          </div>
          <div>
            <span className="font-display text-base font-bold text-white">TalentOS</span>
            <span className="block text-xs text-slate-500">An AllStackLabs Product</span>
          </div>
        </div>
        <span className="rounded-full border border-line-strong bg-white/[0.03] px-2.5 py-0.5 text-xs text-slate-400 font-mono">
          Public Preview
        </span>
      </div>

      {mode === "reset" && (
        <button
          type="button"
          onClick={() => setMode("sign-in")}
          className="mb-4 inline-flex items-center gap-1.5 text-xs font-medium text-slate-400 hover:text-white transition"
        >
          <ArrowLeft className="size-3.5" /> Back to sign in
        </button>
      )}

      <div className="space-y-1">
        <h2 className="font-display text-2xl font-bold tracking-tight text-white">
          {mode === "sign-in" && "Sign in to Workspace"}
          {mode === "sign-up" && "Create your account"}
          {mode === "reset" && "Reset your password"}
        </h2>
        <p className="text-xs text-slate-400">
          {mode === "sign-in" && "Access your live ATS opportunities and pitch pipeline."}
          {mode === "sign-up" && "Create a free TalentOS account with Google or email."}
          {mode === "reset" && "Enter your email to receive a recovery link."}
        </p>
      </div>

      {mode !== "reset" && (
        <button
          type="button"
          disabled={busy}
          onClick={() => void withFeedback(() => signInWithPopup(auth, new GoogleAuthProvider()))}
          className="mt-6 flex h-11 w-full items-center justify-center gap-2.5 rounded-control border border-line-strong bg-white/[0.04] px-4 text-xs font-medium text-slate-200 transition hover:bg-white/[0.08] hover:text-white active:scale-[0.99] disabled:opacity-50"
        >
          <GoogleMark />
          <span>Continue with Google</span>
        </button>
      )}

      {mode !== "reset" && (
        <div className="my-5 flex items-center gap-3 text-xs font-medium uppercase tracking-wider text-slate-500">
          <span className="h-px flex-1 bg-white/[0.06]" />
          <span>or email</span>
          <span className="h-px flex-1 bg-white/[0.06]" />
        </div>
      )}

      <form onSubmit={submit} className={cn("space-y-3.5", mode === "reset" && "mt-5")}>
        <div>
          <label className="mb-1 block text-xs font-medium text-slate-300">Email Address</label>
          <input
            required
            type="email"
            autoComplete="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            placeholder="naman@allstacklabs.com"
            className="h-11 w-full rounded-control border border-line bg-surface-2 px-3.5 text-xs text-white placeholder:text-slate-500 focus:border-emerald-500/50 focus:bg-[#182029] focus:outline-none"
          />
        </div>

        {mode !== "reset" && (
          <div>
            <div className="mb-1 flex items-center justify-between text-xs font-medium text-slate-300">
              <span>Password</span>
              {mode === "sign-in" && (
                <button
                  type="button"
                  onClick={() => setMode("reset")}
                  className="text-emerald-400 text-xs transition hover:text-emerald-300 hover:underline"
                >
                  Forgot password?
                </button>
              )}
            </div>
            <div className="relative">
              <input
                required
                minLength={6}
                type={showPassword ? "text" : "password"}
                autoComplete={mode === "sign-up" ? "new-password" : "current-password"}
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                placeholder="••••••••"
                className="h-11 w-full rounded-control border border-line bg-surface-2 px-3.5 pr-10 text-xs text-white placeholder:text-slate-500 focus:border-emerald-500/50 focus:bg-[#182029] focus:outline-none"
              />
              <button
                type="button"
                aria-label={showPassword ? "Hide password" : "Show password"}
                onClick={() => setShowPassword((value) => !value)}
                className="absolute inset-y-0 right-0 grid w-10 place-items-center text-slate-500 hover:text-slate-300"
              >
                {showPassword ? <EyeOff className="size-3.5" /> : <Eye className="size-3.5" />}
              </button>
            </div>
          </div>
        )}

        {error && (
          <div role="alert" className="rounded-control border border-rose-500/30 bg-rose-950/40 p-2.5 text-xs text-rose-300 leading-relaxed">
            {error}
          </div>
        )}

        {notice && (
          <div role="status" className="rounded-control border border-emerald-500/30 bg-emerald-950/40 p-2.5 text-xs text-emerald-300 leading-relaxed">
            {notice}
          </div>
        )}

        <button
          type="submit"
          disabled={busy}
          className="mt-1 flex h-11 w-full items-center justify-center gap-2 rounded-control bg-emerald-500 font-display text-xs font-semibold text-surface-0 transition hover:bg-emerald-400 active:scale-[0.99] disabled:opacity-60"
        >
          {busy ? (
            <span className="size-3.5 animate-spin rounded-full border-2 border-[#090d10]/40 border-t-[#090d10]" />
          ) : mode === "sign-in" ? (
            "Continue to Workspace"
          ) : mode === "sign-up" ? (
            "Create Account"
          ) : (
            "Send Reset Link"
          )}
        </button>
      </form>

      {mode !== "reset" && (
        <div className="mt-5 border-t border-line pt-4 text-center text-xs text-slate-400">
          {mode === "sign-in" ? "New to TalentOS?" : "Already have an account?"}{" "}
          <button
            type="button"
            onClick={() => setMode(mode === "sign-in" ? "sign-up" : "sign-in")}
            className="font-semibold text-emerald-400 transition hover:text-emerald-300"
          >
            {mode === "sign-in" ? "Create an account" : "Sign in"}
          </button>
        </div>
      )}

      <p className="mt-6 text-center text-xs text-slate-400 leading-relaxed">
        By continuing, you agree to TalentOS Terms of Service and Privacy Policy.
      </p>
    </div>
  );

  if (compact) {
    return formCard;
  }

  return (
    <main className="relative min-h-dvh overflow-hidden bg-surface-0 lg:grid lg:grid-cols-[1.2fr_0.8fr]">
      <div className="absolute inset-0 bg-grid-subtle pointer-events-none opacity-40" />

      {/* Left Column — Razorpay-inspired Showcase & Animated Data Flow */}
      <section className="relative z-10 hidden flex-col justify-between border-r border-line bg-surface-1 p-8 lg:flex xl:p-14">
        <div>
          {/* Header */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="grid size-9 place-items-center rounded-control bg-white/5 border border-line-strong text-emerald-400">
                <Sparkles className="size-4" />
              </div>
              <div>
                <span className="font-display text-lg font-bold tracking-tight text-white">TalentOS</span>
                <span className="ml-2 rounded-control border border-line-strong bg-white/[0.03] px-2 py-0.5 text-xs text-slate-400">
                  An AllStackLabs Product
                </span>
              </div>
            </div>

            {onBack && (
              <button
                onClick={onBack}
                className="flex items-center gap-1.5 text-xs text-slate-400 hover:text-white transition"
              >
                <ArrowLeft className="size-3.5" />
                <span>Back to Home</span>
              </button>
            )}
          </div>

          {/* Value Pitch */}
          <div className="mt-10 max-w-xl">
            <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-line-strong bg-white/[0.04] px-3 py-1 text-xs font-medium text-slate-300">
              <Cpu className="size-3.5 text-emerald-400" />
              <span>Continuous Autonomous Intelligence</span>
            </div>

            <h1 className="font-display text-3xl font-extrabold tracking-tight text-white xl:text-4xl leading-tight">
              Supercharge your career & client pipelines with autonomous reasoning.
            </h1>

            <p className="mt-3 text-sm text-slate-400 leading-relaxed">
              Real-time ingestion across keyless ATS endpoints and open hiring feeds, validated by Gemini 3.6 Flash on Vertex AI.
            </p>
          </div>

          {/* Animated Data Flow Diagram (6 Sources -> Engine -> User) */}
          <div className="mt-8">
            <DataFlowBeams />
          </div>

          {/* Proof Bullet Points */}
          <div className="mt-8 grid gap-3 sm:grid-cols-2 max-w-xl">
            <div className="flex items-start gap-2.5 rounded-control border border-line bg-surface-1 p-3 text-xs text-slate-300">
              <CheckCircle2 className="size-4 text-emerald-400 shrink-0 mt-0.5" />
              <span><strong>Keyless ATS Ingestion:</strong> Greenhouse, Lever, Ashby, SmartRecruiters.</span>
            </div>

            <div className="flex items-start gap-2.5 rounded-control border border-line bg-surface-1 p-3 text-xs text-slate-300">
              <CheckCircle2 className="size-4 text-emerald-400 shrink-0 mt-0.5" />
              <span><strong>Strict 3-State Logic:</strong> MET, UNMET, NOT STATED. Zero silent discards.</span>
            </div>

            <div className="flex items-start gap-2.5 rounded-control border border-line bg-surface-1 p-3 text-xs text-slate-300">
              <CheckCircle2 className="size-4 text-emerald-400 shrink-0 mt-0.5" />
              <span><strong>0% Fabrication:</strong> Aligns real experience without hallucinating dates.</span>
            </div>

            <div className="flex items-start gap-2.5 rounded-control border border-line bg-surface-1 p-3 text-xs text-slate-300">
              <CheckCircle2 className="size-4 text-emerald-400 shrink-0 mt-0.5" />
              <span><strong>Anti-Automation Safe:</strong> 1-click human review protects platform TOS.</span>
            </div>
          </div>
        </div>

        {/* Security & Compliance Notice */}
        <div className="mt-8 flex items-center gap-2 text-xs text-slate-500 border-t border-line pt-4">
          <ShieldCheck className="size-4 text-emerald-400" />
          <span>Enterprise Grade · 256-Bit Encrypted Session · Google Vertex AI (global)</span>
        </div>
      </section>

      {/* Right Column — Razorpay-style Dedicated Form */}
      <section className="relative z-10 flex min-h-dvh items-center justify-center p-6 sm:p-12">
        <div className="w-full max-w-md">
          {formCard}
        </div>
      </section>
    </main>
  );
}
