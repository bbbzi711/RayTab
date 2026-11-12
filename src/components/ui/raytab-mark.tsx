import { cn } from '@/lib/utils';

export function RayTabMark({ className, label }: { className?: string; label?: string }) {
  return (
    <span
      role={label ? 'img' : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
      className={cn(
        'inline-block size-8 shrink-0 bg-current mask-[url(/icons/raytab.svg)] mask-contain mask-center mask-no-repeat',
        className,
      )}
    />
  );
}
