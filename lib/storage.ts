// Server-side storage helpers for uploading files to Vercel Blob.
// Used for admin CMM uploads (evidence files are uploaded client-side by the mobile app).

import { put, del, list } from "@vercel/blob";

// Upload a CMM PDF to Vercel Blob and return the public URL
export async function uploadCmmPdf(
  file: Buffer,
  filename: string
): Promise<{ url: string; size: number }> {
  const blob = await put(`cmm/${filename}`, file, {
    access: "public",
    contentType: "application/pdf",
  });

  return { url: blob.url, size: file.byteLength };
}

// Upload any file to Vercel Blob (for future use — evidence, manuals, etc.)
export async function uploadFile(
  file: Buffer,
  path: string,
  contentType: string
): Promise<{ url: string; size: number }> {
  const blob = await put(path, file, {
    access: "public",
    contentType,
  });

  return { url: blob.url, size: file.byteLength };
}

// Delete a file from Vercel Blob by its URL
export async function deleteFile(url: string): Promise<void> {
  await del(url);
}

// List all files in a given prefix (e.g., "cmm/")
export async function listFiles(prefix: string) {
  const result = await list({ prefix });
  return result.blobs;
}
