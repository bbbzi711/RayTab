import { z } from 'zod';

const ITERATIONS = 310_000;
const encoder = new TextEncoder();
const decoder = new TextDecoder();

export const encryptedEnvelopeSchema = z.object({
  version: z.literal(1),
  algorithm: z.literal('AES-GCM'),
  kdf: z.literal('PBKDF2-SHA256'),
  iterations: z.number().int().min(100_000),
  salt: z.string().min(1),
  iv: z.string().min(1),
  ciphertext: z.string().min(1),
});
export type EncryptedEnvelope = z.infer<typeof encryptedEnvelopeSchema>;

export async function encryptJson(value: unknown, password: string): Promise<EncryptedEnvelope> {
  if (password.length < 6) throw new Error('密码至少需要 6 个字符');
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await deriveKey(password, salt, ITERATIONS);
  const ciphertext = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv, additionalData: encoder.encode('RayTab/private/v1') },
    key,
    encoder.encode(JSON.stringify(value)),
  );
  return {
    version: 1,
    algorithm: 'AES-GCM',
    kdf: 'PBKDF2-SHA256',
    iterations: ITERATIONS,
    salt: toBase64(salt),
    iv: toBase64(iv),
    ciphertext: toBase64(new Uint8Array(ciphertext)),
  };
}

export async function decryptJson<T>(envelope: EncryptedEnvelope, password: string): Promise<T> {
  const valid = encryptedEnvelopeSchema.parse(envelope);
  try {
    const key = await deriveKey(password, fromBase64(valid.salt), valid.iterations);
    const plaintext = await crypto.subtle.decrypt(
      {
        name: 'AES-GCM',
        iv: fromBase64(valid.iv),
        additionalData: encoder.encode('RayTab/private/v1'),
      },
      key,
      fromBase64(valid.ciphertext),
    );
    return JSON.parse(decoder.decode(plaintext)) as T;
  } catch {
    throw new Error('密码错误或加密数据已损坏');
  }
}

async function deriveKey(password: string, salt: Uint8Array, iterations: number) {
  const material = await crypto.subtle.importKey('raw', encoder.encode(password), 'PBKDF2', false, [
    'deriveKey',
  ]);
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', hash: 'SHA-256', salt: toArrayBuffer(salt), iterations },
    material,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  );
}

function toArrayBuffer(bytes: Uint8Array) {
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
}

function toBase64(bytes: Uint8Array) {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}
function fromBase64(value: string) {
  const binary = atob(value);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}
