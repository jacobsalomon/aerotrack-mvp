"use client";

// Displays a row of photo thumbnails for an inspection item.
// Click any thumbnail to enlarge it in a lightbox overlay.

import { useState } from "react";
import { X } from "lucide-react";

interface PhotoEvidence {
  id: string;
  fileUrl: string;
  capturedAt: string;
}

interface Props {
  photos: PhotoEvidence[];
}

export default function PhotoThumbnails({ photos }: Props) {
  const [lightboxUrl, setLightboxUrl] = useState<string | null>(null);

  if (photos.length === 0) return null;

  return (
    <>
      <div className="flex gap-2 flex-wrap">
        {photos.map((photo) => (
          <button
            key={photo.id}
            onClick={() => setLightboxUrl(photo.fileUrl)}
            className="relative w-14 h-14 rounded-md overflow-hidden border border-white/10
              hover:border-white/30 transition-colors flex-shrink-0"
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={photo.fileUrl}
              alt="Photo evidence"
              className="w-full h-full object-cover"
            />
          </button>
        ))}
      </div>

      {/* Lightbox overlay */}
      {lightboxUrl && (
        <div
          className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4"
          onClick={() => setLightboxUrl(null)}
        >
          <button
            onClick={() => setLightboxUrl(null)}
            className="absolute top-4 right-4 text-white/70 hover:text-white"
          >
            <X className="h-6 w-6" />
          </button>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={lightboxUrl}
            alt="Photo evidence enlarged"
            className="max-w-full max-h-full object-contain rounded-lg"
            onClick={(e) => e.stopPropagation()}
          />
        </div>
      )}
    </>
  );
}
