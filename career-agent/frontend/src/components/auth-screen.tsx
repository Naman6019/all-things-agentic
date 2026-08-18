"use client";

import {
  createUserWithEmailAndPassword,
  GoogleAuthProvider,
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
  signInWithPopup,
} from "firebase/auth";
import { ArrowLeft, Check, Eye, EyeOff, Search, ShieldCheck, Sparkles } from "lucide-react";
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
    <svg aria-hidden="true" className="size-5" viewBox="0 0 24 24">
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
    <main className="min-h-dvh bg-[#f4f7f6] lg:grid lg:grid-cols-[minmax(0,1fr)_minmax(460px,0.76fr)]">
      <section className="hidden border-r border-[#dce4e1] bg-[#153b32] px-12 py-10 text-white lg:flex lg:flex-col lg:justify-between">
        <div className="flex items-center gap-3">
          <div className="grid size-10 place-items-center rounded-xl bg-white text-[#0f6b55]">
            <Search className="size-5" strokeWidth={2.2} />
          </div>
          <span className="text-lg font-semibold">TalentOS</span>
        </div>

        <div className="max-w-xl py-16">
          <p className="mb-5 inline-flex items-center gap-2 rounded-full border border-white/20 px-3 py-1 text-sm text-[#d4e8e2]">
            <Sparkles className="size-4" /> An AllStackLabs product
          </p>
          <h1 className="max-w-lg text-balance text-5xl font-semibold leading-[1.08]">
            Every promising role, with the evidence to act on it.
          </h1>
          <p className="mt-6 max-w-lg text-pretty text-lg leading-8 text-[#c8ddd7]">
            Review matched jobs, understand why they fit, and move from discovery to a tailored application without losing the human decision.
          </p>

          <div className="mt-10 grid max-w-lg gap-4 sm:grid-cols-3">
            {["Source-aware discovery", "Evidence-led matching", "Human-controlled apply"].map((item) => (
              <div key={item} className="border-t border-white/20 pt-4 text-sm leading-6 text-[#d9e9e5]">
                <Check className="mb-3 size-4 text-[#88c7b6]" />
                {item}
              </div>
            ))}
          </div>
        </div>

        <div className="flex items-center gap-2 text-sm text-[#b8d0ca]">
          <ShieldCheck className="size-4" /> Your agent drafts. You decide and apply.
        </div>
      </section>

      <section className="flex min-h-dvh items-center justify-center px-5 py-10 sm:px-10">
        <div className="w-full max-w-md">
          <div className="mb-10 flex items-center gap-3 lg:hidden">
            <div className="grid size-10 place-items-center rounded-xl bg-[#153b32] text-white">
              <Search className="size-5" />
            </div>
            <span className="text-lg font-semibold">TalentOS</span>
          </div>

          {mode === "reset" && (
            <button
              type="button"
              onClick={() => setMode("sign-in")}
              className="mb-5 inline-flex items-center gap-2 text-sm font-medium text-[#53635e] hover:text-[#17211e]"
            >
              <ArrowLeft className="size-4" /> Back to sign in
            </button>
          )}

          <h2 className="text-balance text-3xl font-semibold text-[#17211e]">
            {mode === "sign-in" && "Welcome back"}
            {mode === "sign-up" && "Create your account"}
            {mode === "reset" && "Reset your password"}
          </h2>
          <p className="mt-2 text-pretty leading-7 text-[#64726d]">
            {mode === "sign-in" && "Sign in to review your latest matches and application drafts."}
            {mode === "sign-up" && "Use Google or create an account with your personal email."}
            {mode === "reset" && "We’ll email you a secure link to choose a new password."}
          </p>

          {mode !== "reset" && (
            <button
              type="button"
              disabled={busy}
              onClick={() => void withFeedback(() => signInWithPopup(auth, new GoogleAuthProvider()))}
              className="mt-8 flex h-12 w-full items-center justify-center gap-3 rounded-xl border border-[#cfd9d5] bg-white px-4 font-medium text-[#25312d] shadow-sm hover:bg-[#f9fbfa] disabled:cursor-not-allowed disabled:opacity-60"
            >
              <GoogleMark /> Continue with Google
            </button>
          )}

          {mode !== "reset" && (
            <div className="my-6 flex items-center gap-4 text-xs text-[#7b8984]">
              <span className="h-px flex-1 bg-[#dce4e1]" /> OR CONTINUE WITH EMAIL <span className="h-px flex-1 bg-[#dce4e1]" />
            </div>
          )}

          <form onSubmit={submit} className={cn("space-y-5", mode === "reset" && "mt-8")}>
            <label className="block">
              <span className="mb-2 block text-sm font-medium text-[#25312d]">Email address</span>
              <input
                required
                type="email"
                autoComplete="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                placeholder="you@example.com"
                className="h-12 w-full rounded-xl border border-[#cfd9d5] bg-white px-4 text-[#17211e] shadow-sm placeholder:text-[#98a49f]"
              />
            </label>

            {mode !== "reset" && (
              <label className="block">
                <span className="mb-2 flex items-center justify-between text-sm font-medium text-[#25312d]">
                  Password
                  {mode === "sign-in" && (
                    <button type="button" onClick={() => setMode("reset")} className="font-medium text-[#0f6b55] hover:text-[#0a4f3f]">
                      Forgot password?
                    </button>
                  )}
                </span>
                <span className="relative block">
                  <input
                    required
                    minLength={6}
                    type={showPassword ? "text" : "password"}
                    autoComplete={mode === "sign-up" ? "new-password" : "current-password"}
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                    placeholder="At least 6 characters"
                    className="h-12 w-full rounded-xl border border-[#cfd9d5] bg-white px-4 pr-12 text-[#17211e] shadow-sm placeholder:text-[#98a49f]"
                  />
                  <button
                    type="button"
                    aria-label={showPassword ? "Hide password" : "Show password"}
                    onClick={() => setShowPassword((value) => !value)}
                    className="absolute inset-y-0 right-0 grid w-12 place-items-center text-[#6c7a75] hover:text-[#25312d]"
                  >
                    {showPassword ? <EyeOff className="size-5" /> : <Eye className="size-5" />}
                  </button>
                </span>
              </label>
            )}

            {error && <p role="alert" className="rounded-lg border border-[#efc7c2] bg-[#fff5f3] px-3 py-2 text-sm text-[#8d362d]">{error}</p>}
            {notice && <p role="status" className="rounded-lg border border-[#bcded3] bg-[#f1faf7] px-3 py-2 text-sm text-[#0a5d49]">{notice}</p>}

            <button
              type="submit"
              disabled={busy}
              className="h-12 w-full rounded-xl bg-[#0f6b55] px-4 font-semibold text-white shadow-sm hover:bg-[#0a5947] disabled:cursor-not-allowed disabled:opacity-60"
            >
              {busy ? "Please wait…" : mode === "sign-in" ? "Sign in" : mode === "sign-up" ? "Create account" : "Send reset link"}
            </button>
          </form>

          {mode !== "reset" && (
            <p className="mt-7 text-center text-sm text-[#64726d]">
              {mode === "sign-in" ? "New to TalentOS?" : "Already have an account?"}{" "}
              <button
                type="button"
                onClick={() => setMode(mode === "sign-in" ? "sign-up" : "sign-in")}
                className="font-semibold text-[#0f6b55] hover:text-[#0a4f3f]"
              >
                {mode === "sign-in" ? "Create an account" : "Sign in"}
              </button>
            </p>
          )}
        </div>
      </section>
    </main>
  );
}
