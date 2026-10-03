import { useEffect, useMemo, useState } from 'react';
import { Controller, useForm, useWatch } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { Cloud, Settings2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useConfirm } from '@/components/ui/confirm-dialog';
import {
  clearSyncConfig,
  loadSyncConfig,
  loadSyncStatus,
  resolveSyncConflict,
  saveSyncConfig,
  synchronize,
  type SyncStatus,
} from '@/sync/core/engine';
import type { SyncConnection } from '@/sync/providers';
import type { SyncConflict } from '@/sync/core/merge';
import { useRayTabStore } from '@/storage/store';
import { errorMessage, storedErrorMessage } from '@/lib/errors';
import {
  FormError,
  SettingsSelect,
  SettingsSection,
  Toggle,
  useDraftStatus,
  type DraftReporter,
} from './SettingsControls';
import './sync-settings.css';

const emptyDraft = {
  type: 'webdav' as const,
  url: '',
  username: '',
  password: '',
  token: '',
  owner: '',
  repo: '',
  path: 'raytab.json',
  branch: '',
  automatic: true,
  includePrivate: false,
  privatePassword: '',
};
export const createSyncDraftSchema = (privateLocked: boolean) =>
  z
    .object({
      type: z.enum(['webdav', 'github', 'gitee']),
      url: z.string().trim(),
      username: z.string(),
      password: z.string(),
      token: z.string(),
      owner: z.string().trim(),
      repo: z.string().trim(),
      path: z.string().trim(),
      branch: z.string().trim(),
      automatic: z.boolean(),
      includePrivate: z.boolean(),
      privatePassword: z.string(),
    })
    .superRefine((draft, ctx) => {
      if (draft.type === 'webdav') {
        let valid = false;
        try {
          const url = new URL(draft.url);
          valid = ['https:', 'http:'].includes(url.protocol) && !url.username && !url.password;
        } catch {
          valid = false;
        }
        if (!valid)
          ctx.addIssue({ code: 'custom', path: ['url'], message: 'settings.syncInvalidUrl' });
      } else {
        for (const key of ['token', 'owner', 'repo', 'path'] as const)
          if (!draft[key])
            ctx.addIssue({ code: 'custom', path: [key], message: 'settings.required' });
      }
      if (draft.includePrivate && privateLocked)
        ctx.addIssue({
          code: 'custom',
          path: ['privatePassword'],
          message: 'settings.unlockPrivateForSync',
        });
      else if (draft.includePrivate && draft.privatePassword.length < 6)
        ctx.addIssue({
          code: 'custom',
          path: ['privatePassword'],
          message: 'settings.passwordLength',
        });
    });
type SyncDraft = z.infer<ReturnType<typeof createSyncDraftSchema>>;
function draftFromConfig(config: Awaited<ReturnType<typeof loadSyncConfig>>): SyncDraft {
  if (!config) return emptyDraft;
  const common = {
    ...emptyDraft,
    type: config.connection.type,
    automatic: config.automatic,
    includePrivate: config.includePrivate,
    privatePassword: config.privatePassword ?? '',
  };
  return config.connection.type === 'webdav'
    ? {
        ...common,
        url: config.connection.url,
        username: config.connection.username,
        password: config.connection.password,
      }
    : {
        ...common,
        token: config.connection.token,
        owner: config.connection.owner,
        repo: config.connection.repo,
        path: config.connection.path,
        branch: config.connection.branch ?? '',
      };
}
const actionSchema = z.object({
  operation: z.enum(['auto', 'push', 'pull', 'disconnect', 'resolve']),
  choice: z.enum(['local', 'remote']),
  conflict: z.custom<SyncConflict>().optional(),
});

export function SyncSettings({ report }: { report: DraftReporter }) {
  const { t, i18n } = useTranslation();
  const refresh = useRayTabStore((store) => store.refresh);
  const locked = useRayTabStore((store) => store.state?.privateSecurity.locked);
  const available =
    typeof browser !== 'undefined' &&
    Boolean(browser.storage?.local && browser.permissions?.request);
  const [confirm, confirmation] = useConfirm();
  const [connectionInfo, setConnectionInfo] = useState<{
    provider: SyncDraft['type'];
    automatic: boolean;
  } | null>(null);
  const connected = connectionInfo !== null;
  const [editing, setEditing] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadFailed, setLoadFailed] = useState(false);
  const [loadAttempt, setLoadAttempt] = useState(0);
  const [status, setStatus] = useState<SyncStatus>({ schemaVersion: 1, conflicts: [] });
  const syncDraftSchema = useMemo(() => createSyncDraftSchema(Boolean(locked)), [locked]);
  const form = useForm<SyncDraft>({
    resolver: zodResolver(syncDraftSchema),
    defaultValues: emptyDraft,
  });
  const actions = useForm<z.infer<typeof actionSchema>>({
    resolver: zodResolver(actionSchema),
    defaultValues: { operation: 'auto', choice: 'local' },
  });
  const { isDirty, isSubmitting, errors } = form.formState;
  const busy = isSubmitting || actions.formState.isSubmitting;
  const provider = useWatch({ control: form.control, name: 'type' });
  const includePrivate = useWatch({ control: form.control, name: 'includePrivate' });
  useDraftStatus('sync', isDirty, busy, report);
  const { reset, resetField } = form;
  useEffect(() => {
    let mounted = true;
    let loadVersion = 0;
    if (!available) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setLoadFailed(false);
    form.clearErrors('root');
    const reload = async () => {
      const version = ++loadVersion;
      let config: Awaited<ReturnType<typeof loadSyncConfig>>;
      let nextStatus: SyncStatus;
      try {
        [config, nextStatus] = await Promise.all([loadSyncConfig(), loadSyncStatus()]);
      } catch (reason) {
        if (mounted && version === loadVersion) throw reason;
        return;
      }
      if (!mounted || version !== loadVersion) return;
      setConnectionInfo(
        config ? { provider: config.connection.type, automatic: config.automatic } : null,
      );
      setStatus(nextStatus);
      const values = draftFromConfig(config);
      if (useRayTabStore.getState().state?.privateSecurity.locked) values.privatePassword = '';
      reset(values, { keepDirtyValues: true });
      if (useRayTabStore.getState().state?.privateSecurity.locked)
        resetField('privatePassword', { defaultValue: '' });
    };
    void reload()
      .catch((reason: unknown) => {
        if (mounted) {
          setLoadFailed(true);
          form.setError('root', { message: errorMessage(reason) });
        }
      })
      .finally(() => {
        if (mounted) setLoading(false);
      });
    const changed: Parameters<typeof browser.storage.onChanged.addListener>[0] = (
      changes,
      area,
    ) => {
      if (area === 'local' && (changes['raytab-sync-status'] || changes['raytab-sync-config']))
        void reload().catch((reason: unknown) => {
          if (mounted) toast.error(errorMessage(reason));
        });
    };
    browser.storage.onChanged.addListener(changed);
    return () => {
      mounted = false;
      browser.storage.onChanged.removeListener(changed);
      reset(emptyDraft);
    };
  }, [available, reset, loadAttempt]);
  useEffect(() => {
    if (locked) resetField('privatePassword', { defaultValue: '' });
    return useRayTabStore.subscribe((store, previous) => {
      if (store.state?.privateSecurity.locked && !previous.state?.privateSecurity.locked)
        resetField('privatePassword', { defaultValue: '' });
    });
  }, [locked, resetField]);
  const connectionFrom = (draft: SyncDraft): SyncConnection =>
    draft.type === 'webdav'
      ? { type: 'webdav', url: draft.url, username: draft.username, password: draft.password }
      : {
          type: draft.type,
          token: draft.token,
          owner: draft.owner,
          repo: draft.repo,
          path: draft.path,
          branch: draft.branch || undefined,
        };
  const run = (
    operation: z.infer<typeof actionSchema>['operation'],
    conflict?: SyncConflict,
    choice: 'local' | 'remote' = 'local',
  ) => {
    if (busy || loading) return;
    actions.setValue('operation', operation);
    actions.setValue('conflict', conflict);
    actions.setValue('choice', choice);
    void actions.handleSubmit(async (values) => {
      actions.clearErrors();
      if (
        values.operation === 'disconnect' ||
        values.operation === 'push' ||
        values.operation === 'pull'
      ) {
        const confirmed = await confirm({
          title: t('settings.syncConfirm.' + values.operation + '.title'),
          description: t('settings.syncConfirm.' + values.operation + '.description'),
          confirmText: t('settings.continue'),
          cancelText: t('settings.cancel'),
          variant: 'destructive',
        });
        if (!confirmed) return;
      }
      try {
        if (values.operation === 'disconnect') {
          await clearSyncConfig();
          form.reset(emptyDraft);
          setConnectionInfo(null);
          setEditing(false);
          setStatus({ schemaVersion: 1, conflicts: [] });
        } else if (values.operation === 'resolve' && values.conflict) {
          await resolveSyncConflict(values.conflict, values.choice);
          await refresh();
          setStatus(await loadSyncStatus());
        } else if (
          values.operation === 'auto' ||
          values.operation === 'push' ||
          values.operation === 'pull'
        ) {
          await synchronize(values.operation);
          await refresh();
          setStatus(await loadSyncStatus());
        }
        toast.success(
          t(
            values.operation === 'disconnect'
              ? 'settings.syncDisconnected'
              : 'settings.syncCompleted',
          ),
        );
      } catch (reason) {
        actions.setError('root', { message: errorMessage(reason) });
        toast.error(errorMessage(reason));
        try {
          setStatus(await loadSyncStatus());
        } catch (statusReason) {
          toast.error(errorMessage(statusReason));
        }
      }
    })();
  };
  const fields = useMemo(
    () =>
      provider === 'webdav'
        ? ([
            ['url', 'fileAddress', 'url'],
            ['username', 'username', 'text'],
            ['password', 'password', 'password'],
          ] as const)
        : ([
            ['token', 'token', 'password'],
            ['owner', 'owner', 'text'],
            ['repo', 'repo', 'text'],
            ['path', 'path', 'text'],
            ['branch', 'branch', 'text'],
          ] as const),
    [provider],
  );
  return (
    <div className="sync-settings">
      <section className="sync-overview" aria-label={t('settings.syncOverview.status')}>
        <div className="sync-overview-heading">
          <span className="sync-overview-icon" aria-hidden="true">
            <Cloud size={26} />
          </span>
          <div>
            <h2>
              {t(
                loading
                  ? 'settings.syncOverview.loading'
                  : loadFailed
                    ? 'settings.syncOverview.loadFailed'
                    : connected
                      ? 'settings.syncOverview.configured'
                      : 'settings.syncOverview.notConfigured',
                {
                  provider:
                    connectionInfo?.provider === 'webdav'
                      ? 'WebDAV'
                      : connectionInfo?.provider === 'github'
                        ? 'GitHub'
                        : 'Gitee',
                },
              )}
            </h2>
            <p className="settings-help">
              {t(
                !available
                  ? 'settings.syncUnavailable'
                  : connected
                    ? connectionInfo.automatic
                      ? 'settings.syncOverview.automatic'
                      : 'settings.syncOverview.manual'
                    : 'settings.syncHelp',
              )}
            </p>
          </div>
        </div>
        {connected && (
          <p className="sync-last-success">
            {status.lastSuccess
              ? t('settings.lastSync', {
                  date: new Date(status.lastSuccess).toLocaleString(i18n.language),
                })
              : t('settings.syncOverview.noSuccess')}
          </p>
        )}
        <div className="settings-form-actions sync-overview-actions">
          {connected && (
            <Button type="button" disabled={busy || isDirty || loading} onClick={() => run('auto')}>
              {t(actions.formState.isSubmitting ? 'settings.syncing' : 'settings.twoWaySync')}
            </Button>
          )}
          <Button
            type="button"
            variant={connected || editing ? 'outline' : 'default'}
            aria-expanded={editing}
            disabled={busy || loading || loadFailed || !available}
            onClick={() => setEditing((value) => !value)}
          >
            <Settings2 size={16} aria-hidden="true" />
            {t(
              editing
                ? 'settings.syncOverview.collapse'
                : connected
                  ? 'settings.syncOverview.edit'
                  : 'settings.syncOverview.configure',
            )}
          </Button>
          {loadFailed && (
            <Button
              type="button"
              variant="outline"
              onClick={() => setLoadAttempt((value) => value + 1)}
            >
              {t('settings.syncOverview.retryLoad')}
            </Button>
          )}
        </div>
        {isDirty && <p className="settings-help">{t('settings.syncDirtyHelp')}</p>}
        <FormError error={errors.root} />
        <FormError error={actions.formState.errors.root} />
        {status.lastError && (
          <p className="settings-form-error" role="alert">
            {storedErrorMessage(status.lastError)}
          </p>
        )}
        {status.nextRetryAt && (
          <p className="settings-help">
            {t('settings.syncRetry', {
              count: status.retryCount ?? 0,
              date: new Date(status.nextRetryAt).toLocaleString(i18n.language),
            })}
          </p>
        )}
      </section>
      <div className="sync-connection-editor" hidden={!editing}>
        <h2>{t('settings.sections.connection')}</h2>
        <form
          className="settings-form"
          noValidate
          onSubmit={(event) => {
            if (busy) {
              event.preventDefault();
              return;
            }
            void form.handleSubmit(async (draft) => {
              form.clearErrors('root');
              try {
                const origin =
                  draft.type === 'webdav'
                    ? new URL(draft.url).origin + '/*'
                    : draft.type === 'github'
                      ? 'https://api.github.com/*'
                      : 'https://gitee.com/*';
                if (!(await browser.permissions.request({ origins: [origin] }))) {
                  form.setError('root', { message: t('settings.syncPermission') });
                  return;
                }
                if (
                  draft.includePrivate &&
                  useRayTabStore.getState().state?.privateSecurity.locked
                ) {
                  form.setError('root', { message: 'settings.unlockPrivateForSync' });
                  return;
                }
                await saveSyncConfig({
                  connection: connectionFrom(draft),
                  automatic: draft.automatic,
                  includePrivate: draft.includePrivate,
                  privatePassword: useRayTabStore.getState().state?.privateSecurity.locked
                    ? undefined
                    : draft.privatePassword || undefined,
                });
                form.reset({
                  ...draft,
                  privatePassword: useRayTabStore.getState().state?.privateSecurity.locked
                    ? ''
                    : draft.privatePassword,
                });
                setConnectionInfo({ provider: draft.type, automatic: draft.automatic });
                setEditing(false);
                toast.success(t('settings.connectionSaved'));
              } catch (reason) {
                form.setError('root', { message: errorMessage(reason) });
              }
            })(event);
          }}
        >
          <fieldset disabled={busy || loading || !available}>
            <Controller
              control={form.control}
              name="type"
              render={({ field }) => (
                <SettingsSelect
                  label={t('settings.provider')}
                  value={field.value}
                  options={[
                    ['webdav', 'WebDAV'],
                    ['github', 'GitHub'],
                    ['gitee', 'Gitee'],
                  ]}
                  onChange={field.onChange}
                  disabled={busy || loading || !available}
                />
              )}
            />
            <div className="sync-connection-fields">
              {fields.map(([name, label, type]) => (
                <div
                  className={name === 'url' || name === 'token' ? 'sync-field-wide' : undefined}
                  key={name}
                >
                  <label>
                    {t('settings.' + label)}
                    <Input
                      type={type}
                      {...form.register(name)}
                      autoComplete={
                        name === 'username'
                          ? 'username'
                          : name === 'password'
                            ? 'current-password'
                            : undefined
                      }
                      placeholder={
                        name === 'url' ? 'https://dav.example.com/raytab.json' : undefined
                      }
                      aria-invalid={Boolean(errors[name])}
                    />
                  </label>
                  <FormError error={errors[name]} />
                </div>
              ))}
            </div>
            <div className="sync-connection-options">
              <Controller
                control={form.control}
                name="automatic"
                render={({ field }) => (
                  <Toggle
                    label={t('settings.automaticSync')}
                    checked={field.value}
                    onChange={field.onChange}
                    disabled={busy || loading || !available}
                  />
                )}
              />
              <Controller
                control={form.control}
                name="includePrivate"
                render={({ field }) => (
                  <Toggle
                    label={t('settings.includePrivate')}
                    checked={field.value}
                    onChange={field.onChange}
                    disabled={busy || loading || !available || locked}
                  />
                )}
              />
              {locked && <p className="settings-help">{t('settings.unlockPrivateForSync')}</p>}
              {includePrivate && (
                <div>
                  <label>
                    {t('settings.privateSyncPassword')}
                    <Input
                      type="password"
                      autoComplete="new-password"
                      {...form.register('privatePassword')}
                      aria-invalid={Boolean(errors.privatePassword)}
                      disabled={locked}
                    />
                  </label>
                  <FormError error={errors.privatePassword} />
                </div>
              )}
            </div>
            <div className="settings-form-actions">
              <Button
                type="submit"
                size="sm"
                disabled={busy || loading || !available || (locked && includePrivate)}
              >
                {t(isSubmitting ? 'settings.saving' : 'settings.saveConnection')}
              </Button>
            </div>
          </fieldset>
        </form>
      </div>
      {connected && (
        <details className="settings-advanced">
          <summary>{t('settings.advancedSync')}</summary>
          <div className="settings-form-actions">
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={busy || !connected || isDirty}
              onClick={() => run('push')}
            >
              {t('settings.overwriteCloud')}
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={busy || !connected || isDirty}
              onClick={() => run('pull')}
            >
              {t('settings.restoreCloud')}
            </Button>
            <Button
              type="button"
              variant="destructive"
              size="sm"
              disabled={busy || !connected}
              onClick={() => run('disconnect')}
            >
              {t('settings.disconnect')}
            </Button>
          </div>
        </details>
      )}
      {status.conflicts.length > 0 && (
        <SettingsSection title={t('settings.conflicts')}>
          <div className="sync-conflicts">
            {status.conflicts.map((conflict, index) => (
              <div className="sync-conflict" key={conflict.key}>
                <strong>{t('settings.conflictNumber', { number: index + 1 })}</strong>
                <small>{t('settings.localValue', { value: summarize(conflict.local) })}</small>
                <small>{t('settings.remoteValue', { value: summarize(conflict.remote) })}</small>
                {conflict.id === 'private-space' && (
                  <p className="settings-help">{t('settings.privateSyncConflictHelp')}</p>
                )}
                <div className="settings-form-actions">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={busy || (conflict.id === 'private-space' && isDirty)}
                    onClick={() =>
                      conflict.id === 'private-space'
                        ? run('push')
                        : run('resolve', conflict, 'local')
                    }
                  >
                    {t(
                      conflict.id === 'private-space'
                        ? 'settings.overwriteCloud'
                        : 'settings.keepLocal',
                    )}
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={busy || (conflict.id === 'private-space' && isDirty)}
                    onClick={() =>
                      conflict.id === 'private-space'
                        ? run('pull')
                        : run('resolve', conflict, 'remote')
                    }
                  >
                    {t(
                      conflict.id === 'private-space'
                        ? 'settings.restoreCloud'
                        : 'settings.useRemote',
                    )}
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </SettingsSection>
      )}
      {confirmation}
    </div>
  );
}
function summarize(value: unknown) {
  const text = typeof value === 'string' ? value : (JSON.stringify(value) ?? '');
  return text.length > 100 ? text.slice(0, 97) + '…' : text;
}
