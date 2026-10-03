import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useTranslation } from 'react-i18next';
import { Toaster, toast } from 'sonner';
import { Check, ExternalLink, Globe2, Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { SiteIcon } from '@/features/navigation/SiteIcon';
import {
  defaultSiteIcon,
  defaultSiteIconBackground,
  normalizeUrl,
  siteSchema,
} from '@/storage/model';
import { startRayTabStore, useRayTabStore } from '@/storage/store';
import { errorMessage, storedErrorMessage } from '@/lib/errors';
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
  const form = useForm<Fields>({
    resolver: zodResolver(schema),
    defaultValues: { title: '', url: '', location: '' },
  });
  const { errors, isSubmitting, dirtyFields } = form.formState;
  // Subscribe to dirty fields so asynchronous tab/default loading preserves edits.
  void dirtyFields;
  useEffect(() => {
    if (!browser.tabs?.query) return;
    let active = true;
    void browser.tabs
      .query({ active: true, currentWindow: true })
      .then(([tab]) => {
        if (active) setPage({ title: tab?.title ?? '', url: tab?.url ?? '' });
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
  const submit = form.handleSubmit(async (data) => {
    try {
      const location: { groupId: string; folderId: string | null } = JSON.parse(data.location);
      await dispatch({
        type: 'save-site',
        spaceId: 'normal',
        id: crypto.randomUUID(),
        ...location,
        site: {
          title: data.title,
          url: data.url,
          icon: defaultSiteIcon,
          iconBackground: defaultSiteIconBackground,
        },
      });
      setSaved(true);
      toast.success(t('messages.siteAdded'));
    } catch (reason) {
      form.setError('root', { message: errorMessage(reason) });
    }
  });
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
      <Toaster richColors position="bottom-center" theme={settings?.theme ?? 'system'} />
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
                    {isSubmitting ? t('popup.saving') : t('messages.addSite')}
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
