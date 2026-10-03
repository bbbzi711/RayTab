import { useEffect, useMemo, useRef, useState } from 'react';
import { Check, ChevronDown, Pencil, Plus, Trash2 } from 'lucide-react';
import { useForm, useWatch } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useConfirm } from '@/components/ui/confirm-dialog';
import { searchEngineSchema, type SpaceSettings } from '@/storage/model';
import { useRayTabStore } from '@/storage/store';
import { errorMessage } from '@/lib/errors';
import { prepareImage } from '@/lib/images';
import {
  FormError,
  SettingsFilePicker,
  useDraftStatus,
  type DraftReporter,
} from './SettingsControls';

export type SaveSettings = (
  patch: Partial<SpaceSettings>,
  assets?: Map<string, Blob>,
) => Promise<void>;

export const wallpaperFormSchema = z.object({
  url: z
    .string()
    .trim()
    .url('settings.invalidWallpaper')
    .refine((url) => {
      try {
        const parsed = new URL(url);
        return (
          ['http:', 'https:'].includes(parsed.protocol) && !parsed.username && !parsed.password
        );
      } catch {
        return false;
      }
    }, 'settings.invalidWallpaper'),
});

export function WallpaperForm({
  url,
  save,
  report,
}: {
  url?: string;
  save: SaveSettings;
  report: DraftReporter;
}) {
  const { t } = useTranslation();
  const form = useForm<z.infer<typeof wallpaperFormSchema>>({
    resolver: zodResolver(wallpaperFormSchema),
    defaultValues: { url: url ?? '' },
  });
  const { isDirty, isSubmitting, errors } = form.formState;
  useDraftStatus('wallpaper', isDirty, isSubmitting, report);
  const { reset } = form;
  useEffect(() => reset({ url: url ?? '' }, { keepDirtyValues: true }), [url, reset]);
  useEffect(() => () => reset({ url: '' }), [reset]);
  return (
    <form
      className="settings-form"
      noValidate
      onSubmit={form.handleSubmit(async (values) => {
        try {
          await save({
            background: 'custom',
            onlineWallpaperUrl: values.url,
            wallpaperId: undefined,
          });
          form.reset(values);
        } catch (reason) {
          form.setError('root', { message: errorMessage(reason) });
        }
      })}
    >
      <label>
        {t('settings.onlineWallpaper')}
        <Input
          {...form.register('url')}
          placeholder="https://example.com/wallpaper.jpg"
          aria-invalid={Boolean(errors.url)}
          disabled={isSubmitting}
        />
      </label>
      <FormError error={errors.url} />
      <FormError error={errors.root} />
      <Button type="submit" variant="outline" size="sm" disabled={isSubmitting}>
        {t(isSubmitting ? 'settings.saving' : 'settings.useWallpaper')}
      </Button>
    </form>
  );
}

const wallpaperFileSchema = z.object({
  file: z.custom<FileList>(
    (value) => typeof FileList !== 'undefined' && value instanceof FileList && value.length === 1,
    'settings.chooseWallpaperFile',
  ),
});

export function LocalWallpaperForm({
  save,
  report,
}: {
  save: SaveSettings;
  report: DraftReporter;
}) {
  const { t } = useTranslation();
  const form = useForm<z.infer<typeof wallpaperFileSchema>>({
    resolver: zodResolver(wallpaperFileSchema),
  });
  const file = useWatch({ control: form.control, name: 'file' });
  const { isSubmitting, errors } = form.formState;
  // RHF cannot compare FileList to an empty default; an empty picker is not an unsaved edit.
  useDraftStatus('local-wallpaper', Boolean(file?.length), isSubmitting, report);
  const { reset } = form;
  useEffect(() => () => reset(), [reset]);
  return (
    <form
      className="settings-form"
      noValidate
      onSubmit={form.handleSubmit(async ({ file }) => {
        try {
          const { id, blob } = await prepareImage(file[0], 'wallpaper');
          await save(
            { background: 'custom', wallpaperId: id, onlineWallpaperUrl: undefined },
            new Map([[id, blob]]),
          );
          form.reset();
        } catch (reason) {
          form.setError('root', { message: errorMessage(reason) });
        }
      })}
    >
      <SettingsFilePicker
        label={t('settings.localWallpaper')}
        hint="PNG · JPG · WebP"
        file={file}
        accept="image/png,image/jpeg,image/webp"
        registration={form.register('file')}
        disabled={isSubmitting}
        invalid={Boolean(errors.file)}
      />
      <FormError error={errors.file && { message: t('settings.chooseWallpaperFile') }} />
      <FormError error={errors.root} />
      <Button type="submit" variant="outline" size="sm" disabled={isSubmitting}>
        {t(isSubmitting ? 'settings.saving' : 'settings.useLocalWallpaper')}
      </Button>
    </form>
  );
}

export function SearchEngineSettings({
  settings,
  save,
  report,
}: {
  settings: SpaceSettings;
  save: SaveSettings;
  report: DraftReporter;
}) {
  const { t } = useTranslation();
  const [editingId, setEditingId] = useState<string>();
  const [editorOpen, setEditorOpen] = useState(false);
  const editor = useRef<HTMLDetailsElement>(null);
  const [confirm, confirmation] = useConfirm();
  const schema = useMemo(
    () =>
      searchEngineSchema.omit({ id: true }).extend({
        name: z.string().trim().min(1, 'settings.required').max(80, 'settings.engineNameLength'),
      }),
    [],
  );
  const form = useForm<z.infer<typeof schema>>({
    resolver: zodResolver(schema),
    defaultValues: { name: '', url: '' },
  });
  const removal = useForm<{ id: string }>({
    resolver: zodResolver(z.object({ id: z.string().min(1) })),
    defaultValues: { id: '' },
  });
  const { isDirty, isSubmitting, errors } = form.formState;
  const busy = isSubmitting || removal.formState.isSubmitting;
  useDraftStatus('search-engine', isDirty, busy, report);
  const { reset, setFocus } = form;
  useEffect(() => {
    if (editorOpen) setFocus('name');
  }, [editorOpen, editingId, setFocus]);
  useEffect(() => () => reset({ name: '', url: '' }), [reset]);
  const edit = async (id?: string) => {
    if (busy) return;
    if (
      isDirty &&
      !(await confirm({
        title: t('settings.discardTitle'),
        description: t('settings.discardDescription'),
        confirmText: t('settings.discard'),
        cancelText: t('settings.keepEditing'),
        variant: 'destructive',
      }))
    )
      return;
    const engine = settings.searchEngines.find((item) => item.id === id);
    setEditingId(id);
    form.reset({ name: engine?.name ?? '', url: engine?.url ?? '' });
    setEditorOpen(Boolean(id));
    if (!id) editor.current?.querySelector('summary')?.focus();
  };
  return (
    <div className="search-engine-settings">
      <div className="search-engine-list">
        {settings.searchEngines.map((engine) => (
          <div className="search-engine-row" key={engine.id}>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="search-engine-choice"
              aria-label={engine.name}
              aria-pressed={settings.searchEngine === engine.id}
              disabled={busy}
              onClick={() =>
                void save({ searchEngine: engine.id }).catch((reason: unknown) =>
                  toast.error(errorMessage(reason)),
                )
              }
            >
              <span className="search-engine-copy">
                <span className="search-engine-name">{engine.name}</span>
                <span className="search-engine-address" title={engine.url}>
                  {new URL(engine.url).hostname}
                </span>
              </span>
              {settings.searchEngine === engine.id && <Check size={15} aria-hidden="true" />}
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              className="search-engine-action"
              disabled={busy}
              aria-label={t('settings.editNamed', { name: engine.name })}
              title={t('settings.editNamed', { name: engine.name })}
              onClick={() => void edit(engine.id)}
            >
              <Pencil size={14} aria-hidden="true" />
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              className="search-engine-action search-engine-delete"
              disabled={busy || settings.searchEngines.length === 1}
              aria-label={t('settings.deleteNamed', { name: engine.name })}
              title={t('settings.deleteNamed', { name: engine.name })}
              onClick={() => {
                if (busy) return;
                removal.setValue('id', engine.id);
                void removal.handleSubmit(async ({ id }) => {
                  if (
                    editingId === id &&
                    isDirty &&
                    !(await confirm({
                      title: t('settings.discardTitle'),
                      description: t('settings.discardDescription'),
                      confirmText: t('settings.discard'),
                      cancelText: t('settings.keepEditing'),
                      variant: 'destructive',
                    }))
                  )
                    return;
                  const engines = settings.searchEngines.filter((item) => item.id !== id);
                  try {
                    await save({
                      searchEngines: engines,
                      searchEngine:
                        settings.searchEngine === id ? engines[0].id : settings.searchEngine,
                    });
                    if (editingId === id) {
                      setEditingId(undefined);
                      form.reset({ name: '', url: '' });
                      setEditorOpen(false);
                    }
                    removal.reset({ id: '' });
                  } catch (reason) {
                    toast.error(errorMessage(reason));
                  }
                })();
              }}
            >
              <Trash2 size={14} aria-hidden="true" />
            </Button>
          </div>
        ))}
      </div>
      <details
        className="search-engine-editor"
        ref={editor}
        open={editorOpen}
        onToggle={(event) => setEditorOpen(event.currentTarget.open)}
      >
        <summary
          aria-disabled={busy}
          onClick={(event) => {
            if (busy) event.preventDefault();
          }}
        >
          {editingId ? (
            <Pencil size={14} aria-hidden="true" />
          ) : (
            <Plus size={15} aria-hidden="true" />
          )}
          <span>{t(editingId ? 'settings.editSearchEngine' : 'settings.addSearchEngine')}</span>
          <ChevronDown size={14} aria-hidden="true" />
        </summary>
        <form
          className="settings-form"
          noValidate
          onSubmit={form.handleSubmit(async (values) => {
            try {
              const engine = { ...values, id: editingId ?? crypto.randomUUID() };
              await save({
                searchEngines: editingId
                  ? settings.searchEngines.map((item) => (item.id === editingId ? engine : item))
                  : [...settings.searchEngines, engine],
                searchEngine: editingId ? settings.searchEngine : engine.id,
              });
              setEditingId(undefined);
              form.reset({ name: '', url: '' });
              setEditorOpen(false);
              editor.current?.querySelector('summary')?.focus();
              toast.success(t('settings.saved'));
            } catch (reason) {
              form.setError('root', { message: errorMessage(reason) });
            }
          })}
        >
          <label>
            {t('settings.engineName')}
            <Input
              {...form.register('name')}
              maxLength={80}
              aria-invalid={Boolean(errors.name)}
              disabled={busy}
            />
          </label>
          <FormError error={errors.name} />
          <label>
            {t('settings.engineUrl')}
            <Input
              {...form.register('url')}
              placeholder="https://example.com/search?q=%s"
              aria-invalid={Boolean(errors.url)}
              disabled={busy}
            />
          </label>
          <FormError error={errors.url} />
          <FormError error={errors.root} />
          <p className="settings-help">{t('settings.engineHelp')}</p>
          <div className="settings-form-actions">
            <Button
              type="submit"
              variant="outline"
              size="sm"
              disabled={busy || (!editingId && settings.searchEngines.length >= 20)}
            >
              {t(editingId ? 'settings.save' : 'settings.add')}
            </Button>
            {(editingId || isDirty) && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                disabled={busy}
                onClick={() => void edit()}
              >
                {t('settings.cancel')}
              </Button>
            )}
          </div>
        </form>
      </details>
      {confirmation}
    </div>
  );
}

export function PasswordForm({
  mode,
  report,
}: {
  mode: 'protect' | 'change' | 'remove';
  report: DraftReporter;
}) {
  const { t } = useTranslation();
  const protect = useRayTabStore((store) => store.protectPrivate);
  const change = useRayTabStore((store) => store.changePrivatePassword);
  const remove = useRayTabStore((store) => store.removePrivatePassword);
  const locked = useRayTabStore((store) => store.state?.privateSecurity.locked);
  const [confirm, confirmation] = useConfirm();
  const schema = useMemo(
    () =>
      z
        .object({
          password: z.string().min(6, 'settings.passwordLength'),
          next: z.string(),
          confirm: z.string(),
        })
        .superRefine((value, ctx) => {
          if (mode === 'change' && value.next.length < 6)
            ctx.addIssue({ code: 'custom', path: ['next'], message: 'settings.passwordLength' });
          if (mode === 'change' && value.next !== value.confirm)
            ctx.addIssue({
              code: 'custom',
              path: ['confirm'],
              message: 'settings.passwordMismatch',
            });
        }),
    [mode],
  );
  const form = useForm<z.infer<typeof schema>>({
    resolver: zodResolver(schema),
    defaultValues: { password: '', next: '', confirm: '' },
  });
  const { isDirty, isSubmitting, errors } = form.formState;
  useDraftStatus(`password-${mode}`, isDirty, isSubmitting, report);
  const { reset } = form;
  useEffect(() => {
    if (locked) reset({ password: '', next: '', confirm: '' });
    return () => reset({ password: '', next: '', confirm: '' });
  }, [locked, reset]);
  return (
    <form
      className="settings-form"
      noValidate
      onSubmit={form.handleSubmit(async (values) => {
        if (
          mode === 'remove' &&
          !(await confirm({
            title: t('settings.removeProtectionTitle'),
            description: t('settings.removeProtectionHelp'),
            confirmText: t('settings.removeProtection'),
            cancelText: t('settings.cancel'),
            variant: 'destructive',
          }))
        )
          return;
        try {
          if (mode === 'protect') await protect(values.password);
          else if (mode === 'change') await change(values.password, values.next);
          else await remove(values.password);
          form.reset({ password: '', next: '', confirm: '' });
          toast.success(t('settings.saved'));
        } catch (reason) {
          form.setError('root', { message: errorMessage(reason) });
        }
      })}
    >
      <strong>{t(`settings.passwordActions.${mode}`)}</strong>
      <label>
        {t(mode === 'protect' ? 'settings.password' : 'settings.currentPassword')}
        <Input
          type="password"
          autoComplete={mode === 'protect' ? 'new-password' : 'current-password'}
          {...form.register('password')}
          aria-invalid={Boolean(errors.password)}
          disabled={isSubmitting || (mode !== 'protect' && locked)}
        />
      </label>
      <FormError error={errors.password} />
      {mode === 'change' && (
        <>
          <label>
            {t('settings.newPassword')}
            <Input
              type="password"
              autoComplete="new-password"
              {...form.register('next')}
              aria-invalid={Boolean(errors.next)}
              disabled={isSubmitting || locked}
            />
          </label>
          <FormError error={errors.next} />
          <label>
            {t('settings.repeatPassword')}
            <Input
              type="password"
              autoComplete="new-password"
              {...form.register('confirm')}
              aria-invalid={Boolean(errors.confirm)}
              disabled={isSubmitting || locked}
            />
          </label>
          <FormError error={errors.confirm} />
        </>
      )}
      <FormError error={errors.root} />
      <Button
        type="submit"
        variant={mode === 'remove' ? 'destructive' : 'outline'}
        size="sm"
        disabled={isSubmitting || (mode !== 'protect' && locked)}
      >
        {t(isSubmitting ? 'settings.saving' : `settings.passwordActions.${mode}`)}
      </Button>
      {confirmation}
    </form>
  );
}
