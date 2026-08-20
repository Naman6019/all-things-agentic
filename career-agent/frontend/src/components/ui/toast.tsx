"use client";

import { AnimatePresence, motion } from "motion/react";
import { CheckCircle2, CircleAlert, Info, Undo2, X } from "lucide-react";
import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { cn } from "@/lib/utils";

export type ToastTone = "success" | "error" | "info";

export type ToastOptions = {
  title: string;
  description?: string;
  tone?: ToastTone;
  /** Milliseconds before auto-dismiss. Pass 0 to require a manual dismiss. */
  duration?: number;
  action?: { label: string; onClick: () => void };
};

type Toast = ToastOptions & { id: number };

type ToastContextValue = {
  toast: (options: ToastOptions) => number;
  dismiss: (id: number) => void;
};

const ToastContext = createContext<ToastContextValue | null>(null);

/**
 * Replaces window.alert() for anything the user needs to know about.
 * A native alert blocks the whole tab and looks nothing like the product.
 */
export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast must be used inside <ToastProvider>.");
  return ctx;
}

const toneConfig: Record<ToastTone, { icon: typeof Info; ring: string; accent: string }> = {
  success: {
    icon: CheckCircle2,
    ring: "border-emerald-500/25",
    accent: "text-emerald-400",
  },
  error: {
    icon: CircleAlert,
    ring: "border-rose-500/25",
    accent: "text-rose-400",
  },
  info: {
    icon: Info,
    ring: "border-line-strong",
    accent: "text-sky-400",
  },
};

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const nextId = useRef(1);
  const timers = useRef(new Map<number, ReturnType<typeof setTimeout>>());

  const dismiss = useCallback((id: number) => {
    const timer = timers.current.get(id);
    if (timer) {
      clearTimeout(timer);
      timers.current.delete(id);
    }
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const toast = useCallback(
    (options: ToastOptions) => {
      const id = nextId.current++;
      setToasts((prev) => [...prev.slice(-2), { ...options, id }]);
      const duration = options.duration ?? (options.action ? 7000 : 4500);
      if (duration > 0) {
        timers.current.set(
          id,
          setTimeout(() => dismiss(id), duration),
        );
      }
      return id;
    },
    [dismiss],
  );

  const value = useMemo(() => ({ toast, dismiss }), [toast, dismiss]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      {/* Assertive so an error is announced even mid-navigation. */}
      <div
        role="status"
        aria-live="polite"
        className="pointer-events-none fixed bottom-4 left-1/2 z-[70] flex w-full max-w-md -translate-x-1/2 flex-col gap-2 px-4 sm:bottom-6"
      >
        <AnimatePresence initial={false}>
          {toasts.map((t) => {
            const cfg = toneConfig[t.tone ?? "info"];
            const Icon = cfg.icon;
            return (
              <motion.div
                key={t.id}
                layout
                initial={{ opacity: 0, y: 16, scale: 0.97 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: 8, scale: 0.97 }}
                transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
                className={cn(
                  "pointer-events-auto flex items-start gap-3 rounded-surface border bg-surface-2/95 p-3.5 shadow-[0_16px_48px_rgba(0,0,0,0.6)] backdrop-blur-md",
                  cfg.ring,
                )}
              >
                <Icon className={cn("mt-0.5 size-4 shrink-0", cfg.accent)} aria-hidden />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-white">{t.title}</p>
                  {t.description && (
                    <p className="mt-0.5 text-xs leading-relaxed text-slate-400">{t.description}</p>
                  )}
                </div>
                {t.action && (
                  <button
                    type="button"
                    onClick={() => {
                      t.action?.onClick();
                      dismiss(t.id);
                    }}
                    className="flex shrink-0 items-center gap-1.5 rounded-control border border-line-strong bg-white/5 px-2.5 py-1 text-xs font-semibold text-white transition hover:bg-white/10"
                  >
                    <Undo2 className="size-3.5" aria-hidden />
                    {t.action.label}
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => dismiss(t.id)}
                  aria-label="Dismiss notification"
                  className="grid size-6 shrink-0 place-items-center rounded-control text-slate-500 transition hover:bg-white/5 hover:text-white"
                >
                  <X className="size-3.5" aria-hidden />
                </button>
              </motion.div>
            );
          })}
        </AnimatePresence>
      </div>
    </ToastContext.Provider>
  );
}
