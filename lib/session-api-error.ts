import { NextResponse } from "next/server";

type SessionApiErrorScope = "queue" | "detail";

function getErrorMessage(error: unknown) {
  if (error instanceof Error) return error.message;
  return "Unknown error";
}

function isSchemaDriftError(message: string) {
  return (
    message.includes("Unknown field `processingJob`") ||
    message.includes("Unknown field 'processingJob'") ||
    message.includes("Unknown field `packages`") ||
    message.includes("Unknown field 'packages'")
  );
}

export function buildSessionApiErrorResponse(
  error: unknown,
  scope: SessionApiErrorScope
) {
  const technicalDetails = getErrorMessage(error);
  const schemaDrift = isSchemaDriftError(technicalDetails);

  const title =
    scope === "detail" ? "Reviewer cockpit unavailable" : "Review queue unavailable";

  return NextResponse.json(
    {
      title,
      error: schemaDrift
        ? "The local demo backend is out of sync with the latest session-processing schema."
        : "AeroVision could not load session data from the local demo backend.",
      nextStep: schemaDrift
        ? "Run `npx prisma generate`, restart the local demo server, and reload this page."
        : "Refresh this page. If the problem persists, restart the local demo server and try again.",
      technicalDetails,
    },
    { status: 500 }
  );
}
