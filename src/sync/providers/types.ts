import { AppError, type ErrorValues } from '@/lib/errors';
import { z } from '@/lib/zod';

export type RemoteFile = { content: string; version: string | null };
export class SyncProviderError extends AppError {
  constructor(
    message: string,
    public readonly code: 'auth' | 'not-found' | 'conflict' | 'network' | 'invalid',
    values: ErrorValues = {},
  ) {
    super(message, values);
  }
}
export interface SyncProvider {
  read(): Promise<RemoteFile | null>;
  write(content: string, expectedVersion: string | null): Promise<string | null>;
}
const webDavConfigSchema = z.object({
  type: z.literal('webdav'),
  url: z.string(),
  username: z.string(),
  password: z.string(),
});
const gitConfigSchema = z.object({
  token: z.string(),
  owner: z.string(),
  repo: z.string(),
  path: z.string(),
  branch: z.string().optional(),
});
const gitHubConfigSchema = gitConfigSchema.extend({ type: z.literal('github') });
const giteeConfigSchema = gitConfigSchema.extend({ type: z.literal('gitee') });

export const syncConnectionSchema = z.discriminatedUnion('type', [
  webDavConfigSchema,
  gitHubConfigSchema,
  giteeConfigSchema,
]);
export type WebDavConfig = z.infer<typeof webDavConfigSchema>;
export type GitHubConfig = z.infer<typeof gitHubConfigSchema>;
export type GiteeConfig = z.infer<typeof giteeConfigSchema>;
export type SyncConnection = z.infer<typeof syncConnectionSchema>;
