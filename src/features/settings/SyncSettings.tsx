import { useEffect, useState, type FormEvent } from 'react';
import { CloudCog, GitBranch, Server } from 'lucide-react';
import { Button } from '@/components/ui/button';
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
import { refresh } from '@/storage/store';
import { t, type Language } from '@/locales';

type SyncDraft = {
  type: SyncConnection['type'];
  url: string;
  username: string;
  password: string;
  token: string;
  owner: string;
  repo: string;
  path: string;
  branch: string;
  automatic: boolean;
  includePrivate: boolean;
  privatePassword: string;
};

const emptyDraft: SyncDraft = {
  type: 'webdav',
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

export function SyncSettings({
  language,
  onError,
}: {
  language: Language;
  onError: (message: string) => void;
}) {
  const tr = (text: string) => t(language, text);
  const [draft, setDraft] = useState<SyncDraft>(emptyDraft);
  const [connected, setConnected] = useState(false);
  const [status, setStatus] = useState<SyncStatus>({ conflicts: [] });
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    let mounted = true;
    void Promise.all([loadSyncConfig(), loadSyncStatus()])
      .then(([config, nextStatus]) => {
        if (!mounted) return;
        setConnected(Boolean(config));
        setDraft(draftFromConfig(config));
        setStatus(nextStatus);
      })
      .catch((error: Error) => {
        if (mounted) onError(error.message);
      });
    return () => {
      mounted = false;
    };
  }, []);
  const update = <K extends keyof SyncDraft>(key: K, value: SyncDraft[K]) =>
    setDraft((current) => ({ ...current, [key]: value }));
  const save = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const common = {
      token: draft.token,
      owner: draft.owner,
      repo: draft.repo,
      path: draft.path || 'raytab.json',
      branch: draft.branch || undefined,
    };
    const connection: SyncConnection =
      draft.type === 'webdav'
        ? {
            type: draft.type,
            url: draft.url,
            username: draft.username,
            password: draft.password,
          }
        : draft.type === 'github'
          ? { type: draft.type, ...common }
          : { type: draft.type, ...common };
    try {
      const origin =
        draft.type === 'webdav'
          ? `${new URL((connection as Extract<SyncConnection, { type: 'webdav' }>).url).origin}/*`
          : draft.type === 'github'
            ? 'https://api.github.com/*'
            : 'https://gitee.com/*';
      const allowed = await browser.permissions.request({ origins: [origin] });
      if (!allowed) throw new Error(tr('未授予访问同步服务的权限'));
      await saveSyncConfig({
        connection,
        includePrivate: draft.includePrivate,
        privatePassword: draft.privatePassword || undefined,
        automatic: draft.automatic,
      });
      setConnected(true);
      await run('auto');
    } catch (error) {
      onError((error as Error).message);
    }
  };
  const disconnect = async () => {
    if (!confirm(tr('清除当前同步连接？'))) return;
    setBusy(true);
    try {
      await clearSyncConfig();
      setDraft(emptyDraft);
      setConnected(false);
      setStatus({ conflicts: [] });
    } catch (error) {
      onError((error as Error).message);
    } finally {
      setBusy(false);
    }
  };
  const run = async (mode: 'auto' | 'push' | 'pull') => {
    setBusy(true);
    try {
      await synchronize(mode);
      await refresh();
      setStatus(await loadSyncStatus());
    } catch (error) {
      onError((error as Error).message);
      setStatus(await loadSyncStatus());
    } finally {
      setBusy(false);
    }
  };
  const resolve = async (index: number, choice: 'local' | 'remote') => {
    setBusy(true);
    try {
      await resolveSyncConflict(index, choice);
      await refresh();
      setStatus(await loadSyncStatus());
    } catch (error) {
      onError((error as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <form className="sync-settings" onSubmit={save}>
      <div className="sync-intro">
        <span aria-hidden="true">
          <CloudCog size={19} />
        </span>
        <div>
          <strong>{tr('同步')}</strong>
          <p>{tr('同步核心与服务适配器分离，连接信息只保存在本机。')}</p>
        </div>
      </div>
      <label className="sync-provider">
        <span>
          {draft.type === 'webdav' ? <Server size={16} /> : <GitBranch size={16} />}
          {tr('服务')}
        </span>
        <select
          value={draft.type}
          onChange={(event) => update('type', event.target.value as SyncConnection['type'])}
        >
          <option value="webdav">WebDAV</option>
          <option value="github">GitHub {tr('仓库')}</option>
          <option value="gitee">Gitee {tr('仓库')}</option>
        </select>
      </label>
      {draft.type === 'webdav' ? (
        <>
          <label>
            {tr('文件地址')}
            <input
              name="url"
              type="url"
              required
              placeholder="https://dav.example.com/raytab.json"
              value={draft.url}
              onChange={(event) => update('url', event.target.value)}
            />
          </label>
          <label>
            {tr('用户名')}
            <input
              name="username"
              autoComplete="username"
              value={draft.username}
              onChange={(event) => update('username', event.target.value)}
            />
          </label>
          <label>
            {tr('密码')}
            <input
              name="password"
              type="password"
              autoComplete="current-password"
              value={draft.password}
              onChange={(event) => update('password', event.target.value)}
            />
          </label>
        </>
      ) : (
        <>
          <label>
            {tr('访问令牌')}
            <input
              name="token"
              type="password"
              required
              value={draft.token}
              onChange={(event) => update('token', event.target.value)}
            />
          </label>
          <div className="sync-pair">
            <label>
              {tr('所有者')}
              <input
                name="owner"
                required
                value={draft.owner}
                onChange={(event) => update('owner', event.target.value)}
              />
            </label>
            <label>
              {tr('仓库')}
              <input
                name="repo"
                required
                value={draft.repo}
                onChange={(event) => update('repo', event.target.value)}
              />
            </label>
          </div>
          <label>
            {tr('文件路径')}
            <input
              name="path"
              value={draft.path}
              onChange={(event) => update('path', event.target.value)}
              required
            />
          </label>
          <label>
            {tr('分支（可选）')}
            <input
              name="branch"
              value={draft.branch}
              onChange={(event) => update('branch', event.target.value)}
            />
          </label>
        </>
      )}
      <label className="setting-row">
        <span>{tr('自动双向同步')}</span>
        <input
          name="automatic"
          type="checkbox"
          checked={draft.automatic}
          onChange={(event) => update('automatic', event.target.checked)}
        />
      </label>
      <label className="setting-row">
        <span>{tr('同步私密空间')}</span>
        <input
          name="includePrivate"
          type="checkbox"
          checked={draft.includePrivate}
          onChange={(event) => update('includePrivate', event.target.checked)}
        />
      </label>
      <label>
        {tr('私密同步密码（启用私密空间时）')}
        <input
          name="privatePassword"
          type="password"
          minLength={6}
          value={draft.privatePassword}
          onChange={(event) => update('privatePassword', event.target.value)}
        />
      </label>
      <Button type="submit" size="sm" disabled={busy}>
        {busy ? tr('同步中…') : tr('保存并同步')}
      </Button>
      <div className="data-actions">
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={busy}
          onClick={() => void run('auto')}
        >
          {tr('双向同步')}
        </Button>
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={busy}
          onClick={() => void run('push')}
        >
          {tr('本机覆盖云端')}
        </Button>
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={busy}
          onClick={() => void run('pull')}
        >
          {tr('云端恢复本机')}
        </Button>
        {connected && (
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={busy}
            onClick={() => void disconnect()}
          >
            {tr('清除连接')}
          </Button>
        )}
      </div>
      {status.lastSuccess && (
        <p className="settings-help">
          {tr('上次成功：')}
          {new Date(status.lastSuccess).toLocaleString()} · {tr('冲突')} {status.conflicts.length}
        </p>
      )}
      {status.lastError && <p className="sync-error">{status.lastError}</p>}
      {status.nextRetryAt && status.retryCount ? (
        <p className="settings-help">
          {tr('自动重试')} {status.retryCount} {tr('次 · 下次不早于')}{' '}
          {new Date(status.nextRetryAt).toLocaleString()}
        </p>
      ) : null}
      {status.conflicts.length > 0 && (
        <section className="sync-conflicts" aria-label={tr('同步冲突')}>
          <h4>{tr('待处理冲突')}</h4>
          {status.conflicts.map((conflict, index) => (
            <div
              className="sync-conflict"
              key={`${conflict.entity}-${conflict.id}-${conflict.field}`}
            >
              <p>
                <strong>{conflict.entity}</strong> · {conflict.field}
              </p>
              <small>
                {tr('本机：')}
                {summarize(conflict.local)}
              </small>
              <small>
                {tr('远端：')}
                {summarize(conflict.remote)}
              </small>
              <div className="data-actions">
                <Button
                  type="button"
                  size="sm"
                  disabled={busy}
                  onClick={() => void resolve(index, 'local')}
                >
                  {tr('保留本机')}
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  disabled={busy}
                  onClick={() => void resolve(index, 'remote')}
                >
                  {tr('采用远端')}
                </Button>
              </div>
            </div>
          ))}
        </section>
      )}
    </form>
  );
}

function summarize(value: unknown) {
  const text = typeof value === 'string' ? value : JSON.stringify(value);
  return text.length > 100 ? `${text.slice(0, 97)}…` : text;
}
