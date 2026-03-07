export const EXECUTIVE_DEMO_STORAGE_KEY = "executive-demo-state";

export type ExecutiveDemoStepKey =
  | "intro"
  | "pain"
  | "proof"
  | "exceptions"
  | "trust"
  | "roi"
  | "explore";

export interface ExecutiveDemoLink {
  label: string;
  href: string;
  description: string;
  demoStep?: ExecutiveDemoStepKey;
}

export interface ExecutiveDemoStep {
  key: ExecutiveDemoStepKey;
  label: string;
  shortLabel: string;
  duration: string;
  path: string;
  focusId?: string;
  buyerNote: string;
  presenterTip: string;
  jumpLinks?: ExecutiveDemoLink[];
  branchLinks?: ExecutiveDemoLink[];
}

export interface ExecutiveDemoState {
  startedAt: number;
  stepKey: ExecutiveDemoStepKey;
}

export const executiveDemoSteps: ExecutiveDemoStep[] = [
  {
    key: "intro",
    label: "Pain, Proof, Trust, ROI",
    shortLabel: "Intro",
    duration: "1 min",
    path: "/demo",
    focusId: "demo-hero",
    buyerNote:
      "This guided path stays inside the product and sets up the business problem before you click into evidence and approvals.",
    presenterTip:
      "Keep the opener tight. The only goal here is to frame the cost of paperwork and the promise of a seeded, reliable walkthrough.",
    jumpLinks: [
      {
        label: "Pain",
        href: "/sessions",
        description: "Show the review burden first.",
        demoStep: "pain",
      },
      {
        label: "Proof",
        href: "/sessions/test-session-reviewer-cockpit",
        description: "Jump to evidence-backed document review.",
        demoStep: "proof",
      },
      {
        label: "Trust",
        href: "/parts/demo-hpc7-overhaul",
        description: "Open the digital thread for the seeded pump.",
        demoStep: "trust",
      },
    ],
  },
  {
    key: "pain",
    label: "Pain: Review Queue",
    shortLabel: "Pain",
    duration: "2 min",
    path: "/sessions",
    focusId: "sessions-pending-review",
    buyerNote:
      "The backlog is the pain point: skilled reviewers are still spending too much time stitching evidence into release paperwork.",
    presenterTip:
      "Use the pending review card and the queue as the setup. The point is not volume alone; it is delay, uncertainty, and avoidable manual effort.",
    jumpLinks: [
      {
        label: "Proof",
        href: "/sessions/test-session-reviewer-cockpit",
        description: "Open the seeded session that resolves the backlog.",
        demoStep: "proof",
      },
      {
        label: "ROI",
        href: "/demo",
        description: "Skip ahead to executive impact.",
        demoStep: "roi",
      },
    ],
    branchLinks: [
      {
        label: "Browse capture sessions",
        href: "/sessions",
        description: "Stay on the live queue without changing the guided step.",
      },
    ],
  },
  {
    key: "proof",
    label: "Proof: Evidence to Release",
    shortLabel: "Proof",
    duration: "3 min",
    path: "/sessions/test-session-reviewer-cockpit",
    focusId: "generated-documents",
    buyerNote:
      "This is the proof moment: one seeded overhaul produces review-ready FAA documents with evidence lineage and blocker visibility.",
    presenterTip:
      "Anchor on two things only: the reviewer cockpit for readiness, and the generated documents for evidence-backed release paperwork.",
    jumpLinks: [
      {
        label: "Exceptions",
        href: "/integrity",
        description: "Show what the system catches automatically.",
        demoStep: "exceptions",
      },
      {
        label: "Trust",
        href: "/parts/demo-hpc7-overhaul",
        description: "Follow the released part into its lifecycle record.",
        demoStep: "trust",
      },
    ],
    branchLinks: [
      {
        label: "Open the same session freely",
        href: "/sessions/test-session-reviewer-cockpit",
        description: "Branch into the live page and return without losing the step.",
      },
    ],
  },
  {
    key: "exceptions",
    label: "Proof: Exception Detection",
    shortLabel: "Exceptions",
    duration: "2 min",
    path: "/integrity",
    focusId: "integrity-open-exceptions",
    buyerNote:
      "The platform does not just draft paperwork. It also scans the fleet for documentation gaps, missing certificates, and issues that block release.",
    presenterTip:
      "Run or reference the seeded scan results, then translate the red cards into executive risk: delays, audits, and counterfeit exposure.",
    jumpLinks: [
      {
        label: "Trust",
        href: "/parts/demo-hpc7-overhaul",
        description: "Move from fleet risk to one part’s verified history.",
        demoStep: "trust",
      },
      {
        label: "ROI",
        href: "/demo",
        description: "Skip to value and rollout economics.",
        demoStep: "roi",
      },
    ],
    branchLinks: [
      {
        label: "Explore integrity page",
        href: "/integrity",
        description: "Filter exceptions or drill into a live finding.",
      },
    ],
  },
  {
    key: "trust",
    label: "Trust: Digital Thread",
    shortLabel: "Trust",
    duration: "2 min",
    path: "/parts/demo-hpc7-overhaul",
    focusId: "trace-summary",
    buyerNote:
      "This is the trust layer: the release paperwork turns into a durable digital thread with provenance, completeness scoring, and audit-ready documents.",
    presenterTip:
      "Keep the story on trace score, lifecycle continuity, and attached compliance documents. If they want detail, branch into the timeline or compliance cards.",
    jumpLinks: [
      {
        label: "ROI",
        href: "/demo",
        description: "Translate product trust into business value.",
        demoStep: "roi",
      },
      {
        label: "Explore",
        href: "/dashboard",
        description: "Hand the buyer the product and let them roam.",
        demoStep: "explore",
      },
    ],
    branchLinks: [
      {
        label: "Inspect the full lifecycle",
        href: "/parts/demo-hpc7-overhaul",
        description: "Stay on the part detail page and dig into events.",
      },
    ],
  },
  {
    key: "roi",
    label: "ROI: HEICO Impact",
    shortLabel: "ROI",
    duration: "2 min",
    path: "/demo",
    focusId: "demo-roi",
    buyerNote:
      "The savings are not only labor. The real upside comes from faster release, lower audit prep, and less exposure to paperwork-driven AOG events.",
    presenterTip:
      "Adjust one or two assumptions live, then stop. Spreadsheet mode kills momentum; the headline is annual savings plus five-year strategic value.",
    jumpLinks: [
      {
        label: "Explore",
        href: "/dashboard",
        description: "End the script and hand them the app.",
        demoStep: "explore",
      },
      {
        label: "Proof",
        href: "/sessions/test-session-reviewer-cockpit",
        description: "Jump back to the seeded reviewer workflow.",
        demoStep: "proof",
      },
    ],
    branchLinks: [
      {
        label: "Open parts fleet",
        href: "/dashboard",
        description: "Branch into the live product from the ROI page.",
      },
    ],
  },
  {
    key: "explore",
    label: "Explore Freely",
    shortLabel: "Explore",
    duration: "open",
    path: "/dashboard",
    focusId: "dashboard-components-table",
    buyerNote:
      "The guided story is over. This state is intentionally open-ended so the buyer can click around the real product without losing a way back.",
    presenterTip:
      "Let the room drive. Keep the return button available, but do not force the script once they are asking product questions.",
    jumpLinks: [
      {
        label: "Proof",
        href: "/sessions/test-session-reviewer-cockpit",
        description: "Re-open the seeded session.",
        demoStep: "proof",
      },
      {
        label: "Trust",
        href: "/parts/demo-hpc7-overhaul",
        description: "Go back to the digital thread.",
        demoStep: "trust",
      },
    ],
    branchLinks: [
      {
        label: "Capture sessions",
        href: "/sessions",
        description: "Browse sessions without leaving the demo context.",
      },
      {
        label: "Integrity dashboard",
        href: "/integrity",
        description: "Inspect fleet exceptions while keeping a return path.",
      },
    ],
  },
];

export function getExecutiveDemoStep(
  stepKey: ExecutiveDemoStepKey | null | undefined
): ExecutiveDemoStep | null {
  if (!stepKey) return null;
  return executiveDemoSteps.find((step) => step.key === stepKey) ?? null;
}

export function getExecutiveDemoIndex(stepKey: ExecutiveDemoStepKey): number {
  return executiveDemoSteps.findIndex((step) => step.key === stepKey);
}

export function buildExecutiveDemoHref(stepKey: ExecutiveDemoStepKey): string {
  const step = getExecutiveDemoStep(stepKey);
  if (!step) return "/demo";

  const params = new URLSearchParams({
    demo: "executive",
    step: step.key,
  });

  return `${step.path}?${params.toString()}`;
}

