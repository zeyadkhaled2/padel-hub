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
      className="workflow-section"
      aria-labelledby={showHeader ? 'workflow-heading' : undefined}
    >
      {showHeader ? (
        <SectionHeader
          id="workflow-heading"
          eyebrow={tWorkflow('eyebrow')}
          title={tWorkflow('title')}
          subtitle={tWorkflow('subtitle')}
        />
      ) : null}

      <div className="steps">
        {steps.map((stepKey, index) => (
          <article key={stepKey} className="step-card">
            <span className="step-number">{index + 1}</span>
            <h3>{tMarket(stepKey)}</h3>
            <p>{tMarket(`${stepKey}Body`)}</p>
          </article>
        ))}
      </div>
    </section>
  );
}
