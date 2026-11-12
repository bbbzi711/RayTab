import { useEffect, useId, type ReactNode, type Ref } from 'react';
import { FileUp } from 'lucide-react';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Slider } from '@/components/ui/slider';
import { Switch } from '@/components/ui/switch';
import { cn } from '@/lib/utils';
import { useTranslation } from 'react-i18next';
import type { FieldError, UseFormRegisterReturn } from 'react-hook-form';

export type DraftReporter = (id: string, dirty: boolean, busy: boolean) => void;

export function useDraftStatus(id: string, dirty: boolean, busy: boolean, report?: DraftReporter) {
  useEffect(() => report?.(id, dirty, busy), [id, dirty, busy, report]);
  useEffect(() => () => report?.(id, false, false), [id, report]);
}

export function FormError({ error }: { error?: FieldError | { message?: string } }) {
  const { t } = useTranslation();
  if (!error?.message) return null;
  return (
    <p className="m-0 wrap-anywhere text-xs text-destructive" role="alert">
      {['settings.', 'messages.', 'errors.', 'navigation.'].some((prefix) =>
        error.message!.startsWith(prefix),
      )
        ? t(error.message)
        : error.message}
    </p>
  );
}

export function FormSaveHint({ dirty }: { dirty: boolean }) {
  const { t } = useTranslation();
  return dirty ? (
    <p className="m-0 wrap-anywhere text-xs text-muted-foreground">
      {t('settings.pendingSaveHelp')}
    </p>
  ) : null;
}

export function SettingsSection({ title, children }: { title?: string; children: ReactNode }) {
  return (
    <section className="settings-section">
      {title && <h3 className="m-0 text-sm font-semibold text-foreground">{title}</h3>}
      <div className="settings-section-body">{children}</div>
    </section>
  );
}

export function SettingsFilePicker({
  label,
  accept,
  hint,
  file,
  registration,
  disabled,
  invalid,
}: {
  label: string;
  accept: string;
  hint: string;
  file?: FileList;
  registration: UseFormRegisterReturn;
  disabled: boolean;
  invalid: boolean;
}) {
  const { t } = useTranslation();
  const id = useId();
  return (
    <div className="settings-file-picker" data-disabled={disabled || undefined}>
      <input
        id={id}
        className="settings-file-input"
        type="file"
        accept={accept}
        aria-label={label}
        aria-describedby={id + '-hint'}
        aria-invalid={invalid}
        {...registration}
        disabled={disabled}
      />
      <label htmlFor={id} className="settings-file-surface">
        <FileUp size={22} aria-hidden="true" />
        <span className="settings-file-description">
          <strong title={file?.[0]?.name}>{file?.[0]?.name || label}</strong>
          <small id={id + '-hint'}>{hint}</small>
        </span>
        <span className="settings-file-action" aria-hidden="true">
          {t(file?.length ? 'settings.dataTasks.changeFile' : 'settings.dataTasks.chooseFile')}
        </span>
      </label>
    </div>
  );
}

export function Toggle({
  label,
  checked,
  onChange,
  disabled,
}: {
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
  disabled?: boolean;
}) {
  const id = useId();
  return (
    <div className="setting-row setting-control-row">
      <div>
        <label htmlFor={id}>{label}</label>
      </div>
      <Switch
        id={id}
        className="relative after:absolute after:-inset-y-2 after:-inset-x-0.5"
        checked={checked}
        onCheckedChange={onChange}
        disabled={disabled}
      />
    </div>
  );
}

export function SettingsSelect({
  label,
  value,
  options,
  onChange,
  disabled,
  name,
  triggerRef,
  triggerClassName,
}: {
  label: string;
  value: string;
  options: readonly (readonly [string, string])[];
  onChange: (value: string) => void;
  disabled?: boolean;
  name?: string;
  triggerRef?: Ref<HTMLButtonElement>;
  triggerClassName?: string;
}) {
  const id = useId();
  return (
    <div className="setting-row setting-control-row">
      <div>
        <label htmlFor={id}>{label}</label>
      </div>
      <Select value={value} onValueChange={onChange} disabled={disabled} name={name}>
        <SelectTrigger
          id={id}
          className={cn('min-w-33 max-w-[60%] max-[420px]:min-w-27.5', triggerClassName)}
          ref={triggerRef}
        >
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {options.map(([option, text]) => (
            <SelectItem key={option} value={option}>
              {text}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

export function RangeSetting({
  label,
  value,
  min,
  max,
  step,
  format = String,
  onPreview,
  onCommit,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  format?: (value: number) => string;
  onPreview: (value: number) => void;
  onCommit: (value: number) => void;
}) {
  const id = useId();
  return (
    <div className="setting-range">
      <div className="setting-range-label">
        <label id={id}>{label}</label>
      </div>
      <Slider
        value={[value]}
        min={min}
        max={max}
        step={step}
        onValueChange={([next]) => onPreview(next)}
        onValueCommit={([next]) => onCommit(next)}
        thumbProps={{ 'aria-labelledby': id, 'aria-valuetext': format(value) }}
      />
      <output>{format(value)}</output>
    </div>
  );
}
