import { useEffect, useId, type ReactNode } from 'react';
import { Check, FileUp } from 'lucide-react';
import { ToggleGroup } from 'radix-ui';
import { Button } from '@/components/ui/button';
import type { SpaceSettings } from '@/storage/model';
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
    <section className="settings-section grid min-w-0 gap-[9px]">
      {title && (
        <h3 className="m-0 px-0.5 text-xs font-semibold leading-[18px] text-muted-foreground">
          {title}
        </h3>
      )}
      <div className="settings-section-body grid min-w-0 gap-1 rounded-xl border border-(--preferences-line) bg-(--preferences-surface) px-3 py-2">
        {children}
      </div>
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

export function ThemeSetting({
  value,
  onChange,
}: {
  value: SpaceSettings['theme'];
  onChange: (value: SpaceSettings['theme']) => void;
}) {
  const { t } = useTranslation();
  return (
    <ToggleGroup.Root
      type="multiple"
      orientation="horizontal"
      className="theme-options grid grid-cols-3 gap-2"
      aria-label={t('settings.theme')}
      value={[value]}
      onValueChange={(next) => {
        // Keep toolbar activation semantics, with exactly one active theme.
        const selected = next.at(-1);
        if (selected) onChange(selected as SpaceSettings['theme']);
      }}
    >
      {(['light', 'dark', 'system'] as const).map((theme) => (
        <Button key={theme} asChild variant="choice" size="choice">
          <ToggleGroup.Item value={theme} className="relative min-w-0">
            <span className="theme-preview" data-theme-option={theme} aria-hidden="true">
              <span className="theme-preview-rail" />
              <span className="theme-preview-content">
                <i />
                <i />
                <i />
                <i />
              </span>
            </span>
            <span>{t('settings.themes.' + theme)}</span>
            {value === theme && (
              <span
                className="absolute right-1.5 top-1.5 flex size-4 items-center justify-center rounded-full bg-primary text-primary-foreground"
                aria-hidden="true"
              >
                <Check className="size-2.5" />
              </span>
            )}
          </ToggleGroup.Item>
        </Button>
      ))}
    </ToggleGroup.Root>
  );
}

export function SettingsSelect({
  label,
  value,
  options,
  onChange,
  disabled,
  name,
  triggerClassName,
}: {
  label: string;
  value: string;
  options: readonly (readonly [string, string])[];
  onChange: (value: string) => void;
  disabled?: boolean;
  name?: string;
  triggerClassName?: string;
}) {
  const id = useId();
  return (
    <div className="setting-row setting-control-row">
      <div>
        <label htmlFor={id}>{label}</label>
      </div>
      <Select value={value} onValueChange={onChange} disabled={disabled} name={name}>
        <SelectTrigger id={id} className={cn('min-w-0 w-32 max-w-[60%]', triggerClassName)}>
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
    <div className="setting-range grid min-w-0 grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 pb-1 pt-0.5 text-[13px]">
      <div className="min-w-0 leading-5">
        <label id={id}>{label}</label>
      </div>
      <Slider
        className="col-span-2 row-start-2"
        value={[value]}
        min={min}
        max={max}
        step={step}
        onValueChange={([next]) => onPreview(next)}
        onValueCommit={([next]) => onCommit(next)}
        thumbProps={{ 'aria-labelledby': id, 'aria-valuetext': format(value) }}
      />
      <output className="col-start-2 row-start-1 whitespace-nowrap text-right text-[11px] text-muted-foreground tabular-nums">
        {format(value)}
      </output>
    </div>
  );
}
