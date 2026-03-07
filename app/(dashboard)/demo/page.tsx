"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import {
  ArrowRight,
  BarChart3,
  Compass,
  FileCheck,
  Play,
  ShieldCheck,
  Sparkles,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  ExecutiveDemoStepKey,
  buildExecutiveDemoHref,
  executiveDemoSteps,
} from "@/lib/executive-demo";

const DEFAULT_ROI = {
  shops: 62,
  partsPerYear: 8500,
  minutesPerPart: 90,
  hourlyRate: 65,
  aogEventsAvoided: 10,
  avgAogCost: 150000,
  annualAuditPrepCost: 500000,
  docImprovementPct: 15,
};

type RoiInputs = typeof DEFAULT_ROI;

function formatMoney(value: number): string {
  if (value >= 1_000_000) {
    return `$${(value / 1_000_000).toFixed(1)}M`;
  }

  return `$${Math.round(value / 1000)}K`;
}

function HeroCard() {
  const jumpCards = [
    {
      title: "Review proof",
      description: "Open the seeded reviewer session where evidence becomes release paperwork.",
      href: buildExecutiveDemoHref("proof"),
      icon: FileCheck,
    },
    {
      title: "Fleet risk",
      description: "Jump to exception detection and show how gaps surface before release.",
      href: buildExecutiveDemoHref("exceptions"),
      icon: ShieldCheck,
    },
    {
      title: "Digital thread",
      description: "Move straight to the part record and provenance story.",
      href: buildExecutiveDemoHref("trust"),
      icon: Compass,
    },
  ];

  return (
    <div className="space-y-8">
      <section
        data-demo-focus="demo-hero"
        className="relative overflow-hidden rounded-[2rem] border border-slate-200 bg-[radial-gradient(circle_at_top_left,_rgba(14,165,233,0.14),_transparent_28%),linear-gradient(135deg,_#0f172a_0%,_#111827_45%,_#f8fafc_45%,_#ffffff_100%)] px-8 py-10 shadow-sm"
      >
        <div className="max-w-3xl">
          <p className="text-xs font-semibold uppercase tracking-[0.22em] text-sky-600">
            In-Product Executive Demo
          </p>
          <h1 className="mt-3 text-4xl font-semibold tracking-tight text-slate-950 sm:text-5xl">
            Take a buyer from paperwork pain to verified ROI without leaving the product.
          </h1>
          <p className="mt-4 max-w-2xl text-base leading-7 text-slate-600">
            This route is the guided sales path for AeroVision’s desktop app. It uses seeded,
            stable product data, overlays the real workflow, and keeps a return path whenever you
            branch into live pages.
          </p>
          <div className="mt-8 flex flex-wrap items-center gap-3">
            <Link href={buildExecutiveDemoHref("intro")}>
              <Button size="lg" className="gap-2 rounded-full px-6">
                <Play className="h-4 w-4" />
                Start Guided Demo
              </Button>
            </Link>
            <Link href="/dashboard">
              <Button size="lg" variant="outline" className="rounded-full px-6">
                Explore Freely
              </Button>
            </Link>
          </div>
        </div>

        <div className="mt-10 grid gap-3 sm:grid-cols-3">
          <Card className="border-white/40 bg-white/80 shadow-none backdrop-blur">
            <CardContent className="pt-6">
              <p className="text-3xl font-semibold text-slate-950">10-12 min</p>
              <p className="mt-2 text-sm text-slate-600">Default runtime for a founder-led or buyer-led meeting.</p>
            </CardContent>
          </Card>
          <Card className="border-white/40 bg-white/80 shadow-none backdrop-blur">
            <CardContent className="pt-6">
              <p className="text-3xl font-semibold text-slate-950">Seeded-first</p>
              <p className="mt-2 text-sm text-slate-600">Stable proof moments with a path back after live branching.</p>
            </CardContent>
          </Card>
          <Card className="border-white/40 bg-white/80 shadow-none backdrop-blur">
            <CardContent className="pt-6">
              <p className="text-3xl font-semibold text-slate-950">Pain to ROI</p>
              <p className="mt-2 text-sm text-slate-600">Queue pressure, reviewer proof, trust layer, and executive impact.</p>
            </CardContent>
          </Card>
        </div>
      </section>

      <section>
        <div className="mb-4 flex items-center justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">
              Jump In
            </p>
            <h2 className="mt-1 text-2xl font-semibold text-slate-950">
              Direct entry points into the strongest product moments
            </h2>
          </div>
        </div>
        <div className="grid gap-4 lg:grid-cols-3">
          {jumpCards.map((card) => {
            const Icon = card.icon;

            return (
              <Link key={card.title} href={card.href}>
                <Card className="h-full border-slate-200 transition-transform hover:-translate-y-0.5 hover:border-slate-300 hover:shadow-md">
                  <CardContent className="flex h-full flex-col gap-4 pt-6">
                    <div className="inline-flex h-11 w-11 items-center justify-center rounded-2xl bg-slate-100 text-slate-700">
                      <Icon className="h-5 w-5" />
                    </div>
                    <div className="space-y-2">
                      <h3 className="text-lg font-semibold text-slate-950">{card.title}</h3>
                      <p className="text-sm leading-6 text-slate-600">{card.description}</p>
                    </div>
                    <div className="mt-auto flex items-center gap-2 text-sm font-medium text-sky-700">
                      Open step
                      <ArrowRight className="h-4 w-4" />
                    </div>
                  </CardContent>
                </Card>
              </Link>
            );
          })}
        </div>
      </section>
    </div>
  );
}

function RoiCalculator() {
  const [inputs, setInputs] = useState<RoiInputs>(DEFAULT_ROI);

  function updateInput(field: keyof RoiInputs, value: string) {
    setInputs((current) => ({
      ...current,
      [field]: Math.max(0, Number.parseInt(value, 10) || 0),
    }));
  }

  const results = useMemo(() => {
    const minutesSavedPerPart = Math.max(0, inputs.minutesPerPart - 3);
    const totalHoursSaved = Math.round(
      (inputs.partsPerYear * minutesSavedPerPart) / 60
    );
    const laborSaved = totalHoursSaved * inputs.hourlyRate;
    const aogAvoidance = inputs.aogEventsAvoided * inputs.avgAogCost;
    const auditReduction = Math.round(inputs.annualAuditPrepCost * 0.6);
    const counterfeitReduction = Math.round(
      inputs.partsPerYear * 0.02 * 5000 * (inputs.docImprovementPct / 100)
    );
    const annualValue =
      laborSaved + aogAvoidance + auditReduction + counterfeitReduction;
    const fiveYearValue = annualValue * 5;

    return {
      totalHoursSaved,
      laborSaved,
      aogAvoidance,
      auditReduction,
      counterfeitReduction,
      annualValue,
      fiveYearValue,
    };
  }, [inputs]);

  return (
    <div className="space-y-8" data-demo-focus="demo-roi">
      <section className="rounded-[2rem] border border-emerald-200 bg-[linear-gradient(135deg,_rgba(16,185,129,0.12),_rgba(255,255,255,0.96)_38%,_rgba(14,165,233,0.08)_100%)] p-8 shadow-sm">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-emerald-700">
          HEICO-Style Impact
        </p>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight text-slate-950">
          A seeded executive impact model that updates in place.
        </h1>
        <p className="mt-3 max-w-3xl text-base leading-7 text-slate-600">
          The intent is fast comprehension, not spreadsheet theater. Adjust one or two assumptions,
          then let the product carry the rest of the conversation.
        </p>
      </section>

      <div className="grid gap-6 xl:grid-cols-[1.1fr_0.9fr]">
        <Card className="border-slate-200">
          <CardContent className="pt-6">
            <div className="grid gap-4 sm:grid-cols-2">
              <label className="space-y-2 text-sm text-slate-600">
                <span className="font-medium text-slate-800">MRO shops in network</span>
                <Input
                  type="number"
                  value={inputs.shops}
                  onChange={(event) => updateInput("shops", event.target.value)}
                />
              </label>
              <label className="space-y-2 text-sm text-slate-600">
                <span className="font-medium text-slate-800">Parts overhauled per year</span>
                <Input
                  type="number"
                  value={inputs.partsPerYear}
                  onChange={(event) => updateInput("partsPerYear", event.target.value)}
                />
              </label>
              <label className="space-y-2 text-sm text-slate-600">
                <span className="font-medium text-slate-800">Manual paperwork minutes per part</span>
                <Input
                  type="number"
                  value={inputs.minutesPerPart}
                  onChange={(event) => updateInput("minutesPerPart", event.target.value)}
                />
              </label>
              <label className="space-y-2 text-sm text-slate-600">
                <span className="font-medium text-slate-800">Mechanic hourly rate</span>
                <Input
                  type="number"
                  value={inputs.hourlyRate}
                  onChange={(event) => updateInput("hourlyRate", event.target.value)}
                />
              </label>
              <label className="space-y-2 text-sm text-slate-600">
                <span className="font-medium text-slate-800">AOG events avoided per year</span>
                <Input
                  type="number"
                  value={inputs.aogEventsAvoided}
                  onChange={(event) => updateInput("aogEventsAvoided", event.target.value)}
                />
              </label>
              <label className="space-y-2 text-sm text-slate-600">
                <span className="font-medium text-slate-800">Average AOG cost</span>
                <Input
                  type="number"
                  value={inputs.avgAogCost}
                  onChange={(event) => updateInput("avgAogCost", event.target.value)}
                />
              </label>
              <label className="space-y-2 text-sm text-slate-600">
                <span className="font-medium text-slate-800">Annual audit prep cost</span>
                <Input
                  type="number"
                  value={inputs.annualAuditPrepCost}
                  onChange={(event) =>
                    updateInput("annualAuditPrepCost", event.target.value)
                  }
                />
              </label>
              <label className="space-y-2 text-sm text-slate-600">
                <span className="font-medium text-slate-800">Documentation improvement %</span>
                <Input
                  type="number"
                  value={inputs.docImprovementPct}
                  onChange={(event) =>
                    updateInput("docImprovementPct", event.target.value)
                  }
                />
              </label>
            </div>
          </CardContent>
        </Card>

        <div className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <Card className="border-emerald-200 bg-emerald-50">
              <CardContent className="pt-6">
                <p className="text-sm font-medium text-emerald-800">Hours saved / year</p>
                <p className="mt-2 text-3xl font-semibold text-emerald-950">
                  {results.totalHoursSaved.toLocaleString()}
                </p>
              </CardContent>
            </Card>
            <Card className="border-emerald-200 bg-emerald-50">
              <CardContent className="pt-6">
                <p className="text-sm font-medium text-emerald-800">Labor value / year</p>
                <p className="mt-2 text-3xl font-semibold text-emerald-950">
                  {formatMoney(results.laborSaved)}
                </p>
              </CardContent>
            </Card>
            <Card className="border-sky-200 bg-sky-50">
              <CardContent className="pt-6">
                <p className="text-sm font-medium text-sky-800">AOG avoidance / year</p>
                <p className="mt-2 text-3xl font-semibold text-sky-950">
                  {formatMoney(results.aogAvoidance)}
                </p>
              </CardContent>
            </Card>
            <Card className="border-slate-200 bg-slate-50">
              <CardContent className="pt-6">
                <p className="text-sm font-medium text-slate-700">Audit + counterfeit reduction</p>
                <p className="mt-2 text-3xl font-semibold text-slate-950">
                  {formatMoney(results.auditReduction + results.counterfeitReduction)}
                </p>
              </CardContent>
            </Card>
          </div>

          <Card className="border-2 border-slate-950 bg-slate-950 text-white">
            <CardContent className="pt-6">
              <p className="text-sm font-medium text-slate-300">Annual value</p>
              <p className="mt-2 text-4xl font-semibold">
                {formatMoney(results.annualValue)}
              </p>
              <p className="mt-4 text-sm leading-6 text-slate-300">
                The calculator defaults stay conservative. They assume a human still reviews every
                release, but the system removes most of the manual reconciliation effort and shortens
                the path to release.
              </p>
            </CardContent>
          </Card>

          <Card className="border-amber-200 bg-amber-50">
            <CardContent className="pt-6">
              <p className="text-sm font-medium text-amber-800">Five-year value</p>
              <p className="mt-2 text-4xl font-semibold text-amber-950">
                {formatMoney(results.fiveYearValue)}
              </p>
              <p className="mt-4 text-sm leading-6 text-amber-900">
                This excludes strategic upside from better OEM visibility, faster customer dispute
                resolution, and stronger residual value when documentation is complete.
              </p>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}

function RecoveryCard({ stepKey }: { stepKey: ExecutiveDemoStepKey | null }) {
  const activeStep = executiveDemoSteps.find((step) => step.key === stepKey);

  if (!activeStep) {
    return <HeroCard />;
  }

  return (
    <section className="rounded-[2rem] border border-slate-200 bg-white p-8 shadow-sm">
      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">
        Guided Step Redirect
      </p>
      <h1 className="mt-2 text-3xl font-semibold text-slate-950">
        This step lives on another product page.
      </h1>
      <p className="mt-3 max-w-2xl text-base leading-7 text-slate-600">
        The guided flow is anchored to real product surfaces. Re-open the current step to land on
        the correct page with the demo overlay intact.
      </p>
      <div className="mt-6">
        <Link href={buildExecutiveDemoHref(activeStep.key)}>
          <Button size="lg" className="gap-2 rounded-full px-6">
            Re-open {activeStep.label}
            <ArrowRight className="h-4 w-4" />
          </Button>
        </Link>
      </div>
    </section>
  );
}

export default function DemoPage() {
  const searchParams = useSearchParams();
  const stepKey = searchParams.get("step") as ExecutiveDemoStepKey | null;

  return (
    <div className="space-y-8">
      {stepKey === "roi"
        ? <RoiCalculator />
        : !stepKey || stepKey === "intro"
        ? <HeroCard />
        : <RecoveryCard stepKey={stepKey} />}

      <section className="rounded-[2rem] border border-slate-200 bg-white p-8 shadow-sm">
        <div className="flex items-center gap-3">
          <div className="inline-flex h-11 w-11 items-center justify-center rounded-2xl bg-slate-100 text-slate-700">
            <BarChart3 className="h-5 w-5" />
          </div>
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">
              Demo Flow
            </p>
            <h2 className="text-2xl font-semibold text-slate-950">
              The scripted path stays grounded in real product pages
            </h2>
          </div>
        </div>
        <div className="mt-6 grid gap-3 lg:grid-cols-3">
          {executiveDemoSteps.map((step) => (
            <Link key={step.key} href={buildExecutiveDemoHref(step.key)}>
              <div className="rounded-2xl border border-slate-200 p-4 transition-colors hover:border-slate-300 hover:bg-slate-50">
                <div className="flex items-center justify-between gap-3">
                  <p className="text-sm font-semibold text-slate-950">{step.label}</p>
                  <span className="rounded-full bg-slate-100 px-2 py-1 text-[11px] font-medium text-slate-500">
                    {step.duration}
                  </span>
                </div>
                <p className="mt-2 text-sm leading-6 text-slate-600">{step.buyerNote}</p>
              </div>
            </Link>
          ))}
        </div>
      </section>

      <section className="rounded-[2rem] border border-sky-200 bg-sky-50 p-8 shadow-sm">
        <div className="flex items-start gap-3">
          <Sparkles className="mt-1 h-5 w-5 text-sky-700" />
          <div>
            <h2 className="text-xl font-semibold text-sky-950">
              Why this route changed
            </h2>
            <p className="mt-2 max-w-3xl text-sm leading-7 text-sky-900">
              The older `/demo` experience acted like a contained presentation. This version keeps the
              entry and ROI surfaces here, but the proof moments now happen on the actual reviewer,
              integrity, and part detail pages with contextual overlays and a persistent return path.
            </p>
          </div>
        </div>
      </section>
    </div>
  );
}
