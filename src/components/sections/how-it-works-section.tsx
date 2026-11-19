import { getTranslations } from 'next-intl/server';
import { Card } from '@/components/ui/card';
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
          <Card key={stepKey} className="relative p-6 sm:p-7">
            <span className="grid h-10 w-10 place-items-center rounded-[10px] bg-accent font-display text-[16px] font-extrabold tabular-nums text-accent-foreground">
              {index + 1}
            </span>
            <h3 className="mt-5 font-display text-[18.5px] sm:text-[19.5px] font-bold text-foreground">
              {tMarket(stepKey)}
            </h3>
            <p className="mt-2 text-[14.5px] sm:text-[15px] leading-[1.62] text-muted-foreground">
              {tMarket(`${stepKey}Body`)}
            </p>
          </Card>
        ))}
      </div>
    </section>
  );
}
