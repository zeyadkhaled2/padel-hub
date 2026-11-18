import { getTranslations } from 'next-intl/server';
import { Plus } from 'lucide-react';

export async function FaqSection() {
  const t = await getTranslations('marketing.faq');

  const questions = [
    { id: 'q1', question: t('q1'), answer: t('a1') },
    { id: 'q2', question: t('q2'), answer: t('a2') },
    { id: 'q3', question: t('q3'), answer: t('a3') },
    { id: 'q4', question: t('q4'), answer: t('a4') },
  ] as const;

  return (
    <section className="my-12 md:my-20" aria-labelledby="faq-heading">
      <div className="grid grid-cols-1 items-start gap-7 lg:grid-cols-[minmax(0,0.82fr)_minmax(0,1.28fr)] lg:gap-12">
        <div className="lg:sticky lg:top-24">
          <h2
            id="faq-heading"
            className="font-display text-[clamp(1.55rem,2.8vw,2.15rem)] font-extrabold leading-[1.14] tracking-[-0.025em] text-ink"
          >
            {t('title')}
          </h2>
        </div>

        <div className="divide-y divide-line rounded-[18px] bg-surface px-5 sm:px-7 shadow-[var(--shadow-card)] dark:ring-1 dark:ring-white/[0.08]">
          {questions.map((item, index) => (
            <details key={item.id} className="group py-1" open={index === 0}>
              <summary className="flex min-h-[56px] list-none items-center justify-between gap-4 py-3 font-display text-[16px] sm:text-[17px] font-bold text-ink transition-colors hover:text-accent [&::-webkit-details-marker]:hidden">
                <span>{item.question}</span>
                <span
                  className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-surface-soft text-accent transition-transform duration-200 group-open:rotate-45 group-open:bg-accent group-open:text-accent-ink"
                  aria-hidden="true"
                >
                  <Plus size={15} />
                </span>
              </summary>
              <p className="pb-5 pe-8 text-[14.5px] sm:text-[15px] leading-[1.65] text-muted">
                {item.answer}
              </p>
            </details>
          ))}
        </div>
      </div>
    </section>
  );
}
