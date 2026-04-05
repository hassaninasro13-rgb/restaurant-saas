/**
 * Client-side resize + JPEG compression for product photos (Products module).
 * Decodes first, then resizes/compresses. The **5 Mo limit applies only to the final JPEG**.
 *
 * Robustness: multiple decode paths (EXIF / no EXIF / downscaled decode / <img>),
 * clearer errors for corrupt, unsupported, and memory-heavy gallery files.
 */

const DEFAULT_MAX_LONG_EDGE = 1600;
const DEFAULT_QUALITY = 0.86;
/** Only the optimized JPEG must stay under this limit for storage upload. */
export const MAX_OPTIMIZED_PRODUCT_BYTES = 5 * 1024 * 1024;
const MIN_LONG_EDGE = 480;
const MIN_JPEG_QUALITY = 0.38;
/** Above this, try decode-with-resize first to reduce RAM (browser-dependent). */
const LARGE_FILE_BYTES = 12 * 1024 * 1024;
/** Decode resize long-edge cap when probing large files (keeps memory bounded when supported). */
const LARGE_DECODE_MAX_EDGE = 2048;
/** Reject absurd dimensions (corrupt metadata) before allocating canvas. */
const MAX_SOURCE_EDGE = 32000;
/** Reject corrupt headers claiming billions of pixels (avoids canvas / memory blowups). */
const MAX_SOURCE_PIXELS = 200_000_000;

/** @typedef {'unsupported'|'corrupt'|'memory'|'decode'|'encode'} ProductImageIssueCode */

/**
 * Attach a stable code for UI mapping (optional).
 * @param {string} message
 * @param {ProductImageIssueCode} code
 * @param {unknown} [cause]
 */
function makeImageError(message, code, cause) {
  const err = new Error(message);
  err.name = 'ProductImageError';
  /** @type {ProductImageIssueCode} */
  err.code = code;
  if (cause !== undefined && cause !== null) err.cause = cause;
  return err;
}

/**
 * True if the file is likely an image (MIME, extension, or JPEG/PNG/GIF/WebP signature).
 * Does not use original file size vs 5 Mo.
 */
export async function fileLooksLikeImage(file) {
  if (!file) return false;
  const t = (file.type || '').toLowerCase().trim();
  if (t.startsWith('image/')) return true;
  if (t === 'application/octet-stream' || t === 'binary/octet-stream' || t === '') {
    return sniffImageMagic(file);
  }
  const name = (file.name || '').toLowerCase();
  if (/\.(jpe?g|png|gif|webp|heic|heif|bmp|tiff?)$/i.test(name)) return true;
  return sniffImageMagic(file);
}

async function sniffImageMagic(file) {
  try {
    const n = Math.min(16, file.size || 0);
    if (n < 3) return false;
    const buf = new Uint8Array(await file.slice(0, n).arrayBuffer());
    if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return true;
    if (buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) return true;
    if (buf[0] === 0x47 && buf[1] === 0x49 && buf[2] === 0x46) return true;
    if (
      buf.length >= 12 &&
      buf[0] === 0x52 &&
      buf[1] === 0x49 &&
      buf[2] === 0x46 &&
      buf[3] === 0x46 &&
      buf[8] === 0x57 &&
      buf[9] === 0x45 &&
      buf[10] === 0x42 &&
      buf[11] === 0x50
    ) {
      return true;
    }
    return false;
  } catch {
    return false;
  }
}

function isHeicLike(file) {
  const t = (file.type || '').toLowerCase();
  if (t.includes('heic') || t.includes('heif')) return true;
  return /\.hei[c|f]$/i.test(file.name || '');
}

/**
 * @param {File} file
 * @param {{
 *   maxLongEdge?: number;
 *   quality?: number;
 *   maxOutputBytes?: number;
 * }=} options
 * @returns {Promise<{ file: File; blob: Blob; meta: { outW: number; outH: number; inBytes: number; outBytes: number; jpegQuality: number } }>}
 */
export async function optimizeProductImage(file, options = {}) {
  console.log('[OneTap image-optimize] start', {
    name: file?.name,
    size: file?.size,
    type: file?.type || '(empty)',
  });

  if (!(await fileLooksLikeImage(file))) {
    console.warn('[OneTap image-optimize] not recognized as image before decode');
    throw makeImageError(
      'Ce fichier ne ressemble pas à une photo (type inconnu). Essayez JPG ou PNG.',
      'unsupported',
    );
  }

  const maxOutputBytes = options.maxOutputBytes ?? MAX_OPTIMIZED_PRODUCT_BYTES;

  let source;
  try {
    source = await loadDrawableSourceRobust(file);
  } catch (e) {
    if (e && e.code) throw e;
    console.error('[OneTap image-optimize] decode chain failed', e);
    throw makeImageError(
      'Impossible d’ouvrir cette photo. Elle est peut-être corrompue ou dans un format que ce navigateur ne lit pas. Essayez JPG ou PNG.',
      'decode',
      e,
    );
  }

  console.log('[OneTap image-optimize] decoded', { w: source.width, h: source.height });
  try {
    const sw = source.width;
    const sh = source.height;
    if (!sw || !sh) {
      throw makeImageError('Cette image a des dimensions invalides (fichier corrompu ?).', 'corrupt');
    }
    if (sw > MAX_SOURCE_EDGE || sh > MAX_SOURCE_EDGE || sw * sh > MAX_SOURCE_PIXELS) {
      throw makeImageError(
        'Cette image est trop grande pour être traitée dans le navigateur. Exportez une version plus petite (par ex. côté long ≤ 8000 px).',
        'memory',
      );
    }

    let longEdge = options.maxLongEdge ?? DEFAULT_MAX_LONG_EDGE;
    let baseQuality = options.quality ?? DEFAULT_QUALITY;
    let lastBlob = null;
    let outW = 0;
    let outH = 0;
    let usedQuality = baseQuality;

    for (let pass = 0; pass < 14; pass++) {
      const scaled = scaleDimensions(sw, sh, longEdge);
      outW = scaled.outW;
      outH = scaled.outH;

      let canvas;
      let ctx;
      try {
        canvas = document.createElement('canvas');
        canvas.width = outW;
        canvas.height = outH;
        ctx = canvas.getContext('2d');
        if (!ctx) throw new Error('no context');
      } catch (allocErr) {
        console.error('[OneTap image-optimize] canvas alloc failed', allocErr);
        throw makeImageError(
          'Mémoire insuffisante pour redimensionner cette photo. Essayez une image plus petite ou fermez d’autres onglets.',
          'memory',
          allocErr,
        );
      }

      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, outW, outH);
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';
      try {
        source.draw(ctx, 0, 0, outW, outH);
      } catch (drawErr) {
        console.error('[OneTap image-optimize] drawImage failed', drawErr);
        throw makeImageError(
          'Impossible de traiter cette image (données corrompues ou format partiellement supporté). Essayez une autre exportation en JPG.',
          'corrupt',
          drawErr,
        );
      }

      let q = pass === 0 ? baseQuality : Math.min(baseQuality, 0.8);
      let blob;
      try {
        blob = await canvasToJpegBlob(canvas, q);
      } catch (encErr) {
        console.error('[OneTap image-optimize] toBlob failed', encErr);
        throw makeImageError(
          'Le navigateur n’a pas pu compresser cette image. Essayez une autre photo ou un autre navigateur.',
          'encode',
          encErr,
        );
      }
      lastBlob = blob;
      usedQuality = q;

      while (lastBlob.size > maxOutputBytes && q > MIN_JPEG_QUALITY + 0.01) {
        q -= 0.05;
        lastBlob = await canvasToJpegBlob(canvas, q);
        usedQuality = q;
      }

      if (lastBlob.size <= maxOutputBytes) {
        console.log('[OneTap image-optimize] done', {
          pass,
          outW,
          outH,
          outBytes: lastBlob.size,
          jpegQuality: usedQuality,
        });
        break;
      }

      const nextEdge = Math.round(longEdge * 0.75);
      if (nextEdge < MIN_LONG_EDGE) {
        console.error('[OneTap image-optimize] could not reach max output size', lastBlob.size);
        throw makeImageError(
          'Cette photo reste trop lourde après compression. Essayez une image plus simple ou un autre cliché.',
          'encode',
        );
      }
      longEdge = nextEdge;
    }

    if (!lastBlob || lastBlob.size > maxOutputBytes) {
      console.error('[OneTap image-optimize] final blob over limit', lastBlob?.size);
      throw makeImageError(
        'Cette photo reste trop lourde après compression. Essayez une autre image.',
        'encode',
      );
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
 * @returns {Promise<{ width: number; height: number; draw: Function; dispose: Function }>}
 */
async function loadDrawableSourceRobust(file) {
  const failures = [];

  const fromBitmap = (bitmap, label) => ({
    width: bitmap.width,
    height: bitmap.height,
    label,
    draw(ctx, dx, dy, dw, dh) {
      ctx.drawImage(bitmap, dx, dy, dw, dh);
    },
    dispose() {
      if (typeof bitmap.close === 'function') bitmap.close();
    },
  });

  const tryCreate = async (label, options) => {
    if (typeof createImageBitmap !== 'function') return null;
    try {
      const bitmap = await createImageBitmap(file, options);
      if (!bitmap.width || !bitmap.height) {
        bitmap.close?.();
        return null;
      }
      return fromBitmap(bitmap, label);
    } catch (err) {
      failures.push({ label, err });
      return null;
    }
  };

  if (typeof createImageBitmap === 'function') {
    if (file.size >= LARGE_FILE_BYTES) {
      const early = await tryCreate('bitmap large downscale', {
        imageOrientation: 'from-image',
        resizeWidth: LARGE_DECODE_MAX_EDGE,
        resizeHeight: LARGE_DECODE_MAX_EDGE,
        resizeQuality: 'high',
      });
      if (early) return early;
    }

    let src = await tryCreate('bitmap + EXIF orientation', { imageOrientation: 'from-image' });
    if (src) return src;

    src = await tryCreate('bitmap without orientation', {});
    if (src) return src;

    if (file.size < LARGE_FILE_BYTES) {
      src = await tryCreate('bitmap downscale fallback', {
        imageOrientation: 'from-image',
        resizeWidth: LARGE_DECODE_MAX_EDGE,
        resizeHeight: LARGE_DECODE_MAX_EDGE,
        resizeQuality: 'high',
      });
      if (src) return src;
    }
  }

  const url = URL.createObjectURL(file);
  const img = new Image();
  img.decoding = 'async';
  try {
    await new Promise((resolve, reject) => {
      img.onload = () => resolve();
      img.onerror = () => reject(new Error('IMG_ONERROR'));
      img.src = url;
    });
  } catch {
    URL.revokeObjectURL(url);
    throwFinalizeDecodeError(file, failures);
  }

  if (typeof createImageBitmap === 'function') {
    try {
      const bitmap = await createImageBitmap(img);
      URL.revokeObjectURL(url);
      if (bitmap.width && bitmap.height) return fromBitmap(bitmap, 'bitmap from <img>');
      bitmap.close?.();
    } catch (err) {
      failures.push({ label: 'bitmap from img', err });
    }
  }

  if (img.naturalWidth > 0 && img.naturalHeight > 0) {
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
  }

  URL.revokeObjectURL(url);
  throwFinalizeDecodeError(file, failures);
}

/**
 * @param {File} file
 * @param {{ label: string; err: unknown }[]} failures
 * @returns {never}
 */
function throwFinalizeDecodeError(file, failures) {
  console.warn('[OneTap image-optimize] decode failed', failures);

  if (isHeicLike(file)) {
    throw makeImageError(
      'Format HEIC : ce navigateur ne le décode souvent pas. Sur iPhone, exportez en « le plus compatible » (JPG) ou utilisez Safari.',
      'unsupported',
    );
  }

  const hasSecurity = failures.some(
    (f) => f.err && (f.err.name === 'SecurityError' || String(f.err.message || '').includes('secure')),
  );
  if (hasSecurity) {
    throw makeImageError(
      'Impossible de lire cette image (restriction de sécurité). Essayez une autre photo ou un export JPG depuis la galerie.',
      'decode',
    );
  }

  const isHuge = file.size > 60 * 1024 * 1024;
  if (isHuge) {
    throw makeImageError(
      'Fichier très lourd : le navigateur n’a pas pu le décoder. Réduisez la taille dans l’app Photos puis réessayez.',
      'memory',
    );
  }

  throw makeImageError(
    'Photo illisible : fichier corrompu, incomplet, ou format non supporté par ce navigateur. Essayez JPG ou PNG exportés depuis la galerie.',
    'corrupt',
  );
}

function canvasToJpegBlob(canvas, quality) {
  return new Promise((resolve, reject) => {
    try {
      canvas.toBlob(
        (b) => (b ? resolve(b) : reject(new Error('toBlob returned null'))),
        'image/jpeg',
        quality,
      );
    } catch (e) {
      reject(e);
    }
  });
}

export const PRODUCT_IMAGE_OPTIMIZE = {
  maxLongEdge: DEFAULT_MAX_LONG_EDGE,
  quality: DEFAULT_QUALITY,
  maxOutputBytes: MAX_OPTIMIZED_PRODUCT_BYTES,
};
