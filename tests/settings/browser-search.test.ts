import { expect, it, vi } from 'vitest';
import { searchWithBrowser } from '../../src/features/search/browser-search';

it('delegates Chromium searches to its native default-provider API in the requested tab', async () => {
  const query = vi.fn().mockResolvedValue(undefined);
  vi.stubGlobal('browser', { search: { query } });
  await searchWithBrowser('中文 & search', true);
  expect(query).toHaveBeenCalledWith({ text: '中文 & search', disposition: 'NEW_TAB' });
  await searchWithBrowser('next search', false);
  expect(query).toHaveBeenLastCalledWith({ text: 'next search', disposition: 'CURRENT_TAB' });
});

it('supports the Firefox default provider in the requested tab without selecting a provider', async () => {
  const search = vi.fn().mockResolvedValue(undefined);
  vi.stubGlobal('browser', { search: { search } });
  await searchWithBrowser('中文 & search', false);
  expect(search).toHaveBeenCalledWith({ query: '中文 & search', disposition: 'CURRENT_TAB' });
  await searchWithBrowser('next search', true);
  expect(search).toHaveBeenLastCalledWith({ query: 'next search', disposition: 'NEW_TAB' });
});

it('reports unavailable and failed native search without sending the query to a different provider', async () => {
  vi.stubGlobal('browser', undefined);
  await expect(searchWithBrowser('private query', true)).rejects.toMatchObject({
    translationKey: 'messages.browserSearchUnavailable',
  });
  const failure = new Error('Search service unavailable');
  const query = vi.fn().mockRejectedValue(failure);
  const otherProvider = vi.fn();
  vi.stubGlobal('browser', { search: { query, search: otherProvider } });
  await expect(searchWithBrowser('private query', true)).rejects.toBe(failure);
  expect(otherProvider).not.toHaveBeenCalled();
});
