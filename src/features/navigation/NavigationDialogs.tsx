import { useState, type FormEvent } from 'react';
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
import type { Group, Folder } from '@/storage/model';

export interface NameDialogProps {
  title: string;
  initialName?: string;
  onSave: (name: string) => Promise<void>;
  onClose: () => void;
  onError: (message: string) => void;
  tr: (text: string) => string;
}

export function NameDialog({
  title,
  initialName = '',
  onSave,
  onClose,
  onError,
  tr,
}: NameDialogProps) {
  const [name, setName] = useState(initialName);
  const [saving, setSaving] = useState(false);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (saving || !name.trim()) return;
    setSaving(true);
    try {
      await onSave(name.trim());
      onClose();
    } catch (err) {
      onError(err instanceof Error ? err.message : String(err));
      setSaving(false);
    }
  };

  return (
    <Dialog open onOpenChange={(open) => !open && !saving && onClose()}>
      <DialogContent closeLabel={tr('关闭')} showCloseButton={!saving} aria-describedby={undefined}>
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <DialogHeader>
            <DialogTitle>{title}</DialogTitle>
          </DialogHeader>
          <div className="py-2">
            <Input
              aria-label={tr('名称')}
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              maxLength={80}
              autoFocus
            />
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={onClose}
              disabled={saving}
              className="rounded-xl px-4 py-2 cursor-pointer border-black/10 dark:border-white/15"
            >
              {tr('取消')}
            </Button>
            <Button
              type="submit"
              disabled={saving || !name.trim()}
              className="rounded-xl px-5 py-2 bg-slate-900 text-white dark:bg-white dark:text-slate-900 hover:bg-slate-800 dark:hover:bg-slate-100 font-medium cursor-pointer shadow-xs"
            >
              {tr('保存')}
            </Button>
          </DialogFooter>
        </form>
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
  onMove: (groupId: string, folderId: string | null) => Promise<void>;
  onClose: () => void;
  onError: (message: string) => void;
  tr: (text: string) => string;
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
  onMove,
  onClose,
  onError,
  tr,
}: MoveDialogProps) {
  const validGroups = groups
    .filter((g) => g.id !== excludeGroupId)
    .sort((a, b) => a.order - b.order);
  const foldersByGroup = folders.reduce(
    (acc, f) => {
      if (!acc[f.groupId]) acc[f.groupId] = [];
      acc[f.groupId].push(f);
      return acc;
    },
    {} as Record<string, Folder[]>,
  );
  Object.values(foldersByGroup).forEach((fs) => fs.sort((a, b) => a.order - b.order));

  const firstValidGroup = validGroups[0];
  let defaultLocation = '';
  if (validGroups.some((g) => g.id === initialGroupId)) {
    defaultLocation = JSON.stringify({ groupId: initialGroupId, folderId: null });
  } else if (firstValidGroup) {
    defaultLocation = JSON.stringify({ groupId: firstValidGroup.id, folderId: null });
  }

  const [location, setLocation] = useState(defaultLocation);
  const [saving, setSaving] = useState(false);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (saving || !location) return;
    setSaving(true);
    try {
      const parsed = JSON.parse(location);
      await onMove(parsed.groupId, parsed.folderId);
      onClose();
    } catch (err) {
      onError(err instanceof Error ? err.message : String(err));
      setSaving(false);
    }
  };

  return (
    <Dialog open onOpenChange={(open) => !open && !saving && onClose()}>
      <DialogContent
        closeLabel={tr('关闭')}
        showCloseButton={!saving}
        {...(!description ? { 'aria-describedby': undefined } : {})}
      >
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <DialogHeader>
            <DialogTitle>{title}</DialogTitle>
            {description && <DialogDescription>{description}</DialogDescription>}
          </DialogHeader>
          <div className="py-2">
            <Select
              aria-label={tr('存入位置')}
              value={location}
              onChange={(e) => setLocation(e.target.value)}
              required
              disabled={!validGroups.length}
            >
              {validGroups.map((group) => (
                <optgroup key={group.id} label={group.name}>
                  <option value={JSON.stringify({ groupId: group.id, folderId: null })}>
                    {tr('直接平铺')}
                  </option>
                  {allowFolders &&
                    (foldersByGroup[group.id] || []).map((folder) => (
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
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={onClose}
              disabled={saving}
              className="rounded-xl px-4 py-2 cursor-pointer border-black/10 dark:border-white/15"
            >
              {tr('取消')}
            </Button>
            <Button
              type="submit"
              disabled={saving || !validGroups.length}
              className="rounded-xl px-5 py-2 bg-slate-900 text-white dark:bg-white dark:text-slate-900 hover:bg-slate-800 dark:hover:bg-slate-100 font-medium cursor-pointer shadow-xs"
            >
              {confirmLabel || tr('保存')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
