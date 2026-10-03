import { SyncProviderError } from './types';
import { z } from 'zod';

export const gitFileResponseSchema = z.object({
  type: z.string(),
  content: z.string(),
  sha: z.string().min(1),
});
export const gitWriteResponseSchema = z.object({ content: z.object({ sha: z.string().min(1) }) });

export async function parseResponseJson<T>(response: Response, schema: z.ZodType<T>): Promise<T> {
  let value: unknown;
  try {
    value = await response.json();
  } catch {
    throw new SyncProviderError('errors.sync.invalidRemoteResponse', 'invalid');
  }
  const parsed = schema.safeParse(value);
  if (!parsed.success) throw new SyncProviderError('errors.sync.invalidRemoteResponse', 'invalid');
  return parsed.data;
}

export async function request(url: string, init: RequestInit) {
  let response: Response;
  try {
    response = await fetch(url, init);
  } catch {
    throw new SyncProviderError('messages.theConnectionFailedCheckTheAddressAndNetwork', 'network');
  }
  if (response.status === 401 || response.status === 403)
    throw new SyncProviderError(
      'messages.authenticationFailedCheckTheAccountOrTokenPermissions',
      'auth',
    );
  if (response.status === 404)
    throw new SyncProviderError('messages.theRemoteFileDoesNotExist', 'not-found');
  if (response.status === 409 || response.status === 412)
    throw new SyncProviderError('messages.theRemoteContentWasUpdatedByAnotherDevice', 'conflict');
  if (!response.ok)
    throw new SyncProviderError('errors.remoteStatus', 'network', { status: response.status });
  return response;
}
export function encodeBase64(value: string) {
  const bytes = new TextEncoder().encode(value);
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}
export function decodeBase64(value: string) {
  const binary = atob(value.replace(/\s/g, ''));
  return new TextDecoder().decode(Uint8Array.from(binary, (character) => character.charCodeAt(0)));
}
