import { AppError } from '@/lib/errors';

// Chromium and Firefox expose different methods for the same default-provider action.
type BrowserSearchApi = {
  query?: (options: { text: string; disposition: 'NEW_TAB' | 'CURRENT_TAB' }) => Promise<void>;
  search?: (options: {
    query: string;
    disposition: 'NEW_TAB' | 'CURRENT_TAB';
  }) => Promise<void> | void;
};

export async function searchWithBrowser(text: string, openInNewTab: boolean) {
  const api: BrowserSearchApi | undefined =
    typeof browser === 'undefined' ? undefined : browser.search;
  const disposition = openInNewTab ? 'NEW_TAB' : 'CURRENT_TAB';
  if (api?.query) await api.query({ text, disposition });
  else if (api?.search) await api.search({ query: text, disposition });
  else throw new AppError('messages.browserSearchUnavailable');
}
