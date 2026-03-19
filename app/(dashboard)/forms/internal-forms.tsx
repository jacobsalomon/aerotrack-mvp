// Internal Forms section — lets org members upload PDFs and view/download/delete them.
// Only shows documents from the user's own organization.

"use client";

import { useState, useEffect, useRef } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Upload, FileText, Trash2, Download, Loader2 } from "lucide-react";
import { apiUrl } from "@/lib/api-url";

type OrgDocument = {
  id: string;
  title: string;
  fileUrl: string;
  fileSizeBytes: number;
  createdAt: string;
};

export default function InternalForms() {
  const [docs, setDocs] = useState<OrgDocument[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Load documents on mount
  useEffect(() => {
    fetchDocs();
  }, []);

  async function fetchDocs() {
    try {
      const res = await fetch(apiUrl("/api/org/documents"));
      const data = await res.json();
      if (res.ok) {
        setDocs(data.documents);
      }
    } catch {
      // Silent fail — list just stays empty
    } finally {
      setLoading(false);
    }
  }

  // Handle file selection and upload
  async function handleUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    // Reset the input so the same file can be re-selected
    e.target.value = "";

    if (file.type !== "application/pdf") {
      setError("Only PDF files are allowed");
      return;
    }

    if (file.size > 20 * 1024 * 1024) {
      setError("File must be under 20MB");
      return;
    }

    setError(null);
    setUploading(true);

    try {
      const formData = new FormData();
      formData.append("file", file);

      const res = await fetch(apiUrl("/api/org/documents"), {
        method: "POST",
        body: formData,
      });
      const data = await res.json();

      if (res.ok) {
        // Add the new doc to the top of the list
        setDocs((prev) => [data.document, ...prev]);
      } else {
        setError(data.error || "Upload failed");
      }
    } catch {
      setError("Upload failed");
    } finally {
      setUploading(false);
    }
  }

  // Delete a document
  async function handleDelete(id: string) {
    try {
      const res = await fetch(apiUrl(`/api/org/documents/${id}`), {
        method: "DELETE",
      });
      if (res.ok) {
        setDocs((prev) => prev.filter((d) => d.id !== id));
      }
    } catch {
      // Silent fail
    }
  }

  // Format file size for display (e.g., "1.2 MB")
  function formatSize(bytes: number) {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-sm font-semibold text-slate-400 uppercase tracking-wider">
          Internal Forms
        </h2>

        {/* Upload button */}
        <button
          onClick={() => fileInputRef.current?.click()}
          disabled={uploading}
          className="inline-flex items-center gap-1.5 rounded-lg bg-slate-900 px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-slate-800 disabled:opacity-50"
        >
          {uploading ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <Upload className="h-3.5 w-3.5" />
          )}
          {uploading ? "Uploading..." : "Upload PDF"}
        </button>

        {/* Hidden file input */}
        <input
          ref={fileInputRef}
          type="file"
          accept="application/pdf"
          onChange={handleUpload}
          className="hidden"
        />
      </div>

      {error && (
        <p className="text-sm text-red-500 mb-3">{error}</p>
      )}

      {/* Document list */}
      {loading ? (
        <Card className="border-slate-200">
          <CardContent className="py-8 text-center">
            <Loader2 className="h-5 w-5 animate-spin text-slate-400 mx-auto" />
          </CardContent>
        </Card>
      ) : docs.length === 0 ? (
        <Card className="border-dashed border-slate-300 bg-slate-50/50">
          <CardContent className="py-10 px-6 text-center">
            <div className="mx-auto w-12 h-12 rounded-full bg-slate-100 flex items-center justify-center mb-4">
              <Upload className="h-5 w-5 text-slate-400" />
            </div>
            <p className="text-sm text-slate-600 max-w-md mx-auto">
              Upload your shop&apos;s internal forms — inspection checklists,
              station-to-station handoff forms, and more.
            </p>
            <Badge
              variant="outline"
              className="mt-4 text-xs text-slate-400 border-slate-300"
            >
              PDF only, up to 20MB
            </Badge>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-2">
          {docs.map((doc) => (
            <Card key={doc.id} className="border-slate-200">
              <CardContent className="py-3 px-4">
                <div className="flex items-center gap-3">
                  {/* PDF icon */}
                  <div className="shrink-0 w-9 h-9 rounded-lg bg-red-50 flex items-center justify-center">
                    <FileText className="h-4 w-4 text-red-500" />
                  </div>

                  {/* Title + metadata */}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-slate-900 truncate">
                      {doc.title}
                    </p>
                    <p className="text-xs text-slate-400">
                      {formatSize(doc.fileSizeBytes)} &middot;{" "}
                      {new Date(doc.createdAt).toLocaleDateString()}
                    </p>
                  </div>

                  {/* Actions */}
                  <div className="flex items-center gap-1">
                    <a
                      href={doc.fileUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="p-1.5 rounded-md text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors"
                      title="Download"
                    >
                      <Download className="h-4 w-4" />
                    </a>
                    <button
                      onClick={() => handleDelete(doc.id)}
                      className="p-1.5 rounded-md text-slate-400 hover:text-red-500 hover:bg-red-50 transition-colors"
                      title="Delete"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
