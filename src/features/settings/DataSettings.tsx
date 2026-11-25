import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { Controller, useForm, useWatch } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from '@/lib/zod';
import { useTranslation } from 'react-i18next';
import { listGroupTabs } from '@/storage/group-privacy';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useConfirm } from '@/components/ui/confirm-dialog';
import {
  backupSummary,
  createBackup,
  encodeBackup,
  parseBackup,
  restoreBackup,
  restoreRange,
  type BackupDocument,
} from '@/features/backup/backup';
import {
  deduplicateBookmarks,
  parseBookmarkHtml,
  readBrowserBookmarks,
} from '@/features/import/bookmarks';
import { useRayTabStore } from '@/storage/store';
import { repository } from '@/storage/repository';
import { errorMessage } from '@/lib/errors';
import {
  FormError,
  SettingsFilePicker,
  SettingsSection,
  SettingsSelect,
  useDraftStatus,
  type DraftReporter,
} from './SettingsControls';
import './data-settings.css';

const fileListSchema = z.custom<FileList>(
  (value) => typeof FileList !== 'undefined' && value instanceof FileList,
);
const candidateSchema = z.object({
  title: z.string(),
  url: z.string(),
  folder: z.string().optional(),
  path: z.array(z.string()),
});
export const bookmarkImportSchema = z
  .object({
    action: z.enum(['preview', 'import']),
    source: z.enum(['browser', 'file']),
    file: fileListSchema.optional(),
    items: z.array(candidateSchema),
    duplicateMode: z.enum(['skip-url', 'keep-all']),
    organizeMode: z.enum(['folders', 'flat']),
    groupId: z.string().min(1, 'settings.required'),
  })
  .superRefine((value, ctx) => {
    if (value.action === 'preview' && value.source === 'file' && !value.file?.length)
      ctx.addIssue({ code: 'custom', path: ['file'], message: 'settings.chooseBookmarkFile' });
    if (value.action === 'import' && !value.items.length)
      ctx.addIssue({ code: 'custom', path: ['items'], message: 'settings.noBookmarks' });
  });
const restoreSchema = z
  .object({
    action: z.enum(['preview', 'restore']),
    file: fileListSchema.optional(),
    document: z.custom<BackupDocument>().optional(),
    mode: z.enum(['merge', 'replace']),
    password: z.string(),
  })
  .superRefine((value, ctx) => {
    if (value.action === 'preview' && !value.file?.length)
      ctx.addIssue({ code: 'custom', path: ['file'], message: 'settings.chooseBackupFile' });
    if (value.action === 'restore' && !value.document)
      ctx.addIssue({ code: 'custom', path: ['document'], message: 'settings.chooseBackupFile' });
    if (value.action === 'restore' && value.document?.spaces.private?.protected && !value.password)
      ctx.addIssue({ code: 'custom', path: ['password'], message: 'settings.required' });
  });
export const backupExportSchema = z.object({
  range: z.enum(['normal', 'private', 'all']),
  password: z.string(),
});

function usePrivateLockReset(reset: () => void, enabled = true) {
  const version = useRef(0);
  const resetLatest = useRef(reset);
  resetLatest.current = reset;
  useEffect(() => {
    if (enabled && useRayTabStore.getState().state?.privateSecurity.locked) resetLatest.current();
    const unsubscribe = useRayTabStore.subscribe((store, previous) => {
      if (
        enabled &&
        store.state?.privateSecurity.locked &&
        !previous.state?.privateSecurity.locked
      ) {
        version.current += 1;
        resetLatest.current();
      }
    });
    return () => {
      version.current += 1;
      unsubscribe();
      resetLatest.current();
    };
  }, [enabled]);
  return () => {
    const startedAt = version.current;
    return () => startedAt === version.current;
  };
}

export function DataSettings({
  report,
  disabled,
  cloudRestore,
}: {
  report: DraftReporter;
  disabled: boolean;
  cloudRestore: { available: boolean; run: () => void; hint?: string };
}) {
  const { t } = useTranslation();
  const protectedPrivate = useRayTabStore((store) => store.state?.privateSecurity.protected);
  const exportFormId = useId();
  const [task, setTask] = useState<'export' | 'restore'>();
  const [showLocalRestore, setShowLocalRestore] = useState(false);
  return (
    <SettingsSection>
      <div className="data-settings min-w-0">
        <div className="flex flex-wrap items-center justify-between gap-2 py-1">
          <h3 className="min-w-0 text-sm font-semibold">{t('settings.backupActionsTitle')}</h3>
          <div className="settings-form-actions">
            <Button
              type={protectedPrivate ? 'button' : 'submit'}
              form={protectedPrivate ? undefined : exportFormId}
              size="form-action"
              variant={protectedPrivate && task === 'export' ? 'secondary' : 'outline'}
              aria-expanded={protectedPrivate ? task === 'export' : undefined}
              aria-controls={protectedPrivate ? 'backup-task-export' : undefined}
              disabled={disabled}
              onClick={() => setTask(protectedPrivate && task === 'export' ? undefined : 'export')}
            >
              {t('settings.exportAction')}
            </Button>
            <Button
              type="button"
              size="form-action"
              variant={task === 'restore' ? 'secondary' : 'outline'}
              aria-expanded={task === 'restore'}
              aria-controls="backup-task-restore"
              disabled={disabled}
              onClick={() => setTask(task === 'restore' ? undefined : 'restore')}
            >
              {t('settings.restoreAction')}
            </Button>
          </div>
        </div>
        <div id="backup-task-export" hidden={task !== 'export'}>
          <BackupExport formId={exportFormId} report={report} />
        </div>
        <div id="backup-task-restore" className="pt-3" hidden={task !== 'restore'}>
          <fieldset className="min-w-0" disabled={disabled}>
            <legend className="mb-2 text-sm">{t('settings.restoreSource')}</legend>
            <div className="settings-form-actions">
              <Button
                type="button"
                size="form-action"
                variant={showLocalRestore ? 'secondary' : 'outline'}
                aria-expanded={showLocalRestore}
                aria-controls="backup-local-restore"
                onClick={() => setShowLocalRestore(!showLocalRestore)}
              >
                {t('settings.localFile')}
              </Button>
              <Button
                type="button"
                size="form-action"
                variant="outline"
                disabled={!cloudRestore.available}
                onClick={() => {
                  setShowLocalRestore(false);
                  cloudRestore.run();
                }}
              >
                {t('settings.cloudBackup')}
              </Button>
            </div>
            {cloudRestore.hint && (
              <p className="mt-2 text-xs text-muted-foreground">{cloudRestore.hint}</p>
            )}
          </fieldset>
          <div id="backup-local-restore" hidden={!showLocalRestore} className="pt-3">
            <BackupRestore report={report} />
          </div>
        </div>
      </div>
    </SettingsSection>
  );
}

export function BookmarkImport({ groupId, report }: { groupId?: string; report: DraftReporter }) {
  const { t } = useTranslation();
  const dispatch = useRayTabStore((store) => store.dispatch);
  const state = useRayTabStore((store) => store.state)!;
  const groups = useMemo(
    () => listGroupTabs(state).filter((group) => !group.encrypted || !state.privateSecurity.locked),
    [state],
  );
  const selectedGroup = groupId ?? state.local.activeGroup[state.local.activeSpace];
  const activeGroup = groups.find((group) => group.id === selectedGroup)?.id ?? groups[0]?.id ?? '';
  const defaults = {
    action: 'preview' as const,
    source: 'file' as const,
    file: undefined,
    items: [],
    duplicateMode: 'skip-url' as const,
    organizeMode: 'flat' as const,
    groupId: activeGroup,
  };
  const form = useForm<z.infer<typeof bookmarkImportSchema>>({
    resolver: zodResolver(bookmarkImportSchema),
    defaultValues: defaults,
  });
  const { isSubmitting, errors } = form.formState;
  const [items, duplicateMode, organizeMode, file, targetId] = useWatch({
    control: form.control,
    name: ['items', 'duplicateMode', 'organizeMode', 'file', 'groupId'],
  });
  useDraftStatus('bookmark-import', Boolean(file?.length || items.length), isSubmitting, report);
  const target = groups.find((group) => group.id === targetId);
  const targetSites = target && state.spaces[target.spaceId].sites;
  const candidates = useMemo(
    () =>
      deduplicateBookmarks(
        organizeMode === 'flat' ? items.map(({ folder, ...item }) => item) : items,
        targetSites?.filter((site) => site.groupId === targetId).map((site) => site.url) ?? [],
        duplicateMode,
      ),
    [items, organizeMode, duplicateMode, targetSites, targetId],
  );
  function clearImport() {
    form.resetField('file');
    form.reset(defaults);
  }
  const operationBoundary = usePrivateLockReset(clearImport);
  const submit = form.handleSubmit(async (values) => {
    const isCurrent = operationBoundary();
    try {
      if (values.action === 'preview') {
        const parsed =
          values.source === 'browser'
            ? await readBrowserBookmarks()
            : parseBookmarkHtml(await values.file![0].text());
        if (!isCurrent()) return;
        form.setValue('items', parsed, { shouldDirty: true });
        form.clearErrors();
        return;
      }
      if (!target || target.id !== values.groupId) {
        form.setError('groupId', { message: 'navigation.chooseLocation' });
        return;
      }
      await dispatch({
        type: 'import-bookmarks',
        spaceId: target.spaceId,
        groupId: values.groupId,
        items: candidates,
      });
      if (!isCurrent()) return;
      clearImport();
      toast.success(t('settings.bookmarksImported', { count: candidates.length }));
    } catch (reason) {
      if (isCurrent()) form.setError('root', { message: errorMessage(reason) });
    }
  });
  return (
    <form className="settings-form grid min-w-0 gap-3.5 text-sm" noValidate onSubmit={submit}>
      <SettingsFilePicker
        label={t('settings.bookmarkFile')}
        hint={t('settings.dataTasks.bookmarkFileHint')}
        file={file}
        accept="text/html,.html"
        registration={form.register('file', {
          onChange: () => form.setValue('items', [], { shouldDirty: true }),
        })}
        disabled={isSubmitting}
        invalid={Boolean(errors.file)}
      />
      <FormError error={errors.file} />
      <div className="data-form-actions">
        <Button
          type="submit"
          size="sm"
          disabled={isSubmitting}
          onClick={() => {
            form.setValue('source', 'file');
            form.setValue('action', 'preview');
          }}
        >
          {t('settings.previewFile')}
        </Button>
        <Button
          type="submit"
          variant="outline"
          size="sm"
          disabled={isSubmitting || typeof browser === 'undefined' || !browser.permissions?.request}
          onClick={() => {
            form.setValue('source', 'browser');
            form.setValue('action', 'preview');
          }}
        >
          {t('settings.readBookmarks')}
        </Button>
      </div>
      {items.length > 0 && (
        <div className="data-preview">
          <div className="data-preview-options">
            <Controller
              control={form.control}
              name="organizeMode"
              render={({ field }) => (
                <SettingsSelect
                  triggerClassName="w-full max-w-full"
                  label={t('settings.organize')}
                  value={field.value}
                  options={[
                    ['flat', t('settings.flat')],
                    ['folders', t('settings.keepFolders')],
                  ]}
                  onChange={field.onChange}
                  disabled={isSubmitting}
                />
              )}
            />
            <Controller
              control={form.control}
              name="duplicateMode"
              render={({ field }) => (
                <SettingsSelect
                  triggerClassName="w-full max-w-full"
                  label={t('settings.duplicates')}
                  value={field.value}
                  options={[
                    ['skip-url', t('settings.skipDuplicates')],
                    ['keep-all', t('settings.keepAll')],
                  ]}
                  onChange={field.onChange}
                  disabled={isSubmitting}
                />
              )}
            />
            <Controller
              control={form.control}
              name="groupId"
              render={({ field }) => (
                <SettingsSelect
                  triggerClassName="w-full max-w-full"
                  label={t('settings.targetGroup')}
                  value={field.value}
                  options={groups.map((group) => [group.id, group.name])}
                  onChange={field.onChange}
                  disabled={isSubmitting}
                />
              )}
            />
          </div>
          <div className="data-preview-content">
            <strong>{t('settings.bookmarkPreview')}</strong>
            <p className="wrap-anywhere text-xs leading-5 text-muted-foreground">
              {t('settings.importSummary', {
                count: candidates.length,
                duplicates: items.length - candidates.length,
                folders: new Set(candidates.map((item) => item.folder).filter(Boolean)).size,
              })}
            </p>
            <ul className="settings-bookmark-preview" aria-label={t('settings.bookmarkPreview')}>
              {candidates.slice(0, 8).map((item, index) => (
                <li key={item.url + ':' + index}>
                  <span title={item.title}>{item.title}</span>
                  <small title={item.url}>{item.url}</small>
                </li>
              ))}
            </ul>
            {candidates.length > 8 && (
              <p className="wrap-anywhere text-xs leading-5 text-muted-foreground">
                {t('settings.remainingBookmarks', { count: candidates.length - 8 })}
              </p>
            )}
          </div>
          <div className="data-form-actions data-preview-actions">
            <Button
              type="submit"
              size="sm"
              disabled={isSubmitting || !target || !candidates.length}
              onClick={() => form.setValue('action', 'import')}
            >
              {t(isSubmitting ? 'settings.importing' : 'settings.confirmImport')}
            </Button>
          </div>
        </div>
      )}
      <FormError error={errors.items} />
      <FormError error={errors.groupId} />
      <FormError error={errors.root} />
    </form>
  );
}

function BackupExport({ formId, report }: { formId: string; report: DraftReporter }) {
  const { t } = useTranslation();
  const protectedPrivate = useRayTabStore((store) => store.state?.privateSecurity.protected);
  const locked = useRayTabStore((store) => store.state?.privateSecurity.locked);
  const schema = useMemo(
    () =>
      backupExportSchema.superRefine((value, ctx) => {
        if (protectedPrivate && value.range !== 'normal' && value.password.length < 6)
          ctx.addIssue({ code: 'custom', path: ['password'], message: 'settings.passwordLength' });
      }),
    [protectedPrivate],
  );
  const defaults = { range: locked ? ('normal' as const) : ('all' as const), password: '' };
  const form = useForm<z.infer<typeof schema>>({
    resolver: zodResolver(schema),
    defaultValues: defaults,
  });
  const { isDirty, isSubmitting, errors } = form.formState;
  const range = useWatch({ control: form.control, name: 'range' });
  useDraftStatus('backup-export', isDirty, isSubmitting, report);
  const operationBoundary = usePrivateLockReset(() =>
    form.reset({ range: 'normal', password: '' }),
  );
  return (
    <form
      id={formId}
      className="settings-form grid min-w-0 gap-3.5 text-sm not-empty:pt-3"
      noValidate
      onSubmit={form.handleSubmit(async (values) => {
        const isCurrent = operationBoundary();
        try {
          const snapshot = await repository.snapshot(values.range);
          if (!isCurrent()) return;
          const backup = await createBackup(
            snapshot.state,
            snapshot.resources,
            values.range,
            snapshot.state.privateSecurity.protected && values.range !== 'normal'
              ? values.password
              : undefined,
          );
          if (!isCurrent()) return;
          download(
            'raytab-' +
              { all: 'groups', normal: 'unencrypted-groups', private: 'encrypted-groups' }[
                values.range
              ] +
              '-' +
              new Date().toISOString().slice(0, 10) +
              '.json',
            JSON.stringify(encodeBackup(backup), null, 2),
          );
          form.reset({ range: values.range, password: '' });
          toast.success(t('settings.backupExported'));
        } catch (reason) {
          if (isCurrent()) form.setError('root', { message: errorMessage(reason) });
        }
      })}
    >
      {protectedPrivate && (
        <Controller
          control={form.control}
          name="range"
          render={({ field }) => (
            <SettingsSelect
              triggerClassName="w-full max-w-full"
              label={t('settings.exportRange')}
              value={field.value}
              options={[
                ['all', t('settings.allSpaces')],
                ['normal', t('settings.normalSpace')],
                ['private', t('settings.privateSpace')],
              ]}
              onChange={field.onChange}
              disabled={isSubmitting}
            />
          )}
        />
      )}
      {protectedPrivate && (
        <p className="wrap-anywhere text-xs leading-5 text-muted-foreground">
          {t('settings.backupContents')}
        </p>
      )}
      {protectedPrivate && range !== 'normal' && (
        <label className="data-input-field">
          <span>{t('settings.backupPassword')}</span>
          <Input
            type="password"
            autoComplete="new-password"
            {...form.register('password')}
            aria-invalid={Boolean(errors.password)}
            disabled={isSubmitting}
          />
        </label>
      )}
      {protectedPrivate && range !== 'normal' && (
        <p className="wrap-anywhere text-xs leading-5 text-muted-foreground">
          {t('settings.backupPasswordHelp')}
        </p>
      )}
      {locked && range !== 'normal' && (
        <p className="wrap-anywhere text-xs leading-5 text-muted-foreground">
          {t('settings.unlockForBackup')}
        </p>
      )}
      <FormError error={errors.password} />
      <FormError error={errors.root} />
      {protectedPrivate && (
        <div className="data-form-actions">
          <Button type="submit" size="sm" disabled={isSubmitting || (locked && range !== 'normal')}>
            {t(isSubmitting ? 'settings.exporting' : 'settings.exportSelected')}
          </Button>
        </div>
      )}
    </form>
  );
}

function BackupRestore({ report }: { report: DraftReporter }) {
  const { t } = useTranslation();
  const refresh = useRayTabStore((store) => store.refresh);
  const [confirm, confirmation] = useConfirm();
  const defaults = {
    action: 'preview' as const,
    file: undefined,
    document: undefined,
    mode: 'replace' as const,
    password: '',
  };
  const form = useForm<z.infer<typeof restoreSchema>>({
    resolver: zodResolver(restoreSchema),
    defaultValues: defaults,
  });
  const { isSubmitting, errors } = form.formState;
  const [backup, mode, file] = useWatch({
    control: form.control,
    name: ['document', 'mode', 'file'],
  });
  const summary = backup ? backupSummary(backup) : undefined;
  useDraftStatus('backup-restore', Boolean(file?.length || backup), isSubmitting, report);
  function clearRestore() {
    form.resetField('file');
    form.reset(defaults);
  }
  const operationBoundary = usePrivateLockReset(clearRestore);
  return (
    <form
      className="settings-form grid min-w-0 gap-3.5 text-sm"
      noValidate
      onSubmit={form.handleSubmit(async (values) => {
        const isCurrent = operationBoundary();
        try {
          if (values.action === 'preview') {
            form.setValue('document', undefined);
            form.resetField('password', { defaultValue: '' });
            const document = await parseBackup(await values.file![0].text());
            if (!isCurrent()) return;
            if (
              useRayTabStore.getState().state?.privateSecurity.locked &&
              restoreRange(document, true) !== 'normal'
            ) {
              form.setError('root', { message: t('settings.unlockForRestore') });
              return;
            }
            form.setValue('document', document, {
              shouldDirty: true,
            });
            form.resetField('password', { defaultValue: '' });
            form.clearErrors();
            return;
          }
          if (!values.document) return;
          if (
            values.mode === 'replace' &&
            !(await confirm({
              title: t('settings.replaceTitle'),
              description: t('settings.replaceHelp', {
                range: t(
                  'settings.ranges.' +
                    restoreRange(
                      values.document,
                      Boolean(useRayTabStore.getState().state?.privateSecurity.protected),
                    ),
                ),
              }),
              confirmText: t('settings.replaceRestore'),
              cancelText: t('settings.cancel'),
              variant: 'destructive',
            }))
          )
            return;
          if (!isCurrent()) return;
          const current = await repository.read();
          if (!isCurrent()) return;
          const result = await restoreBackup(
            current,
            values.document,
            values.mode,
            values.password || undefined,
          );
          if (!isCurrent()) return;
          const restore = () =>
            repository.restore(result.state, result.resources, {
              expectedRevision: current.revision,
              ...(result.preserveGroupEncryption ? { protectWith: values.password } : {}),
              range: result.range,
            });
          if (
            result.preserveGroupEncryption ||
            (current.privateSecurity.protected && result.range !== 'normal')
          ) {
            const { withGroupProtectionSyncGuard } = await import('@/sync/core/engine');
            const protectedData = result.state.spaces.private;
            await withGroupProtectionSyncGuard(
              [
                ...protectedData.groups.map(({ id }) => ({ groupId: id })),
                ...protectedData.folders.map(({ id }) => ({ folderId: id })),
                { siteIds: protectedData.sites.map(({ id }) => id) },
              ],
              restore,
            );
          } else {
            await restore();
          }
          await refresh();
          clearRestore();
          toast.success(t('settings.backupRestored'));
          if (!isCurrent()) return;
          for (const spaceId of ['normal', 'private'] as const) {
            const recovery = result.recoveries[spaceId];
            if (!recovery) continue;
            toast.info(
              t('settings.syncRecovered', {
                sites: recovery.sites,
                folders: recovery.folders,
                group:
                  result.state.spaces[spaceId].groups.find((group) => group.id === recovery.groupId)
                    ?.name ?? 'Recovered',
              }),
            );
          }
        } catch (reason) {
          if (isCurrent()) form.setError('root', { message: errorMessage(reason) });
        }
      })}
    >
      <SettingsFilePicker
        label={t('settings.backupFile')}
        hint={t('settings.dataTasks.backupFileHint')}
        file={file}
        accept="application/json,.json"
        registration={form.register('file', {
          onChange: () => {
            form.setValue('document', undefined, { shouldDirty: true });
            form.resetField('password', { defaultValue: '' });
          },
        })}
        disabled={isSubmitting}
        invalid={Boolean(errors.file)}
      />
      <FormError error={errors.file} />
      <div className="data-form-actions">
        <Button
          type="submit"
          size="sm"
          disabled={isSubmitting}
          onClick={() => form.setValue('action', 'preview')}
        >
          {t('settings.previewBackup')}
        </Button>
      </div>
      {backup && summary && (
        <div className="data-preview">
          <div className="data-preview-content">
            <strong>{t('settings.backupPreview')}</strong>
            {summary.normal && (
              <p className="wrap-anywhere text-xs leading-5 text-muted-foreground">
                {t('settings.spaceSummary', {
                  space: t('settings.normalSpace'),
                  groups: summary.normal.groups,
                  folders: summary.normal.folders,
                  sites: summary.normal.sites,
                })}
              </p>
            )}
            {summary.private && (
              <p className="wrap-anywhere text-xs leading-5 text-muted-foreground">
                {'protected' in summary.private
                  ? t('settings.encryptedPrivate')
                  : t('settings.spaceSummary', {
                      space: t('settings.legacyHiddenGroups'),
                      groups: summary.private.groups,
                      folders: summary.private.folders,
                      sites: summary.private.sites,
                    })}
              </p>
            )}
          </div>
          <Controller
            control={form.control}
            name="mode"
            render={({ field }) => (
              <SettingsSelect
                triggerClassName="w-full max-w-full"
                label={t('settings.restoreMode')}
                value={field.value}
                options={[
                  ['replace', t('settings.replaceRestore')],
                  ['merge', t('settings.mergeRestore')],
                ]}
                onChange={field.onChange}
                disabled={isSubmitting}
              />
            )}
          />
          <p className="wrap-anywhere text-xs leading-5 text-muted-foreground">
            {t(mode === 'merge' ? 'settings.mergeHelp' : 'settings.replaceModeHelp')}
          </p>
          {backup.spaces.private?.protected && (
            <label className="data-input-field">
              <span>{t('settings.restorePassword')}</span>
              <Input
                type="password"
                autoComplete="current-password"
                {...form.register('password')}
                aria-invalid={Boolean(errors.password)}
                disabled={isSubmitting}
              />
            </label>
          )}
          <FormError error={errors.password} />
          <div className="data-form-actions data-preview-actions">
            <Button
              type="submit"
              size="sm"
              variant={mode === 'replace' ? 'destructive' : 'default'}
              disabled={isSubmitting}
              onClick={() => form.setValue('action', 'restore')}
            >
              {t(
                isSubmitting
                  ? 'settings.restoring'
                  : mode === 'replace'
                    ? 'settings.replaceRestore'
                    : 'settings.mergeRestore',
              )}
            </Button>
          </div>
        </div>
      )}
      <FormError error={errors.document} />
      <FormError error={errors.root} />
      {confirmation}
    </form>
  );
}
function download(name: string, contents: string) {
  const url = URL.createObjectURL(new Blob([contents], { type: 'application/json' }));
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = name;
  anchor.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}
