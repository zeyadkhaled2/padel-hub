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
    const node = stageRef.current;
    if (!node || typeof IntersectionObserver === 'undefined') return;

    const observer = new IntersectionObserver(
      (entries) => {
        const entry = entries[0];
        if (!entry) return;
        if (entry.isIntersecting) {
          delete node.dataset.paused;
        } else {
          node.dataset.paused = 'true';
        }
      },
      { threshold: 0.05 },
    );

    observer.observe(node);

    return () => {
      observer.disconnect();
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
      className="hero-stage relative m-0 h-[132px] md:h-auto md:min-h-[168px] lg:min-h-[178px] min-w-0 overflow-visible select-none"
    >
      {/* Ambient volumetric emerald/volt halo shifting gently in reverse depth */}
      <div
        aria-hidden="true"
        style={depth(-12, -8)}
        className="hero-layer hero-aura pointer-events-none absolute -inset-4 z-0 rounded-full"
      />

      {/* Directional studio keylight shifting opposite cursor tilt */}
      <div
        aria-hidden="true"
        style={depth(-20, -14)}
        className="hero-layer hero-keylight pointer-events-none absolute -inset-2 z-0 rounded-full"
      />

      {/* Synchronized breathing floor shadow tracking beneath the carbon racket */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute bottom-1 start-1/2 z-10 -translate-x-1/2 rtl:translate-x-1/2 md:bottom-0"
      >
        <div style={depth(-7, -3)} className="hero-layer">
          <div className="hero-floor-shadow h-5 w-[104px] md:h-6 md:w-[144px] rounded-full" />
        </div>
      </div>

      {/* Subtle floor shadow beneath the close-to-camera foreground ball */}
      <div
        aria-hidden="true"
        style={depth(14, 6)}
        className="hero-layer pointer-events-none absolute -bottom-1 end-[6%] z-10 hidden md:block lg:end-[7%]"
      >
        <div className="hero-ball-shadow h-3.5 w-[48px] rounded-full" />
      </div>

      {/* True 3D perspective camera rig holding all 4 studio-lit depth planes */}
      <div className="hero-rig pointer-events-none absolute inset-0 z-20">
        {/* Layer 1: Distant upper fuzzy padel ball (far depth) */}
        <div
          aria-hidden="true"
          style={depth(-10, -6)}
          className="hero-layer absolute top-[6%] start-[7%] z-10 md:top-[7%] md:start-[5%]"
        >
          <div className="hero-float-far">
            <Image
              src="/images/hero/padel-ball-far.webp"
              alt=""
              width={160}
              height={160}
              decoding="async"
              sizes="(max-width: 767px) 28px, 38px"
              draggable={false}
              className="h-auto w-[28px] md:w-[34px] lg:w-[38px] opacity-90 drop-shadow-[0_12px_18px_rgba(0,0,0,0.65)]"
            />
          </div>
        </div>

        {/* Layer 2: Floating flagship aluminized 18K Padel Racket (focal LCP image) */}
        <div
          style={depth(15, 10)}
          className="hero-layer absolute inset-0 z-20 flex items-center justify-center"
        >
          <div className="translate-x-5 -translate-y-1.5 rtl:-translate-x-5 md:-translate-x-2 md:-translate-y-1 md:rtl:translate-x-2">
            <div className="hero-float-racket">
              <Image
                src="/images/hero/padel-racket-flagship.webp"
                alt={alt}
                width={290}
                height={500}
                preload={true}
                sizes="(max-width: 767px) 80px, (max-width: 1024px) 108px, 118px"
                draggable={false}
                className="h-[120px] md:h-[164px] lg:h-[176px] w-auto object-contain rtl:-scale-x-100 drop-shadow-[0_24px_32px_rgba(0,0,0,0.8)]"
              />
            </div>
          </div>
        </div>

        {/* Layer 3: Mid-air volley padel ball off the sweet spot */}
        <div
          aria-hidden="true"
          style={depth(26, 18)}
          className="hero-layer absolute top-[4%] end-[11%] z-30 md:top-[5%] md:end-[9%]"
        >
          <div className="hero-float-mid">
            <Image
              src="/images/hero/padel-ball-mid.webp"
              alt=""
              width={200}
              height={200}
              decoding="async"
              sizes="(max-width: 767px) 36px, 50px"
              draggable={false}
              className="h-auto w-[34px] md:w-[44px] lg:w-[50px] drop-shadow-[0_16px_22px_rgba(0,0,0,0.72)]"
            />
          </div>
        </div>

        {/* Layer 4: Foreground close-to-camera macro felt ball (strongest 3D parallax) */}
        <div
          aria-hidden="true"
          style={depth(42, 28)}
          className="hero-layer absolute -bottom-1 end-[2%] z-40 md:-bottom-2 md:end-[1%] lg:-bottom-2.5 lg:end-[2%]"
        >
          <div className="hero-float-near">
            <Image
              src="/images/hero/padel-ball-near.webp"
              alt=""
              width={280}
              height={280}
              decoding="async"
              sizes="(max-width: 767px) 54px, 80px"
              draggable={false}
              className="h-auto w-[50px] md:w-[70px] lg:w-[80px] drop-shadow-[0_22px_30px_rgba(0,0,0,0.84)]"
            />
          </div>
        </div>
      </div>

      <figcaption className="absolute bottom-1 start-0 md:bottom-1.5 md:start-1 z-50 m-0 w-fit max-w-[calc(100%-78px)] md:max-w-[calc(100%-96px)] rounded-[6px] border border-white/15 bg-black/55 px-2.5 py-1 text-[10.5px] md:text-[11px] font-medium leading-snug text-zinc-200 backdrop-blur-md">
        {caption}
      </figcaption>
    </figure>
  );
}

