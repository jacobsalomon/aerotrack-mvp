"use client";

// Displays a row of photo thumbnails for an inspection item.
// Click any thumbnail to enlarge it in a lightbox overlay.

import { useState } from "react";
import type { PhotoEvidence } from "./photo-types";
import PhotoLightbox from "./photo-lightbox";

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

      {lightboxUrl && (
        <PhotoLightbox url={lightboxUrl} onClose={() => setLightboxUrl(null)} />
      )}
    </>
  );
}
