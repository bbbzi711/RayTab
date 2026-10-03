import { Fragment, type ReactNode } from 'react';
import type { LucideIcon } from 'lucide-react';
import { ContextMenuItem, ContextMenuSeparator } from '@/components/ui/context-menu';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

export type NavigationAction = {
  id: string;
  label: string;
  icon?: LucideIcon;
  run: () => void | Promise<unknown>;
  disabled?: boolean;
  destructive?: boolean;
  separator?: boolean;
};

export function NavigationMenuItems({
  actions,
  dropdown = false,
}: {
  actions: NavigationAction[];
  dropdown?: boolean;
}) {
  const Item = dropdown ? DropdownMenuItem : ContextMenuItem;
  const Separator = dropdown ? DropdownMenuSeparator : ContextMenuSeparator;
  return actions.map((action) => (
    <Fragment key={action.id}>
      {action.separator && <Separator />}
      <Item
        disabled={action.disabled}
        variant={action.destructive ? 'destructive' : 'default'}
        onSelect={() => {
          void action.run();
        }}
      >
        {action.icon && <action.icon aria-hidden="true" />}
        {action.label}
      </Item>
    </Fragment>
  ));
}

export function NavigationMoreMenu({
  actions,
  children,
}: {
  actions: NavigationAction[];
  children: ReactNode;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>{children}</DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <NavigationMenuItems actions={actions} dropdown />
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
