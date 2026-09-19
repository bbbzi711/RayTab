import { useMemo, useState } from 'react';
import { ArchiveRestore, BookOpenCheck } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { t, type Language } from '@/locales';
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
  type BookmarkCandidate,
} from '@/features/import/bookmarks';
import { dispatch, refresh, repository } from '@/storage/store';
import type { RayState, SpaceId } from '@/storage/model';

export function DataSettings({
  state,
  spaceId,
  language,
  onError,
}: {
  state: RayState;
  spaceId: SpaceId;
  language: Language;
  onError: (message: string) => void;
}) {
  const tr = (text: string) => t(language, text);
  const [sourceCandidates, setSourceCandidates] = useState<BookmarkCandidate[]>([]);
  const [duplicateMode, setDuplicateMode] = useState<'skip-url' | 'keep-all'>('skip-url');
  const [organizeMode, setOrganizeMode] = useState<'folders' | 'flat'>('folders');
  const [targetDesktopId, setTargetDesktopId] = useState(state.local.activeDesktop[spaceId]);
  const [document, setDocument] = useState<BackupDocument>();
  const [password, setPassword] = useState('');
  const [backupRange, setBackupRange] = useState<SpaceId | 'all'>('all');
  const candidates = useMemo(() => {
    const organized =
      organizeMode === 'flat'
        ? sourceCandidates.map((item) => ({ ...item, category: tr('导入书签') }))
        : sourceCandidates;
    return deduplicateBookmarks(
      organized,
      state.spaces[spaceId].sites.map((item) => item.url),
      duplicateMode,
    );
  }, [duplicateMode, organizeMode, sourceCandidates, spaceId, state.spaces]);
  const preview = (items: BookmarkCandidate[]) => setSourceCandidates(items);
  const importNow = async () => {
    try {
      await dispatch({
        type: 'import-bookmarks',
        spaceId,
        desktopId: targetDesktopId,
        items: candidates,
      });
      setSourceCandidates([]);
    } catch (error) {
      onError((error as Error).message);
    }
  };
  const exportBackup = async () => {
    try {
      const snapshot = await repository.snapshot();
      const backup = await createBackup(
        snapshot.state,
        snapshot.resources,
        backupRange,
        state.privateSecurity.protected && backupRange !== 'normal' ? password : undefined,
      );
      download(
        `raytab-${backupRange}-backup-${new Date().toISOString().slice(0, 10)}.json`,
        JSON.stringify(backup, null, 2),
      );
    } catch (error) {
      onError((error as Error).message);
    }
  };
  const restore = async (mode: 'merge' | 'replace') => {
    if (!document) return;
    try {
      const result = await restoreBackup(state, document, mode, password || undefined);
      await repository.restore(result.state, result.resources);
      await refresh();
      setDocument(undefined);
    } catch (error) {
      onError((error as Error).message);
    }
  };
  return (
    <div className="data-settings">
      <section>
        <div className="data-section-heading">
          <span aria-hidden="true">
            <BookOpenCheck size={18} />
          </span>
          <div>
            <h3>{tr('导入书签')}</h3>
            <p>{tr('先预览并按书签文件夹建立分类，重复网址默认跳过。')}</p>
          </div>
        </div>
        <div className="data-actions">
          <Button
            variant="outline"
            size="sm"
            onClick={() =>
              void readBrowserBookmarks()
                .then(preview)
                .catch((error: Error) => onError(error.message))
            }
          >
            {tr('读取浏览器书签')}
          </Button>
          <label className="file-button">
            {tr('选择 HTML')}
            <input
              type="file"
              accept="text/html,.html"
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (file)
                  void file
                    .text()
                    .then(parseBookmarkHtml)
                    .then(preview)
                    .catch((error: Error) => onError(error.message));
              }}
            />
          </label>
        </div>
        {sourceCandidates.length > 0 && (
          <div className="data-preview">
            <div className="import-options">
              <label>
                {tr('整理方式')}
                <select
                  value={organizeMode}
                  onChange={(event) => setOrganizeMode(event.target.value as typeof organizeMode)}
                >
                  <option value="folders">{tr('按书签文件夹建立分类')}</option>
                  <option value="flat">{tr('全部放入“导入书签”')}</option>
                </select>
              </label>
              <label>
                {tr('重复网址')}
                <select
                  value={duplicateMode}
                  onChange={(event) => setDuplicateMode(event.target.value as typeof duplicateMode)}
                >
                  <option value="skip-url">{tr('跳过重复网址')}</option>
                  <option value="keep-all">{tr('全部保留')}</option>
                </select>
              </label>
              <label>
                {tr('目标桌面')}
                <select
                  value={targetDesktopId}
                  onChange={(event) => setTargetDesktopId(event.target.value)}
                >
                  {[...state.spaces[spaceId].desktops]
                    .sort((a, b) => a.order - b.order)
                    .map((desktop) => (
                      <option key={desktop.id} value={desktop.id}>
                        {desktop.name}
                      </option>
                    ))}
                </select>
              </label>
            </div>
            <strong>
              {tr('准备导入')} {candidates.length} {tr('个网站')}
            </strong>
            {sourceCandidates.length !== candidates.length && (
              <span>
                {tr('已跳过')} {sourceCandidates.length - candidates.length} {tr('个重复网址')}
              </span>
            )}
            <span>
              {new Set(candidates.map((item) => item.category)).size}{' '}
              {tr('个分类，将保存到所选桌面')}
            </span>
            <Button size="sm" onClick={() => void importNow()}>
              {tr('确认导入')}
            </Button>
          </div>
        )}
      </section>
      <section>
        <div className="data-section-heading">
          <span aria-hidden="true">
            <ArchiveRestore size={18} />
          </span>
          <div>
            <h3>{tr('备份与恢复')}</h3>
            <p>{tr('备份包含两个空间、设置和本地图片，不包含同步凭据。')}</p>
          </div>
        </div>
        <label className="data-select-row">
          <span>{tr('导出范围')}</span>
          <select
            value={backupRange}
            onChange={(event) => setBackupRange(event.target.value as SpaceId | 'all')}
          >
            <option value="all">{tr('全部空间')}</option>
            <option value="normal">{tr('普通空间')}</option>
            <option value="private">{tr('私密空间')}</option>
          </select>
        </label>
        {state.privateSecurity.protected && backupRange !== 'normal' && (
          <input
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            minLength={6}
            placeholder={tr('私密空间备份密码')}
          />
        )}
        <div className="data-actions">
          <Button variant="outline" size="sm" onClick={() => void exportBackup()}>
            {tr('导出所选备份')}
          </Button>
          <label className="file-button">
            {tr('选择备份文件')}
            <input
              type="file"
              accept="application/json,.json"
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (file)
                  void file
                    .text()
                    .then(parseBackup)
                    .then(setDocument)
                    .catch((error: Error) => onError(error.message));
              }}
            />
          </label>
        </div>
        {document && (
          <div className="data-preview">
            <strong>{tr('备份内容预览')}</strong>
            <code>{JSON.stringify(backupSummary(document))}</code>
            <span>{tr('合并会保留较新的记录；替换会覆盖备份包含的空间。')}</span>
            <div className="data-actions">
              <Button size="sm" variant="outline" onClick={() => void restore('merge')}>
                {tr('合并恢复')}
              </Button>
              <Button size="sm" variant="destructive" onClick={() => void restore('replace')}>
                {tr('替换恢复')}
              </Button>
            </div>
          </div>
        )}
      </section>
    </div>
  );
}

function download(name: string, content: string) {
  const url = URL.createObjectURL(new Blob([content], { type: 'application/json' }));
  const anchor = window.document.createElement('a');
  anchor.href = url;
  anchor.download = name;
  anchor.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}
