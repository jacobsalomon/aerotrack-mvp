import { redirect } from "next/navigation";

// Logged-in users land on their Jobs list — the actual work queue.
// Demo routes (/jobs/test-session-reviewer-cockpit, /parts/demo-hpc7-overhaul)
// are still accessible directly for investor walkthroughs.
export default function HomePage() {
  redirect("/jobs");
}
