import { useMemo, useState } from 'react';
import { ArchiveRestore, BookOpenCheck } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
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
import { useConfirm } from '@/components/ui/confirm-dialog';

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
  const [confirm, confirmDialog] = useConfirm();
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
    if (mode === 'replace') {
      const ok = await confirm({
        title: tr('确定要替换恢复？'),
        description: tr('此操作将覆盖现有空间的所有数据，未备份的内容将无法找回。'),
        confirmText: tr('替换恢复'),
        cancelText: tr('取消'),
        variant: 'destructive',
      });
      if (!ok) return;
    }
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
          <div className="data-preview rounded-2xl border border-black/10 dark:border-white/10 bg-black/[0.02] dark:bg-white/[0.03] p-3.5 space-y-3">
            <div className="import-options grid grid-cols-1 sm:grid-cols-3 gap-2.5">
              <label className="flex flex-col gap-1 text-xs text-muted-foreground">
                {tr('整理方式')}
                <Select
                  value={organizeMode}
                  onChange={(event) => setOrganizeMode(event.target.value as typeof organizeMode)}
                >
                  <option value="folders">{tr('按书签文件夹建立分类')}</option>
                  <option value="flat">{tr('全部放入“导入书签”')}</option>
                </Select>
              </label>
              <label className="flex flex-col gap-1 text-xs text-muted-foreground">
                {tr('重复网址')}
                <Select
                  value={duplicateMode}
                  onChange={(event) => setDuplicateMode(event.target.value as typeof duplicateMode)}
                >
                  <option value="skip-url">{tr('跳过重复网址')}</option>
                  <option value="keep-all">{tr('全部保留')}</option>
                </Select>
              </label>
              <label className="flex flex-col gap-1 text-xs text-muted-foreground">
                {tr('目标桌面')}
                <Select
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
                </Select>
              </label>
            </div>
            <div className="flex flex-wrap items-center justify-between gap-2 pt-1 border-t border-black/5 dark:border-white/5">
              <div className="text-xs text-muted-foreground space-y-0.5">
                <strong className="text-foreground block">
                  {tr('准备导入')} {candidates.length} {tr('个网站')}
                </strong>
                <div>
                  {sourceCandidates.length !== candidates.length && (
                    <span>
                      {tr('已跳过')} {sourceCandidates.length - candidates.length}{' '}
                      {tr('个重复网址')} ·{' '}
                    </span>
                  )}
                  <span>
                    {new Set(candidates.map((item) => item.category)).size}{' '}
                    {tr('个分类，将保存到所选桌面')}
                  </span>
                </div>
              </div>
              <Button
                size="sm"
                className="rounded-xl px-4 bg-slate-900 text-white dark:bg-white dark:text-slate-900 hover:bg-slate-800 dark:hover:bg-slate-100 font-medium cursor-pointer shadow-xs"
                onClick={() => void importNow()}
              >
                {tr('确认导入')}
              </Button>
            </div>
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
        <div className="space-y-3">
          <label className="data-select-row flex items-center justify-between gap-3 text-xs">
            <span className="text-muted-foreground font-medium">{tr('导出范围')}</span>
            <Select
              containerClassName="w-36"
              value={backupRange}
              onChange={(event) => setBackupRange(event.target.value as SpaceId | 'all')}
            >
              <option value="all">{tr('全部空间')}</option>
              <option value="normal">{tr('普通空间')}</option>
              <option value="private">{tr('私密空间')}</option>
            </Select>
          </label>
          {state.privateSecurity.protected && backupRange !== 'normal' && (
            <Input
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              minLength={6}
              placeholder={tr('私密空间备份密码')}
              className="rounded-xl border-black/10 dark:border-white/15 bg-black/[0.02] dark:bg-white/5"
            />
          )}
          <div className="data-actions">
            <Button
              variant="outline"
              size="sm"
              className="rounded-xl border-black/10 dark:border-white/15 cursor-pointer font-medium"
              onClick={() => void exportBackup()}
            >
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
        </div>
        {document &&
          (() => {
            const summary = backupSummary(document);
            return (
              <div className="data-preview rounded-2xl border border-black/10 dark:border-white/10 bg-black/[0.02] dark:bg-white/[0.03] p-3.5 space-y-2 mt-3">
                <strong className="text-xs font-semibold text-foreground block">
                  {tr('备份内容预览')}
                </strong>
                <div className="flex flex-col gap-1 text-xs text-muted-foreground">
                  {summary.normal && (
                    <div>
                      <span className="font-medium text-foreground">{tr('普通空间')}</span>：
                      {summary.normal.desktops} {tr('个桌面')} · {summary.normal.categories}{' '}
                      {tr('个分类')} · {summary.normal.sites} {tr('个网站')}
                    </div>
                  )}
                  {summary.private && (
                    <div>
                      <span className="font-medium text-foreground">{tr('私密空间')}</span>：
                      {'protected' in summary.private
                        ? tr('已受密码加密保护')
                        : `${summary.private.desktops} ${tr('个桌面')} · ${summary.private.categories} ${tr('个分类')} · ${summary.private.sites} ${tr('个网站')}`}
                    </div>
                  )}
                </div>
                <span className="text-[11px] text-muted-foreground block">
                  {tr('合并会保留较新的记录；替换会覆盖备份包含的空间。')}
                </span>
                <div className="data-actions pt-1">
                  <Button
                    size="sm"
                    variant="outline"
                    className="rounded-xl border-black/10 dark:border-white/15 cursor-pointer"
                    onClick={() => void restore('merge')}
                  >
                    {tr('合并恢复')}
                  </Button>
                  <Button
                    size="sm"
                    variant="destructive"
                    className="rounded-xl cursor-pointer"
                    onClick={() => void restore('replace')}
                  >
                    {tr('替换恢复')}
                  </Button>
                </div>
              </div>
            );
          })()}
      </section>
      {confirmDialog}
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
