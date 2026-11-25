import { useEffect, useMemo, useState } from 'react';
import { Controller, useForm, useWatch } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from '@/lib/zod';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { Settings2 } from 'lucide-react';
import { DataSettings } from './DataSettings';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useConfirm } from '@/components/ui/confirm-dialog';
import {
  clearSyncConfig,
  InvalidSyncConfigError,
  loadSyncConfig,
  loadSyncStatus,
  resolveSyncConflict,
  saveSyncConfig,
  synchronize,
  syncTarget,
  type SyncStatus,
} from '@/sync/core/engine';
import { SyncProviderError, type SyncConnection } from '@/sync/providers/types';
import { resolveWebDavFileUrl } from '@/sync/providers/webdav';
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
export const createSyncDraftSchema = (privateLocked: boolean, privateProtected = privateLocked) =>
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
        try {
          resolveWebDavFileUrl(draft.url);
        } catch {
          ctx.addIssue({ code: 'custom', path: ['url'], message: 'settings.syncInvalidUrl' });
        }
      } else {
        if (![draft.owner, draft.repo].every((part) => /^[^/\s]+$/.test(part)))
          ctx.addIssue({
            code: 'custom',
            path: ['repo'],
            message: 'settings.syncInvalidRepository',
          });
        for (const key of ['token', 'path'] as const)
          if (!draft[key])
            ctx.addIssue({ code: 'custom', path: [key], message: 'settings.required' });
      }
      if (draft.includePrivate && privateProtected && privateLocked)
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

export function SyncSettings({ report, localBusy }: { report: DraftReporter; localBusy: boolean }) {
  const { t, i18n } = useTranslation();
  const refresh = useRayTabStore((store) => store.refresh);
  const groupIndex = useRayTabStore((store) => store.state?.encryptedGroupIndex);
  const protectedGroupNames = useMemo(
    () => new Map(groupIndex?.labels.map((group) => [group.id, group.name])),
    [groupIndex],
  );
  const locked = useRayTabStore((store) => store.state?.privateSecurity.locked);
  const protectedPrivate = useRayTabStore((store) => store.state?.privateSecurity.protected);
  const available =
    typeof browser !== 'undefined' &&
    Boolean(browser.storage?.local && browser.permissions?.request);
  const [confirm, confirmation] = useConfirm();
  const [connectionInfo, setConnectionInfo] = useState<{
    provider: SyncDraft['type'];
    target: string;
    automatic: boolean;
    includePrivate: boolean;
    hasSyncPassword: boolean;
  } | null>(null);
  const connected = connectionInfo !== null;
  const [editing, setEditing] = useState(false);
  const [repoSeparator, setRepoSeparator] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadFailure, setLoadFailure] = useState<'invalid' | 'unavailable'>();
  const [loadAttempt, setLoadAttempt] = useState(0);
  const [status, setStatus] = useState<SyncStatus>({ schemaVersion: 1, conflicts: [] });
  const recoveryGroupName = useRayTabStore(
    (store) =>
      store.state?.spaces.normal.groups.find((group) => group.id === status.recovery?.groupId)
        ?.name,
  );
  const syncDraftSchema = useMemo(
    () => createSyncDraftSchema(Boolean(locked), Boolean(protectedPrivate)),
    [locked, protectedPrivate],
  );
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
  const formDisabled = localBusy || busy || loading || !available || loadFailure === 'unavailable';
  const provider = useWatch({ control: form.control, name: 'type' });
  const [owner, repo] = useWatch({ control: form.control, name: ['owner', 'repo'] });
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
    setLoadFailure(undefined);
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
      setLoadFailure(undefined);
      setStatus(nextStatus);
      const values = draftFromConfig(config);
      if (useRayTabStore.getState().state?.privateSecurity.locked) values.privatePassword = '';
      const previousProvider = form.getValues('type');
      const previousToken = form.getValues('token');
      reset(values, { keepDirtyValues: true });
      const selectedProvider = form.getValues('type');
      // RHF merges dirty fields separately. Keep a token paired with the provider that supplied it.
      if (selectedProvider !== previousProvider || selectedProvider !== values.type)
        form.setValue('token', selectedProvider === values.type ? values.token : previousToken, {
          shouldDirty: true,
        });
      if (useRayTabStore.getState().state?.privateSecurity.locked)
        resetField('privatePassword', { defaultValue: '' });
      setConnectionInfo(
        config
          ? {
              provider: config.connection.type,
              target: syncTarget(config.connection),
              automatic: config.automatic,
              includePrivate: config.includePrivate,
              hasSyncPassword: Boolean(config.privatePassword),
            }
          : null,
      );
    };
    void reload()
      .catch((reason: unknown) => {
        if (mounted) {
          const invalid =
            reason instanceof InvalidSyncConfigError ||
            (reason instanceof SyncProviderError && reason.code === 'invalid');
          setLoadFailure(invalid ? 'invalid' : 'unavailable');
          if (invalid) setConnectionInfo(null);
          setEditing(true);
          form.setError('root', { message: errorMessage(reason) });
        }
      })
      .finally(() => {
        if (mounted) setLoading(false);
      });
    const refreshConnection = () => {
      void reload().catch((reason: unknown) => {
        if (mounted) toast.error(errorMessage(reason));
      });
    };
    const changed: Parameters<typeof browser.storage.onChanged.addListener>[0] = (
      changes,
      area,
    ) => {
      if (
        (area === 'local' && (changes['raytab-sync-status'] || changes['raytab-sync-config'])) ||
        (area === 'session' && changes['raytab-sync-private-password'])
      )
        refreshConnection();
    };
    const unsubscribe = useRayTabStore.subscribe((store, previous) => {
      if (store.state?.privateSecurity.locked !== previous.state?.privateSecurity.locked) {
        if (store.state?.privateSecurity.locked)
          resetField('privatePassword', { defaultValue: '' });
        refreshConnection();
      }
    });
    browser.storage.onChanged.addListener(changed);
    return () => {
      mounted = false;
      unsubscribe();
      browser.storage.onChanged.removeListener(changed);
      reset(emptyDraft);
    };
  }, [available, reset, resetField, loadAttempt]);
  const connectionFrom = (draft: SyncDraft): SyncConnection => {
    if (draft.type === 'webdav')
      return { type: 'webdav', url: draft.url, username: draft.username, password: draft.password };
    return {
      type: draft.type,
      token: draft.token,
      owner: draft.owner,
      repo: draft.repo,
      path: draft.path,
      branch: draft.branch || undefined,
    };
  };
  const run = (
    operation: z.infer<typeof actionSchema>['operation'],
    conflict?: SyncConflict,
    choice: 'local' | 'remote' = 'local',
  ) => {
    if (formDisabled || isDirty || !connectionInfo) return;
    const expected =
      operation === 'push' || operation === 'pull'
        ? { target: connectionInfo.target, includePrivate: connectionInfo.includePrivate }
        : undefined;
    actions.setValue('operation', operation);
    actions.setValue('conflict', conflict);
    actions.setValue('choice', choice);
    void actions.handleSubmit(async (values) => {
      actions.clearErrors();
      if (
        values.operation === 'disconnect' ||
        values.operation === 'pull' ||
        values.operation === 'push'
      ) {
        const confirmed = await confirm({
          title: t('settings.syncConfirm.' + values.operation + '.title'),
          description: t('settings.syncConfirm.' + values.operation + '.description', {
            scope: t(
              connectionInfo?.includePrivate
                ? 'settings.syncFullScope'
                : 'settings.syncPublicScope',
            ),
          }),
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
          setEditing(false);
          setConnectionInfo(null);
          setStatus({ schemaVersion: 1, conflicts: [] });
        } else if (values.operation === 'resolve' && values.conflict) {
          await resolveSyncConflict(values.conflict, values.choice);
          await refresh();
          setStatus(await loadSyncStatus());
        } else if (
          values.operation === 'auto' ||
          values.operation === 'pull' ||
          values.operation === 'push'
        ) {
          await synchronize(values.operation, expected);
          await refresh();
          setStatus(await loadSyncStatus());
        }
        toast.success(
          t(
            values.operation === 'disconnect'
              ? 'settings.syncDisconnected'
              : values.operation === 'pull'
                ? 'settings.backupRestored'
                : values.operation === 'push'
                  ? 'settings.cloudReplaced'
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
  const renderField = (
    name: 'url' | 'username' | 'password' | 'token' | 'path' | 'branch',
    type = 'text',
    placeholder?: string,
  ) => (
    <div className={name === 'url' ? 'col-span-full' : undefined}>
      <label>
        {t('settings.' + (name === 'url' ? 'serverAddress' : name))}
        <Input
          type={type}
          {...form.register(name)}
          autoComplete={
            name === 'username' ? 'username' : name === 'password' ? 'current-password' : undefined
          }
          placeholder={placeholder}
          aria-invalid={Boolean(errors[name])}
        />
      </label>
      <FormError error={errors[name]} />
    </div>
  );
  const encryptedSyncHint =
    connectionInfo?.includePrivate &&
    (locked
      ? connectionInfo.automatic
        ? 'settings.syncEncryptedLockedAutomatic'
        : 'settings.syncEncryptedLocked'
      : !connectionInfo.hasSyncPassword
        ? 'settings.syncEncryptedNeedsPassword'
        : undefined);
  const actionError = actions.formState.errors.root;
  const lastError = storedErrorMessage(status.lastError);
  const showLastError = lastError && lastError !== actionError?.message;
  return (
    <div className="sync-settings grid min-w-0 gap-4">
      <SettingsSection>
        <fieldset disabled={localBusy} className="grid min-w-0 gap-2">
          <section className="grid min-w-0 gap-2" aria-label={t('settings.syncOverview.status')}>
            <div className="flex min-w-0 flex-wrap items-center justify-between gap-2 py-1">
              <div className="min-w-0">
                <h2 className="wrap-anywhere text-sm font-semibold">
                  {connected
                    ? t('settings.providerSync', {
                        provider: { webdav: 'WebDAV', github: 'GitHub', gitee: 'Gitee' }[
                          connectionInfo.provider
                        ],
                      })
                    : t('settings.cloudSync')}
                </h2>
                <p className="wrap-anywhere text-xs leading-5 text-muted-foreground">
                  {!available
                    ? t('settings.syncUnavailable')
                    : loading
                      ? t('settings.syncOverview.loading')
                      : loadFailure
                        ? t('settings.syncOverview.loadFailed')
                        : !connected
                          ? t('settings.syncOverview.notConfigured')
                          : status.lastSuccess
                            ? t('settings.lastSync', {
                                date: new Date(status.lastSuccess).toLocaleString(i18n.language),
                              })
                            : t('settings.syncOverview.noSuccess')}
                </p>
              </div>
              {available && (
                <div className="settings-form-actions">
                  {connected && (
                    <Button
                      type="button"
                      size="form-action"
                      disabled={formDisabled || isDirty}
                      onClick={() => run('auto')}
                    >
                      {t(
                        actions.formState.isSubmitting && actions.getValues('operation') === 'auto'
                          ? 'settings.syncing'
                          : 'settings.syncNow',
                      )}
                    </Button>
                  )}
                  <Button
                    type="button"
                    size={connected ? 'icon-sm' : 'form-action'}
                    variant="outline"
                    aria-expanded={editing}
                    aria-controls="sync-connection-editor"
                    aria-label={t(
                      connected ? 'settings.manageConnection' : 'settings.configureConnection',
                    )}
                    title={connected ? t('settings.manageConnection') : undefined}
                    disabled={formDisabled || isDirty}
                    onClick={() => {
                      setEditing(!editing);
                      setRepoSeparator(false);
                    }}
                  >
                    {connected ? (
                      <Settings2 aria-hidden="true" />
                    ) : (
                      t('settings.configureConnection')
                    )}
                  </Button>
                  {loadFailure && (
                    <Button
                      type="button"
                      size="form-action"
                      variant="outline"
                      onClick={() => setLoadAttempt((value) => value + 1)}
                    >
                      {t('settings.syncOverview.retryLoad')}
                    </Button>
                  )}
                </div>
              )}
            </div>
            {encryptedSyncHint && (
              <p role="status" className="wrap-anywhere text-xs text-muted-foreground">
                {t(encryptedSyncHint)}
              </p>
            )}
            {status.recovery && (
              <p role="status" className="wrap-anywhere text-xs leading-5 text-muted-foreground">
                {t('settings.syncRecovered', {
                  sites: status.recovery.sites,
                  folders: status.recovery.folders,
                  group: recoveryGroupName ?? 'Recovered',
                })}
              </p>
            )}
            {isDirty && (
              <p className="wrap-anywhere text-xs leading-5 text-muted-foreground">
                {t('settings.syncDirtyHelp')}
              </p>
            )}
            {(actionError?.message || showLastError || status.nextRetryAt) && (
              <div className="grid gap-1">
                <FormError error={actionError} />
                {showLastError && (
                  <p className="wrap-anywhere text-xs text-destructive" role="alert">
                    {lastError}
                  </p>
                )}
                {status.nextRetryAt && (
                  <p className="wrap-anywhere text-xs leading-5 text-muted-foreground">
                    {t('settings.syncRetry', {
                      count: status.retryCount ?? 0,
                      date: new Date(status.nextRetryAt).toLocaleString(i18n.language),
                    })}
                  </p>
                )}
              </div>
            )}
          </section>
          <div
            id="sync-connection-editor"
            hidden={!editing}
            className="border-t border-border pt-2"
          >
            <form
              aria-label={t('settings.sections.connection')}
              className="settings-form grid min-w-0 gap-3.5 text-sm"
              noValidate
              onSubmit={(event) => {
                if (formDisabled) {
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
                    const connection = connectionFrom(draft);
                    await saveSyncConfig({
                      connection,
                      automatic: draft.automatic,
                      includePrivate: draft.includePrivate,
                      privatePassword: draft.includePrivate ? draft.privatePassword : undefined,
                    });
                    form.reset({
                      ...draft,
                      privatePassword:
                        draft.includePrivate &&
                        !useRayTabStore.getState().state?.privateSecurity.locked
                          ? draft.privatePassword
                          : '',
                    });
                    setConnectionInfo({
                      provider: draft.type,
                      target: syncTarget(connection),
                      automatic: draft.automatic,
                      includePrivate: draft.includePrivate,
                      hasSyncPassword: draft.includePrivate && Boolean(draft.privatePassword),
                    });
                    setRepoSeparator(false);
                    setEditing(false);
                    toast.success(t('settings.connectionSaved'));
                  } catch (reason) {
                    form.setError('root', { message: errorMessage(reason) });
                  }
                })(event);
              }}
            >
              <fieldset disabled={formDisabled}>
                <Controller
                  control={form.control}
                  name="type"
                  render={({ field }) => (
                    <SettingsSelect
                      triggerClassName="sync-provider-select"
                      label={t('settings.provider')}
                      value={field.value}
                      options={[
                        ['webdav', 'WebDAV'],
                        ['github', 'GitHub'],
                        ['gitee', 'Gitee'],
                      ]}
                      onChange={(value) => {
                        if (value !== field.value)
                          form.setValue('token', '', { shouldDirty: true });
                        field.onChange(value);
                      }}
                      disabled={formDisabled}
                    />
                  )}
                />
                {provider === 'webdav' ? (
                  <div className="sync-columns">
                    {renderField('url', 'url', 'https://dav.jianguoyun.com/dav/')}
                    {renderField('username')}
                    {renderField('password', 'password')}
                  </div>
                ) : (
                  <div className="sync-columns">
                    <Controller
                      control={form.control}
                      name="repo"
                      render={({ field }) => (
                        <div>
                          <label>
                            {t('settings.repo')}
                            <Input
                              ref={field.ref}
                              name={field.name}
                              onBlur={field.onBlur}
                              value={owner + (repo || repoSeparator ? '/' + repo : '')}
                              onChange={(event) => {
                                const [nextOwner, ...name] = event.target.value.split('/');
                                setRepoSeparator(name.length > 0);
                                form.setValue('owner', nextOwner, { shouldDirty: true });
                                field.onChange(name.join('/'));
                              }}
                              placeholder="owner/repo"
                              aria-invalid={Boolean(errors.repo)}
                            />
                          </label>
                          <FormError error={errors.repo} />
                        </div>
                      )}
                    />
                    {renderField('token', 'password')}
                    {renderField('path', 'text', emptyDraft.path)}
                    {renderField('branch', 'text', t('settings.defaultBranch'))}
                  </div>
                )}
                <div className="grid min-w-0 border-y border-border py-1">
                  <Controller
                    control={form.control}
                    name="automatic"
                    render={({ field }) => (
                      <Toggle
                        label={t('settings.automaticSync')}
                        checked={field.value}
                        onChange={field.onChange}
                        disabled={formDisabled}
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
                        disabled={formDisabled || (locked && !field.value)}
                      />
                    )}
                  />
                  {locked && (
                    <p className="wrap-anywhere text-xs leading-5 text-muted-foreground">
                      {t('settings.unlockPrivateForSync')}
                    </p>
                  )}
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
                <a
                  href="https://github.com/bbbzi711/RayTab/blob/main/PRIVACY.md"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="justify-self-start text-xs leading-5 text-muted-foreground underline underline-offset-4"
                >
                  {t('settings.privacyPolicy')}
                </a>
                <FormError error={errors.root} />
                <div className="settings-form-actions">
                  <Button
                    type="submit"
                    size="form-action"
                    disabled={formDisabled || (locked && includePrivate)}
                  >
                    {t(isSubmitting ? 'settings.saving' : 'settings.saveConnection')}
                  </Button>
                  {!loadFailure && (
                    <Button
                      type="button"
                      size="form-action"
                      variant="ghost"
                      disabled={formDisabled}
                      onClick={() => {
                        form.reset();
                        setEditing(false);
                        setRepoSeparator(false);
                      }}
                    >
                      {t('settings.cancel')}
                    </Button>
                  )}
                </div>
              </fieldset>
            </form>
            {connected && (
              <div className="settings-form-actions mt-3 border-t border-border pt-3">
                <Button
                  type="button"
                  variant="outline"
                  size="form-action"
                  disabled={formDisabled || isDirty}
                  onClick={() => run('push')}
                >
                  {t('settings.replaceCloud')}
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="form-action"
                  disabled={formDisabled || isDirty}
                  onClick={() => run('disconnect')}
                >
                  {t('settings.disconnect')}
                </Button>
              </div>
            )}
          </div>
        </fieldset>
      </SettingsSection>
      {status.conflicts.length > 0 && (
        <SettingsSection title={t('settings.conflicts')}>
          <div className="sync-conflicts">
            {status.conflicts.map((conflict, index) => (
              <div className="sync-conflict" key={conflict.key}>
                <strong>{t('settings.conflictNumber', { number: index + 1 })}</strong>
                {conflict.field === 'protected-group' ||
                conflict.field === 'protected-settings' ||
                conflict.id === 'private-space' ? (
                  <p className="wrap-anywhere text-xs text-muted-foreground">
                    {conflict.id === 'private-space'
                      ? t('settings.legacySyncConflict')
                      : conflict.field === 'protected-group'
                        ? t('settings.protectedGroupConflict', {
                            name:
                              protectedGroupNames.get(conflict.id) ?? t('settings.privateSpace'),
                          })
                        : t('settings.privateSyncConflictHelp')}
                  </p>
                ) : (
                  <>
                    <small>{t('settings.localValue', { value: summarize(conflict.local) })}</small>
                    <small>
                      {t('settings.remoteValue', { value: summarize(conflict.remote) })}
                    </small>
                  </>
                )}
                {conflict.id === 'private-space' ? (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={busy || localBusy || isDirty}
                    onClick={() => run('auto')}
                  >
                    {t('settings.syncNow')}
                  </Button>
                ) : (
                  <div className="settings-form-actions">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      disabled={busy || localBusy || isDirty}
                      onClick={() => run('resolve', conflict, 'local')}
                    >
                      {t('settings.keepLocal')}
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      disabled={busy || localBusy || isDirty}
                      onClick={() => run('resolve', conflict, 'remote')}
                    >
                      {t('settings.useRemote')}
                    </Button>
                  </div>
                )}
              </div>
            ))}
          </div>
        </SettingsSection>
      )}
      <fieldset className="min-w-0" disabled={busy || localBusy}>
        <DataSettings
          report={report}
          disabled={busy || localBusy}
          cloudRestore={{
            available: connected && !loading && !isDirty && !loadFailure,
            run: () => run('pull'),
            hint: !connected
              ? t('settings.connectToRestore')
              : isDirty
                ? t('settings.syncDirtyHelp')
                : undefined,
          }}
        />
      </fieldset>
      {confirmation}
    </div>
  );
}
function summarize(value: unknown) {
  const text = typeof value === 'string' ? value : (JSON.stringify(value) ?? '');
  return text.length > 100 ? text.slice(0, 97) + '…' : text;
}
