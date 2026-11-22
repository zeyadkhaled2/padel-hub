/* eslint-disable @next/next/no-img-element -- Protected photos must not enter the shared optimizer. */
'use client';

import { useEffect, useRef, useState, type KeyboardEvent, type TouchEvent } from 'react';
import { useTranslations } from 'next-intl';
import { ChevronLeft, ChevronRight, ImageOff, RefreshCw } from 'lucide-react';

interface ProductGalleryProps {
  listingId: string;
  title: string;
  mediaIds: string[];
}

export function ProductGallery({ listingId, title, mediaIds }: ProductGalleryProps) {
  const t = useTranslations('buyer');
  const [activeIndex, setActiveIndex] = useState(0);
  const [failed, setFailed] = useState<Record<string, boolean>>({});
  const [retries, setRetries] = useState<Record<string, number>>({});
  const thumbRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const touchStartX = useRef<number | null>(null);

  const total = mediaIds.length;
  const safeIndex = total > 0 ? Math.min(activeIndex, total - 1) : 0;
  const activeMediaId = mediaIds[safeIndex];
  const retryToken = activeMediaId ? (retries[activeMediaId] ?? 0) : 0;
  const activeKey = activeMediaId ? `${activeMediaId}:${retryToken}` : '';
  const activeSrc = activeMediaId
    ? `/api/media/${activeMediaId}?listing=${listingId}&variant=full`
    : '';

  useEffect(() => {
    const activeThumb = thumbRefs.current[safeIndex];
    if (!activeThumb) return;
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    activeThumb.scrollIntoView({
      behavior: reducedMotion ? 'auto' : 'smooth',
      block: 'nearest',
      inline: 'nearest',
    });
  }, [safeIndex]);

  if (total === 0) {
    return (
      <section aria-label={t('gallery')} className="product-gallery">
        <div className="gallery-stage gallery-fallback">
          <ImageOff size={28} aria-hidden />
          <p>{t('noPhotos')}</p>
        </div>
      </section>
    );
  }

  const goPrevious = () => setActiveIndex((current) => (current - 1 + total) % total);
  const goNext = () => setActiveIndex((current) => (current + 1) % total);

  function handleKeyDown(event: KeyboardEvent<HTMLElement>) {
    if (total <= 1) return;
    const isRtl =
      typeof document !== 'undefined' && document.documentElement.dir === 'rtl';

    if (event.key === 'ArrowRight') {
      event.preventDefault();
      if (isRtl) goPrevious();
      else goNext();
    } else if (event.key === 'ArrowLeft') {
      event.preventDefault();
      if (isRtl) goNext();
      else goPrevious();
    } else if (event.key === 'Home') {
      event.preventDefault();
      setActiveIndex(0);
    } else if (event.key === 'End') {
      event.preventDefault();
      setActiveIndex(total - 1);
    }
  }

  function handleTouchStart(event: TouchEvent<HTMLDivElement>) {
    if (total <= 1 || event.touches.length !== 1) return;
    touchStartX.current = event.touches[0].clientX;
  }

  function handleTouchEnd(event: TouchEvent<HTMLDivElement>) {
    if (total <= 1 || touchStartX.current === null || event.changedTouches.length === 0) {
      return;
    }
    const deltaX = event.changedTouches[0].clientX - touchStartX.current;
    touchStartX.current = null;
    if (Math.abs(deltaX) < 42) return;

    const isRtl =
      typeof document !== 'undefined' && document.documentElement.dir === 'rtl';
    if (deltaX < 0) {
      if (isRtl) goPrevious();
      else goNext();
    } else {
      if (isRtl) goNext();
      else goPrevious();
    }
  }

  function retryActivePhoto() {
    if (!activeMediaId) return;
    setFailed((prev) => ({ ...prev, [activeKey]: false }));
    setRetries((prev) => ({ ...prev, [activeMediaId]: (prev[activeMediaId] ?? 0) + 1 }));
  }

  const isFailed = Boolean(failed[activeKey]);

  return (
    <section
      aria-label={t('gallery')}
      aria-roledescription={total > 1 ? 'carousel' : undefined}
      className="product-gallery"
      onKeyDown={handleKeyDown}
    >
      <div
        className="gallery-stage"
        onTouchStart={handleTouchStart}
        onTouchEnd={handleTouchEnd}
      >
        {isFailed ? (
          <div className="gallery-fallback" role="status">
            <ImageOff size={28} aria-hidden />
            <p>{t('photoError')}</p>
            <button type="button" className="button secondary gallery-retry" onClick={retryActivePhoto}>
              <RefreshCw size={15} aria-hidden />
              <span>{t('photoRetry')}</span>
            </button>
          </div>
        ) : (
          <img
            key={activeKey}
            src={activeSrc}
            alt={t('photo', { title, number: safeIndex + 1 })}
            width={800}
            height={600}
            loading="eager"
            decoding="async"
            className="gallery-main-image"
            onError={() => setFailed((prev) => ({ ...prev, [activeKey]: true }))}
          />
        )}

        {total > 1 && (
          <>
            <button
              type="button"
              className="gallery-nav-btn is-prev"
              onClick={goPrevious}
              aria-label={t('prevPhoto')}
            >
              <ChevronLeft size={20} className="icon-directional" aria-hidden />
            </button>
            <button
              type="button"
              className="gallery-nav-btn is-next"
              onClick={goNext}
              aria-label={t('nextPhoto')}
            >
              <ChevronRight size={20} className="icon-directional" aria-hidden />
            </button>
            <span className="gallery-counter" dir="ltr" aria-live="polite">
              {t('photoCount', { current: safeIndex + 1, total })}
            </span>
          </>
        )}
      </div>

      {total > 1 && (
        <div className="gallery-thumbs" role="group" aria-label={t('gallery')}>
          {mediaIds.map((mediaId, index) => {
            const isSelected = index === safeIndex;
            return (
              <button
                key={mediaId}
                ref={(node) => {
                  thumbRefs.current[index] = node;
                }}
                type="button"
                className={`gallery-thumb${isSelected ? ' is-active' : ''}`}
                onClick={() => setActiveIndex(index)}
                aria-pressed={isSelected}
                aria-current={isSelected ? 'true' : undefined}
                aria-label={t('selectPhoto', { number: index + 1, total })}
              >
                <img
                  src={`/api/media/${mediaId}?listing=${listingId}&variant=thumb`}
                  alt=""
                  width={160}
                  height={120}
                  loading={index < 4 ? 'eager' : 'lazy'}
                  decoding="async"
                />
              </button>
            );
          })}
        </div>
      )}
    </section>
  );
}
