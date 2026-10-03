import { ZodError } from 'zod';
import i18n from '@/locales';

export type ErrorValues = Record<string, string | number>;

export class AppError extends Error {
  readonly translationKey: string;
  readonly values: ErrorValues;

  constructor(code: string, values: ErrorValues = {}) {
    super(code);
    this.name = 'AppError';
    this.translationKey = code;
    this.values = values;
  }
}

export type StoredError = { code: string; values?: ErrorValues; detail?: string };

export function serializeError(reason: unknown): StoredError {
  if (reason instanceof AppError) return { code: reason.translationKey, values: reason.values };
  if (
    reason instanceof Error &&
    (reason.message.startsWith('messages.') || reason.message.startsWith('errors.'))
  )
    return { code: reason.message };
  if (reason instanceof ZodError) {
    const issue = reason.issues[0];
    return issue?.message.startsWith('messages.') || issue?.message.startsWith('errors.')
      ? { code: issue.message }
      : { code: 'errors.invalidInput' };
  }
  if (
    typeof reason === 'string' &&
    (reason.startsWith('messages.') || reason.startsWith('errors.'))
  )
    return { code: reason };
  return {
    code: 'messages.anErrorOccurredTryAgain',
    detail:
      reason instanceof Error ? reason.message : typeof reason === 'string' ? reason : undefined,
  };
}

export function errorMessage(reason: unknown): string {
  const error = serializeError(reason);
  const message = i18n.t(error.code, error.values ?? {});
  return error.detail ? `${message} (${error.detail})` : message;
}

export function storedErrorMessage(error?: StoredError | string): string {
  if (!error) return '';
  if (typeof error === 'string') return error;
  const message = i18n.t(error.code, error.values ?? {});
  return error.detail ? `${message} (${error.detail})` : message;
}
