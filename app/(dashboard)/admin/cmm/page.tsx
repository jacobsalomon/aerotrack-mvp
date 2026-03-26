// Admin page for managing Component Maintenance Manuals (CMMs).
// Upload CMM PDFs, view existing manuals, and manage reference data.
// These manuals power the glasses HUD cross-referencing and AI document generation.

"use client";

import { useState, useEffect, useCallback } from "react";
import { BookOpen, Upload, FileText, ExternalLink } from "lucide-react";

interface CmmManual {
  id: string;
  partNumber: string;
  title: string;
  fileUrl: string;
  fileSizeBytes: number;
  pageCount: number | null;
  uploadedAt: string;
}

export default function AdminCmmPage() {
  const [manuals, setManuals] = useState<CmmManual[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // Form fields for new upload
  const [partNumber, setPartNumber] = useState("");
  const [title, setTitle] = useState("");
  const [pageCount, setPageCount] = useState("");
  const [file, setFile] = useState<File | null>(null);

  const fetchManuals = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/upload-cmm");
      const data = await res.json();
      if (data.success) setManuals(data.data);
    } catch {
      setError("Failed to load manuals");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchManuals();
  }, [fetchManuals]);

  const handleUpload = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!file || !partNumber || !title) return;

    setUploading(true);
    setError(null);
    setSuccess(null);

    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("partNumber", partNumber);
      formData.append("title", title);
      if (pageCount) formData.append("pageCount", pageCount);

      const res = await fetch("/api/admin/upload-cmm", {
        method: "POST",
        body: formData,
      });

      const data = await res.json();
      if (data.success) {
        setSuccess(`Uploaded "${title}" for P/N ${partNumber}`);
        setPartNumber("");
        setTitle("");
        setPageCount("");
        setFile(null);
        fetchManuals();
      } else {
        setError(data.error || "Upload failed");
      }
    } catch {
      setError("Upload failed");
    } finally {
      setUploading(false);
    }
  };

  function formatBytes(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }

  return (
    <div className="mx-auto max-w-4xl space-y-8">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-3">
          <BookOpen className="h-6 w-6 text-blue-600" />
          CMM Library
        </h1>
        <p className="mt-1 text-sm text-gray-500">
          Upload Component Maintenance Manuals. These power the glasses HUD cross-referencing
          and improve AI document generation accuracy.
        </p>
      </div>

      {/* Upload form */}
      <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
        <h2 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
          <Upload className="h-5 w-5 text-blue-600" />
          Upload New CMM
        </h2>

        <form onSubmit={handleUpload} className="mt-4 space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700">
                Part Number
              </label>
              <input
                type="text"
                value={partNumber}
                onChange={(e) => setPartNumber(e.target.value)}
                placeholder="881700-1089"
                className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700">
                Manual Title
              </label>
              <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="HPC-7 Hydraulic Pump CMM Rev. 12"
                className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                required
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700">
                Page Count (optional)
              </label>
              <input
                type="number"
                value={pageCount}
                onChange={(e) => setPageCount(e.target.value)}
                placeholder="186"
                className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700">
                PDF File
              </label>
              <input
                type="file"
                accept="application/pdf"
                onChange={(e) => setFile(e.target.files?.[0] || null)}
                className="mt-1 block w-full text-sm text-gray-500 file:mr-4 file:rounded-lg file:border-0 file:bg-blue-50 file:px-4 file:py-2 file:text-sm file:font-medium file:text-blue-700 hover:file:bg-blue-100"
                required
              />
            </div>
          </div>

          {error && (
            <div className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">
              {error}
            </div>
          )}

          {success && (
            <div className="rounded-lg bg-green-50 px-4 py-3 text-sm text-green-700">
              {success}
            </div>
          )}

          <button
            type="submit"
            disabled={uploading || !file || !partNumber || !title}
            className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {uploading ? "Uploading..." : "Upload CMM"}
          </button>
        </form>
      </div>

      {/* Existing manuals */}
      <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
        <h2 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
          <FileText className="h-5 w-5 text-blue-600" />
          Uploaded Manuals ({manuals.length})
        </h2>

        {loading ? (
          <p className="mt-4 text-sm text-gray-500">Loading...</p>
        ) : manuals.length === 0 ? (
          <p className="mt-4 text-sm text-gray-500">
            No manuals uploaded yet. Upload a CMM PDF above to get started.
          </p>
        ) : (
          <div className="mt-4 space-y-3">
            {manuals.map((m) => (
              <div
                key={m.id}
                className="flex items-center justify-between rounded-lg border border-gray-100 bg-gray-50 px-4 py-3"
              >
                <div className="min-w-0">
                  <p className="text-sm font-medium text-gray-900 truncate">
                    {m.title}
                  </p>
                  <p className="text-xs text-gray-500">
                    P/N: {m.partNumber} &middot; {formatBytes(m.fileSizeBytes)}
                    {m.pageCount && ` \u00b7 ${m.pageCount} pages`}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  {m.fileUrl.startsWith("http") && (
                    <a
                      href={m.fileUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="rounded-lg p-2 text-gray-400 hover:bg-gray-100 hover:text-blue-600"
                    >
                      <ExternalLink className="h-4 w-4" />
                    </a>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
