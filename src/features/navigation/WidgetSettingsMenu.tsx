import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { ContextMenu, ContextMenuContent, ContextMenuTrigger } from '@/components/ui/context-menu';
import { NavigationMenuItems, type NavigationAction } from './NavigationMenu';

export function WidgetSettingsMenu({
  children,
  onSettings,
}: {
  children: ReactNode;
  onSettings: () => void;
}) {
  const { t } = useTranslation();
  const actions: NavigationAction[] = [
    { id: 'settings', label: t('navigation.widgetSettings'), run: onSettings },
  ];
  return (
    <div className="widget-settings-wrap">
      <ContextMenu>
        <ContextMenuTrigger asChild>
          <div>{children}</div>
        </ContextMenuTrigger>
        <ContextMenuContent>
          <NavigationMenuItems actions={actions} />
        </ContextMenuContent>
      </ContextMenu>
    </div>
  );
}
