import Image from 'next/image';

interface BrandProps {
  compact?: boolean;
}

export function Brand({ compact = false }: BrandProps) {
  return (
    <span
      dir="ltr"
      className={`inline-flex items-center font-display font-extrabold tracking-[-0.04em] leading-none text-ink ${
        compact ? 'gap-2 text-[21px]' : 'gap-2.5 text-[23px] sm:text-[26px]'
      }`}
    >
      <Image
        src="/brand/padelhub-mark.svg"
        alt=""
        width={compact ? 30 : 36}
        height={compact ? 30 : 36}
        className={
          compact ? 'h-[30px] w-[30px] shrink-0' : 'h-[32px] w-[32px] sm:h-[36px] sm:w-[36px] shrink-0'
        }
      />
      <span>
        padel<span className="text-accent">hub</span>
        <span className="text-[#e96640]">.</span>
      </span>
    </span>
  );
}
