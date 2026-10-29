import type { Locator } from '@playwright/test';

/** Inspect a displayed image, independent of inline SVG versus an image element. */
export async function artworkSource(frame: Locator) {
  return frame.evaluate(async (element) => {
    const graphic = element.querySelector('img, svg');
    if (graphic instanceof HTMLImageElement) {
      await graphic.decode();
      const response = await fetch(graphic.currentSrc || graphic.src);
      if (!response.ok) throw new Error('Displayed icon cannot be read');
      const blob = await response.blob();
      return {
        vector: blob.type.split(';')[0] === 'image/svg+xml',
        local: graphic.src.startsWith(location.origin) || graphic.src.startsWith('blob:'),
        width: graphic.naturalWidth,
        height: graphic.naturalHeight,
      };
    }
    if (graphic instanceof SVGSVGElement) {
      const bounds = graphic.getBBox();
      return { vector: true, local: true, width: bounds.width, height: bounds.height };
    }
    throw new Error('Expected visible icon artwork');
  });
}

/** Sample browser-painted pixels: CSS layout, transforms, clipping and backgrounds all apply. */
export async function paintedArtwork(frame: Locator, color?: readonly [number, number, number]) {
  const bytes = Array.from(await frame.screenshot({ animations: 'disabled' }));
  return frame.evaluate(
    async (_element, { bytes, color }) => {
      const bitmap = await createImageBitmap(
        new Blob([new Uint8Array(bytes)], { type: 'image/png' }),
      );
      try {
        const canvas = document.createElement('canvas');
        canvas.width = bitmap.width;
        canvas.height = bitmap.height;
        const context = canvas.getContext('2d');
        if (!context) throw new Error('Canvas is unavailable');
        context.drawImage(bitmap, 0, 0);
        const { data } = context.getImageData(0, 0, canvas.width, canvas.height);
        const background = getComputedStyle(_element)
          .backgroundColor.match(/[\d.]+/g)
          ?.slice(0, 3)
          .map(Number);
        const colors = new Map<string, number>();
        let left = canvas.width,
          top = canvas.height,
          right = 0,
          bottom = 0,
          matched = 0;
        for (let y = 0; y < canvas.height; y++)
          for (let x = 0; x < canvas.width; x++) {
            const index = (y * canvas.width + x) * 4;
            const channels = [data[index], data[index + 1], data[index + 2]];
            if (data[index + 3] < 200) continue;
            // Colorful artwork is separated from neutral tile backgrounds and shadows.
            if (
              Math.max(...channels) - Math.min(...channels) > 40 &&
              (!background ||
                channels.some((channel, index) => Math.abs(channel - background[index]) > 12))
            ) {
              const key = channels.map((channel) => Math.floor(channel / 16)).join(',');
              colors.set(key, (colors.get(key) ?? 0) + 1);
            }
            if (
              color &&
              channels.every((channel, index) => Math.abs(channel - color[index]) <= 12)
            ) {
              matched++;
              left = Math.min(left, x);
              right = Math.max(right, x + 1);
              top = Math.min(top, y);
              bottom = Math.max(bottom, y + 1);
            }
          }
        return {
          dominant: [...colors].sort((a, b) => b[1] - a[1])[0]?.[0],
          palette: [...colors]
            .sort((a, b) => b[1] - a[1])
            .slice(0, 6)
            .map(([color]) => color),
          coverage: matched / (canvas.width * canvas.height),
          bounds: matched
            ? {
                left: left / canvas.width,
                top: top / canvas.height,
                right: right / canvas.width,
                bottom: bottom / canvas.height,
              }
            : undefined,
        };
      } finally {
        bitmap.close();
      }
    },
    { bytes, color },
  );
}
