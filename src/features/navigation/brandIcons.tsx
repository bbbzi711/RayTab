import { useId, type ReactNode } from 'react';
import {
  siBaidu,
  siBilibili,
  siDuckduckgo,
  siDeepseek,
  siZhihu,
  siGithub,
  siSinaweibo,
  siYoutube,
  siNotion,
  siReddit,
  siStackoverflow,
  siWikipedia,
  siX,
  siTaobao,
  siJuejin,
  siTiktok,
  siXiaohongshu,
  type SimpleIcon,
} from 'simple-icons';
import { IconFrame } from '@/components/ui/icon-frame';
import { normalizeUrl } from '@/storage/model';
import geminiIcon from './assets/gemini.svg';
import { findCatalogIcon } from './brand-catalog';

const brands: Array<{
  domains: string[];
  icon: SimpleIcon;
  background: string;
  foreground: string;
  monochrome?: boolean;
}> = [
  {
    domains: ['notion.so', 'notion.com'],
    icon: siNotion,
    background: '#ffffff',
    foreground: '#191919',
    monochrome: true,
  },
  { domains: ['reddit.com'], icon: siReddit, background: '#ff4500', foreground: '#ffffff' },
  {
    domains: ['stackoverflow.com'],
    icon: siStackoverflow,
    background: '#f48024',
    foreground: '#ffffff',
  },
  {
    domains: ['wikipedia.org'],
    icon: siWikipedia,
    background: '#ffffff',
    foreground: '#191919',
    monochrome: true,
  },
  {
    domains: ['x.com', 'twitter.com'],
    icon: siX,
    background: '#14171a',
    foreground: '#ffffff',
    monochrome: true,
  },
  { domains: ['taobao.com'], icon: siTaobao, background: '#ff5000', foreground: '#ffffff' },
  { domains: ['juejin.cn'], icon: siJuejin, background: '#1e80ff', foreground: '#ffffff' },
  {
    domains: ['tiktok.com', 'douyin.com'],
    icon: siTiktok,
    background: '#161823',
    foreground: '#ffffff',
  },
  {
    domains: ['xiaohongshu.com'],
    icon: siXiaohongshu,
    background: '#ff2442',
    foreground: '#ffffff',
  },
  {
    domains: ['github.com'],
    icon: siGithub,
    background: '#ffffff',
    foreground: '#24292f',
    monochrome: true,
  },
  {
    domains: ['youtube.com', 'youtu.be'],
    icon: siYoutube,
    background: '#ffffff',
    foreground: '#ff0033',
  },
  {
    domains: ['bilibili.com', 'b23.tv'],
    icon: siBilibili,
    background: '#ffffff',
    foreground: '#fb7299',
  },
  { domains: ['weibo.com'], icon: siSinaweibo, background: '#e6162d', foreground: '#ffffff' },
  { domains: ['baidu.com'], icon: siBaidu, background: '#2932e1', foreground: '#ffffff' },
  { domains: ['duckduckgo.com'], icon: siDuckduckgo, background: '#de5833', foreground: '#ffffff' },
  { domains: ['zhihu.com'], icon: siZhihu, background: '#1772f6', foreground: '#ffffff' },
  { domains: ['deepseek.com'], icon: siDeepseek, background: '#ffffff', foreground: '#4d6bfe' },
];

function siteHost(url: string) {
  try {
    return new URL(normalizeUrl(url)).hostname.toLowerCase();
  } catch {
    return '';
  }
}
function isDomain(host: string, domain: string) {
  return host === domain || host.endsWith(`.${domain}`);
}

function SimpleBrandIcon({
  icon,
  className,
  color,
}: {
  icon: SimpleIcon;
  className: string;
  color?: string;
}) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill={color ?? `#${icon.hex}`}
      aria-hidden="true"
    >
      <path d={icon.path} />
    </svg>
  );
}

function GoogleIcon({ className }: { className: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" aria-hidden="true">
      <path
        fill="#4285F4"
        d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
      />
      <path
        fill="#34A853"
        d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
      />
      <path
        fill="#FBBC05"
        d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"
      />
      <path
        fill="#EA4335"
        d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"
      />
    </svg>
  );
}

function BingIcon({ className }: { className: string }) {
  // Microsoft Bing Fluent mark. Preserve the official paths, colors, and vertical proportions.
  const gradientId = useId().replaceAll(':', '');
  const stemGradient = `${gradientId}-bing-stem`;
  const baseGradient = `${gradientId}-bing-base`;
  const loopGradient = `${gradientId}-bing-loop`;

  return (
    <svg className={className} viewBox="0 0 678 1024" fill="none" aria-hidden="true">
      <path
        fill={`url(#${stemGradient})`}
        d="M0 778.3c14.6 123.8 223.8 143 236.8 79.9-.3-.4-.5-678.1-.5-678.1-3.6-46-26.2-72-61.6-96.5-33-22.7-74.4-50.4-96.9-66.4C14.2-28 .1 31.4 0 33.2c0 0 .3 746.4 0 745.1z"
      />
      <path
        fill={`url(#${baseGradient})`}
        d="M236.8 832.8c-96.2 72.5-217 42.7-234.4-44-.8-4.2-2.4-10.4-2.4-10.4s.9 8.5 2 16.6c1.2 8.5 3.7 20.8 6.3 31.3 30 117.8 132.1 186 230.4 196.6C373.3 1034.8 497.4 931 599 855.8c6.3-6.2 15.4-16.2 18.1-20.1 66.2-95-13.6-197-72.5-193a59154 59154 0 0 0-307.7 190.1Z"
      />
      <path
        fill={`url(#${loopGradient})`}
        fillRule="evenodd"
        d="M312.8 381c7.4 47 34.6 108.7 59.6 172.6 20.2 41.3 62 53.4 103 65.5 42.4 12.6 65.6 21 85.6 30.9 138.5 68.7 38.5 207.7 59.6 181.4 89-110.7 79.7-325.4-90-418.1-57.6-28.7-115.4-66.6-156.5-83.6-41-17-68.7 4.3-61.3 51.3z"
        clipRule="evenodd"
      />
      <defs>
        <radialGradient
          id={loopGradient}
          cx="0"
          cy="0"
          r="1"
          gradientTransform="matrix(-347 -399.3 287.3 -249.8 655 722)"
          gradientUnits="userSpaceOnUse"
        >
          <stop stopColor="#00CACC" />
          <stop offset="1" stopColor="#048FCE" />
        </radialGradient>
        <radialGradient
          id={baseGradient}
          cx="0"
          cy="0"
          r="1"
          gradientTransform="matrix(526 -225.4 375.6 876.6 88.8 915.1)"
          gradientUnits="userSpaceOnUse"
        >
          <stop stopColor="#00BBEC" />
          <stop offset="1" stopColor="#2756A9" />
        </radialGradient>
        <linearGradient
          id={stemGradient}
          x1="118.4"
          x2="118.4"
          y1="0"
          y2="884.4"
          gradientUnits="userSpaceOnUse"
        >
          <stop stopColor="#00BBEC" />
          <stop offset="1" stopColor="#2756A9" />
        </linearGradient>
      </defs>
    </svg>
  );
}

export function getSearchEngineIcon(id: string, name: string): ReactNode {
  const key = id.toLowerCase();
  if (key === 'google')
    return (
      <IconFrame size="search">
        <GoogleIcon className="brand-icon-glyph" />
      </IconFrame>
    );
  if (key === 'bing')
    return (
      <IconFrame size="search">
        <BingIcon className="brand-icon-glyph brand-icon-glyph--bing" />
      </IconFrame>
    );
  const icon = key === 'baidu' ? siBaidu : key === 'duckduckgo' ? siDuckduckgo : undefined;
  return (
    <IconFrame size="search">
      {icon ? (
        <SimpleBrandIcon icon={icon} className="brand-icon-glyph" />
      ) : (
        <span className="search-engine-fallback">{name.slice(0, 1).toUpperCase()}</span>
      )}
    </IconFrame>
  );
}

type BrandAppearance = {
  background: string;
  foreground: string;
  graphic: ReactNode;
  contrastColor?: string;
  darkGraphic?: ReactNode;
  tile?: boolean;
};

export function getBrandAppearance(url: string): BrandAppearance | null {
  const host = siteHost(url);
  if (!host) return null;
  const catalog = findCatalogIcon(normalizeUrl(url));
  if (catalog?.tile)
    return {
      background: '#ffffff',
      foreground: '#202124',
      tile: true,
      graphic: (
        <img
          src={catalog.light}
          className={
            catalog.cover ? 'brand-icon-glyph brand-icon-glyph--cover' : 'brand-icon-glyph'
          }
          alt=""
          draggable={false}
        />
      ),
    };
  if (host === 'gemini.google.com')
    return {
      background: '#ffffff',
      foreground: '#4285f4',
      graphic: <img src={geminiIcon} className="brand-icon-glyph" alt="" draggable={false} />,
    };
  if (
    ['google.com', 'google.com.hk', 'google.co.uk'].some(
      (domain) => host === domain || host === `www.${domain}`,
    )
  )
    return {
      background: '#ffffff',
      foreground: '#4285f4',
      graphic: <GoogleIcon className="brand-icon-glyph" />,
    };
  if (isDomain(host, 'bing.com'))
    return {
      background: '#e4f5fa',
      foreground: '#048fce',
      graphic: <BingIcon className="brand-icon-glyph brand-icon-glyph--bing" />,
    };
  const brand = brands.find(({ domains }) =>
    domains.some((domain) =>
      domain === 'baidu.com' ? host === domain || host === `www.${domain}` : isDomain(host, domain),
    ),
  );
  if (
    catalog &&
    (!brand ||
      catalog.pathname !== '/' ||
      brand.icon === siTiktok ||
      !brand.domains.some((domain) => host === domain || host === `www.${domain}`))
  )
    return {
      background: brand?.background ?? '#ffffff',
      foreground: brand?.foreground ?? '#202124',
      graphic: <img src={catalog.light} className="brand-icon-glyph" alt="" draggable={false} />,
      darkGraphic: <img src={catalog.dark} className="brand-icon-glyph" alt="" draggable={false} />,
    };
  return brand
    ? {
        background: brand.background,
        foreground: brand.foreground,
        contrastColor:
          !brand.monochrome && brand.foreground === '#ffffff'
            ? `#${brand.icon.hex.toLowerCase()}`
            : undefined,
        graphic: (
          <SimpleBrandIcon
            icon={brand.icon}
            className="brand-icon-glyph"
            color={
              brand.monochrome || brand.foreground === '#ffffff' ? 'currentColor' : brand.foreground
            }
          />
        ),
      }
    : null;
}
