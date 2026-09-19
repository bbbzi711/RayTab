import { SyncProviderError } from './types';

export async function request(url: string, init: RequestInit) {
  let response: Response;
  try {
    response = await fetch(url, init);
  } catch {
    throw new SyncProviderError('网络连接失败，请检查地址和网络', 'network');
  }
  if (response.status === 401 || response.status === 403)
    throw new SyncProviderError('认证失败，请检查账号或令牌权限', 'auth');
  if (response.status === 404) throw new SyncProviderError('远端文件不存在', 'not-found');
  if (response.status === 409 || response.status === 412)
    throw new SyncProviderError('远端内容已被其他设备更新', 'conflict');
  if (!response.ok) throw new SyncProviderError(`远端服务返回 ${response.status}`, 'network');
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
