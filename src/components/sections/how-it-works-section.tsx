import { getTranslations } from 'next-intl/server';
import { SectionHeader } from '@/components/ui/section-header';

interface HowItWorksSectionProps {
  showHeader?: boolean;
}

export async function HowItWorksSection({
  showHeader = true,
}: HowItWorksSectionProps) {
  const tMarket = await getTranslations('market');
  const tWorkflow = await getTranslations('marketing.workflow');

  const steps = ['step1', 'step2', 'step3'] as const;

  return (
    <section
      className="my-12 md:my-20"
      aria-labelledby={showHeader ? 'workflow-heading' : undefined}
    >
      {showHeader ? (
        <SectionHeader
          id="workflow-heading"
          title={tWorkflow('title')}
          subtitle={tWorkflow('subtitle')}
        />
      ) : null}

      <div className="grid grid-cols-1 gap-4 md:grid-cols-3 md:gap-5">
        {steps.map((stepKey, index) => (
          <article
            key={stepKey}
            className="relative flex flex-col rounded-[18px] bg-surface p-6 sm:p-7 shadow-[var(--shadow-card)] dark:ring-1 dark:ring-white/[0.08]"
          >
            <span className="grid h-11 w-11 place-items-center rounded-[12px] bg-hero font-display text-[17px] font-extrabold tabular-nums text-hero-ink">
              {index + 1}
            </span>
            <h3 className="mt-5 font-display text-[19px] sm:text-[20px] font-bold text-ink">
              {tMarket(stepKey)}
            </h3>
            <p className="mt-2 text-[14.5px] sm:text-[15px] leading-[1.6] text-muted">
              {tMarket(`${stepKey}Body`)}
            </p>
          </article>
        ))}
      </div>
    </section>
  );
}
