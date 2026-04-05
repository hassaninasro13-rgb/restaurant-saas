/**
 * Client-side resize + JPEG compression for product photos (Products module).
 * Uses Canvas; prefers createImageBitmap + imageOrientation for correct phone photo rotation.
 *
 * Flow: decode original (any reasonable size) → resize → compress → **enforce max output size**
 * on the optimized blob only (not the original file).
 */

const DEFAULT_MAX_LONG_EDGE = 1600;
const DEFAULT_QUALITY = 0.86;
/** Only the optimized JPEG must stay under this limit for storage upload. */
export const MAX_OPTIMIZED_PRODUCT_BYTES = 5 * 1024 * 1024;
/** Hard cap on original file to avoid browser OOM (no UX “5 MB” on original). */
const MAX_ORIGINAL_BYTES = 80 * 1024 * 1024;
const MIN_LONG_EDGE = 560;
const MIN_JPEG_QUALITY = 0.42;

/**
 * @param {File} file
 * @param {{
 *   maxLongEdge?: number;
 *   quality?: number;
 *   maxOriginalBytes?: number;
 *   maxOutputBytes?: number;
 * }=} options
 * @returns {Promise<{ file: File; blob: Blob; meta: { outW: number; outH: number; inBytes: number; outBytes: number; jpegQuality: number } }>}
 */
export async function optimizeProductImage(file, options = {}) {
  if (!file || !file.type.startsWith('image/')) {
    throw new Error('Fichier image attendu');
  }

  const maxOutputBytes = options.maxOutputBytes ?? MAX_OPTIMIZED_PRODUCT_BYTES;
  const maxOriginalBytes = options.maxOriginalBytes ?? MAX_ORIGINAL_BYTES;

  if (file.size > maxOriginalBytes) {
    throw new Error('Fichier trop volumineux pour le navigateur (essayez une photo plus légère).');
  }

  const source = await loadDrawableSource(file);
  try {
    const sw = source.width;
    const sh = source.height;
    if (!sw || !sh) throw new Error('Dimensions image invalides');

    let longEdge = options.maxLongEdge ?? DEFAULT_MAX_LONG_EDGE;
    let baseQuality = options.quality ?? DEFAULT_QUALITY;
    let lastBlob = null;
    let outW = 0;
    let outH = 0;
    let usedQuality = baseQuality;

    for (let pass = 0; pass < 12; pass++) {
      const scaled = scaleDimensions(sw, sh, longEdge);
      outW = scaled.outW;
      outH = scaled.outH;

      const canvas = document.createElement('canvas');
      canvas.width = outW;
      canvas.height = outH;
      const ctx = canvas.getContext('2d');
      if (!ctx) throw new Error('Canvas indisponible');

      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, outW, outH);
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';
      source.draw(ctx, 0, 0, outW, outH);

      let q = pass === 0 ? baseQuality : Math.min(baseQuality, 0.82);
      lastBlob = await canvasToJpegBlob(canvas, q);
      usedQuality = q;

      while (lastBlob.size > maxOutputBytes && q > MIN_JPEG_QUALITY + 0.01) {
        q -= 0.06;
        lastBlob = await canvasToJpegBlob(canvas, q);
        usedQuality = q;
      }

      if (lastBlob.size <= maxOutputBytes) break;

      const nextEdge = Math.round(longEdge * 0.78);
      if (nextEdge < MIN_LONG_EDGE) {
        throw new Error(
          'Impossible d’obtenir une image sous 5 Mo tout en gardant une qualité acceptable. Essayez une photo moins détaillée.',
        );
      }
      longEdge = nextEdge;
    }

    if (!lastBlob || lastBlob.size > maxOutputBytes) {
      throw new Error('Image optimisée encore trop lourde (max 5 Mo après compression).');
    }

    const outFile = new File([lastBlob], `product-${Date.now()}.jpg`, {
      type: 'image/jpeg',
      lastModified: Date.now(),
    });

    return {
      file: outFile,
      blob: lastBlob,
      meta: {
        outW,
        outH,
        inBytes: file.size,
        outBytes: lastBlob.size,
        jpegQuality: usedQuality,
      },
    };
  } finally {
    source.dispose();
  }
}

function scaleDimensions(sw, sh, maxLongEdge) {
  const scale = Math.min(1, maxLongEdge / Math.max(sw, sh));
  return {
    outW: Math.max(1, Math.round(sw * scale)),
    outH: Math.max(1, Math.round(sh * scale)),
  };
}

/**
 * @returns {Promise<{ width: number; height: number; draw: (ctx: CanvasRenderingContext2D, dx: number, dy: number, dw: number, dh: number) => void; dispose: () => void }>}
 */
async function loadDrawableSource(file) {
  if (typeof createImageBitmap === 'function') {
    try {
      const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
      return {
        width: bitmap.width,
        height: bitmap.height,
        draw(ctx, dx, dy, dw, dh) {
          ctx.drawImage(bitmap, dx, dy, dw, dh);
        },
        dispose() {
          if (typeof bitmap.close === 'function') bitmap.close();
        },
      };
    } catch {
      /* fall through */
    }
  }

  const url = URL.createObjectURL(file);
  const img = new Image();
  img.decoding = 'async';
  try {
    await new Promise((resolve, reject) => {
      img.onload = () => resolve();
      img.onerror = () => reject(new Error('Impossible de lire cette image'));
      img.src = url;
    });

    if (typeof createImageBitmap === 'function') {
      const bitmap = await createImageBitmap(img);
      URL.revokeObjectURL(url);
      return {
        width: bitmap.width,
        height: bitmap.height,
        draw(ctx, dx, dy, dw, dh) {
          ctx.drawImage(bitmap, dx, dy, dw, dh);
        },
        dispose() {
          if (typeof bitmap.close === 'function') bitmap.close();
        },
      };
    }

    return {
      width: img.naturalWidth,
      height: img.naturalHeight,
      draw(ctx, dx, dy, dw, dh) {
        ctx.drawImage(img, dx, dy, dw, dh);
      },
      dispose() {
        URL.revokeObjectURL(url);
      },
    };
  } catch (e) {
    URL.revokeObjectURL(url);
    throw e;
  }
}

function canvasToJpegBlob(canvas, quality) {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (b) => (b ? resolve(b) : reject(new Error('Compression JPEG impossible'))),
      'image/jpeg',
      quality,
    );
  });
}

export const PRODUCT_IMAGE_OPTIMIZE = {
  maxLongEdge: DEFAULT_MAX_LONG_EDGE,
  quality: DEFAULT_QUALITY,
  maxOutputBytes: MAX_OPTIMIZED_PRODUCT_BYTES,
};
