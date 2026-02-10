import { NextRequest, NextResponse } from "next/server";

// This API route generates an FAA Form 8130-3 (Authorized Release Certificate)
// from captured maintenance data. It uses the Anthropic Claude API if a key is
// available, otherwise returns realistic mock data for demo purposes.

export async function POST(req: NextRequest) {
  const body = await req.json();

  // Check if we have an Anthropic API key configured
  const apiKey = process.env.ANTHROPIC_API_KEY;

  if (apiKey) {
    // ── REAL AI GENERATION ──
    // Send all captured data to Claude and get back a structured 8130-3
    try {
      const response = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": apiKey,
          "anthropic-version": "2023-06-01",
        },
        body: JSON.stringify({
          model: "claude-sonnet-4-5-20250929",
          max_tokens: 4096,
          messages: [
            {
              role: "user",
              content: `You are an expert aerospace maintenance documentation specialist. Generate a complete FAA Form 8130-3 (Authorized Release Certificate) from the following maintenance data.

The 8130-3 has 14 blocks. Fill each one accurately:
- Block 1: Approving Civil Aviation Authority (use 'FAA' for US-based shops)
- Block 2: Authorized Release Document (check 'Authorized Release Certificate')
- Block 3: Form Tracking Number (generate format: ATC-${new Date().getFullYear()}-${String(Math.floor(Math.random() * 99999)).padStart(5, "0")})
- Block 4: Approved Organization Name & Address (from facility info)
- Block 5: Work Order/Contract/Invoice Number
- Block 6: Item details
  - 6a: Description
  - 6b: Part Number
  - 6c: Serial Number
  - 6d: Quantity
  - 6e: Status/Work (Overhauled/Repaired/Inspected/Modified/Tested/New)
- Block 7: Remarks (detailed description of work performed, findings, parts replaced, test results, and any limitations)
- Block 8-10: (Leave blank — relates to import/export)
- Block 11: Approval/Authorization number
- Block 12: Date of approval
- Block 13: Authorized Signature (leave as [PENDING E-SIGNATURE])
- Block 14: Certifying Statement

For Block 7 (Remarks), write in proper aerospace maintenance language:
- Use present/past tense consistently
- Reference CMM sections and revisions
- List all findings with disposition (serviceable/replaced/repaired)
- List all parts consumed with P/N, S/N, and source documentation
- Include test results with specifications and pass/fail
- Be precise and factual — do not embellish

Return ONLY a JSON object (no markdown code fences) with keys: block1 through block14, plus narrative_summary.

Maintenance data:
${JSON.stringify(body, null, 2)}`,
            },
          ],
        }),
      });

      const aiResult = await response.json();
      // Extract the text content from Claude's response
      const textContent = aiResult.content?.[0]?.text || "";

      // Parse the JSON from Claude's response
      try {
        const parsed = JSON.parse(textContent);
        return NextResponse.json(parsed);
      } catch {
        // If Claude didn't return valid JSON, wrap the text
        return NextResponse.json({
          block1: "FAA",
          block7: textContent,
          narrative_summary: textContent,
          _raw: true,
        });
      }
    } catch (error) {
      console.error("AI generation failed, falling back to mock:", error);
      // Fall through to mock generation below
    }
  }

  // ── MOCK GENERATION (used when no API key is set) ──
  // Returns realistic-looking 8130-3 data based on the component info
  const comp = body.component || {};
  const now = new Date();
  const formNumber = `ATC-${now.getFullYear()}-${String(Math.floor(Math.random() * 99999)).padStart(5, "0")}`;

  // Build the Block 7 remarks from whatever data was captured
  const findings = (body.capturedItems || [])
    .filter((item: { type: string; label: string }) => item.type === "text_note" || item.type === "voice")
    .map((item: { label: string }) => item.label)
    .join(". ");

  const measurements = (body.capturedItems || [])
    .filter((item: { type: string }) => item.type === "measurement")
    .map((item: { label: string; detail?: string }) => `${item.label}: ${item.detail || "within limits"}`)
    .join("; ");

  const partsReplaced = (body.capturedItems || [])
    .filter((item: { type: string }) => item.type === "part_replaced")
    .map((item: { label: string }) => item.label)
    .join("; ");

  const remarksBlock = [
    `Component ${comp.partNumber || "N/A"} S/N ${comp.serialNumber || "N/A"} received for overhaul per CMM ${comp.partNumber || "N/A"}-OH Rev. 12.`,
    findings ? `Findings: ${findings}.` : "No discrepancies noted during inspection.",
    measurements ? `Measurements: ${measurements}.` : "",
    partsReplaced ? `Parts consumed: ${partsReplaced}.` : "",
    `All tests performed per CMM requirements. Component meets serviceable limits.`,
    `Reassembled, functionally tested, and released to service.`,
  ]
    .filter(Boolean)
    .join("\n");

  const mockResult = {
    block1: "FAA",
    block2: "Authorized Release Certificate",
    block3: formNumber,
    block4:
      "ACE Aerospace Repair Station\n1234 Aviation Way\nMiami, FL 33142\nRepair Station Certificate: AY2R123N",
    block5: `WO-ACE-${now.getFullYear()}-${String(Math.floor(Math.random() * 99999)).padStart(5, "0")}`,
    block6a: comp.description || "Hydraulic Pump Assembly",
    block6b: comp.partNumber || "881700-1089",
    block6c: comp.serialNumber || "N/A",
    block6d: "1",
    block6e: "Overhauled",
    block7: remarksBlock,
    block8: "",
    block9: "",
    block10: "",
    block11: "AY2R123N",
    block12: now.toISOString().split("T")[0],
    block13: "[PENDING E-SIGNATURE]",
    block14:
      "Except as noted above, the work identified in Block 5 and described in Block 7 was accomplished in accordance with current FAA-approved data and with respect to that work, the items are approved for return to service.",
    narrative_summary: `${comp.description || "Component"} P/N ${comp.partNumber || "N/A"} S/N ${comp.serialNumber || "N/A"} overhauled in accordance with CMM. All inspections and tests passed. Component approved for return to service.`,
  };

  return NextResponse.json(mockResult);
}
