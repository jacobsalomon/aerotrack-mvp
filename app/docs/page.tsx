import type { Metadata } from "next";
import {
  ClipboardCheck,
  FileText,
  BookOpen,
  Users,
  Settings,
  Upload,
  Mic,
  Camera,
  CheckCircle,
  AlertTriangle,
  Plane,
} from "lucide-react";

export const metadata: Metadata = {
  title: "AeroVision — Documentation",
  description: "User guide for AeroVision AI-powered maintenance documentation",
};

// Each section of the docs page
function Section({
  id,
  title,
  icon: Icon,
  children,
}: {
  id: string;
  title: string;
  icon: React.ComponentType<{ className?: string }>;
  children: React.ReactNode;
}) {
  return (
    <section id={id} className="scroll-mt-24">
      <div className="flex items-center gap-3 mb-4">
        <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-zinc-100">
          <Icon className="h-5 w-5 text-zinc-700" />
        </span>
        <h2 className="text-xl font-semibold text-zinc-900">{title}</h2>
      </div>
      <div className="space-y-4 text-zinc-600 text-[15px] leading-relaxed">
        {children}
      </div>
    </section>
  );
}

// Step-by-step instruction block
function Steps({ steps }: { steps: string[] }) {
  return (
    <ol className="list-none space-y-3 pl-0">
      {steps.map((step, i) => (
        <li key={i} className="flex items-start gap-3">
          <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-zinc-900 text-xs font-medium text-white mt-0.5">
            {i + 1}
          </span>
          <span>{step}</span>
        </li>
      ))}
    </ol>
  );
}

// Table of contents link
function TocLink({ href, label }: { href: string; label: string }) {
  return (
    <a
      href={href}
      className="block rounded-lg px-3 py-2 text-sm text-zinc-500 transition-colors hover:bg-zinc-100 hover:text-zinc-900"
    >
      {label}
    </a>
  );
}

export default function DocsPage() {
  return (
    <div className="min-h-screen bg-white">
      {/* Header */}
      <header className="sticky top-0 z-10 border-b border-zinc-200 bg-white/95 backdrop-blur-sm">
        <div className="mx-auto flex max-w-5xl items-center gap-3 px-6 py-4">
          <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-zinc-900">
            <Plane className="h-5 w-5 text-white" />
          </span>
          <div>
            <h1 className="text-lg font-bold text-zinc-900">AeroVision Docs</h1>
            <p className="text-xs text-zinc-400">User guide and reference</p>
          </div>
        </div>
      </header>

      <div className="mx-auto flex max-w-5xl gap-10 px-6 py-10">
        {/* Sidebar table of contents — hidden on small screens */}
        <nav className="hidden lg:block w-52 shrink-0">
          <div className="sticky top-24 space-y-1">
            <p className="mb-3 px-3 text-[11px] font-semibold uppercase tracking-widest text-zinc-400">
              On this page
            </p>
            <TocLink href="#overview" label="Overview" />
            <TocLink href="#jobs" label="Jobs" />
            <TocLink href="#freeform" label="Freeform Capture" />
            <TocLink href="#guided" label="Guided Inspection" />
            <TocLink href="#templates" label="CMM Templates" />
            <TocLink href="#forms" label="Forms" />
            <TocLink href="#team" label="Team" />
            <TocLink href="#settings" label="Settings" />
            <TocLink href="#mobile" label="Mobile App" />
            <TocLink href="#tips" label="Tips" />
          </div>
        </nav>

        {/* Main content */}
        <main className="min-w-0 flex-1 space-y-14">
          {/* Overview */}
          <Section id="overview" title="Overview" icon={Plane}>
            <p>
              AeroVision automates aviation maintenance paperwork. Mechanics
              capture evidence — photos, voice notes, video, measurements — and the
              AI drafts FAA-compliant documents automatically. Supervisors review,
              approve, and sign off digitally.
            </p>
            <p>
              The system supports two types of work: <strong>Freeform Capture</strong>{" "}
              for ad-hoc repairs and quick jobs, and <strong>Guided Inspection</strong>{" "}
              for CMM-based overhauls that follow a structured checklist.
            </p>
          </Section>

          {/* Jobs */}
          <Section id="jobs" title="Jobs" icon={ClipboardCheck}>
            <p>
              Jobs is the main page where all work lives. Every work order and
              inspection shows up here in one unified list. You can filter by
              status, see which mechanic is assigned, and drill into any job for
              details.
            </p>
            <div className="rounded-xl border border-zinc-200 bg-zinc-50 p-5">
              <p className="mb-3 text-sm font-medium text-zinc-800">Job Statuses</p>
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div className="flex items-center gap-2">
                  <span className="h-2.5 w-2.5 rounded-full bg-blue-500" />
                  <span><strong>In Progress</strong> — Mechanic is working</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="h-2.5 w-2.5 rounded-full bg-amber-500" />
                  <span><strong>Ready to Review</strong> — AI has drafted docs</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="h-2.5 w-2.5 rounded-full bg-green-500" />
                  <span><strong>Complete</strong> — Signed off by supervisor</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="h-2.5 w-2.5 rounded-full bg-zinc-400" />
                  <span><strong>Cancelled</strong> — Job was cancelled</span>
                </div>
              </div>
            </div>
            <p className="text-sm text-zinc-500">
              Click the <strong>New Job</strong> button in the top right to start
              a new work order. You&apos;ll choose between freeform capture or
              guided inspection.
            </p>
          </Section>

          {/* Freeform Capture */}
          <Section id="freeform" title="Freeform Capture" icon={Camera}>
            <p>
              Freeform capture is for ad-hoc repairs, quick jobs, or any work
              that doesn&apos;t follow a specific CMM template. The mechanic
              captures evidence freely — photos, video, voice notes — and the AI
              analyzes everything to draft compliance documents.
            </p>
            <Steps
              steps={[
                "Create a new job and select \"Freeform Capture\"",
                "The mechanic captures evidence using the mobile app (photos, video, audio)",
                "AI transcribes audio, reads photos, and analyzes video automatically",
                "AI drafts an 8130-3, Work Order, and Findings Report",
                "Supervisor reviews the drafted documents in the job detail page",
                "If everything looks good, sign off to complete the job",
              ]}
            />
          </Section>

          {/* Guided Inspection */}
          <Section id="guided" title="Guided Inspection" icon={CheckCircle}>
            <p>
              Guided inspections follow a CMM (Component Maintenance Manual)
              template step by step. Each section has specific items to check —
              measurements with tolerances, pass/fail checks, and notes. Progress
              is tracked per item.
            </p>
            <Steps
              steps={[
                "Create a new job and select \"Guided Inspection\"",
                "Choose a CMM template and, if applicable, a configuration variant",
                "Assign technicians to sections (or let them self-assign)",
                "Technicians work through items: record measurements, mark pass/fail, add notes",
                "The system validates measurements against tolerances automatically",
                "Once all items are complete, supervisor reviews and signs off",
              ]}
            />
            <div className="rounded-xl border border-zinc-200 bg-zinc-50 p-5">
              <p className="mb-3 text-sm font-medium text-zinc-800">Checklist Item Types</p>
              <div className="space-y-2 text-sm">
                <div>
                  <strong>Go/No-Go</strong> — Simple pass or fail. Does the part
                  meet the requirement?
                </div>
                <div>
                  <strong>Measurement</strong> — Record a numeric value. The system
                  checks it against the tolerance range from the CMM.
                </div>
                <div>
                  <strong>Text Entry</strong> — Free-form notes for observations
                  or comments.
                </div>
              </div>
            </div>
          </Section>

          {/* CMM Templates */}
          <Section id="templates" title="CMM Templates" icon={BookOpen}>
            <p>
              Templates are the backbone of guided inspections. Upload a CMM PDF
              and the AI extracts a structured inspection checklist — measurements,
              tolerances, pass/fail items, and configuration-specific sections.
            </p>
            <Steps
              steps={[
                "Go to Templates in the sidebar",
                "Click \"Upload Template\" and select a CMM PDF (supports up to 500 pages)",
                "The AI processes the PDF in two passes — first indexing pages, then extracting details",
                "Review the extracted sections and items for accuracy",
                "You can re-extract individual sections if something looks off",
                "Approve the template to make it available for guided inspections",
              ]}
            />
            <div className="rounded-xl border border-amber-200 bg-amber-50 p-5 text-sm">
              <div className="flex items-start gap-2">
                <AlertTriangle className="h-4 w-4 text-amber-600 mt-0.5 shrink-0" />
                <p className="text-amber-800">
                  Template extraction works best with clearly formatted CMMs. Tables with
                  explicit tolerance values, figure numbers, and section headers produce
                  the most accurate results.
                </p>
              </div>
            </div>
          </Section>

          {/* Forms */}
          <Section id="forms" title="Forms" icon={FileText}>
            <p>
              The Forms page lets you manage and work with compliance document
              forms. AeroVision generates three types of FAA documents:
            </p>
            <div className="space-y-2 text-sm">
              <div>
                <strong>FAA 8130-3</strong> — Airworthiness Approval Tag.
                The release certificate that says a part is safe to fly.
              </div>
              <div>
                <strong>Work Order</strong> — Detailed record of what work
                was performed on the component.
              </div>
              <div>
                <strong>Findings Report</strong> — What the inspection or
                teardown revealed about the component&apos;s condition.
              </div>
            </div>
          </Section>

          {/* Team */}
          <Section id="team" title="Team" icon={Users}>
            <p>
              Manage your shop&apos;s technicians. Add team members with their
              badge numbers and FAA license details. Technicians can be assigned
              to specific inspection sections.
            </p>
            <p>
              New team members can join your organization using an invite code.
              Share the code and they can sign up and be automatically added to
              your org.
            </p>
          </Section>

          {/* Settings */}
          <Section id="settings" title="Settings" icon={Settings}>
            <p>
              Organization-wide settings that affect how AeroVision works for
              your shop.
            </p>
            <div className="rounded-xl border border-zinc-200 bg-zinc-50 p-5">
              <p className="mb-2 text-sm font-medium text-zinc-800">AI Agent Instructions</p>
              <p className="text-sm">
                Write custom instructions that get injected into every AI prompt.
                Use this to teach the AI about your shop&apos;s specific
                procedures, terminology, or documentation preferences.
              </p>
              <p className="mt-2 text-sm text-zinc-500">
                For example: &quot;Always include the work order number in the
                8130-3 remarks field&quot; or &quot;Use metric units for all
                turbine blade measurements.&quot;
              </p>
            </div>
          </Section>

          {/* Mobile App */}
          <Section id="mobile" title="Mobile App" icon={Mic}>
            <p>
              The iOS companion app is how mechanics capture evidence on the
              shop floor. It connects to the same backend as the web dashboard.
            </p>
            <div className="space-y-2 text-sm">
              <div className="flex items-start gap-2">
                <Camera className="h-4 w-4 text-zinc-500 mt-0.5 shrink-0" />
                <span><strong>Photos</strong> — Capture part conditions, labels, measurements</span>
              </div>
              <div className="flex items-start gap-2">
                <Mic className="h-4 w-4 text-zinc-500 mt-0.5 shrink-0" />
                <span><strong>Voice Notes</strong> — Narrate findings, the AI transcribes automatically</span>
              </div>
              <div className="flex items-start gap-2">
                <Upload className="h-4 w-4 text-zinc-500 mt-0.5 shrink-0" />
                <span><strong>Video</strong> — Record inspections, AI annotates with timestamps</span>
              </div>
            </div>
            <p className="text-sm text-zinc-500">
              Evidence captured on the mobile app appears in the job detail
              page on the web dashboard in real time.
            </p>
          </Section>

          {/* Tips */}
          <Section id="tips" title="Tips" icon={AlertTriangle}>
            <div className="space-y-4">
              <div className="rounded-xl border border-zinc-200 bg-zinc-50 p-5 text-sm">
                <p className="font-medium text-zinc-800 mb-1">Review before signing</p>
                <p>
                  AI-generated documents are drafts. Always review the content
                  before signing off — you are the certifying authority, not the AI.
                </p>
              </div>
              <div className="rounded-xl border border-zinc-200 bg-zinc-50 p-5 text-sm">
                <p className="font-medium text-zinc-800 mb-1">Better evidence = better docs</p>
                <p>
                  Clear photos, well-lit video, and spoken-aloud measurements
                  produce significantly more accurate AI-generated documents.
                </p>
              </div>
              <div className="rounded-xl border border-zinc-200 bg-zinc-50 p-5 text-sm">
                <p className="font-medium text-zinc-800 mb-1">Use Agent Instructions</p>
                <p>
                  If the AI keeps getting something wrong for your shop, add a
                  correction in Settings → AI Agent Instructions. It applies to
                  all future jobs.
                </p>
              </div>
            </div>
          </Section>

          {/* Footer */}
          <div className="border-t border-zinc-200 pt-8 text-center text-sm text-zinc-400">
            <p>AeroVision by The Mechanical Vision Corporation</p>
            <p className="mt-1">Questions? Contact your AeroVision administrator.</p>
          </div>
        </main>
      </div>
    </div>
  );
}
