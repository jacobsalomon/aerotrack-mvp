import Link from "next/link";
import {
  ArrowRight,
  FileCheck,
  Glasses,
  LayoutDashboard,
  Plane,
  ShieldCheck,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

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

export default function HomePage() {
  return (
    <div className="space-y-8">
      <section
        className="relative overflow-hidden rounded-[2rem] border border-slate-200 bg-[radial-gradient(circle_at_top_left,_rgba(14,165,233,0.16),_transparent_34%),linear-gradient(135deg,_#0f172a_0%,_#111827_56%,_#f8fafc_56%,_#ffffff_100%)] px-8 py-10 shadow-sm"
        data-demo-focus="home-reviewer-story"
      >
        <div className="max-w-3xl">
          <div className="inline-flex items-center gap-3 rounded-full border border-white/20 bg-white/10 px-4 py-2 text-white/90">
            <Plane className="h-4 w-4" />
            <span className="text-xs font-semibold uppercase tracking-[0.18em]">
              Reviewer-first demo story
            </span>
          </div>

          <h1
            className="mt-5 text-4xl font-semibold tracking-tight text-white sm:text-5xl"
            style={{ fontFamily: "var(--font-space-grotesk)" }}
          >
            Turn messy maintenance evidence into certifier-ready release paperwork.
          </h1>
          <p className="mt-4 max-w-2xl text-base leading-7 text-slate-300">
            Lead with the reviewer cockpit: generated documents, field-level evidence,
            blocker visibility, and an audit trail clear enough to sign with confidence.
            Capture remains the upstream vision, not the first proof moment.
          </p>

          <div className="mt-8 flex flex-wrap items-center gap-3">
            <Button asChild size="lg" className="gap-2 rounded-full px-6">
              <Link href="/jobs/test-session-reviewer-cockpit">
                <FileCheck className="h-4 w-4" />
                Open Review Proof
              </Link>
            </Button>
            <Button asChild size="lg" variant="outline" className="rounded-full bg-white/90 px-6 text-slate-900 hover:bg-white">
              <Link href="/parts/demo-hpc7-overhaul">
                <LayoutDashboard className="h-4 w-4" />
                Explore Parts Fleet
              </Link>
            </Button>
            <Link
              href="/glasses-demo"
              className="inline-flex items-center gap-2 text-sm font-medium text-cyan-200 transition-colors hover:text-cyan-100"
            >
              <Glasses className="h-4 w-4" />
              Preview Capture Vision
              <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
        </div>
      </section>

      <section className="grid gap-4 lg:grid-cols-[1.15fr_0.85fr]">
        <Card className="border-0 shadow-sm">
          <CardContent className="pt-6">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
              What buyers should see first
            </p>
            <h2
              className="mt-2 text-2xl font-semibold tracking-tight text-slate-950"
              style={{ fontFamily: "var(--font-space-grotesk)" }}
            >
              Review proof
            </h2>
            <p className="mt-3 text-sm leading-6 text-slate-600">
              Start with the reviewer workflow that compresses sign-off time without
              hiding the evidence.
            </p>
          </CardContent>
        </Card>

        <Card className="border-0 shadow-sm">
          <CardContent className="pt-6">
            <p className="text-sm font-semibold text-slate-900">Why it lands</p>
            <ul className="mt-3 space-y-3 text-sm leading-6 text-slate-600">
              {proofPoints.map((point) => (
                <li key={point} className="flex gap-3">
                  <span className="mt-2 h-1.5 w-1.5 rounded-full bg-sky-500" />
                  <span>{point}</span>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      </section>

      <section className="grid gap-4 md:grid-cols-3">
        {storyCards.map((card) => {
          const Icon = card.icon;

          return (
            <Card key={card.title} className="border-slate-200 transition-transform hover:-translate-y-0.5 hover:shadow-md">
              <CardContent className="pt-6">
                <span className="inline-flex h-11 w-11 items-center justify-center rounded-2xl bg-slate-100 text-slate-700">
                  <Icon className="h-5 w-5" />
                </span>
                <h3
                  className="mt-4 text-lg font-semibold text-slate-950"
                  style={{ fontFamily: "var(--font-space-grotesk)" }}
                >
                  {card.title}
                </h3>
                <p className="mt-2 text-sm leading-6 text-slate-600">
                  {card.description}
                </p>
              </CardContent>
            </Card>
          );
        })}
      </section>
    </div>
  );
}
