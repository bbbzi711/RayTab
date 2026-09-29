import { useEffect, useState, type FormEvent } from 'react';
import { LoaderCircle, Sparkles, Trash2, Upload } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { useConfirm } from '@/components/ui/confirm-dialog';
import { dispatch } from '@/storage/store';
import type { Site, SpaceData } from '@/storage/model';
import { SiteIcon } from '@/features/navigation/SiteIcon';
import { fetchSiteMetadata, fetchSiteIcon } from '@/features/navigation/site-metadata';
import { prepareImage } from '@/lib/images';

type Translator = (text: string) => string;

export type SiteEditorProps = {
  site?: Site;
  space: SpaceData;
  spaceId: 'normal' | 'private';
  groupId: string;
  folderId: string | null;
  onClose: () => void;
  onError: (message: string) => void;
  tr: Translator;
};

export function SiteEditor({
  site,
  space,
  spaceId,
  groupId,
  folderId,
  onClose,
  onError,
  tr,
}: SiteEditorProps) {
  const [title, setTitle] = useState(site?.title ?? '');
  const [url, setUrl] = useState(site?.url ?? '');
  const [color, setColor] = useState(site?.color ?? '#3b82f6');

  const initialLocation = JSON.stringify({
    groupId: site?.groupId ?? groupId,
    folderId: site ? site.folderId : folderId,
  });
  const [location, setLocation] = useState(initialLocation);

  const [fetchedIcon, setFetchedIcon] = useState<Blob>();
  const [uploadedIcon, setUploadedIcon] = useState<File>();
  const [previewIconUrl, setPreviewIconUrl] = useState<string>();
  const [fetching, setFetching] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [confirm, confirmDialog] = useConfirm();

  useEffect(() => {
    const image = uploadedIcon ?? fetchedIcon;
    if (!image) {
      setPreviewIconUrl(undefined);
      return;
    }
    const objectUrl = URL.createObjectURL(image);
    setPreviewIconUrl(objectUrl);
    return () => URL.revokeObjectURL(objectUrl);
  }, [fetchedIcon, uploadedIcon]);

  const isDirty =
    title !== (site?.title ?? '') ||
    url !== (site?.url ?? '') ||
    color !== (site?.color ?? '#3b82f6') ||
    location !== initialLocation ||
    Boolean(fetchedIcon || uploadedIcon);

  const requestClose = async () => {
    if (isDirty) {
      const ok = await confirm({
        title: tr('放弃未保存的更改？'),
        description: tr('当前所做的修改将不会被保存。'),
        confirmText: tr('放弃更改'),
        cancelText: tr('继续编辑'),
        variant: 'destructive',
      });
      if (!ok) return;
    }
    onClose();
  };

  const autoFetch = async () => {
    if (!url.trim()) return onError(tr('请先输入网址'));
    setFetching(true);
    try {
      const metadata = await fetchSiteMetadata(url);
      setTitle(metadata.title);
      setFetchedIcon(await fetchSiteIcon(metadata.iconUrl, url));
    } catch (error) {
      onError((error as Error).message);
    } finally {
      setFetching(false);
    }
  };

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (submitting) return;
    setSubmitting(true);
    try {
      const image = uploadedIcon ?? fetchedIcon;
      const prepared = image ? await prepareImage(image, 'icon') : undefined;
      const parsedLoc = JSON.parse(location);
      await dispatch(
        {
          type: 'save-site',
          spaceId,
          id: site?.id ?? crypto.randomUUID(),
          expected: site?.updatedAt,
          groupId: parsedLoc.groupId,
          folderId: parsedLoc.folderId,
          site: {
            title: title.trim(),
            url: url.trim(),
            color,
            iconId: prepared?.id ?? site?.iconId,
          },
        },
        prepared ? new Map([[prepared.id, prepared.blob]]) : undefined,
      );
      onClose();
    } catch (error) {
      onError((error as Error).message);
      setSubmitting(false);
    }
  };

  const orderedGroups = [...space.groups].sort((a, b) => a.order - b.order);
  const foldersByGroup = space.folders.reduce(
    (acc, folder) => {
      if (!acc[folder.groupId]) acc[folder.groupId] = [];
      acc[folder.groupId].push(folder);
      return acc;
    },
    {} as Record<string, typeof space.folders>,
  );
  Object.values(foldersByGroup).forEach((folders) => folders.sort((a, b) => a.order - b.order));

  return (
    <Dialog open={true} onOpenChange={(open) => !open && void requestClose()}>
      <DialogContent variant="workspace" className="site-editor-workspace" closeLabel={tr('关闭')}>
        <form className="site-editor-form" onSubmit={submit}>
          <DialogHeader className="site-editor-header">
            <DialogTitle>{site ? tr('编辑网站') : tr('添加网站')}</DialogTitle>
            <DialogDescription>
              {tr('网站会保存到当前空间，可随时移动到其他分组或文件夹。')}
            </DialogDescription>
          </DialogHeader>
          <div className="site-editor-scroll">
            <aside className="editor-preview" aria-hidden="true">
              <SiteIcon
                site={{
                  title: title.trim() || tr('添加网站'),
                  url,
                  color,
                  iconId: site?.iconId,
                }}
                previewUrl={previewIconUrl}
                size="preview"
              />
              <span className="editor-preview-copy">
                <strong>{title.trim() || tr('添加网站')}</strong>
                <small>{url.trim() || 'example.com'}</small>
              </span>
            </aside>
            <div className="editor-fields">
              <label>
                {tr('名称')}
                <Input
                  name="title"
                  value={title}
                  onChange={(event) => setTitle(event.currentTarget.value)}
                  required
                  maxLength={80}
                  autoFocus
                />
              </label>
              <label>
                {tr('网址')}
                <span className="editor-url-row">
                  <Input
                    name="url"
                    value={url}
                    onChange={(event) => setUrl(event.currentTarget.value)}
                    required
                    placeholder="example.com"
                  />
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => void autoFetch()}
                    disabled={fetching || submitting}
                  >
                    {fetching ? (
                      <LoaderCircle className="spin" size={15} />
                    ) : (
                      <Sparkles size={15} />
                    )}
                    {tr('自动获取')}
                  </Button>
                </span>
              </label>
              <label>
                {tr('存入位置')}
                <Select
                  name="location"
                  value={location}
                  onChange={(event) => setLocation(event.currentTarget.value)}
                  required
                >
                  {orderedGroups.map((group) => (
                    <optgroup key={group.id} label={group.name}>
                      <option value={JSON.stringify({ groupId: group.id, folderId: null })}>
                        {tr('直接平铺')}
                      </option>
                      {(foldersByGroup[group.id] || []).map((folder) => (
                        <option
                          key={folder.id}
                          value={JSON.stringify({ groupId: group.id, folderId: folder.id })}
                        >
                          {folder.name}
                        </option>
                      ))}
                    </optgroup>
                  ))}
                </Select>
              </label>
              <div className="editor-appearance-fields">
                <label className="flex flex-col gap-1.5 text-xs text-slate-600 dark:text-slate-300">
                  {tr('标识颜色')}
                  <div className="relative flex items-center gap-2.5 h-9 px-3 rounded-xl border border-black/10 dark:border-white/15 bg-black/[0.02] dark:bg-white/5 hover:bg-black/[0.04] dark:hover:bg-white/[0.08] transition-colors cursor-pointer">
                    <div className="relative w-5 h-5 rounded-full overflow-hidden shrink-0 shadow-2xs border border-black/10 dark:border-white/20">
                      <input
                        name="color"
                        type="color"
                        value={color}
                        onChange={(event) => setColor(event.currentTarget.value)}
                        className="absolute inset-0 opacity-0 cursor-pointer w-full h-full scale-150"
                      />
                      <div className="w-full h-full" style={{ backgroundColor: color }} />
                    </div>
                    <span className="text-xs text-muted-foreground font-mono">
                      {color.toUpperCase()}
                    </span>
                  </div>
                </label>
                <label className="flex flex-col gap-1.5 text-xs text-slate-600 dark:text-slate-300">
                  {tr('自定义图标')}
                  <div className="relative flex items-center justify-between h-9 px-3 rounded-xl border border-dashed border-black/15 dark:border-white/20 bg-black/[0.02] dark:bg-white/5 hover:bg-black/5 dark:hover:bg-white/10 transition-colors cursor-pointer overflow-hidden">
                    <span className="text-xs text-muted-foreground truncate">
                      {uploadedIcon ? uploadedIcon.name : tr('点击上传图片')}
                    </span>
                    <Upload size={14} className="text-muted-foreground shrink-0 ml-2" />
                    <input
                      name="icon"
                      type="file"
                      accept="image/png,image/jpeg,image/webp,image/x-icon,image/vnd.microsoft.icon,image/svg+xml,.ico,.svg"
                      onChange={(event) => setUploadedIcon(event.currentTarget.files?.[0])}
                      className="absolute inset-0 opacity-0 cursor-pointer w-full h-full"
                    />
                  </div>
                </label>
              </div>
            </div>
          </div>
          <DialogFooter className="site-editor-footer">
            {site && (
              <Button
                type="button"
                variant="destructive"
                className="rounded-xl px-4 py-2 cursor-pointer mr-auto"
                disabled={submitting}
                onClick={async () => {
                  const ok = await confirm({
                    title: tr('确定删除网站？'),
                    description: site.title,
                    confirmText: tr('删除'),
                    cancelText: tr('取消'),
                    variant: 'destructive',
                  });
                  if (!ok) return;
                  void dispatch({ type: 'delete-site', spaceId, id: site.id })
                    .then(onClose)
                    .catch((error: Error) => onError(error.message));
                }}
              >
                <Trash2 size={15} />
                {tr('删除')}
              </Button>
            )}
            <Button
              type="button"
              variant="outline"
              onClick={requestClose}
              disabled={submitting}
              className="rounded-xl px-4 py-2 cursor-pointer border-black/10 dark:border-white/15"
            >
              {tr('取消')}
            </Button>
            <Button
              type="submit"
              disabled={submitting}
              className="rounded-xl px-5 py-2 bg-slate-900 text-white dark:bg-white dark:text-slate-900 hover:bg-slate-800 dark:hover:bg-slate-100 font-medium cursor-pointer shadow-xs"
            >
              {tr('保存')}
            </Button>
          </DialogFooter>
        </form>
        {confirmDialog}
      </DialogContent>
    </Dialog>
  );
}
