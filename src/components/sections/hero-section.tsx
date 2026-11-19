import { getTranslations } from 'next-intl/server';
import { CheckCircle2, MapPin } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { HeroStage } from './hero-stage';

export async function HeroSection() {
  const t = await getTranslations('market');

  return (
    <section className="hero-blend relative w-full overflow-x-clip pt-3 pb-10 md:pt-5 md:pb-12 text-foreground">
      {/* Whisper-light architectural court lines that fade smoothly into the page canvas below */}
      <svg
        aria-hidden="true"
        viewBox="0 0 1440 360"
        preserveAspectRatio="none"
        className="pointer-events-none absolute inset-0 h-full w-full text-brand/[0.08] dark:text-brand/[0.11] [mask-image:linear-gradient(to_bottom,black_38%,transparent_96%)] rtl:-scale-x-100"
      >
        <line
          x1="0"
          y1="268"
          x2="1440"
          y2="188"
          stroke="currentColor"
          strokeWidth="1"
        />
        <line
          x1="820"
          y1="0"
          x2="968"
          y2="360"
          stroke="currentColor"
          strokeWidth="1"
        />
        <line
          x1="1160"
          y1="0"
          x2="1264"
          y2="360"
          stroke="currentColor"
          strokeWidth="1"
          strokeDasharray="5 7"
        />
      </svg>

      <div className="container relative z-10 grid grid-cols-1 md:grid-cols-[minmax(0,1.28fr)_minmax(0,0.72fr)] items-center gap-2 md:gap-6">
        <div className="min-w-0 py-1 md:py-3">
          <h1 className="max-w-[540px] font-display text-[clamp(1.75rem,6.6vw,2.25rem)] md:text-[clamp(2.2rem,3.1vw,2.9rem)] font-extrabold leading-[1.04] tracking-[-0.035em] text-foreground rtl:leading-[1.28] rtl:tracking-normal">
            {t('title')}
          </h1>

          <p className="mt-2.5 max-w-[460px] text-[14px] md:text-[15.5px] leading-[1.6] text-muted-foreground">
            {t('intro')}
          </p>

          <ul
            className="mt-4 hidden md:flex list-none flex-wrap items-center gap-x-3.5 gap-y-2 p-0"
            aria-label={t('badge')}
          >
            <li>
              <Badge
                variant="goldSoft"
                className="rounded-full px-2.5 py-1 text-[11.5px] font-semibold"
              >
                <MapPin size={12} className="text-brand" aria-hidden="true" />
                <span>{t('badge')}</span>
              </Badge>
            </li>
            <li className="inline-flex items-center gap-1.5 text-[12px] font-medium text-muted-foreground">
              <CheckCircle2
                size={13}
                className="shrink-0 text-brand"
                aria-hidden="true"
              />
              <span>{t('heroHighlight1')}</span>
            </li>
            <li className="inline-flex items-center gap-1.5 text-[12px] font-medium text-muted-foreground">
              <CheckCircle2
                size={13}
                className="shrink-0 text-brand"
                aria-hidden="true"
              />
              <span>{t('heroHighlight2')}</span>
            </li>
            <li className="inline-flex items-center gap-1.5 text-[12px] font-medium text-muted-foreground">
              <CheckCircle2
                size={13}
                className="shrink-0 text-brand"
                aria-hidden="true"
              />
              <span>{t('heroHighlight3')}</span>
            </li>
          </ul>
        </div>

        <HeroStage alt={t('illustration')} caption={t('courtCaption')} />
      </div>
    </section>
  );
}
