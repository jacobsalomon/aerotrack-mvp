"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  ArrowRight,
  ChevronLeft,
  ChevronRight,
  Eye,
  MessageSquare,
  RotateCcw,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  EXECUTIVE_DEMO_STORAGE_KEY,
  ExecutiveDemoState,
  ExecutiveDemoStep,
  ExecutiveDemoStepKey,
  buildExecutiveDemoHref,
  executiveDemoSteps,
  getExecutiveDemoIndex,
  getExecutiveDemoStep,
} from "@/lib/executive-demo";

interface HighlightRect {
  top: number;
  left: number;
  width: number;
  height: number;
}

function formatElapsed(startedAt: number): string {
  const totalSeconds = Math.max(0, Math.floor((Date.now() - startedAt) / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
}

export function ExecutiveDemoOverlay() {
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();

  const [persistedState, setPersistedState] = useState<ExecutiveDemoState | null>(null);
  const [showNotes, setShowNotes] = useState(false);
  const [elapsedLabel, setElapsedLabel] = useState("0:00");
  const [highlightRect, setHighlightRect] = useState<HighlightRect | null>(null);

  const urlStepKey = searchParams.get("step") as ExecutiveDemoStepKey | null;
  const urlDemoActive = searchParams.get("demo") === "executive";
  const urlStep = urlDemoActive ? getExecutiveDemoStep(urlStepKey) : null;
  const activeStep = urlStep ?? getExecutiveDemoStep(persistedState?.stepKey);

  useEffect(() => {
    if (typeof window === "undefined") return;

    try {
      const raw = window.sessionStorage.getItem(EXECUTIVE_DEMO_STORAGE_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw) as ExecutiveDemoState;
      if (parsed.stepKey) {
        setPersistedState(parsed);
      }
    } catch {
      window.sessionStorage.removeItem(EXECUTIVE_DEMO_STORAGE_KEY);
    }
  }, []);

  useEffect(() => {
    if (!urlStep) return;

    const nextState: ExecutiveDemoState = {
      startedAt: persistedState?.startedAt ?? Date.now(),
      stepKey: urlStep.key,
    };

    setPersistedState(nextState);

    if (typeof window !== "undefined") {
      window.sessionStorage.setItem(
        EXECUTIVE_DEMO_STORAGE_KEY,
        JSON.stringify(nextState)
      );
    }
  }, [persistedState?.startedAt, urlStep]);

  useEffect(() => {
    if (!persistedState?.startedAt) return;

    setElapsedLabel(formatElapsed(persistedState.startedAt));
    const timer = window.setInterval(() => {
      setElapsedLabel(formatElapsed(persistedState.startedAt));
    }, 1000);

    return () => window.clearInterval(timer);
  }, [persistedState?.startedAt]);

  useEffect(() => {
    if (!urlDemoActive || !urlStep?.focusId) {
      setHighlightRect(null);
      return;
    }

    const selector = `[data-demo-focus="${urlStep.focusId}"]`;

    const updateRect = () => {
      const target = document.querySelector(selector) as HTMLElement | null;
      if (!target) {
        setHighlightRect(null);
        return;
      }

      const rect = target.getBoundingClientRect();
      const padding = 10;
      setHighlightRect({
        top: Math.max(0, rect.top - padding),
        left: Math.max(0, rect.left - padding),
        width: rect.width + padding * 2,
        height: rect.height + padding * 2,
      });
    };

    updateRect();

    const observer = new ResizeObserver(updateRect);
    const target = document.querySelector(selector) as HTMLElement | null;
    if (target) observer.observe(target);

    window.addEventListener("resize", updateRect);
    window.addEventListener("scroll", updateRect, true);

    return () => {
      observer.disconnect();
      window.removeEventListener("resize", updateRect);
      window.removeEventListener("scroll", updateRect, true);
    };
  }, [urlDemoActive, urlStep?.focusId, pathname]);

  const stepIndex = activeStep ? getExecutiveDemoIndex(activeStep.key) : -1;
  const isOnExpectedPath = !!activeStep && pathname === activeStep.path;
  const showFullOverlay = !!urlStep && isOnExpectedPath;
  const showReturnPill = !!activeStep && !showFullOverlay;

  const previousStep = useMemo(() => {
    if (stepIndex <= 0) return null;
    return executiveDemoSteps[stepIndex - 1] ?? null;
  }, [stepIndex]);

  const nextStep = useMemo(() => {
    if (stepIndex < 0 || stepIndex >= executiveDemoSteps.length - 1) return null;
    return executiveDemoSteps[stepIndex + 1] ?? null;
  }, [stepIndex]);

  function clearDemoState() {
    if (typeof window !== "undefined") {
      window.sessionStorage.removeItem(EXECUTIVE_DEMO_STORAGE_KEY);
    }
    setPersistedState(null);
    setShowNotes(false);
    setHighlightRect(null);
  }

  function goToStep(step: ExecutiveDemoStep) {
    router.push(buildExecutiveDemoHref(step.key));
  }

  if (!activeStep) {
    return null;
  }

  return (
    <>
      {showFullOverlay && highlightRect && (
        <div
          className="pointer-events-none fixed z-30 rounded-[1.25rem] border-2 border-sky-500 bg-sky-400/10 shadow-[0_0_0_9999px_rgba(15,23,42,0.10)] transition-all duration-200"
          style={{
            top: highlightRect.top,
            left: highlightRect.left,
            width: highlightRect.width,
            height: highlightRect.height,
          }}
        />
      )}

      {showFullOverlay ? (
        <div className="fixed bottom-6 right-6 z-40 w-[min(28rem,calc(100vw-2rem))] rounded-[1.5rem] border border-slate-200 bg-white/96 p-5 shadow-2xl backdrop-blur">
          <div className="mb-4 flex items-start justify-between gap-3">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-sky-600">
                Executive Demo
              </p>
              <h2 className="mt-1 text-lg font-semibold text-slate-950">
                {activeStep.label}
              </h2>
            </div>
            <button
              type="button"
              onClick={() => setShowNotes((current) => !current)}
              className={`inline-flex h-9 w-9 items-center justify-center rounded-full border transition-colors ${
                showNotes
                  ? "border-sky-600 bg-sky-600 text-white"
                  : "border-slate-200 text-slate-500 hover:border-slate-300 hover:text-slate-700"
              }`}
              aria-label="Toggle presenter notes"
            >
              <MessageSquare className="h-4 w-4" />
            </button>
          </div>

          <div className="mb-4 flex items-center gap-2">
            {executiveDemoSteps.map((step, index) => (
              <button
                key={step.key}
                type="button"
                onClick={() => goToStep(step)}
                className={`h-2 rounded-full transition-all ${
                  index === stepIndex
                    ? "w-8 bg-sky-500"
                    : index < stepIndex
                    ? "w-3 bg-emerald-500"
                    : "w-3 bg-slate-200"
                }`}
                aria-label={`Go to ${step.label}`}
              />
            ))}
          </div>

          <div className="mb-4 flex items-center justify-between text-xs text-slate-500">
            <span>
              Step {stepIndex + 1} of {executiveDemoSteps.length}
            </span>
            <span>{activeStep.duration}</span>
            <span>{elapsedLabel}</span>
          </div>

          <p className="text-sm leading-6 text-slate-700">{activeStep.buyerNote}</p>

          {showNotes && (
            <div className="mt-4 rounded-2xl border border-sky-100 bg-sky-50 p-4">
              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-sky-700">
                Presenter Hint
              </p>
              <p className="mt-2 text-sm leading-6 text-sky-900">
                {activeStep.presenterTip}
              </p>
            </div>
          )}

          {activeStep.jumpLinks && activeStep.jumpLinks.length > 0 && (
            <div className="mt-4">
              <p className="mb-2 text-xs font-semibold uppercase tracking-[0.14em] text-slate-400">
                Jump Points
              </p>
              <div className="flex flex-wrap gap-2">
                {activeStep.jumpLinks.map((link) => (
                  <Link
                    key={`${activeStep.key}-${link.label}`}
                    href={link.demoStep ? buildExecutiveDemoHref(link.demoStep) : link.href}
                    className="rounded-full border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-700 transition-colors hover:border-slate-300 hover:bg-slate-50"
                  >
                    {link.label}
                  </Link>
                ))}
              </div>
            </div>
          )}

          {activeStep.branchLinks && activeStep.branchLinks.length > 0 && (
            <div className="mt-4 space-y-2 rounded-2xl border border-slate-200 bg-slate-50 p-4">
              <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">
                <Eye className="h-3.5 w-3.5" />
                Live Branches
              </div>
              {activeStep.branchLinks.map((link) => (
                <Link
                  key={`${activeStep.key}-${link.href}`}
                  href={link.href}
                  className="flex items-start justify-between gap-3 rounded-xl bg-white px-3 py-2.5 text-sm text-slate-700 transition-colors hover:bg-slate-100"
                >
                  <span className="leading-5">{link.label}</span>
                  <ArrowRight className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" />
                </Link>
              ))}
            </div>
          )}

          <div className="mt-5 flex items-center justify-between gap-3">
            <Button
              variant="outline"
              onClick={() => previousStep && goToStep(previousStep)}
              disabled={!previousStep}
              className="gap-1.5"
            >
              <ChevronLeft className="h-4 w-4" />
              Back
            </Button>
            <div className="flex items-center gap-2">
              <Button
                variant="ghost"
                onClick={() => {
                  clearDemoState();
                  router.push("/demo");
                }}
                className="gap-1.5 text-slate-500"
              >
                <RotateCcw className="h-4 w-4" />
                Reset
              </Button>
              <Button
                variant="ghost"
                onClick={() => {
                  clearDemoState();
                  router.push("/demo");
                }}
                className="gap-1.5 text-slate-500"
              >
                <X className="h-4 w-4" />
                Exit
              </Button>
            </div>
            <Button
              onClick={() => {
                if (nextStep) {
                  goToStep(nextStep);
                  return;
                }

                clearDemoState();
                router.push("/dashboard");
              }}
              className="gap-1.5"
            >
              {nextStep ? "Next" : "Finish"}
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      ) : showReturnPill ? (
        <div className="fixed bottom-6 right-6 z-40 w-[min(22rem,calc(100vw-2rem))] rounded-[1.25rem] border border-slate-200 bg-white/95 p-4 shadow-xl backdrop-blur">
          <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">
            Guided Demo Active
          </p>
          <p className="mt-1 text-sm font-medium text-slate-950">
            Current step: {activeStep.label}
          </p>
          <p className="mt-2 text-sm leading-6 text-slate-600">
            You are exploring a live page. Return to the scripted flow whenever you are ready.
          </p>
          <div className="mt-4 flex items-center gap-2">
            <Button onClick={() => router.push(buildExecutiveDemoHref(activeStep.key))}>
              Return to Demo
            </Button>
            <Button
              variant="outline"
              onClick={() => {
                clearDemoState();
              }}
            >
              End Demo
            </Button>
          </div>
        </div>
      ) : null}
    </>
  );
}
