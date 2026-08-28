// Client-side image compression for gallery uploads: converts to WebP and
// shrinks it below the 0.5MB cap using the browser's canvas encoder (no
// server compute). Falls back to JPEG if the browser cannot encode WebP.
import { GALLERY_MAX_BYTES } from '../config';

// Safety margin: compress a bit under the hard cap so small metadata
// differences never push the upload past the relay/module reject.
const TARGET_BYTES = Math.floor(GALLERY_MAX_BYTES * 0.92); // ~460KB target
const QUALITY_LADDER = [0.9, 0.8, 0.7, 0.6, 0.5, 0.4, 0.3, 0.25, 0.2];
const DIM_LADDER = [1600, 1280, 1024, 800, 640];

function loadImage(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => { URL.revokeObjectURL(url); resolve(img); };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Could not read image')); };
    img.src = url;
  });
}

function encodeBlob(canvas: HTMLCanvasElement, type: 'image/webp' | 'image/jpeg', quality: number): Promise<Blob | null> {
  return new Promise((resolve) => canvas.toBlob(resolve, type, quality));
}

/**
 * Compress an image file to WebP under the gallery limit.
 * Returns a Blob ready to upload (image/webp, or image/jpeg fallback).
 * Throws if the image cannot be processed at all.
 */
export async function compressGalleryImage(file: File): Promise<Blob> {
  // Only images are accepted upstream (the input already filters, gate here too).
  if (!file.type.startsWith('image/')) {
    throw new Error('Only image files can be added to the gallery');
  }

  const img = await loadImage(file);
  const supportsWebp = typeof HTMLCanvasElement !== 'undefined'
    && typeof document !== 'undefined'
    && document.createElement('canvas').toDataURL('image/webp').startsWith('data:image/webp');
  const mime: 'image/webp' | 'image/jpeg' = supportsWebp ? 'image/webp' : 'image/jpeg';

  let lastBlob: Blob | null = null;

  for (const dim of DIM_LADDER) {
    const scale = Math.min(1, dim / Math.max(img.naturalWidth, img.naturalHeight));
    const w = Math.max(1, Math.round(img.naturalWidth * scale));
    const h = Math.max(1, Math.round(img.naturalHeight * scale));
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Could not process image');
    ctx.drawImage(img, 0, 0, w, h);

    for (const quality of QUALITY_LADDER) {
      const blob = await encodeBlob(canvas, mime, quality);
      if (blob && blob.size <= TARGET_BYTES) {
        // Prefer a WebP result; JPEG fallback only when the browser can't
        // encode WebP at all.
        return blob;
      }
      if (blob) lastBlob = blob;
    }
  }

  // Should be rare (tiny dims at min quality still over budget). Use the
  // smallest attempt rather than failing outright; the backend may bounce it.
  if (lastBlob) return lastBlob;
  throw new Error('Could not compress image to the 0.5MB limit — try a smaller photo');
}