// /inspect/[sessionId]/review — Review page for inspection sessions
// Uses shared loader for org-scoped data fetching

import { loadReviewData } from "@/lib/inspect/load-review-data";
import ReviewScreen from "@/components/inspect/review-screen";

type PageProps = { params: Promise<{ sessionId: string }> };

export default async function ReviewPage({ params }: PageProps) {
  const { sessionId } = await params;
  const data = await loadReviewData(sessionId, "/inspect");

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
