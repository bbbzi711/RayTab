import { ArrowRight, Compass, Layers3, Shield } from 'lucide-react';
import { useTranslation } from 'react-i18next';

const items = [
  { icon: Compass, title: 'onboarding.quickTitle', description: 'onboarding.quickDescription' },
  {
    icon: Layers3,
    title: 'onboarding.organizeTitle',
    description: 'onboarding.organizeDescription',
  },
  { icon: Shield, title: 'onboarding.privacyTitle', description: 'onboarding.privacyDescription' },
];

export function Onboarding({ onFinish }: { onFinish: () => void }) {
  const { t } = useTranslation();
  return (
    <div className="onboarding-backdrop">
      <section
        className="onboarding-card"
        role="dialog"
        aria-modal="true"
        aria-labelledby="onboarding-title"
        aria-describedby="onboarding-description"
      >
        <div className="onboarding-brand" aria-hidden="true">
          <span>R</span>
          <i />
        </div>
        <header className="onboarding-copy">
          <p>{t('onboarding.welcome')}</p>
          <h1 id="onboarding-title">{t('onboarding.title')}</h1>
          <span id="onboarding-description">{t('onboarding.description')}</span>
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
        <button type="button" className="onboarding-start" onClick={onFinish} autoFocus>
          {t('onboarding.action')}
          <ArrowRight size={17} />
        </button>
      </section>
    </div>
  );
}
