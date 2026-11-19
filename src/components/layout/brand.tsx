import Image from 'next/image';
import { cn } from '@/lib/utils';

interface BrandProps {
  compact?: boolean;
}

export function Brand({ compact = false }: BrandProps) {
  return (
    <span
      dir="ltr"
      className={cn(
        'inline-flex items-center font-display font-extrabold tracking-[-0.04em] leading-none text-foreground',
        compact ? 'gap-2 text-[20px]' : 'gap-2.5 text-[22px] sm:text-[25px]',
      )}
    >
      <Image
        src="/brand/padelhub-mark.svg"
        alt=""
        width={compact ? 28 : 34}
        height={compact ? 28 : 34}
        className={
          compact
            ? 'h-[28px] w-[28px] shrink-0'
            : 'h-[30px] w-[30px] sm:h-[34px] sm:w-[34px] shrink-0'
        }
      />
      <span>
        padel<span className="text-brand">hub</span>
        <span className="text-coral">.</span>
      </span>
    </span>
  );
}
