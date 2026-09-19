export async function prepareImage(file: Blob, kind: 'icon' | 'wallpaper') {
  if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type))
    throw new Error('请选择 PNG、JPEG 或 WebP 图片');
  if (file.size > 10 * 1024 * 1024) throw new Error('图片不能超过 10 MB');
  const bitmap = await createImageBitmap(file).catch(() => {
    throw new Error('这张图片无法读取');
  });
  try {
    if (bitmap.width * bitmap.height > 40_000_000)
      throw new Error('图片尺寸过大，请使用 4000 万像素以内的图片');
    const limit = kind === 'icon' ? 160 : 2560;
    const scale = Math.min(1, limit / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(bitmap.width * scale));
    canvas.height = Math.max(1, Math.round(bitmap.height * scale));
    const context = canvas.getContext('2d');
    if (!context) throw new Error('浏览器无法处理图片');
    context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob>((resolve, reject) =>
      canvas.toBlob(
        (value) => (value ? resolve(value) : reject(new Error('图片处理失败'))),
        'image/webp',
        0.88,
      ),
    );
    return { id: crypto.randomUUID(), blob };
  } finally {
    bitmap.close();
  }
}
