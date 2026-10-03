import { useEffect, useId, useRef, useState } from 'react';
import { useForm, useWatch } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Slider } from 'radix-ui';
import { useTranslation } from 'react-i18next';
import Cropper from 'react-easy-crop';
import 'react-easy-crop/react-easy-crop.css';
import { LoaderCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { cropImage } from '@/lib/images';
import { errorMessage } from '@/lib/errors';
import './site-editor.css';

const cropSchema = z.object({
  area: z.object({
    x: z.number().nonnegative(),
    y: z.number().nonnegative(),
    width: z.number().positive(),
    height: z.number().positive(),
  }),
});

export default function IconCropDialog({
  image,
  onApply,
  onClose,
}: {
  image: Blob;
  onApply: (image: Blob) => void;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const id = useId();
  const form = useForm<z.infer<typeof cropSchema>>({ resolver: zodResolver(cropSchema) });
  const area = useWatch({ control: form.control, name: 'area' });
  const { isSubmitting, errors } = form.formState;
  // Cropper owns transient pointer/zoom interaction; RHF owns the result and submission.
  const [crop, setCrop] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [imageUrl, setImageUrl] = useState<string>();
  const stage = useRef<HTMLDivElement>(null);
  const cropper = useRef<HTMLDivElement | null>(null);
  const active = useRef(true);
  useEffect(() => {
    active.current = true;
    const url = URL.createObjectURL(image);
    setImageUrl(url);
    return () => {
      active.current = false;
      URL.revokeObjectURL(url);
    };
  }, [image]);
  const close = () => {
    if (!isSubmitting) onClose();
  };
  return (
    <Dialog open onOpenChange={(open) => !open && close()}>
      <DialogContent
        className="icon-crop-dialog"
        closeLabel={t('messages.close')}
        showCloseButton={!isSubmitting}
        onOpenAutoFocus={(event) => {
          event.preventDefault();
          (cropper.current ?? stage.current)?.focus();
        }}
      >
        <form
          className="icon-crop-form"
          noValidate
          onSubmit={form.handleSubmit(async ({ area: selectedArea }) => {
            try {
              const cropped = await cropImage(image, selectedArea);
              if (active.current) onApply(cropped);
            } catch (reason) {
              if (active.current) form.setError('root', { message: errorMessage(reason) });
            }
          })}
        >
          <DialogHeader>
            <DialogTitle>{t('navigation.cropTitle')}</DialogTitle>
            <DialogDescription>{t('navigation.cropHelp')}</DialogDescription>
          </DialogHeader>
          <div
            ref={stage}
            className="icon-crop-stage"
            tabIndex={-1}
            aria-label={t('navigation.cropTitle')}
            aria-busy={isSubmitting}
          >
            {imageUrl && (
              <Cropper
                image={imageUrl}
                crop={crop}
                zoom={zoom}
                aspect={1}
                minZoom={1}
                maxZoom={4}
                onCropChange={(value) => !isSubmitting && setCrop(value)}
                onZoomChange={(value) => !isSubmitting && setZoom(value)}
                onCropComplete={(_, pixels) =>
                  !isSubmitting && form.setValue('area', pixels, { shouldDirty: true })
                }
                onTouchRequest={() => !isSubmitting}
                onWheelRequest={() => !isSubmitting}
                setCropperRef={(ref) => {
                  cropper.current = ref.current;
                }}
                onMediaLoaded={() => cropper.current?.focus()}
                cropperProps={{ 'aria-label': t('navigation.cropTitle') }}
                mediaProps={{
                  onError: () =>
                    form.setError('root', { message: t('messages.thisImageCannotBeRead') }),
                }}
                disableAutomaticStylesInjection
              />
            )}
          </div>
          <div className="icon-crop-zoom">
            <label id={`${id}-zoom`}>{t('navigation.cropZoom')}</label>
            <Slider.Root
              className="icon-crop-slider"
              value={[zoom]}
              onValueChange={([value]) => setZoom(value)}
              min={1}
              max={4}
              step={0.05}
              disabled={isSubmitting}
            >
              <Slider.Track className="icon-crop-slider-track">
                <Slider.Range className="icon-crop-slider-range" />
              </Slider.Track>
              <Slider.Thumb className="icon-crop-slider-thumb" aria-labelledby={`${id}-zoom`} />
            </Slider.Root>
            <output>{zoom.toFixed(2)}×</output>
          </div>
          <p className="site-edit-help">{t('navigation.cropPreservesBackground')}</p>
          {errors.root && (
            <p className="form-error" role="alert">
              {errors.root.message}
            </p>
          )}
          {errors.area && (
            <p className="form-error" role="alert">
              {t('navigation.cropRequired')}
            </p>
          )}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={close} disabled={isSubmitting}>
              {t('messages.cancel')}
            </Button>
            <Button type="submit" disabled={!area || isSubmitting}>
              {isSubmitting && <LoaderCircle className="spin" size={15} aria-hidden="true" />}
              {t('navigation.applyCrop')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
