"use client";

// Displays a row of photo thumbnails for an inspection item.
// Click any thumbnail to enlarge it in a lightbox overlay.

import { useState } from "react";
import type { PhotoEvidence } from "./photo-types";
import PhotoLightbox from "./photo-lightbox";

interface Props {
  photos: PhotoEvidence[];
  /** "sm" = 56px tiles (default), "md" = 96px tiles for expanded items */
  size?: "sm" | "md";
}

export default function PhotoThumbnails({ photos, size = "sm" }: Props) {
  const [lightboxUrl, setLightboxUrl] = useState<string | null>(null);

  if (photos.length === 0) return null;

  const isMedium = size === "md";
  const thumbClass = isMedium
    ? "w-24 h-24 rounded-lg"
    : "w-14 h-14 rounded-md";

  return (
    <>
      <div className={isMedium
        ? "flex gap-2 overflow-x-auto scrollbar-thin scrollbar-thumb-white/10 pb-1"
        : "flex gap-2 flex-wrap"
      }>
        {photos.map((photo) => (
          <button
            key={photo.id}
            onClick={() => setLightboxUrl(photo.fileUrl)}
            className={`relative ${thumbClass} overflow-hidden border border-white/10
              hover:border-white/30 transition-all flex-shrink-0 animate-in fade-in duration-300`}
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

      {lightboxUrl && (
        <PhotoLightbox url={lightboxUrl} onClose={() => setLightboxUrl(null)} />
      )}
    </>
  );
}
