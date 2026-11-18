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
      className="hero-stage relative m-0 h-[182px] md:h-auto md:min-h-[380px] min-w-0 overflow-hidden select-none ring-1 ring-inset ring-white/10"
    >
      {/* Subtle architectural padel court line geometry */}
      <svg
        aria-hidden="true"
        viewBox="0 0 600 420"
        preserveAspectRatio="none"
        className="pointer-events-none absolute inset-0 h-full w-full opacity-[0.14]"
      >
        <line
          x1="0"
          y1="304"
          x2="600"
          y2="246"
          stroke="#ffffff"
          strokeWidth="1.5"
        />
        <line
          x1="120"
          y1="0"
          x2="248"
          y2="420"
          stroke="#ffffff"
          strokeWidth="1.25"
        />
        <line
          x1="468"
          y1="0"
          x2="552"
          y2="420"
          stroke="#ffffff"
          strokeWidth="1.25"
          strokeDasharray="6 6"
        />
      </svg>

      {/* Layer 1: Distant upper ball (far depth) */}
      <div
        aria-hidden="true"
        style={depth(-6, -4)}
        className="hero-layer pointer-events-none absolute top-[14%] start-[8%] z-10 md:top-[11%] md:start-[9%]"
      >
        <div className="hero-float-far">
          <Image
            src="/images/hero/padel-ball-1.webp"
            alt=""
            width={280}
            height={280}
            sizes="(max-width: 767px) 38px, 64px"
            draggable={false}
            className="h-auto w-[34px] md:w-[50px] lg:w-[58px] opacity-85 blur-[0.45px] drop-shadow-[0_10px_14px_rgba(5,10,24,0.45)]"
          />
        </div>
      </div>

      {/* Layer 2: Floating 3D Padel Racket (focal hero LCP image) */}
      <div
        style={depth(12, 9)}
        className="hero-layer pointer-events-none absolute inset-0 z-20 flex items-center justify-center"
      >
        <div className="-translate-x-2 -translate-y-2 rtl:translate-x-2 md:-translate-x-3 md:-translate-y-4 md:rtl:translate-x-3">
          <div className="hero-float-racket">
            <Image
              src="/images/hero/padel-racket.webp"
              alt={alt}
              width={413}
              height={740}
              preload={true}
              sizes="(max-width: 767px) 140px, (max-width: 1024px) 200px, 230px"
              draggable={false}
              className="h-[154px] md:h-[288px] lg:h-[314px] w-auto object-contain rtl:-scale-x-100 drop-shadow-[0_24px_28px_rgba(5,10,24,0.62)]"
            />
          </div>
        </div>
      </div>

      {/* Layer 3: Mid-air ball off the sweet spot */}
      <div
        aria-hidden="true"
        style={depth(21, 15)}
        className="hero-layer pointer-events-none absolute top-[11%] end-[14%] z-30 md:top-[13%] md:end-[11%]"
      >
        <div className="hero-float-mid">
          <Image
            src="/images/hero/padel-ball-1.webp"
            alt=""
            width={280}
            height={280}
            sizes="(max-width: 767px) 46px, 80px"
            draggable={false}
            className="h-auto w-[42px] md:w-[62px] lg:w-[74px] drop-shadow-[0_18px_22px_rgba(5,10,24,0.55)]"
          />
        </div>
      </div>

      {/* Layer 4: Foreground close-to-camera ball (strongest depth & parallax) */}
      <div
        aria-hidden="true"
        style={depth(34, 24)}
        className="hero-layer pointer-events-none absolute -bottom-[14px] end-[4%] z-40 md:-bottom-[18px] md:end-[4%] lg:-bottom-[20px] lg:end-[5%]"
      >
        <div className="hero-float-near">
          <Image
            src="/images/hero/padel-ball-2.webp"
            alt=""
            width={320}
            height={320}
            sizes="(max-width: 767px) 84px, 144px"
            draggable={false}
            className="h-auto w-[76px] md:w-[104px] lg:w-[134px] md:blur-[0.6px] drop-shadow-[0_26px_32px_rgba(4,8,20,0.72)]"
          />
        </div>
      </div>

      <figcaption className="absolute bottom-3 start-3 md:bottom-4 md:start-4 lg:bottom-5 lg:start-5 z-50 m-0 w-fit max-w-[calc(100%-104px)] md:max-w-[calc(100%-132px)] lg:max-w-[calc(100%-168px)] rounded-[10px] bg-white/95 px-2.5 py-1.5 md:px-3.5 md:py-2 text-[11px] md:text-[13px] font-semibold leading-snug text-[#17243e]">
        {caption}
      </figcaption>
    </figure>
  );
}
