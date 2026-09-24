import * as React from 'react';
import { cn } from 'cn';
import { AlertDialog } from 'radix-ui';

import { Button } from '@/components/ui/button';

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
        <AlertDialog.Overlay
          data-slot="dialog-overlay"
          className={cn(
            'fixed inset-0 z-50 bg-slate-950/45 backdrop-blur-[6px]',
            'data-[state=closed]:animate-out data-[state=closed]:fade-out-0',
            'data-[state=open]:animate-in data-[state=open]:fade-in-0',
          )}
        />
        <AlertDialog.Content
          data-slot="dialog-content"
          className={cn(
            'ray-dialog fixed top-[50%] left-[50%] z-50 grid w-full max-w-[calc(100%-2rem)] gap-4 outline-none duration-200',
            'data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95',
            'data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95',
            'sm:max-w-md',
          )}
        >
          <div className="flex flex-col gap-2 text-center sm:text-left">
            <AlertDialog.Title
              data-slot="dialog-title"
              className="text-lg leading-none font-semibold text-foreground"
            >
              {state.title}
            </AlertDialog.Title>
            {state.description && (
              <AlertDialog.Description
                data-slot="dialog-description"
                className="text-sm text-muted-foreground whitespace-pre-line leading-relaxed"
              >
                {state.description}
              </AlertDialog.Description>
            )}
          </div>
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end mt-2">
            <AlertDialog.Cancel asChild>
              <Button
                type="button"
                variant="outline"
                className="cursor-pointer rounded-xl px-4"
                onClick={() => respond(false)}
              >
                {state.cancelText ?? '取消'}
              </Button>
            </AlertDialog.Cancel>
            <AlertDialog.Action asChild>
              <Button
                type="button"
                variant={state.variant ?? 'default'}
                className="cursor-pointer rounded-xl px-4"
                onClick={() => respond(true)}
              >
                {state.confirmText ?? '确定'}
              </Button>
            </AlertDialog.Action>
          </div>
        </AlertDialog.Content>
      </AlertDialog.Portal>
    </AlertDialog.Root>
  ) : null;

  return [confirm, dialog];
}
