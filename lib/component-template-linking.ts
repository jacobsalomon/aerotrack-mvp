// Auto-link inspection templates to components by matching part numbers.
// Called when a template is approved (status → active).

import { prisma } from "@/lib/db";

interface TemplateForLinking {
  id: string;
  organizationId: string;
  partNumbersCovered: string[];
}

/**
 * Find all components matching the template's part numbers
 * and create join table records. Returns the number of links created.
 */
export async function linkTemplateToComponents(
  template: TemplateForLinking
): Promise<number> {
  if (template.partNumbersCovered.length === 0) return 0;

  // Find components with matching part numbers
  // Note: Component model doesn't have organizationId yet (known gap),
  // so we match globally. Fine for single-tenant SilverWings pilot.
  const matchingComponents = await prisma.component.findMany({
    where: {
      partNumber: { in: template.partNumbersCovered },
    },
    select: { id: true },
  });

  if (matchingComponents.length === 0) return 0;

  // Remove any existing links for this template (in case of re-approval)
  await prisma.componentInspectionTemplate.deleteMany({
    where: { templateId: template.id },
  });

  // Create new links
  await prisma.componentInspectionTemplate.createMany({
    data: matchingComponents.map((component) => ({
      componentId: component.id,
      templateId: template.id,
    })),
    skipDuplicates: true,
  });

  console.log(
    `[Auto-Link] Linked template ${template.id} to ${matchingComponents.length} components`
  );

  return matchingComponents.length;
}
