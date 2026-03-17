"use client";

import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Search, Download, FileText, ExternalLink } from "lucide-react";

// Every form template in public/form-templates/, grouped by category
const formTemplates = [
  // --- Airworthiness & Release ---
  {
    id: "8130-3",
    formNumber: "FAA 8130-3",
    title: "Authorized Release Certificate / Airworthiness Approval Tag",
    description:
      "Certifies that new or used parts conform to safety standards. Used to approve return to service after maintenance and repairs.",
    category: "Airworthiness & Release",
    fileName: "FAA_Form_8130-3.pdf",
    faaUrl: "https://www.faa.gov/forms/index.cfm/go/document.information/documentID/186171",
    builtIn: true,
  },
  {
    id: "8130-6",
    formNumber: "FAA 8130-6",
    title: "Application for U.S. Airworthiness Certificate",
    description:
      "Required to obtain or amend an airworthiness certificate for an aircraft.",
    category: "Airworthiness & Release",
    fileName: "FAA_Form_8130-6.pdf",
    faaUrl: "https://www.faa.gov/forms/index.cfm/go/document.information/documentid/1019145",
  },
  {
    id: "8100-2",
    formNumber: "FAA 8100-2",
    title: "Standard Airworthiness Certificate",
    description:
      "The master document proving an aircraft is airworthy. Issued by the FAA, referenced throughout maintenance.",
    category: "Airworthiness & Release",
    fileName: null, // Not publicly downloadable (employees.faa.gov only)
    faaUrl: "https://www.faa.gov/forms/index.cfm/go/document.information/documentID/1018837",
    note: "Issued by FAA only — reference form",
  },
  {
    id: "8130-7",
    formNumber: "FAA 8130-7",
    title: "Special Airworthiness Certificate",
    description:
      "Authorizes operation of an aircraft in experimental, restricted, limited, or provisional categories.",
    category: "Airworthiness & Release",
    fileName: null,
    faaUrl: "https://www.faa.gov/forms/index.cfm/go/document.information/documentID/181179",
    note: "Issued by FAA only — reference form",
  },
  {
    id: "8130-1",
    formNumber: "FAA 8130-1",
    title: "Application for Export Certificate of Airworthiness",
    description:
      "Used when exporting aircraft or components to another country — certifies they meet destination country requirements.",
    category: "Airworthiness & Release",
    fileName: "FAA_Form_8130-1.pdf",
    faaUrl: "https://www.faa.gov/documentLibrary/media/Form/8130-1_20210504.pdf",
  },
  {
    id: "easa-1",
    formNumber: "EASA Form 1",
    title: "Authorised Release Certificate (European)",
    description:
      "European equivalent of FAA 8130-3. Used worldwide by production and maintenance organizations to certify parts and components.",
    category: "Airworthiness & Release",
    fileName: "EASA_Form_1.pdf",
    faaUrl: "https://www.easa.europa.eu/en/faq/19466",
    international: true,
  },

  // --- Maintenance & Repair ---
  {
    id: "337",
    formNumber: "FAA 337",
    title: "Major Repair and Alteration",
    description:
      "Documents major repairs or alterations to airframes, powerplants, propellers, or appliances. Required for any work beyond routine maintenance.",
    category: "Maintenance & Repair",
    fileName: "FAA_Form_337.pdf",
    faaUrl: "https://www.faa.gov/forms/index.cfm/go/document.information/documentid/185675",
    builtIn: true,
  },
  {
    id: "8010-4",
    formNumber: "FAA 8010-4",
    title: "Malfunction or Defect Report",
    description:
      "Reports malfunctions, defects, or failures found during maintenance. Feeds into the Service Difficulty Reporting System.",
    category: "Maintenance & Repair",
    fileName: "FAA_Form_8010-4.pdf",
    faaUrl: "https://www.faa.gov/forms/index.cfm/go/document.information/documentID/186275",
    builtIn: true,
  },
  {
    id: "8070-1",
    formNumber: "FAA 8070-1",
    title: "Service Difficulty Report",
    description:
      "Reports service difficulties with aeronautical equipment — part failures, malfunctions, and defects discovered during operations or maintenance.",
    category: "Maintenance & Repair",
    fileName: "FAA_Form_8070-1.pdf",
    faaUrl: "https://www.faa.gov/forms/index.cfm/go/document.information/documentID/184424",
  },

  // --- Parts & Conformity ---
  {
    id: "8120-11",
    formNumber: "FAA 8120-11",
    title: "Suspected Unapproved Parts (SUP) Report",
    description:
      "Critical safety form — filed when a bogus, counterfeit, or unapproved part is suspected. Triggers FAA investigation.",
    category: "Parts & Conformity",
    fileName: "FAA_Form_8120-11.pdf",
    faaUrl: "https://www.faa.gov/forms/index.cfm/go/document.information/documentID/1043117",
  },
  {
    id: "8120-10",
    formNumber: "FAA 8120-10",
    title: "Request for Conformity",
    description:
      "Requests an FAA conformity inspection of parts, materials, or articles to verify they meet approved design data.",
    category: "Parts & Conformity",
    fileName: "FAA_Form_8120-10.pdf",
    faaUrl: "https://www.faa.gov/documentLibrary/media/Form/FAA%208120-10.pdf",
  },
  {
    id: "8130-9",
    formNumber: "FAA 8130-9",
    title: "Statement of Conformity",
    description:
      "Declares that a product, part, or component conforms to its approved design and is in a condition for safe operation.",
    category: "Parts & Conformity",
    fileName: "FAA_Form_8130-9.pdf",
    faaUrl: "https://www.faa.gov/forms/index.cfm/go/document.information/documentID/1019327",
  },
  {
    id: "8100-1",
    formNumber: "FAA 8100-1",
    title: "Conformity Inspection Record",
    description:
      "Records the results of a conformity inspection — verifying that an article meets its approved design data.",
    category: "Parts & Conformity",
    fileName: "FAA_Form_8100-1.pdf",
    faaUrl: "https://www.faa.gov/documentLibrary/media/Form/FAA_Form_8100-1.pdf",
  },

  // --- Compliance & Certification ---
  {
    id: "8110-3",
    formNumber: "FAA 8110-3",
    title: "Determination of Compliance with Airworthiness Standards",
    description:
      "DER (Designated Engineering Representative) statement that data complies with FAA airworthiness requirements.",
    category: "Compliance & Certification",
    fileName: "FAA_Form_8110-3.pdf",
    faaUrl: "https://www.faa.gov/forms/index.cfm/go/document.information/documentid/215187",
  },
  {
    id: "8100-9",
    formNumber: "FAA 8100-9",
    title: "Statement of Compliance with Airworthiness Standards",
    description:
      "Certifies that data has been examined and found to comply with applicable airworthiness requirements.",
    category: "Compliance & Certification",
    fileName: "FAA_Form_8100-9.pdf",
    faaUrl: "https://www.faa.gov/documentLibrary/media/Form/FAA_8100-9.pdf",
  },
  {
    id: "8110-12",
    formNumber: "FAA 8110-12",
    title: "Application for Type / Production / Supplemental Type Certificate",
    description:
      "Application for a new Type Certificate (TC), Production Certificate (PC), or Supplemental Type Certificate (STC).",
    category: "Compliance & Certification",
    fileName: "FAA_Form_8110-12.pdf",
    faaUrl: "https://www.faa.gov/documentLibrary/media/Form/FAA_Form_8110-12_20231130.pdf",
  },

  // --- Mechanic & Personnel ---
  {
    id: "8610-2",
    formNumber: "FAA 8610-2",
    title: "Airman Certificate Application — Mechanic & Parachute Rigger",
    description:
      "Every A&P mechanic fills this out. Required to request authorization to test for a mechanic certificate.",
    category: "Mechanic & Personnel",
    fileName: "FAA_Form_8610-2.pdf",
    faaUrl: "https://www.faa.gov/forms/index.cfm/go/document.information/documentid/185870",
  },
  {
    id: "8610-1",
    formNumber: "FAA 8610-1",
    title: "Mechanic's Application for Inspection Authorization",
    description:
      "Required for mechanics seeking authorization to perform annual inspections and return aircraft to service.",
    category: "Mechanic & Personnel",
    fileName: "FAA_Form_8610-1.pdf",
    faaUrl: "https://www.faa.gov/forms/index.cfm/go/document.information/documentID/1035448",
  },
  {
    id: "8610-3",
    formNumber: "FAA 8610-3",
    title: "Airman Certificate Application — Repairman",
    description:
      "Application for a repairman certificate under 14 CFR Part 65.",
    category: "Mechanic & Personnel",
    fileName: "FAA_Form_8610-3.pdf",
    faaUrl: "https://www.faa.gov/forms/index.cfm/go/document.information/documentID/1041632",
  },
  {
    id: "8310-6",
    formNumber: "FAA 8310-6",
    title: "Aviation Maintenance Technician School Certificate & Ratings",
    description:
      "Application to become a Part 147 certificated Aviation Maintenance Technician School.",
    category: "Mechanic & Personnel",
    fileName: "FAA_Form_8310-6.pdf",
    faaUrl: "https://www.faa.gov/forms/index.cfm/go/document.information/documentID/1041277",
  },

  // --- Registration & Ownership ---
  {
    id: "8050-1",
    formNumber: "AC 8050-1",
    title: "Aircraft Registration Application",
    description:
      "Required to register an aircraft with the FAA. Must include the typed or printed name of each signer.",
    category: "Registration & Ownership",
    fileName: "FAA_Form_8050-1.pdf",
    faaUrl: "https://www.faa.gov/forms/index.cfm/go/document.information/documentid/185220",
  },
  {
    id: "8050-2",
    formNumber: "AC 8050-2",
    title: "Aircraft Bill of Sale",
    description:
      "Documents the sale or transfer of ownership of an aircraft.",
    category: "Registration & Ownership",
    fileName: "FAA_Form_8050-2.pdf",
    faaUrl: "https://www.faa.gov/documentlibrary/media/form/ac8050-2.pdf",
  },
];

// Unique categories in display order
const categories = [
  "Airworthiness & Release",
  "Maintenance & Repair",
  "Parts & Conformity",
  "Compliance & Certification",
  "Mechanic & Personnel",
  "Registration & Ownership",
];

// Build the download URL (basePath-aware for Vercel multi-zone)
const basePath = process.env.NEXT_PUBLIC_BASE_PATH || "";

export default function FormsLibraryPage() {
  const [search, setSearch] = useState("");
  const [activeCategory, setActiveCategory] = useState<string | null>(null);

  // Filter by search text and category
  const filtered = formTemplates.filter((f) => {
    const matchesSearch =
      !search ||
      f.formNumber.toLowerCase().includes(search.toLowerCase()) ||
      f.title.toLowerCase().includes(search.toLowerCase()) ||
      f.description.toLowerCase().includes(search.toLowerCase());
    const matchesCategory = !activeCategory || f.category === activeCategory;
    return matchesSearch && matchesCategory;
  });

  // Group filtered results by category
  const grouped = categories
    .map((cat) => ({
      category: cat,
      forms: filtered.filter((f) => f.category === cat),
    }))
    .filter((g) => g.forms.length > 0);

  return (
    <div>
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-slate-900">Forms Library</h1>
        <p className="text-sm text-slate-500 mt-1">
          {formTemplates.length} official FAA forms and documents — download
          blank templates or view on faa.gov
        </p>
      </div>

      {/* Search + Category Filter */}
      <div className="flex flex-col sm:flex-row gap-3 mb-6">
        <div className="relative flex-1 max-w-lg">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
          <Input
            placeholder='Search forms — e.g. "8130", "conformity", "mechanic"'
            className="pl-9"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <div className="flex flex-wrap gap-1.5">
          <button
            onClick={() => setActiveCategory(null)}
            className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
              !activeCategory
                ? "bg-slate-900 text-white"
                : "bg-slate-100 text-slate-600 hover:bg-slate-200"
            }`}
          >
            All
          </button>
          {categories.map((cat) => (
            <button
              key={cat}
              onClick={() =>
                setActiveCategory(activeCategory === cat ? null : cat)
              }
              className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
                activeCategory === cat
                  ? "bg-slate-900 text-white"
                  : "bg-slate-100 text-slate-600 hover:bg-slate-200"
              }`}
            >
              {cat}
            </button>
          ))}
        </div>
      </div>

      {/* Results */}
      {filtered.length === 0 ? (
        <p className="text-center py-12 text-slate-500">
          No forms match your search.
        </p>
      ) : (
        <div className="space-y-8">
          {grouped.map((group) => (
            <div key={group.category}>
              <h2 className="text-sm font-semibold text-slate-400 uppercase tracking-wider mb-3">
                {group.category}
              </h2>
              <div className="grid gap-3">
                {group.forms.map((form) => (
                  <Card
                    key={form.id}
                    className="hover:shadow-md transition-shadow"
                  >
                    <CardContent className="py-4 px-5">
                      <div className="flex items-start gap-4">
                        {/* PDF icon */}
                        <div className="shrink-0 mt-0.5 w-10 h-10 rounded-lg bg-red-50 flex items-center justify-center">
                          <FileText className="h-5 w-5 text-red-500" />
                        </div>

                        {/* Info */}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-mono text-sm font-semibold text-slate-900">
                              {form.formNumber}
                            </span>
                            {form.builtIn && (
                              <Badge
                                variant="secondary"
                                className="text-[10px] bg-blue-50 text-blue-700"
                              >
                                Auto-Generated
                              </Badge>
                            )}
                            {form.international && (
                              <Badge
                                variant="secondary"
                                className="text-[10px] bg-purple-50 text-purple-700"
                              >
                                International
                              </Badge>
                            )}
                            {form.note && (
                              <Badge
                                variant="outline"
                                className="text-[10px] text-slate-500"
                              >
                                {form.note}
                              </Badge>
                            )}
                          </div>
                          <p className="text-sm font-medium text-slate-700 mt-0.5">
                            {form.title}
                          </p>
                          <p className="text-xs text-slate-500 mt-1 leading-relaxed">
                            {form.description}
                          </p>
                        </div>

                        {/* Actions */}
                        <div className="shrink-0 flex items-center gap-2">
                          {form.fileName && (
                            <a
                              href={`${basePath}/form-templates/${form.fileName}`}
                              download
                              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium bg-slate-900 text-white hover:bg-slate-800 transition-colors"
                            >
                              <Download className="h-3.5 w-3.5" />
                              PDF
                            </a>
                          )}
                          <a
                            href={form.faaUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium border border-slate-200 text-slate-600 hover:bg-slate-50 transition-colors"
                          >
                            <ExternalLink className="h-3.5 w-3.5" />
                            FAA
                          </a>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
