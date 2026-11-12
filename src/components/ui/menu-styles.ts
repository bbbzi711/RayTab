import './menu.css';

export const menuSurfaceClass =
  'menu-surface z-50 min-w-44 max-w-[min(20rem,calc(100vw-16px))] overflow-x-hidden overflow-y-auto rounded-xl border border-[var(--surface-divider)] bg-[var(--surface-popover)] p-1.5 text-sm text-[color:var(--surface-text)] shadow-[var(--elevation-popover)] backdrop-blur-xl backdrop-saturate-[1.35] duration-(--motion-fast) ease-(--ease-standard) motion-safe:data-[state=closed]:animate-out motion-safe:data-[state=closed]:fade-out-0 motion-safe:data-[state=open]:animate-in motion-safe:data-[state=open]:fade-in-0';

export const menuItemClass =
  'menu-item relative flex min-h-9 cursor-pointer items-center gap-2 rounded-sm px-2.5 py-1.5 outline-none select-none transition-colors duration-(--motion-fast) ease-(--ease-standard) data-highlighted:bg-muted data-[state=open]:bg-muted data-disabled:pointer-events-none data-disabled:opacity-45 data-[inset=true]:pl-8 motion-reduce:transition-none [&>svg]:pointer-events-none [&>svg]:size-[var(--ui-icon-action)] [&>svg]:shrink-0';

export const menuCheckableItemClass = 'menu-item--checkable pr-8';
export const menuIndicatorClass =
  'pointer-events-none absolute right-2.5 flex size-[var(--ui-icon-action)] items-center justify-center [&_svg]:size-[var(--ui-icon-action)]';
export const menuLabelClass =
  'px-2.5 py-1 text-xs font-semibold text-muted-foreground select-none data-[inset=true]:pl-8';
export const menuSeparatorClass = 'mx-1 my-1 h-px bg-[var(--surface-divider)]';
export const menuShortcutClass = 'ml-auto text-xs text-muted-foreground';
