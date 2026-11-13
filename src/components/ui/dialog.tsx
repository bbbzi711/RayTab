import * as React from 'react';
import { cn } from 'cn';
import { XIcon } from 'lucide-react';
import { Dialog as DialogPrimitive } from 'radix-ui';
import { useTranslation } from 'react-i18next';

import { Button } from '@/components/ui/button';

const dialogOverlayClass =
  'fixed inset-0 z-50 bg-slate-950/45 backdrop-blur-[6px] data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:animate-in data-[state=open]:fade-in-0';

const dialogSurfaceClass =
  'fixed z-50 rounded-xl border border-border bg-background text-foreground shadow-[var(--dialog-shadow)] outline-none';

const centeredDialogClass = cn(
  dialogSurfaceClass,
  'top-1/2 left-[calc(50%+var(--dialog-center-offset))] grid max-h-[calc(100dvh-32px)] -translate-x-1/2 -translate-y-1/2 gap-4 overflow-x-hidden overflow-y-auto duration-200 *:min-w-0 *:max-w-full',
  'data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95 data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95',
);
const dialogLayoutClass =
  'w-[calc(100%-2rem)] px-7.5 py-7 sm:max-w-lg max-[480px]:px-5 max-[480px]:py-5.5 max-[380px]:px-4 max-[380px]:py-4.5 [@media(max-height:480px)]:max-h-[calc(100dvh-20px)] [@media(max-height:480px)]:py-4';
const dialogTitleClass = 'min-w-0 wrap-anywhere text-lg font-semibold tracking-tight';
const dialogDescriptionClass = 'min-w-0 wrap-anywhere text-sm text-muted-foreground';

function Dialog({ ...props }: React.ComponentProps<typeof DialogPrimitive.Root>) {
  return <DialogPrimitive.Root data-slot="dialog" {...props} />;
}

function DialogTrigger({ ...props }: React.ComponentProps<typeof DialogPrimitive.Trigger>) {
  return <DialogPrimitive.Trigger data-slot="dialog-trigger" {...props} />;
}

function DialogPortal({ ...props }: React.ComponentProps<typeof DialogPrimitive.Portal>) {
  return <DialogPrimitive.Portal data-slot="dialog-portal" {...props} />;
}

function DialogClose({ ...props }: React.ComponentProps<typeof DialogPrimitive.Close>) {
  return <DialogPrimitive.Close data-slot="dialog-close" {...props} />;
}

function DialogOverlay({
  className,
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Overlay>) {
  return (
    <DialogPrimitive.Overlay
      data-slot="dialog-overlay"
      className={cn(dialogOverlayClass, className)}
      {...props}
    />
  );
}

function DialogContent({
  className,
  children,
  showCloseButton = true,
  closeLabel,
  overlayClassName,
  variant = 'center',
  layout = 'default',
  onInteractOutside,
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Content> & {
  showCloseButton?: boolean;
  closeLabel?: string;
  overlayClassName?: string;
  variant?: 'center' | 'workspace' | 'drawer';
  layout?: 'default' | 'custom';
}) {
  const { t } = useTranslation();
  const label = closeLabel ?? t('messages.close');
  const closeButton = showCloseButton && (
    <DialogPrimitive.Close asChild>
      <Button
        data-slot="dialog-close"
        type="button"
        variant="ghost"
        size="icon"
        className="dialog-close-button absolute top-4 right-4"
        aria-label={label}
      >
        <XIcon aria-hidden="true" />
      </Button>
    </DialogPrimitive.Close>
  );
  return (
    <DialogPortal data-slot="dialog-portal">
      <DialogOverlay
        className={cn(
          variant === 'drawer'
            ? 'bg-transparent backdrop-blur-none'
            : variant === 'workspace'
              ? 'bg-slate-950/24 backdrop-blur-xs'
              : undefined,
          overlayClassName,
        )}
      />
      <DialogPrimitive.Content
        data-slot="dialog-content"
        className={cn(
          variant === 'center'
            ? cn(centeredDialogClass, layout === 'default' && dialogLayoutClass)
            : cn(dialogSurfaceClass, variant === 'workspace' && 'ray-workspace'),
          className,
        )}
        {...props}
        onInteractOutside={(event) => {
          if (event.target instanceof Element && event.target.closest('[data-sonner-toaster]')) {
            event.preventDefault();
            return;
          }
          onInteractOutside?.(event);
        }}
      >
        {children}
        {closeButton}
      </DialogPrimitive.Content>
    </DialogPortal>
  );
}

function DialogHeader({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      data-slot="dialog-header"
      className={cn('flex flex-col gap-2 text-center sm:text-left', className)}
      {...props}
    />
  );
}

function DialogFooter({
  className,
  showCloseButton = false,
  children,
  ...props
}: React.ComponentProps<'div'> & {
  showCloseButton?: boolean;
}) {
  const { t } = useTranslation();
  return (
    <div
      data-slot="dialog-footer"
      className={cn('flex flex-col-reverse gap-2 sm:flex-row sm:justify-end', className)}
      {...props}
    >
      {children}
      {showCloseButton && (
        <DialogPrimitive.Close asChild>
          <Button variant="outline">{t('messages.close')}</Button>
        </DialogPrimitive.Close>
      )}
    </div>
  );
}

function DialogTitle({ className, ...props }: React.ComponentProps<typeof DialogPrimitive.Title>) {
  return (
    <DialogPrimitive.Title
      data-slot="dialog-title"
      className={cn(dialogTitleClass, className)}
      {...props}
    />
  );
}

function DialogDescription({
  className,
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Description>) {
  return (
    <DialogPrimitive.Description
      data-slot="dialog-description"
      className={cn(dialogDescriptionClass, className)}
      {...props}
    />
  );
}

export {
  centeredDialogClass,
  dialogDescriptionClass,
  dialogLayoutClass,
  dialogOverlayClass,
  dialogTitleClass,
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogOverlay,
  DialogPortal,
  DialogTitle,
  DialogTrigger,
};
