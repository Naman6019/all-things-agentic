"use client";

import {
  createUserWithEmailAndPassword,
  GoogleAuthProvider,
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
  signInWithPopup,
} from "firebase/auth";
import { ArrowLeft, CheckCircle2, Eye, EyeOff, Lock, Sparkles, ShieldCheck, Cpu, ArrowRight } from "lucide-react";
import { FormEvent, useState } from "react";
import { auth } from "@/lib/firebase-client";
import { cn } from "@/lib/utils";

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
    <svg aria-hidden="true" className="size-5 shrink-0" viewBox="0 0 24 24">
      <path fill="#4285F4" d="M21.6 12.23c0-.71-.06-1.4-.18-2.07H12v3.92h5.38a4.6 4.6 0 0 1-2 3.02v2.54h3.24c1.9-1.75 2.98-4.33 2.98-7.41Z" />
      <path fill="#34A853" d="M12 22c2.7 0 4.98-.9 6.63-2.43l-3.24-2.54c-.9.6-2.05.96-3.39.96-2.61 0-4.83-1.76-5.62-4.13H3.03v2.62A10 10 0 0 0 12 22Z" />
      <path fill="#FBBC05" d="M6.38 13.86A6 6 0 0 1 6.06 12c0-.65.11-1.28.32-1.86V7.52H3.03A10 10 0 0 0 2 12c0 1.61.38 3.14 1.03 4.48l3.35-2.62Z" />
      <path fill="#EA4335" d="M12 6.01c1.47 0 2.78.5 3.82 1.49l2.88-2.88A9.65 9.65 0 0 0 12 2a10 10 0 0 0-8.97 5.52l3.35 2.62C7.17 7.77 9.39 6.01 12 6.01Z" />
    </svg>
  );
}

export function AuthScreen() {
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

  return (
    <main className="relative min-h-dvh overflow-hidden bg-[#080c0e] lg:grid lg:grid-cols-[1.1fr_0.9fr]">
      {/* Background Ambient Glows */}
      <div className="ambient-glow-careers" />
      <div className="ambient-glow-studio" />

      {/* Left Column — Brand & Value Showcase */}
      <section className="relative z-10 hidden flex-col justify-between border-r border-white/5 bg-gradient-to-b from-[#0c1216]/90 via-[#080c0e]/80 to-[#080c0e] p-12 lg:flex xl:p-16">
        <div className="flex items-center gap-3">
          <div className="grid size-11 place-items-center rounded-2xl bg-gradient-to-br from-emerald-500/20 to-teal-900/30 border border-emerald-500/30 text-emerald-400 shadow-[0_0_20px_rgba(16,185,129,0.2)]">
            <Sparkles className="size-5" />
          </div>
          <div>
            <span className="font-display text-xl font-bold tracking-tight text-white">TalentOS</span>
            <span className="ml-2 rounded-full border border-emerald-500/20 bg-emerald-950/40 px-2.5 py-0.5 text-xs font-medium text-emerald-400">
              An AllStackLabs Product
            </span>
          </div>
        </div>

        <div className="my-auto max-w-xl py-12">
          <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3.5 py-1.5 text-xs font-medium text-slate-300 backdrop-blur-md">
            <Cpu className="size-3.5 text-emerald-400" />
            Autonomous Opportunity Intelligence
          </div>
          
          <h1 className="font-display text-balance text-4xl font-extrabold leading-[1.12] text-white xl:text-5xl">
            Dual-stream intelligence for your next career move.
          </h1>
          
          <p className="mt-6 text-pretty text-base leading-relaxed text-slate-400 xl:text-lg">
            Autonomous discovery across public ATS and freelance boards. 3-state qualification reasoning and print-ready tailored materials with strict human-in-the-loop approval.
          </p>

          <div className="mt-10 grid gap-4 sm:grid-cols-3">
            <div className="glass-card rounded-2xl p-4 border border-white/10">
              <CheckCircle2 className="mb-2 size-5 text-emerald-400" />
              <div className="font-display text-sm font-semibold text-white">TalentOS // Careers</div>
              <p className="mt-1 text-xs leading-relaxed text-slate-400">ATS discovery & print-ready resume tailoring.</p>
            </div>
            
            <div className="glass-card rounded-2xl p-4 border border-white/10">
              <CheckCircle2 className="mb-2 size-5 text-amber-400" />
              <div className="font-display text-sm font-semibold text-white">TalentOS // Studio</div>
              <p className="mt-1 text-xs leading-relaxed text-slate-400">Gig monitoring & 3-paragraph pitch drafting.</p>
            </div>

            <div className="glass-card rounded-2xl p-4 border border-white/10">
              <CheckCircle2 className="mb-2 size-5 text-sky-400" />
              <div className="font-display text-sm font-semibold text-white">Gemini 3.6 Flash</div>
              <p className="mt-1 text-xs leading-relaxed text-slate-400">Grounded reasoning on Google Cloud Vertex AI.</p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2 text-xs text-slate-500">
          <ShieldCheck className="size-4 text-emerald-400" />
          <span>Anti-Automation Safe: The agent evaluates and drafts; you review and submit.</span>
        </div>
      </section>

      {/* Right Column — Auth Terminal Form */}
      <section className="relative z-10 flex min-h-dvh items-center justify-center p-6 sm:p-12">
        <div className="glass-panel w-full max-w-md rounded-3xl p-8 shadow-2xl sm:p-10">
          <div className="mb-8 flex items-center justify-between lg:hidden">
            <div className="flex items-center gap-2.5">
              <div className="grid size-9 place-items-center rounded-xl bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
                <Sparkles className="size-4" />
              </div>
              <span className="font-display text-lg font-bold text-white">TalentOS</span>
            </div>
            <span className="rounded-full border border-white/10 bg-white/5 px-2.5 py-1 text-xs text-slate-400">
              Private Beta
            </span>
          </div>

          {mode === "reset" && (
            <button
              type="button"
              onClick={() => setMode("sign-in")}
              className="mb-6 inline-flex items-center gap-2 text-xs font-medium text-slate-400 hover:text-white transition"
            >
              <ArrowLeft className="size-4" /> Back to sign in
            </button>
          )}

          <div className="space-y-2">
            <h2 className="font-display text-2xl font-bold tracking-tight text-white sm:text-3xl">
              {mode === "sign-in" && "Sign in to TalentOS"}
              {mode === "sign-up" && "Create your workspace"}
              {mode === "reset" && "Reset your password"}
            </h2>
            <p className="text-sm text-slate-400">
              {mode === "sign-in" && "Review live opportunities, tailored resumes, and client pitches."}
              {mode === "sign-up" && "Join the private beta with Google or your email address."}
              {mode === "reset" && "Enter your email to receive a secure recovery link."}
            </p>
          </div>

          {mode !== "reset" && (
            <button
              type="button"
              disabled={busy}
              onClick={() => void withFeedback(() => signInWithPopup(auth, new GoogleAuthProvider()))}
              className="group mt-8 flex h-12 w-full items-center justify-center gap-3 rounded-xl border border-white/15 bg-white/5 px-4 text-sm font-semibold text-white shadow-lg transition-all hover:bg-white/10 hover:border-white/25 active:scale-[0.99] disabled:opacity-50"
            >
              <GoogleMark />
              <span>Continue with Google</span>
              <ArrowRight className="size-4 text-slate-500 transition-transform group-hover:translate-x-0.5 group-hover:text-white" />
            </button>
          )}

          {mode !== "reset" && (
            <div className="my-6 flex items-center gap-4 text-xs font-medium uppercase tracking-wider text-slate-500">
              <span className="h-px flex-1 bg-white/10" />
              <span>or email</span>
              <span className="h-px flex-1 bg-white/10" />
            </div>
          )}

          <form onSubmit={submit} className={cn("space-y-4", mode === "reset" && "mt-6")}>
            <div>
              <label className="mb-1.5 block text-xs font-medium text-slate-300">Email Address</label>
              <input
                required
                type="email"
                autoComplete="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                placeholder="naman@allstacklabs.com"
                className="h-11 w-full rounded-xl border border-white/10 bg-[#0d1317] px-3.5 text-sm text-white placeholder:text-slate-600 focus:border-emerald-500/50 focus:bg-[#11181d] focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
              />
            </div>

            {mode !== "reset" && (
              <div>
                <div className="mb-1.5 flex items-center justify-between text-xs font-medium text-slate-300">
                  <span>Password</span>
                  {mode === "sign-in" && (
                    <button
                      type="button"
                      onClick={() => setMode("reset")}
                      className="text-emerald-400 transition hover:text-emerald-300 hover:underline"
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
                    className="h-11 w-full rounded-xl border border-white/10 bg-[#0d1317] px-3.5 pr-11 text-sm text-white placeholder:text-slate-600 focus:border-emerald-500/50 focus:bg-[#11181d] focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
                  />
                  <button
                    type="button"
                    aria-label={showPassword ? "Hide password" : "Show password"}
                    onClick={() => setShowPassword((value) => !value)}
                    className="absolute inset-y-0 right-0 grid w-11 place-items-center text-slate-500 hover:text-slate-300"
                  >
                    {showPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                  </button>
                </div>
              </div>
            )}

            {error && (
              <div role="alert" className="rounded-xl border border-rose-500/30 bg-rose-950/40 p-3 text-xs leading-relaxed text-rose-300">
                {error}
              </div>
            )}
            
            {notice && (
              <div role="status" className="rounded-xl border border-emerald-500/30 bg-emerald-950/40 p-3 text-xs leading-relaxed text-emerald-300">
                {notice}
              </div>
            )}

            <button
              type="submit"
              disabled={busy}
              className="mt-2 flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 font-display text-sm font-semibold text-white shadow-[0_0_20px_rgba(16,185,129,0.25)] transition hover:from-emerald-500 hover:to-teal-500 active:scale-[0.99] disabled:opacity-60"
            >
              {busy ? (
                <span className="size-4 animate-spin rounded-full border-2 border-white/30 border-t-white" />
              ) : mode === "sign-in" ? (
                "Sign in to Workspace"
              ) : mode === "sign-up" ? (
                "Create Account"
              ) : (
                "Send Password Reset Link"
              )}
            </button>
          </form>

          {mode !== "reset" && (
            <div className="mt-8 border-t border-white/5 pt-6 text-center text-xs text-slate-400">
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
        </div>
      </section>
    </main>
  );
}
