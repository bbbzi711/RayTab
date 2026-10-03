import { useEffect, useId, type ReactNode, type Ref } from 'react';
import { Check, ChevronDown, FileUp } from 'lucide-react';
import { Select, Slider, Switch } from 'radix-ui';
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
    <p className="settings-form-error" role="alert">
      {['settings.', 'messages.', 'errors.', 'navigation.'].some((prefix) =>
        error.message!.startsWith(prefix),
      )
        ? t(error.message)
        : error.message}
    </p>
  );
}

export function SettingsSection({ title, children }: { title?: string; children: ReactNode }) {
  return (
    <section className="settings-section">
      {title && <h3>{title}</h3>}
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
      <Switch.Root
        id={id}
        className="settings-switch"
        checked={checked}
        onCheckedChange={onChange}
        disabled={disabled}
      >
        <Switch.Thumb className="settings-switch-thumb" />
      </Switch.Root>
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
}: {
  label: string;
  value: string;
  options: readonly (readonly [string, string])[];
  onChange: (value: string) => void;
  disabled?: boolean;
  name?: string;
  triggerRef?: Ref<HTMLButtonElement>;
}) {
  const id = useId();
  return (
    <div className="setting-row setting-control-row">
      <div>
        <label htmlFor={id}>{label}</label>
      </div>
      <Select.Root value={value} onValueChange={onChange} disabled={disabled} name={name}>
        <Select.Trigger id={id} className="settings-select-trigger" ref={triggerRef}>
          <Select.Value />
          <Select.Icon>
            <ChevronDown size={15} aria-hidden="true" />
          </Select.Icon>
        </Select.Trigger>
        <Select.Portal>
          <Select.Content className="settings-select-content" position="popper" sideOffset={6}>
            <Select.Viewport>
              {options.map(([option, text]) => (
                <Select.Item className="settings-select-item" key={option} value={option}>
                  <Select.ItemText>{text}</Select.ItemText>
                  <Select.ItemIndicator>
                    <Check size={14} aria-hidden="true" />
                  </Select.ItemIndicator>
                </Select.Item>
              ))}
            </Select.Viewport>
          </Select.Content>
        </Select.Portal>
      </Select.Root>
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
      <Slider.Root
        className="settings-slider"
        value={[value]}
        min={min}
        max={max}
        step={step}
        onValueChange={([next]) => onPreview(next)}
        onValueCommit={([next]) => onCommit(next)}
      >
        <Slider.Track className="settings-slider-track">
          <Slider.Range className="settings-slider-range" />
        </Slider.Track>
        <Slider.Thumb
          className="settings-slider-thumb"
          aria-labelledby={id}
          aria-valuetext={format(value)}
        />
      </Slider.Root>
      <output>{format(value)}</output>
    </div>
  );
}
