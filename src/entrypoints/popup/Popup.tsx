import { useEffect, useRef, useState, type BaseSyntheticEvent } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from '@/lib/zod';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { Toaster } from '@/components/ui/sonner';
import { Check, ExternalLink, Globe2, Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { RayTabMark } from '@/components/ui/raytab-mark';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  NativeSelect,
  NativeSelectOptGroup,
  NativeSelectOption,
} from '@/components/ui/native-select';
import { SiteIcon } from '@/features/navigation/SiteIcon';
import { destinationSchema } from '@/features/navigation/navigation-form-schemas';
import {
  defaultSiteIcon,
  defaultSiteIconBackground,
  normalizeUrl,
  siteSchema,
  type Site,
} from '@/storage/model';
import { startRayTabStore, useRayTabStore } from '@/storage/store';
import { isPlaceholderGroup } from '@/storage/group-privacy';
import { errorMessage, storedErrorMessage } from '@/lib/errors';
import { prepareImage } from '@/lib/images';
import i18n from '@/locales';

const schema = z.object({
  title: siteSchema.shape.title,
  url: z
    .string()
    .transform((value, ctx) => {
      try {
        return normalizeUrl(value);
      } catch {
        ctx.addIssue({ code: 'custom', message: 'errors.invalidInput' });
        return z.NEVER;
      }
    })
    .pipe(siteSchema.shape.url),
  location: z.string().min(1),
});
type Fields = z.infer<typeof schema>;
type IconDraft = {
  url: string;
  icon: Site['icon'];
  background: Site['iconBackground'];
  resource?: { id: string; blob: Blob };
};

export default function Popup() {
  const { t } = useTranslation();
  const error = useRayTabStore((store) => store.error);
  const settings = useRayTabStore((store) => store.state?.normalSettings);
  const normalSpace = useRayTabStore((store) => store.state?.spaces.normal);
  const savedGroupId = useRayTabStore((store) => store.state?.local.activeGroup.normal);
  const normalGroups = normalSpace?.groups.filter((group) => !isPlaceholderGroup(group.id)) ?? [];
  const activeGroupId =
    normalGroups.find((group) => group.id === savedGroupId)?.id ?? normalGroups[0]?.id;
  const dispatch = useRayTabStore((store) => store.dispatch);
  const refresh = useRayTabStore((store) => store.refresh);
  useEffect(startRayTabStore, []);
  const [saved, setSaved] = useState(false);
  const [page, setPage] = useState({ title: '', url: '' });
  const [fetchingIcon, setFetchingIcon] = useState(false);
  const [iconFailure, setIconFailure] = useState<{ url: string; detail?: string }>();
  const active = useRef(true);
  const submitting = useRef(false);
  const siteId = useRef<string | undefined>(undefined);
  const iconDraft = useRef<IconDraft | undefined>(undefined);
  const form = useForm<Fields>({
    resolver: zodResolver(schema),
    defaultValues: { title: '', url: '', location: '' },
  });
  const { errors, isSubmitting, dirtyFields } = form.formState;
  // Subscribe to dirty fields so asynchronous tab/default loading preserves edits.
  void dirtyFields;
  useEffect(() => {
    active.current = true;
    const deactivate = () => {
      active.current = false;
    };
    window.addEventListener('pagehide', deactivate);
    return () => {
      deactivate();
      window.removeEventListener('pagehide', deactivate);
    };
  }, []);
  useEffect(() => {
    if (!browser.tabs?.query) return;
    let active = true;
    void browser.tabs
      .query({ active: true, currentWindow: true })
      .then(([tab]) => {
        if (active)
          setPage({
            title: (tab?.title ?? '')
              .trim()
              .slice(0, 80)
              .replace(/[\uD800-\uDBFF]$/, ''),
            url: tab?.url ?? '',
          });
      })
      .catch(() => {
        if (active) toast.error(t('popup.tabReadFailed'));
      });
    return () => {
      active = false;
    };
  }, [t]);
  useEffect(() => {
    if (settings) {
      document.documentElement.dataset.theme = settings.theme;
      void i18n.changeLanguage(settings.language);
    }
  }, [settings?.theme, settings?.language]);
  useEffect(() => {
    document.title = `RayTab · ${t('messages.quickAddToPersonalSpace')}`;
  }, [t]);
  useEffect(() => {
    form.reset(
      {
        title: page.title,
        url: page.url,
        location: activeGroupId ? JSON.stringify({ groupId: activeGroupId, folderId: null }) : '',
      },
      { keepDirtyValues: true },
    );
  }, [page, activeGroupId, form]);
  const title = form.watch('title');
  const url = form.watch('url');
  const openRayTab = async () => {
    try {
      await browser.tabs.create({ url: browser.runtime.getURL('/newtab.html') });
      window.close();
    } catch (reason) {
      toast.error(errorMessage(reason));
    }
  };
  const save = async (data: Fields, withoutIcon = false) => {
    const requestedUrl = form.getValues('url');
    const isCurrent = () => active.current && form.getValues('url') === requestedUrl;
    try {
      form.clearErrors('root');
      const location = destinationSchema.parse(JSON.parse(data.location));
      let draft = iconDraft.current;
      if (withoutIcon) {
        draft = { url: data.url, icon: defaultSiteIcon, background: defaultSiteIconBackground };
      } else if (draft?.url !== data.url) {
        setIconFailure(undefined);
        setFetchingIcon(true);
        try {
          const { resolveWebsiteIcon } = await import('@/features/navigation/site-metadata');
          if (!isCurrent()) return;
          const metadata = await resolveWebsiteIcon(data.url);
          if (!isCurrent()) return;
          if (!metadata.icon) {
            setIconFailure({ url: requestedUrl });
            return;
          }
          const resource = metadata.icon ? await prepareImage(metadata.icon, 'icon') : undefined;
          if (!isCurrent()) return;
          draft = {
            url: data.url,
            icon: resource ? { source: 'auto', resourceId: resource.id } : defaultSiteIcon,
            background: defaultSiteIconBackground,
            resource,
          };
          iconDraft.current = draft;
        } catch (reason) {
          if (isCurrent()) setIconFailure({ url: requestedUrl, detail: errorMessage(reason) });
          return;
        } finally {
          if (active.current) setFetchingIcon(false);
        }
      }
      if (!isCurrent() || !draft) return;
      siteId.current ??= crypto.randomUUID();
      await dispatch(
        {
          type: 'save-site',
          spaceId: 'normal',
          id: siteId.current,
          ...location,
          site: {
            title: data.title,
            url: data.url,
            icon: draft.icon,
            iconBackground: draft.background,
          },
        },
        draft.resource ? new Map([[draft.resource.id, draft.resource.blob]]) : undefined,
      );
      if (active.current) {
        setSaved(true);
        toast.success(t('messages.siteAdded'));
      }
    } catch (reason) {
      if (active.current) form.setError('root', { message: errorMessage(reason) });
    }
  };
  const submit = async (event?: BaseSyntheticEvent, withoutIcon = false) => {
    event?.preventDefault();
    if (submitting.current || saved || !active.current) return;
    submitting.current = true;
    try {
      await form.handleSubmit((data) => save(data, withoutIcon))(event);
    } finally {
      submitting.current = false;
    }
  };
  const currentIconFailure = iconFailure?.url === url ? iconFailure : undefined;
  const fieldError = (message?: string) =>
    message ? (
      <p className="text-xs text-destructive" role="alert">
        {message.startsWith('messages.') || message.startsWith('errors.')
          ? t(message)
          : t('errors.invalidInput')}
      </p>
    ) : null;
  return (
    <main className="flex min-h-[420px] flex-col bg-background px-4.5 pt-4 pb-4.5 text-foreground">
      <Toaster theme={settings?.theme ?? 'system'} />
      {!settings || !normalSpace ? (
        <div className="grid min-h-[420px] place-items-center text-sm text-muted-foreground">
          <p>{error ? storedErrorMessage(error) : t('messages.openingYourSpace')}</p>
          {error && <Button onClick={() => void refresh()}>{t('messages.retry')}</Button>}
        </div>
      ) : normalGroups.length === 0 ? (
        <div className="grid min-h-70 place-content-center justify-items-center gap-3 text-sm">
          <p className="text-muted-foreground">{t('navigation.noWritableGroups')}</p>
          <Button type="button" variant="outline" onClick={() => void openRayTab()}>
            {t('messages.openHome')}
          </Button>
        </div>
      ) : (
        <>
          <header className="flex items-center justify-between border-b border-border pb-3">
            <div className="flex items-center gap-1.5 text-base font-semibold tracking-tight">
              <RayTabMark className="size-6 text-primary" />
              <span>RayTab</span>
            </div>
            <span className="rounded-full border border-border bg-background px-2 py-0.5 text-xs font-medium text-muted-foreground">
              {t('messages.personalSpace')}
            </span>
          </header>
          {saved ? (
            <div
              className="flex min-h-70 flex-col items-center justify-center gap-3 text-center"
              role="status"
            >
              <div className="grid size-12 place-items-center rounded-full border border-success-border bg-success-surface text-success">
                <Check size={28} />
              </div>
              <strong className="text-base font-semibold">{t('messages.siteAdded')}</strong>
              <small className="text-xs text-muted-foreground">{title}</small>
              <div className="flex gap-2 w-full mt-4">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => {
                    siteId.current = undefined;
                    iconDraft.current = undefined;
                    setIconFailure(undefined);
                    form.reset({
                      title: '',
                      url: '',
                      location: JSON.stringify({ groupId: activeGroupId, folderId: null }),
                    });
                    setSaved(false);
                  }}
                >
                  {t('messages.addAnother')}
                </Button>
                <Button type="button" onClick={() => void openRayTab()}>
                  <ExternalLink className="ui-icon-action" aria-hidden="true" />
                  {t('messages.viewHome')}
                </Button>
              </div>
            </div>
          ) : (
            <>
              <div className="popup-preview mt-3.5 flex items-center gap-3 rounded-lg border border-border bg-muted px-3 py-2.5">
                <SiteIcon
                  site={{
                    title,
                    url,
                    icon: defaultSiteIcon,
                    iconBackground: defaultSiteIconBackground,
                  }}
                  size="preview"
                  radius={settings.iconRadius}
                />
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-semibold">
                    {title || t('messages.currentTab')}
                  </div>
                  <div className="mt-0.5 truncate text-xs text-muted-foreground">{url}</div>
                </div>
              </div>
              <form
                aria-label={t('messages.quickAddToPersonalSpace')}
                className="mt-3.5 flex flex-1 flex-col gap-3"
                onSubmit={submit}
                noValidate
              >
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="title">{t('messages.name')}</Label>
                  <Input
                    id="title"
                    autoFocus
                    maxLength={80}
                    {...form.register('title')}
                    aria-invalid={Boolean(errors.title)}
                    disabled={isSubmitting}
                  />
                  {fieldError(errors.title?.message)}
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="url">{t('messages.url')}</Label>
                  <Input
                    id="url"
                    placeholder="https://example.com"
                    {...form.register('url')}
                    aria-invalid={Boolean(errors.url)}
                    disabled={isSubmitting}
                  />
                  {fieldError(errors.url?.message)}
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="location">{t('messages.saveTo')}</Label>
                  <NativeSelect
                    id="location"
                    {...form.register('location')}
                    disabled={isSubmitting}
                  >
                    {[...normalGroups]
                      .sort((a, b) => a.order - b.order)
                      .map((group) => (
                        <NativeSelectOptGroup key={group.id} label={group.name}>
                          <NativeSelectOption
                            value={JSON.stringify({ groupId: group.id, folderId: null })}
                          >
                            {group.name}
                          </NativeSelectOption>
                          {normalSpace.folders
                            .filter((folder) => folder.groupId === group.id)
                            .sort((a, b) => a.order - b.order)
                            .map((folder) => (
                              <NativeSelectOption
                                key={folder.id}
                                value={JSON.stringify({ groupId: group.id, folderId: folder.id })}
                              >
                                {folder.name}
                              </NativeSelectOption>
                            ))}
                        </NativeSelectOptGroup>
                      ))}
                  </NativeSelect>
                  {fieldError(errors.location?.message)}
                </div>
                {errors.root?.message && (
                  <p role="alert" className="text-xs text-destructive">
                    {errors.root.message}
                  </p>
                )}
                {currentIconFailure && (
                  <div className="flex flex-col items-start gap-2">
                    <p role="alert" className="text-xs text-destructive">
                      {t('popup.iconFetchFailed')}
                      {currentIconFailure.detail && ` ${currentIconFailure.detail}`}
                    </p>
                    <Button
                      type="button"
                      variant="outline"
                      disabled={isSubmitting}
                      onClick={() => void submit(undefined, true)}
                    >
                      {t('popup.addWithoutIcon')}
                    </Button>
                  </div>
                )}
                <div className="mt-auto flex gap-2 pt-3.5">
                  <Button
                    type="button"
                    variant="outline"
                    disabled={isSubmitting}
                    onClick={() => void openRayTab()}
                  >
                    <Globe2 className="ui-icon-action" aria-hidden="true" />
                    {t('messages.openHome')}
                  </Button>
                  <Button type="submit" className="min-w-0 flex-1" disabled={isSubmitting}>
                    <Plus className="ui-icon-action" aria-hidden="true" />
                    {fetchingIcon
                      ? t('popup.fetchingIcon')
                      : isSubmitting
                        ? t('popup.saving')
                        : t('messages.addSite')}
                  </Button>
                </div>
              </form>
            </>
          )}
        </>
      )}
    </main>
  );
}
