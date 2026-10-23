import { useRef, useState } from 'react';
import { ArrowRight, Compass, Layers3, Shield } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { errorMessage } from '@/lib/errors';

const items = [
  { icon: Compass, title: 'onboarding.quickTitle', description: 'onboarding.quickDescription' },
  {
    icon: Layers3,
    title: 'onboarding.organizeTitle',
    description: 'onboarding.organizeDescription',
  },
  { icon: Shield, title: 'onboarding.privacyTitle', description: 'onboarding.privacyDescription' },
];

export function Onboarding({ onFinish }: { onFinish: () => Promise<void> }) {
  const { t } = useTranslation();
  const title = useRef<HTMLHeadingElement>(null);
  const [saving, setSaving] = useState(false);
  const [failure, setFailure] = useState<string>();
  const finish = async () => {
    if (saving) return;
    setSaving(true);
    setFailure(undefined);
    try {
      await onFinish();
    } catch (reason) {
      setFailure(errorMessage(reason));
    } finally {
      setSaving(false);
    }
  };
  return (
    <Dialog open>
      <DialogContent
        className="onboarding-card"
        overlayClassName="onboarding-backdrop"
        showCloseButton={false}
        onEscapeKeyDown={(event) => event.preventDefault()}
        onInteractOutside={(event) => event.preventDefault()}
        onOpenAutoFocus={(event) => {
          event.preventDefault();
          title.current?.focus({ preventScroll: true });
        }}
      >
        <div className="onboarding-brand" aria-hidden="true">
          <span>R</span>
          <i />
        </div>
        <header className="onboarding-copy">
          <p>{t('onboarding.welcome')}</p>
          <DialogTitle asChild>
            <h1 ref={title} tabIndex={-1} className="outline-none">
              {t('onboarding.title')}
            </h1>
          </DialogTitle>
          <DialogDescription asChild>
            <span>{t('onboarding.description')}</span>
          </DialogDescription>
        </header>
        <div className="onboarding-guide">
          {items.map(({ icon: Icon, title, description }) => (
            <article key={title}>
              <span className="onboarding-guide-icon">
                <Icon size={18} strokeWidth={1.8} />
              </span>
              <div>
                <h2>{t(title)}</h2>
                <p>{t(description)}</p>
              </div>
            </article>
          ))}
        </div>
        <button
          type="button"
          className="onboarding-start"
          disabled={saving}
          onClick={() => void finish()}
        >
          {t(saving ? 'onboarding.saving' : 'onboarding.action')}
          <ArrowRight size={17} />
        </button>
        {failure && (
          <p className="onboarding-error" role="alert">
            {failure}
          </p>
        )}
      </DialogContent>
    </Dialog>
  );
}
