"use client";

// Full-screen lightbox overlay for viewing a photo.
// Click backdrop or X button to close.

import { X } from "lucide-react";

interface Props {
  url: string;
  onClose: () => void;
}

export default function PhotoLightbox({ url, onClose }: Props) {
  return (
    <div
      className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4"
      onClick={onClose}
    >
      <button
        onClick={onClose}
        className="absolute top-4 right-4 text-white/70 hover:text-white z-10"
      >
        <X className="h-6 w-6" />
      </button>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={url}
        alt="Photo evidence enlarged"
        className="max-w-full max-h-full object-contain rounded-lg"
        onClick={(e) => e.stopPropagation()}
      />
    </div>
  );
}
