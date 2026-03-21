"use client";

import { useState } from "react";
import Link from "next/link";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  BookOpen,
  Clock,
  FileUp,
  Hash,
  Layers,
  Loader2,
  Upload,
} from "lucide-react";
import UploadModal from "./upload-modal";

interface TemplateInfo {
  id: string;
  title: string;
  status: string;
  partNumbersCovered: string[];
  revisionDate: string | null;
  totalPages: number;
  sectionCount: number;
  createdAt: string;
  createdBy: string;
  currentSectionIndex: number;
}

// Map template status to a badge color and label
function statusBadge(status: string, currentSectionIndex: number, sectionCount: number) {
  switch (status) {
    case "pending_extraction":
    case "extracting_index":
      return (
        <Badge className="bg-blue-100 text-blue-700 border-blue-200">
          <Loader2 className="h-3 w-3 mr-1 animate-spin" />
          Indexing...
        </Badge>
      );
    case "extracting_details":
      return (
        <Badge className="bg-blue-100 text-blue-700 border-blue-200">
          <Loader2 className="h-3 w-3 mr-1 animate-spin" />
          Extracting {currentSectionIndex}/{sectionCount}
        </Badge>
      );
    case "review_ready":
      return (
        <Badge className="bg-amber-100 text-amber-700 border-amber-200">
          Ready for Review
        </Badge>
      );
    case "active":
      return (
        <Badge className="bg-emerald-100 text-emerald-700 border-emerald-200">
          Active
        </Badge>
      );
    case "extraction_failed":
      return (
        <Badge className="bg-red-100 text-red-700 border-red-200">
          Failed
        </Badge>
      );
    case "archived":
      return (
        <Badge className="bg-slate-100 text-slate-500 border-slate-200">
          Archived
        </Badge>
      );
    default:
      return <Badge variant="secondary">{status}</Badge>;
  }
}

export default function LibraryClient({
  templates,
  isAdmin,
}: {
  templates: TemplateInfo[];
  isAdmin: boolean;
}) {
  const [showUpload, setShowUpload] = useState(false);

  // Split into active/processing and archived
  const activeTemplates = templates.filter((t) => t.status !== "archived");
  const archivedTemplates = templates.filter((t) => t.status === "archived");

  return (
    <div>
      {/* Page header */}
      <div className="mb-8 flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Library</h1>
          <p className="text-sm text-slate-500 mt-1">
            Upload Component Maintenance Manuals to create structured inspection
            templates. AI extracts torque specs, tool requirements, and checks
            from your CMM diagrams.
          </p>
        </div>
        {isAdmin && (
          <Button onClick={() => setShowUpload(true)} className="shrink-0 ml-4">
            <Upload className="h-4 w-4 mr-2" />
            Upload CMM
          </Button>
        )}
      </div>

      {/* Template cards */}
      {activeTemplates.length === 0 ? (
        <Card className="border-dashed border-2 border-slate-200">
          <CardContent className="py-12 text-center">
            <BookOpen className="h-12 w-12 text-slate-300 mx-auto mb-4" />
            <h3 className="text-lg font-medium text-slate-700 mb-1">
              No CMMs uploaded yet
            </h3>
            <p className="text-sm text-slate-500 mb-4">
              Upload your first Component Maintenance Manual to get started.
            </p>
            {isAdmin && (
              <Button
                variant="outline"
                onClick={() => setShowUpload(true)}
              >
                <FileUp className="h-4 w-4 mr-2" />
                Upload your first CMM
              </Button>
            )}
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4">
          {activeTemplates.map((template) => {
            // Templates that are review_ready or active are clickable
            const isClickable =
              template.status === "review_ready" ||
              template.status === "active";

            const cardContent = (
              <Card
                className={
                  isClickable
                    ? "border-slate-200 hover:border-slate-300 transition-colors cursor-pointer"
                    : "border-slate-200"
                }
              >
                <CardContent className="py-5 px-5">
                  <div className="flex items-start gap-4">
                    {/* Icon */}
                    <div className="shrink-0 mt-0.5 w-10 h-10 rounded-lg bg-indigo-50 flex items-center justify-center">
                      <BookOpen className="h-5 w-5 text-indigo-600" />
                    </div>

                    {/* Info */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-sm font-semibold text-slate-900">
                          {template.title}
                        </span>
                        {statusBadge(
                          template.status,
                          template.currentSectionIndex,
                          template.sectionCount
                        )}
                      </div>

                      {/* Part numbers */}
                      {template.partNumbersCovered.length > 0 && (
                        <div className="flex items-center gap-1 mt-1.5 flex-wrap">
                          <Hash className="h-3 w-3 text-slate-400 shrink-0" />
                          {template.partNumbersCovered.map((pn) => (
                            <span
                              key={pn}
                              className="text-xs font-mono bg-slate-100 text-slate-600 px-1.5 py-0.5 rounded"
                            >
                              {pn}
                            </span>
                          ))}
                        </div>
                      )}

                      {/* Meta row */}
                      <div className="flex items-center gap-4 mt-2 text-xs text-slate-400">
                        <span className="flex items-center gap-1">
                          <Layers className="h-3 w-3" />
                          {template.sectionCount} sections
                        </span>
                        <span>{template.totalPages} pages</span>
                        {template.revisionDate && (
                          <span className="flex items-center gap-1">
                            <Clock className="h-3 w-3" />
                            Rev.{" "}
                            {new Date(template.revisionDate).toLocaleDateString()}
                          </span>
                        )}
                        <span>by {template.createdBy}</span>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            );

            if (isClickable) {
              return (
                <Link
                  key={template.id}
                  href={`/library/${template.id}/review`}
                >
                  {cardContent}
                </Link>
              );
            }

            return <div key={template.id}>{cardContent}</div>;
          })}
        </div>
      )}

      {/* Archived section */}
      {archivedTemplates.length > 0 && (
        <details className="mt-8">
          <summary className="text-sm font-semibold text-slate-400 uppercase tracking-wider cursor-pointer hover:text-slate-600">
            Previous Revisions ({archivedTemplates.length})
          </summary>
          <div className="grid gap-3 mt-4">
            {archivedTemplates.map((template) => (
              <Card key={template.id} className="border-slate-100 opacity-60">
                <CardContent className="py-3 px-5">
                  <div className="flex items-center gap-3">
                    <BookOpen className="h-4 w-4 text-slate-400" />
                    <span className="text-sm text-slate-500">
                      {template.title}
                    </span>
                    {statusBadge(template.status, 0, 0)}
                    <span className="text-xs text-slate-400 ml-auto">
                      {new Date(template.createdAt).toLocaleDateString()}
                    </span>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </details>
      )}

      {/* Upload modal */}
      {showUpload && <UploadModal onClose={() => setShowUpload(false)} />}
    </div>
  );
}
