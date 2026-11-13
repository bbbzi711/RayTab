import { lazy, Suspense, useEffect, useMemo, useRef, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from '@/lib/zod';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { Toaster } from '@/components/ui/sonner';
import { RayTabMark } from '@/components/ui/raytab-mark';
import { AppError, errorMessage, storedErrorMessage } from '@/lib/errors';
import { ContextMenu, ContextMenuContent, ContextMenuTrigger } from '@/components/ui/context-menu';
import { NavigationMenuItems, type NavigationAction } from '@/features/navigation/NavigationMenu';
import { useShallow } from 'zustand/react/shallow';
import {
  Focus,
  FolderPlus,
  LayoutGrid,
  ListChecks,
  Plus,
  Settings,
  ShieldCheck,
} from 'lucide-react';
import { Background } from '@/features/appearance/Background';
import { NavigationPage, type NavigationHandle } from '@/features/navigation/NavigationPage';
import { GroupManagement } from '@/features/navigation/GroupManagement';
import { MoveDialog } from '@/features/navigation/NavigationDialogs';
import { SearchBar } from '@/features/search/SearchBar';
import { isUserGroup, listGroupTabs, type GroupTab } from '@/storage/group-privacy';
import type { RayState } from '@/storage/model';
import { selectEffectiveSettings, startRayTabStore, useRayTabStore } from '@/storage/store';
import { Clock } from '@/widgets/clock/Clock';
import { Onboarding } from '@/features/onboarding/Onboarding';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { useConfirm } from '@/components/ui/confirm-dialog';
import { cn } from '@/lib/utils';
import i18n from '@/locales';
import { resolveHomeTextColors } from '@/features/appearance/text-colors';
import { Tooltip, TooltipProvider } from '@/components/ui/tooltip';
import type { SettingsHandle } from '@/features/settings/SettingsPanel';

const unlockSchema = z.object({ password: z.string().min(1, 'navigation.passwordRequired') });
const SettingsPanel = lazy(() => import('@/features/settings/SettingsPanel'));
type PasswordRequest =
  | { kind: 'group'; group?: GroupTab }
  | { kind: 'settings' }
  | { kind: 'delete'; group: GroupTab }
  | { kind: 'privacy'; group: GroupTab; hidden?: boolean; create: boolean };

function deletionDestinations(state: RayState, group: GroupTab) {
  return state.spaces[group.spaceId].groups.filter(
    (candidate) => candidate.id !== group.id && isUserGroup(state, group.spaceId, candidate),
  );
}

export default function App() {
  const { t } = useTranslation();
  const unlockForm = useForm<z.infer<typeof unlockSchema>>({
    resolver: zodResolver(unlockSchema),
    defaultValues: { password: '' },
  });
  const navigationRef = useRef<NavigationHandle>(null);
  const settingsButtonRef = useRef<HTMLButtonElement>(null);
  const railSettingsButtonRef = useRef<HTMLButtonElement>(null);
  const settingsRef = useRef<SettingsHandle>(null);
  const settingsExitPending = useRef(false);
  const passwordTriggerRef = useRef<HTMLElement | null>(null);
  const error = useRayTabStore((store) => store.error);
  const state = useRayTabStore((store) => store.state);
  const spaceId = state?.local.activeSpace;
  const homeMode = useRayTabStore((store) => store.state?.local.homeMode);
  const onboardingComplete = useRayTabStore((store) => store.state?.local.onboardingComplete);
  const protectedPrivate = useRayTabStore((store) => store.state?.privateSecurity.protected);
  const privateLocked = useRayTabStore((store) => store.state?.privateSecurity.locked);
  const settings = useRayTabStore(useShallow((store) => selectEffectiveSettings(store, 'normal')));
  const dispatch = useRayTabStore((store) => store.dispatch);
  const refresh = useRayTabStore((store) => store.refresh);
  const lockPrivate = useRayTabStore((store) => store.lockPrivate);
  const unlockPrivate = useRayTabStore((store) => store.unlockPrivate);
  const protectPrivate = useRayTabStore((store) => store.protectPrivate);
  useEffect(startRayTabStore, []);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [groupsCollapsed, setGroupsCollapsed] = useState(false);
  const [showHidden, setShowHidden] = useState(false);
  const [deferHiddenSelection, setDeferHiddenSelection] = useState(false);
  const [passwordRequest, setPasswordRequest] = useState<PasswordRequest | null>(null);
  const [groupToMove, setGroupToMove] = useState<GroupTab | null>(null);
  const [confirmGroupDeletion, groupDeletionConfirmation] = useConfirm();
  const unlockOpen = passwordRequest !== null;
  const creatingPassword = passwordRequest?.kind === 'privacy' && passwordRequest.create;
  const groupTabs = useMemo(() => (state ? listGroupTabs(state) : []), [state]);
  const legacyLocked = Boolean(
    protectedPrivate && privateLocked && (state?.encryptedGroupIndex?.hasLegacyGroups ?? true),
  );
  const currentGroup = groupTabs.find(
    (group) => group.spaceId === spaceId && group.id === state?.local.activeGroup[group.spaceId],
  );
  const lastVisibleGroup = useRef<GroupTab | undefined>(undefined);
  useEffect(() => {
    if (currentGroup && !currentGroup.hidden) lastVisibleGroup.current = currentGroup;
  }, [currentGroup]);
  const fallback = groupTabs.find((group) => !group.hidden && !group.encrypted);
  const displayedGroup =
    currentGroup?.hidden && (!showHidden || deferHiddenSelection) ? fallback : currentGroup;
  const displayedSpace = displayedGroup?.spaceId ?? spaceId;
  useEffect(() => {
    if (!showHidden && currentGroup?.hidden && currentGroup.encrypted && !privateLocked)
      void lockPrivate().catch((reason) => toast.error(errorMessage(reason)));
  }, [showHidden, currentGroup?.hidden, currentGroup?.encrypted, privateLocked, lockPrivate]);
  const navigationVisible = homeMode === 'navigation';
  const openSettings = () => setSettingsOpen(true);
  const showHome = () => {
    setSettingsOpen(false);
    requestAnimationFrame(() => {
      const rail = railSettingsButtonRef.current;
      (rail?.getClientRects().length ? rail : settingsButtonRef.current)?.focus();
    });
  };
  const leaveSettings = async (leave: () => void | Promise<void>) => {
    if (settingsExitPending.current) return false;
    settingsExitPending.current = true;
    try {
      if (settingsRef.current && !(await settingsRef.current.canClose())) return false;
      await leave();
      return true;
    } finally {
      settingsExitPending.current = false;
    }
  };
  const closeSettings = () => leaveSettings(showHome);
  const openSettingsPassword = (request: PasswordRequest) => {
    const trigger = document.activeElement;
    passwordTriggerRef.current = trigger instanceof HTMLElement ? trigger : null;
    setPasswordRequest(request);
  };
  useEffect(() => {
    void i18n.changeLanguage(settings?.language ?? 'zh-CN');
  }, [settings?.language]);
  useEffect(() => {
    const clearPassword = () => unlockForm.reset({ password: '' });
    window.addEventListener('pagehide', clearPassword);
    return () => window.removeEventListener('pagehide', clearPassword);
  }, [unlockForm.reset]);
  const rootTheme = settings?.theme;
  useEffect(() => {
    // 确保首帧完成初始绘制后移除 preload，恢复后续正常的平滑交互动效
    const raf = requestAnimationFrame(() => {
      document.documentElement.classList.remove('preload');
    });
    return () => cancelAnimationFrame(raf);
  }, []);
  useEffect(() => {
    if (!rootTheme || !homeMode) return;
    document.documentElement.dataset.theme = rootTheme;
    document.documentElement.dataset.homeMode = homeMode;
  }, [homeMode, rootTheme]);
  if (!settings || !spaceId || !displayedSpace)
    return (
      <main className="flex min-h-dvh flex-col items-center justify-center gap-4">
        <RayTabMark className="size-10" />
        <h1 className="text-xl font-semibold">RayTab</h1>
        <p>{error ? storedErrorMessage(error) : t('messages.openingYourSpace')}</p>
        {error && <Button onClick={() => void refresh()}>{t('messages.retry')}</Button>}
      </main>
    );

  const textColors = resolveHomeTextColors(settings);
  const selectGroup = async (group: GroupTab) => {
    const current = useRayTabStore.getState().state;
    if (
      current?.local.activeSpace !== group.spaceId ||
      current.local.activeGroup[group.spaceId] !== group.id ||
      current.local.selectedFolder[group.spaceId][group.id]
    ) {
      await dispatch({ type: 'switch-space', spaceId: group.spaceId, groupId: group.id });
    }
    if (!group.encrypted && current?.privateSecurity.protected && !current.privateSecurity.locked)
      await lockPrivate();
  };

  const openGroup = (group?: GroupTab) =>
    leaveSettings(async () => {
      if ((!group || group.encrypted) && privateLocked) {
        setSettingsOpen(false);
        setPasswordRequest({ kind: 'group', group });
        return;
      }
      if (!group) return;
      try {
        await selectGroup(group);
        setDeferHiddenSelection(false);
      } catch (reason) {
        toast.error(errorMessage(reason));
      }
    });

  const toggleHiddenGroups = async () => {
    if (showHidden && currentGroup?.hidden) {
      const previous = lastVisibleGroup.current;
      const destination =
        groupTabs.find(
          (group) =>
            !group.hidden &&
            (!group.encrypted || !privateLocked) &&
            group.id === previous?.id &&
            group.spaceId === previous.spaceId,
        ) ?? fallback;
      try {
        if (destination) await selectGroup(destination);
        else if (protectedPrivate && !privateLocked) await lockPrivate();
      } catch (reason) {
        toast.error(errorMessage(reason));
        return;
      }
    }
    if (!showHidden) setDeferHiddenSelection(Boolean(currentGroup?.hidden));
    setShowHidden(!showHidden);
  };

  const updateGroupPrivacy = (group: GroupTab, hidden?: boolean) =>
    dispatch(
      hidden === undefined
        ? {
            type: 'set-group-encrypted',
            spaceId: group.spaceId,
            groupId: group.id,
            encrypted: !group.encrypted,
          }
        : { type: 'set-group-hidden', spaceId: group.spaceId, groupId: group.id, hidden },
    );

  const changeGroupPrivacy = async (group: GroupTab, hidden?: boolean) => {
    if (
      (hidden === undefined && (!protectedPrivate || privateLocked)) ||
      (group.encrypted && privateLocked)
    ) {
      openSettingsPassword({ kind: 'privacy', group, hidden, create: !protectedPrivate });
      return;
    }
    try {
      await updateGroupPrivacy(group, hidden);
      const security = useRayTabStore.getState().state;
      if (
        security?.local.activeSpace === 'normal' &&
        security.privateSecurity.protected &&
        !security.privateSecurity.locked
      )
        await lockPrivate();
    } catch (reason) {
      toast.error(errorMessage(reason));
    }
  };

  const finishGroupDeletion = async (group: GroupTab) => {
    const latest = useRayTabStore.getState().state;
    if (group.encrypted && latest?.local.activeSpace === 'normal' && !latest.privateSecurity.locked)
      await lockPrivate().catch((reason) => toast.error(errorMessage(reason)));
  };

  const prepareGroupDeletion = async (group: GroupTab) => {
    let moving = false;
    try {
      const latest = useRayTabStore.getState().state;
      const source = latest?.spaces[group.spaceId];
      if (!latest || !source?.groups.some((candidate) => candidate.id === group.id))
        throw new AppError('messages.theDestinationGroupDoesNotExist');
      const siteIds = source.sites
        .filter((site) => site.groupId === group.id)
        .map((site) => site.id);
      const folderIds = source.folders
        .filter((folder) => folder.groupId === group.id)
        .map((folder) => folder.id);
      const hasContents = siteIds.length + folderIds.length > 0;
      if (hasContents && deletionDestinations(latest, group).length) {
        setGroupToMove(group);
        moving = true;
        return;
      }
      if (
        await confirmGroupDeletion({
          title: t('navigation.deleteNamedGroup', { name: group.name }),
          description: t(
            hasContents ? 'navigation.deleteGroupContentsHelp' : 'navigation.deleteEmptyGroupHelp',
          ),
          confirmText: t(hasContents ? 'navigation.deleteGroupContents' : 'messages.delete'),
          variant: 'destructive',
        })
      ) {
        await dispatch({
          type: 'remove-group',
          spaceId: group.spaceId,
          id: group.id,
          siteIds,
          folderIds,
        });
        toast.success(t('messages.deleted'));
      }
    } catch (reason) {
      toast.error(errorMessage(reason));
    } finally {
      if (!moving) await finishGroupDeletion(group);
    }
  };

  const deleteGroup = (group: GroupTab) => {
    if (group.encrypted && privateLocked) {
      openSettingsPassword({ kind: 'delete', group });
      return;
    }
    void prepareGroupDeletion(group);
  };

  const unlock = unlockForm.handleSubmit(async ({ password }) => {
    if (!passwordRequest) return;
    if (creatingPassword && password.length < 6) {
      unlockForm.setError('password', { message: 'settings.passwordLength' });
      return;
    }
    let unlocked = false;
    try {
      if (passwordRequest.kind === 'privacy' && passwordRequest.create) {
        const { id, spaceId } = passwordRequest.group;
        await protectPrivate(password, { spaceId, groupId: id });
      } else {
        await unlockPrivate(password, true);
        unlocked = true;
        if (passwordRequest.kind === 'group') {
          const latest = useRayTabStore.getState().state;
          const group =
            passwordRequest.group ??
            (latest && listGroupTabs(latest).find((tab) => tab.encrypted && tab.hidden));
          if (group) {
            if (group.hidden) setShowHidden(true);
            await selectGroup(group);
            setDeferHiddenSelection(false);
          }
        } else if (passwordRequest.kind === 'privacy') {
          await updateGroupPrivacy(passwordRequest.group, passwordRequest.hidden);
          if (useRayTabStore.getState().state?.local.activeSpace === 'normal') await lockPrivate();
        }
      }
      unlockForm.reset({ password: '' });
      setPasswordRequest(null);
      if (passwordRequest.kind === 'delete') {
        passwordTriggerRef.current = null;
        void prepareGroupDeletion(passwordRequest.group);
      }
    } catch (reason) {
      if (unlocked) await lockPrivate().catch((error) => toast.error(errorMessage(error)));
      unlockForm.setError('root', { message: errorMessage(reason) });
    }
  });
  const homeModeLabel = t(
    navigationVisible ? 'messages.enterFocusMode' : 'messages.openNavigation',
  );
  const settingsLabel = t('messages.settings');
  const HomeModeIcon = navigationVisible ? Focus : LayoutGrid;
  const switchHomeMode = async () => {
    if (settingsOpen && !(await closeSettings())) return;
    try {
      await dispatch({ type: 'set-home-mode', mode: navigationVisible ? 'focus' : 'navigation' });
      if (navigationVisible && protectedPrivate && !privateLocked) await lockPrivate();
    } catch (reason) {
      toast.error(errorMessage(reason));
    }
  };
  const settingsActionLabel = settingsOpen ? t('messages.closeSettings') : settingsLabel;
  const utilityButtonClass =
    'size-11 text-current opacity-85 hover:opacity-100 focus-visible:opacity-100 focus-visible:ring-current';
  const desktopActions: NavigationAction[] = [
    {
      id: 'add-site',
      label: t('messages.addSite'),
      icon: Plus,
      run: () => navigationRef.current?.addSite(),
    },
    {
      id: 'add-folder',
      label: t('messages.newFolder'),
      icon: FolderPlus,
      run: () => navigationRef.current?.addFolder(),
    },
    {
      id: 'organize',
      label: t('messages.organize'),
      icon: ListChecks,
      run: async () => {
        try {
          await dispatch({ type: 'set-home-mode', mode: 'navigation' });
          navigationRef.current?.organize();
        } catch (reason) {
          toast.error(errorMessage(reason));
        }
      },
    },
    {
      id: 'mode',
      label: homeModeLabel,
      icon: HomeModeIcon,
      separator: true,
      run: switchHomeMode,
    },
    { id: 'settings', label: settingsLabel, icon: Settings, run: openSettings },
  ];
  return (
    <TooltipProvider delayDuration={200}>
      <main
        className="home-shell relative isolate min-h-dvh"
        data-navigation={navigationVisible}
        data-sidebar-mode={settings.sidebarMode}
        data-groups-collapsed={groupsCollapsed}
        data-theme={settings.theme}
        style={
          {
            '--home-clock-color': textColors.clock,
            '--home-date-color': textColors.date,
            '--home-greeting-color': textColors.greeting,
            '--home-tabs-color': textColors.tabs,
            '--home-cards-color': textColors.cards,
          } as React.CSSProperties
        }
      >
        <Background settings={settings} spaceId="normal" />
        <header
          inert={settingsOpen}
          className="pointer-events-none absolute inset-x-0 top-0 z-40 flex h-14 items-center justify-end px-3 text-[color:var(--home-tabs-color)] sm:px-6 [&_svg]:drop-shadow-[0_1px_2px_rgb(0_0_0/0.65)]"
        >
          <div className="pointer-events-auto flex items-center gap-1">
            <Tooltip content={homeModeLabel} side="bottom">
              <Button
                type="button"
                variant="link"
                size="icon-lg"
                className={utilityButtonClass}
                aria-label={homeModeLabel}
                onClick={switchHomeMode}
              >
                <HomeModeIcon className="size-5" aria-hidden="true" />
              </Button>
            </Tooltip>
            <Tooltip content={settingsActionLabel} side={settingsOpen ? 'left' : 'bottom'}>
              <Button
                ref={settingsButtonRef}
                type="button"
                variant="link"
                size="icon-lg"
                className={cn(
                  utilityButtonClass,
                  'home-settings-trigger aria-expanded:opacity-100',
                )}
                aria-label={settingsActionLabel}
                aria-controls={settingsOpen ? 'raytab-settings' : undefined}
                aria-expanded={settingsOpen}
                onClick={settingsOpen ? closeSettings : openSettings}
              >
                <Settings className="size-5 shrink-0" aria-hidden="true" />
              </Button>
            </Tooltip>
          </div>
        </header>

        <ContextMenu>
          <ContextMenuTrigger asChild>
            <div
              className="relative text-white"
              inert={settingsOpen}
              onContextMenuCapture={(event) => {
                const target = event.target as HTMLElement;
                if (
                  target.closest(
                    'input, textarea, select, [contenteditable="true"], [data-desktop-control]',
                  ) ||
                  (target.closest('[role="dialog"]') && !target.closest('[data-navigation-object]'))
                )
                  event.stopPropagation();
              }}
            >
              {/* 主工作区 */}
              <div
                data-testid="desktop"
                className={cn(
                  'desktop-workspace relative w-full flex flex-col items-center transition-all duration-500 ease-[cubic-bezier(0.16,1,0.3,1)]',
                  !navigationVisible
                    ? 'min-h-screen pt-[118px] px-4 pb-8'
                    : 'desktop-workspace--navigation',
                )}
              >
                <div className="desktop-content w-full mx-auto flex flex-col transition-all duration-500">
                  <div className="desktop-header flex shrink-0 flex-col">
                    {(settings.showClock ||
                      settings.showDate ||
                      settings.showLunar ||
                      settings.showGreeting) && (
                      <Clock
                        language={settings.language}
                        hour12={settings.hour12}
                        showClock={settings.showClock}
                        showDate={settings.showDate}
                        showLunar={settings.showLunar}
                        showGreeting={settings.showGreeting}
                        compact={navigationVisible}
                      />
                    )}
                    {settings.showSearch && (
                      <div className="desktop-search relative z-20 w-full flex justify-center mt-[29px]">
                        <SearchBar key={spaceId} spaceId="normal" />
                      </div>
                    )}
                  </div>

                  {/* 导航卡片区域 */}
                  <div
                    className={cn(
                      'desktop-navigation relative z-10 mt-[clamp(12px,2.4vh,20px)] flex w-full flex-col transition-opacity',
                      !navigationVisible
                        ? 'invisible pointer-events-none max-h-0 overflow-hidden opacity-0'
                        : 'opacity-100',
                    )}
                    inert={!navigationVisible}
                  >
                    <NavigationPage
                      key={displayedSpace}
                      spaceId={displayedSpace}
                      groupId={displayedGroup?.id}
                      ref={navigationRef}
                      active={
                        navigationVisible && !!onboardingComplete && !settingsOpen && !unlockOpen
                      }
                      groupsCollapsed={groupsCollapsed}
                      onToggleGroups={() => setGroupsCollapsed((value) => !value)}
                      settingsAction={
                        <Tooltip content={settingsLabel} side="right">
                          <Button
                            ref={railSettingsButtonRef}
                            type="button"
                            variant="navigation"
                            size="rail"
                            className="home-rail-settings"
                            aria-label={settingsLabel}
                            aria-expanded={settingsOpen}
                            onClick={openSettings}
                          >
                            <Settings className="size-5" aria-hidden="true" />
                            <span className="home-group-name">{settingsLabel}</span>
                          </Button>
                        </Tooltip>
                      }
                      groupTabs={groupTabs}
                      showGrid={Boolean(displayedGroup)}
                      showHidden={showHidden}
                      legacyLocked={legacyLocked}
                      onSelectGroup={openGroup}
                      onToggleHidden={toggleHiddenGroups}
                      onDeleteGroup={deleteGroup}
                    />
                  </div>
                </div>
              </div>
            </div>
          </ContextMenuTrigger>
          <ContextMenuContent>
            <NavigationMenuItems actions={desktopActions} />
          </ContextMenuContent>
        </ContextMenu>
        <Dialog
          open={settingsOpen}
          onOpenChange={(open) => {
            if (open) openSettings();
            else void closeSettings();
          }}
        >
          <DialogContent
            variant="drawer"
            layout="custom"
            showCloseButton={false}
            aria-describedby={undefined}
            onCloseAutoFocus={(event) => event.preventDefault()}
            onEscapeKeyDown={(event) => {
              if (event.isComposing) event.preventDefault();
            }}
            id="raytab-settings"
            aria-label={settingsLabel}
            className="settings-sidebar home-settings-drawer text-foreground outline-none"
          >
            <DialogTitle className="sr-only">{settingsLabel}</DialogTitle>
            <Suspense
              fallback={
                <p className="p-6 text-sm text-muted-foreground" role="status">
                  {t('settings.loading')}
                </p>
              }
            >
              <SettingsPanel
                spaceId="normal"
                importSpaceId={displayedSpace}
                importGroupId={displayedGroup?.id}
                ref={settingsRef}
                onClose={closeSettings}
                onUnlockGroups={() => openSettingsPassword({ kind: 'settings' })}
                groupManagement={
                  <GroupManagement
                    groups={groupTabs}
                    legacyLocked={legacyLocked}
                    showHidden={showHidden}
                    onShowHidden={toggleHiddenGroups}
                    onHiddenChange={changeGroupPrivacy}
                    onEncryptionChange={changeGroupPrivacy}
                    onDeleteGroup={deleteGroup}
                    onOpenLegacy={() => void openGroup()}
                  />
                }
              />
            </Suspense>
          </DialogContent>
        </Dialog>
        {error && (
          <div className="load-error" role="alert">
            <span>{storedErrorMessage(error)}</span>
            <Button type="button" onClick={() => void refresh()}>
              {t('messages.retry')}
            </Button>
          </div>
        )}
        {!onboardingComplete && (
          <Onboarding onFinish={() => dispatch({ type: 'complete-onboarding' })} />
        )}
        {groupDeletionConfirmation}
        {groupToMove && state && (
          <MoveDialog
            title={t('navigation.deleteNamedGroup', { name: groupToMove.name })}
            description={t('messages.chooseAGroupToReceiveAllSitesAndFolders')}
            groups={deletionDestinations(state, groupToMove)}
            folders={[]}
            initialGroupId={state.local.activeGroup[groupToMove.spaceId]}
            allowFolders={false}
            destructive
            confirmLabel={t('messages.deleteAndMoveContents')}
            onMove={async (destinationGroupId) => {
              await dispatch({
                type: 'delete-group',
                spaceId: groupToMove.spaceId,
                id: groupToMove.id,
                destinationGroupId,
              });
              return true;
            }}
            onClose={() => {
              setGroupToMove(null);
              void finishGroupDeletion(groupToMove);
            }}
          />
        )}
        <Dialog
          open={unlockOpen}
          onOpenChange={(open) => {
            if (!open && !unlockForm.formState.isSubmitting) {
              unlockForm.reset({ password: '' });
              setPasswordRequest(null);
            }
          }}
        >
          <DialogContent
            layout="custom"
            className="w-[min(420px,calc(100%-24px))] p-8 max-[480px]:p-5"
            closeLabel={t('messages.close')}
            showCloseButton={!unlockForm.formState.isSubmitting}
            onCloseAutoFocus={(event) => {
              const trigger = passwordTriggerRef.current;
              passwordTriggerRef.current = null;
              if (!trigger) return;
              event.preventDefault();
              (trigger.isConnected ? trigger : settingsButtonRef.current)?.focus();
            }}
          >
            <form className="grid gap-5" onSubmit={unlock} noValidate>
              <div className="vault-mark shadow-xs mx-auto" aria-hidden="true">
                <ShieldCheck size={28} />
              </div>
              <DialogHeader className="text-center">
                <DialogTitle>
                  {t(
                    creatingPassword
                      ? 'navigation.createGroupPassword'
                      : 'messages.unlockPrivateGroup',
                  )}
                </DialogTitle>
                <DialogDescription>
                  {t(
                    creatingPassword
                      ? 'navigation.sharedGroupPasswordHelp'
                      : legacyLocked
                        ? 'navigation.legacyGroupMigrationHelp'
                        : 'messages.thePasswordIsUsedOnlyInThisTabRefreshingOrReturningTo',
                  )}
                </DialogDescription>
              </DialogHeader>
              <Input
                {...unlockForm.register('password')}
                aria-label={t('messages.privateGroupPassword')}
                aria-invalid={Boolean(unlockForm.formState.errors.password)}
                disabled={unlockForm.formState.isSubmitting}
                type="password"
                autoComplete={creatingPassword ? 'new-password' : 'current-password'}
                autoFocus
                placeholder={t('messages.privateGroupPassword')}
                className="h-10 text-center tracking-widest placeholder:tracking-normal"
              />
              {unlockForm.formState.errors.password && (
                <p className="form-error" role="alert">
                  {t(unlockForm.formState.errors.password.message ?? 'navigation.passwordRequired')}
                </p>
              )}
              {unlockForm.formState.errors.root && (
                <p className="form-error" role="alert">
                  {unlockForm.formState.errors.root.message}
                </p>
              )}
              <Button
                type="submit"
                disabled={unlockForm.formState.isSubmitting}
                size="lg"
                className="w-full"
              >
                {t(creatingPassword ? 'navigation.encryptGroup' : 'messages.unlock')}
              </Button>
            </form>
          </DialogContent>
        </Dialog>
      </main>
      <Toaster theme={settings.theme} />
    </TooltipProvider>
  );
}
