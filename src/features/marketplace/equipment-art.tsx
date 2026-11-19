import Image from 'next/image';
import type { DemoListing } from './demo-data';

interface EquipmentArtProps {
  listing: DemoListing;
  label: string;
  hero?: boolean;
  sizes?: string;
  imageClassName?: string;
}

/**
 * Generated, unbranded illustrations; never evidence of a demo item's appearance.
 */
export function EquipmentArt({
  listing,
  label,
  hero = false,
  sizes = '(max-width: 359px) 92vw, (max-width: 767px) 46vw, (max-width: 1240px) 31vw, 384px',
  imageClassName,
}: EquipmentArtProps) {
  const source =
    listing.category === 'balls'
      ? 'balls'
      : listing.color === 'clay'
        ? 'racket-coral'
        : 'racket-court';

  return (
    <div className="equipment-art">
      <Image
        src={`/images/demo/${source}.webp`}
        alt={label}
        fill
        sizes={sizes}
        preload={hero}
        decoding={hero ? 'sync' : 'async'}
        className={imageClassName}
      />
    </div>
  );
}
