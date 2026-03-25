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
  const [file, setFile] = useState<File | null>(null);
  const [title, setTitle] = useState(prefill?.title || "");
  const [revisionDate, setRevisionDate] = useState("");
  const [partNumbers, setPartNumbers] = useState(prefill?.partNumbers || "");
  const [inspectionPages, setInspectionPages] = useState("");
  const [uploading, setUploading] = useState(false);
  const [uploadStatus, setUploadStatus] = useState("");

  async function handleUpload() {
    if (!file) {
      toast.error("Please select a PDF file");
      return;
    }

    setUploading(true);
    const basePath = process.env.NEXT_PUBLIC_BASE_PATH || "";

    try {
      // Step 1: Upload PDF directly to Vercel Blob from the browser.
      // This bypasses the 4.5MB serverless body limit — CMMs can be 50MB+.
      setUploadStatus("Uploading PDF...");
      const blob = await upload(
        `cmm-library/${Date.now()}-${file.name}`,
        file,
        {
          access: "public",
          handleUploadUrl: `${basePath}/api/library/upload`,
          contentType: "application/pdf",
        }
      );

      // Step 2: Tell the API about the uploaded file so it can create
      // the template record and kick off AI extraction.
      setUploadStatus("Starting extraction...");
      const res = await fetch(`${basePath}/api/library`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          blobUrl: blob.url,
          fileName: file.name,
          title: title || file.name.replace(/\.pdf$/i, ""),
          revisionDate: revisionDate || null,
          partNumbers: partNumbers || null,
          inspectionPages: inspectionPages || null,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        toast.error(data.error || "Upload failed");
        setUploading(false);
        setUploadStatus("");
        return;
      }

      toast.success("CMM uploaded — extraction starting");

      // Tell the parent about the new template so it shows up immediately
      // with a "processing" badge — no need to wait for a full page refresh.
      if (onUploaded && data.template) {
        onUploaded(data.template);
      }

      onClose();
      router.refresh();
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      console.error("[Upload] Failed:", message);
      toast.error(`Upload failed: ${message}`);
      setUploading(false);
      setUploadStatus("");
    }
  }

  function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const selected = e.target.files?.[0];
    if (!selected) return;

    if (selected.type !== "application/pdf") {
      toast.error("Only PDF files are accepted");
      return;
    }

    if (selected.size > 500 * 1024 * 1024) {
      toast.error("File must be under 500MB");
      return;
    }

    setFile(selected);
    // Auto-fill title from filename if empty
    if (!title) {
      setTitle(selected.name.replace(/\.pdf$/i, ""));
    }
  }

  return (
    <Dialog open onOpenChange={() => onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{prefill ? "Update CMM" : "Upload CMM"}</DialogTitle>
          <DialogDescription>
            {prefill
              ? "Upload a fresh revision. The previous version will be archived and any in-progress jobs will keep their original template."
              : "Upload a Component Maintenance Manual PDF. AeroVision will extract torque specs, tool requirements, and inspection checks automatically."}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {/* File picker */}
          <div>
            <Label htmlFor="cmm-file">PDF File</Label>
            <div
              className="mt-1.5 border-2 border-dashed border-slate-200 rounded-lg p-6 text-center cursor-pointer hover:border-slate-300 transition-colors"
              onClick={() => fileInputRef.current?.click()}
            >
              <input
                ref={fileInputRef}
                id="cmm-file"
                type="file"
                accept=".pdf,application/pdf"
                className="hidden"
                onChange={handleFileSelect}
              />
              {file ? (
                <div>
                  <FileUp className="h-8 w-8 text-indigo-500 mx-auto mb-2" />
                  <p className="text-sm font-medium text-slate-700">
                    {file.name}
                  </p>
                  <p className="text-xs text-slate-400 mt-1">
                    {(file.size / (1024 * 1024)).toFixed(1)} MB
                  </p>
                </div>
              ) : (
                <div>
                  <FileUp className="h-8 w-8 text-slate-300 mx-auto mb-2" />
                  <p className="text-sm text-slate-500">
                    Click to select a PDF (max 500MB)
                  </p>
                </div>
              )}
            </div>
          </div>

          {/* Title */}
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

          {/* Revision Date */}
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

          {/* Part Numbers */}
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

          {/* Inspection Pages */}
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
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={uploading}>
            Cancel
          </Button>
          <Button onClick={handleUpload} disabled={uploading || !file}>
            {uploading ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                {uploadStatus || "Uploading..."}
              </>
            ) : (
              "Upload & Extract"
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
