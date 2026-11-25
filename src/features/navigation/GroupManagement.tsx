import { Ellipsis, EyeOff, LockKeyhole, Trash2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { groupPrivacyActions, NavigationMenuItems } from './NavigationMenu';
import type { GroupTab } from '@/storage/group-privacy';

export function GroupManagement({
  groups,
  legacyLocked,
  showHidden,
  onShowHidden,
  onPrivacyChange,
  onDeleteGroup,
  onOpenLegacy,
}: {
  groups: GroupTab[];
  legacyLocked: boolean;
  showHidden: boolean;
  onShowHidden: () => void;
  onPrivacyChange: (group: GroupTab, hidden?: boolean) => void;
  onDeleteGroup: (group: GroupTab) => void;
  onOpenLegacy: () => void;
}) {
  const { t } = useTranslation();
  return (
    <>
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
            key={group.id}
            className="flex min-w-0 items-center gap-2 border-b border-border py-2"
          >
            <span className="min-w-0 flex-1 break-all text-sm">{group.name}</span>
            {group.hidden && (
              <EyeOff
                className="size-3.5 text-muted-foreground"
                aria-label={t('navigation.hideGroup')}
              />
            )}
            {group.encrypted && (
              <LockKeyhole
                className="size-3.5 text-muted-foreground"
                aria-label={t('navigation.encryptGroup')}
              />
            )}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  aria-label={t('navigation.groupActions', { name: group.name })}
                >
                  <Ellipsis aria-hidden="true" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <NavigationMenuItems
                  dropdown
                  actions={[
                    ...groupPrivacyActions(group, t, onPrivacyChange),
                    {
                      id: 'delete',
                      label: t('messages.delete'),
                      icon: Trash2,
                      separator: true,
                      destructive: true,
                      run: () => onDeleteGroup(group),
                    },
                  ]}
                />
              </DropdownMenuContent>
            </DropdownMenu>
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
