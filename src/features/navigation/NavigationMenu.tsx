import { Fragment } from 'react';
import type { LucideIcon } from 'lucide-react';
import { ContextMenuItem, ContextMenuSeparator } from '@/components/ui/context-menu';

export type NavigationAction = {
  id: string;
  label: string;
  icon: LucideIcon;
  run: () => void | Promise<unknown>;
  disabled?: boolean;
  destructive?: boolean;
  separator?: boolean;
};

export function NavigationMenuItems({ actions }: { actions: NavigationAction[] }) {
  return actions.map((action) => (
    <Fragment key={action.id}>
      {action.separator && <ContextMenuSeparator />}
      <ContextMenuItem
        disabled={action.disabled}
        variant={action.destructive ? 'destructive' : 'default'}
        onSelect={() => {
          void action.run();
        }}
      >
        <action.icon aria-hidden="true" />
        {action.label}
      </ContextMenuItem>
    </Fragment>
  ));
}
