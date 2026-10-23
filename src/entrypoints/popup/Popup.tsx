import { useEffect, useRef, useState, type BaseSyntheticEvent } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { Toaster } from '@/components/ui/sonner';
import { Check, ExternalLink, Globe2, Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
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
  const activeGroupId = useRayTabStore((store) => store.state?.local.activeGroup.normal);
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
          const metadata = await resolveWebsiteIcon(data.url, { allowPublicService: true });
          if (!isCurrent()) return;
          if (!metadata.localBrand && !metadata.icon) {
            setIconFailure({ url: requestedUrl });
            return;
          }
          const resource = metadata.icon ? await prepareImage(metadata.icon, 'icon') : undefined;
          if (!isCurrent()) return;
          draft = {
            url: data.url,
            icon: resource ? { source: 'auto', resourceId: resource.id } : defaultSiteIcon,
            background:
              resource && metadata.background
                ? { mode: 'color', color: metadata.background }
                : defaultSiteIconBackground,
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
    <main className="popup-shell">
      <Toaster theme={settings?.theme ?? 'system'} />
      {!settings || !normalSpace ? (
        <div className="popup-loading">
          <p>{error ? storedErrorMessage(error) : t('messages.openingYourSpace')}</p>
          {error && <Button onClick={() => void refresh()}>{t('messages.retry')}</Button>}
        </div>
      ) : (
        <>
          <header className="popup-header">
            <div className="popup-header-brand">
              <span>RayTab</span>
            </div>
            <span className="popup-header-badge">{t('messages.personalSpace')}</span>
          </header>
          {saved ? (
            <div className="popup-success">
              <div className="popup-success-icon">
                <Check size={28} />
              </div>
              <strong>{t('messages.siteAdded')}</strong>
              <small>{title}</small>
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
                  <ExternalLink size={14} />
                  {t('messages.viewHome')}
                </Button>
              </div>
            </div>
          ) : (
            <>
              <div className="popup-preview">
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
                <div className="popup-preview-text">
                  <div className="popup-preview-title">{title || t('messages.currentTab')}</div>
                  <div className="popup-preview-url">{url}</div>
                </div>
              </div>
              <form className="popup-form" onSubmit={submit} noValidate>
                <div className="popup-field">
                  <label htmlFor="title">{t('messages.name')}</label>
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
                <div className="popup-field">
                  <label htmlFor="url">{t('messages.url')}</label>
                  <Input
                    id="url"
                    placeholder="https://example.com"
                    {...form.register('url')}
                    aria-invalid={Boolean(errors.url)}
                    disabled={isSubmitting}
                  />
                  {fieldError(errors.url?.message)}
                </div>
                <div className="popup-field">
                  <label htmlFor="location">{t('messages.saveTo')}</label>
                  <Select id="location" {...form.register('location')} disabled={isSubmitting}>
                    {[...normalSpace.groups]
                      .sort((a, b) => a.order - b.order)
                      .map((group) => (
                        <optgroup key={group.id} label={group.name}>
                          <option value={JSON.stringify({ groupId: group.id, folderId: null })}>
                            {group.name}
                          </option>
                          {normalSpace.folders
                            .filter((folder) => folder.groupId === group.id)
                            .sort((a, b) => a.order - b.order)
                            .map((folder) => (
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
                <div className="popup-footer-actions">
                  <Button
                    type="button"
                    variant="ghost"
                    disabled={isSubmitting}
                    onClick={() => void openRayTab()}
                  >
                    <Globe2 size={14} />
                    {t('messages.openHome')}
                  </Button>
                  <Button type="submit" disabled={isSubmitting}>
                    <Plus size={15} />
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
