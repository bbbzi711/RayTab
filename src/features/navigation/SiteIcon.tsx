import { useEffect, useState } from 'react';
import { IconFrame } from '@/components/ui/icon-frame';
import { useResourceUrl } from '@/hooks/useResourceUrl';
import { getBrandIcon } from './brandIcons';

type SiteIconSource = {
  title: string;
  url: string;
  color: string;
  iconId?: string;
};

export function SiteIcon({
  site,
  previewUrl,
  size = 'site',
  interactive = false,
}: {
  site: SiteIconSource;
  previewUrl?: string;
  size?: 'site' | 'preview';
  interactive?: boolean;
}) {
  const resourceUrl = useResourceUrl(site.iconId);
  const imageUrl = previewUrl ?? resourceUrl;
  const [imageFailed, setImageFailed] = useState(false);
  useEffect(() => setImageFailed(false), [imageUrl]);
  const brandIcon = getBrandIcon(site.url, site.title);
  const hasImage = Boolean(imageUrl && !imageFailed);
  const hasGraphic = hasImage || Boolean(brandIcon);

  return (
    <IconFrame
      size={size}
      image={hasImage}
      interactive={interactive}
      className="site-icon-frame"
      style={{
        background: hasGraphic ? 'var(--icon-brand-surface)' : site.color,
        color: hasGraphic ? 'var(--icon-brand-foreground)' : readableTextColor(site.color),
      }}
    >
      {hasImage ? (
        <img
          src={imageUrl}
          alt=""
          className="icon-frame__image"
          onError={() => setImageFailed(true)}
        />
      ) : brandIcon ? (
        brandIcon
      ) : (
        <span className="icon-frame__letter">{site.title.trim().slice(0, 1).toUpperCase()}</span>
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
  return red * 0.299 + green * 0.587 + blue * 0.114 > 168 ? '#243b34' : '#ffffff';
}
