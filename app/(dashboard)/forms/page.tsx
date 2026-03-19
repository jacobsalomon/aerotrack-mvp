import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { FileText, Upload, Sparkles } from "lucide-react";

// The 3 FAA forms AeroVision auto-generates from capture session evidence
const faaForms = [
  {
    id: "8130-3",
    formNumber: "FAA 8130-3",
    title: "Authorized Release Certificate",
    description:
      "Certifies that parts conform to safety standards. Generated automatically after inspection with part details, conformity data, and sign-off fields pre-filled.",
  },
  {
    id: "337",
    formNumber: "FAA 337",
    title: "Major Repair and Alteration",
    description:
      "Documents major repairs or alterations to airframes, powerplants, and appliances. Auto-populated with work performed, materials used, and inspection findings.",
  },
  {
    id: "8010-4",
    formNumber: "FAA 8010-4",
    title: "Malfunction or Defect Report",
    description:
      "Reports malfunctions or defects found during maintenance. Generated from captured evidence with defect details, part information, and conditions pre-filled.",
  },
];

export default function FormsPage() {
  return (
    <div>
      {/* Page header */}
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-slate-900">Forms</h1>
        <p className="text-sm text-slate-500 mt-1">
          AeroVision generates FAA forms automatically from your capture session
          evidence — no manual data entry required.
        </p>
      </div>

      {/* Section 1: FAA Forms */}
      <div className="mb-10">
        <h2 className="text-sm font-semibold text-slate-400 uppercase tracking-wider mb-4">
          FAA Forms
        </h2>
        <div className="grid gap-4">
          {faaForms.map((form) => (
            <Card key={form.id} className="border-slate-200">
              <CardContent className="py-5 px-5">
                <div className="flex items-start gap-4">
                  {/* Icon */}
                  <div className="shrink-0 mt-0.5 w-10 h-10 rounded-lg bg-blue-50 flex items-center justify-center">
                    <FileText className="h-5 w-5 text-blue-600" />
                  </div>

                  {/* Form info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-mono text-sm font-semibold text-slate-900">
                        {form.formNumber}
                      </span>
                      <Badge
                        variant="secondary"
                        className="text-[10px] bg-blue-50 text-blue-700"
                      >
                        <Sparkles className="h-3 w-3 mr-1" />
                        Auto-Generated
                      </Badge>
                    </div>
                    <p className="text-sm font-medium text-slate-700 mt-0.5">
                      {form.title}
                    </p>
                    <p className="text-xs text-slate-500 mt-1 leading-relaxed">
                      {form.description}
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>

      {/* Section 2: Internal Forms (coming soon) */}
      <div>
        <h2 className="text-sm font-semibold text-slate-400 uppercase tracking-wider mb-4">
          Internal Forms
        </h2>
        <Card className="border-dashed border-slate-300 bg-slate-50/50">
          <CardContent className="py-10 px-6 text-center">
            <div className="mx-auto w-12 h-12 rounded-full bg-slate-100 flex items-center justify-center mb-4">
              <Upload className="h-5 w-5 text-slate-400" />
            </div>
            <p className="text-sm text-slate-600 max-w-md mx-auto">
              Upload your shop&apos;s internal forms — inspection checklists,
              station-to-station handoff forms, and more. AeroVision will fill
              them automatically from captured evidence.
            </p>
            <Badge
              variant="outline"
              className="mt-4 text-xs text-slate-400 border-slate-300"
            >
              Coming Soon
            </Badge>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
