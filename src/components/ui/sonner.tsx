import { createPortal } from 'react-dom';
import { Toaster as Sonner, type ToasterProps } from 'sonner';
import { cn } from '@/lib/utils';

export function Toaster({ className, ...props }: ToasterProps) {
  return createPortal(
    <Sonner
      richColors
      position="top-center"
      {...props}
      className={cn('pointer-events-auto', className)}
    />,
    document.body,
  );
}
