import { getTranslations } from 'next-intl/server';
import { SectionHeader } from '@/components/ui/section-header';

export async function FaqSection() {
  const t = await getTranslations('marketing.faq');

  const questions = [
    { id: 'q1', question: t('q1'), answer: t('a1') },
    { id: 'q2', question: t('q2'), answer: t('a2') },
    { id: 'q3', question: t('q3'), answer: t('a3') },
    { id: 'q4', question: t('q4'), answer: t('a4') },
  ] as const;

  return (
    <section className="faq-section" aria-labelledby="faq-heading">
      <SectionHeader id="faq-heading" title={t('title')} />

      <div className="faq-list">
        {questions.map((item, index) => (
          <details key={item.id} className="faq-item" open={index === 0}>
            <summary>{item.question}</summary>
            <p>{item.answer}</p>
          </details>
        ))}
      </div>
    </section>
  );
}
