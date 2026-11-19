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
      className={
        showHeader
          ? 'my-10 border-t border-border pt-10 md:my-14 md:pt-14'
          : 'my-8'
      }
      aria-labelledby={showHeader ? 'workflow-heading' : undefined}
    >
      {showHeader ? (
        <SectionHeader
          id="workflow-heading"
          title={tWorkflow('title')}
          subtitle={tWorkflow('subtitle')}
        />
      ) : null}

      <div className="grid grid-cols-1 gap-6 md:grid-cols-3 md:gap-8">
        {steps.map((stepKey, index) => (
          <div
            key={stepKey}
            className="border-t-2 border-border pt-5 transition-colors hover:border-brand"
          >
            <span className="inline-flex items-center font-display text-[13px] font-extrabold tabular-nums text-brand">
              0{index + 1}
            </span>
            <h3 className="mt-2 font-display text-[17.5px] sm:text-[18.5px] font-bold text-foreground">
              {tMarket(stepKey)}
            </h3>
            <p className="mt-1.5 text-[14px] sm:text-[14.5px] leading-[1.6] text-muted-foreground">
              {tMarket(`${stepKey}Body`)}
            </p>
          </div>
        ))}
      </div>
    </section>
  );
}
