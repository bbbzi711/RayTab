import type { CSSProperties, ReactNode } from 'react';
import { cn } from '@/lib/utils';

type IconFrameSize = 'search' | 'site' | 'preview';

export function IconFrame({
  children,
  size,
  image = false,
  interactive = false,
  className,
  style,
}: {
  children: ReactNode;
  size: IconFrameSize;
  image?: boolean;
  interactive?: boolean;
  className?: string;
  style?: CSSProperties;
}) {
  return (
    <span
      className={cn(
        'icon-frame',
        `icon-frame--${size}`,
        image && 'icon-frame--image',
        interactive && 'icon-frame--interactive',
        className,
      )}
      style={style}
      aria-hidden="true"
    >
      <span className="icon-frame__content">{children}</span>
    </span>
  );
}
