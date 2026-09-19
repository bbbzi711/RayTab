import { ArrowRight, Compass, Layers3, Shield } from 'lucide-react';
import type { Language } from '@/locales';

const content = {
  'zh-CN': {
    eyebrow: '欢迎使用 RayTab',
    title: '从常用网站开始，整理你的浏览入口',
    description: '先把每天会打开的网站放进来。布局、外观和同步方式都可以稍后在设置中调整。',
    action: '进入首页',
    items: [
      { icon: Compass, title: '快速抵达', text: '集中管理网站、分类和桌面，搜索也随手可用。' },
      { icon: Layers3, title: '按你的方式整理', text: '用桌面和分类梳理内容，拖动网站完成排序。' },
      {
        icon: Shield,
        title: '数据由你掌控',
        text: '数据默认保存在本机，私密空间和同步均按需启用。',
      },
    ],
  },
  en: {
    eyebrow: 'Welcome to RayTab',
    title: 'Build your starting point around the sites you use',
    description:
      'Add the places you visit every day. Layout, appearance, and sync can all be adjusted later in Settings.',
    action: 'Open my home',
    items: [
      {
        icon: Compass,
        title: 'Get there quickly',
        text: 'Keep sites, groups, pages, and search within easy reach.',
      },
      {
        icon: Layers3,
        title: 'Arrange it your way',
        text: 'Organize with pages and categories, then drag sites into place.',
      },
      {
        icon: Shield,
        title: 'Keep control of your data',
        text: 'Data stays local by default. Private space and sync are optional.',
      },
    ],
  },
} as const;

export function Onboarding({ language, onFinish }: { language: Language; onFinish: () => void }) {
  const copy = content[language];

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
          <p>{copy.eyebrow}</p>
          <h1 id="onboarding-title">{copy.title}</h1>
          <span id="onboarding-description">{copy.description}</span>
        </header>
        <div className="onboarding-guide">
          {copy.items.map(({ icon: Icon, title, text }) => (
            <article key={title}>
              <span className="onboarding-guide-icon">
                <Icon size={18} strokeWidth={1.8} />
              </span>
              <div>
                <h2>{title}</h2>
                <p>{text}</p>
              </div>
            </article>
          ))}
        </div>
        <button type="button" className="onboarding-start" onClick={onFinish} autoFocus>
          {copy.action}
          <ArrowRight size={17} />
        </button>
      </section>
    </div>
  );
}
