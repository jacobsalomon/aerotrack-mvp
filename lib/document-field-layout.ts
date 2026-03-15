export interface DocumentFieldEntry {
  key: string;
  label: string;
  value: string;
}

export interface DocumentFieldSection {
  title: string;
  entries: DocumentFieldEntry[];
}

interface SectionConfig {
  title: string;
  fields: Array<{ key: string; label: string }>;
}

const DOCUMENT_LAYOUTS: Record<string, SectionConfig[]> = {
  "8130-3": [
    {
      title: "Certificate",
      fields: [
        { key: "block1", label: "Block 1" },
        { key: "block2", label: "Block 2" },
        { key: "block3", label: "Block 3" },
        { key: "block4", label: "Block 4" },
        { key: "block5", label: "Block 5" },
      ],
    },
    {
      title: "Part Details",
      fields: [
        { key: "block6a", label: "Block 6A" },
        { key: "block6b", label: "Block 6B" },
        { key: "block6c", label: "Block 6C" },
        { key: "block6d", label: "Block 6D" },
        { key: "block6e", label: "Block 6E" },
      ],
    },
    {
      title: "Work & Release",
      fields: [
        { key: "block7", label: "Block 7" },
        { key: "block8", label: "Block 8" },
        { key: "block9", label: "Block 9" },
        { key: "block10", label: "Block 10" },
        { key: "block11", label: "Block 11" },
        { key: "block12", label: "Block 12" },
        { key: "block13", label: "Block 13" },
        { key: "block14", label: "Block 14" },
      ],
    },
    {
      title: "Summary",
      fields: [{ key: "narrative_summary", label: "Narrative Summary" }],
    },
  ],
  "337": [
    {
      title: "Aircraft",
      fields: [
        { key: "aircraft.registration", label: "Registration" },
        { key: "aircraft.serialNumber", label: "Serial Number" },
        { key: "aircraft.make", label: "Make" },
        { key: "aircraft.model", label: "Model" },
      ],
    },
    {
      title: "Owner",
      fields: [
        { key: "owner.name", label: "Owner Name" },
        { key: "owner.address", label: "Owner Address" },
      ],
    },
    {
      title: "Repair Details",
      fields: [
        { key: "repairType", label: "Repair Type" },
        { key: "unit", label: "Unit" },
        { key: "appliance.make", label: "Appliance Make" },
        { key: "appliance.model", label: "Appliance Model" },
        { key: "appliance.serialNumber", label: "Appliance Serial Number" },
        { key: "appliance.type", label: "Appliance Type" },
      ],
    },
    {
      title: "Conformity",
      fields: [
        { key: "conformity.agency", label: "Agency" },
        { key: "conformity.agencyKind", label: "Agency Kind" },
        { key: "conformity.certificateNumber", label: "Certificate Number" },
        { key: "conformity.signedBy", label: "Signed By" },
        { key: "conformity.date", label: "Date" },
      ],
    },
    {
      title: "Approval",
      fields: [
        { key: "approval.status", label: "Approval Status" },
        { key: "approval.type", label: "Approval Type" },
        { key: "approval.certificate", label: "Approval Certificate" },
        { key: "approval.signedBy", label: "Approval Signed By" },
        { key: "approval.date", label: "Approval Date" },
      ],
    },
    {
      title: "Description",
      fields: [{ key: "workDescription", label: "Work Description" }],
    },
  ],
  "8010-4": [
    {
      title: "Aircraft",
      fields: [
        { key: "aircraft.registration", label: "Registration" },
        { key: "aircraft.manufacturer", label: "Manufacturer" },
        { key: "aircraft.model", label: "Model" },
        { key: "aircraft.serialNumber", label: "Serial Number" },
      ],
    },
    {
      title: "Defect Part",
      fields: [
        { key: "defectPart.name", label: "Defect Part Name" },
        { key: "defectPart.partNumber", label: "Defect Part Number" },
        { key: "defectPart.serialNumber", label: "Defect Part Serial Number" },
        { key: "defectPart.location", label: "Defect Location" },
      ],
    },
    {
      title: "Assembly",
      fields: [
        { key: "componentAssembly.name", label: "Assembly Name" },
        { key: "componentAssembly.manufacturer", label: "Assembly Manufacturer" },
        { key: "componentAssembly.partNumber", label: "Assembly Part Number" },
        { key: "componentAssembly.serialNumber", label: "Assembly Serial Number" },
      ],
    },
    {
      title: "Metrics",
      fields: [
        { key: "metrics.partTotalTime", label: "Part Total Time" },
        { key: "metrics.partTSO", label: "Part TSO" },
        { key: "metrics.partCondition", label: "Part Condition" },
      ],
    },
    {
      title: "Submission",
      fields: [
        { key: "dateSubmitted", label: "Date Submitted" },
        { key: "submittedBy.type", label: "Submitter Type" },
        { key: "submittedBy.designation", label: "Submitter Designation" },
        { key: "submittedBy.telephone", label: "Submitter Telephone" },
      ],
    },
    {
      title: "Comments",
      fields: [{ key: "comments", label: "Comments" }],
    },
  ],
  "8130-1": [
    {
      title: "Applicant",
      fields: [
        { key: "applicantName", label: "Applicant Name" },
        { key: "applicantAddress", label: "Address" },
      ],
    },
    {
      title: "Product",
      fields: [
        { key: "productType", label: "Type/Description" },
        { key: "partNumber", label: "Part Number" },
        { key: "serialNumber", label: "Serial Number" },
        { key: "manufacturer", label: "Manufacturer" },
        { key: "modelDesignation", label: "Model Designation" },
      ],
    },
    {
      title: "Export Destination",
      fields: [
        { key: "importingCountry", label: "Importing Country" },
        { key: "foreignAuthority", label: "Foreign Authority" },
      ],
    },
    {
      title: "Certification",
      fields: [
        { key: "basisForIssuance", label: "Basis for Issuance" },
        { key: "remarks", label: "Remarks" },
        { key: "inspectorName", label: "Inspector" },
        { key: "certificateNumber", label: "Certificate Number" },
        { key: "date", label: "Date" },
        { key: "signature", label: "Signature" },
      ],
    },
  ],
  "8130-6": [
    {
      title: "Aircraft Description",
      fields: [
        { key: "registrationMark", label: "Registration Mark" },
        { key: "aircraftBuilder", label: "Aircraft Builder" },
        { key: "modelDesignation", label: "Model Designation" },
        { key: "serialNumber", label: "Serial Number" },
        { key: "engineModel", label: "Engine Model" },
        { key: "propellerModel", label: "Propeller Model" },
      ],
    },
    {
      title: "Certificate Requested",
      fields: [
        { key: "certificateType", label: "Certificate Type" },
        { key: "category", label: "Category" },
        { key: "operatingLimitations", label: "Operating Limitations" },
      ],
    },
    {
      title: "Certification Basis",
      fields: [
        { key: "typeCertNumber", label: "Type Certificate Number" },
        { key: "productionBasis", label: "Production Basis" },
        { key: "remarks", label: "Remarks" },
      ],
    },
    {
      title: "Signatures",
      fields: [
        { key: "applicantName", label: "Applicant" },
        { key: "applicantSignature", label: "Applicant Signature" },
        { key: "date", label: "Date" },
        { key: "inspectorSignature", label: "Inspector Signature" },
        { key: "inspectorDate", label: "Inspector Date" },
      ],
    },
  ],
  "easa-form-1": [
    {
      title: "Authority",
      fields: [
        { key: "block1", label: "Competent Authority" },
        { key: "block3", label: "Form Tracking Number" },
        { key: "block4", label: "Organization" },
        { key: "block5", label: "Work Order" },
      ],
    },
    {
      title: "Item Identification",
      fields: [
        { key: "block6a", label: "Description" },
        { key: "block6b", label: "Part Number" },
        { key: "block6c", label: "Serial Number" },
        { key: "block6d", label: "Quantity" },
      ],
    },
    {
      title: "Remarks & Release",
      fields: [
        { key: "block7", label: "Remarks" },
        { key: "block8", label: "Part 21 (Production)" },
        { key: "block9", label: "Part 145 (Maintenance)" },
        { key: "block10", label: "Other Regulation" },
      ],
    },
    {
      title: "Authorization",
      fields: [
        { key: "block11", label: "Approval Number" },
        { key: "block12", label: "Date" },
        { key: "block13", label: "Authorized Signature" },
        { key: "block14", label: "Certifying Statement" },
      ],
    },
  ],
};

export function humanizeFieldLabel(field: string): string {
  return field
    .replace(/[._]/g, " ")
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

export function formatFieldValue(value: unknown): string {
  if (value === null || value === undefined || value === "") return "—";
  if (Array.isArray(value)) return value.map((entry) => formatFieldValue(entry)).join(", ");
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

export function getValueAtPath(
  object: Record<string, unknown>,
  path: string
): unknown {
  if (path in object) {
    return object[path];
  }

  return path.split(".").reduce<unknown>((current, part) => {
    if (!current || typeof current !== "object") return undefined;
    return (current as Record<string, unknown>)[part];
  }, object);
}

export function setValueAtPath(
  object: Record<string, unknown>,
  path: string,
  value: unknown
): void {
  if (path in object) {
    object[path] = value;
    return;
  }

  const parts = path.split(".");
  let current: Record<string, unknown> = object;

  for (let i = 0; i < parts.length - 1; i++) {
    const part = parts[i];
    const nextValue = current[part];
    if (!nextValue || typeof nextValue !== "object" || Array.isArray(nextValue)) {
      current[part] = {};
    }
    current = current[part] as Record<string, unknown>;
  }

  current[parts[parts.length - 1]] = value;
}

function collectLeafPaths(
  fields: Record<string, unknown>,
  parentKey = ""
): string[] {
  return Object.entries(fields).flatMap(([key, value]) => {
    const fieldKey = parentKey ? `${parentKey}.${key}` : key;
    if (value && typeof value === "object" && !Array.isArray(value)) {
      return collectLeafPaths(value as Record<string, unknown>, fieldKey);
    }

    return [fieldKey];
  });
}

export function getDocumentFieldSections(
  documentType: string,
  fields: Record<string, unknown>
): DocumentFieldSection[] {
  const layout = DOCUMENT_LAYOUTS[documentType] || [];
  const usedKeys = new Set<string>();
  const sections: DocumentFieldSection[] = [];

  for (const section of layout) {
    const entries = section.fields
      .map((field) => {
        const value = getValueAtPath(fields, field.key);
        if (value === undefined) return null;
        usedKeys.add(field.key);
        return {
          key: field.key,
          label: field.label,
          value: formatFieldValue(value),
        };
      })
      .filter((entry): entry is DocumentFieldEntry => entry !== null);

    if (entries.length > 0) {
      sections.push({ title: section.title, entries });
    }
  }

  const additionalEntries = collectLeafPaths(fields)
    .filter((key) => !usedKeys.has(key))
    .map((key) => ({
      key,
      label: humanizeFieldLabel(key),
      value: formatFieldValue(getValueAtPath(fields, key)),
    }));

  if (additionalEntries.length > 0) {
    sections.push({ title: "Additional Fields", entries: additionalEntries });
  }

  if (sections.length === 0) {
    sections.push({
      title: "Fields",
      entries: collectLeafPaths(fields).map((key) => ({
        key,
        label: humanizeFieldLabel(key),
        value: formatFieldValue(getValueAtPath(fields, key)),
      })),
    });
  }

  return sections;
}
