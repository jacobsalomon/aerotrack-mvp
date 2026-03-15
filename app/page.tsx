import Link from "next/link";
import {
  ArrowRight,
  FileCheck,
  Glasses,
  LayoutDashboard,
  Plane,
  ShieldCheck,
} from "lucide-react";

const proofPoints = [
  "Reviewer cockpit with evidence-linked draft paperwork",
  "Confidence and blocker visibility before release",
  "Part-level digital thread that sells trust, not novelty",
];

const storyCards = [
  {
    title: "Review proof",
    description:
      "Open the seeded reviewer cockpit where every document field can be traced back to captured evidence.",
    icon: FileCheck,
  },
  {
    title: "Fleet trust",
    description:
      "Move into the part record and show how traceability, exceptions, and lifecycle context stay attached.",
    icon: ShieldCheck,
  },
  {
    title: "Capture vision",
    description:
      "Keep smart glasses and technician capture as the upstream story, not the first buyer proof point.",
    icon: Glasses,
  },
];

export default function Home() {
  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top,_rgba(59,130,246,0.16),_transparent_28%),linear-gradient(180deg,_#081225_0%,_#0b1730_42%,_#111827_100%)] text-white">
      <div className="mx-auto flex max-w-6xl flex-col px-6 py-12 lg:min-h-screen lg:justify-center">
        <div className="grid gap-10 lg:grid-cols-[1.1fr_0.9fr] lg:items-center">
          <section>
            <div className="flex items-center gap-3">
              <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-white/6 ring-1 ring-white/10">
                <Plane className="h-6 w-6 text-sky-300" />
              </span>
              <div>
                <p className="text-3xl font-bold tracking-tight">AeroVision</p>
                <p className="text-sm text-slate-400">
                  Reviewer-ready maintenance proof
                </p>
              </div>
            </div>

            <p className="mt-8 text-xs font-semibold uppercase tracking-[0.22em] text-cyan-300">
              Reviewer-first demo story
            </p>
            <h1 className="mt-4 max-w-3xl text-4xl font-semibold tracking-tight text-white sm:text-5xl">
              Turn messy maintenance evidence into certifier-ready release paperwork.
            </h1>
            <p className="mt-5 max-w-2xl text-base leading-7 text-slate-300">
              Lead with the reviewer cockpit: generated documents, field-level evidence,
              blocker visibility, and an audit trail clear enough to sign with confidence.
              Capture remains the upstream vision, not the first proof moment.
            </p>

            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
              <Link
                href="/sessions/test-session-reviewer-cockpit"
                className="inline-flex items-center justify-center gap-2 rounded-full bg-sky-500 px-6 py-3 text-base font-medium text-slate-950 transition-colors hover:bg-sky-400"
              >
                <FileCheck className="h-4 w-4" />
                Open Review Proof
              </Link>
              <Link
                href="/parts/demo-hpc7-overhaul"
                className="inline-flex items-center justify-center gap-2 rounded-full border border-white/16 bg-white/6 px-6 py-3 text-base font-medium text-white transition-colors hover:bg-white/10"
              >
                <LayoutDashboard className="h-4 w-4" />
                Explore Parts Fleet
              </Link>
            </div>

            <Link
              href="/glasses-demo"
              className="mt-4 inline-flex items-center gap-2 text-sm text-emerald-300 transition-colors hover:text-emerald-200"
            >
              <Glasses className="h-4 w-4" />
              Preview Capture Vision
              <ArrowRight className="h-4 w-4" />
            </Link>
          </section>

          <section className="rounded-[2rem] border border-white/10 bg-white/6 p-6 shadow-[0_30px_120px_rgba(2,6,23,0.35)] backdrop-blur">
            <div className="grid gap-4 sm:grid-cols-3 lg:grid-cols-1">
              <div className="rounded-3xl border border-cyan-400/18 bg-cyan-400/10 p-5">
                <p className="text-sm font-semibold text-cyan-200">What buyers should see first</p>
                <p className="mt-2 text-3xl font-semibold text-white">Review proof</p>
                <p className="mt-2 text-sm leading-6 text-slate-300">
                  Start with the reviewer workflow that compresses sign-off time without hiding the evidence.
                </p>
              </div>
              <div className="rounded-3xl border border-white/8 bg-slate-950/40 p-5">
                <p className="text-sm font-semibold text-white">Why it lands</p>
                <ul className="mt-3 space-y-3 text-sm leading-6 text-slate-300">
                  {proofPoints.map((point) => (
                    <li key={point} className="flex gap-3">
                      <span className="mt-2 h-1.5 w-1.5 rounded-full bg-sky-300" />
                      <span>{point}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </section>
        </div>

        <section className="mt-10 grid gap-4 md:grid-cols-3">
          {storyCards.map((card) => {
            const Icon = card.icon;

            return (
              <div
                key={card.title}
                className="rounded-3xl border border-white/8 bg-white/[0.04] p-5 backdrop-blur"
              >
                <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-white/8">
                  <Icon className="h-5 w-5 text-white" />
                </span>
                <h2 className="mt-4 text-lg font-semibold text-white">{card.title}</h2>
                <p className="mt-2 text-sm leading-6 text-slate-300">
                  {card.description}
                </p>
              </div>
            );
          })}
        </section>

        <div className="mt-10 text-sm text-slate-400">
          <p>Reviewer-first evidence and release proof for aerospace MRO.</p>
          <p className="mt-2 text-xs text-slate-500">
            The Mechanical Vision Corporation
          </p>
        </div>
      </div>
    </div>
  );
}
