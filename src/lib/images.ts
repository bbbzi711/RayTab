import { AppError } from '@/lib/errors';
import { validateSvgImage } from '@/lib/svg';
const ALLOWED_TYPES = [
  'image/png',
  'image/jpeg',
  'image/webp',
  'image/x-icon',
  'image/vnd.microsoft.icon',
  'image/svg+xml',
  'image/gif',
];

type Drawable = {
  width: number;
  height: number;
  draw: (
    ctx: CanvasRenderingContext2D,
    width: number,
    height: number,
    area?: ImageCropArea,
  ) => void;
  cleanup: () => void;
};

export type ImageCropArea = { x: number; y: number; width: number; height: number };

// The largest icon is 104 CSS pixels; 512px retains detail on high-density screens.
const ICON_MAX_SIZE = 512;

async function isAnimatedIcon(file: Blob) {
  if (file.type === 'image/gif') return true;
  if (file.type !== 'image/png' && file.type !== 'image/webp') return false;
  const bytes = new Uint8Array(await file.arrayBuffer());
  const view = new DataView(bytes.buffer);
  const png = file.type === 'image/png';
  // PNG and WebP declare animation in chunks. Do not flatten them to a canvas frame.
  for (let offset = png ? 8 : 12; offset + (png ? 12 : 8) <= bytes.length;) {
    const tagOffset = png ? offset + 4 : offset;
    const tag = String.fromCharCode(...bytes.subarray(tagOffset, tagOffset + 4));
    if (tag === 'acTL' || tag === 'ANIM') return true;
    if (png && tag === 'IDAT') return false;
    const length = view.getUint32(png ? offset : offset + 4, !png);
    offset += length + (png ? 12 : 8 + (length % 2));
  }
  return false;
}

export function validateImageFile(file: Blob) {
  const isAllowed = ALLOWED_TYPES.includes(file.type) || file.type.startsWith('image/');
  if (!isAllowed) throw new AppError('messages.chooseAValidImageFilePngJpegWebpIcoOrSvg');
  if (file.size > 10 * 1024 * 1024) throw new AppError('messages.imagesCannotExceed10Mb');
}

function drawImage(
  context: CanvasRenderingContext2D,
  image: CanvasImageSource,
  width: number,
  height: number,
  area?: ImageCropArea,
) {
  if (area) context.drawImage(image, area.x, area.y, area.width, area.height, 0, 0, width, height);
  else context.drawImage(image, 0, 0, width, height);
}

async function loadDrawable(file: Blob): Promise<Drawable> {
  try {
    const bitmap = await createImageBitmap(file);
    return {
      width: bitmap.width,
      height: bitmap.height,
      draw: (ctx, w, h, area) => drawImage(ctx, bitmap, w, h, area),
      cleanup: () => bitmap.close(),
    };
  } catch {
    return new Promise((resolve, reject) => {
      const img = new Image();
      const url = URL.createObjectURL(file);
      img.onload = () => {
        const width = img.naturalWidth || 160;
        const height = img.naturalHeight || 160;
        resolve({
          width,
          height,
          draw: (ctx, w, h, area) => drawImage(ctx, img, w, h, area),
          cleanup: () => URL.revokeObjectURL(url),
        });
      };
      img.onerror = () => {
        URL.revokeObjectURL(url);
        reject(new AppError('messages.thisImageCannotBeRead'));
      };
      img.src = url;
    });
  }
}

export async function prepareImage(file: Blob, kind: 'icon' | 'wallpaper') {
  validateImageFile(file);
  if (kind === 'icon') {
    if (file.type === 'image/svg+xml') await validateSvgImage(file);
    // Keep vectors and small images intact; resize oversized static artwork only.
    const { width, height } = await imageDimensions(file);
    if (!width || !height) throw new AppError('messages.thisImageCannotBeRead');
    if (width * height > 40_000_000)
      throw new AppError('messages.useAnImageSmallerThan40Megapixels');
    let blob = file;
    if (
      Math.max(width, height) > ICON_MAX_SIZE &&
      ['image/png', 'image/jpeg', 'image/webp'].includes(file.type) &&
      !(await isAnimatedIcon(file))
    ) {
      const resized = await renderImage(file, ICON_MAX_SIZE, undefined, {
        type: file.type,
        quality: 0.92,
      });
      if (resized.size < file.size) blob = resized;
    }
    return { id: crypto.randomUUID(), blob };
  }
  return {
    id: crypto.randomUUID(),
    blob: await renderImage(file, 2560),
  };
}

export async function imageDimensions(file: Blob) {
  validateImageFile(file);
  const drawable = await loadDrawable(file);
  try {
    return { width: drawable.width, height: drawable.height };
  } finally {
    drawable.cleanup();
  }
}

/** Cropping is explicit: preserve all pixels, including white and transparency, inside the area. */
export function cropImage(file: Blob, area: ImageCropArea) {
  return renderImage(file, 256, area);
}

async function renderImage(
  file: Blob,
  limit: number,
  area?: ImageCropArea,
  output = { type: 'image/webp', quality: 0.88 },
) {
  validateImageFile(file);
  const drawable = await loadDrawable(file);
  try {
    if (drawable.width * drawable.height > 40_000_000)
      throw new AppError('messages.useAnImageSmallerThan40Megapixels');
    if (
      area &&
      (!Object.values(area).every(Number.isFinite) ||
        area.x < 0 ||
        area.y < 0 ||
        area.width <= 0 ||
        area.height <= 0 ||
        area.x + area.width > drawable.width + 1 ||
        area.y + area.height > drawable.height + 1)
    )
      throw new AppError('navigation.cropRequired');
    const width = area?.width ?? drawable.width;
    const height = area?.height ?? drawable.height;
    const scale =
      file.type === 'image/svg+xml' && !area
        ? limit / Math.max(width, height)
        : Math.min(1, limit / Math.max(width, height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(width * scale));
    canvas.height = Math.max(1, Math.round(height * scale));
    const context = canvas.getContext('2d');
    if (!context) throw new AppError('messages.theBrowserCannotProcessThisImage');
    context.imageSmoothingQuality = 'high';
    drawable.draw(context, canvas.width, canvas.height, area);
    return await new Promise<Blob>((resolve, reject) =>
      canvas.toBlob(
        (value) =>
          value ? resolve(value) : reject(new AppError('messages.imageProcessingFailed')),
        output.type,
        output.quality,
      ),
    );
  } finally {
    drawable.cleanup();
  }
}
