// Client-side image compression: converts to WebP and shrinks it under the
// target cap using the browser's canvas encoder (no server compute). Falls
// back to JPEG if the browser cannot encode WebP.
// Shared core for BOTH pipelines (gallery < 0.5MB, profile pictures < 1MB) —
// one compressor, two wrappers; never duplicate the ladder logic.
import { GALLERY_MAX_BYTES, PROFILE_PICTURE_MAX_BYTES } from '../config';

// Safety margin: compress a bit under the hard cap so small metadata
// differences never push the upload past the relay/module reject.
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
 * Compress an image file under targetBytes via the dimension × quality
 * ladder. Returns a Blob (image/webp, or image/jpeg if WebP encoding is
 * unavailable). `capLabel` names the limit in error messages.
 */
async function compressImageToTarget(file: File, targetBytes: number, capLabel: string): Promise<Blob> {
  if (!file.type.startsWith('image/')) {
    throw new Error('Only image files can be uploaded');
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
      if (blob && blob.size <= targetBytes) {
        return blob;
      }
      if (blob) lastBlob = blob;
    }
  }

  // Should be rare (tiny dims at min quality still over budget). Use the
  // smallest attempt rather than failing outright; the backend may bounce it.
  if (lastBlob) return lastBlob;
  throw new Error(`Could not compress image to the ${capLabel} limit — try a smaller photo`);
}

/** Gallery pipeline: WebP under the 0.5MB cap. */
export async function compressGalleryImage(file: File): Promise<Blob> {
  const target = Math.floor(GALLERY_MAX_BYTES * 0.92); // ~460KB target
  return compressImageToTarget(file, target, '0.5MB');
}

/** Profile picture pipeline: WebP under the 1MB cap. */
export async function compressProfileImage(file: File): Promise<Blob> {
  const target = Math.floor(PROFILE_PICTURE_MAX_BYTES * 0.92); // ~940KB target
  return compressImageToTarget(file, target, '1MB');
}