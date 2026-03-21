// Layer 2+3: Manual measurement assignment endpoint
// Assigns a measurement to an inspection item, runs spec check, updates progress.
// Layer 3 additions: bulk assign, reconciliation conflict resolution, out-of-spec findings.

import { prisma } from "@/lib/db";
import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/rbac";
import { guardSignedOff } from "@/lib/inspect/inspection-helpers";
import { checkAgainstSpec } from "@/lib/inspection-matching";

type RouteContext = { params: Promise<{ id: string }> };

export async function POST(request: Request, { params }: RouteContext) {
  const authResult = await requireAuth(request);
  if (authResult.error) return authResult.error;

  try {
    if (!authResult.user.organizationId) {
      return NextResponse.json({ success: false, error: "No organization assigned" }, { status: 403 });
    }

    const { id } = await params;
    const session = await prisma.captureSession.findUnique({
      where: { id },
      include: { inspectionTemplate: { select: { id: true } } },
    });
    if (!session || session.organizationId !== authResult.user.organizationId) {
      return NextResponse.json({ success: false, error: "Session not found" }, { status: 404 });
    }
    const guard = guardSignedOff(session);
    if (guard) return guard;

    const body = await request.json();
    const { measurementId, inspectionItemId, bulkApply, resolveConflict } = body as {
      measurementId: string;
      inspectionItemId: string;
      bulkApply?: boolean;           // Apply to all matching-spec items in section
      resolveConflict?: "accept" | "reject";  // Reconciliation conflict resolution
    };

    // ── Reconciliation conflict resolution ──
    if (resolveConflict && measurementId) {
      if (resolveConflict === "accept") {
        // Accept the suggestion: reassign measurement to the suggested item
        if (!inspectionItemId) {
          return NextResponse.json({ success: false, error: "inspectionItemId required for accept" }, { status: 400 });
        }
        // The actual reassignment uses the same logic below
      } else {
        // Reject: keep current assignment, mark conflict as resolved in summary
        if (session.reconciliationSummary) {
          const summary = session.reconciliationSummary as Record<string, unknown>;
          const conflicts = (summary.conflicts as Array<Record<string, unknown>>) || [];
          const updated = conflicts.map((c) =>
            c.measurementId === measurementId ? { ...c, resolved: true } : c
          );
          const updatedSummary = JSON.parse(JSON.stringify({ ...summary, conflicts: updated }));
          await prisma.captureSession.update({
            where: { id },
            data: { reconciliationSummary: updatedSummary },
          });
        }
        return NextResponse.json({ success: true, data: { resolved: "rejected" } });
      }
    }

    if (!measurementId || !inspectionItemId) {
      return NextResponse.json({ success: false, error: "measurementId and inspectionItemId are required" }, { status: 400 });
    }

    // Verify measurement belongs to this session
    const measurement = await prisma.measurement.findUnique({ where: { id: measurementId } });
    if (!measurement || measurement.captureSessionId !== id) {
      return NextResponse.json({ success: false, error: "Measurement not found in this session" }, { status: 404 });
    }

    // Load target item and verify it belongs to this session's template
    const item = await prisma.inspectionItem.findUnique({
      where: { id: inspectionItemId },
      include: { section: { select: { templateId: true, id: true } } },
    });
    if (!item) {
      return NextResponse.json({ success: false, error: "Inspection item not found" }, { status: 404 });
    }
    if (session.inspectionTemplateId && item.section.templateId !== session.inspectionTemplateId) {
      return NextResponse.json({ success: false, error: "Item does not belong to this session's template" }, { status: 400 });
    }

    // Perform the assignment with unit-aware spec check
    const specResult = checkAgainstSpec(
      measurement.value,
      measurement.unit,
      item.specValueLow,
      item.specValueHigh,
      item.specUnit
    );
    const toleranceResult = specResult === "pass" ? "in_spec" : specResult === "fail" ? "out_of_spec" : null;

    const results: Array<{ itemId: string; toleranceResult: string | null }> = [];

    await prisma.$transaction(async (tx) => {
      // Assign measurement to item
      await tx.measurement.update({
        where: { id: measurementId },
        data: {
          inspectionItemId,
          toleranceLow: item.specValueLow,
          toleranceHigh: item.specValueHigh,
          inTolerance: specResult === "pass" ? true : specResult === "fail" ? false : null,
          status: specResult === "fail" ? "out_of_tolerance" : "confirmed",
        },
      });

      // Update progress
      await tx.inspectionProgress.upsert({
        where: {
          captureSessionId_inspectionItemId: {
            captureSessionId: id,
            inspectionItemId,
          },
        },
        create: {
          captureSessionId: id,
          inspectionItemId,
          status: specResult === "fail" ? "problem" : "done",
          result: toleranceResult,
          measurementId,
          completedAt: new Date(),
          completedById: authResult.user.id,
        },
        update: {
          status: specResult === "fail" ? "problem" : "done",
          result: toleranceResult,
          measurementId,
          completedAt: new Date(),
          completedById: authResult.user.id,
        },
      });

      // Create finding if out-of-spec
      if (specResult === "fail") {
        const specRange = item.specValueLow != null && item.specValueHigh != null
          ? `${item.specValueLow}-${item.specValueHigh} ${item.specUnit || ""}`
          : item.specValueLow != null
            ? `>= ${item.specValueLow} ${item.specUnit || ""}`
            : `<= ${item.specValueHigh} ${item.specUnit || ""}`;

        await tx.inspectionFinding.create({
          data: {
            captureSessionId: id,
            inspectionItemId,
            inspectionSectionId: item.section.id,
            createdById: authResult.user.id,
            description: `Out-of-spec: captured ${measurement.value} ${measurement.unit}, expected ${specRange}`,
            severity: "major",
            status: "open",
          },
        });
      }

      results.push({ itemId: inspectionItemId, toleranceResult });
    });

    // ── Bulk apply: assign to all pending items in section with matching spec ──
    if (bulkApply && session.activeInspectionSectionId) {
      const matchingItems = await prisma.inspectionItem.findMany({
        where: {
          sectionId: session.activeInspectionSectionId,
          id: { not: inspectionItemId },
          specValueLow: item.specValueLow,
          specValueHigh: item.specValueHigh,
          specUnit: item.specUnit,
          // Only items without existing progress (pending)
          inspectionProgress: {
            none: {
              captureSessionId: id,
              status: { in: ["done", "problem"] },
            },
          },
        },
      });

      for (const matchItem of matchingItems) {
        const bulkSpec = checkAgainstSpec(
          measurement.value, measurement.unit,
          matchItem.specValueLow, matchItem.specValueHigh, matchItem.specUnit
        );
        const bulkTolerance = bulkSpec === "pass" ? "in_spec" : bulkSpec === "fail" ? "out_of_spec" : null;

        await prisma.inspectionProgress.upsert({
          where: {
            captureSessionId_inspectionItemId: {
              captureSessionId: id,
              inspectionItemId: matchItem.id,
            },
          },
          create: {
            captureSessionId: id,
            inspectionItemId: matchItem.id,
            status: bulkSpec === "fail" ? "problem" : "done",
            result: bulkTolerance,
            measurementId,
            completedAt: new Date(),
            completedById: authResult.user.id,
          },
          update: {
            status: bulkSpec === "fail" ? "problem" : "done",
            result: bulkTolerance,
            measurementId,
            completedAt: new Date(),
            completedById: authResult.user.id,
          },
        });

        results.push({ itemId: matchItem.id, toleranceResult: bulkTolerance });
      }
    }

    // If resolving a conflict, mark it resolved in the summary
    if (resolveConflict === "accept" && session.reconciliationSummary) {
      const summary = session.reconciliationSummary as Record<string, unknown>;
      const conflicts = (summary.conflicts as Array<Record<string, unknown>>) || [];
      const updated = conflicts.map((c) =>
        c.measurementId === measurementId ? { ...c, resolved: true } : c
      );
      const updatedSummary = JSON.parse(JSON.stringify({ ...summary, conflicts: updated }));
      await prisma.captureSession.update({
        where: { id },
        data: { reconciliationSummary: updatedSummary },
      });
    }

    return NextResponse.json({
      success: true,
      data: {
        assigned: true,
        results,
        bulkCount: results.length - 1,
      },
    });
  } catch (error) {
    console.error("[inspect/assign POST]", error);
    return NextResponse.json({ success: false, error: "Failed to assign measurement" }, { status: 500 });
  }
}
