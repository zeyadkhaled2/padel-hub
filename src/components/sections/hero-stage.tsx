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
      className="hero-stage relative m-0 h-[142px] md:h-auto md:min-h-[208px] lg:min-h-[224px] min-w-0 overflow-visible select-none"
    >
      {/* Ambient volumetric halo shifting gently in reverse depth */}
      <div
        aria-hidden="true"
        style={depth(-10, -8)}
        className="hero-layer hero-aura pointer-events-none absolute -inset-4 z-0 rounded-full blur-2xl"
      />

      {/* Breathing 3D studio floor shadow beneath the levitating racket */}
      <div
        aria-hidden="true"
        className="hero-floor-shadow pointer-events-none absolute bottom-1 start-1/2 z-10 h-5 w-[108px] md:bottom-0 md:h-7 md:w-[156px] -translate-x-1/2 rtl:translate-x-1/2 rounded-full blur-md"
      />

      {/* Layer 1: Distant upper ball (far depth) */}
      <div
        aria-hidden="true"
        style={depth(-8, -5)}
        className="hero-layer pointer-events-none absolute top-[8%] start-[8%] z-10 md:top-[9%] md:start-[6%]"
      >
        <div className="hero-float-far">
          <Image
            src="/images/hero/padel-ball-1.webp"
            alt=""
            width={280}
            height={280}
            sizes="(max-width: 767px) 28px, 44px"
            draggable={false}
            className="h-auto w-[28px] md:w-[38px] lg:w-[44px] opacity-85 blur-[0.45px] drop-shadow-[0_10px_14px_rgba(16,19,23,0.18)] dark:drop-shadow-[0_12px_18px_rgba(0,0,0,0.62)]"
          />
        </div>
      </div>

      {/* Layer 2: Floating 3D Padel Racket (focal hero LCP image) */}
      <div
        style={depth(14, 10)}
        className="hero-layer pointer-events-none absolute inset-0 z-20 flex items-center justify-center"
      >
        <div className="translate-x-5 -translate-y-3 rtl:-translate-x-5 md:-translate-x-2 md:-translate-y-2 md:rtl:translate-x-2">
          <div className="hero-float-racket">
            <Image
              src="/images/hero/padel-racket.webp"
              alt={alt}
              width={413}
              height={740}
              preload={true}
              sizes="(max-width: 767px) 110px, (max-width: 1024px) 164px, 184px"
              draggable={false}
              className="h-[112px] md:h-[186px] lg:h-[204px] w-auto object-contain rtl:-scale-x-100 drop-shadow-[0_22px_28px_rgba(16,19,23,0.22)] dark:drop-shadow-[0_26px_34px_rgba(0,0,0,0.78)]"
            />
          </div>
        </div>
      </div>

      {/* Layer 3: Mid-air ball off the sweet spot */}
      <div
        aria-hidden="true"
        style={depth(24, 17)}
        className="hero-layer pointer-events-none absolute top-[6%] end-[12%] z-30 md:top-[7%] md:end-[10%]"
      >
        <div className="hero-float-mid">
          <Image
            src="/images/hero/padel-ball-1.webp"
            alt=""
            width={280}
            height={280}
            sizes="(max-width: 767px) 36px, 54px"
            draggable={false}
            className="h-auto w-[34px] md:w-[46px] lg:w-[54px] drop-shadow-[0_14px_18px_rgba(16,19,23,0.2)] dark:drop-shadow-[0_18px_24px_rgba(0,0,0,0.65)]"
          />
        </div>
      </div>

      {/* Layer 4: Foreground close-to-camera ball (strongest depth & parallax) */}
      <div
        aria-hidden="true"
        style={depth(38, 26)}
        className="hero-layer pointer-events-none absolute -bottom-1 end-[3%] z-40 md:-bottom-2 md:end-[2%] lg:-bottom-2.5 lg:end-[3%]"
      >
        <div className="hero-float-near">
          <Image
            src="/images/hero/padel-ball-2.webp"
            alt=""
            width={320}
            height={320}
            sizes="(max-width: 767px) 56px, 88px"
            draggable={false}
            className="h-auto w-[52px] md:w-[76px] lg:w-[86px] md:blur-[0.4px] drop-shadow-[0_18px_24px_rgba(16,19,23,0.26)] dark:drop-shadow-[0_24px_32px_rgba(0,0,0,0.78)]"
          />
        </div>
      </div>

      <figcaption className="absolute bottom-1.5 start-0 md:bottom-2 md:start-1 z-50 m-0 w-fit max-w-[calc(100%-82px)] md:max-w-[calc(100%-96px)] rounded-full border border-border/75 bg-card/85 px-3 py-1 text-[10.5px] md:text-[11.5px] font-medium leading-snug text-muted-foreground backdrop-blur-md">
        {caption}
      </figcaption>
    </figure>
  );
}
