import { getTranslations } from 'next-intl/server';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion';
import { Card } from '@/components/ui/card';

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
            className="font-display text-[clamp(1.5rem,2.8vw,2.15rem)] font-extrabold leading-[1.14] tracking-[-0.025em] text-foreground"
          >
            {t('title')}
          </h2>
        </div>

        <Card className="px-5 sm:px-7">
          <Accordion type="single" collapsible defaultValue="q1">
            {questions.map((item) => (
              <AccordionItem key={item.id} value={item.id}>
                <AccordionTrigger>{item.question}</AccordionTrigger>
                <AccordionContent>{item.answer}</AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
        </Card>
      </div>
    </section>
  );
}
