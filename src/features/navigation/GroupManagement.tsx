import { LockKeyhole, Trash2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import type { GroupTab } from '@/storage/group-privacy';

export function GroupManagement({
  groups,
  legacyLocked,
  showHidden,
  onShowHidden,
  onHiddenChange,
  onEncryptionChange,
  onDeleteGroup,
  onOpenLegacy,
}: {
  groups: GroupTab[];
  legacyLocked: boolean;
  showHidden: boolean;
  onShowHidden: () => void;
  onHiddenChange: (group: GroupTab, hidden: boolean) => void;
  onEncryptionChange: (group: GroupTab) => void;
  onDeleteGroup: (group: GroupTab) => void;
  onOpenLegacy: () => void;
}) {
  const { t } = useTranslation();
  return (
    <>
      <p className="wrap-anywhere text-xs leading-5 text-muted-foreground">
        {t('navigation.groupPrivacyHelp')}
      </p>
      {(legacyLocked || groups.some((group) => group.hidden)) && (
        <Button
          type="button"
          variant="outline"
          className="justify-self-start"
          onClick={onShowHidden}
        >
          {t(showHidden ? 'navigation.hideHiddenGroups' : 'navigation.showHiddenGroups')}
        </Button>
      )}
      <ul className="grid min-w-0 gap-1">
        {groups.map((group) => (
          <li
            key={`${group.spaceId}:${group.id}`}
            className="grid min-w-0 grid-cols-[minmax(0,1fr)_auto_5rem_auto] items-center gap-x-1.5 border-b border-border py-2"
          >
            <span className="flex min-w-0 items-center gap-1.5 break-all text-sm">
              {group.encrypted && <LockKeyhole className="size-3.5 shrink-0" aria-hidden="true" />}
              {group.name}
            </span>
            <label className="flex items-center gap-2 text-sm">
              <Switch
                checked={group.hidden}
                aria-label={t('navigation.hideNamedGroup', { name: group.name })}
                onCheckedChange={(hidden) => onHiddenChange(group, hidden)}
              />
              {t('navigation.hideGroup')}
            </label>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-auto min-h-8 w-full px-1 whitespace-normal"
              onClick={() => onEncryptionChange(group)}
            >
              {t(group.encrypted ? 'navigation.decryptGroup' : 'navigation.encryptGroup')}
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="size-8 text-muted-foreground hover:text-destructive"
              aria-label={t('navigation.deleteNamedGroup', { name: group.name })}
              title={t('messages.delete')}
              onClick={() => onDeleteGroup(group)}
            >
              <Trash2 className="size-4" aria-hidden="true" />
            </Button>
          </li>
        ))}
      </ul>
      {legacyLocked && (
        <Button
          type="button"
          variant="outline"
          className="justify-self-start"
          onClick={onOpenLegacy}
        >
          <LockKeyhole className="size-4" aria-hidden="true" />
          {t('navigation.unlockLegacyGroups')}
        </Button>
      )}
    </>
  );
}
