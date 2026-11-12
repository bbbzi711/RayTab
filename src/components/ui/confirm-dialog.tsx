import * as React from 'react';
import { cn } from 'cn';
import { AlertDialog } from 'radix-ui';
import { useTranslation } from 'react-i18next';

import { Button } from '@/components/ui/button';
import {
  centeredDialogClass,
  dialogDescriptionClass,
  dialogLayoutClass,
  dialogOverlayClass,
  dialogTitleClass,
  DialogFooter,
  DialogHeader,
} from '@/components/ui/dialog';

export interface ConfirmOptions {
  title: string;
  description?: string;
  confirmText?: string;
  cancelText?: string;
  variant?: 'default' | 'destructive';
}

interface ConfirmState extends ConfirmOptions {
  resolve: (value: boolean) => void;
}

/**
 * Hook that returns an imperative `confirm()` function and a `ConfirmDialog` node.
 *
 * Usage:
 * ```tsx
 * const [confirm, ConfirmDialog] = useConfirm();
 *
 * const handleDelete = async () => {
 *   if (!(await confirm({ title: '确定删除？', variant: 'destructive' }))) return;
 *   // proceed with deletion
 * };
 *
 * return <>{ConfirmDialog}<button onClick={handleDelete}>删除</button></>;
 * ```
 */
export function useConfirm(): [(options: ConfirmOptions) => Promise<boolean>, React.ReactNode] {
  const { t } = useTranslation();
  const [state, setState] = React.useState<ConfirmState | null>(null);

  const confirm = React.useCallback((options: ConfirmOptions): Promise<boolean> => {
    return new Promise<boolean>((resolve) => {
      setState({ ...options, resolve });
    });
  }, []);

  const respond = (value: boolean) => {
    state?.resolve(value);
    setState(null);
  };

  const dialog = state ? (
    <AlertDialog.Root
      open
      onOpenChange={(open) => {
        if (!open) respond(false);
      }}
    >
      <AlertDialog.Portal data-slot="dialog-portal">
        <AlertDialog.Overlay data-slot="dialog-overlay" className={dialogOverlayClass} />
        <AlertDialog.Content
          data-slot="dialog-content"
          className={cn(centeredDialogClass, dialogLayoutClass, 'sm:max-w-md')}
        >
          <DialogHeader>
            <AlertDialog.Title data-slot="dialog-title" className={dialogTitleClass}>
              {state.title}
            </AlertDialog.Title>
            {state.description && (
              <AlertDialog.Description
                data-slot="dialog-description"
                className={cn(dialogDescriptionClass, 'leading-relaxed whitespace-pre-line')}
              >
                {state.description}
              </AlertDialog.Description>
            )}
          </DialogHeader>
          <DialogFooter className="mt-2">
            <AlertDialog.Cancel asChild>
              <Button
                type="button"
                variant="outline"
                className="cursor-pointer px-4"
                onClick={() => respond(false)}
              >
                {state.cancelText ?? t('messages.cancel')}
              </Button>
            </AlertDialog.Cancel>
            <AlertDialog.Action asChild>
              <Button
                type="button"
                variant={state.variant ?? 'default'}
                className="cursor-pointer px-4"
                onClick={() => respond(true)}
              >
                {state.confirmText ?? t('messages.confirm')}
              </Button>
            </AlertDialog.Action>
          </DialogFooter>
        </AlertDialog.Content>
      </AlertDialog.Portal>
    </AlertDialog.Root>
  ) : null;

  return [confirm, dialog];
}
