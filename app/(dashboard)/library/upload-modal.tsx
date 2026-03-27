"use client";

import { useState, useRef } from "react";
import { useRouter } from "next/navigation";
import { upload } from "@vercel/blob/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { FileUp, Loader2 } from "lucide-react";
import { toast } from "sonner";

// Pre-fill values when updating an existing template
interface Prefill {
  title?: string;
  partNumbers?: string;
  oem?: string;
}

export default function UploadModal({
  onClose,
  onUploaded,
  prefill,
}: {
  onClose: () => void;
  onUploaded?: (template: { id: string; title: string; status: string }) => void;
  prefill?: Prefill;
}) {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [files, setFiles] = useState<File[]>([]);
  const [title, setTitle] = useState(prefill?.title || "");
  const [revisionDate, setRevisionDate] = useState("");
  const [partNumbers, setPartNumbers] = useState(prefill?.partNumbers || "");
  const [oem, setOem] = useState(prefill?.oem || "");
  const [inspectionPages, setInspectionPages] = useState("");
  const [uploading, setUploading] = useState(false);
  const [uploadStatus, setUploadStatus] = useState("");

  async function handleUpload() {
    if (files.length === 0) {
      toast.error("Please select a PDF file");
      return;
    }

    setUploading(true);
    const basePath = process.env.NEXT_PUBLIC_BASE_PATH || "";
    let succeeded = 0;

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      setUploadStatus(
        files.length > 1
          ? `Uploading ${i + 1} of ${files.length}...`
          : "Uploading PDF..."
      );

      try {
        // Upload PDF to Vercel Blob
        const blob = await upload(
          `cmm-library/${Date.now()}-${file.name}`,
          file,
          {
            access: "public",
            handleUploadUrl: `${basePath}/api/library/upload`,
            contentType: "application/pdf",
          }
        );

        // Create the template record — for single file, use the form fields;
        // for batch, let AI detect title/partNumbers/revisionDate per file.
        const isSingle = files.length === 1;
        const res = await fetch(`${basePath}/api/library`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            blobUrl: blob.url,
            fileName: file.name,
            title: isSingle ? title || file.name.replace(/\.pdf$/i, "") : file.name.replace(/\.pdf$/i, ""),
            revisionDate: isSingle ? revisionDate || null : null,
            partNumbers: isSingle ? partNumbers || null : null,
            oem: oem || null,
            inspectionPages: isSingle ? inspectionPages || null : null,
          }),
        });

        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "Upload failed");

        onUploaded?.(data.template);
        succeeded++;
      } catch (err) {
        const message = err instanceof Error ? err.message : "Unknown error";
        console.error(`[Upload] Failed for ${file.name}:`, message);
        toast.error(`${file.name}: ${message}`);
      }
    }

    if (succeeded > 0) {
      toast.success(
        succeeded === 1
          ? "CMM uploaded — extraction starting"
          : `${succeeded} CMMs uploaded — all extracting`
      );
      onClose();
      router.refresh();
    } else {
      setUploading(false);
      setUploadStatus("");
    }
  }

  function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const selected = e.target.files;
    if (!selected || selected.length === 0) return;

    const valid: File[] = [];
    for (const f of Array.from(selected)) {
      if (f.type !== "application/pdf") {
        toast.error(`${f.name} is not a PDF — skipped`);
        continue;
      }
      if (f.size > 500 * 1024 * 1024) {
        toast.error(`${f.name} is over 500MB — skipped`);
        continue;
      }
      valid.push(f);
    }

    setFiles(valid);
    // Auto-fill title from filename when only one file selected
    if (valid.length === 1 && !title) {
      setTitle(valid[0].name.replace(/\.pdf$/i, ""));
    }
  }

  const isSingle = files.length <= 1;

  return (
    <Dialog open onOpenChange={() => onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{prefill ? "Update CMM" : "Upload CMMs"}</DialogTitle>
          <DialogDescription>
            {prefill
              ? "Upload a fresh revision. The previous version will be archived and any in-progress jobs will keep their original template."
              : "Select one or more CMM PDFs. AI will extract document names, part numbers, OEMs, and inspection items automatically."}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {/* File picker */}
          <div>
            <Label htmlFor="cmm-file">{isSingle ? "PDF File" : "PDF Files"}</Label>
            <div
              className="mt-1.5 border-2 border-dashed border-slate-200 rounded-lg p-6 text-center cursor-pointer hover:border-slate-300 transition-colors"
              onClick={() => fileInputRef.current?.click()}
            >
              <input
                ref={fileInputRef}
                id="cmm-file"
                type="file"
                accept=".pdf,application/pdf"
                multiple={!prefill}
                className="hidden"
                onChange={handleFileSelect}
              />
              {files.length > 0 ? (
                <div>
                  <FileUp className="h-8 w-8 text-indigo-500 mx-auto mb-2" />
                  {files.length === 1 ? (
                    <>
                      <p className="text-sm font-medium text-slate-700">
                        {files[0].name}
                      </p>
                      <p className="text-xs text-slate-400 mt-1">
                        {(files[0].size / (1024 * 1024)).toFixed(1)} MB
                      </p>
                    </>
                  ) : (
                    <>
                      <p className="text-sm font-medium text-slate-700">
                        {files.length} files selected
                      </p>
                      <p className="text-xs text-slate-400 mt-1">
                        {files.map((f) => f.name).join(", ")}
                      </p>
                    </>
                  )}
                </div>
              ) : (
                <div>
                  <FileUp className="h-8 w-8 text-slate-300 mx-auto mb-2" />
                  <p className="text-sm text-slate-500">
                    {prefill
                      ? "Click to select a PDF (max 500MB)"
                      : "Click to select PDFs — you can pick multiple (max 500MB each)"}
                  </p>
                </div>
              )}
            </div>
          </div>

          {/* Metadata fields — only shown for single-file uploads */}
          {isSingle && (
            <>
              <div>
                <Label htmlFor="cmm-title">Title</Label>
                <Input
                  id="cmm-title"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="e.g., IDG Inspection — Collins Aerospace"
                  className="mt-1.5"
                />
              </div>

              <div>
                <Label htmlFor="cmm-revision">
                  Revision Date{" "}
                  <span className="text-slate-400 font-normal">(optional)</span>
                </Label>
                <Input
                  id="cmm-revision"
                  type="date"
                  value={revisionDate}
                  onChange={(e) => setRevisionDate(e.target.value)}
                  className="mt-1.5"
                />
              </div>

              <div>
                <Label htmlFor="cmm-parts">
                  Part Numbers Covered{" "}
                  <span className="text-slate-400 font-normal">(optional)</span>
                </Label>
                <Input
                  id="cmm-parts"
                  value={partNumbers}
                  onChange={(e) => setPartNumbers(e.target.value)}
                  placeholder="e.g., 739515, 745329, 755359"
                  className="mt-1.5"
                />
                <p className="text-xs text-slate-400 mt-1">
                  Comma-separated. Used to auto-link templates to components.
                </p>
              </div>
            </>
          )}

          {/* OEM — always shown */}
          <div>
            <Label htmlFor="cmm-oem">
              OEM / Manufacturer{" "}
              <span className="text-slate-400 font-normal">(optional)</span>
            </Label>
            <Input
              id="cmm-oem"
              value={oem}
              onChange={(e) => setOem(e.target.value)}
              placeholder="e.g., Collins Aerospace, Honeywell"
              className="mt-1.5"
            />
            <p className="text-xs text-slate-400 mt-1">
              Leave blank and AI will try to detect it from the document.
            </p>
          </div>

          {/* Inspection pages — only for single file */}
          {isSingle && (
            <div>
              <Label htmlFor="cmm-pages">
                Inspection Pages{" "}
                <span className="text-slate-400 font-normal">(optional)</span>
              </Label>
              <Input
                id="cmm-pages"
                value={inspectionPages}
                onChange={(e) => setInspectionPages(e.target.value)}
                placeholder="e.g., 1-20 or 5-12, 15-20"
                className="mt-1.5"
              />
              <p className="text-xs text-slate-400 mt-1">
                Leave blank to process all pages. Specify page ranges to focus on
                inspection sheets only.
              </p>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={uploading}>
            Cancel
          </Button>
          <Button onClick={handleUpload} disabled={uploading || files.length === 0}>
            {uploading ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                {uploadStatus || "Uploading..."}
              </>
            ) : files.length > 1 ? (
              `Upload ${files.length} Files`
            ) : (
              "Upload & Extract"
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
