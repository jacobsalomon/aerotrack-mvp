// AD/SB Compliance Tracker
// Checks whether a component has complied with all applicable
// Airworthiness Directives and Service Bulletins.
//
// "Applicable" means the AD/SB's applicability field matches the
// component's part number (exact match or part family prefix match).

import { prisma } from "@/lib/db";

export interface ComplianceStatus {
  adNumber?: string;
  sbNumber?: string;
  title: string;
  issuer: string;
  type: "AD" | "SB";
  category: string;        // "MANDATORY" for ADs, or SB category
  compliant: boolean;       // True if the component has a matching compliance event
  complianceAction: string;
  complianceEvent?: {
    id: string;
    date: Date;
    description: string;
  };
}

export interface ComplianceReport {
  componentId: string;
  partNumber: string;
  totalApplicable: number;
  compliant: number;
  nonCompliant: number;
  items: ComplianceStatus[];
}

// Check if a part number matches an applicability string.
// Applicability can contain comma-separated part numbers or prefixes.
// E.g., "881700-*" matches "881700-1089", "881700, 881701" matches "881700-1089"
function matchesApplicability(
  partNumber: string,
  applicability: string
): boolean {
  const patterns = applicability.split(",").map((p) => p.trim());
  for (const pattern of patterns) {
    // Wildcard match (e.g., "881700-*" or "881700*")
    if (pattern.includes("*")) {
      const prefix = pattern.replace("*", "");
      if (partNumber.startsWith(prefix)) return true;
    }
    // Exact match
    if (partNumber === pattern) return true;
    // Part family prefix match (first 6 chars)
    if (
      pattern.length >= 6 &&
      partNumber.startsWith(pattern.substring(0, 6))
    ) {
      return true;
    }
  }
  return false;
}

// Check a single component's compliance with all applicable ADs and SBs.
// Looks at the component's lifecycle events to see if compliance work was recorded.
export async function checkComponentCompliance(
  componentId: string
): Promise<ComplianceReport> {
  // Load the component and its lifecycle events
  const component = await prisma.component.findUnique({
    where: { id: componentId },
    include: {
      events: {
        orderBy: { date: "desc" },
      },
    },
  });

  if (!component) {
    throw new Error(`Component ${componentId} not found`);
  }

  // Find all active ADs and SBs that apply to this part number
  const [ads, sbs] = await Promise.all([
    prisma.airworthinessDirective.findMany({
      where: { status: "ACTIVE" },
    }),
    prisma.serviceBulletin.findMany({
      where: { status: "ACTIVE" },
    }),
  ]);

  const applicableADs = ads.filter((ad) =>
    matchesApplicability(component.partNumber, ad.applicability)
  );
  const applicableSBs = sbs.filter((sb) =>
    matchesApplicability(component.partNumber, sb.applicability)
  );

  // Check compliance for each AD
  const items: ComplianceStatus[] = [];

  for (const ad of applicableADs) {
    // Look for a lifecycle event that references this AD
    const complianceEvent = component.events.find(
      (e) =>
        e.description.includes(ad.adNumber) ||
        e.description.toLowerCase().includes("ad compliance") ||
        e.description.toLowerCase().includes(ad.title.toLowerCase().substring(0, 30))
    );

    items.push({
      adNumber: ad.adNumber,
      title: ad.title,
      issuer: ad.issuer,
      type: "AD",
      category: ad.isEmergency ? "EMERGENCY" : "MANDATORY",
      compliant: !!complianceEvent,
      complianceAction: ad.complianceAction,
      complianceEvent: complianceEvent
        ? {
            id: complianceEvent.id,
            date: complianceEvent.date,
            description: complianceEvent.description,
          }
        : undefined,
    });
  }

  for (const sb of applicableSBs) {
    const complianceEvent = component.events.find(
      (e) =>
        e.description.includes(sb.sbNumber) ||
        e.description.toLowerCase().includes(sb.title.toLowerCase().substring(0, 30))
    );

    items.push({
      sbNumber: sb.sbNumber,
      title: sb.title,
      issuer: sb.manufacturer,
      type: "SB",
      category: sb.category,
      compliant: !!complianceEvent,
      complianceAction: sb.complianceAction || sb.description,
      complianceEvent: complianceEvent
        ? {
            id: complianceEvent.id,
            date: complianceEvent.date,
            description: complianceEvent.description,
          }
        : undefined,
    });
  }

  const compliant = items.filter((i) => i.compliant).length;

  return {
    componentId,
    partNumber: component.partNumber,
    totalApplicable: items.length,
    compliant,
    nonCompliant: items.length - compliant,
    items,
  };
}

// Quick check: does this component have any non-compliant mandatory items?
// Used by the exception engine for fast scanning.
export async function hasNonCompliantADs(
  componentId: string
): Promise<{ nonCompliant: boolean; count: number; adNumbers: string[] }> {
  const report = await checkComponentCompliance(componentId);
  const nonCompliantADs = report.items.filter(
    (i) => i.type === "AD" && !i.compliant
  );
  return {
    nonCompliant: nonCompliantADs.length > 0,
    count: nonCompliantADs.length,
    adNumbers: nonCompliantADs.map((i) => i.adNumber!),
  };
}
