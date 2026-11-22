'use client';

import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { MessageCircle } from 'lucide-react';

interface MobileContactBarProps {
  listingId: string;
  locale: string;
  priceLabel: string;
  sublabel?: string;
  targetId: string;
}

export function MobileContactBar({
  listingId,
  locale,
  priceLabel,
  sublabel,
  targetId,
}: MobileContactBarProps) {
  const t = useTranslations('buyer');
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const target = document.getElementById(targetId);
    if (!target || typeof IntersectionObserver === 'undefined') return;

    const observer = new IntersectionObserver(
      (entries) => {
        const entry = entries[0];
        if (!entry) return;
        setVisible(!entry.isIntersecting && entry.boundingClientRect.top < 0);
      },
      { threshold: 0 },
    );

    observer.observe(target);
    return () => observer.disconnect();
  }, [targetId]);

  if (!visible) return null;

  return (
    <aside className="mobile-contact-bar" aria-label={t('quickContactBar')}>
      <div className="container mobile-contact-bar-inner">
        <div className="mobile-contact-price">
          <strong>{priceLabel}</strong>
          {sublabel && <span>{sublabel}</span>}
        </div>
        <a
          className="button primary mobile-contact-cta"
          href={`/api/contact/${listingId}?locale=${locale}`}
          rel="nofollow"
        >
          <MessageCircle size={17} aria-hidden />
          <span>{t('whatsapp')}</span>
        </a>
      </div>
    </aside>
  );
}
