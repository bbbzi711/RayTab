import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ArrowLeft, ArrowDownToLine, ArrowUpFromLine, ChevronRight, RotateCcw } from 'lucide-react';
import { Controller, useForm, useWatch } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useConfirm } from '@/components/ui/confirm-dialog';
import {
  backupSummary,
  createBackup,
  parseBackup,
  restoreBackup,
  type BackupDocument,
} from '@/features/backup/backup';
import {
  deduplicateBookmarks,
  parseBookmarkHtml,
  readBrowserBookmarks,
} from '@/features/import/bookmarks';
import { useRayTabStore } from '@/storage/store';
import { repository } from '@/storage/repository';
import type { SpaceId } from '@/storage/model';
import { errorMessage } from '@/lib/errors';
import {
  FormError,
  SettingsFilePicker,
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

export function DataSettings({ spaceId, report }: { spaceId: SpaceId; report: DraftReporter }) {
  const { t } = useTranslation();
  const [active, setActive] = useState<'import' | 'export' | 'restore' | null>(null);
  const [visited, setVisited] = useState<Set<'import' | 'export' | 'restore'>>(() => new Set());
  const [busyForms, setBusyForms] = useState<Record<string, boolean>>({});
  const taskHeading = useRef<HTMLHeadingElement>(null);
  const taskTrigger = useRef<HTMLButtonElement | null>(null);
  useEffect(() => {
    const target = active ? taskHeading.current : taskTrigger.current;
    target?.focus({ preventScroll: true });
  }, [active]);
  const reportForm = useCallback<DraftReporter>(
    (id, dirty, busy) => {
      report(id, dirty, busy);
      setBusyForms((previous) => (previous[id] === busy ? previous : { ...previous, [id]: busy }));
    },
    [report],
  );
  const tasks = [
    {
      id: 'import',
      title: 'settings.importBookmarks',
      description: 'settings.dataTasks.importHelp',
      icon: ArrowDownToLine,
    },
    {
      id: 'export',
      title: 'settings.exportBackup',
      description: 'settings.dataTasks.exportHelp',
      icon: ArrowUpFromLine,
    },
    {
      id: 'restore',
      title: 'settings.restoreBackup',
      description: 'settings.dataTasks.restoreHelp',
      icon: RotateCcw,
    },
  ] as const;
  return (
    <div className="data-settings">
      <div className="data-task-list" hidden={active !== null}>
        {tasks.map(({ id, title, description, icon: Icon }) => (
          <button
            key={id}
            type="button"
            className="data-task-link"
            aria-label={t(title)}
            onClick={(event) => {
              taskTrigger.current = event.currentTarget;
              setVisited((previous) => new Set(previous).add(id));
              setActive(id);
            }}
          >
            <Icon size={20} aria-hidden="true" />
            <span>
              <strong>{t(title)}</strong>
              <small>{t(description)}</small>
            </span>
            <ChevronRight size={18} aria-hidden="true" />
          </button>
        ))}
      </div>
      {active && (
        <div className="data-task-heading">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            disabled={Object.values(busyForms).some(Boolean)}
            onClick={() => setActive(null)}
          >
            <ArrowLeft size={16} aria-hidden="true" />
            {t('settings.dataTasks.back')}
          </Button>
          <h2 ref={taskHeading} tabIndex={-1}>
            {t(tasks.find((task) => task.id === active)!.title)}
          </h2>
        </div>
      )}
      {visited.has('import') && (
        <div className="data-task-body" hidden={active !== 'import'}>
          <BookmarkImport spaceId={spaceId} report={reportForm} />
        </div>
      )}
      {visited.has('export') && (
        <div className="data-task-body" hidden={active !== 'export'}>
          <BackupExport report={reportForm} />
        </div>
      )}
      {visited.has('restore') && (
        <div className="data-task-body" hidden={active !== 'restore'}>
          <BackupRestore report={reportForm} />
        </div>
      )}
    </div>
  );
}

function BookmarkImport({ spaceId, report }: { spaceId: SpaceId; report: DraftReporter }) {
  const { t } = useTranslation();
  const dispatch = useRayTabStore((store) => store.dispatch);
  const space = useRayTabStore((store) => store.state?.spaces[spaceId])!;
  const activeGroup = useRayTabStore((store) => store.state?.local.activeGroup[spaceId])!;
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
  const { isDirty, isSubmitting, errors } = form.formState;
  useDraftStatus('bookmark-import', isDirty, isSubmitting, report);
  const [items, duplicateMode, organizeMode, file] = useWatch({
    control: form.control,
    name: ['items', 'duplicateMode', 'organizeMode', 'file'],
  });
  const candidates = useMemo(
    () =>
      deduplicateBookmarks(
        organizeMode === 'flat' ? items.map(({ folder, ...item }) => item) : items,
        space.sites.map((item) => item.url),
        duplicateMode,
      ),
    [items, organizeMode, duplicateMode, space.sites],
  );
  const operationBoundary = usePrivateLockReset(
    () => form.reset({ ...defaults, file: undefined, items: [] }),
    spaceId === 'private',
  );
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
      await dispatch({
        type: 'import-bookmarks',
        spaceId,
        groupId: values.groupId,
        items: candidates,
      });
      if (!isCurrent()) return;
      form.reset(defaults);
      toast.success(t('settings.bookmarksImported', { count: candidates.length }));
    } catch (reason) {
      if (isCurrent()) form.setError('root', { message: errorMessage(reason) });
    }
  });
  return (
    <form className="settings-form" noValidate onSubmit={submit}>
      <p className="settings-help">{t('settings.bookmarkHelp')}</p>
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
          disabled={isSubmitting || typeof browser === 'undefined' || !browser.bookmarks?.getTree}
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
                  label={t('settings.targetGroup')}
                  value={field.value}
                  options={[...space.groups]
                    .sort((a, b) => a.order - b.order)
                    .map((group) => [group.id, group.name])}
                  onChange={field.onChange}
                  disabled={isSubmitting}
                />
              )}
            />
          </div>
          <div className="data-preview-content">
            <strong>{t('settings.bookmarkPreview')}</strong>
            <p className="settings-help">
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
              <p className="settings-help">
                {t('settings.remainingBookmarks', { count: candidates.length - 8 })}
              </p>
            )}
          </div>
          <div className="data-form-actions data-preview-actions">
            <Button
              type="submit"
              size="sm"
              disabled={isSubmitting || !candidates.length}
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

function BackupExport({ report }: { report: DraftReporter }) {
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
      className="settings-form"
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
            'raytab-' + values.range + '-backup-' + new Date().toISOString().slice(0, 10) + '.json',
            JSON.stringify(backup, null, 2),
          );
          form.reset({ range: values.range, password: '' });
          toast.success(t('settings.backupExported'));
        } catch (reason) {
          if (isCurrent()) form.setError('root', { message: errorMessage(reason) });
        }
      })}
    >
      <Controller
        control={form.control}
        name="range"
        render={({ field }) => (
          <SettingsSelect
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
      <p className="settings-help">
        {t('settings.backupRangeHelp', { range: t('settings.ranges.' + range) })}
      </p>
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
        <p className="settings-help">{t('settings.backupPasswordHelp')}</p>
      )}
      {locked && range !== 'normal' && (
        <p className="settings-help">{t('settings.unlockForBackup')}</p>
      )}
      <FormError error={errors.password} />
      <FormError error={errors.root} />
      <div className="data-form-actions">
        <Button type="submit" size="sm" disabled={isSubmitting || (locked && range !== 'normal')}>
          {t(isSubmitting ? 'settings.exporting' : 'settings.exportSelected')}
        </Button>
      </div>
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
    mode: 'merge' as const,
    password: '',
  };
  const form = useForm<z.infer<typeof restoreSchema>>({
    resolver: zodResolver(restoreSchema),
    defaultValues: defaults,
  });
  const { isDirty, isSubmitting, errors } = form.formState;
  const [backup, mode, file] = useWatch({
    control: form.control,
    name: ['document', 'mode', 'file'],
  });
  const summary = backup ? backupSummary(backup) : undefined;
  useDraftStatus('backup-restore', isDirty, isSubmitting, report);
  const operationBoundary = usePrivateLockReset(() => form.reset(defaults));
  return (
    <form
      className="settings-form"
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
              document.spaces.private &&
              useRayTabStore.getState().state?.privateSecurity.locked
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
                  values.document.spaces.private
                    ? values.document.spaces.normal
                      ? 'settings.ranges.all'
                      : 'settings.ranges.private'
                    : 'settings.ranges.normal',
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
          await repository.restore(result.state, result.resources, {
            expectedRevision: current.revision,
            range: values.document.spaces.private
              ? values.document.spaces.normal
                ? 'all'
                : 'private'
              : 'normal',
          });
          await refresh();
          if (!isCurrent()) return;
          form.reset(defaults);
          toast.success(t('settings.backupRestored'));
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
              <p className="settings-help">
                {t('settings.spaceSummary', {
                  space: t('settings.normalSpace'),
                  groups: summary.normal.groups,
                  folders: summary.normal.folders,
                  sites: summary.normal.sites,
                })}
              </p>
            )}
            {summary.private && (
              <p className="settings-help">
                {'protected' in summary.private
                  ? t('settings.encryptedPrivate')
                  : t('settings.spaceSummary', {
                      space: t('settings.privateSpace'),
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
                label={t('settings.restoreMode')}
                value={field.value}
                options={[
                  ['merge', t('settings.mergeRestore')],
                  ['replace', t('settings.replaceRestore')],
                ]}
                onChange={field.onChange}
                disabled={isSubmitting}
              />
            )}
          />
          <p className="settings-help">
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
