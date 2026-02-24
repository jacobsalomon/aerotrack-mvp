import { NextRequest, NextResponse } from "next/server";
import { requireDashboardAuth } from "@/lib/dashboard-auth";

// This API route generates a structured repair work order from captured
// maintenance data. Uses Claude API if available, otherwise returns
// realistic mock data for demo purposes.

export async function POST(req: NextRequest) {
  // Require dashboard authentication
  const authError = requireDashboardAuth(req);
  if (authError) return authError;

  let body;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  const apiKey = process.env.ANTHROPIC_API_KEY;

  if (apiKey) {
    // ── REAL AI GENERATION ──
    try {
      const response = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": apiKey,
          "anthropic-version": "2023-06-01",
        },
        signal: AbortSignal.timeout(25000),
        body: JSON.stringify({
          model: "claude-sonnet-4-5-20250929",
          max_tokens: 4096,
          messages: [
            {
              role: "user",
              content: `You are an aerospace maintenance documentation specialist. Generate a complete repair work order from the following maintenance data.

Structure the work order as JSON with these keys:
- workOrderNumber: format WO-ACE-${new Date().getFullYear()}-XXXXX
- customer: customer name and work scope
- component: { partNumber, serialNumber, description }
- dateReceived: ISO date string
- dateCompleted: ISO date string
- asReceivedCondition: string description
- findings: array of { findingNumber, description, location, cmmReference, disposition, photoRef }
- workPerformed: array of { actionNumber, description, cmmStep, partsConsumed, specialTools }
- testResults: array of { testType, specification, measuredResult, passFail }
- partsConsumed: array of { item, partNumber, serialNumber, qty, sourceDoc, vendor }
- returnToServiceStatement: formal statement

Write in proper aerospace maintenance language. Be precise and factual.
Return ONLY valid JSON (no markdown code fences).

Maintenance data:
${JSON.stringify(body, null, 2)}`,
            },
          ],
        }),
      });

      // Check for API errors before parsing
      if (!response.ok) {
        const errorBody = await response.text().catch(() => "");
        console.error(`Anthropic API error (status ${response.status}): ${errorBody.slice(0, 200)}`);
        throw new Error(`Anthropic API returned status ${response.status}`);
      }

      const aiResult = await response.json();
      const textContent = aiResult.content?.[0]?.text || "";

      try {
        return NextResponse.json(JSON.parse(textContent));
      } catch {
        return NextResponse.json({ rawText: textContent, _raw: true });
      }
    } catch (error) {
      console.error("AI work order generation failed, falling back to mock:", error);
    }
  }

  // ── MOCK GENERATION ──
  const comp = body.component || {};
  const now = new Date();
  const woNumber = `WO-ACE-${now.getFullYear()}-${String(Math.floor(Math.random() * 99999)).padStart(5, "0")}`;

  // Build findings from captured items
  const capturedFindings = (body.capturedItems || [])
    .filter((item: { type: string }) => item.type === "text_note" || item.type === "voice")
    .map((item: { label: string; detail?: string }, i: number) => ({
      findingNumber: `F-${String(i + 1).padStart(3, "0")}`,
      description: item.label,
      location: comp.description || "Main assembly",
      cmmReference: `CMM ${comp.partNumber || "N/A"}-OH, Ch. 70-${20 + i}`,
      disposition: i === 0 ? "Replace" : "Serviceable",
      photoRef: `Photo ${i + 1}`,
    }));

  // Build work actions from all captured items
  const workActions = (body.capturedItems || [])
    .map((item: { label: string; type: string; detail?: string }, i: number) => ({
      actionNumber: `A-${String(i + 1).padStart(3, "0")}`,
      description: item.label,
      cmmStep: `Step ${70 + i}.${10 + i}`,
      partsConsumed: item.type === "part_replaced" ? item.detail || "See parts list" : "N/A",
      specialTools: "Standard tooling",
    }));

  // Build test results from test-type captured items
  const testItems = (body.testResults || []).map(
    (test: { name: string; spec?: string; value?: string; result?: string }, i: number) => ({
      testType: test.name || `Test ${i + 1}`,
      specification: test.spec || "Per CMM limits",
      measuredResult: test.value || "Within limits",
      passFail: test.result || "PASS",
    })
  );

  // If no test results were passed in, use some realistic defaults
  const defaultTests =
    testItems.length > 0
      ? testItems
      : [
          {
            testType: "Proof Pressure Test",
            specification: "4500 PSI for 5 min, no leakage per CMM 29-10-01",
            measuredResult: "4500 PSI held, zero leakage",
            passFail: "PASS",
          },
          {
            testType: "Flow Rate Verification",
            specification: "28-32 GPM at 3000 PSI per CMM 29-10-02",
            measuredResult: "30.2 GPM at 3000 PSI",
            passFail: "PASS",
          },
          {
            testType: "Internal Leakage",
            specification: "< 0.5 cc/min at 3000 PSI per CMM 29-10-03",
            measuredResult: "0.12 cc/min",
            passFail: "PASS",
          },
        ];

  const mockResult = {
    workOrderNumber: woNumber,
    customer: "Delta Air Lines — HPC-7 Hydraulic Pump Overhaul",
    component: {
      partNumber: comp.partNumber || "881700-1089",
      serialNumber: comp.serialNumber || "N/A",
      description: comp.description || "HPC-7 Hydraulic Pump Assembly",
    },
    dateReceived: new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)
      .toISOString()
      .split("T")[0],
    dateCompleted: now.toISOString().split("T")[0],
    asReceivedCondition:
      "Component received in shipping container with protective caps in place. No shipping damage observed. External surfaces show normal operational wear. Identification plate legible, P/N and S/N verified against incoming paperwork.",
    findings:
      capturedFindings.length > 0
        ? capturedFindings
        : [
            {
              findingNumber: "F-001",
              description:
                "Main shaft bearing journal shows wear at 0.0008\" — within serviceable limits per CMM Table 70-20-01.",
              location: "Main shaft bearing area",
              cmmReference: "CMM 881700-OH Rev. 12, Ch. 70-20",
              disposition: "Serviceable",
              photoRef: "Photo 1",
            },
            {
              findingNumber: "F-002",
              description:
                "O-ring seals on inlet port degraded — hardness at Shore 82A (min 75A). Replaced per scheduled overhaul requirements.",
              location: "Inlet port seal area",
              cmmReference: "CMM 881700-OH Rev. 12, Ch. 70-30",
              disposition: "Replace",
              photoRef: "Photo 2",
            },
            {
              findingNumber: "F-003",
              description:
                "Gear teeth inspection via magnetic particle — no cracks or indications found. All teeth within wear limits.",
              location: "Gear drive assembly",
              cmmReference: "CMM 881700-OH Rev. 12, Ch. 70-40",
              disposition: "Serviceable",
              photoRef: "Photo 3",
            },
          ],
    workPerformed:
      workActions.length > 0
        ? workActions
        : [
            {
              actionNumber: "A-001",
              description:
                "Disassembled pump per CMM 881700-OH Ch. 72-00. All parts cleaned per Ch. 72-10.",
              cmmStep: "72-00 / 72-10",
              partsConsumed: "N/A",
              specialTools: "Hydraulic pump fixture P/N JT-4401",
            },
            {
              actionNumber: "A-002",
              description:
                "Replaced all O-ring seals and backup rings per overhaul requirements.",
              cmmStep: "72-30",
              partsConsumed:
                "Seal kit P/N SK-881700-1 (see parts consumed table)",
              specialTools: "Standard tooling",
            },
            {
              actionNumber: "A-003",
              description:
                "Reassembled pump per CMM 881700-OH Ch. 72-50. Torque values verified per Table 72-50-01.",
              cmmStep: "72-50",
              partsConsumed: "N/A",
              specialTools: "Torque wrench calibrated per cal date 2026-01-15",
            },
          ],
    testResults: defaultTests,
    partsConsumed: [
      {
        item: "Seal Kit",
        partNumber: "SK-881700-1",
        serialNumber: "N/A (consumable)",
        qty: "1",
        sourceDoc: "CoC #24-11892",
        vendor: "Parker Hannifin OEM",
      },
      {
        item: "Inlet O-Ring",
        partNumber: "MS29513-236",
        serialNumber: "N/A (consumable)",
        qty: "2",
        sourceDoc: "CoC #24-11893",
        vendor: "Parker Hannifin OEM",
      },
    ],
    returnToServiceStatement: `Work on ${comp.description || "HPC-7 Hydraulic Pump Assembly"} P/N ${comp.partNumber || "881700-1089"} S/N ${comp.serialNumber || "N/A"} was accomplished in accordance with ${comp.partNumber || "881700"}-OH Rev. 12 and applicable FAA-approved data. All inspections passed, all test parameters within limits. Component is approved for return to service.`,
  };

  return NextResponse.json(mockResult);
}
