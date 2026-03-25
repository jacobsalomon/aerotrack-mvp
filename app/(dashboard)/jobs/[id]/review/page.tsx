// /jobs/[id]/review — Review page for inspection sessions
// Uses shared loader for org-scoped data fetching

import { loadReviewData } from "@/lib/inspect/load-review-data";
import ReviewScreen from "@/components/inspect/review-screen";

type PageProps = { params: Promise<{ id: string }> };

export default async function JobReviewPage({ params }: PageProps) {
  const { id } = await params;
  const data = await loadReviewData(id, "/jobs");

  return (
    <ReviewScreen
      session={data.session}
      component={data.component}
      unassignedCount={data.unassignedCount}
      isReconciling={data.isReconciling}
      photoItemIds={data.photoItemIds}
      photos={data.photos}
    />
  );
}
