import { useId, type Ref } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { useConfirm } from '@/components/ui/confirm-dialog';
import { errorMessage } from '@/lib/errors';
import type { Group, Folder } from '@/storage/model';
import { destinationSchema, nameSchema, type Destination } from './navigation-form-schemas';

export function DestinationSelect({
  groups,
  folders,
  value,
  onChange,
  onBlur,
  name,
  inputRef,
  disabled,
  id,
}: {
  groups: Group[];
  folders: Folder[];
  value: Destination;
  onChange: (value: Destination) => void;
  onBlur?: () => void;
  name?: string;
  inputRef?: Ref<HTMLSelectElement>;
  disabled?: boolean;
  id?: string;
}) {
  const { t } = useTranslation();
  const destinations = groups.flatMap((group) => [
    { groupId: group.id, folderId: null },
    ...folders
      .filter((folder) => folder.groupId === group.id)
      .map((folder) => ({ groupId: group.id, folderId: folder.id })),
  ]);
  return (
    <Select
      id={id}
      ref={inputRef}
      name={name}
      value={JSON.stringify(value)}
      onBlur={onBlur}
      disabled={disabled || !groups.length}
      onChange={(event) => {
        const selected = destinations.find((item) => JSON.stringify(item) === event.target.value);
        if (selected) onChange(selected);
      }}
    >
      {groups.map((group) => (
        <optgroup key={group.id} label={group.name}>
          <option value={JSON.stringify({ groupId: group.id, folderId: null })}>
            {group.name}
          </option>
          {folders
            .filter((folder) => folder.groupId === group.id)
            .sort((a, b) => a.order - b.order)
            .map((folder) => (
              <option
                key={folder.id}
                value={JSON.stringify({ groupId: group.id, folderId: folder.id })}
              >
                {group.name} / {folder.name}
              </option>
            ))}
        </optgroup>
      ))}
    </Select>
  );
}

export interface NameDialogProps {
  title: string;
  initialName?: string;
  onSave: (name: string) => Promise<void>;
  onClose: () => void;
}

export function NameDialog({ title, initialName = '', onSave, onClose }: NameDialogProps) {
  const { t } = useTranslation();
  const id = useId();
  const [confirm, confirmDialog] = useConfirm();
  const { register, handleSubmit, setError, formState } = useForm<z.infer<typeof nameSchema>>({
    resolver: zodResolver(nameSchema),
    defaultValues: { name: initialName },
  });
  const { isSubmitting, isDirty, errors } = formState;
  const requestClose = async () => {
    if (isSubmitting) return;
    if (
      isDirty &&
      !(await confirm({
        title: t('messages.discardUnsavedChanges'),
        description: t('messages.yourChangesWillNotBeSaved'),
        confirmText: t('messages.discardChanges'),
        cancelText: t('messages.keepEditing'),
        variant: 'destructive',
      }))
    )
      return;
    onClose();
  };
  return (
    <Dialog open onOpenChange={(open) => !open && void requestClose()}>
      <DialogContent
        closeLabel={t('messages.close')}
        showCloseButton={!isSubmitting}
        aria-describedby={undefined}
      >
        <form
          onSubmit={handleSubmit(async ({ name }) => {
            try {
              await onSave(name);
              toast.success(t('navigation.saved'));
              onClose();
            } catch (reason) {
              setError('root', { message: errorMessage(reason) });
            }
          })}
          className="form-stack"
          noValidate
        >
          <DialogHeader>
            <DialogTitle>{title}</DialogTitle>
          </DialogHeader>
          <label htmlFor={id}>{t('messages.name')}</label>
          <Input
            id={id}
            {...register('name')}
            aria-invalid={Boolean(errors.name)}
            aria-describedby={errors.name ? `${id}-error` : undefined}
            autoFocus
            disabled={isSubmitting}
          />
          {errors.name && (
            <p id={`${id}-error`} className="form-error" role="alert">
              {t(errors.name.message!)}
            </p>
          )}
          {errors.root && (
            <p className="form-error" role="alert">
              {errors.root.message}
            </p>
          )}
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => void requestClose()}
              disabled={isSubmitting}
            >
              {t('messages.cancel')}
            </Button>
            <Button type="submit" disabled={isSubmitting}>
              {t('messages.save')}
            </Button>
          </DialogFooter>
        </form>
        {confirmDialog}
      </DialogContent>
    </Dialog>
  );
}

export interface MoveDialogProps {
  groups: Group[];
  folders: Folder[];
  initialGroupId: string;
  allowFolders?: boolean;
  excludeGroupId?: string;
  title: string;
  description?: string;
  confirmLabel?: string;
  destructive?: boolean;
  onMove: (groupId: string, folderId: string | null) => Promise<void>;
  onClose: () => void;
}

export function MoveDialog({
  groups,
  folders,
  initialGroupId,
  allowFolders = true,
  excludeGroupId,
  title,
  description,
  confirmLabel,
  destructive = false,
  onMove,
  onClose,
}: MoveDialogProps) {
  const { t } = useTranslation();
  const id = useId();
  const validGroups = groups
    .filter((group) => group.id !== excludeGroupId)
    .sort((a, b) => a.order - b.order);
  const schema = z.object({
    location: destinationSchema.refine(
      (value) =>
        validGroups.some((group) => group.id === value.groupId) &&
        (value.folderId === null ||
          (allowFolders &&
            folders.some(
              (folder) => folder.id === value.folderId && folder.groupId === value.groupId,
            ))),
      'navigation.chooseLocation',
    ),
  });
  const { control, handleSubmit, setError, formState } = useForm<z.infer<typeof schema>>({
    resolver: zodResolver(schema),
    defaultValues: {
      location: {
        groupId:
          validGroups.find((group) => group.id === initialGroupId)?.id ?? validGroups[0]?.id ?? '',
        folderId: null,
      },
    },
  });
  const { isSubmitting, errors } = formState;
  const [confirm, confirmDialog] = useConfirm();
  const requestClose = async () => {
    if (isSubmitting) return;
    if (
      formState.isDirty &&
      !(await confirm({
        title: t('messages.discardUnsavedChanges'),
        description: t('messages.yourChangesWillNotBeSaved'),
        confirmText: t('messages.discardChanges'),
        cancelText: t('messages.keepEditing'),
        variant: 'destructive',
      }))
    )
      return;
    onClose();
  };
  return (
    <Dialog open onOpenChange={(open) => !open && void requestClose()}>
      <DialogContent
        closeLabel={t('messages.close')}
        showCloseButton={!isSubmitting}
        {...(!description ? { 'aria-describedby': undefined } : {})}
      >
        <form
          onSubmit={handleSubmit(async ({ location }) => {
            try {
              await onMove(location.groupId, location.folderId);
              toast.success(t(destructive ? 'messages.deleted' : 'navigation.moved'));
              onClose();
            } catch (reason) {
              setError('root', { message: errorMessage(reason) });
            }
          })}
          className="form-stack"
          noValidate
        >
          <DialogHeader>
            <DialogTitle>{title}</DialogTitle>
            {description && <DialogDescription>{description}</DialogDescription>}
          </DialogHeader>
          <label htmlFor={id}>{t('messages.saveTo')}</label>
          <Controller
            control={control}
            name="location"
            render={({ field }) => (
              <DestinationSelect
                id={id}
                groups={validGroups}
                folders={allowFolders ? folders : []}
                value={field.value}
                onChange={field.onChange}
                onBlur={field.onBlur}
                name={field.name}
                inputRef={field.ref}
                disabled={isSubmitting}
              />
            )}
          />
          {errors.location && (
            <p className="form-error" role="alert">
              {t('navigation.chooseLocation')}
            </p>
          )}
          {errors.root && (
            <p className="form-error" role="alert">
              {errors.root.message}
            </p>
          )}
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => void requestClose()}
              disabled={isSubmitting}
            >
              {t('messages.cancel')}
            </Button>
            <Button
              type="submit"
              variant={destructive ? 'destructive' : 'default'}
              disabled={isSubmitting || !validGroups.length}
            >
              {confirmLabel ?? t('messages.save')}
            </Button>
          </DialogFooter>
        </form>
        {confirmDialog}
      </DialogContent>
    </Dialog>
  );
}
