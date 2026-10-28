import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';

type ArtworkFit = { scale: number; x: number; y: number };
const MARK_FIT: ArtworkFit = { scale: 0.72, x: 0, y: 0 };
const TILE_FIT: ArtworkFit = { scale: 1, x: 0, y: 0 };
const SAMPLE_SIZE = 128;

function measureArtwork(image: HTMLImageElement): ArtworkFit | undefined {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = SAMPLE_SIZE;
  const context = canvas.getContext('2d', { willReadFrequently: true });
  if (!context || !image.naturalWidth || !image.naturalHeight) return;
  const ratio = Math.min(SAMPLE_SIZE / image.naturalWidth, SAMPLE_SIZE / image.naturalHeight);
  const width = image.naturalWidth * ratio;
  const height = image.naturalHeight * ratio;
  context.drawImage(image, (SAMPLE_SIZE - width) / 2, (SAMPLE_SIZE - height) / 2, width, height);
  const { data } = context.getImageData(0, 0, SAMPLE_SIZE, SAMPLE_SIZE);
  const alpha = (x: number, y: number) => data[(y * SAMPLE_SIZE + x) * 4 + 3];
  // Rounded app tiles keep their own backgrounds and fill the frame; do not double-pad them.
  if (
    [0.12, 0.5, 0.88].every((x) =>
      [0.12, 0.5, 0.88].every(
        (y) => alpha(Math.floor(x * SAMPLE_SIZE), Math.floor(y * SAMPLE_SIZE)) > 240,
      ),
    )
  )
    return TILE_FIT;
  let left = SAMPLE_SIZE;
  let top = SAMPLE_SIZE;
  let right = -1;
  let bottom = -1;
  let coverage = 0;
  for (let y = 0; y < SAMPLE_SIZE; y++) {
    for (let x = 0; x < SAMPLE_SIZE; x++) {
      const opacity = alpha(x, y);
      if (opacity <= 24) continue;
      left = Math.min(left, x);
      top = Math.min(top, y);
      right = Math.max(right, x);
      bottom = Math.max(bottom, y);
      coverage += opacity / 255;
    }
  }
  if (!coverage) return;
  // Balance visual weight while retaining at least 10% breathing room on every side.
  const extent = Math.max(right - left + 1, bottom - top + 1) / SAMPLE_SIZE;
  const scale = Math.min(4, 0.8 / extent, Math.sqrt((0.46 * SAMPLE_SIZE ** 2) / coverage));
  return {
    scale,
    x: (0.5 - (left + right + 1) / (2 * SAMPLE_SIZE)) * scale,
    y: (0.5 - (top + bottom + 1) / (2 * SAMPLE_SIZE)) * scale,
  };
}

/** Measure a small raster preview; the displayed and saved artwork stays in its original format. */
export function IconArtwork({
  children,
  identity,
  normalize,
  tile = false,
}: {
  children: ReactNode;
  identity: string;
  normalize: boolean;
  tile?: boolean;
}) {
  const element = useRef<HTMLSpanElement>(null);
  const [measured, setMeasured] = useState<{ identity: string; fit: ArtworkFit }>();
  useEffect(() => {
    if (!normalize || tile) return;
    const graphic = element.current?.querySelector('img, svg');
    if (!graphic) return;
    let active = true;
    let objectUrl: string | undefined;
    const measure = (image: HTMLImageElement) => {
      try {
        const fit = measureArtwork(image);
        if (active && fit) setMeasured({ identity, fit });
      } catch {
        // Measurement is optional presentation metadata; never replace unreadable artwork.
      }
    };
    let image: HTMLImageElement;
    if (graphic instanceof HTMLImageElement) {
      image = graphic;
    } else {
      // Serialized inline marks need an explicit namespace and current foreground color.
      const clone = graphic.cloneNode(true);
      if (!(clone instanceof SVGElement)) return;
      clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
      clone.setAttribute('color', getComputedStyle(graphic).color);
      clone.setAttribute('width', String(SAMPLE_SIZE));
      clone.setAttribute('height', String(SAMPLE_SIZE));
      objectUrl = URL.createObjectURL(
        new Blob([new XMLSerializer().serializeToString(clone)], { type: 'image/svg+xml' }),
      );
      image = new Image();
      image.src = objectUrl;
    }
    const onLoad = () => measure(image);
    image.addEventListener('load', onLoad);
    if (image.complete && image.naturalWidth) measure(image);
    return () => {
      active = false;
      image.removeEventListener('load', onLoad);
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [identity, normalize, tile]);
  const fit =
    !normalize || tile ? TILE_FIT : measured?.identity === identity ? measured.fit : MARK_FIT;
  return (
    <span
      ref={element}
      className="icon-artwork"
      style={
        {
          '--artwork-scale': fit.scale,
          '--artwork-x': `${fit.x * 100}%`,
          '--artwork-y': `${fit.y * 100}%`,
        } as CSSProperties
      }
    >
      {children}
    </span>
  );
}
