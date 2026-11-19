'use client';

import Image from 'next/image';
import {
  useEffect,
  useRef,
  type CSSProperties,
  type PointerEvent,
} from 'react';

interface HeroStageProps {
  alt: string;
  caption: string;
}

type DepthStyle = CSSProperties & {
  '--depth-x': string;
  '--depth-y': string;
};

const depth = (x: number, y: number): DepthStyle => ({
  '--depth-x': `${x}px`,
  '--depth-y': `${y}px`,
});

export function HeroStage({ alt, caption }: HeroStageProps) {
  const stageRef = useRef<HTMLElement>(null);
  const rafRef = useRef<number | null>(null);

  useEffect(() => {
    return () => {
      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current);
      }
    };
  }, []);

  const handlePointerMove = (event: PointerEvent<HTMLElement>) => {
    if (event.pointerType !== 'mouse') return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

    const node = stageRef.current;
    if (!node) return;

    const rect = node.getBoundingClientRect();
    const nx = ((event.clientX - rect.left) / rect.width - 0.5) * 2;
    const ny = ((event.clientY - rect.top) / rect.height - 0.5) * 2;

    if (rafRef.current !== null) {
      cancelAnimationFrame(rafRef.current);
    }

    rafRef.current = requestAnimationFrame(() => {
      node.dataset.active = 'true';
      node.style.setProperty('--px', nx.toFixed(3));
      node.style.setProperty('--py', ny.toFixed(3));
      rafRef.current = null;
    });
  };

  const handlePointerLeave = () => {
    if (rafRef.current !== null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }

    const node = stageRef.current;
    if (!node) return;

    delete node.dataset.active;
    node.style.setProperty('--px', '0');
    node.style.setProperty('--py', '0');
  };

  return (
    <figure
      ref={stageRef}
      onPointerMove={handlePointerMove}
      onPointerLeave={handlePointerLeave}
      className="hero-stage relative m-0 h-[132px] md:h-auto md:min-h-[192px] lg:min-h-[204px] min-w-0 overflow-hidden select-none"
    >
      {/* Layer 1: Distant upper ball (far depth) */}
      <div
        aria-hidden="true"
        style={depth(-6, -4)}
        className="hero-layer pointer-events-none absolute top-[10%] start-[10%] z-10 md:top-[11%] md:start-[7%]"
      >
        <div className="hero-float-far">
          <Image
            src="/images/hero/padel-ball-1.webp"
            alt=""
            width={280}
            height={280}
            sizes="(max-width: 767px) 28px, 44px"
            draggable={false}
            className="h-auto w-[26px] md:w-[36px] lg:w-[42px] opacity-85 blur-[0.45px] drop-shadow-[0_6px_10px_rgba(22,30,46,0.18)] dark:drop-shadow-[0_8px_12px_rgba(0,0,0,0.5)]"
          />
        </div>
      </div>

      {/* Layer 2: Floating 3D Padel Racket (focal hero LCP image) */}
      <div
        style={depth(12, 9)}
        className="hero-layer pointer-events-none absolute inset-0 z-20 flex items-center justify-center"
      >
        <div className="translate-x-5 -translate-y-2.5 rtl:-translate-x-5 md:-translate-x-2.5 md:-translate-y-1 md:rtl:translate-x-2.5">
          <div className="hero-float-racket">
            <Image
              src="/images/hero/padel-racket.webp"
              alt={alt}
              width={413}
              height={740}
              preload={true}
              sizes="(max-width: 767px) 105px, (max-width: 1024px) 148px, 164px"
              draggable={false}
              className="h-[104px] md:h-[172px] lg:h-[186px] w-auto object-contain rtl:-scale-x-100 drop-shadow-[0_14px_20px_rgba(22,30,46,0.22)] dark:drop-shadow-[0_20px_26px_rgba(0,0,0,0.68)]"
            />
          </div>
        </div>
      </div>

      {/* Layer 3: Mid-air ball off the sweet spot */}
      <div
        aria-hidden="true"
        style={depth(21, 15)}
        className="hero-layer pointer-events-none absolute top-[9%] end-[14%] z-30 md:top-[10%] md:end-[13%]"
      >
        <div className="hero-float-mid">
          <Image
            src="/images/hero/padel-ball-1.webp"
            alt=""
            width={280}
            height={280}
            sizes="(max-width: 767px) 34px, 52px"
            draggable={false}
            className="h-auto w-[32px] md:w-[44px] lg:w-[50px] drop-shadow-[0_10px_14px_rgba(22,30,46,0.2)] dark:drop-shadow-[0_14px_18px_rgba(0,0,0,0.55)]"
          />
        </div>
      </div>

      {/* Layer 4: Foreground close-to-camera ball (strongest depth & parallax) */}
      <div
        aria-hidden="true"
        style={depth(34, 24)}
        className="hero-layer pointer-events-none absolute bottom-1 end-[5%] z-40 md:-bottom-[4px] md:end-[5%] lg:-bottom-[6px] lg:end-[6%]"
      >
        <div className="hero-float-near">
          <Image
            src="/images/hero/padel-ball-2.webp"
            alt=""
            width={320}
            height={320}
            sizes="(max-width: 767px) 54px, 84px"
            draggable={false}
            className="h-auto w-[50px] md:w-[70px] lg:w-[80px] md:blur-[0.5px] drop-shadow-[0_14px_18px_rgba(22,30,46,0.24)] dark:drop-shadow-[0_20px_26px_rgba(0,0,0,0.7)]"
          />
        </div>
      </div>

      <figcaption className="absolute bottom-2 start-3 md:bottom-3 md:start-2 z-50 m-0 w-fit max-w-[calc(100%-82px)] md:max-w-[calc(100%-96px)] rounded-[8px] border border-line/80 bg-surface/90 px-2.5 py-1 text-[10.5px] md:text-[11.5px] font-semibold leading-snug text-ink backdrop-blur-sm">
        {caption}
      </figcaption>
    </figure>
  );
}
