import {
  lazy,
  Suspense,
  useEffect,
  useId,
  useRef,
  useState,
  type CSSProperties,
  type FocusEvent,
} from 'react';
import { Controller, useForm, useWatch } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { RadioGroup, Select } from 'radix-ui';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import {
  Check,
  ChevronDown,
  Crop,
  Globe2,
  Link,
  LoaderCircle,
  Sparkles,
  Type,
  Upload,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { useConfirm } from '@/components/ui/confirm-dialog';
import { selectEffectiveSettings, useRayTabStore } from '@/storage/store';
import { useShallow } from 'zustand/react/shallow';
import { repository } from '@/storage/repository';
import {
  defaultSiteIcon,
  defaultSiteIconBackground,
  siteIconBackgroundSchema,
  normalizeUrl,
  type Site,
  type SpaceData,
  type SpaceId,
} from '@/storage/model';
import { SiteIcon } from './SiteIcon';
import { siteEditorSchema } from './navigation-form-schemas';
import { getBrandAppearance } from './brandIcons';
import { resolveWebsiteIcon } from './site-metadata';
import { prepareImage, validateImageFile } from '@/lib/images';
import { AppError, errorMessage } from '@/lib/errors';
import './site-editor.css';

const IconCropDialog = lazy(() => import('./IconCropDialog'));
type SiteForm = z.input<typeof siteEditorSchema>;
type SavedSiteForm = z.output<typeof siteEditorSchema>;
type ImageSource = 'auto' | 'resource';
type ImageDraft = { id: string; blob: Blob; original: Blob };
const BACKGROUND_COLORS = [
  { color: '#ffffff', label: 'navigation.colors.white' },
  { color: '#262626', label: 'navigation.colors.black' },
  { color: '#1677ff', label: 'navigation.colors.blue' },
  { color: '#13c2c2', label: 'navigation.colors.cyan' },
  { color: '#52c41a', label: 'navigation.colors.green' },
  { color: '#fadb14', label: 'navigation.colors.yellow' },
  { color: '#fa8c16', label: 'navigation.colors.orange' },
  { color: '#f5222d', label: 'navigation.colors.red' },
  { color: '#eb2f96', label: 'navigation.colors.pink' },
  { color: '#722ed1', label: 'navigation.colors.purple' },
];
const iconTextFromName = (name: string) =>
  Array.from(name.trim().replace(/\s+/g, '') || 'Aa')
    .slice(0, 2)
    .join('');
const resourceField = (source: ImageSource) =>
  source === 'auto' ? 'websiteResourceId' : 'uploadResourceId';

export type SiteEditorProps = {
  site?: Site;
  space: SpaceData;
  spaceId: SpaceId;
  groupId: string;
  folderId: string | null;
  onClose: () => void;
};

export function SiteEditor({ site, space, spaceId, groupId, folderId, onClose }: SiteEditorProps) {
  const { t } = useTranslation();
  const id = useId();
  const dispatch = useRayTabStore((store) => store.dispatch);
  const settings = useRayTabStore(useShallow((store) => selectEffectiveSettings(store, spaceId)))!;
  const form = useForm<SiteForm, unknown, SavedSiteForm>({
    resolver: zodResolver(siteEditorSchema),
    shouldFocusError: false,
    defaultValues: {
      title: site?.title ?? '',
      url: site?.url ?? '',
      location: { groupId: site?.groupId ?? groupId, folderId: site ? site.folderId : folderId },
      iconType: site?.icon.source ?? defaultSiteIcon.source,
      textIcon: site?.icon.source === 'text' ? site.icon.text : iconTextFromName(site?.title ?? ''),
      websiteResourceId: site?.icon.source === 'auto' ? (site.icon.resourceId ?? '') : '',
      uploadResourceId: site?.icon.source === 'resource' ? site.icon.resourceId : '',
      iconBackground: site?.iconBackground ?? defaultSiteIconBackground,
    },
  });
  const [title, url, iconType, textIcon, websiteResourceId, uploadResourceId, iconBackground] =
    useWatch({
      control: form.control,
      name: [
        'title',
        'url',
        'iconType',
        'textIcon',
        'websiteResourceId',
        'uploadResourceId',
        'iconBackground',
      ],
    });
  const values = {
    title,
    url,
    iconType,
    textIcon,
    websiteResourceId,
    uploadResourceId,
    iconBackground,
  };
  const { errors, isDirty, isSubmitting } = form.formState;
  // Only binary drafts live outside RHF; each source has its own resource selection.
  const [images, setImages] = useState<Partial<Record<ImageSource, ImageDraft>>>({});
  const [previewUrls, setPreviewUrls] = useState<Partial<Record<ImageSource, string>>>({});
  const [cropImage, setCropImage] = useState<{
    source: ImageSource;
    resourceId: string;
    blob: Blob;
  }>();
  const [fetching, setFetching] = useState(false);
  const [openingCrop, setOpeningCrop] = useState(false);
  const [confirm, confirmDialog] = useConfirm();
  const iconSection = useRef<HTMLDivElement>(null);
  const focusIconSource = () =>
    iconSection.current
      ?.querySelector<HTMLButtonElement>('[role="radio"][data-state="checked"]')
      ?.focus();
  const imageInput = useRef<HTMLInputElement>(null);
  const active = useRef(true);
  const fetchGeneration = useRef(0);
  const automaticAttempt = useRef<string | undefined>(undefined);
  const iconEdited = useRef(false);
  const textEdited = useRef(site?.icon.source === 'text');
  useEffect(() => {
    active.current = true;
    return () => {
      active.current = false;
      fetchGeneration.current++;
    };
  }, []);
  useEffect(() => {
    const urls: Partial<Record<ImageSource, string>> = {};
    for (const source of ['auto', 'resource'] as const) {
      const image = images[source];
      if (image) urls[source] = URL.createObjectURL(image.blob);
    }
    setPreviewUrls(urls);
    return () => {
      for (const url of Object.values(urls)) URL.revokeObjectURL(url);
    };
  }, [images]);
  const invalidateFetch = () => {
    fetchGeneration.current++;
    setFetching(false);
  };
  const setImageSelection = (source: ImageSource, blob: Blob, original = blob) => {
    validateImageFile(blob);
    invalidateFetch();
    const selection = crypto.randomUUID();
    setImages((current) => ({ ...current, [source]: { id: selection, blob, original } }));
    form.setValue(resourceField(source), selection, { shouldDirty: true });
    form.setValue('iconType', source, { shouldDirty: true });
    form.clearErrors('uploadResourceId');
    form.clearErrors('websiteResourceId');
    form.clearErrors('root');
  };
  const busy = isSubmitting;
  const requestClose = async () => {
    if (busy) return;
    if (
      isDirty &&
      !(await confirm({
        title: t('messages.discardUnsavedChanges'),
        description: t('messages.yourChangesWillNotBeSaved'),
        confirmText: t('messages.discardChanges'),
        cancelText: t('messages.keepEditing'),
        variant: 'destructive',
      }))
    )
      return;
    onClose();
  };
  const autoFetch = async (automatic = false) => {
    const requestedUrl = form.getValues('url');
    const generation = ++fetchGeneration.current;
    if (!automatic) iconEdited.current = true;
    if (!(await form.trigger('url'))) {
      if (active.current && generation === fetchGeneration.current) form.setFocus('url');
      return;
    }
    if (
      !active.current ||
      generation !== fetchGeneration.current ||
      form.getValues('url') !== requestedUrl ||
      form.getValues('iconType') !== 'auto' ||
      (automatic && (iconEdited.current || Boolean(form.getValues('websiteResourceId'))))
    )
      return;
    automaticAttempt.current = requestedUrl;
    setFetching(true);
    try {
      const url = normalizeUrl(requestedUrl);
      const metadata = await resolveWebsiteIcon(url, {
        allowPublicService: spaceId === 'normal',
      });
      const icon = metadata.icon;
      if (
        !active.current ||
        generation !== fetchGeneration.current ||
        form.getValues('url') !== requestedUrl
      )
        return;
      if (!form.getValues('title').trim()) {
        form.setValue('title', metadata.title, { shouldDirty: true });
        if (!textEdited.current)
          form.setValue('textIcon', iconTextFromName(metadata.title), { shouldDirty: true });
      }
      if (metadata.localBrand) {
        invalidateFetch();
        setImages((current) => ({ ...current, auto: undefined }));
        form.setValue('websiteResourceId', '', { shouldDirty: true });
        form.setValue('iconType', 'auto', { shouldDirty: true });
        form.clearErrors('websiteResourceId');
        if (!automatic) toast.success(t('navigation.metadataUpdated'));
      } else if (icon) {
        setImageSelection('auto', icon);
        if (metadata.background && form.getValues('iconBackground').mode === 'auto')
          form.setValue(
            'iconBackground',
            { mode: 'color', color: metadata.background },
            {
              shouldDirty: true,
            },
          );
        if (!automatic) toast.success(t('navigation.metadataUpdated'));
      } else form.setError('websiteResourceId', { message: 'navigation.iconFetchFailed' });
    } catch (reason) {
      if (active.current && generation === fetchGeneration.current)
        form.setError('websiteResourceId', { message: errorMessage(reason) });
    } finally {
      if (active.current && generation === fetchGeneration.current) setFetching(false);
    }
  };
  const openCrop = async () => {
    const source = form.getValues('iconType');
    if (source === 'text') return;
    const selectedId = form.getValues(resourceField(source));
    if (!selectedId) return;
    invalidateFetch();
    setOpeningCrop(true);
    try {
      const image = images[source];
      const blob = image?.id === selectedId ? image.blob : await repository.resource(selectedId);
      if (
        !active.current ||
        form.getValues('iconType') !== source ||
        form.getValues(resourceField(source)) !== selectedId
      )
        return;
      if (!blob) throw new AppError('navigation.noImage');
      validateImageFile(blob);
      setCropImage({ source, resourceId: selectedId, blob });
    } catch (reason) {
      if (active.current) form.setError('root', { message: errorMessage(reason) });
    } finally {
      if (active.current) setOpeningCrop(false);
    }
  };
  const submit = form.handleSubmit(
    async (data) => {
      try {
        const icon = data.icon;
        const image = icon.source === 'text' ? undefined : images[icon.source];
        const prepared =
          image && icon.source !== 'text' && image.id === icon.resourceId
            ? await prepareImage(image.blob, 'icon')
            : undefined;
        if (!active.current) return;
        await dispatch(
          {
            type: 'save-site',
            spaceId,
            id: site?.id ?? crypto.randomUUID(),
            expected: site?.updatedAt,
            groupId: data.location.groupId,
            folderId: data.location.folderId,
            site: {
              title: data.title,
              url: data.url,
              icon:
                prepared && icon.source !== 'text'
                  ? { source: icon.source, resourceId: prepared.id }
                  : icon,
              iconBackground: data.iconBackground,
            },
          },
          prepared ? new Map([[prepared.id, prepared.blob]]) : undefined,
        );
        if (active.current) {
          toast.success(t('navigation.siteSaved'));
          onClose();
        }
      } catch (reason) {
        if (active.current) form.setError('root', { message: errorMessage(reason) });
      }
    },
    (invalid) => {
      if (invalid.url) form.setFocus('url');
      else if (invalid.title) form.setFocus('title');
      else if (invalid.location) form.setFocus('location');
      else if (invalid.textIcon) form.setFocus('textIcon');
      else focusIconSource();
    },
  );
  const orderedGroups = [...space.groups].sort((a, b) => a.order - b.order);
  const previewBase = {
    title: values.title?.trim() || t('messages.addSite'),
    url: values.url ?? '',
    iconBackground: siteIconBackgroundSchema.parse(
      values.iconBackground ?? defaultSiteIconBackground,
    ),
  };
  const selectedSource = values.iconType;
  const selectedImageSource = selectedSource === 'text' ? undefined : selectedSource;
  const selectedResourceId = selectedImageSource
    ? values[resourceField(selectedImageSource)]
    : undefined;
  const selectedBrand =
    selectedSource === 'auto' && !selectedResourceId ? getBrandAppearance(values.url ?? '') : null;
  const previewSite: Pick<Site, 'title' | 'url' | 'icon' | 'iconBackground'> = {
    ...previewBase,
    icon:
      selectedSource === 'text'
        ? { source: 'text', text: values.textIcon?.trim() || iconTextFromName(values.title ?? '') }
        : selectedSource === 'resource'
          ? { source: 'resource', resourceId: values.uploadResourceId ?? '' }
          : {
              source: 'auto',
              ...(values.websiteResourceId ? { resourceId: values.websiteResourceId } : {}),
            },
  };
  return (
    <Dialog open onOpenChange={(open) => !open && void requestClose()}>
      <DialogContent
        className="site-edit-dialog"
        overlayClassName="site-edit-overlay"
        closeLabel={t('messages.close')}
        showCloseButton={!busy}
        aria-describedby={undefined}
        onOpenAutoFocus={(event) => {
          event.preventDefault();
          form.setFocus('url');
        }}
      >
        <form className="site-edit-form" onSubmit={submit} noValidate>
          <DialogHeader className="site-edit-heading">
            <DialogTitle>{t(site ? 'messages.editSite' : 'messages.addSite')}</DialogTitle>
          </DialogHeader>
          <div className="site-edit-body">
            <div className="site-edit-controls">
              <section className="site-edit-information">
                <div className="site-edit-field">
                  <label htmlFor={`${id}-url`}>{t('messages.url')}</label>
                  <div className="site-edit-url-row">
                    <Link size={14} aria-hidden="true" />
                    <Input
                      id={`${id}-url`}
                      {...form.register('url', {
                        onChange: () => {
                          invalidateFetch();
                          automaticAttempt.current = undefined;
                          form.clearErrors('websiteResourceId');
                        },
                        onBlur: (event: FocusEvent<HTMLInputElement>) => {
                          if (
                            event.relatedTarget instanceof HTMLElement &&
                            event.relatedTarget.closest(
                              '.site-edit-fetch, .site-edit-save, .site-edit-cancel',
                            )
                          )
                            return;
                          const currentUrl = form.getValues('url');
                          if (
                            spaceId === 'normal' &&
                            form.getValues('iconType') === 'auto' &&
                            !form.getValues('websiteResourceId') &&
                            !iconEdited.current &&
                            currentUrl.trim() &&
                            automaticAttempt.current !== currentUrl
                          )
                            void autoFetch(true);
                        },
                      })}
                      aria-invalid={Boolean(errors.url)}
                      aria-describedby={errors.url ? `${id}-url-error` : undefined}
                      disabled={busy}
                      placeholder="example.com"
                    />
                  </div>
                  {errors.url && (
                    <p id={`${id}-url-error`} className="form-error" role="alert">
                      {t(errors.url.message!)}
                    </p>
                  )}
                </div>
                <div className="site-edit-details">
                  <div className="site-edit-field">
                    <label htmlFor={`${id}-title`}>{t('messages.name')}</label>
                    <div className="site-edit-name-row">
                      <Type size={14} aria-hidden="true" />
                      <Input
                        id={`${id}-title`}
                        {...form.register('title', {
                          onChange: (event) => {
                            if (!textEdited.current)
                              form.setValue('textIcon', iconTextFromName(event.target.value), {
                                shouldDirty: true,
                              });
                          },
                        })}
                        aria-invalid={Boolean(errors.title)}
                        aria-describedby={errors.title ? `${id}-title-error` : undefined}
                        disabled={busy}
                      />
                    </div>
                    {errors.title && (
                      <p id={`${id}-title-error`} className="form-error" role="alert">
                        {t(errors.title.message!)}
                      </p>
                    )}
                  </div>
                  <div className="site-edit-field">
                    <label htmlFor={`${id}-location`}>{t('messages.saveTo')}</label>
                    <Controller
                      control={form.control}
                      name="location"
                      render={({ field }) => (
                        <Select.Root
                          name={field.name}
                          value={JSON.stringify(field.value)}
                          disabled={busy}
                          onValueChange={(value) => {
                            const locations = orderedGroups.flatMap((group) => [
                              { groupId: group.id, folderId: null },
                              ...space.folders
                                .filter((folder) => folder.groupId === group.id)
                                .map((folder) => ({ groupId: group.id, folderId: folder.id })),
                            ]);
                            const location = locations.find(
                              (item) => JSON.stringify(item) === value,
                            );
                            if (location) field.onChange(location);
                          }}
                        >
                          <Select.Trigger
                            id={`${id}-location`}
                            ref={field.ref}
                            onBlur={field.onBlur}
                            className="site-edit-select"
                          >
                            <Select.Value />
                            <Select.Icon>
                              <ChevronDown size={15} aria-hidden="true" />
                            </Select.Icon>
                          </Select.Trigger>
                          <Select.Portal>
                            <Select.Content
                              className="site-edit-select-content"
                              position="popper"
                              sideOffset={6}
                            >
                              <Select.Viewport>
                                {orderedGroups.map((group) => (
                                  <Select.Group key={group.id}>
                                    <Select.Label className="site-edit-select-label">
                                      {group.name}
                                    </Select.Label>
                                    <Select.Item
                                      className="site-edit-select-item"
                                      value={JSON.stringify({ groupId: group.id, folderId: null })}
                                    >
                                      <Select.ItemText>{group.name}</Select.ItemText>
                                      <Select.ItemIndicator>
                                        <Check size={14} aria-hidden="true" />
                                      </Select.ItemIndicator>
                                    </Select.Item>
                                    {space.folders
                                      .filter((folder) => folder.groupId === group.id)
                                      .sort((a, b) => a.order - b.order)
                                      .map((folder) => (
                                        <Select.Item
                                          key={folder.id}
                                          className="site-edit-select-item"
                                          value={JSON.stringify({
                                            groupId: group.id,
                                            folderId: folder.id,
                                          })}
                                        >
                                          <Select.ItemText>
                                            {group.name} / {folder.name}
                                          </Select.ItemText>
                                          <Select.ItemIndicator>
                                            <Check size={14} aria-hidden="true" />
                                          </Select.ItemIndicator>
                                        </Select.Item>
                                      ))}
                                  </Select.Group>
                                ))}
                              </Select.Viewport>
                            </Select.Content>
                          </Select.Portal>
                        </Select.Root>
                      )}
                    />
                    {errors.location && (
                      <p className="form-error" role="alert">
                        {t('navigation.chooseLocation')}
                      </p>
                    )}
                  </div>
                </div>
              </section>
              <div
                ref={iconSection}
                className="site-edit-icons"
                role="group"
                tabIndex={-1}
                aria-label={t('navigation.iconSection')}
              >
                <div className="site-edit-icon-workspace">
                  <aside className="site-edit-preview" aria-label={t('navigation.iconPreview')}>
                    <div className="site-edit-preview-stage" aria-busy={fetching}>
                      {fetching && !selectedResourceId && !selectedBrand ? (
                        <LoaderCircle
                          className="site-edit-preview-empty spin"
                          size={24}
                          aria-hidden="true"
                        />
                      ) : selectedSource === 'resource' && !selectedResourceId ? (
                        <Upload className="site-edit-preview-empty" size={28} aria-hidden="true" />
                      ) : selectedSource === 'auto' && !selectedBrand && !selectedResourceId ? (
                        <Globe2 className="site-edit-preview-empty" size={28} aria-hidden="true" />
                      ) : (
                        <SiteIcon
                          site={previewSite}
                          previewUrl={
                            selectedImageSource ? previewUrls[selectedImageSource] : undefined
                          }
                          size="preview"
                          radius={settings.iconRadius}
                        />
                      )}
                    </div>
                    <span className="site-edit-preview-label">{t('navigation.iconPreview')}</span>
                  </aside>
                  <div className="site-edit-icon-details">
                    <label id={`${id}-source`}>{t('navigation.iconSource')}</label>
                    <Controller
                      control={form.control}
                      name="iconType"
                      render={({ field }) => (
                        <RadioGroup.Root
                          className="site-edit-icon-options"
                          value={field.value}
                          disabled={busy}
                          aria-labelledby={`${id}-source`}
                          onValueChange={(source) => {
                            invalidateFetch();
                            iconEdited.current = true;
                            field.onChange(source);
                          }}
                        >
                          <RadioGroup.Item
                            value="auto"
                            className="site-edit-icon-choice"
                            aria-label={t('navigation.websiteIcon')}
                          >
                            <Globe2 size={15} aria-hidden="true" />
                            <span>{t('navigation.websiteIcon')}</span>
                          </RadioGroup.Item>
                          <RadioGroup.Item
                            value="text"
                            className="site-edit-icon-choice"
                            aria-label={t('navigation.textIcon')}
                          >
                            <Type size={15} aria-hidden="true" />
                            <span>{t('navigation.textIcon')}</span>
                          </RadioGroup.Item>
                          <RadioGroup.Item
                            value="resource"
                            className="site-edit-icon-choice"
                            aria-label={t('navigation.upload')}
                          >
                            <Upload size={15} aria-hidden="true" />
                            <span>{t('navigation.upload')}</span>
                          </RadioGroup.Item>
                        </RadioGroup.Root>
                      )}
                    />
                    {selectedImageSource && (
                      <div className="site-edit-source-panel">
                        <p className="site-edit-help" role="status">
                          {t(
                            fetching
                              ? 'navigation.fetchingIcon'
                              : selectedImageSource === 'auto'
                                ? selectedBrand
                                  ? 'navigation.brandIconHelp'
                                  : selectedResourceId
                                    ? images.auto?.id === selectedResourceId
                                      ? 'navigation.draftIconHelp'
                                      : 'navigation.savedIconHelp'
                                    : spaceId === 'normal'
                                      ? 'navigation.websiteIconHelp'
                                      : 'navigation.privateIconHelp'
                                : 'navigation.uploadIconHelp',
                          )}
                        </p>
                        <div className="site-edit-image-actions">
                          {selectedImageSource === 'auto' && (
                            <Button
                              type="button"
                              variant="outline"
                              className="site-edit-fetch"
                              aria-label={t('navigation.fetchIcon')}
                              onClick={() => void autoFetch()}
                              disabled={busy || fetching}
                            >
                              {fetching ? (
                                <LoaderCircle className="spin" size={14} />
                              ) : (
                                <Globe2 size={14} />
                              )}
                              {t(
                                selectedResourceId || selectedBrand
                                  ? 'navigation.refreshIcon'
                                  : 'navigation.getIcon',
                              )}
                            </Button>
                          )}
                          {selectedImageSource === 'resource' && (
                            <Button
                              type="button"
                              variant="outline"
                              disabled={busy}
                              onClick={() => imageInput.current?.click()}
                            >
                              <Upload size={14} />
                              {t(
                                selectedResourceId
                                  ? 'navigation.replaceImage'
                                  : 'navigation.chooseImage',
                              )}
                            </Button>
                          )}
                          {selectedResourceId && (
                            <Button
                              type="button"
                              variant="ghost"
                              disabled={busy || openingCrop}
                              onClick={() => void openCrop()}
                            >
                              {openingCrop ? (
                                <LoaderCircle className="spin" size={14} />
                              ) : (
                                <Crop size={14} />
                              )}
                              {t('navigation.cropIcon')}
                            </Button>
                          )}
                          {images[selectedImageSource] &&
                            images[selectedImageSource]!.blob !==
                              images[selectedImageSource]!.original && (
                              <Button
                                type="button"
                                variant="ghost"
                                disabled={busy}
                                onClick={() => {
                                  const image = images[selectedImageSource]!;
                                  setImageSelection(selectedImageSource, image.original);
                                }}
                              >
                                {t('navigation.originalImage')}
                              </Button>
                            )}
                        </div>
                        {errors.websiteResourceId && selectedImageSource === 'auto' && (
                          <p className="form-error" role="alert">
                            {errors.websiteResourceId.message?.startsWith('navigation.')
                              ? t(errors.websiteResourceId.message)
                              : errors.websiteResourceId.message}
                          </p>
                        )}
                      </div>
                    )}
                    <input
                      ref={imageInput}
                      type="file"
                      hidden
                      disabled={busy}
                      accept="image/png,image/jpeg,image/webp,image/x-icon,image/vnd.microsoft.icon,image/svg+xml,.ico,.svg"
                      onChange={(event) => {
                        const file = event.target.files?.[0];
                        if (file) {
                          try {
                            iconEdited.current = true;
                            setImageSelection('resource', file);
                          } catch (reason) {
                            form.setError('uploadResourceId', { message: errorMessage(reason) });
                          }
                        }
                        event.target.value = '';
                      }}
                    />
                    {errors.uploadResourceId && selectedSource === 'resource' && (
                      <p className="form-error" role="alert">
                        {errors.uploadResourceId.message === 'navigation.uploadRequired'
                          ? t('navigation.uploadRequired')
                          : errors.uploadResourceId.message}
                      </p>
                    )}
                    {selectedSource === 'text' && (
                      <div className="site-edit-text-row">
                        <label htmlFor={`${id}-text`}>{t('navigation.iconText')}</label>
                        <div className="site-edit-text-input">
                          <Type size={14} aria-hidden="true" />
                          <Input
                            id={`${id}-text`}
                            {...form.register('textIcon', {
                              onChange: () => {
                                iconEdited.current = true;
                                textEdited.current = true;
                              },
                            })}
                            aria-invalid={Boolean(errors.textIcon)}
                            aria-describedby={errors.textIcon ? `${id}-text-error` : undefined}
                            disabled={busy}
                          />
                        </div>
                        {errors.textIcon && (
                          <p id={`${id}-text-error`} className="form-error" role="alert">
                            {t(errors.textIcon.message!)}
                          </p>
                        )}
                      </div>
                    )}
                    {!selectedBrand?.tile && (
                      <div className="site-edit-field">
                        <label id={`${id}-color`}>{t('navigation.iconColor')}</label>
                        <Controller
                          control={form.control}
                          name="iconBackground"
                          render={({ field }) => (
                            <div
                              className="site-edit-palette"
                              role="group"
                              aria-labelledby={`${id}-color`}
                            >
                              <button
                                type="button"
                                className="site-edit-auto-color"
                                aria-label={t('navigation.automaticBackground')}
                                title={t('navigation.automaticBackground')}
                                aria-pressed={field.value.mode === 'auto'}
                                disabled={busy}
                                onClick={() => field.onChange({ mode: 'auto' })}
                              >
                                <Sparkles size={14} aria-hidden="true" />
                              </button>
                              {BACKGROUND_COLORS.map(({ color, label }) => (
                                <button
                                  key={color}
                                  type="button"
                                  className="site-edit-color"
                                  style={{ '--icon-color': color } as CSSProperties}
                                  aria-label={t(label)}
                                  title={t(label)}
                                  aria-pressed={
                                    field.value.mode === 'color' && field.value.color === color
                                  }
                                  disabled={busy}
                                  onClick={() => field.onChange({ mode: 'color', color })}
                                >
                                  {field.value.mode === 'color' && field.value.color === color && (
                                    <Check size={14} aria-hidden="true" />
                                  )}
                                </button>
                              ))}
                              <label
                                className="site-edit-custom-color"
                                title={t('navigation.customBackground')}
                                data-state={
                                  field.value.mode === 'color' &&
                                  !BACKGROUND_COLORS.map(({ color }) => color).includes(
                                    field.value.color,
                                  )
                                    ? 'checked'
                                    : 'unchecked'
                                }
                              >
                                <input
                                  type="color"
                                  aria-label={t('navigation.customColor')}
                                  value={
                                    field.value.mode === 'color'
                                      ? field.value.color
                                      : BACKGROUND_COLORS[2].color
                                  }
                                  disabled={busy}
                                  onChange={(event) =>
                                    field.onChange({ mode: 'color', color: event.target.value })
                                  }
                                />
                                <span
                                  className="site-edit-picker-preview"
                                  aria-hidden="true"
                                  style={
                                    {
                                      '--picker-colors': `conic-gradient(${BACKGROUND_COLORS.slice(
                                        2,
                                      )
                                        .map(({ color }) => color)
                                        .join(',')})`,
                                    } as CSSProperties
                                  }
                                />
                              </label>
                            </div>
                          )}
                        />
                        {errors.iconBackground && (
                          <p className="form-error" role="alert">
                            {t('navigation.invalidIcon')}
                          </p>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>
          {errors.root && (
            <p className="form-error site-edit-error" role="alert">
              {errors.root.message}
            </p>
          )}
          <DialogFooter className="site-edit-footer">
            <Button
              type="button"
              variant="ghost"
              className="site-edit-cancel"
              disabled={busy}
              onClick={() => void requestClose()}
            >
              {t('messages.cancel')}
            </Button>
            <Button
              type="submit"
              className="site-edit-save"
              disabled={busy || fetching || openingCrop}
            >
              {isSubmitting && <LoaderCircle className="spin" size={15} />}
              {t('messages.save')}
            </Button>
          </DialogFooter>
        </form>
        {confirmDialog}
        {cropImage && (
          <Suspense fallback={null}>
            <IconCropDialog
              image={cropImage.blob}
              onClose={() => setCropImage(undefined)}
              onApply={(blob) => {
                if (
                  form.getValues('iconType') === cropImage.source &&
                  form.getValues(resourceField(cropImage.source)) === cropImage.resourceId
                ) {
                  iconEdited.current = true;
                  setImageSelection(
                    cropImage.source,
                    blob,
                    images[cropImage.source]?.original ?? cropImage.blob,
                  );
                }
                setCropImage(undefined);
              }}
            />
          </Suspense>
        )}
      </DialogContent>
    </Dialog>
  );
}
