"use client";

// Photo upload button for inspection items.
// Handles file picker, client-side image compression, and upload to the photos API.
// Works on both desktop (file picker) and mobile (camera capture).

import { useRef, useState } from "react";
import { Camera, Loader2 } from "lucide-react";
import { apiUrl } from "@/lib/api-url";

interface PhotoEvidence {
  id: string;
  fileUrl: string;
  inspectionItemId: string | null;
  instanceIndex: number | null;
  capturedAt: string;
}

interface Props {
  sessionId: string;
  inspectionItemId?: string;
  instanceIndex?: number;
  onPhotoUploaded: (photo: PhotoEvidence) => void;
  disabled?: boolean;
}

// Compress an image file: resize to max 2000px and target ~2MB
async function compressImage(file: File): Promise<File> {
  return new Promise((resolve) => {
    const img = new Image();
    const url = URL.createObjectURL(file);

    img.onload = () => {
      URL.revokeObjectURL(url);

      const MAX_DIM = 2000;
      let { width, height } = img;

      // Scale down if either dimension exceeds max
      if (width > MAX_DIM || height > MAX_DIM) {
        const scale = MAX_DIM / Math.max(width, height);
        width = Math.round(width * scale);
        height = Math.round(height * scale);
      }

      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext("2d")!;
      ctx.drawImage(img, 0, 0, width, height);

      canvas.toBlob(
        (blob) => {
          if (blob) {
            resolve(new File([blob], file.name.replace(/\.[^.]+$/, ".jpg"), { type: "image/jpeg" }));
          } else {
            resolve(file); // fallback to original
          }
        },
        "image/jpeg",
        0.85
      );
    };

    img.onerror = () => {
      URL.revokeObjectURL(url);
      resolve(file); // fallback to original on error
    };

    img.src = url;
  });
}

export default function PhotoUpload({ sessionId, inspectionItemId, instanceIndex, onPhotoUploaded, disabled }: Props) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploading(true);
    try {
      // Compress image client-side
      const compressed = await compressImage(file);

      // Build form data
      const formData = new FormData();
      formData.append("file", compressed);
      if (inspectionItemId) formData.append("inspectionItemId", inspectionItemId);
      if (instanceIndex != null) formData.append("instanceIndex", String(instanceIndex));

      // Upload to API
      const res = await fetch(apiUrl(`/api/inspect/sessions/${sessionId}/photos`), {
        method: "POST",
        body: formData,
      });

      const data = await res.json();
      if (res.ok && data.success) {
        onPhotoUploaded(data.data);
      } else {
        console.error("[PhotoUpload] upload failed:", data.error);
      }
    } catch (err) {
      console.error("[PhotoUpload] error:", err);
    } finally {
      setUploading(false);
      // Reset input so same file can be re-selected
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  return (
    <>
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        onChange={handleFileChange}
        className="hidden"
      />
      <button
        onClick={() => fileInputRef.current?.click()}
        disabled={disabled || uploading}
        className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs
          bg-white/10 hover:bg-white/15 text-white/60 hover:text-white/80
          disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
        title="Add photo"
      >
        {uploading ? (
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
        ) : (
          <Camera className="h-3.5 w-3.5" />
        )}
        Photo
      </button>
    </>
  );
}
