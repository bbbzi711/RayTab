import { useEffect, useState, type CSSProperties } from 'react';
import { IconFrame } from '@/components/ui/icon-frame';
import { useResourceUrl } from '@/hooks/useResourceUrl';
import type { Site } from '@/storage/model';
import { getBrandAppearance } from './brandIcons';
import { cn } from '@/lib/utils';

type SiteIconSource = Pick<Site, 'title' | 'url' | 'icon' | 'iconBackground'>;

export function SiteIcon({
  site,
  previewUrl,
  size = 'site',
  interactive = false,
  radius,
}: {
  site: SiteIconSource;
  previewUrl?: string;
  size?: 'site' | 'preview';
  interactive?: boolean;
  radius?: number;
}) {
  const brand = site.icon.source === 'auto' ? getBrandAppearance(site.url) : null;
  const resourceId = 'resourceId' in site.icon ? site.icon.resourceId : undefined;
  const resourceUrl = useResourceUrl(resourceId);
  const imageUrl =
    site.icon.source === 'text'
      ? undefined
      : (previewUrl ?? (resourceId ? resourceUrl : undefined));
  const [failedUrl, setFailedUrl] = useState<string>();
  useEffect(() => setFailedUrl(undefined), [imageUrl]);
  const hasImage = Boolean(imageUrl && failedUrl !== imageUrl);
  const graphic = site.icon.source === 'auto' ? brand?.graphic : undefined;
  const background =
    site.iconBackground.mode === 'color'
      ? site.iconBackground.color
      : (brand?.background ?? (hasImage ? 'var(--icon-image-surface)' : 'var(--preferences-icon)'));
  const contrastColor = readableTextColor(background);
  const foreground =
    site.iconBackground.mode === 'color'
      ? contrastColor === '#ffffff'
        ? contrastColor
        : (brand?.contrastColor ?? contrastColor)
      : (brand?.foreground ?? '#ffffff');
  return (
    <IconFrame
      size={size}
      image={hasImage}
      interactive={interactive}
      className={cn(
        'site-icon-frame',
        !hasImage && Boolean(graphic) && !brand?.tile && 'site-icon-frame--brand',
        site.icon.source === 'text' && 'site-icon-frame--text',
      )}
      style={{
        background,
        color: foreground,
        borderRadius: radius === undefined ? 'var(--site-icon-radius, 24%)' : `${radius}%`,
      }}
    >
      {hasImage ? (
        <img
          src={imageUrl}
          alt=""
          className="icon-frame__image"
          draggable={false}
          onLoad={(event) => {
            const image = event.currentTarget;
            if (
              !previewUrl &&
              site.icon.source === 'auto' &&
              Math.min(image.naturalWidth, image.naturalHeight) < 32
            )
              setFailedUrl(imageUrl);
          }}
          onError={() => setFailedUrl(imageUrl)}
        />
      ) : (
        ((foreground === '#ffffff' ? (brand?.darkGraphic ?? graphic) : graphic) ?? (
          <span
            className="icon-frame__letter"
            style={
              site.icon.source === 'text'
                ? ({ '--icon-text-length': Array.from(site.icon.text).length } as CSSProperties)
                : undefined
            }
          >
            {site.icon.source === 'text'
              ? site.icon.text
              : (Array.from(site.title.trim())[0]?.toUpperCase() ?? '')}
          </span>
        ))
      )}
    </IconFrame>
  );
}

function readableTextColor(color: string) {
  const hex = color.match(/^#([\da-f]{6})$/i)?.[1];
  if (!hex) return '#ffffff';
  const [red, green, blue] = [0, 2, 4].map((index) =>
    Number.parseInt(hex.slice(index, index + 2), 16),
  );
  return red * 0.299 + green * 0.587 + blue * 0.114 > 168 ? '#202124' : '#ffffff';
}
