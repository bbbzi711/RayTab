import { z } from 'zod';
import { normalizeUrl, siteSchema } from '@/storage/model';

export const destinationSchema = siteSchema.pick({ groupId: true, folderId: true });
export type Destination = z.infer<typeof destinationSchema>;

const nameValue = z
  .string()
  .trim()
  .min(1, 'navigation.invalidName')
  .max(80, 'navigation.invalidName');
export const nameSchema = z.object({ name: nameValue });

const siteEditorDraftSchema = siteSchema.pick({ iconBackground: true }).extend({
  title: nameValue,
  url: z
    .string()
    .transform((value, context) => {
      try {
        return normalizeUrl(value);
      } catch {
        context.addIssue({ code: 'custom', message: 'navigation.invalidUrl' });
        return z.NEVER;
      }
    })
    .pipe(siteSchema.shape.url),
  location: destinationSchema,
  iconType: z.enum(['text', 'auto', 'resource']),
  textIcon: z.string(),
  websiteResourceId: z.string().max(100),
  uploadResourceId: z.string().max(100),
});

export const siteEditorSchema = siteEditorDraftSchema
  .superRefine((values, context) => {
    if (values.iconType === 'text') {
      const length = Array.from(values.textIcon.trim()).length;
      if (length < 1 || length > 4)
        context.addIssue({
          code: 'custom',
          path: ['textIcon'],
          message: 'navigation.invalidIconText',
        });
    }
    if (values.iconType === 'resource' && !values.uploadResourceId)
      context.addIssue({
        code: 'custom',
        path: ['uploadResourceId'],
        message: 'navigation.uploadRequired',
      });
  })
  .transform(({ iconType, textIcon, websiteResourceId, uploadResourceId, ...values }) => ({
    ...values,
    icon:
      iconType === 'text'
        ? { source: 'text' as const, text: textIcon.trim() }
        : iconType === 'resource'
          ? { source: 'resource' as const, resourceId: uploadResourceId }
          : {
              source: 'auto' as const,
              ...(websiteResourceId ? { resourceId: websiteResourceId } : {}),
            },
  }));
