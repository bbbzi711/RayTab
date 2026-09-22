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
  draw: (ctx: CanvasRenderingContext2D, width: number, height: number) => void;
  cleanup: () => void;
};

async function loadDrawable(file: Blob): Promise<Drawable> {
  try {
    const bitmap = await createImageBitmap(file);
    return {
      width: bitmap.width,
      height: bitmap.height,
      draw: (ctx, w, h) => ctx.drawImage(bitmap, 0, 0, w, h),
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
          draw: (ctx, w, h) => {
            ctx.drawImage(img, 0, 0, w, h);
            URL.revokeObjectURL(url);
          },
          cleanup: () => URL.revokeObjectURL(url),
        });
      };
      img.onerror = () => {
        URL.revokeObjectURL(url);
        reject(new Error('这张图片无法读取'));
      };
      img.src = url;
    });
  }
}

export async function prepareImage(file: Blob, kind: 'icon' | 'wallpaper') {
  const isAllowed = ALLOWED_TYPES.includes(file.type) || file.type.startsWith('image/');
  if (!isAllowed) throw new Error('请选择有效的图片文件（PNG、JPEG、WebP、ICO 或 SVG）');
  if (file.size > 10 * 1024 * 1024) throw new Error('图片不能超过 10 MB');
  const drawable = await loadDrawable(file);
  try {
    if (drawable.width * drawable.height > 40_000_000)
      throw new Error('图片尺寸过大，请使用 4000 万像素以内的图片');
    const limit = kind === 'icon' ? 160 : 2560;
    const scale = Math.min(1, limit / Math.max(drawable.width, drawable.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(drawable.width * scale));
    canvas.height = Math.max(1, Math.round(drawable.height * scale));
    const context = canvas.getContext('2d');
    if (!context) throw new Error('浏览器无法处理图片');
    drawable.draw(context, canvas.width, canvas.height);
    const blob = await new Promise<Blob>((resolve, reject) =>
      canvas.toBlob(
        (value) => (value ? resolve(value) : reject(new Error('图片处理失败'))),
        'image/webp',
        0.88,
      ),
    );
    return { id: crypto.randomUUID(), blob };
  } finally {
    drawable.cleanup();
  }
}
