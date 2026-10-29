import { describe, expect, it } from 'vitest';
import { zodResolver } from '@hookform/resolvers/zod';
import {
  nameSchema,
  siteEditorSchema,
} from '../../src/features/navigation/navigation-form-schemas';
import { defaultSiteIcon, defaultSiteIconBackground } from '../../src/storage/model';
const form = {
  title: '  Example  ',
  url: 'example.test/path?q=raytab#section',
  location: { groupId: 'group', folderId: null },
  iconType: defaultSiteIcon.source,
  textIcon: '',
  websiteResourceId: '',
  uploadResourceId: '',
  iconBackground: defaultSiteIconBackground,
};

describe('navigation form validation', () => {
  it.each([
    { text: '😀😀😀😀', accepted: true },
    { text: '😀😀😀😀😀', accepted: false },
  ])(
    'validates text icon character limits without splitting emoji: $text',
    ({ text, accepted }) => {
      const result = siteEditorSchema.safeParse({ ...form, iconType: 'text', textIcon: text });
      expect(result.success).toBe(accepted);
      if (!result.success) expect(result.error.issues[0].path).toEqual(['textIcon']);
    },
  );
  it('passes normalized values through the standard RHF resolver without losing URL details', async () => {
    const resolver = zodResolver(siteEditorSchema);
    const result = await resolver(form, undefined, {
      fields: {},
      shouldUseNativeValidation: false,
    });
    expect(result.errors).toEqual({});
    expect(result.values).toMatchObject({
      title: 'Example',
      url: 'https://example.test/path?q=raytab#section',
    });
  });

  it.each(['javascript:alert(1)', 'https://user:secret@example.test', '', 'https://'])(
    'keeps invalid URL %s attached to the URL field',
    (url) => {
      const result = siteEditorSchema.safeParse({ ...form, url });
      expect(result.success).toBe(false);
      if (!result.success) expect(result.error.issues[0].path).toEqual(['url']);
    },
  );

  it('validates saved names and complete resource/background choices', () => {
    expect(nameSchema.parse({ name: '  Group  ' })).toEqual({ name: 'Group' });
    expect(nameSchema.safeParse({ name: '   ' }).success).toBe(false);
    expect(nameSchema.safeParse({ name: 'A'.repeat(81) }).success).toBe(false);
    expect(siteEditorSchema.safeParse({ ...form, iconType: 'resource' }).success).toBe(false);
    expect(
      siteEditorSchema.safeParse({ ...form, iconBackground: { mode: 'color', color: '#zzzzzz' } })
        .success,
    ).toBe(false);
    expect(
      siteEditorSchema.safeParse({
        ...form,
        iconType: 'resource',
        uploadResourceId: 'local-asset',
        iconBackground: { mode: 'transparent' },
      }).success,
    ).toBe(true);
  });

  it('validates the selected icon only and saves a single source without inactive drafts', () => {
    const selected = {
      ...form,
      textIcon: '  中🙂  ',
      websiteResourceId: 'website-image',
      websiteFit: 'original',
      uploadResourceId: 'upload-image',
    };
    expect(siteEditorSchema.parse({ ...selected, iconType: 'text' }).icon).toEqual({
      source: 'text',
      text: '中🙂',
    });
    expect(siteEditorSchema.parse({ ...selected, iconType: 'auto' }).icon).toEqual({
      source: 'auto',
      resourceId: 'website-image',
      fit: 'original',
    });
    expect(siteEditorSchema.parse({ ...selected, iconType: 'resource' }).icon).toEqual({
      source: 'resource',
      resourceId: 'upload-image',
    });
    expect(siteEditorSchema.parse({ ...form, iconType: 'auto' }).icon).toEqual({ source: 'auto' });
    const empty = siteEditorSchema.safeParse({ ...form, iconType: 'text' });
    expect(empty.success).toBe(false);
    if (!empty.success) expect(empty.error.issues[0].path).toEqual(['textIcon']);
  });
});
